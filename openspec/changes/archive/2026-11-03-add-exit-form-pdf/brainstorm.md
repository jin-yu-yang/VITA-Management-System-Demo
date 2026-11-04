<!--
Raw capture of the brainstorm. The design was brainstormed in the conversation
on 2026-11-03 and the user approved it (all 5 promotion criteria held) and asked
for /opsx:propose. Decisions marked "builder's call" came up while grounding the
approved design in the code during propose; they are for the user to check at
the planning review.
-->

# Brainstorm: record the Exit Form PDF (#115) as requirements

## Background

- PR #115 (merged as `462fd61`) added the Exit Form PDF: "Download Exit Form" on
  an approved review, an Exit Form panel on the office's Overview, and the PDF
  built in the browser on PCDC's blank form.
- It is a new capability, which `CLAUDE.md` routes through an OpenSpec change.
  The PR says it skipped that to be ready for the demo, and that a follow-up
  should add the delta spec, likely under `review-and-corrections`.
- This change is that follow-up. The code exists; it records current behaviour
  as requirements.
- `review-and-corrections` already says what the reviewer questionnaire stores
  for the Exit Form. Nothing says what the PDF shows.

## What checking the docs against `main` found

- **Remarks are cut with no warning.** Up to 2000 characters are accepted, but
  the form draws one line. Measured: about 150–160 English or 72 Chinese
  characters print, then "…". Fonts shrink first, down to 6 pt.
- **"Download" opens a tab.** Only a blocked tab gets a link. The spec says what
  happens.
- **Fonts are always loaded.** The PR says always, `frontend.md` says when
  needed. The Other Tax rows are drawn in Noto every time, so it is always. If
  the fonts fail, no form is made.
- **The couple rule has no drift.** Code and docs agree: married, or widowed in
  the tax year (`spouseShown`, rule `joint_possible`).
- **No browser test presses the button.** One-off scripts did, on #115's branch
  only.

## Decisions

### Q1. Does the change add tests?

Options: A, spec only, with the gaps listed in `verify.md`. B, tests but no
`src/` change. C, spec only the behaviour that already has tests.

**User chose B.**
- Unit tests for requirement 2 (making the form), requirement 6 (Remarks), and
  "the template has no document info": read `src/forms/exit-form-pcdc.pdf`
  directly and assert it has no Author or Title.
- A browser story phase: press Download Exit Form on an approved case and check
  that the PDF has the year, client number, name and amount.
- The blocked-tab link and the failure message: test them in the story if they
  can be triggered, otherwise list them as known gaps in `verify.md`.

The story already triggers both for the Form 14446, so they go in the phase.

### Q2. How is the Remarks cut recorded?

**User decided:** the spec records the cut as it is, in neutral wording, marked
"known problem, see #122", and not as wanted behaviour. Issue #122 was opened
and says fix before the February pilot, because the client gets this form. It
also covers "if the font download fails, the whole form can't be made". The spec
marks that as a known problem too. #121 covers the download's size and speed.

### Q3. Documentation

**User decided:** fix the Fonts bullet in `frontend.md` (The Exit Form) in this
change: the font is always fetched, not only when needed.

### Q4. The capability's Purpose

`review-and-corrections`' Purpose covers the questionnaires and not the PDF, and
delta specs do not update a Purpose.

**User decided:** add a sentence by hand at archive, and say in
`retrospective.md` that it was a manual edit, and why.

### Q5. When `test:browser` runs

**User decided:**
- Run it on the change branch before writing `verify.md` (lifecycle step 6), and
  record the result there.
- At step 8, when `main` is merged: if `main` has new commits, run it again and
  add the result to `verify.md`. If `main` has not changed, do not run it again.

### Q6. Where the spec goes

**User decided:** `review-and-corrections`, `ADDED` requirements only.

### Q7. Scope

In: the requirements, the tests, the `frontend.md` correction.
Out: any `src/` change, and the fixes for #122. #114's Result-dependent fields
and #117's Auto-fill are other work.

## Builder's calls (for the planning review)

1. **The story phase reads the PDF in Chrome only.** The story already does this
   for the drafts, because Firefox may download a blob PDF instead of opening it.
   The phase runs when the staff window is Chrome, so once per run, and records
   "not run" in the other browser order.
2. **The failure is triggered with wrong font bytes, not an HTTP 500.** A 500
   makes Chrome log a console error, which the staff window's console check does
   not allow (`REFUSAL_LINES` has no 500). A font with the wrong bytes fails the
   same way with nothing logged, and is the failure #122 describes.
3. **Reviewer path and office path are both pressed.** The reviewer's button
   opens the tab; the office's button covers the failure, the retry and the
   blocked tab.
4. **A few more pins beyond the user's list,** because the spec states them:
   the office panel uses the latest approval and stays after the Ready to exit
   stage (unit), and `viewExitForm` uses the intake's spouse rule and only the
   controller calls that record no case data (source pin in `tests/shell.test.mjs`,
   as this file does for other `app.mjs` wiring).
5. **`app.mjs` is pinned at the source for requirement 2.** `viewExitForm` is in
   a closure, so without changing `src/` a unit test can only read its source. The
   tab, link and failure behaviour are proved in the browser.

## Dependencies

| Dependency | State |
| --- | --- |
| Local stack, Chrome, Firefox | Ready |
| Migrations | None needed |
| jsDelivr fonts | Mockable: the story serves the npm packages' font files |
| Story flake #120 | Known risk: report every run if it recurs |

## Acceptance

- `git diff origin/main -- src/` is empty.
- The new unit tests and the story phase pass.
- `npm test` and `npx openspec validate --all` pass, and `npm run test:browser`
  on the schedule in Q5.
- `frontend.md` says the font is always fetched, and its Tests bullet names the
  new tests.
- `retrospective.md` records the manual Purpose edit and why.
