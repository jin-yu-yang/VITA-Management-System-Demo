# Gate Review and Redesign Summary: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- 9.1's Continue waits for every alert to be fixed.
- 9.2 shows only with no alerts. 9.3 shows only with no alerts and after Continue on 9.2.
- The summary page gets an intro, its tools first, Expand all and Collapse all, and sections that collapse from their headings and always print.

**Architecture:**
- **The gate is part of sub-step visibility** (`src/intake-form.mjs`).
  - `substepVisible` reads `reviewAlerts(answers)` and the visited sub-steps.
  - `visibleSubsteps`, `resolveSubstep` and `adjacentSubstep` take an optional trailing `visited`.
  - Every caller that has the visits passes them, so the rail, the counts, the moves and the saved place all follow one rule.
  - The controller's `moveSubstep(+1)` from `review.summary` adds the `review.submit` visit before it moves, so Continue there is what earns 9.3.
- **The summary page** is rebuilt in `summaryBody`:
  - its sections fold through the existing `openPanels` window state (`summary-shut:<step id>`) and the existing `toggle-panel` action;
  - a print rule shows every section.

**Tech Stack:**
- plain ES modules;
- `node:test` for the unit tests;
- Playwright for the story (`tests/browser.mjs`);
- the generated 繁體 map (`npm run build:hant`).

**Spec:** in `openspec/changes/gate-review-and-redesign-summary/`:
- `specs/client-intake/spec.md` (five ADDED requirements);
- `design.md` (D1–D9);
- `brainstorm.md` (Q1–Q12, I1–I7);
- `proposal.md` and `tasks.md`.

## Global Constraints

- Fictional data only, in code, tests, fixtures and screenshots.
- **No migration and no database change.**
  - Implementers never run `npm run db:migrate:test`, `npm run test:database`, `npm run test:auth-browser` or `npm run test:browser`. The controller runs the story.
  - Never run `supabase start` or `npx supabase start` from the repo root.
- **Commands:** `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && <one command>`.
- **繁體:** after any 简体 change in `src/client-text.mjs`, run `npm run build:hant` and commit `src/zh-hant.mjs`. Staff screens stay English.
- **Git, inside the worktree:**
  - run each git command on its own, never chained with `&&` or `;`;
  - stage files by name, never `git add -A` or `git add .`;
  - confirm each commit with `git rev-parse --short HEAD` and `git log --oneline -1`;
  - **every commit message ends with a blank line and exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, whatever model you are.**
- Never write under `docs/superpowers/`, never commit `.superpowers/`, and never edit `docs/intake-questions/` (no catalogue change).
- **Alerts (design D2):** every missing required answer (`missingToSubmit(2, answers)`), then every invalid answer (`invalidAnswers(null, answers)`), from the draft alone. Open documents are warnings and never block.
- **The gate (design D1, D3):**
  - `review.check` is always visible;
  - `review.summary` is visible when there are no alerts;
  - `review.submit` is visible when there are no alerts and `review.submit` is among the visited sub-steps;
  - only `moveSubstep(+1)` from `review.summary` adds that visit, and nothing removes it.
- **The texts (brainstorm Q4, Q6–Q9), exact:**

  | Key | English | 简体 |
  |---|---|---|
  | `review.continue_blocked` | Fix the items above to continue. | 请先修正上面的问题，然后继续。 |
  | `summary.intro_all` | Here is a summary of everything you told us in your application. | 以下是您在申请中填写的全部信息。 |
  | `summary.intro_change` | Before you submit, make sure you have answered everything that applies to you. To change an answer, choose \*\*{change}\*\* next to that part, or choose that part in the list of steps. | 提交之前，请确认所有适用于您的问题都已回答。如需修改，请点击相应部分旁边的“{change}”，或在步骤列表中选择该部分。 |
  | `summary.intro_tools` | With the buttons below, you can print this summary, or view and download a draft Form 13614-C made from your answers. | 您可以用下方的按钮打印这份汇总，或查看并下载根据您的回答生成的 13614-C 草稿。 |
  | `summary.expand_all` | Expand all | 全部展开 |
  | `summary.collapse_all` | Collapse all | 全部收起 |
  | `summary.toggle` | Show or hide {section} | 显示或隐藏{section} |

  - `{change}` is filled from `summary.change` (Change / 修改).
  - `rail.nav` ("Form steps", the rail's screen-reader label) is unchanged and not used by the intro (user's decision at the planning review).
  - The Chinese quotes are the full-width “ and ” (U+201C, U+201D).
  - Remove `submit.attention` and `submit.see_alerts` (design D5).
- **Ids and names (design D4, D7):**
  - `#continue-blocked`, `#summary-expand-all` and `#summary-collapse-all`;
  - the actions `summary-expand-all` and `summary-collapse-all`;
  - the panel name `summary-shut:<step id>`;
  - the section toggle `#summary-toggle-<step id>` and its body `#summary-body-<step id>`;
  - the documents section uses step id `documents`.

---

### Task 1: The gate

Visibility, the controller's moves, the form's view, and every test that reached a gated page.

