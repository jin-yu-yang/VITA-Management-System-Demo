import test from "node:test";
import assert from "node:assert/strict";
import {
  createDatabaseFixture,
  applyArgs,
  rejected,
} from "./support/database-fixture.mjs";
import { RPC_SIGNATURES } from "./support/rpc-signatures.mjs";
import { REFERENCE_PATTERN } from "../src/contracts.mjs";
import { INTAKE_ANSWER_KEYS } from "../src/domain.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";
// The denial Task 2 already asserts for anonymous table and function access.
const ANONYMOUS_DENIAL = "42501";
const caseRow = async (f, caseId) =>
  (await f.sql("select * from public.cases where id=$1", [caseId])).rows[0];
const revisionOf = async (f, caseId) =>
  Number((await caseRow(f, caseId)).revision);
const actions = async (f, table, caseId) =>
  (
    await f.sql(
      `select action from public.${table} where case_id=$1 order by created_at,id`,
      [caseId],
    )
  ).rows.map((row) => row.action);
const participantsOf = async (f, caseId) =>
  Number(
    (
      await f.sql(
        "select count(*) as count from public.preparation_participants where case_id=$1",
        [caseId],
      )
    ).rows[0].count,
  );
async function draftCase(f, answers = makeSampleAnswers()) {
  const created = await f.createCase(f.applicantA, crypto.randomUUID(), {
    answers,
  });
  return created;
}
async function submittedCase(f) {
  const created = await draftCase(f);
  await f.act(f.applicantA, created.caseId, null, "SUBMIT", {
    confirmed: true,
  });
  return created.caseId;
}

