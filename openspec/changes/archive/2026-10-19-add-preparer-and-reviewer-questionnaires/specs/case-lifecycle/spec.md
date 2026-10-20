## MODIFIED Requirements

### Requirement: Clients are told at each new step
The client's status panel SHALL show the message for their case's stage, in their language:

| Stage | English | 简体 |
|---|---|---|
| Request sent | Your application is with PCDC. The office will review it soon and may call you. | PCDC 已收到您的申请。办公室会尽快查看，并可能致电您。 |
| Screening in progress | PCDC is reviewing your application. We may call you to confirm your information and documents. | PCDC 正在审核您的申请。我们可能会致电您，核对您的信息和文件。 |
| Pending intake / filing | Your application has been checked. It is waiting for a volunteer to start preparing your return. | 您的申请已核对完毕，正在等待志愿者开始准备您的报税表。 |
| Pending review | Your return is prepared and is waiting for an independent reviewer. | 您的报税表已准备好，正在等待审核志愿者检查。 |
| Ready to exit | Your return has been checked. PCDC will contact you to sign Form 8879, which is needed before your return can be filed. | 您的报税表已检查完毕。PCDC 会联系您签署 8879 表，签署后才能递交报税表。 |
| Ready to e-file | You signed Form 8879. PCDC will e-file your return next. | 您已签署 8879 表。PCDC 接下来会以电子方式递交您的报税表。 |
| E-filed | Your return was e-filed. The IRS will confirm whether it is accepted. | 您的报税表已电子递交。国税局会确认是否接受。 |

At Ready to exit, the message above SHALL be shown only for a case approved without a reviewer questionnaire (before the questionnaires existed). A case approved with one SHALL show the variant for the signing plan the approval chose (capability `review-and-corrections`):

| Signing plan | Chosen when | English | 简体 |
|---|---|---|---|
| Appointment | in person, and the visit was not same-day | Your return has been checked. Please come to PCDC on {when} to sign Form 8879. It is needed before your return can be filed. | 您的报税表已检查完毕。请于 {when} 到 PCDC 签署 8879 表，签署后才能递交报税表。 |
| Same day | in person, on a same-day visit | Your return has been checked. Please sign Form 8879 with a volunteer before you leave today. It is needed before your return can be filed. | 您的报税表已检查完毕。请在今天离开前与志愿者一起签署 8879 表，签署后才能递交报税表。 |
| Customer Portal | e-sign in the TaxSlayer Customer Portal | Your return has been checked. Please e-sign Form 8879 in the TaxSlayer Customer Portal. It is needed before your return can be filed. | 您的报税表已检查完毕。请在 TaxSlayer 客户门户（Customer Portal）以电子方式签署 8879 表，签署后才能递交报税表。（门户为英文页面，可用浏览器翻译） |
| Go over first | the reviewer did not go over the return with the client, whatever the signing method, until the office resolves its go-over follow-up | Your return has been checked. PCDC will contact you to go over your return together. After that, you will sign Form 8879. It is needed before your return can be filed. | 您的报税表已检查完毕。PCDC 会联系您，先和您一起查看报税表，再请您签署 8879 表，签署后才能递交报税表。 |

`{when}` SHALL be the appointment's date and time as the reviewer entered it, in the screen's language, with the weekday and no year. It SHALL never be shifted by the viewer's time zone. The variant SHALL be set at approval and SHALL change only once: when the office resolves the go-over follow-up of a Go over first case, with either outcome, the client SHALL from then on see the variant for the reviewer's signing method (Appointment with the stored date and time, Same day, or Customer Portal), chosen by the same rules as at approval. The client SHALL read only the signing plan and the appointment, never an answer of either questionnaire.

Draft, Filing in progress, Corrections in progress, Review in progress and Closed SHALL keep today's messages.

Each new move SHALL add one line to the client's history, in their language:

| Move | English | 简体 |
|---|---|---|
| Start screening, and the office's submit | PCDC started reviewing your application. We may call you. | PCDC 已开始审核您的申请。我们可能会致电您。 |
| Mark ready to e-file | PCDC recorded that you signed Form 8879. Your return is ready to e-file. | PCDC 已记录您签署了 8879 表。您的报税表可以电子递交了。 |
| Mark e-filed | PCDC e-filed your return. | PCDC 已电子递交您的报税表。 |

Earlier history lines SHALL keep their words and translations. No client message or history line SHALL name a phone number.

#### Scenario: A history line in 简体
- **WHEN** a client reading in 简体 opens a case an admin marked ready to e-file
- **THEN** its history shows "PCDC 已记录您签署了 8879 表。您的报税表可以电子递交了。"

#### Scenario: No phone number
- **WHEN** a client reads any new stage message or history line, in any language, including each Ready to exit variant with an appointment
- **THEN** none of them contains a phone number

