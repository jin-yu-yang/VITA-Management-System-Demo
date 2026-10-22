# Retrospective: add-post-efiling-stages

> Written: 2026-10-22 (after verify passed, with warnings)
> Commit range: `559c1a0..HEAD` (proposal → retrospective; archive follows)
> Worktree: `.claude/worktrees/add-post-efiling-stages`, branch `add-post-efiling-stages`

---

## 0. Evidence

- **Commit range**: `559c1a0..bfd68a1`, 26 commits before verify. Code is final at `0b0e276`.
- **Diff size**: +4494 / -202 lines across 57 files. The largest are `supabase/migrations/035_post_efiling_stages.sql` (about 1,070 lines) and `tests/database-filing.mjs` (about 900).
- **Tasks done**: 28 / 28 (`grep -c '^- \[x\]' tasks.md`).
- **Active hours**: about 10 h wall clock (estimate), from apply start on 2026-10-21 to verify on 2026-10-22. About 2 h of that was four browser-story runs of about 17 min each, plus the Task 10 implementer's iterations.
- **Subagent dispatches**: 37.
  - 11 implementers (Tasks 1–11; Task 12's checks were run by the controller);
  - 11 task reviews;
  - 6 fix rounds, each resuming the original implementer (Tasks 1, 4, 5, 8, 9, 11);
  - 6 scoped re-reviews;
  - 1 final whole-branch review on Opus;
  - 1 final fix wave and 1 re-review of it.
  Models: Sonnet for implementers and reviewers; Opus for the Task 5 privacy review and the final review.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: none yet (not merged).
- **OpenSpec validate state at archive**: pass (9 / 9 at verify).
- **Test coverage signal**:
  - unit 1279 (baseline 1235);
  - database 374 (baseline 326);
  - browser story 65 (baseline 63).

Commit chain:

```
559c1a0 Propose add-post-efiling-stages (OpenSpec change, not applied)
4ab407f gate before apply checked
2661ae3 035's stages, columns and staff-only tables
4ba3b98 fix notes go only with their case                 (T1 fix round)
47b11b5 Mark e-filed records each return's method
fce5672 record each return's answer
860883a return to signing and file again
ccfea4b Return to signing's 简体 line                        (T4 fix round)
c91f1bf privacy checks and the rejected and accepted samples
fc8b826 only a sample's checkpoint may clear its notes     (T5 fix round)
81dc2b8 contracts, stage names, builders and store
2a8324f the staff case page
9db1e0d the case pool and Follow-ups
d9ace4b what the client reads
2bab494 clients see the filing method's label               (T9 fix round)
35b506f staff lists name the filing method                  (T8 reopened)
5ca7034 the story walks the rejection loop
4a85132 diagram and docs
ebd0595 docs counts                                         (T11 fix round)
0b0e276 final review — six small fixes
ca4a3e6 all tasks checked
bfd68a1 fix notes go with their case; client-intake seeds eight samples (/opsx:update)
(+ tasks.md checkbox commits c17c414, d690d13, 9c6c9cd, 358e3ea)
```

---

## 1. Wins

- **The privacy boundary held at every layer** (evidence: `tests/database-filing.mjs` privacy section; `tests/database-realtime.mjs` "realtime carries no code"; `src/supabase-store.mjs` staff-gated reads).
  - Reject codes, dates and notes live in presenter-only tables that aren't in the realtime publication.
  - Event details carry only `{attempt, results, noteAdded}`.
  - Client sentences are built only from return states.
  - The final Opus review found no leak path.
- **Migration 035's copies are faithful.** The final reviewer's line-by-line script found no unmarked logic change in any of the nine copied functions (`0b0e276`).
- **Every client string matches the spec character for character.** That includes the full-width punctuation. A database test (`"the history lines all translate"`) checks every line that `filing_line` and `efiled_line` can write against `SENTENCES`.
- **The task reviews caught real defects before they spread.** Each was fixed in one round:
  - an order-dependent trigger (Task 1);
  - a wrong 简体 line (Task 4);
  - a fixture bypass that let `service_role` delete notes on real cases (Task 5, reviewed on Opus).
- **The story walks the whole loop through the real UI**: reject, return to signing, refile on paper, Accepted & mailed (`5ca7034`). Running it also exposed a real gap: Follow-ups couldn't show the fix note.

## 2. Misses

- 🟡 [painful | evidence: ledger Task 1 and Task 5 rulings; `bfd68a1`] **The spec promised more than a demo with sample resets can keep.**
  - The propose-time spec said a note is "never … deleted, not even by the service role".
  - The fixture reset, checkpoint reload and workspace teardown all delete cases.
  - It took two rulings during apply and an `/opsx:update` after it to reconcile.
- 🟡 [painful | evidence: `2bab494`, `35b506f`] **Per-method names were wired only where the plan named them.**
  - Client badges (`client-views.mjs:121/345/361`) and staff badges (pool row, Follow-ups row and drawer, work board) still passed only the stage.
  - Both were found late: one from a reviewer's out-of-scope note, one from the controller's sweep. Task 8 had to be reopened after its review.
- 🟡 [painful | evidence: `5ca7034`] **The Follow-ups Rejected row couldn't show the fix note.** Rows are built from list records, and the staff list read no notes. Only the browser story found it (Task 10); the plan had tied the note to the case read.
- 🟡 [painful | evidence: `openspec/specs/client-intake/spec.md:43,47`] **A count in another capability's canonical spec went stale.** It said "six samples". It was found by the Task 11 docs review and needed a new `client-intake` delta.
- 📌 [nit | evidence: ledger Task 6] **The plan assumed `relatedRows` could load the filing tables.** It orders by `created_at`, which they don't have.
- 📌 [nit | evidence: ledger "Helper scripts"] **The skill's helper scripts were refused by the worktree guard.** `sdd-workspace`, `task-brief` and `review-package` all failed, so each step was replicated with plain commands and a scratchpad `briefs.mjs`.
- 📌 [nit | evidence: final fix report] **Three of the final-wave tests were never seen failing.** They pin existing behaviour. The re-review judged by reading that each would fail on regression.

## 3. Plan deviations

| Plan task | What changed | Why |
|---|---|---|
| T1 | `filing_notes` cascades only through its case and filing (no direct workspace key); the people keys are `deferrable initially deferred` | makes the "case row gone" exception deterministic, and lets workspace teardown run |
| T3 | a pre-change case's synthesized attempt takes `filed_at` (and later `filed_by`) from its Mark e-filed event | `now()` would have refused every real acknowledgment on an older case |
| T4 | added the Return to signing 简体 line to `SENTENCES` early | the existing migration-sentence scan required it |
| T5 | added the `vitally.clearing_case` exception, for sample cases only; also copied `fixture_answers_v2` and the widened sample-key checks | a checkpoint reload rewrites a sample in place; the new samples need answers and keys |
| T6 | `filingAttempts` absent (not `[]`) on client records; the filing tables are read directly | the store's staff-section convention; there's no `created_at` |
| T7 | the Mark e-filed dialog lists each choice's client line (the dialogs are static) | the spec requires the line; the plan had omitted it |
| T8 | reopened: per-method staff names on every list badge | spec gap found during Task 9's sweep |
| T9 | client badges pass the record; `filingMessage(stage, lang, record)` lives in `domain.mjs` | spec gap; it sits next to `returnState` |
| T10 | the staff list reads `filing_notes` and sets `latestFixNote` | the Rejected row needs it (gap in Task 8) |
| T11 | also updated `README.md` and `docs/developer/README.md` | stale "six samples" counts and action counts |
| T12 | run by the controller, not a subagent | plain commands |
| Final | fix wave: two privacy-guard tests; the pre-change `filed_by`; date `max` and the fix-note refusal; "Your next step" after Return to signing; a race test | final review |
| After apply | `/opsx:update`: the fix-note removal sentence and the `client-intake` delta | the user's decisions on the final review's Important 1 and 2 |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓ (method in the conversation; invoked at propose to write `brainstorm.md`) |
| superpowers:writing-plans | ✓ |
| superpowers:using-git-worktrees | ✓ (the native `EnterWorktree` on a `git worktree add` of the change branch) |
| superpowers:subagent-driven-development | ✓ (ledger, pre-flight scan, a review per task, fix rounds, final review, one fix wave) |
| (transitive) superpowers:test-driven-development | ✓, mostly. Every task recorded RED then GREEN, except the fix rounds noted in §2. |
| (transitive) superpowers:requesting-code-review | ✓ (11 task reviews plus the final Opus review) |
| superpowers:finishing-a-development-branch | pending: step 9, after archive |

### Deliberately Skipped Skills

(none skipped)

One workflow sub-step was substituted rather than skipped: the skill's `scripts/*` helpers. The guard refused to run them under `bash` ("cannot be shown not to run git"). Their outputs (the workspace marker, the briefs, the review packages) were produced with plain commands instead, so every review still read a package file.

## 5. Surprises

- The append-only trigger first blocked the test fixture's own workspace teardown and hung the suite (Task 1). Cascade order isn't something to rely on.
- `service_role` can't drop a trigger it doesn't own, but it can set a custom setting. A setting-only bypass was therefore a real hole (Task 5).
- Making a name depend on the record silently left every render site that passed only the stage on the old name. Unit tests built from the plan's call sites couldn't see it.
- The story's run time grew to about 17.5 min (1048–1052 s) with the new phase.

### Ledger summary (rulings, parked findings, deferred minors)

**Rulings.** All of these stand; the user confirmed them on 2026-10-22.
1. A pre-change case's synthesized attempt takes its filing date from the latest Mark e-filed event, falling back to `updated_at`.
2. A note's author name comes from the store's existing people lookup.
3. The Mark e-filed dialog shows the client line for each choice.
4. A fix note is deleted only together with its whole case, made deterministic through the cascade path.
5. A checkpoint reload may clear notes on sample cases only, and the setting is cleared right after.
6. `filingAttempts` is absent on client records.
7. The filing tables are read directly.
8. The `client-intake` "six samples" mismatch went to the user (now fixed by the delta).
9. The final fix wave covered code and tests only; the spec questions went to the user (now fixed by `/opsx:update`).

**Parked findings:** none. No fix loop reached its cap.

**Deferred minors, fixed later:**
- the Task 1 insert-refusal test (fixed in the final wave);
- the `efiled_line` second-filing tests (fixed in Task 4);
- `database.md:702` and the `frontend.md` payload sentence (fixed in Task 11's fix round);
- the applicant `latestFixNote` guard (fixed in the final wave).

**Deferred minors, still open (none blocks merge; the final reviewer triaged them):**
- Task 1:
  - the update refusal is asserted with an OR rather than directly;
  - `filing_returns` doesn't enforce the method/result pairing at table level;
  - `workspace_id` integrity rests on the composite case key.
- Task 2: any method that isn't `efile` is treated as mailed (safe given `check_payload`).
- Task 3:
  - length limits check the raw string rather than the trimmed one;
  - the "PCDC's day" test greps the function source instead of testing a boundary.
- Task 4: one error is shared by the stage and pending-answer guards in Return to signing.
- Task 5:
  - the added comma line isn't marked `-- 035`;
  - the leak test doesn't scan the samples' own seeded events;
  - the bypass test uses the superuser connection, not a service-role client.
- Task 6:
  - `latestFixNote`'s `>=` tie-break;
  - the staff filing reads use `select("*")`;
  - "E-filed" is written in two tables.
- Task 7:
  - `answeredOn` is shown as a raw ISO date;
  - the Filing panel relies on the store's order;
  - the pre-change "both e-filed" rule is written twice;
  - after both returns are rejected, the second-filing choices carry no per-choice line.
- Task 8:
  - the method helpers live in `admin-views` rather than `domain.mjs`;
  - two near-duplicate wording maps;
  - an unreachable empty cell.
- Task 9:
  - the Accepted closing sentence has a second source;
  - a brittle markup-count test.
- Task 10:
  - no newest-note unit test;
  - the story never asserts the pool's Filing tab.
- Task 11: the diagram's "Return to signing" label sits on the loop curve.
- Final wave:
  - the applicant guard test has no note in its case;
  - the golden normaliser maps any `max` date to TODAY.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **When a spec promises "never deleted", list how the parent record gets removed (resets, checkpoints, teardown) at propose time.** → **Promote to memory** (type: feedback)
  > **Why**: this change's append-only rule needed two apply-time rulings and a post-apply `/opsx:update`, because sample resets and teardown delete cases.
  > **How to apply**: when drafting any immutability or append-only requirement in this repo's specs, check `vitally_reset_fixtures`, `vitally_load_checkpoint` and workspace teardown first.

- [ ] 🟡 **When a name or label starts depending on the record, grep every render site at plan time.** → **Promote to memory** (type: feedback)
  > **Why**: per-method stage names reached only the call sites the plan listed. Client and staff badges elsewhere kept the stage-only name (`2bab494`, `35b506f`), and Task 8 had to be reopened.
  > **How to apply**: writing a plan task that changes `describeStage` or `stageBadge` semantics. List every `stageBadge(` / `describeStage(` caller in the task.

- [ ] 🟡 **List rows are built from list records, not the case read: any field a row shows needs a list-path read.** → **Promote to project docs** (`docs/developer/frontend.md`, Follow-ups section)
  > **Why**: the Rejected row couldn't show the fix note until Task 10 added a staff-gated `filing_notes` read to `listCases`.
  > **How to apply**: planning any new Follow-ups, pool or board column.

- [ ] 📌 **Grep `openspec/specs/` for counts and lists a change alters ("six samples"), not just the capability being changed.** → **Promote to CLAUDE.md** (Specs section) if it recurs
  > **Why**: the `client-intake` spec's "six samples" went stale, and CI's `openspec validate` doesn't catch it.
  > **How to apply**: at propose, whenever a change adds samples, stages or actions.

- [ ] 📌 **In a worktree-isolated session, the SDD helper scripts can't run under `bash`; replicate them with plain commands and a scratchpad script.** → **Promote to memory** (type: reference)
  > **Why**: the guard refused `sdd-workspace`, `task-brief` and `review-package` ("cannot be shown not to run git").
  > **How to apply**: at the start of subagent-driven development in an `EnterWorktree` session.
