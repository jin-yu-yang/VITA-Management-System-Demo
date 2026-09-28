# Restyle PR 2: the case page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the staff case page for volunteer and office personas, on today's data. It gets:
- a header with a lifecycle bar and name pills
- five ARIA tabs: Overview, Intake answers, Documents, Follow-up, History
- a "Your next step" card built from the existing permission checks
- the designed Request corrections dialog

**Architecture:** The case page is restyled in place. `renderStaffCase` and `renderAdminCase` keep their data flow.
- **Tabs:** they come from one tab builder. Every panel is always rendered and the inactive ones are `hidden`, so every control keeps its id and `data-case-action` hook.
- **Action controls:** preparation and review controls move out of their panels into one "Your next step" card, so each action appears once on the page.
- **Selected tab:** it is window state (`caseTab`), saved per user. It resets to Overview when a different case opens or the persona changes.
- **No database change.**

**Tech Stack:** Vanilla ES modules rendering HTML strings, with hand-written `src/styles.css`. Unit tests use `node:test`; browser suites use Playwright; database suites run against the local Supabase test stack.

**Spec:** `docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md`, sections 6 (PR 2) and 9. Design references:
- `.stitch/designs/case-tabs.html`
- `.stitch/designs/case-preparer-view-v3.html`
- `.stitch/designs/case-corrections-dialog-lav.html`
- screenshots `docs/design/screens/case-tabs-overview.png`, `case-preparer-view-v3-full-page.png`, `case-corrections-dialog-lav-full-page.png`

## Global Constraints

- Part 1 changes no database schema.
- `npm test`, `npm run test:database`, `npm run test:auth-browser` and `npm run test:browser` pass.
  - The last three run against the repo's own local test stack, the Docker Supabase `vitally-task2.M5anE7XP` on port 54321 (see `.env.test`). Make sure its containers are running: `docker start $(docker ps -aq --filter name=vitally-task2)`.
  - Never run `npx supabase start` from the repository root.
- Use Node 24.21 or newer (`node -v`). Shells may put an nvm Node 18 first on `PATH`; if so, prefix `PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH`.
- Existing `data-action`, `data-case-action`, ids, roles and accessible names stay, except where this plan changes them on purpose.
  - The one planned change: Request corrections moves from an inline form to a dialog.
  - The browser suite depends on the element `#case-title`, whose text is exactly the Application ID.
  - It also depends on `.detail-row` rows labelled "Preparer", "Reviewer" and "Intake checks", and on the section headings "Preparation milestones", "Simulated intake checks", "Corrections the reviewer asked for", "A walk-in client's answers", "Documents the office took in" and "Follow-up with the client".
