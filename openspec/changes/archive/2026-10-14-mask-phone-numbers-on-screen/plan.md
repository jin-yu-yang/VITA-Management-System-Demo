# Mask phone numbers on screen: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every client phone on the staff case page shows as `(•••) •••-1234`.
- Viewers who work on the case can reveal it by hover, focus or click.
- Everyone else sees a locked mask, and the full number never reaches their page.

**Architecture:**
- One pure view helper, `phoneMask(value, allowed, id)` in `src/staff-views.mjs`, renders every client phone on the staff case page. `allowed` is always `canSeeContact(record, person)`, the existing single rule.
- The reveal is CSS only: `:hover` / `:focus-within` on a `tabindex="0"` span. There's no JavaScript and no controller state.
- A new id on each revealable mask lets the app's existing focus restore keep a revealed number shown across a realtime redraw.

**Tech Stack:** plain ES modules that return HTML strings, `node:test` (`npm test`), Playwright story (`npm run test:browser`), and `src/styles.css`.

**Spec:** `openspec/changes/mask-phone-numbers-on-screen/specs/staff-case-work/spec.md`. Design: `openspec/changes/mask-phone-numbers-on-screen/design.md` (D1–D8). Task list: `tasks.md` in the same folder.

## Global Constraints

- Don't change existing `data-action` values, ids, roles or accessible names. New ids (`contact-phone`, `contact-spouse-phone`, `answers-tp_phone`, `answers-sp_phone`) are allowed.
- Fictional data only. Sample phones are `2155550100`–`2155550199` (`samplePhone` in `src/sample-data.mjs`).
- Staff screens stay English. No client text and no `src/client-text.mjs` change, so no `build:hant`.
- A viewer who is not allowed: the full number SHALL NOT be in the DOM, in text or in any attribute.
- An allowed viewer: the full number only as a text node, never in `title`, `aria-label` or any attribute.
- The tooltip and sentence are exactly `Claim this case to see the full number`. The sr-only text is exactly `Ends in 0123. Claim this case to see the full number.`
- `CONTACT_NOT_SHOWN` wording is unchanged: "Contact details are shown to the office, and to the preparer and reviewer once the case is claimed."
- Mask format: `(•••) •••-` + last four digits. With fewer than four digits, `(•••) •••-••••`.
- No copy button and no clipboard API.
- No database, migration, RPC, RLS, catalogue or `draft-13614c` change. The draft buttons stay gated by `canSeeContact`.
- Commits go on the change branch, never `main`, and end with the `Co-Authored-By` line from the session.

## Review Focus

1. **A realtime redraw while an allowed viewer has the number revealed by focus.** It should stay revealed; this is a spec scenario. The new ids let `restoreField` refocus it. Task 2 checks that each mask has a unique id, and Task 3 Step 4 drives a real realtime update in the story.
2. **A stored phone in a different shape** (`"(215) 555-0123"` instead of digits). The mask and the full text should be the same as for digits. Task 1 tests both shapes.
3. **The married spouse phone for a viewer who is not allowed.** Its digits must not leak either. Task 2 tests a married case (`sp_phone` is `samplePhone(seed, 50)`) for both phones.
4. **An unanswered required phone in the answers panel for a viewer who is not allowed.** It now shows the existing "Not answered" row, the same as for allowed viewers: it reveals only that there is no number. Task 2 pins it.
5. **The SVG icons' path data contains digits.** Attribute scans for `215` / `555` must remove `<svg>…</svg>` first, so they don't fail on an icon path, and still catch a real leak. Task 1's `attrs()` helper does this.

---

### Task 1: The phone helper

**Files:**
- Modify: `src/staff-views.mjs`. Add `PHONE_LOCKED`, `phoneMask` and `htmlRow` near `detailRow` (~line 599).
- Test: `tests/staff-views.test.mjs`. Add to the import list and add a new test block after the `v2Case` helpers (~line 1320).

