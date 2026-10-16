## ADDED Requirements

### Requirement: The work board and the case pool show each client's phone masked
The volunteer work board and the admin case pool SHALL each have a "Phone" column, placed right after the Stage column. Each row SHALL show the case's client phone, never the spouse phone, in the mask form and with the same rule as the staff case page: `(•••) •••-1234`, built from the last four digits only, revealable when the chosen persona may see the case's contact details and locked otherwise. A case with no client phone SHALL show "—" in that cell, for every viewer. In each row, the case's reference link SHALL come before the phone in keyboard tab order. Each table's note SHALL keep saying it shows workflow only, and SHALL add one sentence saying that phone numbers stay masked.

#### Scenario: The board shows the phone column after Stage
- **WHEN** a staff persona opens the work board and a listed case's client phone is `(215) 555-0123`
- **THEN** the table's columns read Client, Stage, Phone, then the rest, and that case's Phone cell shows `(•••) •••-0123`

#### Scenario: The case pool shows the phone column after Stage
- **WHEN** Sam opens the case pool
- **THEN** the table's columns read Client, Stage, Phone, then the rest, and each case with a client phone shows its mask

#### Scenario: A case with no phone shows a dash
- **WHEN** a listed case has no client phone
- **THEN** its Phone cell reads "—", whoever is viewing

#### Scenario: The spouse phone is not listed
- **WHEN** a listed case has a spouse phone
- **THEN** no list cell shows the spouse phone or its last four digits

#### Scenario: The case link comes before the phone
- **WHEN** a viewer who may see a listed case's phone focuses that row's reference link and presses Tab
- **THEN** focus moves to the row's phone mask, and the full number shows

### Requirement: A viewer who works on a listed case can reveal its phone
When the chosen persona may see a listed case's contact details, its phone cell SHALL be the revealable mask the case page uses: an eye icon, the full number shown on pointer hover and on keyboard focus, kept shown after a click until focus leaves, present only as page text and never in an attribute. Each revealable mask SHALL have an id unique to its row (`board-phone-<case id>` on the work board, `pool-phone-<case id>` in the case pool), so that a redraw puts focus back on it.

#### Scenario: A volunteer reveals the phone of their own case on the board
- **WHEN** Alex prepares a listed case and moves the pointer over its masked phone on the work board
- **THEN** `(215) 555-0123` is shown in place of the mask

#### Scenario: An admin can reveal every phone in the case pool
- **WHEN** Sam opens the case pool
- **THEN** every listed phone carries the eye icon and is focusable, including cases nobody has claimed

#### Scenario: A realtime update keeps a revealed listed number revealed
- **WHEN** Alex has the masked phone of their own case focused on the work board, so the number is revealed, and a realtime update redraws the board
- **THEN** that row's mask still has focus and the full number stays shown

#### Scenario: No attribute carries a listed number
- **WHEN** the work board or the case pool is rendered for a viewer who may see the listed numbers
- **THEN** no attribute in the page contains a listed phone's digits beyond the last four

### Requirement: A listed case the viewer does not work on shows a locked phone
When the chosen persona may not see a listed case's contact details, which covers an available case and a case someone else prepares or reviews, its phone cell SHALL show the locked mask the case page uses: muted, with a lock icon and the tooltip "Claim this case to see the full number", not focusable, with no id, and read to screen readers as the last four digits and the sentence "Claim this case to see the full number." The full number SHALL NOT be anywhere in that row, in text or in any attribute.

#### Scenario: An available case is locked on the board
- **WHEN** Alex opens the work board and a case nobody has claimed is listed with client phone `(215) 555-0123`
- **THEN** its Phone cell shows `(•••) •••-0123` with a lock icon and the tooltip "Claim this case to see the full number", is not focusable, and `(215) 555-0123` appears nowhere in the row

#### Scenario: Someone else's case is locked on the board
- **WHEN** Morgan opens the work board and a case Alex prepares is listed
- **THEN** its Phone cell shows the locked mask

### Requirement: Claiming a case unlocks its listed phone without a reload
When the chosen persona claims preparation or review of a case, every work board showing that case to that persona SHALL show its phone as revealable after the claim, with no page reload and no navigation, including a board open in another window.

#### Scenario: Another window's board unlocks the row in place
- **WHEN** Alex has the work board open in one window, showing an available case's phone locked, and claims preparation of that case in another window
- **THEN** in the first window, without a reload, that row's phone becomes the revealable mask with the id `board-phone-<case id>`

#### Scenario: The claiming window's board shows the row unlocked
- **WHEN** Alex claims preparation of a case from the work board and then returns to the work board
- **THEN** that case's phone is the revealable mask
