## 1. Unit tests for the Exit Form

- [ ] 1.1 Pin the long-Remarks behaviour in `tests/exit-form.test.mjs`: whole at 12 pt, smaller when wider, cut with "…" at 6 pt for English and Chinese, citing #122
- [ ] 1.2 Assert in `tests/exit-form.test.mjs` that `src/forms/exit-form-pcdc.pdf` has no Author and no Title, and that a generated form's Title is "Exit Form"
- [ ] 1.3 Pin `viewExitForm` at the source in `tests/shell.test.mjs`: the staff-window guard, the action's handler, the tab's and the banner's failure sentences, the spouse rule, and no controller call that records case data; assert no client view emits `view-exit-form`
- [ ] 1.4 Assert in `tests/admin-views.test.mjs` that the office panel uses the latest approval with a questionnaire and stays at a later stage

## 2. Browser story

- [ ] 2.1 Add the story phase: Morgan presses Download Exit Form on the `review_approved` sample, and the PDF has the year, the date, the client number, the name, the amount, an empty Author and the Title "Exit Form"; the case's stage and revision don't change
- [ ] 2.2 Extend the phase: Sam's button with wrong font bytes shows the tab's and the banner's failure sentences, and Try again makes the form once the fonts are back
- [ ] 2.3 Extend the phase: with `window.open` blocked, Sam's button offers the PDF as a link named `exit-form-<client number>.pdf`
- [ ] 2.4 Make the phase work only when the staff window is Chrome, record "not run" otherwise, and remove its routes and overrides even when it fails

## 3. Documentation

- [ ] 3.1 Correct the Fonts bullet in `docs/developer/frontend.md`: every Exit Form fetches the font, and a failure means no form (#122)
- [ ] 3.2 Update the Tests bullet in that section to name the new unit tests and the story phase

## 4. Checks

- [ ] 4.1 Confirm `git diff origin/main -- src/` is empty
- [ ] 4.2 Run `npm test` and `npx openspec validate --all`
- [ ] 4.3 Run `npm run test:browser` on the change branch, and keep the result of every run for `verify.md`
