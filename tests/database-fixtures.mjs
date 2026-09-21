import test from "node:test";
import assert from "node:assert/strict";
import {
  createDatabaseFixture,
  applyArgs,
} from "./support/database-fixture.mjs";
import { REFERENCE_PATTERN } from "../src/contracts.mjs";
import { INTAKE_ANSWER_KEYS } from "../src/domain.mjs";

// The five checkpoint names the browser may ask for, and the scenario each one
// produces. `corrections_required` is both a scenario key and a checkpoint
// name; the other four are deliberately named for the moment they restore.
const CHECKPOINTS = Object.freeze({
  intake_ready: "preparation_ready",
  document_requested: "waiting_documents",
  admin_followup_needed: "admin_followup",
  ready_for_review: "review_ready",
  corrections_required: "corrections_required",
});

// What each seeded scenario must actually hold. Every number here is asserted
// against the database rather than against the seeding code, so a scenario
// that stops writing its records fails rather than quietly shrinking.
const SCENARIOS = Object.freeze({
  preparation_ready: {
    stage: "preparation_ready",
    preparer: null,
    reviewer: null,
    version: 0,
    participants: 0,
    requests: [],
    documents: 0,
    followups: [],
    attempts: 0,
    reviews: [],
    events: 2,
    clientEvents: 2,
  },
  waiting_documents: {
    stage: "preparing",
    preparer: "alex",
    reviewer: null,
    version: 0,
    participants: 1,
    requests: ["open"],
    documents: 0,
    followups: [],
    attempts: 0,
    reviews: [],
    events: 4,
    clientEvents: 4,
  },
  admin_followup: {
    stage: "preparing",
    preparer: "alex",
    reviewer: null,
    version: 0,
    participants: 1,
    requests: ["open"],
    documents: 0,
    followups: ["open"],
    attempts: 1,
    reviews: [],
    events: 6,
    clientEvents: 4,
  },
  review_ready: {
    stage: "review_ready",
    preparer: "alex",
    reviewer: null,
    version: 1,
    participants: 1,
    requests: ["verified"],
    documents: 1,
    followups: [],
    attempts: 0,
    reviews: [],
    events: 7,
    clientEvents: 7,
  },
  corrections_required: {
    stage: "corrections_required",
    preparer: "alex",
    reviewer: null,
    version: 1,
    participants: 1,
    requests: [],
    documents: 0,
    followups: [],
    attempts: 0,
    reviews: ["corrections_requested"],
    events: 6,
    clientEvents: 6,
  },
  review_approved: {
    stage: "review_approved",
    preparer: "alex",
    reviewer: "morgan",
    version: 2,
    participants: 1,
    requests: [],
    documents: 0,
    followups: [],
    attempts: 0,
    reviews: ["corrections_requested", "approved"],
    events: 9,
    clientEvents: 9,
  },
});

// A reset seeds one history entry per recorded step plus the `FIXTURE_SEEDED`
// marker, and the case starts one revision above the entries it shows.
const seededRevision = (key) => SCENARIOS[key].events + 2;

const loadCheckpoint = (client, caseId, revision, checkpoint, actionId) =>
  client.rpc("vitally_load_checkpoint", {
    p_action_id: actionId ?? crypto.randomUUID(),
    p_case_id: caseId,
    p_expected_revision: revision,
    p_checkpoint: checkpoint,
  });

const rowsFor = async (f, table, caseId, order = "created_at,id") =>
  (
    await f.sql(
      `select * from public.${table} where case_id=$1 order by ${order}`,
      [caseId],
    )
  ).rows;

const generationOf = async (f) =>
  Number(
    (
      await f.sql("select fixture_generation from public.workspaces where id=$1", [
        f.workspaceId,
      ])
    ).rows[0].fixture_generation,
  );

const fixtureByKey = async (f) =>
  Object.fromEntries((await f.readFixtureCases()).map((row) => [row.fixtureKey, row]));

