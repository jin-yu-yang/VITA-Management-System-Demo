# Unify Empty States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every list's empty state comes from one of two helpers in `src/ui.mjs`: `emptyState` for panels and `emptyLine` for case sections. The markup stays identical, except that the case pool gets a folder icon and a correct unfiltered sentence, and the Log a call drawer's line becomes muted.

**Architecture:**
- Two pure string helpers go next to #75's `loadingLine` / `unloadedLine`.
- Each list keeps its own wording and its own ready-made undo buttons, and passes them in.
- A golden fixture, captured from the code before any view changes, proves the markup is unchanged for every list but the two intended exceptions.

**Tech Stack:** plain ES modules; `node --test` unit tests (no DOM: view functions return HTML strings); Playwright browser story (`tests/browser.mjs`).

**Spec:** `openspec/changes/unify-empty-states/specs/screen-states/spec.md`. Design: `openspec/changes/unify-empty-states/design.md` (D1–D5).

## Global Constraints

- Every list's empty markup stays byte-identical, except:
  - the case pool: folder icon; "No cases yet this season." unfiltered, "No case matches these filters." filtered;
  - the Log a call drawer's line: `<p>` → `<p class="muted">`.
- Words, actions and their `data-*` values do not change. The queue's buttons stay `button("Show every task", "set-board-filter", "secondary", 'data-filter="officeKind" data-value="all"')` and `button("Show all languages", "set-board-filter", "secondary", 'data-filter="language" data-value="all"')`; the board's stays `button("Clear filters", "clear-board-filters", "secondary")`.
- The `.empty-state` class stays on every panel empty state. The story selects `.office-queue .empty-state [data-action="set-board-filter"]`.
- In the case sections, change only the empty-branch expression. Do not touch the surrounding markup, history lines, "Your next step", tab logic, or the shape of `EMPTY_TAB`. Jinyu's lifecycle change edits those areas.
- No client text changes: `src/client-text.mjs` and `src/zh-hant.mjs` are untouched. `npm run build:hant -- --check` must report nothing to do.
- Staff screens stay English. Fictional data only.
- Do not touch `docs/superpowers/`. Never commit `.superpowers/`.
- Commit messages end with `Co-Authored-By: <the model that wrote the commit> <noreply@anthropic.com>`.
- The browser suite runs once, by the controller. A failure at a step this change doesn't touch is recorded, not retried.

## Review Focus

1. **A list that is loading or failed must not show its empty state.** The helpers must not change #75's ordering. Pinned by the existing `tests/staff-views.test.mjs:1941-1945`, `tests/office-views.test.mjs:803-809`, `tests/pool-views.test.mjs:250-253` and `tests/client-views.test.mjs:1710`, which must stay unchanged and green (Task 3 runs them). The pool lines at `:250-253` don't assert the wording that changes.
2. **The queue's undo buttons must keep their `data-filter` values**, or `app.mjs:1439`'s focus return and the story break. Pinned by the golden queue states (Task 1) and `tests/office-views.test.mjs:241`.
3. **A filtered pool must show Clear filters exactly once.** Pinned in Task 3 by counting `data-action="clear-pool-filters"`.
4. **The client applications panel keeps `class="panel empty-state"` in that order.** Pinned by the golden EN and 简体 states (Task 1).
5. **A state that renders the wrong branch would make the golden test meaningless.** Pinned in Task 1 by asserting that every expected sentence appears in the captured strings.

---

### Task 1: Golden markup of every list's empty state

**Files:**
- Create: `tests/empty-states.states.mjs`
- Create: `tests/fixtures/empty-states.json` (captured once, from unchanged code)
- Create: `tests/empty-states.test.mjs`

**Interfaces:**
- Consumes (unchanged code):
  - `renderStaffBoard`, `renderStaffCase`, `decorateStaffCase` (`src/staff-views.mjs`);
  - `renderFollowups` (`src/office-views.mjs`);
  - `renderAdminCase`, `attemptList` (`src/admin-views.mjs`);
  - `applicationsScreen`, `progressScreen` (`src/client-views.mjs`).
- Produces: the guard Tasks 3 and 4 must keep green. `STATES` maps a name to `[fnName, args]`.

