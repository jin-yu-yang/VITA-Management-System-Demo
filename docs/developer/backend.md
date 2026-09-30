# Back end and operations

ViTally has no application server. Supabase provides authentication, the HTTP API, live updates
and the database, and the business logic lives in the database ([database guide](database.md)).
This page covers everything else on the server side: the small local web server, configuration,
Auth and email, the privileged tooling, environments, and what to add when the system needs a
real service.

Step-by-step setup is in [`docs/setup.md`](../setup.md); this page explains how the parts work.

## What runs where

| Piece | Runs on | Talks to | Holds secrets? |
| --- | --- | --- | --- |
| Static files (`index.html`, `src/`) | Browser, from `server.mjs` or any static host | Supabase, with the publishable key | No |
| `server.mjs` | Developer machine, `127.0.0.1:4173` | Nothing; serves files and one JSON document | Reads `.env.local`, publishes only public values |
| Supabase (Auth, PostgREST, Realtime, PostgreSQL) | Local Docker stack, or a hosted project | Browsers, and SMTP for sign-in email | Yes: service keys, database password, SMTP credentials |
| `tools/admin/*` | Operator's machine | The database and Auth admin API directly | Uses `.env.test` or `.env.admin` |
| Test suites | Developer machine | The local stack only | Uses `.env.test` |

## The local server

[`server.mjs`](../../server.mjs) exists so a developer can run the app with `npm start`. It is not
needed in production: any static host that serves the files plus a `public-config.json` does the
same job.

- **Allowlist, not a file server.** It serves exactly `/`, `/index.html`, `/src/<name>.mjs|css|svg`,
  `/src/vendor/<name>.mjs` and `/public-config.json`. The check runs on the raw request path
  before any `..` or percent-escape is resolved, so path tricks cannot reach migrations, tools or
  `.env` files. Everything else is 404.
- **`GET` and `HEAD` only**, with `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- **Port** 4173, or `PORT` from `.env.local`. It binds to `127.0.0.1` only.
- Tests: [`tests/server.test.mjs`](../../tests/server.test.mjs) covers traversal attempts, methods,
  and that no private value ever appears in a response.

### The public configuration contract

The browser fetches `./public-config.json` at start-up. It is one of exactly two shapes:

```json
{"configured": false}
```

```json
{
  "configured": true,
  "supabaseUrl": "https://<project-ref>.supabase.co",
  "supabasePublishableKey": "<publishable key>",
  "authResendCooldownSeconds": 65
}
```

`server.mjs` builds it from `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and
`AUTH_RESEND_COOLDOWN_SECONDS` in `.env.local`. A static host serves it as a plain committed file.
The publishable key is designed to be public; row-level security protects the data. **The
service-role (secret) key must never appear in this file, in `src/`, or in the repository.**

## Configuration files

| File | Committed? | Used by | Contains |
| --- | --- | --- | --- |
| `.env.example` | Yes | Template | Variable names for `.env.local` |
| `.env.local` | No | `npm start` | Public browser config (URL, publishable key, cooldown, optional port) |
| `.env.test.example` | Yes | Template | Variable names for `.env.test` |
| `.env.test` | No | Tests, `migrate`, `roster --target test` | Local stack URL, publishable and secret keys, database URL, instance id, manifest path |
| `.env.admin.example` | Yes | Template | Variable names for `.env.admin` |
| `.env.admin` | No | `migrate`/`roster --target classroom` | Classroom project URL, secret key, database URL, project ref, operator confirmation |
| `.vitally-targets.json` | No | Every privileged tool | Endpoint identity only (hosts, ports, container names, project refs); no keys |
| `.vitally-roster*.json` | No | `roster` | Approved email addresses and roles |
| `supabase/test-stack.config.example.toml` | Yes | Reference | The local stack's Supabase CLI settings |
| `.vitally-runs/` | No | Test fixtures | Records of what each test run created, for cleanup |

`.gitignore` excludes every `.env*` file except the `*.example` templates, and the targets,
roster and run files. Keep private files at mode `600`.

## Auth and email

Sign-in is Supabase Auth email one-time codes. The configuration that makes it safe:

| Setting | Value | Why |
| --- | --- | --- |
| Public sign-up | Off (`[auth] enable_signup = false`) | Only rostered accounts exist |
| Email provider | On (`[auth.email] enable_signup = true`) | The email method itself must stay enabled |
| Anonymous sign-ins | Off | No anonymous sessions |
| Browser call | `signInWithOtp({ shouldCreateUser: false })` | An unknown address creates nothing |
| Minimum resend interval | 60 s (`max_frequency = "60s"`) | The browser adds 5 s and shows a countdown |
| Email template | The **Magic Link** template contains `{{ .Token }}` | Existing users get that template; the app asks for the code, not a link |
| Rate limits | Supabase defaults | The local test stack raises `sign_in_sign_ups` to 1000 for automated tests only. Never copy that to a real project |

