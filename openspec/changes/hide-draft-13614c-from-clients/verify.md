# Verification Report

**Change**: `hide-draft-13614c-from-clients` (issue #80)
**Verified at**: `2026-10-17`
**Verifier**: Claude (controller session). The `openspec-verify-change` skill is not installed, so the checks below were run directly, as CLAUDE.md says.

PRECHECK: 11 commits on the branch since `main` (`9992aab`), and 15 ticked tasks in `tasks.md`. Both are positive, so verify proceeds.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item returns `"valid": true`

**Result**:

```text
totals: items 6, passed 6, failed 0
  hide-draft-13614c-from-clients  change  valid
  client-intake                   spec    valid  (INFO only)
  draft-13614c                    spec    valid
  draft-14446                     spec    valid  (INFO only)
  screen-states                   spec    valid
  staff-case-work                 spec    valid  (INFO only)
```

| Item | Type | Issues |
|---|---|---|
| — | — | none (no warnings or errors; the INFO lines note long requirement text in specs this change doesn't create) |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` has become `- [x]` (15 of 15).

**Open tasks**: none.

Notes on ticked items:
- **3.5 was added during apply, because the plan missed it.**
  - The story's 简体 client step ("a client works in Chinese, and 繁體 loads only when chosen", `tests/browser.mjs` ~4877) checked that the summary's first draft button was the 简体 13614-C. Task 1's markup change broke that check.
  - The first story run that reached the step found it: four failures, all from that one assertion, at `0a5d3e4`.
  - **Fixed in `673e2fe`:**
    - the first button is now checked to be the Form 14446's 繁體 (`data-draft="14446"`, `data-form="zh-t"`), with no 13614-C button;
    - in Chrome, the step also builds that 14446 and checks that the 繁體 map is not fetched.
  - A grep of the whole story found no other client-side `view-draft` or 13614-C use.
- **3.4, the browser story.** It could not verify the change from this worktree (see §5 and the retrospective). With the user's approval, it was run from the main checkout, detached at this branch's head and switched back to `fix-zh-t-draft-simplified-characters` afterwards. The runs:

| Run | Where, at | Result | What it shows |
|---|---|---|---|
| 1 | this worktree, `0a5d3e4` (implementer) | 4 / 8 | Both runs stopped before the draft section, at the presenter's reset and the empty "My applications" screen. The cause is the environment, not this change. |
| 2 | this worktree, `0a5d3e4` (controller, ruling R3) | 4 / 8 | The same failures. A new worktree at the base commit `8d79318` failed the same way, while the main checkout passed. |
| 3 | main checkout, `0a5d3e4` | 53 / 57 | Every Task 3 check passed in Chrome. The 4 failures are one assertion, at the 简体 step (above). |
| 4 | main checkout, `46f0121` | 55 / 57 | **The Chrome-client run passed everything**, including `hantRequestsAfter14446: 0`. The Firefox-client run failed at `tests/browser.mjs:3837`, "a long answer redrew the page" (intake notes step, code this change doesn't touch). |
| 5 | main checkout, `47ffc8f`, the Firefox-client run only (`--test-name-pattern`) | **29 / 29** | Line 3837 passed, so it is a flaky step: it passed in runs 3 and 5 and failed in run 4. The fixed 简体 step passed in Firefox. |

**After merging `main` (step 8, `c8ae374`, with #82):**
- The merge's one conflict was the expected one in `tests/browser.mjs`. #82's 繁體 14446-with-陈 step is kept in full, followed by this branch's refused-font check.
- `npm test`: 1071 / 1071 (1067 plus #82's 4).
- `openspec validate --all`: 6 / 6.
- `build:hant -- --check`: clean.
- Story run 6, from the main checkout at `c8ae374`: **59 / 59**, both browsers, 1087 s. It passed:
  - the forged button;
  - #82's step (`TC, SC and Latin, each once`);
  - the blocked tab (`14446-draft-…-zh-t.pdf`);
  - `hantRequestsAfter14446: 0` in Chrome (not run in Firefox, by design);
  - the Firefox step at line 3837.

### Checks run

| Check | Result | Why |
|---|---|---|
| `npm test` | 1067 / 1067 pass, after every task and the final fix wave | Always |
| `npm run build:hant -- --check` | Exit 0 | Client text changed in EN and 简体 (`summary.intro_tools`, `draft14446.tab_title`, two keys removed) |
| `npm run test:browser` | Chrome client: every step passed (run 4). Firefox client: every step passed (run 5). | The client summary, `app.mjs` and the story changed |
| `npx openspec validate --all` | 6 / 6 valid | The change's specs |
| `npm run db:migrate:test`, `npm run test:database` | Not run | No migration, SQL, RLS or RPC change |
| `npm run test:auth-browser` | Not run | Sign-in is untouched |

What the browser runs prove, check by check:
- **9.2 offers no 13614-C, and a forged 13614-C button opens nothing:** Chrome (runs 3 and 4).
- **Both 14446 forms, the refused font, and the refused form with Try again**, whose failed tab is titled "Draft Form 14446": Chrome (runs 3 and 4).
- **The blocked-tab link** offers `14446-draft-…-zh-t.pdf`: Chrome (runs 3 and 4).
- **The 简体 step** (the first button is the 繁體 14446, with no 13614-C button) runs in both browsers: Chrome in run 4, Firefox in run 5.
- **Building that 14446 doesn't fetch the 繁體 map:** Chrome only (run 4, `hantRequestsAfter14446: 0`). This check is Chrome-only by design, like every draft build in the story, because Firefox may download a blob PDF instead of opening it. Run 5 records it as "not run".
- **The staff side:** the five staff buttons and the English 13614-C open passed in both runs, unchanged.

---

## 3. Delta Spec Sync State

| Capability | Sync state | Notes |
|---|---|---|
| `client-intake` | ✗ Needs sync | MODIFIED "The summary page explains itself and puts its tools first": the header matches the canonical spec exactly, which still says "draft Form 13614-C or Form 14446". ADDED "A client page never makes a draft 13614-C" isn't in the canonical spec. |
| `draft-14446` | ✗ Needs sync | MODIFIED "The draft comes in English and 繁體": the header matches, and the canonical spec still says "next to the draft 13614-C buttons". ADDED "The draft 14446's tab names its form" is new. |
| `screen-states` | ✗ Needs sync | MODIFIED "Errors are shown where the person is looking, never as a toast": the header matches, and the canonical scenario still says "View Draft Form 13614-C". |

Expected at this point. Archive (CLAUDE.md step 8) merges these deltas, after `main` is merged in. Every MODIFIED header matches its canonical requirement exactly, so archive will find them.

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design says | Spec counterpart | Gap |
|---|---|---|---|
| D1 | The summary renders Print and `draft14446Buttons`; `draftButtons` and `DRAFT_FORMS` are deleted | client-intake MODIFIED item 2: "The Print button, and View Draft Form 14446 … SHALL NOT offer the draft Form 13614-C in any language" | none |
| D2 | `viewDraft` returns before `window.open` for a non-presenter 13614-C: no tab, link or error | client-intake ADDED: "SHALL open no tab, build no draft, offer no link and show no error" | none |
| D3 | `summary.intro_tools` reworded in EN and 简体 ("14446 表草稿") | client-intake MODIFIED item 1, third paragraph | none |
| D4 | `writeTab(tab, text, kind)`; `draft14446.tab_title` | draft-14446 ADDED "The draft 14446's tab names its form" | none |
| D5 | The client story checks move to the 14446 | screen-states MODIFIED scenario: "a client presses View Draft Form 14446" | none |

**Drift warnings** (non-blocking):
- D5 lists the story's client draft section only. The 简体 step at ~4877 needed the same change (tasks 3.5). The design's intent holds, but its list was incomplete. Recorded in the retrospective.

---

## 5. Implementation Signal

- [x] No unstaged or uncommitted files in the worktree (`git status --short` is empty).
- [ ] All related commits pushed: not yet. The branch has no upstream. CLAUDE.md step 9 pushes it after archive.

**Commit range**: `9992aab..47ffc8f` (11 commits; `8d79318` is the planning artifacts).

Environment note: freshly created worktrees in this OneDrive folder fail the story at the presenter's reset and the empty "My applications" screen, so the story was run from the main checkout. Not fixed here (user's instruction); recorded in the retrospective.

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```bash
ls docs/superpowers/specs/*.md 2>/dev/null   # 8 files
```

- [x] The files that exist are historical design documents that predate the schema (CLAUDE.md: kept, never rewritten). This change added nothing under `docs/superpowers/`: `git log 9992aab..HEAD -- docs/superpowers` is empty.

| File | Captured in the change? | Action |
|---|---|---|
| — | — | none |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` rows, so there's nothing to list.

| Deferred dogfood (plan §) | Equivalent automated test | Coverage assessment | Real gap? |
|---|---|---|---|
| — | — | — | — |

---

## Overall Decision

- [ ] ✅ PASS — can go on to finishing-a-development-branch and archive
- [x] ⚠️ PASS WITH WARNINGS — can go on, with these noted:
  - the 14446 build's map check runs in Chrome only (by design), and Firefox evidence covers the rest of the step;
  - one flaky story step outside this change (`tests/browser.mjs:3837`, Firefox);
  - the plan missed one story step (3.5, fixed);
  - new worktrees can't run the story here (environment).
- [ ] ❌ FAIL — go back to the failing artifact and verify again

**Next step**: the retrospective (CLAUDE.md step 7). Archive (step 8) waits for #82 to merge. Then `main` is merged into this branch, keeping #82's 繁體 14446-with-陈 story step inside the client draft section, and archive syncs the three deltas above.
