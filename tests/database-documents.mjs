import test from "node:test";
import assert from "node:assert/strict";
import {
  createDatabaseFixture,
  applyArgs,
  rejected,
} from "./support/database-fixture.mjs";
// A client case Alex has claimed: the stage documents may be requested in.
async function preparingCase(f) {
  const caseId = await f.readyCase();
  await f.act(f.presenter, caseId, f.alex, "CLAIM_PREPARATION", {});
  return caseId;
}
// The same case with one open request from its assigned preparer.
async function requestedCase(f) {
  const caseId = await preparingCase(f);
  await f.act(f.presenter, caseId, f.alex, "REQUEST_DOCUMENT", f.sampleRequest);
  return caseId;
}

test("document requests, receipts and verification keep the preparer in charge", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await t.test(
      "the assigned preparer requests, the client responds, the preparer verifies",
      async () => {
        const caseId = await preparingCase(f);
        const claimed = await f.readStaffCase(caseId);
        const requested = await f.act(
          f.presenter,
          caseId,
          f.alex,
          "REQUEST_DOCUMENT",
          f.sampleRequest,
        );
        assert.equal(requested.revision, claimed.revision + 1);
        let staff = await f.readStaffCase(caseId);
        // The case keeps its stage while it waits for the client.
        assert.equal(staff.stage, "preparing");
        assert.equal(staff.preparerId, f.alex);
        assert.equal(staff.requests.length, 1);
        assert.equal(staff.requests[0].title, f.sampleRequest.title);
        assert.equal(staff.requests[0].message, f.sampleRequest.message);
        assert.equal(staff.requests[0].status, "open");
        assert.equal(staff.requests[0].requestedByPersonId, f.alex);
        assert.deepEqual(staff.documents, []);
        assert.deepEqual(staff.followups, []);
        assert.deepEqual(
          staff.internalHistory.at(-1).detail,
          { requestId: staff.requests[0].id },
          "internal detail names the request only",
        );
        // The client sees the request and a plain-language note about it.
        const clientRequests = await f.applicantA
          .from("document_requests")
          .select("*")
          .eq("case_id", caseId);
        assert.equal(clientRequests.data.length, 1);
        assert.ok(staff.history.at(-1).message.includes(f.sampleRequest.title));
        const responded = await f.act(
          f.applicantA,
          caseId,
          null,
          "RESPOND_DOCUMENT",
          { filename: f.sampleFilename },
        );
        assert.equal(responded.revision, requested.revision + 1);
        staff = await f.readStaffCase(caseId);
        assert.equal(staff.stage, "preparing");
        assert.equal(staff.requests[0].status, "awaiting_verification");
        assert.equal(staff.documents.length, 1);
        assert.equal(staff.documents[0].requestId, staff.requests[0].id);
        assert.equal(staff.documents[0].filename, f.sampleFilename);
        assert.equal(staff.documents[0].source, "client");
        assert.equal(staff.documents[0].submittedByUserId, f.applicantAUserId);
        assert.equal(staff.documents[0].submittedByPersonId, null);
        // A client response never grants staff participation.
        assert.deepEqual(staff.participants, [f.alex]);
        assert.deepEqual(staff.internalHistory.at(-1).detail, {
          requestId: staff.requests[0].id,
          documentId: staff.documents[0].id,
          source: "client",
        });
        assert.equal(staff.internalHistory.at(-1).actorPersonId, null);
        await f.act(f.presenter, caseId, f.alex, "VERIFY_DOCUMENT", {});
        staff = await f.readStaffCase(caseId);
        assert.equal(staff.requests[0].status, "verified");
        assert.equal(staff.documents.length, 1);
        assert.equal(staff.stage, "preparing");
        assert.equal(staff.preparerId, f.alex);
        assert.deepEqual(staff.participants, [f.alex]);
        assert.deepEqual(
          staff.internalHistory.map((entry) => entry.action),
          [
            "SUBMIT",
            "VERIFY_INTAKE",
            "CLAIM_PREPARATION",
            "REQUEST_DOCUMENT",
            "RESPOND_DOCUMENT",
            "VERIFY_DOCUMENT",
          ],
        );
        assert.deepEqual(
          staff.history.map((entry) => entry.action),
          [
            "SUBMIT",
            "VERIFY_INTAKE",
            "CLAIM_PREPARATION",
            "REQUEST_DOCUMENT",
            "RESPOND_DOCUMENT",
            "VERIFY_DOCUMENT",
          ],
        );
        for (const entry of staff.history) {
          assert.ok(entry.message.length > 0);
          assert.equal(entry.detail, undefined);
          assert.equal(entry.actorPersonId, undefined);
        }
      },
    );
    await t.test(
      "only the current participating preparer may request or verify",
      async () => {
        // The stage answers before the qualification: nobody requests a
        // document on a case no preparer has claimed.
        const unclaimed = await f.readyCase();
        for (const personId of [f.alex, f.sam])
          await assert.rejects(
            () =>
              f.act(
                f.presenter,
                unclaimed,
                personId,
                "REQUEST_DOCUMENT",
                f.sampleRequest,
              ),
            rejected("INVALID_TRANSITION"),
          );
        const caseId = await preparingCase(f);
        // Step 4: a document request is never a client action.
        for (const [client, personId] of [
          [f.presenter, null],
          [f.applicantA, null],
          [f.presenter, f.foreignPeople.alex],
        ])
          await assert.rejects(
            () =>
              f.act(
                client,
                caseId,
                personId,
                "REQUEST_DOCUMENT",
                f.sampleRequest,
              ),
            rejected("FORBIDDEN"),
          );
        // Step 7: an admin title and a reviewer qualification are not `prepare`.
        for (const personId of [f.sam, f.morgan])
          await assert.rejects(
            () =>
              f.act(
                f.presenter,
                caseId,
                personId,
                "REQUEST_DOCUMENT",
                f.sampleRequest,
              ),
            rejected("INELIGIBLE"),
          );
        // A qualified person who is not this case's preparer is forbidden, even
        // with the capability: assignment and participation are both required.
        await f.sql("update public.people set capabilities=$1 where id=$2", [
          ["prepare", "review"],
          f.morgan,
        ]);
        try {
          await assert.rejects(
            () =>
              f.act(
                f.presenter,
                caseId,
                f.morgan,
                "REQUEST_DOCUMENT",
                f.sampleRequest,
              ),
            rejected("FORBIDDEN"),
          );
        } finally {
          await f.sql("update public.people set capabilities=$1 where id=$2", [
            ["review"],
            f.morgan,
          ]);
        }
        assert.deepEqual((await f.readStaffCase(caseId)).requests, []);
        // Positive control: the assigned preparer may.
        await f.act(
          f.presenter,
          caseId,
          f.alex,
          "REQUEST_DOCUMENT",
          f.sampleRequest,
        );
        // Verification before any receipt is a transition error, not a success.
        await assert.rejects(
          () => f.act(f.presenter, caseId, f.alex, "VERIFY_DOCUMENT", {}),
          rejected("INVALID_TRANSITION"),
        );
        // Qualification answers before readiness: an unqualified person on the
        // same unanswered request is INELIGIBLE, never told the request state.
        await assert.rejects(
          () => f.act(f.presenter, caseId, f.sam, "VERIFY_DOCUMENT", {}),
          rejected("INELIGIBLE"),
        );
        await f.act(f.applicantA, caseId, null, "RESPOND_DOCUMENT", {
          filename: f.sampleFilename,
        });
        for (const personId of [f.sam, f.morgan])
          await assert.rejects(
            () =>
              f.act(f.presenter, caseId, personId, "VERIFY_DOCUMENT", {}),
            rejected("INELIGIBLE"),
          );
        for (const [client, personId] of [
          [f.applicantA, null],
          [f.presenter, null],
        ])
          await assert.rejects(
            () => f.act(client, caseId, personId, "VERIFY_DOCUMENT", {}),
            rejected("FORBIDDEN"),
          );
        assert.equal(
          (await f.readStaffCase(caseId)).requests[0].status,
          "awaiting_verification",
        );
        await f.act(f.presenter, caseId, f.alex, "VERIFY_DOCUMENT", {});
        assert.equal(
          (await f.readStaffCase(caseId)).requests[0].status,
          "verified",
        );
        // A verified request cannot be verified or answered again.
        await assert.rejects(
          () => f.act(f.presenter, caseId, f.alex, "VERIFY_DOCUMENT", {}),
          rejected("INVALID_TRANSITION"),
        );
        await assert.rejects(
          () =>
            f.act(f.applicantA, caseId, null, "RESPOND_DOCUMENT", {
              filename: f.sampleFilename,
            }),
          rejected("INVALID_TRANSITION"),
        );
      },
    );
    await t.test(
      "a client receipt is recorded once and still awaits verification",
      async () => {
        const caseId = await requestedCase(f);
        const before = await f.readStaffCase(caseId);
        const respond = applyArgs({
          caseId,
          revision: before.revision,
          type: "RESPOND_DOCUMENT",
          payload: {
            requestId: before.requests[0].id,
            filename: f.sampleFilename,
          },
        });
        const accepted = await f.applicantA.rpc("vitally_apply_action", respond);
        assert.equal(accepted.error, null);
        // A retried upload adds no second document, event or revision.
        const retry = await f.applicantA.rpc("vitally_apply_action", respond);
        assert.equal(retry.error, null);
        assert.deepEqual(retry.data, accepted.data);
        const staff = await f.readStaffCase(caseId);
        assert.equal(staff.revision, before.revision + 1);
        assert.equal(staff.documents.length, 1);
        assert.equal(staff.requests[0].status, "awaiting_verification");
        assert.equal(
          staff.internalHistory.filter(
            (entry) => entry.action === "RESPOND_DOCUMENT",
          ).length,
          1,
        );
        assert.equal(
          staff.history.filter((entry) => entry.action === "RESPOND_DOCUMENT")
            .length,
          1,
        );
        assert.deepEqual(staff.participants, [f.alex]);
        // A fresh action id against the answered request is rejected.
        const again = await f.applicantA.rpc(
          "vitally_apply_action",
          applyArgs({
            caseId,
            revision: staff.revision,
            type: "RESPOND_DOCUMENT",
            payload: {
              requestId: before.requests[0].id,
              filename: f.sampleFilename,
            },
          }),
        );
        assert.equal(again.error.code, "VT004");
        assert.equal((await f.readStaffCase(caseId)).documents.length, 1);
      },
    );
    await t.test(
      "the staff receipt records its own actor and never verifies",
      async () => {
        const caseId = await f.assistedCase();
        const before = await f.readStaffCase(caseId);
        assert.equal(before.ownerUserId, null);
        const record = applyArgs({
          caseId,
          revision: before.revision,
          personId: f.sam,
          type: "RECORD_DOCUMENT_RESPONSE",
          payload: {
            requestId: before.requests[0].id,
            filename: f.sampleFilename,
          },
        });
        const accepted = await f.presenter.rpc("vitally_apply_action", record);
        assert.equal(accepted.error, null);
        const retry = await f.presenter.rpc("vitally_apply_action", record);
        assert.equal(retry.error, null);
        assert.deepEqual(retry.data, accepted.data);
        let staff = await f.readStaffCase(caseId);
        assert.equal(staff.documents.length, 1);
        assert.equal(staff.documents[0].source, "staff_recorded");
        assert.equal(staff.documents[0].submittedByUserId, f.presenterUserId);
        assert.equal(staff.documents[0].submittedByPersonId, f.sam);
        // Recording receipt is not verification, and grants no participation.
        assert.equal(staff.requests[0].status, "awaiting_verification");
        assert.deepEqual(staff.participants, [f.alex]);
        assert.equal(staff.preparerId, f.alex);
        assert.equal(staff.stage, "preparing");
        assert.deepEqual(staff.internalHistory.at(-1).detail, {
          requestId: staff.requests[0].id,
          documentId: staff.documents[0].id,
          source: "staff_recorded",
        });
        assert.equal(staff.internalHistory.at(-1).actorPersonId, f.sam);
        // The client-facing note is neutral: nobody claims a client uploaded.
        const message = staff.history.at(-1).message;
        assert.equal(staff.history.at(-1).action, "RECORD_DOCUMENT_RESPONSE");
        assert.ok(message.includes("staff"), message);
        // The preparer still has to verify it.
        await f.act(f.presenter, caseId, f.alex, "VERIFY_DOCUMENT", {});
        staff = await f.readStaffCase(caseId);
        assert.equal(staff.requests[0].status, "verified");
        assert.equal(staff.documents.length, 1);
      },
    );
    await t.test(
      "receipts reject the wrong actor, the wrong case and a forged client",
      async () => {
        const owned = await requestedCase(f);
        const ownedStaff = await f.readStaffCase(owned);
        // The staff receipt exists only where there is no client to answer.
        await assert.rejects(
          () =>
            f.act(f.presenter, owned, f.sam, "RECORD_DOCUMENT_RESPONSE", {
              filename: f.sampleFilename,
            }),
          rejected("FORBIDDEN"),
        );
        // A client forging a staff identity on their own case is forbidden.
        const forged = await f.applicantA.rpc(
          "vitally_apply_action",
          applyArgs({
            caseId: owned,
            revision: ownedStaff.revision,
            personId: f.sam,
            type: "RESPOND_DOCUMENT",
            payload: {
              requestId: ownedStaff.requests[0].id,
              filename: f.sampleFilename,
            },
          }),
        );
        assert.equal(forged.error.code, "VT001");
        // Another applicant cannot even tell the case exists.
        const other = await f.applicantB.rpc(
          "vitally_apply_action",
          applyArgs({
            caseId: owned,
            revision: ownedStaff.revision,
            type: "RESPOND_DOCUMENT",
            payload: {
              requestId: ownedStaff.requests[0].id,
              filename: f.sampleFilename,
            },
          }),
        );
        assert.equal(other.error.code, "VT002");
        // A presenter is not the client, with or without a persona.
        for (const personId of [null, f.alex])
          await assert.rejects(
            () =>
              f.act(f.presenter, owned, personId, "RESPOND_DOCUMENT", {
                filename: f.sampleFilename,
              }),
            rejected("FORBIDDEN"),
          );
        const assisted = await f.assistedCase();
        // The receipt capability is Sam's alone, and it needs a person.
        for (const personId of [f.alex, f.morgan, null])
          await assert.rejects(
            () =>
              f.act(
                f.presenter,
                assisted,
                personId,
                "RECORD_DOCUMENT_RESPONSE",
                { filename: f.sampleFilename },
              ),
            rejected("FORBIDDEN"),
          );
        // An assisted case has no client owner to answer for it.
        const assistedStaff = await f.readStaffCase(assisted);
        const client = await f.applicantA.rpc(
          "vitally_apply_action",
          applyArgs({
            caseId: assisted,
            revision: assistedStaff.revision,
            type: "RESPOND_DOCUMENT",
            payload: {
              requestId: assistedStaff.requests[0].id,
              filename: f.sampleFilename,
            },
          }),
        );
        assert.equal(client.error.code, "VT002");
        assert.deepEqual((await f.readStaffCase(assisted)).documents, []);
        // Positive control.
        await f.act(f.presenter, assisted, f.sam, "RECORD_DOCUMENT_RESPONSE", {
          filename: f.sampleFilename,
        });
        assert.equal((await f.readStaffCase(assisted)).documents.length, 1);
        assert.deepEqual((await f.readStaffCase(owned)).documents, []);
      },
    );
    await t.test(
      "document payloads accept one fictional file and one related request",
      async () => {
        const caseId = await preparingCase(f);
        for (const payload of [
          {},
          { title: f.sampleRequest.title },
          { message: f.sampleRequest.message },
          { title: "  ", message: f.sampleRequest.message },
          { title: f.sampleRequest.title, message: "" },
          { title: 42, message: f.sampleRequest.message },
          { title: "x".repeat(121), message: f.sampleRequest.message },
          { title: f.sampleRequest.title, message: "x".repeat(2001) },
          { ...f.sampleRequest, extra: true },
          { ...f.sampleRequest, requestId: crypto.randomUUID() },
        ])
          await assert.rejects(
            () =>
              f.act(f.presenter, caseId, f.alex, "REQUEST_DOCUMENT", payload),
            rejected("VALIDATION"),
          );
        await f.act(
          f.presenter,
          caseId,
          f.alex,
          "REQUEST_DOCUMENT",
          f.sampleRequest,
        );
        const requestId = (await f.readStaffCase(caseId)).requests[0].id;
        // Only the one simulated file the demo describes is accepted.
        for (const payload of [
          { requestId },
          { requestId, filename: "mileage.pdf" },
          { requestId, filename: "" },
          { requestId, filename: 7 },
          { requestId, filename: f.sampleFilename, extra: 1 },
          { requestId: "not-a-uuid", filename: f.sampleFilename },
          { filename: f.sampleFilename },
        ]) {
          const response = await f.applicantA.rpc(
            "vitally_apply_action",
            applyArgs({
              caseId,
              revision: (await f.readStaffCase(caseId)).revision,
              type: "RESPOND_DOCUMENT",
              payload,
            }),
          );
          assert.equal(response.error.code, "VT007", JSON.stringify(payload));
        }
        for (const payload of [
          {},
          { requestId, extra: 1 },
          { requestId: crypto.randomUUID() },
        ]) {
          const response = await f.presenter.rpc(
            "vitally_apply_action",
            applyArgs({
              caseId,
              revision: (await f.readStaffCase(caseId)).revision,
              personId: f.alex,
              type: "VERIFY_DOCUMENT",
              payload,
            }),
          );
          assert.equal(response.error.code, "VT007", JSON.stringify(payload));
        }
        // A request belonging to another case is a validation error, not a
        // silent cross-case write.
        const elsewhere = await requestedCase(f);
        const foreignRequest = (await f.readStaffCase(elsewhere)).requests[0].id;
        await assert.rejects(
          () =>
            f.act(f.applicantA, caseId, null, "RESPOND_DOCUMENT", {
              requestId: foreignRequest,
              filename: f.sampleFilename,
            }),
          rejected("VALIDATION"),
        );
        await assert.rejects(
          () =>
            f.act(f.presenter, caseId, f.alex, "VERIFY_DOCUMENT", {
              requestId: foreignRequest,
            }),
          rejected("VALIDATION"),
        );
        await assert.rejects(
          () =>
            f.act(f.presenter, caseId, f.alex, "ESCALATE_CONTACT", {
              requestId: foreignRequest,
              reason: "Office contact needed",
            }),
          rejected("VALIDATION"),
        );
        assert.deepEqual((await f.readStaffCase(elsewhere)).documents, []);
        // Positive controls for the shapes the payload table does define.
        await f.act(f.applicantA, caseId, null, "RESPOND_DOCUMENT", {
          requestId,
          filename: f.sampleFilename,
        });
        await f.act(f.presenter, caseId, f.alex, "VERIFY_DOCUMENT", {
          requestId,
        });
        assert.equal(
          (await f.readStaffCase(caseId)).requests[0].status,
          "verified",
        );
      },
    );
    await t.test(
      "verification and escalation stay inside the preparation stage window",
      async () => {
        const caseId = await requestedCase(f);
        const requestId = (await f.readStaffCase(caseId)).requests[0].id;
        const reason = "Office contact needed";
        // A claimed case moved out of the window by privileged setup: the
        // stage answers before anything about the request or the actor does.
        await f.sql("update public.cases set stage='review_ready' where id=$1", [
          caseId,
        ]);
        try {
          for (const [client, personId, type, payload] of [
            [f.presenter, f.alex, "VERIFY_DOCUMENT", { requestId }],
            [f.presenter, f.alex, "ESCALATE_CONTACT", { requestId, reason }],
            [f.presenter, f.sam, "VERIFY_DOCUMENT", { requestId }],
            [f.presenter, f.sam, "ESCALATE_CONTACT", { requestId, reason }],
            [f.presenter, f.alex, "REQUEST_DOCUMENT", f.sampleRequest],
            [
              f.applicantA,
              null,
              "RESPOND_DOCUMENT",
              { requestId, filename: f.sampleFilename },
            ],
          ])
            await assert.rejects(
              () => f.act(client, caseId, personId, type, payload),
              rejected("INVALID_TRANSITION"),
              `${type} for ${personId}`,
            );
          const held = await f.readStaffCase(caseId);
          assert.equal(held.stage, "review_ready");
          assert.equal(held.requests.length, 1);
          assert.equal(held.requests[0].status, "open");
          assert.deepEqual(held.documents, []);
          assert.deepEqual(held.followups, []);
        } finally {
          await f.sql("update public.cases set stage='preparing' where id=$1", [
            caseId,
          ]);
        }
        // Positive controls in both stages of the window.
        await f.sql(
          "update public.cases set stage='corrections_required' where id=$1",
          [caseId],
        );
        try {
          await f.act(f.presenter, caseId, f.alex, "ESCALATE_CONTACT", {
            requestId,
            reason,
          });
          await f.act(f.applicantA, caseId, null, "RESPOND_DOCUMENT", {
            requestId,
            filename: f.sampleFilename,
          });
        } finally {
          await f.sql("update public.cases set stage='preparing' where id=$1", [
            caseId,
          ]);
        }
        await f.act(f.presenter, caseId, f.alex, "VERIFY_DOCUMENT", {
          requestId,
        });
        const staff = await f.readStaffCase(caseId);
        assert.equal(staff.stage, "preparing");
        assert.equal(staff.requests[0].status, "verified");
        assert.equal(staff.documents.length, 1);
        assert.equal(staff.followups.length, 1);
      },
    );
  } finally {
    await f.close();
  }
});

