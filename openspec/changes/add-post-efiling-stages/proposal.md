## Why

A case stops at E-filed today: nothing records how the return went in or what the IRS and Pennsylvania answered, and a rejected return has nowhere to go. Real clients use ViTally from November 2026, so the office needs to record each return's filing method and answer, send a rejected return back for a fix and a new signature, and see which cases need attention and which are done. Clients should be told, in their language, where each return stands, without reject codes or staff notes. This is lifecycle change 2 of 3. Staff accounts (#90) wait for it.

## What Changes

**Mark e-filed (`MARK_EFILED`)**
- From: one move, Ready to e-file → E-filed, with no payload beyond the confirmation.
- To: it also records each return's method (`federal: efile | paper`, `state: efile | paper`). There are three combinations: both e-filed, federal e-filed and state paper, both paper. A second filing after a rejection asks only for the returns still outstanding, may change their method, and keeps an accepted return.
- Impact: breaking for the RPC payload. `efiled` stays one stage, with three staff names by method (Both e-filed, E-filed & paper, Both paper).

**New: Record filing result** (admin, at E-filed)
- Records each return as its answer arrives:
  - an e-filed return: accepted or rejected, with the acknowledgment date, and a free-text reject code when rejected;
  - a paper return: mailed, with the mailing date.

  It takes an optional fix note when the case is at Rejected or the move takes it there. Notes are append-only and kept with who wrote them and when.
- **Stage rule:**
  - any return rejected → **Rejected**;
  - every return accepted or mailed → **Accepted** (terminal; staff names Accepted, Accepted & mailed, Mailed);
  - otherwise the case stays at E-filed.

**New: Return to signing** (admin, at Rejected)
- Rejected → Ready to exit. Its confirmation box reads "The fix is done.".
- Mark ready to e-file is then offered straight away, and its confirmation says this is a second signing.

**Close**
- From: refused from Ready to exit onward.
- To: also allowed from Rejected. Still refused from Ready to exit, Ready to e-file, E-filed and Accepted.

**Lists and the case page**
- The case pool gains Needs attention (Rejected) and Done (Accepted).
- Follow-ups gains Filing result and Rejected rows. The Signing row reads "Waiting for the client to sign again." after a rejection. Only a return waiting for an e-file acknowledgment is coloured by its wait.
- The case page:
  - the lifecycle bar gains Accepted, with Rejected shown as a mark on E-filed;
  - the office actions panel gains the new buttons;
  - a staff-only Filing panel shows each return's method, result, date, code, and the filing's fix notes in order;
  - "Your next step" gets new text for each new stage.

**The client**
- The stepper: Rejected stays on Filing; Accepted completes all five steps.
- Messages are built from one sentence per return, plus a closing sentence by stage. Accepted names "Where's My Refund?" and myPATH as plain text.
- Ready to exit gets a re-sign message after Return to signing.
- New history lines and labels (Needs a correction, Complete, Filed, Mailed), in English and 简体, with 繁體 generated.
- The client never sees a reject code or the fix note.

**Samples:** two new scenarios, `rejected` (federal accepted, state rejected) and `accepted`. No row is migrated. The browser story walks the class's case through the whole loop.

**Out of scope:**
- the amendment loop, reassignment, and importing TaxSlayer's acknowledgment report. This narrows the archived brainstorm's Q1 and its line 226;
- a plain-language rejection reason for the client;
- an online sample case (a test-backfill PR);
- everything in change 3;
- staff accounts (#90).

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `case-lifecycle`:
  - the stage table and moves, with the new stages, moves and close rule;
  - Mark e-filed's method and second filing;
  - the stage names and the client's stepper;
  - the lists and the case page;
  - the client messages and history lines;
  - ADDED requirements for Record filing result and Return to signing.

  `office-follow-up` was checked and is unchanged: its follow-up tasks aren't touched.

## Impact

- **Database:** one new migration, `035_post_efiling_stages.sql`:
  - the stage check constraint gains `rejected` and `accepted`;
  - storage for each return's method and results (`filing_attempts`, `filing_returns`), and an append-only `filing_notes` table, all readable by staff only;
  - new `act_mark_efiled`, new actions for the filing result and Return to signing, and `act_close_case`;
  - `check_payload` and `fixture_history` (from 034);
  - `act_mark_ready_to_efile` and `apply_fixture_scenario` (from 033);
  - `check_operation_authority` and `vitally_apply_action` (from 032);
  - `fixture_keys` and `checkpoint_scenario` (from 009).
- **Browser:**
  - `src/contracts.mjs` (stages, actions);
  - `src/domain.mjs`;
  - `src/case-actions.mjs`;
  - `src/admin-views.mjs`, `src/staff-views.mjs`, `src/office-views.mjs`, `src/pool-views.mjs`, `src/client-views.mjs`, `src/views.mjs`;
  - `src/app.mjs`;
  - `src/client-text.mjs` and the generated `src/zh-hant.mjs`.
- **Tests:**
  - the unit suites for those modules and `tests/fixtures/confirm-dialogs.json`;
  - `tests/database-stages.mjs` and the other database suites;
  - the story `tests/browser.mjs`.
- **Docs:**
  - `docs/media/return-lifecycle.svg` and `docs/demo-script.md` (its simulated/real table);
  - `docs/developer/database.md` and `docs/developer/production-roadmap.md` §4;
  - `docs/setup.md`.
- **Unchanged:**
  - the work board's tabs;
  - who may mark ready to e-file or e-filed;
  - the review and follow-up rules;
  - every event already stored.
