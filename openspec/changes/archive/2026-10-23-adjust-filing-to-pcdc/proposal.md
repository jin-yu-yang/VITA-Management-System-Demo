## Why

Changes 2 and 3 (#95, #96) built filing and closing on provisional defaults while PCDC's answers were pending. PCDC has now answered.
- **A paper return.** PCDC never mails one. It gives the printed return to the client (or to someone they send), who signs it if they haven't yet and mails it themselves. So the paper return is done at that handover.
- **Combinations.** All four are used.
- **Signing.** A paper client may sign at PCDC or not at all, so the signing text mustn't promise Form 8879.
- **Reply time.** A paper reply takes about 3 months.
- **Unsigned cases.** Clients who never come back to sign are closed together at season end.

The rejection contact, the fixer and the re-signing defaults are confirmed. Nothing is hosted yet (Task 10B), so 035's stored values can still be renamed now.

## What Changes

**A paper return is done when it is given to the client**
- From: Mark e-filed set the methods. A paper return waited at E-filed until an admin recorded it as `mailed` with a date in Record filing result.
- To:
  - **At Mark e-filed.** It records each paper return as `given_to_client`, with no date, and the case goes to Accepted when every return has its answer. So both paper goes Ready to e-file → Accepted in one move.
  - **Record filing result.** It takes only `accepted` and `rejected`.
  - **Rename.** The result value `mailed` is renamed `given_to_client` everywhere. Stored `mailed` values are renamed in 037.
  - **Removed.** The staff wording for the mailing wait goes from the code and the specs: the Follow-ups sentences, the Filing panel line, the return-to-signing refusal and the "Date mailed" field.
- Reason: PCDC hands the paper return over and never learns the mailing date.
- Impact: breaking for the `RECORD_FILING_RESULT` payload and the stored result value. Cases filed under 035 whose paper return still waits are left as they are. They exist only on local stacks, and a sample reset clears them.

**All four filing combinations**
- From: three pairs. Federal paper with state e-file was refused.
- To:
  - **The pairs.** All four are accepted, and the second filing's "used pair" rule is removed.
  - **Staff names.**
    - E-filed: Both e-filed / E-filed, PA on paper / E-filed, federal on paper.
    - Accepted: Accepted / Accepted, PA on paper / Accepted, federal on paper / Paper.
  - **The Mark e-filed dialog.** It offers the four pairs, saying "on paper (given to the client to mail)".
  - **Client badges.**
    - E-filed: "Filed / 已递交" for both mixed pairs.
    - Accepted: **"Ready to mail / 待邮寄"** when any return is on paper, otherwise "Complete".
- Impact: non-breaking for stored data. The `MARK_EFILED` payload accepts one more pair.

**Client text for paper returns and signing**
- **The handover sentences** replace the Mailed sentences, as instructions: "PCDC gave your … return on paper to you or the person you sent. If it isn't signed yet, sign it, then mail it yourself. A reply can take about 3 months after you mail it."
- **Mark e-filed's history line** says the same.
- **The signing messages are neutral.** "Sign your return", not "sign Form 8879". The Customer Portal variant keeps 8879.
- **Ready to e-file** reads "Your return is ready. PCDC will take the next step.", with the badge "Ready / 已准备好".
- **Mark ready to e-file's history line** reads "PCDC recorded that your return is ready. PCDC will take the next step."
- **Staff wording** follows: Mark ready to e-file's box, the Follow-ups and Hold lines, and the staff history.
- History lines already stored keep their words and 简体. 繁體 is regenerated.

**New: close unsigned cases at season end**
- **What.** An admin action on Follow-ups, "Close unsigned cases…", backed by a new RPC, `vitally_close_unsigned`.
- **Which cases.** It lists every case at Ready to exit or on a Hold from Ready to exit, each with its stage and days waited, ticked by default.
- **The move.** It closes the ticked cases as Dismissed in one all-or-nothing transaction: one event and one client line per case.
- **The TaxSlayer notice.** None per case. The admin's confirmation box asserts that none of these returns will be transmitted.

**Confirmed defaults, aligned text**
- **Confirmed and unchanged:** the office contacts the client after a rejection, and every fix is signed again.
- **The fix-note prompt** becomes role-neutral ("what needs fixing in TaxSlayer").
- **"Site coordinator"** replaces "preparer" in the volunteer's next step at Rejected and in the sample, story and fixture notes.

**Samples and story**
- The `rejected` and `accepted` samples take the new Mark ready to e-file line, and `rejected` takes the new fix note. There is no new sample.
- Story step 5 files the PA-40 on paper and lands at Accepted at once.
- A final story step runs the season-end close.

**Out of scope:** #58 (the footer; its text is confirmed there), amendments, reassignment, the TaxSlayer report import, #90, a season-end close of document waits, a field for who collected a paper return, a paper sample, and migrating stuck 035 paper cases.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `case-lifecycle`: a paper return is given to the client at Mark e-filed (`given_to_client`, no date). It also covers the four filing pairs and their staff names, Record filing result without mailed, the client badges ("Ready", "Ready to mail"), the neutral signing messages, the handover sentences and history lines, the Follow-ups rows that lose the mailing wait, the fix-note prompt and the volunteer's next step, and the new season-end close of unsigned cases.
- `office-follow-up`: the season-end close opens no `withdrawal_notice`. The individual close of a signing Hold still does.
- `review-and-corrections`: the go-over scenario's Follow-ups row reads "Waiting for the client to sign.".

## Impact

- **Database.** New migration `037_adjust_filing_to_pcdc.sql`. It covers:
  - the `cases_filing_methods`, `cases_filing_results` and `filing_returns.result` checks, and the rename of stored `mailed`;
  - `check_payload`, `act_mark_efiled`, `act_record_filing_result`, `filing_line`, `efiled_line`, `act_mark_ready_to_efile`, `check_operation_authority` and `vitally_apply_action` where needed;
  - the new `public.vitally_close_unsigned`;
  - `fixture_history` and `apply_fixture_scenario`.

  Each is copied from its newest definition.
- **Browser.** `src/domain.mjs`, `src/client-text.mjs` (and the regenerated `src/zh-hant.mjs`), `src/admin-views.mjs`, `src/office-views.mjs`, `src/staff-views.mjs`, `src/case-actions.mjs`, `src/supabase-store.mjs`, and the controller and app wiring for the new action.
- **Tests.**
  - Unit: domain, admin-views, office-views, case-actions, client-views, client-language, staff-views.
  - Database: database-filing, database-fixtures, database-stages, and a new database-season-close.
  - Browser: the story.
- **Docs.** `docs/media/return-lifecycle.svg` (the paper branch labels), `docs/demo-script.md`, `docs/developer/database.md`, `docs/developer/frontend.md`.
- **Not touched.** RLS policies, realtime channels and sign-in. The new RPC is admin-only and goes through the same membership and authority checks.
