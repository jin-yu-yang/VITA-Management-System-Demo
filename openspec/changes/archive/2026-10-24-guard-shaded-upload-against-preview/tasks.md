## 1. Reader

- [x] 1.1 `readFilledCopy` (`src/draft-pdf.mjs`) also returns `preview`, which is true when the PDF's Producer matches `/Quartz PDFContext/i`. The order of refusals is unchanged.
- [x] 1.2 Unit tests (`tests/draft-pdf.test.mjs`): `preview` is true for a copy whose Producer is a macOS Quartz PDFContext string, and false for the editing copy as built.

## 2. Held read in the controller

- [x] 2.1 `src/controller.mjs`:
  - `state.shadedReview` (`{caseId, values, version, preview}` or null);
  - `reviewShadedCopy(read)` clears that case's upload error and "Saved";
  - `confirmShadedReview()` sends through `saveShadedSection` only while the review's case is still open;
  - `cancelShadedReview()`;
  - the review is dropped on `selectCase`, sign-out and a new upload.
- [x] 2.2 Unit tests (`tests/controller.test.mjs`):
  - confirm sends the held values and version, to the original case;
  - cancel sends nothing;
  - a case switch drops the review, and confirm afterwards sends nothing;
  - sign-out drops it;
  - a CONFLICT after confirm keeps today's stale-copy sentence.

## 3. Upload flow

- [x] 3.1 `uploadShadedCopy` (`src/app.mjs`):
  - after the existing refusals and `readShaded` errors, a copy with no values is refused in place with the no-values sentence, plus "This copy was saved by macOS Preview." when `preview` is set;
  - otherwise the read is handed to `reviewShadedCopy` instead of being saved.

  Wire `confirm-shaded-review` and `cancel-shaded-review`, with focus moving to the review heading and back to the upload control on Cancel.
- [x] 3.2 Unit tests for the no-values refusal, without and with the Quartz Producer, at the level where the decision lives (a pure helper in `src/shaded-fields.mjs` or `src/draft-pdf.mjs`, or the controller), plus a test that a filled copy is held, not saved.

## 4. Shaded panel

- [x] 4.1 `shadedPanel` (`src/staff-views.mjs`):
  - the note "Open it in Chrome or the free Adobe Acrobat Reader, not macOS Preview." after the Download button;
  - while `ui.shadedReview` is for this case, the review box replaces the upload control: the heading, the count line, the rows in `SHADED_FIELDS` order ("ticked" for boxes, `shadedPrint` otherwise, notes with line breaks), the Preview line when `preview` is set, and "Save these values" and "Cancel", disabled while busy.

  Add CSS in `src/styles.css`.
- [x] 4.2 Unit tests (`tests/staff-views.test.mjs`):
  - the hint;
  - the review box: heading, "1 filled field:" and "<n> filled fields:", order, "ticked", a multi-line note escaped, the Preview line shown and not shown;
  - a review for another case isn't shown.

  Regenerate the `tests/fixtures/empty-states.json` golden for the hint only, and check that the hint is its only difference.

## 5. Story

- [x] 5.1 Update the download / upload step in `tests/browser.mjs`. After `setInputFiles`, check "Check what was read from this copy" and the expected rows, press "Save these values", then check "Saved", the database row and the English draft as before.

## 6. Docs

- [x] 6.1 `docs/developer/frontend.md`: the download / upload paragraph covers the hint, the held read (`state.shadedReview`, confirm / cancel / dropped on a case switch), the Producer check and the no-values refusal. Update the unit test count where the docs state it.

## 7. Checks

- [x] 7.1 `npm test`.
- [x] 7.2 `npm run test:browser`.
- [x] 7.3 `npx openspec validate --all`.
- [x] 7.4 Record why `npm run test:database` (no database change), `npm run test:auth-browser` (sign-in untouched) and `npm run build:hant -- --check` (no client text) weren't needed.
