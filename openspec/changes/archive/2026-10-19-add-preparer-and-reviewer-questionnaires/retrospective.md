# Retrospective: add-preparer-and-reviewer-questionnaires

> Written: 2026-10-19 (after verify passed with warnings)
> Commit range: `71e84d1..a15152a` (merge base with main to the last verify update; the retrospective and archive
> commits follow)
> Worktree: `.claude/worktrees/add-preparer-and-reviewer-questionnaires` (on D:, outside OneDrive)
>
> **Update 2026-10-20:** the D11 trade-off ("the variant is fixed at approval") in §1/§5 was superseded by Jinyu's
> review on PR #92. After a "No" approval, the client was still told the return would be gone over once the office had
> done it. Resolving the go-over task now switches the client's message to the signing variant (033
> `act_resolve_followup`). See verify.md, "Review round: Jinyu's CHANGES_REQUESTED on PR #92". Lesson for §6: a
> client-facing message tied to a task must say what happens when the task ends, and the spec should have a scenario
> for it.

---

## 0. Evidence

- **Commit range**: `71e84d1..a15152a`. There are 25 non-merge commits: 3 propose, 4 update/gate, 16 apply,
  verify and docs, 2 post-localhost.
- **Diff size**: +5884 / −171 lines across 49 files, counted from the merge base and including the change folder.
  Apply alone (`4472ecd..a15152a`) is +3983 / −254 across 43 files.
- **Tasks done**: 32/32 (`grep -cE '^\s*- \[x\]' tasks.md` → 32).
- **Active hours**: about 7.5. Planning took about 1 hour (2026-10-17 21:50–22:05 and 2026-10-19 09:00–10:25).
  Apply, final review and verify took about 4.5 hours (10:23–14:45). The localhost round of fixes took about 1 hour.
- **Subagent dispatches**: 27 in all.
  - 10 implementers (Tasks 2, 3, 4, 4a, 5, 6, 7, 8, 8a, 9).
  - 1 resumed fix round (Task 7).
  - 10 task reviewers and 1 scoped re-review.
  - The final review, its fix wave and its re-review.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none yet (not merged).
- **OpenSpec validate state at archive**: 7/7 valid before archive. It is re-run in step 8.
- **Test coverage signal**:
  - unit 1160 → 1223 (+63);
  - database 282 → 320 (+38);
  - browser story 63/63, run twice from the D: worktree (920 s and 915 s);
  - `build:hant -- --check` ok.

Commit chain (in time order):

```
51f1c40 Propose add-preparer-and-reviewer-questionnaires (OpenSpec change, not applied)
7112054 Questionnaires proposal: tracked as part of #85
fb21acf Questionnaires proposal: approval settles the contact step; Exit Form never stores bank numbers (revises R28)
f17177e Questionnaires: update the plan for #91 and #88
0f6b30f Questionnaires: Hailey's ruling on Q1; D12 checked
668d929 Questionnaires: wording review of two Ready to exit variants
4472ecd Questionnaires: main merged (already up to date); migration stays 033
f36f7f0 Questionnaires: staff-only tables, the follow-up purpose and the signing plan
9abe762 Questionnaires: the staff channel watches the two new tables
1ec2d89 Questionnaires: the database checks each payload
1016fa7 Questionnaires: tick Task 3 plan steps
45b2d45 Questionnaires: hand-offs store answers; no go-over opens an office task
280cf7e Questionnaires: Mark ready to e-file waits for the office's go-over
16fd6da Questionnaires: samples carry fictional answers
92fd78b Questionnaires: payload builders, shared vocabulary and the contact-log prefill
c25b90c Questionnaires: inline forms, comparison and answers on the case page
a058b40 Questionnaires: rename Exit Form group class, extract the reopen decision
037fb2f Questionnaires: go-over follow-ups in the office views; a task's contact starts with its purpose
2c36ef3 Questionnaires: the client's Ready to exit message says how and when to sign
cb60bf5 Questionnaires: the story fills both questionnaires
294b513 Questionnaires: fix the seeded Exit Form shape, add Clear for Exit Form groups, update docs
7648054 Docs: the developer guide's test counts are 1221 and 320
10e4cbe add-preparer-and-reviewer-questionnaires: verify
d1a9e08 Questionnaires: went-over dates read MM/DD/YYYY; Changed on the ready date is pinned; Clear this section is in the spec
a15152a add-preparer-and-reviewer-questionnaires: verify updated after the localhost check
```

