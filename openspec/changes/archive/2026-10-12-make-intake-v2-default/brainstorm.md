# Brainstorm: make-intake-v2-default

Raw capture of the design agreed in the conversation on 2026-10-12 (CLAUDE.md lifecycle step 2, after `/opsx:explore`).

## Background

- Version 2 of the client intake (steps 0–9 with sub-steps, the document checklist, Review & submit, the draft 13614-C, Chinese) has been built and merged through parts 4b2, 4c and 4d. Every workspace still defaults to version 1. `workspaces.default_intake_version` has column default 1, and no workspace is set to 2 outside tests.
- The switch-over was held from 2026-10-04 until the group's wording review was done. That review (#48) merged as #57 (fe802c7, 2026-10-12). It added migrations 021 (the review-approved history message) and 022 (the catalogue for the new wording), and left the number 020 free for the switch-over.
- The held plan is Task 7 of `docs/superpowers/plans/2026-10-04-staff-views-4c.md`, which follows §5 of `docs/superpowers/specs/2026-09-30-intake-screens-design.md`. It is a migration `020_intake_v2_default.sql` with two statements, plus test and doc updates.
- How the version reaches each path (read from the code):
  - **Client "Start":** 011's insert trigger copies the workspace's `default_intake_version` into the new case and ignores any explicit version.
  - **Office "Add a case":** the controller and views read `workspace.defaultIntakeVersion`. The store maps it with `?? 1`, which is only a null fallback.
  - **"Reset samples" / checkpoints:** 019 seeds samples that follow the workspace's version (`fixture_answers_v2`, contacts).
  - **Existing cases** keep their version for life (011).
- Test fixtures: `createDatabaseFixture({ intakeVersion = 1 })` and `createBrowserFixture({ intakeVersion = 1 })` set both workspaces explicitly. `null` leaves the column default. The browser story passes `intakeVersion: 2`, and its one version-1 phase sets its own workspace to 1.
- `tests/database-intake-default.mjs` has the case "the column default is still 1 (no switch-over here)", which the switch-over replaces.

## Decision chain

**Q1. Scope: only the held Task 7, or more?**
- Options:
  - (a) Only the held Task 7: the two statements, the database checks, the docs, and the CLAUDE.md "Versions" line.
  - (b) Also add version-2 scope screening, so there is no known gap at the switch-over.
  - (c) Merge in the version-1 removal.
- Recommendation: (a). (b) needs PCDC's scope rules restated in version-2 terms, which is a design project of its own. (c) is its own change in the agreed order (switch-over → version-1 removal → #58 demo framing → the conflict-box rule).
- **Decided (user): (a).**

**Q2. The first canonical spec: what capability, and what requirements?**
- `openspec/specs/` is empty, so this name sets the pattern.
- Options:
  - `client-intake`: the first likely name in CLAUDE.md. It covers how an application's intake form is chosen, for both the client and the office's Add a case, and it keeps growing after version 1 goes.
  - `intake-versions`: narrower, and version-1 removal would empty it.
- **Decided (user): `client-intake`**, with three ADDED requirements:
  1. **New applications use intake version 2.** A workspace defaults to version 2. Both a client starting an application and the office's Add a case create a version-2 case.
  2. **An application keeps the version it was created with.** An existing version-1 case stays version 1 after the switch-over and after any later change to its workspace's version.
  3. **A workspace's version decides its sample cases.** A reset in a version-2 workspace seeds version-2 samples. Setting a workspace back to 1 makes its next reset seed version-1 samples, and that is the rollback.
- **Version 2 has no service-scope stop.** This is recorded as a known gap in the proposal, quoting the 2026-09-30 design §4.4, and is not a requirement: a spec states what the system does, not what it lacks. After the switch-over, an out-of-scope application submits normally, and the office handles scope at its intake checks.

**Q3. Migration number after 021/022 (proposed default; user accepted the summary).**
- The migrator (`tools/admin/migrate.mjs`) applies every unrecorded `NNN_*.sql` file in name order, and refuses a changed applied file. So 020 runs:
  - after 021 and 022 on a database that already has them (the test stack);
  - before them on a fresh database.
