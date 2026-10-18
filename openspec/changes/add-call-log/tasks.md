## 1. Database

- [ ] 1.1 Write `tests/database-calls.mjs` first (it fails until 1.2 exists), with `createDatabaseFixture`:
  - Alex, Morgan and Sam each log on cases in different stages; `logged_at`, `logged_by_person_id` and version 1 are set by the database; `cases.revision`, `case_events` and `client_events` are unchanged.
  - Refusals with no receipt left behind: "other" without a name, a name with client/spouse, a missing or unknown method/purpose/outcome, a note over 1000 characters, an unknown key (`VT007`); a client's private draft (`VT002`); an applicant session, no persona, a persona from another workspace (`VT001`).
  - Edit: the logger and Sam (admin) succeed, each appending a version; Alex editing Morgan's entry is `VT001`; a stale `p_expected_revision` is `VT003`; `logged_at` and the logger never change; earlier versions are unchanged.
  - Replay: the same action id and envelope returns the stored receipt without a second row; the same id with another envelope is `VT007`.
  - No delete or update for `authenticated` on either table (applicant and presenter sessions); a client session reads no row of either table, even on its own case.
  - Sample-case reset removes fixture cases' calls.
- [ ] 1.2 Add `supabase/migrations/031_call_log.sql` (design D1–D5): the two tables with their checks and foreign keys, RLS select policies, grants, Realtime publication, `vitally_log_call` and `vitally_edit_call`, and `revoke … grant execute … to authenticated`. Redefine no existing function.
- [ ] 1.3 Run `npm run db:migrate:test`, then `npm run test:database`.

## 2. Summary line

- [ ] 2.1 Unit tests first in `tests/call-log.test.mjs`: the exact brainstorm line; a one-word persona; an unknown persona; spouse with and without intake names; client with no name; "other"; no note; a note ending in a period; a note with line breaks; `callSummaries` oldest first joined by `\n`; every label of every option list.
- [ ] 2.2 Add `src/call-log.mjs` (design D7): option lists, labels, `staffShortName`, `callSummary`, `callSummaries`.
- [ ] 2.3 Run `npm test`.

## 3. Store and controller

- [ ] 3.1 `src/supabase-store.mjs`: read `case_calls` and `case_call_versions` in the staff path of `getCase` and map them onto the staff case as `calls` (each with its `versions`, oldest first); add `logCall` and `editCall`; add both tables to `STAFF_TABLES`. Unit tests in `tests/store.test.mjs`, including that the client path never names either table.
- [ ] 3.2 `src/controller.mjs`: `logCall(caseId, entry)` and `editCall(callId, entry)` per design D9 (action id, selected persona, expected revision, re-read on success, conflict message and re-read on CONFLICT, not retryable); a Realtime change on either table with the open case's `case_id` re-reads the case. Unit tests in `tests/controller.test.mjs`.
- [ ] 3.3 Run `npm test`.

## 4. The Calls tab

- [ ] 4.1 `src/staff-views.mjs`: `CASE_TABS` gains Calls between Follow-up and History; a shared `callsPanel(record, person, ui)` renders the section (design D8); `renderStaffCase` and `renderAdminCase` (`src/admin-views.mjs`) both add the Calls tab with its count. Update the `CASE_TABS` test (`tests/staff-views.test.mjs:1107`) and add tests: tab order and count, newest first, Edit only for the logger or an admin, "edited …", "Earlier versions (n)", the empty line and no Copy all, the form's fields and the "Other" name field, no phone digits in the tab.
- [ ] 4.2 `src/app.mjs`: submit and validate the Add a call form and the inline edit form (`required` and `reportValidity()` for method, purpose and outcome; a warning toast and focus for a missing "other" name; form drafts kept across redraws; focus back on the entry after save); Copy and Copy all with `navigator.clipboard.writeText` and the toasts in design D9; success toasts "The call is logged." and "The call is updated."
- [ ] 4.3 `src/styles.css`: the entry list, the summary line, the inline form, and the versions disclosure, in the existing staff panel style, at phone width too.
- [ ] 4.4 Run `npm test`.

## 5. Browser story

- [ ] 5.1 Add a story step to `tests/browser.mjs`: Alex logs a call on the story's case and sees it in another window without a reload; Morgan's edit button is absent on Alex's entry; Alex edits it and the earlier version opens; Sam corrects it; Copy all puts the exact lines on the clipboard (grant clipboard permissions to the context); the client window has no Calls tab or call text.
- [ ] 5.2 Ask Hailey before switching the main checkout to this branch; then, from the main checkout, run `npm run db:migrate:test` and `npm run test:browser` once. Record the result in verify.md.

## 6. Docs and checks

- [ ] 6.1 `docs/developer/database.md`: the two tables, the two RPCs, and why they sit beside `vitally_apply_action` (design D1, D3). `docs/developer/frontend.md`: the Calls tab and `src/call-log.mjs`. Update the unit test count in `docs/developer/frontend.md` and `docs/developer/README.md`.
- [ ] 6.2 Run `npm test`, `npx openspec validate --all`, and `npm run build:hant -- --check` (expected: nothing to regenerate).