// Every record the scenario table describes, read through the privileged
// connection and asserted explicitly. A read that errors throws here rather
// than returning an empty list that would read as "nothing to see".
async function assertScenario(f, caseId, key, { revision } = {}) {
  const expected = SCENARIOS[key];
  const [row] = (await f.sql("select * from public.cases where id=$1", [caseId])).rows;
  assert.ok(row, `${key} case exists`);
  assert.equal(row.stage, expected.stage, `${key} stage`);
  assert.equal(row.intake_verified, true, `${key} intake`);
  assert.equal(
    Number(row.preparation_version),
    expected.version,
    `${key} preparation version`,
  );
  assert.equal(
    row.preparer_id,
    expected.preparer ? f[expected.preparer] : null,
    `${key} preparer`,
  );
  assert.equal(
    row.reviewer_id,
    expected.reviewer ? f[expected.reviewer] : null,
    `${key} reviewer`,
  );
  if (revision !== undefined)
    assert.equal(Number(row.revision), revision, `${key} revision`);
  const participants = await rowsFor(f, "preparation_participants", caseId, "person_id");
  assert.equal(participants.length, expected.participants, `${key} participants`);
  if (expected.participants)
    assert.deepEqual(
      participants.map((entry) => entry.person_id),
      [f.alex],
      `${key} participant is the preparer`,
    );
  const requests = await rowsFor(f, "document_requests", caseId);
  assert.deepEqual(
    requests.map((entry) => entry.status),
    expected.requests,
    `${key} document requests`,
  );
  const documents = await rowsFor(f, "documents", caseId);
  assert.equal(documents.length, expected.documents, `${key} documents`);
  for (const document of documents) {
    assert.equal(document.request_id, requests[0].id, `${key} document request`);
    assert.equal(document.filename, f.sampleFilename, `${key} document filename`);
  }
  const followups = await rowsFor(f, "admin_followups", caseId);
  assert.deepEqual(
    followups.map((entry) => entry.status),
    expected.followups,
    `${key} follow-ups`,
  );
  for (const followup of followups) {
    assert.equal(followup.assignee_person_id, f.sam, `${key} follow-up assignee`);
    assert.equal(followup.request_id, requests[0].id, `${key} follow-up request`);
    assert.equal(followup.resolved_at, null, `${key} follow-up unresolved`);
  }
  const attempts = await rowsFor(f, "contact_attempts", caseId);
  assert.equal(attempts.length, expected.attempts, `${key} contact attempts`);
  for (const attempt of attempts) {
    assert.equal(attempt.outcome, "no_answer", `${key} attempt outcome`);
    assert.equal(attempt.actor_person_id, f.sam, `${key} attempt actor`);
    assert.equal(attempt.followup_id, followups[0].id, `${key} attempt follow-up`);
  }
  const reviews = await rowsFor(f, "reviews", caseId, "created_at,id");
  assert.deepEqual(
    reviews.map((entry) => entry.status),
    expected.reviews,
    `${key} review attempts`,
  );
  for (const review of reviews) {
    assert.equal(review.reviewer_person_id, f.morgan, `${key} reviewer person`);
    assert.equal(
      review.findings !== null,
      review.status === "corrections_requested",
      `${key} findings accompany the correction request`,
    );
    assert.equal(
      review.client_contact_status,
      review.status === "approved" ? "pending" : null,
      `${key} client contact`,
    );
  }
  // History: one entry per recorded step, oldest first, plus the single marker
  // that says where these records came from. Every detail is labelled
  // simulated, and a seeded step names no acting account.
  const internal = await rowsFor(f, "case_events", caseId);
  const markers = internal.filter((entry) =>
    ["FIXTURE_SEEDED", "CHECKPOINT"].includes(entry.action),
  );
  const steps = internal.filter(
    (entry) => !["FIXTURE_SEEDED", "CHECKPOINT"].includes(entry.action),
  );
  assert.equal(markers.length, 1, `${key} one origin marker`);
  assert.equal(steps.length, expected.events, `${key} internal history`);
  for (const entry of internal)
    assert.equal(entry.detail.simulated, true, `${key} ${entry.action} simulated`);
  for (const entry of steps)
    assert.equal(entry.actor_user_id, null, `${key} ${entry.action} actor user`);
  const times = internal.map((entry) => new Date(entry.created_at).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b), `${key} history order`);
  const client = await rowsFor(f, "client_events", caseId);
  assert.equal(client.length, expected.clientEvents, `${key} client history`);
  for (const entry of client)
    assert.ok(entry.message.length > 0, `${key} client message`);
}

