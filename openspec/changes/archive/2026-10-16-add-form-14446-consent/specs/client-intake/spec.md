## MODIFIED Requirements

### Requirement: The summary page explains itself and puts its tools first
The summary page SHALL show, in this order:
1. Three paragraphs of introduction:
   - "Here is a summary of everything you told us in your application." (以下是您在申请中填写的全部信息。)
   - "Before you submit, make sure you have answered everything that applies to you. To change an answer, choose **Change** next to that part, or choose that part in the list of steps." (提交之前，请确认所有适用于您的问题都已回答。如需修改，请点击相应部分旁边的“修改”，或在步骤列表中选择该部分。)
   - "With the buttons below, you can print this summary, or view and download a draft Form 13614-C or Form 14446 made from your answers." (您可以用下方的按钮打印这份汇总，或查看并下载根据您的回答生成的 13614-C 或 14446 草稿。)
2. The Print button; View Draft 13614-C, with the draft's other two languages; and View Draft Form 14446, with its 繁體中文版.
3. "Expand all" (全部展开) and "Collapse all" (全部收起), aligned to the right.
4. The application's details and its sections, one per step.

#### Scenario: The page's order
- **WHEN** a client opens 9.2 in English
- **THEN** the intro's three paragraphs come first, then Print, View Draft 13614-C and View Draft Form 14446, then Expand all and Collapse all, then the sections

#### Scenario: In Chinese
- **WHEN** a client opens 9.2 in Simplified Chinese
- **THEN** the buttons read 全部展开 and 全部收起, and the intro's second paragraph names the Change link as “修改”

## ADDED Requirements

### Requirement: A client consents to the virtual process before the rest of the form
"Before you start" SHALL end with a fourth sub-step, 0.4 "Virtual VITA consent (Form 14446)" (虚拟 VITA 纳税人同意书). It SHALL show the Form 14446 page text, then one required checkbox, `vc_agree`: "I agree to use PCDC's Virtual VITA/TCE process" (本人同意使用此服务处的虚拟 VITA/TCE 流程).

Until the box is ticked:
- 0.4's Continue SHALL be disabled, with the line "We need this consent to prepare your return. If you'd rather not give it, please call PCDC at 215-922-6156." (我们需要您的同意才能为您报税。如您不愿同意，请致电 PCDC：215-922-6156。);
- the rail SHALL list the steps after "Before you start", each shown as locked and not selectable;
- no move SHALL reach a sub-step after "Before you start". A form opened, or returned to, at such a sub-step SHALL show 0.4.

Unticking the box SHALL lock those steps again and keep every answer. The submission SHALL be refused without the box ticked, whoever fills the application. The office's Add a case form SHALL ask the box but SHALL NOT lock its parts.

#### Scenario: A new client sees the whole form, locked
- **WHEN** a client who hasn't ticked the box opens 0.4
- **THEN** Continue is disabled with the line about PCDC's phone, and the rail lists "About you" through "Review & submit" as locked

#### Scenario: Ticking unlocks the form
- **WHEN** the client ticks "I agree to use PCDC's Virtual VITA/TCE process" and presses Continue
- **THEN** the form opens "About you", and the rail's steps are no longer locked

#### Scenario: A saved place past the gate
- **WHEN** a client whose draft is at "Mailing address" but who never ticked the box opens the form
- **THEN** the form shows 0.4

#### Scenario: Unticking after a Change from the summary
- **WHEN** a client who opened 0.4 through the summary's Change link unticks the box
- **THEN** the page shows Continue disabled with the line about PCDC's phone, not "Back to summary"

#### Scenario: Unticking locks it again
- **WHEN** a client who has filled "About you" unticks the box
- **THEN** the steps after "Before you start" are locked again, and the answers in "About you" are kept

#### Scenario: The server refuses without consent
- **WHEN** an application without `vc_agree` is submitted
- **THEN** the submission is refused, naming `vc_agree` as missing

#### Scenario: The office's form
- **WHEN** the office opens Add a case for a walk-in client
- **THEN** every part can be opened, and the case can't be sent until `vc_agree` is ticked

