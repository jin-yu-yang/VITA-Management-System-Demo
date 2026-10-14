## Context

The client intake's questions live in the two catalogue drafts under `docs/intake-questions/`, standard and senior. `tools/build-intake-catalogue.mjs` (`npm run build:intake`) turns them into:
- `src/intake-catalogue-data.mjs`, which the browser reads;
- a generated `supabase/migrations/NNN_intake_catalogue_<hash8>.sql`, which the database loads through `vitally_private.load_intake_catalogue` (015) into `intake_fields` and `intake_substeps`.

The newest catalogue migration is 022, and the newest migration is 023. The local test stack `vitally-task2` has 001–023 applied.

Required-ness is enforced only for questions that are visible under their `showIf`, in two places that agree by test (`tests/database-intake.mjs`, the parity sets):
- **Browser:** `missingToSubmit` in `src/intake-catalogue.mjs:211`, which also feeds each sub-step's "done" mark.
- **Database:** `vitally_private.intake_missing` (011), which `act_submit` (023:278) calls for every application, whoever filled it. A non-empty list raises VT007.

The 15080 questions (Q14.1–Q14.5) are all Optional today. The two signatures show only after `gcf_consent = yes`, and the spouse's also needs `marital_status = married`. Nothing implements the drafts' "auto-fill today" notes on the dates.

