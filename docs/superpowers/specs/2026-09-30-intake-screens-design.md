# Parts 4b and 4c: The version-2 intake screens

**Status:** approved in brainstorming on 2026-09-30.
Revised 2026-09-30: redraw rules; invalid values (§2.5).

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
| `longtext` | textarea, 5,000 limit; a fixed count container `<p id="field-<scope>-<id>-count" class="q-count">`, always rendered (referenced by the control's `aria-describedby`, not live, so it isn't read out on every keystroke), whose text shows the count within 500 of the limit and is empty otherwise; typing updates it in place (§2.4) |
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
- **`showMissing`:** a required question that is unanswered (`isAnswered`) gets the text "Needs an answer" and the class `is-missing` in its note container.
- **Invalid values** (§2.5): an answered value that fails `checkValue` gets the `checkValue` message and the class `is-invalid` instead, when the note is shown: after `change`, on a visited step, or for a question already revealed (§2.5). The check uses the `sendable` value.
- Both come from one function, `noteState`. Otherwise the container is empty and has no class. The container stays fixed and `aria-live="polite"` in every state. Because the container always exists, the text can change in place (§2.4) without replacing any node.

### 2.2 `readField(control, question)` and `readForm(formElement, version)`

**Typed text never waits for `change`.** The app redraws the whole page on any state change, including realtime updates from another window, so anything not yet in the draft would be lost mid-sentence.
- Every `input` event copies that one question's value into the draft through `readField(control, question)`, without re-rendering, as today's version-1 form does with `editAnswerField`.
- A redraw therefore always renders from a draft that already holds the typed text.
- A household card's inputs update that member in the draft the same way.
- When the page updates in place and when it is redrawn is set by §2.4.

`readForm` reads every rendered question back into an answers object. It is used before a save and on "Fill fictional details": date boxes into `YYYY-MM-DD`, checkboxes into arrays, and household cards into an array of member objects.
- An empty top-level field reads as `null`, which the save treats as clearing the field.
- Inside a household member, an empty sub-field is left out of the member object, not set to `null`, because the server checks every key a member carries. A card with no answers at all is dropped.
- A date with some boxes empty reads as `null`. A full but impossible date (Feb 30) is kept in the draft, and handled as an invalid value (§2.5).
- Values reach the draft exactly as typed; trimming happens only when a value is checked or sent (`sendable`, §2.5).
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
   - **The hold is also released** on `contextmenu`, window `blur` and `visibilitychange`, and by a 2-second safety timer started at `pointerdown`, so a press whose `pointerup` never arrives (right-click, Ctrl+click, a context menu) can't hold redraws forever.
   - **A held redraw is dropped once any real redraw runs.** Every render that actually replaces the page first clears the held request, so a queued flush can never draw a second time.
   - **In-place updates that can move the layout wait too.** Filling an empty note, changing a rail mark or refreshing the chip on `change` makes content taller and pushes the controls below it down. For a text field, `change` fires on the `mousedown` of the next press, so that shift would move Continue out from under the pointer.
     - Every DOM update caused by `change` therefore goes through the same hold as a redraw: it runs in a queued task, after `pointerup` and the `click`, while a pointer is down.
     - Only state (for example, the revealed list, §2.5) is updated at once, and state moves nothing.
     - If the press replaced the page (Continue, a rail link), the queued update finds its node gone and does nothing: the new render already shows the state.
     - Updates caused by `input` can run at once, because nobody types during a press.
2. **`input` updates in place, never redraws.** Each `input` event writes the question's value to the draft (§2.2) and updates these things in the existing page, and nothing else:
   - the question's note container (§2.1): its text ("Needs an answer" or empty) and its `is-missing` class;
   - the current step's mark in the rail (§3.2): its status class and text;
   - for a `longtext`, its character-count container (§2.1): its text ("4,612 of 5,000 characters" within 500 of the limit, otherwise empty).

   Only `className` and `textContent` change. No node is added, removed or replaced, so nothing moves under the pointer or the keyboard, and the Saved / Unsaved chip keeps today's in-place refresh.
