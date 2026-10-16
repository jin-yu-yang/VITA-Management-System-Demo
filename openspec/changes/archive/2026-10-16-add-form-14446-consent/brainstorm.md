# Brainstorm: add-form-14446-consent

Decision log from the explore and brainstorm conversation of 2026-10-16. The user agreed every decision below before propose.

## Background

- **Form 14446** (Virtual VITA/TCE Taxpayer Consent, Rev. 11-2023) is the IRS consent for a site's virtual process. PCDC asks every client to sign it, in-person cases included.
- **PCDC's last-year copies are on `main`:**
  - `docs/media/f14446 - Taxpayer.pdf` (English);
  - `docs/media/f14446 - 主报税人.pdf` (繁體, despite the 简体 file name);
  - no 简体 version.
- **What they hold:**
  - Pages 1–2 are already filled by PCDC: the site name, address, SIDN, coordinator, contact and phone, the site type, and how the site handles each step.
  - Page 3 holds two Yes/No pairs and two signature blocks. Both "Yes" boxes are already ticked:
    - **Q1**, "Request to Review your Tax Return for Accuracy": "If the site preparing this return is selected, do you consent to having your return reviewed for accuracy, by an IRS employee?"
    - **Q2**, "I agree to use this site's Virtual VITA/TCE Process".
  - Each signature block has: printed name, date of birth, date, telephone, email, signature (electronic) or signature (type/print). The second block is for the "spouse if married filing joint".
- **Both PDFs are fillable XFA forms with AcroForm fields** (41 each). The 繁體 form names its fields differently, and its typed-signature box (`signature_1[0].signature[0]`) is read-only.
- **The PCDC admin has given permission** to ship these PDFs, PCDC's real site details included, with the demo.
- **The intake today:**
  - It has no 14446.
  - Form 15080 is the optional sub-step `refund.consent` in step 6, "Refund & permission".
  - Its dates `gcf_tp_date` and `gcf_sp_date` are ordinary optional dates the client types. The drafts' "auto-fill today" note was never built.
  - The draft 13614-C is built by `buildDraftPdf` (`src/draft-pdf.mjs`), which takes any form's bytes and a field list.
- **The spouse rules from `add-widowed-spouse-rules`:**
  - S (`spouseOnReturn`): married, or widowed with a death from 2023 to 2025;
  - J (`spouseShown`): married, or a 2025 death.
