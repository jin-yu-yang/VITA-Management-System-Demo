## ADDED Requirements

### Requirement: Approving without going over the return opens an office follow-up
When a reviewer approves a review and answers "no" to going over the return with the taxpayer or spouse, the approval SHALL succeed, and in the same transaction the system SHALL open one office follow-up of kind `go_over_return` on the case. The follow-up SHALL be assigned to the workspace's configured office follow-up person, created by the reviewer, and given the reason "Go over the return with the client: the reviewer did not." It SHALL have no document request. If the workspace has no configured office person, or that person lacks the `followup` capability, the approval SHALL be refused with `VALIDATION` and nothing SHALL change. An approval that answers "yes" SHALL open no follow-up.

#### Scenario: No opens a follow-up
- **WHEN** the reviewer approves with "Did you go over the return" answered no
- **THEN** the case moves to `review_approved` and has one open `go_over_return` follow-up assigned to the office person

#### Scenario: Yes opens none
- **WHEN** the reviewer approves with that question answered yes and a date
- **THEN** the case has no new follow-up

#### Scenario: No office person configured
- **WHEN** the workspace has no default office follow-up person and the reviewer approves with no
- **THEN** the database refuses the approval with `VALIDATION`, and the review attempt stays active

### Requirement: A follow-up has a kind, and only a document follow-up names a request
Every office follow-up SHALL have a kind: `document` (opened by `ESCALATE_CONTACT` for an unanswered document request) or `go_over_return`. A `document` follow-up SHALL name its document request, and a `go_over_return` follow-up SHALL name none. The database SHALL reject any row that breaks this. Follow-ups that existed before this change SHALL be of kind `document`.

#### Scenario: Existing follow-ups keep their request
- **WHEN** the migration runs on a workspace with an open document follow-up
- **THEN** that follow-up is of kind `document` and still names its request

#### Scenario: Escalating a document still names the request
- **WHEN** a preparer escalates an unanswered document request
- **THEN** the new follow-up is of kind `document` and names that request

### Requirement: The office works a go-over follow-up like any other
The office SHALL see a `go_over_return` follow-up in the Follow-ups queue and on the case page's follow-up panel, labelled "Go over the return with the client", with no document line. The assignee SHALL record calls on it with `RECORD_CONTACT` and close it with `RESOLVE_FOLLOWUP`, under the same rules as a document follow-up. Closing the case SHALL cancel it like any other open follow-up.

#### Scenario: The queue lists the task
- **WHEN** an office persona opens Follow-ups after an approval answered no
- **THEN** the case is listed with "Go over the return with the client", and the drawer shows no document request

#### Scenario: The office resolves it
- **WHEN** the assignee records a reached call and resolves the follow-up with outcome reached
- **THEN** the follow-up is resolved, and the case's stage and review attempt are unchanged

#### Scenario: Only the assignee works it
- **WHEN** an office persona who is not the assignee records a call on the follow-up
- **THEN** the database refuses it with `FORBIDDEN`
