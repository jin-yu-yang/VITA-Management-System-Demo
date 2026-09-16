import test from "node:test";
import assert from "node:assert/strict";
import {
  createDatabaseFixture,
  applyArgs,
  assistanceArgs,
  rejected,
} from "./support/database-fixture.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";
const RESOLUTION_NOTE = "Helped complete fictional forms";
const ESCALATION_REASON = "No response to the document request.";
const CLOSURE_REASON = "The client asked us to stop and file elsewhere.";
// The case fields an assistance action must never touch (Ruling R22).
const CASE_INVARIANTS = ["stage", "intakeVerified", "preparerId", "reviewerId"];
// One rejected assistance envelope: its SQLSTATE and no receipt behind it.
async function refuseAssistance(f, client, spec, code) {
  const actionId = crypto.randomUUID();
  const { error } = await client.rpc(
    "vitally_assistance_action",
    assistanceArgs({ ...spec, actionId }),
  );
  assert.equal(error?.code, code, `${spec.type} note=${spec.note}`);
  assert.equal(await f.receiptsFor(actionId), 0);
}
// The same for a case action, so a rejection is never half committed.
async function refuseAction(f, client, spec, code) {
  const actionId = crypto.randomUUID();
  const { error } = await client.rpc(
    "vitally_apply_action",
    applyArgs({ ...spec, actionId }),
  );
  assert.equal(
    error?.code,
    code,
    `${spec.type} ${JSON.stringify(spec.payload)}`,
  );
  assert.equal(await f.receiptsFor(actionId), 0);
}
// Capability changes a test needs are always undone, whatever the body does.
async function withCapabilities(f, personId, change, body) {
  const before = (
    await f.sql("select capabilities from public.people where id=$1", [
      personId,
    ])
  ).rows[0].capabilities;
  await f.sql(change, [personId]);
  try {
    await body();
  } finally {
    await f.sql("update public.people set capabilities=$2 where id=$1", [
      personId,
      before,
    ]);
  }
}
const caseCount = async (f) =>
  Number(
    (
      await f.sql(
        "select count(*) as count from public.cases where workspace_id=$1",
        [f.workspaceId],
      )
    ).rows[0].count,
  );
// A client case in preparation with one open request, one answered request, an
// open follow-up carrying a recorded attempt, and a linked assistance item:
// everything a closure has to cancel, keep, or leave alone.
async function pendingCase(f) {
  const { itemId, caseId } = await f.seedAssistance();
  await f.act(f.presenter, caseId, f.sam, "VERIFY_INTAKE", {
    checks: f.intakeChecks,
  });
  await f.act(f.presenter, caseId, f.alex, "CLAIM_PREPARATION", {});
  await f.act(f.presenter, caseId, f.alex, "REQUEST_DOCUMENT", f.sampleRequest);
  await f.act(f.presenter, caseId, f.alex, "ESCALATE_CONTACT", {
    reason: ESCALATION_REASON,
  });
  await f.act(f.presenter, caseId, f.sam, "RECORD_CONTACT", {
    outcome: "no_answer",
    note: "Left a message.",
  });
  await f.act(f.presenter, caseId, f.alex, "REQUEST_DOCUMENT", {
    ...f.sampleRequest,
    title: "Second mileage record",
  });
  const staff = await f.readStaffCase(caseId);
  const answered = staff.requests.find(
    (request) => request.title === "Second mileage record",
  );
  await f.act(f.applicantA, caseId, null, "RESPOND_DOCUMENT", {
    requestId: answered.id,
    filename: f.sampleFilename,
  });
  return {
    caseId,
    itemId,
    openRequestId: staff.requests.find(
      (request) => request.title === f.sampleRequest.title,
    ).id,
    answeredRequestId: answered.id,
    followupId: staff.followups[0].id,
  };
}