**Interfaces:**
- Produces:
  - `export const PHONE_LOCKED = "Claim this case to see the full number"`.
  - `export function phoneMask(value: string|null|undefined, allowed: boolean, id?: string): string`. It returns HTML; "Not given" when empty.
  - `export const htmlRow = (label: string, html: string) => string`. This is `detailRow`'s markup without escaping the value.

- [ ] **Step 1: Write the failing tests.** Add `phoneMask, htmlRow, PHONE_LOCKED` to the import from `../src/staff-views.mjs`, then add:

```js
// ---------------------------------------------------------------------------
// The masked phone (D5, DESIGN.md §8): one helper, two states.
// ---------------------------------------------------------------------------

// Every attribute value in the HTML, with the icons' path data left out
// (an SVG path is full of digits).
const attrs = (html) =>
  [...html.replace(/<svg[\s\S]*?<\/svg>/g, "").matchAll(/\s[\w-]+="([^"]*)"/g)].map((m) => m[1]);

test("phoneMask: an allowed viewer gets the mask, the eye and the number as text only", () => {
  for (const stored of ["2155550123", "(215) 555-0123"]) {
    const html = phoneMask(stored, true, "contact-phone");
    assert.match(html, /^<span class="phone-mask" id="contact-phone" tabindex="0">/);
    assert.match(html, /<span class="phone-dots" aria-hidden="true">\(•••\) •••-0123<\/span>/);
    assert.match(html, /<span class="phone-full">\(215\) 555-0123<\/span>/);
    assert.equal(html.match(/555-0123/g).length, 1, "the number appears once");
    for (const value of attrs(html)) assert.doesNotMatch(value, /215|555/, `an attribute carries the number: ${value}`);
    assert.match(html, /<svg class="icon /);
    assert.doesNotMatch(html, /title=|aria-label=/);
  }
});

test("phoneMask: a viewer who is not allowed gets the last four, a lock and no number anywhere", () => {
  const html = phoneMask("2155550123", false, "contact-phone");
  assert.doesNotMatch(html.replace(/<svg[\s\S]*?<\/svg>/g, ""), /215|555/);
  assert.doesNotMatch(html, /tabindex|\sid=/);
  assert.match(html, /^<span class="phone-mask is-locked" title="Claim this case to see the full number">/);
  assert.match(html, /<span class="phone-dots" aria-hidden="true">\(•••\) •••-0123<\/span>/);
  assert.match(html, /<span class="sr-only">Ends in 0123\. Claim this case to see the full number\.<\/span>/);
  assert.equal(PHONE_LOCKED, "Claim this case to see the full number");
});

test("phoneMask: an empty phone reads Not given, and a short one shows bullets only", () => {
  for (const allowed of [true, false])
    for (const empty of ["", null, undefined]) assert.equal(phoneMask(empty, allowed), "Not given");
  assert.match(phoneMask("123", false), /\(•••\) •••-••••/);
  assert.doesNotMatch(phoneMask("123", false), /123/);
});

test("htmlRow is detailRow's markup without escaping the value", () => {
  assert.equal(htmlRow("Phone", "<b>x</b>"), '<div class="detail-row"><span>Phone</span><strong><b>x</b></strong></div>');
  assert.equal(htmlRow("A & B", "x"), '<div class="detail-row"><span>A &amp; B</span><strong>x</strong></div>');
});
```

- [ ] **Step 2: Run the tests and watch them fail.**
  - Run: `node --test tests/staff-views.test.mjs`
  - Expected: FAIL, with `phoneMask` / `htmlRow` / `PHONE_LOCKED` not exported (a SyntaxError on the import).

- [ ] **Step 3: Implement.** In `src/staff-views.mjs`, directly after `detailRow`:

