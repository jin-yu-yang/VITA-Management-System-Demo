# Brainstorm: add-post-efiling-stages

Lifecycle change 2, "after E-filed". The design was agreed in the conversation on 2026-10-21, one question at a time, after `/opsx:explore`. This file records it as agreed.

## Background

- Change 1 (`2026-10-19-add-screening-and-efiling-stages`, #91) built the chain Request sent → E-filed. Its brainstorm (Q1) split the lifecycle work into three changes. This is the second. Change 3 (Waiting for documents, Hold, closing reasons, Same day / FSA, withdrawal) comes after it.
- Real staff accounts (#90) wait for this change, so it must not widen into access or permissions.
- Today, E-filed is effectively the end: no move leaves `efiled`, and Close is refused from Ready to exit onward. `act_mark_efiled` (032) only sets the stage.
- The group's diagram (`docs/media/return-lifecycle.svg`) already draws the part after E-filed:

```
                     Ready to e-file
                /          |           \
      Both e-filed   E-filed & paper   Both paper      (1040 / PA-40)
                \          |           /
                     IRS acknowledged
                     /             \
               Accepted           Rejected
              /       \               |
         (closed)  Amendment needed   +--"Once fixed"--> Ready to exit
                        |
              Amendment in progress --------------------> Ready to exit
```

  "(1040 / PA-40)" means the federal and the Pennsylvania return. The three filing kinds are how those two returns were filed, not a fork that comes back together.

- Code facts found in exploration:
  - `hand_to_review` (006) clears `reviewer_id` every time a case goes to review, so "back to the original reviewer" would be new behaviour. Approval keeps `reviewer_id`.
  - Client stage messages are rendered as escaped plain text, and no client text carries a link.
  - The client stepper (`PROGRESS_STEPS`) shows nothing for a stage outside its five steps, and has no "everything done" state.
  - Follow-ups groups rows by kind (`QUEUE_KINDS`) and colours a row amber at 3 days and red at 5.
  - The case page's lifecycle bar (`LIFECYCLE`) takes its labels from the stage alone.
  - The sample scenarios (`fixture_keys`, 009) stop at `review_approved`. The browser story already walks the class's case to E-filed.

## Decisions

**Q1. Scope: narrower than the archived brainstorm.** The archived brainstorm's Q1 put IRS acknowledged, Accepted and Rejected, the amendment loop and the paper branches in change 2. Its open questions (line 226) added "amendments return to the reviewer by default, and an admin may reassign. That's change 2."

The user narrowed it. In:
- the three filing kinds, chosen at Mark e-filed;
- Accepted and Rejected as stages, recorded by an admin with one action whose payload holds the federal and state results, the acknowledgment dates and the reject codes;
- Rejected returns to Ready to exit, as the diagram draws it (the client signs again, the office files again, no new preparation or review pass);
- Accepted as the end;
- the case pool's Needs attention (Rejected) and Done (Accepted) tabs;
- client messages for the new stages.

Out, for a later change:
- **the amendment loop.** PCDC hasn't tracked amendments before, and they happen after the season. Rejected → Ready to exit is the mechanism an amendment will reuse.
- **reassignment.** This is a deliberate departure from the archived brainstorm's line 226.
- **the TaxSlayer acknowledgment report import.**

**Q2. "IRS acknowledged" is not a stage.** In the e-file software, the acknowledgment arrives already saying Accepted or Rejected. A preparer never sees "acknowledged, result unknown". The diagram's "IRS acknowledged" box becomes the wait at E-filed. The acknowledgment date is recorded in the result's payload.

**Q3. One `efiled` stage, with the filing method stored per return.**
- Each return has its own method: `federal: efile | paper`, `state: efile | paper`. It is set at Mark e-filed and shown in that confirmation.
- The confirmation offers only the three combinations PCDC uses: both e-filed; federal e-filed and state paper; both paper.
- The spec's stage table lists `efiled` once, with three staff names derived from the pair: **Both e-filed**, **E-filed & paper**, **Both paper**.
- Rejected over three separate stage keys (`efiled`, `efiled_paper`, `paper`): the result action needs the method after the case has left E-filed, and one stage leaves every `stage === "efiled"` check (pool, Follow-ups, stepper, the Close refusal) as it is.
- **A second Mark e-filed** (after a rejection) offers only the returns still outstanding. It may change their method, for example the PA-40 goes paper after a second rejection. An accepted return is kept and shown read-only. The history keeps the earlier filing.

**Q4. One admin action, "Record filing result", records each return as its answer arrives.**
- It is named "filing result", not "IRS result", because Pennsylvania's Department of Revenue answers the state return.
- For each return still waiting:
  - **an e-filed return:** Accepted or Rejected, with the acknowledgment date. A reject code is required when rejected.
  - **a paper return:** Mailed, with the mailing date.
- **The stage rule:**
  - any return rejected → **Rejected**, straight away;
  - every return accepted or mailed → **Accepted**;
  - otherwise the case stays at **E-filed**.

  A federal rejection doesn't wait for the PA answer.
- After a second filing, the action asks only for the returns not yet accepted or mailed.
- Dates can't be in the future, and can't be earlier than the case's e-filing.
- **Reject codes are free text,** because IRS codes (`IND-031-04`) and PA codes have different formats.
- **When anything is rejected, the action takes an optional fix note:** who fixes the return and how. There is no stage for the fix.
- It has the usual confirmation: names the client and the application ID, says what each return is being recorded as, and has a confirmation box. **No undo,** as for change 1's moves.
- A paper return, once recorded as mailed, needs no further answer.

**Q5. Leaving Rejected: "Return to signing".**
- An admin-only move, Rejected → Ready to exit. It is offered on the case page and on the Rejected row in Follow-ups.
- Its confirmation names the client and the application ID, and its box reads **"The fix is done."**. No undo.
- Back at Ready to exit, **Mark ready to e-file is offered straight away**: the reviewer's call and the office's go-over were met the first time. Its confirmation says this is a **second signing**.
- **Close is allowed from Rejected** (today's Close, with a reason), so a client who can't be reached doesn't stay in Needs attention forever. Close stays refused from Ready to exit, Ready to e-file, E-filed and Accepted.
- **Accepted is terminal:** no move leaves it.
- Rejected over letting Mark ready to e-file run straight from Rejected: the client would never see the re-sign message, and nothing would mark the fix as done.

**Q6. The client's progress page.**
- **Rejected** sits on the Filing step, which stays current, with the Rejected badge. Return to signing makes Signing current again.
- **Accepted** shows all five steps done. This is a new "complete" state: every step gets the check mark, and the screen-reader text says done.
- **The client is never told the reject code or the fix note.** They are told the return needs a correction and that PCDC will contact them. A plain-language reason table is left to a later change, if PCDC wants it.

**Q7. Client wording: one sentence per return.** Each return's state gives one sentence, federal first, then a closing sentence that depends on the stage. When both returns are in the same state, one combined sentence replaces the two. This avoids a table of about 16 fixed messages, and the history lines reuse the same sentences.

The sentences about each return. For the state return, read "Pennsylvania" / "your Pennsylvania return" (宾州 / 宾州税务局 / 您的宾州报税表):

| Return's state | One return (federal shown) | Both, combined |
|---|---|---|
| E-filed, waiting | Your federal return was e-filed. The IRS will confirm whether it is accepted. / 您的联邦报税表已电子递交。国税局会确认是否接受。 | Your federal and Pennsylvania returns were e-filed. The IRS and Pennsylvania will each confirm whether they are accepted. / 您的联邦和宾州报税表已电子递交。国税局和宾州税务局会分别确认是否接受。 |
| Accepted | The IRS accepted your federal return. / 国税局已接受您的联邦报税表。 | The IRS and Pennsylvania accepted your returns. / 国税局和宾州税务局都已接受您的报税表。 |
| Rejected | Your federal return needs a correction before it can be accepted. / 您的联邦报税表需要更正后才能被接受。 | Your federal and Pennsylvania returns need a correction before they can be accepted. / 您的联邦和宾州报税表需要更正后才能被接受。 |
| Mailed | Your federal return was mailed. A reply to a mailed return can take several weeks. / 您的联邦报税表已邮寄。邮寄的报税表可能需要几周才会有回复。 | Your federal and Pennsylvania returns were mailed. A reply to a mailed return can take several weeks. / 您的联邦和宾州报税表已邮寄。邮寄的报税表可能需要几周才会有回复。 |

Closing sentences:

| Stage | English | 简体 |
|---|---|---|
| E-filed | (none) | |
| Rejected | PCDC will contact you about the correction. | PCDC 会就更正事宜联系您。 |
| Accepted | If you are due a refund, you can check on it with "Where's My Refund?" at irs.gov/refunds for your federal return, and with myPATH at mypath.pa.gov for your Pennsylvania return. | 如果您有退税，可以在 irs.gov/refunds 使用 "Where's My Refund?" 查询联邦退税，在 mypath.pa.gov 使用 myPATH 查询宾州退税。（网站为英文页面，可用浏览器翻译） |

- These sentences replace today's E-filed message ("Your return was e-filed. The IRS will confirm whether it is accepted.").
- "If you are due a refund" is deliberate: a client who owes tax gets no refund.
- "Several weeks" is deliberately not a number. The IRS changes its estimates, and a number in the spec goes stale.
- The paper sentences say the return was mailed and that a reply takes weeks, so the client doesn't expect an e-file-speed answer.

**The re-sign message at Ready to exit, after Return to signing,** replaces the signing-plan variant:

| English | 简体 |
|---|---|
| PCDC corrected your return. Please sign it again so PCDC can file it. PCDC will contact you to arrange this. | PCDC 已更正您的报税表。请再次签名，以便 PCDC 递交。PCDC 会联系您安排签名。 |

Without it, the client would see the approval's old variant, including a past appointment. It doesn't name Form 8879, because the return may go to paper on the second filing.

**History lines:**

| Move | English | 简体 |
|---|---|---|
| Mark e-filed, both e-filed | PCDC e-filed your return. (today's line, kept) | PCDC 已电子递交您的报税表。 |
| Mark e-filed, federal e-filed and state paper | PCDC e-filed your federal return and mailed your Pennsylvania return. | PCDC 已电子递交您的联邦报税表，并邮寄了您的宾州报税表。 |
| Mark e-filed, both paper | PCDC mailed your returns. | PCDC 已邮寄您的报税表。 |
| Mark e-filed, second filing of one return | PCDC e-filed your Pennsylvania return. / PCDC mailed your Pennsylvania return. (and the federal equivalents) | PCDC 已电子递交您的宾州报税表。/ PCDC 已邮寄您的宾州报税表。 |
| Record filing result | the Accepted, Rejected or Mailed sentence for each return recorded in that move | |
| Return to signing | PCDC corrected your return. You need to sign it again. | PCDC 已更正您的报税表，您需要再次签名。 |
| Mark ready to e-file, the second time | today's line, kept | |

- The phone-number rule covers every phone number, not only PCDC's. The refund pages are named as plain text, never with a helpline number, and are not made clickable.
- **For the wording review:** keep 宾州 (the intake catalogue uses it, never 宾夕法尼亚州). The existing PCDC / 我们 mix in client text stays as it is; it is not unified here.

**Q8. Names for Accepted.** A paper return never gets an acceptance, so "Accepted" is the wrong word for a mailed return.
- **The key** is `accepted`.
- **Staff names follow the method,** as for `efiled`: **Accepted** (both e-filed), **Accepted & mailed** (one of each), **Mailed** (both paper).
- **Client labels:**
  - `accepted`: **Complete / 已完成**;
  - `rejected`: **Needs a correction / 需要更正**;
  - `efiled`: **E-filed / 已电子递交** (both e-filed), **Filed / 已递交** (one of each), **Mailed / 已邮寄** (both paper).

**Q9. The lists.**
- **Case pool tabs**, in order: All, Intake, Available, Waiting for preparation, Waiting for review, Waiting on client, Filing, **Needs attention** (Rejected), **Done** (Accepted), Closed.
  - Filing keeps Ready to e-file and E-filed, including a case with one return answered.
  - A case after Return to signing is back in Waiting on client.
  - The stage filter lists the new stages.
- **The work board's three tabs are unchanged.**
- **Follow-ups gains two kinds:**

| Kind | Stage | Row text | Button |
|---|---|---|---|
| Filing result | E-filed, both e-filed and waiting | Waiting for the IRS and Pennsylvania. | Record filing result… |
| | E-filed, one return answered | Waiting for Pennsylvania's answer. / Waiting for the IRS's answer. | Record filing result… |
| | E-filed, a paper return not yet recorded as mailed | Record when the Pennsylvania return is mailed. (or "…the federal return…"; "Record when the returns are mailed." for both paper) | Record filing result… |
| Rejected | Rejected | Rejected: contact the client to fix and sign again. Then the fix note, as typed, if there is one. | Return to signing… |
| Signing (existing) | Ready to exit after Return to signing | Waiting for the client to sign again. (instead of "Waiting for the client to sign Form 8879.") | Mark ready to e-file… |

- **Every E-filed case gets a row** from the moment it is filed. The row is the office's to-do for checking acknowledgments. Rejected: showing a row only after 2+ days.
- **Accepted gets no row.** A case whose every return is accepted or mailed leaves the queue.
- **The waiting time counts from the row's last move:** Mark e-filed, or the last result recorded, for Filing result; the rejection, for Rejected.
- **The 3-day / 5-day colouring applies only to a return waiting for an e-file acknowledgment.** The "Record when … mailed" row is never coloured.

**Q10. The case page.**
- **The lifecycle bar:** … Ready to exit, Ready to e-file, E-filed, **Accepted**, Closed.
  - E-filed and Accepted show the case's per-method names, so the bar needs the record, not just the stage.
  - Rejected shows as a mark on E-filed, as Corrections in progress does on Filing in progress.
  - After Return to signing, Ready to exit is current.
- **The office actions panel** holds the new buttons, beside Mark ready to e-file and Mark e-filed:
  - **Mark e-filed…** shows the three combinations on a first filing, and only the outstanding returns on a second;
  - **Record filing result…** at E-filed;
  - **Return to signing…** and Close at Rejected.

  Volunteers see none of these.
- **A Filing panel** for staff only, from E-filed onward. One row per return: method, result, date, reject code. Then the fix note, and any earlier filing attempt.
- **"Your next step":**

| Stage | Text |
|---|---|
| E-filed | The office records the answers from the IRS and Pennsylvania. |
| Rejected | A return was rejected. The office arranges the fix and contacts the client. |
| Accepted | The returns are accepted or mailed. Nothing more is needed here. |

- **The fix note is visible to every staff member who can open the case,** on the case page and in Follow-ups, because it briefs whoever fixes the return (often the original preparer). It does not put the case on a volunteer's work board. The client never sees it.

**Q11. Samples and the browser story.**
- **The story continues the class's case through the whole loop:**
  1. Mark e-filed, both e-filed.
  2. Record filing result: federal accepted, state rejected, with a code and a fix note. (Needs attention, the Rejected row.)
  3. Return to signing. (Waiting on client, the re-sign message.)
  4. Mark ready to e-file, the second signing.
  5. Mark e-filed: only the PA-40 is offered, set to paper; the federal return is shown as accepted.
  6. Record filing result: state mailed. (Done, "Accepted & mailed".)

  It checks the client's messages at three points (one return accepted and one rejected, the re-sign message, and Complete with the refund pages), one of them in 简体.
- **Two new sample scenarios, `rejected` and `accepted`.** They are created on demand like today's six. No existing row is migrated, as in change 1.
  - `rejected` is the mixed case: federal accepted, state rejected.
  - `accepted`: both e-filed and both accepted. (My call; the user didn't specify.)
- **The online sample** (so the story exercises #93's identity check) stays out. It's a test backfill, for a direct PR.

**Q12. Capabilities touched.**
- Only **`case-lifecycle`**. The Follow-ups rows that depend on a case's stage, the Signing row's text included, are defined there, in "The lists and the case page show every stage".
- `office-follow-up` was checked and needs no delta. It covers follow-up tasks (the go-over task, purposes, the "Call the client" row), and this change alters none of them.

## The database

The migration is **035**. It copies the latest definition of each function it redefines:
- from 034: `check_payload`, `act_verify_intake`, `fixture_history`;
- from 033: `act_approve_review`, `act_mark_ready_to_efile` (033:590, not 032's), `act_submit_review`, `act_resubmit_review`, `act_resolve_followup`, `apply_fixture_scenario`;
- from 032: the rest (`act_mark_efiled`, `check_operation_authority`, `vitally_apply_action`, the stage check constraint, and `act_close_case` for Close from Rejected);
- from 009: `fixture_keys` and `checkpoint_scenario`.

If another PR lands its own 035 first, renumber at merge time.

## Design trade-offs

- **No amendment loop.** Accepted is terminal for now. A later amendment change reuses Rejected's return to Ready to exit.
- **No new preparation or review pass after a rejection.** It follows the diagram and keeps the loop short. The cost: the case records nobody making the fix, except through the optional note.
- **No undo** for Record filing result or Return to signing, as with change 1's moves. The confirmation naming the client is the guard.
- **Always sign again after a fix,** even when the IRS rule wouldn't require it. It's simpler and matches the diagram. A move to file again without a new signature can come later.
- **Free-text reject codes.** No validation against IRS or PA lists, because their formats differ.
- **A Follow-ups row for every E-filed case** makes a longer queue in the busy season. The kind filter and the colouring keep it usable.

## Open questions

PCDC's answers are provisional defaults. None blocks the change.

| Question | Owner | Provisional default | Can affect |
|---|---|---|---|
| Does "Both paper" wait at E-filed, or does someone mark it done by hand? Are the three combinations the ones PCDC uses? | PCDC | it waits at E-filed, and mailing is recorded with Record filing result | the payload check, the Follow-ups row |
| Who contacts the client after a rejection? | PCDC | the office | the Rejected row's text, the Rejected client message |
| Who fixes the return? | PCDC (the user is confirming) | the optional fix note on Record filing result | the note's prompt only |
| Does every fix need a new Form 8879? The IRS requires a new signature when the fix changes total income or AGI by more than $50, or total tax, refund or amount owed by more than $14. Check the exact wording against the current Publication 1345 before quoting it. | PCDC | always sign again | a later move, not this change |
| What does a paper return's client sign, and when does PCDC know a return will go to paper? | PCDC | keep today's 8879 wording at Ready to e-file and in Mark ready to e-file's history line | that wording only |
| "Several weeks" or a number for a paper reply? | PCDC | several weeks | one sentence |
| The wording review of all new client text | the group | as drafted | text only |

## Out of scope

| Out | Where it goes |
|---|---|
| The amendment loop | a later change |
| Reassignment of preparer or reviewer | later (roadmap §4), keeping the self-review rule |
| Importing TaxSlayer's acknowledgment report | later |
| A plain-language rejection reason for the client | later, if PCDC wants it |
| Clickable links in client messages | not planned |
| "File again without a new signature" | only if PCDC rejects the default |
| An online sample case in the story | a test-backfill direct PR |
| Waiting for documents, Hold, closing reasons, Same day / FSA, withdrawal | change 3 |
| Staff accounts and permissions | #90 |

## Acceptance

Deliverables:
- migration 035;
- the `case-lifecycle` delta spec;
- the views and the client text (繁體 regenerated with `npm run build:hant`);
- the two samples and the browser story;
- `docs/media/return-lifecycle.svg` and `docs/demo-script.md`'s "What is simulated, and what is real" table updated.

Checks:
- `npm test`;
- `npm run db:migrate:test` + `npm run test:database`;
- `npm run test:browser`;
- `npm run build:hant -- --check`;
- `npx openspec validate --all`.

`npm run test:auth-browser` isn't needed: nothing touches sign-in.

Baseline on `main` (2026-10-20, from #93's verify): unit 1235, database 326, browser story 63 (measured at 1a41cb7; later commits were comments and docs only).

## Revisions after propose (2026-10-21, the user's review)

- **Fix notes are append-only, with audited writes.** A `filing_notes` table (case, attempt, note, recorded by, recorded at) replaces a single note column. The Filing panel lists each filing's notes in order, and the Rejected row shows the latest.
- **A fix note may be added whenever the case is at Rejected or the move takes it there**, not only when the move itself contains a rejection. That covers adding a note while recording the second return's answer at Rejected (design D5).
- **The docs task includes `docs/developer/frontend.md`** (the stages and client labels), which change 1 updated.
