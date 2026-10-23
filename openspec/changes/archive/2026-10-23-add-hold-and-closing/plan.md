# Waiting for documents, Hold, closing reasons and withdrawal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the office ask for documents at intake and chase an unreachable client on Hold; record why every case closed and tell the client accordingly; let the client withdraw their own application.

**Architecture:**
- **Database:** migration 036 adds two stages, three `cases` columns (two origins and the closing reason) and a follow-up purpose. It adds four actions behind `vitally_apply_action`, rewrites `CLOSE_CASE`, and opens the document receive/verify path to the new stages.
- **Browser:** derives names, messages, stepper placement, list placement and the withdraw button from the stage plus those columns.

**Tech Stack:**
- Supabase Postgres (plpgsql, RLS), with migrations applied by `tools/admin/migrate.mjs`;
- plain ES modules in `src/`;
- `node:test`;
- the Playwright story in `tests/browser.mjs`.

**Spec:**
- `openspec/changes/add-hold-and-closing/specs/` (`case-lifecycle`, `office-follow-up`, `client-intake`, `screen-states`);
- `design.md` (D1–D14);
- `brainstorm.md` (the agreed design and the wording drafts).

Every user-visible string below comes from the specs; the spec wins if they differ.

## Global Constraints

- Fictional data only, in tests, fixtures, samples and screenshots.
- Never edit an applied migration. All database changes go in `supabase/migrations/036_hold_and_closing.sql`.
- Every function 036 redefines is copied verbatim from its newest definition, with changed lines marked `-- 036`, and listed in the header table:
  - from 035: `check_payload`, `act_close_case`, `check_operation_authority`, `vitally_apply_action`, `fixture_keys`, `fixture_history`, `apply_fixture_scenario`, `fixture_answers_v2`;
  - from 004: `receive_document`, `act_verify_document`;
  - from 018: `check_authority`;
  - from 033: `act_resolve_followup`, only if needed.
- 036 is idempotent: `if not exists`, `create or replace`, drop-then-add.
- Staff screens stay English. Client text lives in `src/client-text.mjs` (English and 简体), and 繁體 is generated: run `npm run build:hant` and commit `src/zh-hant.mjs`.
- Stage keys are `awaiting_documents` and `on_hold`. Closing reasons are `out_of_scope`, `no_need_to_file`, `duplicate`, `dismissed`, `withdrawn` and `other`.
- No client message or history line contains a phone number, a hold note or a close note.
- Error codes as today: `VALIDATION`, `INVALID_TRANSITION` (shown as not available), `FORBIDDEN`.
- Never run `supabase start` from the repo root.
- Commit after each task, with the subject prefix "Hold and closing:".

## Review Focus

1. **A documents hold resolved by an upload.** Verifying the last request on a Hold from Waiting for documents lands on the documents' origin (Screening or Pending intake / filing), and clears **both** origins. Test in Task 3.
2. **Two moves at once.** A client withdraws while an admin closes or puts the case on hold at the same revision: exactly one succeeds, and the other gets the existing revision conflict. Test in Task 4.
3. **Notes typed with HTML** in a hold note or a close note are escaped in the staff history, and never appear on any client screen. Tests in Tasks 4 and 8.
4. **Cases closed before reasons existed** render everywhere: the pool's "No reason" filter, the staff name "Closed", and the client's generic message. Tests in Tasks 4, 7 and 8.
5. **The Withdraw button** shows at exactly the D7 stages. A Hold from Ready to exit shows the "contact PCDC" line, not the button. Test in Task 8.

---

### Task 1: Migration 036, part 1 — stages, columns, documents at intake

**Files:**
- Create: `supabase/migrations/036_hold_and_closing.sql`
- Create: `tests/database-hold.mjs` (picked up by the `tests/database*.mjs` glob)

