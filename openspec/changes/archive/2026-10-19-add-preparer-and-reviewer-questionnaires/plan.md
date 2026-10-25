# Preparer and Reviewer Questionnaires Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `SUBMIT_REVIEW`, `RESUBMIT_REVIEW` and `APPROVE_REVIEW` each carry a questionnaire. The database validates and stores it, and staff see the answers on the case page. An approval with "did not go over the return" opens an office follow-up, and the client's Ready to exit message says how and when they will sign.

**Architecture:**
- The questionnaire travels inside the existing action payload, so `vitally_apply_action` checks it, stores it and moves the stage in one transaction (design D1).
- Answers go into two new presenter-only tables (design D2). The Exit Form groups go in one checked `jsonb` column (D3).
- `admin_followups` gains a `purpose` in the contact log's words, so a follow-up need not name a document request (D5).
- The browser builds the payload from flat form names, mirrors the database's rules, and renders the forms inline with CSS-only show/hide (D4, D7). It prefills "went over the return" from the contact log (D9).
- The approval stores a client-readable signing plan on the case, and the client's status panel shows its variant (D11).

**Tech Stack:** PostgreSQL / Supabase (plpgsql, RLS, realtime), plain ES modules (`src/*.mjs`), `node:test`, Playwright (`tests/browser.mjs`).

**Spec:** `openspec/changes/add-preparer-and-reviewer-questionnaires/`. Read `design.md` (D1–D13) with this plan, and these four delta specs:
- `specs/review-and-corrections/spec.md`;
- `specs/office-follow-up/spec.md`;
- `specs/case-lifecycle/spec.md`;
- `specs/staff-case-work/spec.md`.

`brainstorm.md` holds the approved design and, in its last section, this update's instructions.

## Global Constraints

- **Design Q1 is ruled** (2026-10-19, design D13): Mark ready to e-file waits while the case has an open `go_over_return` follow-up, until it is resolved with any outcome. Task 4a builds it.
- **Stages** use #91's stored keys with its staff names: `preparing` Filing in progress (preparing), `corrections_required` Corrections in progress, `review_ready` Pending review, `reviewing` Review in progress, `review_approved` Ready to exit, `ready_to_efile` Ready to e-file.
- **Migrations are hand-written and final once applied.**
  - Add one new file, `supabase/migrations/033_review_questionnaires.sql`. It is numbered exactly one after main's newest migration, never skipping a number.
  - If #90 or anything else merges first and takes 033, renumber when main is merged in (Task 1), so the sequence stays without gaps.
  - Never edit an existing migration. Every statement can be applied again (`if not exists`, `create or replace`, drop-then-add).
- **Copy each re-created function verbatim from its newest definition** (design D12), and mark every changed line `-- 033`, as 032 does:
  - `check_payload` from 032;
  - `act_submit_review` and `act_resubmit_review` from 006;
  - `act_approve_review` from 021;
  - `apply_fixture_scenario` from 031;
  - `act_mark_ready_to_efile` from 032 (Task 4a).

  `vitally_apply_action` and `check_operation_authority` (newest 032) are **not** redefined. Keep every client message string as it is.
- **Fictional data only** in fixtures and tests.
- **Staff screens are English.** The only client text is the four Ready to exit variants (D11), in `src/client-text.mjs` (English and 简体), then `npm run build:hant`, committing `src/zh-hant.mjs`. The intake catalogue is unchanged.
- **No client message, `client_events` row, `cases` column or client screen may mention any answer, amount or payment method.** The client reads only `cases.signing_plan` and `cases.signing_appointment_at`. The existing `MONEY_WORDS` checks stay green.
- **Every validation failure is `raise sqlstate 'VT007' using message='VALIDATION'`.**
- **Payload keys are exactly these** (database and browser):
  - Preparer `questionnaire`: `confirmedBy` (`client`|`spouse`|`other`), `confirmedByName` (only with `other`, 1–120 chars after trim), `confirmedMethod` (`phone`|`in_person`|`text`|`email`|`video`), `shadedPartsCompleted` (`true`), `stateForgivenessSet` (`true`), `readyForReviewOn` (`YYYY-MM-DD`).
  - Reviewer `questionnaire`: `completedOn` (`YYYY-MM-DD`), `paForgiveness` (`eligible`|`not_eligible`), `wentOver` (boolean), `wentOverOn` (only with `wentOver` true, required then), `wentOverHow` (only with `wentOver` true, optional: `in_person`|`phone`|`video`|`other`), `signMethod` (`portal`|`in_person`), `signAppointmentAt` (`YYYY-MM-DDTHH:MM`, site wall-clock time), `exitForm` (`{federal, state, local}`), `remarks` (optional, 1–2000 chars).
  - `SUBMIT_REVIEW` and `APPROVE_REVIEW` take `{questionnaire}`. `RESUBMIT_REVIEW` takes `{questionnaire, resolution}`.
