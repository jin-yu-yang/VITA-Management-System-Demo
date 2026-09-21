# Task 2 database setup

Task 2 adds guarded database tooling, identity, case ownership, and case creation. The existing local demo still uses its original local data. No new browser connection, workflow actions, email delivery, Realtime publication, classroom provisioning, or hosting is included yet.

## Runtime and commands

Use Node **24.21.0** explicitly; do not change the machine's global Node configuration.

```sh
VITALLY_NODE_BIN=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin
VITALLY_NODE="$VITALLY_NODE_BIN/node"
VITALLY_NPM=/Users/jinyuyang/.nvm/versions/node/v24.21.0/lib/node_modules/npm/bin/npm-cli.js
PATH="$VITALLY_NODE_BIN:$PATH" "$VITALLY_NODE" "$VITALLY_NPM" ci
"$VITALLY_NODE" --test tests/*.test.mjs
```

Pinned dependencies: Supabase JS 2.116.0, PostgreSQL driver 8.16.3, Supabase CLI 2.117.0. Docker must be running for local integration tests. On this Mac, add `/Users/jinyuyang/.docker/bin` to the **command's** PATH if Docker is not otherwise found.

## Isolated local Supabase

Use a new, uniquely named CLI stack for testing. An extra workspace in a classroom database is not isolation. The target guard verifies both literal loopback endpoints and the running containers' exact project label, names, and published ports every time privileged tooling opens a connection. Docker's wildcard port binding is allowed only when it covers the explicitly approved loopback URL; remote API/database URLs remain rejected.

Create a temporary directory, initialize with the pinned CLI, and edit its generated `supabase/config.toml` before startup:

```sh
VITALLY_STACK=$(mktemp -d /private/tmp/vitally-task2.XXXXXXXX)
VITALLY_INSTANCE=$(basename "$VITALLY_STACK")
SUPABASE_HOME="$VITALLY_STACK/cli-home" PATH="$VITALLY_NODE_BIN:$PATH" \
  ./node_modules/.bin/supabase init --workdir "$VITALLY_STACK"
```

Set `project_id` to that exact `VITALLY_INSTANCE`. Choose unused ports for every enabled service; the verified run used API 57321, PostgreSQL 57322, shadow PostgreSQL 57320, Studio 57323, mail catcher 57324, SMTP 57325, and POP3 57326. Set API `schemas=["public"]`, disable the database pooler, and keep Auth, PostgREST, PostgreSQL, gateway, and **Realtime** enabled. The mail catcher is local only; no external SMTP credentials are required. Set `[auth] enable_signup=false`, `enable_anonymous_sign_ins=false`, `site_url="http://127.0.0.1:4173"`; set `[auth.email] enable_signup=true` and `max_frequency="60s"`. The global signup restriction remains authoritative. For this isolated automated stack only, `auth.rate_limit.sign_in_sign_ups=1000` accommodates independently provisioned password sessions; leave email quota unchanged. This rate override must not be copied to classroom settings.

Before startup, pin **PostgREST 16.3** using the CLI-supported service override:

```sh
mkdir -p "$VITALLY_STACK/supabase/.temp"
printf %s v16.3 > "$VITALLY_STACK/supabase/.temp/rest-version"
```

