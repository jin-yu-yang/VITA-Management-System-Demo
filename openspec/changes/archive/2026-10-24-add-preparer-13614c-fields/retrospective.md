# Retrospective: add-preparer-13614c-fields

> Written: 2026-10-24 (after verify passed)
> Commit range: `383cf85..995dfba` (planning through verify), plus the retrospective and archive commits
> Worktree: `.claude/worktrees/add-preparer-13614c-fields`

---

## 0. Evidence

- **Commit range**: `96f1a1d..995dfba`, 24 commits:
  - the planning artifacts (383cf85);
  - 13 task commits and 3 fix-round commits across Tasks 2–10;
  - 2 tasks.md progress commits (00323fe, 1200aad);
  - the final-review fix wave (e20a5f0, 1c1790c, 5b54f00, c119758);
  - the targeted case-id fix (e7db8b4, 541fd93);
  - verify (995dfba).
- **Diff size**: +6370 / −90 lines across 52 files for the whole branch, before verify. About 1.85 MB of that is the two generated pdf.js vendor files.
- **Tasks done**: 38/38.
- **Active hours**: about one long day of agent time on 2026-10-24.
  - The spike took about 10 minutes.
  - The database tasks took about 50 minutes.
  - Tasks 7 and 9 took about 45–50 minutes each, about half of it in browser-story runs.
  - Task 10 took about 8 hours of wall clock, because three story runs fell in a busy-machine stretch.
  - There were seven full browser-story runs in all, at 20–26 minutes each.
- **Subagent dispatches**: 27, plus 5 resumes:
  - 10 implementers (one per plan task), plus 1 final fix wave;
  - 9 task reviewers;
  - 1 final whole-branch reviewer;
  - 6 scoped re-reviewers;
  - 5 resumes for fix rounds: Tasks 5, 7, 9 and 10, plus the targeted case-id fix.
- **New external dependencies**: `pdfjs-dist` 6.4.299 (Apache-2.0), an exact-pinned devDependency, vendored as `src/vendor/pdfjs.mjs` and `src/vendor/pdfjs-worker.mjs`. It brings an optional `@napi-rs/canvas` 1.0.13 with platform packages; that one is lockfile only and never vendored.
- **Bugs encountered post-merge**: none so far (not merged yet).
- **OpenSpec validate state at archive**: pass, 9/9 (verify.md §1).
- **Test coverage signal**:

  | Suite | Now | Baseline |
  |---|---|---|
  | Unit | 1400 | 1336 |
  | Database | 434 | 421 |
  | Browser story | 77 | 77 (two new steps inside existing phases) |

  New test files: `tests/shaded-fields.test.mjs`, `tests/database-shaded.mjs` and `tests/shaded-editor.test.mjs`.

Commit chain:

```
383cf85 add-preparer-13614c-fields: planning artifacts
cd5c024 Shaded section: the 106-field table and its rules
ad04065 Shaded section: table and shape check
20f84c5 Shaded section: SAVE_PREPARER_FIELDS and sample rows
9c46e08 Draft 13614-C: fill the shaded section; wrap and continue its notes; stamp wording
9d2b521 Draft 13614-C: test note overflow with paragraphs and Chinese, continued-page stamp
7c69d81 Shaded section: editing copy and filled-copy reader
3570bb4 Shaded section: save, download and upload on the case page
2219e8b Shaded section: a printed copy gets the Print sentence; download failure wording; one SHADED_UPLOAD
00323fe add-preparer-13614c-fields: tasks 1–6 done
a44d3e5 Vendor pdfjs-dist 6.4.299 (legacy build)
a2d486f Shaded section: pdf.js editor
1a904d7 Shaded editor: next version is + 1, a revision-only CONFLICT is sent again, close on sign-out
d49f356 Shaded editor: mark the layer ready once every page is drawn; the story waits for it
947cfad Docs: shaded section, vendor files
002f323 Docs: migration range, suite counts
1200aad add-preparer-13614c-fields: all tasks done
e20a5f0 Shaded upload: a revision-only CONFLICT is sent again, as from the editor
1c1790c Filled copy: read a box's raw export value, so any value but Off is ticked
5b54f00 038: drop service_role's unusable insert/update on preparer_shaded_fields; tests assert the exact constraint
c119758 Docs: suite counts and story run from 2026-10-24
e7db8b4 Shaded upload: resend only to the case it was sent for
541fd93 Docs: unit count 1400, story run time
995dfba add-preparer-13614c-fields: verify
(then: retrospective, merge main, archive)
```

