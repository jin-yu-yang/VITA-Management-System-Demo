## Why

A client who isn't married still reads about a spouse in three questions and nine sub-step leads, for example "How many jobs did you and your spouse have in 2025?" and "Did you or your spouse receive any of these in 2025?". The "Me / My spouse / No one" questions under those leads already hide "My spouse" from them, so the wording contradicts the form. Every staff screen and the draft 13614-C repeat the same wording. This is the second of the changes from the user's review of the intake screen.

## What Changes

**Wording that depends on marital status**
- From: one wording per question, lead and intro (standard and senior). The spouse is named whatever the client answered.
- To: three questions (Q5.2 `claimed_by_other`, Q9.1a `inc_wages_job_count`, Q12.4 `opt_veteran`), the nine income, expense and event leads, and section 6's intro each get a "not married" wording. A screen showing one application uses it whenever that client isn't married. The rule is the one the "My spouse" option already follows (`who.spouseShowIf`): only `marital_status = married` counts, and an unanswered status counts as not married.
- Reason: an unmarried client shouldn't be asked about a spouse.
- Impact: non-breaking. Answers, field IDs and required rules don't change. Married clients see today's wording.

**Every screen agrees**
- The client's form, the review alerts and summary, the "someone else changed this" table, the office's form, the staff answers panel, and the draft 13614-C's "not sure" lines all pick the wording from that application's answers.
- Without an application, for example in catalogue tests, today's wording stands.

**The direct-deposit card's hint**
- From: every client choosing direct deposit or a split refund (or a bank payment) reads "The account must be in your name (or your spouse's)." / 账户必须是您（或配偶）名下的账户。; the office reads "…the client's or spouse's name."
- To: an unmarried client reads "The account must be in your name." / 账户必须是您名下的账户。, and the office reads "The account must be in the client's name." Married clients keep today's text.

**Senior married leads**
- From: the senior leads reuse the standard Chinese (您或配偶).
- To: 您或您爱人, as senior wording says everywhere else. Their English doesn't change.

**Generated files**
- `npm run build:intake` regenerates `src/intake-catalogue-data.mjs` and writes `supabase/migrations/025_intake_catalogue_<hash8>.sql`. It's text only, and nothing is written by hand.
- `npm run build:hant` regenerates `src/zh-hant.mjs`.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `client-intake`: ADDED, "An unmarried client isn't asked about a spouse".
- `draft-13614c`: ADDED, "The draft's not-sure lines quote the wording the client saw".

## Impact

- **Catalogue sources:**
  - `docs/intake-questions/intake-questions.md` and `intake-questions-senior-v2.md`: `> Not married:` lines under Q5.2, Q9.1a and Q12.4, and an `**Intro text (not married):**` block in section 6;
  - `tools/build-intake-catalogue.mjs`: the parser, the merge and its checks, and the lead constants;
  - the generated `src/intake-catalogue-data.mjs`, migration 025, and `src/zh-hant.mjs`.
- **Code:**
  - `src/intake-catalogue.mjs`: `spouseShown`, `wording()` with `answers`, and lead and intro helpers;
  - `src/document-cards.mjs`: the bank card's hint, married or not, through two new `CARD_TEMPLATES` entries;
  - the screens that pass answers: `src/intake-form.mjs`, `src/intake-views.mjs`, `src/client-views.mjs`, `src/office-views.mjs`, `src/staff-views.mjs` and `src/draft-form.mjs`.
- **Database:** only the generated catalogue migration. The database doesn't store wording.
- **Tests:**
  - unit: the build, `wording()` and the leads, the intros, the staff panel, the draft, the bank card's hint;
  - database: the field table still matches, after 025 is applied;
  - browser: the story's never-married and married walks.
- **Docs:** the migration list and the counts.
- **No dependency changes.**
- **Out of scope:**
  - the widowed rule (a later fix asks whether the spouse died more than two years ago);
  - the Step 9 review gate and summary redesign (the next change);
  - multi-select service languages;
  - section 0's page text.
