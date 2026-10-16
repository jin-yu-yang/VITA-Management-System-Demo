## Context

**Form 14446** (Virtual VITA/TCE Taxpayer Consent, Rev. 11-2023) is the IRS consent for a site's virtual process. PCDC asks every client to sign it, in-person cases included.

**PCDC's copies** are on `main` in `docs/media/`: `f14446 - Taxpayer.pdf` (English) and `f14446 - 主报税人.pdf` (繁體). The PCDC admin has given permission to ship them with the demo, PCDC's real site details included.
- **Pages 1–2** are already filled by PCDC: the site details, and how each step is handled.
- **Page 3** has two Yes/No pairs, both already ticked "Yes":
  - Q1, consent to an IRS review of the return for accuracy;
  - Q2, "I agree to use this site's Virtual VITA/TCE Process".
- **Then two signature blocks:** printed name, date of birth, date, telephone, email, signature (electronic) or signature (type/print). The second block is for the "spouse if married filing joint".
- **Both PDFs are XFA forms** with AcroForm fields (41 each). The 繁體 one names its fields differently, and its typed-signature box is read-only. pdf-lib logs "Removing XFA form data…" when it opens one.

**The intake today:**
- **No 14446.** Form 15080 is the optional sub-step `refund.consent`, and its dates are typed by the client.
- **The draft 13614-C** is built in the browser by `buildDraftPdf` (`src/draft-pdf.mjs`), which takes any form's bytes and a field list, from a field map in `src/draft-form.mjs`.
- **The review step already gates:** 9.1's Continue is disabled while alerts remain, with a line saying why, and `resolveSubstep` (`src/intake-form.mjs`) decides where every move and every drawn page lands.
- **The spouse rules from `add-widowed-spouse-rules`:**
  - S (`spouseOnReturn`): married, or widowed with a death from 2023 to 2025;
  - J (`spouseShown`): married, or a 2025 death.

**The seeded samples** come from `vitally_private.fixture_answers_v2` (migration 019), and `tests/database-intake-default.mjs` asserts each has nothing missing.

## Goals / Non-Goals

**Goals:**
- Every client consents to PCDC's virtual process first, at 0.4. The rest of the form stays locked, but visible in the rail, until they do.
- Every client signs Form 14446 at 1.5, after "Your spouse": the IRS-review answer and their typed signature. The spouse signs optionally under rule J.
- The 14446 signing dates fill themselves.
- The client and staff can view a draft 14446, in English and 繁體, filled with each person's page 3 details.
- The seeded sample cases stay complete.

**Non-Goals:**
- case tags, and any staff "MFJ" indicator;
- prefilling pages 1–2;
- a 简体 14446;
- 15080's dates;
- a lock that keeps the consent from being withdrawn;
- an electronic signature in the PDF.

## Decisions

### D1: Sections 15 and 16, and two sub-steps (brainstorm Q7, Q9, Q13, Q15, I1, I9)
- **Choice:** both drafts gain two sections. Section 15, "Virtual VITA consent (Form 14446) / 虚拟 VITA 纳税人同意书", goes to "Before you start". Section 16, "Sign Form 14446 / 签署 14446 表", goes to "About you". A section belongs to one step, so one section can't serve both (brainstorm I9):

  | Id | Sub-step | Type | Required | Show if |
  |---|---|---|---|---|
  | `vc_agree` | `before.virtual` (0.4) | Multi-select with one option, `yes` | yes | always |
  | `vc_review` | `about.sign` (1.5) | Single choice `yes` / `no` | yes | always |
  | `vc_tp_signature` | 1.5 | Signature | yes | always |
  | `vc_tp_date` | 1.5 | Date | no | `vc_tp_signature` is filled |
  | `vc_sp_signature` | 1.5 | Signature | no | rule `joint_possible` |
  | `vc_sp_date` | 1.5 | Date | no | rule `joint_possible` AND `vc_sp_signature` is filled |
  | `vc_sp_email` | 1.5 | Email | no | `marital_status = married` |

  - The builder adds `before.virtual` after `before.language`, and `about.sign` after `about.spouse`.
  - Each section's page text is its intro, on its first sub-step. Section 16's intro has a not-married version without the joint-return line, chosen by rule J.
  - A tip on `vc_sp_signature` shows if `marital_status = widowed` AND rule `joint_possible`.
  - `npm run build:intake` writes migration 029.