---

## 1. Wins

- **[evidence: the Task 1 findings in the ledger] The spike settled every open technical question before any code.** The partial flatten worked (297 fields → 106), Chinese `/V` with NeedAppearances showed in pdf.js and in headed Chrome, and no `.bcmap` was needed. So D6's fallback, the server allowlist entry and the Latin-only contract change all fell away, and no `/opsx:update` was needed. Its `partial-flatten.mjs` became the base for 7c69d81.
- **[evidence: tests/database-shaded.mjs "the SQL key lists match the JS table"] The JS table and the SQL arrays can't drift apart.** The test parses 038's key arrays and compares them with `SHADED_FIELDS`. Task 3 also aligned the two edge rules (code-point length, a blank stored note refused) on both sides. The final review found the JS and SQL rules match key for key.
- **[evidence: the Task 4 review's scripted diff] The four SQL redefinitions are verbatim.** A scripted extract-and-diff against 036/037 showed every difference is a `-- 038` line, so a rebase against #90 is mechanical.
- **[evidence: 3570bb4, the browser story] Download / upload was built first and was end to end before the pdf.js work started.** That gave the Oct 29 gate a fallback, as D8 intended.
- **[evidence: the final review's round trip] Every input path round-trips.** Stored values go to the editing copy, then through `readFilledCopy` and `readShaded`, and come back unchanged for every kind, including CJK, a note with leading spaces, an emoji, line breaks and a 500-character note.
- **[evidence: the Task 9 and final reviews] Reviews caught concurrency bugs that the tests passed.** Three would have overwritten or misplaced a save without a test failing:
  - the editor adopting a re-read version (1a904d7);
  - the upload resending only on a revision conflict (e20a5f0);
  - the resend going to another case (e7db8b4).

## 2. Misses

- 🔴 **[blocking until fixed | evidence: the re-review of the fix wave → e7db8b4] The final fix wave added a cross-case write.**
  - **What happened:** e20a5f0's resend after a revision-only CONFLICT went through `runAction`, which builds the envelope from the case that is open at that moment. A preparer who switched cases while the first send was out could have case A's values saved onto case B.
  - **Why it escaped:** it got past the fix wave's own tests and was caught only by the scoped re-review.
  - **Process:** the process allows one fix wave, so it went to the user, who approved a targeted fix. The envelope now carries the captured case id, and a test switches cases between the refusal and the resend.
- 🟡 **[painful | evidence: Task 10 report, ledger "Task 10: note"] The browser story was flaky at Task 10.**
  - Runs 1 and 2 failed on 20 s page-settle timeouts in the Firefox-client / Chrome-staff permutation, in different phases, neither of them a shaded step.
  - The machine was busy, and a duplicate story run had been started briefly and killed.
  - Run 3 passed 77/77, and every later run (fix wave, targeted fix) passed first time.
  - It cost about an hour of wall clock and looks like the Firefox-staff wait flake that docs/setup.md already warns about, here on the Chrome-staff side. Watch for it.
- 🟡 **[painful | evidence: the Task 9 review, R8] A conflict over the case revision looked like a section conflict.** `vitally_apply_action` raises `CONFLICT` for both kinds, and the first editor build disabled Save for good on either. The spec scenario "the case changes while the editor is open" would have failed when realtime arrived late. The design (D5) didn't separate the two kinds.
- 🟡 **[painful | evidence: the Task 7 review → 2219e8b] The order of checks in the reader was wrong.** A browser-printed copy (no Keywords, no fields) got the "different case" refusal instead of the Print sentence. That was Task 6 code, but only Task 7's review, looking at the upload path, saw it.
- 📌 **[nit | evidence: the Task 2 report] TDD order was not followed once.** The Task 2 implementer wrote the module before the tests and captured RED by moving the module aside.
- 📌 **[nit | evidence: the harness] Some combined git commands were refused.** The worktree-isolated session refused git commands it couldn't check (chained or piped). The SDD helper scripts ran when called alone. Review packages for diffs containing vendor bundles or golden fixtures had to be built by hand, with plain `git diff` and excludes.
- 📌 **[nit | evidence: the Task 9 implementer report vs the targeted-fix re-review] An implementer described a change it hadn't made.** It said the editor now passes its captured case id. It does not, because the editor calls `saveShadedSection` fresh for each send. That path can't be reached today, since `#app` is inert, so it is recorded as a follow-up below.

**Ledger summary.** This is the required summary of every ruling, parked finding and deferred minor in `.superpowers/sdd/plan/progress.md`, written before the ledger is deleted. Nothing was parked: no task reached the five-round cap.

Rulings, 12 in all. The user confirmed every one on 2026-10-24:
1. R1. While 038 was still being written, its `vitally_private.schema_migrations` row was deleted from the local test stack before each re-apply.
2. R2. Task 7 may change `src/case-actions.mjs`, as tasks.md 5.2 names it.
3. R3. An accepted upload shows "Saved" beside the upload control (tasks.md 6.3).
4. R4. The four shared SQL functions were redefined locally before the group was told about the #90 overlap. The user tells the group before the PR.
5. R5. `preparer_shaded_fields` was added to the `supabase_realtime` publication for staff, with a test that clients receive nothing.
6. R6. The sentence for another case's copy: "This copy was made for a different case. Download the copy from this case and fill that one."
7. R7. The sentence for an upload whose section was saved after the download: "The shaded section was saved since this copy was downloaded. Download a fresh copy and fill that one."
8. R8. The editor's case-revision CONFLICT was promoted from Minor into the fix loop.
9. R9. tasks.md 7.6 was ticked on the go / no-go evidence. The user called GO, so pdf.js stays.
10. R10. The final fix wave covered the Important finding, the raw `/V` reading, the unusable grant, the `assert.rejects` test and the setup.md prose. The editing copy's stamp and the raw `answers.hh` household count were left.
11. R11. The sentence for a second revision-only conflict on upload: "The case changed while this copy was being saved. Upload the same file again."
12. R12. The cross-case resend was taken to the user rather than fixed in the session. The user approved the targeted fix (e7db8b4).

Deferred minors. The final review triaged every one as fine to leave unless noted:
- **Task 2 (`src/shaded-fields.mjs`):**
  - `CELL_WORDS` is a plain object, so "constructor" and "__proto__" pollute `values`. `checkShaded` still errors.
  - `OFF` also treats "false", "0" and 0 as unticked.
  - The amount reader strips all whitespace, not only `$` and commas.
  - There are no direct wrong-stored-shape tests, and CRLF normalisation isn't asserted.
  - Already resolved in Task 3: UTF-16 length and blank stored notes.
- **Task 3 (`tests/database-shaded.mjs`):**
  - The NOT NULL test passed jsonb `null`. Fixed in 5b54f00.
  - `assert.rejects` with a string argument. Fixed in 5b54f00.
  - The update and delete refusals are asserted loosely.
  - SQL refuses a count of `5.0`, which JS would accept as 5. SQL is the stricter side.
- **Task 4:**
  - Persona refusals accept either FORBIDDEN or INELIGIBLE.
  - The reviewer and the history are not tested at `corrections_required`.
  - The stage check runs before `require_case_preparer`.
  - The fixture's no-household branch is untested.
  - One fixture comment was garbled. Tidied in 5b54f00.
- **Task 5 (`src/draft-pdf.mjs`):**
  - The wrap and measure setup is duplicated between the notes and the comments.
  - The lost-character check is redundant on an overflowing note.
  - `Math.max(1, …)` capacity could overrun a box shorter than one line.
  - The 1.2× line pitch was not checked visually.
  - One old test name overstates its body.
- **Task 6:**
  - The catch around reading a field swallows type errors.
  - The partial flatten relies on `updateFieldAppearances` having run first.
  - No tests pin the whole-token case match or a missing version keyword.
  - Keywords are split on whitespace.
- **Task 7:**
  - A second upload during a read is dropped silently.
  - `isoToday` and the editing-copy preamble are duplicated in `app.mjs`.
  - `season` can be undefined. The server refuses with VALIDATION.
  - The story counts every `[role=alert]`.
  - No unit test renders the office page for the case's preparer.
- **Task 8:**
  - The lockfile's new `@napi-rs/canvas` Linux entries have no `libc` field.
  - The `sourceMappingURL` strip is not asserted.
- **Task 9:**
  - OFFLINE then Save again can show the conflict sentence for a save that landed. This is safe.
  - Escape and Tab do nothing when focus lands on `body`.
  - `rawFromPdfjs` reads only the first widget.
  - The open-failure path is unit-tested only.
  - Nothing explains a close on sign-out or a gone case, and focus may land on `body` afterwards.
- **Task 10:** the setup.md prose dates. Fixed in c119758.
- **Targeted fix:** the `!stillOpen()` branch clears `state.error` without checking whose error it is.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 3 / 4 | Added `preparer_shaded_fields` to the `supabase_realtime` publication, with a realtime isolation test, and `STAFF_TABLES` in `src/supabase-store.mjs` (R5) | tasks.md 5.1 and the spec's "no realtime change that carries it" imply staff realtime. The plan omitted it, and `tests/database-store.mjs` checks that the publication matches `STAFF_TABLES` |
| 3 | JS lengths count code points, and a blank stored note or reason is refused | So `src/shaded-fields.mjs` and SQL `char_length` agree |
| 6 | `buildDraftPdf` gained an `editing` option (`updateFieldAppearances: !editing`), and 8 extra pdf-lib exports went into the vendor bundle | pdf-lib re-encodes Chinese `/V` on save and throws |
| 7 | The tools sit in a shaded panel on the Intake answers tab, not in `draftTools` or the Overview | The panel holds all three tools and its errors in one place, on both the volunteer and office case pages |
| 7 | An upload CONFLICT has its own sentence (R7), and a download failure has its own heading | The editor's "Close and reopen" doesn't fit an upload |
| 8 | A separate `buildPdfjsFiles()` instead of `buildVendorBundle` returning the sizes | `buildVendorBundle` returns an esbuild result; the CLI still prints both sizes |
| 9 | The discard prompt is an in-layer alertdialog, not the app's confirm dialogs | The app's dialogs live inside the inert `#app` |
| 9 | A post-save version of `+ 1`, one automatic resend after a revision-only CONFLICT, and a close on sign-out or when the case is gone (R8) | Review findings: a silent overwrite, and the spec scenario "the case changes while the editor is open" |
| Final | The upload uses `createShadedSave`. The resend carries the captured case id. Box ticks come from the raw `/V`. service_role lost the unusable insert/update grant on the table | Final review and re-review findings (R10, R12) |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓ (propose step, before this session) |
| superpowers:writing-plans                        | ✓ (`plan.md`) |
| superpowers:using-git-worktrees                  | ✓ (`.claude/worktrees/add-preparer-13614c-fields`) |
| superpowers:subagent-driven-development          | ✓ (ledger, pre-flight scan, per-task reviews, final review) |
| (transitive) superpowers:test-driven-development | ✓, with one ordering slip (Task 2, §2) |
| (transitive) superpowers:requesting-code-review  | ✓ (final whole-branch review on Opus) |
| superpowers:finishing-a-development-branch       | ✓ (step 9, after archive) |

### Deliberately Skipped Skills

None. The SDD skill's finish (deleting the workspace and starting finishing-a-development-branch) was deferred to lifecycle steps 7 and 9, as CLAUDE.md directs.

## 5. Surprises

- The migrate tool refuses a changed migration (`MIGRATION_CHANGED`) once it has been applied, so writing 038 across Tasks 3 and 4 needed R1's local row deletion. The plan said only "not yet applied anywhere shared".
- `getFieldObjects()` keys by full field name, but `annotationStorage` keys by annotation id ("840R"). The editor has to map one to the other through each field object's `id`.
- A browser-printed PDF loses its Keywords. So the reader's "which case" check couldn't come before its "has fields" check.
- One error code, `CONFLICT`, covers two different stale states: the case revision and the section version. Both save paths have to tell them apart from the re-read case.
- Chrome's PDF viewer can't be seen headless. The spike had to use headed Chrome to check the Chinese `/V`.
- The browser story now takes 20–26 minutes. CLAUDE.md still says about 11–16.

## 6. Promote candidates → long-term learning

- [ ] 🔴 **A retried action must be bound to the record it was first sent for.** → **Promote to** project CLAUDE.md (Project rules, or `docs/developer/frontend.md`'s controller section)
  > **Why**: e20a5f0's resend went through `runAction`, which reads the open case, and could have saved one client's shaded section onto another client's case (e7db8b4).
  > **How to apply**: any code that sends an action again after a refusal or a wait must carry the case id captured at the first send, and must skip the resend if that case is no longer open.

- [ ] 🟡 **`CONFLICT` from `vitally_apply_action` can mean either a stale case revision or the action's own guard.** → **Promote to** `docs/developer/database.md` (the action envelope section)
  > **Why**: both shaded save paths first treated every CONFLICT as a section conflict (R8, e20a5f0).
  > **How to apply**: when designing an action with its own version guard, say in design.md how the browser tells the two apart. Today it does so by re-reading the record after `dispatch`.

- [ ] 🟡 **A migration written across two tasks needs a plan step for re-applying it locally.** → **Promote to** schema (plan template) or memory (type: project)
  > **Why**: the migrate tool's digest check (MIGRATION_CHANGED) forced R1 here, and a wrong table name in the previous cycle.
  > **How to apply**: when a plan splits one migration file across tasks, name `vitally_private.schema_migrations` and the single row to delete on the local stack only.

- [ ] 🟡 **Update CLAUDE.md's browser-suite duration.** → **Promote to** project CLAUDE.md (Verification)
  > **Why**: every run this cycle took 20–26 minutes, not 11–16.
  > **How to apply**: change the figure when CLAUDE.md is next edited. Not changed here, because this change didn't own it.

- [ ] 📌 **Follow-up: bind the editor's resend to its case too.** → **One-off** (follow-up PR)
  > **Why**: the editor calls `saveShadedSection` fresh for each send, and its `storedVersion` reads the open case (`src/app.mjs` ~1567). It is unreachable today because `#app` is inert while the editor is open.
  > **How to apply**: pass the editor's case id through `saveShadedSection` / `runAction`'s `caseId`, and return `NaN` from `storedVersion` when the open case differs.

- [ ] 📌 **Follow-up: manual checks not run this cycle.** → **One-off**
  > **Why**: no automated test covers the editor in Safari 18 or Firefox ESR, or an editing copy filled in Acrobat or Preview (does it keep the Keywords and `/V`?).
  > **How to apply**: before the M4 demo, open the editor in Safari 18 and fill a downloaded copy in Acrobat, then upload it.

- [ ] 📌 **Watch the browser story's 20 s page-settle flake.** → **One-off** (observation)
  > **Why**: two failed runs at Task 10, on the Chrome-staff side, while the machine was busy (§2).
  > **How to apply**: if it recurs on a quiet machine, open an issue to raise or rework that wait in `tests/browser.mjs`.
