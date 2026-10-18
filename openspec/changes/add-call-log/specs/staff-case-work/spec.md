## ADDED Requirements

### Requirement: Staff can log a contact on any case they can open
Every staff persona SHALL be able to log a contact on any case a presenter can open (every case except a client's private draft), at any stage, whatever the persona's capabilities. An entry SHALL record:
- **When**: the time it was logged, set by the database, never typed and never changed afterwards;
- **Logged by**: the chosen persona, never typed;
- **With**: client, spouse, or other; "other" SHALL require a name of 1 to 80 characters, and client or spouse SHALL carry no name;
- **Method**: phone, text, email, in person or video; required;
- **Purpose**: go over tax return, ask a question, request documents, schedule an appointment, or other; required;
- **Outcome**: reached, no answer, left voicemail, or wrong or invalid number; required;
- **Note**: optional free text of at most 1000 characters; a blank note SHALL be stored as no note.

The stored values of purpose and outcome SHALL be the keys `go_over_return`, `ask_question`, `request_documents`, `schedule_appointment`, `other` and `reached`, `no_answer`, `left_voicemail`, `wrong_number`. The database SHALL refuse an entry that breaks any of these rules. Logging a contact SHALL NOT change the case's stage, revision or history, and SHALL send the client nothing.

#### Scenario: Each staff persona logs a call
- **WHEN** Alex, Morgan and Sam each log a phone call on a case in a different stage
- **THEN** each entry shows the time it was logged and the persona's name, and none of them typed either

#### Scenario: Other needs a name
- **WHEN** a persona logs a contact with "Other" and no name
- **THEN** the form says a name is needed, and the database refuses the same entry sent directly

#### Scenario: Method, purpose and outcome are required
- **WHEN** a persona leaves method, purpose or outcome empty
- **THEN** the entry is not logged, and the database refuses the same entry sent directly

#### Scenario: Logging leaves the case alone
- **WHEN** Sam logs a call on a case that Alex has open in another window
- **THEN** the case's revision is unchanged, Alex's open forms raise no conflict, and Alex's Calls tab shows the new entry without a reload

#### Scenario: A private draft cannot be logged on
- **WHEN** a persona logs a call on a case that is a client's private draft
- **THEN** the database refuses it as not found

### Requirement: Only the logger or an admin can edit a call, and every version is kept
The persona that logged an entry, and any persona with the `admin` capability, SHALL be able to edit the entry's with, name, method, purpose, outcome and note. Any other persona SHALL be refused by the database. Each edit SHALL keep every earlier version unchanged, with who made it and when. An edited entry SHALL show "edited" and the time of its latest edit, and its earlier versions SHALL be openable from the entry, read-only. An edit sent against a version that is no longer current SHALL be refused as a conflict, and the newest version SHALL be shown. Editing SHALL NOT change the entry's logged time or logger.

#### Scenario: The logger edits their entry
- **WHEN** Alex logged a call as "No answer" and edits it to "Left voicemail"
- **THEN** the entry reads "Left voicemail" and shows "edited" with the edit time, and its earlier versions list the "No answer" version

#### Scenario: An admin corrects someone else's entry
- **WHEN** Sam edits an entry that Morgan logged
- **THEN** the edit is saved, and the entry still says Morgan logged it

#### Scenario: Another persona cannot edit
- **WHEN** Alex tries to edit an entry that Morgan logged
- **THEN** no Edit button is offered to Alex, and the database refuses the edit sent directly

#### Scenario: Two edits at once
- **WHEN** Morgan and Sam both open the same entry for editing and Morgan saves first
- **THEN** Sam's save is refused as a conflict and Sam sees Morgan's version

### Requirement: No one can delete a call
The call log SHALL offer no way to delete an entry or any of its versions, on screen or in the database. A wrong entry SHALL be corrected by editing it.

#### Scenario: No delete anywhere
- **WHEN** any staff persona or a client tries to delete an entry or a version through the database
- **THEN** the database refuses it, and the entry and its versions are unchanged

### Requirement: Clients can never see the call log
Only staff SHALL be able to read call log entries and their versions. A client session SHALL read no entry and no version, not even on its own case, and SHALL receive no Realtime change about them. Logging or editing a call SHALL show no phone number; the masked-phone rules stay as they are.

#### Scenario: A client reads nothing
- **WHEN** a client session reads the call log tables for its own case, which has logged calls
- **THEN** it receives no rows

#### Scenario: A client cannot write
- **WHEN** a client session calls the log or edit function
- **THEN** the database refuses it as forbidden

### Requirement: The staff case page has a Calls tab
The staff case page SHALL have a "Calls" tab between Follow-up and History, showing the number of entries on the tab when there are any. The tab SHALL hold a "Calls" section with, in order: Copy all in the section header when there is at least one entry; an "Add a call" form; and the entries, newest first. Each entry SHALL show its summary line, a Copy button, Edit when the persona may edit it, "edited <time>" when it was edited, and "Earlier versions (<n>)" when it has any. A case with no entries SHALL say "No calls logged yet." and offer no Copy all.

#### Scenario: The tab and its count
- **WHEN** a staff persona opens a case with three logged calls
- **THEN** the tabs read Overview, Intake answers, Documents, Follow-up, Calls, History, and the Calls tab shows 3

#### Scenario: Newest first
- **WHEN** a case has calls logged at 10:00 and at 15:45 the same day
- **THEN** the 15:45 entry is listed first

#### Scenario: An empty log
- **WHEN** a staff persona opens the Calls tab of a case with no calls
- **THEN** it says "No calls logged yet." and has the Add a call form and no Copy all

### Requirement: Each call has a one-line summary to copy
Each entry SHALL have one English summary line, built from its latest version:

`<M/D/YYYY h:mm AM/PM> — <logger> → <who>, <method> — <purpose> — <outcome>.` followed by ` Note: <note>` only when there is a note.

- The time SHALL be the logged time in the viewer's time zone.
- The logger SHALL be the persona's first name and the initial of its last name with a period ("Hailey Z.") when the name has two or more words, and the name as it is otherwise ("Alex").
- `<who>` SHALL be "client (<first> <last>)" or "spouse (<first> <last>)" with the names from the intake, just "client" or "spouse" when the intake has no name, or the typed name for other.
- Method, purpose and outcome SHALL read: phone, text, email, in person, video; Go over tax return, Ask a question, Request documents, Schedule an appointment, Other; Reached, No answer, Left voicemail, Wrong or invalid number.

Copy SHALL put the entry's line on the clipboard. Copy all SHALL put every entry's line for the case on it, oldest first, one per line. Both SHALL work without leaving the page and SHALL confirm with the toast. If the browser refuses the clipboard, the toast SHALL say so, and the lines SHALL stay on screen to copy by hand.

#### Scenario: The exact line
- **WHEN** a persona named "Hailey Zhang" logged, on 10/17/2026 at 3:45 PM in the viewer's time zone, a phone call with the client Mei Wang to go over the tax return, outcome reached, note "asked about the 1099-R; she'll bring it Monday."
- **THEN** Copy puts `10/17/2026 3:45 PM — Hailey Z. → client (Mei Wang), phone — Go over tax return — Reached. Note: asked about the 1099-R; she'll bring it Monday.` on the clipboard

#### Scenario: A one-word persona and no note
- **WHEN** Alex logged a text to the spouse, whose intake name is Lin Wang, to request documents, with no answer and no note
- **THEN** the line ends `— Alex → spouse (Lin Wang), text — Request documents — No answer.` with no "Note:"

#### Scenario: Another person
- **WHEN** Morgan logged a video call with "Other" named "Jordan Lee" to schedule an appointment, outcome left voicemail
- **THEN** the line reads `… — Morgan → Jordan Lee, video — Schedule an appointment — Left voicemail.`

#### Scenario: The latest version is used
- **WHEN** an entry was edited from "No answer" to "Reached"
- **THEN** its line and Copy say "Reached"

#### Scenario: Copy all
- **WHEN** a case has three entries and a persona presses Copy all
- **THEN** the clipboard holds the three lines, oldest first, separated by line breaks, and the toast confirms the copy
