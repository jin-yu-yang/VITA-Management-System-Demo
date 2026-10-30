# Guard the Shaded Upload Against Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The shaded section's upload shows what it read and saves only on confirmation. It refuses a copy with no filled values, names macOS Preview when the PDF says Preview saved it, and the download carries a PDF-program hint.

**Architecture:**
- **Pure helpers:** in `src/shaded-fields.mjs`, which already holds the table, labels and print words. They decide the refusal and the review rows.
- **Reader:** `readFilledCopy` reports `preview` from the Producer.
- **Upload:** `uploadShadedCopy` in app.mjs hands a good read to the controller.
- **Controller:** holds the read as `state.shadedReview`, keyed by case, and confirm sends it through the existing `saveShadedSection`.
- **Panel:** `shadedPanel` renders the hint and the review box.

**Tech Stack:** Browser ES modules; vendored pdf-lib 1.17.1 (`getProducer`); `node:test`; Playwright (`tests/browser.mjs`).

**Spec:** `openspec/changes/guard-shaded-upload-against-preview/`. Read `design.md` (D1–D6) and `specs/shaded-section/spec.md`, the MODIFIED requirement "The preparer can fill the section elsewhere and upload it".

## Global Constraints

- **Exact copy:**
  - "Open it in Chrome or the free Adobe Acrobat Reader, not macOS Preview."
  - "Check what was read from this copy"
  - "<n> filled fields:" / "1 filled field:"
  - "ticked"
  - "Save these values"
  - "Cancel"
  - "This copy was saved by macOS Preview, which can drop or change values. Check them before saving."
  - "No filled values were found in this copy. If you filled it in macOS Preview, fill it again in Chrome or Adobe Acrobat Reader."
  - " This copy was saved by macOS Preview." (appended to the no-values sentence, with one space before it)
- **Preview detection:** `/Quartz PDFContext/i` on the PDF's Producer.
- **Staff text only:** don't touch `src/client-text.mjs` or `src/zh-hant.mjs`. There's no database, migration or editor change.
- **Saving:** goes only through `controller.saveShadedSection(values, version)`, which keeps today's outcomes ("Saved", `STAFF_UPLOAD_CONFLICT_MESSAGE`, the case-moved resend, captured case id).
- **Fictional data only.**

## Review Focus

1. **Redraw while the review is open:** a realtime update re-renders the page, and the review box must still be there. Task 2 test `the review survives a state change`.
2. **Case switch or sign-out before confirming:** the review is dropped and nothing is sent to either case. Task 2 tests `a case switch drops the review` and `sign-out drops the review`.
3. **Double press of "Save these values":** one send only. Task 2 test `confirm is single-flight`, which relies on `saveShadedSection`'s in-flight guard and on clearing the review before sending.
4. **A note with HTML-like text or line breaks** in the review: escaped, line breaks kept. Task 3 test `review rows escape and keep line breaks`.
5. **A count of 0** counts as filled, and a whitespace-only note does not. Task 1 test `zero is a value, blank is not`.

---

### Task 1: Pure helpers and the reader's Producer check

**Files:**
- Modify: `src/shaded-fields.mjs`, `src/draft-pdf.mjs` (`readFilledCopy`)
- Test: `tests/shaded-fields.test.mjs`, `tests/draft-pdf.test.mjs`

**Interfaces:**
- Produces:
  - In `src/shaded-fields.mjs`:
    - `NO_VALUES_MESSAGE`, `PREVIEW_SAVED_NOTE` (" This copy was saved by macOS Preview."), `PREVIEW_WARNING`;
    - `uploadRefusal({ values, preview }) → string | null`: the no-values sentence, plus the note when `preview`; null when `values` has a key;
    - `reviewRows(values) → [{ key, label, value }]`: in `SHADED_FIELDS` order; `value` is "ticked" for boxes, `shadedPrint(key, v)` otherwise.
  - In `src/draft-pdf.mjs`: `readFilledCopy(...)` returns `{ raw, version, preview }`.

