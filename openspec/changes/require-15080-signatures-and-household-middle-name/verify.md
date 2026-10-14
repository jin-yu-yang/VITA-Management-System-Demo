# Verification Report

> Produced after apply finished. It checks that the implementation agrees with the specs, the design and the tasks. The `openspec-verify-change` skill isn't installed, so these checks were run directly (CLAUDE.md lifecycle step 6).

**Change**: `require-15080-signatures-and-household-middle-name`
**Verified at**: `2026-10-13 22:40`
**Verifier**: the Claude Code controller session (Opus 5.5), after subagent-driven development

**PRECHECK**:
- `git log --oneline $(git merge-base HEAD origin/main)..HEAD | wc -l` → 8: the planning commit, plus 7 implementation commits.
- `grep -c '^- \[x\]' tasks.md` → 14.

Both are above zero.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item is `"valid": true`.

**Result**:

```text
{"totals":{"items":2,"passed":2,"failed":0},"byType":{"change":{"items":1,"passed":1,"failed":0},"spec":{"items":1,"passed":1,"failed":0}}}
client-intake                                         spec    valid, 0 issues
require-15080-signatures-and-household-middle-name    change  valid, 0 issues
```

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` is now `- [x]`: 14 of 14 done, 0 open.

**Open tasks:**

| Task | Why not done | Blocks archive |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Notes |
|---|---|---|
| `client-intake` | ✗ Needs sync | The canonical spec has its 3 version requirements. Archive adds the 2 ADDED requirements: "A household member may have a middle name" and "A client who consents to Form 15080 signs it". Following design D8, also broaden the canonical Purpose at archive, because today it covers only intake versions. |
| `draft-13614c` | ✗ Needs sync (new capability) | It isn't in `openspec/specs/` yet. Archive creates it with 1 ADDED requirement. Write a real Purpose then, because archive writes TBD (D8). |

Both are synced by `/opsx:archive` (lifecycle step 8). `/opsx:sync` wasn't used, as CLAUDE.md §4 says.

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design says | Spec says | Gap |
|---|---|---|---|
| D1/D2: signatures required when shown | Both signatures `Required`, show-if unchanged; the spouse's needs married | client-intake "…signs it": the primary is required with consent, and the spouse's too when married | None |
| D3: what stays optional | Consent and both dates stay optional; no auto-fill | "Consent itself and both signature dates SHALL stay optional" plus the declining scenario | None |
| D4: office-filled applications | No exception; `act_submit` runs `intake_missing` for both | "whoever fills the application" plus the office-filled scenario | None |
| D5/D6: middle name | `hh[i].middle_name` is optional. The summary line and the 13614-C read First Middle Last; document cards stay First Last | client-intake requirement 1 (the summary line; document cards keep first and last), and draft-13614c (row and comment lines; taxpayer and spouse initials unchanged) | None. The final review found the first wording of requirement 1 broader than D6, and it was narrowed in 587b049 |
| D7: samples unchanged | No middle names or 15080 answers in samples | Nothing in the specs requires them | None |

**Implementation against the specs** (evidence from the runs):
- **Requirement 1, client-intake (middle name):**
  - `tests/intake-build.test.mjs`: field order, type and wording;
  - `tests/database-intake.mjs`: saved, the parity set without a middle name, and the value cases;
  - `tests/intake-form.test.mjs`: the summary line;
  - `tests/browser.mjs`: the box sits between first and last name, and the value is saved.
- **Requirement 2, client-intake (signatures):**
  - `tests/intake-catalogue.test.mjs`: missing answers, including whitespace-only, unmarried, declined and unanswered;
  - `tests/intake-form.test.mjs`: the sub-step mark;
  - `tests/database-intake.mjs`: parity sets, and submit refused or accepted for the client and the office;
  - `tests/browser.mjs`: the rail shows "Needs answers", then "Done".
- **draft-13614c:** `tests/draft-form.test.mjs`, covering row 1 with a middle name, row 2 without one, and members 5–6 in the comment lines. The taxpayer's initial is still pinned by the existing test.

**Drift warnings** (not blocking):
- `brainstorm.md` keeps the first draft of the spouse-signature tip ("choose 'I do not consent' above"). `design.md` D2, the drafts and the catalogue use the final wording: each version names its own "no" label, in bold. `brainstorm.md` is a raw record of the conversation, so this is expected. The final text is in D2.
- **Migration 024 is applied to `vitally-task2`, so the shared stack runs ahead of `main`.** Until this change merges, `main`'s `npm run test:database` fails "the field table matches the catalogue". Recorded in design Risks, and it goes in the PR body.

---

## 5. Implementation Signal

- [x] No unstaged files in the worktree. `git status --short` shows only the untracked `node_modules` symlink, which apply setup creates and which is never committed.
- [ ] All commits pushed. Not yet: lifecycle step 9 pushes and opens the PR after archive.

**Commit range**: `e074141..587b049`:

| Commit | What it does |
|---|---|
| `e9b91e1` | The catalogue drafts, the generated catalogue, migration 024 and 繁體 |
| `8e6c9ee` | Signature and middle-name tests: unit, database and value cases |
| `a229c54` | `memberNameParts` and its three call sites |
| `41e14dc` | The story: middle name, and the 15080 rail marks |
| `c5ea521` | The story: read the middle name after the sub-step move that saves it |
| `0c78b0c` | Docs: migration 024, the counts, README |
| `587b049` | Final-review fixes: the spec matches D6, counts, the story note, `tasks.md` ticked |

**Checks run, with results:**
- **Unit:** `npm test`, 904/904. Covers the catalogue, the missing-answers check, the summary line and the draft.
- **Database:** 024 applied with the user's go-ahead, then `npm run db:migrate:test` and `npm run test:database`, 250/250. Covers the catalogue migration and the submit rule.
- **Auth gate:** `npm run test:auth-browser`, 20/20. Sign-in is untouched; it ran so that all four counts in `docs/setup.md` are current.
- **Browser story:** `npm run test:browser`, 57/57 in one run, about 12 minutes. The first run went 49/53 and failed at the new middle-name check, a read before the save. Fixed in `c5ea521`.
- **Other checks:**
  - `npm run build:hant -- --check` passes;
  - `npm run build:intake` reports "already records this catalogue", with nothing to commit;
  - `npx openspec validate --all` passes 2/2.

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```bash
ls docs/superpowers/specs/*.md 2>/dev/null   # 8 files
git diff --stat a85ee51 HEAD -- docs/superpowers   # (empty)
```

- [x] The 8 files are historical design documents from parts 1–4d, which predate the schema. This branch adds or changes nothing under `docs/superpowers/`.

| File | Captured in the change | Suggested action |
|---|---|---|
| — | — | — |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` deferred rows. Every check ran as an automated suite, so this section is empty and passes.

| Deferred dogfood (plan §) | Equivalent automated test | Coverage assessment | Real gap? |
|---|---|---|---|
| — | — | — | — |

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS. The next steps can go ahead, with three things to note:
  1. The shared test stack is at 024 ahead of `main`. `main`'s "the field table matches the catalogue" fails there until this merges. Say so in the PR.
  2. **Commit trailers.** The project rule is "Co-Authored-By: Claude Opus 5.5" on every commit. Two story commits, `41e14dc` and `c5ea521`, were written by a Sonnet subagent and carry "Claude Sonnet 5.5". They were left as they are, as a ruling in the ledger, and flagged to the user to decide before push.
  3. `brainstorm.md` keeps the first draft of the spouse tip. The raw record is expected to differ, and D2 holds the final text.

**Next step**: write `retrospective.md` (lifecycle step 7). Then merge `main` and run `/opsx:archive` (step 8), including the Purpose edits from D8.
