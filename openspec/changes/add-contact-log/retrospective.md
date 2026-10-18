# Retrospective: add-contact-log

> Written: 2026-10-18 (after verify passed with warnings)
> Commit range: `2cccfc1..cb34b46`
> Worktree: `.claude/worktrees/add-call-log` (branch `add-contact-log`; the directory kept the change's first name)

---

## 0. Evidence

- **Commit range**: `2cccfc1..cb34b46` (20 commits: 3 planning, 10 implementation, 6 `tasks.md` ticks, 1 verify)
- **Diff size**: +5296 / −415 lines across 52 files (including the change folder)
- **Tasks done**: 19/19
- **Active hours**: about 7.5 h of apply and verify (2026-10-17 22:10 to 2026-10-18 ~05:30, including a laptop sleep of unknown length during Task 4), plus the planning sessions on 2026-10-17
- **Subagent dispatches**: 17 (6 implementers, 6 task reviews, 2 scoped re-reviews, 1 final whole-branch review, 1 final fix wave, 1 final re-review), plus 3 resumes of implementers for fix rounds and the rebase pause
- **New external dependencies**: none
- **Bugs encountered post-merge**: none yet (not merged)
- **OpenSpec validate state at archive**: pass (6/6 before archive)
- **Test coverage signal**: unit 1071 → 1120 (+49); database 253 → 272 (+19, `tests/database-contacts.mjs` 18 subtests); browser story 61/61 in both permutations at the final head

Commit chain:

```
12721e3 OpenSpec change add-call-log: planning artifacts
4bcefbc OpenSpec change add-call-log: revise into a contact log
8f5a71b OpenSpec change add-contact-log: renamed from add-call-log; apply_fixture_scenario overlap with #73
29007ec Contact log: tables, staff-only policies, log and edit RPCs, follow-up attempts moved in
2a4104b Contact log fixes: contact_attempts leaves the publication, the adapter watches the log, the move deletes only what it moved, edit locks the case first
752688e Contact log: the one-line summary and New York time
a5f8ed5 tasks.md: group 1 (database) done
8622bba Contact log: read with the staff case, log and edit through the controller
e8ab94d tasks.md: group 2 (summary line) done
507e2fd tasks.md: 3.1 and 3.3 done
f61abd5 Contact log: one Log contact form in the Contacts tab, the Follow-up tab and the office drawer
e64ae78 tasks.md: groups 3 and 4 done
9afdae3 Story: the office logs follow-up contacts in the contact log; log, edit, correct and copy contacts
f2632c2 Story: compare Copy all with the system clipboard across line-break conventions
1a6f867 Docs: the contact log
7d11b3b tasks.md: group 5 done
558107a Docs: fix stale counts and contact-log wording
627a98b tasks.md: group 6 done
012eda5 Final review fixes: Copy all tie-break, edit focus, docs for 031
cb34b46 verify.md: add-contact-log passes with warnings
<archive commit follows>
```

---

## 1. Wins

- **Standalone RPCs kept clear of #73.** `vitally_log_contact` / `vitally_edit_contact` (031) reuse `require_membership`, `reserve_receipt`, `lock_case` and `lock_open_followup` unchanged. Only `act_record_contact` and `apply_fixture_scenario` were redefined, and the Task 1 reviewer diffed the copied `apply_fixture_scenario` against 019 to confirm only the two D6 changes.
- **Rules held in two places.** Every entry rule is a table CHECK and is also checked in `check_contact_entry`. The final review found no authority hole: applicants are refused before any target is read, a linked log needs `followup` plus the assignee check, and edit is limited to the logger or `admin`.
- **The planning revision paid off.** The user's seven points (direction, method-specific outcomes, editable contact time, New York time, merging the office's "Log a call") changed scope before any code existed (4bcefbc). None of them had to be retrofitted.
- **The pre-flight scan caught a split removal.** Ruling R1 moved the whole `RECORD_CONTACT` removal into Task 4, so every commit stayed green (unit suite green at 752688e, 8622bba, f61abd5).
- **The story found a real platform difference.** Windows Chrome returns clipboard text with `\r\n` (run 1, 38/40). It was fixed narrowly in f2632c2, and every run after that passed 61/61.
- **One source for the line.** `contactSummary` feeds the list, Copy, Copy all and the task lists, so the story compares on-screen lines with clipboard lines exactly.

## 2. Misses

