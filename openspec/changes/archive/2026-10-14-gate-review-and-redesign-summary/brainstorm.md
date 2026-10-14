# Brainstorm: gate-review-and-redesign-summary

A raw capture of the design agreed in the conversation on 2026-10-13 and 2026-10-14, during CLAUDE.md lifecycle step 2 (`/opsx:explore` and the brainstorm). The code facts below come from `main` at a98f792.

## Background

- **The user's review** of the intake screen (2026-10-13) became four OpenSpec changes:
  1. `require-15080-signatures-and-household-middle-name`: merged as #65, migration 024.
  2. `add-unmarried-intake-wording`: merged as #67, migration 025.
  3. **This change.** The user raised it during the explore of change 2, and chose to make it its own change after the unmarried wording (decision "A, its own change after the unmarried wording").
  4. `allow-multiple-service-languages`: later.
- **The user's request, in their words:**
  - "STEP 9 · REVIEW & SUBMIT … New rule: The 'Continue' button remains disabled until all required fields are completed."
  - "Only after the Alerts and warnings is empty or only some documents are missing, you can click continue; and only after this, the 9.2 … appears."
  - "Similarly, only after you click continue under … summary page, 9.3 Submit … appears."
  - "Your application summary page needs to be redesigned":
    - a text field of 2–3 paragraphs;
    - move [Print, View Draft 13614-C] to the top;
    - make each section collapsible;
    - "add Close all or expand all buttons … right-aligned".
- **Step 9 today** (`src/intake-views.mjs`, `src/intake-form.mjs`):
  - It has three sub-steps:
    - `review.check` (9.1): alerts and warnings, then Continue;
    - `review.summary` (9.2): the printable summary with Change links, then Print and the draft buttons below it;
    - `review.submit` (9.3): the confirm box and Submit.
  - `substepVisible` returns `true` for every review sub-step (`intake-form.mjs:236`), so all three are always on the rail and reachable.
  - **Alerts** (`alertsOf`, `intake-views.mjs:389`) are every missing required answer (`missingToSubmit(2, draft)`) plus every invalid answer (`invalidAnswers(null, draft)`), taken from the draft alone. **Warnings** (`warningsOf`) are open document cards. Warnings never block.
  - Submit is already disabled while there are alerts or the box isn't ticked (`actions`, `intake-views.mjs:242`). The app's SUBMIT guard (`app.mjs:883–915`) checks the draft again and sends a client to `review.check`.
  - 9.3 shows an amber notice with "See the alerts" while there are alerts (`submitBody`, `intake-views.mjs:536`).
  - **Visits** are recorded only for the sub-step being left (`goToSubstep`, `controller.mjs:1658`). For a client's own draft they are saved on the server (`intake_visited`), a union that never shrinks.
  - **Where the form is:** `formView` and `currentSubstep()` resolve the saved place against the draft on every render. A hidden place moves to the next visible sub-step after it, else the last visible one.
  - **The summary** (`summaryBody`, `intake-views.mjs:529`):
    - `.summary-print` holds a meta block, then `answerSteps(…, { change: true })`, then `documentsSummary`;
    - `.summary-tools` follows, with Print, the draft buttons and `#draft-ready`;
    - nothing collapses.
  - **Print** (`styles.css:4598–4612`): while `body.print-summary` is set, only `.summary-print` shows, and the Change links and `.summary-tools` are hidden.
  - **Panel state** lives in `openPanels`, per window (`window-state.mjs`). The rail already keeps `rail-open:` and `rail-shut:` names there. The generic `toggle-panel` action accepts only names matching `V2_PANELS` (`app.mjs:756`).
- **The historical design** for this step is `docs/superpowers/specs/2026-10-04-intake-redesign-design.md` §5. It says Submit is disabled until there are no alerts and the box is ticked. This change keeps that rule and adds the gate in front of it.

## Decision chain

**Q1. What blocks 9.1's Continue?**
- Alerts block it: every missing required answer and every invalid answer, exactly the list 9.1 shows under "Fix before you submit".
- Warnings don't block: Needed or Maybe needed documents that are Not done or Later. ("Only after the Alerts and warnings is empty or only some documents are missing.")
- Confirmed in the explore.

