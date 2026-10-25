<!--
Raw capture of superpowers:brainstorming output.
-->

# adjust-filing-to-pcdc: brainstorm

## Background

Change 2 (`add-post-efiling-stages`, #95, migration 035) and change 3 (`add-hold-and-closing`, #96, migration 036) left several PCDC questions open, with provisional defaults. Both brainstorms list them under "Open questions". The user is PCDC's contact and brought PCDC's answers:

| Question | PCDC's answer | Before this change |
|---|---|---|
| Does Both paper wait at E-filed? | A paper return is done once it leaves PCDC. The office doesn't follow it up. | The paper side waits until an admin records "mailed" with Record filing result. |
| Which filing combinations? | All four: both e-filed; federal e-filed + PA paper; federal paper + PA e-filed; both paper. | 035's `cases_filing_methods` refuses federal paper with state e-file. |
| Who contacts the client after a rejection, and who fixes it? | The office contacts the client; the site coordinator fixes the return in TaxSlayer. | The provisional default (the office, with the fix note). |
| Does every fix need a new Form 8879? | Always sign again. | The provisional default. |
| What does a paper return's client sign? | The return itself, not Form 8879. | Ready to e-file says "You signed Form 8879. PCDC will e-file your return next." |
| How long is a paper reply? | About 3 months. | "A reply to a mailed return can take several weeks." |
| Clients who never come back to sign | Closed all at once at season end. | One at a time, from a signing Hold, reason Dismissed. |

A correction from PCDC came during the brainstorm and reshaped Q1 and Q2: **PCDC never mails a return.** For a paper return, PCDC gives the printed return to the client, or to someone the client sends. The client may sign it at PCDC or take it home unsigned, and mails it themselves. PCDC doesn't know the mailing date.

Base: branch `adjust-filing-to-pcdc`, from `origin/add-hold-and-closing` at c30c0b2. #96 was merged to `main` (53001f2) during the brainstorm. Baseline counts at c30c0b2: unit 1317, database 408, browser story 75.

**No hosted project exists yet.** The README's Task 10B is pending. 035 and 036 have run only on local test stacks with demo data, and a sample reset clears any stuck case.

## Decision chain

### Q1. When is a paper return done, and what happens to cases already filed?

- **Done at Mark e-filed.** Mark e-filed records each paper return as handed over (Q1b), and the stage follows the rule Record filing result already uses: **Accepted** if every return has its answer, otherwise **E-filed**.
  - Both paper goes from Ready to e-file straight to Accepted in one move.
  - A mixed pair waits at E-filed only for its e-filed return.
  - A second filing that re-files a rejected return on paper, while the other return is already accepted or handed over, goes straight to Accepted.
  - A second filing can't land at Rejected, because a re-filed return starts without an answer.
- **Record filing result accepts only `accepted` and `rejected`.** Anything else is refused with `VALIDATION`. Nothing is left to record for a paper return.
- **Lost for new cases:**
  - the Follow-ups sentences "Record when the … is mailed." / "Record when the returns are mailed.";
  - the colour exemption for a row waiting only for a mailing;
  - the Filing panel's "Waiting for the mailing to be recorded";
  - the case page's "Record when the … is mailed before the return can go back to signing.";
  - Record filing result's Mailed option and "Date mailed" field;
  - the E-filed "Both paper" staff name, and the client's "Mailed" label at E-filed (a both-paper case never stops at E-filed).
- **Cases already filed under 035 with a waiting paper return: option C, ignore them.** Options A (backfill in 037, with an event) and B (keep the old path for old cases) were rejected. The design and 037's header say so, and the old paper path is removed from the code and the specs.
- **The refund sentence at Accepted** still follows when a return went on paper.

### Q1b. A paper return is handed over, not mailed (PCDC's correction)

- **Rename the result.** Nothing is hosted, so 037 renames the result value `mailed` to **`given_to_client`** throughout: the constraints (`cases_filing_results`, the `filing_returns.result` check), the SQL functions, the domain code, the client-text keys and the specs. It still belongs only to the `paper` method.
- **No date.** A paper return's `answered_on` stays **null**. PCDC doesn't know the mailing date, and the filing's own `filed_at` is the handover day. `recorded_by` is the admin who marked it.
- **Who collected it goes in the contact log** if staff want to record it. There is no new field.

### Q2. All four combinations, and their names

- **Database.** 037 drops `not (federal_method='paper' and state_method='efile')` from `cases_filing_methods`. It also drops the same refusal from `act_mark_efiled`'s first filing, and the second filing's "the resulting pair must be a used one" check, which can no longer fail. A second filing still names exactly the rejected returns. Every other return keeps its method and answer.
- **Staff names:**

  | Pair (fed / PA) | E-filed | Accepted |
  |---|---|---|
  | e-file / e-file | Both e-filed | Accepted |
  | e-file / paper | E-filed, PA on paper | Accepted, PA on paper |
  | paper / e-file | E-filed, federal on paper | Accepted, federal on paper |
  | paper / paper | (never shown) | Paper |

  A case e-filed before filing methods existed keeps "E-filed".
- **Client labels.**
  - At E-filed: both mixed pairs read "Filed / 已递交"; both e-filed keeps "E-filed".
  - At Accepted: **"Ready to mail / 待邮寄"** when any return is on paper, otherwise "Complete / 已完成". The stepper still shows all five steps as done, because PCDC's part is finished.
- **Domain.** A new method kind, `paper_and_efile`, joins `both_efile`, `efile_and_paper` and `both_paper`.
- **The Mark e-filed dialog.**
  - First filing, in this order:
    - Both returns e-filed
    - Federal e-filed, Pennsylvania on paper (given to the client to mail)
    - Federal on paper (given to the client to mail), Pennsylvania e-filed
    - Both returns on paper (given to the client to mail)
  - Second filing, for each rejected return: "E-filed" / "On paper (given to the client to mail)".
  - A done return reads, for example, "Pennsylvania return: on paper, given to the client. Nothing to file again."
  - The confirmation box: **"Each return was e-filed, or given to the client on paper, as chosen above."**
  - The button and the stage keep the names "Mark e-filed" and "E-filed".
- **Staff lines.**
  - The Filing panel shows a paper return as "Paper · Given to the client", with no date.
  - The volunteer's next step at Accepted: "The returns are accepted or given to the client on paper. Nothing more is needed here."
  - Record filing result's note drops "or mailed (on paper)".

### Q3. What a paper client signs, and when

The method is chosen at Mark e-filed, after the signing step, so the signing messages can't know it.

**Options compared:**
- **(b) Choose the method at Mark ready to e-file.** Rejected. That move records the signature, so every Ready to exit message is still written before it. It would fix only two strings and add a choice.
- **(c) Keep the 8879 wording.** Rejected. It changes nothing for a paper client.
- **(a) Make the signing messages neutral.** Chosen.

**The client signing text (a):**

| # | Key | English | 简体 |
|---|---|---|---|
| 1 | `stage.review_approved.client` | Your return has been checked. PCDC will contact you to sign it. Your return can't be filed until you sign. | 您的报税表已检查完毕。PCDC 会联系您签署报税表。您签署后才能递交报税表。 |
| 2 | `…appointment` | Your return has been checked. Please come to PCDC on {when} to sign it. Your return can't be filed until you sign. | 您的报税表已检查完毕。请于 {when} 到 PCDC 签署报税表。您签署后才能递交报税表。 |
| 3 | `…same_day` | Your return has been checked. Please sign it with a volunteer before you leave today. Your return can't be filed until you sign. | 您的报税表已检查完毕。请在今天离开前与志愿者一起签署报税表。您签署后才能递交报税表。 |
| 4 | `…portal` (keeps 8879: what the client e-signs in the portal is Form 8879) | Your return has been checked. Please e-sign Form 8879 in the TaxSlayer Customer Portal. Your return can't be filed until you sign. | 您的报税表已检查完毕。请在 TaxSlayer 客户门户（Customer Portal）以电子方式签署 8879 表。您签署后才能递交报税表。（门户为英文页面，可用浏览器翻译） |
| 5 | `…go_over_first` | Your return has been checked. PCDC will contact you to go over your return together. After that, you will sign it. Your return can't be filed until you sign. | 您的报税表已检查完毕。PCDC 会联系您，先和您一起查看报税表，再请您签署。您签署后才能递交报税表。 |
| 6 | `stage.ready_to_efile.client` | Your return is ready. PCDC will take the next step. | 您的报税表已准备好。PCDC 会进行下一步。 |
| 7 | `stage.on_hold.client.signing` | PCDC has been trying to reach you to sign your return. Please contact PCDC. Your return can't be filed until you sign. | PCDC 一直在设法联系您签署报税表。请联系 PCDC。您签署后才能递交报税表。 |
| 8 | Mark ready to e-file's history line | PCDC recorded that your return is ready. PCDC will take the next step. | PCDC 已记录您的报税表已准备好。PCDC 会进行下一步。 |

**Why #6 and #8 don't claim a signature.** A paper client may sign at PCDC, take the return home unsigned, or send someone else to collect it.

**What else stays the same:**
- The re-sign message is already neutral.
- History lines already stored keep their words and their 简体.
- 繁體 is generated.

**Staff text (English only):**
- Mark ready to e-file's box: **"The client signed Form 8879, or the return will be given to the client on paper."** The dialog's lead and the confirmation message in `case-actions.mjs` change to match.
- Follow-ups and the case page:
  - "Waiting for the client to sign Form 8879." becomes "Waiting for the client to sign."
  - "Can't reach the client to sign Form 8879." becomes "Can't reach the client to sign."
  - "The office could not reach the client to sign Form 8879." becomes "The office could not reach the client to sign."
  - "This is recorded once the client has signed Form 8879." becomes "This is recorded once the client has signed."
- Staff history: "recorded the client's Form 8879 signature" becomes "recorded the client's signature".
- The panel heading "Form 8879" becomes "Signing".
- The reviewer questionnaire keeps "How will the client sign Form 8879?" and "Form 8879 signing". The reviewer plans the usual e-file signature, and the portal choice only exists for 8879.

### Q4. "About 3 months"

This is folded into Q1b. The four Mailed sentences are replaced by the handover sentences, which carry "about 3 months after you mail it". History lines already stored keep their words.

**The handover sentences** (status panel; `filing_line` and `filing.*.given_to_client`):

| | English | 简体 |
|---|---|---|
| Federal | PCDC gave your federal return on paper to you or the person you sent. If it isn't signed yet, sign it, then mail it yourself. A reply can take about 3 months after you mail it. | PCDC 已将您的联邦报税表纸本交给您或您委托的人。如果还没有签名，请先签名，然后自行邮寄。邮寄后可能需要约 3 个月才会有回复。 |
| Pennsylvania | PCDC gave your Pennsylvania return on paper to you or the person you sent. If it isn't signed yet, sign it, then mail it yourself. A reply can take about 3 months after you mail it. | PCDC 已将您的宾州报税表纸本交给您或您委托的人。如果还没有签名，请先签名，然后自行邮寄。邮寄后可能需要约 3 个月才会有回复。 |
| Both | PCDC gave your federal and Pennsylvania returns on paper to you or the person you sent. If they aren't signed yet, sign them, then mail them yourself. A reply can take about 3 months after you mail them. | PCDC 已将您的联邦和宾州报税表纸本交给您或您委托的人。如果还没有签名，请先签名，然后自行邮寄。邮寄后可能需要约 3 个月才会有回复。 |

**The Mark e-filed history lines** (`efiled_line`; the reply sentence appears once):

| Filing | English | 简体 |
|---|---|---|
| Both e-filed | PCDC e-filed your return. (unchanged) | PCDC 已电子递交您的报税表。 |
| Fed e-file, PA paper | PCDC e-filed your federal return and gave your Pennsylvania return on paper to you or the person you sent. If it isn't signed yet, sign it, then mail it yourself. A reply can take about 3 months after you mail it. | PCDC 已电子递交您的联邦报税表，并将您的宾州报税表纸本交给您或您委托的人。如果还没有签名，请先签名，然后自行邮寄。邮寄后可能需要约 3 个月才会有回复。 |
| Fed paper, PA e-file | PCDC gave your federal return on paper to you or the person you sent, and e-filed your Pennsylvania return. If the federal return isn't signed yet, sign it, then mail it yourself. A reply can take about 3 months after you mail it. | PCDC 已将您的联邦报税表纸本交给您或您委托的人，并电子递交了您的宾州报税表。如果联邦报税表还没有签名，请先签名，然后自行邮寄。邮寄后可能需要约 3 个月才会有回复。 |
| Both paper | PCDC gave your returns on paper to you or the person you sent. If they aren't signed yet, sign them, then mail them yourself. A reply can take about 3 months after you mail them. | PCDC 已将您的报税表纸本交给您或您委托的人。如果还没有签名，请先签名，然后自行邮寄。邮寄后可能需要约 3 个月才会有回复。 |
| Second filing, one return | PCDC e-filed your federal return. / PCDC gave your federal return on paper to you or the person you sent. If it isn't signed yet, sign it, then mail it yourself. A reply can take about 3 months after you mail it. (and the same two for Pennsylvania) | PCDC 已电子递交您的联邦报税表。/ PCDC 已将您的联邦报税表纸本交给您或您委托的人。如果还没有签名，请先签名，然后自行邮寄。邮寄后可能需要约 3 个月才会有回复。（宾州同理） |

The exact 简体 of the new lines above is the brainstorm's draft. It goes through the group's wording review, like all new client text.

**Lines already stored keep their words and translations.** That covers 035's "PCDC mailed your returns.", "PCDC mailed your federal return." and the other mailed lines, and every several-weeks sentence that `filing_line` wrote. They stay in the history map with their 简体, even though the keys they came from are renamed.

### Q5. Closing unsigned cases at season end

- **Which cases it picks.** Every case at **Ready to exit** (not on hold), including those still waiting for the reviewer's call or the go-over, and those returned to signing; and every **Hold that came from Ready to exit**.
  - Not picked: Ready to e-file (the office's backlog), Rejected (the office's fix), and Waiting for documents and its Hold (not a signature).
  - No season filter: every case is in the current season until part 7.
- **A new RPC, `vitally_close_unsigned`, rather than a browser loop over CLOSE_CASE.**
  - A loop would have to allow Dismissed at Ready to exit for every close, could leave a half-done season end, and would open a notice per case.
  - The RPC keeps the individual Close's rules as they are.
- **Admin only.**
- **Payload.** `{cases: [{caseId, revision}, …], confirmed: true}`, holding the cases the admin left ticked. It carries one action ID and one receipt, so a replay closes nothing twice.
- **All or nothing.**
  - It locks the listed cases in ID order.
  - If a revision differs, or a case is no longer at a signing stage, the whole move is refused with `CONFLICT` and nothing changes.
  - It closes only the cases it is sent, never a case that became eligible later.
  - An empty list is refused with `VALIDATION`.
- **History, per case.**
  - One `CLOSE_CASE` event, with detail `{"reason":"dismissed","seasonEnd":true}`.
  - The staff history reads "closed the case at season end · Dismissed".
  - The client gets one line, the Dismissed message: "PCDC could not reach you, so this application was closed. Your return was not filed."
  - The revision is bumped, so realtime reaches open windows as for any close.
  - Open document requests and follow-ups are cancelled, as Close does.
- **No TaxSlayer notice per case.** The IRS takes current-year e-files into the autumn, so "nothing can be transmitted" isn't guaranteed. Instead, the admin's confirmation box asserts it once: **"These clients didn't come back to sign. None of these returns will be transmitted in TaxSlayer."** The individual Close of a signing Hold keeps its notice.
- **The button.** An admin-only **"Close unsigned cases…"** at the top of Follow-ups. With nothing to pick, it is disabled, with "No case is waiting for a signature."
- **The dialog.**
  - The heading counts what is ticked: "Close 12 of 14 cases that are waiting for a signature, as Dismissed?"
  - Each case has its own checkbox, **ticked by default**, and shows its reference, the client's name, its stage (Ready to exit or Hold) and **how many days it has waited at that stage**, counted as the Follow-ups waiting time is.
  - Confirm is disabled when nothing is ticked.

### Q6. Recording the confirmed defaults

- **Confirmed, not changed:**
  - The office contacts the client after a rejection. The Rejected row "Rejected: contact the client to fix and sign again." and the client's "PCDC will contact you about the correction." stay.
  - The site coordinator fixes the return in TaxSlayer.
  - Every fix needs a new signature: Return to signing goes back to Ready to exit.
- **No spec wording to change.** No canonical spec calls these provisional. Only the archived brainstorms did, and they stay as they are.
- **The texts are aligned:**
  - The fix-note prompt is role-neutral, because who does it may change: "Fix note (only when a return is rejected): what needs fixing in TaxSlayer".
  - The spec sentence "saying who fixes the return and how" becomes "saying what needs fixing in TaxSlayer".
  - The volunteer's next step at Rejected: "A return was rejected. The site coordinator fixes it in TaxSlayer, and the office contacts the client."
  - The sample note: "Fictional note: site coordinator to correct the dependent's SSN in TaxSlayer."
  - The story note: "Site coordinator to correct the dependent's date of birth in TaxSlayer".
  - The spec scenarios and the unit fixtures say "Site coordinator to correct…".

### Q7. The samples and the story

- **Samples.**
  - `rejected`: its history's Mark ready to e-file line becomes #8, and its fix note becomes the site-coordinator note.
  - `accepted`: the same #8 line.
  - `review_approved`: nothing stored changes. It's a Ready to exit case, so the season-end close picks it up.
  - **No new paper sample.** The story covers the paper path.
  - 037 redefines `fixture_history` and `apply_fixture_scenario` from 036.
- **Story step 5, the rejection loop.**
  - Mark e-filed again offers only the PA-40. The admin chooses "On paper (given to the client to mail)", and the case goes straight to Accepted, "Accepted, PA on paper".
  - The Record filing result block goes, leaving one `RECORD_FILING_RESULT` event, not two. The case is still in the Done tab.
  - The client sees "Ready to mail". The status panel shows the IRS acceptance, then the PA handover sentence, then the refund sentence as plain text. The history gains the second-filing handover line.
  - The evidence string changes to match.
- **Earlier story steps.** Their wording assertions follow Q3, and the fix note follows Q6.
- **A new final story step: the season-end close.** It goes last, because it closes cases the earlier steps use:
  1. List the signing cases, with the days waited and every box ticked.
  2. Untick one case and confirm.
  3. Check that:
     - the ticked cases are Closed · Dismissed, under the Dismissed filter;
     - the unticked case hasn't moved;
     - each closed client reads the Dismissed line;
     - no TaxSlayer notice row appears.
- **Database tests.**
  - A new `database-season-close` file covers: which cases close; all or nothing; an empty list; a volunteer refused; a replay; one event and one line per case.
  - `database-filing` swaps the "paper is mailed" group for the handover at Mark e-filed and covers the fourth pair.

### Q8. Out of scope

- #58, the footer. Its text is confirmed there: "© 2026 Philadelphia Chinatown Development Corporation / 费城华埠发展会".
- Amendments.
- Reassignment.
- The TaxSlayer report import.
- #90.
- A season-end close of Waiting for documents cases and their Hold.
- A field for who collected a paper return.
- A paper sample.
- Migrating cases filed under 035 with a paper return still waiting (option C).

## Capabilities and deliverables

- **Delta specs.**
  - `case-lifecycle`: the stages and names, Mark e-filed, Record filing result, the client messages and labels, Follow-ups, the season-end close.
  - `office-follow-up`: the season-end close opens no `withdrawal_notice`.
  - `review-and-corrections`: "Waiting for the client to sign." replaces "…sign Form 8879." in its go-over scenario.

  A grep of every canonical spec for "mailed", "Mailed", "8879", "several weeks" and "E-filed & paper" found matches only in `case-lifecycle` and `review-and-corrections`. The questionnaire's 8879 lines in `review-and-corrections` stay.
- **Migration 037.** The constraints, the rename to `given_to_client`, `check_payload`, `act_mark_efiled`, `act_record_filing_result`, `filing_line`, `efiled_line`, `act_mark_ready_to_efile`'s line, the new `vitally_close_unsigned` RPC, and the fixtures. Each is copied from its newest definition.
- **Browser code.** `domain.mjs`, `client-text.mjs` (and the regenerated `zh-hant.mjs`), `admin-views.mjs`, `office-views.mjs`, `staff-views.mjs`, `case-actions.mjs`, the controller and store wiring for the new RPC, and `pool-views.mjs` where it names 8879.
- **Docs.**
  - `docs/media/return-lifecycle.svg`: the paper branch labels.
  - `docs/demo-script.md`.
  - `docs/developer/database.md`.
  - `docs/developer/frontend.md`.
- **Tests.** Unit, database (with the new season-close file) and the browser story, as above.

## Builder check

A fresh reviewer read this design as a builder would and raised five questions. Calls marked "my call" were settled without the user and are listed for review.

1. **Rows already storing `mailed` (my call).** The new check constraints can't be added while `mailed` values exist, and local stacks that ran the story or `database-filing` have them. So before re-adding the constraints, 037 renames stored values: `mailed` becomes `given_to_client` in `cases.federal_result`, `cases.state_result` and `filing_returns.result`, and `answered_on` is nulled for those `filing_returns` rows. This is a mechanical rename. It moves no stage and writes no event or client line. Option C still holds for paper returns *still waiting* (result null): 037 leaves them as they are.
2. **The receipt and plumbing for a many-case RPC (my call).**
   - `action_receipts.target_id` is nullable (001), so `vitally_close_unsigned` reserves one receipt with `target_id` and `target_reference` null.
   - The receipt it stores and returns is `{actionId, cases: [{caseId, reference, revision}, …]}`, and a replay returns that same receipt.
   - For each case, it writes the event, the client line and the revision bump the way `commit_action` does, through a shared per-case helper (or inline), without touching the receipt.
   - The store applies each `{caseId, revision}` as it applies a single action's result.
3. **Paper after a portal signing plan (user: allow, no check).** Mark e-filed offers all four pairs whatever the signing plan. The handover sentence already says "If it isn't signed yet, sign it". There's no new rule and no new test.
4. **Client lines when Mark e-filed lands at Accepted (my call).** One line, as for every action: the `efiled_line` handover line. The status panel at Accepted carries the per-return sentences and the refund sentence. No second line is written.
5. **Staff view of cases stuck under 035 (my call).** There's no special wording. A paper return counts as answered whatever its stored result: `waitingReturns` and the Follow-ups sentences consider only e-filed returns without a result, and `returnState` reports any paper return as `given_to_client`. So a stuck case renders without errors and sits at E-filed with no mailing sentence. A sample reset clears it.

Two more points found while writing:

6. **The legacy history map (my call).** `client-text.mjs` builds the 简体 of every `filing_line` combination from the `filing.*` keys (`filingLines()`). Renaming `filing.*.mailed` would drop the translation of lines already stored with "mailed … several weeks". So the old mailed sentences stay in a frozen legacy table that `filingLines()` also expands, and old stored lines keep their 简体.
7. **The client badge at Ready to e-file (user: "Ready / 已准备好").** "Signed / 已签名" claimed a signature that #6 no longer claims. The badge becomes "Ready / 已准备好", to match #6's "Your return is ready.". The staff name stays "Ready to e-file".
8. **The fed paper / PA e-file history line (my call).** Its instruction names the return, "If the federal return isn't signed yet, sign it…", because the line has already mentioned the e-filed Pennsylvania return by then.

## Open questions

| Question | Owner | Default | Can affect |
|---|---|---|---|
| The wording review of all new client text, the 简体 drafts above included | the group | as drafted | text only |

## Checks

| Check | Why |
|---|---|
| `npm test` | always |
| `npm run db:migrate:test`, then `npm run test:database` | 037 and the new RPC |
| `npm run test:browser` | the views, the dialogs and the story |
| `npm run build:hant -- --check` | 简体 changes |
| `npx openspec validate --all` | the specs |

`npm run test:auth-browser` isn't needed, because sign-in is untouched.
