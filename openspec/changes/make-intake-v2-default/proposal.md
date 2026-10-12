## Why

Version 2 of the client intake is built and merged, but every workspace still defaults to version 1, so new clients and the office still get the old form. The switch-over was held until the group's wording review was done. That review merged as #57 on 2026-10-12, so the hold is over. Making version 2 the default lets every new application use the reviewed form, and it is the prerequisite for removing version 1.

## What Changes

**The default intake version**
- From: `workspaces.default_intake_version` has column default 1, and every workspace is set to 1. New client applications, the office's Add a case and sample resets all use version 1.
- To: column default 2, and every existing workspace is set to 2 (migration `020_intake_v2_default.sql`, using the number the wording review left free). New applications and sample resets use version 2.
- Reason: version 2 is reviewed and ready, and clients should only ever see the final form.
- Impact: non-breaking for stored data. Existing cases keep the version they were created with: 011's triggers set it on insert and refuse to change it on update. A workspace can be set back to 1 with a one-line update, and that is the rollback.

**Tests and docs**
- `tests/database-intake-default.mjs`: the "column default is still 1" case becomes the switch-over checks.
- README, `docs/design/redesign-review.md`, `docs/developer/database.md` and `docs/setup.md` say version 2 is the default and that there are 22 migrations.
- CLAUDE.md's "Versions" rule no longer says the switch-over waits on the wording review.
- The test fixtures keep defaulting to version 1. A test that wants the real default passes `intakeVersion: null`.

**Known gap (not changed here)**
- Version 2 has no service-scope stop. Version 1's screening (tax year, residence, who fills the form, out-of-scope income) exists only in version 1.
- After the switch-over, an out-of-scope application submits normally from the client form or from Add a case, and the office handles scope at its intake checks.
- This was recorded as intended in the 2026-09-30 intake-screens design (§4.4), so it should not be mistaken for a regression. Version-2 scope rules need PCDC's rules in version-2 terms and are a later change.

## Capabilities

### New Capabilities
- `client-intake`: how an application's intake form version is chosen and kept. New applications from the client or the office use version 2; an application keeps its version for life; and a workspace's version decides which sample cases a reset seeds.

### Modified Capabilities
- None. `openspec/specs/` is empty, so this is the project's first canonical spec.

## Impact

- **Database:** one new hand-written migration, `supabase/migrations/020_intake_v2_default.sql`. It runs after 021 and 022 on databases that already have them, and before them on a fresh database. It redefines no function and does not touch the catalogue, so both orders end in the same state.
- **Code:** no application code changes. The client, the office's Add a case and the sample seeding already follow the workspace's version (011, 019, `workspace.defaultIntakeVersion`).
- **Tests:** `tests/database-intake-default.mjs`. The fixtures are unchanged.
- **Docs:** README.md, `docs/design/redesign-review.md`, `docs/developer/database.md`, `docs/setup.md`, CLAUDE.md.
- **Checks:** `npm test`, `npm run db:migrate:test`, then `npm run test:database`.
  - No browser or sign-in suite: both fixtures set the workspace's version explicitly, so no screen or sign-in path changes.
  - No 繁體 check: no client text changes.
- **Out of scope:** version-2 scope screening, version-1 removal, #58's demo framing, and the conflict-box rule.
