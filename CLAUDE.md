# CLAUDE.md

ViTally is a classroom demonstration of a VITA (Volunteer Income Tax Assistance) workflow for the PCDC community: client intake, volunteer preparation, independent review, office follow-up and assistance, with real email sign-in and shared state across browsers. Start with [README.md](README.md). The developer guide is [docs/developer/](docs/developer/README.md), and local setup is [docs/setup.md](docs/setup.md).

## Specs: where the source of truth lives

- **Canonical specs live in `openspec/specs/<capability>/spec.md`.** They describe the system's current, testable behaviour, one folder per capability.
- **Canonical specs start with the next change.** Nothing is back-filled. Each change proposes delta specs (`ADDED` / `MODIFIED` / `REMOVED`) for only the slice it touches, and archiving the change merges those deltas into `openspec/specs/`. The specs fill in as the work does.
- **Capabilities are named by feature area, in the words the team already uses.** Create a capability folder only when a change first needs it; don't design the whole taxonomy up front. Likely examples: `client-intake`, `document-checklist`, `draft-13614c`, `staff-case-work`, `office-follow-up`, `review-and-corrections`, `sign-in`, `client-languages`.
- **Don't write specs for code you aren't changing,** and don't bulk-convert old documents into specs. Both produce large, stale specs nobody trusts.

### Historical documents

- **`docs/superpowers/specs/` contains historical design documents.** Use them for design rationale and historical context only.
- **The same goes for `docs/superpowers/plans/`, `docs/superpowers/reviews/` and `docs/superpowers/notes/`.** They record how parts 1–4d were designed and built.
- **Don't remove, move or rewrite them, and don't add new files there.** New design work and plans belong to an OpenSpec change (see Workflow routing below).
- **When a change touches an area that a historical document covers,** read that document during `/opsx:explore`. Carry the behaviour that still holds into the change's delta specs as testable requirements.

### Authority order

When sources disagree, use this order:

1. Explicit user instructions for the current task
2. The active OpenSpec change artifacts, for the scope of that change
3. Canonical specifications under `openspec/specs/`
4. Current code and tests as implementation evidence
5. Historical documents under `docs/superpowers/`

Code or tests that disagree with a canonical specification indicate possible specification drift or an implementation defect. Do not silently change either side to match the other; surface the conflict.

## Workflow routing (read on session start)

This repo uses [`superpowers-bridge`](https://github.com/JiangWay/openspec-schemas/tree/main/superpowers-bridge) to bridge OpenSpec and Superpowers. It is the project's default schema (`openspec/config.yaml`), and the schema itself is in `openspec/schemas/superpowers-bridge/`. Integration rules (language, artifact paths, PRECHECK) follow that bridge's README; this section is the routing guidance for Claude.

### Entry routing

| Trigger you observe | What to do |
|---|---|
| User starts a narrative design discussion / "let's brainstorm" | Use Superpowers brainstorming discipline conversationally. Keep all output in the conversation; do not create any artifact. When the 5 promotion criteria hold, suggest `/opsx:propose`. |
| User invokes `/opsx:new` / `/opsx:ff` / `/opsx:propose` directly | Follow the schema's flow; artifact instructions inject at each step |
| User explicitly says bug fix / typo / config tweak / doc update | Direct PR — **do NOT** open a change (see skip rules below) |
| User is mid-change | Advance with `/opsx:continue`, `/opsx:apply`, `/opsx:verify`, or `/opsx:archive` |

### When NOT to use opsx (direct PR)

Low-risk cases:

- a bug fix with no contract change;
- a test backfill;
- a linter tweak;
- a non-breaking dependency upgrade;
- a typo;
- documentation;
- a config value tweak.

Use opsx for new capabilities, behavior or contract changes, architecture changes, schema changes, cross-system integrations, breaking changes, and compliance boundaries.

Use a direct PR only when the work preserves the intended behavior and fits one of the low-risk cases above.

### Verbal brainstorm → opsx promotion criteria

All 5 must hold before promoting (any missing → keep brainstorming, **never** write to `docs/superpowers/specs/`):

1. **Scope locked** — one sentence describes what's in / out
2. **Major design forks resolved** — alternatives weighed; remaining TBDs have an owner and impact-scope statement
3. **Cross-system dependencies mapped** — ready / mockable / genuinely unknown — pick one per dep
4. **Acceptance criteria stateable** — concrete pass conditions: the change's deliverables, plus the checks that cover what it touches (see Verification below)
5. **Conversation converging** — recent turns are confirmations, not new alternatives

When all 5 hold → proactively suggest "ready to `/opsx:propose`?" — wait for user ack. Never auto-trigger.

### Front-door anti-patterns (don't do)

- Letting brainstorming write to `docs/superpowers/specs/`
- Letting writing-plans write to `docs/superpowers/plans/`
- Promoting to opsx with unresolved blocking TBDs
- Opening a change for bug fix / typo

Full detail: [superpowers-bridge README §Entry & exit gates](https://github.com/JiangWay/openspec-schemas/blob/main/superpowers-bridge/README.md#entry--exit-gates).

## Project rules

- **Data and branding:**
  - Use fictional data only, in code, tests, fixtures and screenshots.
  - Never substitute, redraw or generate PCDC logos (`src/pcdc-logo.png`).
- **Database:**
  - Migrations in `supabase/migrations/` are hand-written and final once applied. Never edit an applied migration; add a new one.
  - Changes to the question catalogue go through `docs/intake-questions/` and `npm run build:intake`, which writes a new catalogue migration when the catalogue changes.
- **Local test stack:**
  - It runs from its own work directory (`$VITALLY_STACK`; see [docs/setup.md](docs/setup.md)).
  - Never run `supabase start` from the repo root.
- **Versions:** version 1 of the intake stays as it is until its own removal part. Version 2 is not yet every workspace's default: the switch-over migration waits on the group's wording review.
- **Client text:**
  - Screen text lives in `src/client-text.mjs` (English and 简体), and catalogue text in the catalogue.
  - 繁體 is generated: after any 简体 change, run `npm run build:hant` and commit `src/zh-hant.mjs`.
  - Staff screens stay English.
- **Verification:** run the checks that cover what the change touches, not every suite every time.
  - **Always:** `npm test` (unit).
  - **Migrations, SQL functions or other database behaviour:** `npm run db:migrate:test`, then `npm run test:database`.
  - **Sign-in:** `npm run test:auth-browser`.
  - **Anything a browser shows or does** (views, `app.mjs`, the controller, CSS, the story): `npm run test:browser` (Playwright, about 11–16 minutes).
  - **Client text in Chinese:** `npm run build:hant -- --check`.
  - **Server-only changes** (for example `server.mjs` or `tools/`): their unit tests, plus any suite whose behaviour they reach.
  - Say which checks you ran and why the others weren't needed.
- **Git:**
  - Teammates merge into `main`, so sync with `main` before pushing.
  - Leave the untracked `VITA-Management-System-Demo/` directory, `.claude/worktrees/` and `.stitch/captures` alone.
