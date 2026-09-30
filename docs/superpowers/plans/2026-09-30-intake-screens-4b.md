# Part 4b: The client's nine-step intake, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the client's version-2 nine-step form and the shared renderer it uses. The form is complete and tested (unit plus a browser phase), but unreachable in normal use, because `default_intake_version` stays 1. PR 4c adds the staff side and switches the default.

**Architecture:**
- **Shared renderer.** A pure module, `src/intake-form.mjs`, turns catalogue questions into controls (`renderQuestion`), reads them back (`readField` per keystroke, `readForm` before a save, merged into the draft), and formats answers as read-only text (`formatAnswer`).
- **Screen.** `src/client-views.mjs` dispatches `intakeScreen` on `intakeVersion`: version 1 keeps today's form, and version 2 gets the new stepper.
- **Controller.** It keeps a version-aware draft: structured values and explicit `null` clears for version 2, with the contact fields merged in from `record.contact`.
- **Wiring.** `src/app.mjs` wires the rest:
  - keystrokes, with in-place updates of the note, the rail mark and the character count;
  - the redraw rules of spec §2.4: presses never lose their target, `change` redraws are queued, and focus, caret and scroll are restored;
  - the step rail, the senior switch and Fill fictional details.

**Tech Stack:** vanilla ES modules rendering HTML strings; `node:test`; Playwright; the local Supabase test stack.

**Spec:** `docs/superpowers/specs/2026-09-30-intake-screens-design.md` §1–§3 and §6 (the PR 4b parts). PR 4c (§4–§5) gets its own plan after this merges.

## Global Constraints

- **Version 1 is untouched.**
  - A version-1 draft gets today's four-step form, byte-for-byte the same markup and behaviour.
  - Version-1 `pickAnswers` behaviour is unchanged: 17 keys, string values, `null`/`undefined` dropped.
  - The existing browser story's version-1 walk is unchanged in this PR.
- **Nothing reaches version 2 in normal use.** `default_intake_version` stays 1. No migration in this PR changes schema or defaults. The only migration is the generated catalogue one (Task 1).
- **Catalogue rules come from `src/intake-catalogue.mjs`, never re-implemented:**
  - `stepsFor`, `questionsFor`, `findQuestion`, `wording`, `isVisible`, `isAnswered`, `checkValue`, `missingToSubmit`, `CONTACT_FIELDS`, `serviceLabel`, `languageLabel`;
  - `CATALOGUE.fixedOptions` for `who` and `yesno` labels.
- **Version-2 draft shape:**
  - keys are the catalogue's top-level field IDs, including the four contact fields `tp_phone`, `sp_phone`, `best_contact_time`, `best_contact_note`;
  - values are strings, arrays of strings, or (for `hh`) arrays of member objects;
  - an explicit `null` means "clear this field on the next save", and is kept in the draft until then;
  - inside a household member, empty sub-fields are omitted, never `null`.
- **Saves merge on the server** (`answers || payload`, with `null` clearing). So a save sends the whole version-2 draft, `null`s included, and a cleared field reaches the server.
- **Redraw rules: spec §2.4 is the contract.** It applies while `#intake-v2-form` is on the page; version-1 screens keep today's `render()` behaviour exactly.
  1. **A press never loses its target.** Between `pointerdown` and `pointerup`/`pointercancel`, a requested redraw is held. It runs from a `setTimeout(…, 0)` queued on `pointerup`/`pointercancel`, after the `click`.
  2. **`input` never redraws.** It writes the draft (`readField`) and sets only `className`/`textContent` on:
     - the question's note (`field-<scope>-<id>-note`);
     - the current step's rail status (`rail-step-<n>-status`);
     - a `longtext`'s count (`field-<scope>-<id>-count`).
  3. **A full redraw only when the visible questions change:**
     - a radio, checkbox or `<select>` `change`;
     - a `change` of a text field with `drivesVisibility(id)` (today only `gcf_sp_signature`), and only when `needsRedraw(renderedIds, step, answers)` is true.

     The comparison is **the ids rendered on the page against the ids the draft makes visible**, never draft-before against draft-after: rule 2 has already put the typed value in the draft. A `change`-caused redraw is queued with `setTimeout(…, 0)`.
  4. **Every redraw restores focus, caret and scroll.** Focus and caret use the existing `describeFocus`/`restoreField`; the scroll (`scrollX`/`scrollY`) is new, for the version-2 form only. A redraw requested during IME composition waits for `compositionend`.