- Colors come from the `--vt-*` tokens in `src/styles.css`. Don't add new hex values in rules this plan writes; white (`#fff`) is allowed.
- Controls are at least `var(--vt-tap)` (44px) high, except inline text links.
- Only fictional data. The logo stays the unchanged `src/pcdc-logo.png`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Rulings in this plan (beyond the spec's text):**
- **Persona change resets the tab.** The case tab also resets to Overview when the persona changes. Each persona gets a different "Your next step" and a different set of office panels, so the page they land on should be Overview. Cost: one extra state reset.
- **Closed cases in the lifecycle bar.** A closed case shows only "Closed" as current, and no earlier step as done, because a case can be closed from any stage. The History tab shows the path it took. Cost: a closed case that went through review doesn't show its review as done in the bar.
- **Corrections dialog errors.** If sending corrections is refused, the dialog stays open and repeats the refusal inside itself (as `role="status"`, so screen readers don't hear two alerts). Otherwise the refusal would sit behind the dialog, unseen.

**Execution note:** Tasks 2 and 3 edit the same functions and are committed together. Give them to one implementer and review them as one unit.

---

## File map

| File | Change |
|---|---|
| `src/ui.mjs` | `nextTabIndex(key, at, count)`: arrow, Home and End navigation for tabs |
| `src/window-state.mjs` | Persist `caseTab` |
| `src/controller.mjs` | `caseTab` state, `setCaseTab()`; reset on a different case, a persona change and sign-out |
| `src/app.mjs` | `set-case-tab` click and arrow-key handler; `open-request-corrections`; close the dialog after a corrections receipt |
| `src/staff-views.mjs` | `CASE_TABS`, `caseTabs()`, `lifecycleBar()`, new `caseHeader()`, `caseDetails()`, `nextStep()`, info-only preparation and review panels, `correctionsDialogBody()`, `renderStaffCase()` in tabs |
| `src/admin-views.mjs` | `renderAdminCase()` in the same frame and tabs |
| `src/views.mjs` | Pass `caseTab` to both case renderers; the `request-corrections` dialog |
| `src/styles.css` | Header, lifecycle bar, pills, tabs, next-step card, details grid, dialog |
| Tests | `ui`, `window-state`, `controller`, `staff-views`, `admin-views` unit tests; `tests/support/story-pages.mjs`, `tests/browser.mjs` |

---

### Task 1: Tab keyboard helper, `caseTab` state and wiring

**Files:**
- Modify: `src/ui.mjs` (add `nextTabIndex` after `relativeDay`)
- Modify: `src/window-state.mjs` (`FIELDS`)
- Modify: `src/controller.mjs`:
  - initial state
  - `persistSession` and `restoreSession`
  - `selectCase`
  - `selectPerson`
  - the sign-out reset next to `state.boardFilters = {};`
  - new `setCaseTab`, and its export
- Modify: `src/app.mjs` (the click `switch`; a new `keydown` listener on `root`)
- Test: `tests/ui.test.mjs`, `tests/window-state.test.mjs`, `tests/controller.test.mjs`

**Interfaces:**
- Produces:
  - `nextTabIndex(key, at, count)`: returns `number | null`.
  - `state.caseTab`: a string, default `"overview"`.
  - `controller.setCaseTab(value)`.
  - The click action `set-case-tab`, which reads `data-value`.
  - The tab buttons that Task 2 renders: `button[role="tab"][data-action="set-case-tab"][data-value][id="case-tab-<key>"]`.

- [ ] **Step 1: Failing tests.** Append to `tests/ui.test.mjs`, adding `nextTabIndex` to its import from `../src/ui.mjs`:

```js
test("arrow keys, Home and End move between tabs and wrap around", () => {
  assert.equal(nextTabIndex("ArrowRight", 0, 5), 1);
  assert.equal(nextTabIndex("ArrowRight", 4, 5), 0);
  assert.equal(nextTabIndex("ArrowLeft", 0, 5), 4);
  assert.equal(nextTabIndex("ArrowLeft", 3, 5), 2);
  assert.equal(nextTabIndex("Home", 3, 5), 0);
  assert.equal(nextTabIndex("End", 1, 5), 4);
  assert.equal(nextTabIndex("Enter", 1, 5), null);
  assert.equal(nextTabIndex("ArrowRight", 0, 0), null);
});
```

Append to `tests/window-state.test.mjs`:

```js
test("the case tab is kept as a string", () => {
  const sessionStorage = fakeSession();
  const window = createWindowState({ sessionStorage });
  window.write("user-1", { screen: "staff-case", caseTab: "documents" });
  assert.deepEqual(window.read("user-1"), { screen: "staff-case", caseTab: "documents" });
  window.write("user-1", { screen: "staff-case", caseTab: 3 });
  assert.deepEqual(window.read("user-1"), { screen: "staff-case" });
});
```

Append to `tests/controller.test.mjs`:

```js
test("the case tab is this window's, and resets for another case, another persona and sign-out", async () => {
  const shared = fakeSession();
  const store = fakeStore({
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    people: [
      { id: "alex", name: "Alex", capabilities: ["prepare"] },
      { id: "sam", name: "Sam", capabilities: ["admin"] },
    ],
    cases: [
      { id: "case-a", reference: "VT-AAAA-AAAA", stage: "preparing", revision: 1, answers: {} },
      { id: "case-b", reference: "VT-BBBB-BBBB", stage: "preparing", revision: 1, answers: {} },
    ],
  });
  const first = build({ store, sessionStorage: shared });
  await first.controller.start();
  assert.equal(first.controller.getState().caseTab, "overview");
  await first.controller.selectCase("case-a");
  first.controller.setCaseTab("documents");
  assert.equal(first.controller.getState().caseTab, "documents");
  // Re-opening the same case keeps the tab.
  await first.controller.selectCase("case-a");
  assert.equal(first.controller.getState().caseTab, "documents");
  first.controller.stop();

  // A reload of the same window restores it.
  const again = build({ store, sessionStorage: shared });
  await again.controller.start();
  assert.equal(again.controller.getState().caseTab, "documents");
  // Another case starts on Overview.
  await again.controller.selectCase("case-b");
  assert.equal(again.controller.getState().caseTab, "overview");
  // Another persona starts on Overview.
  again.controller.setCaseTab("history");
  again.controller.selectPerson("sam");
  assert.equal(again.controller.getState().caseTab, "overview");
  again.controller.setCaseTab("followup");
  await again.controller.signOut();
  assert.equal(again.controller.getState().caseTab, "overview");
  again.controller.stop();
});
```

If `fakeStore` needs a `getCase` for these ids, check how the existing test `"the board's filters are this window's…"` builds its store. Use the same shape: `fakeStore` returns cases from its `cases` list.

- [ ] **Step 2: Run and watch them fail.**

Run: `node --test tests/ui.test.mjs tests/window-state.test.mjs tests/controller.test.mjs`
Expected: FAIL. `nextTabIndex` is missing, `caseTab` is dropped, and `setCaseTab` is undefined.

- [ ] **Step 3: Implement.**

In `src/ui.mjs`, after `relativeDay`:

```js
// The ARIA tab pattern's keys: the arrows move one tab and wrap around, Home
// and End jump to the ends. Anything else is not a tab key (null).
export function nextTabIndex(key, at, count) {
  if (!count) return null;
  if (key === "ArrowRight") return (at + 1) % count;
  if (key === "ArrowLeft") return (at - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
```

In `src/window-state.mjs`, add `caseTab: asString,` to `FIELDS` after `sidebarOpen`.

In `src/controller.mjs`:
- In the initial state, after `sidebarOpen: true,`, add:
  ```js
  // Which tab of the case page this window shows. Overview unless chosen.
  caseTab: "overview",
  ```
- In `persistSession`, add `caseTab: state.caseTab,`.
- In `restoreSession`, add `if (typeof saved.caseTab === "string") state.caseTab = saved.caseTab;`.
- In `selectCase`, as its first statement (before `if (state.savedCase?.id !== id) clearSelection();`), add:
  ```js
  // Another case opens on its Overview; the same case keeps its tab, which is
  // what a reload restores.
  if (state.selectedCaseId !== id) state.caseTab = "overview";
  ```
- In `selectPerson`, before `persistSession();`, add:
  ```js
  // Another persona has another next step, so the case page starts over.
  state.caseTab = "overview";
  ```
- In the sign-out reset, next to `state.boardFilters = {};`, add `state.caseTab = "overview";`.
- After `toggleSidebar`, add:
  ```js
  function setCaseTab(value) {
    state.caseTab = String(value || "overview");
    persistSession();
    show();
  }
  ```
  Then add `setCaseTab,` to the returned object after `toggleSidebar,`.

In `src/app.mjs`:
- Add `nextTabIndex` to the import from `./ui.mjs`.
- In the click `switch`, next to `case "toggle-sidebar":`, add:
  ```js
      case "set-case-tab":
        controller.setCaseTab(target.dataset.value);
        root.querySelector(`#case-tab-${CSS.escape(target.dataset.value ?? "")}`)?.focus();
        break;
  ```
- After the existing `root.addEventListener("submit", …)` block, add:
  ```js
  // The case page's tabs follow the ARIA tab pattern: arrows, Home and End move
  // to a tab and show it, and the keyboard stays on the tab.
  root.addEventListener("keydown", (event) => {
    const tab = event.target.closest?.('[role="tab"][data-action="set-case-tab"]');
    if (!tab) return;
    const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')];
    const next = nextTabIndex(event.key, tabs.indexOf(tab), tabs.length);
    if (next === null) return;
    event.preventDefault();
    const target = tabs[next];
    controller.setCaseTab(target.dataset.value);
    root.querySelector(`#${CSS.escape(target.id)}`)?.focus();
  });
  ```

- [ ] **Step 4: Run the tests.**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/ui.mjs src/window-state.mjs src/controller.mjs src/app.mjs tests/ui.test.mjs tests/window-state.test.mjs tests/controller.test.mjs
git commit -m "Remember the case page's tab per window, with keyboard navigation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tabs, lifecycle bar, header and case details

**Files:**
- Modify: `src/staff-views.mjs`:
  - add the helpers below after `problemNotice`
  - replace `caseHeader`
- Test: `tests/staff-views.test.mjs`

**Interfaces:**
- Consumes: the tab button hooks from Task 1; `who(id, name, personId)`, which already exists in this file (board).
- Produces:
  - `CASE_TABS`
  - `caseTabs(panels, active, counts)`, where `panels` is an array of `[key, label, html]`
  - `lifecycleBar(stage)`
  - `caseHeader(record, person)`
  - `caseDetails(record)`
- Produces the DOM:
  - `#case-title`
  - `.case-tabs[role=tablist]`
  - `button.case-tab[role=tab]#case-tab-<key>[aria-controls=case-panel-<key>]`
  - `div.case-panel[role=tabpanel]#case-panel-<key>`, with the `hidden` attribute when inactive
  - `ol.lifecycle` with `li.lifecycle-step.done|current|todo`, and `.amend` on a corrections step
  - `.name-pill`
  - `section.case-details`

- [ ] **Step 1: Failing tests.** Append to `tests/staff-views.test.mjs`, adding `caseTabs, lifecycleBar, caseHeader, caseDetails, CASE_TABS` to the import from `../src/staff-views.mjs`:

```js
test("case tabs follow the ARIA tab pattern and keep every panel in the page", () => {
  assert.deepEqual(CASE_TABS.map(([key]) => key), ["overview", "intake", "documents", "followup", "history"]);
  const panels = CASE_TABS.map(([key, label]) => [key, label, `<p>${key} body</p>`]);
  const html = caseTabs(panels, "documents", { documents: 2 });
  assert.match(html, /<div class="case-tabs" role="tablist" aria-label="Case sections">/);
  assert.match(html, /<button type="button" role="tab" id="case-tab-documents" aria-controls="case-panel-documents" aria-selected="true" tabindex="0" class="case-tab selected" data-action="set-case-tab" data-value="documents">Documents <span class="tab-count">2<\/span><\/button>/);
  assert.match(html, /id="case-tab-overview" aria-controls="case-panel-overview" aria-selected="false" tabindex="-1"/);
  assert.match(html, /<div role="tabpanel" id="case-panel-documents" aria-labelledby="case-tab-documents" class="case-panel" tabindex="0">/);
  assert.match(html, /<div role="tabpanel" id="case-panel-overview" aria-labelledby="case-tab-overview" class="case-panel" tabindex="0" hidden>/);
  for (const [key] of CASE_TABS) assert.match(html, new RegExp(`${key} body`));
  // An unknown tab falls back to the first.
  assert.match(caseTabs(panels, "nonsense"), /id="case-tab-overview" aria-controls="case-panel-overview" aria-selected="true"/);
});

test("the lifecycle bar marks done, current and still-to-come steps", () => {
  const steps = (stage) =>
    [...lifecycleBar(stage).matchAll(/class="lifecycle-step ([a-z ]+)"/g)].map((m) => m[1]);
  assert.deepEqual(steps("preparing"), ["done", "done", "done", "current", "todo", "todo", "todo", "todo"]);
  assert.deepEqual(steps("draft")[0], "current");
  assert.deepEqual(steps("corrections_required")[3], "current amend");
  assert.match(lifecycleBar("corrections_required"), /Corrections in progress/);
  assert.match(lifecycleBar("reviewing"), /aria-current="step"[^>]*>[\s\S]*?In review/);
  assert.ok(steps("nonsense").every((s) => s === "todo"));
  // Closed can happen at any stage, so nothing before it is claimed as done.
  assert.deepEqual(steps("closed"), ["todo", "todo", "todo", "todo", "todo", "todo", "todo", "current"]);
});

test("the case header names the case, its stage and its people", () => {
  const html = caseHeader(staffCase({ stage: "reviewing", preparerId: "alex", reviewerId: "morgan" }), MORGAN);
  assert.match(html, /<h2 id="case-title">VT-AB2C-DE3F<\/h2>/);
  assert.match(html, /class="badge prep"/);
  assert.match(html, /<ol class="lifecycle"/);
  assert.match(html, /Preparer<\/small> Alex/);
  assert.match(html, /Reviewer<\/small> <strong class="you">You<\/strong>/);
  assert.match(html, /Acting as Morgan\./);
  assert.match(caseHeader(staffCase(), null), /Choose a volunteer persona to act as\./);
});

test("case details keep the rows the story and the office read", () => {
  const html = caseDetails(staffCase({ intakeVerified: true, lastRemindedAt: "2026-09-11T14:00:00.000Z", lastRemindedByPersonId: "sam" }));
  for (const label of ["Stage", "Preparation version", "Intake checks", "Preparer", "Reviewer", "Last reminded", "Updated"])
    assert.match(html, new RegExp(`<div class="detail-row"><span>${label}</span>`), label);
  assert.match(html, /<span>Intake checks<\/span><strong>Recorded<\/strong>/);
  assert.match(html, /<span>Preparer<\/span><strong>Alex<\/strong>/);
});
```

`staffCase` (fixture helper), `ALEX` and `MORGAN` are already defined at the top of this test file. `staffCase()`'s default record has reference `VT-AB2C-DE3F`, `preparerId: "alex"` and `participants: ["alex"]`.

- [ ] **Step 2: Run and watch them fail.**

Run: `node --test tests/staff-views.test.mjs`
Expected: FAIL. The new exports are missing.

- [ ] **Step 3: Implement.** In `src/staff-views.mjs`, after `problemNotice`:

```js
// ---------------------------------------------------------------------------
// The case page frame (spec 2026-09-28, section 6)
// ---------------------------------------------------------------------------

export const CASE_TABS = Object.freeze([
  ["overview", "Overview"],
  ["intake", "Intake answers"],
  ["documents", "Documents"],
  ["followup", "Follow-up"],
  ["history", "History"],
]);

/**
 * The case page's tabs, following the ARIA tab pattern (spec section 9).
 * Every panel is rendered and the inactive ones are `hidden`, so each control
 * keeps its id and hook wherever it lives. The wiring layer handles the keys.
 *
 * @param {Array<[string, string, string]>} panels `[key, label, html]`
 * @param {string} active the key to show; an unknown key shows the first
 * @param {Record<string, number>} counts optional count per key
 */
export function caseTabs(panels, active = "overview", counts = {}) {
  const current = panels.some(([key]) => key === active) ? active : panels[0][0];
  const tabs = panels
    .map(([key, label]) => {
      const on = key === current;
      const count = counts[key] ? ` <span class="tab-count">${esc(counts[key])}</span>` : "";
      return `<button type="button" role="tab" id="case-tab-${key}" aria-controls="case-panel-${key}" aria-selected="${on}" tabindex="${on ? 0 : -1}" class="case-tab${on ? " selected" : ""}" data-action="set-case-tab" data-value="${key}">${esc(label)}${count}</button>`;
    })
    .join("");
  const bodies = panels
    .map(
      ([key, , html]) =>
        `<div role="tabpanel" id="case-panel-${key}" aria-labelledby="case-tab-${key}" class="case-panel" tabindex="0"${key === current ? "" : " hidden"}>${html}</div>`,
    )
    .join("");
  return `<div class="case-tabs" role="tablist" aria-label="Case sections">${tabs}</div>${bodies}`;
}

// The main path through today's nine stages. Corrections are a loop back into
// preparation, so they show on the preparation step, marked as amendment.
const LIFECYCLE = Object.freeze([
  "draft",
  "received",
  "preparation_ready",
  "preparing",
  "review_ready",
  "reviewing",
  "review_approved",
  "closed",
]);

export function lifecycleBar(stage) {
  const correcting = stage === "corrections_required";
  const at = LIFECYCLE.indexOf(correcting ? "preparing" : stage);
  return `<ol class="lifecycle" aria-label="Where this case is">${LIFECYCLE.map((step, index) => {
    // A case can be closed from any stage, so a closed case marks no step as
    // done; the History tab shows the path it took.
    const state =
      at < 0 ? "todo" : index === at ? "current" : index < at && stage !== "closed" ? "done" : "todo";
    const amend = correcting && step === "preparing";
    const label = describeStage(amend ? "corrections_required" : step).label;
    return `<li class="lifecycle-step ${state}${amend ? " amend" : ""}"${index === at ? ' aria-current="step"' : ""}><span class="lifecycle-dot"></span><span class="lifecycle-label">${esc(label)}</span></li>`;
  }).join("")}</ol>`;
}

const namePill = (role, id, name, personId) =>
  `<span class="name-pill"><small>${role}</small> ${who(id, name, personId)}</span>`;

export function caseHeader(record, person) {
  return `<section class="panel staff-header" aria-labelledby="case-title"><div class="case-title-row"><h2 id="case-title">${esc(record.reference ?? "This case")}</h2>${stageBadge(record.stage)}<span class="case-people">${namePill("Preparer", record.preparerId, record.preparerName, person?.id)}${namePill("Reviewer", record.reviewerId, record.reviewerName, person?.id)}</span></div>${lifecycleBar(record.stage)}<p class="field-note">${esc(
    person?.name ? `Acting as ${person.name}.` : CHOOSE_PERSONA,
  )}</p></section>`;
}

/** The facts the old header listed, kept as rows the story and office read. */
export function caseDetails(record) {
  const described = describeStage(record.stage);
  return `<section class="panel case-details" aria-labelledby="details-title"><div class="section-head"><h2 id="details-title">Case details</h2></div>${detailRow("Stage", described.label)}${detailRow(
    "Preparation version",
    record.preparationVersion ? `Version ${record.preparationVersion}` : "Not prepared yet",
  )}${detailRow("Intake checks", record.intakeVerified ? "Recorded" : "Not recorded yet")}${detailRow(
    "Preparer",
    record.preparerName ?? (record.preparerId ? UNKNOWN_PERSON : "Unassigned"),
  )}${detailRow(
    "Reviewer",
    record.reviewerName ?? (record.reviewerId ? UNKNOWN_PERSON : "Unassigned"),
  )}${when(
    Array.isArray(record.participantNames),
    detailRow("Prepared by (all versions)", record.participantNames?.join(", ") || "Nobody yet"),
  )}${detailRow(
    "Last reminded",
    record.lastRemindedAt
      ? `${formatTime(record.lastRemindedAt)}${record.lastRemindedByName ? ` by ${record.lastRemindedByName}` : ""}`
      : "Not reminded yet",
  )}${detailRow("Updated", record.updatedAt ? formatTime(record.updatedAt) : "No updates yet")}</section>`;
}
```

Then delete the old `caseHeader` (the one that renders `detailRow`s inside `section.staff-header`). `who` is already defined above this point, with the board.

- [ ] **Step 4: Run the new tests.**

Run: `node --test tests/staff-views.test.mjs`
Expected:
- The four new tests PASS.
- Other case tests may fail, because `renderStaffCase` no longer shows the detail rows until Task 3 puts `caseDetails` on Overview.

Note which ones fail. Task 3 re-runs the file.

- [ ] **Step 5: Commit** together with Task 3 (see Task 3, Step 7).

---

### Task 3: "Your next step", info-only panels, the corrections dialog, and the staff case in tabs

**Files:**
- Modify: `src/staff-views.mjs`:
  - `preparationPanel` and `reviewPanel` become info-only
  - new `nextStep`
  - new `correctionsDialogBody`
  - `renderStaffCase`
  - `historyPanel` (plain-language sentences)
  - `decorateStaffCase` (an `actorName` on each history entry)
- Modify: `src/views.mjs`:
  - import `correctionsDialogBody`
  - `dialog()` gains a branch
  - `staffScreen` passes `caseTab` in both case `ui` objects
- Modify: `src/app.mjs`: `open-request-corrections`, and close the dialog after a `REQUEST_CORRECTIONS` receipt
- Test: `tests/staff-views.test.mjs`

**Interfaces:**
- Consumes: `caseTabs`, `CASE_TABS`, `caseHeader`, `caseDetails` (Task 2); `ui.caseTab` (Task 1 via views).
- Produces:
  - `nextStep(record, rights, ui)` → `section.panel.next-step` whose heading is `h2#next-step-title` "Your next step".
  - `correctionsDialogBody(state)`, which also shows a refused send inside the dialog.
  - `EVENT_SENTENCES` and `historySentence(entry)`.
  - The click action `open-request-corrections`.
  - The dialog name `request-corrections`.

- [ ] **Step 1: Failing tests.** Append to `tests/staff-views.test.mjs`, adding `nextStep, correctionsDialogBody, historySentence, EVENT_SENTENCES, historyPanel` to the import, and `staffEligibility` if it isn't already imported. Also add `import { CASE_ACTIONS } from "../src/contracts.mjs";`:

```js
test("your next step offers the one action that fits, or says who the case waits on", () => {
  const step = (overrides, person) => {
    const record = staffCase(overrides);
    return nextStep(record, staffEligibility(record, person), {});
  };
  // Claim preparation.
  assert.match(step({ stage: "preparation_ready", preparerId: null, participants: [] }, ALEX), /data-case-action="CLAIM_PREPARATION"/);
  assert.doesNotMatch(step({ stage: "preparation_ready", preparerId: null, participants: [] }, MORGAN), /data-case-action=/);
  assert.match(step({ stage: "preparation_ready", preparerId: null, participants: [] }, MORGAN), /Needs preparation eligibility\./);
  // Record preparation complete (the preparer only).
  assert.match(step({ stage: "preparing" }, ALEX), /data-case-action="SUBMIT_REVIEW"/);
  // A volunteer who can prepare, but is not this case's preparer.
  const CASEY = { id: "casey", name: "Casey", capabilities: ["prepare"] };
  assert.match(step({ stage: "preparing" }, CASEY), /Only this case's current preparer can do this work\./);
  assert.match(step({ stage: "preparing" }, MORGAN), /Needs preparation eligibility\./);
  // Claim review, and the self-review refusal.
  assert.match(step({ stage: "review_ready", preparerId: "alex", participants: ["alex"] }, MORGAN), /data-case-action="CLAIM_REVIEW"/);
  assert.match(step({ stage: "review_ready", preparerId: "alex", participants: ["alex"] }, ALEX), /You prepared this case, so you cannot review it\./);
  // Decide the review: approve here, corrections through the dialog.
  const deciding = step({ stage: "reviewing", preparerId: "alex", reviewerId: "morgan", participants: ["alex"] }, MORGAN);
  assert.match(deciding, /data-case-action="APPROVE_REVIEW"/);
  assert.match(deciding, /data-action="open-request-corrections"/);
  assert.doesNotMatch(deciding, /data-case-action="REQUEST_CORRECTIONS"/);
  // Corrections: the reviewer's words stay visible to everyone on the case.
  const correcting = step({
    stage: "corrections_required",
    reviews: [{ id: "r1", status: "corrections_requested", findings: "Fix the mileage.", preparationVersion: 1 }],
  }, ALEX);
  assert.match(correcting, /Corrections the reviewer asked for/);
  assert.match(correcting, /Fix the mileage\./);
  assert.match(correcting, /data-case-action="RESUBMIT_REVIEW"/);
  // Office intake stages and a closed case: no action, just the state.
  assert.doesNotMatch(step({ stage: "received" }, ALEX), /data-case-action=/);
  assert.match(step({ stage: "received" }, ALEX), /<h2 id="next-step-title">Your next step<\/h2>/);
  // No persona.
  assert.match(step({ stage: "preparing" }, null), /Choose a volunteer persona to act as\./);
});

test("the staff case page is five tabs, with each action in exactly one place", () => {
  const html = renderStaffCase(staffCase({ stage: "reviewing", preparerId: "alex", reviewerId: "morgan", participants: ["alex"], reviews: [{ id: "r1", status: "open", preparationVersion: 1 }] }), MORGAN, { caseTab: "documents" });
  assert.match(html, /<h2 id="case-title">/);
  for (const [key] of CASE_TABS) assert.match(html, new RegExp(`id="case-panel-${key}"`));
  assert.match(html, /id="case-tab-documents" aria-controls="case-panel-documents" aria-selected="true"/);
  assert.match(html, /id="case-panel-overview"[^>]*hidden>[\s\S]*Your next step[\s\S]*Case details[\s\S]*Preparation milestones[\s\S]*Independent review/);
  assert.equal((html.match(/data-case-action="APPROVE_REVIEW"/g) ?? []).length, 1);
  assert.match(html, /id="case-panel-intake"[^>]*>[\s\S]*What the client told us/);
  assert.match(html, /id="case-panel-history"[^>]*>[\s\S]*History/);
});

test("the corrections dialog carries the form the action is built from", () => {
  const html = correctionsDialogBody({ busy: false });
  assert.match(html, /<form class="staff-form">/);
  assert.match(html, /<span>Corrections to send back to the preparer<\/span><textarea id="field-corrections-findings" name="findings"/);
  assert.match(html, /<button type="submit" class="btn primary full" data-case-action="REQUEST_CORRECTIONS"/);
  assert.match(html, /data-action="close-dialog"/);
  assert.match(correctionsDialogBody({ busy: true }), /data-case-action="REQUEST_CORRECTIONS"\s+disabled/);
  // A refused send is repeated inside the dialog, which would otherwise hide it.
  const refused = correctionsDialogBody({ error: { code: "CONFLICT", message: "Someone else changed this case." } });
  assert.match(refused, /<div class="notice amber" role="status">[\s\S]*Someone else changed this case\./);
  assert.doesNotMatch(correctionsDialogBody({}), /role="status"/);
});

test("internal history reads as sentences, with who did it", () => {
  const record = staffCase({
    internalHistory: [
      { id: "e1", action: "CLAIM_PREPARATION", actorPersonId: "alex", createdAt: "2026-09-12T15:00:00.000Z" },
      { id: "e2", action: "LOAD_SOMETHING_NEW", actorPersonId: null, createdAt: "2026-09-12T16:00:00.000Z" },
    ],
  });
  assert.equal(record.internalHistory[0].actorName, "Alex");
  assert.equal(historySentence(record.internalHistory[0]), "Alex claimed preparation.");
  // An event this table does not know still reads as words, never as a code.
  assert.equal(historySentence(record.internalHistory[1]), "Load something new.");
  for (const action of CASE_ACTIONS) assert.ok(EVENT_SENTENCES[action], action);
  const html = historyPanel(record, true);
  assert.match(html, /Alex claimed preparation\./);
  assert.doesNotMatch(html, /CLAIM_PREPARATION/);
});
```

Then update the two existing assertions about the corrections form (around the old lines 653 and 702, found by `REQUEST_CORRECTIONS`):
- The first, `assert.doesNotMatch(forAlex, /data-case-action="REQUEST_CORRECTIONS"/)`, stays true. Leave it.
- The second, `assert.match(forMorgan, /data-case-action="REQUEST_CORRECTIONS"/)`, becomes `assert.match(forMorgan, /data-action="open-request-corrections"/)`.

- [ ] **Step 2: Run and watch them fail.**

Run: `node --test tests/staff-views.test.mjs`
Expected: FAIL. `nextStep` and `correctionsDialogBody` are missing.

- [ ] **Step 3: Implement the card and the info-only panels.** In `src/staff-views.mjs`, replace `preparationPanel` and `reviewPanel`, and add `nextStep` and `correctionsDialogBody`, with the block below. `reviewAttempts`, `preparationBlockers`, `explain`, `stageWork`, `CONTACT_OUTCOMES`, `CONTACT_OUTCOME_LABELS` and `TAXSLAYER_NOTE` already exist.

```js
/**
 * The one thing to do next on this case, for the persona this window acts as,
 * built from the same eligibility rules the database enforces. When there is
 * nothing to do, it says who the case is waiting on and, where an action was
 * refused, why.
 */
export function nextStep(record, rights, ui = {}) {
  const busy = ui.busy ? "disabled" : "";
  const blockers = preparationBlockers(record);
  const blocked = when(
    blockers.length,
    `<ul class="blocker-list">${blockers.map((line) => `<li>${icon("clock")} ${esc(line)}</li>`).join("")}</ul>`,
  );
  const approved = (record.reviews ?? []).findLast((review) => review?.status === "approved");
  const corrections = (record.reviews ?? []).findLast(
    (review) => review?.status === "corrections_requested",
  );
  let body = "";
  switch (record.stage) {
    case "preparation_ready":
      body = rights.claimPreparation.allowed
        ? caseButton(`${icon("play")} Claim preparation`, "CLAIM_PREPARATION", "primary", busy)
        : explain(rights.claimPreparation);
      break;
    case "preparing":
      body = rights.preparationWork.allowed
        ? `${blocked}${caseButton(
            `${icon("check")} Record that preparation is complete in TaxSlayer`,
            "SUBMIT_REVIEW",
            "primary",
            blockers.length || ui.busy ? "disabled" : "",
          )}`
        : explain(rights.preparationWork);
      break;
    case "corrections_required":
      body = `${when(
        Boolean(corrections),
        `<div class="notice amber" role="note">${icon("help")}<div><h3>Corrections the reviewer asked for</h3><p>${esc(corrections?.findings)}</p><small>${esc(corrections?.reviewerName ?? "")} · version ${esc(corrections?.preparationVersion)} · ${esc(formatTime(corrections?.decidedAt))}</small></div></div>`,
      )}${
        rights.preparationWork.allowed
          ? `${blocked}<form class="staff-form">${textarea(
              "What you corrected in TaxSlayer",
              "resolution",
              "",
              'required maxlength="2000" rows="3"',
              "resubmit",
            )}${caseSubmit(
              `${icon("check")} Record that the corrections are complete in TaxSlayer`,
              "RESUBMIT_REVIEW",
              "primary",
              blockers.length || ui.busy ? "disabled" : "",
            )}</form>`
          : explain(rights.preparationWork)
      }`;
      break;
    case "review_ready":
      body = rights.claimReview.allowed
        ? caseButton(`${icon("check")} Claim review`, "CLAIM_REVIEW", "primary", busy)
        : explain(rights.claimReview);
      break;
    case "reviewing":
      body = rights.reviewDecision.allowed
        ? `<div class="next-step-actions">${caseButton(
            `${icon("check")} Approve this review`,
            "APPROVE_REVIEW",
            "primary",
            busy,
          )}${button(
            `${icon("back")} Ask the preparer for corrections`,
            "open-request-corrections",
            "secondary",
            busy,
          )}</div><p class="field-note">Approving records the result of the external review; it is not signing or filing, and it is not an acceptance by any tax authority.</p>`
        : explain(rights.reviewDecision);
      break;
    case "review_approved":
      body =
        approved?.clientContactStatus === "pending"
          ? rights.reviewContact.allowed
            ? `<form class="staff-form">${select(
                "What happened",
                "outcome",
                "",
                CONTACT_OUTCOMES.map((value) => [value, CONTACT_OUTCOME_LABELS[value]]),
                "required",
                "contact",
              )}${textarea(
                "Note for the office",
                "note",
                "",
                'required maxlength="1000" rows="2"',
                "contact",
              )}${caseSubmit(
                `${icon("phone")} Record this conversation`,
                "RECORD_REVIEW_CONTACT",
                "primary",
                busy,
              )}<p class="field-note">Recording an attempt never closes the case. Closure is the office's own step.</p></form>`
            : explain(rights.reviewContact)
          : `<p class="muted">The client conversation for this review is recorded. Nothing further is needed here.</p>`;
      break;
    default:
      body = "";
  }
  return `<section class="panel next-step" aria-labelledby="next-step-title"><div class="section-head"><h2 id="next-step-title">Your next step</h2></div><p class="next-step-waiting">${esc(stageWork(record.stage).work)}</p>${body}</section>`;
}