// ---------------------------------------------------------------------------

// The brief's own test, kept as it was written: a class-created application,
// the setup behind it and the membership that owns it all survive a presenter
// reset, six fixture cases and one fixture assistance request come back, the
// bound client can still read their own fixture case, and an applicant's reset
// is refused without moving anything at all.
test("sample reset preserves class-created applications", async () => {
  const f = await createDatabaseFixture();
  try {
    const created = await f.createCase(f.applicantA, crypto.randomUUID());
    // Snapshot helpers use guarded privileged SQL, scoped to this workspace.
    // stableSetup includes sorted people/capabilities, default Sam, memberships,
    // and durable fixture bindings; fixtureState includes generation and IDs.
    await f.prepareClassCase(created.caseId, f.alex);
    const stableSetup = await f.readStableSetup();
    const membership = await f.readMembership(f.applicantAUserId);
    const before = await f.readStaffCase(created.caseId);
    const { error } = await f.presenter.rpc("vitally_reset_fixtures", {
      p_action_id: crypto.randomUUID(),
    });
    assert.equal(error, null);
    const after = await f.readStaffCase(created.caseId);
    for (const key of ["id", "reference", "ownerUserId", "preparerId", "participants"])
      assert.deepEqual(after[key], before[key]);
    assert.deepEqual(await f.readStableSetup(), stableSetup);
    assert.deepEqual(await f.readMembership(f.applicantAUserId), membership);
    const fixtures = await f.readFixtureCases();
    assert.equal(fixtures.length, 6);
    assert.deepEqual(
      fixtures.map((c) => c.fixtureKey).sort(),
      [...f.fixtureKeys].sort(),
    );
    assert.equal((await f.readFixtureAssistance()).length, 1);
    const bound = fixtures.find((c) => c.fixtureKey === f.boundFixtureKey);
    assert.equal(bound.ownerUserId, f.applicantAUserId);
    const visible = await f.applicantA.from("cases").select("id").eq("id", bound.id);
    assert.equal(visible.error, null);
    assert.deepEqual(visible.data, [{ id: bound.id }]);
    const resetState = await f.readFixtureState();
    const denied = await f.applicantA.rpc("vitally_reset_fixtures", {
      p_action_id: crypto.randomUUID(),
    });
    assert.equal(denied.error.code, "VT001"); // mapper separately tests FORBIDDEN
    assert.deepEqual(await f.readFixtureState(), resetState);
    assert.deepEqual(await f.readStableSetup(), stableSetup);
  } finally {
    await f.close();
  }
});

