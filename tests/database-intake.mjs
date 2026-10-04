import test from "node:test";
import assert from "node:assert/strict";
import {
  createDatabaseFixture,
  applyArgs,
  rejected,
} from "./support/database-fixture.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";
import { INTAKE_VALUE_CASES } from "./support/intake-value-cases.mjs";
import CATALOGUE from "../src/intake-catalogue-data.mjs";
import {
  checkValue,
  isAnswered,
  isVisible,
  missingToSubmit,
  substepsFor,
} from "../src/intake-catalogue.mjs";

// Part 4a, Task 3 (docs/superpowers/specs/2026-09-29-intake-catalogue-design.md §3):
// versions, the field table, version-2 SAVE_ANSWERS / SUBMIT, and case_contacts.

const TOP = CATALOGUE.steps.flatMap((step) =>
  step.sections.flatMap((section) =>
    section.questions.map((question) => ({ ...question, step: step.n })),
  ),
);
const byId = new Map(TOP.map((question) => [question.id, question]));
const HH = byId.get("hh");

// A valid value for one question, preferring answers that reveal little.
function sampleValue(question) {
  switch (question.type) {
    case "text":
    case "signature":
    case "longtext":
      return "Sample";
    case "email":
      return "sample@example.test";
    case "phone":
      return "2155550100";
    case "zip":
      return "19107";
    case "date":
      return "1980-01-02";
    case "year":
      return "2025";
    case "number":
      return String(question.min ?? 1);
    case "yesno":
      return "no";
    case "id":
      return crypto.randomUUID().replaceAll("-", "");
    case "who":
      return ["none"];
    case "multi":
      return [question.options[0].value];
    case "choice":
      return question.options[0].value;
    default:
      throw new Error(`no sample for ${question.type}`);
  }
}
const member = (overrides = {}) => ({
  ...Object.fromEntries(HH.fields.map((field) => [field.id, sampleValue(field)])),
  ...overrides,
});
// Fills every required, visible question until the browser's own
// missingToSubmit is empty: never married, no household, self-employed.
// `complete: false` keeps deliberately incomplete members as they are.
function completeAnswers(base = {}, { complete = true } = {}) {
  const answers = {
    marital_status: "never_married",
    has_household_members: "no",
    inc_self_employed: "yes",
    ...base,
  };
  for (let pass = 0; pass < 10; pass++) {
    let added = false;
    for (const question of TOP) {
      if (question.id in answers || !question.required) continue;
      if (!isVisible(question, answers)) continue;
      answers[question.id] =
        question.type === "group" ? [member()] : sampleValue(question);
      added = true;
    }
    if (!added) break;
  }
  if (complete) assert.deepEqual(missingToSubmit(2, answers, {}), []);
  return answers;
}

const caseRow = async (f, caseId) =>
  (await f.sql("select * from public.cases where id=$1", [caseId])).rows[0];
const contactRow = async (f, caseId) =>
  (await f.sql("select * from public.case_contacts where case_id=$1", [caseId]))
    .rows[0];
const setDefault = (f, version) =>
  f.sql("update public.workspaces set default_intake_version=$2 where id=$1", [
    f.workspaceId,
    version,
  ]);
// A case created while the workspace default is 2, then the default is back at 1.
async function v2Case(f, actor = f.applicantA, options = {}) {
  await setDefault(f, 2);
  try {
    return await f.createCase(actor, crypto.randomUUID(), {
      answers: {},
      ...options,
    });
  } finally {
    await setDefault(f, 1);
  }
}
const save = (f, caseId, answers, actor = f.applicantA, personId = null) =>
  f.act(actor, caseId, personId, "SAVE_ANSWERS", { answers });

