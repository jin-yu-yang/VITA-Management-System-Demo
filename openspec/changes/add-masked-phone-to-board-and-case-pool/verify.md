# Verification Report

**Change**: `add-masked-phone-to-board-and-case-pool`
**Verified at**: `2026-10-16`
**Verifier**: Claude (controller session). The `openspec-verify-change` skill is not installed, so the checks below were run directly, as CLAUDE.md says.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item returns `"valid": true`

**Result**:

```text
totals: items 5, passed 5, failed 0
  add-masked-phone-to-board-and-case-pool  change  valid
  client-intake                            spec    valid  (INFO only: long requirement text; not touched by this change)
  draft-13614c                             spec    valid
  draft-14446                              spec    valid  (INFO only: long requirement text; not touched by this change)
  staff-case-work                          spec    valid  (INFO only: long requirement text, existing requirements)
```

| Item | Type | Issues |
|---|---|---|
| — | — | none blocking |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` has become `- [x]` (12 of 12).

**Open tasks**: none.

Notes on ticked items:
- **4.3 "the board, pool and queue phases still pass."** It was ticked only after a full clean `npm run test:browser`, after `main` (#69–#72) was merged into the branch (6cbf268).
  - **During apply** (at f4f7d83 and 25cbae1), three runs failed. Each failed at a different step outside this change: a client `fill-fictional` click, the 600 s permutation cap after a slow intake walk, and a `choosePersona` wait. A baseline run on `main` (a98f792) also failed: `page.goto` to the local app timed out. The new phase passed in both full runs (9.1 s, 10.0 s). 4.3 was left open and the session stopped for the user.
  - **After the merge**, migrations 026–030 from `main` were applied with `npm run db:migrate:test`. The stack's auth and REST endpoints answered 200 in under 0.4 s. The user agreed to up to three more runs, with nothing else running on the machine:

    | Run | Chrome client / Firefox staff | Firefox client / Chrome staff | New phase |
    |---|---|---|---|
    | 4 | Every phase passed; the permutation hit `PERMUTATION_TIMEOUT_MS` (600 s) | Failed: "Save & exit comes back after signing in again" timed out waiting for the sign-in screen after sign-out | Passed (11.6 s) |
    | 5 | Failed: "a client walks the version-2 intake": "a long answer redrew the page" | **Passed** | Passed (12.0 s, 8.2 s) |
    | 6 | **Passed** (551 s) | **Passed** (519 s) | Passed (8.9 s, and in the other pairing) |

    Run 6: **59 / 59 pass**, exit 0. Every failure in runs 4 and 5 is in client intake, client sign-in or the permutation time cap. This change touches none of them.

### Checks run

| Check | Result | Why |
|---|---|---|
| `npm test` | 1011 / 1011 pass, after the merge of `main` | Always |
| `npm run test:browser` | 59 / 59 pass in run 6, both pairings (runs 4 and 5 failed at unrelated steps, above) | The change touches views, the store's list read and the story |
| `npm run db:migrate:test` | Applied 026–030 (`main`'s migrations, not this change's) to the local stack | Environment catch-up after merging `main`, so the browser suite runs against the current catalogue |
| `npm run test:database` | Not run | No migration, SQL function, RPC, RLS or realtime change. The new read is a client-side `select` that existing RLS already allows (design D2) |
| `npm run test:auth-browser` | Not run | Sign-in is untouched |
| `npm run build:hant -- --check` | Not run | No client text changed; staff screens stay English (CI runs it anyway) |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Note |
|---|---|---|
| `staff-case-work` | ✗ Needs sync | 4 ADDED requirements, none yet in `openspec/specs/staff-case-work/spec.md`. Archive merges them. The canonical spec now also holds #70's two language requirements, which the merge brought in; they don't overlap with these. |

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Spec | Gap |
|---|---|---|---|
| Phone column right after Stage, on both tables | D6 | Req 1 scenarios "The board/case pool shows the phone column after Stage" | None |
| One rule: `listPhone` → `phoneMask` + `canSeeContact`, the pool too | D3, D5 | Req 1 ("the same rule as the staff case page"), Req 2 (admin reveals every pool phone) | None |
| Only `case_id,phone` read; no spouse phone | D2 | Req 1 scenario "The spouse phone is not listed" | None |
| Ids `board-phone-<id>` / `pool-phone-<id>` keep focus across redraws | D4 | Req 2 scenario "A realtime update keeps a revealed listed number revealed" | None |
| Claim unlocks the row in another window without a reload | D8 | Req 4 scenarios | None |
| Footnote sentences | D7 | Req 1 ("Each table's note SHALL … add one sentence") | None |

**Drift warnings** (non-blocking):

- **Language cell after the merge.** #70 changed the Language cell to letters (`languageCell(...)`). The rows now read Client, Stage, Phone, Language, …, which matches both Req 1 here ("Client, Stage, Phone, then the rest") and #70's "Staff tables show every language" requirement. The merge resolution kept both cells.
- **Open question carried over.** The `staff-case-work` Purpose line still names only the case page (design, Open Questions; owner: the user). Wording only.

---

## 5. Implementation Signal

- [x] No unstaged or uncommitted files in the worktree (`git status --short` is empty)
- [ ] All related commits are pushed. Not yet: the push happens at the finish step (CLAUDE.md step 9).

**Commit range**: `a98f792..8089863`, before the verify, retrospective and archive commits.
- 51d96f7: planning artifacts
- 9a406c8: the list read loads each listed case's phone
- 6d18d9a: the work board's Phone column
- e5ce512: the case pool's Phone column
- f4f7d83: browser phase, a claim unlocks the board's phone in place
- 318bfd1: DESIGN.md §8
- 25cbae1: final-review fixes
- 6cbf268: merge of `main` (#69–#72); conflicts in `staff-views.mjs` and `pool-views.mjs` resolved by keeping the Phone cell and `main`'s language cell
- 8089863: task 4.3 ticked

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```bash
ls docs/superpowers/specs/*.md 2>/dev/null
```

- [x] Either no files, or the files that exist predate the schema install and are legitimate

| File | Content captured in the change? | Action |
|---|---|---|
| 8 historical design documents (parts 1–4d) | Not this change's; this change's commits add nothing under `docs/superpowers/` | None. CLAUDE.md says to keep them. |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` rows, so this section is empty and passes.

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS. Every check passes. The warning: the browser suite is flaky on this machine at steps outside this change (client intake, client sign-in, and a permutation time that runs close to the 600 s cap). It took three runs to get a clean pass. Recorded in the retrospective as a follow-up.
- [ ] ❌ FAIL

**Next**:

1. Write `retrospective.md`, including the ledger summary, then delete the subagent-driven development workspace.
2. Merge `main` into the branch again if it has moved, and run `/opsx:archive`.
3. Push and open the PR, which says the change is display-only and notes the browser-suite flakiness. Don't merge it.
