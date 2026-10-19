## MODIFIED Requirements

### Requirement: Office follow-up contacts are logged in the contact log
The case page's Follow-up tab and the office queue's drawer SHALL use the same Log contact form as the Contacts tab, inside each open task the persona may record on, and SHALL call it "Log contact"; the drawer and the queue button that opens it SHALL be named "Log contact". A contact logged there SHALL be a log entry linked to that task. Inside a task, the form SHALL start with the task's purpose chosen: "Request documents" for a document follow-up, "Go over tax return" for a go-over follow-up (capability `office-follow-up`). The persona SHALL be able to choose another purpose. The Contacts tab's own form SHALL still start with no purpose chosen. Only the task's assignee, holding `followup`, SHALL be able to log a contact linked to an open task; the database SHALL refuse a link to a task that is not open, or by anyone else. Each task SHALL list, under "Contacts so far", the summary lines of the entries linked to it, oldest first, or "No contact has been logged on this task yet.". "Resolve this task" SHALL stay as it is, separate from logging.

#### Scenario: Sam logs from the drawer
- **WHEN** Sam, assigned to an open follow-up task, logs a phone call with no answer from the office queue's Log contact drawer
- **THEN** the entry appears under that task's "Contacts so far" and in the case's Contacts tab, marked with the task, and the task stays open

#### Scenario: The task's purpose is chosen
- **WHEN** Sam opens the Log contact form inside a document follow-up, and then inside a go-over follow-up
- **THEN** the first starts with "Request documents" chosen and the second with "Go over tax return", and the Contacts tab's form starts with no purpose chosen

#### Scenario: Someone else cannot log on the task
- **WHEN** Alex sends a contact linked to Sam's open task directly to the database
- **THEN** the database refuses it as forbidden

#### Scenario: A resolved task takes no more contacts
- **WHEN** a contact is sent linked to a resolved task
- **THEN** the database refuses it as an invalid transition

#### Scenario: Resolving is unchanged
- **WHEN** Sam resolves the task with "Reached" and a note
- **THEN** the task is resolved exactly as before, and no log entry is created by resolving
