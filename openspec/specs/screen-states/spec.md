# screen-states Specification

## Purpose
How every screen tells a person what is happening: where an error is shown (inside the open dialog, in place on the case page, in the client's save chip, or in the problem banner; one at a time, never as a toast) and what Try again does; the toast's kinds, timing, Dismiss and position; lists that are loading or couldn't load; the pressed button while its press runs; and the connection notice, including "You're back online.".

## Requirements

### Requirement: Errors are shown where the person is looking, never as a toast
Every failure SHALL be recorded and shown once, with `role="alert"`, in the first of these places that applies:
- inside the dialog that is open, when one is;
- in place, beside the action, on the staff case page;
- in the client's save chip, for a save that failed;
- otherwise, in the problem banner, which SHALL step aside while a dialog is open.

The error SHALL offer Try again when it can be retried, and Dismiss. It SHALL stay until it is dismissed, retried, or replaced. One error SHALL show at a time: a newer error replaces an older one. When it replaces a failed save, the save chip SHALL say the answers are unsaved, and the draft SHALL be kept and sent with the next move or save. An error SHALL NOT appear as a toast.

This SHALL hold for:
- **a refusal** the window makes itself, for example "Open an application first.", "This step is not available.", "This request is no longer on screen.", "This checkpoint is not available.", or an action only the person running the session may take. These offer Dismiss only.
- **a draft 13614-C or Form 14446 that couldn't be built.** The error says "The draft could not be made. Try again." (or, for the font check, "The draft font could not be checked. Try again later."), and Try again builds the same draft again, in the same form and language. A draft that is then built clears that error.
- **any other failed press** that nothing else recorded: a general error, the press's own message when it is a known sentence, otherwise "Something went wrong.". This SHALL NOT apply on the sign-in screens, whose form states its own failures.

On a client screen the error SHALL be in the screen's language.

#### Scenario: A failed claim is announced once
- **WHEN** a volunteer presses Claim and the server refuses it
- **THEN** the case page shows the error in place with Try again and Dismiss, and no toast appears

#### Scenario: A refusal inside a dialog
- **WHEN** the presenter's checkpoint dialog asks for a checkpoint that is no longer available
- **THEN** the dialog says "This checkpoint is not available." with Dismiss and no Try again, the problem banner shows nothing behind it, and no toast appears

#### Scenario: A draft that couldn't be built
- **WHEN** a client presses View Draft Form 13614-C and the draft can't be built
- **THEN** the problem banner says, in the screen's language, that the draft could not be made, with Try again and Dismiss
- **AND** pressing Try again builds the same draft again, and the error goes once it is built

#### Scenario: A failure nothing else recorded
- **WHEN** a press fails with an error the window did not record
- **THEN** the problem banner says "Something went wrong." with Dismiss

#### Scenario: A sign-in failure
- **WHEN** sending a sign-in code fails
- **THEN** the sign-in form states the failure, and neither a toast nor the problem banner repeats it

#### Scenario: A newer error replaces a failed save
- **WHEN** a client's save has failed and then a draft can't be built
- **THEN** the problem banner shows the draft error, the save chip says the answers are unsaved, and the next move sends the draft

### Requirement: A toast confirms, informs or warns, and can be dismissed
A toast SHALL be one of three kinds, each with its own icon and coloured edge:
- **success**: something the person did happened (saved, sent, started, copied, rebuilt, moved);
- **information**: nothing failed, but the person should know something (for example "Fictional details filled in. Nothing is saved yet.");
- **warning**: something the person can fix or should note, including the nudges ("Confirm that you have checked your answers first.", "Some answers still need a change before you can send.", "Say what you helped with before resolving this request.", "Confirm that you have checked these answers with the client first.") and "Traditional Chinese couldn't load…".

**Behaviour:**
- One toast SHALL show at a time; a new one replaces the current one.
- Every toast SHALL have a Dismiss button, at least 44 × 44 px, labelled for screen readers and carrying no visible text. It SHALL hide the toast at once, and so SHALL Escape while focus is inside the toast.
- A success or information toast SHALL leave after 5 seconds, a warning after 8 seconds.
- The timer SHALL stop while the pointer is over the toast or focus is inside it, and start again from the full time when both have left.
- The toast's text SHALL be announced politely (`role="status"`). The Dismiss SHALL sit outside that live region.
- A hidden toast SHALL leave the Tab order. If focus was inside it when it hides, focus SHALL return to where it came from.
- A redraw of the page SHALL neither remove the toast nor announce it again.

**Position:**
- On client screens the toast SHALL sit at the bottom centre; on staff screens at the bottom right, 24px from the edges.
- On Add a case, while the sticky bar with Save and Send is on screen, the toast SHALL sit above that bar.

#### Scenario: A save confirms itself
- **WHEN** a client's answers are saved
- **THEN** a success toast says "Your answers are saved." and leaves after 5 seconds

#### Scenario: A nudge is a warning
- **WHEN** a client presses Submit before confirming they checked their answers
- **THEN** a warning toast says "Confirm that you have checked your answers first." and leaves after 8 seconds

#### Scenario: Reading a toast keeps it
- **WHEN** the pointer rests on a toast, or focus is on its Dismiss
- **THEN** the toast stays, and it leaves 5 seconds (8 for a warning) after the pointer and focus have left

#### Scenario: Dismissing a toast
- **WHEN** the person presses the toast's Dismiss, or Escape while on it
- **THEN** the toast hides at once, its Dismiss leaves the Tab order, and focus returns to where it was before

#### Scenario: A newer toast replaces the current one
- **WHEN** a second toast appears while one is showing
- **THEN** only the second shows, and it leaves after its own time

#### Scenario: A toast on Add a case
- **WHEN** a toast appears on Add a case while its sticky bar is on screen
- **THEN** the toast sits above the bar and covers neither Save nor Send

#### Scenario: A redraw keeps the toast
- **WHEN** the page is redrawn while a toast shows
- **THEN** the toast is still there, with the same text, and is not announced again

### Requirement: A list says when it is loading or couldn't load
The case list, behind the work board, the case pool, Follow-ups and the client's applications, SHALL show one of four things:
- **before its first load:** a loading line, a spinner and a sentence ("Loading cases…", or for a client "Loading your applications…"), announced as a status;
- **when its first load failed:** a line saying it couldn't load ("The cases couldn't load.", or for a client "Your applications couldn't load."), with the problem banner's Try again reloading everything the first load reads;
- **when loaded and empty:** its empty state;
- **otherwise:** its content.

While a staff list isn't loaded, its panel SHALL show its heading and that line only, without tabs, filters or counts. Follow-ups SHALL treat its list of help requests the same way. A list that has loaded once SHALL keep what it shows when a later reload fails, with the problem banner above it. Signing out SHALL return each list to its loading state. Add a case's wait for the workspace SHALL use the same loading line.

#### Scenario: A failed first load isn't an empty board
- **WHEN** a volunteer signs in and the first load of the cases fails
- **THEN** the work board says "The cases couldn't load." and not "Nothing to claim right now.", without tabs or counts, and the problem banner offers Try again

#### Scenario: Try again loads the list
- **WHEN** the volunteer then presses Try again and the load succeeds
- **THEN** the work board shows its cases, or its empty state if there are none, and the people and the workspace are loaded too

#### Scenario: A client's applications
- **WHEN** a client signs in and the first load of their applications fails
- **THEN** the page says "Your applications couldn't load." in the screen's language, not "No applications yet"

#### Scenario: A later reload fails
- **WHEN** the cases have loaded once and a later reload fails
- **THEN** the board keeps showing the cases it had, with the problem banner above it

### Requirement: The pressed button shows it is working
While a press is running, every action SHALL stay disabled as today. The button that was pressed SHALL also show a spinner beside its label and carry `aria-busy="true"`. This SHALL hold for:
- the staff case actions and the client's Submit;
- the office's help-request actions;
- the presenter's reset and checkpoint;
- Add a case's Save and Send.

When the press ends, the spinner and `aria-busy` SHALL go. A client's move between sub-steps, and any other press, SHALL show no button spinner (the save chip says Saving). If the pressed button is no longer on screen after a redraw, no spinner SHALL be shown.

#### Scenario: Claiming a case
- **WHEN** a volunteer presses Claim on a case
- **THEN** that Claim button shows a spinner and `aria-busy="true"` while the claim runs, the other actions are disabled, and the spinner goes when the claim ends

#### Scenario: Sending from Add a case
- **WHEN** the office presses Send on Add a case
- **THEN** Send shows a spinner and `aria-busy="true"` until the send ends

#### Scenario: Moving between sub-steps
- **WHEN** a client presses Continue and the move saves their answers
- **THEN** Continue shows no spinner, and the save chip says Saving

### Requirement: The connection notice says when the app is offline or reconnecting
While the connection is offline or reconnecting, the frame SHALL show the connection notice in the attention colours, as a status. "Reconnecting…" SHALL show a spinning icon; offline SHALL show a still one. When the connection returns after being offline or reconnecting, an information toast SHALL say "You're back online." It SHALL say nothing on the first connection. Every spinner (connection, loading, busy) SHALL stay still when the person's system asks for reduced motion.

#### Scenario: The connection drops and returns
- **WHEN** the connection is lost and then returns
- **THEN** the connection notice shows while it is lost, and an information toast says "You're back online." when it returns

#### Scenario: The first connection
- **WHEN** a window connects for the first time after sign-in
- **THEN** no "You're back online." toast appears

#### Scenario: Reduced motion
- **WHEN** the person's system asks for reduced motion
- **THEN** the reconnecting, loading and busy spinners don't move
