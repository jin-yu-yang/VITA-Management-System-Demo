## Context

**One rule, married only, drives every spouse behaviour.**
- It is `CATALOGUE.fixedOptions.who.spouseShowIf = [marital_status eq married]`, hard-coded in `tools/build-intake-catalogue.mjs:676`, and read through `spouseShown(answers)` (`src/intake-catalogue.mjs:85`).
- It drives the "My spouse" option, the married versus unmarried wording, the draft 13614-C's Spouse ticks and the redraw drivers.
- Each spouse question carries its own copy, `marital_status = married`, in both drafts: `sp_first_name`, `sp_middle_name`, `sp_last_name`, `sp_dob`, `sp_job_title`, `sp_phone`, `opt_race_sp`, `gcf_sp_signature` and `gcf_sp_date`.
- Three more places test "married" on their own:
  - `isMarried` in `src/document-cards.mjs:105`;
  - the controller's `clearSpouse` trigger (`src/controller.mjs:1554`);
  - "Fill fictional details" (`src/app.mjs:793`, `:817`).

**`spouse_death_year`** (Q3.6) is a required Year, shown if widowed. It fills the 13614-C's widowed year box, and it is checked only as four digits.

**The show-if language** is an AND list of `eq`, `ne` and `filled` conditions.
- The browser evaluates it in `holds()` / `isVisible`, and the server in `vitally_private.intake_holds` (011).
- The loader `put_intake_field` (015) refuses any other operator.
- The server checks a saved answer's visibility, and whether it is missing, with the same JSON. So the browser and the database must agree.

**IRS Publication 501 (2025):**
- a survivor is considered married for the year their spouse died, and may file jointly;
- a qualifying surviving spouse's spouse "died in 2023 or 2024", and that is not a joint return.

## Goals / Non-Goals

**Goals:**
- A widowed client whose spouse died in 2023 or later gives the spouse's name and date of birth. A 2025 death also gives the job title, gets "My spouse", the married wording and the spouse cards, and prints the spouse lines on the draft 13614-C.
- The spouse's phone and the Form 15080 spouse signature stay married only.
- A widowed client sees "Your late spouse" / 已故配偶 as the sub-step title. A 2025 death gets the late-spouse direct-deposit hint.
- `spouse_death_year` is 1900–2025.
- Both rules are defined once, and the browser and the database evaluate them identically.

**Non-Goals:**
- the Form 14446 page and its signatures (the next change; rules in memory `form-14446-plans`);
- filing-status tags;
- a full "late spouse" wording variant;
- the senior-specific title text;
- verifying qualifying-surviving-spouse eligibility, such as the dependent child.

## Decisions

### D1: Show-if gains `gte`, `lte` and `any` (brainstorm Q2-A, I1, I9)
- **Choice:** a condition list stays AND, with three new condition kinds:
  - `{ field, op: "gte", value: <integer> }` holds when the answer is a whole number written in digits without a leading zero (`0`, or `[1-9][0-9]*`) and is at least `value`. It doesn't hold when the answer is unanswered, not a number, or written with a leading zero, so "02025", which the year check refuses, can't switch a rule on either (brainstorm I9). The browser reads the answer as it is sent, trimmed, as `sendable` trims a year; the server only ever stores trimmed values (`check_intake_value` refuses " 2024"), so the two agree (final review, fix 48ffc71);
  - `{ field, op: "lte", value: <integer> }` is the same with at most `value`;
  - `{ op: "any", groups: [[cond, …], …] }` holds when at least one group holds.
- **Where:**
  - JS `holds()` (`src/intake-catalogue.mjs`) adds all three, and `any` recurses into `isVisible`-style AND checks;
  - SQL `intake_holds` adds all three, and `any` calls `intake_holds` on each group;
  - the redraw drivers (`src/intake-form.mjs` `DRIVERS`) recurse into `any` groups.
- **Why:** the minimum needed to write "married OR (widowed AND N ≤ year ≤ 2025)", evaluated the same way on both sides. The upper bound matters in the browser, whose draft holds an out-of-range year while the field shows its error (I9).
- **Alternatives considered:**
  - a stored, browser-computed flag. Rejected: the server would trust a value it can't check (brainstorm Q2-B);
  - a general expression language. Rejected: YAGNI.

### D2: Two named rules, defined once (brainstorm Q3-C, I2)
- **Choice:** the builder defines:

  ```js
  const TAX_YEAR = 2025;
  const MARRIED = { field: "marital_status", op: "eq", value: "married" };
  const WIDOWED = { field: "marital_status", op: "eq", value: "widowed" };
  const diedFrom = (year) => [
    WIDOWED,
    { field: "spouse_death_year", op: "gte", value: year },
    { field: "spouse_death_year", op: "lte", value: TAX_YEAR },
  ];
  const RULES = {
    spouse_on_return: [{ op: "any", groups: [[MARRIED], diedFrom(2023)] }],
    joint_possible:   [{ op: "any", groups: [[MARRIED], diedFrom(TAX_YEAR)] }],
  };
  ```

  - A draft clause `` rule `spouse_on_return` `` expands to the rule's conditions. It can be AND-ed with other clauses.
  - The builder fails on an unknown rule name, and when `spouse_death_year`'s range doesn't end at `TAX_YEAR`.
  - The catalogue exports `rules`, and `fixedOptions.who.spouseShowIf` becomes `rules.joint_possible`.
  - `spouseShown(answers)` evaluates J. A new `spouseOnReturn(answers)` evaluates S.
