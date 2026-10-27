# Retrospective: add-staff-identity

> Written: 2026-10-26 (after verify passed with warnings)
> Commit range: `2bbbdff..2f6ed24`
> Worktree: `.claude/worktrees/add-staff-identity`

---

## 0. Evidence

- **Commit range**: `2bbbdff..2f6ed24`, 35 commits:
  - 12 task commits and 6 fix-round commits;
  - 2 docs commits (aa7339d, 5832301);
  - 4 final-review fix commits (57c7be6..0b6cb2b);
  - 10 tasks.md check-offs;
  - verify (2f6ed24).

  Before it:
  - the planning artifacts (2e226e0, 2026-10-18, then on hold);
  - the merge of `origin/main` (86a7358);
  - the planning update for the lifecycle chain (2bbbdff).
- **Diff size**:
  - Implementation (`2bbbdff..HEAD`, excluding the change folder): +3406 / −111 lines across 32 files in `src/`, `tools/`, `supabase/` and `tests/`.
  - With the docs and the change folder: +3779 / −216 across 41 files.
- **Tasks done**: 28/28.
- **Active hours**: about 26 hours of wall-clock time (2026-10-25 18:52 to 2026-10-26 20:49), including two laptop-sleep gaps.
  - About a third of the agent time went to the Playwright story (around 8 full or half runs).
  - Two implementer sessions stalled on the stream watchdog.
- **Subagent dispatches**: 31 fresh dispatches plus 7 resumes.
  - 12 implementers: one per task, plus a fresh one for Task 8's fix after two stalls.
  - 11 task reviewers.
  - 6 scoped re-reviewers.
  - 1 final whole-branch reviewer (opus).
  - 1 final fix wave.
  - The 7 resumes were fix rounds, the docs catch-up, and Task 8's stall recovery.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none so far (not merged yet).
- **OpenSpec validate state at archive**: pass. `openspec validate --all` gave 9/9 (verify.md §1).
- **Test coverage signal**:

  | Suite | Now | Baseline (main 96f1a1d) |
  |---|---|---|
  | Unit | 1370 | 1336 |
  | Database | 451 | 421 |
  | Sign-in browser | 20 | 20 |
  | Browser story | 79 | 77 |

  The new `tests/database-staff-identity.mjs` covers every database-level scenario of both delta specs (final review). 038 applies to an empty stack (001–038 from scratch) and re-applies over itself twice.

Commit chain:

```
2bbbdff OpenSpec change add-staff-identity: update for the lifecycle chain
4916fe3 Staff identity: database tests first (1.1-1.4)       0bd6475 fix round
62c1f5c 038 part 1: staff access and people.user_id (2.1-2.2)
4a3a9a5 038 part 2: acting_person at every entry point (2.3)
92aa20b 038 part 3: locks, authority and policies (2.4)
816eb03 038 part 4: add_staff_member, set_default_followup (2.5-2.7)   6c3ef3d suite GREEN
06911f5 Roster: staff list, optional presenters, defaultFollowup (3.1-3.4)
d108d50 Store: staff principal, staff tables, no person claimed (4.1)
7495717 Controller: staff windows act as their own person (4.2)       bc32e88 fix round
f3c156c Screens: staff shell without demo tools (4.3-4.4)             380aa90 fix round
04e3806 Story: two staff accounts work one case (5.1-5.3)             72c0d51, e43339d fix rounds
aa7339d Docs: staff accounts (6.1-6.4)                                5832301 catch-up
57c7be6 ddfd4a8 78708c8 0b6cb2b  final-review fixes
2f6ed24 add-staff-identity: verify
(then: retrospective, merge main, archive)
```

---

## 1. Wins

- **[evidence: 4a3a9a5, Task 3 review] The security core was right first time.**
  - `acting_person` and the six entry points were copied from their newest definitions with only the intended lines changed. The Task 3 reviewer diffed all six against their sources independently.
  - The final review found no path by which a staff account acts or sees as anyone else.
- **[evidence: ledger preflight table] The preflight scan caught four plan conflicts before Task 1.**
  - The migrator refuses a changed applied file (R1).
  - The visibility test imported a list the store doesn't export (R2).
  - The plan reused one person key with different capabilities (R3).
  - The plan's markup contradicted the spec's "Signed in as Riley Park" (R4).
  - All four were ruled before any dispatch, and none became a fix round.
- **[evidence: 816eb03, 6c3ef3d] Tests first held across a long gap.**
  - The suite written in Task 1 stayed red until Task 5, then went green with one test-assumption fix and no code fixes to parts 1–3.
