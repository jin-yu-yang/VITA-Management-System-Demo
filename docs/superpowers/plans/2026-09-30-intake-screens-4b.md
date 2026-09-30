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
- **Saves merge on the server** (`answers || payload`, with `null` clearing). A version-2 save sends `withholdInvalid(draft, 2)`: every field's `sendable` value, `null` clears included, minus the invalid fields (spec §2.5). So a cleared field reaches the server, and an invalid one never does.
- **Redraw rules: spec §2.4 is the contract.** It applies while `#intake-v2-form` is on the page; version-1 screens keep today's `render()` behaviour exactly.
  1. **A press never loses its target.**
     - Between `pointerdown` and `pointerup`/`pointercancel`, a requested redraw is held. It runs from a `setTimeout(…, 0)` queued on `pointerup`/`pointercancel`, after the `click`.
     - The hold is also released on `contextmenu`, window `blur`, `visibilitychange`, and by a 2-second safety timer.
     - Every real render clears the held request first, so a flush can't draw twice.
     - **DOM updates caused by `change`** (the note, the rail mark, the chip) go through the same hold, with `afterPress(fn)`, because they can move the layout. State updates (`revealInvalid`) run at once.
  2. **`input` never redraws.** It writes the draft (`readField`) and sets only `className`/`textContent` on:
     - the question's note (`field-<scope>-<id>-note`);
     - the current step's rail status (`rail-step-<n>-status`);
     - a `longtext`'s count (`field-<scope>-<id>-count`).
  3. **A full redraw only when the visible questions change:**
     - a radio, checkbox or `<select>` `change`;
     - a `change` of a text field with `drivesVisibility(id)` (today only `gcf_sp_signature`), and only when `needsRedraw(renderedIds, step, answers)` is true.

     The comparison is **the ids rendered on the page against the ids the draft makes visible**, never draft-before against draft-after: rule 2 has already put the typed value in the draft. A `change`-caused redraw is queued with `setTimeout(…, 0)`.
  4. **A redraw that keeps the same place restores focus, caret and scroll.** "The same place" means the same screen, case and `formStep` before and after.
     - Focus and caret use the existing `describeFocus`/`restoreField`.
     - Scroll (`scrollX`/`scrollY`) is new, for the version-2 form only.
     - A redraw that changes the step or leaves the form scrolls to the top and focuses `#main` instead. It is recognised by comparing the place inside `render()`, because step changes also arrive as `show()` → `render(false)`. A redraw requested during IME composition waits for `compositionend`.
- **No browser validation blocks Continue.** The spec says the form warns but always moves on.
  - The `submit` handler handles `#intake-v2-form` before its `form.reportValidity()` call. `reportValidity` ignores `novalidate`, and `type="email"` alone would block Continue on a half-typed address.
  - The renderer emits no `required`, `min`, `max` or `pattern` attributes; ranges are shown as text.
- **Draft saves never fail on format (spec §2.5).**
  - Today's server refuses a whole version-2 save for one invalid value, and doesn't name it. So every version-2 save sends `withholdInvalid(draft, 2)`: trimmed, valid values only.
  - The draft holds exactly what is in the box and is never trimmed.
  - `dirty` means a save would change the server.
  - `applyCase` keeps local-only differences (an invalid value, or spaces only), all derived from the draft, with no stored list.
  - Only Submit enforces formats, and it's disabled while `invalidAnswers` is non-empty.
  - No migration; 001–013 untouched.
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
| `src/intake-form.mjs` (new) | `renderQuestion`, `valuesFromControls`, `describeControl`, `readField`, `readForm`, `formatAnswer`, `mergeIntoDraft`, `drivesVisibility`, `visibleIds`, `needsRedraw`, `noteState`, `countText`, `stepStatus`, `renderRichText`, `invalidAnswers`, `sendable`, `withholdInvalid`, `withheldFields`, `sendableDiffers`, `keepLocalOnly` |
| `src/intake-catalogue.mjs` | `checkValue`: an email with whitespace is invalid (the one intended JS/SQL difference) |
| `src/sample-data.mjs` | `makeSampleAnswers({ version: 2 })` |
| `src/controller.mjs` | Version-aware `pickAnswers`; contact merge; `visitedSteps`; `goToStep`; the spouse clear; `withholdInvalid` in `saveAnswers`; `dirty` = a save would change the server; `applyCase` keeps local-only differences; filtered `staleSave`; `revealed` ids; one retry on a field-naming refusal |
| `src/window-state.mjs` | `visitedSteps` field |
| `src/client-views.mjs` | Version-2 `intakeScreen` (stepper, rail, step 9, read-only after submit); `conflictForm` version-2 branch; progress-page labels |
| `src/views.mjs` | The Senior version switch in `clientHeader` on the version-2 intake |
| `src/app.mjs` | Version-2 input/change wiring with in-place updates; the redraw hold (pointer, composition), queued `change` redraws and scroll restore; step rail, senior switch, Fill fictional details |
| `src/styles.css` | Version-2 intake styles (fenced block) |
| Tests | `tests/intake-form.test.mjs` (new), `tests/intake-catalogue.test.mjs`, `tests/intake-build.test.mjs`, `tests/sample-data.test.mjs`, `tests/controller.test.mjs`, `tests/window-state.test.mjs`, `tests/client-views.test.mjs`, `tests/shell.test.mjs`, `tests/support/intake-value-cases.mjs` (new, the contract table), `tests/database-intake.mjs` (its SQL side), `tests/browser.mjs` (a new phase) |

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

**Files:**
- Create `src/intake-form.mjs`, `tests/intake-form.test.mjs` and `tests/support/intake-value-cases.mjs`.
- Modify `src/intake-catalogue.mjs` (email: no whitespace), `tests/intake-catalogue.test.mjs` and `tests/database-intake.mjs` (the contract table).