- [ ] **Step 1: Create `tests/empty-states.states.mjs`.**
  - Reuse the shapes the existing tests use: `staffCase` in `tests/staff-views.test.mjs:69`, `page()` in `tests/office-views.test.mjs:96`, and `baseState` in `tests/client-views.test.mjs:34`, copied verbatim into this file.
  - Use a fixed `NOW = Date.parse("2026-10-01T12:00:00Z")` wherever a render accepts `now`.

```js
// The states the golden empty-state test renders (change unify-empty-states).
// Shared by the one-time capture (plan Task 1) and tests/empty-states.test.mjs,
// so both render exactly the same inputs. Fictional data only.
import { decorateStaffCase } from "../src/staff-views.mjs";

export const NOW = Date.parse("2026-10-01T12:00:00Z");
const ALEX = { id: "alex", name: "Alex", capabilities: ["prepare"] };
const MORGAN = { id: "morgan", name: "Morgan", capabilities: ["review"] };
const SAM = { id: "p-sam", name: "Sam", capabilities: ["admin", "followup", "assist", "receive_documents"] };
const PEOPLE = [ALEX, MORGAN, SAM];

// Copy `baseState` verbatim from tests/client-views.test.mjs:34 here.
const baseState = (overrides = {}) => ({ /* … verbatim … */ ...overrides });

// One case with every related list empty, in the stage where the staff and
// admin pages show their sections.
const emptyCase = decorateStaffCase(
  {
    id: "case-empty",
    reference: "VT-EMPT-Y000",
    workspaceId: "w1",
    ownerUserId: "owner-1",
    fixture: false,
    stage: "preparing",
    revision: 3,
    preparationVersion: 0,
    answers: { service: "drop_off", language: "english", tp_first_name: "Robin", tp_last_name: "Lee" },
    intakeVerified: true,
    preparerId: "alex",
    reviewerId: null,
    createdAt: "2026-09-10T15:00:00.000Z",
    updatedAt: "2026-09-12T16:30:00.000Z",
    participants: ["alex"],
    requests: [],
    documents: [],
    followups: [],
    reviews: [],
    history: [],
    internalHistory: [],
  },
  PEOPLE,
);

export const STATES = Object.freeze({
  boardAvailable: ["renderStaffBoard", [[], PEOPLE, { person: ALEX, now: NOW }]],
  boardPreparation: ["renderStaffBoard", [[], PEOPLE, { person: ALEX, filters: { status: "preparation" }, now: NOW }]],
  boardReview: ["renderStaffBoard", [[], PEOPLE, { person: MORGAN, filters: { status: "review" }, now: NOW }]],
  boardMine: ["renderStaffBoard", [[], PEOPLE, { person: MORGAN, filters: { status: "preparation", assignment: "mine" }, now: NOW }]],
  boardFiltered: ["renderStaffBoard", [[], PEOPLE, { person: ALEX, filters: { language: "Polish" }, now: NOW }]],
  boardSearched: ["renderStaffBoard", [[], PEOPLE, { person: ALEX, filters: { search: "ZZZZ" }, now: NOW }]],
  queueEmpty: ["renderFollowups", [[], [], { person: SAM, filters: {}, busy: false, now: NOW }]],
  queueKind: ["renderFollowups", [[], [], { person: SAM, filters: { officeKind: "call" }, busy: false, now: NOW }]],
  queueLanguage: ["renderFollowups", [[], [], { person: SAM, filters: { language: "Polish" }, busy: false, now: NOW }]],
  appsEn: ["applicationsScreen", [baseState({ cases: [] })]],
  appsZh: ["applicationsScreen", [baseState({ cases: [], lang: "zh-Hans" })]],
  progressNoHistory: ["progressScreen", [baseState({ screen: "progress", cases: [emptyCase], selectedCaseId: emptyCase.id, savedCase: emptyCase })]],
  staffCase: ["renderStaffCase", [emptyCase, ALEX, { now: NOW }]],
  adminCase: ["renderAdminCase", [emptyCase, { person: SAM, now: NOW }]],
  attemptsNone: ["attemptList", [{ attempts: [] }]],
});

// Every sentence the golden states must contain between them, so a state that
// renders the wrong branch can't pass unnoticed.
export const SENTENCES = Object.freeze([
  "Nothing to claim right now. New work appears here once the office has checked its intake.",
  "Nothing is waiting for preparation.",
  "Nothing is waiting for review.",
  "Nothing of yours is waiting for preparation.",
  "Nothing on this tab matches these filters.",
  "No case matches “ZZZZ”.",
  "Nothing is waiting on the office right now.",
  "Nothing here matches these filters.",
  "No applications yet",
  "还没有申请",
  "Updates from the office appear here.",
  "No documents have been requested on this case.",
  "No review attempt has been opened on this case yet.",
  "No office follow-up has been raised on this case.",
  "Nothing has been recorded on this case yet.",
  "No document request on this case is waiting for a response.",
  "No call has been recorded on this task yet.",
]);
```

  - Replace the `baseState` line with the verbatim copy.
  - Adjust any state whose render doesn't show its sentence, for example a different `stage`, or a `caseTab`. Every panel is rendered, only hidden, so a tab choice shouldn't be needed. Keep the inputs fictional and keep the state names.
  - `emptyCase.answers` uses catalogue values (`drop_off`, `english`). If `progressScreen` needs more fields to reach its history panel, add them.