// What preparation is waiting on. The actions are in "Your next step".
function preparationPanel(record) {
  const blockers = ["preparing", "corrections_required"].includes(record.stage)
    ? preparationBlockers(record)
    : [];
  return `<section class="panel" aria-labelledby="preparation-title"><div class="section-head"><h2 id="preparation-title">Preparation milestones</h2></div><p class="field-note">${esc(TAXSLAYER_NOTE)} Nothing here signs or files a return.</p>${
    blockers.length
      ? `<ul class="blocker-list">${blockers.map((line) => `<li>${icon("clock")} ${esc(line)}</li>`).join("")}</ul>`
      : `<p class="muted">${esc(stageWork(record.stage).work)}</p>`
  }</section>`;
}

// Every review attempt on this case. The decision is in "Your next step".
function reviewPanel(record) {
  return `<section class="panel" aria-labelledby="review-title"><div class="section-head"><h2 id="review-title">Independent review</h2></div><p class="field-note">A reviewer never reviews a case they prepared, at any version.</p>${reviewAttempts(record)}</section>`;
}

/**
 * The Request corrections dialog: the form REQUEST_CORRECTIONS is built from.
 * A refused send is repeated here, because the page's own notice sits behind
 * the dialog. It is a status, not a second alert.
 */
export function correctionsDialogBody(state = {}) {
  const refused = state.error
    ? `<div class="notice amber" role="status">${icon("help")}<div><h3>${esc(
        state.error.code === "CONFLICT" ? "This case changed while you were working" : "That did not go through",
      )}</h3><p>${esc(state.error.message)}</p></div></div>`
    : "";
  return `${refused}<p>Tell the preparer what to correct in TaxSlayer. The client never sees these words.</p><form class="staff-form">${textarea(
    "Corrections to send back to the preparer",
    "findings",
    "",
    'required maxlength="2000" rows="4"',
    "corrections",
  )}${caseSubmit(
    `${icon("back")} Send back for corrections`,
    "REQUEST_CORRECTIONS",
    "primary full",
    state.busy ? "disabled" : "",
  )}</form>${button("Keep reviewing", "close-dialog", "text")}`;
}
```

`select` is already imported in `src/staff-views.mjs`. Keep the imports as they are, and add `CASE_ACTIONS` from `./contracts.mjs` only if a sentence needs it (the table below doesn't).

Then make the history read as sentences. The internal history is `case_events` rows with `action`, `actorPersonId`, `detail` and `createdAt`, and today the panel prints the raw code, such as `CLAIM_PREPARATION`.

1. In `decorateStaffCase`, after the `reviews` block and in the same style, add:
   ```js
     if (Array.isArray(caseRecord.internalHistory))
       decorated.internalHistory = caseRecord.internalHistory.map((entry) => ({
         ...entry,
         actorName: nameOf(entry?.actorPersonId),
       }));
   ```
   It reuses the function's own `nameOf`. A record without `internalHistory` gains none, so no section is invented.
2. Add, next to `historyPanel`:
   ```js
   // One plain sentence per recorded action (spec section 6). The actor is added
   // when the event names one; an action this table does not know still reads
   // as words, never as a code.
   export const EVENT_SENTENCES = Object.freeze({
     SAVE_ANSWERS: "saved the intake answers",
     SUBMIT: "submitted the application",
     VERIFY_INTAKE: "recorded the intake checks",
     CLAIM_PREPARATION: "claimed preparation",
     REQUEST_DOCUMENT: "asked the client for a document",
     RESPOND_DOCUMENT: "sent a requested document",
     RECORD_DOCUMENT_RESPONSE: "recorded a document the office took in",
     VERIFY_DOCUMENT: "verified a document",
     ESCALATE_CONTACT: "asked the office to contact the client",
     RECORD_CONTACT: "recorded a call with the client",
     RESOLVE_FOLLOWUP: "resolved the office follow-up",
     SUBMIT_REVIEW: "recorded that preparation is complete",
     CLAIM_REVIEW: "claimed the review",
     REQUEST_CORRECTIONS: "asked the preparer for corrections",
     RESUBMIT_REVIEW: "recorded that the corrections are complete",
     APPROVE_REVIEW: "approved the review",
     RECORD_REVIEW_CONTACT: "recorded the conversation with the client",
     REMIND: "sent the client a reminder",
     CLOSE_CASE: "closed the case",
   });

   export function historySentence(entry) {
     const code = String(entry?.action ?? "");
     // `??` and `||` cannot be mixed without parentheses.
     const words =
       (EVENT_SENTENCES[code] ?? code.toLowerCase().replaceAll("_", " ").trim()) ||
       "recorded a change";
     const sentence = entry?.actorName ? `${entry.actorName} ${words}` : words;
     return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
   }
   ```
3. In `historyPanel`, change the internal list's `<p>${esc(entry?.action)}</p>` to `<p>${esc(historySentence(entry))}</p>`. Nothing else in the panel changes. The client list is already plain language.

Check the expected sentence for an actor-less unknown event: `"Load something new."` comes from `"load something new"` with its first letter capitalised.

- [ ] **Step 4: Put the staff case in tabs.** Replace `renderStaffCase`:

```js
/**
 * One case: a header, then five tabs (spec section 6). Overview holds the next
 * step and the facts; the other tabs hold the rest. Every panel is rendered, so
 * each control keeps its hook whichever tab is showing.
 *
 * @param {object} caseRecord a decorated staff Case (`decorateStaffCase`)
 * @param {{id:string,name:string,capabilities:string[]}|null} person the persona
 * @param {object} ui `{busy, error, retryable, caseTab}` from the controller snapshot
 */
