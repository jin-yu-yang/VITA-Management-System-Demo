# Verification Report

> Produced after apply finished. It checks that the implementation agrees with the specs, the design and the tasks. The `openspec-verify-change` skill isn't installed, so these checks were run directly (CLAUDE.md lifecycle step 6).

**Change**: `add-unmarried-intake-wording`
**Verified at**: `2026-10-14`
**Verifier**: the Claude Code controller session (Opus 5.5), after subagent-driven development

**PRECHECK**:
- `git log --oneline $(git merge-base HEAD origin/main)..HEAD | wc -l` → 12: two planning commits, nine implementation commits and one tick commit.
- `grep -c '^- \[x\]' tasks.md` → 21.

Both are above zero.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item is `"valid": true`.

**Result:**

```text
add-unmarried-intake-wording   change  valid, 0 issues
client-intake                  spec    valid, 1 info (a requirement longer than 500 characters; advisory)
draft-13614c                   spec    valid, 0 issues
```

| Item | Type | Issues |
|---|---|---|
| client-intake | spec | INFO only: "Requirement text is very long (>500 characters)". This is the canonical middle-name requirement from #65, not this change, and it doesn't block. |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` is now `- [x]`: 21 of 21 done, 0 open.

| Task | Why not done | Blocks archive |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Notes |
|---|---|---|
| `client-intake` | ✗ Needs sync | Archive adds two requirements: "An unmarried client isn't asked about a spouse" and "An unmarried client answers the 'who' questions with Yes or No". |
| `draft-13614c` | ✗ Needs sync | Archive adds "The draft's not-sure lines quote the wording the client saw". |

Both are synced by `/opsx:archive` (lifecycle step 8). `/opsx:sync` wasn't used, as CLAUDE.md §4 says.

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design says | Spec says | Gap |
|---|---|---|---|
| D3: one married rule | `spouseShown` = `who.spouseShowIf`; unanswered counts as not married | "the same one that decides whether the 'My spouse' option is offered", plus the unanswered scenario | None |
| D4/D5: every screen | `wording`/`leadOf`/`introOf` take answers, and every one-application screen passes them | "Every screen that shows one application SHALL use that application's answers" | None |
| D6: the wording | the brainstorm Q4 table; senior married leads say 您爱人 | the wages lead scenarios, and the senior Chinese lead scenario | None |
| D7: the bank card | `bank_hint` / `bank_hint_single` by `isMarried` | two direct-deposit scenarios, client and office | None |
| D8: the "who" questions | Q5.3–Q5.9 ask directly; all nine "who" questions show Yes/No radio buttons; saved answers stay `["me"]`/`["none"]`; married unchanged | the "who" requirement and its five scenarios | None |

**Implementation against the specs** (evidence from the runs):
- **Wording:** `tests/intake-build.test.mjs` pins every text, `tests/intake-catalogue.test.mjs` tests the readers, and the view tests check the client, office, staff and draft screens.
- **Bank card:** `tests/document-cards.test.mjs`.
- **"Who" questions:**
  - `tests/intake-form.test.mjs`: radios, Chinese, married, Section 8, read-back as a list, labels;
  - `tests/staff-views.test.mjs`: the panel and "Asked by:";
  - `tests/client-views.test.mjs`: the office card's "Asked by:".
- **The story:** both walks check the wages lead and Q9.1a, and Q5.3's radios versus check boxes.

**Drift warnings** (not blocking):
- **D5 says `intake-form.mjs:169` gets the draft, but it doesn't.** It's a group-field label, and group fields carry no not-married text, so it's harmless.
- **The scoped re-review noted one cosmetic edge.** The compare table labels both columns with the client's draft answers. If the conflict is on marital status itself, the server column can read "Yes, My spouse". This follows D5's choice.

---

## 5. Implementation Signal

- [x] No unstaged files in the worktree. `git status --short` shows only the untracked `node_modules` symlink, which isn't committed.
- [ ] All commits pushed. Not yet: lifecycle step 9 pushes after archive.

**Commit range:** `eaa65c0..88993b6`.

| Commit | What it does |
|---|---|
| `0ccefb0` | Catalogue: not-married wording, leads and intro; senior leads use 您爱人 |
| `37c6147` | `spouseShown`, `wording`/`leadOf`/`introOf` with answers |
| `fd8c153` | Every screen passes the application's answers |
| `38f90fe` | The direct-deposit card's hint |
| `973179a` | Story: the wages lead and Q9.1a |
| `d25a980` | Docs |
| `d985c17` | Planning update: the "who" questions (Q8) |
| `1f85eb2` | The "who" questions as Yes/No radio buttons; 025 regenerated |
| `ec1d615` | Story: Q5.3 |
| `8bc5b67` | Docs for the regenerated 025 |
| `88993b6` | Task ticks |

**Migration 025:**
- The first file, `025_intake_catalogue_5234cc6a.sql`, was applied to `vitally-task2` only.
- It was regenerated in place as `025_intake_catalogue_194034c5.sql`, with the user's choice A1:
  - the new file was dry-run: 114 fields, 0 field rows changed (text only);
  - the old row was deleted from `vitally_private.schema_migrations`;
  - the new one was applied.
- `main`'s field-table test still passes on the stack.

**Checks run, with results:**
- `npm test`: 919/919.
- `npm run test:database`: 250/250.
- `npm run test:auth-browser`: 20/20.
- `npm run test:browser`: 57/57 in one run, about 12 minutes.
- `npm run build:hant -- --check`: clean.
- `npm run build:intake`: "already records this catalogue", nothing to commit.
- `npx openspec validate --all`: 3/3.

**Commit trailers:** all of `eaa65c0..88993b6` end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```bash
ls docs/superpowers/specs/*.md 2>/dev/null   # historical files only
git diff --stat fc80386 HEAD -- docs/superpowers   # (empty)
```

- [x] This branch adds or changes nothing under `docs/superpowers/`.

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` deferred rows. Every check ran as an automated suite, so this section is empty and passes.

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS. The next steps can go ahead, with these to note:
  1. **The scope grew during apply,** with the user's decision (Q8): the senior Chinese of the "who" questions, which the planned inventory missed because it searched only the English. Recorded in brainstorm Q8, design D8, the spec and Tasks 7–9.
  2. **025 was regenerated in place** after it had been applied to the test stack (A1, user-approved). It never reached `main`, and the branch hadn't been pushed yet, so no other stack has the old 025.
  3. **Cosmetic:** the compare table's server column, and D5's `intake-form.mjs:169` line (§4).
  4. **Out of scope, for the group's wording review:** section 0's "Photo ID … for you and your spouse", shown before marital status is asked.

**Next step**: write `retrospective.md` (lifecycle step 7). Then merge `main` and run `/opsx:archive` (step 8).
