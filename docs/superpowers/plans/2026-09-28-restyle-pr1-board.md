# Restyle PR 1: staff frame, shared elements and the three-tab work board

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the staff screens in the new sidebar frame. Restyle the shared elements. Replace the volunteer work board's six status chips with the three decided tabs, a search box and a table, all on today's 9 stages.

**Architecture:**
- **Restyle in place.** The existing renderers keep their data flow and emit new markup that uses the `--vt-*` tokens added in Phase 0.
- **Tab membership.** It comes from one pure function, `phaseTab()` in `src/domain.mjs`.
- **Board choices.** The filters and the new search stay in the controller's `boardFilters`, persisted by `window-state.mjs`.
- **Sidebar state.** A new `sidebarOpen` choice, also persisted by `window-state.mjs`.
- **No database change.**

**Tech Stack:**
- Vanilla ES modules (`src/*.mjs`) rendering HTML strings.
- Hand-written `src/styles.css`.
- `node:test` for unit tests.
- Playwright for the browser suites (`tests/browser.mjs`, `tests/auth-browser.mjs`).
- Supabase for the database suites.

**Spec:** `docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md` (sections 3–5 and 9; PR 1 only). Design reference: `.stitch/designs/staff-board-v7.html`, screenshot `docs/design/screens/staff-board-v7-full-page.png`.

## Global Constraints

- Part 1 changes no database schema.
- `npm test`, `npm run test:database`, `npm run test:auth-browser` and `npm run test:browser` pass. The last three reset the local Supabase on port 54321: run them only when no other local project is using those ports.
- Existing `data-action`, `data-case-action`, ids, roles and accessible names stay, except where this plan changes them on purpose (board status values).
- The logo is `src/pcdc-logo.png`, referenced by the relative path `src/pcdc-logo.png` (GitHub Pages serves the repository root). It is never regenerated or recolored.
- Colors come from the `--vt-*` tokens in `src/styles.css`. Do not add new hex values in rules this plan writes.
- Controls are at least `var(--vt-tap)` (44px) high, except inline text links and the compact filter pills.
- Only fictional data.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File map

| File | Change |
|---|---|
| `src/domain.mjs` | Add `BOARD_TABS` and `phaseTab(record)` |
| `src/ui.mjs` | Add `relativeDay(value, now)`; stage badges use design families |
| `src/staff-views.mjs` | New board filters, counts and markup; remove the six status groups |
| `src/controller.mjs` | `toggleSidebar()`, `sidebarOpen`; choosing a tab ends a search |
| `src/window-state.mjs` | Persist `sidebarOpen` |
| `src/app.mjs` | `toggle-sidebar` click; `board-search-form` submit |
| `src/views.mjs` | `staffSidebar()`; staff screens inside `appShell()`; no site header for presenters |
| `src/styles.css` | Shared elements restyled with tokens; sidebar, board table, tabs, search, presenter strip |
| `tests/domain.test.mjs`, `tests/ui.test.mjs`, `tests/staff-views.test.mjs`, `tests/controller.test.mjs`, `tests/window-state.test.mjs`, `tests/shell.test.mjs` | Unit tests |
| `tests/support/story-pages.mjs`, `tests/browser.mjs` | Find cases by searching; count the whole workspace |

---

### Task 1: The board's tab for a case

**Files:**
- Modify: `src/domain.mjs` (after `describeStage`, around line 139)
- Test: `tests/domain.test.mjs`

**Interfaces:**
- Produces:
  - `BOARD_TABS`: a frozen array of `[value, label]` pairs: `[["available","Available"],["preparation","Waiting for preparation"],["review","Waiting for review"]]`.
  - `phaseTab(record)`: returns `"available" | "preparation" | "review" | null`.

- [ ] **Step 1: Write the failing test.** Append to `tests/domain.test.mjs`, and add `phaseTab, BOARD_TABS` to its import from `../src/domain.mjs`:

```js
test("each of today's stages belongs to exactly one board tab, or none", () => {
  assert.deepEqual(
    BOARD_TABS.map(([value]) => value),
    ["available", "preparation", "review"],
  );
  const cases = [
    [{ stage: "preparation_ready", preparerId: null }, "available"],
    [{ stage: "preparation_ready", preparerId: "alex" }, "preparation"],
    [{ stage: "preparing", preparerId: "alex" }, "preparation"],
    [{ stage: "corrections_required", preparerId: "alex" }, "preparation"],
    [{ stage: "review_ready", reviewerId: null }, "review"],
    [{ stage: "reviewing", reviewerId: "morgan" }, "review"],
    [{ stage: "draft" }, null],
    [{ stage: "received" }, null],
    [{ stage: "review_approved" }, null],
    [{ stage: "closed" }, null],
    [{ stage: "nonsense" }, null],
    [null, null],
  ];
  for (const [record, tab] of cases)
    assert.equal(phaseTab(record), tab, JSON.stringify(record));
});
```

- [ ] **Step 2: Run it and watch it fail.**

Run: `node --test tests/domain.test.mjs`
Expected: FAIL. `phaseTab` is not exported.

- [ ] **Step 3: Implement.** Add after `describeStage` in `src/domain.mjs`:

```js
// The volunteer work board's three tabs (spec 2026-09-28, section 5), on
// today's nine stages. Draft and received cases are the office's intake;
// approved and closed cases are finished. Neither has a tab, and the board's
// search is how a volunteer reaches them. Part 3 of the roadmap replaces the
// stage list, and with it this mapping.
export const BOARD_TABS = Object.freeze([
  ["available", "Available"],
  ["preparation", "Waiting for preparation"],
  ["review", "Waiting for review"],
]);

export function phaseTab(record) {
  switch (record?.stage) {
    case "preparation_ready":
      return record?.preparerId ? "preparation" : "available";
    case "preparing":
    case "corrections_required":
      return "preparation";
    case "review_ready":
    case "reviewing":
      return "review";
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run it and watch it pass.**

Run: `node --test tests/domain.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/domain.mjs tests/domain.test.mjs
git commit -m "Name the work board's three tabs and which stages belong to each

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Relative dates and badge families

**Files:**
- Modify: `src/ui.mjs` (`formatTime` around line 120, `STAGE_TONES` and `stageBadge` around line 150)
- Test: `tests/ui.test.mjs`

**Interfaces:**
- Produces:
  - `relativeDay(value, now = Date.now())`: returns `"Today" | "Yesterday" | "N days ago" | "Sep 3"`, or `""` for an unreadable date.
  - `stageBadge(stage)`: now emits `class="badge <family>"`, where the family is one of `intake`, `prep`, `amend`, `filing`, `neutral`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/ui.test.mjs`, and add `relativeDay` to the import from `../src/ui.mjs`:

```js
test("dates on the board read as days, not timestamps", () => {
  const now = new Date(2026, 8, 14, 12, 0).getTime();
  const at = (day, hour = 9) => new Date(2026, 8, day, hour, 0).toISOString();
  assert.equal(relativeDay(at(14), now), "Today");
  assert.equal(relativeDay(at(13, 23), now), "Yesterday");
  assert.equal(relativeDay(at(12), now), "2 days ago");
  assert.equal(relativeDay(at(8), now), "6 days ago");
  assert.equal(relativeDay(at(3), now), "Sep 3");
  assert.equal(relativeDay("not a date", now), "");
  assert.equal(relativeDay(null, now), "");
});

