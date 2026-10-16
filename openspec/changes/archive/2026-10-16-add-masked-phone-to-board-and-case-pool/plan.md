# Masked Phone on the Work Board and Case Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a masked client-phone column, after Stage, to the volunteer work board and the admin case pool, revealable or locked by the existing `canSeeContact` rule.

**Architecture:** `listCases` gains a fourth grouped read (`case_contacts`, `case_id,phone`), so every list record carries `phone`. One helper, `listPhone(record, person, prefix)`, sits next to `phoneMask` in `src/staff-views.mjs` and renders each list cell: `phoneMask(…)` with a per-row id, or "—". The board and the pool each add a Phone header and cell; the pool receives `person` from `views.mjs`. No database, RPC, RLS or realtime change.

**Tech Stack:** plain ES modules rendering HTML strings, `node --test` unit tests, Playwright browser story (`tests/browser.mjs`), local Supabase test stack.

**Spec:** `openspec/changes/add-masked-phone-to-board-and-case-pool/specs/staff-case-work/spec.md`, with `design.md` (decisions D1–D8) and `tasks.md` in the same folder. Read both before starting.

## Global Constraints

- Display-only: no migration, SQL function, RPC, RLS or realtime change. The PR body says the change is display-only, as #68's did.
- `canSeeContact(record, person)` is the only rule. Do not add another.
- `phoneMask` is reused unchanged. Do not change its output or its "Not given" wording.
- The column header text is exactly `Phone`, placed right after `Stage`.
- Mask ids are exactly `board-phone-<case id>` and `pool-phone-<case id>`.
- An empty list phone reads exactly `—`.
- Board footnote sentence, appended: `Phone numbers stay masked: on cases you work on, hover over or tab to a number to see it.`
- Pool footnote sentence, appended: `Phone numbers stay masked until you hover over or tab to them, so they don't show on a shared screen.`
- Only the client phone is listed, never the spouse phone.
- Do not change existing `data-action` values, ids, roles or accessible names.
- Fictional data only (`(215) 555-01xx`-style numbers). Staff screens stay English.
- Main has migration 025: run `npm run db:migrate:test` before any database or browser test. Never run `supabase start` from the repo root.

## Review Focus

1. **A locked row leaking the number through another path** (a `title`, an `aria-label`, a data attribute, or sr-only text). The person expects nothing beyond the last four digits in a locked row. Pinned in Task 2 (attribute scan, and no `555` anywhere in the locked row).
2. **The pool rendered without a person** (a caller that forgets `person`). The person expects the safe answer: every row locked, never revealable. Pinned in Task 3.
3. **A case with no `case_contacts` row** (an office case saved without contacts, or a reset mid-read). The person expects "—", not "Not given", `undefined` or a crash. Pinned in Task 1 (`phone: null`) and Task 2 (`listPhone` on missing, null and empty).
4. **The claimed row leaving the visible tab.** A claim moves the case from Available to another tab. The person watching expects the row to stay where they are looking when they found it by search. Pinned in Task 4 (window B uses the board search, which spans every stage).
5. **Focus landing elsewhere after Tab from the case link** (for example on a hidden `.phone-full` or on the actions). The person expects reference → phone. Pinned in Task 2 and Task 3 (markup order) and in Task 4 (a real Tab).

---

### Task 1: The phone in the list read

**Files:**
- Modify: `src/supabase-store.mjs` (presenter branch of `listCases`, around lines 361–404)
- Test: `tests/store.test.mjs` (test "a presenter list carries the summaries a work board reads", around line 455)

**Interfaces:**
- Consumes: nothing new.
- Produces: each presenter list record has `phone: string | null`, the raw stored phone (for example `"2155550100"`) or `null` when the case has no contact row. Applicant list records are unchanged and have no `phone` key.

- [ ] **Step 1: Write the failing tests.** Replace the body of the test "a presenter list carries the summaries a work board reads" with the version below, and add the new test after it.