export function renderStaffCase(caseRecord, person, ui = {}) {
  const record = caseRecord ?? {};
  const view = ui ?? {};
  const rights = staffEligibility(record, person);
  // A record with no staff sections is an applicant's Case, or a list row: it
  // cannot be acted on, and no workflow control is offered for it.
  const staffShaped = Array.isArray(record.participants) && Array.isArray(record.reviews);
  const notLoaded = `<section class="panel"><div class="section-head"><h2>Staff sections are not loaded</h2></div><p class="muted">This record holds no participation, review or internal history, so no case action is offered here. Open the case from the work board to do the work.</p></section>`;
  const elsewhere = '<p class="muted">Open the case from the work board to see this.</p>';
  const panels = [
    [
      "overview",
      "Overview",
      staffShaped
        ? `${nextStep(record, rights, view)}${caseDetails(record)}${preparationPanel(record)}${reviewPanel(record)}`
        : `${caseDetails(record)}${notLoaded}`,
    ],
    ["intake", "Intake answers", answersPanel(record)],
    ["documents", "Documents", staffShaped ? documentsPanel(record, rights, view) : elsewhere],
    ["followup", "Follow-up", staffShaped ? followupPanel(record) : elsewhere],
    ["history", "History", historyPanel(record, staffShaped)],
  ];
  return [
    problemNotice(view),
    caseHeader(record, person),
    caseTabs(panels, view.caseTab, { documents: (record.requests ?? []).length }),
  ].join("");
}
```

- [ ] **Step 5: Wire the dialog and the tab.**

In `src/views.mjs`:
- Add `correctionsDialogBody` to the import from `./staff-views.mjs`.
- In `dialog(state)`, next to the `close-case` branch, add:
  ```js
  if (state.dialog === "request-corrections") {
    title = "Ask the preparer for corrections";
    body = correctionsDialogBody(state);
  }
  ```
- In `staffScreen`, add `caseTab: state.caseTab,` to the `ui` object passed to both `renderAdminCase` and `renderStaffCase`.

In `src/app.mjs`:
- Next to `case "open-close-case":`, add:
  ```js
      case "open-request-corrections":
        openDialog("request-corrections");
        break;
  ```
- Next to `if (type === "CLOSE_CASE" && receipt) closeDialog();`, add:
  ```js
      if (type === "REQUEST_CORRECTIONS" && receipt) closeDialog();
  ```

- [ ] **Step 6: Run all unit tests and settle the old case tests.**

Run: `npm test`
Expected:
- The new tests pass.
- Pre-existing tests that relied on the old single-page order or on actions inside `preparationPanel` or `reviewPanel` may fail.

For each failure, decide:
- **(a)** The markup the test checks still exists somewhere on the page, and only an order-sensitive regex broke. Loosen the regex so it keeps its intent.
- **(b)** The test described behavior this task changes on purpose: actions moved into "Your next step", or corrections moved to the dialog. Update it to the new place.

Never delete a test's intent. List every test you changed, with (a) or (b), in your report. `tests/client-views.test.mjs` asserts `Preparation milestones` on the presenter's case workspace, and that still holds on Overview.

- [ ] **Step 7: Commit Tasks 2 and 3 together.**

```bash
git add src/staff-views.mjs src/views.mjs src/app.mjs tests/staff-views.test.mjs tests/client-views.test.mjs
git commit -m "Give the case page a header, five tabs and a next-step card

