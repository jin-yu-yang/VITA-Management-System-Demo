import { randomUUID, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertTestTarget } from "../../tools/admin/test-target.mjs";
import { openDatabase, databaseError } from "../../tools/admin/database.mjs";
import { initializeWorkspace } from "../../tools/admin/workspace-setup.mjs";
import { createRun, ownedRun, saveRun, endRun } from "./run-manifest.mjs";
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
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
