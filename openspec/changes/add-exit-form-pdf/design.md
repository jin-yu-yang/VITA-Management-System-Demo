## Context

The Exit Form is PCDC's one-page bilingual hand-out for the client at signing. PR #115 (`462fd61`) added it without an OpenSpec change. `src/exit-form.mjs` decides what goes on the page and draws it; `viewExitForm` in `src/app.mjs` builds it in the browser and opens a tab; `exitFormTool` and `exitFormPanel` in `src/staff-views.mjs` offer it.

`review-and-corrections` already says what the reviewer questionnaire stores for the form. This change adds what the PDF shows. It records behaviour that exists, so the requirements describe `main` as it is.

`tests/exit-form.test.mjs` covers the marks and builds real PDFs. Nothing covers the shrink and cut in `buildExitFormPdf`, the template's document info, or anything `viewExitForm` does. No browser test presses the button.

## Goals / Non-Goals

**Goals:**
- Every Exit Form behaviour is a testable requirement in `review-and-corrections`.
- Every requirement has automated evidence, or a listed gap in `verify.md`.
- `frontend.md` matches the code on when the font is fetched.

**Non-Goals:**
- Any change under `src/`.
- Fixing the Remarks cut or the font failure (#122), or the font download's size (#121).
- #114's Result-dependent fields and #117's Auto-fill.

## Decisions

### D1: Characterisation tests, with no change to `src/`
- **Choice:** Add tests that pass against the code as it is. A task's "red" step is therefore a check that the test can fail (temporarily break the expectation), not a missing feature.
- **Why:** The user asked to record behaviour, and to protect it with tests, without changing it. The final review found the blocked tab's link isn't visible where the button is, confirmed in Chrome. The user chose to record that as a known problem in #122 and test what really happens, rather than fix `src/` first.
- **Alternatives:** Spec only, leaving the riskiest parts unprotected. Spec only what is already tested, leaving those parts unrecorded.

### D2: Known problems are recorded neutrally, with their issue
- **Choice:** The requirements say what happens, and add "Known problem, see #122; this records current behaviour, not the intended one." The Remarks cut, the small debit date, the font failure and the blocked tab's link all get this.
- **Why:** A spec is read as what we want. Clients get this form, and #122 is to be fixed before the February pilot.
- **Alternatives:** Leave them out, which hides them. Fix them here, which is a behaviour change outside this change's scope.

### D3: `app.mjs` is pinned at the source; its behaviour is proved in the browser
- **Choice:** `viewExitForm` lives in a closure, so unit tests read its source, as `tests/shell.test.mjs` does for other `app.mjs` wiring: the staff-window guard, the spouse rule, and no controller call beyond those that report. The tab, link and failure are proved by the story.
- **Why:** Exporting it would change `src/`.
- **Alternatives:** A DOM harness for `app.mjs`, which doesn't exist and is out of scope.

### D4: The story reads the PDF in Chrome only
- **Choice:** The phase runs in both browser orders but does its work only when the staff window is Chrome, and records "not run" otherwise.
- **Why:** Firefox may download a blob PDF instead of opening it, leaving nothing to read. The story's draft checks have the same rule. `verify.md` lists this as a known gap: the Exit Form's content is verified only in Chrome.
- **Alternatives:** Hooking `URL.createObjectURL` to read the bytes in Firefox too. It wouldn't prove a tab shows the PDF, and it differs from every other draft check.

### D5: The failure is triggered with wrong font bytes
- **Choice:** The phase serves the font URLs with wrong bytes, checks the tab's message and the case page's error notice, restores the fonts, and presses Try again.
- **Why:** An HTTP 500 on the form makes Chrome log a console error, which the staff window's console check doesn't allow (`REFUSAL_LINES` has no 500). Wrong bytes log nothing, and this is the failure #122 describes.
- **Alternatives:** A 500 with a new exception to the console check, which widens that check for every other phase. The Form 14446 check excuses its 500 by position, but only in its own separate window.

### D6: The story serves fonts from the npm packages
- **Choice:** The phase routes the font URLs to `DRAFT_FONT_FIXTURES`, and unroutes them when it ends.
- **Why:** The story never depends on the internet. Every Exit Form needs these fonts, so without this the phase would reach jsDelivr.

### D7: Reviewer and office paths are both pressed
- **Choice:** Morgan's button opens the form and it is read. Sam's button covers the failure, the retry and the blocked tab. The phase sits before "the office records signing and e-filing", while the `review_approved` sample is still at Ready to exit. It changes no case data.
- **Why:** They are two different buttons in two different views, and pressing each costs seconds.

### D8: When `test:browser` runs
- **Choice:** On the change branch before `verify.md` is written (lifecycle step 6), with the result recorded there. At step 8, if merging `main` brings new commits, run it again and add the result to `verify.md`. If `main` has not changed, do not run it again.
- **Why:** The user's decision. The evidence exists when verify is written, and a later run happens only when something could have changed.

### D9: The Purpose is edited by hand at archive
- **Choice:** Archive merges the requirements. Then add one sentence to the `review-and-corrections` Purpose by hand, saying it also covers the Exit Form PDF built from the reviewer's answers. `retrospective.md` is written before archive (step 7), so it records that this edit is made by hand at archive, and why: a delta spec can't change a Purpose.
- **Why:** The user's decision. Without it, the Purpose would not cover part of the capability.

## Risks / Trade-offs

- [Trade-off] Firefox staff windows never prove the tab shows the PDF. → Accepted and listed as a known gap in `verify.md`: this matches the draft checks, and the unit tests build real PDFs in Node.
- [Trade-off] The spec records the Remarks cut and the font failure, which nobody wants. → Accepted: each is marked as a known problem with #122, and that issue requires updating the requirement.
- [Risk] Source pins on `app.mjs` can break on a harmless refactor. → Mitigation: pin the few lines that carry a rule, and use loose patterns.
- [Risk] Story flake #120 may stop a run. → Mitigation: report every run and its failing step in `verify.md`. Run it again as `docs/setup.md` advises; a failure in the new phase is never treated as a flake without being looked at.
- [Risk] A phase in the middle of a linear story could disturb later phases. → Mitigation: the phase changes no case data, and removes every route and `window.open` override it adds, including when it fails.

## Migration Plan

N/A: nothing deploys, and no data or schema changes.

## Open Questions

None for this change. How to fix the Remarks cut and the font failure is decided in #122 (it can't affect this change, except that #122 updates the requirement when it lands).
