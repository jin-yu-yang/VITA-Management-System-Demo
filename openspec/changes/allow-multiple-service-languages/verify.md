# Verification Report

**Change**: `allow-multiple-service-languages`
**Verified at**: `2026-10-15`
**Verifier**: Claude (Opus 5.5), the controller of the subagent-driven apply. The `openspec-verify-change` skill isn't installed, so the checks below were run directly (CLAUDE.md, lifecycle step 6).

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item is `"valid": true`.

**Result:**

```text
client-intake                       spec    valid
draft-13614c                        spec    valid
staff-case-work                     spec    valid
allow-multiple-service-languages    change  valid
totals: 4 items, 4 passed, 0 failed
```

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` is now `- [x]`: 13 of 13, with 0 open.

| Task | Why unfinished | Blocks archive? |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Notes |
|---|---|---|
| `client-intake` | ✗ Needs sync | Two ADDED requirements: other languages (Q0.5/Q0.6), and the progress page. Merged by `/opsx:archive`. Its Purpose gains the client's service languages (design D9). |
| `staff-case-work` | ✗ Needs sync | Two ADDED requirements: the tables show every language, and the filters match any. Merged by `/opsx:archive`. Its Purpose, which today covers only the masked phone, is broadened to the staff tables' language display and filters (design D9). |

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Spec | Gap |
|---|---|---|---|
| New questions | D1, D2: Q0.5 multi-select optional, Q0.6 its own "Please specify" | client-intake "A client can name other languages…" (four scenarios) | None |
| Letters and names | D3, D4: `clientLanguages`, `languageSummary`, `languageCell` | staff-case-work "Staff tables show every language…" (four scenarios) | None |
| Filters | D5: match any language; options are the union | staff-case-work "Language filters match any language…" | None, after the final-review fix (see below) |
| Follow-ups without a case | D6: the case's languages when there are any, otherwise the request's text | The "A help request without a case" scenario | None |
| Progress page | D7: full names in the screen language | client-intake "The progress page lists every language…" | None |

**Drift warnings (non-blocking):**
- **A saved free-text filter (fixed before verify).** The delta spec originally said "A saved filter value SHALL keep working". That contradicts design's accepted trade-off: a Follow-ups help request's free-text language now reads as Other, so a saved "Polish" filter matches nothing. The final review raised it.
  - The controller ruled to correct the spec sentence to the trade-off the user approved before apply (commit 6b123ed).
  - A new scenario, "A saved free-text filter", and a test pin it.

---

## 5. Implementation Signal

- [x] Nothing unstaged in the worktree. Only the local `node_modules` link is untracked; the `.env.test` link is ignored.
- [ ] All related commits pushed: not yet. They are pushed at lifecycle step 9, after archive.

**Commit range**: `0862dd2..6b123ed`, 14 commits after the proposal commit. Branch `allow-multiple-service-languages`, base `main` 8ec6b08.

**Checks run** (CLAUDE.md, Verification):

| Check | Result | Why |
|---|---|---|
| `npm test` | 943/943 (934 on `main`, plus 9 new) | Always |
| `npm run build:hant -- --check` | clean | Catalogue Chinese changed (two new 繁體 entries) |
| `npm run build:intake` | leaves nothing to commit | CI; the catalogue changed and `026_intake_catalogue_2239685d.sql` is committed |
| `npx openspec validate --all` | 4/4 valid | CI |
| `npm run db:migrate:test` | 026 applied to `vitally-task2` after the user's OK (dry-run in `begin … rollback` first: 114 → 116 fields) | A catalogue migration |
| `npm run test:database` | 250/250 | Migration 026: the field table matches the catalogue, and the value mirror includes the new `language_also` cases |
| `npm run test:browser` | 57/57 on the first run (746 s), and 57/57 after the final fix wave (743 s) | Views and CSS changed; the story checks `E, M` on a real staff row |
| `npm run test:auth-browser` | not run | No sign-in change |

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
- [x] ⚠️ PASS WITH WARNINGS: the one drift in §4, fixed before verify with a recorded ruling.
- [ ] ❌ FAIL

**Next step:** write `retrospective.md` (lifecycle step 7), then merge `main` and run `/opsx:archive` (step 8).