- 🟡 [painful | evidence: user message mid-Task 1] **The branch was not on the latest `origin/main` when apply started.** #86 merged after the planning rebase. The user caught it. The controller paused the Task 1 implementer (nothing written yet), rebased onto 2cccfc1 and resumed. That cost a pause and a re-base of the ledger, but no rework.
- 🟡 [painful | evidence: 29007ec → 2a4104b] **The plan missed that `contact_attempts` must leave the Realtime publication.** `tests/database-store.mjs:390` (publication equals what the adapter watches) failed at Task 1. Ruling R2 fixed 031 in place and moved the `STAFF_TABLES` swap forward from Task 3. 031 had to be re-applied on the local stack by deleting its `schema_migrations` row (013's documented dev pattern, user rule respected: applied nowhere else).
- 🟡 [painful | evidence: Task 6 review; 558107a; 012eda5] **Doc sweeps for changed counts missed spots twice.** "sixth function", a stale "last verified" paragraph, "contact attempts" in architecture.md, then `README.md:137 (001–030)`, the missing `setup.md` 031 row and `demo-script.md:165`. It took two fix rounds.
- 📌 [nit | evidence: ledger, Task 4] **A laptop sleep stalled Task 4** for an unknown time and left a `sed -i` temp file (`src/sedzte0Y4`). The implementer cleaned it up when asked.
- 📌 [nit | evidence: Task 4 report] **A `sed -i` CRLF→LF loop in an implementer's edits** could have rewritten whole files. It did not: the repo is `eol=lf` and the diff stayed proportionate, which the controller checked with `git ls-files --eol`.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 1 (database) | 031 also drops `contact_attempts` from `supabase_realtime`; `STAFF_TABLES` swapped here, not in Task 3 | Ruling R2: the publication must equal what the adapter watches, or the channel drops |
| 1 (database) | `vitally_edit_contact` locks the case, then the entry (D1 said entry then case); the move deletes only moved ids; `act_record_contact` replaced before the move | Ruling R3, from Task 1 review Minors 1–2: avoid a raw 40P01 deadlock with checkpoint/reset, and a migration-time race |
| 1 (database) | `tests/support/rpc-signatures.mjs` and `tests/database-actions.mjs` changed | The RPC list test pins every public function |
| 3 (store) | `RECORD_CONTACT` removal and the `attempts` decoration removal moved to Task 4; 3.2 ticked after Task 4 | Ruling R1: keep the removal in one commit with the form that used it |
| 3 (store) | Mappers named `mapContactEntry` / `mapContactVersion`; staff messages `STAFF_CONTACT_*` | `mapContact` already maps `case_contacts`; `tests/client-language.test.mjs` requires non-`STAFF_` messages to be client-text keys |
| 5 (story) | Run twice in Task 5 and once more at the final head; all from the main checkout | New worktrees under OneDrive fail the story (previous change's retro); the user approved each switch |
| 6 (docs) | Also updated architecture.md, backend.md, production-roadmap.md, setup.md, demo-script.md | Counts ("seven RPCs", "sixteen tables") and wording changed across them |
| final fix wave | `contactSummaries` tie-break, edit-focus fix, four doc fixes | Final review Minors 2, 4, 5, 6, 7 (ruling R4) |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓ (agreed design written to `brainstorm.md`; the method ran in conversation before propose, per CLAUDE.md step 2) |
| superpowers:writing-plans                        | ✓ (`plan.md`) |
| superpowers:using-git-worktrees                  | ✓ (the existing change worktree, detected, not re-created) |
| superpowers:subagent-driven-development          | ✓ (ledger, briefs, per-task reviews, final review) |
| (transitive) superpowers:test-driven-development | ✓ (RED/GREEN evidence in every implementer report) |
| (transitive) superpowers:requesting-code-review  | ✓ (6 task reviews, 2 re-reviews, final review + re-review) |
| superpowers:finishing-a-development-branch       | ✓ (step 9, after archive) |

### Deliberately Skipped Skills

(none)

## 5. Surprises

- **Windows Chrome reads the clipboard back with `\r\n`** even when the page wrote `\n`. Firefox can't be granted clipboard read in Playwright, so the story checks what the page wrote there.
- **Realtime with RLS was enough for live updates.** No case change and no tab-open fallback were needed, as D5 predicted. The story's two-window check proves it without a reload.
- **`process.env.TZ` set in a test file** has no guard asserting it took effect. The code passes an explicit `timeZone` everywhere, so it didn't matter here (Task 2 Minor 1).
- **Removing an action from `CASE_ACTIONS`** also has to keep its `EVENT_SENTENCES` entry, because old History events still render it. A test now pins this.

### Ledger summary (rulings, parked and deferred findings)

Rulings (all confirmed sound by the final review):
- **R1:** the whole `RECORD_CONTACT` removal plus the `attempts` decoration removal moved from Task 3 to Task 4. If wrong, the cost was two dead references for one task.
- **R2:** drop `contact_attempts` from the publication inside 031 and re-apply 031 on the local stack; the `STAFF_TABLES` swap moved into Task 1. If wrong, three lines move into a 032.
- **R3:** folded Task 1 Minors into the R2 round: delete only moved attempts, replace `act_record_contact` before the move, lock the case before the entry on edit, plus three tests. If wrong, the lock-order change reverts in about 5 lines.
- **R4:** the final fix wave covered final Minors 2, 4, 5, 6, 7. Not fixed:
  - Minor 1: a retry after an unknown outcome can write a duplicate entry. It is permanent because entries can't be deleted; the assistance desk has the same limit.
  - Minor 3: an edit drops seconds from migrated or seeded contact times.
  - Minor 8: no `max` or hint for the 5-minute limit.

Parked findings: none (no fix loop reached its cap).

Deferred minors left in the code (the final review triaged all of them "can stay"):
- **Task 1:**
  - The VT002 edit test uses a random uuid.
  - No test that a presenter reads nothing on a client's private draft.
- **Task 2:**
  - The TZ guard is missing.
  - A bare `RangeError` on a blank time value (guarded by `required`).
  - "other" with a blank name renders badly (the DB forbids it).
  - `NaN` in the sort for an invalid time.
  - Coverage gaps: incoming + other, email, unknown-key fallbacks; and `nowInput` is asserted with a regex.
- **Task 3:**
  - Duplicate on retry (as R4).
  - `runContactWrite` repeats `runAssistanceAction`'s skeleton.
  - The conflict test doesn't assert that the newest content is shown.
  - `select("*")` vs `STAFF_COLUMNS`.
- **Task 4:**
  - The default contact time is drawn at render, with no `max`.
  - Copy is silent when the contact has vanished.
  - Fields stay editable while busy.
  - Dead CSS (`.attempt-list`, the `.office-drawer .contact-form` border).
  - The Edit button has no `aria-controls`.
  - The shell test pins app.mjs source by regex.
  - The persona-switch unit test covers only the view guard; the story covers the rest.
- **Task 5:**
  - The client-window check doesn't assert the case view.
  - Focus is read but not asserted.
  - Heading, drawer-title and zone texts are not asserted.
  - The incoming line's direction is only half checked.
  - Helper inconsistencies.
  - The real clipboard read depends on page focus (the likeliest flake).
  - `hoursBefore` subtraction around a DST change.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Fetch and compare with `origin/main` right before apply, not only at propose.** → **Promote to project CLAUDE.md** (§2 step 5, Apply)
  > **Why**: #86 merged between the planning rebase and apply; the user had to stop the run to ask for a rebase, and the Task 1 implementer had to be paused.
  > **How to apply**: as the first command of `/opsx:apply`, run `git fetch origin` and `git merge-base --is-ancestor origin/main HEAD`. If it fails, rebase (or merge) before dispatching Task 1.

- [ ] 🟡 **When a migration adds or drops a table the browser watches, plan the publication change and the `STAFF_TABLES` change in the same task.** → **Promote to memory** (type: feedback)
  > **Why**: `tests/database-store.mjs:390` pins publication = adapter list. The plan split them across Tasks 1 and 3, and Task 1 failed until ruling R2.
  > **How to apply**: in `plan.md`, any task whose migration touches `supabase_realtime` also edits `SUBSCRIBED_TABLES` in `src/supabase-store.mjs`.

- [ ] 🟡 **When a change moves a count in the docs (RPCs, tables, migrations, test totals), grep for every number and range form before writing, and list the hits in the docs task.** → **Promote to memory** (type: feedback)
  > **Why**: two doc fix rounds (558107a, 012eda5) for "sixth", "(001–030)", a missing setup.md row and demo-script.md:165.
  > **How to apply**: in the docs task brief, include `grep -rnE "001–0[0-9]{2}|\b(five|six|seven|fifteen|sixteen)\b|<old table name>" docs README.md` and require each hit to be checked.

- [ ] 🟡 *(carried forward from hide-draft-13614c-from-clients)* **New worktrees in this OneDrive folder can't run the browser story; run it from the main checkout, detached at the change's head, and switch back.** → **Promote to project CLAUDE.md**, once the cause is confirmed
  > **Why**: true again here. All three runs ran from the main checkout with the user's approval. docs/setup.md now has a line on it (1a6f867), but the cause is still unconfirmed.
  > **How to apply**: ask before detaching the main checkout; always `checkout main` after, and check its uncommitted items.

- [ ] 📌 **Windows Chrome reads the clipboard with `\r\n`; normalise before comparing in Playwright.** → **One-off** (recorded in the story's comment, f2632c2)
  > **Why**: run 1 failed 38/40 on this alone.
  > **How to apply**: any new clipboard read-back in `tests/browser.mjs`.

- [ ] 📌 **A retry after an unknown outcome can duplicate a contact entry, and entries can't be deleted.** → **One-off** (follow-up candidate if staff report duplicates)
  > **Why**: the controller mints a fresh action id per press (final review Minor 1), as the assistance desk does.
  > **How to apply**: if duplicates appear in use, keep the action id per form until success or a field change.
