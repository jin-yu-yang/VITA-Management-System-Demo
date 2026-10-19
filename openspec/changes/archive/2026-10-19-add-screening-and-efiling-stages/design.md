## Context

- **Where it comes from.** This is change 1 of three lifecycle changes (roadmap part 3, decision D1, Issue #73's checklist). It builds the main chain from Request sent to E-filed. Issue #85's questionnaires wait on it.
- **The stage machine today** (main b27643b):
  - **The `CHECK`:** `cases.stage` is an unnamed `CHECK` on nine values (001:57, auto-named `cases_stage_check`), unchanged since.
  - **The actions:** they all go through `public.vitally_apply_action` (017:540–603), in this order: `reserve_receipt`, `lock_case`, `check_authority` (018:102), the revision check (VT003), `check_payload` (017:262), `check_related` (023:164), an `act_*` handler, then `commit_action` (008:36). `commit_action` writes `case_events`, writes a `client_events` row when the handler returns a `message`, and bumps `revision`.
  - **Admin-only types:** `check_operation_authority` (018:17) has an admin-only group (`VERIFY_INTAKE`, `REMIND`, `CLOSE_CASE`, 018:42). Its fallback refuses unknown types.
  - **The handlers this change touches:**
    - `act_submit` (023:266) sets `received` for client and office cases alike. An office case is one with `owner_user_id is null`.
    - `act_verify_intake` (003:210) moves `received` to `preparation_ready` and sets `intake_verified`.
    - `act_close_case` (005:175) allows the stages before `review_approved`.
  - **Client numbers:** the trigger (010:70) numbers any case that leaves `draft` for a stage other than `closed`.
  - **Samples:** `apply_fixture_scenario` is latest in 031 (#88). No sample sits at `received`. Each sample's `fixture_history` (023:397) starts with `SUBMIT`, then `VERIFY_INTAKE`.
- **The browser today:**
  - **Constants and labels:**
    - `STAGES` and `CASE_ACTIONS` in `src/contracts.mjs`;
    - in `src/domain.mjs`, the per-stage `{label, clientMessage}` (`STAGE_DESCRIPTIONS`), `describeStage(stage, lang)` (reading `stage.<key>.label`/`.client` from `src/client-text.mjs` for non-English), and `phaseTab`/`BOARD_TABS`;
    - `STAGE_TONES`/`stageBadge` in `src/ui.mjs`.
  - **The volunteer's case page** (`src/staff-views.mjs`):
    - `LIFECYCLE`/`lifecycleBar`;
    - `nextStep` (a stage switch);
    - `STAGE_WORK` (a "waiting" sentence per stage);
    - `EVENT_SENTENCES` (staff history wording);
    - `EMPTY_TAB`.
  - **The admin's case page** (`src/admin-views.mjs`) has **no** `nextStep`. Its Overview has `intakeChecksPanel` (the four simulated checks and `VERIFY_INTAKE`, gated by `adminEligibility.verifyIntake`) and `officeActionsPanel` (Remind, and "Close this case…" through the `close-case` dialog). `CLOSABLE_STAGES` mirrors `act_close_case`.
  - **The lists:**
    - Follow-ups (`src/office-views.mjs`): `followupQueue` builds intake, unclaimed, call and help rows, and the intake row's button opens the case.
    - The case pool (`src/pool-views.mjs`): `POOL_TABS`, `POOL_STAGES`, `poolPhase`.
  - **The client's page** (`src/client-views.mjs`) has a four-step `PROGRESS_STEPS` and `REVIEW_STAGES`. Labels come from `describeStage` in the applications list, the progress banner and the status panel.
  - **Opening a case:** `controller.selectCase(id)` reads the case and sets `screen` to `staff-case`. Its other callers pass `{navigate: false}`. `selectPerson(id)` switches persona. `actingPersonId()` sends the persona with an action.
  - **Confirmations:** they go through #78's `confirmBody` (`src/ui.mjs:370`). `closeCaseDialogBody` (admin-views.mjs:512) is the model:
    - an `open-close-case` button;
    - an `openDialog("close-case")` in app.mjs;
    - a `state.dialog` branch in `views.dialog()`;
    - a `caseSubmit(…, "CLOSE_CASE", …)` inside the dialog;
    - `closeDialog(…)` after a receipt.

    `tests/confirm-dialogs.test.mjs` compares each dialog with a golden fixture.
- **Tests:**
  - `tests/support/database-fixture.mjs`'s builders (`readyCase`, `assistedCase`, `preparedCase`, `prepareClassCase`) call `VERIFY_INTAKE` right after `SUBMIT`, as do about 20 sites across the `tests/database-*.mjs` files.
  - The story submits a client case and an office case. Sam (admin) then opens each with `openCaseByReference` and records the intake checks (`tests/browser.mjs` ~958–990, ~3228–3310).
- **Constraints:**
  - migrations are final once applied, and 032 follows #88's 031;
  - client text is in `src/client-text.mjs` (English, 简体; 繁體 generated);
  - staff screens are English;
  - fictional data only;
  - the test stack (`vitally-task2`) is at 030, so 031 must be applied before 032 can be tried.

## Goals / Non-Goals

**Goals:**
- The chain Request sent → Screening in progress → Pending intake / filing → Filing in progress (↔ Corrections in progress) → Pending review → Review in progress → Ready to exit → Ready to e-file → E-filed, enforced by the database.
- Screening starts on an admin's first open: once, quietly, and never as a refusal.
- Admins mark Ready to e-file and E-filed behind a confirmation naming the client.
- Staff see the conventional names. Clients see their own labels, a five-step stepper and new messages in English and 简体.
- The board, pool, Follow-ups and case pages show the new stages.

**Non-Goals:**
- The screening card's real checks (the next small change).
- The closing reasons, Waiting for documents and Hold (change 3).
- Everything after E-filed (change 2).
- #85's questionnaires.
- Renaming keys, migrating stored rows, or new samples or checkpoints.

## Decisions

### D1: Keep the keys and add three (brainstorm Q8)
- **Choice:**
  - Migration 032 replaces `cases_stage_check` with the twelve values: the nine of today plus `screening`, `ready_to_efile` and `efiled`.
  - `STAGES` in contracts.mjs gains the same three, in chain order:

    ```
    draft, received, screening, preparation_ready, preparing, review_ready,
    reviewing, corrections_required, review_approved, ready_to_efile, efiled, closed
    ```

  - No stored row changes.
- **Why:** no data migration, the smallest diff in the functions and tests, and the least collision with #85.
- **Alternatives considered:** renaming every key to match the labels. Rejected: a migration of every stored case and every stage-naming function, test and story check, for no visible difference.

### D2: The three actions (brainstorm Q5, Q6, Q9.2)
- **Choice:** `START_SCREENING`, `MARK_READY_TO_EFILE` and `MARK_EFILED` join `CASE_ACTIONS` and the database.
  - **Who:** all three are admin-only (`check_operation_authority`'s admin group).
  - **Payloads:** `START_SCREENING` has an empty payload. Each `MARK_*` takes exactly `{ "confirmed": true }`, like `CLOSE_CASE`'s confirmation.
  - **Handlers:**

    | Handler | Allowed from | Moves to | Its history line |
    |---|---|---|---|
    | `act_start_screening` | `received` only | `screening` | "PCDC started reviewing your application. We may call you." |
    | `act_mark_ready_to_efile` | `review_approved` only | `ready_to_efile` | "PCDC recorded that you signed Form 8879. Your return is ready to e-file." |
    | `act_mark_efiled` | `ready_to_efile` only | `efiled` | "PCDC e-filed your return." |

    Each returns `{detail, message}`, so `commit_action` writes the event, the history line and the revision.
  - **The reviewer's call first (brainstorm Q12):** `act_mark_ready_to_efile` also refuses (`INVALID_TRANSITION`) unless the case's latest approved review has `client_contact_status = 'completed'`. The browser's `adminEligibility.markReadyToEfile` mirrors it from `record.reviews` and says "The reviewer still needs to record the conversation with the client."
  - **`vitally_apply_action`** gains three `when` branches.
- **Why:** the established recipe (`docs/developer/database.md`, "Add a workflow action"). Requiring `confirmed` means the confirmation can't be skipped by a stray call.

### D3: The changed moves (brainstorm Q5.4, Q9.1, Q9.3)
- **Choice:**
  - **`act_verify_intake`** is allowed from `screening` only. Its message and detail are unchanged.
  - **`act_submit`:** a case with no owner (an office case) moves to `screening`, and its message is the start-screening line. A client's case still moves to `received`, with its unchanged message.
  - **`act_close_case`:** `screening` joins its allowed stages. `review_approved`, `ready_to_efile` and `efiled` stay refused. The browser's `CLOSABLE_STAGES` mirrors this.
  - **The client-number trigger** is unchanged: leaving `draft` for `screening` numbers the case. A database test pins this.
- **Why:** the office has already screened the client it is entering, and closing after review stays out of scope until the closing reasons arrive.

### D4: Starting screening on open: quiet and idempotent (brainstorm Q5)
- **Choice:** the controller gains `startScreeningIfDue()`, called:
  - after `selectCase` has applied the case;
  - after `load()` has read a restored case (a reload: the app has no other deep link);
  - after `selectPerson` (a persona switch while a case is open);
  - after `refresh` (the reconnect, the window focus and the `online` event all come through it; `dispatch` also refreshes after each action, which is harmless because the start is stage-gated).

  It sends `START_SCREENING` only when:
  - the window is on the staff case page (`state.screen === "staff-case"`). Selecting a case in place from a list (`selectCase(id, { navigate: false })`, used by Log contact, the Mark buttons and board controls) is not an open, and must not race the action the admin just pressed;
  - the selected persona has the `admin` capability (from `state.people`);
  - the saved case is at `received`;
  - no action of the admin's own is in flight (`state.busy` and `pendingAction` are clear);
  - no start for that case is already in flight, and the window hasn't given up on that case.

  Unlike `runAction`:
  - **it never records an error or a pending retry.** An `INVALID_TRANSITION` or `CONFLICT` refusal means another admin got there first, or the case changed meanwhile: it re-reads the case. If the re-read still shows Request sent (for example another admin logged a contact while this window was offline), it tries once more with a fresh action at the new revision; a second race in a row stops until the next open or refresh. Any other refusal (for example `FORBIDDEN` or `VALIDATION` against a database without 032) is a give-up for that case in this window: no retry on every focus. An offline or unknown outcome leaves the case at Request sent with the connection notice, and the next call (on reconnect) resends **the same action, unchanged** (id, revision and all), as `dispatch`'s `pendingAction` does, so the receipt makes a replay harmless.
  - **it doesn't set `busy`,** so nothing on the page flickers.
  - its memory of the start is cleared when the selection is cleared and on sign-out.
- **Why:** an open is not a press, and #75's rule (every refusal is recorded and shown) would otherwise put a banner on the second admin's screen. A volunteer persona sends nothing; volunteers don't see Request sent cases on the board anyway.
- **Alternatives considered:** an explicit "Start screening" button (reversible), or a modal on the first open. Rejected by the user.

### D5: The case pages (brainstorm Q7, Q9.7)
- **Choice:**
  - **The admin page:**
    - `intakeChecksPanel` shows its form while the case is at `screening` (`adminEligibility.verifyIntake` now gates on `screening`). While it is at `received` it says screening starts when an admin opens the case.
    - `officeActionsPanel` gains **Mark ready to e-file…** at `review_approved` and **Mark e-filed…** at `ready_to_efile`. Each opens its dialog (`mark-ready-to-efile`, `mark-efiled`), gated by new `adminEligibility.markReadyToEfile` and `.markEfiled` decisions.
  - **The dialogs** use `confirmBody`:
    - the lead names the client (first and last name from the answers, or "this client" if both are empty) and the application ID;
    - the note says what the client will be told;
    - a `confirmed` checkbox and a `caseSubmit` of the action;
    - "Keep it as it is" closes.

    Both join the golden fixture.
  - **The volunteer page:**
    - `LIFECYCLE` lists the ten main stages: `received`, `screening`, `preparation_ready`, `preparing`, `review_ready`, `reviewing`, `review_approved`, `ready_to_efile`, `efiled`, `closed`. `draft` leaves the bar (today's bar starts with it; the existing lifecycle tests are updated), and Corrections in progress is still drawn on Filing in progress.
    - `nextStep` shows the `STAGE_WORK` waiting sentence for the new stages. Volunteers can't make these moves.
    - `EVENT_SENTENCES` gains the three new actions.
  - **App wiring:**
    - two `open-…` cases in app.mjs;
    - `closeDialog("#case-title")` after each receipt;
    - `STAFF_NOTICES` entries ("Marked ready to e-file. The client was told.", "Marked e-filed. The client was told.");
    - `payloadFor` builders that read the `confirmed` box.

### D6: The lists (brainstorm Q9.4–Q9.6)
- **Choice:**
  - **The work board:** unchanged (`phaseTab` gives the new stages no tab). `STAGE_TONES`:

    | Stage | Tone |
    |---|---|
    | `screening` | intake |
    | `ready_to_efile` | filing |
    | `efiled` | filing |

  - **Follow-ups** (`followupQueue`):
    - the intake row splits in two: at `received`, "New application: open it to start screening.", with **Open** (`open-case`); at `screening`, "Finish screening.", with **Open**. Office drafts keep today's row.
    - two new kinds, both admin rows: `signing` at `review_approved` ("Waiting for the client to sign Form 8879."), with **Mark ready to e-file…**. While the reviewer's call is still pending, its description reads "Waiting for the reviewer's call with the client." and the action column shows the call-pending explanation instead of the button; and `efiling` at `ready_to_efile` ("Ready to e-file."), with **Mark e-filed…**.

    The three new kinds (`screening`, `signing`, `efiling`) get `QUEUE_KINDS` labels ("Screening", "Signing", "E-filing"), `KIND_ICONS` entries and `.kind-pill` styles in `src/styles.css`, beside today's `intake`, `call`, `help` and `unclaimed`; they add three filter chips. The `intake` kind keeps its label "Intake checks" and its shield icon; the new kinds use `clock` (screening), `file` (signing) and `check` (efiling), with the pill colours of `intake` (screening) and `unclaimed` (signing, efiling).

    **The reviewer's call on a list row.** Follow-ups renders from the case list, and `listCases` reads no reviews: a list row carries only the scalars and five summaries. So the list gains a sixth summary, `reviewContactStatus`: the latest approved review's `client_contact_status` (`'pending'`, `'completed'` or `null`). It comes from one more grouped read of `reviews` (`case_id`, `client_contact_status`, `created_at`, `status = 'approved'`), presenters only, like the other four. `adminEligibility.markReadyToEfile` reads `record.reviewContactStatus` on a list row and the approved review in `record.reviews` on a full case.

    Each Mark button carries `data-case-id`. Like **Log contact** today, it selects the case without leaving the queue (`selectCase(id, { navigate: false })`) and opens the same confirmation dialog as the case page. Every stage move stays behind its dialog.
  - **The case pool:**
    - `POOL_TABS`: all, intake, available, preparation, review, signing ("Waiting on client"), filing ("Filing"), closed. Today's "done" tab goes, since nothing is Done until change 2.
    - `poolPhase`:

      | Stage | Phase |
      |---|---|
      | `draft`, `received`, `screening` | intake |
      | `review_approved` | signing |
      | `ready_to_efile`, `efiled` | filing |
      | `closed` | closed |
      | the rest | `phaseTab` |

    - `POOL_STAGES` follows `STAGES`.
- **Why:** admins see every new step in their queue, and the pool shows every phase change 1 fills.

### D7: Labels and messages (brainstorm Q10, Q11)
- **Choice:**
  - **In `src/domain.mjs`**, each stage's description gains `clientLabel` beside the staff `label` and the `clientMessage`. `describeStage(stage, lang)` returns all three:
    - `label` is always the staff English;
    - `clientLabel` and `clientMessage` are in `lang`;
    - `src/client-text.mjs`'s `stage.<key>.label` becomes the **client** label (it was already only read for clients).
  - **The client screens** read `clientLabel`. `stageBadge(stage, lang, { audience })` takes `audience: "client"` there, and the staff screens keep the default.
  - **Text:** the staff labels, client labels, client messages and history lines are exactly brainstorm Q10 and Q11.
    - `SENTENCES` gains the three history lines.
    - `progress.step.signing` (Signing 签名) and `progress.step.filing` (Filing 递交) replace `progress.step.next`.
    - `PROGRESS_STEPS` becomes the five steps of Q9.8.
    - `REVIEW_STAGES` adds `ready_to_efile` and `efiled`, so the client's status panel shows their messages.
    - Closed keeps its own notice. `closed` is in no step, so `progressTrack` draws no steps for a closed case; the badge and `stage.closed.client` show instead. Today `closed` sits in the "Next steps" step.
    - The client call sites move to the client label (`client-views.mjs`' list badge, the status panel's badge and the review panel's badge) in the same task that adds `clientLabel`, so 简体 client pages never show English staff names in between.
  - **The diagram:** `docs/media/return-lifecycle.svg`'s three labels become "Screening in progress" (a new box between Request sent and Pending intake / filing, with the arrow "Opened by an admin"), "Filing in progress (preparing)" and "Review in progress".
- **Why:** the conventions stay for staff, and clients read plain words.

### D8: The samples, the tests and the docs (brainstorm Q9.10)
- **Choice:**
  - **The samples:** no sample, checkpoint or `fixture_history` change. A sample's history still reads Submit, then the intake check, with no start-screening line. 031's functions are not redefined.
  - **The database tests:**
    - the builders and the ~20 direct sites gain `START_SCREENING` (as `f.sam`) between `SUBMIT` and `VERIFY_INTAKE`;
    - history-action lists gain it;
    - new tests cover each new action's success, every refusal in check order, "a rejected action commits nothing", the office case's `screening`, the client number at `screening`, and `CLOSE_CASE` from `screening`.
  - **The story:**
    - after Sam opens the client case, it waits for Screening in progress (and the client's "Being reviewed");
    - the office case is at `screening` right after Submit;
    - a new step marks the approved case ready to e-file and e-filed through both dialogs and checks the client's history and stepper;
    - a second admin window opening the same case shows no error.
  - **Docs:** `docs/developer/database.md` (the mermaid, the action catalogue, the recipe's stale "current definition" migration numbers) and `docs/developer/frontend.md` (stages and the start on open).

### D9: Specs
- **Choice:** a new capability, `case-lifecycle`, with ADDED requirements:
  - "A case moves through the main chain of stages";
  - "Screening starts when an admin first opens a case";
  - "Admins record signing and e-filing, with a confirmation";
  - "Staff and clients each see their own stage names";
  - "The lists and the case page show every stage";
  - "Clients are told at each new step".

## Risks / Trade-offs

- **[Risk] An open that writes.** Opening a case now moves it and tells the client, which can't be undone. Mitigation: admin personas only, `received` only, and idempotent. The user accepted that a mis-opened case starts screening.
- **[Risk] A refusal banner on open.** A second admin, or a stale case, would trip `INVALID_TRANSITION` or the revision check. Mitigation: D4's quiet path records nothing and re-reads the case. A controller test opens a case another admin just started, and the story's two-window check shows no error.
- **[Risk] Database tests break where they go straight from Submit to the intake check.** Mitigation: the plan lists every site from the survey, and the database suite runs twice.
- **[Risk] Migration order.** 032 must follow 031, which isn't on the test stack yet. Mitigation: the controller applies 031 and 032 after the user's OK, with a dry run in `begin … rollback` first.
- **[Risk] #85 collides on `SUBMIT_REVIEW`/`APPROVE_REVIEW`.** This change doesn't redefine them: `act_approve_review` still ends at `review_approved`. Mitigation: #85 rebases after this merges, as Issue #73 plans.
- **[Trade-off] The sample cases' history lacks a start-screening line.** Accepted: it keeps 031's functions untouched, and the samples already sit past intake.
- **[Trade-off] The pool's "Done" tab disappears until change 2.** Accepted: nothing is Done yet. E-filed shows under Filing.
- **[Trade-off] Ready to exit and later can't be closed.** Accepted until the closing reasons (change 3), as today with `review_approved`.

## Migration Plan

1. **Apply 031:** the controller applies #88's 031 to `vitally-task2` after the user's OK.
2. **Dry run:** 032 is dry-run in the controller's own `begin … rollback`. The file itself has no `begin;` or `commit;`: `tools/admin/migrate.mjs` already runs every pending file in one transaction. The check confirms:
   - the new `CHECK`;
   - each new action through `vitally_apply_action` on a test case;
   - an office submit landing in `screening`;
   - `VERIFY_INTAKE` refused from `received`.
3. **Apply and test:** 032 is applied after the user's OK; then `npm run test:database` and `npm run test:browser`.
4. **Deployment:** any shared database applies 031 and then 032 *before* this front end merges.
   - With the new front end and an old database, `START_SCREENING` would be refused, quietly (D4), and `VERIFY_INTAKE` would still work from `received`. The intake checks would show only from `screening`, so no case could pass intake.
   - With the new database and the old front end, the old intake check would be refused at `received`.
5. **Rollback:** a later migration restores 001's `CHECK`, after moving any `screening`, `ready_to_efile` and `efiled` rows back (`screening` → `received`; the other two → `review_approved`), along with the handlers' earlier definitions.

## Open Questions

- **The screening checks** for the next small change. Owner: the group.
  - Is "basic documents" optional for cases added by volunteers?
  - Is face matching the fourth check?
- **The wording review** of all new client text. Owner: the group. Text only.