test("assistance items are claimed and resolved by their own helper", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await t.test(
      "a claim assigns the helper and a resolution records the note",
      async () => {
        const { itemId, caseId } = await f.seedAssistance();
        const before = await f.readStaffCase(caseId);
        const initial = await f.readStaffAssistance(itemId);
        assert.equal(initial.status, "open");
        assert.equal(initial.revision, 1);
        assert.equal(initial.assigneeId, null);
        for (const [type, revision] of [
          ["CLAIM", 1],
          ["RESOLVE", 2],
        ]) {
          const actionId = crypto.randomUUID();
          const result = await f.presenter.rpc("vitally_assistance_action", {
            p_action_id: actionId,
            p_item_id: itemId,
            p_expected_revision: revision,
            p_person_id: f.sam,
            p_type: type,
            p_note: type === "RESOLVE" ? RESOLUTION_NOTE : "",
          });
          assert.equal(result.error, null);
          assert.deepEqual(result.data, {
            actionId,
            itemId,
            revision: revision + 1,
          });
          const item = await f.readStaffAssistance(itemId);
          assert.equal(item.status, type === "CLAIM" ? "assigned" : "resolved");
          assert.equal(item.revision, revision + 1);
          assert.equal(item.assigneeId, f.sam);
        }
        const resolved = await f.readStaffAssistance(itemId);
        assert.equal(resolved.resolutionNote, RESOLUTION_NOTE);
        // The request itself is never rewritten by the work on it.
        assert.equal(resolved.title, f.sampleAssistance.title);
        assert.equal(resolved.language, f.sampleAssistance.language);
        assert.equal(
          resolved.contactPreference,
          f.sampleAssistance.contactPreference,
        );
        assert.equal(resolved.caseId, caseId);
        assert.equal(resolved.fixture, false);
        assert.equal(resolved.createdAt, initial.createdAt);
        assert.ok(resolved.updatedAt > initial.updatedAt);
        const after = await f.readStaffCase(caseId);
        for (const key of CASE_INVARIANTS)
          assert.deepEqual(after[key], before[key]);
        // Ruling R22: assistance is beside the tax workflow, not part of it.
        assert.equal(after.revision, before.revision);
        assert.deepEqual(after.internalHistory, before.internalHistory);
        assert.deepEqual(after.history, before.history);
        assert.deepEqual(after.requests, []);
        assert.deepEqual(after.followups, []);
      },
    );
    await t.test(
      "two simultaneous claims leave one helper and one conflict",
      async () => {
        const { itemId } = await f.seedAssistance();
        const attempts = [crypto.randomUUID(), crypto.randomUUID()];
        const results = await Promise.all(
          attempts.map((actionId) =>
            f.presenter.rpc(
              "vitally_assistance_action",
              assistanceArgs({
                actionId,
                itemId,
                revision: 1,
                personId: f.sam,
                type: "CLAIM",
                note: "",
              }),
            ),
          ),
        );
        const won = results.filter((result) => !result.error);
        const lost = results.filter((result) => result.error);
        assert.equal(won.length, 1);
        assert.equal(lost.length, 1);
        assert.equal(lost[0].error.code, "VT003");
        assert.equal(won[0].data.revision, 2);
        const item = await f.readStaffAssistance(itemId);
        assert.equal(item.status, "assigned");
        assert.equal(item.revision, 2);
        assert.equal(item.assigneeId, f.sam);
        assert.equal(
          await f.receiptsFor(attempts[results.indexOf(lost[0])]),
          0,
        );
      },
    );
    await t.test(
      "assistance needs the assist capability, then the assigned helper",
      async () => {
        const { itemId } = await f.seedAssistance();
        const claim = { itemId, revision: 1, type: "CLAIM", note: "" };
        // Step 4: the capability, never the title, admits a helper.
        for (const personId of [f.alex, f.morgan, null, f.foreignPeople.sam])
          await refuseAssistance(
            f,
            f.presenter,
            { ...claim, personId },
            "VT001",
          );
        const claimed = await f.actAssistance(
          f.presenter,
          itemId,
          f.sam,
          "CLAIM",
        );
        assert.equal(claimed.revision, 2);
        const resolve = {
          itemId,
          revision: 2,
          type: "RESOLVE",
          note: RESOLUTION_NOTE,
        };
        // Step 7: holding `assist` is not holding this item.
        await withCapabilities(
          f,
          f.morgan,
          "update public.people set capabilities=array_append(capabilities,'assist') where id=$1",
          async () => {
            await refuseAssistance(
              f,
              f.presenter,
              { ...resolve, personId: f.morgan },
              "VT001",
            );
          },
        );
        await refuseAssistance(
          f,
          f.presenter,
          { ...resolve, personId: f.alex },
          "VT001",
        );
        await refuseAssistance(
          f,
          f.presenter,
          { ...resolve, personId: null },
          "VT001",
        );
        const item = await f.readStaffAssistance(itemId);
        assert.equal(item.status, "assigned");
        assert.equal(item.assigneeId, f.sam);
        assert.equal(item.resolutionNote, null);
      },
    );
    await t.test(
      "applicants and other workspaces get the same NOT_FOUND",
      async () => {
        const { itemId } = await f.seedAssistance();
        const spec = { itemId, revision: 1, type: "CLAIM", note: "" };
        const attempts = [crypto.randomUUID(), crypto.randomUUID()];
        // The owner of the linked case is still not a presenter.
        const owner = await f.applicantA.rpc(
          "vitally_assistance_action",
          assistanceArgs({ ...spec, actionId: attempts[0] }),
        );
        const absent = await f.applicantA.rpc(
          "vitally_assistance_action",
          assistanceArgs({
            ...spec,
            itemId: crypto.randomUUID(),
            actionId: attempts[1],
          }),
        );
        assert.equal(owner.error.code, "VT002");
        assert.deepEqual(owner.error, absent.error);
        assert.ok(!JSON.stringify(owner.error).includes(itemId));
        for (const client of [f.applicantB, f.outsider])
          await refuseAssistance(f, client, spec, "VT002");
        // A forged persona reveals nothing a client could not already see.
        await refuseAssistance(
          f,
          f.applicantA,
          { ...spec, personId: f.sam },
          "VT002",
        );
        // Membership is checked before any target is inspected.
        await refuseAssistance(f, f.unapproved, spec, "VT001");
        for (const actionId of attempts)
          assert.equal(await f.receiptsFor(actionId), 0);
        assert.equal((await f.readStaffAssistance(itemId)).status, "open");
        const claimed = await f.actAssistance(
          f.presenter,
          itemId,
          f.sam,
          "CLAIM",
        );
        assert.equal(claimed.revision, 2);
      },
    );
    await t.test("status rules answer after the revision check", async () => {
      const { itemId } = await f.seedAssistance();
      // Nothing to resolve before someone takes it.
      await refuseAssistance(
        f,
        f.presenter,
        {
          itemId,
          revision: 1,
          personId: f.sam,
          type: "RESOLVE",
          note: RESOLUTION_NOTE,
        },
        "VT004",
      );
      await f.actAssistance(f.presenter, itemId, f.sam, "CLAIM");
      await refuseAssistance(
        f,
        f.presenter,
        { itemId, revision: 2, personId: f.sam, type: "CLAIM", note: "" },
        "VT004",
      );
      // A stale revision answers before the status, and authority before both.
      await refuseAssistance(
        f,
        f.presenter,
        {
          itemId,
          revision: 1,
          personId: f.sam,
          type: "RESOLVE",
          note: RESOLUTION_NOTE,
        },
        "VT003",
      );
      await refuseAssistance(
        f,
        f.presenter,
        { itemId, revision: 1, personId: f.alex, type: "CLAIM", note: "" },
        "VT001",
      );
      await f.actAssistance(
        f.presenter,
        itemId,
        f.sam,
        "RESOLVE",
        RESOLUTION_NOTE,
      );
      for (const spec of [
        {
          revision: 3,
          personId: f.sam,
          type: "RESOLVE",
          note: "Helped again",
        },
        { revision: 3, personId: f.sam, type: "CLAIM", note: "" },
      ])
        await refuseAssistance(f, f.presenter, { ...spec, itemId }, "VT004");
      const item = await f.readStaffAssistance(itemId);
      assert.equal(item.status, "resolved");
      assert.equal(item.revision, 3);
      assert.equal(item.resolutionNote, RESOLUTION_NOTE);
      assert.equal(item.assigneeId, f.sam);
    });
    await t.test("the note follows the action type", async () => {
      const { itemId } = await f.seedAssistance();
      for (const spec of [
        // A claim is a claim: it carries no resolution text.
        { revision: 1, type: "CLAIM", note: "Taking this one" },
        { revision: 1, type: "CLAIM", note: "   " },
        // A resolution says what was done, within the column's bound.
        { revision: 1, type: "RESOLVE", note: null },
        { revision: 1, type: "RESOLVE", note: "" },
        { revision: 1, type: "RESOLVE", note: "   " },
        { revision: 1, type: "RESOLVE", note: "x".repeat(1001) },
        { revision: 1, type: "BOGUS", note: "" },
        { revision: 1, type: "claim", note: "" },
        { revision: 1, type: "RESOLVE_FOLLOWUP", note: RESOLUTION_NOTE },
        { revision: 1, type: null, note: "" },
        { revision: null, type: "CLAIM", note: "" },
      ])
        await refuseAssistance(
          f,
          f.presenter,
          { ...spec, itemId, personId: f.sam },
          "VT007",
        );
      await refuseAssistance(
        f,
        f.presenter,
        {
          itemId: null,
          revision: 1,
          personId: f.sam,
          type: "CLAIM",
          note: "",
        },
        "VT007",
      );
      assert.equal((await f.readStaffAssistance(itemId)).revision, 1);
      // A null note claims, and a full-length note resolves.
      await f.actAssistance(f.presenter, itemId, f.sam, "CLAIM");
      await f.actAssistance(
        f.presenter,
        itemId,
        f.sam,
        "RESOLVE",
        "x".repeat(1000),
      );
      const item = await f.readStaffAssistance(itemId);
      assert.equal(item.status, "resolved");
      assert.equal(item.resolutionNote.length, 1000);
    });
    await t.test(
      "an identical replay returns one receipt; a changed note is a validation error",
      async () => {
        const { itemId } = await f.seedAssistance();
        const claim = assistanceArgs({
          itemId,
          revision: 1,
          personId: f.sam,
          type: "CLAIM",
          note: "",
        });
        const first = await f.presenter.rpc("vitally_assistance_action", claim);
        assert.equal(first.error, null);
        const replay = await f.presenter.rpc(
          "vitally_assistance_action",
          claim,
        );
        assert.equal(replay.error, null);
        assert.deepEqual(replay.data, first.data);
        const claimed = await f.readStaffAssistance(itemId);
        assert.equal(claimed.revision, 2);
        for (const changed of [
          { ...claim, p_note: "Taking this one" },
          { ...claim, p_note: null },
          { ...claim, p_expected_revision: 2 },
          { ...claim, p_person_id: f.alex },
          { ...claim, p_type: "RESOLVE", p_note: RESOLUTION_NOTE },
        ]) {
          const response = await f.presenter.rpc(
            "vitally_assistance_action",
            changed,
          );
          assert.equal(response.error.code, "VT007");
        }
        // The capability the operation needs is re-checked on every replay.
        await withCapabilities(
          f,
          f.sam,
          "update public.people set capabilities=array_remove(capabilities,'assist') where id=$1",
          async () => {
            const stripped = await f.presenter.rpc(
              "vitally_assistance_action",
              claim,
            );
            assert.equal(stripped.error.code, "VT001");
          },
        );
        const restored = await f.presenter.rpc(
          "vitally_assistance_action",
          claim,
        );
        assert.deepEqual(restored.data, first.data);
        assert.deepEqual(await f.readStaffAssistance(itemId), claimed);
      },
    );
    await t.test(
      "rejected assistance actions commit no receipt or change",
      async () => {
        const { itemId } = await f.seedAssistance();
        await f.actAssistance(f.presenter, itemId, f.sam, "CLAIM");
        const before = await f.stateSnapshot();
        // Assistance has no technical qualification, so VT006 is unreachable.
        const attempts = [
          [
            f.presenter,
            {
              revision: 2,
              personId: f.alex,
              type: "RESOLVE",
              note: RESOLUTION_NOTE,
            },
            "VT001",
          ],
          [f.applicantA, { revision: 2, type: "CLAIM", note: "" }, "VT002"],
          [
            f.presenter,
            {
              revision: 1,
              personId: f.sam,
              type: "RESOLVE",
              note: RESOLUTION_NOTE,
            },
            "VT003",
          ],
          [
            f.presenter,
            { revision: 2, personId: f.sam, type: "CLAIM", note: "" },
            "VT004",
          ],
          [
            f.presenter,
            { revision: 2, personId: f.sam, type: "RESOLVE", note: "   " },
            "VT007",
          ],
        ];
        for (const [client, spec, code] of attempts)
          await refuseAssistance(f, client, { ...spec, itemId }, code);
        assert.deepEqual(await f.stateSnapshot(), before);
        await assert.rejects(
          () => f.actAssistance(f.presenter, itemId, f.alex, "RESOLVE", "x"),
          rejected("FORBIDDEN"),
        );
      },
    );
  } finally {
    await f.close();
  }
});

