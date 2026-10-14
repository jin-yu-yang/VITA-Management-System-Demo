# Retrospective: require-15080-signatures-and-household-middle-name

> Written: 2026-10-13 (after verify passed with warnings)
> Commit range: `e074141..587b049` (7 implementation commits after the planning commit; this retrospective and the archive follow)
> Worktree: `.claude/worktrees/require-15080-signatures-and-household-middle-name` on branch `require-15080-signatures-and-household-middle-name`

---

## 0. Evidence

- **Commit range**: `e074141..587b049`, 7 commits. Counting the planning commit, it's 8 commits from `main` (`a85ee51`).
- **Diff size**:
  - implementation (`e074141..587b049`): 22 files, +276 / −45 lines;
  - branch total (`a85ee51..587b049`): 28 files, +1253 / −30 lines, including the artifacts.
  - The generated migration 024 and `src/intake-catalogue-data.mjs` hold the whole catalogue. 024 is a single line of about 100 KB, so the line counts understate the bytes.
- **Tasks done**: 14/14.
- **Active hours**: about 4, in one session on 2026-10-13. That covers the explore and brainstorm of the four intake fixes, propose, three recheck rounds, apply, verify and this retrospective.
- **Subagent dispatches**:
  - 5 implementers;
  - 8 reviewers: 5 task reviews, 1 final whole-branch review (Opus) and 2 scoped re-reviews;
  - 1 final fix wave;
  - 3 resumes: Task 2 Step 6, Task 4 fix round 1 and Task 5 fix round 1.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none yet (not merged).
- **OpenSpec validate state at archive**: pass at verify (`--all`: 2 items, 2 passed).
- **Test coverage signal**:

  | Suite | `main` | This branch |
  |---|---|---|
  | unit | 899 | 904 |
  | database | 248 | 250 |
  | sign-in | 20 | 20 |
  | story | 57 | 57, one run |

Commit chain:

```
e074141 OpenSpec change …: planning artifacts
e9b91e1 Catalogue: household middle name, Form 15080 signatures required when shown (migration 024, not applied)
8e6c9ee Tests: Form 15080 signatures required when shown, client and office; household middle name saved
a229c54 A household member's name reads first, middle, last on the form and the draft 13614-C
41e14dc Story: household middle name; the 15080 sub-step waits for both signatures
c5ea521 Story: read the household middle name after the move that saves it
0c78b0c Docs: migration 024, the counts, required-when-shown 15080 signatures
587b049 Final-review fixes: client-intake spec matches D6 (document cards stay First Last), suite counts, story note, tasks ticked
(retrospective, archive)
```

---

## 1. Wins

- **[evidence: e9b91e1]** The rule has one source.
  - Changing two words in each draft (`Optional` → `Required`) and one field line fixed the bug in both places: the browser's `missingToSubmit` and the database's `intake_missing`/`act_submit`, through `required_to_submit` in generated migration 024.
  - No SQL or rule code was written. The final review confirmed the database functions are untouched.
- **[evidence: 8e6c9ee]** The tests prove agreement, not just behaviour. The parity loop compares the browser's list with `intake_missing` on four new answer sets. The value cases run the same middle-name inputs through both checks, and the office (assisted) path is refused the same way as the client's.
- **[evidence: the Task 2 report]** The mutation check gave RED evidence for tests that passed immediately. Turning `gcf_tp_signature`'s requirement off in the generated catalogue made the new tests fail. The file was then restored.
- **[evidence: ledger "pre-apply review of 024"]** 024 was dry-run before it was applied. It ran inside `begin … rollback` on `vitally-task2` and loaded 114 fields with the expected flags, with no ledger row written. The user approved the apply with that evidence in hand.
- **[evidence: a229c54]** One helper, `memberNameParts`, replaced three copies of the name join (the summary line, the 13614-C row and the comment lines). The form and the draft can't drift apart.
- **[evidence: plan rechecks]** The three planning rechecks caught real errors before apply:
  - "member card" pointed at the wrong UI;
  - the household "dialog" doesn't exist;
  - the middle-name value cases were missing;
  - the shared test stack would run ahead of `main`;
  - Task 5's steps were in the wrong order;
  - `test:auth-browser` was missing for the "all four counts" sentence.

