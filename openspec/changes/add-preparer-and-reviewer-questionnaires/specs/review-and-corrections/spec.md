## ADDED Requirements

### Requirement: Sending a return to review requires the preparer questionnaire
`SUBMIT_REVIEW` and `RESUBMIT_REVIEW` SHALL each carry a preparer questionnaire. The database SHALL refuse the action with `VALIDATION` unless all four answers are valid, and a refused action SHALL change nothing: no stage move, no new preparation version, no stored answer, no history line. The answers are:
1. who confirmed the intake information with the preparer: `client`, `spouse` or `other`. `other` SHALL require a name of 1 to 120 characters, and the name SHALL be absent otherwise. How they confirmed it: `phone`, `in_person`, `text`, `email` or `video`;
2. "I have completed the shaded parts of the 13614-C", which SHALL be true;
3. "Filing – PA State return: State Forgiveness set to Y", which SHALL be true on every case;
4. the date the return was marked ready to review in TaxSlayer (TSO), a calendar date with no time.

The form SHALL sit inline in "Your next step", never in a dialog, and SHALL fill in today's date for answer 4. `RESUBMIT_REVIEW` SHALL still require its `resolution` text. A payload with any key outside these SHALL be refused.

#### Scenario: A complete questionnaire sends the return to review
- **WHEN** the case's preparer, on a case at Filing in progress (preparing), answers client / phone, ticks both confirmations, keeps today's date and records that preparation is complete
- **THEN** the case moves to Pending review (`review_ready`) at the next preparation version, and the answers are stored for that version

#### Scenario: An unticked State Forgiveness confirmation is refused
- **WHEN** the preparer sends `SUBMIT_REVIEW` with `stateForgivenessSet` false
- **THEN** the database refuses it with `VALIDATION`, and the case's stage, revision and preparation version are unchanged

#### Scenario: Other needs a name
- **WHEN** the preparer answers `other` for who confirmed the intake and gives no name
- **THEN** the database refuses the action with `VALIDATION`

#### Scenario: The old empty payload is refused
- **WHEN** a browser sends `SUBMIT_REVIEW` with an empty payload
- **THEN** the database refuses it with `VALIDATION`

#### Scenario: The date defaults to today
- **WHEN** the preparer opens "Your next step" on a case at Filing in progress (preparing)
- **THEN** the preparer form is shown inline, and its TaxSlayer date input holds the browser's current local date

### Requirement: TaxSlayer dates fall within the case's season
Each TaxSlayer date SHALL be a real calendar date from 1 January of the case's season (the workspace's current season if the case has none) through the day after the database's current date, or the action SHALL be refused with `VALIDATION`. The TaxSlayer dates are preparer answer 4, reviewer answer 1, and the reviewer's date gone over with the client.

#### Scenario: A date in the wrong year is refused
- **WHEN** the preparer enters a ready-to-review date in the year before the case's season
- **THEN** the database refuses the action with `VALIDATION`

#### Scenario: An impossible date is refused
- **WHEN** the reviewer enters `2026-02-30` as the completed date
- **THEN** the database refuses the approval with `VALIDATION`

### Requirement: Every preparer submission is kept, and resubmission starts from the last one
The system SHALL store one preparer questionnaire per case and preparation version and SHALL never overwrite an earlier one. On a case at Corrections in progress (`corrections_required`), the resubmit form SHALL open with the latest submission's answers filled in. The exception is the TaxSlayer date, which SHALL be today's date. A case whose earlier versions have no questionnaire SHALL open the form blank, with today's date.

#### Scenario: Resubmitting keeps both submissions
- **WHEN** a case was submitted at version 1, sent back for corrections, and resubmitted with a different confirmation method
- **THEN** the case holds two preparer questionnaires, version 1 and version 2, each with the answers given at that time

#### Scenario: The resubmit form is prefilled
- **WHEN** the preparer opens the resubmit form after corrections were requested on a version answered client / in person
- **THEN** the form shows client and in person already chosen, both confirmations ticked, and today's date