```js
// A row whose value is already HTML (built from escaped parts), such as a
// masked phone. `detailRow` keeps escaping its value.
export const htmlRow = (label, html) =>
  `<div class="detail-row"><span>${esc(label)}</span><strong>${html}</strong></div>`;

// A client phone on a staff screen (D5, DESIGN.md §8): always masked first.
// `allowed` is `canSeeContact`, the only rule. An allowed viewer reveals the
// number on hover or focus (CSS only); it is a text node, never an attribute,
// so screen readers read it. Anyone else gets the last four digits and a lock,
// and the full number never reaches the page. `id` (allowed only) lets a
// redraw put focus back, so a revealed number stays revealed. An empty phone
// reads "Not given", the contact card's wording; the answers panel never
// passes one here (its unanswered path says "Not answered").
export const PHONE_LOCKED = "Claim this case to see the full number";
const PHONE_QUESTION = findQuestion(2, "tp_phone");

export function phoneMask(value, allowed, id = "") {
  const full = formatAnswer(PHONE_QUESTION, value ?? "");
  if (!full) return esc("Not given");
  const digits = String(value).replace(/\D/g, "");
  const last = digits.length >= 4 ? digits.slice(-4) : "";
  const dots = `<span class="phone-dots" aria-hidden="true">(•••) •••-${last || "••••"}</span>`;
  if (!allowed) {
    const said = `${last ? `Ends in ${last}. ` : ""}${PHONE_LOCKED}.`;
    return `<span class="phone-mask is-locked" title="${esc(PHONE_LOCKED)}">${dots}<span class="sr-only">${esc(said)}</span>${icon("lock")}</span>`;
  }
  return `<span class="phone-mask"${id ? ` id="${esc(id)}"` : ""} tabindex="0">${dots}<span class="phone-full">${esc(full)}</span>${icon("eye")}</span>`;
}
```

- [ ] **Step 4: Run the tests and watch them pass.**
  - Run: `node --test tests/staff-views.test.mjs`
  - Expected: the four new tests PASS, and the existing tests are unchanged.
  - If `formatAnswer` returns null for `"123"`, so that "Not given" comes back, change that assertion to use a value that `formatAnswer` keeps (check with `node -e`), and say so in the report. Do not loosen the no-digits check.

- [ ] **Step 5: Commit.**

```bash
git add src/staff-views.mjs tests/staff-views.test.mjs
git commit -m "Masked phone helper: phoneMask and htmlRow (mask-phone-numbers-on-screen)"
```

---

### Task 2: The contact card and the answers panel use the helper

**Files:**
- Modify: `src/staff-views.mjs`:
  - `CONTACT_QUESTION_IDS` (~line 720);
  - the `answersPanelV2` filter and rows (~768–800);
  - `contactCard` (~815–856).
- Test: `tests/staff-views.test.mjs` (~1388–1420), and `tests/admin-views.test.mjs` (~735–752).

**Interfaces:**
- Consumes: `phoneMask(value, allowed, id)`, `htmlRow(label, html)` (Task 1).
- Produces: the ids `contact-phone`, `contact-spouse-phone`, `answers-tp_phone` and `answers-sp_phone` (allowed viewers only), used by Task 4.

- [ ] **Step 1: Update the tests first.** In `tests/staff-views.test.mjs`, replace the test "the contact questions are skipped entirely unless the viewer may see contact details" with:

```js
test("a viewer who may not see contact details gets the phones locked in the answers, and no best time or note", () => {
  const html = v2Panel(v2Case({ married: true }), null);
  assert.match(html, /Phone number<\/span><strong><span class="phone-mask is-locked"/);
  assert.match(html, /Spouse&#39;s phone number<\/span><strong><span class="phone-mask is-locked"/);
  for (const text of ["Best time to reach you", "Notes about reaching you"]) assert.doesNotMatch(html, new RegExp(text), text);
  assert.doesNotMatch(html.replace(/<svg[\s\S]*?<\/svg>/g, ""), /215|555-01/);
  // An unanswered required phone reads as it does for anyone: "Not answered".
  // (The phones live in `contact`, not `answers`, so empty it there.)
  const base = v2Case();
  const bare = v2Panel({ ...base, contact: { ...base.contact, phone: null } }, null);
  assert.match(bare, /Phone number<\/span><strong>Not answered<\/strong>/);
  assert.match(v2Panel({ ...base, contact: { ...base.contact, phone: null } }, SAM), /Phone number<\/span><strong>Not answered<\/strong>/);
  // Allowed: the mask, revealable, with the answers panel's own id.
  const seen = v2Panel(v2Case({ married: true }), SAM);
  assert.match(seen, /Phone number<\/span><strong><span class="phone-mask" id="answers-tp_phone" tabindex="0">/);
  assert.match(seen, /id="answers-sp_phone"/);
  assert.match(seen, /<span class="phone-full">\(215\) 555-01\d\d<\/span>/);
});
```

  In "contact details follow D5 on the staff page", replace the body with:

