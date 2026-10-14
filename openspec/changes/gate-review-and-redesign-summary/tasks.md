## 1. The gate (design D1–D3; plan Task 1)

- [ ] 1.1 Unit tests first, in `tests/intake-form.test.mjs`:
  - `reviewAlerts` lists missing ids, then invalid ids;
  - the gate:
    - `review.check` is always visible;
    - `review.summary` is visible with no alerts;
    - `review.submit` is visible with no alerts and once its visit is earned;
  - `resolveSubstep` and `adjacentSubstep` take the visits;
  - `stepRollup` and `firstUnfinishedSubstep` take the visits.

  Update the tests that expected all three review ids with `{}` answers. See them fail.
- [ ] 1.2 In `src/intake-form.mjs`:
  - export `reviewAlerts`;
  - `substepVisible` reads the gate;
  - `visibleSubsteps`, `resolveSubstep` and `adjacentSubstep` take an optional trailing `visited`;
  - `substepStatus`, `stepRollup` and `firstUnfinishedSubstep` use them.
- [ ] 1.3 Controller tests first, in `tests/controller.test.mjs`. Only Continue on 9.2 earns 9.3: not a rail jump, not a Change link. Also check that:
  - the visit is saved;
  - an alert sends 9.2 and 9.3 to 9.1;
  - a blocked Continue sends nothing;
  - "Back to summary" lands on 9.1;
  - the fix brings both back.

  Update the two tests that reached 9.2 or 9.3 with alerts.
- [ ] 1.4 In `src/controller.mjs`:
  - `currentSubstep`, `goToSubstep` and `moveSubstep` pass `state.visitedSubsteps`;
  - `moveSubstep(+1)` from `review.summary` earns `review.submit` first.
- [ ] 1.5 Move the SUBMIT guard's decision into `controller.guardSubmit()` (design D5):
  - a controller test: a clean draft passes, and on a stale, ticked 9.3 an invalid email and a missing city make it reveal the email, go to `review.check`, submit nothing and send no invalid email;
  - `app.mjs` calls it, then shows the toast and moves the keyboard, and drops its own `invalidAnswers` and `missingToSubmit`;
  - `tests/shell.test.mjs` pins that wiring.
- [ ] 1.6 In `src/intake-views.mjs`, `formView` passes the visits, and `alertsOf` builds on `reviewAlerts`. Fix the client-views and client-language tests that reached a gated page by seeding the earned visit or a complete draft. `npm test` passes.

## 2. 9.1's disabled Continue, and 9.3 without its alert notice (design D4, D5; plan Task 2)

- [ ] 2.1 View tests first, in `tests/client-views.test.mjs`:
  - Continue is disabled with `#continue-blocked`, for a missing answer and for an invalid one;
  - it is enabled with only open documents;
  - no line on other parts;
  - the Chinese line;
  - the rail and "Part n of N" follow the gate;
  - 9.3 has no alert notice.
- [ ] 2.2 Implement:
  - `actions` draws the disabled Continue and its line;
  - `submitBody(view)` drops the notice;
  - `review.continue_blocked` is added, and `submit.attention` and `submit.see_alerts` are removed;
  - `.form-blocked` styles;
  - `npm run build:hant`, then commit `src/zh-hant.mjs`.

  `npm test` and `build:hant -- --check` pass.

## 3. The summary page (design D6–D8; plan Task 3)

- [ ] 3.1 Tests first:
  - `tests/client-views.test.mjs`:
    - the order: intro, tools, fold, printed block;
    - the intro's exact text;
    - the section toggles, starting expanded;
    - `summary-shut:` hides a section, including documents and the same-day list;
    - the toggles stay live while busy;
    - the submitted page doesn't fold;
    - Chinese;
  - `tests/controller.test.mjs`: `setSummaryShut`;
  - `tests/shell.test.mjs`:
    - the two new actions are handled;
    - `V2_PANELS` accepts `summary-shut:<step>` and nothing else new;
    - the print rules.
- [ ] 3.2 Implement:
  - in `src/intake-views.mjs`: `summarySection`, `answerSteps(…, { panels })`, `documentsSummary` and `summaryBody`;
  - `setSummaryShut` in `src/controller.mjs`;
  - in `src/app.mjs`: `V2_PANELS`, `summary-expand-all` and `summary-collapse-all`;
  - six `summary.*` keys;
  - the CSS and the print rules;
  - `npm run build:hant`, then commit `src/zh-hant.mjs`.

  `npm test` and `build:hant -- --check` pass.

## 4. The story (plan Task 4)

- [ ] 4.1 Add `continueToSubmit(page)` in `tests/support/story-pages.mjs`. Use it in `fillIntakeV2ToSubmit` and in the Chinese phase.
- [ ] 4.2 The walk:
  - it stops at `review.check`: Continue is disabled, the line shows, the review step lists only 9.1, and the part count is checked;
  - it leaves through the city alert;
  - the rail at `before.service` has no 9.3;
  - the visits assertion.
- [ ] 4.3 The SUBMIT-guard section: with two alerts, there is no 9.2 or 9.3 on the rail, and Continue is disabled. `forceSubmit` moves to the Submit block.
- [ ] 4.4 The review block:
  - Continue 9.1 → 9.2 → 9.3, with the earned visit saved;
  - the unticked-box refusal and the Submit checks;
  - the summary's order and intro;
  - one section's toggle keeps the keyboard;
  - a collapsed section shows under print media;
  - Collapse all and Expand all keep the keyboard;
  - the fold is kept through a Change;
  - a Change that clears the city, then "Back to summary", lands on 9.1 with 9.2 and 9.3 hidden;
  - the fix brings them back.
- [ ] 4.5 The controller runs `npm run test:browser`, and it passes.

## 5. Docs and the full check (plan Task 5)

- [ ] 5.1 In `docs/developer/frontend.md`:
  - the review gate bullet;
  - `setSummaryShut` in the API list;
  - the `visitedSubsteps` row.

  Update the unit counts in `docs/developer/README.md`, `docs/developer/frontend.md` and `docs/setup.md`.
- [ ] 5.2 Final checks:
  - `npm test`;
  - `npm run build:hant -- --check`;
  - `npm run build:intake` leaves nothing to commit;
  - `npx openspec validate --all`.

  `test:database` and `test:auth-browser` aren't needed: no database or sign-in change.
