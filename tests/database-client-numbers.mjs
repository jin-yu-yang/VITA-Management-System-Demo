import test from "node:test";
import assert from "node:assert/strict";
import {
  createDatabaseFixture,
  applyArgs,
  rejected,
} from "./support/database-fixture.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";

// Part 2 (docs/superpowers/specs/2026-09-29-client-numbers-design.md §6).
// Every subtest shares one workspace, so each one reads the counter first and
// compares against it rather than assuming an absolute number.

const numberOf = async (f, caseId) =>
  (
    await f.sql("select season,client_number from public.cases where id=$1", [
      caseId,
    ])
  ).rows[0];
const counter = async (f, season = 2025, workspaceId = f.workspaceId) =>
  (
    await f.sql(
      "select last_number from vitally_private.client_number_counters where workspace_id=$1 and season=$2",
      [workspaceId, season],
    )
  ).rows[0]?.last_number ?? 0;
const submittedCase = async (f, actor = f.applicantA) => {
  const created = await f.createCase(actor, crypto.randomUUID(), {
    answers: {},
  });
  await f.act(actor, created.caseId, null, "SAVE_ANSWERS", {
    answers: makeSampleAnswers(),
  });
  await f.act(actor, created.caseId, null, "SUBMIT", { confirmed: true });
  return created.caseId;
};
const revisionOf = async (f, caseId) =>
  Number(
    (await f.sql("select revision from public.cases where id=$1", [caseId]))
      .rows[0].revision,
  );
const sampleNumbers = async (f) =>
  (
    await f.sql(
      "select fixture_key,client_number from public.cases where workspace_id=$1 and fixture order by client_number",
      [f.workspaceId],
    )
  ).rows;
// A raw case row, inserted as the owner so no trigger or action numbers it.
const rawCase = async (f, workspaceId, fields) =>
  (
    await f.sql(
      `insert into public.cases(reference,workspace_id,owner_user_id,fixture,fixture_key,origin,
        created_by_user_id,created_by_person_id,answers,stage,revision,preparation_version,intake_verified)
       values(vitally_private.new_reference(),$1,null,$2,$3,$4,$5,$6,'{}'::jsonb,$7,1,0,false)
       returning id`,
      [
        workspaceId,
        fields.fixture ?? false,
        fields.fixtureKey ?? null,
        fields.origin,
        fields.createdByUserId,
        fields.createdByPersonId ?? null,
        fields.stage,
      ],
    )
  ).rows[0].id;
const rawSubmit = (f, workspaceId, caseId, at) =>
  f.sql(
    "insert into public.case_events(workspace_id,case_id,action,detail,created_at) values($1,$2,'SUBMIT','{}'::jsonb,$3)",
    [workspaceId, caseId, at],
  );