The lifecycle bar and name pills head the case; Overview holds Your next
step, the case details, preparation milestones and review attempts; each
action appears once, in the next-step card. Request corrections opens a
dialog wired to the same action.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The office case page in the same frame

**Files:**
- Modify: `src/admin-views.mjs` (`renderAdminCase`; its import from `./staff-views.mjs`)
- Test: `tests/admin-views.test.mjs`

**Interfaces:**
- Consumes: `caseTabs`, `caseHeader`, `caseDetails` (Task 2).
- Produces: the office case in tabs.
  - Overview holds: origin, intake checks, the assisted answers (office draft only), the documents the office took in, office actions and case details.
  - Intake answers holds the answers.
  - Documents holds the documents panel.
  - Follow-up holds the office follow-up.
  - History holds the history.

- [ ] **Step 1: Failing test.** Append to `tests/admin-views.test.mjs`:

```js
test("the office case page uses the same header and five tabs", () => {
  const html = renderAdminCase(officeCase(), { person: SAM, caseTab: "followup" });
  assert.match(html, /<h2 id="case-title">/);
  assert.match(html, /<ol class="lifecycle"/);
  assert.match(html, /id="case-tab-followup" aria-controls="case-panel-followup" aria-selected="true"/);
  assert.match(html, /id="case-panel-overview"[^>]*hidden>[\s\S]*How this case reached the office[\s\S]*Simulated intake checks[\s\S]*Case details/);
  assert.match(html, /id="case-panel-documents"[^>]*hidden>[\s\S]*<h2 id="documents-title">Documents<\/h2>/);
  assert.match(html, /id="case-panel-history"[^>]*hidden>[\s\S]*History/);
});
```

