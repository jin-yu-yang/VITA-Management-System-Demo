# Retrospective: unify-feedback-and-loading-states

> Written: 2026-10-16 (after verify passed with warnings)
> Commit range: `ca9a235..1a7f7bf` (16 commits after the planning commit; this retrospective and the archive follow)
> Worktree: `.claude/worktrees/unify-feedback-and-loading-states` on branch `unify-feedback-and-loading-states`

---

## 0. Evidence

- **Commit range**: `ca9a235..1a7f7bf`, 16 commits:
  - 8 task commits;
  - 5 fix rounds (Task 2 once, Task 4 once, Task 5 once, Task 8 twice);
  - 1 final fix wave;
  - 1 task-tick commit;
  - 1 verify commit.
- **Diff size**:
  - after the planning commit (`ca9a235..1a7f7bf`): 32 files, +1759 / −217;
  - branch total (`73f88df..1a7f7bf`): 37 files, +4039 / −194, including the planning artifacts and the generated `src/zh-hant.mjs`.
- **Tasks done**: 17/17 across eight groups.
- **Active hours**: about 2 for apply by commit times (15:17 to 17:05). Before that came the explore, the Stitch pass (toast and empty-state sheets), the brainstorm (Q1–Q8), propose, and the pre-apply artifact recheck (a Sonnet reviewer plus the controller's own).
- **Subagent dispatches**: 1 before apply, 29 during apply.
  - Before apply: 1 read-only artifact recheck (Sonnet).
  - 8 task implementers: Sonnet for Tasks 1 and 3–6, Opus for Tasks 2 and 8, Haiku for Task 7.
  - 5 resumed implementers for the fix rounds.
  - 1 final fix wave (Opus).
  - 8 task reviewers: Sonnet, Opus for Task 2.
  - 6 scoped re-reviews: Sonnet and Haiku.
  - 1 final whole-branch review (Opus).
- **New external dependencies**: none. A new module, `src/toast.mjs`.
- **Bugs encountered post-merge**: none yet (not merged).
- **OpenSpec validate state at archive**: pass at verify (5/5).
- **Test coverage signal**:

  | Suite | `main` | This branch |
  |---|---|---|
  | unit | 999 | 1043 (44 new, including `tests/toast.test.mjs`) |
  | story | 57 | 57/57 after Task 8, and 57/57 after the final fix wave |
  | sign-in | 20 | 20/20 |
  | database | 253 | not run: no change |

Commit chain:

```
ca9a235 OpenSpec change unify-feedback-and-loading-states: planning artifacts
2b8c079 Refusals are recorded before they are thrown; one error at a time; one local retry
292ffe3 The toast: three kinds, a Dismiss, 5/8 s with pause, its own host; errors never toast
200984c A replacing toast keeps the pointer's or focus's hold
36002e5 A draft that couldn't be built goes to the problem banner, and Try again rebuilds it
2c17009 Lists say when they are loading or couldn't load, and Try again reads everything again
b1449e1 The lists' Try again survives a failed open case, and a refresh after a failed first load reads everything
efe3d02 The pressed button shows a spinner and aria-busy while its press runs
3e097b0 The busy spinner stays on Save draft and Send through the whole save
e8200d3 Errors show inside the open dialog; in-place errors, banners and the failed save chip share DESIGN.md's error look
6f47912 The connection notice spins while reconnecting, and a returning connection says so
7784583 Story: a toast never blocks a click; Dismiss, kind and position; draft failures in the banner with Try again; docs
c65cc1e Story: the Add a case toast check fails when the toast or the bar is missing
dcc9fd4 Story: the Add a case toast check needs the sticky bar on screen and tests only the overlap
f5a2e96 Final review: Try again always does something, errors show once, the safety net counts errors
a0ab847 OpenSpec change unify-feedback-and-loading-states: all tasks done
1a7f7bf OpenSpec change unify-feedback-and-loading-states: verify
(retrospective and archive commits follow)
```

---

## 1. Wins

- [evidence: the recheck before apply, brainstorm I9–I20] **The read-only artifact recheck found two blocking defects before any code.**
  - The first was a third catch, and a toast missing from the table, either of which would have thrown under the new `notify(kind, …)`.
  - The second was a safety net that would have put "Something went wrong." beside the sign-in form's own alert.
  - It also found the busy marking spinning Continue, a list retry (`refresh`) that couldn't read the people, an error stuck behind a modal, the toast's Tab order, and a dozen test pins the plan hadn't listed.
- [evidence: the user's correction before propose, brainstorm Q7] **The user caught the voices only a toast carried.** These were the guard refusals, the nudges and the draft failures. Dropping error toasts without routing them would have made them silent.
- [evidence: `tests/toast.test.mjs`, I15] **Moving the toast's timer into a DOM-free module made the 5 s / 8 s timing, the hold and the replacement testable,** instead of only pinned as a constant.
- [evidence: story runs 1 and 2] **The story passed on its first run after Task 8.** The locator handler (`guardToast`) kept a pointer-catching toast from blocking any action, and the run's evidence showed the soft checks really ran.
- [evidence: f5a2e96, the final review's repro] **The final review confirmed two of its findings with a scratch test against the real controller:** the dead Try again, and the safety net's identity check. Both were then fixed with behavioural tests.

## 2. Misses

- 🟡 [painful | evidence: final review, f5a2e96] **The safety net's "nothing new was recorded" check never matched.** `getState()` clones `state.error`, so comparing the object from before and after the press is always "changed". The plan, the task review and the recheck all missed it. A repro test found it. Now done with `state.errorCount`.
- 🟡 [painful | evidence: final review, f5a2e96; Task 4 deferred minor] **The local retry and the Try again flag drifted apart.** `noteFailure` dropped the retry but left `retryable` on, so a banner could offer a Try again with nothing behind it. It was deferred as a minor at Task 4 and raised to must-fix by the final review.
- 🟡 [painful | evidence: Task 4 review, b1449e1] **The list retry had two holes.** A restored open case's failure dropped it, and a later refresh never read the people or the workspace. The plan had placed `noteUnloaded` too early and assumed `refresh` would do.
- 🟡 [painful | evidence: Task 5 review, 3e097b0] **A plan guard defeated its own requirement.** The "skip while the save chip is saving" guard hid the spinner on Add a case's Save and Send. The allow-list already did its job.
- 📌 [nit | evidence: Task 2 review, 200984c] **A replacing toast forgot its hover or focus hold.** The plan's `show()` reset it, and the DOM sends no new event for a pointer that hasn't moved.
- 📌 [nit | evidence: Task 8 review, c65cc1e, dcc9fd4] **The story's Add a case check could pass without checking anything.** It took two fix rounds, the second because my round-1 instruction had kept the off-screen escape.
- 📌 [nit | evidence: final review, f5a2e96] **A pre-existing duplicate.** The client intake repeated `state.error` inline as well as in the banner. This change routed more errors there, so it now mattered.

## 3. Plan deviations

| Plan task | What changed | Why |
|---|---|---|
| 1 | The save tests use `store.failNext`, the repo's idiom, instead of overriding `store.act`. | Allowed by the brief. |
| 2 | `notify` syncs the real hover and focus hold after `toast.show()`. Line 1128's temporary toast picks its key into `const failure`, and Task 3 removed it. The press-message floor is 21. | Task 2 review (ruling); the brief's own pins. |
| 3 | The pin checks that `viewDraft`'s catch has no `notify(` and no `const failure`. | The controller's resolution. |
| 4 | `noteUnloaded` moved after `loadSelected`. A `dataLoaded` flag makes `refresh()` use `loadData()`. | Task 4 review (ruling). |
| 5 | The `saveState` guard was dropped. | Task 5 review (ruling). |
| 6 | A token `--vt-error-line` was added. | An existing test bans raw hex in the office block. |
| 8 | `guardToast` presses Dismiss inside the page, the explicit Dismiss uses the real mouse, and the position check is an overlap test. The check became hard assertions in two fix rounds. | Better than the brief's code, so the guard doesn't pre-empt its own clicks; Task 8 review. |
| final | Fixed:<br>• `retryable` follows the local retry, with `dispatch` setting it after `noteFailure`;<br>• the intake's inline error is removed;<br>• `state.errorCount` for the safety net;<br>• the corrections dialog gets its controls;<br>• the toast's live text span stays visible, with `pointer-events: none` while hidden;<br>• `noteUnloaded` retries when `!dataLoaded`;<br>• `controller.clearError(code)`;<br>• `.unloaded-line` uses the token;<br>• the toast text clears after its fade.<br><br>design.md D1–D6 updated at verify. | Final review. |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓ (agreed in conversation; the skill wrote `brainstorm.md` at propose) |
| superpowers:writing-plans | ✓ (`plan.md` in the change folder, rewritten after the recheck) |
| superpowers:using-git-worktrees | ✓ (`git worktree add` for the existing branch, then `EnterWorktree` by path; the `node_modules` and `.env.test` links) |
| superpowers:subagent-driven-development | ✓ (ledger, pre-flight scan table, per-task reviews, five fix rounds, final review, one fix wave) |
| (transitive) superpowers:test-driven-development | ✓ (each implementer reported RED and GREEN; a few pins passed at once by design, as the plan said) |
| (transitive) superpowers:requesting-code-review | ✓ (per-task reviews, and the final review on Opus) |
| superpowers:finishing-a-development-branch | ✓ at lifecycle step 9 |

### Deliberately Skipped Skills

None.

## 5. Surprises

- **`getState()` clones nested state.** Any "is it the same object as before" check in `app.mjs` is wrong by construction. A counter, or a value compared by content, is the only safe identity.
- **A child with `visibility: visible` inside a `visibility: hidden` parent is visible and hit-testable.** Keeping the live region exposed needed `pointer-events: none` beside it.
- **Playwright's locator handlers run only before actionability-checked actions,** not before `evaluate`, `waitForFunction` or `page.mouse`. That made `guardToast` safe for the story's read-only checks, and the explicit Dismiss had to use the real mouse.
- **Sign-in failures rethrow after recording only `authError`.** A generic safety net would have doubled every sign-in error.

## Ledger summary (rulings, parked findings, deferred minors)

From the SDD ledger (`.superpowers/sdd/plan/progress.md`), before it was deleted.

**Rulings**, in order:
1. **The replacing toast's hold** (Task 2): sync the real DOM hold in `notify` after `toast.show()`, keeping `src/toast.mjs` resetting on show. The DOM is the source of truth, and keeping the hold inside `show()` could carry a stale hover from a fade-out. Cost if wrong: a held toast could still time out where `:hover` lags.
2. **The list retry** (Task 4): call `noteUnloaded` after the open case is read, and add a `dataLoaded` flag so `refresh()` reads with `loadData()`. Cost if wrong: one extra people and workspace read on a refresh after a failed start.
3. **The busy guard** (Task 5): drop the "save chip is saving" guard, since the allow-list keeps sub-step moves unmarked. Cost if wrong: none found.
4. **The safety net's identity** (final review): `state.errorCount`, incremented in `noteFailure`. Not an id inside `state.error`, which tests compare with `deepEqual`, and not code plus message, which would let the net drop a failed save. Cost if wrong: one more state field.
5. **The fix wave's cheap extras** (final review): `noteUnloaded` with `!dataLoaded`, the reload test's banner assertion, `controller.clearError(code)`, the `.unloaded-line` token, and the toast text cleared after its fade. Cost if wrong: a little more surface in one fix wave.
6. **Design D5's stale guard** was the controller's doc fix at verify, not the fix wave's.

**Parked findings:** none. No fix loop reached its cap.

**Deferred minors** (the final review triaged them; none blocks merge):
- **Task 1:**
  - the CONFLICT in `reconcileAnswers` draws twice;
  - a non-save `pendingAction` is left in memory with `retryable` false (unreachable from the UI);
  - `saveNow`'s refusal records an error even for quiet callers (unreachable today);
  - no test of `refuse` replacing a failed save.
- **Task 2:**
  - the "errors never toast" pin only catches the word "error";
  - the bar's lift applies on any overlap, not only when the bar is stuck;
  - the toast's Escape doesn't check `isComposing`;
  - `getComputedStyle` runs on every render on Add a case.
- **Task 3:** the draft pins are source text only, and the `noteLocalFailure` regex hardcodes the message layout.
- **Task 4:** the new CSS rules have no section comment.
- **Task 5:**
  - the marking tests are source pins only;
  - `pressed` is assigned before early returns (harmless);
  - the `saveState` pin covers a 900-character slice.
- **Task 6:**
  - `--vt-error-line` isn't pinned;
  - the case-page dialog test covers the office branch only;
  - no browser test of Dismiss or Try again inside a dialog;
  - a stale error moves into a dialog opened later (consistent with "stays until dismissed").
- **Task 7:**
  - the connection state survives sign-out, so a sign-out during an outage then a new sign-in can say "You're back online.";
  - a drop and recovery inside one held render gives no toast;
  - the back-online rule is a source pin;
  - a back-online toast replaces a press's success toast in the same render.
- **Task 8:**
  - `guardToast` moves the pointer to the top centre before a checked action (watch the sidebar-peek phase);
  - the evidence string's "not seen" branch is unreachable.
- **Final review:**
  - the font failure's banner says "Try again later." but offers Try again at once (for the wording review);
  - a toast raised while a dialog is open sits outside its Tab trap;
  - the safety net turns a save that failed after another case was opened into a banner on the new case;
  - spec scenarios covered by source pins only: Claim's and Send's `aria-busy`, "The connection drops and returns", "A redraw keeps the toast".
- **Out of scope, pre-existing:**
  - `dispatch`'s start clears the error without dropping a pending local retry (harmless today);
  - the `!sameOpening` rethrow can leave `retryable` true with no error if a local retry was pending (narrow).

## 6. Promote candidates → long-term learning

- [ ] 🟡 **`controller.getState()` returns copies, so app-side identity checks never match** → **Promote to memory** (type: project)
  > **Why**: the safety net compared the error object from before and after a press; the clone made it always "changed", so with an older error on screen a silent failure stayed silent. The plan, task review and recheck all missed it; a repro test found it.
  > **How to apply**: when `app.mjs` needs to know whether something changed in the controller, compare a counter or a value (`state.errorCount`), never an object from `getState()`.

- [ ] 🟡 **A retry and its Try again flag must be dropped together** → **Promote to memory** (type: project)
  > **Why**: dropping the local retry without turning `retryable` off left a Try again that did nothing; setting `retryable` before `noteFailure` let a stale drop remove a failed save's own Try again.
  > **How to apply**: any change to the controller's retry paths keeps `pendingAction`/`localRetry` and `retryable` in step, with a test of the dismiss-then-fail sequence.

- [ ] 📌 **A Playwright locator handler keeps a pointer-catching overlay out of the story's way** → **Promote to memory** (type: reference)
  > **Why**: the toast now takes the pointer and holds itself while hovered; `page.addLocatorHandler` (Playwright 1.63) dismisses it before any checked action, but never runs before `evaluate`/`page.mouse`, and `(0, 0)` is the staff sidebar toggle.
  > **How to apply**: for any new overlay the story meets, register a handler like `guardToast`; press its own controls with the real mouse; move the pointer to the top centre.

- [ ] 📌 **A story check that only writes an evidence string checks nothing** → **Promote to memory** (type: feedback)
  > **Why**: the Add a case toast check passed vacuously in three ways (toast unseen, bar absent, bar off screen) until two fix rounds made it hard assertions.
  > **How to apply**: when planning a story check, assert every precondition (the element shown, on screen) before the property under test; evidence strings are for the run's facts, not the verdict.

- [ ] 📌 **A read-only artifact recheck before apply pays for itself** → **One-off** (recorded here; the user already asks for it)
  > **Why**: it found two blocking and about ten important defects that would each have cost a fix round or more.
