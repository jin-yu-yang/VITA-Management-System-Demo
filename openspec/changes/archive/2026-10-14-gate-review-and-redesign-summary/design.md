## Context

**Step 9 today.** Step 9 of the client's intake form ("Review & submit", catalogue step `review`) has three sub-steps:
- `review.check` (9.1): alerts and warnings, then Continue;
- `review.summary` (9.2): the printable summary with Change links, then Print and the draft 13614-C buttons below it;
- `review.submit` (9.3): the confirm box and Submit.

**How it works now:**
- **Visibility.** All three are always visible: `substepVisible` returns `true` for kind `review`, at `src/intake-form.mjs:236`.
- **Alerts and warnings.**
  - Alerts are the missing required answers and the invalid answers, from the draft alone (`alertsOf`, `src/intake-views.mjs:389`).
  - Warnings are open document cards, and they never block.
  - Submit is disabled while there are alerts or the box is unticked. The app's SUBMIT guard (`src/app.mjs:883–915`) checks the draft again.
- **Moving through the form.**
  - The saved place (`state.formSubstep`) is resolved against the draft on every render (`formView`) and in `currentSubstep()`: a hidden place moves to the next visible sub-step after it, else to the last visible one.
  - Continue and Back use `adjacentSubstep`.
  - Every move goes through `goToSubstep`. It records a visit to the sub-step being left and saves the draft when it is dirty.
  - For a client's own draft, visits are saved on the server in `intake_visited`, a union that never shrinks.
- **The summary and print.**
  - Per-window panel state lives in `openPanels`. The rail keeps `rail-open:` and `rail-shut:` names there.
  - Print shows only `.summary-print` while `body.print-summary` is set (`src/styles.css:4598`).

**Who is involved.** The client, and a presenter acting as one, in English, 简体 or 繁體. The office's Add a case has no review step. Staff screens don't use this form.

**The historical design** is `docs/superpowers/specs/2026-10-04-intake-redesign-design.md` §5. Its rule still holds: Submit stays disabled until there are no alerts and the box is ticked.

## Goals / Non-Goals

**Goals:**
- 9.1's Continue is disabled while any alert remains, with a line saying why.
- 9.2 is visible only with no alerts. 9.3 is visible only with no alerts and after Continue on 9.2, kept as a saved visit.
- When an alert comes back, both hide and the client lands on 9.1. When it is fixed, both return without another Continue.
- The summary page has a three-paragraph intro, then its tools, then right-aligned Expand all and Collapse all, then sections that collapse from their headings. Print always prints everything.

**Non-Goals:**
- The office's Add a case, staff screens, and what the submit page asks.
- Any database, RPC, row-level security or realtime change.
- The widowed follow-up, multi-select service languages, Form 14446 and case tags. These are separate changes.

## Decisions

### D1: The gate is part of sub-step visibility
- **Choice:**
  - `substepVisible(substep, answers, cards, visited)`:
    - `review.check` is always visible;
    - `review.summary` is visible when `reviewAlerts(answers)` is empty;
    - `review.submit` is visible when that list is empty and `visited` includes `review.submit`.
  - `visibleSubsteps`, `resolveSubstep` and `adjacentSubstep` take an optional trailing `visited`. Missing means none.
  - Every caller that has the visits passes them: `formView`, `currentSubstep`, `goToSubstep`, `moveSubstep`, `stepRollup` and `firstUnfinishedSubstep`.
- **Why:**
  - The rail, the "Part n of N" count, the header's "n of total", Continue and Back, rail jumps and links all read visibility already. One rule changes them all together.
  - Moving back to 9.1 when an alert returns (brainstorm Q2-A) falls out of the existing resolve: a hidden `review.summary` or `review.submit` has no visible sub-step after it, so it lands on the last visible one, `review.check`.
- **Alternatives considered:**
  - Guarding each control (the Continue button, rail links, `goToSubstep`) one at a time. Rejected: there are many entry points, they can drift apart, and a saved place or "Back to summary" would still reach a gated page.
  - A separate "gate" flag in the state. Rejected: it would duplicate what the draft and visits already say, and could go stale across devices.

### D2: One list of alerts, `reviewAlerts(answers)`
- **Choice:**
  - `src/intake-form.mjs` exports `reviewAlerts(answers)`: the missing ids from `missingToSubmit(2, answers)` followed by the invalid ids from `invalidAnswers(null, answers)`, as `{ id, kind }` items.
  - `alertsOf` in `intake-views.mjs` builds its items from it. The gate uses it, and so does `substepStatus` for `review.check`.
- **Why:** 9.1's list, the disabled Continue and the visibility of 9.2 and 9.3 can never disagree.
- **Alternatives considered:** keeping the three separate `missingToSubmit` + `invalidAnswers` expressions. Rejected for that reason.

