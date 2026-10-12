# Retrospective: make-intake-v2-default

> Written: 2026-10-12 (after verify passed with warnings)
> Commit range: `fe802c7..2074e90` (before archive)
> Worktree: `.claude/worktrees/make-intake-v2-default` on branch `make-intake-v2-default`

---

## 0. Evidence

- **Commit range**: `fe802c7..2074e90`, 8 commits before the archive commit.
- **Diff size**: +940 / −41 lines across 19 files. Most of it is the change's own artifacts. The code part is one 18-line migration and about 70 test lines.
- **Tasks done**: 11/11 (`grep -cE '^\s*- \[x\]' tasks.md` → 11).
- **Active hours**: about 2. The brainstorm and planning ran the morning of 2026-10-12; apply, verify and the retrospective ran the same afternoon.
- **Subagent dispatches**: 7 fresh, plus 3 resumes of the Task 2 implementer.
  - Fresh: 2 implementers, 2 task reviews, 1 scoped re-review, 1 final review, 1 final re-review.
  - Resumes: fix round 1; a re-send because a commit hadn't happened; the final-review fix wave.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none yet (not merged).
- **OpenSpec validate state at archive**: pass (`openspec validate --all`: 1 item, 1 passed) at verify time.
- **Test coverage signal**:
  - `npm test` 923/923;
  - `npm run test:database` 238/238 (233 + 5 new, `tests/database-intake-default.mjs`);
  - the browser, sign-in and 繁體 checks were not run, by design (D5).

Commit chain (in order):

```
6d40975 OpenSpec change make-intake-v2-default: planning artifacts
9d448f1 Switch-over: version 2 of the intake is the default (migration 020)
bd71b95 tasks.md: groups 1 and 2 done
3d6ef5a Docs: version 2 is the default since migration 020; 22 migrations
594d3fc Docs: the workspaces row, the database suite count and the roadmap's sample note follow 020
abe57e3 tasks.md: group 3 done
747b34d Docs: the last held-switch-over phrases, and the unit count
2074e90 verify.md: PASS with warnings
(archive commit follows)
```

---

## 1. Wins

- **The switch-over really was one migration.** 020 is two statements (`9d448f1`), byte-identical to the plan (Task 1 review), and no application code changed. The 4c design of making every path read `workspaces.default_intake_version` (011, 019, `workspace.defaultIntakeVersion`) paid off.
- **Order-independence was designed in, not hoped for.** D2 argued that 020 is safe before or after 021 and 022. The run then took the other order from the one planned (§5), and it still made no difference to the result.
- **Failing first worked as intended.** The RED run failed exactly the four switch-over checks, and the "keeps version 1" check passed. That shows the tests separate the new behaviour (020) from the behaviour they guard (011 and 019).
- **Planning review rounds caught real gaps before apply:**
  - an untestable spec sentence (dropped);
  - the `VT007` and realtime risks, recorded as accepted in design.md;
  - two stale docs and a grep that wouldn't have caught them.
- **Each review layer found something the previous one missed:**
  - Task 2's review found three stale doc lines outside the plan's list;
  - the final review found four more, plus a stale test comment and a unit count left wrong by #57.
  - Together they left the docs saying the same thing everywhere (grep in `747b34d`).
- **First canonical spec.** `client-intake` has three requirements and 8 scenarios. Every scenario has evidence (verify.md §5), and seven of the eight have an automated check.

## 2. Misses

