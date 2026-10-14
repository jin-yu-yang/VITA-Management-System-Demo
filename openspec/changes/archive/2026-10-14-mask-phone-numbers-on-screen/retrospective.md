# Retrospective: mask-phone-numbers-on-screen

> Written: 2026-10-14 (after verify passed)
> Commit range: `fc80386..4c5b545`, plus the verify/retrospective commit and the archive commit
> Worktree: `.claude/worktrees/mask-phone-numbers-on-screen`

---

## 0. Evidence

- **Commit range**: `fc80386..4c5b545`, 6 commits before the verify, retrospective and archive commits.
- **Diff size**:
  - Whole branch: +1450 / −27 lines across 14 files. Most of that is the planning artifacts.
  - Code, tests and docs: +258 / −27 across 7 files:
    - `src/staff-views.mjs` and `src/styles.css`;
    - `tests/staff-views.test.mjs`, `tests/admin-views.test.mjs` and `tests/browser.mjs`;
    - `docs/design/DESIGN.md` and `docs/design/screens/implemented-staff-contact-hidden.png`.
- **Tasks done**: 12/13. 5.3, the PR description, is done at the finish step; see verify.md §2.
- **Active hours**:
  - About 3 hours of session time on 2026-10-13/14: explore and brainstorm, propose, then apply from 01:10 to 01:49 including a 12-minute baseline browser run.
  - About 1 hour on the morning of 10-14: Docker restart, migration 024, fix round, verify.
  - There was an overnight pause, at the user's request, between apply and verify.
- **Subagent dispatches**: 11.
  - 5 implementers: Tasks 1–4 and the user-requested fix round.
  - 4 task reviewers.
  - 1 final whole-branch reviewer, on the most capable model.
  - 1 scoped re-reviewer for the fix round.
  - No task needed a fix round from review, and the breaker never tripped.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none yet (the PR is not merged).
- **OpenSpec validate state at archive**: pass. `openspec validate --all` gives 3/3 valid; the only INFO note is about the existing `client-intake` spec.
- **Test coverage signal**:
  - `npm test` 908/908: 904 before, plus 4 new `phoneMask`/`htmlRow` tests and several rewritten view tests.
  - `npm run test:browser` 57/57 in both pairings. That includes the new before-claim, hover, focus, click-hold, outline and realtime-redraw checks.

Commit chain:

```
b4ee4f8 OpenSpec change mask-phone-numbers-on-screen: planning artifacts
e5b6bb7 Masked phone helper: phoneMask and htmlRow
eca4a37 Case page: phones masked in the contact card and the answers (D5)
4653fac Masked phone: reveal on hover and focus, kept after a click; story checks; DESIGN.md §8
fe781f1 mask-phone-numbers-on-screen: tasks done
4c5b545 Masked phone: light outline while a click holds it; §8 wording; screenshot
<verify + retrospective commit>
<archive commit>
```

---

## 1. Wins

- **The explore step found that D5 was already half enforced.** It found `canSeeContact` already existed and that no list shows a phone. That shrank the change to the case page and kept one rule (`canSeeContact`) with one display helper (`phoneMask`, e5b6bb7), with no second visibility rule.
- **The locked mask can't leak by construction.** `phoneMask`'s locked branch reads only `digits.slice(-4)`. The final review confirmed no path puts the full number in a locked viewer's page or in any attribute, and the unit tests strip SVG paths before scanning attributes (`tests/staff-views.test.mjs`).
- **Realtime redraws keep the reveal for free.** Reading `render()` in `src/app.mjs` while planning showed that focus is restored by element id. Giving revealable masks new ids (`contact-phone` and so on) made realtime redraws keep the reveal with no `app.mjs` change. The story proves it with a real `case_contacts` update (4653fac).
- **The browser checks measure what users see.** They test rendered width (`.phone-full` > 4 px, `.phone-dots` = 0), not `textContent`, because the number is always in the DOM for allowed viewers (design risks).
- **The baseline browser run before any edit (49/4) paid off.** It showed at once that the 4 failures already existed and came from the environment, so Task 3's identical failures were never mistaken for regressions.
- **The plan's complete code let cheap implementers transcribe it.** Every task passed review on the first try (ledger: "review clean" × 4, fix round × 1).

## 2. Misses

