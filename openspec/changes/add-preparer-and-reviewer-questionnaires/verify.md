# Verification Report

> Produced after apply finished, to confirm that the implementation agrees with the specs, design and tasks.
> A failed check sends the work back to the artifact it names, and verify runs again.

**Change**: `add-preparer-and-reviewer-questionnaires`
**Verified at**: `2026-10-19 14:45`
**Verifier**: Claude (controller session; the openspec-verify-change skill is not installed, so the checks
were run by hand, as CLAUDE.md §2 step 6 says)

**PRECHECK**: 23 commits on the branch since `git merge-base HEAD origin/main` (71e84d1); `tasks.md` has 32
ticked items. Both positive.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item `"valid": true`

**Result**:

```text
add-preparer-and-reviewer-questionnaires  valid
case-lifecycle                            valid
client-intake                             valid
draft-13614c                              valid
draft-14446                               valid
screen-states                             valid
staff-case-work                           valid
Totals: 7 passed, 0 failed
```

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` is now `- [x]` (32 of 32; plan.md has no unticked step and no `[~]` row)

| Task | Why not done | Blocks archive |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Note |
|---|---|---|
| `review-and-corrections` | ✗ Needs sync | New capability; no `openspec/specs/review-and-corrections/` yet. Archive creates it. |
| `office-follow-up` | ✗ Needs sync | New capability; archive creates it. |
| `case-lifecycle` | ✗ Needs sync | MODIFIED "Clients are told at each new step" and "Admins record signing and e-filing, with a confirmation". Each copies the canonical requirement in full (checked line by line) and adds to it. |
| `staff-case-work` | ✗ Needs sync | MODIFIED "Office follow-up contacts are logged in the contact log" (the task's purpose is preselected). |

All four are expected to sync at archive (CLAUDE.md §2 step 8, after main is merged in). None was synced early.

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Specs | Gap |
|---|---|---|---|
| D5 follow-up purpose | `admin_followups.purpose` in (`request_documents`, `go_over_return`); only a document task names a request | office-follow-up "A follow-up has a purpose…" | None |
| D10 contact step | approval completes it: reached on yes, no outcome on no | review-and-corrections "An approval with a questionnaire settles the review-contact step" | None |
| D11 variants | four plans, exact English and 简体 table (after wording review) | case-lifecycle "Clients are told at each new step" | None. The strings in `src/client-text.mjs` were compared character by character in review. |
| D13 wait | Mark ready to e-file refused while a go-over task is open; ends on any resolution | case-lifecycle "Admins record signing and e-filing…" | None |
| D7 layout | inline, reviewer form above Approve, collapsible groups | review-and-corrections "Approving a review requires…", "…records the Exit Form results" | Warning (below) |

**Drift warnings** (non-blocking):

- **Exit Form "Clear this section".** The final review found that an optional Exit Form group could not be emptied once a radio was picked, and each group now has a "Clear this section" control (ledger ruling). D7 and the spec don't mention it. The spec is silent, not contradicted. Record it in the retrospective; an `/opsx:update` can add a sentence to D7 if Hailey wants it kept in the design.
- **Class name.** plan.md names the group class `.q-group`. The code uses `q-exit-group`, because `q-group` was already the client intake's class and the new CSS restyled a client screen (ledger ruling). No spec names a class.
- **Builder season window.** D4 says the browser mirrors the database's rules. The builders check date format and real dates, not the D6 season window, so a wrong-year date is refused by the database with the generic "Please check the information and try again." (ledger ruling: deferred).

---

## 5. Implementation Signal

- [x] Nothing unstaged in the worktree (`git status --short` is empty)
- [ ] Every related commit pushed. The branch was pushed at 668d929 (planning) as a backup. The apply commits are local; Hailey asked to stop before the retrospective, archive and PR.

**Commit range**: `4472ecd..7648054` (apply, final-review fixes and the docs count).

**Checks run, at 294b513 / 7648054, all in this D: worktree:**

| Check | Why | Result |
|---|---|---|
| `npm test` | always | 1221/1221 (re-run by the controller at 7648054) |
| `npm run db:migrate:test` + `npm run test:database` | migration 033, RPCs, RLS, fixtures | applied; 320/320 (re-run by the controller at 7648054) |
| `npm run test:browser` | views, `app.mjs`, CSS and the story changed | 63/63, 915 s (fix-wave run at 294b513; Task 9 run 63/63, 920 s). Both ran in the worktree on D:, with no OneDrive problem. |
| `npm run build:hant -- --check` | client text in Chinese changed | exit 0 |
| `npx openspec validate --all` | CI | 7/7 |
| `npm run build:intake` then `git status` | CI | nothing to commit |
| `npm run test:auth-browser` | — | not run: nothing touches sign-in |

7648054 changed only two numbers in `docs/developer/README.md` after the browser run.

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```bash
ls docs/superpowers/specs/*.md 2>/dev/null   # 8 files
```

- [x] Files exist, and they are the historical design documents from parts 1–4d. CLAUDE.md says to keep them.
  This change wrote nothing there (its brainstorm and design are in the change folder).

| File | Captured in the change | Action |
|---|---|---|
| (8 historical files) | not this change's | none |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

plan.md has no `[~]` rows, so this section is empty.

Two coverage notes from the ledger, for the retrospective:
- The Yes approval's actual Mark ready to e-file move is pressed only in the database suite
  (`tests/database-stages.mjs` "a yes approval is not held up"). The story asserts that the button is offered but
  doesn't press it.
- "Clear this section" is covered by unit tests (markup and `forgetDrafts`), not by the browser story.

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS. The three §4 drift warnings and the two §7 coverage notes; the apply commits are not
  pushed yet.
- [ ] ❌ FAIL

**Next step**: stop for Hailey's review (she asked for no retrospective, archive or PR yet). After that: the
retrospective (step 7, with the ledger summary), merge main and archive (step 8), then finish and open the PR (step 9).
The PR description must call out the R28 revision (design D3) and the client-readable `signing_plan` /
`signing_appointment_at` (design D11), and say "Part of #85".
