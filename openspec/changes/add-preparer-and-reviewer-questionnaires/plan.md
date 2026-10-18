# Preparer and Reviewer Questionnaires Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `SUBMIT_REVIEW`, `RESUBMIT_REVIEW` and `APPROVE_REVIEW` each carry a questionnaire. The database validates and stores it, staff see the answers on the case page, and an approval with "did not go over the return" opens an office follow-up.

**Architecture:**
- The questionnaire travels inside the existing action payload, so `vitally_apply_action` checks it, stores it and moves the stage in one transaction (design D1).
- Answers go into two new presenter-only tables (design D2). The Exit Form groups go in one checked `jsonb` column (D3).
- `admin_followups` gains a `kind`, so a follow-up need not name a document request (D5).
- The browser builds the payload from flat form names, mirrors the database's rules, and renders the forms with CSS-only show/hide (D4, D7).

**Tech Stack:** PostgreSQL / Supabase (plpgsql, RLS, realtime), plain ES modules (`src/*.mjs`), `node:test`, Playwright (`tests/browser.mjs`).

**Spec:** `openspec/changes/add-preparer-and-reviewer-questionnaires/`. Read `design.md` (D1–D9) and `specs/review-and-corrections/spec.md` and `specs/office-follow-up/spec.md` with this plan. `brainstorm.md` holds the approved design.

## Global Constraints

- **Do not start until Jinyu's lifecycle chain (#73) is merged, and `/opsx:update` has renamed the stages in this plan.** Stage names below are today's: `preparing`, `review_ready`, `reviewing`, `corrections_required`, `review_approved`.
- **Migrations are hand-written and final once applied.** Add one new file, `supabase/migrations/031_review_questionnaires.sql`, numbered after the last migration on `main` (renumber at Task 1). Never edit an existing migration. Every statement can be applied again (`if not exists`, `create or replace`, drop-then-add).
- **Copy each re-created function from its *latest* definition.** After #73 that is the chain's migration, not `006`/`017`/`019`/`021`. Change only what this plan names, and keep every client message string as it is.
- **Fictional data only** in fixtures and tests.
- **Staff screens are English. No change** to `src/client-text.mjs`, `src/zh-hant.mjs` or the intake catalogue.
- **No client message, `client_events` row or client screen may mention any answer, amount or payment method.** The existing `MONEY_WORDS` checks stay green.
- **Every validation failure is `raise sqlstate 'VT007' using message='VALIDATION'`.**
- **Payload keys are exactly these** (database and browser):
  - Preparer `questionnaire`: `confirmedBy` (`client`|`spouse`|`other`), `confirmedByName` (only with `other`, 1–120 chars after trim), `confirmedMethod` (`phone`|`in_person`|`text`|`email`|`video`), `shadedPartsCompleted` (`true`), `stateForgivenessSet` (`true`), `readyForReviewOn` (`YYYY-MM-DD`).
  - Reviewer `questionnaire`: `completedOn` (`YYYY-MM-DD`), `paForgiveness` (`eligible`|`not_eligible`), `wentOver` (boolean), `wentOverOn` (only with `wentOver` true, required then), `wentOverHow` (only with `wentOver` true, optional: `in_person`|`phone`|`video`|`other`), `signMethod` (`portal`|`in_person`), `signAppointmentAt` (`YYYY-MM-DDTHH:MM`, site wall-clock time), `exitForm` (`{federal, state, local}`), `remarks` (optional, 1–2000 chars).
  - `SUBMIT_REVIEW` and `APPROVE_REVIEW` take `{questionnaire}`. `RESUBMIT_REVIEW` takes `{questionnaire, resolution}`.
- **The Exit Form shape is design D3, exactly.** The amount pattern is `^(0|[1-9][0-9]{0,5})(\.[0-9]{1,2})?$`. Local types are `NPT`, `BIRT`, `EET`, `SIT`, `PAIBWTR`.
- **Fixed strings:**
  - follow-up reason: `Go over the return with the client: the reviewer did not.`;
  - follow-up label: `Go over the return with the client`;
  - empty answers: `No questionnaire was recorded for this version.`
- **Checks to run:** `npm test`; `npm run db:migrate:test` then `npm run test:database`; `npm run test:browser`; `npx openspec validate --all`. `build:hant -- --check` and `test:auth-browser` are not needed: no client text or sign-in changes.

## Review Focus

