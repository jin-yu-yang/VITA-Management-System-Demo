# Verification Report

> Produced after apply finished, to confirm that the implementation agrees with the specs, design and tasks.

**Change**: `replace-simulated-screening-checks`
**Verified at**: `2026-10-20 01:35`
**Verifier**: Claude (controller session; the checks were run by hand, as CLAUDE.md §2 step 6 says)

**PRECHECK**: 10 commits since `git merge-base HEAD origin/main` (7823230); `tasks.md` has 15 ticked items. Both
positive.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item `"valid": true`

```text
Totals: 9 passed, 0 failed (9 items)
```

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] All 15 items ticked. plan.md has no unticked step and no `[~]` row.

| Task | Why not done | Blocks archive |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Note |
|---|---|---|
| `case-lifecycle` | ✗ Needs sync | ADDED "The office records the screening checks"; MODIFIED "Clients are told at each new step". The MODIFIED block was checked against the canonical spec: only the new row, sentence and scenarios differ. It syncs at archive. |

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Specs | Gap |
|---|---|---|---|
| D1 check set | three checks; identity when service is `online` | ADDED requirement table and scenarios | None |
| D2 refusals | key set in `check_payload`; identity-iff-online in `act_verify_intake` | "The database refuses a wrong set", "An online case needs identity" | None |
| D4 client line | approved English and 简体; the old line kept | MODIFIED "Clients are told…" row and scenarios | None |
| D5 fixtures | `review_ready` has identity, the others three | "The online sample" | None |

**Drift warnings** (non-blocking):
- The ADDED requirement's "no text … simulated" clause was narrowed during the final review to "no history line
  recorded after this change", because stored lines keep their words.
- Wording outside the panel still says "intake checks": the Follow-ups queue kind, a staff-views detail row, and a
  next-step hint in `src/app.mjs`. Ledger Rulings 4 and 5 leave them: they are accurate, and the spec only removes
  "simulated".

---

## 5. Implementation Signal

- [x] Nothing unstaged in the worktree
- [ ] Every related commit pushed. Pushed at the PR step.

**Commit range**: `7823230..6f9f55e`, plus this verify commit.

**Checks** (all in the worktree on D:, `.claude/worktrees/replace-simulated-screening-checks`):

| Check | Why | Result |
|---|---|---|
| `npm test` | always | 1235/1235 (at 6f9f55e) |
| `npm run db:migrate:test` + `npm run test:database` | migration 034, functions, fixtures | 034 applied (re-applied as LF after the final comment edit); 326/326 (at 6f9f55e) |
| `npm run test:browser` | the panel, `app.mjs` and the story's intake-check steps changed | 63/63, 987 s, at 1a41cb7. The later commits (1aa3f0d, 021ae73, 6f9f55e) changed only comments, docs and one spec clause; `tests/browser.mjs` changed only in a comment. So it was not re-run. |
| `npm run build:hant -- --check` | Chinese client text changed | exit 0 |
| `npx openspec validate --all` | CI | 9/9 |
| `npm run build:intake` | CI | nothing to commit |
| `npm run test:auth-browser` | — | not run: nothing touches sign-in |

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

- [x] `docs/superpowers/specs/` holds 8 historical files from parts 1–4d, kept by CLAUDE.md. This change wrote none.

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

plan.md has no `[~]` rows.

Coverage note: no case in the browser story is online, so the story never shows the identity check. It is covered by:
- the database tests (`tests/database-actions.mjs`: "screening checks: the set follows the service", "identity
  refused without online service");
- the unit tests (`screeningCheckKeys by service`, "drops identity unless online", "screening checks panel: online
  shows identity");
- the fixture test ("fixture checks by service", the online `review_ready` sample).

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS. The two §4 notes and the §7 coverage note; not pushed yet.
- [ ] ❌ FAIL

**Next step**: the retrospective, then merge main and archive, then the PR ("Part of #85").
