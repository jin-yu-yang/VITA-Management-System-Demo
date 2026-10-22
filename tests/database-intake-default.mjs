import test from "node:test";
import assert from "node:assert/strict";
import { createDatabaseFixture } from "./support/database-fixture.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";

// The column default the fixture's workspaces keep, version-2 samples, a
// checkpoint reload that clears a sample's materials and card marks (part 4c,
// Task 5), and the switch-over that makes version 2 the default (migration
// 020, OpenSpec change make-intake-v2-default, spec client-intake).

const KEYS = [
  "preparation_ready",
  "waiting_documents",
  "admin_followup",
  "review_ready",
  "corrections_required",
  "review_approved",
  "rejected",
  "accepted",
];
const NAMES = ["Mei", "Jordan", "Linh", "Dana", "Wei", "Tomas", "Priya", "Marcus"];
const CONTACT_KEYS = ["tp_phone", "sp_phone", "best_contact_time", "best_contact_note"];

const versionsOf = async (f) =>
  (
    await f.sql(
      "select id, default_intake_version from public.workspaces where id = any($1::uuid[]) order by id",
      [[f.workspaceId, f.foreignWorkspaceId]],
    )
  ).rows.map((row) => Number(row.default_intake_version));

const samples = async (f) =>
  (
    await f.sql(
      "select * from public.cases where workspace_id=$1 and fixture order by array_position(vitally_private.fixture_keys(), fixture_key)",
      [f.workspaceId],
    )
  ).rows;

// SUBMIT's contact object, copied from act_submit in 011_intake_v2.sql.
const contactOf = async (f, caseId) =>
  (
    await f.sql(
      `select jsonb_strip_nulls(jsonb_build_object('tp_phone', c.phone, 'sp_phone', c.spouse_phone,
        'best_contact_time', to_jsonb(c.best_contact_time), 'best_contact_note', c.best_contact_note)) as contact
       from public.case_contacts c where c.case_id=$1`,
      [caseId],
    )
  ).rows[0]?.contact;

const missingOf = async (f, row) =>
  (
    await f.sql("select vitally_private.intake_missing($1::smallint,$2::jsonb,$3::jsonb) as missing", [
      row.intake_version,
      JSON.stringify(row.answers),
      JSON.stringify((await contactOf(f, row.id)) ?? {}),
    ])
  ).rows[0].missing;

const columnDefault = async (f) =>
  String(
    (
      await f.sql(
        "select column_default from information_schema.columns where table_schema='public' and table_name='workspaces' and column_name='default_intake_version'",
      )
    ).rows[0].column_default,
  ).trim();

const versionOfCase = async (f, caseId) =>
  Number((await f.sql("select intake_version from public.cases where id=$1", [caseId])).rows[0].intake_version);

test("the column default", async (t) => {
  await t.test("the column default is 2, and a workspace that keeps it is version 2", async () => {
    const f = await createDatabaseFixture();
    try {
      assert.equal(await columnDefault(f), "2");
      assert.deepEqual(await versionsOf(f), [2, 2]);
    } finally {
      await f.close();
    }
  });
});

test("the switch-over (020): new applications are version 2", async (t) => {
  await t.test("a client's new application is version 2", async () => {
    const f = await createDatabaseFixture();
    try {
      const { caseId } = await f.createCase(f.applicantA, crypto.randomUUID(), { answers: {} });
      assert.equal(await versionOfCase(f, caseId), 2);
    } finally {
      await f.close();
    }
  });

  await t.test("the office's new assisted application is version 2", async () => {
    const f = await createDatabaseFixture();
    try {
      const { caseId } = await f.createCase(f.presenter, crypto.randomUUID(), {
        mode: "assisted",
        personId: f.sam,
        answers: {},
      });
      assert.equal(await versionOfCase(f, caseId), 2);
    } finally {
      await f.close();
    }
  });

  await t.test("a reset seeds version-2 samples", async () => {
    const f = await createDatabaseFixture();
    try {
      await f.seedFixtures();
      const rows = await samples(f);
      assert.equal(rows.length, 8);
      for (const row of rows) assert.equal(row.intake_version, 2, row.fixture_key);
    } finally {
      await f.close();
    }
  });
});

