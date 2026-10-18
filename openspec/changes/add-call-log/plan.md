# Call Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff log, edit (with kept history) and copy one-line summaries of contacts on any case, in a new Calls tab, with clients unable to read any of it.

**Architecture:** One new migration adds two staff-only tables (`case_calls`, `case_call_versions`) and two standalone RPCs (`vitally_log_call`, `vitally_edit_call`) beside `vitally_apply_action`, reusing only `require_membership`, `reserve_receipt` and `lock_case`. The browser reads the calls with the staff case, builds the summary line in one pure module (`src/call-log.mjs`), and renders a shared `callsPanel` in both case renderers.

**Tech Stack:** Postgres/PL/pgSQL on Supabase (RLS, Realtime), plain ES modules, `node:test`, Playwright.

**Spec:** `openspec/changes/add-call-log/specs/staff-case-work/spec.md`, with `design.md` (decisions D1–D9) and `brainstorm.md` ("Findings during propose") in the same folder. Read all three before Task 1.

## Global Constraints

- Fictional data only in code, tests and fixtures. Never touch `src/pcdc-logo.png`.
- Never edit an applied migration. The new file is `supabase/migrations/031_call_log.sql`. Redefine **no** existing function (no `check_operation_authority`, `check_authority`, `check_payload`, `check_related`, `vitally_apply_action`, `apply_fixture_scenario`, `seed_fixtures`).
- Never run `supabase start` from the repo root; the stack runs from `$VITALLY_STACK` (docs/setup.md).
- Staff screens are English; no `src/client-text.mjs` change, so no 繁體 regeneration.
- Stored keys are fixed (the questionnaire change reads them): `with_whom` ∈ `client|spouse|other`; `method` ∈ `phone|text|email|in_person|video`; `purpose` ∈ `go_over_return|ask_question|request_documents|schedule_appointment|other`; `outcome` ∈ `reached|no_answer|left_voicemail|wrong_number`.
- Limits: other name 1–80 characters (trimmed, non-blank); note 1–1000 characters, blank stored as null.
- Error codes: `VT001` FORBIDDEN, `VT002` NOT_FOUND, `VT003` CONFLICT, `VT007` VALIDATION.
- Exact copy: tab "Calls"; section heading "Calls"; buttons "Copy all", "Copy", "Edit", "Add call", "Save changes", "Cancel"; form legend "Add a call"; empty line "No calls logged yet."; "edited <time>"; "Earlier versions (<n>)"; toasts "The call is logged.", "The call is updated.", "Copied.", "Copied <n> calls.", "Copy did not work. Select the line and copy it by hand.", "Type the name of the person you contacted."; conflict message "Someone else changed this call. The newest version is shown — check it and try again."
- Summary line (design D7): `M/D/YYYY h:mm AM/PM — <logger> → <who>, <method> — <purpose> — <outcome>.` + ` Note: <note>` when there is a note. The separators are an em dash with spaces (` — `) and a right arrow with spaces (` → `).
- Browser story: run from the main checkout, and ask Hailey before switching it to this branch.

## Review Focus

1. **A note with HTML or quotes** (`<b>`, `"`, `&`) must render as text in the tab and copy as typed. Test in Task 4.
2. **A persona switch mid-edit**: Alex opens Edit, the presenter switches to Morgan; Morgan must not see Alex's edit form or be able to save it. Test in Task 4 (Edit form shown only when `mayEditCall` holds for the current persona).
3. **A Realtime redraw while typing in the Add a call form** must keep what was typed (form drafts keyed by field id). Test in Task 5 (story types, another window logs, text survives).
4. **An entry whose logger left the roster** (`logged_by_person_id` not in `listPeople()`) must read "Unknown person", not crash. Test in Task 2.
5. **A replayed log after a timeout** must not create a second entry. Test in Task 1 (same action id and envelope returns the same receipt and one row).

---

### Task 1: Database: tables, policies and RPCs

**Files:**
- Create: `supabase/migrations/031_call_log.sql`
- Create: `tests/database-calls.mjs`
- Modify: `tests/support/database-fixture.mjs` (add `callArgs`, `editCallArgs`, `f.logCall`, `f.editCall`)

