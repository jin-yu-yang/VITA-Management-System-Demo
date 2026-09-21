import test from "node:test";
import assert from "node:assert/strict";
import {
  createDatabaseFixture,
  applyArgs,
  rejected,
} from "./support/database-fixture.mjs";
import { initializeWorkspace } from "../tools/admin/workspace-setup.mjs";
const FINDINGS = "Recheck the fictional mileage entry.";
const RESOLUTION = "Corrected and rechecked in external software.";
const CONTACT_NOTE = "Told the client the fictional return is ready to discuss.";
const ESCALATION_REASON = "No response to the document request.";
const CLOSURE_REASON = "The client asked us to stop and file elsewhere.";
// A review never touches money: no client message may drift into these.
const MONEY_WORDS = [
  "refund",
  "bank",
  "routing",
  "deposit",
  "account number",
  "$",
];
// One valid payload per review action, so a sweep can ask for each of them.
const REVIEW_PAYLOADS = Object.freeze({
  SUBMIT_REVIEW: {},
  CLAIM_REVIEW: {},
  REQUEST_CORRECTIONS: { findings: FINDINGS },
  RESUBMIT_REVIEW: { resolution: RESOLUTION },
  APPROVE_REVIEW: {},
  RECORD_REVIEW_CONTACT: { outcome: "reached", note: CONTACT_NOTE },
});
// The person each action would belong to on a case Alex prepared and Morgan
// reviews, so a stage rejection is never really an authority rejection.
const entitled = (f, type) =>
  type === "SUBMIT_REVIEW" || type === "RESUBMIT_REVIEW" ? f.alex : f.morgan;
// Every review action this stage does not allow, asked by its entitled person.
async function refusedByStage(f, caseId, allowed) {
  for (const [type, payload] of Object.entries(REVIEW_PAYLOADS)) {
    if (allowed.includes(type)) continue;
    await assert.rejects(
      () => f.act(f.presenter, caseId, entitled(f, type), type, payload),
      rejected("INVALID_TRANSITION"),
      `${type} must not run on this stage`,
    );
  }
}
// A prepared case one reviewer already holds: stage reviewing, one active review.
async function reviewingCase(f, reviewerId) {
  const caseId = await f.preparedCase();
  await f.act(f.presenter, caseId, reviewerId, "CLAIM_REVIEW", {});
  return caseId;
}
// The same case after one correction cycle: stage corrections_required.
async function correctedCase(f, reviewerId) {
  const caseId = await reviewingCase(f, reviewerId);
  await f.act(f.presenter, caseId, reviewerId, "REQUEST_CORRECTIONS", {
    findings: FINDINGS,
  });
  return caseId;
}
// The latest entry for one action: a repeatable action (a contact attempt)
// appends a new row each time.
const detailOf = (staff, action) =>
  staff.internalHistory.findLast((entry) => entry.action === action).detail;
const messageOf = (staff, action) =>
  staff.history.findLast((entry) => entry.action === action).message;
// No client-readable message repeats internal text or invents a money field.
function assertPlainClientMessage(message) {
  assert.ok(message.length > 0);
  assert.ok(!message.includes(FINDINGS), "findings must stay internal");
  assert.ok(!message.includes(RESOLUTION), "resolutions must stay internal");
  assert.ok(!message.includes(CONTACT_NOTE), "contact notes must stay internal");
  for (const word of MONEY_WORDS)
    assert.ok(
      !message.toLowerCase().includes(word),
      `client copy must not mention ${word}`,
    );
}

