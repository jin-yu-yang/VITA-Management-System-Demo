# Retrospective: add-exit-form-pdf

> Written: 2026-11-03 (after verify passed with warnings, before archive)
> Commit range: `7831621..3bcb9e4`, plus the commit that adds this file, the archive and the Purpose edit
> Worktree: `.claude/worktrees/add-exit-form-pdf`

---

## 0. Evidence

- **Commit range**: `7831621..3bcb9e4` (11 commits)
- **Diff size**: +1132 / -8 lines across 14 files. No file under `src/`, `server.mjs` or `supabase/`
- **Tasks done**: 13/13
- **Active hours**: about 2.5 (includes three story runs of about 15–23 minutes each)
- **Subagent dispatches**: 15: 4 task implementers and 2 later fixers, 4 task reviews, 3 scoped re-reviews, 1 final review, and the fix round resumed one implementer
- **New external dependencies**: none (`pdfjs-dist` was already a dev dependency)
- **Bugs encountered post-merge**: not merged yet
- **OpenSpec validate state at archive**: pass at verify (11/11); checked again at archive
- **Test coverage signal**: `npm test` 1475 → 1489. `test:browser` 79 → 81 (one phase per browser order)

Commit chain:

```
81479e9 Plan the add-exit-form-pdf OpenSpec change
81017bc Exit Form: test long Remarks and the template's document info
c0fd2ff Exit Form: pin the staff-only wiring and the office panel's choice of approval
3b1609e Browser story: press Download Exit Form, its failure and retry, and a blocked tab
ea16f3d Docs: every Exit Form fetches the font, and which tests cover it
517ad01 Browser story: the Exit Form's failure is the case page's error notice
bf49082 add-exit-form-pdf: tick the tasks, and say the case page's error notice
e071229 Exit Form tests and docs: the blocked-tab link's real place, bold and sizes, and the office panel's choice
0ca5086 add-exit-form-pdf: record the blocked tab's link, the small debit date and what is really drawn
7dc20b9 Exit Form tests and docs: starting sizes, a name Helvetica can't draw, and the font sentence
3bcb9e4 add-exit-form-pdf: bold depends on what Helvetica can draw, and every value can shrink
```

---

## 1. Wins

- [evidence: `tests/browser.mjs`, the Exit Form phase] The button is now pressed by an automated test, in the one engine that can read the result, including its failure and blocked-tab paths. Before this, only one-off scripts had pressed it, and only on #115's branch.
- [evidence: `tests/exit-form.test.mjs`, `remarksLine`] The Remarks tests read what the page really draws through pdfjs, in English and Chinese, rather than the marks.
- [evidence: final review, confirmed in live Chrome] Reviewing the spec against the code found what no earlier step did. Writing behaviour down as requirements exposed real problems in a feature that had merged: the invisible link and the 6.5 pt debit date. Both are now in #122 with the Remarks cut and the font failure.
- [evidence: `git diff origin/main -- src/` empty] The change kept to "no behaviour change" throughout.
- [evidence: `verify.md` section 8] The permission question was answered with a real account, in the browser, not by reading code.

## 2. Misses

- 🔴 [blocking | evidence: `spec.md` at `81479e9`, `3b1609e`] **Requirements were written from the docs and a reading of the code, without pressing every path first.** The first spec said the page "offers" the link and named a "problem banner". Neither matched what a person sees. The worst of it: story run 2 passed 81/81 with a check that accepted a link nobody could see. Only the final review caught it, and I had already reported that check as evidence.
- 🟡 [painful | evidence: runs 1–3] A linear 20-minute story is the only way to run a browser phase, so an error in one selector cost a full run.
- 🟡 [painful | evidence: `spec.md` corrections in `bf49082`, `0ca5086`, `3bcb9e4`] The spec was corrected three times after planning review. Each correction made it truer, but "bold and larger" and the "Chinese" exception were stated confidently and wrong. Measuring them during propose would have taken minutes.
- 📌 [nit | evidence: `81017bc`, `ea16f3d`] Commit trailers differ: some name the subagent's model. Left as they are.
- 📌 [nit | evidence: `tests/exit-form.test.mjs`] The 2000-character Chinese cut test takes about 14 seconds, because the cut re-measures at every step. It adds to every `npm test`.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 2.2 | `.problem-banner` became `.notice.error`, and the spec says "error notice" | The staff case page deliberately draws `problemNotice` instead (`src/views.mjs`). Run 1 failed on it |
| 2.3 | The blocked-tab check asserts the link is hidden on Overview and visible on Intake answers | The final review, confirmed in Chrome. User chose option A: record as a known problem, don't fix `src/` first |
| 3 (controller) | Task 3's story run and Task 4's final checks were run by the controller | A foreground command can't last 20 minutes; `npm test` during the story could disturb it |
| not in plan | More unit tests: starting sizes, a name Helvetica can't draw, the office's "no questionnaire" cases, a volunteer not on the case, the link's 60 seconds | The final review; the spec states each of these |
| not in plan | A second, small fix pass after the one fix wave SDD allows | A spec sentence that isn't true defeats this change, so it wasn't parked |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓ (the method in the conversation, then the skill for `brainstorm.md`) |
| superpowers:writing-plans                        | ✓ |
| superpowers:using-git-worktrees                  | ✓ |
| superpowers:subagent-driven-development          | ✓ |
| (transitive) superpowers:test-driven-development | ✓ adapted: characterisation tests pass at once, so red means breaking an expected value. The story's red step was by reasoning |
| (transitive) superpowers:requesting-code-review  | ✓ |
| superpowers:finishing-a-development-branch       | at lifecycle step 9, after this file |

