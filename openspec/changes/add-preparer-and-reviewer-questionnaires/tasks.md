## 1. Gate before apply

- [ ] 1.1 Confirm Jinyu's lifecycle chain (#73) is merged into `main`. Run `/opsx:update` to rename the stages in every artifact of this change, and point the migration task at the chain's latest definitions of `act_submit_review`, `act_resubmit_review`, `act_approve_review`, `check_payload` and `apply_fixture_scenario` (design, Context and Open Questions). Check whether `add-call-log` has merged; if it has, the update adds the 3a/3b prefill (design D9).
- [ ] 1.2 Merge `main` into this branch, and renumber the migration to follow the last one on `main`.

## 2. Database: tables and follow-up kind

- [ ] 2.1 Write failing database tests in `tests/database-review.mjs` for the two tables:
  - an applicant reads no row from either;
  - a presenter reads them;
  - the table checks (`other` needs a name; 3a with yes; 3b only with yes) reject bad rows.
- [ ] 2.2 New migration, part 1 (design D2):
  - `preparer_questionnaires` and `reviewer_questionnaires`;
  - presenter-only RLS, grants, realtime publication (the `case_materials` pattern in `013`).
- [ ] 2.3 Write failing tests, then migrate `admin_followups` (design D5):
  - `kind` with the `document` default;
  - `request_id` nullable;
  - the kind/request check;
  - existing rows read `document`.

## 3. Database: validation and the three handlers

- [ ] 3.1 Write failing tests for `check_payload` and `check_exit_form`:
  - every required answer missing;
  - every conditional rule;
  - unknown keys;
  - bad enums and impossible dates;
  - the amount format;
  - duplicate Local types;
  - more than five Local entries;
  - an account number or routing number in any group (refused; design D3);
  - the old empty payloads.
- [ ] 3.2 Implement `vitally_private.check_exit_form` and the new `check_payload` branches for `SUBMIT_REVIEW`, `RESUBMIT_REVIEW` and `APPROVE_REVIEW` (design D3, D4). Copy every other branch verbatim.
- [ ] 3.3 Write failing tests for the handlers:
  - a valid submit or resubmit stores one row at the new version;
  - a refused one changes stage, revision, version and receipts not at all;
  - the date window (D6);
  - the appointment rule against `service`;
  - an approval stores one reviewer row;
  - a no answer opens one `go_over_return` follow-up;
  - no office person refuses;
  - another persona is refused and nothing is stored;
  - the review-contact step is completed on yes (outcome reached) and on no (no outcome), and `RECORD_REVIEW_CONTACT` is then refused;
  - a legacy pending approval can still be recorded (design D10).
- [ ] 3.4 Re-create `act_submit_review`, `act_resubmit_review` and `act_approve_review` from their latest definitions, with only the questionnaire insert, the date and appointment checks, the D5 follow-up and the D10 contact-step completion added. Leave `act_record_review_contact` unchanged. Keep each client message as it is.
- [ ] 3.5 Update `apply_fixture_scenario` (design D8) and its tests in `tests/database-fixtures.mjs`: clear both tables, seed the fictional answers, and seed the approved sample's contact step as completed (D10).
- [ ] 3.6 Run `npm run db:migrate:test`, then `npm run test:database`.

## 4. Browser: payloads and the store

- [ ] 4.1 Write failing tests in `tests/case-actions.test.mjs`, then build the three payloads from their forms. The builders apply the same rules as the database, each with a clear sentence (design D4).
- [ ] 4.2 `src/supabase-store.mjs`:
  - load both tables for staff only (`STAFF_TABLES`, `mapStaffCase`), never for the applicant adapter;
  - `mapFollowup` passes `kind`;
  - tests in `tests/store.test.mjs`.
- [ ] 4.3 Update the shape notes in `src/contracts.mjs`.

## 5. Browser: forms and the case page

- [ ] 5.1 Preparer form in "Your next step" (`preparing`, and `corrections_required` beside the resolution textarea):
  - the four answers;
  - today's date;
  - the prefill from the latest submission on resubmit (design D7).

  View tests in `tests/staff-views.test.mjs`.
- [ ] 5.2 Reviewer form in "Your next step" (`reviewing`):
  - answers 1–5 with their show/hide rules;
  - the sign-8879 default from `service`;
  - the Exit Form groups: Federal, State and one optional entry per Local type (design D7);
  - Remarks.

  View tests.
- [ ] 5.3 The previous preparer submission next to the current one, with changed answers marked, in `reviewing` (design D7). View tests.
- [ ] 5.4 In `review_approved`, "Your next step" shows the D10 line and no "Record this conversation" form after a questionnaire approval. A legacy pending approval still shows the form. View tests.
- [ ] 5.5 The review panel: each version's preparer answers and each approved attempt's reviewer answers, and "No questionnaire was recorded for this version." when there is none. View tests.
- [ ] 5.6 A follow-up with no request in `src/admin-views.mjs` and `src/office-views.mjs`: the label "Go over the return with the client" and no document line. Tests in `tests/admin-views.test.mjs` and `tests/office-views.test.mjs`. Audit every `requestId` read on a follow-up.
- [ ] 5.7 Styles for the forms and the comparison in `src/styles.css`, reusing existing staff-form classes.
- [ ] 5.8 Run `npm test`.

## 6. Story and full checks

- [ ] 6.1 Update `tests/browser.mjs` so that the story fills the preparer form on submit and on resubmit, and the reviewer form on approve. Add one path that answers no and finds the task in Follow-ups. Remove the story's "Record this conversation" press after approval, and assert that no such form is offered (D10).
- [ ] 6.2 Run `npm run test:browser`.
- [ ] 6.3 Run `npx openspec validate --all`, and confirm that `npm run build:intake` leaves nothing to commit. Client text is unchanged, so `build:hant -- --check` is not needed; say so in `verify.md`.
