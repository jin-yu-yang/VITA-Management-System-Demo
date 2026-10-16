# Retrospective: add-masked-phone-to-board-and-case-pool

> Written: 2026-10-16 (after verify passed with warnings)
> Commit range: `a98f792..` the retrospective commit (base: `main` at the plan commit's parent)
> Worktree: `.claude/worktrees/add-masked-phone-to-board-and-case-pool`

---

## 0. Evidence

- **Commit range**: `a98f792..HEAD`. 10 commits before this file: 7 for the change, 1 merge of `main`, 1 task tick, 1 verify.
- **Diff size**: +1438 / −18 lines across 17 files, against `origin/main` after the merge. Code and tests: +292 / −18 across 8 files (`src/{pool-views,staff-views,supabase-store,views}.mjs`, `tests/{browser,pool-views.test,staff-views.test,store.test}.mjs`). The rest is the change folder.
- **Tasks done**: 12/12.
- **Active hours**: about 8 h of wall time over two sessions. 2026-10-14 (14:43–22:00): planning and apply. 2026-10-16: merge, three browser runs (~2.5 h), verify, retrospective, archive.
- **Subagent dispatches**: 13 (5 implementers, 5 task reviews, 1 final review, 1 fix implementer, 1 fix re-review).
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none. The merge of `main` (#69–#72) had two textual conflicts. Both were resolved by keeping the Phone cell and `main`'s language cell (6cbf268).
- **OpenSpec validate state at archive**: pass (5/5 before archive; see verify §1).
- **Test coverage signal**: unit 923 → 935 on the branch (+12), 1011 after merging `main`. Browser 59/59 (run 6), with one new phase.

Commit chain:

```
51d96f7 Plan add-masked-phone-to-board-and-case-pool (OpenSpec change)
9a406c8 Load each listed case's phone for the masked list column
6d18d9a Show each case's phone masked on the work board
e5ce512 Show each case's phone masked in the case pool
f4f7d83 Browser check: a claim unlocks the board's masked phone in place
318bfd1 DESIGN.md §8: the board and the case pool show masked phones
25cbae1 Final review fixes: wait in the claim phase, observe the realtime keep, trim an empty list phone
6cbf268 Merge main (#69-#72) into add-masked-phone-to-board-and-case-pool
8089863 OpenSpec change add-masked-phone-to-board-and-case-pool: task 4.3 ticked
439b064 OpenSpec change add-masked-phone-to-board-and-case-pool: verify (pass with warnings)
```

---

## 1. Wins

- **[evidence: 6d18d9a, e5ce512, design D3/D5] One rule, reused.** `listPhone` wraps the unchanged `phoneMask` and `canSeeContact`, and the pool imports it. The board, the pool and the case page cannot drift apart, and no second visibility rule exists.
- **[evidence: 9a406c8, tests/store.test.mjs] The read stays narrow.** The new grouped read asks only for `case_id,phone`, and the test pins those columns. No spouse phone, best time or note reaches the list.
- **[evidence: ledger pre-flight scan] The pre-flight scan settled the import-cycle question before Task 1.** `staff-views` never imports `pool-views`. The scan found no rulings needed.
- **[evidence: browser runs 1–6] The new phase was never the failure.** "A claim unlocks the phone on the board in another window" passed in every full run that reached it (8.2–12.0 s).
- **[evidence: 6cbf268] The merge with #70 was clean in meaning.** #70 found the language cell by its `data-languages` markup, not by column position, so the extra Phone column broke none of its tests.

## 2. Misses

- 🟡 **[painful | evidence: verify §2, ledger runs 1–3, runs 4–5] The browser suite is unreliable on this machine.** Five of six full runs failed, each at a different step outside this change: client `fill-fictional`, the staff board count, `choosePersona`, sign-in after Save & exit, and "a long answer redrew the page". Two of them hit the 600 s permutation cap. A baseline on `main` failed too. Closing 4.3 took two sessions and about 2.5 h of reruns.
- 🟡 **[painful | evidence: run 1 (1014 s), run 4 (600 s cap)] The permutations run close to `PERMUTATION_TIMEOUT_MS`.** The clean run 6 took 551 s and 519 s against a 600 s cap. The new phase adds about 10 s, and #72's Form 14446 checks added more on `main`. One slow intake walk is enough to fail a permutation in which every phase passed.
- 📌 **[nit | evidence: ledger, run 1 note] Run 1 during apply ran while reviewers and `npm test` ran in parallel.** That made its result harder to attribute. Later runs were started with nothing else running.
- 📌 **[nit | evidence: design Open Questions] The `staff-case-work` Purpose line still names only the case page.** Owner: the user. Wording only.

### Deferred minor findings from the ledger (the final reviewer triaged them; all kept as they are)

- T1: the phone read runs sequentially, like the other three summary reads (one more round trip).
- T2: the empty-phone unit test matches a bare `<td>—</td>`. The column-order test pins its position.
- T3: the pool's locked-row leak check greps only "555".
- T4a: the watcher window's `context.close()` runs only on the success path.
- T4b: `assertConsoleQuiet` checks the watcher window only. The final "nothing threw" phase covers staff.
- T4's missing `waitForQuiet` was not deferred: it was fixed as F2. No findings were parked.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 4.2 (browser phase) | The final-review fix wave (25cbae1) added a `waitForQuiet` before the Tab step, an observed check of "A realtime update keeps a revealed listed number revealed", and a wait in the claim phase | Ruling after the final review: F1/F2 removed false-failure flakes, and F3 turned a spec scenario checked only by inference into an observed one |
| 2.2 / 3.2 | F4: an empty list phone is trimmed before the "—" check | Final-review minor; one line, with a red→green unit test |
| 4.3 | Ticked only after merging `main` and a third run on 2026-10-16, not during apply | No clean full run existed at the end of apply; the user chose to retry after the merge, up to three times |
| — | Merge of `main` (#69–#72) before verify, not only before archive | `main` moved four PRs, and #70 touched the same rows; merging first meant the browser runs covered the combined code |

### Rulings recorded in the ledger (all of them, in order)

1. **Commit trailers** name the model that actually wrote each commit, not the plan's verbatim Opus trailer.
2. **Who runs the browser suite:** the controller does, in the background, not the implementer, because an 11–16 min run is longer than a subagent command allows.
3. **Final-review minors:** all four (F1–F4) were fixed in one wave (25cbae1) and re-reviewed as ADDRESSED.
4. **4.3 left open (2026-10-14):** no clean full run existed, so the session stopped for the user. On 2026-10-16 the user allowed up to three more runs after merging `main`, and run 6 passed 59/59.

## 4. Skill / workflow compliance

| Skill | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming | ✓ (method in conversation; skill invoked at propose to capture brainstorm.md) |
| superpowers:writing-plans | ✓ (plan.md) |
| superpowers:using-git-worktrees | ✓ (`.claude/worktrees/add-masked-phone-to-board-and-case-pool`) |
| superpowers:subagent-driven-development | ✓ (ledger, pre-flight scan, per-task reviews, final review, one fix wave with re-review) |
| (transitive) superpowers:test-driven-development | ✓ (tasks 1.1, 2.1 and 3.1 wrote failing tests first; F4 red→green) |
| (transitive) superpowers:requesting-code-review | ✓ (final whole-branch review, then a re-review of the fix wave) |
| superpowers:finishing-a-development-branch | ✓ (step 9, after archive) |

### Deliberately Skipped Skills

None. Two deviations from the skills' defaults, both made because CLAUDE.md asked for them:

- **The subagent-driven development workspace was not deleted at its own finish.** CLAUDE.md step 7 needs the ledger for this retrospective. It is deleted right after this file is written.
- **The controller ran `npm run test:browser` itself, not the implementer.** Ruling in the ledger: an 11–16 min run exceeds a subagent command's limit.

## 5. Surprises

- **The environment, not the change, blocked the end of apply.** The plan budgeted one browser run for 4.3. It took six full runs, two single-permutation runs and a baseline.
- **`main` moved four PRs during the pause, and one (#70) rewrote the very cells this change edits.** The conflicts were small, because both sides changed one `<td>` each.
- **The 2026-10-14 baseline on `main` failed before any phase** (`page.goto` timed out). The local app server can be slow to answer on the first window, not only the stack.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **The browser permutations are within ~10% of their 600 s cap; raise the cap or split the story before it fails more PRs.** → **Promote to** one-off follow-up (a direct PR: test-tooling tweak)
  > **Why**: in runs 1, 2 and 4 the 600 s cap failed a permutation whose phases had all passed, or would have. The clean run 6 took 551 s and 519 s.
  > **How to apply**: before the next change that adds a browser phase, check the last green run's permutation times. If either is above ~540 s, raise `PERMUTATION_TIMEOUT_MS` or split the story first.

- [ ] 🟡 **Run the browser suite with nothing else running, and record a `main` baseline before blaming or clearing a change.** → **Promote to** memory (type: feedback)
  > **Why**: run 1 ran alongside reviewers and `npm test` and failed at an unrelated step. Attributing that failure took a baseline and two more runs.
  > **How to apply**: whenever `npm run test:browser` is the gate for a task. Start it only after other test runs and subagents have finished. If it fails outside the change, run one baseline on `main` before more retries.

- [ ] 📌 **Merge `main` before the last browser run of a change, not only before archive.** → **Promote to** one-off (the CLAUDE.md step 8 merge already covers archive)
  > **Why**: #70 changed the same rows during the pause. Running the final browser check on the merged code meant archive needed no second browser run.
  > **How to apply**: when `main` has moved and touches the change's files, merge it before the browser gate.