- **Which question uses which rule:**

  | Question | Show if |
  |---|---|
  | `sp_first_name`, `sp_middle_name`, `sp_last_name`, `sp_dob` | rule `spouse_on_return` |
  | `sp_job_title`, `opt_race_sp` | rule `joint_possible` |
  | `sp_phone` | `marital_status = married` (unchanged) |
  | `gcf_sp_signature`, `gcf_sp_date` | unchanged (married only) |
  | `married_last_day`, `lived_apart_last_6mo` | unchanged |

- **Why:**
  - One place holds each cut-off: the year is 2023 or 2025.
  - SQL only ever sees the expanded JSON, so the database needs no rule table.
- **Alternatives considered:** writing each expanded condition in the drafts. Rejected: the same complex condition would sit in nine places in two drafts.

### D3: The year range (brainstorm Q9, I3)
- **Choice:**
  - The draft ID line accepts `Year 1900–2025`, parsed like `Number n–m`, setting `min` and `max`.
  - JS `checkValue` for `year` checks four digits, then `min`/`max` when they are set: "Enter a year from 1900 to 2025.".
  - `invalidText` translates it with a new `invalid.year_range` key (请输入 1900 至 2025 之间的年份。). The years are printed without digit grouping.
  - SQL `check_intake_value`'s `year` branch applies `min_value` and `max_value`. The loader already stores them.
- **Why:** a death year typed as "2205" or "1023" would otherwise switch the spouse rules on or off silently.

### D4: Migration order (I4)
- **Choice:**
  1. `027_intake_show_if_any_and_year_range.sql`, hand-written. It redefines `intake_holds` (verbatim from 011, plus `gte` and `any`), `put_intake_field` (verbatim from 015, with its show-if check replaced by a call to the new recursive `vitally_private.intake_show_if_ok(jsonb)`) and `check_intake_value` (verbatim from 015, plus the year range). It ends with 015's `revoke` line.
  2. `028_intake_catalogue_<hash8>.sql`, generated by `npm run build:intake` after the drafts change.
- **Why:** 028's loader call contains `any` and `gte` conditions, which 015's `put_intake_field` would refuse with VT007.
  - Every `vitally_private` function stays `security definer`, as a test requires.
  - `intake_holds` stays `immutable`.
- **Alternatives considered:** one generated migration. Rejected: the generator writes only the catalogue call.

### D5: The late-spouse title (brainstorm Q3, I5)
- **Choice:**
  - `about.spouse` gets `titleWidowed: { general: { en: "Your late spouse", zh: "已故配偶" } }` in the builder (the senior variant uses the same text, as the title does today).
  - `substepTitleOf(substep, { variant, lang, answers })` in `src/intake-catalogue.mjs` returns `titleWidowed` when `answers.marital_status === "widowed"` and the sub-step has one, otherwise `title`.
  - Callers pass the application's answers:
    - `intake-views.mjs`: the rail, the header, the summary and its documents part;
    - `office-views.mjs`: the Add a case parts;
    - `staff-views.mjs`: the answers panel.
- **Why:** this follows the not-married wording's pattern (`wording`, `leadOf`, `introOf` taking answers). The title only shows when S holds, so "widowed" alone is enough.

### D6: Document cards (brainstorm Q4, Q7, I6)
- **Choice:** in `src/document-cards.mjs`:
  - **Spouse owners, cards and owner line:** `whoOwners`' spouse owner, the Photo ID and SSN spouse cards, and the shared owner line use `spouseShown(a)` (J).
  - **The custody card** keeps a plain married test, renamed `isMarriedNow`. Its comment says why: Form 8332 concerns parents, and widowed clients of any year can get it.
  - **The bank hint** is `bank_hint` when married, the new `bank_hint_late` when widowed and J holds, and otherwise `bank_hint_single`. The text of `bank_hint_late`:
    - client: "The account must be in the name of one of the taxpayers on this return: your own account, or a joint account with your late spouse." / 账户必须在该税单任一纳税人名下：您本人的账户，或您与已故配偶的联名账户。
    - office: "The account must be in the name of one of the taxpayers on this return: the client's own account, or a joint account with their late spouse."
- **Why:** the user's decisions. A deposit must not point at a deceased person's own account.

