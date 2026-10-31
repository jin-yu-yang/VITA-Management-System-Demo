## Why

Ruling R55 picks the whole staff shell from the acting person: `admin` gets the office workspace, everyone else the volunteer one. A presenter moves between them by switching persona, but a staff account is one person and cannot. At the 2026-10-30 rehearsal, Jordan Lee, who holds `admin` and `review`, saw only the office workspace and never *Claim review* (issue #104). PCDC has three or four admins who sometimes prepare or review a case, so the pilot needs a way for them to reach the volunteer workspace on day 1.

## What Changes

**The staff shell for a dual account**
- From: a staff account with `admin` always gets the office workspace, whatever else it holds.
- To: a staff account with `admin` and `prepare` or `review` gets an **Office / Cases** switch in the sidebar, above "Signed in as". Office (the default) is today's office workspace; Cases is the ordinary volunteer workspace. The window remembers the choice across a reload.
- Reason: such a person could not reach the work they are qualified for.
- Impact: non-breaking. Single-capability accounts, admin-only accounts and presenters see no switch, and their screens do not change.

**A hint on the office case page**
- In Office mode, a case the person could claim for preparation or review shows one line, "You can claim this case — switch to Cases" or "You can review this case — switch to Cases". Pressing it switches to Cases and stays on that case.

**Screening on open follows the workspace**
- From: opening a Request sent case starts screening when the acting person has `admin`.
- To: for a dual staff account, it starts screening only in Office mode. In Cases mode the page is the volunteer one and starts nothing.
- Reason: the volunteer page shows no office work, so moving the case from it would be a hidden effect.
- Impact: presenters and admin-only accounts are unchanged.

Not changed: which panels the office or volunteer case page shows, the database (schema, RPCs, policies, Realtime), and presenter screens. What a person can claim stays the database's decision.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `staff-case-work`: adds the Office / Cases switch for dual staff accounts, the remembered mode, and the claim hint on the office case page.
- `case-lifecycle`: "Screening starts when an admin first opens a case" starts screening only from the office workspace, so a dual account in Cases mode starts nothing.

## Impact

- Code: `src/views.mjs` (the shell choice and the sidebar), `src/admin-views.mjs` (the hint on the office case page), `src/controller.mjs` (the mode state, its save and restore, and screening on open), `src/window-state.mjs` (one stored field), `src/app.mjs` (the switch and hint actions, through the Add a case leave guard), `src/styles.css` (the switch).
- Tests: unit tests for the window state, the controller, the shell and the admin case page; one new phase in the browser story (`tests/browser.mjs`).
- No database, dependency or client-text change. Staff screens stay English.