- [ ] **Step 1: Write the failing tests.**
  - shaded-fields:
    - `uploadRefusal({values:{}, preview:false}) === NO_VALUES_MESSAGE`;
    - with `preview:true` it equals `NO_VALUES_MESSAGE + " This copy was saved by macOS Preview."`;
    - `uploadRefusal({values:{incomeW2s:true}})` is null.
  - `zero is a value, blank is not`: `readShaded` of `{[count name]:"0"}` gives `{…Count:0}`, and `uploadRefusal` returns null. `readShaded` of a note `"   "` gives `{}`, and `uploadRefusal` returns the sentence.
  - `reviewRows` order and words: `reviewRows({incomeNotes:"a\nb", incomeW2sCount:2, household1QualifyingChild:"na", incomeW2s:true})` gives `["household1QualifyingChild","incomeW2s","incomeW2sCount","incomeNotes"]` as keys, with values `["N/A","ticked","2","a\nb"]`, and labels from `shadedLabel`.
  - draft-pdf `the reader reports a Preview Producer`: build an editing copy, `setProducer("macOS Version 14.5 (Build 23F79) Quartz PDFContext")` with npm pdf-lib, save, and `readFilledCopy` gives `preview === true`. The editing copy as built gives `preview === false`.
- [ ] **Step 2:** Run `node --test tests/shaded-fields.test.mjs tests/draft-pdf.test.mjs`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement the helpers. In `readFilledCopy`, add `preview: /Quartz PDFContext/i.test(String(doc.getProducer() ?? ""))` to the return value. The refusal order is unchanged.
- [ ] **Step 4:** Run the same command, then `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: "Shaded upload: no-values refusal, review rows, Preview Producer".

### Task 2: The held read in the controller, and the upload flow

**Files:**
- Modify: `src/controller.mjs`, `src/app.mjs` (`uploadShadedCopy` ~1491–1526, the click handler near `download-shaded-copy` ~2015), `src/views.mjs` (pass `shadedReview` to the view, beside `shadedStatus` ~268)
- Test: `tests/controller.test.mjs`

**Interfaces:**
- Consumes: Task 1's `uploadRefusal`, and `readFilledCopy`'s `preview`.
- Produces:
  - `state.shadedReview`: `{ caseId, values, version, preview } | null`, initially null;
  - `controller.reviewShadedCopy({ values, version, preview })`: stores it for the open case, clears this case's `SHADED_UPLOAD` error and `shadedStatus`, and calls `show()`;
  - `controller.confirmShadedReview() → Promise<receipt | null>`: if `shadedReview?.caseId !== state.savedCase?.id`, it clears the review and returns null. Otherwise it clears the review, then `return saveShadedSection(values, version)`;
  - `controller.cancelShadedReview()`: clears the review and calls `show()`;
  - the review is cleared in `selectCase` (with `shadedStatus`, ~557 / 1362), in `forgetUser` (~1174), and when a new upload starts (`reviewShadedCopy` replaces it);
  - all three functions are exported beside `saveShadedSection` (~2873).

- [ ] **Step 1: Write the failing controller tests**, next to "saveShadedSection sends the latest revision" (~6037):
  - `a reviewed upload is sent only on confirm`: after `reviewShadedCopy({values:{incomeW2s:true}, version:0, preview:false})`, no `SAVE_PREPARER_FIELDS` has been dispatched. After `confirmShadedReview()`, exactly one has, with `{fields:{incomeW2s:true}, basedOnVersion:0}` and the open case's id, and `shadedReview` is null.
  - `cancel sends nothing`: after `cancelShadedReview()`, no dispatch, and `shadedReview` is null.
  - `a case switch drops the review`: after `selectCase` to another case, `shadedReview` is null, and `confirmShadedReview()` resolves null with no dispatch.
  - `sign-out drops the review`.
  - `the review survives a state change`: a realtime revision bump keeps `shadedReview` with the same values.
  - `confirm is single-flight`: two `confirmShadedReview()` calls back to back give one dispatch.
  - `a CONFLICT after confirm keeps the stale-copy sentence`: the section moved, so the error is `STAFF_UPLOAD_CONFLICT_MESSAGE` with `place: SHADED_UPLOAD`.
- [ ] **Step 2:** Run `node --test tests/controller.test.mjs`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement the controller part.
- [ ] **Step 4:** Implement the app part:
  - in `uploadShadedCopy`, after the `readShaded` errors check, `const refusal = uploadRefusal({ values, preview: read.preview }); if (refusal) return shadedFailure(refusal);`, else `controller.reviewShadedCopy({ values, version: read.version, preview: read.preview })`;
  - remove the direct `saveShadedSection` call there;
  - in the click switch, add `confirm-shaded-review` (await `controller.confirmShadedReview()`, with the same catch as the old upload save: `shadedFailure("Something went wrong.", …)` when nothing else was recorded) and `cancel-shaded-review`;
  - after render, when a review has just appeared, focus `#shaded-review-title`; after Cancel, focus the `#shaded-upload` label's input.