- [ ] **Step 2: Check each state renders the same twice, then capture.** From the worktree root, before touching any `src/` file:

```bash
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { renderStaffBoard, renderStaffCase } from "./src/staff-views.mjs";
import { renderFollowups } from "./src/office-views.mjs";
import { renderAdminCase, attemptList } from "./src/admin-views.mjs";
import { applicationsScreen, progressScreen } from "./src/client-views.mjs";
import { STATES, SENTENCES } from "./tests/empty-states.states.mjs";
const render = { renderStaffBoard, renderStaffCase, renderFollowups, renderAdminCase, attemptList, applicationsScreen, progressScreen };
const out = {};
for (const [name, [fn, args]] of Object.entries(STATES)) {
  const a = render[fn](...args), b = render[fn](...args);
  if (a !== b) throw new Error(`${name} is not deterministic`);
  out[name] = a;
}
const all = Object.values(out).join("\n");
const missing = SENTENCES.filter((s) => !all.includes(s));
if (missing.length) throw new Error("missing: " + missing.join(" | "));
writeFileSync("tests/fixtures/empty-states.json", JSON.stringify(out, null, 2) + "\n");
console.log(Object.keys(out).length, "captured");
'
```

Expected: `15 captured`. If it throws, fix the states (Step 1), never `src/`.

- [ ] **Step 3: Write `tests/empty-states.test.mjs`**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderStaffBoard, renderStaffCase } from "../src/staff-views.mjs";
import { renderFollowups } from "../src/office-views.mjs";
import { renderAdminCase, attemptList } from "../src/admin-views.mjs";
import { applicationsScreen, progressScreen } from "../src/client-views.mjs";
import { STATES, SENTENCES } from "./empty-states.states.mjs";

// Moving the empty states onto emptyState / emptyLine must not change a
// character (change unify-empty-states, design D2). The case pool and the Log
// a call drawer change on purpose and are tested on their own.
const GOLDEN = JSON.parse(readFileSync(new URL("./fixtures/empty-states.json", import.meta.url), "utf8"));
const render = { renderStaffBoard, renderStaffCase, renderFollowups, renderAdminCase, attemptList, applicationsScreen, progressScreen };

test("every list's empty state renders exactly as it did before the helpers", () => {
  assert.deepEqual(Object.keys(GOLDEN).sort(), Object.keys(STATES).sort());
  for (const [name, [fn, args]] of Object.entries(STATES)) assert.equal(render[fn](...args), GOLDEN[name], name);
});

test("the golden states really are the empty ones", () => {
  const all = Object.values(GOLDEN).join("\n");
  for (const sentence of SENTENCES) assert.ok(all.includes(sentence), sentence);
});
```

- [ ] **Step 4: Run.**
  - Run `node --test tests/empty-states.test.mjs`. Expected: 2 pass.
  - Then run `npm test`. Expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add tests/empty-states.states.mjs tests/empty-states.test.mjs tests/fixtures/empty-states.json
git commit -m "Golden markup of every list's empty state, before the helpers

Co-Authored-By: <model> <noreply@anthropic.com>"
```

---

### Task 2: `emptyState` and `emptyLine`

**Files:**
- Modify: `src/ui.mjs` (directly after `unloadedLine`, around line 77)
- Test: `tests/ui.test.mjs` (add `emptyState, emptyLine` to the top import from `../src/ui.mjs`; `icon` and `button` too if not already imported)

