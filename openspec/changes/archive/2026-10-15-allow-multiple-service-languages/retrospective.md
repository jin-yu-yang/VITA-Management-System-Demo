# Retrospective: allow-multiple-service-languages

> Written: 2026-10-15 (after verify passed with warnings)
> Commit range: `0862dd2..6b123ed` (14 commits after the proposal; this retrospective and the archive follow)
> Worktree: `.claude/worktrees/allow-multiple-service-languages` on branch `allow-multiple-service-languages`

---

## 0. Evidence

- **Commit range**: `0862dd2..6b123ed`, 14 commits: 6 task, 1 fix round, 1 final fix wave, and 6 task-tick bookkeeping commits.
- **Diff size**:
  - implementation (`0862dd2..6b123ed`): 32 files, +495 / −57;
  - branch total (`8ec6b08..6b123ed`): 38 files, +1935 / −43, including the planning artifacts.
  - The generated catalogue module and 026 hold the whole catalogue as long single lines.
- **Tasks done**: 13/13 across six groups.
- **Active hours**: about 4 across 2026-10-14/15. That covers the explore (five decisions), propose, two recheck rounds, apply including the controller's database and story runs, verify and this retrospective.
- **Subagent dispatches**: 20 in total.
  - 1 read-only explore inventory;
  - 6 task implementers (Sonnet ×5, Haiku ×1);
  - 1 resumed implementer, for the Task 6 fix round;
  - 6 task reviewers (Sonnet ×5, Opus ×1);
  - 1 scoped re-review (Haiku);
  - 1 final whole-branch review (Opus);
  - 1 final fix wave, and its scoped re-review.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none yet (not merged).
- **OpenSpec validate state at archive**: pass at verify (4/4).
- **Test coverage signal**:

  | Suite | `main` | This branch |
  |---|---|---|
  | unit | 934 | 943, exactly the count the plan predicted |
  | database | 250 | 250 with 026 |
  | story | 57 | 57, twice |
  | sign-in | 20 | not run: no change |

Commit chain:

```
0862dd2 Propose allow-multiple-service-languages (planning artifacts)
130e8db Catalogue: Q0.5 other service languages and Q0.6 (migration 026)
55ca5f4 Language helpers: clientLanguages, letters, names, filters, languageCell
34055de Staff tables show every language; filters match any
9d185cb Progress page lists every language; the Fill names English and Mandarin
c0cdaef Story: Follow-ups languages from data-languages; the new application reads E, M
684e034 Docs: migration 026 and the client's service languages
f3f1d4b Docs: the migration count in prose is twenty-six
6b123ed Final review fixes: saved free-text filter in the spec, pool Other test, languageOptions helper
(+ 6 task-tick commits; archive commit follows)
```

---

## 1. Wins

- [evidence: brainstorm Q1] **Option B (keep Q0.3 and add an optional follow-up) avoided a data migration entirely.** No stored answer, seed, SQL function or existing reader had to change. The inventory showed that turning Q0.3 into a multi-select would have broken every saved draft's answer and the review gate.
- [evidence: 130e8db, design D1] **The catalogue machinery did all the database work.** Multi-select, show-if on a list (in both JS and SQL) and the generated migration already existed. The only hand edits were the drafts, one builder id list and tests. 026 dry-ran cleanly (114 → 116 fields), and the database suite passed on the first run.
- [evidence: 55ca5f4, 34055de] **One shared helper served every reader.** `clientLanguages` feeds the three tables, three filters and the progress page. The final review found no direct reader of the language answer left, and the planned Office overview can reuse it.
- [evidence: story runs] **The story passed first time, twice.** The planning recheck caught that the Follow-ups empty-state check compared cell text with chip labels. It now reads `data-languages`, and the new application's row is checked for `E, M` on a real staff screen.
- [evidence: plan Task 6] **The predicted unit count was exact (943).** The user's planning fix to state it, with a per-task breakdown, made the docs update checkable.

## 2. Misses

- 🟡 [painful | evidence: final review, 6b123ed] **The delta spec promised that "a saved filter value SHALL keep working".** That contradicts the trade-off the user approved at planning: free-text help-request languages read as Other. The final review caught it, and the fix wave corrected the spec and pinned it with a test. When the design gained the trade-off, the spec should have been checked against it.
- 📌 [nit | evidence: Task 6 review, f3f1d4b] **The docs sweep missed spelled-out counts.** The implementer grepped for "025" and "934" but not "twenty-five", so two prose counts were left stale. One fix round fixed them.
- 📌 [nit | evidence: Task 2 hand-back] **One implementer (Haiku) wrote no report file,** citing its own rules. The reviewer checked against the diff instead. Later dispatches said "the report file is required" and were followed.
- 📌 [nit | evidence: Task 2 review] **The Task 2 brief's code dedupes by code plus typed text.** So a preferred Other "x" with an untyped "also Other" shows `O, O`. It is readable and allowed by the design rule, so it was deferred.