---

## 1. Wins

- **The functions copied from earlier migrations stayed faithful.**
  - Six functions are redefined from their newest definition with `-- 033` markers. Design D12 names each source,
    and it was checked against every migration twice (0f6b30f, then again at apply).
  - Every task reviewer and the final reviewer diffed the 033 copies against 006, 021, 031 and 032. They found only
    the marked lines.
  - `check_payload` kept 032's `MARK_READY_TO_EFILE` branch intact, with a test proving it (1ec2d89).
- **Mark ready to e-file waits for the office's go-over (D13).** Settling Q1 before apply gave a clean, testable
  rule.
  - `tests/database-stages.mjs` covers the four cases: refused while open, allowed after `reached`, allowed after
    `no_further_contact`, and a Yes approval not held up (280cf7e).
  - The browser story covers the same wait end to end (cb60bf5).
- **The browser story ran in a D: worktree.** It passed 63/63 twice. That settles the old "run it from the main
  checkout: a worktree under OneDrive fails it" note, which `docs/setup.md` no longer says (294b513).
- **Validation is null-safe.** The checkers return false and never raise. `payload_minute` refuses `24:00`. The
  D3 key allowlist refuses banking keys. The builders and the database apply the same rules (1ec2d89, 92fd78b).
- **The task reviews caught two real defects before the final review** (Task 7):
  - the unscoped `.q-group` CSS was restyling a client intake fieldset;
  - a test was guarding a branch the app never uses.

  Both were fixed in one round (a058b40).
- **Task 9 found a real UX bug.** `safetyNet` had been showing "Something went wrong." for the builders' own
  sentences. One line fixed it, and the reviewer checked that no database text can leak through it (cb60bf5).

## 2. Misses

- 🔴 [blocking | evidence: 16fd6da, 294b513, ledger "Task 5 ⚠️"] **The seeded Ready to exit sample stored
  `exit_form.local` as an object.** Its case page threw.
  - The task reviewer flagged "Exit Form vs D3" as something it could not verify. I checked it by reading the brief,
    not the SQL, and recorded it as resolved. The fixture test pinned the wrong shape too.
  - The final review caught it. 294b513 fixed the seed, added a table check (`check_exit_form`) and a test that
    renders the seeded shape.
- 🟡 [painful | evidence: 45b2d45, ledger Task 4] **One database run hung for about 42 minutes** on Realtime after
  the host clock jumped. It passed on a re-run. It cost wall-clock time, and the session gave no signal while it
  hung.
- 🟡 [painful | evidence: ledger Task 6, Task 7] **TDD was not followed strictly.** Task 6 wrote
  `tests/questionnaires.test.mjs` after the module, and Task 7's view tests were not seen failing on their own. The
  reviews judged the tests specific enough, but the latest-entry prefill test lists the newest entry first, so a
  first-wins bug would pass.
- 🟡 [painful | evidence: 294b513] **The docs were left out of the plan.** The demo script, the developer database
  guide and the setup guide were false until the final review. The demo script would have walked a presenter into
  a refused step.
- 🟡 [painful | evidence: 294b513, verify §4] **An Exit Form radio could not be cleared.** One stray click made an
  optional group block approval. A "Clear this section" button was added after the final review and then written
  into the spec (d1a9e08).
- 📌 [nit | evidence: ledger Tasks 3, 8a] **Two implementers did not write their report files.** The controller
  wrote the reports from their messages.
- 📌 [nit | evidence: ledger Task 8a] **Three working-copy files were CRLF** after one implementer's edits. The
  index was LF; I checked them out again.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 2 | Also added both tables to `STAFF_TABLES` (planned for Task 7) | The database suite requires the staff channel to match the realtime publication (Ruling 5) |
