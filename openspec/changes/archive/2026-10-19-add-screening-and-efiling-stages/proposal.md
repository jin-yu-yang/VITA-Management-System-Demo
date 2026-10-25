## Why

ViTally's nine stages end at "review approved", and an admin's intake check happens on a case nobody can tell is being worked on. PCDC's real lifecycle has a screening step, and signing and e-filing after review. Real clients use ViTally from November 2026, and the group's M3 work (#85, the preparer and reviewer questionnaires) waits on this chain. This change is the first of three lifecycle changes. It builds the main chain from Request sent to E-filed, with clients told at each step in their own words.

## What Changes

**Screening**
- From: a submitted case (`received`) waits for an admin's intake check with no visible start.
- To: an admin's first open of a Request sent case moves it to **Screening in progress** (new), automatically and once, and tells the client PCDC is reviewing their application. The intake check (`VERIFY_INTAKE`, still with its four simulated checks) is allowed only from Screening in progress. A case the office adds goes straight from Submit to Screening in progress.
- Impact: a new stage and action; the intake check's from-stage changes.

**Signing and e-filing**
- From: the chain ends at Ready to exit (`review_approved`).
- To: admins mark **Ready to e-file** (the client signed Form 8879) and then **E-filed**, each behind a confirmation dialog naming the client and the application ID. There is no undo. Ready to e-file waits until the reviewer's call with the client is recorded.
- Impact: two new stages and two admin-only actions.

**Stage names and what people see**
- Staff see the conventional names: Request sent, Screening in progress, Pending intake / filing, Filing in progress (preparing), Corrections in progress, Pending review, Review in progress, Ready to exit, Ready to e-file, E-filed.
- Clients get their own labels, and a five-step progress stepper (Intake, Preparation, Review, Signing, Filing). They also get new stage messages and history lines in English and 简体 (繁體 generated). PCDC's phone number appears nowhere.
- The work board's tabs are unchanged. The case pool gains Waiting on client and Filing tabs, its Intake tab gains Screening in progress, and its Done tab goes until change 2. Follow-ups gains rows for new applications, screening, signing and e-filing. The case page's lifecycle bar and "Your next step" cover the new stages.
- `docs/media/return-lifecycle.svg` reads "Screening / Filing / Review in progress".

**Kept as it is**
- The stage keys in the database. `received` still means Request sent, and three keys are added: `screening`, `ready_to_efile`, `efiled`.
- No existing case row is migrated. The six sample cases and the checkpoints are unchanged.
- Closing keeps one Closed, allowed from every stage before Ready to exit.

Out of scope: the screening card's real checks (the next small change), the closing reasons, Waiting for documents and Hold (change 3), everything after E-filed (change 2), and #85's questionnaires.

## Capabilities

### New Capabilities
- `case-lifecycle`: the stages a case moves through, their keys and labels (staff and client), the moves between them and who may make each one, and how the work board, the case pool, Follow-ups, the case page and the client's progress page show them.

### Modified Capabilities
- None. `staff-case-work` and `client-intake` keep their requirements; no existing requirement specifies stages.

## Impact

- **Database:** migration `032` (after #88's 031):
  - the widened stage `CHECK`;
  - `START_SCREENING`, `MARK_READY_TO_EFILE` and `MARK_EFILED`, with their authority, payload and handlers;
  - `VERIFY_INTAKE` from `screening`;
  - `act_submit`'s office branch to `screening`;
  - `CLOSE_CASE` including `screening`;
  - the client-number trigger checked against the new stages.
- **Code:**
  - `src/contracts.mjs`, `src/domain.mjs` (labels, client labels, phases), `src/ui.mjs` (badges);
  - `src/staff-views.mjs`, `src/admin-views.mjs`, `src/office-views.mjs` and `src/pool-views.mjs` (tabs, rows, next step, lifecycle bar), `src/client-views.mjs` (stepper, labels);
  - `src/client-text.mjs` and the generated `src/zh-hant.mjs`;
  - `src/case-actions.mjs` (the payload builders), `src/views.mjs` (the two dialogs) and `src/styles.css` (the new Follow-ups pills);
  - `src/supabase-store.mjs` (the case list's review-call summary, for Follow-ups);
  - `src/controller.mjs` (the start on open) and `src/app.mjs` (the confirmations).
- **Tests:** unit, database (the new transitions and refusals) and the story (screening on open, and signing and e-filing).
- **Docs:** `docs/media/return-lifecycle.svg`, and `docs/developer/` (database, frontend).
- **Downstream:** #85 builds on this change's `SUBMIT_REVIEW`/`APPROVE_REVIEW` and its Ready to exit message.
