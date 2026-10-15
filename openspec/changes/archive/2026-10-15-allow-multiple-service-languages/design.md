## Context

**Today:**
- **The question.** Q0.3 `language` is a required single choice (`english`, `cantonese`, `mandarin`, `other`). Q0.4 `language_other` is text, shown if `language = other`. The answer is a string code in `cases.answers`.
- **Who reads it.** Three staff tables show and filter on that one value through `languageLabel` (`src/intake-catalogue.mjs`), and the client's progress page shows it:
  - the work board (`src/staff-views.mjs`);
  - the case pool (`src/pool-views.mjs`);
  - Follow-ups, the office queue (`src/office-views.mjs`). It falls back to the help request's free-text `assistance_items.language`.
- **Labels and filter values.** Filters compare labels, not codes, so a saved filter or a version-1 label ("Cantonese") still matches.
- **Generic machinery.** The catalogue already supports multi-select (`best_contact_time`), and show-if conditions already test array membership, in both the JS `holds` and the SQL `intake_holds`. The intake form, the summaries and the staff answers panel render any question generically.
- **Not involved:**
  - the draft 13614-C, which has no service-language field;
  - SQL, which never reads the answer;
  - the seeded samples, which come from `fixture_answers_v2` in migration 019 and write only a preferred language.

**Planned admin screens** (Stitch `admin-dashboard-v2-assign.png`): an Office overview groups unclaimed cases by language, and an Assign menu suggests volunteers who speak the client's language. They aren't built yet, and volunteers have no recorded languages.

**Stakeholders.** Clients answer in English, 简体 or 繁體. Staff read English-only tables. The group reviews the wording.

## Goals / Non-Goals

**Goals:**
- A client names a preferred language (unchanged) and, optionally, any others, with a typed name for Other.
- Every staff table shows all of a client's languages, preferred first, as letters, with the full names on hover and for screen readers.
- The language filters match any language the client speaks.
- The client's progress page lists every language by full name.
- One shared helper for all of this, so the planned dashboard reuses it.

**Non-Goals:**
- the Office overview dashboard;
- Assign;
- volunteer languages;
- other table-header changes, which the user will specify later;
- the seeded samples;
- rewriting stored answers;
- the draft 13614-C.

## Decisions

### D1: Keep Q0.3 and add an optional follow-up (brainstorm Q1)
- **Choice:**
  - Q0.3 stays a required single choice, the preferred language.
  - New Q0.5 `language_also`: multi-select, optional, the same four options.
  - New Q0.6 `language_also_other`: text, optional, `**Show if** \`language_also = other\``.
  - Both drafts get them at the end of section 0, after Q0.4, with the same wording.
  - `tools/build-intake-catalogue.mjs` adds both ids to `before.language`'s question list.
  - `npm run build:intake` regenerates the catalogue and writes migration `026_intake_catalogue_<hash8>.sql`, which loads two new fields into `intake_fields`.
- **Why:**
  - It keeps the preference that "prefers Cantonese, also understands Mandarin" depends on.
  - It is additive: stored answers, the server's value check for `language`, the seeds and every existing reader stay valid.
- **Alternatives considered:** turning Q0.3 into a multi-select. Rejected because:
  - the preference would be lost;
  - every stored string would need a rewrite (no migration has ever rewritten answers) or lenient readers;
  - a pre-change draft's string would become an invalid answer that closes the review gate.

### D2: A separate "Other" box for the follow-up (brainstorm Q5)
- **Choice:** Q0.6 is its own text field.
- **Why:**
  - Show-if conditions combine only with AND, so Q0.4 can't open for "Q0.3 is Other OR Q0.5 includes Other".
  - A client who prefers Cantonese and also speaks Vietnamese needs somewhere to say so.
- **Alternatives considered:**
  - leaving Other out of Q0.5. Rejected: it would lose a language the client speaks;
  - adding OR to show-if. Rejected: it would change the catalogue format and the SQL `intake_visible`.

