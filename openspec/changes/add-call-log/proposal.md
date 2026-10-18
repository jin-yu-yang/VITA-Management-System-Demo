## Why

Volunteers write contact history by hand in notes today ("10/17 HZ called, no answer, left VM"). Many calls are not to go over the return; they ask a question, request a document or set an appointment. A call log records each contact in a few clicks, with the time and the volunteer filled in, and gives a one-line summary to paste elsewhere, for example into TaxSlayer's notes. The change adds a table, RPCs and a case-page tab only, and touches none of the stage functions that the lifecycle chain (#73) is changing, so it can go in now.

## What Changes

**Log a contact on any case**

- From: contact history lives only in free-text notes; the only structured contact records are the reviewer's "Record this conversation" and the office follow-up drawer, each tied to its own step.
- To: every staff persona can log a contact on any case they can open, at any stage: who it was with (client, spouse, or another named person), the method, the purpose, the outcome and an optional note. The time and the persona are filled in.
- Impact: non-breaking; new behaviour only.

**Edit with history, never delete**

- The persona that logged an entry, and an admin, can edit it. Every edit keeps the earlier versions, which can be opened. No one can delete an entry. The database enforces both rules.

**One-line summary, Copy and Copy all**

- Each entry has a one-line English summary built from its latest version, with a Copy button. Copy all copies every entry on the case, oldest first, one line each. Both confirm with the existing toast.

**Where it shows**

- A new **Calls** tab on the staff case page, between Follow-up and History. Clients never see the call log (staff-only row-level security). Logging shows no phone number; the masked-phone rules are unchanged.

**Not in this change**

- Recording calls, speech-to-text or AI summaries; deleting entries; anything client-facing.
- The reviewer's `RECORD_REVIEW_CONTACT` and the office follow-up contact records (the Follow-ups queue's "Log a call" drawer) stay as they are. Merging them into the call log is a later decision.

**Tracking:** part of #85, the TODO list for several changes. The PR says "Part of #85" and uses no closing keyword ("Fixes", "Closes", "Resolves"), so merging it leaves #85 open.

## Capabilities

### New Capabilities

_None._ The call log is part of the staff case page.

### Modified Capabilities

- `staff-case-work`: adds requirements for logging a contact on a case, editing an entry with kept history, the absence of delete, who can read the call log, the Calls tab, and the summary line with Copy and Copy all.

## Impact

- **Database:** a new migration (`031_call_log.sql`) with two staff-only tables (`case_calls`, `case_call_versions`), their row-level security, their Realtime publication, and two RPCs (`vitally_log_call`, `vitally_edit_call`). It reuses `require_membership`, `reserve_receipt` and `lock_case` unchanged and redefines no existing function.
- **Browser:** `src/supabase-store.mjs` (read the calls with the staff case, call the two RPCs, watch the two tables), `src/controller.mjs` (log and edit, with conflict handling), a new `src/call-log.mjs` (summary line and formatting), `src/staff-views.mjs` (the Calls tab), `src/app.mjs` (form handling and the clipboard), `src/styles.css`.
- **Tests:** unit tests for the summary line and the Calls tab; a new `tests/database-calls.mjs`; a story step in `tests/browser.mjs`.
- **Related work:** `add-preparer-and-reviewer-questionnaires` will read entries whose purpose is "Go over tax return" to prefill its review date and method. This change does not depend on it.
