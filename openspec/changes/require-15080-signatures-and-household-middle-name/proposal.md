## Why

Two gaps were found while trying the client intake. First, a client can tick "I consent" on Form 15080 and never sign. Neither signature is required, so the 15080 sub-step is marked done and the application can be submitted with an unsigned consent. Second, "Add a person" has no middle name. A household member's legal name can't be recorded in full, and the draft 13614-C dependents row shows first and last name only. Both are small catalogue fixes. They come first among the three changes from that review, ahead of the unmarried wording and the multi-select service language.

## What Changes

**Form 15080 signatures**
- From: `gcf_tp_signature` and `gcf_sp_signature` are optional, so consenting without signing passes the missing-answers check, marks the sub-step done, and is accepted by `act_submit`.
- To:
  - the primary signature is required whenever the client consents (`gcf_consent = yes`);
  - the spouse signature is required whenever the client consents and is married (`marital_status = married`);
  - a new tip on the spouse signature says both must sign, or choose "I do not consent".

  These don't change: the consent question stays optional, both dates stay optional and aren't auto-filled, and `gcf_sp_date` still shows once the spouse has signed.
- Reason: a consent with no signature isn't a consent. A couple who can't both sign can decline, and declining doesn't affect service.
- Impact:
  - non-breaking for submitted applications, which aren't re-checked;
  - a draft that consented without signing shows the 15080 step as not done until it's signed or the consent is changed;
  - office-filled applications meet the same rule, because `act_submit` runs `intake_missing` whoever filled the application.

**Household member's middle name**
- From: a household member has `first_name` and `last_name`. The member's summary line, the 13614-C dependents row and the Additional Comments lines for members past the fourth show "First Last".
- To: a new optional field `hh[i].middle_name` sits between first and last name, in both the standard and senior drafts. Those three places show "First Middle Last", with the full middle name. The taxpayer's and spouse's middle initials at the top of the 13614-C don't change.
- Impact: non-breaking. Existing members simply have no middle name.

**Generated files**
- `npm run build:intake` writes `src/intake-catalogue-data.mjs` and `supabase/migrations/024_intake_catalogue_<hash8>.sql`.
- `npm run build:hant` regenerates `src/zh-hant.mjs` for the new Chinese text.
- No migration is written by hand.

## Capabilities

### New Capabilities
- `draft-13614c`: what the draft Form 13614-C shows from the client's answers. It starts with one requirement: the household member's name on the dependents row and in the comment lines.

### Modified Capabilities
- `client-intake`: two ADDED requirements.
  - A household member may have an optional middle name.
  - A client who consents to Form 15080 must sign it, and so must the spouse when married, whoever fills the application.

## Impact

- **Catalogue sources:**
  - `docs/intake-questions/intake-questions.md` and `intake-questions-senior-v2.md`, for Q6.1a and Q14.2/Q14.4;
  - generated `src/intake-catalogue-data.mjs` and `supabase/migrations/024_intake_catalogue_<hash8>.sql`;
  - `src/zh-hant.mjs`.
- **Code:** one shared member-name rule, used by `src/intake-form.mjs` (the member's summary line) and `src/draft-form.mjs` (the dependents row and the comment lines). Document cards keep "First Last", the same as the taxpayer's and spouse's cards.
- **Database:** only the generated catalogue migration. `intake_fields` gains `hh.middle_name`, and the two signatures' `required_to_submit` becomes true. `intake_missing` and `act_submit` are unchanged.
- **Tests:**
  - unit: the catalogue build, the missing-answers check, `draft-form`, and the member's summary line;
  - database: the `intake_missing` parity sets, and submit refused or accepted;
  - browser: the story's household sub-step and its 15080 walk.
- **Docs:** the migration list and counts in `docs/setup.md` and `docs/developer/`.
- **No dependency changes.**
