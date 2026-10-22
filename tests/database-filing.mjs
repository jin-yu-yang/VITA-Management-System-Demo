import test from "node:test";
import assert from "node:assert/strict";
import { createDatabaseFixture, rejected } from "./support/database-fixture.mjs";

// Migration 035: the stages after E-filed (rejected, accepted), the cases'
// filing columns, and the three staff-only filing tables.

test("filing results schema against real Supabase", async (t) => {
  const f = await createDatabaseFixture();
  try {
    const setStage = (caseId, stage) =>
      f.sql("update public.cases set stage=$2 where id=$1", [caseId, stage]);
    const setColumns = (caseId, set) =>
      f.sql(`update public.cases set ${set} where id=$1`, [caseId]);

    await t.test("the stage check accepts rejected and accepted", async () => {
      const { caseId } = await f.submittedClientCase();
      await setStage(caseId, "rejected");
      await setStage(caseId, "accepted");
      await assert.rejects(() => setStage(caseId, "acknowledged"));
    });

    await t.test("method and result constraints", async () => {
      const { caseId } = await f.submittedClientCase();
      for (const set of [
        "federal_method='paper', state_method='efile'",
        "federal_method='efile'",
        "state_method='efile'",
        "federal_method='efile', state_method='efile', federal_result='mailed'",
        "federal_method='paper', state_method='paper', federal_result='accepted'",
        "federal_result='accepted'",
        "state_result='rejected'",
      ])
        await assert.rejects(() => setColumns(caseId, set), set);
      for (const set of [
        "federal_method='efile', state_method='efile'",
        "federal_method='efile', state_method='paper'",
        "federal_method='paper', state_method='paper'",
        "federal_method='paper', state_method='paper', federal_result='mailed', state_result='mailed'",
        "federal_method='efile', state_method='efile', federal_result='accepted', state_result='rejected'",
      ])
        await setColumns(caseId, set);
    });

    await t.test("filing tables are staff-only", async () => {
      const { caseId } = await f.submittedClientCase();
      const inserts = {
        filing_attempts:
          "insert into public.filing_attempts(workspace_id,case_id,attempt,filed_by) values($1,$2,1,$3)",
        filing_returns:
          "insert into public.filing_returns(workspace_id,case_id,attempt,return_kind,method) values($1,$2,1,'federal','efile')",
        filing_notes:
          "insert into public.filing_notes(workspace_id,case_id,attempt,note,recorded_by) values($1,$2,1,'Fictional fix note.',$3)",
      };
      await f.sql(inserts.filing_attempts, [f.workspaceId, caseId, f.sam]);
      await f.sql(inserts.filing_returns, [f.workspaceId, caseId]);
      await f.sql(inserts.filing_notes, [f.workspaceId, caseId, f.sam]);
      for (const table of Object.keys(inserts)) {
        const applicant = await f.applicantA.from(table).select("*").eq("case_id", caseId);
        assert.equal(applicant.error, null, table);
        assert.deepEqual(applicant.data, [], table);
        const staff = await f.presenter.from(table).select("*").eq("case_id", caseId);
        assert.equal(staff.error, null, table);
        assert.equal(staff.data.length, 1, table);
        for (const client of [f.applicantA, f.presenter])
          assert.ok(
            (await client.from(table).insert({ workspace_id: f.workspaceId, case_id: caseId })).error,
            `${table} insert`,
          );
      }
    });

    await t.test("fix notes are append-only", async () => {
      const { caseId } = await f.submittedClientCase();
      await f.sql("insert into public.filing_attempts(workspace_id,case_id,attempt,filed_by) values($1,$2,1,$3)", [
        f.workspaceId,
        caseId,
        f.sam,
      ]);
      await f.sql(
        "insert into public.filing_notes(workspace_id,case_id,attempt,note,recorded_by) values($1,$2,1,'Fictional fix note.',$3)",
        [f.workspaceId, caseId, f.sam],
      );
      await assert.rejects(() =>
        f.sql("update public.filing_notes set note='Changed' where case_id=$1", [caseId]),
      );
      await assert.rejects(() => f.sql("delete from public.filing_notes where case_id=$1", [caseId]));
      const update = await f.presenter.from("filing_notes").update({ note: "Changed" }).eq("case_id", caseId);
      const del = await f.presenter.from("filing_notes").delete().eq("case_id", caseId);
      const after = await f.sql("select note from public.filing_notes where case_id=$1", [caseId]);
      assert.ok(update.error || after.rows[0].note === "Fictional fix note.");
      assert.ok(del.error || after.rows.length === 1);
      assert.deepEqual(after.rows, [{ note: "Fictional fix note." }]);
    });
  } finally {
    await f.close();
  }
});

