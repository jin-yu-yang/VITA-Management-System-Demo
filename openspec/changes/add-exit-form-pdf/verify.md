# Verification Report

**Change**: `add-exit-form-pdf`
**Verified at**: `2026-11-03`
**Verifier**: Claude Opus 5.5 (the `openspec-verify-change` skill isn't installed, so the checks were done directly, per `CLAUDE.md`)

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] All items `"valid": true`

```text
totals: items 11, passed 11, failed 0
byType: change 1 passed, spec 10 passed
```

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` is now `- [x]` (13 of 13)

---

## 3. Delta Spec Sync State

| Capability | Sync state | Note |
|---|---|---|
| `review-and-corrections` | ✗ To be synced | Archive merges it (lifecycle step 8). The Purpose sentence is added by hand after that (design D9) |

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Spec | Gap |
|---|---|---|---|
| D2, known problems | Stated neutrally, with #122 | Four "Known problem, see #122" statements: Remarks cut and small debit date, font failure, blocked tab's link | None |
| D4, Chrome only | The story reads the PDF with a Chrome staff window | Scenarios say what happens; section 8 below lists the gap | None |
| D5, wrong font bytes | The failure's trigger | "A failed font check stops the form" | None |
| D3, source pins | `viewExitForm` pinned at the source | "A client window makes nothing" | None |

**Drift warnings:** none. The design and spec were corrected during apply, and the changes are listed in section 8.

---

## 5. Implementation Signal

- [x] No uncommitted files in the worktree (`git status --short` empty before this file)
- [ ] All commits pushed: not yet. The PR is the last step (lifecycle step 9)
- [x] `git diff origin/main -- src/ server.mjs supabase/` is empty

**Commit range:** `7831621..HEAD`

---

## 6. Front-Door Routing Leak Detector

- [x] The 8 files in `docs/superpowers/specs/` are historical, the newest dated 2026-10-04. This change wrote nothing there

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` rows, so this section is empty.

---

## 8. Project checks and known gaps

### Test runs

| Check | Result | Commit |
|---|---|---|
| `npm test` | 1489/1489 | `7dc20b9` |
| `npx openspec validate --all` | 11/11 | `3bcb9e4` |
| `npm run test:browser` | **81/81** | `0ca5086` |

`tests/browser.mjs` last changed in `e071229`, before that run. The later commits change only unit tests, docs and the spec, so the story wasn't run again (plan, Task 4).

Why the other checks weren't needed: no database, RPC, sign-in or client-text change, so `test:database`, `test:auth-browser` and `build:hant -- --check` don't apply.

**Every `test:browser` run on this branch:**

| Run | Commit | Result | What happened |
|---|---|---|---|
| 1 | `3b1609e` | 54/56 (stopped) | The new phase waited for `.problem-banner`, which the staff case page doesn't draw. A real error in the plan, not flake #120 |
| 2 | `517ad01` | 81/81 | Passed, but the final review found the blocked-tab check accepted a link nobody could see |
| 3 | `0ca5086` | 81/81 | The check now asserts where the link really is |

**At lifecycle step 8:** if merging `main` brings new commits, `test:browser` is run again and the result added here. If `main` has not changed, it isn't run again.

### Known gap: Firefox

The Exit Form's content is verified only in Chrome. Firefox downloads a blob PDF instead of opening it in the tab, so there is nothing to read. In the Firefox-staff browser order, the phase records "not run". The story's existing draft checks do the same. The unit tests build real PDFs in Node, so what's drawn is covered without a browser; what isn't covered is a Firefox tab showing the form, or its failure and blocked-tab paths.

### Checked: can a volunteer not on the case see more through the PDF?

No. In Chrome, with a real staff account that is neither the case's preparer nor its reviewer, the case page already shows:

| On the PDF | Where that volunteer already sees it |
|---|---|
| Client's name | Intake answers tab |
| Client number | Case header (`Client #006`) |
| The reviewer's Exit Form content | Overview tab, Independent review |

The account can also read those rows itself (`cases`, `reviewer_questionnaires`). So the PDF exposes nothing extra, and no separate issue was opened. The spec records that this volunteer sees the button. Limiting who sees which case is already on the February roadmap (`docs/m4-tradeoffs.md`, "Who sees which case").

### Evidence that is weaker than a browser press

- **"A client window makes nothing":** source pins only (`tests/shell.test.mjs`): the staff-window guard, and no client view emits the action. No test presses it as a client.
- **"SHALL NOT be uploaded or stored":** the pin allows only reading and reporting calls on the controller, and the story checks stage and revision don't change. It doesn't watch the network.
- **"The link stops working":** a unit test pins the 60-second timer in `createDraftOffer`. The story doesn't wait 60 seconds.
- **The couple's rule:** `tests/exit-form.test.mjs` tests the marks; `viewExitForm`'s use of `spouseShown` is pinned at the source.

### Known problems recorded, not fixed (#122, before the February pilot)

Long Remarks cut with no warning; the small debit date; a font failure stopping the form; a blocked tab's link not visible where the button is; a failed tab titled "Draft 13614-C" (in #122, and the spec promises no title).

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS: may go on to the next steps. Warnings: the Firefox gap and the weaker evidence listed in section 8, and the known problems in #122
- [ ] ❌ FAIL

**Next:** `retrospective.md`, then merge `main`, archive and open the PR.
