## Context

- **Where the version comes from:** a workspace's `default_intake_version` decides which intake form a new application gets.
- **What follows it:** every path already does.
  - **Client "Start":** 011's `cases_intake_version_insert` trigger copies the workspace's version into the new case and ignores any explicit one. Its `cases_intake_version_fixed` trigger refuses to change the version on update.
  - **Office's Add a case:** the controller and views branch on `workspace.defaultIntakeVersion`.
  - **Sample cases:** 019's seeding writes version-1 or version-2 samples according to the workspace's version at the time of the reset.
- **Where it stands today:** the column default is 1, and no workspace outside tests is set to 2.
- **Why now:** version 2 was finished in parts 4b2, 4c and 4d, then held from 2026-10-04 for the group's wording review. That review merged as #57 (fe802c7). It added migrations 021 (the review-approved history message, copying `act_approve_review` from 006 and `fixture_history` from 009) and 022 (a catalogue load), and left the number 020 for this change.
- **The plan this follows:** the switch-over was planned as Task 7 of the 4c plan (`docs/superpowers/plans/2026-10-04-staff-views-4c.md`), following §5 of the 2026-09-30 intake-screens design. Both are historical documents. The behaviour that still holds is carried into this change's `client-intake` delta spec.
- **Migrator:** `tools/admin/migrate.mjs` applies every unrecorded `NNN_*.sql` file in name order, inside one transaction under an advisory lock, and refuses a migration whose digest changed after it was applied.
- **Stakeholders:**
  - clients and office staff, who see the form;
  - the group, who reviewed the wording;
  - PCDC, who receives the product in November (#58).

## Goals / Non-Goals

**Goals:**
- New applications from a client or from the office's Add a case are version 2, in every existing and future workspace.
- Existing applications keep their version.
- Sample resets seed version-2 samples by default. A workspace set back to 1 seeds version-1 samples.
- The first canonical spec, `client-intake`, states these three behaviours.
- Docs and CLAUDE.md describe version 2 as the default.

**Non-Goals:**
- Version-2 scope screening. It is a known gap, recorded in the proposal.
- Removing version 1 or its code, tests or catalogue.
- #58's demo framing, and the conflict-box rule.
- Changing either test fixture's default version.
- Any change to application code, client text or the catalogue.

## Decisions

### D1: Two statements, nothing else
- **Choice:** `020_intake_v2_default.sql` contains only these two statements, with a header comment saying what it does, that it redefines no function and touches no catalogue, and that it is re-appliable:
  - `alter table public.workspaces alter column default_intake_version set default 2;`
  - `update public.workspaces set default_intake_version = 2;`
- **Rationale:** every consumer already follows the workspace's version (Context), so the default is the only thing missing. Both statements are idempotent.
- **Alternatives considered:**
  - Also redefining `seed_fixtures` or `fixture_history`. Not needed, because 019 already follows the version. It would also make 020 order-sensitive against 021 (D2).
  - Setting only the column default and leaving existing workspaces at 1. Rejected, because existing workspaces would keep giving clients the old form.

### D2: Keep the number 020, and make it order-independent
- **Choice:** use 020, which the wording review reserved, even though 021 and 022 are already applied on the test stack.
- **Rationale:**
  - The migrator applies unrecorded files in name order, so 020 runs after 022 on the test stack and before 021 on a fresh database.
  - Because 020 touches only the workspaces' version column, both orders reach the same end state. 021 redefines `act_approve_review` and `fixture_history`, and 022 loads the catalogue, and neither depends on the default version.
  - `nextCatalogueMigration` numbers from the highest existing file, so the next catalogue load is 023.
- **Alternatives considered:** renumbering to 023, which would apply in order everywhere. Rejected, because it breaks the reservation the group and the docs already state, and buys nothing while D1 holds.
- **Guard:** if 020 ever had to redefine `fixture_history` or `act_approve_review`, it would have to copy 021's definitions, not 009's or 006's.

### D3: First canonical spec `client-intake`, three requirements
- **Choice:** a new capability `client-intake` with these ADDED requirements:
  - new applications use version 2;
  - an application keeps its version;
  - a workspace's version decides its sample cases.
- **Rationale:** CLAUDE.md names `client-intake` as a likely capability. The behaviour covers both the client and the office's Add a case, and the capability outlives version 1. Capability folders are created only when a change first needs them.
- **Alternatives considered:** `intake-versions`, which is narrower and would be emptied by the version-1 removal.
- **Excluded:** the scope-screening gap is not a requirement, because a spec states what the system does.

### D4: Fixtures keep version 1 by default
- **Choice:** `createDatabaseFixture` and `createBrowserFixture` keep `intakeVersion = 1`. Switch-over tests pass `intakeVersion: null` to see the real column default.
- **Rationale:** about 30 database tests save version-1 answers (`makeSampleAnswers()`) and expect version-1 resets. The story already opts into version 2 explicitly.
- **Alternatives considered:** flipping the fixture default to 2. Rejected, because it is a large test rewrite that belongs with the version-1 removal.

### D5: Checks scoped to the database
- **Choice:** `npm test`, `npm run db:migrate:test`, then `npm run test:database`.
- **Rationale:** per CLAUDE.md's Verification rule, migrations call for the database suites.
  - The browser story and the sign-in suite build their workspaces through fixtures that set the version explicitly, so their behaviour is unchanged.
  - No client text changes, so there is no 繁體 check.

## Risks / Trade-offs

- **[Risk]** An out-of-scope client (wrong tax year, out-of-scope income) can now submit, because version 2 has no screening.
  → **Mitigation:** the office handles scope at its intake checks, as the 2026-09-30 design intended. The proposal records it as a known gap, and version-2 scope rules are a later change.
- **[Risk]** A future edit makes 020 depend on order against 021 or 022.
  → **Mitigation:** D1 keeps it to the version column, the header comment says so, and D2's guard names the rule.
- **[Risk]** The migration is applied, then needs changing. Applied migrations are final, and the migrator refuses a changed digest.
  → **Mitigation:** the tests are written and seen to fail before 020 is applied to the test stack (tasks order). Any later correction is a new migration.
- **[Risk]** A create that carries answers fails after 020. 011's insert trigger rejects a version-2 create whose answers aren't `{}` (`VT007` VALIDATION). Two cases send answers:
  - the version-1 assisted form (the office's old Add a case) sends its answers on create;
  - a window that loaded the workspace as version 1 before 020 still shows that form until it re-reads the workspace.

  → **Accepted:**
  - There is no hosted project (`docs/setup.md`, "Not done"), so no one has such a window open when 020 runs. A future deployment runs 020 before anyone uses it.
  - `workspaces` is in the realtime publication (`tests/database-realtime.mjs`), so 020's UPDATE makes every open window re-read the workspace, and the version-1 form goes away.
  - The client's own Start sends `{}` (`createCase`), so it is not affected.
- **[Side effect]** 020's `update public.workspaces` publishes one UPDATE per workspace to every subscribed window. Each window then re-reads its list, workspace, assistance items and open case (the controller's realtime handler). On an Add a case page with no draft open, `enterOfficeDraftIfNeeded` swaps the version-1 form for the version-2 draft, and anything typed into the version-1 form is no longer shown.
  → **Accepted:** the re-read is harmless and happens once. The swap matters only for a window that is mid-entry when 020 runs, which no deployment has today (above).
- **[Trade-off]** In-progress version-1 drafts in an existing workspace stay version 1, and their clients keep the old form until they submit.
  → **Accepted:** the version is pinned for life by design (011). There are no real users yet, and version 1 remains until its own removal change.
- **[Trade-off]** Most tests still run on version 1 (D4), so the default path is covered mainly by the new switch-over checks and the story's explicit version 2.
  → **Accepted** until the version-1 removal moves the fixtures.

## Migration Plan

1. On the change branch, write the switch-over checks in `tests/database-intake-default.mjs`. Run `npm run test:database` and see them fail.
2. Add `020_intake_v2_default.sql`, then run `npm run db:migrate:test`. On the test stack it applies after 021 and 022.
3. Run `npm test` and `npm run test:database`. Everything passes.
4. Confirm the fresh-database order by inspection. 021 and 022 never read or write `default_intake_version` (a grep of both files finds no match). 020 references nothing that 021 or 022 define. So applying 020 before them, as a fresh database does, reaches the same state. An actual from-scratch run means recreating the test stack (`docs/setup.md`). It is optional and not part of acceptance.
5. Update the docs and CLAUDE.md.

- **Rollback:** `update public.workspaces set default_intake_version = 1;` (and, if wanted, the column default back to 1) in a new migration. Existing version-2 cases keep version 2. The workspace's next reset seeds version-1 samples.
- **Deploy:** there is no hosted project today. A future target runs the same migrator, and both orders are safe (D2).

## Open Questions

- None blocking.
- **Left as they are:** two version-1 fallbacks for a null version that cannot fire. The column is `not null` (011), and a case's workspace must exist.
  - `coalesce(v_version, 1)` in 011's insert trigger;
  - `Number(row.default_intake_version ?? 1)` in `src/supabase-store.mjs` (pinned by `tests/store.test.mjs`).

  They are harmless. The version-1 removal change should drop or revisit them.
- Version-2 scope screening (owner: the group with PCDC) affects only whether out-of-scope applications are stopped before the office sees them. It is tracked as a later change.
