## Context

- **Issue #73** splits section 2 of `docs/design/redesign-review.md` into three PRs.
  - Jinyu shipped the toast, banners and busy states as #75 (capability `screen-states`).
  - This change is the confirmation-dialogs item.
  - Jinyu's lifecycle-stages change rewrites close case next and waits for this PR.
- **One dialog frame already exists.** `dialog(state)` in `src/views.mjs` renders it: overline, title, close X, `role="dialog"`, `aria-modal="true"`, and #75's `dialogError` inside.
- **Six confirmations already use that frame.** Each one builds its body by hand, in the same shape:
  - close case: `closeCaseDialogBody`, `src/admin-views.mjs`;
  - request corrections: `correctionsDialogBody`, `src/staff-views.mjs`, which has its own refusal alert;
  - presenter reset and load checkpoint: `src/presenter-views.mjs`;
  - the client's regenerate dialog and the office's "Leave without saving?": inline in `dialog()`.
- **Keyboard handling lives in `src/app.mjs`:**
  - Esc closes.
  - The Tab trap wraps first ↔ last control.
  - `openDialog` / `closeDialog` remember the opener and focus it again on close.
  - After `render()`, `dialogFocusTarget` (`src/ui.mjs`) gives first focus.
  - The browser phase "a dialog takes the keyboard and gives it back" checks Esc and focus return.
- **Gaps:**
  - No spec covers any of this.
  - The page behind an open dialog is not inert.
  - The trap does nothing when focus is on the dialog container (`tabindex="-1"`). Clicking the dialog's text puts focus there, and Shift+Tab then escapes.
- **The page's structure:**
  - `#app` holds the skip link, header, connection notice (`role="status"`), notice banner (`role="status"`), problem banner (`role="alert"`), the page body, the footer and `.modal-backdrop`.
  - #75's `#toast` is created once, outside `#app`.
  - Two print rules in `src/styles.css` target `#app > *`.
- **Rendering:** `render()` replaces `#app`'s HTML synchronously, except on the version-2 form, where it waits for a press or an IME composition to end (`heldRender`).
- **Unit tests have no DOM.** App wiring is tested through pure helpers in `src/ui.mjs`, as `dialogFocusTarget` is, and through the browser story.

## Goals / Non-Goals

**Goals:**

- One shared confirmation body, `confirmBody`, used by all six existing confirmations, with identical markup.
- While a dialog is open, the page behind it is inert, and the live regions stay announced.
- The Tab trap also holds when focus is on the dialog container.
- Dialog keyboard behaviour (Esc, first focus, trap, return focus, inert) becomes requirements in `screen-states`.

**Non-Goals:**

