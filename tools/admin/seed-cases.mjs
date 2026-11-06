import { randomUUID } from "node:crypto";
import { databaseError } from "./database.mjs";

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
