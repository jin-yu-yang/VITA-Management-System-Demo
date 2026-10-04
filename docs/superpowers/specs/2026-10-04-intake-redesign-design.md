# The intake redesign: sub-steps, Documents, Review & submit

**Status:** approved in brainstorming on 2026-10-04. Revised the same day after a recheck: visits stored on the server, revisions that change no answers, the hidden `member_id` type, the catalogue shape, the English 10-2025 form supplied, "not sure" on the draft, a text-independent font fetch, popup blockers, the pdf-lib bundle. Final recheck the same day: rows never deleted (realtime), stages, staff marks after submission, walk-ins see full cards, visible answers only in cardsFor, lead lines for split sections, resume place, print mode, empty household cards.

**Revises:** `docs/superpowers/specs/2026-09-30-intake-screens-design.md`. §3 of that spec (the client's nine-step form) is replaced by this one for version 2. Its §2 (the shared renderer, redraw rules, invalid values) stays, with the renames in §3.6 below. Its §4–§6 (4c) are revised by §10 below.

**Sources:**
- `docs/intake-questions/intake-questions.md` and its senior version: the questions, which mostly follow the order of Form 13614-C.
- The "Upload Step: Answer-to-Document Map" (the group's document, 2026-10). Its rules, with the rulings made in brainstorming, are Appendix A. Appendix A is the source of truth from now on; the document is not kept in the repo.

## 1. Parts and release order

No real version-2 case exists yet: `default_intake_version` is still 1 everywhere, and the switch-over is the last migration of 4c. Version 2 therefore changes in place. There is no version 3.

| Part | What ships | Who sees it |
|---|---|---|
| **Sidebar** (its own small PR, mergeable now) | Hover to peek, click to pin (§8) | Staff |
| **4b2, the intake redesign** | Steps 0–9 with sub-steps and a rail tree (§2–§3). Step 0 and step 8 (§4). Review & submit (§5). The Documents step as a checklist, with card state on the server (§6). The draft 13614-C (§7). The 4b carry-forwards (§9.3) | Built and tested, unreachable, like 4b |
| **4c, revised** (§10) | The 4c plan, moved onto the new layout, plus staff card controls and the draft 13614-C on the case page. **The switch-over stays last** | Clients get the final form from day one |
| **4d** | Chinese on screen | |
| **Uploads** | Real files on cards (§6.8) | |
| **Later, separate** | Volunteer text and email notices (the map's "no scope messages" rule); removing version 1 | |

## 2. Steps and sub-steps

### 2.1 The catalogue

The catalogue build (`tools/build-intake-catalogue.mjs`, its `STEPS` table) gains sub-steps.
- **The catalogue keeps `steps[].sections[].questions`,** because the database's catalogue loader walks exactly that shape (`011_intake_v2.sql:147`). Each step gains `substeps[]` beside its sections. Questions stay in their sections; a sub-step lists the question ids it shows.
- **The sub-steps are defined in the build's `STEPS` table,** like the steps today. `intake-questions.md` keeps its section order and gets no sub-step markers.
- Each sub-step has a stable id, a title (EN/中文, both variants), and its question ids in catalogue order. A test checks that every question is in exactly one sub-step.
- Every step has at least one sub-step, so a step always expands and collapses the same way.
- No field id changes. Titles, tips and the new hidden `hh.member_id` (§6.2) change, so the hash changes and a new catalogue migration ships it (§9.2).
- A section's intro text shows on the first sub-step that holds questions from that section.
- **Sub-steps split from Sections 9, 10 and 11 each get a lead line,** because their questions are short noun phrases ("Tips", "Mortgage interest") that need the question around them. Income sub-steps read "Did you or your spouse receive any of these in 2025?". Expense sub-steps read "Did you or your spouse pay for any of these in 2025?". `expenses.events` reads "Did any of these happen to you or your spouse in 2025?". The lead line is new wording for the group's review.
- `documents.bring` comes first in the documents step's list, so the hidden-sub-step rule (§3.1) sends a client whose service changes away from same-day to `documents.identity`.

### 2.2 The layout

Titles are drafts. All new wording, English and Chinese, goes to the group for review.

| Step id | Title | Sub-steps (id · title · content) |
|---|---|---|
| `before` | Before you start / 开始之前 (shown unnumbered) | `before.ready` · Before you start · S0 page text, then Q0.1 (§4.1) — `before.service` · How you'd like help · Q0.2 — `before.language` · Language · Q0.3–Q0.4 |
| `about` | About you / 基本信息 | `about.you` · About you · S1 — `about.address` · Mailing address · S2 — `about.marital` · Marital status · S3 — `about.spouse` · Your spouse · S4, **shown only when `marital_status = married`** — `about.situation` · Your 2025 situation · S5 — `about.irs` · IRS letters and election fund · S8 |
| `household` | Household / 家庭成员 | `household.members` · Household members and dependents · S6 |
| `income` | Income / 收入 | `income.wages` · Wages and tips · Q9.1–Q9.2 (with Q9.1a) — `income.retirement` · Retirement and government benefits · Q9.3–Q9.7 — `income.investments` · Investments and sales · Q9.8–Q9.9a — `income.rental` · Rental income · Q9.11–Q9.12 (with Q9.11a) — `income.business` · Business and self-employment · Q9.14–Q9.14a — `income.other` · Other income · Q9.10, Q9.13, Q9.15–Q9.15a |
| `expenses` | Expenses & life events / 支出与生活事项 | `expenses.deductible` · Deductible expenses · S10 Part A — `expenses.other` · Other expenses · S10 Part B — `expenses.events` · Things that happened in 2025 · S11 |
| `refund` | Refund & permission / 退税与授权 | `refund.payment` · Refund or payment · S7 — `refund.consent` · Sharing your return next year (Form 15080) · S14 |
| `optional` | Optional questions / 选填问题 | `optional.questions` · Optional questions · S12 |
| `documents` | Documents / 上传文件 | `documents.identity` · Identity — `documents.income` · Income forms — `documents.expenses` · Expenses — `documents.events` · Health and other events — `documents.other` · Other documents. For a same-day client, the one sub-step `documents.bring` · Bring these to your visit (§6.6) |
| `notes` | Anything else / 补充说明 | `notes.anything` · Anything else · Q13.1 (§4.2) |
| `review` | Review & submit / 检查并提交 | `review.check` · Review your application — `review.summary` · Your application summary — `review.submit` · Submit (§5) |

**Visible sub-steps.** A sub-step is visible when it holds at least one visible question. The exceptions:
- the Documents sub-steps, which are visible when they hold at least one card (`documents.other` always, `documents.bring` only for same-day, the other four only when not same-day);
- the Review sub-steps, which are always visible.

## 3. Moving around

### 3.1 Where the client is

- **Version 1 is untouched.** It keeps `formStep` (0–3).
- **Version 2 uses a new field, `formSubstep`,** a sub-step id. It is in the window state's `FIELDS` with its own check: a string naming a sub-step in the catalogue.
- **Visits are stored on the server** (§3.7), so the marks follow the client to another device.
- **`revealedAnswers: { caseId, ids }`** replaces 4b's `visitedSteps` in the window state, which only the version-2 form ever wrote. It holds only the revealed ids (§2.5 of the earlier spec). They stay per window, because invalid values never reach the server. The old `visitedSteps` is no longer read; a stale saved copy is ignored. It belongs to one case, exactly as `visitedSteps` did.
- **When `formSubstep` names a sub-step that is now hidden** (Your spouse after the marital status changes, a Documents sub-step that lost its last card, `documents.bring` after the service changes), the client goes to **the next visible sub-step after it in catalogue order**, or to the last visible sub-step if none follows.
- **When `formSubstep` names an id the catalogue doesn't have** (stale window state), there is no position to work from, so the client goes to the first sub-step.
- **A case opened with no saved place** (a new window, another device) opens at the first visible sub-step that isn't Done, using the visits stored on the server (§3.7). A new case opens at `before.ready`.
- The place key for scroll and focus restore (`app.mjs`) uses `formSubstep` for version-2 cases.

### 3.2 The rail tree

- The rail lists the steps. **The current step is expanded,** showing its visible sub-steps. Every other step has its own expand/collapse button (`aria-expanded`, `aria-controls`), which only shows or hides that step's sub-steps and never navigates.
- **A step's name is a link** to its first visible sub-step that isn't Done (or its first visible sub-step when all are Done).
- **A sub-step's name is a link.** A jump saves first, as 4b's rail jumps do.
- The current sub-step carries `aria-current="step"` and "You are here".
- Under the tree: the progress bar, counting visible sub-steps, then the office contact card.

### 3.3 Status marks

Every mark is an icon **and** a word, never colour alone. This settles 4b's colour-only rail carry-forward.

- **A sub-step** is:
  - **Done** when it has been visited, has no missing required answer and no revealed invalid answer, and (Documents sub-steps) no Needed card that is Not done;
  - **Needs answers** when it has been visited with a missing or revealed invalid answer;
  - **Needs documents** (Documents sub-steps only) when it has been visited and a Needed card is still Not done;
  - blank before it is visited.
  
  A visit is required for Done. So `before.ready`, `optional.questions` and `notes.anything`, which have no required question, don't show a tick before the client has seen them. This changes 4b's rule, which ticked a complete step even when unvisited. Because visits are stored on the server (§3.7), a client who reopens the form on another device keeps their ticks.
- **A step** rolls up its visible sub-steps: Needs answers when any needs answers, otherwise Needs documents when any needs documents, otherwise Done when all are Done, otherwise blank.
- `documents.bring` (same-day) has no statuses, so it is Done once visited.
- `review.check` is Done when visited with no alerts (§5.1). `review.summary` is Done when visited. `review.submit` stays blank until submitted.
- **Each sub-step's mark is one fixed element,** `<span id="rail-sub-<sub-step id with . as ->-status" class="rail-status is-…">` (for example `rail-sub-about-address-status`), and each step's is `rail-step-<step id>-status`. The in-place update after `input` (§2.4 rule 2 of the earlier spec) sets only the current sub-step's span and its step's span.

### 3.4 The page

- **Header:** an overline "STEP 1 OF 9 · ABOUT YOU", the sub-step title as the `<h1>` ("Mailing address"), and "2 of 5". `before` shows "BEFORE YOU START" with no number, so the client sees Steps 1–9.
- **Continue and Back** move one visible sub-step, crossing step boundaries. They save as in 4b. **Continue always moves on.** Leaving a sub-step marks it visited, which reveals its "Needs an answer" notes.
- **Phone width (≤800px):** the rail folds into a bar under the top bar, "About you · 2 of 5", with an "All steps" disclosure that opens the same tree.

### 3.5 Unchanged from 4b

The redraw rules, invalid values and `withholdInvalid`, saving, the senior switch, and Fill fictional details. The conflict screen is unchanged except for §3.8.

### 3.6 Renames in the earlier spec's §2 and §6

- `rail-step-<n>-status` becomes the sub-step and step ids of §3.3.
- `needsRedraw(renderedIds, step, answers)` takes `formSubstep`: it compares the questions rendered on the current sub-step with the questions the draft makes visible there.
- "Step 9's missing list" becomes the 9.1 alerts (§5.1).
- "The nine steps" becomes "steps 0–9".

### 3.7 Visits on the server

- **The case stores its visited sub-steps** in a new column, `cases.intake_visited text[]` (version 2 only, empty by default).
- **`SAVE_ANSWERS` gains an optional `visited` key:** `{ answers, visited? }`, where `visited` is the full set of visited sub-step ids.
  - The server checks every id it is sent against the sub-step list that the catalogue migration loads (`vitally_private.intake_substeps`), and refuses an unknown one (`VALIDATION`).
  - It stores the union of what it had and what was sent, so a visit is never lost to an older window. **When it writes, it quietly drops stored ids that are no longer in the list.** A later catalogue that renames or removes a sub-step therefore never leaves an old id behind to be refused.
  - **The client sends only ids its own catalogue knows.** A merged-in id that its catalogue doesn't have is dropped before sending, so a stale stored id can never block every save.
- **Visits are saved with the draft.** Leaving a sub-step adds it to the draft's visited set. `dirty` (§2.5 of the earlier spec) also counts a visited set that differs from the server's, so the save that follows Continue, Back or a rail jump sends it even when no answer changed.
- **A refresh merges** the server's visited set into the draft's (union).
- **The office's Add a case never sends `visited`.** The office works from `showMissing`, not visits (4c).

### 3.8 Revisions that change no answers

Every action bumps the case revision (`003_action_core.sql:255`). Today, a newer revision that arrives while the draft has unsaved edits raises the conflict screen (`applyCase`, `controller.mjs:390`), even when no answer changed. With card actions (§6.3) and stored visits, that would happen all the time.

- **A newer revision that changes no answers, no contact field and not the stage** (compared with the snapshot it replaces) only moves the pinned base revision forward. It never raises the conflict screen. A visited set in it is merged (§3.7).
- **A newer revision that does change answers** raises the conflict screen **only when this window has unsaved answer or contact changes**, as today. **When only visits are unsaved** (the draft is dirty only because a sub-step was left), there is nothing to choose between: the window takes the newer case, merges the visits into it and moves the base forward, so the conflict screen never opens empty.
- **A stage change** (another window submitted) is handled as today, without re-pinning.
- **A card action saves the draft first when it has unsaved edits,** the same as a rail jump. This matters most on Add a case (4c), where fields and cards share one page.

## 4. Step 0 and step 8

### 4.1 `before.ready`

- The S0 page text ("Please have these ready…"), with one more line: "You will upload them in the Documents step." A same-day client reads "You will get a list of what to bring." instead.
- Then Q0.1, Senior version, with the line "You can change back any time with the Senior version switch at the top. Your answers are kept."
- No required question: Done once visited.

### 4.2 `notes.anything`

- Q13.1, with the hint "For example, a form you haven't received yet."
- It comes after Documents on purpose, so a client can say 「W-2 还没收到」 here.

## 5. Step 9: Review & submit

### 5.1 `review.check`: Review your application

- Text 1: "Please review your application and check it for accuracy and completeness before you submit it."
- Text 2: "The IRS Volunteer Income Tax Assistance (VITA) program is completely free if you qualify. We will never ask you to pay."
- **The Alerts and warnings panel:**
  - **Alerts, which block Submit:** every missing required answer (`missingToSubmit`, "Needs an answer") and every invalid answer (`invalidAnswers`, "Needs a change"), grouped by step, each linking to its sub-step.
  - **Warnings, which never block:** every **Needed** card that is Not done or Later, each with "Upload now". Until uploads ship, "Upload now" goes to the card in step 7. Maybe needed cards show as one line, "3 more documents may be needed", linking to step 7.
  - **Not listed:** "I'm not sure" answers (a valid answer; the volunteer follows up anyway) and Don't have cards (the client has answered them).
  - When both are empty: "We found no alerts or warnings in your application."
- A same-day client gets no document warnings.

### 5.2 `review.summary`: Your application summary

- Every visible answer, grouped by step and sub-step, through `formatAnswer`.
- **A "Change" link on each sub-step** takes the client there with a return set: on that page the primary button reads "Back to summary", which saves and returns. A rail jump or reaching the summary clears the return.
- **The document cards and their status** (Not done, Later, Don't have; Uploaded in the uploads part), so the printout shows what is still to come. Same-day: the "Bring these" list.
- **Print:** the browser's print, printing only the summary, the Application ID and the date. Today's print stylesheet (`styles.css:2255`) prints only an open modal (the reference card), so the summary print adds a class to `<body>` for the length of the print (removed on `afterprint`) that switches to a summary-only rule. The reference card's print is unchanged.
- **View Draft 13614-C**, and beside it "简体中文版 · 繁體中文版" (§7).

### 5.3 `review.submit`: Submit

- "I have checked my answers", then Submit.
- **4b's rule stays:** Submit is disabled until there are no alerts and the box is ticked. (Add a case's option (a), "enabled once ticked", is the office's rule only.)

### 5.4 After Submit: the progress page

- As today, plus:
- **Open documents:** the Needed cards still Not done or Later. The client can still mark each one Later or Don't have here, and in the uploads part upload from here. Answers stay locked, as today.
- Same-day clients: the "Bring these to your visit" list, printable.

## 6. The Documents step (step 7)

### 6.1 The rules: `src/document-cards.mjs`

- **One table** (Appendix A), one row per card rule:
  - `id` (for example `w2`, `photo_id`, `ssn`);
  - the trigger: a field and the values that show the card, or a named predicate for the computed cases (the custody card, last year's return under Maybe needed);
  - the group: `needed` or `maybe`;
  - the card type: `person`, `shared` or `household`;
  - the sub-step: `identity`, `income`, `expenses`, `events` or `other`;
  - the label, the "why" line with the question it links back to, and an optional hint, each EN/中文.
- **The general and senior forms share it;** only the label wording varies.
- **The answer rule:** yes (or `me` / `spouse` on a Who question) puts the card in Needed. not_sure puts the same card in Maybe needed. no and none hide it. Rows that say otherwise in Appendix A win.
- **Only visible answers count.** A hidden question keeps its answer in the draft (the earlier spec's §3.4), so `cardsFor` reads answers through `isVisible`. Otherwise, for example, a stale `inc_sale_assets_prior_loss = yes` behind `inc_sale_assets = no` would still ask for last year's return.
- **Rows that share an id and an owner make one card** (`bank`, `prior_return`). The strongest group wins: Needed over Maybe needed.
- **`cardsFor(answers, cardState)`** is pure. It returns the visible cards. Each card has:
  - its `slotId`: `<rule id>.<owner>`, where the owner is `tp`, `sp`, `hh.<member_id>` or `household`;
  - its owner line (§6.5);
  - its group, after any staff move (§6.4);
  - its status.
- **A server copy of the rule ids, each with its card type** (§9.2), lets the server check a slot id. A test keeps the two lists in step.

### 6.2 A stable id for household members: `hh[].member_id`

- Today a household member is only a position in the list, so removing member 2 would move member 3's cards onto someone else. Each member therefore gets a hidden `member_id`.
- **Required, but never a missing answer.** It is a catalogue sub-field with a new hidden type, `id`. The renderer, `isAnswered`, `missingToSubmit` and the server's `intake_missing` all skip it, so it never shows as "Needs an answer". Instead, the save refuses a household member whose `member_id` is missing, malformed or a duplicate within the case (`VALIDATION`). The id is 32 lowercase hex characters (`crypto.randomUUID()` without the dashes).
- **No backfill.** No screen sets a workspace to version 2, so version-2 cases exist only in tests, which reseed.
- **Never shown, never edited:** each household card carries it in a hidden input, `readField` and `readForm` read it, and "Add a person" generates it.
- **It doesn't count as an answer.** 4b keeps a just-added, empty household card as `{}` and drops it from every save (`sendable`). A new card now holds `{ member_id }`, so "empty" means no key but `member_id`.
- **Everything that writes a version-2 household member creates one:**
  - `makeSampleAnswers({ version: 2 })`;
  - `tests/support/intake-value-cases.mjs` and the intake tests;
  - 4c's Add a case;
  - any version-2 database fixture 4c adds. (Today's seeded fixtures, `009`'s `fixture_answers`, are all version 1.)

### 6.3 Card state: the table `case_document_cards`

- **One row per (case, `slot_id`):**
  - `status`: `later`, `none` or null. No row, or a null status, means Not done. `uploaded` arrives with the uploads part.
  - **Rows are never deleted.** Realtime publishes inserts and updates only (`007_realtime_publication.sql:50`), because a deleted row can't be checked against the read policy. "Not done" is an update to null.
  - `group_override`: `needed` or null;
  - `changed_at`. **No person column** (decided 2026-10-04): the client reads its own rows, and realtime sends them whole, so a staff person's id would reach the client. Who made each change is in `case_events`, which only staff read.
- **When an answer change hides a card,** its row stays. If the answer comes back, the card comes back with its state.
- **Actions:**
  - **`SET_DOCUMENT_CARD {slotId, status}`**, where status is `later`, `none` or `not_done` (which sets the status to null).
    - Who:
      - the client, on their own case;
      - or a staff persona who works on the case (013's `works_on_case`: office staff, `followup` or `admin`, on any case; a volunteer only as its preparer or reviewer), on an office draft (Add a case) or on any case after it has been submitted (decided 2026-10-04, migration 018 in 4c; 4b2's 017 allowed only `admin`);
      - never staff on a client's unsent draft.
    - When: at any stage except `closed`. Submitting moves a case from `draft` to `received` and on; there is no stage called "submitted".
    - It writes a `case_events` row. Those are staff-only (`002_workflow_schema.sql:138`), so the client sees no history line.
  - Both actions are version 2 only: a version-1 case refuses them (`VALIDATION`).
  - **`SET_DOCUMENT_GROUP {slotId, group}`**, where group is `needed` or `maybe`.
    - Who: a staff persona who works on the case, as for marks (decided 2026-10-04, migration 018 in 4c; 4b2's 017 required `receive_documents`). So the preparer who runs the interview can move a household member's card to Needed once the interview confirms the person goes on the return.
    - What it changes: it moves a Maybe needed card up to Needed, or a card it moved back down. A card that is Needed because of an answer can't be moved down.
    - It writes a case event.
- **Checks:** the rule id is known, the owner kind fits the rule's card type, and a `hh.<member_id>` owner is well formed. A card need not be visible to have state.
- **Reading:** a select policy like `case_contacts`'s (`011_intake_v2.sql:379`): the client sees their own case's rows, and staff see a case's rows once it is not a client's unsent draft. `getCase` returns them as `documentCards`. The table joins the realtime publication, which carries inserts and updates, so a mark in one window shows in the other. The case's revision bump also refreshes it.
- **Revisions:** card actions bump the case revision like every action. §3.8 keeps that from raising the conflict screen.

### 6.4 The screen

- **Each sub-step lists its Needed cards first,** then a collapsed "Maybe needed" group.
- **A card shows:**
  - the document name in bold, and the owner;
  - the "why" line, linking to the question that asked for it;
  - **Take a photo** and **Choose a file**, as two buttons, because the `capture` attribute on one input blocks the file picker on some phones. Until the uploads part ships, both are disabled, with the note "Uploading arrives soon. For now, bring it or mark it below.";
  - **I will send it later** and **I don't have this**;
  - its status as an icon and a word: Not done · Later · Don't have.
- **The sub-step's mark** reads "Needs documents" while a Needed card is Not done (§3.3). Later or Don't have clears it. This never blocks Submit.

### 6.5 Owners

- **Person cards:** one per person, with the person's name.
- **Shared cards:** one per household. The owner line reads "For you / 本人", or "For you and your spouse / 您和配偶" when married. In the uploads part each file gets a "Whose is this? / 这是谁的？" tag (Client / Spouse / Both, shown only when married). The 1098-T tag is the student's name instead.
- **Household cards:** one, "For your household / 全家共用".

### 6.6 Same-day clients (`service = same_day`)

- Step 7 is one sub-step, `documents.bring`: the same cards as a printable checklist, Needed first and then Maybe needed, with no buttons and no statuses.
- Nothing appears in 9.1's warnings.
- If the client changes the service, the four sub-steps come back, with any state they had.

### 6.7 Staff (in 4c)

- The case page shows the cards with their group and status.
- It offers Move to Needed and Move to Maybe needed (`SET_DOCUMENT_GROUP`).
- Add a case has a Documents accordion for marking Later or Don't have for a walk-in. **It shows the full cards with their marks for every service, same-day included:** the person is at the desk, and the office knows what they brought. Only the client's own form uses the "Bring these" list (§6.6).
- After submission, staff who work on the case (the office, or its preparer or reviewer) can also mark a card Later or Don't have on the case page, for example when the client says at the interview that they don't have a 1099.
- On Add a case and the staff checklist the cards speak to the office: "Later" / "Don't have", "Asked by: <question>", and an office upload note. The client's wording is unchanged.

### 6.8 Left to the uploads part

- Storage and encryption.
- The two buttons.
- Thumbnails with remove, and many files per card.
- The per-file tag.
- JPG, PNG, HEIC and PDF, with HEIC converted to JPG on the server.
- A per-file size limit, shown before the upload.
- Files from a card that disappears move to Other documents with a note; a client's file is never deleted without the client's action.
- No thumbnails in the volunteer queue.
- File size limit and storage time, which are open questions for the group.

### 6.9 Not merged, for now

- **Document requests (`004`):** `REQUEST_DOCUMENT`, `RESPOND_DOCUMENT` and `VERIFY_DOCUMENT` stay a separate list. The uploads part decides how a request maps to a card.
- **The office's materials card (4c, `RECORD_MATERIALS`)** stays the record of what was handed over in person.

## 7. The draft 13614-C

### 7.1 The forms

- **All three are Rev. 10-2025, matching our questions:**
  - English: `src/forms/f13614c-2025.pdf`, already in the repo (279 KB, sha256 `160507ac…92992c9d`). It is the Wayback Machine's 2025-11-19 copy of irs.gov's `f13614c.pdf`, supplied by the user. irs.gov now serves only Rev. 10-2026, for tax year 2026, whose questions differ, and the IRS prior-year archive has no 13614-C.
  - Simplified Chinese: `irs.gov/pub/irs-pdf/f13614cn.pdf` (about 1.8 MB).
  - Traditional Chinese: `irs.gov/pub/irs-pdf/f13614ct.pdf` (about 1.9 MB).
- **Stored in the repo** under `src/forms/`, about 3.9 MB in all, because irs.gov most likely won't let another site's browser fetch its files. They're IRS forms and public domain.
- **Pinned by checksum** in a test, so a silent swap can't break the field maps.
- **Each form has 6 pages and 297 fields.** The Form 15080 page is `page6[0]` in all three, with its signature and date fields.
- **The field names match across the three forms,** except four marital-status tick boxes: English `lastDay`/`liveApart`, Chinese `marriedForAll`/`liveWithSpouse`, for the same two questions. Each form has its own field map anyway.
- Moving to tax year 2026 later is a catalogue change for all three forms together.

### 7.2 Filling: `src/form-13614c.mjs`

- **Pure:** answers turn into `{ pdfFieldName: text | true }`, with one field map for each PDF, using names such as `yourFirstName[0]`.
  - **"I'm not sure":** the 2025 forms' income, expense and event items are single "check if yes" boxes, with no Unsure box. A not_sure answer leaves its box unticked and adds one line to Additional Comments, "Not sure: tips, HSA, energy improvements", so the volunteer sees what to ask.
  - Volunteer-only boxes stay blank.
  - Our own questions that have no box on the paper form (service, language, senior version) are left out.
- **Household:** the form has 4 rows. Members 5–10 go into Additional Comments, one line each (name · relationship · born · months · single or married · citizen · resident · student · disabled · IP PIN).
- **Additional Comments** (`page5[0].AdditionalComments[0].AdditionalNotesComments[0]`) holds Q13.1, the "Not sure" line and the household overflow. When the text doesn't fit, the box ends with "(continued on page 7)", and a plain "Additional comments (continued)" page is added. Nothing is cut off.
  - The user's measurements of the box at the forms' own font size: about 5,000 Latin characters on the English form, 1,743 Chinese characters on the Simplified form and 3,569 on the Traditional form.
  - **To investigate in the plan:** a smaller font size (`/DA`) for Chinese text in that box.
- **Form 15080:** when `gcf_consent = yes`, the 15080 page gets the typed signatures and dates (`gcf_tp_signature`, `gcf_tp_date`, `gcf_sp_signature`, `gcf_sp_date`). Otherwise page 6 stays in the PDF, blank.
- **A "DRAFT – prepared from online answers, <date>, <Application ID>" stamp** on every page.
- **The draft is flattened**, not left editable: it's for reading and printing, and it must not look like a finished form.
- **The file** is named `13614-C-draft-<reference>[-zh-s|-zh-t].pdf` and opens in a new tab.
- **Popup blockers:** a tab opened after the PDF is built no longer counts as part of the press, so browsers block it. The press therefore opens the tab at once, showing "Preparing your draft…", and loads the PDF into it when it is ready. If the browser blocked even that, the page shows a "Your draft is ready: open it" link instead.
- The PDF never leaves the browser.

### 7.3 Running in the browser

- pdf-lib and `@pdf-lib/fontkit` get **their own** committed vendor bundle, `src/vendor/pdf-lib.mjs`, built by `tools/build.mjs` from a second entry. `tools/vendor-entry.mjs` stays Supabase-only, as its header requires. The bundle and the PDF load only when the button is pressed (a dynamic `import()`).
- **Chinese characters need an embedded font. No font files go in the repo.**
  - **Fetched from a CDN at runtime, pinned to a version,** because Pages serves only what is committed.
  - **What is fetched must not depend on the text.** Fetching only the pieces a name needs would tell the CDN which Unicode ranges the client's personal details use. So the draft downloads the same file or files whatever the text says: the whole Simplified or Traditional font, cached by the browser after first use.
  - **The plan starts with a spike** that picks the source. Candidates: all of fontsource's pieces for one script (`@fontsource/noto-sans-sc` / `-tc`, about 100 pieces of about 35 KB each), or one OFL-licensed Noto Sans SC/TC file. In brainstorming, glyphs from fontsource pieces drew as dots through pdf-lib, while a TrueType system font drew correctly in the same script. Because one field's appearance can use only one font, the spike also decides whether Chinese text is drawn as text runs on the page (which flattening allows).
  - The font loads only when an answer has a character Helvetica can't encode (Chinese, or Latin letters outside WinAnsi such as "ễ" or "Ł"), whichever form is chosen. A character the downloaded font also lacks prints without its accent, or as `?`, and Additional Comments says so; the draft never fails on a name.
- **A failed draft** writes "The draft could not be made. Close this tab and try again." into the tab it opened, and says the same on the page.

### 7.4 Where the button is

- The client's `review.summary`.
- The staff case page (4c), so a volunteer can print the client's answers on the paper form at the interview.
- Version-2 cases only. Version 1's 17 answers don't map onto the form.

## 8. The sidebar: hover to peek, click to pin (its own PR)

The staff frame's toggle (`appShell` in `src/views.mjs`):

- **Pinned, as today:**
  - Clicking opens the sidebar, which pushes the page. Clicking again collapses it.
  - This is still `sidebarOpen`, saved per window.
- **Peek, new:** while collapsed, a mouse resting on the toggle opens the sidebar **over** the page, without pushing it, so the board doesn't jump.
  - It stays open while the pointer is on the toggle or in the sidebar, and closes 300 ms after the pointer leaves both.
  - Clicking during a peek pins it.
- **After a click collapses the sidebar,** peek stays off until the pointer leaves the toggle. Otherwise it would reopen at once under the cursor.
- **Mouse only.** Touch and pen get no peek (`pointerType`), and their taps behave as clicks.
- **Keyboard:**
  - Focusing the toggle doesn't peek, and Enter or Space pins.
  - Tabbing into a peeked sidebar keeps it open, and Escape closes the peek.
  - `aria-expanded` follows what is visible.
- **Peek is a class change in place, never a render.** `app.mjs` keeps a `peeking` flag, not saved, which a realtime redraw re-applies, so the peek survives it.

## 9. Source changes, migrations and carry-forwards

### 9.1 `intake-questions.md` and the senior version

- **Structure:**
  - no sub-step markers (the build's `STEPS` table defines sub-steps, §2.1);
  - S0 gets the lines in §4.1.
- **Upload Tips:**
  - **The upload convention changes.** "When a Tip says 'upload', show a file-upload button right under that question" becomes "The Tip names the document and says *You will upload it in the Documents step / 您将在「上传文件」步骤上传*." All uploads happen in one place, so the card list stays complete.
  - **Every existing Tip that says "upload"** (for example Q9.9's brokerage statement and Q11.1's 1098-T) is reworded the same way.
  - **Document Tips are added,** using the card labels of Appendix A, to Q9.4, Q9.7, Q9.10, Q9.11, Q9.12, Q9.15, Q10.2, Q10.3, Q10.4, Q10.7, Q10.8, Q11.2, Q11.3, Q11.5, Q11.8, Q11.9 and Q11.11.
  - **Q9.2's Tip** names the tip-records card, including the app's tax summary for drivers.
  - **Q9.14's Tip** adds "If you drive or deliver with an app, also upload the app's yearly tax summary." It stays neutral, with no scope wording.
- **Wording:**
  - Section 9's intro drops "please upload the related tax forms".
  - Q11.12 ("Can you upload last year's tax return?") becomes "Do you have last year's tax return?", since uploads now happen in step 7.
- **The household group:** gains `member_id` (§6.2).
- **The sub-step titles.**
- All new wording, English and Chinese, goes to the group for review.

### 9.2 Migrations in 4b2

The test stack refuses a migration whose text changed after it was applied (`tools/admin/migrate.mjs`, `MIGRATION_CHANGED`), and the build numbers a generated catalogue migration after the highest existing one. So each migration is finished inside one task, and the schema the catalogue needs comes before the generated load:

- **`015_intake_loader.sql`** (hand-written):
  - the hidden field type `id` added to `intake_fields`' type check and to `put_intake_field`;
  - the required, well-formed, unique `member_id` check in `check_intake_value`'s household branch (`intake_missing` needs no change: `member_id` is not `required`);
  - `vitally_private.intake_substeps` (version, id, step, position), and `load_intake_catalogue` extended to fill it from `steps[].substeps[]`.
- **`016_intake_catalogue_<hash8>.sql`** (generated by the build): the new catalogue, including the `gcf_sp_date` condition (moved here from 4c) and `hh.member_id`.
- **`017_documents_and_visits.sql`** (hand-written):
  - `cases.intake_visited`, and `SAVE_ANSWERS`'s optional `visited` key (payload shape, id check, union store that drops stale ids);
  - `case_document_cards`, its select policy and realtime;
  - `SET_DOCUMENT_CARD` and `SET_DOCUMENT_GROUP`: payload checks, authority (§6.3, including the case-dependent half: the client's own case, office drafts and submitted cases), the closed-case and version-1 refusals, and handlers (`commit_action` writes their `case_events` rows);
  - the server's rule list, `vitally_private.document_card_rules()`.
- **4c's migrations follow.** 4c may need no catalogue migration now. The switch-over is **the migration after 4c's last one**, not a fixed number.

### 9.3 The 4b carry-forwards

- **Solved by the design:**
  - the rail's colour-only marks (icon and word, §3.3);
  - `#still-title` focus (the old step 9 is gone).
- **Built in 4b2,** where the code is being rewritten anyway:
  - the `gcf_sp_date` condition;
  - the household note's reference and the group tips' id;
  - date parts (strip non-digits per part);
  - the migration-count test in `tests/intake-build.test.mjs`;
  - Undo after a failed clean save returning to failed;
  - tightening the `REFUSAL_LINES` console check;
  - `reconcileAnswers` not marking the form unsaved when nothing differs.
- **Still parked:** the field-naming save retry, which can't happen until the server names fields.

## 10. The 4c revision

The 4c plan (`docs/superpowers/plans/2026-09-30-intake-screens-4c.md`) is rewritten after 4b2 merges:

- **Its Tasks 1–2 shrink.** The carry-forwards and the `gcf_sp_date` migration moved to 4b2.
- **The staff case page** groups version-2 answers by step and sub-step. It shows the document cards with Move to Needed / Move to Maybe needed, and the View Draft 13614-C button.
- **"I'm not sure" answers are highlighted** on the case page (an icon and the words "Not sure", never colour alone), so the volunteer sees what to ask.
- **Dropped:** the map's "flag the case in the volunteer queue" for digital assets. Nothing designs that flag; it can be raised again as its own feature.
- **Add a case** opens and closes sub-steps instead of sections, and gains the Documents accordion (§6.7). Every household member it adds carries a `member_id`. Its Send rule (option a) is unchanged.
- **The switch-over** is the migration after 4c's last one (020, after 018's card authority and 019's version-2 samples). **It is held until the group's wording review is done (decided 2026-10-04)** and ships as its own small PR; 4c's browser story runs on version 2 through the test fixture meanwhile.
- **Add a case** picks its page by the open case's version, and by the workspace only for a new draft. Its leave check covers the exits that can be reached on the page: Cancel, the breadcrumb's Work board, "Back to Follow-ups", and the sidebar's Work board and All cases. Sign out and the persona switch leave without asking.

## 11. Testing

- **Unit:**
  - `cardsFor`, row by row against Appendix A, with owners, same-day and staff moves; hidden answers ignored; rows sharing an id merged;
  - an empty household card holding only `member_id` dropped from the save;
  - the catalogue's sub-steps (every step has one; every question is in exactly one);
  - visibility, and the hidden and unknown `formSubstep` fallbacks;
  - `formSubstep` and `revealedAnswers` in the window state;
  - visits: leaving a sub-step makes the draft dirty, the save sends `visited`, and a refresh merges it; ids the client's catalogue doesn't know are never sent;
  - §3.8: a newer revision with no answer change moves the base without a conflict; one with an answer change raises it only when this window has unsaved answer or contact changes, and with only visits unsaved takes the newer case and merges the visits; a card action saves first when dirty;
  - the status marks;
  - the 13614-C field maps: every mapped name exists in its pinned PDF;
  - a fictional fill round-trip;
  - household members 5–10, and the continued page.
- **Database:**
  - both card actions and their events;
  - refusals for an unknown rule id, a wrong owner kind, a group move without `receive_documents`, moving an answer-Needed card down, and a closed case;
  - a household member without `member_id`, with a malformed one, or with a duplicate refused, and `intake_missing` never listing it;
  - `visited`: unknown ids sent are refused, the union stored, stored ids no longer in the sub-step list dropped on write, and a payload without it accepted;
  - the card read policy (client sees their own, staff not a client's unsent draft);
  - `SET_DOCUMENT_CARD` from admin staff on a submitted case accepted, and on a client's unsent draft refused; both actions refused on version 1;
  - `not_done` updates the row to null and never deletes it;
  - the server rule-id list matching `document-cards.mjs`.
- **Browser story:**
  - **The client phase walks every visible sub-step once with Continue,** which checks the rail tree and the step boundaries. Everywhere else uses rail jumps.
  - Also covered: the phone header; Change and Back to summary; 9.1's alerts and warnings; the same-day list; the progress page's open documents; ticks kept after reopening in a fresh browser context (visits on the server); the draft 13614-C (English and one Chinese form), including the tab opened during the press.
- **Sidebar PR:** peek, stay, close after leaving, pin, collapse with no re-peek, keyboard, and touch.

## 12. Open for the group

- All new wording, English and Chinese.
- File size limit and storage time (for the uploads part).

## Appendix A: Card rules

"Needed" and "Maybe" are the groups for a yes answer; a not_sure answer always gives Maybe, unless a row says otherwise. Labels are EN / 中文. "Why" lines name the question that asked (for example "You said you had wages from a job / 您说有工资收入").

### A.1 Identity (`documents.identity`)

These come from who is on the form, not from a yes/no answer.

| Rule id | Trigger | Group | Type and owner | Label | Notes |
|---|---|---|---|---|---|
| `photo_id` | always | Needed | person: `tp` | Photo ID (driver's license, state ID, passport) / 带照片的身份证件 | Any document with a photo, name and birth date counts: driver's license, state ID, passport, green card, EAD, Philadelphia city ID, Certificate of Naturalization |
| `photo_id` | `marital_status = married` | Needed | person: `sp` | same | Hint: "Needed if you file together / 如合并申报则需要" |
| `ssn` | always | Needed | person: `tp` | Social Security card or ITIN letter / 社安卡或 ITIN 信 | |
| `ssn` | `marital_status = married` | Needed | person: `sp` | same | Hint as for the spouse's photo ID |
| `ssn` | each household member | **Maybe** | person: `hh.<member_id>` | same | Staff move it to Needed once the interview confirms the person goes on the return (a dependent, or a qualifying person for a credit such as EITC) |
| `ippin` | `ippin` has `me` / `spouse` | Needed | person: `tp` / `sp` | This year's IP PIN letter (CP01A), or a screenshot from your IRS online account / 今年的身份保护码（IP PIN）信（CP01A）或国税局网上账户截图 | |
| `ippin` | `hh[i].ippin = yes` | Needed | person: `hh.<member_id>` | same | |
| `prior_return` | `evt_brought_prior_return = yes` | Needed | household | Last year's tax return (federal and state), and city or local tax return / 去年的报税表（联邦和州）；以及市级/地方纳税申报表 | Hint: "If you filed together last year, upload one return. If you filed separately, upload both. / 去年合并申报的，上传一份；分开申报的，两份都上传。" Also covers a couple who married in 2025 |
| `prior_return` | predicate: `evt_brought_prior_return = no` and any of `inc_state_refund`, `inc_sale_assets_prior_loss`, `inc_self_employed_prior_loss`, `evt_credit_disallowed`, `evt_estimated_payments` is yes | Maybe | household | same | Card text: "If you can find it, last year's return helps the volunteer / 如果能找到，去年的报税表对志愿者很有帮助。" |

### A.2 Income forms (`documents.income`)

All are shared cards (one per household; the per-file tag comes with uploads), unless noted.

| Rule id | Trigger | Label | Notes |
|---|---|---|---|
| `w2` | `inc_wages` | W-2 from each job / 每份工作的 W-2 | Hint from `inc_wages_job_count`: "You said 2 jobs. Upload 2 W-2s." Never blocks on a different count. Overtime and reported tips are on the W-2; if not, the client notes it in step 8 and uploads anything that shows annual tips or overtime |
| `tip_records` | `inc_tips` | Tip records: your tip log, or the tip page of your app's tax summary / 小费记录：自己记的小费账，或平台年度报税摘要中的小费页 | Cash tips not on the W-2 need the client's own record |
| `1099r` | `inc_retirement` | 1099-R (each one) / 1099-R（每一张） | Pub 4012 Tab D: pension, IRA, 401(k), annuity |
| `disability` | `inc_disability` | W-2 or 1099-R for disability pay, or the benefit letter / 残障补助的 W-2、1099-R 或补助通知信 | Workers' comp usually has no form; the letter is enough |
| `ssa1099` | `inc_social_security` | SSA-1099 or RRB-1099 / SSA-1099 或 RRB-1099 | |
| `1099g_unemployment` | `inc_unemployment` | 1099-G for unemployment / 失业金 1099-G | Pennsylvania clients download it from the PA UC site |
| `1099g_refund` | `inc_state_refund` | 1099-G for the state or city tax refund / 州或市退税 1099-G | Also feeds `prior_return` (Maybe) |
| `1099int_div` | `inc_interest_div` | 1099-INT, 1099-DIV, or 1099-OID / 1099-INT、1099-DIV 或 1099-OID | Hint: "Or Form 1042-S, if your bank or broker sent one / 如银行或券商寄来的是 1042-S 表，也请上传". No form under $10 of interest; a year-end statement is fine |
| `1099b` | `inc_sale_assets` | 1099-B and the full brokerage statement; 1099-S if the sale was real estate / 1099-B 及完整券商对账单；如卖的是房地产，上传 1099-S | |
| `digital_assets` | `digital_assets` has `me` / `spouse` (Q5.9) | 1099-DA or the exchange's 2025 gain/loss report / 1099-DA 或交易所的 2025 年盈亏报告 | **Maybe** (holding alone needs no form). No scope message |
| `alimony_received` | `inc_alimony` | Divorce or separation agreement: the page with the date and the alimony terms / 离婚或分居协议中写有日期和赡养费条款的页面 | household card |
| `rental_home` | `inc_rental_home` | Rent records (income and costs), and any 1099-MISC or 1099-K for rent / 租金收支记录，以及租金相关的 1099-MISC 或 1099-K | |
| `rental_property` | `inc_rental_property` | Rent records and any 1099-MISC or 1099-K / 出租记录及 1099-MISC 或 1099-K | |
| `w2g` | `inc_gambling` | W-2G (each one), and loss records if you have them (a handwritten record is fine) / W-2G（每一张），如有输钱记录也请上传（可以接受手写记录） | |
| `1099nec_k_misc` | `inc_self_employed` | 1099-NEC, 1099-K, 1099-MISC (each one) / 1099-NEC、1099-K、1099-MISC（每一张） | |
| `app_tax_summary` | `inc_self_employed` | Rideshare or delivery app annual tax summary (for example, the Uber or Lyft Tax Summary) / 网约车或外卖平台的年度报税摘要 | Card says "If you drive or deliver with an app / 如果您开网约车或送外卖" |
| `business_costs` | `inc_self_employed` | Business costs: mileage log, receipts or summaries (phone, tolls, parking, supplies) / 经营支出：里程记录、收据或汇总（手机费、过路费、停车费、用品） | household card. One summary page is fine |
| `other_income` | `inc_other` | Any form or statement for this income (for example, 1099-MISC, a jury duty pay letter, a union strike pay statement) / 该收入的任何税表或证明（如 1099-MISC、陪审报酬通知、工会罢工补助证明） | Shows `inc_other_desc` on the card |

`inc_self_employed_prior_loss` and `inc_sale_assets_prior_loss` add no card; they feed `prior_return` (A.1).

### A.3 Expenses (`documents.expenses`)

All household cards except `1098e` and `ira_contrib`, which are shared. The volunteer decides standard or itemized; the form asks for the papers either way.

| Rule id | Trigger | Label | Notes |
|---|---|---|---|
| `1098` | `exp_mortgage_interest` | 1098 mortgage interest statement / 房贷利息 1098 表 | |
| `taxes_paid` | `exp_taxes` | Property tax bill or receipt; receipts for large purchases with sales tax (for example, a car) / 房产税单或收据；大额消费的销售税收据（如买车） | |
| `medical` | `exp_medical` | Medical, dental, and prescription receipts, or a yearly summary from the pharmacy or insurer / 医疗、牙科、处方药收据，或药房/保险公司的年度汇总 | |
| `charity` | `exp_charity` | Donation receipts or thank-you letters / 捐款收据或感谢信 | |
| `1098e` | `exp_student_loan` | 1098-E / 1098-E 表 | |
| `dependent_care` | `exp_dependent_care` | Care provider's statement or receipts showing name, address, tax ID, and amount paid / 照护机构或照护者的证明或收据（含名称、地址、税号、金额） | |
| `ira_contrib` | `exp_retirement_contrib` | IRA contribution statement or receipt (Form 5498 if you have it) / IRA 供款证明或收据（如有 5498 表） | |
| `educator` | `exp_educator` | Receipts for classroom supplies / 教学用品收据 | |
| `alimony_paid` | `exp_alimony_paid` | Divorce or separation agreement: the page with the date and the alimony terms / 离婚或分居协议中写有日期和赡养费条款的页面 | |

### A.4 Health and other events (`documents.events`)

Household cards unless noted.

| Rule id | Trigger | Group | Label | Notes |
|---|---|---|---|---|
| `education` | `evt_education` | Needed | 1098-T for each student, plus tuition, fee, and book receipts and any scholarship letter / 每位学生的 1098-T，以及学费、杂费、书费收据和奖学金信 | shared; the uploads part tags each file with the student's name. Add 1099-Q if a 529 plan paid |
| `home_sale` | `evt_sold_home` | Needed | 1099-S and the closing statements for the sale and for the original purchase / 1099-S，以及卖房和当初买房的交割文件 | |
| `hsa` | `evt_hsa` | Needed | 1099-SA and 5498-SA / 1099-SA 和 5498-SA | shared |
| `1095a` | `evt_marketplace` | Needed | Every 1095-A you got / 收到的所有 1095-A | 1095-B and 1095-C are not needed |
| `energy` | `evt_energy` | Needed | Receipts or invoices showing each item, its cost, the labor cost (if listed separately), and the install date; the Qualified Manufacturer ID (QMID) for each item; any rebate or subsidy letter; the home energy audit report, if you had one / 每项设备的收据或发票（含金额、单列的安装人工费、安装日期）；每项设备的制造商识别号（QMID）；任何返利或补贴证明；如做过家庭能源审计，请上传审计报告 | No scope message |
| `other_event` | `evt_other` | Needed | Any paper about this event / 与此事相关的任何文件 | **No keyword rule** for cars; this card covers them |
| `debt_canceled` | `evt_debt_canceled` | Needed | 1099-C or 1099-A / 1099-C 或 1099-A | |
| `disaster` | `evt_disaster` | Needed | FEMA or insurance papers, and records of the loss / FEMA 或保险理赔文件，以及损失记录 | |
| `credit_disallowed` | `evt_credit_disallowed` | Needed | The IRS letter that denied the credit / 国税局拒绝抵免的信 | Also feeds `prior_return` (Maybe) |
| `irs_letter` | `evt_irs_letter` | Needed | Each IRS letter or bill / 每一封国税局信件或账单 | |
| `estimated_payments` | `evt_estimated_payments` | Needed | Payment records: IRS Direct Pay confirmations, IRS online account payment history, or cancelled checks / 付款记录：国税局 Direct Pay 确认、网上账户付款记录或已兑现支票 | Include state payments |
| `visa` | `on_visa` has `me` / `spouse` (Q5.4) | **Maybe** | Visa and entry papers (for example, I-94, I-20, DS-2019) / 签证及入境文件（如 I-94、I-20、DS-2019） | person: `tp` / `sp`. Line: "Helps the volunteer check your residency status." No scope message |
| `custody` | predicate: `marital_status ≠ married` and a household member with `months_lived < 6` | **Maybe** | Form 8332 or the custody pages of the court order, if you have them / 8332 表或法院监护权文件（如有） | |
| `bank` | `refund_method` is direct deposit or split | **Needed** | A voided check or a bank letter with routing and account numbers / 作废支票或写有路由号和账号的银行信 | Hint: "The account must be in your name (or your spouse's)." Decided with a VITA-site volunteer over Pub 4012's "maybe" |
| `bank` | `payment_method = bank_account` (and not already Needed) | Maybe | same | |

### A.5 Other documents (`documents.other`)

| Rule id | Trigger | Label | Notes |
|---|---|---|---|
| `other` | always | Other documents / 其他文件 | **Optional** (decided 2026-10-04): always shown, upload buttons only, no Later / Don't have, never counted in a mark, 9.1's warnings or the progress page. Anything the list doesn't name. Prompt: "For example, a city tax notice, or a blank local tax form you received." |