### Requirement: Every client signs Form 14446
"About you" SHALL have a sub-step after "Your spouse", 1.5 "Sign Form 14446" (签署 14446 表). It SHALL first show, read-only, the details the form will print for each signer: the full name, date of birth, phone and email. It SHALL then ask:
- `vc_review`, required: "If our site is chosen at random, may an IRS employee review your return for accuracy?", with "I consent" and "I do not consent";
- `vc_tp_signature`, the client's typed full name, required;
- `vc_tp_date`, the date, optional, shown once the client's signature is filled.

While filing with the spouse is possible (rule `joint_possible`: married, or widowed with the spouse's death in 2025), 1.5 SHALL also ask:
- `vc_sp_signature`, the spouse's typed full name, optional;
- `vc_sp_date`, its date, optional, shown once the spouse signature is filled.

For a widowed client, the spouse signature SHALL carry the tip "Type your late spouse's full name. You sign for them because a joint return is possible for 2025." For a married client, it SHALL carry the tip "Leave this empty if you won't file a joint return." (如不合并申报，请留空。), and 1.5 SHALL also ask the spouse's email, `vc_sp_email`, optional.

A client for whom filing with the spouse isn't possible SHALL NOT be asked any spouse part of 1.5. The same rules SHALL apply whoever fills the application, the client or the office.

#### Scenario: A never-married client
- **WHEN** a never-married client opens 1.5
- **THEN** it shows the client's own details and asks the IRS-review question and the client's signature, with no spouse part

#### Scenario: A married client
- **WHEN** a married client opens 1.5
- **THEN** it also asks the spouse's signature, with the tip "Leave this empty if you won't file a joint return.", and the spouse's email, and the application can be submitted without them

#### Scenario: A spouse who died in 2025
- **WHEN** a widowed client whose spouse died in 2025 opens 1.5
- **THEN** it asks the spouse's signature with the late-spouse tip, but not the spouse's email

#### Scenario: A spouse who died in 2024
- **WHEN** a widowed client whose spouse died in 2024 opens 1.5
- **THEN** no spouse part is shown

#### Scenario: The required answers
- **WHEN** a client submits without the IRS-review answer or their own signature
- **THEN** the submission is refused, naming `vc_review` or `vc_tp_signature` as missing

### Requirement: The Form 14446 dates fill themselves
When the client's 14446 signature (`vc_tp_signature`) goes from empty to filled and its date (`vc_tp_date`) is empty, the date SHALL be set to today. The spouse's signature and date (`vc_sp_signature`, `vc_sp_date`) SHALL behave the same. A date that is already filled SHALL NOT change, and either date SHALL stay editable. Form 15080's dates SHALL NOT be filled this way.

#### Scenario: Signing fills the date
- **WHEN** a client with an empty 14446 date types their signature
- **THEN** the date reads today's date

#### Scenario: A typed date is kept
- **WHEN** a client who typed their own 14446 date then signs
- **THEN** the date they typed is kept

### Requirement: The sample cases include their Form 14446 answers
Every seeded sample case SHALL carry a ticked `vc_agree`, a `vc_review`, a `vc_tp_signature` that is the sample client's own name, and a `vc_tp_date`, so that no sample has a 14446 answer missing. "Fill fictional details" SHALL NOT tick 0.4 or sign 1.5 for the client, and regenerating the fictional details SHALL keep the client's own 14446 answers.

#### Scenario: A sample is complete
- **WHEN** a workspace's sample cases are seeded
- **THEN** each sample has nothing missing to submit, and the "preparation_ready" sample's 14446 signature reads "Mei Chen"

#### Scenario: Regenerate keeps the consent
- **WHEN** a client who ticked 0.4 and signed 1.5 regenerates the fictional details
- **THEN** 0.4 is still ticked, and 1.5's answers are unchanged

#### Scenario: Fill leaves the consent to the client
- **WHEN** a client who hasn't ticked 0.4 uses "Fill fictional details"
- **THEN** 0.4 is still unticked and 1.5's signatures are still empty
