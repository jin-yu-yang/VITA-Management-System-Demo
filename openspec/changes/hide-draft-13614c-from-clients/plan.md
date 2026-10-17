# Hide the Draft 13614-C from Clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The client's summary page (9.2) offers Print and the draft Form 14446 only. No button can make a client page build a draft 13614-C, and a 14446's tab is titled by its own form.

**Architecture:**
- The view drops the client's 13614-C buttons and their helpers.
- The shared `viewDraft` handler in `src/app.mjs` refuses a 13614-C for anyone who isn't staff (`principal.access !== "presenter"`), before it opens a tab.
- `writeTab` titles the tab by the draft's kind.
- The browser story's client draft checks move from the 13614-C to the 14446, which runs the same code.

**Tech Stack:** Plain ES modules (no framework), `node:test` unit tests, Playwright browser story, `tools/build-hant` (OpenCC) for 繁體.

**Spec:** `openspec/changes/hide-draft-13614c-from-clients/`:
- `design.md` (D1–D6);
- `specs/client-intake/spec.md`, `specs/draft-14446/spec.md` and `specs/screen-states/spec.md`;
- `brainstorm.md` for the why.

## Global Constraints

- Fictional data only in tests and fixtures.
- Client text lives in `src/client-text.mjs`, in English and 简体. After any 简体 change, run `npm run build:hant` and commit `src/zh-hant.mjs`. Staff screens stay English.
- Exact copy:
  - `summary.intro_tools`: en "With the buttons below, you can print this summary, or view and download a draft Form 14446 made from your answers."; zh "您可以用下方的按钮打印这份汇总，或查看并下载根据您的回答生成的 14446 表草稿。"
  - `draft14446.tab_title`: en "Draft Form 14446"; zh "14446 表草稿". `draft.tab_title` keeps "Draft 13614-C" / "13614-C 草稿".
- Staff draft buttons (`draftTools` in `src/staff-views.mjs`) and the draft builders (`draft-form.mjs`, `draft-pdf.mjs`, `draft-virtual-consent.mjs`) do not change.
- No database, RPC, RLS or catalogue change.
- Commit on the change branch, never on `main`. End each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A forged 13614-C button on a client page.** It opens no tab: the guard runs before `window.open`, so no blank tab is left. Pinned in Task 2 (source order) and Task 3 (popup count).
2. **The banner's Try again after a refused 14446.** It rebuilds the 14446, not a 13614-C, because the retry passes `kind`. Pinned in Task 3's refused-form check.
3. **A client on a 繁體 screen.** The summary still offers the 14446 zh-t first, with no 简体 or 13614-C leftovers from the removed `DRAFT_FORMS` order. Pinned in Task 1's language test.
4. **The failed 14446 tab.** It is titled "Draft Form 14446", and the 13614-C's failed tab keeps "Draft 13614-C". Pinned in Task 2 (both branches) and Task 3 (the 14446 in a browser).
5. **Staff after the claim.** They still get all five buttons, and their English 13614-C opens. Pinned by the unchanged `tests/staff-views.test.mjs:1905` and `tests/browser.mjs` around line 1060 (Task 3, Step 4).

---

### Task 1: The summary page offers no 13614-C

**Files:**
- Modify: `src/intake-views.mjs:570-616` (`DRAFT_FORMS`, `draftButtons`, `summaryBody` and their comments)
- Modify: `src/client-text.mjs:338` (`summary.intro_tools`), `:342` (`draft.view`, remove) and `:345` (`draft.form_zh_s`, remove)
- Regenerate: `src/zh-hant.mjs`
- Test: `tests/client-views.test.mjs:1238-1307` and `tests/client-language.test.mjs:580-594`

**Interfaces:**
- Consumes: `draft14446Buttons(lang)` (unchanged).
- Produces: 9.2's `.summary-tools` holds Print, then `draft14446Buttons(lang)`, then `<p id="draft-ready" …>`. Every `data-action="view-draft"` on a client page carries `data-draft="14446"`.

