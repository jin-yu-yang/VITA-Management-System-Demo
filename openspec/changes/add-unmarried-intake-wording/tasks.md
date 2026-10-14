## 1. The catalogue: unmarried text in the drafts and the builder

- [ ] 1.1 Build tests first (`tests/intake-build.test.mjs`):
  - parser tests on small drafts: a `> Not married:` line becomes `wordingUnmarried`; an `**Intro text (not married):**` block becomes `introUnmarried`;
  - refusals: a `Not married` line on a question that names no spouse; one present in only one draft; one on a group field;
  - the real catalogue: Q5.2, Q9.1a and Q12.4 have `wordingUnmarried` (design D6 / brainstorm Q4 text, both versions) and section 6 has `introUnmarried`;
  - the nine leads (`income.wages`, `.retirement`, `.investments`, `.rental`, `.business`, `.other`; `expenses.deductible`, `.other`; `expenses.events`) have `leadUnmarried`;
  - the senior married leads' Chinese uses 您爱人;
  - no other question has `wordingUnmarried`.

  Run them and see them fail.
- [ ] 1.2 `tools/build-intake-catalogue.mjs`:
  - parse `> Not married:`, and merge it as `wordingUnmarried`;
  - parse the `**Intro text (not married):**` block as `introUnmarried`;
  - the refusals and structure checks in design D2;
  - turn the lead constants into general and senior, married and unmarried text (D6).
- [ ] 1.3 Edit both drafts: the `> Not married:` lines under Q5.2, Q9.1a and Q12.4, and the section 6 `**Intro text (not married):**` block, with the exact text in brainstorm Q4.
- [ ] 1.4 Check that `main` has no migration numbered 025. Run `npm run build:intake`, which writes `src/intake-catalogue-data.mjs` and `025_intake_catalogue_<hash8>.sql`, and `npm run build:hant`. The build tests pass. Don't apply 025.

## 2. One rule and one reader for each kind of text

- [ ] 2.1 Unit tests (`tests/intake-catalogue.test.mjs`):
  - `spouseShown`: married → true; never married, divorced, separated, widowed or unanswered → false;
  - `wording(question, { variant, lang, answers })`: the unmarried text for a never-married application, in both versions and both languages;
  - the married text for a married application, and today's text without `answers`;
  - a question without `wordingUnmarried` is unchanged for every marital status;
  - `leadOf` and `introOf` behave the same way.
- [ ] 2.2 In `src/intake-catalogue.mjs`:
  - export `spouseShown(answers)`, moved from `intake-form.mjs:55`;
  - add `answers` to `wording()`;
  - add `leadOf(substep, …)` and `introOf(section, …)` (design D3, D4).

  `intake-form.mjs` and `draft-form.mjs:409` import `spouseShown` from there. Run `npm test`.

## 3. Every screen passes its application's answers

- [ ] 3.1 Unit tests, one per screen, each with a never-married and a married application (design D5):
  - the client's question label, the sub-step lead and section 6's intro (`tests/client-views.test.mjs`);
  - the alert line, the summary row and the compare table (`tests/client-views.test.mjs`);
  - the office's lead and question label (`tests/office-views.test.mjs`);
  - the staff answers panel row (`tests/staff-views.test.mjs`);
  - the draft 13614-C's not-sure line for Q5.2 (`tests/draft-form.test.mjs`).
- [ ] 3.2 Pass the answers at every call site in design D5: `intake-form.mjs`, `intake-views.mjs` (`itemLabel` gains `answers`; leads and intros through `leadOf` and `introOf`), `client-views.mjs`, `office-views.mjs`, `staff-views.mjs` and `draft-form.mjs`. Run `npm test` and `npm run build:hant -- --check`.

## 4. The direct-deposit card's hint

- [ ] 4.1 Test first (`tests/document-cards.test.mjs`): for direct deposit, the bank card's hint is `{ en: "The account must be in your name.", zh: "账户必须是您名下的账户。", office: "The account must be in the client's name." }` for a never-married client and for an unanswered marital status. It's today's spouse text for a married client. Update the existing assertion at ~line 154, whose answers are never married. Run it and see it fail.
- [ ] 4.2 `src/document-cards.mjs`: add `CARD_TEMPLATES.bank_hint` and `CARD_TEMPLATES.bank_hint_single` (design D7). Drop the bank rule's rule-level `hint`, and give each of its match entries `hint: isMarried(a) ? CARD_TEMPLATES.bank_hint : CARD_TEMPLATES.bank_hint_single`. Run `npm run build:hant` and keep `src/zh-hant.mjs`. Then run `npm test`, which includes `client-views.test.mjs:1293` (a married client) still reading the spouse text, and `npm run build:hant -- --check`.

## 5. Database and the story

- [ ] 5.1 Stop before applying 025. Review it (the same shape as 024, text only), then ask the user before `npm run db:migrate:test`. After their OK, apply it and run `npm run test:database`. Say whether `main`'s field-table test would still pass on the stack.
- [ ] 5.2 `tests/browser.mjs`:
  - in the story's never-married walk, the wages lead and Q9.1a read the unmarried text;
  - in the married walk, they read the spouse text.

  Run `npm run test:browser`.

## 6. Docs and the full check

- [ ] 6.1 Run the checks first, so the docs get real counts:
  - `npm test`;
  - `npm run build:hant -- --check`;
  - `npm run build:intake`, which leaves nothing to commit;
  - `npx openspec validate --all`;
  - `npm run test:database`;
  - `npm run test:auth-browser`, so all four counts in `docs/setup.md` are re-verified;
  - `npm run test:browser`, using 5.2's run if no code changed after it.
- [ ] 6.2 Docs:
  - migration 025 in `docs/setup.md` (the count and the table row), `docs/developer/database.md`, `docs/developer/README.md` (`001-025`) and the root `README.md` (`001–025`);
  - the counts in `docs/setup.md`, `docs/developer/frontend.md`, `docs/developer/README.md` and `docs/developer/database.md`;
  - one sentence in `docs/developer/frontend.md` on wording that depends on marital status (`wordingUnmarried`, `spouseShown`).
