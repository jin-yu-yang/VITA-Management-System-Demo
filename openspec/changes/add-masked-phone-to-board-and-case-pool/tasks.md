## 1. The phone in the list read

- [ ] 1.1 Update `tests/store.test.mjs` first, and run it to see it fail.
  - "a presenter list carries the summaries a work board reads": five summary fields (`phone` added), with `row.phone === "2155550100"` from the fake `case_contacts` row.
  - The grouped reads become four: `case_contacts` is read with `.in("case_id", ["case-1"])`, and its columns are exactly `case_id,phone` (no spouse phone, best time or note, no `*`).
  - A listed case with no contact row gets `phone: null`.
  - The applicant list and the empty presenter list still read only `memberships` and `cases`. Those tests are unchanged and must still pass.
- [ ] 1.2 In `src/supabase-store.mjs`, add the fourth grouped read to the presenter branch of `listCases`, and set `phone` on each record (design D2). The 1.1 tests pass.

## 2. The work board's Phone column

- [ ] 2.1 Write the unit tests first in `tests/staff-views.test.mjs` (around the board tests near line 1256), and run them to see them fail. Use fictional phones only.
  - The header row reads Client, Stage, Phone, Language, Service, Preparer, Reviewer, Updated, then actions.
  - **Locked** (Alex on an available case; Morgan on a case Alex prepares): the row's Phone cell has `phone-mask is-locked`, the lock, the tooltip, no `tabindex`, no `id="board-phone-…"`, and the row contains neither the full number nor its first six digits.
  - **Revealable** (Alex on a case Alex prepares; a `followup` persona on any case): `id="board-phone-<case id>"`, `tabindex="0"`, the eye, `.phone-full` with the formatted number, and no attribute carrying digits beyond the last four.
  - **Empty phone** (`phone: null` and `""`): the cell reads "—" for every viewer.
  - **Spouse phone:** a record carrying a spouse phone shows no trace of it.
  - **`listPhone` directly:** "—" for a missing, null or empty phone; the revealable mask with `id="board-phone-case-9"` for an allowed viewer; the locked mask with no id otherwise.
  - **Order:** in each row's markup, `class="board-reference"` comes before `phone-mask`.
  - **Footnote:** it keeps "This board shows workflow only" and adds "Phone numbers stay masked: on cases you work on, hover over or tab to a number to see it."
- [ ] 2.2 In `src/staff-views.mjs`, add the exported helper `listPhone(record, person, prefix)` next to `phoneMask` (design D3), then add the Phone header and the `listPhone(record, person, "board-phone")` cell after Stage in `boardRow`, and append the footnote sentence (design D4, D6, D7). The 2.1 tests pass, and so do the existing board tests.

## 3. The case pool's Phone column

- [ ] 3.1 Write the unit tests first in `tests/pool-views.test.mjs`, and run them to see them fail.
  - The header row reads Client, Stage, Phone, Language, Service, Preparer, Reviewer, Updated.
  - With an admin `person` in `ui`, every row with a phone is revealable with `id="pool-phone-<case id>"`, including an unclaimed case.
  - With a volunteer `person` (the rule, not the screen gate), an unclaimed row is locked with no id. This checks that the pool goes through `canSeeContact`.
  - With no `person`, every row is locked (`canSeeContact(record, null)` is false).
  - Empty phone: "—". Order: `board-reference` before `phone-mask`.
  - The footnote keeps "This pool shows workflow only" and adds "Phone numbers stay masked until you hover over or tab to them, so they don't show on a shared screen."
- [ ] 3.2 In `src/pool-views.mjs`, read `person` from `ui` in `renderCasePool`, pass it to `poolRow`, add the Phone header and the `listPhone(record, person, "pool-phone")` cell after Stage, and append the footnote sentence. In `src/views.mjs`, pass `person` in the `renderCasePool` call (design D5). The 3.1 tests pass, and so do the existing pool tests.
- [ ] 3.3 Run `npm test` and confirm the whole unit suite passes.

## 4. Browser check

- [ ] 4.1 Run `npm run db:migrate:test` (main has migration 025).
- [ ] 4.2 Add a phase to `tests/browser.mjs` that reuses the two-staff-window pattern (`staffB`, around line 1577), as design D8 describes. Take a `preparation_ready` fixture case that the phase claims, and leave the earlier phases alone.
  1. Window B, Alex, on the work board, finds the case by its Application ID with the board search. Search reaches every stage, so the row stays listed after the claim moves it off the Available tab. The case's row has a locked mask, with `is-locked`, no `tabindex`, no `id`, and no full number in the row's `outerHTML`.
  2. Window A, Alex, claims preparation from the board.
  3. Window B, without a reload, navigation or a new search: the same row's mask becomes `#board-phone-<case id>` with `tabindex="0"` and `.phone-full`.
  4. Window A: go back to the work board; the same row is revealable.
  5. Window B: focus the row's `button.board-reference`, press Tab once: the active element is `#board-phone-<case id>`, and its `.phone-full` is visible.
  6. Assert the console is quiet in both windows, as the neighbouring phases do.
- [ ] 4.3 Check that the existing #68 case-page phone checks and the board, pool and queue phases still pass. Run `npm run test:browser`.

## 5. Docs

- [ ] 5.1 In `docs/design/DESIGN.md` §8 "Masked phone", replace "Today that is the case page's contact card and intake answers; no list shows a phone." with a sentence naming the case page's contact card and intake answers, the volunteer work board and the admin case pool.
- [ ] 5.2 Do not regenerate the existing `implemented-*` screenshots. Each one records the part that added it.
