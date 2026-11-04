# Record the Exit Form PDF (add-exit-form-pdf) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect the Exit Form's existing behaviour with tests, and correct its docs, without changing `src/`.

**Architecture:** Characterisation tests only. Pure logic is tested in Node, `app.mjs` wiring is pinned at the source (it has no DOM harness), and what a browser does is proved by one new phase of the linear story in `tests/browser.mjs`.

**Tech Stack:** `node:test`, `pdf-lib` (`src/vendor/pdf-lib.mjs`), `pdfjs-dist` 6.4.299 (dev dependency), Playwright.

**Spec:** `openspec/changes/add-exit-form-pdf/specs/review-and-corrections/spec.md`, with `design.md` beside it.

## Global Constraints

- `git diff origin/main -- src/` stays empty. If a test shows the code disagrees with the spec, stop and report it. Do not change `src/` or weaken the test to match.
- Fictional data only.
- Comments in tests are short and match the file. Issue references use `#122`.
- These tests pass as soon as they are written, so a task's red step is checking the test can fail: temporarily break its expected value, see it fail, restore it.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commands on this machine use Node 24.21.0, for that command only: `PATH="/c/Users/hezal/vitally-tools/node-v24.21.0-win-x64:$PATH"`.
- The worktree needs an ignored copy of the repo root's `.env.test`, and `npm ci`, before the story runs. Never run `supabase start`; the stack is already running from `$VITALLY_STACK` (`C:\Users\hezal\vitally-stacks\vitally-hailey.xm6xUYYX`). It has every migration.

## Review Focus