- New confirmations for one-click actions (Approve review, Record preparation complete, Verify document, remove household member): follow-up B, recorded in the retrospective.
- Deactivate person and unpublish update, which have no screens.
- Any change to an action, its payload, its wording or its `data-*` attributes. Close-case logic belongs to Jinyu's lifecycle change.
- A visual redesign of the modal (DESIGN.md's modal look is unchanged).
- Drawers (Log a call, Resolve a help request). They get inert and the trap fix through the shared frame, but their bodies are not confirmations and don't move to `confirmBody`.

## Decisions

### D1: `confirmBody` in `src/ui.mjs`, rendering the existing shape

- **Choice:** `confirmBody({ before, lead, note, form, confirm, keep })` returns, in order:
  1. `before` (raw HTML, default empty): the corrections dialog's own refusal alert;
  2. `lead`: HTML for a `<p>`;
  3. the `note` as `<div class="info-note">${icon(note.icon)}<p>${note.html}</p></div>`, unless `note.inForm`;
  4. the form, if given: `<form ${form.attrs}>` + `form.fields` + the in-form note + `confirm` + `</form>`;
  5. otherwise `confirm` on its own;
  6. `button(keep, "close-dialog", "text")`.
- `confirm` is the caller's ready-made control: `button(...)`, `caseSubmit(...)`, or the checkpoint's literal submit. So the action name, kind, `disabled` and payload fields stay in the caller's hands, unchanged.
- The checkpoint dialog's empty state (no sample cases) uses it too: lead, note, an `open-reset-fixtures` confirm, keep "Close".
- **Reason:** every body already has this shape. A helper that takes ready-made controls can reproduce each one byte for byte, so the existing view tests guard the refactor unchanged. Jinyu can rewrite close case's lead, form fields and action without touching the frame.
- **Alternative considered:** a declarative `confirm: { label, action, kind }`. Rejected: it can't express `caseSubmit` with `disabled`, or the checkpoint's id'd submit, without growing options for each, and it would put payload-adjacent attributes in the helper.

### D2: Inert by rule: every `#app` child except the dialog and the live regions

- **Choice:** a pure helper in `src/ui.mjs`, `inertWhileDialog(element)`, is true unless the element's class list contains `modal-backdrop`, `connection-notice`, `notice-banner` or `problem-banner`.
  - After every `render()`, `app.mjs` sets `child.inert = Boolean(state.dialog) && inertWhileDialog(child)` for each child of `#app`.
  - `closeDialog` clears `inert` from every `#app` child itself, before it focuses the opener, so a held render can't leave the opener inert and unfocusable.
- **Reason:**
  - The dialog lives inside `#app`, so `#app` itself can't be inert.
  - Naming the exceptions keeps every live region announced: `#toast` is outside `#app` and never touched.
  - Recomputing after each render survives realtime redraws, which replace `#app`'s HTML.
- **Alternatives considered:**
  - A wrapper `<div>` around the page. Rejected: it breaks the two print rules on `#app > *` and changes the DOM every screen relies on.
  - Moving the dialog out of `#app`. Rejected: a larger change to rendering and to the focus code.
  - `aria-hidden` only. Rejected: it doesn't stop keyboard focus.

### D3: Trap target as a pure helper

- **Choice:** `trapTarget(controls, active, shift)` in `src/ui.mjs` returns the control to focus, or null to let the browser move.
  - If `active` is the last control and Tab is pressed (not Shift): the first control.
  - If `active` is the first control and Shift+Tab is pressed: the last control.
  - If `active` isn't one of the controls (the container, or any non-control inside the dialog): the first control for Tab, the last for Shift+Tab.
  - Otherwise: null.
- The keydown handler in `app.mjs` keeps its selector and calls `preventDefault()` only when a target is returned.
- **Reason:** it fixes the container escape, keeps today's behaviour for every other position, and is unit-testable without a DOM.
- **Alternative considered:** relying on `inert` alone. Rejected: Shift+Tab from the container would leave the page for the browser's chrome or `#toast`'s Dismiss button, which is outside `#app`.

### D4: Requirements go into `screen-states`

- **Choice:** ADDED requirements in the existing capability. No new capability.
- **Reason:** `screen-states` already owns "an error is said inside the open dialog", and section 2 lists confirmation and keyboard/focus among the screen states.
- **Alternative considered:** a new `dialogs` capability. Rejected: one more spec for one shared frame, split from the error rule it depends on.

### D5: Browser check extends the existing dialog phase

- **Choice:** in "a dialog takes the keyboard and gives it back", with a dialog open, assert:
  - every `#app` child except `.modal-backdrop` and the banners is `inert`, and `#toast` is not;
  - focusing the `.modal` container and pressing Shift+Tab leaves focus inside `.modal`.
  - After Esc: no `#app` child is inert, and focus is back on the opener (already checked).
- In the phase where the presenter confirms a reset, assert that the "sample cases were rebuilt" toast is in `#toast` and that `#toast.closest("[inert]")` is null.
- **Reason:** these are the observable effects of D2 and D3, and the phases already open those dialogs.

## Risks / Trade-offs

- [Risk] A future live region added inside `#app` would be made inert while a dialog is open. → Mitigation: the exception list sits next to `inertWhileDialog` with a comment, and the spec requirement names the rule ("live regions stay announced").
- [Risk] A held render (version-2 form) leaves the old inert state on screen. → Mitigation: `closeDialog` clears `inert` itself before focusing the opener (D2). Opening never happens during a press on the form's own controls.
- [Risk] Identical markup is easy to break by accident. → Mitigation: the existing view tests stay unchanged. New `confirmBody` tests compare each moved body's output to today's string, captured before the refactor.
- [Trade-off] The problem banner stays non-inert while a dialog is open, though `screen-states` already says it steps aside then. → Accepted: it renders nothing while a dialog is open, so there is nothing to reach.
- [Trade-off] Drawers get inert and the trap fix but keep their own bodies. → Accepted: they aren't confirmations.

## Migration Plan

N/A. No deployment, database or configuration change. Rollback is reverting the commits.

## Open Questions

- (none)
