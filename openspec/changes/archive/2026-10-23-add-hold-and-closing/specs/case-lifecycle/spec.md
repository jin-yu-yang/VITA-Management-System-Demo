## ADDED Requirements

### Requirement: The office asks for documents at intake
At Screening in progress and at Pending intake / filing, an admin SHALL be offered **Ask for documents…** on the case page. At Screening in progress it SHALL also be offered in the screening checks panel while "The basic documents are present" isn't ticked. The move SHALL create one to five document requests, each with a title and a message (the same limits as a preparer's request). It SHALL move the case to **Waiting for documents** and record the stage it came from. The client's history SHALL gain one line naming every title requested in that move, in the order entered: "PCDC asked for these documents: {titles}." Adding requests later in Waiting for documents SHALL add one such line per move.

While the case is at Waiting for documents:
- the client SHALL see the requests and answer them as they answer a preparer's;
- an admin SHALL be able to record a received document and to verify a document, which today only the preparer can, during preparation;
- an admin SHALL be able to add further requests, and the case SHALL stay at Waiting for documents.

When the last open request is verified (no request left open or awaiting verification), the case SHALL return to the stage it came from, Screening in progress or Pending intake / filing. The client's history SHALL gain "PCDC is working on your application again.". From Screening in progress, the screening checks SHALL then be recorded as before, before the case can be claimed.

The preparer's own document requests during Filing in progress and Corrections in progress, and their escalation to the office, SHALL stay as they are. The stage SHALL not change while a preparer waits for a document.

#### Scenario: A failed documents check
- **WHEN** an admin at Screening in progress can't tick "The basic documents are present" and asks the client for a photo ID
- **THEN** the case is at Waiting for documents, the client sees the request, and the case is not claimable

#### Scenario: Back to screening when the documents are in
- **WHEN** the client uploads the photo ID and an admin verifies it
- **THEN** the case is back at Screening in progress, its history gains "PCDC is working on your application again.", and the screening checks can be recorded

#### Scenario: Every title in the history
- **WHEN** an admin asks for "W-2" and "Photo ID" in one move, and the client opens their history in English, then in 简体
- **THEN** it shows "PCDC asked for these documents: W-2, Photo ID." and "PCDC 请您提供以下文件：W-2, Photo ID。", with the titles as typed

#### Scenario: One more document
- **WHEN** an admin adds a second request before verifying the first, then verifies only the first
- **THEN** the case stays at Waiting for documents

#### Scenario: A volunteer can't ask at intake
- **WHEN** a preparer or reviewer tries to ask for documents at Screening in progress
- **THEN** it is refused as forbidden, and nothing is recorded

#### Scenario: The preparer's loop is unchanged
- **WHEN** the preparer of a case at Filing in progress requests a document
- **THEN** the case stays at Filing in progress, as before

### Requirement: The office puts a case on hold while it chases the client
An admin SHALL be offered **Put on hold…** at Waiting for documents and at Ready to exit, with an optional staff note of at most 1000 characters. The move SHALL take the case to **Hold** and record where it came from. The note SHALL be readable only by staff.

While the case is on Hold:
- the client SHALL still be able to answer open requests;
- at a Hold that came from Ready to exit, Mark ready to e-file SHALL be refused as not available.

**Got in touch…** (admin) SHALL return the case to the stage it came from, with the client's history line "PCDC is working on your application again.".

At a Hold that came from Waiting for documents, verifying the last open request SHALL return the case straight to the stage the documents were asked from (Screening in progress or Pending intake / filing), with no separate Got in touch.

Close SHALL be allowed from Hold, whatever it came from, with reason Dismissed or any other reason.

#### Scenario: Chasing the documents
- **WHEN** a case has waited at Waiting for documents for a week and an admin puts it on hold
- **THEN** the case is on Hold, its Follow-ups row reads "Can't reach the client about documents.", and the client's history gains "PCDC is trying to reach you."

#### Scenario: The upload ends the hold
- **WHEN** the client of a documents Hold uploads the last document and an admin verifies it
- **THEN** the case is back at the stage the documents were asked from, with no Got in touch

