## Context

- **Today's hand-offs carry no record of what was checked.** `SUBMIT_REVIEW` and `APPROVE_REVIEW` take an
  empty payload. `RESUBMIT_REVIEW` takes only `{resolution}` (`check_payload`, latest in
  `017_documents_and_visits.sql`; builders in `src/case-actions.mjs`). The handlers `act_submit_review`,
  `act_resubmit_review` (`006_review.sql`) and `act_approve_review` (latest in `021_review_approved_message.sql`)
  run inside `vitally_apply_action`. Any raise there rolls back the whole call, receipt included.
- **Authority is already right.** The two preparer actions call `require_case_preparer`, and approval calls
  `require_case_reviewer`. The questionnaire needs no authority rule of its own.
- **Review history** is `public.reviews`: one row per attempt, presenter-only RLS, realtime. The case page
  renders it in `reviewPanel`/`reviewAttempts`, and the actions in `nextStep` (`src/staff-views.mjs`).
  `preparation_version` goes up by one on every hand-off (`hand_to_review`).
- **Office follow-ups** (`public.admin_followups`, 002) require a `request_id` pointing at a document request.
  Only `ESCALATE_CONTACT` creates one, assigned to `workspaces.default_followup_person_id`. The office screens
  show the request beside the task (`followupTask`, `src/admin-views.mjs`; the queue drawer in
  `src/office-views.mjs`).