### D3: One data helper, `clientLanguages(answers)` (brainstorm I1)
- **Choice:** `src/intake-catalogue.mjs` exports the helpers below. Each `entry` is `{ code, label, text }`.

  ```
  clientLanguages(answers) -> [entry, ...]
  languageLetters(entries) -> "C, M, O"
  languageNames(entries, { lang = "en", preferred = false, separator = ", " }) -> string
  speaksLanguage(entries, chosen) -> boolean    // chosen = "all" or a label
  languageFilterLabels(listOfEntryLists) -> sorted unique labels
  languageSummary(entries) -> { letters, names, labels }   // the staff form, for languageCell
  ```

  - **Order:** the preferred `language` first, then `language_also` in option order. Repeats are dropped: the same code with the same text.
  - **`text`:** for `other`, `text` is `language_other` (preferred) or `language_also_other` (also), trimmed, and empty when nothing was typed.
  - **Legacy input:**
    - A string that isn't a code but matches an English option label (a version-1 answer, or a help request's "Cantonese") maps back to that code.
    - Any other non-empty string becomes `other`, with that string as its text.
    - A missing or empty preferred language gives no entry.
  - **`languageNames` for staff** (`preferred: true`) reads "Cantonese (preferred), Mandarin, Other: Vietnamese". It joins with ", " and appends "(preferred)" to the first entry.
  - **`languageNames` for clients** (`preferred: false`) reads "Cantonese, Mandarin, Vietnamese". Other shows the typed text, or "Other" when nothing was typed. It uses each label in `lang` and joins with the `separator` the caller passes. The progress page passes `form.list_separator` (", " / "、"), which keeps `intake-catalogue.mjs` free of a `client-text.mjs` import.
  - **Letters:** `english` E, `cantonese` C, `mandarin` M, `other` O, in one frozen table.
  - **`speaksLanguage`:** true when `chosen` is "all", or when any entry's English label equals `languageLabel(chosen)`. A saved filter value is a label and goes through the same lookup, as today.
- **Why:**
  - Every table, filter and the progress page agree on one rule.
  - The planned dashboard can group by `entries[0]` and match on all of them.
- **Alternatives considered:** per-view code. Rejected: three copies of the same order, dedupe and legacy rules.

### D4: One cell helper, `languageCell({ letters, names, labels })` in `src/ui.mjs` (brainstorm Q4, Q8.2)
- **Choice:**
  - `src/ui.mjs` exports `languageCell({ letters, names, labels })`, which returns the cell's inner HTML:

    ```html
    <span class="language-letters" title="Cantonese (preferred), Mandarin" data-languages="Cantonese|Mandarin">
      <span aria-hidden="true">C, M</span>
      <span class="sr-only">Cantonese (preferred), Mandarin</span>
    </span>
    ```

  - With no entries, it is `—`, as today.
  - Each view passes `languageSummary(clientLanguages(answers))` (`ui.mjs` stays free of catalogue imports).
  - Every attribute is escaped.
- **Why:**
  - The letters stay short, and sighted staff get the names on hover.
  - Screen readers hear the names, not "C comma M".
  - `data-languages` lets tests and the story read a row's languages without parsing letters.
- **Alternatives considered:** `<abbr title>`. Rejected: inconsistent screen-reader support, and it doesn't cover a list.

### D5: Filters match any language (brainstorm Q6, Q8.4)
- **Choice:**
  - **Matching:** the work board's `inLanguageAndService`, the pool's `filterPool` and Follow-ups' `inLanguage` use `speaksLanguage(clientLanguages(answers), chosen)`.
  - **Option lists:** the work board's `valueOptions(cases, "language", …)`, the pool's, and Follow-ups' chip list list the union of labels (`languageFilterLabels`), sorted, as full names.
  - **Unchanged:** the filter state, a label string, and its keys (`language`, `poolLanguage`). Saved filters keep working.
  - **Counts:** chip counts count a client under each language they speak.