test("the seeded workspace tells one coherent story", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await t.test("each of the six cases holds its own stage-consistent records", async () => {
      await f.seedFixtures();
      const byKey = await fixtureByKey(f);
      assert.deepEqual(Object.keys(byKey).sort(), [...f.fixtureKeys].sort());
      for (const key of f.fixtureKeys)
        await assertScenario(f, byKey[key].id, key, { revision: seededRevision(key) });
    });

    await t.test("every case carries a readable reference, answers and times", async () => {
      const rows = (
        await f.sql(
          "select * from public.cases where workspace_id=$1 and fixture order by fixture_key",
          [f.workspaceId],
        )
      ).rows;
      const references = new Set();
      for (const row of rows) {
        assert.equal(row.origin, "fixture");
        assert.equal(row.fixture, true);
        assert.match(row.reference, REFERENCE_PATTERN);
        references.add(row.reference);
        assert.equal(row.created_by_person_id, null);
        // All seventeen whitelisted answers, from a screening that continues.
        assert.deepEqual(
          Object.keys(row.answers).sort(),
          [...INTAKE_ANSWER_KEYS].sort(),
          `${row.fixture_key} answers`,
        );
        for (const value of Object.values(row.answers))
          assert.equal(typeof value, "string");
        assert.equal(row.answers.year, "2025");
        assert.equal(row.answers.helper, "self");
        assert.equal(row.answers.other, "no");
        assert.equal(row.answers.stocks, "no");
        assert.notEqual(row.answers.residenceState, "Other");
        // Fictional names and withheld addresses: no address, no email, and no
        // identifier of a real person is written anywhere.
        assert.match(row.answers.address, /withheld$/);
        for (const value of Object.values(row.answers)) assert.ok(!value.includes("@"));
        assert.ok(row.created_at, `${row.fixture_key} created_at`);
        assert.ok(row.updated_at, `${row.fixture_key} updated_at`);
      }
      assert.equal(references.size, 6, "every fixture reference is its own");
    });

    await t.test("one assistance request, on the case the office is chasing", async () => {
      const items = await f.readFixtureAssistance();
      assert.equal(items.length, 1);
      const [item] = items;
      const byKey = await fixtureByKey(f);
      assert.equal(item.caseId, byKey.admin_followup.id);
      assert.equal(item.fixture, true);
      assert.equal(item.status, "open");
      assert.equal(Number(item.revision), 1);
      assert.equal(item.assigneePersonId, null);
      assert.equal(item.resolutionNote, null);
      assert.equal(item.contactPreference, "Prefers calls from the main office");
      // The preference is only useful beside the language the client asked for.
      const [caseRow] = (
        await f.sql("select answers from public.cases where id=$1", [item.caseId])
      ).rows;
      assert.equal(item.language, caseRow.answers.language);
    });

    await t.test("the presenter and the bound client each read what they may", async () => {
      const byKey = await fixtureByKey(f);
      const staff = await f.readStaffCase(byKey.admin_followup.id);
      assert.equal(staff.stage, "preparing");
      assert.deepEqual(staff.participants, [f.alex]);
      assert.equal(staff.followups.length, 1);
      assert.equal(staff.followups[0].attempts.length, 1);
      // The bound scenario is the client's own case; nobody else's is.
      const mine = await f.applicantA.from("cases").select("id,fixture_key").eq("fixture", true);
      assert.equal(mine.error, null);
      assert.deepEqual(mine.data, [
        { id: byKey[f.boundFixtureKey].id, fixture_key: f.boundFixtureKey },
      ]);
      const theirs = await f.applicantB.from("cases").select("id").eq("fixture", true);
      assert.equal(theirs.error, null);
      assert.deepEqual(theirs.data, []);
      // A client reads no internal note on their own fixture case either.
      const internal = await f.applicantA
        .from("case_events")
        .select("id")
        .eq("case_id", byKey[f.boundFixtureKey].id);
      assert.equal(internal.error, null);
      assert.deepEqual(internal.data, []);
    });

    await t.test("a second reset replaces the set and moves the generation once", async () => {
      const before = await f.readFixtureState();
      const receipt = await f.seedFixtures();
      const after = await f.readFixtureState();
      assert.equal(after.generation, before.generation + 1);
      assert.equal(receipt.generation, after.generation);
      assert.deepEqual(Object.keys(receipt.fixtureCaseIds).sort(), [...f.fixtureKeys].sort());
      assert.deepEqual(Object.values(receipt.fixtureCaseIds).sort(), after.caseIds);
      // Fresh ids and a fresh item: nothing was reused.
      for (const id of after.caseIds) assert.ok(!before.caseIds.includes(id), id);
      for (const id of after.itemIds) assert.ok(!before.itemIds.includes(id), id);
      // And the binding is reapplied, so the client still sees their own case.
      const byKey = await fixtureByKey(f);
      assert.equal(byKey[f.boundFixtureKey].ownerUserId, f.applicantAUserId);
      const visible = await f.applicantA
        .from("cases")
        .select("id")
        .eq("id", byKey[f.boundFixtureKey].id);
      assert.equal(visible.error, null);
      assert.deepEqual(visible.data, [{ id: byKey[f.boundFixtureKey].id }]);
    });

    await t.test("a reset removes no record that is not a fixture", async () => {
      const created = await f.createCase(f.applicantA, crypto.randomUUID());
      await f.prepareClassCase(created.caseId, f.alex);
      const seeded = await f.seedAssistance();
      const classCase = await f.readStaffCase(created.caseId);
      const classItem = await f.readStaffAssistance(seeded.itemId);
      const classCaseRows = {
        events: await rowsFor(f, "case_events", created.caseId),
        client: await rowsFor(f, "client_events", created.caseId),
        participants: await rowsFor(
          f,
          "preparation_participants",
          created.caseId,
          "person_id",
        ),
      };
      await f.seedFixtures();
      assert.deepEqual(await f.readStaffCase(created.caseId), classCase);
      assert.deepEqual(await f.readStaffAssistance(seeded.itemId), classItem);
      assert.deepEqual(
        await rowsFor(f, "case_events", created.caseId),
        classCaseRows.events,
      );
      assert.deepEqual(
        await rowsFor(f, "client_events", created.caseId),
        classCaseRows.client,
      );
      assert.deepEqual(
        await rowsFor(f, "preparation_participants", created.caseId, "person_id"),
        classCaseRows.participants,
      );
      // The assistance request a student's case carries is not marked fixture,
      // and exactly one item in the workspace is.
      assert.equal(classItem.fixture, false);
      assert.equal((await f.readFixtureAssistance()).length, 1);
    });

    await t.test("two simultaneous resets serialize into one set", async () => {
      const before = await generationOf(f);
      const results = await Promise.all(
        [crypto.randomUUID(), crypto.randomUUID()].map((actionId) =>
          f.presenter.rpc("vitally_reset_fixtures", { p_action_id: actionId }),
        ),
      );
      for (const result of results) assert.equal(result.error, null);
      assert.equal(await generationOf(f), before + 2);
      const state = await f.readFixtureState();
      assert.equal(state.caseIds.length, 6);
      assert.equal(state.itemIds.length, 1);
      // The set on disk is the later of the two, whole and consistent.
      const byKey = await fixtureByKey(f);
      assert.deepEqual(Object.keys(byKey).sort(), [...f.fixtureKeys].sort());
      for (const key of f.fixtureKeys)
        await assertScenario(f, byKey[key].id, key, { revision: seededRevision(key) });
      const winner = results.find(
        (result) => Number(result.data.generation) === before + 2,
      );
      assert.deepEqual(Object.values(winner.data.fixtureCaseIds).sort(), state.caseIds);
    });
  } finally {
    await f.close();
  }
});

