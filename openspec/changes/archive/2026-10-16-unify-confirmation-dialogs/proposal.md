## Why

Issue #73's "Confirmation dialogs" item. Section 2 of `docs/design/redesign-review.md` says focus trapping and returning focus are not specified. The app already does most of it, but no spec says so. The page behind an open dialog is still reachable, and Shift+Tab can escape from the dialog container. Each dialog also builds its buttons by hand. Jinyu's lifecycle change rewrites close case next and should build on one shared dialog body.

## What Changes

**One shared confirmation body**

- From: close case, request corrections, presenter reset, load checkpoint, the client's regenerate dialog and the office's "Leave without saving?" each build their lead, note, form, confirm button and "Keep …" button by hand.
- To: all six use `confirmBody(...)` in `src/ui.mjs`. The markup stays identical: same words, same `data-action` / `data-case-action` values, same ids and payload fields.
- Reason: one place for the shape of a confirmation, so the next changes (lifecycle stages, later confirmations) reuse it.
- Impact: non-breaking. No action or payload changes, including `CLOSE_CASE`.

**The page behind an open dialog is inert**

- From: while a dialog is open, the page behind it can still be reached by a screen reader's browse mode, and by the keyboard if focus escapes the trap.
- To: while a dialog is open, every child of `#app` except the dialog and the three live-region banners carries `inert`. The toast (outside `#app`) and the connection notice, notice banner and problem banner are never inert, so their announcements still reach screen readers.
- Impact: non-breaking. Nothing behind the dialog was meant to be usable while it is open.

**The Tab trap covers the dialog container**

- From: the trap acts only when focus is on the dialog's first or last control. From the focused container, Shift+Tab leaves the dialog.
- To: from the container, or from anywhere in the dialog that isn't one of its controls, Tab moves to the first control and Shift+Tab to the last.

**Specified, not new:** Esc closes the dialog, first focus goes to the first control that isn't the close button, and closing returns focus to the control that opened the dialog. These behaviours exist today and become requirements.

**Out of scope:**

- New confirmations for one-click actions (Approve review, Record preparation complete, Verify document, remove household member). This is follow-up B, recorded in the retrospective.
- Deactivate person and unpublish update, which have no screens.
- Any change to what an action does.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `screen-states`: adds requirements for dialogs: Esc, first focus, the Tab trap including the container, returning focus, the inert page behind, live regions that stay announced, and one shared confirmation body.

## Impact

- **Code:**
  - `src/ui.mjs`: `confirmBody`, plus a pure helper deciding which `#app` children are inert.
  - `src/views.mjs`: the regenerate and leave-add-case bodies.
  - `src/admin-views.mjs`: close case.
  - `src/staff-views.mjs`: corrections.
  - `src/presenter-views.mjs`: reset and checkpoint.
  - `src/app.mjs`: apply `inert` after render; the Tab-trap change.
- **Tests:**
  - New unit tests for `confirmBody`, the inert rule and the trap target.
  - The existing dialog view tests stay unchanged.
  - The browser phase "a dialog takes the keyboard and gives it back" gains the inert and live-region checks.
- **Unchanged:** the database, RPCs, RLS, realtime, the catalogue and client text (`build:hant` has nothing new).
- **Downstream:** Jinyu's lifecycle-stages change builds on the close-case dialog's `confirmBody`.
