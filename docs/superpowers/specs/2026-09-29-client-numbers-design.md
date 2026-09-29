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
   - An assisted draft the office closes without sending (`act_close_case` allows closing an unowned draft) never gets a number. It is `closed` with no number, and says "Never sent".
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
- Trigger `cases_client_number` (before update, every role): if `old.client_number is not null` and (`new.client_number is distinct from old.client_number` or `new.season is distinct from old.season`), raise an exception. The same trigger assigns numbers (below).

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

**Where the number is assigned.** A `before update` trigger on `public.cases` assigns it: when a case leaves `draft` for any stage except `closed`, and has no number yet, it takes `next_client_number(workspace_id)`. That one rule covers both paths:
- **`act_submit`** moves the case to `received`, and the trigger numbers it in the same transaction. `act_submit` is replaced only to read the number back (`returning client_number`) and add `"clientNumber": <n>` to the SUBMIT event's `detail`.
- **`seed_fixtures`** inserts each sample as a `draft` and then updates it to its scenario stage, in `fixture_keys()` order, so the trigger numbers the samples in that order without the seeder being replaced.
- **Closing** an unowned draft (`draft` → `closed`) is the one exit that is not a submission, so the trigger skips it (rule 1).

**Backfill** (in the same migration):
1. Number every case that has a `SUBMIT` row in `case_events` and no number, per workspace, in `current_season`.
   - Stage is not the test. A closed assisted draft is not a draft, but it was never submitted, so it stays unnumbered (rule 1).
   - The sample cases qualify, because the seeded sample history records a `SUBMIT` for each sample (009 `fixture_history`).
   - If a sample past draft turns out to have no `SUBMIT` row in `case_events`, number it anyway: samples are submitted by construction. The plan checks which table the seeded history writes to.
2. Samples come first, in `fixture_keys()` order, the same order a reset numbers them in. Their seeded SUBMIT times depend on each scenario's history length, so history order wouldn't match. Every other case follows, ordered by the `created_at` of its `SUBMIT` row in `case_events`, then `reference`.
3. Set each workspace's counter to the highest number it used.

**Store** (`src/supabase-store.mjs`)
- `getWorkspace()` also maps `currentSeason: Number(row.current_season)`. It already selects `*`, and presenters already load it; the board search needs it.
- `mapCase` maps the columns to `season` and `clientNumber` (`null` on a draft, and on a closed never-sent case).
- Case visibility is unchanged: whoever can read a case reads its number, including the applicant for their own case.

## 4. Display

**`formatClientNumber(n)`** in `src/ui.mjs`:
- `#` plus the number padded to three digits: "#093", "#101", "#1000".
- `null` or `undefined` gives `null`. Callers then render one of two words, by stage:
  - "Never sent" on a `closed` case (an assisted draft closed before it was submitted).
  - "No number yet" otherwise (a draft).
- One helper decides the words, `clientNumberLabel(record)` in `src/ui.mjs`, which returns the formatted number, "Never sent" or "No number yet". The staff places in the table below use it; the client places show the number only once the application is submitted.

| Place | Shows |
|---|---|
| Volunteer work board (`staff-views.mjs` `boardRow`) | The first column's header becomes "Client". The cell shows `clientNumberLabel` (bold when it is a number), with the existing `button.board-reference` Application ID below it. |
| Office queue (`office-views.mjs` `queueRow`) | The same in the Client column, above the reference button and stage badge. |
| Case pool (`pool-views.mjs` `pool-row`) | The first column becomes "Client" and shows the number above the reference button. |
| Case page header (`caseHeader`) | A "Client #093" line above the title. `#case-title` keeps exactly the Application ID. |
| Log a call drawer (`logCallDrawerBody`) | The case line reads "#093 · VT-…". |
| Client progress page | "Client #093" beside the Application ID once submitted. |
| My applications | Each submitted row shows its number. |
| Printed reference card (the `print` dialog) | The line "CLIENT NUMBER #093" under the Application ID, once submitted. |
| Case history | The submit sentence keeps its words ("Sam submitted the application.") and adds "Client #093 assigned." when the event's detail carries `clientNumber`. |

**Search:**
- The volunteer board's search keeps `#field-board-search` and `#board-search-form`, and its label and placeholder become "Find a client # or Application ID".
- A query that is only digits, optionally after one `#`, matches `clientNumber` exactly (`93`, `093` and `#093` all match #093; `9` does not). It matches only cases whose `season` equals `state.workspace.currentSeason`, so the right #093 is found once part 7 adds seasons.
  - If the workspace hasn't loaded yet (`state.workspace` is null), it matches any season. Today every case is in one season, so the two behave the same.
  - The renderer receives the season through `ui.currentSeason`, which `staffScreen` passes from `state.workspace`.
- Every other query keeps today's Application ID match.
- Results still come from every stage.

## 5. Hooks that must not change

- `#case-title` text equals the Application ID.
- `button.board-reference[data-action="open-case"]` holds the Application ID as its text.
- `#field-board-search`, `#board-search-form`.
- The `.reference-card strong` Application ID, `.application-row`, and the `SUBMIT` case action.

## 6. Testing and acceptance

**Database suite** (`tests/database*.mjs`):
- **Assignment.** A draft has no number, a client submit gets #1, and an assisted submit gets the next number.
- **Closed without sending.** An assisted draft closed by the office has no number and doesn't move the counter.
- **Refusals.** A refused submit (missing required answers, or a stale revision) assigns nothing and leaves the counter where it was.
- **Concurrency.** Two submits sent at the same time through the real RPC get two different consecutive numbers, with no error.
- **No reuse.** After a sample reset, the next class submission is higher than every number the deleted samples held.
- **Samples.** A reset numbers every sample, in `fixture_keys()` order.
- **Season change.** With `current_season` changed in the test, numbering restarts at 1, and old cases keep theirs.
- **Immutability.** Changing or clearing a set number is refused, even for the service role.
- **Private counter.** Neither an applicant nor a presenter session can read or write `client_number_counters`.
- **Backfill.** Existing submitted cases are numbered in SUBMIT-event order, and the counter is set to the highest. A closed assisted draft that was never submitted stays unnumbered.
- **Visibility.** An applicant reads their own case's number and no one else's.

**Unit tests:**
- `formatClientNumber`: padding, 4+ digits, and null.
- `clientNumberLabel`: a number, "Never sent" on a closed case with no number, and "No number yet" on a draft.
- `getWorkspace` maps `currentSeason`.
- Board search: "93", "093" and "#093" match; "9" doesn't; a case in another season doesn't match when `currentSeason` is known; any season matches when it's null; Application IDs still match.
- Every place in §4 renders the number, "No number yet" on a draft, and "Never sent" on a closed never-sent case.
- The history sentence.

**Browser story:**
- After applicant A submits, the progress page shows "Client #…" and the staff board row shows the same number.
- A board search by that number finds the case.

**Done when:**
- All four suites pass.
- The screenshots show numbers on the board, queue, pool, case header and progress page.
- The hooks in §5 are unchanged.