- 🟡 **[painful | evidence: baseline log, ledger]** The local test stack was one migration behind `main`: 024 from #65 was not applied. The first browser runs were 49/4 instead of green, and it cost a question, a rerun after `npm run db:migrate:test`, and an overnight wait. Nothing in the workflow checks that the stack's applied migrations match `supabase/migrations/` before a browser run.
- 🟡 **[painful | evidence: plan.md Task 3, docs/setup.md:447]** The plan assumed the story retakes `docs/design/screens/implemented-staff-contact-hidden.png`. In fact it writes only to `artifacts/browser/`. That needed a ruling, a reworded `tasks.md` 4.1, and a later manual copy at the user's request (4c5b545).
- 🟡 **[painful | evidence: ledger "Final" lines]** `tasks.md` 4.4 ("Every phase passes") was ticked while the run was 49/4. It only became literally true after 024 and the 4c5b545 rerun (57/57).
- 📌 **[nit | evidence: 4653fac → 4c5b545]** The first CSS had an outline only on `:focus-visible`, so a number held open by a click had no visual cue, although design D4 asked for a visible outline. The final review caught it, and the fix round added a light `:focus` outline.
- 📌 **[nit | evidence: fe781f1]** One commit carries `Co-Authored-By: Claude Haiku 5.5` while the others carry Opus. The dispatch asked for Opus; the trailer is accurate for the model that made the commit, and it was kept so history wasn't rewritten.
- 📌 **[nit | evidence: Docker]** The overnight pause stopped Docker Desktop, which took the stack down. It had to be restarted before migrating.

### Notes the user asked to record (left as they are, non-blocking)

- **Two phone questions.** The answers panel decides whether a phone row exists with `formatAnswer(question, …)` for that phone's own question (`tp_phone` or `sp_phone`). `phoneMask` then formats both phones with the `tp_phone` question (`PHONE_QUESTION`). They agree today, because both are the catalogue's `phone` type. If `sp_phone`'s catalogue entry ever diverged, the answers panel could show "Not given" where it should show "Not answered". The fix would be for `phoneMask` to take the question, or to format with each phone's own question.
- **A selection is lost on a realtime redraw.** A realtime redraw keeps focus on the mask, so the number stays revealed (spec scenario). But any text the user had selected inside the number is lost, because the page is rebuilt with `innerHTML`. Keeping a selection would need the app's redraw to save and restore selection ranges, as it already does for input carets.

### Other deferred minor findings from the ledger (judged fine to merge by the final review)

- **Task 1:** for allowed viewers, an oddly stored value (e.g. "abc") shows as stored. Locked output uses digits only, and the server validates 10 digits.
- **Task 2:** no unit test for an empty optional spouse phone (no row in the answers, "Not given" in the card). It is the shared fall-through path, already pinned for `tp_phone`.
- **Task 2:** `answersPanelV2` computes `formatAnswer` for phones, then `answerRows` recomputes it on the fall-through path. This was the plan's code and is harmless.
- **Task 3:** no browser check hovers or focuses a locked mask. A locked mask has no `.phone-full`, so a regression in the `:not(.is-locked)` guard could only hide the dots, not leak.
- **Task 3:** the before-claim markup probe covers `#app` only. `<head>` gets only a constant title.
- **Task 3:** hover swaps the dots for the number. A bullet is no wider than a tabular digit, so the box never shrinks out from under the pointer, and there was no flicker in either browser.
- **Task 3:** the redraw check reads its state once, right after `waitForText`. A second redraw would only restore focus again.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 2 Interfaces | "used by Task 4" read as Task 3 | A typo in the plan; Task 3 is the only consumer of the ids (pre-flight ruling) |
| Task 3 Step 6 / tasks 4.1 | The tracked screenshot was not retaken by the story; the 4.1 bullet was reworded; the PNG was later copied by hand in 4c5b545 | The story writes only to `artifacts/browser/` (`docs/setup.md:447`); the user asked for the copy |
| Task 3 Step 6 / tasks 4.4 | The first run was 49/4; green only after migration 024 | The local stack lacked #65's 024; applied with the user's approval |
| Task 4 | 5.2 and 5.3 left open, not ticked with the rest | 5.2 includes writing verify.md (done in step 6, then ticked); 5.3 is the PR body (finish step) |
| (new) Fix round 1, 4c5b545 | Light `:focus` outline plus a story assertion; DESIGN.md §8 first bullet now says "Staff screens…"; screenshot refreshed | The final review's minor findings, which the user chose to fix before verify |

### Rulings recorded in the ledger (all of them, in order)