- **No browser validation blocks Continue.** The spec says the form warns but always moves on.
  - The `submit` handler handles `#intake-v2-form` before its `form.reportValidity()` call. `reportValidity` ignores `novalidate`, and `type="email"` alone would block Continue on a half-typed address.
  - The renderer emits no `required`, `min`, `max` or `pattern` attributes; ranges are shown as text.
- **Immutable draft updates.** Never mutate a draft array or household member in place. `saveAnswers` shallow-copies the draft into its envelope, and `staleSave` compares that envelope with the draft by JSON, so an in-place edit would silently change a retained envelope.
- **Unanswered is one state.** Wherever two version-2 values are compared (the conflict screen, tests), `null`, a missing key, `""` and `[]` are equal. Use `isAnswered`.
- **Hooks that must not change:** everything the existing browser, auth-browser and client-views tests use for version 1 (`#intake-form`, `.page-intro .overline` "STEP n OF 4", `#field-confirmed`, `fill-fictional`, `save-exit`, `.conflict-panel`, `reconcile-mine`, `.id-pill strong` first = Application ID, etc.).
  - The version-2 form uses its own form id, `#intake-v2-form`, and its own overline, "STEP n OF 9".
- **Accessibility:**
  - a real `<label>` per control, and `<fieldset>`/`<legend>` for grouped controls;
  - IDs `field-<scope>-<id>` (household: `field-<scope>-hh-<n>-<sub>`);
  - every question's fixed note container (`aria-live="polite"`), and a `longtext`'s count container (not live), both referenced by the control's `aria-describedby`;
  - controls at least `var(--vt-tap)` (44px) tall;
  - client text in `--vt-intake-ink` / `--vt-intake-hint`;
  - colors only from `--vt-*` tokens (`#fff` allowed);
  - no sideways scroll at 390px.
- **Migrations:** only the generated catalogue migration (Task 1). Never edit 001–013.
- **Test stack:** the Docker Supabase `vitally-task2.M5anE7XP` on 54321 (`.env.test`). Start it with `docker start $(docker ps -aq --filter name=vitally-task2)`. Never run `npx supabase start` from the repo root.
- **Shell PATH:** prefix node, npm and docker commands with `PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`.
- **Test imports:** importing a not-yet-exported name makes the whole test file fail to load, and that is the expected RED.
- Only fictional data. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Out of scope (PR 4c):**
- staff answer views and the contact and materials cards;
- the version-2 Add a case;
- the switch-over migration and version-2 samples;
- the database fixture's `intakeVersion` option;
- the main browser story moving to version 2.

---

## File map

| File | Change |
|---|---|
| `tools/build-intake-catalogue.mjs` | Step titles 5, 7, 9; the migration header explains title-only changes |
| `src/intake-catalogue-data.mjs` (generated) | New step titles |
| `supabase/migrations/014_intake_catalogue_<hash8>.sql` (generated) | Same field rows as 012, new hash |
| `src/intake-form.mjs` (new) | `renderQuestion`, `readField`, `readForm`, `formatAnswer`, `mergeIntoDraft`, `drivesVisibility`, `needsRedraw`, `noteState`, `countText`, `stepStatus`, `renderRichText` |
| `src/sample-data.mjs` | `makeSampleAnswers({ version: 2 })` |
| `src/controller.mjs` | Version-aware `pickAnswers`; contact merge; `visitedSteps`; `goToStep`; the spouse clear |
| `src/window-state.mjs` | `visitedSteps` field |
| `src/client-views.mjs` | Version-2 `intakeScreen` (stepper, rail, step 9, read-only after submit); `conflictForm` version-2 branch; progress-page labels |
| `src/views.mjs` | The Senior version switch in `clientHeader` on the version-2 intake |
| `src/app.mjs` | Version-2 input/change wiring with in-place updates; the redraw hold (pointer, composition), queued `change` redraws and scroll restore; step rail, senior switch, Fill fictional details |
| `src/styles.css` | Version-2 intake styles (fenced block) |
| Tests | `tests/intake-form.test.mjs` (new), `tests/intake-catalogue.test.mjs`, `tests/intake-build.test.mjs`, `tests/sample-data.test.mjs`, `tests/controller.test.mjs`, `tests/window-state.test.mjs`, `tests/client-views.test.mjs`, `tests/shell.test.mjs`, `tests/browser.mjs` (a new phase) |

---

### Task 1: Step titles and the catalogue migration

**Files:** `tools/build-intake-catalogue.mjs`, `tests/intake-build.test.mjs`, the generated `src/intake-catalogue-data.mjs` and `supabase/migrations/014_intake_catalogue_<hash8>.sql`.

