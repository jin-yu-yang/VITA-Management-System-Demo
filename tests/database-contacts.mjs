import test from "node:test";
import assert from "node:assert/strict";
import {
  createDatabaseFixture,
  applyArgs,
  contactArgs,
  editContactArgs,
  rejected,
  SAMPLE_CONTACT,
} from "./support/database-fixture.mjs";
// OpenSpec change add-contact-log (design D1-D6, D11, D12): the contact log's
// two RPCs, its staff-only tables, the move of the old follow-up attempts and
// the refusal of RECORD_CONTACT.
const ESCALATION_REASON = "No response to the document request.";
const SEEDED_NOTE = "Called during office hours. No answer, so a message was left.";
const ENTRY_FIELDS = [
  "direction",
  "contacted_at",
  "with_whom",
  "other_name",
  "method",
  "purpose",
  "outcome",
  "note",
];
// One refused call: its SQLSTATE and no receipt behind it.
async function refuse(f, client, fn, args, code, label = "") {
  const { error } = await client.rpc(fn, args);
  assert.equal(error?.code, code, `${fn} ${label} ${JSON.stringify(args.p_entry)}`);
  assert.equal(await f.receiptsFor(args.p_action_id), 0);
}
// The ISO instant for a New York wall time `days` days from today, with the
// zone's offset for that date (daylight saving included).
function newYorkTime(days, hour, minute) {
  const day = new Date(Date.now() + days * 86_400_000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZoneName: "longOffset",
    })
      .formatToParts(day)
      .map((part) => [part.type, part.value]),
  );
  const offset = parts.timeZoneName.replace("GMT", "") || "+00:00";
  const hh = String(hour).padStart(2, "0"),
    mm = String(minute).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${hh}:${mm}:00${offset}`;
}
const contactRow = async (f, contactId) =>
  (await f.sql("select * from public.contact_log where id=$1", [contactId])).rows[0];
const versionRows = async (f, contactId) =>
  (
    await f.sql(
      "select * from public.contact_log_versions where contact_id=$1 order by version",
      [contactId],
    )
  ).rows;
const caseCounts = async (f, caseId) => {
  const [row] = (
    await f.sql(
      `select c.revision,
        (select count(*) from public.case_events e where e.case_id=c.id) as events,
        (select count(*) from public.client_events e where e.case_id=c.id) as client_events
       from public.cases c where c.id=$1`,
      [caseId],
    )
  ).rows;
  return {
    revision: Number(row.revision),
    events: Number(row.events),
    clientEvents: Number(row.client_events),
  };
};
// A client case Alex prepares with one open document request and an open
// follow-up task assigned to Sam (ESCALATE_CONTACT, as pendingCase does).
async function followupCase(f) {
  const caseId = await f.readyCase();
  await f.act(f.presenter, caseId, f.alex, "CLAIM_PREPARATION", {});
  await f.act(f.presenter, caseId, f.alex, "REQUEST_DOCUMENT", f.sampleRequest);
  await f.act(f.presenter, caseId, f.alex, "ESCALATE_CONTACT", {
    reason: ESCALATION_REASON,
  });
  const [followup] = (
    await f.sql("select id from public.admin_followups where case_id=$1", [caseId])
  ).rows;
  return { caseId, followupId: followup.id };
}

test("the contact log", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await t.test("each staff persona logs a contact at any stage", async () => {
      for (const [caseId, personId] of [
        [await f.readyCase(), f.alex],
        [await f.preparedCase(), f.morgan],
        [await f.assistedCase(), f.sam],
      ]) {
        const before = await caseCounts(f, caseId);
        const entry = SAMPLE_CONTACT();
        const args = contactArgs({ caseId, personId, entry });
        const { data, error } = await f.presenter.rpc("vitally_log_contact", args);
        assert.equal(error, null);
        assert.equal(data.actionId, args.p_action_id);
        assert.equal(data.caseId, caseId);
        assert.equal(data.revision, 1);
        const row = await contactRow(f, data.contactId);
        assert.equal(row.case_id, caseId);
        assert.equal(row.workspace_id, f.workspaceId);
        assert.equal(Number(row.revision), 1);
        assert.equal(row.edited_at, null);
        assert.equal(row.followup_id, null);
        assert.equal(row.logged_by_person_id, personId);
        assert.equal(row.logged_by_user_id, f.presenterUserId);
        assert.ok(Math.abs(row.logged_at.getTime() - Date.now()) < 60_000);
        assert.equal(row.contacted_at.getTime(), new Date(entry.contactedAt).getTime());
        assert.equal(row.direction, "outgoing");
        assert.equal(row.with_whom, "client");
        assert.equal(row.other_name, null);
        assert.equal(row.method, "phone");
        assert.equal(row.purpose, "go_over_return");
        assert.equal(row.outcome, "reached");
        assert.equal(row.note, entry.note);
        const versions = await versionRows(f, data.contactId);
        assert.equal(versions.length, 1);
        const [first] = versions;
        assert.equal(Number(first.version), 1);
        assert.equal(first.workspace_id, row.workspace_id);
        assert.equal(first.case_id, row.case_id);
        assert.equal(first.edited_by_person_id, personId);
        assert.equal(first.edited_by_user_id, f.presenterUserId);
        assert.equal(first.created_at.getTime(), row.logged_at.getTime());
        for (const field of ENTRY_FIELDS)
          assert.deepEqual(first[field], row[field], field);
        assert.deepEqual(await caseCounts(f, caseId), before);
      }
    });

    await t.test("a past contact time is kept", async () => {
      const caseId = await f.readyCase();
      const contactedAt = newYorkTime(-1, 14, 10);
      const { contactId } = await f.logContact(f.presenter, caseId, f.alex, {
        ...SAMPLE_CONTACT(),
        contactedAt,
      });
      const row = await contactRow(f, contactId);
      assert.equal(row.contacted_at.getTime(), new Date(contactedAt).getTime());
      assert.ok(Math.abs(row.logged_at.getTime() - Date.now()) < 60_000);
    });

    await t.test("outcomes follow the method", async () => {
      const caseId = await f.readyCase();
      const allowed = [
        ...["phone", "video"].flatMap((method) =>
          ["reached", "no_answer", "left_voicemail", "wrong_number"].map((outcome) => [
            "outgoing",
            method,
            outcome,
          ]),
        ),
        ...["text", "email"].flatMap((method) =>
          ["sent", "replied", "failed"].map((outcome) => ["outgoing", method, outcome]),
        ),
        ["outgoing", "in_person", "reached"],
        ...["phone", "text", "email", "in_person", "video"].map((method) => [
          "incoming",
          method,
          "reached",
        ]),
      ];
      for (const [direction, method, outcome] of allowed)
        await f.logContact(f.presenter, caseId, f.alex, {
          ...SAMPLE_CONTACT(),
          direction,
          method,
          outcome,
        });
      for (const [direction, method, outcome] of [
        ["outgoing", "text", "no_answer"],
        ["outgoing", "phone", "sent"],
        ["outgoing", "in_person", "no_answer"],
        ["incoming", "phone", "no_answer"],
        ["incoming", "text", "sent"],
      ])
        await refuse(
          f,
          f.presenter,
          "vitally_log_contact",
          contactArgs({
            caseId,
            personId: f.alex,
            entry: { ...SAMPLE_CONTACT(), direction, method, outcome },
          }),
          "VT007",
        );
    });

    await t.test("an entry that breaks a rule is refused", async () => {
      const caseId = await f.readyCase();
      const base = SAMPLE_CONTACT();
      const { note: _note, ...missingNote } = base;
      for (const entry of [
        { ...base, withWhom: "other", otherName: null },
        { ...base, withWhom: "other", otherName: "  " },
        { ...base, withWhom: "client", otherName: "Pat Example" },
        { ...base, withWhom: "other", otherName: "x".repeat(81) },
        { ...base, note: "x".repeat(1001) },
        { ...base, method: "fax" },
        { ...base, purpose: "chat" },
        { ...base, direction: "sideways" },
        { ...base, extra: 1 },
        missingNote,
        { ...base, contactedAt: new Date(Date.now() + 10 * 60_000).toISOString() },
        { ...base, contactedAt: "yesterday" },
      ])
        await refuse(
          f,
          f.presenter,
          "vitally_log_contact",
          contactArgs({ caseId, personId: f.alex, entry }),
          "VT007",
        );
      // The positive control: a named other within the limit.
      const { contactId } = await f.logContact(f.presenter, caseId, f.alex, {
        ...base,
        withWhom: "other",
        otherName: "  Pat Example ",
      });
      assert.equal((await contactRow(f, contactId)).other_name, "Pat Example");
    });

    await t.test("a blank note is stored as no note", async () => {
      const caseId = await f.readyCase();
      for (const note of ["   ", "", null]) {
        const { contactId } = await f.logContact(f.presenter, caseId, f.alex, {
          ...SAMPLE_CONTACT(),
          note,
        });
        assert.equal((await contactRow(f, contactId)).note, null);
        assert.equal((await versionRows(f, contactId))[0].note, null);
      }
    });

    await t.test("who may log", async () => {
      const caseId = await f.readyCase();
      for (const [client, personId] of [
        [f.applicantA, f.alex],
        [f.applicantA, null],
        [f.presenter, null],
        [f.presenter, f.foreignPeople.sam],
      ])
        await refuse(
          f,
          client,
          "vitally_log_contact",
          contactArgs({ caseId, personId, entry: SAMPLE_CONTACT() }),
          "VT001",
          String(personId),
        );
      const draft = await f.draftCase(f.applicantA);
      await refuse(
        f,
        f.presenter,
        "vitally_log_contact",
        contactArgs({ caseId: draft.caseId, personId: f.alex, entry: SAMPLE_CONTACT() }),
        "VT002",
      );
      const other = await f.sql("select count(*)::int as n from public.contact_log where case_id in ($1,$2)", [
        caseId,
        draft.caseId,
      ]);
      assert.equal(other.rows[0].n, 0);
    });

    await t.test("a contact linked to a task", async () => {
      const { caseId, followupId } = await followupCase(f);
      const entry = { ...SAMPLE_CONTACT(), outcome: "no_answer" };
      const { contactId } = await f.logContact(f.presenter, caseId, f.sam, entry, followupId);
      assert.equal((await contactRow(f, contactId)).followup_id, followupId);
      await refuse(
        f,
        f.presenter,
        "vitally_log_contact",
        contactArgs({ caseId, personId: f.alex, followupId, entry }),
        "VT001",
      );
      const other = await followupCase(f);
      await refuse(
        f,
        f.presenter,
        "vitally_log_contact",
        contactArgs({ caseId, personId: f.sam, followupId: other.followupId, entry }),
        "VT001",
      );
      await f.act(f.presenter, caseId, f.sam, "RESOLVE_FOLLOWUP", {
        followupId,
        outcome: "reached",
        note: "Spoke with the client.",
      });
      await refuse(
        f,
        f.presenter,
        "vitally_log_contact",
        contactArgs({ caseId, personId: f.sam, followupId, entry }),
        "VT004",
      );
      // Resolving creates no log entry of its own.
      const count = await f.sql("select count(*)::int as n from public.contact_log where case_id=$1", [caseId]);
      assert.equal(count.rows[0].n, 1);
    });

    await t.test("the logger and an admin edit, and every version is kept", async () => {
      const { caseId, followupId } = await followupCase(f);
      const first = newYorkTime(-1, 10, 0),
        second = newYorkTime(-1, 9, 30);
      const sent = {
        ...SAMPLE_CONTACT(),
        contactedAt: first,
        method: "text",
        outcome: "sent",
        purpose: "request_documents",
      };
      const { contactId } = await f.logContact(f.presenter, caseId, f.alex, sent);
      const logged = await contactRow(f, contactId);
      const edited = await f.editContact(f.presenter, contactId, f.alex, {
        ...sent,
        outcome: "replied",
      });
      assert.deepEqual(edited, {
        actionId: edited.actionId,
        contactId,
        caseId,
        revision: 2,
      });
      const corrected = await f.editContact(f.presenter, contactId, f.sam, {
        ...sent,
        outcome: "replied",
        contactedAt: second,
      });
      assert.equal(corrected.revision, 3);
      const row = await contactRow(f, contactId);
      assert.equal(Number(row.revision), 3);
      assert.ok(row.edited_at);
      assert.equal(row.outcome, "replied");
      assert.equal(row.contacted_at.getTime(), new Date(second).getTime());
      assert.equal(row.logged_by_person_id, f.alex);
      assert.equal(row.logged_at.getTime(), logged.logged_at.getTime());
      assert.equal(row.followup_id, null);
      const versions = await versionRows(f, contactId);
      assert.deepEqual(
        versions.map((v) => [Number(v.version), v.outcome, v.contacted_at.getTime(), v.edited_by_person_id]),
        [
          [1, "sent", new Date(first).getTime(), f.alex],
          [2, "replied", new Date(first).getTime(), f.alex],
          [3, "replied", new Date(second).getTime(), f.sam],
        ],
      );
      // The task link is fixed at logging: a linked entry stays linked.
      const linked = await f.logContact(
        f.presenter,
        caseId,
        f.sam,
        { ...SAMPLE_CONTACT(), outcome: "no_answer" },
        followupId,
      );
      await f.editContact(f.presenter, linked.contactId, f.sam, {
        ...SAMPLE_CONTACT(),
        outcome: "left_voicemail",
      });
      assert.equal((await contactRow(f, linked.contactId)).followup_id, followupId);
    });

    await t.test("another persona cannot edit", async () => {
      const caseId = await f.readyCase();
      const { contactId } = await f.logContact(f.presenter, caseId, f.morgan, SAMPLE_CONTACT());
      for (const [client, personId, code] of [
        [f.presenter, f.alex, "VT001"],
        [f.presenter, null, "VT001"],
        [f.presenter, f.foreignPeople.sam, "VT001"],
        [f.applicantA, null, "VT001"],
      ])
        await refuse(
          f,
          client,
          "vitally_edit_contact",
          editContactArgs({ contactId, revision: 1, personId, entry: SAMPLE_CONTACT() }),
          code,
          String(personId),
        );
      await refuse(
        f,
        f.presenter,
        "vitally_edit_contact",
        editContactArgs({
          contactId: crypto.randomUUID(),
          revision: 1,
          personId: f.sam,
          entry: SAMPLE_CONTACT(),
        }),
        "VT002",
      );
      assert.equal(Number((await contactRow(f, contactId)).revision), 1);
      // An admin corrects someone else's entry; the logger stays Morgan.
      await f.editContact(f.presenter, contactId, f.sam, { ...SAMPLE_CONTACT(), note: "Corrected." });
      assert.equal((await contactRow(f, contactId)).logged_by_person_id, f.morgan);
    });

    await t.test("a stale edit is a conflict", async () => {
      const caseId = await f.readyCase();
      const { contactId } = await f.logContact(f.presenter, caseId, f.morgan, SAMPLE_CONTACT());
      await f.editContact(f.presenter, contactId, f.morgan, { ...SAMPLE_CONTACT(), note: "First." });
      await refuse(
        f,
        f.presenter,
        "vitally_edit_contact",
        editContactArgs({
          contactId,
          revision: 1,
          personId: f.sam,
          entry: { ...SAMPLE_CONTACT(), note: "Second." },
        }),
        "VT003",
      );
      assert.equal((await contactRow(f, contactId)).note, "First.");
      assert.equal((await versionRows(f, contactId)).length, 2);
    });

    await t.test("a replay returns the same receipt", async () => {
      const caseId = await f.readyCase();
      const args = contactArgs({ caseId, personId: f.alex, entry: SAMPLE_CONTACT() });
      const one = await f.presenter.rpc("vitally_log_contact", args);
      const two = await f.presenter.rpc("vitally_log_contact", args);
      assert.equal(one.error, null);
      assert.equal(two.error, null);
      assert.deepEqual(two.data, one.data);
      const count = await f.sql("select count(*)::int as n from public.contact_log where case_id=$1", [caseId]);
      assert.equal(count.rows[0].n, 1);
      const { error } = await f.presenter.rpc("vitally_log_contact", {
        ...args,
        p_entry: { ...args.p_entry, note: "Another note." },
      });
      assert.equal(error?.code, "VT007");
      const editArgs = editContactArgs({
        contactId: one.data.contactId,
        revision: 1,
        personId: f.alex,
        entry: { ...args.p_entry, outcome: "no_answer" },
      });
      const e1 = await f.presenter.rpc("vitally_edit_contact", editArgs);
      const e2 = await f.presenter.rpc("vitally_edit_contact", editArgs);
      assert.equal(e1.error, null);
      assert.deepEqual(e2.data, e1.data);
      assert.equal((await versionRows(f, one.data.contactId)).length, 2);
    });

    await t.test("nobody deletes or writes the tables directly", async () => {
      const caseId = await f.readyCase();
      const { contactId } = await f.logContact(f.presenter, caseId, f.alex, SAMPLE_CONTACT());
      const before = {
        row: await contactRow(f, contactId),
        versions: await versionRows(f, contactId),
      };
      for (const client of [f.presenter, f.applicantA]) {
        for (const [table, key] of [
          ["contact_log", "id"],
          ["contact_log_versions", "contact_id"],
        ]) {
          const deleted = await client.from(table).delete().eq(key, contactId).select();
          assert.ok(deleted.error || deleted.data.length === 0, `delete ${table}`);
          const updated = await client
            .from(table)
            .update({ note: "Overwritten." })
            .eq(key, contactId)
            .select();
          assert.ok(updated.error || updated.data.length === 0, `update ${table}`);
        }
        const inserted = await client.from("contact_log").insert({
          workspace_id: f.workspaceId,
          case_id: caseId,
          logged_by_user_id: f.presenterUserId,
          logged_by_person_id: f.alex,
          direction: "outgoing",
          contacted_at: new Date().toISOString(),
          with_whom: "client",
          method: "phone",
          purpose: "other",
          outcome: "reached",
        });
        assert.ok(inserted.error, "insert contact_log");
        const version = await client.from("contact_log_versions").insert({
          contact_id: contactId,
          version: 2,
          workspace_id: f.workspaceId,
          case_id: caseId,
          edited_by_user_id: f.presenterUserId,
          edited_by_person_id: f.alex,
          direction: "outgoing",
          contacted_at: new Date().toISOString(),
          with_whom: "client",
          method: "phone",
          purpose: "other",
          outcome: "reached",
        });
        assert.ok(version.error, "insert contact_log_versions");
      }
      assert.deepEqual(
        { row: await contactRow(f, contactId), versions: await versionRows(f, contactId) },
        before,
      );
      const count = await f.sql("select count(*)::int as n from public.contact_log where case_id=$1", [caseId]);
      assert.equal(count.rows[0].n, 1);
    });

    await t.test("a client reads nothing", async () => {
      const caseId = await f.readyCase();
      const { contactId } = await f.logContact(f.presenter, caseId, f.alex, SAMPLE_CONTACT());
      const own = await f.applicantA.from("cases").select("id").eq("id", caseId);
      assert.deepEqual(own.data, [{ id: caseId }]);
      for (const table of ["contact_log", "contact_log_versions"]) {
        const client = await f.applicantA.from(table).select("*").eq("case_id", caseId);
        assert.equal(client.error, null);
        assert.deepEqual(client.data, [], table);
        const staff = await f.presenter.from(table).select("*").eq("case_id", caseId);
        assert.equal(staff.error, null);
        assert.equal(staff.data.length, 1, table);
      }
      const staff = await f.presenter.from("contact_log").select("id").eq("id", contactId);
      assert.deepEqual(staff.data, [{ id: contactId }]);
    });

    await t.test("the old attempts are moved once", async () => {
      const { caseId, followupId } = await followupCase(f);
      const attempts = [
        ["no_answer", "Left a fictional message.", "2026-03-02T09:15:00-05:00", "no_answer", "Left a fictional message."],
        ["reached", "Client will bring the record.", "2026-03-03T10:00:00-05:00", "reached", "Client will bring the record."],
        [
          "no_further_contact",
          "Has what she needs.",
          "2026-03-04T11:00:00-05:00",
          "reached",
          "Client asked for no further contact. Has what she needs.",
        ],
        [
          "closure_requested",
          "Will file elsewhere.",
          "2026-03-05T12:00:00-05:00",
          "reached",
          "Client asked to close the case. Will file elsewhere.",
        ],
      ];
      for (const [outcome, note, createdAt] of attempts)
        await f.sql(
          "insert into public.contact_attempts(workspace_id,case_id,followup_id,actor_user_id,actor_person_id,outcome,note,created_at) values($1,$2,$3,$4,$5,$6,$7,$8)",
          [f.workspaceId, caseId, followupId, f.presenterUserId, f.sam, outcome, note, createdAt],
        );
      const moved = await f.sql("select vitally_private.move_contact_attempts() as n");
      assert.equal(moved.rows[0].n, 4);
      const left = await f.sql("select count(*)::int as n from public.contact_attempts where case_id=$1", [caseId]);
      assert.equal(left.rows[0].n, 0);
      const rows = (
        await f.sql("select * from public.contact_log where case_id=$1 order by contacted_at", [caseId])
      ).rows;
      assert.equal(rows.length, 4);
      for (const [index, [, , createdAt, outcome, note]] of attempts.entries()) {
        const row = rows[index];
        const at = new Date(createdAt).getTime();
        assert.equal(row.followup_id, followupId);
        assert.equal(row.direction, "outgoing");
        assert.equal(row.method, "phone");
        assert.equal(row.with_whom, "client");
        assert.equal(row.other_name, null);
        assert.equal(row.purpose, "request_documents");
        assert.equal(row.contacted_at.getTime(), at);
        assert.equal(row.logged_at.getTime(), at);
        assert.equal(row.logged_by_person_id, f.sam);
        assert.equal(row.logged_by_user_id, f.presenterUserId);
        assert.equal(Number(row.revision), 1);
        assert.equal(row.edited_at, null);
        assert.equal(row.outcome, outcome);
        assert.equal(row.note, note);
        const versions = await versionRows(f, row.id);
        assert.equal(versions.length, 1);
        assert.equal(Number(versions[0].version), 1);
        assert.equal(versions[0].created_at.getTime(), at);
        assert.equal(versions[0].edited_by_person_id, f.sam);
        assert.equal(versions[0].edited_by_user_id, f.presenterUserId);
        for (const field of ENTRY_FIELDS)
          assert.deepEqual(versions[0][field], row[field], field);
      }
      // Nothing left to move a second time.
      const again = await f.sql("select vitally_private.move_contact_attempts() as n");
      assert.equal(again.rows[0].n, 0);
    });

    await t.test("RECORD_CONTACT refuses new requests", async () => {
      const { caseId, followupId } = await followupCase(f);
      await assert.rejects(
        () =>
          f.act(f.presenter, caseId, f.sam, "RECORD_CONTACT", {
            followupId,
            outcome: "no_answer",
            note: "Left a message.",
          }),
        rejected("VALIDATION"),
      );
      for (const table of ["contact_attempts", "contact_log"]) {
        const count = await f.sql(`select count(*)::int as n from public.${table} where case_id=$1`, [caseId]);
        assert.equal(count.rows[0].n, 0, table);
      }
      // A receipt accepted before the change still replays.
      const [{ revision }] = (await f.sql("select revision from public.cases where id=$1", [caseId])).rows;
      const args = applyArgs({
        caseId,
        revision: Number(revision),
        personId: f.sam,
        type: "RECORD_CONTACT",
        payload: { followupId, note: "Left a message.", outcome: "no_answer" },
      });
      const stored = { actionId: args.p_action_id, caseId, revision: Number(revision) + 1 };
      await f.sql(
        `insert into public.action_receipts(workspace_id,actor_user_id,action_id,operation,request_digest,actor_person_id,generation,target_id,receipt)
         select $1,$2,$3,'RECORD_CONTACT',
          encode(extensions.digest(jsonb_build_object('operation','RECORD_CONTACT','caseId',$4::uuid,'expectedRevision',$5::bigint,'personId',$6::uuid,'payload',$7::jsonb)::text,'sha256'),'hex'),
          $6,w.fixture_generation,$4,$8
         from public.workspaces w where w.id=$1`,
        [
          f.workspaceId,
          f.presenterUserId,
          args.p_action_id,
          caseId,
          args.p_expected_revision,
          f.sam,
          JSON.stringify(args.p_payload),
          JSON.stringify(stored),
        ],
      );
      const { data, error } = await f.presenter.rpc("vitally_apply_action", args);
      assert.equal(error, null);
      assert.deepEqual(data, stored);
    });

    await t.test("the sample follow-up seeds a log entry", async () => {
      await f.seedFixtures();
      const byKey = Object.fromEntries((await f.readFixtureCases()).map((row) => [row.fixtureKey, row]));
      const seededEntries = async (caseId) =>
        (await f.sql("select * from public.contact_log where case_id=$1", [caseId])).rows;
      const checkSeeded = async (caseId) => {
        const [followup] = (
          await f.sql("select id from public.admin_followups where case_id=$1", [caseId])
        ).rows;
        const entries = await seededEntries(caseId);
        assert.equal(entries.length, 1);
        const [entry] = entries;
        assert.equal(entry.followup_id, followup.id);
        assert.equal(entry.logged_by_person_id, f.sam);
        assert.equal(entry.direction, "outgoing");
        assert.equal(entry.method, "phone");
        assert.equal(entry.with_whom, "client");
        assert.equal(entry.purpose, "request_documents");
        assert.equal(entry.outcome, "no_answer");
        assert.equal(entry.note, SEEDED_NOTE);
        assert.equal((await versionRows(f, entry.id)).length, 1);
        const attempts = await f.sql("select count(*)::int as n from public.contact_attempts where case_id=$1", [caseId]);
        assert.equal(attempts.rows[0].n, 0);
      };
      await checkSeeded(byKey.admin_followup.id);
      // A checkpoint onto the follow-up scenario seeds it on another case too.
      const target = byKey.waiting_documents;
      await f.logContact(f.presenter, target.id, f.alex, SAMPLE_CONTACT());
      const loaded = await f.presenter.rpc("vitally_load_checkpoint", {
        p_action_id: crypto.randomUUID(),
        p_case_id: target.id,
        p_expected_revision: target.revision,
        p_checkpoint: "admin_followup_needed",
      });
      assert.equal(loaded.error, null);
      await checkSeeded(target.id);
      // Loading another checkpoint clears the case's entries.
      const back = await f.presenter.rpc("vitally_load_checkpoint", {
        p_action_id: crypto.randomUUID(),
        p_case_id: target.id,
        p_expected_revision: loaded.data.revision,
        p_checkpoint: "document_requested",
      });
      assert.equal(back.error, null);
      assert.deepEqual(await seededEntries(target.id), []);
      // A reset removes the old samples' entries with the samples.
      const oldIds = Object.values(byKey).map((row) => row.id);
      await f.seedFixtures();
      const leftover = await f.sql(
        "select count(*)::int as n from public.contact_log where case_id = any($1::uuid[])",
        [oldIds],
      );
      assert.equal(leftover.rows[0].n, 0);
      const fresh = Object.fromEntries((await f.readFixtureCases()).map((row) => [row.fixtureKey, row]));
      await checkSeeded(fresh.admin_followup.id);
    });
  } finally {
    await f.close();
  }
});
