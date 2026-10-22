## Context

- **Today** (`main` at 175259f):
  - `act_mark_efiled` (032, its only definition) moves Ready to e-file → E-filed. It records nothing beyond the confirmation and returns the client line "PCDC e-filed your return.".
  - No move leaves `efiled`.
  - `act_close_case` (032) refuses Ready to exit, Ready to e-file, E-filed and Closed.
  - `check_operation_authority` (032) puts START_SCREENING, MARK_READY_TO_EFILE and MARK_EFILED in its admin-only group.
- **What a client reads.** A client session reads its own `cases` row (`visible_cases`), and `cases` is in the realtime publication. 033 relied on this for `signing_plan`: "the only part of a questionnaire a client reads". Staff-only tables use 013's presenter-only select policy, are written only by the action RPC, and reach the browser through `relatedRows` in `src/supabase-store.mjs`.
- **Histories.**
  - The client history shows the event's stored English sentence. `historyLine` (`src/client-text.mjs`) translates it by exact whole-string lookup in `SENTENCES`, and an unknown line stays English.
  - The staff history renders one sentence per action code (`EVENT_SENTENCES`, `src/staff-views.mjs`).
- **Views.**
  - `PROGRESS_STEPS` (`src/client-views.mjs`) shows no stepper for a stage outside its five steps.
  - `LIFECYCLE` (`src/staff-views.mjs`) takes labels from the stage alone.
  - `poolPhase` (`src/pool-views.mjs`) maps stages to tabs.
  - `followupQueue` (`src/office-views.mjs`) builds rows by `QUEUE_KINDS` and colours them amber at 3 days and red at 5.
- **Samples.** `fixture_keys()` (009) lists six scenarios, and `vitally_reset_fixtures` (023) seeds one sample case per key. They are built by `apply_fixture_scenario` (newest 033) and `fixture_history` (newest 034).
- **Stakeholders:**
  - the office: admins record the filing, the answers and the fix;
  - clients: the messages;
  - volunteers: they read the fix note;
  - #90: staff accounts wait for this change.
- `brainstorm.md` holds the agreed design (Q1–Q12) and the wording.

## Goals / Non-Goals

**Goals:**
- Record each return's filing method and its answer, one return at a time.
- Rejected → fix → sign again → file again, with no new preparation or review pass.
- Accepted as the end.
- Needs attention and Done in the case pool; Filing result and Rejected rows in Follow-ups.
- Clients read where each return stands in English, 简体 and 繁體, and never see a reject code or the fix note.
- The story walks the whole loop, and two new samples show the new tabs.

