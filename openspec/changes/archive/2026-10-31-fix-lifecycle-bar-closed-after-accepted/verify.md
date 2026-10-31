# Verification Report

**Change**: `fix-lifecycle-bar-closed-after-accepted`
**Verified at**: `2026-10-31 00:40`
**Verifier**: Claude (controller session). The `openspec-verify-change` skill is not installed, so the checks below were run directly, as CLAUDE.md step 6 says.

PRECHECK: 4 commits on the branch since `main` (`5603e9e`). 6 of 6 tasks are `- [x]`.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item is `"valid": true`

**Result**:

```text
11 items, all valid: change/fix-lifecycle-bar-closed-after-accepted and the 10 canonical specs.
Totals: 11 passed, 0 failed (11 items)
```

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` is now `- [x]` (1.1–1.3, 2.1–2.3)

**Unfinished tasks**: none.

---

## 3. Delta Spec Sync State

| Capability | Sync state | Note |
|---|---|---|
| `case-lifecycle` | ✗ Needs sync | The MODIFIED "The lists and the case page show every stage" changes only the lifecycle-bar bullet and adds four scenarios. Archive (CLAUDE.md step 8) merges it. The final review diffed it against canonical lines 248–330 and found no other text difference. |

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design says | Spec says | Gap |
|---|---|---|---|
| D1 Closed not a step | Closed is drawn only for a closed case | "the bar SHALL NOT show Closed after Accepted for any case that is not closed" + scenario "The bar of an open case ends at Accepted" | none |
| D2 Accepted | all done, no current | "At Accepted every step SHALL be shown done, and no step SHALL be shown as the current one" + scenario | none |
| D3 neutral | earlier steps neutral, Closed current | "every step before it SHALL be shown neutral" + scenario "The bar of a closed case" | none |
| D4 unchanged | Rejected / Corrections unchanged | scenario "Rejected and Corrections in progress are unchanged" | none |

**Drift warnings** (non-blocking): none.

Code against spec: `src/staff-views.mjs` `lifecycleBar` matches D1–D4. It is pinned by `tests/staff-views.test.mjs`, which asserts the step states for preparing, review_ready, accepted (with mixed filing methods), closed, a closed case from a Hold, rejected, corrections, draft, unknown and on_hold with no origin. `aria-current` is checked too. `tests/shell.test.mjs` pins the neutral CSS rules.

---

## 5. Implementation Signal

- [x] The worktree has no unstaged files
- [ ] Every related commit is pushed (not yet: CLAUDE.md step 9 pushes after archive)

**Commit range**: `5603e9e..72aefc1`
- `1e9f5b9` the planning artifacts
- `eaa88fc` the bar, its CSS and tests, and the golden fixture
- `9639b21` the extra Corrections assertion from the final review
- `72aefc1` the task checkoffs

**Checks run**:

| Check | Why | Result |
|---|---|---|
| `npm test` | always | 1455 tests, 1455 pass, 0 fail (at `9639b21`; the baseline was 1452) |
| `npm run test:browser` | the case page and CSS changed | 79 tests, 79 pass, 0 fail, Firefox client and Chrome staff, about 19 min (at `eaa88fc`; `9639b21` adds one unit-test line only) |
| `npx openspec validate --all` | the change's artifacts | 11/11 valid |

**Not run, and why**:
- `db:migrate:test` / `test:database`: no migration, SQL or RPC change.
- `test:auth-browser`: sign-in is not touched.
- `build:hant -- --check`: no client text change.

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

- [x] No files from this change. `docs/superpowers/specs/` holds only the historical design documents from parts 1–4d, which CLAUDE.md says to keep. This branch adds nothing under `docs/superpowers/`; `git diff --stat 5603e9e..HEAD` touches only `openspec/`, `src/` and `tests/`.

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` rows, so this section is empty.

---

## Overall Decision

- [x] ✅ PASS: ready for the retrospective and archive
- [ ] ⚠️ PASS WITH WARNINGS
- [ ] ❌ FAIL

**Next step**: write `retrospective.md` (CLAUDE.md step 7), merge `main` into the branch, then archive (step 8).