#### Scenario: A signer who can't be reached
- **WHEN** an admin puts a case at Ready to exit on hold
- **THEN** the case is on Hold, its Follow-ups row reads "Can't reach the client to sign Form 8879.", and Mark ready to e-file is refused as not available
- **AND WHEN** the admin presses Got in touch…
- **THEN** the case is back at Ready to exit

#### Scenario: Never signed
- **WHEN** an admin closes a Hold that came from Ready to exit with reason Dismissed
- **THEN** the case is Closed, and the client reads "PCDC could not reach you, so this application was closed. Your return was not filed."

#### Scenario: Only from the two chase points
- **WHEN** an admin tries to put a case at Filing in progress on hold
- **THEN** it is refused as not available

### Requirement: A closed case records why it closed
Every close SHALL record one reason:

| Key | Staff name | Notes |
|---|---|---|
| `out_of_scope` | Out of scope | |
| `no_need_to_file` | No need to file | |
| `duplicate` | Duplicate | |
| `dismissed` | Dismissed (client unreachable) | |
| `withdrawn` | Withdrawn | set by the client's withdrawal, or by an admin on the client's behalf |
| `other` | Other | a staff note is required |

An admin MAY add a staff note of at most 1000 characters with any reason, and SHALL add one with `other`. The database SHALL refuse a close with no reason, an unknown reason, `other` without a note, or a note over 1000 characters, with `VALIDATION`. The reason SHALL be stored on the case. The note SHALL be readable only by staff and SHALL never reach a client.

The close dialog SHALL offer the six reasons as one choice and the note as a text box. Its confirmation box SHALL stay as it is.

A case closed before reasons existed SHALL have no reason, SHALL show the staff name "Closed", and SHALL keep the generic client message.

#### Scenario: Closing a duplicate
- **WHEN** an admin closes a case at Request sent with reason Duplicate
- **THEN** the case is Closed with reason `duplicate`, and the pool's Closed tab shows it under Duplicate

#### Scenario: Other needs a note
- **WHEN** an admin closes with reason Other and no note
- **THEN** the database refuses it with `VALIDATION`, and the case is unchanged

#### Scenario: The note stays with staff
- **WHEN** an admin closes with reason Other and the note "Client chose another preparer"
- **THEN** staff see the note in the case's history, and the client sees neither the note nor the reason's key

#### Scenario: An older closed case
- **WHEN** a client opens a case that was closed before reasons existed
- **THEN** they read "This application was closed by the office. This does not change any return filed elsewhere."

### Requirement: A client may withdraw their own application
The client SHALL be offered **Withdraw this application** / 撤回此申请 on their progress page while the case is at Request sent, Screening in progress, Waiting for documents, a Hold that came from Waiting for documents, Pending intake / filing, Filing in progress, Corrections in progress, Pending review or Review in progress.

Its dialog SHALL require the box "I want to withdraw this application. My return will not be filed." / "我要撤回此申请。我的报税表将不会被递交。" to be ticked. The database SHALL refuse the move without it.

The move SHALL:
- close the case with reason `withdrawn`, cancelling open document requests and follow-ups as Close does;
- add the client's history line "You withdrew your application. Your return was not filed." / "您已撤回申请。您的报税表未递交。";
- add the staff history sentence "the client withdrew the application".

It SHALL have no undo. Only the case's own client SHALL be able to withdraw it, and no staff persona SHALL withdraw on a client's behalf through this move.

At Draft the button SHALL not be offered. At Ready to exit, a Hold that came from Ready to exit, Ready to e-file and Rejected, the client SHALL have no Withdraw button. The button SHALL be replaced by "To withdraw now, contact PCDC." / "如需撤回，请联系 PCDC。". After the client contacts PCDC, an admin closes the case with reason `withdrawn`. At E-filed, Accepted and Closed, the client SHALL see neither the button nor the line.

