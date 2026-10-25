# Retrospective: add-hold-and-closing

> Written: 2026-10-23 (after verify passed, with warnings)
> Commit range: `d405c76..HEAD` (proposal → retrospective; archive follows)
> Worktree: `.claude/worktrees/add-post-efiling-stages` (directory name from change 2), branch `add-hold-and-closing`

---

## 0. Evidence

- **Commit range**: `d405c76..91f1bf8`, 21 commits before verify. Code is final at `bf9a490`.
- **Diff size**: +5647 / -189 lines across 62 files (against `origin/main`). The largest are `supabase/migrations/036_hold_and_closing.sql` and `tests/database-hold.mjs`.
- **Tasks done**: 28 / 28.
- **Active hours**: about 12 h wall clock (estimate), across 2026-10-22 and 2026-10-23. About 1.5 h of that was browser-story runs (each 17–24 minutes; Task 9 alone took about an hour).
- **Subagent dispatches**: 27.
  - 10 implementers (Tasks 1–10; Task 11's checks were run by the controller);
  - 10 task reviews (Opus for Tasks 1, 4 and 7; Sonnet for the rest);
  - 2 fix rounds that resumed the original implementer (Tasks 6 and 7), each with a scoped re-review;
  - 1 final whole-branch review on Opus;
  - 1 final fix wave and 1 re-review of it.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none yet (not merged).
- **OpenSpec validate state at archive**: pass (9 / 9 at verify).
- **Test coverage signal**:
  - unit 1317 (baseline 1279);
  - database 407 (baseline 374);
  - browser story 75 (baseline 65).

Commit chain:

```
d405c76 Propose add-hold-and-closing
ee679aa gate before apply checked
6a8b98d 036's stages, origins and documents at intake
2af879c put on hold and got in touch
edf7201 close with a reason
3d0028a the client withdraws
f689b29 the on_hold and withdrawn samples
aa63424 contracts, names, builders and store
44d8908 the withdraw refusal and the staff sentences        (T6 fix round)
0614cc8 staff screens and lists
d0c3414 the withdrawal notice names the reviewer at review    (T7 fix round)
c1c7f5a what the client reads and the withdraw button
a30023e the story asks for documents and withdraws
871265e diagram and docs
842e7ad /opsx:update: withdrawn close before filing; contact line; not-found scenario
bf9a490 final review: withdrawn close before filing, notice text, contact line, close dialog, tests and docs
91f1bf8 all tasks checked
(+ tasks.md checkbox commits 5362b9c, e496180, 4dd718f, 579d157)
```

---

## 1. Wins

- **The pre-flight scan's three rulings held** (the translations moved forward, the prefix moved into Task 1, Task 6 updating close tests). The unit suite stayed green after every task, unlike change 2, where a client line broke it mid-way.
- **The database work came through review with no Important findings** (Tasks 1–5). The final Opus review confirmed the origin constraints, the faithful copies, the privacy boundary, the ordering of the second client line, and concurrency.
- **Naming every requested title in one history line** reused the existing prefix translation (`historyLine`) rather than inventing a new mechanism (`6a8b98d`).
- **The final review caught a real contradiction in the spec** (the contact line promised a close that Close refused). It went to the user as a decision rather than being fixed silently, and was settled through `/opsx:update` (`842e7ad`).

## 2. Misses

- 🟡 [painful | evidence: `842e7ad`, `bf9a490`] **The spec contradicted itself on withdrawal after review.** "An admin MAY close with reason `withdrawn`" from Ready to exit on, while Close was refused at exactly those stages. It survived propose, the plan and eight task reviews, and only the final review found it.
- 🟡 [painful | evidence: `44d8908`] **A client action's refusal was written as staff-English text,** the Withdraw refusal. It took a fix round. Client actions refuse only with translated fixed sentences, and the plan didn't say so.
- 🟡 [painful | evidence: `d0c3414`] **The plan didn't say how the withdrawal notice knows whom to name.** The first implementation named the preparer at Review in progress.
- 📌 [nit | evidence: ledger Tasks 1, 7, final wave] **Several tasks had no clean RED run.** Reviewers judged each by reading that the tests would fail on the base.
- 📌 [nit | evidence: ledger Task 9] **Two story runs failed in phases the change didn't touch** (a reset wait and a two-window race). The final runs passed.

## 3. Plan deviations

| Plan task | What changed | Why |
|---|---|---|
| T1 | the documents-line prefix handling, and the 简体 for new SQL lines, done here | pre-flight rulings: keep `npm test` green |
| T1 | the automatic return's client line is a second `client_events` row inside `act_verify_document` | a handler returns one message |
| T2 | an admin `RECORD_DOCUMENT_RESPONSE` test added | a gap left by T1 |
| T4 | another client's Withdraw gives NOT_FOUND; `close_case_steps` is shared | `lock_case` hides the case; the duplication was removed |
| T5 | the `withdrawn` sample steps through Request sent | the 010 trigger numbers a case only when it leaves Draft for a stage other than Closed |
| T6 | `poolPhase` and `EVENT_SENTENCES` done here (not in T7) | existing tests required them |
| T7 | the Withdrawn row prefers the reviewer's name; a staff-only `openWithdrawalNotices` summary | spec; a list row needs the notice |
| Final | an admin's withdrawn close at Ready to exit and Ready to e-file, with a TaxSlayer notice; the contact line limited; a title-less row refused; tests and docs | the user's decision on the final review; review items |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓ (method in the conversation; invoked at propose) |
| superpowers:writing-plans | ✓ |
| superpowers:using-git-worktrees | ✓ (the session was already in a linked worktree; reused, per step 0) |
| superpowers:subagent-driven-development | ✓ (ledger, pre-flight table, a review per task, 2 fix rounds, final Opus review, one fix wave) |
| (transitive) superpowers:test-driven-development | ✓, mostly (see §2) |
| (transitive) superpowers:requesting-code-review | ✓ |
| superpowers:finishing-a-development-branch | pending: step 9, after archive |

### Deliberately Skipped Skills

(none skipped) The skill's `scripts/*` helpers were again replaced by plain commands under the worktree guard, as in change 2.

## 5. Surprises

- **The worktree directory is named after the previous change** (`add-post-efiling-stages`) while it holds `add-hold-and-closing`, because the branch was created inside it. It's harmless, but confusing in paths.
- **Withdraw needs a person to assign its notice to,** but a client has no person. The notice's creator is therefore the workspace's follow-up person, and with none configured the withdrawal would fail. That can't happen today, but it matters for #90's roster work.
- **Pending review never has a reviewer,** so the first draft of the stop-work rule had a stage in it that can't arise.

### Ledger summary (rulings, parked findings, deferred minors)

**Rulings.** All stand; the user confirmed them on 2026-10-23.
1. The database tasks add their own 简体 for every new client line, so the unit suite stays green.
2. The documents-line prefix handling moved into Task 1.
3. Task 6 updates the unit tests its new Close payload breaks.
4. Another client's Withdraw is refused as not found, not forbidden (the spec was amended).
5. The TaxSlayer notice also opens for an admin's withdrawn close from a Hold that came from Ready to exit.

**Parked findings:** none. No fix loop reached its cap.

**Fixed later:**
- the `RECORD_DOCUMENT_RESPONSE` test (Task 2);
- the contact line at E-filed, Rejected and Accepted, and its duplicated stage list (final wave, with the user's decision);
- the title-less document row;
- the withdraw tests at Corrections in progress and at Screening;
- the `database.md` notice wording.

**Deferred minors, still open (triaged "can wait" by the final reviewer):**
- **Task 1:**
  - the language-sweep doesn't check seeded `DOCUMENTS_PREFIX` lines, and its comment names only `REQUEST_PREFIX`;
  - the automatic return has no `case_events` row of its own.
- **Task 3:** a reworded comment without a `-- 036` marker.
- **Task 4:**
  - Withdraw (and now a withdrawn close) raises VALIDATION if a workspace has no follow-up person;
  - the notice's creator is its assignee, with no comment saying why;
  - a redundant preparer/reviewer guard;
  - the purpose-constraint line lacks a marker.
- **Task 5:**
  - provenance markers stripped from the copied fixture functions (the SQL is identical);
  - nothing asserts the `on_hold` sample lacks the screening checks.
- **Task 7:**
  - doubled field ids;
  - "required for Other" not enforced in the browser;
  - the Withdrawn drawer doesn't name the volunteer.
- **Task 9:**
  - the reset wait (20 s);
  - a three-way OR wait;
  - weak negative checks;
  - an `Alex.*` regex.
- **Task 10:**
  - `docs/setup.md`'s `sampleCaseOwners` keys don't match `tools/admin/roster.mjs` (pre-existing; a separate direct PR);
  - the SVG fit was checked by coordinates.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **A client action's refusal must be a translated fixed sentence; say so in the plan for every client action.** → **Promote to memory** (type: feedback)
  > **Why**: the Withdraw refusal shipped staff-English and needed a fix round (`44d8908`).
  > **How to apply**: when a plan adds a client-side builder or action, name its refusal strings and their 简体.
- [ ] 🟡 **When a spec permits a move "from stage X on", check it against the stage table's allowed moves at propose time.** → **Promote to memory** (type: feedback)
  > **Why**: the "admin MAY close with withdrawn" sentence contradicted the close rule, and only the final review caught it.
  > **How to apply**: after writing the delta specs, cross-read every MAY and SHALL against the move table.
- [ ] 📌 **Every follow-up a client's action opens needs a person behind it; flag it for #90.** → **One-off** (noted in the PR)
  > **Why**: `created_by_person_id` is NOT NULL, and a client has no person.
- [ ] 📌 **Create the next change's worktree with its own name** rather than branching inside the previous change's worktree. → **Promote to memory** (type: feedback)
  > **Why**: the paths read `add-post-efiling-stages` for change 3.