The household group `hh` is a catalogue `group`. Its fields are stored per field (`hh.first_name`, …), rendered by the household sub-step from `question.fields`, and checked by `missingToSubmit` per member. The member's name is joined by hand in three places:
- `src/intake-form.mjs:740` (`memberLine`, the member's summary line). `formatAnswer` uses it for the group, which the client's review summary (`intake-views.mjs:460`, `client-views.mjs:216`), the office's review (`office-views.mjs:404`) and the staff answers panel (`staff-views.mjs:737`) all show. The editable member cards are titled "Person N" and don't show the name;
- `src/draft-form.mjs:312` (`memberLine`, the Additional Comments lines for members past row 4);
- `src/draft-form.mjs:429` (the 13614-C row field `nameFirstLast`).

`src/document-cards.mjs:500` joins names for document cards (first and last, for the taxpayer, the spouse and members alike).

The design was agreed with the user on 2026-10-13 (`brainstorm.md`). It is the first of three changes from a review of the intake screen. The other two are the unmarried wording and the multi-select service language.

## Goals / Non-Goals

**Goals:**
- A consenting client can't submit without the primary signature, nor without the spouse's when married. The 15080 sub-step isn't "done" until they're there.
- A household member can have a middle name, shown wherever the member's full name is shown on the form and on the draft 13614-C.
- Everything comes from the catalogue. The only migration is the generated one.

**Non-Goals:**
- Auto-filling or requiring the 15080 dates.
- Requiring consent, or asking filing status. MFJ will come from Form 14446 and staff tags, which are later features.
- Middle names on document cards, or middle initials for household members.
- The unmarried wording (item 2) and the multi-select service language (item 1). Each is its own later change.
- Re-checking applications that were already submitted.

## Decisions

### D1: Mark the signatures Required in the drafts; no new rule type
- **Choice:**
  - `gcf_tp_signature`: `Signature · Required`, keeping `Show if gcf_consent = yes`.
  - `gcf_sp_signature`: `Signature · Required`, keeping `Show if gcf_consent = yes AND marital_status = married`.
  - Both drafts change, because the build requires the senior structure to equal the standard one.
- **Why:** required plus show-if already means "required when shown", in both the browser and the database. The generated migration updates `required_to_submit`, and `intake_missing` needs no change.
- **Considered:** a hand-written migration or a special case in `intake_missing`. That would be a second source of the rule, and the parity test would then need to know about it.

### D2: The spouse signature is required when married (user's decision B)
- **Choice:** required whenever the spouse signature is visible. The tip on Q14.4 points to the way out:
  - standard: `Both of you need to sign. If your spouse can't sign, choose **I do not consent** above. / 需要您和配偶都签名。如配偶无法签名，请在上方选择**不同意**。`
  - senior: `You both need to sign. If your spouse can't sign, choose **No, I do not agree** above. / 您和您爱人都要签名。如果您爱人没办法签名，请在上面选**不同意**。`

  Each version names its own "no" option label, and the bold follows Q14.1's tip. The Chinese is for the group to review.
- **Why:** a joint consent needs both signatures, and declining doesn't affect service.
- **Considered:**
  - (A) only the primary signature: it leaves a married consent half-signed;
  - (C) auto-filling today's date: new behaviour nobody asked for.

### D3: The dates and the consent stay optional
- **Choice:** Q14.1, Q14.3 and Q14.5 don't change. `gcf_sp_date` keeps its rule of showing once `gcf_sp_signature` is filled.
- **Why:** the user's decision. The volunteer completes the dates in person.

### D4: Office-filled applications follow the same rule
- **Choice:** no exception. When staff fill an application for a client who ticked "I consent" on paper, they type the signatures, or choose "I do not consent".
- **Why:** `act_submit` runs `intake_missing` whoever filled the application (user's note). One rule is simpler and honest.

### D5: `hh[i].middle_name`, optional, between first and last name
- **Choice:** a new draft entry, Q6.1a, after Q6.1 in both drafts:
  - standard: "Middle name / 中间名", `hh[i].middle_name` · Text · Optional, with the tip "Leave blank if this person doesn't have one. / 如没有可留空。";
  - senior: "Middle name / 这个人的中间名", with the tip "If this person doesn't have a middle name, leave this empty. / 有就写，没有就空着。".

  Its limits are those of the other group text fields.
- **Why:** it mirrors the client's own middle name (Q1.2). Group fields are catalogue-driven end to end (the 015 loader, the household sub-step, the answers panel), so no hand-written form or database code is needed.

### D6: One name rule for a member: "First Middle Last"
- **Choice:**
  - one helper joins `first_name`, `middle_name` and `last_name` with single spaces, skipping unanswered parts;
  - the member's summary line (`intake-form.mjs:740`), the comment lines (`draft-form.mjs:312`) and the 13614-C row `nameFirstLast` (`draft-form.mjs:429`) use it;
  - the draft keeps its `oneLine` treatment of each part;
  - the full middle name is used, not an initial.
- **Why:** the user said "We will do (first, middle, last)". A long name still fits the row, because `draft-pdf.mjs:323` shrinks a one-line field's text to fit, down to 4 pt.
- **Considered:**
  - keeping the row "first, last" to match the paper column: rejected by the user;
  - a middle initial: the paper's middle-initial fields are for the taxpayer and spouse only.
- **Document cards (`document-cards.mjs:515`) stay "First Last",** the same as the taxpayer's and spouse's cards, which don't show middle names either. Confirmed by the user at the planning review (2026-10-13).

### D7: Sample data unchanged
- **Choice:** `makeSampleAnswers` and `seed_fixtures` don't add middle names or 15080 answers.
- **Why:** the field is optional, and the samples deliberately carry no section-14 answers (`sample-data.mjs:117`, 019:31).

### D8: Specs
- **`client-intake`:** ADDED "A household member may have a middle name" and ADDED "A client who consents to Form 15080 signs it".
- **New capability `draft-13614c`:** ADDED "A household member's name on the draft shows first, middle and last name".
- **At archive:**
  - write a real Purpose for `draft-13614c`, because archive writes TBD;
  - broaden `client-intake`'s Purpose, which today mentions only intake versions, to cover what clients are asked.

## Risks / Trade-offs

- **[Risk] A draft that consented without signing now shows the 15080 step as not done.** → Mitigation: that's the intended fix. The client signs, or changes the consent. Submitted applications aren't re-checked.
- **[Risk] A married client whose spouse isn't there can't submit with consent.** → Mitigation: the tip says to choose "I do not consent". The user accepted this.
- **[Risk] A 繁體 or English drift if `build:hant` is skipped.** → Mitigation: CI runs `npm run build:hant -- --check`.
- **[Risk] The shared test stack runs ahead of `main`.** Once 024 is applied to `vitally-task2`, `main`'s `npm run test:database` fails "the field table matches the catalogue" until this change merges, because `main`'s catalogue has no `hh.middle_name`. → Mitigation: say so when asking to apply, and in the PR, the same as 023.
- **[Risk] The generated migration's number collides with another branch.** → Mitigation: this change lands before the other two. Check `main` for a new 024 before building.
- **[Trade-off] Document cards don't show the middle name.** → Accepted, to match the taxpayer's and spouse's cards (D6).

## Migration Plan

- **Deploy:** `npm run db:migrate` applies `024_intake_catalogue_<hash8>.sql`, which only reloads the catalogue. It's safe on a stack with drafts in progress.
- **Rollback:** a later catalogue migration with the old flags. Applied migrations are never edited.
- **Verify on the test stack:**
  - after `npm run db:migrate:test`, `intake_fields` has `hh.middle_name`, and both signatures have `required_to_submit = true`;
  - `npm run test:database` passes.

## Open Questions

- The 15080 Chinese tips (D2) and the senior middle-name wording (D5) are for the group's wording review. They don't block this change.
