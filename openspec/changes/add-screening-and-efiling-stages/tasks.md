## 1. The database: migration 032 (design D1, D2, D3; plan Task 1)

- [x] 1.1 Write `supabase/migrations/032_screening_and_efiling_stages.sql`:
  - **The `CHECK`:** `cases_stage_check` replaced with the twelve stages.
  - **`check_operation_authority`** (copied verbatim from 018): `START_SCREENING`, `MARK_READY_TO_EFILE` and `MARK_EFILED` join its admin-only group.
  - **`check_payload`** (copied verbatim from 017): `START_SCREENING` takes an empty payload, and both `MARK_*` take exactly `{"confirmed": true}`.
  - **New handlers:** `act_start_screening`, `act_mark_ready_to_efile` (which also waits for the approved review's call with the client to be `completed`, brainstorm Q12), `act_mark_efiled`, with their history lines.
  - **Changed handlers:** `act_verify_intake` from `screening` only; `act_submit` sends an office case (no owner) to `screening`, with the start-screening line; `act_close_case` adds `screening`.
  - **`vitally_apply_action`** (copied verbatim from 017) gains the three `when` branches.
  - **Grants** re-applied as in 017.
  - **No `begin;` or `commit;`** in the file: the migrator wraps every file in its own transaction.

  The controller dry-runs it in `begin … rollback` and applies 031 and 032 after the user's OK.
- [x] 1.2 Database tests:
  - **Existing tests:** the builders in `tests/support/database-fixture.mjs` and every site that goes from `SUBMIT` to `VERIFY_INTAKE` gain `START_SCREENING`; history-action lists gain it.
  - **New tests:**
    - each new action's success;
    - every refusal in check order (the admin gate, the payload, the stage);
    - "a rejected action commits nothing";
    - an office submit landing in `screening` with a client number;
    - `VERIFY_INTAKE` refused at `received`;
    - `CLOSE_CASE` from `screening`, and refused from `ready_to_efile` and `efiled`;
    - `MARK_*` without `confirmed` refused;
    - `MARK_READY_TO_EFILE` refused while the reviewer's call is pending, then allowed once it is recorded;
    - the office-submit assertions that expected `received`, and the hard-coded revisions after a client builder, updated.

  The controller runs `npm run test:database`.

## 2. Stages, labels and text (design D1, D7; plan Task 2)

- [x] 2.1 Tests first:
  - `STAGES` and `CASE_ACTIONS` gain the new values (`tests/domain.test.mjs`, `tests/case-actions.test.mjs`);
  - `describeStage` returns `label` (staff, English), `clientLabel` and `clientMessage` for every stage, in English and 简体;
  - `stageBadge(stage, lang, { audience: "client" })` shows the client label;
  - `STAGE_TONES` covers the new stages;
  - `SENTENCES` translates the three new history lines;
  - no new client text names a phone number.

  See them fail.
- [x] 2.2 Implement in `src/contracts.mjs`, `src/domain.mjs`, `src/ui.mjs`, `src/case-actions.mjs` (the three payload builders), `src/client-text.mjs` and the three client badges in `src/client-views.mjs` (`audience: "client"`), with exactly the brainstorm Q10/Q11 text. Run `npm run build:hant`. `npm test` passes.

## 3. Screening starts on an admin's open (design D4; plan Task 3)

- [x] 3.1 Tests first (`tests/controller.test.mjs`):
  - an admin persona opening a `received` case's page sends `START_SCREENING` once (the envelope, with the persona);
  - a reload on that page (a restored session, through `load()`) sends it;
  - selecting the case in place from a list (`navigate: false`) sends nothing;
  - a volunteer persona sends nothing;
  - switching to an admin persona while the case is open sends it;
  - a refusal (`INVALID_TRANSITION`, `CONFLICT`, revision) records no error, sets no `retryable` and re-reads the case;
  - offline records nothing, and a later `refresh` or the connection's return sends the same action again, unchanged;
  - any other refusal is given up on for that case, with no retry on every refresh;
  - a case not at `received` sends nothing;
  - `busy` stays false.

  See them fail.
- [x] 3.2 Implement `startScreeningIfDue()` in `src/controller.mjs`, called after `selectCase`, `load()`, `selectPerson` and `refresh`, only on the staff case page and only when no action of the admin's own is in flight. `npm test` passes.

## 4. The case pages and the confirmations (design D5; plan Task 4)

- [ ] 4.1 Tests first:
  - **`adminEligibility`:** `verifyIntake` at `screening` only, plus `markReadyToEfile` (which also waits for the reviewer's recorded call) and `markEfiled`;
  - **`CLOSABLE_STAGES`** includes `screening`;
  - **the admin page:** the intake-check form shows at `screening` only, with the Request sent sentence, and the office panel shows the Mark buttons at their stages;
  - **the two dialogs** (`markReadyToEfileDialogBody`, `markEfiledDialogBody`): they name the client and the application ID, fall back to "this client", and keeping it as it is sends nothing; both join `tests/confirm-dialogs.test.mjs`' render map and `tests/fixtures/confirm-dialogs.json` (by hand);
  - **a volunteer's case page** offers neither mark;
  - **the volunteer page:** `LIFECYCLE` and `lifecycleBar` for the new stages, the `STAGE_WORK` sentences, and the `EVENT_SENTENCES` for the three actions;
  - **app.mjs pins:** the `open-mark-…` handlers, `closeDialog` after the receipt, and `STAFF_NOTICES`.

  See them fail.
- [ ] 4.2 Implement in `src/admin-views.mjs`, `src/staff-views.mjs`, `src/views.mjs` (`dialog()` branches), `src/app.mjs` and `src/styles.css` if needed. `npm test` passes.

## 5. The lists (design D6; plan Task 5)

- [ ] 5.1 Tests first:
  - **the case list:** a presenter row's `reviewContactStatus` (the latest approved review's call status), in `tests/store.test.mjs` and the database store test;
  - **Follow-ups**, from list-shaped rows: the Request sent and Screening in progress rows (with Open), and the signing and e-filing rows (with the Mark buttons carrying `data-case-id`, or the call-pending sentence); the new kinds' icons and pill styles;
  - **the case pool:** the new tabs and `poolPhase` for every stage, with the stage filter listing all twelve;
  - **the work board:** unchanged tabs, and its search reaches a case at `efiled`.

  See them fail.
- [ ] 5.2 Implement in `src/supabase-store.mjs` (`listCases`' new summary) and `src/contracts.mjs` (its comment), `src/office-views.mjs`, `src/styles.css` (the new pills), `src/pool-views.mjs`, `src/staff-views.mjs` (if any) and `src/app.mjs` (the queue's Mark buttons select the case in place, as Log contact does). `npm test` passes.

## 6. The client's page (design D7; plan Task 6)

- [ ] 6.1 Tests first:
  - the five-step stepper (the step keys and their stages, done/current/waiting at Ready to exit, the closed notice);
  - `REVIEW_STAGES` including `ready_to_efile` and `efiled`;
  - the applications list, banner and status panel using the client label, in English and 简体;
  - the new history lines in 简体, with an older line keeping its translation.

  See them fail.
- [ ] 6.2 Implement in `src/client-views.mjs` (`PROGRESS_STEPS`, `REVIEW_STAGES`, no track for a closed case) and `src/client-text.mjs` (`progress.step.signing`, `progress.step.filing`; `progress.step.next` removed if unused). Run `npm run build:hant`. `npm test` passes.

## 7. The diagram and the docs (design D7, D8; plan Task 7)

- [ ] 7.1 `docs/media/return-lifecycle.svg`: a "Screening in progress" box between Request sent and Pending intake / filing (the arrow "Opened by an admin"), plus "Filing in progress (preparing)" and "Review in progress". The controller renders it to check.
- [ ] 7.2 `docs/developer/database.md` (the state diagram, the action catalogue, the recipe's current migration numbers, the migration table) , `docs/setup.md` (the migration table) and `docs/developer/frontend.md` (stages, client labels, the start on open). The unit count where the docs give it.

## 8. The story and the checks (design D8; plan Task 8)

- [ ] 8.1 `tests/browser.mjs`:
  - **The client case:** Sam's open moves it to Screening in progress, and the client sees "Being reviewed" and the history line.
  - **The office case:** at `screening` right after Submit; the pool's Intake tab still shows it.
  - **A second admin window** opening a screening case shows no error.
  - **A new step:** an approved case is marked ready to e-file (from Follow-ups) and e-filed (from the case page), through both dialogs. The client's stepper and history follow, in English and 简体.
  - Existing badge texts and stage assertions follow the new names.
- [ ] 8.2 Checks:
  - `npm test`;
  - `npm run build:hant -- --check`;
  - `npm run build:intake` (nothing to commit);
  - `npx openspec validate --all`;
  - `npm run db:migrate:test`, `npm run test:database` and `npm run test:browser`, run by the controller.
