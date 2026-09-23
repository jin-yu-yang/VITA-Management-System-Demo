# ViTally

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

ViTally is a classroom demonstration of a VITA (Volunteer Income Tax Assistance) shared workflow:
client intake, volunteer preparation, independent review with corrections, admin follow-up, and
assistance requests, with real email sign-in and shared state across browsers. It is designed for
**PCDC (Philadelphia Chinatown Development Corporation) Community**.

Use fictional data only. ViTally never files or prepares a real tax return; document uploads,
reminders, and TaxSlayer preparation milestones are simulated throughout, and every seeded sample
case uses invented names with no address or other routable contact detail.

## Current status

The full workflow described in the [approved design](docs/superpowers/specs/2026-09-15-vitally-shared-demo-design.md)
is implemented and tested against an isolated local Supabase stack: identity and case ownership,
every workflow action (intake through closure, documents, admin follow-up, assistance, independent
review and corrections), real email (OTP) sign-in, Realtime-driven shared state across two
browsers, and six seeded sample cases with presenter-only reset/checkpoint controls.

**Not done yet:** there is no hosted Supabase project, no classroom roster, and no configured SMTP
sender or live email delivery (Task 10B — a user-owned setup step), and there is no public hosting
destination (Task 10D). The GitHub Pages copy of `main` therefore currently shows ViTally's
"not configured yet" setup screen rather than a working sign-in form, and nothing in this
repository's documentation claims live delivery or hosted access is working. See
[`docs/setup.md`](docs/setup.md#6-classroom-and-hosted-setup-pending) for exactly what remains and
what it needs from the user.

Track progress in the [implementation plan](docs/superpowers/plans/2026-09-15-vitally-shared-demo.md).

## Run locally

Use Node.js **24.21.0** explicitly (see [`docs/setup.md`](docs/setup.md#1-runtime) for the
command-scoped `PATH` this project uses instead of changing the global Node version), then:

```sh
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). With no local configuration, this shows the
setup-needed screen. To sign in and try the client/staff/admin/presenter screens against a real
(isolated, local-only) Supabase project, follow [`docs/setup.md`](docs/setup.md) end to end — it
covers the runtime, the isolated local Supabase test stack, `.env.local`, and every test command.
Signing in also needs accounts on a roster; [Signing in locally](docs/setup.md#signing-in-locally)
creates fictional rehearsal accounts whose codes arrive in the local stack's mail catcher. Stop the
server with Ctrl+C.

## Tests

```sh
npm test
```

This runs the unit suite alone (pure domain logic, adapters against fakes, view renderers, the
controller, server config logic — no network). The database suite, the two-engine Auth
compatibility gate, and the full cross-browser demonstration story all require the isolated local
Supabase stack described in [`docs/setup.md`](docs/setup.md#5-tests):

```sh
npm run test:database       # against the isolated stack, requires .env.test
npm run test:auth-browser   # real Chrome + real Firefox, real OTP verification
npm run test:browser        # the full demonstration story, both engines, both directions
```

## Rehearsing the demonstration

[`docs/demo-script.md`](docs/demo-script.md) is the rehearsal script: the two-minute main story,
the full story the browser test suite runs, the assisted-intake (walk-in) path, presenter
panel usage, what is simulated versus real, and what to expect and say about the known behaviors
the test suite has pinned (a stale-revision refusal, the `review_ready` fixture's staff-recorded
document, and so on).

