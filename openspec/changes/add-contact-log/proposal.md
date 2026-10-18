## Why

Volunteers write contact history by hand in notes today ("10/17 HZ called, no answer, left VM"), and the office records follow-up calls in a separate list tied to its tasks. Contacts are not only calls, and not only outgoing: texts, emails and visits count, and clients reach us too. One contact log records every contact on a case in a few clicks, with the time and the volunteer filled in, and gives a one-line summary to paste elsewhere, for example into TaxSlayer's notes. It touches none of the stage functions the lifecycle chain (#73) is changing, so it can go in now.

## What Changes

**Log a contact on any case**

- From: contact history lives in free-text notes; the only structured records are the reviewer's "Record this conversation" and the office's follow-up attempts.
- To: every staff persona can log a contact on any case they can open, at any stage: direction (we contacted / the client contacted us), who (client, spouse, or another named person), method, purpose, an outcome that follows the method, the contact time (defaults to now) and an optional note. The logger and the logged-at time are filled in.
- Impact: non-breaking; new behaviour.

**Edit with history, never delete**

- The persona that logged an entry, and an admin, can edit it, including its contact time (for example a text "sent" that the client later answers becomes "client replied"). Every earlier version is kept and can be opened. No one can delete an entry. The database enforces both.

**One-line summary, Copy and Copy all**

- Each entry has a one-line English summary built from its latest version, in America/New_York time, with the arrow turned round for incoming contacts. Copy copies it; Copy all copies every entry on the case, oldest first.

**The office's "Log a call" merges into the log**

- From: the Follow-up tab and the office queue's "Log a call" drawer record attempts on a task with `RECORD_CONTACT` into `contact_attempts`, listed as "Calls so far".
- To: one shared "Log contact" form serves the new Contacts tab, the Follow-up tab and the drawer (renamed "Log contact"). A contact logged from a task is a log entry linked to that task, and the task's "Contacts so far" lists its linked entries. Existing attempts are moved into the log once, by migration, linked to their tasks. `RECORD_CONTACT` refuses new requests. "Resolve this task" is unchanged.
- Impact: the office's workflow keeps its steps; its attempt list moves. A contact logged from a task no longer adds a History event or bumps the case revision.

**Where it shows**

- A new **Contacts** tab on the staff case page, between Follow-up and History. Clients never see the log (staff-only row-level security). Logging shows no phone number; the masked-phone rules are unchanged.

**Not in this change**

- Recording calls, speech-to-text or AI summaries; deleting entries; anything client-facing.
- `RECORD_REVIEW_CONTACT`: `add-preparer-and-reviewer-questionnaires` handles it.
- Removing `RECORD_CONTACT` from the shared action code and dropping the then-empty `contact_attempts` table: a later cleanup after #73.

**Tracking:** change `add-contact-log`, part of #85, the TODO list for several changes. The PR says "Part of #85" and uses no closing keyword ("Fixes", "Closes", "Resolves"), so merging it leaves #85 open.

## Capabilities

### New Capabilities

_None._ The contact log is part of the staff case page and the office follow-up work.

### Modified Capabilities

- `staff-case-work`: adds requirements for logging a contact, edit with kept history, no delete, staff-only reads, live updates, the Contacts tab, the summary line with Copy and Copy all, logging from a follow-up task, the one-time move of follow-up attempts, and the retirement of `RECORD_CONTACT`.

## Impact

- **Database:** one migration (`031_contact_log.sql`): two staff-only tables (`contact_log`, `contact_log_versions`) with RLS and Realtime; two RPCs (`vitally_log_contact`, `vitally_edit_contact`); the one-time move of `contact_attempts`; `act_record_contact` redefined to refuse; `apply_fixture_scenario` redefined to seed and clear the log. No other existing function is redefined.
- **Browser:** `src/contact-log.mjs` (new: summary line, New York time, option lists), `src/supabase-store.mjs`, `src/controller.mjs`, `src/staff-views.mjs` (Contacts tab, shared `logContactForm`), `src/admin-views.mjs` (Follow-up tab), `src/office-views.mjs` (drawer and queue button), `src/views.mjs` (drawer title), `src/app.mjs`, `src/contracts.mjs` and `src/case-actions.mjs` (drop `RECORD_CONTACT`), `src/styles.css`.
- **Tests:** unit tests for the new module and views; `tests/database-contacts.mjs`; existing database, unit and story tests that record attempts with `RECORD_CONTACT` move to the log.
- **Related work:** `add-preparer-and-reviewer-questionnaires` also changes `admin_followups` (a kind column), and its prefill reads entries with purpose "go over tax return" and outcome reached. Whichever change merges second reconciles.