**Files:**
- Modify: `src/intake-form.mjs:228-337` (the sub-steps section)
- Modify: `src/controller.mjs:1626-1691` (`revealInvalid`'s neighbour `guardSubmit`, `currentSubstep`, `goToSubstep`, `moveSubstep`)
- Modify: `src/app.mjs:888-915` (the SUBMIT guard) and its imports
- Modify: `src/intake-views.mjs:104-112` (`formView`), `:389-394` (`alertsOf`)
- Test: `tests/intake-form.test.mjs`, `tests/controller.test.mjs`, `tests/client-views.test.mjs`, `tests/client-language.test.mjs`, `tests/shell.test.mjs`

**Interfaces:**
- Produces:
  - `reviewAlerts(answers) → Array<{ id: string, kind: "missing" | "invalid" }>`, exported from `src/intake-form.mjs`;
  - `visibleSubsteps(answers, cards, visited = [])`;
  - `resolveSubstep(id, answers, cards, visited = [])`;
  - `adjacentSubstep(id, answers, cards, delta, visited = [])`;
  - `controller.guardSubmit() → Promise<boolean>`: true when the draft has no alerts; otherwise it reveals every invalid answer, moves to `review.check` and resolves false.

  In each of the three sub-step functions, `visited` is an array or a Set of sub-step ids, and a missing one counts as none. Task 2 uses `reviewAlerts` through `alertsOf`.

- [ ] **Step 1: Write the failing tests in `tests/intake-form.test.mjs`**

  Add `reviewAlerts` to the import from `../src/intake-form.mjs`. After the `adjacentSubstep` test (around line 401), add:

```js
test("reviewAlerts: the missing answers, then the invalid ones, from the draft alone", () => {
  const everything = fillAll();
  assert.deepEqual(reviewAlerts(everything), []);
  const { addr_city, ...noCity } = everything;
  assert.deepEqual(reviewAlerts({ ...noCity, email: "a@" }), [
    { id: "addr_city", kind: "missing" },
    { id: "email", kind: "invalid" },
  ]);
  assert.deepEqual(reviewAlerts(null), reviewAlerts({}));
});

test("the review gate: 9.1 always, 9.2 with no alerts, 9.3 once Continue on 9.2 has earned it", () => {
  const everything = fillAll();
  const cards = cardsFor(everything);
  const review = (answers, visited) =>
    visibleSubsteps(answers, cardsFor(answers), visited).filter((id) => id.startsWith("review."));
  assert.deepEqual(review(everything), ["review.check", "review.summary"]);
  assert.deepEqual(review(everything, ["review.summary"]), ["review.check", "review.summary"], "a visit to 9.2 earns nothing");
  assert.deepEqual(review(everything, ["review.submit"]), ["review.check", "review.summary", "review.submit"]);
  assert.deepEqual(review(everything, new Set(["review.submit"])), ["review.check", "review.summary", "review.submit"]);
  // Open documents never block: every Needed card here is still Not done.
  assert.ok(cards.some((card) => card.group === "needed" && card.status === "not_done"));
  // Any alert hides both, earned or not.
  const { addr_city, ...noCity } = everything;
  assert.deepEqual(review(noCity, ["review.submit"]), ["review.check"]);
  assert.deepEqual(review({ ...everything, email: "a@" }, ["review.submit"]), ["review.check"]);
  // A hidden 9.2 or 9.3 lands on 9.1; an unearned 9.3 on 9.2.
  assert.equal(resolveSubstep("review.submit", noCity, cardsFor(noCity), ["review.submit"]), "review.check");
  assert.equal(resolveSubstep("review.summary", noCity, cardsFor(noCity), ["review.submit"]), "review.check");
  assert.equal(resolveSubstep("review.submit", everything, cards), "review.summary");
  assert.equal(resolveSubstep("review.submit", everything, cards, ["review.submit"]), "review.submit");
  // Continue from 9.1 goes nowhere while an alert exists; from 9.2 only once earned.
  assert.equal(adjacentSubstep("review.check", noCity, cardsFor(noCity), 1), null);
  assert.equal(adjacentSubstep("review.check", everything, cards, 1), "review.summary");
  assert.equal(adjacentSubstep("review.summary", everything, cards, 1), null);
  assert.equal(adjacentSubstep("review.summary", everything, cards, 1, ["review.submit"]), "review.submit");
  assert.equal(adjacentSubstep("review.submit", everything, cards, -1, ["review.submit"]), "review.summary");
});
```

  In the `stepRollup` test (around line 482), before its last line, add:

```js
  // The review step counts only what the gate shows: an earned 9.3 is never Done.
  const everything = fillAll();
  assert.equal(stepRollup("review", ctx(everything, { visited: ["review.check", "review.summary"] })).key, "done");
  assert.equal(stepRollup("review", ctx(everything, { visited: ["review.check", "review.summary", "review.submit"] })).key, "none");
```

  In the `firstUnfinishedSubstep` test, after the line with `all.filter((id) => !id.startsWith("review."))`, add:

```js
  // 9.1 visited and clean: the summary is next.
  assert.equal(
    firstUnfinishedSubstep(everything, laterAll, [...all.filter((id) => !id.startsWith("review.")), "review.check"], new Set()),
    "review.summary",
  );
```

  Update the existing tests that expected all three review ids with `{}` answers, which have alerts:
  - In `visibleSubsteps: … review always` (around line 351):
    - rename it to `visibleSubsteps: questions by visibility, documents by service and cards, review by the gate`;
    - replace `assert.deepEqual(none.slice(-3), ["review.check", "review.summary", "review.submit"]);` with `assert.deepEqual(none.slice(-1), ["review.check"], "with alerts, the review step is 9.1 alone");`.
  - In the `resolveSubstep` test (around line 386), replace the last comment and assertion with:

```js
  // With nothing visible after it, the last visible one: with alerts, a hidden review.submit lands on review.check.
  assert.equal(resolveSubstep("review.submit", {}, NO_CARDS), "review.check");
```

- [ ] **Step 2: Run them and see them fail**

  Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/intake-form.test.mjs`

  Expected: FAIL. `reviewAlerts` is not exported, and the gate assertions fail.

- [ ] **Step 3: Implement the gate in `src/intake-form.mjs`**

  Above `const isSameDay` (around line 232), add:

```js
/**
 * The review step's alerts: every missing required answer, then every invalid
 * one, from the draft alone (it holds the contact fields). 9.1 lists them, and
 * while there is one, 9.1's Continue waits and 9.2 and 9.3 are hidden
 * (openspec change gate-review-and-redesign-summary, design D1, D2).
 */
export const reviewAlerts = (answers) => [
  ...missingToSubmit(2, answers ?? {}).map((id) => ({ id, kind: "missing" })),
  ...invalidAnswers(null, answers ?? {}).map((id) => ({ id, kind: "invalid" })),
];
```

  Replace `substepVisible`, `visibleSubsteps`, `resolveSubstep` and `adjacentSubstep` with:

```js
// `gate` is visibleSubsteps' one reading of the review gate: `clean` with no
// alerts, `earned` once Continue on 9.2 has added the visit to review.submit.
function substepVisible(substep, answers, cards, gate) {
  switch (substep.kind) {
    case "review":
      if (substep.id === "review.check") return true;
      return gate.clean && (substep.id === "review.summary" || gate.earned);
    case "documents":
      if (substep.cards === "bring") return isSameDay(answers);
      if (isSameDay(answers)) return false;
      if (substep.cards === "other") return true;
      return (cards ?? []).some((card) => card.substep === substep.cards);
    default:
      return substepQuestions(substep.id).some((question) => isVisible(question, answers ?? {}));
  }
}

/**
 * Ids of the visible sub-steps, in catalogue order. `cards` is cardsFor's
 * output; `visited` (an array or Set of sub-step ids, none when missing)
 * decides the review gate's 9.3.
 */
export function visibleSubsteps(answers, cards, visited = []) {
  const draft = answers ?? {};
  const gate = { clean: reviewAlerts(draft).length === 0, earned: asSet(visited).has("review.submit") };
  return substepsFor(2).filter((substep) => substepVisible(substep, draft, cards, gate)).map((substep) => substep.id);
}

/**
 * Where a place in the form lands now: `id` while visible; when hidden, the
 * next visible sub-step after it in catalogue order, or the last visible one
 * (so a gated 9.2 or 9.3 lands on 9.1); an id the catalogue doesn't have (or
 * null) goes to the first visible one.
 */
export function resolveSubstep(id, answers, cards, visited = []) {
  const visible = visibleSubsteps(answers, cards, visited);
  const all = substepsFor(2).map((substep) => substep.id);
  const at = all.indexOf(id);
  if (at < 0) return visible[0] ?? null;
  if (visible.includes(id)) return id;
  const visibleSet = new Set(visible);
  return all.slice(at + 1).find((other) => visibleSet.has(other)) ?? visible[visible.length - 1] ?? null;
}

/** The visible sub-step `delta` (+1 or -1) from the resolved `id`, or null at either end. */
export function adjacentSubstep(id, answers, cards, delta, visited = []) {
  const visible = visibleSubsteps(answers, cards, visited);
  const at = visible.indexOf(resolveSubstep(id, answers, cards, visited));
  return at < 0 ? null : visible[at + delta] ?? null;
}
```

  In `substepStatus`'s `review` case, replace the `const clean = …` line with `const clean = reviewAlerts(draft).length === 0;`.

  In `stepRollup`, use `visibleSubsteps(ctx.answers, ctx.cards, ctx.visited)`. In `firstUnfinishedSubstep`, use `visibleSubsteps(answers, cards, visited)`.

- [ ] **Step 4: Run the intake-form tests and see them pass**

  Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/intake-form.test.mjs`

  Expected: PASS.

- [ ] **Step 5: Write the failing controller tests in `tests/controller.test.mjs`**

  Add `reviewAlerts` to an import from `../src/intake-form.mjs`, or add that import if the file has none. Add the code below: `completeV2` above the `Change sets a return…` test, and the gate test after the `moveSubstep goes to the next or previous visible sub-step…` test.

```js
// A complete, valid draft: the sample's answers, with its contact fields in the
// case's contact record, where the server keeps them.
function completeV2() {
  const { tp_phone, sp_phone, best_contact_time, best_contact_note, ...answers } = makeSampleAnswers();
  return {
    answers,
    contact: {
      phone: tp_phone ?? null,
      spousePhone: sp_phone ?? null,
      bestContactTime: best_contact_time ?? null,
      bestContactNote: best_contact_note ?? null,
    },
  };
}

test("the review gate: only Continue on 9.2 earns 9.3, and an alert sends 9.2 and 9.3 back to 9.1", async () => {
  const { controller, store } = await openV2(completeV2());
  assert.deepEqual(reviewAlerts(controller.getState().draftAnswers), []);
  await controller.goToSubstep("review.submit");
  assert.equal(controller.getState().formSubstep, "review.summary", "9.3 before Continue on 9.2");
  // Leaving 9.2 by a rail jump or a Change link earns nothing.
  await controller.goToSubstep("about.you");
  await controller.goToSubstep("review.summary");
  await controller.openForChange("about.address");
  await controller.backToSummary();
  assert.equal(controller.getState().formSubstep, "review.summary");
  assert.equal(controller.getState().visitedSubsteps.includes("review.submit"), false);
  // Continue does, and the move's save sends the visit.
  await controller.moveSubstep(1);
  assert.equal(controller.getState().formSubstep, "review.submit");
  assert.ok(controller.getState().visitedSubsteps.includes("review.submit"));
  assert.ok(store.records.get("case-v2").intakeVisited.includes("review.submit"), "the earned visit was not saved");
  // An alert: 9.3 resolves to 9.1, and Continue there does nothing.
  controller.editAnswers({ addr_city: null });
  assert.equal(controller.currentSubstep(), "review.check");
  const writes = store.writes.length;
  await controller.moveSubstep(1);
  assert.equal(controller.currentSubstep(), "review.check");
  assert.equal(store.writes.length, writes, "a blocked Continue sent something");
  // "Back to summary" lands on 9.1 too.
  await controller.backToSummary();
  assert.equal(controller.currentSubstep(), "review.check");
  // The fix brings both back: 9.3 without another Continue.
  controller.editAnswers({ addr_city: "Philadelphia" });
  await controller.goToSubstep("review.submit");
  assert.equal(controller.currentSubstep(), "review.submit");
  controller.stop();
});
```

  Update the two existing tests that reached 9.2 or 9.3 with alerts:
  - `Change sets a return to the summary; …` (around line 3055): open with `await openV2(completeV2())` instead of `{ answers: { tp_first_name: "Mei" } }`. Put `completeV2` above this test (it is the first to use it), and the new gate test after `moveSubstep goes to…`.
  - `moveSubstep goes to the next or previous visible sub-step…` (around line 3072): replace the lines from `await controller.goToSubstep("review.submit");` to the last assertion before `controller.stop()` with:

```js
  // With alerts the form ends at 9.1: Continue there goes nowhere and sends nothing.
  await controller.goToSubstep("review.submit");
  assert.equal(controller.getState().formSubstep, "review.check");
  const writes = store.writes.length;
  await controller.moveSubstep(1);
  assert.equal(controller.getState().formSubstep, "review.check");
  assert.equal(store.writes.length, writes);
```

- [ ] **Step 6: Run them and see the new test fail**

  Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/controller.test.mjs`

  Expected: FAIL in `the review gate…`. Continue on 9.2 doesn't reach 9.3 yet.

- [ ] **Step 7: Pass the visits in the controller (`src/controller.mjs`)**

  In `currentSubstep()`:

```js
    return resolveSubstep(state.formSubstep, state.draftAnswers, cardsNow(), state.visitedSubsteps);
```

  In `goToSubstep`, the place line:

```js
    state.formSubstep = resolveSubstep(id, state.draftAnswers, cardsNow(), state.visitedSubsteps);
```

  Replace `moveSubstep` and its comment with:

```js
  // Continue (+1) and Back (-1): the adjacent visible sub-step. Nothing at
  // either end, not even a visit. Continue on the summary is what earns the
  // Submit page (openspec change gate-review-and-redesign-summary, design D3):
  // its visit is added first, so the move finds 9.3 and the save sends it.
  async function moveSubstep(delta) {
    if (!formOpen() || substepSaveInFlight) return;
    if (delta > 0 && currentSubstep() === "review.summary" && !state.visitedSubsteps.includes("review.submit")) {
      state.visitedSubsteps = orderVisited([...state.visitedSubsteps, "review.submit"]);
      if (!state.dirty && visitsPending()) markDirty();
    }
    const target = adjacentSubstep(state.formSubstep, state.draftAnswers, cardsNow(), delta, state.visitedSubsteps);
    if (!target) return;
    await goToSubstep(target);
  }
```

  `openAtFirstUnfinished` already passes `state.visitedSubsteps` to `firstUnfinishedSubstep`. Leave it as it is.

- [ ] **Step 8: Pass the visits in the form's view (`src/intake-views.mjs`)**

  In `formView`:

```js
  const visible = visibleSubsteps(answers, cards, visited);
  const current = resolveSubstep(state.formSubstep, answers, cards, visited) ?? visible[0];
```

  Make `alertsOf` build on `reviewAlerts`, and add `reviewAlerts` to the import from `./intake-form.mjs`:

```js
// Alerts block 9.1's Continue and Submit: every missing required answer and
// every invalid one, from the draft alone (reviewAlerts, design D2).
function alertsOf(answers) {
  return reviewAlerts(answers).map((item) => ({
    ...item,
    flag: item.kind === "missing" ? "alert.missing" : "alert.invalid",
    substep: substepOfQuestion(topId(item.id)),
  }));
}
```

  Then remove `invalidAnswers` from the `./intake-form.mjs` import and `missingToSubmit` from the `./intake-catalogue.mjs` import, but only if nothing else in the file still uses them. Check with `grep -n "missingToSubmit\|invalidAnswers" src/intake-views.mjs`.

- [ ] **Step 9: Move the Submit guard's decision into the controller (design D5)**

  The guard in `src/app.mjs` (around lines 888–915) checks the draft again when Submit is pressed. It can still be reached: the page holds back redraws while a pointer is pressed, so a press can land on a 9.3 drawn before another device's change brought an alert back. The story can't produce that race, so the decision moves to the controller, where a unit test can.

  1. **The failing test.** In `tests/controller.test.mjs`, after the gate test, add:

```js
test("guardSubmit: a Submit pressed on a stale page with an alert reveals it and goes to 9.1, sending nothing", async () => {
  const { controller, store } = await openV2(completeV2());
  await controller.goToSubstep("review.summary");
  await controller.moveSubstep(1);
  controller.togglePanel("confirmed");
  assert.equal(controller.currentSubstep(), "review.submit");
  // A clean draft passes, and the guard moves nothing.
  assert.equal(await controller.guardSubmit(), true);
  assert.equal(controller.currentSubstep(), "review.submit");
  // The draft changes under a page already drawn: an invalid email and no city.
  controller.editAnswers({ email: "a@", addr_city: null });
  assert.equal(await controller.guardSubmit(), false);
  assert.equal(controller.getState().formSubstep, "review.check");
  assert.ok(controller.getState().revealed.includes("email"), "the invalid email was not revealed");
  const record = store.records.get("case-v2");
  assert.equal(record.stage, "draft", "the guard submitted");
  assert.notEqual(record.answers.email, "a@", "an invalid email reached the server");
  controller.stop();
});
```

     Run `node --test tests/controller.test.mjs` with the PATH prefix. Expected: FAIL, because `controller.guardSubmit` is not a function.

  2. **The controller.** In `src/controller.mjs`, after `revealInvalid`, add the function below, and add `guardSubmit` to the exported API list next to `revealInvalid`. Import `reviewAlerts` from `./intake-form.mjs`.

```js
  // The Submit guard (spec 2026-09-30 §2.5: nothing missing or invalid is
  // ever submitted). Submit's disabled state is drawn at render, and a press
  // can land on a page drawn before the draft changed (a refresh held back
  // while the pointer was down), so the press checks the draft again, with
  // the review gate's own list (reviewAlerts). With an alert it reveals every
  // invalid answer and goes to review.check, whose list says what to fix, and
  // returns false: don't submit.
  async function guardSubmit() {
    const draft = state.draftAnswers ?? {};
    if (reviewAlerts(draft).length === 0) return true;
    for (const id of invalidAnswers(null, draft)) revealInvalid(id);
    await goToSubstep("review.check");
    return false;
  }
```

     `revealInvalid` only records the id and persists. It doesn't redraw, so the app's `quiet` flag isn't needed around it any more.

  3. **The app.** In `src/app.mjs`, in the `if (type === "SUBMIT" && state.savedCase) { … }` block, keep `sweepV2Form();` and its comment. Replace everything from the comment `// Submit's disabled state is drawn at render…` through the `return; }` of the failing branch with:

```js
      // Submit's disabled state is drawn at render, and a press can land on a
      // page drawn before the draft changed, so the controller checks the
      // draft again (guardSubmit). Refused, it has revealed every invalid
      // answer and gone to review.check: the toast says why, and the keyboard
      // goes to the alerts heading.
      if (!(await controller.guardSubmit())) {
        notify(t("toast.needs_change", {}, screenLang()), by);
        focusV2Arrival();
        return;
      }
```

     The line `if (controller.getState().dirty && !(await controller.saveAnswers())) return;` after it stays.
     - The old condition's third clause, `!…openPanels.includes("confirmed")`, is dropped. The `toast.confirm_first` branch just above already returns when the box is unticked, and `sweepV2Form` never changes `openPanels`, so that clause could never be the one that fired.
     - Then remove `invalidAnswers` (from the `./intake-form.mjs` import) and `missingToSubmit` (from the `./intake-catalogue.mjs` import) from `src/app.mjs`. That guard was their only use; confirm with `grep -n "invalidAnswers\|missingToSubmit" src/app.mjs`.

  4. **Pin the wiring.** In `tests/shell.test.mjs`, at the end of `app.mjs handles every version-2 action…`, add:

```js
  // The Submit guard's decision is the controller's (guardSubmit, design D5):
  // app.mjs shows the toast and moves the keyboard, and checks nothing itself.
  const guard = app.slice(app.indexOf('if (type === "SUBMIT" && state.savedCase)'), app.indexOf('if (type === "RESPOND_DOCUMENT"'));
  assert.ok(guard.length > 0, "the SUBMIT block");
  assert.match(guard, /sweepV2Form\(\);[\s\S]*if \(!\(await controller\.guardSubmit\(\)\)\) \{[\s\S]*toast\.needs_change[\s\S]*focusV2Arrival\(\);[\s\S]*return;/);
  assert.doesNotMatch(guard, /invalidAnswers|missingToSubmit/);
```

     Run `node --test tests/controller.test.mjs` and then `node --test tests/shell.test.mjs`, each with the PATH prefix. Expected: PASS.

- [ ] **Step 10: Update the tests that reached a gated page**

  1. `tests/client-views.test.mjs`, `Back, Continue and Back to summary`: render 9.3 as an earned page:

     ```js
     const submit = intakeScreen(v2State({ formSubstep: "review.submit", visitedSubsteps: ["review.submit"] }));
     ```

  2. `tests/client-views.test.mjs`, `while an action is in flight…`: replace the page `{ formSubstep: "review.submit", draftAnswers }` with `{ formSubstep: "review.submit", visitedSubsteps: ["review.submit"] }`. The `review.check` page with `draftAnswers` still covers alerts.

  3. `tests/client-views.test.mjs`, `review.submit: Submit waits for no alerts and the confirmation`:
     - make `const clean = { formSubstep: "review.submit", visitedSubsteps: ["review.submit"] };`;
     - replace the `missing` and `invalid` blocks (from the comment `// Any alert keeps it disabled…` to the `invalid` assertion) with:

     ```js
       // With an alert there is no Submit page: 9.3 resolves to 9.1, whose
       // Continue waits (the gate). Submit's own rule stays for a stale page.
       for (const draftAnswers of [without(sample(), "tp_first_name"), { ...sample(), email: "a@" }]) {
         const html = intakeScreen(v2State({ ...clean, openPanels: ["confirmed"], draftAnswers }));
         assert.match(html, /id="intake-v2-form"[^>]*data-substep="review\.check"/);
         assert.doesNotMatch(html, /data-case-action="SUBMIT"/);
       }
     ```

  4. `tests/client-language.test.mjs`:
     - The sweep's visits include the earned 9.3:

       ```js
       const ALL_VISIBLE = visibleSubsteps(intakeAnswers(), cardsFor(intakeAnswers(), []), ["review.submit"]);
       ```

     - Two states no longer render what their names say. Replace them:
       - **`"review: the summary with nothing answered in a part"`:** use `intakeAnswers()` with every answer of `optional.questions` deleted. That sub-step has six questions, none required, so emptying it leaves no alerts.
         - Build the draft by deleting each id in `substepQuestions("optional.questions")`. Import `substepQuestions` from `../src/intake-catalogue.mjs` if it isn't imported yet.
         - Assert that `reviewAlerts` of that draft is `[]`, because the summary only shows with no alerts. Add an assertion in the sweep, or right after the states, that this state's page holds `summary.none`'s 简体 text (尚未回答任何问题。).
       - **`"review: submit with alerts"`:** becomes `"review: submit": intakeState({ formSubstep: "review.submit" })`.

  Then run `npm test`. Each remaining failure is a test that reaches 9.2 or 9.3 with alerts or without the earned visit. Fix it by seeding `visitedSubsteps: ["review.submit"]` or a complete draft (the sample answers, or `completeV2()`). Never weaken an assertion. List each one you change in your report.

- [ ] **Step 11: Run the whole unit suite**

  Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`

  Expected: PASS, with the count up by the new tests.

- [ ] **Step 12: Commit**

  ```bash
  git add src/intake-form.mjs src/controller.mjs src/intake-views.mjs src/app.mjs tests/intake-form.test.mjs tests/controller.test.mjs tests/client-views.test.mjs tests/client-language.test.mjs tests/shell.test.mjs
  ```

  ```bash
  git commit -m "Gate the review step: 9.2 needs no alerts, 9.3 needs Continue on 9.2

  OpenSpec change gate-review-and-redesign-summary, design D1-D3, D5 (guardSubmit).

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 2: 9.1's disabled Continue, and 9.3 without its alert notice

**Files:**
- Modify: `src/intake-views.mjs` (`actions` around line 242, `submitBody` around line 536, and its caller in `intakeFormV2`)
- Modify: `src/client-text.mjs:349-350` (remove two keys), and add `review.continue_blocked` after `review.empty` (line 311)
- Modify: `src/styles.css` (after the `.form-actions .btn.text` rule, around line 762; and the phone block near line 1780)
- Generated: `src/zh-hant.mjs`
- Test: `tests/client-views.test.mjs`

**Interfaces:**
- Consumes: Task 1's `alertsOf` (`{ id, kind, flag, substep }` items) and the gate.
- Produces:
  - `#continue-blocked`, `class="form-blocked"`;
  - `submitBody(view)`, which takes one argument.

- [ ] **Step 1: Write the failing tests in `tests/client-views.test.mjs`**

  After the review.check tests (around line 1087), add:

```js
test("review.check: Continue waits for the alerts, and a line next to it says why", () => {
  const blocked = form({ formSubstep: "review.check", draftAnswers: without(sample(), "addr_city") });
  assert.match(
    blocked,
    /<p id="continue-blocked" class="form-blocked">Fix the items above to continue\.<\/p><button type="submit" class="btn primary" aria-describedby="continue-blocked" disabled>Continue/,
  );
  const invalid = form({ formSubstep: "review.check", draftAnswers: { ...sample(), email: "a@" } });
  assert.match(invalid, /aria-describedby="continue-blocked" disabled>/);
  // Open documents never block: the sample's Needed cards are Not done.
  assert.ok(cardsFor(sample(), []).some((card) => card.group === "needed" && card.status === "not_done"));
  const open = form({ formSubstep: "review.check" });
  assert.match(open, /<button type="submit" class="btn primary">Continue/);
  assert.doesNotMatch(open, /continue-blocked/);
  // Other parts never draw the line, even with an alert.
  assert.doesNotMatch(form({ formSubstep: "about.you", draftAnswers: without(sample(), "addr_city") }), /continue-blocked/);
  // In Chinese.
  assert.match(
    form({ formSubstep: "review.check", draftAnswers: without(sample(), "addr_city"), lang: "zh-Hans" }),
    /<p id="continue-blocked" class="form-blocked">请先修正上面的问题，然后继续。<\/p>/,
  );
});

test("the rail and the count follow the review gate", () => {
  const reviewRail = (html) =>
    [...html.matchAll(/class="rail-sublink" data-action="go-substep" data-substep="(review\.[a-z]+)"/g)].map((match) => match[1]);
  const count = (html) => Number(/<p>Part \d+ of (\d+)<\/p>/.exec(html)[1]);
  const clean = intakeScreen(v2State({ formSubstep: "review.check" }));
  assert.deepEqual(reviewRail(clean), ["review.check", "review.summary"]);
  const earned = intakeScreen(v2State({ formSubstep: "review.check", visitedSubsteps: ["review.submit"] }));
  assert.deepEqual(reviewRail(earned), ["review.check", "review.summary", "review.submit"]);
  assert.equal(count(earned), count(clean) + 1);
  // An alert after 9.3 was earned: both hide, and the page is 9.1.
  const alert = intakeScreen(
    v2State({ formSubstep: "review.submit", visitedSubsteps: ["review.submit"], draftAnswers: without(sample(), "addr_city") }),
  );
  assert.deepEqual(reviewRail(alert), ["review.check"]);
  assert.match(alert, /id="intake-v2-form"[^>]*data-substep="review\.check"/);
  assert.equal(count(alert), count(clean) - 1);
});
```

  In `review.submit: Submit waits for no alerts and the confirmation`, add after the first `clean` render:

```js
  // 9.3 is never drawn with an alert, so it has no alert notice.
  assert.doesNotMatch(html, /See the alerts/);
```

- [ ] **Step 2: Run them and see them fail**

  Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/client-views.test.mjs`

  Expected: FAIL in the review.check test. `continue-blocked` doesn't exist yet.

- [ ] **Step 3: Add and remove the text keys in `src/client-text.mjs`**

  After `"review.empty"` (line 311), add:

```js
  "review.continue_blocked": { en: "Fix the items above to continue.", zh: "请先修正上面的问题，然后继续。" },
```

  Delete the `"submit.attention"` and `"submit.see_alerts"` lines.

- [ ] **Step 4: Draw the disabled Continue and drop 9.3's notice (`src/intake-views.mjs`)**

  In `actions`, replace the final `else` branch with:

```js
  } else {
    // 9.1's Continue waits for the alerts, and the line says why
    // (openspec change gate-review-and-redesign-summary, design D4).
    const blocked = current === "review.check" && alerts.length > 0;
    primary = `${when(blocked, `<p id="continue-blocked" class="form-blocked">${say("review.continue_blocked")}</p>`)}<button type="submit" class="btn primary"${blocked ? ' aria-describedby="continue-blocked"' : ""}${off || blocked ? " disabled" : ""}>${say("intake.continue")} ${icon("arrow")}</button>`;
  }
