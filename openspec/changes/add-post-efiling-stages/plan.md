# After E-filed: filing results, Rejected and Accepted — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record how each return (federal, Pennsylvania) was filed and what the IRS and Pennsylvania answered. Send a rejected case back to signing, end at Accepted, and show all of it to staff and, without codes or notes, to clients.

**Architecture:**
- **Database:** migration 035 adds two stages and four client-readable `cases` columns (method and result per return), plus three staff-only tables (`filing_attempts`, `filing_returns`, and the append-only `filing_notes`). It adds two admin-only actions behind `vitally_apply_action`, and copies every redefined function from its newest definition.
- **Browser:** derives names, labels, messages and list placement from those four columns. Staff views add the Filing panel from the staff-only rows.

**Tech Stack:**
- Supabase Postgres (plpgsql, RLS), with migrations applied by `tools/admin/migrate.mjs`;
- plain ES modules in `src/`;
- `node:test` suites;
- Playwright story in `tests/browser.mjs`.

**Spec:**
- `openspec/changes/add-post-efiling-stages/specs/case-lifecycle/spec.md` (the behaviour, wording and scenarios);
- `design.md` (decisions D1–D14);
- `brainstorm.md` (the agreed design).

Read the spec before each task: every user-visible string below is copied from it, and the spec wins if they differ.

## Global Constraints

- Fictional data only, in tests, fixtures, samples and screenshots.
- Never edit an applied migration. All database changes go in `supabase/migrations/035_post_efiling_stages.sql`.
- Every function 035 redefines is copied verbatim from its newest definition, with changed lines marked `-- 035`, and listed in the file header's table (as 033 does):
  - from 034: `check_payload`, `fixture_history`;
  - from 033: `apply_fixture_scenario`;
  - from 032: `act_mark_efiled`, `act_close_case`, `check_operation_authority`, `vitally_apply_action`;
  - from 009: `fixture_keys`.
- 035 is idempotent: `if not exists`, `create or replace`, drop-then-add.
- Staff screens stay English. Client text lives in `src/client-text.mjs` (English and 简体), and 繁體 is generated: run `npm run build:hant` and commit `src/zh-hant.mjs`.
- Client text uses 宾州 (never 宾夕法尼亚州). Don't unify the existing PCDC / 我们 mix.
- No client message or history line names any phone number, a reject code or a fix note.
- The refund sites appear as plain text: `irs.gov/refunds`, `mypath.pa.gov`.
- Error codes as today: `VALIDATION`, `INVALID_TRANSITION` (shown as not available), `FORBIDDEN`.
- Never run `supabase start` from the repo root. The test stack runs from `$VITALLY_STACK`.
- Commit after each task. Messages are in the repo's style ("Filing results: …").

## Review Focus

1. **Two admins record the same return at once.** The second is refused (its return already has an answer, `VALIDATION`), and nothing is recorded twice. Test in Task 3.
2. **"Today" for the date window is PCDC's day, not UTC's.** A result recorded at 9 PM Eastern with today's date is accepted. The handler compares with `(now() at time zone 'America/New_York')::date`. Test in Task 3, by asserting the expression.
3. **A fix note with HTML or very long text** is escaped on the case page and in Follow-ups, and a note over 1000 characters is refused. Tests in Tasks 3 and 8.
4. **A second filing that would make an unused combination** (federal paper, state e-filed, from an accepted state return and a federal return switched to paper) is refused with `VALIDATION`. Test in Task 4.
5. **A case e-filed before 035** (null methods) renders everywhere: pool, Follow-ups, case page, client page. Recording its result treats it as both e-filed. Tests in Tasks 3, 6 and 9.

---

### Task 1: Migration 035, part 1 — stages, columns, staff-only tables

