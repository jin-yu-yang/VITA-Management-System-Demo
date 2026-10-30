# Verification Report

**Change**: `add-preparer-13614c-fields`
**Verified at**: `2026-10-24`
**Verifier**: Claude (controller session). The `openspec-verify-change` skill isn't installed, so the checks below were run directly, as the schema's fallback allows.

Precheck:
- 23 commits since the merge base with `origin/main` (96f1a1d).
- 38 checked boxes in `tasks.md`.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item is `"valid": true`.

**Result:**

```text
totals: items 9, passed 9, failed 0
change add-preparer-13614c-fields: valid
specs: case-lifecycle, client-intake, draft-13614c, draft-14446, office-follow-up,
       review-and-corrections, screen-states, staff-case-work: valid
```

No warnings or errors.

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] Every box is checked: 38 of 38, none left open.

| Task | Why not done | Blocks archive? |
|---|---|---|
| — | — | — |

Two notes:
- Group 1 (the spike) is ticked without commits. It was throwaway work by design, and its findings are in the ledger and the retrospective.
- 7.6, the Oct 29 go / no-go: the user called **GO** on 2026-10-24, so pdf.js stays. Nothing from group 7 is reverted.

---

## 3. Delta Spec Sync State

The branch doesn't touch `openspec/specs/` (`git diff --name-only 96f1a1d..HEAD -- openspec/specs` is empty). Archive merges the deltas.

| Capability | Sync state | Notes |
|---|---|---|
| shaded-section | ✗ Needs sync | New capability: 11 ADDED requirements. There is no `openspec/specs/shaded-section/` yet; archive creates it. |
| draft-13614c | ✗ Needs sync | 3 ADDED requirements: the draft shows the shaded section; long shaded notes continue in Additional Comments; the stamp says whether it holds preparer entries. The canonical spec has no stamp requirement today, so nothing overlaps. |
| screen-states | ✗ Needs sync | 2 MODIFIED requirements: "Errors are shown where the person is looking, never as a toast" (the editor and upload lines) and "A dialog takes the keyboard and gives it back" (Escape in an editor with unsaved changes). Both names match the canonical spec (lines 8 and 157). |

All three are expected before archive. CLAUDE.md step 8 syncs them through `/opsx:archive`, not `/opsx:sync`.

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Specs | Gap |
|---|---|---|---|
| D1 the table | 106 fields; one key per field across three forms; only `efficientHomeImprovement` differs | "The shaded section has 106 fields in every form", both scenarios | none |
| D2 the rules | sparse values; per-kind rules; browser first, database decides | "Shaded values follow the rules of their field" (all eight kinds, pairs, unknown keys, empty rows) | none |
| D4 who and when | `require_case_preparer`; `preparing` and `corrections_required`; tools only when a save would be accepted | "Only the case's preparer saves the shaded section, while preparing" | none |
| D5 saving | whole set replaces; `basedOnVersion` against `version`; CONFLICT; changed keys, no message | "A save replaces the section…", "A save records which fields changed, for staff only" | none |
| D6 / D8 the copy | partial flatten keeping the 106; `/V` + NeedAppearances; download / upload; Print sentence | "The editing copy keeps only the shaded fields fillable", "The preparer can fill the section elsewhere and upload it" | none |
| D7 the editor | layer outside `#app`; dialog; discard prompt; browser minimums | "The preparer fills the section on the form in ViTally", "The editor states the browsers it supports", screen-states MODIFIED | none |
| D9 the draft | stored values in all three forms; notes wrapped and continued; stamp wording | draft-13614c ADDED (three requirements) | none |

**Drift warnings** (non-blocking):
- D5 says the server returns `detail: {changed: [keys]}`. 038 returns `{changed, version}`. The browser doesn't depend on `version`: after an accepted save it takes the stored version plus one. The ledger records this.
- Three refusal sentences on the upload path have no spec text. They are recorded as rulings R6, R7 and R11:
  - another case's copy;
  - the section saved since the download;
  - the case changed twice while saving.

  The spec requires only that each refusal is shown in place.
- D4 names the Overview next step or `draftTools` as homes for the tools. They are in a shaded panel on the Intake answers tab. The spec doesn't say where they go.
- The editing copy itself carries the "prepared from online answers" stamp even when saved values are filled in live. The spec defines the stamp only for the staff draft. The final review called this cosmetic and left it.

---

## 5. Implementation Signal

- [x] No unstaged files in the worktree (`git status --short` is empty).
- [ ] All related commits pushed. The planning commit 383cf85 is pushed. The implementation commits are pushed in the finish step (CLAUDE.md step 9), after archive.

**Commit range**: `383cf85..541fd93` (implementation, fixes and checks). Base: `383cf85` (planning), on merge base 96f1a1d.

**Checks:**

| Check | Count | At | Baseline |
|---|---|---|---|
| `npm test` | 1400 / 0 | 541fd93 | 1336 |
| `npm run db:migrate:test` + `npm run test:database` | 434 / 0 | 5b54f00, the last commit that touches anything the database reaches | 421 |
| `npm run test:browser` | 77 / 0, one run | e7db8b4. 541fd93 is docs only | 77 |
| `npm run build:hant -- --check` | clean | c119758. No client text since | — |
| `npm run build:intake` | nothing to commit | 002f323. No catalogue change on the branch | — |
| `npx openspec validate --all` | 9 / 0 | 541fd93 plus this file | — |

Two checks were not needed:
- `npm run test:auth-browser`, because sign-in is untouched.
- A `build:hant` run after c119758, because no client text changed (`src/client-text.mjs` and `src/zh-hant.mjs` are untouched on the branch).

The browser story was flaky once. At Task 10, runs 1 and 2 failed on 20 s page-settle timeouts, in phases unrelated to the shaded section, while the machine was busy. Run 3 passed, and every later run passed on the first try (the retrospective records this).

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

These manual checks were not run, and are not `[~]` rows:
- the editor in Safari 18 and Firefox ESR;
- the editing copy filled in Acrobat or Preview.

The retrospective records them as follow-ups.

| Deferred dogfood (plan §) | Equivalent automated test | Coverage assessment | Real gap? |
|---|---|---|---|
| — | — | — | — |

---

## Overall Decision

- [x] ✅ PASS. Ready for retrospective, archive and finish.

**Next step**: write `retrospective.md`, with the ledger summary. Then delete the SDD workspace, merge `main`, run `/opsx:archive add-preparer-13614c-fields`, and finish with a PR.
