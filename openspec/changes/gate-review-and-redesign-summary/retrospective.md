# Retrospective: gate-review-and-redesign-summary

> Written: 2026-10-14 (after verify passed with warnings)
> Commit range: `3e69e58..36fc7ab` (11 commits after the proposal; this retrospective and the archive follow)
> Worktree: `.claude/worktrees/gate-review-and-redesign-summary` on branch `gate-review-and-redesign-summary`

---

## 0. Evidence

- **Commit range**: `3e69e58..36fc7ab`, 11 commits: 6 implementation, 1 review fix, 4 task-tick bookkeeping. The proposal commit `3e69e58` sits on `main` a98f792.
- **Diff size**:
  - implementation (`3e69e58..36fc7ab`): 18 files, +780 / −223 lines;
  - branch total (`a98f792..36fc7ab`): 24 files, +2832 / −206 lines, including the planning artifacts.
- **Tasks done**: 17/17 across five task groups. Group 1 gained item 1.5 (`guardSubmit`) at the planning review.
- **Active hours**: about 5 on 2026-10-14. That covers the propose run, three planning-review rounds (the Form steps wording, the `optional.questions` fixture and the count, and `guardSubmit`), apply with two story runs, verify and this retrospective.
- **Subagent dispatches**: 16 in total.
  - 1 read-only explore of the review-step code at propose;
  - 5 task implementers (Sonnet ×3, Opus for the story, Haiku for the docs);
  - 1 resumed implementer for a fix round;
  - 5 task reviewers (Opus ×2, Sonnet ×3);
  - 1 scoped re-review;
  - 1 final whole-branch review (Opus);
  - 1 final fix wave and its scoped re-review.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none yet (not merged).
- **OpenSpec validate state at archive**: pass at verify, 4/4.
- **Test coverage signal**:

  | Suite | `main` | This branch |
  |---|---|---|
  | unit | 923 | 934 |
  | story | 57 | 57, passed on both runs (791 s, then 777 s after the fix wave) |
  | database | 250 | not run: no database change |
  | sign-in | 20 | not run: no sign-in change |

Commit chain:

```
3e69e58 Propose gate-review-and-redesign-summary (planning artifacts)
4d3805c Gate the review step: 9.2 needs no alerts, 9.3 needs Continue on 9.2 (+ guardSubmit)
f67f1e0 Move Continue from the resolved place, so a stored unearned review.submit still advances
8f1638a Tasks: check off group 1
99fcc8c Disable 9.1's Continue while an alert remains; drop 9.3's alert notice
521eae7 Tasks: check off group 2
9b3f658 Redesign the summary page: intro, tools first, collapsible sections that always print
962482e Tasks: check off group 3
d202733 Story: walk the review gate and the new summary page
8070a8c Docs: the review gate and the summary's sections
0cbbd38 Tasks: check off groups 4 and 5
36fc7ab Keep the review step's rail mark blank until submission; final-review doc fixes
(archive commit follows)
```

---

## 1. Wins

- [evidence: 4d3805c, `src/intake-form.mjs` `substepVisible`] **One rule controls the gate.** It went into sub-step visibility, so the rail, the "Part n of N" count, Continue and Back, rail jumps, Change and Back to summary all follow it. Decision Q2-A (send a client on a gated page back to 9.1) needed no code of its own: the existing resolve already does it.
- [evidence: `reviewAlerts`; `alertsOf`; `substepStatus`; `guardSubmit`] **One alert list.** The 9.1 list, the gate, the review mark and the Submit guard now share one list instead of three copies.
- [evidence: `tests/controller.test.mjs` `guardSubmit: …`, `tests/shell.test.mjs` guard pin] **The guard got a real test.** The planning review asked whether the redirect check the story lost could be tested another way. Moving the guard's decision into the controller gave it a unit test of the stale-page race (a missing answer alone, then missing plus invalid), plus a source pin for the app wiring. Before this change the redirect had only the browser check.
- [evidence: story runs 1 and 2] **The story passed first time.** It went 57/57 on the first run after Task 4. The careful brief (exact story code, named helpers, the save-timing rule) and an Opus implementer for the story avoided the usual one or two story iterations.
- [evidence: final review, 36fc7ab] **The final review caught something client-visible.** It found the rail marking "Review & submit" Done before anything was submitted. That came from the plan's own test, and the per-task reviews had only rated it a minor. On a form real clients will use from November 2026, that mark could make someone think they had already applied.
- [evidence: planning review rounds] **The planning reviews changed the design before code was written:**
  - "Form steps" turned out to be a screen-reader-only label, so the intro's wording was changed before any code;
  - the fixture was named directly (`optional.questions`);
  - an exact expected unit count went into the plan, which made the docs update checkable;
  - `guardSubmit` was added.

