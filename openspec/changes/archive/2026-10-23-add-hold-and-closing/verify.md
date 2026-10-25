# Verification Report

**Change**: `add-hold-and-closing`
**Verified at**: `2026-10-23`
**Verifier**: Claude (controller of the apply run; the `openspec-verify-change` skill isn't installed, so the checks were run directly, per CLAUDE.md §2 step 6)

Precheck:
- `git log --oneline origin/main..HEAD`: 21 commits.
- `grep -c '^- \[x\]' tasks.md`: 28.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item is `"valid": true`.

**Result:**

```text
Totals: 9 items, 9 passed, 0 failed
  change add-hold-and-closing: valid
  specs: case-lifecycle, client-intake, draft-13614c, draft-14446, office-follow-up,
         review-and-corrections, screen-states, staff-case-work: valid (INFO notes only:
         "Requirement text is very long")
```

| Item | Type | Issues |
|---|---|---|
| — | — | none blocking |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` is now `- [x]` (28 of 28; 0 open).

| Task | Why open | Blocks archive? |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Notes |
|---|---|---|
| `case-lifecycle` | ✗ Needs sync | 4 ADDED and 4 MODIFIED requirements; merged at archive |
| `office-follow-up` | ✗ Needs sync | 1 MODIFIED (the `withdrawal_notice` purpose, two kinds) |
| `client-intake` | ✗ Needs sync | 1 MODIFIED (ten samples) |
| `screen-states` | ✗ Needs sync | 1 MODIFIED (the close dialog sends a reason) |

Not syncing before archive is expected: CLAUDE.md §4 reserves `/opsx:sync` for when the user asks.

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Specs | Gap |
|---|---|---|---|
| Waiting for documents and its automatic return | D3, D4 | "The office asks for documents at intake" | none |
| A documents Hold returns straight to the documents' origin | D4, D5 | "The office puts a case on hold…" | none |
| Six reasons, note required for `other` | D6 | "A closed case records why it closed" | none |
| Withdrawn close before filing and its TaxSlayer notice | D6 (after-apply note) | the close rule; "A client may withdraw…"; `office-follow-up` | none (aligned by `/opsx:update`, 842e7ad) |
| The client's Withdraw stages | D7 | "A client may withdraw…" | none |
| Pool and Follow-ups placement | D12 | "The lists and the case page show every stage" | none |

**Drift warnings** (non-blocking):
- **The automatic return** writes a second client line ("PCDC is working on your application again.") as a second `client_events` row inside `act_verify_document`, rather than through a separate event mechanism. D4 says "a second event line", which matches. The staff history shows only the verify for that return.
- **The withdrawal history line and the withdrawn closed message differ by one word,** both as specified. The history line is "You withdrew your application…"; the status panel shows "You withdrew this application…".
- **`close_case_steps`** is shared by Close and Withdraw, so `act_close_case` is no longer a verbatim copy of 035's, as its header says.
- **Client text drafted during apply,** for the wording review:
  - the Withdraw refusal "请勾选方框以撤回此申请。";
  - the dialog's lead sentence;
  - the toast "You withdrew your application." / "您已撤回申请。".

---

## 5. Implementation Signal

- [x] Nothing unstaged in the worktree (`git status --short` is empty).
- [ ] Every relevant commit is pushed. **Not yet:** the branch is pushed at step 9, after archive.

**Commit range**: `d405c76..91f1bf8` (proposal → all tasks checked). The code is final at `bf9a490`.

| Check | Result | Baseline (#95) |
|---|---|---|
| `npm test` | 1317 / 1317 | 1279 |
| `npm run build:hant -- --check` | clean | — |
| `npm run build:intake` | "the newest catalogue migration already records this catalogue" | — |
| `npm run db:migrate:test` + `npm run test:database` | 036 applied; 407 / 407 | 374 |
| `npm run test:browser` | 75 / 75, 1418 s, at `bf9a490` | 65 |
| `npx openspec validate --all` | 9 / 9 | — |
| `npm run test:auth-browser` | not run: nothing touches sign-in | — |

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

- [x] `docs/superpowers/specs/` holds only the eight historical documents (2026-09-14 to 2026-10-05). This change wrote nothing there.

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` rows. No manual check was deferred: the story drives both new flows (documents at screening, and a withdrawal) plus hold, call-back and Close from the Follow-ups rows.

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS — the non-blocking drift notes in §4. The delta specs sync at archive, and the branch is pushed at finish.
- [ ] ❌ FAIL

**Next step:** `retrospective.md`, then merge `main` and archive, then the PR.
