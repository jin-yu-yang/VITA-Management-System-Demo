# Contact Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff log, edit (with kept history) and copy one-line summaries of every contact on a case in a Contacts tab, with the office's follow-up attempts merged into the same log, and clients unable to read any of it.

**Architecture:** One migration adds two staff-only tables (`contact_log`, `contact_log_versions`) and two standalone RPCs beside `vitally_apply_action`, moves `contact_attempts` into them once, makes `act_record_contact` refuse, and points the fixtures at the log. The browser reads the log with the staff case, builds lines and New York times in one pure module (`src/contact-log.mjs`), and renders one shared `logContactForm` in the Contacts tab, the Follow-up tab and the office drawer.

**Tech Stack:** Postgres/PL/pgSQL on Supabase (RLS, Realtime), plain ES modules, `node:test`, Playwright.

**Spec:** `openspec/changes/add-contact-log/specs/staff-case-work/spec.md`, with `design.md` (D1–D12) and `brainstorm.md` (both "Findings" sections) in the same folder. Read all three before Task 1.

## Global Constraints

- Fictional data only. Never touch `src/pcdc-logo.png`.
- Never edit an applied migration. The new file is `supabase/migrations/031_contact_log.sql`. Redefine only `vitally_private.act_record_contact` and `vitally_private.apply_fixture_scenario`; no other existing function (not `vitally_apply_action`, `check_operation_authority`, `check_authority`, `check_payload`, `check_related`, `lock_open_followup`, `seed_fixtures`).
- Never run `supabase start` from the repo root; the stack runs from `$VITALLY_STACK`.
- Do not change `RECORD_REVIEW_CONTACT` or `RESOLVE_FOLLOWUP`.
- Staff screens are English; no `src/client-text.mjs` change.
- Stored keys are fixed: `direction` `outgoing|incoming`; `with_whom` `client|spouse|other`; `method` `phone|text|email|in_person|video`; `purpose` `go_over_return|ask_question|request_documents|schedule_appointment|other`; `outcome` `reached|no_answer|left_voicemail|wrong_number|sent|replied|failed`.
- Outcome rule: `incoming` or `in_person` → `reached`; `phone`/`video` → `reached|no_answer|left_voicemail|wrong_number`; `text`/`email` → `sent|replied|failed`.
- Limits: other name 1–80 (trimmed, non-blank); note 1–1000, blank → null; `contacted_at` ≤ `now() + interval '5 minutes'`.
- Every time in the log is America/New_York.
- Codes: `VT001` FORBIDDEN, `VT002` NOT_FOUND, `VT003` CONFLICT, `VT004` INVALID_TRANSITION, `VT007` VALIDATION.
- Exact copy:
  - tab and section "Contacts"; form legend and submit "Log contact"; edit buttons "Save changes", "Cancel"; "Copy", "Copy all", "Edit";
  - groups: "Direction" (We contacted / The client contacted us), "Method" (Phone / Text / Email / In person / Video), "Purpose" (Go over tax return / Ask a question / Request documents / Schedule an appointment / Other), "Outcome" (Reached / No answer / Left voicemail / Wrong or invalid number; Sent / Client replied / Failed to deliver), "With" (Client / Spouse / Other), "Name", "Contact time", "Note";
  - "No contacts logged yet."; "edited <time>"; "Earlier versions (<n>)"; "For the follow-up: <task reason>"; task list heading "Contacts so far"; "No contact has been logged on this task yet."; drawer title and queue button "Log contact";
  - toasts "The contact is logged.", "The contact is updated.", "Copied.", "Copied <n> contacts.", "Copy did not work. Select the line and copy it by hand.", "Type the name of the person you contacted.";
  - conflict "Someone else changed this contact. The newest version is shown — check it and try again."
- Summary line (design D7): outgoing `M/D/YYYY h:mm AM/PM — <logger> → <who>, <method> — <purpose> — <outcome>.`; incoming `… — <who> → <logger>, <method> — <purpose>.`; in person drops the outcome segment like incoming; then ` Note: <note>` if any. Separators: ` — ` (em dash) and ` → `.
- Browser story: run from the main checkout; ask Hailey before switching it to this branch.

## Review Focus