Use this file's existing `officeCase()` and `SAM` fixtures. If the intake-checks heading isn't "Simulated intake checks" for `officeCase()`'s stage, read `intakeChecksPanel` and use its real heading.

- [ ] **Step 2: Run and watch it fail.**

Run: `node --test tests/admin-views.test.mjs`
Expected: FAIL. The office page has no tabs yet.

- [ ] **Step 3: Implement.** In `src/admin-views.mjs`:
1. Add `caseTabs` and `caseDetails` to the existing import from `./staff-views.mjs`; `caseHeader` is already imported there.
2. Replace `renderAdminCase`'s `return [...]` with:

```js
  const origin = `<section class="panel" aria-labelledby="origin-title"><div class="section-head"><h2 id="origin-title">How this case reached the office</h2></div>${originRows(
    record,
  )}${detailRow("Stage", describeStage(record.stage).label)}<p class="field-note">${esc(
    OFFICE_NOTE,
  )}</p></section>`;
  const openFollowups = (record.followups ?? []).filter((task) => task?.status === "open").length;
  const panels = [
    [
      "overview",
      "Overview",
      [
        origin,
        intakeChecksPanel(record, rights, view),
        draftForOffice ? assistedAnswersPanel(record, rights, view) : "",
        receiptPanel(record, person, view),
        officeActionsPanel(record, rights, view),
        caseDetails(record),
      ].join(""),
    ],
    [
      "intake",
      "Intake answers",
      draftForOffice
        ? '<p class="muted">The office is filling in this walk-in client’s answers on Overview.</p>'
        : answersPanel(record),
    ],
    ["documents", "Documents", documentsPanel(record, staffRights, view)],
    ["followup", "Follow-up", adminFollowupPanel(record, person, view)],
    ["history", "History", historyPanel(record, Array.isArray(record.internalHistory))],
  ];
  return [
    problemNotice(view),
    caseHeader(record, person),
    caseTabs(panels, view.caseTab, {
      documents: (record.requests ?? []).length,
      followup: openFollowups,
    }),
  ].join("");
```