1. **An answer that is hidden but still filled in** (3 = No after a date was typed; Portal after an appointment was typed) must not be sent. Otherwise the database refuses a valid approval. Tests: Task 6 `drops hidden went-over answers` and `drops the appointment when not in person`.
2. **A whitespace-only "other" name or remarks** must count as empty, in the builder and in the database. Tests: Task 6 `blank other name is refused`; Task 3 `whitespace remarks refused`.
3. **An Exit Form entry with only an amount typed** (no method or result) must give a clear sentence, not be silently dropped or sent half-built. Test: Task 6 `half-filled Local entry names the entry`.
4. **A resubmit on a case whose earlier version has no questionnaire** (reviewed before this change) must open the form blank with today's date, not crash. Test: Task 7 `resubmit with no earlier questionnaire`.
5. **A `go_over_return` task in every follow-up view** (queue row, drawer, case panel, count) must never read `task.requestId` as if it were set. Test: Task 8 `follow-up with no request renders`.

---

### Task 1: Gate and renumber

**Files:** none changed except, possibly, this change's artifacts (through `/opsx:update`).

- [ ] **Step 1:** Run `gh pr list --state merged --search "lifecycle"` and `git log origin/main --oneline -20`, and confirm #73's chain is in `main`. If it is not, stop and tell the user.
- [ ] **Step 2:** Run `/opsx:update add-preparer-and-reviewer-questionnaires` with the chain's stage names, and the file names of the chain's latest handler definitions. Check whether `add-call-log` has merged; if it has, the update adds the 3a/3b prefill (design D9).
- [ ] **Step 3:** Run `git merge origin/main`, then `ls supabase/migrations | tail -1`. Use the next number for the migration in Task 2 if it is not 031.
- [ ] **Step 4:** Tick tasks 1.1 and 1.2 in `tasks.md` and commit: `git commit -am "Questionnaires: rebase onto the lifecycle chain"`.

### Task 2: Tables, RLS and the follow-up kind

**Files:**
- Create: `supabase/migrations/031_review_questionnaires.sql`. Sections 1–3 of the file; the header names design D2/D5 and the R28 departure.
- Test: `tests/database-review.mjs` (new `test(...)` blocks at the end), `tests/database-realtime.mjs`.

**Interfaces:**
- Produces:
  - `public.preparer_questionnaires`. Columns: `id uuid pk`, `workspace_id`, `case_id`, `preparation_version bigint check (>=1)`, `submitted_by_person_id`, `confirmed_by`, `confirmed_by_name`, `confirmed_method`, `shaded_parts_completed boolean check (= true)`, `state_forgiveness_set boolean check (= true)`, `ready_for_review_on date`, `created_at timestamptz default now()`. Unique (`case_id`, `preparation_version`). Check `(confirmed_by = 'other') = (confirmed_by_name is not null)`.
  - `public.reviewer_questionnaires`. Columns: `id uuid pk`, `workspace_id`, `case_id`, `review_id uuid unique`, `answered_by_person_id`, `completed_on date`, `pa_forgiveness`, `went_over boolean`, `went_over_on date`, `went_over_how`, `sign_method`, `sign_appointment_at timestamp`, `exit_form jsonb not null`, `remarks`, `created_at`. FK (`workspace_id`, `case_id`, `review_id`) → `reviews(workspace_id, case_id, id)`. Checks: `went_over = (went_over_on is not null)`; `went_over or went_over_how is null`; `sign_appointment_at is null or date_trunc('minute', sign_appointment_at) = sign_appointment_at`.
  - `admin_followups.kind text not null default 'document' check (kind in ('document','go_over_return'))`, `request_id` nullable, and constraint `admin_followups_kind_request check ((kind = 'document') = (request_id is not null))`.
  - Both tables get `presenter_<table>` select policies copied from `presenter_case_materials` (013), the same revoke/grant lines, and the 013 realtime `do $$` block.

