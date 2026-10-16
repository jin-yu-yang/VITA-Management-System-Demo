# Brainstorm: unify-feedback-and-loading-states

Decision log from the explore and brainstorm conversation of 2026-10-16. The user agreed every decision below before propose.

## Background

- **Where this comes from.** `docs/design/redesign-review.md` §2 lists the screen states with no design yet: empty, loading and connection, errors, confirmations, permissions, feedback (the toast), keyboard and focus. The roadmap spec (`docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md` §4) lists "Banners and toast" and "Empty states" among the shared elements, with no further detail.
- **The split the user proposed, refined in explore:**
  - **A (this change):** feedback: the toast, the banners, loading, failed saves, busy buttons.
  - **B:** the empty-state pattern (one helper for every list).
  - **C:** one confirmation-dialog pattern, plus the existing focus behaviour written down as requirements. Deactivate person and unpublish update get their confirmations when part 7 builds those features.
  - **D:** permission states, which wait for real staff accounts and the role split.
  - Sign-in failures and the resend cooldown get their own small change, because they need the sign-in suite.
- **What the code has today:**
  - **The toast:** one `#toast` (`views.mjs:131`, `role="status"`, `aria-live="polite"`), filled by `notify(text, by)` in `app.mjs:494`. Text only, 3.5 s, no dismiss, no kind. A new toast replaces the current one.
  - **The banners** (`views.mjs:76–110`):
    - the connection notice ("offline" / "reconnecting", `role="status"`);
    - the notice banner (for example "the sample cases were rebuilt", with Dismiss);
    - the problem banner (`role="alert"`, Try again and Dismiss). It is suppressed where the error is stated in place: on the staff case page, inside the office drawers, and while the client's save chip says "Not saved".
  - **In-place staff errors:** the case page and the office drawers (`drawerError`) state a failure beside the action, with the same two controls, in their own markup.
  - **The client's save chip** (`client-views.mjs:178`): Saving, Checking *n*, Saved, Not saved (`role="alert"`, with Try again), Unsaved, Up to date.
  - **Loading:** one plain `Loading…` line, on Add a case before the workspace row arrives (`views.mjs:320`).
  - **Busy:** `state.busy` disables buttons while a press runs (`dispatch`, the assistance actions, the presenter's reset and checkpoint). Nothing shows which press is running. Add a case's Save and Send are held by `officeSaving` instead.
  - **Focus:** the dialog Tab trap, Esc and focus return already exist (`app.mjs:783–805`, `1720–1740`; `ui.mjs:321`). That belongs to C.
- **Two findings from explore:**
  - **Failed actions are announced twice.** The controller records the error, so the problem banner appears. Then the press handler's catch (`app.mjs:1578`) and the Enter handler (`app.mjs:1653`) also toast the same message.
  - **A failed first load looks like an empty list.** The controller starts with `cases: []`. If the first `listCases` fails, the board says "Nothing to claim right now." under the problem banner, and the client's page says "No applications yet". The normal path doesn't flash, because the first draw waits for the lists.
- **Designs.** The toast and the empty states were designed in Stitch on 2026-10-16 (`.stitch/designs/shared-states-toast.html` and `shared-states-empty.html`, screens `da28cfb2…` and `499184cb…`, local only). Everything else in A follows DESIGN.md. In the toast sheet, Stitch drew a full coloured outline where the prompt asked for a 4px left edge, and its error toast is dropped (Q3); the build follows the prompt, not the outline.

## Decision chain

**Q1. Design source.** Stitch for the toast and the empty states, DESIGN.md for the rest (banners, loading, failed saves, busy, confirmations).

**Q2. Order.** A first. The empty-states sheet was made in the same Stitch pass, ready for B.

**Q3. Does an error ever appear as a toast? No.**
- Errors stay where they are today: in place on the staff case page, inside a drawer, or in the problem banner. Each keeps Try again (when retryable) and Dismiss, and stays until dealt with.
- Toasts are for success, information and warnings, and leave on their own.
- The duplicate error toasts (`app.mjs:1578`, `1653`) go.

**Q4. Scope of A: everything except sign-in.**
- In:
  - the toast;
  - the connection notice, the notice banner and the problem banner;
  - the in-place staff errors, in the problem banner's error look;
  - the client's save chip;
  - one loading pattern;
  - busy buttons.
- Out: sign-in failures and the resend cooldown (their own change); B, C and D; dark mode; mobile layouts.

**Q5. The toast's behaviour (six defaults, all agreed).**
1. Three kinds: success, information, warning. Every `notify` call names its kind.
2. A Dismiss button (×) on every toast.
3. Success and information leave after 5 s, warnings after 8 s. The timer pauses while the pointer is over the toast or focus is on its Dismiss, and restarts when it leaves (WCAG 2.2.1).
4. One at a time: a new toast replaces the current one. No stack.
5. Position: bottom-centre on client screens, bottom-right on staff screens, 24px from the edges. Corrected by the user (Q8): the client intake has no sticky bar, so the rule is that a staff toast clears Add a case's sticky bar (`styles.css:5132`) and never covers Save or Send.
6. It stays `role="status"` for all three kinds.

**Q6. Loading, busy, connection and banner looks (five defaults, all agreed).**
1. A failed first load is not an empty list. The controller remembers whether each list has loaded. Until it has, the list shows a loading line. If loading failed, the list says it couldn't load, with the problem banner's Try again above it. The empty state then only ever means really empty.
2. One loading pattern: a small spinner and a sentence. No skeleton rows (lists load in well under a second here, so skeletons would mostly flicker). Add a case's `Loading…` line uses it too.
3. Busy buttons: the pressed button shows a small spinner beside its label and carries `aria-busy="true"`. The other actions stay disabled as today. Nothing new is announced; the toast or banner afterwards tells the outcome.
4. The connection notice uses DESIGN.md's attention (amber) colours. "Reconnecting…" spins its icon; offline doesn't. When the connection returns, an information toast says "You're back online."
5. Banner looks from DESIGN.md: the notice banner in lavender (`#efedfb` / `#4b3fa3`); the problem banner, the in-place staff errors and the save chip's "Not saved" in the error colours (`#fbeceb` / `#8a3b34`). Every role and control is kept.

**Q7. The voices that only a toast carried (the user's correction).** The press handler's catch isn't only a duplicate: some refusals record nothing in the controller, so today the toast is their only voice. Dropping error toasts without a plan would make them silent. The user's routing:
1. **Guard refusals** (12 sites, rare: "Open an application first.", "This step is not available.", "This request is no longer on screen.", "This checkpoint is not available.", the presenter-only refusals). Today they are thrown without `noteFailure`. They now record the error before throwing, so they appear in the problem banner, or in place on the case page, like any other failure.
2. **Nudges the person can fix** ("Confirm that you have checked your answers first.", "Some answers still need a change before you can send." (focus also moves to the alerts), "Say what you helped with before resolving this request.", Add a case's "Confirm that you have checked these answers with the client first."). They become warning toasts: they aren't failures, they say what to do next, and 8 s with pause-on-hover is enough.
3. **Local failures:** a draft 13614-C or 14446 that couldn't be built (`draft.failed`, `draft.font_unchecked`). It goes to the problem banner, and Try again rebuilds it. That keeps Q3. The cost is a small controller hook, since `app.mjs` builds the draft outside the controller.

**Q8. The defaults confirmed before propose (17, all agreed; 12 included).**
1. Guard refusals use a `refuse(code, message)` helper that records the error, then throws. Not retryable, so Dismiss only.
2. The press handler's catch stays as a safety net, but no longer toasts: if a press fails and nothing was recorded, it records a general error.
3. Nudges become warning toasts. "Some answers still need a change…" still moves focus to the alerts.
4. `draft.failed` and `draft.font_unchecked` go to the problem banner through a controller hook (`noteLocalFailure(error, retry)`). Try again rebuilds the same draft (form and language). The blank tab still says `draft.failed`, as today.
5. Kinds by rule:
   - **success:** something happened (saved, sent, started, copied, rebuilt, moved);
   - **information:** nothing failed, but the person should know (fictional details filled, the reconcile choices, select the ID to copy it, "The draft is saved. Nobody was emailed.");
   - **warning:** the nudges, and both `hant_failed` messages.

   The plan lists every call site with its kind.
6. Position: a staff toast sits bottom-right, and while Add a case's bar is on screen it sits just above the bar. A client toast sits bottom-centre.
7. Story-proof: the Dismiss button carries no text (an icon plus `aria-label`, reusing `frame.dismiss`), so `#toast`'s text stays the message. The story moves the pointer off the toast before waiting for it to close before a screenshot.
8. The lists that track loading: the case list (behind the work board, the case pool, Follow-ups and the client's applications) and the assistance list (Follow-ups). The case page is out: it loads before the first draw.
9. "Loaded" turns false on sign-out and true after the first successful load. A later reload that fails keeps the cases already shown, with the banner above. "Couldn't load" is only for a list that never loaded.
10. New text:
    - staff: "Loading cases…", "The cases couldn't load.";
    - client: "Loading your applications…" / 正在载入您的申请…, and "Your applications couldn't load." / 无法载入您的申请。;
    - both: "You're back online." / 已重新连接。

    繁體 is generated. All of it goes to the wording review.
11. Busy coverage: wherever `state.busy` already disables buttons: the staff case actions and the client's Submit (through `dispatch`), the office's assistance actions, and the presenter's reset and checkpoint.
12. Add a case's Save and Send are covered too, though `officeSaving` holds them rather than `busy` (included by the user).
13. A client's sub-step moves are not covered: the save chip already says Saving.
14. The pressed button is found by its `data-action` plus its case or request id. If it isn't on screen after a redraw, there is no spinner.
15. "You're back online." shows only after a real offline or reconnecting spell, never on the first connect.
16. Every spinner (busy, loading, reconnecting) stops under `prefers-reduced-motion`; the icon stays still.
17. Names: the change is `unify-feedback-and-loading-states`. It creates a new capability `screen-states`, with ADDED requirements only. The guard-refusal routing belongs to `screen-states`, since it applies across screens.

## Implementation decisions found while planning

- **I1. A redraw replaces `#toast`.** `render` sets `root.innerHTML = views.page(...)` (`app.mjs:252`), and `#toast` is inside the page, so a redraw wipes a showing toast. Re-applying it would announce it again. The toast moves to its own host beside `#app`, created once by `app.mjs`, with the same id and roles.
- **I2. A failed first load can't be retried today.** `retryLast` only replays a `pendingAction`, and a load isn't one. The local-retry hook (Q8.4) serves both the draft rebuild and the list reload. `retryLast` returns `{ local: true }` for a local retry, so "Sent again." follows only a replayed action, and it runs the local retry before its first `await`, so a rebuilt draft opens its tab inside the press.
- **I3. Shell tests pin `notify(...)` call sites by regex,** including the literal-text allow-list. They follow the new `notify(kind, text, by)` form.
- **I4. Add a case's "There is no assisted intake form on screen."** is one more toast-only refusal; it is recorded with `noteLocalFailure` and no retry.
- **I5. No new focus helper.** `describeFocus` and `focusSelectors` (`ui.mjs`) already describe and find a pressed control by its action and row, so busy marking reuses them.
- **I6. The story reads draft failures from the toast** (`toastSays(DRAFT_FAILED)`, `toastSays(DRAFT_FONT_UNCHECKED)`). Those checks move to the problem banner, with a Try again check.
- **I7. The draft banner's sentence.** `draft.failed` says "Close this tab and try again.", which fits only the blank tab. The banner gets its own sentence, "The draft could not be made. Try again." / 无法生成草稿。请再试一次。 The font sentence "The draft font could not be checked. Try again later." gains a `sentence()` entry.
- **I8. Lists while not ready.** The work board, the case pool and Follow-ups show their heading and the loading or "couldn't load" line only, without tabs, filters or counts, which would all read 0. The client's applications page keeps its intro and lookup, and replaces only the list.

### From the artifact recheck (2026-10-16, a read-only review plus the assistant's own)

- **I9. Three catches, not two, and one more toast.** The submit handler has a second catch (`app.mjs:1696`), and the `storage` handler toasts `toast.hant_failed` (`app.mjs:1765`, a warning with no `by`). All three catches become the safety net. The counts are 12 unrecorded refusal sites and 3 `requirePresenter` callers.
- **I10. The safety net stays off the sign-in screens and compares errors.** Sign-in failures set `state.authError` and rethrow, so a "no error recorded" check would add a banner beside the sign-in form's own alert. The net skips a press with an `authError` or no principal, and records only when the state's error is still the one it had at the press (an older error may still be showing). It keeps a known sentence from the error. The sign-in suite runs, since the sign-in screens lose their duplicate toast.
- **I11. More pins than first listed.** `tests/shell.test.mjs` 615 (Add a case's `Loading…`), 857, 861, 889, 964, 974–975, 1001–1010 (`BEFORE_ANY_AWAIT`), 1029–1033 (`said >= 24`, which drops to 21), and `tests/client-language.test.mjs:384` (the refusal-literal scrape, widened to `refuse(…)`).
- **I12. One error at a time** (ruling). A local error during a failed save would have replaced the chip's text and its retry. A newer error replaces an older one. A replaced failed save falls back to "Unsaved" and is sent with the next move or save.
- **I13. Errors inside dialogs** (ruling). The banner stepped aside for the two drawers only, so a refusal from the presenter's reset or checkpoint dialog would sit behind the `aria-modal` backdrop. While any dialog is open, its error shows inside it (`dialogError`), and the banner steps aside.
- **I14. The list retry and the local retry's lifetime.** `refresh` doesn't read the people or the workspace, so it can't be the retry. `loadData()` (from `load()`) is. An applicant's help-request list is `ready` at once. `noteFailure` drops the local retry, so a newer error can't leave Try again running an old draft rebuild.
- **I15. The toast's timing moves into `src/toast.mjs`,** a DOM-free timer with injectable timers, so 5 s / 8 s, pause, restart and replace are unit-tested rather than only pinned.
- **I16. The toast's accessibility.**
  - A hidden toast is `visibility: hidden` with its text cleared, so its Dismiss leaves the Tab order.
  - Focus returns to where it came from when the toast hides with focus inside.
  - `role="status"` moves to a persistent text span, with the Dismiss outside it.
  - Escape dismisses while focus is inside.
  - The Dismiss is 44 × 44 px, the client floor.
- **I17. Busy marking is an allow-list.** `dispatch` sets `busy` for a sub-step move's save too, so marking every pressed control would spin Continue. Only case and assistance actions, the reset, the checkpoint submit (given `id="checkpoint-submit"`) and Add a case's Save and Send are marked, never while the save chip is saving.
- **I18. Contrast.** DESIGN.md's attention text `#a07c32` is 3.42:1 on `#faf0dd`, below AA. The connection notice keeps today's `#8a5a12` (5.23:1).
- **I19. CSS carried over.** `.notice.error` sets its own paragraph colour (`.notice p` forces one), and inherits the office drawer's `.notice.amber` override. The banners keep their 13px size, padding and media-query rules. The in-place errors use the banner's error pair, not DESIGN.md's terracotta, as decided in Q6.5.
- **I20. The story.**
  - `watchAlerts` and `waitForQuiet` also observe `#toast`.
  - The click helpers dismiss a visible toast and move the pointer to the top centre of the page, never `(0, 0)`, the staff sidebar toggle.
  - Try again's popup is awaited from before the press.
  - A check that a toast on Add a case sits above the bar.

## Design trade-offs

- **Recording guard refusals vs a toast.** A refusal in the banner stays until dismissed, which is heavier than a 3.5 s toast for a rare stale-screen case. Accepted for one rule ("errors never toast") and one announcement (`role="alert"`).
- **A nudge as a warning toast vs a banner.** A nudge isn't a failure and the person can act on it at once, so it leaves on its own; the alerts list (for "needs a change") is still where focus goes.
- **No skeleton rows.** Accepted: loads are short here, and one spinner line is simpler to keep consistent.
- **One toast at a time.** A quick second message replaces the first. Accepted, as today: the messages are short and the latest is the relevant one.
- **Pause on hover in the story.** A Playwright pointer resting on the toast would pause it, so the story moves the pointer first (Q8.7).

## Open questions

- **The wording of the new text** (Q8.10, I7, the Dismiss label on the toast). Owner: the group's wording review. Text only.
