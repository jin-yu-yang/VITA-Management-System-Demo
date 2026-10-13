# Retrospective: remove-intake-v1

> Written: 2026-10-12 (after verify passed with warnings)
> Commit range: `6f3f239..` (13 commits before the retrospective and archive commits)
> Worktree: `.claude/worktrees/remove-intake-v1` on branch `remove-intake-v1`

---

## 0. Evidence

- **Commit range**: `6f3f239..` (13 commits at verify, plus this retrospective and the archive).
- **Diff size**: 69 files, +2651 / −2964 lines. That's a net removal, and it includes the change's eight artifacts.
- **Tasks done**: 17/17.
- **Active hours**: about 6, in one session on 2026-10-12. Planning ran in the morning, with three review rounds; apply, verify and this retrospective ran in the afternoon and evening.
- **Subagent dispatches**:
  - 4 implementers;
  - 8 reviewers: four task reviews, one pre-apply review of 023, two scoped re-reviews and the final whole-branch review;
  - about 7 implementer resumes for fix rounds and stack steps.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none yet (not merged).
- **OpenSpec validate state at archive**: pass at verify (`--all`: 2 items, 2 passed; `--strict` also passes, per the final review).
- **Test coverage signal**:

  | Suite | `main` | This branch |
  |---|---|---|
  | unit | 923 | 899 |
  | database | 238 | 248 |
  | sign-in | 20 | 20 |
  | story | 59 | 57 |

  The 繁體 check is clean. Every deleted test is classed under Rule 3.

Commit chain (in order):

```
4808f75 planning artifacts
7b63cbd Task 1: fixtures version 2 only; version-1 database tests removed, general ones moved
904ac2f tasks.md group 1
bf3fa56 Task 2: version 1 leaves the app
0615e7d Task 2 fix: the last version-1 guards, dead CSS, editAnswers guard
bc03757 tasks.md group 2
a131f4f Task 3: migration 023 (corrected in place before commit) and its tests
129e41f tasks.md group 3
119582f Task 4: story and docs
aca1803 Task 4: carried test and CSS items
4779596 tasks.md group 4
d050680 final-review fix wave: developer guide names, stricter checks
<verify> verify.md
(retrospective, then archive commits follow)
```

---

## 1. Wins

- **[evidence: counts-before/after, verify §5] The guard did its job before it ever ran.** Reading the stack during planning found 4 rehearsal applications that would have stopped 023. The rehearsal workspace was deleted on the user's go-ahead. The real run deleted exactly the 12 version-1 test and sample cases and kept all 13 version-2 cases. Recording counts before and after closed the post-state-only gap from 020's retrospective.
- **[evidence: the pre-apply review] Reviewing a migration before applying it paid off.** A successful apply is final, so 023 was reviewed while still uncommitted. That review diffed all eight redefinitions against their sources and the live 022 definitions, and found a latent deferred-FK failure (`set constraints all immediate`) that would have made 023 unappliable on a teammate's stack with a crashed version-1 test workspace.
- **[evidence: 7b63cbd, the Rule 3 tables] Tests first.** Moving the fixtures to version 2 while the database was still at 022 kept every later task on a green suite. Rule 3 tables recorded each of the roughly 40 deleted tests as version-1 only or general with a named replacement, and the reviewers checked them against the tree.
- **[evidence: bf3fa56, 0615e7d] A big removal without a version-2 regression.** About 2,200 lines left `src/`. The task review and the final review both traced every collapsed branch and found the version-2 side kept everywhere.
- **[evidence: the final review] The strict #58 line held.** Every removed string was version-1-only. The proposal and the #58 comment draft list the rows this change removed.

## 2. Misses

