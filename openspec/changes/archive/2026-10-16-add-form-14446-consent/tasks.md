## 1. The XFA-stripped forms, and the spike (design D5; plan Task 1)

- [x] 1.1 A tool script, `tools/strip-xfa.mjs`:
  - reads PCDC's two PDFs in `docs/media/`;
  - removes their XFA;
  - clears page 3's four Yes/No boxes (Q1 "Request to Review" and Q2 "I agree to use this site's Virtual VITA/TCE Process"), and removes any field pdf-lib can't flatten;
  - writes `src/forms/f14446-pcdc-en.pdf` and `src/forms/f14446-pcdc-zh-t.pdf`.

  A unit test pins both outputs by SHA-256. Loading them with pdf-lib writes nothing to the console.
- [x] 1.2 The spike: fill page 3 of both copies with fictional values (including the read-only 繁體 signature box), and read every field back in a unit test. The controller opens both filled copies in the built-in browser. **If the pages come out blank, or the 繁體 signature is missing, stop and come back to the user.**

## 2. The catalogue, the samples and the test helpers: Sections 15–16, two sub-steps, 029 (design D1, D6; plan Task 2)

- [x] 2.1 Tests first:
  - `tests/intake-build.test.mjs`: the seven `vc_*` questions with their types, required flags and show-ifs; Section 15 in "Before you start" and Section 16 in "About you"; `before.virtual` after `before.language`; `about.sign` after `about.spouse`; the 2025 tip's show-if; Section 16's not-married intro.
  - `tests/intake-catalogue.test.mjs`: the visibility of the spouse questions for married, widowed 2025 and widowed 2024 clients; `missingToSubmit` names `vc_agree`, `vc_review` and `vc_tp_signature`.
  - `tests/support/intake-value-cases.mjs`: `vc_agree` and `vc_sp_email` rows.
  - `tests/sample-data.test.mjs`: `makeSampleAnswers()` carries the 14446 answers; `sampleAnswersFor` removes every `vc_*` key.

  See them fail.
- [x] 2.2 Sections 15 and 16 in both drafts, and the two sub-steps and section mappings in the builder. In `src/sample-data.mjs`, the sample carries the 14446 answers, and the Fill leaves them out (design D6). Run `npm run build:intake` (029) and `npm run build:hant`.
- [x] 2.3 Test helpers default to a consented, signed answer set: a shared `CONSENT_14446` in `tests/support/`, merged into the controller tests' `v2Store`/`openV2`, and into the client-view tests that pass their own `draftAnswers` past step 0 (`v2State` and `v2Case` already use `makeSampleAnswers()`, and Add a case's `addV2` stays `{}` because it is never locked). The drivers pin in `tests/intake-form.test.mjs` gains `vc_tp_signature` and `vc_sp_signature`. Earlier tests then keep opening past 0.4. Any test that pins a missing-answer or alert list is updated on purpose, and the report lists each one. `npm test` passes.

## 3. The gate (design D2; plan Task 3)

- [x] 3.1 Tests first:
  - `consented(answers)`;
  - `resolveSubstep` lands an unconsented form on `before.virtual`;
  - the controller can't move past step 0 until consented;
  - the rail shows the later steps locked (no `go-substep`, `aria-disabled`);
  - 0.4's Continue is disabled with its line;
  - unticking locks again and keeps the answers;
  - Add a case has no lock.
- [x] 3.2 Implement in `src/intake-form.mjs`, `src/intake-views.mjs`, `src/client-text.mjs` (and `src/styles.css` for the locked rail). Run `npm run build:hant`. `npm test` passes.

## 4. 1.5's page and the dates (design D3, D4; plan Task 4)

- [x] 4.1 Tests first:
  - 1.5 shows each signer's details read-only, and the joint-return line under J;
  - the controller fills `vc_tp_date` and `vc_sp_date` with today on a first signature, keeps a typed date, and leaves 15080's dates alone.
- [x] 4.2 Implement in `src/intake-views.mjs`, `src/client-text.mjs` and `src/controller.mjs`. Run `npm run build:hant`. `npm test` passes.

## 5. The draft Form 14446 (design D5; plan Task 5)

- [x] 5.1 Tests first, in `tests/draft-14446-form.test.mjs`:
  - the client's block;
  - the spouse block only when signed under J (married, 2025, unsigned, 2024);
  - the IRS-review boxes for yes, no and unanswered;
  - Q2's "Yes" only while `vc_agree` is ticked;
  - the default, flattening `buildDraftPdf` build of both forms, with no throw and no console warning;
  - both languages' field names;
  - the pinned forms.

  Also the buttons on the summary page (English and 简体 screens) and on the staff answers panel.
- [x] 5.2 Implement:
  - `src/draft-virtual-consent.mjs`;
  - the `view-draft` wiring in `src/app.mjs` for the 14446 forms;
  - the buttons in `src/intake-views.mjs` and `src/staff-views.mjs`;
  - the summary intro's third paragraph in `src/client-text.mjs`.

  Run `npm run build:hant`. `npm test` passes.

## 6. Migration 030 and the test stack (design D7; plan Task 6)

- [x] 6.1 Write `supabase/migrations/030_fixture_answers_14446.sql`: `fixture_answers_v2`, copied from 019 with the 14446 keys added. Database tests check that each sample carries them and is complete.
- [x] 6.2 The controller:
  - dry-runs 029 and 030 together in `begin … rollback` on `vitally-task2`;
  - applies them with `npm run db:migrate:test` after the user's OK;
  - runs `npm run test:database`.

## 7. The story (plan Task 7)

- [x] 7.1 Every story walk that fills and submits an application ticks 0.4 and signs 1.5, the client's and the office's alike. The story checks:
  - that the locked rail appears before the tick;
  - "Sign Form 14446" with the details;
  - the filled 14446 date;
  - that the English and 繁體 draft 14446 open with a quiet console.
- [x] 7.2 The controller runs `npm run test:browser`.

## 8. Docs and the full check (plan Task 8)

- [x] 8.1 Docs:
  - `docs/developer/frontend.md`: the gate, the two sub-steps, the dates, the draft 14446;
  - `docs/developer/database.md` and `docs/setup.md`: migrations 029–030, ranges 001–030, counts, spelled-out numbers included;
  - `docs/developer/README.md` and `README.md`: ranges and the unit count.
- [x] 8.2 Final checks:
  - `npm test`;
  - `npm run build:hant -- --check`;
  - `npm run build:intake` leaves nothing to commit;
  - `npx openspec validate --all`.

  `test:auth-browser` isn't needed: no sign-in change.
