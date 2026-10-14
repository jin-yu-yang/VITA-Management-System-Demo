## Why

Step 9 lets a client skip past its alerts. The summary (9.2) and the Submit page (9.3) are always on the rail, so a client can open them, and even tick the confirm box, while required answers are still missing. The summary page itself is one long block: it doesn't say what it's for, its Print and draft buttons sit at the very end, and nothing folds away. The user's review of the intake screen asked for a gate in front of 9.2 and 9.3, and for a summary page that explains itself, puts its tools first and lets each section collapse.

## What Changes

**9.1's Continue**
- From: Continue always moves on to the summary.
- To: Continue is disabled while any alert remains, meaning a missing required answer or an invalid answer. A line next to it reads "Fix the items above to continue." / "请先修正上面的问题，然后继续。". Open documents (warnings) don't block it.
- Reason: the client fixes what blocks Submit before reading the summary.
- Impact: non-breaking. The rule for Submit is unchanged.

**9.2 and 9.3 visibility**
- From: both are always visible.
- To:
  - 9.2 is visible only while there are no alerts;
  - 9.3 is visible only while there are no alerts and after the client has pressed Continue on 9.2.
  - That Continue is saved as a visit to `review.submit`, so another device or a later session keeps it.
  - When an alert comes back, both hide again. A client on either one, or pressing "Back to summary", lands on 9.1. Once the alert is fixed, both come back without another Continue.
- Reason: the user's rule ("only after this, the 9.2 … appears", decision Q2-A).
- Impact: the rail, the "Part n of N" count and the step's "n of total" change with the gate. 9.3's "See the alerts" notice goes, because 9.3 can no longer show with an alert.

**The summary page (9.2)**
- From: the printable block first, then Print and the draft buttons. Nothing collapses.
- To, in this order:
  - a three-paragraph intro;
  - Print and View Draft 13614-C (with the other two draft languages);
  - right-aligned "Expand all" / 全部展开 and "Collapse all" / 全部收起;
  - the sections. Each step's heading toggles its section (`aria-expanded`, named "Show or hide {section}" / 显示或隐藏{section}).
  - Sections start expanded. Their state is kept per window, as the rail's is.
  - Print always prints every section, collapsed ones included.
- Reason: the user's redesign request.
- Impact: client screens only, in English and 简体 (繁體 is generated).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client-intake`: adds requirements for reviewing and submitting:
  - 9.1's Continue waits for the alerts to be fixed;
  - 9.2 and 9.3 appear only after that;
  - the summary's intro, tools and collapsible sections.

  These are new requirements. No existing requirement changes.

## Impact

- **Code:**
  - `src/intake-form.mjs`: the gate in sub-step visibility, and `reviewAlerts`;
  - `src/controller.mjs`: visits passed to every resolve, Continue on 9.2 earning 9.3, `guardSubmit`, and `setSummaryShut`;
  - `src/intake-views.mjs`: the disabled Continue, the summary layout and the section toggles, and 9.3's notice removed;
  - `src/app.mjs`: the panel names, the Expand all and Collapse all actions, and the SUBMIT guard, which now asks the controller (`guardSubmit`);
  - `src/styles.css`;
  - `src/client-text.mjs`, plus the generated `src/zh-hant.mjs`.
- **Tests:**
  - unit tests in `tests/intake-form.test.mjs`, `tests/client-views.test.mjs`, `tests/controller.test.mjs`, `tests/client-language.test.mjs` and `tests/shell.test.mjs`;
  - the story, `tests/browser.mjs` and `tests/support/story-pages.mjs`.
- **Docs:** `docs/developer/` where it describes Step 9 or the unit count.
- **Database, RPCs, row-level security and realtime:** no change, and no migration. Visits already save through the existing `intake_visited`.
- **Staff screens and the office's Add a case:** no change.
