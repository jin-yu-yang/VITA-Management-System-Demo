## Context

- **Where it comes from.** `docs/design/redesign-review.md` §2 lists the screen states with no design yet, and the roadmap spec (`docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md` §4) names "Banners and toast" among the shared elements. This change is A of four. B (empty states), C (confirmation dialogs) and D (permission states) follow; sign-in errors get their own small change.
- **The toast today.**
  - One `#toast` inside the page markup (`views.mjs:131`), filled by `notify(text, by)` (`app.mjs:494`).
  - Text only, 3.5 s, no dismiss, no kind.
  - A full redraw (`root.innerHTML = views.page(...)`, `app.mjs:252`) replaces it, so a redraw mid-toast can wipe it.
- **Errors today.** `noteFailure` records `state.error` and the frame shows it: in place on the staff case page, inside an office drawer or the corrections dialog, in the save chip, or otherwise in the problem banner. Several paths bypass it:
  - **Guard refusals:** 12 `throw controllerError(...)` sites plus `requirePresenter` (3 callers) throw without recording. The edit conflict at `controller.mjs:1981` already records first.
  - **The three catches** (`app.mjs:1578` in the click handler; `1653` and `1696` in the submit handler) toast whatever reached them. They are the only voice of the refusals, and a second voice for everything the controller recorded.
  - **Nudges** (`toast.confirm_first`, `toast.needs_change`, the assistance "Say what you helped with…", Add a case's "Confirm that you have checked these answers with the client first.") are plain `notify` calls.
  - **Draft-build failures** (`app.mjs:1128`): `app.mjs` builds the draft outside the controller and reports only by toast.
  - **Sign-in failures** set `state.authError` (shown in the sign-in form) and rethrow (`controller.mjs:963–971`, `1000–1006`); the catches then toast them too.
- **Errors behind dialogs.** The problem banner steps aside for the two drawers only (`views.mjs:105`). Every other dialog is `aria-modal`, so a banner drawn behind it is outside the Tab trap and may not be read: the presenter's reset and checkpoint dialogs, for instance, have no error of their own.
- **Lists today.** The controller starts with `cases: []` and `assistance: []`. The first draw waits for the first load (`controller.mjs:879`), so the normal path doesn't flash. A failed first load, though, draws the empty state ("Nothing to claim right now.", "No applications yet") under the problem banner. The banner offers no Try again: `retryLast` only replays a `pendingAction`, and a load isn't one. `load()` reads the people, the help requests and the workspace only for a presenter (`controller.mjs:879–884`); `refresh()` doesn't read the people or the workspace.
- **Busy today.** `state.busy` is set by `dispatch` (every case action and every client save, a sub-step move's save included), the assistance actions, `resetFixtures` and `loadCheckpoint`; `officeSaving` holds Add a case's Save and Send. Buttons are disabled with no sign of which press runs.
- **Constraints.**
  - Staff screens stay English; client text lives in `src/client-text.mjs` (English and 简体), with 繁體 generated.
  - Existing `data-action` values, ids, roles and accessible names stay.
  - The story compares `#toast`'s text exactly (`tests/browser.mjs:3826`, `4205`), waits for it to close before screenshots (20 s limit), reads draft failures from it (`4300`, `4318`), and its alert watcher (`tests/support/story-pages.mjs:530–550`) observes `#app` only.
  - `tests/shell.test.mjs` pins many `notify` call sites by regex, and `tests/client-language.test.mjs:384` scrapes `controllerError("CODE", "sentence")` literals to check every refusal has a 简体 sentence.
- **Designs.** The toast follows the Stitch sheet `shared-states-toast` (local, `.stitch/designs/`), minus its error variant and with a 4px left edge rather than its full outline. Everything else follows `docs/design/DESIGN.md`, with the two departures recorded in D7.

## Goals / Non-Goals

**Goals:**
- One rule for errors: recorded, shown once where the person is looking (in place, in the open dialog, in the save chip, or in the problem banner), and never as a toast.
- A toast with three kinds, a Dismiss, readable timing, and a position that never covers the controls under it.
- Lists that say "loading" and "couldn't load" rather than "empty" when they aren't.
- A visible busy state on the pressed button.
- The connection notice, the banners, the in-place errors, the save chip and loading in DESIGN.md's look.

**Non-Goals:**
- Sign-in failures and the resend cooldown (their in-form alert is unchanged; only the duplicate toast goes).
- The empty-state pattern (B), confirmation dialogs and focus requirements (C), permission states (D).
- Skeleton rows, a toast stack, dark mode, mobile layouts.
- Any database, server, catalogue or sign-in logic change.

## Decisions

### D1: Errors never toast (brainstorm Q3, Q7, Q8.1–Q8.4, I9–I11)
- **Choice:**
  - **Guard refusals:** a controller helper `refuse(code, message)` records the error with `noteFailure`, draws, then returns the `controllerError` to throw. It replaces each of the 12 unrecorded `throw controllerError(...)` sites and `requirePresenter`'s throw.
  - **The three catches** in `app.mjs` stop toasting. They become a safety net. At the press, `app.mjs` keeps the error the state showed; in the catch, it records a general error through `noteLocalFailure` only when:
    - the state's error is still that same one (nothing new was recorded);
    - there is a principal, and no `authError` (the sign-in form states its own failures);
    - the same person is still signed in.

    The message is the error's own when `sentence()` knows it, otherwise "Something went wrong."
  - **App-side refusals:** Add a case's "There is no assisted intake form on screen." is recorded with `noteLocalFailure` and no retry.
  - **Draft-build failures:** `app.mjs` calls `controller.noteLocalFailure(error, retry)`, where `retry` rebuilds the same draft (form, kind and language). The banner's text is a new sentence, "The draft could not be made. Try again." (`draft.failed` speaks of closing the tab, which fits only the blank tab, and still does). For a font failure it is "The draft font could not be checked. Try again later." A draft that is then built clears a draft error still showing.
- **Why:** one announcement (`role="alert"`) per failure, and nothing a person must act on disappears on a timer.
- **Alternatives considered:**
  - Keeping the catch's toast for refusals only. Rejected: it keeps two kinds of error voice.
  - An error toast that stays until dismissed (Q3 option b). Rejected by the user.

### D2: One error at a time, shown where the person is looking (I12, I13)
- **Choice:**
  - **One error at a time.** A newer error replaces an older one. If the older one was a failed save (the save chip's "Not saved"), the chip falls back to "Unsaved" and the pending save is dropped (`forgetPendingSave`): the draft is still in the window and is sent with the next move or save.
  - **Where it shows**, in this order:
    1. inside the open dialog, when one is open. The two drawers and the corrections dialog already state their own; every other dialog gets the same block (`dialogError`) at the top of its body;
    2. in place on the staff case page;
    3. in the save chip, for a save that failed;
    4. otherwise in the problem banner.

    The problem banner, and the case page's in-place error, step aside whenever a dialog is open.
- **Why:** an error behind an `aria-modal` dialog can't be reached or read; two Try again buttons running different things would be a trap.
- **Alternatives considered:** keeping a failed save's error beside a newer local one (two errors, two retries). Rejected: rare, and confusing when it happens.

### D3: One local retry for things outside `pendingAction` (I2, I14)
- **Choice:**
  - `noteLocalFailure(error, retry)` stores `retry` as the window's pending local retry and sets `retryable` when one is given.
  - **Its lifetime:** `noteFailure` always drops the local retry; `noteLocalFailure` and `noteUnloaded` (D6) set it after recording. So any newer error, a dismiss, a sign-out or a new action (each clears or replaces the error) also ends it. `retryLast` runs it only while an error is showing.
  - **`retryLast()`** runs the local retry when one is pending, otherwise replays `pendingAction` as today. It returns `{ local: true }` for a local retry, so "Sent again." follows only a replayed action. It calls the local retry before its first `await`, so a draft rebuilt by Try again opens its tab inside the press, as `viewDraft` does today; a blocked tab falls back to the existing draft link.
- **Why:** the banner's Try again stays the single retry control, and the controller stays the one owner of what a retry does.

### D4: The toast (brainstorm Q5, Q8.5–Q8.7, I15, I16)
- **Choice:**
  - **The API.** `notify(kind, text, by)`, with `kind` one of `success`, `info`, `warning`. Every call site names its kind by the rule below (the plan lists them all).
  - **The timing lives in `src/toast.mjs`,** a small module with no DOM: `createToastTimer({ setTimer, clearTimer, onHide })` with `show(kind)`, `hover(on)`, `focus(on)` and `hide()`, and the constants `TOAST_MS` and `TOAST_ICONS`. It is unit-tested with fake timers. `app.mjs` only wires the DOM to it.
  - **Timing:** 5 s for success and information, 8 s for warnings. The pointer over the toast, or focus inside it, stops the timer; when both have left, it starts again from the full duration. Dismiss, or Escape while focus is inside the toast, hides it at once. A new toast replaces the current one and its timer.
  - **Its own host.** `app.mjs` creates the toast once beside `#app`, so a redraw neither wipes it nor re-announces it. Inside `#toast`:
    - an icon slot (`aria-hidden`);
    - a persistent text span with `role="status"` and `aria-live="polite"`;
    - a Dismiss button, outside the live region, 44 × 44 px, with only an icon and an `aria-label` from `frame.dismiss`.

    So `#toast`'s text is the message alone. The host carries `data-kind`.
  - **Hidden means gone.** A hidden toast is `visibility: hidden` (after its fade), so its Dismiss leaves the Tab order, and its text is cleared. If focus was inside the toast when it hides, focus returns to the element it came from, or to `#main` if that is gone.
  - **Position:** bottom-centre on client screens, bottom-right on staff screens, 24px in. On Add a case, while `.add-case-bar` is sticky and on screen, the bottom offset is the bar's height plus 24px. It is re-measured on scroll and resize while the toast shows.
  - **Kinds:**
    - success: something happened (saved, sent, started, copied, rebuilt, moved);
    - information: nothing failed but worth knowing (fictional details filled, the reconcile choices, select the ID, "The draft is saved. Nobody was emailed.", "You're back online.");
    - warning: the nudges, and the three `hant_failed` messages.
- **Why:** WCAG 2.2.1 (time-limited content can be paused); a live region that exists before its text changes is announced reliably; the story's exact text checks keep working; the Stitch sheet's look.
- **Alternatives considered:**
  - Re-applying the toast after each redraw. Rejected: the live region would announce it again on every redraw.
  - `role="status"` on the whole host. Rejected: a live region shouldn't hold a focusable control.
  - A stack of toasts. Rejected: the messages are short, and the newest is the relevant one.

### D5: Busy buttons (brainstorm Q6.3, Q8.11–Q8.14, I17)
- **Choice:**
  - At every press, `app.mjs` resets `pressed`, then keeps the pressed control's description (`describeFocus`) when it is one of these:
    - a `data-case-action` or `data-assistance-action` control;
    - `confirm-reset-fixtures`;
    - the checkpoint form's submit, which gains `id="checkpoint-submit"`;
    - `save-office-draft` and `send-office-draft`.

    No other press is marked: a sub-step move's Continue, the rail, the language switch and the other navigation never are.
  - After each draw, while `state.busy` or `state.officeSaving` is true and the save chip isn't saving, the control that description finds gets the class `is-busy`, `aria-busy="true"` and a spinner before its label. The description is dropped when both are false. A control already marked isn't marked twice.
  - `describeFocus` and `focusSelectors` in `ui.mjs` already describe and find a control by its action and row (`data-case-id`, `data-item-id`, …), so no new helper is needed.
- **Why:** the views stay pure, the press knows which button it was, and the allow-list keeps a client's sub-step move free of a spinner (the save chip says Saving).
- **Alternatives considered:** a `pressed` field in the controller read by every button helper. Rejected: it touches every view's buttons for one class.

### D6: Lists that are loading or couldn't load (brainstorm Q6.1, Q6.2, Q8.8–Q8.10, I8, I14)
- **Choice:**
  - The controller keeps `lists: { cases: "loading" | "ready" | "failed", assistance: ... }`.
  - **One data read.** `load()`'s data section moves into `loadData()`: the case list, and for a presenter the people, the help requests and the workspace. For anyone else, `assistance` is `ready` at once (there is nothing to read).
  - A list becomes `ready` after its first successful read. When a read fails, `noteUnloaded()` marks every list that isn't `ready` as `failed`, and sets the local retry to `loadData` followed by a draw. Sign-out returns both to `loading`. A later reload that fails (`refresh`) leaves a `ready` list as it is, with the banner above.
  - **Readers:**
    - the work board, case pool, Follow-ups and the client's applications read `cases`;
    - Follow-ups also reads `assistance`;
    - each shows the loading line while `loading`, a "couldn't load" line while `failed`, and its own content or empty state when `ready`.
  - **While not ready,** the work board, the case pool and Follow-ups show their heading and the line only, without tabs, filters or counts (which would all read 0). The client's applications page keeps its intro and lookup and replaces only the list.
  - **The loading pattern** is one `loadingLine(text)` in `ui.mjs`: a spinner and a sentence, `role="status"`. Add a case's `Loading…` uses it.
  - **Text:**
    - staff: "Loading cases…", "The cases couldn't load.";
    - client: "Loading your applications…" / 正在载入您的申请…, and "Your applications couldn't load." / 无法载入您的申请。
- **Why:** the empty state must mean empty, and Try again must reload everything the first load would have.
- **Alternatives considered:** skeleton rows. Rejected: loads are short, so they'd flicker. `refresh` as the retry. Rejected: it doesn't read the people or the workspace, so a presenter's Add a case would wait forever.

### D7: The connection notice, "back online", and looks from DESIGN.md (brainstorm Q6.4, Q6.5, Q8.15, Q8.16, I18, I19)
- **Choice:**
  - **The notice** uses the attention background `#faf0dd`, with text `#8a5a12` (today's `--vt-stage-amend`). "Reconnecting…" shows a spinning spinner; offline shows the still clock.
  - **"You're back online."** `app.mjs` remembers the connection it last drew. When it was `offline` or `reconnecting` and is now `online`, it shows an information toast, "You're back online." / 已重新连接。 From `unknown` it shows nothing.
  - **Notice banner:** `#efedfb` / `#4b3fa3`.
  - **Error colours** (`#fbeceb` / `#8a3b34`): the problem banner, the in-place errors (the case page's `problemNotice`, `drawerError`, the corrections dialog's, and the new `dialogError`), and the save chip's "Not saved". The `.notice.error` rule sets its heading and paragraph colours (`.notice p` sets its own today), and the office drawer's `.notice.amber` override is carried over to `.notice.error`.
  - **What stays:** every role, Try again and Dismiss, and the banners' size (13px, 11px padding) and their media-query and 44px rules.
  - **One spinner:** a new `spinner` icon in `ui.mjs` serves busy, loading and reconnecting. Its animation is off under `prefers-reduced-motion` (the existing reduced-motion rule stops transitions only). Each restyled rule replaces the old one in `styles.css`.
  - **Two departures from DESIGN.md, recorded:**
    - the attention text is `#8a5a12`, not DESIGN.md's `#a07c32`, which is 3.42:1 on `#faf0dd` at 13px (below AA);
    - the in-place errors use the banner's error pair rather than DESIGN.md's "soft terracotta" (`#faeee9` / `#a44d39`), so every error looks the same (Q6.5).

### D8: Specs (brainstorm Q8.17)
- **Choice:** a new capability, `screen-states`, with ADDED requirements:
  - "Errors are shown where the person is looking, never as a toast";
  - "A toast confirms, informs or warns, and can be dismissed";
  - "A list says when it is loading or couldn't load";
  - "The pressed button shows it is working";
  - "The connection notice says when the app is offline or reconnecting".
- `client-intake` and `staff-case-work` are unchanged.

## Risks / Trade-offs

- **[Risk] The story's clicks land under a visible toast.** The toast now takes the pointer (it has a Dismiss), and hovering pauses it, so a click aimed under it would retry until its timeout. Mitigation: the story's click helpers dismiss a visible toast first and move the pointer to the top centre of the page (never `(0, 0)`, which is the staff sidebar toggle and starts its peek). `shootQuiet` does the same before waiting.
- **[Risk] The story's alert watcher misses the toast.** `watchAlerts` and `waitForQuiet` observe `#app` only. Mitigation: they observe `#toast` too.
- **[Risk] A retry's popup.** Try again rebuilds a draft and opens a tab. Mitigation: the story registers `waitForEvent("popup")` before pressing Try again, and accepts the draft link if the browser blocks the tab.
- **[Risk] Shell and language tests pin call sites and refusal literals by regex.** Mitigation: the plan lists every pin to update (`tests/shell.test.mjs` 361, 615, 857, 861, 889, 964, 974–975, 1001–1010, 1029–1033; `tests/client-language.test.mjs:384`) in the task that changes its subject.
- **[Risk] A refusal now records an error, so a banner appears where only a short toast did.** Mitigation: these refusals are rare (stale screens); the banner is dismissible and not retryable.
- **[Risk] Sign-in screens lose their duplicate toast.** The in-form alert stays. Mitigation: the plan runs `npm run test:auth-browser`.
- **[Trade-off] A failed save replaced by a newer error falls back to "Unsaved".** Accepted: the draft is kept and is sent with the next move or save (D2).
- **[Trade-off] A failed save's chip behind a client dialog.** With a dialog open, the dialog shows the error and the save chip behind it still says "Not saved". Accepted: the chip is the save's own status, and the dialog is where the person is looking.
- **[Trade-off] One toast at a time.** A quick second message replaces the first. Accepted, as today.
- **[Trade-off] No skeleton rows.** Accepted: one spinner line, consistent everywhere.
- **[Trade-off] The error banner sits at the top of the page,** away from a button pressed at the bottom, where the toast used to be seen. Accepted: the case page and the dialogs state errors in place, and the banner is `role="alert"`.

## Migration Plan

N/A. This change involves no deployment changes: no migration, no server, no new dependency. The front end ships as usual. A rollback is a revert.

## Open Questions

- **The wording of the new text:** the loading and "couldn't load" lines, "You're back online.", the draft banner sentence, and the toast's Dismiss label. Owner: the group's wording review. Text only.
