import { randomUUID, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertTestTarget } from "../../tools/admin/test-target.mjs";
import { openDatabase, databaseError } from "../../tools/admin/database.mjs";
import { initializeWorkspace } from "../../tools/admin/workspace-setup.mjs";
import { createAppError } from "../../src/errors.mjs";
import { makeSampleAnswers } from "../../src/sample-data.mjs";
import { createRun, ownedRun, saveRun, endRun } from "./run-manifest.mjs";
import { extendTestWorkspace } from "./workspace-overrides.mjs";
// The fixture reads staff rows through the production adapter, so the browser
// and these tests share one snake_case → camelCase mapping (Ruling R32). A
// second copy here could drift from the shapes the application actually shows.
import { createStore, camelRow } from "../../src/supabase-store.mjs";
const INTAKE_CHECKS = Object.freeze({
  interview: true,
  identity: true,
  documents: true,
  consent: true,
});
// The one fictional document request and the single simulated file the demo
// accepts (contracts.mjs payload table, Ruling R18).
const SAMPLE_REQUEST = Object.freeze({
  title: "Mileage record",
  message: "Please add the fictional sample.",
});
const SAMPLE_FILENAME = "demo-mileage-record-2025.pdf";
// The one fictional assistance request `seedAssistance` creates. Language and
// contact preference are the fields the assistance list shows a helper.
const SAMPLE_ASSISTANCE = Object.freeze({
  title: "Client needs help completing intake forms",
  language: "Mandarin",
  contactPreference: "Prefers calls from the main office",
});
// The six scenario keys the private binding table and `cases.fixture_key`
// already constrain (migration 001). They are stable names, never case ids.
const FIXTURE_KEYS = Object.freeze([
  "preparation_ready",
  "waiting_documents",
  "admin_followup",
  "review_ready",
  "corrections_required",
  "review_approved",
]);
// The one key this fixture binds to applicant A through the shared
// initializer, so a reset has a durable client binding to reapply.
const BOUND_FIXTURE_KEY = "preparation_ready";
// Actions whose payload names a related record. For compact tests only, an
// omitted id falls back to the case's single current request or open follow-up;
// the browser always sends the selected id (Ruling R20).
const RELATED_DEFAULTS = Object.freeze({
  RESPOND_DOCUMENT: "requestId",
  RECORD_DOCUMENT_RESPONSE: "requestId",
  VERIFY_DOCUMENT: "requestId",
  ESCALATE_CONTACT: "requestId",
  RECORD_CONTACT: "followupId",
  RESOLVE_FOLLOWUP: "followupId",
});
// Every table a case action could touch, for before/after state comparisons.
const STATE_TABLES = Object.freeze([
  "cases",
  "action_receipts",
  "preparation_participants",
  "case_events",
  "client_events",
  "document_requests",
  "documents",
  "admin_followups",
  "contact_attempts",
  "reviews",
  "assistance_items",
]);
// One key for the advisory lock that keeps fixture workspace setup exclusive
// across parallel test processes (see initializeOwned below).
const SETUP_LOCK =
  "select pg_advisory_lock(hashtextextended('vitally-test-fixture-setup',0))";