**Interfaces:**
- Produces:
  - `emptyState({ icon, title, text, actions = [], className } = {}) → string`. `icon` is an icon name; `title`, `text` and each action are HTML the caller already escaped or built.
  - `emptyLine(text) → string`.

- [ ] **Step 1: Write the failing tests**

```js
test("an empty panel: icon, heading, sentence and actions, each optional but the sentence", () => {
  const clear = button("Clear filters", "clear-board-filters", "secondary");
  assert.equal(emptyState({ text: "Nothing here." }), `<div class="empty-state"><p>Nothing here.</p></div>`);
  assert.equal(
    emptyState({ icon: "folder", text: "Nothing here.", actions: [clear] }),
    `<div class="empty-state">${icon("folder")}<p>Nothing here.</p>${clear}</div>`,
  );
  // A conditional action that is off renders nothing, as `when` returns "".
  assert.equal(
    emptyState({ icon: "check", text: "T", actions: ["", clear] }),
    `<div class="empty-state">${icon("check")}<p>T</p>${clear}</div>`,
  );
  // The client's list: a heading, and its own class first.
  assert.equal(
    emptyState({ icon: "folder", title: "No applications yet", text: "Start one.", className: "panel" }),
    `<div class="panel empty-state">${icon("folder")}<h2>No applications yet</h2><p>Start one.</p></div>`,
  );
});

test("an empty section is one muted line", () => {
  assert.equal(emptyLine("No call has been recorded on this task yet."), '<p class="muted">No call has been recorded on this task yet.</p>');
});
```

- [ ] **Step 2: Run to verify they fail.** Run `node --test tests/ui.test.mjs`. Expected: FAIL (missing export).
- [ ] **Step 3: Implement** in `src/ui.mjs`, directly after `unloadedLine`:

```js
// A list that loaded and has nothing to show (screen-states). A panel list
// gets an icon, an optional heading, its sentence and the actions that undo a
// filter; a section inside a case gets one muted line. Each list keeps its own
// words and passes its own ready-made buttons, so their data-* stay with it.
// `title`, `text` and the actions are HTML the caller has already escaped.
export const emptyState = ({ icon: name, title, text, actions = [], className } = {}) =>
  `<div class="${className ? `${className} ` : ""}empty-state">${name ? icon(name) : ""}${
    title ? `<h2>${title}</h2>` : ""
  }<p>${text}</p>${actions.join("")}</div>`;
export const emptyLine = (text) => `<p class="muted">${text}</p>`;
```

- [ ] **Step 4: Run to verify they pass.** Run `node --test tests/ui.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/ui.mjs tests/ui.test.mjs
git commit -m "emptyState and emptyLine in ui.mjs, beside the list loading lines

Co-Authored-By: <model> <noreply@anthropic.com>"
```

---

### Task 3: Panel lists use `emptyState`; the case pool says the right thing

**Files:**
- Modify: `src/staff-views.mjs` (`renderStaffBoard`, the `body` empty branch, around lines 590–593; add `emptyState` to the `./ui.mjs` import, lines 22–40)
- Modify: `src/office-views.mjs` (`renderFollowups`, `const empty`, around lines 263–271; import lines 21–34)
- Modify: `src/client-views.mjs` (`applicationsScreen`, around line 142; import, around line 14)
- Modify: `src/pool-views.mjs` (`renderCasePool`, around line 158; import line 3)
- Test: `tests/pool-views.test.mjs` (line 254 and a new test), `tests/empty-states.test.mjs` (unchanged; the guard)

**Interfaces:**
- Consumes: `emptyState` from Task 2. Each file's existing `icon`, `button`, `when`, `say`.

- [ ] **Step 1: Board.** Replace the empty branch of `body`:

```js
    : emptyState({
        icon: "folder",
        text: emptyText,
        actions: [when(narrowed || chosen.search, button("Clear filters", "clear-board-filters", "secondary"))],
      });
```

- [ ] **Step 2: Queue.** Replace `const empty = …;` with:

```js
  const empty = emptyState({
    icon: "check",
    text: kindOn || languageOn ? "Nothing here matches these filters." : "Nothing is waiting on the office right now.",
    actions: [
      when(kindOn, button("Show every task", "set-board-filter", "secondary", 'data-filter="officeKind" data-value="all"')),
      when(languageOn, button("Show all languages", "set-board-filter", "secondary", 'data-filter="language" data-value="all"')),
    ],
  });
```