3. **A full redraw happens only when the visible questions change.** That is:
   - a radio, checkbox or `<select>` changes (on `change`, which for these fires after the click);
   - a text field that drives a `showIf` changes (on `change`), and only when the questions **on the page** differ from the questions **the draft makes visible**. Today the catalogue has one such field, `gcf_sp_signature` (it shows `gcf_sp_date`).
     - **Checked: only `gcf_sp_signature`.** Every kind of condition was searched: question and household `showIf`s, tip conditions (only `refund_method`, a choice) and `fixedOptions.who.spouseShowIf` (`marital_status`, a choice). No other text field drives anything.
     - **The comparison is page against draft, never draft before against draft after.** By the time `change` fires, rule 2 has already put every keystroke in the draft, so a before/after comparison of the draft always finds no difference, and `gcf_sp_date` would never appear.
     - "On the page" is the set of unique `data-q` values rendered in the current step, including `hh` (household controls all carry `data-q="hh"`). "The draft makes visible" is the set of top-level question ids on the step that `isVisible` passes against the draft, which uses the same kind of id (`hh` for the household group).
     - Using the page as the "before" also catches a change typed and then undone before `change` fires: page and draft agree, so no redraw happens.

   Everything else (Continue, Back, a rail jump, the senior switch, Add / Remove a person, Fill fictional details, a save's result) is a redraw the person asked for with a press, and runs from the `click` handler, after the press is complete.
   - Any redraw requested by a `change` is queued (`setTimeout(…, 0)`) rather than run inside the handler, so that a Tab has already moved the focus to its new place and rule 4 restores that place, not the field that was left.
4. **A realtime redraw keeps focus, caret and scroll: the method is restore-after-redraw.** A redraw from another window's change (or any redraw not caused by a press) goes ahead and then puts back:
   - focus and caret, through the app's existing `describeFocus` / `restoreField` path, which already records the focused control's id and `selectionStart`;
   - the scroll position, `window.scrollX`/`scrollY` recorded before the redraw and restored after it. This is new, and applies to the version-2 form only.

   **Scroll is restored only when the redraw keeps the same place:** the same screen, the same case and the same `formStep` before and after. That covers realtime redraws and a choice's show-if redraw on the same step. A redraw that changes the step (Continue, Back, a rail jump) or leaves the form (Submit, Save & exit) doesn't restore: it scrolls to the top and puts focus on `#main`, so the next step opens at its start. The place is compared inside `render()`, not inferred from what called it, because step changes arrive through the controller's `show()` → `render(false)`, the same path as a realtime redraw.

   One narrow wait remains: a redraw requested during IME composition (`compositionstart` until `compositionend`) runs after `compositionend`, because replacing a field mid-composition discards the half-composed characters. This matters for Chinese input (4d) and costs nothing in English.

   Restoring was chosen over deferring the redraw for as long as a field has focus. A client can keep a field focused indefinitely, and a deferred redraw would hide the office's change, and the conflict banner, until they left it.

### 2.5 Invalid values

An invalid value is an answered value that fails `checkValue`: a bad email, Feb 30, a four-digit ZIP, and so on. **A draft save must not fail because of a format rule. Format rules apply at Submit.**

**What the server does today** (checked against the test database, 2026-09-30):
- One invalid value makes version-2 `SAVE_ANSWERS` refuse the **whole** save (`VT007 VALIDATION`), so none of the other answers are saved either.
- The refusal doesn't say which field was wrong.
- Submit checks only missing answers (`intake_missing`), because a stored value is always one that passed the save check.

Changing that needs a migration, so for 4b the client keeps invalid values away from the server:

- **The draft holds exactly what is in the box.** Nothing is trimmed or rewritten while the person types: `readField` and `readForm` copy values as they are. Trimming the draft on `input` would let a redraw drop a trailing space the person had just typed, and the next letter would join the word, which breaks the §2.2 rule that a redraw never loses typed text.
- **`sendable(question, value)`** is the value as the server would receive it: text-like values trimmed of leading and trailing spaces (household sub-fields too). Every check uses it:
  - `checkValue` (so `" 12345 "` is a valid ZIP);
  - `isAnswered`;
  - `invalidAnswers` and `missingToSubmit`;
  - the note and the rail.
- **`withholdInvalid(draft, version)`** returns the save request's answers: every field's `sendable` value, without every field whose `sendable` value fails `checkValue`. For a household, the whole `hh` field is withheld when any member fails. `withheldFields(draft, version)` returns the ids it leaves out.
  - Every version-2 save path sends its result: Continue, Back, a rail jump, Save & exit, and the save before Submit (all go through `saveAnswers`).
  - The draft keeps the typed value, and the server keeps its last valid value for that field, or none.
- **`dirty` means "a save would change the server".** For a version-2 case, `editAnswers` recomputes it after every edit, over the whole draft: it is true when some field in `withholdInvalid(draft)` differs from the server's value (`savedCase.answers` with the contact fields merged; an unanswered value on both sides is equal).
  - The base revision is pinned when `dirty` turns true, and **cleared when `dirty` turns false again**, for example when an edit is undone. Otherwise an office save in between would leave the next edit expecting the old revision, and the server would refuse it with a false CONFLICT. While not dirty, a realtime change simply rebuilds the draft (`keepLocalOnly`), so there is nothing a pin needs to protect.
  - So editing an already-withheld invalid value leaves `dirty` as it was.
  - Turning a valid value invalid doesn't make it dirty: the field isn't sent, and the server keeps its valid value.
  - Typing a trailing space doesn't make it dirty either.
- **Local-only differences survive every refresh.** `applyCase` (after a save, or on a realtime change while not dirty) rebuilds the draft from the server, which would drop what the client typed.
  - It therefore keeps the previous draft's value for every field whose difference from the server can't be sent: a withheld (invalid) value, or a value equal to the server's once `sendable` is applied (only spaces differ).
  - Every other field takes the server's value.
  - The rule is computed from the draft each time; there is no separate list to fall out of date.
- **The Saved / Unsaved chip** shows, in order:
  1. Saving;
  2. Failed;
  3. Unsaved, while `dirty`;
  4. **"N answers need checking"**, while N > 0 **shown** errors exist: invalid answers of visible questions (`invalidAnswers(null, draft)`) whose ids are in the revealed list;
  5. Saved.

  - The chip counts exactly the errors the notes show.
    - So it never flags a value while it is being typed: an id enters the revealed list only on `change` or when its step is left.
    - It never counts a hidden question's value: hidden values are still withheld from saves, but nothing asks the person to fix them, and they are counted again if the question reappears.
  - A valid value turned invalid shows the count once the person leaves the field, never "Saved" with an error on screen.
  - It never shows Unsaved for withheld fields alone.
  - **Step 9's "Needs a change" list and the Submit gate use every visible invalid answer** (`invalidAnswers(null, draft)`), revealed or not, because Submit must never go through with one. They can differ from the chip only while a field is being typed in and not yet left.
- **`staleSave`** compares the retained envelope's answers with `withholdInvalid(draft)`, not with the raw draft. A withheld field, or a change of spaces only, doesn't make the envelope stale, because the envelope never carried it.
- **If the server still refuses a save:**
  - if the refusal names a field, the client withholds that field and retries once;
  - if it names none, the usual failure banner shows.
  - It never retries in a loop.
  - Today's server never names a field (see above), so in 4b every refusal takes the banner path. The field-naming path is written so a later server change works without a client change.
- **Where the error shows:** in the question's note container (§2.1), next to the question, with the `checkValue` message ("Enter a real date as YYYY-MM-DD.", "Enter a valid email address.").
  - It takes the class `is-invalid`.
  - An invalid answer outranks "Needs an answer": the note shows one message.
- **The revealed list is the one source of "shown".** The window state's `visitedSteps` record gains `revealed: string[]` for the same case. An error is shown, in the note, the rail and the chip, exactly when its id is in the list and its value is still invalid.
  - **Ids enter the list:**
    - on `change`, when the value left behind is invalid;
    - when the person leaves a step (`goToStep`, the moment the step becomes visited), for every invalid answer on that step.
  - **Never while the person types:** `input` never adds an id. It removes one as soon as the value is valid or empty.
  - **Survives redraws:** every render reads the list, so a realtime redraw keeps a shown error, on a visited step or not.
  - The `change` case's on-screen update waits for any press in progress to finish (§2.4 rule 1), because a note gaining text pushes the controls below it down.
  - The list resets with the rest of the record when another case is opened.
  - The rail counts a revealed invalid answer as "Needs answers", even on an unvisited step.
- **Household errors belong to the member's sub-field.**
  - `invalidAnswers` returns an id per invalid sub-field, `hh[<n>].<sub>` (the same form `missingToSubmit` uses), never the bare `hh`. The revealed list uses the same ids.
  - The error shows in that sub-question's own note (`field-<scope>-hh-<n>-<sub>-note`), with the sub-field's own `checkValue` message ("Enter a real date as YYYY-MM-DD."), never the group check's text ("dob: …").
  - Step 9 lists it as "Person <n+1>: <sub-question wording>" with "Needs a change".
  - Removing a member drops its ids from the revealed list and renumbers the ids of the members after it.
  - `withholdInvalid` still withholds the whole `hh` field while any member has an invalid sub-field.
- **Missing and invalid are computed from the draft alone.** The draft already holds the contact fields (§3.3), so the client form calls `missingToSubmit(2, draft)` with no `contact` argument. Passing `record.contact` would let the server's copy override the draft (`missingToSubmit` gives `contact` priority), so a phone typed but not saved would count as missing, and a cleared phone as answered.

  Both updates set only `className` and `textContent`, as in §2.4 rule 2. An invalid value never causes a redraw.
- **Three places show an invalid answer:**
  - the note;
  - the rail mark, which counts it as "Needs answers" (§3.2);
  - step 9, under "Still to answer", with the text "Needs a change" and a link to its step (§3.4).
- **Submit** stays disabled while any answer is invalid (`invalidAnswers`), as well as while any is missing.
  - The server refuses Submit for missing answers, and never holds an invalid one: it refuses to store any.
  - So both sides use the same rule: nothing invalid is ever submitted.
  - The client's disabled Submit is also what stops a Submit that would use a withheld field's older, valid value.
- **Trimming** happens only in `sendable`: in checks and in the save request, never in the draft. After a successful save the server holds the trimmed value. The box shows it after the next redraw that takes the server's value, which is never a redraw that keeps a local-only difference.
- **Email with a space:** an email with a space inside is invalid. `checkValue` rejects it.
  - The server's check (`check_intake_value`, 4a) accepts it, and isn't changed here.
  - This is the one known difference between the two checks, and the direction is safe: the client withholds the value, so the server never receives it.
  - The shared contract table (§6) records it.

Better long-term: the server accepts any format in draft saves and checks at Submit. This needs a migration and is out of scope for 4b.

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
    - a check when it has no unanswered required question and no invalid answer;
    - "Needs answers" once visited with some left, counting invalid answers (§2.5) as well as missing ones;
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
- **Invalid values are withheld from every save** (`withholdInvalid`, §2.5). The draft keeps them, and a refresh keeps every local-only difference (an invalid value, or spaces only), so a draft save never fails on a format rule and a redraw never loses typing. `dirty` means a save would change the server.
- The Saved / Unsaved chip works as today, with one more state from §2.5: "N answers need checking" while the draft holds N withheld answers. The retained-envelope retry works as today, and `staleSave` compares against the withheld-filtered draft.
- **The two-window conflict screen needs a version-2 branch.** Today's `conflictForm` compares only version 1's 17 keys, with `String()`. For version 2 it compares every catalogue field and the four contact fields by value (deep equality for arrays and household members), labels each row with the question's wording, and shows both sides with `formatAnswer`. "Keep my edits" and "Use the office's values" work as today.
- **Fill fictional details** uses a new fictional version-2 generator: `makeSampleAnswers` in `src/sample-data.mjs` gains a `version` option (`{ seed, scenario, version: 2 }`), and version 1 stays the default. It fills only blank fields, and every value passes `checkValue`.
  - **The generated person follows the draft's marital status.** When the draft already says `married`, the fill generates a married person, spouse answers included (`makeSampleAnswers({ …, married: true })`). Otherwise it generates the default never-married person.
  - So a client who chose "married" and then presses Fill gets the spouse questions answered, and nothing required is left missing.

### 3.4 Behaviour

- **Show-if** follows §2.4:
  - Typing never redraws; it updates the question's note and the current step's rail mark in place.
  - A full redraw happens only when the visible questions change: on a radio, checkbox or select `change`, or on a `change` of a text field that drives a `showIf` (today only `gcf_sp_signature`) when the questions on the page differ from those the draft makes visible.
  - That redraw never runs between `mousedown` and `mouseup`, and focus, caret and scroll are restored after it.
  - A hidden question keeps its answer in the draft; the server ignores hidden required questions.
- **Clearing spouse:** when `marital_status` changes away from `married`, every `who` answer drops `spouse` in the same edit.
- **Continue always moves on.** A step's unanswered required questions show "Needs an answer" only after the client has left that step once.
  - The visited steps are kept in the window state as a new field, `visitedSteps: { caseId, steps: number[] }`, added to `FIELDS` in `src/window-state.mjs` with its own check.
  - It belongs to one case: it is ignored when `caseId` isn't the selected case, and reset when another case is opened.
- **The senior switch** edits `form_version` (`general` / `senior`). The wording changes immediately, the form becomes Unsaved, and the switch is saved with the next save. No answer is touched.
- **Step 9, "Permission & review":**
  1. **"Still to answer"** lists, grouped by step, each linking to its step:
     - every missing required question (`missingToSubmit`);
     - every invalid answer (`invalidAnswers`, §2.5), with the text "Needs a change".

     When both are empty it reads "Everything required is answered."
  2. **The Form 15080 consent** section (Section 14, optional).
  3. **"I have checked my answers",** then **Submit**, disabled until the missing list and the "Needs a change" list are both empty and the box is ticked.
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
- **Bottom bar:** Cancel; "n sections still need answers"; **Save draft** (`SAVE_ANSWERS`); and **Send to the office** (`SUBMIT`), enabled when nothing required is missing. While any answer is invalid (`invalidAnswers`, §2.5), "Send to the office" is disabled, and the count of sections that need answers includes the sections holding one.
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
  - `formatAnswer` outputs;
  - `readField` never trims (the draft holds `"hello "` as typed), and `sendable` does (`" 12345 "` is a valid ZIP, and is sent as `"12345"`).
- **Invalid values (§2.5):**
  - `withholdInvalid` removes only invalid fields: valid fields, `null` clears and empty values stay;
  - `staleSave` ignores withheld fields and space-only changes: an envelope stays valid when only those change;
  - `dirty`: editing a withheld value, turning a valid value invalid, or adding a trailing space leaves it false, while a real change sets it;
  - local-only differences (an invalid value, or spaces only) survive a post-save refresh and a realtime refresh;
  - the chip counts shown errors only: not while a value is being typed, and not a hidden question's value; step 9 and Submit count every visible invalid answer;
  - the base revision is cleared when an undo makes the draft clean, so a later office save and a new edit don't raise a false conflict;
  - a typed-but-unsaved phone counts as answered and a cleared one as missing (the draft, not `record.contact`);
  - household errors use `hh[<n>].<sub>` ids and the sub-field's own message;
  - a revealed error survives a redraw on an unvisited step;
  - a refusal that names a field is retried once without it; one that names none is not retried.
- **Contract table for value checks.**
  - **One shared table** (`tests/support/intake-value-cases.mjs`) lists inputs with the expected result for each side (`js`, `sql`):
    - `"mei lin@example.com"`, `"a@"`, `"@"`, `"2025-02-30"`, `" 12345 "`, `"1234"`;
    - one valid case for each type.
  - **Two tests read it:** the JS test (`checkValue`) and the database test (`check_intake_value` in `tests/database-intake.mjs`). The table absorbs that file's existing 4a mirror list, so there is one list of cases, not two. The existing JS assertion that `"a b@c"` is a valid email (`tests/intake-catalogue.test.mjs`) becomes the marked difference.
  - **Only one row differs:** `"mei lin@example.com"` (JS invalid, SQL valid; §2.5). Any other disagreement fails the tests. It is fixed in the JS rule, or reported; the SQL is never changed here.
- **Client form:**
  - each step renders its sections, and show-if hides and shows;
  - every question has its note container (with id and `aria-live="polite"`) whether or not it shows a message, every `longtext` has its count container, and each rail step has its `rail-step-<n>-status` span;
  - the text-driver comparison (page ids against the draft's visible set) is a pure function, `needsRedraw(renderedIds, step, answers)`: with `gcf_sp_signature` filled in the draft and `gcf_sp_date` not rendered it returns true, and with both agreeing it returns false;
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
- **In place:** typing an answer into a required question on a visited step clears its "Needs an answer" and changes the rail mark, and the note element is the same node before and after (compare a marker property set on it before typing). Filling a long answer past 4,500 characters (`locator.fill`, then one typed character) shows its count without a redraw.

- The auth-browser suite doesn't touch intake labels, so it should pass unchanged.

**Invalid values (§2.5), in PR 4b's version-2 browser phase.** These use a real mouse: one `locator.click()`, and no retry helpers.
1. On step 2, with the other required answers filled, type `not-an-email` into the email field and click Continue once. The step advances.
2. The email's note shows "Enter a valid email address." (`is-invalid`), and the rail's step-2 mark shows "Needs answers". Step 9 lists the email under "Still to answer" as "Needs a change", with a link to step 2. Submit is disabled.
3. The database has step 2's other answers and not the email (query the case). The chip reads "1 answer needs checking".
4. Back on step 2, type a valid email. The error clears without a redraw: a marker property set on the note node is still there. After Continue, the email is saved, and Submit becomes possible when nothing else is missing.

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
