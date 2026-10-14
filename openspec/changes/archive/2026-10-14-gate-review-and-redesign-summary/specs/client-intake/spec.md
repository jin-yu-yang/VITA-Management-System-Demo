## ADDED Requirements

### Requirement: 9.1's Continue waits for the alerts to be fixed
On the review step's first page (9.1, `review.check`), Continue SHALL be disabled while the application has any alert. An alert is a required answer that is missing, or an answer that is invalid. Next to the disabled Continue, the page SHALL say "Fix the items above to continue." (请先修正上面的问题，然后继续。). Open documents (Needed or Maybe needed cards that are Not done or Later) SHALL NOT disable Continue.

#### Scenario: A required answer is missing
- **WHEN** a client whose application has no city opens 9.1
- **THEN** Continue is disabled, and the page says "Fix the items above to continue."

#### Scenario: Only documents are open
- **WHEN** a client whose answers are complete and valid, with a Needed card marked Later, opens 9.1
- **THEN** Continue is enabled, and the card is listed under "You can still submit"

### Requirement: The summary and Submit pages appear only after the alerts are fixed
The summary (9.2, `review.summary`) SHALL be visible only while the application has no alerts. The Submit page (9.3, `review.submit`) SHALL be visible only while the application has no alerts and after the client has pressed Continue on 9.2. That Continue SHALL be saved with the application as a visit to `review.submit`, so it holds on another device and in a later session. A sub-step that isn't visible SHALL NOT be listed on the rail or counted in the form's progress, and no move SHALL reach it.

When an alert returns, 9.2 and 9.3 SHALL hide again. A client on either page, or pressing "Back to summary", SHALL land on 9.1. When the alert is fixed, 9.2 SHALL return, and so SHALL 9.3 if it was earned, without another Continue.

#### Scenario: 9.2 and 9.3 are hidden while an alert exists
- **WHEN** a client's application has a missing required answer
- **THEN** the rail's review step lists only 9.1

#### Scenario: Continue on 9.1 opens the summary
- **WHEN** a client with no alerts, who hasn't pressed Continue on 9.2 before, presses Continue on 9.1
- **THEN** the form opens 9.2, and the rail lists 9.1 and 9.2 but not 9.3

#### Scenario: Continue on 9.2 opens the Submit page
- **WHEN** a client with no alerts presses Continue on 9.2
- **THEN** the form opens 9.3, and the application's saved visits include `review.submit`

#### Scenario: Leaving 9.2 another way doesn't earn 9.3
- **WHEN** a client on 9.2 chooses a Change link, or a step on the rail, without pressing Continue
- **THEN** 9.3 is still not listed on the rail

#### Scenario: An alert returns after 9.3 was earned
- **WHEN** a client who has reached 9.3 changes an answer so that a required answer is missing, then returns to the review step
- **THEN** the form shows 9.1, and the rail lists neither 9.2 nor 9.3

#### Scenario: "Back to summary" with a new alert
- **WHEN** a client opens a part from the summary's Change link, clears a required answer there, and presses "Back to summary"
- **THEN** the form shows 9.1

#### Scenario: Submit pressed on a page drawn before an alert came back
- **WHEN** a client on 9.3, with the box ticked, presses Submit after another device has cleared a required answer, before the page has redrawn
- **THEN** nothing is submitted, any invalid answer is shown, and the form shows 9.1 with its alerts

#### Scenario: The fix brings both pages back
- **WHEN** that client fixes the answer
- **THEN** the rail lists 9.1, 9.2 and 9.3 again, without another Continue on 9.2

### Requirement: The summary page explains itself and puts its tools first
The summary page SHALL show, in this order:
1. Three paragraphs of introduction:
   - "Here is a summary of everything you told us in your application." (以下是您在申请中填写的全部信息。)
   - "Before you submit, make sure you have answered everything that applies to you. To change an answer, choose **Change** next to that part, or choose that part in the list of steps." (提交之前，请确认所有适用于您的问题都已回答。如需修改，请点击相应部分旁边的“修改”，或在步骤列表中选择该部分。)
   - "With the buttons below, you can print this summary, or view and download a draft Form 13614-C made from your answers." (您可以用下方的按钮打印这份汇总，或查看并下载根据您的回答生成的 13614-C 草稿。)
2. The Print button and View Draft 13614-C, with the draft's other two languages.
3. "Expand all" (全部展开) and "Collapse all" (全部收起), aligned to the right.
4. The application's details and its sections, one per step.

#### Scenario: The page's order
- **WHEN** a client opens 9.2 in English
- **THEN** the intro's three paragraphs come first, then Print and View Draft 13614-C, then Expand all and Collapse all, then the sections

#### Scenario: In Chinese
- **WHEN** a client opens 9.2 in Simplified Chinese
- **THEN** the buttons read 全部展开 and 全部收起, and the intro's second paragraph names the Change link as “修改”

### Requirement: Each summary section can collapse
Each section of the summary (one per step, including the documents section) SHALL collapse and expand from its heading. The heading SHALL be a button that reports whether its section is expanded, named for screen readers "Show or hide {section}" (显示或隐藏{section}). Every section SHALL start expanded. "Collapse all" SHALL collapse every section, and "Expand all" SHALL expand every section. The keyboard SHALL stay on the button that was pressed. Which sections are collapsed SHALL be kept for that browser window as the client moves through the form.

#### Scenario: Collapse one section
- **WHEN** a client presses the "About you" heading on 9.2
- **THEN** that section's answers are hidden, the heading reports collapsed, and the other sections stay expanded

#### Scenario: Collapse all, then Expand all
- **WHEN** a client presses Collapse all, then Expand all
- **THEN** every section is collapsed after the first press and expanded after the second, and the keyboard stays on the button pressed

#### Scenario: The state is kept while moving
- **WHEN** a client collapses "About you", opens a part with its Change link, and goes back to the summary
- **THEN** "About you" is still collapsed

### Requirement: The printed summary shows every section
Printing the summary with its Print button SHALL print every section with its answers, including sections that are collapsed on screen. The printout SHALL NOT include the section toggles' icons, the Expand all and Collapse all buttons, the Change links, the Print button or the draft buttons.

#### Scenario: Printing with a collapsed section
- **WHEN** a client collapses "About you" and prints the summary with its Print button
- **THEN** the printout includes "About you" with its answers
