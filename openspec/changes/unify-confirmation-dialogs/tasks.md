## 1. Golden markup, captured before any change

- [ ] 1.1 Add `tests/confirm-dialogs.test.mjs`. It renders each of the six confirmation bodies as they are today and asserts the result equals a string literal captured from the current code (design D1, Risks). Cover:
  - close case: idle, and busy (`disabled`);
  - corrections: idle, and with a refusal (`state.error`, retryable and not);
  - reset;
  - checkpoint: with samples, and empty;
  - regenerate: in English and in 简体;
  - leave Add a case.

  Regenerate and leave Add a case are read from `dialog(state)`'s `.modal` section. Run it: it passes on unchanged code.

## 2. Pure helpers in `src/ui.mjs`

- [ ] 2.1 Write failing tests in `tests/ui.test.mjs` for `confirmBody`:
  - the order before → lead → note → form (fields, in-form note, confirm) or confirm → keep;
  - an empty `before` and missing `note` add nothing;
  - `keep` renders `button(keep, "close-dialog", "text")`;
  - the confirm control is inserted as given.
- [ ] 2.2 Write failing tests for `inertWhileDialog(element)`:
  - false for elements whose class list holds `modal-backdrop`, `connection-notice`, `notice-banner` or `problem-banner`;
  - true for the skip link, header, `client-shell`, `app-shell` and footer.

  Use fake elements with `classList.contains`, as the `dialogFocusTarget` tests do.
- [ ] 2.3 Write failing tests for `trapTarget(controls, active, shift)`:
  - last + Tab → first; first + Shift → last;
  - the container or a non-control, with Tab → first, with Shift → last;
  - a middle control → null;
  - no controls → null.
- [ ] 2.4 Implement `confirmBody`, `inertWhileDialog` and `trapTarget` in `src/ui.mjs`, next to `dialogFocusTarget`, with comments in the file's style. Tests 2.1–2.3 pass.

## 3. Move the six bodies onto `confirmBody`

- [ ] 3.1 Close case (`src/admin-views.mjs`):
  - `confirmBody` with the lead naming the reference;
  - the shield note;
  - the form (reason textarea, the "I understand" checkbox);
  - `caseSubmit(... "CLOSE_CASE" ...)` with its busy `disabled`;
  - keep "Keep it open".

  Golden test and `tests/admin-views.test.mjs` unchanged and passing.
- [ ] 3.2 Corrections (`src/staff-views.mjs`):
  - `before` = the refusal alert;
  - the form with the findings textarea (its `aria-describedby` when refused) and `caseSubmit(... "REQUEST_CORRECTIONS" ...)`;
  - keep "Keep reviewing".

  Golden and `tests/staff-views.test.mjs` pass.
- [ ] 3.3 Reset and checkpoint (`src/presenter-views.mjs`):
  - reset: confirm `confirm-reset-fixtures`, keep "Keep them as they are";
  - checkpoint: `form.attrs` `id="checkpoint-form" class="staff-form"`, two selects, the note in the form, the literal `#checkpoint-submit`, keep "Leave this case as it is";
  - empty checkpoint: confirm `open-reset-fixtures`, keep "Close".

  Golden and `tests/presenter.test.mjs` pass.
- [ ] 3.4 Regenerate and leave Add a case (`src/views.mjs`, inside `dialog()`): same text keys and actions. Golden, `tests/client-views.test.mjs` and `tests/shell.test.mjs` pass.
- [ ] 3.5 Run `npm test`. Every existing test passes unchanged.

## 4. Inert page and the Tab trap (`src/app.mjs`)

- [ ] 4.1 After `root.innerHTML = views.page(...)` in `render()`, set `child.inert = Boolean(state.dialog) && inertWhileDialog(child)` for each child of `root` (design D2).
- [ ] 4.2 In `closeDialog`, after `controller.closeDialog()` and before focusing the opener, clear `inert` on every child of `root`.
- [ ] 4.3 In the dialog keydown handler, replace the first/last checks with `trapTarget(focusable, document.activeElement, event.shiftKey)`. Keep the existing selector. Call `preventDefault()` and `focus()` only when a target comes back (design D3).
- [ ] 4.4 Run `npm test`.

## 5. Browser check

- [ ] 5.1 Run `npm run db:migrate:test`, so the stack has `main`'s migrations.
- [ ] 5.2 Extend the phase "a dialog takes the keyboard and gives it back" in `tests/browser.mjs` (design D5). With a dialog open:
  - every `#app` child except `.modal-backdrop`, `.connection-notice`, `.notice-banner` and `.problem-banner` has `inert`;
  - `#toast.closest("[inert]")` is null;
  - after focusing `.modal` and pressing Shift+Tab, `document.activeElement.closest(".modal")` is truthy.

  After Escape, no `#app` child is inert.
- [ ] 5.3 In the phase that confirms the presenter reset, after the "The sample cases were rebuilt" toast appears, assert it is inside `#toast` and that `#toast.closest("[inert]")` is null.
- [ ] 5.4 Run `npm run test:browser` **once**. If it fails at a step this change doesn't touch, record the step and the error in verify.md and move on (user's rule for this change).

## 6. Checks and docs

- [ ] 6.1 Run `npm run build:hant -- --check` (expected: nothing to regenerate) and `npx openspec validate --all`.
- [ ] 6.2 In `docs/developer/frontend.md`, where dialogs are described, add one or two sentences:
  - confirmations are built with `confirmBody`;
  - the page behind an open dialog is inert, except the live regions.
