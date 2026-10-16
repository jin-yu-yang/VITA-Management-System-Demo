# Brainstorm: add-widowed-spouse-rules

A raw capture of the design agreed in the conversation on 2026-10-15, during CLAUDE.md lifecycle step 2 (`/opsx:explore` and the brainstorm). The code facts below come from `main` at d16f2bf.

## Background

- **The deferred follow-up.** `add-unmarried-intake-wording` (#67) decided that widowed counts as not married, "until a later fix asks whether the spouse died more than two years ago; if not, the intake still needs the spouse's name and info" (its brainstorm Q2 and its out-of-scope list). This change is that fix.
- **What the code does today.** One rule, married only, turns everything spouse-related on at once: `CATALOGUE.fixedOptions.who.spouseShowIf = [marital_status eq married]`, hard-coded in `tools/build-intake-catalogue.mjs:676`, and read through `spouseShown(answers)`. It drives:
  - the "My spouse" option of the nine "who" questions (otherwise Yes/No);
  - the married versus unmarried wording;
  - the draft 13614-C's Spouse ticks;
  - the redraw drivers.

  Every spouse question also has its own `marital_status = married` show-if: the six `sp_*` questions, `opt_race_sp`, `gcf_sp_signature` and `gcf_sp_date`.
- **Independent "married" tests:**
  - `isMarried` in `src/document-cards.mjs:105`. It drives the spouse Photo ID and SSN cards, the who owners, the owner line, the custody card and the bank hint.
  - The controller's `clearSpouse` trigger (`src/controller.mjs:1554`).
  - "Fill fictional details" (`src/app.mjs:793`, `:817`).
- **`spouse_death_year`** already exists. It is a required Year, shown if widowed, in `about.marital`, and fills the 13614-C's "year of spouse's death" box. It is only checked to be four digits: there is no range.
- **The show-if language is AND-only, with the operators `eq`, `ne` and `filled`.**
  - JS: `holds()` and `isVisible` in `src/intake-catalogue.mjs:70-82`.
  - SQL: `vitally_private.intake_holds` (011).
  - Loader: `put_intake_field` (015) refuses any other operator.
  - There is no OR and no numeric comparison.
- **Tax rules,** read from IRS Publication 501 (2025), at the user's request:
  - "If your spouse died during the year, you are considered married for the whole year." The survivor may file jointly for the year of death.
  - Qualifying surviving spouse: "Your spouse died in 2023 or 2024 and you didn't remarry before the end of 2025." This needs a dependent child, and it doesn't entitle the survivor to a joint return.

## Decision chain

**Q1. How the form knows a widowed client's spouse is still needed.**
- Options:
  - A: derive it from `spouse_death_year`;
  - B: ask a new Yes/No question, "Has your spouse been deceased for more than two years?".
- **Decision: A.** The user then checked Publication 501: the cut-off for tax year 2025 is `spouse_death_year >= 2023`, not 2024. I verified this against the IRS's HTML copy of Publication 501 (2025).

**Q2. How to write a rule the show-if language can't express ("married OR (widowed AND year >= 2023)").**
- Options:
  - A: one named rule, written once in the builder. The browser and the database learn an "any of" group and an "at least" comparison;
  - B: a stored Yes/No that the app computes.
- **Decision: A,** "one named rule written once".

**Q3. What the rule turns on.** Publication 501 separates a 2025 death (may file jointly) from a 2023 or 2024 death (not a joint return).
- Options:
  - A: recently widowed is the same as married, except for the signature;
  - B: only the spouse's identity is asked;
  - C: split by year into two named rules.
- **Decision: C, with the user's notes:**
  - **S, "spouse on the return":** married, or widowed with `spouse_death_year >= 2023`. It covers the spouse's first, middle and last name, and date of birth.
  - **J, "filing with the spouse possible":** married, or widowed with `spouse_death_year >= 2025`. It covers:
    - `sp_job_title`, which the user said is needed for a 2025 death;
    - the "My spouse" options;
    - the married wording;
    - the spouse document cards.
  - **The 15080 spouse signature and date stay married only.** For a 2025 death, the user said to hide "secondary taxpayer signature" (`gcf_sp_signature`).
  - **`sp_phone` stays married only:** a phone number is pointless for a deceased spouse.
  - **"Your spouse" reads "Your late spouse" / 已故配偶 for a widowed client.**

**Q4. The spouse's Photo ID card for a 2025 death.**
- Options:
  - A: SSN card only;
  - B: both cards, as for a married client.
- **Decision: B.** The spouse cards follow J.
- The user noted the rare domestic-violence case: a married client who leaves the spouse off Form 14446 is non-MFJ. That belongs to the 14446 change.

**Q5. Scope.**
- Options:
  - A: two changes, with the Form 14446 page next;
  - B: one change.
- **Decision: A.** The user's 14446 rules are recorded in memory for the next change (`form-14446-plans`):
  - married: both sign, so MFJ, or non-MFJ with no spouse;
  - died 2025: both sign, the client signing the late spouse's name, so MFJ;
  - died 2023 or 2024: non-MFJ (the user corrected an "MFJ" typo), primary signature only, spouse section hidden;
  - earlier: non-MFJ, primary signature only.

**Q6. The draft 13614-C's spouse lines for a 2023 or 2024 death.**
- Options:
  - A: print them only when a joint return is possible (J);
  - B: print whatever was answered (S).
- **Decision: A,** "for now". The user's group member at the VITA site wasn't sure. The intake still collects the details, and the summaries and the staff answers panel show them.

**Q7. Two cards.**
- **The direct-deposit hint for a 2025 death** must not point at the deceased person's account. It reads "late spouse" and names the taxpayers on the return. Exact text, from the user's wording:
  - client: "The account must be in the name of one of the taxpayers on this return: your own account, or a joint account with your late spouse." / 账户必须在该税单任一纳税人名下：您本人的账户，或您与已故配偶的联名账户。
  - office: "The account must be in the name of one of the taxpayers on this return: the client's own account, or a joint account with their late spouse."

  The married and unmarried hints are unchanged.
- **The custody card (Form 8332)** is offered unless the client is married, so a widowed client of any year gets it. It keeps a plain married test and does not follow J.

**Q8. Wording scope.** "Late spouse" appears on the bank hint and the sub-step title only. Everywhere else a 2025 death keeps "your spouse": the leads, Q9.1a, "My spouse" and the "For you and your spouse" owner line.

**Q9. Defaults the user confirmed.**
- `opt_race_sp` follows J. The user noted it is optional anyway.
- `spouse_death_year` accepts only 1900–2025.

## Implementation decisions found while planning

**I1. Show-if JSON.** A condition list stays an AND list. Two new kinds of condition:
- `{ field, op: "gte", value: <integer> }`: true when the answer is a whole number at least `value`. It is false when the field is unanswered or not a number;
- `{ op: "any", groups: [[…], […]] }`: true when any group (itself an AND list) holds.

These are used in JS `holds()`, SQL `intake_holds` (recursive through `any`), and the redraw-driver scan, which recurses into `any` groups.

**I2. Named rules in the builder.**
- The builder defines `RULES = { spouse_on_return, joint_possible }`.
- A draft show-if may name one with the clause `` rule `spouse_on_return` ``, which the builder expands inline. The SQL side only ever sees expanded conditions.
- The catalogue exports `rules` too, and `fixedOptions.who.spouseShowIf` becomes `rules.joint_possible`.
- JS exports `spouseOnReturn(answers)` (S) next to `spouseShown(answers)`, which becomes J.

**I3. Year ranges.**
- The drafts' ID line accepts `Year 1900–2025`, the same syntax as `Number n–m`.
- JS `checkValue` and SQL `check_intake_value` check `min` and `max` for `year`. The message is "Enter a year from 1900 to 2025.", with a Chinese key.

**I4. Migrations.**
- The hand-written `027_intake_show_if_any_and_year_range.sql` redefines four functions, each copied verbatim from its latest definition with only the named additions:
  - `intake_holds` (011), adding `gte` and `any`;
  - `put_intake_field` (015), accepting them, through a new recursive `intake_show_if_ok`;
  - `check_intake_value` (015), adding the year range;
  - the closing `revoke`.
- The generated catalogue migration comes after it as 028, because the loader must accept the new operators first.

**I5. The late-spouse title.**
- The builder gives `about.spouse` a `titleWidowed` ("Your late spouse" / 已故配偶), the same text for both variants, as the title is today.
- A reader `substepTitleOf(substep, { variant, lang, answers })` picks it when `marital_status = widowed`.
- The rail, the header, the summary, the office form and the staff answers panel pass the application's answers.

**I6. Cards.**
- `isMarried` in `document-cards.mjs` becomes `spouseShown` (J) for the spouse owners, the Photo ID and SSN cards, and the shared owner line.
- The bank hint picks among married (`bank_hint`), widowed under J (`bank_hint_late`, new), and otherwise `bank_hint_single`.
- The custody card keeps `marital_status !== "married"`, renamed so its meaning is clear.
- Card text has no senior variant, so the Chinese says 已故配偶 everywhere.

**I7. Other "married" tests.**
- The controller strips "spouse" from the who answers whenever an edit to `marital_status` or `spouse_death_year` leaves J false. Today it does so only when marital status leaves married.
- "Fill fictional details" adds spouse answers when S holds.
- The draft 13614-C prints `sp_first_name`, `sp_middle_name`, `sp_last_name` and `sp_dob` only when J holds. `sp_job_title` follows J by its own show-if.

**I8. The draft not-sure lines** quote the wording the client saw. That now follows J, which includes a 2025 death. This is a MODIFIED requirement in `draft-13614c`.

**I9. Each rule has an upper bound.** The browser's draft holds whatever is typed, so "2205" would pass `gte 2025` and show the spouse sub-step while the field shows its error.
- A third condition kind, `{ field, op: "lte", value: <integer> }`, mirrors `gte`.
- Each rule's widowed group adds `spouse_death_year lte 2025`, the tax year. A year outside 1900–2025 therefore switches neither rule on, in the browser or the database.
- The builder fails if `spouse_death_year`'s range doesn't end at that tax year, so the two can't drift apart.
- `gte`/`lte` read only a number written without a leading zero. Otherwise "02025" (not four digits, so refused) would still count as 2025. With that, the only answers a rule's year group accepts are "2023" to "2025", all of them valid years.

**I10. The "who" clean-up waits for a whole year.** Every keystroke reaches the controller, so retyping "2025" passes "2", "20" and "202". If each of these cleared the spouse, a client who ticked My spouse would lose it by correcting the year.
- An edit to `spouse_death_year` drops the spouse only when the new value is a valid year (four digits, 1900–2025) and J is false.
- An edit that changes `marital_status` drops it whenever J is false. A move to another sub-step re-sends every answer on the page, the unchanged marital status included (`sweepV2Form`), so an unchanged value must not count, or a move would drop the spouse while the year is half typed.
- A "spouse" left in place while the year is partly typed or empty prints nothing: the draft 13614-C and the cards follow J. It can't reach a submission either, because the year is required.

**I11. A death year redraws the form when it adds or removes a sub-step.** On `change`, today's form redraws only when the current sub-step's own questions change (`needsRedraw`). The year sits on "Marital status", but it adds or removes another sub-step, "Your late spouse". The rail, the "part x of y" count and Add a case's parts would stay stale until the next move.
- `changeV2Field` in `app.mjs` also redraws when the sub-steps the page lists differ from the ones the draft shows now. That is the rail on the client's form, and the parts on Add a case.
- It compares the page with the draft, as `needsRedraw` does. It does not compare the draft before and after the `change`: every keystroke has already reached the draft through `input`, so before and after would always be equal.
- Typing still never redraws.

## Open questions

- **The draft 13614-C's spouse lines for a 2023 or 2024 death.** Owner: the user, and their group member at the VITA site. Only `draft-form.mjs` depends on it, a one-rule switch.
- **The Chinese wording** of "Your late spouse" / 已故配偶, the late-spouse bank hint and the year-range message. Owner: the group's wording review. Text only. The senior version uses the same text, as the title does today.
