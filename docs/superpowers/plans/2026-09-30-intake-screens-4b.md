# Part 4b: The client's nine-step intake, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the client's version-2 nine-step form and the shared renderer it uses. The form is complete and tested (unit plus a browser phase), but unreachable in normal use, because `default_intake_version` stays 1. PR 4c adds the staff side and switches the default.

**Architecture:**
- **Shared renderer.** A pure module, `src/intake-form.mjs`, turns catalogue questions into controls (`renderQuestion`), reads them back (`readField` per keystroke, `readForm` before a save, merged into the draft), and formats answers as read-only text (`formatAnswer`).
- **Screen.** `src/client-views.mjs` dispatches `intakeScreen` on `intakeVersion`: version 1 keeps today's form, and version 2 gets the new stepper.
- **Controller.** It keeps a version-aware draft: structured values and explicit `null` clears for version 2, with the contact fields merged in from `record.contact`.
- **Wiring.** `src/app.mjs` wires keystrokes, `change`-driven re-renders, the step rail, the senior switch and Fill fictional details.

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
- **Re-render timing.** Every `input` event copies that question's value into the draft through `readField` without re-rendering. Only `change` (text on blur, choice or checkbox on change) re-renders, restoring focus to the control. A realtime redraw never loses typed text.
- **Hooks that must not change:** everything the existing browser, auth-browser and client-views tests use for version 1 (`#intake-form`, `.page-intro .overline` "STEP n OF 4", `#field-confirmed`, `fill-fictional`, `save-exit`, `.conflict-panel`, `reconcile-mine`, `.id-pill strong` first = Application ID, etc.).
  - The version-2 form uses its own form id, `#intake-v2-form`, and its own overline, "STEP n OF 9".
- **Accessibility:**
  - a real `<label>` per control, and `<fieldset>`/`<legend>` for grouped controls;
  - IDs `field-<scope>-<id>` (household: `field-<scope>-hh-<n>-<sub>`);
  - "Needs an answer" tied by `aria-describedby`;
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
| `src/intake-form.mjs` (new) | `renderQuestion`, `readField`, `readForm`, `formatAnswer`, `mergeIntoDraft` |
| `src/sample-data.mjs` | `makeSampleAnswers({ version: 2 })` |
| `src/controller.mjs` | Version-aware `pickAnswers`; contact merge; `visitedSteps`; `goToStep`; the spouse clear |
| `src/window-state.mjs` | `visitedSteps` field |
| `src/client-views.mjs` | Version-2 `intakeScreen` (stepper, rail, step 9, read-only after submit); `conflictForm` version-2 branch; progress-page labels |
| `src/views.mjs` | The Senior version switch in `clientHeader` on the version-2 intake |
| `src/app.mjs` | Version-2 input/change wiring, step rail, senior switch, Fill fictional details |
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
readField(controlElement) → { id: string, value: any, member?: { index: number, sub: string } }
readForm(formElement, version) → { [id]: value }        // rendered questions only
mergeIntoDraft(draft, patch) → newDraft                  // field by field; never drops keys absent from patch
formatAnswer(question, value, { variant = "general", lang = "en" }) → string | null
```
- Every question's wrapper carries `data-q="<id>"`.
- Household controls carry `data-q="hh"`, `data-member="<n>"` and `data-sub="<sub>"`.
- "Add a person" is `data-action="add-member"` with `data-q="hh"`, and Remove is `data-action="remove-member"` with `data-member="<n>"`.
- A date's three boxes carry `data-date-part="month|day|year"`.

- [ ] **Step 1: Failing tests** (`tests/intake-form.test.mjs`). Render from the real catalogue (`findQuestion(2, …)`). Use a minimal DOM for the read tests: Node has no DOM, so give `readField` and `readForm` a tiny adapter. They accept any object with `querySelectorAll`, `closest`, `dataset`, `value`, `checked` and `type`. Build fake elements in the test, or parse the rendered HTML with a small helper in the test file. Say which one you chose.
  - **Rendering:**
    - For each type in the catalogue (pick one question per type: text, longtext, email, phone, zip, year, number with a range, date, choice with ≤6 and >6 options, yesno with and without `not_sure`, multi, who, group):
      - the HTML contains `data-q="<id>"`;
      - a `<label for="field-client-<id>">` or a `<legend>`;
      - the question's wording;
      - for choice, yesno, multi and who, every option's label.
    - `who` omits "My spouse" unless `answers.marital_status === "married"`.
    - A `choice` with more than 6 options renders a `<select>`.
    - `longtext` has `maxlength="5000"`.
    - `showMissing` on an unanswered required question adds an element with id `field-client-<id>-missing` and the control's `aria-describedby` references it. An answered question has neither.
    - The senior variant renders the senior wording for a question whose wordings differ (find one in the catalogue).
  - **Round trip:** render with a value, read back, and get the same value.
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
  - **The generator.** Build the version-2 generator from a fixed fictional person: a single adult with one household member, wages yes, everything else no or not sure, a phone and a best time. Walk the catalogue's visible required questions until `missingToSubmit` is empty, filling each with its first valid value. Keep version 1's code path exactly.
  - **The controller:**
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
  - rail links `data-action="go-step" data-step="<n>"` (0–8);
  - Back `back-step`, Continue as a submit of `#intake-v2-form`, and step 9's Submit as `caseButton(…, "SUBMIT")`;
  - the senior switch `data-action="toggle-senior"`, a button with `aria-pressed`;
  - Fill fictional details `data-action="fill-fictional"` (the same action as version 1);
  - `#field-confirmed` on step 9 (the same id as version 1, so the existing confirm wiring works).

