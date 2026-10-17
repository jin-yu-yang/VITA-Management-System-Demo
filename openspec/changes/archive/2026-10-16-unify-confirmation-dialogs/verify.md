# Verification Report

**Change**: `unify-confirmation-dialogs`
**Verified at**: `2026-10-16`
**Verifier**: Claude (controller session). The `openspec-verify-change` skill is not installed, so the checks below were run directly, as CLAUDE.md says.

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item returns `"valid": true`

**Result**:

```text
totals: items 6, passed 6, failed 0
  unify-confirmation-dialogs  change  valid
  client-intake               spec    valid  (INFO only; not touched)
  draft-13614c                spec    valid
  draft-14446                 spec    valid  (INFO only; not touched)
  screen-states               spec    valid
  staff-case-work             spec    valid  (INFO only; not touched)
```

No warnings or errors; the INFO notes are long requirement texts in specs this change doesn't touch.

| Item | Type | Issues |
|---|---|---|
| — | — | none |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` has become `- [x]`: 22 of 22, including group 7, which the final review added through `/opsx:update`.

**Open tasks**: none.

Notes on ticked items:
- **5.4 "Run `npm run test:browser` once."** The user's rule for this change: run it once; if it fails at a step this change doesn't touch, record it and move on. The one run at `28cb270` had 34 tests, 32 passed and 2 failed.
  - **Chrome client / Firefox staff: passed every phase** (574.7 s). That includes the extended phase "a dialog takes the keyboard and gives it back" (3.1 s). Its evidence:
    - nothing behind the dialog was left reachable (`stray: []`);
    - the dialog itself was not inert, and neither was `#toast`;
    - nothing was inert after Escape (`afterClose: 0`);
    - Shift+Tab from the focused dialog container landed on `BUTTON[data-action="close-dialog"]`, "Keep my answers", which is the dialog's last control.
    
    The reset phase's new check passed too: the toast "The sample cases were rebuilt" was announced in `#toast`, outside anything inert.
  - **Firefox client / Chrome staff: failed outside this change.** The reset phase passed, including its toast check (4.5 s). It then failed in "a new application is submitted and reaches the staff board" (159.7 s).
    - `waitForQuiet` timed out after 20 s on the client's "My applications" screen, from `startApplication` (`tests/browser.mjs:277`) through `clickAction`. No dialog was open.
    - The quiet watcher observes only `childList` (`tests/support/story-pages.mjs:221`). Setting `inert` is an attribute write, so it cannot register as "rebuilding".
    - The step is client intake, which this change doesn't touch. The same phase failed the same way in `add-masked-phone-to-board-and-case-pool`'s runs.
    - As the user asked, it was recorded and not retried.
  - **Does the inert pass do anything when no dialog is open?** This change touches `render()`, so the controller checked this directly in real Chromium and Firefox through Playwright.
    - **The check:** a MutationObserver watched an `#app` with four children, observing attributes, child lists and the subtree. The render loop ran three times (`child.inert = Boolean(state.dialog) && …` with no dialog), followed by the `closeDialog` clear (`child.inert = false`).
    - **Result: 0 mutation records in both engines.** The pass sets and removes no attributes on a render without a dialog.
    - **Contrast:** a dialog render followed by a close produced 8 records (4 set, 4 removed) and left no `inert` attribute.
- **7.1, the empty lead.** `npm test` only, as the user asked; there was no second browser run. Every caller's lead is a non-empty string, which the Task 7 reviewer checked. The golden test confirms the markup is unchanged.

### Checks run