- [ ] **Step 1: Write the failing database tests**

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
test("follow-ups have a kind", async () => {
  // existing escalation → kind 'document' with request_id
  // insert kind 'go_over_return' with a request_id → rejects; kind 'document' with none → rejects
});
```

  Use whatever the fixture offers for reading as a principal (`tests/support/database-fixture.mjs`). If no `selectAs`-style helper exists, add one there. Add both table names to the realtime publication assertions in `tests/database-realtime.mjs`, in the style of the `reviews` case at line 420.
- [ ] **Step 2:** Run `npm run test:database`. Expected: the new tests FAIL (relation does not exist).
- [ ] **Step 3:** Write sections 1–3 of the migration, as in Interfaces.
- [ ] **Step 4:** Run `npm run db:migrate:test` and then `npm run test:database`. Expected: the new tests pass, and the rest stay green.
- [ ] **Step 5:** Commit: `git add supabase/migrations/031_review_questionnaires.sql tests/ && git commit -m "Questionnaires: staff-only tables and the follow-up kind"`.

### Task 3: Payload validation

**Files:**
- Modify: `supabase/migrations/031_review_questionnaires.sql`, section 4.
- Test: `tests/database-review.mjs`.

**Interfaces:**
- Produces:
  - `vitally_private.payload_date(p jsonb, key text) returns date`, immutable. It returns null unless the value is a string matching `^\d{4}-\d{2}-\d{2}$` that is a real calendar date. Catch the cast error.
  - `vitally_private.payload_minute(p jsonb, key text) returns timestamp`, the same for `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$`.
  - `vitally_private.check_exit_form(p jsonb) returns boolean`, immutable, design D3.
  - `vitally_private.check_preparer_questionnaire(q jsonb) returns boolean` and `vitally_private.check_reviewer_questionnaire(q jsonb) returns boolean`, both immutable. They check keys, enums, dates and the conditional rules in Global Constraints. They do **not** check the date window or the appointment rule.
  - `check_payload`, re-created from its latest definition with:
    - `SUBMIT_REVIEW` removed from the empty-payload branch, and `APPROVE_REVIEW` too;
    - new branches: `SUBMIT_REVIEW` (keys `['questionnaire']`), `RESUBMIT_REVIEW` (keys `['questionnaire','resolution']`, plus the existing resolution check) and `APPROVE_REVIEW` (keys `['questionnaire']`), each calling its checker.
  - The helpers get `revoke all … from public, anon, authenticated, service_role`, as in `023`.

- [ ] **Step 1: Write the failing tests.** Add `PREPARER` and `REVIEWER` constants (valid payloads, dates `new Date().toISOString().slice(0, 10)`) and change `REVIEW_PAYLOADS` to use them. Then add one table-driven test per checker, each entry asserting `rejected("VALIDATION")`, with the stage and revision unchanged after it:

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
  "old empty payload": null, // send {} itself
};
```

  Also add accepted cases: no Exit Form groups; NPT owe 120.00 by mail check plus BIRT paper none; amount `0`; amount `999999.99`.
- [ ] **Step 2:** Run `npm run db:migrate:test && npm run test:database`. Expected: the new tests FAIL, because today's empty-payload rule rejects the valid payloads.
- [ ] **Step 3:** Implement section 4 as in Interfaces.
- [ ] **Step 4:** Run `npm run db:migrate:test && npm run test:database`. Expected: the validation tests pass. The handler-storage tests from Task 4 don't exist yet. Existing review tests pass, now with the new payloads.
- [ ] **Step 5:** Commit: `git commit -am "Questionnaires: the database checks each payload"`.

### Task 4: The three handlers and the go-over follow-up

**Files:**
- Modify: `supabase/migrations/031_review_questionnaires.sql`, section 5.
- Test: `tests/database-review.mjs`.

**Interfaces:**
- Consumes: Task 3's helpers and payload keys.
- Produces:
  - `vitally_private.check_taxslayer_date(p_case public.cases, d date) returns void`. It raises VALIDATION unless `make_date(coalesce(case.season, workspace.current_season), 1, 1) <= d <= current_date + 1`.
  - `act_submit_review` / `act_resubmit_review` keep their checks in today's order. After `hand_to_review` returns `v_version`, they call `check_taxslayer_date` and insert one `preparer_questionnaires` row at `v_version`.
  - `act_approve_review`, after `lock_active_review`:
    - checks `completedOn` and `wentOverOn` with `check_taxslayer_date`;
    - applies the appointment rule against `p_case.answers->>'service'` (required when `signMethod = 'in_person'` and service ≠ `same_day`, absent otherwise);
    - inserts the reviewer row;
    - when `wentOver` is false, finds the office person exactly as `act_escalate_contact` does and inserts an `admin_followups` row (`kind 'go_over_return'`, `request_id null`, the fixed reason, `created_by_person_id` = the reviewer).
  - The returned `detail` of each handler gains nothing. Answers never go into history.

- [ ] **Step 1: Write the failing tests**

```js
test("a valid submit stores one questionnaire at the new version", …) // version 1 row, confirmed_method 'phone'
test("resubmit keeps both submissions", …)        // rows at versions 1 and 2, each as sent
test("a refused submit changes nothing", …)       // stage, revision, preparation_version, receipt count, row count unchanged
test("ready date before the season is refused", …) // `${season - 1}-12-31` → VALIDATION
test("drop-off in person needs an appointment", …) // answers.service 'drop_off'
test("same-day in person refuses an appointment", …) // and accepts none
test("online may sign in person", …)
test("approval with no opens one go-over follow-up", …) // kind, request_id null, assignee = workspace default, reason text
test("approval with yes opens none", …)
test("no office person refuses the approval", …)  // set default_followup_person_id null; review stays 'active'
test("another volunteer cannot submit", …)        // FORBIDDEN, no row
test("the office works a go-over follow-up", …)   // RECORD_CONTACT reached, RESOLVE_FOLLOWUP reached; stage unchanged; non-assignee FORBIDDEN
test("closing the case cancels the go-over follow-up", …)
test("client messages carry no answer", …)        // assertPlainClientMessage on each new history line; Exit Form amounts absent
```

  Set `service` on a test case by updating `cases.answers` through `f.sql`, or through the fixture's answer helper if one exists.