### Requirement: Approving a review requires the reviewer questionnaire
`APPROVE_REVIEW` SHALL carry a reviewer questionnaire. The database SHALL refuse the approval with `VALIDATION`, changing nothing, unless:
1. the date the return was marked completed in TaxSlayer (TSO) is given;
2. PA forgiveness (Schedule SP) is `eligible` or `not_eligible`;
3. "Did you go over the return with the taxpayer/spouse" is yes or no. When yes, the date gone over SHALL be given, and how (`in_person`, `phone`, `video` or `other`) MAY be given. When no, neither SHALL be present;
4. how the client will sign Form 8879 is `portal` (e-sign in the TaxSlayer Customer Portal) or `in_person`;
5. an appointment to sign, a date and time to the minute, is given when answer 4 is `in_person` and the case's intake answer `service` is not `same_day`, and is absent otherwise.

Remarks SHALL be optional free text of at most 2000 characters. On a case at Review in progress (`reviewing`), the form SHALL sit inline in "Your next step", directly above the Approve button, never in a dialog. It SHALL fill in today's date for answer 1.

#### Scenario: A complete reviewer questionnaire approves the review
- **WHEN** the case's reviewer gives today's date, eligible, yes with today's date and phone, and portal, and approves
- **THEN** the case moves to Ready to exit (`review_approved`), and the answers are stored for that review attempt

#### Scenario: The form is above Approve
- **WHEN** the reviewer opens "Your next step" on a case at Review in progress
- **THEN** the reviewer questionnaire is shown inline, and the Approve button follows it, with no dialog

#### Scenario: Yes without the date is refused
- **WHEN** the reviewer answers yes to going over the return and gives no date
- **THEN** the database refuses the approval with `VALIDATION`, and the review attempt stays active

#### Scenario: An in-person signing on a drop-off case needs an appointment
- **WHEN** the case's `service` is `drop_off` and the reviewer chooses in person with no appointment
- **THEN** the database refuses the approval with `VALIDATION`

#### Scenario: A same-day case signs in person without an appointment
- **WHEN** the case's `service` is `same_day` and the reviewer chooses in person
- **THEN** the form asks no appointment, and the database accepts the approval without one and refuses one that is sent

#### Scenario: An appointment with seconds is refused
- **WHEN** the reviewer sends an appointment of `2026-11-02T14:30:15`
- **THEN** the database refuses the approval with `VALIDATION`

### Requirement: Going over the return is prefilled from the contact log
When the reviewer form opens, it SHALL look in the case's contact log for entries with purpose "go over tax return" (`go_over_return`) and outcome reached, in either direction. If there is one, the form SHALL start with going over the return answered yes, and with the date and how taken from the entry with the latest contact time:
- the date is that contact time's date in America/New_York;
- how is in person, phone or video for those methods, and other for text or email.

A reached contact for any other purpose, or a go-over contact with any other outcome, SHALL prefill nothing. The reviewer SHALL be able to change every prefilled answer, and the database SHALL check a prefilled answer exactly like a typed one.

#### Scenario: A logged go-over call prefills yes
- **WHEN** the case's contact log holds an outgoing phone call on 10/14/2026 at 3:05 PM, purpose go over tax return, outcome reached, and the reviewer opens the approval form
- **THEN** the form shows yes, 2026-10-14 and Phone

#### Scenario: The latest of two is used
- **WHEN** the log holds a reached go-over phone call on 10/12 and a reached go-over in-person visit on 10/15
- **THEN** the form shows yes, 2026-10-15 and In person

#### Scenario: The client wrote in
- **WHEN** the only go-over entry is an incoming email, which the log stores as reached
- **THEN** the form shows yes, its date, and Other

#### Scenario: Another purpose prefills nothing
- **WHEN** the only reached contact has purpose request documents, and another go-over call has outcome no answer
- **THEN** going over the return, its date and how start unanswered

### Requirement: The sign-8879 answer defaults from the client's service
The reviewer form SHALL preselect answer 4 from the case's intake answer `service`: `same_day` SHALL preselect in person, `online` SHALL preselect the Customer Portal, and `drop_off` or no answer SHALL preselect nothing. The reviewer SHALL be able to choose either option on any case. The database SHALL accept either for any `service`.

#### Scenario: Online defaults to the Customer Portal
- **WHEN** the reviewer opens the approval form on a case whose `service` is `online`
- **THEN** "E-sign in the TaxSlayer Customer Portal" is selected