test("client numbers are assigned on submit, per season, and never reused", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await t.test("submitting assigns the next number", async () => {
      const created = await f.createCase(f.applicantA, crypto.randomUUID(), {
        answers: {},
      });
      assert.deepEqual(await numberOf(f, created.caseId), {
        season: null,
        client_number: null,
      });
      const before = await counter(f);
      await f.act(f.applicantA, created.caseId, null, "SAVE_ANSWERS", {
        answers: makeSampleAnswers(),
      });
      await f.act(f.applicantA, created.caseId, null, "SUBMIT", {
        confirmed: true,
      });
      assert.deepEqual(await numberOf(f, created.caseId), {
        season: 2025,
        client_number: before + 1,
      });
      assert.equal(await counter(f), before + 1);
      const [event] = (
        await f.sql(
          "select detail from public.case_events where case_id=$1 and action='SUBMIT'",
          [created.caseId],
        )
      ).rows;
      assert.equal(event.detail.clientNumber, before + 1);
      assert.equal(event.detail.screening, "continue");
    });

    await t.test("an assisted submit takes the next number", async () => {
      const previous = await submittedCase(f);
      const created = await f.createCase(f.presenter, crypto.randomUUID(), {
        mode: "assisted",
        personId: f.sam,
        answers: makeSampleAnswers(),
      });
      await f.act(f.presenter, created.caseId, f.sam, "SUBMIT", {
        confirmed: true,
      });
      const { client_number: previousNumber } = await numberOf(f, previous);
      assert.deepEqual(await numberOf(f, created.caseId), {
        season: 2025,
        client_number: previousNumber + 1,
      });
    });

    await t.test("a refused submit assigns nothing", async () => {
      const incomplete = await f.createCase(
        f.applicantA,
        crypto.randomUUID(),
        { answers: {} },
      );
      const before = await counter(f);
      await assert.rejects(
        f.act(f.applicantA, incomplete.caseId, null, "SUBMIT", {
          confirmed: true,
        }),
        rejected("VALIDATION"),
      );
      assert.equal((await numberOf(f, incomplete.caseId)).client_number, null);
      assert.equal(await counter(f), before);

      // A complete draft sent at an old revision stops at the conflict check.
      const complete = await f.createCase(f.applicantA, crypto.randomUUID(), {
        answers: {},
      });
      await f.act(f.applicantA, complete.caseId, null, "SAVE_ANSWERS", {
        answers: makeSampleAnswers(),
      });
      const stale = await f.applicantA.rpc(
        "vitally_apply_action",
        applyArgs({
          caseId: complete.caseId,
          revision: (await revisionOf(f, complete.caseId)) - 1,
          type: "SUBMIT",
          payload: { confirmed: true },
        }),
      );
      assert.equal(stale.error.code, "VT003");
      assert.equal((await numberOf(f, complete.caseId)).client_number, null);
      assert.equal(await counter(f), before);
    });

    await t.test(
      "closing an assisted draft without sending assigns nothing",
      async () => {
        const created = await f.createCase(f.presenter, crypto.randomUUID(), {
          mode: "assisted",
          personId: f.sam,
          answers: makeSampleAnswers(),
        });
        const before = await counter(f);
        await f.act(f.presenter, created.caseId, f.sam, "CLOSE_CASE", {
          reason: "The client decided to file elsewhere.",
          confirmed: true,
        });
        const [row] = (
          await f.sql(
            "select stage,season,client_number from public.cases where id=$1",
            [created.caseId],
          )
        ).rows;
        assert.deepEqual(row, {
          stage: "closed",
          season: null,
          client_number: null,
        });
        assert.equal(await counter(f), before);
      },
    );

    await t.test(
      "concurrent submits get distinct consecutive numbers",
      async () => {
        const drafts = [];
        for (const actor of [f.applicantA, f.applicantB]) {
          const created = await f.createCase(actor, crypto.randomUUID(), {
            answers: {},
          });
          await f.act(actor, created.caseId, null, "SAVE_ANSWERS", {
            answers: makeSampleAnswers(),
          });
          drafts.push([actor, created.caseId]);
        }
        const before = await counter(f);
        await Promise.all(
          drafts.map(([actor, caseId]) =>
            f.act(actor, caseId, null, "SUBMIT", { confirmed: true }),
          ),
        );
        const numbers = [];
        for (const [, caseId] of drafts)
          numbers.push((await numberOf(f, caseId)).client_number);
        assert.deepEqual(numbers.toSorted((a, b) => a - b), [
          before + 1,
          before + 2,
        ]);
        assert.equal(await counter(f), before + 2);
      },
    );

    await t.test("a sample reset never reuses a number", async () => {
      await f.seedFixtures();
      const first = await sampleNumbers(f);
      assert.equal(first.length, 6);
      first.forEach((row, index) =>
        assert.equal(row.client_number, first[0].client_number + index),
      );
      assert.deepEqual(
        first.map((row) => row.fixture_key),
        [...f.fixtureKeys],
      );
      await f.seedFixtures();
      const second = await sampleNumbers(f);
      assert.equal(second.length, 6);
      const firstMax = Math.max(...first.map((row) => row.client_number));
      for (const row of second) assert.ok(row.client_number > firstMax);
      const secondMax = Math.max(...second.map((row) => row.client_number));
      const classCase = await submittedCase(f);
      assert.ok((await numberOf(f, classCase)).client_number > secondMax);
    });

    await t.test("a checkpoint keeps the sample's number", async () => {
      const [sample] = (
        await f.sql(
          "select id,revision,client_number from public.cases where workspace_id=$1 and fixture and fixture_key='review_approved'",
          [f.workspaceId],
        )
      ).rows;
      assert.notEqual(sample.client_number, null);
      const answered = await f.presenter.rpc("vitally_load_checkpoint", {
        p_action_id: crypto.randomUUID(),
        p_case_id: sample.id,
        p_expected_revision: Number(sample.revision),
        p_checkpoint: "corrections_required",
      });
      assert.equal(answered.error, null);
      const after = await numberOf(f, sample.id);
      assert.deepEqual(after, { season: 2025, client_number: sample.client_number });
    });

    await t.test("a season change restarts at 1", async () => {
      const old = await submittedCase(f);
      const oldNumber = await numberOf(f, old);
      try {
        await f.sql(
          "update public.workspaces set current_season=2026 where id=$1",
          [f.workspaceId],
        );
        const next = await submittedCase(f);
        assert.deepEqual(await numberOf(f, next), {
          season: 2026,
          client_number: 1,
        });
        assert.deepEqual(await numberOf(f, old), oldNumber);
        assert.equal(oldNumber.season, 2025);
      } finally {
        await f.sql(
          "update public.workspaces set current_season=2025 where id=$1",
          [f.workspaceId],
        );
      }
    });

    await t.test("numbers never change", async () => {
      const caseId = await submittedCase(f);
      const set = await numberOf(f, caseId);
      await assert.rejects(
        f.sql(
          "update public.cases set client_number=client_number+100 where id=$1",
          [caseId],
        ),
        rejected("VALIDATION"),
      );
      await assert.rejects(
        f.sql(
          "update public.cases set client_number=null,season=null where id=$1",
          [caseId],
        ),
        rejected("VALIDATION"),
      );
      await assert.rejects(
        f.sql("update public.cases set season=2024 where id=$1", [caseId]),
        rejected("VALIDATION"),
      );
      assert.deepEqual(await numberOf(f, caseId), set);
    });

    await t.test("the counter is private", async () => {
      for (const role of ["anon", "authenticated", "service_role"]) {
        const [row] = (
          await f.sql(
            `select has_table_privilege($1,'vitally_private.client_number_counters','select') as can_select,
               has_table_privilege($1,'vitally_private.client_number_counters','update') as can_update,
               has_function_privilege($1,'vitally_private.next_client_number(uuid)','execute') as can_execute`,
            [role],
          )
        ).rows;
        assert.deepEqual(
          row,
          { can_select: false, can_update: false, can_execute: false },
          role,
        );
      }
    });

    await t.test(
      "the backfill numbers submitted cases only, in submit order",
      async () => {
        const before = await counter(f);
        const assisted = {
          origin: "assisted",
          createdByUserId: f.presenterUserId,
          createdByPersonId: f.sam,
        };
        const later = await rawCase(f, f.workspaceId, {
          ...assisted,
          stage: "received",
        });
        await rawSubmit(f, f.workspaceId, later, "2025-02-03T10:00:00Z");
        const earlier = await rawCase(f, f.workspaceId, {
          ...assisted,
          stage: "received",
        });
        await rawSubmit(f, f.workspaceId, earlier, "2025-02-03T09:00:00Z");
        const neverSent = await rawCase(f, f.workspaceId, {
          ...assisted,
          stage: "closed",
        });
        for (const id of [later, earlier, neverSent])
          assert.equal((await numberOf(f, id)).client_number, null);
        const [{ numbered }] = (
          await f.sql(
            "select vitally_private.backfill_client_numbers($1) as numbered",
            [f.workspaceId],
          )
        ).rows;
        assert.equal(numbered, 2);
        assert.deepEqual(await numberOf(f, earlier), {
          season: 2025,
          client_number: before + 1,
        });
        assert.deepEqual(await numberOf(f, later), {
          season: 2025,
          client_number: before + 2,
        });
        assert.deepEqual(await numberOf(f, neverSent), {
          season: null,
          client_number: null,
        });
        assert.equal(await counter(f), before + 2);

        // Samples go in fixture_keys() order, whatever their SUBMIT times.
        // The foreign workspace has no seeded samples, so its keys are free.
        const foreign = f.foreignWorkspaceId;
        const foreignBefore = await counter(f, 2025, foreign);
        const sample = {
          fixture: true,
          origin: "fixture",
          createdByUserId: f.outsiderUserId,
        };
        const reviewReady = await rawCase(f, foreign, {
          ...sample,
          fixtureKey: "review_ready",
          stage: "review_ready",
        });
        await rawSubmit(f, foreign, reviewReady, "2025-02-03T08:00:00Z");
        const preparationReady = await rawCase(f, foreign, {
          ...sample,
          fixtureKey: "preparation_ready",
          stage: "preparation_ready",
        });
        await rawSubmit(f, foreign, preparationReady, "2025-02-03T11:00:00Z");
        const [{ samples }] = (
          await f.sql(
            "select vitally_private.backfill_client_numbers($1) as samples",
            [foreign],
          )
        ).rows;
        assert.equal(samples, 2);
        assert.equal(
          (await numberOf(f, preparationReady)).client_number,
          foreignBefore + 1,
        );
        assert.equal(
          (await numberOf(f, reviewReady)).client_number,
          foreignBefore + 2,
        );
        // The other workspace's counter did not move.
        assert.equal(await counter(f), before + 2);
      },
    );

    await t.test("an applicant reads their own number", async () => {
      const caseId = await submittedCase(f);
      const { client_number } = await numberOf(f, caseId);
      const own = await f.applicantA
        .from("cases")
        .select("client_number")
        .eq("id", caseId);
      assert.equal(own.error, null);
      assert.deepEqual(own.data, [{ client_number }]);
      const other = await f.applicantB
        .from("cases")
        .select("client_number")
        .eq("id", caseId);
      assert.equal(other.error, null);
      assert.deepEqual(other.data, []);
    });
  } finally {
    await f.close();
  }
});
