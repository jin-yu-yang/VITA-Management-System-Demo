## MODIFIED Requirements

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
- **a shaded-section editor that couldn't be opened** (capability `shaded-section`). The error says "The editor could not be opened. Try again, or use Download to fill elsewhere.", in place on the staff case page, and Try again opens the editor again.
- **an uploaded copy of the shaded section that couldn't be read or saved** (capability `shaded-section`). The error is in place beside the upload control, names the problem or the field, and offers Dismiss only.
- **any other failed press** that nothing else recorded: a general error, the press's own message when it is a known sentence, otherwise "Something went wrong.". This SHALL NOT apply on the sign-in screens, whose form states its own failures.

On a client screen the error SHALL be in the screen's language.

#### Scenario: A failed claim is announced once
- **WHEN** a volunteer presses Claim and the server refuses it
- **THEN** the case page shows the error in place with Try again and Dismiss, and no toast appears

#### Scenario: A refusal inside a dialog
- **WHEN** the presenter's checkpoint dialog asks for a checkpoint that is no longer available
- **THEN** the dialog says "This checkpoint is not available." with Dismiss and no Try again, the problem banner shows nothing behind it, and no toast appears

#### Scenario: A draft that couldn't be built
- **WHEN** a client presses View Draft Form 14446 and the draft can't be built
- **THEN** the problem banner says, in the screen's language, that the draft could not be made, with Try again and Dismiss
- **AND** pressing Try again builds the same draft again, and the error goes once it is built

#### Scenario: An editor that couldn't be opened
- **WHEN** the case's preparer presses "Fill the shaded section" and the editor can't be opened
- **THEN** the case page says "The editor could not be opened. Try again, or use Download to fill elsewhere." in place, with Try again and Dismiss, and no toast appears

#### Scenario: An upload that couldn't be read
- **WHEN** the case's preparer uploads a PDF with no form fields
- **THEN** the error is shown beside the upload control with Dismiss and no Try again, and no toast appears

#### Scenario: A failure nothing else recorded
- **WHEN** a press fails with an error the window did not record
- **THEN** the problem banner says "Something went wrong." with Dismiss

#### Scenario: A sign-in failure
- **WHEN** sending a sign-in code fails
- **THEN** the sign-in form states the failure, and neither a toast nor the problem banner repeats it

#### Scenario: A newer error replaces a failed save
- **WHEN** a client's save has failed and then a draft can't be built
- **THEN** the problem banner shows the draft error, the save chip says the answers are unsaved, and the next move sends the draft

### Requirement: A dialog takes the keyboard and gives it back
When a dialog opens, the keyboard SHALL move into it: to its first control that isn't the close button, or to the close button when it has no other, or to the dialog itself when it has no control. Escape SHALL close the dialog, except during an IME composition, and except in the shaded-section editor (capability `shaded-section`) while it holds unsaved changes. There, Escape SHALL ask "Discard your changes?" and close the editor only when the person confirms. When a dialog closes, focus SHALL return to the control that opened it. If that control is no longer on the page, focus SHALL go to the screen's fallback: for a drawer, the queue's heading.

#### Scenario: First focus skips the close button
- **WHEN** the client opens the "Replace the fictional answers?" dialog
- **THEN** the keyboard is on "Replace with another example", not on the close button

#### Scenario: Escape closes and returns focus
- **WHEN** a dialog opened from a button is open and Escape is pressed
- **THEN** the dialog closes and the keyboard is back on that button

#### Scenario: Escape in an editor with unsaved changes
- **WHEN** the shaded-section editor holds a change that isn't saved and Escape is pressed
- **THEN** the editor asks "Discard your changes?" and stays open with the change, unless the person confirms
- **AND** once the person confirms, the editor closes and the keyboard is back on "Fill the shaded section"

#### Scenario: The opener is gone
- **WHEN** a Resolve a help request drawer closes after another window resolved its row
- **THEN** the keyboard goes to the queue's heading
