import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { requireTarget } from "../../tools/admin/target-common.mjs";
const runs = new WeakMap();
export async function createRun() {
  const handle = Object.freeze({ runId: randomUUID() });
  runs.set(handle, {
    active: true,
    users: new Set(),
    workspaces: new Set(),
    pendingWorkspaces: new Set(),
  });
  await saveRun(handle);
  return handle;
}
export function ownedRun(handle) {
  const run = runs.get(handle);
  requireTarget(run?.active === true);
  return run;
}
export function requireOwnedWorkspace(handle, id) {
  const run = ownedRun(handle);
  requireTarget(run.workspaces.has(id));
  return run;
}
export async function saveRun(handle) {
  const run = ownedRun(handle);
  await mkdir(".vitally-runs", { recursive: true, mode: 0o700 });
  await writeFile(
    `.vitally-runs/${handle.runId}.json`,
    JSON.stringify(
      {
        runId: handle.runId,
        active: run.active,
        userIds: [...run.users],
        workspaceIds: [...run.workspaces],
        pendingWorkspaceIds: [...run.pendingWorkspaces],
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}
export async function endRun(handle) {
  await saveRun(handle);
  const run = ownedRun(handle);
  run.active = false;
  await writeFile(
    `.vitally-runs/${handle.runId}.json`,
    JSON.stringify(
      {
        runId: handle.runId,
        active: false,
        userIds: [...run.users],
        workspaceIds: [...run.workspaces],
        pendingWorkspaceIds: [...run.pendingWorkspaces],
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}