### D3: Continue on 9.2 earns 9.3
- **Choice:**
  - `moveSubstep(+1)`, when the current sub-step resolves to `review.summary`:
    - first adds `review.submit` to `state.visitedSubsteps`;
    - marks the draft dirty when `visitsPending()` says the visit is new to the server, so `goToSubstep`'s save sends it;
    - then computes the next sub-step with the new visit.
  - Nothing else earns 9.3: a rail jump or a Change link off 9.2 doesn't.
  - The visit is never removed, so 9.3 comes back as soon as the alerts are fixed (brainstorm Q2-A).
- **Why:**
  - It reuses the visit machinery that already saves, restores and syncs across devices.
  - `goToSubstep` stays the only place a move happens.
- **Alternatives considered:**
  - Using the existing visit to `review.summary`. Rejected: that is recorded whenever a client leaves 9.2 by any route, including a Change link.
  - A new database field. Rejected: there is no reason to change the schema.

### D4: The disabled Continue and its line
- **Choice:**
  - On `review.check`, while there is an alert:
    - the Continue button is drawn `disabled`, with `aria-describedby="continue-blocked"`;
    - a `<p id="continue-blocked" class="form-blocked">` before it reads `review.continue_blocked`.
  - The keyboard's arrival on 9.1 stays on the alerts heading, as today.
  - The controller also refuses: with an alert, `adjacentSubstep` from `review.check` finds nothing visible after it.
- **Why:**
  - A disabled submit button also stops Enter.
  - The line says why, and 9.1's own list says what to fix.
- **Alternatives considered:** hiding Continue entirely. Rejected: the user asked for "disabled", and a missing button is harder to explain.

### D5: 9.3's alert notice goes, and the SUBMIT guard moves into the controller
- **Choice:**
  - `submitBody` drops its amber "See the alerts" notice, and `client-text.mjs` drops `submit.attention` and `submit.see_alerts`.
  - Submit's disabled rule stays.
  - The SUBMIT guard's decision moves from `app.mjs` to a new `controller.guardSubmit()`:
    - it checks the draft with `reviewAlerts` (D2);
    - with an alert, it reveals every invalid answer, goes to `review.check` and returns false;
    - otherwise it returns true.
  - `app.mjs` keeps the sweep before it, and on false shows `toast.needs_change` and puts the keyboard on the alerts heading.
  - The old third clause (box unticked) is dropped: the `toast.confirm_first` branch before it already returns in that case.
- **Why:**
  - Under D1, 9.3 is never drawn with an alert, so the notice is dead code.
  - The guard can still be reached. The page holds back redraws while a pointer is pressed, so a press can land on a 9.3 drawn before another device's change brought an alert back.
  - The story can no longer reach that state on purpose, because its old route was a 9.3 with alerts. In the controller, a unit test can: it changes the draft under an earned, ticked 9.3 and checks the redirect, the reveal and that nothing is submitted.
  - The guard then uses the same alert list as the gate, instead of its own copy of the rule.
- **Alternatives considered:**
  - Keeping the notice "just in case". Rejected: it can't be shown, so nothing tests it and a reviewer would flag it.
  - Accepting the lost browser check and leaving the guard in `app.mjs`. Rejected: the guard would have no test at all.
  - A story check that injects a Submit button, or races a second window against a held pointer. Rejected: the first tests a page no client can see, and the second depends on timing.

### D6: The summary page's layout and text
- **Choice:** `summaryBody` returns, in order:
  1. `<div class="summary-intro">`: three paragraphs from `summary.intro_all`, `summary.intro_change` and `summary.intro_tools`.
     - `summary.intro_change` takes `{change}`, filled from `summary.change`, so the intro follows any later rename of the Change link.
     - It ends "or choose that part in the list of steps" / 或在步骤列表中选择该部分. It doesn't name the rail by `rail.nav` ("Form steps"), because that is a screen-reader label sighted clients never see. That label stays as it is (user's decision at the planning review).
     - English marks it `**…**`, rendered bold through `renderRichText`. Chinese wraps it in “…”.
  2. `.summary-tools`: Print, the draft buttons and `#draft-ready`, unchanged inside.
  3. `<div class="summary-fold">`, right-aligned, holding `#summary-expand-all` ("Expand all" / 全部展开) and `#summary-collapse-all` ("Collapse all" / 全部收起).
  4. `.summary-print`: the meta block and the sections.
- **Why:** this is the layout and wording the user approved (brainstorm Q6–Q8).
- **Alternatives considered:**
  - Hard-coding "Change" inside the intro. Rejected: it could drift from the link it names.