- [ ] **Step 3: Client applications.** Replace the last branch of `loaded`:

```js
      : emptyState({ icon: "folder", title: say("apps.empty"), text: say("apps.empty_body"), className: "panel" });
```

- [ ] **Step 4: Run the guard.**
  - Run `node --test tests/empty-states.test.mjs tests/staff-views.test.mjs tests/office-views.test.mjs tests/client-views.test.mjs`. Expected: PASS with no test edited.
  - If the golden test fails, diff the output against `GOLDEN[name]` and fix the caller, never the fixture.
- [ ] **Step 5: Write the failing pool tests.**
  - In `tests/pool-views.test.mjs`, change line 254 to:

```js
  assert.match(renderCasePool([], PEOPLE, { filters: {}, now: NOW }), /No cases yet this season\./, "ready by default");
```

  - Then add a new test, using the file's existing helpers (`renderCasePool`, `PEOPLE`, `NOW`, and the record builder the file already uses for a case, here written `rec`):

```js
test("an empty pool says whether nothing exists or nothing matches", () => {
  const none = renderCasePool([], PEOPLE, { filters: {}, now: NOW });
  assert.match(none, /<div class="empty-state"><svg[^]*?<\/svg><p>No cases yet this season\.<\/p><\/div>/);
  assert.doesNotMatch(none, /No case matches these filters/);
  const filtered = renderCasePool([rec("A", "received", { answers: { language: "english" } })], PEOPLE, {
    filters: { poolLanguage: "Mandarin" },
    now: NOW,
  });
  assert.match(filtered, /<div class="empty-state"><svg[^]*?<\/svg><p>No case matches these filters\.<\/p><\/div>/);
  assert.doesNotMatch(filtered, /No cases yet this season/);
  assert.equal([...filtered.matchAll(/data-action="clear-pool-filters"/g)].length, 1, "Clear filters shows once");
});
```

  - Check how `icon()` renders (its root element) and that `rec`'s signature matches the file. Adjust the two regexes and the builder call to match, keeping what they assert.
- [ ] **Step 6: Run to verify the pool tests fail.** Run `node --test tests/pool-views.test.mjs`. Expected: FAIL.
- [ ] **Step 7: Pool.** Replace the empty branch of `body`:

```js
    : emptyState({ icon: "folder", text: narrowed ? "No case matches these filters." : "No cases yet this season." });
```

`narrowed` is the variable the summary line above already uses.

- [ ] **Step 8: Run.**
  - Run `node --test tests/pool-views.test.mjs`. Expected: PASS.
  - Then run `npm test`. Expected: all pass, with only `tests/pool-views.test.mjs` edited among the existing tests.
- [ ] **Step 9: Commit**

```bash
git add src/staff-views.mjs src/office-views.mjs src/client-views.mjs src/pool-views.mjs tests/pool-views.test.mjs
git commit -m "Panel lists use emptyState; an empty, unfiltered case pool says No cases yet this season

Co-Authored-By: <model> <noreply@anthropic.com>"
```

---

### Task 4: Case sections use `emptyLine`

**Files:**
- Modify: `src/staff-views.mjs`:
  - `documentsPanel`, around line 1123;
  - `reviewAttempts`, around line 1261;
  - `followupPanel`, around line 1344;
  - `historyPanel`, around line 1404.
- Modify: `src/admin-views.mjs`:
  - `receiptPanel`, around line 384;
  - `attemptList`, around line 410;
  - `adminFollowupPanel`, around line 507;
  - add `emptyLine` to the `./ui.mjs` import, lines 1–11.
- Modify: `src/office-views.mjs` (`logCallDrawerBody`, around line 314)
- Modify: `src/client-views.mjs` (`progressScreen`, around line 367)
- Test: `tests/office-views.test.mjs` (a new test), `tests/empty-states.test.mjs` (unchanged; the guard)

**Interfaces:**
- Consumes: `emptyLine` from Task 2. Add it to each file's `./ui.mjs` import.