test("receipts outlive the fixtures they targeted", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await f.seedFixtures();
    const byKey = await fixtureByKey(f);
    const claimed = byKey.preparation_ready;
    // One accepted action on a fixture case, with an envelope kept whole so it
    // can be replayed exactly.
    const envelope = applyArgs({
      caseId: claimed.id,
      revision: claimed.revision,
      personId: f.alex,
      type: "CLAIM_PREPARATION",
      payload: {},
    });
    const accepted = await f.presenter.rpc("vitally_apply_action", envelope);
    assert.equal(accepted.error, null);
    const original = accepted.data;
    await f.seedFixtures();
    const afterReset = await f.stateSnapshot();
    const generation = await generationOf(f);

    await t.test("the identical replay returns its original receipt", async () => {
      const replay = await f.presenter.rpc("vitally_apply_action", envelope);
      assert.equal(replay.error, null);
      assert.deepEqual(replay.data, original);
      assert.deepEqual(await f.stateSnapshot(), afterReset);
    });

    await t.test("the receipt row itself survived the deletion", async () => {
      const rows = (
        await f.sql("select * from public.action_receipts where action_id=$1", [
          envelope.p_action_id,
        ])
      ).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].operation, "CLAIM_PREPARATION");
      assert.equal(rows[0].target_id, claimed.id);
      assert.deepEqual(rows[0].receipt, original);
      // The case it names is gone, which is exactly the point.
      const gone = (await f.sql("select id from public.cases where id=$1", [claimed.id]))
        .rows;
      assert.deepEqual(gone, []);
    });

    await t.test("a new action id on a deleted fixture is NOT_FOUND", async () => {
      const fresh = await f.presenter.rpc(
        "vitally_apply_action",
        applyArgs({
          caseId: claimed.id,
          revision: claimed.revision,
          personId: f.alex,
          type: "CLAIM_PREPARATION",
          payload: {},
        }),
      );
      assert.equal(fresh.error.code, "VT002");
      assert.deepEqual(await f.stateSnapshot(), afterReset);
    });

    await t.test("the same action id with a changed payload is VALIDATION", async () => {
      const changed = await f.presenter.rpc("vitally_apply_action", {
        ...envelope,
        p_person_id: f.sam,
      });
      assert.equal(changed.error.code, "VT007");
      assert.deepEqual(await f.stateSnapshot(), afterReset);
    });

    await t.test("repeating a reset action id reseeds nothing", async () => {
      const actionId = crypto.randomUUID();
      const first = await f.presenter.rpc("vitally_reset_fixtures", {
        p_action_id: actionId,
      });
      assert.equal(first.error, null);
      assert.equal(Number(first.data.generation), generation + 1);
      const seeded = await f.readFixtureState();
      const again = await f.presenter.rpc("vitally_reset_fixtures", {
        p_action_id: actionId,
      });
      assert.equal(again.error, null);
      assert.deepEqual(again.data, first.data);
      assert.deepEqual(await f.readFixtureState(), seeded);
      assert.equal(await generationOf(f), generation + 1);
    });

    await t.test("a reset action id reused for another operation is VALIDATION", async () => {
      const actionId = crypto.randomUUID();
      const reset = await f.presenter.rpc("vitally_reset_fixtures", {
        p_action_id: actionId,
      });
      assert.equal(reset.error, null);
      const state = await f.readFixtureState();
      const target = (await fixtureByKey(f)).review_ready;
      const wrong = await loadCheckpoint(
        f.presenter,
        target.id,
        target.revision,
        "intake_ready",
        actionId,
      );
      assert.equal(wrong.error.code, "VT007");
      assert.deepEqual(await f.readFixtureState(), state);
    });
  } finally {
    await f.close();
  }
});

