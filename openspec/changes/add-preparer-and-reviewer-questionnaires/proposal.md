## Why

A preparer sends a return to review, and a reviewer approves it, by pressing one button. Nothing records what was checked. Who confirmed the intake, whether the 13614-C's shaded parts and PA State Forgiveness were done, how the client will sign Form 8879, and the federal, state and local results for the Exit Form all live on paper or in memory. Missing State Forgiveness once caused a serious problem. Each hand-off should therefore carry a short questionnaire that the database checks and that staff can read on the case page.

## What Changes

**Sending a return to review (`SUBMIT_REVIEW`, `RESUBMIT_REVIEW`)**

- From: a button (`SUBMIT_REVIEW`, empty payload) and a one-textarea form (`RESUBMIT_REVIEW`, `{resolution}`).
- To: both carry a preparer questionnaire: who confirmed the intake with the preparer and how; the 13614-C's shaded parts are completed (a confirmation); PA State Forgiveness is set to Y (a confirmation); and the date the return was marked ready to review in TaxSlayer. Resubmitting opens the form with the previous answers filled in. Every submission is kept, one per preparation version.
- Impact: breaking for the RPC payload; an old empty payload is refused. Staff screens only.

**Approving a review (`APPROVE_REVIEW`)**

- From: a button with an empty payload.
- To: it carries a reviewer questionnaire:
  - the date the return was marked completed in TaxSlayer;
  - PA forgiveness eligibility (Schedule SP);
  - whether the reviewer went over the return with the client, and when and how;
  - how the client will sign Form 8879, with a default taken from the intake answer `service`;
  - an appointment to sign, when signing is in person and the visit was not same-day;
  - the optional Exit Form groups (Federal, State, any number of Local entries, each with a type);
  - Remarks.
- Impact: breaking for the RPC payload. Staff screens only.

**Not going over the return (3 = No)**

- From: office follow-ups exist only for an unanswered document request.
- To: an approval that says the return was not gone over also opens an office follow-up to go over it with the client. The office works it in the existing Follow-ups queue with the existing call and resolve actions.
- Impact: `admin_followups` gains a `kind`, and `request_id` becomes optional. Existing rows become `kind = document`.

**Case page**

- To: every staff member who can open the case sees each submission's preparer answers and the reviewer's answers in the Independent review panel. The reviewer sees the previous submission next to the current one. Clients never read either questionnaire.

**Out of scope:** generating the Exit Form PDF; the call log (`add-call-log`) and its 3a/3b prefill; any change to "Record this conversation" (`RECORD_REVIEW_CONTACT`); importing TaxSlayer reports; client text.

**Sequencing:** this change is applied only after Jinyu's lifecycle chain (#73) merges. The plan uses today's stage names, and they will be updated with `/opsx:update` once the chain lands.

## Capabilities

### New Capabilities

- `review-and-corrections`: the preparer and reviewer questionnaires on the three review hand-offs. Covers what each asks, the database's validation, who may answer, one record per submission, prefill on resubmit, the sign-8879 default and conditions, the Exit Form groups, and who can read the answers.
- `office-follow-up`: a follow-up the office owns that is not tied to a document request, opened when a reviewer approves without going over the return, and worked with the existing call and resolve actions.

### Modified Capabilities

- (none)

## Impact

- **Database:** one new migration:
  - tables `preparer_questionnaires` and `reviewer_questionnaires`, with presenter-only RLS and the realtime publication;
  - `admin_followups.kind`, and `request_id` made nullable;
  - new `check_payload` branches for the three actions;
  - new versions of `act_submit_review`, `act_resubmit_review` and `act_approve_review`;
  - fixtures (`apply_fixture_scenario`) that seed fictional answers.
- **Browser:**
  - `src/case-actions.mjs`: the payload builders;
  - `src/staff-views.mjs`: the three forms in "Your next step" and the answers in the review panel;
  - `src/supabase-store.mjs`: the new tables, staff only;
  - `src/admin-views.mjs` / `src/office-views.mjs`: a follow-up with no document request;
  - `src/contracts.mjs`: notes.
- **Tests:**
  - `tests/case-actions.test.mjs`, `tests/staff-views.test.mjs`, `tests/admin-views.test.mjs`, `tests/office-views.test.mjs`;
  - `tests/database-review.mjs` and the fixture and realtime database suites;
  - `tests/browser.mjs` (the story fills the forms).
- **Unchanged:** client text (`src/client-text.mjs`, `src/zh-hant.mjs`), the intake catalogue, and `RECORD_REVIEW_CONTACT`.
- **Overlap:** Jinyu's lifecycle chain (#73) edits the same three stage functions and "Your next step". It blocks apply.
