## 1. Gate before apply

- [x] 1.1 Hailey reviews the planning artifacts and approves them. The PCDC questions and the group's wording review stay open and don't block apply (brainstorm, Open questions).
- [x] 1.2 Just before apply, check the migration list. 035 must be one after the newest migration; if anything took 035, renumber with no gap. Re-check each function's newest definition (design D14) and recopy any that moved.

## 2. Database: schema and Mark e-filed

- [x] 2.1 Write failing database tests (`tests/database-stages.mjs`, or a new `tests/database-filing.mjs` registered with `npm run test:database`):
  - the stage check accepts `rejected` and `accepted`;
  - the method constraints (three combinations; results only fit their method);
  - Mark e-filed's first-filing payload (three combinations accepted, the other one and a missing return refused with `VALIDATION`);
  - the history lines per method.
- [x] 2.2 New migration `035_post_efiling_stages.sql`:
  - the header lists every copied function, as 033 does;
  - the stage constraint;
  - `cases.federal_method`, `state_method`, `federal_result`, `state_result`, with their checks (D2);
  - `filing_attempts`, `filing_returns` and the append-only `filing_notes` (a trigger refuses update and delete) with 013's presenter-only select policy, not published (D2);
  - `act_mark_efiled` (from 032) recording methods, attempts and the history line (D3).
- [x] 2.3 `check_payload` copied from 034 with new branches for `MARK_EFILED`, `RECORD_FILING_RESULT` and `RETURN_TO_SIGNING`. Every other branch is verbatim.

## 3. Database: results, return to signing, close

- [x] 3.1 Write failing tests for `RECORD_FILING_RESULT`:
  - one return at a time;
  - any rejected → Rejected at once;
  - all accepted or mailed → Accepted;
  - a reject code required exactly when rejected, at most 40 characters;
  - the date window;
  - a fix note only when the case is at Rejected or the move takes it there, including with the second return's answer at Rejected; each note appended, never replaced;
  - a waiting return recordable at Rejected;
  - nothing leaves Accepted;
  - a pre-change E-filed case (null methods) is treated as both e-filed;
  - the per-return history lines;
  - admin-only.
- [x] 3.2 Implement `act_record_filing_result` (D4, D5).
- [x] 3.3 Write failing tests for `RETURN_TO_SIGNING` and the second filing:
  - refused while a return waits;
  - Rejected → Ready to exit, keeping methods and answers;
  - Mark ready to e-file accepted straight away;
  - the second Mark e-filed takes only the rejected returns, may change the PA-40 to paper, refuses an accepted return, and keeps the accepted one.

  Then implement `act_return_to_signing` (D6), and the second-filing branch of `act_mark_efiled` (D3).
- [x] 3.4 `act_close_case` (from 032): allow `rejected`, refuse `accepted` (D7). `check_operation_authority` (from 032): the two new actions are admin-only. `vitally_apply_action` (from 032): two dispatch lines. Tests: Close from Rejected; Close refused at Accepted; volunteers refused for both new actions.
- [x] 3.5 Privacy tests: a client session reads its case's method and result columns, but no row of `filing_attempts`, `filing_returns` or `filing_notes`; no realtime change carries them; no stored event message contains a reject code or a fix note; an update or delete of a `filing_notes` row is refused, by the service role too.

## 4. Database: samples

- [x] 4.1 `fixture_keys` (from 009) gains `rejected` and `accepted`. `apply_fixture_scenario` (from 033) and `fixture_history` (from 034) build them (D13). Each has a fictional client and intake answers, following the newest sample pattern. `rejected`: federal accepted, state rejected, with a fictional code and fix note. `accepted`: both e-filed and both accepted.
- [x] 4.2 Fixture tests for both samples, and update tests that count samples. Update `tests/support/database-fixture.mjs` where needed. Run `npm run db:migrate:test`, then `npm run test:database`.

## 5. Browser: contracts, domain, builders

