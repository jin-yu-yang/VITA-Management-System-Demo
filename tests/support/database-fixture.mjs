import { randomUUID, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertTestTarget } from "../../tools/admin/test-target.mjs";
import { openDatabase, databaseError } from "../../tools/admin/database.mjs";
import { initializeWorkspace } from "../../tools/admin/workspace-setup.mjs";
import { createAppError } from "../../src/errors.mjs";
import { makeSampleAnswers } from "../../src/sample-data.mjs";
import { createRun, ownedRun, saveRun, endRun } from "./run-manifest.mjs";
const camel = (key) =>
  key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const camelRow = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [camel(key), value]),
  );
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
  "assistance_items",
]);
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
  // A case the caller cannot see is NOT_FOUND, never a raw SDK row-count error.
  const visibleCase = async (client, caseId) => {
    const { data, error } = await client
      .from("cases")
      .select("*")
      .eq("id", caseId);
    if (error) throw createAppError(error);
    if (!data.length) throw createAppError({ code: "VT002" });
    return data[0];
  };
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
  // The staff Case shape from src/contracts.mjs, read through the presenter's
  // own client so the helper also proves presenter visibility.
  f.readStaffCase = async (caseId) => {
    const row = await visibleCase(f.presenter, caseId);
    const participants = await visibleRows(
      f.presenter,
      "preparation_participants",
      caseId,
      "person_id",
    );
    // Each follow-up carries its own contact attempts (Ruling R20).
    const attempts = await visibleRows(f.presenter, "contact_attempts", caseId);
    const followups = (
      await visibleRows(f.presenter, "admin_followups", caseId)
    ).map((followup) => ({
      id: followup.id,
      requestId: followup.requestId,
      assigneeId: followup.assigneePersonId,
      status: followup.status,
      reason: followup.reason,
      resolutionOutcome: followup.resolutionOutcome,
      resolutionNote: followup.resolutionNote,
      createdByPersonId: followup.createdByPersonId,
      createdAt: followup.createdAt,
      resolvedAt: followup.resolvedAt,
      attempts: attempts
        .filter((attempt) => attempt.followupId === followup.id)
        .map((attempt) => ({
          id: attempt.id,
          outcome: attempt.outcome,
          note: attempt.note,
          actorPersonId: attempt.actorPersonId,
          createdAt: attempt.createdAt,
        })),
    }));
    return {
      id: row.id,
      reference: row.reference,
      workspaceId: row.workspace_id,
      ownerUserId: row.owner_user_id,
      fixture: row.fixture,
      stage: row.stage,
      revision: Number(row.revision),
      preparationVersion: Number(row.preparation_version),
      answers: row.answers,
      intakeVerified: row.intake_verified,
      preparerId: row.preparer_id,
      reviewerId: row.reviewer_id,
      participants: participants.map((participant) => participant.personId),
      requests: await visibleRows(f.presenter, "document_requests", caseId),
      documents: await visibleRows(f.presenter, "documents", caseId),
      followups,
      history: await visibleRows(f.presenter, "client_events", caseId),
      internalHistory: await visibleRows(f.presenter, "case_events", caseId),
    };
  };
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
