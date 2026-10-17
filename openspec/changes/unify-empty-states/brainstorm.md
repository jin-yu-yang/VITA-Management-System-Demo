# Brainstorm: unify-empty-states

Captured from the design conversation of 2026-10-16. The user approved scope B and the four points below ("Go with B. …"). Path: architectural, because the change adds a shared helper that every list, and Jinyu's lifecycle phases, will build on.

## Background

- **Issue #73.** The second "shared screen states" item is "Empty states: one helper, every list". Jinyu shipped the first item (#75, capability `screen-states`). Hailey's confirmation dialogs (#78) is open, not merged.
- **What §2 of `docs/design/redesign-review.md` says.** It lists the missing empty states:
  - no cases, or nothing in a board filter;
  - an empty follow-ups queue;
  - no notifications;
  - a dashboard before the season;
  - a returning-client search with no match ("designed");
  - a day with no work;
  - no labels.
  
  It gives **no wording, icon or button rules**, and DESIGN.md has none either.
- **Lists in §2 that have no screen in the app:**
  - notifications, the dashboard, the day view and labels;
  - the returning-client search: the design file `add-case-v6-returning-client.png` shows a match, and the search isn't built.
  
  Nothing to wrap for any of them.
- **The only existing look** is the `.empty-state` CSS (`src/styles.css:1431`): centred, a 44px icon in `--vt-primary-line`, an `h2` at 24px, a muted `p` at 14px.
- **#75's requirement** "A list says when it is loading or couldn't load" (`screen-states`) already says a list shows loading, couldn't load, its empty state, or its content. This change defines what "its empty state" is.

### Every list today (read during explore)

**Panel lists:**

| List | Empty today | Markup |
|---|---|---|
| Staff work board (`renderStaffBoard`) | the `EMPTY_TAB[status]` sentence; "Nothing of yours is waiting for …"; "Nothing on this tab matches these filters."; or `No case matches “…”.` | `div.empty-state`, folder icon, `p`, plus Clear filters when filtered or searched |
| Office Follow-ups queue (`renderFollowups`) | "Nothing is waiting on the office right now." or "Nothing here matches these filters." | `div.empty-state`, check icon, `p`, plus Show every task / Show all languages, each undoing one filter |
| Admin case pool (`renderCasePool`) | always "No case matches these filters." | `div.empty-state` with only a `p`: **no icon, and wrong when there are no cases and no filter** |
| Client My applications (`applicationsScreen`) | "No applications yet" + body (EN/简体) | `div.panel.empty-state`, folder icon, `h2` + `p` |
| Client Application ID lookup, no match | "We could not find that Application ID" (EN/简体) | amber notice |

**Case-page sections**, each one `p.muted` unless noted:

| Section | Empty text |
|---|---|
| staff: documents requested (`documentsPanel`) | "No documents have been requested on this case." |
| staff: review attempts (`reviewAttempts`) | "No review attempt has been opened on this case yet." |
| staff: office follow-up (`followupPanel`) | "No office follow-up has been raised on this case." |
| staff: history (`historyPanel`) | "Nothing has been recorded on this case yet." |
| admin: requests waiting (`receiptPanel`) | "No document request on this case is waiting for a response." |
| admin: calls so far (`attemptList`) | "No call has been recorded on this task yet." |
| admin: office follow-up (`adminFollowupPanel`) | "No office follow-up has been raised on this case." |
| Log a call drawer (`logCallDrawerBody`) | "No open follow-up is left on this case." — plain `p`, not muted |
| client progress: history (`progressScreen`) | "Updates from the office appear here." (EN/简体) |

**Tests and the story pin some of this markup:**
- `tests/office-views.test.mjs:241,260` check `class="empty-state"`.
- `tests/browser.mjs:1539` uses the selector `.office-queue .empty-state [data-action="set-board-filter"]`.
- `tests/pool-views.test.mjs:254` pins today's wrong pool wording for an unfiltered, empty pool.
- `src/app.mjs:1439` returns focus to the filter chip after an empty state's undo button goes away.

## Decision chain

**Q1. Scope: panel lists only (A), or panel lists plus the case sections (B)?**
→ **B.** Issue #73 says "every list", and the case sections are the most inconsistent.