test("case actions apply the shared check order against real Supabase", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await t.test(
      "one case is saved, submitted, verified and claimed through public actions",
      async () => {
        const created = await f.createCase(f.applicantA, crypto.randomUUID(), {
          answers: {},
        });
        const saved = await f.act(
          f.applicantA,
          created.caseId,
          null,
          "SAVE_ANSWERS",
          { answers: makeSampleAnswers() },
        );
        assert.deepEqual(saved, {
          actionId: saved.actionId,
          caseId: created.caseId,
          reference: created.reference,
          revision: 2,
        });
        const patched = await f.act(
          f.applicantA,
          created.caseId,
          null,
          "SAVE_ANSWERS",
          { answers: { city: "Pittsburgh" } },
        );
        assert.equal(patched.revision, 3);
        const draft = await caseRow(f, created.caseId);
        assert.equal(draft.stage, "draft");
        assert.equal(draft.answers.city, "Pittsburgh");
        assert.equal(draft.answers.firstName, makeSampleAnswers().firstName);
        // A private draft produces internal history only.
        assert.deepEqual(await actions(f, "client_events", created.caseId), []);
        assert.deepEqual(await actions(f, "case_events", created.caseId), [
          "SAVE_ANSWERS",
          "SAVE_ANSWERS",
        ]);
        const [first] = (
          await f.sql(
            "select * from public.case_events where case_id=$1 order by created_at,id",
            [created.caseId],
          )
        ).rows;
        assert.equal(first.actor_user_id, f.applicantAUserId);
        assert.equal(first.actor_person_id, null);
        assert.deepEqual(first.detail, {
          fields: [...INTAKE_ANSWER_KEYS].sort(),
        });
        const submitted = await f.act(
          f.applicantA,
          created.caseId,
          null,
          "SUBMIT",
          { confirmed: true },
        );
        assert.equal(submitted.revision, 4);
        assert.equal((await caseRow(f, created.caseId)).stage, "received");
        const verified = await f.act(
          f.presenter,
          created.caseId,
          f.sam,
          "VERIFY_INTAKE",
          { checks: f.intakeChecks },
        );
        assert.equal(verified.revision, 5);
        assert.equal(
          (await f.readStaffCase(created.caseId)).stage,
          "preparation_ready",
        );
        const claimed = await f.act(
          f.presenter,
          created.caseId,
          f.alex,
          "CLAIM_PREPARATION",
          {},
        );
        assert.equal(claimed.revision, 6);
        const staff = await f.readStaffCase(created.caseId);
        assert.equal(staff.id, created.caseId);
        assert.equal(staff.reference, created.reference);
        assert.equal(staff.workspaceId, f.workspaceId);
        assert.equal(staff.ownerUserId, f.applicantAUserId);
        assert.equal(staff.fixture, false);
        assert.equal(staff.stage, "preparing");
        assert.equal(staff.revision, 6);
        assert.equal(staff.preparationVersion, 0);
        assert.equal(staff.intakeVerified, true);
        assert.equal(staff.preparerId, f.alex);
        assert.equal(staff.reviewerId, null);
        assert.deepEqual(staff.participants, [f.alex]);
        assert.deepEqual(staff.requests, []);
        assert.deepEqual(staff.documents, []);
        assert.deepEqual(staff.followups, []);
        assert.deepEqual(
          staff.history.map((entry) => entry.action),
          ["SUBMIT", "VERIFY_INTAKE", "CLAIM_PREPARATION"],
        );
        assert.deepEqual(
          staff.internalHistory.map((entry) => entry.action),
          [
            "SAVE_ANSWERS",
            "SAVE_ANSWERS",
            "SUBMIT",
            "VERIFY_INTAKE",
            "CLAIM_PREPARATION",
          ],
        );
        // Client progress is plain language with no actor or internal detail.
        for (const entry of staff.history) {
          assert.ok(entry.message.length > 0);
          assert.equal(entry.actorUserId, undefined);
          assert.equal(entry.detail, undefined);
        }
        const intake = staff.internalHistory.find(
          (entry) => entry.action === "VERIFY_INTAKE",
        );
        assert.equal(intake.actorPersonId, f.sam);
        // Demo attestations are labelled simulated, never a real identity check.
        assert.deepEqual(intake.detail, {
          simulated: true,
          checks: { ...f.intakeChecks },
        });
        assert.deepEqual(
          staff.internalHistory.find(
            (entry) => entry.action === "CLAIM_PREPARATION",
          ).detail,
          { preparerPersonId: f.alex },
        );
        const { data: ownProgress } = await f.applicantA
          .from("client_events")
          .select("*")
          .eq("case_id", created.caseId);
        assert.equal(ownProgress.length, 3);
        assert.deepEqual(
          await f.applicantA
            .from("case_events")
            .select("*")
            .eq("case_id", created.caseId)
            .then((response) => response.data),
          [],
        );
      },
    );
    await t.test(
      "two simultaneous claims at one revision leave a single winner",
      async () => {
        const caseId = await f.readyCase();
        const { revision } = await f.readStaffCase(caseId);
        const attempts = [crypto.randomUUID(), crypto.randomUUID()];
        const results = await Promise.all(
          attempts.map((actionId) =>
            f.presenter.rpc(
              "vitally_apply_action",
              applyArgs({
                actionId,
                caseId,
                revision,
                personId: f.alex,
                type: "CLAIM_PREPARATION",
              }),
            ),
          ),
        );
        const won = results.filter((result) => !result.error);
        const lost = results.filter((result) => result.error);
        assert.equal(won.length, 1);
        assert.equal(lost.length, 1);
        assert.equal(lost[0].error.code, "VT003");
        assert.equal(won[0].data.revision, revision + 1);
        assert.deepEqual(
          (
            await f.sql(
              "select person_id from public.preparation_participants where case_id=$1",
              [caseId],
            )
          ).rows,
          [{ person_id: f.alex }],
        );
        assert.deepEqual(await actions(f, "case_events", caseId), [
          "SUBMIT",
          "VERIFY_INTAKE",
          "CLAIM_PREPARATION",
        ]);
        assert.equal(
          await f.receiptsFor(attempts[results.indexOf(lost[0])]),
          0,
        );
        assert.equal((await caseRow(f, caseId)).stage, "preparing");
      },
    );
    await t.test(
      "an identical envelope replays one receipt; a changed one is a validation error",
      async () => {
        const caseId = await f.readyCase();
        const { revision } = await f.readStaffCase(caseId);
        const args = applyArgs({
          caseId,
          revision,
          personId: f.alex,
          type: "CLAIM_PREPARATION",
        });
        const first = await f.presenter.rpc("vitally_apply_action", args);
        assert.equal(first.error, null);
        const replay = await f.presenter.rpc("vitally_apply_action", args);
        assert.equal(replay.error, null);
        assert.deepEqual(replay.data, first.data);
        for (const changed of [
          { ...args, p_payload: { note: "different" } },
          { ...args, p_expected_revision: revision + 1 },
          { ...args, p_person_id: f.sam },
          { ...args, p_type: "SAVE_ANSWERS", p_payload: { answers: {} } },
        ]) {
          const response = await f.presenter.rpc(
            "vitally_apply_action",
            changed,
          );
          assert.equal(response.error.code, "VT007");
        }
        assert.equal(await participantsOf(f, caseId), 1);
        assert.deepEqual(await actions(f, "case_events", caseId), [
          "SUBMIT",
          "VERIFY_INTAKE",
          "CLAIM_PREPARATION",
        ]);
        assert.equal(await revisionOf(f, caseId), revision + 1);
      },
    );
    await t.test(
      "an accepted replay re-checks current membership and operation authority",
      async () => {
        const submitted = await draftCase(f);
        const caseId = submitted.caseId;
        await f.act(f.applicantA, caseId, null, "SUBMIT", { confirmed: true });
        const verify = applyArgs({
          caseId,
          revision: 2,
          personId: f.sam,
          type: "VERIFY_INTAKE",
          payload: { checks: f.intakeChecks },
        });
        const accepted = await f.presenter.rpc("vitally_apply_action", verify);
        assert.equal(accepted.error, null);
        const replay = await f.presenter.rpc("vitally_apply_action", verify);
        assert.equal(replay.error, null);
        assert.deepEqual(replay.data, accepted.data);
        const receipt = async () =>
          (
            await f.sql(
              "select * from public.action_receipts where action_id=$1",
              [verify.p_action_id],
            )
          ).rows;
        const stored = await receipt();
        const revision = await revisionOf(f, caseId);
        // The capability the action needed is re-checked on every replay.
        await f.sql(
          "update public.people set capabilities=$1 where id=$2",
          [["assist", "followup", "receive_documents"], f.sam],
        );
        try {
          const stripped = await f.presenter.rpc(
            "vitally_apply_action",
            verify,
          );
          assert.equal(stripped.error.code, "VT001");
        } finally {
          await f.sql("update public.people set capabilities=$1 where id=$2", [
            ["admin", "assist", "followup", "receive_documents"],
            f.sam,
          ]);
        }
        // So is the membership the caller acts under.
        await f.sql(
          "update public.memberships set active=false where workspace_id=$1 and user_id=$2",
          [f.workspaceId, f.presenterUserId],
        );
        try {
          const revoked = await f.presenter.rpc(
            "vitally_apply_action",
            verify,
          );
          assert.equal(revoked.error.code, "VT001");
        } finally {
          await f.sql(
            "update public.memberships set active=true where workspace_id=$1 and user_id=$2",
            [f.workspaceId, f.presenterUserId],
          );
        }
        // Neither rejection touched the stored receipt or the case.
        assert.deepEqual(await receipt(), stored);
        assert.equal(await revisionOf(f, caseId), revision);
        // Restored authority replays the same receipt again.
        const restored = await f.presenter.rpc("vitally_apply_action", verify);
        assert.equal(restored.error, null);
        assert.deepEqual(restored.data, accepted.data);
        // The applicant's own accepted envelope follows the same rule.
        const own = await draftCase(f);
        const save = applyArgs({
          caseId: own.caseId,
          revision: 1,
          type: "SAVE_ANSWERS",
          payload: { answers: { city: "Pittsburgh" } },
        });
        assert.equal(
          (await f.applicantA.rpc("vitally_apply_action", save)).error,
          null,
        );
        await f.sql(
          "update public.memberships set active=false where workspace_id=$1 and user_id=$2",
          [f.workspaceId, f.applicantAUserId],
        );
        try {
          const revoked = await f.applicantA.rpc("vitally_apply_action", save);
          assert.equal(revoked.error.code, "VT001");
        } finally {
          await f.sql(
            "update public.memberships set active=true where workspace_id=$1 and user_id=$2",
            [f.workspaceId, f.applicantAUserId],
          );
        }
      },
    );
    await t.test(
      "an accepted replay returns its receipt without reaching the target",
      async () => {
        const created = await draftCase(f);
        const save = applyArgs({
          caseId: created.caseId,
          revision: 1,
          type: "SAVE_ANSWERS",
          payload: { answers: { city: "Pittsburgh" } },
        });
        const accepted = await f.applicantA.rpc("vitally_apply_action", save);
        assert.equal(accepted.error, null);
        // Task 9's fixture reset deletes cases; receipts are historical scalars
        // with no foreign key, so an identical replay must still answer.
        await f.sql("delete from public.cases where id=$1", [created.caseId]);
        const replay = await f.applicantA.rpc("vitally_apply_action", save);
        assert.equal(replay.error, null);
        assert.deepEqual(replay.data, accepted.data);
        // A new action id against the deleted case is NOT_FOUND, as usual.
        const fresh = await f.applicantA.rpc(
          "vitally_apply_action",
          applyArgs({
            caseId: created.caseId,
            revision: 2,
            type: "SAVE_ANSWERS",
            payload: { answers: { city: "Pittsburgh" } },
          }),
        );
        assert.equal(fresh.error.code, "VT002");
      },
    );
    await t.test(
      "absent, other-owner and invisible cases are the same NOT_FOUND",
      async () => {
        const caseId = await f.readyCase();
        const { reference } = await f.readStaffCase(caseId);
        const spec = {
          revision: 1,
          type: "SAVE_ANSWERS",
          payload: { answers: { city: "Pittsburgh" } },
        };
        const attempts = [crypto.randomUUID(), crypto.randomUUID()];
        const other = await f.applicantB.rpc(
          "vitally_apply_action",
          applyArgs({ ...spec, caseId, actionId: attempts[0] }),
        );
        const absent = await f.applicantB.rpc(
          "vitally_apply_action",
          applyArgs({
            ...spec,
            caseId: crypto.randomUUID(),
            actionId: attempts[1],
          }),
        );
        assert.equal(other.error.code, "VT002");
        assert.deepEqual(other.error, absent.error);
        assert.ok(!JSON.stringify(other.error).includes(reference));
        assert.ok(!JSON.stringify(other.error).includes(caseId));
        const outsider = await f.outsider.rpc(
          "vitally_apply_action",
          applyArgs({ ...spec, caseId }),
        );
        assert.equal(outsider.error.code, "VT002");
        // A presenter cannot reach a private client draft either.
        const draft = await draftCase(f);
        const hidden = await f.presenter.rpc(
          "vitally_apply_action",
          applyArgs({
            ...spec,
            caseId: draft.caseId,
            personId: f.sam,
          }),
        );
        assert.equal(hidden.error.code, "VT002");
        await assert.rejects(
          () =>
            f.act(f.applicantB, caseId, null, "SAVE_ANSWERS", {
              answers: { city: "Pittsburgh" },
            }),
          rejected("NOT_FOUND"),
        );
        await assert.rejects(
          () =>
            f.act(f.applicantA, crypto.randomUUID(), null, "SAVE_ANSWERS", {
              answers: { city: "Pittsburgh" },
            }),
          rejected("NOT_FOUND"),
        );
        for (const actionId of attempts)
          assert.equal(await f.receiptsFor(actionId), 0);
        // Membership is checked before any target, so an unapproved caller
        // cannot tell an absent case from one they may not see.
        const unapproved = await f.unapproved.rpc(
          "vitally_apply_action",
          applyArgs({ ...spec, caseId }),
        );
        assert.equal(unapproved.error.code, "VT001");
      },
    );
    await t.test(
      "forged staff identity, missing capability and foreign people are forbidden",
      async () => {
        const draft = await draftCase(f);
        const forged = await f.applicantA.rpc(
          "vitally_apply_action",
          applyArgs({
            caseId: draft.caseId,
            revision: 1,
            personId: f.sam,
            type: "SAVE_ANSWERS",
            payload: { answers: { city: "Pittsburgh" } },
          }),
        );
        assert.equal(forged.error.code, "VT001");
        assert.equal(await revisionOf(f, draft.caseId), 1);
        const received = await submittedCase(f);
        for (const personId of [f.alex, f.morgan, null, f.foreignPeople.sam])
          await assert.rejects(
            () =>
              f.act(f.presenter, received, personId, "VERIFY_INTAKE", {
                checks: f.intakeChecks,
              }),
            rejected("FORBIDDEN"),
          );
        await assert.rejects(
          () =>
            f.act(f.applicantA, received, null, "VERIFY_INTAKE", {
              checks: f.intakeChecks,
            }),
          rejected("FORBIDDEN"),
        );
        // Positive control: the same action succeeds for an admin-capable person.
        await f.act(f.presenter, received, f.sam, "VERIFY_INTAKE", {
          checks: f.intakeChecks,
        });
        // Step 4 lets any same-workspace person attempt a claim; step 7 does not.
        for (const personId of [f.sam, f.morgan])
          await assert.rejects(
            () => f.act(f.presenter, received, personId, "CLAIM_PREPARATION", {}),
            rejected("INELIGIBLE"),
          );
        assert.equal((await caseRow(f, received)).stage, "preparation_ready");
        assert.equal(await participantsOf(f, received), 0);
        await f.act(f.presenter, received, f.alex, "CLAIM_PREPARATION", {});
        assert.equal((await caseRow(f, received)).preparer_id, f.alex);
      },
    );
    await t.test(
      "an admin presenter owns an assisted intake, never a client's own case",
      async () => {
        const assisted = await f.createCase(f.presenter, crypto.randomUUID(), {
          mode: "assisted",
          personId: f.sam,
          answers: {},
        });
        // Alex cannot assist without the admin capability, and a presenter
        // acting with no person at all is making a client's request.
        for (const personId of [f.alex, f.morgan, null])
          await assert.rejects(
            () =>
              f.act(f.presenter, assisted.caseId, personId, "SAVE_ANSWERS", {
                answers: makeSampleAnswers(),
              }),
            rejected("FORBIDDEN"),
          );
        await assert.rejects(
          () =>
            f.act(f.applicantA, assisted.caseId, null, "SAVE_ANSWERS", {
              answers: makeSampleAnswers(),
            }),
          rejected("NOT_FOUND"),
        );
        const saved = await f.act(
          f.presenter,
          assisted.caseId,
          f.sam,
          "SAVE_ANSWERS",
          { answers: makeSampleAnswers() },
        );
        assert.equal(saved.revision, 2);
        await f.act(f.presenter, assisted.caseId, f.sam, "SUBMIT", {
          confirmed: true,
        });
        const staff = await f.readStaffCase(assisted.caseId);
        assert.equal(staff.stage, "received");
        assert.equal(staff.ownerUserId, null);
        assert.deepEqual(
          staff.internalHistory.map((entry) => [
            entry.action,
            entry.actorPersonId,
          ]),
          [
            ["SAVE_ANSWERS", f.sam],
            ["SUBMIT", f.sam],
          ],
        );
        // A client-owned case stays the client's to answer, at any stage.
        const owned = await submittedCase(f);
        await assert.rejects(
          () =>
            f.act(f.presenter, owned, f.sam, "SAVE_ANSWERS", {
              answers: { city: "Pittsburgh" },
            }),
          rejected("FORBIDDEN"),
        );
      },
    );
    await t.test(
      "revision conflicts precede stage, and stage precedes qualification",
      async () => {
        const caseId = await f.readyCase();
        const ready = await f.readStaffCase(caseId);
        // Authority answers before the revision: the owner forging a staff
        // person at a stale revision is still FORBIDDEN, not a conflict.
        const forged = await f.applicantA.rpc(
          "vitally_apply_action",
          applyArgs({
            caseId,
            revision: ready.revision - 1,
            personId: f.sam,
            type: "SUBMIT",
            payload: { confirmed: true },
          }),
        );
        assert.equal(forged.error.code, "VT001");
        // Sam would be INELIGIBLE at step 7, but a stale revision stops at step 5.
        const stale = await f.presenter.rpc(
          "vitally_apply_action",
          applyArgs({
            caseId,
            revision: ready.revision - 1,
            personId: f.sam,
            type: "CLAIM_PREPARATION",
          }),
        );
        assert.equal(stale.error.code, "VT003");
        await f.act(f.presenter, caseId, f.alex, "CLAIM_PREPARATION", {});
        // At the old revision the same attempt still conflicts first.
        const old = await f.presenter.rpc(
          "vitally_apply_action",
          applyArgs({
            caseId,
            revision: ready.revision,
            personId: f.alex,
            type: "CLAIM_PREPARATION",
          }),
        );
        assert.equal(old.error.code, "VT003");
        // At a fresh revision the wrong stage answers before qualification.
        for (const personId of [f.alex, f.sam])
          await assert.rejects(
            () => f.act(f.presenter, caseId, personId, "CLAIM_PREPARATION", {}),
            rejected("INVALID_TRANSITION"),
          );
        for (const [type, payload] of [
          ["SAVE_ANSWERS", { answers: { city: "Pittsburgh" } }],
          ["SUBMIT", { confirmed: true }],
        ])
          await assert.rejects(
            () => f.act(f.applicantA, caseId, null, type, payload),
            rejected("INVALID_TRANSITION"),
          );
        await assert.rejects(
          () =>
            f.act(f.presenter, caseId, f.sam, "VERIFY_INTAKE", {
              checks: f.intakeChecks,
            }),
          rejected("INVALID_TRANSITION"),
        );
      },
    );
    await t.test(
      "payload whitelists and server-side screening reject unsupported answers",
      async () => {
        const draft = await f.createCase(f.applicantA, crypto.randomUUID(), {
          answers: {},
        });
        const caseId = draft.caseId;
        for (const payload of [
          { answers: { notAnAnswer: "x" } },
          { answers: { owner_user_id: f.applicantBUserId } },
          { answers: { city: 42 } },
          { answers: { city: "x".repeat(1001) } },
          { answers: {}, extra: true },
          { notAnswers: {} },
          {},
          { answers: "Pittsburgh" },
        ])
          await assert.rejects(
            () => f.act(f.applicantA, caseId, null, "SAVE_ANSWERS", payload),
            rejected("VALIDATION"),
          );
        // Unknown and not-yet-implemented actions never reach a handler.
        // REQUEST_DOCUMENT moved to tests/database-documents.mjs with 004.
        for (const type of ["BOGUS", "CLAIM_REVIEW"])
          await assert.rejects(
            () => f.act(f.applicantA, caseId, null, type, {}),
            rejected("VALIDATION"),
          );
        assert.equal(await revisionOf(f, caseId), 1);
        // SUBMIT re-checks the saved answers; an empty draft cannot submit.
        await assert.rejects(
          () => f.act(f.applicantA, caseId, null, "SUBMIT", { confirmed: true }),
          rejected("VALIDATION"),
        );
        for (const payload of [
          { confirmed: false },
          {},
          { confirmed: true, extra: 1 },
        ])
          await assert.rejects(
            () => f.act(f.applicantA, caseId, null, "SUBMIT", payload),
            rejected("VALIDATION"),
          );
        for (const patch of [
          { other: "yes" },
          { stocks: "yes" },
          { rideshare: "unsure" },
          { rideshare: "" },
          { year: "2024" },
          { residenceState: "Other" },
          { helper: "volunteer" },
          { firstName: "   " },
        ]) {
          await f.act(f.applicantA, caseId, null, "SAVE_ANSWERS", {
            answers: makeSampleAnswers(),
          });
          await f.act(f.applicantA, caseId, null, "SAVE_ANSWERS", {
            answers: patch,
          });
          await assert.rejects(
            () =>
              f.act(f.applicantA, caseId, null, "SUBMIT", { confirmed: true }),
            rejected("VALIDATION"),
          );
          assert.equal((await caseRow(f, caseId)).stage, "draft");
        }
        // Positive control: complete, supported answers do submit.
        await f.act(f.applicantA, caseId, null, "SAVE_ANSWERS", {
          answers: makeSampleAnswers(),
        });
        await f.act(f.applicantA, caseId, null, "SUBMIT", { confirmed: true });
        assert.equal((await caseRow(f, caseId)).stage, "received");
        for (const payload of [
          {},
          { checks: { interview: true, identity: true, documents: true } },
          {
            checks: {
              interview: true,
              identity: true,
              documents: true,
              consent: false,
            },
          },
          { checks: { ...f.intakeChecks, extra: true } },
          { checks: f.intakeChecks, extra: 1 },
        ])
          await assert.rejects(
            () => f.act(f.presenter, caseId, f.sam, "VERIFY_INTAKE", payload),
            rejected("VALIDATION"),
          );
        await f.act(f.presenter, caseId, f.sam, "VERIFY_INTAKE", {
          checks: f.intakeChecks,
        });
        await assert.rejects(
          () =>
            f.act(f.presenter, caseId, f.alex, "CLAIM_PREPARATION", {
              force: true,
            }),
          rejected("VALIDATION"),
        );
        await f.act(f.presenter, caseId, f.alex, "CLAIM_PREPARATION", {});
        assert.equal((await caseRow(f, caseId)).stage, "preparing");
      },
    );
    await t.test(
      "rejected actions commit no receipt, event or mutation",
      async () => {
        const caseId = await f.readyCase();
        const { revision } = await f.readStaffCase(caseId);
        const before = await f.stateSnapshot();
        const attempts = [
          [
            f.presenter,
            { caseId, revision, personId: f.sam, type: "CLAIM_PREPARATION" },
            "VT006",
          ],
          [
            f.presenter,
            {
              caseId,
              revision: revision - 1,
              personId: f.alex,
              type: "CLAIM_PREPARATION",
            },
            "VT003",
          ],
          [
            f.applicantA,
            {
              caseId,
              revision,
              type: "SAVE_ANSWERS",
              payload: { answers: { city: "Pittsburgh" } },
            },
            "VT004",
          ],
          [
            f.applicantB,
            {
              caseId,
              revision,
              type: "SUBMIT",
              payload: { confirmed: true },
            },
            "VT002",
          ],
          [
            f.applicantA,
            {
              caseId,
              revision,
              personId: f.sam,
              type: "SUBMIT",
              payload: { confirmed: true },
            },
            "VT001",
          ],
          [
            f.applicantA,
            {
              caseId,
              revision,
              type: "SAVE_ANSWERS",
              payload: { answers: { notAnAnswer: "x" } },
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
          assert.equal(error?.code, code);
          assert.equal(await f.receiptsFor(actionId), 0);
        }
        assert.deepEqual(await f.stateSnapshot(), before);
      },
    );
  } finally {
    await f.close();
  }
});

