## Why

The intake treats a widowed client as unmarried, so it never asks about a spouse who died recently. Under IRS Publication 501 (2025), a client whose spouse died in 2025 is considered married for the whole year and may file jointly. A client whose spouse died in 2023 or 2024 may qualify as a surviving spouse. In both cases the volunteer needs the spouse's name and details, and for a 2025 death the joint-return details too. Today the form can't ask for them, because "married" is the only rule it knows.

## What Changes

**Two named spouse rules replace "married" for spouse questions**
- From: every spouse question, the "My spouse" option, the married wording and the spouse cards test `marital_status = married`.
- To: two rules, each defined once in the catalogue builder.
  - **S, "spouse on the return":** married, or widowed with `spouse_death_year` 2023 or later. It asks the spouse's first, middle and last name, and date of birth.
  - **J, "filing with the spouse possible":** married, or widowed with `spouse_death_year` 2025. It asks the spouse's job title, offers "My spouse", shows the married wording, gives the spouse Photo ID and SSN cards, and prints the draft 13614-C's spouse lines.
- Unchanged:
  - the spouse's phone, the Form 15080 spouse signature and date, `married_last_day` and `lived_apart_last_6mo` stay married only;
  - the custody card (Form 8332) still goes to anyone not married, widowed included.
- Reason: Publication 501, and the user's practice (brainstorm Q1–Q4).
- Impact: a widowed client whose spouse died in 2023 or later now sees spouse questions. Everyone else sees no change.

**A widowed client's wording**
- The spouse sub-step reads "Your late spouse" / 已故配偶 for a widowed client.
- For a 2025 death, the direct-deposit hint reads: "The account must be in the name of one of the taxpayers on this return: your own account, or a joint account with your late spouse." / 账户必须在该税单任一纳税人名下：您本人的账户，或您与已故配偶的联名账户。
- Everywhere else keeps "your spouse".

**The year of the spouse's death is checked.** `spouse_death_year` accepts 1900–2025 only, so a typo can't switch the spouse rules on or off.

**The show-if language gains "any of", "at least" and "at most".** These are evaluated the same way in the browser and in the database. They come with a hand-written migration (027), followed by the generated catalogue migration (028).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client-intake`:
  - **Modified:** "An unmarried client isn't asked about a spouse" and "An unmarried client answers the 'who' questions with Yes or No" now follow rule J.
  - **Added:** a recently widowed client's spouse questions, title and cards; the death-year range.
- `draft-13614c`:
  - **Modified:** the not-sure lines' wording follows J.
  - **Added:** the spouse lines appear only when a joint return is possible.

## Impact

- **Catalogue:**
  - both drafts in `docs/intake-questions/`;
  - `tools/build-intake-catalogue.mjs` (the named rules, the `rule` clause, the year range, the late-spouse title);
  - the generated `src/intake-catalogue-data.mjs`, `028_intake_catalogue_<hash8>.sql` and `src/zh-hant.mjs`.
- **Database:** the hand-written `027_intake_show_if_any_and_year_range.sql`, which redefines `intake_holds`, `put_intake_field` and `check_intake_value`, and adds `intake_show_if_ok`. There is no table change and no data change.
- **Code:**
  - `src/intake-catalogue.mjs`: `holds`, the rules and the year check;
  - `src/intake-form.mjs`: the drivers and the invalid-year text;
  - `src/intake-views.mjs`, `src/office-views.mjs`, `src/staff-views.mjs`: the sub-step title;
  - `src/document-cards.mjs`;
  - `src/controller.mjs`: the spouse clean-up;
  - `src/app.mjs`: the Fill;
  - `src/draft-form.mjs`;
  - `src/client-text.mjs`.
- **Tests:**
  - unit tests;
  - the database parity tests for the new operators and the year range;
  - the story: a widowed client whose spouse died in 2025 or 2015.
- **Docs:** `docs/developer/frontend.md` and `docs/developer/database.md` (the show-if grammar, migrations 027–028), and `docs/setup.md` (the migration list and counts).
- **Out of scope:**
  - the Form 14446 page and its signature rules (the next change, with rules recorded);
  - filing-status tags;
  - staff screens beyond the title.
