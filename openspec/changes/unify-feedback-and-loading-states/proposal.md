## Why

ViTally's feedback has grown screen by screen. Failed actions are announced twice, once in the problem banner and again in a toast. Some refusals are heard only through that toast, and a draft that can't be built is reported only there. A failed first load looks like an empty list. Busy buttons don't show which press is running. None of these states has a redesigned look. Real clients use the intake from November 2026, so these are the states they will meet when a connection drops or a save fails. This change gives the app one feedback system, before the empty-state, dialog and permission changes build on it.

## What Changes

**Errors**
- From: a failure shows in the problem banner (or in place) and also as a 3.5 s toast; guard refusals and draft-build failures show only as a toast.
- To: errors never toast. Every failure, guard refusals and draft-build failures included, is recorded and shown once, where the person is looking: inside the open dialog, in place on the case page, in the save chip, or in the problem banner, with Try again (when it can be retried) and Dismiss. One error shows at a time. The sign-in form keeps its own alert.
- Reason: one announcement, and nothing a person must act on leaves on a timer.
- Impact: non-breaking; the toast no longer repeats errors.

**The toast**
- From: text only, 3.5 s, no dismiss, no kind.
- To: three kinds (success, information, warning) with an icon and a coloured edge, a 44px Dismiss (and Escape), 5 s (8 s for warnings), paused while hovered or focused, one at a time, in its own host outside the redrawn page. It sits bottom-centre on client screens and bottom-right on staff screens, clear of Add a case's sticky bar. The nudges a person can fix become warning toasts.

**Lists while loading**
- From: a list that hasn't loaded, or failed to load, shows its empty state.
- To: the case and assistance lists show a loading line until their first load, then their content, the empty state, or a line saying they couldn't load, with Try again above it.

**Busy buttons**
- From: every action is disabled while a press runs, with no sign of which one.
- To: the pressed button shows a spinner and `aria-busy="true"`, wherever `state.busy` or Add a case's `officeSaving` holds the buttons.

**Banners and the save chip**
- The connection notice turns amber ("Reconnecting…" spins its icon), and a returning connection says "You're back online." in an information toast.
- The notice banner, the problem banner, the in-place staff errors and the save chip's "Not saved" take DESIGN.md's colours. One loading pattern (a spinner and a sentence) replaces Add a case's plain `Loading…`. Spinners stop under `prefers-reduced-motion`.

Out of scope: sign-in failures and the resend cooldown; the empty-state pattern, confirmation dialogs and permission states (later changes); dark mode; mobile layouts.

## Capabilities

### New Capabilities
- `screen-states`: how every screen tells a person what is happening: the toast and its kinds, where errors are shown, lists that are loading or couldn't load, busy buttons, the connection notice, and the banners' looks.

### Modified Capabilities
- None. `client-intake` and `staff-case-work` keep their requirements; the save chip's and the case page's feedback are covered by `screen-states`.

## Impact

- **Code:** a new `src/toast.mjs` (the toast's timer); `src/presenter-views.mjs` (the checkpoint submit's id); `src/app.mjs` (`notify` and the toast host, the three catches, the draft build, the pressed button), `src/controller.mjs` (the refusals, a local retry for the draft and the lists, load state, one error at a time), `src/views.mjs` (the toast, banners and loading pattern), `src/staff-views.mjs`, `src/office-views.mjs`, `src/pool-views.mjs`, `src/client-views.mjs` (busy buttons, list states, save chip), `src/ui.mjs` (spinner icon), `src/styles.css`, `src/client-text.mjs` and the generated `src/zh-hant.mjs`.
- **Tests:** unit tests for the toast's timer and parts, refusals, the local retry, list states, busy buttons, dialog errors and banners; pins in `tests/shell.test.mjs` and `tests/client-language.test.mjs`; the story (`tests/browser.mjs`, `tests/support/story-pages.mjs`); and the sign-in suite, since the sign-in screens lose their duplicate toast.
- **No** database, server, catalogue or sign-in change. No new dependency.
