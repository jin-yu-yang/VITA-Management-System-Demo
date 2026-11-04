## ADDED Requirements

### Requirement: An approved review offers the Exit Form
ViTally SHALL offer "Download Exit Form" for an approved review that has a reviewer questionnaire. On a volunteer's case page, each such review in the Independent review panel SHALL have the button, whether or not that volunteer is on the case. On the office's case page, which has no Independent review panel, the Overview SHALL have an Exit Form panel with the button for the latest such review. Neither SHALL appear for a review with no questionnaire, or before there is an approved review. The office's panel SHALL stay on the case at later stages.

#### Scenario: A volunteer sees the button on the approved review
- **WHEN** a volunteer opens a case with an approved review that has a reviewer questionnaire
- **THEN** that review in the Independent review panel has "Download Exit Form"

#### Scenario: A volunteer not on the case sees the button
- **WHEN** a volunteer who is neither the case's preparer nor its reviewer opens that case
- **THEN** the approved review has "Download Exit Form"

#### Scenario: A review with no questionnaire offers nothing
- **WHEN** a case's approved review has no reviewer questionnaire
- **THEN** neither a volunteer's case page nor the office's has "Download Exit Form"

#### Scenario: The office uses the latest approval
- **WHEN** an office persona opens a case with two approved reviews that each have a questionnaire
- **THEN** the Exit Form panel has one button, and it is for the later review

#### Scenario: The office's panel stays after filing
- **WHEN** an office persona opens an e-filed case whose approved review has a questionnaire
- **THEN** the Overview still has the Exit Form panel

#### Scenario: The office sees no panel before approval
- **WHEN** an office persona opens a case with no approved review
- **THEN** the Overview has no Exit Form panel

### Requirement: Staff make the Exit Form in the browser and nothing is kept
Only a staff window SHALL be able to make the Exit Form. The form SHALL be built in the browser from the approved review's questionnaire and the case, and SHALL NOT be uploaded or stored. Pressing "Download Exit Form" SHALL open the PDF in a new tab. If the form can't be made, the tab SHALL say "The Exit Form could not be made. Close this tab and try again.", the case page's error notice SHALL say "The Exit Form could not be made. Try again.", and the notice's Try again SHALL build it again. Making the form SHALL NOT change the case.

If the browser blocks the tab, ViTally SHALL show no error, and SHALL draw the finished PDF as a link in the case page's Intake answers tab, named `exit-form-<client number>.pdf`. The link SHALL stop working after about 60 seconds. The tab SHALL NOT switch.

Known problem, see #122: the button is on the Overview tab, so a person who presses it can't see the link where they are. A volunteer who may not see the case's contact details has no place for the link, so they get no link and no error. This records current behaviour, not the intended one.

#### Scenario: The form opens in a new tab
- **WHEN** a reviewer presses "Download Exit Form" on an approved review
- **THEN** a new tab shows a one-page PDF, and the case's stage and revision are unchanged

#### Scenario: A blocked tab draws the link in the Intake answers tab (known problem, #122)
- **WHEN** the office presses "Download Exit Form" on the Overview tab and the browser blocks the new tab
- **THEN** no error shows and no link can be seen on the Overview tab, and the Intake answers tab, once selected, shows a link named `exit-form-<client number>.pdf`

#### Scenario: A volunteer not on the case gets no link (known problem, #122)
- **WHEN** a volunteer who may not see the case's contact details opens the case
- **THEN** the page has no place for the link

#### Scenario: The link stops working
- **WHEN** about 60 seconds have passed since the form was made
- **THEN** the link's address is revoked

#### Scenario: A failure says so and can be tried again
- **WHEN** the form can't be made
- **THEN** the tab and the error notice say so, and pressing the notice's Try again once the cause is gone makes the form

#### Scenario: A client window makes nothing
- **WHEN** a client session reaches the Exit Form's action
- **THEN** no form is made, and no client screen offers the button

