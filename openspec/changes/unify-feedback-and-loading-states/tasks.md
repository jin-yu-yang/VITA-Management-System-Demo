## 1. Errors are recorded, one at a time, with one local retry (design D1, D2, D3; plan Task 1)

- [x] 1.1 Tests first (`tests/controller.test.mjs`):
  - each guard refusal (the 12 unrecorded `throw controllerError(...)` sites and `requirePresenter`) records `state.error` with its message, `retryable` false, before the throw;
  - `noteLocalFailure(error, retry)` records the error, sets `retryable` when a retry is given, and `retryLast()` runs that retry synchronously and returns `{ local: true }`;
  - `noteFailure` (any newer error), a dismiss, a sign-out or a new action drops the pending local retry, and `retryLast()` runs it only while an error shows;
  - `retryLast()` still replays a `pendingAction` when no local retry is pending;
  - a refusal or local failure during a failed save turns the chip's state to `unsaved` and drops the pending save.

  `tests/client-language.test.mjs:384` reads `refuse(…)` as well as `controllerError(…)`. See them fail.
- [x] 1.2 Implement `refuse(code, message)`, `noteLocalFailure(error, retry)`, the local retry's lifetime and the one-error rule in `src/controller.mjs`. `npm test` passes.

## 2. The toast (design D4, D1; plan Task 2)

- [x] 2.1 Tests first:
  - `tests/toast.test.mjs` for `src/toast.mjs`'s `createToastTimer` with fake timers: 5 s / 8 s, pause on hover and on focus, restart from the full time when both have left, a new toast replacing the current one and its timer, `hide()`;
  - `toastParts({ kind, text, lang })` (icon, text, Dismiss label), and an unknown kind refused;
  - `tests/shell.test.mjs`:
    - every `notify` call names a kind;
    - no `notify` carries an error;
    - the three catches are the safety net, with its conditions;
    - the page no longer renders `#toast`, and `app.mjs` builds the host once beside `#app`;
    - the pins at 361, 857, 861, 889, 964, 974–975, 1001–1010 and 1029–1033 follow the new form.

  See them fail.
- [x] 2.2 Implement:
  - `src/toast.mjs`: the timer and the kinds' icons.
  - `src/ui.mjs`: the `info` and `warning` icons.
  - `src/views.mjs`: `toastParts`; `page` no longer renders `#toast`.
  - `src/app.mjs`:
    - the host, with an icon slot, a persistent `role="status"` text span and a 44px Dismiss outside it;
    - `notify(kind, text, by)` at every call site, including `1765`;
    - the timer wired to `mouseenter`/`mouseleave`/`focusin`/`focusout`, with Escape and Dismiss;
    - a hidden toast is `visibility: hidden` with its text cleared, and focus returns to where it came from;
    - placement after each draw and on scroll and resize, above Add a case's sticky bar;
    - Add a case's missing-form refusal recorded with `noteLocalFailure`;
    - the three catches become the safety net.
  - `src/styles.css`: the toast's styles replace the old `.toast` rules and their three media-query blocks.

  `npm test` passes.

## 3. A draft that couldn't be built goes to the banner (design D1; plan Task 3)

- [x] 3.1 Tests first:
  - the two banner sentences in `SENTENCES` (English and 简体);
  - a `tests/shell.test.mjs` pin that the draft build's failure calls `controller.noteLocalFailure` with a retry rebuilding the same form and kind and calls no `notify`, that a built draft clears a `DRAFT` error, and that "Sent again." follows only a replayed action.

  See them fail.
- [x] 3.2 Implement in `src/app.mjs` and `src/client-text.mjs`; the blank tab still writes `draft.failed`. Run `npm run build:hant`. `npm test` passes.

## 4. Lists that are loading or couldn't load (design D6; plan Task 4)

- [x] 4.1 Tests first:
  - the controller's `lists`:
    - `loading` at start and after sign-out;
    - `ready` after the first read, and an applicant's `assistance` `ready` at once;
    - `failed` when the first read fails, with a local retry that re-reads the cases, people, help requests and workspace;
    - a `ready` list unchanged by a later failed `refresh`;
  - `loadingLine(text)` and `unloadedLine(text)` in `src/ui.mjs`, with the `spinner` icon;
  - a CSS pin that `.icon.spin` stops under `prefers-reduced-motion`;
  - the work board, case pool, Follow-ups and the client's applications each render the loading line, the "couldn't load" line, or their content or empty state, by `lists`;
  - `tests/shell.test.mjs:615` expects `loadingLine("Loading…")`.

  See them fail.
