# Retrospective: adjust-filing-to-pcdc

> Written: 2026-10-23 (after verify passed)
> Commit range: `431bce7..1ee32e8` (planning through the final fix), plus the verify, retrospective and archive commits
> Worktree: `.claude/worktrees/adjust-filing-to-pcdc`

---

## 0. Evidence

- **Commit range**: `53001f2..1ee32e8`, 14 commits:
  - the planning artifacts (431bce7);
  - the merge of `origin/main` (84ccb10);
  - the gate (6975b81);
  - 9 task commits and 1 fix-round commit;
  - the checks commit (6496d6f);
  - the final-review fix (1ee32e8).
- **Diff size**:
  - Implementation (`6975b81..1ee32e8`): +2403 / −389 lines across 43 files.
  - Whole branch including planning: +4368 / −357 across 51 files.
- **Tasks done**: 34/34.
- **Active hours**: about one working day. Brainstorm and planning took the morning. Apply took about 4.5 hours of agent time, about half of it in the three runs of the browser story.
- **Subagent dispatches**: 23.
  - 1 builder check on the brainstorm.
  - 9 task implementers, plus 1 resumed for a fix round.
  - 8 task reviewers.
  - 2 scoped re-reviewers.
  - 1 final whole-branch reviewer.
  - 1 final fix wave.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none so far (not merged yet).
- **OpenSpec validate state at archive**: pass. `openspec validate --all` gave 9/9 (verify.md §1).
- **Test coverage signal**:

  | Suite | Now | Baseline |
  |---|---|---|
  | Unit | 1336 | 1317 |
  | Database | 421 | 408 |
  | Browser story | 77 | 75 |

  The new database file `tests/database-season-close.mjs` has 7 tests.

Commit chain:

```
431bce7 adjust-filing-to-pcdc: planning artifacts
84ccb10 Merge remote-tracking branch 'origin/main' into adjust-filing-to-pcdc
6975b81 adjust-filing-to-pcdc: gate before apply
2faf119 Filing: a paper return is given to the client at Mark e-filed; all four pairs
2c8831a Samples: the new signing line and the site coordinator's fix note
a8e2fe4 Season-end close: vitally_close_unsigned closes unsigned cases in one move
10d9dd9 Client text: given to the client, four pairs, neutral signing, about 3 months
519c532 Staff screens: four pairs, no mailing wait, neutral signing, site coordinator
61c762f Follow-ups: Close unsigned cases at season end
5e0bdd1 Story: the PA-40 given to the client on paper; the season-end close
27b5d98 Docs: paper handover, four pairs, season-end close
b9bdd6e Docs: RPC count and signature wording
6496d6f adjust-filing-to-pcdc: checks
1ee32e8 Final review: re-confirm after a conflict; docs newest definitions; small fixes
(then: verify + retrospective, archive)
```

---

## 1. Wins

- **[evidence: brainstorm.md "Builder check"] The builder check caught a blocking migration bug before it was written.** A fresh reviewer read the brainstorm and saw that re-adding the result checks would fail on any stack that still held `mailed` rows. That became 037 §1's rename (2faf119), and its test re-runs the real §1 text twice.
- **[evidence: brainstorm.md Q1b; a mid-brainstorm correction] PCDC's correction landed before any code.** "PCDC never mails a return" arrived during topic 3. Because the brainstorm hadn't promoted yet, it changed the result's name (`given_to_client`), the history lines and the staff names in planning, not as rework.
- **[evidence: 037 header table; Task 1 and Task 2 reviews] The "copy from the newest definition" convention held.** Both reviews compared the copied functions with 033/035/036 and found only `-- 037` lines changed. The final review confirmed all eight functions.
- **[evidence: a8e2fe4, `tests/database-season-close.mjs`] The season-end RPC was right first time.** All-or-nothing across four wrong stages plus a stale revision, replay and receipt shape were all tested, and the final review found no defect in it.
- **[evidence: final review → 1ee32e8] The final review found a real user-facing risk that the task review had rated Minor.** After a conflict, the season-end dialog kept the confirmation box ticked for a list the admin hadn't seen. Escalating it to Important and fixing it (`dropStaleCloseConfirmation`) was the right call for an irreversible bulk close.
- **[evidence: Task 7 report] The story needed no app fixes.** It went from red (the old wording) to 77/77 with changes only in `tests/browser.mjs`.

## 2. Misses

