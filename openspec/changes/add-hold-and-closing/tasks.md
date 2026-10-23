## 1. Gate before apply

- [x] 1.1 Hailey reviews and approves the planning artifacts. The group's wording review and PCDC's season-end question stay open and don't block apply.
- [x] 1.2 Just before apply, check the migration list. 036 must be one after the newest migration; renumber if it's taken. Re-check each copied function's newest definition (design D14).

## 2. Database: stages, origins, documents at intake

- [x] 2.1 Write failing database tests (new `tests/database-hold.mjs`):
  - the stage check accepts `awaiting_documents` and `on_hold`;
  - the origin and reason constraints (D2, D6);
  - `REQUEST_DOCUMENTS_AT_INTAKE` from Screening and from Pending intake / filing (1–5 requests; volunteers refused; refused at other stages);
  - the client responds at Waiting for documents;
  - an admin verifies there; verifying the last request returns the case to its origin, with the history line;
  - a request added before the last verify keeps the case waiting;
  - the preparer's mid-preparation loop is unchanged.
- [x] 2.2 New migration `036_hold_and_closing.sql`:
  - a header listing every copied function;
  - the stage check;
  - `cases.documents_origin`, `hold_origin` and `closing_reason`, with their constraints;
  - `receive_document` and `act_verify_document` (from 004) opened to the new stages, with an admin verifying there and the automatic return (D4);
  - `act_request_documents_at_intake` (D3).
- [x] 2.3 `check_payload` (from 035): branches for the four new actions and the new `CLOSE_CASE` payload. Every other branch stays verbatim.

## 3. Database: Hold, Close with reasons, Withdraw

- [x] 3.1 Write failing tests:
  - `PUT_ON_HOLD` from Waiting for documents and from Ready to exit, with the note kept staff-only;
  - refused elsewhere;
  - `RESUME_FROM_HOLD` back to the origin;
  - the last verify at a documents hold returns to the documents' origin;
  - Mark ready to e-file refused while held from Ready to exit;
  - volunteers refused.
- [x] 3.2 Implement `act_put_on_hold` and `act_resume_from_hold` (D5).
- [x] 3.3 Write failing tests for `CLOSE_CASE`:
  - the six reasons, with `other` needing a note;
  - unknown or missing reasons refused;
  - Close allowed at Waiting for documents and at Hold, whatever its origin;
  - the stored reason;
  - the per-reason client line;
  - the note never in a client message;
  - origins cleared;
  - older closed cases keep a null reason.

  Then rewrite `act_close_case` (from 035, D6).
- [x] 3.4 Write failing tests for `WITHDRAW`:
  - only the case's own client;
  - only at the D7 stages;
  - closed with reason `withdrawn`;
  - the history lines;
  - the `withdrawal_notice` follow-up only when a preparer or reviewer was at work;
  - it resolves on the Closed case.

  Then implement `act_withdraw` (D7). Add the follow-up purpose constraint (from 033), and change `act_resolve_followup` / `vitally_apply_action` only if a closed case is refused (D8).
- [x] 3.5 `check_authority` (from 018) for `WITHDRAW` ownership. `check_operation_authority` and `vitally_apply_action` (from 035): the new groups and dispatch lines (D9). Tests: every refusal and its code.

## 4. Database: samples

- [x] 4.1 `fixture_keys`, `fixture_answers_v2`, `fixture_history` and `apply_fixture_scenario` (from 035) gain `on_hold` and `withdrawn`, each with its own fictional client (D13).
- [x] 4.2 Fixture tests for both samples. Update every test that counts samples to ten, and `FIXTURE_KEYS` in `tests/support/database-fixture.mjs`. Run `npm run db:migrate:test`, then `npm run test:database`.

## 5. Browser: contracts, domain, builders, store

- [x] 5.1 `src/contracts.mjs`: the new stages, the four new actions, and the closing reasons. Tests first.
- [x] 5.2 `src/domain.mjs` (`describeStage`):
  - the new stage names and labels;
  - Closed's name by reason;
  - the Hold message by origin;
  - the closed message by reason.

  Tests.
- [x] 5.3 `src/case-actions.mjs`: builders for `REQUEST_DOCUMENTS_AT_INTAKE`, `PUT_ON_HOLD`, `RESUME_FROM_HOLD`, `WITHDRAW` and the new `CLOSE_CASE` (reason and note). Tests first.
- [x] 5.4 `src/supabase-store.mjs`: map `documents_origin`, `hold_origin` and `closing_reason`. Tests.

## 6. Browser: staff screens

- [x] 6.1 `src/admin-views.mjs`:
  - the office actions panel and dialogs: Ask for documents…, Put on hold…, Got in touch…, and Close… with the reason radio and note;
  - "Ask for documents…" in the screening checks panel;
  - an admin's Verify at Waiting for documents and at Hold.

  Update `tests/fixtures/confirm-dialogs.json` and the view tests.
- [x] 6.2 `src/staff-views.mjs`: the lifecycle-bar marks, the "Your next step" texts, and `EVENT_SENTENCES` for the four new actions. Tests.
- [x] 6.3 `src/pool-views.mjs`: `poolPhase` (Waiting on client, Needs attention) and the Closed reason filter. `src/office-views.mjs`: the `documents`, `hold` and `withdrawn` kinds, their texts and colouring (D12). Tests.
- [x] 6.4 `src/app.mjs` and `src/views.mjs`: wire the actions, dialogs and toasts. Update `tests/shell.test.mjs` as needed.

## 7. Browser: the client

- [x] 7.1 `src/client-text.mjs`: the labels, stage messages, Hold messages, closed messages, the withdraw button, box and contact line, and every new history line in `SENTENCES` (D11). Run `npm run build:hant` and commit `src/zh-hant.mjs`.
- [x] 7.2 `src/client-views.mjs`:
  - the stepper placement, with Hold by origin;
  - the Withdraw button at the D7 stages and its dialog;
  - the contact line from Ready to exit on;
  - the requests listed at Waiting for documents and at a documents Hold;
  - the closed message by reason.

  Tests, including that no hold or close note is ever rendered.
- [x] 7.3 Translation tests: every history line the SQL can produce has a 简体 entry, and no new message names a phone number.

## 8. The story

- [x] 8.1 `tests/browser.mjs`: the two flows (documents at screening; a withdrawal of a claimed case, with the Follow-ups notice and the client's closed message in 简体). Update the sample counts to ten. Every existing close in the story sends a reason.
- [x] 8.2 Run `npm run test:browser`.

## 9. Docs

- [x] 9.1 `docs/media/return-lifecycle.svg`: mark Waiting for documents, Hold and the exits as built. Mark Same day and FSA as not built. Keep the layout.
- [x] 9.2 Update:
  - `docs/demo-script.md`;
  - `docs/developer/database.md` (new actions, columns, the follow-up purpose);
  - `docs/developer/frontend.md` (stages, labels, stepper, pool, Follow-ups);
  - `docs/developer/production-roadmap.md` §4 (Waiting for documents, Hold, the unreachable client and withdrawal are built; spec §8.2's in-preparation Pending is a design difference);
  - `docs/setup.md` and `README.md` (ten samples, the 036 row).

## 10. Checks

- [ ] 10.1 Run `npm test`, `npm run build:hant -- --check`, `npx openspec validate --all`, `npm run db:migrate:test` + `npm run test:database`, and `npm run test:browser`. Record the counts against the baseline (unit 1279, database 374, story 65).
