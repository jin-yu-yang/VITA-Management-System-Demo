# Verification Report

**Change**: `add-staff-identity`
**Verified at**: `2026-10-26`
**Verifier**: Claude (controller session). The `openspec-verify-change` skill isn't installed, so the checks below were run directly, as the schema's fallback allows.

Precheck:
- 37 commits since the merge base with `origin/main` (96f1a1d).
- 28 checked boxes in `tasks.md`.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item is `"valid": true`.

**Result:**

```text
totals: items 9, passed 9, failed 0
change add-staff-identity: valid
specs: case-lifecycle, client-intake, draft-13614c, draft-14446, office-follow-up,
       review-and-corrections, screen-states, staff-case-work: valid
```

Only INFO notes remain: some requirements are longer than 500 characters. They aren't failures.

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] Every box is checked: 28 of 28, none left open.

| Task | Why not done | Blocks archive? |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

The branch doesn't touch `openspec/specs/` (`git diff --name-only 96f1a1d..HEAD -- openspec/specs` is empty). Archive merges the deltas.

| Capability | Sync state | Notes |
|---|---|---|
| sign-in | ✗ Needs sync | New capability: 8 ADDED requirements. `openspec/specs/sign-in/` doesn't exist yet; archive creates it |
| staff-case-work | ✗ Needs sync | 5 ADDED requirements: the persona is the staff account's own person, attribution, independence across accounts, same rows as presenters, and screens without the persona picker or demo tools |

Both are expected before archive. CLAUDE.md step 8 syncs them through `/opsx:archive`, not `/opsx:sync`.

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Specs | Gap |
|---|---|---|---|
| D1/D2 staff access, `people.user_id` | third access `staff`, linked to exactly one person; commit-time check | sign-in "A signed-in account acts as a client, a presenter or a staff member" | none |
| D3 resolver at every entry point | `acting_person` before digest and receipt; six RPCs incl. `vitally_close_unsigned` | sign-in "A staff account always acts as its own person" (six RPCs, receipts' actor) | applicant row: see drift |
| D4 presenters and staff people | a presenter can't act as a linked person | sign-in "A presenter cannot act as a staff member's person" | none (the picker now also hides linked people: drift) |
| D5 staff visibility | 21 policies, locks, `check_operation_authority`, contact checks widened; `filing_notes` read-only | staff-case-work "Staff see the same cases and rows as presenters" | none |
| D6/D7 roster and re-runs | `staff` list, `defaultFollowup` (required without a presenter), re-runnable `initialize_workspace` | sign-in roster, staff-only and default follow-up requirements | none |
| D9 browser | principal carries the person; staff send no person; no picker or demo tools | staff-case-work "A staff account's screens have no persona picker or demo tools" | none |

**Drift warnings** (non-blocking):
- D3's table says an applicant naming a person gets FORBIDDEN from the resolver. As built, the resolver passes it through and the existing checks refuse it (FORBIDDEN, or NOT_FOUND first for a case the client can't see), which keeps clients' behaviour unchanged as the sign-in spec requires. Ruling T3-b; docs/developer/database.md describes it as built.
- D4 assumed no workspace mixes presenters and staff. `roster.example.json` and docs/setup.md now create that mix, so the presenter's persona picker hides staff-linked people and `selectPerson` refuses them (ruling F-a, from the final review). The spec already said a presenter chooses only unlinked people.
- D6's roster rules gained one refusal the design doesn't list: an empty capabilities list (ruling T5-a).

**Resolved after verify:** design.md (D2, D3, D4, D6, D9, Risks, Migration Plan) and the sign-in spec's roster refusals now describe all three as built, so no drift remains.

---

## 5. Implementation Signal

- [x] No unstaged files in the worktree (`git status --short` is empty).
- [ ] All related commits pushed. The planning commits (2e226e0, 2bbbdff) and the merge of `main` (86a7358) are pushed. The implementation commits are pushed in the finish step (CLAUDE.md step 9), after archive.

**Commit range**: `2bbbdff..0b6cb2b` (implementation, fixes and tasks.md check-offs). Base: `2bbbdff` (planning, updated after the merge of `origin/main` at 86a7358).

**Checks run at 0b6cb2b:**

| Check | Count | Baseline (main at 96f1a1d) |
|---|---|---|
| `npm test` | 1370 / 0 | 1336 |
| `npm run db:migrate:test` + `npm run test:database` | 451 / 0 | 421 |
| `npm run test:auth-browser` | 20 / 0 | 20 |
| `npm run test:browser` | 79 / 0 (one run) | 77 |
| `npm run build:hant -- --check` | clean | — |
| `npm run build:intake` | nothing to commit | — |
| `npx openspec validate --all` | 9 / 0 | — |

Migration checks:
- 038 was forgotten and re-applied twice on the test stack without error.
- On a freshly reset test stack (`supabase stop --no-backup`, then `start`), `db:migrate:test` applied 001–038 from empty, and `test:database` (451/451) and `test:auth-browser` (20/20) passed on it.

Browser story flakes seen on the way, none in the new staff phase, all passing on re-run: Follow-ups (Task 10), Morgan reviews (Task 12). Two earlier runs were spoiled by the laptop sleeping. The retrospective records them.

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```bash
ls docs/superpowers/specs/*.md   # 8 files
```

- [x] The files that exist are legitimate. They are the historical design documents for parts 1–4d, which CLAUDE.md says to keep. This branch adds or changes nothing under `docs/superpowers/` (`git diff --name-only 96f1a1d..HEAD -- docs/superpowers` is empty).

| File | Captured in the change? | Action |
|---|---|---|
| — | — | — |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` rows, so this section stays empty.

| Deferred dogfood (plan §) | Equivalent automated test | Coverage assessment | Real gap? |
|---|---|---|---|
| — | — | — | — |

---

## Overall Decision

- [x] ✅ PASS. Ready for retrospective, archive and finish. The three design drifts first recorded in §4 were folded into design.md and the sign-in spec after verify.

**Next step**: write `retrospective.md` with the ledger summary, then delete the SDD workspace. Merge `main` into the branch, run `/opsx:archive add-staff-identity`, then push and update PR #90.
