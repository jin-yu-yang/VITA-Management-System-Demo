# Verification Report

**Change**: `adjust-filing-to-pcdc`
**Verified at**: `2026-10-23`
**Verifier**: Claude (controller session). The `openspec-verify-change` skill isn't installed, so the checks below were run directly, as the schema's fallback allows.

Precheck:
- 14 commits since the merge base with `origin/main` (53001f2).
- 34 checked boxes in `tasks.md`.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item is `"valid": true`.

**Result:**

```text
totals: items 9, passed 9, failed 0
change adjust-filing-to-pcdc: valid
specs: case-lifecycle, client-intake, draft-13614c, draft-14446, office-follow-up,
       review-and-corrections, screen-states, staff-case-work: valid
```

Only INFO notes remain: some existing `staff-case-work` requirements are longer than 500 characters. They aren't failures, and this change doesn't touch that spec.

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] Every box is checked: 34 of 34, none left open.

| Task | Why not done | Blocks archive? |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

The branch doesn't touch `openspec/specs/` (`git diff --name-only 53001f2..HEAD -- openspec/specs` is empty). Archive merges the deltas.

| Capability | Sync state | Notes |
|---|---|---|
| case-lifecycle | ✗ Needs sync | One ADDED requirement (season-end close) and ten MODIFIED. Five scenario names keep their old names with new content, because the validator won't drop a scenario (design, Risks / Trade-offs) |
| office-follow-up | ✗ Needs sync | One MODIFIED requirement: the season-end close opens no `withdrawal_notice` |
| review-and-corrections | ✗ Needs sync | One MODIFIED requirement: "Waiting for the client to sign." |

All three are expected before archive. CLAUDE.md step 8 syncs them through `/opsx:archive`, not `/opsx:sync`.

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Specs | Gap |
|---|---|---|---|
| D1 paper result | `given_to_client` at Mark e-filed, no date; Accepted when every return is answered | "Admins record each return's filing result" (given to the client, no date) and the Mark e-filed move row (E-filed or Accepted) | none |
| D4 four pairs | the pair clause dropped; the used-pair rule removed | "Admins record signing and e-filing…": exactly four choices; the second filing names only the rejected returns | none |
| D5 names | staff and client names table | stage table (requirement 1) and the client label table, with "Ready" and "Ready to mail" | none |
| D9 season-end RPC | all or nothing, CONFLICT, one event and one line per case, no notice | ADDED "An admin closes unsigned cases at season end"; office-follow-up's MODIFIED requirement | none |
| D10 dialog | ticked boxes, days waited, heading counts, box text | the same requirement's dialog bullets | none |
| D11 fixer text | role-neutral prompt; "site coordinator" in the next step and the notes | "Admins record each return's filing result" (prompt) and "The lists and the case page…" (next step) | none |

**Drift warnings** (non-blocking):
- D9 says the controller "applies each returned revision". The code re-reads the list instead, which gives the same result. The final review noted this, and the ledger records it as a ruling.
- Two implementation details have no spec text, both limited to legacy cases filed under 035 and recorded as rulings:
  - the staff row "No e-filed return is waiting for an answer.";
  - the "Both paper" label at E-filed.

---

## 5. Implementation Signal

- [x] No unstaged files in the worktree (`git status --short` is empty).
- [ ] All related commits pushed. The planning commit 431bce7 is pushed. The implementation commits are pushed in the finish step (CLAUDE.md step 9), after archive.

**Commit range**: `6975b81..1ee32e8` (implementation and checks). Base: `431bce7` (planning), then the merge of `origin/main` at 84ccb10.

**Checks run at 1ee32e8:**

| Check | Count | Baseline |
|---|---|---|
| `npm test` | 1336 / 0 | 1317 |
| `npm run db:migrate:test` + `npm run test:database` | 421 / 0 | 408 |
| `npm run test:browser` | 77 / 0 | 75 |
| `npm run build:hant -- --check` | clean | — |
| `npm run build:intake` | nothing to commit | — |
| `npx openspec validate --all` | 9 / 0 | — |

`npm run test:auth-browser` wasn't run, because sign-in is untouched.

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```bash
ls docs/superpowers/specs/*.md   # 8 files
```

- [x] The files that exist are legitimate. They are the historical design documents for parts 1–4d, which CLAUDE.md says to keep. This branch adds or changes nothing under `docs/superpowers/` (`git diff --name-only 53001f2..HEAD -- docs/superpowers` is empty).

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

- [x] ✅ PASS. Ready for retrospective, archive and finish.

**Next step**: write `retrospective.md`, with the ledger summary. Then delete the SDD workspace, merge `main` (currently 53001f2, the merge base, so there's nothing new to merge), run `/opsx:archive adjust-filing-to-pcdc`, and finish with a PR.