- [ ] **Step 2:** Run `npm run db:migrate:test && npm run test:database`. Expected: the new tests FAIL (no rows stored).
- [ ] **Step 3:** Implement section 5 as in Interfaces, copying each handler from its latest definition.
- [ ] **Step 4:** Run `npm run db:migrate:test && npm run test:database`. Expected: everything passes.
- [ ] **Step 5:** Commit: `git commit -am "Questionnaires: hand-offs store answers; no go-over opens an office task"`.

### Task 5: Fixtures

**Files:**
- Modify: `supabase/migrations/031_review_questionnaires.sql`, section 6: `apply_fixture_scenario` from its latest definition.
- Test: `tests/database-fixtures.mjs`.

**Interfaces:**
- Produces:
  - Two new `delete` lines, placed before the `reviews` delete.
  - Fictional preparer rows: client / phone, both confirmations true, `current_date`. They go in for `review_ready` (version 1), `corrections_required` (version 1) and `review_approved` (version 1, client / in person; version 2, client / phone).
  - One reviewer row on the `review_approved` approved attempt: `completed_on current_date`, eligible, `went_over` true with `current_date` and phone, portal, an Exit Form with a Federal refund of `412.00` by direct deposit and Local NPT `paper`/`none`, and no remarks.

- [ ] **Step 1: Write the failing tests:** `seeded approved sample has answers` (two preparer rows and one reviewer row) and `checkpoint reset leaves no stale answers` (reset to `ready_for_review` leaves exactly one preparer row, version 1, and no reviewer row).
- [ ] **Step 2:** Run `npm run test:database`. Expected: FAIL.
- [ ] **Step 3:** Implement section 6.
- [ ] **Step 4:** Run `npm run db:migrate:test && npm run test:database`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -am "Questionnaires: samples carry fictional answers"`.

### Task 6: Payload builders

**Files:**
- Create: `src/questionnaires.mjs`, which holds the vocabulary and pure helpers shared by the builders and the views.
- Modify: `src/case-actions.mjs` (`BUILDERS`), `src/contracts.mjs` (shape notes).
- Test: `tests/case-actions.test.mjs`, new `tests/questionnaires.test.mjs`.

**Interfaces:**
- Produces (in `src/questionnaires.mjs`):
  - `CONFIRMED_BY`, `CONFIRMED_METHODS`, `WENT_OVER_HOW`, `SIGN_METHODS`, `PA_FORGIVENESS`, `FILING_METHODS`, `RESULTS`, `REFUND_BY`, `OWE_BY`, `LOCAL_TYPES`. Each is a frozen `[[value, label], …]` with the labels below.
  - `todayIso(now = Date.now()): string`, the local date as `YYYY-MM-DD`.
  - `signDefault(service): "in_person" | "portal" | ""`.
  - `needsAppointment(service, signMethod): boolean`.
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

- [ ] **Step 1: Write the failing tests** in `tests/questionnaires.test.mjs` and `tests/case-actions.test.mjs`:

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
test("SUBMIT_REVIEW payload is { questionnaire }", …)    // replaces the old `{}` expectation
```