The CLI 2.117.0 default PostgREST 16.2 intermittently rejected freshly issued valid sessions as `PGRST303: JWT issued at future`. Version 16.3 fixes that upstream bug; no test retry, token bypass, or timing delay is used. See the [PostgREST changelog](https://github.com/PostgREST/postgrest/blob/main/CHANGELOG.md) and [CLI override implementation](https://github.com/supabase/cli/blob/v2.117.0/apps/cli/src/command-internal/legacy-service-version-overrides.ts).

Start using the same temporary home and working directory. Exclude only the optional services shown below; Realtime remains enabled. Save status output directly to an ignored/private file, never paste keys into logs or chat:

```sh
SUPABASE_HOME="$VITALLY_STACK/cli-home" PATH="$VITALLY_NODE_BIN:$PATH" \
  ./node_modules/.bin/supabase start --workdir "$VITALLY_STACK" \
  --exclude storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
SUPABASE_HOME="$VITALLY_STACK/cli-home" PATH="$VITALLY_NODE_BIN:$PATH" \
  ./node_modules/.bin/supabase status --workdir "$VITALLY_STACK" --output json \
  > "$VITALLY_STACK/status.private.json"
chmod 600 "$VITALLY_STACK/status.private.json"
```

### Private configuration

Copy `.env.test.example` to ignored `.env.test`. Populate its API URL, publishable/anonymous key, administrative key, and PostgreSQL URL from the **same isolated stack's** status: `API_URL`, `PUBLISHABLE_KEY` (or `ANON_KEY`), `SECRET_KEY` (or `SERVICE_ROLE_KEY`), and `DB_URL`, respectively. Set mode `local`, the exact instance ID, and `VITALLY_TARGET_MANIFEST` to the absolute path of ignored `.vitally-targets.json`. No test tool falls back to browser or classroom variables.

The approved manifest contains endpoint identity, never passwords or API keys. Replace the example instance and ports with the actual approved stack values:

```json
{
  "version": 1,
  "test": {
    "mode": "local",
    "instanceId": "vitally-task2.UNIQUE",
    "apiOrigin": "http://127.0.0.1:57321",
    "database": {
      "host": "127.0.0.1",
      "port": 57322,
      "database": "postgres",
      "user": "postgres",
      "connectionMode": "direct"
    },
    "containers": {
      "api": {
        "name": "supabase_kong_vitally-task2.UNIQUE",
        "containerPort": 8000
      },
      "database": {
        "name": "supabase_db_vitally-task2.UNIQUE",
        "containerPort": 5432
      }
    }
  }
}
```

Set both private files to mode 600. No hosted project references are invented or required in local mode. The repository ignores `.env*` except examples, `.vitally-targets*.json`, `.vitally-runs/`, and CLI runtime state. The existing server only serves index and explicitly named source assets; none of these files or tooling routes is served.

### Apply and verify

```sh
PATH="$VITALLY_NODE_BIN:/Users/jinyuyang/.docker/bin:$PATH" \
  "$VITALLY_NODE" --env-file=.env.test tools/admin/migrate.mjs
PATH="$VITALLY_NODE_BIN:/Users/jinyuyang/.docker/bin:$PATH" \
  "$VITALLY_NODE" --env-file=.env.test --test tests/database*.mjs
```

These commands are also `npm run db:migrate:test` and `npm run test:database` when run under the same scoped PATH. Missing `.env.test`, missing/mismatched manifests, wrong ports/projects, stopped containers, and remote local-mode targets fail; tests never silently skip.

Migrations use one guarded persistent PostgreSQL connection and a transaction. The runner records checksums in a private schema and refuses changes to already-applied migration files. Future changes need a new migration. It never deletes or resets a database.

Tests create cryptographically unique synthetic Auth users with confirmed addresses and random passwords, then independently sign in through real Auth. They send no email. This verifies database/API authorization; it does not replace the later generated-OTP browser gate or live email delivery test.

### Fixture ownership and cleanup

Each fixture saves a private run ledger containing its random run ID and exact created Auth IDs, pending workspace IDs, and committed workspace IDs. No credentials, tokens, or addresses are written to that ledger. Shared workspace initialization and the private run marker commit atomically. A trusted SQL-only transaction callback adds that marker and can run again during serialization retry. Callbacks must therefore be idempotent with transaction rollback and must not provision Auth accounts or perform external side effects.

The initializer retries SQLSTATE 40001 at most three total attempts using the same connection and input. Auth provisioning occurs once before the transaction. Setup failure rolls back the workspace and marker, then cleans tracked Auth accounts. On an uncertain commit, cleanup checks the planned workspace's matching database marker before deleting anything. A mismatched marker stops cleanup. Test cleanup never searches by email/domain or enumerates unrelated Auth users.

Normal fixture cleanup removes only matching run-owned workspaces and recorded users, and preserves all unrelated resources. If the process is killed, inspect the private ledger and matching `vitally_private.test_workspaces` records; recover only those exact IDs after the same target guard. A missing/mismatched marker requires investigation, not a broad delete.

Stop only the stack created for this run when testing is finished:

```sh
SUPABASE_HOME="$VITALLY_STACK/cli-home" PATH="$VITALLY_NODE_BIN:$PATH" \
  ./node_modules/.bin/supabase stop --workdir "$VITALLY_STACK" --no-backup
```

## Hosted tests and classroom setup

These paths are implemented as fail-closed guards and tested without connecting to a classroom target. Actual classroom accounts, roster provisioning, and SMTP remain a later parent-owned task.

Hosted `.env.test` additionally requires `VITALLY_TEST_PROJECT_REF` and `VITALLY_CLASSROOM_PROJECT_REF`, both nonempty and different. The approved manifest records both `test` and `classroom`. Use the actual **Session pooler** endpoint from Supabase's Connect dialog, port 5432, username `postgres.<projectRef>`, database `postgres`, `connectionMode:"session"`, and a database URL with `sslmode=verify-full`. TLS certificate verification stays enabled. Transaction-pooler port 6543 and weakened TLS modes are rejected. Direct IPv6 requires an explicitly approved reachable target, `connectionMode:"direct"`, and `ipv6Verified:true`.

A hosted section has this shape (endpoint placeholders must be replaced with approved actual values):

```json
{
  "mode": "hosted",
  "projectRef": "TEST_PROJECT_REF",
  "apiOrigin": "https://TEST_PROJECT_REF.supabase.co",
  "database": {
    "host": "ACTUAL_SESSION_POOLER_HOST.pooler.supabase.com",
    "port": 5432,
    "database": "postgres",
    "user": "postgres.TEST_PROJECT_REF",
    "connectionMode": "session"
  }
}
```

The `classroom` manifest section uses its own `projectRef`, `apiOrigin`, and `database` tuple. Distinct projects may share a pooler hostname: the guard compares the full host/port/database/project-qualified-user identity, not hostname alone. Classroom setup rejects loopback, selected test identity/endpoints, wrong project pairs, missing manifests, and absent confirmation.

Use a separate ignored `.env.admin`, copied from `.env.admin.example`. The operator must explicitly enter `VITALLY_ADMIN_CONFIRMED_PROJECT_REF` equal to the intended nonempty classroom ref; never derive confirmation automatically from a URL. Both `migrate({target:{kind:'classroom'}})` and `initializeWorkspace({...input,target:{kind:'classroom'}})` perform the classroom guard before opening SQL. There is intentionally no one-command classroom provisioning path in Task 2, and classroom tooling imports no test override/cleanup helpers.

## Database contract

- Only authenticated active members can execute `vitally_create_case`; client mode requires applicant membership and no staff persona. Assisted mode requires presenter membership and a same-workspace admin. Both authority failures are `FORBIDDEN`.
- Applicant reads are owner-scoped. Presenter reads exclude applicant drafts and include staff-created/submitted cases in the same workspace. Membership reads expose only the caller's own active membership, avoiding recursive RLS. People are presenter-only. Client roles have SELECT only; receipts and private setup tables have no browser reads.
- Each caller/workspace/action ID reserves one transactional receipt. Its canonical request digest includes mode, person, and all whitelisted answers. Identical accepted replay returns historical UUID/reference/revision after current authority checks; changed input fails `VALIDATION`. Historical receipt targets have no foreign keys to resettable records.
- One owner-only SQL initializer creates permanent Alex/Morgan/Sam, strict capabilities, memberships, durable six-scenario binding keys, and the same-workspace default Sam. Identical reruns preserve IDs; inconsistent/revoked supplied membership or incompatible configuration fails without changes. Explicit roster additions are allowed; silently reactivating memberships is not.
- The test-only additive extension requires the live approved target, an active in-process run manifest, an owned workspace, and its matching database marker. It cannot change membership, bindings, or default Sam. After enrichment, normal initialization fails without restoring base configuration.
- Fixture rows use `origin='fixture'` when future seeded setup needs an explicitly bound client. New assisted cases remain owner-null. Task 2 does not implement fixture reset, publication, or workflow transitions.

## Task 5 browser configuration

Task 10C does the full documentation pass; these are the pieces Task 5 added.

**App environment.** Copy `.env.example` to ignored `.env.local` and set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and optionally `AUTH_RESEND_COOLDOWN_SECONDS` (the project's own minimum email interval plus five seconds; 65 for the verified 60-second setting). Only these three values ever reach the browser. Administrative keys and database URLs stay in `.env.test` / `.env.admin` and are never served. `npm start` uses `--env-file-if-exists`, so the server also starts with no file at all.

**Public config.** `GET /public-config.json` returns `{"configured":true,"supabaseUrl":…,"supabasePublishableKey":…,"authResendCooldownSeconds":<positive integer, default 65>}` when both required values are set, and `{"configured":false}` with status 200 otherwise, which renders the setup-needed screen. It contains no other environment value. The app fetches it relatively (`./public-config.json`), so a static host can ship a file instead of running this server. The server serves only the page, `/src/<name>.(mjs|css|svg)`, `/src/vendor/<name>.mjs` and that document; private files, migrations, tooling and traversal attempts are 404.

**Vendor bundle.** `npm run build:vendor` runs `tools/build.mjs`, which bundles `@supabase/supabase-js` alone into the committed `src/vendor/supabase.mjs` (minified ESM, banner naming the SDK and esbuild versions). There is no runtime build step and no CDN: the static host serves the committed file. Rebuild and commit it whenever the SDK pin changes.

**Realtime publication.** Migration `007_realtime_publication.sql` adds the twelve browser-readable tables (`cases`, `document_requests`, `documents`, `client_events`, `workspaces`, `people`, `preparation_participants`, `admin_followups`, `contact_attempts`, `case_events`, `assistance_items`, `reviews`) to `supabase_realtime` and sets `publish = 'insert, update'`. Publishing exposes a table's write-ahead log to Realtime, which then applies the same RLS policies, so the list stops exactly where browser read permission stops: `action_receipts` and `vitally_private` are never published. DELETE and TRUNCATE are never published, because a removed row cannot be authorized through RLS state it no longer has. The migration is idempotent and fails loudly on a project with no `supabase_realtime` publication. Without it a browser subscription receives nothing while Realtime still reports `SUBSCRIBED`, and one unpublished table in a channel's set drops that channel's whole subscription.

## Task 5A auth gate evidence

`npm run test:auth-browser` (`node --env-file=.env.test --test tests/auth-browser.mjs`) is the early
cross-browser Auth compatibility gate. It serves the application in-process from this repository — never a
`.env.local` — configured only from the guarded test target, and drives the real access form in real Chrome and
real Firefox. Only the exact `/auth/v1/otp` URL of that target is answered by automation, so no automated run
ever asks a mail server for anything; `/auth/v1/verify` is never intercepted, and no session is ever injected.
Codes come from `auth.admin.generateLink({type:'magiclink'})` in the Node process, are typed into the real
field, and the signed-in user id is read back from the session the SDK stored in the page. No address, code or
token is logged, and the gate takes no screenshots.

Install the second engine with the command-scoped PATH before the first run; the default per-user browser cache
is used, and nothing is written into the repository:

```sh
PATH="$VITALLY_NODE_BIN:$PATH" ./node_modules/.bin/playwright install firefox
```

**Versions in the recorded run (2026-09-21).**

| Component | Observed |
| --- | --- |
| Google Chrome (installed channel, `chromium.launch({channel:'chrome'})`) | 153.0.8010.48 |
| Playwright Firefox (`firefox.launch()`) | 155.0, build 1543 |
| Playwright | 1.63.0 |
| Supabase Auth / GoTrue container | `public.ecr.aws/supabase/gotrue:v2.196.0` |
| PostgREST container | `public.ecr.aws/supabase/postgrest:v16.3` |
| Realtime / gateway / database / mail catcher containers | `realtime:v2.130.0`, `kong:2.8.1`, `postgres:17.6.1.167`, `mailpit:v1.30.2` |

**Observed sanitized Auth codes.** All from the isolated local stack described above, with `[auth]
enable_signup=false`, `[auth.email] enable_signup=true` and `max_frequency="60s"`. These are error identifiers,
never addresses or codes.

| Scenario | Call | Observed |
| --- | --- | --- |
| Unknown address, `shouldCreateUser:false` | `signInWithOtp` | `otp_disabled`, and `select count(*) from auth.users` for that address stays 0 |
| Same unknown address, direct sign-up | `signUp` | `signup_disabled` — public signup is closed |
| Confirmed address immediately after a `generateLink` | `signInWithOtp` | `over_email_send_rate_limit` (no mail leaves; the catcher is local anyway) |
| A one-time code that already signed someone in | `verifyOtp` | `otp_expired` |
| A wrong code (`000000`, and the removed fixed `246810`) | `verifyOtp` | `otp_expired`; the form stays on the code step and shows the invalid/expired copy |

**Repeat generation inside the send interval — the fact the earlier probe did not establish.** Two
`auth.admin.generateLink({type:'magiclink'})` calls for the *same* confirmed user, 2.7 s and 14.8 s apart in the
two engines and so well inside the verified 60-second interval, were **both accepted**, and the second call's
one-time code verified through the real form in both engines. The administrative generation path therefore does
not enforce `max_frequency` on this stack, although the public `signInWithOtp` path does (the row above). The
sign-out-and-return test consequently never needed its bounded wait; the wait remains in the test, capped at
75 seconds, for a target that behaves differently. No limit is ever lowered to pass this gate.

**Interception counts.** Exactly one intercepted `/auth/v1/otp` POST per sign-in, in both engines, asserted on
its own counter. **Zero** preflight requests reached the route handler in either engine, the same as the earlier
probe — so the handler's OPTIONS branch, its refusal of an unexpected method, its rejection of a foreign origin
and its `create_user:false` check are unit-tested directly against a stand-in route instead. The handler
deliberately carries no `times:1`, because on a runtime that does surface a preflight the OPTIONS would
otherwise consume the send handler and let the real request through.

**Not observable here, and why.** Real mail delivery (the send is intercepted; hosted SMTP proof is Task 10B).
`over_request_rate_limit` (would mean exhausting a shared quota). `email_provider_disabled` (a misconfiguration
the earlier probe already recorded; not reproduced deliberately). Hosted-project gateway behaviour, SMTP
provider failures and social-only accounts remain unobserved. `tests/fixtures/auth-send-outcomes.mjs` is
unchanged: no *send* outcome code appeared that it does not already record.

**A defect this gate found, now fixed, and now guarded.** The first two-engine run failed outright in Firefox:
while the resend countdown ran, the access screen rebuilt itself once a second (`src/app.mjs` `tickCooldown` →
`render`, which reassigned `#app.innerHTML`) and the rebuilt code field was rendered with an empty value, so a
code typed in one tick was gone in the next — measured at 25 ms to 1.04 s, simply whatever was left of the
current second. A visitor slower than that submitted an empty field, which its own `required` validation
silently blocked: no request, no message, nothing on screen.

The application fix keeps the typed code in `state.authCode`, renders the field from it, and has the tick patch
only the countdown text and the resend button (`data-role="resend-countdown"`) instead of re-rendering. The
gate now guards it two ways: signing in is a plain fill-then-click with no retry, so a field that cleared would
fail the login, and `tests/auth-browser.mjs` additionally types a value, waits — by condition — for the
countdown to advance two seconds, and asserts the value is still there. Both engines record
`codeSurvivedCountdownSeconds: 2`.
