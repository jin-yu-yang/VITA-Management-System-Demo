## Context

Staff record contact history by hand in notes. The case has two structured contact records, each tied to one step:
- the reviewer's "Record this conversation" (`RECORD_REVIEW_CONTACT`, migration 006), which `add-preparer-and-reviewer-questionnaires` is changing and this change leaves alone;
- the office's follow-up attempts. `RECORD_CONTACT` (migration 004) inserts into `contact_attempts`, linked to an `admin_followups` task. It is recorded from the shared `followupForms` (`src/admin-views.mjs`), which both the case page's Follow-up tab and the office queue's "Log a call" drawer (`src/office-views.mjs`) render, and listed by `attemptList` as "Calls so far".

Constraints from the code:
- **Personas.** A presenter signs in and chooses a persona; each staff action names it (`p_person_id`). The roster is three one-word personas: Alex (`prepare`), Morgan (`review`), Sam (`admin`, `assist`, `followup`, `receive_documents`). `public.people` has one `name` column.
- **Shared action code.** `vitally_apply_action` and its helpers (`check_operation_authority`, `check_authority`, `check_payload`, `check_related`) are redefined by each migration that adds a case action, and #73 is changing them now. The assistance desk (`vitally_assistance_action`, migration 005) shows how a second entry point gets its own envelope, receipt and revision.
- **Reads and Realtime.** The browser reads case-scoped tables through RLS (`getCase`) and refetches the open case when a Realtime change names its `case_id` (`handleChange` in `src/controller.mjs`). A table must be in the `supabase_realtime` publication and in `STAFF_TABLES` to be announced.
- **Fixtures.** `apply_fixture_scenario` (latest in migration 019) clears a sample case's workflow rows and seeds a scenario; the `admin_followup` scenario seeds one `contact_attempts` row ("no_answer"). A sample reset deletes fixture cases.
- **Staff screens are English.** No client text, so no 简体/繁體 work.
- **Name taken:** `public.case_contacts` already holds the client's phones, so the new tables are `contact_log*`.

## Goals / Non-Goals

**Goals:**
- Any staff persona logs a contact on any case they can open, at any stage, in a few clicks: direction, who, method, purpose, an outcome that follows the method, an editable contact time, an optional note.
- The logger and an admin edit an entry, contact time included; every version is kept and can be opened; nothing is deleted. The database enforces this.
- An exact one-line summary per entry, in America/New_York time, with Copy and Copy all.
- One "Log contact" form for the Contacts tab, the Follow-up tab and the office drawer; follow-up attempts become linked log entries.
- Clients can never read the log. Other staff windows see changes live.
- No change to the stage functions, to the shared case-action helpers, or to `RECORD_REVIEW_CONTACT`.

**Non-Goals:**
- Recording calls, speech-to-text, AI summaries.
- Deleting entries.
- Changing `RECORD_REVIEW_CONTACT` or "Resolve this task" (`RESOLVE_FOLLOWUP`).
- Removing `RECORD_CONTACT` from the shared action code, or dropping `contact_attempts` (later cleanup, see Open Questions).
- The reviewer questionnaire's prefill (see Open Questions).
- Anything client-facing; showing or dialing a phone number.

## Decisions