- [ ] **Step 1: Update the tests to the new page**
  - In `"review.summary: the intro, then the tools, …"`, the pinned intro's third `<p>` becomes the new English `summary.intro_tools`. The toolbox assertions become:
    ```js
    assert.match(toolbox, /data-action="print-summary"[^>]*>[\s\S]*?Print<\/button>/);
    assert.match(toolbox, /data-action="view-draft" data-draft="14446" data-form="en"[^>]*>[\s\S]*?View Draft Form 14446<\/button>/);
    assert.doesNotMatch(toolbox, /data-action="view-draft"(?![^>]*data-draft="14446")/);
    assert.doesNotMatch(toolbox, /13614-C/);
    assert.match(toolbox, /<p id="draft-ready" class="draft-ready" aria-live="polite"><\/p>/);
    ```
  - In `"the summary offers the draft Form 14446 …"`:
    - the intro line becomes `assert.match(en, /view and download a draft Form 14446 made from your answers/)` plus `assert.doesNotMatch(en, /13614-C/)`;
    - the order checks become one: `at(/data-action="print-summary"/) < at(/data-draft="14446"/)`.
  - In `tests/client-language.test.mjs`, rename `"the draft buttons put the current language's form first, then the other two"` to `"the summary offers no draft 13614-C in any language, and the 14446's first form follows the screen"`. For each of `en`, `zh-Hans` and `zh-Hant`, the view-draft forms are:
    ```js
    const drafts = (lang) => [...client.intakeScreen(intakeState({ formSubstep: "review.summary", lang }))
      .matchAll(/data-action="view-draft"([^>]*)/g)].map((m) => /data-draft="14446"/.test(m[1]) ? /data-form="([^"]+)"/.exec(m[1])[1] : "13614-C");
    assert.deepEqual(drafts("en"), ["en", "zh-t"]);
    assert.deepEqual(drafts("zh-Hans"), ["zh-t", "en"]);
    assert.deepEqual(drafts("zh-Hant"), ["zh-t", "en"]);
    ```
    Also assert that the 简体 intro contains "14446 表草稿" and not "13614-C". Drop the `draft.view` / `簡體中文版` assertions.
- [ ] **Step 2: Run them and see them fail**
  Run: `node --test tests/client-views.test.mjs tests/client-language.test.mjs`
  Expected: FAIL, because the 13614-C buttons and the old intro are still there.
- [ ] **Step 3: Change the view**
  `summaryBody` builds `tools` from Print, `draft14446Buttons(lang)` and `#draft-ready`. Delete `DRAFT_FORMS`, its comment and `draftButtons`. The `summaryBody` comment reads "…then Print and the draft Form 14446, then Expand all and Collapse all…".
- [ ] **Step 4: Change the text**
  - Set `summary.intro_tools` to the Global Constraints copy.
  - Run `grep -rn 'draft\.view"\|draft\.form_zh_s' src tests`, which should show only their definitions, then delete both keys.
  - Run `npm run build:hant`.
- [ ] **Step 5: Run the tests and see them pass**
  Run: `npm test`, then `npm run build:hant -- --check`
  Expected: all pass. `tests/staff-views.test.mjs` is untouched and passes.
- [ ] **Step 6: Commit**
  ```bash
  git add src/intake-views.mjs src/client-text.mjs src/zh-hant.mjs tests/client-views.test.mjs tests/client-language.test.mjs
  git commit -m "Client summary: Print and the draft Form 14446 only, no draft 13614-C"
  ```

### Task 2: Only staff make a draft 13614-C; the 14446's tab names its form

**Files:**
- Modify: `src/app.mjs:1157-1263` (`writeTab`, `viewDraft`)
- Modify: `src/client-text.mjs`, adding `draft14446.tab_title` next to `draft14446.view`
- Regenerate: `src/zh-hant.mjs`
- Test: `tests/shell.test.mjs:331-348` (the draft block) and `:846` (the view-language key list)