```js
  const unclaimed = v2Case({ married: true, stage: "preparation_ready", preparerId: null, participants: [] });
  const html = renderStaffCase(unclaimed, ALEX);
  assert.doesNotMatch(html.replace(/<svg[\s\S]*?<\/svg>/g, ""), /215\D?555|2155550/);
  assert.doesNotMatch(html, /Weekday evenings|After 6 pm/);
  const card = html.match(/<section class="panel contact-card"[\s\S]*?<\/section>/)[0];
  assert.match(card, /<h2 id="contact-title">Contact details<\/h2>/);
  assert.match(card, /<span>Phone<\/span><strong><span class="phone-mask is-locked"/);
  assert.match(card, /<span>Spouse phone<\/span><strong><span class="phone-mask is-locked"/);
  assert.match(card, /<p class="muted">Contact details are shown to the office, and to the preparer and reviewer once the case is claimed\.<\/p><\/section>$/);
  assert.doesNotMatch(card, /Best time to reach|toggle-edit-contact|tabindex/);
  assert.doesNotMatch(html, /data-action="view-draft"/);
  // The same case with that volunteer as its preparer.
  const claimed = renderStaffCase(v2Case({ married: true, preparerId: "alex", participants: ["alex"] }), ALEX);
  assert.match(claimed, /<span>Phone<\/span><strong><span class="phone-mask" id="contact-phone" tabindex="0">/);
  assert.match(claimed, /id="contact-spouse-phone"/);
  assert.match(claimed, /<span class="phone-full">\(215\) 555-01\d\d<\/span>/);
  assert.match(claimed, /Weekday evenings/);
  assert.match(claimed, /data-action="toggle-edit-contact" aria-expanded="false">Edit best time<\/button>/);
  assert.doesNotMatch(claimed, new RegExp(D5_SENTENCE));
  // Every revealable mask has its own id, so a redraw can put focus back.
  const ids = [...claimed.matchAll(/class="phone-mask" id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids.sort(), ["answers-sp_phone", "answers-tp_phone", "contact-phone", "contact-spouse-phone"]);
  // An office person sees it on any case.
  const office = renderStaffCase(unclaimed, SAM);
  assert.match(office, /<span class="phone-full">\(215\) 555-01\d\d<\/span>/);
```

  In `tests/admin-views.test.mjs` (~748), replace `assert.match(tab, /\(215\) 555-01\d\d/);` with:

```js
  assert.match(tab, /<span class="phone-mask" id="contact-phone" tabindex="0">/);
  assert.match(tab, /<span class="phone-full">\(215\) 555-01\d\d<\/span>/);
  assert.doesNotMatch(tab.replace(/<svg[\s\S]*?<\/svg>/g, ""), /="[^"]*555-01/, "no attribute carries the number");
```

- [ ] **Step 2: Run the tests and watch them fail.**
  - Run: `node --test tests/staff-views.test.mjs tests/admin-views.test.mjs`
  - Expected: FAIL on the new assertions (no `phone-mask` yet).

- [ ] **Step 3: Implement.** In `src/staff-views.mjs`:

  Next to `CONTACT_QUESTION_IDS`, add:

```js
// The phones show masked to anyone (D5); best time and the note only to
// viewers who may see contact details.
const PHONE_QUESTION_IDS = new Set(["tp_phone", "sp_phone"]);
```

  In `answersPanelV2`, change the filter and add the phone branch at the top of the `flatMap`:

```js
            .filter((question) => showContact || PHONE_QUESTION_IDS.has(question.id) || !CONTACT_QUESTION_IDS.has(question.id))
            .flatMap((question) => {
              if (PHONE_QUESTION_IDS.has(question.id) && formatAnswer(question, answers[question.id]) !== null)
                return [
                  htmlRow(wording(question, options), phoneMask(answers[question.id], showContact, `answers-${question.id}`)),
                ];
              const read = answerRows(question, answers[question.id], options);
```

  (The rest of the `flatMap` stays as it is. An unanswered phone falls through to the existing "Not answered" path.)

  Replace `contactCard`'s first lines and its phone rows:

```js
export function contactCard(record, rights, ui = {}) {
  const head = '<div class="section-head"><h2 id="contact-title">Contact details</h2></div>';
  const contact = record?.contact ?? {};
  const seen = Boolean(rights?.seesContact);
  const phones = `${htmlRow("Phone", phoneMask(contact.phone, seen, "contact-phone"))}${htmlRow(
    "Spouse phone",
    phoneMask(contact.spousePhone, seen, "contact-spouse-phone"),
  )}`;
  if (!seen)
    return `<section class="panel contact-card" aria-labelledby="contact-title">${head}${phones}<p class="muted">${esc(CONTACT_NOT_SHOWN)}</p></section>`;
  const shown = (id, value) => formatAnswer(findQuestion(2, id), value) ?? "Not given";
```

  …and in the returned section, replace the two phone `detailRow`s with `${phones}`:

```js
  return `<section class="panel contact-card" aria-labelledby="contact-title">${head}${phones}${detailRow(
    "Best time to reach",
    shown("best_contact_time", contact.bestContactTime),
  )}${detailRow("Note", shown("best_contact_note", contact.bestContactNote))}${when(
```

  (Delete the old `const contact = …` line further down; it's now at the top.)

- [ ] **Step 4: Run the tests and watch them pass.**
  - Run: `node --test tests/staff-views.test.mjs tests/admin-views.test.mjs`, then `npm test`.
  - Expected: all PASS. If another unit test reads the full number from these views, update it the same way (mask and `.phone-full`), and list it in the report.

- [ ] **Step 5: Commit.**

```bash
git add src/staff-views.mjs tests/staff-views.test.mjs tests/admin-views.test.mjs
git commit -m "Case page: phones masked in the contact card and the answers (D5)"
```

---

### Task 3: Styles, the browser story and DESIGN.md §8

**Files:**
- Modify: `src/styles.css`. Add after the `.contact-card .detail-row > span` block (~line 4650).
- Modify: `tests/browser.mjs`. Before the claim, ~777–805; after the claim, ~812–835.
- Modify: `docs/design/DESIGN.md` §8 "Masked phone" (~line 359).
- The screenshot `docs/design/screens/implemented-staff-contact-hidden.png` is retaken by the story.

**Interfaces:**
- Consumes: the classes `phone-mask`, `is-locked`, `phone-dots` and `phone-full`, and the ids `contact-phone` and `contact-spouse-phone` (Tasks 1–2).

- [ ] **Step 1: Add the styles.**

```css
/* A client phone (D5, DESIGN.md §8): masked first. An allowed viewer's
   number is in the page but clipped like .sr-only (screen readers read it)
   until hover or focus; focus stays after a click, so it can be copied. */
.phone-mask {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-variant-numeric: tabular-nums;
  border-radius: 4px;
}
.phone-mask .icon {
  width: 16px;
  height: 16px;
  color: var(--vt-phase-available);
}
.phone-mask .phone-full {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.phone-mask:not(.is-locked):hover .phone-full,
.phone-mask:not(.is-locked):focus-within .phone-full {
  position: static;
  width: auto;
  height: auto;
  margin: 0;
  overflow: visible;
  clip-path: none;
}
.phone-mask:not(.is-locked):hover .phone-dots,
.phone-mask:not(.is-locked):focus-within .phone-dots {
  display: none;
}
.phone-mask[tabindex]:focus-visible {
  outline: 3px solid var(--vt-primary);
  outline-offset: 2px;
}
.phone-mask.is-locked,
.phone-mask.is-locked .icon {
  color: var(--vt-muted);
  font-weight: 400;
}
.phone-mask.is-locked {
  cursor: help;
}
```

- [ ] **Step 2: The story, before the claim.**
  - Keep `assert.ok(answersRead.contact.includes(CONTACT_NOT_SHOWN), …)` and the `appText` check.
  - Directly after the `appText` check (line ~799), add:

```js
      const locked = await staff.evaluate(() =>
        [...document.querySelectorAll("#case-panel-intake .phone-mask")].map((mask) => ({
          locked: mask.classList.contains("is-locked"),
          title: mask.getAttribute("title"),
          focusable: mask.hasAttribute("tabindex"),
          where: mask.closest(".contact-card") ? "card" : mask.closest(".answers-v2") ? "answers" : "other",
        })),
      );
      assert.ok(locked.some((mask) => mask.where === "card"), "no masked phone in the contact card");
      assert.ok(locked.some((mask) => mask.where === "answers"), "no masked phone in the answers");
      for (const mask of locked) {
        assert.ok(mask.locked, "an unlocked mask before the claim");
        assert.equal(mask.title, "Claim this case to see the full number");
        assert.equal(mask.focusable, false);
      }
      const markup = await staff.evaluate(() => document.querySelector("#app")?.innerHTML ?? "");
      assert.doesNotMatch(markup, SAMPLE_PHONE, "a phone reached the markup of a volunteer who has not claimed the case");
      assert.doesNotMatch(markup, /2155550\d\d\d/, "a stored phone reached the markup");
```

  The existing `shootWithoutSidebar(staff, "staff-contact-hidden")` then retakes the screenshot with the locked masks.

- [ ] **Step 3: The story, after the claim.**
  - Keep the `waitFor(… SAMPLE_PHONE …)` and `contactRow("Phone")` checks. They still pass, because `.phone-full` is text.
  - After `assert.equal(await contactRow("Best time to reach"), "Weekday evenings");`, add:

```js
      // The masked phone (D5, DESIGN.md §8): hidden until hover or focus, kept
      // while focused after a click, hidden again when focus leaves.
      const mask = staff.locator("#contact-phone");
      const fullShown = () =>
        staff.evaluate(() => {
          const full = document.querySelector("#contact-phone .phone-full");
          const dots = document.querySelector("#contact-phone .phone-dots");
          return { full: (full?.getBoundingClientRect().width ?? 0) > 4, dots: (dots?.getBoundingClientRect().width ?? 0) > 4 };
        });
      const pointerAway = () => staff.mouse.move(1, 1);
      await pointerAway();
      assert.deepEqual(await fullShown(), { full: false, dots: true }, "the number shows before anyone asks");
      await mask.hover({ timeout: CLICK_MS });
      assert.deepEqual(await fullShown(), { full: true, dots: false }, "hover did not reveal the number");
      await pointerAway();
      assert.deepEqual(await fullShown(), { full: false, dots: true }, "the number stayed after the pointer left");
      await mask.focus();
      assert.deepEqual(await fullShown(), { full: true, dots: false }, "keyboard focus did not reveal the number");
      await staff.keyboard.press("Tab");
      assert.deepEqual(await fullShown(), { full: false, dots: true }, "the number stayed after focus left");
      await mask.click({ timeout: CLICK_MS });
      await pointerAway();
      assert.deepEqual(await fullShown(), { full: true, dots: false }, "a click did not keep the number shown");
      await staff.keyboard.press("Tab");
      await pointerAway();
      assert.deepEqual(await fullShown(), { full: false, dots: true }, "the number stayed after the click's focus left");
```

- [ ] **Step 4: The story: a realtime update keeps a revealed number revealed.**
  - This is the spec scenario "A realtime update keeps a revealed number revealed".
  - Put it after Alex's contact edits: directly after the last `await staff.locator("#contact-form").waitFor({ state: "detached", timeout: RENDER_MS });` (~line 984), before the `actForm(staff, "REQUEST_DOCUMENT", …)`.
  - It uses `fullShown` and `pointerAway` from Step 3, which are in the same phase.
  - `case_contacts` is in the realtime publication (migration 011), so a write through the fixture reaches the staff page as a realtime update.

```js
      // A realtime update while the number is revealed by focus keeps it
      // revealed: the redraw puts focus back on the mask by its id.
      const REDRAW_NOTE = "Fictional note: written to check a redraw.";
      const setNote = (note) =>
        one(fixture, "update public.case_contacts set best_contact_note=$2 where case_id=$1 returning case_id", [
          classCase.id,
          note,
        ]);
      await pointerAway();
      await staff.locator("#contact-phone").focus();
      await setNote(REDRAW_NOTE);
      await waitForText(staff, REDRAW_NOTE);
      assert.equal(
        await staff.evaluate(() => document.activeElement?.id ?? null),
        "contact-phone",
        "the realtime redraw took focus off the mask",
      );
      assert.deepEqual(await fullShown(), { full: true, dots: false }, "the realtime redraw hid the revealed number");
      await setNote(EDITED_BEST_TIME_NOTE);
      await waitForText(staff, EDITED_BEST_TIME_NOTE);
      await staff.keyboard.press("Tab");
```

  Notes for the implementer:
  - If the redraw lands but focus does not come back, the fault is in the view (a missing or duplicated id), not in the test. Use superpowers:systematic-debugging, and do not drop the assertion.

- [ ] **Step 5: Update DESIGN.md §8.** Replace the second "Masked phone" bullet:

  From:
  > - When the viewer may see the number (an admin, or a volunteer on their own case), a small lavender `visibility` icon follows; hover or keyboard focus swaps in the full number. There's no click-to-copy, so a shared screen never keeps a number on display.

  To:
  > - When the viewer may see the number (an admin, or a volunteer on their own case), a small lavender `visibility` icon follows; hover or keyboard focus swaps in the full number. A click keeps it shown only while the mask has focus, so it can be selected and copied; clicking elsewhere or pressing Tab hides it again. There's no copy button.

- [ ] **Step 6: Run the checks.**
  - Run: `npm test`. Expected: PASS.
  - Run: `npm run test:browser`. It takes about 11–16 minutes; run it in the background. Expected: every phase passes.
  - Confirm the retaken screenshot shows the locked masks and the sentence. Read the PNG.
  - If a phase fails, use superpowers:systematic-debugging. Do not weaken an assertion to make it pass.

- [ ] **Step 7: Commit.**

```bash
git add src/styles.css tests/browser.mjs docs/design/DESIGN.md docs/design/screens/implemented-staff-contact-hidden.png
git commit -m "Masked phone: reveal on hover and focus, kept after a click; story checks; DESIGN.md §8"
```

---

### Task 4: Tick tasks.md

**Files:**
- Modify: `openspec/changes/mask-phone-numbers-on-screen/tasks.md`.

- [ ] **Step 1: Tick the boxes.** Tick 1.1–1.2 after Task 1, 2.1–2.3 after Task 2, and 3.1, 4.1–4.4 and 5.1–5.2 after Task 3. Leave 5.3 (the PR description) open. It's done at the finish step, with this text in the PR body:

  > **Display-only masking.** The full number still reaches the browser for every staff persona: RLS lets them all read `case_contacts`, and devtools show it. Real protection comes with the staff-identity / database change (production roadmap §1).

- [ ] **Step 2: Commit.**

```bash
git add openspec/changes/mask-phone-numbers-on-screen/tasks.md
git commit -m "mask-phone-numbers-on-screen: tasks done"
```

---

## Checks that are not needed (for verify.md)

- `npm run db:migrate:test` / `npm run test:database`: no migration, SQL function or other database behaviour changes.
- `npm run test:auth-browser`: sign-in is untouched.
- `npm run build:hant -- --check`: no client text, and staff screens stay English. CI runs it anyway.