- **The Exit Form stores only payment methods, amounts and the debit date, never an account number, routing number or other banking detail** (design D3). This revises ruling R28, and the PR description must say so.
- **An approval with a questionnaire never leaves the review-contact step pending** (design D10). `RECORD_REVIEW_CONTACT` is kept unchanged.
- **The Exit Form shape is design D3, exactly.** The amount pattern is `^(0|[1-9][0-9]{0,5})(\.[0-9]{1,2})?$`. Local types are `NPT`, `BIRT`, `EET`, `SIT`, `PAIBWTR`.
- **Follow-up purposes** are `request_documents` and `go_over_return`, the contact log's keys (D5). Follow-ups' row kinds (`call`, `signing`, …) are a separate thing and are not changed.
- **The reviewer form is inline in "Your next step", directly above Approve, never in a dialog.** The Exit Form groups are collapsible `<details>` (D7).
- **Fixed strings:**
  - follow-up reason: `Go over the return with the client: the reviewer did not.`;
  - follow-up title: `Go over the return with the client`;
  - the D13 wait: `The office still needs to go over the return with the client.` (the admin's explanation) and `Waiting for the office to go over the return with the client.` (the Follow-ups `signing` row);
  - empty answers: `No questionnaire was recorded for this version.`;
  - the four Ready to exit variants: design D11, exactly.
- **Checks to run:**
  - `npm test`;
  - `npm run db:migrate:test` then `npm run test:database`;
  - `npm run test:browser`;
  - `npm run build:hant -- --check`;
  - `npx openspec validate --all`, and `npm run build:intake` leaves nothing to commit.

  `test:auth-browser` is not needed: no sign-in changes.
- **Tracking:** the PR says "Part of #85" and never Fixes/Closes/Resolves.

## Review Focus

1. **An answer that is hidden but still filled in** (3 = No after a date was typed; Portal after an appointment was typed) must not be sent. Otherwise the database refuses a valid approval. Tests: Task 6 `drops hidden went-over answers` and `drops the appointment when not in person`.
2. **A whitespace-only "other" name or remarks** must count as empty, in the builder and in the database. Tests: Task 6 `blank other name is refused`; Task 3 `whitespace remarks refused`.
3. **An Exit Form entry with only an amount typed** (no method or result) must give a clear sentence, not be silently dropped or sent half-built, and its `<details>` must be open when the form is shown again. Tests: Task 6 `half-filled Local entry names the entry`; Task 7 `a filled group stays open`.
4. **A resubmit on a case whose earlier version has no questionnaire** (reviewed before this change) must open the form blank with today's date, not crash. Test: Task 7 `resubmit with no earlier questionnaire`.
5. **A `go_over_return` task in every follow-up view** (queue row, drawer, case panel, count) must never read `task.requestId` as if it were set. Test: Task 8 `follow-up with no request renders`.
6. **The prefill's date is New York's,** not the browser's or UTC. A go-over call at 10:30 PM New York time on 10/14 is 10/15 in UTC. Test: Task 6 `goOverPrefill uses the New York date`.
7. **The appointment is wall-clock time.** A client browser in another zone must show the time the reviewer typed. Test: Task 8a `appointment text ignores the time zone` (run with `TZ=Asia/Shanghai`).
8. **#91's gate:** a Yes approval reaches Ready to e-file with no `RECORD_REVIEW_CONTACT`. Test: Task 4 `yes meets the ready-to-e-file gate`.
9. **The D13 wait ends on any resolution,** not only "reached", and a Yes approval is never held up by it. Tests: Task 4a `the wait ends when the go-over is resolved: reached / no_further_contact` and `a yes approval is not held up`.

---

### Task 1: Gate and renumber

**Files:** none changed except, possibly, this change's artifacts and the migration's name.

- [x] **Step 1:** #91 is merged into `main`, and main (71e84d1) is merged into this branch. `/opsx:update` brought the artifacts up to date (tasks 1.1, 1.2).
- [x] **Step 2:** Hailey's ruling on design Q1 is written into design D13, the `case-lifecycle` delta spec and Task 4a (tasks 1.3).
- [x] **Step 3:** Run `git fetch origin && git merge origin/main`, then `ls supabase/migrations | tail -1`. The migration is one after that number. If it is no longer 033, rename it everywhere in this plan, in design.md and in tasks.md.
- [x] **Step 4:** For every function in design D12, run `grep -l "function [a-z_.]*\b<name>(" supabase/migrations/*.sql | tail -1`. If any newest definition is no longer the file D12 names, update D12 and copy from the new one.
- [x] **Step 5:** Tick task 1.4 in `tasks.md` and commit: `git commit -am "Questionnaires: main merged; migration numbered after main's newest"`.

### Task 2: Tables, RLS, the follow-up purpose and the signing plan

**Files:**
- Create: `supabase/migrations/033_review_questionnaires.sql`, sections 1–4. The header names design D2/D5/D11, the R28 departure, and the D12 table of copied functions.
- Test: `tests/database-review.mjs` (new `test(...)` blocks at the end), `tests/database-realtime.mjs`.

**Interfaces:**
- Produces:
  - `public.preparer_questionnaires`. Columns: `id uuid pk`, `workspace_id`, `case_id`, `preparation_version bigint check (>=1)`, `submitted_by_person_id`, `confirmed_by`, `confirmed_by_name`, `confirmed_method`, `shaded_parts_completed boolean check (= true)`, `state_forgiveness_set boolean check (= true)`, `ready_for_review_on date`, `created_at timestamptz default now()`. Unique (`case_id`, `preparation_version`). Check `(confirmed_by = 'other') = (confirmed_by_name is not null)`.
  - `public.reviewer_questionnaires`. Columns: `id uuid pk`, `workspace_id`, `case_id`, `review_id uuid unique`, `answered_by_person_id`, `completed_on date`, `pa_forgiveness`, `went_over boolean`, `went_over_on date`, `went_over_how`, `sign_method`, `sign_appointment_at timestamp`, `exit_form jsonb not null`, `remarks`, `created_at`. FK (`workspace_id`, `case_id`, `review_id`) → `reviews(workspace_id, case_id, id)`. Checks: `went_over = (went_over_on is not null)`; `went_over or went_over_how is null`; `sign_appointment_at is null or date_trunc('minute', sign_appointment_at) = sign_appointment_at`.
  - `admin_followups.purpose text not null default 'request_documents' check (purpose in ('request_documents','go_over_return'))`, `request_id` nullable, and constraint `admin_followups_purpose_request check ((purpose = 'request_documents') = (request_id is not null))`.
  - `cases.signing_plan text check (signing_plan in ('appointment','same_day','portal','go_over_first'))`, `cases.signing_appointment_at timestamp`, and constraint `cases_signing_appointment check ((signing_plan = 'appointment') = (signing_appointment_at is not null))`. Both are null by default. No RLS change: `visible_cases` already lets the client read its own row.
  - Both new tables get `presenter_<table>` select policies copied from `presenter_case_materials` (013), the same revoke/grant lines, and the 013 realtime `do $$` block.

- [x] **Step 1: Write the failing database tests**

```js
test("questionnaire tables are staff-only", async () => {
  // seed one row in each table with f.sql as service role on a prepared case
  assert.deepEqual(await f.selectAs(f.applicant, "preparer_questionnaires", caseId), []);
  assert.deepEqual(await f.selectAs(f.applicant, "reviewer_questionnaires", caseId), []);
  assert.equal((await f.selectAs(f.presenter, "preparer_questionnaires", caseId)).length, 1);
});
test("questionnaire table checks", async () => {
  await assert.rejects(() => insertPreparer({ confirmed_by: "other", confirmed_by_name: null }));
  await assert.rejects(() => insertReviewer({ went_over: true, went_over_on: null }));
  await assert.rejects(() => insertReviewer({ went_over: false, went_over_how: "phone" }));
});
test("follow-ups have a purpose", async () => {
  // existing escalation → purpose 'request_documents' with request_id
  // insert purpose 'go_over_return' with a request_id → rejects; 'request_documents' with none → rejects
});
test("the signing plan is the client's to read", async () => {
  // set signing_plan 'appointment' with no time → rejects; 'portal' with a time → rejects
  // the applicant who owns the case reads signing_plan and signing_appointment_at on their own row
});
```

  Use whatever the fixture offers for reading as a principal (`tests/support/database-fixture.mjs`). If no `selectAs`-style helper exists, add one there. Add both table names to the realtime publication assertions in `tests/database-realtime.mjs`, in the style of the `reviews` case.
- [x] **Step 2:** Run `npm run test:database`. Expected: the new tests FAIL (relation or column does not exist).
- [x] **Step 3:** Write sections 1–4 of the migration, as in Interfaces.
- [x] **Step 4:** Run `npm run db:migrate:test` and then `npm run test:database`. Expected: the new tests pass, and the rest stay green.
- [x] **Step 5:** Commit: `git add supabase/migrations/033_review_questionnaires.sql tests/ && git commit -m "Questionnaires: staff-only tables, the follow-up purpose and the signing plan"`.

### Task 3: Payload validation

**Files:**
- Modify: `supabase/migrations/033_review_questionnaires.sql`, section 5.
- Test: `tests/database-review.mjs`.

**Interfaces:**
- Produces:
  - `vitally_private.payload_date(p jsonb, key text) returns date`, immutable. It returns null unless the value is a string matching `^\d{4}-\d{2}-\d{2}$` that is a real calendar date. Catch the cast error.
  - `vitally_private.payload_minute(p jsonb, key text) returns timestamp`, the same for `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$`.
  - `vitally_private.check_exit_form(p jsonb) returns boolean`, immutable, design D3.
  - `vitally_private.check_preparer_questionnaire(q jsonb) returns boolean` and `vitally_private.check_reviewer_questionnaire(q jsonb) returns boolean`, both immutable. They check keys, enums, dates and the conditional rules in Global Constraints. They do **not** check the date window or the appointment rule.
  - `check_payload`, re-created verbatim **from 032** with:
    - `SUBMIT_REVIEW` and `APPROVE_REVIEW` removed from the empty-payload group, which keeps `CLAIM_PREPARATION`, `REMIND`, `CLAIM_REVIEW` and `START_SCREENING`;
    - new branches `SUBMIT_REVIEW` (keys `['questionnaire']`) and `APPROVE_REVIEW` (keys `['questionnaire']`), each calling its checker;
    - the `RESUBMIT_REVIEW` branch: keys `['questionnaire','resolution']`, plus the existing resolution check;
    - every other branch verbatim, including 032's `MARK_READY_TO_EFILE`/`MARK_EFILED`.
  - The helpers get `revoke all … from public, anon, authenticated, service_role`, as in `023`.

- [x] **Step 1: Write the failing tests.** Add `PREPARER` and `REVIEWER` constants (valid payloads, dates `new Date().toISOString().slice(0, 10)`) and change `REVIEW_PAYLOADS` to use them. Then add one table-driven test per checker. Each entry asserts `rejected("VALIDATION")`, with the stage and revision unchanged after it:

```js
const BAD_PREPARER = {
  "missing method": without(PREPARER, "confirmedMethod"),
  "unticked shaded": { ...PREPARER, shadedPartsCompleted: false },
  "unticked forgiveness": { ...PREPARER, stateForgivenessSet: false },
  "other without name": { ...PREPARER, confirmedBy: "other" },
  "name without other": { ...PREPARER, confirmedByName: "Pat Example" },
  "impossible date": { ...PREPARER, readyForReviewOn: "2026-02-30" },
  "extra key": { ...PREPARER, note: "x" },
};
const BAD_REVIEWER = {
  "yes without date": { ...REVIEWER, wentOver: true },
  "no with how": { ...REVIEWER, wentOver: false, wentOverHow: "phone" },
  "appointment seconds": { ...REVIEWER, signMethod: "in_person", signAppointmentAt: "2026-11-02T14:30:15" },
  "whitespace remarks refused": { ...REVIEWER, remarks: "   " },
  "refund without amount": exit({ federal: { method: "efile", result: "refund", refundBy: "check" } }),
  "none with amount": exit({ federal: { method: "paper", result: "none", amount: "1" } }),
  "debit without date": exit({ state: { method: "efile", result: "owe", amount: "45.50", oweBy: "direct_debit" } }),
  "amount three decimals": exit({ federal: { method: "efile", result: "owe", amount: "1.005", oweBy: "mail_check" } }),
  "duplicate local": exit({ local: [sit, sit] }),
  "unknown local type": exit({ local: [{ ...sit, type: "XYZ" }] }),
  "banking detail": exit({ federal: { method: "efile", result: "refund", amount: "10", refundBy: "direct_deposit", accountNumber: "000123" } }),
  "routing number": exit({ federal: { method: "efile", result: "refund", amount: "10", refundBy: "direct_deposit", routingNumber: "000000000" } }),
  "old empty payload": null, // send {} itself
};
```

  Also add accepted cases: no Exit Form groups; NPT owe 120.00 by mail check plus BIRT paper none; amount `0`; amount `999999.99`. Add one check that `START_SCREENING` still takes `{}` and `MARK_READY_TO_EFILE` still takes `{confirmed: true}`, so the 032 branches survived the copy.
- [x] **Step 2:** Run `npm run db:migrate:test && npm run test:database`. Expected: the new tests FAIL, because today's empty-payload rule rejects the valid payloads.
- [x] **Step 3:** Implement section 5 as in Interfaces.
- [x] **Step 4:** Run `npm run db:migrate:test && npm run test:database`. Expected: the validation tests pass. The handler-storage tests from Task 4 don't exist yet. Existing review tests pass, now with the new payloads.
- [x] **Step 5:** Commit: `git commit -am "Questionnaires: the database checks each payload"`.

### Task 4: The three handlers, the go-over follow-up and the signing plan

**Files:**
- Modify: `supabase/migrations/033_review_questionnaires.sql`, section 6.
- Test: `tests/database-review.mjs`, `tests/database-stages.mjs`, `tests/database-contacts.mjs`, `tests/support/database-fixture.mjs` (`approvedCase`).

**Interfaces:**
- Consumes: Task 3's helpers and payload keys.
- Produces:
  - `vitally_private.check_taxslayer_date(p_case public.cases, d date) returns void`. It raises VALIDATION unless `make_date(coalesce(case.season, workspace.current_season), 1, 1) <= d <= current_date + 1`.
  - `act_submit_review` / `act_resubmit_review`, copied from 006, keep their checks in today's order. After `hand_to_review` returns `v_version`, they call `check_taxslayer_date` and insert one `preparer_questionnaires` row at `v_version`.
  - `act_approve_review`, copied from 021. After `lock_active_review`, it:
    - checks `completedOn` and `wentOverOn` with `check_taxslayer_date`;
    - applies the appointment rule against `p_case.answers->>'service'` (required when `signMethod = 'in_person'` and service ≠ `same_day`, absent otherwise);
    - inserts the reviewer row;
    - when `wentOver` is false, finds the office person exactly as `act_escalate_contact` (004) does, and inserts an `admin_followups` row (`purpose 'go_over_return'`, `request_id null`, the fixed reason, `created_by_person_id` = the reviewer);
    - updates the review to `status 'approved'`, `decided_at now()`, `client_contact_status 'completed'`, `client_contacted_at now()`, and `client_contact_outcome` `'reached'` on yes or null on no (design D10), in place of today's `client_contact_status 'pending'`;
    - sets `cases.stage = 'review_approved'` and, in the same update, `signing_plan` and `signing_appointment_at` by D11's order: `go_over_first` when not gone over; else `portal`; else `same_day` for a same-day case; else `appointment` with the appointment.
  - `act_record_review_contact` is not re-created. Its pending check refuses it after such an approval. #91's gate accepts a Yes approval because the step is `completed`. (`act_mark_ready_to_efile` gains the D13 wait in Task 4a.)
  - The returned `detail` of each handler gains nothing. Answers never go into history, and the approval's client message (021) is unchanged.
  - Test support: `f.approvedCase()` approves with a valid reviewer questionnaire (Yes). `f.approvedCase({ called: false })` becomes `f.legacyApprovedCase()`: it inserts an approved review with `client_contact_status 'pending'` and no questionnaire, directly through `f.sql`.

- [x] **Step 1: Write the failing tests**

```js
test("a valid submit stores one questionnaire at the new version", …) // version 1 row, confirmed_method 'phone'
test("resubmit keeps both submissions", …)        // rows at versions 1 and 2, each as sent
test("a refused submit changes nothing", …)       // stage, revision, preparation_version, receipt count, row count unchanged
test("ready date before the season is refused", …) // `${season - 1}-12-31` → VALIDATION
test("drop-off in person needs an appointment", …) // answers.service 'drop_off'
test("same-day in person refuses an appointment", …) // and accepts none
test("online may sign in person", …)
test("approval with no opens one go-over follow-up", …) // purpose, request_id null, assignee = workspace default, reason text
test("approval with yes opens none", …)
test("no office person refuses the approval", …)  // set default_followup_person_id null; review stays 'active'
test("another volunteer cannot submit", …)        // FORBIDDEN, no row
test("the office works a go-over follow-up", …)   // vitally_log_contact linked to the task, reached; RESOLVE_FOLLOWUP reached; stage unchanged; a non-assignee's linked contact FORBIDDEN
test("yes completes the review-contact step", …)  // status completed, outcome 'reached', contacted_at set
test("no completes it with no outcome", …)        // status completed, outcome null, contacted_at set, one go-over follow-up
test("yes meets the ready-to-e-file gate", …)     // MARK_READY_TO_EFILE {confirmed:true} accepted with no RECORD_REVIEW_CONTACT
test("recording a conversation after a questionnaire approval is refused", …) // RECORD_REVIEW_CONTACT → INVALID_TRANSITION
test("a legacy pending approval can still be recorded", …) // legacyApprovedCase(f), then RECORD_REVIEW_CONTACT reached → completed
test("the signing plan follows the answers", …)   // four approvals → appointment (time copied), same_day, portal, go_over_first (no + portal); no time except appointment
test("client messages carry no answer", …)        // assertPlainClientMessage on each new history line; Exit Form amounts absent
```

  Set `service` on a test case by updating `cases.answers` through `f.sql`, or through the fixture's answer helper if one exists. Move the existing `RECORD_REVIEW_CONTACT` tests (and their stage sweep in `refusedByStage`) onto `legacyApprovedCase(f)`, since a questionnaire approval no longer leaves the step pending. In `tests/database-stages.mjs`, "ready to e-file waits for the reviewer's call" uses `legacyApprovedCase` and keeps its shape. Every other `approvedCase` caller gets a Yes approval.
- [x] **Step 2:** Run `npm run db:migrate:test && npm run test:database`. Expected: the new tests FAIL (no rows stored).
- [x] **Step 3:** Implement section 6 as in Interfaces, copying each handler from the definition named above.
- [x] **Step 4:** Run `npm run db:migrate:test && npm run test:database`. Expected: everything passes, including #91's stage suite and #88's contact suite.
- [x] **Step 5:** Commit: `git commit -am "Questionnaires: hand-offs store answers; no go-over opens an office task"`.

### Task 4a: Mark ready to e-file waits for the office's go-over (design D13)

Hailey's ruling on Q1 (2026-10-19). While the case has an open `go_over_return` follow-up, Mark ready to e-file is refused. The wait ends when that follow-up is resolved, whatever the outcome.

**Files:**
- Modify: `supabase/migrations/033_review_questionnaires.sql`, section 6a: `act_mark_ready_to_efile`, copied verbatim **from 032**.
- Modify: `src/supabase-store.mjs` (the list read), `src/admin-views.mjs` (`adminEligibility.markReadyToEfile`), `src/office-views.mjs` (`needed`, the `signing` row).
- Test: `tests/database-stages.mjs`, `tests/store.test.mjs`, `tests/admin-views.test.mjs`, `tests/office-views.test.mjs`.

**Interfaces:**
- Consumes: Task 2's `admin_followups.purpose`, and Task 4's go-over follow-up and `f.approvedCase()`.
- Produces:
  - `act_mark_ready_to_efile`, 032's body with one added check after the contact-step check, marked `-- 033`:

```sql
 if exists(select 1 from public.admin_followups
   where workspace_id=p_case.workspace_id and case_id=p_case.id
    and purpose='go_over_return' and status='open') then -- 033
  raise sqlstate 'VT004' using message='INVALID_TRANSITION'; -- 033
 end if; -- 033
```

    Its client message, its stage check and 032's contact-step check stay as they are.
  - Test support: `f.approvedCase({ wentOver: false })` approves with "no" (and the Customer Portal), which opens the go-over follow-up. Its default stays a Yes approval.
  - Store, list rows: the grouped read of open `admin_followups` selects `case_id,assignee_person_id,purpose`. Each row gains `goOverOpen: open.some((row) => row.purpose === "go_over_return")`. `openFollowups` and `followupAssigneeIds` are unchanged.
  - `adminEligibility.markReadyToEfile`, after the reviewer's-call check:
    - a list row reads `record.goOverOpen`;
    - a full case reads `(record.followups ?? []).some((f) => f?.purpose === "go_over_return" && f?.status === "open")`;
    - when true it returns `refused("The office still needs to go over the return with the client.")`.

    #91's "The reviewer still needs to record the conversation with the client." keeps priority, because it comes first.
  - Follow-ups `needed()` for `signing`:
    - "Waiting for the reviewer's call with the client." when `reviewContactStatus` is not `completed`;
    - otherwise "Waiting for the office to go over the return with the client." when `goOverOpen`;
    - otherwise "Waiting for the client to sign Form 8879.".

    `rowAction` already shows `explain(decision)` in place of the button.

- [x] **Step 1: Write the failing database tests** in `tests/database-stages.mjs`, beside "ready to e-file waits for the reviewer's call":

```js
await t.test("ready to e-file waits for the office's go-over", async () => {
  const caseId = await f.approvedCase({ wentOver: false });
  const revision = await revisionOf(caseId);
  await assert.rejects(
    () => f.act(f.presenter, caseId, f.sam, "MARK_READY_TO_EFILE", CONFIRMED),
    rejected("INVALID_TRANSITION"),
  );
  assert.equal(await stageOf(caseId), "review_approved");
  assert.equal(await revisionOf(caseId), revision); // nothing recorded, no client line
});
for (const outcome of ["reached", "no_further_contact"])
  await t.test(`the wait ends when the go-over is resolved: ${outcome}`, async () => {
    const caseId = await f.approvedCase({ wentOver: false });
    const task = await goOverTask(caseId); // the open go_over_return row, via f.sql
    await f.act(f.presenter, caseId, task.assignee, "RESOLVE_FOLLOWUP", {
      followupId: task.id, outcome, note: "Fictional: went over the return by phone.",
    });
    await f.act(f.presenter, caseId, f.sam, "MARK_READY_TO_EFILE", CONFIRMED);
    assert.equal(await stageOf(caseId), "ready_to_efile");
  });
await t.test("a yes approval is not held up", async () => {
  const caseId = await f.approvedCase(); // yes: no follow-up
  await f.act(f.presenter, caseId, f.sam, "MARK_READY_TO_EFILE", CONFIRMED);
  assert.equal(await stageOf(caseId), "ready_to_efile");
});
```

  Use the suite's existing helpers for the stage and revision; add `revisionOf` or `goOverTask` only if they don't exist. The resolving persona is the task's assignee (the workspace's default follow-up person).
