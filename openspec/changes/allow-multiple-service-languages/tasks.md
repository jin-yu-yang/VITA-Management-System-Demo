## 1. The catalogue: Q0.5 and Q0.6 (design D1, D2; plan Task 1)

- [x] 1.1 Tests first:
  - `tests/intake-build.test.mjs`:
    - `language_also` is optional multi-select, with Q0.3's values and labels;
    - `language_also_other` is optional text, shown if `language_also = other`;
    - both are in the optional-ids list.
  - `tests/intake-catalogue.test.mjs`: `before.language` holds language, language_other, language_also and language_also_other, in that order.
  - `tests/support/intake-value-cases.mjs`: `language_also` cases (a list valid; a string and an unknown code invalid).

  See them fail.
- [x] 1.2 Edit both drafts:
  - add Q0.5 and Q0.6, with the exact wording from brainstorm Q5;
  - update the Q0.2 developer note.

  Add the two ids to `before.language` in `tools/build-intake-catalogue.mjs`.
- [x] 1.3 Run `npm run build:intake`, which writes `src/intake-catalogue-data.mjs` and `026_intake_catalogue_<hash8>.sql`, and `npm run build:hant`. `npm test` passes. Don't apply 026.

## 2. The language helpers (design D3, D4; plan Task 2)

- [x] 2.1 Unit tests first, in `tests/intake-catalogue.test.mjs` and `tests/ui.test.mjs`:
  - `clientLanguages`: order, no repeats, typed text for Other, legacy labels, and free text;
  - `languageLetters`;
  - `languageNames`: the staff form and the client form in Chinese;
  - `speaksLanguage`;
  - `languageFilterLabels`;
  - `languageSummary`;
  - `languageCell`: markup, escaping, and the "—" for none.
- [x] 2.2 Implement them in `src/intake-catalogue.mjs` and `src/ui.mjs`.

## 3. The staff tables and filters (design D5, D6; plan Task 3)

- [x] 3.1 Tests first, in `tests/staff-views.test.mjs`, `tests/pool-views.test.mjs` and `tests/office-views.test.mjs`:
  - each table's cell for a two-language client and for Other;
  - each filter matches a second language;
  - the options list second languages;
  - a Follow-ups help request without a case;
  - update the existing cell and label assertions.
- [x] 3.2 Use the helpers in the work board (`inLanguageAndService`, `valueOptions`, the row), the pool (`filterPool`, its options, the row) and Follow-ups (`rowLanguage`, `inLanguage`, the chips, the cell).

## 4. The progress page and the Fill (design D7, D8; plan Task 4)

- [ ] 4.1 Tests first:
  - `tests/client-views.test.mjs`: the progress row, in English and in Chinese with a typed language;
  - `tests/sample-data.test.mjs`: the Fill answers `language_also: ["mandarin"]`, and it passes `checkValue`;
  - `tests/draft-form.test.mjs`: the draft 13614-C never shows `language_also` or `language_also_other`.
- [ ] 4.2 The progress row uses `languageNames`, and `versionTwoAnswers` adds `language_also`. Fix the tests whose renders now show the extra answer, without weakening any assertion. `npm test` passes.

## 5. Migration 026 on the test stack, and the story (plan Task 5)

- [ ] 5.1 The controller dry-runs 026 in `begin … rollback` on `vitally-task2`, and applies it with `npm run db:migrate:test` after the user's OK. Then `npm run test:database` passes.
- [ ] 5.2 In the story:
  - the Follow-ups empty-state search reads the cells' `data-languages`;
  - the new application's staff row shows `E, M`, with `data-languages` "English|Mandarin" and the names on hover.

  The controller runs `npm run test:browser`, and it passes.

## 6. Docs and the full check (plan Task 6)

- [ ] 6.1 Add migration 026 to the migration list and range in:
  - `docs/developer/database.md`;
  - `docs/setup.md`;
  - `docs/developer/README.md`;
  - `README.md`.

  Update the unit count, and the database count if it changed. Add the language helpers to `docs/developer/frontend.md`.
- [ ] 6.2 Final checks:
  - `npm test`;
  - `npm run build:hant -- --check`;
  - `npm run build:intake` leaves nothing to commit;
  - `npx openspec validate --all`.

  `test:auth-browser` isn't needed: no sign-in change.