**Interfaces:**
- Consumes: `controller.getState().principal.access` (`"presenter"` for staff, `"applicant"` for a client).
- Produces:
  - `writeTab(tab, text, kind = "13614c")` titles the tab with `t(kind === "14446" ? "draft14446.tab_title" : "draft.tab_title", {}, screenLang())`.
  - `viewDraft(form, by, kind = "13614c")` returns at once, with no tab, link or error, when `kind !== "14446"` and the principal isn't a presenter.

- [ ] **Step 1: Write the failing source checks** in the draft block of `tests/shell.test.mjs` (where `draft` is the `viewDraft` slice):
  ```js
  const guard = draft.search(/kind !== "14446" && [^\n]*principal\?\.access !== "presenter"[^\n]*\)\s*return/);
  assert.ok(guard > 0, "viewDraft refuses a 13614-C for anyone but staff");
  assert.ok(guard < draft.indexOf('window.open("", "_blank")'), "before any tab opens");
  assert.match(draft, /writeTab\(tab, t\("draft\.preparing", \{\}, screenLang\(\)\), kind\)/);
  assert.match(draft, /writeTab\(tab, t\("draft\.failed", \{\}, screenLang\(\)\), kind\)/);
  assert.match(app, /kind === "14446" \? "draft14446\.tab_title" : "draft\.tab_title"/);
  ```
  Then add `"draft14446.tab_title"` to the key list at `:846`. Next to the existing `t()` key tests, add a unit check that `t("draft14446.tab_title", {}, "en") === "Draft Form 14446"` and `t("draft14446.tab_title", {}, "zh-Hans") === "14446 表草稿"`.
  The existing assertion `draft.indexOf('window.open("", "_blank")') < draft.indexOf("await ")` must still hold.
- [ ] **Step 2: Run it and see it fail**
  Run: `node --test tests/shell.test.mjs`
  Expected: FAIL on the guard and on `writeTab`.
- [ ] **Step 3: Implement it**
  - Make the guard `viewDraft`'s first statement, above the files lookup. Write it on one line, as the test reads it, for example `if (kind !== "14446" && controller.getState().principal?.access !== "presenter") return;`. Its comment says a client's 13614-C is half finished (hide-draft-13614c-from-clients) and only staff make one.
  - Give `writeTab` its `kind` parameter, and pass `kind` at both call sites.
  - Add the key from the Global Constraints, then run `npm run build:hant`.
- [ ] **Step 4: Run the tests and see them pass**
  Run: `npm test`, then `npm run build:hant -- --check`
  Expected: all pass.
- [ ] **Step 5: Commit**
  ```bash
  git add src/app.mjs src/client-text.mjs src/zh-hant.mjs tests/shell.test.mjs
  git commit -m "Drafts: only staff make a 13614-C; a 14446's tab is titled Draft Form 14446"
  ```

### Task 3: The browser story checks the client's drafts through the 14446

**Files:**
- Modify: `tests/browser.mjs:4390-4660` (the client draft section, Chrome only)
- Read only: `tests/browser.mjs:1060-1100` (the staff draft checks, unchanged)

**Interfaces:**
- Consumes:
  - Task 1's markup (every client `view-draft` has `data-draft="14446"`);
  - Task 2's guard and tab title;
  - the existing helpers `open14446(form)`, `readDraft`, `tabSays`, `bannerSays`, `toastShows`, `pressBanner`, `hitsSince`, `wrongFont`, `waitForQuiet` and `jump`.
- Produces: nothing other tasks use.

- [ ] **Step 1: Remove the client's 13614-C opens**
  - Delete `openDraft` and its en / zh-s / zh-t checks (`draft.en`, `draft.zh-s`, `draft.zh-t`).
  - Keep the 14446 en check (it asserts no font fetched) and the Chinese-name zh-t check (TC + Latin fonts, once each).
  - Add a small helper for a 14446 popup that tests read before closing, for example `press14446(form)`, returning the popup. Its selector is `[data-action="view-draft"][data-draft="14446"][data-form="${form}"]`.
