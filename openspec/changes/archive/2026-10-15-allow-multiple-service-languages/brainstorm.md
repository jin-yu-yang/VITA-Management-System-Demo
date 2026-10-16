# Brainstorm: allow-multiple-service-languages

A raw capture of the design agreed in the conversation on 2026-10-14 and 2026-10-15, during CLAUDE.md lifecycle step 2 (`/opsx:explore` and the brainstorm). The code facts below come from `main` at 8ec6b08.

## Background

- **The user's review** of the intake screen (2026-10-13) became four OpenSpec changes. This is the last of them:
  1. `require-15080-signatures-and-household-middle-name`: merged as #65, migration 024.
  2. `add-unmarried-intake-wording`: merged as #67, migration 025.
  3. `gate-review-and-redesign-summary`: merged as #69, no migration.
  4. **This change.**
- **The request**, recorded in #65's brainstorm, was: "a client who prefers Cantonese and also understands Mandarin can be given a Mandarin-speaking volunteer. It should be multi-select, and probably reworded."
- **Today's question.** Q0.3 `language` ("Preferred service language / 首选服务语言") is a single choice and required. It offers `english`, `cantonese`, `mandarin` and `other`. Q0.4 `language_other` ("Please specify") is text, shown if `language = other`. Both drafts carry the same wording. The answer is a string code in `cases.answers`.
- **Who reads it** (impact inventory, 2026-10-14):
  - **The three staff tables.** Each Language column shows `languageLabel(answers.language)`, one label, and the language filters compare one label to one value:
    - the work board (`src/staff-views.mjs`: `inLanguageAndService`, `valueOptions`, the row cell, chips);
    - the case pool (`src/pool-views.mjs`: `matchesValue`/`filterPool`, `valueOptions`, the row cell, the `poolLanguage` select);
    - Follow-ups, the office queue (`src/office-views.mjs`: `rowLanguage`/`inLanguage`, chips, the cell). It falls back to the help request's own free-text `assistance_items.language` when a row has no case.
  - **The client's progress page** (`src/client-views.mjs`) shows `languageLabel(answers.language, lang)`.
  - **Everything else is generic or doesn't read it:**
    - the intake form, the review summary, the staff answers panel and the office's Add a case all render and format any question from the catalogue;
    - the draft 13614-C has no service-language field (`draft-form.mjs` deliberately leaves Q0.2–Q0.4 out);
    - Q8.1 `irs_language_pref` (the language of IRS letters) is a separate question;
    - no SQL reads `answers.language`;
    - the seeded samples (`fixture_answers_v2`, migration 019) write a preferred language only.
- **The planned admin screens** (Stitch `.stitch/designs/admin-dashboard-v2-assign.png`, checked with the user):
  - the sidebar has an "Office · Admin" group: Office overview, Follow-ups, People, Post an update, Season settings;
  - the work board stays in the main nav for everyone;
  - the case pool opens from the Office overview's "Open case pool" button (today it is the "All cases" sidebar link);
  - the overview groups unclaimed cases by language, has an "Unclaimed by language" panel, and has an Assign menu that suggests volunteers who speak the client's language ("Speaks Cantonese").
  - None of this exists yet, and volunteers have no languages recorded anywhere.

## Decision chain

**Q1. One multi-select question, or keep the preferred language and add a follow-up?**
- Options:
  - A: Q0.3 becomes multi-select. The stored answer becomes an array: every stored string must be rewritten or tolerated, and the preference is lost.
  - B: keep Q0.3 as the preferred language, and add an optional multi-select follow-up. This is additive.
- **Decision: B.** It keeps "prefers Cantonese" and changes nothing about stored answers, the seeds or the server check.

**Q2. What the tables show.**
- The user: the table headers (the case pool, and the planned dashboard) should show ALL the languages the client speaks, not just the preferred one, using abbreviations: English = E, Mandarin = M, Cantonese = C.
- More table-header changes will come later. They are out of scope here.

**Q3. Which tables, and in what order.**
- **Decision: all three tables** (the work board, the case pool and Follow-ups), **with the preferred language first.**
- The display rule is built as one shared helper, so the planned Office overview and any later table reuse it.

**Q4. How "Other" shows in a cell.**
- Options:
  - A: "O", with the full text on hover and for screen readers.
  - B: the typed name in full.
- **Decision: A.**

**Q5. The new question's shape.**
- Show-if conditions combine only with AND, so the existing Q0.4 can't also open for the follow-up's Other.
- **Decision:** Q0.5 `language_also` (multi-select, optional), offering English, Cantonese, Mandarin and Other, and its own **Q0.6 `language_also_other`** (text, optional, shown if `language_also = other`).
  - Both go at the end of the Language sub-step, so nothing is renumbered.
  - The user: "keep Q0.6 for Other".
