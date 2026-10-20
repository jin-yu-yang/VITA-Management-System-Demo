# case-lifecycle Specification

## Purpose
The stages a tax-help case moves through, from Request sent to E-filed. It covers each stage's stored key, its staff name and the client's own label, and the moves between stages and who may make each one. That includes screening starting when an admin first opens a case, and admins recording signing and e-filing behind a confirmation. It also covers how the work board, the case pool, Follow-ups, the case page and the client's progress page show every stage, and what the client is told at each new step.

## Requirements

### Requirement: A case moves through the main chain of stages
A case SHALL be in exactly one of these stages. Each stage's key, as stored, and its staff name are:

| Key | Staff name |
|---|---|
| `draft` | Draft |
| `received` | Request sent |
| `screening` | Screening in progress |
| `preparation_ready` | Pending intake / filing |
| `preparing` | Filing in progress (preparing) |
| `corrections_required` | Corrections in progress |
| `review_ready` | Pending review |
| `reviewing` | Review in progress |
| `review_approved` | Ready to exit |
| `ready_to_efile` | Ready to e-file |
| `efiled` | E-filed |
| `closed` | Closed |

The database SHALL refuse any other stage. The moves along the chain SHALL be:

| Move | From | To | Who |
|---|---|---|---|
| Submit, by a client | Draft | Request sent | the client |
| Submit, by the office (Add a case) | Draft | Screening in progress | an admin |
| Start screening | Request sent | Screening in progress | an admin |
| The intake check | Screening in progress | Pending intake / filing | an admin |
| Claim preparation | Pending intake / filing, no preparer | Filing in progress | a preparer |
| Send to review | Filing in progress | Pending review | the preparer |
| Claim review | Pending review, no reviewer | Review in progress | a reviewer who did not prepare it |
| Ask for corrections | Review in progress | Corrections in progress | the reviewer |
| Resubmit | Corrections in progress | Pending review | the preparer |
| Approve | Review in progress | Ready to exit | the reviewer |
| Mark ready to e-file | Ready to exit | Ready to e-file | an admin |
| Mark e-filed | Ready to e-file | E-filed | an admin |

Every other move along the chain SHALL be refused as not available.

Closing SHALL stay one move to Closed, by an admin. It SHALL be allowed from Request sent, Screening in progress, Pending intake / filing, Filing in progress, Corrections in progress, Pending review and Review in progress, and from a draft the office owns. It SHALL be refused from Ready to exit, Ready to e-file, E-filed and Closed. A case SHALL receive its client number when it leaves Draft for any stage but Closed, including when the office's submit moves it straight to Screening in progress.

#### Scenario: The intake check waits for screening
- **WHEN** an admin records the intake check on a case at Request sent
- **THEN** it is refused as not available, and the case stays at Request sent

#### Scenario: An office case starts in screening
- **WHEN** an admin submits a case entered with Add a case
- **THEN** the case is at Screening in progress, with a client number

#### Scenario: A volunteer can't start screening or mark e-filing
- **WHEN** a preparer or reviewer tries to start screening, mark ready to e-file or mark e-filed
- **THEN** each is refused as forbidden, and nothing is recorded

#### Scenario: Closing after review is refused
- **WHEN** an admin tries to close a case at Ready to exit, Ready to e-file or E-filed
- **THEN** it is refused as not available

#### Scenario: Closing during screening
- **WHEN** an admin closes a case at Screening in progress, with a reason
- **THEN** the case is Closed

### Requirement: Screening starts when an admin first opens a case
When a staff window opens a case's page at Request sent while its selected persona is an admin, the window SHALL start screening for that case. It SHALL do this whether the case page was opened by its reference, the search, Follow-ups, the case pool or a reload, and when the persona is switched to an admin while the case page is open. A list control that acts on a case without opening its page (for example Log contact on Follow-ups) SHALL NOT start screening. A window acting as a volunteer persona SHALL start nothing. The start SHALL be sent once per case.

**Quietly:**
- It SHALL NOT disable the page's buttons.
- It SHALL NOT show an error, a Try again or a toast for itself.
- When another admin started screening first, or the case changed meanwhile, the window SHALL re-read the case and show it at Screening in progress.
- When the connection is down, the case SHALL stay at Request sent under the connection notice, and the start SHALL be sent again once the connection returns while the case is open.

Starting screening SHALL tell the client (see "Clients are told at each new step"). It SHALL NOT be undone.