- **Why:** a volunteer finds every client they can help, and what the filter finds agrees with what the row shows.
- **Alternatives considered:** matching the preferred language only. Rejected, because it hides exactly the clients the change is for.

### D6: Follow-ups rows without a case (brainstorm Q8.3)
- **Choice:**
  - Follow-ups' `rowLanguage` becomes the row's entries:
    - `clientLanguages(row.record.answers)` when that gives any language (the preferred one, or only Q0.5's if the preferred is somehow empty);
    - otherwise `clientLanguages({ language: row.item?.language })`.
  - So the help request's free text follows D3's legacy rule. A known name maps to its letter, and anything else is "O" with the text on hover.
- **Why:** it is the same rule as cases, and needs no new column.

### D7: The progress page (brainstorm Q8.1, I3)
- **Choice:**
  - `progressScreen`'s Language row shows `languageNames(clientLanguages(answers), { lang })`.
  - The row label `progress.language` stays as it is.
- **Why:** clients see full names in their own language, never letters.

### D8: The Fill (brainstorm Q7)
- **Choice:** `versionTwoAnswers` in `src/sample-data.mjs` adds `language_also: ["mandarin"]`. `language` stays `"english"`.
- **Why:**
  - The demo and the story show a multi-language row (`E, M`).
  - It needs no seed migration.

### D9: Specs
- **Choice:** ADDED requirements only:
  - in `client-intake`: the other-languages questions, and the progress page;
  - in `staff-case-work`: the table cells, and the filters.
- At archive, broaden `staff-case-work`'s Purpose, which today is about the masked phone, to cover how staff tables show and filter a client's languages. Also extend `client-intake`'s Purpose with the client's service languages.

## Risks / Trade-offs

- **[Risk] Server and client must both know the new fields.**
  - The Fill and the story save `language_also`, and the server refuses unknown or ill-typed fields until 026 is applied.
  - → Mitigation: apply 026 to `vitally-task2` (with the user's OK) before `test:database` and `test:browser`. The plan names this step for the controller.
- **[Risk] The sample answers change.** `makeSampleAnswers` now has a seventh section-0 answer, so many unit tests' renders (the summaries, the staff answers panel, the Chinese sweep) show one more row.
  - → Mitigation: those tests check what they render; fix any exact counts. Never weaken an assertion.
- **[Risk] The story reads the Follow-ups Language cell's text** to find a language with no rows of a kind (`browser.mjs`, around line 1351).
  - With letters plus screen-reader text, `textContent` no longer equals a chip's label.
  - → Mitigation: read `data-languages` and test membership instead.
- **[Trade-off] Free-text help-request languages now read as Other.** A Follow-ups help request with no case whose language is free text other than English, Cantonese or Mandarin (for example "Polish") used to get its own chip. It now groups under the "Other" chip and shows "O", with the text on hover. A saved filter of that text matches nothing until cleared. → Accepted: one rule for cases and requests (D6). The seeded requests say "Cantonese" or "Mandarin", so the demo is unaffected.
- **[Trade-off] Counts over-add.** Language chip counts can sum to more than the number of cases. → Accepted: it follows the decision to match any language.
- **[Trade-off] The wording is provisional** until the group's wording review. → Text only.

## Migration Plan

- **026 is generated** by `npm run build:intake` and adds the two fields.
  - It must not be edited after it's applied.
  - Before applying it, the controller dry-runs it in `begin … rollback` against `vitally-task2`, and applies it only after the user's OK.
- **No data migration.** Existing answers lack `language_also` and keep working.
- **Rollback:** a later catalogue migration without the two fields. Stored `language_also` values would then be ignored, because nothing reads them except the new helpers.

## Open Questions

- **The wording** of Q0.5, its tip and the Chinese. Owner: the group's wording review. Text only.
