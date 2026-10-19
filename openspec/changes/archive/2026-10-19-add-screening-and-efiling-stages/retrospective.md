# Retrospective: add-screening-and-efiling-stages

> Written: 2026-10-19 (after verify passed with warnings)
> Commit range: `b27643b..1922105` (the planning commit 8c1a593, then the implementation)
> Worktree: `.claude/worktrees/add-screening-and-efiling-stages` (branch `add-screening-and-efiling-stages`)

---

## 0. Evidence

- **Commit range:** `b27643b..1922105`, 21 commits:
  - 1 planning;
  - 13 implementation and fix: 8 tasks, 2 Task 3 fix rounds, 1 Task 7 fix round, and 3 final-wave commits;
  - 6 `tasks.md` ticks;
  - verify, retrospective and archive commits still to come.
- **Diff size:**
  - +5217 / −290 lines across 61 files, including the change folder;
  - +2909 / −306 across 55 files for the implementation alone (`8c1a593..1922105`).
- **Tasks done:** 16/16.
- **Active hours:** about 2.5 h of apply and verify (2026-10-18 ~23:10 to 2026-10-19 ~01:40), plus the planning sessions on 2026-10-18.
- **Subagent dispatches:** 22, plus 4 resumes for fix rounds:
  - 9 implementers (8 tasks and the final fix wave);
  - 8 task reviews;
  - 4 scoped re-reviews;
  - 1 final whole-branch review;
  - 1 pre-apply Sonnet recheck of the artifacts.
- **New external dependencies:** none.
- **Bugs encountered post-merge:** none yet (not merged).
- **OpenSpec validate state at archive:** pass (6/6 before archive).
- **Test coverage signal:**
  - unit: 1120 → 1160 (+40);
  - database: 272 → 282 (+10, mostly `tests/database-stages.mjs`, plus existing chains now going through `START_SCREENING`);
  - browser story: 61 → 63, with 63/63 at aa6e056 and again at 1922105.

Commit chain (in order):

```
8c1a593 OpenSpec change add-screening-and-efiling-stages: planning artifacts
5139001 Migration 032: screening, ready to e-file and e-filed; the intake check waits for screening
50790b9 Stages: twelve keys, staff names, client labels and messages, and the new history lines
426ecae An admin's first open of a Request sent case starts screening, quietly and once
c884130 Screening start: resend after the admin's own action, let a press wait for the start, tighter tests
0b73991 A press that waits for the screening start is dropped if its case is left, and a second press is ignored
7036a3e tasks.md: groups 1–3 done
e1ba63a The case pages: intake checks during screening, and the e-file marks behind their confirmations
aaca54e tasks.md: group 4 done
5dd23d2 Follow-ups and the case pool show screening, signing and e-filing
9a0fd67 tasks.md: group 5 done
ae77052 The client's page: five steps, their own labels, and the signing and filing messages
3aba1ae tasks.md: group 6 done
8752dc9 Docs: the lifecycle diagram's screening box and wording, and the new stages and actions
771fe1a Docs: the roadmap and narration now match the new stages
4a5ad4e tasks.md: group 7 done
aa6e056 Story: screening on open, a second admin window, and the office records signing and e-filing
b9a8565 tasks.md: group 8 done
1a584ac Controller: retry the quiet screening start when a contact or assistance write settles
90f1774 Docs: adminEligibility, story and unit counts, and "no eligibility screening"
1922105 Docs: the frontend guide's unit count is 1160
```

---

## 1. Wins

- **The pre-apply recheck caught two blocking plan defects before any code was written.**
  - The plan's migration had `begin;`/`commit;`, though `tools/admin/migrate.mjs` already wraps every file in one transaction.
  - A reload never started screening, because the start sat outside `load()`.
  - Both were fixed in plan.md; 5139001 has no transaction statements, and 426ecae calls the start from `load()`.
- **The recheck also exposed a list-row vs full-case shape problem.** Follow-ups renders list rows, which carry no `reviews`, so the reviewer's-call check would never have shown there. The plan gained a `reviewContactStatus` list summary (5dd23d2). The final review confirmed that the database, the list row and the case page agree on every call-status combination.
- **Migration 032 needed no fix.**
  - It is copied function by function from each function's latest definition, with only `-- 032` lines changed. The Opus Task 1 review confirmed this by diff.
  - The dry run in `begin … rollback` passed every check: twelve stages; definer rights; grants; the intake check refused at Request sent; one start; the call gate both ways; rollback clean.
  - `test:database` passed 282/282 on its first run.
- **The browser story passed 63/63 on its first run at aa6e056.** Task 8 ran on Opus with a notes file collected from Tasks 2, 5 and 7 (`task-8-notes.md`): the old texts with their line numbers, and the project's story-writing rules. It passed again at 1922105.
- **Out-of-list edits that a test forced were caught and ruled on, not reverted.**
  - Task 1 added `SENTENCES`, which the migration-sentence test requires.
  - Task 2 added `EVENT_SENTENCES`, which the one-sentence-per-action test requires.
  - The next task's dispatch carried each ruling, so no duplicate keys appeared.