- 🟡 [painful | evidence: test:database 245/247 at Task 3; ledger] **The design missed a project-wide rule.** D2 made the two predicates plain `immutable` SQL, but `tests/database-actions.mjs:843` requires every `vitally_private` function to be `security definer`. It was caught only after 023 had been applied. The user chose to correct 023 in place (it was never committed or on `main`): reset its ledger row and re-apply. That meant one more stack write and an extra round trip.
- 🟡 [painful | evidence: ledger, Task 3] **A migration's step list missed a deferred-constraint interaction.** The pre-apply review caught it, but it's the kind of thing a plan for any migration that updates a row twice and then alters its table should anticipate.
- 🟡 [painful | evidence: plan recheck rounds] **Planning needed three review rounds** to find:
  - the `formStep` field D8 got wrong;
  - six `fixture_history` rows, not three;
  - a plain `create function` header that `create or replace` had to replace;
  - `cases.intake_version`'s default of 1;
  - a second store fallback;
  - missed test files and docs.

  Each was small. Together they show how much a removal touches.
- 📌 [nit | evidence: Task 4 review, final review] **The doc sweep needed two follow-ups.** `frontend.md`'s API list and `redesign-review.md:43` slipped past the Task 4 grep, which matched phrasings rather than meaning, the same lesson as 020's.
- 📌 [nit | evidence: verify §7] **A fresh install of 001–023 hasn't been run.** CI doesn't migrate, and this stack went 022 → 023 only.

## 3. Plan deviations

