# Retrospective: add-unmarried-intake-wording

> Written: 2026-10-14 (after verify passed with warnings)
> Commit range: `eaa65c0..88993b6` (12 commits; this retrospective and the archive follow)
> Worktree: `.claude/worktrees/add-unmarried-intake-wording` on branch `add-unmarried-intake-wording`

---

## 0. Evidence

- **Commit range**: `eaa65c0..88993b6`, 12 commits: 2 planning, 9 implementation, 1 task ticks.
- **Diff size**:
  - implementation (`eaa65c0..88993b6`): 34 files, +1245 / −100 lines;
  - branch total (`fc80386..88993b6`): 36 files, +2557 / −83 lines, including the artifacts.
  - The generated catalogue module and 025 hold the whole catalogue as single long lines.
- **Tasks done**: 21/21 across nine task groups. Groups 7–9 were added during apply.
- **Active hours**: about 7, across 2026-10-13/14. That covers explore, the brainstorm, propose, three recheck rounds, apply including the mid-apply re-plan, verify and this retrospective.
- **Subagent dispatches**:
  - 9 implementers;
  - 9 task reviewers;
  - 2 final reviews on Opus: the whole branch, then a scoped re-review of the fix wave.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none yet (not merged).
- **OpenSpec validate state at archive**: pass at verify (3/3, one advisory INFO).
- **Test coverage signal**:

  | Suite | `main` | This branch |
  |---|---|---|
  | unit | 904 | 919 |
  | database | 250 | 250 |
  | sign-in | 20 | 20 |
  | story | 57 | 57, one run |

Commit chain:

```
eaa65c0 planning artifacts
0ccefb0 catalogue: not-married wording, leads, intro; senior leads 您爱人 (025 first version)
37c6147 spouseShown + wording/leadOf/introOf with answers
fd8c153 every screen passes the application's answers
38f90fe the direct-deposit card's hint
973179a story: wages lead and Q9.1a
d25a980 docs
d985c17 planning update: the "who" questions (Q8)
1f85eb2 "who" questions as Yes/No radio buttons; 025 regenerated
ec1d615 story: Q5.3
8bc5b67 docs for the regenerated 025
88993b6 task ticks
(retrospective, archive)
```

---

## 1. Wins

- **[evidence: 37c6147, fd8c153]** One married rule and three readers, each with "no answers means today's text" built in. Every screen opted in by passing its answers, and nothing else changed behaviour. The Opus review confirmed that no screen showing one application was missed.
- **[evidence: Task 5 dry run, Task 8 dry run]** The two dry runs of 025, in rolled-back transactions, showed "0 field rows changed". That showed it was text only, and that `main`'s field-table test would still pass on the shared stack.
- **[evidence: 1f85eb2]** The "who" redesign kept the saved answer as `["me"]`/`["none"]`. The database, the document cards and the 13614-C needed no change, and one helper (`askedAlone`/`asAloneOption`) covers rendering, labels and read-back.
- **[evidence: ledger rulings]** The lessons from #65 held:
  - I ran every stack and browser step myself, so no implementer was blocked by a permission check;
  - every dispatch stated the Opus 5.5 trailer, so all 12 commits carry it;
  - the story checks read saved answers only after a sub-step move.
- **[evidence: planning rechecks]** Three recheck rounds caught real errors before apply:
  - the story label's range-note suffix;
  - the wrong `zh-s` language code;
  - the senior fixture renaming Section 1;
  - the bank card the user spotted.

## 2. Misses

- 🔴 **[blocking until fixed | evidence: final review → d985c17]** The inventory missed the senior Chinese of seven "who" questions. My first inventory command filtered out the Chinese lines (`grep -v "senior.zh\|general.zh"`), so it searched only the English. The user approved that inventory on the strength of its claim to be complete. The final review caught the gap. The user then redesigned it, so it became a whole new task group, plus regenerating a migration already applied.
- 🟡 **[painful | evidence: 0ccefb0 → 1f85eb2]** 025 had to be regenerated after it was applied to the test stack: the A1 ledger reset. It was clean, because the branch was never pushed, but it was avoidable with a full inventory.
- 📌 **[nit | evidence: Task 9 report]** The Haiku docs implementer didn't write its report file. It said its own rules forbade report `.md` files, and reported inline instead.
- 📌 **[nit | evidence: Task 8 refusal]** A ledger line that quoted a `git log` command was refused by the worktree guard, because the text contains git. Ledger writes have to avoid naming git commands.

## 3. Plan deviations