test("version-2 samples, the checkpoint, and version-2 round trips", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await t.test("the new private functions are not executable by clients", async () => {
      for (const signature of [
        "vitally_private.fixture_answers_v2(text)",
        "vitally_private.fixture_contact_v2(text)",
      ])
        for (const role of ["anon", "authenticated"]) {
          const { rows } = await f.sql("select has_function_privilege($1, $2::regprocedure, 'execute') as ok", [
            role,
            signature,
          ]);
          assert.equal(rows[0].ok, false, `${role} on ${signature}`);
        }
    });

    await f.seedFixtures();

    await t.test("eight version-2 samples whose answers pass the field checks", async () => {
      const rows = await samples(f);
      assert.equal(rows.length, 8);
      assert.deepEqual(
        rows.map((row) => row.fixture_key),
        KEYS,
      );
      for (const row of rows) {
        assert.equal(row.intake_version, 2, row.fixture_key);
        const { rows: checks } = await f.sql(
          `select a.key, f.field_id is not null as known,
             coalesce(vitally_private.check_intake_value(f, a.value), false) as ok
           from jsonb_each($1::jsonb) a
           left join vitally_private.intake_fields f
             on f.version=2 and f.group_id is null and f.field_id=a.key`,
          [JSON.stringify(row.answers)],
        );
        assert.equal(checks.length, Object.keys(row.answers).length);
        for (const check of checks) {
          assert.equal(check.known, true, `${row.fixture_key}.${check.key} is a field`);
          assert.equal(check.ok, true, `${row.fixture_key}.${check.key} passes`);
        }
        assert.ok(Array.isArray(row.answers.hh) && row.answers.hh.length > 0, "has a household");
        for (const memberRow of row.answers.hh) assert.match(memberRow.member_id, /^[0-9a-f]{32}$/);
        for (const key of CONTACT_KEYS) assert.ok(!(key in row.answers), `no ${key} in answers`);
        assert.deepEqual(
          Object.keys(row.answers).filter((key) => key.startsWith("gcf_")),
          [],
        );
        assert.equal("form_version" in row.answers, false);
      }
    });

    await t.test("each sample has its own name, language and a contact row", async () => {
      const rows = await samples(f);
      assert.deepEqual(
        rows.map((row) => row.answers.tp_first_name),
        NAMES,
      );
      assert.deepEqual(
        rows.map((row) => row.answers.service),
        ["drop_off", "drop_off", "same_day", "online", "drop_off", "same_day", "same_day", "drop_off"],
      );
      assert.deepEqual(
        rows.map((row) => row.answers.language),
        ["mandarin", "cantonese", "cantonese", "english", "mandarin", "english", "english", "english"],
      );
      assert.deepEqual(
        rows.map((row) => row.answers.addr_zip),
        ["19107", "19123", "19148", "19130", "19104", "19146", "19147", "19143"],
      );
      for (const [index, row] of rows.entries()) {
        const contact = (await f.sql("select * from public.case_contacts where case_id=$1", [row.id])).rows;
        assert.equal(contact.length, 1, row.fixture_key);
        assert.equal(contact[0].phone, `215555010${index + 1}`);
        assert.deepEqual(contact[0].best_contact_time, ["weekday_evening"]);
        assert.equal(contact[0].best_contact_note, "Fictional sample; call any weekday evening.");
        assert.deepEqual(row.answers.vc_agree, ["yes"], row.fixture_key);
        assert.equal(row.answers.vc_review, "yes", row.fixture_key);
        assert.equal(row.answers.vc_tp_signature, `${row.answers.tp_first_name} ${row.answers.tp_last_name}`, row.fixture_key);
        assert.equal(row.answers.vc_tp_date, "2026-02-02", row.fixture_key);
        assert.deepEqual(await missingOf(f, row), [], `${row.fixture_key} is complete`);
      }
    });

    await t.test("a checkpoint reload clears materials and card marks, keeps the contact", async () => {
      const [sample] = await samples(f);
      assert.equal(sample.fixture_key, "preparation_ready");
      await f.act(f.presenter, sample.id, f.sam, "RECORD_MATERIALS", { received: ["w2", "photo_id"] });
      await f.act(f.presenter, sample.id, f.sam, "SET_DOCUMENT_CARD", { slotId: "photo_id.tp", status: "later" });
      const count = async (table) =>
        Number((await f.sql(`select count(*) as n from public.${table} where case_id=$1`, [sample.id])).rows[0].n);
      assert.equal(await count("case_materials"), 2);
      assert.equal(await count("case_document_cards"), 1);
      const current = (await f.sql("select revision from public.cases where id=$1", [sample.id])).rows[0];
      const { error } = await f.presenter.rpc("vitally_load_checkpoint", {
        p_action_id: crypto.randomUUID(),
        p_case_id: sample.id,
        p_expected_revision: Number(current.revision),
        p_checkpoint: "intake_ready",
      });
      assert.equal(error, null);
      assert.equal(await count("case_materials"), 0);
      assert.equal(await count("case_document_cards"), 0);
      assert.equal(await count("case_contacts"), 1);
      const after = (await samples(f))[0];
      assert.deepEqual(await missingOf(f, after), []);
    });

    await t.test("a client case round-trips on version 2", async () => {
      const full = makeSampleAnswers({ seed: 0 });
      const keys = Object.keys(full);
      const half = (from, to) => Object.fromEntries(keys.slice(from, to).map((key) => [key, full[key]]));
      const { caseId } = await f.createCase(f.applicantA, crypto.randomUUID(), { answers: {} });
      assert.equal(
        (await f.sql("select intake_version from public.cases where id=$1", [caseId])).rows[0].intake_version,
        2,
      );
      const middle = Math.floor(keys.length / 2);
      await f.act(f.applicantA, caseId, null, "SAVE_ANSWERS", { answers: half(0, middle) });
      await f.act(f.applicantA, caseId, null, "SAVE_ANSWERS", { answers: half(middle, keys.length) });
      await f.act(f.applicantA, caseId, null, "SUBMIT", { confirmed: true });
      const row = (await f.sql("select stage, client_number from public.cases where id=$1", [caseId])).rows[0];
      assert.equal(row.stage, "received");
      assert.ok(Number.isInteger(Number(row.client_number)) && Number(row.client_number) > 0);
    });

    await t.test("an office case round-trips on version 2", async () => {
      const { caseId } = await f.createCase(f.presenter, crypto.randomUUID(), {
        mode: "assisted",
        personId: f.sam,
        answers: {},
      });
      assert.equal(
        (await f.sql("select intake_version from public.cases where id=$1", [caseId])).rows[0].intake_version,
        2,
      );
      await f.act(f.presenter, caseId, f.sam, "SAVE_ANSWERS", {
        answers: makeSampleAnswers({ seed: 0 }),
      });
      await f.act(f.presenter, caseId, f.sam, "SUBMIT", { confirmed: true });
      const row = (await f.sql("select stage, client_number from public.cases where id=$1", [caseId])).rows[0];
      // The office has already screened a client it entered itself.
      assert.equal(row.stage, "screening");
      assert.ok(Number.isInteger(Number(row.client_number)) && Number(row.client_number) > 0);
    });
  } finally {
    await f.close();
  }
});