**Interfaces:**
- Produces:
  - stage values `awaiting_documents` and `on_hold`;
  - `cases.documents_origin` (`screening` | `preparation_ready` | null), `cases.hold_origin` (`awaiting_documents` | `review_approved` | null), `cases.closing_reason` (the six keys | null);
  - the constraints `cases_documents_origin` (set exactly when the stage is `awaiting_documents`, or `on_hold` with `hold_origin = 'awaiting_documents'`), `cases_hold_origin` (set exactly when the stage is `on_hold`), and `cases_closing_reason` (set only when the stage is `closed`);
  - the action `REQUEST_DOCUMENTS_AT_INTAKE {requests: [{title, message}, …]}` (1–5 items) and `vitally_private.act_request_documents_at_intake(p_member, p_case, p_person, p_payload) returns jsonb`;
  - `vitally_private.return_from_documents(p_case public.cases) returns boolean`: if no request is left `open` or `awaiting_verification`, it moves the case to `documents_origin`, clears both origins, and returns true;
  - `receive_document` and `act_verify_document`, opened to the new stages.
- [ ] **Step 1: Write the failing tests** in `tests/database-hold.mjs`, using `createDatabaseFixture` (helpers as in `tests/database-filing.mjs`). Get a case at Screening with `f.submittedClientCase()`, then `START_SCREENING` by `f.sam`.
  - `"the stage check and origin constraints"`: direct `f.sql` updates. `awaiting_documents` with `documents_origin = 'screening'` succeeds. `awaiting_documents` with a null origin fails. `on_hold` with a null `hold_origin` fails. `closing_reason` on a non-closed stage fails.
  - `"asking for documents at screening"`: `REQUEST_DOCUMENTS_AT_INTAKE {requests: [{title: "Photo ID", message: "A fictional note."}]}` by `f.sam` → stage `awaiting_documents`, `documents_origin = 'screening'`, one `open` request by `f.sam`, and the client message `"PCDC asked for these documents: Photo ID."`. The same from `preparation_ready` → origin `preparation_ready`. Two requests `"W-2"` and `"Photo ID"` in one move → one event, with the message `"PCDC asked for these documents: W-2, Photo ID."`.
  - Refusals:
    - `f.alex`, `f.morgan`, null, and `f.applicantA` → `FORBIDDEN`;
    - at `preparing` → `INVALID_TRANSITION`;
    - 0 requests, 6 requests, a blank title, an extra key → `VALIDATION`.
  - `"the client answers and the office verifies"`:
    - `RESPOND_DOCUMENT` by `f.applicantA` at `awaiting_documents` succeeds;
    - `VERIFY_DOCUMENT` by `f.alex` (a preparer) → `FORBIDDEN`;
    - `VERIFY_DOCUMENT` by `f.sam` → stage `screening`, both origins null, and a client message `"PCDC is working on your application again."` after the verify line.
  - `"a second request keeps it waiting"`: two requests; verifying one leaves the stage at `awaiting_documents`.
  - `"the preparer's loop is unchanged"`: a `f.preparedCase()`-style case at `preparing` with `REQUEST_DOCUMENT` by its preparer stays `preparing`.
- [ ] **Step 2:** Run `npm run db:migrate:test && npm run test:database -- --test-name-pattern="stage check and origin|asking for documents|answers and the office|second request|loop is unchanged"`. Expected: FAIL.
- [ ] **Step 3: Write 036's first sections:**
  - the header table;
  - the stage check (drop then add: 035's list plus the two new keys);
  - the three columns and their constraints;
  - `check_payload` (copied from 035) with the `REQUEST_DOCUMENTS_AT_INTAKE` branch (titles and messages use the same `payload_text` limits as `REQUEST_DOCUMENT`);
  - `act_request_documents_at_intake`: one event per move, with the message `'PCDC asked for these documents: ' || titles joined with ', ' in payload order || '.'` and detail `{requestIds}`;
  - `return_from_documents`;
  - `receive_document` (from 004), opened to `awaiting_documents` and to `on_hold` with `hold_origin = 'awaiting_documents'`;
  - `act_verify_document` (from 004): at those stages it requires `'admin'` in the person's capabilities instead of `require_case_preparer`, then calls `return_from_documents`. When that returns true, it adds the extra client line. Follow the multi-line pattern `act_record_filing_result` uses in 035, or insert a second event the way the database writes events (read `vitally_apply_action`'s event insert first).
  - `check_operation_authority` (from 035): `REQUEST_DOCUMENTS_AT_INTAKE` joins the admin-only group;
  - `vitally_apply_action` (from 035): a dispatch line.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run the full `npm run test:database`. Expected: all pass.
