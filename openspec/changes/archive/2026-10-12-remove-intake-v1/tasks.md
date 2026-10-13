## 1. Tests and fixtures move to version 2 (the database is still at 022)

- [x] 1.1 `tests/support/database-fixture.mjs` and `tests/support/browser-fixture.mjs`:
  - drop the `intakeVersion` option, so every fixture workspace is version 2;
  - make `readyCase`, `assistedCase` and every other helper create empty, then `SAVE_ANSWERS` with version-2 answers, then `SUBMIT`;
  - add a helper that replaces direct `createCase(…, { answers })` calls.
- [x] 1.2 The tests build version-2 data with `makeSampleAnswers({ version: 2 })` (`src/sample-data.mjs` is unchanged until Task 2, because the app's version-1 fill still uses it). `tests/support/rpc-signatures.mjs` creates with `{}`.
- [x] 1.3 Move every database test that used version-1 data for a general flow onto version 2 (client numbers, assistance, realtime, actions, store, review, intake). Delete the tests *of* version 1. List each deleted or rewritten test as **version-1 only** or **general → replacement test**.
- [x] 1.4 Run `npm test` and `npm run test:database` on the stack at 022. Both pass.

## 2. Version 1 leaves the app

- [x] 2.1 Client:
  - remove the old form (`intakeScreen`/`intakeBody`), the `v1-english` wrapper and the `v1.english_only` text;
  - remove `domain.mjs`'s `INTAKE_ANSWER_KEYS`, `REQUIRED_ANSWER_KEYS`, `screening`, `missingAnswers` and `submissionBlocker`;
  - remove the client views' version branches.
- [x] 2.2 Office and staff: remove `renderAddCase` (the version-1 Add a case), `assistedAnswersPanel` (the old office draft on Overview), `answersPanelV1`, and the version branches in `office-views`, `admin-views`, `staff-views` and `views`.
- [x] 2.3 Controller, app and store:
  - remove every version branch, `pickAnswers`' version-1 path, and the "This workspace now takes version-1 applications…" notice (and its `SENTENCES` entry);
  - remove `formStep` (the version-1 form's step number) from the controller, the app and `window-state.mjs`;
  - drop the store's `?? 1` fallbacks on both `intake_version` and `default_intake_version`, keeping the `intakeVersion`/`defaultIntakeVersion` mapping;
  - also remove the version-1-only staff refusals, the `.v1-*` CSS rules and `contracts.mjs`'s `1 | 2` comment.
- [x] 2.4 `src/sample-data.mjs` becomes version-2 only (no `version` parameter, no version-1 templates), and the redundant `{ version: 2 }` arguments go. Then run `npm run build:hant` and commit `src/zh-hant.mjs`.
- [x] 2.5 Unit tests:
  - delete the tests of version-1 screens and logic, and move general ones to version 2, with the same classification list as 1.3;
  - pin that a saved version-1 `formStep` is not restored, and that a deleted case id is forgotten (design D8);
  - run the acceptance grep (design D5).
- [x] 2.6 Run `npm test` and `npm run build:hant -- --check`.

## 3. Migration 023 and its database tests

- [x] 3.1 Database tests first:
  - the truth tables of `version_one_blocks` and `version_one_disposable`;
  - `version_one_blockers()` is 0;
  - both `CHECK`s refuse 1, and neither version column defaults to 1;
  - a direct version change is refused;
  - `vitally_create_case` refuses non-empty answers;
  - a reset seeds six version-2 samples, whose submit histories carry no `screening` detail;
  - `intake_answer_keys` and `fixture_answers` no longer exist.

  See them fail against the stack at 022.
- [x] 3.2 Write `supabase/migrations/023_remove_intake_v1.sql`:
  - the predicates and the count;
  - the guard;
  - the cleanup, with its `fixture_generation` bump;
  - every workspace set to 2;
  - the D4 redefinitions, each copied from its latest source with only version-1 lines removed;
  - the drops;
  - the narrowed `CHECK`s, and `cases.intake_version`'s column default set from 1 to 2.
- [x] 3.3 With the user's confirmation at that moment:
  - delete the local rehearsal workspace (the one workspace with no `test_workspaces` row);
  - preview the guard as plain SQL (it must be 0);
  - record the counts before;
  - run `npm run db:migrate:test`;
  - record the counts after.
- [x] 3.4 Run `npm run test:database` and `npm test`.

## 4. The story, the docs and the final runs

- [x] 4.1 `tests/browser.mjs`: remove the version-1 phase ("a version-1 draft still finishes in the old form") and the other version-1 comments and assertions.
- [x] 4.2 Docs:
  - `docs/setup.md` (023's row, 23 migrations, clearing a stack the guard stops, the counts);
  - `docs/developer/{README,architecture,database,frontend,production-roadmap}.md`;
  - `README.md`;
  - `docs/design/*` lines that describe version 1 as current;
  - CLAUDE.md's "Versions" rule.
- [x] 4.3 Final runs:
  - `npm test`;
  - `npm run test:database`;
  - `npm run test:auth-browser`;
  - `npm run test:browser`;
  - `npm run build:hant -- --check`.

  Record the counts in the docs.