test("reminders record a simulated nudge on available work", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await t.test(
      "unclaimed preparation work takes a reminder and no external message",
      async () => {
        const caseId = await f.readyCase();
        const before = await f.readStaffCase(caseId);
        assert.equal(before.lastRemindedAt, null);
        assert.equal(before.lastRemindedByPersonId, null);
        const cases = await caseCount(f);
        const receipt = await f.act(f.presenter, caseId, f.sam, "REMIND", {});
        assert.equal(receipt.caseId, caseId);
        assert.equal(receipt.revision, before.revision + 1);
        const after = await f.readStaffCase(caseId);
        assert.ok(after.lastRemindedAt);
        assert.equal(after.lastRemindedByPersonId, f.sam);
        // A reminder is a note to the office: nothing about the case moves.
        assert.equal(after.stage, "preparation_ready");
        assert.equal(after.preparerId, null);
        assert.equal(after.intakeVerified, true);
        assert.deepEqual(after.participants, []);
        assert.deepEqual(after.requests, []);
        assert.deepEqual(after.followups, []);
        assert.equal(await caseCount(f), cases);
        const event = after.internalHistory.at(-1);
        assert.equal(event.action, "REMIND");
        assert.deepEqual(event.detail, { simulated: true });
        assert.equal(event.actorPersonId, f.sam);
        // No external message is ever sent, so the client sees nothing new.
        assert.deepEqual(after.history, before.history);
        // The work is still waiting, so it can be reminded again.
        const again = await f.act(f.presenter, caseId, f.sam, "REMIND", {});
        assert.equal(again.revision, before.revision + 2);
        const reminded = await f.readStaffCase(caseId);
        assert.ok(reminded.lastRemindedAt > after.lastRemindedAt);
        assert.deepEqual(
          reminded.internalHistory.map((entry) => entry.action),
          ["SUBMIT", "VERIFY_INTAKE", "REMIND", "REMIND"],
        );
        assert.deepEqual(reminded.history, before.history);
      },
    );
    await t.test("an identical reminder replays one receipt", async () => {
      const caseId = await f.readyCase();
      const remind = applyArgs({
        caseId,
        revision: 3,
        personId: f.sam,
        type: "REMIND",
      });
      const first = await f.presenter.rpc("vitally_apply_action", remind);
      assert.equal(first.error, null);
      const replay = await f.presenter.rpc("vitally_apply_action", remind);
      assert.equal(replay.error, null);
      assert.deepEqual(replay.data, first.data);
      const staff = await f.readStaffCase(caseId);
      assert.equal(staff.revision, 4);
      assert.deepEqual(
        staff.internalHistory.map((entry) => entry.action),
        ["SUBMIT", "VERIFY_INTAKE", "REMIND"],
      );
    });
    await t.test("work nobody is waiting for takes no reminder", async () => {
      const remind = { type: "REMIND", personId: f.sam, payload: {} };
      // A claimed case is somebody's work already.
      const claimed = await f.readyCase();
      await f.act(f.presenter, claimed, f.alex, "CLAIM_PREPARATION", {});
      await refuseAction(
        f,
        f.presenter,
        { ...remind, caseId: claimed, revision: 4 },
        "VT004",
      );
      // Intake that has not been verified is not on anyone's queue yet.
      const created = await f.createCase(f.applicantA, crypto.randomUUID(), {
        answers: makeSampleAnswers(),
      });
      await f.act(f.applicantA, created.caseId, null, "SUBMIT", {
        confirmed: true,
      });
      await refuseAction(
        f,
        f.presenter,
        { ...remind, caseId: created.caseId, revision: 2 },
        "VT004",
      );
      // An assisted draft has no queue either; a client draft is invisible.
      const assisted = await f.createCase(f.presenter, crypto.randomUUID(), {
        mode: "assisted",
        personId: f.sam,
        answers: makeSampleAnswers(),
      });
      await refuseAction(
        f,
        f.presenter,
        { ...remind, caseId: assisted.caseId, revision: 1 },
        "VT004",
      );
      const draft = await f.createCase(f.applicantA, crypto.randomUUID(), {
        answers: makeSampleAnswers(),
      });
      await refuseAction(
        f,
        f.presenter,
        { ...remind, caseId: draft.caseId, revision: 1 },
        "VT002",
      );
      assert.equal((await f.readStaffCase(claimed)).lastRemindedAt, null);
    });
    await t.test("only an admin presenter may remind", async () => {
      const caseId = await f.readyCase();
      const remind = { caseId, revision: 3, type: "REMIND", payload: {} };
      for (const personId of [f.alex, f.morgan, null, f.foreignPeople.sam])
        await refuseAction(f, f.presenter, { ...remind, personId }, "VT001");
      // A presenter-only action stays out of the client's reach either way.
      await refuseAction(f, f.applicantA, { ...remind }, "VT001");
      await refuseAction(
        f,
        f.applicantA,
        { ...remind, personId: f.sam },
        "VT001",
      );
      await refuseAction(f, f.applicantB, { ...remind }, "VT002");
      // A reminder confirms nothing, so it carries no payload.
      for (const payload of [
        { confirmed: true },
        { note: "Please pick this up" },
        { reason: "waiting" },
      ])
        await refuseAction(
          f,
          f.presenter,
          { ...remind, personId: f.sam, payload },
          "VT007",
        );
      const before = await f.readStaffCase(caseId);
      assert.equal(before.lastRemindedAt, null);
      assert.equal(before.revision, 3);
      await f.act(f.presenter, caseId, f.sam, "REMIND", {});
      assert.ok((await f.readStaffCase(caseId)).lastRemindedAt);
    });
  } finally {
    await f.close();
  }
});