- [x] **Step 2: Write the failing browser-side tests:**
  - `tests/store.test.mjs`: a list row gets `goOverOpen` true for an open `go_over_return` task, false for an open `request_documents` task only, false with none.
  - `tests/admin-views.test.mjs`:
    - `markReadyToEfile` is refused with the exact sentence on a full case with an open go-over task, and on a list row with `goOverOpen: true`;
    - it is allowed once that task is `resolved` (outcome `reached`, and again `no_further_contact`);
    - a legacy pending call still gives #91's sentence.
  - `tests/office-views.test.mjs`: the `signing` row reads "Waiting for the office to go over the return with the client." and shows the explanation, not the button, while `goOverOpen`. It reads "Waiting for the client to sign Form 8879." with **Mark ready to e-file…** once it is false.
- [x] **Step 3:** Run `npm run test:database` and `npm test`. Expected: the new tests FAIL.
- [x] **Step 4:** Implement section 6a and the three browser changes, as in Interfaces.
- [x] **Step 5:** Run `npm run db:migrate:test && npm run test:database`, then `npm test`. Expected: PASS, including #91's existing gate tests.
- [x] **Step 6:** Tick tasks 3.5 and 5.8, and commit: `git commit -am "Questionnaires: Mark ready to e-file waits for the office's go-over"`.

