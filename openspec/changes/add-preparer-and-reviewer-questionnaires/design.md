## Context

- **Stage names.** This design uses #91's stage keys (unchanged) with its staff names:

  | Key | Staff name |
  |---|---|
  | `preparing` | Filing in progress (preparing) |
  | `corrections_required` | Corrections in progress |
  | `review_ready` | Pending review |
  | `reviewing` | Review in progress |
  | `review_approved` | Ready to exit |
  | `ready_to_efile` | Ready to e-file |

- **Today's hand-offs carry no record of what was checked.** `SUBMIT_REVIEW` and `APPROVE_REVIEW` take an
  empty payload. `RESUBMIT_REVIEW` takes only `{resolution}` (`check_payload`, newest in
  `032_screening_and_efiling_stages.sql`; builders in `src/case-actions.mjs`). The handlers `act_submit_review`,
  `act_resubmit_review` (`006_review.sql`) and `act_approve_review` (newest in `021_review_approved_message.sql`;
  #91 did not redefine it) run inside `vitally_apply_action`. Any raise there rolls back the whole call, receipt
  included.
- **Authority is already right.** The two preparer actions call `require_case_preparer`, and approval calls
  `require_case_reviewer`. The questionnaire needs no authority rule of its own.
- **Review history** is `public.reviews`: one row per attempt, presenter-only RLS, realtime. The case page
  renders it in `reviewPanel`/`reviewAttempts`, and the actions in `nextStep` (`src/staff-views.mjs`).
  `preparation_version` goes up by one on every hand-off (`hand_to_review`).
- **#91's gate on Mark ready to e-file.** `act_mark_ready_to_efile` (032) refuses unless the latest approved
  review's `client_contact_status` is `completed`. `adminEligibility.markReadyToEfile` mirrors it. It reads the
  list summary `reviewContactStatus` on a Follow-ups row and the approved review on a full case. Follow-ups'
  `signing` row at Ready to exit reads "Waiting for the reviewer's call with the client." until then.
- **Office follow-ups** (`public.admin_followups`, 002) require a `request_id` pointing at a document request.
  Only `ESCALATE_CONTACT` creates one, assigned to `workspaces.default_followup_person_id`. Since #88:
  - contacts on a task are contact-log entries linked by `contact_log.followup_id`, written by
    `vitally_log_contact`, which requires the task's assignee and an open task (`lock_open_followup`);
  - `RECORD_CONTACT` refuses every new request (031);
  - `RESOLVE_FOLLOWUP` is unchanged.

  #91's Follow-ups shows every case with an open task as one `call` row ("Call the client", the open-task count,
  **Log contact**). Its drawer and the case page's Follow-up tab draw each open task (`followupForms`;
  `followupTask` titles a task with its request's title, or "Contact the client").
- **The contact log's purposes** are `go_over_return`, `ask_question`, `request_documents`,
  `schedule_appointment` and `other`. The moved follow-up attempts became `request_documents` entries. Every
  contact-log time is America/New_York (`src/contact-log.mjs`).
- **The intake answer `service`** is in `cases.answers` as `same_day`, `drop_off` or `online`.
- **The client's Ready to exit message** is `stage.review_approved.client` in `src/client-text.mjs`, through
  `describeStage` (`src/domain.mjs`). The client reads its own `cases` row (`visible_cases`), never `reviews`.
- **Stakeholders:**
  - PCDC volunteers (preparers, reviewers) and the office (admin team), who use these screens;
  - clients, who read the Ready to exit message;
  - Jinyu, whose lifecycle chain continues after #91.
- The approved design and the code findings are in `brainstorm.md`. Its last section records this update.

## Goals / Non-Goals

**Goals:**

- A preparer questionnaire on `SUBMIT_REVIEW` and `RESUBMIT_REVIEW`, and a reviewer questionnaire (with the
  Exit Form fields) on `APPROVE_REVIEW`. Both are validated by the database: an invalid one refuses the action
  and changes nothing.
- One stored record per submission. Resubmission opens with the previous answers, and the reviewer sees the
  previous answers next to the new ones.