- [ ] **Step 4: Run all unit tests and settle the old office tests.**

Run: `npm test`
Expected: PASS once the pre-existing `tests/admin-views.test.mjs` assertions have been reviewed.
- Most of them match strings that are still rendered, because hidden panels stay in the HTML.
- Order-sensitive ones may need loosening; handle them as in Task 3 Step 6, (a) or (b).
- List each change in your report.

- [ ] **Step 5: Commit.**

```bash
git add src/admin-views.mjs tests/admin-views.test.mjs
git commit -m "Put the office case page in the same header and tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Styles for the case page

**Files:**
- Modify: `src/styles.css` (append a block; restyle `.detail-row`, `.modal` and `.modal-backdrop` with tokens)
- Test: `tests/shell.test.mjs`

**Interfaces:**
- Consumes: the class names and ids from Tasks 2–4, the `--vt-*` tokens, and `.app-main .narrow` (PR 1).

- [ ] **Step 0: Failing test.** Append to `tests/shell.test.mjs`, which already imports `readFileSync` and `fileURLToPath` and reads the stylesheet for the PR 1 sidebar check:

```js
test("an inactive case tab is not displayed", () => {
  const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
  // Any author `display` on .case-panel overrides [hidden] unless this exists.
  assert.match(css, /\.case-panel\[hidden\]\s*\{[^}]*display:\s*none/);
});
```

Run `node --test tests/shell.test.mjs`. Expected: FAIL.

- [ ] **Step 1: Append the case page block** at the end of `src/styles.css`:

```css
/* ---- The case page (restyle PR 2) ---- */
.staff-header {
  padding: 20px 22px;
  border-color: var(--vt-line);
  border-radius: var(--vt-radius);
}
.case-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
}
.case-title-row h2 {
  margin: 0;
  font-family: var(--vt-serif);
  font-size: 30px;
  font-weight: 400;
  color: var(--vt-ink);
}
.case-people {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.name-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid var(--vt-line);
  border-radius: 999px;
  background: var(--vt-surface);
  font-size: 13px;
}
.name-pill small {
  color: var(--vt-muted);
}
.lifecycle {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 18px 0 8px;
  overflow-x: auto;
}
.lifecycle-step {
  flex: 1 0 96px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--vt-muted);
  text-align: center;
}
.lifecycle-step::before {
  content: "";
  position: absolute;
  top: 6px;
  left: -50%;
  width: 100%;
  height: 2px;
  background: var(--vt-line);
}
.lifecycle-step:first-child::before {
  display: none;
}
.lifecycle-dot {
  position: relative;
  z-index: 1;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--vt-surface);
  border: 2px solid var(--vt-primary-line);
}
.lifecycle-step.done .lifecycle-dot,
.lifecycle-step.done::before,
.lifecycle-step.current::before {
  background: var(--vt-progress);
  border-color: var(--vt-progress);
}
.lifecycle-step.current .lifecycle-dot {
  border-color: var(--vt-primary);
  background: var(--vt-primary);
  box-shadow: 0 0 0 4px var(--vt-primary-soft);
}
.lifecycle-step.current .lifecycle-label {
  color: var(--vt-ink);
  font-weight: 600;
}
.lifecycle-step.amend .lifecycle-dot {
  border-color: var(--vt-stage-amend);
  background: var(--vt-stage-amend);
  box-shadow: 0 0 0 4px var(--vt-stage-amend-bg);
}
.case-tabs {
  display: flex;
  gap: 22px;
  margin: 22px 0 16px;
  border-bottom: 1px solid var(--vt-line);
  overflow-x: auto;
}
.case-tab {
  min-height: var(--vt-tap);
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 10px 0;
  color: var(--vt-muted);
  font-weight: 500;
  white-space: nowrap;
}
.case-tab:hover {
  color: var(--vt-ink);
}
.case-tab.selected {
  border-bottom-color: var(--vt-primary);
  color: var(--vt-primary);
  font-weight: 600;
}
.case-tab:focus-visible {
  outline-offset: -3px;
}
.case-panel {
  display: grid;
  gap: 16px;
}
/* The author `display: grid` above beats the browser's own [hidden] rule, so an
   inactive tab would still show without this (the same trap as the PR 1
   sidebar). */
