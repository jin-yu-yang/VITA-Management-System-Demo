# Retrospective: unify-empty-states

> Written: 2026-10-16 (after verify passed with warnings)
> Commit range: `7404fb6..` the retrospective commit (base: `main` with #78)
> Worktree: `.claude/worktrees/unify-empty-states`

> **Update 2026-10-16**: after the PR opened, CI (Linux, UTC) failed the golden `staffCase` (and `adminCase`) state.
> - **Cause:** the case pages print "Updated" with `formatTime` in the machine's time zone, and the fixture was captured in New York.
> - **Fix:** the test now pins `process.env.TZ = "America/New_York"`, and passes in UTC, New York, Tokyo and London.
> - **Lesson:** §0 and §1 overstated the guard: "deterministic" was checked by rendering twice on one machine, not across machines. A golden capture that contains formatted times must pin the time zone. That is a new §6 candidate, carried into the next retrospective.

---

## 0. Evidence

- **Commit range**: `7404fb6..58ce60c`, 12 commits before this file:
  - 1 planning and 1 merge of `main`;
  - 7 code, test and docs, including one fix round and the final fix wave;
  - 1 tick, 1 verify.
- **Diff size**: +1239 / −27 lines across 21 files. Code, tests and docs alone (without the golden fixture): +249 / −27 across 12 files.
- **Tasks done**: 13/13.
- **Active hours**: about 1.5 h for apply, verify and this retrospective, including one browser run (~15 min). Planning was earlier the same evening.
- **Subagent dispatches**: 16:
  - 5 implementers, 5 task reviews;
  - 1 fix round (resumed implementer) and 1 re-review;
  - 1 final whole-branch review (opus);
  - 1 final fix wave and 1 re-review.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none (not merged yet).
- **OpenSpec validate state at archive**: pass (6/6; see verify §1).
- **Test coverage signal**:
  - unit tests went from 1061 to 1067;
  - the golden test pins 15 empty states;
  - browser: one run, 51/53, with every phase that shows an empty state passing (verify §2).

Commit chain:

```
43eb038 Plan unify-empty-states (OpenSpec change)
81c173a Merge main (#78) into unify-empty-states
ec899b9 Golden markup of every list's empty state, before the helpers
a2f5851 emptyState and emptyLine in ui.mjs, beside the list loading lines
9907253 Restore the space in button's declaration after emptyLine
7bf9bfe Panel lists use emptyState; an empty, unfiltered case pool says No cases yet this season
514851d An empty pool tab with cases elsewhere says No case matches these filters
e17759d Case sections use emptyLine; the Log a call drawer's line is muted like the rest
af373cb Docs: empty lists use emptyState or emptyLine; a new phase adds an EMPTY_TAB sentence
8e140b9 Final review fixes: the client-history empty line uses emptyLine; docs say the helpers take escaped HTML; two more pool cases
ea9be16 OpenSpec change unify-empty-states: tasks ticked
58ce60c OpenSpec change unify-empty-states: verify (pass with warnings)
```

---

## 1. Wins

- **[evidence: 81c173a, ec899b9] Merging #78 before Task 1 meant the golden captured the code the branch builds on.**
  - The fixture never changed afterwards.
  - Its 15 states include whole staff and admin case pages, so every section line is guarded in place.
- **[evidence: plan self-review dry run] The planned states were dry-run against the real code before apply.** All 17 sentences rendered, so Task 1 needed no state adjustments.
- **[evidence: ledger] The task reviews' ⚠️ items earned their keep.** The Task 3 reviewer's question ("does `narrowed` count a phase tab?") led to a real fix (`514851d`). Task 4's reviewer surfaced a tenth empty line that explore had missed.
- **[evidence: tests/browser.mjs selectors, golden queue states] The story's `.office-queue .empty-state` selector and the queue's `data-filter` values were preserved.** The Follow-ups empty-state phase passed in both pairings.

## 2. Misses

- 🟡 **[painful | evidence: 7bf9bfe → 514851d] The plan's pool condition reused `narrowed`, which deliberately leaves out the phase tab.**
  - An empty phase with cases elsewhere would have said "No cases yet this season."
  - Explore read `narrowed`'s use in the summary line but not its definition (`NARROWING_KEYS`, `pool-views.mjs:107`).
- 🟡 **[painful | evidence: explore inventory, Task 4 review, 8e140b9] Explore listed nine section lines; there are ten.**
  - The tenth is the History tab's "What the client sees". I first ruled to leave it hand-written, because of its `data-role` attribute and the history area being Jinyu's.
  - The final review showed that reasoning didn't hold, since the same function's other line had already moved, so it was fixed with `emptyLine(text, attrs)`.
- 🟡 **[painful | evidence: verify §2] The single browser run had one pairing fail in a presenter window that never rendered.**
  - That makes four changes in a row with an unrelated environment failure on this machine.
  - Not retried, by the user's rule.
- 📌 **[nit | evidence: 9907253] The Task 2 implementer broke a space in `button`'s declaration and fixed it in a second commit.** The net diff is clean.

### Deferred minor findings from the ledger

Triaged by the final reviewer, and all kept as they are:
- **T1:** the SENTENCES check pools all states. The byte-for-byte comparison still catches a drifting state.
- **T2:** `emptyState()` without `text` renders `<p>undefined</p>`. Every caller passes text, and the spec requires a sentence.
- **T3:** with only a phase tab set, the pool summary still says "No filters. Showing every case this season." This is old code, left for Jinyu's phase work; final review F-M1, and mentioned in the PR.
- **T4:** the drawer test's regex doesn't pin the order of `head` and `drawerError`.
- **Final review F-M2:** the Task 3 ruling's stated reason was wrong. It said "a phase tab isn't cleared by Clear filters today". In fact `clear-pool-filters` clears every key in `POOL_FILTER_KEYS`, `poolPhase` included. Only whether the button *shows* depends on `narrowed`. Behaviour is unaffected; corrected here.
- **Final re-review:** the docs paragraph in `frontend.md` has one long line (style).

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| — (before 1) | Merged `main` (#78) before Task 1 | #78 landed after planning; capturing the golden on the merged code avoids re-capturing later |
| 3.2 | The pool's "matches" condition is `narrowed \|\| chosen.poolPhase !== "all"`, not `narrowed` | Fix round 1: a phase tab is a filter for this sentence (spec Req 2) |
| 4.1 | Ten section lines, not nine; `emptyLine` gained an optional `attrs` | Final review F-I1: the History tab's "What the client sees" line carries `data-role="client-history"` |
| 6.1 | The docs paragraph also says the helpers take already-escaped HTML | Final review F-M3: their neighbours escape, so a future caller could be surprised |

### Rulings recorded in the ledger (all of them, in order)

1. **Commit trailers** name the model that actually wrote each commit.
2. **Task 3, pool condition:** a phase tab counts as a filter for the empty sentence; `narrowed` and the summary line are left alone. Its stated reason was wrong (§2, F-M2); the decision stands.
3. **Task 4:** the tenth line stays hand-written. **Overturned** by ruling 4.
4. **Final review:** fix the tenth line with `emptyLine(text, attrs)`. The golden test proves the bytes didn't change.
5. **One fix wave** for F-I1, F-M3 and F-M4. F-M1 (the pool summary with a phase tab) is left for Jinyu's phase change and mentioned in the PR; F-M2 is corrected here.
6. **The fix wave waited for the browser run** to keep the machine quiet. It changes no markup, so the run's result stands without a second run.

## 4. Skill / workflow compliance

| Skill | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming | ✓ (method in conversation; skill invoked at propose to capture brainstorm.md) |
| superpowers:writing-plans | ✓ (plan.md, with a dry run of Task 1's states during self-review) |
| superpowers:using-git-worktrees | ✓ (`.claude/worktrees/unify-empty-states`, created from up-to-date `main`) |
| superpowers:subagent-driven-development | ✓ (ledger, pre-flight scan, per-task reviews, one fix round, final review on opus, one fix wave with re-review) |
| (transitive) superpowers:test-driven-development | ✓ (RED/GREEN for the helpers, the pool, the drawer and `emptyLine`'s `attrs`; the moves are guarded by the golden test) |
| (transitive) superpowers:requesting-code-review | ✓ (final whole-branch review with code-reviewer.md) |
| superpowers:finishing-a-development-branch | ✓ (step 9, after archive) |

### Deliberately Skipped Skills

None. One deviation from the skills' defaults, because CLAUDE.md asks for it: the subagent-driven development workspace was not deleted at its own finish. CLAUDE.md step 7 needs the ledger for this retrospective, and it is deleted right after this file is written.

## 5. Surprises

- **Most lists already had empty states.** The change was consolidation, as with #78. The real bug, the pool's sentence, was the one place nobody had looked at the unfiltered case.
- **`narrowed` in the pool deliberately leaves out the phase tab.** Clear filters therefore doesn't show for a phase alone, but pressing it does clear the phase. Two different notions of "filtered" live side by side in `pool-views.mjs`.
- **A `data-role` on an empty line.** The story and a staff test read the client-history section through it, so the helper needed an attribute option after all.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **When a plan reuses a variable for a new condition, read the variable's definition, not just its use.** → **Promote to** memory (type: feedback)
  > **Why**: the pool plan reused `narrowed` from the summary line; its definition (`NARROWING_KEYS` without `poolPhase`) made the new sentence wrong for phase tabs.
  > **How to apply**: during plan self-review, for every existing variable a new branch depends on, open its definition and list what it excludes.

- [ ] 🟡 **For an "every X" inventory, grep for the markup pattern as well as for the words.** → **Promote to** memory (type: feedback)
  > **Why**: explore found the empty lines by text ("No …", "Nothing …") and missed "The client has seen no updates yet."
  > **How to apply**: when a change claims to cover every instance of a UI pattern, also grep the markup shape (here `class="muted"` inside an empty branch) and compare the two lists.

- [ ] 📌 **The pool summary line with only a phase tab ("No filters. Showing every case this season.").** → **Promote to** one-off follow-up (Jinyu's lifecycle/phase-tab change)
  > **Why**: it contradicts the empty sentence when a phase alone empties the list; that code is outside this change.
  > **How to apply**: when the pool's phase tabs change, make the summary's note depend on `narrowed || poolPhase !== "all"` too.

- [ ] 📌 **Unrelated browser failures, four changes running.** → **Promote to** one-off follow-up (test tooling)
  > **Why**: presenter-window page loads, client-intake quiet waits and sign-in waits fail intermittently on this machine, never in the changed code.
  > **How to apply**: before relying on one-run browser checks again, collect the four failures (verify.md of each change) and look for a shared cause (page load or the quiet watcher).
