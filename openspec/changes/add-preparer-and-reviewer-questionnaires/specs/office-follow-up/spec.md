## ADDED Requirements

### Requirement: Approving without going over the return opens an office follow-up
When a reviewer approves a review and answers "no" to going over the return with the taxpayer or spouse, the approval SHALL succeed. In the same transaction, the system SHALL open one office follow-up with purpose `go_over_return` on the case. The follow-up SHALL:
- be assigned to the workspace's configured office follow-up person;
- be created by the reviewer;
- have the reason "Go over the return with the client: the reviewer did not.";
- have no document request.

The same approval SHALL close the reviewer's own review-contact step (capability `review-and-corrections`), so the office follow-up is the only request to contact the client.

If the workspace has no configured office person, or that person lacks the `followup` capability, the approval SHALL be refused with `VALIDATION` and nothing SHALL change. An approval that answers "yes" SHALL open no follow-up.

#### Scenario: No opens a follow-up
- **WHEN** the reviewer approves with "Did you go over the return" answered no
- **THEN** the case moves to Ready to exit (`review_approved`) and has one open `go_over_return` follow-up assigned to the office person

#### Scenario: Yes opens none
- **WHEN** the reviewer approves with that question answered yes and a date
- **THEN** the case has no new follow-up

#### Scenario: No office person configured
- **WHEN** the workspace has no default office follow-up person and the reviewer approves with no
- **THEN** the database refuses the approval with `VALIDATION`, and the review attempt stays active

### Requirement: A follow-up has a purpose, and only a document follow-up names a request
Every office follow-up SHALL have a purpose, in the contact log's own words:
- `request_documents`, opened by `ESCALATE_CONTACT` for an unanswered document request;
- `go_over_return`.

A `request_documents` follow-up SHALL name its document request, and a `go_over_return` follow-up SHALL name none. The database SHALL reject any row that breaks this. Follow-ups that existed before this change SHALL have purpose `request_documents`.

#### Scenario: Existing follow-ups keep their request
- **WHEN** the migration runs on a workspace with an open document follow-up
- **THEN** that follow-up has purpose `request_documents` and still names its request

#### Scenario: Escalating a document still names the request
- **WHEN** a preparer escalates an unanswered document request
- **THEN** the new follow-up has purpose `request_documents` and names that request

### Requirement: The office works a go-over follow-up like any other
The office SHALL see a case with an open `go_over_return` follow-up in Follow-ups as a "Call the client" row with its open-task count and **Log contact**, like any case with an open task. The office SHALL also see the task in the Log contact drawer and on the case page's Follow-up tab, titled "Go over the return with the client", with no document line.

The assignee SHALL log contacts on it in the contact log, linked to the task, and close it with `RESOLVE_FOLLOWUP`, under the same rules as a document follow-up. Closing the case SHALL cancel it like any other open follow-up. While it is open, Mark ready to e-file SHALL wait for it (capability `case-lifecycle`).

#### Scenario: The queue lists the task
- **WHEN** an office persona opens Follow-ups after an approval answered no
- **THEN** the case has a "Call the client" row with 1 open task, and its Log contact drawer shows "Go over the return with the client: the reviewer did not." with no document request

#### Scenario: The case page names the task
- **WHEN** an office persona opens the case's Follow-up tab
- **THEN** the task is titled "Go over the return with the client", with no document line, and its Log contact form starts with "Go over tax return" chosen

#### Scenario: The office logs and resolves it
- **WHEN** the assignee logs a reached phone call linked to the task, then resolves the follow-up with outcome reached
- **THEN** the entry is listed under the task's "Contacts so far", the follow-up is resolved, the case's stage and review attempt are unchanged, and an admin is now offered Mark ready to e-file… (capability `case-lifecycle`)

#### Scenario: Only the assignee works it
- **WHEN** an office persona who is not the assignee sends a contact linked to the follow-up
- **THEN** the database refuses it with `FORBIDDEN`