- [x] 5.1 `src/contracts.mjs`: the new stages in `STAGES`, `RECORD_FILING_RESULT` and `RETURN_TO_SIGNING` in `CASE_ACTIONS`, and notes. Tests first.
- [x] 5.2 `src/domain.mjs`: the stage table and `describeStage(stage, lang, record)` with the per-method staff names and client labels, and the pre-change fallback (D8). Tests in `tests/domain.test.mjs`.
- [x] 5.3 `src/case-actions.mjs`: builders for the `MARK_EFILED` methods (first and second filing), `RECORD_FILING_RESULT` (results, dates, codes, fix note) and `RETURN_TO_SIGNING`, with staff-English refusals. Tests in `tests/case-actions.test.mjs` first.
- [x] 5.4 `src/supabase-store.mjs`: load `filing_attempts`, `filing_returns` and `filing_notes` with `relatedRows` for staff, and the four `cases` columns for everyone. Tests in the store suite.

## 6. Browser: staff screens

- [x] 6.1 `src/admin-views.mjs`, the office actions panel and its dialogs (D12):
  - Mark e-filed… with the three choices, or the outstanding returns;
  - Record filing result…;
  - Return to signing… ("The fix is done.") or its waiting explanation;
  - Mark ready to e-file's second-signing sentence;
  - Close at Rejected.

  Update `tests/fixtures/confirm-dialogs.json` and `tests/admin-views.test.mjs`.
- [x] 6.2 `src/staff-views.mjs`:
  - `LIFECYCLE` with Accepted and the Rejected mark, labels from the record;
  - the Filing panel (each filing's notes in order, escaped, with who and when);
  - `stageWork` texts;
  - `EVENT_SENTENCES` for the two new actions.

  Tests in `tests/staff-views.test.mjs`.
- [x] 6.3 `src/pool-views.mjs`: `poolPhase` and `POOL_TABS` (Needs attention, Done). `src/office-views.mjs`: the `result` and `rejected` kinds, the row texts, the latest fix note, the Signing row after Return to signing, and the colouring rule (D11). Tests in `tests/office-views.test.mjs` and the pool tests.
- [x] 6.4 `src/app.mjs` and `src/views.mjs`: wire the new actions, dialogs and toasts. Update `tests/shell.test.mjs` as needed.

## 7. Browser: the client

- [x] 7.1 `src/client-text.mjs`:
  - the per-return sentences, the closing sentences, the re-sign message and the new labels, in English and 简体 (宾州; the PCDC / 我们 mix left as it is);
  - every new history line in `SENTENCES` (D10).

  Run `npm run build:hant` and commit `src/zh-hant.mjs`.
- [x] 7.2 `src/client-views.mjs`: compose the status message (D9), the re-sign message at Ready to exit after Return to signing, the stepper's Rejected placement and complete state, and `REVIEW_STAGES`. Tests in `tests/client-views.test.mjs`, including a check that no reject code or fix note is rendered.
- [x] 7.3 Translation tests (`tests/client-language.test.mjs`): enumerate every history line the SQL can produce and check each has a 简体 entry, and that no new message or line contains a phone number.

## 8. The story

- [x] 8.1 `tests/browser.mjs`: continue the class's case through brainstorm Q11's six steps. Check:
  - the pool's Filing, Needs attention, Waiting on client and Done tabs;
  - the Follow-ups rows (Filing result, Rejected with the fix note, the Signing row's "sign again");
  - the case page's Filing panel and lifecycle bar;
  - the client's messages at one-accepted-one-rejected, re-sign and Complete, one of them in 简体.
- [x] 8.2 Run `npm run test:browser`.

## 9. Docs

- [x] 9.1 `docs/media/return-lifecycle.svg`: relabel to match what is built. Keep the amendment boxes, marked as not built yet.
- [x] 9.2 `docs/demo-script.md`'s "What is simulated, and what is real" table, `docs/developer/database.md`, `docs/developer/frontend.md` (the stages and client labels, which change 1 updated), `docs/developer/production-roadmap.md` §4 (the IRS's answer is built; amendments and reassignment are not), and `docs/setup.md` if the sample list is named there.

## 10. Checks

- [ ] 10.1 `npm test`, `npm run build:hant -- --check`, `npx openspec validate --all`, `npm run db:migrate:test` + `npm run test:database`, `npm run test:browser`. Record the counts against the baseline (unit 1235, database 326, story 63).