- [ ] **Step 1: Failing tests** (`tests/client-views.test.mjs`, `tests/shell.test.mjs`), using a version-2 `savedCase` and draft built from `makeSampleAnswers({ version: 2 })`:
  - **The dispatch:** a version-1 draft still renders `#intake-form` and "STEP 1 OF 4"; the existing tests stay green.
  - **Step 1:** `#intake-v2-form`, "STEP 1 OF 9", and the step title from the catalogue.
  - **The rail:**
    - it has nine `go-step` links, and the current one has `aria-current="step"`;
    - a step with no missing required question shows a check;
    - a visited step with missing questions shows "Needs answers";
    - an unvisited one shows neither.
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
  - **Conflict:** `conflictForm` for a version-2 case with a differing `best_contact_time` array and a differing household lists those rows, with question wording and `formatAnswer` values.
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
    - "Needs an answer";
    - step 9's list.

    Use tokens only. Style from the step-2 and step-6 designs.
- [ ] **Step 4:** Run the focused files, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** ("The client's nine-step form").

---

### Task 5: Wiring

**Files:** `src/app.mjs` (and `tests/controller.test.mjs` if you add controller helpers).

- [ ] **Step 1: Wire the version-2 form** in `app.mjs`, beside the version-1 `ANSWER_FORMS` handling. Keep version 1's paths unchanged.
  - **`input`:** a control inside `#intake-v2-form` with `data-q` → `readField(control)`. For a top-level question, `controller.editAnswers({ [id]: value })`. For a household control, update that member (read the member's card, merge, then `editAnswers({ hh: members })`). Both run quietly, without re-rendering, as `editAnswerField` does.
  - **`change`:** the same read, then `render()`, and focus back to the control, found by its id.
  - **Actions:**
    - `go-step`: `await controller.goToStep(n)`, and focus `#main`.
    - `back-step` on a version-2 case: `goToStep(formStep - 1)`.
    - Submitting `#intake-v2-form` (Continue): `goToStep(formStep + 1)`.
    - `toggle-senior`: `editAnswers({ form_version: current === "senior" ? "general" : "senior" })`.
    - `add-member`: append `{}` (up to 10).
    - `remove-member`: remove that index.
    - `fill-fictional` on a version-2 case: `fillBlankAnswers(draft, makeSampleAnswers({ version: 2, seed }))`, then `editAnswers` and `render`.
  - **`save-exit`** saves as today, for both versions.
- [ ] **Step 2:** `npm test`. Expected: PASS. The wiring has no unit tests of its own; Task 6's browser phase is its check.
- [ ] **Step 3: Commit** ("Wire the version-2 intake").

---

### Task 6: A browser phase for the version-2 client, suites, screenshots and docs

**Files:** `tests/browser.mjs` (a new phase; the main story is unchanged), `docs/design/screens/`, `docs/design/README.md`, `docs/design/redesign-review.md`.

- [ ] **Step 1: Add one phase to the story,** after the main story's client phases.
  1. `f.sql("update public.workspaces set default_intake_version=2 where id=$1", [workspaceId])`.
  2. A second applicant (reuse the story's applicant B if it has a free client window; otherwise sign one in as the story already does) starts an application and lands on "STEP 1 OF 9".
  3. Use Fill fictional details, then walk steps 1–8 with Continue.
  4. On step 3, set marital status to married and check that a spouse question appears; set it back.
  5. Flip the senior switch and check a wording change on the current step; flip it back.
  6. On step 9, check "Everything required is answered.", tick `#field-confirmed`, and Submit.
  7. On the progress page, check a client number.
  8. In `finally`, set the workspace back to 1.
  9. `shoot` step 2, step 6, a senior step, step 9 and the progress page.

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
