# Brainstorm: add-preparer-and-reviewer-questionnaires

Agreed with Hailey on 2026-10-17 in the design conversation (CLAUDE.md §2, step 2). The first part of this file
is the approved design as agreed, kept in its own words. The last part, "Found in the code during propose", is
not part of the approval. It lists what reading the code showed and the calls Claude made because of it. Each
call is marked so it can be checked.

**Do not apply until Jinyu's lifecycle chain (#73) is merged.** This change edits `SUBMIT_REVIEW`,
`RESUBMIT_REVIEW` and `APPROVE_REVIEW`, the stage functions the chain also edits. Propose now, then run
`/opsx:update` for the chain's stage names before apply.

---

## Scope

**In:** a questionnaire the preparer answers when sending a return to review (and again on resubmit after
corrections), and one the reviewer answers when approving. The reviewer's includes the Exit Form fields.
Answers are stored per submission, validated by the database, and shown to staff on the case page.

**Out:** generating the Exit Form PDF (change D); the call log (its own change, `add-call-log`); replacing the
existing "Record this conversation" step (`RECORD_REVIEW_CONTACT` stays as it is); importing TaxSlayer reports.

## Preparer questionnaire: on `SUBMIT_REVIEW` and `RESUBMIT_REVIEW`

| # | Question | Answer | Rule |
|---|---|---|---|
| 1 | Who confirmed the intake information with you, and how | Person: client / spouse / other (+ name). Method: phone / in person / text / email / video | Required |
| 2 | I have completed the shaded parts of the 13614-C | Confirmation checkbox | Required: can't submit without it |
| 3 | Filing – PA State return: State Forgiveness set to Y | Confirmation checkbox | Required on every case (a reminder; missing it once caused a serious problem) |
| 4 | Date marked ready to review in TaxSlayer (TSO) | Date (no time) | Required; defaults to today |

**Resubmit after corrections:** the form opens with the previous answers filled in; the preparer edits what
changed and confirms. Every submission is kept; the reviewer can see the previous answers next to the new ones.

## Reviewer questionnaire: on `APPROVE_REVIEW`

| # | Question | Answer | Rule |
|---|---|---|---|
| 1 | Date marked completed in TaxSlayer (TSO) | Date (no time) | Required; defaults to today |
| 2 | Eligible for PA forgiveness (Schedule SP) | Eligible / Not eligible | Required |
| 3 | Did you go over the return with the taxpayer/spouse | Yes / No | Required |
| 3a | Date gone over with the client | Date | Required when 3 is Yes |
| 3b | How | In person / phone / video / other | Shown when 3 is Yes |
| 4 | How the client will sign Form 8879 | E-sign in the TaxSlayer Customer Portal / In person | Required. Default from the intake answer `service`: same-day → in person; online → Customer Portal; drop-off → no default. Any channel may choose either |
| 5 | Appointment to sign | Date and time (to the minute) | Shown when 4 is In person and `service` isn't same-day; required when shown |

**3 = No:** the reviewer can still approve; approving creates a follow-up for the office (admin team) to go
over the return with the client. Reuse the existing office follow-up mechanism.

**3a/3b prefill (only once `add-call-log` exists):** if the case's call log has an entry with outcome "reached"
**and** purpose "go over the tax return", prefill 3 = Yes and 3a/3b from the latest such entry. A call reached
for any other purpose prefills nothing. Without the call log, 3a/3b are typed by hand.

### Exit Form fields (same questionnaire)

Not asked, filled from the case: tax year, date, client number, taxpayer name.

Three groups, **all optional**: Federal, State, Local (the form's "Other Tax").
Each group, when filled in:
- Filing method: e-file / paper
- Result: refund / owe / none, plus amount
- Refund → direct deposit / check
- Owe → direct debit (with debit date) / mail check

Local adds a **type**, labelled as PCDC's volunteers say them: NPT, BIRT, EET, SIT, PAIBWTR (the Philadelphia
Wage Tax refund petition). A client can have more than one local filing,
so Local can be added more than once, one entry per type.

Plus **Remarks** (free text, optional).

## Rules

- **Who answers:** preparer questionnaire = the case's preparer; reviewer questionnaire = the case's reviewer.
  Same authority checks as the actions they ride on.
- **Who sees:** every staff member who can open the case sees both questionnaires' answers on the case page.
  Clients never (RLS).
- **Validation:** required answers and the conditional rules above are enforced by the database RPC, not only
  the form. An action without a valid questionnaire is refused and changes nothing.
- **Language:** staff screens are English (per CLAUDE.md); no client text changes.

## Dependencies

