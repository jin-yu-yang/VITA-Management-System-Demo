# Verification Report

> Produced after apply finished, to confirm that the implementation agrees with the specs, design and tasks.
> A failed check sends the work back to the artifact it names, and verify runs again.

**Change**: `add-preparer-and-reviewer-questionnaires`
**Verified at**: `2026-10-19 14:45`, updated after Hailey's localhost check (d1a9e08)
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

- ~~**Exit Form "Clear this section".**~~ Resolved in d1a9e08: the requirement "The reviewer questionnaire records the Exit Form results" now says each group has the button, with the scenario "A group chosen by mistake can be cleared", and D7 describes it.
- **Class name.** plan.md names the group class `.q-group`. The code uses `q-exit-group`, because `q-group` was already the client intake's class and the new CSS restyled a client screen (ledger ruling). No spec names a class.
- **Builder season window.** D4 says the browser mirrors the database's rules. The builders check date format and real dates, not the D6 season window, so a wrong-year date is refused by the database with the generic "Please check the information and try again." (ledger ruling: deferred).

---

## 5. Implementation Signal

- [x] Nothing unstaged in the worktree (`git status --short` is empty)
- [ ] Every related commit pushed. The branch was pushed at 668d929 (planning) as a backup. The apply commits are local; Hailey asked to stop before the retrospective, archive and PR.

**Commit range**: `4472ecd..d1a9e08` (apply, final-review fixes, docs counts, and the post-localhost minors).

**Checks run, all in this D: worktree** (at 294b513 / 7648054, and again for unit tests at d1a9e08):

| Check | Why | Result |
|---|---|---|
| `npm test` | always | 1221/1221 at 7648054; 1223/1223 at d1a9e08; **1224/1224 after the date change; **1225/1225 after the ICU fix, on both Node 24.13.0 (ICU 77.1) and CI's Node 24.21.0 (ICU 78.3)** |
| `npm run db:migrate:test` + `npm run test:database` | migration 033, RPCs, RLS, fixtures | applied; 320/320 (re-run by the controller at 7648054) |
| `npm run test:browser` | views, `app.mjs`, CSS and the story changed | 63/63, 915 s (fix-wave run at 294b513; Task 9 run 63/63, 920 s). Both ran in the worktree on D:, with no OneDrive problem. |
| `npm run build:hant -- --check` | client text in Chinese changed | exit 0 |
| `npx openspec validate --all` | CI | 7/7 |
| `npm run build:intake` then `git status` | CI | nothing to commit |
| `npm run test:auth-browser` | — | not run: nothing touches sign-in |

7648054 changed only two numbers in `docs/developer/README.md` after the browser run.

**After Hailey's localhost check (d1a9e08):**
- The went-over date now reads MM/DD/YYYY. This view change is not covered by the story: no story step asserts that date.
- Two tests pin that "Ready for review on" is marked Changed only when the date differs. That was already the behaviour, so no code changed.
- The spec and design now describe "Clear this section".
- No SQL changed, so the database suite was not re-run (320/320 at 7648054 still stands).
- The story doesn't assert the went-over date's text, so `test:browser` was not re-run (63/63 at 294b513 still stands).
- `openspec validate` for the change: valid.

**After the PR opened (#92), Hailey asked for every questionnaire date on staff screens as MM/DD/YYYY.** The went-over
date's helper now also formats:
- ready for review (in the panel and the comparison);
- completed on;
- the Exit Form debit date;
- the appointment's date part (its time stays as entered, `14:30`).

A new view test pins all four, and the "Changed" test now expects `10/17/2026`. The story asserts none of these strings
(checked with a grep of `tests/browser.mjs`), so `test:browser` was not re-run. `npm test` is 1224/1224.

**CI failure on PR #92 (ICU).** `tests/domain.test.mjs` "appointment text" failed on CI. Its Node 24.21.0 (ICU 78)
formats `zh-Hant` as "11月2日星期一 下午2:30", where local ICU 77 gave "11月2日 星期一 下午2:30".
- `signingWhen` now takes only the words from `formatToParts` (weekday, English month, 上午/下午) and assembles
  the shape itself. 简体 and 繁體 both read "11月2日星期一 下午2:30" (design D11 updated).
- A new test covers midnight, noon and a morning time.
- `npx -y node@24.21.0 --test tests/*.test.mjs` passes 1225/1225, and so does the local `npm test`.
- `build:hant -- --check` is clean and `openspec validate --all` passes 8/8.
- The story asserts no Chinese appointment text, so it was not re-run.

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

## Review round: Jinyu's CHANGES_REQUESTED on PR #92 (2026-10-20)

**Finding.** With a "No" approval, the client kept reading "PCDC will contact you to go over your return together"
after the office had resolved the go-over follow-up. It only changed at Mark ready to e-file. The spec never said what
the client sees after the go-over.

**Fix:**
- `033` redefines `act_resolve_followup`, verbatim from 004 with `-- 033` lines.
- Resolving a `go_over_return` task, with either outcome, turns a `go_over_first` plan into the reviewer's signing
  method: `portal`; `same_day`; or `appointment` with the stored time.
- A "No" approval cannot leave an in-person, not-same-day appointment empty: D6's rule applies whatever the go-over
  answer. So no "arrange signing" variant was added.
- 033 was confirmed absent from `origin/main` (71e84d1) and from any hosted project before it was edited.
- **Specs:** `case-lifecycle` (canonical and the archived delta) gets the rule and the scenario "After the go-over is
  resolved the client sees the signing variant". `office-follow-up` gets the cross-reference.
- **Design:** D11 and D12 in the archived design are updated. `docs/developer/database.md` now records the new
  definition.

**Checks** (in the D: worktree):

| Check | Result |
|---|---|
| `npm test` | 1225/1225 |
| `npm run db:migrate:test` + `npm run test:database` | applied; 321/321 (new test "after the go-over is resolved the client sees the signing variant") |
| `npm run test:browser` | 63/63 (about 20 min); the story now asserts that the client sees the Customer Portal message after the resolve |
| `npx openspec validate --all` | 8/8 for everything on the branch |

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS. Two §4 notes remain (the class name differs from the plan, and the builders don't
  repeat the season-date check) and the two §7 coverage notes; the apply commits are not pushed yet.
- [ ] ❌ FAIL

**Next step**: stop for Hailey's review (she asked for no retrospective, archive or PR yet). After that: the
retrospective (step 7, with the ledger summary), merge main and archive (step 8), then finish and open the PR (step 9).
The PR description must call out the R28 revision (design D3) and the client-readable `signing_plan` /
`signing_appointment_at` (design D11), and say "Part of #85".