1. A long remark that also has a Local note at its front: the note takes up the line, so less of the remark prints. Task 1 pins it.
2. Chinese Remarks: cut the same way, in the downloaded font rather than Helvetica. Task 1 pins it. No test pins how many characters fit, because that depends on the text's width.
3. A failed Exit Form tab has the title "Draft 13614-C" (`writeTab`'s default). This is in #122. The spec doesn't promise a title, so no test pins it, and it isn't fixed here.
4. The phase's blocked-tab link staying on the page into later story phases. Task 3 navigates away and the full run proves later phases pass.
5. A failure inside the phase leaving font routes or `window.open` overridden. Task 3 cleans up in `finally`.

---

### Task 1: The form's Remarks and template (`tests/exit-form.test.mjs`)

**Files:**
- Test: `tests/exit-form.test.mjs` (add to the end; add one import)

**Interfaces:**
- Consumes: `exitFormMarks`, `buildExitFormPdf`, `exitFormFontFields`, `EXIT_FORM_FILE`, `EXIT_FORM_LAYOUT` (`L`), `CASE`, and the font helpers the file already imports.

- [ ] **Step 1: Write the tests**

```js
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// The Remarks line as the page draws it: its text and font sizes.
async function remarksLine(remarks, local = []) {
  const marks = exitFormMarks({ remarks, exitForm: { federal: null, state: null, local } }, CASE, "2026-11-01");
  const fontFiles = await draftFontFiles(draftFontsFor("zh-t"), exitFormFontFields(marks), {
    fontkit: PDFLib.fontkit,
    fetchFont: (file) => readFile(DRAFT_FONT_FIXTURES[file.url].path),
  });
  const bytes = await buildExitFormPdf({ PDFLib, fontkit: PDFLib.fontkit, formBytes: await readFile(EXIT_FORM_FILE), fontFiles, marks });
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const { items } = await (await (await task.promise).getPage(1)).getTextContent();
  await task.destroy();
  const line = items.filter(
    (item) => item.str.trim() && Math.abs(item.transform[5] - (792 - L.remarks.y)) < 1 && item.transform[4] >= L.remarks.x - 1,
  );
  return { text: line.map((item) => item.str).join(""), sizes: line.map((item) => item.transform[0]) };
}

test("a short remark is drawn whole at 12 pt", async () => {
  const { text, sizes } = await remarksLine("Bring the corrected W-2.");
  assert.equal(text, "Bring the corrected W-2.");
  assert.ok(sizes.every((size) => Math.abs(size - 12) < 0.01));
});

test("a wider remark is drawn whole and smaller", async () => {
  const remark = "Fictional remark ".repeat(8).trim();
  const { text, sizes } = await remarksLine(remark);
  assert.equal(text, remark);
  assert.ok(sizes.every((size) => size < 12 && size >= 5.99));
});

// Known problem, #122: this records what happens, not what we want.
test("a remark too long for the line is cut at 6 pt, in English and Chinese (#122)", async () => {
  for (const remark of ["Fictional remark ".repeat(120).slice(0, 2000), "虛構備註".repeat(500)]) {
    const { text, sizes } = await remarksLine(remark);
    assert.ok(text.endsWith("…"));
    assert.ok(remark.startsWith(text.slice(0, -1)));
    assert.ok(sizes.every((size) => Math.abs(size - 6) < 0.01));
  }
});

test("a Local note at the front of the Remarks leaves less room for them (#122)", async () => {
  const remark = "Fictional remark ".repeat(9).trim(); // fits with no note
  assert.equal((await remarksLine(remark)).text, remark);
  const local = [{ type: "SIT", method: "efile", result: "owe", amount: "10", oweBy: "direct_debit", debitOn: "2027-04-15" }];
  const { text } = await remarksLine(remark, local);
  assert.ok(text.startsWith("SIT: e-filed, direct debit on 04/15/2027; Fictional"));
  assert.ok(text.endsWith("…"));
});

test("the template has no document info, and a filled form is titled Exit Form", async () => {
  const template = await PDFLib.PDFDocument.load(await readFile(EXIT_FORM_FILE), { updateMetadata: false });
  assert.equal(template.getAuthor(), undefined);
  assert.equal(template.getTitle(), undefined);
  const marks = exitFormMarks({ exitForm: { federal: null, state: null, local: [] } }, CASE, "2026-11-01");
  const fontFiles = await draftFontFiles(draftFontsFor("zh-t"), exitFormFontFields(marks), {
    fontkit: PDFLib.fontkit,
    fetchFont: (file) => readFile(DRAFT_FONT_FIXTURES[file.url].path),
  });
  const bytes = await buildExitFormPdf({ PDFLib, fontkit: PDFLib.fontkit, formBytes: await readFile(EXIT_FORM_FILE), fontFiles, marks });
  assert.equal((await PDFLib.PDFDocument.load(bytes, { updateMetadata: false })).getTitle(), "Exit Form");
});
```

Reuse a small helper for the build if it reads better; the assertions are what's fixed.

- [ ] **Step 2: Run them**

Run: `node --test tests/exit-form.test.mjs`
Expected: PASS. If "fits with no note" fails, shorten the repeat count until it fits with no note.

- [ ] **Step 3: Check they can fail**

Temporarily change `Math.abs(size - 6)` to `Math.abs(size - 7)`, run, see it fail, restore it.

- [ ] **Step 4: Commit**

```bash
git add tests/exit-form.test.mjs
git commit -m "Exit Form: test long Remarks and the template's document info"
```

### Task 2: Wiring and the office panel (`tests/shell.test.mjs`, `tests/admin-views.test.mjs`)

**Files:**
- Test: `tests/shell.test.mjs`, `tests/admin-views.test.mjs` (next to the existing Exit Form test, about line 1554)

- [ ] **Step 1: Write the source pin in `tests/shell.test.mjs`**

```js
// app.mjs has no DOM harness; the browser story proves what these lines do.
test("app.mjs makes the Exit Form for a staff window only, and records nothing", () => {
  const read = (file) => readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
  const app = read("../src/app.mjs");
  assert.match(app, /case "view-exit-form":/);
  const body = app.slice(app.indexOf("async function viewExitForm"), app.indexOf("// ---- leaving Add a case"));
  assert.match(body, /if \(!isStaffWindow\(state\.principal\)\) return;/);
  assert.match(body, /spouseShown\(visible\)/);
  assert.match(body, /"The Exit Form could not be made\. Close this tab and try again\."/);
  assert.match(body, /message: "The Exit Form could not be made\. Try again\."/);
  // Only reads and reports: no controller call that saves anything.
  assert.deepEqual(
    [...new Set([...body.matchAll(/controller\.(\w+)/g)].map((match) => match[1]))].sort(),
    ["clearError", "getState", "noteLocalFailure"],
  );
  assert.doesNotMatch(read("../src/client-views.mjs"), /view-exit-form/);
});
```

- [ ] **Step 2: Write the panel test in `tests/admin-views.test.mjs`**

```js
test("the office's Exit Form panel uses the latest approval and stays after filing", () => {
  const approved = officeCase({
    stage: "efiled",
    preparationVersion: 2,
    reviewerId: "morgan",
    reviews: [
      { id: "review-1", preparationVersion: 1, status: "approved", reviewerId: "morgan" },
      { id: "review-2", preparationVersion: 2, status: "approved", reviewerId: "morgan" },
    ],
    reviewerQuestionnaires: [
      { id: "rq-1", reviewId: "review-1", exitForm: { federal: null, state: null, local: [] } },
      { id: "rq-2", reviewId: "review-2", exitForm: { federal: null, state: null, local: [] } },
    ],
  });
  const html = renderAdminCase(approved, { person: SAM });
  assert.match(html, /<h2 id="exit-form-title">Exit Form<\/h2>/);
  assert.equal((html.match(/data-action="view-exit-form"/g) ?? []).length, 1);
  assert.match(html, /data-action="view-exit-form" data-review="review-2">/);
});
```

- [ ] **Step 3: Run them**

Run: `node --test tests/shell.test.mjs tests/admin-views.test.mjs`
Expected: PASS.

- [ ] **Step 4: Check they can fail**

Temporarily change `review-2` to `review-1` in the last assertion, and remove `"clearError"` from the list. See both fail, restore them.

- [ ] **Step 5: Commit**

```bash
git add tests/shell.test.mjs tests/admin-views.test.mjs
git commit -m "Exit Form: pin the staff-only wiring and the office panel's choice of approval"
```

### Task 3: The story phase (`tests/browser.mjs`)

**Files:**
- Modify: `tests/browser.mjs`, one new `phase`, just before `let loopKit = null;` (about line 2877)

**Interfaces:**
- Consumes, all already in that scope or file: `roles`, `staff`, `samples`, `morgan`, `sam`, `fixture`, `evidence`, `one`, `caseById`, `phase`, `openBoard`, `choosePersona`, `openCaseByReference`, `revealCaseControl`, `waitForQuiet`, `waitFor`, `draftBytes`, `draftPageText`, `PDFDocument`, `DRAFT_FONT_FIXTURES`, `ROOT`, `readFile`, `path`, `CLICK_MS`, `ARRIVAL_MS`, `WORK_BOARD_HEADING`, `OFFICE_BOARD_HEADING`.

- [ ] **Step 1: Write the phase** named `"the Exit Form opens from an approved review, and says so when it can't be made"`

Skeleton (the Form 14446 check, about line 6055, shows the same moves):

```js
let exitForm = `not run: the staff engine is ${roles.staff}, which may download the PDF instead of opening it`;
if (roles.staff === "chrome") {
  const sample = samples.find((row) => row.fixture_key === "review_approved");
  const before = await caseById(fixture, sample.id);
  const expected = await one(fixture,
    "select c.season,c.client_number,c.answers->>'tp_first_name' first_name,c.answers->>'tp_last_name' last_name,q.exit_form from public.cases c join public.reviewer_questionnaires q on q.case_id=c.id where c.id=$1",
    [sample.id]);
  const wrongFont = { on: false };
  const fontRoutes = [];
  try {
    for (const [url, file] of Object.entries(DRAFT_FONT_FIXTURES)) {
      const bytes = await readFile(path.join(ROOT, file.path));
      const handler = (route) => route.fulfill({
        status: 200,
        headers: { "content-type": "font/ttf", "access-control-allow-origin": "*" },
        body: wrongFont.on ? Buffer.from("not the pinned font") : bytes,
      });
      await staff.route(url, handler);
      fontRoutes.push([url, handler]);
    }
    const press = async () => {
      await revealCaseControl(staff, '[data-action="view-exit-form"]');
      await waitForQuiet(staff);
      const opened = staff.waitForEvent("popup", { timeout: CLICK_MS });
      await staff.locator('[data-action="view-exit-form"]').first().click({ timeout: CLICK_MS });
      return await opened;
    };
    // ... the three parts below ...
  } finally {
    await staff.evaluate(() => { if (window.__vitallyOpen) window.open = window.__vitallyOpen; }).catch(() => {});
    for (const [url, handler] of fontRoutes) await staff.unroute(url, handler).catch(() => {});
  }
}
evidence.story.exitForm = exitForm;
```

The three parts:

1. **Reviewer opens it.** `choosePersona(staff, morgan)`, `openBoard(staff, WORK_BOARD_HEADING)`, `openCaseByReference(staff, sample.reference)`. `const popup = await press(); const bytes = await draftBytes(popup);`. From `(await draftPageText(bytes, 0))`: `pages === 1`, and `strings` includes `String(expected.season)`, `String(expected.client_number)`, `` `${expected.first_name} ${expected.last_name}` ``, and `` `$${expected.exit_form.federal.amount}` ``, and some string matches `/^\d{2}\/\d{2}\/\d{4}$/`. From `PDFDocument.load(bytes, { updateMetadata: false })`: `getAuthor() ?? ""` is `""`, `getTitle()` is `"Exit Form"`. Close the popup.
2. **The office's failure and retry.** `choosePersona(staff, sam)`, `openBoard(staff, OFFICE_BOARD_HEADING)`, `openCaseByReference`. Set `wrongFont.on = true`. `press()`. The popup's `body.textContent.trim()` becomes `"The Exit Form could not be made. Close this tab and try again."`, and `.notice.error` includes `"The Exit Form could not be made. Try again."`. Close the popup. Set `wrongFont.on = false`. Press `.notice.error [data-action="retry-action"]`, accepting a new tab or `#draft-ready-link` as the Form 14446 check does; a tab's bytes start `%PDF-`. Wait for `.notice.error` to go.
3. **The blocked tab.** Save and replace `window.open` with `() => null`, as the Form 14446 check does (`__vitallyOpen`). Click the button, then read `#draft-ready a`: `download` is `` `exit-form-${expected.client_number}.pdf` `` and `href` starts `blob:`. Restore `window.open`.

Then assert `caseById` still has `before.stage` and `before.revision`, and `openBoard(staff, OFFICE_BOARD_HEADING)`. Set `exitForm` to a short summary object.

- [ ] **Step 2: Check the file parses and the unit suite is unaffected**

Run: `node --check tests/browser.mjs` and `npm test`
Expected: no error; all pass.

- [ ] **Step 3: Run the story**

The story is linear, so the phase can't run alone.

Run: `npm run test:browser` (about 15–25 minutes)
Expected: the new phase passes in both browser orders (doing its work only with a Chrome staff window), and so do the phases after it.

If it stops on a phase other than this one, compare with #120 and `docs/setup.md`, record the run, and run it again. If it stops on this phase, debug it; never assume a flake.

- [ ] **Step 4: Check it can fail**

Only if Step 3 passed: reason from the assertions that a wrong amount would fail them. Don't spend another 20-minute run on this; say so in the task report.

- [ ] **Step 5: Commit**

```bash
git add tests/browser.mjs
git commit -m "Browser story: press Download Exit Form, its failure and retry, and a blocked tab"
```

### Task 4: Docs and final checks

**Files:**
- Modify: `docs/developer/frontend.md` (The Exit Form section, Fonts and Tests bullets)

- [ ] **Step 1: Correct the Fonts bullet to say**

```markdown
- **Fonts.** The Other Tax rows are bilingual, so every Exit Form fetches the Traditional Chinese
  Noto font, with the drafts' pinned, checked files (`draftFontFiles`). If that fails, no form is
  made ([#122](https://github.com/jin-yu-yang/VITA-Management-System-Demo/issues/122)).
```

- [ ] **Step 2: Correct the Tests bullet to say**

```markdown
- **Tests.** `tests/exit-form.test.mjs` covers the marks, builds real PDFs, and pins long Remarks
  and the template's document info. `tests/shell.test.mjs` pins `viewExitForm`'s wiring. The button
  assertions are in `tests/staff-views.test.mjs` and `tests/admin-views.test.mjs`, and the allowlist
  entry is in `tests/server.test.mjs`. The browser story presses the button, a failure with its
  retry, and a blocked tab, with a Chrome staff window only.
```

- [ ] **Step 3: Run the final checks**

Run: `git diff origin/main --stat -- src/`
Expected: no output.

Run: `npm test` and `npx openspec validate --all`
Expected: all pass.

`npm run test:browser` ran in Task 3 on this branch; keep every run's counts and failing steps for `verify.md`. Run it again only if a later commit changed `tests/browser.mjs`.

- [ ] **Step 4: Commit**

```bash
git add docs/developer/frontend.md
git commit -m "Docs: every Exit Form fetches the font, and which tests cover it"
```

---

## After apply (lifecycle steps, not plan tasks)

- **Step 6:** `verify.md` records the `test:browser` result from this branch. It also lists a known gap, not just "not run": Firefox downloads a blob PDF instead of opening it, so the Exit Form's content is verified only in Chrome. The story's existing draft checks do the same.
- **Step 7:** `retrospective.md` says the Purpose sentence is a manual edit at archive, and why (a delta spec can't change a Purpose).
- **Step 8:** merge `main`. If it brought new commits, run `npm run test:browser` again and add the result to `verify.md`. If not, don't run it again. After archive, add the Purpose sentence by hand.