test("closure cancels pending work without erasing its history", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await t.test(
      "a reasoned closure cancels the open request and the open task",
      async () => {
        const pending = await pendingCase(f);
        const before = await f.readStaffCase(pending.caseId);
        const item = await f.readStaffAssistance(pending.itemId);
        assert.equal(before.stage, "preparing");
        const closed = await f.act(
          f.presenter,
          pending.caseId,
          f.sam,
          "CLOSE_CASE",
          { reason: CLOSURE_REASON, confirmed: true },
        );
        assert.equal(closed.revision, before.revision + 1);
        const after = await f.readStaffCase(pending.caseId);
        assert.equal(after.stage, "closed");
        // Pending work is cancelled; nothing about it is deleted.
        assert.deepEqual(
          after.requests.map((request) => [request.id, request.status]),
          before.requests.map((request) => [request.id, "cancelled"]),
        );
        assert.deepEqual(
          after.requests.map((request) => request.title),
          before.requests.map((request) => request.title),
        );
        assert.deepEqual(after.documents, before.documents);
        assert.equal(after.followups.length, 1);
        assert.equal(after.followups[0].status, "cancelled");
        assert.equal(after.followups[0].reason, ESCALATION_REASON);
        assert.equal(after.followups[0].resolutionOutcome, null);
        assert.equal(after.followups[0].resolutionNote, null);
        assert.equal(after.followups[0].resolvedAt, null);
        assert.deepEqual(
          after.followups[0].attempts,
          before.followups[0].attempts,
        );
        // The people who did the work stay on the record.
        assert.equal(after.preparerId, f.alex);
        assert.deepEqual(after.participants, [f.alex]);
        assert.equal(after.intakeVerified, true);
        assert.equal(after.answers.firstName, before.answers.firstName);
        const event = after.internalHistory.at(-1);
        assert.equal(event.action, "CLOSE_CASE");
        assert.deepEqual(event.detail, { reason: CLOSURE_REASON });
        assert.equal(event.actorPersonId, f.sam);
        // The client is told plainly, without the internal reason.
        const message = after.history.at(-1);
        assert.equal(message.action, "CLOSE_CASE");
        assert.ok(message.message.includes("closed"));
        assert.ok(!message.message.includes(CLOSURE_REASON));
        assert.equal(after.history.length, before.history.length + 1);
        // Assistance work is not case work: closure leaves it alone.
        assert.deepEqual(await f.readStaffAssistance(pending.itemId), item);
      },
    );
    await t.test(
      "every case action after closure is an invalid transition",
      async () => {
        const pending = await pendingCase(f);
        await f.act(f.presenter, pending.caseId, f.sam, "CLOSE_CASE", {
          reason: CLOSURE_REASON,
          confirmed: true,
        });
        const { revision } = await f.readStaffCase(pending.caseId);
        const before = await f.stateSnapshot();
        const attempts = [
          [
            f.applicantA,
            {
              type: "SAVE_ANSWERS",
              payload: { answers: { city: "Pittsburgh" } },
            },
          ],
          [f.applicantA, { type: "SUBMIT", payload: { confirmed: true } }],
          [
            f.presenter,
            {
              personId: f.sam,
              type: "VERIFY_INTAKE",
              payload: { checks: f.intakeChecks },
            },
          ],
          [
            f.presenter,
            { personId: f.alex, type: "CLAIM_PREPARATION", payload: {} },
          ],
          [
            f.presenter,
            {
              personId: f.alex,
              type: "REQUEST_DOCUMENT",
              payload: f.sampleRequest,
            },
          ],
          [
            f.applicantA,
            {
              type: "RESPOND_DOCUMENT",
              payload: {
                requestId: pending.openRequestId,
                filename: f.sampleFilename,
              },
            },
          ],
          [
            f.presenter,
            {
              personId: f.alex,
              type: "VERIFY_DOCUMENT",
              payload: { requestId: pending.answeredRequestId },
            },
          ],
          [
            f.presenter,
            {
              personId: f.alex,
              type: "ESCALATE_CONTACT",
              payload: {
                requestId: pending.openRequestId,
                reason: ESCALATION_REASON,
              },
            },
          ],
          [
            f.presenter,
            {
              personId: f.sam,
              type: "RECORD_CONTACT",
              payload: {
                followupId: pending.followupId,
                outcome: "reached",
                note: "Called back.",
              },
            },
          ],
          [
            f.presenter,
            {
              personId: f.sam,
              type: "RESOLVE_FOLLOWUP",
              payload: {
                followupId: pending.followupId,
                outcome: "reached",
                note: "Called back.",
              },
            },
          ],
          [f.presenter, { personId: f.sam, type: "REMIND", payload: {} }],
          [
            f.presenter,
            {
              personId: f.sam,
              type: "CLOSE_CASE",
              payload: { reason: "Closing again", confirmed: true },
            },
          ],
        ];
        for (const [client, spec] of attempts)
          await refuseAction(
            f,
            client,
            { ...spec, caseId: pending.caseId, revision },
            "VT004",
          );
        assert.deepEqual(await f.stateSnapshot(), before);
      },
    );
    await t.test(
      "closure needs a reason and an explicit confirmation",
      async () => {
        const caseId = await f.readyCase();
        const close = {
          caseId,
          revision: 3,
          personId: f.sam,
          type: "CLOSE_CASE",
        };
        for (const payload of [
          {},
          { confirmed: true },
          { reason: CLOSURE_REASON },
          { reason: "", confirmed: true },
          { reason: "   ", confirmed: true },
          { reason: "x".repeat(1001), confirmed: true },
          { reason: CLOSURE_REASON, confirmed: false },
          { reason: CLOSURE_REASON, confirmed: "true" },
          { reason: CLOSURE_REASON, confirmed: true, force: true },
          { reason: 12, confirmed: true },
        ])
          await refuseAction(f, f.presenter, { ...close, payload }, "VT007");
        assert.equal(
          (await f.readStaffCase(caseId)).stage,
          "preparation_ready",
        );
        await f.act(f.presenter, caseId, f.sam, "CLOSE_CASE", {
          reason: "x".repeat(1000),
          confirmed: true,
        });
        const staff = await f.readStaffCase(caseId);
        assert.equal(staff.stage, "closed");
        assert.equal(staff.internalHistory.at(-1).detail.reason.length, 1000);
      },
    );
    await t.test(
      "only an admin presenter closes, and only before approval",
      async () => {
        const caseId = await f.readyCase();
        const payload = { reason: CLOSURE_REASON, confirmed: true };
        const close = { caseId, revision: 3, type: "CLOSE_CASE", payload };
        for (const personId of [f.alex, f.morgan, null, f.foreignPeople.sam])
          await refuseAction(f, f.presenter, { ...close, personId }, "VT001");
        await refuseAction(f, f.applicantA, { ...close }, "VT001");
        await refuseAction(
          f,
          f.applicantA,
          { ...close, personId: f.sam },
          "VT001",
        );
        await refuseAction(f, f.applicantB, { ...close }, "VT002");
        // A client's own draft is the client's alone, so it is not closable.
        const draft = await f.createCase(f.applicantA, crypto.randomUUID(), {
          answers: makeSampleAnswers(),
        });
        await refuseAction(
          f,
          f.presenter,
          { ...close, caseId: draft.caseId, revision: 1, personId: f.sam },
          "VT002",
        );
        // An assisted draft, a received case and preparation-ready work close.
        const assisted = await f.createCase(f.presenter, crypto.randomUUID(), {
          mode: "assisted",
          personId: f.sam,
          answers: makeSampleAnswers(),
        });
        const received = await f.createCase(f.applicantA, crypto.randomUUID(), {
          answers: makeSampleAnswers(),
        });
        await f.act(f.applicantA, received.caseId, null, "SUBMIT", {
          confirmed: true,
        });
        for (const id of [assisted.caseId, received.caseId, caseId]) {
          await f.act(f.presenter, id, f.sam, "CLOSE_CASE", payload);
          assert.equal((await f.readStaffCase(id)).stage, "closed");
        }
        // review_approved cannot be reached until Task 4 adds the review
        // actions; its rejection is asserted there.
      },
    );
  } finally {
    await f.close();
  }
});