- [ ] **Step 5:** Commit: `Hold and closing: 036's stages, origins and documents at intake`.

### Task 2: Hold

**Files:**
- Modify: `supabase/migrations/036_hold_and_closing.sql`
- Test: `tests/database-hold.mjs`

**Interfaces:**
- Consumes: Task 1's columns and `return_from_documents`.
- Produces:
  - `PUT_ON_HOLD {confirmed: true, note?}` (note 1–1000 characters, stored only in the event detail) and `act_put_on_hold`. Its client line is `"PCDC is trying to reach you."`.
  - `RESUME_FROM_HOLD {confirmed: true}` and `act_resume_from_hold`. Its client line is `"PCDC is working on your application again."`.
- [ ] **Step 1: Write the failing tests:**
  - `"a documents hold"`: from `awaiting_documents` → `on_hold`, `hold_origin = 'awaiting_documents'`, `documents_origin` kept. `RESUME_FROM_HOLD` goes back to `awaiting_documents`, with `hold_origin` null.
  - `"the upload ends the hold"` (Review Focus 1): at a documents hold, the client responds and `f.sam` verifies the last request → stage `screening`, with **both** origins null.
  - `"a signing hold"`: from `review_approved` (`f.approvedCase()`) → `on_hold`, `hold_origin = 'review_approved'`. `MARK_READY_TO_EFILE` gives `INVALID_TRANSITION`. `RESUME_FROM_HOLD` goes back to `review_approved`.
  - `"hold refusals"`:
    - at `preparing` and at `screening` → `INVALID_TRANSITION`;
    - volunteers → `FORBIDDEN`;
    - a 1001-character note, no `confirmed` → `VALIDATION`;
    - `RESUME_FROM_HOLD` when not on hold → `INVALID_TRANSITION`.
  - `"the hold note stays with staff"`: the note is in the staff history detail, and no client message contains it.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement** the two `check_payload` branches, the two handlers, the authority group (admin-only), and the dispatch lines.
- [ ] **Step 4:** Run `npm run db:migrate:test && npm run test:database`. Expected: PASS.
- [ ] **Step 5:** Commit: `Hold and closing: put on hold and got in touch`.

### Task 3: Close with a reason

**Files:**
- Modify: `supabase/migrations/036_hold_and_closing.sql`
- Test: `tests/database-hold.mjs`, plus every database suite that sends `CLOSE_CASE` (find them with `rg -l CLOSE_CASE tests`)

**Interfaces:**
- Produces:
  - `CLOSE_CASE {confirmed: true, reason, note?}`;
  - `vitally_private.closed_line(p_reason text) returns text`: the spec's English closed message per reason, with today's generic line for `other`.
- [ ] **Step 1: Write the failing tests:**
  - `"each reason closes and tells the client"`: one case per reason → `closing_reason` stored, and the last client message is `closed_line(reason)`. For `dismissed` that is `"PCDC could not reach you, so this application was closed. Your return was not filed."`.
  - `"other needs a note"`: without a note → `VALIDATION`. With the note `"Client chose another preparer"` → closed, the note in the staff detail, and no client message containing it.
  - `"close refusals"`: a missing reason, an unknown reason, a 1001-character note → `VALIDATION`.
  - `"close from the new stages"`: from `awaiting_documents`, and from `on_hold` with each origin → closed, origins null, open requests cancelled.
  - `"older closed cases"`: a case closed through `f.sql` with `closing_reason` null stays valid.
  - **Update** every existing `CLOSE_CASE` call in the suites to send a reason (for example `{confirmed: true, reason: "other", note: "<the old reason text>"}`, keeping their meaning).
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - the `CLOSE_CASE` branch of `check_payload`;
  - `closed_line`;
  - `act_close_case` (from 035) allowing `awaiting_documents` and `on_hold`, storing the reason, clearing the origins, putting the note in the detail, and returning `closed_line`.
