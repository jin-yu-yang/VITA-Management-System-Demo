## 1. Gate before apply

- [x] 1.1 Hailey reviews and approves the planning artifacts. The group's wording review of the new client text stays open and doesn't block apply.
- [x] 1.2 Just before apply, check the migration list:
  - 037 must be one after the newest migration; renumber if it's taken.
  - Re-check each copied function's newest definition (design D12).
  - Merge `main` (which now has #96) so the base is current.

## 2. Database: the paper handover and the four pairs

- [x] 2.1 In `tests/database-filing.mjs`, replace the "paper is mailed" group with failing tests:
  - Mark e-filed records each paper return as `given_to_client`, with null `answered_on` and `recorded_by` the filer;
  - both paper goes from Ready to e-file straight to Accepted;
  - federal e-file with state paper waits at E-filed for the IRS only;
  - federal paper with state e-file is accepted and waits for Pennsylvania;
  - a payload missing a return is refused with `VALIDATION`;
  - a second filing re-filing the rejected return on paper lands at Accepted when the other return is answered, and names only the rejected returns;
  - Record filing result refuses `mailed`, `given_to_client` and any paper return with `VALIDATION`;
  - Mark e-filed writes exactly one client line, even when it lands at Accepted.
- [x] 2.2 Add failing tests for the client lines:
  - `filing_line` with `'given_to_client'` for each return and both;
  - `efiled_line` for all four pairs and the four second-filing lines, each with the handover instruction and "about 3 months" once;
  - Mark ready to e-file's new line.
- [x] 2.3 Write `supabase/migrations/037_adjust_filing_to_pcdc.sql`, sections 1–3. Its header table lists every copied function and its source, and states design D3: nothing is hosted, cases filed under 035 with a paper return still waiting are left as they are, and a sample reset clears them.
  1. The rename of stored `mailed` to `given_to_client` in `cases.federal_result`, `cases.state_result` and `filing_returns.result`, with `answered_on` set to null on those rows. Then drop and re-add `cases_filing_methods` (without the unused-pair clause), `cases_filing_results` and the `filing_returns.result` check.
  2. `filing_line` and `efiled_line` (from 035), with the new sentences (D6, D7).
  3. `act_mark_efiled` (from 035): no pair refusal and no used-pair check, the paper result at filing, and the stage computed as Record filing result computes it (D1, D4).
- [x] 2.4 037, sections 4–6:
  4. `check_payload` (from 036): `RECORD_FILING_RESULT` results limited to `accepted` and `rejected`. Every other branch stays verbatim.
  5. `act_record_filing_result` (from 035): only e-filed returns can be answered (D2).
  6. `act_mark_ready_to_efile` (from 033): the new history line (D8).
- [x] 2.5 Run `npm run db:migrate:test` and the filing tests until they pass. Also re-run 037 on the same stack to confirm it's safe to apply again.

## 3. Database: the season-end close

- [x] 3.1 Write failing tests in a new `tests/database-season-close.mjs`, and register it in the database suite:
  - it closes Ready to exit and a Hold from Ready to exit with reason `dismissed`, and cancels open requests and follow-ups;
  - one `CLOSE_CASE` event per case, with `seasonEnd: true`;
  - one client line per case: the Dismissed message;
  - no `withdrawal_notice`;
  - a stale revision, or a case at Ready to e-file, Rejected, Waiting for documents or a documents Hold, refuses the whole call with `CONFLICT` and changes nothing;
  - an empty list, a duplicate ID or a missing confirmation is refused with `VALIDATION`;
  - a volunteer person and a client session are refused as forbidden;
  - a replay returns the same receipt and adds no events;
  - the receipt lists each case's ID, reference and new revision;
  - only listed cases close.
- [x] 3.2 037, section 7: `public.vitally_close_unsigned` (D9). It covers membership and the admin check, the envelope check, the receipt, locking in ID order, the eligibility and revision checks, and for each case `close_case_steps`, the event, the client line and the revision bump. Then the receipt, and grants as for `vitally_log_contact`.
- [x] 3.3 Run `npm run db:migrate:test`, then `npm run test:database`, until they pass.

## 4. Database: samples

- [x] 4.1 Update the failing expectations in `tests/database-fixtures.mjs` and `tests/database-stages.mjs`:
  - the `rejected` and `accepted` samples' Mark ready to e-file line is the new one;
  - `rejected`'s fix note is "Fictional note: site coordinator to correct the dependent's SSN in TaxSlayer.".
- [x] 4.2 037, section 8: `fixture_history` and `apply_fixture_scenario` (from 036), with only those lines changed. Then the closing grants, as 036 ends.
- [x] 4.3 Run `npm run test:database` in full until it passes.

## 5. Browser: domain and client text

- [x] 5.1 Write failing unit tests in `tests/domain.test.mjs`:
  - `filingMethodKind` returns `paper_and_efile`;
  - `returnState` gives `given_to_client` for any paper return;
  - `waitingReturns` and `awaitsAcknowledgment` ignore paper returns;
  - the staff names of D5 for every kind at E-filed and Accepted;
  - the client labels: "Filed" at E-filed for both mixed pairs, "Ready to mail" at Accepted with any paper return, "Ready" at Ready to e-file;
  - the eight signing messages (design D8, brainstorm Q3);
  - `filingMessage` with the handover sentences, followed by the refund sentence at Accepted.
- [x] 5.2 Implement in `src/domain.mjs`: `filingMethodKind`, `returnState`, `waitingReturns`, `METHOD_LABELS`, and the fallback signing strings.
- [x] 5.3 In `src/client-text.mjs`:
  - the signing keys;
  - `stage.ready_to_efile.label`;
  - `stage.accepted.paper.label`;
  - remove `stage.efiled.mailed.label`;
  - rename `filing.*.mailed` to `filing.*.given_to_client`, with the new sentences;
  - the new history lines;
  - a frozen legacy table of 035's mailed sentences that `filingLines()` also expands;
  - keep the old 8879 and mailed history lines in the map (D7).
- [x] 5.4 Update `tests/client-language.test.mjs` and `tests/client-views.test.mjs`:
  - new lines translate exactly;
  - old stored lines (the 8879 line, "PCDC mailed your returns.", a several-weeks sentence) still render their 简体.
- [x] 5.5 Run `npm run build:hant` and commit `src/zh-hant.mjs`. Then `npm run build:hant -- --check`.

## 6. Browser: staff screens

- [x] 6.1 Write failing tests in `tests/admin-views.test.mjs`:
  - the Mark e-filed dialog's four choices, their "given to the client to mail" labels and lines, the second-filing choices and the done line, and the new box;
  - Record filing result offers no paper return and no Mailed or "Date mailed";
  - the role-neutral fix-note prompt;
  - Mark ready to e-file's new box and lead;
  - the signing panel heading "Signing", and the Hold and refusal lines without 8879;
  - no paper branch in the return-to-signing refusal.
- [x] 6.2 Implement in `src/admin-views.mjs` and `src/case-actions.mjs`. That covers `FILED_LINES`, `efiledChoices`, `resultFields`, the confirmation sentences, and the four pairs in the methods map.
- [x] 6.3 Write failing tests in `tests/office-views.test.mjs`, `tests/staff-views.test.mjs` and `tests/pool-views.test.mjs`:
  - Follow-ups sentences without the mailing wait, and colouring for any Filing result row;
  - "Waiting for the client to sign." and "Can't reach the client to sign.";
  - the Filing panel's "Paper · Given to the client" with no date;
  - the volunteer's next step at Rejected and Accepted;
  - the staff history "recorded the client's signature";
  - the unit fixtures' notes say "Site coordinator to correct…".
- [x] 6.4 Implement in `src/office-views.mjs`, `src/staff-views.mjs` and `src/pool-views.mjs`.

## 7. Browser: the season-end close

- [ ] 7.1 Write failing tests:
  - `tests/office-views.test.mjs`, the button and dialog markup: the button only for admins; disabled with "No case is waiting for a signature." when nothing qualifies; one row per Ready to exit case and signing Hold, oldest first, ticked, with reference, name, stage and days; the heading for all and for some ticked; the confirmation box;
  - `tests/controller.test.mjs` and `tests/store.test.mjs`: `closeUnsigned` sends the ticked `{caseId, revision}` list and applies each revision, and on `CONFLICT` it re-reads and reopens with the current list.
- [ ] 7.2 Implement: `closeUnsigned` in `src/supabase-store.mjs`, the controller action, the dialog and its live count in `src/office-views.mjs` and `src/app.mjs`, and the staff history sentence "closed the case at season end · Dismissed" for a `CLOSE_CASE` event with `seasonEnd`.
- [ ] 7.3 Run `npm test` until it passes.

## 8. The story

- [ ] 8.1 Update the signing and filing step's assertions to the new wording, in English and 简体. Change the fix note to "Site coordinator to correct the dependent's date of birth in TaxSlayer".
- [ ] 8.2 Rewrite step 5 (rejection loop):
  - Mark e-filed with the PA-40 "On paper (given to the client to mail)" lands at "Accepted, PA on paper";
  - the Record filing result block is removed, leaving one `RECORD_FILING_RESULT` event;
  - the case is in the Done tab;
  - the client sees "Ready to mail" and a status panel with the IRS acceptance, the PA handover sentence and the refund sentence as plain text, and the history gains the handover line;
  - the evidence string is updated.
- [ ] 8.3 Add a final story step, the season-end close:
  - after a sample reset, put the `review_approved` sample on a signing Hold and return the `rejected` sample to signing. Open Close unsigned cases…, check the stage, days and ticks, untick the `rejected` sample and confirm;
  - the ticked cases are Closed · Dismissed and under the Dismissed filter, the unticked case hasn't moved, each closed client reads the Dismissed line, and no TaxSlayer notice row appears.
- [ ] 8.4 Run `npm run test:browser` until it passes.

## 9. Docs

- [ ] 9.1 `docs/media/return-lifecycle.svg`: the paper branch labels. These are the four pairs' names, and both paper going straight to Accepted ("Paper").
- [ ] 9.2 `docs/demo-script.md`: the filing-results line (accepted, rejected; paper returns given to the client), the signing wording, the story's paper step and the season-end close.
- [ ] 9.3 `docs/developer/database.md`: 037 in the migration list, the state diagram (Mark e-filed to Accepted), the `MARK_EFILED` and `RECORD_FILING_RESULT` notes and payloads, `given_to_client`, `vitally_close_unsigned`, and `database-season-close.mjs` in the test list.
- [ ] 9.4 `docs/developer/frontend.md`: the names table (four kinds, "Ready", "Ready to mail"), the Mark e-filed dialog's four pairs, Record filing result, and the season-end dialog.

## 10. Checks

- [ ] 10.1 Run every check and record the counts against the baseline (unit 1317, database 408, browser story 75):
  - `npm test`;
  - `npm run db:migrate:test` and `npm run test:database`;
  - `npm run test:browser`;
  - `npm run build:hant -- --check`;
  - `npx openspec validate --all`;
  - a clean `npm run build:intake` (nothing to commit).

  `npm run test:auth-browser` isn't needed, because sign-in is untouched.