- **The user's mid-plan corrections went into every artifact in one pass,** with nothing left contradicting them:
  - the reviewer's call comes before Ready to exit (brainstorm Q12);
  - the call-pending row text on Follow-ups.

## 2. Misses

- 🟡 [painful | evidence: c884130, 0b73991, 1a584ac] **The quiet start needed four rounds to cover every path.** Task 3's review found that a held start was never resent after the admin's own action, and that a press could meet the start in flight. Its re-review found the wait could send the press for another case. The final review found contact and assistance writes didn't retry the start either. The design (D4) listed the triggers but not "every place `busy` clears", so each review found one more path.
- 🟡 [painful | evidence: 771fe1a] **The docs task missed docs the change made false.** `production-roadmap.md` (signing and e-filing "not built"), and `demo-script.md` and `setup.md` ("Review complete" on the client's screen). The brief listed only the files to update, not "grep for statements this change falsifies". The implementer even noticed the roadmap and left it.
- 📌 [nit | evidence: 90f1774, 1922105] **One stale count survived the final fix wave.** "Unit (1159)" in `frontend.md` needed a residual one-word commit.
- 📌 [nit | evidence: tasks.md 8.1] **The story couldn't show that a list control doesn't start screening.** No sample case sits at Request sent with an open call task. The controller unit test carries that rule.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 1 | Also added the three history lines to `SENTENCES` (+ `zh-hant.mjs`) | The unit test "every history sentence in the migrations is a SENTENCES key" fails once 032 exists |
| 2 | Also added `EVENT_SENTENCES` for the three actions | The test "every CASE_ACTIONS entry has a sentence" requires them; Task 4 then set the plan's wording |
| 3 | Two fix rounds added a wait in `runAction`, a held action resent after `dispatch` settles, the case-change guard and second-press guard | Task 3 review findings (the spec's "sent again once the connection returns", no visible conflict) |
| 4 | Short "Form 8879"/"E-file" headings above the Mark buttons; the draft lifecycle bar has no current step | Following the panel's row markup; `draft` is in no step of the ten-stage bar |
| 5 | Focus after a confirm from Follow-ups goes to `#case-title, #office-queue-title` | The row's opener is gone after the stage moves, and the mark dialogs have no drawer fallback |
| 7 | Also fixed `production-roadmap.md`, `demo-script.md`, the root `README.md` and "Same day in progress" | Docs this change made false (review findings) |
| 8 | The "in place is not an open" story step was skipped | No case at `received` with an open call task; the brief allowed it |
| final | `runContactWrite`/`runAssistanceAction` retry the quiet start; doc helper name, counts and "no eligibility screening" | Final whole-branch review minors |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓ (in conversation, then brainstorm.md through propose) |
| superpowers:writing-plans                        | ✓ (plan.md) |
| superpowers:using-git-worktrees                  | ✓ (`git worktree add` from the planning branch, then `EnterWorktree` by path) |
| superpowers:subagent-driven-development          | ✓ (ledger, briefs, per-task reviews, fix loop, final review, one fix wave) |
| (transitive) superpowers:test-driven-development | ✓ (RED/GREEN in every unit-testable task; Task 1 and the story can't run locally for implementers, so the controller's runs are their GREEN) |
| (transitive) superpowers:requesting-code-review  | ✓ (8 task reviews, the final review on Opus) |
| superpowers:finishing-a-development-branch       | pending (step 9, after archive) |

### Deliberately Skipped Skills

(none)

## 5. Surprises

- **The migrator already wraps each run in a transaction.** The plan's `begin;`/`commit;` copied a habit from hand-run SQL; none of 001–031 has them.
- **`npm run db:migrate:test` applies every pending file, and the folder is resolved next to the script.** Applying 031 alone while the worktree was about to gain 032 meant running the main checkout's `tools/admin/migrate.mjs` (main had no 032) with the same `.env.test`.
- **Follow-ups never sees a case's related tables.** It renders `listCases` rows, which carry only five (now six) summaries. Any rule that reads `reviews`, `requests` or similar needs a list summary to work there.
- **The worktree guard refuses `echo … | docker exec -i psql`.** Using `docker cp` plus `psql -f`, or `psql -c`, worked.
- **The quiet start's gate on `busy` turns every `busy`-setting write into a place it must be retried.** That's three functions in the controller, not just `dispatch`.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Migrations have no `begin;`/`commit;`: `tools/admin/migrate.mjs` wraps the run in one transaction** → **Promote to memory** (update `migration-review-rules`)
  > **Why**: the plan for 032 had them, and a `commit;` would end the migrator's transaction early and make a dry run real; the recheck caught it.
  > **How to apply**: when planning or reviewing any new migration.

- [ ] 🟡 **A background action gated on `busy` must be retried wherever `busy` clears (dispatch, contact writes, assistance writes)** → **Promote to memory** (type: feedback)
  > **Why**: the quiet screening start took four review rounds (c884130, 0b73991, 1a584ac) because each found one more write path that skipped it.
  > **How to apply**: when designing any controller behaviour that runs "when nothing else is in flight": list every function that sets `state.busy` in the design, not just `dispatch`.

- [ ] 🟡 **Follow-ups and the boards render list rows; a rule that reads related tables needs a list summary** → **Promote to memory** (type: project)
  > **Why**: the reviewer's-call check read `record.reviews`, which list rows don't have; the recheck caught it and 5dd23d2 added `reviewContactStatus`.
  > **How to apply**: when a new eligibility rule or row sentence is meant to show on Follow-ups, the pool or the work board.

- [ ] 🟡 **A docs task's brief includes "grep docs/ for statements this change makes false"** → **Promote to memory** (type: feedback)
  > **Why**: Task 7 updated the listed files but left `production-roadmap.md` and two narration lines false (771fe1a).
  > **How to apply**: when writing any plan's docs task: add a grep step for the old names, old stage ends and "not built" claims.

- [ ] 📌 **To apply only an earlier migration while a worktree has a newer one, run the main checkout's `migrate.mjs` with the same `.env.test`** → **Promote to memory** (update `local-test-stack`)
  > **Why**: the migrator resolves `supabase/migrations/` next to itself and applies every pending file.
  > **How to apply**: when the test stack lags `main` and the user approves applying only the earlier migration first.

- [ ] 📌 **A new migration history line must go into `SENTENCES` in the same task** → **Promote to memory** (type: project)
  > **Why**: `tests/client-language.test.mjs` fails as soon as a migration has an untranslated history sentence, so the migration task can't be green alone.
  > **How to apply**: when planning a migration that returns a new client message.

---

## Ledger summary (the SDD ledger is not committed; this is its record)

**Rulings (15)**, in the order made:
1. Task 5's tests include `store.test.mjs` and `database-store.mjs`, which its steps named.
2. Placeholder test bodies are filled by implementers and held to real assertions.
3. Task 1's `SENTENCES` addition stays.
4. Task 2's `EVENT_SENTENCES` addition stays, and Task 4 owns the wording.
5. Task 2's empty-states golden update stays.
6. Task 3's minors 1–5 go into a fix round (one is a spec SHALL gap and one a visible conflict).
7. A press that waited is dropped quietly if the case changed.
8. A draft's lifecycle bar has no current step.
9. Keep the "Form 8879"/"E-file" headings.
10. Keep `REVIEW_STAGES` at the two new stages (the user's choice).
11. Fold Task 7's two minors into its fix round, including "Same day in progress".
12. `docs/design/*` stays as historical records.
13. Task 8's implementer runs on Opus.
14. Skip the story's "in place is not an open" step; the controller test covers the rule.
15. The one-word residual count fix had no further review round; confirmed by grep.

**Parked findings:** none. No task reached the five-round cap.

**Deferred minors (19).** The final review triaged them; none must be fixed before merge.
- **Database tests (T1):**
  - volunteer FORBIDDEN refusals don't assert "nothing recorded";
  - "every other move refused" is lightly covered (backfill: START_SCREENING at `preparation_ready`, MARK_READY_TO_EFILE at `review_ready`);
  - the call note is duplicated between fixture and test;
  - the Task 1 report omitted the 繁體 check (since run clean).
- **Stages and labels (T2):**
  - `PROGRESS_STEPS` (resolved by Task 6);
  - `NEW_HISTORY`'s unused 简体 element;
  - the `stage.*` comment (resolved).
- **Controller (T3):**
  - `actingAdmin` duplicates `isAdmin`;
  - a press waiting on a start that never settles hangs (the existing store-timeout carry-forward);
  - the memory-clearing tests also pass through the principal/savedCase gate;
  - `pressWaitingOnStart` is global, not per case.
- **Case pages (T4):**
  - `clientName` is a third copy of `fullName`;
  - TDD order.
- **Lists (T5):**
  - `reviewContactStatus` ties on `created_at` (needs an id tiebreak in both the migration and the store);
  - the open-mark in-place behaviour is pinned by shell regexes.
- **Client page (T6):**
  - phone step labels (resolved by the screenshot);
  - `reEsc` is defined below its use.
- **Docs (T7):** one long line in `demo-script.md`.
- **Story (T8):**
  - the second admin window opens after the move, not as a race;
  - the second window's no-error check could accept only `toast:` entries;
  - `toastSaid` duplicates `toastSeen`;
  - the new phase is one long callback.