### Task 5: Fixtures

**Files:**
- Modify: `supabase/migrations/033_review_questionnaires.sql`, section 7: `apply_fixture_scenario`, copied verbatim **from 031**. #88's contact-log delete and the seeded log entry stay.
- Test: `tests/database-fixtures.mjs`.

**Interfaces:**
- Produces:
  - Two new `delete` lines, placed before the `reviews` delete.
  - The scenario's `update public.cases set stage=…` also sets `signing_plan` and `signing_appointment_at`: `portal` and null for `review_approved`, null and null for every other scenario.
  - Fictional preparer rows: client / phone, both confirmations true, `current_date`. They go in for `review_ready` (version 1), `corrections_required` (version 1) and `review_approved` (version 1, client / in person; version 2, client / phone).
  - One reviewer row on the `review_approved` approved attempt: `completed_on current_date`, eligible, `went_over` true with `current_date` and phone, portal, an Exit Form with a Federal refund of `412.00` by direct deposit and Local NPT `paper`/`none`, and no remarks.
  - That attempt's contact step is seeded `completed`, with outcome `reached` and `client_contacted_at now()-interval '1 hour'`, in place of 031's `pending` (design D8, D10). Update the comment above it.

- [x] **Step 1: Write the failing tests:**
  - `seeded approved sample has answers`: two preparer rows, one reviewer row, the plan `portal`, and its step completed;
  - `checkpoint reset leaves no stale answers`: a reset to `ready_for_review` leaves exactly one preparer row (version 1), no reviewer row and no signing plan.

  Update any fixture test that expects the approved sample's step to be `pending`.
