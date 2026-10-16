# Retrospective: add-widowed-spouse-rules

> Written: 2026-10-16 (after verify passed with warnings)
> Commit range: `4842962..4c005d0` (11 commits after the planning commit; this retrospective and the archive follow)
> Worktree: `.claude/worktrees/add-widowed-spouse-rules` on branch `add-widowed-spouse-rules`

---

## 0. Evidence

- **Commit range**: `4842962..4c005d0`, 11 commits:
  - 6 task commits;
  - 2 fix rounds (Tasks 5 and 6);
  - 1 final fix wave;
  - 1 task-tick commit;
  - 1 verify commit.
- **Diff size**:
  - after the planning commit (`4842962..4c005d0`): 39 files, +1336 / −132;
  - branch total (`d16f2bf..4c005d0`): 45 files, +3550 / −114, including the planning artifacts.
  - The generated catalogue module and 028 hold the whole catalogue as long single lines.
- **Tasks done**: 13/13 across six groups.
- **Active hours**: about 5 across 2026-10-15/16. That covers the explore (the IRS Publication 501 check and nine decisions), propose, three recheck rounds, apply including the controller's dry runs and three story runs, verify and this retrospective.
- **Subagent dispatches**: 19 during apply.
  - 6 task implementers (Sonnet);
  - 2 resumed implementers, for the Task 5 and Task 6 fix rounds;
  - 1 final fix wave (Sonnet);
  - 6 task reviewers (Sonnet);
  - 2 scoped re-reviews (Sonnet, Haiku);
  - 1 final whole-branch review (Opus);
  - 1 scoped re-review of the final fix wave (Sonnet).
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none yet (not merged).
- **OpenSpec validate state at archive**: pass at verify (4/4).
- **Test coverage signal**:

  | Suite | `main` | This branch |
  |---|---|---|
  | unit | 943 | 969: the 965 the plan predicted, plus 4 from the final fix wave |
  | database | 250 | 253 with 027–028, twice |
  | story | 57 | 49/53 on the first run (a stale later expectation), then 57/57 twice |
  | sign-in | 20 | not run: no change |

Commit chain:

```
4842962 OpenSpec change add-widowed-spouse-rules: planning artifacts
d470a1b Show-if gains gte, lte and any; a year can carry a range
e045257 Migration 027: intake_holds reads gte, lte and any; the loader checks them; a year can carry a range
4a48adb Two named spouse rules: a recently widowed client gives the late spouse's details
db1e668 Cards, titles, the who clean-up, the Fill and the draft follow the widowed rules
92a39a2 Story: a widowed client's late spouse appears for 2025 and leaves for 2015
ca7e7fc Story: a fresh window opens at the spouse's documents, the spouse part already visited
8756fcb Docs: migrations 027-028, the show-if rules and the widowed spouse
5dfa65b Docs: the database total is 253 everywhere; the story run took about 14 minutes
48ffc71 Fix the final review: a year with spaces reads as sent, and the Fill keeps a widow widowed
af2742e OpenSpec change add-widowed-spouse-rules: all tasks done
4c005d0 OpenSpec change add-widowed-spouse-rules: verify
(retrospective and archive commits follow)
```

---

## 1. Wins