1. **Plan typo.** Task 2's "used by Task 4" means Task 3. If wrong: nothing.
2. **Held Task 1 until the baseline browser run finished.** The story serves `src/` from the worktree, so edits mid-run would have spoiled it. Cost: about 15 minutes.
3. **No overlapping browser runs.** They share the local stack. If wrong: nothing.
4. **Asked the user before applying 024 to their stack**, and dispatched Tasks 1–2 meanwhile. If wrong: one question. The user approved it the next morning.
5. **Dispatched Task 3 without 024.** The known failure is in the story's last phase, after every phase this change touches. Cost: a second browser run, which happened in 4c5b545.
6. **Didn't commit the screenshot in Task 3.** It is written only to `artifacts/browser/`. Superseded: the user asked for the copy (4c5b545).
7. **Task 4 left 5.2 and 5.3 open.** They belong to verify and finish. If wrong: nothing.
8. **Reworded the screenshot bullet in `tasks.md` 4.1.** This kept the ticked item truthful. Cost: one wording change.
9. **Kept fe781f1's `Claude Haiku 5.5` trailer.** It is accurate, and changing it would rewrite history. Cost: one inconsistent trailer.
10. **Left 4.4 ticked rather than running a fix round to untick it.** verify.md records the 49/4 → 57/57 history. Cost: the checkbox overstated the result until 4c5b545.

There were no parked findings: no task reached the five-round breaker. The final review triaged every deferred minor as fine to merge, and the user chose to fix three of them (fix round 1).

## 4. Skill / workflow compliance

| Skill | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming | ✓ (method in conversation; skill invoked at propose to capture brainstorm.md) |
| superpowers:writing-plans | ✓ (plan.md) |
| superpowers:using-git-worktrees | ✓ (existing branch checked out into `.claude/worktrees/…`, entered with the native tool) |
| superpowers:subagent-driven-development | ✓ (ledger, pre-flight scan, per-task reviews, final review, one fix round) |
| (transitive) superpowers:test-driven-development | ✓ (RED then GREEN evidence in each implementer report) |
| (transitive) superpowers:requesting-code-review | ✓ (final whole-branch review with code-reviewer.md) |
| superpowers:finishing-a-development-branch | ✓ (step 9, after archive) |

### Deliberately Skipped Skills

None. Two deviations from the skills' defaults, both made because CLAUDE.md or the user asked:

- **The subagent-driven development workspace was not deleted at its own finish.** CLAUDE.md step 7 needs the ledger for this retrospective; it is deleted right after this file is written.
- **Apply stopped before verify for an overnight pause.** That was the user's instruction.

## 5. Surprises

- **D5 was already half built.** "Masking" turned out to mean loosening one case, since unallowed viewers now see the last four digits, and tightening another, since allowed viewers now see a mask first. That's not a new access rule. The disclosure is written down in design.md as accepted.
- **No list shows a phone**, although D5 and DESIGN.md §8 were written about lists. §8's first bullet now says "Staff screens…".
- **Playwright counts a 1-px sr-only box as "visible"**, so the visibility checks had to measure rendered width.
- **The test count changed from 53 to 57** once the environment was fixed. The failing phase had stopped its own remaining steps, so the earlier total under-counted.
- **The local stack drifted from `main`** without any signal until a browser assertion failed.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Check that the local stack's applied migrations match `supabase/migrations/` before a browser or database run** → **Promote to** project CLAUDE.md ("Verification" bullet) or a guard in `tools/admin/migrate.mjs` / the story's setup
  > **Why**: in this cycle 024 from #65 was on `main` but not applied locally, which produced 4 misleading failures and cost an extra 12-minute run.
  > **How to apply**: before `npm run test:browser` or `npm run test:database`, compare `vitally_private.schema_migrations` with the files in `supabase/migrations/`. If any are missing, run `npm run db:migrate:test` (with the developer's OK) first.

- [ ] 🟡 **The story's screenshots go to `artifacts/browser/`; tracked `docs/design/screens/implemented-*.png` are refreshed by hand** → **Promote to** memory (type: project) or `docs/setup.md`'s screenshot paragraph
  > **Why**: the plan assumed the story would retake a tracked design screenshot, which forced a ruling and a later manual copy.
  > **How to apply**: when a plan changes a screen that has an `implemented-*.png`, add an explicit step to copy the matching-width artifact (from the Chrome-staff pairing) over the tracked file after a green run.

- [ ] 📌 **Run a baseline browser run before the first edit when a change touches the story** → **Promote to** memory (type: feedback)
  > **Why**: the 49/4 baseline made the environment failure obvious and kept Task 3's identical result from looking like a regression.
  > **How to apply**: at apply start, in the worktree, run `npm run test:browser` once in the background before dispatching Task 1, and hold edits to `src/` until it finishes.

- [ ] 📌 **A redraw that keeps focus by id still loses a text selection** → **One-off** (recorded above as a non-blocking note)
  > **Why**: it only matters to someone selecting a revealed number at the moment a realtime update lands. Fixing it belongs to the app's redraw machinery, not to this change.
