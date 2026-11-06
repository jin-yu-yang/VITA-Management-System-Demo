import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { databaseError } from "./database.mjs";
import { assertTestTarget } from "./test-target.mjs";
import { rejected } from "./target-common.mjs";

// Runs `fn` as the given auth user: the same role and claims PostgREST sets,
// so the public RPCs see auth.uid() and apply their own permission checks.
export async function actAs(client, userId, fn) {
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw databaseError(error);
  }
}

export async function callRpc(client, userId, name, args) {
  const keys = Object.keys(args);
  const params = keys.map((key, i) => `${key} => $${i + 1}`).join(", ");
  const values = keys.map((key) => args[key]);
  return actAs(client, userId, async (c) => {
    const { rows } = await c.query(
      `select public.${name}(${params}) as result`,
      values,
    );
    return rows[0].result;
  });
}

export async function applyAction(client, userId, caseId, type, payload = {}) {
  const { rows } = await client.query(
    "select revision from public.cases where id = $1",
    [caseId],
  );
  return callRpc(client, userId, "vitally_apply_action", {
    p_action_id: randomUUID(),
    p_case_id: caseId,
    p_expected_revision: rows[0].revision,
    p_person_id: null,
    p_type: type,
    p_payload: JSON.stringify(payload),
  });
}

const failure = (code, message) =>
  Object.assign(new Error(message), { code });

// The seed only ever runs against the local test stack.
export async function assertLocalSeedTarget({
  env,
  manifest,
  assert = assertTestTarget,
} = {}) {
  const approved = await assert({ env, manifest });
  if (approved?.mode !== "local") throw rejected();
  return approved;
}

export function requireSeedFlag(env) {
  if (env?.VITALLY_ALLOW_LOCAL_SEED !== "1")
    throw failure(
      "SEED_NOT_ALLOWED",
      "Set VITALLY_ALLOW_LOCAL_SEED=1 to seed the local test stack.",
    );
}

export function parseSeedArgs(argv) {
  const usage = () =>
    failure("SEED_USAGE", "Usage: seed.mjs [--roster <file.json>]");
  if (argv.length === 0) return { rosterPath: ".vitally-roster.local.json" };
  if (argv.length !== 2 || argv[0] !== "--roster" || !argv[1]) throw usage();
  return { rosterPath: argv[1] };
}

export function formatSeedResult({ casesRemoved, casesCreated }) {
  return `Seeded ${casesCreated} cases (removed ${casesRemoved} from the previous run).`;
}

const ROLE_KEYS = ["site_coordinator", "preparer", "reviewer"];

// Finds the accounts the seed acts as. Refusals never repeat an address.
export async function resolveSeedTargets(client, { workspaceId, clientAEmail }) {
  if (!workspaceId || !clientAEmail)
    throw failure(
      "SEED_SETUP",
      "The seed needs a workspace id and the roster's first applicant.",
    );
  const targets = { workspaceId };
  for (const key of ROLE_KEYS) {
    const { rows } = await client.query(
      `select p.id, p.user_id
         from public.people p
         join public.memberships m
           on m.workspace_id = p.workspace_id and m.user_id = p.user_id
        where p.workspace_id = $1 and p.person_key = $2
          and p.user_id is not null and m.access = 'staff' and m.active`,
      [workspaceId, key],
    );
    if (!rows.length)
      throw failure(
        "SEED_SETUP",
        `The workspace has no staff account with the person key "${key}".`,
      );
    const field = key.replace(/_(\w)/g, (_, c) => c.toUpperCase());
    targets[field] = { userId: rows[0].user_id, personId: rows[0].id };
  }
  const { rows: clients } = await client.query(
    `select u.id
       from auth.users u
       join public.memberships m on m.user_id = u.id
      where lower(u.email) = lower($1) and m.workspace_id = $2
        and m.access = 'applicant' and m.active`,
    [clientAEmail, workspaceId],
  );
  if (!clients.length)
    throw failure(
      "SEED_SETUP",
      "The roster's first applicant has no client account in this workspace.",
    );
  targets.clientA = { userId: clients[0].id };
  const { rows: workspaces } = await client.query(
    "select default_followup_person_id from public.workspaces where id = $1",
    [workspaceId],
  );
  if (
    workspaces[0]?.default_followup_person_id !== targets.siteCoordinator.personId
  )
    throw failure(
      "SEED_SETUP",
      'The default follow-up person must be the "site_coordinator" account. Re-run the roster command with the current example roster.',
    );
  return targets;
}

export function runFilePath(workspaceId, runDir = ".vitally-runs") {
  return `${runDir}/seed-${workspaceId}.json`;
}

export async function readRun(workspaceId, runDir) {
  try {
    return JSON.parse(await readFile(runFilePath(workspaceId, runDir), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { workspaceId, caseIds: [], assistanceIds: [] };
  }
}

// Removes only the rows the previous run recorded, and only in its workspace.
export async function deletePreviousRun(client, run) {
  await client.query(
    "delete from public.assistance_items where workspace_id=$1 and id = any($2::uuid[])",
    [run.workspaceId, run.assistanceIds],
  );
  const { rows } = await client.query(
    "delete from public.cases where workspace_id=$1 and id = any($2::uuid[]) returning id",
    [run.workspaceId, run.caseIds],
  );
  return { casesRemoved: rows.length };
}

export async function recordRun(run, runDir = ".vitally-runs") {
  await mkdir(runDir, { recursive: true, mode: 0o700 });
  await writeFile(
    runFilePath(run.workspaceId, runDir),
    `${JSON.stringify(run, null, 2)}
`,
  );
}
