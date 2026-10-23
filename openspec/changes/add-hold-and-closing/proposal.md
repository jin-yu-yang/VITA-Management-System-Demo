## Why

The office can't ask a client for missing documents at intake, so a failed screening check has nowhere to go (#85 item 4). A client who stops answering, before preparation or at signing, has no state, and a signer who disappears stays at Ready to exit for ever. Close takes only free text, and the client always reads the same sentence. A client can't withdraw their own application. This is lifecycle change 3 of 3. It follows the group's diagram, and it doesn't widen anyone's access while staff accounts (#90) are pending.

## What Changes

**New stages: Waiting for documents and Hold**
- **Waiting for documents** (`awaiting_documents`) is reached by the office's new "Ask for documents…" move, from Screening in progress or Pending intake / filing. The move creates one or more document requests. Verifying the last open request returns the case automatically to where it came from.
- **Hold** (`on_hold`) is reached by "Put on hold…", from Waiting for documents or from Ready to exit. "Got in touch…" returns the case to where it came from. Verifying the last request also ends a documents hold.
- The preparer's own document loop during preparation is unchanged.

**Close**
- From: one admin move with a free-text reason, refused from Ready to exit onward; one generic client message.
- To:
  - **Reasons:** a required reason (`out_of_scope`, `no_need_to_file`, `duplicate`, `dismissed`, `withdrawn`, `other`) stored on the case, and an optional staff note (required for `other`).
  - **Where:** also allowed from Waiting for documents and from Hold, including a Hold at signing (reason Dismissed).
  - **What the client reads:** a closed message per reason. Cases closed before this change keep the generic message.
- Impact: breaking for the `CLOSE_CASE` payload.

**New: the client withdraws**
- Withdraw is the client's own action, from Request sent up to Review in progress, behind a confirmation box.
- The case is Closed with reason `withdrawn`. There's no undo.
- From Ready to exit on, the client is told to contact PCDC.
- If a preparer or reviewer was working on the case, the office gets a Follow-ups row: "The client withdrew; tell <name> to stop work."

**Lists and the case page**
- The pool: Waiting for documents under Waiting on client, Hold under Needs attention, and a reason filter on Closed.
- Follow-ups gains rows for Waiting for documents (coloured by days), Hold (not coloured) and the withdrawal notice.
- The case page gains the new office actions and lifecycle-bar marks.
- The client: badges, messages, stepper placement, and the withdrawal button and dialog, in English and 简体 (繁體 generated).

**Samples:** two new ones, `on_hold` and `withdrawn`. A reset seeds ten. The story gains two short flows: documents at screening, and a withdrawal.

**Out of scope** (narrowing the archived brainstorm's Q1): Same day ("untracked" in the diagram) and FSA. Also out: a Pending stage during preparation (spec §8.2; a design difference), undo, amendments, reassignment, #90.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `case-lifecycle`:
  - the stage and move tables, and the close rule;
  - names, labels and the stepper;
  - the lists and the case page;
  - the client messages;
  - ADDED requirements for documents at intake, Hold, closing reasons and client withdrawal.
- `office-follow-up`: a new follow-up purpose, the withdrawal notice.
- `client-intake`: a reset seeds ten samples.
- `screen-states`: the close dialog's payload scenario.

## Impact

- **Database:** migration `036_hold_and_closing.sql`:
  - the stage check gains `awaiting_documents` and `on_hold`;
  - `cases` gains `closing_reason`, `documents_origin` and `hold_origin`;
  - the follow-up purpose check gains `withdrawal_notice`;
  - new actions: `REQUEST_DOCUMENTS_AT_INTAKE`, `PUT_ON_HOLD`, `RESUME_FROM_HOLD`, `WITHDRAW`;
  - redefined, from their newest definitions:
    - from 035: `check_payload`, `act_close_case`, `check_operation_authority`, `vitally_apply_action`, `fixture_keys`, `fixture_history`, `apply_fixture_scenario`, `fixture_answers_v2`;
    - from 004: `receive_document`, `act_verify_document`;
    - from 018: `check_authority`;
    - from 033: `act_resolve_followup` and the follow-up purpose check, if needed.
- **Browser:**
  - `src/contracts.mjs`, `src/domain.mjs`, `src/case-actions.mjs`, `src/supabase-store.mjs`;
  - `src/admin-views.mjs`, `src/staff-views.mjs`, `src/office-views.mjs`, `src/pool-views.mjs`, `src/client-views.mjs`, `src/views.mjs`, `src/app.mjs`;
  - `src/client-text.mjs`, and the generated `src/zh-hant.mjs`.
- **Tests:** the unit suites for those modules and the confirm-dialog fixtures; a new `tests/database-hold.mjs` and the existing database suites; the story `tests/browser.mjs`.
- **Docs:** `docs/media/return-lifecycle.svg`, `docs/demo-script.md`, `docs/developer/database.md`, `docs/developer/frontend.md`, `docs/developer/production-roadmap.md` §4, `docs/setup.md`, `README.md`.
- **Unchanged:**
  - the preparer's document loop and `ESCALATE_CONTACT`;
  - the work board;
  - who may claim, review, sign or file;
  - every stored event.
