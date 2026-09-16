# ViTally

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

This is a prototype for managing VITA (Volunteer Income Tax Assistance) volunteer preparation, independent quality review, and admin follow-up, designed for **PCDC (Philadelphia Chinatown Development Corporation) Community**.

## Current status

The runnable app is the original local client/volunteer demo: intake, save/return, preparation claims, document requests, and simulated document responses. It stores one case in browser localStorage and uses simulated verification and presenter role switching.
It now supports shared workflow contracts, seeded fictional sample helpers, and safe blank-field filling are implemented and tested. The new helpers are not yet connected to the UI. Supabase persistence, real email access, and the admin/reviewer screens are still planned.

Use fictional data only. The current demo does not send email, store uploaded files, or prepare/file tax returns.

## Provisional design — September 15, 2026

The [ViTally shared-demo spec](docs/superpowers/specs/2026-09-15-vitally-shared-demo-design.md) defines the agreed scope:

- Shared applications across a client browser and a staff browser, with presenter controls for Alex (preparer), Morgan (reviewer), and Sam (admin).
- Independent review with either direct approval or corrections and resubmission; anyone who participated in preparation cannot review that case.
- A separate admin contact task that keeps the preparer assigned.
- Supabase-backed storage and approved group/class email access, generated application references, and fictional sample cases.
- Manually recorded TaxSlayer milestones; documents and reminders remain simulated.

Track progress in the [implementation plan](docs/superpowers/plans/2026-09-15-vitally-shared-demo.md). The [isolated Auth probe report](docs/superpowers/reviews/2026-09-15-vitally-auth-probe.md) records the early Chrome/Firefox OTP checks; it does not verify hosted email delivery or the completed application.

## Run locally

Use Node.js 24 LTS. The current app needs no dependency installation or Supabase configuration.

```sh
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). Use **Fill sample details** and **Use demo code** to try the client flow, then switch to **Volunteer view** in the prototype toolbar. Stop the server with Ctrl+C.

## Tests

```sh
npm test
```

The dependency-free suite covers existing workflow rules, shared contracts, and fictional sample helpers. Optional browser checks use `npm run test:browser` with Playwright and Google Chrome installed and the local server running.