const SETUP_UNLOCK =
  "select pg_advisory_unlock(hashtextextended('vitally-test-fixture-setup',0))";
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
// An assert.rejects predicate for one mapped domain code.
export const rejected = (code) => (error) => error.code === code;
// Fully specified immutable arguments for a direct vitally_apply_action call,
// so replays and races reuse one envelope and a payload can omit the related
// id that f.act would otherwise fill in.
export const applyArgs = ({
  actionId = randomUUID(),
  caseId,
  revision,
  personId = null,
  type,
  payload = {},
}) => ({
  p_action_id: actionId,
  p_case_id: caseId,
  p_expected_revision: revision,
  p_person_id: personId,
  p_type: type,
  p_payload: payload,
});
// The same for vitally_assistance_action, whose envelope carries an item and a
// plain note instead of a case and a payload object.
export const assistanceArgs = ({
  actionId = randomUUID(),
  itemId,
  revision,
  personId = null,
  type,
  note = null,
}) => ({
  p_action_id: actionId,
  p_item_id: itemId,
  p_expected_revision: revision,
  p_person_id: personId,
  p_type: type,
  p_note: note,
});
export async function createDatabaseFixture({ afterInitialize } = {}) {
  const target = await assertTestTarget();
  const runManifest = await createRun(),
    run = ownedRun(runManifest);
  const admin = createClient(target.apiUrl, target.adminKey, options),
    clients = [];
  const sqlClient = await openDatabase();
  const f = {
    runManifest,
    workspaceId: randomUUID(),
    foreignWorkspaceId: randomUUID(),
    anonymous: createClient(target.apiUrl, target.publishableKey, options),
  };
  f.service = async (operation) => {
    await assertTestTarget();
    return operation(admin);
  };
  f.sql = async (text, values) => {
    await assertTestTarget();
    try {
      return await sqlClient.query(text, values);
    } catch (error) {
      throw databaseError(error);
    }
  };
  // Workspace setup is one serializable transaction over a people table small
  // enough that every workspace shares an index page, so test files starting
  // together see serialization failures that outlast the initializer's three
  // retries. Every setup call — the fixture's own and the direct
  // `initializeWorkspace` calls in tests/database.mjs — runs inside this
  // session-level advisory lock, held on the fixture's own connection and
  // never during a test. A deliberately concurrent pair belongs inside one
  // call so the pair still races itself (Ruling R26). Nothing in the product,
  // the initializer or the migrations changes.
  f.withSetupLock = async (body) => {
    await f.sql(SETUP_LOCK);
    try {
      return await body();
    } finally {
      await f.sql(SETUP_UNLOCK);
    }
  };
  f.createCase = async (
    actor,
    actionId,
    { mode = "client", personId = null, answers = {} } = {},
  ) => {
    const { data, error } = await actor.rpc("vitally_create_case", {
      p_action_id: actionId,
      p_mode: mode,
      p_person_id: personId,
      p_answers: answers,
    });
    if (error) throw databaseError(error);
    return data;
  };
  f.intakeChecks = INTAKE_CHECKS;
  // A row the caller cannot see is NOT_FOUND, never a raw SDK row-count error.
  const visibleRow = async (client, table, id) => {
    const { data, error } = await client.from(table).select("*").eq("id", id);
    if (error) throw createAppError(error);
    if (!data.length) throw createAppError({ code: "VT002" });
    return data[0];
  };
  const visibleCase = (client, caseId) => visibleRow(client, "cases", caseId);
  const visibleRows = async (client, table, caseId, tiebreak = "id") => {
    const { data, error } = await client
      .from(table)
      .select("*")
      .eq("case_id", caseId)
      .order("created_at")
      .order(tiebreak);
    if (error) throw createAppError(error);
    return data.map(camelRow);
  };
  // The case's one current request or one open follow-up, so a test payload can
  // leave the id out. Anything else is a fixture mistake, not a server answer.
  const onlyRelated = async (caseId, key) => {
    const [table, current] =
      key === "requestId"
        ? ["document_requests", (row) => row.status !== "cancelled"]
        : ["admin_followups", (row) => row.status === "open"];
    const rows = (await visibleRows(f.presenter, table, caseId)).filter(current);
    if (rows.length !== 1)
      throw Object.assign(
        new Error(`Expected exactly one current ${table} row for the case.`),
        { code: "FIXTURE_AMBIGUOUS" },
      );
    return rows[0].id;
  };
  f.act = async (client, caseId, personId, type, payload = {}) => {
    const related = RELATED_DEFAULTS[type];
    const body =
      related && !(related in payload)
        ? { ...payload, [related]: await onlyRelated(caseId, related) }
        : payload;
    const current = await visibleCase(client, caseId);
    const { data, error } = await client.rpc("vitally_apply_action", {
      p_action_id: randomUUID(),
      p_case_id: caseId,
      p_expected_revision: current.revision,
      p_person_id: personId,
      p_type: type,
      p_payload: body,
    });
    if (error) throw createAppError(error);
    return data;
  };
  // `f.act` for the assistance entry point. Tests that need an explicit
  // revision (races, replays, invisible items) call `rpc` with assistanceArgs.
  f.actAssistance = async (client, itemId, personId, type, note = null) => {
    const current = await visibleRow(client, "assistance_items", itemId);
    const { data, error } = await client.rpc(
      "vitally_assistance_action",
      assistanceArgs({
        itemId,
        revision: Number(current.revision),
        personId,
        type,
        note,
      }),
    );
    if (error) throw createAppError(error);
    return data;
  };
  // An unclaimed case waiting for a preparer, built only through public actions.
  f.readyCase = async () => {
    const created = await f.createCase(f.applicantA, randomUUID(), {
      answers: makeSampleAnswers(),
    });
    await f.act(f.applicantA, created.caseId, null, "SUBMIT", {
      confirmed: true,
    });
    await f.act(f.presenter, created.caseId, f.sam, "VERIFY_INTAKE", {
      checks: INTAKE_CHECKS,
    });
    return created.caseId;
  };
  f.sampleRequest = SAMPLE_REQUEST;
  f.sampleFilename = SAMPLE_FILENAME;
  // An assisted case with no client owner, prepared by Alex and waiting on one
  // open document request: the case the staff receipt action exists for.
  f.assistedCase = async () => {
    const created = await f.createCase(f.presenter, randomUUID(), {
      mode: "assisted",
      personId: f.sam,
      answers: makeSampleAnswers(),
    });
    await f.act(f.presenter, created.caseId, f.sam, "SUBMIT", {
      confirmed: true,
    });
    await f.act(f.presenter, created.caseId, f.sam, "VERIFY_INTAKE", {
      checks: INTAKE_CHECKS,
    });
    await f.act(f.presenter, created.caseId, f.alex, "CLAIM_PREPARATION", {});
    await f.act(
      f.presenter,
      created.caseId,
      f.alex,
      "REQUEST_DOCUMENT",
      SAMPLE_REQUEST,
    );
    return created.caseId;
  };
  // A client case Alex has claimed and handed to review: preparation version 1,
  // stage review_ready, no reviewer. Built only through public actions.
  f.preparedCase = async () => {
    const caseId = await f.readyCase();
    await f.act(f.presenter, caseId, f.alex, "CLAIM_PREPARATION", {});
    await f.act(f.presenter, caseId, f.alex, "SUBMIT_REVIEW", {});
    return caseId;
  };
  // Test-only additive people and capabilities on this run's own workspace
  // (contracts, "Test-only people and capabilities"). Returns the added
  // people's ids keyed by person_key. After any enrichment the normal
  // initializer rejects this workspace, by design.
  f.enrich = async ({ addPeople = [], addCapabilities = [] } = {}) => {
    const { people } = await extendTestWorkspace({
      runManifest,
      workspaceId: f.workspaceId,
      addPeople,
      addCapabilities,
    });
    return people;
  };
  // Historical reassignment for the self-review regression only. No product
  // action reassigns or releases a case, so the test project writes the
  // records a reassignment would have left: the new current preparer, their
  // participation, and the former preparer's participation retained.
  f.reassignPreparer = async (caseId, fromPersonId, toPersonId) => {
    const moved = await f.sql(
      "update public.cases set preparer_id=$3 where id=$1 and workspace_id=$4 and preparer_id=$2 returning id",
      [caseId, fromPersonId, toPersonId, f.workspaceId],
    );
    if (moved.rowCount !== 1)
      throw Object.assign(
        new Error("Expected the case to be prepared by the former preparer."),
        { code: "FIXTURE_AMBIGUOUS" },
      );
    await f.sql(
      "insert into public.preparation_participants(workspace_id,case_id,person_id) values($1,$2,$3) on conflict do nothing",
      [f.workspaceId, caseId, toPersonId],
    );
  };
  f.sampleAssistance = SAMPLE_ASSISTANCE;
  // One open assistance request against a received, unclaimed case. Assistance
  // items have no creating action in this scope, so the row is seeded through
  // the privileged connection; its case is built only through public actions.
  f.seedAssistance = async () => {
    const created = await f.createCase(f.applicantA, randomUUID(), {
      answers: makeSampleAnswers(),
    });
    await f.act(f.applicantA, created.caseId, null, "SUBMIT", {
      confirmed: true,
    });
    const inserted = await f.sql(
      `insert into public.assistance_items(workspace_id,case_id,title,status,revision,assignee_person_id,language,contact_preference)
       values($1,$2,$3,'open',1,null,$4,$5) returning id`,
      [
        f.workspaceId,
        created.caseId,
        SAMPLE_ASSISTANCE.title,
        SAMPLE_ASSISTANCE.language,
        SAMPLE_ASSISTANCE.contactPreference,
      ],
    );
    return { itemId: inserted.rows[0].id, caseId: created.caseId };
  };
  // Staff reads go through the production adapter on the presenter's own
  // client, so these helpers prove presenter visibility *and* exercise the one
  // mapping the browser uses. A row the presenter cannot see is NOT_FOUND,
  // exactly as it is for the application.
  f.staffStore = () => createStore(f.presenter);
  // The assistance item as staff read it.
  f.readStaffAssistance = async (itemId) => {
    const item = (await f.staffStore().listAssistance()).find(
      (row) => row.id === itemId,
    );
    if (!item) throw createAppError({ code: "VT002" });
    return item;
  };
  // The staff Case shape from src/contracts.mjs.
  f.readStaffCase = (caseId) => f.staffStore().getCase(caseId);
  // Every column of every application row in the workspace, so an accepted
  // write cannot hide behind an unchanged row count. `f.snapshot` below covers
  // workspace setup (people, memberships, bindings) instead.
  f.stateSnapshot = async () => {
    const snapshot = {};
    for (const table of STATE_TABLES)
      snapshot[table] = (
        await f.sql(
          `select to_jsonb(t.*) as record from public.${table} t where t.workspace_id=$1 order by to_jsonb(t.*)::text`,
          [f.workspaceId],
        )
      ).rows.map((row) => row.record);
    return snapshot;
  };
  // Receipt rows for one action id: zero after any rejection.
  f.receiptsFor = async (actionId) =>
    Number(
      (
        await f.sql(
          "select count(*) as count from public.action_receipts where action_id=$1",
          [actionId],
        )
      ).rows[0].count,
    );
  // ---- fixtures, resets and checkpoints (Task 9) -------------------------
  //
  // Everything a reset must leave alone is read through one set of helpers, so
  // "preserved" means the same thing in every test: the same privileged
  // connection, the same deterministic ordering, and values that are stable by
  // construction rather than by luck.

  f.fixtureKeys = FIXTURE_KEYS;
  f.boundFixtureKey = BOUND_FIXTURE_KEY;

  // A class-created application carried to the same place the demo's own
  // cases sit: submitted, intake recorded, and claimed by a preparer whose
  // participation the claim writes. Only public actions are used, so what this
  // builds is exactly what a student would have built.
  f.prepareClassCase = async (caseId, preparerId) => {
    // A client's own draft is private to them, so the stage is read through
    // the privileged connection rather than through a staff client that is
    // not allowed to see it yet.
    const [current] = (
      await f.sql("select stage,answers from public.cases where id=$1", [caseId])
    ).rows;
    if (current?.stage === "draft" && !current?.answers?.year)
      await f.act(f.applicantA, caseId, null, "SAVE_ANSWERS", {
        answers: makeSampleAnswers(),
      });
    await f.act(f.applicantA, caseId, null, "SUBMIT", { confirmed: true });
    await f.act(f.presenter, caseId, f.sam, "VERIFY_INTAKE", {
      checks: INTAKE_CHECKS,
    });
    await f.act(f.presenter, caseId, preparerId, "CLAIM_PREPARATION", {});
    return caseId;
  };

  // The workspace setup a reset must never touch. Deliberately excludes
  // `workspaces.fixture_generation`, which a reset is *supposed* to move.
  f.readStableSetup = async () => {
    const people = (
      await f.sql(
        "select id,person_key,name,capabilities from public.people where workspace_id=$1 order by person_key",
        [f.workspaceId],
      )
    ).rows.map((row) => ({ ...row, capabilities: [...row.capabilities].sort() }));
    const memberships = (
      await f.sql(
        "select user_id,access,active from public.memberships where workspace_id=$1 order by user_id",
        [f.workspaceId],
      )
    ).rows;
    const bindings = (
      await f.sql(
        "select fixture_key,owner_user_id from vitally_private.fixture_client_bindings where workspace_id=$1 order by fixture_key",
        [f.workspaceId],
      )
    ).rows;
    const workspace = (
      await f.sql(
        "select default_followup_person_id from public.workspaces where id=$1",
        [f.workspaceId],
      )
    ).rows;
    return { people, memberships, bindings, workspace };
  };

  // Every membership row this account holds anywhere, so a revoked or deleted
  // one is an empty array rather than a silent undefined.
  f.readMembership = async (userId) =>
    (
      await f.sql(
        "select workspace_id,user_id,access,active from public.memberships where user_id=$1 order by workspace_id",
        [userId],
      )
    ).rows;

  f.readFixtureCases = async () =>
    (
      await f.sql(
        "select id,fixture_key,owner_user_id,stage,revision from public.cases where workspace_id=$1 and fixture order by fixture_key",
        [f.workspaceId],
      )
    ).rows.map((row) => ({
      id: row.id,
      fixtureKey: row.fixture_key,
      ownerUserId: row.owner_user_id,
      stage: row.stage,
      revision: Number(row.revision),
    }));

  f.readFixtureAssistance = async () =>
    (
      await f.sql(
        "select * from public.assistance_items where workspace_id=$1 and fixture order by created_at,id",
        [f.workspaceId],
      )
    ).rows.map(camelRow);

  // The generation and the identities of everything a reset replaces: equal
  // before and after means nothing was reseeded.
  f.readFixtureState = async () => ({
    generation: Number(
      (
        await f.sql("select fixture_generation from public.workspaces where id=$1", [
          f.workspaceId,
        ])
      ).rows[0].fixture_generation,
    ),
    caseIds: (await f.readFixtureCases()).map((row) => row.id).sort(),
    itemIds: (await f.readFixtureAssistance()).map((row) => row.id).sort(),
  });

  // A seeded workspace, through the one public path that seeds one.
  f.seedFixtures = async (client = f.presenter) => {
    const { data, error } = await client.rpc("vitally_reset_fixtures", {
      p_action_id: randomUUID(),
    });
    if (error) throw createAppError(error);
    return data;
  };

  f.snapshot = async () => {
    const out = {};
    for (const [name, sql] of Object.entries({
      people:
        "select id,person_key,name,capabilities from public.people where workspace_id=$1 order by person_key",
      memberships:
        "select user_id,access,active from public.memberships where workspace_id=$1 order by user_id",
      bindings:
        "select fixture_key,owner_user_id from vitally_private.fixture_client_bindings where workspace_id=$1 order by fixture_key",
      workspace: "select * from public.workspaces where id=$1",
    }))
      out[name] = (await f.sql(sql, [f.workspaceId])).rows;
    return out;
  };
  f.close = async () => {
    if (!run.active) return;
    // Cleanup is deliberately specific: never enumerate Auth users or select by email.
    await assertTestTarget();
    for (const id of new Set([...run.workspaces, ...run.pendingWorkspaces])) {
      const marker = await f.sql(
        "select run_id from vitally_private.test_workspaces where workspace_id=$1",
        [id],
      );
      if (!marker.rowCount) {
        const existing = await f.sql(
          "select id from public.workspaces where id=$1",
          [id],
        );
        if (!existing.rowCount) {
          run.pendingWorkspaces.delete(id);
          await saveRun(runManifest);
          continue;
        }
      }
      if (marker.rows[0]?.run_id !== runManifest.runId)
        throw Object.assign(new Error("Cleanup workspace marker rejected."), {
          code: "TARGET_REJECTED",
        });
      const deleted = await f.sql(
        "delete from public.workspaces w where w.id=$1 and exists(select 1 from vitally_private.test_workspaces t where t.workspace_id=w.id and t.run_id=$2) returning w.id",
        [id, runManifest.runId],
      );
      if (deleted.rowCount !== 1)
        throw Object.assign(new Error("Cleanup workspace marker rejected."), {
          code: "TARGET_REJECTED",
        });
      run.workspaces.delete(id);
      run.pendingWorkspaces.delete(id);
      await saveRun(runManifest);
    }
    for (const client of clients) await client.auth.signOut({ scope: "local" });
    for (const id of [...run.users]) {
      await assertTestTarget();
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error("Tracked Auth cleanup failed.");
      run.users.delete(id);
      await saveRun(runManifest);
    }
    await sqlClient.end();
    await endRun(runManifest);
  };
  try {
    // Schema preflight provides the intended RED before any Auth provisioning.
    await f.sql("select id from public.workspaces limit 0");
    for (const actor of [
      "applicantA",
      "applicantB",
      "presenter",
      "outsider",
      "unapproved",
    ]) {
      await assertTestTarget();
      const password = randomBytes(32).toString("base64url");
      const email = `${randomUUID()}@vitally.invalid`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user)
        throw new Error("Synthetic Auth provisioning failed.");
      run.users.add(data.user.id);
      await saveRun(runManifest);
      f[`${actor}UserId`] = data.user.id;
      // The synthetic address beside the id (Ruling R46). The browser gate
      // types it into the real sign-in form and generates that user's one-time
      // code from it, so the actor a test signs in as is the actor the fixture
      // provisioned. It is never logged, and cleanup still works by id alone.
      f[`${actor}Email`] = email;
      const client = createClient(
        target.apiUrl,
        target.publishableKey,
        options,
      );
      clients.push(client);
      const auth = await client.auth.signInWithPassword({ email, password });
      if (auth.error) throw new Error("Synthetic Auth sign-in failed.");
      f[actor] = client;
    }
    f.setup = {
      workspaceId: f.workspaceId,
      presenterUserIds: [f.presenterUserId],
      applicantUserIds: [f.applicantAUserId, f.applicantBUserId],
      fixtureClientBindings: { preparation_ready: f.applicantAUserId },
    };
    const initializeOwned = async (setup) => {
      run.pendingWorkspaces.add(setup.workspaceId);
      await saveRun(runManifest);
      return await f.withSetupLock(async () => {
        const result = await initializeWorkspace(setup, {
          afterInitialize: async (connection) => {
            await connection.query(
              "insert into vitally_private.test_workspaces(workspace_id,run_id) values($1,$2)",
              [setup.workspaceId, runManifest.runId],
            );
            if (afterInitialize)
              await afterInitialize({
                workspaceId: setup.workspaceId,
                runId: runManifest.runId,
                userIds: [...run.users],
              });
          },
        });
        run.pendingWorkspaces.delete(setup.workspaceId);
        run.workspaces.add(setup.workspaceId);
        await saveRun(runManifest);
        return result;
      });
    };
    // Workflow tests depend on the shared initializer's permanent people and
    // its default follow-up person; a partial workspace must fail, not skip.
    const initializeVerified = async (setup) => {
      const { people } = await initializeOwned(setup);
      const workspace = (
        await f.sql(
          "select w.default_followup_person_id,(select count(*) from public.people p where p.workspace_id=w.id) as people from public.workspaces w where w.id=$1",
          [setup.workspaceId],
        )
      ).rows[0];
      if (
        !workspace ||
        Number(workspace.people) !== 3 ||
        !people.alex ||
        !people.morgan ||
        workspace.default_followup_person_id !== people.sam
      )
        throw Object.assign(new Error("Workspace prerequisites are missing."), {
          code: "SETUP_INCOMPLETE",
        });
      return people;
    };
    f.people = await initializeVerified(f.setup);
    ({ alex: f.alex, morgan: f.morgan, sam: f.sam } = f.people);
    f.foreignPeople = await initializeVerified({
      workspaceId: f.foreignWorkspaceId,
      presenterUserIds: [],
      applicantUserIds: [f.outsiderUserId],
      fixtureClientBindings: {},
    });
    return f;
  } catch (error) {
    try {
      await f.close();
    } catch {
      await sqlClient.end().catch(() => {});
      throw Object.assign(
        new Error("Fixture failed; tracked cleanup requires attention."),
        { code: "CLEANUP_REQUIRED" },
      );
    }
    throw error;
  }
}