test("fix notes go only with their case", async (t) => {
  const f = await createDatabaseFixture();
  try {
    const withNote = async () => {
      const { caseId } = await f.submittedClientCase();
      await f.sql("insert into public.filing_attempts(workspace_id,case_id,attempt,filed_by) values($1,$2,1,$3)", [
        f.workspaceId,
        caseId,
        f.sam,
      ]);
      await f.sql(
        "insert into public.filing_notes(workspace_id,case_id,attempt,note,recorded_by) values($1,$2,1,'Fictional fix note.',$3)",
        [f.workspaceId, caseId, f.sam],
      );
      return caseId;
    };
    const noteCount = async (caseId) =>
      (await f.sql("select count(*)::int n from public.filing_notes where case_id=$1", [caseId])).rows[0].n;

    await t.test("deleting a filing attempt alone is refused and keeps the note", async () => {
      const caseId = await withNote();
      await assert.rejects(() => f.sql("delete from public.filing_attempts where case_id=$1", [caseId]));
      assert.equal(await noteCount(caseId), 1);
    });

    await t.test("deleting the case removes its notes", async () => {
      const caseId = await withNote();
      await f.sql("delete from public.cases where id=$1", [caseId]);
      assert.equal(await noteCount(caseId), 0);
    });

    await t.test("deleting the workspace removes its notes", async () => {
      const caseId = await withNote();
      await f.sql("delete from public.workspaces where id=$1", [f.workspaceId]);
      assert.equal(await noteCount(caseId), 0);
    });
  } finally {
    await f.close();
  }
});