When the client withdraws a case at Filing in progress, Corrections in progress or Review in progress, an office follow-up with purpose `withdrawal_notice` SHALL open (capability `office-follow-up`). Follow-ups SHALL show it as "The client withdrew; tell <name> to stop work.", naming the case's preparer (or, at Review in progress, its reviewer). Withdrawing at any other stage SHALL open no follow-up.

When an admin closes a case with reason `withdrawn` at Ready to exit, a Hold that came from Ready to exit, or Ready to e-file, an office follow-up with purpose `withdrawal_notice` SHALL open. Follow-ups SHALL show it as "The client withdrew; make sure the return is not transmitted in TaxSlayer.". Each notice SHALL stay open until someone resolves it, like any other follow-up.

#### Scenario: Withdrawing before preparation
- **WHEN** a client at Pending intake / filing withdraws, ticking the box
- **THEN** the case is Closed with reason `withdrawn`, the client reads "You withdrew this application. Your return was not filed.", and no follow-up opens

#### Scenario: Withdrawing during preparation
- **WHEN** a client whose case Alex Rivera is preparing withdraws
- **THEN** the case is Closed, and Follow-ups shows "The client withdrew; tell Alex Rivera to stop work." until the office resolves it

#### Scenario: Too late for the button
- **WHEN** a client opens a case at Ready to exit
- **THEN** there is no Withdraw button, and the page says "To withdraw now, contact PCDC."

#### Scenario: Only the client
- **WHEN** a staff persona tries to withdraw a case
- **THEN** it is refused as forbidden, and nothing is recorded
- **AND WHEN** a different client tries to withdraw it
- **THEN** it is refused as not found, because that client can't see the case, and nothing is recorded

#### Scenario: Withdrawn after signing
- **WHEN** the client of a case at Ready to e-file contacts PCDC and an admin closes the case with reason Withdrawn
- **THEN** the case is Closed with reason `withdrawn`, and Follow-ups shows "The client withdrew; make sure the return is not transmitted in TaxSlayer." until the office resolves it

#### Scenario: No line once filed
- **WHEN** a client opens a case at E-filed or Accepted
- **THEN** there is neither a Withdraw button nor "To withdraw now, contact PCDC."

## MODIFIED Requirements

### Requirement: A case moves through the main chain of stages
A case SHALL be in exactly one of these stages. Each stage's key, as stored, and its staff name are:

| Key | Staff name |
|---|---|
| `draft` | Draft |
| `received` | Request sent |
| `screening` | Screening in progress |
| `awaiting_documents` | Waiting for documents |
| `preparation_ready` | Pending intake / filing |
| `preparing` | Filing in progress (preparing) |
| `corrections_required` | Corrections in progress |
| `review_ready` | Pending review |
| `reviewing` | Review in progress |
| `review_approved` | Ready to exit |
| `on_hold` | Hold |
| `ready_to_efile` | Ready to e-file |
| `efiled` | by filing method: Both e-filed (both returns e-filed), E-filed & paper (federal e-filed, state on paper), Both paper (both on paper); E-filed for a case e-filed before filing methods existed |
| `rejected` | Rejected |
| `accepted` | by filing method: Accepted (both e-filed), Accepted & mailed (federal e-filed, state on paper), Mailed (both on paper) |
| `closed` | Closed, followed by its reason's staff name when it has one (for example "Closed · Duplicate") |

The database SHALL refuse any other stage. The moves along the chain SHALL be:

| Move | From | To | Who |
|---|---|---|---|
| Submit, by a client | Draft | Request sent | the client |
| Submit, by the office (Add a case) | Draft | Screening in progress | an admin |
| Start screening | Request sent | Screening in progress | an admin |
| The intake check | Screening in progress | Pending intake / filing | an admin |
| Ask for documents | Screening in progress, Pending intake / filing | Waiting for documents | an admin |
| Verify the last open request | Waiting for documents; Hold from Waiting for documents | the stage the documents were asked from | an admin |
| Put on hold | Waiting for documents, Ready to exit | Hold | an admin |
| Got in touch | Hold | the stage it came from | an admin |
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
| Withdraw | Request sent through Review in progress, and a Hold from Waiting for documents | Closed (withdrawn) | the case's client |