- [x] **Step 2:** Run `npm run test:database`. Expected: FAIL.
- [x] **Step 3:** Implement section 7.
- [x] **Step 4:** Run `npm run db:migrate:test && npm run test:database`. Expected: PASS.
- [x] **Step 5:** Commit: `git commit -am "Questionnaires: samples carry fictional answers"`.

### Task 6: Payload builders and the contact-log prefill

**Files:**
- Create: `src/questionnaires.mjs`, which holds the vocabulary and pure helpers shared by the builders and the views. It may import `src/contact-log.mjs` for the New York clock, never `src/staff-views.mjs`.
- Modify: `src/case-actions.mjs` (`BUILDERS`), `src/contracts.mjs` (shape notes).
- Test: `tests/case-actions.test.mjs`, new `tests/questionnaires.test.mjs`.

**Interfaces:**
- Produces (in `src/questionnaires.mjs`):
  - `CONFIRMED_BY`, `CONFIRMED_METHODS`, `WENT_OVER_HOW`, `SIGN_METHODS`, `PA_FORGIVENESS`, `FILING_METHODS`, `RESULTS`, `REFUND_BY`, `OWE_BY`, `LOCAL_TYPES`. Each is a frozen `[[value, label], …]` with the labels below.
  - `todayIso(now = Date.now()): string`, the local date as `YYYY-MM-DD`.
  - `signDefault(service): "in_person" | "portal" | ""`.
  - `needsAppointment(service, signMethod): boolean`.
  - `goOverPrefill(contacts): { wentOver: "yes", wentOverOn, wentOverHow } | null` (design D9). It considers entries with `purpose === "go_over_return"` and `outcome === "reached"`, in either direction. It takes the one with the latest `contactedAt`. The date is the America/New_York date. The method maps `in_person`/`phone`/`video` as themselves and `text`/`email` to `other`.
  - `preparerQuestionnaire(values): object`, which throws `{code: "VALIDATION"}` with a sentence.
  - `reviewerQuestionnaire(values, service): object`, the same.
  - `exitFormFrom(values): {federal, state, local}`.
  - `changedAnswers(previous, current): Set<string>` of preparer keys.