#### Scenario: Drop-off has no default
- **WHEN** the reviewer opens the approval form on a case whose `service` is `drop_off`
- **THEN** neither signing option is selected

#### Scenario: Online may still sign in person
- **WHEN** a case's `service` is `online` and the reviewer chooses in person with an appointment
- **THEN** the approval is accepted

### Requirement: The reviewer questionnaire records the Exit Form results
The reviewer questionnaire SHALL hold three optional Exit Form groups: Federal, State, and Local (the form's "Other Tax"). Federal and State SHALL appear at most once each. Local SHALL accept up to five entries, at most one per type. A group that is present SHALL have a filing method (`efile` or `paper`) and a result (`refund`, `owe` or `none`).

In the form, Federal, State and each Local type SHALL be a collapsible group, closed until the reviewer opens it. A group the reviewer filled in SHALL stay open when the form is shown again after a refusal.

A refund or an amount owed SHALL carry an amount from 0.00 to 999,999.99 with at most two decimal places. A result of `none` SHALL carry no amount. A refund SHALL say direct deposit or check. An amount owed SHALL say direct debit, with a debit date, or mail check.

Each Local entry SHALL have a type: `NPT`, `BIRT`, `EET`, `SIT` or `PAIBWTR`, shown with those labels (PAIBWTR is the Philadelphia Wage Tax refund petition). Tax year, date, client number and taxpayer name SHALL NOT be asked; they come from the case.

The Exit Form SHALL store only the payment method (direct deposit, check, direct debit or mail check), the amounts and the debit date. It SHALL NEVER store an account number, a routing number or any other banking detail. This revises historical ruling R28, which allowed no refund, banking or amount field in the review workflow. Any group that breaks these rules, or that carries any key outside them, SHALL refuse the approval with `VALIDATION`.

#### Scenario: No Exit Form groups at all
- **WHEN** the reviewer fills in answers 1 to 5 and no Exit Form group
- **THEN** the approval is accepted

#### Scenario: The groups start closed
- **WHEN** the reviewer opens the approval form
- **THEN** Federal, State, and the Local groups NPT, BIRT, EET, SIT and PAIBWTR are each collapsed, and each opens on its own

#### Scenario: A refund needs its amount and how it is paid
- **WHEN** the Federal group says e-file and refund with no amount
- **THEN** the database refuses the approval with `VALIDATION`

#### Scenario: Two Local entries of different types
- **WHEN** the reviewer adds a Local NPT entry (e-file, owe 120.00, mail check) and a Local BIRT entry (paper, none)
- **THEN** the approval is accepted and both entries are stored

#### Scenario: The same Local type twice is refused
- **WHEN** the reviewer adds two Local entries of type `SIT`
- **THEN** the database refuses the approval with `VALIDATION`

#### Scenario: Banking details are refused
- **WHEN** the Federal group says refund by direct deposit and also carries an `accountNumber` or a `routingNumber`
- **THEN** the database refuses the approval with `VALIDATION`, and nothing is stored

#### Scenario: A direct debit needs its date
- **WHEN** the State group says owe 45.50 by direct debit with no debit date
- **THEN** the database refuses the approval with `VALIDATION`

### Requirement: An approval with a questionnaire settles the review-contact step
An approval that carries a reviewer questionnaire SHALL NOT leave the review's client-contact step pending, so no one else is asked to contact the client:
- on "yes" to going over the return, the step SHALL be completed with outcome reached;
- on "no", it SHALL be completed with no outcome, and the office follow-up takes the contact over.

In both cases the step SHALL carry the approval time.

`RECORD_REVIEW_CONTACT` SHALL remain. It SHALL be refused with `INVALID_TRANSITION` on such an approval, and SHALL keep working on an approval from before this change whose step is still pending. "Your next step" SHALL offer no "Record this conversation" form after a questionnaire approval.

An approval answered "yes" SHALL meet Mark ready to e-file's wait for the reviewer's conversation (capability `case-lifecycle`) at once.

#### Scenario: Yes completes the step
- **WHEN** the reviewer approves with "yes" and a date
- **THEN** the review's contact step is completed with outcome reached, and "Your next step" says the reviewer went over the return with the client on that date

#### Scenario: Yes lets the admin mark ready to e-file
- **WHEN** the reviewer approves with "yes", and an admin opens the case at Ready to exit
- **THEN** the admin is offered Mark ready to e-file…, its Follow-ups row reads "Waiting for the client to sign Form 8879.", and the database accepts the confirmed move

#### Scenario: No hands the step to the office
- **WHEN** the reviewer approves with "no"
- **THEN** the review's contact step is completed with no outcome, the case has an open office follow-up, and "Your next step" says the office will go over the return with the client

#### Scenario: Recording a conversation after a questionnaire approval is refused
- **WHEN** the reviewer sends `RECORD_REVIEW_CONTACT` on a case approved with a questionnaire
- **THEN** the database refuses it with `INVALID_TRANSITION`

#### Scenario: A legacy pending approval can still be recorded
- **WHEN** a review approved before this change still has its contact step pending, and its reviewer records a reached conversation
- **THEN** the step is completed as today, and Mark ready to e-file is then offered

### Requirement: Only the case's preparer and reviewer answer
The preparer questionnaire SHALL be accepted only from the case's preparer, and the reviewer questionnaire only from the case's reviewer. These are the same checks the hand-off actions already make. Any other persona SHALL be refused as the action is refused today, and nothing SHALL be stored.

#### Scenario: Another volunteer cannot submit for the preparer
- **WHEN** a volunteer who is not the case's preparer sends `SUBMIT_REVIEW` with a valid questionnaire
- **THEN** the database refuses it with `FORBIDDEN`, and no preparer questionnaire is stored

#### Scenario: The preparer cannot approve their own case
- **WHEN** the case's preparer sends `APPROVE_REVIEW` with a valid questionnaire
- **THEN** the database refuses it as today, and no reviewer questionnaire is stored

### Requirement: Staff see the answers on the case page, and clients never do
Every staff member who can open a case SHALL see, in its Independent review panel, the preparer answers for each preparation version and the reviewer answers for each approved attempt. A version or attempt with no stored questionnaire SHALL read "No questionnaire was recorded for this version."

While a case is at Review in progress (`reviewing`) and its current version is not its first, "Your next step" SHALL show the reviewer the previous preparer answers next to the current ones, and SHALL mark each answer that changed.

A client session SHALL be able to read neither questionnaire table: row-level security SHALL return no rows to an applicant, and the client adapter SHALL never request them. The client SHALL learn only how and when they will sign (capability `case-lifecycle`), never an answer, amount or payment method.

#### Scenario: The office sees a reviewer's answers
- **WHEN** an office persona opens an approved case
- **THEN** the review panel shows the completed date, PA forgiveness, going over, the signing method and appointment, the Exit Form groups and the remarks

#### Scenario: The reviewer compares two submissions
- **WHEN** the reviewer opens a resubmitted case at Review in progress whose confirmation method changed from phone to in person
- **THEN** "Your next step" shows both versions' answers side by side, with the method marked as changed

#### Scenario: A client session reads nothing
- **WHEN** a signed-in applicant selects from `preparer_questionnaires` and `reviewer_questionnaires` for their own case
- **THEN** both queries return no rows

#### Scenario: A case reviewed before this change
- **WHEN** staff open a case whose review was approved before the questionnaires existed
- **THEN** that attempt reads "No questionnaire was recorded for this version."

### Requirement: Sample cases carry fictional answers
Applying a fixture scenario to a sample case (seeding or a checkpoint reset) SHALL first clear the case's questionnaires and signing plan with the rest of its work. It SHALL then seed:
- fictional preparer answers for every seeded preparation version of the Pending review (`review_ready`), Corrections in progress (`corrections_required`) and Ready to exit (`review_approved`) scenarios;
- for the approved attempt of the Ready to exit scenario, fictional reviewer answers that say yes and the Customer Portal, its contact step completed with outcome reached, and the signing plan `portal`.

#### Scenario: The seeded approved sample shows answers
- **WHEN** the samples are seeded and staff open the Ready to exit sample
- **THEN** the review panel shows preparer answers for versions 1 and 2 and reviewer answers for the approved attempt, and an admin is offered Mark ready to e-file…

#### Scenario: A checkpoint reset leaves no stale answers
- **WHEN** a presenter resets an approved sample case to the `ready_for_review` checkpoint
- **THEN** the case holds exactly one preparer questionnaire (version 1), no reviewer questionnaire, and no signing plan
