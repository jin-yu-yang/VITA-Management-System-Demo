// Admits an exact list of approved email addresses to one workspace.
//
//   node --env-file=.env.test  tools/admin/roster.mjs --target test      --roster .vitally-roster.json
//   node --env-file=.env.admin tools/admin/roster.mjs --target classroom --roster .vitally-roster.json
//
// Every address becomes a confirmed Auth account with no password (the app
// signs in with one-time codes only), then the shared initializer grants each
// account presenter or applicant access. The target is approved by the same
// fail-closed guards as every other privileged tool before anything is read.
// Re-running with a longer roster adds the new people; nobody is removed.
// Addresses are never printed: errors name a roster position instead.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { EMAIL_PATTERN } from "../../src/auth.mjs";
import { assertTarget } from "./database.mjs";
import { initializeWorkspace } from "./workspace-setup.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// The six seeded cases a client account may own. The database accepts exactly
// these keys (vitally_private.initialize_workspace, migration 001).
export const SAMPLE_CASE_KEYS = Object.freeze([
  "preparation_ready",
  "waiting_documents",
  "admin_followup",
  "review_ready",
  "corrections_required",
  "review_approved",
]);
const LIST_PAGE_SIZE = 1000;

const failure = (code, message) =>
  Object.assign(new Error(message), { code });
const invalid = (message) => failure("ROSTER_INVALID", message);

function addresses(raw, field, { required = false } = {}) {
  if (raw === undefined && !required) return [];
  if (!Array.isArray(raw)) throw invalid(`${field} must be a list of email addresses.`);
  return raw.map((value, index) => {
    const address = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (address.length > 254 || !EMAIL_PATTERN.test(address))
      throw invalid(`${field}[${index}] is not an email address.`);
    return address;
  });
}

export function parseRoster(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw invalid("The roster must be a JSON object.");
  if (typeof raw.workspaceId !== "string" || !UUID.test(raw.workspaceId))
    throw invalid(
      "workspaceId must be a lower-case UUID. Generate one once and keep it: node -e \"console.log(crypto.randomUUID())\"",
    );
  const presenters = addresses(raw.presenters, "presenters", { required: true });
  if (presenters.length === 0)
    throw invalid("The roster needs at least one presenter.");
  const applicants = addresses(raw.applicants, "applicants");
  const seen = new Set();
  for (const [field, list] of [["presenters", presenters], ["applicants", applicants]])
    list.forEach((address, index) => {
      if (seen.has(address))
        throw invalid(`${field}[${index}] is already on the roster.`);
      seen.add(address);
    });
  const owners = raw.sampleCaseOwners ?? {};
  if (!owners || typeof owners !== "object" || Array.isArray(owners))
    throw invalid("sampleCaseOwners must map sample case names to applicant addresses.");
  const sampleCaseOwners = {};
  for (const [key, value] of Object.entries(owners)) {
    if (!SAMPLE_CASE_KEYS.includes(key))
      throw invalid(`${key} is not a sample case. Use one of: ${SAMPLE_CASE_KEYS.join(", ")}.`);
    const address = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!applicants.includes(address))
      throw invalid(`sampleCaseOwners.${key} must name an applicant on this roster.`);
    sampleCaseOwners[key] = address;
  }
  return { workspaceId: raw.workspaceId, presenters, applicants, sampleCaseOwners };
}

export function parseRosterArgs(argv) {
  const usage = () =>
    failure(
      "ROSTER_USAGE",
      "Usage: roster.mjs --target test|classroom --roster <file.json>",
    );
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (!["--target", "--roster"].includes(flag) || value === undefined || flag in options)
      throw usage();
    options[flag] = value;
  }
  if (!["test", "classroom"].includes(options["--target"]) || !options["--roster"])
    throw usage();
  return { target: { kind: options["--target"] }, rosterPath: options["--roster"] };
}

async function existingAccounts(admin, perPage) {
  const byEmail = new Map();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw failure("ROSTER_ACCOUNT_FAILED", "Existing accounts could not be listed.");
    const users = data?.users ?? [];
    for (const user of users)
      if (user.email) byEmail.set(user.email.toLowerCase(), user);
    if (users.length < perPage) return byEmail;
  }
}

export async function applyRoster(
  roster,
  { admin, initialize, perPage = LIST_PAGE_SIZE },
) {
  const accounts = await existingAccounts(admin, perPage);
  const ids = new Map();
  let created = 0,
    confirmed = 0;
  for (const [field, list] of [["presenters", roster.presenters], ["applicants", roster.applicants]])
    for (const [index, address] of list.entries()) {
      const where = `${field}[${index}]`;
      const account = accounts.get(address);
      if (!account) {
        const { data, error } = await admin.auth.admin.createUser({
          email: address,
          email_confirm: true,
        });
        if (error || !data?.user?.id)
          throw failure("ROSTER_ACCOUNT_FAILED", `The account for ${where} could not be created.`);
        ids.set(address, data.user.id);
        created += 1;
        continue;
      }
      if (!account.email_confirmed_at) {
        const { error } = await admin.auth.admin.updateUserById(account.id, {
          email_confirm: true,
        });
        if (error)
          throw failure("ROSTER_ACCOUNT_FAILED", `The account for ${where} could not be confirmed.`);
        confirmed += 1;
      }
      ids.set(address, account.id);
    }
  await initialize({
    workspaceId: roster.workspaceId,
    presenterUserIds: roster.presenters.map((address) => ids.get(address)),
    applicantUserIds: roster.applicants.map((address) => ids.get(address)),
    fixtureClientBindings: Object.fromEntries(
      Object.entries(roster.sampleCaseOwners).map(([key, address]) => [key, ids.get(address)]),
    ),
  });
  return {
    workspaceId: roster.workspaceId,
    presenters: roster.presenters.length,
    applicants: roster.applicants.length,
    created,
    confirmed,
  };
}

const HINTS = {
  ROSTER_USAGE: "",
  ROSTER_INVALID: "",
  ROSTER_UNREADABLE: "",
  TARGET_REJECTED: " Check the target's env file and .vitally-targets.json (docs/setup.md).",
  VALIDATION:
    " The workspace refused the roster: someone may already belong to another workspace, or appear here with the other role.",
};

async function main() {
  const { target, rosterPath } = parseRosterArgs(process.argv.slice(2));
  let raw;
  try {
    raw = JSON.parse(await readFile(rosterPath, "utf8"));
  } catch {
    throw failure("ROSTER_UNREADABLE", "The roster file could not be read as JSON.");
  }
  const roster = parseRoster(raw);
  const approved = await assertTarget(target);
  const admin = createClient(approved.apiUrl, approved.adminKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const result = await applyRoster(roster, {
    admin,
    initialize: (setup) => initializeWorkspace({ ...setup, target }),
  });
  console.log(
    `Roster applied to workspace ${result.workspaceId} on the ${target.kind} target: ` +
      `${result.presenters} presenter(s), ${result.applicants} applicant(s); ` +
      `${result.created} account(s) created, ${result.confirmed} confirmed.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((error) => {
    const code = error.code || "SERVER_ERROR";
    const detail = code.startsWith("ROSTER_") ? ` ${error.message}` : "";
    console.error(`Roster failed (${code}).${detail}${HINTS[code] ?? ""}`);
    process.exitCode = 1;
  });