| Task 4a | Also added `purpose` to `mapFollowup` (planned for Task 7) | 4a's full-case eligibility check needs it in the running app (Ruling 1) |
| Task 7 | Exit Form group class is `q-exit-group`, not `.q-group`; reopen logic is the helper `groupsToOpen` | `q-group` was already the intake's class; the planned test guarded a branch the app never used (Task 7 rulings) |
| Task 8 | `openFollowupFor` also ignores a null `requestId` | Review Focus 5: a go-over task can never be read as a document's task |
| Task 9 | One line in `src/app.mjs` (`safetyNet`); the Yes case is not pressed through Mark ready to e-file | Builder sentences were hidden; pressing it would disturb later story phases (Task 9 rulings) |
| (none) | Docs updated: `docs/demo-script.md`, `docs/developer/database.md`, `docs/developer/README.md`, `docs/setup.md` | They described the old behaviour (final-review ruling) |
| (none) | "Clear this section" per Exit Form group, plus a table check on `exit_form` | Final review I3 and C1 (final-review rulings) |
| (none) | Went-over dates as MM/DD/YYYY; tests pinning "Changed" on the ready date | Hailey's localhost check (d1a9e08) |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓ (in the 2026-10-17 conversation; the propose step wrote brainstorm.md) |
| superpowers:writing-plans                        | ✓ (plan.md at propose; revised by `/opsx:update`) |
| superpowers:using-git-worktrees                  | ✓ (it found the existing worktree on D:) |
| superpowers:subagent-driven-development          | ✓ (ledger, briefs, per-task reviews, one fix round, final review and fix wave) |
| (transitive) superpowers:test-driven-development | ✓, with gaps (Tasks 6 and 7; see §2) |
| (transitive) superpowers:requesting-code-review  | ✓ (10 task reviews and the final review on the most capable model) |
| superpowers:finishing-a-development-branch       | ✓ (step 9 of this cycle, after archive) |

### Deliberately Skipped Skills

None skipped.

## 5. Surprises

- **The plan's class name collided with the client intake.** The plan named the Exit Form groups `.q-group`
  without checking whether the name was already used. `src/intake-form.mjs:547` already used it for the household
  fieldset.
- **D10 meets #91's gate on No as well as Yes.** Completing the contact step on a "No" approval also met #91's
  "reviewer's call completed" gate, so the No path needed its own rule. That became Q1 and then D13.
- **"Ready for review on" was already correct.** Hailey's localhost check asked for it to show Changed only when
  the date differs. That was already the behaviour: resubmitting resets the date to today, so it usually differs.
  d1a9e08 pins it with tests instead of changing code.
- **The worktree had no stack configuration.** It had no `.env.test`, and the main checkout's `.env.test` still
  pointed at the manifest in the old OneDrive checkout. The worktree got its own git-ignored copies.

## 6. Promote candidates → long-term learning

- [ ] 🔴 **A "Cannot verify from diff" item is resolved only by reading the artifact itself (SQL, file), never by
  reading the brief.** → **Promote to memory** (type: feedback)
  > **Why**: I marked Task 5's Exit Form shape as verified by reading the brief's intended JSON. The migration
  > seeded an object, and the final review found the Critical.
  > **How to apply**: whenever a task reviewer reports ⚠️ and the controller resolves it, open the changed file at
  > the named line (or query the database) before writing "resolved" in the ledger.

- [ ] 🟡 **A change that alters what staff do should list the docs it makes false as a task.** →
  **Promote to project CLAUDE.md** (§2 step 3, propose: tasks.md)
  > **Why**: docs/demo-script.md and docs/developer/database.md went stale. They were found only at the final review.
  > **How to apply**: at propose, grep `docs/` for the actions, payloads and tables the change touches, and add a
  > docs task to tasks.md.