- [ ] **Step 4:** Run `npm run db:migrate:test && npm run test:database`. Expected: PASS.
- [ ] **Step 5:** Commit: `Hold and closing: close with a reason`.

### Task 4: The client withdraws

**Files:**
- Modify: `supabase/migrations/036_hold_and_closing.sql`
- Test: `tests/database-hold.mjs`

**Interfaces:**
- Consumes: Task 3's `act_close_case` behaviour and `closed_line('withdrawn')`.
- Produces:
  - `WITHDRAW {confirmed: true}` and `act_withdraw`;
  - the follow-up purpose `withdrawal_notice`.
- [ ] **Step 1: Write the failing tests:**
  - `"withdraw before preparation"`: `f.applicantA` at `preparation_ready` → `closed`, `closing_reason = 'withdrawn'`, the client message `"You withdrew your application. Your return was not filed."`, and no `admin_followups` row with purpose `withdrawal_notice`.
  - `"withdraw during preparation"`: at `preparing` with `f.alex` as preparer → closed, plus exactly one open `withdrawal_notice` follow-up with no request. `RESOLVE_FOLLOWUP {outcome: "reached", …}` by `f.sam` resolves it, and the case stays closed.
  - `"withdraw at review"`: at `reviewing` → a notice; at `review_ready` → none.
  - `"withdraw refusals"`:
    - at `draft`, `review_approved`, `on_hold` from `review_approved`, `ready_to_efile`, `efiled`, `closed` → `INVALID_TRANSITION`;
    - `f.presenter` with any person, and a second applicant → `FORBIDDEN`;
    - no `confirmed` → `VALIDATION`.
  - `"withdraw races a hold"` (Review Focus 2): two actions at the same expected revision, `WITHDRAW` and `PUT_ON_HOLD` on an `awaiting_documents` case → exactly one succeeds.
  - `"a close note with HTML"` (Review Focus 3): a close note `<b>x</b>` is stored as typed in the detail.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - the purpose constraint (from 033) gains `withdrawal_notice` (drop then add);
  - the `WITHDRAW` branch of `check_payload`;
  - `check_operation_authority`: `WITHDRAW` joins `RESPOND_DOCUMENT`'s applicant-only group;
  - `check_authority` (from 018): `WITHDRAW` requires `p_case.owner_user_id = p_member.user_id`, as `RESPOND_DOCUMENT` does;
  - `act_withdraw`, which shares the close steps with `act_close_case` (extract a private `close_case_steps(p_case, p_reason, p_note)` if both would repeat the cancellations), then inserts the notice when the stage was `preparing`, `corrections_required` or `reviewing`;
  - the dispatch line.

  If `RESOLVE_FOLLOWUP` on a closed case is refused, allow it only for an open `withdrawal_notice` (D8), with the copy rule.
- [ ] **Step 4:** Run `npm run db:migrate:test && npm run test:database`. Expected: PASS.
- [ ] **Step 5:** Commit: `Hold and closing: the client withdraws`.

### Task 5: Samples

**Files:**
- Modify: `supabase/migrations/036_hold_and_closing.sql`
- Test: `tests/database-fixtures.mjs`, `tests/support/database-fixture.mjs` (`FIXTURE_KEYS`), and every test that counts samples (`rg -n "eight|8 samples|\b8\b" tests/database-*.mjs` as a starting point)

