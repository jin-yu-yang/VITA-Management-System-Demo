## 1. Gate before apply

- [x] 1.1 #91 (lifecycle chain, part 1) is merged into `main`. `/opsx:update` renamed the stages in every artifact and pointed the migration at the newest definitions (design D12). #88 (contact log) is merged too, so the update added the contact-log prefill (design D9).
- [x] 1.2 Merge `main` into this branch (71e84d1). The migration is `033`, one after main's newest.
- [ ] 1.3 Hailey rules on design Q1 (a No approval and Mark ready to e-file). Run `/opsx:update` to write the ruling into `office-follow-up`, design and plan Task 4a.
- [ ] 1.4 Just before apply, merge `main` again. If anything took `033`, renumber to the next free number with no gap. Re-run the D12 lookup and recopy any function whose newest definition moved.

## 2. Database: tables, follow-up purpose and signing plan

- [ ] 2.1 Write failing database tests in `tests/database-review.mjs` for the two tables:
  - an applicant reads no row from either;
  - a presenter reads them;
  - the table checks (`other` needs a name; 3a with yes; 3b only with yes) reject bad rows.
- [ ] 2.2 New migration `033_review_questionnaires.sql`, part 1 (design D2):
  - `preparer_questionnaires` and `reviewer_questionnaires`;
  - presenter-only RLS, grants, realtime publication (the `case_materials` pattern in `013`).
- [ ] 2.3 Write failing tests, then migrate `admin_followups` (design D5):
  - `purpose` with the `request_documents` default;
  - `request_id` nullable;
  - the purpose/request check;
  - existing rows read `request_documents`.
- [ ] 2.4 Write failing tests, then add `cases.signing_plan` and `cases.signing_appointment_at` with their check (design D11). An applicant reads them on their own case.

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
- [ ] 3.2 Implement `vitally_private.check_exit_form` and the new `check_payload` branches for `SUBMIT_REVIEW`, `RESUBMIT_REVIEW` and `APPROVE_REVIEW` (design D3, D4). Copy `check_payload` from 032 and every other branch verbatim (D12).
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
  - a legacy pending approval can still be recorded (design D10);
  - a yes approval meets #91's Mark ready to e-file gate at once;
  - the signing plan for each of the four cases, with the appointment copied only for `appointment` (D11);
  - the office logs a contact on a go-over task (`vitally_log_contact`) and resolves it; a non-assignee is refused.
- [ ] 3.4 Re-create `act_submit_review`, `act_resubmit_review` (both from 006) and `act_approve_review` (from 021), with only these added:
  - the questionnaire insert;
  - the date and appointment checks;
  - the D5 follow-up;
  - the D10 contact-step completion;
  - the D11 signing plan.

  Leave `act_record_review_contact` and `act_mark_ready_to_efile` unchanged. Keep each client message as it is. Move #91's `approvedCase` helper and its gate test to a questionnaire approval, and add `legacyApprovedCase`.
- [ ] 3.5 Update `apply_fixture_scenario`, copied from 031 (design D8), and its tests in `tests/database-fixtures.mjs`:
  - clear both tables and the signing plan;
  - seed the fictional answers;
  - seed the approved sample's contact step as completed (D10) and its plan as `portal`.
- [ ] 3.6 Run `npm run db:migrate:test`, then `npm run test:database`.

## 4. Browser: payloads, prefill and the store

- [ ] 4.1 Write failing tests in `tests/questionnaires.test.mjs` and `tests/case-actions.test.mjs`, then build the three payloads from their forms. The builders apply the same rules as the database, each with a clear sentence (design D4).
- [ ] 4.2 The contact-log prefill `goOverPrefill(contacts)` (design D9), with tests for the latest entry, either direction, the method mapping and the New York date.
- [ ] 4.3 `src/supabase-store.mjs`:
  - load both tables for staff only (`STAFF_TABLES`, `mapStaffCase`), never for the applicant adapter;
  - `mapFollowup` passes `purpose`;
  - `mapCase` passes `signingPlan` and `signingAppointmentAt`, for both adapters;
  - tests in `tests/store.test.mjs`.
- [ ] 4.4 Update the shape notes in `src/contracts.mjs`.

## 5. Browser: forms and the case page

- [ ] 5.1 Preparer form, inline in "Your next step" (design D7). It shows at Filing in progress, and at Corrections in progress after the resolution textarea. It has:
  - the four answers;
  - today's date;
  - the prefill from the latest submission on resubmit.

  View tests in `tests/staff-views.test.mjs`.
- [ ] 5.2 Reviewer form, inline in "Your next step" at Review in progress, directly above Approve (design D7). It has:
  - answers 1–5 with their show/hide rules;
  - the contact-log prefill (D9);
  - the sign-8879 default from `service`;
  - the Exit Form groups: Federal, State and one Local entry per type, each a collapsible `<details>`, closed until opened or filled;
  - Remarks.

  View tests.
- [ ] 5.3 The previous preparer submission next to the current one, with changed answers marked, at Review in progress (design D7). View tests.
- [ ] 5.4 At Ready to exit, "Your next step" shows the D10 line and no "Record this conversation" form after a questionnaire approval. A legacy pending approval still shows the form. View tests.
- [ ] 5.5 The review panel: each version's preparer answers and each approved attempt's reviewer answers, and "No questionnaire was recorded for this version." when there is none. View tests.
- [ ] 5.6 A follow-up with no request in `src/admin-views.mjs` and `src/office-views.mjs`:
  - `followupTask` titles a go-over task "Go over the return with the client", with no document line;
  - the task's Log contact form starts with the task's purpose chosen (D5).

  Tests in `tests/admin-views.test.mjs`, `tests/office-views.test.mjs` and `tests/staff-views.test.mjs`. Audit every `requestId` read on a follow-up.
- [ ] 5.7 The Ready to exit variants (design D11):
  - `describeStage(stage, lang, record)`;
  - the four keys in `src/client-text.mjs` (English and 简体);
  - `{when}` formatting;
  - then `npm run build:hant` and commit `src/zh-hant.mjs`.

  Tests in `tests/domain.test.mjs` and `tests/client-views.test.mjs`: each variant in English and 简体, the pinned appointment text, a non-UTC time zone, the legacy message, and #91's phone-number check over every variant.
- [ ] 5.8 Styles for the forms, the collapsible groups and the comparison in `src/styles.css`, reusing existing staff-form classes.
- [ ] 5.9 Run `npm test` and `npm run build:hant -- --check`.

## 6. Story and full checks

- [ ] 6.1 Update `tests/browser.mjs`:
  - the story fills the preparer form on submit and on resubmit, and the reviewer form on approve;
  - add one path that answers no and finds the task in Follow-ups;
  - remove the story's "Record this conversation" press after approval, and assert that no such form is offered (D10);
  - the client window shows the variant the approval chose.
- [ ] 6.2 Run `npm run test:browser`.
- [ ] 6.3 Run `npx openspec validate --all`, and confirm that `npm run build:intake` leaves nothing to commit.
