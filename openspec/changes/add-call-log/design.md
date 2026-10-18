## Context

Staff record contact history by hand in notes. The case already has two structured contact records, each tied to one step: the reviewer's "Record this conversation" (`RECORD_REVIEW_CONTACT`, migration 006) and the office follow-up contact attempts (`RECORD_CONTACT`, the Follow-ups queue's "Log a call" drawer, migration 002). Neither covers an ordinary call at any stage, and neither produces a line to paste into TaxSlayer.

Constraints from the code:
- **Personas.** A presenter signs in and chooses a persona; each staff action names it (`p_person_id`). The roster is three one-word personas: Alex (`prepare`), Morgan (`review`), Sam (`admin`, `assist`, `followup`, `receive_documents`). `public.people` has one `name` column and no last name.
- **Shared action code.** `vitally_apply_action` and its helpers (`check_operation_authority`, `check_authority`, `check_payload`, `check_related`, the handlers) are redefined by each migration that adds a case action, and #73's lifecycle chain is changing them now. The assistance desk (`vitally_assistance_action`, migration 005) shows how a second entry point can have its own envelope, receipt and revision.
- **Reads and Realtime.** The browser reads case-scoped tables through RLS (`getCase` in `src/supabase-store.mjs`) and refetches the open case when a Realtime change names its `case_id` (`handleChange` in `src/controller.mjs`). A table must be in the `supabase_realtime` publication and in `STAFF_TABLES` to announce changes.
- **Fixtures.** A sample-case reset deletes fixture cases (cascades follow). A checkpoint load (`apply_fixture_scenario`, migration 019) deletes a case's workflow rows table by table.
- **Staff screens are English.** No client text, so no 简体/繁體 work.

## Goals / Non-Goals

**Goals:**
- Any staff persona logs a contact on any case they can open, at any stage, in a few clicks, with the time and the persona filled in.
- The logger and an admin edit an entry; every earlier version is kept and can be opened; nothing is deleted. The database enforces this.
- Each entry has an exact one-line summary with Copy; the case has Copy all.
- Clients can never read the call log.
- No change to the stage functions, to the shared case-action helpers, or to the two existing contact records.

**Non-Goals:**
- Recording calls, speech-to-text, AI summaries.
- Deleting entries.
- Changing `RECORD_REVIEW_CONTACT` or the office follow-up contact records, or merging them into the call log.
- The reviewer questionnaire's prefill from the call log (see Open Questions).
- Anything client-facing; seeded sample calls; showing or dialing a phone number.

## Decisions

### D1: Two new RPCs beside the case actions
- **Choice:** `public.vitally_log_call(p_action_id, p_case_id, p_person_id, p_entry jsonb)` and `public.vitally_edit_call(p_action_id, p_call_id, p_expected_revision, p_person_id, p_entry jsonb)`, `security definer`, granted to `authenticated` only. Each runs: `require_membership()` → envelope check → digest → `reserve_receipt()` (a replay returns the stored receipt after re-checking the persona) → `lock_case()` (log) or lock the call row then `lock_case()` on its case (edit) → persona checks → revision check (edit) → entry check → write → store the receipt. Errors use the existing codes: `VT001` FORBIDDEN, `VT002` NOT_FOUND, `VT003` CONFLICT, `VT007` VALIDATION.
- **Reason:** the call log needs none of the case lifecycle, and its own functions leave the shared helpers that #73 is rewriting untouched. They reuse `require_membership`, `reserve_receipt` and `lock_case` exactly as they are.
- **Alternatives considered:** new `LOG_CALL`/`EDIT_CALL` types in `vitally_apply_action` would mean redefining the dispatcher and four helpers in this migration, a guaranteed conflict with #73, and would bump `cases.revision` (D3). Direct table inserts under an RLS insert policy would lose replay protection and the edit-history guarantee.

### D2: Who may log and who may edit
- **Choice:** log: the caller is a presenter, `p_person_id` names a persona in the caller's workspace, and `lock_case` finds the case (presenters can open every case but a client's private draft). Any capability is enough. Edit: as for log, and the persona is the entry's `logged_by_person_id` or has `admin`. Otherwise `VT001`. An applicant is refused with `VT001` before any target is read.
- **Reason:** the brainstorm's rules, in this codebase's terms (brainstorm "Findings during propose").
- **Alternatives considered:** restricting logging to the case's preparer/reviewer would stop office staff and unclaimed-case calls, which the brainstorm explicitly includes.

