# Retrospective: fix-lifecycle-bar-closed-after-accepted

> Written: 2026-10-31 (after verify passed)
> Commit range: `5603e9e..72aefc1` (before the verify, retrospective and archive commits)
> Worktree: `.claude/worktrees/fix-lifecycle-bar-closed-after-accepted`

---

## 0. Evidence

- **Commit range**: `5603e9e..72aefc1`, 4 commits before the retrospective and archive
- **Diff size**: +461 / −21 lines across 12 files. The code part is small: `src/staff-views.mjs` +16/−12, `src/styles.css` +12, two test files, and a fixture line pair. The rest is the change's planning artifacts.
- **Tasks done**: 6/6
- **Active hours**: about 1.5. Planning, one question to the user, about 40 minutes of implementation and review, and a 19-minute browser run alongside.
- **Subagent dispatches**: 5. An implementer (sonnet), a task reviewer (sonnet), the final whole-branch reviewer (opus), a test fixer (haiku) and a scoped re-reviewer (haiku).
- **New external dependencies**: none
- **Bugs encountered post-merge**: none yet; the PR is not merged
- **OpenSpec validate state at archive**: pass (11/11 before archive)
- **Test coverage signal**:
  - `npm test`: 1455 pass, 0 fail, up from 1452 at the baseline
  - `npm run test:browser`: 79 pass, 0 fail

Commit chain:

```
1e9f5b9 Plan fix-lifecycle-bar-closed-after-accepted: Accepted is the bar's end; a closed case shows only Closed (#109)
eaa88fc Lifecycle bar: Accepted is the end; a closed case shows only Closed (#109)
9639b21 Lifecycle bar test: Corrections in progress keeps the steps before it done
72aefc1 Tasks: fix-lifecycle-bar-closed-after-accepted applied and checked
(then: verify + retrospective, the merge of main, and archive)
```

---

## 1. Wins

- **The data gap was found before any code was written.** Grounding the brainstorm in the code showed that nothing records the stage a closed case stopped at (migrations 036–039; `closingReason` only, in `src/supabase-store.mjs`). The original "Closed in place of the stopping step" design could not be built without a migration. Asking once, before writing the artifacts, turned it into option 3 and an Open Question, not a half-built guess.
- **The change stayed small.** `eaa88fc`:
  - `LIFECYCLE` lost one entry.
  - The state calculation gained two explicit branches.
  - `aria-current` now keys on `state === "current"`, which drops it at Accepted without a special case.
- **The tests pin the Review Focus inputs**: draft, unknown, a Hold with no origin, a closed case from a Hold, and Accepted with mixed methods. The final reviewer confirmed that nothing else reads the bar's step count (`tests/browser.mjs`, `tests/support/`).
- **The browser suite ran while the reviews ran**, so the 19-minute suite added no waiting time.

## 2. Misses

- 🟡 **The ledger said the CSS tokens have dark-mode values. They don't.** [`progress.md`, corrected after the final review] `src/styles.css` defines them once in `:root`, and the app has no dark mode. The conclusion stood, but the reason was wrong.
- 📌 **Neutral and todo look almost the same.** [final review, minor 2] The dot border is `--vt-line` against `--vt-primary-line`, and the label and connector repeat the base rule. This was parked on purpose (see the ledger summary).
- 📌 **The plan's Files block for Task 1 left out `tests/shell.test.mjs` and the golden `tests/fixtures/empty-states.json`.** Both had to be touched: the first by the plan's own Step 1, the second because the golden HTML embeds the bar.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 1 | It also updated `tests/fixtures/empty-states.json` | Its golden `staffCase` and `adminCase` HTML include the bar. The trailing todo Closed step had to go, or the empty-states golden test failed. |
| Task 1 | A commit was added after the final review (`9639b21`) | The Corrections in progress scenario says "the steps before it done", and only the amend step was asserted |
| Task 2 | The controller ran it, with no dispatch | It changes no code, and the browser suite needs the local stack this session runs |
| Brainstorm Q4 | Closed in place of the stopping step became option 3: neutral steps and Closed current | No recorded stopping stage. The user chose option 3 on 2026-10-31. |

## 4. Skill / workflow compliance