```

  Replace `submitBody` with:

```js
function submitBody(view) {
  const say = (key) => esc(t(key, {}, view.lang));
  const confirmed = view.openPanels.includes("confirmed");
  return `<label class="checkbox-row" for="field-confirmed"><input type="checkbox" id="field-confirmed" name="confirmed" ${confirmed ? "checked" : ""}><span>${say("submit.confirm")}</span></label><p class="field-note">${say("submit.note")}</p>`;
}
```

  In `intakeFormV2`, call `submitBody(view)`.

- [ ] **Step 5: Add the styles (`src/styles.css`)**

  After the `.form-actions .btn.text` rule (around line 762), add:

```css
/* 9.1's line beside its disabled Continue (gate-review-and-redesign-summary). */
.form-blocked {
  margin: 0 0 0 auto;
  font-size: 14px;
  color: var(--vt-intake-hint);
  text-align: right;
}
```

  In the phone block that holds `.form-actions > .btn` (around line 1780), add:

```css
  .form-blocked {
    font-size: 12px;
  }
```

- [ ] **Step 6: Regenerate 繁體 and run the unit suite**

  Run, one at a time:
  1. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm run build:hant`
  2. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm run build:hant -- --check`
  3. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`

  Expected: the check is clean, and the unit tests PASS. If a test still names `submit.attention` or `submit.see_alerts`, remove that use: those keys are gone on purpose (design D5).

