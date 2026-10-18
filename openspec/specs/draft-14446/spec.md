# draft-14446 Specification

## Purpose
What the draft Form 14446 (Virtual VITA/TCE Taxpayer Consent), which ViTally fills on PCDC's own form from a client's intake answers, shows: each signer's details on page 3, when the spouse's block is filled, how the two IRS-review boxes follow the client's answers, and the English and 繁體 versions.

## Requirements

### Requirement: The draft Form 14446 fills each signer's details
The draft Form 14446 SHALL be PCDC's own Form 14446, with pages 1 and 2 as PCDC filled them. On page 3, it SHALL fill the client's signature block from the application's answers:
- the printed name: the first, middle and last name;
- the date of birth and the 14446 date (`vc_tp_date`), as MM/DD/YYYY;
- the telephone number;
- the email address;
- the typed signature (`vc_tp_signature`).

A box whose answer is empty SHALL stay empty. The electronic-signature fields SHALL stay empty. The draft SHALL carry a "DRAFT" stamp, like the draft 13614-C.

#### Scenario: A client's block
- **WHEN** the draft is built for Mei Chen, born 1984-05-12, who signed "Mei Chen" on 2026-02-02
- **THEN** page 3's first block reads the printed name "Mei Chen", the date of birth 05/12/1984, the date 02/02/2026, her phone, her email and the typed signature "Mei Chen"

#### Scenario: An empty date
- **WHEN** the draft is built for a client whose 14446 date is empty
- **THEN** the first block's date box is empty

### Requirement: The draft's spouse block appears only when the spouse signed
The draft SHALL fill page 3's second signature block only when filing with the spouse is possible (married, or widowed with the spouse's death in 2025) and the spouse's 14446 signature (`vc_sp_signature`) is filled. It SHALL then fill:
- the spouse's printed name and date of birth;
- the spouse's 14446 date (`vc_sp_date`);
- the spouse's phone;
- the spouse's 14446 email (`vc_sp_email`);
- the typed signature.

Otherwise, the second block SHALL stay empty.

#### Scenario: A married couple who both signed
- **WHEN** the draft is built for a married client whose spouse, Wei Lin, signed "Wei Lin"
- **THEN** the second block reads the printed name "Wei Lin" and the typed signature "Wei Lin"

#### Scenario: A married client whose spouse didn't sign
- **WHEN** the draft is built for a married client who left the spouse signature empty
- **THEN** the second block is empty, the spouse's name included

#### Scenario: A spouse who died in 2025
- **WHEN** the draft is built for a widowed client whose spouse died in 2025, with the spouse signature filled
- **THEN** the second block reads the late spouse's name, date of birth and signature, with no phone or email

### Requirement: The draft's IRS-review boxes follow the client's answer
On page 3, "Request to Review your Tax Return for Accuracy" SHALL tick "Yes" when `vc_review` is "yes", "No" when it is "no", and neither when it is unanswered. "I agree to use this site's Virtual VITA/TCE Process" SHALL tick "Yes" while the client has ticked 0.4's consent (`vc_agree`), and neither box otherwise.

#### Scenario: The client declines the review
- **WHEN** the draft is built for a client who answered "I do not consent" to the IRS review
- **THEN** the review's "No" box is ticked and its "Yes" box isn't, and the virtual-process "Yes" box is ticked

#### Scenario: A draft before the consent
- **WHEN** the draft is built for an office draft whose 0.4 box isn't ticked yet
- **THEN** neither virtual-process box is ticked

### Requirement: The draft comes in English and 繁體
The draft Form 14446 SHALL be offered in English and in Traditional Chinese, as "View Draft Form 14446" and "繁體中文版". This SHALL be on the client's summary page, next to the Print button, and on the staff answers panel. No Simplified Chinese 14446 SHALL be offered. On a Simplified Chinese screen, the Traditional Chinese form SHALL be the Chinese option. Building either language SHALL write no message to the browser console.

#### Scenario: The summary page in Simplified Chinese
- **WHEN** a client using Simplified Chinese opens 9.2
- **THEN** the 14446 buttons offer English and 繁體中文版, and no 简体中文版

#### Scenario: The Traditional Chinese draft
- **WHEN** staff choose 繁體中文版 for a case
- **THEN** the draft opens PCDC's Traditional Chinese 14446, with page 3 filled and its typed signatures readable

#### Scenario: A quiet console
- **WHEN** a client opens either draft
- **THEN** no message appears in the browser console

### Requirement: The draft 14446's tab names its form
While a draft Form 14446 is being made, and if it can't be made, its tab SHALL be titled "Draft Form 14446" (14446 表草稿), in the screen's language. A draft Form 13614-C's tab SHALL keep the title "Draft 13614-C" (13614-C 草稿).

#### Scenario: A client's 14446 that can't be made
- **WHEN** a client presses View Draft Form 14446 in English and the draft can't be built
- **THEN** the tab says "The draft could not be made. Close this tab and try again." and is titled "Draft Form 14446"

#### Scenario: In Simplified Chinese
- **WHEN** a client using Simplified Chinese presses View Draft Form 14446
- **THEN** the tab is titled "14446 表草稿" while the draft is made
