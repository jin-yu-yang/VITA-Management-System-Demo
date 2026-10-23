## Context

- **The two changes this adjusts.** Migration 035 (`add-post-efiling-stages`) added the filing methods and results, Record filing result, Rejected and Accepted. Migration 036 (`add-hold-and-closing`) added Hold, closing reasons and the TaxSlayer `withdrawal_notice`. Both left PCDC questions open, with provisional defaults.
- **PCDC's answers.** The user, PCDC's contact, brought them; the full table is in `brainstorm.md`. The answer that matters most: **PCDC never mails a return.** It gives the printed paper return to the client, or to someone they send. The client signs it if they haven't yet, and mails it. PCDC doesn't know when.
- **The code as it stands:**
  - a paper return waits at E-filed until Record filing result records `mailed` with a date;
  - `cases_filing_methods` refuses federal paper with state e-file;
  - the signing text names Form 8879 throughout;
  - closing an unsigned client is one case at a time, from a signing Hold, and opens a TaxSlayer notice.
- **Constraints:**
  - Migrations are final once applied: 037 is new, and each function it redefines is copied from its newest definition, with only the marked lines changed (the 035/036 convention).
  - No hosted project exists yet (README, Task 10B). 035 and 036 have run only on local test stacks with demo data, and a sample reset clears any stuck case.
  - Client text is English and 简体, with 繁體 generated. Staff screens are English.
  - History lines already stored keep their words and their 简体.

## Goals / Non-Goals

**Goals:**
- A paper return is done at Mark e-filed, as handed to the client, with no date. The result value is renamed `given_to_client`.
- All four filing pairs, with staff names that say which return is on paper.
- Client text that tells a paper client what to do and doesn't promise Form 8879 or a signature already made. "About 3 months".
- A season-end close of every unsigned case in one all-or-nothing move.
- The confirmed defaults recorded, and the fixer text aligned.
- The samples, the story and the developer docs updated.

**Non-Goals:**
- #58 (the footer), amendments, reassignment, the TaxSlayer report import, #90.
- A season-end close of document waits.
- A field for who collected a paper return (the contact log covers it).
- A paper sample.
- Moving cases filed under 035 whose paper return still waits.

## Decisions

### D1: The paper result is `given_to_client`, recorded at Mark e-filed with no date
- **Choice.**
  - **At Mark e-filed.** For each paper return in the move, `act_mark_efiled` sets the case's `<kind>_result` and the `filing_returns` row's `result` to `given_to_client`, with `answered_on` null and `recorded_by` = the filer. The stage is then computed as Record filing result computes it:
    - `accepted` when every filed return has `accepted` or `given_to_client`;
    - otherwise `efiled`.
  - **Both paper**, and a second filing that completes the pair, go straight to Accepted.
  - **The constraints.** `cases_filing_results` and the `filing_returns.result` check become `in ('accepted','rejected','given_to_client')`, with `given_to_client` tied to `paper` as `mailed` was.
- **Why.** PCDC hands the paper return over and doesn't learn the mailing date. A date would be invented.
- **Alternatives.** Keep `mailed` with today's date: rejected, because it misnames what happened and records a false date. Keep the two-step path: rejected, because PCDC doesn't follow paper returns up.

### D2: Record filing result takes only e-filed answers
- **Choice.** `check_payload` accepts `result` in `('accepted','rejected')`. Anything else is refused with `VALIDATION`. The handler's method-fit check reduces to "the return was e-filed".
- **Removed from the staff screens:**
  - the "Record when … mailed" Follow-ups sentences;
  - the mailing-row colour exemption;
  - "Waiting for the mailing to be recorded";
  - the paper branch of the return-to-signing refusal;
  - the Mailed option and "Date mailed".
- **Why.** A paper return always has its answer from Mark e-filed on.