- [ ] **Step 1: Failing test.** In `tests/intake-build.test.mjs`, assert the committed catalogue's steps 5, 7 and 9:
  - step 5: `{ en: "Household members", zh: "家庭成员" }`;
  - step 7: `{ en: "Expenses & life events", zh: "支出与生活事项" }`;
  - step 9: `{ en: "Permission & review", zh: "授权与确认" }`.
- [ ] **Step 2:** Run `node --test tests/intake-build.test.mjs`. Expected: that test FAILs.
- [ ] **Step 3: Change the build.**
  - Update the three entries in the step table (the `STEPS` constant near `tools/build-intake-catalogue.mjs:57-65`).
  - Make the migration writer's header also print this line:
    ```
    -- Loads the catalogue into vitally_private.intake_fields. A catalogue change that touches only text the database doesn't store (step titles, wording) still needs a new migration: the hash covers the whole catalogue, and the newest catalogue migration must carry it.
    ```
- [ ] **Step 4:** Run `npm run build:intake`. It writes the data module and `014_intake_catalogue_<hash8>.sql`. Then `npm run db:migrate:test`, `node --test tests/intake-build.test.mjs`, and `npm test`. Expected: PASS, including the "database never behind browser" test.
- [ ] **Step 5: Commit** ("Use the designs' step titles; catalogue migration 014").

---

### Task 2: The shared renderer

**Files:** Create `src/intake-form.mjs` and `tests/intake-form.test.mjs`.

**Interfaces (produces):**
```js
// Every function is pure. `scope` makes IDs unique ("client", "office").
renderQuestion(question, value, { variant = "general", lang = "en", scope, answers = {}, showMissing = false, contact = {} }) → string
// A control descriptor is plain data, so the reading rules are testable in Node:
//   { q, member?, sub?, part?, type, value, checked }
//   q = question id; member/sub for household controls; part = "month"|"day"|"year".
valuesFromControls(descriptors) → { [id]: value }        // pure; every question present in the list
describeControl(element) → descriptor                    // DOM, reads data-* and value/checked
readField(element) → { [id]: value }                     // DOM: describes every control of the element's question (or, in the household, of the whole group) and calls valuesFromControls
readForm(formElement) → { [id]: value }                  // DOM: every [data-control] in the form
mergeIntoDraft(draft, patch) → newDraft                  // field by field; never drops keys absent from patch; never mutates
drivesVisibility(id) → boolean                           // true when some showIf in the catalogue names this field
visibleIds(step, answers) → string[]                     // top-level question ids on step (0–8) that isVisible makes visible, in order
needsRedraw(renderedIds, step, answers) → boolean        // spec §2.4 rule 3: page ids vs visibleIds(step, answers), as sets
noteState(question, value, { showMissing }) → { text: string, className: string }
                                                         // "Needs an answer"/"is-missing" when showMissing, required and !isAnswered; else "" / ""
countText(value) → string                                // "4,612 of 5,000 characters" when length > 4500, else ""
stepStatus(step, answers, contact, visited) → { key: "done"|"needs"|"none", text: "Done"|"Needs answers"|"" }
                                                         // done: no visible required question unanswered; needs: visited with some; none otherwise
renderRichText(text) → string                            // intros and tips: escape, then **bold**, "- " lists, blank-line paragraphs
formatAnswer(question, value, { variant = "general", lang = "en" }) → string | null
```
- **Every question renders its note container,** `<p id="field-<scope>-<id>-note" class="q-note{ is-missing}" aria-live="polite">`, always, even when empty, with its text and class from `noteState`. Household sub-questions use `field-<scope>-hh-<n>-<sub>-note`.
- **Every `longtext` renders its count container,** `<p id="field-<scope>-<id>-count" class="q-count">`, always, with its text from `countText`; it has no `aria-live`.
- **The control's `aria-describedby`** lists the note id (and the count id for `longtext`).
- **Every input, select and textarea carries `data-control`.**
- **Top-level controls carry `data-q="<id>"`.**
- **Household controls carry `data-q="hh"`, `data-member="<n>"` and `data-sub="<sub>"`.** A sub-question's wrapper never carries its own `data-q`, so `closest("[data-q]")` always finds the right question.
- **Radio and checkbox options each have their own id,** `field-<scope>-<id>-<value>`. The `change` handler refocuses by id, and radios share a name.
- **Household buttons:** "Add a person" is `data-action="add-member"`, and Remove is `data-action="remove-member"` with `data-member="<n>"`.
- **A date's three boxes** carry `data-date-part="month|day|year"`.
- **The section intro** (`section.intro[variant][lang]`) and every tip go through `renderRichText`. Their text is Markdown-lite: there are about 150 `**bold**` runs in the catalogue, and bulleted lists.
- **`formatAnswer` formats dates by splitting the string,** never through `new Date(…)`, which shifts a date by the time zone.

