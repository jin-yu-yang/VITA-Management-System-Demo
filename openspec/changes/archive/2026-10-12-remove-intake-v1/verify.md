# Verification Report

> Produced after apply completed, to confirm the implementation agrees with the specs, design and tasks. The `openspec-verify-change` skill isn't installed in this project, so each check was run directly (CLAUDE.md, Workflow routing §2 step 6).

**Change**: `remove-intake-v1`
**Verified at**: `2026-10-12`
**Verifier**: Claude (controller session), in the worktree `.claude/worktrees/remove-intake-v1`

**PRECHECK:** 12 commits since the merge base `6f3f239`, and 17 boxes ticked in `tasks.md`. Both are positive, so verification proceeds.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item is `"valid": true`

**Result**:

```text
totals: items 2, passed 2, failed 0
client-intake      spec    valid=true  issues=[]
remove-intake-v1   change  valid=true  issues=[]
```

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` is now `- [x]`: 17 of 17, none open.

| Task | Why not done | Blocks archive? |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Notes |
|---|---|---|
| `client-intake` | ✗ Needs sync | The delta has 1 MODIFIED requirement ("New applications use intake version 2"), 2 REMOVED ("An application keeps the version it was created with" and "A workspace's version decides its sample cases") and 2 ADDED ("An application's intake version never changes" and "Sample cases are version 2"). Both REMOVED names match the canonical headings exactly (final review), and the change passes `--strict`. `/opsx:archive` applies the delta in lifecycle step 8. `/opsx:sync` wasn't used (CLAUDE.md §4) |

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Spec | Gap |
|---|---|---|---|
| D1: columns kept, only 2 allowed | Both CHECKs `= 2`; columns stay | Req. 1: version 2 is the only accepted version; setting a workspace to 1 is refused | None. Live: both CHECKs `= 2` |
| D2: predicates and count | `version_one_blocks`, `version_one_disposable`, `version_one_blockers()` | (migration-only, not spec) | None. Truth table tested; count asserted 0 |
| D4: `cases_intake_version_fixed` kept | Enforces "never changes" | ADDED "An application's intake version never changes" | None. The direct change is refused with VT007, re-read as 2 |
| D3 / seed_fixtures | Samples are version 2 | ADDED "Sample cases are version 2" | None. A reset seeds six version-2 samples whose submit history has no `screening` detail |

**Drift warnings** (non-blocking). Each was decided during apply and is recorded in the retrospective:
- **D2 omitted `security definer` on the two predicates.** The project's signature inventory test (`tests/database-actions.mjs:843`) requires every `vitally_private` function to be a definer. 023 was corrected in place before it was committed or on `main` (user's choice A): its ledger row was reset and it was re-applied. The drops were made `if exists`, so the file re-applies.
- **D3's step list gained two statements.** One is `set constraints all immediate;` before the CHECK changes: a workspace updated twice in one transaction leaves a deferred FK check pending, which blocks `ALTER TABLE` (found by the pre-apply review). The other is `alter table public.cases alter column intake_version set default 2` (011 had left it at 1).
- **D3 described the guard's message as a count per workspace.** The shipped message gives the total and the workspace ids, which is enough to find and clear them.
- **The proposal's "#58 rows this change deletes" list missed one row.** "Fictional address withheld" in the version-1 samples is also gone. It's added to the #58 comment draft.

---

## 5. Implementation Signal

- [x] No unstaged or uncommitted files in the worktree. `git status --short` shows only `?? node_modules`, the worktree's symlink to the main checkout's dependencies, never committed.
- [ ] Every related commit is pushed. Not yet: that's lifecycle step 9, after archive.

**Commit range**: `6f3f239..d050680` (12 commits before verify).

**Tests and evidence:**

| Check | Result | When |
|---|---|---|
| `npm test` | 899/899 (was 923 on `main`: version-1 unit tests deleted under Rule 3, a few added) | d050680 |
| `npm run test:database` | 248/248 (was 238 on `main`) | d050680 |
| `tests/database-intake-v1-removed.mjs` | 20/20 | d050680 |
| `npm run test:auth-browser` | 20/20 | 119582f (later commits change no browser-reached code) |
| `npm run test:browser` | 57/57, one run, 690 s (was 59: the removed version-1 phase ran once in each browser order) | 119582f (same) |
| `npm run build:hant -- --check` | exit 0 | d050680 |
| CI (`checks`) | Runs on the PR | — |

**The real run of 023 on this stack** (user confirmed in chat before each irreversible step):
1. The rehearsal workspace `017d2bb0-…` was deleted. It held 11 applications (10 version 1, 1 version 2) and 3 memberships, all fictional.
2. **Counts before:**
   - guard preview (blockers) 0;
   - version-1 cases: 6 samples and 6 others, all in test workspaces;
   - version-2 cases: 6 samples and 7 others, all in test workspaces;
   - 8 workspaces, all at version 2;
   - `cases.intake_version` default 1;
   - last migration 022.
3. `npm run db:migrate:test` applied 023. After the in-place correction, its ledger row was reset and it was applied again.
4. **Counts after:**
   - blockers 0;
   - **no version-1 cases**, and the 13 version-2 cases unchanged;
   - 8 workspaces at 2;
   - `cases.intake_version` default 2;
   - both CHECKs `= 2`;
   - `intake_answer_keys` and `fixture_answers` gone;
   - the three `version_one*` functions are security definer with `search_path=""`;
   - the ledger digest equals the file's sha256 (final review).

**Spec scenario evidence:**

| Requirement / scenario | Evidence |
|---|---|
| New applications use intake version 2: a new workspace defaults to 2 | Test: the fixture workspace reads 2, and both column defaults are 2 (`information_schema`) |
| … an existing workspace is switched to version 2 | 023's step 4 (`update … where default_intake_version <> 2`), plus the new test "every workspace is version 2". On this stack it was a no-op (all 8 already at 2 since 020), so the evidence is the statement and the counts |
| … setting a workspace to version 1 is refused | Test: refused with 23514, and re-read as 2 |
| … a client's / the office's new application is version 2 | Tests (client applicant; presenter with `mode: "assisted"`) |
| An application's intake version never changes: saving keeps 2; a direct change is refused | Tests (save, then read 2; direct update refused with VT007, re-read as 2) |
| Sample cases are version 2: a reset seeds six version-2 samples | Test: six samples, all version 2; six SUBMIT events, none with `screening` |

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```bash
ls docs/superpowers/specs/*.md   # 8 files
```

- [x] There are no new files: the 8 files are legitimate history from before the schema was installed. This change touched nothing under `docs/superpowers/` (`git diff --stat 6f3f239 HEAD -- docs/superpowers` is empty).

| File | Captured in this change? | Action |
|---|---|---|
| — | — | none |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` rows, so this section is empty and counts as a pass.

| Deferred dogfood | Equivalent automated test | Coverage | Real gap? |
|---|---|---|---|
| — | — | — | — |

Not a `[~]` row, but recorded for the retrospective: **a fresh install of 001–023 from an empty database has never been run** (the final review's minor 7). CI doesn't migrate, and this stack went 022 → 023. Reading the migrator, that order is safe (no workspaces, the guard is 0, the cleanup deletes nothing, no pending deferred events). Rehearse `db:migrate` once on a throwaway stack before the PCDC delivery.

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS. Archive can go ahead. Things to note:
  - the design drift recorded in §4 (security definer, the two added statements, the guard's message);
  - the "existing workspace is switched" scenario's evidence is the statement plus the counts, because the stack had no workspace at 1;
  - the fresh 001–023 install hasn't been rehearsed (§7);
  - the shared test stack is now at 023, so `main`'s database suite fails on it until this merges (design Risks).
- [ ] ❌ FAIL

**Next step**: the retrospective (step 7), then merge `main` and `/opsx:archive remove-intake-v1` (step 8), then push and open the PR (step 9).