Every other move along the chain SHALL be refused as not available.

Closing SHALL stay one move to Closed, by an admin, with a reason (see "A closed case records why it closed"). It SHALL be allowed from Request sent, Screening in progress, Waiting for documents, Pending intake / filing, Filing in progress, Corrections in progress, Pending review, Review in progress, Hold (whatever it came from) and Rejected, and from a draft the office owns. At Ready to exit and Ready to e-file it SHALL be allowed only with reason `withdrawn`, after the client contacts PCDC; any other reason SHALL be refused as not available. It SHALL be refused from E-filed, Accepted and Closed. A case SHALL receive its client number when it leaves Draft for any stage but Closed, including when the office's submit moves it straight to Screening in progress.

#### Scenario: The intake check waits for screening
- **WHEN** an admin records the intake check on a case at Request sent
- **THEN** it is refused as not available, and the case stays at Request sent

#### Scenario: An office case starts in screening
- **WHEN** an admin submits a case entered with Add a case
- **THEN** the case is at Screening in progress, with a client number

#### Scenario: A volunteer can't start screening or mark e-filing
- **WHEN** a preparer or reviewer tries to start screening, ask for documents, put a case on hold, mark ready to e-file, mark e-filed, record a filing result or return a case to signing
- **THEN** each is refused as forbidden, and nothing is recorded

#### Scenario: Closing after review is refused
- **WHEN** an admin tries to close a case at E-filed or Accepted with any reason, or at Ready to exit or Ready to e-file with any reason but Withdrawn
- **THEN** it is refused as not available

#### Scenario: Withdrawn before filing
- **WHEN** an admin closes a case at Ready to exit or Ready to e-file with reason Withdrawn
- **THEN** the case is Closed

#### Scenario: Closing during screening
- **WHEN** an admin closes a case at Screening in progress, with a reason
- **THEN** the case is Closed

#### Scenario: Closing a held signer
- **WHEN** an admin closes a Hold that came from Ready to exit, with reason Dismissed
- **THEN** the case is Closed

### Requirement: Staff and clients each see their own stage names
Staff screens SHALL show each stage's staff name (see the first requirement), in English. Client screens SHALL show the client's own label in the screen's language (English, 简体, or 繁體 generated from 简体):

| Key | Client label (en / 简体) |
|---|---|
| `draft` | Draft / 草稿 |
| `received` | Sent to PCDC / 已发送给 PCDC |
| `screening` | Being reviewed / 审核中 |
| `awaiting_documents` | Documents needed / 需要文件 |
| `preparation_ready` | Waiting for a volunteer / 等待志愿者 |
| `preparing` | Being prepared / 准备中 |
| `corrections_required` | Being corrected / 正在更正 |
| `review_ready` | Waiting for review / 等待检查 |
| `reviewing` | Being checked / 检查中 |
| `review_approved` | Ready to sign / 等待签名 |
| `on_hold` | Waiting for you / 等待您的回复 |
| `ready_to_efile` | Signed / 已签名 |
| `efiled` | E-filed / 已电子递交 (both e-filed, or e-filed before filing methods existed); Filed / 已递交 (federal e-filed, state on paper); Mailed / 已邮寄 (both on paper) |
| `rejected` | Needs a correction / 需要更正 |
| `accepted` | Complete / 已完成 |
| `closed` | Closed / 已关闭 |

The client's progress page SHALL show five steps:
- Intake 登记 (Draft, Request sent, Screening in progress, Waiting for documents, and a Hold that came from Waiting for documents);
- Preparation 准备 (Pending intake / filing, Filing in progress, Corrections in progress);
- Review 审核 (Pending review, Review in progress);
- Signing 签名 (Ready to exit, and a Hold that came from Ready to exit);
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

#### Scenario: The stepper on hold
- **WHEN** a client's case is on a Hold that came from Waiting for documents
- **THEN** Intake is current, and the badge reads "Waiting for you"
- **AND WHEN** another client's case is on a Hold that came from Ready to exit
- **THEN** Signing is current, and the badge reads "Waiting for you"