- [ ] **Step 2: Move the failure and link checks to the 14446**
  - **The refused font:** with `wrongFont[latin]` set, `press14446("zh-t")` (the Chinese name is still in the answers). Then the tab says `DRAFT_FAILED`, the banner says `DRAFT_FONT_UNCHECKED`, there's no toast, Dismiss clears it, and `wrongFont[latin]` is reset.
  - **The refused form:** route `${fixture.appOrigin}/src/forms/f14446-pcdc-en.pdf` to a 500, then `press14446("en")`. Then the tab says `DRAFT_FAILED` and `assert.equal(await popup.title(), "Draft Form 14446")`, the banner says `DRAFT_NOT_MADE`, there's no toast, and the console line is awaited and excused as today. After unroute, Try again rebuilds it: a popup whose `readDraft` head is `%PDF-`, or `#draft-ready-link`. The banner clears.
  - **The blocked tab:** with `window.open` stubbed to `null`, press the 14446 zh-t. Assert `draft.blocked` deep-equals `{ text: "Your draft is ready: open it", download: \`14446-draft-${reference}-zh-t.pdf\`, blob: true }`. The focus-and-redraw checks after it stay as they are.
  - Update the section's opening comment to "The client's drafts: the Form 14446 only (hide-draft-13614c-from-clients)", and update the comments that say 13614-C.
- [ ] **Step 3: Add the no-13614-C checks**, on 9.2, before the 14446 opens:
  ```js
  assert.equal(await page.locator('[data-action="view-draft"]:not([data-draft="14446"])').count(), 0, "9.2 offers a draft 13614-C");
  await page.evaluate(() => {
    const forged = document.createElement("button");
    forged.type = "button"; forged.id = "forged-13614c";
    forged.dataset.action = "view-draft"; forged.dataset.form = "en";
    document.querySelector(".summary-tools").append(forged);
  });
  const forgedPopup = page.waitForEvent("popup", { timeout: 1500 }).catch(() => null);
  await page.locator("#forged-13614c").click({ timeout: CLICK_MS });
  assert.equal(await forgedPopup, null, "a forged 13614-C button opened a tab on a client page");
  assert.equal(await page.locator("#draft-ready a, .problem-banner").count(), 0);
  ```
  Record it as `draft.forged = "a forged 13614-C button opened nothing"`. The next render removes the injected button, so nothing else is cleaned up.
- [ ] **Step 4: Confirm the staff side is unchanged**
  Run: `git diff -U0 tests/browser.mjs | grep -n '^@@'`
  Expected: every hunk is inside the client draft section, with none around line 1060.
- [ ] **Step 5: Run the story once**
  Run: `npm run test:browser` (about 11–16 minutes)
  Expected: pass. Record any failure at a step this change doesn't touch in the report, with its output; don't retry it.
- [ ] **Step 6: Commit**
  ```bash
  git add tests/browser.mjs
  git commit -m "Story: the client's draft checks run on the Form 14446; no 13614-C on a client page"
  ```

### Task 4: Developer docs and the final checks

**Files:**
- Modify: `docs/developer/frontend.md`, at the draft lines (around `:187`, `:246`, `:286` and `:472`)

- [ ] **Step 1: Update the docs**
  - The client's summary offers only the draft Form 14446.
  - `viewDraft` makes a 13614-C only for a presenter, before any tab opens.
  - The tab is titled by form (`draft.tab_title` / `draft14446.tab_title`).
  - Run `grep -n "13614" docs/developer/*.md` and fix any other line that says a client opens the 13614-C. Leave `docs/superpowers/` alone.
- [ ] **Step 2: Run the final checks**
  Run: `npm test`, `npm run build:hant -- --check`, `npx openspec validate --all`
  Expected: all pass.
- [ ] **Step 3: Commit**
  ```bash
  git add docs/developer/frontend.md
  git commit -m "Docs: the client's drafts are the Form 14446 only"
  ```
