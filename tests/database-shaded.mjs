import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDatabaseFixture } from "./support/database-fixture.mjs";
import { SHADED_FIELDS } from "../src/shaded-fields.mjs";

const MIGRATION = new URL("../supabase/migrations/038_preparer_shaded_fields.sql", import.meta.url);
const ASTRAL = "\u{1F600}"; // one character, two UTF-16 units

const insertShaded = (f, caseId, fields, overrides = {}) => {
  const row = {
    workspace_id: f.workspaceId,
    case_id: caseId,
    fields: JSON.stringify(fields),
    version: 1,
    updated_by_person_id: f.morgan,
    ...overrides,
  };
  const keys = Object.keys(row);
  return f.sql(
    `insert into public.preparer_shaded_fields(${keys.join(",")}) values(${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
    keys.map((key) => row[key]),
  );
};

const checkViolation = (error) => error.code === "23514" || /check/i.test(String(error.message));

test("shaded table is staff-only", async () => {
  const f = await createDatabaseFixture();
  try {
    const caseId = await f.preparedCase();
    await insertShaded(f, caseId, { incomeW2s: true, incomeW2sCount: 2 });
    const applicant = await f.applicantA.from("preparer_shaded_fields").select("*").eq("case_id", caseId);
    assert.equal(applicant.error, null);
    assert.deepEqual(applicant.data, []);
    const staff = await f.presenter.from("preparer_shaded_fields").select("*").eq("case_id", caseId);
    assert.equal(staff.error, null);
    assert.equal(staff.data.length, 1);
    assert.deepEqual(staff.data[0].fields, { incomeW2s: true, incomeW2sCount: 2 });
    for (const client of [f.applicantA, f.presenter]) {
      assert.ok(
        (
          await client
            .from("preparer_shaded_fields")
            .insert({ workspace_id: f.workspaceId, case_id: caseId, fields: {}, version: 1, updated_by_person_id: f.morgan })
        ).error,
        "insert refused",
      );
      assert.ok((await client.from("preparer_shaded_fields").update({ version: 2 }).eq("case_id", caseId)).error ||
        (await f.sql("select version from public.preparer_shaded_fields where case_id=$1", [caseId])).rows[0].version === "1",
      "update changes nothing");
      assert.ok((await client.from("preparer_shaded_fields").delete().eq("case_id", caseId)).error ||
        (await f.sql("select 1 from public.preparer_shaded_fields where case_id=$1", [caseId])).rowCount === 1,
      "delete removes nothing");
    }
  } finally {
    await f.close();
  }
});

test("the table refuses a bad shape", async () => {
  const f = await createDatabaseFixture();
  try {
    const caseId = await f.preparedCase();
    const bad = [
      ["a count over 99", { incomeW2sCount: 120 }],
      ["a negative count", { incomeW2sCount: -1 }],
      ["a count that is a string", { incomeW2sCount: "2" }],
      ["a count with a fraction", { incomeW2sCount: 2.5 }],
      ["an unknown key", { nope: true }],
      ["both of a Yes/No pair", { itemizedLastYearYes: true, itemizedLastYearNo: true }],
      ["a bad cell", { household1QualifyingChild: "maybe" }],
      ["a cell that is not a string", { household1QualifyingChild: true }],
      ["a box that is false", { incomeW2s: false }],
      ["a box that is a string", { incomeW2s: "true" }],
      ["an amount with a dollar sign", { incomeRefundAmount: "$12" }],
      ["an amount with three decimals", { incomeRefundAmount: "1.234" }],
      ["an amount with a leading zero", { incomeRefundAmount: "01" }],
      ["an amount that is a number", { incomeRefundAmount: 12 }],
      ["a VIN of 18", { infoVin: "A".repeat(18) }],
      ["a VIN with a dash", { infoVin: "AB-1" }],
      ["a year before 2000", { infoDisallowedYear: "1999" }],
      ["a year of three digits", { infoDisallowedYear: "200" }],
      ["a reason over 120 characters", { infoDisallowedReason: "x".repeat(121) }],
      ["a reason over 120 code points", { infoDisallowedReason: ASTRAL.repeat(121) }],
      ["a blank reason", { infoDisallowedReason: "   " }],
      ["a note over 500 characters", { incomeNotes: "x".repeat(501) }],
      ["a note over 500 code points", { incomeNotes: ASTRAL.repeat(501) }],
      ["a blank note", { incomeNotes: " \t\r\n " }],
      ["an empty note", { incomeNotes: "" }],
      ["a note that is not a string", { incomeNotes: 5 }],
    ];
    for (const [name, fields] of bad)
      await assert.rejects(() => insertShaded(f, caseId, fields), checkViolation, name);
    await assert.rejects(() => insertShaded(f, caseId, [true]), checkViolation, "an array");
    await assert.rejects(() => insertShaded(f, caseId, "x"), checkViolation, "a string");
    await assert.rejects(() => insertShaded(f, caseId, {}, { version: 0 }), "version at least 1");
    await assert.rejects(() => insertShaded(f, caseId, {}, { fields: null }), "fields not null");
    const none = await f.sql("select 1 from public.preparer_shaded_fields where case_id=$1", [caseId]);
    assert.equal(none.rowCount, 0);
    const good = {
      household1QualifyingChild: "yes",
      household4CostOfHome: "na",
      incomeW2s: true,
      incomeW2sCount: 99,
      incomeRefundAmount: "999999.99",
      infoVin: "1HGCM82633A004352".slice(0, 17),
      infoDisallowedYear: "2000",
      infoDisallowedReason: ASTRAL.repeat(120),
      incomeNotes: `${ASTRAL.repeat(250)}\n${"y".repeat(249)}`,
      itemizedLastYearYes: true,
    };
    await insertShaded(f, caseId, good);
    await assert.rejects(() => insertShaded(f, caseId, {}), "one row per case");
  } finally {
    await f.close();
  }
});

test("the SQL key lists match the JS table", async () => {
  const sql = await readFile(MIGRATION, "utf8");
  const kinds = { cell: "cells", box: "boxes", count: "counts", amount: "amounts", vin: "vins", year: "years", reason: "reasons", note: "notes" };
  let total = 0;
  for (const [kind, variable] of Object.entries(kinds)) {
    const found = new RegExp(`${variable} text\\[\\] := array\\[([^\\]]*)\\]`).exec(sql);
    assert.ok(found, `${variable} is listed in the migration`);
    const listed = [...found[1].matchAll(/'([A-Za-z0-9]+)'/g)].map((m) => m[1]);
    const expected = SHADED_FIELDS.filter((x) => x.kind === kind).map((x) => x.key);
    assert.deepEqual([...listed].sort(), [...expected].sort(), kind);
    total += listed.length;
  }
  assert.equal(total, SHADED_FIELDS.length);
});