```js
test("a presenter list carries the summaries a work board reads", async () => {
  const client = fakeClient({ access: "presenter" });
  const [row] = await createStore(client).listCases();
  // The Case scalars, unchanged, plus exactly five summary fields.
  assert.deepEqual(
    Object.keys(row).toSorted(),
    [
      ...Object.keys(mapCase(CASE_ROW)),
      "followupAssigneeIds",
      "openFollowups",
      "openRequests",
      "participants",
      "phone",
    ].toSorted(),
  );
  assert.deepEqual(row.participants, ["person-alex"]);
  assert.equal(row.openFollowups, 1);
  assert.deepEqual(row.followupAssigneeIds, ["person-sam"]);
  assert.equal(row.openRequests, 1);
  // The client's phone for the list's masked column (D5), and nothing else
  // of the contact row.
  assert.equal(row.phone, "2155550100");
  // Four grouped reads, each scoped to the cases this list actually holds,
  // and each asking only for the columns the board needs.
  const summaries = client.reads.filter((read) =>
    ["preparation_participants", "admin_followups", "document_requests", "case_contacts"].includes(
      read.table,
    ),
  );
  assert.equal(summaries.length, 4);
  for (const read of summaries) assert.deepEqual(read.within, ["case_id", ["case-1"]]);
  assert.ok(!summaries.some((read) => read.columns === "*"), "no whole rows");
  // Only the open work is counted: a resolved task is not a task.
  for (const read of summaries.filter((entry) =>
    ["admin_followups", "document_requests"].includes(entry.table),
  ))
    assert.deepEqual(read.filters, [["status", "open"]]);
  // The phone read names the phone and nothing else: no spouse phone, best
  // time or note reaches a list.
  const phoneRead = summaries.find((read) => read.table === "case_contacts");
  assert.equal(phoneRead.columns, "case_id,phone");
  assert.deepEqual(phoneRead.filters, []);
});

test("a listed case with no contact row has no phone", async () => {
  const client = fakeClient({ access: "presenter", rows: { case_contacts: [] } });
  const [row] = await createStore(client).listCases();
  assert.equal(row.phone, null);
});
```

- [ ] **Step 2: Run the tests and see them fail.**

Run: `node --test tests/store.test.mjs`
Expected: FAIL. The keys differ (no `phone`), and `summaries.length` is 3, not 4.

- [ ] **Step 3: Add the read.** In `src/supabase-store.mjs`, inside `listCases`, after the `requests` read and before `const forCase = …`, add:

```js
      // The client's phone, for the list's masked column (D5). The phone
      // alone: the case page reads the rest of the contact row.
      const contacts = await read(
        client
          .from("case_contacts")
          .select("case_id,phone")
          .in("case_id", ids),
      );
```

In the returned object, after `openRequests: forCase(requests, record.id).length,`, add:

```js
          phone: forCase(contacts, record.id)[0]?.phone ?? null,
```

Also update the comment above `listCases`: "Those three answers come from three grouped reads" becomes "Those three answers, and the client's phone for the masked column, come from four grouped reads".

- [ ] **Step 4: Run the tests and see them pass.**

Run: `node --test tests/store.test.mjs`
Expected: PASS, including the unchanged "listCases maps rows … with no related tables" (applicant) and "an empty presenter list asks for no summaries at all" tests.

- [ ] **Step 5: Commit.**

```bash
git add src/supabase-store.mjs tests/store.test.mjs
git commit -m "Load each listed case's phone for the masked list column"
```

---

### Task 2: `listPhone` and the work board's Phone column

**Files:**
- Modify: `src/staff-views.mjs`: add `listPhone` after `phoneMask` (around line 629); `boardRow` (around line 530); the board header and footnote in `renderStaffBoard` (around lines 577–597).
- Test: `tests/staff-views.test.mjs`: import `listPhone`; add tests after "a board row shows the client number before the reference…" (around line 1262).

**Interfaces:**
- Consumes: `record.phone` from Task 1; `phoneMask(value, allowed, id)` and `canSeeContact(record, person)`, both existing.
- Produces: `export function listPhone(record, person, prefix)` returns an HTML string. With a truthy `record.phone` it returns `phoneMask(record.phone, canSeeContact(record, person), \`${prefix}-${record.id}\`)`, and otherwise `"—"`. Task 3 imports it.