#### Scenario: An admin opens a new application
- **WHEN** Sam, acting as an admin, opens a case at Request sent
- **THEN** the case moves to Screening in progress, the client's page shows "Being reviewed", and the client's history gains "PCDC started reviewing your application. We may call you."

#### Scenario: Two admins open it at once
- **WHEN** two admin windows open the same Request sent case
- **THEN** the case moves to Screening in progress once, and neither window shows an error

#### Scenario: A volunteer opens it
- **WHEN** a window acting as a volunteer opens a case at Request sent
- **THEN** the case stays at Request sent

#### Scenario: A reload on the case page
- **WHEN** an admin window reloads while it shows a case at Request sent
- **THEN** the case moves to Screening in progress

#### Scenario: Logging a contact from Follow-ups
- **WHEN** an admin logs a contact from a Follow-ups row for a case at Request sent, without opening its page
- **THEN** the case stays at Request sent

#### Scenario: Offline on open
- **WHEN** an admin opens a Request sent case while the connection is down, and the connection then returns
- **THEN** no error is shown, and once connected the case moves to Screening in progress

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

### Requirement: Staff and clients each see their own stage names
Staff screens SHALL show each stage's staff name (see the first requirement), in English. Client screens SHALL show the client's own label in the screen's language (English, 简体, or 繁體 generated from 简体):

| Key | Client label (en / 简体) |
|---|---|
| `draft` | Draft / 草稿 |
| `received` | Sent to PCDC / 已发送给 PCDC |
| `screening` | Being reviewed / 审核中 |
| `preparation_ready` | Waiting for a volunteer / 等待志愿者 |
| `preparing` | Being prepared / 准备中 |
| `corrections_required` | Being corrected / 正在更正 |
| `review_ready` | Waiting for review / 等待检查 |
| `reviewing` | Being checked / 检查中 |
| `review_approved` | Ready to sign / 等待签名 |
| `ready_to_efile` | Signed / 已签名 |
| `efiled` | E-filed / 已电子递交 |
| `closed` | Closed / 已关闭 |

The client's progress page SHALL show five steps:
- Intake 登记 (Draft, Request sent, Screening in progress);
- Preparation 准备 (Pending intake / filing, Filing in progress, Corrections in progress);
- Review 审核 (Pending review, Review in progress);
- Signing 签名 (Ready to exit);
- Filing 递交 (Ready to e-file, E-filed).

Earlier steps SHALL be done, the case's step current, and later steps not started. A closed case SHALL show its closed notice instead of a current step.

#### Scenario: The client's list
- **WHEN** a client whose case is at Screening in progress opens their applications in 简体
- **THEN** the case's badge reads 审核中, and no staff name appears

#### Scenario: The stepper at signing
- **WHEN** a client's case is at Ready to exit
- **THEN** Intake, Preparation and Review are done, and Signing is current

### Requirement: The lists and the case page show every stage
**The work board** SHALL keep its three tabs:
- **Available:** Pending intake / filing with no preparer.
- **Waiting for preparation:** Filing in progress and Corrections in progress.
- **Waiting for review:** Pending review and Review in progress.

Its search SHALL reach a case in any stage.

**The case pool** SHALL have these tabs: All, Intake (Draft, Request sent, Screening in progress), Available, Waiting for preparation, Waiting for review, Waiting on client (Ready to exit), Filing (Ready to e-file, E-filed), and Closed. Its stage filter SHALL list every stage.

**Follow-ups** SHALL show an admin:
- a row for each case at Request sent ("New application: open it to start screening."), with **Open**;
- a row for each case at Screening in progress ("Finish screening."), with **Open**;
- a row for each case at Ready to exit ("Waiting for the client to sign Form 8879."), with **Mark ready to e-file…**. While the reviewer's call with the client is still pending, the row SHALL read "Waiting for the reviewer's call with the client." instead, with the call-pending explanation in place of the button;
- a row for each case at Ready to e-file ("Ready to e-file."), with **Mark e-filed…**;

alongside today's rows.

**The case page:**
- Its lifecycle bar SHALL show Request sent, Screening in progress, Pending intake / filing, Filing in progress, Pending review, Review in progress, Ready to exit, Ready to e-file, E-filed and Closed, with Corrections in progress shown on Filing in progress.
- For an admin, the intake-check form SHALL show at Screening in progress only.
- At Request sent, the case page SHALL say that screening starts when an admin opens the case.
- A volunteer's "Your next step" SHALL say what each new stage is waiting for.
- The case's history SHALL name each new move.