test("stage badges carry the design's family and keep their words", () => {
  const family = (stage) => /class="badge ([a-z]+)"/.exec(stageBadge(stage))?.[1];
  assert.equal(family("draft"), "intake");
  assert.equal(family("received"), "intake");
  for (const stage of ["preparation_ready", "preparing", "review_ready", "reviewing"])
    assert.equal(family(stage), "prep", stage);
  assert.equal(family("corrections_required"), "amend");
  assert.equal(family("review_approved"), "filing");
  assert.equal(family("closed"), "neutral");
  assert.equal(family("nonsense"), "neutral");
  assert.match(stageBadge("review_approved"), /Review complete/);
});
```

- [ ] **Step 2: Run them and watch them fail.**

Run: `node --test tests/ui.test.mjs`
Expected: FAIL. `relativeDay` is not exported, and the families don't match.

- [ ] **Step 3: Implement.** In `src/ui.mjs`, add after `formatTime`:

```js
// How long ago, in days, for lists where the minute does not matter. Dates are
// compared as calendar days in the viewer's time zone, so a case updated late
// last night reads "Yesterday", not "Today".
export function relativeDay(value, now = Date.now()) {
  const at = new Date(value ?? "");
  if (Number.isNaN(at.getTime())) return "";
  const today = new Date(now);
  const calendarDay = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((calendarDay(today) - calendarDay(at)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
```

Then replace `STAGE_TONES` with the design's families. `stageBadge` itself does not change:

```js
// Colour is never the only signal: every badge carries its own words, and the
// words come from the one stage table in domain.mjs. The colour is the stage's
// family in the redesign (docs/design/DESIGN.md): intake, preparation and
// review, amendment, filing, or neutral.
const STAGE_TONES = Object.freeze({
  draft: "intake",
  received: "intake",
  preparation_ready: "prep",
  preparing: "prep",
  review_ready: "prep",
  reviewing: "prep",
  corrections_required: "amend",
  review_approved: "filing",
  closed: "neutral",
});
```

- [ ] **Step 4: Check the label the test expects.**

Run: `node -e "import('./src/domain.mjs').then(m=>console.log(m.describeStage('review_approved').label))"`
Expected: `Review complete`. If it prints something else, change that one assertion to the printed label.

- [ ] **Step 5: Run the tests.**

Run: `npm test`
Expected: PASS. The old tone names (`blue`, `teal`…) are no longer produced by `stageBadge`. Task 6 restyles them anyway, because `admin-views.mjs:830` still writes `badge blue` directly.

- [ ] **Step 6: Commit.**

```bash
git add src/ui.mjs tests/ui.test.mjs
git commit -m "Add day-level dates and give stage badges the design's families

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Board filters, search and counts

**Files:**
- Modify: `src/staff-views.mjs:326-414` (defaults, groups, `filterCases`, `boardCounts`)
- Modify: `src/controller.mjs:745-750` (`setBoardFilter`)
- Test: `tests/staff-views.test.mjs`, `tests/controller.test.mjs`

**Interfaces:**
- Consumes: `phaseTab`, `BOARD_TABS` (Task 1).
- Produces:
  - `DEFAULT_BOARD_FILTERS = { status: "available", assignment: "anyone", language: "all", service: "all", search: "" }`.
  - `boardFilters(filters)`: normalized filters; an unknown `status` becomes `"available"`, and an unknown `assignment` becomes `"anyone"`.
  - `filterCases(cases, filters, person)`: the rows on screen.
  - `boardCounts(cases, filters, person)`: returns `{ available, preparation, review }`. **The signature changes: it now takes the filters.**
  - `controller.setBoardFilter("status", v)`: also removes `search`.

- [ ] **Step 1: Check that nothing else uses what is being removed.**

Run: `grep -n "boardCounts\|filterCases\|STATUS_GROUPS\|ASSIGNMENT_GROUPS\|inStatusGroup" src/*.mjs`
Expected: only `src/staff-views.mjs`. (`src/admin-views.mjs:569` uses `boardFilters(...).language`, which keeps working.)

- [ ] **Step 2: Rewrite the failing filter test.** In `tests/staff-views.test.mjs`, replace the whole test `"the board filters on four axes and counts what it shows"` with:

```js
test("the board shows one tab at a time, and search reaches every stage", () => {
  // BOARD: case-1 available, case-2 preparing (Alex), case-3 review_ready
  // (prepared by Alex), case-4 reviewing (Alex/Morgan), case-5 closed.
  assert.deepEqual(DEFAULT_BOARD_FILTERS, {
    status: "available",
    assignment: "anyone",
    language: "all",
    service: "all",
    search: "",
  });
  const ids = (filters, person = ALEX) =>
    filterCases(BOARD, filters, person).map((record) => record.id);

  assert.deepEqual(ids({}), ["case-1"], "Available is the default tab");
  assert.deepEqual(ids({ status: "preparation" }), ["case-2"]);
  assert.deepEqual(ids({ status: "review" }), ["case-3", "case-4"]);
  // Mine / Everyone narrows only the two waiting tabs.
  assert.deepEqual(ids({ status: "review", assignment: "mine" }, MORGAN), ["case-4"]);
  assert.deepEqual(ids({ status: "preparation", assignment: "mine" }, MORGAN), []);
  assert.deepEqual(ids({ status: "available", assignment: "mine" }, MORGAN), ["case-1"]);
  // Old saved values fall back instead of hiding everything.
  for (const old of ["all", "mine", "in_progress", "waiting", "done"])
    assert.deepEqual(ids({ status: old }), ["case-1"], old);
  assert.equal(boardFilters({ assignment: "unassigned" }).assignment, "anyone");
  // Language and service still narrow the tab.
  assert.deepEqual(ids({ status: "review", language: "English" }), ["case-4"]);
  // Search ignores the tab and the scope, keeps language and service, and
  // reaches stages that have no tab.
  assert.deepEqual(ids({ search: "eeee" }), ["case-5"]);
  assert.deepEqual(ids({ status: "review", assignment: "mine", search: "VT-" }, MORGAN), [
    "case-1",
    "case-2",
    "case-3",
    "case-4",
    "case-5",
  ]);
  assert.deepEqual(ids({ search: "VT-", language: "Cantonese" }), ["case-2", "case-3"]);
  assert.deepEqual(ids({ search: "   " }), ["case-1"], "blank search is no search");

  // Counts: one per tab, respecting language, service and scope.
  assert.deepEqual(boardCounts(BOARD, {}, ALEX), { available: 1, preparation: 1, review: 2 });
  assert.deepEqual(boardCounts(BOARD, { assignment: "mine" }, MORGAN), {
    available: 1,
    preparation: 0,
    review: 1,
  });
  assert.deepEqual(boardCounts(BOARD, { language: "Cantonese" }, ALEX), {
    available: 0,
    preparation: 1,
    review: 1,
  });
});
```

Add `boardFilters` to the import list at the top of the file (next to `filterCases`).

- [ ] **Step 3: Run it and watch it fail.**

Run: `node --test tests/staff-views.test.mjs`
Expected: FAIL. `boardFilters` is not exported, and the defaults differ.

- [ ] **Step 4: Implement the filters.** In `src/staff-views.mjs`:

1. Import `phaseTab` and `BOARD_TABS` from `./domain.mjs`, next to `describeStage`.
2. Replace everything from `export const DEFAULT_BOARD_FILTERS` down to the end of `boardCounts` with:

```js
export const DEFAULT_BOARD_FILTERS = Object.freeze({
  status: "available",
  assignment: "anyone",
  language: "all",
  service: "all",
  search: "",
});

const TAB_VALUES = Object.freeze(BOARD_TABS.map(([value]) => value));
const SCOPE_VALUES = Object.freeze(["anyone", "mine"]);

const mine = (record, personId) =>
  Boolean(personId) &&
  (record?.preparerId === personId || record?.reviewerId === personId);

// The board's choices with its own defaults filled in. A value saved by an
// older version of the board (`in_progress`, `unassigned`…) falls back to the
// default rather than hiding every case.
export function boardFilters(filters) {
  const chosen = { ...DEFAULT_BOARD_FILTERS, ...(filters ?? {}) };
  if (!TAB_VALUES.includes(chosen.status)) chosen.status = DEFAULT_BOARD_FILTERS.status;
  if (!SCOPE_VALUES.includes(chosen.assignment))
    chosen.assignment = DEFAULT_BOARD_FILTERS.assignment;
  chosen.search = String(chosen.search ?? "").trim();
  return chosen;
}

const inLanguageAndService = (record, chosen) =>
  (chosen.language === "all" || (record?.answers?.language ?? "") === chosen.language) &&
  (chosen.service === "all" || (record?.answers?.service ?? "") === chosen.service);

const matchesSearch = (record, search) =>
  String(record?.reference ?? "")
    .toUpperCase()
    .includes(search.toUpperCase());

const onTab = (record, chosen, personId) =>
  phaseTab(record) === chosen.status &&
  (chosen.status === "available" || chosen.assignment === "anyone" || mine(record, personId));

/**
 * The records one set of choices leaves on screen. A search looks across every
 * stage, tab or no tab, so a volunteer can reopen a submitted, approved or
 * closed case by its Application ID.
 */
export function filterCases(cases = [], filters, person = null) {
  const chosen = boardFilters(filters);
  const personId = person?.id ?? null;
  const narrowed = cases.filter((record) => inLanguageAndService(record, chosen));
  return chosen.search
    ? narrowed.filter((record) => matchesSearch(record, chosen.search))
    : narrowed.filter((record) => onTab(record, chosen, personId));
}

/** How many cases each tab would show with the other choices as they are. */
export function boardCounts(cases = [], filters, person = null) {
  const chosen = boardFilters(filters);
  return Object.fromEntries(
    TAB_VALUES.map((tab) => [
      tab,
      filterCases(cases, { ...chosen, status: tab, search: "" }, person).length,
    ]),
  );
}
```

3. Delete the old `const mine = …` that sat above `inStatusGroup`, because the new block defines it. Also delete `STATUS_GROUPS`, `ASSIGNMENT_GROUPS`, `IN_PROGRESS_STAGES`, `WAITING_STAGES`, `DONE_STAGES`, `inStatusGroup`, `inAssignmentGroup` and the old `export const boardFilters = …` one-liner.
4. Change `FILTER_GROUP_LABELS.assignment` from `"Assignment"` to `"Whose cases"`.

`renderStaffBoard` still references the removed groups, so the file won't work until Task 4. Keep going: Task 4 lands in the same PR, and its tests run after both.

- [ ] **Step 5: Choosing a tab ends a search: failing test.** In `tests/controller.test.mjs`, inside `"the board's filters are this window's, kept per user and dropped on sign-out"`, replace `again.controller.setBoardFilter("status", "mine");` with:

```js
  again.controller.setBoardFilter("search", "VT-AAAA");
  assert.equal(again.controller.getState().boardFilters.search, "VT-AAAA");
  // Choosing a tab is choosing what to see, so it ends the search.
  again.controller.setBoardFilter("status", "review");
  assert.deepEqual(again.controller.getState().boardFilters, { status: "review" });
```

- [ ] **Step 6: Implement it.** In `src/controller.mjs`, replace `setBoardFilter`:

```js
  function setBoardFilter(name, value) {
    if (!name) return;
    const next = { ...state.boardFilters, [name]: String(value ?? "") };
    // A tab is what the person asked to see, so choosing one ends a search.
    if (name === "status") delete next.search;
    state.boardFilters = next;
    persistSession();
    show();
  }
```

- [ ] **Step 7: Run the controller tests.**

Run: `node --test tests/controller.test.mjs`
Expected: PASS.

- [ ] **Step 8: Commit** together with Task 4, once the board renders again (see Task 4, Step 6).

---

### Task 4: The work board's markup and search form

**Files:**
- Modify: `src/staff-views.mjs:423-535` (`filterChips` stays; `fact`, `boardRow` and `renderStaffBoard` are replaced)
- Modify: `src/app.mjs:688-740` (the submit handler)
- Test: `tests/staff-views.test.mjs`

**Interfaces:**
- Consumes:
  - `boardFilters`, `filterCases`, `boardCounts` (Task 3).
  - `relativeDay`, `stageBadge` (Task 2).
  - `BOARD_TABS` (Task 1).
- Produces:
  - `renderStaffBoard(cases, people, ui)`, with `ui = { person, personId, filters, busy, now }`. `ui.now` defaults to `Date.now()`.
  - The DOM hooks later tasks and the browser suite rely on:
    - `section.staff-board`, whose `.section-head` holds "Showing X of Y cases". Y is every case the board holds.
    - `tr.board-row`, with the class `own` on the current persona's rows.
    - `button.board-reference[data-action="open-case"][data-case-id]`.
    - `form#board-search-form`, containing `input#field-board-search[name="boardSearch"]`.
    - Tab buttons `[data-action="set-board-filter"][data-filter="status"][data-value]`.

- [ ] **Step 1: Update the board tests that describe the old markup.** In `tests/staff-views.test.mjs`:

(a) In `"available work is exactly the two unclaimed states"`, replace the last two lines (the board comment and the `VT-AAAA-1111 … Available` match) with:

```js
  // The Available tab is where unclaimed preparation shows up on the board.
  assert.ok(shows(board({ person: ALEX }), "VT-AAAA-1111"));
```

(b) Replace the test `"the board names the workflow and no taxpayer"` with:

```js
test("the board names the workflow and no taxpayer", () => {
  const html = board({ person: ALEX, filters: { status: "review" } });
  assert.match(html, /Drop-off/);
  assert.match(html, /Cantonese/);
  assert.match(html, new RegExp(describeStage("review_ready").label));
  // Alex prepared case-3, so the review claim is refused in place, with why.
  assert.match(html, /VT-CCCC-3333[\s\S]*prepared this case/i);
  const withIdentifiers = renderStaffBoard(
    [
      boardCase({
        answers: {
          service: "Drop-off",
          language: "English",
          firstName: "Mei",
          lastName: "Chen",
          address: "123 Arch Street",
          zip: "19107",
        },
      }),
    ],
    PEOPLE,
    { person: ALEX },
  );
  for (const identifier of ["Mei", "Chen", "Arch Street", "19107"])
    assert.ok(!withIdentifiers.includes(identifier), identifier);
  assert.doesNotMatch(withIdentifiers, /\$/);
  assert.doesNotMatch(withIdentifiers, /refund|routing|deposit/i);
});
```

(c) In `"reminders are shown per case and counted on the board"`, rename it to `"reminders are shown on the case page, not the board"` and replace its first four assertions (the three board `Last reminded` / `reminded.` matches and the `status: "done"` one) with:

```js
  assert.doesNotMatch(board({ person: ALEX, filters: { status: "review" } }), /Last reminded/);
```

Keep the rest of that test (the `renderStaffCase` assertions) as it is.

(d) Add a new test for the screen itself:

```js
test("the board draws tabs with counts, a search box and one table", () => {
  const now = new Date(2026, 8, 14, 12, 0).getTime();
  const html = board({ person: ALEX, filters: { status: "review" }, now });
  // Tabs keep the filter hook and say how many each holds.
  for (const [value, count] of [["available", 1], ["preparation", 1], ["review", 2]])
    assert.match(
      html,
      new RegExp(
        `data-action="set-board-filter" data-filter="status" data-value="${value}" aria-pressed="${value === "review"}"[^>]*>[^<]*<span class="tab-count">${count}</span>`,
      ),
    );
  assert.match(html, /Showing 2 of 5 cases/);
  assert.match(html, /<form id="board-search-form"[^>]*role="search"/);
  assert.match(html, /<input id="field-board-search" name="boardSearch" type="search"/);
  assert.match(html, /<table class="board-table">/);
  assert.equal((html.match(/<tr class="board-row/g) ?? []).length, 2);
  // Mine / Everyone shows on the waiting tabs only.
  assert.match(html, /data-filter="assignment" data-value="mine"/);
  assert.doesNotMatch(board({ person: ALEX }), /data-filter="assignment"/);
  // The current persona reads as "You", and their rows are marked and first.
  assert.match(html, /<tr class="board-row own">[\s\S]*?VT-CCCC-3333/);
  assert.match(html, /<strong class="you">You<\/strong>/);
  assert.match(html, /Unassigned/);
  // Dates read as days (built in local time, so any time zone agrees).
  const dated = renderStaffBoard(
    [boardCase({ updatedAt: new Date(2026, 8, 12, 9, 0).toISOString() })],
    PEOPLE,
    { person: ALEX, now },
  );
  assert.match(dated, /2 days ago/);
  // Actions: Claim review for a reviewer; Open when nothing can be claimed.
  const morgan = board({ person: MORGAN, filters: { status: "review" }, now });
  assert.match(morgan, /data-case-action="CLAIM_REVIEW" data-case-id="case-3"/);
  assert.match(morgan, /data-action="open-case" data-case-id="case-4"[^>]*>Open</);
  // Dropped columns stay dropped.
  assert.doesNotMatch(html, /Work needed|Requires|Last reminded/);
});

test("search results replace the tab, and empty states say what to do", () => {
  const found = board({ person: ALEX, filters: { status: "review", search: "eeee" } });
  assert.match(found, /Search results/);
  assert.match(found, /Showing 1 of 5 cases/);
  assert.ok(shows(found, "VT-EEEE-5555"), "a closed case is reachable by search");
  assert.match(found, /aria-pressed="false"[^>]*>Waiting for review/);
  assert.match(found, /data-action="set-board-filter" data-filter="search" data-value=""/);

  const none = board({ person: ALEX, filters: { search: "ZZZZ" } });
  assert.match(none, /No case matches “ZZZZ”\./);
  assert.match(none, /data-action="clear-board-filters"/);

  const quiet = renderStaffBoard([], PEOPLE, { person: ALEX });
  assert.match(quiet, /Nothing to claim right now/);
  const mineOnly = board({ person: MORGAN, filters: { status: "preparation", assignment: "mine" } });
  assert.match(mineOnly, /Nothing of yours is waiting for preparation\./);
  const narrowed = board({ person: ALEX, filters: { language: "Polish" } });
  assert.match(narrowed, /Nothing on this tab matches these filters\./);
  assert.match(narrowed, /data-action="clear-board-filters"/);
  // The finished-case hint is always there.
  assert.match(quiet, /find one by its Application ID/);
});
```

- [ ] **Step 2: Run them and watch them fail.**

Run: `node --test tests/staff-views.test.mjs`
Expected: FAIL, because `renderStaffBoard` still references the removed groups.

- [ ] **Step 3: Implement the board.** In `src/staff-views.mjs`:

1. Add `relativeDay` to the import from `./ui.mjs`.
2. Import `BOARD_TABS` from `./domain.mjs` if Task 3 didn't already.
3. Delete `fact` and the old `boardRow`.
4. Replace `renderStaffBoard` with the block below. `filterChips`, `valueOptions`, `staffEligibility`, `explain`, `when`, `CHOOSE_PERSONA` and `UNKNOWN_PERSON` already exist in this file.

```js
const SCOPES = Object.freeze([
  ["anyone", "Everyone"],
  ["mine", "Mine"],
]);
const EMPTY_TAB = Object.freeze({
  available: "Nothing to claim right now. New work appears here once the office has checked its intake.",
  preparation: "Nothing is waiting for preparation.",
  review: "Nothing is waiting for review.",
});

// A tab is a filter button: the same hook as every other board choice, with
// its count inside so a screen reader hears both.
function boardTabs(chosen, counts) {
  return `<div class="board-tabs" role="group" aria-label="Board tab">${BOARD_TABS.map(
    ([value, label]) => {
      const on = !chosen.search && chosen.status === value;
      return button(
        `${esc(label)} <span class="tab-count">${esc(counts[value])}</span>`,
        "set-board-filter",
        on ? "tab selected" : "tab",
        `data-filter="status" data-value="${value}" aria-pressed="${on}"`,
      );
    },
  ).join("")}</div>`;
}

function searchForm(chosen) {
  return `<form id="board-search-form" class="board-search" role="search"><label class="sr-only" for="field-board-search">Find an Application ID</label><input id="field-board-search" name="boardSearch" type="search" value="${esc(chosen.search)}" placeholder="Find an Application ID" autocomplete="off"><button class="btn secondary" type="submit">${icon("search")} Find</button>${when(
    chosen.search,
    button("Clear search", "set-board-filter", "text", 'data-filter="search" data-value=""'),
  )}</form>`;
}

const who = (id, name, personId) =>
  !id
    ? `<span class="unassigned">Unassigned</span>`
    : id === personId
      ? `<strong class="you">You</strong>`
      : esc(name ?? UNKNOWN_PERSON);

function boardRow(record, person, ui) {
  const rights = staffEligibility(record, person);
  const busy = ui.busy ? "disabled" : "";
  const id = esc(record.id);
  const actions = [];
  if (rights.claimPreparation.allowed)
    actions.push(caseButton(`${icon("play")} Claim`, "CLAIM_PREPARATION", "primary", `data-case-id="${id}" ${busy}`));
  else if (record?.stage === "preparation_ready") actions.push(explain(rights.claimPreparation));
  if (rights.claimReview.allowed)
    actions.push(caseButton(`${icon("check")} Claim review`, "CLAIM_REVIEW", "primary", `data-case-id="${id}" ${busy}`));
  else if (record?.stage === "review_ready") actions.push(explain(rights.claimReview));
  if (!rights.claimPreparation.allowed && !rights.claimReview.allowed)
    actions.push(button("Open", "open-case", "secondary", `data-case-id="${id}"`));
  const own = mine(record, person?.id);
  return `<tr class="board-row${own ? " own" : ""}"><th scope="row"><button class="board-reference" data-action="open-case" data-case-id="${id}">${esc(record.reference)}</button></th><td>${stageBadge(record.stage)}</td><td>${esc(record?.answers?.language || "—")}</td><td>${esc(record?.answers?.service || "—")}</td><td>${who(record.preparerId, record.preparerName, person?.id)}</td><td>${who(record.reviewerId, record.reviewerName, person?.id)}</td><td class="board-updated">${esc(record.updatedAt ? relativeDay(record.updatedAt, ui.now ?? Date.now()) : "No updates yet")}</td><td class="board-actions">${actions.join("")}</td></tr>`;
}

// Your own rows first, otherwise in the order the store returned them.
const yoursFirst = (records, personId) =>
  [...records].sort((a, b) => Number(mine(b, personId)) - Number(mine(a, personId)));

/**
 * The volunteer work board: three tabs (spec 2026-09-28, section 5), a search
 * that reaches every stage, and one table of the cases the choices leave.
 *
 * @param {object[]} cases  decorated Cases (see `decorateStaffCase`)
 * @param {object[]} people `listPeople()`, used to resolve `ui.personId`
 * @param {object}   ui     `{person|personId, filters, busy, now}`
 */
export function renderStaffBoard(cases = [], people = [], ui = {}) {
  const roster = Array.isArray(people) ? people : [];
  const person = ui.person ?? roster.find((entry) => entry?.id === ui.personId) ?? null;
  const chosen = boardFilters(ui.filters);
  const shown = yoursFirst(filterCases(cases, chosen, person), person?.id ?? null);
  const counts = boardCounts(cases, chosen, person);
  const total = cases.length;
  const narrowed = chosen.language !== "all" || chosen.service !== "all";
  const emptyText = chosen.search
    ? `No case matches “${esc(chosen.search)}”.`
    : narrowed
      ? "Nothing on this tab matches these filters."
      : chosen.status !== "available" && chosen.assignment === "mine"
        ? `Nothing of yours is ${chosen.status === "preparation" ? "waiting for preparation" : "waiting for review"}.`
        : EMPTY_TAB[chosen.status];
  const body = shown.length
    ? `<div class="board-table-wrap"><table class="board-table"><thead><tr><th scope="col">Application ID</th><th scope="col">Stage</th><th scope="col">Language</th><th scope="col">Service</th><th scope="col">Preparer</th><th scope="col">Reviewer</th><th scope="col">Updated</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${shown
        .map((record) => boardRow(record, person, ui))
        .join("")}</tbody></table></div>`
    : `<div class="empty-state">${icon("folder")}<p>${emptyText}</p>${when(
        narrowed || chosen.search,
        button("Clear filters", "clear-board-filters", "secondary"),
      )}</div>`;
  return `<section class="panel staff-board" aria-labelledby="board-title"><div class="section-head"><h2 id="board-title">${chosen.search ? "Search results" : "Work board"}</h2><span class="muted small">Showing ${esc(shown.length)} of ${esc(total)} ${total === 1 ? "case" : "cases"}</span></div>${searchForm(chosen)}${boardTabs(chosen, counts)}<div class="board-filters">${when(
    !chosen.search && chosen.status !== "available",
    filterChips("assignment", SCOPES, chosen.assignment),
  )}${filterChips("language", valueOptions(cases, "language", "Any language"), chosen.language)}${filterChips(
    "service",
    valueOptions(cases, "service", "Any service"),
    chosen.service,
  )}</div>${when(
    !person,
    `<p class="staff-reason" role="note">${icon("user")} ${esc(CHOOSE_PERSONA)} Until then this board is read-only.</p>`,
  )}${body}<p class="field-note board-note">${icon("lock")} This board shows workflow only: no taxpayer names, no addresses and no document contents. Submitted, approved and closed cases are not on these tabs; find one by its Application ID.</p></section>`;
}
```

- [ ] **Step 4: Wire the search form.** In `src/app.mjs`, in the `submit` handler, add a branch before `} else if (form.id === "lookup-form") {`:

```js
      } else if (form.id === "board-search-form") {
        controller.setBoardFilter("search", String(values.get("boardSearch") ?? "").trim());
```

- [ ] **Step 5: Run the unit tests.**

Run: `npm test`
Expected: PASS. If `"a presenter with no persona reads the board and acts on nothing"` fails on `data-action="open-case" data-case-id="case-1"`, check that the reference button renders `data-action` before `data-case-id`, exactly as in the markup above.

- [ ] **Step 6: Commit Tasks 3 and 4 together.**

```bash
git add src/staff-views.mjs src/controller.mjs src/app.mjs tests/staff-views.test.mjs tests/controller.test.mjs
git commit -m "Give the work board three tabs, a search and a table

Available, Waiting for preparation and Waiting for review replace the six
status chips; Mine / Everyone narrows the two waiting tabs; a search by
Application ID reaches every stage. Old saved filter values fall back to
the defaults.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The sidebar frame and its toggle

**Files:**
- Modify: `src/window-state.mjs` (the `FIELDS` table)
- Modify: `src/controller.mjs` (state, `persistSession`, `restoreSession`, sign-out reset, new `toggleSidebar`, export)
- Modify: `src/app.mjs` (click switch)
- Modify: `src/views.mjs` (`staffSidebar`, `staffScreen`, `page`)
- Test: `tests/window-state.test.mjs`, `tests/controller.test.mjs`, `tests/shell.test.mjs`

**Interfaces:**
- Consumes: `appShell({ sidebar, body, open })` and `icon("sidebar" | "board" | "people" | "help" | "signout" | "user")`, all from Phase 0.
- Produces:
  - `state.sidebarOpen`: a boolean, default `true`.
  - `controller.toggleSidebar()`.
  - `staffSidebar(state, person, office)`: an exported HTML string.
  - `page(state, body)`: omits the site header when `state.principal?.access === "presenter"`.

- [ ] **Step 1: Window-state test.** Append to `tests/window-state.test.mjs`:

```js
test("the sidebar choice is kept only when it is a real boolean", () => {
  const sessionStorage = fakeSession();
  const window = createWindowState({ sessionStorage });
  window.write("user-1", { screen: "staff", sidebarOpen: false });
  assert.deepEqual(window.read("user-1"), { screen: "staff", sidebarOpen: false });
  window.write("user-1", { screen: "staff", sidebarOpen: "no" });
  assert.deepEqual(window.read("user-1"), { screen: "staff" });
});
```

- [ ] **Step 2: Controller test.** Append to `tests/controller.test.mjs`:

```js
test("the sidebar starts open, toggles, survives a reload and reopens after sign-out", async () => {
  const shared = fakeSession();
  const store = fakeStore({
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    people: [{ id: "alex", name: "Alex", capabilities: ["prepare"] }],
    cases: [],
  });
  const first = build({ store, sessionStorage: shared });
  await first.controller.start();
  assert.equal(first.controller.getState().sidebarOpen, true);
  first.controller.toggleSidebar();
  assert.equal(first.controller.getState().sidebarOpen, false);
  first.controller.stop();

  const again = build({ store, sessionStorage: shared });
  await again.controller.start();
  assert.equal(again.controller.getState().sidebarOpen, false, "a reload keeps it");
  await again.controller.signOut();
  assert.equal(again.controller.getState().sidebarOpen, true);
  again.controller.stop();
});
```

- [ ] **Step 3: Frame tests.** Append to `tests/shell.test.mjs`, and add `staffSidebar, page` to the import from `../src/views.mjs`:

```js
test("the staff sidebar carries the logo, the one screen that exists, and the account", () => {
  const alex = { id: "alex", name: "Alex", capabilities: ["prepare"] };
  const html = staffSidebar({ screen: "staff" }, alex, false);
  assert.match(html, /<img src="src\/pcdc-logo\.png" alt="PCDC"/);
  assert.match(html, /data-action="open-board"[^>]*aria-current="page"[^>]*>[\s\S]*Work board/);
  assert.match(html, /Alex/);
  assert.match(html, /data-action="open-help"/);
  assert.match(html, /data-action="sign-out"/);
  assert.match(html, /Sign out/);
  // Nothing without a screen behind it.
  assert.doesNotMatch(html, /Dashboard|Schedule|Documents|Messages|Notifications/);

  const office = staffSidebar({ screen: "staff-case" }, { id: "sam", name: "Sam", capabilities: ["admin"] }, true);
  assert.match(office, /Office work/);
  assert.doesNotMatch(office, /aria-current/, "on a case, no nav item is current");
  assert.match(staffSidebar({ screen: "staff" }, null, false), /No persona chosen/);
});

test("presenters get the sidebar instead of the site header; clients keep the header", () => {
  const presenter = page({ principal: { access: "presenter" }, connection: "online" }, "<main></main>");
  assert.doesNotMatch(presenter, /class="site-header"/);
  const client = page({ principal: { access: "client" }, connection: "online" }, "<main></main>");
  assert.match(client, /class="site-header"/);
});
```

- [ ] **Step 4: Run them and watch them fail.**

Run: `node --test tests/window-state.test.mjs tests/controller.test.mjs tests/shell.test.mjs`
Expected: FAIL. `sidebarOpen` is dropped, `toggleSidebar` and `staffSidebar` are missing, and the header renders for presenters.

- [ ] **Step 5: Implement window state.** In `src/window-state.mjs`, add after `asFilters`:

```js
const asBoolean = (value) => (typeof value === "boolean" ? value : undefined);
```

Then add `sidebarOpen: asBoolean,` to `FIELDS`, after `boardFilters`.

- [ ] **Step 6: Implement the controller.** In `src/controller.mjs`:
  - In the initial state object, after `boardFilters: {},`, add:
    ```js
        // Whether this window shows the staff sidebar. Open unless the person
        // closed it.
        sidebarOpen: true,
    ```
  - In `persistSession`, add `sidebarOpen: state.sidebarOpen,` after `boardFilters`.
  - In `restoreSession`, add:
    ```js
        if (typeof saved.sidebarOpen === "boolean") state.sidebarOpen = saved.sidebarOpen;
    ```
  - In the sign-out reset, next to `state.boardFilters = {};` at around line 670, add `state.sidebarOpen = true;`.
  - After `clearBoardFilters`, add:
    ```js
      function toggleSidebar() {
        state.sidebarOpen = !state.sidebarOpen;
        persistSession();
        show();
      }
    ```
  - Add `toggleSidebar,` to the returned object, after `clearBoardFilters,`.

- [ ] **Step 7: Implement the click.** In `src/app.mjs`, in the click `switch`, add next to `case "clear-board-filters":`:

```js
      case "toggle-sidebar":
        controller.toggleSidebar();
        break;
```

- [ ] **Step 8: Implement the frame.** In `src/views.mjs`:

1. Export the sidebar:

```js
// What the staff sidebar holds in part 1 of the redesign: the brand, the one
// screen this persona can go to, and who this window is acting as. Screens that
// do not exist yet (Dashboard, Schedule, Documents, Messages) are not shown.
export function staffSidebar(state, person, office) {
  const onBoard = state?.screen === "staff";
  const label = office ? "Office work" : "Work board";
  return `<div class="sidebar-brand"><img src="src/pcdc-logo.png" alt="PCDC" width="36" height="36"><span class="sidebar-wordmark">ViTally<span class="brand-dot">.</span></span></div><nav class="sidebar-nav" aria-label="Main navigation">${button(
    `${icon(office ? "people" : "board")} ${label}`,
    "open-board",
    `nav-link${onBoard ? " current" : ""}`,
    onBoard ? 'aria-current="page"' : "",
  )}</nav><div class="sidebar-account"><div class="account-row">${icon("user")}<span><strong>${esc(
    person?.name ?? "No persona chosen",
  )}</strong><small>${esc(person ? "Acting as this volunteer" : "Choose one in the presenter controls")}</small></span></div>${button(
    `${icon("help")} Need help?`,
    "open-help",
    "text",
  )}${button(`${icon("signout")} Sign out`, "sign-out", "text")}</div>`;
}
```

2. In `staffScreen`, wrap every returned frame in the shell. Rename the existing body of `staffScreen` (everything after `const office = isAdmin(person);`) into a nested `const main = (() => { … })();`, keeping each `return` inside it. Then end the function with:

```js
  return appShell({
    sidebar: staffSidebar(state, person, office),
    body: main,
    open: state.sidebarOpen !== false,
  });
```

   `appShell` is already defined in this file (Phase 0); no import is needed.

3. In `page`, skip the site header for presenters:

```js
export function page(state, body) {
  // Presenters work in the staff frame, whose sidebar carries the brand, help
  // and sign-out; the site header is the client's.
  const top = state?.principal?.access === "presenter" ? "" : header(state);
  return `<a class="skip" href="#main">Skip to content</a>${top}${connectionNotice(state)}${noticeBanner(state)}${problemBanner(state)}${body}${footer()}${dialog(state)}<div class="toast" id="toast" role="status" aria-live="polite"></div>`;
}
```

- [ ] **Step 9: Run all unit tests.**

Run: `npm test`
Expected: PASS.

- [ ] **Step 10: Commit.**

```bash
git add src/window-state.mjs src/controller.mjs src/app.mjs src/views.mjs tests/window-state.test.mjs tests/controller.test.mjs tests/shell.test.mjs
git commit -m "Put the staff screens in the sidebar frame with a remembered toggle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Styles: shared elements, sidebar, board and presenter strip

**Files:**
- Modify: `src/styles.css`

**Interfaces:**
- Consumes:
  - The `--vt-*` tokens and the `.app-shell` rules (Phase 0).
  - The class names produced by Tasks 2, 4 and 5: `.badge.intake|prep|amend|filing|neutral`, `.board-tabs`, `.btn.tab`, `.tab-count`, `.board-search`, `.board-table`, `.board-row.own`, `.you`, `.unassigned`, `.board-note`, `.sidebar-brand`, `.sidebar-wordmark`, `.sidebar-nav`, `.btn.nav-link`, `.sidebar-account`, `.account-row`.

- [ ] **Step 1: Restyle the buttons.** Replace the rules `.btn.primary`, `.btn.primary:hover`, `.btn.secondary`, `.btn.secondary:hover`, `.btn.text` and `.btn.text:hover` (around lines 190–213) with:

```css
.btn.primary {
  background: var(--vt-primary);
  color: #fff;
  box-shadow: 0 1px 2px rgb(42 39 69 / 0.12);
}
.btn.primary:hover {
  background: var(--vt-primary-hover);
}
.btn.secondary {
  background: var(--vt-surface);
  border-color: var(--vt-primary-line);
  color: var(--vt-ink);
}
.btn.secondary:hover {
  background: var(--vt-background);
}
.btn.text {
  background: transparent;
  color: var(--vt-muted);
  padding: 10px 12px;
}
.btn.text:hover {
  background: var(--vt-primary-soft);
  color: var(--vt-ink);
}
```

  In `.btn` (line 172), change `min-height: 48px;` to `min-height: var(--vt-tap);`. In `.btn.inline, .inline`, change `color: var(--blue);` to `color: var(--vt-primary);`.

- [ ] **Step 2: Restyle focus, fields and radio cards.**
  - In `button:focus-visible, a:focus-visible`, replace `outline: 3px solid #c29743;` with `outline: 3px solid var(--vt-primary);`.
  - In `input:focus, select:focus, textarea:focus`, replace `outline: 2px solid #729a95;` with `outline: 2px solid var(--vt-primary);`.
  - In the rule `input:not([type="radio"]):not([type="checkbox"]), select, textarea`, replace `border: 1px solid #d3ddd9;` with `border: 1px solid var(--vt-primary-line);` and `min-height: 49px;` with `min-height: var(--vt-tap);`.
  - In `.radio-card`, replace `border: 1px solid #dbe4dd;` with `border: 1px solid var(--vt-primary-line);` and `min-height: 46px;` with `min-height: var(--vt-tap);`.
  - In `.radio-card.selected`, use `border-color: var(--vt-primary); background: var(--vt-primary-soft);`.
  - In `.radio-card input`, change `accent-color: var(--blue);` to `accent-color: var(--vt-primary);`.

- [ ] **Step 3: Restyle the badges.** Replace the rules `.badge.blue`, `.badge.amber`, `.badge.teal`, `.badge.neutral` (around lines 1246–1261) and `.badge.green` (around line 2663) with:

```css
/* Stage families (docs/design/DESIGN.md). The old tone names stay as aliases
   while the office screens still write them directly. */
.badge.intake,
.badge.blue {
  background: var(--vt-stage-intake-bg);
  color: var(--vt-stage-intake);
}
.badge.prep,
.badge.teal {
  background: var(--vt-stage-prep-bg);
  color: var(--vt-stage-prep);
}
.badge.amend,
.badge.amber {
  background: var(--vt-stage-amend-bg);
  color: var(--vt-stage-amend);
}
.badge.filing,
.badge.green {
  background: var(--vt-stage-filing-bg);
  color: var(--vt-stage-filing);
}
.badge.neutral {
  background: var(--vt-primary-soft);
  color: var(--vt-muted);
}
```

  In `.badge`, change `font-size: 10px;` to `font-size: 12px;` and `padding: 6px 10px;` to `padding: 3px 9px;`. In `.badge i`, change the width and height to `6px`.

- [ ] **Step 4: Restyle the banners, toast and empty state.** Replace the rules for `.connection-notice, .notice-banner, .problem-banner`, `.problem-banner` and `.notice-banner` (around lines 2678–2700) with:

```css
.connection-notice,
.notice-banner,
.problem-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 30px;
  font-size: 13px;
  background: var(--vt-stage-amend-bg);
  color: var(--vt-stage-amend);
  border-bottom: 1px solid var(--vt-line);
}
.problem-banner {
  background: var(--vt-stage-stopped-bg);
  color: var(--vt-stage-stopped);
}
/* Nothing failed here: the demonstration cases were rebuilt. */
.notice-banner {
  background: var(--vt-primary-soft);
  color: var(--vt-ink);
}
```

  - In `.toast`, use `border: 1px solid var(--vt-line); background: var(--vt-ink); color: #fff; box-shadow: 0 10px 30px rgb(42 39 69 / 0.25); border-radius: var(--vt-radius);`.
  - In `.empty-state > .icon`, change `color: #b6c3a7;` to `color: var(--vt-primary-line);`.
  - In `.empty-state p`, add `color: var(--vt-muted);`.

- [ ] **Step 5: Add the sidebar, board and presenter-strip rules.** Replace the old volunteer-board card rules `.board-counts`, `.btn.chip` and `.btn.chip.selected` (around lines 2944–2975) with the block below, and append the rest of the block at the end of the file. Keep `.board-list`, `.board-row`, `.board-row-head`, `.board-reference`, `.board-facts`, `.board-fact` and `.board-actions`: the office screens still use them until PR 4.

```css
.btn.chip {
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 13px;
  min-height: 32px;
  background: var(--vt-surface);
  border: 1px solid var(--vt-line);
  color: var(--vt-ink);
}
.btn.chip.selected {
  background: var(--vt-ink);
  border-color: var(--vt-ink);
  color: #fff;
}

/* ---- Staff sidebar (part 1) ---- */
.app-sidebar {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px;
}
.sidebar-wordmark {
  font-weight: 700;
  font-size: 18px;
  color: var(--vt-ink);
}
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.btn.nav-link {
  justify-content: flex-start;
  background: transparent;
  color: var(--vt-muted);
  font-weight: 500;
  padding: 8px 12px;
}
.btn.nav-link:hover {
  background: var(--vt-background);
  color: var(--vt-ink);
}
.btn.nav-link.current {
  background: var(--vt-primary-soft);
  color: var(--vt-primary);
  font-weight: 600;
}
.sidebar-account {
  margin-top: auto;
  border-top: 1px solid var(--vt-line);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sidebar-account .btn.text {
  justify-content: flex-start;
}
.account-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px 10px;
}
.account-row strong {
  display: block;
  color: var(--vt-ink);
}
.account-row small {
  display: block;
  color: var(--vt-muted);
  font-size: 12px;
}

/* ---- Presenter controls as a slim strip (D10) ---- */
.app-main .presenter-panel {
  padding: 10px 16px;
  border-radius: var(--vt-radius-sm);
  border-color: var(--vt-line);
  margin-bottom: 20px;
}
.app-main .presenter-panel .field-note {
  display: none;
}

/* ---- The volunteer work board ---- */
.staff-board {
  padding: 20px 22px;
  border-color: var(--vt-line);
  border-radius: var(--vt-radius);
}
.board-search {
  display: flex;
  gap: 8px;
  margin: 4px 0 16px;
  max-width: 460px;
}
.board-tabs {
  display: flex;
  gap: 22px;
  border-bottom: 1px solid var(--vt-line);
  margin-bottom: 14px;
  overflow-x: auto;
}
.btn.tab {
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  padding: 10px 0;
  color: var(--vt-muted);
  font-weight: 500;
  white-space: nowrap;
}
.btn.tab:hover {
  color: var(--vt-ink);
  transform: none;
}
.btn.tab.selected {
  border-bottom-color: var(--vt-primary);
  color: var(--vt-primary);
  font-weight: 600;
}
.tab-count {
  margin-left: 2px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--vt-primary-soft);
  font-size: 12px;
}
.board-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--vt-line);
  border-radius: var(--vt-radius);
}
.board-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.board-table thead th {
  background: var(--vt-background);
  color: var(--vt-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
  padding: 10px 12px;
  white-space: nowrap;
}
.board-table td,
.board-table tbody th {
  padding: 12px;
  border-top: 1px solid var(--vt-line);
  text-align: left;
  vertical-align: middle;
  white-space: nowrap;
}
.board-table .board-row {
  border: 0;
  border-radius: 0;
  padding: 0;
  background: var(--vt-surface);
}
.board-table .board-row:hover {
  background: var(--vt-background);
}
.board-table .board-row.own {
  background: var(--vt-you-soft);
}
.board-table .board-reference {
  color: var(--vt-primary);
}
.board-table .board-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  white-space: normal;
}
.board-table .board-actions .staff-reason {
  margin: 0;
  max-width: 260px;
  white-space: normal;
}
.you {
  color: var(--vt-you);
}
.unassigned {
  color: var(--vt-muted);
  font-style: italic;
}
.board-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 14px 0 0;
}
```

  Also add the design's tint for your own rows as a token: in the Phase 0 `:root` block, next to `--vt-you`, add `--vt-you-soft: #fdf7f7;`.

- [ ] **Step 6: Check for sideways overflow and against the design in a real browser.** This needs a running app with data. It can't reuse your other local project, so use the harness below. It renders the board from the unit-test fixtures with the real stylesheet:

```bash
mkdir -p /tmp/vt-preview && node -e '
import("./src/staff-views.mjs").then(async (sv) => {
  const views = await import("./src/views.mjs");
  const people = [{ id: "alex", name: "Alex", capabilities: ["prepare"] }, { id: "morgan", name: "Morgan", capabilities: ["review"] }];
  const mk = (o) => sv.decorateStaffCase({ answers: { service: "Drop-off", language: "Cantonese" }, updatedAt: new Date(Date.now() - 2*864e5).toISOString(), ...o }, people);
  const cases = [
    mk({ id: "1", reference: "VT-AAAA-1111", stage: "preparation_ready" }),
    mk({ id: "2", reference: "VT-BBBB-2222", stage: "preparing", preparerId: "alex" }),
    mk({ id: "3", reference: "VT-CCCC-3333", stage: "review_ready", preparerId: "alex" }),
    mk({ id: "4", reference: "VT-DDDD-4444", stage: "reviewing", preparerId: "alex", reviewerId: "morgan", answers: { service: "Online", language: "English" } }),
  ];
  for (const status of ["available", "review"]) {
    const board = sv.renderStaffBoard(cases, people, { person: people[0], filters: { status } });
    const shell = views.appShell({ sidebar: views.staffSidebar({ screen: "staff" }, people[0], false), body: `<main id="main" class="narrow"><div class="page-intro"><span class="overline">VOLUNTEER WORKSPACE</span><h1>Work board</h1></div>${board}</main>` });
    require("fs").writeFileSync(`/tmp/vt-preview/board-${status}.html`, `<!doctype html><link rel="stylesheet" href="${process.cwd()}/src/styles.css"><body>${shell.replaceAll("src/pcdc-logo.png", process.cwd() + "/src/pcdc-logo.png")}</body>`);
  }
});'
```

  Open `/tmp/vt-preview/board-review.html` in the browser pane at 1440px and 1024px. Compare it with `docs/design/screens/staff-board-v7-full-page.png`, and check that `document.documentElement.scrollWidth === innerWidth`.
  If `require` fails in the ES module context, replace `require("fs")` with `(await import("node:fs"))`.

- [ ] **Step 7: Run the unit tests.**

Run: `npm test`
Expected: PASS. CSS changes don't affect the unit tests, but run them anyway before committing.

- [ ] **Step 8: Commit.**

```bash
git add src/styles.css
git commit -m "Restyle the shared elements, and style the sidebar, board and presenter strip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Browser suite: find cases by searching, count the workspace

**Files:**
- Modify: `tests/support/story-pages.mjs` (`openCaseByReference`, add `findOnBoard` and `showBoardTab`)
- Modify: `tests/browser.mjs` (lines 409–411, 429–446, 680–690)

**Interfaces:**
- Consumes: the DOM hooks listed in Task 4.
- Produces:
  - `findOnBoard(page, reference)`: types the reference into `#field-board-search`, submits, and waits for `button.board-reference` with that text.
  - `showBoardTab(page, value)`: clicks the tab and waits until it is pressed.
  - `openCaseByReference(page, reference)`: now calls `findOnBoard` first whenever the page has a board search box.

- [ ] **Step 1: Add the helpers.** In `tests/support/story-pages.mjs`, after `readBoardTotals`:

```js
/** Search the volunteer board for one Application ID and wait for its row. */
export async function findOnBoard(page, reference) {
  await waitForQuiet(page);
  await page.locator("#field-board-search").fill(reference, { timeout: CLICK_MS });
  await page.locator('#board-search-form button[type="submit"]').click({ timeout: CLICK_MS });
  await waitFor(
    page,
    `${reference} to be found on the board`,
    (wanted) =>
      [...document.querySelectorAll("button.board-reference")].some((button) =>
        button.textContent.includes(wanted),
      ),
    reference,
    ARRIVAL_MS,
  );
}

/** Show one of the board's three tabs. */
export async function showBoardTab(page, value) {
  await clickAction(page, "set-board-filter", {
    attributes: `[data-filter="status"][data-value="${value}"]`,
  });
  await waitFor(
    page,
    `the ${value} tab to be shown`,
    (wanted) =>
      document
        .querySelector(`[data-filter="status"][data-value="${wanted}"]`)
        ?.getAttribute("aria-pressed") === "true",
    value,
    RENDER_MS,
  );
}
```

  Then, in `openCaseByReference`, add this as the function's first statement:

```js
  // The volunteer board shows one tab at a time; its search reaches every case.
  if (await page.locator("#field-board-search").count()) await findOnBoard(page, reference);
```

- [ ] **Step 2: Update the story.** In `tests/browser.mjs`:
  - Add `findOnBoard, showBoardTab` to the import from `./support/story-pages.mjs`.
  - Lines 409–411: the board now shows one tab, so the reset is checked against the whole workspace. Replace them with:
    ```js
          const totals = await readBoardTotals(staff);
          assert.equal(totals.total, 6);
          assert.equal(await staff.locator(".board-row").count(), totals.shown);
    ```
  - Line 429: replace `assert.deepEqual(await readBoardTotals(staff), { shown: 6, total: 6 });` with `assert.equal((await readBoardTotals(staff)).total, 6);`.
  - Lines 437–446: the new application is `received`, which has no tab, so find it by search. Replace the `waitFor(…)` block and the totals assertion with:
    ```js
          await waitFor(
            staff,
            "the board to count the new application",
            () => /of 7 cases/.test(document.querySelector(".staff-board .section-head")?.textContent ?? ""),
            undefined,
            ARRIVAL_MS,
          );
          await findOnBoard(staff, classReference);
          assert.equal((await readBoardTotals(staff)).total, 7);
    ```
  - Line 680: after `await openBoard(staff, WORK_BOARD_HEADING);`, add `await showBoardTab(staff, "review");` so the review claim is on screen.

- [ ] **Step 3: Check for remaining assumptions.**

Run: `grep -n "board-row\|readBoardTotals\|shown:" tests/browser.mjs tests/auth-browser.mjs`
Expected: only the lines edited above, plus line 481 (office board, unchanged) and line 688 (the review row, now on the Review tab).

- [ ] **Step 4: Run the suites when the local Supabase is free.** These reset the database on port 54321. Stop any other local Supabase project first, for example with `docker stop $(docker ps -q --filter name=vitally-task2)`, then run:

```bash
npx supabase start
npm test
npm run test:database
npm run test:auth-browser
npm run test:browser
```

Expected: all PASS. If `test:browser` fails, read its evidence screenshots (paths are printed in the failure). Fix the helper or the markup, and re-run the one suite.

- [ ] **Step 5: Commit.**

```bash
git add tests/support/story-pages.mjs tests/browser.mjs
git commit -m "Let the browser story find cases by searching the board

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Screenshots, docs and the pull request

**Files:**
- Add: `docs/design/screens/implemented-staff-board.png`
- Modify: `docs/design/README.md`

- [ ] **Step 1: Capture the implemented board.** Start the app against a free local Supabase (`npm start`), sign in as the presenter, choose Alex, and open the Review tab. Save a 1440px full-page screenshot to `docs/design/screens/implemented-staff-board.png`. Check that the served logo is unchanged:

```bash
curl -s http://127.0.0.1:4173/src/pcdc-logo.png | shasum -a 256
shasum -a 256 "docs/media/Shao-Transparent BLUE.png"
```

Expected: the same hash twice.

- [ ] **Step 2: Add the screenshot to the index.** In `docs/design/README.md`, under the Volunteer work board row, add:

```markdown
| Implemented (part 1, PR 1): work board on today's stages | [implemented-staff-board.png](screens/implemented-staff-board.png) |
```

- [ ] **Step 3: Commit and push.**

```bash
git add docs/design/screens/implemented-staff-board.png docs/design/README.md
git commit -m "Add the implemented work board screenshot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin restyle-pr1-board
```

- [ ] **Step 4: Open the PR.** There is no `gh` CLI on this machine, so give the user the compare link `https://github.com/jin-yu-yang/VITA-Management-System-Demo/compare/main...restyle-pr1-board?expand=1`. Pre-fill its title "Restyle PR 1: staff frame, shared elements and the three-tab work board". The body lists what changed, which tests changed on purpose, and the four suite results. It ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
