<!--
Raw capture of superpowers:brainstorming output.
The brainstorm happened in the conversation (CLAUDE.md lifecycle step 2) and was
approved there; this file records it. design.md reorganises it.
-->

# Brainstorm: add-masked-phone-to-board-and-case-pool

Path: architectural (the schema's full path: brainstorm, proposal, design, specs, tasks, plan).
The design below was explored with `/opsx:explore` and agreed turn by turn with the user
before propose. Nothing here was re-asked during propose.

## Background

- #68 (`mask-phone-numbers-on-screen`, archived 2026-10-14) masks a client's phone on the
  staff case page. It added `phoneMask(value, allowed, id)` in `src/staff-views.mjs` and the
  rule `canSeeContact(record, person)` in `src/intake-catalogue.mjs` (office staff on any
  case; a volunteer only as the case's preparer or reviewer). The canonical spec is
  `openspec/specs/staff-case-work/spec.md`.
- D5 in `docs/design/redesign-review.md` says phones are **masked everywhere on lists**. The
  two list mockups, `staff-board-v7` (volunteer work board) and `admin-work-board` (admin case
  pool), both show a Phone column right after Stage: a lock on cases the volunteer has not
  claimed, an eye (hover to reveal) on the viewer's own cases and on every case in the admin pool.
- `docs/design/DESIGN.md` §8 says today: "Today that is the case page's contact card and
  intake answers; no list shows a phone." That sentence becomes false with this change.

## User's request (as given)

- Add a masked phone column to the volunteer work board and the admin case pool.
- Reuse `phoneMask` and `canSeeContact`; do not add a second rule.
- Unclaimed cases and cases someone else claimed: locked mask. Cases the viewer may see
  (own cases; every case for admins): revealable mask.
- Each revealable mask has a unique id per row so a realtime redraw keeps focus.
- Update DESIGN.md §8.
- Still display-only, and the PR says so, as #68's did.

## Findings from explore

1. **The list does not carry phones today.** `listCases()` (`src/supabase-store.mjs:361`)
   reads `cases` (`select *`, which has no phone; phones live in `case_contacts`) plus three
   grouped reads for a presenter: `preparation_participants`, `admin_followups`,
   `document_requests`, each `.in("case_id", ids)` with named columns. Loading the phone
   needs a **fourth grouped read**: `case_contacts` with `case_id,phone` only.
2. **No database change is needed.** `case_contacts` is readable by every staff persona under
   RLS (migration 011, `visible_case_contacts`), and `getCase` already reads the full contact
   for any staff viewer, so a locked case page already holds the number in browser state.
   `canSeeContact` is a screen rule (RLS cannot tell personas apart). Reading `phone` alone
   adds no new exposure. The change stays display-only, like #68.
3. **Realtime needs no change.** `handleChange` (`src/controller.mjs:794`) reloads the list
   only on a `cases` change. The only writer of a phone, `act_save_answers` (migration 023),
   updates `cases.answers` in the same transaction, so a phone edit reaches the board.
   `act_update_contact` never writes a phone.
4. **Claims reload the board.** `act_claim_preparation` (003) sets `cases.stage` and
   `cases.preparer_id` before it inserts the participants row; `act_claim_review` (006) sets
   `cases.reviewer_id`. `vitally_apply_action` bumps `cases.revision`. So:
   - the claiming window: `dispatch` -> `refresh()` -> `loadList()` (`controller.mjs:1768`,
     `:691`), then `navigate("staff-case")` (`app.mjs:978-983`). Back on the board, the row is
     already revealable.
   - any other window: the realtime `cases` change -> `loadList()` -> redraw.
   A board claim moves the claiming window to the case page, so "the row unlocks right away
   on the board" is observable only in a second window.
5. **Rendering hooks.** `boardRow(record, person, ui)` (`staff-views.mjs:530`) already has
   `person`. `poolRow(record, now)` (`pool-views.mjs:109`) has none; `renderCasePool` is called
   from `views.mjs:273` without a person. The pool screen is admin-only (`views.mjs:217`), so
   every pool row is revealable, but the pool still goes through `canSeeContact`.
   A `followup`-only persona gets the volunteer board, and `canSeeContact` gives it a
   revealable mask on every row, as on the case page.
6. **Focus after a redraw.** `describeFocus` (`src/ui.mjs:241`) records the focused element's
   `id`, and the redraw puts focus back on it. A per-row id keeps a revealed number revealed.
7. **Tests that read the columns.**
   - No test reads board or pool cells by position. `row.cells[3]` in `tests/browser.mjs:1351`
     is the office follow-up queue.
   - `tests/staff-views.test.mjs:1256` and `tests/pool-views.test.mjs:180` match only the
     Client header. Browser tests count `.board-row`, find rows by reference and match
     `tr.pool-row` text; a new cell breaks none of them.
   - `tests/store.test.mjs:455` pins "exactly four summary fields" and three grouped reads.
     It must change to five fields and four reads.
   - `tests/browser.mjs:815` (#68) checks the locked case page's HTML for the full number.
     It covers only the case page; the board needs its own.
8. **CSS.** No board or pool CSS selects a column by position (`nth-child`), and the table
   wrapper scrolls horizontally. The existing `.phone-mask` styles (styles.css ~4653) apply in
   a table cell as they do in a detail row.

## Decisions (Q -> answer)

- **Q1. Where do the new requirements live?** -> ADDED requirements in the existing
  `staff-case-work` capability, so the mask rule stays in one spec. Its Purpose line still says
  "case page"; archive does not edit a Purpose, so updating it is a **follow-up owned by the
  user** (affects only the spec's wording). Rejected: a new `work-board` capability, which
  would describe the phone rule in two specs.
- **Q2 (a). Column.** -> Header "Phone", right after Stage, on both tables (as both mockups).
  The client's phone only; never the spouse's.
- **Q3 (b). Data.** -> Fourth grouped read in the presenter branch of `listCases`:
  `case_contacts`, columns `case_id,phone`, `.in("case_id", ids)`. New field `phone` on each
  list record (`null` when the case has no contact row). Applicant lists are unchanged.
  Rejected: a last-four RPC or view (needs a migration and an RPC change: a database change
  this display-only change does not need).
- **Q4 (c). Locked rows.** -> `phoneMask(phone, false)`: muted dots, lock icon, tooltip
  "Claim this case to see the full number", screen-reader "Ends in 1234. Claim this case…",
  no id, no tab stop, no full number in text or attributes.
- **Q5 (d). Revealable rows.** -> `phoneMask(phone, true, id)` with
  `id = "board-phone-<caseId>"` on the board and `"pool-phone-<caseId>"` on the pool. The
  allowed flag is `canSeeContact(record, person)` in both places; `renderCasePool` gets
  `person` passed in from `views.mjs`.
- **Q6 (e). Empty phone in a list.** -> "—", like every other empty list cell, not the
  contact card's "Not given". The list checks for an empty phone before calling `phoneMask`.
- **Q7 (f). Footnotes.** -> Keep each table's "workflow only…" note and add one phone
  sentence. Wording settled in propose (see below).
- **Q8 (g). Keyboard.** -> Accept one extra tab stop per revealable row (41 on the sample
  pool), so the board and pool behave like the case page. **The row's case link stays before
  the phone in tab order**: the Phone cell follows the Client cell (which holds the reference
  button; the client number is plain text), so the order is reference button -> phone ->
  row actions.
- **Q9 (h). Display-only.** -> Say so in proposal.md and in the PR body, as #68 did: the full
  number is still delivered to the browser for every staff persona; the mask is a screen rule.
- **Q10. Claim reload + browser check.** -> Confirmed (finding 4). Add a browser check with
  two windows of the same persona (reusing the `staffB` pattern at `tests/browser.mjs:1577`):
  1. Window B (Alex) on the board: the `preparation_ready` row shows a locked mask
     (`is-locked`, no `tabindex`, no `id`, no full number in the row's HTML).
  2. Alex claims from the board in window A. Without a reload or navigation, window B's row
     becomes `#board-phone-<caseId>` with `tabindex="0"` and the eye icon.
  3. Window A, back on the board: the same row is revealable.
  4. Window B: focus the row's reference button, press Tab once: focus is on
     `#board-phone-<caseId>`, and the full number shows.
  Plus a unit check that in each row's markup the `board-reference` button comes before
  `phone-mask`, for the board and the pool.

## Footnote wording (settled in propose; the user reviews it with the artifacts)

- Board, appended: "Phone numbers stay masked: on cases you work on, hover over or tab to a
  number to see it."
- Pool, appended: "Phone numbers stay masked until you hover over or tab to them, so they
  don't show on a shared screen."

## DESIGN.md §8

Replace "Today that is the case page's contact card and intake answers; no list shows a
phone." with a sentence naming the case page's contact card and intake answers, the
volunteer work board and the admin case pool.

## Scope

In: a masked client-phone column after Stage on the volunteer work board and the admin case
pool, using `phoneMask` and `canSeeContact`; a phone-only grouped read in `listCases`; a
phone sentence in each footnote; DESIGN.md §8.
Out: any database, migration, RPC, RLS or realtime change; the spouse phone; the case page;
the office follow-up queue; the `staff-case-work` Purpose line (follow-up).

## Dependencies

- `case_contacts` RLS for presenters (migration 011): ready.
- Realtime reload through the `cases` row: ready (finding 3, 4).
- Migration 025 on main: ready; run `npm run db:migrate:test` before database or browser tests.

## Acceptance / checks

- `npm test`: phone column unit tests for both tables (locked, revealable with id, empty "—",
  tab order in markup, header position), store test updated to five fields and four reads
  with the new read checked as phone-only and scoped to the listed ids.
- `npm run db:migrate:test`, then `npm run test:browser` with the Q10 check.
- Not needed: `npm run test:database` (no SQL changes), `npm run test:auth-browser` (sign-in
  untouched), `npm run build:hant -- --check` (staff screens are English; no client text).
