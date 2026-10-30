## MODIFIED Requirements

### Requirement: The preparer can fill the section elsewhere and upload it
The case page SHALL offer "Download to fill elsewhere", which saves the editing copy, with the note "Open it in Chrome or the free Adobe Acrobat Reader, not macOS Preview." beside it. It SHALL also offer "Upload the filled copy", which reads a chosen PDF in the browser. The downloaded copy SHALL carry the case's reference and the section version it was made from.

An uploaded copy SHALL be refused, in place beside the upload control and saving nothing, when:
- it has none of the shaded fields. It SHALL then say "This copy has no form fields. In Chrome, use the download button, not Print.";
- it was made for another case;
- any value breaks its field's rule, naming the field;
- it has the shaded fields but no filled value. It SHALL then say "No filled values were found in this copy. If you filled it in macOS Preview, fill it again in Chrome or Adobe Acrobat Reader." When the PDF's Producer shows macOS Quartz PDFContext, it SHALL add "This copy was saved by macOS Preview." A blank or whitespace-only text field and an unticked box are not filled; a count of 0 is.

When a copy passes every check above, the upload SHALL NOT save it yet. In place of the upload control, the case page SHALL show "Check what was read from this copy" with:
- the number of filled fields, as "<n> filled fields:" or "1 filled field:";
- every filled field, in the form's order, as its label and value: "ticked" for a checkbox, Yes, No or N/A for a household cell, a note in full with its line breaks, and every other value as read;
- when the PDF's Producer shows macOS Quartz PDFContext, the line "This copy was saved by macOS Preview, which can drop or change values. Check them before saving.";
- "Save these values" and "Cancel".

"Save these values" SHALL save exactly the values shown, on the copy's own section version. The save SHALL be refused, in place and saving nothing, when the section was saved since the copy was downloaded (`CONFLICT`). "Cancel" SHALL discard what was read and save nothing. What was read SHALL stay shown when the case page redraws, and SHALL be discarded when another case is opened or the person signs out, and it SHALL never be saved to another case.

The uploaded file SHALL NOT be uploaded to the server or kept.

#### Scenario: A copy filled in another program
- **WHEN** the preparer downloads the editing copy, ticks W-2s and enters 2 as their number in another PDF program, uploads it, and presses "Save these values"
- **THEN** the shaded section is saved with W-2s ticked and 2 W-2s

#### Scenario: What was read is shown before saving
- **WHEN** the preparer uploads a copy with W-2s ticked, 2 W-2s and an income note
- **THEN** the case page shows "Check what was read from this copy", "3 filled fields:", and "W-2s: ticked", "W-2s #: 2" and the income note in that order, and nothing is saved yet

#### Scenario: Cancel saves nothing
- **WHEN** the preparer uploads a filled copy and presses "Cancel"
- **THEN** nothing is saved, and the upload control is offered again

#### Scenario: Another case is opened before saving
- **WHEN** the preparer uploads a filled copy and opens another case before pressing "Save these values"
- **THEN** what was read is discarded, and nothing is saved to either case

#### Scenario: A copy saved by macOS Preview
- **WHEN** the preparer uploads a filled copy whose Producer shows macOS Quartz PDFContext
- **THEN** the summary also says "This copy was saved by macOS Preview, which can drop or change values. Check them before saving.", and "Save these values" is still offered

#### Scenario: A copy with no filled values
- **WHEN** the preparer uploads a copy that has the shaded fields but no filled value
- **THEN** the upload is refused with "No filled values were found in this copy. If you filled it in macOS Preview, fill it again in Chrome or Adobe Acrobat Reader.", and nothing is saved

#### Scenario: An empty copy saved by macOS Preview
- **WHEN** the preparer uploads a copy with no filled value whose Producer shows macOS Quartz PDFContext
- **THEN** the refusal also says "This copy was saved by macOS Preview."

#### Scenario: A printed copy
- **WHEN** the preparer uploads a PDF of the editing copy made with the browser's Print
- **THEN** the upload is refused with "This copy has no form fields. In Chrome, use the download button, not Print.", and nothing is saved

#### Scenario: Another case's copy
- **WHEN** the preparer uploads a copy downloaded from a different case
- **THEN** the upload is refused, and nothing is saved