### Requirement: The lists and the case page show every stage
**The work board** SHALL keep its three tabs:
- **Available:** Pending intake / filing with no preparer.
- **Waiting for preparation:** Filing in progress and Corrections in progress.
- **Waiting for review:** Pending review and Review in progress.

Its search SHALL reach a case in any stage.

**The case pool** SHALL have these tabs, in this order: All, Intake (Draft, Request sent, Screening in progress), Available, Waiting for preparation, Waiting for review, Waiting on client (Waiting for documents, Ready to exit), Filing (Ready to e-file, E-filed), Needs attention (Hold, Rejected), Done (Accepted), and Closed. Its stage filter SHALL list every stage. The Closed tab SHALL have a reason filter: All, each of the six reasons, and No reason (cases closed before reasons existed). The pool, Follow-ups and the case page SHALL show E-filed and Accepted by their staff name for the case's filing method.

**Follow-ups** SHALL show an admin:
- a row for each case at Request sent ("New application: open it to start screening."), with **Open**;
- a row for each case at Screening in progress ("Finish screening."), with **Open**;
- a **Waiting for documents** row for each case at Waiting for documents ("Waiting for the client's documents."), with **Put on hold…**;
- a **Hold** row for each case on Hold: "Can't reach the client about documents." for a Hold that came from Waiting for documents, or "Can't reach the client to sign Form 8879." for one that came from Ready to exit. It has **Got in touch…** and **Close…**;
- a **Withdrawn** row for each open `withdrawal_notice` follow-up, with **Resolve**. It reads "The client withdrew; tell <name> to stop work." for a client's own withdrawal during preparation or review, or "The client withdrew; make sure the return is not transmitted in TaxSlayer." for an admin's withdrawn close at Ready to exit, a Hold from Ready to exit, or Ready to e-file;
- a row for each case at Ready to exit ("Waiting for the client to sign Form 8879."), with **Mark ready to e-file…**. While the reviewer's call with the client is still pending, the row SHALL read "Waiting for the reviewer's call with the client." instead, with the call-pending explanation in place of the button. For a case returned to signing after a rejection, the row SHALL read "Waiting for the client to sign again.";
- a row for each case at Ready to e-file ("Ready to e-file."), with **Mark e-filed…**;
- a **Filing result** row for each case at E-filed, and for each case at Rejected with a return still waiting, with **Record filing result…**. It SHALL read:
  - "Waiting for the IRS and Pennsylvania." while both e-filed returns wait;
  - "Waiting for Pennsylvania's answer." or "Waiting for the IRS's answer." while one e-filed return waits;
  - "Record when the Pennsylvania return is mailed." (or "…the federal return…", or "Record when the returns are mailed." for both) while a paper return waits;
- a **Rejected** row for each case at Rejected ("Rejected: contact the client to fix and sign again."), followed by the latest fix note, as typed, if there is one. It has **Return to signing…**, or, while a return still waits, "Waiting for Pennsylvania's answer before the return can go back to signing." (or "…the IRS's answer…") in its place;

alongside today's rows. A case at Accepted SHALL have no row. Follow-ups' filter SHALL list every kind. A row's waiting time SHALL count from the case's last move or recorded result.

The amber (3 days) and red (5 days) colouring SHALL apply:
- to a Waiting for documents row;
- to a Filing result row, only while one of its returns waits for an e-file acknowledgment.

A Hold row, a Withdrawn row, a row waiting only for a mailing to be recorded, and a Rejected row SHALL never be coloured.

