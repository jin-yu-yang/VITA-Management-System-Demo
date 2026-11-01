# Lifecycle bar: no Closed after Accepted — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The staff case page's lifecycle bar ends at Accepted. Accepted is all done with no current step, and a closed case shows only Closed, after neutral steps (issue #109).

**Architecture:** `LIFECYCLE` in `src/staff-views.mjs` loses `"closed"`. `lifecycleBar` appends a Closed step only for a closed case, and gives each step one of `done`, `current`, `todo` or the new `neutral`. One CSS rule set styles `neutral`.

**Tech Stack:** Plain ES modules, `node:test`, CSS custom properties.

**Spec:** `openspec/changes/fix-lifecycle-bar-closed-after-accepted/design.md` and `specs/case-lifecycle/spec.md` in the same folder (the case-page bullet and its four new scenarios).

## Global Constraints

- Step order, unchanged: Request sent, Screening in progress, Pending intake / filing, Filing in progress, Pending review, Review in progress, Ready to exit, Ready to e-file, E-filed, Accepted. That is ten steps, indices 0–9. A closed case adds Closed at index 10.
- State class names, exactly: `done`, `current`, `todo`, `neutral`, and the existing `amend` modifier.
- `aria-current="step"` appears on at most one step. It never appears for Accepted, Draft, an unknown stage, or a Hold with no origin.
- No change to the client stepper (`src/client-views.mjs`), the database, actions, or client text.
- Commit messages follow the repo style ("Area: what now holds") and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Draft and an unknown stage**: ten `todo` steps, no Closed, no `aria-current`. Pinned in Task 1.
2. **A Hold with no origin** (`{ stage: "on_hold" }`): ten `todo` steps, no Closed. Pinned in Task 1.
3. **A closed record that still carries `holdOrigin` / `documentsOrigin`**, as a case closed from a Hold does: its steps are still all `neutral` and none is `amend`. Pinned in Task 1.
4. **Accepted with a filing method** (`federalMethod: "efile", stateMethod: "paper"`): the E-filed and Accepted labels keep the method's staff name, every state is `done`, and Closed is absent. Pinned in Task 1.
5. **A closed case's connector**: the line into Closed is not the progress colour. Pinned in Task 1's CSS test.

---

### Task 1: The bar's steps and states

**Files:**
- Modify: `src/staff-views.mjs` (`LIFECYCLE` ~line 801, `lifecycleBar` ~line 817)
- Modify: `src/styles.css` (the `.lifecycle-step` rules ~lines 2950–3001)
- Test: `tests/staff-views.test.mjs` (the four `lifecycle bar` tests ~lines 1187–1280)

**Interfaces:**
- Consumes: nothing new.
- Produces: `lifecycleBar(subject)`, same signature and markup shape (`<li class="lifecycle-step STATE[ amend]">`), with `STATE` one of `done | current | todo | neutral`.

- [ ] **Step 1: Update the tests.** In `tests/staff-views.test.mjs`, with the existing `steps(…)` and `labels(…)` helpers:
  - In "the lifecycle bar marks done, current and still-to-come steps":
    - `steps("preparing")` is `["done","done","done","current","todo","todo","todo","todo","todo","todo"]`, ten entries.
    - `steps("draft")` and `steps("nonsense")` are ten `"todo"`, and neither bar matches `/Closed/`.
    - Replace the closed assertion: `steps("closed")` is `[...Array(10).fill("neutral"), "current"]`. `labels("closed").at(-1)` is `"Closed"`. `aria-current` matches exactly once, on Closed: `/aria-current="step"[^>]*>[\s\S]*?Closed/`.
  - New test, "the lifecycle bar ends at Accepted and never draws Closed after it":
    - `steps({ stage: "accepted", federalMethod: "efile", stateMethod: "efile" })` is `Array(10).fill("done")`, and that bar has no `aria-current` and no `/Closed/`.
    - `steps("review_ready")` is `[...Array(4).fill("done"), "current", ...Array(5).fill("todo")]`, and `labels("review_ready")` does not include `"Closed"`.
    - `labels({ stage: "accepted", federalMethod: "efile", stateMethod: "paper" }).slice(8)` keeps the method's staff names (read the expected strings from `describeStage(…, "en", record).label` for `"efiled"` and `"accepted"`), and its steps are all `"done"`.
  - New test, "a closed case claims nothing, even when it came from a Hold": `steps({ stage: "closed", holdOrigin: "awaiting_documents", documentsOrigin: "screening" })` is `[...Array(10).fill("neutral"), "current"]`, with no `amend`.
  - In "the lifecycle bar runs on to Ready to e-file and E-filed": `ready.slice(8)` is `["todo","todo"]`.
  - In "the lifecycle bar takes the record…": `labels({ stage: "efiled" }).slice(7)` is `["Ready to e-file","E-filed","Accepted"]`. The rejected bar has `rejected[9] === "todo"` and length 10. Replace the old "Accepted is the current step" assertions with the all-done expectation above.
  - The Hold and Waiting for documents test stays as is. `{ stage: "on_hold" }` is ten `"todo"`.
  - CSS check, beside the existing stylesheet tests in `tests/shell.test.mjs` ("the stylesheet hides a closed sidebar…" reads `src/styles.css` the same way): the stylesheet has a `.lifecycle-step.neutral` rule, and a rule that makes `.lifecycle-step.neutral + .lifecycle-step.current::before` use `var(--vt-line)`.
- [ ] **Step 2: Run to verify they fail.** Run `node --test tests/staff-views.test.mjs tests/shell.test.mjs`. Expected: the updated and new lifecycle tests FAIL (eleven steps, Accepted current, closed steps `todo`).
- [ ] **Step 3: Implement in `src/staff-views.mjs`.** Remove `"closed"` from `LIFECYCLE` and update its comment: Accepted is the end, and Closed is drawn only for a closed case. In `lifecycleBar`:
  - The steps are `stage === "closed" ? [...LIFECYCLE, "closed"] : LIFECYCLE`.
  - A closed case: every step but Closed is `neutral`, Closed is `current`, and there is no `amend`.
  - `accepted`: every step is `done`, with no `current` and no `aria-current`.
  - Every other stage keeps today's `at`/`amend` calculation.
  - Update the comment that says "a closed case marks no step as done" to say its steps are neutral.
- [ ] **Step 4: Implement in `src/styles.css`.**
  - `.lifecycle-step.neutral`: label in `var(--vt-muted)`, and the dot's border in `var(--vt-line)` with a `var(--vt-surface)` fill.
  - `.lifecycle-step.neutral::before` and `.lifecycle-step.neutral + .lifecycle-step.current::before`: `background: var(--vt-line)`.
  - Use existing tokens only, so dark mode follows.
- [ ] **Step 5: Run to verify they pass.** Run `npm test`. Expected: all PASS.
- [ ] **Step 6: Commit.** Message: "Lifecycle bar: Accepted is the end; a closed case shows only Closed (#109)".

### Task 2: Checks

- [ ] **Step 1:** Run `npm test`. Expected: PASS, with the totals recorded.
- [ ] **Step 2:** Run `npm run test:browser` with the local test stack running (`docs/setup.md`). Expected: PASS. The story does not read the bar's steps, but the case page changed.
- [ ] **Step 3:** Run `npx openspec validate --all`. Expected: every item valid.
- [ ] **Step 4:** Record for `verify.md`: the database suites were not run (no migration or SQL change), sign-in was not run (untouched), and `build:hant -- --check` was not run (no client text).
