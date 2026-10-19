## ADDED Requirements

### Requirement: Staff can log a contact on any case they can open
Every staff persona SHALL be able to log a contact on any case a presenter can open (every case except a client's private draft), at any stage, whatever the persona's capabilities. An entry SHALL record:
- **Direction**: we contacted the client (outgoing) or the client contacted us (incoming); "we contacted" by default;
- **Contact time**: when the contact happened, now by default, settable when logging, and no later than five minutes from now;
- **Logged by** and **logged at**: the chosen persona and the time of logging, filled in, never typed and never changed afterwards;
- **With**: client, spouse, or other; "other" SHALL require a name of 1 to 80 characters, and client or spouse SHALL carry no name;
- **Method**: phone, text, email, in person or video; phone by default;
- **Purpose**: go over tax return, ask a question, request documents, schedule an appointment, or other; required;
- **Outcome**, which follows the method: for phone and video, reached, no answer, left voicemail, or wrong or invalid number; for text and email, sent, client replied, or failed to deliver; for in person, and for every incoming contact, always reached, with no choice offered;
- **Note**: optional free text of at most 1000 characters; a blank note SHALL be stored as no note.

Direction, method, purpose and outcome SHALL be one-click button groups. The stored values SHALL be the keys `outgoing`, `incoming`; `phone`, `text`, `email`, `in_person`, `video`; `go_over_return`, `ask_question`, `request_documents`, `schedule_appointment`, `other`; `reached`, `no_answer`, `left_voicemail`, `wrong_number`, `sent`, `replied`, `failed`. The database SHALL refuse an entry that breaks any of these rules. Logging a contact SHALL NOT change the case's stage, revision or history, and SHALL send the client nothing.

#### Scenario: Each staff persona logs a contact
- **WHEN** Alex, Morgan and Sam each log a phone call on a case in a different stage
- **THEN** each entry shows its contact time and the persona's name, and none of them typed the name or the logged-at time

#### Scenario: The defaults
- **WHEN** a persona opens the Log contact form
- **THEN** "We contacted" and "Phone" are already chosen, the contact time is now in New York time, and purpose and outcome are not chosen

#### Scenario: Outcomes follow the method
- **WHEN** a persona chooses "Text"
- **THEN** the outcome choices are Sent, Client replied and Failed to deliver
- **AND WHEN** the persona chooses "In person"
- **THEN** no outcome is offered, and the entry is stored as reached

#### Scenario: An incoming contact is reached
- **WHEN** a persona logs that the client phoned in
- **THEN** no outcome is offered, the entry is stored as reached, and the database refuses an incoming entry with any other outcome

#### Scenario: A contact time in the past
- **WHEN** a persona logs a call that happened yesterday at 2:10 PM, setting the contact time
- **THEN** the entry's contact time is yesterday 2:10 PM in New York time, and its logged-at time is now

#### Scenario: Required choices
- **WHEN** a persona leaves purpose or a shown outcome unchosen, or picks "Other" with no name
- **THEN** the entry is not logged, and the database refuses the same entry sent directly

#### Scenario: Logging leaves the case alone
- **WHEN** Sam logs a contact on a case that Alex has open in another window
- **THEN** the case's revision is unchanged and Alex's open forms raise no conflict

#### Scenario: A private draft cannot be logged on
- **WHEN** a persona logs a contact on a case that is a client's private draft
- **THEN** the database refuses it as not found

### Requirement: Only the logger or an admin can edit a contact, and every version is kept
The persona that logged an entry, and any persona with the `admin` capability, SHALL be able to edit the entry's direction, contact time, with, name, method, purpose, outcome and note, under the same rules as logging. Any other persona SHALL be refused by the database. Each edit SHALL keep every earlier version unchanged, with who saved it and when. An edited entry SHALL show "edited" and the time of its latest edit, and its earlier versions SHALL be openable from the entry, read-only. An edit sent against a version that is no longer current SHALL be refused as a conflict, and the newest version SHALL be shown. Editing SHALL NOT change the entry's logger, logged-at time or follow-up task.

#### Scenario: A sent text is answered
- **WHEN** Alex logged a text as "Sent" at 10:00 and, after the client answers, edits it to "Client replied" at 11:30
- **THEN** the entry reads "Client replied" and shows "edited" with 11:30, and its earlier versions list the "Sent" version saved at 10:00

#### Scenario: The contact time is corrected
- **WHEN** Alex edits an entry's contact time from 3:45 PM to 2:45 PM
- **THEN** the summary line uses 2:45 PM, and the earlier version keeps 3:45 PM

#### Scenario: An admin corrects someone else's entry
- **WHEN** Sam edits an entry that Morgan logged
- **THEN** the edit is saved, and the entry still says Morgan logged it

#### Scenario: Another persona cannot edit
- **WHEN** Alex tries to edit an entry that Morgan logged
- **THEN** no Edit button is offered to Alex, and the database refuses the edit sent directly

#### Scenario: Two edits at once
- **WHEN** Morgan and Sam both open the same entry for editing and Morgan saves first
- **THEN** Sam's save is refused as a conflict and Sam sees Morgan's version

### Requirement: No one can delete a contact
The contact log SHALL offer no way to delete an entry or any of its versions, on screen or in the database. A wrong entry SHALL be corrected by editing it.

#### Scenario: No delete anywhere
- **WHEN** any staff persona or a client tries to delete or overwrite an entry or a version through the database
- **THEN** the database refuses it, and the entry and its versions are unchanged

### Requirement: Clients can never see the contact log
Only staff SHALL be able to read log entries and their versions. A client session SHALL read no entry and no version, not even on its own case, and SHALL receive no Realtime change about them. Logging or editing a contact SHALL show no phone number; the masked-phone rules stay as they are.

#### Scenario: A client reads nothing
- **WHEN** a client session reads the log tables for its own case, which has logged contacts
- **THEN** it receives no rows

#### Scenario: A client cannot write
- **WHEN** a client session calls the log or edit function
- **THEN** the database refuses it as forbidden

### Requirement: Other staff windows see new and edited contacts live
Another staff window open on the same case SHALL show a new or edited entry, in the Contacts tab and in the linked task's list, without a reload and without any change to the case itself.

#### Scenario: A second window
- **WHEN** Alex has a case open in one window and Sam logs a contact on it in another
- **THEN** Alex's Contacts tab shows the entry without a reload
- **AND WHEN** Sam edits it
- **THEN** Alex's window shows the edited entry

### Requirement: The staff case page has a Contacts tab
The staff case page, for volunteers and for the office, SHALL have a "Contacts" tab between Follow-up and History, showing the number of entries on the tab when there are any. The tab SHALL hold a "Contacts" section with, in order: Copy all in the section header when there is at least one entry; the Log contact form; and the entries, newest contact time first. Each entry SHALL show its summary line, a Copy button, Edit when the persona may edit it, "edited <time>" when it was edited, the follow-up task it belongs to when it is linked, and "Earlier versions (<n>)" when it has any. A case with no entries SHALL say "No contacts logged yet." and offer no Copy all.

#### Scenario: The tab and its count
- **WHEN** a staff persona opens a case with three logged contacts
- **THEN** the tabs read Overview, Intake answers, Documents, Follow-up, Contacts, History, and the Contacts tab shows 3

#### Scenario: Newest first
- **WHEN** a case has contacts at 10:00 and at 15:45 the same day
- **THEN** the 15:45 entry is listed first

#### Scenario: An empty log
- **WHEN** a staff persona opens the Contacts tab of a case with no contacts
- **THEN** it says "No contacts logged yet." and has the Log contact form and no Copy all

### Requirement: Each contact has a one-line summary to copy
Each entry SHALL have one English summary line, built from its latest version, with its contact time in America/New_York time:
- outgoing: `<M/D/YYYY h:mm AM/PM> — <logger> → <who>, <method> — <purpose> — <outcome>.`
- incoming: `<M/D/YYYY h:mm AM/PM> — <who> → <logger>, <method> — <purpose>.`
- in person: the outcome segment is left out, as for incoming;
- followed by ` Note: <note>` only when there is a note.

The logger SHALL be the persona's first name and the initial of its last name with a period ("Hailey Z.") when the name has two or more words, and the name as it is otherwise ("Alex"). `<who>` SHALL be "client (<first> <last>)" or "spouse (<first> <last>)" with the names from the intake, just "client" or "spouse" when the intake has no name, or the typed name for other. Method, purpose and outcome SHALL read: phone, text, email, in person, video; Go over tax return, Ask a question, Request documents, Schedule an appointment, Other; Reached, No answer, Left voicemail, Wrong or invalid number, Sent, Client replied, Failed to deliver. Every time shown in the log SHALL be America/New_York time, whatever the viewer's time zone.

Copy SHALL put the entry's line on the clipboard. Copy all SHALL put every entry's line for the case on it, oldest contact time first, one per line. Both SHALL work without leaving the page and SHALL confirm with the toast. If the browser refuses the clipboard, the toast SHALL say so, and the lines SHALL stay on screen to copy by hand.

#### Scenario: The exact line
- **WHEN** a persona named "Hailey Zhang" logged an outgoing phone call with the client Mei Wang at 3:45 PM New York time on 10/17/2026, to go over the tax return, outcome reached, note "asked about the 1099-R; she'll bring it Monday."
- **THEN** Copy puts `10/17/2026 3:45 PM — Hailey Z. → client (Mei Wang), phone — Go over tax return — Reached. Note: asked about the 1099-R; she'll bring it Monday.` on the clipboard

#### Scenario: An incoming contact
- **WHEN** the client Mei Wang phoned Hailey Zhang at the same time to ask a question
- **THEN** the line reads `10/17/2026 3:45 PM — client (Mei Wang) → Hailey Z., phone — Ask a question.`

#### Scenario: A one-word persona, a text and no note
- **WHEN** Alex texted the spouse, whose intake name is Lin Wang, to request documents, and the text was sent, with no note
- **THEN** the line ends `— Alex → spouse (Lin Wang), text — Request documents — Sent.` with no "Note:"

#### Scenario: New York time for every viewer
- **WHEN** a browser set to Pacific time shows an entry whose contact time is 3:45 PM New York time
- **THEN** the line says 3:45 PM

#### Scenario: Copy all
- **WHEN** a case has three entries and a persona presses Copy all
- **THEN** the clipboard holds the three lines, oldest contact time first, separated by line breaks, and the toast confirms the copy

### Requirement: Office follow-up contacts are logged in the contact log
The case page's Follow-up tab and the office queue's drawer SHALL use the same Log contact form as the Contacts tab, inside each open task the persona may record on, and SHALL call it "Log contact"; the drawer and the queue button that opens it SHALL be named "Log contact". A contact logged there SHALL be a log entry linked to that task. Only the task's assignee, holding `followup`, SHALL be able to log a contact linked to an open task; the database SHALL refuse a link to a task that is not open, or by anyone else. Each task SHALL list, under "Contacts so far", the summary lines of the entries linked to it, oldest first, or "No contact has been logged on this task yet.". "Resolve this task" SHALL stay as it is, separate from logging.

#### Scenario: Sam logs from the drawer
- **WHEN** Sam, assigned to an open follow-up task, logs a phone call with no answer from the office queue's Log contact drawer
- **THEN** the entry appears under that task's "Contacts so far" and in the case's Contacts tab, marked with the task, and the task stays open

#### Scenario: Someone else cannot log on the task
- **WHEN** Alex sends a contact linked to Sam's open task directly to the database
- **THEN** the database refuses it as forbidden

#### Scenario: A resolved task takes no more contacts
- **WHEN** a contact is sent linked to a resolved task
- **THEN** the database refuses it as an invalid transition

#### Scenario: Resolving is unchanged
- **WHEN** Sam resolves the task with "Reached" and a note
- **THEN** the task is resolved exactly as before, and no log entry is created by resolving

### Requirement: Earlier follow-up attempts are moved into the contact log once
The migration SHALL move every recorded follow-up attempt into the contact log once, as an entry with one version, linked to its task: outgoing, phone, with the client, purpose request documents, with its contact time and logged-at time equal to the attempt's time and its logger equal to the attempt's persona. The old outcomes SHALL map as: no answer → no answer; reached → reached; no further contact → reached, with "Client asked for no further contact." before the note; closure requested → reached, with "Client asked to close the case." before the note. After the move no attempt SHALL remain in the old list.

#### Scenario: A closing outcome keeps its meaning
- **WHEN** a task had an attempt recorded as "closure requested" with the note "Will file elsewhere."
- **THEN** after the migration the task lists an entry with outcome Reached and the note "Client asked to close the case. Will file elsewhere."

#### Scenario: Times and people are kept
- **WHEN** an attempt was recorded by Sam on 3/2/2026 at 9:15 AM New York time
- **THEN** its entry's contact time and logged-at time are that moment and its logger is Sam

### Requirement: The old attempt action refuses new requests
The database SHALL refuse every new `RECORD_CONTACT` request as a validation error, and no screen SHALL send one. A replay of a `RECORD_CONTACT` request that was accepted before the change SHALL still return its stored receipt. History events that earlier attempts recorded SHALL keep their wording.

#### Scenario: A stale tab records an attempt
- **WHEN** a window still running the old code sends `RECORD_CONTACT`
- **THEN** the database refuses it as a validation error and records nothing