### D1: Two new RPCs beside the case actions
- **Choice:** `public.vitally_log_contact(p_action_id uuid, p_case_id uuid, p_person_id uuid, p_followup_id uuid, p_entry jsonb)` and `public.vitally_edit_contact(p_action_id uuid, p_contact_id uuid, p_expected_revision bigint, p_person_id uuid, p_entry jsonb)`, `security definer`, granted to `authenticated` only. Each runs: `require_membership()` → envelope check → digest → `reserve_receipt()` (a replay returns the stored receipt after re-checking the persona) → `lock_case()` (log) or lock the entry then `lock_case()` on its case (edit) → persona and task checks → revision check (edit) → entry check → write → store the receipt. Codes: `VT001` FORBIDDEN, `VT002` NOT_FOUND, `VT003` CONFLICT, `VT004` INVALID_TRANSITION, `VT007` VALIDATION.
- **Reason:** the log needs none of the case lifecycle, and its own functions leave the shared helpers #73 is rewriting untouched. They reuse `require_membership`, `reserve_receipt`, `lock_case` and `lock_open_followup` as they are.
- **Alternatives considered:** new case-action types in `vitally_apply_action` would redefine the dispatcher and four helpers (a certain conflict with #73) and bump `cases.revision` (D3).

### D2: Who may log and who may edit
- **Choice:**
  - Log, not linked: the caller is a presenter, `p_person_id` names a persona in the caller's workspace, and `lock_case` finds the case (every case but a client's private draft). Any capability.
  - Log, linked (`p_followup_id` not null): additionally `lock_open_followup(case, person, {"followupId": …})` must pass (the persona is the task's assignee, else `VT001`; the task is open, else `VT004`), and the persona must have `followup` (`VT001`). This is `RECORD_CONTACT`'s rule, unchanged.
  - Edit: the persona is the entry's logger or has `admin`, else `VT001`. The task link is fixed at logging and never edited.
  - An applicant is refused with `VT001` before any target is read.
- **Reason:** the brainstorm's rules in this codebase's terms; the linked rule keeps the office's existing authority.

### D3: The case row is not touched
- **Choice:** neither RPC updates `cases`, `case_events` or `client_events`. Each `contact_log` row has its own `revision` (1, +1 per edit).
- **Reason:** a contact logged in one window must not turn another window's open case form into a conflict. The Contacts tab and the task's "Contacts so far" are the record. (A contact logged from a task therefore no longer writes the "recorded a call attempt" History event that `RECORD_CONTACT` wrote; old events keep their wording.)

### D4: Tables: current entry plus append-only versions
- **Choice:**
  - `public.contact_log`: `id`, `workspace_id`, `case_id`, `followup_id` (nullable), `logged_by_user_id`, `logged_by_person_id`, `logged_at` (default `now()`, never changed), `revision`, `edited_at` (null until edited), and the current entry fields.
  - `public.contact_log_versions`: `contact_id`, `version` (primary key with `contact_id`), `workspace_id`, `case_id`, `edited_by_user_id`, `edited_by_person_id`, `created_at`, and that version's entry fields. Version 1 is written with the entry; each edit appends the next.
  - Entry fields: `direction` ∈ `outgoing|incoming`; `contacted_at` timestamptz; `with_whom` ∈ `client|spouse|other`; `other_name` 1–80 characters exactly when `with_whom='other'`; `method` ∈ `phone|text|email|in_person|video`; `purpose` ∈ `go_over_return|ask_question|request_documents|schedule_appointment|other`; `outcome` ∈ `reached|no_answer|left_voicemail|wrong_number|sent|replied|failed`; `note` null or 1–1000 characters.
  - Outcome rule (table check and RPC): `incoming` or `in_person` → `reached`; otherwise `phone`/`video` → `reached|no_answer|left_voicemail|wrong_number`, and `text`/`email` → `sent|replied|failed`.
  - `contacted_at` may not be later than `now() + 5 minutes` (RPC check, since a table check cannot use `now()`).
  - Same-workspace foreign keys, `on delete cascade` from `cases`; `followup_id` references `admin_followups(workspace_id, case_id, id)` with `on delete cascade`, as `contact_attempts` did.
- **Reason:** the current entry is one row; history is never rewritten. These keys are what the reviewer questionnaire's prefill reads (`purpose='go_over_return'`, `outcome='reached'`, either direction), so they are fixed.

### D5: Staff-only reads, live updates, no client grants
- **Choice:** both tables enable RLS with one select policy each, the `case_materials` pattern (active presenter membership; case not a client's private draft). `grant select` to `authenticated`, no insert/update/delete grant to `anon`/`authenticated`. Both join `supabase_realtime` (INSERT and UPDATE) and `STAFF_TABLES`; `CLIENT_COLUMNS` never names them.
- **Live, not on tab open:** the rows carry `case_id`, Realtime announces them under the same RLS, and `handleChange` re-reads the open case for any table whose change names the selected case. So another window on the same case shows a new or edited entry live, with no case change. No tab-open re-read is built. The story proves it with two windows.

### D6: Fixtures and checkpoints
- **Choice:** redefine `vitally_private.apply_fixture_scenario` (copied whole from migration 019) with two changes: it also deletes the case's `contact_log` rows (versions cascade) with the rest of its work, and the `admin_followup` scenario seeds a linked log entry (version 1) instead of a `contact_attempts` row, with the same values: Sam, outgoing, phone, client, `request_documents`, `no_answer`, note "Called during office hours. No answer, so a message was left." A sample reset still removes everything through the cascade.
- **Reason:** without it, the sample follow-up's "Contacts so far" would be empty and a checkpoint would leave entries "from the future".
- **Trade-off:** #73's lifecycle chain also redefines `apply_fixture_scenario`. Whichever of the two merges second combines both definitions in its own migration: #73's stages and seeds with this change's contact-log delete and seeded entry. The PR says so.

### D7: The summary line, in New York time
- **Choice:** `src/contact-log.mjs` exports `contactSummary(entry, { answers })`, `contactSummaries(entries, …)` (oldest first by contact time, joined with `\n`), `staffShortName(name)`, `contactTime(iso)`, `nyLocalInput(iso)` / `nyLocalToIso(value)` for the time field, `outcomesFor(method, direction)`, and the option lists and labels.
  - Outgoing: `M/D/YYYY h:mm AM/PM — <logger> → <who>, <method> — <purpose> — <outcome>.`
  - Incoming: `M/D/YYYY h:mm AM/PM — <who> → <logger>, <method> — <purpose> — <outcome>.`
  - In person, or incoming: the outcome segment is left out (`… — <purpose>.`), because it is always "reached".
  - Then ` Note: <note>` when there is a note (line breaks become spaces; no second period).
  - Labels: client / spouse / the typed name; phone / text / email / in person / video; Go over tax return / Ask a question / Request documents / Schedule an appointment / Other; Reached / No answer / Left voicemail / Wrong or invalid number / Sent / Client replied / Failed to deliver.
  - `<who>` is `client (First Last)` from `tp_first_name`/`tp_last_name`, `spouse (First Last)` from `sp_first_name`/`sp_last_name`, the typed name for other; just `client`/`spouse` with no name.
  - `<logger>` is `staffShortName`: two or more words give the first word and the last word's initial with a period ("Hailey Z."); one word as it is ("Alex"); missing gives "Unknown person".
  - **Every time in the log** (the line, "edited …", earlier versions, the time field) is America/New_York, via `Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", … })`. The time field is a `datetime-local` input holding New York wall time; `nyLocalToIso` converts it to an instant, resolving the zone's UTC offset for that date (daylight saving included).
- **Reason:** the list, Copy and Copy all must produce exactly the same text; one office, one clock.

### D8: One "Log contact" form, three places
- **Choice:** `logContactForm(record, person, ui, { followupId = null, contact = null })` in `src/staff-views.mjs` is the only form. It renders:
  - **Direction**, **Method**, **Purpose** and **Outcome** as one-click button groups: each a `<fieldset>` of radio inputs styled as segmented buttons, so they are keyboard- and screen-reader-native. Defaults: direction "We contacted", method "Phone". Purpose has no default and is required.
  - **Outcome** as two groups, one for phone/video and one for text/email, of which the one matching the method is shown (`hidden` on the other); with in person, or incoming, no outcome group shows. Each group is required while shown. The browser toggles them on change and after restoring a draft.
  - **With** as radios (Client, Spouse, Other; required) with the "Other" name field; **Contact time** (`datetime-local`, defaults to now in New York; required); **Note** (textarea, optional, 1000 characters).
  - Submit "Log contact", or "Save changes" and "Cancel" when editing (`contact` given, prefilled).
  - Places: the **Contacts** tab (not linked); the case page's **Follow-up** tab and the office queue's drawer, inside each open task the persona may record on (`rights.recordContact`, unchanged), linked to that task. The drawer and its queue button are renamed "Log contact". "Resolve this task" stays next to it as it is.
- **The task's list:** `attemptList(task)` becomes `taskContacts(record, task)`: under the heading "Contacts so far", the summary lines of the log entries linked to the task, oldest first, with "No contact has been logged on this task yet." when there are none.
- **Reason:** one form means the three places cannot drift; radio-based button groups are one click each and need no custom widget.

### D9: The Contacts tab
- **Choice:** `CASE_TABS` gains `["contacts", "Contacts"]` between Follow-up and History, with the entry count on the tab, in both `renderStaffCase` and `renderAdminCase`. The tab holds one section, "Contacts": **Copy all** in the header (absent when empty), the **Log contact** form, then the entries newest first by contact time (then logged-at). Each entry shows its summary line, **Copy**, "Edit" when the persona may edit, "edited <time>" when edited, "For the follow-up: <task reason>" when linked, and "Earlier versions (n)" as a `<details>` listing each earlier version's line and the time it was saved. Edit opens the same form inline (`openPanels` key `contact-edit:<id>`). An empty log shows `emptyLine("No contacts logged yet.")`.

### D10: Browser flow
- **Choice:** `getCase` (staff path) reads `contact_log` and `contact_log_versions` and no longer reads `contact_attempts`; `STAFF_TABLES` swaps `contact_attempts` for the two new tables. The store gains `logContact` and `editContact`; the controller gains `logContact(caseId, entry, followupId = null)` and `editContact(contactId, entry)`, shaped like `runAssistanceAction`, re-reading the case on success, with the CONFLICT message "Someone else changed this contact. The newest version is shown — check it and try again." Toasts: "The contact is logged.", "The contact is updated.", "Copied.", "Copied <n> contacts.", and on a refused clipboard "Copy did not work. Select the line and copy it by hand." A missing "Other" name: warning toast "Type the name of the person you contacted." with focus on the field. `RECORD_CONTACT` leaves `CASE_ACTIONS`, `case-actions.mjs` and the notices; its History label stays for old events.

### D11: Moving the old attempts, once
- **Choice:** in the same migration, for each `contact_attempts` row: insert a `contact_log` row and its version 1, linked to the attempt's task, with: direction `outgoing`, method `phone`, with `client`, purpose `request_documents` (every task hangs off a document request: `admin_followups.request_id` is `not null`), `contacted_at` = `logged_at` = `created_at` = the attempt's `created_at`, logger and editor = the attempt's user and persona, and:

  | Old outcome | New outcome | Note |
  |---|---|---|
  | `no_answer` | `no_answer` | the note |
  | `reached` | `reached` | the note |
  | `no_further_contact` | `reached` | "Client asked for no further contact. " + the note |
  | `closure_requested` | `reached` | "Client asked to close the case. " + the note |

  A prefixed note longer than 1000 characters is cut to 1000. The attempts are then deleted. `contact_attempts` stays, empty, until the cleanup.
- **Reason:** "moved once, by migration, with a clear mapping"; the two closing outcomes are things the client said when reached, so they keep their meaning in the note.

### D12: `RECORD_CONTACT` refuses new requests
- **Choice:** redefine only `vitally_private.act_record_contact` to raise `VT007` VALIDATION. Receipts are checked before the handler, so a replay of an old accepted request still returns its receipt.
- **Reason:** keeping it would let an old open tab write to `contact_attempts`, which nothing reads any more; removing it means redefining `vitally_apply_action`, `check_operation_authority`, `check_payload` and `check_authority`, the shared code #73 is rewriting. Refusing touches one private handler.
- **Alternatives considered:** keep (split data); remove now (conflicts with #73).

## Risks / Trade-offs

- [Risk] Migration number clash: `add-preparer-and-reviewer-questionnaires` plans `031_review_questionnaires.sql`. → Mitigation: this change uses `031_contact_log.sql`; at step 8, if `main` has a `031_*`, rename to the next free number.
- [Risk] #73 also redefines `apply_fixture_scenario`. → Mitigation: whichever merges second writes a migration that combines both definitions (D6); the PR description says so.
- [Risk] `add-preparer-and-reviewer-questionnaires` also changes `admin_followups` (a `kind` column), and both changes touch fixture code (D6). → Mitigation: whichever merges second reconciles: the second keeps the other's `kind` column and seeds, and checks that a contact linked to a task of any kind still follows D2.
- [Risk] The office's attempt list moves to a new table in one migration. → Mitigation: the database test moves attempts of all four outcomes and checks every mapped field; the story walks the office's follow-up end to end.
- [Risk] New York time in the browser depends on `Intl` time-zone data. → Accepted: every supported browser and Node ship it; unit tests pin both sides of a daylight-saving change.
- [Risk] Any persona can log on any case, and presenters switch personas freely. → Accepted: the demo's existing trust model; the logger is recorded and edits keep history.
- [Trade-off] A contact logged from a task no longer appears in the case's History. → Accepted: the task's list and the Contacts tab show it; History keeps lifecycle events.
- [Risk] The browser story is slow and fails in new worktrees under OneDrive. → Mitigation: run it from the main checkout, after asking Hailey before switching it.

## Migration Plan

1. Add `supabase/migrations/031_contact_log.sql` (new file; no applied migration is edited). Apply locally with `npm run db:migrate:test`.
2. Ship the browser code in the same PR. A tab still open on the old code that records an attempt gets VALIDATION (D12) and can reload.
3. Rollback: revert the PR and add a migration that restores the 004 `act_record_contact` and the 019 `apply_fixture_scenario`, moves linked log entries back into `contact_attempts` (`reached`/`no_answer` only; prefixed notes keep their text), and drops the two functions and two tables.

Checks: `npm test`; `npm run db:migrate:test` then `npm run test:database`; `npm run test:browser` (from the main checkout). `npm run build:hant -- --check` runs as CI does (nothing to regenerate); `npm run test:auth-browser` is not needed (no sign-in change).

## Open Questions

- **The reviewer questionnaire's prefill.** Owner: Hailey. `add-preparer-and-reviewer-questionnaires` (its D9) gives the prefill to whichever change lands second; this change is expected to land first and does not build it. If the questionnaire change merges first, stop and ask Hailey whether to add it here (it affects only the reviewer form's initial values).
- **Removing `RECORD_CONTACT` and dropping `contact_attempts`.** Owner: Hailey, after #73 merges. Affects the shared action code only; behaviour is already settled by D12.
- **Migration number** at merge time (see Risks). Owner: whoever runs step 8. Affects only the file name.