- [ ] **Step 1: Write the failing tests.** Add `listPhone,` to the import list from `../src/staff-views.mjs`, then add:

```js
// The masked phone on the work board (D5, DESIGN.md §8): the case page's
// mask and rule, one cell per row, after Stage.
const PHONE = "2155550123";
const FULL = "(215) 555-0123";
const OLIVE = { id: "olive", name: "Olive", capabilities: ["followup"] };
const PHONE_BOARD = [
  boardCase({ id: "open-1", reference: "VT-PHON-0001", phone: PHONE }),
  boardCase({ id: "mine-1", reference: "VT-PHON-0002", stage: "preparing", preparerId: "alex", phone: PHONE }),
  boardCase({ id: "none-1", reference: "VT-PHON-0003", phone: null }),
  boardCase({ id: "blank-1", reference: "VT-PHON-0004", phone: "" }),
  boardCase({ id: "spouse-1", reference: "VT-PHON-0005", phone: null, spousePhone: "2155550188" }),
];
const phoneBoard = (person) =>
  renderStaffBoard(PHONE_BOARD, PEOPLE, { person, filters: { search: "VT-PHON" } });
const boardRowOf = (html, reference) =>
  html.split('<tr class="board-row').slice(1).find((row) => row.includes(reference))?.split("</tr>")[0] ?? "";
const attributeValues = (html) => [...html.matchAll(/="([^"]*)"/g)].map((match) => match[1]);

test("listPhone: a dash with no phone, the mask with a per-row id otherwise", () => {
  for (const phone of [undefined, null, ""])
    assert.equal(listPhone({ id: "case-9", phone, preparerId: "alex" }, ALEX, "board-phone"), "—");
  const mine = listPhone({ id: "case-9", phone: PHONE, preparerId: "alex" }, ALEX, "board-phone");
  assert.equal(mine, phoneMask(PHONE, true, "board-phone-case-9"));
  const theirs = listPhone({ id: "case-9", phone: PHONE, preparerId: "morgan" }, ALEX, "board-phone");
  assert.equal(theirs, phoneMask(PHONE, false));
  assert.doesNotMatch(theirs, /id="/);
});

test("the board's Phone column comes right after Stage", () => {
  const html = phoneBoard(ALEX);
  const headers = [...html.matchAll(/<th scope="col">([^<]*)<\/th>/g)].map((match) => match[1]);
  assert.deepEqual(headers.slice(0, 8), ["Client", "Stage", "Phone", "Language", "Service", "Preparer", "Reviewer", "Updated"]);
  const row = boardRowOf(html, "VT-PHON-0001");
  assert.ok(row.indexOf('class="badge') < row.indexOf("phone-mask"), "the phone is not after the stage");
  assert.ok(row.indexOf("phone-mask") < row.indexOf("English"), "the phone is not before the language");
});

test("an available case and someone else's case show the locked phone", () => {
  for (const [person, reference] of [[ALEX, "VT-PHON-0001"], [MORGAN, "VT-PHON-0002"]]) {
    const row = boardRowOf(phoneBoard(person), reference);
    assert.match(row, /<span class="phone-mask is-locked" title="Claim this case to see the full number">/);
    assert.match(row, /\(•••\) •••-0123/);
    assert.doesNotMatch(row, /tabindex/);
    assert.doesNotMatch(row, /id="board-phone-/);
    assert.doesNotMatch(row, /555/, `the number reached ${person.name}'s locked row`);
  }
});

test("the viewer's own case, and any case for office staff, show the revealable phone", () => {
  for (const [person, reference, id] of [
    [ALEX, "VT-PHON-0002", "mine-1"],
    [OLIVE, "VT-PHON-0001", "open-1"],
    [OLIVE, "VT-PHON-0002", "mine-1"],
  ]) {
    const row = boardRowOf(phoneBoard(person), reference);
    assert.match(row, new RegExp(`<span class="phone-mask" id="board-phone-${id}" tabindex="0">`));
    assert.ok(row.includes(`<span class="phone-full">${FULL}</span>`));
    for (const value of attributeValues(row))
      assert.doesNotMatch(value, /555/, `an attribute carries the number: ${value}`);
  }
});