- [ ] 🟡 **A new CSS class name needs a grep before it is fixed in a plan.** → **Promote to memory**
  (type: feedback)
  > **Why**: the plan's `.q-group` collided with an existing intake class and restyled a client screen.
  > **How to apply**: when writing plan.md, grep `src/` for every new class or id named in the plan.

- [ ] 📌 **Long database runs can hang on Realtime after the host clock jumps.** → **One-off** (record only)
  > **Why**: it happened once (Task 4) and passed on a re-run. Its cause lies outside the code.

## Ledger summary

The SDD ledger (`.superpowers/sdd/plan/progress.md`) is deleted after this retrospective. These are all its rulings,
parked findings and deferred minor findings.

**Rulings**:
1. **Pre-flight rulings:**
   - Task 4a adds `purpose` to `mapFollowup`.
   - `signingWhen` lives in `src/domain.mjs`.
   - A fixed mapping says which plan task ticks which tasks.md item.
   - The Task 4 and Task 8 briefs were trimmed so they didn't include Tasks 4a and 8a.
2. **Task 2:** the two tables were added to `STAFF_TABLES` early.
3. **Task 7 I1:** the Exit Form group class was renamed to `q-exit-group`.
4. **Task 7 I2:** the dead `ui.formValues` branch was removed. The pure helper `groupsToOpen` was added, and the
   story asserts that a group reopens after a refusal.
5. **Task 9:** the `safetyNet` VALIDATION line in `src/app.mjs` was accepted.
6. **Task 9:** the story presses Mark ready to e-file only on the No case.
7. **Final review:**
   - Update the four docs.
   - Add "Clear this section".
   - Add the `exit_form` table check.
   - Defer the builder's season-window sentence.
8. **Final review, parked:** the developer README's stale counts, fixed in 7648054.

**Fixed after deferral**:
- D10 and panel dates rendered as raw ISO (fixed in d1a9e08 for the went-over date).
- "Ready for review on" marked Changed (pinned by tests in d1a9e08).
- An Exit Form radio could not be cleared (294b513).
- A stray indent (294b513).

**Deferred minor findings still open**, none blocking:
- **Tests:**
  - The "insert is refused" test row lacks required columns.
  - `PRESENTER_ONLY_TABLES` in `tests/database.mjs` is not extended with the new tables.
  - There are no tests for:
    - more than five Local entries;
    - a non-object questionnaire;
    - invalid `refundBy` / `oweBy` / `wentOverHow` values;
    - `debitOn` with `mail_check`;
    - name and remarks length boundaries;
    - a `"false"` checkbox value;
    - a bad `debitOn` in the builder;
    - a PAIBWTR entry;
    - prefill ties;
    - `changedAnswers` beyond the method and the date.
  - The prefill's latest-entry test lists the newest entry first.
  - The `check_taxslayer_date` upper bound is untested.
  - Approval by a non-reviewer is not re-tested with a questionnaire.
  - `receiptCount` counts per workspace.
  - Two `tests/support/database-fixture.mjs` nits: unused destructured bindings, and the `rejected` comment
    separated from its export.
  - The `goOverOf` store test is coupled to the fake.
  - The `rowsFor(...).then(filter)` fixture test is awkward.
  - Brittle regexes in the office-view tests.
  - A local `MONEY_WORDS` list and phone regex in `tests/domain.test.mjs`.
  - The malformed-appointment fallback is untested.
  - There is no XSS regression test for remarks or names.
  - The `safetyNet` VALIDATION branch has no unit test.
  - "Clear this section" has no browser-level test.
  - The Yes case is not pressed through Mark ready to e-file in the story.
- **Code:**
  - A redundant `btrim` length check in `check_preparer_questionnaire`.
  - `groupsToOpen` counts `{checked:false}` as held.
  - A hand-opened empty Exit Form group closes on a redraw.
  - An unstyled `<h4>Exit Form (optional)</h4>`.
  - `src/staff-views.mjs` grew by about 300 lines.
  - Other answer dates (completed on, ready for review on) still render as ISO.
  - The builders don't mirror the D6 season window.