- **Why:**
  - Every type, the `rule` clause and tip show-ifs already exist, so no hand-written SQL is needed for the catalogue.
  - The spouse's email follows `sp_phone` (married only), since a late spouse has no email.
- **Alternatives considered:**
  - Moving the personal questions into "Before you start" (brainstorm Q9, option 2). Rejected: step 0 would grow by about ten questions, and the move would reorder the rail, the summary and the draft 13614-C.
  - A Yes/No radio for consent (Q8). Rejected: "No" counts as answered, so the server would need a new "must be Yes" rule.

### D2: The gate (brainstorm Q7, Q8, I2)
- **Choice:**
  - **The helper:** `consented(answers)`, in `src/intake-form.mjs`, is true when `vc_agree` includes `yes`.
  - **Where an unconsented form lands:** `resolveSubstep` sends it to `before.virtual` for any sub-step outside "Before you start". The controller's moves and the drawn page both go through `resolveSubstep`, so nothing past step 0 can be reached or shown.
  - **0.4's Continue** is disabled while not consented, with a line saying why, as 9.1's is.
  - **The rail** draws every step after "Before you start" greyed and locked: no `go-substep` action, `aria-disabled="true"`, and a "Locked" mark.
  - **Unticking** locks them again and keeps the answers.
  - **The office's Add a case** has no lock. `vc_agree` is still required there, so it can't be sent without it.
- **Why:**
  - One place, `resolveSubstep`, already decides every landing, so the gate can't be bypassed by the rail, a summary link or a stored sub-step.
  - The server enforces consent through the existing "required" check.
- **Alternatives considered:** gating with show-ifs. Rejected: an unconsented form would hide every required question, and nothing would be missing.

### D3: 1.5's page (brainstorm I3)
- **Choice:**
  - **The details first:** the page shows, read-only, what the form will print for each person. That is the full name, date of birth, phone and email, the spouse's under J.
  - **Then the questions:** `vc_review`, the signatures and the dates. The page text has a joint-return line under rule J.
- **Why:** the client signs what will be printed, and a typo is fixed where it was typed.

### D4: The dates (brainstorm Q12, I4)
- **Choice:** in the controller's `editAnswers`:
  - when the patch fills `vc_tp_signature` or `vc_sp_signature`,
  - and it was empty in the draft before the edit,
  - and its date is empty,

  the date is set to today, as `YYYY-MM-DD` in the browser's local calendar. The date stays editable, and the server checks it as an ordinary date.
- **Why:** 14446 is the form everyone signs, so its draft should carry a date. 15080's typed dates are left for a later PR.
- **Why each date shows only once its signature is filled** (brainstorm I10): typing never redraws, so a date box already on the page would still look empty after the controller filled it, and a move would re-send the empty box. With the date hidden until signed, leaving the signature field redraws the page with the date filled.