- [ ] **Step 7: Commit**

  ```bash
  git add src/intake-views.mjs src/client-text.mjs src/zh-hant.mjs src/styles.css tests/client-views.test.mjs
  ```

  Also stage, by name, any other test file you changed in step 6.

  ```bash
  git commit -m "Disable 9.1's Continue while an alert remains; drop 9.3's alert notice

  OpenSpec change gate-review-and-redesign-summary, design D4, D5.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 3: The summary page

Its intro, its tools first, Expand all and Collapse all, collapsible sections, and print.

**Files:**
- Modify: `src/intake-views.mjs`: `answerSteps` (around line 453), `documentsSummary` (around line 476), `summaryBody` (around line 529), and a new `summarySection`
- Modify: `src/controller.mjs`: a new `setSummaryShut` next to `setRailExpanded` (around line 1710), and the export list (around line 2324)
- Modify: `src/app.mjs`: `V2_PANELS` (line 756), and two new cases next to `case "toggle-panel":` (around line 1374)
- Modify: `src/client-text.mjs`: six `summary.*` keys after `summary.date` (line 319)
- Modify: `src/styles.css`: summary rules near `.summary-tools` (around line 4518), and the print block (around line 4598)
- Generated: `src/zh-hant.mjs`
- Test: `tests/client-views.test.mjs`, `tests/controller.test.mjs`, `tests/shell.test.mjs`

**Interfaces:**
- Consumes: Task 1's `formView` (`view.openPanels`, `view.visible`).
- Produces:
  - `controller.setSummaryShut(stepIds: string[])`;
  - the actions `summary-expand-all` and `summary-collapse-all`;
  - the panel name `summary-shut:<step id>`;
  - the ids `#summary-expand-all`, `#summary-collapse-all`, `#summary-toggle-<step id>` and `#summary-body-<step id>`.

  Task 4's story uses all of these.