test("independent review corrects, re-reviews and approves a prepared case", async (t) => {
  const f = await createDatabaseFixture();
  try {
    // Test-only roster: Alex gains `review` so self-review is proved to be
    // blocked by participation rather than by a missing qualification, Casey
    // prepares without reviewing, and Riley reviews without preparing.
    const added = await f.enrich({
      addPeople: [
        { key: "casey", name: "Casey", capabilities: ["prepare"] },
        { key: "riley", name: "Riley", capabilities: ["review"] },
      ],
      addCapabilities: [{ personId: f.alex, capability: "review" }],
    });
    const { casey, riley } = added;
    assert.ok(casey && riley);
    await t.test(
      "a capable preparer still cannot review their own case",
      async () => {
        const id = await f.preparedCase();
        await assert.rejects(
          f.act(f.presenter, id, f.alex, "CLAIM_REVIEW", {}),
          (error) => error.code === "SELF_REVIEW",
        );
        await assert.rejects(
          f.act(f.presenter, id, f.sam, "CLAIM_REVIEW", {}),
          (error) => error.code === "INELIGIBLE",
        );
        await f.act(f.presenter, id, f.morgan, "CLAIM_REVIEW", {});
        await f.act(f.presenter, id, f.morgan, "REQUEST_CORRECTIONS", {
          findings: "Recheck the fictional mileage entry.",
        });
        await assert.rejects(
          f.act(f.presenter, id, f.morgan, "APPROVE_REVIEW", {}),
          (error) => error.code === "INVALID_TRANSITION",
        );
        await f.act(f.presenter, id, f.alex, "RESUBMIT_REVIEW", {
          resolution: "Corrected and rechecked in external software.",
        });
        await assert.rejects(
          f.act(f.presenter, id, f.sam, "CLAIM_REVIEW", {}),
          (error) => error.code === "INELIGIBLE",
        );
        await f.act(f.presenter, id, f.morgan, "CLAIM_REVIEW", {});
        await f.act(f.presenter, id, f.morgan, "APPROVE_REVIEW", {});
        const c = await f.readStaffCase(id);
        assert.equal(c.stage, "review_approved");
        assert.equal(c.preparationVersion, 2);
        assert.equal(c.reviews.length, 2);
        // Each attempt is its own immutable row, in order.
        assert.deepEqual(
          c.reviews.map((review) => review.status),
          ["corrections_requested", "approved"],
        );
        assert.deepEqual(
          c.reviews.map((review) => review.preparationVersion),
          [1, 2],
        );
        assert.deepEqual(
          c.reviews.map((review) => review.reviewerId),
          [f.morgan, f.morgan],
        );
        assert.equal(c.reviews[0].findings, FINDINGS);
        assert.equal(c.reviews[0].resolution, RESOLUTION);
        assert.ok(c.reviews[0].decidedAt);
        assert.equal(c.reviews[0].clientContactStatus, null);
        assert.equal(c.reviews[1].findings, null);
        assert.equal(c.reviews[1].resolution, null);
        assert.ok(c.reviews[1].decidedAt);
        // Approval opens the contact task and nothing else.
        assert.equal(c.reviews[1].clientContactStatus, "pending");
        assert.equal(c.reviews[1].clientContactOutcome, null);
        assert.equal(c.reviews[1].clientContactNote, null);
        assert.equal(c.reviews[1].clientContactedAt, null);
        // Preparation is untouched by every review decision, and the approving
        // reviewer stays on the case.
        assert.equal(c.reviewerId, f.morgan);
        assert.equal(c.preparerId, f.alex);
        assert.deepEqual(c.participants, [f.alex]);
        assert.equal(c.intakeVerified, true);
        assert.deepEqual(
          c.internalHistory.map((entry) => entry.action),
          [
            "SUBMIT",
            "VERIFY_INTAKE",
            "CLAIM_PREPARATION",
            "SUBMIT_REVIEW",
            "CLAIM_REVIEW",
            "REQUEST_CORRECTIONS",
            "RESUBMIT_REVIEW",
            "CLAIM_REVIEW",
            "APPROVE_REVIEW",
          ],
        );
        // Internal details carry ids and versions; the findings live on the
        // presenter-only review row.
        for (const entry of c.internalHistory.filter((event) =>
          event.action.includes("REVIEW"),
        ))
          assert.ok(
            !JSON.stringify(entry.detail).includes(FINDINGS),
            `${entry.action} detail must not carry findings`,
          );
        assert.deepEqual(detailOf(c, "SUBMIT_REVIEW"), {
          preparationVersion: 1,
        });
        assert.deepEqual(detailOf(c, "REQUEST_CORRECTIONS"), {
          reviewId: c.reviews[0].id,
          preparationVersion: 1,
        });
        assert.deepEqual(detailOf(c, "RESUBMIT_REVIEW"), {
          reviewId: c.reviews[0].id,
          preparationVersion: 2,
        });
        assert.deepEqual(detailOf(c, "APPROVE_REVIEW"), {
          reviewId: c.reviews[1].id,
          preparationVersion: 2,
        });
        assert.deepEqual(
          c.internalHistory
            .filter((entry) => entry.action === "CLAIM_REVIEW")
            .map((entry) => entry.detail),
          [
            { reviewId: c.reviews[0].id, reviewerPersonId: f.morgan },
            { reviewId: c.reviews[1].id, reviewerPersonId: f.morgan },
          ],
        );
        // The client is told milestones in plain language, never findings.
        assert.deepEqual(
          c.history.map((entry) => entry.action),
          [
            "SUBMIT",
            "VERIFY_INTAKE",
            "CLAIM_PREPARATION",
            "SUBMIT_REVIEW",
            "CLAIM_REVIEW",
            "REQUEST_CORRECTIONS",
            "RESUBMIT_REVIEW",
            "CLAIM_REVIEW",
            "APPROVE_REVIEW",
          ],
        );
        for (const entry of c.history) assertPlainClientMessage(entry.message);
        assert.match(
          messageOf(c, "SUBMIT_REVIEW"),
          /independent reviewer will check it next/,
        );
        assert.match(
          messageOf(c, "REQUEST_CORRECTIONS"),
          /No action is needed from you right now/,
        );
        assert.match(
          messageOf(c, "APPROVE_REVIEW"),
          /Signing and filing are later milestones/,
        );
      },
    );
    await t.test(
      "a clean review approves at once, and a second reviewer may take the redo",
      async () => {
        const direct = await f.preparedCase();
        await f.act(f.presenter, direct, f.morgan, "CLAIM_REVIEW", {});
        let staff = await f.readStaffCase(direct);
        assert.equal(staff.stage, "reviewing");
        assert.equal(staff.reviewerId, f.morgan);
        assert.equal(staff.reviews.length, 1);
        assert.equal(staff.reviews[0].status, "active");
        assert.equal(staff.reviews[0].preparationVersion, 1);
        assert.equal(staff.reviews[0].decidedAt, null);
        await f.act(f.presenter, direct, f.morgan, "APPROVE_REVIEW", {});
        staff = await f.readStaffCase(direct);
        assert.equal(staff.stage, "review_approved");
        assert.equal(staff.preparationVersion, 1);
        assert.equal(staff.reviews.length, 1);
        assert.equal(staff.reviews[0].status, "approved");
        assert.equal(staff.reviews[0].clientContactStatus, "pending");
        assert.equal(staff.reviewerId, f.morgan);
        // A different reviewer may take the resubmitted version.
        const redo = await correctedCase(f, f.morgan);
        await f.act(f.presenter, redo, f.alex, "RESUBMIT_REVIEW", {
          resolution: RESOLUTION,
        });
        staff = await f.readStaffCase(redo);
        assert.equal(staff.stage, "review_ready");
        assert.equal(staff.reviewerId, null);
        assert.equal(staff.preparationVersion, 2);
        await f.act(f.presenter, redo, riley, "CLAIM_REVIEW", {});
        await f.act(f.presenter, redo, riley, "APPROVE_REVIEW", {});
        staff = await f.readStaffCase(redo);
        assert.equal(staff.stage, "review_approved");
        assert.equal(staff.reviewerId, riley);
        assert.deepEqual(
          staff.reviews.map((review) => [
            review.reviewerId,
            review.status,
            review.preparationVersion,
          ]),
          [
            [f.morgan, "corrections_requested", 1],
            [riley, "approved", 2],
          ],
        );
        assert.equal(staff.reviews[0].findings, FINDINGS);
        assert.equal(staff.reviews[0].resolution, RESOLUTION);
        assert.equal(staff.preparerId, f.alex);
        assert.deepEqual(staff.participants, [f.alex]);
      },
    );
    await t.test(
      "stage, revision, participation, qualification and assignment answer in order",
      async () => {
        // A fresh review_ready case: only a claim belongs here.
        const ready = await f.preparedCase();
        await refusedByStage(f, ready, ["CLAIM_REVIEW"]);
        // Participation answers before qualification: Casey prepared this one
        // and holds `prepare` only, so the refusal is SELF_REVIEW, not INELIGIBLE.
        const caseyCase = await f.readyCase();
        await f.act(f.presenter, caseyCase, casey, "CLAIM_PREPARATION", {});
        await f.act(f.presenter, caseyCase, casey, "SUBMIT_REVIEW", {});
        await assert.rejects(
          () => f.act(f.presenter, caseyCase, casey, "CLAIM_REVIEW", {}),
          rejected("SELF_REVIEW"),
        );
        // While one reviewer holds the case, nothing else is allowed here.
        const held = await reviewingCase(f, f.morgan);
        await refusedByStage(f, held, [
          "REQUEST_CORRECTIONS",
          "APPROVE_REVIEW",
        ]);
        // Qualification precedes assignment: Sam is refused for the capability
        // they lack, Riley for the assignment they do not hold.
        for (const type of ["REQUEST_CORRECTIONS", "APPROVE_REVIEW"]) {
          await assert.rejects(
            () =>
              f.act(f.presenter, held, f.sam, type, REVIEW_PAYLOADS[type]),
            rejected("INELIGIBLE"),
            `${type} without the review capability`,
          );
          await assert.rejects(
            () => f.act(f.presenter, held, riley, type, REVIEW_PAYLOADS[type]),
            rejected("FORBIDDEN"),
            `${type} by another reviewer`,
          );
          await assert.rejects(
            () => f.act(f.presenter, held, f.alex, type, REVIEW_PAYLOADS[type]),
            rejected("SELF_REVIEW"),
            `${type} by the preparer`,
          );
        }
        // The revision answers before the stage: the same envelope is a
        // CONFLICT at a stale revision and an INVALID_TRANSITION at the latest.
        const stale = (await f.readStaffCase(held)).revision;
        await f.act(f.presenter, held, f.morgan, "REQUEST_CORRECTIONS", {
          findings: FINDINGS,
        });
        const { error: conflict } = await f.presenter.rpc(
          "vitally_apply_action",
          applyArgs({
            caseId: held,
            revision: stale,
            personId: f.morgan,
            type: "APPROVE_REVIEW",
            payload: {},
          }),
        );
        assert.equal(conflict?.code, "VT003");
        await assert.rejects(
          () => f.act(f.presenter, held, f.morgan, "APPROVE_REVIEW", {}),
          rejected("INVALID_TRANSITION"),
        );
        // Corrections leave preparation alone and hand the case back.
        const corrected = await f.readStaffCase(held);
        assert.equal(corrected.stage, "corrections_required");
        assert.equal(corrected.reviewerId, null);
        assert.equal(corrected.preparerId, f.alex);
        assert.deepEqual(corrected.participants, [f.alex]);
        assert.equal(corrected.preparationVersion, 1);
        await refusedByStage(f, held, ["RESUBMIT_REVIEW"]);
        // The answered attempt stays as history, and version 2 needs a claim
        // of its own: nothing carries the old attempt forward.
        await f.act(f.presenter, held, f.alex, "RESUBMIT_REVIEW", {
          resolution: RESOLUTION,
        });
        const resubmitted = await f.readStaffCase(held);
        assert.equal(resubmitted.preparationVersion, 2);
        assert.deepEqual(
          resubmitted.reviews.map((review) => review.status),
          ["corrections_requested"],
        );
        // An attempt opened against an older version decides nothing, even in
        // its own reviewer's hands. The stage rules keep the two in step, so
        // the mismatch is forced through the privileged connection.
        await f.act(f.presenter, held, riley, "CLAIM_REVIEW", {});
        await f.sql(
          "update public.cases set preparation_version=preparation_version+1 where id=$1",
          [held],
        );
        try {
          for (const type of ["APPROVE_REVIEW", "REQUEST_CORRECTIONS"])
            await assert.rejects(
              () =>
                f.act(f.presenter, held, riley, type, REVIEW_PAYLOADS[type]),
              rejected("INVALID_TRANSITION"),
              `${type} at a stale preparation version`,
            );
        } finally {
          await f.sql(
            "update public.cases set preparation_version=preparation_version-1 where id=$1",
            [held],
          );
        }
        await f.act(f.presenter, held, riley, "APPROVE_REVIEW", {});
        assert.equal((await f.readStaffCase(held)).stage, "review_approved");
      },
    );
    await t.test(
      "two reviewers claiming one version leave a single active review",
      async () => {
        const caseId = await f.preparedCase();
        const revision = (await f.readStaffCase(caseId)).revision;
        const ids = [crypto.randomUUID(), crypto.randomUUID()];
        const results = await Promise.all(
          [f.morgan, riley].map((personId, index) =>
            f.presenter.rpc(
              "vitally_apply_action",
              applyArgs({
                actionId: ids[index],
                caseId,
                revision,
                personId,
                type: "CLAIM_REVIEW",
                payload: {},
              }),
            ),
          ),
        );
        const winners = results.filter((result) => !result.error);
        const losers = results.filter((result) => result.error);
        assert.equal(winners.length, 1);
        assert.equal(losers.length, 1);
        assert.equal(losers[0].error.code, "VT003");
        const staff = await f.readStaffCase(caseId);
        assert.equal(staff.stage, "reviewing");
        assert.equal(staff.reviews.length, 1);
        assert.equal(staff.reviews[0].status, "active");
        assert.equal(staff.reviews[0].reviewerId, staff.reviewerId);
        assert.ok([f.morgan, riley].includes(staff.reviewerId));
        assert.equal(winners[0].data.revision, revision + 1);
        assert.equal(await f.receiptsFor(ids[results.indexOf(losers[0])]), 0);
      },
    );
    await t.test(
      "review contact is recorded by the assigned reviewer without banking fields",
      async () => {
        // Contact belongs to an approved review only.
        const reviewing = await reviewingCase(f, f.morgan);
        await assert.rejects(
          () =>
            f.act(
              f.presenter,
              reviewing,
              f.morgan,
              "RECORD_REVIEW_CONTACT",
              REVIEW_PAYLOADS.RECORD_REVIEW_CONTACT,
            ),
          rejected("INVALID_TRANSITION"),
        );
        const caseId = await f.preparedCase();
        await f.act(f.presenter, caseId, f.morgan, "CLAIM_REVIEW", {});
        await f.act(f.presenter, caseId, f.morgan, "APPROVE_REVIEW", {});
        const approved = await f.readStaffCase(caseId);
        const clientEvents = approved.history.length;
        // A rejected payload records nothing.
        for (const payload of [
          { outcome: "resolved", note: CONTACT_NOTE },
          { outcome: "reached" },
          { outcome: "reached", note: "   " },
          { outcome: "reached", note: "x".repeat(1001) },
          { outcome: "reached", note: CONTACT_NOTE, extra: true },
          { note: CONTACT_NOTE },
          {},
        ])
          await assert.rejects(
            () =>
              f.act(
                f.presenter,
                caseId,
                f.morgan,
                "RECORD_REVIEW_CONTACT",
                payload,
              ),
            rejected("VALIDATION"),
            JSON.stringify(payload),
          );
        // Qualification precedes assignment here too.
        await assert.rejects(
          () =>
            f.act(
              f.presenter,
              caseId,
              f.sam,
              "RECORD_REVIEW_CONTACT",
              REVIEW_PAYLOADS.RECORD_REVIEW_CONTACT,
            ),
          rejected("INELIGIBLE"),
        );
        await assert.rejects(
          () =>
            f.act(
              f.presenter,
              caseId,
              riley,
              "RECORD_REVIEW_CONTACT",
              REVIEW_PAYLOADS.RECORD_REVIEW_CONTACT,
            ),
          rejected("FORBIDDEN"),
        );
        // An unanswered attempt is repeatable and keeps the task pending.
        for (const attempt of [
          "First fictional call, no answer.",
          "Second fictional call, no answer either.",
        ]) {
          await f.act(f.presenter, caseId, f.morgan, "RECORD_REVIEW_CONTACT", {
            outcome: "no_answer",
            note: attempt,
          });
          const pending = await f.readStaffCase(caseId);
          assert.equal(pending.reviews[0].clientContactStatus, "pending");
          assert.equal(pending.reviews[0].clientContactOutcome, "no_answer");
          assert.equal(pending.reviews[0].clientContactNote, attempt);
          assert.equal(pending.reviews[0].clientContactedAt, null);
          assert.equal(pending.stage, "review_approved");
          // Nothing is said to the client until the conversation happened.
          assert.equal(pending.history.length, clientEvents);
        }
        await f.act(f.presenter, caseId, f.morgan, "RECORD_REVIEW_CONTACT", {
          outcome: "reached",
          note: CONTACT_NOTE,
        });
        const done = await f.readStaffCase(caseId);
        assert.equal(done.reviews[0].clientContactStatus, "completed");
        assert.equal(done.reviews[0].clientContactOutcome, "reached");
        assert.equal(done.reviews[0].clientContactNote, CONTACT_NOTE);
        assert.ok(done.reviews[0].clientContactedAt);
        assert.equal(done.reviews[0].status, "approved");
        assert.equal(done.stage, "review_approved");
        assert.equal(done.history.length, clientEvents + 1);
        assertPlainClientMessage(messageOf(done, "RECORD_REVIEW_CONTACT"));
        assert.match(messageOf(done, "RECORD_REVIEW_CONTACT"), /volunteer spoke/);
        assert.deepEqual(detailOf(done, "RECORD_REVIEW_CONTACT"), {
          reviewId: done.reviews[0].id,
          outcome: "reached",
        });
        // A completed conversation is not repeated.
        for (const outcome of ["no_answer", "reached", "closure_requested"])
          await assert.rejects(
            () =>
              f.act(f.presenter, caseId, f.morgan, "RECORD_REVIEW_CONTACT", {
                outcome,
                note: CONTACT_NOTE,
              }),
            rejected("INVALID_TRANSITION"),
          );
        // A request to close stays a contact record: closure is its own action.
        const closing = await f.preparedCase();
        await f.act(f.presenter, closing, f.morgan, "CLAIM_REVIEW", {});
        await f.act(f.presenter, closing, f.morgan, "APPROVE_REVIEW", {});
        await f.act(f.presenter, closing, f.morgan, "RECORD_REVIEW_CONTACT", {
          outcome: "closure_requested",
          note: "The client asked about closing the fictional case.",
        });
        const asked = await f.readStaffCase(closing);
        assert.equal(asked.stage, "review_approved");
        assert.equal(asked.reviews[0].clientContactStatus, "pending");
        assert.equal(asked.reviews[0].clientContactOutcome, "closure_requested");
        // no_further_contact completes the task without another call.
        await f.act(f.presenter, closing, f.morgan, "RECORD_REVIEW_CONTACT", {
          outcome: "no_further_contact",
          note: "Recorded the fictional client's wish to stop here.",
        });
        const stopped = await f.readStaffCase(closing);
        assert.equal(stopped.reviews[0].clientContactStatus, "completed");
        assert.ok(stopped.reviews[0].clientContactedAt);
      },
    );
    await t.test(
      "clients read progress, never review attempts or their findings",
      async () => {
        const caseId = await correctedCase(f, f.morgan);
        const reviews = await f.applicantA.from("reviews").select("*");
        assert.equal(reviews.error, null, "reviews must not error for a client");
        assert.deepEqual(reviews.data, [], "reviews must be empty for a client");
        const events = await f.applicantA
          .from("client_events")
          .select("*")
          .eq("case_id", caseId);
        assert.equal(events.error, null);
        assert.ok(events.data.length > 0);
        for (const event of events.data) assertPlainClientMessage(event.message);
        // Internal history stays presenter-only.
        const internal = await f.applicantA
          .from("case_events")
          .select("*")
          .eq("case_id", caseId);
        assert.equal(internal.error, null);
        assert.deepEqual(internal.data, []);
        // Every review action is a presenter action on a staff person.
        const revision = (await f.readStaffCase(caseId)).revision;
        for (const [type, payload] of Object.entries(REVIEW_PAYLOADS)) {
          await assert.rejects(
            () => f.act(f.applicantA, caseId, null, type, payload),
            rejected("FORBIDDEN"),
            `${type} with no staff person`,
          );
          await assert.rejects(
            () => f.act(f.applicantA, caseId, f.morgan, type, payload),
            rejected("FORBIDDEN"),
            `${type} with a forged staff person`,
          );
          // Another client's attempt never reaches the case at all.
          const { error } = await f.applicantB.rpc(
            "vitally_apply_action",
            applyArgs({
              caseId,
              revision,
              personId: f.morgan,
              type,
              payload,
            }),
          );
          assert.equal(error?.code, "VT002", `${type} by another client`);
        }
        const staff = await f.readStaffCase(caseId);
        assert.equal(staff.stage, "corrections_required");
        assert.equal(staff.reviews[0].findings, FINDINGS);
      },
    );
    await t.test(
      "rejected review actions commit no receipt, review or mutation",
      async () => {
        const caseId = await reviewingCase(f, f.morgan);
        const revision = (await f.readStaffCase(caseId)).revision;
        const before = await f.stateSnapshot();
        const attempts = [
          [
            f.presenter,
            { caseId, revision, personId: riley, type: "APPROVE_REVIEW" },
            "VT001",
          ],
          [
            f.applicantB,
            { caseId, revision, personId: f.morgan, type: "APPROVE_REVIEW" },
            "VT002",
          ],
          [
            f.presenter,
            {
              caseId,
              revision: revision - 1,
              personId: f.morgan,
              type: "APPROVE_REVIEW",
            },
            "VT003",
          ],
          [
            f.presenter,
            { caseId, revision, personId: f.morgan, type: "CLAIM_REVIEW" },
            "VT004",
          ],
          [
            f.presenter,
            { caseId, revision, personId: f.alex, type: "APPROVE_REVIEW" },
            "VT005",
          ],
          [
            f.presenter,
            { caseId, revision, personId: f.sam, type: "APPROVE_REVIEW" },
            "VT006",
          ],
          [
            f.presenter,
            {
              caseId,
              revision,
              personId: f.morgan,
              type: "REQUEST_CORRECTIONS",
              payload: { findings: "   " },
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
        // An accepted claim replays to its own receipt and one review row.
        const fresh = await f.preparedCase();
        const envelope = applyArgs({
          caseId: fresh,
          revision: (await f.readStaffCase(fresh)).revision,
          personId: f.morgan,
          type: "CLAIM_REVIEW",
          payload: {},
        });
        const first = await f.presenter.rpc("vitally_apply_action", envelope);
        const replay = await f.presenter.rpc("vitally_apply_action", envelope);
        assert.equal(first.error, null);
        assert.equal(replay.error, null);
        assert.deepEqual(replay.data, first.data);
        const staff = await f.readStaffCase(fresh);
        assert.equal(staff.reviews.length, 1);
        assert.equal(staff.revision, first.data.revision);
        assert.equal(
          staff.internalHistory.filter(
            (entry) => entry.action === "CLAIM_REVIEW",
          ).length,
          1,
        );
      },
    );
    await t.test(
      "the normal initializer stays refused on the enriched workspace",
      async () => {
        const before = await f.snapshot();
        await f.withSetupLock(() =>
          assert.rejects(
            () => initializeWorkspace(f.setup),
            rejected("VALIDATION"),
          ),
        );
        assert.deepEqual(await f.snapshot(), before);
      },
    );
  } finally {
    await f.close();
  }
});

test("review submission waits for documents, not for office contact", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await t.test(
      "an open follow-up never blocks a preparer whose documents are verified",
      async () => {
        const caseId = await f.readyCase();
        await f.act(f.presenter, caseId, f.alex, "CLAIM_PREPARATION", {});
        await f.act(
          f.presenter,
          caseId,
          f.alex,
          "REQUEST_DOCUMENT",
          f.sampleRequest,
        );
        await f.act(f.presenter, caseId, f.alex, "ESCALATE_CONTACT", {
          reason: ESCALATION_REASON,
        });
        await f.act(f.applicantA, caseId, null, "RESPOND_DOCUMENT", {
          filename: f.sampleFilename,
        });
        await f.act(f.presenter, caseId, f.alex, "VERIFY_DOCUMENT", {});
        const held = await f.readStaffCase(caseId);
        // The office task is deliberately left open.
        assert.equal(held.followups.length, 1);
        assert.equal(held.followups[0].status, "open");
        await f.act(f.presenter, caseId, f.alex, "SUBMIT_REVIEW", {});
        const staff = await f.readStaffCase(caseId);
        assert.equal(staff.stage, "review_ready");
        assert.equal(staff.preparationVersion, 1);
        assert.equal(staff.preparerId, f.alex);
        assert.equal(staff.reviewerId, null);
        assert.deepEqual(staff.participants, [f.alex]);
        assert.equal(staff.requests[0].status, "verified");
        assert.deepEqual(staff.reviews, []);
        // The same task, still open, still Sam's.
        assert.equal(staff.followups.length, 1);
        assert.equal(staff.followups[0].id, held.followups[0].id);
        assert.equal(staff.followups[0].status, "open");
        assert.equal(staff.followups[0].assigneeId, f.sam);
        assert.equal(staff.followups[0].reason, ESCALATION_REASON);
        assert.deepEqual(detailOf(staff, "SUBMIT_REVIEW"), {
          preparationVersion: 1,
        });
        assertPlainClientMessage(messageOf(staff, "SUBMIT_REVIEW"));
        // Sam still owns the open task after the hand-off.
        await f.act(f.presenter, caseId, f.sam, "RECORD_CONTACT", {
          outcome: "reached",
          note: "Reached the fictional client about the office question.",
        });
        const contacted = await f.readStaffCase(caseId);
        assert.equal(contacted.stage, "review_ready");
        assert.equal(contacted.followups[0].attempts.length, 1);
      },
    );
    await t.test(
      "an unverified document blocks submission before any qualification",
      async () => {
        const caseId = await f.readyCase();
        await f.act(f.presenter, caseId, f.alex, "CLAIM_PREPARATION", {});
        await f.act(
          f.presenter,
          caseId,
          f.alex,
          "REQUEST_DOCUMENT",
          f.sampleRequest,
        );
        // An open request blocks the hand-off for everybody, qualified or not:
        // the blocker is case state the presenter can already read.
        for (const personId of [f.alex, f.sam, f.morgan])
          await assert.rejects(
            () => f.act(f.presenter, caseId, personId, "SUBMIT_REVIEW", {}),
            rejected("INVALID_TRANSITION"),
          );
        await f.act(f.applicantA, caseId, null, "RESPOND_DOCUMENT", {
          filename: f.sampleFilename,
        });
        // A received but unverified document is still a blocker.
        await assert.rejects(
          () => f.act(f.presenter, caseId, f.alex, "SUBMIT_REVIEW", {}),
          rejected("INVALID_TRANSITION"),
        );
        await f.act(f.presenter, caseId, f.alex, "VERIFY_DOCUMENT", {});
        // With nothing blocking, the unqualified caller is refused for the
        // qualification instead: step 6 answered before step 7.
        await assert.rejects(
          () => f.act(f.presenter, caseId, f.sam, "SUBMIT_REVIEW", {}),
          rejected("INELIGIBLE"),
        );
        await assert.rejects(
          () => f.act(f.presenter, caseId, f.morgan, "SUBMIT_REVIEW", {}),
          rejected("INELIGIBLE"),
        );
        // An unverified intake could never reach this stage, and is refused too.
        await f.sql("update public.cases set intake_verified=false where id=$1", [
          caseId,
        ]);
        try {
          await assert.rejects(
            () => f.act(f.presenter, caseId, f.alex, "SUBMIT_REVIEW", {}),
            rejected("INVALID_TRANSITION"),
          );
        } finally {
          await f.sql(
            "update public.cases set intake_verified=true where id=$1",
            [caseId],
          );
        }
        // Payload shapes, then the positive control.
        for (const payload of [{ confirmed: true }, { resolution: RESOLUTION }])
          await assert.rejects(
            () => f.act(f.presenter, caseId, f.alex, "SUBMIT_REVIEW", payload),
            rejected("VALIDATION"),
          );
        await f.act(f.presenter, caseId, f.alex, "SUBMIT_REVIEW", {});
        assert.equal((await f.readStaffCase(caseId)).stage, "review_ready");
      },
    );
    await t.test(
      "a resubmission needs its own verified documents and a resolution",
      async () => {
        const caseId = await f.preparedCase();
        await f.act(f.presenter, caseId, f.morgan, "CLAIM_REVIEW", {});
        await f.act(f.presenter, caseId, f.morgan, "REQUEST_CORRECTIONS", {
          findings: FINDINGS,
        });
        // Documents may be requested again while corrections are required.
        await f.act(
          f.presenter,
          caseId,
          f.alex,
          "REQUEST_DOCUMENT",
          f.sampleRequest,
        );
        await assert.rejects(
          () =>
            f.act(f.presenter, caseId, f.alex, "RESUBMIT_REVIEW", {
              resolution: RESOLUTION,
            }),
          rejected("INVALID_TRANSITION"),
        );
        await f.act(f.applicantA, caseId, null, "RESPOND_DOCUMENT", {
          filename: f.sampleFilename,
        });
        await f.act(f.presenter, caseId, f.alex, "VERIFY_DOCUMENT", {});
        for (const payload of [
          {},
          { resolution: "   " },
          { resolution: "x".repeat(2001) },
          { resolution: RESOLUTION, extra: 1 },
          { findings: RESOLUTION },
        ])
          await assert.rejects(
            () => f.act(f.presenter, caseId, f.alex, "RESUBMIT_REVIEW", payload),
            rejected("VALIDATION"),
            JSON.stringify(payload),
          );
        // Only the case's own preparer answers a correction request.
        for (const personId of [f.morgan, f.sam])
          await assert.rejects(
            () =>
              f.act(f.presenter, caseId, personId, "RESUBMIT_REVIEW", {
                resolution: RESOLUTION,
              }),
            rejected("INELIGIBLE"),
          );
        // A review left active while the case went back for corrections cannot
        // be reached by the stage rules, so the defensive supersede is seeded
        // through the privileged connection rather than a product action.
        const stranded = (
          await f.sql(
            "insert into public.reviews(workspace_id,case_id,preparation_version,reviewer_person_id,status) values($1,$2,1,$3,'active') returning id",
            [f.workspaceId, caseId, f.morgan],
          )
        ).rows[0].id;
        await f.act(f.presenter, caseId, f.alex, "RESUBMIT_REVIEW", {
          resolution: RESOLUTION,
        });
        const staff = await f.readStaffCase(caseId);
        assert.equal(staff.stage, "review_ready");
        assert.equal(staff.preparationVersion, 2);
        assert.equal(staff.reviews[0].resolution, RESOLUTION);
        assert.equal(staff.reviews[0].status, "corrections_requested");
        assert.equal(staff.requests[0].status, "verified");
        assert.equal(
          staff.reviews.find((review) => review.id === stranded).status,
          "superseded",
        );
      },
    );
    await t.test(
      "reminders and closure answer the review stages the workflow reaches",
      async () => {
        // A review_ready case nobody has claimed takes a reminder.
        const waiting = await f.preparedCase();
        await f.act(f.presenter, waiting, f.sam, "REMIND", {});
        let staff = await f.readStaffCase(waiting);
        assert.ok(staff.lastRemindedAt);
        assert.equal(staff.lastRemindedByPersonId, f.sam);
        assert.equal(staff.stage, "review_ready");
        // Work already in a reviewer's hands is not waiting for anybody.
        await f.act(f.presenter, waiting, f.morgan, "CLAIM_REVIEW", {});
        await assert.rejects(
          () => f.act(f.presenter, waiting, f.sam, "REMIND", {}),
          rejected("INVALID_TRANSITION"),
        );
        // Closure from reviewing keeps the review history and its reviewer.
        await f.act(f.presenter, waiting, f.sam, "CLOSE_CASE", {
          reason: CLOSURE_REASON,
          confirmed: true,
        });
        staff = await f.readStaffCase(waiting);
        assert.equal(staff.stage, "closed");
        assert.equal(staff.reviewerId, f.morgan);
        assert.equal(staff.reviews.length, 1);
        assert.equal(staff.reviews[0].status, "active");
        assert.equal(staff.reviews[0].preparationVersion, 1);
        // Closure from review_ready cancels nothing and creates no review.
        const readyCaseId = await f.preparedCase();
        await f.act(f.presenter, readyCaseId, f.sam, "CLOSE_CASE", {
          reason: CLOSURE_REASON,
          confirmed: true,
        });
        staff = await f.readStaffCase(readyCaseId);
        assert.equal(staff.stage, "closed");
        assert.deepEqual(staff.reviews, []);
        assert.equal(staff.preparerId, f.alex);
        // Closure from corrections_required cancels the open request.
        const correcting = await f.preparedCase();
        await f.act(f.presenter, correcting, f.morgan, "CLAIM_REVIEW", {});
        await f.act(f.presenter, correcting, f.morgan, "REQUEST_CORRECTIONS", {
          findings: FINDINGS,
        });
        await f.act(
          f.presenter,
          correcting,
          f.alex,
          "REQUEST_DOCUMENT",
          f.sampleRequest,
        );
        await f.act(f.presenter, correcting, f.sam, "CLOSE_CASE", {
          reason: CLOSURE_REASON,
          confirmed: true,
        });
        staff = await f.readStaffCase(correcting);
        assert.equal(staff.stage, "closed");
        assert.equal(staff.requests[0].status, "cancelled");
        assert.equal(staff.reviews[0].status, "corrections_requested");
        assert.equal(staff.reviews[0].findings, FINDINGS);
        // An approved return is never closed by the office.
        const approved = await f.preparedCase();
        await f.act(f.presenter, approved, f.morgan, "CLAIM_REVIEW", {});
        await f.act(f.presenter, approved, f.morgan, "APPROVE_REVIEW", {});
        await assert.rejects(
          () =>
            f.act(f.presenter, approved, f.sam, "CLOSE_CASE", {
              reason: CLOSURE_REASON,
              confirmed: true,
            }),
          rejected("INVALID_TRANSITION"),
        );
        assert.equal((await f.readStaffCase(approved)).stage, "review_approved");
        // A closed case takes no review action at all.
        for (const [type, payload] of Object.entries(REVIEW_PAYLOADS))
          await assert.rejects(
            () =>
              f.act(f.presenter, correcting, entitled(f, type), type, payload),
            rejected("INVALID_TRANSITION"),
            `${type} after closure`,
          );
      },
    );
  } finally {
    await f.close();
  }
});

test("a reassigned case excludes its former preparer from review", async (t) => {
  const f = await createDatabaseFixture();
  try {
    const { casey } = await f.enrich({
      addPeople: [{ key: "casey", name: "Casey", capabilities: ["prepare"] }],
      addCapabilities: [{ personId: f.alex, capability: "review" }],
    });
    // A case Alex started and Casey now prepares, with both participants kept.
    const reassigned = async () => {
      const caseId = await f.readyCase();
      await f.act(f.presenter, caseId, f.alex, "CLAIM_PREPARATION", {});
      await f.reassignPreparer(caseId, f.alex, casey);
      return caseId;
    };
    await t.test(
      "the current preparer hands the case to review; the former one cannot review it",
      async () => {
        const caseId = await reassigned();
        const moved = await f.readStaffCase(caseId);
        assert.equal(moved.preparerId, casey);
        assert.deepEqual([...moved.participants].sort(), [f.alex, casey].sort());
        // Only the current preparer submits.
        await assert.rejects(
          () => f.act(f.presenter, caseId, f.alex, "SUBMIT_REVIEW", {}),
          rejected("FORBIDDEN"),
        );
        await f.act(f.presenter, caseId, casey, "SUBMIT_REVIEW", {});
        assert.equal((await f.readStaffCase(caseId)).stage, "review_ready");
        // Alex holds `review` and never prepared the *current* version, but the
        // participation record is permanent, so the claim is a self-review.
        await assert.rejects(
          () => f.act(f.presenter, caseId, f.alex, "CLAIM_REVIEW", {}),
          rejected("SELF_REVIEW"),
        );
        await f.act(f.presenter, caseId, f.morgan, "CLAIM_REVIEW", {});
        // Independence is checked before assignment, so Alex sees SELF_REVIEW
        // rather than the FORBIDDEN another reviewer would see.
        await assert.rejects(
          () => f.act(f.presenter, caseId, f.alex, "APPROVE_REVIEW", {}),
          rejected("SELF_REVIEW"),
        );
        await assert.rejects(
          () =>
            f.act(f.presenter, caseId, f.alex, "REQUEST_CORRECTIONS", {
              findings: FINDINGS,
            }),
          rejected("SELF_REVIEW"),
        );
        await f.act(f.presenter, caseId, f.morgan, "APPROVE_REVIEW", {});
        const staff = await f.readStaffCase(caseId);
        assert.equal(staff.stage, "review_approved");
        assert.equal(staff.reviews[0].reviewerId, f.morgan);
        assert.equal(staff.preparerId, casey);
      },
    );
    await t.test(
      "document work needs the current preparer and their participation",
      async () => {
        const caseId = await reassigned();
        // Participation without the current assignment is not enough.
        await assert.rejects(
          () =>
            f.act(f.presenter, caseId, f.alex, "REQUEST_DOCUMENT", f.sampleRequest),
          rejected("FORBIDDEN"),
        );
        await f.act(
          f.presenter,
          caseId,
          casey,
          "REQUEST_DOCUMENT",
          f.sampleRequest,
        );
        const requestId = (await f.readStaffCase(caseId)).requests[0].id;
        await assert.rejects(
          () =>
            f.act(f.presenter, caseId, f.alex, "ESCALATE_CONTACT", {
              requestId,
              reason: ESCALATION_REASON,
            }),
          rejected("FORBIDDEN"),
        );
        await f.act(f.applicantA, caseId, null, "RESPOND_DOCUMENT", {
          filename: f.sampleFilename,
        });
        await assert.rejects(
          () =>
            f.act(f.presenter, caseId, f.alex, "VERIFY_DOCUMENT", { requestId }),
          rejected("FORBIDDEN"),
        );
        await f.act(f.presenter, caseId, casey, "VERIFY_DOCUMENT", {
          requestId,
        });
        assert.equal(
          (await f.readStaffCase(caseId)).requests[0].status,
          "verified",
        );
      },
    );
    await t.test(
      "the current assignment alone is not participation either",
      async () => {
        const caseId = await f.readyCase();
        await f.act(f.presenter, caseId, f.alex, "CLAIM_PREPARATION", {});
        // Half of a reassignment: Casey is the current preparer with no
        // participation record. No product action can write this state.
        await f.sql("update public.cases set preparer_id=$2 where id=$1", [
          caseId,
          casey,
        ]);
        for (const [type, payload] of [
          ["REQUEST_DOCUMENT", f.sampleRequest],
          ["SUBMIT_REVIEW", {}],
        ])
          await assert.rejects(
            () => f.act(f.presenter, caseId, casey, type, payload),
            rejected("FORBIDDEN"),
            type,
          );
        await f.sql(
          "insert into public.preparation_participants(workspace_id,case_id,person_id) values($1,$2,$3)",
          [f.workspaceId, caseId, casey],
        );
        await f.act(
          f.presenter,
          caseId,
          casey,
          "REQUEST_DOCUMENT",
          f.sampleRequest,
        );
        assert.equal((await f.readStaffCase(caseId)).requests.length, 1);
      },
    );
  } finally {
    await f.close();
  }
});