| Skill | Used |
|-------|------|
| superpowers:brainstorming | ✗ (brainstormed elsewhere; conclusions handed over) |
| superpowers:writing-plans | ✓ |
| superpowers:using-git-worktrees | ✓ |
| superpowers:subagent-driven-development | ✓ |
| (transitive) superpowers:test-driven-development | ✓ (red run: 6 failing, then green) |
| (transitive) superpowers:requesting-code-review | ✓ (task review, final review on opus, scoped re-review) |
| superpowers:finishing-a-development-branch | ✓ (CLAUDE.md step 9, after archive) |

### Deliberately Skipped Skills

- **`superpowers:brainstorming`**
  - **What was skipped**: invoking the skill to produce `brainstorm.md`.
  - **Why this cycle**: the user's request on 2026-10-31 said the brainstorm was done elsewhere and had passed the 5 promotion criteria. It said to write the conclusions straight into `brainstorm.md` and not ask again. The schema's PRECHECK allows writing it by hand when the user explicitly opts in. The method still did its job: grounding the conclusions found a material gap (Q4), which was put to the user as one question with options before any artifact was written.
  - **How to prevent recurrence**: `CLAUDE.md trigger`. CLAUDE.md step 2 already covers a brainstorm held in the conversation. A sentence could say that conclusions handed over from an outside brainstorm are written by hand, and grounded in the code before propose writes anything else.

## 5. Surprises

- The client's progress stepper was assumed to show where a closed case stopped (the request said "the same as the client stepper's closed notice"). In fact `progressTrack` draws no track at all for a closed case (`src/client-views.mjs:328`).
- The bar's markup is embedded in a golden fixture, so a view change reaches `tests/fixtures/empty-states.json`.

## Ledger summary (rulings, parked findings, deferred minors)

The SDD ledger (`.superpowers/sdd/plan/progress.md`) was deleted after this retrospective, as CLAUDE.md step 7 says. Everything it recorded:

**Rulings**
1. Task 1 may edit `tests/shell.test.mjs` for the stylesheet check. Step 1 names it, and the Files block is what left it out. Cost if wrong: one test sits in a different file than a reader expects.
2. The controller runs Task 2 (checks only) itself, without a dispatch. It changes no files, and the browser suite needs the local stack. Cost if wrong: a no-code task had no separate reviewer.
3. The implementer updated the golden `tests/fixtures/empty-states.json`, outside the Files list. Dropping the trailing Closed step from the embedded bar is the change itself, and the reviewer confirmed that is the only fixture difference. Cost if wrong: none; the fixture is generated output.

**Parked finding**
4. Neutral and todo steps look almost the same: a slightly lighter dot border, with the same label colour and connector. Ruling: the code stands. D3 asks for a muted look that differs from todo, the two never appear on the same bar, and Closed is the only highlight. A stronger look would cost another browser run for a cosmetic gain. Cost if wrong: a follow-up CSS tweak.

**Deferred minors** (the final reviewer agreed none must be fixed before merge)
5. `tests/shell.test.mjs`: the first CSS assertion is subsumed by the second, and the source-text match is loose.
6. The nested ternary for `state` in `lifecycleBar` is dense, but matches the file's style.

**Fixed after the final review**
7. The Corrections in progress scenario was only partly asserted. Fixed in `9639b21`, and the scoped re-review marked it addressed.

**Corrected note**
8. The ledger's claim of dark-mode tokens was wrong (see Misses).

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Before writing artifacts from handed-over conclusions, check that the data each decision needs exists.** → **Promote to** project CLAUDE.md (section 2, step 2 or 3)
  > **Why**: issue #109's agreed design needed the stage a closed case stopped at, and nothing stores it. Writing the artifacts first would have planned an impossible change.
  > **How to apply**: when propose receives a brainstorm's conclusions instead of running one, ground each decision in the code and data before writing `brainstorm.md`. If a decision depends on data that does not exist, ask once with options.

- [ ] 📌 **A view change can reach the golden fixture in `tests/fixtures/empty-states.json`.** → **Promote to** one-off (the plan template for view changes)
  > **Why**: the golden staff and admin case HTML embeds the lifecycle bar. The plan's Files list missed it.
  > **How to apply**: when a plan changes markup on the case page, list `tests/fixtures/empty-states.json` (and its generator `tests/empty-states.states.mjs`) among the files that may change.

- [ ] 📌 **Recording the stage a case was closed from is open.** → **One-off**: the design's Open Questions holds it for a later change
  > **Why**: a closed case's bar cannot show where it stopped, and the History tab is the only record.
  > **How to apply**: open a change when the team wants the bar, or a report, to show where a closed case stopped. Align it with `holdOrigin`.