test("version-2 intake: versions, answers, submit and contacts", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await t.test("a case takes its workspace's default version", async () => {
      const v1 = await f.createCase(f.applicantA, crypto.randomUUID());
      assert.equal((await caseRow(f, v1.caseId)).intake_version, 1);
      const v2 = await v2Case(f);
      assert.equal((await caseRow(f, v2.caseId)).intake_version, 2);
      assert.equal(
        (
          await f.sql(
            "select default_intake_version from public.workspaces where id=$1",
            [f.workspaceId],
          )
        ).rows[0].default_intake_version,
        1,
      );
    });

    await t.test("a version-2 case starts empty", async () => {
      await setDefault(f, 2);
      try {
        await assert.rejects(
          f.createCase(f.applicantA, crypto.randomUUID(), {
            answers: { firstName: "Mei" },
          }),
          rejected("VALIDATION"),
        );
        const empty = await f.createCase(f.applicantA, crypto.randomUUID(), {
          answers: {},
        });
        assert.deepEqual((await caseRow(f, empty.caseId)).answers, {});
      } finally {
        await setDefault(f, 1);
      }
    });

    await t.test("a case's version never changes", async () => {
      const v1 = await f.createCase(f.applicantA, crypto.randomUUID());
      const v2 = await v2Case(f);
      await assert.rejects(
        f.sql("update public.cases set intake_version=2 where id=$1", [v1.caseId]),
        rejected("VALIDATION"),
      );
      await assert.rejects(
        f.sql("update public.cases set intake_version=1 where id=$1", [v2.caseId]),
        rejected("VALIDATION"),
      );
    });

    await t.test("a sample reset with the default at 1 seeds version-1 samples", async () => {
      await f.seedFixtures();
      const versions = (
        await f.sql(
          "select distinct intake_version from public.cases where workspace_id=$1 and fixture",
          [f.workspaceId],
        )
      ).rows.map((row) => row.intake_version);
      assert.deepEqual(versions, [1]);
    });

    await t.test("version 1 saves and submits exactly as before", async () => {
      const created = await f.createCase(f.applicantA, crypto.randomUUID());
      await save(f, created.caseId, makeSampleAnswers());
      const submitted = await f.act(f.applicantA, created.caseId, null, "SUBMIT", {
        confirmed: true,
      });
      assert.equal(submitted.revision, 3);
      const row = await caseRow(f, created.caseId);
      assert.equal(row.stage, "received");
      assert.deepEqual(row.answers, makeSampleAnswers());
      assert.ok(row.client_number > 0);
      assert.equal(await contactRow(f, created.caseId), undefined);
      const [event] = (
        await f.sql(
          "select detail from public.case_events where case_id=$1 and action='SUBMIT'",
          [created.caseId],
        )
      ).rows;
      assert.equal(event.detail.screening, "continue");
      // Version-2 keys are not version-1 keys.
      await assert.rejects(
        save(f, (await f.createCase(f.applicantA, crypto.randomUUID())).caseId, {
          tp_first_name: "Mei",
        }),
        rejected("VALIDATION"),
      );
    });

    await t.test("a bad payload answers VALIDATION before any stage check, in both versions", async () => {
      // Version 1: a received case refuses a bad key as VALIDATION and a good
      // one as INVALID_TRANSITION, so the answer check still runs first.
      const v1 = await f.createCase(f.applicantA, crypto.randomUUID(), {
        answers: makeSampleAnswers(),
      });
      await f.act(f.applicantA, v1.caseId, null, "SUBMIT", { confirmed: true });
      await assert.rejects(
        save(f, v1.caseId, { notAnAnswer: "x" }),
        rejected("VALIDATION"),
      );
      await assert.rejects(
        save(f, v1.caseId, { city: 42 }),
        rejected("VALIDATION"),
      );
      await assert.rejects(
        save(f, v1.caseId, { city: "Pittsburgh" }),
        rejected("INVALID_TRANSITION"),
      );
      // Version 2 keeps the same order.
      const v2 = await v2Case(f);
      await save(f, v2.caseId, completeAnswers());
      await f.act(f.applicantA, v2.caseId, null, "SUBMIT", { confirmed: true });
      await assert.rejects(
        save(f, v2.caseId, { tp_dob: "1980-02-30" }),
        rejected("VALIDATION"),
      );
      await assert.rejects(
        save(f, v2.caseId, { tp_dob: "1980-02-03" }),
        rejected("INVALID_TRANSITION"),
      );
    });

    await t.test("version-2 SAVE_ANSWERS refuses unknown keys and bad values", async () => {
      const { caseId } = await v2Case(f);
      const bad = [
        { firstName: "Mei" },
        { "hh.dob": "1980-01-02" },
        { tp_first_name: "x".repeat(201) },
        { additional_notes: "x".repeat(5001) },
        { marital_status: "complicated" },
        { tp_dob: "1980-13-01" },
        { tp_dob: "02/03/1980" },
        { us_citizen: ["none", "me"] },
        { us_citizen: ["me", "me"] },
        { multi_state: "not_sure_at_all" },
        { hh: [member({ months_lived: "13" })] },
        { hh: [{ ...member(), nickname: "Bo" }] },
        { hh: Array.from({ length: 11 }, () => member()) },
        { hh: ["Bo"] },
        { hh: { first_name: "Bo" } },
        // Every member needs a well-formed id, and no two share one.
        { hh: [{ first_name: "A" }] },
        { hh: [member({ member_id: "" })] },
        { hh: [member({ member_id: null })] },
        { hh: [member({ member_id: "XYZ" })] },
        { hh: [member({ member_id: "0123456789abcdef0123456789abcde" })] },
        { hh: [member({ member_id: "0123456789ABCDEF0123456789ABCDEF" })] },
        { hh: [member({ member_id: "0123456789abcdef0123456789abcdef" }), member({ member_id: "0123456789abcdef0123456789abcdef" })] },
        { tp_phone: "555-0100" },
        { email: "a@b@c" },
        { addr_zip: "1910" },
        { tp_first_name: 42 },
        { best_contact_time: ["whenever"] },
      ];
      const before = await caseRow(f, caseId);
      for (const answers of bad)
        await assert.rejects(
          save(f, caseId, answers),
          rejected("VALIDATION"),
          JSON.stringify(answers).slice(0, 80),
        );
      const after = await caseRow(f, caseId);
      assert.equal(after.revision, before.revision);
      assert.deepEqual(after.answers, {});
      assert.equal(await contactRow(f, caseId), undefined);
    });

    await t.test("a household with distinct member ids is accepted", async () => {
      const { caseId } = await v2Case(f);
      const people = [
        { member_id: "0123456789abcdef0123456789abcdef", first_name: "A" },
        { member_id: "fedcba9876543210fedcba9876543210", first_name: "B" },
      ];
      await save(f, caseId, { hh: people });
      assert.deepEqual((await caseRow(f, caseId)).answers, { hh: people });
    });

    await t.test("a valid structured set is stored exactly, and null clears a key", async () => {
      const { caseId } = await v2Case(f);
      const answers = {
        tp_first_name: "Mei",
        tp_dob: "1980-02-29",
        marital_status: "married",
        us_citizen: ["me", "spouse"],
        multi_state: "not_sure",
        has_household_members: "yes",
        hh: [member({ first_name: "Bo", months_lived: "12" }), member({ dob: "" })],
        inc_wages_job_count: "2",
      };
      await save(f, caseId, answers);
      assert.deepEqual((await caseRow(f, caseId)).answers, answers);
      await save(f, caseId, {
        tp_first_name: null,
        inc_wages_job_count: "  ",
        us_citizen: [],
        // No-break spaces are blank to JavaScript's trim, so this clears too.
        tp_dob: "\u00A0\u00A0",
        tp_last_name: "Lin",
      });
      const {
        tp_first_name: _first,
        inc_wages_job_count: _count,
        us_citizen: _citizen,
        tp_dob: _dob,
        ...rest
      } = answers;
      assert.deepEqual((await caseRow(f, caseId)).answers, {
        ...rest,
        tp_last_name: "Lin",
      });
      const [event] = (
        await f.sql(
          "select detail from public.case_events where case_id=$1 and action='SAVE_ANSWERS' order by created_at desc,id limit 1",
          [caseId],
        )
      ).rows;
      assert.deepEqual(event.detail, {
        fields: ["inc_wages_job_count", "tp_dob", "tp_first_name", "tp_last_name", "us_citizen"],
      });
    });

    await t.test("the answers size cap is 64 KB of stored text", async () => {
      const full = completeAnswers({
        has_household_members: "yes",
        hh: Array.from({ length: 10 }, () => member()),
        additional_notes: "x".repeat(5000),
      });
      const within = async (value) =>
        (
          await f.sql("select vitally_private.answers_within_limit($1::jsonb) as ok", [
            JSON.stringify(value),
          ])
        ).rows[0].ok;
      assert.equal(await within(full), true);
      assert.equal(await within({ x: "x".repeat(70000) }), false);
    });

    await t.test("contact fields land in case_contacts, never in answers", async () => {
      const { caseId } = await v2Case(f);
      await save(f, caseId, {
        tp_first_name: "Mei",
        tp_phone: "(215) 555-0100",
        best_contact_time: ["weekday_morning", "weekend"],
        best_contact_note: "After 5pm",
      });
      assert.deepEqual((await caseRow(f, caseId)).answers, { tp_first_name: "Mei" });
      let contact = await contactRow(f, caseId);
      assert.equal(contact.workspace_id, f.workspaceId);
      assert.equal(contact.phone, "2155550100");
      assert.equal(contact.spouse_phone, null);
      assert.deepEqual(contact.best_contact_time, ["weekday_morning", "weekend"]);
      assert.equal(contact.best_contact_note, "After 5pm");
      // A later save changes only the contact keys it names; null clears.
      await save(f, caseId, { sp_phone: "215.555.0199", best_contact_note: null });
      contact = await contactRow(f, caseId);
      assert.equal(contact.phone, "2155550100");
      assert.equal(contact.spouse_phone, "2155550199");
      assert.deepEqual(contact.best_contact_time, ["weekday_morning", "weekend"]);
      assert.equal(contact.best_contact_note, null);
      assert.deepEqual((await caseRow(f, caseId)).answers, { tp_first_name: "Mei" });
      await assert.rejects(save(f, caseId, { tp_phone: "555-0100" }), rejected("VALIDATION"));
      assert.equal((await contactRow(f, caseId)).phone, "2155550100");
    });

    await t.test("version-2 SUBMIT checks required, visible fields only", async () => {
      const empty = await v2Case(f);
      await assert.rejects(
        f.act(f.applicantA, empty.caseId, null, "SUBMIT", { confirmed: true }),
        rejected("VALIDATION"),
      );

      const complete = completeAnswers();
      // Married-only required fields are hidden for a single filer and absent.
      const hidden = TOP.filter(
        (q) =>
          q.required &&
          (q.showIf ?? []).some((c) => c.field === "marital_status" && c.value === "married"),
      );
      assert.ok(hidden.length > 0);
      for (const question of hidden) assert.ok(!(question.id in complete), question.id);
      assert.equal(complete.inc_self_employed, "yes");

      const { caseId } = await v2Case(f);
      // Without the phone (a contact field) the case is incomplete.
      const { tp_phone: phone, ...withoutPhone } = complete;
      await save(f, caseId, withoutPhone);
      await assert.rejects(
        f.act(f.applicantA, caseId, null, "SUBMIT", { confirmed: true }),
        rejected("VALIDATION"),
      );
      await save(f, caseId, { tp_phone: phone });
      await f.act(f.applicantA, caseId, null, "SUBMIT", { confirmed: true });
      const row = await caseRow(f, caseId);
      assert.equal(row.stage, "received");
      assert.ok(row.client_number > 0);
      const [event] = (
        await f.sql(
          "select detail from public.case_events where case_id=$1 and action='SUBMIT'",
          [caseId],
        )
      ).rows;
      assert.equal(event.detail.clientNumber, row.client_number);
    });

    await t.test("a household member missing a required field blocks SUBMIT", async () => {
      const { dob: _dob, ...noDob } = member();
      const answers = completeAnswers(
        { has_household_members: "yes", hh: [noDob] },
        { complete: false },
      );
      assert.deepEqual(missingToSubmit(2, answers, {}).includes("hh[0].dob"), true);
      const { caseId } = await v2Case(f);
      await save(f, caseId, answers);
      await assert.rejects(
        f.act(f.applicantA, caseId, null, "SUBMIT", { confirmed: true }),
        rejected("VALIDATION"),
      );
      await save(f, caseId, { hh: [member()] });
      await f.act(f.applicantA, caseId, null, "SUBMIT", { confirmed: true });
      assert.equal((await caseRow(f, caseId)).stage, "received");
    });

    await t.test("contacts are visible to the owner, and to staff past a private draft", async () => {
      const readContacts = async (client, caseId) => {
        const { data, error } = await client
          .from("case_contacts")
          .select("*")
          .eq("case_id", caseId);
        assert.equal(error, null);
        return data;
      };
      const { caseId } = await v2Case(f);
      await save(f, caseId, { tp_phone: "2155550100" });
      assert.equal((await readContacts(f.applicantA, caseId)).length, 1);
      assert.deepEqual(await readContacts(f.applicantB, caseId), []);
      assert.deepEqual(await readContacts(f.presenter, caseId), []);
      await save(f, caseId, completeAnswers());
      await f.act(f.applicantA, caseId, null, "SUBMIT", { confirmed: true });
      const [seen] = await readContacts(f.presenter, caseId);
      assert.equal(seen.phone, "2155550100");
      assert.deepEqual(await readContacts(f.applicantB, caseId), []);

      const assisted = await v2Case(f, f.presenter, {
        mode: "assisted",
        personId: f.sam,
      });
      await save(f, assisted.caseId, { tp_phone: "2155550111" }, f.presenter, f.sam);
      const [assistedRow] = await readContacts(f.presenter, assisted.caseId);
      assert.equal(assistedRow.phone, "2155550111");
      assert.deepEqual(await readContacts(f.applicantA, assisted.caseId), []);
    });

    await t.test("a replayed version-2 save does not write twice", async () => {
      const { caseId } = await v2Case(f);
      const args = applyArgs({
        caseId,
        revision: 1,
        type: "SAVE_ANSWERS",
        payload: { answers: { tp_phone: "2155550100", tp_first_name: "Mei" } },
      });
      const first = await f.applicantA.rpc("vitally_apply_action", args);
      assert.equal(first.error, null);
      const again = await f.applicantA.rpc("vitally_apply_action", args);
      assert.deepEqual(again.data, first.data);
      assert.equal(Number((await caseRow(f, caseId)).revision), 2);
    });

    await t.test("hh.member_id is an optional id field, and the sub-step table matches the catalogue", async () => {
      const [idField] = (
        await f.sql(
          "select type, required_to_submit from vitally_private.intake_fields where version=2 and field_id='hh.member_id'",
        )
      ).rows;
      assert.deepEqual(idField, { type: "id", required_to_submit: false });
      const rows = (
        await f.sql(
          "select id, step from vitally_private.intake_substeps where version=2 order by position",
        )
      ).rows;
      assert.deepEqual(
        rows,
        substepsFor(2).map((sub) => ({ id: sub.id, step: sub.step.n })),
      );
      // A member with every required field never has a missing member_id.
      const missing = (
        await f.sql(
          "select vitally_private.intake_missing(2::smallint, $1::jsonb, '{}'::jsonb) as missing",
          [JSON.stringify(completeAnswers({ has_household_members: "yes", hh: [member(), member()] }))],
        )
      ).rows[0].missing;
      assert.equal(missing.some((id) => id.includes("member_id")), false);
    });

    await t.test("the field table matches the catalogue", async () => {
      const expected = [];
      for (const question of TOP) {
        expected.push({
          field_id: question.id,
          type: question.type,
          options: question.options ? question.options.map((o) => o.value) : null,
          required_to_submit: question.required,
          show_if: question.showIf ?? [],
          step: question.step,
          group_id: null,
          min_value: question.min ?? null,
          max_value: question.max ?? null,
          sensitive: question.type === "phone",
        });
        for (const field of question.fields ?? [])
          expected.push({
            field_id: `${question.id}.${field.id}`,
            type: field.type,
            options: field.options ? field.options.map((o) => o.value) : null,
            required_to_submit: field.required,
            show_if: field.showIf ?? [],
            step: question.step,
            group_id: question.id,
            min_value: field.min ?? null,
            max_value: field.max ?? null,
            sensitive: field.type === "phone",
          });
      }
      const actual = (
        await f.sql(
          `select field_id,type,options,required_to_submit,show_if,step,group_id,min_value,max_value,sensitive
             from vitally_private.intake_fields where version=2 order by field_id`,
        )
      ).rows;
      const sort = (list) => list.toSorted((a, b) => (a.field_id < b.field_id ? -1 : 1));
      assert.deepEqual(sort(actual), sort(expected));
      const sensitive = actual.filter((row) => row.sensitive).map((row) => row.field_id);
      assert.deepEqual(sensitive.toSorted(), ["sp_phone", "tp_phone"]);
      // The loader stores each question's own options; the browser checks
      // `who` against fixedOptions. They must be the same list.
      const who = CATALOGUE.fixedOptions.who.options.map((o) => o.value);
      const whoRows = actual.filter((row) => row.type === "who");
      assert.ok(whoRows.length > 0);
      for (const row of whoRows) assert.deepEqual(row.options, who, row.field_id);
      assert.deepEqual(
        (
          await f.sql(
            "select distinct version from vitally_private.intake_fields order by version",
          )
        ).rows.map((row) => row.version),
        [2],
      );
    });

    await t.test("the server's value check and missing list mirror the browser's", async () => {
      // The contract table (spec §6) is the one list: its `sql` column is the
      // server's result, and tests/intake-catalogue.test.mjs checks `js`.
      for (const row of INTAKE_VALUE_CASES) {
        const found = (
          await f.sql(
            "select vitally_private.check_intake_value(f, $2::jsonb) as ok from vitally_private.intake_fields f where version=2 and group_id is null and field_id=$1",
            [row.field, JSON.stringify(row.value)],
          )
        ).rows;
        assert.equal(found.length, 1, `one top-level field ${row.field}`);
        assert.equal(found[0].ok, row.sql, `${row.field} ${JSON.stringify(row.value).slice(0, 60)}`);
      }
      // Impossible dates are rejected on both sides, not merely alike.
      for (const value of ["2025-13-01", "2025-00-10", "2025-01-00", "2025-02-29"]) {
        const server = (
          await f.sql(
            "select vitally_private.check_intake_value(i, $1::jsonb) as ok from vitally_private.intake_fields i where version=2 and field_id='tp_dob'",
            [JSON.stringify(value)],
          )
        ).rows[0].ok;
        assert.equal(server, false, value);
        assert.notEqual(checkValue(byId.get("tp_dob"), value), null, value);
      }
      // "Answered" is JavaScript's trim on both sides, every whitespace included.
      const blanks = [
        "  ",
        "\uFEFF",
        " \u3000 ",
        "\u00A0\u00A0",
        "\t\n\v\f\r",
        "\u1680\u2000\u200A\u2028\u2029\u202F\u205F",
        "\u200B",
        "x",
        "",
      ];
      for (const value of blanks) {
        const server = (
          await f.sql("select vitally_private.intake_answered($1::jsonb) as answered", [
            JSON.stringify(value),
          ])
        ).rows[0].answered;
        assert.equal(server, isAnswered(value), JSON.stringify(value));
      }
      const sets = [
        [{ ...completeAnswers(), tp_first_name: "\u00A0\u00A0" }, {}],
        [{ ...completeAnswers(), tp_last_name: " \u3000 " }, {}],
        [{}, {}],
        [completeAnswers(), {}],
        [completeAnswers({ marital_status: "married" }), {}],
        [completeAnswers({ irs_language_pref: ["me"] }), {}],
        [completeAnswers({ has_household_members: "yes", hh: [{}, member()] }, { complete: false }), {}],
        [completeAnswers({ has_household_members: "yes", hh: [] }, { complete: false }), {}],
        [(({ tp_phone: _p, ...rest }) => rest)(completeAnswers()), { tp_phone: "2155550100" }],
        [(({ tp_phone: _p, ...rest }) => rest)(completeAnswers()), {}],
        [{ gcf_consent: "yes", marital_status: "married", gcf_sp_signature: "Mei" }, {}],
      ];
      for (const [answers, contact] of sets) {
        const server = (
          await f.sql(
            "select vitally_private.intake_missing(2::smallint, $1::jsonb, $2::jsonb) as missing",
            [JSON.stringify(answers), JSON.stringify(contact)],
          )
        ).rows[0].missing;
        assert.deepEqual(
          server.toSorted(),
          missingToSubmit(2, answers, contact).toSorted(),
          JSON.stringify(answers).slice(0, 80),
        );
      }
    });

    await t.test("intake_visible reads show-if against answers and contacts", async () => {
      const visible = async (id, answers, contact = {}) =>
        (
          await f.sql(
            "select vitally_private.intake_visible(2::smallint, $1, $2::jsonb, $3::jsonb) as shown",
            [id, JSON.stringify(answers), JSON.stringify(contact)],
          )
        ).rows[0].shown;
      assert.equal(await visible("sp_first_name", { marital_status: "never_married" }), false);
      assert.equal(await visible("sp_first_name", { marital_status: "married" }), true);
      assert.equal(await visible("sp_first_name", {}), false);
      assert.equal(await visible("tp_first_name", {}), true);
      assert.equal(await visible("irs_language", { irs_language_pref: ["none"] }), false);
      assert.equal(await visible("irs_language", { irs_language_pref: ["me"] }), true);
      assert.equal(await visible("irs_language", {}), false);
      const signed = { gcf_consent: "yes", marital_status: "married" };
      assert.equal(await visible("gcf_sp_date", { ...signed, gcf_sp_signature: "\u00A0" }), false);
      assert.equal(await visible("gcf_sp_date", { ...signed, gcf_sp_signature: "Mei" }), true);
      assert.equal(await visible("gcf_sp_date", { gcf_sp_signature: "Mei" }), false);
      assert.equal(await visible("gcf_sp_date", { ...signed, gcf_consent: "no", gcf_sp_signature: "Mei" }), false);
      for (const [id, answers] of [
        ["sp_first_name", { marital_status: "married" }],
        ["irs_language", { irs_language_pref: ["none"] }],
        ["gcf_sp_date", { ...signed, gcf_sp_signature: "\u00A0" }],
        ["gcf_sp_date", { ...signed, gcf_sp_signature: "Mei" }],
        ["gcf_sp_date", { gcf_sp_signature: "Mei" }],
      ])
        assert.equal(await visible(id, answers), isVisible(byId.get(id), answers), id);
    });

    await t.test("the loader refuses a catalogue without steps", async () => {
      await assert.rejects(
        f.sql("select vitally_private.load_intake_catalogue(3::smallint, '{}'::jsonb)"),
        rejected("VALIDATION"),
      );
    });
  } finally {
    await f.close();
  }
});