1. **A daylight-saving day.** A contact at 1:30 AM on 11/1/2026 (the hour repeats) or 2:30 AM on 3/8/2026 (the hour does not exist) must not throw or shift by a day. `nyLocalToIso` picks the first occurrence for a repeated hour and moves a missing hour forward one hour. Test in Task 2.
2. **A note with HTML or quotes** (`<b>"Lee" & co</b>`) must render as text and copy as typed. Test in Task 4.
3. **A persona switch with an edit form open**: Morgan must not see or save Alex's open edit form. Test in Task 4.
4. **Switching method after picking an outcome** (Phone → No answer, then Text) must not send `no_answer` with `text`: the hidden group is ignored on submit, and the Text group is required. Test in Task 4 (the submit builder) and in the database (Task 1, the outcome rule).
5. **A replayed log after a timeout** must not create a second entry. Test in Task 1.

---

### Task 1: Database

**Files:**
- Create: `supabase/migrations/031_contact_log.sql`, `tests/database-contacts.mjs`
- Modify: `tests/support/database-fixture.mjs`; `tests/database-assistance.mjs`, `tests/database-documents.mjs`, `tests/database-realtime.mjs`, `tests/database-review.mjs`, `tests/database-fixtures.mjs`, `tests/database.mjs` (where they record attempts)

**Interfaces:**
- Consumes: `require_membership()`, `reserve_receipt(...)`, `lock_case(member, caseId)`, `payload_keys(jsonb)` (003); `lock_open_followup(case, person, payload)` (004).
- Produces:
  - `public.vitally_log_contact(p_action_id uuid, p_case_id uuid, p_person_id uuid, p_followup_id uuid, p_entry jsonb) returns jsonb` → `{actionId, contactId, caseId, revision: 1}`.
  - `public.vitally_edit_contact(p_action_id uuid, p_contact_id uuid, p_expected_revision bigint, p_person_id uuid, p_entry jsonb) returns jsonb` → `{actionId, contactId, caseId, revision}`.
  - `p_entry` keys exactly `contactedAt, direction, method, note, otherName, outcome, purpose, withWhom`; `contactedAt` an ISO-8601 string with offset; `otherName` and `note` string or JSON `null`.
  - Tables per design D4: `contact_log(id, workspace_id, case_id, followup_id, logged_by_user_id, logged_by_person_id, logged_at, revision, edited_at, direction, contacted_at, with_whom, other_name, method, purpose, outcome, note)` and `contact_log_versions(contact_id, version, workspace_id, case_id, edited_by_user_id, edited_by_person_id, created_at, <same entry fields>)`.
  - `vitally_private.move_contact_attempts() returns int` (rows moved), called once at the end of the migration and callable again by tests through `f.sql`.
  - Fixture: `contactArgs({actionId?, caseId, personId, followupId = null, entry})`, `editContactArgs({actionId?, contactId, revision, personId, entry})`, `f.logContact(client, caseId, personId, entry, followupId = null)`, `f.editContact(client, contactId, personId, entry)` (reads the revision first), `SAMPLE_CONTACT = {direction:"outgoing", contactedAt:<now ISO>, withWhom:"client", otherName:null, method:"phone", purpose:"go_over_return", outcome:"reached", note:"Asked about the fictional 1099-R."}` (a function, so each call takes a fresh now).