- [ ] **Step 1: Failing tests** (`tests/intake-form.test.mjs`). Render from the real catalogue (`findQuestion(2, …)`).
  - The read tests use `valuesFromControls` with hand-built descriptors.
  - The DOM wrappers (`describeControl`, `readField`, `readForm`) are covered by Task 6's browser phase.
  - **Rendering:**
    - For each type in the catalogue (pick one question per type: text, signature, longtext, email, phone, zip, year, number with a range, date, choice with ≤6 and >6 options, yesno with and without `not_sure`, multi, who, group):
      - the HTML contains `data-q="<id>"`;
      - a `<label for="field-client-<id>">` or a `<legend>`;
      - the question's wording;
      - for choice, yesno, multi and who, every option's label.
    - `who` omits "My spouse" unless `answers.marital_status === "married"`.
    - A `choice` with more than 6 options renders a `<select>`.
    - `longtext` has `maxlength="5000"` and always a `field-client-<id>-count` element. `countText("a".repeat(4500))` is `""`, and `countText("a".repeat(4612))` is "4,612 of 5,000 characters".
    - No rendered control has `required`, `min`, `max` or `pattern`.
    - Every radio and checkbox has a unique id.
    - `renderRichText("**W-2** & <b>\n- one\n- two")` gives `<strong>W-2</strong> &amp; &lt;b&gt;` and a two-item `<ul>`.
    - `drivesVisibility("marital_status")` and `drivesVisibility("gcf_sp_signature")` are true. `drivesVisibility("gcf_tp_signature")` and `drivesVisibility("tp_first_name")` are false.
    - **`needsRedraw`** (step 9 is index 8):
      - with answers `{ gcf_consent: "yes", marital_status: "married", gcf_sp_signature: "Mei Lin" }` and rendered ids that lack `gcf_sp_date`, it is **true**;
      - with the same answers and rendered ids equal to `visibleIds(8, answers)`, it is **false**;
      - with `gcf_sp_signature: ""` and rendered ids lacking `gcf_sp_date`, it is **false**.
    - **Every question** (answered or not, `showMissing` or not) has `id="field-client-<id>-note"` with `aria-live="polite"`, and the control's `aria-describedby` contains it.
    - `noteState` on an unanswered required question with `showMissing` gives "Needs an answer"/`is-missing`; answered, optional, or `showMissing` false gives empty text and no class. The rendered note carries the same text and class.
    - **`stepStatus`:** a step whose visible required questions are all answered is `done`; a visited step with one missing is `needs`; an unvisited step with one missing is `none`.
    - The senior variant renders the senior wording for a question whose wordings differ (find one in the catalogue).
  - **`multi`/`who` "No one":** descriptors with "No one" and "Me" both checked, where "No one" is the one just changed, read as `["none"]` (use the catalogue's value for "No one"). The rule lives in `valuesFromControls`, which takes an optional `{ changed: value }` hint.
  - **Round trip:** render with a value, build descriptors from the rendered HTML's option values and checked state (a small regex helper in the test file), read back, and get the same value.
    - dates: `"1961-04-12"`;
    - `who`: `["me", "spouse"]` when married;
    - `multi`;
    - `yesno`: `"not_sure"`;
    - household: two members, where the second has only `first_name`, so empty sub-fields are omitted;
    - an empty text reads `null`;
    - a date with one box empty reads `null`;
    - an impossible date `"2025-02-30"` reads `"2025-02-30"`.
  - **`mergeIntoDraft`** keeps keys absent from the patch, and `null` in the patch sets `null`.
  - **`formatAnswer`:**
    - `"1961-04-12"` → "Apr 12, 1961";
    - `"2155550199"` → "(215) 555-0199";
    - `["me","spouse"]` → "Me, My spouse" (from `fixedOptions`);
    - a household member → "Xiao Ming Wang · Son · born Mar 14, 2015 · 12 months";
    - unanswered → `null`.
- [ ] **Step 2:** Run it to confirm the whole file fails to load (the module is missing).
- [ ] **Step 3: Implement `src/intake-form.mjs`.**
  - Use `esc` from `ui.mjs` for every string.
  - Controls follow spec §2.1's table, and radio and checkbox groups are `<fieldset>` with `<legend>`.
  - The `yesno` segmented look is CSS only (Task 4); the markup is a radio group.
  - Tips render under the question; a tip with a condition renders only while it holds; upload tips show text only.
  - A `group` renders one card per member, reusing `renderQuestion` for each sub-question with `scope` `<scope>-hh-<n>`.
- [ ] **Step 4:** Run `node --test tests/intake-form.test.mjs`, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** ("Render, read and format version-2 intake questions").

---

### Task 3: Draft, generator, window state and the controller

**Files:** `src/sample-data.mjs`, `src/controller.mjs`, `src/window-state.mjs`, and their tests.

**Interfaces:**
- **Consumes:** `CONTACT_FIELDS`, `findQuestion`, `stepsFor`, `checkValue`, `missingToSubmit` (reader); `mergeIntoDraft` (Task 2).
- **Produces:**
  - `makeSampleAnswers({ seed, scenario, version: 2 })` → a version-2 draft (the answers plus the four contact fields). Every value passes `checkValue`, and `missingToSubmit(2, answers, contact)` is `[]`.
  - Controller:
    - `pickAnswers(source, version)`: version 1 behaves as today; version 2 keeps catalogue top-level IDs and structured values, including `null`.
    - `editAnswers(patch)` merges through `mergeIntoDraft` for a version-2 case, and applies the spouse clear.
    - `goToStep(n)`: saves if dirty, records the current step as visited, then sets `formStep`.
    - `state.visitedSteps` (an array of step indexes) for the selected case.
  - Window state: `visitedSteps: { caseId: string, steps: number[] }`.

- [ ] **Step 1: Failing tests.**
  - **`tests/sample-data.test.mjs`:**
    - version 2 output passes `checkValue` for every key;
    - `missingToSubmit(2, …)` is `[]`;
    - it is deterministic for a seed;
    - version 1 output is unchanged (deep-equal to today's for seed 0).
  - **`tests/controller.test.mjs`** (use its existing fake store and helpers):
    - opening a version-2 case whose `contact` is `null` gives a draft without contact keys;
    - with `contact: { phone: "2155550199", bestContactTime: ["weekend"] }`, the draft has `tp_phone` and `best_contact_time`;
    - `editAnswers({ tp_middle_name: null })` keeps `null`, and the save payload carries `tp_middle_name: null` and the contact keys;
    - `editAnswers({ marital_status: "never_married" })` drops `"spouse"` from every `who` answer in the draft, in the same edit;
    - `goToStep(3)` records the previous step in `visitedSteps` and saves when dirty;
    - reopening another case resets `visitedSteps`;
    - a version-1 case: `pickAnswers` and `editAnswers` behave exactly as today (reuse existing assertions).
  - **`tests/window-state.test.mjs`:** `visitedSteps` round-trips; a malformed value (bad `caseId` or non-integer steps) is dropped.
- [ ] **Step 2:** Run the three files to confirm they fail.
- [ ] **Step 3: Implement.**
  - **The generator.** Write the version-2 answers as one explicit object literal for a fictional person:
    - a never-married adult with one household member (a child);
    - wages yes, and every other income and event no;
    - a phone `2155550100`–`2155550199` chosen by seed, and a best time `["weekday_evening"]` (use the catalogue's real option values);
    - the name and birth date varied by seed from small fictional lists;
    - `form_version` left out.

    Then add answers until the test's `missingToSubmit(2, …)` is `[]`. Don't generate values by walking the catalogue: a text question has no "first valid value". Keep version 1's code path exactly.
  - **`fillBlankAnswers(current, generated, version = 1)`:**
    - version 2 iterates the union of both objects' catalogue keys;
    - blank means `!isAnswered`, so `null`, `""` and `[]` count as blank.
    - Test it.
  - **The controller:**
    - `pickAnswers(source, version)` has a version everywhere it is called: `applyCase`, `editAnswers` and `reconcileAnswers`, each using `state.savedCase?.intakeVersion`.
    - A version-2 `editAnswers` patch may be all `null`s: the "nothing to edit" early return checks for keys, not values.
    - `applyCase` uses the case's `intakeVersion` for `pickAnswers`, and for version 2 merges the contact fields via `CONTACT_FIELDS`, treating a `null` contact as empty.
    - `visitedSteps` persists through `persistSession`, is restored only when its `caseId` equals `selectedCaseId`, and is cleared by `clearSelection`.
  - **Window state:** add `visitedSteps` to `FIELDS` with a check (a `caseId` string, and an array of integers 0–8).
- [ ] **Step 4:** Run the files, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** ("Version-aware draft, version-2 sample answers and visited steps").

---

### Task 4: The version-2 client screens and styles

**Files:** `src/client-views.mjs`, `src/views.mjs`, `src/styles.css`, `tests/client-views.test.mjs`, `tests/shell.test.mjs`.

**Interfaces:**
- **Consumes:** Tasks 2–3; the reader.
- **Produces** these hooks (Task 5 wires them):
  - rail links `data-action="go-step" data-step="<n>"` (0–8), each containing its fixed `<span id="rail-step-<n>-status" class="rail-status is-<key>">` from `stepStatus`;
  - the current step's `data-q` wrappers, which Task 5 reads as `renderedIds`;
  - Back `back-step`, Continue as a submit of `#intake-v2-form`, and step 9's Submit as `caseButton(…, "SUBMIT")`;
  - the senior switch `data-action="toggle-senior"`, a button with `aria-pressed`;
  - Fill fictional details `data-action="fill-fictional"` (the same action as version 1);
  - `#field-confirmed` on step 9 (the same id as version 1, so the existing confirm wiring works).

- [ ] **Step 1: Failing tests** (`tests/client-views.test.mjs`, `tests/shell.test.mjs`), using a version-2 `savedCase` and draft built from `makeSampleAnswers({ version: 2 })`:
  - **The dispatch:** a version-1 draft still renders `#intake-form` and "STEP 1 OF 4"; the existing tests stay green.
  - **Step 1:** `#intake-v2-form`, "STEP 1 OF 9", and the step title from the catalogue.
  - **The rail:**
    - it has nine `go-step` links, and the current one has `aria-current="step"` and "You are here";
    - every step has its `rail-step-<n>-status` span, even when empty;
    - a step with no missing required question has `is-done` and "Done" (with the check icon outside the span);
    - a visited step with missing questions has `is-needs` and "Needs answers";
    - an unvisited one has `is-none` and no text.
  - **Show-if:** in step 3, with `marital_status: "married"`, a spouse question renders; with `"never_married"` it doesn't.
  - **"Needs an answer"** shows on the current step only when the step is in `visitedSteps`.
  - **Step 9:**
    - "Still to answer" lists the missing questions grouped by step, with `go-step` links;
    - with none missing it reads "Everything required is answered.";
    - Submit is disabled unless the list is empty and `openPanels` includes `"confirmed"`.
  - **The senior switch:**
    - `clientHeader` on a version-2 intake shows `toggle-senior` with `aria-pressed` matching `form_version === "senior"`;
    - a version-1 intake and other screens don't show it;
    - with `form_version: "senior"`, a question renders its senior wording.
  - **A submitted version-2 case** shows the read-only summary grouped by step with `formatAnswer` values, not the version-1 answer rows.
  - **Conflict:** `conflictForm` for a version-2 case with a differing `best_contact_time` array and a differing household lists those rows, with question wording and `formatAnswer` values. A field that is `null` in the draft and missing on the server is not listed.
  - **Progress page:** a version-2 case with `service: "drop_off"` shows "Drop-off", and version 1's "Drop-off" still shows "Drop-off".
  - **CSS** (`tests/shell.test.mjs`): a `/* Part 4b: intake v2 */ … /* end part 4b */` block exists and has no hex except `#fff`.
- [ ] **Step 2:** Run to confirm they fail.
- [ ] **Step 3: Implement.**
  - In `client-views.mjs`, `intakeScreen` dispatches on `record.intakeVersion`.
  - The version-2 stepper follows spec §3.2 and §3.4:
    - one card per section;
    - within a section, one card per `heading` group (questions carry `heading` from the build);
    - `renderQuestion` with `scope: "client"`, `variant: answers.form_version || "general"`, `lang: "en"`, and `showMissing` true when the step is visited.
  - The rail and progress bar use the catalogue's step titles.
  - The office contact card reuses `officeContact()`.
  - `conflictForm` gets the version-2 branch, and the progress summary uses the label lookups.
  - `views.mjs`'s `clientHeader` shows the senior switch on a version-2 intake draft.
  - **CSS**, in the fenced block:
    - the rail states;
    - question cards;
    - segmented yes/no (the radio inputs visually hidden but focusable, with visible focus on the label);
    - checkbox chips;
    - household cards;
    - the date boxes;
    - the note (`.q-note`, `.q-note.is-missing`) and count (`.q-count`) containers, with empty containers taking no height: no margin or padding when `:empty`. Never use `display: none`, because an `aria-live` region that is hidden when its text arrives isn't announced reliably.
    - the rail status classes, keyed on class so an in-place class change restyles it;
    - step 9's list.

    Use tokens only. Style from the step-2 and step-6 designs.
- [ ] **Step 4:** Run the focused files, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** ("The client's nine-step form").

---

### Task 5: Wiring

**Files:** `src/app.mjs` (and `tests/controller.test.mjs` if you add controller helpers).

- [ ] **Step 1: Wire the version-2 form** in `app.mjs`, beside the version-1 `ANSWER_FORMS` handling. Keep version 1's paths unchanged.
  - **The redraw hold** (spec §2.4 rules 1 and 4), inside `render()` and only while `#intake-v2-form` is on the page:
    ```js
    let pointerHeld = false, composing = false, heldRender = null; // heldRender: the `focus` argument of the held call
    // in render(focus): if (v2OnPage() && (pointerHeld || composing)) { heldRender = heldRender || focus; return; }
    root.addEventListener("pointerdown", () => { pointerHeld = true; }, true);
    const release = () => { pointerHeld = false; setTimeout(flushHeld, 0); };  // after the click
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    root.addEventListener("compositionstart", () => { composing = true; });
    root.addEventListener("compositionend", () => { composing = false; setTimeout(flushHeld, 0); });
    function flushHeld() { if (heldRender === null || pointerHeld || composing) return; const f = heldRender; heldRender = null; render(f); }
    ```
    - `heldRender` starts as `null` and holds `false`/`true` while a render is waiting.
    - **Scroll:** when the version-2 form is on the page and `focus` is false, record `window.scrollX`/`scrollY` before `root.innerHTML = …` and `window.scrollTo(x, y)` after `restoreField`.
    - Version-1 screens never reach these branches.
  - **`input`:** a `[data-control]` inside `#intake-v2-form` that has `data-q` → `controller.editAnswers(readField(control))`.
    - It runs quietly, as `editAnswerField` does, followed by `refreshSaveChip()`.
    - Then the **in-place updates**, setting only `className` and `textContent`:
      - the question's note from `noteState(question, value, { showMissing: stepVisited })`;
      - `#rail-step-<formStep>-status` from `stepStatus(formStep, draft, contact, visited)`;
      - for a `longtext`, its count from `countText(value)`.
    - `readField` on a household control returns the whole `hh` array. The draft is replaced, never mutated.
    - Checkboxes are included, unlike version 1.
  - **`change`:** the same read. A redraw is queued (`setTimeout(() => render(), 0)`, so it passes through the hold) only for:
    - a radio, checkbox or select;
    - a text-like control with `drivesVisibility(id)` and `needsRedraw(renderedIds, formStep, draft)`, where `renderedIds` is the `data-q` values of `#intake-v2-form [data-q]` wrappers outside the household group.

    Focus comes back through `render()`'s own `describeFocus`/`restoreField`, taken at flush time, so a Tab's new target is restored, not the field that was left.
  - **`submit` of `#intake-v2-form` (Continue):** handled before `form.reportValidity()`. It runs `editAnswers(readForm(form))`, then `goToStep(formStep + 1)`.
  - **Actions:**
    - `go-step`: `editAnswers(readForm(form))`, `await controller.goToStep(n)`, then focus `#main`.
    - `back-step` on a version-2 case: the same, to `formStep - 1`. Version 1's `back-step` is unchanged: it doesn't save.
    - `toggle-senior`: `editAnswers({ form_version: current === "senior" ? "general" : "senior" })`.
    - `add-member`: append `{}` (up to 10).
    - `remove-member`: remove that index.
    - **`fill-fictional` and `confirm-regenerate`:** `fictional()` branches on `savedCase.intakeVersion`. For version 2, first `editAnswers(readForm(form))`. Then `makeSampleAnswers({ version: 2, seed })`, with `fillBlankAnswers(draft, generated, 2)` for a fill, or the generated set plus `null` for every other catalogue key already in the draft, for a regenerate.
    - `save-exit` on a version-2 case: `editAnswers(readForm(form))` first, then as today.
  - **Step 9's Submit saves first.** In `runCaseAction`, for `SUBMIT` on a version-2 case:
    1. `editAnswers(readForm(form))`;
    2. `if (state.dirty) await controller.saveAnswers()`;
    3. then the action.

    Today's `runAction` sends `expectedRevision` from `savedCase` without saving. A consent answered on step 9 would otherwise be dropped, and the refresh would then raise a conflict on a submitted case.
- [ ] **Step 2:** `npm test`. Expected: PASS. The wiring has no unit tests of its own; Task 6's browser phase is its check, including the Submit-saves-first case.
- [ ] **Step 3: Commit** ("Wire the version-2 intake").

---

### Task 6: A browser phase for the version-2 client, suites, screenshots and docs

**Files:** `tests/browser.mjs` (a new phase; the main story is unchanged), `docs/design/screens/`, `docs/design/README.md`, `docs/design/redesign-review.md`.

- [ ] **Step 1: Add one phase to the story.** Put it after "a reset rebuilds the samples…" and before "nothing threw…". The reset phase compares case sets, so the new case must come after it. The console phase must still see only allowed lines.
  1. `fixture.database.sql("update public.workspaces set default_intake_version=2 where id=$1", [workspaceId])`, using the id the story already has.
  2. In a fresh client window, sign in as `applicantB` with `loginTestUser`, as the story does at `tests/browser.mjs:1137`. Start an application and land on "STEP 1 OF 9".
  3. **Focus survives a realtime redraw:**
     1. scroll the window down a little;
     2. type `Xia` into the first name (focus left in it);
     3. set the caret to 2 (`el.setSelectionRange(2, 2)`);
     4. record `scrollY`;
     5. force a redraw with `fixture.database.sql("update public.cases set revision=revision where id=$1", …)`, as the story does at `:657`, and wait for `#app` to be rebuilt (a marker property set on the old form is gone);
     6. check that `document.activeElement.id` is the same field, `selectionStart === 2`, the value is `Xia`, and `scrollY` is unchanged.
  4. **In place:**
     1. Continue once, and come back with Back, so step 1 is visited.
     2. Clear a required text question and set a marker property on its note node.
     3. Check that the note reads "Needs an answer" and the rail status is `is-needs`.
     4. Type an answer, and check the note is empty, the rail status changed, and the marker is still on the same node (not replaced).
  5. **Continue after typing (real mouse):** go to the step holding the email question (with the rail), type `not-an-email` into it, focus left in it, then **one** `locator.click()` on Continue.
     - Don't use `clickAction`, `waitForQuiet`, `pressUntil…` or any retry: they wait for stillness or re-press, and would hide a lost click.
     - The step advances ("STEP n+1 OF 9"), even though the email is invalid, and the saved answers hold the typed value (query `answers->>'<email id>'`).
  6. **Rail link after typing (real mouse):** type in a text field, then one `locator.click()` on the step-4 rail link. The page shows "STEP 4 OF 9".
  7. **Long answer count:** go to the step with the "Anything else" longtext and set a marker property on `#intake-v2-form`. Then `locator.fill` 4,600 characters and type one more with `press`. The count reads "4,601 of 5,000 characters", and the marker is still on the form, so no redraw happened.
  8. Go to step 1 with the rail. Use Fill fictional details, then walk steps 1–8 with Continue.
  9. **Show-if and spouse:** on step 3, choose married and check a spouse question appears. Use Fill fictional details again (a fill only fills blanks) to answer the spouse questions, then continue. It stays married for item 11.
  10. **Senior switch:** flip it, check a wording change on the current step, and flip it back.
  11. **Step 9, the text driver (real mouse):**
      1. check "Everything required is answered.";
      2. choose consent "yes" (`gcf_consent`), without pressing Continue;
      3. type the spouse signature into `gcf_sp_signature`, focus left in it;
      4. **one** `locator.click()` on `#field-confirmed`.

      The box is ticked, and `[data-q="gcf_sp_date"]` has appeared: the `change` fired on that press, and its queued redraw ran after the click.
  12. Submit with one click.
  13. **Submit saved first:** query the case and expect `answers->>'gcf_consent' = 'yes'` and `answers->>'gcf_sp_signature'` equal to the typed name.
  14. On the progress page, check a client number.
  15. In `finally`: set the workspace back to 1 and close the window.
  16. `shoot` step 2, step 6, a senior step, step 9 and the progress page.
  17. Call `assertConsoleQuiet` on the window.


  Keep the rest of the story unchanged. That case is never opened on a staff screen.
- [ ] **Step 2: Run all four suites** in the foreground (up to 10 minutes each), with output to `/tmp`:
  ```bash
  npm run db:migrate:test
  npm test
  npm run test:database
  npm run test:auth-browser
  npm run test:browser
  ```
  Expected: all pass.
  - "Synthetic Auth provisioning failed" is test-user setup: re-run once and report both runs.
  - Known browser flake: "a press reached nothing at all and had to be sent again".
- [ ] **Step 3: Screenshots.** Copy the phase's 720px shots to `docs/design/screens/implemented-intake-v2-step2.png`, `-step6.png`, `-senior.png`, `-step9.png`. Look at each first.
- [ ] **Step 4: Docs.**
  - Add a README row "Implemented (part 4b): the client's nine-step intake (reachable once 4c switches the default)" beside the other Implemented rows.
  - Update the `redesign-review.md` status line: 4a merged, and 4b in review.
- [ ] **Step 5: Commit** ("Walk the version-2 client intake in the browser; screenshots").