- The reviewer form prefills "went over the return" from the contact log.
- The sign-8879 default follows `service`, and the appointment is asked only when it applies.
- 3 = No still approves and opens an office follow-up, which the office works in Follow-ups and the contact log.
- The client's Ready to exit message says how and when they will sign.
- Every staff member who can open the case sees the answers. A client can read none of them.

**Non-Goals:**

- The Exit Form PDF (change D). This change stores the fields it will need, nothing more. Tax year, date,
  client number and taxpayer name come from the case and are not stored again.
- Removing `RECORD_REVIEW_CONTACT`, or any change to `CLAIM_REVIEW` or `REQUEST_CORRECTIONS`. An approval
  with a questionnaire settles the contact step (D10), and the action itself is unchanged.
- Importing TaxSlayer data, the intake catalogue, the stage model, and the approval's client history line.
- Editing answers after the action. A questionnaire is answered once per hand-off.
- Changing the Ready to exit variant after approval. For example, it does not change when the office goes over
  the return (D11).

## Decisions

### D1: The questionnaire travels in the action's own payload

- **Choice:** `SUBMIT_REVIEW` and `RESUBMIT_REVIEW` take `{ questionnaire }` (resubmit also keeps
  `resolution`). `APPROVE_REVIEW` takes `{ questionnaire }`. `check_payload` checks the shape and the
  conditional rules (D4), because they need no table. The handler then inserts the row and moves the stage in
  the same transaction.
- **Reason:** one call either does all of it or none of it. The existing receipt, revision and conflict
  handling apply unchanged, and the design's "an action without a valid questionnaire is refused and changes
  nothing" comes for free. No action type is added, so `vitally_apply_action` and `check_operation_authority`
  need no change (D12).
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
- **Payment details stored:** only the payment *method* (`direct_deposit`, `check`, `direct_debit`,
  `mail_check`), the amounts and the debit date. **Never an account number, a routing number or any other
  banking detail.** The shape has no key for one, and `check_exit_form` refuses any key outside D3, so a
  payload carrying one is refused.
- **This revises historical ruling R28.** R28 said the review workflow holds no banking, refund or amount
  field (`006_review.sql`, the comment on `reviews`). The PR must call this out so Jinyu and the group see
  it.
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

### D5: Office follow-up for 3 = No reuses `admin_followups`, with the contact log's purposes

- **Choice (database):**
  - A migration adds `purpose text not null default 'request_documents' check (purpose in
    ('request_documents','go_over_return'))` and drops `NOT NULL` from `request_id`. A check requires
    `(purpose = 'request_documents') = (request_id is not null)`. Existing rows become `request_documents`.
  - On approval with `went_over = false`, `act_approve_review` inserts a `go_over_return` task. It is assigned
    to `workspaces.default_followup_person_id`, and `created_by_person_id` is the reviewer. The reason is
    fixed: "Go over the return with the client: the reviewer did not."
  - A missing or unqualified office person refuses the approval with `VALIDATION`, the same rule as
    `ESCALATE_CONTACT`.
  - `act_escalate_contact` (004) is not redefined: the column default gives its tasks `request_documents`.
  - The office logs contacts on the task with `vitally_log_contact` (031, unchanged). `lock_open_followup`
    never reads `request_id`. The office resolves the task with `RESOLVE_FOLLOWUP` (004, unchanged).
  - `act_close_case` (032) already cancels every open task on the case. It cannot reach a go-over task anyway,
    because #91 refuses closing at Ready to exit.