**The case page:**
- Its lifecycle bar SHALL show Request sent, Screening in progress, Pending intake / filing, Filing in progress, Pending review, Review in progress, Ready to exit, Ready to e-file, E-filed, Accepted and Closed. Corrections in progress SHALL show on Filing in progress, and Rejected on E-filed. Waiting for documents SHALL show on the stage it was asked from. Hold SHALL show on the stage it came from: Ready to exit, or the stage the documents were asked from.
- For an admin, the intake-check form SHALL show at Screening in progress only.
- For an admin, the office actions panel SHALL offer Ask for documents…, Put on hold…, Got in touch… and Close… at the stages their moves allow. Close… SHALL offer the six reasons and the note.
- At Request sent, the case page SHALL say that screening starts when an admin opens the case.
- A volunteer's "Your next step" SHALL say what each new stage is waiting for:
  - Waiting for documents: "The office is waiting for the client's documents.";
  - Hold: "The office is trying to reach the client.";
  - E-filed: "The office records the answers from the IRS and Pennsylvania.";
  - Rejected: "A return was rejected. The office arranges the fix and contacts the client.";
  - Accepted: "The returns are accepted or mailed. Nothing more is needed here.".
- The case's history SHALL name each new move.

#### Scenario: The pool's Filing tab
- **WHEN** an admin opens the case pool's Filing tab
- **THEN** it lists the cases at Ready to e-file and E-filed, and no other

#### Scenario: Needs attention and Done
- **WHEN** an admin opens the case pool's Needs attention tab, then its Done tab
- **THEN** the first lists only cases on Hold and Rejected cases, and the second only Accepted cases

#### Scenario: Waiting on client
- **WHEN** an admin opens the case pool's Waiting on client tab
- **THEN** it lists the cases at Waiting for documents and Ready to exit, and no other

#### Scenario: Closed by reason
- **WHEN** an admin filters the Closed tab by Withdrawn
- **THEN** it lists only cases closed with reason `withdrawn`

#### Scenario: Follow-ups shows signing
- **WHEN** a case is approved by its reviewer, and the reviewer has recorded the conversation with the client
- **THEN** Follow-ups shows its row, "Waiting for the client to sign Form 8879.", with Mark ready to e-file…

#### Scenario: Waiting for documents turns amber
- **WHEN** a case has waited three days at Waiting for documents
- **THEN** its row is amber, and reads "Waiting for the client's documents."

#### Scenario: A hold is never coloured
- **WHEN** a case has been on Hold for ten days
- **THEN** its Hold row is not coloured

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
| Waiting for documents | PCDC needs more documents from you before your return can be prepared. See the requests below. | PCDC 需要您提供更多文件，才能准备您的报税表。请查看下方的文件请求。 |
| Hold, from Waiting for documents | PCDC has been trying to reach you about the documents we need. Please upload them below or contact PCDC. | PCDC 一直在设法联系您，询问所需的文件。请在下方上传，或联系 PCDC。 |
| Hold, from Ready to exit | PCDC has been trying to reach you to sign Form 8879. Please contact PCDC. Your return can't be filed until you sign. | PCDC 一直在设法联系您签署 8879 表。请联系 PCDC。您签署后才能递交报税表。 |
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

A closed case SHALL show the message for its reason:

| Reason | English | 简体 |
|---|---|---|
| `out_of_scope` | This application was closed because the return is outside what VITA volunteers can prepare. Your return was not filed by PCDC. | 此申请已关闭，因为该报税表超出了 VITA 志愿者可以准备的范围。PCDC 未递交您的报税表。 |
| `no_need_to_file` | A PCDC volunteer confirmed with you that you don't need to file a return this year, so this application was closed. | PCDC 志愿者已与您确认，您今年无需递交报税表，因此此申请已关闭。 |
| `duplicate` | This application was closed. Your return continues under your other application with PCDC. | 此申请已关闭。您的报税表将在您在 PCDC 的另一份申请中继续处理。 |
| `dismissed` | PCDC could not reach you, so this application was closed. Your return was not filed. | PCDC 无法联系到您，因此此申请已关闭。您的报税表未递交。 |
| `withdrawn` | You withdrew this application. Your return was not filed. | 您已撤回此申请。您的报税表未递交。 |
| `other`, or no reason (closed before reasons existed) | This application was closed by the office. This does not change any return filed elsewhere. | 此申请已由办公室关闭。这不影响在其他地方递交的任何报税表。 |