- Form names (flat):
  - preparer: `confirmedBy`, `confirmedByName`, `confirmedMethod`, `shadedPartsCompleted` (checkbox value `yes`), `stateForgivenessSet`, `readyForReviewOn`;
  - reviewer: `completedOn`, `paForgiveness`, `wentOver` (radio `yes`/`no`), `wentOverOn`, `wentOverHow`, `signMethod`, `signAppointmentAt`, `remarks`;
  - Exit Form: `federal.method`, `federal.result`, `federal.amount`, `federal.refundBy`, `federal.oweBy`, `federal.debitOn`; the same under `state.`; and `local.<TYPE>.<field>` for each type.
- Labels:
  - methods: Phone / In person / Text / Email / Video;
  - signing: "E-sign in the TaxSlayer Customer Portal" / "In person";
  - PA forgiveness: Eligible / Not eligible;
  - filing: E-file / Paper;
  - results: Refund / Owe / None;
  - Direct deposit / Check; Direct debit / Mail check;
  - Local types: NPT, BIRT, EET, SIT, and "PAIBWTR (Philadelphia Wage Tax refund petition)".
- `BUILDERS`:
  - `SUBMIT_REVIEW: (d, v) => ({ questionnaire: preparerQuestionnaire(v) })`;
  - `RESUBMIT_REVIEW` adds `questionnaire` next to `resolution`;
  - `APPROVE_REVIEW: (d, v) => ({ questionnaire: reviewerQuestionnaire(v, d.service) })`. The approve button carries `data-service`.

- [x] **Step 1: Write the failing tests** in `tests/questionnaires.test.mjs` and `tests/case-actions.test.mjs`:

```js
test("signDefault follows service", () => {
  assert.equal(signDefault("same_day"), "in_person");
  assert.equal(signDefault("online"), "portal");
  assert.equal(signDefault("drop_off"), "");
  assert.equal(signDefault(undefined), "");
});
test("drops hidden went-over answers", () => {
  const q = reviewerQuestionnaire({ ...REVIEWER_FORM, wentOver: "no", wentOverOn: "2026-10-17", wentOverHow: "phone" }, "online");
  assert.equal(q.wentOver, false);
  assert.ok(!("wentOverOn" in q) && !("wentOverHow" in q));
});
test("drops the appointment when not in person", …)     // signMethod portal + typed appointment → key absent
test("same-day drops the appointment", …)
test("in person on drop-off needs an appointment", …)    // throws VALIDATION "Choose the appointment to sign."
test("blank other name is refused", …)                   // confirmedBy other, name "  " → throws
test("unticked confirmations are refused", …)            // each names its own sentence
test("an untouched Exit Form is three empties", …)       // { federal: null, state: null, local: [] }
test("half-filled Local entry names the entry", …)       // local.SIT.amount "10" only → throws /SIT/
test("refund carries amount and refundBy only", …)       // stray oweBy/debitOn from a hidden branch dropped
test("amount accepts 0 and 999999.99, refuses 1.005 and -1", …)
test("changedAnswers marks a changed method", …)
test("goOverPrefill takes the latest reached go-over", …) // 10/12 phone and 10/15 in person → 2026-10-15, in_person
test("goOverPrefill ignores other purposes and outcomes", …) // reached request_documents + no_answer go_over → null
test("goOverPrefill counts an incoming email as other", …)
test("goOverPrefill uses the New York date", …)          // contactedAt 2026-10-15T02:30:00Z → 2026-10-14
test("SUBMIT_REVIEW payload is { questionnaire }", …)    // replaces the old `{}` expectation
```