- [ ] **Step 1: Replace only the empty-branch expression in each place.** The text stays the same, and nothing else in these functions changes:
  - `documentsPanel`: `'<p class="muted">No documents have been requested on this case.</p>'` → `emptyLine("No documents have been requested on this case.")`
  - `reviewAttempts`: `return '<p class="muted">No review attempt has been opened on this case yet.</p>';` → `return emptyLine("No review attempt has been opened on this case yet.");`
  - `followupPanel`: `'<p class="muted">No office follow-up has been raised on this case.</p>'` → `emptyLine("No office follow-up has been raised on this case.")`
  - `historyPanel`: `'<p class="muted">Nothing has been recorded on this case yet.</p>'` → `emptyLine("Nothing has been recorded on this case yet.")`
  - `receiptPanel`: in `` `<p class="muted">No document request on this case is waiting for a response.</p>${when(` `` replace the `<p>…</p>` part with `${emptyLine("No document request on this case is waiting for a response.")}`. Keep the `${when(…)}` after it exactly as is.
  - `attemptList`: `return '<p class="muted">No call has been recorded on this task yet.</p>';` → `return emptyLine("No call has been recorded on this task yet.");`
  - `adminFollowupPanel`: `'<p class="muted">No office follow-up has been raised on this case.</p>'` → `emptyLine("No office follow-up has been raised on this case.")`
  - `progressScreen`: `` `<p class="muted">${say("progress.history_empty")}</p>` `` → `emptyLine(say("progress.history_empty"))`
- [ ] **Step 2: Run the guard.** Run `node --test tests/empty-states.test.mjs tests/staff-views.test.mjs tests/admin-views.test.mjs tests/client-views.test.mjs`. Expected: PASS with no test edited.
- [ ] **Step 3: Write the failing drawer test** in `tests/office-views.test.mjs`. Use the record and person the file's existing "No open follow-up is left on this case." test (around line 365) already builds, and add:

```js
test("the Log a call drawer's empty line is a muted line, like every case section", () => {
  // Reuse the same record and person as the test around line 365.
  const html = logCallDrawerBody({ record: NO_OPEN_RECORD, person: sam, ui: {} });
  assert.match(html, /<p class="muted">No open follow-up is left on this case\.<\/p><button[^>]*data-action="close-dialog"/);
});
```

  - Define `NO_OPEN_RECORD` in the test from the same builder that test uses, a case with no open follow-up, or inline it.
  - Run `node --test tests/office-views.test.mjs`. Expected: FAIL (the line is a plain `<p>`).
- [ ] **Step 4: Drawer.** In `logCallDrawerBody`, change `<p>No open follow-up is left on this case.</p>` to `${emptyLine("No open follow-up is left on this case.")}` inside the same template literal. Keep `${head}${drawerError(ui)}` before it and the Close button after it.
- [ ] **Step 5: Run.**
  - Run `node --test tests/office-views.test.mjs`. Expected: PASS.
  - Then run `npm test`. Expected: all pass.
- [ ] **Step 6: Commit**

```bash
git add src/staff-views.mjs src/admin-views.mjs src/office-views.mjs src/client-views.mjs tests/office-views.test.mjs
git commit -m "Case sections use emptyLine; the Log a call drawer's line is muted like the rest

Co-Authored-By: <model> <noreply@anthropic.com>"
```

---

### Task 5: Docs and final checks

**Files:**
- Modify: `docs/developer/frontend.md` (the "**Lists say when they are loading or couldn't load.**" paragraph, around line 393)

- [ ] **Step 1: Add, directly after that paragraph:**

```markdown
**Empty lists.** A list that has loaded and has nothing to show uses `emptyState` (a panel: icon,
optional heading, one sentence, and the buttons that undo a filter) or `emptyLine` (one muted line
inside a case or a drawer), both from [`ui.mjs`](../../src/ui.mjs). Each list keeps its own words
and passes its own buttons. The work board's sentence per tab lives in `EMPTY_TAB`
(`staff-views.mjs`): a new phase adds its sentence there.
```

- [ ] **Step 2: Run the checks.**
  - `npm test`: all pass.
  - `npm run build:hant -- --check`: nothing to regenerate.
  - `npx openspec validate --all`: all valid.
- [ ] **Step 3: Commit**

```bash
git add docs/developer/frontend.md
git commit -m "Docs: empty lists use emptyState or emptyLine; a new phase adds an EMPTY_TAB sentence

Co-Authored-By: <model> <noreply@anthropic.com>"
```

- [ ] **Step 4 (controller):**
  - Run `npm run db:migrate:test`, then `npm run test:browser` **once**, with nothing else running.
  - Record the result for verify.md. A failure at a step this change doesn't touch is recorded, not retried.
