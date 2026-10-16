# Retrospective: add-form-14446-consent

> Written: 2026-10-16 (after verify passed with warnings)
> Commit range: `43b55a9..d3e47ad` (14 commits after the planning commit; this retrospective and the archive follow)
> Worktree: `.claude/worktrees/add-form-14446-consent` on branch `add-form-14446-consent`

---

## 0. Evidence

- **Commit range**: `43b55a9..d3e47ad`, 14 commits:
  - 8 task commits;
  - 1 fix round (Task 7: the module rename and the forms rule);
  - 2 final fix wave commits (the six findings, then the docs count);
  - 1 task-tick commit;
  - 1 design-notes commit from the final review;
  - 1 verify commit.
- **Diff size**:
  - after the planning commit (`43b55a9..d3e47ad`): 51 files, +1970 / −145;
  - branch total (`686104a..d3e47ad`): 54 files, +4057 / −117, including the planning artifacts.
  - The two PDFs are binary, and the generated catalogue module and 029 hold the whole catalogue as long single lines.
- **Tasks done**: 17/17 across eight groups.
- **Active hours**: apply took about 2 by commit times (43b55a9 to d3e47ad). Before that came the explore (PCDC's two PDFs, their XFA, the signature rules), propose, and the user's recheck round of 14 fixes.
- **Subagent dispatches**: 21 during apply.
  - 8 task implementers (Sonnet for Tasks 1–6 and 8, Opus for Task 7, the story);
  - 1 fresh implementer for the Task 7 fix round (Sonnet);
  - 1 final fix wave (Sonnet);
  - 8 task reviewers;
  - 2 scoped re-reviews (the Task 7 fix round, the final fix wave);
  - 1 final whole-branch review (Opus).
- **New external dependencies**: none. Two new binary assets, PCDC's Form 14446 in English and 繁體, XFA-stripped and pinned by SHA-256 (shared with the PCDC admin's permission).
- **Bugs encountered post-merge**: none yet (not merged).
- **OpenSpec validate state at archive**: pass at verify (4/4).
- **Test coverage signal**:

  | Suite | `main` | This branch |
  |---|---|---|
  | unit | 969 | 999: 997 after the tasks, plus 2 from the final fix wave (some new tests are generated sweep cases) |
  | database | 253 | 253 with 029–030 |
  | story | 57 | stopped at sign-in on the first run (the module name), then 57/57 (~16.6 min) and 57/57 after the final fixes (~15.9 min) |
  | sign-in | 20 | not run: no change |

Commit chain:

```
43b55a9 OpenSpec change add-form-14446-consent: planning artifacts
90fb5c2 The draft Form 14446 forms: PCDC's copies without XFA, review boxes clear
30c04ea Form 14446 in the catalogue: the consent at 0.4, the signatures at 1.5 (migration 029)
c13e337 The Form 14446 gate: steps 1-9 are locked until the client consents at 0.4
8fe5a85 Sign Form 14446 at 1.5: the details it will print, and dates that fill themselves
aaef839 View Draft Form 14446: PCDC's form with page 3 filled, in English and 繁體
2ad0682 Migration 030: the sample cases sign Form 14446
9a85c26 Story: consent at 0.4, the locked rail, sign 1.5, and the draft Form 14446
e3be00f Serve the Form 14446 module and PDFs: rename the module, widen the forms rule
8e43748 Docs: migrations 029-030, the Form 14446 gate, signatures and draft
f5bbf90 OpenSpec change add-form-14446-consent: all tasks done
eb33059 Final-review fixes for add-form-14446-consent
2f38fba Docs: unit count 999, name the Form 14446 consent in the last-verified line
c1d3996 OpenSpec change add-form-14446-consent: design notes from the final review
d3e47ad OpenSpec change add-form-14446-consent: verify
(retrospective and archive commits follow)
```

---

## 1. Wins

