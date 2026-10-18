# Retrospective: hide-draft-13614c-from-clients

> Written: 2026-10-17 (after verify, PASS WITH WARNINGS)
> Commit range: `9992aab..861ee0d` (archive commit to follow, after #82 merges)
> Worktree: `.claude/worktrees/hide-draft-13614c-from-clients`

---

## 0. Evidence

- **Commit range**: `9992aab..861ee0d` (12 commits: 1 planning, 6 implementation, 4 `tasks.md` bookkeeping, 1 verify)
- **Diff size**: +882 / −115 lines across 19 files. Code, tests and docs alone are +141 / −115 across 9 files; the rest is the change folder.
- **Tasks done**: 15/15 (`grep -cE '^\s*- \[x\]' tasks.md` → 15). One of them, 3.5, was added during apply.
- **Active hours**: about 2 h 40 min, from 18:20 (planning commit) to 20:58 (verify). Most of it was spent on browser story runs: five runs, plus three short diagnostic runs. A full run takes about 17 minutes.
- **Subagent dispatches**: 12.
  - 4 implementers, one of them resumed once for a fix round;
  - 4 task reviewers;
  - 1 scoped re-review for Task 3;
  - 1 final reviewer (opus);
  - 1 final fixer;
  - 1 final re-reviewer.
- **New external dependencies**: none.
- **Bugs encountered post-merge**: not merged yet.
- **OpenSpec validate state at archive**: not archived yet. At verify, `openspec validate --all` was 6/6 valid.
- **Test coverage signal**: `npm test` was 1067 / 1067 at every task, the same count as before (tests were changed in place). `build:hant -- --check` was clean.
  - Browser story, Chrome-client run: every step passed (run 4, 55/57 overall).
  - Browser story, Firefox-client run: every step passed (run 5, 29/29).

Commit chain, in order:

```
8d79318 OpenSpec change hide-draft-13614c-from-clients: planning artifacts (#80)
b64a0bf Client summary: Print and the draft Form 14446 only, no draft 13614-C
49a833f tasks.md: task group 1 done
932410f Drafts: only staff make a 13614-C; a 14446's tab is titled Draft Form 14446
4f977e4 tasks.md: task group 2 done
0a5d3e4 Story: the client's draft checks run on the Form 14446; no 13614-C on a client page
673e2fe Story: the 简体 client's summary offers the 繁體 Form 14446 first, and building it never loads the 繁體 map
46f0121 tasks.md: 3.5, the 简体 story step the plan missed
76fe82a Docs: the client's drafts are the Form 14446 only
aa473d3 tasks.md: task groups 3 and 4 done
47ffc8f Docs and comments: the draft buttons and the drafts' shared lines cover both forms
861ee0d verify.md: PASS WITH WARNINGS (hide-draft-13614c-from-clients)
```

---

## 1. Wins

- **The guard fails closed, and sits in the one place every draft press goes through** (`932410f`).
  - `viewDraft` returns before `window.open` when `kind !== "14446"` and the principal isn't a presenter.
  - A missing principal is refused, and so is any `kind` other than `"14446"`.
  - The banner's Try again passes back through the guard.
  - The final reviewer checked every path and found none that still builds a 13614-C for a client.
- **Old code was deleted, not hidden** (`b64a0bf`): `draftButtons`, `DRAFT_FORMS`, `draft.view` and `draft.form_zh_s` are gone, and a grep finds nothing that refers to them.
- **The story's draft machinery kept its coverage through the 14446** (`0a5d3e4`). The refused font, the refused form with Try again, and the blocked-tab link all passed on the client's 14446 in Chrome (runs 3 and 4). The new forged-button check passed too.
- **The story caught a missed step on its first full run.** Run 3's four failures traced to one assertion, which the plan had not listed (§3).
- **The diagnosis of the worktree failure was cheap and settled the question.** Three probes took under 10 minutes each:
  - the main checkout passed;
  - a new worktree at the base commit `8d79318` failed;
  - the older `unify-empty-states` worktree passed.
  
  Together they showed the change's commits weren't the cause, before any code was touched (§5).
- **The final review approved with wording fixes only.** It found nothing Critical or Important. Its three wording minors were fixed in one dispatch (`47ffc8f`) and passed one scoped re-review.

## 2. Misses

- 🟡 [painful | evidence: run 3, `0a5d3e4`] **The plan missed one story step.**
  - Plan Task 3 and design D5 listed only the client draft section (~4390–4660).
  - The 简体 step ("a client works in Chinese, and 繁體 loads only when chosen", ~4877) also pinned the summary's first draft button as the 简体 13614-C, and Task 1 broke it.
  - Cost: one extra fix round (`673e2fe`) and one extra 17-minute story run.
  - At the user's request, the fix keeps the step's point: building the 繁體 14446 doesn't fetch the 繁體 map (Chrome, `hantRequestsAfter14446: 0`).
- 🟡 [painful | evidence: runs 1 and 2, the ledger diagnosis] **New worktrees fail the browser story here.**
  - They fail at the presenter's reset (`resetSampleCases`, `tests/browser.mjs:742`) and on the empty "My applications" screen (`startApplication`, :781). `waitForQuiet` times out, because the page never stops rebuilding.
  - Cause not found. The repo lives under OneDrive, which is the likely cause (user's note). The installed packages were identical in every checkout (playwright 1.63.0, supabase-js 2.116.0).
  - Workaround used, with the user's approval: run the story from the main checkout, detached at this branch's head, then switch it back to `fix-zh-t-draft-simplified-characters`. Not fixed in this change (user's instruction).
  - Cost: about 45 minutes, across two wasted runs and the probes.
- 🟡 [painful | evidence: run 4 at `46f0121` vs runs 3 and 5] **`tests/browser.mjs:3837`, "a long answer redrew the page", is flaky in Firefox.**
  - It failed in run 4: Firefox client, `notes.anything`, `assert.equal(await marked("#intake-v2-form", "__beforeLong"), true, …)`, `false !== true`.
  - It passed in run 3 (same app code, `0a5d3e4`) and in run 5 (`47ffc8f`, Firefox-client run only, 29/29).
  - This change doesn't touch that code.
  - Cost: run 4 stopped the Firefox-client steps after it, so a fifth run was needed for Firefox evidence on the 简体 step.
- 📌 [nit | evidence: run 5] **The 简体 step's map check runs in Chrome only.** The check that building the 14446 doesn't fetch the map is Chrome-only by design, like every draft build in the story, because Firefox may download a blob PDF. Firefox covers the rest of that step.
- 📌 [nit | evidence: `b64a0bf`] **One commit trailer differs from the plan** (ruling R2, §3).

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 2 (Step 1) | Replaced the existing `shell.test.mjs` assertion on `writeTab` without `kind`, and updated two more `draft.failed` pins. The `viewDraft` slice regex window went from 1200 to 1400 characters. | Ruling R1: the plan's new assertions can't hold beside the old one. The guard adds about 190 characters to the slice. |
| 2 | Also fixed the stale "draft 13614-C buttons" comment in `client-text.mjs` (~330). | A deferred minor from Task 1's review, carried into Task 2 because it touches that file. |
| 3.4 | The story ran from the main checkout, not the worktree, over five runs instead of one. | New worktrees can't run it (§2). The user approved the main-checkout runs (U1, U2) and the Firefox-only run 5. |
| 3.5 (new) | The 简体 step's assertion now expects the 繁體 14446, and gained a Chrome build that checks the map is not fetched. | The plan missed it (§2). |
| Final review | Three wording fixes (`47ffc8f`): `frontend.md:472`, `frontend.md:286`, `client-text.mjs:101`. | The final review's minors 1–3. |

### Ledger summary: rulings, parked and deferred findings

**Rulings:**
- **R1:** replace the old `writeTab` pin in `shell.test.mjs`, rather than keep it beside the new one. Cost if wrong: one assertion's wording.
- **R2:** `b64a0bf` keeps the trailer "Co-Authored-By: Claude Sonnet 5.5", because the Sonnet subagent wrote it. History not rewritten. Cost if wrong: one commit's trailer.
- **R3:** the controller ran the story a second time, because run 1 never reached the change's steps. Cost: about 17 minutes. It failed the same way.
- **R4:** leave `press14446` and `open14446` (near-duplicates in `tests/browser.mjs`) as they are. Cleaning them up is cosmetic and would need another run.

**User rulings:**
- **U1:** run the story from the main checkout, then switch back; stop if Task 3's checks fail.
- **U2:** fix the missed 简体 step and keep its point.
- **U3:** run the Firefox-client run once more. If 3837 passes, record it as flaky; it passed.

**Parked:** none. No breaker tripped, and every review loop closed in at most one round.

**Deferred minors, all triaged by the final review:**
- **Fixed in `47ffc8f`:** the `frontend.md:472` parentheticals; the `frontend.md:286` heading; the `client-text.mjs:101` comment.
- **Left, with the final reviewer's reasons:**
  - the guard test checks the source text, as the repo does for `app.mjs`, and pins the guard before `window.open` rather than as the first statement;
  - the tab-title copy test reads `TEXT[...]` directly instead of going through `t()`;
  - the forged-button check waits 1500 ms for a tab that shouldn't open (`window.open` is synchronous);
  - a re-render between injecting the forged button and clicking it would fail loudly, never pass falsely;
  - `tests/browser.mjs` ~4468–4472 puts several statements on one line;
  - in the 简体 step, the routes aren't removed if an assertion fails first (`finally` closes the window).

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓ (brainstorm.md, from the agreed design plus two decisions made during propose) |
| superpowers:writing-plans                        | ✓ (plan.md) |
| superpowers:using-git-worktrees                  | ✓ (`.claude/worktrees/hide-draft-13614c-from-clients`) |
| superpowers:subagent-driven-development          | ✓ (ledger, briefs, a task review per task, final review) |
| (transitive) superpowers:test-driven-development | ✓ (RED/GREEN for Tasks 1 and 2; Task 3 and 4 are story and docs) |
| (transitive) superpowers:requesting-code-review  | ✓ (final whole-branch review, opus) |
| superpowers:finishing-a-development-branch       | not yet; it is step 9, after archive |

### Deliberately Skipped Skills

(none)

## 5. Surprises

- **A fresh worktree is not a neutral place to run the story here.** Earlier changes ran it from worktrees, with a 51/53 result in `unify-empty-states`. This cycle's new worktrees could not get past the reset. The old worktree still could, but slowly: 122 s for a step that takes about 3 s in the main checkout.
- **The plan's file list for a markup change was not enough to find every test that pins the markup.** A full-story grep for `view-draft` would have found line 4877 at plan time. The test was easy to miss because it only reads `data-form`.
- **A story failure can hide later steps.** The run-once rule for failures outside the change still left the fixed 简体 step without any Firefox evidence until run 5.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Before planning a markup change, grep the whole story and the unit tests for the selector or attribute being changed, not just the section you know about.** → **Promote to memory** (type: feedback)
  > **Why**: this change missed `tests/browser.mjs:4877`, which pinned `data-form` on the first `view-draft` button. One extra fix round and one extra 17-minute run.
  > **How to apply**: while writing `plan.md`, for any change to client or staff markup, list every test that pins that selector (`grep -n '<selector>' tests/`) in the task that changes it.

- [ ] 🟡 **New worktrees in this OneDrive folder can't run the browser story; run it from the main checkout, detached at the change's head, and switch back.** → **Promote to project CLAUDE.md** (the "Local test stack" or "Verification" rules), once the cause is confirmed
  > **Why**: runs 1 and 2 here, and a probe at the base commit, failed at `resetSampleCases` and the empty "My applications" screen, while the main checkout passed the same code. Root cause not confirmed; OneDrive is the likely cause.
  > **How to apply**: before `npm run test:browser` in a newly created worktree, expect this failure. Ask the user before detaching the main checkout, because it's outside the worktree.

- [ ] 📌 **`tests/browser.mjs:3837` ("a long answer redrew the page") is flaky in Firefox.** → **One-off** (a follow-up issue if it fails again)
  > **Why**: it failed once (run 4) and passed twice (runs 3 and 5) on identical app code.
  > **How to apply**: if it fails at an unrelated change's run, record it as flaky. Use `--test-name-pattern="Firefox client and Chrome staff"` to rerun just that run, about 9 minutes instead of 17.

- [ ] 📌 **To rerun just one of the two story runs, use `--test-name-pattern`.** Node 24 matches a step against its full name, which includes its run. → **One-off** (or a line in docs/setup.md)
  > **Why**: run 5 used `node --env-file=.env.test --test --test-name-pattern="Firefox client and Chrome staff" tests/browser.mjs` and ran only the 29 Firefox-client tests.
  > **How to apply**: when only one browser's evidence is missing.

---

> Archive (CLAUDE.md step 8) waits for #82 (`fix-zh-t-draft-simplified-characters`) to merge. #82 adds a story step around `tests/browser.mjs:4546`, inside the client draft section this change rewrites: a 繁體 14446 with 陈 fetches TC, SC and Latin. When `main` is merged in, that step stays, because clients still open the 14446.