**The contract table** (`tests/support/intake-value-cases.mjs`, spec §6) is one exported array of `{ field, value, js, sql }`, where `js`/`sql` are `true` (valid) or `false`. It includes:
- `email`: `"mei lin@example.com"` (**js false, sql true**, the one intended difference, with a comment pointing at spec §2.5), `"a@"`, `"@"`, `"not-an-email"` (both false), `"mei.lin@example.com"` (both true);
- `tp_dob`: `"2025-02-30"` (both false), `"1961-04-12"` (both true);
- `addr_zip`: `" 12345 "` and `"1234"` (both false: `checkValue` sees the raw value; trimming is `sendable`'s job), `"12345"` (both true);
- one valid case per remaining type, each true on both sides:
  - text (`tp_first_name`, "Mei");
  - longtext (`additional_notes`);
  - signature (`gcf_tp_signature`);
  - phone (`tp_phone`, "(215) 555-0100");
  - year;
  - number without a range: `inc_wages_job_count`, `"3"` (both true);
  - number with a range: the catalogue's only ranged number is the household sub-field `months_lived`, so ranges are tested through `hh` rows, `[{ first_name: "Ming", months_lived: "12" }]` (both true) and `…"13"` (both false). These are the 4a list's existing rows;
  - choice (`service`);
  - yesno (`inc_wages`, "not_sure" only if listed, otherwise "yes");
  - multi;
  - who (`["me"]`);
  - group (`hh`, one member `{ first_name: "Ming" }`).

  Use real catalogue ids; the test fails on an unknown id.

**The two tests that read it:**
- **`tests/intake-catalogue.test.mjs`:** for each row, `(checkValue(findQuestion(2, field), value) === null) === row.js`.
- **The existing 4a mirror list** in `tests/database-intake.mjs` ("the server's value check and missing list mirror the browser's", the `cases` array of about 60 rows) moves into this table with `js`/`sql` set from today's results, so there is one list. Its `["email", "a b@c"]` row becomes the marked difference (`js: false, sql: true`).
- **`tests/intake-catalogue.test.mjs:127`** asserts `checkValue(e, "a b@c") === null` today. Change it to expect the "Enter a valid email address." message, and cite spec §2.5.
- Nothing else depends on it (searched: `src/case-actions.mjs` calls `checkValue` only for the contact best-time and note, and `tests/auth.test.mjs`'s `"a b@c.org"` is sign-in validation, not `checkValue`). No version-1 path calls `checkValue`.
- **`tests/database-intake.mjs`:** one query per row, `select vitally_private.check_intake_value(f, $2::jsonb) from vitally_private.intake_fields f where version=2 and group_id is null and field_id=$1`, expecting `row.sql`.
- If a row other than the marked one disagrees, fix the JS rule, or stop and report. Never change SQL.

**Interfaces (produces):**
```js
// Every function is pure. `scope` makes IDs unique ("client", "office").
renderQuestion(question, value, { variant = "general", lang = "en", scope, answers = {}, showMissing = false, revealed = new Set() }) → string
                                                         // answers is the draft, contact fields included; the note shows an error when
                                                         // revealed has the id (or "hh[<n>].<sub>" for a member's sub-field)
// A control descriptor is plain data, so the reading rules are testable in Node:
//   { q, member?, sub?, part?, type, value, checked }
//   q = question id; member/sub for household controls; part = "month"|"day"|"year".
valuesFromControls(descriptors, { changed } = {}) → { [id]: value }
                                                         // pure; every question present in the list. `changed` is { q, value } for the
                                                         // checkbox option just ticked, and drives the "No one" rule (below)
describeControl(element) → descriptor                    // DOM, reads data-* and value/checked
readField(element) → { [id]: value }                     // DOM: describes every control of the element's question (or, in the household, of the
                                                         // whole group) and calls valuesFromControls(descriptors, { changed }), where
                                                         // changed = element.type === "checkbox" && element.checked
                                                         //   ? { q: element.dataset.q, value: element.value } : undefined
readForm(formElement) → { [id]: value }                  // DOM: every [data-control] in the form; passes no `changed`
mergeIntoDraft(draft, patch) → newDraft                  // field by field; never drops keys absent from patch; never mutates
drivesVisibility(id) → boolean                           // true when a question/household showIf, a tip's showIf or fixedOptions.who.spouseShowIf names
                                                         // this field. Of text fields, only gcf_sp_signature (checked; spec §2.4 rule 3)
visibleIds(step, answers) → Set<string>                  // top-level question ids on step (0–8) that isVisible passes; the household group is "hh"
needsRedraw(renderedIds, step, answers) → boolean        // spec §2.4 rule 3: renderedIds (a Set of the step's unique data-q values, "hh" included)
                                                         // differs from visibleIds(step, answers)
noteState(question, value, { showMissing, showInvalid }) → { text: string, className: string }
                                                         // 1. showInvalid and checkValue(question, sendable(question, value)) → that message / "is-invalid"
                                                         // 2. showMissing, required and !isAnswered(sendable(question, value)) → "Needs an answer" / "is-missing"
                                                         // for a household sub-field, question is the sub-field (its own message, never the group's)
                                                         // 3. otherwise "" / ""
invalidAnswers(step, answers) → string[]                 // ids of visible questions on step (0–8) whose sendable value fails checkValue;
                                                         // a household member's sub-field is "hh[<n>].<sub>", never bare "hh";
                                                         // step = null means every step. Separate from missingToSubmit, which counts
                                                         // only unanswered required questions (checked: it never calls checkValue)
sendable(question, value) → value                        // text-like values (and household sub-fields) trimmed; everything else as is.
                                                         // Every check below applies checkValue / isAnswered to sendable(value)
withholdInvalid(draft, version) → answers                // version 2: every field's sendable value, without every top-level field whose
                                                         // sendable value fails checkValue (hh withheld whole if any member fails).
                                                         // null clears and empty values stay. version 1: returns draft unchanged
withheldFields(draft, version) → string[]                // the ids withholdInvalid leaves out ([] for version 1)
sendableDiffers(draft, server, version) → boolean        // some field of withholdInvalid(draft) differs from server's value (deep;
                                                         // unanswered equals unanswered). server = savedCase.answers + contact fields
keepLocalOnly(previousDraft, server, version) → draft    // server's answers, except each field of previousDraft that is withheld or whose
                                                         // sendable value equals server's (only spaces differ) keeps previousDraft's value
countText(value) → string                                // "4,612 of 5,000 characters" when length > 4500, else ""
stepStatus(step, answers, visited, revealed) → { key: "done"|"needs"|"none", text: "Done"|"Needs answers"|"" }
                                                         // answers is the draft with contact fields; missing = missingToSubmit(2, answers)
                                                         // (no contact argument: spec §2.5), limited to the step; invalid = invalidAnswers.
                                                         // needs: visited with any missing or invalid, or any revealed invalid on the step
                                                         // done: no visible required question unanswered; needs: visited with some; none otherwise
renderRichText(text) → string                            // intros and tips: escape, then **bold**, "- " lists, blank-line paragraphs
formatAnswer(question, value, { variant = "general", lang = "en" }) → string | null
```
- **Every question renders its note container,** `<p id="field-<scope>-<id>-note" class="q-note{ is-missing| is-invalid}" aria-live="polite">`, always, even when empty, with its text and class from `noteState`. Household sub-questions use `field-<scope>-hh-<n>-<sub>-note`.
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
    - For each type in the catalogue (pick one question per type: text, signature, longtext, email, phone, zip, year, number (`inc_wages_job_count`), date, choice with ≤6 and >6 options, yesno with and without `not_sure`, multi, who, group):
      - the HTML contains `data-q="<id>"`;
      - a `<label for="field-client-<id>">` or a `<legend>`;
      - the question's wording;
      - for choice, yesno, multi and who, every option's label.
    - `who` omits "My spouse" unless `answers.marital_status === "married"`.
    - **A ranged number inside a household card:** rendering `hh` with one member renders `months_lived` as `field-client-hh-0-months_lived` (`inputmode="numeric"`), with its range shown as text from the catalogue's `min`/`max` ("0 to 12") and no `min`/`max` attributes.
    - A `choice` with more than 6 options renders a `<select>`.
    - `longtext` has `maxlength="5000"` and always a `field-client-<id>-count` element. `countText("a".repeat(4500))` is `""`, and `countText("a".repeat(4612))` is "4,612 of 5,000 characters".
    - No rendered control has `required`, `min`, `max` or `pattern`.
    - Every radio and checkbox has a unique id.
    - `renderRichText("**W-2** & <b>\n- one\n- two")` gives `<strong>W-2</strong> &amp; &lt;b&gt;` and a two-item `<ul>`.
    - `drivesVisibility("marital_status")` and `drivesVisibility("gcf_sp_signature")` are true. `drivesVisibility("gcf_tp_signature")` and `drivesVisibility("tp_first_name")` are false.
    - **`needsRedraw`** (step 9 is index 8):
      - with answers `{ gcf_consent: "yes", marital_status: "married", gcf_sp_signature: "Mei Lin" }` and rendered ids that lack `gcf_sp_date`, it is **true**;
      - with the same answers and rendered ids equal to `visibleIds(8, answers)`, it is **false**;
      - with `gcf_sp_signature: ""` and rendered ids lacking `gcf_sp_date`, it is **false**;
      - **household ids match:** on step 5 (index 4), with `has_household_members: "yes"`, `visibleIds(4, answers)` contains `"hh"`, and `needsRedraw(new Set(visibleIds(4, answers)), 4, answers)` is **false**.
    - **`drivesVisibility`** is also true for `refund_method` (a tip condition). A unit test walks the whole catalogue: the only text-like field (`text`, `longtext`, `signature`, `email`, `phone`, `zip`, `year`, `number`, `date`) for which it returns true is `gcf_sp_signature`.
    - **Every question** (answered or not, `showMissing` or not) has `id="field-client-<id>-note"` with `aria-live="polite"`, and the control's `aria-describedby` contains it.
    - **`noteState`:**
      - an unanswered required question with `showMissing` gives "Needs an answer"/`is-missing`;
      - `email: "a@"` with `showInvalid` gives "Enter a valid email address."/`is-invalid`, which outranks missing;
      - with `showInvalid` false, it gives no error;
      - answered-valid, or optional-empty, gives empty text and no class.
      - The rendered note carries the same text and class.
    - **`invalidAnswers`:** on step 2 (index 1), `{ email: "not-an-email", tp_dob: "2025-02-30", tp_first_name: "Mei" }` → `["tp_dob", "email"]` in catalogue order. A hidden question's invalid value isn't listed. `step = null` covers all steps. `" 12345 "` for `addr_zip` is not listed (checked through `sendable`).
    - **Household ids:** with `has_household_members: "yes"` and `hh: [{ first_name: "Ming" }, { first_name: "Bo", dob: "2025-02-30" }]`, `invalidAnswers(4, …)` is `["hh[1].dob"]`. `noteState` for the `dob` sub-field with that value and `showInvalid` gives "Enter a real date as YYYY-MM-DD.", the sub-field's own message, not "dob: …". `renderQuestion(hh, …, { revealed: new Set(["hh[1].dob"]) })` puts that message in `field-client-hh-1-dob-note` and leaves member 0's notes empty.
    - **Missing from the draft alone:** `stepStatus(1, { …step 2 answered, tp_phone: "2155550100" }, [1], new Set())` is `done` even though no `contact` is passed; the same draft with `tp_phone: null` is `needs`.
    - **`withholdInvalid`** removes only invalid fields:
      - `{ email: "a@", tp_first_name: "Mei", tp_middle_name: null, addr_zip: "12345" }` → `{ tp_first_name: "Mei", tp_middle_name: null, addr_zip: "12345" }`;
      - a household with one member whose `dob` is `"2025-02-30"` → no `hh` key;
      - the input object is not mutated;
      - version 1 returns its input unchanged.
    - **`stepStatus`:**
      - a step whose visible required questions are all answered and valid is `done`;
      - a visited step with one missing is `needs`;
      - a visited step with all answered but one invalid is `needs`;
      - an unvisited step with one missing is `none`.
    - **Email with an inner space:** `checkValue(email, "mei lin@example.com")` is "Enter a valid email address." (the one intended JS/SQL difference, spec §2.5).
    - The senior variant renders the senior wording for a question whose wordings differ (find one in the catalogue).
  - **`multi`/`who` "No one"** (`who`'s value is `none`). The rule lives in `valuesFromControls`, and `readField` supplies `changed` from the element it was called with (see the interface):
    - `none` and `me` both checked, `changed: { q, value: "none" }` → `["none"]`;
    - the same, but `changed: { q, value: "me" }` → `["me"]` (ticking another option unticks "No one");
    - no `changed` (as from `readForm`) → returned as checked, unchanged.
  - **Round trip:** render with a value, build descriptors from the rendered HTML's option values and checked state (a small regex helper in the test file), read back, and get the same value.
    - dates: `"1961-04-12"`;
    - `who`: `["me", "spouse"]` when married;
    - `multi`;
    - `yesno`: `"not_sure"`;
    - household: two members, where the second has only `first_name`, so empty sub-fields are omitted;
    - an empty text reads `null`;
    - **no trimming on read:** a text descriptor `"hello "` reads `"hello "`, and `" 12345 "` reads `" 12345 "`. The draft holds the box's value exactly, so a redraw can't eat a space the person just typed;
    - a text of only spaces reads `null`;
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
  - **`src/intake-catalogue.mjs`:** the email case also returns "Enter a valid email address." when `/\s/.test(value)`. Update the comment above `checkValue`, which today says `"a b@c"` passes: the browser check now rejects spaces, and the server check doesn't (spec §2.5).
  - `renderQuestion` takes `revealed` (a Set of ids) and computes the note with `noteState(question, value, { showMissing, showInvalid: showMissing || revealed.has(question.id) })`.
  - `noteState`, `invalidAnswers` and `stepStatus` apply `checkValue`/`isAnswered` to `sendable(value)`.
  - `stepStatus(step, answers, visited, revealed)` is `needs` also for an unvisited step holding a revealed invalid answer.
- [ ] **Step 4:** Run `node --test tests/intake-form.test.mjs tests/intake-catalogue.test.mjs`, then `npm test`, then `npm run test:database` (for the contract table's SQL side). Expected: PASS.
- [ ] **Step 5: Commit** ("Render, read and format version-2 intake questions").

---

### Task 3: Draft, generator, window state and the controller

**Files:** `src/sample-data.mjs`, `src/controller.mjs`, `src/window-state.mjs`, and their tests.

**Interfaces:**
- **Consumes:** `CONTACT_FIELDS`, `findQuestion`, `stepsFor`, `checkValue`, `isAnswered`, `missingToSubmit` (reader); `mergeIntoDraft`, `sendable`, `withholdInvalid`, `withheldFields`, `sendableDiffers`, `keepLocalOnly`, `invalidAnswers` (Task 2).
- **Produces:**
  - `makeSampleAnswers({ seed, scenario, version: 2, married = false })` → a version-2 draft (the answers plus the four contact fields). Every value passes `checkValue`, and `missingToSubmit(2, answers)` is `[]` (the contact fields are in `answers`).
    - `married: false` (the default): a never-married person.
    - `married: true`: `marital_status: "married"` plus every spouse answer the catalogue requires when married, including `sp_phone`.
  - Controller:
    - `pickAnswers(source, version)`: version 1 behaves as today; version 2 keeps catalogue top-level IDs and structured values, including `null`.
    - `editAnswers(patch)` merges through `mergeIntoDraft` for a version-2 case, and applies the spouse clear.
    - `goToStep(n)`: saves if dirty, records the current step as visited, then sets `formStep`.
    - **`saveAnswers()` for a version-2 case sends `withholdInvalid(draftAnswers, 2)`.** The draft itself is never trimmed or filtered.
    - **`dirty` for a version-2 case** is recomputed by `editAnswers` after every edit: `state.dirty = sendableDiffers(draftAnswers, serverAnswers(), 2)`.
      - `serverAnswers()` is `savedCase.answers` with the contact fields merged in through `CONTACT_FIELDS`.
      - `editBaseRevision` is pinned only when `dirty` turns true.
      - `saveState` becomes `"unsaved"` only when `dirty`.
      - `forgetPendingSave()` runs as today.
    - **`applyCase`** (when not dirty, or after a save) builds the draft with `keepLocalOnly(previousDraft, serverAnswers(next), 2)` instead of `pickAnswers(next.answers)` alone. An invalid value, or one differing only in spaces, keeps the client's text; every other field takes the server's.
    - **`staleSave`** compares the envelope's answers with `withholdInvalid(draftAnswers, version)`. For version 1 that is the draft itself, so nothing changes.
    - **A refused save that names a field** (`error.field`, which today's server never sets) is retried once, with that field also left out of that one request. A second refusal, or one with no field, takes today's failure path. A flag on the call prevents a loop; nothing is stored.
    - **`saveStatus(state)`** (client-views) gains the chip state "N answers need checking" (`save-chip checking`, `role="status"`): not saving, not failed, not dirty, and N > 0.
      - N = the shown errors: `invalidAnswers(null, draftAnswers).filter((id) => state.revealed.includes(id)).length`.
      - It uses the same ids the notes show: visible questions only, and revealed only. So it never counts a value being typed, or a hidden question's value.
      - "1 answer needs checking" in the singular. It comes after Unsaved and before Saved, and is computed from the draft every time.
    - **`editBaseRevision`** is set when `dirty` turns true and set back to `null` whenever `editAnswers` leaves `dirty` false (spec §2.5).
    - **`state.revealed`** (ids whose error has been shown), for the selected case:
      - `revealInvalid(id)` adds an id (a top-level id, or `hh[<n>].<sub>`);
      - `goToStep(n)` adds every id in `invalidAnswers(formStep, draftAnswers)` before it records the step as visited;
      - `removeMember(index)` (used by the `remove-member` action) drops `hh[index].*` ids and renumbers higher ones;
      - `editAnswers` drops an id whose new `sendable` value is valid or empty.
      - It persists in the window state with `visitedSteps` and is cleared by `clearSelection`.
    - `state.visitedSteps` (an array of step indexes) for the selected case.
  - Window state: `visitedSteps: { caseId: string, steps: number[], revealed: string[] }`.

- [ ] **Step 1: Failing tests.**
  - **`tests/sample-data.test.mjs`:**
    - version 2 output, with `married` false and true, passes `checkValue` for every key, and `missingToSubmit(2, …)` is `[]`;
    - the fill a client gets after choosing married: `fillBlankAnswers(unmarried output with marital_status set to "married" and the spouse keys removed, married output, 2)` has `missingToSubmit(2, …)` equal to `[]`;
    - it is deterministic for a seed;
    - version 1 output is unchanged (deep-equal to today's for seed 0).
  - **`tests/controller.test.mjs`** (use its existing fake store and helpers):
    - opening a version-2 case whose `contact` is `null` gives a draft without contact keys;
    - with `contact: { phone: "2155550199", bestContactTime: ["weekend"] }`, the draft has `tp_phone` and `best_contact_time`;
    - `editAnswers({ tp_middle_name: null })` keeps `null`, and the save payload carries `tp_middle_name: null` and the contact keys;
    - `editAnswers({ marital_status: "never_married" })` drops `"spouse"` from every `who` answer in the draft, in the same edit;
    - `goToStep(3)` records the previous step in `visitedSteps` and saves when dirty;
    - reopening another case resets `visitedSteps`;
    - **withholding:** with a draft `{ tp_first_name: "Mei", email: "a@", addr_zip: " 19107 " }`, `saveAnswers` sends `{ tp_first_name: "Mei", addr_zip: "19107" }`, and the draft still holds `" 19107 "` and `"a@"`.
    - **`dirty`:**
      - from a saved state, `editAnswers({ email: "a@" })` (valid → invalid) leaves `dirty` false, and `saveStatus` reads "1 answer needs checking" at once;
      - `editAnswers({ email: "a@b" })` then `editAnswers({ email: "a@" })` on an already-invalid email stays not dirty;
      - `editAnswers({ tp_first_name: "Mei " })` over a saved `"Mei"` stays not dirty;
      - `editAnswers({ tp_first_name: "Ming" })` sets it, and pins `editBaseRevision`;
      - **the pin is cleared on undo:** at revision 5, `editAnswers({ tp_first_name: "Ming" })` pins 5; `editAnswers({ tp_first_name: "Mei" })` (back to the saved value) makes `dirty` false and `editBaseRevision` null. The fake store then delivers revision 6 through `applyCase`, and `editAnswers({ tp_first_name: "Ming" })` pins 6. The save's `expectedRevision` is 6, and no conflict is raised.
    - **local-only differences survive refreshes:** after a save (the fake store returns answers without `email` and with `addr_zip: "19107"`), the draft keeps `email: "a@"` and `addr_zip: " 19107 "`. A realtime `applyCase` with a newer revision whose `tp_first_name` changed takes the server's name and still keeps both.
    - **`staleSave` ignores withheld fields and spaces:** with a retained envelope from a failed save (use the existing unknown-outcome helper), changing only the invalid `email`, or adding a trailing space, leaves `retryLast` sending the envelope; changing `tp_first_name` drops it.
    - **revealed:**
      - `revealInvalid("email")` then `editAnswers({ email: "mei@example.com" })` removes it;
      - `editAnswers({ email: "a@" })` alone (typing) adds nothing, and the chip still reads "Saved";
      - `goToStep` from step 2 with an invalid email adds `email`, and the chip reads "1 answer needs checking";
      - hiding the question (its `showIf` stops holding) drops it from the chip count while the id stays revealed;
      - removing member 0 turns `hh[1].dob` into `hh[0].dob`;
      - a new case starts empty;
      - it round-trips through the window state.
    - **field-naming refusal:** the fake store's first `act` rejects with `{ code: "VALIDATION", field: "tp_dob" }` and the second succeeds. The second call has no `tp_dob`, `act` is called exactly twice, and a store that refuses both times is called twice, not more. A refusal with no `field` is called once.
    - a version-1 case: the payload is the whole draft, as today, `dirty` follows today's rule (any edit), and `state.revealed` stays empty;
    - a version-1 case: `pickAnswers` and `editAnswers` behave exactly as today (reuse existing assertions).
  - **`tests/window-state.test.mjs`:** `visitedSteps` (with `revealed`) round-trips; a malformed value (bad `caseId`, non-integer steps, or non-string `revealed` entries) is dropped.
- [ ] **Step 2:** Run the three files to confirm they fail.
- [ ] **Step 3: Implement.**
  - **The generator.** Write the version-2 answers as one explicit object literal for a fictional person:
    - a never-married adult with one household member (a child);
    - wages yes, and every other income and event no;
    - a phone `2155550100`–`2155550199` chosen by seed, and a best time `["weekday_evening"]` (use the catalogue's real option values);
    - the name and birth date varied by seed from small fictional lists;
    - `form_version` left out.
    - With `married: true`, the same person plus `marital_status: "married"` and a fictional spouse: every spouse question the catalogue shows and requires when married, and `sp_phone`. Filing status and the other answers stay valid for a married person.

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
  - **Window state:** add `visitedSteps` to `FIELDS` with a check: a `caseId` string, an array of integers 0–8, and `revealed`, an array of strings (a missing `revealed` reads as `[]`).
- [ ] **Step 4:** Run the files, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** ("Version-aware draft, version-2 sample answers, visited steps and withheld invalid values").

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
    - it also lists `invalidAnswers(null, …)` under their steps, each with "Needs a change" and a `go-step` link, revealed or not. With `email: "not-an-email"`, step 2's group shows the email's wording and "Needs a change". A household sub-field reads "Person 2: Date of birth" (its wording), with "Needs a change";
    - the missing list is `missingToSubmit(2, draft)`, with no `contact` argument: an unsaved typed `tp_phone` isn't listed, even when `record.contact` has no phone;
    - with none missing and none invalid it reads "Everything required is answered.";
    - Submit is disabled unless both lists are empty and `openPanels` includes `"confirmed"`. With only an invalid email, it is disabled.
  - **The rail with an invalid answer:** a visited step whose only problem is an invalid answer has `is-needs`; `stepStatus` supplies it.
  - **The save chip:** `saveStatus` with a version-2 draft holding `email: "a@"` and `revealed: ["email"]`, not dirty, reads "1 answer needs checking"; with `tp_dob` invalid and revealed too, "2 answers need checking"; with `email` invalid but not revealed, "Saved"; dirty still reads "Unsaved changes".
  - **A revealed error on an unvisited step:** rendering step 2, unvisited, with `revealed` containing `email` and `email: "a@"`, shows the error in the note (`is-invalid`), and the rail's step-2 status is `is-needs`.
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
    - the note (`.q-note`, `.q-note.is-missing`, `.q-note.is-invalid`) and count (`.q-count`) containers. `is-invalid` uses the existing error-coloured ink `--vt-age-late-ink` (#b42318, which passes AA on white), with a left rule in `--vt-phase-attention`. `is-missing` uses the quieter `--vt-age-soon-ink`. Add no new token;
    - the `.save-chip.checking` state, in the same token family as `is-invalid`;
    - both containers take no height when `:empty`: no margin or padding. Never use `display: none`, because an `aria-live` region that is hidden when its text arrives isn't announced reliably.
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
    let holdTimer = null;
    // At the top of render(focus):
    //   if (v2OnPage() && (pointerHeld || composing)) { heldRender = heldRender || focus; return; }
    //   heldRender = null;   // a real render: any held request is now satisfied (spec §2.4 rule 1)
    root.addEventListener("pointerdown", () => {
      pointerHeld = true;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(release, 2000);            // safety: a pointerup that never arrives
    }, true);
    function release() {
      if (!pointerHeld) return;
      pointerHeld = false;
      clearTimeout(holdTimer);
      setTimeout(flushHeld, 0);                         // after the click
    }
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("contextmenu", release, true);   // right-click, Ctrl+click
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    root.addEventListener("compositionstart", () => { composing = true; });
    root.addEventListener("compositionend", () => { composing = false; setTimeout(flushHeld, 0); });
    let heldUpdates = [];                                // in-place DOM updates waiting for the press to end (afterPress)
    function flushHeld() {
      if (pointerHeld || composing) return;
      if (heldRender !== null) render(heldRender);        // render() sets heldRender = null
      for (const fn of heldUpdates.splice(0)) fn();       // each looks its node up by id; a gone node is a no-op
    }
    function afterPress(fn) { if (pointerHeld || composing) heldUpdates.push(fn); else setTimeout(fn, 0); }
    ```
    - `heldRender` starts as `null` and holds `false`/`true` while a render is waiting.
    - `render()` itself sets it to `null` whenever it goes on to replace the page. `flushHeld` therefore draws only if nothing else drew in between, and a second flush finds `null` and does nothing.
    - The `quiet` early return stays first, so a quiet edit neither draws nor clears a held request.
    - **Scroll and place:** keep `let lastPlace = null` in the wiring layer. In `render()`, compute `place = \`${state.screen}|${state.selectedCaseId}|${state.formStep}\`` and read `wasV2 = v2OnPage()` before replacing the page. After replacing it, when the version-2 form was on the page before or is on it now, and `focus` is false:
      - **`place === lastPlace`:** record `scrollX`/`scrollY` before `root.innerHTML = …`, then `restoreField(keyboard)` and `window.scrollTo(x, y)` after it.
      - **otherwise (the step changed, or the form was entered or left):** `root.querySelector("#main")?.focus({ preventScroll: true })` and `window.scrollTo(0, 0)`; no `restoreField`.
      - Then set `lastPlace = place`, on every render.
      - Version-1 screens (neither before nor after on the version-2 form) keep today's branch exactly.
      - Test it in Task 6 (item 4 below): after scrolling to the bottom of step 2 and one click on Continue, `scrollY` is 0 and `document.activeElement.id` is `main`.
    - Version-1 screens never reach these branches.
  - **Where the new branches sit.** Both go inside the existing root listeners, not in new listeners, so the order is fixed.
    - **`change`** (`src/app.mjs:788`): the version-2 branch goes **after** the `select[data-board-filter]` branch and the `field-confirmed` branch (`:795`, which toggles the `confirmed` panel and returns), and **before** the version-1 `ANSWER_FORMS` check. It handles only `#intake-v2-form [data-control][data-q]`, and `#field-confirmed` has no `data-q`, so step 9's checkbox always reaches its existing branch.
    - **`input`** (`:770`): the version-2 branch goes first, since it matches only `[data-q]` inside `#intake-v2-form`, and leaves the rest of the chain untouched.
    - A unit-free check in Task 6: item 11's single click on `#field-confirmed` must tick the box and open the Submit gate.
  - **`input`:** a `[data-control]` inside `#intake-v2-form` that has `data-q` → `controller.editAnswers(readField(control))`.
    - Always pass the event's own target. `readField` reads the ticked option from that element and hands it to `valuesFromControls` as `changed`, which is what makes "No one" clear the others and another option clear "No one".
    - The same `readField(event.target)` call serves `change`.
    - It runs quietly, as `editAnswerField` does, followed by `refreshSaveChip()`.
    - Then the **in-place updates**, setting only `className` and `textContent`:
      - the question's note from `noteState(question, value, { showMissing: stepVisited, showInvalid: noteShowsInvalid })`:
        - `noteShowsInvalid` is true only when the note currently has `is-invalid`;
        - so typing never adds an error, but it clears one as soon as the value is valid or empty (the controller drops the id from `revealed` at the same moment);
      - `#rail-step-<formStep>-status` from `stepStatus(formStep, draft, visited, revealed)`;
      - for a `longtext`, its count from `countText(value)`.
    - `readField` on a household control returns the whole `hh` array. The draft is replaced, never mutated.
    - Checkboxes are included, unlike version 1.
  - **`change`:** the same read.
    - **At once (state only, nothing on screen moves):** if `checkValue(question, sendable(question, value))` fails, call `controller.revealInvalid(id)` quietly, so the error survives any later redraw (spec §2.5), even on an unvisited step.
    - **Then, through the hold,** `afterPress(() => { … })` does the in-place error update:
      - the note from `noteState(question, value, { showMissing: stepVisited, showInvalid: true })`;
      - `#rail-step-<formStep>-status` from `stepStatus`, which counts invalid answers;
      - `refreshSaveChip()`.

      Each step looks its node up by id at run time and does nothing if it's gone (the press replaced the page, and the new render already shows the revealed error).
    - **`afterPress(fn)`**, in the wiring next to `flushHeld`:
      - while `pointerHeld` or `composing`, it pushes `fn` onto `heldUpdates`;
      - otherwise it runs `setTimeout(fn, 0)`;
      - `flushHeld` runs and empties `heldUpdates` after its render check;
      - `release()` already queues `flushHeld` after the click.

      This is spec §2.4 rule 1: filling an empty note makes it taller and moves Continue during the press that fired the `change`. It never redraws.
    - **Verified by the fault check:** add to Task 6 Step 2 a second temporary change, running the in-place error update at once instead of through `afterPress`. Then item 8a.1 (a single click on Continue after `not-an-email`) must fail, because the note fills during the press and moves Continue. Restore it and confirm the test passes. Put both results in the commit message.
    - Then a redraw is queued (`setTimeout(() => render(), 0)`, so it passes through the hold) only for:
    - a radio, checkbox or select;
    - a text-like control with `drivesVisibility(id)` and `needsRedraw(renderedIds, formStep, draft)`, where `renderedIds = new Set([...form.querySelectorAll("[data-q]")].map((el) => el.dataset.q))`. That is the step's unique `data-q` values, with `"hh"` included once, the same kind of id `visibleIds` returns.

    Focus comes back through `render()`'s own `describeFocus`/`restoreField`, taken at flush time, so a Tab's new target is restored, not the field that was left.
  - **`submit` of `#intake-v2-form` (Continue):** handled before `form.reportValidity()`. It runs `editAnswers(readForm(form))`, then `goToStep(formStep + 1)`.
  - **Actions:**
    - `go-step`: `editAnswers(readForm(form))`, `await controller.goToStep(n)`, then focus `#main`.
    - `back-step` on a version-2 case: the same, to `formStep - 1`. Version 1's `back-step` is unchanged: it doesn't save.
    - `toggle-senior`: `editAnswers({ form_version: current === "senior" ? "general" : "senior" })`.
    - `add-member`: append `{}` (up to 10).
    - `remove-member`: `controller.removeMember(index)`, which removes that member and renumbers the revealed `hh[…]` ids.
    - **`fill-fictional` and `confirm-regenerate`:** `fictional()` branches on `savedCase.intakeVersion`. For version 2, first `editAnswers(readForm(form))`. Then `makeSampleAnswers({ version: 2, seed, married: draft.marital_status === "married" })` (spec §3.3), with `fillBlankAnswers(draft, generated, 2)` for a fill, or the generated set plus `null` for every other catalogue key already in the draft, for a regenerate.
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
  2. In a fresh client window, sign in as `applicantB` with `loginTestUser`, as the story does at `tests/browser.mjs:1137`.
     - Applicant B already has cases from earlier phases, among them a version-1 draft started at `:1217`. So start a new one the way the story does: `const reference = await startApplication(page)`, which clicks `start-application` and waits for the reference card.
     - Look the case up with `caseByReference(fixture, reference)`. Every database query below uses that case's id, never "B's only case".
     - Check its `intake_version` is 2.
     - Then `clickAction(page, "continue-intake")` and wait for "STEP 1 OF 9".
     - Step 1 is catalogue section 0 only (`form_version`, `service`, `language`, `language_other`).
     - Choose a service and a language, then Continue to "STEP 2 OF 9".
     - Step 2 (sections 1–2) holds `tp_first_name`, `email` and the other required text questions every item below uses.
  3. **On step 2, focus survives a realtime redraw:**
     1. scroll the window down a little;
     2. type `Xia` into `tp_first_name` (focus left in it);
     3. set the caret to 2 (`el.setSelectionRange(2, 2)`);
     4. record `scrollY`;
     5. force a redraw with `fixture.database.sql("update public.cases set revision=revision where id=$1", …)`, as the story does at `:657`, and wait for `#app` to be rebuilt (a marker property set on the old form is gone);
     6. check that `document.activeElement.id` is the same field, `selectionStart === 2`, the value is `Xia`, and `scrollY` is unchanged.
     7. **A trailing space survives a redraw that rebuilds the draft (spec §2.5).** This has to run with the draft **not** dirty. A dirty draft is never rebuilt by `applyCase` when the revision is unchanged, and `set revision=revision` leaves it unchanged, so a dirty draft would pass whether or not `keepLocalOnly` works.
        1. Click Continue, then Back. This saves `Xia`, so the draft matches the server. Check `answers->>'tp_first_name'` is `Xia`.
        2. Click at the end of `tp_first_name` and type ` ` (a space), so it holds `Xia `.
        3. Check the chip does not read "Unsaved changes": a trailing space doesn't make the draft dirty. This proves the next redraw goes through `keepLocalOnly`.
        4. Force another redraw the same way, and wait for `#app` to be rebuilt.
        5. Check the value is still `Xia `, with the caret at 4.
        6. Type `o`, and check the box holds `Xia o`, not `Xiao`.
  4. **Continue after typing, and the new step opens at the top (real mouse):** still on step 2, type `mei.lin@example.com` into `email`, focus left in it.
     - The browser's own check being bypassed is proven by item 8a, with an invalid email.
     - Scroll to the bottom of the page, then **one** `locator.click()` on Continue.
     - Don't use `clickAction`, `waitForQuiet`, `pressUntil…` or any retry: they wait for stillness or re-press, and would hide a lost click.
     - Check that:
       - the page shows "STEP 3 OF 9";
       - `answers->>'email'` is `mei.lin@example.com` (query the case);
       - `scrollY` is 0;
       - `document.activeElement.id` is `main`.
  5. **Rail link after typing (real mouse):** click Back once to return to step 2. Type into `tp_job_title`, then one `locator.click()` on the step-4 rail link. The page shows "STEP 4 OF 9".
  6. Go to step 1 with the rail. Use Fill fictional details (it fills every blank on every step), then walk steps 1–8 with Continue.
  7. **In place, after the fill, on step 2** (reached with the rail; visited already, and every required question now answered, so its mark is `is-done`):
     1. Clear `tp_first_name`.
     2. Check that its note reads "Needs an answer" and `#rail-step-1-status` has `is-needs`: this step now has exactly one missing question.
     3. Set a marker property on that note node.
     4. Type `Mei`.
     5. Check that the note is empty, `#rail-step-1-status` has `is-done` and "Done", and the marker is still on the same node (not replaced).
  8. **Long answer count:** go to step 8 (`additional_notes`, the only longtext) and set a marker property on `#intake-v2-form`. Then `locator.fill` 4,600 characters and type one more with `press`. The count reads "4,601 of 5,000 characters", and the marker is still on the form, so no redraw happened. Clear the box again.
  8a. **Invalid values (spec §2.5; real mouse, one `locator.click()`, no retry helpers).** Every required answer is filled by now (item 6).
     1. Go to step 2 with the rail. `locator.fill("Baker")` on `tp_job_title`, then `locator.fill("not-an-email")` on `email` (it already holds `mei.lin@example.com` from item 4, so `fill` replaces it), focus left in it. Then **one press near the top edge of Continue**, with a real mouse:
        ```js
        const box = await page.locator('#intake-v2-form button[type="submit"]').boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + 4);
        await page.mouse.down(); await page.mouse.up();
        ```
        - Not `locator.click()`: that presses the centre of a 44px button, so a layout shift under 22px (a one-line note is about 20px) would still land inside it and hide the fault.
        - 4px from the top edge, any downward shift of 4px or more moves the button out from under the release.
        - The page then shows "STEP 3 OF 9". The browser's `type="email"` check didn't block it, and neither did the server.
     2. `#rail-step-1-status` has `is-needs` and "Needs answers", and the chip reads "1 answer needs checking".
     3. Query the case: `answers->>'tp_job_title'` is `Baker` (the rest of step 2 was saved), and `answers->>'email'` is still `mei.lin@example.com` from item 4, not `not-an-email`.
     4. Go to step 9 with the rail. "Still to answer" lists the email under step 2 with "Needs a change" and a link, and Submit is disabled.
     5. Follow that link to step 2. The email's note reads "Enter a valid email address." with `is-invalid` (a visited step shows it), and the box still holds `not-an-email`.
     6. Set a marker property on the note node and on `#intake-v2-form`. `locator.fill("mei.lin@example.org")` on the email box (it replaces the text and fires `input`, not `change`). The note is empty with no class, both markers are still there (no redraw), and `#rail-step-1-status` has `is-done`.
     7. One click on Continue. Query the case: `answers->>'email'` is `mei.lin@example.org`. The chip no longer says "need checking".
  9. **Show-if and spouse:** go to step 3 with the rail, choose married and check a spouse question appears. Use Fill fictional details again. Because the draft now says married, the generator makes a married person (`married: true`), so the blank spouse questions are filled. Check a spouse question now has a value, then go to step 9 with the rail. It stays married for item 11.
  10. **Senior switch:** flip it, check a wording change on the current step, and flip it back.
  11. **Step 9, the text driver (real mouse):**
      1. check "Everything required is answered.";
      2. choose consent "yes" (`gcf_consent`), without pressing Continue;
      3. type the primary signature into `gcf_tp_signature`;
      4. type the spouse signature into `gcf_sp_signature`, focus left in it;
      5. **one** `locator.click()` on `#field-confirmed`.

      The box is ticked, and `[data-q="gcf_sp_date"]` has appeared: the `change` fired on that press, and its queued redraw ran after the click.

      **Catalogue check (done while planning):** every question in section 14 is optional, including `gcf_consent`, `gcf_tp_signature`, `gcf_tp_date`, `gcf_sp_signature` and `gcf_sp_date`. Consent "yes" makes `gcf_tp_signature` visible, not required, so leaving it blank doesn't disable Submit. The test still types a primary signature into `gcf_tp_signature` in item 11 (before the spouse signature), so the saved case looks like a real consent. Item 13 checks it too.
  12. Submit with one click.
  13. **Submit saved first:** query the case and expect `answers->>'gcf_consent' = 'yes'`, and `answers->>'gcf_tp_signature'` and `answers->>'gcf_sp_signature'` equal to the typed names.
  14. On the progress page, check a client number.
  15. In `finally`: set the workspace back to 1 and close the window.
  16. `shoot` step 2, step 6, a senior step, step 9 and the progress page.
  17. Call `assertConsoleQuiet` on the window.


  Keep the rest of the story unchanged. That case is never opened on a staff screen.
- [ ] **Step 2: Prove the click test catches the fault (temporary change, not committed).**
  1. In `app.mjs`'s version-2 `change` handler, temporarily make every `change` (text fields included) call `render()` at once: no queue, no `needsRedraw` check, bypassing the hold. That is the old rule.
  2. Run `npm run test:browser`. Expected: it FAILs at item 4, "Continue after typing": the step doesn't advance after one click. It may fail at item 5 or 11 first; any of the three counts. Record which assertion failed and its message.
  3. Restore the handler (`git diff src/app.mjs` shows nothing from this step) and run `npm run test:browser` again. Expected: PASS.
  4. If step 2 did **not** fail, the test isn't catching lost presses. Stop and report; don't go on.
  5. **The second fault:** run the `change` handler's in-place error update at once instead of through `afterPress`. Run `npm run test:browser`. Expected: it FAILs at item 8a.1.
     - The email note fills during the press and moves Continue down by its height.
     - 8a.1 presses 4px below Continue's top edge, so the release lands above the moved button.
     - Record the note's height from the failing run's screenshot or a measured `offsetHeight`.
  6. Restore it and confirm PASS. If it did not fail, stop and report.

  Both results go in Step 6's commit message, for example: "Checked: with change redrawing at once, 'Continue after typing' failed (<message>); with the error note filled at once, 8a.1 failed (<message>); restored, both pass."
- [ ] **Step 3: Run all four suites** in the foreground (up to 10 minutes each), with output to `/tmp`:
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
- [ ] **Step 4: Screenshots.** Copy the phase's 720px shots to `docs/design/screens/implemented-intake-v2-step2.png`, `-step6.png`, `-senior.png`, `-step9.png`. Look at each first.
- [ ] **Step 5: Docs.**
  - Add a README row "Implemented (part 4b): the client's nine-step intake (reachable once 4c switches the default)" beside the other Implemented rows.
  - Update the `redesign-review.md` status line: 4a merged, and 4b in review.
- [ ] **Step 6: Commit** ("Walk the version-2 client intake in the browser; screenshots"). The message body includes Step 2's result.