### D5: The draft 14446 (brainstorm Q2, Q4, Q5, Q11, Q16, I5)
- **Choice:**
  - **The forms:** a tool script (`tools/strip-xfa.mjs`) writes XFA-stripped copies of PCDC's two PDFs to `src/forms/`, with page 3's four Yes/No boxes (Q1 and Q2) cleared. `src/draft-virtual-consent.mjs` pins them by SHA-256. If pdf-lib can't flatten a field that has no appearance (an empty electronic-signature field), the tool removes that field.
  - **The field map:** the same module maps answers to page 3's fields, for each language's field names. It fills:
    - the taxpayer block: the full name; `tp_dob` and `vc_tp_date` as MM/DD/YYYY; `tp_phone`; `email`; `vc_tp_signature`;
    - the spouse block, only when `vc_sp_signature` is filled and J holds: the spouse's full name, `sp_dob`, `vc_sp_date`, `sp_phone`, `vc_sp_email`, `vc_sp_signature`;
    - Q1's Yes or No from `vc_review`;
    - Q2's Yes while `vc_agree` is ticked.

    The electronic-signature fields stay empty.
  - **The module's name is letters and dashes only** (`draft-virtual-consent.mjs`, not `draft-14446-form.mjs`): `server.mjs` serves only `src/` modules whose names are letters and dashes, and the forms rule names each served PDF exactly. The first story run found a module with numbers in its name refused, with the app failing to boot.
  - **The build:** `buildDraftPdf` builds it, with the 繁體 font for the 繁體 form, a DRAFT stamp, and the file name `14446-draft.pdf`.
  - **Buttons:** "View Draft Form 14446" and 繁體中文版 sit next to the 13614-C tools on the client's summary page and the staff answers panel. A 简体 screen lists 繁體 as its Chinese option.
- **Why:**
  - Stripping once keeps the console clean, since the story fails on unexpected console messages, and pins exactly what ships.
  - Clearing Q1 and Q2 lets the client's answers decide them. A draft built before the client consents (an office draft, say) then doesn't claim an agreement they never gave.
- **Alternatives considered:**
  - Loading the XFA originals and silencing the warning. Rejected: it hides a library message, and the bytes shipped would differ from what was checked.
  - A third "简体中文版" button opening the 繁體 form. Rejected: the label would mislead.