test("installed entry points deny anonymous callers and serve members", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await t.test(
      "the signature inventory matches the functions the database exposes",
      async () => {
        const installed = (
          await f.sql(
            "select p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes) t),',')||')' as signature,p.proname as name,has_function_privilege('anon',p.oid,'EXECUTE') as anon,has_function_privilege('authenticated',p.oid,'EXECUTE') as browser from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'vitally\\_%' order by p.proname",
          )
        ).rows;
        assert.deepEqual(
          installed.map((row) => row.signature),
          [...RPC_SIGNATURES]
            .map((entry) => entry.signature)
            .sort((a, b) => a.localeCompare(b)),
        );
        for (const row of installed) {
          assert.equal(row.anon, false, `${row.name} anon EXECUTE`);
          assert.equal(row.browser, true, `${row.name} authenticated EXECUTE`);
        }
        // Every implementation helper stays private, definer-run and unreachable.
        const helpers = (
          await f.sql(
            "select p.proname as name,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') as anon,has_function_privilege('authenticated',p.oid,'EXECUTE') as browser,has_function_privilege('service_role',p.oid,'EXECUTE') as service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='vitally_private' order by p.proname",
          )
        ).rows;
        assert.ok(helpers.length >= 14, "private helpers are installed");
        for (const helper of helpers) {
          assert.equal(helper.prosecdef, true, `${helper.name} definer`);
          assert.ok(
            helper.proconfig.includes('search_path=""'),
            `${helper.name} search path`,
          );
          assert.deepEqual(
            { anon: helper.anon, browser: helper.browser, service: helper.service },
            { anon: false, browser: false, service: false },
            `${helper.name} client EXECUTE`,
          );
        }
      },
    );
    await t.test(
      "each entry point rejects the anonymous client and accepts a member",
      async () => {
        for (const entry of RPC_SIGNATURES) {
          const draft = await draftCase(f);
          const seeded = await f.seedAssistance();
          const context = {
            draftCaseId: draft.caseId,
            draftRevision: 1,
            assistanceItemId: seeded.itemId,
            assistanceRevision: 1,
            assistPersonId: f.sam,
          };
          const before = await f.stateSnapshot();
          const denied = await f.anonymous.rpc(entry.name, entry.args(context));
          assert.ok(denied.error, `${entry.name} anonymous call must fail`);
          assert.equal(
            denied.error.code,
            ANONYMOUS_DENIAL,
            `${entry.name} anonymous denial code`,
          );
          assert.deepEqual(await f.stateSnapshot(), before);
          const allowed = await entry
            .authorized(f)
            .rpc(entry.name, entry.args(context));
          assert.equal(
            allowed.error,
            null,
            `${entry.name} member call must succeed`,
          );
          // Each entry answers with its own receipt shape and nothing more.
          assert.deepEqual(
            Object.keys(allowed.data).sort(),
            [...entry.receiptKeys].sort(),
            `${entry.name} receipt keys`,
          );
          if (entry.receiptKeys.includes("reference"))
            assert.match(allowed.data.reference, REFERENCE_PATTERN);
        }
      },
    );
  } finally {
    await f.close();
  }
});
