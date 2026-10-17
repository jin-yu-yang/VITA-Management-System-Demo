# Brainstorm: unify-confirmation-dialogs

Captured from the design conversation of 2026-10-16. The user approved every decision below in conversation ("Go with A", then "Approved"). Path: architectural, because the change alters a shared interface that Jinyu's lifecycle-stages change will build on.

## Background

- Issue #73 splits "shared screen states" (`docs/design/redesign-review.md` §2) into three PRs:
  - Jinyu finished the first, "Feedback toast, banners, loading, failed saves" (#75, capability `screen-states`).
  - Hailey claimed "Empty states" and "Confirmation dialogs". They will be two separate changes and PRs; this is the dialogs one.
- Jinyu's next change, lifecycle stages, rewrites the close-case logic. He is waiting for this PR so he can build on its dialog.
- **What §2 asks for:**
  - Confirmations for close case, deactivate person, unpublish update, send back for corrections (designed) and presenter reset (exists, not redesigned).
  - Under keyboard and focus: "The drawers and dialogs close on Esc, but focus trapping and returning focus afterwards are not specified."
  - It gives no wording or button rules. DESIGN.md "Modal" gives only the look: 17px radius, 36px padding, 520px max width, deep soft shadow, overline "ViTally · HERE TO HELP".

### What the code already does (read during explore)

- **One shared frame.** `dialog(state)` in `src/views.mjs` gives every dialog its overline, title, close X, `role="dialog"`, `aria-modal="true"` and `aria-labelledby="modal-title"`, and puts #75's `dialogError` inside it.
- **Existing confirmations:**
  - close case (`closeCaseDialogBody`, `src/admin-views.mjs`): reason, an "I understand…" checkbox, `CLOSE_CASE` submit, "Keep it open";
  - request corrections (`correctionsDialogBody`, `src/staff-views.mjs`): findings, `REQUEST_CORRECTIONS` submit, "Keep reviewing", its own refusal alert;
  - presenter reset and load checkpoint (`src/presenter-views.mjs`);
  - the client's regenerate dialog, "Replace the fictional answers?" (the only one in Chinese);
  - office "Leave without saving?" on Add a case.
- **Deactivate person** and **unpublish update** have no screens, so there is nothing to wrap.
- **Keyboard (`src/app.mjs`):**
  - Esc closes the dialog.
  - The Tab trap wraps first ↔ last control.
  - `openDialog` / `closeDialog` record the opener with `describeFocus` and return focus to it, matched on its row, with a fallback for drawers.
  - `dialogFocusTarget` (`src/ui.mjs`) puts first focus on the first control that isn't the close button.
  - The browser phase "a dialog takes the keyboard and gives it back" checks Esc and focus return.
  - So §2's "not specified" is true of the specs, not of the code.
- **Gaps:**
  - No canonical spec states any of this.
  - The page behind an open dialog is not `inert`.
  - The Tab trap only steps in when focus is on the first or last control. With focus on the dialog container (`tabindex="-1"`, for example after clicking its text), Shift+Tab leaves the dialog.
  - Each body builds its buttons by hand, in the same shape but without a shared helper.
- **Live regions:**
  - The connection notice and the notice banner are `role="status"`, and the problem banner is `role="alert"`. All three are children of `#app`.
  - #75's toast host `#toast` (`role="status"`, `aria-live="polite"` on its text) is made once, outside `#app`, by `root.after(toastHost)`.
  - The dialog (`.modal-backdrop`) is also a child of `#app`.
- **Print rules:** two of them in `src/styles.css` target `#app > *`.

## Decision chain

**Q1. Scope: consolidate and specify only (A), or also add confirmations to one-click irreversible actions (B)?**
→ **A.**
- B covers Approve review, Record preparation complete, Verify document and remove household member.
- B would add clicks to browser-story phases, needs new Chinese text for remove-member, and slows Jinyu's start.
- B is recorded as a follow-up in the retrospective, not done now.

**Q2. Where does `inert` go, when the dialog itself lives inside `#app`?**
→ After each render, while a dialog is open, every child of `#app` gets `inert` except `.modal-backdrop`, `.connection-notice`, `.notice-banner` and `.problem-banner`. When no dialog is open, nothing is inert.
- Rejected: wrapping the page in a `<div>`. It would break the print rules that target `#app > *`, and it would change the DOM shape every screen relies on.
- Rejected: moving the dialog out of `#app`. That is a larger change to rendering and to the focus code.

**Q3. The live regions from #75.**
→ They stay outside every inert subtree, so screen readers still announce a toast or banner while a dialog is open or right after it closes. User's note 1.
- `#toast` is outside `#app` and is never touched.
- The three banners are excluded by name.
- The browser story checks this if it can.

**Q4. Trap gap.**
→ When focus is on the dialog container, or anywhere in the dialog that isn't one of its controls, Tab goes to the first control and Shift+Tab to the last. Esc, initial focus and focus return stay as they are.

**Q5. Shared helper.**
→ `confirmBody(...)` in `src/ui.mjs`:
- an optional refusal block before everything (the corrections dialog's own alert);
- a lead paragraph;
- an optional info note with its icon;
- an optional form (attributes, fields, the note inside it where the checkpoint dialog has it) whose submit is the confirm control;
- the confirm control itself;
- the text "Keep …" button with `data-action="close-dialog"`.

All six bodies (close case, corrections, reset, checkpoint and its empty state, regenerate, leave Add a case) move onto it.

**Q6. Behaviour and payload.**
→ Every action, payload field, `data-action` / `data-case-action` value, id and visible word stays exactly as today (user's note 2; scope rule: the dialog only wraps the existing actions).
- The goal is **identical markup**. The existing view tests stay unchanged and guard it.
- Jinyu changes the close-case logic in his own change, on top of this one.
- The PR description says plainly that the close-case dialog now uses `confirmBody`.

**Q7. Spec home.**
→ ADDED requirements in the existing `screen-states` capability, which already owns "an error is said inside the open dialog". No new capability.

**Q8. Chinese.**
→ With identical markup no client text changes. The regenerate dialog keeps its keys. `npm run build:hant -- --check` is still run.

**Q9. Browser checks.**
→ Extend the existing phase "a dialog takes the keyboard and gives it back". With a dialog open:
- the page behind is inert;
- `#toast` and the banners are not;
- Shift+Tab from the focused container stays in the dialog.

After the presenter reset is confirmed, its toast reaches the live region and is not inside an inert subtree. The suite is run once; failures at steps this change doesn't touch are recorded and not retried.

## Dependencies

- Ready:
  - #75's toast and banners (`screen-states`);
  - the existing dialog frame and focus code.
- Downstream: Jinyu's lifecycle-stages change builds on the close-case dialog.

## Acceptance

- `npm test` passes, with the existing dialog view tests unchanged. New unit tests cover `confirmBody`, the inert rule and the trap targets.
- One `npm run test:browser` run, with the extended phase.
- `npm run build:hant -- --check` and `npx openspec validate --all` pass.
- The PR description names `confirmBody` for close case.
- The retrospective records follow-up B.