- [ ] **Step 1: Write the failing view tests in `tests/client-views.test.mjs`**

  Replace the test `review.summary: everything the printout shows sits in one block, with Change links and the cards` with the three tests below.

  The first test keeps every check of the old one, on the new layout. Copy the old assertions on `printed` and `toolbox` that the block below doesn't repeat: Philadelphia, marital status, no `about.spouse`, no `review.` links, the cards, and all four toolbox matches.

```js
const summaryPage = (overrides = {}) =>
  form({ formSubstep: "review.summary", savedCase: v2Case({ documentCards: [{ slotId: "w2.household", status: "later" }] }), ...overrides });

test("review.summary: the intro, then the tools, then Expand and Collapse all, then the printed block", () => {
  const html = summaryPage();
  const [intro, tools, fold, start, end] = [
    '<div class="summary-intro">', '<div class="summary-tools">', '<div class="summary-fold">', '<div class="summary-print">', '<div class="form-actions">',
  ].map((needle) => html.indexOf(needle));
  assert.ok(intro >= 0 && intro < tools && tools < fold && fold < start && start < end, "the order");
  assert.equal(
    html.slice(intro, tools),
    '<div class="summary-intro"><p>Here is a summary of everything you told us in your application.</p><p>Before you submit, make sure you have answered everything that applies to you. To change an answer, choose <strong>Change</strong> next to that part, or choose that part in the list of steps.</p><p>With the buttons below, you can print this summary, or view and download a draft Form 13614-C made from your answers.</p></div>',
  );
  assert.equal(
    html.slice(fold, start),
    '<div class="summary-fold"><button type="button" id="summary-expand-all" class="btn text" data-action="summary-expand-all">Expand all</button><button type="button" id="summary-collapse-all" class="btn text" data-action="summary-collapse-all">Collapse all</button></div>',
  );
  const toolbox = html.slice(tools, fold);
  assert.match(toolbox, /data-action="print-summary"[^>]*>[\s\S]*?Print<\/button>/);
  assert.match(toolbox, /<p id="draft-ready" class="draft-ready" aria-live="polite"><\/p>/);
  const printed = html.slice(start, end);
  assert.match(printed, /VT-GJPY-JAY9/);
  assert.match(printed, /October 4, 2026/);
  // Each step's heading is its toggle; every section starts expanded.
  assert.ok(
    printed.includes(
      `<section class="summary-step"><h2 class="summary-step-head"><button type="button" id="summary-toggle-about" class="summary-toggle" data-action="toggle-panel" data-panel="summary-shut:about" aria-expanded="true" aria-controls="summary-body-about" aria-label="Show or hide About you">${icon("expand")}<span>About you</span></button></h2><div id="summary-body-about" class="summary-body">`,
    ),
  );
  assert.doesNotMatch(printed, /aria-expanded="false"|class="summary-body" hidden/);
  assert.match(printed, /<div class="summary-sub"><div class="summary-sub-head"><h3>Mailing address<\/h3><button type="button" class="inline" data-action="change-substep" data-substep="about\.address">Change<\/button><\/div>/);
  assert.match(printed, /<section class="summary-step summary-documents"><h2 class="summary-step-head"><button[^>]*data-panel="summary-shut:documents"/);
});

test("review.summary: a section folds from its heading, and Expand or Collapse all sets them all", () => {
  const shut = summaryPage({ openPanels: ["summary-shut:about", "summary-shut:documents"] });
  assert.match(shut, /data-panel="summary-shut:about" aria-expanded="false" aria-controls="summary-body-about"/);
  assert.match(shut, /<div id="summary-body-about" class="summary-body" hidden>/);
  assert.match(shut, /<div id="summary-body-household" class="summary-body">/);
  assert.match(shut, /data-panel="summary-shut:documents" aria-expanded="false"/);
  // Same-day: the bring list is the documents section.
  const sameDay = form({
    formSubstep: "review.summary",
    draftAnswers: { ...sample(), service: "same_day" },
    openPanels: ["summary-shut:documents"],
  });
  assert.match(sameDay, /<div id="summary-body-documents" class="summary-body" hidden><ul class="bring-list">/);
  // Busy: folding sends nothing, so it stays live.
  for (const tag of summaryPage({ busy: true }).match(/<button[^>]*(?:summary-toggle|summary-expand-all|summary-collapse-all)[^>]*>/g))
    assert.doesNotMatch(tag, /\sdisabled/, tag);
  // The submitted page's answers don't fold.
  assert.doesNotMatch(
    submittedV2(v2State({ savedCase: v2Case({ stage: "received", answers: sample() }) })),
    /summary-toggle|summary-fold/,
  );
});

test("review.summary in Chinese: the intro names its controls, and the buttons read 全部展开 and 全部收起", () => {
  const html = summaryPage({ lang: "zh-Hans" });
  assert.ok(html.includes("<p>提交之前，请确认所有适用于您的问题都已回答。如需修改，请点击相应部分旁边的“修改”，或在步骤列表中选择该部分。</p>"));
  assert.match(html, /data-action="summary-expand-all">全部展开<\/button>/);
  assert.match(html, /data-action="summary-collapse-all">全部收起<\/button>/);
  assert.match(html, /data-panel="summary-shut:about" aria-expanded="true" aria-controls="summary-body-about" aria-label="显示或隐藏[^"]+"/);
});
```

  Add `submittedV2` to the import from `../src/intake-views.mjs`. If `submittedV2` takes different arguments, read it at `src/intake-views.mjs:575` and match them.

  If the Chinese step title for `about` has characters `esc` changes, the `aria-label` regex above still holds, because it doesn't spell out the title.

- [ ] **Step 2: Write the failing controller and shell tests**

  In `tests/controller.test.mjs`, after `a rail step collapses and expands in one change each`, add:

```js
test("Expand all and Collapse all set every summary section in one change", async () => {
  const { controller, renders } = await openV2({ answers: { tp_first_name: "Mei" } });
  controller.togglePanel("rail-open:about");
  controller.togglePanel("summary-shut:about");
  let before = renders.count;
  controller.setSummaryShut(["about", "income", "documents"]);
  assert.equal(renders.count, before + 1);
  assert.deepEqual(controller.getState().openPanels, [
    "rail-open:about", "summary-shut:about", "summary-shut:income", "summary-shut:documents",
  ]);
  before = renders.count;
  controller.setSummaryShut([]);
  assert.equal(renders.count, before + 1);
  assert.deepEqual(controller.getState().openPanels, ["rail-open:about"]);
  controller.stop();
});
```

  In `tests/shell.test.mjs`, in `app.mjs handles every version-2 action…`, add `"summary-expand-all"` and `"summary-collapse-all"` to the listed actions. Before that test's end, add:

```js
  // A summary section is a panel; nothing else new is (design D7).
  const V2_PANELS = Function(`return ${/const V2_PANELS = (\/[^\n]+\/);/.exec(app)[1]}`)();
  for (const name of ["rail-all", "maybe:documents.identity", "summary-shut:about", "summary-shut:documents"])
    assert.ok(V2_PANELS.test(name), name);
  for (const name of ["summary-shut:", "summary-shut:about.you", "confirmed", "rail-open:about"])
    assert.equal(V2_PANELS.test(name), false, name);
```

  In the test that pins the print block (around line 555), add:

```js
  // Every section prints, collapsed or not; the toggles print as headings.
  assert.match(print[1], /\.summary-print \.summary-body\[hidden\]\s*\{\s*display:\s*block;\s*\}/);
  assert.match(print[1], /\.summary-toggle \.icon\s*\{\s*display:\s*none;\s*\}/);
```

