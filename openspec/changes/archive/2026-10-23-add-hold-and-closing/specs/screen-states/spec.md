## MODIFIED Requirements

### Requirement: Every confirmation has the same shape
Every confirmation dialog SHALL be built from one shared body. Its parts SHALL come in this order:
- the dialog's own refusal, when it states one itself (the corrections dialog does);
- a sentence saying what will happen;
- an optional note, with an icon, saying what will not happen. The note SHALL come before the form, or inside the form just before the confirm control;
- an optional form, holding its fields and the confirm control;
- one confirm control, which sends the dialog's action;
- one text button, outside any form, that closes the dialog without sending anything ("Keep it open", "Keep reviewing", "Keep them as they are", and so on).

This SHALL hold for close case, ask the preparer for corrections, reset the sample cases, load a sample checkpoint (and its state with no sample cases), replace the fictional answers, leave Add a case without saving, ask for documents, put on hold, got in touch, and the client's withdraw. Building a dialog from the shared body SHALL NOT change its words, its action, the action's payload, or its controls' ids. The close-case dialog's own fields are set by capability `case-lifecycle` ("A closed case records why it closed").

#### Scenario: Close case keeps its action and payload
- **WHEN** the office confirms Close this case with the reason Duplicate, no note, and the "I understand" box ticked
- **THEN** the action sent is `CLOSE_CASE` with that reason, no note and the confirmation, and the case closes

#### Scenario: A note inside the form
- **WHEN** the presenter opens "Load a sample checkpoint" with sample cases in the workspace
- **THEN** its note sits inside the form, after the two choices and just before "Load this checkpoint", and "Leave this case as it is" sits outside the form

#### Scenario: A refusal comes first
- **WHEN** a send from "Ask the preparer for corrections" is refused
- **THEN** the dialog's own error comes before its sentence, and the form, the confirm control and "Keep reviewing" follow as before

#### Scenario: The keep button sends nothing
- **WHEN** the office presses "Keep it open" in the close-case dialog
- **THEN** the dialog closes, no action is sent, and the keyboard returns to "Close this case…"