| Plan task | What changed | Why |
|---|---|---|
| 1 | The database-fixtures private-helper list was handled in Task 3, not Task 4 | 023 drops `fixture_answers`, so Task 3's database run needed it (ruling) |
| 2 | Also removed `ui.mjs`'s `ANSWER_LABELS` and `radio`, and `controller.createAssistedCase`. A fix round removed four dead version-1 guards in `intake-catalogue.mjs` and `intake-form.mjs`, 12 dead CSS classes, and added an `editAnswers` guard | D5's goal: no version-1 code left in `src/` (task review) |
| 3 | A pre-apply review before Step 6; `set constraints all immediate` added; then 023 corrected in place (`security definer`, `drop … if exists`), its ledger row reset and re-applied | A successful apply is final; a deferred FK would block the CHECKs; the signature inventory rule (user's choice A) |
| 3 | The guard's message gives the total and the workspace ids, not a per-workspace count | Enough to find and clear blockers (ruling) |
| 4 | Dead `.question` CSS removed; two stricter checks added to the 023 tests; a final fix wave on `frontend.md`, `redesign-review.md` and three test files | Carried review findings |
| — | The browser story was run once (57/57), not twice | One run was planned for this change. The 59 → 57 drop is the removed phase, which ran once in each browser order |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓ (in chat at step 2; invoked at propose to capture `brainstorm.md`) |
| superpowers:writing-plans | ✓ (`plan.md`, three recheck rounds) |
| superpowers:using-git-worktrees | ✓ (the change branch in `.claude/worktrees/`, entered with the native tool) |
| superpowers:subagent-driven-development | ✓ (ledger, briefs, task reviews, a pre-apply review, the final review, one fix wave) |
| (transitive) superpowers:test-driven-development | ✓ (Task 3's RED at 022: 18 of 19 failing as expected; Task 1's suites green before the app changed) |
| (transitive) superpowers:requesting-code-review | ✓ |
| superpowers:finishing-a-development-branch | ✓ (lifecycle step 9: push and PR) |

### Deliberately Skipped Skills

None. As CLAUDE.md directs:
- `openspec-verify-change` isn't installed, so its checks ran directly;
- subagent-driven development's own finish kept the workspace until this retrospective and didn't start finishing.

## 5. Surprises

- **OpenSpec 1.14.0 refuses a MODIFIED requirement that drops a scenario.** The agreed MODIFIED/RENAMED plan for requirements 2 and 3 had to become REMOVED plus ADDED under new names. The meaning was unchanged.
- **The project's own signature inventory test is a schema rule** that no design or plan named, so it became a migration rule for this change.
- **A deferred foreign key plus a double update in one transaction blocks `ALTER TABLE`.** This holds even though each statement is fine on its own.
- **Version 1's `formStep` was a field of its own**, not a version-2 field that rejected version-1 values, as the design first assumed.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **A migration plan checks the project's own database-rule tests** (the signature inventory: security definer, `search_path`, no client grants) for every new function → **Promote to memory** (type: feedback)
  > **Why**: 023's two predicates broke `tests/database-actions.mjs:843`. It was found only after applying, and fixed in place.
  > **How to apply**: when a plan creates a `vitally_private` function, write it as `security definer set search_path=''` and revoke from public, anon, authenticated and service_role, and name that test in the plan's checks.

- [ ] 🟡 **Review a migration before applying it whenever applying is final** → **Promote to memory** (type: feedback)
  > **Why**: the pre-apply review of 023 found a deferred-FK failure that would have frozen an unappliable file on teammates' stacks.
  > **How to apply**: in SDD, a task that writes a migration stops before `db:migrate:test`. The controller gets a review of the uncommitted file (diffing each copied function against its source), then asks the user before applying.

- [ ] 📌 **A plan that both updates a row and then ALTERs its table includes `set constraints all immediate` first** → **One-off** (record only)
  > **Why**: a deferred FK check queued by a second update in the same transaction blocks `ALTER TABLE` ("pending trigger events").
  > **How to apply**: any later migration with that shape.

- [ ] 📌 **Rehearse a fresh `db:migrate` from 001 before the PCDC delivery** → **One-off** (a pre-delivery step)
  > **Why**: CI doesn't migrate, and no stack has run 001–023 from empty.
  > **How to apply**: once, on a throwaway stack, before November.

### Rulings and deferred findings from the ledger

Summarised here because the ledger (`.superpowers/sdd/plan/progress.md`) is deleted after this retrospective (CLAUDE.md §7).

**Rulings:**
1. Task 3's stack operations (the guard preview, deleting the rehearsal workspace, counts, applying 023) ran only after the user confirmed in chat.
2. Commits stage named files only (the worktree's `node_modules` symlink).
3. The database-fixtures `fixture_answers` list moved to Task 3. Two Task 1 test minors (the hidden-draft probe revision, the `f.draftCase` comment) went into Task 3.
4. The beyond-brief dead-code removals in Task 2 were accepted.
5. Task 2's fix round: the version-1 guards in `intake-catalogue.mjs` and `intake-form.mjs`, 12 dead CSS classes, and the `editAnswers` guard. The `*V2` and `VersionTwo` identifier renames are deferred.
6. The dead `.question` CSS moved to Task 4.
7. 023 was reviewed before applying.
8. The guard's message gives the total and the ids, not a per-workspace count.
9. `set constraints all immediate` was added before the CHECK changes.
10. The user's choice A: correct 023 in place, reset its ledger row and re-apply.
11. Two Task 3 test minors (the vacuous loop, the re-read after refusal) went into Task 4.
12. No trailing `set constraints all deferred` in 023, which is applied and frozen.
13. One final fix wave (`frontend.md`, `redesign-review.md:43`, three test files). The #58 row and the fresh-install rehearsal are recorded, not coded.

**Deferred minor findings:**
- **Rule 3 credit:** the database-fixtures row should credit `database-intake-default.mjs`'s "six version-2 samples whose answers pass the field checks" and "each sample has its own name, language and a contact row".
- **Cosmetic:** long one-line `draftCase` calls.
- **Naming:** "version-2" wording and names in the controller (`sendVersionTwo`, `reconcileVersionTwo`, `STEPS_V2`, `V2_CONTROLS`). Suggested as a small follow-up direct PR.
- **Sanity floors:** two were lowered to match removed literals (`client-language` ≥ 12, `shell` "said" ≥ 24).
- **Comments in 023:** `seed_fixtures`'s verbatim comment ("refuses version-2 answers on insert") is now slightly imprecise. Fix it in the next migration that redefines `seed_fixtures`.
- **An unreachable error:** the insert trigger gives 23502 rather than an FK error for a missing workspace.
- **The new-workspace default** is checked through the fixture and the column default rather than a freshly created workspace (equivalent).
- **Optional wording:** `setup.md`'s guard remedy deletes the whole rehearsal workspace; deleting only its version-1 cases would also do.
- **A historical inventory:** `redesign-review.md`'s §5 inventory table still names `formStep`, kept as history.

**Parked findings:** none.