- [ ] **Step 3: Run them and see them fail**

  Run, one at a time:
  1. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/client-views.test.mjs`
  2. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/controller.test.mjs`
  3. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/shell.test.mjs`

  Expected: FAIL in the new summary, `setSummaryShut`, panel and print assertions.

- [ ] **Step 4: Add the text keys (`src/client-text.mjs`)**

  After `"summary.date"` (line 319), add the lines below. Every entry in this file is one line, so keep these one line each. The Chinese quotes are U+201C and U+201D.

```js
  // The summary page's intro (gate-review-and-redesign-summary, design D6): {change} is summary.change
  "summary.intro_all": { en: "Here is a summary of everything you told us in your application.", zh: "以下是您在申请中填写的全部信息。" },
  "summary.intro_change": { en: "Before you submit, make sure you have answered everything that applies to you. To change an answer, choose **{change}** next to that part, or choose that part in the list of steps.", zh: "提交之前，请确认所有适用于您的问题都已回答。如需修改，请点击相应部分旁边的“{change}”，或在步骤列表中选择该部分。" },
  "summary.intro_tools": { en: "With the buttons below, you can print this summary, or view and download a draft Form 13614-C made from your answers.", zh: "您可以用下方的按钮打印这份汇总，或查看并下载根据您的回答生成的 13614-C 草稿。" },
  "summary.expand_all": { en: "Expand all", zh: "全部展开" },
  "summary.collapse_all": { en: "Collapse all", zh: "全部收起" },
  "summary.toggle": { en: "Show or hide {section}", zh: "显示或隐藏{section}" },
```

- [ ] **Step 5: Build the summary page (`src/intake-views.mjs`)**

  Above `answerSteps`, add:

```js
// One summary section (design D7): the step's heading is its toggle, and its
// body is hidden while `summary-shut:<step id>` is in openPanels. The toggle's
// id lets any redraw put the keyboard back on it (ui.mjs restores by id first). Print shows
// every body (styles.css), so folding changes only the screen.
function summarySection(stepId, title, inner, { panels = [], lang = "en", extraClass = "" } = {}) {
  const shut = panels.includes(`summary-shut:${stepId}`);
  const id = esc(stepId);
  return `<section class="summary-step${extraClass}"><h2 class="summary-step-head"><button type="button" id="summary-toggle-${id}" class="summary-toggle" data-action="toggle-panel" data-panel="summary-shut:${id}" aria-expanded="${!shut}" aria-controls="summary-body-${id}" aria-label="${esc(t("summary.toggle", { section: title }, lang))}">${icon("expand")}<span>${esc(title)}</span></button></h2><div id="summary-body-${id}" class="summary-body"${shut ? " hidden" : ""}>${inner}</div></section>`;
}
```

  `answerSteps(answers, variant, { change, off = "", lang = "en", panels = [] })`:
  - takes `panels`;
  - only the `change` branch folds;
  - the step's return becomes:

```js
    if (!subs) return "";
    return change
      ? summarySection(step.id, stepTitle(step, lang), subs, { panels, lang })
      : `<section class="${stepClass}"><h2>${esc(stepTitle(step, lang))}</h2>${subs}</section>`;
```

  In `documentsSummary`, both returns use `summarySection("documents", <title>, <inner>, { panels: view.openPanels, lang, extraClass: " summary-documents" })`:
  - **same-day:** title `t("doc.bring", {}, lang)`, inner `bringList(view.cards, lang)`;
  - **otherwise:** title `stepTitle(step, lang)`, inner `subs`, and an empty `subs` still returns `""`.

  Replace `summaryBody` with:

```js
// The summary page (gate-review-and-redesign-summary, design D6-D8): the
// intro, then Print and the draft buttons, then Expand all and Collapse all,
// then the printed block. Only `.summary-print` prints, every section open.
function summaryBody(view, today) {
  const { lang } = view;
  const say = (key, params) => t(key, params, lang);
  const intro = `<div class="summary-intro">${renderRichText(say("summary.intro_all"))}${renderRichText(say("summary.intro_change", { change: say("summary.change") }))}${renderRichText(say("summary.intro_tools"))}</div>`;
  const tools = `<div class="summary-tools">${button(`${icon("print")} ${esc(say("doc.print"))}`, "print-summary", "secondary")}${draftButtons(lang)}<p id="draft-ready" class="draft-ready" aria-live="polite"></p></div>`;
  const fold = `<div class="summary-fold"><button type="button" id="summary-expand-all" class="btn text" data-action="summary-expand-all">${esc(say("summary.expand_all"))}</button><button type="button" id="summary-collapse-all" class="btn text" data-action="summary-collapse-all">${esc(say("summary.collapse_all"))}</button></div>`;
  const printed = `<div class="summary-print"><div class="summary-meta">${row(say("id.application"), view.record?.reference)}${row(say("summary.date"), formatToday(today, lang))}</div>${answerSteps(view.answers, view.variant, { change: true, off: view.off, lang, panels: view.openPanels })}${documentsSummary(view)}</div>`;
  return intro + tools + fold + printed;
}
```

  `renderRichText` returns `<p>…</p>` for one paragraph, with `**…**` as `<strong>`, and escapes the rest. Check the exact strings the step 1 test expects against its output.

- [ ] **Step 6: Add `setSummaryShut` (`src/controller.mjs`)**

  After `setRailExpanded`, add the function below, and add `setSummaryShut` to the exported API list next to `setRailExpanded`.

```js
  // The summary's Expand all and Collapse all, in one change to `openPanels`:
  // a section is collapsed while `summary-shut:<step id>` is there, so this
  // replaces every such name with one per id in `stepIds` (none expands all).
  function setSummaryShut(stepIds) {
    state.openPanels = [
      ...state.openPanels.filter((name) => !name.startsWith("summary-shut:")),
      ...stepIds.map((id) => `summary-shut:${id}`),
    ];
    persistSession();
    show();
  }
```

- [ ] **Step 7: Wire the panel and the two actions (`src/app.mjs`)**

  Replace `V2_PANELS` and its comment with:

```js
  // The panels a generic `toggle-panel` control may open: the phone's "All
  // steps", a documents sub-step's Maybe needed group, and a summary section
  // (`summary-shut:<step id>`, collapsed while present). Rail steps have their
  // own action (`setRailExpanded`), and nothing else is a panel here.
  const V2_PANELS = /^(rail-all|maybe:[a-z]+\.[a-z_]+|summary-shut:[a-z]+)$/;
```

  After the `case "toggle-panel": { … }` block, in the same `switch`, add the block below. The other cases in that switch use `target` for the pressed control (`target.dataset.panel`); if the switch's own variable for the action name isn't `action`, use the name it has.

```js
      case "summary-expand-all":
      case "summary-collapse-all": {
        // Every section at once (design D7): Collapse all names the sections
        // on the page, Expand all none. The pressed button keeps the keyboard.
        const shut =
          action === "summary-collapse-all"
            ? [...root.querySelectorAll('.summary-toggle[data-panel^="summary-shut:"]')].map((toggle) =>
                toggle.dataset.panel.slice("summary-shut:".length),
              )
            : [];
        controller.setSummaryShut(shut);
        document.getElementById(target.id)?.focus();
        break;
      }
```

- [ ] **Step 8: Style the page and print it whole (`src/styles.css`)**

  After the `.draft-ready` rule (around line 4534), add:

```css
/* The summary page (gate-review-and-redesign-summary): intro, tools, fold, sections. */
.summary-intro p {
  margin: 0 0 10px;
  color: var(--vt-intake-ink);
}
.summary-intro + .summary-tools {
  margin-top: 12px;
}
.summary-fold {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin: 12px 0 8px;
}
.summary-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: var(--vt-tap);
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.summary-toggle .icon {
  width: 16px;
  height: 16px;
  flex: none;
  transition: transform 0.15s;
}
.summary-toggle[aria-expanded="false"] .icon {
  transform: rotate(-90deg);
}
.summary-body[hidden] {
  display: none;
}
```

  Inside the existing `@media print { … }` block of part 4b2 (around line 4598), before its closing `}`, add:

```css
  .summary-print .summary-body[hidden] { display: block; }
  .summary-toggle .icon { display: none; }
```

  These two rules don't need `body.print-summary`: the generic print rule at `styles.css:2010` already hides the whole app unless the Print button set that class. The existing `body.print-summary .summary-tools { display: none; }` stays. `.summary-fold` sits outside `.summary-print`, so the `visibility: hidden` rule already hides it. Keep every existing print rule unchanged.

- [ ] **Step 9: Regenerate 繁體 and run the unit suite**

  Run, one at a time:
  1. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm run build:hant`
  2. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm run build:hant -- --check`
  3. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`

  Expected: PASS. `tests/client-language.test.mjs` sweeps the summary in 简体 and 繁體, so a leak or a missing `zh` fails there. Fix the text, not the sweep.

- [ ] **Step 10: Commit**

  ```bash
  git add src/intake-views.mjs src/controller.mjs src/app.mjs src/client-text.mjs src/zh-hant.mjs src/styles.css tests/client-views.test.mjs tests/controller.test.mjs tests/shell.test.mjs
  ```

  ```bash
  git commit -m "Redesign the summary page: intro, tools first, collapsible sections that always print

  OpenSpec change gate-review-and-redesign-summary, design D6-D8.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 4: The story

**Files:**
- Modify: `tests/support/story-pages.mjs` (a new `continueToSubmit`, after `railJump` around line 686)
- Modify: `tests/browser.mjs`. The line numbers are from `main` a98f792:
  - `fillIntakeV2ToSubmit` (around line 277);
  - the walk comment (around line 2768);
  - the walk loop (around line 3001), `before.service` (around line 3050), `review.check` and `review.submit` (around line 3208), and the visits assertion (around line 3236);
  - the SUBMIT guard (around line 3389);
  - the review block (around line 3556);
  - the Chinese phase (around line 4211).

**Interfaces:**
- Consumes:
  - the ids and actions from Tasks 2 and 3: `#continue-blocked`, `#summary-expand-all`, `#summary-collapse-all`, `.summary-toggle[data-panel="summary-shut:<id>"]` and `#summary-body-<id>`;
  - the gate rules.
