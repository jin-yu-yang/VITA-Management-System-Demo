# Brainstorm: add-hold-and-closing

Lifecycle change 3, "waiting on the client, closing, and the other entries". The design was agreed in the conversation on 2026-10-22, one question at a time, after `/opsx:explore`. This file records it as agreed.

## Background

- **The split.** The archived brainstorm `2026-10-19-add-screening-and-efiling-stages/brainstorm.md` (Q1) split the lifecycle work into three changes. This is the third: Waiting for documents and Hold; the closing reasons; Same day and FSA; client withdrawal.
  - Change 1 (#91) built Request sent → E-filed.
  - Change 2 (#95, merged) added the filing results, Rejected → Return to signing, and Accepted.
  - Staff accounts (#90) are queued, so this change must not widen access or permissions.
- **The group's diagram** (`docs/media/return-lifecycle.svg`):

```
Request sent -> Screening in progress -> Pending intake / filing ----All good----> Filing in progress ...
                                           |   |   |        ^
                    Out of scope  <--------+   |   |        | "Once submitted"
                    No need to file <----------+   |        |
                    Duplicate <--------------------+   +----+-----------------+
                       (each -> closed)                |  Waiting for documents |
                                  "Missing document(s)"+-----------------------+
                                                         | "Took a long time for the client to respond"
                                                         v                       ^ "Got in touch with the client"
                                                       Hold ---------------------+
                                                         +--> (case closed)
side panel: Any active stage --"Client unreachable"--> Dismissed;  Withdrawn;
            Same day in progress (untracked);  FSA "Self-prep client needs help; no need to prepare"
```

- **`docs/spec.md` §8.2** has a single Pending ("on hold because documents are missing"), reached from InPrepare and InReview and returning to the pool. Its Cancelled covers "out of scope, or the client withdrew at intake". Its CantFindClient ↔ NeedSign is the client who can't be reached to sign. §8.3 lets the client withdraw an application.
- **Code facts:**
  - Document requests are a preparer tool today. `REQUEST_DOCUMENT` works only at Filing in progress or Corrections, by the case's preparer (004:255). The client answers with `RESPOND_DOCUMENT` and the preparer runs `VERIFY_DOCUMENT`.
  - When the client doesn't answer, `ESCALATE_CONTACT` opens an office follow-up (`request_documents`), and `RESOLVE_FOLLOWUP` ends it. The stage never changes and the preparer keeps the case.
  - Close (`act_close_case`, 035) is admin-only and takes a free-text reason of 1–1000 characters, which goes into the staff-only event detail. It cancels open and awaiting-verification requests, and open follow-ups. The client always reads the same generic sentence.
  - There is no draft delete and no client action that ends a case. Client-only actions (`RESPOND_DOCUMENT`) need an applicant session with no staff persona.
  - An existing sample scenario is called `waiting_documents`: the preparer's document request during preparation, at stage `preparing`.

## Decisions

**Q1. Waiting for documents and Hold follow the diagram, at intake.**
- They are two stages, both before anyone claims the case.
- **Waiting for documents** is reached from **Screening in progress**, when the office can't tick #93's "basic documents present", and from **Pending intake / filing**. It returns to the stage it came from, so the screening checks are completed before the case can be claimed. This is the "what happens when a check fails" that #85 item 4 deferred.
- **The preparer's mid-preparation loop** (`REQUEST_DOCUMENT`, `ESCALATE_CONTACT`, `RESOLVE_FOLLOWUP`) **stays unchanged**. Spec §8.2's in-preparation Pending is noted as a design difference, as the roadmap does.
- Rejected:
  - modelling spec §8.2's Pending from preparation and review, which touches claim, participation and the self-review rule;
  - one `on_hold` stage with a reason kind, which loses the diagram's escalation.

**Q2 / Q2b. Hold is "chasing the client", at the two places the office chases one. Unreachable is a closing reason.**
- **Hold** is entered from **Waiting for documents** (the diagram: the client took a long time to respond) and from **Ready to exit** (spec §8.2's CantFindClient: the client can't be reached to sign). Change 2's Rejected loop doesn't cover a signer who disappears.
- **Leaving Hold:** "Got in touch" (admin) returns the case to where it came from. A Ready-to-exit hold blocks Mark ready to e-file while held.
- **Closing from Hold:** Close with reason **Dismissed** is allowed from Hold, including a hold from Ready to exit. PCDC closes such cases at season end, and the return is not filed. The client's closed message for Dismissed must say plainly that the return was not filed.
- **The side panel's "any active stage → Dismissed"** is a closing reason, not a stage. During preparation and review, the existing escalate → office follow-up stays, with no stage change.
- **Stored origins:** the case stores where it came from, so it can return there.
- Rejected: Hold from any active stage (against Q1's no-change-in-preparation decision); and no Hold at all (a signer who disappears would stay at Ready to exit for ever).

**Q3. Closing reasons.** Closed stays one stage ("Closing SHALL stay one move to Closed"). It carries a required **reason kind**, stored on the case, and an optional **staff note** that clients never see.
- **The reasons:** `out_of_scope`, `no_need_to_file`, `duplicate`, `dismissed`, `withdrawn`, and `other`, for which the staff note is **required**.
- **Withdrawn is a closing reason, not a stage.** The diagram draws it as its own end box; one Closed stage with reasons covers it.
- **Who closes:** admins only, plus the client's own withdrawal (Q4). Volunteers don't close, so nothing widens while #90 is pending.
- **Cases closed before this change** have no stored reason. They keep today's generic message and show as "Closed" with no reason.
- **Where Close is allowed:** Request sent through Review in progress, Rejected, Waiting for documents and Hold. It stays refused at Ready to exit, Ready to e-file, E-filed and Accepted; a held signer is closed from Hold.
- **For the wording round:**
  - `duplicate` tells the client only that this application was closed and their return continues under their other application, without naming it;
  - `no_need_to_file` says the volunteer confirmed with them that no return is needed this year, rather than stating it as a fact.

**Q4. Client withdrawal.**
1. **The client's button** appears from Request sent up to Review in progress: Screening, Waiting for documents, a Hold that came from Waiting for documents, Pending intake / filing, Filing in progress, Corrections, Pending review, Review in progress. From Ready to exit on, the page tells the client to contact PCDC, and an admin closes with reason `withdrawn`. Draft has no withdraw.
2. **Confirmation:** a dialog in the client's language with a box to tick. The database refuses the move without it. The client gives no free-text reason.
3. **No undo.** A client who changes their mind starts a new application, and the office may close the old one as `duplicate`.
4. **What it records:** the case is Closed with reason `withdrawn`. Open requests and follow-ups are cancelled, as Close does. The client's history line says the return was not filed, and the staff history says the client withdrew.
5. **What the office sees:**
   - the case is in the pool's Closed tab, with its reason;
   - **when a preparer or reviewer is assigned** (Filing in progress, Corrections, Review in progress), a Follow-ups row opens: "The client withdrew; tell <name> to stop work.", resolved like other follow-ups;
   - when nobody is assigned, there's no row.

   That follow-up is created after Close's cancellations, with a new purpose, which is an `office-follow-up` change. (Pending review never has a reviewer, so it isn't in the rule.)

**Q5. Same day and FSA are out.** This narrows the archived Q1.
- **Same day:** the diagram calls it "untracked". The parts of the chain it touches (the intake `service`, the `same_day` signing plan, #93's three checks) are already built.
- **FSA:** one diagram box ("self-prep client needs help; no need to prepare") and nothing in `docs/spec.md`.
- Each can be its own change if PCDC asks for it.

**Q6. How Waiting for documents and Hold work.**

```
Screening in progress  --+
                         +--"Ask for documents"(admin: one or more requests)--> Waiting for documents
Pending intake / filing -+                                                        |   ^
   back to the stored origin  <--the last request is verified (automatic)---------+   |
                                         "Put on hold" (admin: client not responding) |
                                                                                  v   |
                                                                                Hold -+ "Got in touch" (admin)
                                                                                  +--> Close, reason dismissed
Ready to exit --"Put on hold" (admin: can't reach the client to sign)--> Hold --"Got in touch"--> Ready to exit
```

1. **"Ask for documents…"** is a new admin move from Screening in progress or Pending intake / filing. It creates one or more document requests, with the preparer's title and message shape, and records the origin. The client sees the requests and uploads as today.
2. **The return is automatic:** verifying the **last open request** returns the case to its origin, and the history says so ("Once submitted" in the diagram).
   - Adding a new request before verifying the last one keeps the case waiting.
   - **Edge:** if the last open request is verified while the case is on a Hold that came from Waiting for documents, the case returns to the *documents'* origin (Screening or Pending intake / filing) the same way, with no separate "Got in touch". The client uploading counts as getting in touch.
3. **`VERIFY_DOCUMENT`** is extended so an **admin** can verify at Waiting for documents and at a documents Hold.
4. **"Put on hold…"** is admin-only, from Waiting for documents and from Ready to exit, with an optional staff note. "Got in touch" (admin) returns the case to the hold's origin. Open requests stay open through a hold.
5. **Calls go in the contact log** (#88). Hold opens no separate follow-up; its own Follow-ups row is the to-do.
6. **Close** from either stage cancels the open requests, as today.

Two origins can be live at once (the hold's and the documents'), so the stored origin is two fields, or the hold remembers the documents' origin.

**Q7. What the client sees.**
- **The stepper:** Waiting for documents and a documents Hold sit on the **Intake** step. A Hold from Ready to exit sits on **Signing**.
- **Badges:** "Documents needed / 需要文件", and one neutral **"Waiting for you / 等待您的回复"** for Hold, whatever its origin. "Overdue" would read as blaming the client.
- **Messages** (drafts, for the group's wording review; 繁體 generated):

| Stage | English | 简体 |
|---|---|---|
| Waiting for documents | PCDC needs more documents from you before your return can be prepared. See the requests below. | PCDC 需要您提供更多文件，才能准备您的报税表。请查看下方的文件请求。 |
| Hold, from documents | PCDC has been trying to reach you about the documents we need. Please upload them below or contact PCDC. | PCDC 一直在设法联系您，询问所需的文件。请在下方上传，或联系 PCDC。 |
| Hold, from signing | PCDC has been trying to reach you to sign Form 8879. Please contact PCDC. Your return can't be filed until you sign. | PCDC 一直在设法联系您签署 8879 表。请联系 PCDC。您签署后才能递交报税表。 |

| Closed, reason | English | 简体 |
|---|---|---|
| out_of_scope | This application was closed because the return is outside what VITA volunteers can prepare. Your return was not filed by PCDC. | 此申请已关闭，因为该报税表超出了 VITA 志愿者可以准备的范围。PCDC 未递交您的报税表。 |
| no_need_to_file | A PCDC volunteer confirmed with you that you don't need to file a return this year, so this application was closed. | PCDC 志愿者已与您确认，您今年无需递交报税表，因此此申请已关闭。 |
| duplicate | This application was closed. Your return continues under your other application with PCDC. | 此申请已关闭。您的报税表将在您在 PCDC 的另一份申请中继续处理。 |
| dismissed | PCDC could not reach you, so this application was closed. Your return was not filed. | PCDC 无法联系到您，因此此申请已关闭。您的报税表未递交。 |
| withdrawn | You withdrew this application. Your return was not filed. | 您已撤回此申请。您的报税表未递交。 |
| other, and closed before this change | today's generic message | today's generic message |

- **Withdrawal:**
  - button "Withdraw this application / 撤回此申请";
  - box "I want to withdraw this application. My return will not be filed. / 我要撤回此申请。我的报税表将不会被递交。";
  - from Ready to exit on, the line "To withdraw now, contact PCDC. / 如需撤回，请联系 PCDC。".
- **History lines:**
  - Ask for documents: today's request line, one per request;
  - Put on hold: "PCDC is trying to reach you. / PCDC 正在设法联系您。";
  - Got in touch, and the automatic return: "PCDC is working on your application again. / PCDC 已继续处理您的申请。";
  - Withdraw: "You withdrew your application. Your return was not filed. / 您已撤回申请。您的报税表未递交。";
  - Close: the closed message of its reason.
- **Never shown to the client:** the hold note and the close note. No phone number appears anywhere.

**Q8. The lists and the case page.**
- **Case pool:**
  - Waiting for documents goes under **Waiting on client**, beside Ready to exit;
  - Hold goes under **Needs attention**, beside Rejected;
  - **Closed** gets a reason filter (All, the six reasons, and No reason for older cases);
  - the stage filter lists the new stages;
  - no new tab.
- **Follow-ups:**

| Row | Text | Button | Colour |
|---|---|---|---|
| Waiting for documents | Waiting for the client's documents. | Put on hold… | amber at 3 days, red at 5 |
| Hold, from documents | Can't reach the client about documents. | Got in touch… · Close… | none |
| Hold, from signing | Can't reach the client to sign Form 8879. | Got in touch… · Close… | none |
| Withdrawal notice (new purpose) | The client withdrew; tell <name> to stop work. | Resolve | none |

  Hold rows aren't coloured, because a hold can last weeks until season end. A held Ready-to-exit case shows the Hold row in place of its Signing row.
- **The case page:**
  - The lifecycle bar shows Waiting for documents as a mark on its origin step, and Hold as a mark on its origin, as Corrections and Rejected do.
  - The office actions panel gains Ask for documents…, Put on hold…, Got in touch… and Close… with the reason list.
  - "Your next step": "The office is waiting for the client's documents." / "The office is trying to reach the client."
  - The work board is unchanged.

**Q9. Samples and the story.**
- **Stage key `awaiting_documents`**, staff name "Waiting for documents", so it doesn't clash with the existing `waiting_documents` sample. Hold's key is `on_hold`.
- **Two new samples**, created on demand, with no existing row migrated, so a reset seeds **ten**:
  - `on_hold`: a Hold from Waiting for documents, origin Screening, with one open request;
  - `withdrawn`: Closed, reason `withdrawn`, withdrawn by the client at Filing in progress, with the notice follow-up still open.
- **Two short story flows:**
  1. documents at screening: Ask for documents → the client uploads → the admin verifies → back to Screening → the checks are recorded;
  2. withdrawal on a claimed case: the client withdraws → Closed (Withdrawn) → the Follow-ups notice names the preparer → the client's closed message, in 简体.
- **Covered by database and unit tests instead:** Hold → Got in touch, Hold → Close (Dismissed), and Hold from Ready to exit.

**Q10. Capabilities touched.**
- **`case-lifecycle`:** the stages, moves, close rule, names, stepper, lists, case page and messages, plus new requirements for documents at intake, Hold, closing reasons and withdrawal.
- **`office-follow-up`:** the withdrawal-notice purpose.
- **`client-intake`:** ten samples.
- **`screen-states`:** the close dialog's payload scenario.
- No canonical spec states "only the preparer requests and verifies documents", so there is **no `staff-case-work` delta**. The admin's intake requests and verifies are a new `case-lifecycle` requirement.

## The database
- **Migration 036.**
- **`CLOSE_CASE` payload (breaking):** `{confirmed, reason, note?}`. `reason` is one of the six kinds, and `note` is required for `other`.
- **New actions:** Ask for documents, Put on hold, Got in touch, Withdraw (the client's own).
- **Copies:** each redefined function is copied from its newest definition (most are in 035).

## Design trade-offs
- **No stage change during preparation.** It keeps the riskiest code untouched, at the cost of differing from spec §8.2.
- **The automatic return** saves the office a step. A later request keeps the case waiting.
- **No undo** for a withdrawal or a close; the confirmation box is the guard.
- **One neutral Hold badge:** the client isn't blamed, but the message differs by origin.
- **Hold rows aren't coloured:** less noise, at the cost of no ageing signal on long holds. Days waiting still show.

## Open questions

| Question | Owner | Provisional default | Can affect |
|---|---|---|---|
| The wording review of all new client text | the group | the drafts above | text only |
| Whether PCDC closes held signers one by one at season end | PCDC | yes, by hand, reason Dismissed | a later bulk-close action only |

## Out of scope

| Out | Note |
|---|---|
| Same day | narrowed from the archived Q1: "untracked" in the diagram |
| FSA | narrowed from the archived Q1: no source beyond one box |
| A Pending stage during preparation (spec §8.2) | design difference |
| Undo of a withdrawal or a close | not planned |
| A free-text reason from the client | not planned |
| Amendments, reassignment, TaxSlayer report import | later changes |
| Staff accounts and permissions (#90) | Close stays admin-only |

**Added beyond the archived Q1:**
- the unreachable client: Hold at Ready to exit and the closing reason `dismissed` (roadmap §4; spec §8.2's CantFindClient);
- a failed screening documents check leading to Waiting for documents (#85 item 4).

## Acceptance
- **Deliverables:**
  - migration 036;
  - delta specs for `case-lifecycle`, `office-follow-up`, `client-intake` and `screen-states`;
  - the views, client text and 繁體;
  - two samples, two story flows;
  - docs: the diagram, the demo script, the database and frontend guides, roadmap §4.
- **Checks:** `npm test`, `npm run db:migrate:test` + `npm run test:database`, `npm run test:browser`, `npm run build:hant -- --check`, `npx openspec validate --all`. `test:auth-browser` isn't needed.
- **Baseline at #95:** unit 1279, database 374, browser story 65.

## Revisions after propose (2026-10-22, the user's review)

- **Ask for documents' history line names every requested title**, in one line per move: "PCDC asked for these documents: W-2, Photo ID." It is translated by prefix, like the preparer's request line, and the titles stay as typed. This replaces Q7's "today's request line, one per request".
