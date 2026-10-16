# Verification Report

**Change**: `unify-feedback-and-loading-states`
**Verified at**: `2026-10-16`
**Verifier**: Claude (Opus 5.5), the controller of the subagent-driven apply. The `openspec-verify-change` skill isn't installed, so the checks below were run directly (CLAUDE.md, lifecycle step 6).

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item is `"valid": true`.

**Result:**

```text
change/unify-feedback-and-loading-states   valid
spec/client-intake                         valid
spec/draft-13614c                          valid
spec/draft-14446                           valid
spec/staff-case-work                       valid
totals: 5 items, 5 passed, 0 failed
```

`screen-states` is a new capability, so it has no canonical spec yet; its delta validates as part of the change.

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` is now `- [x]`: 17 of 17, with 0 open (committed in a0ab847).

| Task | Why unfinished | Blocks archive? |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Notes |
|---|---|---|
| `screen-states` | ✗ Needs sync (new capability) | Five ADDED requirements: errors shown where the person is looking (never as a toast); the toast's kinds and behaviour; lists that are loading or couldn't load; the pressed button; the connection notice. `/opsx:archive` creates `openspec/specs/screen-states/spec.md`; its Purpose is written then. |

No existing capability changes.

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Spec | Gap |
|---|---|---|---|
| Errors never toast | D1: refusals through `refuse`; the three catches as a safety net (sign-in screens skipped); draft failures through `noteLocalFailure` with a rebuild retry | "Errors are shown where the person is looking…" (refusal, draft, nothing-recorded and sign-in scenarios) | None, after the fixes below |
| Where an error shows | D2: the open dialog, then in place, then the save chip, then the banner; one error at a time | the same order; "A newer error replaces a failed save" | None, after the fixes below |
| The local retry | D3: one pending local retry; `retryLast` runs it before any await and returns `{ local: true }` | the draft and list Try again scenarios | None, after the fixes below |
| The toast | D4: `src/toast.mjs` timer; host outside `#app`; persistent live text; 44px Dismiss and Escape; position above Add a case's bar | "A toast confirms, informs or warns…" (all seven scenarios) | None, after the fixes below |
| Busy buttons | D5: an allow-list of presses; a spinner and `aria-busy` while `busy` or `officeSaving` | "The pressed button shows it is working" (Claim, Send, sub-step move) | Fixed at verify (D5's stale guard, below) |
| Lists | D6: `lists`, `loadData`, `noteUnloaded`, `dataLoaded`; loading and couldn't-load lines | "A list says when it is loading or couldn't load" | None, after the fixes below |
| Connection and looks | D7: the attention notice with a spinner while reconnecting; "You're back online."; DESIGN.md's error and notice pairs, text `#8a5a12` for the notice | "The connection notice says…" (three scenarios) | None |

**Drift warnings (non-blocking), each fixed before verify:**
- **A replacing toast forgot its hold (Task 2 review, Important).** `show()` reset the hover and focus hold, and no new `mouseenter`/`focusin` fires under a pointer or focus that hasn't moved. Fixed in 200984c: `notify` syncs the real hold after `show()`.
- **The lists' Try again (Task 4 review, Important ×2).** A restored open case that also failed dropped the lists' retry. A refresh after a failed start never read the people or the workspace, which would leave Add a case waiting forever. Fixed in b1449e1: `noteUnloaded` now runs after the open case is read, and a `dataLoaded` flag makes `refresh()` use `loadData()`. design.md D6 now says so.
- **The busy guard (Task 5 review, Important).** The plan's "skip while the save chip is saving" hid the spinner on Add a case's Save and Send. Fixed in 3e097b0. design.md D5 was updated at verify.
- **The story's Add a case check (Task 8 review, Important).** It could pass without checking anything. Fixed in c65cc1e and dcc9fd4.
- **The final review, fixed in f5a2e96:**
  - a Try again that did nothing after a dismissed draft error;
  - errors shown twice on the client intake (its own inline error);
  - the safety net's "nothing new was recorded" check never matching, now done with an error count;
  - the corrections dialog's error without controls;
  - the toast's live region hidden with its host.

  design.md D1–D4 were updated at verify.

---

## 5. Implementation Signal

- [x] Nothing unstaged in the worktree but this report and the design notes. These are committed with this report. Only the local `node_modules` link is untracked; the `.env.test` link is ignored.
- [ ] All related commits pushed: not yet. They are pushed at lifecycle step 9, after archive.

**Commit range**: `ca9a235..a0ab847`, 15 commits after the planning commit, plus this report. Branch `unify-feedback-and-loading-states`, base `main` 73f88df.

**Checks run** (CLAUDE.md, Verification):

| Check | Result | Why |
|---|---|---|
| `npm test` | 1043/1043 (999 on `main`, plus 44 new) | Always |
| `npm run build:hant -- --check` | clean | Client text changed: the client's list lines, "You're back online.", the draft banner sentences |
| `npm run build:intake` | leaves nothing to commit ("the newest catalogue migration already records this catalogue") | CI; the catalogue is unchanged |
| `npx openspec validate --all` | 5/5 valid | CI |
| `npm run test:browser` | 57/57 (about 13.5 min) after Task 8, and 57/57 (about 14.7 min) after the final fix wave | The views, `app.mjs`, the controller, CSS and the story changed. Its evidence recorded the Add a case toast "shown above the bar", and Try again opening the rebuilt draft in a new tab |
| `npm run test:auth-browser` | 20/20 | The sign-in screens lose their duplicate toast |
| `npm run db:migrate:test`, `npm run test:database` | not run | No database change |

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
- [x] ⚠️ PASS WITH WARNINGS: the drifts in §4, each fixed before verify (in code with tests, and in design.md at verify).
- [ ] ❌ FAIL

**Next step:** write `retrospective.md` (lifecycle step 7), then merge `main` if it moved and run `/opsx:archive` (step 8).
