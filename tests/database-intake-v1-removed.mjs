import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabaseFixture } from "./support/database-fixture.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";

// Migration 023 (OpenSpec change remove-intake-v1, spec client-intake): version 2
// is the only intake version. The guard and the cleanup run once, inside the
// migration, so their rule is tested here through its two pure predicates.

const rejects = (promise, code) => assert.rejects(promise, (error) => error.code === code);

test("the guard's and the cleanup's rule, as plain values", async (t) => {
  const f = await createDatabaseFixture();
  try {
    const rule = async (fn, version, fixture, inTest) =>
      (await f.sql(`select vitally_private.${fn}($1::smallint,$2,$3) as r`, [version, fixture, inTest])).rows[0].r;
    // version, sample, in a test workspace -> blocks, disposable
    const table = [
      [1, false, false, true, false],
      [1, true, false, false, true],
      [1, false, true, false, true],
      [1, true, true, false, true],
      [2, false, false, false, false],
      [2, true, false, false, false],
      [2, false, true, false, false],
      [2, true, true, false, false],
    ];
    for (const [version, fixture, inTest, blocks, disposable] of table) {
      await t.test(`version ${version}, sample ${fixture}, test workspace ${inTest}`, async () => {
        assert.equal(await rule("version_one_blocks", version, fixture, inTest), blocks);
        assert.equal(await rule("version_one_disposable", version, fixture, inTest), disposable);
      });
    }
    await t.test("no version-1 application blocks the migrated database", async () => {
      assert.equal(Number((await f.sql("select vitally_private.version_one_blockers() as n")).rows[0].n), 0);
    });
    await t.test("the new private functions are not executable by clients", async () => {
      for (const signature of [
        "vitally_private.version_one_blocks(smallint,boolean,boolean)",
        "vitally_private.version_one_disposable(smallint,boolean,boolean)",
        "vitally_private.version_one_blockers()",
      ])
        for (const role of ["anon", "authenticated"]) {
          const { rows } = await f.sql("select has_function_privilege($1, $2::regprocedure, 'execute') as ok", [role, signature]);
          assert.equal(rows[0].ok, false, `${role} on ${signature}`);
        }
    });
  } finally {
    await f.close();
  }
});

test("version 2 is the only accepted version", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await t.test("neither version column keeps a default of 1", async () => {
      const { rows } = await f.sql(
        "select table_name, column_default from information_schema.columns where table_schema='public' and ((table_name='cases' and column_name='intake_version') or (table_name='workspaces' and column_name='default_intake_version')) order by 1",
      );
      assert.deepEqual(rows.map((r) => [r.table_name, String(r.column_default).trim()]), [["cases", "2"], ["workspaces", "2"]]);
    });
    await t.test("a workspace defaults to 2 and can't be set to 1", async () => {
      assert.equal(Number((await f.sql("select default_intake_version v from public.workspaces where id=$1", [f.workspaceId])).rows[0].v), 2);
      await rejects(f.sql("update public.workspaces set default_intake_version=1 where id=$1", [f.workspaceId]), "23514");
    });
    await t.test("a client's and the office's new applications are version 2", async () => {
      const own = await f.createCase(f.applicantA, randomUUID(), { answers: {} });
      const office = await f.createCase(f.presenter, randomUUID(), { mode: "assisted", personId: f.sam, answers: {} });
      for (const { caseId } of [own, office])
        assert.equal(Number((await f.sql("select intake_version v from public.cases where id=$1", [caseId])).rows[0].v), 2);
    });
    await t.test("a create that carries answers is refused", async () => {
      await assert.rejects(f.createCase(f.applicantA, randomUUID(), { answers: { tp_first: "Mei" } }));
    });
    await t.test("an application's version never changes", async () => {
      const { caseId } = await f.draftCase(f.applicantA);
      await f.act(f.applicantA, caseId, null, "SAVE_ANSWERS", { answers: makeSampleAnswers({ seed: 1 }) });
      assert.equal(Number((await f.sql("select intake_version v from public.cases where id=$1", [caseId])).rows[0].v), 2);
      await assert.rejects(f.sql("update public.cases set intake_version=1 where id=$1", [caseId]));
    });
    await t.test("the version-1-only functions are gone", async () => {
      for (const name of ["intake_answer_keys", "fixture_answers"])
        assert.equal(
          (await f.sql("select count(*) n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='vitally_private' and p.proname=$1", [name])).rows[0].n,
          "0",
          name,
        );
    });
    await t.test("a reset seeds six version-2 samples whose submit history has no screening detail", async () => {
      await f.seedFixtures();
      const { rows } = await f.sql("select id, intake_version from public.cases where workspace_id=$1 and fixture", [f.workspaceId]);
      assert.equal(rows.length, 6);
      for (const row of rows) assert.equal(Number(row.intake_version), 2);
      const { rows: events } = await f.sql(
        "select detail from public.case_events where workspace_id=$1 and action='SUBMIT' and case_id = any($2::uuid[])",
        [f.workspaceId, rows.map((r) => r.id)],
      );
      for (const event of events) assert.equal(event.detail?.screening, undefined);
    });
  } finally {
    await f.close();
  }
});
