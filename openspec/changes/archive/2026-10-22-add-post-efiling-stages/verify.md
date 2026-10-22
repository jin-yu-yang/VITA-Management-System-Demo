# Verification Report

**Change**: `add-post-efiling-stages`
**Verified at**: `2026-10-22`
**Verifier**: Claude (controller of the apply run; the `openspec-verify-change` skill isn't installed, so the checks were run directly, per CLAUDE.md §2 step 6)

Precheck:
- `git log --oneline origin/main..HEAD`: 26 commits.
- `grep -c '^- \[x\]' tasks.md`: 28.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item is `"valid": true`.

**Result:**

```text
Totals: 9 items, 9 passed, 0 failed
  change add-post-efiling-stages: valid, no issues
  specs: case-lifecycle, client-intake, draft-13614c, draft-14446, office-follow-up,
         review-and-corrections, screen-states, staff-case-work: valid
  Only INFO notes ("Requirement text is very long"), in the existing canonical specs
```

| Item | Type | Issues |
|---|---|---|
| — | — | none blocking |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` is now `- [x]` (28 of 28; 0 open).

**Open tasks:**

| Task | Why open | Blocks archive? |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Notes |
|---|---|---|
| `case-lifecycle` | ✗ Needs sync | 3 ADDED and 5 MODIFIED requirements. Archive merges them (`/opsx:archive`, after merging `main`, per CLAUDE.md §2 step 8). |
| `client-intake` | ✗ Needs sync | 1 MODIFIED requirement ("Sample cases are version 2": eight samples). Merged at archive. |

Not syncing before archive is expected: CLAUDE.md §4 reserves `/opsx:sync` for when the user asks.

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Specs | Gap |
|---|---|---|---|
| Fix-note deletion | D2: notes never updated; deleted only with their whole case (sample reset, sample checkpoint, workspace teardown) | "Admins record each return's filing result": "A note is removed only together with its case…", plus the scenarios "A note can't be changed" (real case) and "A note goes with its sample" | none (aligned by the `/opsx:update` of 2026-10-22) |
| D5: Return to signing waits for every answer | D5 | "A rejected case returns to signing": refused while any return still waits, with the waiting text | none |
| D3: second filing takes only the rejected returns | D3 | "Admins record signing and e-filing": second-filing rules | none |
| D8: per-method names | D8 | stage table and client label table | none |
| D11: colouring only while an e-file acknowledgment waits | D11 | "The lists and the case page show every stage" | none |
| D13: two new samples | D13 ("eight samples"; a `client-intake` delta records it) | `client-intake` delta | none |

**Drift warnings** (non-blocking):
- Design D2 says the filing tables are "loaded by `relatedRows`". The implementation reads them directly, because they have no `created_at` (an apply ruling). The behaviour is unchanged.
- Implementation additions the spec doesn't name, consistent with D5:
  - a Rejected case with a paper return not yet recorded as mailed shows "Record when the … is mailed before the return can go back to signing.";
  - mixed waiting (one e-filed return, one paper return) shows both row sentences joined.
- The staff case list reads `filing_notes` for staff only, so the Follow-ups Rejected row can show the latest note. This is a store detail; the spec requires the behaviour.

---

## 5. Implementation Signal

- [x] Nothing unstaged in the worktree (`git status --short` is empty).
- [ ] Every relevant commit is pushed. **Not yet**: the branch is pushed at step 9 (finish), after archive.

**Commit range**: `559c1a0..bfd68a1` (proposal → this verify). The code is final at `0b0e276`; later commits touch only `openspec/changes/add-post-efiling-stages/`.

Checks at `0b0e276`, against the baseline from #93's verify:

| Check | Result | Baseline |
|---|---|---|
| `npm test` | 1279 / 1279 | 1235 |
| `npm run build:hant -- --check` | clean | — |
| `npm run build:intake` | "the newest catalogue migration already records this catalogue"; nothing to commit | — |
| `npm run db:migrate:test` + `npm run test:database` | 035 applied; 374 / 374 | 326 |
| `npm run test:browser` | 65 / 65, 1048 s | 63 |
| `npx openspec validate --all` | 9 / 9 | — |
| `npm run test:auth-browser` | not run: nothing touches sign-in | — |

`npm test`, the 繁體 check, the database suite and the browser story were each also green at `358e3ea`, before the final fix wave (unit 1278, database 373, story 65).

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```bash
ls docs/superpowers/specs/*.md
```

- [x] The files there are historical documents from before the schema was installed.

The eight files are dated 2026-09-14 to 2026-10-05: the parts 1–4d design documents, which CLAUDE.md keeps in place. This change wrote nothing there; its design is in `brainstorm.md` and `design.md`.

| File | Captured in the change? | Action |
|---|---|---|
| — | — | none |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` rows (`grep -c '\[~\]'` = 0). No manual check was deferred: the browser story drives the whole rejection loop through the UI.

| Deferred dogfood | Equivalent automated test | Coverage | Real gap? |
|---|---|---|---|
| — | — | — | — |

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS — the warnings are the non-blocking drift notes in §4. The delta specs sync at archive. The branch is pushed at finish.
- [ ] ❌ FAIL

**Next step:** `retrospective.md` (CLAUDE.md §2 step 7), then merge `main` and `/opsx:archive`, then finish with a PR.
