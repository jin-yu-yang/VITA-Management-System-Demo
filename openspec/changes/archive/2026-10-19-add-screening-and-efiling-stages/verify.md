# Verification Report

**Change**: `add-screening-and-efiling-stages`
**Verified at**: `2026-10-19`
**Verifier**: Claude (controller session), with the checks run directly. `openspec-verify-change` is not installed (CLAUDE.md §2 step 6).

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item `"valid": true`

**Result**:

```text
add-screening-and-efiling-stages  change  valid
client-intake                     spec    valid
draft-13614c                      spec    valid
draft-14446                       spec    valid
screen-states                     spec    valid
staff-case-work                   spec    valid
(6 items, 6 passed, 0 failed)
```

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` is now `- [x]` (16/16)

| Task | Why not done | Blocks archive |
|---|---|---|
| — | — | — |

Note on 8.1: the story's "a list control is not an open" step (Log contact on a Request sent case's Follow-ups row) could not be written, because no case at `received` has an open call task in the story. The brief allowed skipping it. The spec rule is covered by the controller test "selecting a case in place from a list is not an open" and the `state.screen === "staff-case"` gate (ruling 14 in retrospective.md).

---

## 3. Delta Spec Sync State

| Capability | Sync state | Notes |
|---|---|---|
| `case-lifecycle` | ✗ Needs sync | A new capability with 6 ADDED requirements: the main chain, screening on open, signing and e-filing with a confirmation, staff and client names, the lists and the case page, the client told at each step. `openspec/specs/case-lifecycle/` doesn't exist yet; archive (step 8) creates it. |

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Spec | Gap |
|---|---|---|---|
| The chain and its moves | D1 keys, D3 changed moves (VERIFY_INTAKE from `screening`, office SUBMIT to `screening`, CLOSE_CASE from `screening`) | "A case moves through the main chain of stages": key table, moves table, closing rule, client number | none |
| Screening on open | D4: quiet, once per case, admin persona on the case page, races re-read, offline resend unchanged, give-up on other refusals | "Screening starts when an admin first opens a case" + scenarios (reload, Follow-ups Log contact, two admins, offline) | none |
| The reviewer's call first | D2: `act_mark_ready_to_efile` refuses unless the latest approved review's call is `completed`; the browser mirrors it | "Admins record signing and e-filing…": the call-pending sentence and scenario | none |
| The lists | D6: Follow-ups kinds and rows (including the call-pending row text), pool tabs and `poolPhase`, `reviewContactStatus` on list rows | "The lists and the case page show every stage" | none |
| Names and labels | D7: `describeStage → {label, clientLabel, clientMessage}`, `stageBadge`'s `audience`, five-step stepper, closed shows no track | "Staff and clients each see their own stage names", "Clients are told at each new step" | none |

**Drift warnings** (non-blocking):

- **D4's quiet start goes beyond the design's list, in the spec's direction.**
  - Added: a `load()` trigger (the reload); `dispatch`, contact writes and assistance writes retry it once they settle; a press waits for an in-flight start on the same case, is dropped if the case changes, and a second press is ignored.
  - The design named `selectCase`, `load()`, `selectPerson` and `refresh`.
  - The extras came from the Task 3 review and the final review, so the spec's "sent once", "sent again once the connection returns" and no-visible-error rules hold in every path. Recorded in `docs/developer/frontend.md`.
- **A draft case's staff lifecycle bar marks no step as current.** D5 drops `draft` from `LIFECYCLE`, and the spec lists ten stages without Draft. The header badge still says Draft.
- **Extra headings above the two Mark buttons.** The admin page's office panel has short "Form 8879" and "E-file" headings, following that panel's row markup. D5 doesn't mention them.
- **The diagram's side panel now reads "Same day in progress".** It said "in process"; this matches the other "in progress" labels. The brainstorm named only the main chain's renames.

---

## 5. Implementation Signal

- [x] No unstaged files in the worktree (`git status --short` shows only the `node_modules` symlink, which is never committed)
- [ ] All commits pushed. Not yet: pushing is step 9, after archive.

**Commit range**: `8c1a593..1922105` (20 commits after the planning commit, on `origin/main` b27643b, which hasn't moved)

**Checks run** (CLAUDE.md "Verification"):

| Check | Why | Result |
|---|---|---|
| `npm test` | always | 1160/1160 at 1922105 |
| `npm run db:migrate:test` + `npm run test:database` | migration 032, actions, the list's new `reviews` read | 031 then 032 applied to `vitally-task2` after the user's OK, with a dry run of 032 first (in `begin … rollback`). 282/282 at 5139001 and again at 5dd23d2; no database file changed after it. |
| `npm run test:browser` | views, `app.mjs`, the controller, CSS, the story | 63/63 at aa6e056 (first run) and 63/63 at 1922105 (after the final fixes touched `runContactWrite`) |
| `npm run build:hant -- --check` | client text in Chinese changed | clean |
| `npm run build:intake` | CI runs it | "the newest catalogue migration already records this catalogue" |
| `npx openspec validate --all` | CI runs it | 6/6 |
| `npm run test:auth-browser` | not run | sign-in is untouched |

The rendered `docs/media/return-lifecycle.svg` was checked by eye: Screening in progress sits between Request sent and Pending intake / filing, with no overlaps. The phone screenshot `progress-efiled-390` shows all five step labels fitting.

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```bash
ls docs/superpowers/specs/*.md 2>/dev/null   # 8 files
```

- [x] No files from this cycle. The 8 files are historical design documents, which CLAUDE.md says to keep. This change wrote nothing under `docs/superpowers/` (`git diff --stat b27643b..HEAD -- docs/superpowers` is empty).

| File | Captured in the change | Action |
|---|---|---|
| — | — | — |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

plan.md has no `[~]` rows, so this section is empty.

| Deferred dogfood (plan §) | Equivalent automated test | Coverage assessment | Real gap? |
|---|---|---|---|
| — | — | — | — |

---

## Overall Decision

- [ ] ✅ PASS — may proceed to finishing-a-development-branch and archive
- [x] ⚠️ PASS WITH WARNINGS — may proceed. The new `case-lifecycle` spec needs sync (archive does it), commits are not pushed yet (step 9), and four documented, non-blocking drifts from design.md are listed in §4.
- [ ] ❌ FAIL — return to the failing artifact, fix, and verify again

**Next step**: write retrospective.md (step 7), then archive (step 8; `origin/main` hasn't moved, so there's nothing to merge first), then push and open the PR (step 9).
