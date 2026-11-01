## Context

The shaded section has a fallback path: "Download to fill elsewhere", then "Upload the filled copy" (change `add-preparer-13614c-fields`, D8). The upload currently does everything in one press (`src/app.mjs` `uploadShadedCopy`):
- `readFilledCopy` (`src/draft-pdf.mjs`) loads the PDF with pdf-lib;
- it refuses a broken file, a printed copy and another case's copy;
- it returns `{raw, version}`;
- `readShaded` checks the values;
- `controller.saveShadedSection(values, version)` sends `SAVE_PREPARER_FIELDS`.

The controller holds the upload's error (`place: SHADED_UPLOAD`) and its "Saved" (`state.shadedStatus`, keyed by case) for the shaded panel. It clears both on a case switch (`selectCase`) and at the start of a save. `saveShadedSection` captures the open case's id and sends only to it (e7db8b4).

macOS Preview can drop or change AcroForm values when it saves a filled form, and the user wants the fallback path to guard against that. The downloaded editing copy already holds the case's saved values live, so a copy that comes back empty was wiped or never filled. Staff screens are English only. No database, editor or client change is wanted.

## Goals / Non-Goals

**Goals:**
- Tell the preparer at download which programs to fill the copy in.
- Show what an upload read, and save only when the preparer confirms.
- Refuse a copy with fields but no filled values, and name Preview when the PDF says it saved the copy.

**Non-Goals:**
- The pdf.js editor. It reads its own fields, not a saved file.
- Database, RLS or migration changes. `SAVE_PREPARER_FIELDS` still accepts an empty section.
- Comparing the read values with the stored ones (a field-by-field diff).
- Refusing every copy that Preview saved.
- Detecting other programs that lose values.
- Storing the file.

## Decisions

### D1: The read is held in controller state, and Save sends it
- **Choice:**
  - After `readFilledCopy` and `readShaded` succeed with at least one value, `uploadShadedCopy` hands the read to the controller instead of saving. That is `controller.reviewShadedCopy({values, version, preview})`, stored as `state.shadedReview = {caseId, values, version, preview}`. It clears any upload error and "Saved" for that case.
  - "Save these values" calls `controller.confirmShadedReview()`. That clears the review and calls `saveShadedSection(values, version)`, but only while `review.caseId` is still the open case; otherwise it sends nothing.
  - "Cancel" calls `controller.cancelShadedReview()`.
  - `selectCase`, sign-out (`forgetUser`) and a new upload all drop the review.
- **Why:**
  - The page is rebuilt from state on every change, realtime included, so the review must live in state to survive redraws.
  - Keying it by case, and checking that case on confirm, keeps it from being saved onto another case.
  - Reusing `saveShadedSection` keeps every existing outcome unchanged: "Saved", the stale-copy sentence, the case-moved resend, refusals in place.
- **Alternatives:**
  - Holding the read in a closure in `app.mjs`: it can't drive the view, and would be lost to a re-render's event wiring.
  - A modal dialog: rejected by the user, and it would add a second place for upload messages.

### D2: The review box replaces the upload control in the shaded panel
- **Choice:** while `ui.shadedReview` is for this case, `shadedPanel` shows a review box (`role="region"`, labelled) where the upload label and input normally sit. It contains:
  - the heading "Check what was read from this copy";
  - "<n> filled fields:" ("1 filled field:");
  - a list of "<label>: <value>";
  - when `preview` is set, the Preview warning line;
  - the buttons "Save these values" (`data-action="confirm-shaded-review"`) and "Cancel" (`data-action="cancel-shaded-review"`).

  "Fill the shaded section" and "Download to fill elsewhere" stay. Focus moves to the review heading when it appears, and returns to the upload control on Cancel. Both buttons are disabled while busy.
- **Why:** an upload's messages are said beside the upload control (screen-states), and the user chose in place.
- **Alternatives:** a dialog (D1); showing the review below a still-active upload input, which invites a second upload while one is pending.

### D3: Order and wording of the summary
- **Choice:**
  - Rows follow `SHADED_FIELDS` order (page 1 household rows, then Income, deductions, expenses, information).
  - Each row is `shadedLabel(key)` plus a value:
    - "ticked" for a box;
    - `shadedPrint` for the rest (Yes / No / N/A for cells; counts, amounts, the VIN, the year and the reason as stored);
    - notes in full, with line breaks kept (`white-space: pre-wrap`).
  - Values are escaped. The count is `Object.keys(values).length`.
- **Why:** this matches the form the preparer just filled, and reuses the labels History already uses.
- **Alternatives:** "Yes" for boxes, which reads like a household cell; grouping by block with headings, which is more markup for 106 fields at most.

### D4: Preview is detected from the PDF's Producer
- **Choice:** `readFilledCopy` also returns `preview: /Quartz PDFContext/i.test(doc.getProducer() ?? "")`. This is a hint only. It never refuses a copy on its own.
- **Why:** macOS writes "macOS Version … Quartz PDFContext" as the Producer when Preview saves. pdf-lib reads it without parsing anything else.
- **Alternatives:** Creator or XMP metadata. Preview doesn't set them reliably, and they would need more parsing.

### D5: The no-values refusal
- **Choice:** when `readShaded` returns no errors and no values, the upload is refused through the existing in-place failure (Dismiss only) with "No filled values were found in this copy. If you filled it in macOS Preview, fill it again in Chrome or Adobe Acrobat Reader." When `preview` is set, " This copy was saved by macOS Preview." is appended.
  - The existing checks run first and keep their order:
    1. a broken file;
    2. a printed copy (no fields);
    3. another case's copy;
    4. rule errors.
  - "No filled values" is judged after `readShaded`: blank or whitespace-only text and unticked boxes are absent, and a count of 0 is a value.
- **Why:** the downloaded copy already carries the saved values, so an empty copy is never what the preparer meant to save through this path. The editor stays the way to clear the section on purpose.
- **Alternatives:** asking for confirmation of an empty save, which still lets a wiped copy blank the section with one press; a database rule, which would also forbid the editor's empty save.

### D6: The download hint
- **Choice:** a `field-note` paragraph right after the Download button in the tools row: "Open it in Chrome or the free Adobe Acrobat Reader, not macOS Preview." It is shown only where the tools are offered.
- **Why:** this is the moment the preparer picks a program.
- **Alternatives:** putting it in the panel intro, where it would be read once and far from the button.

## Risks / Trade-offs

- [Risk] Preview changes some values but not all, and its Producer is missing (for example, re-saved by another tool). → Mitigation: the summary lists every value read, so the preparer can catch a change before saving. The hint at download discourages Preview to begin with.
- [Risk] A preparer confirms without reading. → Mitigation: the count and the Preview warning line sit first in the box. Nothing more can be enforced without a diff against the stored values, which is out of scope.
- [Risk] A held review goes stale: the section is saved elsewhere while the box is open. → Mitigation: Save sends the copy's own version, so the server answers `CONFLICT` and the stale-copy sentence shows, as today.
- [Trade-off] One more press per upload. → Accepted: it is the point of the change.
- [Trade-off] An intentionally empty copy can't be uploaded. → Accepted: the editor can save an empty section.

## Migration Plan

N/A. There's no deployment, database or data change. Browser code, tests and docs land on the PR #98 branch together. Rollback is reverting this change's commits.

## Open Questions

(none: every choice above was settled with the user in conversation, see brainstorm.md)