- [x] **Step 2:** Run `npm test`. Expected: FAIL (module not found).
- [x] **Step 3:** Implement `src/questionnaires.mjs` and the three builders. Hidden branches are dropped by rule: `wentOver*` only when yes; the appointment only when `needsAppointment`; in a group, only the fields its result calls for. A group with every field blank is `null` (or left out of `local`).
- [x] **Step 4:** Run `npm test`. Expected: PASS.
- [x] **Step 5:** Commit: `git commit -am "Questionnaires: payload builders, shared vocabulary and the contact-log prefill"`.

### Task 7: Store, forms and the case page

**Files:**
- Modify: `src/supabase-store.mjs`, `src/staff-views.mjs` (`nextStep`, `reviewAttempts`), `src/styles.css`.
- Test: `tests/store.test.mjs`, `tests/database-store.mjs`, `tests/staff-views.test.mjs`.

**Interfaces:**
- Consumes: Task 6's exports.
- Produces:
  - In the store:
    - `STAFF_TABLES` gains both table names;
    - `mapStaffCase({…, preparerQuestionnaires = [], reviewerQuestionnaires = []})` maps them with `camelRow` into `record.preparerQuestionnaires` and `record.reviewerQuestionnaires`;
    - the staff read loads both with `relatedRows`;
    - `mapFollowup` adds `purpose: row.purpose ?? "request_documents"`;
    - `mapCase` adds `signingPlan` and `signingAppointmentAt` (both adapters; the client needs them in Task 8a).
  - In `src/staff-views.mjs`:
    - `preparerForm(record, previous, ui)`;
    - `reviewerForm(record, ui)`. It starts from `goOverPrefill(record.contacts)` and `signDefault(answers.service)`, and ends with the Approve `caseSubmit`;
    - `preparerAnswers(q)` and `reviewerAnswers(q)`, which render detail rows;
    - `submissionComparison(previous, current)`;
    - `contactStepLine(attempt, questionnaire)`: the D10 line at Ready to exit, and the panel's "Client conversation" row. It returns null when there is no questionnaire, so the legacy path renders as today.

    All are internal to the file, built from `input`/`select`/`textarea`/`caseSubmit` in `src/ui.mjs`. Radios and checkboxes follow the existing staff-form markup (VERIFY_INTAKE's checks are the model).
  - CSS: `.q-when-yes`, `.q-when-in-person` and `.q-group`:
    - `.q-when-yes` is `display:none` unless `.staff-form:has(input[name=wentOver][value=yes]:checked)`;
    - `.q-when-in-person` the same, for `signMethod=in_person`;
    - `.q-group` is a `<details>` per Exit Form entry (Federal, State, and each Local type). It has no `open` attribute unless the entry holds a value from a refused submit.

- [x] **Step 1: Write the failing tests**:
  - Store: the staff case carries both arrays; the applicant adapter's tables still exclude them; both adapters map the two signing fields. In `tests/database-store.mjs`, add both names to `STAFF_SECTIONS`.
  - Views:

```js
test("Filing in progress shows the preparer form inline with today's date", …) // ui.now fixed; readyForReviewOn = todayIso(ui.now); no dialog markup
test("resubmit is prefilled from the latest submission", …)        // client / in_person checked, both boxes checked, date = today
test("resubmit with no earlier questionnaire", …)                  // blank choices, today's date, no throw
test("the reviewer form sits above Approve", …)                    // in nextStep: the form's fields come before the APPROVE_REVIEW button; "Ask the preparer for corrections" (open-request-corrections) still follows it
test("reviewer form defaults signing from service", …)             // online → portal checked; drop_off → neither
test("reviewer form prefills going over from the contact log", …)  // a reached go-over contact → yes, date and how checked
test("same-day reviewer form has no appointment block", …)
test("Exit Form groups are collapsed details", …)                  // seven <details class="q-group"> (federal, state, five local), none open
test("a filled group stays open", …)                               // ui values with local.SIT.amount → that <details> open
test("Review in progress shows previous and current with changes marked", …) // a "Changed" mark on the method row only
test("review panel shows answers per version", …)                  // preparer rows for v1 and v2; reviewer rows incl. Exit Form and remarks
test("no questionnaire recorded line", …)                          // exact string
test("approved with yes offers no conversation form", …)          // no RECORD_REVIEW_CONTACT control; "The reviewer went over the return with the client on <date>."
test("approved with no says the office takes over", …)            // no RECORD_REVIEW_CONTACT control; "The office will go over the return with the client."
test("legacy pending approval still shows the conversation form", …) // approved attempt with no reviewer questionnaire, status pending
```

- [x] **Step 2:** Run `npm test`. Expected: FAIL.
- [x] **Step 3:** Implement the store changes, the forms in `nextStep`, the panel rows and the CSS:
  - `preparing` → `preparerForm`;
  - `corrections_required` → the resolution textarea, then `preparerForm` prefilled;
  - `reviewing` → `submissionComparison` when the version is above 1, then `reviewerForm` ending in "Approve this review". "Ask the preparer for corrections" stays beside it in `.next-step-actions` and still opens its dialog, followed by today's field note.

  Both buttons keep their current wording. The approve control becomes a `caseSubmit` inside the reviewer form and carries `data-service`.
- [x] **Step 4:** Run `npm test`. Expected: PASS. Then `npm run test:database`. Expected: the store suite passes.
- [x] **Step 5:** Commit: `git commit -am "Questionnaires: inline forms, comparison and answers on the case page"`.

### Task 8: Office views for a follow-up with no request, and the task's purpose

**Files:**
- Modify: `src/admin-views.mjs` (`followupTask`, `followupForms`), `src/staff-views.mjs` (`logContactForm`), and `src/office-views.mjs` (the drawer) only if the audit finds a request read.
- Test: `tests/admin-views.test.mjs`, `tests/office-views.test.mjs`, `tests/staff-views.test.mjs`.

**Interfaces:**
- Consumes: `followup.purpose` and `followup.requestId` (null for `go_over_return`) from Task 7.
- Produces:
  - `followupTask` titles a `go_over_return` task "Go over the return with the client" and shows no document line. A `request_documents` task keeps its request's title.
  - `logContactForm(record, person, ui, { followupId, contact, purpose })`: a new option `purpose` preselects that purpose on a new entry. `followupForms` passes `task.purpose`. The Contacts tab passes none, so nothing is chosen there.
  - Follow-ups (`followupQueue`) is unchanged: a go-over task is counted in the case's `call` row like any open task.

- [x] **Step 1: Audit.** Run `grep -n "requestId\|request_id" src/admin-views.mjs src/office-views.mjs src/staff-views.mjs` and list every read that belongs to a follow-up.
- [x] **Step 2: Write the failing tests:**
  - `follow-up with no request renders`, on a case holding one open `{purpose: "go_over_return", requestId: null, reason: "Go over the return with the client: the reviewer did not."}`:
    - the queue lists its `call` row, with the open count at 1;
    - the drawer shows the reason and no document line;
    - the case panel shows the title `Go over the return with the client`, with the Log contact and resolve forms.
  - `a task's Log contact form starts with its purpose`: `go_over_return` is checked inside a go-over task, `request_documents` inside a document task, and nothing in the Contacts tab.
- [x] **Step 3:** Run `npm test`. Expected: FAIL.
- [x] **Step 4:** Implement: branch on `purpose === "go_over_return"` wherever the audit found a request read, and thread `purpose` into `logContactForm`.
- [x] **Step 5:** Run `npm test`. Expected: PASS.
- [x] **Step 6:** Commit: `git commit -am "Questionnaires: go-over follow-ups in the office views; a task's contact starts with its purpose"`.

### Task 8a: The client's Ready to exit variants

**Files:**
- Modify: `src/domain.mjs` (`describeStage`), `src/client-views.mjs` (its call sites), `src/client-text.mjs`, and `src/zh-hant.mjs` (generated).
- Test: `tests/domain.test.mjs`, `tests/client-views.test.mjs`.

**Interfaces:**
- Produces:
  - Client text keys `stage.review_approved.client.appointment`, `.same_day`, `.portal` and `.go_over_first`, with the English and 简体 of design D11, exactly. The appointment text takes a `{when}` parameter.
  - `signingWhen(isoMinute, lang): string`. It reads the `YYYY-MM-DDTHH:MM` parts and builds `new Date(Date.UTC(...))`. It formats with `Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" })`, where `locale` is `en-US`, `zh-CN` or `zh-Hant` for the screen's language.
  - `describeStage(stage, lang, record)`: at `review_approved` with `record.signingPlan` set, `clientMessage` is that variant, in English too. Without a plan, or at any other stage, the result is as today. The status panel and the review panel in `src/client-views.mjs` pass the record.

- [x] **Step 1: Write the failing tests:**

```js
test("each Ready to exit variant in English and 简体", …)         // the four plans × en/zh; exact strings from design D11
test("wording review strings", …)                                // go_over_first en: "…go over your return together. After that, you will sign Form 8879. …"; portal zh ends "…递交报税表。（门户为英文页面，可用浏览器翻译）"
test("appointment text", …)                                        // 2026-11-02T14:30 → "…on Monday, November 2 at 2:30 PM to sign…" and "…请于 11月2日星期一 下午2:30 到 PCDC…"
test("appointment text ignores the time zone", …)                  // same output with process.env.TZ = "Asia/Shanghai" and "America/Los_Angeles" (spawn a child node if TZ must be set before start)
test("no plan keeps today's message", …)                           // legacy approval
test("other stages ignore the plan", …)                            // ready_to_efile with a plan → its own message
test("no variant names a phone number or a money word", …)         // #91's phone check and MONEY_WORDS over every variant, en/zh/hant
test("the status panel shows the variant", …)                      // client-views: a review_approved record with signingPlan 'portal'
```

- [x] **Step 2:** Run `npm test`. Expected: FAIL.
- [x] **Step 3:** Add the 简体 and English texts to `src/client-text.mjs`, then implement `signingWhen` and `describeStage`. Run `npm run build:hant` and check the 繁體 of the four keys by eye.
- [x] **Step 4:** Run `npm test` and `npm run build:hant -- --check`. Expected: PASS.
- [x] **Step 5:** Commit, including `src/zh-hant.mjs`: `git commit -am "Questionnaires: the client's Ready to exit message says how and when to sign"`.

### Task 9: Story and full checks

**Files:**
- Modify: `tests/browser.mjs`: the `act(staff, "SUBMIT_REVIEW" | "RESUBMIT_REVIEW" | "APPROVE_REVIEW", …)` calls, the "Record this conversation" press after approval, and any Mark ready to e-file step that #91 added after it.
- Modify: `openspec/changes/add-preparer-and-reviewer-questionnaires/tasks.md` (ticks).

- [x] **Step 1:** Add `fillPreparer(page, answers)` and `fillReviewer(page, answers)` beside the story's other form helpers. Use them before each of the three presses (fictional answers). On resubmit, assert the prefill: the method is already chosen and the date is today. On approve, assert that the reviewer form is above the Approve button and that no dialog opened. Open one Exit Form group to fill it.
- [x] **Step 2:** Add one path in which the reviewer answers "no" and approves. An office persona then finds the case's "Call the client" row in Follow-ups, opens its drawer, sees the go-over task, and logs a contact whose purpose is already "Go over tax return". Before the task is resolved, the case's `signing` row reads "Waiting for the office to go over the return with the client." with no Mark button. After the office resolves it, **Mark ready to e-file…** is offered (D13). The client window shows the Go over first message and still passes the `MONEY_WORDS` check.
- [x] **Step 2a:** Drop the story's "Record this conversation" press after its approval. Assert instead that the reviewer's next step shows no `RECORD_REVIEW_CONTACT` control and reads the D10 line. Remove the wait for the client message "A volunteer spoke with you about the next service step.", but keep the internal-text and `MONEY_WORDS` checks on the client window. Where #91's story marks the case ready to e-file, it now does so straight after a Yes approval. The client window shows the variant the approval chose.
- [x] **Step 3:** Run `npm run test:browser`. Expected: all pass (about 11–16 minutes).
- [x] **Step 4:** Run `npm test`, `npm run build:hant -- --check`, `npx openspec validate --all` and `npm run build:intake`, then `git status --short`. Expected: all pass, and the intake build leaves nothing to commit.
- [x] **Step 5:** Tick every task in `tasks.md`, then commit: `git commit -am "Questionnaires: the story fills both questionnaires"`.