- Produces: `continueToSubmit(page)`.

The implementer edits the story and runs `npm test` only. **The controller runs `npm run test:browser`.**

- [ ] **Step 1: Add the helper (`tests/support/story-pages.mjs`)**

  After `railJump`, add the function below and export it. Import it where `tests/browser.mjs` imports `railJump`.

```js
/**
 * The way a client reaches the Submit page (openspec change
 * gate-review-and-redesign-summary): 9.1 on the rail, then Continue on 9.1
 * and on 9.2. The draft must have no alerts. Controls are found by selector,
 * so it works in every language.
 */
export async function continueToSubmit(page) {
  await railJump(page, "review.check");
  for (const id of ["review.summary", "review.submit"]) {
    await waitForQuiet(page);
    await page.locator('#intake-v2-form button[type="submit"]').click({ timeout: CLICK_MS });
    await waitForSubstep(page, id);
  }
}
```

- [ ] **Step 2: Use it where the story jumped straight to 9.3**

  1. `fillIntakeV2ToSubmit`: replace `await railJump(page, "review.submit");` with `await continueToSubmit(page);`, and update its doc comment: "It reaches review.submit by Continue on 9.1 and 9.2 (the gate), with the box ticked".
  2. The Chinese phase: replace `await railJump(page, "review.submit");` (before `tickBox(page, "field-confirmed")`) with `await continueToSubmit(page);`.
  3. Near line 4026: `await jump("review.submit")` stays. 9.3 was earned earlier in the same walk (step 5), and there are no alerts there.

- [ ] **Step 3: The walk stops at 9.1**

  1. Above the walk loop, add:

     ```js
     // The gate: 9.2 and 9.3 need every alert fixed, and the walk keeps a gap
     // (the city) for review.check, so Continue walks up to 9.1.
     const WALKED = V2_WALK.slice(0, V2_WALK.indexOf("review.check") + 1);
     ```

     Loop over `WALKED`: `for (let at = 0; at < WALKED.length; at += 1)`, with `const id = WALKED[at]; const next = WALKED[at + 1] ?? null;`.

  2. In `before.service`, the rail lists the walk without 9.3, which isn't earned yet:

     ```js
     V2_WALK.filter((id) => id !== "review.submit"),
     ```

  3. Replace the `review.check` and `review.submit` blocks in the loop with:

```js
          if (id === "review.check") {
            // Arriving by Continue puts the keyboard on the alerts heading.
            await waitForQuiet(page);
            assert.equal(await focused(), "alerts-title");
            // The gate: the city is missing, so Continue waits, a line says
            // why, and the review step lists 9.1 alone.
            assert.equal(await continueButton.isDisabled(), true, "Continue was on with an alert");
            assert.equal(await continueButton.getAttribute("aria-describedby"), "continue-blocked");
            assert.equal(await page.locator("#continue-blocked").innerText(), "Fix the items above to continue.");
            assert.deepEqual(await reviewRail(), ["review.check"]);
            assert.equal(
              await page.locator(".rail-progress p").innerText(),
              `Part ${WALKED.length} of ${WALKED.length}`,
            );
            // The alert is the way on: it opens its sub-step, and leaving
            // review.check saves its visit.
            await goTo(page.locator('.alert-item[data-substep="about.address"]'), "about.address");
            pressed = true;
          }
```

  4. Define `reviewRail` next to `railHere` (around line 2886):

```js
        // The review step's rail entries, in order: the gate decides 9.2 and 9.3.
        const reviewRail = () =>
          page.evaluate(() => [...document.querySelectorAll("#rail-subs-review .rail-sublink")].map((link) => link.dataset.substep));
```

  5. The visits assertion after the loop compares to `[...WALKED].sort()`, with the comment `// review.check too: its alert left it.`

  6. Update the phase's opening comment (around line 2768): "Continue walks every visible sub-step exactly once, from before.ready to review.check (the gate holds 9.2 and 9.3 until the city is fixed)".

- [ ] **Step 4: The SUBMIT-guard section (around line 3389)**

  Keep the invalid-email checks before it as they are.

  1. Replace the block from the `// The Submit guard …` comment through the `assert.equal(await answer("email"), …)` after the forced Submit with:

```js
        // The gate (design D1, D4): with an invalid email and no city, neither
        // the summary nor Submit is on the rail, and 9.1's Continue waits.
        // (9.3 can't be drawn with an alert. The SUBMIT guard's redirect, for
        // a press on a page drawn before an alert came back, is the
        // controller's guardSubmit and is unit-tested there; its unticked-box
        // refusal is checked at Submit below.)
        await jump("review.check");
        assert.deepEqual(await reviewRail(), ["review.check"]);
        assert.equal(await continueButton.isDisabled(), true, "Continue was on with two alerts");
        assert.equal(await chip(), "1 answer needs checking");
```

  2. The `// review.check lists both…` block that follows stays. It starts with `await jump("review.check")`, which is now the same page. Keep it.

  3. `forceSubmit` moves to the Submit block in step 5.

- [ ] **Step 5: The review block (around line 3556)**

  1. After `assert.deepEqual(await alertsList(), [], "an alert outlived its fix");`, replace `// Submit: on only with no alerts and the box ticked.` and the code through the second `assert.equal(await submitButton.isDisabled(), false);` with:

```js
        // With nothing wrong, Continue on 9.1 opens the summary, and the rail
        // lists it; Continue on 9.2 earns 9.3.
        assert.deepEqual(await reviewRail(), ["review.check", "review.summary"]);
        await goTo(continueButton, "review.summary");
        assert.deepEqual(await reviewRail(), ["review.check", "review.summary"], "9.3 before Continue on 9.2");
        await goTo(continueButton, "review.submit");
        assert.deepEqual(await reviewRail(), ["review.check", "review.summary", "review.submit"]);
        assert.ok(
          (await one(fixture, "select intake_visited from public.cases where id=$1", [own.id])).intake_visited.includes("review.submit"),
          "the earned 9.3 was not saved",
        );

        // Submit: on only with the box ticked. Its guard re-checks the draft
        // itself: an unticked box is refused even when Submit is turned on by
        // hand, the one way to reach that state on purpose.
        const forceSubmit = async () => {
          await waitForQuiet(page);
          await submitButton.evaluate((button) => {
            button.disabled = false;
          });
          await submitButton.click({ timeout: CLICK_MS });
        };
        assert.equal(await confirmBox.isChecked(), false);
        assert.equal(await submitButton.isDisabled(), true, "Submit was on before the box was ticked");
        await forceSubmit();
        await waitFor(
          page,
          "the unconfirmed Submit to be refused",
          () =>
            document.querySelector("#toast")?.textContent.trim() ===
            "Confirm that you have checked your answers first.",
          undefined,
          RENDER_MS,
        );
        assert.equal(await here(), "review.submit", "an unconfirmed Submit moved the form");
        assert.equal((await caseById(fixture, own.id)).stage, "draft", "an unconfirmed Submit was sent");
        await tickBox(page, "field-confirmed");
        assert.equal(await submitButton.isDisabled(), false, "Submit stayed off with nothing wrong");
        await waitForQuiet(page);
        await confirmBox.click({ timeout: CLICK_MS });
        await confirmTicked(false);
        assert.equal(await submitButton.isDisabled(), true, "Submit was on with the box unticked");
        await tickBox(page, "field-confirmed");
        assert.equal(await submitButton.isDisabled(), false);
```

     Delete the old `forceSubmit` definition from the guard section (step 4), so that it's defined only here.

  2. Replace `// The summary's Change opens a sub-step with "Back to summary".` and `await jump("review.summary");` with the summary page's checks below. The existing Change, Back to summary and Enter checks then follow unchanged.