| Dependency | Status |
|---|---|
| Lifecycle chain (#73) | **Blocks apply**: same stage functions; stage names will change |
| `add-call-log` | Optional: only the 3a/3b prefill; works without it |
| Intake answer `service` (same_day / drop_off / online) | Ready |
| Office follow-up mechanism (for 3 = No) | Ready (existing) |

## Acceptance

- A preparer can't send a return to review without answering 1–4; with them, the case moves on and the answers
  appear on the case page.
- After corrections, resubmitting opens the form prefilled; both submissions are kept and visible.
- A reviewer can't approve without 1–4 (and 3a, and 5 when shown); 4's default follows `service`.
- 3 = No approves and creates an office follow-up.
- Exit Form groups are optional; a filled group needs its method and result; Local accepts several entries,
  each with a type.
- A client session can't read either questionnaire (database test).
- Checks: `npm test`; `npm run db:migrate:test` + `npm run test:database`; `npm run test:browser`.

## Open questions

None. (Settled: local-tax labels are NPT, BIRT, EET, SIT, PAIBWTR, as PCDC uses them; the appointment is a date
and time.)

---

## Found in the code during propose (not part of the approval)

Read on origin/main at 9992aab. The plan builds on these facts.

### What exists today

- **The three actions carry almost nothing.** `check_payload` (latest in `017_documents_and_visits.sql`)
  requires an empty payload for `SUBMIT_REVIEW` and `APPROVE_REVIEW`, and exactly `{resolution}` for
  `RESUBMIT_REVIEW`. `src/case-actions.mjs` builds `{}`, `{}` and `{resolution}`. The handlers are
  `act_submit_review`, `act_resubmit_review` (both `006_review.sql`) and `act_approve_review` (latest in
  `021_review_approved_message.sql`). All three run inside `vitally_apply_action`, so any raise rolls back
  everything, the reserved receipt included. That already gives "refused and changes nothing".
- **Authority already matches the design's rule.** `act_submit_review`/`act_resubmit_review` call
  `require_case_preparer`, and `act_approve_review` calls `require_case_reviewer`. The questionnaire rides on the
  same calls, so it adds no authority check of its own.
- **Review attempts live in `public.reviews`**, one row per attempt, presenter-only RLS
  (`presenter_reviews`), realtime-published, loaded into the staff case by `src/supabase-store.mjs`
  (`STAFF_TABLES`, `mapStaffCase`). New questionnaire tables follow the same pattern (the `case_materials`
  block in `013_contact_materials.sql` is the most recent copy of it).
- **`preparation_version`** goes up by one on every hand-off (`hand_to_review`), so it is the natural key for
  "one preparer questionnaire per submission".
- **The case page** shows review history in `reviewPanel`/`reviewAttempts` (`src/staff-views.mjs`), and the
  actions in `nextStep`. `SUBMIT_REVIEW` and `APPROVE_REVIEW` are plain buttons today; `RESUBMIT_REVIEW` is a
  one-textarea form.
- **The intake answer `service`** is stored in the case's answers with the codes `same_day`, `drop_off` and
  `online` (catalogue; `isSameDay` in `src/intake-form.mjs`).
- **Office follow-ups (`public.admin_followups`, 002) are tied to a document request.** `request_id` is
  `NOT NULL`, with a foreign key to `document_requests`. `ESCALATE_CONTACT` is the only action that creates
  one; it assigns the workspace's `default_followup_person_id`. The office screens read `task.requestId` to
  show the request (`followupTask` in `src/admin-views.mjs`). So "reuse the existing mechanism" for 3 = No is
  not ready as it stands. It needs a schema change.
- **Fixtures** (`apply_fixture_scenario`, `019_fixtures_v2.sql`) seed `review_ready`, `corrections_required` and
  `review_approved` cases with review rows but no questionnaire, because none exists yet.
- **No call log exists.** `add-call-log` is not on main.

### Claude's calls (check these)

1. **The questionnaire travels in the action's payload**, not in a separate RPC. One call checks it, stores
   it and moves the stage, so a refused questionnaire cannot leave a half-done hand-off.
2. **Two new tables**: `preparer_questionnaires` (one row per case and `preparation_version`) and
   `reviewer_questionnaires` (one row per approved `reviews` row). Typed columns for the fixed questions. The
   Exit Form groups go in one `jsonb` column whose shape the RPC checks, because Local repeats.
3. **Office follow-up for 3 = No:** a new migration makes `admin_followups.request_id` nullable and adds
   `kind` (`document` | `go_over_return`). A check ties `request_id` to `kind = document`. The task goes to
   the same configured office person `ESCALATE_CONTACT` uses. The office resolves it with the existing
   `RECORD_CONTACT`/`RESOLVE_FOLLOWUP`. If no office person is configured, the approval is refused (`VALIDATION`),
   as `ESCALATE_CONTACT` is today.
4. ~~**`RECORD_REVIEW_CONTACT` is untouched**, so on a 3 = No approval the reviewer's own "Record this
   conversation" step still opens as today, next to the office task.~~ Revised by Hailey after propose
   (below).
5. **"Defaults to today"** means the browser's local date, filled into the form. The database accepts any real
   calendar date no later than tomorrow (to allow for time zones) and no earlier than 1 January of the case's
   season. The appointment to sign is any real date and time, with no check that it is in the future.
6. **The 3a/3b prefill is not built here.** `add-call-log` does not exist. If it has merged by the time this
   change is updated for #73, `/opsx:update` adds the prefill. Otherwise `add-call-log` adds it.
7. **Fixtures:** the `review_ready`, `corrections_required` and `review_approved` samples get fictional
   preparer questionnaires (and `review_approved` a reviewer questionnaire), so the seeded cases look the same
   as ones played through.
8. **Amounts:** whole dollars or dollars and cents, 0 to 999,999.99. They are required when the result is refund
   or owe, and absent when it is none.

### Revisions by Hailey after propose (2026-10-17)

- **Call 8 (call 4 above):** two people must not be asked to contact the client. An approval with a
  questionnaire marks the existing review-contact step done either way. On Yes, the questionnaire already
  records it; on No, the office follow-up takes over. Don't remove `RECORD_REVIEW_CONTACT`; just stop
  leaving it pending after an approval with a questionnaire. (design D10)
- **Call 2:** the Exit Form stores only the payment method (direct deposit / check / direct debit / mail
  check), the amounts and the dates. It never stores account or routing numbers. This revises ruling R28,
  and the PR calls that out. (design D3)
