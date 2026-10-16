## 1. The show-if language and year ranges in the browser (design D1, D3; plan Task 1)

- [x] 1.1 Tests first, in `tests/intake-catalogue.test.mjs`:
  - `isVisible` with `gte` and `lte` (unanswered, non-numeric, below, equal, above) and `any` (no group holds, one holds, nested AND in a group);
  - `checkValue` for a year with `min`/`max`, plus the Chinese `invalidText`.

  See them fail.
- [x] 1.2 Implement:
  - in `src/intake-catalogue.mjs`, `holds` gains `gte`, `lte` and `any`, and `checkValue` gains the `year` range;
  - in `src/intake-form.mjs`, `DRIVERS` recurses into `any`, and `invalidText` handles the year-range message;
  - in `src/client-text.mjs`, add `invalid.year_range`.

  Run `npm run build:hant`. `npm test` passes.

## 2. The database migration (design D1, D3, D4; plan Task 2)

- [x] 2.1 Write `supabase/migrations/027_intake_show_if_any_and_year_range.sql`. It defines:
  - `intake_show_if_ok`, new and recursive;
  - `intake_holds`, from 011, plus `gte`, `lte` and `any`;
  - `put_intake_field`, from 015, now using `intake_show_if_ok`;
  - `check_intake_value`, from 015, plus the year range;
  - the closing `revoke`.
- [x] 2.2 In `tests/database-intake.mjs`, add `intake_holds` parity cases with literal show-if JSON (`gte`, `lte`, `any`, nested), compared with JS `isVisible`. Also add loader refusal cases (an unknown op, an empty `any`, a non-number `gte` value). The controller runs them in Task 5.

## 3. The named rules, the drafts and the catalogue (design D2, D3, D5; plan Task 3)

- [x] 3.1 Tests first:
  - `tests/intake-build.test.mjs`:
    - the `rule` clause expands, combines with AND, and fails on an unknown name;
    - `Year n–m` sets `min`/`max`, and the build fails when `spouse_death_year`'s range doesn't end at the tax year;
    - the real catalogue's spouse show-ifs, `rules`, `spouseShowIf` = J, `about.spouse.titleWidowed`, and `spouse_death_year` 1900–2025.
  - `tests/intake-catalogue.test.mjs`: `spouseShown` (J) and `spouseOnReturn` (S) across married, and widowed with 2022, 2023, 2024, 2025 or 2205, unanswered, or "abcd"; `substepTitleOf`; `missingToSubmit` for a recent death.
  - `tests/client-views.test.mjs`: the 2025 and 2023 wages leads and Q5.3 (J's wording).
  - `tests/draft-form.test.mjs`: a 2025 death's not-sure line quotes the wording with the spouse.
  - `tests/support/intake-value-cases.mjs`: year-range rows.

  See them fail.
- [x] 3.2 Builder: `RULES`, the `rule` clause, `Year n–m`, `titleWidowed`, the `rules` export, and `spouseShowIf` = `RULES.joint_possible`. In `src/intake-catalogue.mjs`: `spouseShown` (J), `spouseOnReturn` (S) and `substepTitleOf`.
- [x] 3.3 Both drafts:
  - the `sp_*` names and DOB use rule `spouse_on_return`;
  - `sp_job_title` and `opt_race_sp` use rule `joint_possible`;
  - `spouse_death_year` becomes `Year 1900–2025`.

  `sp_phone`, `gcf_sp_*` and `married_last_day`/`lived_apart_last_6mo` are unchanged. Run `npm run build:intake` (028) and `npm run build:hant`, and update the drivers pin (`spouse_death_year` joins `gcf_sp_signature`). Add the database visibility cases for the widowed rules. `npm test` passes. Don't apply anything.

## 4. Everything that reads the rules (design D5, D6, D7; plan Task 4)

- [x] 4.1 Tests first:
  - `tests/document-cards.test.mjs`:
    - widowed 2025: spouse Photo ID and SSN cards, the "For you and your spouse" owner line, `bank_hint_late`;
    - widowed 2024: none of them, and the single bank hint;
    - custody offered to a widowed 2025 client.
  - `tests/controller.test.mjs`: changing the death year from 2025 to 2020 drops "spouse" from the who answers; a partly typed or cleared year, a move's sweep with an unchanged marital status, then 2025 again, keep it.
  - `tests/draft-form.test.mjs`: the spouse lines for 2025 versus 2024, with the widowed box and year.
  - `tests/client-views.test.mjs`: the rail and header read "Your late spouse" for a widowed client.
  - `tests/office-views.test.mjs` and `tests/staff-views.test.mjs`: the late-spouse title on Add a case and the answers panel.
- [x] 4.2 Implement:
  - the title callers (`intake-views.mjs`, `office-views.mjs`, `staff-views.mjs`) use `substepTitleOf` with the application's answers;
  - `document-cards.mjs`: J, the late bank hint, and the custody card's plain married test;
  - `controller.mjs`: the `clearSpouse` trigger (a changed marital status, or a whole valid year);
  - `app.mjs`: the Fill uses `spouseOnReturn`, and a driver's `change` redraws when the sub-steps the page lists differ from the draft's (brainstorm I11; the story checks it);
  - `draft-form.mjs`: the spouse lines follow J.

  `npm test` passes.

## 5. The test stack and the story (plan Task 5)

- [x] 5.1 The controller dry-runs 027 and 028 together in `begin … rollback` on `vitally-task2`, applies them with `npm run db:migrate:test` after the user's OK, and runs `npm run test:database`.
- [x] 5.2 In the story's show-if segment:
  - a widowed client with 2025 sees "Your late spouse", with the job title and no phone;
  - the rail lists "Your late spouse" right after the year field is left, before any move;
  - with 2015, the sub-step is gone;
  - then married, as today.

  The controller runs `npm run test:browser`.

## 6. Docs and the full check (plan Task 6)

- [x] 6.1 Docs:
  - `docs/developer/frontend.md`: the show-if grammar (`gte`, `lte`, `any`, `rule`), the two rules and the late-spouse title;
  - `docs/developer/database.md` and `docs/setup.md`: migrations 027–028, the ranges 001–028, the counts (including spelled-out numbers);
  - `docs/developer/README.md` and `README.md`: the ranges and the unit count.
- [x] 6.2 Final checks:
  - `npm test`;
  - `npm run build:hant -- --check`;
  - `npm run build:intake` leaves nothing to commit;
  - `npx openspec validate --all`.

  `test:auth-browser` isn't needed: no sign-in change.