- [ ] **Step 1: Write the failing tests** in `tests/database-contacts.mjs` (the `createDatabaseFixture()` / `finally { await f.close() }` shape of `tests/database-assistance.mjs`; a `refuse(f, client, fn, args, code)` helper asserting the code and `f.receiptsFor(args.p_action_id) === 0`). Subtests:
  - `"each staff persona logs a contact at any stage"`: on `f.readyCase()` (Alex), `f.preparedCase()` (Morgan), `f.assistedCase()` (Sam): `revision` 1, `edited_at` null, logger = persona, `logged_at` within 60 s of now, version 1 equal to the row; the case's `revision`, `case_events` count and `client_events` count unchanged.
  - `"a past contact time is kept"`: `contactedAt` yesterday 14:10 New York → stored as that instant; `logged_at` now.
  - `"outcomes follow the method"`: every allowed (method, outcome) pair succeeds; `text`+`no_answer`, `phone`+`sent`, `in_person`+`no_answer`, `incoming`+`no_answer`, `incoming`+`sent` are `VT007`; `incoming`+`text`+`reached` succeeds.
  - `"an entry that breaks a rule is refused"`: `VT007` for other without a name, other with `"  "`, client with a name, an 81-character name, a 1001-character note, `method:"fax"`, `purpose:"chat"`, `direction:"sideways"`, an extra key, a missing key, `contactedAt` 10 minutes ahead, `contactedAt:"yesterday"`.
  - `"a blank note is stored as no note"`.
  - `"who may log"`: `VT001` for `f.applicantA`, a null persona, a persona from `f.foreignPeople`; `VT002` on `f.draftCase(f.applicantA)`.
  - `"a contact linked to a task"`: on a case with an open task assigned to Sam (`ESCALATE_CONTACT` as in `pendingCase`), Sam's linked log succeeds with `followup_id` set; Alex's is `VT001`; after `RESOLVE_FOLLOWUP`, Sam's is `VT004`; a task id from another case is `VT001`.
  - `"the logger and an admin edit, and every version is kept"`: Alex logs a text `sent` at 10:00; Alex edits to `replied` (revision 2); Sam edits `contactedAt` (revision 3); versions 1–3 hold `sent`/`replied`/`replied` and the two contact times, editors Alex, Alex, Sam; logger, `logged_at`, `followup_id` unchanged.
  - `"another persona cannot edit"`, `"a stale edit is a conflict"` (`VT003`), `"a replay returns the same receipt"` (one row; another entry under the same id is `VT007`).
  - `"nobody deletes or writes the tables directly"`: for `f.presenter` and `f.applicantA`, `delete`, `update`, `insert` on both tables error or affect no row.
  - `"a client reads nothing"`: `f.applicantA` reads `[]` from both tables for its own case; `f.presenter` reads the rows.
  - `"the old attempts are moved once"`: insert four `contact_attempts` rows (one per old outcome, notes "Will file elsewhere." etc.) with `f.sql`, run `select vitally_private.move_contact_attempts()` with `f.sql`, and check it returned 4, `contact_attempts` has none for the case, and each entry has `followup_id` = the task, `direction` outgoing, `method` phone, `with_whom` client, `purpose` request_documents, `contacted_at` = `logged_at` = the attempt's `created_at`, the logger, and the mapped outcome and note per design D11 (for example `"Client asked to close the case. Will file elsewhere."`).
  - `"RECORD_CONTACT refuses new requests"`: `f.act(..., "RECORD_CONTACT", {...})` by Sam on his open task is `VT007` with no `contact_attempts` and no `contact_log` row; a replay of a receipt stored before (insert the receipt row with `f.sql`, then call with the same envelope) returns it.
  - `"the sample follow-up seeds a log entry"`: `vitally_load_checkpoint` to `admin_followup` gives one linked entry (Sam, `no_answer`, the 019 note) and no attempt; loading another checkpoint clears the case's entries; `vitally_reset_fixtures` leaves no entry for removed sample cases.
- [ ] **Step 2: Run them to see them fail**
  Run: `node --env-file=.env.test --test tests/database-contacts.mjs`
  Expected: FAIL, `vitally_log_contact` does not exist.
