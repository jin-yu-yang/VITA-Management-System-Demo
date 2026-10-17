## Why

Issue #73's "Empty states: one helper, every list". Every list already has an empty state, but each is built differently: four panel styles and several one-line styles. The case pool says "No case matches these filters." even when there are no cases and no filter. Jinyu's lifecycle change will add board phases next, and each needs an empty sentence; one helper makes that a one-line entry.

## What Changes

**One helper for panel lists**

- From: the work board, Follow-ups queue, case pool and client applications each hand-build their `div.empty-state`.
- To: all four use `emptyState({ icon, title, text, actions, className })` in `src/ui.mjs`. The markup stays identical except for the pool (below). Each list keeps its own wording and its own undo buttons.
- Impact: non-breaking.

**One helper for case-page sections**

- From: nine empty lines on the staff, admin, drawer and client-progress pages are hand-written `<p>`s.
- To: each uses `emptyLine(text)`. Only that line changes; the markup around it, the history lines and "Your next step" are untouched. The text is identical. The one change: the Log a call drawer's line becomes muted like the others.
- Impact: non-breaking.

**Case pool wording**

- From: "No case matches these filters." always, with no icon.
- To: "No cases yet this season." when no filter is set; "No case matches these filters." when one is. Both get the board's folder icon. Clear filters stays in the summary line above.
- Reason: the old sentence is wrong for an empty season.
- Impact: staff screen only (English).

**Out of scope:**

- the Application ID lookup's no-match, which stays an amber notice;
- the client review's "We found no alerts or warnings", which is a result, not a list;
- lists that have no screen yet: notifications, dashboard, day view, labels, returning-client search;
- any change to tab logic, history lines or "Your next step".

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `screen-states`: adds requirements for what an empty list says and shows. It completes #75's "when loaded and empty: its empty state", with the case pool's two wordings as scenarios.

## Impact

- **Code:**
  - `src/ui.mjs`: `emptyState`, `emptyLine`.
  - `src/staff-views.mjs`: the board, documents, review attempts, follow-up and history lines.
  - `src/admin-views.mjs`: requests waiting, calls, follow-up.
  - `src/office-views.mjs`: the queue and the drawer line.
  - `src/pool-views.mjs`: the pool.
  - `src/client-views.mjs`: applications and history.
  - `src/styles.css`: no change expected.
- **Tests:**
  - a golden test of every list's empty markup, captured before the move;
  - new unit tests for the helpers, the pool and the drawer line;
  - `tests/pool-views.test.mjs:254` updated for the fixed wording.
- **Unchanged:** the database, client text (`client-text.mjs`, `zh-hant.mjs`), tab logic and `EMPTY_TAB`'s shape.
- **Overlap:**
  - PR #78 (`src/ui.mjs`, `tests/ui.test.mjs` imports): small conflicts, resolved by merging `main`.
  - Jinyu's lifecycle: avoided by touching only the empty lines.