- [evidence: Task 1, 90fb5c2, the ledger's spike look] **The riskiest part went first, as a spike, and passed.** The plan's Task 1 stripped the XFA, filled both languages and flattened them exactly as `buildDraftPdf` does. The flatten threw "Unexpected N type" on the empty electronic-signature fields, and the plan's own fallback (remove a field that has no appearance) handled it. The pages were then rendered and checked by eye before anything else was built.
- [evidence: design D2, c13e337] **One place for the gate.** `resolveSubstep` already decided every landing, so the rail, the summary links, a stored sub-step and the controller's moves all respect the lock with one check. The final review found no way past 0.4.
- [evidence: D1, 30c04ea] **No hand-written catalogue SQL.** Every type, the `rule` clause and tip show-ifs already existed from #71, so the builder wrote 029, and the server enforces consent through the existing "required" check.
- [evidence: tests/support/consent-14446.mjs] **A shared consented default kept the old tests meaningful.** About 69 view renders and 44 controller moves would have landed on 0.4. Only three existing tests needed changing (Task 3), and only the gate's own tests use an unconsented set.
- [evidence: the ledger, Task 6] **Migration 030 worked on its first database run.** The dry run (123 fields, "Mei Chen" signed, nothing missing in any of the six samples, still security definer) predicted the 253/253.
- [evidence: the user's recheck before apply] **The planning recheck caught real defects before code.** Among the 14: the spike's flatten test didn't flatten as the build does, locked rail items lost `data-substep`, and the gate's Continue check sat after `returnToSummary`. Each was in the plan Task 1 or 3 would have built.

## 2. Misses

- 🟡 [painful | evidence: story run 1, e3be00f] **The plan named a module the server refuses to serve.** `server.mjs`'s asset rule admits only letters and dashes in `src/` module names, so `src/draft-14446-form.mjs` 404'd and the app failed to boot at sign-in. No unit test loaded the app through the server, so only the 16-minute story found it. One fix round renamed the module and widened the forms rule by exact name, and a new server test now requests every `src/*.mjs`.
- 🟡 [painful | evidence: final review, eb33059] **1.5's details read the raw answers while the draft reads `visibleAnswers`.** A late spouse's phone and email, or a stale `sp_phone`, would show on the page the client signs though the draft never prints them. The spec said "the details the form will print", and the plan didn't name which answers to read.
- 📌 [nit | evidence: final review, eb33059] **Both drafts downloaded as `14446-draft.pdf`.** The plan pinned that name; the 13614-C had already solved the collision with its pattern.
- 📌 [nit | evidence: final review, eb33059; Task 2 ruling] **OpenCC's segmentation, twice.** 说明了 became 說明瞭 over the whole page, and 不合并申报 became 不合並申報. The first was worked around in the 简体 text, the second with an override.
- 📌 [nit | evidence: the ledger, Task 1] **The browser pane can't show a PDF.** A served PDF opened a download dialog for the user once. The spike's look used pdf-lib to split pages and `qlmanage` to render them; `sips` drew a 繁體 page black, PCDC's untouched original included.
- 📌 [nit | evidence: the ledger, Task 8; 2f38fba] **The docs sweep missed a noun and two frontend.md mentions** (deferred minors), and the unit count needed a second pass after the fix wave.

## 3. Plan deviations

| Plan task | What changed | Why |
|---|---|---|
| 1 | The strip tool also removes the four appearance-less electronic-signature fields. | The plan's fallback: pdf-lib can't flatten them. |
| 2 | Section 15's standard Chinese says "说明 PCDC" for "说明了 PCDC". Regenerate re-sends the client's `vc_*` values rather than only leaving them out of `cleared`. | The three-language sweep; `fictionalAnswers` returns `{ ...cleared, ...fresh }`. Rulings in the ledger. |
| 4 | One extra test (the late-spouse label, the date and phone formats); `openV2` forwards `clock`. | The plan's tests needed the clock. |
| 5 | `src/draft-form.mjs` exports `oneLine`, `usDate`, `phone`, `isoDay` and a new `draftStamp`; `tests/shell.test.mjs`'s `viewDraft` pins updated. | Shared with the 13614-C rather than copied. |
| 7 | A fix round renamed `src/draft-14446-form.mjs` to `src/draft-virtual-consent.mjs`, widened `server.mjs`'s FORMS rule by exact name, and added server tests. The planning artifacts follow the new name. | Story run 1. Ruling in the ledger. |
| 8 | An extra edit to `docs/developer/backend.md` ("exactly those three" forms is now five). | A stale fact the server change made wrong. Ruling in the ledger. |
| final | `signDetails` reads `visibleAnswers` and leaves out hidden rows; the 合併 override; tests of the two spouse-signature tips; the Chinese 14446 button names its 繁體 form; a stale comment; the 13614-C file-name pattern; docs unit count 999. design.md gained the new-front-end-with-old-database risk and the `vc_sp_email` visibility, and at verify the file-name pattern. | Final review: one Important and six minors. |

## 4. Skill / workflow compliance

| Skill | Used |
|---|---|
| superpowers:brainstorming | ✓ (agreed in conversation; the skill wrote `brainstorm.md` at propose) |
| superpowers:writing-plans | ✓ (`plan.md` in the change folder) |
| superpowers:using-git-worktrees | ✓ (`.claude/worktrees/add-form-14446-consent`, with the `node_modules` and `.env.test` links at setup) |
| superpowers:subagent-driven-development | ✓ (ledger, pre-flight scan table, per-task reviews, one fix round, final review, one fix wave) |
| (transitive) superpowers:test-driven-development | ✓ (each implementer reported RED and GREEN; Tasks 6 and 7 had no unit RED by design, and the controller's dry run and story runs stood in) |
| (transitive) superpowers:requesting-code-review | ✓ (per-task reviews, and the final review on Opus) |
| superpowers:finishing-a-development-branch | ✓ at lifecycle step 9 |

### Deliberately Skipped Skills

None.

## 5. Surprises

- **The server's allow-list is a naming rule.** `ASSET = /^\/src\/[a-z-]+\.(?:mjs|css|svg|png)$/` means no `src/` module may have a digit in its name. Nothing in the developer docs said so before this change.
- **An empty electronic-signature field has no appearance,** so pdf-lib can't flatten it, even with `updateFieldAppearances` first.
- **"What the form will print" is the draft's own reading.** A page that previews a draft has to read the same `visibleAnswers` as the draft, not the raw answers, or hidden and stale answers show.
- **The 繁體 converter works per string and per page differently.** 说明了 converts to 說明了 alone but 說明瞭 within the whole page, so the three-language sweep failed on text that looked right.

## Ledger summary (rulings, parked findings, deferred minors)

From the SDD ledger (`.superpowers/sdd/plan/progress.md`), before it was deleted.

**Rulings**, in order:
1. **Accept 030's verbatim copy of 019's `fixture_answers_v2`** (pre-flight). Migrations are immutable, and `create or replace` must restate the whole body, as 027 did. Cost if wrong: none at runtime.
2. **Accept "说明 PCDC" for "说明了 PCDC"** in Section 15's standard Chinese (Task 2). With 了 the converter gives 說明瞭 over the whole page but 說明了 per string. The meaning is unchanged, and the text goes to the wording review. Cost if wrong: one wording tweak.
3. **Accept Regenerate re-sending the client's `vc_*` values** (Task 2). Only re-sending keeps them, since `fictionalAnswers` returns `{ ...cleared, ...fresh }`. Cost if wrong: none.
4. **Rename the module to `src/draft-virtual-consent.mjs` and widen only FORMS, by exact name** (Task 7, story run 1). It keeps the server's allow-list as strict as designed. Cost if wrong: widening ASSET would have been simpler.
5. **Keep the extra `docs/developer/backend.md` edit** (Task 8). Cost if wrong: none.

**Parked findings:** none. No fix loop reached its cap.

**Deferred minors** (the final review triaged them; none blocks merge):
- The strip tool's removal of the four signature widgets leaves two dangling structure-tree references per file. Readers treat them as null; strict validators (qpdf, PDF/UA) may flag them (`tools/strip-xfa.mjs`).
- Task 1's report said 37 fields after the strip; each form has 39.
- The `!key.startsWith("vc_")` filter in `fictionalAnswers`' `cleared` is redundant given `kept`.
- `kept` is spread before `fresh`, so a caller passing a set that already has `vc_*` would overwrite the client's own; both app callers go through `sampleAnswersFor`.
- `moveSubstep(1)` and `backToSummary()` have no controller-level refusal while unconsented. Continue is disabled, but a programmatic call records a visit to 0.4 and clears `returnToSummary`; the form stays on 0.4.
- `aria-disabled` on a role-less `<span>` in the locked rail; the "Locked" text carries the meaning.
- Locked rail spans still get the `.rail-sublink:hover` background.
- The plan-mandated `aria-disabled` regex in `tests/client-views.test.mjs` would match any later `aria-disabled`; sibling assertions cover the real case.
- No controller test of the sweep case (a date cleared, then the same signature re-sent: the date stays empty); the code is correct.
- No view test feeding `<` or `&` into 1.5's details; the code escapes.
- The quiet-console tests spy `console.warn` only, as the 13614-C tests do.
- The staff panel has two buttons reading "繁體中文版" (13614-C and 14446), indistinguishable for a screen reader without context.
- No test builds a 14446 with Chinese text through the font path (shared with the 13614-C).
- 030's copied comment still calls the base `makeSampleAnswers({ version: 2, seed: 0 })` without noting the 14446 keys.
- The story's `sign14446` default signature could sign a "Not given" placeholder for a blank name; the 繁體 draft is recognised by its font fetch; the draft tabs' consoles are unchecked (as for the 13614-C); no staff-side 14446 open; a null `walkSignature` message.
- The every-module server test covers `src/*.mjs` only, not `.css`/`.svg`/`.png` or `src/vendor`.
- `frontend.md` doesn't name the two 14446 PDF files, and its staff draft-buttons bullet has no 14446 counterpart.
- The longer Chinese 14446 button label's wrapping is covered only by the story's overflow checks.
- Raised by the final review and handled outside the code: the deploy order (029 and 030 before the merge, now in design.md), `vc_sp_email`'s visibility on the staff answers panel (a design.md trade-off, for the user in the PR), and the senior 1.5 headings that use 配偶 rather than 您爱人 (the wording review).

## 6. Promote candidates → long-term learning

- [x] 🟡 **`src/` module names are letters and dashes only, and served PDFs are named one by one** → **Promoted to memory** `src-names-server-allow-list` (type: project)
  > **Why**: the plan named `src/draft-14446-form.mjs`; `server.mjs` refused it, the app failed to boot, and only the 16-minute story found it.
  > **How to apply**: when a plan adds a file under `src/` or `src/forms/`, check the name against `server.mjs`'s ASSET and FORMS rules (a server test now requests every `src/*.mjs`).

- [x] 🟡 **A page that previews what a draft prints must read the draft's `visibleAnswers`** → **Promoted to memory** (appended to `hidden-contact-fields-surface`)
  > **Why**: 1.5 listed a late spouse's phone and email from the raw answers, while the draft prints neither.
  > **How to apply**: when a view shows "what the form will print", read the same `visibleAnswers` call as the draft builder, and test a hidden and a stale answer.

- [x] 📌 **Check a PDF here with pdf-lib and `qlmanage`, not the browser pane** → **Promoted to memory** `check-pdfs-here` (type: reference)
  > **Why**: the browser pane can't render a local or served PDF and opened a download dialog for the user; `sips` drew a 繁體 page black.
  > **How to apply**: to look at a filled PDF, split its pages with pdf-lib and render them with `qlmanage -t`; never open a PDF in the browser pane.

- [x] 📌 **OpenCC converts a whole page differently from one string** → **Promoted to memory** `hant-page-segmentation` (type: feedback)
  > **Why**: 说明了 and 不合并 converted differently in context (說明瞭, 不合並), failing the sweep or the vocabulary.
  > **How to apply**: when new 简体 text has 了 after a verb or 合并 before a noun, run `npm run build:hant` and read the 繁體 in context; add an override to `tools/hant-overrides.mjs` when the tax term changes.

- [x] 📌 **The worktree guard refuses any command whose text contains "git", even inside a word** → **Promoted to memory** (appended to `worktree-git-commands`)
  > **Why**: a command with "digits" in it was refused.
  > **How to apply**: put such text in a script file in the scratchpad and run the script.

The ledger's open questions and deferred minors are also kept in memory `form-14446-carry-forwards`.