#### Scenario: An appointment to sign
- **WHEN** the reviewer approves a drop-off case with in person and an appointment of 2026-11-02 14:30, and the client opens their progress page in English
- **THEN** the status panel reads "Your return has been checked. Please come to PCDC on Monday, November 2 at 2:30 PM to sign Form 8879. It is needed before your return can be filed."

#### Scenario: The same appointment in 简体
- **WHEN** that client opens the page in 简体, in a browser set to any time zone
- **THEN** the status panel reads "您的报税表已检查完毕。请于 11月2日星期一 下午2:30 到 PCDC 签署 8879 表，签署后才能递交报税表。"

#### Scenario: Signing on site the same day
- **WHEN** the reviewer approves a same-day case with in person
- **THEN** the client's status panel shows the Same day message

#### Scenario: Signing in the Customer Portal
- **WHEN** the reviewer approves a case with the Customer Portal and yes
- **THEN** the client's status panel shows the Customer Portal message

#### Scenario: Not yet gone over
- **WHEN** the reviewer approves with "no" to going over the return and the Customer Portal
- **THEN** the client's status panel shows the Go over first message, not the Customer Portal one

#### Scenario: After the go-over is resolved the client sees the signing variant
- **WHEN** the reviewer approved with "no" to going over the return and the Customer Portal, and the office then resolves the go-over follow-up, with either outcome
- **THEN** the client's status panel shows the Customer Portal message instead of the Go over first message, while the case is still at Ready to exit
- **AND WHEN** the reviewer had chosen in person with an appointment on a drop-off case
- **THEN** after the resolve the client sees the Appointment message with that appointment's date and time

#### Scenario: A case approved before this change
- **WHEN** a client opens a case that was approved before the questionnaires existed
- **THEN** the status panel shows "Your return has been checked. PCDC will contact you to sign Form 8879, which is needed before your return can be filed."

### Requirement: Admins record signing and e-filing, with a confirmation
At Ready to exit, an admin SHALL be offered **Mark ready to e-file**. At Ready to e-file, an admin SHALL be offered **Mark e-filed**. Both SHALL be offered on the case page and on that case's Follow-ups row. Each SHALL open a confirmation dialog that:
- names the client (their first and last name from the application, or "this client" when both are empty) and the application ID;
- says what the client will be told;
- requires a confirmation box to be ticked before the move is sent.

The database SHALL refuse either move without that confirmation. Neither move SHALL have an undo. Volunteers SHALL see neither button.

Mark ready to e-file SHALL wait for the reviewer's conversation with the client. While the approved review's conversation is not yet recorded as completed, the database SHALL refuse the move as not available. The admin SHALL see "The reviewer still needs to record the conversation with the client." instead of the button, on the case page and on the Follow-ups row.

Mark ready to e-file SHALL also wait for the office to go over the return with the client. While the case has an open follow-up with purpose `go_over_return` (capability `office-follow-up`), the database SHALL refuse the move as not available, and nothing SHALL be recorded. The admin SHALL see "The office still needs to go over the return with the client." instead of the button, on the case page and on the Follow-ups row, and the Follow-ups row SHALL read "Waiting for the office to go over the return with the client.". The wait SHALL end when that follow-up is resolved, whatever the outcome, and when it is cancelled.

#### Scenario: Marking a case e-filed
- **WHEN** an admin presses Mark e-filed… for Mei Chen's case, ticks the confirmation and confirms
- **THEN** the dialog had named "Mei Chen" and the application ID, the case is E-filed, and the client's history gains "PCDC e-filed your return."

#### Scenario: The reviewer's call comes first
- **WHEN** a case is at Ready to exit and its reviewer has not yet recorded the conversation with the client
- **THEN** the admin sees "The reviewer still needs to record the conversation with the client." instead of Mark ready to e-file…, its Follow-ups row reads "Waiting for the reviewer's call with the client.", and the database refuses the move as not available

#### Scenario: The office's go-over comes first
- **WHEN** a reviewer approved with "no" to going over the return, and the go-over follow-up is still open
- **THEN** the admin sees "The office still needs to go over the return with the client." instead of Mark ready to e-file…, its Follow-ups row reads "Waiting for the office to go over the return with the client.", and the database refuses the confirmed move as not available, leaving the case at Ready to exit

#### Scenario: Resolved after reaching the client
- **WHEN** the office resolves the go-over follow-up with outcome reached
- **THEN** the admin is offered Mark ready to e-file…, its Follow-ups row reads "Waiting for the client to sign Form 8879.", and the database accepts the confirmed move

#### Scenario: Resolved with no further contact
- **WHEN** the office resolves the go-over follow-up with outcome no further contact
- **THEN** the admin is offered Mark ready to e-file…, and the database accepts the confirmed move

#### Scenario: Keeping it as it is
- **WHEN** the admin closes the dialog without confirming
- **THEN** the case stays at Ready to e-file and nothing is sent

#### Scenario: From Follow-ups
- **WHEN** an admin presses Mark ready to e-file… on a Follow-ups row
- **THEN** the same confirmation opens without leaving Follow-ups