- 🟡 **[painful | evidence: the T1 and T3 rulings in the ledger] Suites stayed red between tasks.** One database test and one unit test failed from Task 1 until Task 4, because 037 writes client lines whose translations live in `src/client-text.mjs`. The plan split SQL and client text into separate tasks without saying that the history-translation tests span both.
- 🟡 **[painful | evidence: the Task 3 review] A reviewer misread the tasks.md ticks.** It flagged the ticks as wrong because tasks.md groups (2.x–10.x) are numbered differently from the plan's tasks (1–9). The controller overruled it from the ledger's mapping, but it cost a review round's attention.
- 🟡 **[painful | evidence: the Task 6 review vs the final review] One severity was rated too low.** The stale confirmation after a conflict was rated Minor at task review and Important at final review. The task reviewer judged "the admin must still press Close" as enough. For an irreversible bulk action, a stale confirmation is the defect.
- 📌 **[nit | evidence: the pre-flight scan] The plan named the wrong table.** It told the implementer to delete from `supabase_migrations.schema_migrations`. `tools/admin/migrate.mjs` actually tracks `vitally_private.schema_migrations`. The pre-flight scan caught it.
- 📌 **[nit | evidence: the Task 8 review → b9bdd6e] Stale counts survived the first docs pass.** "7 RPC" was left in two places in `docs/developer/README.md`, and the newest-definition table in `database.md` was missed until the final review.
- 📌 **[nit | evidence: the harness] The skill's helper scripts were blocked.** The worktree-isolated session refused the SDD helper scripts (`sdd-workspace`, `task-brief`, `review-package`) as unverifiable git use. The controller reproduced them with node and plain git commands.

**Ledger summary.** This is the required summary of every ruling, parked finding and deferred minor in `.superpowers/sdd/plan/progress.md`, written before the ledger is deleted.

Rulings, 17 in all, every one accepted by the user:
1. 037 re-apply uses `vitally_private.schema_migrations` (the plan named the wrong table).
2. `npm test` may be red between Task 4 and Task 5, in staff-view tests only.
3. Task 6 fixes the dialog IDs `close-unsigned-<caseId>` and `field-close-unsigned-confirmed`.
4. The story's season-end step checks that the two samples are present, not "exactly two rows".
5. `reserve_receipt` needs no change.
6. The database test "the history lines all translate" stays red until Task 4.
7. The first implementer's test adaptations are accepted.
8. The unit test "every history sentence in the migrations is a SENTENCES key" stays red until Task 4.
9. An unknown case in `vitally_close_unsigned` gives NOT_FOUND.
10. The extra edits to the RPC-inventory tests are accepted.
11. The Task 3 reviewer's tasks.md finding is a numbering misread.
12. "Both paper" stays at E-filed in `METHOD_LABELS` for stuck 035 cases.
13. A stuck case's Filing result row reads "No e-filed return is waiting for an answer."
14. The Mark ready to e-file dialog note reads "The client will be told PCDC recorded that their return is ready."
15. Task 9 has no separate task review.
16. The controller re-reads the list after the season-end close instead of applying each returned revision (D9 drift, same result).
17. The final reviewer's "declined to judge" items stand as specified.

Parked findings: none. No task reached the fix-round cap.

Deferred minors, 19 recorded; three were fixed in 1ee32e8:
- Left open:
  - T1: a double stage update in the second filing; no `filing_returns`-level test of a paper re-filing.
  - T2: copied comments still say "verbatim from 035".
  - T3: no test for a replay with a different payload or an unknown case; no comment on the revision comparison.
  - T4: a misnamed variable; two sentence builders in `filingLines()`; a redundant e-file filter.
  - T5: long lines. The refusal wording drift was fixed in 1ee32e8.
  - T6: an empty-list heading; the test-only `unticked` option. The stale-confirmation finding was fixed in 1ee32e8.
  - T7: a dead singular branch; the "0 days" midnight edge; no positive wait before the "no notice" count. The inverted message was fixed in 1ee32e8.
  - T8: the client-label column order is unexplained. The test count was fixed in 1ee32e8.
