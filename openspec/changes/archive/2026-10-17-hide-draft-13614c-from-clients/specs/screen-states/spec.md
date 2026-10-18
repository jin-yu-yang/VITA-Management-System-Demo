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

#### Scenario: A failure nothing else recorded
- **WHEN** a press fails with an error the window did not record
- **THEN** the problem banner says "Something went wrong." with Dismiss

#### Scenario: A sign-in failure
- **WHEN** sending a sign-in code fails
- **THEN** the sign-in form states the failure, and neither a toast nor the problem banner repeats it

#### Scenario: A newer error replaces a failed save
- **WHEN** a client's save has failed and then a draft can't be built
- **THEN** the problem banner shows the draft error, the save chip says the answers are unsaved, and the next move sends the draft
