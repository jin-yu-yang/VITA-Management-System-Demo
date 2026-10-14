## Context

**The catalogue.** The intake catalogue is built from two drafts in `docs/intake-questions/`, standard and senior, by `tools/build-intake-catalogue.mjs`. The output is `src/intake-catalogue-data.mjs` and a generated `NNN_intake_catalogue_<hash8>.sql`.
- Each question's text is `wording: { general: {en, zh}, senior: {en, zh} }`.
- Sub-step leads come from the builder's constants `RECEIVED`, `PAID` and `HAPPENED` (`build-intake-catalogue.mjs:73-75`) through `both(en, zh)`, so standard and senior share one text.
- Section intros come from each draft's `**Intro text:**` block.
- The builder already supports one conditional text, a tip with a condition (`> Tip (show if …):`).

**Rendering.** `wording(question, { variant, lang })` (`src/intake-catalogue.mjs:45`) is the single reader of question text. It knows nothing about the application. Its callers:

| File | Lines | What it renders |
|---|---|---|
| `intake-form.mjs` | 169, 360, 487 | the client's form |
| `intake-views.mjs` | 368–370 (`itemLabel`), 462 (`answerSteps`) | the alert lines and the summary |
| `intake-views.mjs` | 228, 233 (`localized`) | leads and intros |
| `client-views.mjs` | 221 | the compare table |
| `office-views.mjs` | 421 (`inVariant`), plus questions through `renderQuestion` | leads and questions on the office's form |
| `staff-views.mjs` | 744–787 | the staff answers panel |
| `draft-form.mjs` | 301 | `generalWording` for the 13614-C's "not sure" comment lines |

Every one of these renders a single application, and its answers are in scope or one parameter away.

**"Married" today.** The rule is `CATALOGUE.fixedOptions.who.spouseShowIf = [{ marital_status eq married }]`, used by:
- the "My spouse" option (`intake-form.mjs:55`, `spouseShown`);
- the draft's spouse ticks (`draft-form.mjs:409`);
- the document cards (`document-cards.mjs:101`).

A change of marital status redraws the form, because the rule's field is a redraw driver (`intake-form.mjs:632`). Wording isn't stored in the database: `put_intake_field` (015) reads only the field's id, type, flags and options, and ignores other keys.

The design was agreed with the user on 2026-10-13/14 (`brainstorm.md`, Q1–Q8).

**"Who" questions.** There are nine of them: Q5.3–Q5.9, Q8.1 and Q8.3. Each is a `who` question: check-box chips Me / My spouse / No one (`intake-form.mjs:423`), with "No one" clearing the others (`readOne`). The answer is a list, e.g. `["me"]`, read by the draft 13614-C, the document cards (the visa, IP PIN and digital-asset cards ask Q5.4, Q5.8 and Q5.9) and the database's `check_intake_value`. `shownOptions` already hides "My spouse" when `spouseShown` is false (`:68`).

## Goals / Non-Goals

**Goals:**
- A client who isn't married never reads "spouse" in Q5.2, Q9.1a, Q12.4, the nine leads or section 6's intro.
- Every screen showing one application uses the same wording the client saw.
- One rule for "married", shared with the "My spouse" option.
- The senior married leads use 您爱人.
- The direct-deposit card's hint names the spouse only when married (user, planning review).
- For an unmarried client, Q5.3–Q5.9 are asked directly, and every "who" question is a Yes/No pair of radio buttons. The saved answer doesn't change (Q8).

**Non-Goals:**
- The widowed rule (spouse died within two years). It's a later fix, and it covers the options as well as the wording.
- The Step 9 review gate and summary redesign (the next change). Multi-select languages.
- Section 0's page text, which comes before marital status is asked. "former spouse" in the alimony questions.
- Any change to answers, field IDs, required flags, show-if rules or the database's rules.

## Decisions

### D1: Sibling keys for the unmarried text
- **Choice:** `wordingUnmarried` on a question, `leadUnmarried` on a sub-step, and `introUnmarried` on a section. Each takes the shape of its sibling: `{ general: {en, zh}, senior: {en, zh} }`, with the intro's values holding the intro's text. They're present only where they apply.
- **Why:**
  - existing readers of `wording`, `lead` and `intro` are untouched;
  - `walkPairs` (`tools/hant-sources.mjs`) collects the new `{en, zh}` pairs for 繁體 on its own;
  - the database loader ignores unknown keys.