**Accounts are created only by the roster command** (below), already confirmed and with no
password. The sign-in form shows the same message for any address, so it cannot reveal who is on
the roster.

**Email delivery.** The local stack sends nothing: every email is caught by its local mailbox
(Mailpit, `http://127.0.0.1:54324` with default ports). A hosted project needs custom SMTP (Gmail
with an app password, or Resend with a verified domain); setup is in
[`docs/setup.md`, classroom section](../setup.md#6-classroom-and-hosted-setup-pending).

## Privileged tooling

Everything in [`tools/admin/`](../../tools/admin/) uses the secret key or the database password,
so each tool must prove it is pointed at the intended target before doing anything.

| Module | Role |
| --- | --- |
| `target-common.mjs` | Shared guard helpers: read the manifest, validate an API/database endpoint pair |
| `test-target.mjs` | Approves the local test stack: loopback only, exact container names, labels and ports from the manifest |
| `classroom-target.mjs` | Approves the classroom project: HTTPS, the session pooler (or a verified direct connection) with `sslmode=verify-full`, a project ref the operator typed in by hand, and nothing that matches the test target |
| `database.mjs` | `openDatabase(target)`: guard first, then connect; maps database errors |
| `migrate.mjs` | Applies pending migrations with a SHA-256 ledger. `--target test` (default) or `--target classroom` |
| `workspace-setup.mjs` | `initializeWorkspace`: creates a workspace, its three staff people, memberships and sample-case bindings |
| `roster.mjs` | Reads a roster file, creates confirmed password-free accounts, and calls `initializeWorkspace`. Never prints an address |

A guard failure is always `TARGET_REJECTED` and deliberately does not say which check failed;
[`docs/setup.md`](../setup.md#private-test-configuration) lists what to check. The guards are unit
tested in [`tests/targets.test.mjs`](../../tests/targets.test.mjs).

**Never run test cleanup against a real project.** The test fixtures create and delete their own
workspaces and accounts; they only ever accept the test target.

## Environments

| Environment | Status | Purpose |
| --- | --- | --- |
| Local test stack (Docker, Supabase CLI 2.117.0) | Working | Development, all test suites, rehearsal accounts |
| Classroom project (hosted Supabase) | Not created yet | The class demonstration with real email |
| GitHub Pages copy of `main` | Serves files; shows "not configured" | Public demo once a `public-config.json` for the classroom project is committed |

For production you will want at least a development project, a staging project and a production
project, each with its own keys, SMTP settings and roster, and migrations applied to each in turn.
The target guards already separate a test target from a classroom target; extend the same idea to
staging and production rather than reusing one set of credentials.

## Operations checklist for a real deployment

None of this exists yet; it is the list to work through.

- **Continuous integration.** There is no CI. Start with `npm test` on every pull request; add
  the database and browser suites with a Supabase CLI stack in the CI job.
- **Backups and restore.** Decide what the plan's backups provide, and practise a restore.
- **Secrets.** Secret keys only in the hosting provider's secret store and operators' private
  files. Rotate them when someone leaves the team.
- **Monitoring.** Supabase logs for Auth failures, database errors and slow queries; alerts on
  email delivery failures.
- **HTTP headers on the static host.** A Content-Security-Policy allowing only the app's own
  scripts and the Supabase URL, plus HSTS. The local server sets `nosniff` but no CSP.
- **Data retention.** Tax data has retention and deletion obligations; decide them before any real
  client uses the system.

## Adding a service beside the database

Some production features cannot run in the browser or in SQL alone: sending status emails,
storing and scanning uploaded documents, generating IRS forms (13614-C, 14446) as PDFs, reports,
and any integration. When you need one:

- **Keep the database contract.** Let workflow changes keep going through the five RPC functions
  (or new ones added the same way), so every rule stays enforced in one place, for every caller.
- **Run it server-side with the secret key**, as a Supabase Edge Function or a small separate
  service. Never ship the secret key to a browser.
- **React to changes, do not poll.** Subscribe to Realtime or use a database trigger to notify the
  service when a case changes, then read what you need.
- **Keep it idempotent.** Reuse the action-id-and-receipt pattern for anything a service writes, so
  retries are safe.

If the team later wants a conventional back end (for example Node or Python with its own API),
the SQL functions can move into it, but the check order, error codes, receipts and revision
fencing described in the [database guide](database.md#check-order-and-error-codes) are the
contract to keep. The browser's tests and the database tests describe that contract precisely.