| Plan task | What changed | Why |
|---|---|---|
| Tasks 7–9 (new) | The "who" questions as Yes/No radio buttons, Q5.3–Q5.9 asked directly, the "Asked by:" lines, and 025 regenerated | The final review's Important 1, and the user's decisions Q8 (1–4, A1) |
| Task 7 | Also: `conflictForm` passes the client's answers to `formatAnswer` | Without it, an unmarried compare row shows the new question next to "Me / No one" (ruling in the ledger) |
| Task 7 | Updated the existing intake-form test "who shows My spouse only while married" to render as married | With no answers, a client now counts as unmarried and gets Yes/No |
| Tasks 5 and 8 | The controller ran the migration and every stack and browser suite | A ruling made up front; subagents can't use the user's approval |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓ (`brainstorm.md`, Q1–Q8) |
| superpowers:writing-plans | ✓ (`plan.md`, revised mid-apply through `/opsx:update`) |
| superpowers:using-git-worktrees | ✓ |
| superpowers:subagent-driven-development | ✓ (ledger, pre-flight table, nine task loops, final review, scoped re-review) |
| (transitive) superpowers:test-driven-development | ✓ (RED, then GREEN, in every code task) |
| (transitive) superpowers:requesting-code-review | ✓ |
| superpowers:finishing-a-development-branch | ✓ planned (step 9) |

### Deliberately Skipped Skills

None.

## 5. Surprises

- **The English inventory looked complete, but the senior Chinese wasn't neutral.** The standard and senior English and the standard Chinese say "Who …"/以下谁…, but the senior Chinese names 您爱人.
- **A Yes/No "who" question needs radio buttons, and radio buttons return a string.** Without the wrap in `valuesFromControls`, the client's own check would have quietly withheld the answer.
- **Three document cards ask exactly these questions** (visa, IP PIN, digital assets). So the "Asked by:" fix, which first looked cosmetic, was needed.

## 6. Promote candidates → long-term learning

- [ ] 🔴 **An inventory of client-facing text covers every language and version** → **Promote to memory** (type: feedback)
  > **Why**: the senior Chinese of Q5.3–Q5.9 named the spouse while the English was neutral. Because the scan dropped the Chinese lines, the user approved an incomplete list.
  > **How to apply**: when a change claims "every place clients see X", sweep the generated catalogue's `en` and `zh`, for both `general` and `senior`, plus client-text and document cards. Show the sweep's command and its count in the brainstorm.

- [ ] 🟡 **Write ledger and report lines without git command text** → **Promote to memory** (type: feedback; extend [[worktree-git-commands]])
  > **Why**: a `printf` into the ledger that quoted `git log` was refused by the worktree guard.
  > **How to apply**: in a worktree session, describe git evidence in words ("trailer checked"), or run the git command separately.

- [ ] 📌 **Cheap-model docs implementers may refuse to write report files** → **One-off** (recorded only)
  > **Why**: one Haiku run cited its own rule against report `.md` files. Its inline report was enough.

**Ledger findings, summarized** (the ledger is deleted after this retrospective, per CLAUDE.md §7):
- **Rulings:**
  1. I run every stack and browser step, and implementers edit, unit-test and commit.
  2. Model choice per role: Sonnet or Haiku implementers, Sonnet task reviewers, Opus for the final review and the re-review.
  3. Keep the implementer's extra `conflictForm` change (Task 7).
- **The user's decisions during apply:**
  - fold the "who" questions in (Q8 1–4);
  - regenerate 025 in place (A1, including the ledger reset on `vitally-task2`).
- **Deferred minors, triaged as needing no fix:**
  - **Task 1:** untested refusals (a second intro block, `English / 中文`, a section intro with no spouse); senior section-6 test assertions derived with `.replace`; parser edge cases (a not-married block before the married one, an empty block); an unreachable guard half.
  - **Task 2:** comment placement; `wording` duplicating `inVariant`; untested null sub-step or section.
  - **Task 3:** alert, summary and compare tests check only the unmarried side; no screen-level senior test; `itemLabel`'s parameter order.
  - **Task 4:** the married Maybe-only bank card isn't asserted; no comment on the bank rule.
  - **Task 5:** one-shot label read in the story.
  - **Task 6:** the 025 row is long; a pre-existing stale "001–014" line in `docs/setup.md`.
  - **Task 7:** the compare table's server column can mix labels on a marital conflict; the radio markup repeats the yes/no markup; no direct test for `irs_language_pref` or for the radio state after `clearSpouse`.
  - **Task 8:** the married Q5.3 assertion has no message.
  - **Scoped re-review:** no unit test pins Yes/No in the client summary or the office part summary.
- **Out of scope, for the group's wording review:** section 0's "Photo ID … for you and your spouse".
- **Parked findings:** none.