### Requirement: The Exit Form's header comes from the case
The Exit Form SHALL show the tax year (the case's season), the date it was made, the client number, and the taxpayer's name. For a couple (married, or widowed in the tax year, by the intake's own spouse rule) the name SHALL read "Taxpayer & Spouse". The date SHALL be the day the form is made, not the day of the approval.

#### Scenario: A single taxpayer's header
- **WHEN** the form is made on 11/01/2026 for Mei Chen, client number 31, season 2025
- **THEN** it shows 2025, 11/01/2026, 31 and Mei Chen

#### Scenario: A couple's header
- **WHEN** the form is made for a married taxpayer Mei Chen and spouse Lin Wu
- **THEN** the name reads "Mei Chen & Lin Wu"

### Requirement: The Exit Form shows the Federal and State results
For Federal and for State, when the questionnaire has that group, the Exit Form SHALL tick the filing method (e-file or paper). For a refund or an amount owed, it SHALL write the amount as money (for example `$1,234.50`) and tick how it is paid. For a direct debit, it SHALL write the debit date. For a result of `none`, it SHALL tick only the filing method. A group that is absent SHALL leave that section unmarked. Nothing about a bank account SHALL be drawn.

#### Scenario: A refund by direct deposit
- **WHEN** the Federal group says e-file, refund 1234.50 by direct deposit
- **THEN** the form ticks e-file and direct deposit, and writes `$1,234.50`

#### Scenario: An owed direct debit
- **WHEN** the State group says owe 45.50 by direct debit on 04/15/2027
- **THEN** the form ticks direct debit and writes `$45.50` and 04/15/2027

#### Scenario: No refund or amount owed
- **WHEN** the Federal group says paper with a result of `none`
- **THEN** the form ticks only paper, and writes no amount

### Requirement: The Exit Form's Other Tax rows can be filled by hand
Under Other Tax, the Exit Form SHALL cover the template's own boxes and print one row for each Local type (NPT, BIRT, EET, SIT, PAIBWTR), each with a box, an amount line, Owe and Refund, whether or not it applies, so the same layout can be filled by hand. A Local type on the questionnaire SHALL have its box ticked and, for a refund or an amount owed, its Owe or Refund ticked and its amount written. E-file, direct deposit, direct debit and a debit date have no place on a row, so they SHALL go to the front of the Remarks. Every Exit Form SHALL use the Traditional Chinese Noto font for these rows, so it SHALL fetch that font, pinned and checked like the drafts' fonts.

Known problem, see #122: if the font can't be fetched or fails its check, no Exit Form can be made, even for a client with no Chinese in their details. This records current behaviour, not the intended one.

#### Scenario: Every Local type has a row
- **WHEN** the questionnaire has no Local entry
- **THEN** the form still prints a row for each of NPT, BIRT, EET, SIT and PAIBWTR, with nothing ticked

#### Scenario: A Local tax that applies
- **WHEN** the questionnaire has Local SIT, owe 45.00
- **THEN** the SIT row has its box and Owe ticked, and 45.00 written

#### Scenario: A Local tax with no refund or amount owed
- **WHEN** the questionnaire has Local EET with a result of `none`
- **THEN** the EET row has only its box ticked, with no amount

#### Scenario: Details with no place on a row
- **WHEN** the questionnaire has a Local entry that is e-filed and paid by direct debit
- **THEN** those details are at the front of the Remarks

#### Scenario: A failed font check stops the form (known problem, #122)
- **WHEN** the font's bytes are not the pinned ones
- **THEN** no form is made, and the tab and the error notice say so

### Requirement: The Exit Form's values fit their places
Filled values SHALL be drawn in bold, except a value containing Chinese, which SHALL be drawn entirely in the downloaded font. The tax year, the date, the client number, the name and the amounts SHALL start larger than the form's 12 pt English labels. The Remarks SHALL start at 12 pt, and a debit date at 9 pt. A value wider than its place SHALL be drawn smaller, down to 6 pt, and if it still doesn't fit, SHALL be cut and end in "…". This applies to the Remarks, which are drawn on one line, and to the debit date, whose place holds a full date only at 6.5 pt.

Known problem, see #122: the reviewer may enter up to 2000 characters of Remarks, which can be more than the line holds, and the reviewer is not told when the rest is cut. A debit date at 6.5 pt is hard to read on a form for clients. This records current behaviour, not the intended one.

#### Scenario: Header values and amounts are bold and larger than the labels
- **WHEN** the form shows a tax year, a date, a client number, a name and an amount
- **THEN** each is drawn in bold, larger than 12 pt

#### Scenario: A debit date is drawn small (known problem, #122)
- **WHEN** the form shows the debit date 04/15/2027
- **THEN** it is drawn at 6.5 pt

#### Scenario: A short remark is drawn whole
- **WHEN** the Remarks are "Bring the corrected W-2."
- **THEN** the form shows them whole, at 12 pt

#### Scenario: A longer remark is drawn smaller
- **WHEN** the Remarks are wider than their place at 12 pt but fit at 6 pt
- **THEN** the form shows them whole, smaller than 12 pt and at least 6 pt

#### Scenario: A remark too long for the line is cut (known problem, #122)
- **WHEN** the Remarks are 2000 characters
- **THEN** the form shows the start of them at 6 pt, ending in "…"

### Requirement: The Exit Form's template and PDF carry no author
The blank template `src/forms/exit-form-pcdc.pdf` SHALL have no Author or Title in its document info. The template has no form fields, so each value SHALL be drawn at a fixed place on the page. The local server SHALL serve the template by its exact name. A generated Exit Form SHALL be one page, with an empty Author, and the Title "Exit Form".

#### Scenario: The template has no document info
- **WHEN** the committed template is read
- **THEN** it has no Author and no Title

#### Scenario: A generated form has no author
- **WHEN** the form is made
- **THEN** the PDF's Author is empty and its Title is "Exit Form"

#### Scenario: The server serves only the exact name
- **WHEN** a browser requests `/src/forms/exit-form-pcdc.pdf`, and then `/src/forms/exit-form.pdf`
- **THEN** the first is served, and the second is not found