- **Why `purpose`, not `kind`, and why these values:**
  - #91's Follow-ups already has row *kinds* (`intake`, `screening`, `signing`, `efiling`, `call`, `help`,
    `unclaimed`). A task column also called `kind` would mean something else in the same file.
  - #88's contact log already names why a contact happened, with `purpose`. A task's purpose is why the office
    contacts the client, so it uses the same column name and the same keys (`request_documents` and
    `go_over_return` are two of the log's five). The follow-up attempts #88 moved into the log are
    `request_documents` entries on `request_documents` tasks, so old data agrees with itself.
- **Browser:**
  - `mapFollowup` passes `purpose`.
  - **Follow-ups (#91):** a go-over task needs no new row kind. The case already gets its `call` row ("Call the
    client", the open-task count, **Log contact**) because it has an open task. It also keeps #91's `signing`
    row, which reads as Q1 decides.
  - **The drawer and the Follow-up tab:** `followupTask` titles a `go_over_return` task "Go over the return with
    the client", with no document line, and never reads `requestId` for it. The drawer's section heading is
    the task's reason, as for every task.
  - **The contact log (#88):** the Log contact form inside a task (`followupForms` → `logContactForm` with a
    `followupId`) starts with the task's purpose chosen: "Go over tax return" on a go-over task, "Request
    documents" on a document task. The persona can still choose another. The unlinked form in the Contacts tab
    still starts with no purpose chosen. This modifies one `staff-case-work` requirement.
- **Reason:** the approved design says to reuse the office follow-up mechanism. The queue, the drawer, the
  contact log, the resolve action and the case-page panel all exist. Only the tie to a document request is in
  the way.
- **Alternatives considered:**
  - A column `kind` (`document` | `go_over_return`), as first proposed. Rejected in this update: it clashes with
    Follow-ups' row kinds and repeats, in other words, what the contact log already calls a purpose.
  - A new Follow-ups row kind for go-over tasks. Rejected: the `call` row already lists every open task, and a
    second row would make the case appear three times (call, go-over, signing).
  - A second table `review_followups`. Rejected: it duplicates the queue, the drawer and the log's task link.
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

### D7: Form layout, resubmission prefill and the side-by-side view

- **Where the forms sit:** each form is inline in "Your next step", never in a dialog.
  - Filing in progress (`preparing`): the preparer form, then its submit button.
  - Corrections in progress (`corrections_required`): the resolution textarea, then the preparer form, then the
    resubmit button.
  - Review in progress (`reviewing`): first the comparison below, if any. Then the reviewer form, with the
    Approve button directly under it. "Ask the preparer for corrections" stays beside Approve and still opens
    its own dialog, as today. Only the questionnaire is never in a dialog.
- **Resubmission prefill:**
  - The `RESUBMIT_REVIEW` form is rendered from the latest `preparer_questionnaires` row for the case. The
    TaxSlayer date resets to today, and the other answers are copied, with both confirmations shown ticked.
  - The review panel lists each preparation version's answers in its attempt, in order.
- **The comparison:** in Review in progress, when the current submission is not the first, "Your next step"
  shows the previous submission next to the current one. A "Changed" mark highlights any answer that differs.
- **Reason:** "the form opens with the previous answers filled in" and "the reviewer can see the previous answers
  next to the new ones". Hailey asked for the reviewer form inline, above Approve.
- **Showing and hiding without script:**
  - 3a/3b and the appointment sit in blocks that CSS `:has()` shows when "yes" or "in person" is checked.
  - The payload builder drops hidden answers that don't apply, so a stale value is never sent.
  - On a `same_day` case the appointment block is not rendered at all.
- **The Exit Form groups are collapsible.** Federal, State, and one Local entry per type (NPT, BIRT, EET, SIT,
  PAIBWTR) are each a `<details>` element, closed by default and each optional. A Local entry per type, rather
  than an "Add" button, makes uniqueness per type hold by construction, with no dynamic form state in the
  controller. An entry counts as filled once any field in it has a value. A filled entry is rendered open
  after a refused submit, so the volunteer sees the field the sentence names.
- **Note:** the two confirmations stay ticked in the prefill because they are the same declaration again. The
  preparer can untick and re-tick them, and the database still requires both to be true.

### D8: Fixtures seed fictional answers

- **Choice:**
  - `apply_fixture_scenario` deletes both new tables with the rest. For every scenario it sets
    `signing_plan` and `signing_appointment_at` to null, except as below.
  - It seeds a preparer questionnaire per seeded preparation version for `review_ready` (version 1),
    `corrections_required` (version 1) and `review_approved` (versions 1 and 2).
  - For `review_approved` it also seeds:
    - a reviewer questionnaire with `went_over = true`, the Customer Portal, a Federal refund and one Local NPT
      entry;
    - the case's `signing_plan = 'portal'`;
    - its review-contact step completed, as D10 sets it, with outcome `reached`.
  - All seeded values are fictional.
- **Reason:** seeded and played-through cases should look alike on the case page and on the client's page.
- **Consequence:** today the seeded Ready to exit sample (031) has its call `pending`, so after #91 it shows "The
  reviewer still needs to record the conversation with the client." With this change it is seeded as a
  questionnaire approval (Yes), so it is at once eligible for Mark ready to e-file, like a played-through Yes
  approval. Fixture and view tests that expect the pending call on the sample move to a legacy case built
  directly (Task 4, `legacyApprovedCase`).

### D9: The reviewer form prefills "went over the return" from the contact log

- **Choice:** when the reviewer form opens, the view looks for the case's contact-log entries (current
  versions) with purpose `go_over_return` and outcome `reached`, in either direction, linked to a task or not.
  If there is one, the form starts with:
  - 3 = Yes;
  - 3a = the latest such entry's `contacted_at` date, in America/New_York (the log's zone);
  - 3b from its method: `in_person` → In person, `phone` → Phone, `video` → Video, `text` or `email` → Other.

  "Latest" means the latest contact time, not the latest logging. The reviewer can change any of it. With no
  such entry, 3, 3a and 3b start empty.