.case-panel[hidden] {
  display: none;
}
.case-panel:focus-visible {
  outline: 2px solid var(--vt-primary);
  outline-offset: 4px;
}
.case-panel > .panel {
  padding: 18px 20px;
  border-color: var(--vt-line);
  border-radius: var(--vt-radius);
}
.case-panel > .next-step {
  /* Same specificity as `.case-panel > .panel`, and later, so the accent wins. */
  border-left: 4px solid var(--vt-primary);
}
.next-step-waiting {
  color: var(--vt-muted);
  margin: 0 0 12px;
}
.next-step-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.case-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 24px;
}
.case-details .section-head {
  grid-column: 1 / -1;
}
.detail-row {
  border-bottom-color: var(--vt-line);
}
.detail-row span {
  color: var(--vt-muted);
}
.detail-row strong {
  color: var(--vt-ink);
}
@media (max-width: 800px) {
  .case-details {
    grid-template-columns: minmax(0, 1fr);
  }
  .case-people {
    margin-left: 0;
  }
}
```

- [ ] **Step 2: Restyle the dialog with tokens.** In the existing `.modal-backdrop` and `.modal` rules:
  - backdrop: `background: rgb(42 39 69 / 0.45);`
  - modal: `border-radius: var(--vt-radius); border: 1px solid var(--vt-line); background: var(--vt-surface); color: var(--vt-ink);`

  Keep the layout and sizing properties as they are. Replace only the colors, border and radius, and add no new hex values.

- [ ] **Step 3: Check the rendering in a real browser, with a fixture harness.**
  - **What to render:**
    - `renderStaffCase` for a decorated `reviewing` case (Morgan) and a `corrections_required` case (Alex), with `caseTab` set to `overview` and to `documents`. Wrap each in `appShell` + `staffSidebar` + `<main id="main" class="narrow">`, and link `src/styles.css`, as in the PR 1 plan's Task 6 Step 6.
    - `correctionsDialogBody` inside the `.modal-backdrop > .modal` markup that `dialog()` in `src/views.mjs` produces. Copy that markup from `dialog()`.
  - **Screenshots:** take them at 1440×900 and 390×844 with Puppeteer, using `executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`. Save them under `.superpowers/` (git-ignored scratch).
  - **Checks:**
    - `document.documentElement.scrollWidth === innerWidth` at both sizes.
    - Only the active panel is displayed: `[...document.querySelectorAll('[role=tabpanel]')].filter(p => getComputedStyle(p).display !== 'none').length === 1`.
    - The "Your next step" card shows its primary-colored left accent.
    - Compare against `docs/design/screens/case-tabs-overview.png`, `case-preparer-view-v3-full-page.png` and `case-corrections-dialog-lav-full-page.png`. Fix gaps that are in this task's scope; list the rest.

- [ ] **Step 4: Run the unit tests.**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/styles.css tests/shell.test.mjs
git commit -m "Style the case page header, lifecycle bar, tabs, next step and dialog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Browser suite: open the right tab, open the corrections dialog

**Files:**
- Modify: `tests/support/story-pages.mjs`:
  - new `revealCaseControl` and `openCaseTab`
  - call `revealCaseControl` in `clickCaseAction`, `submitCaseForm` and `tickBox`
- Modify: `tests/browser.mjs`:
  - the "Sam records the call…" phase
  - the Morgan corrections step

**Interfaces:**
- Consumes: the tab DOM from Tasks 2–4: `[role="tabpanel"][hidden]`, and `[role="tab"][aria-controls]`.
- Produces:
  - `revealCaseControl(page, selector)`: if the first element matching `selector` sits in a hidden tab panel, it clicks that panel's tab and waits for it to show.
  - `openCaseTab(page, key)`.

- [ ] **Step 1: Add the helpers.** In `tests/support/story-pages.mjs`, above `clickCaseAction` (find it by name):

```js
/**
 * Show the case-page tab that holds a control, when it is on a hidden tab. The
 * case page renders every tab and hides the inactive ones (restyle PR 2), so a
 * control can exist and still be unreachable until its tab is chosen.
 */
export async function revealCaseControl(page, selector) {
  const panel = await page.evaluate(
    (wanted) => document.querySelector(wanted)?.closest('[role="tabpanel"][hidden]')?.id ?? null,
    selector,
  );
  if (!panel) return;
  await page.locator(`[role="tab"][aria-controls="${panel}"]`).click({ timeout: CLICK_MS });
  await waitFor(
    page,
    `the ${panel} tab to be shown`,
    (id) => document.getElementById(id)?.hidden === false,
    panel,
    RENDER_MS,
  );
}

/** Show one case-page tab by its key (overview, intake, documents, followup, history). */
export async function openCaseTab(page, key) {
  await waitForQuiet(page);
  await page.locator(`#case-tab-${key}`).click({ timeout: CLICK_MS });
  await waitFor(
    page,
    `the ${key} tab to be shown`,
    (id) => document.getElementById(id)?.hidden === false,
    `case-panel-${key}`,
    RENDER_MS,
  );
}
```

Then:
- In `clickCaseAction`, before its `page.locator(...).first().click(...)`, add:
  ```js
  await revealCaseControl(page, `[data-case-action="${type}"]${attributes}`);
  ```
- In `submitCaseForm`, as its first statement, add:
  ```js
  await revealCaseControl(page, `button[type="submit"][data-case-action="${type}"]${attributes}`);
  ```
- In `tickBox`, after `await waitForQuiet(page);`, add:
  ```js
  await revealCaseControl(page, `#${id}`);
  ```

- [ ] **Step 2: Update the story.** In `tests/browser.mjs`:
  - Add `openCaseTab` to the import from `./support/story-pages.mjs`, and `clickAction` if it isn't already imported.
  - In the phase `"Sam records the call and resolves the task; Alex stays the preparer"`, change
    `await waitForText(staff, "Follow-up with the client", RENDER_MS);` to:
    ```js
          // The follow-up is on the office case page's Follow-up tab.
          await openCaseTab(staff, "followup");
          await waitForText(staff, "Follow-up with the client", RENDER_MS);
    ```
  - In the phase `"Morgan reviews: a finding, Alex's resubmission, then approval"`, before `await actForm(staff, "REQUEST_CORRECTIONS", …)`, add:
    ```js
          // Corrections are asked for in a dialog; its form is the payload.
          await clickAction(staff, "open-request-corrections");
    ```

- [ ] **Step 3: Check every other case-page interaction.** Run:
  ```bash
  grep -n 'waitForText(staff\|act(staff\|actForm(\|tickBox(staff' tests/browser.mjs
  ```
  For each hit on a case page, state which tab holds its control or text at that moment. Remember:
  - the tab resets to Overview when a case opens or the persona changes;
  - `revealCaseControl` opens the right tab before a press;
  - a `waitForText` on text in a hidden tab needs an `openCaseTab` first.

  Fix any spot that needs one. List the table in your report.

- [ ] **Step 4: Run all four suites.** Make sure the test stack is up:
  ```bash
  docker start $(docker ps -aq --filter name=vitally-task2)
  ```
  Wait until `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/auth/v1/health` prints `200` and the realtime container is healthy. Then:
  ```bash
  npm test && npm run test:database && npm run test:auth-browser && npm run test:browser
  ```
  Expected: all PASS.

  If `test:browser` fails, read the failure and its screenshots under `artifacts/browser/`, fix the cause, and re-run. If a failure is in a part of the story this PR doesn't touch, re-run once to tell a flake from a regression, and report both runs.

- [ ] **Step 5: Commit.**

```bash
git add tests/support/story-pages.mjs tests/browser.mjs
git commit -m "Let the browser story reach controls on the case page's tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Screenshots, docs and the pull request

**Files:**
- Add: `docs/design/screens/implemented-case-page.png`, `docs/design/screens/implemented-corrections-dialog.png`
- Modify: `docs/design/README.md`, `docs/design/redesign-review.md` (status line)

- [ ] **Step 1: Capture the implemented screens from the running app.**
  - Start the app with `npm start`; the test stack must be up.
  - Sign in as the presenter.
  - Choose Morgan and open a case in review; take a 1440px screenshot of Overview.
  - Open **Ask the preparer for corrections** and take a second screenshot.
  - Save them as the two files above, and close the dialog without sending.
  - If signing in through the app isn't practical, use the Task 5 fixture harness instead, and say "rendered from test fixtures" in the README row.

- [ ] **Step 2: Check the logo is unchanged.**
  ```bash
  shasum -a 256 src/pcdc-logo.png "docs/media/Shao-Transparent BLUE.png"
  ```
  Expected: the same hash twice.

- [ ] **Step 3: Update the docs.**
  - In `docs/design/README.md`, under the case-page rows, add:
    ```markdown
    | Implemented (part 1, PR 2): case page with tabs and next step | [implemented-case-page.png](screens/implemented-case-page.png) · [corrections dialog](screens/implemented-corrections-dialog.png) |
    ```
  - In `docs/design/redesign-review.md`, change the status line's "Phase 1, the work board, is next." to "Part 1 PR 1 (work board) is merged; PR 2 (case page) is in review."

- [ ] **Step 4: Commit and push.**
  ```bash
  git add docs/design
  git commit -m "Add the implemented case page screenshots

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  git push -u origin restyle-pr2-case
  ```

- [ ] **Step 5: Open the PR.** `gh` isn't installed, so give the user this compare link with the title and description pre-filled:
  `https://github.com/jin-yu-yang/VITA-Management-System-Demo/compare/main...restyle-pr2-case?expand=1`
  - Title: "Restyle PR 2: the case page".
  - The description lists what changed, which tests changed on purpose, and the four suite results.
  - It ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