### D7: Collapsible sections through `openPanels`
- **Choice:**
  - Each `.summary-step` (from `answerSteps(…, { change: true })` and `documentsSummary`) renders:
    ```html
    <h2 class="summary-step-head">
      <button type="button" id="summary-toggle-<step>" class="summary-toggle"
              data-action="toggle-panel" data-panel="summary-shut:<step>"
              aria-expanded aria-controls="summary-body-<step>"
              aria-label="Show or hide <title>">…</button>
    </h2>
    <div id="summary-body-<step>" class="summary-body" [hidden]>…</div>
    ```
  - A section is shut when `openPanels` holds `summary-shut:<step>`. So every section starts expanded, and the state is per window, as the rail's is.
  - `V2_PANELS` accepts `summary-shut:[a-z]+`, so the existing `toggle-panel` handler toggles the name and puts the keyboard back on the heading.
  - Each toggle has the id `summary-toggle-<step>`. The focus restore matches by id first, so a redraw from elsewhere (a realtime refresh, for example) keeps the keyboard on the same heading, not on the first `toggle-panel` button on the page.
  - Expand all and Collapse all are new actions, `summary-expand-all` and `summary-collapse-all`. They call a new `controller.setSummaryShut(stepIds)`, which replaces every `summary-shut:` name in one change, the same pattern as `setRailExpanded`.
    - Collapse all passes the step ids of the sections on the page.
    - Expand all passes none.
    - The keyboard stays on the pressed button through its id.
  - The documents section uses `documents`, including the same-day "Bring these to your visit" list.
  - The read-only answers on the submitted page (`change: false`) don't collapse.
- **Why:** this reuses the rail's tested pattern and the existing focus handling.
- **Alternatives considered:**
  - `<details>`/`<summary>`. Rejected:
    - its state lives in the DOM, so every redraw would lose it;
    - its open state can't print on its own without script;
    - the rail already set the pattern.

### D8: Print shows every section
- **Choice:**
  - Under `@media print`, `.summary-print .summary-body[hidden]` gets `display: block`, so the Print button prints every section.
  - The browser's own print command already prints nothing of the app (`styles.css:2010` hides `#app > *` without a modal). This change leaves that as it is.
  - The toggle's icon is hidden, and the button prints as plain heading text.
  - Expand all and Collapse all sit outside `.summary-print`, so the existing print rules hide them.
- **Why:** the user's rule: "Print always prints everything".
- **Alternatives considered:** expanding everything in script before `window.print()`. Rejected: it changes the client's chosen state, and it would have to undo that after printing.

### D9: Spec
- **Choice:** new requirements in the `client-intake` capability.
  - These are ADDED requirements only. No existing requirement covers Step 9.
  - At archive, the capability's Purpose gains "reviewing and submitting the application".
- **Why:** Step 9 is part of the client's intake form.

## Risks / Trade-offs

- **[Risk] Typing never redraws, so the rail lags.** On a question sub-step, a fix or a new gap changes the gate, but the rail's 9.2 and 9.3 entries and the "Part n of N" count only refresh at the next render: a move, a choice or a realtime refresh. → Mitigation: every move re-resolves, so no control can reach a gated page. This is the same lag the rail marks have today.
- **[Risk] Old tests and the story assume 9.2 and 9.3 are always there.**
  - Unit tests assert all three review ids are visible with `{}` answers.
  - The story jumps straight to `review.submit`. Its walk Continues past an alert left on purpose, and its SUBMIT-guard check needs 9.3 with alerts.
  - → Mitigation: the plan lists each place to update.
  - The story gets a helper that goes 9.1 → Continue → 9.2 → Continue → 9.3.
  - The guard's redirect check is replaced by gate checks in the story and a `guardSubmit` unit test (D5). The unticked-box refusal stays in the story.
- **[Trade-off] The SUBMIT guard's redirect loses its browser check.** The UI can no longer reach a 9.3 with alerts on purpose. → Its decision is unit-tested in the controller (`guardSubmit`), and a source check in `tests/shell.test.mjs` pins the app's wiring (toast and keyboard). What no test covers is the toast and keyboard placement after a forced Submit in a real browser; both reuse code the story checks on other paths.
- **[Risk] Focus after a redraw.**
  - The focus restore matches buttons by id, name or `data-action` plus a short list of attributes, and `data-panel` is not one of them.
  - → Mitigation:
    - the section toggles use `toggle-panel`, whose handler re-focuses by `data-panel`, and each has its own id for other redraws;
    - Expand all and Collapse all have ids.
- **[Risk] A disabled Continue on the page the client is on.** It can't take the keyboard. → The keyboard lands on the alerts heading on arrival, as today, and each alert is a button.

## Migration Plan

N/A. There is no database or deployment change, and no migration.
- Existing drafts: a client already past 9.2 has a saved visit to `review.submit` only if they left 9.3 before. Anyone else presses Continue on 9.2 once.
- Saved places on 9.2 or 9.3 with alerts resolve to 9.1 at the next render.
- Rollback: revert the PR. Saved visits stay valid either way.

## Open Questions

None. The "Form steps" question was settled at the planning review: paragraph 2 ends "or choose that part in the list of steps".
