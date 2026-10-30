## Why

macOS Preview can drop or change AcroForm values when it saves a filled form. The shaded section's fallback path (download, fill elsewhere, upload) saves an uploaded copy's values in the same press, so a copy that Preview wiped or altered would be saved without the preparer seeing what was read. That includes an empty copy, which would blank the section. This adds a warning at download, a check-and-confirm step after reading, and a plain refusal for a copy with no filled values. This hardens the fallback before PR #98 merges.

## What Changes

**Download hint**
- From: "Download to fill elsewhere" with no word on which PDF program to use.
- To: next to it, "Open it in Chrome or the free Adobe Acrobat Reader, not macOS Preview."
- Reason: Preview is the program most likely to lose the values.
- Impact: non-breaking; staff only.

**Upload saves only after the preparer confirms**
- From: "Upload the filled copy" reads the PDF and saves its values in the same press.
- To: after the copy is read and passes every check, the shaded panel shows "Check what was read from this copy" with the number of filled fields and each one's label and value in form order. "Save these values" saves exactly as before. "Cancel" discards the read and saves nothing.
  - When the PDF's Producer shows macOS Quartz PDFContext, the summary adds "This copy was saved by macOS Preview, which can drop or change values. Check them before saving."
- Reason: the preparer sees what will be saved before it replaces the section.
- Impact: non-breaking for data. Uploading takes one more press. The story's fallback step gains the confirmation.

**A copy with fields but no filled values is refused**
- From: such a copy is saved, leaving the section empty.
- To: it is refused in place with "No filled values were found in this copy. If you filled it in macOS Preview, fill it again in Chrome or Adobe Acrobat Reader." When the Producer shows Quartz PDFContext, "This copy was saved by macOS Preview." is added.
- Reason: the downloaded copy already holds the saved values, so an empty one was wiped or never filled.
- Impact: non-breaking. The editor can still save an empty section, and the action's own rule is unchanged.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `shaded-section`: the requirement "The preparer can fill the section elsewhere and upload it" changes. The upload shows what was read and saves only on confirmation, refuses a copy with no filled values, and the download carries the PDF-program hint.

## Impact

- **Browser:**
  - `src/draft-pdf.mjs` (`readFilledCopy` also reports whether the Producer is macOS Quartz PDFContext);
  - `src/app.mjs` (`uploadShadedCopy` reads, checks, then holds the read instead of saving);
  - `src/controller.mjs` (the held read per case: set, confirm, cancel, dropped on a case switch or sign-out);
  - `src/staff-views.mjs` (the hint, the review box, the new refusal);
  - `src/styles.css` (the review box).
- **Tests:** `tests/draft-pdf.test.mjs`, `tests/controller.test.mjs`, `tests/staff-views.test.mjs`, the `tests/fixtures/empty-states.json` golden (the hint), and the download / upload step in `tests/browser.mjs`.
- **Docs:** the download / upload paragraph in `docs/developer/frontend.md`.
- **Unchanged:** the pdf.js editor, the database and migration 038, client text, sign-in.
