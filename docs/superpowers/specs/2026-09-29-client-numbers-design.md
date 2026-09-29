# Part 2: Client numbers

**Status:** approved in brainstorming on 2026-09-29.

**Roadmap:** part 2 of `docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md` §2.

**Decision it implements:** D2 in `docs/design/redesign-review.md`, "assigned on submit, restart at #001 each season".

## 1. Scope

**In:**
- A client number for every submitted case, counted per workspace and season.
- The number is shown wherever the designs show `#093`, on staff screens and on the client's own screens.
- Staff can find a case by its number in the volunteer board's search.

**Out:**
- **The returning-client search in Add a case.** It is roadmap part 6, after part 4's new intake fields exist (phone, date of birth, household).
- **The Season settings page** (roadmap part 7). That includes changing the season, the "numbers left this season" warning, the restart-each-season toggle, and a season label on earlier seasons' numbers ("#093 · 2024"). Until then every case is in one season.
- **A search box on the case pool.** PR 4 left it out, and part 2 doesn't add it.

## 2. Rules

1. **Assigned on submit.** A case gets its number in the same transaction that moves it from `draft` to `received`. This covers the client's own submit and the office's assisted submit, which share `act_submit`.
   - A draft has no number.
   - A refused or rolled-back submit uses no number.
2. **Counted per season.** The season is the workspace's `current_season`, a tax year (2025 today). Numbers start at 1 in each (workspace, season).
3. **Never reused.** A number, once handed out, is never given to another case in that season. That holds even after the case is deleted, which is what a sample reset does.
4. **Never changed.** Once set, a case's season and number cannot be changed or cleared.
5. **Sample cases take the same counter.** Every reset numbers the six samples in `fixture_keys()` order. Resets therefore leave gaps in the class's numbering, and that's accepted.

## 3. Data model

Migration `supabase/migrations/010_client_numbers.sql` makes these changes.

**`public.workspaces`**
- Add `current_season smallint not null default 2025`, with `check (current_season between 2000 and 2100)`.

**`public.cases`**
- Add `season smallint` and `client_number integer`.
- Constraint `cases_client_number_pair`: `(season is null and client_number is null) or (season is not null and client_number is not null and client_number > 0)`.
- Constraint `cases_client_number_key`: `unique (workspace_id, season, client_number)`.
- Trigger `cases_client_number_immutable`: before update, if `old.client_number is not null` and (`new.client_number is distinct from old.client_number` or `new.season is distinct from old.season`), raise an exception. It applies to every role.

**`vitally_private.client_number_counters`**
- Columns:
  - `workspace_id uuid references public.workspaces(id) on delete cascade`
  - `season smallint`
  - `last_number integer not null default 0 check (last_number >= 0)`
- Primary key `(workspace_id, season)`.
- It lives in the private schema, and nothing is granted to `anon`, `authenticated` or `service_role`. Presenters and applicants are both `authenticated` users, so neither can reach it; only the security-definer functions below touch it.

**`vitally_private.next_client_number(p_workspace_id uuid) returns table(season smallint, client_number integer)`**
1. Read the workspace's `current_season`.
2. `insert into client_number_counters … on conflict do nothing`.
3. `update … set last_number = last_number + 1 where … returning`.

The update's row lock serializes concurrent submits, so there is no retry loop.

**`act_submit`**
- After the stage update, set `season` and `client_number` from `next_client_number(p_case.workspace_id)`.
- Add `"clientNumber": <n>` to the SUBMIT event's `detail`.

**`seed_fixtures`**
- Each sample it creates is numbered through `next_client_number`, in `fixture_keys()` order.

**Backfill** (in the same migration):
1. Number every case with `stage <> 'draft'` and no number, per workspace, in `current_season`.
2. Order by the `created_at` of its `SUBMIT` row in `case_events`, falling back to the case's `created_at` and then `reference`.
3. Set each workspace's counter to the highest number it used.

**Store** (`src/supabase-store.mjs` `mapCase`)
- Maps the columns to `season` and `clientNumber` (`null` on a draft).
- Case visibility is unchanged: whoever can read a case reads its number, including the applicant for their own case.

## 4. Display

**`formatClientNumber(n)`** in `src/ui.mjs`:
- `#` plus the number padded to three digits: "#093", "#101", "#1000".
- `null` or `undefined` gives `null`, and callers render "No number yet".

| Place | Shows |
|---|---|
| Volunteer work board (`staff-views.mjs` `boardRow`) | The first column's header becomes "Client". The cell shows the number (bold, or "No number yet"), with the existing `button.board-reference` Application ID below it. |
| Office queue (`office-views.mjs` `queueRow`) | The same in the Client column, above the reference button and stage badge. |
| Case pool (`pool-views.mjs` `pool-row`) | The first column becomes "Client" and shows the number above the reference button. |
| Case page header (`caseHeader`) | A "Client #093" line above the title. `#case-title` keeps exactly the Application ID. |
| Log a call drawer (`logCallDrawerBody`) | The case line reads "#093 · VT-…". |
| Client progress page | "Client #093" beside the Application ID once submitted. |
| My applications | Each submitted row shows its number. |
| Printed reference card (the `print` dialog) | The line "CLIENT NUMBER #093" under the Application ID, once submitted. |
| Case history | The submit sentence becomes "Sent to the office · Client #093 assigned" when the event's detail carries `clientNumber`. |

**Search:**
- The volunteer board's search keeps `#field-board-search` and `#board-search-form`, and its label and placeholder become "Find a client # or Application ID".
- A query that is only digits, optionally after one `#`, matches `clientNumber` exactly within the workspace's current season (`93`, `093` and `#093` all match #093; `9` does not). Every other query keeps today's Application ID match.
- Results still come from every stage.

## 5. Hooks that must not change

- `#case-title` text equals the Application ID.
- `button.board-reference[data-action="open-case"]` holds the Application ID as its text.
- `#field-board-search`, `#board-search-form`.
- The `.reference-card strong` Application ID, `.application-row`, and the `SUBMIT` case action.

## 6. Testing and acceptance

**Database suite** (`tests/database*.mjs`):
- **Assignment.** A draft has no number, a client submit gets #1, and an assisted submit gets the next number.
- **Refusals.** A refused submit (missing required answers, or a stale revision) assigns nothing and leaves the counter where it was.
- **Concurrency.** Two submits sent at the same time through the real RPC get two different consecutive numbers, with no error.
- **No reuse.** After a sample reset, the next class submission is higher than every number the deleted samples held.
- **Samples.** A reset numbers every sample, in `fixture_keys()` order.
- **Season change.** With `current_season` changed in the test, numbering restarts at 1, and old cases keep theirs.
- **Immutability.** Changing or clearing a set number is refused, even for the service role.
- **Private counter.** Neither an applicant nor a presenter session can read or write `client_number_counters`.
- **Backfill.** Existing submitted cases are numbered in SUBMIT-event order, and the counter is set to the highest.
- **Visibility.** An applicant reads their own case's number and no one else's.

**Unit tests:**
- `formatClientNumber`: padding, 4+ digits, and null.
- Board search: "93", "093" and "#093" match; "9" doesn't; Application IDs still match.
- Every place in §4 renders the number, or "No number yet" on a draft.
- The history sentence.

**Browser story:**
- After applicant A submits, the progress page shows "Client #…" and the staff board row shows the same number.
- A board search by that number finds the case.

**Done when:**
- All four suites pass.
- The screenshots show numbers on the board, queue, pool, case header and progress page.
- The hooks in §5 are unchanged.