- **[evidence: final review → 57c7be6] The final review found the one cross-task defect the task reviews couldn't see.**
  - The presenter picker offered staff-linked people.
  - Nothing showed it until the example roster mixed presenters and staff.
- **[evidence: verify.md §5] The fresh-stack apply closed R5's residual risk before merge.**
  - CI doesn't apply migrations, so this was the only fresh 001→038 apply before a teammate's.
- **[evidence: T11-a, aa7339d] Writing the docs in parallel with Task 10 saved about 15 minutes.**
  - It was user-approved, and the docs agent ran no git, so there was no index collision.

## 2. Misses

- 🟡 **[painful | evidence: ledger Task 12, the "how much longer" exchange] The browser story ran about 8 times. About three of those runs were avoidable.**
  - Two were spoiled by the laptop sleeping.
  - One flake ("Morgan reviews") cost a re-run.
  - The controller ran Task 12's full story before the final whole-branch review. The review then produced fixes, so the story had to run again (about 25 minutes).
- 🟡 **[painful | evidence: T8 stalls] Two implementer sessions stalled on the stream watchdog.**
  - Each stall needed a resume or a fresh dispatch. One left a partial uncommitted edit the next agent had to judge.
- 🟡 **[painful | evidence: T10-b, T10-d] Task 9 missed two staff-facing "acting as" strings.**
  - They were the case header and the case intro.
  - Task 9's review checked only the sidebar row the plan named, and the strings surfaced in Task 10's story.
  - The spec said "wherever 'Acting as' appears". A grep for the phrase in Task 9 would have caught both.
- 🟡 **[painful | evidence: T3-a, T4-a] Tasks 3–4 could only be proven with throwaway scripts.**
  - The committed suite couldn't run until Task 5 added `add_staff_member`.
  - The plan ordered staff creation last, so two security-relevant tasks went through review on gitignored evidence.
- 📌 **[nit | evidence: ledger "Fresh stack"] The controller started the fresh stack from a Git Bash path read by PowerShell.**
  - That made a stray `C:\c\vitally-stacks\…` folder and a stack on default ports.
  - It was caught by the port mismatch and redone correctly. The stray folder is left for the user to delete.
- 📌 **[nit | evidence: Task 8 implementer report] An orphaned `test:auth-browser` run hung for 13 hours after a laptop sleep.**
  - Nothing noticed it until the controller checked processes.

## 3. Plan deviations

