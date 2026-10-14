## 1. The catalogue drafts and the generated catalogue

- [x] 1.1 Build tests first (`tests/intake-build.test.mjs`):
  - the real catalogue's `hh` fields are `member_id, first_name, middle_name, last_name, …`, with `middle_name` a text field, optional, with no show-if;
  - `gcf_tp_signature` and `gcf_sp_signature` are `required: true`, with their show-if rules unchanged;
  - `gcf_sp_signature` has the new tip in both versions;
  - `gcf_consent`, `gcf_tp_date` and `gcf_sp_date` stay optional.

  Run them and see them fail.
- [x] 1.2 Edit `docs/intake-questions/intake-questions.md`:
  - add Q6.1a `hh[i].middle_name` · Text · Optional after Q6.1, with the design D5 wording and tip;
  - set Q14.2 and Q14.4 to `Required`;
  - add the D2 tip under Q14.4.
- [x] 1.3 Edit `docs/intake-questions/intake-questions-senior-v2.md` the same way, with D5's and D2's senior wording. Its structure must equal the standard draft's.
- [x] 1.4 Check that `main` has no migration numbered 024. Run `npm run build:intake`: it writes `src/intake-catalogue-data.mjs` and `supabase/migrations/024_intake_catalogue_<hash8>.sql`. Run `npm run build:hant` and keep `src/zh-hant.mjs`. The build tests pass.

## 2. Required signatures: the browser and the database agree

- [x] 2.1 Unit tests (`tests/intake-catalogue.test.mjs`) for `missingToSubmit`:
  - consent yes with no primary signature lists `gcf_tp_signature`;
  - married, consent yes, primary signed, no spouse signature lists `gcf_sp_signature`;
  - not married, consent yes, primary signed: nothing from section 14;
  - consent no, or consent unanswered: nothing from section 14.

  Also: the Form 15080 sub-step's "done" mark is false while a required signature is missing, and true once both are there (`tests/intake-form.test.mjs`, `substepStatus`).
- [x] 2.2 Database tests (`tests/database-intake.mjs`):
  - add these answer sets to the `intake_missing` parity loop: consent yes, unsigned; married and consent yes, primary only; consent no; a household member without a middle name;
  - `act_submit` refuses (VT007) a client application with consent yes and no primary signature, and a married one without the spouse's;
  - it accepts one with consent declined, and one with both signatures;
  - an office-filled (assisted) application with consent yes and no primary signature is refused the same way;
  - `SAVE_ANSWERS` keeps `hh[].middle_name`;
  - `tests/support/intake-value-cases.mjs` gains `hh` cases for `middle_name` (valid, 200 characters, 201 characters, a number), which both the browser check and the database check must agree on.
- [x] 2.3 Stop before applying 024. Review the generated migration (it only calls the loader with the new catalogue), then ask the user before `npm run db:migrate:test`. After their OK, apply it and run `npm run test:database`. All pass, including "the field table matches the catalogue".

## 3. One name rule for a household member

- [x] 3.1 Add `memberNameParts(member)` to `src/intake-catalogue.mjs`. It returns the answered parts of `first_name`, `middle_name` and `last_name`, in that order. Add unit tests with and without a middle name, and with blank parts.
- [x] 3.2 Use it in `src/intake-form.mjs` (`memberLine`, the member's summary line) and in `src/draft-form.mjs`, for both `memberLine` (the Additional Comments lines) and the dependents row's `nameFirstLast`. The draft keeps `oneLine` on each part. `src/document-cards.mjs` stays "First Last" (design D6).
- [x] 3.3 Unit tests:
  - `tests/draft-form.test.mjs`: row 1 with a middle name reads "Ana Mei Lin", a member without one is unchanged, and a fifth member's comment line has "Eva Q Lin";
  - the member's summary line in `tests/intake-form.test.mjs` or `tests/client-views.test.mjs`;
  - the taxpayer's middle initial is unchanged.

  Run `npm test`.

## 4. The browser story

- [x] 4.1 `tests/browser.mjs`:
  - the household sub-step shows a middle-name box between first and last name, and a middle name typed there is saved (the summary line is covered by the unit tests in 3.3);
  - in the 15080 walk, after "I consent", the sub-step isn't done until both signatures are typed (the story already types "Mei Lin" and "Wei Lin").
- [x] 4.2 Run `npm run test:browser`. It passes.

## 5. Docs and the full check

- [x] 5.1 Run the checks in 5.2 first, so the docs get real counts. Then the docs:
  - the migration list and count: `docs/setup.md` ("Twenty-four migrations" and the table row for 024), `docs/developer/database.md` (the migrations table) and `docs/developer/README.md` (`001-024`);
  - the last-verified counts in `docs/setup.md` and `docs/developer/frontend.md`;
  - one line in `docs/developer/frontend.md` (the catalogue section) saying the 15080 signatures are required when shown.
- [x] 5.2 Run, and record the counts:
  - `npm test`;
  - `npm run build:hant -- --check`;
  - `npm run build:intake` leaves nothing to commit;
  - `npx openspec validate --all`;
  - `npm run test:database`;
  - `npm run test:auth-browser` (sign-in is untouched, but it runs so all four counts in `docs/setup.md` are re-verified);
  - `npm run test:browser`: Task 4's run counts, and it's re-run only if code changed after it.