- **Where:** a pure helper `goOverPrefill(contacts)` in `src/questionnaires.mjs`, which receives the staff case's
  `contacts`. The store already loads them for a full staff case (#88). The database is not involved, and it
  validates the prefilled date like a typed one (D6).
- **Reason:** Hailey asked for the prefill now that #88 has merged. It works only from what the log already
  records, and a reached call for any other purpose prefills nothing, as the approved design says.
- **Alternatives considered:**
  - A server-side default. Rejected: the questionnaire is the reviewer's statement, and a default the reviewer
    never saw would put words in it.
  - Counting only outgoing entries. Rejected: a client who phones in and goes over the return has gone over it.

### D10: An approval with a questionnaire settles the review-contact step

- **Choice:**
  - `act_approve_review` no longer leaves `reviews.client_contact_status = 'pending'`. It sets `'completed'`
    either way, with `client_contacted_at = now()` (the approval time; `reviews_contacted` requires a time
    on a completed step).
  - On **yes**, `client_contact_outcome = 'reached'`. The questionnaire's date and how say when and how.
  - On **no**, `client_contact_outcome` stays null. The `go_over_return` follow-up (D5) takes the contact
    over.
  - `RECORD_REVIEW_CONTACT` is not removed or changed. It still refuses anything that is not pending
    (`INVALID_TRANSITION`), so after a questionnaire approval nobody is asked to record a conversation.
  - It still works on an approval from before this change that is still pending.
- **#91's Mark ready to e-file gate:**
  - **Yes satisfies it.** The step is `completed` at approval, so `act_mark_ready_to_efile` (032) accepts the
    move, and `adminEligibility.markReadyToEfile` and the Follow-ups `signing` row read "Waiting for the client
    to sign Form 8879." with **Mark ready to e-file…**, unchanged.
  - **No also satisfies it as 032 stands**, because the step is `completed` with no outcome. An admin could then
    mark the case ready to e-file while the office has not yet gone over the return. Hailey decides whether that
    is acceptable (Q1). This design adds nothing for No until then.
  - **A legacy pending approval** still shows #91's "The reviewer still needs to record the conversation with the
    client.".
- **Browser:** at Ready to exit, "Your next step" stops reading `clientContactStatus` alone when the approved
  attempt has a reviewer questionnaire:
  - on yes: "The reviewer went over the return with the client on <date>." Nothing further is needed here.
  - on no: "The office will go over the return with the client." The line links to nothing; the task is
    in Follow-ups.

  The review panel's "Client conversation" row reads the same way for a questionnaire attempt, instead of
  the outcome label.
- **Reason:** with the step left pending, a "no" asked both the reviewer and the office to contact the
  client. A "yes" asked the reviewer to record what the questionnaire had just recorded.
- **Consequence:** `RECORD_REVIEW_CONTACT` is now reachable only on a legacy approval. Its database tests, and
  #91's gate tests in `tests/database-stages.mjs` that record the call before marking, insert such a row
  directly or approve with a questionnaire. The browser story no longer records that conversation after its
  approval.
- **Alternatives considered:**
  - Remove `RECORD_REVIEW_CONTACT`. Rejected by Hailey: keep the action, just stop leaving it pending.
  - Set the status to null on approval. Rejected: the panel would read the step as never opened, rather
    than settled.
  - A new status `handed_to_office`. Rejected: it widens the checks on `reviews` for a fact the follow-up
    already holds.

### D11: The Ready to exit message says how the client will sign

- **Choice:**
  - Two client-readable columns on `cases`, set only by `act_approve_review`:
    - `signing_plan text`, null or one of `appointment`, `same_day`, `portal`, `go_over_first`;
    - `signing_appointment_at timestamp` (without time zone, the same wall-clock value as the questionnaire).

    A check requires `(signing_plan = 'appointment') = (signing_appointment_at is not null)`. The approval
    picks the plan in this order:
    1. `went_over = false` → `go_over_first`;
    2. `sign_method = 'portal'` → `portal`;
    3. `sign_method = 'in_person'` and `service = 'same_day'` → `same_day`;
    4. otherwise (in person, with the appointment D4 requires) → `appointment`, with the appointment copied.
  - The client's status panel at Ready to exit shows the variant for `signing_plan`, and today's message when it
    is null (an approval from before this change). `describeStage` gains an optional third argument, the case,
    so the variant comes from one place. Other stages ignore it.
  - **Wording** (built on #91's Ready to exit message; 繁體 generated by `npm run build:hant`):

    | Plan | English | 简体 |
    |---|---|---|
    | `appointment` | Your return has been checked. Please come to PCDC on {when} to sign Form 8879. It is needed before your return can be filed. | 您的报税表已检查完毕。请于 {when} 到 PCDC 签署 8879 表，签署后才能递交报税表。 |
    | `same_day` | Your return has been checked. Please sign Form 8879 with a volunteer before you leave today. It is needed before your return can be filed. | 您的报税表已检查完毕。请在今天离开前与志愿者一起签署 8879 表，签署后才能递交报税表。 |
    | `portal` | Your return has been checked. Please e-sign Form 8879 in the TaxSlayer Customer Portal. It is needed before your return can be filed. | 您的报税表已检查完毕。请在 TaxSlayer 客户门户（Customer Portal）以电子方式签署 8879 表，签署后才能递交报税表。 |
    | `go_over_first` | Your return has been checked. PCDC will contact you to go over your return with you, and then to sign Form 8879. It is needed before your return can be filed. | 您的报税表已检查完毕。PCDC 会联系您，先和您一起查看报税表，再请您签署 8879 表，签署后才能递交报税表。 |
    | none (before this change) | #91's message, unchanged | #91's message, unchanged |

  - **`{when}`** is the appointment's wall-clock date and time, formatted for the screen's language with
    `Intl.DateTimeFormat`, with options `{ weekday: "long", month: "long", day: "numeric", hour: "numeric",
    minute: "2-digit", hour12: true, timeZone: "UTC" }`: no year and no time zone. The parts are read as
    written and formatted in UTC, so the browser's zone can never move the time. The locales are `en-US`,
    `zh-CN` and `zh-Hant`. Checked on Node 24, they give "Monday, November 2 at 2:30 PM", "11月2日星期一 下午2:30"
    and "11月2日 星期一 下午2:30". `hour12: true` is needed, or `zh-CN` gives "14:30". The exact output is
    pinned in tests.
  - Client text keys: `stage.review_approved.client.appointment`, `.same_day`, `.portal`, `.go_over_first`,
    in `src/client-text.mjs` (English and 简体), then `npm run build:hant` and commit `src/zh-hant.mjs`.
  - The approval's client history line ("Your return has been checked by the reviewer. A volunteer will contact
    you soon to sign and file.", 021) is unchanged.
- **Reason:** Hailey asked for the four variants (tracked in #85). The client needs to know whether to come in,
  stay, or use the portal. The client may read neither questionnaire, so the case carries only the plan and the
  appointment, the two facts the message needs.
- **What the client can now read:** how they will sign, and their appointment. No amount, payment method,
  Exit Form field or other answer reaches the client. The `MONEY_WORDS` checks stay.
- **Trade-off:** the variant is fixed at approval. On `go_over_first`, it still reads correctly after the office
  goes over the return, because signing is still to come. It changes when the case moves to Ready to e-file.
- **Alternatives considered:**
  - Varying the approval's history line instead. Rejected: the status panel is where #91 tells the client what
    happens next, and a history line is a record of the past.
  - A client-readable view on `reviewer_questionnaires`. Rejected: one RLS mistake there would show amounts to
    the client. Two narrow columns cannot.
  - Updating the variant when the go-over task is resolved. Rejected for now: it needs `act_resolve_followup`
    redefined for a message that already reads correctly.

### D12: Shared functions this migration redefines, and where each is copied from

Each is copied verbatim from its newest definition on main (71e84d1), with only the lines marked `033` changed,
as 032 did.

| Function | Copied from | What 033 changes |
|---|---|---|
| `vitally_private.check_payload` | **032** | `SUBMIT_REVIEW` and `APPROVE_REVIEW` leave the empty-payload group (`CLAIM_PREPARATION`, `REMIND`, `CLAIM_REVIEW` and `START_SCREENING` stay). New branches for `SUBMIT_REVIEW`, `APPROVE_REVIEW` and `RESUBMIT_REVIEW`. Every other branch, including 032's `MARK_READY_TO_EFILE`/`MARK_EFILED`, is verbatim. |
| `vitally_private.act_submit_review` | 006 (its only definition) | the TaxSlayer date check and the questionnaire insert |
| `vitally_private.act_resubmit_review` | 006 (its only definition) | the same |
| `vitally_private.act_approve_review` | 021 (#91 did not redefine it) | the date and appointment checks, the reviewer insert, the D5 follow-up, the D10 contact step, the D11 signing plan; its client message is unchanged |
| `vitally_private.apply_fixture_scenario` | **031** (#88's, newest; #91 did not redefine it) | the D8 deletes, seeds and case columns; #88's contact-log lines kept |

**Not redefined:**
- `public.vitally_apply_action` (newest 032) and `vitally_private.check_operation_authority` (newest 032): no
  action type is added or regrouped.
- `act_mark_ready_to_efile` (032): unchanged until Q1 is decided. If Hailey accepts the proposal, it is copied
  from 032 too.
- `check_authority` (018), `check_related` (023), `act_escalate_contact`, `lock_open_followup` and
  `act_resolve_followup` (004), `act_record_review_contact` and `hand_to_review` (006), `act_close_case` (032),
  `fixture_history` (023), and #88's `vitally_log_contact` and `act_record_contact` (031).

Any function that turns out to need a change during apply follows the same rule. It is copied from its newest
definition, and this table is updated.

## Risks / Trade-offs

- [Risk] Another change redefines one of the functions in D12 and merges first. #90 (`add-staff-identity`)
  plans a migration too. → Mitigation: before apply and before the PR, merge main and re-run the D12 lookup
  (`grep -l "function …<name>(" supabase/migrations/*.sql`). Recopy any function whose newest definition moved,
  and renumber 033 to follow main's newest, with no gap.
- [Risk] The RPC payload breaks: an old browser tab sends `{}` and is refused. → Mitigation: the refusal is
  `VALIDATION` with the usual "That did not go through" banner, and a reload fixes it. This is a classroom
  demo with no long-lived clients.
- [Risk] Making `admin_followups.request_id` nullable could break code that assumes a request. → Mitigation: the
  plan's audit task greps every `requestId`/`request_id` read on follow-ups. The view tests cover a follow-up
  with no request. The table check prevents a `request_documents` task with no request.
- [Risk] #91's tests reach Ready to e-file through `f.approvedCase({ called })` (`tests/database-stages.mjs`, "ready
  to e-file waits for the reviewer's call"): they approve with `{}` and then record the call. → Mitigation:
  Task 4 makes `approvedCase` approve with a questionnaire (Yes), which meets the gate by itself. `called: false`
  becomes a legacy approval with its step pending, built directly. The gate test keeps its shape.
- [Risk] An appointment time in a client message could trip a "no phone number" check. → Mitigation: the
  client-text tests run #91's phone-number check over every variant with a sample appointment.
- [Risk] The story (`tests/browser.mjs`, about 15 minutes) presses the three buttons. → Mitigation: the story's
  helpers fill the forms; the plan updates them in one task.
- [Risk] Historical ruling R28 (`006_review.sql`'s comment on `reviews`) says the review workflow holds no
  banking, refund or amount field. The approved design deliberately revises it (D3): amounts, payment methods
  and debit dates are stored, staff-only, for the Exit Form. Account and routing numbers never are.
  → Mitigation: they live only in the presenter-only `reviewer_questionnaires`. No client message, client
  screen, `cases` column or `client_events` row mentions them, and the existing money-word checks on client
  messages and on the client window stay. The migration's header and the PR description both record the
  revision of R28.
- [Trade-off] Exit Form groups are `jsonb`, so SQL reports on them read JSON. → Accepted: change D reads the
  whole form, and no report needs a column.
- [Trade-off] Answers cannot be edited after the hand-off. → Accepted: a resubmission is the correction path on
  the preparer side, and the reviewer's answers belong to the approval itself.

## Migration Plan

- **One new migration, `033_review_questionnaires.sql`.** It is numbered exactly one after main's newest
  migration (032 today), never skipping a number. If #90 or anything else merges first and takes 033, it is
  renumbered to the new next number when main is merged in. Every statement can be applied again:
  - the two tables, their RLS, grants and realtime publication;
  - the `admin_followups` change;
  - the two `cases` columns and their check;
  - `check_exit_form` and the payload helpers;
  - the D12 functions.
- **Existing data:**
  - existing follow-ups become `purpose = request_documents`;
  - existing cases have no signing plan, so the client sees #91's Ready to exit message;
  - existing reviews and submissions have no questionnaire, and the case page says "No questionnaire was
    recorded for this version." for them.
- **Rollback:** a forward migration that restores the empty payloads. Applied migrations are never edited.
- **Acceptance:**
  - the scenarios in `specs/`;
  - `npm test`;
  - `npm run db:migrate:test` then `npm run test:database`;
  - `npm run test:browser`;
  - `npm run build:hant -- --check` (client text changes);
  - `npx openspec validate --all`, and `npm run build:intake` leaves nothing to commit.
  - Not needed: `test:auth-browser` (no sign-in changes).

## Open Questions

- **Q1. A No approval and Mark ready to e-file.** Owner: Hailey, before apply. It affects
  `act_mark_ready_to_efile`, `adminEligibility.markReadyToEfile`, the Follow-ups `signing` row, and one
  requirement in `office-follow-up`.

  **The problem.** D10 completes the review-contact step on No as well as on Yes, so #91's gate passes at once.
  An admin would be offered Mark ready to e-file while the office has not yet gone over the return with the
  client.

  **Claude's proposal:** Mark ready to e-file waits while the case has an open `go_over_return` follow-up.
  - **Database:** `act_mark_ready_to_efile` is copied from 032. After 032's contact-step check, it refuses with
    `INVALID_TRANSITION` while an `admin_followups` row on the case has `purpose = 'go_over_return'` and
    `status = 'open'`.
  - **Browser:**
    - `adminEligibility.markReadyToEfile` refuses with "The office still needs to go over the return with the
      client.";
    - the Follow-ups `signing` row reads "Waiting for the office to go over the return with the client.", with
      that explanation in place of the button;
    - list rows gain one summary, `goOverOpen`, from the existing grouped read of `admin_followups`.
  - **When the wait ends:** when the task is resolved, whatever the outcome, or cancelled.

  **Why:**
  - It is the same shape as #91's own rule: whoever is to contact the client finishes before the 8879 is
    recorded. Going over the return comes before signing in the VITA process, and the go-over task is that step.
  - It ends on any resolution, not only on "reached", because #91 refuses closing at Ready to exit until change
    3. A case whose client asks for no further contact would otherwise be stuck there with no way out.
  - It adds no state. The open task is already the fact.

  **Alternatives:**
  - No gate: leave it to the admin. That is simpler, but the `signing` row would invite marking a case nobody
    went over.
  - Leave the step pending on No. This contradicts Hailey's D10 ruling: the reviewer would be asked again.
  - End the wait only on a "reached" resolution. This is stricter, but it can strand a case at Ready to exit
    until change 3.