## 2. Misses

- 🟡 [painful | evidence: Task 1 review, f67f1e0] **The plan's `moveSubstep` mixed the resolved and the raw place.** It checked the earning condition against `currentSubstep()`, but computed the target from the raw `state.formSubstep`. So Continue on 9.2 did nothing when the saved place was an unearned `review.submit`, which can happen after a failed save and a reload, or with an old window session. The per-task Opus review caught it, and it cost one fix round.
- 🟡 [painful | evidence: Task 1 test at `tests/intake-form.test.mjs` ~544, final review, 36fc7ab] **The plan didn't think through what the new visibility does to the step-level mark.** It asserted that the review step rolls up to Done with 9.1 and 9.2 visited. That was new behaviour, and it contradicts the historical rule that review.submit stays blank until submitted. The per-task reviewer flagged it as a minor and the final review raised it to Important. Fixing it took a second story run.
- 📌 [nit | evidence: ledger rulings at lines 37 and 46] **The unit count in the plan was off twice.** The plan said 932, ignoring the extra client-language test that Task 1's brief allowed and the fix-round test. The controller corrected it twice (933, then 934) before Task 5.
- 📌 [nit | evidence: story run 0] **The first story attempt failed at once on `.env.test: not found`.** The worktree had no copy of the untracked env file, and it needed a link from the main checkout, as `node_modules` does.
- 📌 [nit | evidence: Task 2 review] **An accidental edit.** Task 2 dropped the space in `"alert.missing":{`, an unrelated line. The fix rode along in Task 3.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 1 (step 7) | `moveSubstep` takes `const from = currentSubstep()` and uses it for both the earning check and `adjacentSubstep`. It also returns early while a save is in flight. Added a controller test for a stored, unearned `review.submit` (f67f1e0). | The plan's code made Continue on 9.2 do nothing in that state (Task 1 review, Important; ruling in the ledger). |
| 1 (step 10) | Added a client-language assertion that the "nothing answered in a part" state has no alerts and shows 尚未回答任何问题。. Removed the old shell assertion that pinned `goToSubstep("review.check")` in app.mjs. | The assertion is the one the brief asked for. The removed pin's behaviour moved to `guardSubmit`, which the new guard pin and the controller test cover; the Task 1 reviewer agreed the coverage is equivalent. |
| 1 / final | `stepRollup` returns `"none"` for the review step, and the Task 1 assertion was flipped to expect `"none"` (36fc7ab). | The final review's Important finding. It restores the behaviour from before this change; ruling in the ledger. |
| 4 | The story's now-unused `toast` helper was removed, and the comment above `V2_WALK` was updated. | Its only use was the guard-redirect check the plan removed. |
| 5 | Expected unit count 934, not 932. The setup.md text now says which counts this change verified (unit and story) and which still come from `add-unmarried-intake-wording` (database and sign-in). | The extra tests above; final-review minor. |
| final | Rewrapped three long lines (the frontend.md API list and gate bullets, and the `summarySection` comment). The `guardSubmit` test gained a check with a missing answer alone. | Final-review minors, folded into the single fix wave. |

## 4. Skill / workflow compliance

| Skill | Used |
|-------|------|
| superpowers:brainstorming | ✓ (the design was agreed in conversation in step 2; propose ran the skill to write `brainstorm.md`) |
| superpowers:writing-plans | ✓ (`plan.md`, written into the change folder) |
| superpowers:using-git-worktrees | ✓ (`.claude/worktrees/gate-review-and-redesign-summary`, plus `EnterWorktree`) |
| superpowers:subagent-driven-development | ✓ (ledger, per-task review, final review, one fix wave) |
| (transitive) superpowers:test-driven-development | ✓ (each implementer reported RED and GREEN; one process gap, see below) |
| (transitive) superpowers:requesting-code-review | ✓ (per-task reviews, and the final review with code-reviewer.md on Opus) |
| superpowers:finishing-a-development-branch | ✓ at lifecycle step 9 (push and PR, after this archive) |

### Deliberately Skipped Skills

None. One TDD process gap is recorded as a deferred minor: `guardSubmit`'s RED step failed at an earlier shared assertion, not at "guardSubmit is not a function", because its test was written in the same pass as the gate test. Coverage is unaffected.