## 2. Misses

- 🟡 **[painful | evidence: 41e14dc → story run 1, 49/53]** Task 4's new check read `hh[0].middle_name` straight after a Tab and `waitForQuiet`, and both browser orders failed. Version-2 drafts save when the client moves to another sub-step (`src/controller.mjs:1664-1668`), not when they leave a box, and `waitForQuiet` only watches the DOM. The plan's code had the wrong wait. It cost one 12-minute story run and fix round `c5ea521`.
- 🟡 **[painful | evidence: ledger, Task 2 Step 6]** The implementer's database commands were denied by the subagent permission check, because the user's apply approval was given to the controller. The controller ran `db:migrate:test` and `test:database` itself, and did the same for the story in Task 4 and the suites in Task 5 (rulings in the ledger). The plan had assumed implementers run the stack suites.
- 🟡 **[painful | evidence: final review, Important 1 → 587b049]** The client-intake delta spec said "where the form shows a member's full name". That was broader than D6, which keeps document cards as "First Last". The spec was written before the document-card decision was made explicit, and three rechecks missed it. Only the final review caught it. It was narrowed before archive.
- 📌 **[nit | evidence: `git log` trailers]** Commits `41e14dc` and `c5ea521` carry `Co-Authored-By: Claude Sonnet 5.5`, and `c24a645`, before its amend, carried Haiku. Subagents follow their own attribution reminder, which names their model, while the Global Constraints require Opus 5.5. `c24a645` was amended to `0c78b0c`. The two story commits were left as they are (a ruling), and the user decides before push.
- 📌 **[nit | evidence: 0c78b0c → 587b049]** The docs pass missed four count spots: `README.md:137` (`001–023`, with an en dash), `docs/developer/database.md:560` (248), `docs/developer/README.md` (stale counts) and the story note in `docs/setup.md`. The task review and the final review caught them.

## 3. Plan deviations

| Plan task | What changed | Why |
|---|---|---|
| 2, Step 6 | The controller applied 024 and ran `test:database`, not the implementer | The subagent's commands were denied. The user's approval was given in the controller's conversation |
| 4, Step 1 | The wait before reading the saved middle name became `jump("notes.anything")` (`c5ea521`) | Drafts save on a sub-step move. `waitForQuiet` doesn't wait for a save |
| 4, Step 3 / 5, Step 1 | The controller ran the story, the database suite and sign-in | Same reason as Task 2, Step 6 (rulings in the ledger) |
| 5, Step 2 | Also fixed `README.md:137` and `docs/developer/database.md:25`, `:560`. The fix wave also updated the stale counts in `docs/developer/README.md` and moved the `frontend.md` sentence to its own bullet | The plan's file list missed them. The reviews flagged them |
| Spec `client-intake`, requirement 1 | Narrowed to the summary line; document cards keep first and last name (`587b049`) | Final review, Important 1: the spec has to match D6 |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓ (raw record in `brainstorm.md`; the design itself was agreed in chat at lifecycle step 2) |
| superpowers:writing-plans | ✓ (`plan.md`) |
| superpowers:using-git-worktrees | ✓ (`.claude/worktrees/require-15080-signatures-and-household-middle-name`) |
| superpowers:subagent-driven-development | ✓ (ledger, pre-flight table, five task loops, final review, one fix wave) |
| (transitive) superpowers:test-driven-development | ✓ (RED then GREEN in Tasks 1 and 3; the mutation check stood in for RED in Task 2) |
| (transitive) superpowers:requesting-code-review | ✓ (5 task reviews, the final Opus review, 2 scoped re-reviews) |
| superpowers:finishing-a-development-branch | ✓ planned (lifecycle step 9, after archive) |

