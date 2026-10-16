## Why

PCDC asks every client to sign Form 14446, the IRS's Virtual VITA/TCE Taxpayer Consent, whether the return is prepared online or in person. The intake doesn't ask for it today, so staff collect it on paper. A client who won't consent to the virtual process can't be served this way, yet today they only find out after filling in the whole form. The consent belongs at the start, and the signatures belong where the client's details are. A filled draft of PCDC's own form saves the volunteer copying them out.

## What Changes

**A consent gate at the start of the form**
- From: "Before you start" has three sub-steps, and steps 1–9 open at once.
- To:
  - a fourth sub-step, **0.4 "Virtual VITA consent (Form 14446)" / 虚拟 VITA 纳税人同意书**, asks the client to tick "I agree to use PCDC's Virtual VITA/TCE process" (`vc_agree`);
  - until they do, Continue stays disabled with a line saying why, and steps 1–9 show in the rail but locked;
  - an unticked box shows a note with PCDC's phone number.
- Reason: a client who doesn't consent need not go on, and a first-time client sees the form's length before committing (brainstorm Q7, Q8).
- Impact:
  - every application in progress opens on 0.4 until the box is ticked;
  - the office's Add a case requires the box but has no lock.

**Signing Form 14446 in "About you"**
- From: no 14446 questions.
- To: a new sub-step **1.5 "Sign Form 14446"**, right after "Your spouse".
  - It shows the details the form will print, then asks the IRS-review question (`vc_review`, Yes/No, required) and the client's typed signature (`vc_tp_signature`, required).
  - Under rule J (married, or a 2025 death) it also asks the spouse's optional signature (`vc_sp_signature`), with a tip for a 2025 death.
  - For a married client it asks the spouse's optional email (`vc_sp_email`).
  - The two signing dates fill themselves with today's date when their signature is first filled.
- Reason: the names, dates of birth and spouse rule are known by then (brainstorm Q9, Q12, Q15).
- Impact: a filled spouse signature means MFJ by default; a blank one means not MFJ, with no new staff indicator yet.

**"View Draft Form 14446"**
- From: only the draft 13614-C.
- To: two buttons, English and 繁體中文版, next to the 13614-C tools on the client's summary page and the staff answers panel.
  - They fill page 3 of PCDC's own 14446 (pages 1–2 are already filled by PCDC): each person's printed name, date of birth, date, phone, email and typed signature, plus the IRS-review boxes from `vc_review`, and the virtual-process box, which follows the consent at 0.4.
  - The spouse block is filled only when the spouse has signed.
- Reason: brainstorm Q2, Q4, Q5.

**The sample cases stay complete.** A hand-written migration, 030, gives the six seeded samples their 14446 answers.

## Capabilities

### New Capabilities

- `draft-14446`: what the draft Form 14446 fills from a client's answers, which blocks it fills, and the languages it comes in.

### Modified Capabilities

- `client-intake`, ADDED:
  - the virtual-process consent comes first, and locks the rest of the form until given;
  - every client signs Form 14446;
  - the 14446 signing dates fill themselves;
  - the seeded sample cases have their 14446 answers.

## Impact

- **Catalogue:**
  - both drafts in `docs/intake-questions/` gain Sections 15 (the consent) and 16 (the signatures);
  - `tools/build-intake-catalogue.mjs` gains the sub-steps `before.virtual` and `about.sign`;
  - the generated `src/intake-catalogue-data.mjs`, `029_intake_catalogue_<hash8>.sql` and `src/zh-hant.mjs`.
- **Database:** the hand-written `030_fixture_answers_14446.sql` redefines `vitally_private.fixture_answers_v2`. No table, RPC, policy or realtime change.
- **Code:**
  - `src/intake-form.mjs` (the gate's helper, and `resolveSubstep`);
  - `src/intake-views.mjs` (the locked rail, Continue on 0.4, 1.5's details, the draft buttons);
  - `src/controller.mjs` (the dates);
  - `src/staff-views.mjs` (the draft buttons);
  - `src/app.mjs` (the draft wiring);
  - a new `src/draft-virtual-consent.mjs`;
  - `src/sample-data.mjs`;
  - `src/client-text.mjs`.
- **Forms:** XFA-stripped copies of PCDC's two 14446 PDFs in `src/forms/`, written once by a new tool script and pinned by SHA-256.
- **Tests:**
  - unit tests;
  - the test helpers default to a consented, signed answer set, so earlier tests keep opening past 0.4;
  - the database suite (the samples are complete);
  - the story ticks 0.4, sees the locked rail, signs 1.5 and opens the draft 14446.
- **Docs:**
  - `docs/developer/frontend.md` (the gate, the sub-steps, the draft);
  - `docs/developer/database.md` and `docs/setup.md` (migrations 029–030, counts).
- **Out of scope:**
  - case tags and any MFJ indicator (their own change);
  - prefilling pages 1–2 (waits on the IRS site permission);
  - a 简体 Form 14446;
  - 15080's dates.