| Plan task | What changed | Why |
|---|---|---|
| 1 | added a staff-only workspace test and a foreign-workspace check (in Task 5) | Task 1 review; T4-c (the spec's "nothing in another workspace") |
| 2 | people→memberships foreign key made deferrable | D2's "either order" needs it (T2-a) |
| 3 | an applicant naming a person passes through to the existing checks | the spec's "clients' behaviour SHALL NOT change" outranks D3's row (T3-b) |
| 3, 4 | verified with focused scripts, not the committed suite | the suite needed Task 5 (T3-a, T4-a) |
| 4 | one existing assertion now expects the widened policy text | it pins the policy text the change alters (T4-b) |
| 6 | roster refuses an empty capabilities list; de-duplicates capabilities | T5-a, T6-a |
| 7 | store also refuses reset and checkpoint before calling the database | T7-a |
| 9 | "Signed in as <name>" wording; add-case "Fill fictional details" presenter-only | R4; T9-a |
| 10 | Riley has prepare and review; case header and intro reworded for staff | T10-a; T10-b, T10-d |
| 11 | written in parallel with Task 10, then caught up | user-approved (T11-a) |
| 12 | full story assembled from per-permutation runs, then one clean full run after the final fixes | laptop sleep and a flake |
| — (final review) | presenter picker hides and refuses staff-linked people; contact-log edit test; 038 header reworded | D4's premise no longer held (F-a); F-b |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓ (2026-10-18, through propose) |
| superpowers:writing-plans | ✓ (plan.md, revised with `/opsx:update` on 10-25) |
| superpowers:using-git-worktrees | ✓ (`.claude/worktrees/add-staff-identity` on the existing branch) |
| superpowers:subagent-driven-development | ✓ |
| (transitive) superpowers:test-driven-development | ✓ (RED evidence in every implementer report) |
| (transitive) superpowers:requesting-code-review | ✓ (11 task reviews, 6 re-reviews, final opus review) |
| superpowers:finishing-a-development-branch | pending: CLAUDE.md step 9, after archive |

### Deliberately Skipped Skills

None skipped. Two deliberate departures from subagent-driven development's defaults, both recorded as rulings:
- **Tasks 10 and 11 ran in parallel.** The user approved it (T11-a), and the docs agent ran no git.
- **The controller ran Task 12 itself.** The task was checks only, with no code to write.

## 5. Surprises

- **The migrator refuses an edited applied file** (`MIGRATION_CHANGED`). A migration built in four parts needs the documented "forget its row and re-apply" recovery between parts (R1).
- **The test stack stored CRLF digests for 001–009.** Migrating from an LF worktree hit `MIGRATION_CHANGED` on unchanged files (T2-b), which is now documented in setup.md.
- **Node 24 runs every subtest of a selected test.** A single story phase can't be picked out with `--test-name-pattern`, so fix rounds ran whole engine orders.
- **D4's premise ("no workspace mixes presenters and staff yet") was broken by this change's own example roster.** Only the final whole-branch review saw it (F-a).
- **Laptop sleep spoils long suites silently.** Tests "fail" after running for about an hour, and a suspended run can outlive its session as an orphan.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Run the final whole-branch review before the last full browser run, not after.** → **Promote to memory** (type: feedback)
  > **Why**: in this change the final review produced fixes after Task 12's full story, which forced another ~25-minute run (§2).
  > **How to apply**: when SDD reaches its final-checks task, dispatch the final review first, then run the long suites once on the fixed code.
- [ ] 🟡 **Keep the laptop awake for long suites, and check for orphaned test processes after any sleep.** → **Promote to memory** (type: project, local test stack)
  > **Why**: two spoiled story runs, a 446/450 database run that was really 450, and a 13-hour orphaned sign-in run (§2, §5).
  > **How to apply**: before `test:browser` or `test:database`, ask the user to keep the machine awake. If a test ran for many times its usual length, re-run it before judging it.
- [ ] 🟡 **When a spec says "wherever X appears", grep for X in the task that changes it.** → **Promote to memory** (type: feedback)
  > **Why**: the two "acting as" strings Task 9 missed surfaced only in Task 10's story (T10-b, T10-d).
  > **How to apply**: when a requirement is phrased over every occurrence of a string, put the grep in the implementer's dispatch and the reviewer's named risks.
- [ ] 📌 **Order a plan so its first test suite can run as soon as the tasks it tests exist.** → **One-off for this change; consider for writing-plans**
  > **Why**: staff creation came last, so Tasks 3–4 were reviewed on throwaway scripts (T3-a, T4-a).
  > **How to apply**: when a test fixture depends on a function, plan that function first, or give the fixture a direct-SQL fallback.
- [ ] 📌 **In PowerShell, never read `C:\vitally-stacks\CURRENT` as-is: it holds a Git Bash path.** → **Promote to memory** (local test stack)
  > **Why**: `/c/vitally-stacks/…` resolved to `C:\c\…` and started a stack on default ports (§2).
  > **How to apply**: use `C:/vitally-stacks/<id>` in PowerShell, or run the stack commands from Git Bash.
- [ ] 📌 **The browser story has flaky presenter phases: Follow-ups, Morgan reviews, contact log, two-window draft.** → **One-off: open an issue**
  > **Why**: each flake costs a 10–20 minute re-run. None is in this change's code.
  > **How to apply**: fix them as a separate direct PR (test-only), not inside a feature change.

---

## Ledger summary (rulings, parked findings, deferred minors)

No finding reached the fix-loop cap, so nothing was parked. The final review overturned no ruling.

**Rulings** (decision, then the cost if wrong):

- **Preflight:**
  - **R1:** 038 can be re-applied, and its row was forgotten on the test stack between parts. *Cost: recreate the test database.*
  - **R2:** the visibility test uses `SUBSCRIBED_TABLES.presenter` plus the filing tables. *Cost: one import.*
  - **R3:** each test has its own person keys. *Cost: none.*
  - **R4:** "Signed in as <name>", following the spec over the plan's markup. *Cost: one label.*
  - **R5:** 038 checked for re-apply twice. *Cost: closed by the fresh-stack apply.*
  - **R6:** no stack use during the baseline browser run. *Cost: none.*
- **Task 1:**
  - **T1-a:** the roster enforces "no presenter means `defaultFollowup` is required"; the database tests only the staff-only workspace. *Cost: there is no database-level refusal.*
  - **T1-b:** the Realtime test watches an update. *Cost: an insert-only policy gap would go unseen.*
- **Task 2:**
  - **T2-a:** a deferrable foreign key. *Cost: none.*
  - **T2-b:** the CRLF digests for 001–009 were rehashed on the test stack. *Cost: moot, because the fresh stack recorded LF digests; a CRLF checkout migrating against it would hit `MIGRATION_CHANGED`.*
- **Tasks 3–4:**
  - **T3-a, T4-a:** focused-script verification until Task 5. *Cost: bugs surface later (none did).*
  - **T3-b:** an applicant naming a person passes through to the existing checks. *Cost: low; the test confirms FORBIDDEN.*
  - **T3-c:** a presenter naming a staff or unknown person gets FORBIDDEN earlier than before. *Cost: different error wording.*
  - **T4-b:** one pinned policy-text assertion updated. *Cost: none.*
  - **T4-c:** the foreign-workspace check was added in Task 5. *Cost: none.*
- **Tasks 5–7:**
  - **T5-a:** the roster refuses empty capabilities. *Cost: easy to relax.*
  - **T5-b:** capabilities compared as a set. *Cost: none.*
  - **T6-a:** the roster de-duplicates capabilities. *Cost: a typo passes silently.*
  - **T7-a:** the store refuses reset and checkpoint for non-presenters. *Cost: none.*
- **Tasks 9–11:**
  - **T9-a:** the add-case "Fill fictional details" button is presenter-only. *Cost: one button.*
  - **T10-a:** Riley has prepare and review in the story. *Cost: none.*
  - **T10-b, T10-d:** the staff case header and intro no longer say "acting as". *Cost: two strings.*
  - **T10-c:** fix rounds verified with unit tests and the affected phases. *Cost: none in the end.*
  - **T11-a:** docs written in parallel, then caught up (user-approved). *Cost: none.*
- **Final review:**
  - **F-a:** the presenter picker hides and refuses staff-linked people. *Cost: none; the spec forbids picking them.*
  - **F-b:** 038's header reworded before it reaches main, plus two doc fixes. *Cost: none.*
  - **F-c:** asked the user before the fresh-stack apply (they approved it). *Cost: none.*

**Deferred minors.** The final review marked all of them fine to leave, except the contact-log edit test, which is now fixed in ddfd4a8. Worth a follow-up:
- **Tests:**
  - **Untested `add_staff_member` and `initialize_workspace` branches:**
    - the reserved keys alex and morgan;
    - the key pattern and name-length cases;
    - the two `initialize_workspace` re-run refusals 038 added;
    - Sam as the initial default in a staff-only workspace;
    - a positive control for Review Focus 5.
  - **Fixture and test hygiene:**
    - begin/commit on the shared connection;
    - `let frankie` shared across subtests;
    - dana added to shared fixtures;
    - a vacuous `notEqual`;
    - a cryptic fixture comment;
    - the `rpcCalls.length` coupling;
    - a brittle account-row regex;
    - Review Focus 3 tested at view level only.
  - **Browser story:** the `within` guard is a one-off construct, and the `caseActionCount` read after `waitForText` could in principle race a re-render.
- **Database (038):**
  - No delete check for a staff-linked person (it fails closed).
  - A redundant assignment in the link trigger, and the trigger fires on every update.
  - `acting_person`'s unreachable else branch.
  - `set_default_followup` doesn't check an active membership or a test workspace.
  - Concurrent roster runs fail with 40001/23505 instead of VT007.
  - "None granted" relies on `create or replace` keeping ACLs.
- **Browser code:**
  - One uncached `memberships` read before every RPC; memoise it.
  - Comment wording: the SAVE_ANSWERS comment and the store comment wrap.
  - A staff `selectPerson` goes through `refuse()`.
  - An applicant's `selectPerson` still writes state (unchanged).
  - The `delete` in window state, and a local still named `presenter` in views.mjs.
  - A cleared linked persona is persisted only on the next save, and a persona claimed after load isn't re-checked until the next load (the server refuses either way).
- **Roster:**
  - No test for `["prepare","prepare"]`.
  - A dead `required` option, and the message "staff[0][0] is not an email address".
  - A whitespace-only name isn't trimmed.
  - The list-building is duplicated, and the summary line is untested.
- **Docs:**
  - The `personKey` rule is stated incompletely (it must start with a letter and be at most 40 characters).
  - The ER diagram still says "Alex, Morgan, Sam".
  - The window-state sentence in frontend.md.
  - Stale suite counts in setup.md: these predate the branch.
- **Pre-existing, to check on main:**
  - The work board's action column is clipped at 1280 px.
  - The flaky story phases (§6).
