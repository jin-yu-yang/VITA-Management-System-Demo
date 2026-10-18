## 1. Database

- [x] 1.1 Write `tests/database-contacts.mjs` first (it fails until 1.2 exists), with `createDatabaseFixture`:
  - Logging: Alex, Morgan and Sam each log on cases in different stages; `logged_at`, the logger and version 1 are set by the database; a past `contacted_at` is kept; `cases.revision`, `case_events` and `client_events` are unchanged.
  - Outcome rules: each method's allowed outcomes succeed and the others are `VT007`; incoming or in person with anything but `reached` is `VT007`.
  - Other refusals with no receipt left behind: "other" without a name, a name with client/spouse, an unknown key or value, a note over 1000 characters, `contacted_at` more than 5 minutes ahead (`VT007`); a client's private draft (`VT002`); an applicant session, no persona, a persona from another workspace (`VT001`).
  - Linked to a task: Sam (assignee, `followup`) succeeds; Alex is `VT001`; a resolved task is `VT004`; a task of another case is refused.
  - Edit: the logger and Sam (admin) succeed, each appending a version (contact time included); Alex editing Morgan's entry is `VT001`; a stale revision is `VT003`; logger, `logged_at` and `followup_id` never change.
  - Replay: the same action id and envelope returns the stored receipt without a second row; the same id with another envelope is `VT007`.
  - No delete or update for `authenticated` on either table; a client session reads no row of either table, even on its own case.
  - The move (D11): attempts of all four old outcomes, written into `contact_attempts` by `f.sql` before the move function runs, become linked entries with every mapped field; none remain in `contact_attempts`.
  - `RECORD_CONTACT`: a new request is `VT007` with nothing written; a replay of an accepted one returns its receipt.
  - Fixtures: the `admin_followup` checkpoint seeds one linked entry and no attempt; a checkpoint clears the case's entries; a sample reset removes them.
- [x] 1.2 Add `supabase/migrations/031_contact_log.sql` (design D1–D6, D11, D12): tables, checks, foreign keys, RLS, grants, Realtime; `vitally_log_contact` and `vitally_edit_contact`; the one-time move; `act_record_contact` refusing; `apply_fixture_scenario` copied from 019 with the two changes. Redefine no other existing function.
- [x] 1.3 Move the existing database tests off `RECORD_CONTACT`: where a test records an attempt as setup or to check its effect (`database-assistance.mjs`, `database-documents.mjs`, `database-realtime.mjs`, `database-review.mjs`, `database-fixtures.mjs`, `database.mjs`), log a linked contact instead; refusals that happen before the handler (capability, assignee, payload) keep testing `RECORD_CONTACT`; checks that read `contact_attempts` read `contact_log`.
- [x] 1.4 Run `npm run db:migrate:test`, then `npm run test:database`.

## 2. Summary line and New York time

- [x] 2.1 Unit tests first in `tests/contact-log.test.mjs`: the exact outgoing line; the incoming line; in person; a one-word and an unknown persona; spouse/client with and without names; "other"; each method's outcome labels; note punctuation and line breaks; `contactSummaries` oldest first; New York time from a UTC instant on both sides of the daylight-saving change; `nyLocalToIso`/`nyLocalInput` round trips, including the change days; `outcomesFor`.
- [x] 2.2 Add `src/contact-log.mjs` (design D7).
- [x] 2.3 Run `npm test`.

## 3. Store and controller

- [x] 3.1 `src/supabase-store.mjs`: read `contact_log` and `contact_log_versions` in the staff `getCase` (and stop reading `contact_attempts`); map them as `contacts` (each with `versions`); add `logContact` and `editContact`; `STAFF_TABLES` swaps `contact_attempts` for the two tables. Update `tests/store.test.mjs`, including that the client path names neither table.
- [x] 3.2 `src/staff-views.mjs` `decorateStaffCase`: names on contacts and versions; follow-ups no longer carry `attempts`. `src/controller.mjs`: `logContact(caseId, entry, followupId)` and `editContact(contactId, entry)` (design D10); a Realtime change on either table re-reads the open case. `src/contracts.mjs`, `src/case-actions.mjs`, `src/app.mjs` notices: drop `RECORD_CONTACT` (keep its History label in `staff-views.mjs`). Update `tests/controller.test.mjs`, `tests/case-actions.test.mjs`, `tests/domain.test.mjs` and `tests/shell.test.mjs` where they name `RECORD_CONTACT` or `attempts`.
- [x] 3.3 Run `npm test`.

## 4. The form, the Contacts tab and the office

- [x] 4.1 `src/staff-views.mjs`: `logContactForm` (design D8), `contactsPanel` and `mayEditContact`; `CASE_TABS` gains Contacts; `renderStaffCase` and `renderAdminCase` add the tab with its count. Tests in `tests/staff-views.test.mjs` and `tests/admin-views.test.mjs`.
- [x] 4.2 `src/admin-views.mjs`: `followupForms` renders `logContactForm` linked to the task in place of "Record a call", and "Resolve this task" unchanged; `attemptList` becomes `taskContacts`. `src/office-views.mjs` and `src/views.mjs`: the drawer and its queue button read "Log contact". Update `tests/admin-views.test.mjs`, `tests/office-views.test.mjs` and `tests/empty-states.states.mjs`.
- [x] 4.3 `src/app.mjs`: submit both forms (`reportValidity()`, the "Other" name warning, drafts kept, focus after save), toggle the outcome groups on change and after restoring drafts, Copy and Copy all, and the toasts (design D10).
- [x] 4.4 `src/styles.css`: button groups, the entry list, the inline form, the disclosure; check at phone width.
- [x] 4.5 Run `npm test`.

## 5. Browser story

- [ ] 5.1 Update `tests/browser.mjs`: the office follow-up phase logs through the Log contact form (in the drawer and on the Follow-up tab) instead of `RECORD_CONTACT`; add a contact-log phase (log, live in a second window, edit sent → client replied, admin correction, persona without Edit, incoming line, Copy all on the clipboard, the client window shows nothing).
- [ ] 5.2 Ask Hailey before switching the main checkout to this branch; then, from the main checkout, run `npm run db:migrate:test` and `npm run test:browser` once. Record the result in verify.md.

## 6. Docs and checks

- [ ] 6.1 `docs/developer/database.md`: the two tables, the two RPCs, why they sit beside `vitally_apply_action`, the move, `RECORD_CONTACT` refusing, the fixture change. `docs/developer/frontend.md`: the Contacts tab, the shared form, `src/contact-log.mjs`. Update the unit test count in `docs/developer/frontend.md` and `docs/developer/README.md`.
- [ ] 6.2 Run `npm test`, `npx openspec validate --all`, and `npm run build:hant -- --check` (expected: nothing to regenerate).
