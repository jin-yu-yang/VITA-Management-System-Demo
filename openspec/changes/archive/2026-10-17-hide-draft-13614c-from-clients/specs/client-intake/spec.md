## MODIFIED Requirements

### Requirement: The summary page explains itself and puts its tools first
The summary page SHALL show, in this order:
1. Three paragraphs of introduction:
   - "Here is a summary of everything you told us in your application." (以下是您在申请中填写的全部信息。)
   - "Before you submit, make sure you have answered everything that applies to you. To change an answer, choose **Change** next to that part, or choose that part in the list of steps." (提交之前，请确认所有适用于您的问题都已回答。如需修改，请点击相应部分旁边的“修改”，或在步骤列表中选择该部分。)
   - "With the buttons below, you can print this summary, or view and download a draft Form 14446 made from your answers." (您可以用下方的按钮打印这份汇总，或查看并下载根据您的回答生成的 14446 表草稿。)
2. The Print button, and View Draft Form 14446 with its 繁體中文版. The summary page SHALL NOT offer the draft Form 13614-C in any language.
3. "Expand all" (全部展开) and "Collapse all" (全部收起), aligned to the right.
4. The application's details and its sections, one per step.

#### Scenario: The page's order
- **WHEN** a client opens 9.2 in English
- **THEN** the intro's three paragraphs come first, then Print and View Draft Form 14446, then Expand all and Collapse all, then the sections
- **AND** no View Draft 13614-C button is on the page, and the intro's third paragraph doesn't mention Form 13614-C

#### Scenario: In Chinese
- **WHEN** a client opens 9.2 in Simplified Chinese
- **THEN** the buttons read 全部展开 and 全部收起, the intro's second paragraph names the Change link as “修改”, and its third paragraph names only the 14446 表草稿
- **AND** no draft 13614-C button is offered, in Simplified or Traditional Chinese

## ADDED Requirements

### Requirement: A client page never makes a draft 13614-C
A draft Form 13614-C SHALL be made only for staff. When anyone who is not staff asks for one, for example with a button added to a client page, the page SHALL open no tab, build no draft, offer no link and show no error. A client SHALL still be able to make the draft Form 14446.

#### Scenario: A forged button on the summary page
- **WHEN** a View Draft 13614-C button is added to a client's summary page and pressed
- **THEN** no tab opens, no draft link appears, and no error is shown

#### Scenario: Staff are unaffected
- **WHEN** the case's preparer presses View Draft 13614-C on the case page after the claim
- **THEN** the draft 13614-C opens in its own tab, as before