- [evidence: brainstorm Q1, the user's correction] **The cut-off years were checked against IRS Publication 501 (2025) before design.** The user's heads-up moved the "spouse on the return" rule from 2024 to 2023, because a qualifying surviving spouse's spouse "died in 2023 or 2024". The rule is now right in both places.
- [evidence: design D2, 4a48adb] **Two named rules, defined once, expanded by the builder.** The database only ever sees expanded JSON, so it needed no rule table. Every reader reads S or J through `spouseOnReturn` and `spouseShown`, and the final review found no direct "married" test left in `src/`.
- [evidence: e045257, the controller's dry runs, test:database] **Migration 027 worked on its first database run.** The three copied bodies were diffed against 011 and 015 by script, by the implementer and by two reviewers. The 027-alone dry run, the 027 + 028 dry run and both database suites passed with no fix.
- [evidence: tests/database-intake.mjs] **A direct browser/database parity table.** One list of show-if cases is checked against both `isVisible` and `intake_holds`. With the existing whole-catalogue visibility loop, it settled the review's question about `or` evaluation order in `intake_show_if_ok`: the object-group case is refused with VALIDATION.
- [evidence: user rechecks before apply] **The planning rechecks found four real defects before any code.** I found the 2205 upper bound and the retyping clean-up. The user found the redraw that could never fire and the move that re-sends an unchanged marital status. None of them reached the code.
- [evidence: story run 2] **The rail redraw is checked where it matters.** The story waits for "Your late spouse" in the rail right after the year field is left, before any move, and it passed in both browser permutations.

## 2. Misses

- 🟡 [painful | evidence: the user's third recheck] **My first redraw fix could never fire.** It compared the draft's sub-steps before and after `change`, but every keystroke already reaches the draft through `input`. The user caught it, and the fix compares the page with the draft, as `needsRedraw` does.
- 🟡 [painful | evidence: the user's third recheck] **The who clean-up would have dropped "My spouse" on every move.** A move re-sends every answer on the page (`sweepV2Form`), including the unchanged marital status. The user caught it. Only a changed status now counts.
- 🟡 [painful | evidence: final review, 48ffc71] **A padded year made the browser and server disagree.** `sendable` trims a year before checking and saving it, but the browser's rules read the raw draft. So "2024 " hid the late spouse's questions while the server required them. The parity tests compared literal JSON, so they couldn't see the browser's own transformation.
- 🟡 [painful | evidence: final review, 48ffc71] **Fill stored a late spouse's phone that staff could see.** The married sample's hidden `sp_phone` is a contact field, which the save copies into `case_contacts` and the staff contact card shows. My Task 4 ruling had called hidden answers harmless, and the reviewer had flagged only Regenerate.
- 📌 [nit | evidence: story run 1, ca7e7fc] **The new story walk broke a later step's premise.** "Visits follow the client" expected the case to open at the spouse part, "never opened". The widowed walk now opens it first. One fix round updated the expectation to the first non-Done part, `documents.identity`.
- 📌 [nit | evidence: Task 3 hand-back] **The plan's database assertion couldn't hold.** `completeAnswers` fills every visible required field, `sp_last_name` included. The implementer removed it before asking the server, which is exactly the spec scenario. Ruled and ledgered.
- 📌 [nit | evidence: Task 6 review, 5dfa65b] **The docs sweep missed two database counts** (250 in `docs/developer/README.md` and `database.md`). One fix round.
- 📌 [nit | evidence: the user's third recheck] **The plan's expected-failure count for Task 4 was wrong.** Four tests already passed, not eleven failing: two guard today's unmarried treatment, and two depended only on Task 3's `spouseShown`. Those two moved into Task 3.

## 3. Plan deviations

| Plan task | What changed | Why |
|---|---|---|
| 3 | Step 7's `intake_missing` assertion removes `sp_last_name` from the `completeAnswers` set. | `completeAnswers` fills it. Ruling in the ledger. |
| 4 | None in code. The Regenerate behaviour was ruled to stand, and the ruling was reversed at the final review. | See the final row. |
| 5 | A fix round changed the later "visits follow the client" step to expect `documents.identity`, and its comment. | The new walk visits the spouse part. |
| 6 | The show-if grammar paragraph went to `docs/developer/database.md`, where the grammar already lives, not `frontend.md`. A fix round corrected two database counts and added the story duration. | Ruling in the ledger; Task 6 review. |
| final | `wholeNumber` and the controller's `yearDone` read the year as sent (trimmed). The padded row left the SQL parity subtest. A new `sampleAnswersFor` serves both Fill paths: a widow stays widowed with their year, the late spouse gets no phone or married-only answers, and Regenerate keeps the status. Four new tests; unit count 969 in the docs. design.md D1, D7 and the Migration Plan were updated at verify. | Final review, two Importants plus a minor. Rulings in the ledger. |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓ (agreed in conversation; the skill wrote `brainstorm.md` at propose) |
| superpowers:writing-plans | ✓ (`plan.md` in the change folder) |
| superpowers:using-git-worktrees | ✓ (`.claude/worktrees/add-widowed-spouse-rules`: `git worktree add` for the existing branch, then `EnterWorktree` by path; the `node_modules` and `.env.test` links at setup) |
| superpowers:subagent-driven-development | ✓ (ledger, pre-flight scan table, per-task reviews, two fix rounds, final review, one fix wave) |
| (transitive) superpowers:test-driven-development | ✓ (each implementer reported RED and GREEN; Tasks 2 and 5 had no unit RED by design, and the controller's dry runs and story runs stood in) |
| (transitive) superpowers:requesting-code-review | ✓ (per-task reviews, and the final review on Opus) |
| superpowers:finishing-a-development-branch | ✓ at lifecycle step 9 |

### Deliberately Skipped Skills

None.

## 5. Surprises

- **The browser draft holds whatever is typed, keystroke by keystroke.** Three of this change's defects came from that one fact: the 2205 upper bound, the retyping clean-up, and the redraw that couldn't fire.
- **A browser value is transformed before it is checked and sent.** `sendable` trims text-like answers, years included. A rule that reads the raw draft can disagree with the server even when the two evaluators agree on every literal.
- **Some hidden answers don't stay hidden.** Contact fields (`tp_phone`, `sp_phone`, the contact times) are copied by the save into `case_contacts`, which staff see whether or not the question is visible.
- **A story walk that visits a sub-step changes later steps' premises.** Visits are part of the server state the story reads later ("the first sub-step that isn't Done").

## Ledger summary (rulings, parked findings, deferred minors)

From the SDD ledger (`.superpowers/sdd/plan/progress.md`), before it was deleted.

**Rulings**, in order:
1. **Accept 027's verbatim copies** of `intake_holds`, `put_intake_field` and `check_intake_value` (pre-flight). Migrations are immutable, and `create or replace` must restate the whole body, as 015 did. Cost if wrong: none at runtime.
2. **Drop `sp_last_name` from the Task 3 `completeAnswers` set** before asking the server, the spec scenario "submits without the spouse's last name". Cost if wrong: none.
3. **No fix for Regenerate turning a widow married** (Task 4 review, plan-mandated). Superseded by ruling 5.
4. **The show-if grammar paragraph goes in `database.md`** (Task 6). Cost if wrong: a reader looks in `frontend.md` first.
5. **Reverse ruling 3:** fix Regenerate along with the Fill's leaked phone, using `sampleAnswersFor` (final review). Its premise, that hidden answers never surface, was false for `sp_phone`.
6. **Trim `gte`/`lte` in the browser only, and drop the padded row from the SQL parity subtest** (final review). The server only stores trimmed values, so 027 stays. Cost if wrong: a hand-crafted padded year would still be refused by the server's year check.

**Parked findings:** none. No fix loop reached its cap.

**Deferred minors** (the final review triaged them; none blocks merge):
- `invalidText`'s year regex matches four digits only; the builder only emits four-digit bounds.
- A year with only one of min/max gets no browser range check (the database checks each bound alone); the builder always sets both.
- `intake_holds` casts a `gte`/`lte` value to numeric unguarded; the loader refuses a non-number value.
- `RULES`' freeze is shallow; every consumer clones it.
- The builder's `gte`/`lte` check doesn't type-check the value; the database loader would refuse it.
- The tax-year guard reads the standard draft only; the skeleton comparison catches a senior mismatch.
- No test of a `rule` clause inside a conditional tip.
- `SPOUSE_LINES` is rebuilt per `draftFields` call, and `hasSpouse = joint` is a redundant alias.
- The draft test doesn't assert a 2025 widow's job title or Spouse tick.
- `listedSubstepsStale` has no unit test; the story covers it.
- The story's `.page-intro h1` is unscoped, and its job-title/phone counts are read once after a quiet wait.
- The assert message at `tests/browser.mjs:3777` says the opposite of what it checks (pre-existing).
- `sampleAnswersFor` copies a padded year as typed; the rules read it trimmed.
- Closed during apply: the `DRIVERS` recursion (covered by the Task 3 pin), the `or` order in `intake_show_if_ok` (settled by the database run), and loader acceptance of a valid show-if (proved by loading 028).

## 6. Promote candidates → long-term learning

- [x] 🟡 **Any check at `change` time sees a draft that `input` has already updated** → **Promoted to memory** `change-sees-updated-draft` (type: feedback)
  > **Why**: here a redraw that compared the draft's sub-steps before and after `change` could never fire, and a per-keystroke clean-up would have dropped "My spouse" mid-retype. The user caught the first at planning.
  > **How to apply**: when planning anything that reacts to a form edit, compare the page with the draft (as `needsRedraw` does), and treat partial or cleared values and a move's re-sent unchanged answers as edits too.

- [x] 🟡 **Browser/server parity must include the browser's own transformation of the value** → **Promoted to memory** `browser-reads-as-sent` (type: feedback)
  > **Why**: the parity table compared literal JSON on both sides and passed, while "2024 " (trimmed by `sendable` before it is checked and sent) made the browser hide questions the server then required.
  > **How to apply**: when a rule reads an answer in the browser, read it the way `sendable` sends it, and add a padded or unnormalised value to the browser-side test.

- [x] 🟡 **Hidden answers aren't harmless when they are contact fields** → **Promoted to memory** `hidden-contact-fields-surface` (type: project)
  > **Why**: Fill stored the married sample's hidden `sp_phone` for a widow, and the save copies contact fields into `case_contacts`, which the staff contact card shows. A ruling that called hidden answers harmless was wrong.
  > **How to apply**: before ruling that a hidden answer is harmless, check whether it is in `CONTACT_FIELDS`, or otherwise copied by the save.

- [x] 📌 **A new story walk can break a later step's premise about visits** → **Promoted to memory** (appended to `story-save-timing`)
  > **Why**: the widowed walk opened the spouse part, so "visits follow the client" no longer landed on a never-opened part.
  > **How to apply**: when a story step jumps to a sub-step, grep later steps for expectations about first-visit or "never opened" before committing.

- [ ] 📌 **`completeAnswers` fills every visible required field** → **One-off** (recorded here)
  > **Why**: it made the plan's "missing" assertion impossible as written; the fix is local to that test.