- **Considered:** nesting under `wording.general.unmarried`. That changes the shape every reader of `wording.general` expects (`{en, zh}`).

### D2: Draft syntax, following the existing conditional tip
- **Choice:**
  - **A question line:** `> Not married: <English> / <中文>`, among the question's attribute lines (like `> Tip:`). Allowed on a top-level question only, at most once.
  - **A section block:** `**Intro text (not married):**`, followed by quoted lines, after the section's `**Intro text:**` block. It's parsed into the section's `introUnmarried`.
  - **Leads:** the builder's constants become `{ general: [en, zh], senior: [en, zh] }` for both the married and unmarried text. The senior married Chinese is 您或您爱人.
- **The build refuses:**
  - a `Not married` line or block present in one draft but not the other (structure check);
  - a `Not married` line on a question whose wording mentions no spouse ("spouse", 配偶 or 爱人) in either draft;
  - a group field with a `Not married` line.
- **Why:** it reads like the drafts' other attribute lines, and the checks keep the two drafts aligned.

### D3: One rule, `spouseShown(answers)`
- **Choice:** move `spouseShown` from `intake-form.mjs:55` into `src/intake-catalogue.mjs`, exported as `isVisible({ showIf: CATALOGUE.fixedOptions.who.spouseShowIf }, answers ?? {})`. The form, the draft (`draft-form.mjs:409`) and the new wording all use it.
- **Why:** the user's decision Q2-A. The wording and the options can't disagree.
- **Not touched:** `document-cards.mjs:101` (`isMarried`) means the same thing and stays as it is; both read `marital_status === "married"`. D7 reuses it for the bank card's hint.

### D4: `wording()`, `leadOf()` and `introOf()` take the application's answers
- **Choice:**
  - `wording(question, { variant, lang, answers })`. When `answers` is given, `!spouseShown(answers)` and the question has `wordingUnmarried`, read that; otherwise read `wording`. Same fallbacks as today: senior falls back to general, and `sourceText` picks the language.
  - `leadOf(substep, { variant, lang, answers })` and `introOf(section, …)` work the same way for leads and intros, replacing the local `localized`/`inVariant` reads in `intake-views.mjs` and `office-views.mjs`.
  - Without `answers`, the result is today's text. Catalogue-level callers and tests keep their behaviour.
- **Why:** one reader for each kind of text, and the answers are the only new input.

### D5: Every screen passes its application's answers (user's decision Q3-A)

| Screen | Call site | Answers it passes |
|---|---|---|
| Client's form | `intake-form.mjs:360,487` (`renderQuestion`, `renderGroup`, which already receive `answers`); `:169` | the draft |
| Leads and intros | `intake-views.mjs:228,233` | the form's answers |
| Alerts | `intake-views.mjs:368–370` (`itemLabel`) | gains an `answers` parameter from `checkBody` |
| Summary | `intake-views.mjs:462` (`answerSteps`) | its `answers` |
| Compare table | `client-views.mjs:221` | the client's own draft (`mine`), whose marital status is what the client sees |
| Office's form | `office-views.mjs:421` (lead), its `renderQuestion` calls | the office draft |
| Staff panel | `staff-views.mjs:744–787` (`answerRows`, `answersPanelV2`) | `serverAnswersV2(record)`, added to the `options` it already passes |
| Draft 13614-C | `draft-form.mjs:301` (`generalWording`, used by `notSureLabels`) | the draft's visible answers |

Group field labels (`hh.*`) carry no spouse text, so they don't change.

### D6: Wording (user's decision Q4, Q5)

The exact unmarried texts are in `brainstorm.md`, Q4. The senior married leads become:
- 2025 年，您或您爱人是否有以下收入？
- 2025 年，您或您爱人是否支付过以下费用？
- 2025 年，您或您爱人是否发生过以下事项？

The Chinese stays open to the group's wording review.

