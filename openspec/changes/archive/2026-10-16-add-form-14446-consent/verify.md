# Verification Report

**Change**: `add-form-14446-consent`
**Verified at**: `2026-10-16`
**Verifier**: Claude (Opus 5.5), the controller of the subagent-driven apply. The `openspec-verify-change` skill isn't installed, so the checks below were run directly (CLAUDE.md, lifecycle step 6).

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item is `"valid": true`.

**Result:**

```text
change/add-form-14446-consent      valid
spec/client-intake                 valid
spec/draft-13614c                  valid
spec/staff-case-work               valid
totals: 4 items, 4 passed, 0 failed
```

`draft-14446` is a new capability, so it has no canonical spec yet; its delta validates as part of the change.

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` is now `- [x]`: 17 of 17, with 0 open (committed in f5bbf90).

| Task | Why unfinished | Blocks archive? |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Notes |
|---|---|---|
| `client-intake` | ✗ Needs sync | One MODIFIED requirement ("The summary page explains itself and puts its tools first", now with the Form 14446 buttons) and four ADDED: "A client consents to the virtual process before the rest of the form", "Every client signs Form 14446", "The Form 14446 dates fill themselves", "The sample cases include their Form 14446 answers". Merged by `/opsx:archive`. Its Purpose gains the 14446 consent and signatures (design D8). |
| `draft-14446` | ✗ Needs sync (new capability) | Four ADDED requirements: each signer's details, the spouse block only when the spouse signed, the IRS-review boxes, English and 繁體. `/opsx:archive` creates `openspec/specs/draft-14446/spec.md`; its Purpose is written then. |

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Spec | Gap |
|---|---|---|---|
| The two sub-steps | D1: Section 15 at `before.virtual` (0.4), Section 16 at `about.sign` (1.5); seven `vc_*` fields; migration 029 generated | client-intake "A client consents…" and "Every client signs Form 14446" | None |
| The gate | D2: `resolveSubstep` sends an unconsented form to 0.4; Continue disabled with a reason; the rail locked but keeping `data-substep`; Add a case has no lock | client-intake "A client consents…" (rail, Continue, unticking, summary link, stored sub-step, Add a case scenarios) | None |
| 1.5's details | D3: the page shows what the form will print, the spouse's under rule `joint_possible` | client-intake "Every client signs Form 14446" | None, after the final-review fix (below) |
| The dates | D4: filled with today when a signature goes from empty to filled and its date is empty; each date shown only once its signature is filled | client-intake "The Form 14446 dates fill themselves" | None |
| The draft | D5: PCDC's XFA-stripped copies pinned by SHA-256; page 3's blocks; Q1 from `vc_review`, Q2 from `vc_agree` | draft-14446 (all four requirements) | None, after the file-name fix (below) |
| Fill and Regenerate | D6: the sample carries `vc_*`; Fill strips it; Regenerate keeps it | client-intake "The sample cases include their Form 14446 answers" | None |
| Migration 030 | D7: `fixture_answers_v2` copied from 019, plus the four 14446 keys; 030 after 029 | client-intake "The sample cases include…" (nothing missing in any seeded sample) | None |

**Drift warnings (non-blocking), each fixed before verify:**
- **1.5's details read the raw answers (final review, Important).** The draft reads `visibleAnswers`, so for a spouse who died in 2025, or with a stale `sp_phone` from an earlier "married", 1.5 listed a phone or email the draft never prints. That broke the spec's "the details the form will print". Fixed in eb33059: `signDetails` reads `visibleAnswers(2, answers)` and leaves out the rows of hidden questions, with tests.
- **The module's name (story run 1).** The plan named the draft module `draft-14446-form.mjs`, but `server.mjs` serves only `src/` modules named with letters and dashes, so the app failed to boot. Renamed to `src/draft-virtual-consent.mjs` and the forms rule widened by exact file name (e3be00f); the planning artifacts follow, and design.md D5 says why.
- **The two drafts' file names (final review, Minor).** Both forms downloaded as `14446-draft.pdf`. Fixed in eb33059 with the 13614-C's pattern; design.md D5 now gives it.
- **繁體 合並 vs 合併 (final review, Minor).** OpenCC wrote 不合並申報 for the spouse-signature tip. Fixed in eb33059 with an override in `tools/hant-overrides.mjs`.

---

## 5. Implementation Signal

- [x] Nothing unstaged in the worktree. Only the local `node_modules` link is untracked; the `.env.test` link is ignored.
- [ ] All related commits pushed: not yet. They are pushed at lifecycle step 9, after archive.

**Commit range**: `43b55a9..c1d3996`, 13 commits after the planning commit, plus this report. Branch `add-form-14446-consent`, base `main` 686104a (unchanged on origin when verified).

**Checks run** (CLAUDE.md, Verification):

| Check | Result | Why |
|---|---|---|
| `npm test` | 999/999 (969 on `main`, plus 30 new) | Always |
| `npm run build:hant -- --check` | clean | Catalogue and screen Chinese changed (Sections 15 and 16, `consent.blocked`, `sign.*`, the 14446 buttons) |
| `npm run build:intake` | leaves nothing to commit ("the newest catalogue migration already records this catalogue") | CI; the catalogue changed and `029_intake_catalogue_9ee07ca8.sql` is committed |
| `npx openspec validate --all` | 4/4 valid | CI |
| `npm run db:migrate:test` | 029 and 030 applied to `vitally-task2` after the user's OK. Dry run first, in `begin … rollback`: the catalogue loads with the new fields; `fixture_answers_v2('preparation_ready')` carries `vc_agree`, `vc_review`, `vc_tp_signature` "Mei Chen" and `vc_tp_date`; `intake_missing` is empty for each sample | A catalogue migration and a hand-written migration |
| `npm run test:database` | 253/253 | Migrations 029–030: the seeded samples have nothing missing, each sample answer matches `intake_fields`, the new required answers |
| `npm run test:browser` | Run 1 stopped at sign-in: the app failed to boot because `server.mjs` refused the module with digits in its name, fixed in e3be00f. Then 57/57, and 57/57 after the final fix wave | The form, rail, gate, 1.5, the drafts, `app.mjs`, the controller, CSS and the story changed |
| `npm run test:auth-browser` | not run | No sign-in change |
| The spike's rendering check | Both stripped PDFs filled and rendered by eye (via `qlmanage`): page 3's blocks and boxes show in English and 繁體; the four empty electronic-signature fields were removed by the strip tool's fallback, since pdf-lib can't flatten them | design.md Risk "the XFA-stripped pages render blank" |

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

- [x] Only historical files predating the schema.

The 8 files under `docs/superpowers/specs/` are the historical design documents of parts 1–4d. This change wrote nothing under `docs/superpowers/`.

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` deferred rows, so this section passes empty.

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS: the four drifts in §4, each fixed before verify (three in code with tests, one in design.md).
- [ ] ❌ FAIL

**Next step:** write `retrospective.md` (lifecycle step 7), then merge `main` if it moved and run `/opsx:archive` (step 8).
