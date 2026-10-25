# Retrospective: guard-shaded-upload-against-preview

> Written: 2026-10-24 (after verify passed)
> Commit range: `2ba4761..834c0b1` (planning through verify), plus the retrospective and archive commits
> Worktree: `.claude/worktrees/add-preparer-13614c-fields` (shared with `add-preparer-13614c-fields`, PR #98)

---

## 0. Evidence

- **Commit range**: `2ba4761..834c0b1`, 8 commits:
  - planning (2ba4761);
  - 4 task commits;
  - tasks done (227c99e);
  - the final-review fix (0ff8677);
  - verify (834c0b1).
- **Diff size**: implementation, tests and docs come to +455 / −25 lines across 16 files (`2ba4761..0ff8677 -- src tests docs`).
- **Tasks done**: 14/14.
- **Active hours**: about 3 hours of agent time on 2026-10-24, of which about 50 minutes were two browser-story runs.
- **Subagent dispatches**: 11:
  - 4 task implementers;
  - 4 task reviewers;
  - 1 final whole-branch reviewer;
  - 1 final fix wave;
  - 1 scoped re-reviewer.

  No task review needed a fix round.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none so far (not merged yet).
- **OpenSpec validate state at archive**: pass, 10/10 (verify.md §1).
- **Test coverage signal**:

  | Suite | Now | Baseline |
  |---|---|---|
  | Unit | 1418 | 1400 |
  | Browser story | 77 | 77 (the download / upload step now checks the review box, nothing saved before confirm, the hint, and focus after Save) |

Commit chain:

```
2ba4761 guard-shaded-upload-against-preview: planning artifacts
5751833 Shaded upload: no-values refusal, review rows, Preview Producer
bdd32a2 Shaded upload: hold what was read until the preparer confirms
3e86257 Shaded panel: the Preview hint and the review box
a7cd8f6 Story and docs: confirm what the upload read
227c99e guard-shaded-upload-against-preview: all tasks done
0ff8677 Shaded upload: focus returns after Save; only the latest upload is reviewed; docs
834c0b1 guard-shaded-upload-against-preview: verify
(then: retrospective, archive)
```

---

## 1. Wins

- **[evidence: 5751833, ruling P3] Task 1's implementer found a bug that would have hidden the feature.** pdf-lib's default load rewrites the Producer to "pdf-lib", so Preview detection could never have fired. Loading with `updateMetadata: false` fixed it. The test sets a Quartz Producer and loads the copy the same way the browser does.
- **[evidence: bdd32a2, the Task 2 and final reviews] Reusing `saveShadedSection` carried the earlier change's guarantees over unchanged.** These are "Saved", the stale-copy sentence, the case-moved resend and the captured case id (e7db8b4). Both reviews confirmed no path saves a review to another case or saves it twice.
- **[evidence: a7cd8f6] The story checks the database, not just the screen.** Before "Save these values" it asserts that there is no `preparer_shaded_fields` row, then saves and checks the row, "Saved" and the draft.
- **Every task review was clean on the first round.** The planning took about 30 minutes in conversation and settled every wording and placement question beforehand.

## 2. Misses

- 🟡 **[painful | evidence: the final review → 0ff8677] Keyboard focus was lost after "Save these values".** Cancel returned focus to the upload input, but Save didn't. No per-task review caught it, because Task 2 wired focus for Cancel only, and Task 3 didn't own the app wiring. The story now asserts it.
- 📌 **[nit | evidence: the final review → 0ff8677] A slow earlier read could replace a later one.** It is fixed with a per-upload token. There is no automated test, because the race is hard to stage deterministically.
- 📌 **[nit | evidence: the controller's tasks.md edit] I ticked 3.2 one task early.** Its second half (held, not saved) belonged to Task 2. I unticked it before Task 2 ran.
- 📌 **[nit | evidence: Task 1 report] A subagent used `git stash`, which this repo's worktrees share.** The stash list was empty afterwards and nothing was lost. Later dispatches carried "never bare `git stash`".

**Ledger summary.** This is the required summary of every ruling, parked finding and deferred minor in `.superpowers/sdd/plan/progress.md`, written before the ledger is deleted. Nothing was parked.

Rulings, 4 in all:
1. P1. Task 2 wired focus to `#shaded-review-title` before Task 3 drew it. That was a harmless no-op until then, and the final code renders it.
2. P2. tasks.md 3.2's "held, not saved" is covered by the controller test "a reviewed upload is sent only on confirm" plus the story, not by an app-level unit test (app.mjs has no unit harness).
3. P3. `readFilledCopy` loads with `{ updateMetadata: false }` so the Producer survives.
4. P4. The final fix wave covered the focus after Save, the per-upload token and the docs wording.
   - Left: dropping a held review on an editor save. It would add a drop condition not in design D1, and the CONFLICT sentence it leads to is accurate.
   - Left: dropping it on a persona switch or when the case stops being editable. Harmless, because the server guards both.

Deferred minors, all judged fine to leave by the final review:
- **Task 1:** `reviewRows` uses `f.label` (equivalent to `shadedLabel`), and `uploadRefusal` would count keys with undefined values (never produced).
- **Task 2:**
  - Confirm is silent while an editor save is in flight. That is unreachable, since `#app` is inert.
  - A non-CONFLICT failure after confirm needs a re-upload, as in the old flow.
  - A review appearing under a dialog never takes focus.
- **Task 3:**
  - The live region `#shaded-status` is absent during a review. The final review found it is reinserted on the busy render before "Saved".
  - No test checks that the editor and Download buttons stay during a review.
  - The CSS wasn't checked visually; the story passed.
  - The `empty-states.test.mjs` header comment doesn't mention the hint.
- **Task 4:** "Nothing saved before confirm" is proven by row absence only.
- **Final fix:**
  - No test for the token.
  - The focus fallback could, in theory, take focus from outside `#app`.
  - A superseded upload blanks the input's file name.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 1 | `readFilledCopy` loads with `updateMetadata: false` | pdf-lib overwrites the Producer on load (P3) |
| 2 | Sign-out also clears `shadedStatus`. The review-focus block moved before the sidebar peek's focus line | Sign-out: hygiene. Focus block: `tests/shell.test.mjs` requires the peek focus right before `lastPlace = place` |
| 3 | The golden was regenerated with a scratch script | The repo has no regeneration script. A scripted diff confirmed the hint is the only change |
| Final | Focus returns to `#shaded-upload` after Save. A per-upload token added | Final review (P4) |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓ (agreed in chat; recorded by the skill in `brainstorm.md`) |
| superpowers:writing-plans                        | ✓ (`plan.md`) |
| superpowers:using-git-worktrees                  | ✓ (reused the existing change worktree, by the user's choice of the same branch and PR) |
| superpowers:subagent-driven-development          | ✓ |
| (transitive) superpowers:test-driven-development | ✓. The final fix's token has no RED: there is no test seam (§2) |
| (transitive) superpowers:requesting-code-review  | ✓ (final review on Opus) |
| superpowers:finishing-a-development-branch       | ✓ (the push to PR #98) |

### Deliberately Skipped Skills

None.

## 5. Surprises

- pdf-lib's `PDFDocument.load` rewrites the Producer, Creator and dates by default (`updateMetadata: true`), so a reader that never saves still sees pdf-lib's own metadata.
- The repo has no script to regenerate `tests/fixtures/empty-states.json`. Each change rebuilds it by hand and diffs it.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Read PDF metadata with `updateMetadata: false`.** → **Promote to** `docs/developer/frontend.md` (the draft / PDF section)
  > **Why**: Preview detection silently never fired with pdf-lib's default load (5751833).
  > **How to apply**: any code that reads Producer, Creator or dates from an uploaded PDF.

- [ ] 🟡 **When a step replaces the focused control, plan where focus goes for every exit, not just Cancel.** → **Promote to** memory (type: feedback)
  > **Why**: the review box handled Cancel's focus but not Save's. Only the final review caught it (0ff8677).
  > **How to apply**: when a plan adds an in-place step that removes its own buttons on completion, name the focus target for each button in the plan.

- [ ] 📌 **Follow-up: fill a copy in real macOS Preview and upload it.** → **One-off**
  > **Why**: the tests set a Quartz Producer with pdf-lib. Preview's real Producer string, and whether it keeps the Keywords (otherwise the copy is refused as "another case" first), are unverified.
  > **How to apply**: before the M4 demo, on a Mac: download, fill in Preview, save, upload, and check the review box and the Preview warning.

- [ ] 📌 **Add a regeneration script for the empty-states golden.** → **One-off** (a small tooling PR)
  > **Why**: two changes in a row regenerated it by hand.
  > **How to apply**: next time `tests/fixtures/empty-states.json` needs regenerating.