### Deliberately Skipped Skills

None.

## 5. Surprises

- **Drafts save on a move, not on blur.** It was assumed that typing and tabbing out of a box saves a version-2 draft. It doesn't: `changeV2Field` only edits the local draft, and `goToSubstep` saves it.
- **The catalogue's `completeAnswers` signs automatically.** Once the signatures are required, `completeAnswers({ gcf_consent: "yes" })` in the database tests fills `gcf_tp_signature: "Sample"`. The unsigned cases had to be built by removing the key. This was found during planning, and it held.
- **A subagent's permissions aren't the controller's.** The user's chat approval doesn't reach a subagent's permission check. An `echo` of environment variables was refused as "Modify Shared Resources".
- **Attribution differs per subagent.** Each subagent's attribution reminder names its own model, which overrides the plan's trailer rule unless the dispatch repeats it.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Steps that touch the stack belong to the controller, not to implementers** → **Promote to memory** (type: feedback; extend [[worktree-git-commands]] or a new note)
  > **Why**: in this cycle the subagent permission check denied `db:migrate:test` and even an environment `echo` for implementers. The user's approval lives in the controller's conversation.
  > **How to apply**: when writing a plan or a dispatch, give the controller the steps that need the user's approval or the shared stack (migrate, `test:database`, `test:auth-browser`, `test:browser`). Implementers edit, run `npm test` and commit.

- [ ] 🟡 **In the browser story, read saved answers only after a sub-step move** → **Promote to memory** (type: project)
  > **Why**: version-2 drafts save in `goToSubstep` (`src/controller.mjs:1664-1668`). `waitForQuiet` only watches the DOM, which cost one failed story run (`41e14dc`).
  > **How to apply**: any new story check that reads `answer(...)` or the database after typing does a `jump(...)` first, as `tests/browser.mjs:3271` does.

- [ ] 🟡 **Every dispatch repeats the trailer rule** → **Promote to memory** (type: feedback)
  > **Why**: Sonnet and Haiku subagents wrote their own model into `Co-Authored-By`, and the plan's Global Constraints file wasn't enough on its own (`41e14dc`, `c5ea521`, `c24a645`).
  > **How to apply**: an implementer dispatch states "the commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, whatever model you are". The controller checks with `git log --format='%h %(trailers:key=Co-Authored-By,valueonly)'` before each task review.

- [ ] 📌 **Write the spec sentence after the decision it depends on** → **One-off** (recorded only)
  > **Why**: the client-intake sentence predated the explicit document-card decision. It generalizes only as "recheck a spec when a decision is added at review", which the recheck rounds already aim to do.

**Ledger findings, summarized** (the ledger is deleted after this retrospective, per CLAUDE.md §7):
- **Rulings:**
  1. Task 2 is reviewed as one unit after the apply, with a separate pre-apply review of 024.
  2. Model choice per role: Sonnet or Haiku implementers, Sonnet task reviewers, an Opus final review.
  3. The controller runs the story in Task 4, because subagents' stack commands were denied.
  4. The controller runs Task 5's checks.
  5. The Sonnet trailers on `41e14dc` and `c5ea521` are not rewritten, and are surfaced to the user.
  6. The client-intake spec sentence is narrowed to match D6.
  7. The fix wave also takes the cheap docs minors and commits `tasks.md`.
- **Deferred minors, triaged by the final review as needing no fix:**
  - Task 2: the mutation check covered `gcf_tp_signature` only. The spouse signature is pinned by the build test, the unit test, a parity set and a database refusal.
  - Task 3: the draft-form test asserts comment-line prefixes. The sibling test pins the full line.
  - Task 4: the Tab before `jump` at `tests/browser.mjs:3584` is now redundant, and the household check reads only `middle_name`.
- **Not acted on:** the office's Add a case count has no direct test for consent without a signature. It is covered through `missingToSubmit`, and by the database refusal on the office path.
- **Parked findings:** none.