### D7: The direct-deposit card's hint
- **Choice:**
  - two `CARD_TEMPLATES` entries: `bank_hint` (married, today's text) and `bank_hint_single`:
    - "The account must be in your name."
    - 账户必须是您名下的账户。
    - office: "The account must be in the client's name."
  - the bank rule (`document-cards.mjs:472`) drops its rule-level `hint`. Each of its match entries carries `hint: isMarried(a) ? bank_hint : bank_hint_single`, the way the W-2 spouse cards carry `spouseHint` (`:171`).
- **Why:** the user's decision at the planning review. The card's hint is computed from the answers each time, so nothing is stored and there's no database change. `isMarried` means the same as `spouseShown` (D3), and 繁體 picks up the new `CARD_TEMPLATES` pair through `walkPairs`.
- **Considered:** reading `spouseShown` in `document-cards.mjs`. That rewires a module this change otherwise leaves alone, for the same answer.

### D8: The "who" questions for an unmarried client (Q8)
- **Wording:** Q5.3–Q5.9 get `wordingUnmarried` through the D2 `> Not married:` line, with the Q8 table's texts in each version. The D2 spouse check passes, because each question's senior Chinese names 爱人. Q8.1 and Q8.3 keep their wording.
- **Options and control:** when `!spouseShown(answers)`, a `who` question renders its two shown options, `me` and `none`, as radio buttons. They're labelled with the yes/no labels: `me` reads `fixedOptions.yesno` "yes" (Yes / 是), and `none` reads "no" (No / 否). One helper, `asAloneOption(option)`, picks the label, and `shownOptions` and `labelOf` use it. `labelOf` maps only when it's given the application's answers (`options.answers`), so catalogue-level `formatAnswer` calls keep Me / No one.
- **Reading back:** a radio gives one string. `valuesFromControls` wraps a `who` question's string as a list (`"me"` → `["me"]`), so the draft, the checks and the database see the same value as before.
- **Screens:** `formatAnswer` gets the answers wherever D5 already passes them (summary, staff panel), and also in the office's part summary (`office-views.mjs:402`). The cards' "Asked by:" lines pass them too:
  - the office's card: `docCard(card, { …, answers })` from `office-views.mjs:456`;
  - the staff checklist: `checklistRow(card, { …, answers })` from `staff-views.mjs:972`.
- **Married clients** keep the check boxes, Me / My spouse / No one, and today's wording.
- **Considered:** new `yes`/`no` answer values. That would change the database rules, the cards and the draft for no gain.

### D9: Specs
- `client-intake`: ADDED, "An unmarried client answers the 'who' questions with Yes or No" (D8). Its scenarios cover the citizenship question in English and Chinese, a married client, Section 8, and staff.
- `client-intake`: ADDED, "An unmarried client isn't asked about a spouse", which also covers the direct-deposit card (D7). It has scenarios for:
  - never married;
  - married;
  - unanswered;
  - the leads;
  - the direct-deposit card, unmarried and married, including the office's version;
  - staff and the office seeing the client's wording.
- `draft-13614c`: ADDED, "The draft's not-sure lines quote the wording the client saw".

## Risks / Trade-offs

- **[Risk] A call site misses the answers and shows the spouse wording to an unmarried client.** → Mitigation: a unit test per screen in D5 with a never-married application, and the story's never-married walk.
- **[Risk] The compare table's two answer sets disagree about marital status.** → Mitigation: it uses the client's own draft, which matches the form they're looking at.
- **[Risk] The shared test stack runs ahead of `main` once 025 is applied.** `main`'s "the field table matches the catalogue" would fail until this merges, as with 023 and 024. → Mitigation: say so when asking to apply, and in the PR.
  - 025 changes only text. The field rows are unchanged, so in practice the test may still pass on `main`. Check, and say which.
- **[Risk] A "who" radio's single value could slip through as a string.** `checkValue` would call it invalid, and the save would quietly withhold it. → Mitigation: `valuesFromControls` wraps it as a list (D8), and a unit test reads two radio descriptors back as `["me"]`.
- **[Risk] The 繁體 output drifts.** → Mitigation: CI runs `npm run build:hant -- --check`.
- **[Trade-off] `document-cards.mjs` keeps its own `isMarried`, which D7 reuses.** Accepted, because it means the same as `spouseShown`.

## Migration Plan

- **025 is regenerated in place (user's choice A1).** The first 025 (`5234cc6a`) was applied only to `vitally-task2` and never reached `main`. Steps:
  1. delete its file and rebuild, which writes a new `025_intake_catalogue_<hash8>.sql`;
  2. review and dry-run the new file;
  3. delete the old row from `vitally_private.schema_migrations` on `vitally-task2`;
  4. apply.

- **Deploy:** `npm run db:migrate` applies `025_intake_catalogue_<hash8>.sql`, a catalogue reload with the same field rows. It's safe with drafts in progress.
- **Rollback:** a later catalogue migration. Applied migrations are never edited.
- **Verify:** after `db:migrate:test` (with the user's OK), `npm run test:database` passes.

## Open Questions

- The group's wording review may adjust the new Chinese. It doesn't block this change.