**Q2. While an alert exists, what about 9.2 and 9.3?**
- Options:
  - A: hide them again while an alert exists.
  - B: once earned, they stay.
- **Decision: A** ("A, hide them again while an alert exists").
  - With an alert, 9.2 and 9.3 are off the rail and can't be reached.
  - A client on either one, or pressing "Back to summary", lands on 9.1.
  - Once fixed, both come back with no need to press Continue again: 9.3's earned visit is kept.

**Q3. What earns 9.3?**
- Pressing Continue on 9.2. It's remembered as a visit to `review.submit`, saved with the draft like every other visit, so another device or a later session keeps it.
- A rail jump or a Change link off 9.2 doesn't earn it.

**Q4. The disabled Continue on 9.1.**
- It is disabled while any alert exists, with a line next to it:
  - "Fix the items above to continue."
  - "请先修正上面的问题，然后继续。"
- The user confirmed this wording.

**Q5. The summary sections: open or closed at first?**
- **Decision: they start expanded** ("A, start expanded").
- Each section's open or shut state is kept per window in `openPanels`, as `summary-shut:<step id>`, the same way the rail keeps its steps.

**Q6. The intro text: three paragraphs.** The user confirmed: "The wording looks right".
1. "Here is a summary of everything you told us in your application." / 以下是您在申请中填写的全部信息。
2. "Before you submit, make sure you have answered everything that applies to you. To change an answer, choose **Change** next to that part, or choose that part in the list of steps." / 提交之前，请确认所有适用于您的问题都已回答。如需修改，请点击相应部分旁边的“修改”，或在步骤列表中选择该部分。
   - This is the user's revision at the planning review (2026-10-14). The first wording ended "or go to it in **Form steps**", but "Form steps" is only the rail's screen-reader label (`rail.nav`), which sighted clients never see. That label stays as it is.
3. "With the buttons below, you can print this summary, or view and download a draft Form 13614-C made from your answers." / 您可以用下方的按钮打印这份汇总，或查看并下载根据您的回答生成的 13614-C 草稿。

**Q7. The layout.**
- The intro comes first, then Print and View Draft 13614-C (with the other two draft languages) directly below it.
- Right-aligned below those are "Expand all" and "Collapse all", then the sections.
- The user chose to keep "Collapse all" rather than "Close all".

**Q8. The Chinese for the two buttons.**
- Options compared: 全部展开 vs 展开全部, and 全部收起 vs 收起全部 vs 全部关闭.
- **Decision: 全部展开 and 全部收起.** The user: "Confirmed on the Chinese labels for the 2 buttons".

**Q9. The section toggle.**
- Each step's heading is a button with `aria-expanded`. Its name for screen readers is "Show or hide {section}" / 显示或隐藏{section}, the same pattern as the rail's toggles.

**Q10. Print.**
- Print always prints everything, including collapsed sections.
- The toggles, Expand all and Collapse all are not printed.

**Q11. Scope.**
- In:
  - the client's Step 9 gate (9.1, 9.2, 9.3);
  - the summary page's intro, layout and collapsible sections.
- Out:
  - the office's Add a case, which has no review step (`addCaseParts` lists only question sub-steps);
  - the staff screens;
  - the content of the submit page (the confirm box and its note);
  - the database: no migration and no RPC change.
- Later and separate: the widowed follow-up, multi-select service languages, Form 14446 and case tags.

**Q12. Spec and checks.**
- New requirements go in the `client-intake` capability.
- Checks:
  - unit tests:
    - visibility, and 9.3's earned visit;
    - the disabled Continue and its line;
    - the move back to 9.1 when an alert returns;
    - the summary's intro, toggles, Expand and Collapse all, and print markup;
  - `npm run build:hant -- --check`;
  - `npm run test:browser`: the story walks 9.1 → 9.2 → 9.3, and clears an answer to check that 9.2 and 9.3 hide;
  - CI.
- Not needed: `test:database`, because nothing in the database changes, and `test:auth-browser`, because sign-in is untouched.

## Implementation decisions found while planning

These follow from the agreed design. They are recorded here so the user can see them before apply.