- 020 redefines no function and does not touch the catalogue, so both orders end in the same state. **Keep 020**, as the group reserved it.
- Guard for the future: if 020 ever had to redefine `fixture_history` or `act_approve_review`, it would have to copy 021's versions, not 009's or 006's. That is one more reason to keep it to the two statements.
- `nextCatalogueMigration` numbers by the highest existing number, so the next catalogue load is 023, unaffected.

**Q4. Test fixtures (proposed default; accepted).**
- Both fixtures keep defaulting to version 1, so the roughly 30 database tests that save version-1 answers don't change, and their resets seed version-1 samples.
- A test that wants the real column default passes `intakeVersion: null`.

**Q5. Checks (proposed default; accepted).**
- Run `npm test`, `npm run db:migrate:test`, then `npm run test:database` (migrations and database behaviour).
- No `test:browser` and no `test:auth-browser`: both fixtures set the workspace's version explicitly, so no screen or sign-in path changes behaviour.
- No `build:hant -- --check`: no client text changes.

**Q6. Change name (proposed default; accepted): `make-intake-v2-default`.**

## The design

`supabase/migrations/020_intake_v2_default.sql`. Its header comment names the change, says it changes no function or catalogue, and says it is re-appliable.

```sql
alter table public.workspaces alter column default_intake_version set default 2;
update public.workspaces set default_intake_version = 2;
```

Both statements are idempotent. Existing cases keep their `intake_version` because 011's trigger runs only on insert.

**Tests** (`tests/database-intake-default.mjs`). Replace "the column default is still 1 (no switch-over here)" with:
- the column default is 2 (`information_schema.columns`);
- a workspace from `createDatabaseFixture({ intakeVersion: null })` is version 2, and a client case created in it is version 2;
- an existing version-1 case keeps version 1 after the workspace is version 2 and after the case is updated;
- a reset in a version-2 workspace seeds version-2 samples. A workspace set back to 1 seeds version-1 samples on its next reset.

Write the tests first and see them fail on the test stack, then apply 020.

**Docs:**
- `README.md`: version 2 is the default.
- `docs/design/redesign-review.md`: status.
- `docs/developer/database.md` and `docs/setup.md`: the 020 row, and 22 migrations (setup.md says "Twenty-one migrations… 020 is left free"); the database count after the run.
- `CLAUDE.md`: the "Versions" rule no longer says the switch-over waits on the wording review. Version 2 is the default, and version 1 stays for existing cases until its own removal change.

## Dependencies

- The local test stack `vitally-task2` (port 54321) is **ready**.
- No hosted project needs migrating. The classroom target runs the same migrator if one is ever set up, and both orders are safe (Q3).

## Acceptance

- 020 applies on the test stack after 021 and 022.
- A fresh database would apply 020 before them. That order is shown safe by inspection: 021 and 022 never touch `default_intake_version`, and 020 touches nothing else. A from-scratch run means recreating the test stack and is optional. (Refined while writing design.md, because the migrator never resets a database.)
- The database checks above pass.
- All other unit and database tests stay green.
- The docs and CLAUDE.md say version 2 is the default and that there are 22 migrations.

## Refined after the planning review (2026-10-12)

- An office (assisted) case check is added beside the client case check, because Requirement 1 covers Add a case too.
- `docs/developer/architecture.md` ("still 1 everywhere") and the samples note in `docs/developer/database.md` ("No migration yet changes…") join the doc updates. setup.md's last-verified database clause is rewritten whole, because #57's 021 and 022 already made it wrong.
- The sentence "the version comes from the workspace, never from the request" is dropped from Requirement 1. Nothing tests it, and `vitally_create_case` takes no version. It remains 011's behaviour, for a later change to spec.
- design.md records two more effects as accepted: a version-2 create that carries answers fails with `VT007` (the version-1 assisted form, or a window still showing it), and 020's UPDATE makes every subscribed window re-read.

## Out of scope

- Version-2 scope screening (the known gap).
- Version-1 removal.
- #58's demo framing.
- The conflict-box rule.
- Any change to the fixtures' defaults.
