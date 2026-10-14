# Brainstorm: require-15080-signatures-and-household-middle-name

A raw capture of the design agreed in the conversation on 2026-10-13, during CLAUDE.md lifecycle step 2.

## Background

The user tried the client intake screen and reported four fixes:

1. **Language (Q0.3):** "Preferred service language" is single choice, but a client who prefers Cantonese and also understands Mandarin can be given a Mandarin-speaking volunteer. It should be multi-select, and probably reworded.
2. **"Spouse" wording for unmarried clients:** a never-married client still reads "How many jobs did you and your spouse have in 2025?" (Q9.1a) and the income lead "Did you or your spouse receive any of these in 2025?". Many later questions and leads say "you and your spouse". Drop the spouse when the client isn't married.
3. **Household and dependents:** "Add a person" also needs a middle name.
4. **Form 15080:** consenting without signing is allowed. The primary taxpayer signature isn't required, so the client can skip it, and the sub-step is still marked done.

**Survey (read-only, before any decision):**
- **All four are catalogue changes:** `docs/intake-questions/` → `npm run build:intake` → a new catalogue migration. CLAUDE.md routes catalogue changes through an OpenSpec change.
- **Item 1** changes the answer's shape from a string to an array. The work board, office queue and case pool filter on it. The progress panel shows it, the fixture seeding writes it (019, redefined in 023), and stored answers would need migrating. It's large.
- **Item 2** needs a catalogue feature that doesn't exist yet: wording that depends on another answer. Today the catalogue has only standard and senior versions. The "Me / My spouse / No one" options already hide "My spouse" unless `marital_status = married` (`intake-form.mjs:68`), so the rule exists, but only for options. The spouse wording sits in:
  - three questions: Q5.2, Q9.1a and Q12.4;
  - three leads shared by nine sub-steps: `RECEIVED`, `PAID` and `HAPPENED` in `tools/build-intake-catalogue.mjs:73-75`.

  It's medium-sized.
- **Item 3:** the `hh` group has `first_name` and `last_name` only. The group's fields come from the catalogue end to end:
  - the database loader `put_intake_field` (015) stores each field;
  - the household sub-step renders fields from `question.fields`;
  - the answers panel walks them.

  So a new optional field needs no hand-written database or form code. The names are joined by hand in three places:
  - `intake-form.mjs:740`, the member's summary line;
  - `draft-form.mjs:312`, the comment lines for members past the fourth row;
  - `draft-form.mjs:429`, the 13614-C dependents row `nameFirstLast`.
- **Item 4:** `gcf_tp_signature` and `gcf_sp_signature` are `Optional` in both drafts. They show only when `gcf_consent = yes`, and the spouse's also needs `marital_status = married`. Required-ness is enforced only for visible questions, in two places:
  - the browser's missing-answers list (`intake-catalogue.mjs:211`), which also drives the sub-step's "done" mark;
  - the database's `intake_missing`, which `act_submit` calls (`023_remove_intake_v1.sql:278`) and which reads `required_to_submit` and `show_if` from `intake_fields`.

  So marking the signatures Required in the drafts fixes both.
- **The "auto-fill today" notes** on `gcf_tp_date` and `gcf_sp_date` aren't implemented. Nothing fills them.

## Decision chain

**Q1. One change or several?**
- Options:
  - (A) three changes, smallest first: items 3 and 4, then item 2, then item 1;
  - (B) one change for all four;
  - (C) two changes: items 2, 3 and 4, then item 1.
- **Decided (user): A, starting with items 3 and 4.**
- "One change, one clear result". Each change writes a catalogue migration, so they land one after another, never in parallel.
- The other two changes come later: `add-unmarried-intake-wording` (item 2) and `allow-multiple-service-languages` (item 1).

**Q2. Item 2's wording (noted for the later change).** The user's replacement for the wages lead was the same as the current text. The assumption is that they meant "Did you receive any of these in 2025?". That gets confirmed when item 2 is explored.

**Q3. What becomes required on the Form 15080 page?**
- Options:
  - (A) only the primary signature;
  - (B) the primary signature, plus the spouse's when married;
  - (C) A or B, plus auto-filling today's date.
- **Decided (user): B.** "If the client and their spouse can't manage to sign both of their names, they could select `I do not consent`."
- **The dates stay optional and aren't auto-filled.** `gcf_sp_date` keeps its rule of showing once the spouse has signed.
- **The consent question stays optional.** Declining must not affect service.
- **A new tip on the spouse signature** points to the way out: "Both of you need to sign. If your spouse can't sign, choose 'I do not consent' above." It has senior wording too, and the Chinese is for the group to review.

