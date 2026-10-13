# Brainstorm: remove-intake-v1

A raw capture of the design agreed in the conversation on 2026-10-12, during CLAUDE.md lifecycle step 2 (`/opsx:explore` and the brainstorm). Two direct PRs landed in the middle of it: CI layer 1 (#60) and the line-endings fix (#61).

## Background

- Version 2 of the client intake has been every workspace's default since migration 020 (#59, `make-intake-v2-default`). The canonical spec `openspec/specs/client-intake/spec.md` says so in three requirements, and requirement 3 includes a rollback: a workspace set back to 1 seeds version-1 samples.
- The old designs (2026-09-30 intake-screens design §1, `docs/developer/production-roadmap.md`) said to remove version 1 "once no version-1 case is open (checked in the database first)".
- ViTally goes to PCDC in November 2026 as a real product (#58). That will be a new deployment. There is no hosted project today, so no real version-1 application exists anywhere.
- **The test stack, read before planning** (lesson from the 020 retrospective). `vitally-task2` has migrations 001–022 applied, the same as `main`. Version-1 cases on it:

  | Where | Version-1 cases |
  |---|---|
  | Test workspaces (6) | 6 samples and 6 other cases |
  | The one non-test workspace, the local rehearsal workspace used by the dev server on port 4173 | 6 samples and 4 rehearsal applications (Sept 25 – Oct 4), plus 1 version-2 application |

- **Where version 1 lives (survey):**
  - **Client:** `intakeScreen`/`intakeBody` (the old form), `domain.mjs` (`INTAKE_ANSWER_KEYS`, `REQUIRED_ANSWER_KEYS`, `screening`, `missingAnswers`, `submissionBlocker`), and the `v1.english_only` note and its wrapper.
  - **Office:** `renderAddCase` (the old Add a case), and `assistedAnswersPanel` (the old office draft on Overview, with its fill tool and the "tax year 2025 only" blocker).
  - **Staff:** `answersPanelV1`.
  - **Controller and app:** about 23 version branches in `controller.mjs`, plus 5 in `app.mjs`, 7 in `staff-views.mjs` and 8 in `client-views.mjs`. `sample-data.mjs` holds the version-1 templates.
  - **Database:**
    - the version-1 key list in `vitally_create_case` (`001:221`);
    - the version-1 branches of the action functions (011, 013, 017);
    - `fixture_answers` and 019's version-1 seeding branch;
    - the `coalesce(…, 1)` in 011's insert trigger;
    - the two `CHECK` constraints allowing `[1, 2]`.

    Version 1 has no rows in `intake_fields` or `intake_substeps`.
  - **Tests:**
    - `makeSampleAnswers()` (version 1 by default) in 18 files;
    - both fixtures defaulting to `intakeVersion = 1`;
    - fixture helpers that create cases with answers;
    - the story's version-1 phase.

## Decision chain

**Q1. How deep the removal goes.**
- Options: (A) a full removal in one change, or (B) screens first and the database in a later change.
- **Decided (user): A.** No real version-1 data exists. Removing only the screens would leave the database able to create cases no screen can show. And the test rewrite is needed either way.

**Q2 (detour).** CI layer 1 and the line-endings fix landed first, as direct PRs: #60 and #61. CI now runs the unit tests, the 繁體 check, the intake-catalogue check, OpenSpec validation and a CRLF check, and `checks` is required on `main`.

**Q3. What happens to version-1 cases that exist when the migration runs.**
- Options:
  - (A) a guard, then a cleanup;
  - (B) a guard only, which would break every developer's stack;
  - (C) converting them to version 2, which would invent answers;
  - (D) leaving the rows, which no screen could open.
- **Decided (user): A, refined:**
  - Every **version-1 sample** (`fixture = true`) is always deleted. Samples are fictional and re-seeded.
  - Every **version-1 case in a test workspace** (`vitally_private.test_workspaces`) is deleted.
  - **Any other version-1 application stops the migration.** On a real deployment there are none. On a developer stack, the developer clears them first.
- **This stack:** the local rehearsal workspace (its dev server is stopped) holds 4 non-sample version-1 applications, so the guard would stop the migration here. **Decided (user):** at apply time, before the migration runs, delete the whole rehearsal workspace. This is confirmed with the user once more at that moment, because it can't be undone.

**Q4. The version columns.**
- Options: (A) keep both columns and allow only 2, or (B) drop them, along with the catalogue's `version` key.
- **Decided (user): A.** It removes everything version 1 *does* without rewriting the intake machinery version 2 relies on, and it keeps a future version 3 to a new value. B would roughly double the change and touch every intake function.

**Q5. The canonical spec delta (`client-intake`).**
- **Decided (user):**
  - **Requirement 1, MODIFIED:** version 2 is the only accepted version. Keep the new-workspace, client and office scenarios, add "setting a workspace to version 1 is refused", and drop the one-off "an existing workspace is switched" scenario.
  - **Requirement 2, MODIFIED:** one scenario. Updating a version-2 application leaves it at 2, and a direct change of version is refused.
  - **Requirement 3, RENAMED** to "Sample cases are version 2", and **MODIFIED**: a reset seeds six version-2 samples. The rollback scenario goes.
- The guard and the cleanup are one-off migration behaviour. They go in design.md, not the spec.

**Q6. The tests.**
- **Decided (user):**
  1. The fixtures move to version 2 in one place. `createDatabaseFixture` and `createBrowserFixture` lose `intakeVersion`. Helpers such as `readyCase` and `assistedCase` create empty, then `SAVE_ANSWERS`, then `SUBMIT`, because version 2 refuses a create with answers (`VT007`). A small helper replaces direct `createCase(…, { answers })`.
  2. `makeSampleAnswers` becomes version-2 only.
  3. **No silent coverage loss:** every deleted test is classed as *version-1 only* (its behaviour is gone) or *general* (re-covered on version 2, with the replacement test named).
  4. The story loses its version-1 phase.
  5. The docs record the new test counts.

**Q7. How the migration's guard and cleanup get tested.**
- The user proposed moving the guard's check into a named function the suite can call, testing it with a version-1 row inserted inside `begin … rollback` with the constraint lifted.
- Refined: lifting the constraint is DDL. It takes an `ACCESS EXCLUSIVE` lock on `public.cases`, which the concurrent database suite reads and writes. 011's two triggers would also have to be bypassed.
- **Decided (user):**
  - pure predicates, `version_one_blocks(intake_version, fixture, in_test_workspace)` and `version_one_disposable(…)`, tested with plain values across the full truth table;
  - a count, `version_one_blockers()`, which the migration requires to be 0, and which the suite asserts is 0 after migrating;
  - the real migration run on this stack as the end-to-end check, with **counts captured before and after** (closing 020's post-state-only gap).

**Q8. Schema checks and the migration's order.**
- `vitally_private.test_workspaces` is created by `001_identity_and_cases.sql:41`, so it exists on every database and is empty on a real deployment. The guard can rely on it.
- Every foreign key to `public.cases` is `on delete cascade` (12 tables). A reset already deletes samples with `delete from public.cases where … and fixture` (009) and leaves `action_receipts` in place. So **the cleanup is one plain delete**, through the disposable predicate.
- **Order (user's, plus one step):**
  1. guard;
  2. cleanup;
  3. set any workspace still at 1 to 2 (a test workspace left by a crashed run, because the fixtures defaulted to 1 until now);
  4. redefine the functions without their version-1 branches, then drop the version-1-only ones;
  5. narrow both `CHECK`s to `= 2`.
- **Defaults (user's, agreed):**
  - The cleanup bumps `fixture_generation` for each workspace that lost rows, the same realtime signal a reset sends, so open windows re-read.
  - **No re-seeding inside the migration.** Samples come back as version 2 on the next "Reset sample cases".

**Q9. The app side and the line with #58.**
- **Decided (user): strict.** This change deletes only version-1 screens and their strings. Anything shared with version 2 stays for #58: the client fill tools and their messages, the version-2 Add a case fill, "Simulated intake checks", the footer and the sign-in notes.
- **#58 inventory rows this change deletes:**
  - the version-1 intake note ("This prototype covers selected intake questions…");
  - "This prototype accepts tax year 2025 only.";
  - "Fill fictional details" and "Fictional details filled in. Nothing is created or sent yet." on a case the office entered (the old office draft).
- The store keeps mapping `intakeVersion` and `defaultIntakeVersion`, because the columns stay. The app stops branching on them.

**Q10. `vitally_create_case`'s answers parameter.**
- Options: (A) keep the parameter, accept only `{}`, and drop the version-1 key list; or (B) drop the parameter, which changes the RPC's signature.
- **Decided (user): A.** It's the same contract. The store and the browser are unchanged, and only the signature test's sample call becomes `{}`.

**Q11. Saved window state (no decision needed).**
- `window-state.mjs` accepts only a version-2 sub-step id for `formStep`, so a saved version-1 step is ignored. *(Corrected at the planning recheck: `formStep` is version 1's own step-number field; version 2 uses `formSubstep`. So `formStep` is removed everywhere, and a saved one is dropped by window-state's `pick()`, which keeps only known fields. See design D8.)*
- A saved case id that the cleanup deleted comes back as not found, which `forgetGoneCase` handles.
- Both go in design.md, with tests.

**Q12. Process items (defaults, accepted at the readiness check).**
- The change name is `remove-intake-v1`, and the migration is `023_remove_intake_v1.sql` (022 is the highest).
- **Task order:**
  1. move the fixtures and test helpers to version 2 (the suites stay green on today's database);
  2. remove version 1 from the app, with the unit tests;
  3. the migration and its database tests;
  4. the story, the docs, CLAUDE.md's "Versions" rule and the counts.
- **Checks:** `npm test`, `npm run db:migrate:test` then `npm run test:database`, `npm run test:auth-browser`, `npm run test:browser`, and `npm run build:hant -- --check`. CI covers the unit, 繁體, catalogue, OpenSpec and CRLF checks on the PR.
- **#58:** list its removed rows in the proposal, and draft a comment for the user to post (publishing to GitHub is theirs).

## Refined while writing the planning artifacts (2026-10-12)

- **The spec delta's mechanics.** OpenSpec 1.14.0's validator refuses a MODIFIED block that drops a scenario, because a MODIFIED block replaces the whole requirement. So:
  - Requirement 1 stays MODIFIED, and keeps its "existing workspace is switched" scenario, restated: 023 sets any workspace still at 1 to 2.
  - Requirements 2 and 3 become REMOVED plus ADDED: "An application's intake version never changes" and "Sample cases are version 2". The intent agreed in Q5 is unchanged.
- **`fixture_history` is redefined too** (copied from 021). Version 1's `act_submit` wrote `"screening":"continue"` into the submit history's detail, and 021 still seeds that detail into every sample's submit history. Version 2's `act_submit` writes only `clientNumber`. Since samples are now always version 2, the seeded history drops `screening`, so a seeded sample and a played-through case read the same (021's own stated rule).

## Out of scope

- Anything shared with version 2 (#58's work).
- Version-2 scope screening.
- The conflict-box rule.
- Dropping the version columns.
- Re-seeding samples in the migration.