#### Scenario: The pool's Filing tab
- **WHEN** an admin opens the case pool's Filing tab
- **THEN** it lists the cases at Ready to e-file and E-filed, and no other

#### Scenario: Follow-ups shows signing
- **WHEN** a case is approved by its reviewer, and the reviewer has recorded the conversation with the client
- **THEN** Follow-ups shows its row, "Waiting for the client to sign Form 8879.", with Mark ready to e-file…

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
| The screening checks | PCDC finished screening your application. A volunteer will start preparing your return next. | PCDC 已完成对您申请的审核。接下来会有志愿者开始准备您的报税表。 |

Earlier history lines SHALL keep their words and translations. The screening checks' line SHALL replace "Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation." for every new record; lines already stored SHALL keep that sentence and its translation. No client message or history line SHALL name a phone number.

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

#### Scenario: The screening checks' line
- **WHEN** an admin records the screening checks and the client opens their history in English, then in 简体
- **THEN** it shows "PCDC finished screening your application. A volunteer will start preparing your return next." and "PCDC 已完成对您申请的审核。接下来会有志愿者开始准备您的报税表。", and no history line says "Simulated"

#### Scenario: An old line keeps its words
- **WHEN** a client reading in 简体 opens a case whose checks were recorded before this change
- **THEN** its history still shows "模拟的登记核查已记录。…" for that line

### Requirement: The office records the screening checks
At Screening in progress, an admin SHALL record the screening checks before the case moves to Pending intake / filing. The panel SHALL be titled "Screening checks" and SHALL show these checks, each a box to tick, with these words:

| Key | Check | Shown |
|---|---|---|
| `phone` | The client can be reached at the phone number on the application. | every case |
| `documents` | The basic documents are present (photo ID, Social Security or ITIN cards, the income documents on the list). | every case |
| `in_scope` | The return is within VITA scope. | every case |
| `identity` | Identity confirmed: the client's face matches their photo ID (in person or on video), checked by a certified volunteer. | only when the intake answer `service` is `online` |

The button SHALL read "Record the screening checks" and SHALL stay disabled, with the hint "Tick every check before recording them.", until every check shown is ticked. No text in the panel or its notice, and no history line recorded after this change, SHALL call the checks simulated.

The database SHALL accept `VERIFY_INTAKE` only with exactly the checks shown for the case, each `true`: `phone`, `documents` and `in_scope`, plus `identity` if and only if the case's `service` is `online`. It SHALL refuse a missing, extra or false check, the removed `interview` and `consent` checks, and `identity` on a case that is not online, with `VALIDATION`, and nothing SHALL change. The stored record SHALL be the checks themselves, with no simulated flag. Records stored before this change SHALL keep their four checks and still render in the case's history.

#### Scenario: A drop-off case shows three checks
- **WHEN** an admin opens a drop-off case at Screening in progress
- **THEN** the Screening checks panel shows the phone, documents and VITA-scope checks, and no identity check

#### Scenario: An online case shows four checks
- **WHEN** an admin opens an online case at Screening in progress
- **THEN** the panel shows the identity check as well

#### Scenario: The button waits for every check
- **WHEN** the admin has ticked two of the three checks on a drop-off case
- **THEN** "Record the screening checks" is disabled and the hint reads "Tick every check before recording them."
- **AND WHEN** the third is ticked and the admin records them
- **THEN** the case moves to Pending intake / filing and the notice reads "The screening checks are recorded."

#### Scenario: The database refuses a wrong set
- **WHEN** `VERIFY_INTAKE` is sent with a missing check, an extra key, a `false` check, the old `interview` or `consent` keys, or `identity` on a drop-off case
- **THEN** each is refused with `VALIDATION`, and the case stays at Screening in progress

#### Scenario: An online case needs identity
- **WHEN** `VERIFY_INTAKE` is sent for an online case with only phone, documents and in_scope
- **THEN** it is refused with `VALIDATION`

#### Scenario: An old record still renders
- **WHEN** staff open a case whose checks were recorded with the four simulated checks
- **THEN** its history reads "… recorded the screening checks" for that event, and nothing fails to render

#### Scenario: The online sample
- **WHEN** the samples are seeded
- **THEN** the `review_ready` sample's recorded checks include identity, and every other sample's are phone, documents and in_scope