test("checkpoints move one demonstration case and nothing else", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await f.seedFixtures();

    await t.test("every checkpoint rewrites the case it names, in place", async () => {
      for (const [checkpoint, scenario] of Object.entries(CHECKPOINTS)) {
        const before = (await fixtureByKey(f)).review_approved;
        const [beforeRow] = (
          await f.sql("select * from public.cases where id=$1", [before.id])
        ).rows;
        const answered = await loadCheckpoint(
          f.presenter,
          before.id,
          before.revision,
          checkpoint,
        );
        assert.equal(answered.error, null, checkpoint);
        assert.deepEqual(
          Object.keys(answered.data).sort(),
          ["actionId", "caseId", "reference", "revision"],
          `${checkpoint} receipt keys`,
        );
        assert.equal(answered.data.caseId, before.id);
        assert.equal(answered.data.reference, beforeRow.reference);
        assert.equal(Number(answered.data.revision), before.revision + 1);
        const [afterRow] = (
          await f.sql("select * from public.cases where id=$1", [before.id])
        ).rows;
        // Identity survives a checkpoint: the same case, the same reference,
        // the same client, the same answers and the same creation time.
        for (const column of [
          "id",
          "reference",
          "owner_user_id",
          "fixture_key",
          "origin",
          "created_at",
        ])
          assert.deepEqual(afterRow[column], beforeRow[column], `${checkpoint} ${column}`);
        assert.deepEqual(afterRow.answers, beforeRow.answers, `${checkpoint} answers`);
        assert.ok(
          new Date(afterRow.updated_at) >= new Date(beforeRow.updated_at),
          `${checkpoint} updated_at`,
        );
        // The scenario's own records, plus the one entry that says a
        // checkpoint was loaded.
        const expected = SCENARIOS[scenario];
        const internal = await rowsFor(f, "case_events", before.id);
        assert.equal(internal.length, expected.events + 1, `${checkpoint} history`);
        const marker = internal.at(-1);
        assert.equal(marker.action, "CHECKPOINT", `${checkpoint} marker`);
        assert.deepEqual(
          marker.detail,
          { checkpoint, simulated: true },
          `${checkpoint} marker detail`,
        );
        assert.equal(marker.actor_user_id, f.presenterUserId);
        await assertScenario(f, before.id, scenario, {
          revision: before.revision + 1,
        });
      }
      // Only that one case moved: the other five are still what a reset made.
      const byKey = await fixtureByKey(f);
      for (const key of f.fixtureKeys) {
        if (key === "review_approved") continue;
        await assertScenario(f, byKey[key].id, key, { revision: seededRevision(key) });
      }
    });

    await t.test("a checkpoint keeps the bound client's own case theirs", async () => {
      const bound = (await fixtureByKey(f))[f.boundFixtureKey];
      const answered = await loadCheckpoint(
        f.presenter,
        bound.id,
        bound.revision,
        "ready_for_review",
      );
      assert.equal(answered.error, null);
      const after = (await fixtureByKey(f))[f.boundFixtureKey];
      assert.equal(after.id, bound.id);
      assert.equal(after.ownerUserId, f.applicantAUserId);
      const visible = await f.applicantA
        .from("cases")
        .select("id,stage")
        .eq("id", bound.id);
      assert.equal(visible.error, null);
      assert.deepEqual(visible.data, [{ id: bound.id, stage: "review_ready" }]);
      // Put it back where the demonstration expects it.
      const restored = await loadCheckpoint(
        f.presenter,
        bound.id,
        after.revision,
        "intake_ready",
      );
      assert.equal(restored.error, null);
    });

    await t.test("an identical checkpoint replay changes nothing", async () => {
      const target = (await fixtureByKey(f)).waiting_documents;
      const actionId = crypto.randomUUID();
      const first = await loadCheckpoint(
        f.presenter,
        target.id,
        target.revision,
        "admin_followup_needed",
        actionId,
      );
      assert.equal(first.error, null);
      const state = await f.stateSnapshot();
      const again = await loadCheckpoint(
        f.presenter,
        target.id,
        target.revision,
        "admin_followup_needed",
        actionId,
      );
      assert.equal(again.error, null);
      assert.deepEqual(again.data, first.data);
      assert.deepEqual(await f.stateSnapshot(), state);
    });

    await t.test("the refusals are the shared codes, in the shared order", async () => {
      const target = (await fixtureByKey(f)).review_ready;
      const before = await f.stateSnapshot();
      const classCase = await f.readyCase();
      const [classRow] = (
        await f.sql("select revision from public.cases where id=$1", [classCase])
      ).rows;
      const attempts = [
        // An unknown checkpoint name never reaches a target at all.
        [f.presenter, target.id, target.revision, "everything_done", "VT007"],
        [f.presenter, target.id, target.revision, null, "VT007"],
        // A case a student created is visible but is not a fixture.
        [f.presenter, classCase, Number(classRow.revision), "intake_ready", "VT007"],
        // Absent and other-workspace targets are one indistinguishable answer.
        [f.presenter, crypto.randomUUID(), 1, "intake_ready", "VT002"],
        // A stale revision is a conflict, not a refusal.
        [f.presenter, target.id, target.revision + 5, "intake_ready", "VT003"],
        // A client may not load a checkpoint on anything, including their own.
        [f.applicantA, target.id, target.revision, "intake_ready", "VT001"],
      ];
      for (const [client, caseId, revision, checkpoint, code] of attempts) {
        const actionId = crypto.randomUUID();
        const answered = await loadCheckpoint(
          client,
          caseId,
          revision,
          checkpoint,
          actionId,
        );
        assert.equal(answered.error?.code, code, `${checkpoint} ${code}`);
        assert.equal(await f.receiptsFor(actionId), 0, `${code} leaves no receipt`);
      }
      // The class case is the only thing that changed, and it was built by
      // ordinary actions rather than by a refused checkpoint.
      const bound = (await fixtureByKey(f))[f.boundFixtureKey];
      await assertScenario(f, bound.id, "preparation_ready");
      assert.deepEqual(
        (await f.stateSnapshot()).assistance_items,
        before.assistance_items,
      );
    });
  } finally {
    await f.close();
  }
});