```js
        // ---- The summary page (design D6-D8) ------------------------------
        await jump("review.summary");
        const order = await page.evaluate(() =>
          [...document.querySelectorAll("#intake-v2-form > div, #intake-v2-form > p")].map((node) => node.className || node.id),
        );
        assert.deepEqual(
          order.filter((name) => ["summary-intro", "summary-tools", "summary-fold", "summary-print"].includes(name)),
          ["summary-intro", "summary-tools", "summary-fold", "summary-print"],
          "the summary page's order",
        );
        assert.equal(
          await page.locator(".summary-intro p").first().innerText(),
          "Here is a summary of everything you told us in your application.",
        );
        // One section folds from its heading, and the keyboard stays on it.
        const aboutToggle = page.locator('.summary-toggle[data-panel="summary-shut:about"]');
        await waitForQuiet(page);
        await aboutToggle.click({ timeout: CLICK_MS });
        await waitFor(
          page,
          "About you to collapse",
          () => document.getElementById("summary-body-about")?.hidden === true,
          undefined,
          RENDER_MS,
        );
        assert.equal(await aboutToggle.getAttribute("aria-expanded"), "false");
        assert.equal(
          await page.evaluate(() => document.activeElement?.dataset.panel ?? null),
          "summary-shut:about",
        );
        // The Print button's printout shows it anyway. The press sets
        // body.print-summary and opens the print dialog, which a story can't
        // close, so the class is set by hand under print media instead.
        await page.evaluate(() => document.body.classList.add("print-summary"));
        await page.emulateMedia({ media: "print" });
        assert.deepEqual(
          await page.evaluate(() => {
            const body = document.getElementById("summary-body-about");
            return { display: getComputedStyle(body).display, shown: body.offsetHeight > 0 };
          }),
          { display: "block", shown: true },
          "a collapsed section does not print",
        );
        await page.emulateMedia({ media: "screen" });
        await page.evaluate(() => document.body.classList.remove("print-summary"));
        // Collapse all and Expand all, each keeping the keyboard.
        for (const [button, hidden] of [["summary-collapse-all", true], ["summary-expand-all", false]]) {
          await waitForQuiet(page);
          await page.locator(`#${button}`).click({ timeout: CLICK_MS });
          await waitFor(
            page,
            `every section to be ${hidden ? "collapsed" : "expanded"}`,
            (wanted) => [...document.querySelectorAll(".summary-body")].every((body) => body.hidden === wanted),
            hidden,
            RENDER_MS,
          );
          assert.equal(await focused(), button, `${button} lost the keyboard`);
        }
        // The fold is kept while moving: collapse About you, Change, come back.
        await waitForQuiet(page);
        await aboutToggle.click({ timeout: CLICK_MS });
        await waitFor(page, "About you to collapse again", () => document.getElementById("summary-body-about")?.hidden === true, undefined, RENDER_MS);
        await goTo(page.locator('.summary-print [data-action="change-substep"][data-substep="income.wages"]'), "income.wages");
        await goTo(page.locator('[data-action="back-to-summary"]'), "review.summary");
        assert.equal(await page.evaluate(() => document.getElementById("summary-body-about")?.hidden), true, "the fold was lost");
        await waitForQuiet(page);
        await aboutToggle.click({ timeout: CLICK_MS });
        await waitFor(page, "About you to expand", () => document.getElementById("summary-body-about")?.hidden === false, undefined, RENDER_MS);

        // An alert brought back from a Change: "Back to summary" lands on 9.1,
        // and 9.2 and 9.3 hide until it is fixed (brainstorm Q2-A).
        await goTo(page.locator('.summary-print [data-action="change-substep"][data-substep="about.address"]'), "about.address");
        await waitForQuiet(page);
        await box("addr_city").fill("");
        await goTo(page.locator('[data-action="back-to-summary"]'), "review.check");
        assert.deepEqual(await reviewRail(), ["review.check"]);
        await goTo(page.locator('.alert-item[data-substep="about.address"]'), "about.address");
        await waitForQuiet(page);
        await box("addr_city").fill("Philadelphia");
        await jump("review.check");
        assert.deepEqual(await reviewRail(), ["review.check", "review.summary", "review.submit"], "the fix did not bring 9.2 and 9.3 back");
        await jump("review.summary");
```

  3. The Change link checks that follow use `.summary-print [data-action="change-substep"]` inside expanded sections. They still work, because every section is expanded again.

  4. In the summary block, if the Change links' text box for `income.wages` (`inc_wages_job_count`) is inside a collapsed section, expand it first. The steps above leave every section expanded.

- [ ] **Step 6: Run the unit suite and the story's syntax check**

  Run, one at a time:
  1. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --check tests/browser.mjs`
  2. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --check tests/support/story-pages.mjs`
  3. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`

  Expected: no syntax errors, and the unit tests PASS.

  Do not run `npm run test:browser`.

- [ ] **Step 7: Commit**

  ```bash
  git add tests/browser.mjs tests/support/story-pages.mjs
  ```

  ```bash
  git commit -m "Story: walk the review gate and the new summary page

  OpenSpec change gate-review-and-redesign-summary.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

- [ ] **Step 8 (controller): Run the story**

  Run `npm run test:browser` in the background with the PATH prefix. Expected: every check passes (57/57 on `main`).

  If it fails:
  - read the failing check's message and screenshot;
  - send the fix to the implementer with the evidence;
  - rerun.

  A flaky check that passes on a rerun is recorded in the ledger with both runs.

---

### Task 5: Docs and the full check

**Files:**
- Modify: `docs/developer/frontend.md` (the state table row at line 93, the API list at line 102, and the form section around line 207)
- Modify: `docs/developer/README.md:105`, `docs/developer/frontend.md:447` and `docs/setup.md:409` (the unit counts)

**Interfaces:**
- Consumes: the final unit count from `npm test`.

- [ ] **Step 1: Describe the gate and the summary in `docs/developer/frontend.md`**

  1. In the API list, add `setSummaryShut` after `setRailExpanded`, and `guardSubmit` after `revealInvalid`.

  2. In the form section, after the bullet that ends "Review's alerts and the Submit gate count every visible invalid answer.", add:

```markdown
- **The review gate** (openspec change `gate-review-and-redesign-summary`):
  - `reviewAlerts(answers)` is every missing and invalid answer. 9.1 lists them, and while there is one, 9.1's Continue is disabled.
  - 9.2 is visible only with no alerts. 9.3 is visible only with no alerts and once `review.submit` is among the visits, which only Continue on 9.2 adds (`moveSubstep`).
  - `visibleSubsteps`, `resolveSubstep` and `adjacentSubstep` take the visits, so a gated place resolves to 9.1.
  - The summary's sections fold through `openPanels` names `summary-shut:<step id>` (`setSummaryShut` for Expand and Collapse all), and print open.
  - Submit's guard is `guardSubmit()`: a press on a page drawn before an alert came back reveals the invalid answers and goes to 9.1, and nothing is submitted.
```

  3. In the state table row for `formSubstep, visitedSubsteps, …`, change "the sub-steps left at least once" to "the sub-steps left at least once, plus `review.submit` once Continue on 9.2 has earned it".

- [ ] **Step 2: Update the unit counts**

  Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`

  Expected total: **932**. That is 923 on `main` plus 9 new tests:
  - Task 1: 2 in `intake-form`, 2 in `controller` (the gate and `guardSubmit`);
  - Task 2: 2 in `client-views`;
  - Task 3: 1 in `controller`, and in `client-views` 3 that replace 1, so 2 more.

  If the total isn't 932, find out why before you change the docs, and say why in your report. Then replace 923 with it in the three places:
  - `docs/developer/README.md:105`;
  - `docs/developer/frontend.md:447`;
  - `docs/setup.md:409`, which shows it twice as `923/923`.

- [ ] **Step 3: The full check**

  Run, one at a time:
  1. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
  2. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm run build:hant -- --check`
  3. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm run build:intake`, then `git status --short`, which must show no change under `src/` or `supabase/`.
  4. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npx openspec validate --all`

  Expected: everything passes, and the build leaves nothing to commit.

- [ ] **Step 4: Commit**

  ```bash
  git add docs/developer/frontend.md docs/developer/README.md docs/setup.md
  ```

  ```bash
  git commit -m "Docs: the review gate and the summary's sections

  OpenSpec change gate-review-and-redesign-summary.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

## Self-review

**Spec coverage** (`specs/client-intake/spec.md`):

| Requirement | Where |
|---|---|
| 9.1's Continue waits for the alerts | Task 2 unit tests (blocked, invalid, open documents, Chinese); Task 4 step 3 |
| 9.2 and 9.3 appear only after the alerts are fixed | Task 1 unit and controller tests, including the saved visit, Change and rail jumps not earning 9.3, an alert returning, Back to summary, the fix, and a Submit on a stale page (`guardSubmit`, with the wiring pinned in `shell.test.mjs`); Task 2 rail and count; Task 4 steps 3–5 |
| The summary explains itself and puts its tools first | Task 3 order and intro tests, in English and Chinese; Task 4 step 5 |
| Each summary section can collapse | Task 3 toggle tests, `setSummaryShut` and the panel names; Task 4 step 5 (keyboard, Collapse and Expand all, kept while moving) |
| The printed summary shows every section | Task 3 print CSS pins; Task 4 step 5 (`emulateMedia("print")`) |

**Placeholder scan:** none.

**Type consistency:**
- `reviewAlerts` → `{ id, kind }`, used by `alertsOf` (Task 1) and the gate.
- `visibleSubsteps`, `resolveSubstep` and `adjacentSubstep` all take `visited` last.
- `setSummaryShut(stepIds)` appears in Tasks 3, 4 and 5.
- `summary-expand-all` and `summary-collapse-all` are the action names and also the button ids.
- `summary-shut:<step id>`, `#summary-body-<step id>` and `#continue-blocked` are the same everywhere.

**Checks this change needs** (CLAUDE.md, Verification):
- `npm test`;
- `npm run build:hant -- --check`;
- `npm run test:browser`, because the change is something a browser shows;
- CI's `build:intake` and `openspec validate`.

`test:database` and `test:auth-browser` aren't needed: nothing in the database or sign-in changes.