// Part 4a, Task 4 (spec §3.4–§3.5): UPDATE_CONTACT, RECORD_MATERIALS and
// case_materials, from migration 013.
test("contact and materials actions", async (t) => {
  const f = await createDatabaseFixture();
  const materialRows = async (caseId) =>
    (
      await f.sql(
        "select item, recorded_by_person_id, received_at, workspace_id from public.case_materials where case_id=$1 order by item",
        [caseId],
      )
    ).rows;
  const eventsOf = async (caseId, action) =>
    (
      await f.sql(
        "select detail, actor_person_id from public.case_events where case_id=$1 and action=$2 order by created_at",
        [caseId, action],
      )
    ).rows;
  const clientEventsOf = async (caseId, action) =>
    (
      await f.sql(
        "select message from public.client_events where case_id=$1 and action=$2",
        [caseId, action],
      )
    ).rows;
  const update = (caseId, payload, actor = f.applicantA, personId = null) =>
    f.act(actor, caseId, personId, "UPDATE_CONTACT", payload);
  const record = (caseId, received, actor = f.presenter, personId = f.sam) =>
    f.act(actor, caseId, personId, "RECORD_MATERIALS", { received });
  // A version-2 case the applicant has submitted; staff can now see it.
  const submittedV2 = async () => {
    const { caseId } = await v2Case(f);
    await save(f, caseId, completeAnswers());
    await f.act(f.applicantA, caseId, null, "SUBMIT", { confirmed: true });
    return caseId;
  };
  // The same, verified by the office and waiting for a preparer.
  const readyV2 = async () => {
    const caseId = await submittedV2();
    await f.act(f.presenter, caseId, f.sam, "VERIFY_INTAKE", {
      checks: f.intakeChecks,
    });
    return caseId;
  };
  try {
    await t.test("materials_items is D9's list", async () => {
      assert.deepEqual(
        (await f.sql("select vitally_private.materials_items() as items")).rows[0]
          .items,
        [
          "photo_id",
          "ssn_itin",
          "green_card",
          "birth_certificate",
          "w2",
          "1099nec",
          "1099misc",
          "1099int",
          "1098t",
          "1095a",
          "prior_year_1040",
        ],
      );
      assert.deepEqual(
        (await f.sql("select vitally_private.materials_items() as items")).rows[0]
          .items,
        CATALOGUE.materials.map((item) => item.id),
      );
    });

    await t.test("the owner updates the best time and note on their own draft", async () => {
      const { caseId } = await v2Case(f);
      await save(f, caseId, { tp_phone: "2155550100" });
      await update(caseId, {
        bestContactTime: ["weekday_morning", "weekend"],
        bestContactNote: "After 5pm",
      });
      let contact = await contactRow(f, caseId);
      assert.deepEqual(contact.best_contact_time, ["weekday_morning", "weekend"]);
      assert.equal(contact.best_contact_note, "After 5pm");
      assert.equal(contact.phone, "2155550100");
      // One key leaves the other alone; a blank note and an empty list clear.
      await update(caseId, { bestContactNote: "   " });
      contact = await contactRow(f, caseId);
      assert.equal(contact.best_contact_note, null);
      assert.deepEqual(contact.best_contact_time, ["weekday_morning", "weekend"]);
      await update(caseId, { bestContactTime: [] });
      assert.equal((await contactRow(f, caseId)).best_contact_time, null);
      await update(caseId, { bestContactTime: ["weekend"], bestContactNote: null });
      contact = await contactRow(f, caseId);
      assert.deepEqual(contact.best_contact_time, ["weekend"]);
      assert.equal(contact.best_contact_note, null);
      assert.equal(contact.phone, "2155550100");
      // Nothing moved into answers.
      assert.deepEqual((await caseRow(f, caseId)).answers, {});
      // History names the fields, never the values; the client is told nothing.
      const events = await eventsOf(caseId, "UPDATE_CONTACT");
      assert.equal(events.length, 4);
      assert.deepEqual(events[0].detail, {
        fields: ["bestContactNote", "bestContactTime"],
      });
      assert.deepEqual(events[1].detail, { fields: ["bestContactNote"] });
      assert.equal(events[0].actor_person_id, null);
      assert.deepEqual(await clientEventsOf(caseId, "UPDATE_CONTACT"), []);
    });

    await t.test("a first UPDATE_CONTACT creates the contacts row", async () => {
      const { caseId } = await v2Case(f);
      assert.equal(await contactRow(f, caseId), undefined);
      await update(caseId, { bestContactNote: "Text first" });
      const contact = await contactRow(f, caseId);
      assert.equal(contact.workspace_id, f.workspaceId);
      assert.equal(contact.best_contact_note, "Text first");
      assert.equal(contact.phone, null);
    });

    await t.test("the owner may not update after submitting", async () => {
      const caseId = await submittedV2();
      await assert.rejects(
        update(caseId, { bestContactNote: "Too late" }),
        rejected("FORBIDDEN"),
      );
      assert.equal((await contactRow(f, caseId)).best_contact_note, null);
    });

    await t.test("another applicant and a personless presenter are refused", async () => {
      const { caseId } = await v2Case(f);
      await assert.rejects(
        update(caseId, { bestContactNote: "Not mine" }, f.applicantB),
        rejected("NOT_FOUND"),
      );
      // An applicant cannot speak as a staff person.
      await assert.rejects(
        update(caseId, { bestContactNote: "Posing" }, f.applicantA, f.sam),
        rejected("FORBIDDEN"),
      );
      const submitted = await submittedV2();
      await assert.rejects(
        update(submitted, { bestContactNote: "No person" }, f.presenter, null),
        rejected("FORBIDDEN"),
      );
    });

    await t.test("office staff may update any case they can see", async () => {
      const caseId = await submittedV2();
      await update(caseId, { bestContactNote: "Office called" }, f.presenter, f.sam);
      assert.equal((await contactRow(f, caseId)).best_contact_note, "Office called");
      const [event] = await eventsOf(caseId, "UPDATE_CONTACT");
      assert.equal(event.actor_person_id, f.sam);
    });

    await t.test("a volunteer only on a case they prepare or review", async () => {
      const caseId = await readyV2();
      // Unclaimed: neither volunteer may touch the contact row.
      for (const volunteer of [f.alex, f.morgan])
        await assert.rejects(
          update(caseId, { bestContactNote: "Unclaimed" }, f.presenter, volunteer),
          rejected("FORBIDDEN"),
        );
      await f.act(f.presenter, caseId, f.alex, "CLAIM_PREPARATION", {});
      await update(caseId, { bestContactNote: "Preparer" }, f.presenter, f.alex);
      assert.equal((await contactRow(f, caseId)).best_contact_note, "Preparer");
      await assert.rejects(
        update(caseId, { bestContactNote: "Not yet" }, f.presenter, f.morgan),
        rejected("FORBIDDEN"),
      );
      await f.act(f.presenter, caseId, f.alex, "SUBMIT_REVIEW", {});
      await f.act(f.presenter, caseId, f.morgan, "CLAIM_REVIEW", {});
      await update(caseId, { bestContactTime: ["weekend"] }, f.presenter, f.morgan);
      assert.deepEqual((await contactRow(f, caseId)).best_contact_time, ["weekend"]);
    });

    await t.test("UPDATE_CONTACT never takes a phone, and checks each value's type", async () => {
      const { caseId } = await v2Case(f);
      await save(f, caseId, { tp_phone: "2155550100", sp_phone: "2155550199" });
      const before = await contactRow(f, caseId);
      for (const payload of [
        {},
        { phone: "2155550111" },
        { spousePhone: "2155550111" },
        { tp_phone: "2155550111" },
        { bestContactNote: "Fine", phone: "2155550111" },
        { best_contact_note: "Wrong spelling" },
        { bestContactTime: "weekend" },
        { bestContactTime: ["bogus"] },
        { bestContactTime: ["weekend", "weekend"] },
        { bestContactTime: [1] },
        { bestContactTime: { weekend: true } },
        { bestContactNote: "x".repeat(201) },
        { bestContactNote: 5 },
        { bestContactNote: ["After 5pm"] },
        { bestContactNote: true },
      ])
        await assert.rejects(
          update(caseId, payload),
          rejected("VALIDATION"),
          JSON.stringify(payload),
        );
      assert.deepEqual(await contactRow(f, caseId), before);
      // The limit itself is fine.
      await update(caseId, { bestContactNote: "x".repeat(200) });
      assert.equal((await contactRow(f, caseId)).best_contact_note.length, 200);
    });

    await t.test("a version-1 case has no contacts row to update", async () => {
      const created = await f.createCase(f.applicantA, crypto.randomUUID());
      await assert.rejects(
        update(created.caseId, { bestContactNote: "Hello" }),
        rejected("VALIDATION"),
      );
      assert.equal(await contactRow(f, created.caseId), undefined);
    });

    await t.test("staff record the materials received, and a second call replaces them", async () => {
      const caseId = await submittedV2();
      await record(caseId, ["w2", "photo_id"]);
      let rows = await materialRows(caseId);
      assert.deepEqual(rows.map((row) => row.item), ["photo_id", "w2"]);
      for (const row of rows) {
        assert.equal(row.recorded_by_person_id, f.sam);
        assert.equal(row.workspace_id, f.workspaceId);
        assert.ok(row.received_at instanceof Date);
      }
      await record(caseId, ["ssn_itin"]);
      rows = await materialRows(caseId);
      assert.deepEqual(rows.map((row) => row.item), ["ssn_itin"]);
      await record(caseId, []);
      assert.deepEqual(await materialRows(caseId), []);
      const events = await eventsOf(caseId, "RECORD_MATERIALS");
      assert.deepEqual(
        events.map((event) => event.detail),
        [{ items: ["w2", "photo_id"] }, { items: ["ssn_itin"] }, { items: [] }],
      );
      assert.deepEqual(await clientEventsOf(caseId, "RECORD_MATERIALS"), []);
    });

    await t.test("recording again keeps the items already recorded as they were", async () => {
      const caseId = await readyV2();
      await record(caseId, ["photo_id", "w2"]);
      const [photoBefore] = await materialRows(caseId);
      assert.equal(photoBefore.item, "photo_id");
      assert.equal(photoBefore.recorded_by_person_id, f.sam);
      await f.act(f.presenter, caseId, f.alex, "CLAIM_PREPARATION", {});
      await record(caseId, ["photo_id", "1099int"], f.presenter, f.alex);
      const rows = await materialRows(caseId);
      assert.deepEqual(rows.map((row) => row.item), ["1099int", "photo_id"]);
      const photo = rows.find((row) => row.item === "photo_id");
      assert.equal(photo.recorded_by_person_id, f.sam);
      assert.equal(photo.received_at.getTime(), photoBefore.received_at.getTime());
      const added = rows.find((row) => row.item === "1099int");
      assert.equal(added.recorded_by_person_id, f.alex);
      assert.ok(added.received_at > photoBefore.received_at);
    });

    await t.test("RECORD_MATERIALS works on a version-1 case too", async () => {
      const caseId = await f.readyCase();
      await record(caseId, ["1099nec", "prior_year_1040"]);
      assert.deepEqual(
        (await materialRows(caseId)).map((row) => row.item),
        ["1099nec", "prior_year_1040"],
      );
    });

    await t.test("only staff who may act record materials", async () => {
      const caseId = await readyV2();
      await assert.rejects(record(caseId, ["w2"], f.applicantA, null), rejected("FORBIDDEN"));
      await assert.rejects(record(caseId, ["w2"], f.presenter, null), rejected("FORBIDDEN"));
      await assert.rejects(record(caseId, ["w2"], f.presenter, f.alex), rejected("FORBIDDEN"));
      await f.act(f.presenter, caseId, f.alex, "CLAIM_PREPARATION", {});
      await record(caseId, ["w2"], f.presenter, f.alex);
      assert.deepEqual((await materialRows(caseId)).map((row) => row.item), ["w2"]);
      // A draft only its owner can see is not the office's to record on.
      const { caseId: draft } = await v2Case(f);
      await assert.rejects(record(draft, ["w2"]), rejected("NOT_FOUND"));
    });

    await t.test("the item list is enforced", async () => {
      const caseId = await submittedV2();
      for (const payload of [
        { received: ["passport"] },
        { received: ["w2", "w2"] },
        { received: "w2" },
        { received: [1] },
        { received: ["W2"] },
        { received: ["w2"], extra: true },
        {},
      ])
        await assert.rejects(
          f.act(f.presenter, caseId, f.sam, "RECORD_MATERIALS", payload),
          rejected("VALIDATION"),
          JSON.stringify(payload),
        );
      assert.deepEqual(await materialRows(caseId), []);
    });

    await t.test("an applicant never reads materials; staff do", async () => {
      const caseId = await submittedV2();
      await record(caseId, ["w2"]);
      for (const actor of [f.applicantA, f.applicantB]) {
        const { data, error } = await actor.from("case_materials").select("*");
        assert.equal(error, null);
        assert.deepEqual(data, []);
      }
      const { data, error } = await f.presenter
        .from("case_materials")
        .select("*")
        .eq("case_id", caseId);
      assert.equal(error, null);
      assert.deepEqual(data.map((row) => row.item), ["w2"]);
    });
  } finally {
    await f.close();
  }
});