test("the presenter entry points are the only way in", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await f.seedFixtures();

    await t.test("an anonymous caller reaches neither function", async () => {
      const target = (await fixtureByKey(f)).review_ready;
      const before = await f.stateSnapshot();
      const reset = await f.anonymous.rpc("vitally_reset_fixtures", {
        p_action_id: crypto.randomUUID(),
      });
      assert.equal(reset.error?.code, "42501");
      const checkpoint = await loadCheckpoint(
        f.anonymous,
        target.id,
        target.revision,
        "intake_ready",
      );
      assert.equal(checkpoint.error?.code, "42501");
      assert.deepEqual(await f.stateSnapshot(), before);
    });

    await t.test("another workspace's member changes nothing here", async () => {
      const before = await f.readFixtureState();
      const outside = await f.outsider.rpc("vitally_reset_fixtures", {
        p_action_id: crypto.randomUUID(),
      });
      // The outsider is an applicant in their own workspace: refused, and the
      // refusal says nothing about this workspace at all.
      assert.equal(outside.error?.code, "VT001");
      assert.deepEqual(await f.readFixtureState(), before);
      const target = (await fixtureByKey(f)).review_ready;
      const checkpoint = await loadCheckpoint(
        f.outsider,
        target.id,
        target.revision,
        "intake_ready",
      );
      assert.equal(checkpoint.error?.code, "VT001");
      assert.deepEqual(await f.readFixtureState(), before);
    });

    await t.test("an account with no membership is refused", async () => {
      const before = await f.readFixtureState();
      const answered = await f.unapproved.rpc("vitally_reset_fixtures", {
        p_action_id: crypto.randomUUID(),
      });
      assert.equal(answered.error?.code, "VT001");
      assert.deepEqual(await f.readFixtureState(), before);
    });

    await t.test("the private helpers are unreachable through the API", async () => {
      // `vitally_private` is not an exposed schema, so PostgREST cannot route
      // to it whatever the caller sends.
      for (const name of [
        "seed_fixtures",
        "apply_fixture_scenario",
        "fixture_answers",
        "new_reference",
      ]) {
        const answered = await f.presenter.rpc(name, {});
        assert.ok(answered.error, `${name} must not be callable`);
        assert.notEqual(answered.error.code, null, `${name} error code`);
        assert.ok(
          answered.error.code === "PGRST202" || answered.error.code === "42501",
          `${name} unexposed (${answered.error.code})`,
        );
      }
      const helpers = (
        await f.sql(
          "select p.proname as name,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') as anon,has_function_privilege('authenticated',p.oid,'EXECUTE') as browser,has_function_privilege('service_role',p.oid,'EXECUTE') as service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='vitally_private' and p.proname = any($1) order by p.proname",
          [
            [
              "new_reference",
              "fixture_keys",
              "checkpoint_scenario",
              "fixture_answers",
              "fixture_history",
              "apply_fixture_scenario",
              "seed_fixtures",
            ],
          ],
        )
      ).rows;
      assert.equal(helpers.length, 7, "every Task 9 helper is installed");
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
    });

    await t.test("a revoked presenter loses both entry points", async () => {
      const before = await f.readFixtureState();
      const target = (await fixtureByKey(f)).review_ready;
      await f.sql(
        "update public.memberships set active=false where workspace_id=$1 and user_id=$2",
        [f.workspaceId, f.presenterUserId],
      );
      try {
        const reset = await f.presenter.rpc("vitally_reset_fixtures", {
          p_action_id: crypto.randomUUID(),
        });
        assert.equal(reset.error?.code, "VT001");
        const checkpoint = await loadCheckpoint(
          f.presenter,
          target.id,
          target.revision,
          "intake_ready",
        );
        assert.equal(checkpoint.error?.code, "VT001");
        assert.deepEqual(await f.readFixtureState(), before);
      } finally {
        await f.sql(
          "update public.memberships set active=true where workspace_id=$1 and user_id=$2",
          [f.workspaceId, f.presenterUserId],
        );
      }
      // Restored, the same presenter works again.
      const again = await f.presenter.rpc("vitally_reset_fixtures", {
        p_action_id: crypto.randomUUID(),
      });
      assert.equal(again.error, null);
    });
  } finally {
    await f.close();
  }
});
