# Retrospective: unify-confirmation-dialogs

> Written: 2026-10-16 (after verify passed with warnings)
> Commit range: `32036a5..` the retrospective commit (base: `main` at #77)
> Worktree: `.claude/worktrees/add-confirmation-dialogs`

---

## 0. Evidence

- **Commit range**: `32036a5..581cd8c`, 12 commits before this file:
  - 1 planning;
  - 7 code, test and docs;
  - 3 task ticks;
  - 1 `/opsx:update` of the artifacts;
  - 1 verify.
- **Diff size**: +1693 / −81 lines across 21 files. Code, tests and docs alone: +366 / −81 across 13 files. The rest is the change folder and the golden fixture.
- **Tasks done**: 22/22, including group 7, which the final review added.
- **Active hours**: about 2 h of wall time (19:09–20:55), including one browser run (~13 min).
- **Subagent dispatches**: 15:
  - 7 implementers;
  - 7 task reviews;
  - 1 final whole-branch review (opus).
  
  There were no fix rounds.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none (not merged yet).
- **OpenSpec validate state at archive**: pass (6/6; see verify §1).
- **Test coverage signal**:
  - unit tests went from 1055 to 1061;
  - the golden test pins 11 dialog states;
  - browser: one run, 32/34, with every new check passing (verify §2);
  - a separate Playwright check showed that the inert pass makes no DOM writes when no dialog is open.

Commit chain:

```
281935a Plan unify-confirmation-dialogs (OpenSpec change)
eabc63f Golden markup of the six confirmation dialogs, before confirmBody
b86bdb8 confirmBody, inertWhileDialog and trapTarget in ui.mjs
07389c6 The six confirmations use confirmBody, with identical markup
619d536 The page behind an open dialog is inert, except the live regions; Tab can't leave the dialog from its container
1d57ca9 Story: the page behind a dialog is inert, the toast is not, and Shift+Tab stays inside
28cb270 Docs: dialogs are inert behind, trap Tab from the container, and use confirmBody
de36a84 OpenSpec change unify-confirmation-dialogs: tasks ticked
aca63a2 OpenSpec change unify-confirmation-dialogs: update after the final review
b5717f8 confirmBody adds no paragraph for an empty lead; the inert comment names which live regions stay reachable
854ec54 OpenSpec change unify-confirmation-dialogs: tasks 7.1-7.2 ticked
581cd8c OpenSpec change unify-confirmation-dialogs: verify (pass with warnings)
```

---

## 1. Wins

- **[evidence: eabc63f, 07389c6] A golden fixture captured before the refactor made "identical markup" checkable.**
  - The fixture commit touches only `tests/`.
  - Its 11 states cover every branch the move touched: idle/busy, refused/retryable, empty checkpoint, and 简体.
  - All six bodies moved in one task with no existing test edited and no fix round.
- **[evidence: plan Task 3 dry run, 07389c6] The plan's close-case snippet was dry-run against today's output during planning (`identical: true`).** The implementer then reported "no brief-vs-code differences".
- **[evidence: b86bdb8, 619d536] The pure helpers (`trapTarget`, `inertWhileDialog`) kept `app.mjs` wiring tiny and unit-testable without a DOM.** The browser check proves the container case discriminates: the old first/last-only trap would fail it.
- **[evidence: verify §2] The inert no-op check settled attribution.** It ran in real Chromium and Firefox, and found 0 mutations without a dialog. The one browser failure, in client intake, could therefore be cleared rather than argued about.
- **[evidence: ledger] There were no fix rounds in any task.** Each brief carried complete code, so the reviews found only Minor issues.

## 2. Misses

- 🟡 **[painful | evidence: final review F-I1, aca63a2] The spec's "in this order" was written from the common case and didn't hold for two of the six dialogs.**
  - The checkpoint dialog's note sits inside its form; the corrections dialog's refusal comes first.
  - The task reviews didn't catch it, because they check code against the brief, not the spec against the code.
  - It needed a `/opsx:update` round after apply.
- 🟡 **[painful | evidence: verify §2] The single browser run had one pairing fail in client intake (`waitForQuiet` on "My applications", Firefox client).**
  - This is the third change in a row where this phase has been flaky on this machine.
  - Not retried, by the user's rule.
- 📌 **[nit | evidence: Task 2 report, ledger] The Task 2 implementer flagged a missing `shield` icon that does exist (`src/ui.mjs:18`).** The Task 2 reviewer repeated the worry. Both were cleared by one grep.
- 📌 **[nit | evidence: Task 5 brief] The plan's Task 5 "Produces" line names `evidence.regressions.dialogInert`, but its snippet nests the evidence under `dialogFocus.inert`.** The snippet was followed.

### Deferred minor findings and parked items from the ledger

All of these were triaged by the final reviewer, and all were kept as they are:
- **T1:**
  - All 11 golden comparisons sit in one test, so the first mismatch hides the rest. The state name in the message softens this.
  - The state objects are not deep-frozen (theoretical).
- **T2:**
  - A note with `inForm: true` is dropped when there is no form. No caller does this.
  - The icon-fallback worry rested on a false premise.
  - The test's "connection-notice reconnecting" case adds little.
- **T3:** the import line in `src/views.mjs:1` is about 100 characters.
- **T4:**
  - The `render()` source check slices a fixed 6000 characters (plan-mandated).
  - The negative `=== first)` source check is loose.
- **T5:**
  - The Shift+Tab-from-container check asserts only "inside `.modal`". The run's evidence shows it landed on the last control, and the unit test pins that.
  - The evidence-key naming in the plan is inconsistent (above).
- **T7:** `confirmBody`'s doc comment doesn't say `lead` is optional.
- **Final review:**
  - F-M3, `<p>undefined</p>` for a missing lead: fixed in Task 7.
  - F-M1, the comment and D2 undercounting live regions: fixed in Task 7 and `aca63a2`.
- **Parked:** F-M2. The notice banner and problem banner keep their buttons reachable to a screen reader behind a dialog. The spec requires those banners to stay non-inert, and `aria-modal` already narrows most screen readers to the dialog. This is a follow-up (§6).

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 4.1 | The inert loop sits after `document.title`, not directly after `root.innerHTML` | Two existing shell tests pin the lines right after `innerHTML` together. The spec needs "every render, after the page is drawn", which holds. Ruled during apply; the final review agreed. |
| 5.4 | One browser run; a client-intake failure was recorded, not retried | The user's rule for this change |
| — (new) 7.1–7.2 | Empty lead adds no `<p>`; the inert comment names which live regions stay reachable | Final review F-M3 and F-M1. Added through `/opsx:update` at the user's request, with `npm test` only. |
| spec Req 4 | "In this order" reworded: refusal first, note before or inside the form, keep outside the form; two scenarios added | Final review F-I1. `/opsx:update` at the user's request. |

### Rulings recorded in the ledger (all of them, in order)

1. **Commit trailers** name the model that actually wrote each commit (Haiku or Sonnet 5.5 for subagent commits).
2. **Task 4:** the inert loop sits after `document.title` (above).
3. **F-I1** is a planning-artifact fix. Per CLAUDE.md §4, `/opsx:update` runs only when the user asks, so the controller proposed it instead of dispatching a fixer. The user then asked for it.
4. **No code fix wave for F-M1 to F-M3** or the optional T2/T5 items, because a T5 assertion change would need a second browser run. The user later asked for F-M1 and F-M3 as Task 7, which was done.
5. **F-M2 parked**: the banners' buttons stay reachable behind a dialog, as the spec requires. It is recorded here as a follow-up.

## 4. Skill / workflow compliance

| Skill | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming | ✓ (method in conversation; skill invoked at propose to capture brainstorm.md) |
| superpowers:writing-plans | ✓ (plan.md; Task 7 appended through `/opsx:update`) |
| superpowers:using-git-worktrees | ✓ (`.claude/worktrees/add-confirmation-dialogs`, detected as existing) |
| superpowers:subagent-driven-development | ✓ (ledger, pre-flight scan, per-task reviews, final review on opus, Task 7 through the same loop) |
| (transitive) superpowers:test-driven-development | ✓ (RED/GREEN in the Task 2, 4 and 7 reports; Tasks 1 and 3 are guarded by the golden test) |
| (transitive) superpowers:requesting-code-review | ✓ (final whole-branch review with code-reviewer.md) |
| superpowers:finishing-a-development-branch | ✓ (step 9, after archive) |

### Deliberately Skipped Skills

None. Two deviations from the skills' defaults, both because CLAUDE.md asked for them:

- **The subagent-driven development workspace was not deleted at its own finish.** CLAUDE.md step 7 needs the ledger for this retrospective. It is deleted right after this file is written.
- **The final review's Important spec finding was not given to a fix subagent.** CLAUDE.md §4 reserves `/opsx:update` for the user's request.

## 5. Surprises

- **Most of §2's "focus trapping and returning focus are not specified" already existed in code.** Esc, the trap, focus return to the opener, and first focus were all there. Only the specs were missing, plus the container gap and `inert`. The change became mostly "specify and consolidate".
- **The regenerate dialog is "Replace the fictional answers?", not a new Application ID.** I misnamed it during explore and caught it while writing the spec.
- **Byte-identical output forced the helper's shape.** `before` and `note.inForm` exist only because two dialogs differ. That's also what made the spec's "in this order" wrong.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Follow-up B: confirmations for the one-click irreversible actions.** → **Promote to** one-off follow-up (a new OpenSpec change)
  > **Why**: these actions run with a single click and can't be undone: Approve this review (`APPROVE_REVIEW`), Record that preparation is complete (`SUBMIT_REVIEW`), Verify document (`VERIFY_DOCUMENT`), and the client's remove household member (`remove-member`). The user chose scope A for this change and asked for B to be recorded.
  > **How to apply**:
  > - Each is now about a 10-line `confirmBody` dialog plus an `openDialog` call.
  > - Remove-member is client-facing, so it needs 简体 text and `npm run build:hant`.
  > - Each adds a click to the browser-story phases that use it, so plan the story edits in the same change.

- [ ] 🟡 **The banners' buttons stay reachable to a screen reader behind a dialog (F-M2).** → **Promote to** one-off follow-up
  > **Why**: the notice banner's Dismiss sends `dismiss-error`, which could clear a dialog's own error. The spec keeps the banners non-inert so they stay announced.
  > **How to apply**: if it matters in an accessibility review, make only the banners' controls unreachable while a dialog is open (for example, render them without buttons when `state.dialog` is set), leaving their live text alone.

- [ ] 🟡 **When a spec requirement states an order or a shape, check it against every instance before propose.** → **Promote to** memory (type: feedback)
  > **Why**: "in this order" was written from four of six dialogs. The task reviews compare code with the brief, so only the final review saw the spec mismatch.
  > **How to apply**: when writing a delta spec that generalises over several existing screens, list each instance and check the sentence against each one, in the planning step.

- [ ] 📌 **The client-intake "page to stop rebuilding" wait in the Firefox-client pairing is flaky on this machine.** → **Promote to** one-off follow-up (test tooling)
  > **Why**: it failed in this change's run and in the previous change's runs, always outside the change.
  > **How to apply**: before the next change that relies on one browser run, look at what keeps `#app` re-rendering on "My applications" in Firefox: realtime redraws, or the quiet watcher's 600 ms window.