**Files:**
- Create: `supabase/migrations/035_post_efiling_stages.sql`
- Create: `tests/database-filing.mjs` (picked up by `npm run test:database`'s `tests/database*.mjs` glob)

**Interfaces:**
- Produces:
  - stage values `rejected`, `accepted`;
  - `public.cases.federal_method`, `state_method` (`efile` | `paper` | null), and `federal_result`, `state_result` (`accepted` | `rejected` | `mailed` | null);
  - `public.filing_attempts(id uuid pk, workspace_id uuid, case_id uuid, attempt int, filed_at timestamptz default now(), filed_by uuid, unique(case_id, attempt))`;
  - `public.filing_notes(id uuid pk, workspace_id uuid, case_id uuid, attempt int, note text check (char_length(note) between 1 and 1000), recorded_by uuid, recorded_at timestamptz default now())`, with a foreign key to `filing_attempts(case_id, attempt)` and a `before update or delete` trigger `filing_notes_append_only` that raises `VT007 VALIDATION`;
  - `public.filing_returns(id uuid pk, workspace_id uuid, case_id uuid, attempt int, return_kind text check in ('federal','state'), method text, result text null, answered_on date null, reject_code text null, recorded_by uuid null, unique(case_id, attempt, return_kind))`.

  Foreign keys go to `cases` and `people` on `(workspace_id, …)`, as 001 does.

- [ ] **Step 1: Write the failing tests** in `tests/database-filing.mjs`, using `createDatabaseFixture`, like `tests/database-stages.mjs`:
  - `"the stage check accepts rejected and accepted"`: `f.sql("update public.cases set stage=$2 where id=$1", …)` succeeds for both, and fails for `'acknowledged'`.
  - `"method and result constraints"`: these each fail on a direct `update`:
    - `federal_method='paper', state_method='efile'`;
    - one method set and the other null;
    - `federal_result='mailed'` with `federal_method='efile'`;
    - `federal_result='accepted'` with `federal_method='paper'`;
    - a result with a null method.

    `('efile','efile')`, `('efile','paper')` and `('paper','paper')` succeed.
  - `"filing tables are staff-only"`: modelled on `tests/database-review.mjs` "questionnaire tables are staff-only". After a service-role insert into each of the three tables, `f.applicantA` selects `[]`, `f.presenter` selects 1 row, and both clients' inserts fail.
  - `"fix notes are append-only"`: after a service-role insert, an `update` and a `delete` on `filing_notes` through `f.sql` (the service role) each fail, and `f.presenter`'s update and delete fail too. The row is unchanged.
- [ ] **Step 2:** Run `npm run db:migrate:test && npm run test:database -- --test-name-pattern="stage check|constraints|staff-only"`. Expected: FAIL.
- [ ] **Step 3: Write 035's header and its first sections:**
  - the header table (Global Constraints);
  - the stage constraint (drop then add, the 032 list plus `rejected`, `accepted`);
  - the four columns with check constraints `cases_filing_methods` and `cases_filing_results`;
  - the three tables and `filing_notes`' append-only trigger, each table with RLS enabled, a presenter-only select policy copied from 033's `presenter_preparer_questionnaires` (adapting the table name), `revoke all … from public, anon, authenticated`, `grant select … to authenticated`, and `grant all … to service_role`. Neither table is added to `supabase_realtime`.
- [ ] **Step 4:** Run the same commands. Expected: PASS.
- [ ] **Step 5:** Commit: `Filing results: 035's stages, columns and staff-only tables`.

### Task 2: Mark e-filed records each return's method (first filing)

**Files:**
- Modify: `supabase/migrations/035_post_efiling_stages.sql`
- Test: `tests/database-filing.mjs`, `tests/database-stages.mjs` (its `CONFIRMED` MARK_EFILED calls)

**Interfaces:**
- Consumes: Task 1's columns and tables.
- Produces:
  - **The payload** `MARK_EFILED {confirmed: true, methods: {federal?: 'efile'|'paper', state?: 'efile'|'paper'}}`.
  - **`vitally_private.filing_line(p_federal text, p_state text) returns text`**: the client sentence for a pair of per-return states, `'waiting'|'accepted'|'rejected'|'mailed'` or null for "not in this line". It is combined when both are equal, federal first. These are the spec's per-return sentences. Task 3 uses it for result lines.
  - **`vitally_private.efiled_line(p_federal_method text, p_state_method text, p_second boolean) returns text`**: the Mark e-filed history lines from the spec's table. On a second filing, a null method means that return wasn't filed.
- [ ] **Step 1: Write the failing tests** (`"mark e-filed records the methods"`), starting from `f.approvedCase()` → `MARK_READY_TO_EFILE CONFIRMED`:
  - `{confirmed: true, methods: {federal: 'efile', state: 'efile'}}` → stage `efiled`, methods `efile/efile`, results null. One `filing_attempts` row with `attempt = 1` and two `filing_returns` rows. The last client message is `"PCDC e-filed your return."`.
  - `efile/paper` → `"PCDC e-filed your federal return and mailed your Pennsylvania return."`. `paper/paper` → `"PCDC mailed your returns."`.
  - Each refused with `VALIDATION`, the case staying at `ready_to_efile`:
    - `{confirmed: true}`;
    - `methods: {federal: 'paper', state: 'efile'}`;
    - `methods: {federal: 'efile'}`;
    - `methods: {federal: 'fax', state: 'efile'}`;
    - an extra key.
  - Update `tests/database-stages.mjs` and any other suite that sends `MARK_EFILED` with only `CONFIRMED` to send both e-filed. Find them with `rg -l MARK_EFILED tests`.
- [ ] **Step 2:** Run `npm run db:migrate:test && npm run test:database`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement:**
  - `check_payload` (copied from 034): `MARK_EFILED` needs `confirmed = true` and a `methods` object whose keys are a subset of `federal`, `state`, with values in `efile`, `paper`. The case-dependent rules go in the handler.
  - `filing_line`, `efiled_line`.
  - `act_mark_efiled` (copied from 032): on a first filing (both case methods null), both keys are required and the pair must be one of the three combinations. It sets the columns, inserts attempt 1 and both return rows, and returns `message = efiled_line(…, false)`, with detail `{attempt, methods}` and no codes.
- [ ] **Step 4:** Run the same commands. Expected: PASS.
- [ ] **Step 5:** Commit: `Filing results: Mark e-filed records each return's method`.

### Task 3: Record filing result

**Files:**
- Modify: `supabase/migrations/035_post_efiling_stages.sql`
- Test: `tests/database-filing.mjs`

**Interfaces:**
- Consumes: Task 2's `filing_line`, a case at `efiled`.
- Produces: the action `RECORD_FILING_RESULT {confirmed: true, results: {federal?: {result, date, code?}, state?: {result, date, code?}}, fixNote?: string}`, and `vitally_private.act_record_filing_result(p_member, p_case, p_person, p_payload) returns jsonb`. It is dispatched from `vitally_apply_action` and admin-only in `check_operation_authority`.
- [ ] **Step 1: Write the failing tests:**
  - `"one answer at a time"`: federal `accepted` with today's date → stays `efiled`, `federal_result = 'accepted'`, and the message `"The IRS accepted your federal return."`. Then state `accepted` → `accepted`, with `"Pennsylvania accepted your Pennsylvania return."`.
  - `"a rejection doesn't wait"`: federal `rejected`, code `IND-031-04` → `rejected`. Then state `accepted` at `rejected` → stays `rejected`.
  - `"both in one move"`: both accepted → `"The IRS and Pennsylvania accepted your returns."`. A mixed move (federal accepted, state rejected) → `"The IRS accepted your federal return. Your Pennsylvania return needs a correction before it can be accepted."`.
  - `"paper is mailed"`: on `efile/paper`, state `accepted` → `VALIDATION`; state `mailed` → OK, and with federal accepted → `accepted`.
  - `"refusals"`, each `VALIDATION` with nothing recorded:
    - an empty `results`;
    - a return already answered (this also covers Review Focus 1: the second of two identical calls);
    - a rejection with an empty, whitespace-only or 41-character code;
    - a code on an accepted return;
    - a date after `(now() at time zone 'America/New_York')::date`;
    - a date before the attempt's `filed_at` date;
    - a non-ISO date;
    - a `fixNote` on a move that leaves the case at `efiled` or `accepted`;
    - a 1001-character `fixNote`;
    - no `confirmed`.
  - `"fix notes are appended"`: a rejection with `fixNote` inserts one `filing_notes` row on the current attempt, with `recorded_by = f.sam`. Then, at `rejected`, recording the waiting state return as accepted with a second `fixNote` is accepted, and inserts a second row. Both rows remain, in `recorded_at` order. The `filing_returns` row has `answered_on`, `reject_code` and `recorded_by`. The client messages contain neither the code nor the note.
  - `"admin only"`: `f.alex`, `f.morgan`, null and `f.applicantA` → `FORBIDDEN`.
  - `"an older e-filed case"`: `f.sql` sets a case to `efiled` with null methods. Recording both accepted sets the methods to `efile/efile` and the stage to `accepted`.
  - `"the history lines all translate"`: for every pair in `{null, waiting, accepted, rejected, mailed}²` (except null/null) that `act_record_filing_result` or `act_mark_efiled` can produce (accepted, rejected and mailed only for result lines), `select vitally_private.filing_line($1,$2)`. Do the same for `efiled_line` over its 3 first-filing and 4 second-filing inputs. Assert each line is a key of `SENTENCES` imported from `../src/client-text.mjs`. This test passes only after Task 9; mark it `{ todo: "Task 9" }` until then.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - `check_payload`'s `RECORD_FILING_RESULT` branch: the shape, the result and code rules that need no case, the date format, the note length.
  - `act_record_filing_result`: allowed at `efiled`, or at `rejected` with a waiting return. Otherwise `INVALID_TRANSITION`.
    - **Null methods:** first set `efile/efile` and create attempt 1, as for an older case.
    - **Each named return** must be waiting (method set, result null), with the result fitting its method and the date window met. Write its columns and `filing_returns` row.
    - **A `fixNote`** is allowed when `p_case.stage = 'rejected'` or the new stage is `rejected`. Otherwise `VALIDATION`. It is inserted as a new `filing_notes` row on the current attempt and is never updated.
    - **The stage:** any rejected → `rejected`; else all accepted or mailed → `accepted`; else unchanged.
    - **Message:** `filing_line` of the recorded returns. Detail: `{attempt, results: {federal?: result, state?: result}, noteAdded: boolean}`, with no codes and no note text.
  - Two dispatch lines in `vitally_apply_action` (copied from 032), and the admin-only group in `check_operation_authority` (copied from 032).
- [ ] **Step 4:** Run `npm run db:migrate:test && npm run test:database`. Expected: PASS (except the `todo`).
- [ ] **Step 5:** Commit: `Filing results: record each return's answer`.

### Task 4: Return to signing, the second filing, and Close

**Files:**
- Modify: `supabase/migrations/035_post_efiling_stages.sql`
- Test: `tests/database-filing.mjs`, `tests/database-stages.mjs` (the close refusals)

**Interfaces:**
- Produces:
  - the action `RETURN_TO_SIGNING {confirmed: true}` and `vitally_private.act_return_to_signing(…)`. Its message is `"PCDC corrected your return. You need to sign it again."`;
  - `act_mark_efiled`'s second-filing branch;
  - `act_close_case` (copied from 032) with `rejected` allowed and `accepted` refused.
- [ ] **Step 1: Write the failing tests:**
  - `"return to signing waits for every answer"`: federal rejected with state waiting → `RETURN_TO_SIGNING` gives `INVALID_TRANSITION`. After state accepted → `review_approved`, with methods and results unchanged.
  - `"the second signing is not held up"`: `MARK_READY_TO_EFILE CONFIRMED` is accepted straight away, on a case approved with `wentOver: false` whose go-over was resolved the first time.
  - `"filing again"`, starting from federal accepted and state rejected, then back to `ready_to_efile`:
    - `methods: {state: 'paper'}` → `efiled`, methods `efile/paper`, `federal_result` still `accepted`, `state_result` null, attempt 2 with one `filing_returns` row. The message is `"PCDC mailed your Pennsylvania return."`.
    - `methods: {federal: 'efile', state: 'efile'}` → `VALIDATION` (it names an accepted return).
  - `"an unused combination on refiling"`: from state accepted and federal rejected, `methods: {federal: 'paper'}` → `VALIDATION`.
  - `"close"`: Close from `rejected` with a reason → `closed`. Close at `accepted` → `INVALID_TRANSITION`.
  - `"admin only"` for `RETURN_TO_SIGNING`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - `check_payload`: `RETURN_TO_SIGNING` is exactly `{confirmed: true}`.
  - `act_return_to_signing`: only at `rejected` with no return waiting.
  - `act_mark_efiled`'s second-filing branch: the methods are set and some result is `rejected`. The keys must equal the rejected returns. Their results are reset to null and their methods set. The resulting pair must be one of the three. Insert the next attempt with rows for the refiled returns only. The message is `efiled_line(new_or_null, new_or_null, true)`.
  - `act_close_case`.
  - Two more dispatch and authority lines.
- [ ] **Step 4:** Run `npm run db:migrate:test && npm run test:database`. Expected: PASS.
- [ ] **Step 5:** Commit: `Filing results: return to signing and file again`.

### Task 5: Privacy, realtime, and the two samples

**Files:**
- Modify: `supabase/migrations/035_post_efiling_stages.sql`
- Test: `tests/database-filing.mjs`, `tests/database-fixtures.mjs`, `tests/database-realtime.mjs`, `tests/support/database-fixture.mjs`

**Interfaces:**
- Produces:
  - fixture keys `rejected` and `accepted` (appended to `fixture_keys()`, after `review_approved`);
  - the samples: `accepted` (both e-filed, both accepted) and `rejected` (both e-filed, federal accepted, state rejected, with the code `IND-031-04` and the note "Fictional note: preparer to correct the dependent's SSN in TaxSlayer.").
- [ ] **Step 1: Write the failing tests:**
  - `"a client reads the result columns only"`: `f.applicantA.from('cases').select('federal_method,state_method,federal_result,state_result')` returns its row. All three filing tables return `[]`.
  - `"realtime carries no code"`: modelled on `tests/database-realtime.mjs`'s client-subscription tests. A client subscribed to its case receives the `cases` update after a rejection, and no payload it receives contains `IND-031-04` or the fix note.
  - `"no event message holds a code or note"`: after the full loop, no row in the events table's message column contains the code or the note.
  - In `tests/database-fixtures.mjs`, the fixture key list and sample counts include the two new keys. `rejected` reads as stage `rejected`, `efile/efile`, `accepted/rejected`, and one attempt with one `filing_notes` row. `accepted` reads as stage `accepted`, with no note. Update `FIXTURE_KEYS` in `tests/support/database-fixture.mjs`.
- [ ] **Step 2:** Run them. Expected: the fixture tests FAIL.
- [ ] **Step 3: Implement:**
  - `fixture_keys` (copied from 009).
  - `apply_fixture_scenario` (copied from 033): branches that take the case through the end state, setting columns and inserting attempt and return rows, and `rejected`'s note row.
  - `fixture_history` (copied from 034): their events, with messages from `efiled_line` / `filing_line`.
  - Each new sample gets a fictional client and answers, following how 033's `review_approved` sample gets its own.
- [ ] **Step 4:** Run `npm run db:migrate:test && npm run test:database`. Expected: PASS.
- [ ] **Step 5:** Commit: `Filing results: privacy checks and the rejected and accepted samples`.

### Task 6: Contracts, domain names, builders, store

**Files:**
- Modify: `src/contracts.mjs`, `src/domain.mjs`, `src/case-actions.mjs`, `src/supabase-store.mjs`
- Test: `tests/contracts.test.mjs` (or wherever `STAGES` is asserted: `rg -l "STAGES" tests`), `tests/domain.test.mjs`, `tests/case-actions.test.mjs`, the store test for `relatedRows`

**Interfaces:**
- Consumes: Tasks 1–4's columns, tables and payloads.
- Produces:
  - **Stages and actions:** `STAGES` with `rejected` and `accepted` after `efiled`; `CASE_ACTIONS` with `RECORD_FILING_RESULT` and `RETURN_TO_SIGNING`.
  - **Record fields:** the store maps the columns to `record.federalMethod`, `stateMethod`, `federalResult`, `stateResult`. For staff, `record.filingAttempts` is `[{attempt, filedAt, returns: [{returnKind, method, result, answeredOn, rejectCode}], notes: [{note, recordedBy, recordedByName, recordedAt}]}]`, newest attempt first, with notes oldest first, and `[]` for a client. `latestFixNote(record) -> string | null` (in `src/domain.mjs`) is the newest note across attempts.
  - **In `src/domain.mjs`:**
    - `filingMethodKind(record) -> 'both_efile' | 'efile_and_paper' | 'both_paper' | null`;
    - `returnState(record, kind) -> 'waiting' | 'accepted' | 'rejected' | 'mailed' | null`. A paper return with a null result is `'mailed'`; a null method is `null`;
    - `waitingReturns(record) -> Array<'federal'|'state'>`: method set and result null, in federal-then-state order;
    - `awaitsAcknowledgment(record) -> boolean`: some waiting return is `efile`;
    - `returnedToSigning(record) -> boolean`: stage `review_approved` and `federalMethod` not null;
    - `describeStage(stage, lang, record)` returning per-method `label` and `clientLabel` (the spec's tables), with the pre-change fallback "E-filed".
  - **In `src/case-actions.mjs`,** builders `MARK_EFILED` (`methods` from form values `method-federal` and `method-state`, or the one combination radio `filing-combination` on a first filing), `RECORD_FILING_RESULT` (form values `result-<kind>`, `date-<kind>`, `code-<kind>`, `fix-note`) and `RETURN_TO_SIGNING` (`confirmation(values, "Confirm that the fix is done.")`).
- [ ] **Step 1: Write the failing tests:**
  - **`describeStage`:**
    - `describeStage("efiled","en",{federalMethod:"efile",stateMethod:"paper"}).label === "E-filed & paper"`, and its `clientLabel` is `"Filed"`;
    - `accepted` with `paper/paper` → label `"Mailed"`, client `"Complete"`;
    - `efiled` with null methods → `"E-filed"` / `"E-filed"`;
    - `rejected` → `"Rejected"` / `"Needs a correction"`.
  - **The helpers:** `returnState` for each case above, `waitingReturns`, `awaitsAcknowledgment` (false for a case waiting only on a paper return), `returnedToSigning`.
  - **The builders:** each payload shape, and the refusals "Choose how each return was filed.", "A reject code is required.", "A date is required." and "Confirm that the fix is done.". These are staff text, written here.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the functions above, and add the three tables to `relatedRows` (`src/supabase-store.mjs`, beside `preparer_questionnaires`).
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `Filing results: contracts, stage names, builders and store`.

### Task 7: Staff case page — office actions, Filing panel, lifecycle bar

**Files:**
- Modify: `src/admin-views.mjs` (`officeActionsPanel`, ~525), `src/staff-views.mjs` (`LIFECYCLE` ~754, `lifecycleBar`, `stageWork` ~144, `EVENT_SENTENCES` ~1863), `src/app.mjs`, `src/views.mjs`
- Test: `tests/admin-views.test.mjs`, `tests/staff-views.test.mjs`, `tests/fixtures/confirm-dialogs.json`, `tests/shell.test.mjs`

**Interfaces:**
- Consumes: Task 6's helpers and builders.
- Produces:
  - `filingPanel(record) -> string`, exported from `src/staff-views.mjs`;
  - `lifecycleBar(record)`, which now takes the record (update its callers);
  - the dialog actions `open-record-filing-result` and `open-return-to-signing`, beside the existing `open-mark-efiled`.
- [ ] **Step 1: Write the failing tests:**
  - **The office actions panel:**
    - at `efiled`, an admin sees "Record filing result…"; volunteers see none of the new buttons;
    - at `rejected` with no return waiting, "Return to signing…" and Close; with a return waiting, the text "Waiting for Pennsylvania's answer before the return can go back to signing.";
    - at `review_approved` with `returnedToSigning`, the Mark ready to e-file dialog says this is the client's second signing.
  - **The Mark e-filed dialog:** on a first filing it offers three choices; after a rejection it offers only the rejected return and lists the accepted one as done.
  - **The Return to signing dialog:** its box reads "The fix is done.".
  - **`filingPanel`:** it renders method, result, date and code per return, newest attempt first, then each attempt's notes oldest first, each with its author's name and time. A fix note `<b>x</b>` renders escaped (Review Focus 3). It renders nothing before `efiled`.
  - **`lifecycleBar`:**
    - it includes Accepted after E-filed;
    - at `rejected`, the E-filed step carries the mark class;
    - a pre-change `efiled` record labels the step "E-filed" (Review Focus 5).
  - **`stageWork`:** the three "Your next step" texts, copied exactly from the spec.
  - **`EVENT_SENTENCES`:** `RECORD_FILING_RESULT` is "recorded the filing result", and `RETURN_TO_SIGNING` is "returned the case to signing".
  - **Dialog fixtures:** add the two dialogs to `tests/fixtures/confirm-dialogs.json`, naming the client and the application ID like Mark e-filed's.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the panel buttons, dialogs, `filingPanel` (placed after `nextStep` on the staff case page), the bar, the texts, and the wiring in `src/app.mjs` and `src/views.mjs`. Toasts: "The filing result is recorded." and "The case is back at signing.".
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `Filing results: the staff case page`.

### Task 8: Case pool and Follow-ups

**Files:**
- Modify: `src/pool-views.mjs` (`POOL_TABS` 7, `poolPhase` ~29), `src/office-views.mjs` (`QUEUE_KINDS`, `followupQueue` ~103, row text ~189, buttons ~210, `waitingTone`)
- Test: the pool tests (`rg -l poolPhase tests`), `tests/office-views.test.mjs`

**Interfaces:**
- Consumes: Task 6's `waitingReturns`, `awaitsAcknowledgment`, `returnedToSigning` and `describeStage(…, record)`.
- Produces:
  - `POOL_TABS` with `["attention", "Needs attention"]` and `["done", "Done"]` before `["closed", "Closed"]`;
  - `QUEUE_KINDS` with `["result", "Filing result"]` and `["rejected", "Rejected"]`, before `"call"`.
- [ ] **Step 1: Write the failing tests:**
  - **`poolPhase`:** `rejected` → `attention`, `accepted` → `done`; Filing still holds `ready_to_efile` and `efiled`.
  - **`followupQueue`** gives one `result` row for an `efiled` case, one `result` row and one `rejected` row for a `rejected` case with a return waiting, and no row for `accepted`.
  - **Row texts**, exactly as in the spec:
    - "Waiting for the IRS and Pennsylvania.";
    - "Waiting for Pennsylvania's answer.";
    - "Record when the returns are mailed.";
    - "Rejected: contact the client to fix and sign again.", followed by `latestFixNote(record)`, escaped. With two notes, only the second shows;
    - the Signing row's "Waiting for the client to sign again.".
  - **Tone:**
    - a both-e-filed row 3 days old is amber, and one 5 days old is red;
    - a both-paper row 6 days old has no tone;
    - a Rejected row 6 days old has no tone.
  - **Pre-change records:** a pre-change `efiled` record produces a row reading "Waiting for the IRS and Pennsylvania." (Review Focus 5).
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the above. Use the existing icons in `KIND_ICONS` (`result: "clock"`, `rejected: "help"`), and the buttons "Record filing result…" and "Return to signing…".
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `Filing results: the case pool and Follow-ups`.

### Task 9: The client's page and text

**Files:**
- Modify: `src/client-text.mjs`, `src/client-views.mjs` (`PROGRESS_STEPS` 287, `REVIEW_STAGES` 295, `progressTrack`), `src/domain.mjs` (`signingMessage` for the re-sign variant), `src/zh-hant.mjs` (generated)
- Test: `tests/client-views.test.mjs`, `tests/client-language.test.mjs`, and Task 3's `todo` test

**Interfaces:**
- Consumes: Task 6's `returnState` and `returnedToSigning`.
- Produces:
  - **Text keys** in `src/client-text.mjs`: `filing.<federal|state|both>.<waiting|accepted|rejected|mailed>`, `filing.closing.rejected`, `filing.closing.accepted`, `stage.review_approved.client.resign`, and `stage.<efiled|accepted|rejected>.label…` per the spec's label table. Every history line from Task 3's test goes in `SENTENCES`.
  - **`filingMessage(record, lang) -> string`** in `src/client-views.mjs` (or `src/domain.mjs`, beside `signingMessage`, if `describeStage` should return it). Its rule: the combined sentence when both states are equal, else federal then state; then the stage's closing sentence. A pre-change `efiled` keeps "Your return was e-filed. The IRS will confirm whether it is accepted.".
- [ ] **Step 1: Write the failing tests**, copying every expected string from the spec's scenarios:
  - "Both returns waiting", "One accepted, one waiting", "Rejected, in 简体", "Mailed", "Complete" (with `irs.gov/refunds` and `mypath.pa.gov` as text and no `<a`), and "Sign again";
  - **the stepper:** at `rejected`, Filing is current; at `accepted`, all five are `done` and none is `current`;
  - no rendered client page contains `IND-031-04` or the fix note, even when the record carries `filingAttempts`;
  - in `tests/client-language.test.mjs`: every new message and history line has 简体; none matches the existing phone-number pattern test; and 繁體 is generated.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the text, `filingMessage`, the re-sign variant in `signingMessage`, and the stepper changes. Run `npm run build:hant`. Remove the `todo` from Task 3's translation test.
- [ ] **Step 4:** Run `npm test`, `npm run build:hant -- --check`, and `npm run test:database -- --test-name-pattern="translate"`. Expected: PASS.
- [ ] **Step 5:** Commit: `Filing results: what the client reads` (include `src/zh-hant.mjs`).

### Task 10: The browser story

**Files:**
- Modify: `tests/browser.mjs` (after the class case's Mark e-filed, ~2866)

**Interfaces:**
- Consumes: everything above, through the UI only.
- [ ] **Step 1: Continue the class's case through brainstorm Q11's six steps**, using the story's existing helpers (`revealCaseControl`, `clickAction`, `dialogText`):
  1. Mark e-filed, choosing both e-filed. Assert the "Both e-filed" badge.
  2. Record filing result: federal accepted, state rejected with `IND-031-04` and a fictional fix note. Assert:
     - the pool's Needs attention tab lists the case;
     - Follow-ups' Rejected row shows the note;
     - the Filing panel shows the code;
     - the client page in 简体 reads the "Rejected, in 简体" sentence, with no code.
  3. Return to signing. Assert Waiting on client, and the client's re-sign message.
  4. Mark ready to e-file. Assert the second-signing sentence in the dialog.
  5. Mark e-filed. Assert only the PA-40 is offered; choose paper.
  6. Record filing result: state mailed. Assert the pool's Done tab, the "Accepted & mailed" badge, and the client's "Complete" badge with both refund sites.
- [ ] **Step 2:** Run `npm run test:browser` (about 11–16 minutes). Expected: PASS, with the story count above the baseline of 63.
- [ ] **Step 3:** Commit: `Filing results: the story walks the rejection loop`.

### Task 11: Docs

**Files:**
- Modify: `docs/media/return-lifecycle.svg`, `docs/demo-script.md`, `docs/developer/database.md`, `docs/developer/frontend.md` (the stage list ~323 and ~343, and the client stepper ~348, which change 1 updated), `docs/developer/production-roadmap.md` (§4 table and "To build next"), `docs/setup.md` (only if it names the sample list)

- [ ] **Step 1: The diagram:**
  - relabel "IRS acknowledged" as the wait at E-filed;
  - add Rejected's "Return to signing" edge label;
  - mark the amendment boxes "not built yet".

  Keep the layout. Don't touch any logo.
- [ ] **Step 2:**
  - The demo script's "What is simulated, and what is real" table: filing results are recorded by hand; nothing is sent to the IRS or Pennsylvania.
  - The database guide: the new actions and tables, including `filing_notes`' append-only rule.
  - The frontend guide: the two new stages in its stage lists, the per-method names and client labels, and the stepper's Rejected placement and complete state.
  - The roadmap §4: the IRS's answer is built; amendments and reassignment are not.
- [ ] **Step 3:** Commit: `Filing results: diagram and docs`.

### Task 12: Final checks

- [ ] **Step 1:** Run `npm test`, `npm run build:hant -- --check`, `npx openspec validate --all`, `npm run db:migrate:test`, `npm run test:database` and `npm run test:browser`. Expected: all pass. Record the counts against the baseline (unit 1235, database 326, story 63) for `verify.md`. `npm run test:auth-browser` isn't needed: nothing touches sign-in.
- [ ] **Step 2:** Check off `tasks.md` to match, and commit.