**Q2. The case sections.**
→ Change only the empty `<p>` line to `emptyLine(...)`. Don't touch the surrounding markup, the history lines or "Your next step". Jinyu's lifecycle change edits those areas, and issue #73 lists "client-facing stage messages and history lines" as his.

**Q3. Board tabs.**
→ Keep the board's tab logic and the shape of `EMPTY_TAB`. Only the line that renders the empty `<div>` becomes `emptyState(...)`. The PR description tells Jinyu that new phases (Filing, Needs attention, Done, Closed) just need new `EMPTY_TAB` entries.

**Q4. The Application ID lookup with no match.**
→ **Keep the amber notice.** It's usually a mistyped ID, not an empty list. It also means no client text and no Chinese change.

**Q5. Case pool wording.**
→ Fix it. An unfiltered, empty pool says "No cases yet this season."; a filtered one keeps "No case matches these filters.". It also gets the board's folder icon. Its Clear filters stays in the summary line just above, where it already is, so the empty state doesn't add a second button with the same name.

**Q6. The helpers, and where they live.**
→ In `src/ui.mjs`, next to #75's `loadingLine` / `unloadedLine`, so the list states live together:
- `emptyState({ icon, title, text, actions = [], className })` returns `<div class="empty-state …">`. In order: an optional icon, an optional `<h2>` title, the `<p>` text, then the actions.
  - `className` adds a class; the client list uses `panel`.
  - Actions come in ready-made, like #78's `confirmBody`, so each list keeps its own buttons and `data-*` values.
- `emptyLine(text)` returns `<p class="muted">text</p>`.
- Text is HTML the caller has already escaped, as with `confirmBody`.

**Q7. Markup.**
→ Every list except the pool renders **byte-identical** markup, guarded by a golden test captured before the move, as in #78. There are two exceptions:
- **The pool:** icon and wording (Q5).
- **The Log a call drawer's line:** its plain `<p>` becomes muted, like every other case-section line.

**Q8. The client review's "We found no alerts or warnings" (`p.alerts-empty`, green tick).**
→ Leave it out. It reports a good result, like "All set" on the progress page; it isn't an empty list. Recorded as a decision made while writing this brainstorm, from the explore findings.

**Q9. Chinese.**
→ No client text changes. The client list and the client history keep their keys. `npm run build:hant -- --check` is still run.

**Q10. Browser check.**
→ One `npm run test:browser` run. Failures at steps this change doesn't touch are recorded, not retried (user rule).
- The existing story already shows the board, queue and client empty states. The queue selector `.office-queue .empty-state` must keep working.
- A new pool check is not added to the story; unit tests cover the pool wording.

## Overlap

- **PR #78 (unify-confirmation-dialogs, not merged):**
  - It adds helpers after `dialogFocusTarget` in `src/ui.mjs`. These go next to `loadingLine`, a different hunk.
  - `tests/ui.test.mjs`: both add names to the top import block, a one-line conflict.
  - Its view edits are in different functions (close case, corrections, presenter bodies, `dialog()`).
  - Both changes add requirements to `screen-states`. Archive appends, and CLAUDE.md step 8 merges `main` first, so this change's requirements land after #78's.
- **Jinyu's lifecycle stages:** phase tabs on the boards and the pool, "Your next step", client stage messages and history lines. Avoided by Q2 and Q3. The PR description tells him how to add an empty sentence for a new phase.

## Dependencies

- Ready:
  - #75's `screen-states` and its loading and couldn't-load lines;
  - the `.empty-state` CSS;
  - #78's `confirmBody` pattern, as a precedent only, not a code dependency.
- Not a blocker: merging #78 first. Merge `main` in if it lands during this change.

## Acceptance

- `npm test` passes. The golden test shows identical markup for every list except the pool and the drawer line. New unit tests cover `emptyState` / `emptyLine`, the pool's two wordings and its icon, and the drawer line. `tests/pool-views.test.mjs:254` changes on purpose.
- One `npm run test:browser` run.
- `npm run build:hant -- --check` and `npx openspec validate --all` pass.
- The PR description tells Jinyu how to add an `EMPTY_TAB` entry for a new phase.
