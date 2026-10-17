# Verification Report

**Change**: `unify-empty-states`
**Verified at**: `2026-10-16`
**Verifier**: Claude (controller session). The `openspec-verify-change` skill is not installed, so the checks below were run directly, as CLAUDE.md says.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item returns `"valid": true`

**Result**:

```text
totals: items 6, passed 6, failed 0
  unify-empty-states  change  valid
  client-intake       spec    valid  (INFO only; not touched)
  draft-13614c        spec    valid
  draft-14446         spec    valid  (INFO only; not touched)
  screen-states       spec    valid  (now includes #78's four requirements)
  staff-case-work     spec    valid  (INFO only; not touched)
```

| Item | Type | Issues |
|---|---|---|
| — | — | none |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` has become `- [x]` (13 of 13).

**Open tasks**: none.

Notes on ticked items:
- **5.2 "Run `npm run test:browser` once."** The user's rule: run it once; if it fails at a step this change doesn't touch, record it and move on. The one run at `af373cb` had 53 tests, 51 passed and 2 failed.
  - **Chrome client / Firefox staff: passed every phase** (545.3 s).
  - **Firefox client / Chrome staff: 22 phases passed, then one failed outside this change.**
    - The passing phases include every phase that shows an empty state: the board, the Follow-ups empty state and its undo buttons, and applicant B's "No applications yet".
    - It then failed in "two presenter windows in one browser keep their own persona" (28.7 s). The test waited 20 s for "Work board" in a new presenter window that never rendered: no title, no sections, empty page.
    - That is a page-load failure in a phase with no empty state. As the user asked, it was recorded and not retried.
  - **The final fix wave (`8e140b9`) ran after this run.** It changes no rendered markup: the golden test is unedited and passes, and the one changed call renders the same bytes. So the run's result stands without a second run, which is the user's one-run rule.
- **3.2, the pool.**
  - **What the plan missed:** a phase tab with cases elsewhere in the season would have said "No cases yet this season.", because `narrowed` deliberately leaves out `poolPhase`. The task review caught it.
  - **Fix round 1 (`514851d`):** the condition is now `narrowed || chosen.poolPhase !== "all"`, with a test.
  - **The final fix wave** pinned two more combinations: no cases plus a phase tab, and a filter plus a phase tab.

### Checks run

| Check | Result | Why |
|---|---|---|
| `npm test` | 1067 / 1067 pass (1061 before, after merging `main`, + 6 new) | Always |
| Golden test `tests/empty-states.test.mjs` | Pass, fixture unedited since capture (`ec899b9`, before any `src/` change) | The guard: identical markup for 15 empty states (board ×6, queue ×3, applications EN/简体, client progress, full staff case page, full admin case page, calls) |
| `npm run test:browser` | One run: 51 / 53. One pairing passed everything; the other failed in a presenter-window page load, outside this change (above) | Views changed |
| `npm run build:hant -- --check` | Exit 0, nothing to regenerate | Checks that no client text changed |
| `npm run db:migrate:test` | "Approved test migrations applied." | Environment, before the browser run |
| `npm run test:database`, `npm run test:auth-browser` | Not run | No database or sign-in change |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Note |
|---|---|---|
| `screen-states` | ✗ Needs sync | 2 ADDED requirements, not yet in `openspec/specs/screen-states/spec.md` (which has #75's 5 and #78's 4). Archive appends them. |

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Spec | Gap |
|---|---|---|---|
| Two helpers; callers keep their words and their ready-made buttons | D1 | Req 1 ("built by one of two shared helpers"; words, actions and `data-*` unchanged) | None |
| Identical markup except the pool and the drawer line | D2 | Req 1 (last sentence), Req 2 | None |
| Pool: two sentences, folder icon, no second Clear filters | D3 | Req 2 and its two scenarios | Wording note below |
| Case sections: only the empty line changes | D4 | Req 1 (sections show one muted line) | None. All ten section lines use `emptyLine`, including the History tab's "What the client sees" line, through `emptyLine(text, attrs)` after the final review. |
| Requirements in `screen-states` | D5 | Delta under `specs/screen-states/` | None |

**Drift warnings** (non-blocking):

- **The pool with only a phase tab set.**
  - The spec says "When a filter is set, Clear filters SHALL stay in the line above the list, and the empty state SHALL NOT repeat it."
  - With only a phase tab set (ruled to count as a filter for the sentence), the summary line shows no Clear filters. Its condition is `narrowed`, which by design leaves out the phase. The visible undo is the "All cases" tab chip right above, which meets Req 1's "or beside it".
  - The summary line also still reads "No filters. Showing every case this season." in that case. That's old code, outside this change's empty-state scope, and left for Jinyu's phase-tab change (final review F-M1). The PR description mentions it.
  - The spec sentence reads correctly as "stays where it is, not repeated", but a later change could tighten the wording.
- **The Log a call drawer's line is now muted.** This is intended, and approved by the user while reviewing the artifacts.

---

## 5. Implementation Signal

- [x] No unstaged or uncommitted files in the worktree (`git status --short` is empty)
- [ ] All related commits are pushed. Not yet: the push happens at the finish step, after archive. `origin/main` hasn't moved since the merge of #78.

**Commit range**: `7404fb6..ea9be16`, before the verify, retrospective and archive commits.

| Commit | What |
|---|---|
| 43eb038 | planning artifacts |
| 81c173a | merge of `main` (#78) before Task 1, so the golden reflects the code built on |
| ec899b9 | golden markup, captured before any `src/` change |
| a2f5851, 9907253 | `emptyState`, `emptyLine` (the second commit undoes a whitespace slip; the net diff is additions only) |
| 7bf9bfe | panel lists use `emptyState`; pool wording |
| 514851d | fix round 1: an empty phase tab says "No case matches these filters." |
| e17759d | case sections use `emptyLine`; the drawer line is muted |
| af373cb | docs |
| 8e140b9 | final-review fixes: `emptyLine(text, attrs)` for the client-history line; docs on escaping; two more pool cases |
| ea9be16 | tasks ticked |

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```bash
ls docs/superpowers/specs/*.md 2>/dev/null
```

- [x] Either no files, or the files that exist predate the schema install and are legitimate

| File | Content captured in the change? | Action |
|---|---|---|
| 8 historical design documents (parts 1–4d) | Not this change's: `git diff --name-only 7404fb6..HEAD -- docs/superpowers` is empty | None. CLAUDE.md says to keep them. |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` rows, so this section is empty and passes.

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS. Every check passes. The warnings:
  - the single browser run had one pairing fail in a presenter-window page load, outside this change;
  - the pool's phase-tab-only case (spec wording and the old summary line), left for Jinyu's phase work.
- [ ] ❌ FAIL

**Next**:

1. Write `retrospective.md` with the ledger summary, then delete the subagent-driven development workspace.
2. Merge `main` if it has moved, then run `/opsx:archive`.
3. Push and open the PR. Tell Jinyu that a new board phase adds one `EMPTY_TAB` entry, and mention the pool's phase-tab summary line. Don't merge it.