### D7: The controller, the Fill and the draft (I7, I8)
- **Choice:**
  - **The controller.** `editAnswers` runs `clearSpouse` when `!spouseShown(merged draft)` and either the patch changes `marital_status` (an unchanged value, as a move re-sends it, doesn't count), or it contains a `spouse_death_year` that, as sent (trimmed), is answered and passes `checkValue`. A partly typed or cleared year leaves the who answers alone, on a move too (brainstorm I10).
  - **The redraw.** A visibility driver's `change` also redraws the form when the sub-steps the page lists (the rail, or Add a case's parts) differ from the ones the draft shows now, not only when the current sub-step's questions do (brainstorm I11). It compares the page with the draft, as `needsRedraw` does, because typing has already put the value in the draft. The death year is the first driver whose effect is on another sub-step.
  - **"Fill fictional details"** uses `sampleAnswersFor(draft, { seed })` (`src/sample-data.mjs`) in both places: the married sample when `spouseOnReturn(draft)` holds. A widowed client stays widowed with their year, on Regenerate too, and a late spouse gets no phone, no `married_last_day` or `lived_apart_last_6mo`, and a job title only while J holds. Hidden answers are not harmless here: a stored `sp_phone` reaches `case_contacts` and the staff contact card (final review, fix 48ffc71).
  - **The draft 13614-C** (`src/draft-form.mjs`) skips `sp_first_name`, `sp_middle_name`, `sp_last_name` and `sp_dob` unless `spouseShown(visible)` holds (J). The widowed box and year fill as today.
  - **The draft's not-sure lines** quote `wording(question, { answers })`, which follows J through `spouseShown`.
- **Why:**
  - The who answers must not keep "spouse" once J is off.
  - The Fill should give a 2025 widow a complete spouse.
  - The draft's spouse lines are for the joint filer (brainstorm Q6).

### D8: Specs
- **Choice:**
  - `client-intake` MODIFIES "An unmarried client isn't asked about a spouse" and "An unmarried client answers the 'who' questions with Yes or No" to name rule J. It ADDS the widowed requirements and the death-year range.
  - `draft-13614c` MODIFIES the not-sure lines' rule, and ADDS the spouse lines rule.
  - At archive, the `client-intake` Purpose gains a recently widowed client's spouse.

## Risks / Trade-offs

- **[Risk] The browser and the database disagree on the new operators.** → Mitigation:
  - the shared value cases (`tests/support/intake-value-cases.mjs`) gain year-range rows;
  - `tests/database-intake.mjs` adds explicit `intake_holds` parity cases for `gte` and `any`, including an unanswered year, a non-numeric year, 2022 and 2023;
  - the existing loop that checks every catalogue field's visibility runs over the new show-ifs.
- **[Risk] 028 loads before 027 on some database.** → Mitigation: migration names sort 027 before 028, and `db:migrate` applies them in order. The dry run applies both in one transaction.
- **[Risk] Stale spouse answers.** A client who changes from widowed in 2025 to 2015 keeps `sp_*` values in the draft. They are hidden and never printed, as already happens for married; only the who answers are cleaned. → Accepted, the same as today's married case.
- **[Trade-off] A partly typed or cleared death year keeps "spouse" in the who answers** until a whole year is entered (brainstorm I10). → Accepted: while J is false, nothing prints or lists the spouse, and the required year must be whole before a submission. The spec states it with a scenario ("Retyping the year keeps the spouse").
- **[Trade-off] For a 2025 death, "your spouse" stays in the leads and the "who" options.** → Accepted: it is still accurate, and a full late-spouse variant would mean a third wording for every spouse question.
- **[Trade-off] The draft's spouse lines are blank for a 2023 or 2024 death,** though the intake collected them. → Accepted for now, as an open question for the VITA site.

## Migration Plan

1. Implementers write 027 and the drafts. `npm run build:intake` writes 028.
2. The controller dry-runs 027 and 028 together in `begin … rollback` on `vitally-task2`, checking that:
   - the fields load;
   - `sp_first_name`'s show-if has an `any` group;
   - `spouse_death_year` has min 1900 and max 2025;
   - the parity queries agree.
3. Only after the user's OK in chat, `npm run db:migrate:test` applies both, then `npm run test:database` runs.
4. Any shared database applies 027 and 028 together with the front end that ships them. The server reads its own `intake_fields`, not the browser's catalogue. The risky order is the new database with the old front end: the server would require the late spouse's name and date of birth from a 2023–2025 widow that the old browser hides. The new front end with the old database is harmless: the browser asks for more than the server requires. 027 must apply before 028, since 015's loader refuses `any`.
5. **Rollback:** a later catalogue migration without the rules, applied in the same migration as, or before, a migration restoring 011's `intake_holds` and 015's loader and year check. In the other order, 011's `else false` would hide every field whose show-if is an `any`, married spouses included. Stored answers are unaffected.

## Open Questions

- **The draft's spouse lines for a 2023 or 2024 death.** Owner: the user and their VITA-site group member. One rule switch in `draft-form.mjs`.
- **The wording.** The Chinese and senior text of "Your late spouse" / 已故配偶, the late-spouse bank hint and the year-range message. Owner: the group's wording review.
