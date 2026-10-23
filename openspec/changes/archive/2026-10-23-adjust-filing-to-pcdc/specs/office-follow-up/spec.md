## MODIFIED Requirements

### Requirement: A follow-up has a purpose, and only a document follow-up names a request
Every office follow-up SHALL have a purpose:
- `request_documents`, opened by `ESCALATE_CONTACT` for an unanswered document request;
- `go_over_return`;
- `withdrawal_notice`, opened in two situations (capability `case-lifecycle`):
  - when a client withdraws a case that a preparer or reviewer was working on, so the office tells that volunteer to stop work;
  - when an admin closes a case before filing (with reason `withdrawn` at Ready to exit or Ready to e-file, or with any reason from a Hold that came from Ready to exit), so the office makes sure the return is not transmitted in TaxSlayer.

The season-end close of unsigned cases (capability `case-lifecycle`) SHALL open no `withdrawal_notice`. There, the admin's confirmation states once that none of the returns will be transmitted.

`request_documents` and `go_over_return` use the contact log's own words. `withdrawal_notice` is the office's own: it isn't a contact with the client.

A `request_documents` follow-up SHALL name its document request. A `go_over_return` or `withdrawal_notice` follow-up SHALL name none. The database SHALL reject any row that breaks this. Follow-ups that existed before purposes did SHALL have purpose `request_documents`.

A `withdrawal_notice` follow-up SHALL carry its own text, so Follow-ups shows the right instruction for each kind. It SHALL be created on a case that is already Closed. Unlike the case's other open follow-ups, Close SHALL not cancel it. It SHALL be resolved with `RESOLVE_FOLLOWUP`, with either outcome, while the case stays Closed.

#### Scenario: Existing follow-ups keep their request
- **WHEN** the migration runs on a workspace with an open document follow-up
- **THEN** that follow-up has purpose `request_documents` and still names its request

#### Scenario: Escalating a document still names the request
- **WHEN** a preparer escalates an unanswered document request
- **THEN** the new follow-up has purpose `request_documents` and names that request

#### Scenario: A withdrawal notice
- **WHEN** a client withdraws a case at Filing in progress
- **THEN** one open follow-up with purpose `withdrawal_notice` and no document request exists on the Closed case
- **AND WHEN** the office resolves it with outcome reached
- **THEN** it is resolved, and the case stays Closed

#### Scenario: The season-end close opens no notice
- **WHEN** an admin closes a Hold that came from Ready to exit, and a case at Ready to exit, with the season-end close
- **THEN** both cases are Closed, and neither has a `withdrawal_notice` follow-up
