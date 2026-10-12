# Verification Report

> Produced after apply completed, to confirm the implementation agrees with the specs, design and tasks. The `openspec-verify-change` skill is not installed in this project, so each check below was run directly (CLAUDE.md, Workflow routing §2 step 6).

**Change**: `make-intake-v2-default`
**Verified at**: `2026-10-12`
**Verifier**: Claude (controller session), from the worktree `.claude/worktrees/make-intake-v2-default`

**PRECHECK:**
- Commits since the merge base `fe802c7`: **7**.
- `tasks.md` boxes ticked: **11**.
- Both are positive, so verification proceeded.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item is `"valid": true`

**Result**:

```text
{"totals": {"items": 1, "passed": 1, "failed": 0},
 "byType": {"change": {"items": 1, "passed": 1, "failed": 0},
            "spec": {"items": 0, "passed": 0, "failed": 0}}}
make-intake-v2-default  change  valid=true  issues=[]
```

No item failed.

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` is now `- [x]`: 11 of 11, none open.

**Open tasks**: none.

| Task | Why not done | Blocks archive? |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Notes |
|---|---|---|
| `client-intake` | ✗ Needs sync | `openspec/specs/` is still empty. This is the project's first canonical spec, and `/opsx:archive` (lifecycle step 8) creates `openspec/specs/client-intake/spec.md` from the delta. It was deliberately not synced earlier, because CLAUDE.md §4 says not to use `/opsx:sync` before archive. |

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design says | Spec says | Gap |
|---|---|---|---|
| D1: two statements only | The column default becomes 2, and every workspace is set to 2 | Req. 1: the default is 2 for new workspaces and for every existing one | None. 020 is byte-identical to the plan's text (Task 1 review). |
| D3: three requirements | New applications are version 2; an application keeps its version; a workspace's version decides its samples | Exactly these three ADDED requirements, 8 scenarios | None |
| D4: fixtures keep version 1 by default | Tests use `intakeVersion: null` to see the real default | Scenario "A new workspace defaults to version 2" is tested through `intakeVersion: null` | None |
| Known gap: no scope screening | Recorded in the proposal, not a requirement | No requirement claims screening | None |

**Drift warnings** (non-blocking). The run contradicted some planning statements: the test stack had only migrations 001–019 applied, so `npm run db:migrate:test` applied **020, 021 and 022 in number order**, which is the order a new database takes. The artifacts had expected the test stack to already hold 021 and 022, with 020 running after them. The artifacts record the agreed plan, so they are left as written, and the contradicted statements are listed here:

| # | Where | Statement | Status |
|---|---|---|---|
| 1 | design.md, D2 Choice | "even though 021 and 022 are already applied on the test stack" | Contradicted: they weren't |
| 2 | design.md, D2 Rationale | "so 020 runs after 022 on the test stack and before 021 on a fresh database" | Contradicted for the test stack. It took number order. |
| 3 | design.md, Migration Plan 2 | "On the test stack it applies after 021 and 022." | Contradicted |
| 4 | design.md, Migration Plan 4 | Inspection stands in for the new-database order | **Inverted.** Number order (020 before 021 and 022) actually ran. The order that now rests on inspection alone is "020 after 021 and 022", which a teammate's stack or checkout that already has 021 and 022 would take. The inspection still holds for it: 021 and 022 neither read nor write `default_intake_version`, and 020 touches nothing they define (confirmed again by the final review). |
| 5 | brainstorm.md, Q3 | "after 021 and 022 on a database that already has them (the test stack)" | Contradicted for the test stack |
| 6 | brainstorm.md, Acceptance | "020 applies on the test stack after 021 and 022." | Contradicted |
| 7 | plan.md, Global Constraints | "001–019, 021 and 022 are applied" | Contradicted. "Never touch them" still held. |
| 8 | plan.md, Task 1 Step 5 | "020 is applied after 021 and 022, which are already recorded." | Contradicted |
| 9 | plan.md, Task 2 Step 2 | The prescribed setup.md text "(…migration 020 applied after 021 and 022)" | Shipped text deliberately says "with 020, 021 and 022 applied in number order", by ledger ruling |
| 10 | tasks.md 1.5 | Implies only the new checks fail before 020 | The RED run also failed one test in `tests/database-review.mjs`, which expects 021's wording. It passed once 021 was applied. |

Other small drift:
- **design.md, the side-effect risk.** It says "each window re-reads its list, workspace, assistance items and open case". That is slightly too broad: `loadWorkspace` and `loadAssistance` return early unless the window is a presenter's, so a client window re-reads only its list and open case. The `enterOfficeDraftIfNeeded` swap is described accurately.
- **proposal.md's docs list.** It omits `docs/developer/architecture.md` (in tasks 3.1) and `docs/developer/production-roadmap.md` (added to Task 2 by ledger ruling). Both were updated.

---

## 5. Implementation Signal

- [x] No unstaged or uncommitted files in the worktree. `git status --short` shows only `?? node_modules`, which is the worktree's symlink to the main checkout's dependencies and is deliberately never committed.
- [ ] Every related commit is pushed. Not yet: pushing is lifecycle step 9, after archive.

**Commit range**: `fe802c7..747b34d` (7 commits).

**Tests and evidence:**
- **`npm test`:** 923/923, on 747b34d (the implementer, after the final fix wave; also run by the final reviewer).
- **`npm run test:database`:** 238/238 (233 + 5 new), on 9d448f1. The later commits change only docs, comments and `tasks.md`.
  - RED, before 020: four expected failures (column default, client case, office case, the reset's version-2 loop) plus the 021-wording test noted above. The "keeps version 1" check passed, which was expected because it guards 011.
- **`npm run db:migrate:test`:** applied 020, 021, 022.
- **Test stack, read-only query after migrating:**
  - `select default_intake_version, count(*) from public.workspaces group by 1` → `2 | 7`, so 7 workspaces, all at version 2;
  - the column default is `2`;
  - `schema_migrations` records 019, 020, 021 and 022.
- **Not run, by design (D5):** `test:browser` and `test:auth-browser`, because both fixtures set the version explicitly; and `build:hant -- --check`, because no client text changed.

**Spec scenario evidence:**

| Scenario | Evidence |
|---|---|
| A new workspace defaults to version 2 | The column-default check plus an `intakeVersion: null` fixture reading `[2, 2]` |
| An existing workspace is switched to version 2 | 020's `update` (no `where` clause) plus the query above (7 of 7 at 2). This is **post-state only**: no pre-020 count was captured, and no automated test re-runs the statement, because it would rewrite every workspace in the shared test database (ledger ruling). |
| A client's new application is version 2 | Test (fails without 020) |
| The office's new application is version 2 | Test (fails without 020) |
| A version-1 application survives the switch-over | Test (guards 011) |
| Updating an application does not change its version | Test (`SAVE_ANSWERS`), plus the existing `tests/database-intake.mjs` refusal of a direct version change |
| A version-2 workspace seeds version-2 samples | Test (fails without 020) |
| A workspace set back to version 1 seeds version-1 samples | Test (guards 019) |

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```bash
ls docs/superpowers/specs/*.md   # 8 files
```

- [x] Either there are no files, or the existing files are legitimate history from before the schema was installed.

All 8 files are historical design documents. The last commit to touch the folder is `b6f640d` (part 4d, #47, 2026-10-05), and this change added nothing there. CLAUDE.md keeps them as history ("do not remove, move or rewrite them").

| File | Captured in this change? | Action |
|---|---|---|
| — (none from this cycle) | — | none |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` rows, so this section is empty and counts as a pass.

| Deferred dogfood (plan §) | Equivalent automated test | Coverage assessment | Real gap? |
|---|---|---|---|
| — | — | — | — |

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS. Archive can go ahead. Things to note:
  - The run used a different migration order from the artifacts' expectation (§4, items 1–10), with no effect on correctness.
  - The "existing workspace is switched" scenario has post-state evidence only (§5).
  - The design's realtime side-effect wording is slightly broad, and the proposal's docs list misses two files (§4).
- [ ] ❌ FAIL

**Next step**: the retrospective (lifecycle step 7), then merge `main` and `/opsx:archive make-intake-v2-default` (step 8), then finish with a PR (step 9).