### D3: The case row is not touched
- **Choice:** neither RPC updates `cases` (no revision bump, no `case_events`, no `client_events`). Each `case_calls` row has its own `revision` (starts at 1, +1 per edit) for edit conflicts.
- **Reason:** a call logged in one window must not turn another window's open case form into a "This case changed" conflict, and a call is not a lifecycle event. The Calls tab itself is the history of calls.
- **Alternatives considered:** a `CALL_LOGGED` case event in History; rejected because it duplicates the Calls tab and would need the shared commit path.

### D4: Tables: current entry plus append-only versions
- **Choice:**
  - `public.case_calls`: `id`, `workspace_id`, `case_id`, `logged_by_user_id`, `logged_by_person_id`, `logged_at` (default `now()`, never changed), `revision`, `edited_at` (null until edited), and the current entry fields.
  - `public.case_call_versions`: `call_id`, `version` (1..n, primary key with `call_id`), `workspace_id`, `case_id`, `edited_by_user_id`, `edited_by_person_id`, `created_at`, and that version's entry fields. Version 1 is written by the log; each edit appends the next.
  - Entry fields and checks: `with_whom` in (`client`, `spouse`, `other`); `other_name` text 1–80, required exactly when `with_whom = 'other'`, null otherwise; `method` in (`phone`, `text`, `email`, `in_person`, `video`); `purpose` in (`go_over_return`, `ask_question`, `request_documents`, `schedule_appointment`, `other`); `outcome` in (`reached`, `no_answer`, `left_voicemail`, `wrong_number`); `note` null or 1–1000 characters. A blank note is stored as null. The same checks are table constraints and RPC validation.
  - Foreign keys follow the existing same-workspace pattern, `on delete cascade` from `cases`.
- **Reason:** reading the current entry is one row; history is never rewritten. These keys are what the reviewer questionnaire's prefill will read (`purpose = 'go_over_return'`, `outcome = 'reached'`), so they are fixed.
- **Alternatives considered:** a single versions table with "latest = max(version)" makes every read a group-by and Realtime announcements less direct; a JSON history column could be rewritten in place.

### D5: Staff-only reads, Realtime, no client grants
- **Choice:** both tables enable RLS with one select policy each, the `case_materials` pattern: active membership, `access = 'presenter'`, and the case is not a client's private draft. `grant select` to `authenticated`; no insert/update/delete grant to `anon`/`authenticated`; `service_role` gets the usual grants for tests. Both join `supabase_realtime` (INSERT and UPDATE only, as 007 does) and `STAFF_TABLES`. The client column lists (`CLIENT_COLUMNS`) never name them.
- **Reason:** the brainstorm's "staff only (RLS), clients never", with the pattern every staff-only table uses.

### D6: Fixtures and checkpoints
- **Choice:** no fixture function changes. Reset removes calls through the cascade. A checkpoint load leaves the case's calls as they are. No sample calls are seeded.
- **Reason:** `apply_fixture_scenario` is fixture code #73 is also editing; the calls did happen, so keeping them through a rewind of the story is acceptable for a demo.
- **Alternatives considered:** clearing calls on checkpoint load; deferred until the fixture code settles after #73.

### D7: The summary line is one pure function
- **Choice:** a new `src/call-log.mjs` exports `callSummary(entry, { answers, people, timeZone })`, `callSummaries(entries, …)` (oldest first, joined with `\n`), `staffShortName(name)`, and the option lists and labels. The line is
  `M/D/YYYY h:mm AM/PM — <logger> → <who>, <method> — <purpose> — <outcome>.` plus ` Note: <note>` when there is one. Labels: client / spouse / the other person's typed name; phone / text / email / in person / video; Go over tax return / Ask a question / Request documents / Schedule an appointment / Other; Reached / No answer / Left voicemail / Wrong or invalid number. `<who>` is `client (First Last)` from `tp_first_name`/`tp_last_name`, `spouse (First Last)` from `sp_first_name`/`sp_last_name`, or the other person's name alone; with no name it is just `client` or `spouse`. The logger is `staffShortName`: two or more words give the first word and the last word's initial and a period ("Hailey Z."); one word is kept as it is ("Alex"); an unknown persona reads "Unknown person". The time is `logged_at` in `en-US` with the browser's time zone (`timeZone` is a test seam). A note ending in `.`, `!` or `?` is not given a second period; the note's line breaks become spaces.
- **Reason:** the list, Copy and Copy all must produce exactly the same text, and the exact text is an acceptance criterion that unit tests can pin.

