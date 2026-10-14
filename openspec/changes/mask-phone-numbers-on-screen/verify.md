# Verification Report

**Change**: `mask-phone-numbers-on-screen`
**Verified at**: `2026-10-14`
**Verifier**: Claude (controller session). The `openspec-verify-change` skill is not installed, so the checks below were run directly, as CLAUDE.md says.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item returns `"valid": true`

**Result**:

```text
totals: items 3, passed 3, failed 0
  client-intake                 spec    valid  (1 INFO: requirements[3] text is very long; existing spec, not touched by this change)
  draft-13614c                  spec    valid
  mask-phone-numbers-on-screen  change  valid
```

| Item | Type | Issues |
|---|---|---|
| — | — | none blocking |

---

## 2. Task Completion (`tasks.md`)

- [ ] Every `- [ ]` has become `- [x]`. 12 of 13 are ticked; 5.3 stays open (see below).

**Open tasks**:

| Task | Why it is open | Blocks archive? |
|---|---|---|
| 5.3 The PR description says this is display-only masking | Done at the finish step (CLAUDE.md step 9), after archive. The text is fixed in plan.md Task 4 and will go into the PR body. | No |

Notes on ticked items:
- **4.4 "Every phase passes."**
  - The first run during apply (Task 3, commit 4653fac) had 49 pass, 4 fail. All 4 were one pre-existing assertion: a household member's `middle_name` "Q" was not saved.
  - The same 4 had failed in a baseline run before any edit. The cause was the local stack missing migration `024_intake_catalogue_59560589.sql`, which #65 added on `main`.
  - With the user's approval, `npm run db:migrate:test` applied 024. The rerun at commit 4c5b545 was **57 of 57 pass**, in both browser pairings.
  - It is 57 rather than 53 because the earlier failure stopped its phase, so the steps after it never ran.
- **4.1, screenshot bullet.** The story writes screenshots only to `artifacts/browser/` (`docs/setup.md`: inspected, not committed). At the user's request, the tracked `docs/design/screens/implemented-staff-contact-hidden.png` was then replaced by the green run's 720-px `firefox-client-chrome-staff` artifact in 4c5b545. The tracked image was also 720 px wide. The new image shows the locked masks and the contact sentence.

### Checks run (task 5.2)

| Check | Result | Why |
|---|---|---|
| `npm test` | 908 / 908 pass (904 before the change + 4 new) | Always |
| `npm run test:browser` | 57 / 57 pass, both pairings (Chrome client + Firefox staff; Firefox client + Chrome staff) | The change touches views, CSS and the story |
| `npm run db:migrate:test` | Applied 024 (#65's catalogue migration, not this change's) to the local stack | Environment catch-up, approved by the user, so the browser run could be fully green |
| `npm run test:database` | Not run | No migration, SQL function, RPC, RLS or other database behaviour changes |
| `npm run test:auth-browser` | Not run | Sign-in is untouched |
| `npm run build:hant -- --check` | Not run | No client text changed; staff screens stay English (CI runs it anyway) |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Note |
|---|---|---|
| `staff-case-work` | ✗ Needs sync | New capability. `openspec/specs/staff-case-work/` does not exist yet; archive creates it from the delta (3 ADDED requirements). No existing spec under `openspec/specs/` was changed on this branch. |

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Spec | Gap |
|---|---|---|---|
| Mask format and the last four digits only | D3 | Req 1: "built from the number's last four digits only" | None |
| Reveal on hover, focus and click, held while focused; no copy button; no attribute | D4, D6, D8 | Req 2 and its scenarios (hover, focus, click, no attribute) | None |
| Focus kept across realtime redraws by id | D2, D4 (new ids) | Req 2 scenario "A realtime update keeps a revealed number revealed" | None |
| Locked mask, no number in the DOM, not focusable, sr-only "Ends in …" | D5, D6 | Req 3 | None |
| Best time and note hidden behind the unchanged sentence; answers panel masks too; draft buttons gated | D7 | Req 3 scenarios | None |
| Empty phone: "Not given" in the card, "Not answered" or no row in the answers | D2 | Req 1 and its two empty-phone scenarios | None |

**Drift warnings** (non-blocking):

- **D4's visible outline.** D4 says the focused mask keeps a visible focus outline. The fix round (4c5b545) added a light `:focus` outline (`--vt-primary-line`) under the existing keyboard `:focus-visible` ring, which made the code match D4 for mouse clicks too. The spec doesn't mention outlines, so there is no spec drift.
- **DESIGN.md §8.** It now matches the code: the first bullet says staff screens, not lists, and the second covers click-to-hold with no copy button.

---

## 5. Implementation Signal

- [x] No unstaged or uncommitted files in the worktree (`git status --short` is empty)
- [ ] All related commits are pushed. Not yet: the push happens at the finish step (CLAUDE.md step 9), after syncing with `main`. `origin/main` is still `fc80386`, the branch's base.

**Commit range**: `fc80386..4c5b545`, before the verify, retrospective and archive commits.
- b4ee4f8: planning artifacts
- e5b6bb7: helper
- eca4a37: contact card and answers panel
- 4653fac: CSS, story checks and DESIGN.md §8
- fe781f1: tasks ticked
- 4c5b545: user-requested fix round (click outline, §8 first bullet, screenshot)

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```bash
ls docs/superpowers/specs/*.md 2>/dev/null
```

- [x] Either no files, or the files that exist predate the schema install and are legitimate

| File | Content captured in the change? | Action |
|---|---|---|
| 8 historical design documents (parts 1–4d) | Not this change's; `git diff --name-only fc80386..HEAD -- docs/superpowers` is empty | None. CLAUDE.md says to keep them. |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` rows, so this section is empty and passes.

---

## Overall Decision

- [x] ✅ PASS. The change can go on to the retrospective, archive and finishing-a-development-branch.
- [ ] ⚠️ PASS WITH WARNINGS
- [ ] ❌ FAIL

**Next**:

1. Write `retrospective.md`, including the ledger summary, then delete the subagent-driven development workspace.
2. Merge `main` into the branch and run `/opsx:archive`.
3. Push and open the PR with the display-only masking note (task 5.3). Don't merge it.