**Interfaces:**
- Consumes: `vitally_private.require_membership()`, `reserve_receipt(member, actionId, operation, digest, personId)`, `lock_case(member, caseId)` (migration 003), `vitally_private.payload_keys` (003).
- Produces:
  - `public.vitally_log_call(p_action_id uuid, p_case_id uuid, p_person_id uuid, p_entry jsonb) returns jsonb` → `{actionId, callId, caseId, revision: 1}`.
  - `public.vitally_edit_call(p_action_id uuid, p_call_id uuid, p_expected_revision bigint, p_person_id uuid, p_entry jsonb) returns jsonb` → `{actionId, callId, caseId, revision}`.
  - `p_entry` has exactly the keys `method, note, otherName, outcome, purpose, withWhom`; `otherName` and `note` are a string or JSON `null`.
  - `public.case_calls(id, workspace_id, case_id, logged_by_user_id, logged_by_person_id, logged_at, revision, edited_at, with_whom, other_name, method, purpose, outcome, note)`.
  - `public.case_call_versions(call_id, version, workspace_id, case_id, edited_by_user_id, edited_by_person_id, created_at, with_whom, other_name, method, purpose, outcome, note)`, primary key `(call_id, version)`.
  - Fixture: `callArgs({actionId?, caseId, personId, entry})`, `editCallArgs({actionId?, callId, revision, personId, entry})`, `f.logCall(client, caseId, personId, entry)`, `f.editCall(client, callId, personId, entry)` (reads the current revision first), and `SAMPLE_CALL = {withWhom:"client", otherName:null, method:"phone", purpose:"go_over_return", outcome:"reached", note:"Asked about the fictional 1099-R."}`.