## 3. Plan deviations

| Plan task | What changed | Why |
|---|---|---|
| 3 | No existing assertions needed changing. The help request with no case was built the usual way (`page([], help, …)`). | Simpler than the plan feared. |
| 6 | It also changed "twenty-five" to "twenty-six" in `docs/developer/database.md` and `docs/setup.md` (fix round 1). | Task 6 review. |
| final | The delta spec's saved-filter sentence was corrected and a scenario added. Two test assertions were added: a saved "Polish" filter, and a case-pool row with Other. A `languageOptions(cases, anyLabel)` helper replaced the duplicated expression in staff-views and pool-views. A stale comment was fixed, and the frontend.md bullet was rewrapped. | Final review, Important plus minors folded in. Ruling in the ledger. |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓ (agreed in conversation; the skill wrote `brainstorm.md` at propose) |
| superpowers:writing-plans | ✓ (`plan.md` in the change folder) |
| superpowers:using-git-worktrees | ✓ (`.claude/worktrees/allow-multiple-service-languages`, with `EnterWorktree`; the `node_modules` and `.env.test` links were made at setup, per memory) |
| superpowers:subagent-driven-development | ✓ (ledger, pre-flight scan, per-task reviews, final review, one fix wave) |
| (transitive) superpowers:test-driven-development | ✓ (each implementer reported RED and GREEN) |
| (transitive) superpowers:requesting-code-review | ✓ (per-task reviews, and the final review on Opus) |
| superpowers:finishing-a-development-branch | ✓ at lifecycle step 9 |

### Deliberately Skipped Skills

None.

## 5. Surprises

- **Show-if can only AND its conditions.** Q0.4's "Please specify" couldn't open for "preferred is Other OR also includes Other". That is why Q0.6 is a separate box (design D2), and two text boxes now share the name "Please specify" for that client. This is on the wording-review list.
- **A help request's language is free text, not a code.** Folding it into the shared rule turned "Polish" into "O", which changes what a saved filter matches. It is acceptable, but it needed an explicit trade-off, a spec sentence and a test.
- **The server refuses unknown answer fields.** The Fill and the story could only save `language_also` after 026 was applied. That is also the deployment rule: apply 026 to any shared database before or with the merge.

## Ledger summary (rulings, parked findings, deferred minors)

From the SDD ledger (`.superpowers/sdd/plan/progress.md`), before it was deleted.

**Rulings:**
1. **Correct the delta spec's saved-filter sentence** to the user-approved trade-off (final review, Important), and add the scenario "A saved free-text filter". Cost if wrong: one spec sentence; the code is unchanged.

**Parked findings:** none. No fix loop reached its cap.

**Deferred minors** (none blocks merge; the final review triaged them):
- The new ids are not alphabetical in the intake-build optional list. That doesn't matter, because the assertion sorts.
- A preferred Other with typed text, plus an untyped "also Other", reads `O, O`.
- `speaksLanguage(entries, undefined)` is false. Callers always pass a label or "all".
- A help request with no case reads "… (preferred)", though a request has no notion of preference. Cosmetic.
- A client's typed language text (Q0.4/Q0.6, up to 200 characters) now appears in the staff tables' hover and screen-reader text. Staff could already read these answers; consider truncating.
- Q0.4 and Q0.6 share the accessible name "Please specify" for a client who prefers Other and also ticks Other. On the wording-review list.
- No view-level test for the "—" cell (covered by the `languageCell` unit test). No progress-row test in 繁體 or for an untyped Other (checked by hand).
- One long line in the `setup.md` story note (pre-existing), and one around `browser.mjs:1367`.
- Process: the Task 2 implementer wrote no report file.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **When the design accepts a trade-off, re-read the delta spec's SHALLs against it before propose ends** → **Promote to memory** (type: feedback)
  > **Why**: here the design accepted that a saved free-text filter matches nothing, while the spec still said every saved filter keeps working. The final review caught the contradiction after apply.
  > **How to apply**: in the planning recheck, for every Risks/Trade-off entry in design.md, find the spec requirement it touches and make sure the SHALL says the same thing, with a scenario.

- [ ] 📌 **Docs sweeps for counts must include spelled-out numbers** → **One-off** (recorded here)
  > **Why**: "twenty-five" escaped a digits-only grep. The plan's Task 6 can name both forms next time.

- [x] 📌 **A change worktree needs `.env.test` linked too** → already promoted (memory `worktree-git-commands`, from gate-review-and-redesign-summary). Applied at setup this time; there was no failed first run.