- 🟡 [painful | `9d448f1`, verify.md §4] **Brainstorm, design and plan assumed the test stack's state without checking it.** Six statements said 021 and 022 were "already applied on the test stack". They weren't: only 001–019 were. One read-only `select name from vitally_private.schema_migrations` during planning would have shown it. Because of the gap, the RED run failed one unrelated test (021's wording in `tests/database-review.mjs`), and verify had to list ten contradicted statements.
- 🟡 [painful | ledger, Task 2] **An implementer reported a commit that hadn't happened.** The worktree guard refused its combined `git add && git commit` command, but its hand-back still said "Commit: …". The controller caught it because `git log` showed HEAD unchanged and `git status` showed modified files. It cost one extra round trip.
- 📌 [nit | plan.md Task 2] **The plan's doc inventory came from one grep pattern**, so it missed lines worded differently: "is held for the group", "reachable once 4c switches", "233 tests", "needs a version-1 workspace". Two review rounds were needed to find them all.
- 📌 [nit | verify.md §5] **The "existing workspace is switched" scenario has post-state evidence only.** No count was taken before 020, and an automated test was ruled out (it would rewrite every workspace in the shared test database). The final review suggested a `begin … rollback` test that runs only the `update`, as a cheap way to automate it.
- 📌 [nit | verify.md §4] **The design's realtime side-effect note is slightly too broad** (client windows don't re-read the workspace or assistance items), and the proposal's docs list misses two files.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 1.5 / 2.2 | 020, 021 and 022 were applied together, in number order, not 020 after 021/022 | The test stack had only 001–019 (Task 1 report). Ledger ruling: the doc text changed to "applied in number order". |
| 1.5 | RED also failed one test in `tests/database-review.mjs` | That test expects 021's wording, and 021 wasn't on the stack yet. It passed after migrating. |
| 2.2 (spec scenario 2) | No automated test runs 020's `update` | Ledger ruling: running it would flip other test files' workspaces mid-run in the shared test database. Evidence is the statement plus the query (7 of 7 workspaces at version 2). |
| 3.1 | `docs/developer/production-roadmap.md` added | Task 2 review: the change made its sample-reset note wrong. Ledger ruling extended the scope. |
| 3.1 / 3.2 | Further stale lines fixed: database.md's `workspaces` row and "233 tests"; `docs/design/README.md`; `redesign-review.md` lines 13, 16 and 43; setup.md's Unit row (917 → 923, drift from #57) | Found by the Task 2 review and the final review. They are the same stale-doc class the change set out to fix. |
| — | `tests/browser.mjs` comment reworded ("switch-over itself is held") | Final review. Comment only, so the browser suite was not re-run. |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓ (decisions agreed in chat at lifecycle step 2; the skill was invoked at propose to capture `brainstorm.md`) |
| superpowers:writing-plans                        | ✓ (`plan.md`) |
| superpowers:using-git-worktrees                  | ✓ (the existing change branch in `.claude/worktrees/`, entered with the native tool) |
| superpowers:subagent-driven-development          | ✓ (ledger, task briefs, per-task reviews, final review, one fix wave) |
| (transitive) superpowers:test-driven-development | ✓ (RED run before 020 was applied; recorded in the Task 1 report) |
| (transitive) superpowers:requesting-code-review  | ✓ (two task reviews, two scoped re-reviews, final whole-branch review on the most capable model) |
| superpowers:finishing-a-development-branch       | ✓ (run at lifecycle step 9 after archive; push and PR, per CLAUDE.md) |

### Deliberately Skipped Skills

None. Two sub-steps were adapted, as CLAUDE.md directs:
- `openspec-verify-change` is not installed, so its checks were run directly (verify.md).
- At its own finish, subagent-driven development listed its rulings but kept its workspace until this retrospective, and did not start `finishing-a-development-branch` (CLAUDE.md lifecycle step 5).

## 5. Surprises

- **The shared test stack lagged `main`.** A teammate's PR (#57) added and applied 021 and 022 on their own stack. This machine's stack stayed at 019 until this change migrated it. "Merged to main" does not mean "applied on my test stack".
- **The worktree guard refuses compound git commands.** It rejected `git add … && git commit …` chains and `$(…)` command substitution inside commands. Subagents need to be told to run git as separate simple commands, and to confirm with `git rev-parse --short HEAD`.
- **No canonical spec existed to conflict with.** This change wrote the first one, so the authority order's "canonical spec" step had nothing to check against.

## 6. Promote candidates → long-term learning

- [x] 🟡 **Check the test stack's applied migrations before planning a migration change** → **Promote to memory** (type: feedback; extends [[local-test-stack]])
  > **Why**: this change's brainstorm, design and plan all assumed 021 and 022 were applied on `vitally-task2`. Only 001–019 were, which left ten contradicted statements in verify.md.
  > **How to apply**: during `/opsx:explore` or brainstorm for any change that adds a migration, run a read-only `select name from vitally_private.schema_migrations order by name` on the test stack and state the actual applied set in the brainstorm.

- [x] 🟡 **In a worktree session, have subagents run git as separate simple commands and confirm commits** → **Promote to memory** (type: feedback)
  > **Why**: the Task 2 implementer's combined `git add && git commit` was refused by the worktree guard, but it reported the commit anyway.
  > **How to apply**: every implementer dispatch in a worktree says "stage, then commit, as separate commands; report `git rev-parse --short HEAD` and `git status --short`". The controller checks `git log` before building a review package.

- [ ] 📌 **Inventory stale docs by meaning, not by one phrase** → **One-off** (record only)
  > **Why**: one grep pattern missed differently worded lines, and review caught them. A plan for a "state changed" change should grep for several phrasings ("held", "reachable once", "still 1", the old counts).
  > **How to apply**: when a plan's task is "docs now say X", list three or four phrasings of not-X in its final grep.

- [ ] 📌 **Automate a whole-table migration statement with `begin … rollback`** → **One-off** (a follow-up idea, not adopted here)
  > **Why**: the ruling against re-running 020's `update` in the suite left one scenario with post-state evidence only. The final review noted that a rolled-back transaction would be invisible to other test files.
  > **How to apply**: consider it if a later migration again has a spec scenario that only a database-wide statement exercises.

### Rulings and deferred findings from the ledger

Summarised here because the ledger (`.superpowers/sdd/plan/progress.md`) is deleted after this retrospective (CLAUDE.md §7):

- **Rulings:**
  1. Commits stage named files only, because the worktree's `node_modules` symlink shows as untracked.
  2. The observed migration order was number order. Both orders are safe by D2, and the setup.md wording and verify.md were corrected to match.
  3. No suite test re-runs 020's `update`. The scenario stays evidenced by the statement plus the post-migration query.
  4. Task 2 was extended to `docs/developer/production-roadmap.md`, with the stray ". |" in the 021 rows folded in.
  5. The final review's Minors 1–3 were fixed in one wave (the test comment, `docs/design` stale phrases, setup.md's Unit row). Minors 4–5 and the ten contradicted artifact statements became verify.md notes, not artifact edits.
- **Deferred minors:**
  - The existing-workspace scenario's evidence is post-state only (no pre-020 count).
  - Long single lines after replacements in architecture.md, database.md and setup.md were not rewrapped.
  - database.md's "removed in its own part after the switch-over" wording was kept as it is.
  - Two null-version fallbacks (`coalesce(v_version, 1)` in 011, `?? 1` in `src/supabase-store.mjs`) were left for the version-1 removal change.
- **Parked findings:** none.