test("a listed case with no phone shows a dash, and a spouse phone is never listed", () => {
  const html = phoneBoard(OLIVE);
  for (const reference of ["VT-PHON-0003", "VT-PHON-0004", "VT-PHON-0005"]) {
    const row = boardRowOf(html, reference);
    assert.doesNotMatch(row, /phone-mask/);
    assert.match(row, /<td>—<\/td>/);
  }
  assert.doesNotMatch(html, /0188/, "a spouse phone reached the board");
});

test("in a board row the case link comes before the phone", () => {
  const row = boardRowOf(phoneBoard(ALEX), "VT-PHON-0002");
  assert.ok(row.indexOf('class="board-reference"') > -1);
  assert.ok(row.indexOf('class="board-reference"') < row.indexOf("phone-mask"));
});

test("the board's note keeps workflow only and says phones stay masked", () => {
  const html = phoneBoard(ALEX);
  assert.match(html, /This board shows workflow only: no taxpayer names, no addresses and no document contents\./);
  assert.match(html, /Phone numbers stay masked: on cases you work on, hover over or tab to a number to see it\./);
});
```

- [ ] **Step 2: Run the tests and see them fail.**

Run: `node --test tests/staff-views.test.mjs`
Expected: FAIL. `listPhone` is not exported, and there is no Phone header.

- [ ] **Step 3: Add `listPhone`.** In `src/staff-views.mjs`, directly after the closing brace of `phoneMask`, add:

```js
// A client phone in a list: the work board and the case pool (D5). The case
// page's mask and its one rule, with a per-row id so a redraw puts focus back
// on a revealed number. An empty phone is "—" like any other empty list cell,
// not the contact card's "Not given".
export function listPhone(record, person, prefix) {
  if (!record?.phone) return "—";
  return phoneMask(record.phone, canSeeContact(record, person), `${prefix}-${record.id}`);
}
```

- [ ] **Step 4: Add the board column and footnote.**
  - In `boardRow`'s returned row, change `<td>${stageBadge(record.stage)}</td><td>${esc(languageLabel(` to `<td>${stageBadge(record.stage)}</td><td>${listPhone(record, person, "board-phone")}</td><td>${esc(languageLabel(`.
  - In `renderStaffBoard`'s header, change `<th scope="col">Stage</th><th scope="col">Language</th>` to `<th scope="col">Stage</th><th scope="col">Phone</th><th scope="col">Language</th>`.
  - In the board note, change `find one by its Application ID.</p>` to `find one by its Application ID. Phone numbers stay masked: on cases you work on, hover over or tab to a number to see it.</p>`.

- [ ] **Step 5: Run the tests and see them pass.**

Run: `node --test tests/staff-views.test.mjs`
Expected: PASS, the new tests and every existing board test.

- [ ] **Step 6: Commit.**

```bash
git add src/staff-views.mjs tests/staff-views.test.mjs
git commit -m "Show each case's phone masked on the work board"
```

---

### Task 3: The case pool's Phone column

**Files:**
- Modify: `src/pool-views.mjs` (imports, `poolRow` around line 109, `renderCasePool` around lines 118–154); `src/views.mjs:273`.
- Test: `tests/pool-views.test.mjs` (add after "the pool's first column is the client number, before the reference").

**Interfaces:**
- Consumes: `listPhone(record, person, prefix)` from Task 2 (`src/staff-views.mjs`); `record.phone` from Task 1.
- Produces: `renderCasePool(cases, people, ui)` reads `ui.person` (a person object or absent). `poolRow(record, now, person)`.

- [ ] **Step 1: Write the failing tests.**

```js
// The masked phone in the case pool (D5): the same helper and rule as the
// board. Only admins reach the pool, but the rule decides, not the screen.
const ADMIN = { id: "p-sam", name: "Sam", capabilities: ["admin", "followup"] };
const VOLUNTEER = { id: "p-alex", name: "Alex", capabilities: ["prepare"] };
const PHONE_CASES = [
  rec("P", "preparation_ready", { phone: "2155550123" }),
  rec("Q", "preparing", { preparerId: "p-alex", preparerName: "Alex", phone: "2155550124" }),
  rec("R", "received", { phone: null }),
];
const phonePool = (person) => renderCasePool(PHONE_CASES, PEOPLE, { filters: {}, now: NOW, person });
const poolRowOf = (html, reference) =>
  html.split('<tr class="pool-row">').slice(1).find((row) => row.includes(`>${reference}<`))?.split("</tr>")[0] ?? "";

test("the pool's Phone column comes right after Stage", () => {
  const headers = [...phonePool(ADMIN).matchAll(/<th scope="col">([^<]*)<\/th>/g)].map((match) => match[1]);
  assert.deepEqual(headers, ["Client", "Stage", "Phone", "Language", "Service", "Preparer", "Reviewer", "Updated"]);
});

test("an admin can reveal every listed phone, claimed or not", () => {
  const html = phonePool(ADMIN);
  for (const id of ["P", "Q"]) {
    const row = poolRowOf(html, `VT-${id}`);
    assert.match(row, new RegExp(`<span class="phone-mask" id="pool-phone-${id}" tabindex="0">`));
    assert.ok(row.indexOf('class="board-reference"') < row.indexOf("phone-mask"), "the phone is before the case link");
  }
  assert.match(poolRowOf(html, "VT-R"), /<td>—<\/td>/);
});

test("the pool goes through the rule: a volunteer's unclaimed row, and no person at all, are locked", () => {
  const volunteer = phonePool(VOLUNTEER);
  assert.match(poolRowOf(volunteer, "VT-P"), /phone-mask is-locked/);
  assert.doesNotMatch(poolRowOf(volunteer, "VT-P"), /555|id="pool-phone-/);
  assert.match(poolRowOf(volunteer, "VT-Q"), /id="pool-phone-Q"/);
  const nobody = phonePool(undefined);
  for (const id of ["P", "Q"]) {
    assert.match(poolRowOf(nobody, `VT-${id}`), /phone-mask is-locked/);
    assert.doesNotMatch(poolRowOf(nobody, `VT-${id}`), /555/);
  }
});

test("the pool's note keeps workflow only and says phones stay masked", () => {
  const html = phonePool(ADMIN);
  assert.match(html, /This pool shows workflow only: no taxpayer names, no addresses and no document contents\./);
  assert.match(html, /Phone numbers stay masked until you hover over or tab to them, so they don't show on a shared screen\./);
});
```

The note is literal template text, not passed through `esc`, so the apostrophe stays `don't` (as the board note's literal text does).

- [ ] **Step 2: Run the tests and see them fail.**

Run: `node --test tests/pool-views.test.mjs`
Expected: FAIL. There is no Phone header and no mask.

- [ ] **Step 3: Add the pool column, the person and the footnote.**
  - Add `import { listPhone } from "./staff-views.mjs";` to `src/pool-views.mjs`.
  - `function poolRow(record, now)` becomes `function poolRow(record, now, person)`, and its `</td><td>${esc(languageLabel(` (the one after the stage cell's closing `}`) becomes `</td><td>${listPhone(record, person, "pool-phone")}</td><td>${esc(languageLabel(`.
  - In `renderCasePool`, add `const person = ui.person ?? null;` after `const now = …`, and change `.map((record) => poolRow(record, now))` to `.map((record) => poolRow(record, now, person))`.
  - In the header, change `<th scope="col">Stage</th><th scope="col">Language</th>` to `<th scope="col">Stage</th><th scope="col">Phone</th><th scope="col">Language</th>`.
  - In the note, change `no document contents.</p></section>` to `no document contents. Phone numbers stay masked until you hover over or tab to them, so they don't show on a shared screen.</p></section>`.
  - In `src/views.mjs`, change `renderCasePool(cases, people, { filters: state.boardFilters, now: Date.now() })` to `renderCasePool(cases, people, { person, filters: state.boardFilters, now: Date.now() })`.

- [ ] **Step 4: Run the tests and see them pass.**

Run: `node --test tests/pool-views.test.mjs`
Expected: PASS, the new tests and every existing pool test.

- [ ] **Step 5: Run the whole unit suite.**

Run: `npm test`
Expected: PASS, every test. If a `views` or shell test pins the pool's call or the board header, update it to the new column and say so in the task report.

- [ ] **Step 6: Commit.**

```bash
git add src/pool-views.mjs src/views.mjs tests/pool-views.test.mjs
git commit -m "Show each case's phone masked in the case pool"
```

---

### Task 4: Browser check — a claim unlocks the row in place

**Files:**
- Modify: `tests/browser.mjs`: add one phase directly after the phase "a reset rebuilds the samples and leaves the class's own work alone" (around line 2667), before "a client walks the version-2 intake…".

**Interfaces:**
- Consumes: the board markup from Task 2 (`#board-phone-<case id>`, `.phone-mask`, `.phone-full`, `is-locked`). Existing helpers in scope: `openWindow`, `staffEngine`, `loginTestUser`, `presenter`, `alex`, `watchAlerts`, `choosePersona`, `openBoard`, `findOnBoard`, `waitForQuiet`, `waitFor`, `waitForCaseWorkspace`, `assertConsoleQuiet`, `fixtureCases`, `fixture`, `SAMPLE_PHONE`, `CLICK_MS`, `ARRIVAL_MS`, `WORK_BOARD_HEADING`, `staff`.
- Produces: nothing used by other tasks.

Why here: the reset phase leaves a fresh `preparation_ready` sample, and earlier phases have already claimed the old one.

- [ ] **Step 1: Prepare the stack.**

Run: `npm run db:migrate:test`
Expected: migrations up to 025 applied, no errors.

- [ ] **Step 2: Add the phase.**

```js
    // D5 on the board: a claim unlocks the row's phone where the claimer is
    // looking, with no reload. A board claim moves the claiming window to the
    // case, so a second window of the same persona watches the row; it finds
    // the case by search, which spans every stage, so the row stays listed
    // when the claim moves it off the Available tab.
    await phase("a claim unlocks the phone on the board in another window", async () => {
      const target = (await fixtureCases(fixture)).find((row) => row.fixture_key === "preparation_ready");
      assert.ok(target, "the preparation_ready sample is missing");
      const maskId = `board-phone-${target.id}`;
      const watcher = await openWindow(staffEngine);
      await loginTestUser({ page: watcher.page, actor: presenter, fixture, heading: WORK_BOARD_HEADING });
      await watchAlerts(watcher.page);
      await choosePersona(watcher.page, alex);
      await openBoard(watcher.page);
      await findOnBoard(watcher.page, target.reference);
      const rowMask = (page) =>
        page.evaluate((wanted) => {
          const row = [...document.querySelectorAll("tr.board-row")].find((tr) =>
            tr.querySelector("button.board-reference")?.textContent.includes(wanted),
          );
          const mask = row?.querySelector(".phone-mask");
          return row
            ? {
                locked: mask?.classList.contains("is-locked") ?? null,
                id: mask?.id || null,
                focusable: mask?.hasAttribute("tabindex") ?? null,
                html: row.outerHTML,
              }
            : null;
        }, target.reference);

      // 1. Before the claim: locked, no id, no tab stop, no number.
      const before = await rowMask(watcher.page);
      assert.ok(before, "the case is not on the watching window's board");
      assert.deepEqual(
        { locked: before.locked, id: before.id, focusable: before.focusable },
        { locked: true, id: null, focusable: false },
      );
      assert.doesNotMatch(before.html, SAMPLE_PHONE, "a locked row carries the number");
      assert.doesNotMatch(before.html, /2155550\d\d\d/, "a locked row carries the stored number");

      // 2. Alex claims from the board in the other window.
      await choosePersona(staff, alex);
      await openBoard(staff);
      await findOnBoard(staff, target.reference);
      await waitForQuiet(staff);
      await staff
        .locator(`[data-case-action="CLAIM_PREPARATION"][data-case-id="${target.id}"]`)
        .click({ timeout: CLICK_MS });
      await waitForCaseWorkspace(staff, target.reference);

      // 3. The watching window: the same row unlocks in place.
      await waitFor(
        watcher.page,
        "the row's phone to unlock without a reload",
        (id) => {
          const mask = document.getElementById(id);
          return Boolean(mask) && mask.getAttribute("tabindex") === "0" && Boolean(mask.querySelector(".phone-full"));
        },
        maskId,
        ARRIVAL_MS,
      );
      assert.equal(
        await watcher.page.locator("#field-board-search").inputValue(),
        target.reference,
        "the watching window's search did not survive the redraw",
      );

      // 4. The claiming window, back on the board: revealable there too.
      await openBoard(staff);
      await findOnBoard(staff, target.reference);
      const after = await rowMask(staff);
      assert.deepEqual(
        { locked: after?.locked, id: after?.id, focusable: after?.focusable },
        { locked: false, id: maskId, focusable: true },
      );

      // 5. Tab from the case link lands on the phone and reveals it.
      await watcher.page.mouse.move(1, 1);
      await watcher.page.evaluate(
        (wanted) =>
          [...document.querySelectorAll("button.board-reference")]
            .find((button) => button.textContent.includes(wanted))
            ?.focus(),
        target.reference,
      );
      await watcher.page.keyboard.press("Tab");
      const landed = await watcher.page.evaluate(() => ({
        id: document.activeElement?.id ?? null,
        full: (document.activeElement?.querySelector(".phone-full")?.getBoundingClientRect().width ?? 0) > 4,
      }));
      assert.deepEqual(landed, { id: maskId, full: true }, "Tab from the case link did not reveal the phone");

      assertConsoleQuiet(watcher, { name: "board phone window" });
      await watcher.context.close();
    });
```

Check two things before running: the exact names of `presenter` and `alex` at this point in the story (the "two simultaneous claims" phase, around line 1581, uses them), and that the reset phase leaves `staff` signed in. That phase ends with `staff` as Sam on the office board, and `choosePersona(staff, alex)` switches it.

- [ ] **Step 3: Run the browser story.**

Run: `npm run test:browser` (about 11–16 minutes)
Expected: every phase passes, including the new one, the #68 phase "Alex claims preparation and requests the sample mileage record", the board, pool and queue phases, and the final "nothing threw" phase. If the new phase fails, fix the cause; do not add waits that hide it.

- [ ] **Step 4: Commit.**

```bash
git add tests/browser.mjs
git commit -m "Browser check: a claim unlocks the board's masked phone in place"
```

---

### Task 5: DESIGN.md §8

**Files:**
- Modify: `docs/design/DESIGN.md:358`

**Interfaces:** none.

- [ ] **Step 1: Edit the sentence.** Replace

`- Staff screens always show a client's phone as \`(•••) •••-1234\` in tabular numerals first. Today that is the case page's contact card and intake answers; no list shows a phone.`

with

`- Staff screens always show a client's phone as \`(•••) •••-1234\` in tabular numerals first: on the case page's contact card and intake answers, and in the Phone column of the volunteer work board and the admin case pool (after Stage, the client's phone only; "—" when there is none).`

- [ ] **Step 2: Leave the screenshots alone.** Do not regenerate any `docs/design/screens/implemented-*.png`; each one records the part that added it.

- [ ] **Step 3: Final checks.**

Run: `npm test`
Expected: PASS.
Run: `npx openspec validate add-masked-phone-to-board-and-case-pool --strict`
Expected: "Change 'add-masked-phone-to-board-and-case-pool' is valid".

- [ ] **Step 4: Commit.**

```bash
git add docs/design/DESIGN.md
git commit -m "DESIGN.md §8: the board and the case pool show masked phones"
```

Checks not needed for this change: `npm run test:database` (no SQL changes), `npm run test:auth-browser` (sign-in untouched), `npm run build:hant -- --check` (no client text; staff screens are English).
