## Why

PR #115 added the Exit Form PDF without an OpenSpec change, to be ready for the demo. Nothing says what the form must show, no browser test presses its button, and the docs disagree with the code about when its font loads. PCDC hands this form to clients, and the February pilot is close, so its behaviour should be written down and tested. Checking the code also found two problems to record honestly rather than as wanted behaviour: long Remarks are cut with no warning, and a failed font download stops the whole form (both in #122).

## What Changes

- Add requirements to `review-and-corrections` that record what the Exit Form does today. No behaviour changes.
- Mark the Remarks cut and the font failure as known problems, see #122.
- Add unit tests for what has none: making the form, long Remarks, the template's document info, and the office panel's choice of approval.
- Add a browser story phase: press Download Exit Form on an approved case and read the PDF, then the failure with its retry, and the blocked tab's link.
- **Fonts bullet in `docs/developer/frontend.md`**
  - From: the font is fetched "when a mark needs it".
  - To: every Exit Form fetches it, because the Other Tax rows always need it.
  - Reason: the bullet doesn't match the code.
  - Impact: documentation only.

Out of scope: any change under `src/`, and fixing #122.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-and-corrections`: adds requirements for the Exit Form PDF built from the reviewer questionnaire. Its existing requirements don't change. Its Purpose gets one sentence by hand at archive, because a delta spec can't change a Purpose.

## Impact

- **Tests:** `tests/exit-form.test.mjs`, `tests/shell.test.mjs`, `tests/admin-views.test.mjs`, `tests/browser.mjs`. The story gains one phase per browser order, which does its work only when the staff window is Chrome.
- **Docs:** `docs/developer/frontend.md`.
- **Specs:** `openspec/specs/review-and-corrections/spec.md`, at archive.
- **Not affected:** `src/`, the database, RPCs, client text, and dependencies.