### D3: Cases filed under 035: rename what is stored, leave what is waiting
- **Choice.**
  - **The rename.** Before re-adding the checks, 037 updates stored values: `mailed` becomes `given_to_client` in `cases.federal_result`, `cases.state_result` and `filing_returns.result`, and those `filing_returns` rows get a null `answered_on`. No stage moves, and no event or client line is written.
  - **Paper returns still waiting** (result null) are left alone (the brainstorm's option C).
  - **The views** treat any paper return as answered, so a stuck case renders without errors:
    - `waitingReturns` and the Follow-ups sentences count only e-filed returns without a result;
    - `returnState` reports any paper return as `given_to_client`.

  037's header and this design say why: nothing is hosted, and a sample reset clears the stuck cases.
- **Why.** The checks can't be added while `mailed` values exist, and local stacks that ran the story have them.
- **Alternatives.** Backfill the waiting returns with events (option A), or keep the old path for old cases (option B): both rejected by the user. Both would keep code or data work for cases that exist only on test stacks.

### D4: All four pairs; the used-pair rule goes
- **Choice.**
  - **The constraint.** `cases_filing_methods` loses `not (federal_method='paper' and state_method='efile')`.
  - **The handler.** `act_mark_efiled` loses that refusal in the first filing, and the second filing's "resulting pair must be a used one" check. The second filing still names exactly the rejected returns.
  - **Domain.** `filingMethodKind` gains `paper_and_efile`.
  - **The signing plan.** No check on it: paper is allowed after a Customer Portal plan.
- **Why.** PCDC uses all four. With every pair allowed, the used-pair rule can never fail.

### D5: Names by method
- **Choice.** `METHOD_LABELS` in `domain.mjs`:

  | Kind | E-filed staff / client | Accepted staff / client |
  |---|---|---|
  | `both_efile` | Both e-filed / E-filed | Accepted / Complete |
  | `efile_and_paper` | E-filed, PA on paper / Filed | Accepted, PA on paper / Ready to mail |
  | `paper_and_efile` | E-filed, federal on paper / Filed | Accepted, federal on paper / Ready to mail |
  | `both_paper` | (not reached) | Paper / Ready to mail |

  Other client labels:
  - `stage.accepted.paper.label` = "Ready to mail / 待邮寄". It's new; the stepper is unchanged.
  - `stage.ready_to_efile.label` becomes "Ready / 已准备好".
  - `stage.efiled.mailed.label` is removed.
- **Why.** Each name says which return went on paper. "Complete" would mislead a client who still has to mail a return.
- **Alternatives.** "Fed e-filed · PA paper": rejected for consistency with the stage-word-first pattern.

### D6: The Mark e-filed dialog and its client lines
- **Choice.**
  - **Choices.** Four first-filing choices, in the order both e-filed; fed e-filed and PA on paper; fed on paper and PA e-filed; both on paper. Each paper choice says "on paper (given to the client to mail)". The second filing's per-return choice is "On paper (given to the client to mail)", and a done return reads "…: on paper, given to the client."
  - **The box.** "Each return was e-filed, or given to the client on paper, as chosen above."
  - **`efiled_line`.** It writes the handover wording, with the instruction and "about 3 months" once (the brainstorm's Q4 tables). The dialog's `FILED_LINES` mirrors it.
  - **One client line per action.** When Mark e-filed lands at Accepted, it writes only the `efiled_line`. The status panel carries the per-return and refund sentences.

### D7: The status-panel sentences
- **Choice.**
  - `filing.{federal,state,both}.mailed` become `filing.*.given_to_client`, with the handover instruction sentences, and `filing_line` takes `'given_to_client'`.
  - `filingMessage` is unchanged in shape: it gives the per-return sentences, then the stage's closing sentence. So Accepted with a paper return shows the instruction, then the refund sentence.
- **Legacy translations.** Old stored lines keep their 简体. `filingLines()` builds the history map from the current sentence table *and* a frozen legacy table of 035's mailed sentences, and the old `efiled_line` mailed lines stay in the map as literals.

### D8: Neutral signing text
- **Choice.** The eight client strings and the staff strings from the brainstorm's Q3 are replaced. The Customer Portal variant and the reviewer questionnaire keep 8879.
  - `act_mark_ready_to_efile`'s message (newest in 033) becomes "PCDC recorded that your return is ready. PCDC will take the next step."
  - The old line stays in the history map.
- **Why.** The method is unknown at signing, and a paper client may not sign at PCDC at all.
- **Alternatives.** Choose the method at Mark ready to e-file (it fixes two strings and adds a choice), or keep the 8879 wording: both rejected.

### D9: `vitally_close_unsigned`, a separate admin RPC
- **Signature.** `public.vitally_close_unsigned(p_action_id uuid, p_person_id uuid, p_cases jsonb, p_confirmed boolean) returns jsonb`. `p_cases` is `[{caseId, revision}, …]`, the ticked list.
- **Checks, in order:**
  1. Membership (`require_membership`), and the person must hold `admin`. Otherwise `FORBIDDEN`.
  2. The envelope: `p_confirmed` is true, and the list holds 1 to N distinct IDs. Otherwise `VALIDATION`.
  3. The digest and `reserve_receipt`. An identical replay returns the stored receipt.
- **The move:**
  1. Lock every listed case in ID order, each through `lock_case`, which also checks it's in the member's workspace.
  2. If any revision differs, or any case is neither `review_approved` nor `on_hold` with `hold_origin='review_approved'`, refuse with `CONFLICT`. Nothing changes.
  3. For each case:
     - `close_case_steps(case,'dismissed')`;
     - a `case_events` row `CLOSE_CASE` with `{"reason":"dismissed","seasonEnd":true}`;
     - a `client_events` row with `closed_line('dismissed')`;
     - a revision bump with `updated_at`, as `commit_action` does.
  4. Store the receipt `{actionId, cases:[{caseId, reference, revision}]}`, with `target_id` and `target_reference` null (nullable since 001).
- **No `withdrawal_notice`.**
- **Why a separate RPC.**
  - `vitally_apply_action` is one case per call.
  - A browser loop would need Dismissed allowed at Ready to exit for every close, could leave half a season end, and would open a notice per case.
  - `vitally_log_contact` is the precedent for a second public RPC.
- **Browser.**
  - `supabase-store.mjs` gains `closeUnsigned(request)`.
  - The controller gains `closeUnsigned(cases)`, which applies each returned revision. On `CONFLICT`, it re-reads and reopens the dialog with the new list.
  - Realtime carries each case's row change, as for any close.

### D10: The season-end dialog
- **The button.** An admin-only "Close unsigned cases…" at the top of Follow-ups. It's disabled, with "No case is waiting for a signature.", when the list is empty.
- **The list.** One row per case at Ready to exit, or on a Hold from Ready to exit, oldest wait first. Each row shows:
  - a checkbox, ticked;
  - the reference;
  - the client name;
  - the stage, "Ready to exit" or "Hold";
  - the days waited, from `waitingDays(updatedAt)`, as Follow-ups counts them.
- **The heading.** "Close {ticked} of {total} cases that are waiting for a signature, as Dismissed?", updated as boxes change. When every case is ticked: "Close {n} cases…".
- **The confirmation box.** "These clients didn't come back to sign. None of these returns will be transmitted in TaxSlayer."
- **Confirm** is disabled when nothing is ticked or the box isn't ticked.
- **Staff history:** "closed the case at season end · Dismissed".

### D11: Fixer text
- **Choice.**
  - The fix-note prompt: "Fix note (only when a return is rejected): what needs fixing in TaxSlayer".
  - The volunteer's next step at Rejected: "A return was rejected. The site coordinator fixes it in TaxSlayer, and the office contacts the client."
  - The sample note: "Fictional note: site coordinator to correct the dependent's SSN in TaxSlayer."
  - The story and unit notes: "Site coordinator to correct…".
- **Why.** The prompt stays role-neutral because who does the fix may change.

### D12: Migration 037 copies the newest definitions
- **Choice.** One file, `037_adjust_filing_to_pcdc.sql`. Its header has a table naming, for each function, the migration it's copied from and what changes. Lines that change are marked `-- 037`. The header also states D3.

  | Function | Copied from |
  |---|---|
  | `check_payload` | 036 |
  | `act_mark_efiled` | 035 |
  | `act_record_filing_result` | 035 |
  | `filing_line` | 035 |
  | `efiled_line` | 035 |
  | `act_mark_ready_to_efile` | 033 |
  | `fixture_history` | 036 |
  | `apply_fixture_scenario` | 036 |

  - New functions: `public.vitally_close_unsigned`, plus a private per-case helper if the builder wants one.
  - `check_operation_authority` and `vitally_apply_action` need no change, because the new action doesn't go through them.
  - The file is safe to re-apply (`create or replace`, drop-then-add constraints, and an idempotent rename).

## Risks / Trade-offs

- [Risk] A stack carries a case at E-filed whose paper return still waits. → Mitigation: the views treat a paper return as answered, so it renders. A sample reset clears it. Nothing is hosted.
- [Risk] The season-end move closes cases an admin didn't mean to close. → Mitigation: per-case boxes, a stated count, the confirmation box, and all-or-nothing against the revisions shown.
- [Risk] A long list conflicts often while other admins work. → Mitigation: the dialog re-reads and reopens with the current list. Season end is a quiet moment.
- [Trade-off] No per-case TaxSlayer notice after the season-end close. → Accepted: the admin asserts it once. The IRS still takes e-files in autumn, so it's an office promise, not a technical guarantee.
- [Trade-off] Customer Portal keeps "Form 8879" even if the return later goes on paper. → Accepted: the handover sentence tells the client to sign the paper return if it isn't signed.
- [Trade-off] Five scenario names in the `case-lifecycle` delta keep their old names with new content ("A combination PCDC doesn't use", "A mailing row is never coloured", "A case approved before this change", "Mailed", "A paper return is mailed, not accepted"). → Accepted: the OpenSpec validator won't drop a scenario from a modified requirement.
- [Risk] The 简体 drafts aren't yet reviewed. → Mitigation: the group's wording review (Open Questions). The text can change by direct PR.

## Migration Plan

1. Apply 037 on the local test stack: `npm run db:migrate:test`. It renames stored `mailed`, re-adds the checks and redefines the functions.
2. Reset the samples to pick up the new histories and fix note.
3. Rollback: none needed for a demo with no hosted project. A new migration would revert. The local stack can be rebuilt from migrations.
4. Acceptance:
   - `npm test`;
   - `npm run test:database` (with `database-season-close`);
   - `npm run test:browser`;
   - `npm run build:hant -- --check`;
   - `npx openspec validate --all`.

   Each count is at or above the baseline (unit 1317, database 408, browser story 75), except where a test removed with the old paper path is replaced.

## Open Questions

| Question | Owner | Default | Can affect |
|---|---|---|---|
| The wording review of all new client text, the 简体 drafts included | the group | as drafted in `brainstorm.md` | text only |