### Deliberately Skipped Skills

None skipped. One sub-step was replaced: SDD's helper scripts (`sdd-workspace`, `task-brief`, `review-package`).

- **`subagent-driven-development` helper scripts**
  - **What was skipped**: running the three scripts. Their work was done by hand with plain commands, into the same `.superpowers/sdd/plan/`.
  - **Why this cycle**: the harness's worktree isolation check refused `bash <script>` ("this command runs bash in a plain command").
  - **How to prevent recurrence**: one-off, schema boundary case: this is the harness's rule, not the schema's. It only arises when the session has entered a worktree with `EnterWorktree`. If it recurs, promote it (see section 6).

## 5. Surprises

- A blocked tab gives no error and no visible link, and the button appears to do nothing. The Form 14446's link is visible because its button is on the same tab as the link; the Exit Form's isn't.
- The staff case page never draws `.problem-banner`, though the Form 14446 check in the same file uses it. That check runs on a client page.
- Bold isn't about Chinese. Any character Helvetica can't draw, such as "ễ", moves the whole value into the unbolded font. A client named Nguyễn gets a different-looking form from a client named Tran.
- A full debit date is always 6.5 pt: its place is too small for 9 pt.
- A volunteer not on the case sees less than expected in one way (no link), but no less client data: the name, the number and the Exit Form content were already on their page.

## 6. Promote candidates → long-term learning

- [ ] 🔴 **A requirement that records existing behaviour needs each path pressed before it is written** → **Promote to project CLAUDE.md** (Specs section)
  > **Why**: this change's spec said "offers a link" and a story test agreed, while a person saw nothing. Docs and code-reading gave the wrong answer.
  > **How to apply**: on any change that documents already-built behaviour, run the real path during propose and write what happens.

- [ ] 🔴 **A browser test of something a person must see asserts visibility, not presence** → **Promote to memory** (type: feedback)
  > **Why**: `#draft-ready a` existed inside a hidden panel, and the check passed 81/81.
  > **How to apply**: when a story phase checks a link, button or message, use `isVisible()` or a Playwright `visible` wait, and read the screenshot once.

- [ ] 🟡 **SDD's helper scripts don't run after `EnterWorktree`** → **Promote to skill or harness feedback**
  > **Why**: the isolation check refuses `bash <script>`, and the work had to be done by hand.
  > **How to apply**: if it recurs in the next apply, raise it upstream, and meanwhile create the workspace by hand.

- [ ] 📌 **A story phase could run alone** → **One-off** (a test-tooling idea, not a rule)
  > **Why**: one wrong selector cost a 20-minute run, because the story is linear.
  > **How to apply**: consider it if browser test work keeps coming.

---

## Ledger summary

The ledger isn't kept. These are all the rulings, parked findings and deferred minors it recorded.

### Rulings

| Ruling | Cost if wrong |
|---|---|
| SDD's helper scripts weren't run; their work was done by hand, in the same folder | Naming only |
| Task 3's red step is by reasoning, not another 20-minute run | An assertion that can't fail could slip through; reviewers checked each one |
| The workspace stays until step 7, and SDD's finish doesn't run (per `CLAUDE.md`) | None |
| The "Haiku" commit trailers stand; they name the model that committed | Non-uniform trailers |
| Task 1 reviewer's unverified items were resolved by existing tests: blank author and one page ("the filled PDF is one page with a blank author"), exact name (`tests/server.test.mjs`) | "Bold and larger" had no test; the final review found that, and it's fixed |
| The controller runs the story, and failures go back in a fix round | None seen |
| "A client window makes nothing" rests on Task 2's source pin | A regression in both the guard and the views goes unnoticed; the pin catches either |
| Task 4's final checks ran after the story | Ordering only |
| "Problem banner" became "the case page's error notice" in the spec and plan | None: it records what the code does |
| The final review's residual findings were fixed, not parked, with a small second pass | One more small review |

**The user's decisions during apply:** blocked-tab link, option A (known problem in #122, tests assert what happens). The debit date's 6.5 pt goes in #122. Permission: check first; everything was already visible, so no new issue, and `verify.md` says so.

### Parked findings

None.

### Deferred minors

| Minor | Outcome |
|---|---|
| Build setup repeated in the Exit Form tests | Left; a helper was added when the new tests repeated it further |
| Commit trailers name different models | Left |
| The source pin's end marker is a comment string | Left: a rewording fails the pin loudly |
| The controller allow-list needs updating for a new read-only call | Left: that's its purpose |
| Story's date check matches the shape only | Fixed another way: `isoToday()` source pin |
| The phase doesn't assert the failure isn't toasted | Left: the spec doesn't promise it |
| The blocked-tab link stays until the next navigation | Left: harmless |
| The Tests bullet doesn't mention the panel's approval choice | Left: the bullet is still true |
| Failed tab's title is "Draft 13614-C" | In #122 |
| A long name shrinks too; "報稅年度 Tax Year:" is 18 pt, larger than its value | Left: the spec now says every value can shrink, and only the 12 pt English labels |

## The Purpose edit, by hand

The `review-and-corrections` Purpose is edited **by hand at archive**: one sentence saying it also covers the Exit Form PDF built from the reviewer's answers. It's manual because a delta spec can merge requirements but can't change a Purpose, and without the sentence the Purpose wouldn't cover part of the capability. This is the only change to the canonical spec that doesn't come from the delta.