**Non-Goals:**
- Amendments, reassignment, and TaxSlayer report import.
- A client-facing rejection reason.
- Clickable links in client text.
- Filing again without a new signature.
- Change 3's stages and closing reasons.
- Staff accounts (#90).
- Rewriting stored events or migrating existing rows.

## Decisions

### D1: Stages and keys

- **Choice:**
  - The stage check constraint gains `rejected` and `accepted`.
  - `efiled` stays one stage.
  - `src/contracts.mjs` `STAGES` gains both new stages, after `efiled` and before `closed`.
- **Reason:** brainstorm Q2–Q3. "IRS acknowledged" is the wait at E-filed, not a stage.
- **Alternatives considered:**
  - `efiled_paper` and `paper` stage keys. Rejected: the method is needed after the case has left E-filed.
  - An `acknowledged` stage. Rejected: the software never shows that state.

### D2: Where each return's state lives

- **Choice:** split by who may read it.
  - **On `cases`, which the client reads:** `federal_method`, `state_method` (`efile` | `paper`) and `federal_result`, `state_result` (`accepted` | `rejected` | `mailed`). Null means not yet filed or still waiting.
  - **Check constraints:**
    - the methods are both null, or one of the three combinations (efile/efile, efile/paper, paper/paper);
    - a result is null until its method is set;
    - `mailed` only with `paper`, and `accepted` or `rejected` only with `efile`.

    These four columns are all a client needs for the stepper, the sentences and the labels.
  - **Staff-only table `filing_returns`:** one row per return per filing attempt. It holds `case_id`, `attempt`, `return_kind` (`federal` | `state`), `method`, `filed_at`, `result`, `answered_on` (the acknowledgment or mailing date), `reject_code`, `recorded_by`. A sibling `filing_attempts` (`case_id`, `attempt`, `filed_at`, `filed_by`) records each filing.
  - **Staff-only, append-only table `filing_notes`** (`case_id`, `attempt`, `note`, `recorded_by`, `recorded_at`): one row per fix note, never updated, and deleted only with its whole case (sample reset, sample checkpoint, workspace teardown). A `before update or delete` trigger raises on any other attempt, so even the service role can't rewrite a note. (Rulings during apply: the case-gone exception is deterministic because notes cascade only through their case and filing; the checkpoint exception applies to sample cases only.) The writes are audited by construction: each row records who wrote it and when, and the action's event records that a note was added (not its text).
  - **Access:** all three tables use 013's presenter-only select, are written only by the action RPC, and are loaded by `relatedRows`. They are not added to the realtime publication: a `cases` update already triggers the staff reload.
- **Reason:** the reject code, dates and fix note must never reach a client session, whether by select or by realtime. The `cases` columns carry only what a client is told anyway. Staff see earlier attempts in the Filing panel.
- **Alternatives considered:**
  - Everything on `cases`. Rejected: it would publish codes and the note to the client.
  - A jsonb column. Rejected: constraints are harder, and it's equally visible.

### D3: `MARK_EFILED` records the methods

- **Choice:**
  - The payload is `{confirmed: true, methods: {federal?, state?}}`.
  - **On a first filing,** both returns are required, and the resulting pair must be one of the three combinations.
  - **On a second filing** (the case has methods already), it takes exactly the outstanding returns: those whose result is `rejected`. It may change their method. Accepted and mailed returns are kept, and the resulting pair must still be a valid combination.
  - **The handler:**
    - sets the methods;
    - resets the outstanding results to null;
    - inserts a new attempt with its `filing_returns` rows (accepted and mailed returns are carried forward as rows of the earlier attempt only);
    - moves the case to E-filed.
  - **The history line** follows brainstorm Q7: today's line for a first filing with both returns e-filed, and the per-method lines otherwise.
- **Reason:** brainstorm Q3. One handler covers first and second filings.
- **Alternatives considered:** a separate `MARK_REFILED` action. Rejected: it's the same move from the same stage.

### D4: `RECORD_FILING_RESULT`

- **Choice:**
  - **The payload** is `{confirmed: true, results: {federal?: {result, date, code?}, state?: {…}}, fixNote?}`. It needs at least one return, and only waiting returns (result null).
  - **Each result:**
    - `result` is valid for the return's method;
    - `date` is ISO, not after today and not before the attempt's `filed_at` date;
    - `code` is required (trimmed, non-empty, at most 40 characters) exactly when `rejected`.
  - **`fixNote`** (at most 1000 characters) is allowed when the case is at `rejected` before the move, or the move takes it there. That covers adding a note while recording the second return's answer at Rejected (D5). It is refused on any other move. Each note is inserted as a new `filing_notes` row on the current attempt. An earlier note is never replaced.
  - **The stage after the handler:**
    - any return `rejected` → `rejected`;
    - else every return accepted or mailed → `accepted`;
    - else it stays `efiled`.
  - **Allowed at E-filed, and at Rejected while a return is still waiting** (see D5). At Rejected the stage stays `rejected`.
  - **The client line** is the per-return sentences for the returns recorded in this move (brainstorm Q7).
  - It is admin-only, with no undo.
- **Reason:** brainstorm Q4. Answers arrive separately, and a rejection shouldn't wait for the other return.

### D5: A return still waiting when the other is rejected *(raised while writing this design; confirmed by the user)*

The conversation before propose didn't cover this. Say the federal return is rejected while the PA-40's answer hasn't come yet. The case is at Rejected at once, but the PA answer still has to be recorded.
- **Choice:**
  - Record filing result stays offered at Rejected for the waiting return.
  - **Return to signing is refused until every return has an answer.** The case page and the Rejected row say "Waiting for Pennsylvania's answer before the return can go back to signing."
- **Reason:**
  - The second Mark e-filed has to know which returns are outstanding.
  - If the state return is rejected too, both fixes go into one new signature.
  - PA answers usually arrive within days.
  - The user's point: the state return is usually submitted linked to the federal one, so a federal rejection usually brings a PA rejection too. Fixing and signing once saves a signature.
- **Alternatives considered:**
  - Accepting a late answer at any later stage. Rejected: it adds result-recording to Ready to exit and Ready to e-file, and the second filing could re-send a return the state has since accepted.
  - Refusing Record filing result at Rejected. Rejected: the PA answer would have nowhere to go.

### D6: `RETURN_TO_SIGNING` and the second signing

- **Choice:**
  - **The payload** is `{confirmed: true}`. Allowed only at `rejected`, with no return waiting (D5). Admin-only, no undo.
  - **The move:** Rejected → `review_approved`. The methods and results are kept.
  - **"Returned to signing" is derived, not stored:** stage `review_approved` with `federal_method` set. That one fact drives:
    - the client's re-sign message (instead of the signing-plan variant);
    - the Signing row's "Waiting for the client to sign again.";
    - Mark ready to e-file's second-signing confirmation sentence.
  - `act_mark_ready_to_efile` is copied unchanged from 033. Its gates (the reviewer's call, an open go-over) were met the first time, so the button shows straight away.
- **Reason:** brainstorm Q5. A derived flag needs no column and can't get out of step.
- **Alternatives considered:** a `resign_required` column. Rejected: it's redundant with the methods.

### D7: Close and authority

- **Choice:**
  - `act_close_case` allows `rejected` and refuses `accepted`. Closing still cancels open follow-ups.
  - `check_operation_authority` adds RECORD_FILING_RESULT and RETURN_TO_SIGNING to the admin-only group.
  - `vitally_apply_action` gains two dispatch lines.
- **Reason:** brainstorm Q5.

### D8: Names and labels

- **Choice:** `describeStage(stage, lang, record)` (`src/domain.mjs`) derives the name from the record's methods.
  - **Staff:**
    - `efiled`: Both e-filed / E-filed & paper / Both paper;
    - `accepted`: Accepted / Accepted & mailed / Mailed.
  - **The client:**
    - `efiled`: E-filed / Filed / Mailed;
    - `accepted`: Complete;
    - `rejected`: Needs a correction.
  - **With no methods** (a case e-filed before this change), the staff name is "E-filed" and the client label "E-filed".
  - The lifecycle bar, the pool and Follow-ups pass the record so they show the same name.
- **Reason:** brainstorm Q3, Q8. Cases e-filed before this change have null methods and must still render.

### D9: The client's status message

- **Choice:**
  - A function in `src/client-views.mjs` composes the message from text keys in `src/client-text.mjs`: one key per return × state (federal, state, both-combined) and one per closing sentence.
  - **The rule:** if both returns are in the same state, the combined sentence; else federal then state. Then the stage's closing sentence.
  - **A case with null methods** at `efiled` keeps today's E-filed message.
  - At `review_approved` after Return to signing (D6), the re-sign message.
  - **The stepper:** `rejected` joins the Filing step. `accepted` renders every step done, with the "done" screen-reader text. This is a new branch in `progressTrack`, and `REVIEW_STAGES` gains both stages.
- **Reason:** brainstorm Q6–Q7. Composing in the browser avoids about 16 fixed messages.

### D10: Client history translation

- **Choice:**
  - Every possible stored line is in `SENTENCES` as a whole string. The database composes each line from the same per-return sentences, so the set is finite: Mark e-filed's 3 first-filing lines and 4 second-filing lines, Record filing result's single, combined and mixed lines, and Return to signing's line.
  - A unit test enumerates the combinations the SQL can produce and checks each has a translation.
- **Reason:** keeps `historyLine`'s exact-match rule, and with it the spec's "an unknown line stays English", unchanged.
- **Alternatives considered:** splitting a line into sentences and translating each. Rejected: it changes a shared function's behaviour for every existing line.

### D11: The lists

- **`poolPhase`:**
  - `rejected` → `attention`, `accepted` → `done`;
  - `POOL_TABS` gains "Needs attention" and "Done", after Filing and before Closed.
- **`followupQueue`:**
  - kind `result` ("Filing result") for `efiled` cases, and for `rejected` cases with a return still waiting (D5);
  - kind `rejected` ("Rejected") for `rejected` cases, showing the latest `filing_notes` row's note;
  - the existing `signing` row's text varies per D6.
- **Waiting time:**
  - **since:** `updated_at`, which every move and recorded result updates;
  - **tone:** only when a return is waiting for an e-file acknowledgment (method `efile`, result null). A row that only waits for a paper mailing record, and the Rejected row, are never coloured.
- The work board is unchanged.
- **Reason:** brainstorm Q9.

### D12: The case page

- **The lifecycle bar:** `LIFECYCLE` gains `accepted` after `efiled`, and `rejected` marks the `efiled` step the way `corrections_required` marks `preparing`.
- **The office actions panel:** Mark e-filed… (with the method choice), Record filing result…, Return to signing… and Close at Rejected. Each confirmation goes through the shared dialog (`tests/fixtures/confirm-dialogs.json` lists it).
- **The Filing panel:**
  - staff only, from `efiled` onward, built from `filing_attempts`, `filing_returns` and `filing_notes`;
  - newest attempt first; per return: method, result, date, code; then the attempt's notes in the order recorded, each as typed and escaped, with who recorded it and when.
- **`stageWork`:** the three "Your next step" texts from brainstorm Q10, plus D5's waiting variant.
- **`EVENT_SENTENCES`:** RECORD_FILING_RESULT "recorded the filing result" and RETURN_TO_SIGNING "returned the case to signing". MARK_EFILED keeps its sentence.
- **Reason:** brainstorm Q10.

### D13: Samples and the story

- **Choice:**
  - `fixture_keys` gains `rejected` and `accepted`, so a reset now seeds eight samples (a `client-intake` delta records this).
  - **`apply_fixture_scenario`** builds them through the real chain's end state:
    - `accepted`: both e-filed, both accepted;
    - `rejected`: both e-filed, federal accepted, state rejected, with a fictional reject code and fix note.

    Each has its own `filing_attempts` and `filing_returns` rows, and `rejected` has one `filing_notes` row.
  - **`fixture_history`** adds their events.
  - **Each new key needs** a fictional client and intake answers, following the newest sample-answer pattern (030 / 033). No existing row is migrated.
  - `checkpoint_scenario` isn't needed: the story reaches the new stages by real moves.
  - **The story** continues the class's case through brainstorm Q11's six steps, and checks the pool tabs, the Follow-ups rows, the client's messages (one in 简体) and the case page's Filing panel.
- **Reason:** brainstorm Q11.

### D14: Migration 035 copies the latest definitions

Each function is copied verbatim from its newest definition, with changed lines marked `-- 035`, and the header lists them as 033 does:
- from 034: `check_payload`, `fixture_history`;
- from 033: `apply_fixture_scenario`;
- from 032: `act_mark_efiled`, `act_close_case`, `check_operation_authority`, `vitally_apply_action`;
- from 009: `fixture_keys`.

`act_mark_ready_to_efile` (033), `act_approve_review` (033) and `act_verify_intake` (034) are read but not redefined, unless implementation finds that one needs changing. The migration is idempotent, like 033 (`if not exists`, `create or replace`, drop-then-add).

## Risks / Trade-offs

- [Risk] The reject code or fix note reaches a client (by select, by realtime, or in an event message). → Mitigation:
  - they live only in presenter-only tables that aren't in the publication;
  - event messages are composed from fixed sentences;
  - database tests check a client session reads none of the three tables, and that no event message contains the code or the note.
- [Risk] A fix note is rewritten after the fact. → Mitigation: `filing_notes` has no update or delete grant, and a trigger refuses both, for the service role too. A database test covers it.
- [Risk] A combination of history lines lacks a translation. → Mitigation: D10's enumeration test.
- [Risk] A case e-filed before this change has null methods. → Mitigation:
  - D8 and D9's fallbacks;
  - Record filing result on such a case treats it as both e-filed (documented in the spec);
  - a database test covers it.
- [Risk] The second filing loses track of an accepted return. → Mitigation: accepted and mailed results are never reset, and D3's rule plus a database test cover a second filing that changes the PA-40 to paper.
- [Trade-off] Return to signing waits for every answer (D5). → Accepted: PA answers arrive within days, and both fixes go into one signature.
- [Trade-off] No undo for the new moves. → Accepted, as in change 1. Confirmations name the client.
- [Trade-off] Every E-filed case is a Follow-ups row. → Accepted: the kind filter and the colouring keep it usable.
- [Trade-off] The re-sign message doesn't name Form 8879, while Ready to e-file's message still does. → Accepted provisionally, pending PCDC's paper-signing answer.

## Migration Plan

1. Apply 035 on the local test stack (`npm run db:migrate:test`), then `npm run test:database`.
2. The schema changes are additive: two stage values, four nullable columns, two new tables. Existing rows are untouched, and cases at `efiled` keep working with null methods.
3. **Rollback:** migrations are final once applied. A fix is a new migration (036), never an edit of 035.
4. **Before merging:** sync with `main`. If another PR has taken 035, renumber.

## Open Questions

- **PCDC's provisional defaults** (brainstorm, Open questions): Both paper waiting at E-filed, who contacts the client, who fixes the return, always signing again, what a paper return's client signs, and "several weeks". Each affects wording or a later move, not this design's structure.
- **The group's wording review** of all new client text.
- (Settled.) **A pre-change E-filed case is treated as both e-filed** when its result is recorded. This was proposed in this design and confirmed by the user: `main` has no real e-filed cases, only test and demo data.
