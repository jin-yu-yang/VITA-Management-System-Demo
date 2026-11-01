## Why

The staff case page's lifecycle bar draws Closed as the hollow step after Accepted. The case-lifecycle spec says an Accepted case cannot be closed: Accepted is the end (issue #109). The bar's step list comes from a spec sentence older than #95/#97, so the bar now contradicts the stage rules it is meant to show.

## What Changes

**An Accepted case's bar**
- From: every step before Accepted is done, Accepted is current, and Closed follows as a todo step.
- To: every step up to and including Accepted is done. There is no current step, and Closed is not shown.
- Reason: Accepted is the end of the path.
- Impact: non-breaking, staff case page only.

**An open case's bar**
- From: the bar ends with a hollow Closed after Accepted.
- To: the bar ends at Accepted. Everything else is unchanged: Corrections in progress on Filing in progress, Rejected on E-filed, Waiting for documents and Hold where they came from.
- Reason: a hollow Closed after Accepted says Closed comes next.

**A closed case's bar**
- From: Closed is current and every step before it is todo.
- To: Closed is current, drawn after Accepted, and every step before it is neutral: neither done nor waiting. Where the case stopped is read in the History tab.
- Reason: nothing records the stage a case was closed from, so the bar cannot honestly show it.

Not changed: the client's progress stepper, the database, and every action.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `case-lifecycle`: the case-page bullet of "The lists and the case page show every stage" says which steps the lifecycle bar shows, and how it shows Accepted and Closed.

## Impact

- Code: `src/staff-views.mjs` (`LIFECYCLE` and `lifecycleBar`), `src/styles.css` (the neutral step).
- Tests: `tests/staff-views.test.mjs` (the lifecycle bar tests); the browser story is run because the case page changes.
- No database, client text or dependency change.
