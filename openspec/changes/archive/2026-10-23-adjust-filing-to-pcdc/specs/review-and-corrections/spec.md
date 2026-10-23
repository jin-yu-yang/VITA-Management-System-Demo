## MODIFIED Requirements

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
- **THEN** the admin is offered Mark ready to e-file…, its Follow-ups row reads "Waiting for the client to sign.", and the database accepts the confirmed move

#### Scenario: No hands the step to the office
- **WHEN** the reviewer approves with "no"
- **THEN** the review's contact step is completed with no outcome, the case has an open office follow-up, and "Your next step" says the office will go over the return with the client, and Mark ready to e-file waits for that follow-up (capability `case-lifecycle`)

#### Scenario: Recording a conversation after a questionnaire approval is refused
- **WHEN** the reviewer sends `RECORD_REVIEW_CONTACT` on a case approved with a questionnaire
- **THEN** the database refuses it with `INVALID_TRANSITION`

#### Scenario: A legacy pending approval can still be recorded
- **WHEN** a review approved before this change still has its contact step pending, and its reviewer records a reached conversation
- **THEN** the step is completed as today, and Mark ready to e-file is then offered
