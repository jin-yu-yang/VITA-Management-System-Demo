## ADDED Requirements

### Requirement: A dialog takes the keyboard and gives it back
When a dialog opens, the keyboard SHALL move into it: to its first control that isn't the close button, or to the close button when it has no other, or to the dialog itself when it has no control. Escape SHALL close the dialog, except during an IME composition. When a dialog closes, focus SHALL return to the control that opened it. If that control is no longer on the page, focus SHALL go to the screen's fallback: for a drawer, the queue's heading.

#### Scenario: First focus skips the close button
- **WHEN** the client opens the "Replace the fictional answers?" dialog
- **THEN** the keyboard is on "Replace with another example", not on the close button

#### Scenario: Escape closes and returns focus
- **WHEN** a dialog opened from a button is open and Escape is pressed
- **THEN** the dialog closes and the keyboard is back on that button

#### Scenario: The opener is gone
- **WHEN** a Resolve a help request drawer closes after another window resolved its row
- **THEN** the keyboard goes to the queue's heading

### Requirement: The keyboard stays inside an open dialog
While a dialog is open, Tab and Shift+Tab SHALL move only among the dialog's controls. Tab from the last control SHALL go to the first, and Shift+Tab from the first SHALL go to the last. When the keyboard is on the dialog itself or on anything in it that isn't a control, Tab SHALL go to the first control and Shift+Tab to the last.

#### Scenario: Wrapping at the ends
- **WHEN** the keyboard is on a dialog's last control and Tab is pressed
- **THEN** the keyboard moves to the dialog's first control

#### Scenario: From the dialog itself
- **WHEN** the person clicks a dialog's text, so the dialog itself holds the keyboard, and presses Shift+Tab
- **THEN** the keyboard moves to the dialog's last control and stays inside the dialog

### Requirement: The page behind an open dialog is inert, and its live regions stay announced
While a dialog is open, everything on the page behind it SHALL be inert: it can't be focused, clicked or read in a screen reader's browse mode. The toast, the connection notice, the notice banner and the problem banner SHALL NOT be inert, so a message they announce while a dialog is open, or right after it closes, still reaches screen readers. When the dialog closes, nothing on the page SHALL stay inert, before the keyboard returns to the opener.

#### Scenario: The page behind is inert
- **WHEN** a dialog is open
- **THEN** the header, the page body and the footer are inert, and the dialog is not

#### Scenario: The toast is never inert
- **WHEN** the presenter confirms "Reset the sample cases" and the toast "The sample cases were rebuilt. Nothing else was touched." appears
- **THEN** the toast's live region is not inside anything inert

#### Scenario: A notice while a dialog is open
- **WHEN** a dialog is open and the connection notice says the app is reconnecting
- **THEN** the connection notice is not inert

#### Scenario: Closing clears inert
- **WHEN** a dialog closes
- **THEN** nothing on the page is inert, and the opener holds the keyboard

### Requirement: Every confirmation has the same shape
Every confirmation dialog SHALL be built from one shared body, in this order:
- a sentence saying what will happen;
- an optional note, with an icon, saying what will not happen;
- an optional form;
- one confirm control, which sends the dialog's action;
- one text button that closes the dialog without sending anything ("Keep it open", "Keep reviewing", "Keep them as they are", and so on).

This SHALL hold for close case, ask the preparer for corrections, reset the sample cases, load a sample checkpoint (and its state with no sample cases), replace the fictional answers, and leave Add a case without saving. Building a dialog from the shared body SHALL NOT change its words, its action, the action's payload, or its controls' ids.

#### Scenario: Close case keeps its action and payload
- **WHEN** the office confirms Close this case with a reason and the "I understand" box ticked
- **THEN** the action sent is `CLOSE_CASE` with the same reason and confirmation fields as before, and the case closes as before

#### Scenario: The keep button sends nothing
- **WHEN** the office presses "Keep it open" in the close-case dialog
- **THEN** the dialog closes, no action is sent, and the keyboard returns to "Close this case…"