The `duplicate` message SHALL never name the other application. No closed message SHALL show the staff note.

Draft, Filing in progress, Corrections in progress and Review in progress SHALL keep today's messages.

Each new move SHALL add one line to the client's history, in their language:

| Move | English | 简体 |
|---|---|---|
| Start screening, and the office's submit | PCDC started reviewing your application. We may call you. | PCDC 已开始审核您的申请。我们可能会致电您。 |
| Ask for documents | PCDC asked for these documents: {titles}. | PCDC 请您提供以下文件：{titles}。 |
| Put on hold | PCDC is trying to reach you. | PCDC 正在设法联系您。 |
| Got in touch, and the return after the last verified document | PCDC is working on your application again. | PCDC 已继续处理您的申请。 |
| Withdraw | You withdrew your application. Your return was not filed. | 您已撤回申请。您的报税表未递交。 |
| Close | the closed message for its reason, from the table above; for `other`, today's line | the same, in 简体 |
| Mark ready to e-file | PCDC recorded that you signed Form 8879. Your return is ready to e-file. | PCDC 已记录您签署了 8879 表。您的报税表可以电子递交了。 |
| Mark e-filed, both e-filed | PCDC e-filed your return. | PCDC 已电子递交您的报税表。 |
| Mark e-filed, federal e-filed and state on paper | PCDC e-filed your federal return and mailed your Pennsylvania return. | PCDC 已电子递交您的联邦报税表，并邮寄了您的宾州报税表。 |
| Mark e-filed, both on paper | PCDC mailed your returns. | PCDC 已邮寄您的报税表。 |
| Mark e-filed, after Return to signing, one return | PCDC e-filed your federal return. / PCDC mailed your federal return. / PCDC e-filed your Pennsylvania return. / PCDC mailed your Pennsylvania return. | PCDC 已电子递交您的联邦报税表。/ PCDC 已邮寄您的联邦报税表。/ PCDC 已电子递交您的宾州报税表。/ PCDC 已邮寄您的宾州报税表。 |
| Record filing result | for the returns recorded in the move: their Accepted, Rejected or Mailed sentences from the table above, combined when both are the same, federal first | the same sentences in 简体 |
| Return to signing | PCDC corrected your return. You need to sign it again. | PCDC 已更正您的报税表，您需要再次签名。 |
| The screening checks | PCDC finished screening your application. A volunteer will start preparing your return next. | PCDC 已完成对您申请的审核。接下来会有志愿者开始准备您的报税表。 |

`{titles}` SHALL be every title requested in the move, as the office typed it, joined with ", ". The titles SHALL stay as typed in every language, as a preparer's request title does today.

Every history line the system can store SHALL have its 简体 translation. Earlier history lines SHALL keep their words and translations. The screening checks' line SHALL replace "Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation." for every new record; lines already stored SHALL keep that sentence and its translation. No client message or history line SHALL name a phone number, a hold note or a close note.

#### Scenario: A history line in 简体
- **WHEN** a client reading in 简体 opens a case an admin marked ready to e-file
- **THEN** its history shows "PCDC 已记录您签署了 8879 表。您的报税表可以电子递交了。"

#### Scenario: No phone number
- **WHEN** a client reads any new stage message or history line, in any language, including each Ready to exit variant with an appointment, the Accepted message, the Hold messages and every closed message
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

#### Scenario: Waiting for documents, in 简体
- **WHEN** a client reading in 简体 opens a case at Waiting for documents
- **THEN** the status panel reads "PCDC 需要您提供更多文件，才能准备您的报税表。请查看下方的文件请求。", and the requests are listed below it

#### Scenario: Closed, not filed
- **WHEN** a client opens a case closed with reason Dismissed
- **THEN** the status panel reads "PCDC could not reach you, so this application was closed. Your return was not filed."

#### Scenario: A duplicate doesn't name the other application
- **WHEN** a client opens a case closed with reason Duplicate
- **THEN** the status panel reads "This application was closed. Your return continues under your other application with PCDC.", and no reference or client number of another case appears