| Check | Result | Why |
|---|---|---|
| `npm test` | 1061 / 1061 pass (1055 before + 6 new) | Always |
| Golden test `tests/confirm-dialogs.test.mjs` | Pass. Its fixture was captured before any `src/` change (`eabc63f` touches only `tests/`) | The refactor's guard: identical markup for all 11 dialog states |
| `npm run test:browser` | One run: 32 / 34. One pairing passed everything; the other failed in client intake, outside this change (above) | Views, `app.mjs` and the story changed |
| Inert no-op check (Playwright, Chromium and Firefox) | 0 mutations without a dialog | User request; `render()` changed |
| `npm run build:hant -- --check` | Exit 0, nothing to regenerate | Checks that no client text changed |
| `npm run db:migrate:test` | "Approved test migrations applied." | Environment, before the browser run |
| `npm run test:database`, `npm run test:auth-browser` | Not run | No database or sign-in change |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Note |
|---|---|---|
| `screen-states` | ✗ Needs sync | 4 ADDED requirements, none of them yet in `openspec/specs/screen-states/spec.md` (which has the 5 from #75). Archive merges them. |

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Spec | Gap |
|---|---|---|---|
| Shared body; confirm control ready-made; refusal first; note before the form or inside it | D1 | "Every confirmation has the same shape", with its scenarios "A note inside the form" and "A refusal comes first" | None. It was reworded through `/opsx:update` after the final review found that "in this order" didn't match the checkpoint and corrections dialogs. |
| Inert except `.modal-backdrop` and the three banners; `#toast` outside `#app`; cleared before focus returns | D2 | "The page behind an open dialog is inert, and its live regions stay announced" | None. D2 now says that live regions nested in the page body (`q-note`, `#draft-ready`) are inert with the page. |
| Tab and Shift+Tab from the container go to the first and last control | D3 | "The keyboard stays inside an open dialog", scenario "From the dialog itself" | None |
| Esc, first focus, return to the opener (existing behaviour, now specified) | Context | "A dialog takes the keyboard and gives it back" | None. No code changed for it; the existing tests cover it. |
| Requirements in `screen-states` | D4 | The delta is under `specs/screen-states/` | None |

**Drift warnings** (non-blocking):

- **Where the inert loop sits in `render()`.** The plan says "directly after `root.innerHTML`". The code puts it after `document.title`, because two existing shell tests pin those lines together. The spec only requires "every render, after the page is drawn", and that holds. It was ruled during apply, and the final review agreed.

---

## 5. Implementation Signal

- [x] No unstaged or uncommitted files in the worktree (`git status --short` is empty)
- [ ] All related commits are pushed. Not yet: the push happens at the finish step, after archive. `origin/main` hasn't moved since the branch base (`32036a5`).

**Commit range**: `32036a5..854ec54`, before the verify, retrospective and archive commits.

| Commit | What |
|---|---|
| 281935a | planning artifacts |
| eabc63f | golden markup, captured before any `src/` change |
| b86bdb8 | `confirmBody`, `inertWhileDialog`, `trapTarget` |
| 07389c6 | the six confirmations use `confirmBody` (close case keeps `CLOSE_CASE`, `reason`, `confirmed`) |
| 619d536 | inert behind the dialog, and the Tab trap |
| 1d57ca9 | browser-story checks |
| 28cb270 | docs (`docs/developer/frontend.md`) |
| de36a84 | tasks ticked |
| aca63a2 | `/opsx:update`: the spec's shape wording, D1/D2, Task 7 |
| b5717f8 | empty lead adds no `<p>`; the inert comment |
| 854ec54 | tasks 7.1–7.2 ticked |

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

```bash
ls docs/superpowers/specs/*.md 2>/dev/null
```

- [x] Either no files, or the files that exist predate the schema install and are legitimate

| File | Content captured in the change? | Action |
|---|---|---|
| 8 historical design documents (parts 1–4d) | Not this change's: `git diff --name-only 32036a5..HEAD -- docs/superpowers` is empty | None. CLAUDE.md says to keep them. |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` rows, so this section is empty and passes.

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS. Every check passes. The warning is the single browser run: one pairing passed everything, including every new check, but the other failed in client intake, outside this change, and was not retried (the user's rule). The inert no-op check shows the change cannot cause that failure.
- [ ] ❌ FAIL

**Next**:

1. Write `retrospective.md`, with the ledger summary and follow-up B, then delete the subagent-driven development workspace.
2. Merge `main` if it has moved, then run `/opsx:archive`.
3. Push and open the PR. Tell Jinyu that close case now uses `confirmBody` and that its action and payload are unchanged. Don't merge it.