- Wording (the same in the standard and senior drafts, as Q0.3's is):
  - Q0.5: "Any other languages we can help you in?" / 我们还可以用哪些语言为您服务？
  - Q0.5 tip: "Choose all that apply. Leave this blank if only your preferred language works for you." / 可多选。如果只能使用首选语言，请留空。
  - Options: English / 英语 · Cantonese / 粤语 · Mandarin / 普通话 · Other / 其他 (the same labels as Q0.3).
  - Q0.6: "Please specify" / 请说明 (the same as Q0.4).
  - All of it goes to the group's wording review, the Chinese especially.
- If a client ticks their preferred language again in Q0.5, it is quietly not shown twice. It is not an error, and no option is hidden.

**Q6. The language filters.**
- Options:
  - A: match any language the client speaks.
  - B: match the preferred language only.
- **Decision: A.** "Mandarin" finds a client who prefers Cantonese and also speaks Mandarin.
  - A client is counted under every language they speak, so the chip counts can add up to more than the number of cases.
  - The filter options are the union of every language, preferred and other.
  - Grouping by the preferred language (the Office overview design) is a separate rule for the dashboard, when it is built.

**Q7. Samples and the Fill.**
- Options:
  - A: give the seeded samples a second language. That needs a hand-written migration replacing `fixture_answers_v2`.
  - B: leave the samples alone.
- **Decision: B, plus the Fill.** "Fill fictional details" (`src/sample-data.mjs`, plain JavaScript) answers `language: "english"` and `language_also: ["mandarin"]`.
- The only migration is the generated catalogue one, 026. The browser story's own application is filled this way, so the story can check `E, M` on a real staff row.

**Q8. Defaults the user confirmed.**
1. **The client's progress page** lists every language by its full name, preferred first, in the screen language: "Cantonese, Mandarin" / "粤语、普通话". There are no letters on client screens.
2. **The cell markup.** The letters are visible with a hover tooltip, and screen readers get the full sentence instead of the letters.
3. **Follow-ups rows without a case** use the help request's free-text language. Known names (English, Cantonese, Mandarin) map to their letters, and anything else shows "O" with the text on hover.
4. **The filter options** are listed by full name ("Mandarin"), not by letter.

**Q9. Scope and checks.**
- **In:**
  - the two new questions in both drafts and the generated catalogue (migration 026);
  - the shared helpers;
  - the three tables' cells and filters;
  - the progress page;
  - the Fill;
  - the developer note in the drafts;
  - docs.
- **Out:**
  - the seeded samples;
  - stored answers (no rewrite);
  - the draft 13614-C;
  - the Office overview dashboard;
  - Assign and volunteer languages;
  - other table-header changes the user will specify later.
- **Specs:** a delta to `client-intake` for the new questions and the progress page, and a delta to `staff-case-work` for the table cells and filters.
- **Checks:**
  - `npm test`;
  - `npm run build:hant -- --check`;
  - `npm run build:intake`, then commit 026;
  - apply 026 to `vitally-task2` (with the user's OK), then `npm run test:database`, because the catalogue migration changes the field table;
  - `npm run test:browser`;
  - CI.
  - `test:auth-browser` isn't needed: no sign-in change.

## Implementation decisions found while planning

**I1. One data helper and one cell helper.**
- `src/intake-catalogue.mjs`, next to `languageLabel`, gets `clientLanguages(answers)`.
  - It returns the client's languages in order: the preferred one, then `language_also` in option order.
  - Each entry is `{ code, label, text }`. `text` is the typed name for `other`, from `language_other` or `language_also_other`.
  - Repeats are dropped: the same code with the same text.
  - A legacy label string such as "Cantonese" (a version-1 value, or a saved help-request language) maps back to its code through the English labels. Any other string becomes `other`, with that string as its text.
- Built on it:
  - `languageLetters(entries)`, for example "C, M, O";
  - `languageNames(entries, { lang, preferred })`, for example "Cantonese (preferred), Mandarin, Other: Vietnamese" for staff, or "Cantonese, Mandarin, Vietnamese" for clients;
  - `speaksLanguage(entries, chosen)` for the filters.
- `src/ui.mjs` gets `languageCell(letters, names, labels)`. It returns the cell's inner HTML: the letters visible and `aria-hidden`, a `title` with the names, an `.sr-only` copy of the names, and `data-languages` holding the full labels joined by `|`.
  - `data-languages` lets the story and the tests read which languages a row has without parsing letters.
- The three tables call `languageCell(...)`. The filters call `speaksLanguage`. `valueOptions` lists the union of labels.

**I2. Letters.** Staff screens are English only. The letters are `english` E, `cantonese` C, `mandarin` M and `other` O, kept in one table next to the helper.

**I3. The progress page shows the typed name for Other** ("Cantonese, Vietnamese"), and "Other" only when nothing was typed. The client wrote it, so it reads naturally in either language. It uses `form.list_separator` (", " / "、"). The row's label `progress.language` stays as it is.

**I4. The builder's sub-step list.** `tools/build-intake-catalogue.mjs` names `before.language`'s questions explicitly ("language language_other"). The two new ids must be added there too, and its tests updated.

**I5. The drafts' developer note** (Q0.2) now says that Q0.2–Q0.6 hold the `service`, `language` and `language_also` answers the staff tables filter and display. It also says Q0.5 is new and Q0.3 remains the preferred language.

**I6. No data migration, and no change to the old answers.** Existing drafts and cases have no `language_also`. Their cells show the preferred letter only, and the filters behave as before.

## Open questions

- **The wording** of Q0.5, its tip and the Chinese. Owner: the group's wording review. Text only; no behaviour depends on it.