- [ ] **Step 1: Write the failing database tests** in `tests/database-calls.mjs`, one `test(...)` with `t.test` subtests, the `createDatabaseFixture()` / `finally { await f.close() }` shape of `tests/database-assistance.mjs`, and a `refuseCall(f, client, rpc, args, code)` helper asserting `error.code === code` and `await f.receiptsFor(args.p_action_id) === 0`. Subtests:
  - `"each staff persona logs a call at any stage"`: on `f.readyCase()` (Alex), `f.preparedCase()` (Morgan) and `f.assistedCase()` (Sam), `f.logCall` succeeds; the row has `logged_by_person_id` = that persona, `revision` 1, `edited_at` null, `logged_at` within 60 s of now; `case_call_versions` has exactly version 1 with the same fields; the case's `revision`, its `case_events` count and its `client_events` count are unchanged.
  - `"an entry that breaks a rule is refused"`: `VT007` for `{withWhom:"other", otherName:null}`, `{withWhom:"other", otherName:"  "}`, `{withWhom:"client", otherName:"Jordan Lee"}`, `otherName` of 81 characters, `method:null`, `method:"fax"`, `purpose:"chat"`, `outcome:"busy"`, a note of 1001 characters, an extra key `phone`, a missing key `note`.
  - `"a blank note is stored as no note"`: `note:"   "` stores `null`.
  - `"who may log"`: `VT001` for `f.applicantA` on its own case, for `p_person_id` null, for a persona from `f.foreignPeople`; `VT002` for a presenter on `f.draftCase(f.applicantA)` (a client's private draft).
  - `"the logger and an admin edit, and every version is kept"`: Alex logs `outcome:"no_answer"`; Alex edits to `left_voicemail` (revision 2, `edited_at` set); Sam edits to `reached` (revision 3); `logged_at` and `logged_by_person_id` unchanged; versions 1–3 hold `no_answer`, `left_voicemail`, `reached` with `edited_by_person_id` Alex, Alex, Sam.
  - `"another persona cannot edit"`: Morgan logs; Alex's edit is `VT001`; the row is unchanged.
  - `"a stale edit is a conflict"`: two edits with `p_expected_revision` 1; the second is `VT003`.
  - `"a replay returns the same receipt"`: the same `callArgs` twice returns deep-equal results and one row; the same action id with another entry is `VT007`.
  - `"nobody deletes or writes the tables directly"`: for `f.presenter` and `f.applicantA`, `from("case_calls").delete().eq("id", id)` and `.update({outcome:"reached"})` and `.insert(...)` either error or affect no row, and the row is unchanged; the same for `case_call_versions`.
  - `"a client reads nothing"`: after a call on `f.applicantA`'s submitted case, `f.applicantA.from("case_calls").select("*").eq("case_id", caseId)` and the same for `case_call_versions` return `[]`; `f.presenter` reads one row from each.
  - `"a sample reset removes sample cases' calls"`: log a call on a fixture case, call `vitally_reset_fixtures`, and no `case_calls` or `case_call_versions` row for that case id remains.
- [ ] **Step 2: Run them to see them fail**
  Run: `npm run test:database -- --test-name-pattern="call"` (or `node --env-file=.env.test --test tests/database-calls.mjs`)
  Expected: FAIL, `vitally_log_call` does not exist.
- [ ] **Step 3: Write `supabase/migrations/031_call_log.sql`** with a header comment in the style of 013 (what, why beside `vitally_apply_action` per D1/D3, which helpers it reuses). In order:
  1. The two tables (design D4) with `check` constraints for every rule in Global Constraints, including `check((with_whom='other') = (other_name is not null))`, same-workspace foreign keys to `cases` (`on delete cascade`), `memberships` and `people`; `case_call_versions.call_id` references `case_calls(id) on delete cascade`; index `case_calls(case_id, logged_at)`.
  2. RLS with one select policy per table, copied from `presenter_case_materials` (013) with the table name changed; `revoke all … from public, anon, authenticated`; `grant select … to authenticated`; `grant select, insert, update, delete … to service_role`.
  3. Realtime: add both to `supabase_realtime` with 013's idempotent `do $$` block.
  4. `vitally_private.check_call_entry(p_entry jsonb) returns jsonb` (immutable, raises `VT007`): keys equal `array['method','note','otherName','outcome','purpose','withWhom']`; values in the key sets; `otherName` a non-blank string ≤ 80 exactly when `withWhom='other'`, else JSON null; `note` null or a string ≤ 1000. Returns the entry with `note` trimmed-blank turned into null and `otherName` trimmed.
  5. `vitally_log_call`: `require_membership()`; `VT007` if any argument is null or `p_entry` is not an object; if `access<>'presenter'` raise `VT001`; digest `jsonb_build_object('operation','LOG_CALL','caseId',…,'personId',…,'entry',p_entry)` with `extensions.digest(…,'sha256')` as 005 does; `reserve_receipt(…,'LOG_CALL',…)`; if the receipt has a stored `receipt`, re-check the persona and return it; `lock_case`; persona must exist in the member's workspace (`VT001`); `check_call_entry`; insert the call and version 1; `update public.action_receipts set target_id=<call id>, receipt=<result> where id=<receipt id>`; return the result.
  6. `vitally_edit_call`: as above with operation `EDIT_CALL` and `p_call_id`/`p_expected_revision` in the digest; lock the `case_calls` row `for update` in the member's workspace (`VT002` if absent), then `lock_case` on its case (`VT002` covers a case no longer visible); persona is the logger or has `admin`, else `VT001`; `revision<>p_expected_revision` → `VT003`; `check_call_entry`; insert version `revision+1`; update the current fields, `revision`, `edited_at=now()`.
  7. `revoke all on function … from public, anon, authenticated; grant execute … to authenticated;` for both public functions, and finish with 017's `revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;`.
- [ ] **Step 4: Add the fixture helpers** listed in Interfaces to `tests/support/database-fixture.mjs`, next to `assistanceArgs` and `f.actAssistance`.
- [ ] **Step 5: Apply and run**
  Run: `npm run db:migrate:test` then `npm run test:database`
  Expected: the new file passes and every other database file still passes.
- [ ] **Step 6: Commit**
  ```bash
  git add supabase/migrations/031_call_log.sql tests/database-calls.mjs tests/support/database-fixture.mjs
  git commit -m "Call log: tables, staff-only policies and the log and edit RPCs (OpenSpec change add-call-log)"
  ```

### Task 2: The summary line

**Files:**
- Create: `src/call-log.mjs`
- Test: `tests/call-log.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (all exported from `src/call-log.mjs`):
  - `CALL_WITH`, `CALL_METHODS`, `CALL_PURPOSES`, `CALL_OUTCOMES`: frozen arrays of `[key, label]` in the order of Global Constraints. Labels for the line and the selects: client/spouse/Other; phone/text/email/in person/video; Go over tax return/Ask a question/Request documents/Schedule an appointment/Other; Reached/No answer/Left voicemail/Wrong or invalid number. (The With radios show "Client", "Spouse", "Other"; the line uses lower-case "client"/"spouse".)
  - `staffShortName(name: string|null) => string`.
  - `callTime(iso: string, timeZone?: string) => string`, for example `"10/17/2026 3:45 PM"`.
  - `callSummary(entry, { answers = {}, timeZone } = {}) => string`. `entry` is camelCase: `{loggedAt, loggedByName, withWhom, otherName, method, purpose, outcome, note}`.
  - `callSummaries(entries, options) => string`: oldest first by `loggedAt`, joined with `"\n"`.

- [ ] **Step 1: Write the failing tests** in `tests/call-log.test.mjs` (`node:test`, `assert/strict`), all with `timeZone: "America/New_York"`:
  - `"the line matches the agreed example"`: `callSummary({loggedAt:"2026-10-17T19:45:00Z", loggedByName:"Hailey Zhang", withWhom:"client", otherName:null, method:"phone", purpose:"go_over_return", outcome:"reached", note:"asked about the 1099-R; she'll bring it Monday."}, {answers:{tp_first_name:"Mei", tp_last_name:"Wang"}, timeZone})` equals `"10/17/2026 3:45 PM — Hailey Z. → client (Mei Wang), phone — Go over tax return — Reached. Note: asked about the 1099-R; she'll bring it Monday."`.
  - `"a one-word persona, the spouse and no note"`: Alex, spouse `sp_first_name:"Lin", sp_last_name:"Wang"`, text, request_documents, no_answer, note null → ends with `"— Alex → spouse (Lin Wang), text — Request documents — No answer."`.
  - `"another person"`: Morgan, other `"Jordan Lee"`, video, schedule_appointment, left_voicemail → contains `"— Morgan → Jordan Lee, video — Schedule an appointment — Left voicemail."`.
  - `"no names in the intake"`: client → `"→ client, phone"`; spouse → `"→ spouse, phone"`; only a first name → `"client (Mei)"`.
  - `"an unknown logger"`: `loggedByName: null` → `"— Unknown person →"`.
  - `"staffShortName"`: `"Hailey Zhang"`→`"Hailey Z."`; `"Mary Ann Lee"`→`"Mary L."`; `"Alex"`→`"Alex"`; `"  Sam  "`→`"Sam"`; `null`→`"Unknown person"`.
  - `"note punctuation and line breaks"`: note `"Call back Friday."` → ends `"Reached. Note: Call back Friday."` (one period); note `"line one\nline two"` → `"Note: line one line two"`.
  - `"wrong number reads in full"`: outcome `wrong_number` → `"— Wrong or invalid number."`.
  - `"callSummaries is oldest first, one per line"`: three entries given newest first → three lines, oldest first, joined by `"\n"`, no trailing newline.
  - `"every option has its label"`: each list's keys equal the Global Constraints key sets, in order.
- [ ] **Step 2: Run them to see them fail**
  Run: `node --test tests/call-log.test.mjs`
  Expected: FAIL, cannot find module `../src/call-log.mjs`.
- [ ] **Step 3: Implement `src/call-log.mjs`.** `callTime` uses `Intl.DateTimeFormat("en-US", {year:"numeric", month:"numeric", day:"numeric", hour:"numeric", minute:"2-digit", hour12:true, timeZone})` and joins the date and time with one space (no comma). Names are trimmed and joined with one space. `src/call-log.mjs` imports nothing from `staff-views.mjs` (which imports it); a missing name falls back to the literal "Unknown person", with a comment that it matches `UNKNOWN_PERSON` (`src/staff-views.mjs:77`). The note's whitespace runs collapse to one space; a period is added after the outcome only.
- [ ] **Step 4: Run them to see them pass**
  Run: `node --test tests/call-log.test.mjs`, then `npm test`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add src/call-log.mjs tests/call-log.test.mjs
  git commit -m "Call log: the one-line summary (OpenSpec change add-call-log)"
  ```

### Task 3: Store and controller

**Files:**
- Modify: `src/supabase-store.mjs` (`STAFF_TABLES`, a new `mapCall`, `mapStaffCase`, `getCase` staff path, `logCall`, `editCall`)
- Modify: `src/staff-views.mjs:169-213` (`decorateStaffCase`: names on calls and versions)
- Modify: `src/controller.mjs` (new `logCall`, `editCall`, exported beside `runAssistanceAction`)
- Test: `tests/store.test.mjs`, `tests/controller.test.mjs`, `tests/staff-views.test.mjs`

**Interfaces:**
- Consumes: Task 1's RPC signatures and columns.
- Produces:
  - Staff case field `calls: Array<{id, caseId, revision:number, loggedAt, editedAt, loggedByPersonId, withWhom, otherName, method, purpose, outcome, note, versions: Array<{version:number, createdAt, editedByPersonId, withWhom, otherName, method, purpose, outcome, note}>}>`, entries oldest first, versions in ascending order. After `decorateStaffCase`, each call also has `loggedByName` and each version has `editedByName` (from `nameOf`, so an unknown id gives `UNKNOWN_PERSON`).
  - `store.logCall({actionId?, caseId, personId, entry})` and `store.editCall({actionId?, callId, expectedRevision, personId, entry})`, using `actionId(request)` and `call(...)`.
  - `controller.logCall(caseId, entry) => Promise<request>` and `controller.editCall(callId, entry) => Promise<request>`; both throw on failure after setting `state.error` the way `runAssistanceAction` does.

- [ ] **Step 1: Write the failing store tests** in `tests/store.test.mjs` with its existing fake client:
  - `"the staff case carries its calls with their versions"`: rows for two calls and three versions map to `calls` oldest first with `versions` ascending and camelCase fields, and `revision` is a number.
  - `"the client path never reads the call log"`: the applicant `getCase` names neither `case_calls` nor `case_call_versions`.
  - `"log and edit call their RPCs"`: `logCall` calls `vitally_log_call` with `{p_action_id, p_case_id, p_person_id, p_entry}`; `editCall` calls `vitally_edit_call` with `{p_action_id, p_call_id, p_expected_revision, p_person_id, p_entry}`; a retried request object keeps its `actionId`.
  - `"the staff channel watches the call log"`: `SUBSCRIBED_TABLES.presenter` includes both tables and `SUBSCRIBED_TABLES.applicant` includes neither.
- [ ] **Step 2: Write the failing controller tests** in `tests/controller.test.mjs` with its store double:
  - `"logging a call sends the persona and re-reads the case"`: `logCall("c1", entry)` sends `personId` = selected persona and `caseId` "c1", then calls `getCase("c1")` once; `state.busy` is false afterwards.
  - `"editing sends the revision on screen"`: with `calls:[{id:"k1", revision:2}]` on the open case, `editCall("k1", entry)` sends `expectedRevision: 2`.
  - `"a conflicting edit shows the newest version"`: the store throws `{code:"CONFLICT"}`; `state.error.message` is the conflict message from Global Constraints, and the case is re-read.
  - `"an edit of a call that is not on screen is refused without a call"`: `editCall("missing", entry)` rejects with `NOT_FOUND` and the store is not called.
  - `"a call log change on the open case re-reads it"`: `handleChange({table:"case_calls", caseId:"c1"})` while `selectedCaseId` is "c1" re-reads the case; with another case id it does not.
- [ ] **Step 3: Write the failing decoration test** in `tests/staff-views.test.mjs`: `"calls get the logger's and editor's names"`: `decorateStaffCase` with people `[{id:"p1", name:"Alex"}]` gives `loggedByName:"Alex"` and versions `editedByName:"Alex"`; an id not in the roster gives `UNKNOWN_PERSON`.
- [ ] **Step 4: Run them to see them fail**
  Run: `npm test`
  Expected: the new tests FAIL; the others pass.
- [ ] **Step 5: Implement.** `getCase` (staff branch) adds `calls: await relatedRows("case_calls", id, "id")` (it orders by `created_at`, so order this one by `logged_at` instead: a direct query `.order("logged_at").order("id")`) and `callVersions: await read(client.from("case_call_versions").select("*").eq("case_id", id).order("call_id").order("version"))`; `mapStaffCase` takes `calls = [], callVersions = []` and builds `calls` with `mapCall(row, callVersions)`. The controller's `logCall`/`editCall` follow `runAssistanceAction` (`newActionId()`, `state.busy`, `noteConnected`, `noteFailure`) but re-read with `loadSelected()`. `handleChange` needs no change if the open case is matched by `change.caseId`; confirm with the test.
- [ ] **Step 6: Run them to see them pass**
  Run: `npm test`
  Expected: PASS.
- [ ] **Step 7: Commit**
  ```bash
  git add src/supabase-store.mjs src/controller.mjs src/staff-views.mjs tests/store.test.mjs tests/controller.test.mjs tests/staff-views.test.mjs
  git commit -m "Call log: read with the staff case, log and edit through the controller (OpenSpec change add-call-log)"
  ```

### Task 4: The Calls tab

**Files:**
- Modify: `src/staff-views.mjs` (`CASE_TABS` at :676, new exported `callsPanel` and `mayEditCall`, `renderStaffCase` at :1436)
- Modify: `src/admin-views.mjs:583-631` (`renderAdminCase`)
- Modify: `src/app.mjs` (submit routing at :1777, click actions near `copy-reference` at :1640)
- Modify: `src/styles.css`
- Test: `tests/staff-views.test.mjs`, `tests/admin-views.test.mjs`

**Interfaces:**
- Consumes: `callSummary`, `callTime`, the option lists (Task 2); decorated `calls` (Task 3); `controller.logCall`, `controller.editCall` (Task 3); `controller.togglePanel(name)` and `state.openPanels` (existing).
- Produces:
  - `mayEditCall(call, person) => boolean`: `person?.id === call.loggedByPersonId || person?.capabilities?.includes("admin")`.
  - `callsPanel(record, person, ui) => string`. The edit form for a call is open when `ui.openPanels` includes `call-edit:<callId>` and `mayEditCall` holds.
  - DOM contract for app.mjs: the Add form is `form#call-add-form`; an edit form is `form#call-edit-form-<callId>` with `data-call-id`; fields are named `withWhom` (radios), `otherName`, `method`, `purpose`, `outcome`, `note`, with ids made by the existing `fieldId(...)` helper so form drafts survive redraws; buttons use `data-action="copy-call"` with `data-call-id`, `data-action="copy-all-calls"`, `data-action="toggle-call-edit"` with `data-call-id`; each entry is `<li id="call-<callId>" tabindex="-1">`.

- [ ] **Step 1: Write the failing view tests** in `tests/staff-views.test.mjs` (a fixed `timeZone` cannot be passed through the renderer, so assert on parts of the line that do not depend on the clock, or pass `ui.timeZone` and thread it into `callSummary`; choose the latter and document `ui.timeZone` as a test seam):
  - `"the case tabs include Calls before History"`: update the test at :1107 so the keys are `["overview","intake","documents","followup","calls","history"]`.
  - `"the Calls tab shows its count"`: `renderStaffCase` and `renderAdminCase` for a case with three calls contain `id="case-tab-calls"` and a `tab-count` of 3.
  - `"newest first"`: two calls at 10:00 and 15:45 render the 15:45 line first.
  - `"Edit only for the logger or an admin"`: a call logged by Morgan shows `toggle-call-edit` for Morgan and for Sam (`admin`), not for Alex.
  - `"an edited entry says so and lists its earlier versions"`: a call with three versions shows `edited ` and the time of the last one, and a `<details>` with summary "Earlier versions (2)" listing two lines.
  - `"an empty log"`: `"No calls logged yet."` and no `copy-all-calls`.
  - `"the form asks for every field"`: the method, purpose and outcome selects are `required` with an empty first option; the three With radios are `required`; `otherName` and `note` are present with `maxlength` 80 and 1000.
  - `"a note is text, not markup"` (Review Focus 1): note `<b>"Lee" & co</b>` renders escaped.
  - `"a persona switch closes someone else's edit form"` (Review Focus 2): `openPanels:["call-edit:k1"]` with Alex as the persona on Morgan's call renders no `call-edit-form-k1`.
  - `"no phone digits in the tab"`: with a case phone `2155550123`, the Calls panel's HTML contains neither `555` nor `0123`.
- [ ] **Step 2: Run them to see them fail**
  Run: `npm test`
  Expected: the new tests FAIL.
- [ ] **Step 3: Implement `callsPanel` and `mayEditCall`** in `src/staff-views.mjs` with the existing helpers from `src/ui.mjs` (`esc`, `button`, `emptyLine`, `select`, `textarea`, `fieldId`, as other staff forms use them), and add `["calls", "Calls", callsPanel(record, person, view)]` to both renderers' panels and `calls: (record.calls ?? []).length` to both `caseTabs` counts. For an applicant-shaped record in `renderStaffCase`, use the existing `elsewhere` text.
- [ ] **Step 4: Wire `src/app.mjs`.** In the submit handler, before the generic branches: `form.id === "call-add-form"` → read `FormData`, if `withWhom === "other"` and the trimmed name is empty, `notify("warning", "Type the name of the person you contacted.", by)` and focus the field; otherwise `await controller.logCall(caseId, entry)`, `clearFormDrafts(form)`, `notify("success", "The call is logged.", by)`. `form.id` starting `call-edit-form-` → the same with `controller.editCall(callId, entry)`, then `controller.togglePanel("call-edit:<id>")`, focus `#call-<id>`, and notify "The call is updated.". Send `otherName: null` unless With is Other, and `note: null` when blank. Click actions: `toggle-call-edit` → `controller.togglePanel(...)`; `copy-call` and `copy-all-calls` → build the text with `callSummary`/`callSummaries` from the open case (the same `answers`), `navigator.clipboard.writeText`, then `notify("success", "Copied." | "Copied <n> calls.", by)`, or on a throw `notify("info", "Copy did not work. Select the line and copy it by hand.", by)`.
- [ ] **Step 5: Style** the list, the line (`white-space: normal; overflow-wrap: anywhere`), the inline form and the disclosure in `src/styles.css`, reusing the staff panel and form classes; check at 375 px wide that nothing scrolls sideways.
- [ ] **Step 6: Run them to see them pass**
  Run: `npm test`
  Expected: PASS.
- [ ] **Step 7: Commit**
  ```bash
  git add src/staff-views.mjs src/admin-views.mjs src/app.mjs src/styles.css tests/staff-views.test.mjs tests/admin-views.test.mjs
  git commit -m "Call log: the Calls tab with Add a call, edit, earlier versions, Copy and Copy all (OpenSpec change add-call-log)"
  ```

### Task 5: Browser story

**Files:**
- Modify: `tests/browser.mjs` (one new phase after the review phase, recorded in `evidence.story.callLog`)

**Interfaces:**
- Consumes: the DOM contract of Task 4; the story's existing staff and client windows, persona picker and case.

- [ ] **Step 1: Write the story phase.** Grant `clipboard-read` and `clipboard-write` to the staff context. With Alex: open the Calls tab of the story's case, type a note in Add a call, have a second staff window log a call with Sam, and check the note typed in the first window survived the redraw (Review Focus 3); then log a phone call with the client to go over the return, outcome No answer. Check the second window shows it without a reload. Switch to Morgan: no Edit on Alex's entry. Switch to Alex: edit it to Left voicemail; "edited" shows and "Earlier versions (1)" opens to the No answer line. Switch to Sam: correct it to Reached. Press Copy all and read the clipboard: two lines, oldest first, each matching `/^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2} (AM|PM) — (Alex|Sam) → /`, the Alex line ending `— Go over tax return — Reached.` The client window has no `#case-tab-calls` and none of the call text.
- [ ] **Step 2: Ask Hailey** before switching the main checkout to this branch (new worktrees under OneDrive fail the story).
- [ ] **Step 3: Run from the main checkout**
  Run: `npm run db:migrate:test` then `npm run test:browser`
  Expected: PASS (about 11–16 minutes). Record the result in verify.md.
- [ ] **Step 4: Commit**
  ```bash
  git add tests/browser.mjs
  git commit -m "Story: log, edit, correct and copy a call (OpenSpec change add-call-log)"
  ```

### Task 6: Docs and final checks

**Files:**
- Modify: `docs/developer/database.md`, `docs/developer/frontend.md` (:540 unit count), `docs/developer/README.md` (:105 unit count)

- [ ] **Step 1: Document** the two tables and the two RPCs in `docs/developer/database.md`, next to the assistance entry point, with one paragraph on why they sit beside `vitally_apply_action` and never bump the case revision (D1, D3), and the checkpoint behaviour (D6). In `docs/developer/frontend.md`, add the Calls tab and `src/call-log.mjs` to the case-page section.
- [ ] **Step 2: Update the unit test count** to the number `npm test` reports, in both docs.
- [ ] **Step 3: Run the checks**
  Run: `npm test`, `npx openspec validate --all`, `npm run build:hant -- --check`
  Expected: all pass; `build:hant` reports nothing to regenerate.
- [ ] **Step 4: Commit**
  ```bash
  git add docs/developer
  git commit -m "Docs: the call log (OpenSpec change add-call-log)"
  ```
