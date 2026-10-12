## Context

- **Where things stand.** Version 2 has been every workspace's default since migration 020 (#59), and the canonical spec `client-intake` describes how it works. Version 1 is still built in everywhere:
  - **client:** the old form and its screening;
  - **office:** the old Add a case, and the old office draft on Overview;
  - **staff:** the version-1 answers panel;
  - **controller and app:** about 40 version branches;
  - **database:** its key list, version-1 action branches, samples, and `CHECK`s allowing 1;
  - **tests:** most database tests run on version-1 data.
- **No real version-1 data exists.** There is no hosted project, and the November PCDC delivery (#58) will be a new deployment. On this machine's test stack (read on 2026-10-12, at migration 022):
  - test workspaces hold 6 version-1 samples and 6 other version-1 cases;
  - the local rehearsal workspace holds 6 version-1 samples, 4 rehearsal version-1 applications and 1 version-2 application.
- **Schema facts the migration relies on:**
  - `vitally_private.test_workspaces` (001) exists on every database.
  - All 12 foreign keys to `public.cases` cascade on delete.
  - A reset deletes samples with one `delete … where fixture` and leaves `action_receipts` in place (009).
  - Version 1 has no rows in `intake_fields` or `intake_substeps`.
- **Stakeholders:** clients and office staff (one form); the group (#58's demo framing); developers with local stacks (the guard).
- **History:** the 2026-09-30 intake-screens design (§1, §5) planned this removal "once no version-1 case is open (checked in the database first)".

## Goals / Non-Goals

**Goals:**
- Version 2 is the only accepted intake version in the database. The constraints, triggers and functions refuse or never produce version 1.
- No version-1 screen, branch, sample, key list or text is left in `src/` or the database's live functions.
- Removing it never destroys a real application: the migration refuses instead.
- The test suites run entirely on version 2, with no silent loss of general coverage.
- The `client-intake` spec says version 2 is the only version, and the rollback is gone.

**Non-Goals:**
- Dropping the `intake_version` or `default_intake_version` columns, or the catalogue's `version` key.
- Anything #58 owns: strings and tools version 2 shares (the fill tools, "Simulated intake checks", the footer, the sign-in notes).
- Version-2 scope screening; the conflict-box rule.
- Re-seeding samples inside the migration.
- Editing applied migrations 001–022.

## Decisions

### D1: One full removal, columns kept
- **Choice:** one change removes version 1 from the app and the database. Both version columns stay, narrowed to `CHECK (… = 2)`.
- **Rationale:**
  - Removing only the screens would leave SQL able to create cases no screen shows.
  - Keeping the columns avoids rewriting every intake function, which read `version`, and keeps a future version 3 to a new value.
- **Alternatives considered:**
  - Screens first and the database later: two medium changes, with an inconsistent state in between.
  - Dropping the columns: about twice the size, touching every intake function.

### D2: Guard and cleanup built from testable predicates
- **Choice:** two pure, immutable SQL functions, revoked from `public`, `anon`, `authenticated` and `service_role`:
  - `vitally_private.version_one_blocks(p_intake_version smallint, p_fixture boolean, p_in_test_workspace boolean) returns boolean`. True when the case is version 1, **not** a sample and **not** in a test workspace.
  - `vitally_private.version_one_disposable(p_intake_version smallint, p_fixture boolean, p_in_test_workspace boolean) returns boolean`. True when the case is version 1 and either a sample or in a test workspace.

  And one count, `vitally_private.version_one_blockers() returns bigint`, which counts `public.cases` rows where `version_one_blocks(intake_version, fixture, exists(test_workspaces row))`. The migration raises if it isn't 0.
- **Rationale:**
  - The migration runs once, so the suite can't watch it refuse.
  - Testing the rule as plain values (the full 2×2×2 truth table) needs no impossible row and no DDL.
  - The count is asserted to be 0 on the migrated database.
- **Alternatives considered:** inserting a version-1 row inside `begin … rollback` with the `CHECK` and triggers lifted. Rejected: `drop constraint` takes `ACCESS EXCLUSIVE` on `public.cases`, which the concurrent database suite uses, and 011's two triggers would also have to be bypassed.

### D3: The migration's order (`023_remove_intake_v1.sql`)
1. **Guard:**

   ```sql
   do $$ begin
     if vitally_private.version_one_blockers() > 0 then
       raise exception 'version-1 applications outside test workspaces: %', … ;
     end if;
   end $$;
   ```

   The message names the count per workspace, and nothing has changed yet.
2. **Cleanup** (one statement):

   ```sql
   with gone as (
     delete from public.cases c
      where vitally_private.version_one_disposable(c.intake_version, c.fixture,
              exists (select 1 from vitally_private.test_workspaces t where t.workspace_id = c.workspace_id))
      returning c.workspace_id)
   update public.workspaces set fixture_generation = fixture_generation + 1
    where id in (select workspace_id from gone);
   ```

   Children cascade, and `action_receipts` stays, as with a reset. The generation bump is the same realtime signal a reset sends.
3. `update public.workspaces set default_intake_version = 2 where default_intake_version <> 2;`. This catches a test workspace left by a crashed run, because the fixtures default to 1 until this change.
4. **Redefine and drop** (D4).
5. **Narrow:** drop and re-add `workspaces_default_intake_version_range` as `CHECK (default_intake_version = 2)`, and `cases_intake_version_range` as `CHECK (intake_version = 2)`. This validates every remaining row. Also set `cases.intake_version`'s column default from 011's `1` to `2`. The insert trigger always overrides it, but it's the last version-1 value in the schema.
- The predicates and the count are defined first, before step 1, so the guard can call them. The whole file is one transaction (the migrator wraps it), so a raise leaves nothing changed.
- **Rationale:**
  - The guard runs before anything is changed.
  - The cleanup comes before the narrowing, which would fail on version-1 rows.
  - The redefinitions come before the drops, which would fail while a function still calls `intake_answer_keys()` or `fixture_answers()`.

### D4: Function inventory
Each function is copied verbatim from its latest definition, with only the version-1 path removed. The header comment names each source migration.

| Function | Latest | What goes |
|---|---|---|
| `public.vitally_create_case` | 001 | The version-1 key-list check at line 221. It now raises `VT007` unless `p_answers = '{}'::jsonb`. The signature, grants and digest are unchanged (D6). Its source says plain `create function`, so 023's copy must say `create or replace function` |
| `vitally_private.cases_intake_version_insert` (trigger fn) | 011 | `coalesce(v_version, 1)` becomes the workspace's version. The `= 2 and answers <> '{}'` check becomes `answers <> '{}'` |
| `vitally_private.check_related` | 017 | The `SAVE_ANSWERS` `elsif` that checks `intake_answer_keys()`, and the `intake_version<>2 or` arms in `visited` and the card actions |
| `vitally_private.act_save_answers` | 017 | The `if intake_version = 2 … else <merge> end if` is unwrapped to the version-2 body. The version-1 `else` merge goes |
| `vitally_private.act_submit` | 011 | The version-1 path after the version-2 `return`: required keys, year, residence and helper checks, screening, and the `screening:'continue'` detail |
| `vitally_private.act_update_contact` | 013 | The `if p_case.intake_version<>2 then raise` guard |
| `vitally_private.seed_fixtures` | 019 | The version-1 branch (`fixture_answers(v_key)` and the `v_version=2` test); only the version-2 path stays |
| `vitally_private.fixture_history` | 021 | The `"screening":"continue"` key in the sample `SUBMIT` details (six rows, one per scenario), so a seeded sample's history matches a played-through version-2 case |
| `vitally_private.intake_answer_keys()` | 003 | **Dropped** after the above |
| `vitally_private.fixture_answers(text)` | 009 | **Dropped** after the above |

`cases_intake_version_fixed` (011) stays unchanged: it enforces "An application's intake version never changes".

### D5: The app
- **Removed:**
  - **client:** `intakeScreen`/`intakeBody` (the old form), the `v1-english` wrapper and the `v1.english_only` text;
  - **`domain.mjs`:** `INTAKE_ANSWER_KEYS`, `REQUIRED_ANSWER_KEYS`, `screening`, `missingAnswers`, `submissionBlocker`;
  - **office:** `renderAddCase` (the old Add a case) and `assistedAnswersPanel` (the old office draft on Overview, with its fill tool and the "tax year 2025 only" blocker);
  - **staff:** `answersPanelV1`;
  - **controller and app:** every version branch, `pickAnswers`' version-1 path, and the "This workspace now takes version-1 applications…" notice with its `SENTENCES` entry;
  - **`sample-data.mjs`:** the version-1 templates.
- **Kept:**
  - `intakeChecksPanel`, which both versions used;
  - the store mapping of `intakeVersion` and `defaultIntakeVersion`, because the columns stay, with `?? 1` dropped;
  - every string version 2 uses (#58's).
- **Client text:** removing keys changes the 简体 source, so `npm run build:hant` regenerates `src/zh-hant.mjs`.
- **Also removed:**
  - `formStep` (D8);
  - the store's `?? 1` fallbacks on **both** `intake_version` and `default_intake_version`;
  - `contracts.mjs`'s `intakeVersion: 1 | 2` comment, which becomes `2`;
  - the `.v1-note`/`.v1-english` rules in `src/styles.css`;
  - the version-1-only staff refusals ("A version-1 case has no contact card." and "… no document checklist.");
  - `admin-views.mjs`'s "Some screening answers still need checking…".
- **Acceptance grep:** with `docs/superpowers/` excluded, `src/` has no `answersPanelV1`, `intakeBody`, `INTAKE_ANSWER_KEYS`, `screening(`, `renderAddCase(` (the version-1 one), `v1.english_only`, or version comparisons (`intakeVersion) === 1`, `!== 2`, `=== 2` branches). The store's field mapping is allowed.

### D6: `vitally_create_case` keeps its answers parameter
- **Choice:** keep `p_answers`, and require `{}`.
- **Rationale:** the RPC's signature, grants and receipt digest are unchanged, so neither the store nor the browser changes. Only `tests/support/rpc-signatures.mjs`'s sample call becomes `{}`.
- **Alternative considered:** dropping the parameter, which changes the RPC's signature, the store and the grants.

### D7: Tests
- **The fixtures move in one place:**
  - `createDatabaseFixture` and `createBrowserFixture` lose `intakeVersion`, so every workspace is version 2;
  - `f.readyCase`, `f.assistedCase` and the other helpers create empty, then `SAVE_ANSWERS` with version-2 answers, then `SUBMIT`;
  - a helper replaces direct `createCase(…, { answers })` calls.
- **`makeSampleAnswers`** becomes version-2 only.
- **Rule 3, no silent coverage loss:** every deleted or rewritten test is listed in the task's report as **version-1 only** (its behaviour is gone) or **general** (re-covered on version 2, with the replacement test named). Reviewers check the list.
- **Database tests for D2:**
  - the predicates' truth table;
  - `version_one_blockers() = 0`;
  - both `CHECK`s refuse 1;
  - the direct version change is refused;
  - `vitally_create_case` refuses non-empty answers;
  - a reset seeds six version-2 samples;
  - `intake_answer_keys` and `fixture_answers` no longer exist.
- **The story** loses its version-1 phase ("a version-1 draft still finishes in the old form"), along with version-1 comments and assertions elsewhere.

### D8: Saved window state and gone cases
- **Version 1's place in the form is `formStep`,** a step number. It's a field in its own right:
  - window-state's `FIELDS.formStep` (`asStep`);
  - the controller's `state.formStep` and `setFormStep`;
  - `app.mjs`'s version-1 Back and Next handlers, and its render-key fallback.

  Version 2 uses `formSubstep`. All of `formStep` is removed.
- **A browser's saved `formStep`** is then simply ignored. `pick()` restores only the fields in `FIELDS`, and older records "contribute whatever still makes sense and nothing else".
- **A saved case id the cleanup deleted** reads as `NOT_FOUND`, and `forgetGoneCase` clears it.
- Both are pinned with unit tests. The first one is new: write `{ formStep: 2 }`, read it back, and there's no `formStep`.

### D9: The real run captures counts before and after
On this stack, `select intake_version, fixture, in_test_workspace, count(*)` from `public.cases`, plus the workspace count, is recorded **before** 023 runs (after the rehearsal workspace is deleted) and **after**. This closes 020's post-state-only gap. The guard's real refusal path is exercised only by the predicate tests (D2).

## Risks / Trade-offs

- **[Risk]** The guard stops 023 on a developer stack that holds non-sample version-1 applications outside test workspaces.
  - **Mitigation:** the raise names the counts. `docs/setup.md` documents clearing a rehearsal workspace or recreating the stack. On this machine the rehearsal workspace is deleted at apply, with the user's confirmation.
- **[Risk]** 023 is irreversible. It deletes version-1 samples and test cases, and narrows the constraints.
  - **Mitigation:** only test and sample data can be deleted (the guard), and real deployments have no version-1 data. Undoing it means restoring a backup taken before 023, as the REMOVED requirement's Migration note says.
- **[Risk]** A redefinition copied from the wrong source silently reverts a later change, as 021 almost did with `fixture_history`.
  - **Mitigation:** D4 names each latest source. The task requires a diff of each new definition against its source showing only the version-1 lines removed. The reviewer checks it.
- **[Risk]** A general test disappears with its version-1 data.
  - **Mitigation:** D7's rule 3 table, checked in review.
- **[Risk]** Concurrent sessions. An open window showing a version-1 sample loses it after 023.
  - **Mitigation:** the `fixture_generation` bump makes open windows re-read, and the case reads as gone (D8).
- **[Risk]** The test stack is shared by the change's worktree and the main checkout. Once 023 is applied (Task 3), `main`'s own database suite fails on this stack until the PR merges, because `main`'s fixtures still set workspaces to version 1 and the narrowed `CHECK` refuses that. If the change were abandoned, the stack would have to be recreated, because 023 can't be un-applied.
  - **Mitigation:** apply 023 only when Task 3 reaches its controller step, run nothing from `main` against this stack until the PR merges, and say so in the PR. A teammate's own stack only meets 023 after they pull the merged `main`.
- **[Trade-off]** After 023, workspaces whose samples were deleted have no samples until someone presses "Reset sample cases".
  - **Accepted:** seeding is a presenter action, and a real deployment starts with none.
- **[Trade-off]** The `"screening":"continue"` detail stays in history rows already stored. Only newly seeded histories change.
  - **Accepted:** stored history is never rewritten.

## Migration Plan

1. On the change branch, move the fixtures and helpers to version 2 (Task 1). The suites stay green on the database at 022.
2. Remove version 1 from the app, with the unit tests (Task 2).
3. Write `023_remove_intake_v1.sql` and its database tests (Task 3). Then, **with the user's confirmation at that moment:**
   - delete the local rehearsal workspace;
   - record the counts before;
   - run `npm run db:migrate:test`;
   - record the counts after;
   - run the database suite.
4. Remove the story's version-1 phase, update the docs, CLAUDE.md's "Versions" rule and the counts, and run every suite (Task 4).

- **Rollback:** none in place. Restore a backup taken before 023. On a test stack, recreate it.
- **Deploy:** a new PCDC deployment runs 001–023 in order. It has no version-1 data, so the guard passes and the cleanup deletes nothing.

## Open Questions

- **None blocking.**
- **#58's inventory:** a comment listing the rows this change deletes will be drafted for the user to post. Posting is theirs.
- **The rehearsal workspace deletion (checked during planning).**
  - All 19 foreign keys to `public.workspaces` cascade: memberships, people, cases and all their children, `action_receipts`, the client-number counters and the fixture bindings. The test fixture already removes its workspaces this way.
  - So the deletion is one statement, `delete from public.workspaces where id = '<id>'`. The id is the single workspace with no `vitally_private.test_workspaces` row, which the plan checks is exactly one. Run only after the user confirms.
  - `auth.users` rows stay. The rehearsal sign-ins simply have no workspace until one is set up again (`docs/setup.md`, "Signing in locally").