**Interfaces:**
- Produces: the fixture keys `on_hold` and `withdrawn`, appended after `accepted`.
- [ ] **Step 1: Write the failing tests:**
  - **The key list** has ten entries.
  - **`on_hold`** reads as:
    - stage `on_hold`;
    - `hold_origin = 'awaiting_documents'`, `documents_origin = 'screening'`;
    - one `open` request titled `"Photo ID"`.
  - **`withdrawn`** reads as:
    - stage `closed`, `closing_reason = 'withdrawn'`, with a preparer;
    - one open `withdrawal_notice` follow-up;
    - its last client line is the withdrawal line.
  - Every sample count in the suites becomes ten.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement:** `fixture_keys`, `fixture_answers_v2` (two new fictional clients, following 035's two rows), `fixture_history`, and `apply_fixture_scenario` (from 035), with these end states. Messages come from the same SQL helpers the moves use.
- [ ] **Step 4:** Run `npm run db:migrate:test && npm run test:database`. Expected: PASS.
- [ ] **Step 5:** Commit: `Hold and closing: the on_hold and withdrawn samples`.

### Task 6: Contracts, domain, builders, store

**Files:**
- Modify: `src/contracts.mjs`, `src/domain.mjs`, `src/case-actions.mjs`, `src/supabase-store.mjs`
- Test: `tests/contracts.test.mjs` (or wherever `STAGES` is asserted), `tests/domain.test.mjs`, `tests/case-actions.test.mjs`, `tests/store.test.mjs`

**Interfaces:**
- Produces:
  - **Contracts:** `STAGES` gains `awaiting_documents` and `on_hold`. `CASE_ACTIONS` gains `REQUEST_DOCUMENTS_AT_INTAKE`, `PUT_ON_HOLD`, `RESUME_FROM_HOLD` and `WITHDRAW`. `CLOSING_REASONS` is the six keys in spec order.
  - **Record fields:** `record.documentsOrigin`, `record.holdOrigin`, `record.closingReason`.
  - **In `src/domain.mjs`:**
    - `holdKind(record) -> 'documents' | 'signing' | null`;
    - `WITHDRAW_STAGES` (the D7 list);
    - `canWithdraw(record) -> boolean`: in `WITHDRAW_STAGES`, or `on_hold` with `holdOrigin === 'awaiting_documents'`;
    - `CLOSING_REASON_NAMES` (the staff names from the spec);
    - `describeStage(stage, lang, record)` gains:
      - the new staff names and client labels;
      - Closed's staff name `"Closed · <reason name>"`, or `"Closed"` with no reason;
      - the Hold messages by `holdKind`;
      - the closed message by `closingReason`, with the generic message for `other` and null.
  - **Builders** in `src/case-actions.mjs`:
    - `REQUEST_DOCUMENTS_AT_INTAKE`: form fields `request-title-1`…`request-title-5` and `request-message-1`…`request-message-5`; rows with an empty title are skipped; refuse "Ask for at least one document." when none is left;
    - `PUT_ON_HOLD`: `hold-note` and a confirmation;
    - `RESUME_FROM_HOLD`: a confirmation;
    - `WITHDRAW`: `withdraw-confirmed`;
    - `CLOSE_CASE`: radio `close-reason`, textarea `close-note`; refuse "Choose a reason." and, for Other, "Add a note for Other.".
- [ ] **Step 1: Write the failing tests:**
  - **`describeStage` staff names:**
    - `"closed"` with `{closingReason: "duplicate"}` → label `"Closed · Duplicate"`;
    - with null → `"Closed"`;
  - **`describeStage` client messages:**
    - `"on_hold"` with `{holdOrigin: "review_approved"}` → the signing Hold message, en and zh;
    - `"closed"` with `{closingReason: "dismissed"}` → the dismissed message;
  - **`canWithdraw`:** true at each D7 stage and at a documents hold; false at a signing hold, `draft` and `review_approved`;
  - **the builders'** payloads and refusals.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the above, and map the three columns in the store.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `Hold and closing: contracts, names, builders and store`.

### Task 7: Staff screens and lists

**Files:**
- Modify: `src/admin-views.mjs` (the office actions panel, the screening checks panel, the close dialog), `src/staff-views.mjs` (`LIFECYCLE` marks, `stageWork`, `EVENT_SENTENCES`), `src/pool-views.mjs` (`poolPhase`, a Closed reason filter), `src/office-views.mjs` (`QUEUE_KINDS`, `followupQueue`, row texts, tone), `src/app.mjs`, `src/views.mjs`
- Test: `tests/admin-views.test.mjs`, `tests/staff-views.test.mjs`, `tests/pool-views.test.mjs`, `tests/office-views.test.mjs`, `tests/fixtures/confirm-dialogs.json`, `tests/empty-states.test.mjs` and its fixture, `tests/shell.test.mjs`

**Interfaces:**
- Consumes: Task 6's helpers and builders.
- Produces:
  - **Data-actions:** `open-request-documents`, `open-put-on-hold`, `open-resume-from-hold`; the close dialog keeps `open-close-case` (check its current name).
  - **`QUEUE_KINDS`** gains `["documents", "Waiting for documents"]`, `["hold", "Hold"]` and `["withdrawn", "Withdrawn"]`.
  - **The pool filter key** `poolReason` (`all` | the six | `none`).
- [ ] **Step 1: Write the failing tests:**
  - **The office panel's buttons by stage:**
    - Ask for documents… at `screening` and `preparation_ready`;
    - Put on hold… at `awaiting_documents` and `review_approved`;
    - Got in touch… at `on_hold`;
    - Close… with six reason radios and a note.

    Volunteers see none of them.
  - **The screening panel** offers Ask for documents… while the documents box isn't ticked.
  - **The dialogs** name the client and the application ID. Update `tests/fixtures/confirm-dialogs.json` for the new dialogs and the changed close dialog.
  - **`poolPhase`:** `awaiting_documents` → `signing`, `on_hold` → `attention`. The Closed reason filter: `withdrawn` lists only withdrawn cases; `none` lists only cases with a null reason (Review Focus 4).
  - **`followupQueue` texts:**
    - `"Waiting for the client's documents."`, amber at 3 days;
    - `"Can't reach the client about documents."` and `"Can't reach the client to sign Form 8879."`, never coloured;
    - `"The client withdrew; tell Alex Rivera to stop work."` from an open `withdrawal_notice`, never coloured;
    - a held signing case has no Signing row.
  - **The lifecycle bar:** an `awaiting_documents` case from `screening` marks the Screening step. An `on_hold` case from `review_approved` marks Ready to exit.
  - **`stageWork`:** the two new texts. **`EVENT_SENTENCES`:** the four new actions ("asked for documents", "put the case on hold", "recorded that the office got in touch", "the client withdrew the application").
  - **A hold note `<b>x</b>`** renders escaped in the staff history (Review Focus 3).
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement and wire them, with the toasts "The documents are requested.", "The case is on hold.", "The case is back in progress." and "The case is closed.".
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `Hold and closing: staff screens and lists`.

### Task 8: The client

**Files:**
- Modify: `src/client-text.mjs`, `src/client-views.mjs` (`PROGRESS_STEPS` placement by record, the withdraw button and dialog, the requests listed at Waiting for documents and at a documents Hold), `src/zh-hant.mjs` (generated)
- Test: `tests/client-views.test.mjs`, `tests/client-language.test.mjs`

**Interfaces:**
- Consumes: Task 6's `holdKind`, `canWithdraw` and `describeStage`.
- [ ] **Step 1: Write the failing tests,** with every expected string copied from the spec:
  - **The stepper:** Intake current at `awaiting_documents` and at a documents hold; Signing current at a signing hold.
  - **The status panels:** Waiting for documents in 简体, and each Hold message.
  - **Each closed message.** Older closed cases show the generic message (Review Focus 4). The duplicate message names no other reference.
  - **The Withdraw button** at exactly the `canWithdraw` stages; the line "To withdraw now, contact PCDC." from Ready to exit onward, including a signing hold (Review Focus 5); the dialog's box text in en and 简体.
  - **No rendered client page** contains a hold note or a close note.
  - **Translations:** every new fixed history line has a 简体 entry (`"PCDC is trying to reach you."`, `"PCDC is working on your application again."`, the withdrawal line, and the five closed messages), and none contains a phone number.
  - **The intake request line, by prefix:** `historyLine("PCDC asked for these documents: W-2, Photo ID.", "zh-Hans")` returns exactly `"PCDC 请您提供以下文件：W-2, Photo ID。"`. In `zh-Hant`, the template is converted and the titles are unchanged. In `en`, the line is unchanged.
- [ ] **Step 1b:** In `src/client-text.mjs`, add `DOCUMENTS_PREFIX = "PCDC asked for these documents: "` beside `REQUEST_PREFIX`, and the key `history.requested_documents` (`en: "PCDC asked for these documents: {titles}."`, `zh: "PCDC 请您提供以下文件：{titles}。"`). Extend `historyLine` so a message starting with the prefix fills `{titles}` with the rest minus its final ".", keeping the titles as typed.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Run `npm run build:hant`.
- [ ] **Step 4:** Run `npm test` and `npm run build:hant -- --check`. Expected: PASS.
- [ ] **Step 5:** Commit: `Hold and closing: what the client reads and the withdraw button` (include `src/zh-hant.mjs`).

### Task 9: The browser story

**Files:**
- Modify: `tests/browser.mjs`, `tests/support/story-pages.mjs` (sample count)

- [ ] **Step 1:** Using the story's existing helpers:
  - **Update the sample counts** to ten.
  - **Every existing close in the story** picks a reason, Other with a note where the old text was free.
  - **Add the documents flow** on a new client case:
    1. At Screening, the admin uses Ask for documents… with "Photo ID".
    2. Assert Waiting on client in the pool and the client's 简体 message.
    3. The client uploads the sample file.
    4. The admin verifies.
    5. Assert the case is at Screening, then record the checks.
  - **Add the withdrawal flow** on a case a preparer has claimed:
    1. The client withdraws through the dialog.
    2. Assert the pool's Closed tab with reason Withdrawn.
    3. Assert the Follow-ups row "The client withdrew; tell <name> to stop work.", then resolve it.
    4. Assert the client's closed message in 简体.
- [ ] **Step 2:** Run `npm run db:migrate:test`, then `npm run test:browser`. Expected: PASS, with more tests than 65.
- [ ] **Step 3:** Commit: `Hold and closing: the story asks for documents and withdraws`.

### Task 10: Docs

**Files:**
- Modify: `docs/media/return-lifecycle.svg`, `docs/demo-script.md`, `docs/developer/database.md`, `docs/developer/frontend.md`, `docs/developer/production-roadmap.md`, `docs/setup.md`, `README.md`

- [ ] **Step 1: The diagram:** mark Same day and FSA "(not built yet)", and keep the layout. Waiting for documents, Hold and the exits now match the built behaviour; add short sub-labels only where they help. Don't touch any logo.
- [ ] **Step 2: The other docs:**
  - the demo script's simulated/real table;
  - the database guide (four actions, three columns, the purpose, the 036 row);
  - the frontend guide (stages, labels, stepper, pool, Follow-ups, the withdraw button);
  - roadmap §4 (Waiting for documents, Hold, the unreachable client and withdrawal are built; spec §8.2's in-preparation Pending is a design difference);
  - setup and README (ten samples).
- [ ] **Step 3:** Commit: `Hold and closing: diagram and docs`.

### Task 11: Final checks

- [ ] **Step 1:** Run `npm test`, `npm run build:hant -- --check`, `npm run build:intake` (nothing to commit), `npx openspec validate --all`, `npm run db:migrate:test`, `npm run test:database` and `npm run test:browser`. Expected: all pass. Record the counts against the baseline (unit 1279, database 374, story 65). `test:auth-browser` isn't needed.
- [ ] **Step 2:** Check off `tasks.md` to match, and commit.