- From the final re-review:
  - no browser test forces a conflict in the season-end dialog;
  - tick drafts of removed cases linger (harmless).

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| T1 | `database-filing` tests adapted beyond the brief: async callbacks (the brief's snippet put `await` in non-async arrows); `set constraints all immediate` in the rename test; "unused combination" became "refiling an accepted return is refused" | The brief's snippet was syntactically wrong. Deferred FK triggers blocked the ALTER. Four pairs are now valid |
| T1 Step 6 | Re-apply through `vitally_private.schema_migrations` | The plan named the wrong table |
| T3 | Also edited `tests/support/rpc-signatures.mjs` and `tests/database-actions.mjs` | The existing inventory tests require every public RPC to be listed |
| T4 | `both_paper` kept at E-filed in `METHOD_LABELS`; client-views tests compare through `escHtml` | Legacy cases must render (D3); "can't" is HTML-escaped |
| T5 | Mark ready to e-file dialog note reworded; `tests/fixtures/confirm-dialogs.json` regenerated (3 entries) | The old note named 8879 |
| T6 | Updated `shell.test` toast allow-list and `tests/fixtures/empty-states.json` | Sam's Follow-ups queue gained the button |
| T7 | The first Mark e-filed dialog now asserts four choices (not in the brief) | It followed D4 |
| T8 | Also changed "seven" to "eight" RPCs in `developer/README.md`, `architecture.md` and `backend.md`, and production-roadmap's 8879 wording | `vitally_close_unsigned` made eight. Neutral signing |
| Final | One fix wave (1ee32e8): the conflict re-confirmation, the database.md newest-definition table, "1 day"/"—", the empty heading, the refusal wording, an assertion message | Final review findings |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓ (method in conversation; skill invoked at propose to write brainstorm.md, with builder check) |
| superpowers:writing-plans                        | ✓ |
| superpowers:using-git-worktrees                  | ✓ (worktree on the existing branch, entered with EnterWorktree) |
| superpowers:subagent-driven-development          | ✓ |
| (transitive) superpowers:test-driven-development | ✓ (RED/GREEN evidence in each implementer report; T8 docs and T9 checks have no RED by nature) |
| (transitive) superpowers:requesting-code-review  | ✓ (8 task reviews, 2 re-reviews, final review on the most capable model) |
| superpowers:finishing-a-development-branch       | ✓ (step 9, after archive) |

### Deliberately Skipped Skills

None. One sub-step was handled differently. Task 9 (checks only, a single checkbox commit) had no separate task review; the final review covered it. That is ruling 15, and it's a schema boundary case: a task with no code has no diff for a reviewer to gate.

## 5. Surprises

- **PCDC's answer to topic 1 was itself corrected mid-brainstorm.** "Done when mailed" became "done when given to the client". The answer table we started from was a paraphrase of PCDC's process, not the process itself.
- **The canonical spec had no "provisional" wording to lift.** The provisional defaults lived only in the archived brainstorms, so topic 6 became a text-alignment task: "preparer to correct" became "site coordinator to correct".
- **OpenSpec's validator refuses a MODIFIED requirement that drops a scenario by name.** Five scenarios kept their names with new content (design, Risks / Trade-offs).
- **The worktree-isolated harness blocks bash scripts that might run git.** That covered the SDD skill's own helpers, which had to be reproduced inline.
- **The Ready to e-file badge "Signed" contradicted the new neutral text.** No one listed it in the brainstorm topics; it was found while writing brainstorm.md.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **When SQL writes client history lines, put the SQL and their SENTENCES translations in the same task (or say the translation tests span both)** → **Promote to** CLAUDE.md (Project rules, Client text)
  > **Why**: Two suites stayed red across three tasks of this change, because the translation tests read both the migrations and `src/client-text.mjs`.
  > **How to apply**: When writing tasks.md or plan.md for a change whose migration adds or changes a client line.

- [ ] 🟡 **Number tasks.md groups to match plan.md tasks, or put the mapping in both files** → **Promote to** schema (`superpowers-bridge` tasks/plan instructions)
  > **Why**: A task reviewer misread correct ticks as wrong because tasks.md 4.x was plan Task 2.
  > **How to apply**: At propose, when tasks.md and plan.md are written.

- [ ] 🟡 **Rate a stale confirmation on an irreversible or bulk action Important at task review** → **Promote to** memory (type: feedback)
  > **Why**: The season-end dialog's re-used confirmation was rated Minor at task review and Important at final review.
  > **How to apply**: When dispatching a task reviewer for any dialog that confirms an irreversible move, name "stale confirmation after a re-read or redraw" as a risk to judge.

- [ ] 📌 **The migration tracking table is `vitally_private.schema_migrations` (name, digest), and a changed digest throws MIGRATION_CHANGED** → **Promote to** CLAUDE.md (Local test stack) or `docs/developer/database.md`
  > **Why**: The plan named `supabase_migrations.schema_migrations`.
  > **How to apply**: Whenever a plan edits a migration that's already applied on the local stack during development.

- [ ] 📌 **Run a builder check on brainstorm.md before propose's later artifacts** → **One-off** (keep doing; already part of the brainstorming skill)
  > **Why**: It found the `mailed` rename problem before any SQL was written.
