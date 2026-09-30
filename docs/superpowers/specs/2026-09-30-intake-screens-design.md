# Parts 4b and 4c: The version-2 intake screens

**Status:** approved in brainstorming on 2026-09-30.

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
- **`showMissing`:** a required question that is unanswered (`isAnswered`) gets "Needs an answer", tied to the control by `aria-describedby`.

### 2.2 `readForm(formElement, version)`

It reads every rendered question back into an answers object: date boxes into `YYYY-MM-DD`, checkboxes into arrays, and household cards into an array of member objects. Empty fields read as `null`, which the save treats as clearing the field. It replaces today's version-1 field-by-field `editAnswerField` for version-2 forms.

### 2.3 `formatAnswer(question, value, { variant, lang })`

It returns the read-only text of an answer:
- option labels;
- dates as "Apr 12, 1961";
- phones as "(215) 555-0199";
- `who` as "Me, My spouse";
- each household member as one line ("Xiao Ming Wang · Son · born Mar 14, 2015 · 12 months");
- `null` for unanswered.

## 3. The client's nine-step form (PR 4b)

### 3.1 Which form

`intakeScreen` dispatches on `savedCase.intakeVersion`. A version-1 draft gets today's four-step form, unchanged; a version-2 draft gets the nine-step form.

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
  - Under the steps: a progress bar ("Step 2 of 9"), then the office contact card.
- **Main column:**
  - "STEP n OF 9", the step title, and the section intro.
  - One card per section, and within a section one card per heading group, holding its visible questions.
  - The Fill fictional details pill.
  - Back and Continue at the bottom; step 9 replaces Continue with Submit.

### 3.3 Draft and saving

- The controller's draft holds the version-2 answers plus the four contact fields. On load, the contact fields are filled in from `record.contact` through `CONTACT_FIELDS`.
- `pickAnswers` becomes version-aware: version 1 keeps its 17 keys, and version 2 keeps the catalogue's top-level field IDs.
- **Saving** happens on Continue, Back, a rail jump, and Save & exit. The save sends the whole draft (`SAVE_ANSWERS`); the server routes the contact fields to `case_contacts`.
- The Saved / Unsaved chip, the retained-envelope retry, and the two-window conflict screen work as today.
- **Fill fictional details** uses a new fictional version-2 generator: `makeSampleAnswers` in `src/sample-data.mjs` gains a `version` option (`{ seed, scenario, version: 2 }`), and version 1 stays the default. It fills only blank fields, and every value passes `checkValue`.

### 3.4 Behaviour

- **Show-if:** a change to any answer re-renders the step, so show-if questions appear and hide. A hidden question keeps its answer in the draft; the server ignores hidden required questions.
- **Clearing spouse:** when `marital_status` changes away from `married`, every `who` answer drops `spouse` in the same edit.
- **Continue always moves on.** A step's unanswered required questions show "Needs an answer" only after the client has left that step once. The set of visited steps is kept in the window state, alongside `formStep`.
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
  - The same page continues an existing version-2 office draft: the office case page shows **Continue in Add a case** for one.
- **Header:** Work board / Add a case, the title, the Application ID, and "Draft · Saved / Unsaved".
- **Sections:** nine collapsible sections in step order.
  - A closed section shows its number, title and a one-line summary of its answers (`formatAnswer`, joined with " · ").
  - An open section shows its questions (`renderQuestion`).
  - Opening a section closes none of the others.
- **Side column:**
  - Case info: Application ID, stage, created by, and created at.
  - Materials received: the §4.1 card.
- **Bottom bar:** Cancel; "n sections still need answers"; **Save draft** (`SAVE_ANSWERS`); and **Send to the office** (`SUBMIT`), enabled when nothing required is missing.
  - The office still records the intake checks from the case page, as today.
- Version-1 office drafts keep today's assisted-answers panel on the case page.

### 4.3 Eligibility

- The Edit best time and Save materials buttons follow `canSeeContact`, placed beside the existing screen eligibility.
- A refused action shows its reason, as other actions do.

## 5. The switch-over (the last step of PR 4c)

Migration `014_intake_v2_default.sql`:
- **Default:** `workspaces.default_intake_version`'s column default becomes 2, and every existing workspace is set to 2.
  - New client cases and office cases become version 2.
  - Existing cases keep their version (011's trigger pins it).
- **Samples:** 009's sample seeding is replaced (from its latest definition) to work with version 2.
  - **Seeding:** each sample is inserted with empty answers, and then its fictional version-2 answers (`fixture_answers_v2(key)`) and its `case_contacts` row are written.
  - **Checkpoint reload:** `apply_fixture_scenario` also deletes the sample's `case_contacts` and `case_materials` rows before rebuilding it.
- **What stays for version 1:** `fixture_answers` (version 1) stays for re-seeding a workspace that is set back to 1. Setting the default back to 1 is a one-line update.

## 6. Testing and acceptance

**Unit:**
- **Renderer:**
  - every type in the real catalogue renders with its label and ID;
  - render then `readForm` round-trips the value (date boxes; `who` with `none`; household add and remove; a `yesno` without Not sure);
  - `formatAnswer` outputs.
- **Client form:**
  - each step renders its sections, and show-if hides and shows;
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

**Database:**
- A version-2 client round trip: create empty, save step by step, submit, client number.
- An office version-2 round trip.
- **Switch-over:**
  - the default is 2;
  - a new case is version 2;
  - an existing version-1 case is untouched.
- **Samples:**
  - every sample's answers pass `check_intake_value`;
  - every submitted sample has nothing missing (`intake_missing`);
  - a checkpoint reload clears contacts and materials.

**Browser story (updated deliberately):**
- **Client:** walks the nine steps with Fill fictional details, checks a show-if (married shows the spouse questions), flips the senior switch, checks step 9's missing list, submits, and sees the client number.
- **Staff:**
  - reads the version-2 answers;
  - the contact card is hidden for a volunteer on an unclaimed case and shown once claimed;
  - records materials;
  - the office completes a walk-in case in Add a case.
- **Version 1:** the story's version-1 phases shrink to one check. A version-1 draft is made directly in the database, finished in the old form, and submitted.

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
