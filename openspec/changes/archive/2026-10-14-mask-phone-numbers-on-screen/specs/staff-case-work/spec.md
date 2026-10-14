## ADDED Requirements

### Requirement: A client's phone on the staff case page is shown masked
On the staff case page, which is the volunteer case page and the admin/office case page, each client phone SHALL first show as a mask in the form `(•••) •••-1234`. The mask SHALL be built from the number's last four digits only. This SHALL hold for the Phone and Spouse phone rows of the Contact details card, and for the phone rows of "What the client told us". An empty phone SHALL read as it does today, for every viewer. In the Contact details card it SHALL read "Not given". In "What the client told us" it SHALL follow the rule for any unanswered question: an empty required phone reads "Not answered", and an empty optional phone shows no row.

#### Scenario: The case page shows the mask first
- **WHEN** a staff persona opens a case whose client phone is `(215) 555-0123`
- **THEN** the Phone row shows `(•••) •••-0123`, and the full number is not visible until the viewer reveals it

#### Scenario: An empty spouse phone in the contact card
- **WHEN** a case has no spouse phone
- **THEN** the Contact details card's Spouse phone row reads "Not given"

#### Scenario: An empty required phone in the answers
- **WHEN** a case has no client phone
- **THEN** the Phone number row of "What the client told us" reads "Not answered", whether or not the viewer may see contact details

### Requirement: A viewer who works on the case can reveal the phone
When the chosen persona may see the case's contact details, the mask SHALL carry an eye icon and SHALL reveal the full number on pointer hover and on keyboard focus. The persona may see them when it has `admin` or `followup`, or when it is the case's preparer or reviewer. After the viewer clicks the mask, the full number SHALL stay shown until focus leaves it, so it can be selected and copied. It SHALL be hidden again once focus leaves. There SHALL be no copy button. The full number SHALL be present only as page text, never in a `title`, `aria-label` or any other attribute. Screen readers SHALL read the full number.

#### Scenario: Hover reveals the number
- **WHEN** Alex has claimed the case and moves the pointer over the masked phone
- **THEN** `(215) 555-0123` is shown in place of the mask

#### Scenario: Keyboard focus reveals the number
- **WHEN** Sam tabs to the masked phone on any case
- **THEN** the full number is shown while the mask has focus

#### Scenario: A click keeps the number shown until focus leaves
- **WHEN** Alex clicks the masked phone on a case Alex prepares and moves the pointer away
- **THEN** the full number stays shown
- **AND WHEN** focus moves elsewhere
- **THEN** the mask shows again

#### Scenario: A realtime update keeps a revealed number revealed
- **WHEN** Alex has the masked phone focused, so the number is revealed, and a realtime update redraws the case page
- **THEN** the mask still has focus and the full number stays shown

#### Scenario: No attribute carries the number
- **WHEN** the case page is rendered for a viewer who may see the number
- **THEN** no attribute in the page contains the phone's digits beyond the last four

### Requirement: A viewer who does not work on the case sees a locked mask
When the chosen persona may not see the case's contact details, the phone rows SHALL show the mask muted, with a lock icon and the tooltip "Claim this case to see the full number". This covers a volunteer on an unclaimed case, or on a case someone else prepares or reviews. The full number SHALL NOT be anywhere in the page, in text or in any attribute, and the mask SHALL NOT be focusable. Screen readers SHALL hear the last four digits and the sentence "Claim this case to see the full number." In the Contact details card, best time and the note SHALL stay hidden, and the sentence "Contact details are shown to the office, and to the preparer and reviewer once the case is claimed." SHALL show in their place. The draft 13614-C buttons SHALL NOT be offered.

#### Scenario: An unclaimed case shows the locked mask
- **WHEN** Alex opens an available case that nobody has claimed
- **THEN** the Phone row shows `(•••) •••-0123` with a lock icon and the tooltip "Claim this case to see the full number", and `(215) 555-0123` appears nowhere in the page

#### Scenario: Best time and the note stay hidden
- **WHEN** Alex opens an available case
- **THEN** the Contact details card shows the masked phones and the sentence "Contact details are shown to the office, and to the preparer and reviewer once the case is claimed.", and no best time or note

#### Scenario: The answers panel masks the phone too
- **WHEN** Alex opens an available case
- **THEN** "What the client told us" shows the phone rows locked and masked, not left out

#### Scenario: Claiming the case unlocks the phone
- **WHEN** Alex claims preparation of the case
- **THEN** the lock is replaced by the eye icon, and the number can be revealed