- [ ] **Step 5:** Run `node --test tests/controller.test.mjs`, then `npm test`. Expected: PASS.
- [ ] **Step 6:** Commit: "Shaded upload: hold what was read until the preparer confirms".

### Task 3: The shaded panel

**Files:**
- Modify: `src/staff-views.mjs` (`shadedPanel` ~1151), `src/styles.css`
- Test: `tests/staff-views.test.mjs`, `tests/fixtures/empty-states.json` (regenerated)

**Interfaces:**
- Consumes: `reviewRows` and `PREVIEW_WARNING` (Task 1), and `ui.shadedReview` (Task 2).
- Produces:
  - the hint `<p class="field-note shaded-download-note">` after the Download button;
  - while `ui.shadedReview?.caseId === record.id`, in place of the upload label, input and status: `<div class="shaded-review" role="region" aria-labelledby="shaded-review-title">` containing:
    - `<h3 id="shaded-review-title" tabindex="-1">Check what was read from this copy</h3>`;
    - `<p>` with the count line;
    - `<ul>` with one `<li><span class="shaded-review-label">label:</span> <span class="shaded-review-value">value</span></li>` per row;
    - the warning `<p>` when `preview` is set;
    - `button("Save these values", "confirm-shaded-review", "primary", busy)` and `button("Cancel", "cancel-shaded-review", "secondary", busy)`.

- [ ] **Step 1: Write the failing view tests:**
  - `the download note`: the panel with tools contains the hint, right after "Download to fill elsewhere".
  - `the review box`: with `ui.shadedReview` for the record, holding 3 values, the panel has "Check what was read from this copy", "3 filled fields:", rows in table order, "ticked", "Save these values" and "Cancel", and no `#shaded-upload` input. With 1 value it says "1 filled field:".
  - `review rows escape and keep line breaks`: a note `"<b>x</b>\nline 2"` renders escaped, with `\n` inside `.shaded-review-value` (CSS `white-space: pre-wrap`).
  - `the Preview line`: present when `preview:true`, absent when false.
  - `a review for another case isn't shown`: with `caseId` ≠ `record.id`, the upload control is shown.
- [ ] **Step 2:** Run `node --test tests/staff-views.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement it, plus CSS for `.shaded-review` (spacing, list, `.shaded-review-value { white-space: pre-wrap }`) and `.shaded-download-note`.
- [ ] **Step 4:** Run the view tests, then `npm test`. The empty-states golden fails only on the hint: regenerate it the way the repo does (see `tests/empty-states.test.mjs`), and check with a scripted diff that the hint paragraph is the only difference. Expected: PASS.
- [ ] **Step 5:** Commit: "Shaded panel: the Preview hint and the review box".

### Task 4: Story, docs and checks

**Files:**
- Modify: `tests/browser.mjs` (the download / upload step, ~1340–1431), `docs/developer/frontend.md` (the download / upload paragraph), and the unit counts where docs state them (`docs/developer/README.md`, `docs/setup.md`)

- [ ] **Step 1:** In the story, after `setInputFiles` of the filled copy (~1376):
  - wait for `#case-panel-intake .shaded-review` with "Check what was read from this copy";
  - check that the expected rows are shown (the values the step fills, e.g. "W-2s: ticked" and "W-2s #: 2");
  - click "Save these values";
  - keep the existing checks: "Saved", the database row, History, and the draft page text.

  The non-PDF refusal step (~1346) is unchanged.
- [ ] **Step 2:** Update the docs paragraph: the hint, `state.shadedReview` (confirm, cancel, dropped on a case switch or sign-out), the Producer check, the no-values refusal and its order after the existing refusals. Update the unit test count.
- [ ] **Step 3:** Run `npm test`, then `npm run test:browser` (about 20–26 min; on a known 20 s page-settle flake in a non-shaded phase, re-run once and report both), then `npx openspec validate --all`. Expected: all PASS.
- [ ] **Step 4:** Commit: "Story and docs: confirm what the upload read".