- [ ] **Step 3: Write `supabase/migrations/031_contact_log.sql`** with a header comment in 013's style. In order:
  1. The two tables with checks for every Global Constraints rule (the outcome rule as one `check`), foreign keys as design D4, index `contact_log(case_id, contacted_at)` and `contact_log(followup_id)`.
  2. RLS select policies copied from `presenter_case_materials` (013); revokes and grants as 013; both tables into `supabase_realtime` with 013's idempotent block.
  3. `vitally_private.check_contact_entry(p_entry jsonb) returns jsonb`: raises `VT007` on any rule; returns the entry with the note blank → null and the name trimmed. Parse `contactedAt` inside a `begin … exception when others then raise sqlstate 'VT007'` block.
  4. `vitally_log_contact`: membership; null-argument and object checks (`VT007`); presenter only (`VT001`); digest of `{operation:'LOG_CONTACT', caseId, personId, followupId, entry}` with `extensions.digest(…,'sha256')` as 005; `reserve_receipt(…,'LOG_CONTACT',…)` and early return of a stored receipt after re-checking the persona; `lock_case`; persona in workspace (`VT001`); when `p_followup_id` is set, `followup` capability (`VT001`) and `lock_open_followup(v_case, v_person, jsonb_build_object('followupId', p_followup_id))`; `check_contact_entry`; insert the entry and version 1; store the receipt (`update public.action_receipts set target_id=…, receipt=… where id=…`).
  5. `vitally_edit_contact`: as above with `EDIT_CONTACT`; lock the entry `for update` in the member's workspace (`VT002`), then `lock_case` on its case; logger or `admin` (`VT001`); revision (`VT003`); check; insert version `revision+1`; update current fields, `revision`, `edited_at=now()`.
  6. `vitally_private.move_contact_attempts()`: one `insert … select` per table from `contact_attempts` (generate the entry ids in a CTE so both inserts share them), the outcome and note mapping as a `case` with `left(…, 1000)`, then `delete from public.contact_attempts`; return the count. Call it once: `select vitally_private.move_contact_attempts();`.
  7. `create or replace function vitally_private.act_record_contact(...)` with 004's signature, body `raise sqlstate 'VT007' using message='VALIDATION';` and a comment pointing at design D12.
  8. `create or replace function vitally_private.apply_fixture_scenario(...)` copied from 019 with: `delete from public.contact_log where workspace_id=p_case.workspace_id and case_id=p_case.id;` next to the other deletes, and the `admin_followup` branch inserting a linked entry and its version 1 (design D6) instead of the `contact_attempts` row.
  9. Revoke/grant execute on the two public functions; end with `revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;`.
- [ ] **Step 4: Add the fixture helpers** from Interfaces next to `assistanceArgs`.
- [ ] **Step 5: Move the existing database tests.** Wherever `f.act(..., "RECORD_CONTACT", …)` records an attempt that the test then relies on (`database-assistance.mjs:77`, `database-documents.mjs:646,721,990`, `database-realtime.mjs:406`, `database-review.mjs:806`, and the attempt checks in `database-fixtures.mjs` and `database.mjs`), log a linked contact with `f.logContact(f.presenter, caseId, f.sam, {...SAMPLE_CONTACT(), outcome:"no_answer"}, followupId)` and read `contact_log` instead of `contact_attempts`. Refusal tests that fail before the handler (wrong capability or assignee, bad payload: `database-documents.mjs:925-1085`) keep `RECORD_CONTACT` and their codes; a test that expected `RECORD_CONTACT` to succeed now expects `VT007`. In `database-realtime.mjs`, the announced table becomes `contact_log`.
- [ ] **Step 6: Apply and run**
  Run: `npm run db:migrate:test` then `npm run test:database`
  Expected: all database files pass.
- [ ] **Step 7: Commit**
  ```bash
  git add supabase/migrations/031_contact_log.sql tests/database-*.mjs tests/database.mjs tests/support/database-fixture.mjs
  git commit -m "Contact log: tables, staff-only policies, log and edit RPCs, follow-up attempts moved in (OpenSpec change add-contact-log)"
  ```

### Task 2: Summary line and New York time

**Files:**
- Create: `src/contact-log.mjs`, `tests/contact-log.test.mjs`

**Interfaces:**
- Produces (exported from `src/contact-log.mjs`):
  - `CONTACT_DIRECTIONS`, `CONTACT_WITH`, `CONTACT_METHODS`, `CONTACT_PURPOSES`, `VOICE_OUTCOMES`, `WRITTEN_OUTCOMES`: frozen `[key, label]` arrays with the Global Constraints labels (button labels; the line uses lower-case method labels and "client"/"spouse").
  - `outcomesFor(method, direction) => Array<[key,label]>`: `[]` for incoming or in person.
  - `staffShortName(name) => string`; `contactTime(iso) => "M/D/YYYY h:mm AM/PM"` in New York.
  - `nyLocalInput(iso) => "YYYY-MM-DDTHH:mm"` (New York wall time, for `datetime-local`); `nyLocalToIso(value) => string` (ISO with `Z`); `nowInput(now = Date.now())`.
  - `contactSummary(entry, { answers = {} } = {}) => string`, entry camelCase `{contactedAt, loggedByName, direction, withWhom, otherName, method, purpose, outcome, note}`; `contactSummaries(entries, options) => string` (oldest `contactedAt` first, `"\n"`).
  - `contactEntryFromForm(values: Record<string,string>) => entry` for app.mjs: picks `outcome` from the group matching the method (`outcomeVoice` or `outcomeWritten`), forces `reached` for incoming or in person, sends `otherName` only for other, a blank note as `null`, and `contactedAt` through `nyLocalToIso`.

