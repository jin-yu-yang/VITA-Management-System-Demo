# Brainstorm: add-screening-and-efiling-stages

Decision log from the explore and brainstorm conversation of 2026-10-16 to 2026-10-18. The user agreed every decision below before propose.

## Background

- **Where this comes from.**
  - Part 3 of the roadmap (`docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md`) and decision D1 of `docs/design/redesign-review.md`: adopt the ~20-stage lifecycle in `docs/media/return-lifecycle.svg`, grouped into board phases.
  - Issue #73's lifecycle checklist, and its 16 Oct sync notes: "for M3, the priority is finishing the basic chain", from Request sent to E-filed. Waiting for documents, Hold, the closing reasons and everything after E-filed are not in this round.
- **Who waits on it.** Issue #85 (the group member's M3 items, target 21 Oct). Its preparer and reviewer questionnaires edit `SUBMIT_REVIEW` and `APPROVE_REVIEW`, and wait for this chain. Its Ready-to-exit client messages build on this change's general sentence.
- **The stage machine today** (a read-only survey, 2026-10-16):
  - **The stages:** 9 of them, in `cases.stage` as a `CHECK` from migration 001 that no later migration altered: `draft`, `received`, `preparation_ready`, `preparing`, `review_ready`, `reviewing`, `corrections_required`, `review_approved`, `closed`.
  - **The transitions:** every one happens inside `vitally_apply_action` (latest in 017), through about 19 actions, each with its own from-stages, to-stage and permission rule (latest authority in 018).
  - **Client numbers:** a trigger (010) assigns one when a case leaves `draft` for anything but `closed`.
  - **The samples:** six seeded sample cases and five checkpoints, each pinned to a stage. `apply_fixture_scenario` is now latest in `031_contact_log.sql` (#88).
  - **The specs:** no canonical spec covers stages.
  - **The tests:** about 400 test lines name stages, and the story walks every transition.
- **Merged since explore started** (on `main` b27643b):
  - #78: confirmation dialogs through one `confirmBody` helper, with `CLOSE_CASE` unchanged;
  - #79: empty states through `emptyState`/`emptyLine`, where a new phase needs a new empty sentence;
  - #82, #86, #87;
  - #88: the contact log, migration 031.
- **The test stack** (`vitally-task2`) is at migration 030. #88's 031 needs applying before this change's 032 can be tried.

## Decision chain

**Q1. The split.** Three changes:
1. **The stage model** (this change).
2. **After E-filed:**
   - IRS acknowledged;
   - Accepted and Rejected;
   - the amendment loop;
   - the paper branches. The `efiled` key stays, and change 2 relabels it "Both e-filed" when it adds "E-filed & paper" and "Both paper".
3. **Waiting on the client and other entries:**
   - Waiting for documents and Hold;
   - the closing reasons;
   - Same day and FSA;
   - client withdrawal.

This one first.

**Q2. Scope of change 1: the chain only** (the user chose (a)). The screening card's real 3–4 checks come as the next small change, once the group answers its questions. Closing stays one Closed.

**Q3. The chain** (the user's clarifications, 2026-10-18):

```
draft -> Request sent -> Screening in progress -> Pending intake / filing
      -> Filing in progress (preparing) [<-> Corrections in progress]
      -> Pending review -> Review in progress -> Ready to exit
      -> Ready to e-file -> E-filed
```

- **Request sent:**
  - today's `received`, after the client submits;
  - the client gets an update shortly after submitting, and should expect PCDC to contact them.
- **Screening in progress:**
  - new;
  - only after Request sent;
  - only admins screen (also called the intake check).
- **Pending intake / filing:** screened, not yet claimed. It's the Available tab.
- **Filing in progress:** a volunteer claimed the case.
- **Pending review** comes after the preparer form (#85, later), and **Review in progress** after a reviewer claims.
- **Ready to exit:**
  - after the reviewer form (#85);
  - then the client signs Form 8879;
  - then **Ready to e-file**, then **E-filed**.
- **Corrections in progress:** kept, though rare.

**Q4. Names.** The stage names are long-standing conventions volunteers understand. The user corrected the diagram's wording:
- "Screening in progress", not "in process";
- "Filing in progress (preparing)";
- "Review in progress".

The diagram (`docs/media/return-lifecycle.svg`) is updated to match.

**Q5. Starting screening.** An admin's first open of a Request sent case marks it Screening in progress, automatically and irreversibly (the user chose this over an explicit, reversible "Start screening" button). Edge rules, all agreed:
1. **What counts as opening:**
   - opening the case page, by any route (the reference link, search, Follow-ups, the pool, a reload or a deep link), while the persona acting is an admin;
   - a presenter switching persona to an admin while the case is open also counts;
   - a volunteer persona starts nothing.
2. **Two admins at once:** the first moves it, and the second's start is idempotent. "Already in Screening in progress" is success, never a refusal in the banner.
3. **Offline:** the case shows Request sent with the connection notice. The start is sent again when the connection returns while the case is open, and no error banner appears for a start that couldn't be sent.
4. **A case the office adds** (Add a case) goes from Submit straight to Screening in progress, with its client message.
5. **The client message on start** is sent once.

**Q6. Who records the last two steps.** Admins only, for both Ready to e-file and E-filed: the signing usually happens with the admins, not volunteers.

**Q7. Confirmation for those two moves** (the user's addition, 2026-10-18):
- **Mark ready to e-file** and **Mark e-filed** each go through #78's confirmation dialog (`confirmBody`).
- The dialog names the client and the application ID, and says what the client will be told. For example: "Mark VT-… as e-filed? The client will be told their return was e-filed."
- There is no undo action. A mis-click on the wrong case is the realistic risk, and each move tells the client something.

**Q8. Stage keys:** keep today's keys and add three (the user chose (a)):

| Key | Stage |
|---|---|
| `received` | Request sent |
| `screening` (new) | Screening in progress |
| `preparation_ready` | Pending intake / filing |
| `preparing` | Filing in progress (preparing) |
| `corrections_required` | Corrections in progress |
| `review_ready` | Pending review |
| `reviewing` | Review in progress |
| `review_approved` | Ready to exit |
| `ready_to_efile` (new) | Ready to e-file |
| `efiled` (new) | E-filed |

- `draft` and `closed` are unchanged.
- No existing row is migrated.
- The spec carries the key-to-label table.

**Q9. The twelve defaults** (all agreed):
1. **Screening:** the automatic start on an admin's first open. `VERIFY_INTAKE`, still with its 4 simulated checks, is allowed only from Screening in progress, and moves the case to Pending intake / filing. A case the office adds goes from Submit to Screening in progress.
2. **The new actions:** `MARK_READY_TO_EFILE` (from Ready to exit) and `MARK_EFILED` (from Ready to e-file), admin-only.
3. **Closing:** `CLOSE_CASE` keeps today's rule. It is allowed from every stage before Ready to exit, so Screening in progress joins, and not from Ready to exit onward.
4. **Work board tabs:** unchanged.
   - Available: Pending intake / filing with no preparer.
   - Waiting for preparation: Filing in progress and Corrections in progress.
   - Waiting for review: Pending review and Review in progress.

   The board's search reaches the rest.
5. **Follow-ups** gains row kinds:
   - Request sent: "New application: open it to start screening."
   - Screening in progress: "Finish screening."
   - Ready to exit: "Waiting for the client to sign Form 8879", with **Mark ready to e-file**.
   - Ready to e-file: **Mark e-filed**.
6. **The case pool's tabs:**

   | Tab | Stages |
   |---|---|
   | Intake | Request sent, Screening in progress |
   | Available | Pending intake / filing, no preparer |
   | Waiting for preparation | Filing in progress, Corrections in progress |
   | Waiting for review | Pending review, Review in progress |
   | Waiting on client | Ready to exit |
   | Filing | Ready to e-file, E-filed |
   | Closed | Closed |

   Needs attention and Done come with change 2.
7. **The case page:**
   - The lifecycle bar shows the 10 main stages, with Corrections in progress as a mark on Filing in progress.
   - The admin's case page covers Screening (`VERIFY_INTAKE`'s form), Ready to exit (**Mark ready to e-file**) and Ready to e-file (**Mark e-filed**). In the design these sit in the admin page's panels (the intake checks and the office actions), since "Your next step" is the volunteer's; a volunteer's next step says what each new stage waits for.
8. **The client's progress stepper**, five steps:

   | Step | Stages |
   |---|---|
   | Intake 登记 | Request sent, Screening in progress |
   | Preparation 准备 | Pending intake / filing, Filing in progress, Corrections in progress |
   | Review 审核 | Pending review, Review in progress |
   | Signing 签名 | Ready to exit |
   | Filing 递交 | Ready to e-file, E-filed |

   Closed shows a closed notice instead of a step.
9. **Client messages:** one sentence per stage, in English and 简体 (繁體 generated), and history lines for the new moves (Q11).
10. **Samples and checkpoints:** unchanged. The six samples keep their stages, and 031's `apply_fixture_scenario` is not redefined.
11. **Spec:** a new capability, `case-lifecycle`, covering:
    - the stages, the key-to-label table, the moves and who makes them;
    - the boards' phases and Follow-ups' rows;
    - the client's stepper, labels and messages.
12. **Migration `032`:** the widened `CHECK`, the new and changed actions, and the client-number trigger checked against `screening`.

**Q10. Client labels.** Clients get their own label where the volunteer convention would puzzle them; staff keep the conventional names:

| Key | Staff label | Client label (en / 简体) |
|---|---|---|
| `received` | Request sent | Sent to PCDC / 已发送给 PCDC |
| `screening` | Screening in progress | Being reviewed / 审核中 |
| `preparation_ready` | Pending intake / filing | Waiting for a volunteer / 等待志愿者 |
| `preparing` | Filing in progress (preparing) | Being prepared / 准备中 |
| `corrections_required` | Corrections in progress | Being corrected / 正在更正 |
| `review_ready` | Pending review | Waiting for review / 等待检查 |
| `reviewing` | Review in progress | Being checked / 检查中 |
| `review_approved` | Ready to exit | Ready to sign / 等待签名 |
| `ready_to_efile` | Ready to e-file | Signed / 已签名 |
| `efiled` | E-filed | E-filed / 已电子递交 |

`draft` and `closed` are unchanged. `screening` shows the client 审核中, so `reviewing` moves to 检查中 to avoid the collision.

**Q11. Client wording** (most accepted as drafted; the user removed every mention of PCDC's phone number, since admins don't always call from it).

**Messages on the client's page** (`stage.<key>.client`):

| Stage | English | 简体 |
|---|---|---|
| Request sent | Your application is with PCDC. The office will review it soon and may call you. | PCDC 已收到您的申请。办公室会尽快查看，并可能致电您。 |
| Screening in progress | PCDC is reviewing your application. We may call you to confirm your information and documents. | PCDC 正在审核您的申请。我们可能会致电您，核对您的信息和文件。 |
| Pending intake / filing | Your application has been checked. It is waiting for a volunteer to start preparing your return. | 您的申请已核对完毕，正在等待志愿者开始准备您的报税表。 |
| Filing in progress | A volunteer is preparing your return. (unchanged) | 报税志愿者正在准备您的报税表。(unchanged) |
| Corrections in progress | (unchanged) | (unchanged) |
| Pending review | Your return is prepared and is waiting for an independent reviewer. | 您的报税表已准备好，正在等待审核志愿者检查。 |
| Review in progress | An independent reviewer is checking your return. (unchanged) | (unchanged) |
| Ready to exit | Your return has been checked. PCDC will contact you to sign Form 8879, which is needed before your return can be filed. | 您的报税表已检查完毕。PCDC 会联系您签署 8879 表，签署后才能递交报税表。 |
| Ready to e-file | You signed Form 8879. PCDC will e-file your return next. | 您已签署 8879 表。PCDC 接下来会以电子方式递交您的报税表。 |
| E-filed | Your return was e-filed. The IRS will confirm whether it is accepted. | 您的报税表已电子递交。国税局会确认是否接受。 |

The Ready to exit sentence is the general one #85 will vary later.

**History lines for the new moves** (written by the database, translated by `SENTENCES`):

| Move | English | 简体 |
|---|---|---|
| Start screening | PCDC started reviewing your application. We may call you. | PCDC 已开始审核您的申请。我们可能会致电您。 |
| Mark ready to e-file | PCDC recorded that you signed Form 8879. Your return is ready to e-file. | PCDC 已记录您签署了 8879 表。您的报税表可以电子递交了。 |
| Mark e-filed | PCDC e-filed your return. | PCDC 已电子递交您的报税表。 |

- The existing history lines stay word for word, so old rows keep their translations. These include Submit's "Application received. A volunteer will check your information and documents." and `VERIFY_INTAKE`'s "Simulated intake checks are recorded…".
- **The stepper:** Intake 登记 · Preparation 准备 · Review 审核 · Signing 签名 · Filing 递交. "Next steps 后续步骤" goes away.
- **Staff-only text** (English): the Follow-ups row sentences above, and the buttons **Mark ready to e-file** and **Mark e-filed**.

**Q12. The reviewer's call with the client, and Mark ready to e-file.** Raised by the artifact recheck.
- **The user's flow:** Review in progress → (the reviewer reaches out to the client and completes the reviewer form: questionnaires, call log, the original exit form; Issue #85) → Ready to exit → (the admin confirms the auto-filled exit form, and the client signs Form 8879) → Ready to e-file. So the call is done before Ready to exit.
- **Today's code** records the call after approval, at Ready to exit (`RECORD_REVIEW_CONTACT`, allowed only at `review_approved`; the approved review's `client_contact_status` starts `pending`). #85 moves it into the reviewer form, before approval.
- **Decision:** Mark ready to e-file waits until the approved review's call is recorded (`client_contact_status = 'completed'`). Until then, the admin sees "The reviewer still needs to record the conversation with the client." in place of the button, and the Follow-ups signing row's description reads "Waiting for the reviewer's call with the client." instead of "Waiting for the client to sign Form 8879." Once #85 lands, this check is always already met. Confirming the auto-filled exit form is #85's.

## Design trade-offs

- **An irreversible start on open.** The user preferred the original idea (opening marks screening) over an explicit reversible button. It costs a mis-click's reversibility: an admin who opens the wrong case starts its screening, and the client is told. Accepted: only admins trigger it, and screening is the admin's next job anyway.
- **Keeping keys whose names differ from the labels.** `received` means "Request sent". Accepted: no row migration, a smaller diff, and less collision with #85. The spec holds the mapping.
- **No undo for the e-file moves.** A confirmation dialog naming the client is the guard instead.

## Open questions

- **The screening checks** for the next small change. Owner: the group. It doesn't affect this change.
  - Is "basic documents" optional for cases added by volunteers (often carried over from last year, without a photo ID yet)?
  - Is "I matched the client's face to their photo ID" (online only) the fourth check?
- **Amendments** return to the reviewer by default, and an admin may reassign. That's change 2.
- **The wording review** of all new client text. Owner: the group. Text only.
