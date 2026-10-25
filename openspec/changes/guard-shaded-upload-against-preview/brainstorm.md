# Brainstorm: guard-shaded-upload-against-preview

Recorded 2026-10-24. The design below was agreed with the user in conversation before propose (CLAUDE.md lifecycle step 2). This file records it; it asks nothing new.

## Background

`add-preparer-13614c-fields` (PR #98, archived 2026-10-24) gave the case's preparer two ways to fill the 13614-C shaded section. One is the pdf.js editor. The other, the fallback, is "Download to fill elsewhere" and then "Upload the filled copy".

Today the upload reads the chosen PDF in the browser and saves its values **in the same press** (`src/app.mjs` `uploadShadedCopy`, `src/draft-pdf.mjs` `readFilledCopy`). The canonical spec `shaded-section` says so ("The preparer can fill the section elsewhere and upload it").

**The risk:** macOS Preview can drop or change AcroForm values when it saves a filled form. A copy filled in Preview can come back with some values gone, all of them gone, or values changed, and the upload would save that without the preparer seeing it.

There is one existing fact to note. The downloaded editing copy already holds the case's saved values, live (`buildEditingCopy`). So a copy that comes back with no filled values was either wiped by the program that saved it, or never filled.

The user's request:
1. Next to the Download button, add: "Open it in Chrome or the free Adobe Acrobat Reader, not macOS Preview."
2. After an upload is read, show what was read (the number of filled fields, and their labels and values). Save only when the preparer confirms; Cancel discards it.
3. If the upload has form fields but no filled values, say: "No filled values were found in this copy. If you filled it in macOS Preview, fill it again in Chrome or Adobe Acrobat Reader." If the PDF's Producer says it was saved by macOS Quartz PDFContext, add that this copy came from Preview.

The user also asked for unit tests for 2 and 3, the story's fallback step updated for the confirmation, and the work pushed to PR #98.

## Decisions

### Q0. How does this reach the spec? (user)

Items 2 and 3 change behaviour that the canonical spec fixes: "saves its shaded values in the same press", and an upload of an empty copy is saved today. The user chose **a small OpenSpec change on the same branch, archived in PR #98**. The rejected options were amending the spec directly in the PR, and a separate PR after #98 merges.

### Q1. Where does the confirmation appear? (user: in place)

The confirmation is a review box in the shaded panel, in place of the upload control. A modal dialog was rejected.
- The read is held in controller state, keyed by case, so it survives redraws.
- Switching to another case drops it.
- This matches the screen-states rule that an upload's messages are said beside the upload control.

### Q2. What does the review box say? (proposed in chat, not objected to)

- Heading: "Check what was read from this copy".
- "<n> filled fields:", or "1 filled field:".
- Then each filled field as "<label>: <value>".
- Buttons: "Save these values" and "Cancel".
- Save sends `SAVE_PREPARER_FIELDS` exactly as the upload does today. The stale-copy and case-moved behaviour still applies, and an accepted save shows "Saved".
- Cancel discards the read and saves nothing.

### Q3. Order and value wording in the summary (user: form order, "ticked")

- Order: the 106-field table's order (page 1 household rows, then Income, Standard or itemized deductions, Expenses to report, Information to report).
- Values:
  - boxes read "ticked";
  - household cells read Yes / No / N/A;
  - counts, amounts, the VIN, the year and the reason read as stored;
  - notes are shown in full, with line breaks.

### Q4. A copy with values whose Producer is macOS Quartz PDFContext (user: add a warning line)

The summary is shown as usual, with one extra line: "This copy was saved by macOS Preview, which can drop or change values. Check them before saving." Save stays allowed. The rejected options were saying nothing extra, and refusing every Preview copy.

### Q5. The no-values refusal (user: the sentence after)

A copy that has the shaded fields but no filled value is refused, in place beside the upload control, with Dismiss only:

> "No filled values were found in this copy. If you filled it in macOS Preview, fill it again in Chrome or Adobe Acrobat Reader."

When the Producer shows Quartz PDFContext, the sentence "This copy was saved by macOS Preview." is added after it.

"No filled values" means no value is left after `readShaded`. Blank or whitespace-only text and unticked boxes count as not filled, and the count `0` counts as filled.

### Q6. The download hint (user)

The sentence "Open it in Chrome or the free Adobe Acrobat Reader, not macOS Preview." sits next to "Download to fill elsewhere" in the shaded panel.

### Q7. What stays the same (agreed)

- The pdf.js editor.
- The database and migration 038.
- Client text.
- The action's own rule that a save may leave every field blank. Only the upload path refuses an empty copy, and the editor can still save an empty section.
- The order of the existing refusals:
  1. a broken file;
  2. a printed copy (no fields);
  3. another case's copy;
  4. a value that breaks its field's rule, named.

  The no-values refusal comes after these.

## Dependencies

- pdf-lib's `PDFDocument.getProducer()`, already in the vendored bundle. Ready.
- No database or server change.

## Acceptance

- Unit tests:
  - item 2: the summary's contents and order; Save sends the values and version; Cancel discards; a case switch discards; the Preview warning line;
  - item 3: no values, without and with the Quartz Producer.
- The story's download / upload step uploads the filled copy, checks the summary, presses "Save these values", then checks "Saved" and the English draft as before.
- Checks: `npm test`, `npm run test:browser` and `npx openspec validate --all`.
  - The database suite isn't needed (no database change).
  - The sign-in suite isn't needed (sign-in untouched).
  - `build:hant` isn't needed: staff text only, no client text.
