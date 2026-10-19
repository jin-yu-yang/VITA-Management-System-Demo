## Why

A preparer sends a return to review, and a reviewer approves it, by pressing one button. Nothing records what was checked. Who confirmed the intake, whether the 13614-C's shaded parts and PA State Forgiveness were done, how the client will sign Form 8879, and the federal, state and local results for the Exit Form all live on paper or in memory. Missing State Forgiveness once caused a serious problem. Each hand-off should therefore carry a short questionnaire that the database checks and that staff can read on the case page.

## What Changes

**Sending a return to review (`SUBMIT_REVIEW`, `RESUBMIT_REVIEW`)**

- From: a button (`SUBMIT_REVIEW`, empty payload) and a one-textarea form (`RESUBMIT_REVIEW`, `{resolution}`).
- To: both carry a preparer questionnaire:
  - who confirmed the intake with the preparer, and how;
  - the 13614-C's shaded parts are completed (a confirmation);
  - PA State Forgiveness is set to Y (a confirmation);
  - the date the return was marked ready to review in TaxSlayer.

  Resubmitting opens the form with the previous answers filled in. Every submission is kept, one per preparation version.
- Impact: breaking for the RPC payload; an old empty payload is refused. Staff screens only.

**Approving a review (`APPROVE_REVIEW`)**

- From: a button with an empty payload.
- To: it carries a reviewer questionnaire, shown inline in "Your next step" above the Approve button:
  - the date the return was marked completed in TaxSlayer;
  - PA forgiveness eligibility (Schedule SP);
  - whether the reviewer went over the return with the client, and when and how. This is prefilled from the case's contact log when it holds a reached "go over tax return" contact;
  - how the client will sign Form 8879, with a default taken from the intake answer `service`;
  - an appointment to sign, when signing is in person and the visit was not same-day;
  - the optional Exit Form groups (Federal, State, and any number of Local entries, each with a type), each collapsible;
  - Remarks.
- Impact: breaking for the RPC payload. Staff screens only, except the client message below.

**Not going over the return (3 = No)**

- From: office follow-ups exist only for an unanswered document request.
- To: an approval that says the return was not gone over also opens an office follow-up to go over it with the client. The office works it in Follow-ups like any task: it logs contacts on it in the contact log and resolves it with the existing resolve action.
- Impact: `admin_followups` gains a `purpose` with the contact log's own words (`request_documents`, `go_over_return`), and `request_id` becomes optional. Existing rows become `request_documents`. A contact logged on a task starts with the task's purpose chosen.
- **Open (Q1, Hailey decides):** whether Mark ready to e-file must wait while that follow-up is open. design.md gives Claude's proposal.

**The reviewer's contact step after approval**

- From: every approval leaves "Record this conversation" pending for the reviewer, and #91's Mark ready to e-file waits for it.
- To: an approval with a questionnaire completes that step. On yes, the questionnaire has already recorded it, so Mark ready to e-file is offered at once. On no, the office follow-up takes over. So two people are never asked to contact the client. `RECORD_REVIEW_CONTACT` stays, and still serves approvals from before this change.

**The client's Ready to exit message**

- From: one message for every case at Ready to exit.
- To: the approval chooses one of four variants, in English and 简体 (繁體 generated):
  - signing in person at an appointment, with its date and time;
  - signing on site the same day;
  - signing in the TaxSlayer Customer Portal;
  - not yet gone over with the client.

  A case approved before this change keeps today's message. The client reads only the variant and the appointment, which are stored on the case. The client never reads the questionnaire itself.

**Case page**

- To: every staff member who can open the case sees each submission's preparer answers and the reviewer's answers in the Independent review panel. The reviewer sees the previous submission next to the current one. Clients never read either questionnaire.

**Out of scope:** generating the Exit Form PDF; removing "Record this conversation" (`RECORD_REVIEW_CONTACT`); importing TaxSlayer reports; changing the approval's client history line.

**Tracking:** part of #85, the TODO list this work was folded into (#83 was folded into #85). The PR says "Part of #85" and uses no closing keyword ("Fixes", "Closes", "Resolves"), so merging it leaves #85 open.

**Sequencing:** #91 (lifecycle chain, part 1) and #88 (contact log) are merged, and this branch has main merged in. #90 (`add-staff-identity`) also plans a migration. Whichever of the two merges second renumbers its migration to follow main's newest, with no gap.

## Capabilities

### New Capabilities

- `review-and-corrections`: the preparer and reviewer questionnaires on the three review hand-offs. Covers:
  - what each asks, and the database's validation;
  - who may answer;
  - one record per submission, and the prefill on resubmit;
  - the contact-log prefill;
  - the sign-8879 default and conditions;
  - the Exit Form groups;
  - the contact step an approval settles;
  - who can read the answers.
- `office-follow-up`: a follow-up the office owns that is not tied to a document request. It is opened when a reviewer approves without going over the return, and the office works it in Follow-ups and the contact log.

### Modified Capabilities

- `case-lifecycle`: the client's Ready to exit message gets four variants, chosen at approval ("Clients are told at each new step").
- `staff-case-work`: a contact logged on a follow-up task starts with the task's purpose chosen ("Office follow-up contacts are logged in the contact log").

## Impact

- **Database:** one new migration, `033_review_questionnaires.sql` (next free number):
  - tables `preparer_questionnaires` and `reviewer_questionnaires`, with presenter-only RLS and the realtime publication;
  - `admin_followups.purpose`, and `request_id` made nullable;
  - `cases.signing_plan` and `cases.signing_appointment_at`, which the client reads;
  - new `check_payload` branches for the three actions;
  - new versions of `act_submit_review`, `act_resubmit_review` and `act_approve_review`;
  - fixtures (`apply_fixture_scenario`) that seed fictional answers.

  design.md lists every redefined function and the migration it is copied from.
- **Browser:**
  - `src/questionnaires.mjs` (new): vocabulary, builders, prefill;
  - `src/case-actions.mjs`: the payload builders;
  - `src/staff-views.mjs`: the three forms in "Your next step", the answers in the review panel, and the task purpose in the Log contact form;
  - `src/supabase-store.mjs`: the new tables (staff only), `purpose`, and the two case columns;
  - `src/admin-views.mjs` / `src/office-views.mjs`: a follow-up with no document request;
  - `src/domain.mjs`, `src/client-views.mjs`: the Ready to exit variant;
  - `src/client-text.mjs` and the generated `src/zh-hant.mjs`: the four variants;
  - `src/contracts.mjs`: notes.
- **Tests:**
  - `tests/case-actions.test.mjs`, `tests/questionnaires.test.mjs`, `tests/staff-views.test.mjs`, `tests/admin-views.test.mjs`, `tests/office-views.test.mjs`, `tests/client-views.test.mjs` and the domain tests;
  - `tests/database-review.mjs`, `tests/database-stages.mjs`, `tests/database-contacts.mjs`, and the fixture and realtime database suites;
  - `tests/browser.mjs` (the story fills the forms).
- **Unchanged:** the intake catalogue, the approval's client history line, and the `RECORD_REVIEW_CONTACT` action itself.
- **Revises ruling R28:** the review workflow now stores refund and owed amounts, payment methods and debit dates, staff-only, for the Exit Form. It never stores account or routing numbers. The PR must call this out (design D3).
