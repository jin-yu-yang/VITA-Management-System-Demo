## Context

- **Today** (`main` at `6a9806c`, after #95):
  - Stages run from Draft to Accepted, plus Rejected and Closed.
  - `act_close_case` (035) is admin-only. It takes `{confirmed, reason}` (free text, 1–1000 characters, `check_payload` 035:~307), puts the reason in the staff-only event detail, cancels `open` and `awaiting_verification` requests and open follow-ups, and returns one generic client line. It is allowed from Request sent to Review in progress and from Rejected.
  - Documents are a preparer tool: `receive_document` (004:225, used by `RESPOND_DOCUMENT` and `RECORD_DOCUMENT_RESPONSE`) and `act_verify_document` (004:291) both refuse outside `preparing` and `corrections_required`. Verifying also needs the case's preparer (`require_case_preparer`). `REQUEST_DOCUMENT` (004:251) is the same.
  - Office follow-ups (`admin_followups`) have purposes `request_documents` and `go_over_return` (033:124). `act_resolve_followup` (033:620) resolves one with outcome `reached` or `no_further_contact`.
  - Client-only actions need an applicant session with no persona (`check_operation_authority`, 035). Ownership is checked in `check_authority` (newest 018).
  - Sample keys (035 `fixture_keys`) number eight. One of them, `waiting_documents`, is the preparer's mid-preparation request, at stage `preparing`.
- **Spec:**
  - `case-lifecycle` owns the stages, moves, close rule, names, stepper, lists, case page and client messages;
  - `office-follow-up` owns follow-up purposes;
  - `client-intake` owns the sample count;
  - `screen-states` owns the close dialog's payload scenario.
- **Stakeholders:** the office (admins), clients, and volunteers (the stop-work notice); #90 (no permission changes).
- `brainstorm.md` holds the agreed design (Q1–Q10) and the client wording drafts.

## Goals / Non-Goals

**Goals:**
- Waiting for documents and Hold, as the group's diagram draws them, plus the spec's CantFindClient at signing.
- Closing reasons stored on the case, with a client message per reason.
- The client's own withdrawal, with a stop-work notice for an assigned volunteer.
- The lists, case page and client page for all of it.
- Two samples and two story flows.

**Non-Goals:**
- Same day, FSA, or a Pending stage during preparation.
- Undo of a close or a withdrawal.
- A client-written reason.
- Bulk close at season end.
- Amendments, reassignment, report import, permissions (#90).
- Rewriting stored events or migrating rows.

## Decisions

### D1: Two stages and their keys

- **Choice:** the stage check gains `awaiting_documents` (staff name "Waiting for documents") and `on_hold` ("Hold"). `src/contracts.mjs` `STAGES` gains both, before `closed`.
- **Reason:** brainstorm Q1 and Q9. The `awaiting_documents` key avoids the existing `waiting_documents` sample key.
- **Alternatives considered:** one `on_hold` stage with a reason kind. Rejected: it loses the diagram's escalation.

### D2: Origins are stored on the case

- **Choice:** `cases.documents_origin` (`screening` | `preparation_ready` | null) and `cases.hold_origin` (`awaiting_documents` | `review_approved` | null).
  - Each is set by the move that enters its stage and cleared by the move that leaves it.
  - Check constraints keep them consistent with the stage: `documents_origin` is set exactly when the stage is `awaiting_documents`, or the stage is `on_hold` with `hold_origin = 'awaiting_documents'`; `hold_origin` is set exactly when the stage is `on_hold`.
  - Both are readable by the client (`cases` is client-readable), which is fine: they are stage names, and the client's message depends on `hold_origin`.
- **Reason:** brainstorm Q2 and Q6. The documents hold needs both origins at once, for the automatic return straight to the documents' origin.
- **Alternatives considered:** deriving the origin from the event history. Rejected: fragile, and it needs a query per render.

### D3: "Ask for documents" at intake

- **Choice:** the new admin action `REQUEST_DOCUMENTS_AT_INTAKE {requests: [{title, message}, …]}` (1–5 requests; `title` and `message` with the same limits as `REQUEST_DOCUMENT`).
  - From `screening` or `preparation_ready`: sets `documents_origin` to the current stage, moves to `awaiting_documents`, and inserts the requests with `requested_by_person_id` = the admin.
  - At `awaiting_documents`, and at a documents hold, it adds requests and keeps the stage.
  - **The history line:** one event per move, with the message `'PCDC asked for these documents: ' || string_agg(title, ', ' order by position) || '.'`. It names every title in the order entered, and the detail lists the request ids.
- **Reason:** brainstorm Q6.1. Reusing the request shape keeps the client's upload path unchanged.

### D4: Receiving and verifying at the new stages

- **Choice:** `receive_document` (from 004) also accepts `awaiting_documents`, and `on_hold` with `hold_origin = 'awaiting_documents'`. `act_verify_document` (from 004) accepts the same stages. There, it requires an **admin** instead of the case's preparer. During preparation it is unchanged.
- **After verifying:** if no request is left `open` or `awaiting_verification`, the case returns to `documents_origin`, and `documents_origin` and `hold_origin` are cleared. The verify event's message stays as it is today, and a second event line, "PCDC is working on your application again.", records the return (see D11).
- **Reason:** brainstorm Q6.2–3, including the edge that a documents hold returns straight to the documents' origin.

### D5: Hold

- **Choice:**
  - **`PUT_ON_HOLD {confirmed, note?}`** (admin; note ≤ 1000 characters, in the staff-only event detail): from `awaiting_documents` (`hold_origin` = `awaiting_documents`, `documents_origin` kept) or from `review_approved` (`hold_origin` = `review_approved`).
  - **`RESUME_FROM_HOLD {confirmed}`** (admin, "Got in touch"): back to `hold_origin`, which is then cleared. Open requests stay as they are.
  - **While a case is held from `review_approved`,** Mark ready to e-file is refused, because its stage check requires `review_approved`.
- **Reason:** brainstorm Q2 and Q6.4.

### D6: Closing reasons

- **Choice:** `cases.closing_reason` (`out_of_scope` | `no_need_to_file` | `duplicate` | `dismissed` | `withdrawn` | `other` | null). It is null for every case closed before this change, and set by every new close.
  - **The payload** is `CLOSE_CASE {confirmed, reason, note?}`. `reason` is one of the six, and `note` (1–1000 characters) is required for `other` and optional otherwise.
  - **Where:** `act_close_case` (from 035) also allows `awaiting_documents` and `on_hold`, whatever the hold's origin. It stores the reason, keeps the note in the event detail (staff-only), clears the origins, and keeps today's cancellations.
  - **The client line** is the reason's closed message (D11).
  - A check constraint: `closing_reason` is set only when the stage is `closed`.
- **Reason:** brainstorm Q3. The reason is a fixed kind, so the client may read it. The note is free text, so it stays staff-only.
- **Alternatives considered:** keeping the free text and adding a kind. Rejected: the agreed design replaces the free text.

### D7: The client withdraws

- **Choice:** the new client action `WITHDRAW {confirmed}`.
  - **Authority:** `check_operation_authority` requires an applicant session with no persona, like `RESPOND_DOCUMENT`. `check_authority` (from 018) requires the case's owner.
  - **Stages:** `received`, `screening`, `awaiting_documents`, `on_hold` with `hold_origin = 'awaiting_documents'`, `preparation_ready`, `preparing`, `corrections_required`, `review_ready`, `reviewing`. Any other stage gives `INVALID_TRANSITION`.
  - **The move** does what Close does with reason `withdrawn` (cancellations; origins cleared). Then, if `preparer_id` or `reviewer_id` is set and the stage was `preparing`, `corrections_required` or `reviewing`, it inserts an `admin_followups` row with purpose `withdrawal_notice` and no request.
  - **History:** the client line is "You withdrew your application. Your return was not filed."; the staff history sentence is "the client withdrew the application".
- **Reason:** brainstorm Q4.

### D8: The withdrawal-notice follow-up

- **Choice:**
  - the follow-up purpose check (from 033) gains `withdrawal_notice`, with no request, like `go_over_return`;
  - Follow-ups shows it as its own row, naming the preparer, or the reviewer at `reviewing`, from the case record;
  - it is resolved with `RESOLVE_FOLLOWUP` (outcome `reached` or `no_further_contact`) on a Closed case.
- **To verify in implementation:** `vitally_apply_action` and `act_resolve_followup` must let that action through on a closed case. If they refuse closed cases, allow `RESOLVE_FOLLOWUP` for a `withdrawal_notice` follow-up only.
- **Reason:** brainstorm Q4.5.

### D9: Authority and dispatch

- **Choice:**
  - `check_operation_authority` (from 035): `REQUEST_DOCUMENTS_AT_INTAKE`, `PUT_ON_HOLD` and `RESUME_FROM_HOLD` join the admin-only group; `WITHDRAW` joins the applicant-only group with `RESPOND_DOCUMENT`; `VERIFY_DOCUMENT` stays in the persona group, and its handler decides admin or preparer by stage (D4).
  - `vitally_apply_action` (from 035) gains four dispatch lines.
  - `check_payload` (from 035) gains four branches and rewrites `CLOSE_CASE`.

### D10: Names, stepper and messages (browser)

- **Choice:**
  - **In `src/domain.mjs`:**
    - `describeStage` labels: `awaiting_documents` "Waiting for documents" (staff) and "Documents needed / 需要文件" (client); `on_hold` "Hold" and "Waiting for you / 等待您的回复".
    - Closed's staff name by reason: "Closed · Out of scope", and so on; plain "Closed" when there's no reason.
    - Messages: for `on_hold` by `hold_origin`; for `closed` by `closing_reason` (null and `other` keep the generic message).
  - **`PROGRESS_STEPS`:** `awaiting_documents` goes in Intake. `on_hold` is placed by origin, which needs a record-aware stepper: Intake when from documents, Signing when from `review_approved`.
  - All client strings come from brainstorm Q7, in `src/client-text.mjs`.
- **Reason:** brainstorm Q7.

### D11: History translations

- **Choice:** every new stored English line goes in `SENTENCES`, as a whole string:
  - the five closed messages and the withdrawal line;
  - "PCDC is trying to reach you.";
  - "PCDC is working on your application again.".

  The intake request line contains office-typed titles, so it can't be a whole-string entry. It is translated the way today's preparer request line is (`historyLine`, `src/client-text.mjs:559-564`):
  - a second prefix constant, `DOCUMENTS_PREFIX = "PCDC asked for these documents: "`;
  - when a message starts with it, the rest, minus its final ".", becomes `{titles}` in a new key `history.requested_documents` (`en: "PCDC asked for these documents: {titles}."`, `zh: "PCDC 请您提供以下文件：{titles}。"`);
  - the titles stay as typed.

  A unit test lists the SQL's fixed lines and checks each has a translation. A second test round-trips the prefixed line in 简体 and 繁體.

### D12: The lists and the case page

- **Choice:**
  - **`poolPhase`:** `awaiting_documents` → `signing` (Waiting on client), `on_hold` → `attention`. The Closed tab gains a reason filter (`poolReason`: all, the six, none).
  - **`followupQueue`:** rows with kinds `documents` (Waiting for documents; coloured amber 3 / red 5 by days since the move), `hold` (texts by origin; never coloured) and `withdrawn` (the notice, while it is open). A held `review_approved` case has no Signing row, because its stage is `on_hold`.
  - **The case page:**
    - the office actions panel gains Ask for documents… (also offered from the screening panel when "basic documents present" can't be ticked), Put on hold…, Got in touch…, and Close… with the reason radio and note;
    - the lifecycle bar marks Waiting for documents and Hold on their origin step;
    - "Your next step" texts.
  - **The client page:** a Withdraw button at the D7 stages, a "contact PCDC" line from Ready to exit onward, and the confirmation dialog.
- **Reason:** brainstorm Q8.

### D13: Samples and the story

- **Choice:**
  - `fixture_keys` (from 035) gains `on_hold` and `withdrawn`, so ten in all;
  - `apply_fixture_scenario`, `fixture_history` and `fixture_answers_v2` (from 035) build them, each with its own fictional client:
    - `on_hold`: origin Screening, one open request;
    - `withdrawn`: withdrawn at `preparing` with a preparer, the notice follow-up open.
  - The story adds the two flows from brainstorm Q9.

### D14: Migration 036 copies the newest definitions

Each function is copied verbatim from its newest definition, with changed lines marked `-- 036`:
- from 035: `check_payload`, `act_close_case`, `check_operation_authority`, `vitally_apply_action`, `fixture_keys`, `fixture_history`, `apply_fixture_scenario`, `fixture_answers_v2`;
- from 004: `receive_document`, `act_verify_document`;
- from 018: `check_authority`;
- from 033: `act_resolve_followup`, only if D8's check needs it.

Re-check each function's newest definition just before apply. The constraint changes are drop-then-add.

## Risks / Trade-offs

- [Risk] **Origins drift from the stage.** → Mitigation: the D2 check constraints, and database tests for every entry and exit.
- [Risk] **A client is told "withdrawn" for a case staff are still working.** → Mitigation: the D7 stage list stops at Review in progress, and the stop-work follow-up goes to the office.
- [Risk] **The breaking `CLOSE_CASE` payload.** → Mitigation: the browser builder, the dialog and every test that closes are updated together. `screen-states` is amended.
- [Risk] **Resolving a follow-up on a closed case** may be refused by the shared action path. → Mitigation: D8's check, with a test.
- [Trade-off] **No colour on Hold rows.** → Accepted: holds rightly last weeks; days waiting still show.
- [Trade-off] **The automatic return can surprise an admin** who expected to wait for more. → Accepted: adding a request first keeps the case waiting.

## Migration Plan

1. Apply 036 on the local test stack (`npm run db:migrate:test`), then `npm run test:database`.
2. The changes are additive: two stage values, three nullable columns, one follow-up purpose. Old closed cases keep a null reason.
3. **Rollback:** migrations are final once applied. A fix goes in a new migration.
4. **Before merging:** sync with `main`, and renumber if 036 has been taken.

## Open Questions

- **The wording review of all new client text** (the group): text only.
- **Bulk close of held signers at season end** (PCDC): a later change if wanted.
- (Settled.) **One event per intake move, naming every title** ("PCDC asked for these documents: …"), translated by prefix like the preparer's request line.
