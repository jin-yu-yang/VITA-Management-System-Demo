# Verification Report

**Change**: `gate-review-and-redesign-summary`
**Verified at**: `2026-10-14 17:20`
**Verifier**: Claude (Opus 5.5), the controller of the subagent-driven apply. The `openspec-verify-change` skill isn't installed, so the checks below were run directly (CLAUDE.md, lifecycle step 6).

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item is `"valid": true`.

**Result:**

```text
client-intake            spec    valid
draft-13614c             spec    valid
gate-review-and-redesign-summary   change  valid
staff-case-work          spec    valid
totals: 4 items, 4 passed, 0 failed
```

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` is now `- [x]`: 17 of 17, with 0 open.

**Unfinished tasks:**

| Task | Why unfinished | Blocks archive? |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Notes |
|---|---|---|
| `client-intake` | ✗ Needs sync | Five ADDED requirements. They are merged into `openspec/specs/client-intake/spec.md` by `/opsx:archive` (lifecycle step 8), after `main` is merged into the branch. As in the earlier changes, the capability's Purpose is broadened at archive to cover reviewing and submitting the application (design D9). |

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Spec | Gap |
|---|---|---|---|
| The gate | D1: 9.1 always; 9.2 with no alerts; 9.3 with no alerts and the earned visit; a gated place resolves to 9.1 | "The summary and Submit pages appear only after the alerts are fixed" (seven scenarios) | None |
| Earning 9.3 | D3: only Continue on 9.2 adds the `review.submit` visit, which is saved with the draft | Scenarios "Continue on 9.2 opens the Submit page" and "Leaving 9.2 another way doesn't earn 9.3" | None |
| Disabled Continue | D4: `disabled`, `aria-describedby="continue-blocked"` and the line "Fix the items above to continue." | "9.1's Continue waits for the alerts to be fixed" | None |
| Submit guard | D5: `controller.guardSubmit()`; with an alert it reveals and goes to 9.1, and nothing is submitted | Scenario "Submit pressed on a page drawn before an alert came back" | None |
| Summary layout and text | D6: intro, tools, then Expand all and Collapse all, then sections; paragraph 2 ends "or choose that part in the list of steps" | "The summary page explains itself and puts its tools first" | None |
| Folding and print | D7 and D8: `summary-shut:<step>` in `openPanels`, `setSummaryShut`, and every body shown in print | "Each summary section can collapse", and "The printed summary shows every section" (Print button) | None |

**Drift warnings (non-blocking):**
- **The review step's rail mark.** The final review found that `stepRollup` let the "Review & submit" step read Done before submission. That happened when 9.1 and 9.2 were visited and 9.3 not yet earned, which the plan's own test mandated. The controller ruled to restore the behaviour from before this change: the review step's mark is always blank (`stepRollup`: `if (stepId === "review") return mark("none")`, commit 36fc7ab).
  - Neither design.md nor the spec mentions it. It restores existing behaviour rather than adding any, and the historical design (2026-10-04 §3.3) says review.submit stays blank until submitted.
  - It is recorded in the retrospective. If the user wants it as a testable requirement, `/opsx:update` can add a scenario.
- **Continue starts from the resolved place.** The plan's `moveSubstep` computed the target from the raw saved place. The Task 1 review found that this left Continue doing nothing on a stored, unearned `review.submit`. The fix (f67f1e0) starts the move from `currentSubstep()`. This matches D3's intent, and the spec scenario "Continue on 9.2 opens the Submit page" now holds in that case too.

---

## 5. Implementation Signal

- [x] Nothing unstaged in the worktree. The only untracked entry is the local `node_modules` link; the `.env.test` link is ignored.
- [ ] All related commits pushed: not yet. They are pushed at lifecycle step 9, after archive.

**Commit range**: `3e69e58..36fc7ab`, 11 commits after the proposal commit. Branch `gate-review-and-redesign-summary`, base `main` a98f792.

**Checks run** (CLAUDE.md, Verification):

| Check | Result | Why |
|---|---|---|
| `npm test` | 934/934 (923 on `main`, plus 11 new) | Always |
| `npm run build:hant -- --check` | clean | 简体 client text changed |
| `npm run build:intake` | leaves nothing to commit | CI check; the catalogue is untouched |
| `npx openspec validate --all` | 4/4 valid | CI check |
| `npm run test:browser` | 57/57 on the first run (791 s), and 57/57 again after the final fix wave (777 s) | Views, the controller, `app.mjs` and CSS changed |
| `npm run test:database`, `npm run test:auth-browser` | not run | No migration, SQL, RPC, policy or sign-in change. The last counts (250 and 20) stand from `add-unmarried-intake-wording` |

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```bash
ls docs/superpowers/specs/*.md 2>/dev/null
```

- [x] The files there predate the schema and are allowed to stay.

The 8 files are the historical design documents of parts 1–4d. CLAUDE.md says to keep them and never add new ones. This change wrote nothing under `docs/superpowers/`.

| File | Captured in the change? | Action |
|---|---|---|
| — (historical only) | n/a | none |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` deferred rows, so this section passes empty.

The one check the change moved from the browser to unit level is the Submit guard's redirect for a stale 9.3 (design D5). It is covered by the controller test `guardSubmit: a Submit pressed on a stale page with an alert…`, which checks a missing answer alone and then a missing answer with an invalid one. A source pin in `tests/shell.test.mjs` covers the app wiring. One gap remains: no browser test checks the toast and keyboard placement after a forced Submit. Both reuse code the story exercises on other paths, and the retrospective records the gap.

| Deferred dogfood (plan §) | Equivalent automated test | Coverage assessment | Real gap? |
|---|---|---|---|
| — | — | — | — |

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS: the two drifts in §4. Both are recorded with rulings, and the retrospective carries them.
- [ ] ❌ FAIL

**Next step:** write `retrospective.md` (lifecycle step 7), then merge `main` and run `/opsx:archive` (step 8).