## 5. Surprises

- **A hidden page can still hold the saved place.** `state.formSubstep` keeps a hidden sub-step's id, and only the view resolves it. Any function that both reads the resolved place and computes from the raw one is wrong once visibility depends on more than the answers (Task 1 fix).
- **Adding a visibility condition changes rollups as well as lists.** Making 9.3 conditional removed the one sub-step that had always kept the review step's mark blank (36fc7ab).
- **The browser's own print command prints nothing of the app.** The generic print rule at `styles.css:2010` hides `#app > *` unless a modal is open. Only the Print button brings the summary back. This was found at the planning review.
- **The Submit guard's redirect is only reachable through a race.** It needs a pointer press that lands on a page drawn before another device's change. That is why its decision moved into the controller, where a unit test can reach it.

## Ledger summary (rulings, parked findings, deferred minors)

From the SDD ledger (`.superpowers/sdd/plan/progress.md`), before it was deleted.

**Rulings:**
1. **Continue moves from the resolved place** (Task 1, plan-mandated Important). Use `currentSubstep()` for both the earning check and the target, and add a test. Cost if wrong: none, because `adjacentSubstep` already re-resolves.
2. **Keep Submit's `alerts.length > 0` disabled clause.** It can't be reached at render now, but design D5 keeps it as a defence for a stale page. Cost if wrong: one dead condition.
3. **Expected unit count 933, then corrected to 934.** The extra client-language test and the fix-round test. Cost if wrong: Task 5 explains any difference (it matched 934).
4. **The review step's rail mark stays blank until submission** (final review, plan-mandated Important). Use `if (stepId === "review") return mark("none")`, and flip the test. Cost if wrong: if the user wants a Done mark there, it's a one-line revert.

**Parked findings:** none. No fix loop reached its cap.

**Deferred minors** (none blocks merge; the final review triaged them):
- The rail's 9.2/9.3 entries and the part count refresh only at the next render, not while typing. The design's Risks section already records this.
- No unit test that `#continue-blocked` is absent or present while busy or in conflict.
- `guardSubmit` returns false without reaching 9.1 if `goToSubstep` returns early (save in flight, or the form closed). The app then focuses `#main`, and nothing is submitted.
- The section toggle's `aria-label` "Show or hide {section}" replaces the visible title in a headings list, and `aria-expanded` already gives the state. This is for the accessibility and wording review.
- Story nits:
  - two back-to-back `jump("review.check")` calls;
  - `chip()` read without `waitForQuiet` (an existing pattern);
  - the order check matches by className;
  - the `intake_visited` read at about line 3582 could use a comment.
- Collapse all's id collection and the persistence of folds across moves have no unit test. The story covers both.
- **Final-review follow-ups:**
  - the `confirmed` box survives an alert round trip (it is still ticked after a fix);
  - the gate is recomputed about 12 times per render (optional: compute it once per view);
  - a presenter's earned 9.3 lasts only until a reload;
  - a realtime fix from another device silently moves 9.1 back to 9.3 without placing the keyboard.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **When a plan makes visibility depend on visits, every move must start from the resolved place, and every rollup must be rechecked** → **Promote to memory** (type: feedback)
  > **Why**: in this change the plan computed Continue's target from the raw saved place (f67f1e0), and the review step's rollup started reading Done (36fc7ab). Both were plan-mandated, and reviews caught both.
  > **How to apply**: when a plan changes `visibleSubsteps` or `substepVisible`, list every caller that reads `state.formSubstep` raw, and every rollup or count over visible sub-steps (`stepRollup`, the rail count, `firstUnfinishedSubstep`). Say in the plan what each does in the newly hidden case.

- [ ] 📌 **A change worktree needs `.env.test` linked, like `node_modules`, before the story or database suites run** → **Promote to memory** (update `worktree-git-commands`)
  > **Why**: the first story run failed at once (`.env.test: not found`). The env file is untracked, so `git worktree add` doesn't bring it.
  > **How to apply**: at worktree setup, link both `node_modules` and `.env.test` from the main checkout. Neither link is ever committed.

- [ ] 📌 **Count the extra tests a brief allows when stating an expected unit total** → **One-off** (recorded here)
  > **Why**: the plan's 932 ignored a brief-allowed extra test. The ledger rulings corrected it twice. The real fix is to state the count per task, which Task 5's brief already did for the final total.
