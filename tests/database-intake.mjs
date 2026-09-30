import test from "node:test";
import assert from "node:assert/strict";
import {
  createDatabaseFixture,
  applyArgs,
  rejected,
} from "./support/database-fixture.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";
import CATALOGUE from "../src/intake-catalogue-data.mjs";
import {
  checkValue,
  isVisible,
  missingToSubmit,
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
        tp_last_name: "Lin",
      });
      const {
        tp_first_name: _first,
        inc_wages_job_count: _count,
        us_citizen: _citizen,
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
        fields: ["inc_wages_job_count", "tp_first_name", "tp_last_name", "us_citizen"],
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
      const cases = [
        ["tp_first_name", "x".repeat(200)],
        ["tp_first_name", "x".repeat(201)],
        ["tp_first_name", "  "],
        ["tp_first_name", 7],
        ["additional_notes", "x".repeat(5000)],
        ["additional_notes", "x".repeat(5001)],
        ["gcf_tp_signature", "x".repeat(201)],
        // JavaScript counts a character outside the BMP as two.
        ["tp_first_name", "\u{1F600}".repeat(100)],
        ["tp_first_name", "\u{1F600}".repeat(101)],
        ["tp_first_name", "\u4E2D".repeat(200)],
        ["email", "a@b"],
        ["email", "a b@c"],
        ["email", "@b"],
        ["email", "a@"],
        ["email", "a@b@c"],
        ["email", `${"a".repeat(250)}@b.cd`],
        ["tp_phone", "(215) 555-0100"],
        ["tp_phone", "215-555-01000"],
        ["tp_phone", "555-0100"],
        ["addr_zip", "19107"],
        ["addr_zip", "19107-1234"],
        ["tp_dob", "2024-02-29"],
        ["tp_dob", "2025-02-29"],
        ["tp_dob", "2025-04-31"],
        ["tp_dob", "0050-01-01"],
        ["tp_dob", "1980-1-2"],
        ["spouse_death_year", "2020"],
        ["spouse_death_year", "20201"],
        ["inc_wages_job_count", "123456"],
        ["inc_wages_job_count", "1234567"],
        ["inc_wages_job_count", "1.5"],
        ["inc_wages_job_count", "-1"],
        ["marital_status", "never_married"],
        ["marital_status", "single"],
        ["marital_status", "Single"],
        ["multi_state", "not_sure"],
        ["claimed_by_other", "maybe"],
        ["us_citizen", ["me", "spouse"]],
        ["us_citizen", ["none"]],
        ["us_citizen", ["none", "me"]],
        ["us_citizen", ["me", "me"]],
        ["us_citizen", ["someone"]],
        ["us_citizen", "me"],
        ["us_citizen", [1]],
        ["best_contact_time", ["weekend", "any_time"]],
        ["best_contact_time", ["weekend", "weekend"]],
        ["hh", [member()]],
        ["hh", [member({ months_lived: "12" })]],
        ["hh", [member({ months_lived: "13" })]],
        ["hh", [member({ months_lived: "0" })]],
        ["hh", [member({ dob: null, first_name: "" })]],
        ["hh", [{}]],
        ["hh", [null]],
        ["hh", [[]]],
        ["hh", [member({ extra: "x" })]],
        ["hh", Array.from({ length: 10 }, () => ({}))],
        ["hh", Array.from({ length: 11 }, () => ({}))],
        ["hh", "Bo"],
        ["tp_first_name", null],
        ["tp_first_name", ""],
        ["us_citizen", []],
      ];
      for (const [id, value] of cases) {
        const server = (
          await f.sql(
            "select vitally_private.check_intake_value(i, $2::jsonb) as ok from vitally_private.intake_fields i where version=2 and field_id=$1",
            [id, JSON.stringify(value)],
          )
        ).rows[0].ok;
        assert.equal(server, checkValue(byId.get(id), value) === null, `${id} ${JSON.stringify(value).slice(0, 60)}`);
      }
      const sets = [
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
