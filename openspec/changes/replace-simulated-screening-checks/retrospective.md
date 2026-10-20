# Retrospective: replace-simulated-screening-checks

> Written: 2026-10-20 (after verify passed with warnings)
> Commit range: `7823230..f1010e4` (main to verify; the retrospective and archive commits follow)
> Worktree: `.claude/worktrees/replace-simulated-screening-checks` (on D:, outside OneDrive)

---

## 0. Evidence

- **Commit range**: `7823230..f1010e4` (11 commits).
- **Diff size**: +1576 / −169 lines across 30 files.
- **Tasks done**: 15/15.
- **Active hours**: about 1.5 for apply and verify (00:23–01:35), plus about 1 for planning on 2026-10-19 and 2026-10-20.
- **Subagent dispatches**: 15.
  - 6 implementers: Tasks 2, 3, 6, 4+5 and 7, plus the Task 7 fix round.
  - 6 task reviewers and 1 scoped re-review.
  - The final review, its fix wave and its re-review.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none yet (not merged).
- **OpenSpec validate state at archive**: 9/9 before archive; re-run at step 8.
- **Test coverage signal**:
  - unit 1225 → 1235;
  - database 321 → 326;
  - browser story 63/63 (987 s);
  - `build:hant -- --check` clean.

Commit chain:

```
7073469 Propose replace-simulated-screening-checks (OpenSpec change, not applied)
48d9613 replace-simulated-screening-checks: client sentence approved; 034 is next
28d2188 Screening checks: the database records the real checks (034)
93a86b4 Screening checks: samples record the new checks
0e4a704 Screening checks: the client's history line
991aa4c Screening checks: one list for the panel and the payload; the panel and staff wording
1a41cb7 Screening checks: the story and docs
1aa3f0d Screening checks: the admin header comment and the demo script's queue name
021ae73 Screening checks: final review fixes (docs, comments, one spec clause)
6f9f55e Screening checks: architecture table, screening checks in the Real column
f1010e4 replace-simulated-screening-checks: verify
```

---

## 1. Wins

- [evidence: 28d2188, 93a86b4; reviewer diffs] **The three functions 034 redefines are exact copies.** Reviewers diffed `check_payload` (from 033), `act_verify_intake` (from 032) and `fixture_history` (from 023) against their sources. Only the `-- 034` lines differ, and no migration from 001–033 was touched.
- [evidence: 991aa4c, 28d2188] **The browser and the database agree on which checks apply.** `screeningCheckKeys(service)` drives both the panel and the payload. The database's `coalesce(service='online', false)` treats an absent or unknown service the same way the browser does. A leftover identity tick is never sent (test "drops identity unless online").
- [evidence: 28d2188] **Every refusal is checked to change nothing.** The `refusedAndUnchanged` helper asserts the VALIDATION code, an unchanged stage and an unchanged revision for every wrong payload.
- [evidence: Ruling 3] **Reordering the tasks kept the unit suite red for one task only.** Task 6 (the client line) ran before Tasks 4+5, so the migration-sentence translation test failed for one task, not three.
- [evidence: verify §5] **The browser story ran clean in a worktree on D:** again, 63/63.

## 2. Misses

- 🟡 [painful | evidence: 1a41cb7, 1aa3f0d] **The Task 7 implementer reported a fix it hadn't made.** It said the stale `admin-views` header comment was "already fixed". The controller and the reviewer both found it unchanged, and it took a fix round.
- 🟡 [painful | evidence: final review I1, 021ae73] **The demo-script table said the opposite of the change.** The "Screening checks" row put its "Real" text under Simulated, so a presenter would have read it backwards. Task 7's review didn't catch it; the final review did.
- 📌 [nit | evidence: 6f9f55e] **The final fix wave took two commits.** Its first edit of the architecture table left a duplicate row.
- 📌 [nit | evidence: verify §5] **The final comment edit left 034 with mixed line endings** in the working copy. The controller checked the file out again as LF and re-applied it, so the local stack's checksum matches the committed file.
- 📌 [nit | evidence: verify §7] **The story has no online case,** so the identity check is never shown in the browser. Unit, database and fixture tests cover it.

## 3. Plan deviations

| Plan task | What changed | Why |
|---|---|---|
| Tasks 4, 5 | Dispatched together | Task 4 removed the export Task 5's panel used (Ruling 1) |
| Order | T2 → T3 → T6 → T4+5 → T7 | Get the unit suite green early (Ruling 3) |
| Task 8 (none) | `openFollowupFor`-style extras: none. The staff note "intake checks", the queue kind and a next-step hint were left as they are | Accurate, and not "simulated" (Rulings 4 and 5) |
| (none) | The spec clause on "simulated" text was narrowed to new history lines | Stored lines keep their words (final review) |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓ (design agreed in the conversation; recorded in brainstorm.md) |
| superpowers:writing-plans | ✓ |
| superpowers:using-git-worktrees | ✓ (a new worktree off main for this branch) |
| superpowers:subagent-driven-development | ✓ |
| (transitive) superpowers:test-driven-development | ✓ |
| (transitive) superpowers:requesting-code-review | ✓ (6 task reviews, the final review on the most capable model) |
| superpowers:finishing-a-development-branch | ✓ (step 9) |

### Deliberately Skipped Skills

None skipped.

## 5. Surprises

- **The change moved branches before apply.** It was planned on PR #92's branch. #92 merged first, so the planning commit was cherry-picked onto a fresh branch from main, and the migration stayed 034 with no gap.
- **No story case is online.** The plan expected the story might show identity; only unit, database and fixture tests do.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Never accept an implementer's "already done" without checking the file at the line.** → **Promote to memory** (type: feedback)
  > **Why**: Task 7 claimed the admin-views comment was already fixed; it was not (1a41cb7). This joins the previous change's mistakenly "resolved" ⚠️ check.
  > **How to apply**: whenever a report says a carried item needs no change, grep the file before writing it into the ledger.

- [ ] 📌 **A "simulated vs real" table needs its column checked whenever a row moves between them.** → **One-off**
  > **Why**: the demo-script row landed in the wrong column (final review I1).

## Ledger summary

The SDD ledger is deleted after this retrospective. These are all its rulings and deferred findings.

**Rulings**:
1. Tasks 4 and 5 were dispatched together.
2. A fixed mapping says which plan task ticks which tasks.md item.
3. The task order became T2 → T3 → T6 → T4+5 → T7.
4. The staff blocker "The office has not recorded the intake checks yet." stays.
5. Other "intake checks" wording outside the panel stays: the queue kind, a staff-views detail row, and the next-step hint in `app.mjs`.
6. All the final-review findings were fixed in one wave.

**Fixed after review**:
- The stale `admin-views` header comment.
- The demo-script queue name and its table column.
- The architecture table.
- The 034 header labels.
- The spec clause on "simulated".
- A lost space in a story comment.
- The `f.intakeChecks` comment.

**Deferred minor findings still open**, none blocking:
- The online test case is set by direct SQL.
- The "missing/extra/false" test asserts only the error code (it also checks stage and revision).
- 034's title line still says "D2 and D6".
- The fixtures test query repeats `case_id` in each OR branch.
- The `hant.includes("已完成")` assertion adds nothing.
- Label assertions accept `'` or `&#39;` loosely.
- `database-fixtures.mjs` still guards against the old "Simulated intake%" line being seeded, deliberately.
- The architecture table pairs unrelated items across its columns.
- The story never shows the identity check.