**Q4. Office-filled applications (user's note).**
- They follow the same rule. `act_submit` runs `intake_missing` whoever filled the application.
- So when office staff fill an application for a client who ticked "I consent" on paper, they type the client's name, and the spouse's when married. Otherwise they choose "I do not consent".
- No office-specific exception.

**Q5. Where the household middle name shows.**
- First proposal: the member's summary line and the comment lines show "First Middle Last", but the 13614-C dependents row stays first and last, because the paper column reads "Name (first, last)".
- **Decided (user):** "We will do (first, middle, last)", so the 13614-C row gets the middle name too.
- **Full middle name, not an initial.** The taxpayer's and spouse's middle initials at the top of the form keep `"initial"`, because those paper fields are "Middle Initial".
- **A long name still fits.** `draft-pdf.mjs:323` shrinks a one-line field's text to fit, down to 4 pt.

**Q6. The middle name field itself.**
- **`hh[i].middle_name`, Text, Optional,** between `first_name` and `last_name`, in both drafts. It follows the client's own middle name (Q1.2).
- **Wording:**
  - standard: "Middle name / 中间名", with the tip "Leave blank if this person doesn't have one. / 如没有可留空。";
  - senior: "Middle name / 这个人的中间名", with the tip "If this person doesn't have a middle name, leave this empty. / 有就写，没有就空着。".
- **Sample fill:** household members stay without middle names. The field is optional.

**Q7. Document cards (planning review).**
- The plan proposed that document cards keep "First Last", the same as the taxpayer's and spouse's cards, which show no middle names.
- **Decided (user): yes, they stay "First Last".**

## Side notes from the conversation (not in this change)

- **Form 14446** is a planned sub-step under step 5 ("Refund & permission"), with a "View Draft Form 14446" next to "View Draft Form 13614-C".
  - It will be filled with pdf-lib, the same as the 13614-C.
  - PCDC's last-year 14446 is on `main` (#63), in English and 繁體 only.
  - Pages 1–2 wait on the IRS's permission, which arrives early December.
- **Staff case tags** are a planned feature, e.g. "City tax" or "MFJ". A couple who both signed Form 14446 are MFJ by default.
- So the intake still doesn't ask filing status. That's why the spouse signature's rule is "married", not "filing jointly".

## Design

- **Catalogue (both drafts):**
  - add `hh[i].middle_name`;
  - mark `gcf_tp_signature` and `gcf_sp_signature` Required;
  - add the spouse-signature tip.
- **Generated files:** `npm run build:intake` writes `src/intake-catalogue-data.mjs` and `supabase/migrations/024_intake_catalogue_<hash8>.sql`. There's no hand-written migration.
- **Names:** one shared rule joins `first_name`, `middle_name` and `last_name` with spaces and skips unanswered parts. It's used for the member's summary line, the comment lines and the 13614-C row.
- **繁體:** the catalogue's Chinese feeds it, so run `npm run build:hant` and commit `src/zh-hant.mjs`.
- **Spec `client-intake`:** two ADDED requirements.
  - a household member may have an optional middle name, and it shows on the form and on the draft 13614-C;
  - a client who consents to Form 15080 must sign it, and so must the spouse when married, whoever fills the application.
- **Existing data:**
  - submitted applications aren't re-checked;
  - a draft that consented without signing shows the 15080 step as not done until it's signed or the consent is changed.

## Acceptance

- **Unit tests, `npm test`:**
  - the build tests: the new field, both required flags, the tip;
  - the missing-answers check: consent yes with no primary signature → missing; married with no spouse signature → missing; not married → no spouse signature needed; consent no or unanswered → nothing needed;
  - the member's summary line, the 13614-C row and the comment lines, each with and without a middle name.
- **Database, `npm run db:migrate:test` then `npm run test:database`:**
  - submit is refused (VT007) without the primary signature, and without the spouse's when married;
  - it's accepted with consent declined;
  - an office-filled application meets the same rule;
  - `hh[].middle_name` saves.
- **Browser, `npm run test:browser`:** the story's 15080 walk already types both signatures. The household sub-step shows the new field.
- **Other checks:** `npm run build:hant -- --check`, `npm run build:intake` leaving nothing to commit, `npx openspec validate --all`, and CI.