- **The user's 14446 signature rules** (memory `form-14446-plans`):
  - Married: both sign, so MFJ by default. A married client who leaves the spouse off is non-MFJ, the rare domestic-violence case.
  - A spouse who died in 2025: both sign (the client signs the late spouse's name), so MFJ by default.
  - A spouse who died in 2023 or 2024, or earlier: non-MFJ. The primary signs, and the spouse section is hidden.

## Decision chain

**Q1. Scope.**
- In: A, the 14446 consent and signatures in the intake; and B, "View Draft Form 14446".
- Out:
  - C, case tags (MFJ, City tax), which become their own change: a new table, RPCs and a staff screen;
  - D, prefilling pages 1–2, which waits on the IRS site permission in December;
  - any staff "MFJ" indicator, which the tags change will derive from the 14446 signatures.

**Q2. What the draft fills.**
- PCDC's copies are already "prefabricated", so the draft fills only page 3's two blocks: printed name, date of birth, date, telephone number, email address, and signature (type/print), for each person.
- The electronic-signature field stays empty.

**Q3. The intro text.**
- The assistant drafted it, in the 15080 page's style (see "Texts" below).
- The joint-return line shows under rule J. A 2025 death gets a tip under the spouse signature.
- The Chinese and senior text go to the group's wording review.

**Q4. The draft's buttons: two.**
- "View Draft Form 14446" (English) and "繁體中文版". There is no 简体 button, because no 简体 form exists, and a 简体 label opening a 繁體 form would mislead.
- A 简体 screen lists 繁體 as its Chinese option.
- A future 简体 form is one more entry in the form map.

**Q5. Q1 (the IRS review).**
- It is asked in the intake as a Yes/No, not left pre-ticked, and its answer ticks the form's box.
- Q2 (the virtual-process agreement) is what signing means, and it is asked as the gate (Q7).

**Q6. The spouse signature: option A.** It is optional whenever the spouse block shows (rule J).
- A filled signature means MFJ by default; a blank one means not MFJ.
- That matches the tax law, since a survivor may file jointly for the year of death but needn't.
- The catalogue has no conditional-required mechanism.

**Q7. The update: the consent comes first, as a gate.**
- A new sub-step **0.4 "Virtual VITA consent (Form 14446)"** sits at the end of "Before you start" (0.1 Before you start, 0.2 How you'd like help, 0.3 Language, 0.4 …).
- It asks only "do you consent?" (Q2 of the form).
- Until the client consents, steps 1–9 are shown in the rail but locked, so a first-time client sees how long the form is before committing.
- The gate works like the review step's: Continue stays disabled, with a line saying why.
- A client who doesn't consent need not go on, which saves their time.

**Q8. The consent control: a checkbox** ("I agree …"), not a Yes/No radio.
- It is a required question whose only answer is "I agree", so the server already refuses a submission without it. No new "must be Yes" rule or migration is needed.
- "No" would lead nowhere. Instead, an unticked box shows a note with PCDC's phone number.

**Q9. Where the signatures go: option 1.** A new sub-step **1.5 "Sign Form 14446"** in "About you", right after "Your spouse".
- By then the names, dates of birth, phone, email, marital status and rule J are all known.
- Option 2, moving those questions into "Before you start", was rejected:
  - step 0 would grow by about ten questions, spouse questions included, since those depend on the marital status asked in step 1;
  - the move would reorder the rail, the summary, the draft 13614-C, the story and many tests.

**Q10. The Chinese title: 虚拟 VITA 纳税人同意书.** It's the name PCDC's own 繁體 form uses (「表格 14446 虛擬 VITA 納稅人同意書」), and its agreement line reads 「本人同意使用此服務處的虛擬 VITA/TCE 流程」. The other candidates were 远程 VITA 同意书, 远程 VITA 纳税人同意书 and 虚拟 VITA 同意书.

**Q11. The XFA warning: the user's fix.**
- pdf-lib logs "Removing XFA form data…" whenever it opens an XFA form. In the browser that is a console warning, and the story fails on unexpected console messages.
- The fix: a small tool script strips the XFA once, and the stripped copies are committed to `src/forms/`, pinned by SHA-256 like the 13614-C. The warning then never fires.
- **A spike comes first in apply:** with the XFA removed, the form falls back to its plain fields and page drawing. That is usually fine for a static XFA form, but nobody has looked at a filled copy.
  - Fill a draft in both languages and look at it in the built-in browser.
  - Stop if the pages come out blank.
  - The read-only 繁體 signature box is checked in the same spike.

**Q12. The dates.** The controller sets `vc_tp_date` and `vc_sp_date` to today when their signature goes from empty to filled and the date is still empty. The dates stay editable. 15080's dates are left as they are, for a later PR.

**Q13. The ids: `vc_*`**, beside 15080's `gcf_*`.

**Q14. The sample cases.**
- `tests/database-intake-default.mjs:196` asserts that every seeded sample has nothing missing. The samples come from `vitally_private.fixture_answers_v2` (migration 019), whose comment carries no `gcf_*` key because 15080 is optional; 14446 isn't optional.
- So a small hand-written migration, **030**, redefines `fixture_answers_v2`, copied from 019 as 027 did.
- It adds the 14446 answers for the six never-married samples, so they stay complete, and the staff answers panel shows no "Not answered" 14446 rows for them.

**Q15. The spouse's email.** It is never asked today, so 1.5's spouse part gets an optional `vc_sp_email`. It shows only when married, like `sp_phone`, since a late spouse has no email.

**Q16. Q1's pre-ticked "Yes".**
- To the user's surprise, the VITA site enforced it for everyone. The user will check with their group member.
- **Provisional plan:** the XFA-strip tool also clears both Q1 boxes in the committed copies, and the draft ticks Yes or No from `vc_review`.
- **Found in the planning recheck:** Q2 is pre-ticked too. The tool clears it as well, and the draft ticks Q2's Yes only while `vc_agree` is ticked, so a draft built before the consent claims no agreement.

## Implementation decisions found while planning

**I1. The questions.** They live in two new sections in both drafts (see I9): Section 15, "Virtual VITA consent (Form 14446) / 虚拟 VITA 纳税人同意书", holds `vc_agree`; Section 16, "Sign Form 14446 / 签署 14446 表", holds the rest:

| Id | Sub-step | Type | Required | Show if |
|---|---|---|---|---|
| `vc_agree` | 0.4 `before.virtual` | Multi-select, one option `yes` ("I agree to use PCDC's Virtual VITA/TCE process" / 本人同意使用此服务处的虚拟 VITA/TCE 流程) | yes | always |
| `vc_review` | 1.5 `about.sign` | Single choice: `yes` I consent / `no` I do not consent | yes | always |
| `vc_tp_signature` | 1.5 | Signature | yes | always |
| `vc_tp_date` | 1.5 | Date | no | `vc_tp_signature` is filled (see I10) |
| `vc_sp_signature` | 1.5 | Signature | no | rule `joint_possible` |
| `vc_sp_date` | 1.5 | Date | no | rule `joint_possible` AND `vc_sp_signature` is filled |
| `vc_sp_email` | 1.5 | Email | no | `marital_status = married` |

- **The 2025 tip** under `vc_sp_signature` shows if `marital_status = widowed` AND rule `joint_possible`.
- **Sub-step order:**
  - "Before you start" becomes `before.ready`, `before.service`, `before.language`, `before.virtual`;
  - "About you" becomes `about.you`, `about.address`, `about.marital`, `about.spouse`, `about.sign`, `about.situation`, `about.irs`.
- **The migration:** `npm run build:intake` writes 029.

**I2. The gate.**
- **One helper** decides it: `consented(answers)`, true when `vc_agree` includes `yes`.
- **Where an unconsented form lands:** `resolveSubstep` sends it to `before.virtual` for any sub-step outside "Before you start". Every move goes through `resolveSubstep`, and so does the page that is drawn, so the controller can't move into steps 1–9.
- **Continue on 0.4** is disabled while not consented, with a line saying why, as 9.1's is.
- **The rail** draws the steps after "Before you start" greyed and locked, with no `go-substep` action, `aria-disabled` and a "Locked" mark, until the client consents.
- **Unticking** locks them again and keeps the answers.
- **It is not built with show-ifs:** an unconsented form would otherwise hide every required question, and nothing would be missing.
- **Add a case** has no lock, since the office asks in person, but `vc_agree` is required there too.
- **Drafts already in progress** open on 0.4 until the box is ticked.

**I3. 1.5's page.**
- It first shows the details the form will print, read-only: the full names, dates of birth, phone and email.
- Then come `vc_review`, the signatures and the dates.
- The page text shows the joint-return line under rule J.

**I4. The dates.**
- **Where:** the controller's `editAnswers`.
- **What:** when the patch fills `vc_tp_signature` (or `vc_sp_signature`), and it was empty before, and its date is empty, the date is set to today in the browser's local calendar.
- **Edits and the server:** the client can still change the date, and the server checks it as an ordinary date.

**I5. The draft 14446.**
- **A tool script** writes XFA-stripped copies to `src/forms/` (for example `f14446-pcdc-en.pdf` and `f14446-pcdc-zh-t.pdf`), with page 3's four Yes/No boxes cleared (Q1, and Q2, which is ticked from `vc_agree`). They are pinned by SHA-256 in a new module, `src/draft-virtual-consent.mjs`, which maps answers to page 3's fields for each language's field names.
- **What it fills:**

  | Block | Boxes |
  |---|---|
  | Taxpayer | full name; `tp_dob` and `vc_tp_date` as MM/DD/YYYY; `tp_phone`; `email`; `vc_tp_signature` |
  | Spouse | only when `vc_sp_signature` is filled and J holds: the spouse's full name, `sp_dob`, `vc_sp_date`, `sp_phone`, `vc_sp_email`, `vc_sp_signature` |
  | Q1 | Yes or No from `vc_review` |
  | Q2 | ticked from `vc_agree` |

- **The build** reuses `buildDraftPdf`, with the 繁體 font for the 繁體 form, a DRAFT stamp, and the file name `14446-draft.pdf`.
- **Buttons:** "View Draft Form 14446" and 繁體中文版 sit next to the 13614-C tools on the client's summary page and the staff answers panel.

**I6. Fill fictional details.**
- `makeSampleAnswers()` stays a complete application, its 14446 answers included, so it matches 030's base and every test that submits it (for example `tests/database-client-numbers.mjs:32-34`).
- The Fill path, `sampleAnswersFor`, leaves out the `vc_*` keys. A client using Fill still ticks 0.4 and signs 1.5 themselves, as 15080 is never filled for them.

**I7. Migration 030.**
- It redefines `vitally_private.fixture_answers_v2`, copied from 019. It adds `vc_agree: ["yes"]`, `vc_review: "yes"`, `vc_tp_signature` built from each sample's own name, and a fixed fictional `vc_tp_date`.
- It must come after 029, because the fixture test checks each sample answer against `intake_fields`.
- Its comment says why 14446 keys are present when 15080's aren't.

**I8. Specs.**
- `client-intake` ADDS:
  - every client consents to the virtual process before the rest of the form;
  - every client signs Form 14446, with the spouse under J;
  - the 14446 dates fill themselves;
  - the sample cases are complete.
- A new capability, `draft-14446`, covers what the draft fills and its two languages.

**I9. Two sections, not one.** The builder requires every top-level question to be listed in a sub-step of its own section's step, and a section belongs to one step. So `vc_agree` (step "Before you start") and the signatures (step "About you") can't share a section. Section 15 goes to "Before you start" (`sections: [0, 15]`), and Section 16 to "About you". Each section's page text is its intro, shown on its first sub-step. Section 16's intro has a not-married version without the joint-return line, the builder's existing "Intro text (not married)" block, chosen by rule J.

**I10. `vc_tp_date` shows once the signature is filled.** The controller fills the date in the draft at the first keystroke of the signature, but typing never redraws the page. If the date box were already on the page, it would still look empty, and a move would re-send that empty box and erase the date (memory `change-sees-updated-draft`). With the date shown only once `vc_tp_signature` is filled, as `vc_sp_date` and 15080's `gcf_sp_date` already are, the signature becomes a visibility driver. Leaving the field redraws the page with the date box already filled. Before that, no date box is on the page to re-send.

## Texts (drafts, for the wording review)

**0.4's page text:**
> **Everyone signs this form, whether we prepare your return online or in person.** / **无论线上还是到场报税，每位客户都需要签署此表。**
>
> Form 14446 is the IRS consent for "virtual" VITA. Parts of your return are handled while you are not sitting with the preparer: we may review your documents, interview you by phone or Zoom, and prepare and check your return without you there. Pages 1 and 2 of the form explain how PCDC handles each step. / 14446 表是美国国税局的"虚拟 VITA"同意书。部分报税工作会在您不在场时进行：我们可能会审核您的文件，通过电话或 Zoom 与您面谈，并在您不在场时准备和检查您的报税表。表格第 1、2 页说明了 PCDC 如何处理每个步骤。
>
> Your consent lasts one year from the date you sign. / 您的同意自签署之日起一年内有效。
>
> **Note:** these systems are not run by the IRS. If they are hacked or breached, federal law may not protect your information. / **注意：**这些系统并非由国税局运营。如遭黑客攻击或泄露，联邦法律可能无法保护您的信息。
>
> If you believe your information was used improperly, contact TIGTA at **1-800-366-4484** or complaints@tigta.treas.gov. / 如您认为您的信息被不当使用，请联系 TIGTA：**1-800-366-4484** 或 complaints@tigta.treas.gov。

**The unticked note:** "We need this consent to prepare your return. If you'd rather not give it, please call PCDC at 215-922-6156." / 「我们需要您的同意才能为您报税。如您不愿同意，请致电 PCDC：215-922-6156。」

**1.5's page text:**
> Sign Form 14446 with the details below, as they will appear on the form. / 请核对以下将填入表格的信息，然后签署 14446 表。
>
> *(Rule J only:)* If you file a joint return, your spouse signs too. / *（仅合并申报时显示：）*如合并申报，您的配偶也需要签名。

**`vc_review` wording:** "If our site is chosen at random, may an IRS employee review your return for accuracy?" / 「如本站点被随机抽中，您是否同意国税局工作人员审核您的报税表是否准确？」

Its tip: "The IRS keeps none of your personal information from this review. Saying no doesn't change our service." / 「国税局不会保留审核中的任何个人信息；不同意也不会影响我们为您提供的服务。」

**The 2025 tip:** "Type your late spouse's full name. You sign for them because a joint return is possible for 2025." / 「请输入您已故配偶的全名。由于 2025 年仍可合并申报，由您代为签名。」

## Open questions

- **Q1's policy.** Does PCDC require "Yes" from everyone?
  - Owner: the user, with their VITA-site group member.
  - If yes: `vc_review` drops out of 1.5 and 030, and the tool leaves Yes ticked. That is one question, one box mapping and one fixture key.
- **The wording.** The 0.4 and 1.5 texts, the unticked note, `vc_review` and its tip, the 2025 tip, and the senior Chinese.
  - Owner: the group's wording review. Text only.
- **The XFA-stripped rendering.**
  - Owner: the assistant, in apply's first task (the spike).
  - If the pages come out blank, stop and come back to the user.