### D8: The Calls tab
- **Choice:** `CASE_TABS` gains `["calls", "Calls"]` between Follow-up and History, with the entry count on the tab (as Documents shows its count). The tab holds one section, "Calls": the header has **Copy all** (absent when there are no entries); then the **Add a call** form (With as radio buttons with an "Other" name field, Method, Purpose, Outcome as selects with no preselected value, Note as a textarea, and an "Add call" button); then the entries, newest first, each showing its summary line, **Copy**, "Edit" when the persona may edit, "edited <time>" when edited, and "Earlier versions (n)" as a `<details>` disclosure listing each earlier version's summary line and edit time. Edit opens the same form inline, prefilled, with "Save changes" and "Cancel". An empty log shows the shared `emptyLine("No calls logged yet.")`. Required fields are checked in the browser before sending, as other staff forms do (`required` and the form's `reportValidity()`; the "Other" name, required only for Other, by a warning toast "Type the name of the person you contacted." with focus on the field), and again by the database.
- **Reason:** every other part of the case page is a tab; a tab with a count says at a glance whether anyone has called.
- **Alternatives considered:** a section at the top of the Follow-up tab; rejected because Follow-up is the office's work and volunteers call at every stage.

### D9: Browser flow
- **Choice:** `getCase` (staff path) reads `case_calls` and `case_call_versions` for the case. The store gains `logCall(request)` and `editCall(request)`. The controller gains `logCall(caseId, entry)` and `editCall(callId, entry)`, shaped like `runAssistanceAction`: an action id per attempt, the selected persona, `expectedRevision` from the entry on screen, a re-read of the case after success, and a CONFLICT message "Someone else changed this call. The newest version is shown — check it and try again." with a re-read. Success toasts: "The call is logged." / "The call is updated." Copy: `navigator.clipboard.writeText`; success toast "Copied." or "Copied <n> calls."; a refused clipboard gives the info toast "Copy did not work. Select the line and copy it by hand."
- **Reason:** follows the assistance desk's proven shape and the existing copy-reference handler.

## Risks / Trade-offs

- [Risk] Migration number clash: `add-preparer-and-reviewer-questionnaires` plans `031_review_questionnaires.sql`. → Mitigation: this change uses `031_call_log.sql`; at lifecycle step 8 (merge `main`), if `main` already has a `031_*`, rename this file to the next free number before archiving. Nothing references the number.
- [Risk] Two things called "call": the Follow-ups queue's "Log a call" drawer (office follow-up attempts) and the new Calls tab. → Mitigation: the new form says "Add a call", the drawer is unchanged, and the proposal names both. Merging them is a later decision.
- [Risk] Any persona can log on any case, and presenters can switch personas freely. → Accepted: it is the demo's existing trust model for every staff action; the logger is still recorded, and edits keep history.
- [Trade-off] Checkpoint loads keep the call log. → Accepted for now (D6); revisit when the fixture code settles after #73.
- [Trade-off] Time shown in the browser's time zone, so two staff in different zones copy different clock times. → Accepted: the site is one office; the stored time is UTC.
- [Risk] The browser story is slow and fails in new worktrees under OneDrive. → Mitigation: run `npm run test:browser` from the main checkout as in `hide-draft-13614c-from-clients`, after asking Hailey before switching it.

## Migration Plan

1. Add `supabase/migrations/031_call_log.sql` (new file; no applied migration is edited). Apply locally with `npm run db:migrate:test`.
2. Ship the browser code in the same PR; an old browser simply never reads the new tables.
3. Rollback: revert the PR and add a migration that drops the two functions and two tables (and removes them from the publication). No existing data depends on them.

Checks: `npm test`; `npm run db:migrate:test` then `npm run test:database`; `npm run test:browser` (from the main checkout). `npm run build:hant -- --check` and `npm run test:auth-browser` are not needed: no client text and no sign-in change.

## Open Questions

- **The reviewer questionnaire's prefill.** Owner: Hailey. `add-preparer-and-reviewer-questionnaires` (its D9) gives the prefill to whichever change lands second. This change applies now and is expected to land first, so the prefill is not built here; the brainstorm says the questionnaire change reads the call log. If the questionnaire change merges to `main` before this change is archived, stop and ask Hailey whether to add the prefill here (it would affect only the reviewer form's initial values).
- **Migration number** at merge time (see Risks). Owner: whoever runs step 8. Affects only the file name.