**I1. Where the gate lives.**
- `substepVisible` takes the visited sub-steps:
  - `review.check` is always visible;
  - `review.summary` is visible when there are no alerts;
  - `review.submit` is visible when there are no alerts and `review.submit` is among the visited.
- `visibleSubsteps`, `resolveSubstep` and `adjacentSubstep` gain an optional trailing `visited` argument. A missing `visited` counts as none.
- Every caller that has the visits passes them: `formView`, `currentSubstep`, `goToSubstep`, `moveSubstep`, `stepRollup` and `firstUnfinishedSubstep`.
- So the rail, the "Part n of N" count, the header's "n of total", Continue and Back, and every move follow the gate from one rule.
- One helper, `reviewAlerts(answers)`, lists the alert ids. `alertsOf`, the gate and `substepStatus("review.check")` all use it, so they can't disagree.

**I2. How Continue on 9.2 earns 9.3.**
- `moveSubstep(+1)` from `review.summary` first adds `review.submit` to the visited sub-steps. On the client's own draft this also marks the draft dirty so the visit is saved. It then computes the next sub-step with that visit.
- `goToSubstep` stays the only place a move happens.
- Leaving 9.3 already records its visit, as today.

**I3. Moving back when an alert returns.**
- This needs no new code. The render resolves a hidden `review.summary` or `review.submit` to the last visible sub-step before it, which is `review.check`.
- The saved place isn't rewritten, so a fix brings the client back to where they were. This matches Q2-A ("both reappear").
- "Back to summary" resolves the same way.

**I4. 9.3's alert notice is removed.**
- 9.3 can no longer be drawn while there is an alert, so its amber "See the alerts" notice, and the text keys `submit.attention` and `submit.see_alerts`, go.
- Submit's own disabled rule stays.
- The app's SUBMIT guard stays as a defence, for a press that lands on a 9.3 drawn before another device's change brought an alert back. The page holds back redraws while a pointer is pressed, so this race can happen.
- The story's check of that guard's redirect needed a 9.3 with alerts, which the gate now forbids. The story gets checks of the gate itself instead. The guard's other check, an unticked box refused with a toast, stays in the story.
- **The user's decision at the planning review (2026-10-14): fold `guardSubmit` in.** The guard's decision moves into `controller.guardSubmit()`, which checks `reviewAlerts`, reveals the invalid answers, goes to `review.check` and returns false. A controller unit test covers the redirect on a stale 9.3, and `tests/shell.test.mjs` pins the app's wiring. The other options were accepting the loss, or a story check that injects a Submit button or races a second window, which would be artificial or timing-dependent.

**I5. The intro names the controls through their own text keys.**
- Paragraph 2 fills in "Change" from `summary.change`, so a later wording review of that label keeps the intro in step.
- English shows it in bold. Chinese puts it in “…”, as the user's wording had it.

**I6. Section toggles reuse `toggle-panel`.**
- `V2_PANELS` accepts `summary-shut:<step id>`, so a heading button toggles its own name, and the existing handler puts the keyboard back on it.
- Expand all and Collapse all are new actions that set every `summary-shut:` name in one change, through a new controller `setSummaryShut(stepIds)`, the same pattern as `setRailExpanded`. Each button has an id, so the keyboard stays on it after the redraw.
- The documents section is keyed `documents`, like its step, including the same-day "Bring these to your visit" list.
- The office's Add a case and the submitted page's read-only answers (`change: false`) are not collapsible.

**I7. Print.**
- A collapsed section's body uses the `hidden` attribute. A print rule shows `.summary-print .summary-body[hidden]` anyway, so it prints from the Print button.
- The browser's own print command already prints nothing of the app: `styles.css:2010` hides `#app > *` when there is no modal. Only `body.print-summary`, which the Print button sets, brings the summary back. This change leaves that as it is.
- The toggle's icon is hidden in print, and the heading text prints as a heading.
- Expand all and Collapse all sit outside `.summary-print`, so they never print.

## Open questions

None. The one raised in planning ("Form steps" is only the rail's screen-reader label) was settled by the user at the planning review: paragraph 2 now ends "or choose that part in the list of steps" / 或在步骤列表中选择该部分 (Q6), and `rail.nav` stays as it is.