test("admin follow-up is assigned, recorded and resolved by its own person", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await t.test(
      "escalation assigns Sam and resolution leaves preparation untouched",
      async () => {
        const id = await f.readyCase();
        await f.act(f.presenter, id, f.alex, "CLAIM_PREPARATION", {});
        await f.act(f.presenter, id, f.alex, "REQUEST_DOCUMENT", {
          title: "Mileage record",
          message: "Please add the fictional sample.",
        });
        await f.act(f.presenter, id, f.alex, "ESCALATE_CONTACT", {
          reason: "Office contact needed",
        });
        let c = await f.readStaffCase(id);
        assert.equal(c.followups[0].assigneeId, f.sam);
        await f.act(f.presenter, id, f.sam, "RECORD_CONTACT", {
          outcome: "reached",
          note: "Client will respond",
        });
        c = await f.readStaffCase(id);
        assert.equal(c.followups[0].status, "open");
        await f.act(f.presenter, id, f.sam, "RESOLVE_FOLLOWUP", {
          outcome: "reached",
          note: "Contact completed",
        });
        c = await f.readStaffCase(id);
        assert.equal(c.preparerId, f.alex);
        assert.equal(c.requests[0].status, "open");
        assert.equal(c.followups[0].status, "resolved");
        // The server chose the assignee, and the preparer raised the task.
        assert.equal(c.followups.length, 1);
        assert.equal(c.followups[0].requestId, c.requests[0].id);
        assert.equal(c.followups[0].createdByPersonId, f.alex);
        assert.equal(c.followups[0].reason, "Office contact needed");
        assert.equal(c.followups[0].resolutionOutcome, "reached");
        assert.equal(c.followups[0].resolutionNote, "Contact completed");
        assert.ok(c.followups[0].resolvedAt);
        // A reached attempt is history, not a resolution of its own.
        assert.equal(c.followups[0].attempts.length, 1);
        assert.deepEqual(
          {
            outcome: c.followups[0].attempts[0].outcome,
            note: c.followups[0].attempts[0].note,
            actorPersonId: c.followups[0].attempts[0].actorPersonId,
          },
          {
            outcome: "reached",
            note: "Client will respond",
            actorPersonId: f.sam,
          },
        );
        assert.equal(c.stage, "preparing");
        assert.deepEqual(c.participants, [f.alex]);
        assert.deepEqual(c.documents, []);
        assert.deepEqual(
          c.internalHistory.map((entry) => entry.action),
          [
            "SUBMIT",
            "VERIFY_INTAKE",
            "CLAIM_PREPARATION",
            "REQUEST_DOCUMENT",
            "ESCALATE_CONTACT",
            "RECORD_CONTACT",
            "RESOLVE_FOLLOWUP",
          ],
        );
        // Contact work stays internal: the client sees none of it.
        assert.deepEqual(
          c.history.map((entry) => entry.action),
          ["SUBMIT", "VERIFY_INTAKE", "CLAIM_PREPARATION", "REQUEST_DOCUMENT"],
        );
        assert.deepEqual(
          c.internalHistory.find((entry) => entry.action === "ESCALATE_CONTACT")
            .detail,
          {
            requestId: c.requests[0].id,
            followupId: c.followups[0].id,
            assigneePersonId: f.sam,
          },
        );
      },
    );
    await t.test(
      "a client response while the task is open resolves neither for the other",
      async () => {
        const caseId = await requestedCase(f);
        await f.act(f.presenter, caseId, f.alex, "ESCALATE_CONTACT", {
          reason: "Office contact needed",
        });
        await f.act(f.presenter, caseId, f.sam, "RECORD_CONTACT", {
          outcome: "no_answer",
          note: "Left a message",
        });
        await f.act(f.applicantA, caseId, null, "RESPOND_DOCUMENT", {
          filename: f.sampleFilename,
        });
        let staff = await f.readStaffCase(caseId);
        // Both histories survive: the receipt does not close the contact task.
        assert.equal(staff.requests[0].status, "awaiting_verification");
        assert.equal(staff.documents.length, 1);
        assert.equal(staff.followups[0].status, "open");
        assert.equal(staff.followups[0].attempts.length, 1);
        assert.equal(staff.preparerId, f.alex);
        assert.deepEqual(staff.participants, [f.alex]);
        await f.act(f.presenter, caseId, f.sam, "RESOLVE_FOLLOWUP", {
          outcome: "no_further_contact",
          note: "Client responded already",
        });
        staff = await f.readStaffCase(caseId);
        // Resolving the task verifies nothing and reassigns nobody.
        assert.equal(staff.followups[0].status, "resolved");
        assert.equal(staff.followups[0].resolutionOutcome, "no_further_contact");
        assert.equal(staff.requests[0].status, "awaiting_verification");
        assert.equal(staff.preparerId, f.alex);
        assert.deepEqual(staff.participants, [f.alex]);
        assert.equal(staff.stage, "preparing");
        // The preparer still verifies afterwards.
        await f.act(f.presenter, caseId, f.alex, "VERIFY_DOCUMENT", {
          requestId: staff.requests[0].id,
        });
        assert.equal(
          (await f.readStaffCase(caseId)).requests[0].status,
          "verified",
        );
      },
    );
    await t.test(
      "one task per unresolved request, with no browser-supplied assignee",
      async () => {
        const caseId = await requestedCase(f);
        const requestId = (await f.readStaffCase(caseId)).requests[0].id;
        await f.act(f.presenter, caseId, f.alex, "ESCALATE_CONTACT", {
          reason: "Office contact needed",
        });
        // Repeated clicks create no duplicate task.
        await assert.rejects(
          () =>
            f.act(f.presenter, caseId, f.alex, "ESCALATE_CONTACT", {
              requestId,
              reason: "Office contact needed",
            }),
          rejected("INVALID_TRANSITION"),
        );
        assert.equal((await f.readStaffCase(caseId)).followups.length, 1);
        // Qualification answers before readiness: an unqualified person is
        // INELIGIBLE here, never told that a task already exists.
        await assert.rejects(
          () =>
            f.act(f.presenter, caseId, f.sam, "ESCALATE_CONTACT", {
              requestId,
              reason: "Office contact needed",
            }),
          rejected("INELIGIBLE"),
        );
        // A second case proves the rejections leave no task behind.
        const fresh = await requestedCase(f);
        const freshRequest = (await f.readStaffCase(fresh)).requests[0].id;
        for (const payload of [
          {},
          { requestId: freshRequest },
          { reason: "Office contact needed" },
          { requestId: freshRequest, reason: "   " },
          { requestId: freshRequest, reason: "x".repeat(1001) },
          { requestId: freshRequest, reason: "Needed", assignee: f.morgan },
          {
            requestId: freshRequest,
            reason: "Needed",
            assigneePersonId: f.morgan,
          },
        ]) {
          const response = await f.presenter.rpc(
            "vitally_apply_action",
            applyArgs({
              caseId: fresh,
              revision: (await f.readStaffCase(fresh)).revision,
              personId: f.alex,
              type: "ESCALATE_CONTACT",
              payload,
            }),
          );
          assert.equal(response.error.code, "VT007", JSON.stringify(payload));
        }
        assert.deepEqual((await f.readStaffCase(fresh)).followups, []);
        // An answered request is no longer escalatable.
        await f.act(f.applicantA, fresh, null, "RESPOND_DOCUMENT", {
          filename: f.sampleFilename,
        });
        await assert.rejects(
          () =>
            f.act(f.presenter, fresh, f.alex, "ESCALATE_CONTACT", {
              requestId: freshRequest,
              reason: "Office contact needed",
            }),
          rejected("INVALID_TRANSITION"),
        );
        // ...while an unqualified person on that answered request is still
        // INELIGIBLE, not told the request has been answered.
        await assert.rejects(
          () =>
            f.act(f.presenter, fresh, f.sam, "ESCALATE_CONTACT", {
              requestId: freshRequest,
              reason: "Office contact needed",
            }),
          rejected("INELIGIBLE"),
        );
        assert.deepEqual((await f.readStaffCase(fresh)).followups, []);
        // Only the assigned preparer escalates.
        const third = await requestedCase(f);
        for (const personId of [f.sam, f.morgan])
          await assert.rejects(
            () =>
              f.act(f.presenter, third, personId, "ESCALATE_CONTACT", {
                reason: "Office contact needed",
              }),
            rejected("INELIGIBLE"),
          );
        await assert.rejects(
          () =>
            f.act(f.applicantA, third, null, "ESCALATE_CONTACT", {
              reason: "Office contact needed",
            }),
          rejected("FORBIDDEN"),
        );
        assert.deepEqual((await f.readStaffCase(third)).followups, []);
      },
    );
    await t.test(
      "a missing or unqualified default follow-up person creates no task",
      async () => {
        const caseId = await requestedCase(f);
        await f.sql(
          "update public.workspaces set default_followup_person_id=null where id=$1",
          [f.workspaceId],
        );
        try {
          await assert.rejects(
            () =>
              f.act(f.presenter, caseId, f.alex, "ESCALATE_CONTACT", {
                reason: "Office contact needed",
              }),
            rejected("VALIDATION"),
          );
        } finally {
          await f.sql(
            "update public.workspaces set default_followup_person_id=$2 where id=$1",
            [f.workspaceId, f.sam],
          );
        }
        assert.deepEqual((await f.readStaffCase(caseId)).followups, []);
        // A configured person without the capability is the same setup error.
        await f.sql("update public.people set capabilities=$1 where id=$2", [
          ["admin", "assist", "receive_documents"],
          f.sam,
        ]);
        try {
          await assert.rejects(
            () =>
              f.act(f.presenter, caseId, f.alex, "ESCALATE_CONTACT", {
                reason: "Office contact needed",
              }),
            rejected("VALIDATION"),
          );
        } finally {
          await f.sql("update public.people set capabilities=$1 where id=$2", [
            ["admin", "assist", "followup", "receive_documents"],
            f.sam,
          ]);
        }
        assert.deepEqual((await f.readStaffCase(caseId)).followups, []);
        // Positive control with the workspace restored.
        await f.act(f.presenter, caseId, f.alex, "ESCALATE_CONTACT", {
          reason: "Office contact needed",
        });
        const staff = await f.readStaffCase(caseId);
        assert.equal(staff.followups.length, 1);
        assert.equal(staff.followups[0].assigneeId, f.sam);
      },
    );
    await t.test(
      "contact and resolution need the assigned person and a listed outcome",
      async () => {
        const caseId = await requestedCase(f);
        await f.act(f.presenter, caseId, f.alex, "ESCALATE_CONTACT", {
          reason: "Office contact needed",
        });
        const followupId = (await f.readStaffCase(caseId)).followups[0].id;
        // Step 4: the follow-up capability, and never a client action.
        for (const [client, personId] of [
          [f.presenter, f.alex],
          [f.presenter, f.morgan],
          [f.presenter, null],
          [f.applicantA, null],
        ])
          for (const type of ["RECORD_CONTACT", "RESOLVE_FOLLOWUP"])
            await assert.rejects(
              () =>
                f.act(client, caseId, personId, type, {
                  followupId,
                  outcome: "reached",
                  note: "Spoke with the client",
                }),
              rejected("FORBIDDEN"),
              `${type} for ${personId}`,
            );
        // Step 7: the capability alone is not the assignment.
        await f.sql("update public.people set capabilities=$1 where id=$2", [
          ["followup", "review"],
          f.morgan,
        ]);
        try {
          await assert.rejects(
            () =>
              f.act(f.presenter, caseId, f.morgan, "RECORD_CONTACT", {
                outcome: "reached",
                note: "Spoke with the client",
              }),
            rejected("FORBIDDEN"),
          );
          await assert.rejects(
            () =>
              f.act(f.presenter, caseId, f.morgan, "RESOLVE_FOLLOWUP", {
                outcome: "reached",
                note: "Spoke with the client",
              }),
            rejected("FORBIDDEN"),
          );
        } finally {
          await f.sql("update public.people set capabilities=$1 where id=$2", [
            ["review"],
            f.morgan,
          ]);
        }
        assert.deepEqual(
          (await f.readStaffCase(caseId)).followups[0].attempts,
          [],
        );
        for (const payload of [
          { followupId },
          { followupId, outcome: "reached" },
          { followupId, outcome: "reached", note: "  " },
          { followupId, outcome: "shouted", note: "Tried" },
          { followupId, outcome: "reached", note: "Tried", extra: 1 },
          { followupId, outcome: "reached", note: "x".repeat(1001) },
          { followupId: crypto.randomUUID(), outcome: "reached", note: "Tried" },
        ])
          await assert.rejects(
            () =>
              f.act(f.presenter, caseId, f.sam, "RECORD_CONTACT", payload),
            rejected("VALIDATION"),
            JSON.stringify(payload),
          );
        // Every listed contact outcome is recordable, and none resolves.
        for (const outcome of [
          "no_answer",
          "reached",
          "no_further_contact",
          "closure_requested",
        ])
          await f.act(f.presenter, caseId, f.sam, "RECORD_CONTACT", {
            outcome,
            note: `Recorded ${outcome}`,
          });
        let staff = await f.readStaffCase(caseId);
        assert.equal(staff.followups[0].status, "open");
        assert.deepEqual(
          staff.followups[0].attempts.map((attempt) => attempt.outcome),
          ["no_answer", "reached", "no_further_contact", "closure_requested"],
        );
        assert.equal(staff.requests[0].status, "open");
        // Resolution accepts only the two conclusive outcomes.
        for (const outcome of ["no_answer", "closure_requested", "resolved"])
          await assert.rejects(
            () =>
              f.act(f.presenter, caseId, f.sam, "RESOLVE_FOLLOWUP", {
                followupId,
                outcome,
                note: "Finished",
              }),
            rejected("VALIDATION"),
            outcome,
          );
        assert.equal(
          (await f.readStaffCase(caseId)).followups[0].status,
          "open",
        );
        await f.act(f.presenter, caseId, f.sam, "RESOLVE_FOLLOWUP", {
          outcome: "no_further_contact",
          note: "No further contact needed",
        });
        staff = await f.readStaffCase(caseId);
        assert.equal(staff.followups[0].status, "resolved");
        assert.equal(staff.requests[0].status, "open");
        // A resolved task takes no further attempts or resolutions.
        for (const type of ["RECORD_CONTACT", "RESOLVE_FOLLOWUP"])
          await assert.rejects(
            () =>
              f.act(f.presenter, caseId, f.sam, type, {
                followupId,
                outcome: "reached",
                note: "Once more",
              }),
            rejected("INVALID_TRANSITION"),
            type,
          );
        // Assignment answers before readiness: a capable non-assignee is
        // FORBIDDEN on the resolved task, never told that it is closed.
        await f.sql("update public.people set capabilities=$1 where id=$2", [
          ["followup", "review"],
          f.morgan,
        ]);
        try {
          for (const type of ["RECORD_CONTACT", "RESOLVE_FOLLOWUP"])
            await assert.rejects(
              () =>
                f.act(f.presenter, caseId, f.morgan, type, {
                  followupId,
                  outcome: "reached",
                  note: "Once more",
                }),
              rejected("FORBIDDEN"),
              type,
            );
        } finally {
          await f.sql("update public.people set capabilities=$1 where id=$2", [
            ["review"],
            f.morgan,
          ]);
        }
        assert.equal(
          (await f.readStaffCase(caseId)).followups[0].attempts.length,
          4,
        );
      },
    );
    await t.test(
      "rejected document and follow-up actions commit no receipt or record",
      async () => {
        const caseId = await requestedCase(f);
        await f.act(f.presenter, caseId, f.alex, "ESCALATE_CONTACT", {
          reason: "Office contact needed",
        });
        const staff = await f.readStaffCase(caseId);
        const requestId = staff.requests[0].id;
        const followupId = staff.followups[0].id;
        const revision = staff.revision;
        const before = await f.stateSnapshot();
        const attempts = [
          [
            f.presenter,
            {
              caseId,
              revision,
              personId: f.morgan,
              type: "RECORD_CONTACT",
              payload: { followupId, outcome: "reached", note: "Spoke" },
            },
            "VT001",
          ],
          [
            f.applicantB,
            {
              caseId,
              revision,
              type: "RESPOND_DOCUMENT",
              payload: { requestId, filename: f.sampleFilename },
            },
            "VT002",
          ],
          [
            f.presenter,
            {
              caseId,
              revision: revision - 1,
              personId: f.alex,
              type: "VERIFY_DOCUMENT",
              payload: { requestId },
            },
            "VT003",
          ],
          [
            f.presenter,
            {
              caseId,
              revision,
              personId: f.alex,
              type: "VERIFY_DOCUMENT",
              payload: { requestId },
            },
            "VT004",
          ],
          [
            f.presenter,
            {
              caseId,
              revision,
              personId: f.sam,
              type: "REQUEST_DOCUMENT",
              payload: { ...f.sampleRequest },
            },
            "VT006",
          ],
          [
            f.presenter,
            {
              caseId,
              revision,
              personId: f.alex,
              type: "ESCALATE_CONTACT",
              payload: {
                requestId,
                reason: "Office contact needed",
                assignee: f.morgan,
              },
            },
            "VT007",
          ],
        ];
        for (const [client, spec, code] of attempts) {
          const actionId = crypto.randomUUID();
          const { error } = await client.rpc(
            "vitally_apply_action",
            applyArgs({ ...spec, actionId }),
          );
          assert.equal(error?.code, code, spec.type);
          assert.equal(await f.receiptsFor(actionId), 0);
        }
        assert.deepEqual(await f.stateSnapshot(), before);
      },
    );
  } finally {
    await f.close();
  }
});
