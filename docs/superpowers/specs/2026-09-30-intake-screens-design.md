# Parts 4b and 4c: The version-2 intake screens

**Status:** approved in brainstorming on 2026-09-30.
Revised 2026-09-30: redraw rules.

**Roadmap:** part 4 of `docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md`, which is split into 4a (catalogue and server, merged in #39), 4b (client intake), 4c (Add a case and staff views) and 4d (Chinese).

**Builds on:** `docs/superpowers/specs/2026-09-29-intake-catalogue-design.md`. Its §6 carry-forwards are all handled here.

**Designs:** `docs/design/screens/intake-step*-v2-*.png` (client) and `add-case-v6-full-page.png` (Add a case).

## 1. Scope and release

- **One release, two PRs.** Clients never see version 2 before staff can work its cases.
  - **PR 4b:** the client's nine-step form and the shared renderer. It is built and tested, but unreachable, because `default_intake_version` stays 1 and no version-2 case exists outside tests.
  - **PR 4c:** the staff views, the version-2 Add a case, the contact and materials controls, and, last, the switch-over (§5) that makes new cases version 2.
- **Out:**
  - Chinese on screen (4d); the language switch stays English-only.
  - Real uploads (D4): upload tips show their text only.
  - Phone masking (part 5).
  - The returning-client search (part 6).
  - Removing version 1, a later clean-up once no version-1 case is left.

## 2. The shared renderer: `src/intake-form.mjs`

It is pure: it reads no controller state, and screens pass in what it needs.

### 2.1 `renderQuestion(question, value, { variant, lang, scope, answers, showMissing })`

It returns the HTML for one question. Every control has a real `<label>`, or a `<fieldset>` with a `<legend>` for groups of controls. IDs are `field-<scope>-<id>` (and `field-<scope>-hh-<n>-<sub>` inside the household group), so the same question can appear twice on a page.

| Type | Control |
|---|---|
| `text`, `signature` | text input, `maxlength` from the catalogue |
| `longtext` | textarea, 5,000 limit; a character count appears within 500 of the limit |
| `email` | `type="email"` input |
| `phone` | `type="tel"` input; any formatting accepted, digits kept on save (the 4a rules) |
| `zip`, `year`, `number` | text input, `inputmode="numeric"`; the range is shown when declared |
| `date` | three boxes, Month / Day / Year, read as one `YYYY-MM-DD` |
| `choice` | radio cards; a `<select>` when there are more than 6 options |
| `yesno` | a radio group styled as the design's segmented Yes / No / Not sure buttons (Not sure only when the question lists it) |
| `multi`, `who` | checkbox chips; choosing "No one" clears the others; "My spouse" is rendered only while `marital_status` is `married` (`fixedOptions.who.spouseShowIf`) |
| `group` | one card per person, rendered with the same function; "Add a person" up to 10, and "Remove" per card |

- **Wording** comes from `wording(question, { variant, lang })`, and option labels from the question's options, or `fixedOptions` for `who` and `yesno`.
- **Tips** render under their question. A tip with a condition renders only while the condition holds. Upload tips show text only.
- **Every question has a fixed note container:** `<p id="field-<scope>-<id>-note" class="q-note" aria-live="polite">`, rendered for every question, whether or not it has a message. Household sub-questions use `field-<scope>-hh-<n>-<sub>-note`. The control's `aria-describedby` always references it.
- **`showMissing`:** a required question that is unanswered (`isAnswered`) gets the text "Needs an answer" and the class `is-missing` in its note container. Otherwise the container is empty and has no class. Because the container always exists, the text can change in place (§2.4) without replacing any node.

### 2.2 `readField(control, question)` and `readForm(formElement, version)`

**Typed text never waits for `change`.** The app redraws the whole page on any state change, including realtime updates from another window, so anything not yet in the draft would be lost mid-sentence.
- Every `input` event copies that one question's value into the draft through `readField(control, question)`, without re-rendering, as today's version-1 form does with `editAnswerField`.
- A redraw therefore always renders from a draft that already holds the typed text.
- A household card's inputs update that member in the draft the same way.
- When the page updates in place and when it is redrawn is set by §2.4.

`readForm` reads every rendered question back into an answers object. It is used before a save and on "Fill fictional details": date boxes into `YYYY-MM-DD`, checkboxes into arrays, and household cards into an array of member objects.
- An empty top-level field reads as `null`, which the save treats as clearing the field.
- Inside a household member, an empty sub-field is left out of the member object, not set to `null`, because the server checks every key a member carries. A card with no answers at all is dropped.
- A date with some boxes empty reads as `null`; a full but impossible date (Feb 30) is kept, so `checkValue` can mark it.
- **It sees only what is rendered:** the current step on the client form, or the open sections on Add a case. Its result is **merged** into the draft field by field and never replaces it, so saving one step keeps the other steps' answers, and hidden questions keep theirs. It replaces today's version-1 field-by-field `editAnswerField` for version-2 forms.

### 2.3 `formatAnswer(question, value, { variant, lang })`

It returns the read-only text of an answer:
- option labels;
- dates as "Apr 12, 1961";
- phones as "(215) 555-0199";
- `who` as "Me, My spouse";
- each household member as one line ("Xiao Ming Wang · Son · born Mar 14, 2015 · 12 months");
- `null` for unanswered.

### 2.4 Redraw rules

The app redraws by replacing the whole page (`root.innerHTML`). These rules say when the client's version-2 form may do that. Version-1 screens keep today's behaviour, and Add a case (§4.2) keeps the scope PR 4c already has.

1. **A press never loses its target.** No button or link may be replaced or moved between `mousedown` and `mouseup`. A browser delivers `click` only when both land on the same element, so a redraw in between swallows the click.
   - This is why a text field's `change` (which fires on the `mousedown` that takes focus away) must never redraw on the spot.
   - While a pointer is down on the page (`pointerdown` until `pointerup` or `pointercancel`), every requested redraw waits. It runs in a task queued from `pointerup`/`pointercancel` (`setTimeout(…, 0)`), so after the `click` has been delivered.
2. **`input` updates in place, never redraws.** Each `input` event writes the question's value to the draft (§2.2) and updates exactly two things in the existing page:
   - the question's note container (§2.1): its text ("Needs an answer" or empty) and its `is-missing` class;
   - the current step's mark in the rail (§3.2): its status class and text.

   Only `className` and `textContent` change. No node is added, removed or replaced, so nothing moves under the pointer or the keyboard, and the Saved / Unsaved chip keeps today's in-place refresh.
3. **A full redraw happens only when the visible questions change.** That is:
   - a radio, checkbox or `<select>` changes (on `change`, which for these fires after the click);
   - a text field that drives a `showIf` changes (on `change`), and only when the set of visible questions on the step actually differs from before. Today the catalogue has one such field, `gcf_sp_signature` (it shows `gcf_sp_date`).

   Everything else (Continue, Back, a rail jump, the senior switch, Add / Remove a person, Fill fictional details, a save's result) is a redraw the person asked for with a press, and runs from the `click` handler, after the press is complete.
   - Any redraw requested by a `change` is queued (`setTimeout(…, 0)`) rather than run inside the handler, so that a Tab has already moved the focus to its new place and rule 4 restores that place, not the field that was left.
4. **A realtime redraw keeps focus, caret and scroll: the method is restore-after-redraw.** A redraw from another window's change (or any redraw not caused by a press) goes ahead and then puts back:
   - focus and caret, through the app's existing `describeFocus` / `restoreField` path, which already records the focused control's id and `selectionStart`;
   - the scroll position, `window.scrollX`/`scrollY` recorded before the redraw and restored after it. This is new, and applies to the version-2 form only.

   One narrow wait remains: a redraw requested during IME composition (`compositionstart` until `compositionend`) runs after `compositionend`, because replacing a field mid-composition discards the half-composed characters. This matters for Chinese input (4d) and costs nothing in English.

   Restoring was chosen over deferring the redraw for as long as a field has focus. A client can keep a field focused indefinitely, and a deferred redraw would hide the office's change, and the conflict banner, until they left it.

## 3. The client's nine-step form (PR 4b)

### 3.1 Which form

`intakeScreen` dispatches on `savedCase.intakeVersion`. A version-1 draft gets today's four-step form, unchanged; a version-2 draft gets the nine-step form.

### 3.1b Step titles

The designs' titles win. PR 4b changes three step titles in the catalogue build (`tools/build-intake-catalogue.mjs`, the step table):
- step 5 becomes "Household members" (家庭成员, unchanged);
- step 7 becomes "Expenses & life events" (支出与生活事项);
- step 9 becomes "Permission & review" (授权与确认).

The new Chinese goes to the group for review, with the other new wording. Because step titles are part of the hashed catalogue, the build writes a new catalogue migration in PR 4b (`014_intake_catalogue_<hash8>.sql`, per the one-per-branch rule). The switch-over (§5) is therefore the migration after it, not a fixed number.

That migration loads the same field rows as 012, because step titles aren't stored in the database. It exists only because the catalogue hash covers the whole catalogue, titles included, and the "database never behind the browser" test requires the newest catalogue migration to carry the current hash. The build's header comment for it should say so, so a reviewer isn't left wondering.

### 3.2 Layout (the step-2 and step-6 designs)

- **Top bar:**
  - the language switch (English only);
  - a **Senior version** switch, on the version-2 form only;
  - Need help?;
  - Save & exit.
- **Strip under the bar:** the Application ID, and the Saved / Unsaved chip.
- **Left rail:**
  - The nine steps (catalogue titles). A step shows:
    - a check when it has no unanswered required question;
    - "Needs answers" once visited with some left;
    - "You are here" for the current step.
  - Every step is a link.
  - **Each step's mark is one fixed element,** `<span id="rail-step-<n>-status" class="rail-status is-done|is-needs|is-none">`, holding the text "Done", "Needs answers" or nothing. The current step is marked separately with `aria-current="step"` and "You are here", which a step change redraws.
    - **In-place update (§2.4 rule 2):** after each `input`, the current step's status is recomputed with the same function the render uses (from the draft, the visible questions and `visitedSteps`).
    - Only that span's `className` and `textContent` are set.
    - Other steps' marks can't change from typing on this step, so they are left alone.
  - Under the steps: a progress bar ("Step 2 of 9"), then the office contact card.
- **Main column:**
  - "STEP n OF 9", the step title, and the section intro.
  - One card per section, and within a section one card per heading group, holding its visible questions.
  - The Fill fictional details pill.
  - Back and Continue at the bottom; step 9 replaces Continue with Submit.

### 3.3 Draft and saving

- The controller's draft holds the version-2 answers plus the four contact fields. On load, the contact fields are filled in from `record.contact` through `CONTACT_FIELDS`. `record.contact` is `null` until a case's first contact save (`mapContact`), and `null` counts as empty.
- `pickAnswers` becomes version-aware: version 1 keeps its 17 keys, and version 2 keeps the catalogue's top-level field IDs.
- **Saving** happens on Continue, Back, a rail jump, and Save & exit. The save sends the whole draft (`SAVE_ANSWERS`); the server routes the contact fields to `case_contacts`.
- The Saved / Unsaved chip and the retained-envelope retry work as today.
- **The two-window conflict screen needs a version-2 branch.** Today's `conflictForm` compares only version 1's 17 keys, with `String()`. For version 2 it compares every catalogue field and the four contact fields by value (deep equality for arrays and household members), labels each row with the question's wording, and shows both sides with `formatAnswer`. "Keep my edits" and "Use the office's values" work as today.
- **Fill fictional details** uses a new fictional version-2 generator: `makeSampleAnswers` in `src/sample-data.mjs` gains a `version` option (`{ seed, scenario, version: 2 }`), and version 1 stays the default. It fills only blank fields, and every value passes `checkValue`.

### 3.4 Behaviour

- **Show-if** follows §2.4:
  - Typing never redraws; it updates the question's note and the current step's rail mark in place.
  - A full redraw happens only when the visible questions change: on a radio, checkbox or select `change`, or on a `change` of a text field that drives a `showIf` (today only `gcf_sp_signature`) when the visible set actually differs.
  - That redraw never runs between `mousedown` and `mouseup`, and focus, caret and scroll are restored after it.
  - A hidden question keeps its answer in the draft; the server ignores hidden required questions.
- **Clearing spouse:** when `marital_status` changes away from `married`, every `who` answer drops `spouse` in the same edit.
- **Continue always moves on.** A step's unanswered required questions show "Needs an answer" only after the client has left that step once.
  - The visited steps are kept in the window state as a new field, `visitedSteps: { caseId, steps: number[] }`, added to `FIELDS` in `src/window-state.mjs` with its own check.
  - It belongs to one case: it is ignored when `caseId` isn't the selected case, and reset when another case is opened.
- **The senior switch** edits `form_version` (`general` / `senior`). The wording changes immediately, the form becomes Unsaved, and the switch is saved with the next save. No answer is touched.
- **Step 9, "Permission & review":**
  1. **"Still to answer"** lists every missing required question (`missingToSubmit`), grouped by step, each linking to its step. When the list is empty it reads "Everything required is answered."
  2. **The Form 15080 consent** section (Section 14, optional).
  3. **"I have checked my answers",** then **Submit**, disabled until the missing list is empty and the box is ticked.
- **After submit,** the client goes to the progress page as today. It shows the client number.

### 3.5 The progress page

- Service and language display through `serviceLabel` / `languageLabel`, for both versions.

## 4. Staff screens and Add a case (PR 4c)

### 4.1 The case page for a version-2 case

The answers panel dispatches on `intakeVersion`; version 1 keeps today's panel.

- **Answers:**
  - read-only, grouped by the nine steps;
  - each answered, visible question with `formatAnswer`;
  - household members listed;
  - required, visible, unanswered questions marked "Not answered";
  - a line "Wording used: Standard / Senior", from `form_version`.
- **Contact card:**
  - When `canSeeContact(record, person)` is true, it shows both phones, the best time to reach and the note, plus an **Edit best time** control (`UPDATE_CONTACT`).
  - Otherwise it shows: "Contact details are shown to the office, and to the preparer and reviewer once the case is claimed." (D5)
  - After an `UPDATE_CONTACT` lands, the page re-reads the case so its revision is current.
- **Materials received card:**
  - The eleven items in `MATERIALS_ITEMS` order, as checkboxes, each received one showing who recorded it and when.
  - **Save** (`RECORD_MATERIALS`) is available to people who pass `canSeeContact`, the same rule as 013's `works_on_case`. Others see the card read-only.

### 4.2 Add a case, version 2 (the design)

- **Starting.** "Add a case" opens the page with no case yet: the header says "Application ID: assigned when you save", and the answers live in the browser's draft.
  - The first **Save draft** or **Send to the office** creates an empty version-2 assisted case (`vitally_create_case` with `{}`), then saves the draft into it. After that, the page is on that case.
  - Opening the page and leaving creates nothing, so no empty draft clutters the office queue.
  - **Before the first save,** the Materials card is shown but disabled ("Save the draft first to record materials"), because there is no case to record them on.
  - **The first save is two or three calls:** create, then save, then (for Send) submit. If the save or submit fails after the create succeeded, the page stays on the newly created draft, keeps every answer in its draft, shows the usual failure banner, and the same button retries the save (and the submit) against that case. It never creates a second case.
  - The same page continues an existing version-2 office draft: the office case page shows **Continue in Add a case** for one.
- **Header:** Work board / Add a case, the title, the Application ID, and "Draft · Saved / Unsaved".
- **Sections:** nine collapsible sections in step order.
  - A closed section shows its number, title and a one-line summary of its answers (`formatAnswer`, joined with " · ").
  - An open section shows its questions (`renderQuestion`).
  - Opening a section closes none of the others.
- **Side column:**
  - Case info: Application ID, stage, created by, and created at.
  - Materials received: the §4.1 card.
- **Fill fictional details** (the presenter panel's button and the page's own pill, both `fill-assisted-intake`) fills the version-2 page's blank fields from the version-2 generator, through the renderer's field IDs, replacing today's `#field-assisted-*` lookup for version-2 pages.
- **Bottom bar:** Cancel; "n sections still need answers"; **Save draft** (`SAVE_ANSWERS`); and **Send to the office** (`SUBMIT`), enabled when nothing required is missing.
  - The office still records the intake checks from the case page, as today.
- Version-1 office drafts keep today's assisted-answers panel on the case page.
- **The old creation path goes.** PR 4's Add a case creates a case with answers in one call (`createAssistedCase` in `src/controller.mjs`), which 011's trigger refuses once the default is 2. PR 4c replaces that page and path with the version-2 page; `createAssistedCase` then creates empty cases only.

### 4.3 Eligibility

- The Edit best time and Save materials buttons follow `canSeeContact`, placed beside the existing screen eligibility.
- A refused action shows its reason, as other actions do.

## 5. The switch-over (the last step of PR 4c)

The next migration after PR 4b's catalogue migration, `015_intake_v2_default.sql`. Like 4a's, it copies `seed_fixtures` and `apply_fixture_scenario` from their latest definitions (009) and changes only what is named below.
- **Default:** `workspaces.default_intake_version`'s column default becomes 2, and every existing workspace is set to 2.
  - New client cases and office cases become version 2.
  - Existing cases keep their version (011's trigger pins it).
- **Samples:** 009's sample seeding is replaced (from its latest definition) to follow the workspace's `default_intake_version`.
  - **Version 1** (a workspace set to 1, which includes every test workspace, §6): exactly today's seeding, with `fixture_answers(key)`. Resets and checkpoints in version-1 workspaces behave exactly as before 4c.
  - **Version 2:** each sample is inserted with empty answers, and then its fictional version-2 answers (`fixture_answers_v2(key)`) and its `case_contacts` row are written.
  - **Checkpoint reload:** `apply_fixture_scenario` also deletes the sample's `case_materials` rows before rebuilding it. It keeps `case_contacts`: contacts are intake answers, and a checkpoint already keeps the sample's answers, since only `seed_fixtures` writes them. A reloaded submitted sample therefore still has its phone and nothing missing. This changes the 4a carry-forward, which said to delete both.
- **What stays for version 1:** `fixture_answers` and the version-1 seeding path stay. Setting a workspace back to 1 is a one-line update, and its next reset seeds version-1 samples.

## 6. Testing and acceptance

**Unit:**
- **Renderer:**
  - every type in the real catalogue renders with its label and ID;
  - render then `readForm` round-trips the value (date boxes; `who` with `none`; household add and remove; a `yesno` without Not sure);
  - `formatAnswer` outputs.
- **Client form:**
  - each step renders its sections, and show-if hides and shows;
  - every question has its note container (with id and `aria-live="polite"`) whether or not it shows a message, and each rail step has its `rail-step-<n>-status` span;
  - "Needs an answer" appears only after a visit;
  - step 9's missing list and the Submit gate;
  - the senior switch changes wording and keeps answers;
  - leaving `married` drops `spouse`;
  - a version-1 draft still gets the old form.
- **Controller:**
  - version-aware `pickAnswers`;
  - contact fields merge from `record.contact`, and a save carries them;
  - the revision refreshes after `UPDATE_CONTACT`.
- **Staff:**
  - the version-2 answers panel;
  - the contact card, hidden or shown per `canSeeContact`'s cases;
  - materials in catalogue order;
  - Add a case: section summaries, and the Send gate.
- **Progress page:** labels for both versions.

**Test workspaces stay version 1 unless a test says otherwise.**
- After the switch-over, the column default is 2. `createDatabaseFixture` (`tests/support/database-fixture.mjs`) therefore gains an option, `intakeVersion`, defaulting to 1, and sets its workspaces to it. So the ~30 existing database tests that save version-1 answers (`makeSampleAnswers()`) keep working unchanged, and their sample resets seed version-1 samples.
- The version-2 database tests either pass `intakeVersion: 2` or set their workspace to 2 explicitly and back in `finally`.
- The browser fixture (`tests/support/browser-fixture.mjs`) builds on the database fixture. In PR 4c it passes `intakeVersion: 2`, so the story runs on version 2.
- **Order matters,** because samples are seeded according to the workspace's version at the moment of seeding. The fixture sets `default_intake_version` inside workspace initialization (its `afterInitialize` step), before anything seeds samples. A test that switches a workspace's version and wants samples of that version resets the samples after switching.

**Database:**
- A version-2 client round trip: create empty, save step by step, submit, client number.
- An office version-2 round trip.
- **Switch-over:**
  - the default is 2;
  - a new case is version 2;
  - an existing version-1 case is untouched.
- **Samples:**
  - every sample's version-2 answers pass `check_intake_value`, field by field;
  - every submitted sample has nothing missing (`intake_missing`);
  - a checkpoint reload clears materials and keeps contacts, and a reloaded submitted sample still has nothing missing.

**Browser story.**
- **PR 4b:** the main story stays on version 1, because PR 4b's staff screens don't yet show version-2 answers. A new, separate phase covers the client form: it sets the workspace to `default_intake_version = 2`, has a second applicant start an application, walks the nine steps (below, client part only), submits, and sets the workspace back to 1. That case is never opened on a staff screen in 4b.
- **PR 4c:** the browser fixture passes `intakeVersion: 2`, so the story's workspace is version 2. Its version-1 form walk (about 21 places in `tests/browser.mjs`) and the 5 version-1 assertions in `tests/client-views.test.mjs` become deliberate updates.
- **Making a version-1 case after the switch-over:** 011's insert trigger always takes `intake_version` from the workspace default, so an explicit version is ignored. The version-1 check sets its workspace to 1, creates the case, and sets it back.

The story, updated deliberately:
- **Client:** walks the nine steps with Fill fictional details, checks a show-if (married shows the spouse questions), flips the senior switch, checks step 9's missing list, submits, and sees the client number.
- **Staff:**
  - reads the version-2 answers;
  - the contact card is hidden for a volunteer on an unclaimed case and shown once claimed;
  - records materials;
  - the office completes a walk-in case in Add a case.
- **Version 1:** the story's version-1 phases shrink to one check. A version-1 draft is created while its workspace is set to 1, finished in the old form, and submitted.

**Redraw rules (§2.4), in PR 4b's version-2 browser phase.** These use Playwright's real mouse (`page.mouse.move`/`down`/`up` on the element's box, or `locator.click()`, which does the same). Never use `element.click()` or `dispatchEvent`, which skip `mousedown` and so can't catch a lost press.
- **Continue after typing:** type in a text field (leave the focus in it), then click Continue once. The step advances to the next one, and the typed value is in the saved answers.
- **Rail link after typing:** type in a text field, then click a rail link to another step once. The page shows that step.
- **The text driver:** on step 9, with consent "yes" and married, type in `gcf_sp_signature`, then click the "I have checked my answers" box below it once. Typing's `change` fires on that press and redraws. The box is ticked, and `gcf_sp_date` has appeared.
- **Focus survives a realtime redraw:** type part of a word into a text field, force a realtime redraw from outside (`update public.cases set revision=revision where id=$1`, as the story already does), and check that:
  - the same field still has focus;
  - the caret is where it was;
  - the typed text is intact;
  - the page's scroll position is unchanged.
- **In place:** typing an answer into a required question on a visited step clears its "Needs an answer" and changes the rail mark, and the note element is the same node before and after (compare a marker property set on it before typing).

- The auth-browser suite doesn't touch intake labels, so it should pass unchanged.

**Accessibility:**
- keyboard reach and visible focus rings;
- `fieldset` / `legend` for grouped controls;
- "Needs an answer" and the Saved chip announced;
- the part 1 contrast audit;
- controls at least 44px;
- no sideways scroll at 390px (asserted).

**Done when:**
- All four suites pass on each PR, and PR 4c ends with the switch-over applied.
- `docs/design/screens/` holds screenshots of all nine client steps, one senior step, step 9, the staff answers panel, and Add a case.