- **The intake answer `service`** is in `cases.answers` as `same_day`, `drop_off` or `online`.
- **Stakeholders:**
  - PCDC volunteers (preparers, reviewers) and the office (admin team), who use these screens;
  - Jinyu, whose lifecycle chain (#73) rewrites the stage model and "Your next step".
- **Sequencing constraint.** Apply waits for the lifecycle chain (#73). The chain edits the same three stage
  functions and renames the stages. **This design and `plan.md` use today's stage names (`preparing`,
  `corrections_required`, `reviewing`, `review_ready`, `review_approved`). Once the chain merges, run
  `/opsx:update` to rename them in every artifact, then rebase the plan onto the chain's latest definitions of the
  three handlers.**
- The approved design and the code findings are in `brainstorm.md`.

## Goals / Non-Goals

**Goals:**

- A preparer questionnaire on `SUBMIT_REVIEW` and `RESUBMIT_REVIEW`, and a reviewer questionnaire (with the
  Exit Form fields) on `APPROVE_REVIEW`. Both are validated by the database: an invalid one refuses the action
  and changes nothing.
- One stored record per submission. Resubmission opens with the previous answers, and the reviewer sees the
  previous answers next to the new ones.
- The sign-8879 default follows `service`, and the appointment is asked only when it applies.
- 3 = No still approves and opens an office follow-up, worked with the existing office actions.
- Every staff member who can open the case sees the answers. A client can read none of them.

**Non-Goals:**

- The Exit Form PDF (change D). This change stores the fields it will need, nothing more. Tax year, date,
  client number and taxpayer name come from the case and are not stored again.
- The call log and the 3a/3b prefill from it (`add-call-log`).
- Any change to `RECORD_REVIEW_CONTACT`, `CLAIM_REVIEW` or `REQUEST_CORRECTIONS`.
- Importing TaxSlayer data. Client text, the intake catalogue and the stage model.
- Editing answers after the action. A questionnaire is answered once per hand-off.

## Decisions

### D1: The questionnaire travels in the action's own payload

- **Choice:** `SUBMIT_REVIEW` and `RESUBMIT_REVIEW` take `{ questionnaire }` (resubmit also keeps
  `resolution`). `APPROVE_REVIEW` takes `{ questionnaire }`. `check_payload` checks the shape and the
  conditional rules (D4), because they need no table. The handler then inserts the row and moves the stage in
  the same transaction.
- **Reason:** one call either does all of it or none of it. The existing receipt, revision and conflict
  handling apply unchanged, and the design's "an action without a valid questionnaire is refused and changes
  nothing" comes for free.
- **Alternatives considered:**
  - A separate `SAVE_QUESTIONNAIRE` action before the hand-off. Rejected: two calls can half-succeed, and they
    need a "draft questionnaire" state nobody asked for.
  - Columns on `reviews`. Rejected for the preparer side: a preparer submission exists before any review
    attempt does (claiming creates the attempt).

### D2: Two typed tables, Exit Form groups as checked `jsonb`

- **Choice:**
  - `public.preparer_questionnaires`. Columns:
    - `workspace_id`, `case_id`, `preparation_version`;
    - `submitted_by_person_id`, `created_at` (the store orders related rows by `created_at`);
    - `confirmed_by` (`client` | `spouse` | `other`) and `confirmed_by_name` (required only for `other`, at
      most 120 characters);
    - `confirmed_method` (`phone` | `in_person` | `text` | `email` | `video`);
    - `shaded_parts_completed` and `state_forgiveness_set`, both booleans that must be true;
    - `ready_for_review_on` (a date).

    Unique on (`case_id`, `preparation_version`). `preparation_version` is the version the hand-off creates.
  - `public.reviewer_questionnaires`. Columns:
    - `workspace_id`, `case_id`, `review_id` (unique; foreign key to `reviews`);
    - `answered_by_person_id`, `created_at`;
    - `completed_on` (a date);
    - `pa_forgiveness` (`eligible` | `not_eligible`);
    - `went_over` (boolean), `went_over_on` (a date), `went_over_how` (`in_person` | `phone` | `video` |
      `other`);
    - `sign_method` (`portal` | `in_person`), `sign_appointment_at` (`timestamp` without time zone: the
      site's wall-clock time, as the reviewer typed it, whole minutes);
    - `exit_form` (`jsonb`, D3);
    - `remarks` (text, at most 2000 characters, optional).
  - Both tables use the `case_materials` pattern: presenter-only select policy, writes only through the RPC,
    INSERT/UPDATE on the realtime publication.
  - Table checks repeat the simple rules as a backstop: `other` needs a name; `went_over` needs `went_over_on`;
    3b is only present with `went_over`.
- **Reason:** the fixed questions are few and stable, so typed columns give real constraints and readable SQL
  tests. Local repeats, and the three groups share one shape, so `jsonb` validated by one function
  (`vitally_private.check_exit_form`) avoids three near-identical child tables.
- **Alternatives considered:**
  - One `questionnaires` table with `kind` and an `answers jsonb`. Rejected: every rule becomes JSON
    plumbing, and the table checks are lost.
  - Child tables `exit_form_groups` and `exit_form_local`. Rejected: three tables for optional, write-once
    data that change D reads as a whole.

### D3: Exit Form shape

```json
{ "federal": Group | null, "state": Group | null, "local": [ LocalGroup, ... ] }
Group      = { "method": "efile"|"paper", "result": "refund"|"owe"|"none",
               "amount": "123.45"?,                      // required for refund/owe, absent for none
               "refundBy": "direct_deposit"|"check"?,     // required for refund only
               "oweBy": "direct_debit"|"mail_check"?,     // required for owe only
               "debitOn": "YYYY-MM-DD"? }                 // required for direct_debit only
LocalGroup = Group + { "type": "NPT"|"BIRT"|"EET"|"SIT"|"PAIBWTR" }
```

- **Rules:**
  - Every group is optional, and `local` may be empty.
  - A group, once present, needs `method` and `result`, plus whatever its result requires. It has no other keys.
  - Local types are unique within `local`, and `local` has at most five entries (one per type).
  - `amount` is a decimal string from `0.00` to `999999.99`, with zero to two decimal places. It is a string,
    so floating point never touches money.
- **Reason:** the form is the Exit Form, so its labels and branches are kept as the form says them. Being unique
  per type matches "one entry per type".

### D4: Validation lives in the database, mirrored in the browser

- **Choice:**
  - `check_payload` gets a branch per action. It checks the payload keys, the enums, the date formats
    (`YYYY-MM-DD`, a real calendar date) and the conditional rules: 1's name for `other`; 3a when 3 is Yes; 3b
    only when 3 is Yes; the Exit Form (D3).
  - Rules that need the case go in the handler:
    - the date windows (D6);
    - the appointment rule (5 is required when `sign_method = in_person` and the case's `service` is not
      `same_day`, and must be absent otherwise).
  - Every failure raises `VT007 VALIDATION`.
- The browser builder in `src/case-actions.mjs` applies the same rules first, so the volunteer sees a clear
  sentence instead of a refused call. The database stays the authority.
- **Alternatives considered:** checking only in the form. Rejected by the approved design ("enforced by the
  database RPC, not only the form").

### D5: Office follow-up for 3 = No reuses `admin_followups`

- **Choice:**
  - A migration adds `kind text not null default 'document' check (kind in ('document','go_over_return'))` and
    drops `NOT NULL` from `request_id`. A check requires `(kind = 'document') = (request_id is not null)`.
    Existing rows become `document`.
  - On approval with `went_over = false`, `act_approve_review` inserts a `go_over_return` task, assigned to
    `workspaces.default_followup_person_id`, with `created_by_person_id` set to the reviewer. The reason is
    fixed: "Go over the return with the client: the reviewer did not."
  - A missing or unqualified office person refuses the approval with `VALIDATION`, the same rule as
    `ESCALATE_CONTACT`.
  - `RECORD_CONTACT` and `RESOLVE_FOLLOWUP` work on it unchanged; `lock_open_followup` never reads
    `request_id`.
  - `CLOSE_CASE` already cancels every open task on the case.
- **Browser:**
  - `mapFollowup` passes `kind` through.
  - `followupTask` and the queue drawer show "Go over the return" with no document line when `requestId` is
    null.
  - The queue lists the task under the existing "follow-up" kind of row.
- **Reason:** the approved design says to reuse the office follow-up mechanism. The queue, the calls, the
  resolve action and the case-page panel all exist. Only the tie to a document request is in the way.
- **Alternatives considered:**
  - A second table `review_followups`. Rejected: it duplicates the queue, the drawer and both actions.
  - Pointing the task at a dummy document request. Rejected: it would show the client a fake request.

### D6: Dates and the sign-8879 default

- **Choice:**
  - "Defaults to today" is the browser's local date, filled into the date input.
  - The handler accepts a TaxSlayer date (preparer 4, reviewer 1, reviewer 3a) from 1 January of the case's
    `season` (the workspace's `current_season` if the case has none) up to the day after the server's date.
    The extra day absorbs time zones.
  - `debitOn` and the appointment have no window. The appointment must be a real date and time with zero
    seconds.
  - Reviewer 4's default is chosen in the view from `answers.service`: `same_day` → `in_person`, `online` →
    `portal`, `drop_off` or anything else → nothing selected. The database never enforces a default, because
    any channel may choose either.
- **Reason:** the window catches typos (a wrong year) without arguing with a volunteer about time zones.
- **Alternatives considered:** no date window. Rejected: a two-digit-year slip would be stored silently.

### D7: Resubmission prefill and the side-by-side view

- **Choice:**
  - The `RESUBMIT_REVIEW` form is rendered from the latest `preparer_questionnaires` row for the case. The
    TaxSlayer date resets to today, and the other answers are copied, with both confirmations shown ticked.
  - The review panel lists each preparation version's answers in its attempt, in order.
  - In `reviewing`, "Your next step" shows the current submission. When the current submission is not the first,
    it shows the previous one next to it, and a "Changed" mark highlights any answer that differs.
- **Reason:** "the form opens with the previous answers filled in" and "the reviewer can see the previous answers
  next to the new ones".
- **Showing and hiding without script:**
  - 3a/3b and the appointment sit in blocks that CSS `:has()` shows when "yes" or "in person" is checked.
  - The payload builder drops hidden answers that don't apply, so a stale value is never sent.
  - On a `same_day` case the appointment block is not rendered at all.
- **Local entries:** one collapsible entry per type (NPT, BIRT, EET, SIT, PAIBWTR), each optional, rather than
  an "Add" button. Uniqueness per type then holds by construction, with no dynamic form state in the
  controller. Federal and State are collapsible entries too. An entry counts as filled once any field in it
  has a value.
- **Note:** the two confirmations stay ticked in the prefill because they are the same declaration again. The
  preparer can untick and re-tick them, and the database still requires both to be true.

### D8: Fixtures seed fictional answers

- **Choice:**
  - `apply_fixture_scenario` deletes both new tables with the rest.
  - It seeds a preparer questionnaire per seeded preparation version for `review_ready` (version 1),
    `corrections_required` (version 1) and `review_approved` (versions 1 and 2).
  - For `review_approved` it also seeds a reviewer questionnaire with `went_over = true`, a Federal refund and
    one Local NPT entry.
  - All seeded values are fictional.
- **Reason:** seeded and played-through cases should look alike on the case page.

### D9: The 3a/3b prefill is not built here

- **Choice:** no call-log read. 3a/3b are typed by hand.
- **Note:** if `add-call-log` has merged by the time of the #73 `/opsx:update`, that update adds the prefill
  (from the latest call log entry with outcome "reached" **and** purpose "go over the tax return"). Otherwise
  `add-call-log` adds it.

## Risks / Trade-offs

- [Risk] The lifecycle chain (#73) renames the stages and rewrites the same handlers and "Your next step".
  Applying first would conflict everywhere. → Mitigation: apply is blocked until #73 merges. `/opsx:update`
  renames the stages in every artifact, and the plan's migration task is rewritten against the chain's
  latest handler definitions, never against `006`/`021`.
- [Risk] The RPC payload breaks: an old browser tab sends `{}` and is refused. → Mitigation: the refusal is
  `VALIDATION` with the usual "That did not go through" banner, and a reload fixes it. This is a classroom
  demo with no long-lived clients.
- [Risk] Making `admin_followups.request_id` nullable could break code that assumes a request. → Mitigation: the
  plan's audit task greps every `requestId`/`request_id` read on follow-ups. The view tests cover a follow-up
  with no request. The table check prevents a `document` task with no request.
- [Risk] The story (`tests/browser.mjs`, about 15 minutes) presses the three buttons. → Mitigation: the story's
  helpers fill the forms; the plan updates them in one task.
- [Risk] Historical ruling R28 (`006_review.sql`'s comment on `reviews`) says the review workflow holds no
  banking, refund or amount field. The approved design deliberately adds them, staff-only, for the Exit Form.
  → Mitigation: they live only in the presenter-only `reviewer_questionnaires`. No client message, client
  screen or `client_events` row mentions them, and the existing money-word checks on client messages and on
  the client window stay. The migration's header records the departure from R28.
- [Trade-off] Exit Form groups are `jsonb`, so SQL reports on them read JSON. → Accepted: change D reads the
  whole form, and no report needs a column.
- [Trade-off] Answers cannot be edited after the hand-off. → Accepted: a resubmission is the correction path on
  the preparer side, and the reviewer's answers belong to the approval itself.

## Migration Plan

- **One new migration,** numbered after the last on `main` when apply starts (031 today; probably later after
  #73). Every statement can be applied again:
  - the two tables, their RLS, grants and realtime publication;
  - the `admin_followups` change;
  - `check_exit_form`;
  - new definitions of `check_payload`, `act_submit_review`, `act_resubmit_review`, `act_approve_review` and
    `apply_fixture_scenario`, each copied from its latest definition with only the documented changes.
- **Existing data:**
  - existing follow-ups become `kind = document`;
  - existing reviews and submissions have no questionnaire, and the case page says "No questionnaire was
    recorded for this version." for them.
- **Rollback:** a forward migration that restores the empty payloads. Applied migrations are never edited.
- **Acceptance:**
  - the scenarios in `specs/`;
  - `npm test`;
  - `npm run db:migrate:test` then `npm run test:database`;
  - `npm run test:browser`;
  - `npx openspec validate --all`.
  - Not needed: `npm run build:hant -- --check` (no client text changes) and `test:auth-browser` (no sign-in
    changes).

## Open Questions

- **Stage names after #73.** Owner: Hailey, at the `/opsx:update` after the chain merges. It affects every stage
  check in the three handlers, the D5 approval path, and the `nextStep` cases.
- **The 3a/3b prefill.** Owner: whichever of this change and `add-call-log` lands second. It affects only the
  reviewer form's initial values.
