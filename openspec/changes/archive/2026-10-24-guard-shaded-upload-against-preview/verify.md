# Verification Report

**Change**: `guard-shaded-upload-against-preview`
**Verified at**: `2026-10-24`
**Verifier**: Claude (controller session). The `openspec-verify-change` skill isn't installed, so the checks below were run directly, as the schema's fallback allows.

Precheck:
- 33 commits since `origin/main` on this branch. The branch also carries `add-preparer-13614c-fields`, already archived. This change's own range is `2ba4761..0ff8677`, 7 commits.
- 14 checked boxes in `tasks.md`.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item is `"valid": true`.

**Result:**

```text
totals: items 10, passed 10, failed 0
change guard-shaded-upload-against-preview: valid
specs: case-lifecycle, client-intake, draft-13614c, draft-14446, office-follow-up,
       review-and-corrections, screen-states, shaded-section, staff-case-work: valid
```

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] Every box is checked: 14 of 14, none left open.

| Task | Why not done | Blocks archive? |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

This change doesn't touch `openspec/specs/` (`git diff --name-only 2ba4761..HEAD -- openspec/specs` is empty). Archive merges the delta.

| Capability | Sync state | Notes |
|---|---|---|
| shaded-section | ✗ Needs sync | One MODIFIED requirement: "The preparer can fill the section elsewhere and upload it". Its name matches the canonical spec. Two scenarios are reworded ("A copy filled in another program" now presses "Save these values") and six are new. "A printed copy" and "Another case's copy" are unchanged. |

Expected before archive. CLAUDE.md step 8 syncs it through `/opsx:archive`.

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Specs | Gap |
|---|---|---|---|
| D1 held read | `state.shadedReview` keyed by case; confirm only for the open case; dropped on a case switch, sign-out and a new upload | "What was read SHALL stay shown when the case page redraws, and SHALL be discarded when another case is opened or the person signs out, and it SHALL never be saved to another case" | none (a new upload dropping it is design-level) |
| D2 review box | in place of the upload control; heading, count, rows, buttons | "In place of the upload control, the case page SHALL show 'Check what was read from this copy' with…" | none |
| D3 rows | table order; "ticked"; notes with line breaks | the summary bullets | none |
| D4 Producer | `/Quartz PDFContext/i`, hint only | the Preview warning line; Save still offered | none |
| D5 no values | after the existing refusals; blank and unticked are not filled, 0 is | the fourth refusal bullet and its scenarios | none. The bullet list leads with "no shaded fields" and puts "another case" second, which is the code's order |
| D6 hint | after the Download button | the first paragraph | none |

**Drift warnings** (non-blocking):
- The final fix returns focus to `#shaded-upload` after "Save these values", and only the newest of several uploads chosen in quick succession is reviewed. Both are implementation detail with no spec text.
- `readFilledCopy` now loads with `updateMetadata: false` (ruling P3) so the Producer survives. The design names the Producer check but not this load option.

---

## 5. Implementation Signal

- [x] No unstaged files in the worktree (`git status --short` is empty).
- [ ] All related commits pushed. The branch is pushed up to d3a3030 (PR #98). This change's commits are pushed in the finish step, after archive.

**Commit range**: `2ba4761..0ff8677`.

**Checks at 0ff8677:**

| Check | Count | Baseline |
|---|---|---|
| `npm test` | 1418 / 0 | 1400 |
| `npm run test:browser` | 77 / 0, one run | 77 |
| `npx openspec validate --all` | 10 / 0 | — |

Not needed:
- `npm run test:database` and `db:migrate:test`: there is no database change (`git diff --name-only 2ba4761..HEAD -- supabase` is empty).
- `npm run test:auth-browser`: sign-in is untouched.
- `npm run build:hant -- --check`: the text is staff-only, and `src/client-text.mjs` and `src/zh-hant.mjs` are untouched.
- `npm run build:intake`: the catalogue is untouched.

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```bash
ls docs/superpowers/specs/*.md   # 8 files
```

- [x] The 8 existing files are the historical design documents CLAUDE.md says to keep. This change adds nothing under `docs/superpowers/`.

| File | Captured in the change? | Action |
|---|---|---|
| — | — | — |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` rows. There is still one manual check, not a `[~]` row: a copy actually filled and saved in macOS Preview. The automated tests set a Quartz Producer with pdf-lib instead. The retrospective records it as a follow-up.

| Deferred dogfood (plan §) | Equivalent automated test | Coverage assessment | Real gap? |
|---|---|---|---|
| — | — | — | — |

---

## Overall Decision

- [x] ✅ PASS. Ready for retrospective, archive and finish.

**Next step**: write `retrospective.md`, with the ledger summary. Then delete the SDD workspace, merge `main`, run `/opsx:archive guard-shaded-upload-against-preview`, and push to PR #98.
