# ViTally setup and testing guide

This is the single setup guide for ViTally. It replaces the earlier per-task sections that used
to be appended here as each task landed; everything from those sections is folded in below,
organized by phase instead of by task number.

## What exists today, and what does not

Everything through the shared demonstration story is implemented and tested against an
**isolated local Supabase stack**: identity and case ownership, the full workflow (intake,
preparation, documents, admin follow-up, assistance, independent review and corrections,
reminders and closure), Realtime-driven shared state, six seeded sample cases with presenter-only
reset/checkpoint controls, and the client/staff/admin/presenter browser screens with real email
(OTP) sign-in.

**Not done, and not claimed here:** there is no hosted Supabase project, no classroom roster, no
configured SMTP sender, and no live email delivery — that is Task 10B, a user-owned step (see
[Classroom and hosted setup](#6-classroom-and-hosted-setup-pending) below). There is also no public
hosting destination yet (Task 10D): the GitHub Pages copy of `main` currently serves the app with
no `/public-config.json` values set, so it shows the **"ViTally is not configured yet"** setup-needed
screen, not a working sign-in form. Nothing in this document should be read as claiming otherwise.
Every test described below runs against the isolated local stack; none of it exercises a hosted
project or real mail delivery.

## 1. Runtime

Use Node **24.21.0** explicitly. The machine's default shell resolves an older Node; never change
the global Node configuration. Prepend the pinned bin directory to `PATH` **for each command**
that needs it (installs, builds, tests) instead:

```sh
VITALLY_NODE_BIN=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin
VITALLY_NODE="$VITALLY_NODE_BIN/node"
VITALLY_NPM=/Users/jinyuyang/.nvm/versions/node/v24.21.0/lib/node_modules/npm/bin/npm-cli.js
"$VITALLY_NODE" --version
PATH="$VITALLY_NODE_BIN:$PATH" "$VITALLY_NODE" "$VITALLY_NPM" ci
```

`npm ci` installs the exact-pinned dependencies from `package-lock.json`: `@supabase/supabase-js`,
and (dev) `esbuild`, `pg`, `playwright`, and the `supabase` CLI. Docker must be running for the
local Supabase stack and its tests. On this Mac, if Docker is not otherwise on `PATH`, add
`/Users/jinyuyang/.docker/bin` to the **command's** `PATH` (shown in the database/auth/browser test
commands below).

## 2. Running the app locally

```sh
npm start
```

This runs `node --env-file-if-exists=.env.local server.mjs`, so the server starts whether or not
`.env.local` exists. Open <http://127.0.0.1:4173>.

- **No `.env.local`, or an incomplete one:** the app fetches `./public-config.json`, reads
  `{"configured": false}`, and renders the **setup-needed** screen ("ViTally is not configured
  yet") instead of a sign-in form. This is the state the public GitHub Pages copy of `main` is in
  today.
- **A complete `.env.local`:** copy `.env.example` to `.env.local` (git-ignored) and fill in:

  | Variable | Meaning |
  | --- | --- |
  | `SUPABASE_URL` | The project's API URL — `http://127.0.0.1:57321` for the isolated local stack below, or `https://<project-ref>.supabase.co` once a hosted project exists. |
  | `SUPABASE_PUBLISHABLE_KEY` | The publishable (anonymous) key. A public client identifier, not a secret — the service-role/secret key must never go here. |
  | `AUTH_RESEND_COOLDOWN_SECONDS` | Optional. The project's own minimum email-resend interval plus five seconds (65 for the verified 60-second local setting). Falls back to 65 if missing or non-positive. |

  Only these three values ever reach the browser, and only through `GET /public-config.json`,
  which returns `{"configured":true,"supabaseUrl":…,"supabasePublishableKey":…,
  "authResendCooldownSeconds":<positive integer, default 65>}` when both required values are set,
  and `{"configured":false}` otherwise. It contains nothing else. The app fetches it **relatively**
  (`./public-config.json`), so a static host can ship a plain file in that path instead of running
  this server (relevant to Task 10D). Administrative keys, database URLs and SMTP credentials
  belong in `.env.test` / `.env.admin` (below) and are never served.

  `server.mjs`'s allowlist serves only the page, `/src/<name>.(mjs|css|svg)`,
  `/src/vendor/<name>.mjs`, and `/public-config.json`; everything else — including `.env.local`,
  `.env.test`, migrations, and this documentation — is 404.

### The vendor bundle

`src/app.mjs` imports the Supabase JS SDK from a committed file, not a CDN or a runtime build
step:

```sh
PATH="$VITALLY_NODE_BIN:$PATH" "$VITALLY_NODE" tools/build.mjs   # npm run build:vendor
```

This bundles `@supabase/supabase-js` alone (via `tools/vendor-entry.mjs`, which re-exports only
`createClient`) into minified ESM at `src/vendor/supabase.mjs`, with a banner naming the SDK and
esbuild versions. Rebuild and commit it whenever the SDK's pinned version changes; there is no
other build step, and a static host serves this file as-is.

## 3. Isolated local Supabase test stack

All database migrations, integration tests, and the browser test suites run against a dedicated,
**uniquely named** local Supabase CLI stack — never the classroom project, and never an
already-in-use workspace inside a shared database (that is not isolation). This project's guarded
tooling verifies both the literal loopback endpoints and the running containers' exact project
label, names, and published ports on every privileged connection.

### Create the stack

```sh
VITALLY_STACK=$(mktemp -d /private/tmp/vitally-<label>.XXXXXXXX)
VITALLY_INSTANCE=$(basename "$VITALLY_STACK")
SUPABASE_HOME="$VITALLY_STACK/cli-home" PATH="$VITALLY_NODE_BIN:$PATH" \
  ./node_modules/.bin/supabase init --workdir "$VITALLY_STACK"
```

`project_id` in the generated `config.toml` is set automatically from the working directory's
basename and must equal `VITALLY_INSTANCE`. Edit that `config.toml` to match
**[`supabase/test-stack.config.example.toml`](../supabase/test-stack.config.example.toml)**, the
committed, secret-free reference for this stack's settings (project id placeholder aside). In
summary: `[api] schemas=["public"]`; the database pooler (`[db.pooler]`) disabled; `[realtime]`
left **enabled** (Task 9's fixture reset/checkpoint machinery and its isolation tests need it —
the earlier standalone Auth probe excluded Realtime deliberately and proves nothing about
subscriptions); `[auth] site_url="http://127.0.0.1:4173"`, `enable_signup=false`,
`enable_anonymous_sign_ins=false`; `[auth.email] enable_signup=true`, `max_frequency="60s"`; and,
**for this isolated automated stack only**, `[auth.rate_limit] sign_in_sign_ups=1000` (the
automated fixtures provision many independent password sessions from one loopback address in a
single run — this override must never be copied to a classroom/hosted project, which keeps the
CLI/hosted default).

Choose unused ports for every enabled service. The example set below (all free at the time, and
the one the last verified run used) is a reasonable starting point:

| Service | Port |
| --- | --- |
| API (Kong) | 57321 |
| PostgreSQL | 57322 |
| Shadow PostgreSQL | 57320 |
| Studio (config only — the service is excluded at start) | 57323 |
| Mail catcher (Inbucket) web UI | 57324 |
| Mail catcher SMTP | 57325 |
| Mail catcher POP3 | 57326 |

### Pin PostgREST to 16.3

```sh
mkdir -p "$VITALLY_STACK/supabase/.temp"
printf %s v16.3 > "$VITALLY_STACK/supabase/.temp/rest-version"
```

Supabase CLI 2.117.0's default PostgREST 16.2 intermittently rejects freshly issued valid
sessions with `PGRST303: JWT issued at future`. PostgREST 16.3 fixes that upstream bug; no test
retry, token bypass, or timing delay is used instead. See the
[PostgREST changelog](https://github.com/PostgREST/postgrest/blob/main/CHANGELOG.md) and the
[CLI's override mechanism](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/command-internal/legacy-service-version-overrides.ts).

### Start and stop

```sh
SUPABASE_HOME="$VITALLY_STACK/cli-home" PATH="$VITALLY_NODE_BIN:$PATH" \
  ./node_modules/.bin/supabase start --workdir "$VITALLY_STACK" \
  --exclude storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
SUPABASE_HOME="$VITALLY_STACK/cli-home" PATH="$VITALLY_NODE_BIN:$PATH" \
  ./node_modules/.bin/supabase status --workdir "$VITALLY_STACK" --output json \
  > "$VITALLY_STACK/status.private.json"
chmod 600 "$VITALLY_STACK/status.private.json"
```

`realtime` is deliberately **not** in the exclude list — omitting it from every stack-start
command used by this project's tests is required, not optional. Save status output only to an
ignored/private file; never paste keys into logs, chat, or a commit.

```sh
SUPABASE_HOME="$VITALLY_STACK/cli-home" PATH="$VITALLY_NODE_BIN:$PATH" \
  ./node_modules/.bin/supabase stop --workdir "$VITALLY_STACK" --no-backup
```

Stop only the stack created for a given run. **A system `/private/tmp` cleanup can delete the
stack's working directory while its Docker containers keep running underneath it** — that
happened during this project's own development. If CLI commands against a stack directory start
failing (missing `config.toml`, no `.temp`, etc.) but `docker ps` still shows its containers
healthy, the directory is gone; either restore it from
[`test-stack.config.example.toml`](../supabase/test-stack.config.example.toml) (same project id,
same ports, same PostgREST pin) or stop the orphaned containers by hand and recreate the stack
from scratch. Do not assume a stopped-looking stack has actually stopped.

### Private test configuration

Copy `.env.test.example` to ignored `.env.test` and populate it from the stack's own `status`
output — never by hand-typing values into chat or a log:

| Variable | Source |
| --- | --- |
| `VITALLY_TEST_MODE` | `local` |
| `VITALLY_TEST_SUPABASE_URL` | the stack's `API_URL` |
| `VITALLY_TEST_PUBLISHABLE_KEY` | the stack's `PUBLISHABLE_KEY` (or `ANON_KEY`) |
| `VITALLY_TEST_ADMIN_KEY` | the stack's `SECRET_KEY` (or `SERVICE_ROLE_KEY`) |
| `VITALLY_TEST_DATABASE_URL` | the stack's `DB_URL` |
| `VITALLY_TEST_LOCAL_INSTANCE_ID` | `VITALLY_INSTANCE` (the exact stack/project id) |
| `VITALLY_TARGET_MANIFEST` | the absolute path to ignored `.vitally-targets.json` |

`.vitally-targets.json` records **endpoint identity only** — never passwords or API keys:

```json
{
  "version": 1,
  "test": {
    "mode": "local",
    "instanceId": "vitally-<label>.<random>",
    "apiOrigin": "http://127.0.0.1:57321",
    "database": {
      "host": "127.0.0.1", "port": 57322, "database": "postgres",
      "user": "postgres", "connectionMode": "direct"
    },
    "containers": {
      "api": {"name": "supabase_kong_vitally-<label>.<random>", "containerPort": 8000},
      "database": {"name": "supabase_db_vitally-<label>.<random>", "containerPort": 5432}
    }
  }
}
```

Set both files to mode `600`. Neither is ever printed, committed, or served: `.gitignore` excludes
`.env*` (except `*.example`) and `.vitally-targets*.json`, and `server.mjs`'s allowlist serves
only the page, compiled bundle, styles, and `/public-config.json`. No test tool falls back to
application (`.env.local`) or classroom (`.env.admin`) configuration; a missing or mismatched
manifest, wrong ports, a stopped stack, or a non-loopback target fails the guard rather than
silently skipping.

## 4. Migrations

Nine migrations, applied in order. Re-running the migrator on an already-migrated stack is safe,
but not because the files themselves are re-runnable — `001` and `002` create their tables with a
plain `create table`, which fails the second time. What makes it safe is the ledger
`tools/admin/migrate.mjs` keeps: `vitally_private.schema_migrations`, one row per file with a
SHA-256 digest of its text. The migrator reads that row before each file and skips every file
already applied, so **the migrations are run only through the migrator, never by hand**:

| File | Adds |
| --- | --- |
| `001_identity_and_cases.sql` | Workspaces, memberships, people, `cases`, `action_receipts`; `vitally_create_case`; ownership RLS |
| `002_workflow_schema.sql` | `preparation_participants`, `document_requests`, `documents`, `admin_followups`, `contact_attempts`, `case_events`, `client_events`, `assistance_items` and their RLS (schema only — no actions yet) |
| `003_action_core.sql` | `vitally_apply_action` dispatcher; SAVE_ANSWERS, SUBMIT, VERIFY_INTAKE, CLAIM_PREPARATION |
| `004_documents_followup.sql` | REQUEST_DOCUMENT, RESPOND_DOCUMENT, RECORD_DOCUMENT_RESPONSE, VERIFY_DOCUMENT, ESCALATE_CONTACT, RECORD_CONTACT, RESOLVE_FOLLOWUP |
| `005_assistance_closure.sql` | `vitally_assistance_action` (CLAIM/RESOLVE); REMIND, CLOSE_CASE; `cases.last_reminded_at`/`last_reminded_by_person_id` |
| `006_review.sql` | `reviews` table; CLAIM_REVIEW, SUBMIT_REVIEW, REQUEST_CORRECTIONS, RESUBMIT_REVIEW, APPROVE_REVIEW, RECORD_REVIEW_CONTACT; self-review enforcement |
| `007_realtime_publication.sql` | Adds the twelve browser-readable tables to `supabase_realtime`, `publish = 'insert, update'` |
| `008_case_timestamps.sql` | `cases.created_at`/`updated_at`, maintained by every action/create path |
| `009_fixtures_and_realtime.sql` | `vitally_reset_fixtures`, `vitally_load_checkpoint`; the six seeded sample cases and one assistance item |

> **Migration numbering as built.** The original plan sketched fixtures/Realtime as a single
> migration named `007`. As implemented, the Realtime publication landed first as its own
> migration (**007**, Task 5) because Task 6's controller needed live subscriptions before Task 9
> existed; case timestamps followed as **008** (Task 7), so the staff board and My applications
> could show real times; the six seeded cases and reset/checkpoint controls became **009**
> (Task 9). Nothing here was renumbered after being applied to a shared/classroom project — no
> such project exists yet.

Apply and verify:

```sh
PATH="$VITALLY_NODE_BIN:/Users/jinyuyang/.docker/bin:$PATH" \
  "$VITALLY_NODE" --env-file=.env.test tools/admin/migrate.mjs
```

Expected output: `Approved test migrations applied.` The migrator uses one guarded persistent
PostgreSQL connection and a transaction, records checksums in a private schema, and refuses
changes to an already-applied migration file (a further change needs a new migration number). It
never deletes or resets a database. This is also `npm run db:migrate:test` under the same scoped
`PATH`.

Editing a file that has already been applied changes its digest, and the migrator refuses the
whole run with `MIGRATION_CHANGED` before it applies anything. On the isolated test stack the
recovery is the one migration `009`'s own header comment describes: either recreate the stack
from scratch, or first drop that file's own objects and its `schema_migrations` row with a local
script that is not part of the repository, then apply again.

## 5. Tests

All commands below run from the repository root with the command-scoped `PATH` shown. Each
suite's **last-verified count**, taken from the task reports at
`.superpowers/sdd/2026-09-15-vitally-shared-demo/`, is included; re-run the commands yourself for
the current number, since new work changes these counts.

| Suite | Command | Last verified | What it proves |
| --- | --- | --- | --- |
| Unit | `"$VITALLY_NODE" --test tests/*.test.mjs` | 208/208 | Pure domain/contract logic, the auth/store adapters against fakes, the pure view renderers, the controller's async state machine, server allowlist/config logic — no network, no database. |
| Database | `PATH="$VITALLY_NODE_BIN:/Users/jinyuyang/.docker/bin:$PATH" "$VITALLY_NODE" --env-file=.env.test --test tests/database*.mjs` | 151/151, ~85–95 s | Every migration, RLS policy, RPC, and error/ordering rule against the real isolated stack: ownership, authority, idempotent replay, concurrency, Realtime publication/isolation, fixture reset and checkpoints. |
| Auth gate | `PATH="$VITALLY_NODE_BIN:/Users/jinyuyang/.docker/bin:$PATH" "$VITALLY_NODE" --env-file=.env.test --test tests/auth-browser.mjs` | 20/20, ~75–95 s | Real Chrome and real Firefox, driving the actual access form: a generated one-time code is typed in and verified through the real `verifyOtp` call; only the outbound `/auth/v1/otp` **send** is intercepted (email-free automation), never verification. |
| Browser story | `PATH="$VITALLY_NODE_BIN:/Users/jinyuyang/.docker/bin:$PATH" "$VITALLY_NODE" --env-file=.env.test --test tests/browser.mjs` | 51/51, ~180–200 s | The full demonstration script (see [`docs/demo-script.md`](demo-script.md)) end to end, twice, roles swapped between Chrome and Firefox, plus the regression list below. Optional to re-run before every rehearsal, but recommended before a presentation. |

Install the second browser engine once, with the same scoped `PATH`, before the first auth-gate or
story run (Chrome runs through an already-installed Google Chrome browser via
`chromium.launch({channel:'chrome'})` and needs no separate install):

```sh
PATH="$VITALLY_NODE_BIN:$PATH" ./node_modules/.bin/playwright install firefox
```

Versions observed in the last recorded run (2026-09-21): Google Chrome 153.0.8010.48, Playwright
Firefox 155.0 (build 1543), Playwright 1.63.0, Supabase Auth/GoTrue `v2.196.0`, PostgREST `v16.3`,
Realtime `v2.130.0`.

**What is simulated versus real, in every one of these runs.** The OTP **send** step
(`/auth/v1/otp`) is intercepted so automated tests never ask a mail server for anything; OTP
**verification** is real (`verifyOtp` against the real Auth server), every workflow action is a
real database call, and every Realtime notification is a real subscription delivery. Documents,
reminders, and TaxSlayer preparation milestones are simulated by design (see
[`docs/demo-script.md`](demo-script.md)) — the app never uploads a file, sends an external
message, or talks to tax-preparation software. No test run logs an address, a one-time code, or a
token; the browser story's evidence output is explicitly redacted before it is printed
(`tests/support/story-pages.mjs`).

The browser story writes screenshots (720px side-by-side and 390px mobile) to the git-ignored
`artifacts/browser/` directory; they are inspected as part of each task's review, not committed.

### Known, intentional behaviors these tests pin (not defects)

- **A stale-revision refusal at the client's document-response step is expected, not a bug.** If a
  client presses "Send sample document" within about a second of the office's own work on that
  case, the save is refused as a stale revision — correct per spec (a stale revision must never
  report false success) — and the refusal now stays on screen until the client presses again. A
  presenter driving both windows in a demonstration should expect this occasionally and simply
  press again.
- **`review_ready`'s seeded document is staff-recorded, not client-submitted.** A fixture case has
  no client session behind it, so the office recorded that document rather than a client uploading
  it. If a class ever binds a real student account to the `review_ready` scenario, that student
  will correctly see a document the office recorded on their behalf, not one they personally sent.
- **The presenter panel's fixture indicator is the thing to read on a projector**: `Class workspace
  <short id> · sample set <generation> · N sample cases`. A reset advances the generation number
  and gives every sample case a fresh Application ID; it never touches an application the class
  itself created, nor anyone's sign-in.
- **An accepted case action produces two `cases` UPDATE events** (one from the action's own
  handler, one from the shared commit path). Anything that waits on a Realtime update should match
  the case's revision number, not merely the fact that an update arrived.
- **Internal findings, resolutions, and office notes never reach a client screen.** The browser
  story asserts this directly at the point where the client's own screen says "Review complete."

## 6. Classroom and hosted setup (pending)

Nothing in this section has happened. It is Task 10B (setup) and Task 10D (publication) —
user-owned steps, not implementation work, and this document does not claim otherwise. What the
user needs to provide before either can proceed:

1. **A school sender email/account** (for the preferred Gmail SMTP path) **or** a
   presenter-controlled, DNS-verified domain for the Resend SMTP fallback — a school address alone
   cannot be used as an unverified sender.
2. **One approved test-client email address**, for the first real, authorized email-delivery
   check. Additional roster members can be added later.
3. **A Supabase account** with either two Free project slots (one classroom project, one separate
   automated-test project) or approval to keep using the isolated local stack above for testing
   indefinitely while only the classroom project is hosted.
4. **The class roster**: the exact approved email addresses admitted to the classroom project.
   Group/class admission is exact-address only; there is no domain-wide or public sign-up, and
   roster administration goes through the same privileged setup tooling this document uses for
   tests, not a browser admin screen.
5. **A hosting destination** for the built static app (Task 10D) — the current plan is GitHub
   Pages from `main`'s root, per this project's existing Pages configuration, but that is
   confirmed with the user when publication is actually reached, not assumed here.

Once those are available, classroom provisioning uses a separate, ignored `.env.admin` (copied
from `.env.admin.example`, which documents each variable name with no real values):

| Variable | Meaning |
| --- | --- |
| `VITALLY_ADMIN_SUPABASE_URL` | The classroom project's API URL — never the test project's. |
| `VITALLY_ADMIN_AUTH_KEY` | The classroom project's admin (service-role) key. |
| `VITALLY_ADMIN_DATABASE_URL` | The classroom project's direct/session-pooler database URL. |
| `VITALLY_CLASSROOM_PROJECT_REF` | The classroom project's reference id. |
| `VITALLY_ADMIN_CONFIRMED_PROJECT_REF` | The operator's **explicit, manually typed** confirmation that this is the intended classroom project — never derived automatically from a URL. |

`tools/admin/classroom-target.mjs`'s `assertClassroomTarget()` validates this whole tuple (and
TLS, and connection mode) before any classroom Auth-admin call, migration, or initialization; it
rejects any match to the test project's identity, any loopback target, a mismatched API/SQL
project pair, and a missing confirmation. There is intentionally no one-command classroom
provisioning path — each step (migrations, the shared `initializeWorkspace` roster/capability
routine, disabling public sign-up, configuring the OTP email template with `{{ .Token }}`,
permitted origins) is run individually against the confirmed target, and classroom tooling never
imports the test suite's cleanup helpers. **Never run privileged test cleanup against the
classroom project.**

The `[auth.rate_limit] sign_in_sign_ups = 1000` override used by the isolated test stack above is
**test-only** and must not be copied into classroom configuration, which keeps the CLI/hosted
default.

Hosted `.env.test` (if hosted testing is later chosen instead of the isolated local stack)
additionally requires nonempty, distinct `VITALLY_TEST_PROJECT_REF` and
`VITALLY_CLASSROOM_PROJECT_REF`, and uses the project's **Session pooler** endpoint (port 5432,
`sslmode=verify-full`, TLS verification on) rather than the transaction pooler (port 6543) or an
unverified direct connection.

## 7. Hosting (pending)

`npm start` and its local server serve only the machine running them; nothing here is reachable
from anywhere else. Publication (Task 10D) happens only with the user's explicit authorization and
destination choice — this document does not invent or assume one. The built app is already
designed for static hosting with no build step (the committed vendor bundle, and
`/public-config.json` fetched relatively so a static host can ship a plain JSON file at that path
instead of running `server.mjs`), but until that file exists with real values, any deployed copy —
including the current GitHub Pages copy of `main` — shows the same "ViTally is not configured yet"
screen a fresh local checkout does.

Pages serves `main`'s root, so a deployed copy publishes every committed file, not only the page
and its bundle: the migrations, the admin tooling, the tests and these documents are all fetchable
at their repository paths. No secret is among them — `.gitignore` excludes `.env*` (except
`*.example`) and `.vitally-targets*.json` — and whether publishing the rest of the repository is
acceptable is part of what the hosting task (10D) settles with the user.