// Task 2: Mark e-filed records each return's method (first filing).
test("mark e-filed records the methods", async (t) => {
  const f = await createDatabaseFixture();
  try {
    const readyCase = async () => {
      const caseId = await f.approvedCase();
      await f.act(f.presenter, caseId, f.sam, "MARK_READY_TO_EFILE", { confirmed: true });
      return caseId;
    };
    const filed = async (caseId, methods) =>
      f.act(f.presenter, caseId, f.sam, "MARK_EFILED", { confirmed: true, methods });
    const columns = async (caseId) =>
      (
        await f.sql(
          "select stage, federal_method, state_method, federal_result, state_result from public.cases where id=$1",
          [caseId],
        )
      ).rows[0];

    for (const [federal, state, line] of [
      ["efile", "efile", "PCDC e-filed your return."],
      ["efile", "paper", "PCDC e-filed your federal return and mailed your Pennsylvania return."],
      ["paper", "paper", "PCDC mailed your returns."],
    ])
      await t.test(`${federal}/${state} is recorded and told`, async () => {
        const caseId = await readyCase();
        await filed(caseId, { federal, state });
        assert.deepEqual(await columns(caseId), {
          stage: "efiled",
          federal_method: federal,
          state_method: state,
          federal_result: null,
          state_result: null,
        });
        const attempts = await f.sql("select attempt, filed_by from public.filing_attempts where case_id=$1", [caseId]);
        assert.deepEqual(attempts.rows, [{ attempt: 1, filed_by: f.sam }]);
        const returns = await f.sql(
          "select return_kind, method, result from public.filing_returns where case_id=$1 and attempt=1 order by return_kind",
          [caseId],
        );
        assert.deepEqual(returns.rows, [
          { return_kind: "federal", method: federal, result: null },
          { return_kind: "state", method: state, result: null },
        ]);
        assert.equal((await f.clientMessages(caseId)).at(-1), line);
        const staff = await f.readStaffCase(caseId);
        assert.deepEqual(staff.internalHistory.at(-1).detail, {
          attempt: 1,
          methods: { federal, state },
        });
      });

    await t.test("methods are required, paired and closed", async () => {
      const caseId = await readyCase();
      for (const payload of [
        { confirmed: true },
        { confirmed: true, methods: { federal: "paper", state: "efile" } },
        { confirmed: true, methods: { federal: "efile" } },
        { confirmed: true, methods: { state: "efile" } },
        { confirmed: true, methods: {} },
        { confirmed: true, methods: { federal: "fax", state: "efile" } },
        { confirmed: true, methods: { federal: "efile", state: "efile", extra: "efile" } },
        { confirmed: true, methods: { federal: "efile", state: "efile" }, extra: 1 },
      ])
        await assert.rejects(
          () => f.act(f.presenter, caseId, f.sam, "MARK_EFILED", payload),
          rejected("VALIDATION"),
          JSON.stringify(payload),
        );
      assert.equal((await columns(caseId)).stage, "ready_to_efile");
      const attempts = await f.sql("select count(*)::int n from public.filing_attempts where case_id=$1", [caseId]);
      assert.equal(attempts.rows[0].n, 0);
    });

    await t.test("the line helpers", async () => {
      const line = async (sql, params) => (await f.sql(sql, params)).rows[0].l;
      const filing = (a, b) =>
        line("select vitally_private.filing_line($1::text,$2::text) l", [a, b]);
      assert.equal(await filing("waiting", "waiting"), "Your federal and Pennsylvania returns were e-filed. The IRS and Pennsylvania will each confirm whether they are accepted.");
      assert.equal(await filing("accepted", "accepted"), "The IRS and Pennsylvania accepted your returns.");
      assert.equal(await filing("rejected", "rejected"), "Your federal and Pennsylvania returns need a correction before they can be accepted.");
      assert.equal(await filing("mailed", "mailed"), "Your federal and Pennsylvania returns were mailed. A reply to a mailed return can take several weeks.");
      assert.equal(await filing("accepted", null), "The IRS accepted your federal return.");
      assert.equal(await filing(null, "accepted"), "Pennsylvania accepted your Pennsylvania return.");
      assert.equal(await filing("waiting", null), "Your federal return was e-filed. The IRS will confirm whether it is accepted.");
      assert.equal(await filing(null, "rejected"), "Your Pennsylvania return needs a correction before it can be accepted.");
      assert.equal(await filing(null, "mailed"), "Your Pennsylvania return was mailed. A reply to a mailed return can take several weeks.");
      assert.equal(
        await filing("accepted", "rejected"),
        "The IRS accepted your federal return. Your Pennsylvania return needs a correction before it can be accepted.",
      );
      assert.equal(await filing(null, null), null);
      const efiled = (a, b, second) =>
        line("select vitally_private.efiled_line($1::text,$2::text,$3::boolean) l", [a, b, second]);
      assert.equal(await efiled("efile", "efile", true), "PCDC e-filed your return.");
      assert.equal(await efiled("efile", null, true), "PCDC e-filed your federal return.");
      assert.equal(await efiled("paper", null, true), "PCDC mailed your federal return.");
      assert.equal(await efiled(null, "efile", true), "PCDC e-filed your Pennsylvania return.");
      assert.equal(await efiled(null, "paper", true), "PCDC mailed your Pennsylvania return.");
      assert.equal(await efiled("efile", "paper", false), "PCDC e-filed your federal return and mailed your Pennsylvania return.");
      assert.equal(await efiled("paper", "paper", false), "PCDC mailed your returns.");
    });
  } finally {
    await f.close();
  }
});