- [ ] **Step 1: Write the failing tests** in `tests/contact-log.test.mjs`:
  - `"the agreed outgoing line"`: `contactSummary({contactedAt:"2026-10-17T19:45:00Z", loggedByName:"Hailey Zhang", direction:"outgoing", withWhom:"client", otherName:null, method:"phone", purpose:"go_over_return", outcome:"reached", note:"asked about the 1099-R; she'll bring it Monday."}, {answers:{tp_first_name:"Mei", tp_last_name:"Wang"}})` equals `"10/17/2026 3:45 PM — Hailey Z. → client (Mei Wang), phone — Go over tax return — Reached. Note: asked about the 1099-R; she'll bring it Monday."`.
  - `"an incoming line turns the arrow and drops the outcome"`: same, `direction:"incoming"`, `purpose:"ask_question"`, no note → `"10/17/2026 3:45 PM — client (Mei Wang) → Hailey Z., phone — Ask a question."`.
  - `"in person drops the outcome"`: → `"… — Alex → client, in person — Schedule an appointment."`.
  - `"a text to the spouse"`: Alex, spouse Lin Wang, text, request_documents, sent → ends `"— Alex → spouse (Lin Wang), text — Request documents — Sent."`; `replied` → `"Client replied."`; `failed` → `"Failed to deliver."`.
  - `"another person"`, `"no names in the intake"`, `"an unknown logger"` (`"Unknown person"`), `"staffShortName"` (`"Hailey Zhang"`→`"Hailey Z."`, `"Mary Ann Lee"`→`"Mary L."`, `"Alex"`→`"Alex"`, `null`→`"Unknown person"`), `"note punctuation and line breaks"`, `"contactSummaries is oldest first"`.
  - `"New York time whatever the zone"`: `contactTime("2026-07-01T16:05:00Z")` is `"7/1/2026 12:05 PM"` and `contactTime("2026-12-01T17:05:00Z")` is `"12/1/2026 12:05 PM"` (run with `process.env.TZ` set to `"America/Los_Angeles"` in the test file's first line, before any `Date` use).
  - `"the time field round-trips"`: `nyLocalToIso("2026-10-17T15:45") === "2026-10-17T19:45:00.000Z"`, `nyLocalInput("2026-10-17T19:45:00Z") === "2026-10-17T15:45"`, and January's offset is −05:00.
  - `"daylight-saving days"` (Review Focus 1): `nyLocalToIso("2026-11-01T01:30") === "2026-11-01T05:30:00.000Z"` (first occurrence); `nyLocalToIso("2026-03-08T02:30") === "2026-03-08T07:30:00.000Z"` (03:30 EDT).
  - `"outcomesFor"`: phone/video → the four voice keys; text/email → the three written keys; in_person or incoming → `[]`.
  - `"the form builder"` (Review Focus 4): `{direction:"outgoing", method:"text", outcomeVoice:"no_answer", outcomeWritten:"sent", …}` → `outcome:"sent"`; `method:"in_person"` → `"reached"`; `direction:"incoming", method:"phone", outcomeVoice:"no_answer"` → `"reached"`; `withWhom:"client", otherName:"x"` → `otherName:null`; note `"  "` → `null`.
- [ ] **Step 2: Run to see them fail.** Run: `node --test tests/contact-log.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `src/contact-log.mjs`.** New York parts come from `Intl.DateTimeFormat("en-US", {timeZone:"America/New_York", year:"numeric", month:"numeric", day:"numeric", hour:"numeric", minute:"2-digit", hour12:true}).formatToParts`. `nyLocalToIso`: build the two candidates for the wall time at −04:00 and −05:00; keep those whose New York wall time (via `formatToParts`) equals the input and return the earliest (the first occurrence of a repeated hour); if neither matches (a skipped hour), return the −05:00 candidate, which reads one hour later in daylight time. The module imports nothing from `staff-views.mjs` (which imports it); the "Unknown person" literal carries a comment pointing at `UNKNOWN_PERSON` (`src/staff-views.mjs:77`).
- [ ] **Step 4: Run to see them pass.** Run: `node --test tests/contact-log.test.mjs`, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add src/contact-log.mjs tests/contact-log.test.mjs
  git commit -m "Contact log: the one-line summary and New York time (OpenSpec change add-contact-log)"
  ```

### Task 3: Store and controller

**Files:**
- Modify: `src/supabase-store.mjs` (`STAFF_TABLES`, new `mapContact`, `mapStaffCase`, `mapFollowup`, staff `getCase`, `logContact`, `editContact`), `src/staff-views.mjs:169-213` (`decorateStaffCase`), `src/controller.mjs`, `src/contracts.mjs:26`, `src/case-actions.mjs:178`, `src/app.mjs:998`
- Test: `tests/store.test.mjs`, `tests/controller.test.mjs`, `tests/staff-views.test.mjs`, `tests/case-actions.test.mjs`, `tests/domain.test.mjs`, `tests/shell.test.mjs`

**Interfaces:**
- Consumes: Task 1's RPCs and columns.
- Produces:
  - Staff case `contacts: Array<{id, caseId, followupId, revision:number, loggedAt, editedAt, loggedByPersonId, direction, contactedAt, withWhom, otherName, method, purpose, outcome, note, versions: Array<{version:number, createdAt, editedByPersonId, direction, contactedAt, withWhom, otherName, method, purpose, outcome, note}>}>`, oldest `contactedAt` first. Follow-ups no longer carry `attempts`. After `decorateStaffCase`, contacts have `loggedByName`, versions `editedByName`.
  - `store.logContact({actionId?, caseId, personId, followupId, entry})`, `store.editContact({actionId?, contactId, expectedRevision, personId, entry})`.
  - `controller.logContact(caseId, entry, followupId = null)`, `controller.editContact(contactId, entry)`: return the request, throw after setting `state.error` like `runAssistanceAction`; re-read with `loadSelected()`.

- [ ] **Step 1: Write the failing tests:**
  - store: `"the staff case carries its contacts with their versions"`; `"the client path never reads the contact log"`; `"follow-ups no longer read contact_attempts"`; `"log and edit call their RPCs"` (argument names from Task 1, `actionId` kept on retry); `"the staff channel watches the contact log"` (`SUBSCRIBED_TABLES.presenter` has both tables and not `contact_attempts`; `applicant` has neither).
  - controller: `"logging sends the persona and the task, then re-reads the case"`; `"editing sends the revision on screen"`; `"a conflicting edit shows the newest version"` (the Global Constraints message); `"an edit of a contact not on screen is refused without a call"` (`NOT_FOUND`); `"a contact log change on the open case re-reads it"`.
  - staff-views: `"contacts get the logger's and editor's names"` (unknown id → `UNKNOWN_PERSON`).
  - `RECORD_CONTACT` is gone: `CASE_ACTIONS` lacks it (update `tests/case-actions.test.mjs:90,183-184`, `tests/domain.test.mjs`, `tests/shell.test.mjs`), and the History label `"recorded a call attempt"` is still rendered for an old `RECORD_CONTACT` event.
- [ ] **Step 2: Run to see them fail.** Run: `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Staff `getCase` reads `contact_log` (`.eq("case_id", id).order("contacted_at").order("logged_at").order("id")`) and `contact_log_versions` (`.order("contact_id").order("version")`) and drops `attempts`. `mapFollowup(row)` loses its second parameter. Remove `RECORD_CONTACT` from `CASE_ACTIONS`, its builder and `CONTACT_OUTCOMES` if nothing else uses it (`FOLLOWUP_RESOLUTION_OUTCOMES` and `CONTACT_OUTCOME_LABELS` stay for "Resolve this task"), and its notice.
- [ ] **Step 4: Run to see them pass.** Run: `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add src tests
  git commit -m "Contact log: read with the staff case, log and edit through the controller; RECORD_CONTACT leaves the browser (OpenSpec change add-contact-log)"
  ```

### Task 4: The form, the Contacts tab and the office

**Files:**
- Modify: `src/staff-views.mjs` (`CASE_TABS` :676, `logContactForm`, `contactsPanel`, `mayEditContact`, `renderStaffCase` :1436), `src/admin-views.mjs` (`attemptList` :409 → `taskContacts`, `followupForms` :428, `followupTask`, `renderAdminCase` :583), `src/office-views.mjs` (:187 button, :285-322 drawer), `src/views.mjs:449-451` (drawer title), `src/app.mjs` (submit :1777, clicks near :1640, a `change` listener), `src/styles.css`
- Test: `tests/staff-views.test.mjs`, `tests/admin-views.test.mjs`, `tests/office-views.test.mjs`, `tests/empty-states.states.mjs`

**Interfaces:**
- Consumes: Task 2's module; Task 3's `contacts` and controller methods; `controller.togglePanel(name)`, `state.openPanels`; `src/ui.mjs` helpers (`esc`, `button`, `emptyLine`, `textarea`, `fieldId`).
- Produces:
  - `mayEditContact(contact, person) => boolean`: `person?.id === contact.loggedByPersonId || person?.capabilities?.includes("admin")`.
  - `logContactForm(record, person, ui, { followupId = null, contact = null }) => string`.
  - `contactsPanel(record, person, ui) => string`; `taskContacts(record, task) => string`.
  - DOM contract for app.mjs: the form is `form.contact-form` with `data-case-id`, optional `data-followup-id`, optional `data-contact-id`; radio groups are named `direction`, `withWhom`, `method`, `purpose`, `outcomeVoice`, `outcomeWritten`; fields `otherName`, `contactedAt`, `note`; field ids from `fieldId(name, scope)` with scope `contact-new`, `contact-task-<taskId>` or `contact-edit-<contactId>`, so drafts survive redraws; outcome fieldsets carry `data-outcome-group="voice"|"written"`; buttons `data-action="copy-contact"` (`data-contact-id`), `"copy-all-contacts"`, `"toggle-contact-edit"` (`data-contact-id`); entries `<li id="contact-<id>" tabindex="-1">`.

- [ ] **Step 1: Write the failing view tests:**
  - `"the case tabs include Contacts before History"` (update `tests/staff-views.test.mjs:1107` to `["overview","intake","documents","followup","contacts","history"]`); `"the Contacts tab shows its count"` in both renderers; `"newest contact time first"`; `"Edit only for the logger or an admin"`; `"an edited entry says so and lists its earlier versions"`; `"a linked entry names its task"`; `"an empty log"`.
  - `"the form's button groups and defaults"`: four fieldsets of radios with the Global Constraints labels; `outgoing` and `phone` checked; no purpose or outcome checked; the written-outcome group `hidden` while phone is checked; `contactedAt` a `datetime-local` with the value `nowInput(ui.now)` and `required`; `note` `maxlength="1000"`; submit "Log contact".
  - `"a note is text, not markup"` (Review Focus 2); `"a persona switch closes someone else's edit form"` (Review Focus 3); `"no phone digits in the tab"`.
  - admin/office: `"each open task has the shared form and Resolve"`: the Follow-up tab and `logCallDrawerBody` render `form.contact-form[data-followup-id]` for Sam and the unchanged "Resolve this task" form, and no `RECORD_CONTACT`; `"the task lists its linked contacts"` under "Contacts so far", or the empty line; `"the drawer and its button say Log contact"`.
- [ ] **Step 2: Run to see them fail.** Run: `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement the views.** Add `["contacts", "Contacts", contactsPanel(record, person, view)]` and `contacts: (record.contacts ?? []).length` in both renderers (the applicant-shaped branch of `renderStaffCase` uses `elsewhere`). `followupForms` keeps its eligibility guard and returns `logContactForm(record, person, ui, {followupId: task.id})` followed by the Resolve form as it is. Keep the function name `logCallDrawerBody` and the dialog key `log-call` (internal names; renaming them is churn), and change only the visible text.
- [ ] **Step 4: Wire `src/app.mjs`.** Submit: a `form.contact-form` → `reportValidity()`; the "Other" name warning and focus; `contactEntryFromForm(Object.fromEntries(new FormData(form)))`; `controller.logContact(caseId, entry, followupId || null)` or `controller.editContact(contactId, entry)` (then `togglePanel("contact-edit:<id>")` and focus `#contact-<id>`); clear the form's drafts; success toast. A `change` listener on the method and direction radios, plus a pass after drafts are restored, sets `hidden` and `disabled` on the outcome fieldsets (a disabled fieldset is skipped by `reportValidity` and `FormData`). Clicks: `toggle-contact-edit`; `copy-contact`/`copy-all-contacts` build the text with `contactSummary`/`contactSummaries` and the open case's `answers`, write it with `navigator.clipboard.writeText`, and toast "Copied." / "Copied <n> contacts." or, on a throw, the info toast.
- [ ] **Step 5: Style** the button groups (segmented, the checked one filled, a visible focus ring, wrapping onto two lines at 375 px), the entries, the inline form and the disclosure, reusing the staff panel classes.
- [ ] **Step 6: Run to see them pass.** Run: `npm test`. Expected: PASS.
- [ ] **Step 7: Commit**
  ```bash
  git add src tests
  git commit -m "Contact log: one Log contact form in the Contacts tab, the Follow-up tab and the office drawer (OpenSpec change add-contact-log)"
  ```

### Task 5: Browser story

**Files:**
- Modify: `tests/browser.mjs` (the office follow-up phase around :1340-1420, and a new phase recorded in `evidence.story.contactLog`)

- [ ] **Step 1: Update the office phase.** Replace the `RECORD_CONTACT` form, field and action lookups (:1340, :1347, :1389-1392, :1418) with the Log contact form inside the task (`form.contact-form[data-followup-id]`): Phone, No answer, purpose Request documents, and a note; check the entry under "Contacts so far" in the drawer and on the Follow-up tab; "Resolve this task" as before. Rename any "Log a call" text match to "Log contact".
- [ ] **Step 2: Add the contact-log phase.** Grant `clipboard-read` and `clipboard-write` to the staff context. As Alex in window 1 open the Contacts tab and type a note; as Sam in window 2 log a contact on the same case; window 1 shows it without a reload and keeps the typed note. Alex logs a text, Sent; edits it to Client replied; "edited" and "Earlier versions (1)" show. As Morgan: no Edit on Alex's entry. As Sam: correct it. Log an incoming phone call and check its line starts with the time and then `client`. Copy all: the clipboard lines are oldest first and match `/^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2} (AM|PM) — /`. The client window has no `#case-tab-contacts` and none of the text.
- [ ] **Step 3: Ask Hailey** before switching the main checkout to this branch.
- [ ] **Step 4: Run from the main checkout.** Run: `npm run db:migrate:test` then `npm run test:browser`. Expected: PASS (about 11–16 minutes). Record the result in verify.md.
- [ ] **Step 5: Commit**
  ```bash
  git add tests/browser.mjs
  git commit -m "Story: the office logs follow-up contacts in the contact log; log, edit, correct and copy contacts (OpenSpec change add-contact-log)"
  ```

### Task 6: Docs and final checks

**Files:**
- Modify: `docs/developer/database.md`, `docs/developer/frontend.md` (:540), `docs/developer/README.md` (:105)

- [ ] **Step 1: Document** the tables, the RPCs and why they sit beside `vitally_apply_action` (D1, D3), the move and its mapping (D11), `RECORD_CONTACT` refusing (D12) and the fixture change (D6) in `database.md`; the Contacts tab, `logContactForm` in three places and `src/contact-log.mjs` (New York time) in `frontend.md`.
- [ ] **Step 2: Update the unit test count** in both docs to what `npm test` reports.
- [ ] **Step 3: Run the checks.** Run: `npm test`, `npx openspec validate --all`, `npm run build:hant -- --check`. Expected: all pass; nothing to regenerate.
- [ ] **Step 4: Commit**
  ```bash
  git add docs/developer
  git commit -m "Docs: the contact log (OpenSpec change add-contact-log)"
  ```
