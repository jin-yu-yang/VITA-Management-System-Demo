## ADDED Requirements

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