- [ ] **Step 2:** Run `npm test`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `src/questionnaires.mjs` and the three builders. Hidden branches are dropped by rule: `wentOver*` only when yes; the appointment only when `needsAppointment`; in a group, only the fields its result calls for. A group with every field blank is `null` (or left out of `local`).
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -am "Questionnaires: payload builders and shared vocabulary"`.

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
    - `mapFollowup` adds `kind: row.kind ?? "document"`.
  - In `src/staff-views.mjs`:
    - `preparerForm(record, previous, ui)`;
    - `reviewerForm(record, ui)`;
    - `preparerAnswers(q)` and `reviewerAnswers(q)`, which render detail rows;
    - `submissionComparison(previous, current)`.

    All are internal to the file, built from `input`/`select`/`textarea`/`caseSubmit` in `src/ui.mjs`. Radios and checkboxes follow the existing staff-form markup (VERIFY_INTAKE's checks are the model).
  - CSS: `.q-when-yes`, `.q-when-in-person` and `.q-group`:
    - `.q-when-yes` is `display:none` unless `.staff-form:has(input[name=wentOver][value=yes]:checked)`;
    - `.q-when-in-person` the same, for `signMethod=in_person`;
    - `.q-group` is a `<details>` per Exit Form entry.

- [ ] **Step 1: Write the failing tests**:
  - Store: the staff case carries both arrays; the applicant adapter's tables still exclude them. In `tests/database-store.mjs`, add both names to `STAFF_SECTIONS`.
  - Views:

```js
test("preparing shows the preparer form with today's date", …)    // ui.now fixed; readyForReviewOn value = todayIso(ui.now)
test("resubmit is prefilled from the latest submission", …)        // client / in_person checked, both boxes checked, date = today
test("resubmit with no earlier questionnaire", …)                  // blank choices, today's date, no throw
test("reviewer form defaults signing from service", …)             // online → portal checked; drop_off → neither
test("same-day reviewer form has no appointment block", …)
test("reviewing shows previous and current with changes marked", …) // a "Changed" mark on the method row only
test("review panel shows answers per version", …)                  // preparer rows for v1 and v2; reviewer rows incl. Exit Form and remarks
test("no questionnaire recorded line", …)                          // exact string
test("Local entries one per type", …)                              // five .q-group entries named local.NPT … local.PAIBWTR
```

- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the store changes, the forms in `nextStep` (`preparing` → `preparerForm`; `corrections_required` → the resolution textarea plus `preparerForm` prefilled; `reviewing` → `submissionComparison` when version > 1, then `reviewerForm`), the panel rows, and the CSS. The approve and request-corrections buttons keep their current wording. The approve control becomes a `caseSubmit` in the reviewer form, carrying `data-service`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Then `npm run test:database`. Expected: the store suite passes.
- [ ] **Step 5:** Commit: `git commit -am "Questionnaires: forms, comparison and answers on the case page"`.

### Task 8: Office views for a follow-up with no request

**Files:**
- Modify: `src/admin-views.mjs` (`followupTask`, around line 474), `src/office-views.mjs` (`followupQueue`, the drawer near line 312).
- Test: `tests/admin-views.test.mjs`, `tests/office-views.test.mjs`.

**Interfaces:**
- Consumes: `followup.kind` and `followup.requestId` (null for `go_over_return`) from Task 7.

- [ ] **Step 1: Audit.** Run `grep -n "requestId\|request_id" src/admin-views.mjs src/office-views.mjs src/staff-views.mjs` and list every read that belongs to a follow-up.
- [ ] **Step 2: Write the failing test** `follow-up with no request renders`, with a case holding one open `{kind: "go_over_return", requestId: null, reason: "Go over the return with the client: the reviewer did not."}`:
  - the queue lists it, with the open count at 1;
  - the drawer shows the label `Go over the return with the client` and no document line;
  - the case panel shows the same, with the call and resolve forms.
- [ ] **Step 3:** Run `npm test`. Expected: FAIL.
- [ ] **Step 4:** Implement: branch on `kind === "go_over_return"` wherever the audit found a request read.
- [ ] **Step 5:** Run `npm test`. Expected: PASS.
- [ ] **Step 6:** Commit: `git commit -am "Questionnaires: office views show a go-over follow-up"`.

### Task 9: Story and full checks

**Files:**
- Modify: `tests/browser.mjs`, around lines 1637–1753: the `act(staff, "SUBMIT_REVIEW" | "RESUBMIT_REVIEW" | "APPROVE_REVIEW", …)` calls.
- Modify: `openspec/changes/add-preparer-and-reviewer-questionnaires/tasks.md` (ticks).

- [ ] **Step 1:** Add `fillPreparer(page, answers)` and `fillReviewer(page, answers)` beside the story's other form helpers. Use them before each of the three presses (fictional answers). On resubmit, assert the prefill: the method is already chosen and the date is today.
- [ ] **Step 2:** Add one path in which the reviewer answers "no", approves, and an office persona finds "Go over the return with the client" in Follow-ups. Assert the client window still passes the `MONEY_WORDS` check.
- [ ] **Step 3:** Run `npm run test:browser`. Expected: all pass (about 11–16 minutes).
- [ ] **Step 4:** Run `npm test`, `npx openspec validate --all` and `npm run build:intake`, then `git status --short`. Expected: all pass, and the intake build leaves nothing to commit.
- [ ] **Step 5:** Tick every task in `tasks.md`, then commit: `git commit -am "Questionnaires: the story fills both questionnaires"`.
