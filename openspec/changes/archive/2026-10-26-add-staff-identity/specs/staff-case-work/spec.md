## ADDED Requirements

### Requirement: For a staff account, the persona is its own person
Wherever a staff requirement refers to "the chosen persona", "a staff persona" or "the persona", it SHALL mean, for a `staff` account, the person linked to that account, for every staff screen and rule, including phone masking, the contact log and the follow-up queue. A presenter's chosen persona SHALL keep meaning the persona chosen in its window.

#### Scenario: A staff member who prepares a case sees its phone
- **WHEN** a staff member has claimed preparation of a case and opens it
- **THEN** the client's phone is revealable, as it is for a presenter acting as that case's preparer

#### Scenario: A staff member's contact log entry
- **WHEN** a staff member named "Riley Park" logs a contact
- **THEN** the entry's "Logged by" is Riley Park, and only Riley Park or someone with `admin` can edit it

### Requirement: Staff actions are attributed to the signed-in staff member
Every record of who did something on a case SHALL name the signed-in staff member's person when a `staff` account acts. That covers the action receipt, the case's internal history (`case_events`), the person who created a case in assisted mode, the preparation participants, the preparer and reviewer on the case, reviews, follow-up records, assistance items and contact log entries. The browser SHALL NOT be able to make a staff action be recorded under any other person.

#### Scenario: Two staff members share a case
- **WHEN** staff member Riley (`prepare`) claims and submits a case for review, and staff member Jordan (`review`) claims and approves the review, each in their own window
- **THEN** the case's history names Riley for the preparation steps and Jordan for the review steps, and each step's receipt names the same person

#### Scenario: A tampered request
- **WHEN** Riley's browser sends Jordan's person id with an action
- **THEN** the action is refused with `FORBIDDEN`, and nothing is recorded under either name

### Requirement: A staff member never reviews a case they prepared
The independence rule SHALL hold between staff accounts: a staff member whose person is a preparation participant of a case SHALL NOT be able to claim its review, request corrections on it or approve it, whichever window or browser they use.

#### Scenario: A preparer who can also review
- **WHEN** a staff member with both `prepare` and `review` prepares a case and submits it for review, then tries to claim its review
- **THEN** the claim is refused, and the case stays waiting for review

#### Scenario: Another reviewer can claim it
- **WHEN** a different staff member with `review` claims the same case's review
- **THEN** the claim succeeds

### Requirement: Staff see the same cases and rows as presenters
A `staff` member SHALL be able to read exactly the rows a presenter in the same workspace can read, in every table the staff screens use: every case except a client's private draft, with its documents, requests, history, participation, follow-ups, assistance items, reviews, preparer and reviewer questionnaires, filing attempts, returns and notes, materials, document cards, contacts and contact log. A staff member SHALL receive the same Realtime changes a presenter receives. A staff member SHALL read nothing in another workspace.

#### Scenario: Same rows as a presenter
- **WHEN** a presenter and a staff member in the same workspace each read every staff table
- **THEN** both read the same rows

#### Scenario: A private draft stays private
- **WHEN** a client has an unsubmitted application
- **THEN** a staff member reads no row of it, as a presenter reads none

#### Scenario: Live updates
- **WHEN** a staff member has the work board open and another window claims a case
- **THEN** the staff member's board shows the claim without a reload

### Requirement: A staff account's screens have no persona picker or demo tools
A `staff` account SHALL get the same staff screens as a presenter: the work board, the case pages, the office screens its capabilities allow. Its screens SHALL NOT show the persona picker, "Reset the sample cases" or "Load a sample checkpoint". They SHALL show "Signed in as <name>" with the staff member's person name where the presenter's "Acting as" appears. A staff window SHALL never save or restore a chosen persona, and SHALL ignore one left in its browser storage. Staff screens SHALL stay in English whatever language the browser chose.

#### Scenario: A staff member signs in
- **WHEN** Riley Park signs in with a staff account
- **THEN** the work board opens with "Signed in as Riley Park", with no "Acting as" buttons and no reset or checkpoint controls

#### Scenario: A leftover persona in browser storage
- **WHEN** a browser that last ran a presenter window acting as Sam signs in as staff member Riley
- **THEN** Riley's window acts as Riley, never as Sam

#### Scenario: A presenter's screens are unchanged
- **WHEN** a presenter signs in
- **THEN** the persona picker, reset and checkpoint controls appear as before this change
