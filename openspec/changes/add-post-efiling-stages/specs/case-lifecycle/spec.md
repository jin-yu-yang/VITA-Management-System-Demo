## ADDED Requirements

### Requirement: Admins record each return's filing result
A case SHALL have two returns: the federal return and the Pennsylvania (state) return. At Mark e-filed, each SHALL get a filing method, `efile` or `paper` (see "Admins record signing and e-filing, with a confirmation").

At E-filed, an admin SHALL be offered **Record filing result…**, on the case page and on that case's Follow-ups row. It SHALL record the answer for one or both of the returns still waiting:
- an e-filed return SHALL be recorded as **accepted** or **rejected**, with the acknowledgment date. A rejected return SHALL also have a reject code: free text, 1 to 40 characters after trimming;
- a paper return SHALL be recorded as **mailed**, with the mailing date.

Every date SHALL be no later than today and no earlier than the day the return was filed. When the case is at Rejected, or the move takes it there, the admin MAY add a fix note (at most 1000 characters) saying who fixes the return and how. That includes recording the second return's answer at Rejected. A fix note SHALL be refused on any other move. Fix notes SHALL be append-only: each note SHALL be kept with who recorded it and when, and no note SHALL ever be changed or deleted, not even by the database's own service role.

Its confirmation dialog SHALL:
- name the client (as Mark e-filed's does) and the application ID;
- say what each return is being recorded as;
- require a confirmation box to be ticked.

The database SHALL refuse the move without that confirmation. It SHALL also refuse, with `VALIDATION` and with nothing recorded:
- a return that already has an answer;
- a result that doesn't fit the return's method;
- a missing or misplaced reject code;
- a date outside the window;
- an empty move.

After the move, the case SHALL be:
- **Rejected**, if any return is rejected;
- otherwise **Accepted**, if every return is accepted or mailed;
- otherwise still **E-filed**.

A rejection SHALL move the case to Rejected at once, even while the other return is still waiting. While a case at Rejected still has a return waiting, Record filing result SHALL stay offered for that return, and the case SHALL stay at Rejected. Accepted SHALL be the end: no move SHALL leave it.

The move SHALL be admin-only, and SHALL have no undo. A case e-filed before filing methods existed SHALL be treated as both returns e-filed.

#### Scenario: Both accepted
- **WHEN** an admin records the federal and the state return of a both-e-filed case as accepted, with dates after the filing day, and confirms
- **THEN** the case is Accepted, its staff name is "Accepted", and it shows in the case pool's Done tab

#### Scenario: One answer at a time
- **WHEN** an admin records only the federal return of a both-e-filed case as accepted
- **THEN** the case stays at E-filed, and its Follow-ups row reads "Waiting for Pennsylvania's answer."

#### Scenario: A rejection doesn't wait
- **WHEN** an admin records the federal return as rejected with code IND-031-04, while the state return is still waiting
- **THEN** the case is Rejected at once, and Record filing result… is still offered for the state return

#### Scenario: A note with the second answer
- **WHEN** a case is Rejected for its federal return with the fix note "Preparer to correct the dependent's SSN", and an admin then records the state return as accepted with the fix note "Client to bring the corrected SSN card"
- **THEN** the case stays Rejected, both notes are kept in the order recorded, and the Rejected row shows the second

#### Scenario: A note with nothing rejected
- **WHEN** an admin records the federal return of an E-filed case as accepted, with a fix note
- **THEN** the database refuses it with `VALIDATION`, and nothing is recorded

#### Scenario: A note can't be changed
- **WHEN** anyone, the database's service role included, tries to change or delete a recorded fix note
- **THEN** it is refused, and the note stays as recorded

#### Scenario: A rejection needs a code
- **WHEN** an admin records a return as rejected with an empty reject code
- **THEN** the database refuses it with `VALIDATION`, and nothing is recorded

#### Scenario: A paper return is mailed, not accepted
- **WHEN** an admin tries to record the paper state return of an E-filed & paper case as accepted
- **THEN** it is refused with `VALIDATION`
- **AND WHEN** the admin records it as mailed, and the federal return has been accepted
- **THEN** the case is Accepted, with the staff name "Accepted & mailed"

#### Scenario: A date before the filing
- **WHEN** an admin records an acknowledgment date earlier than the day the return was filed
- **THEN** it is refused with `VALIDATION`

#### Scenario: A volunteer can't record a result
- **WHEN** a preparer or reviewer tries to record a filing result
- **THEN** it is refused as forbidden, and nothing is recorded

#### Scenario: Nothing leaves Accepted
- **WHEN** an admin tries to record a result, return to signing, mark e-filed or close a case at Accepted
- **THEN** each is refused as not available

#### Scenario: An older e-filed case
- **WHEN** an admin records both returns as accepted on a case that was e-filed before filing methods existed
- **THEN** the case is Accepted, as a both-e-filed case

### Requirement: A rejected case returns to signing
At Rejected, an admin SHALL be offered **Return to signing…**, on the case page and on the case's Rejected row in Follow-ups.
- Its confirmation SHALL name the client and the application ID, and its box SHALL read "The fix is done.". The database SHALL refuse the move without it.
- The move SHALL take the case to Ready to exit, keeping each return's method and answer. It SHALL have no undo, and volunteers SHALL NOT see the button.
- While any return is still waiting for its answer, the move SHALL be refused as not available. The admin SHALL see "Waiting for Pennsylvania's answer before the return can go back to signing." (or "…the IRS's answer…") instead of the button.

Back at Ready to exit, Mark ready to e-file SHALL be offered without waiting again for the reviewer's conversation or the office's go-over, which were done the first time. Its confirmation SHALL say that this is the client's second signing. The next Mark e-filed SHALL offer only the rejected returns, may change their method, and SHALL keep each accepted or mailed return as it is.

Close SHALL be allowed from Rejected, with a reason, as from the earlier stages.

#### Scenario: The fix is done
- **WHEN** an admin presses Return to signing… on a Rejected case whose returns all have an answer, ticks "The fix is done." and confirms
- **THEN** the case is at Ready to exit, it shows in the case pool's Waiting on client tab, and its Follow-ups row reads "Waiting for the client to sign again."

#### Scenario: Waiting for the other answer
- **WHEN** a case is Rejected for its federal return while the state return is still waiting
- **THEN** the admin sees "Waiting for Pennsylvania's answer before the return can go back to signing." instead of Return to signing…, and the database refuses the move as not available

#### Scenario: The second signing
- **WHEN** an admin presses Mark ready to e-file… on a case returned to signing
- **THEN** it is offered straight away, and the dialog says this is the client's second signing

#### Scenario: Filing again, the PA-40 on paper
- **WHEN** the federal return was accepted and the state return rejected, the case went back to signing and was marked ready to e-file, and the admin marks it e-filed with the state return on paper
- **THEN** the dialog offered only the state return, the federal return stays accepted, and the case is E-filed with the staff name "E-filed & paper"

#### Scenario: Closing a rejected case
- **WHEN** an admin closes a Rejected case, with a reason
- **THEN** the case is Closed

### Requirement: Filing details stay with staff
Reject codes, acknowledgment and mailing dates, and fix notes SHALL be readable only by staff. A client session SHALL read none of them and SHALL receive no realtime change that carries them. No client message or history line SHALL contain a reject code or a fix note. A client SHALL be told only each return's method and whether it is waiting, accepted, rejected or mailed.

From E-filed onward, the staff case page SHALL show a **Filing** panel, newest filing first. For each filing, it SHALL show each return's method, answer, date and reject code, then that filing's fix notes in the order recorded, each as typed, with who recorded it and when. Every staff member who can open the case SHALL see the panel and the fix notes. A case's Rejected row in Follow-ups SHALL show the latest fix note.

#### Scenario: A client can't read the code
- **WHEN** a client session reads its own case after a rejection with code IND-031-04 and a fix note
- **THEN** it can read that the federal return is rejected, but neither the code, the dates nor the note, and its history contains neither the code nor the note

#### Scenario: The preparer reads the fix note
- **WHEN** the case's preparer opens a Rejected case whose fix note says "Preparer to correct the dependent's SSN in TaxSlayer"
- **THEN** the Filing panel shows the note

## MODIFIED Requirements

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
| `efiled` | by filing method: Both e-filed (both returns e-filed), E-filed & paper (federal e-filed, state on paper), Both paper (both on paper); E-filed for a case e-filed before filing methods existed |
| `rejected` | Rejected |
| `accepted` | by filing method: Accepted (both e-filed), Accepted & mailed (federal e-filed, state on paper), Mailed (both on paper) |
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
| Record filing result | E-filed | E-filed, Rejected or Accepted | an admin |
| Record filing result, for a return still waiting | Rejected | Rejected | an admin |
| Return to signing | Rejected, every return answered | Ready to exit | an admin |

Every other move along the chain SHALL be refused as not available.

Closing SHALL stay one move to Closed, by an admin. It SHALL be allowed from Request sent, Screening in progress, Pending intake / filing, Filing in progress, Corrections in progress, Pending review, Review in progress and Rejected, and from a draft the office owns. It SHALL be refused from Ready to exit, Ready to e-file, E-filed, Accepted and Closed. A case SHALL receive its client number when it leaves Draft for any stage but Closed, including when the office's submit moves it straight to Screening in progress.

#### Scenario: The intake check waits for screening
- **WHEN** an admin records the intake check on a case at Request sent
- **THEN** it is refused as not available, and the case stays at Request sent

#### Scenario: An office case starts in screening
- **WHEN** an admin submits a case entered with Add a case
- **THEN** the case is at Screening in progress, with a client number

#### Scenario: A volunteer can't start screening or mark e-filing
- **WHEN** a preparer or reviewer tries to start screening, mark ready to e-file, mark e-filed, record a filing result or return a case to signing
- **THEN** each is refused as forbidden, and nothing is recorded

#### Scenario: Closing after review is refused
- **WHEN** an admin tries to close a case at Ready to exit, Ready to e-file, E-filed or Accepted
- **THEN** it is refused as not available

#### Scenario: Closing during screening
- **WHEN** an admin closes a case at Screening in progress, with a reason
- **THEN** the case is Closed

### Requirement: Admins record signing and e-filing, with a confirmation
At Ready to exit, an admin SHALL be offered **Mark ready to e-file**. At Ready to e-file, an admin SHALL be offered **Mark e-filed**. Both SHALL be offered on the case page and on that case's Follow-ups row. Each SHALL open a confirmation dialog that:
- names the client (their first and last name from the application, or "this client" when both are empty) and the application ID;
- says what the client will be told;
- requires a confirmation box to be ticked before the move is sent.

The database SHALL refuse either move without that confirmation. Neither move SHALL have an undo. Volunteers SHALL see neither button.

Mark e-filed SHALL record how each return was filed. On a first filing, its dialog SHALL offer exactly three choices: both returns e-filed; federal e-filed and state on paper; both on paper. The database SHALL refuse any other combination, and a payload missing either return, with `VALIDATION`. On a filing after Return to signing, the dialog SHALL offer only the rejected returns, each e-filed or on paper, and SHALL show each accepted or mailed return as already done. The database SHALL refuse a payload that names an accepted or mailed return, or that leaves the two returns in a combination outside the three. The dialog SHALL show the chosen method in what the client will be told.

Mark ready to e-file SHALL wait for the reviewer's conversation with the client. While the approved review's conversation is not yet recorded as completed, the database SHALL refuse the move as not available. The admin SHALL see "The reviewer still needs to record the conversation with the client." instead of the button, on the case page and on the Follow-ups row.

Mark ready to e-file SHALL also wait for the office to go over the return with the client. While the case has an open follow-up with purpose `go_over_return` (capability `office-follow-up`), the database SHALL refuse the move as not available, and nothing SHALL be recorded. The admin SHALL see "The office still needs to go over the return with the client." instead of the button, on the case page and on the Follow-ups row, and the Follow-ups row SHALL read "Waiting for the office to go over the return with the client.". The wait SHALL end when that follow-up is resolved, whatever the outcome, and when it is cancelled.

#### Scenario: Marking a case e-filed
- **WHEN** an admin presses Mark e-filed… for Mei Chen's case, chooses both returns e-filed, ticks the confirmation and confirms
- **THEN** the dialog had named "Mei Chen" and the application ID, the case is E-filed with the staff name "Both e-filed", and the client's history gains "PCDC e-filed your return."

#### Scenario: Filing the state return on paper
- **WHEN** an admin marks a case e-filed with the federal return e-filed and the state return on paper
- **THEN** the case's staff name is "E-filed & paper", and the client's history gains "PCDC e-filed your federal return and mailed your Pennsylvania return."

#### Scenario: A combination PCDC doesn't use
- **WHEN** the database receives Mark e-filed with the federal return on paper and the state return e-filed
- **THEN** it refuses it with `VALIDATION`, and the case stays at Ready to e-file

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
| `efiled` | E-filed / 已电子递交 (both e-filed, or e-filed before filing methods existed); Filed / 已递交 (federal e-filed, state on paper); Mailed / 已邮寄 (both on paper) |
| `rejected` | Needs a correction / 需要更正 |
| `accepted` | Complete / 已完成 |
| `closed` | Closed / 已关闭 |

The client's progress page SHALL show five steps:
- Intake 登记 (Draft, Request sent, Screening in progress);
- Preparation 准备 (Pending intake / filing, Filing in progress, Corrections in progress);
- Review 审核 (Pending review, Review in progress);
- Signing 签名 (Ready to exit);
- Filing 递交 (Ready to e-file, E-filed, Rejected).

Earlier steps SHALL be done, the case's step current, and later steps not started. At Accepted, every step SHALL be done, and none current. A closed case SHALL show its closed notice instead of a current step.

#### Scenario: The client's list
- **WHEN** a client whose case is at Screening in progress opens their applications in 简体
- **THEN** the case's badge reads 审核中, and no staff name appears

#### Scenario: The stepper at signing
- **WHEN** a client's case is at Ready to exit
- **THEN** Intake, Preparation and Review are done, and Signing is current

#### Scenario: The stepper after a rejection
- **WHEN** a client's case is Rejected
- **THEN** the first four steps are done, Filing is current, and the badge reads "Needs a correction"
- **AND WHEN** an admin returns the case to signing
- **THEN** Signing is current again

#### Scenario: The stepper when complete
- **WHEN** a client's case is Accepted
- **THEN** all five steps are done, and the badge reads "Complete"

### Requirement: The lists and the case page show every stage
**The work board** SHALL keep its three tabs:
- **Available:** Pending intake / filing with no preparer.
- **Waiting for preparation:** Filing in progress and Corrections in progress.
- **Waiting for review:** Pending review and Review in progress.

Its search SHALL reach a case in any stage.

**The case pool** SHALL have these tabs, in this order: All, Intake (Draft, Request sent, Screening in progress), Available, Waiting for preparation, Waiting for review, Waiting on client (Ready to exit), Filing (Ready to e-file, E-filed), Needs attention (Rejected), Done (Accepted), and Closed. Its stage filter SHALL list every stage. The pool, Follow-ups and the case page SHALL show E-filed and Accepted by their staff name for the case's filing method.

**Follow-ups** SHALL show an admin:
- a row for each case at Request sent ("New application: open it to start screening."), with **Open**;
- a row for each case at Screening in progress ("Finish screening."), with **Open**;
- a row for each case at Ready to exit ("Waiting for the client to sign Form 8879."), with **Mark ready to e-file…**. While the reviewer's call with the client is still pending, the row SHALL read "Waiting for the reviewer's call with the client." instead, with the call-pending explanation in place of the button. For a case returned to signing after a rejection, the row SHALL read "Waiting for the client to sign again.";
- a row for each case at Ready to e-file ("Ready to e-file."), with **Mark e-filed…**;
- a **Filing result** row for each case at E-filed, and for each case at Rejected with a return still waiting, with **Record filing result…**. It SHALL read:
  - "Waiting for the IRS and Pennsylvania." while both e-filed returns wait;
  - "Waiting for Pennsylvania's answer." or "Waiting for the IRS's answer." while one e-filed return waits;
  - "Record when the Pennsylvania return is mailed." (or "…the federal return…", or "Record when the returns are mailed." for both) while a paper return waits;
- a **Rejected** row for each case at Rejected ("Rejected: contact the client to fix and sign again."), followed by the latest fix note, as typed, if there is one. It has **Return to signing…**, or, while a return still waits, "Waiting for Pennsylvania's answer before the return can go back to signing." (or "…the IRS's answer…") in its place;

alongside today's rows. A case at Accepted SHALL have no row. Follow-ups' filter SHALL list the two new kinds. A row's waiting time SHALL count from the case's last move or recorded result. The amber (3 days) and red (5 days) colouring SHALL apply to a Filing result row only while one of its returns waits for an e-file acknowledgment. A row waiting only for a mailing to be recorded, and a Rejected row, SHALL never be coloured.

**The case page:**
- Its lifecycle bar SHALL show Request sent, Screening in progress, Pending intake / filing, Filing in progress, Pending review, Review in progress, Ready to exit, Ready to e-file, E-filed, Accepted and Closed. Corrections in progress SHALL show on Filing in progress, and Rejected on E-filed.
- For an admin, the intake-check form SHALL show at Screening in progress only.
- At Request sent, the case page SHALL say that screening starts when an admin opens the case.
- A volunteer's "Your next step" SHALL say what each new stage is waiting for:
  - E-filed: "The office records the answers from the IRS and Pennsylvania.";
  - Rejected: "A return was rejected. The office arranges the fix and contacts the client.";
  - Accepted: "The returns are accepted or mailed. Nothing more is needed here.".
- The case's history SHALL name each new move.

#### Scenario: The pool's Filing tab
- **WHEN** an admin opens the case pool's Filing tab
- **THEN** it lists the cases at Ready to e-file and E-filed, and no other

#### Scenario: Needs attention and Done
- **WHEN** an admin opens the case pool's Needs attention tab, then its Done tab
- **THEN** the first lists only Rejected cases, and the second only Accepted cases

#### Scenario: Follow-ups shows signing
- **WHEN** a case is approved by its reviewer, and the reviewer has recorded the conversation with the client
- **THEN** Follow-ups shows its row, "Waiting for the client to sign Form 8879.", with Mark ready to e-file…

#### Scenario: A late acknowledgment turns amber
- **WHEN** a both-e-filed case has waited three days at E-filed with no answer recorded
- **THEN** its Filing result row is amber, and reads "Waiting for the IRS and Pennsylvania."

#### Scenario: A mailing row is never coloured
- **WHEN** a both-paper case has waited six days at E-filed for its mailing to be recorded
- **THEN** its Filing result row reads "Record when the returns are mailed." and is not coloured

#### Scenario: The Rejected row shows the fix note
- **WHEN** a case is Rejected with the fix note "Preparer to correct the dependent's SSN in TaxSlayer"
- **THEN** its Rejected row reads "Rejected: contact the client to fix and sign again." followed by that note, with Return to signing…

#### Scenario: Accepted leaves the queue
- **WHEN** the last waiting return of a case is recorded as accepted or mailed
- **THEN** the case has no Follow-ups row

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

At Ready to exit, the message above SHALL be shown only for a case approved without a reviewer questionnaire (before the questionnaires existed). A case approved with one SHALL show the variant for the signing plan the approval chose (capability `review-and-corrections`):

| Signing plan | Chosen when | English | 简体 |
|---|---|---|---|
| Appointment | in person, and the visit was not same-day | Your return has been checked. Please come to PCDC on {when} to sign Form 8879. It is needed before your return can be filed. | 您的报税表已检查完毕。请于 {when} 到 PCDC 签署 8879 表，签署后才能递交报税表。 |
| Same day | in person, on a same-day visit | Your return has been checked. Please sign Form 8879 with a volunteer before you leave today. It is needed before your return can be filed. | 您的报税表已检查完毕。请在今天离开前与志愿者一起签署 8879 表，签署后才能递交报税表。 |
| Customer Portal | e-sign in the TaxSlayer Customer Portal | Your return has been checked. Please e-sign Form 8879 in the TaxSlayer Customer Portal. It is needed before your return can be filed. | 您的报税表已检查完毕。请在 TaxSlayer 客户门户（Customer Portal）以电子方式签署 8879 表，签署后才能递交报税表。（门户为英文页面，可用浏览器翻译） |
| Go over first | the reviewer did not go over the return with the client, whatever the signing method, until the office resolves its go-over follow-up | Your return has been checked. PCDC will contact you to go over your return together. After that, you will sign Form 8879. It is needed before your return can be filed. | 您的报税表已检查完毕。PCDC 会联系您，先和您一起查看报税表，再请您签署 8879 表，签署后才能递交报税表。 |

`{when}` SHALL be the appointment's date and time as the reviewer entered it, in the screen's language, with the weekday and no year. It SHALL never be shifted by the viewer's time zone. The variant SHALL be set at approval and SHALL change only once: when the office resolves the go-over follow-up of a Go over first case, with either outcome, the client SHALL from then on see the variant for the reviewer's signing method (Appointment with the stored date and time, Same day, or Customer Portal), chosen by the same rules as at approval. The client SHALL read only the signing plan and the appointment, never an answer of either questionnaire.

A case at Ready to exit after Return to signing SHALL show the re-sign message instead of any variant above:

| English | 简体 |
|---|---|
| PCDC corrected your return. Please sign it again so PCDC can file it. PCDC will contact you to arrange this. | PCDC 已更正您的报税表。请再次签名，以便 PCDC 递交。PCDC 会联系您安排签名。 |

At E-filed, Rejected and Accepted, the message SHALL be built from one sentence about each return, federal first, then the stage's closing sentence. When both returns are in the same state, the combined sentence SHALL replace the two. A return's sentence SHALL depend on its method and answer: e-filed and waiting, accepted, rejected, or mailed. A paper return SHALL be told as mailed from Mark e-filed on.

| Return's state | Federal | Pennsylvania | Both |
|---|---|---|---|
| E-filed, waiting | Your federal return was e-filed. The IRS will confirm whether it is accepted. / 您的联邦报税表已电子递交。国税局会确认是否接受。 | Your Pennsylvania return was e-filed. Pennsylvania will confirm whether it is accepted. / 您的宾州报税表已电子递交。宾州税务局会确认是否接受。 | Your federal and Pennsylvania returns were e-filed. The IRS and Pennsylvania will each confirm whether they are accepted. / 您的联邦和宾州报税表已电子递交。国税局和宾州税务局会分别确认是否接受。 |
| Accepted | The IRS accepted your federal return. / 国税局已接受您的联邦报税表。 | Pennsylvania accepted your Pennsylvania return. / 宾州税务局已接受您的宾州报税表。 | The IRS and Pennsylvania accepted your returns. / 国税局和宾州税务局都已接受您的报税表。 |
| Rejected | Your federal return needs a correction before it can be accepted. / 您的联邦报税表需要更正后才能被接受。 | Your Pennsylvania return needs a correction before it can be accepted. / 您的宾州报税表需要更正后才能被接受。 | Your federal and Pennsylvania returns need a correction before they can be accepted. / 您的联邦和宾州报税表需要更正后才能被接受。 |
| Mailed | Your federal return was mailed. A reply to a mailed return can take several weeks. / 您的联邦报税表已邮寄。邮寄的报税表可能需要几周才会有回复。 | Your Pennsylvania return was mailed. A reply to a mailed return can take several weeks. / 您的宾州报税表已邮寄。邮寄的报税表可能需要几周才会有回复。 | Your federal and Pennsylvania returns were mailed. A reply to a mailed return can take several weeks. / 您的联邦和宾州报税表已邮寄。邮寄的报税表可能需要几周才会有回复。 |

| Stage | Closing sentence (en / 简体) |
|---|---|
| E-filed | none |
| Rejected | PCDC will contact you about the correction. / PCDC 会就更正事宜联系您。 |
| Accepted | If you are due a refund, you can check on it with "Where's My Refund?" at irs.gov/refunds for your federal return, and with myPATH at mypath.pa.gov for your Pennsylvania return. / 如果您有退税，可以在 irs.gov/refunds 使用 "Where's My Refund?" 查询联邦退税，在 mypath.pa.gov 使用 myPATH 查询宾州退税。（网站为英文页面，可用浏览器翻译） |

A case at E-filed whose returns have no filing method (e-filed before filing methods existed) SHALL show "Your return was e-filed. The IRS will confirm whether it is accepted." / "您的报税表已电子递交。国税局会确认是否接受。". The websites SHALL appear as plain text, not links.

Draft, Filing in progress, Corrections in progress, Review in progress and Closed SHALL keep today's messages.

Each new move SHALL add one line to the client's history, in their language:

| Move | English | 简体 |
|---|---|---|
| Start screening, and the office's submit | PCDC started reviewing your application. We may call you. | PCDC 已开始审核您的申请。我们可能会致电您。 |
| Mark ready to e-file | PCDC recorded that you signed Form 8879. Your return is ready to e-file. | PCDC 已记录您签署了 8879 表。您的报税表可以电子递交了。 |
| Mark e-filed, both e-filed | PCDC e-filed your return. | PCDC 已电子递交您的报税表。 |
| Mark e-filed, federal e-filed and state on paper | PCDC e-filed your federal return and mailed your Pennsylvania return. | PCDC 已电子递交您的联邦报税表，并邮寄了您的宾州报税表。 |
| Mark e-filed, both on paper | PCDC mailed your returns. | PCDC 已邮寄您的报税表。 |
| Mark e-filed, after Return to signing, one return | PCDC e-filed your federal return. / PCDC mailed your federal return. / PCDC e-filed your Pennsylvania return. / PCDC mailed your Pennsylvania return. | PCDC 已电子递交您的联邦报税表。/ PCDC 已邮寄您的联邦报税表。/ PCDC 已电子递交您的宾州报税表。/ PCDC 已邮寄您的宾州报税表。 |
| Record filing result | for the returns recorded in the move: their Accepted, Rejected or Mailed sentences from the table above, combined when both are the same, federal first | the same sentences in 简体 |
| Return to signing | PCDC corrected your return. You need to sign it again. | PCDC 已更正您的报税表，您需要再次签名。 |
| The screening checks | PCDC finished screening your application. A volunteer will start preparing your return next. | PCDC 已完成对您申请的审核。接下来会有志愿者开始准备您的报税表。 |

Every history line the system can store SHALL have its 简体 translation. Earlier history lines SHALL keep their words and translations. The screening checks' line SHALL replace "Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation." for every new record; lines already stored SHALL keep that sentence and its translation. No client message or history line SHALL name a phone number.

#### Scenario: A history line in 简体
- **WHEN** a client reading in 简体 opens a case an admin marked ready to e-file
- **THEN** its history shows "PCDC 已记录您签署了 8879 表。您的报税表可以电子递交了。"

#### Scenario: No phone number
- **WHEN** a client reads any new stage message or history line, in any language, including each Ready to exit variant with an appointment and the Accepted message
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

#### Scenario: Both returns waiting
- **WHEN** a client opens a both-e-filed case at E-filed
- **THEN** the status panel reads "Your federal and Pennsylvania returns were e-filed. The IRS and Pennsylvania will each confirm whether they are accepted."

#### Scenario: One accepted, one waiting
- **WHEN** the federal return is accepted and the e-filed state return still waits
- **THEN** the status panel reads "The IRS accepted your federal return. Your Pennsylvania return was e-filed. Pennsylvania will confirm whether it is accepted."

#### Scenario: Rejected, in 简体
- **WHEN** a client reading in 简体 opens a case whose federal return was accepted and state return rejected
- **THEN** the status panel reads "国税局已接受您的联邦报税表。您的宾州报税表需要更正后才能被接受。PCDC 会就更正事宜联系您。", and no reject code appears

#### Scenario: Mailed
- **WHEN** a client opens a both-paper case at E-filed
- **THEN** the status panel reads "Your federal and Pennsylvania returns were mailed. A reply to a mailed return can take several weeks."

#### Scenario: Complete
- **WHEN** a client opens a both-e-filed case whose returns were both accepted
- **THEN** the status panel reads "The IRS and Pennsylvania accepted your returns." followed by the refund sentence naming irs.gov/refunds and mypath.pa.gov, as plain text

#### Scenario: Sign again
- **WHEN** an admin returns a rejected case to signing and the client opens their progress page
- **THEN** the status panel shows the re-sign message instead of the approval's signing variant, and the history gains "PCDC corrected your return. You need to sign it again."