### D6: Fill fictional details (brainstorm I6)
- **Choice:**
  - `makeSampleAnswers()` gains the 14446 answers: `vc_agree`, `vc_review`, `vc_tp_signature` (the sample's own name) and `vc_tp_date`. It stays a complete application.
  - `sampleAnswersFor`, the Fill path, removes every `vc_*` key.
  - Regenerate (`fictionalAnswers` with `replaceEverything`) keeps the client's `vc_*` answers, as it keeps `form_version` and `email`. Otherwise it would null them, withdrawing the consent and locking the form again.
- **Why:**
  - Tests and fixtures that submit `makeSampleAnswers()` keep passing.
  - A client using Fill still consents and signs themselves, as 15080 is never filled for them.

### D7: Migration 030 (brainstorm Q14, I7)
- **Choice:** `030_fixture_answers_14446.sql`, hand-written, redefines `vitally_private.fixture_answers_v2`, copied from 019. The base answers gain:
  - `"vc_agree":["yes"]` and `"vc_review":"yes"`;
  - a fixed fictional `"vc_tp_date"`;
  - `vc_tp_signature`, built from each sample's own first and last name in the existing `jsonb_build_object`.

  The function stays `immutable security definer set search_path=''` and is revoked as before. Its comment says why 14446 keys are present when 15080's aren't.
- **Why:**
  - The samples must stay complete, and the staff answers panel would otherwise show "Not answered" 14446 rows.
  - 030 must follow 029, because the fixture test checks each sample answer against `intake_fields`.

### D8: Specs
- **Choice:**
  - `client-intake` ADDS:
    - "A client consents to the virtual process before the rest of the form";
    - "Every client signs Form 14446";
    - "The Form 14446 dates fill themselves";
    - "The sample cases include their Form 14446 answers".
  - A new capability, `draft-14446`, ADDS:
    - "The draft Form 14446 fills each signer's details";
    - "The draft's spouse block appears only when the spouse signed";
    - "The draft's IRS-review boxes follow the client's answer";
    - "The draft comes in English and 繁體".
  - At archive, the `client-intake` Purpose gains the 14446 consent and signatures.

## Risks / Trade-offs

- **[Risk] Existing tests open the form past 0.4 with answers that don't consent.** About 69 client-view renders and 44 controller moves would land on 0.4 instead, and review-alert lists gain the new required answers.
  - Mitigation: the test helpers (`v2State`, `v2Store`, `openV2` and their kind) default to a consented, signed answer set (a shared constant in `tests/support/`).
  - Only the gate's own tests use an unconsented set.
  - Any test that pins an alert list is updated on purpose, and the plan says which.
- **[Risk] The XFA-stripped pages render blank, or the read-only 繁體 signature box stays empty.**
  - Mitigation: the plan's first task is a spike. It fills both languages and looks at them in the built-in browser.
  - If the pages are blank it stops for the user.
  - A unit test reads back every filled field.
- **[Risk] The story and Add a case flows submit without 14446.** The story's walks and the office's Add a case must tick 0.4 and sign 1.5. Mitigation: the plan updates every walk that submits, and the story runs twice.
- **[Risk] A new database with an old front end.** The server would require `vc_agree`, `vc_review` and `vc_tp_signature`, which the old browser never asks, so every submission would be refused. Mitigation: deploy 029 and 030 together with the front end.
- **[Trade-off] Every application in progress opens on 0.4** until the box is ticked. Accepted: it's a demo, and the consent is needed anyway.
- **[Risk] Sample cases already seeded keep their old answers.** 030 changes only the function that seeds them, so on a shared database the existing samples show "Not answered" 14446 rows on the staff answers panel until they are reseeded. → Mitigation: a checkpoint reload after deploying re-applies `fixture_answers_v2`. The test stack seeds fresh for every test, so the suites are unaffected. No migration rewrites existing case rows.
- **[Trade-off] Cases submitted before this change** have no 14446 answers. The staff answers panel shows their 14446 rows as "Not answered", and their draft 14446 has empty blocks. Accepted: they predate the form.
- **[Trade-off] Q1 is asked while PCDC's site may require "Yes"** (an open question). Accepted: if so, one question, one box mapping and one fixture key come out.
- **[Trade-off] PCDC's real site details** (name, SIDN, coordinator, phone) ship in the PDFs and the unticked note. Accepted: the PCDC admin gave permission. The project's fictional-data rule still holds for everything about clients.

## Migration Plan

1. **The build:** implementers edit the drafts, and `npm run build:intake` writes 029. Then they write 030 by hand.
2. **The dry run:** the controller dry-runs 029 and 030 together in `begin … rollback` on `vitally-task2`. It checks that:
   - the catalogue loads, with the new fields;
   - `fixture_answers_v2('preparation_ready')` carries `vc_agree`, `vc_review`, `vc_tp_signature` "Mei Chen" and `vc_tp_date`;
   - `intake_missing` of each sample is empty.
3. **Apply:** only after the user's OK in chat, `npm run db:migrate:test` applies both. Then `npm run test:database` runs.
4. **Deployment:** any shared database applies 029 and 030 together with this front end, 030 after 029. Then a checkpoint reload, so the existing sample cases carry their 14446 answers.
5. **Rollback:** a later catalogue migration without Sections 15 and 16, plus a migration restoring 019's `fixture_answers_v2`. Stored `vc_*` answers would then be refused as unknown fields on the next save, so the rollback's catalogue must keep them, or the answers must be cleaned first.

## Open Questions

- **Does PCDC require "Yes" to the IRS review for everyone?**
  - Owner: the user, with their VITA-site group member.
  - What it affects: if yes, `vc_review` leaves 1.5 and 030, and the strip tool leaves Q1's Yes ticked.
- **The wording:** the 0.4 and 1.5 texts, the unticked note, `vc_review` and its tip, the 2025 tip, and the senior Chinese.
  - Owner: the group's wording review. Text only.
- **The XFA-stripped rendering.**
  - Owner: the assistant, in the plan's first task.
  - If the pages come out blank, stop and come back to the user.