- [x] 4.2 Implement in `src/controller.mjs` (`loadData`, `noteUnloaded`), `src/ui.mjs`, `src/views.mjs`, `src/staff-views.mjs`, `src/pool-views.mjs`, `src/office-views.mjs`, `src/client-views.mjs`, `src/client-text.mjs` (the client's two lines in English and 简体) and `src/styles.css`. Run `npm run build:hant`. `npm test` passes.

## 5. Busy buttons (design D5; plan Task 5)

- [x] 5.1 Tests first:
  - `describeFocus` and `focusSelectors` (already in `src/ui.mjs`) find a pressed Claim by `data-case-action` with `data-case-id`, an assistance press by `data-assistance-action` with `data-item-id`, and the checkpoint submit by `id="checkpoint-submit"`;
  - the checkpoint submit carries that id;
  - `tests/shell.test.mjs` pins:
    - a press resets `pressed`, then keeps the description only for the allow-list;
    - each draw marks the found control once, while `busy` or `officeSaving` is set and the save chip isn't saving.

  See them fail.
- [x] 5.2 Implement in `src/app.mjs` (`markPressed`), `src/presenter-views.mjs` (the id) and `src/styles.css` (`.is-busy`). `npm test` passes.

## 6. Errors inside dialogs, and the error looks (design D2, D7; plan Task 6)

- [x] 6.1 Tests first:
  - every dialog without its own error block (help, regenerate, leave Add a case, close case, reset, checkpoint, print) shows `dialogError` at the top of its body while an error is recorded;
  - the problem banner shows nothing while any dialog is open;
  - the in-place errors (`problemNotice`, `drawerError`, the corrections dialog's) are `notice error` blocks with their controls (`tests/office-views.test.mjs:386` and `tests/staff-views.test.mjs:1216` change on purpose).

  See them fail.
- [x] 6.2 Implement in `src/views.mjs`, `src/staff-views.mjs`, `src/office-views.mjs` and `src/styles.css`:
  - the tokens;
  - the banners in their pairs, at today's size;
  - `.notice.error` with its heading and paragraph colours, and the office drawer's override;
  - the save chip's "Not saved".

  `npm test` passes.

## 7. The connection notice and "back online" (design D7; plan Task 7)

- [x] 7.1 Tests first:
  - the connection notice's markup (the spinning spinner only while reconnecting, the still clock offline);
  - "You're back online." in `src/client-text.mjs` (English, 简体);
  - a `tests/shell.test.mjs` pin that the toast follows only an `offline`/`reconnecting` → `online` change between draws.

  See them fail.
- [x] 7.2 Implement in `src/views.mjs`, `src/app.mjs`, `src/client-text.mjs` and `src/styles.css` (text `#8a5a12` on `#faf0dd`). Run `npm run build:hant`. `npm test` passes.

## 8. The story, the docs and the checks (plan Task 8)

- [x] 8.1 `tests/browser.mjs` and `tests/support/story-pages.mjs`:
  - `watchAlerts` and `waitForQuiet` observe `#toast` too;
  - the click helpers and `shootQuiet` dismiss a visible toast and move the pointer to the top centre;
  - a toast's Dismiss hides it;
  - the unconfirmed Submit's nudge has `data-kind="warning"`;
  - the Add a case save's toast sits above the sticky bar;
  - the draft-failure checks read the problem banner, and Try again (its popup awaited from before the press) opens the draft;
  - no error toast appears after those failures.
- [x] 8.2 Docs: `docs/developer/frontend.md`, covering:
  - where errors show, and one at a time;
  - `refuse` and `noteLocalFailure`, with the local retry;
  - `src/toast.mjs`, the host, the kinds and timings;
  - `lists` and the two lines;
  - busy buttons;
  - "back online".

  Also the unit count where the docs give it.
- [x] 8.3 Checks:
  - `npm test`;
  - `npm run build:hant -- --check`;
  - `npm run build:intake` leaves nothing to commit;
  - `npx openspec validate --all`;
  - `npm run test:browser` and `npm run test:auth-browser`, run by the controller.
