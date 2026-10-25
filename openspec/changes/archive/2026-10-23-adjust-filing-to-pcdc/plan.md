# Adjust filing to PCDC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adjust migrations 035/036's filing and closing to PCDC's answers:
- a paper return is given to the client at Mark e-filed;
- all four filing pairs;
- neutral signing text and "about 3 months";
- a season-end close of unsigned cases;
- the fixer text aligned.

**Architecture:** One new migration, `037_adjust_filing_to_pcdc.sql`. It renames the stored result, re-adds the checks, redefines the filing functions (each copied from its newest definition, with changed lines marked `-- 037`) and adds one new public RPC, `vitally_close_unsigned`. In the browser, `domain.mjs` names and messages follow the database's columns, and the staff views lose the mailing wait. Follow-ups gains the season-end dialog.

**Tech Stack:**
- Postgres plpgsql on the local Supabase test stack.
- Vanilla ES modules (`src/*.mjs`).
- `node:test` for unit and database tests.
- Playwright (`tests/browser.mjs`).

**Spec:** `openspec/changes/adjust-filing-to-pcdc/`:
- `design.md` (D1–D12);
- `specs/case-lifecycle/spec.md`, `specs/office-follow-up/spec.md`, `specs/review-and-corrections/spec.md`;
- the exact client strings: `brainstorm.md` Q3 and Q4 and the spec tables.

## Global Constraints

- Migrations are final once applied. Write only the new `supabase/migrations/037_adjust_filing_to_pcdc.sql`, and never edit 001–036.
- Copy each redefined function from its newest definition, verbatim except lines marked `-- 037`:

  | Function | Copy from |
  |---|---|
  | `check_payload` | 036 |
  | `act_mark_efiled` | 035 |
  | `act_record_filing_result` | 035 |
  | `filing_line` | 035 |
  | `efiled_line` | 035 |
  | `act_mark_ready_to_efile` | 033 |
  | `fixture_history` | 036 |
  | `apply_fixture_scenario` | 036 |

- 037 must be safe to apply twice: `create or replace`, `drop constraint if exists` then `add`, and an idempotent `update`.
- The stored result value is `given_to_client` (never `mailed`), `paper` only, with `answered_on` null.
- Client text lives in `src/client-text.mjs` (English and 简体). After any 简体 change, run `npm run build:hant` and commit `src/zh-hant.mjs`. Staff screens stay English.
- History lines already stored keep their words and 简体. That includes "PCDC recorded that you signed Form 8879. Your return is ready to e-file.", "PCDC mailed your returns." / "…your federal return." / "…your Pennsylvania return.", "PCDC e-filed your federal return and mailed your Pennsylvania return.", and every "…was mailed. A reply to a mailed return can take several weeks." combination.
- Only the Customer Portal variant and the reviewer questionnaire may still say "Form 8879" in new text.
- Use fictional data only. Don't touch `src/pcdc-logo.png`, `VITA-Management-System-Demo/`, `.claude/worktrees/` or `.stitch/captures`.
- Run the local stack from `$VITALLY_STACK`, never from the repo root.

## Review Focus

1. **Re-applying 037 on a stack that already ran it, or that holds `mailed` rows from today's story.** The rename and the checks must succeed either way. Test: Task 1 Step 6 re-runs `npm run db:migrate:test`, and `database-filing` "stored mailed is renamed" seeds a `mailed` row through SQL and calls the rename statement again.
2. **A case filed under 035 at E-filed with a paper return still waiting** (no result). The staff and client views must render without throwing, with no mailing sentence. Test: Task 5 `office-views` "a stuck paper return renders" and `domain` `returnState({federalMethod:'paper', federalResult:null},'federal') === 'given_to_client'`.
3. **The season-end dialog while another admin moves a listed case.** The call must change nothing and the dialog must reopen without that case. Test: Task 3 `database-season-close` "all or nothing", and Task 6 `controller.test` "closeUnsigned conflict re-reads".
4. **A second filing that completes the pair on paper.** It must land at Accepted in one move, with one client line. Test: Task 1 `database-filing` "second filing on paper completes the case".
5. **A 简体 client reading an old stored mailed or 8879 line.** Its translation must survive the key rename. Test: Task 4 `client-language` "legacy filing lines keep their translation".

---

### Task 1: Database: the paper handover, four pairs, Record filing result

**Files:**
- Create: `supabase/migrations/037_adjust_filing_to_pcdc.sql`, sections 1–6
- Modify: `tests/database-filing.mjs` (the constraint test at about lines 22–43, the "paper is mailed" group at about 563, and new groups in "record filing result")
- Modify: `tests/database-stages.mjs:14`, the ready-to-e-file line constant

**Interfaces:**
- Produces:
  - SQL `vitally_private.filing_line(p_federal text, p_state text) returns text`, accepting `'given_to_client'`;
  - SQL `vitally_private.efiled_line(p_federal_method text, p_state_method text, p_second boolean) returns text`;
  - the stored result value `given_to_client`.

- [ ] **Step 1: Update the constraint test, then write the failing filing tests**

In "method and result constraints":
- Move `"federal_method='paper', state_method='efile'"` to the accepted list.
- Replace every `'mailed'` with `'given_to_client'`.
- Add `"federal_method='efile', state_method='paper', state_result='mailed'"` to the rejected list.

In "record filing result", replace "paper is mailed" with these groups (helpers `filedCase`, `record`, `columns`, `lastMessage`, `nyDay` already exist there):

```js
await t.test("paper is given to the client at Mark e-filed", async () => {
  const caseId = await filedCase({ federal: "efile", state: "paper" });
  const c = await columns(caseId);
  assert.equal(c.stage, "efiled");
  assert.equal(c.state_result, "given_to_client");
  const row = (await f.sql("select result, answered_on, recorded_by from public.filing_returns where case_id=$1 and return_kind='state'", [caseId])).rows[0];
  assert.deepEqual([row.result, row.answered_on, row.recorded_by], ["given_to_client", null, f.sam]);
  assert.equal(await lastMessage(caseId),
    "PCDC e-filed your federal return and gave your Pennsylvania return on paper to you or the person you sent. If it isn't signed yet, sign it, then mail it yourself. A reply can take about 3 months after you mail it.");
  for (const result of ["accepted", "mailed", "given_to_client"])
    await assert.rejects(() => record(caseId, { state: { result, date: await nyDay() } }), rejected("VALIDATION"));
  await record(caseId, { federal: { result: "accepted", date: await nyDay() } });
  assert.equal((await columns(caseId)).stage, "accepted");
});
await t.test("both paper goes straight to Accepted, with one line", async () => {
  const caseId = await filedCase({ federal: "paper", state: "paper" });
  assert.equal((await columns(caseId)).stage, "accepted");
  const lines = await f.clientMessages(caseId);
  assert.equal(lines.at(-1), "PCDC gave your returns on paper to you or the person you sent. If they aren't signed yet, sign them, then mail them yourself. A reply can take about 3 months after you mail them.");
  assert.equal(lines.filter((l) => l.startsWith("PCDC gave")).length, 1);
});
await t.test("federal paper with state e-file is accepted", async () => {
  const caseId = await filedCase({ federal: "paper", state: "efile" });
  const c = await columns(caseId);
  assert.deepEqual([c.stage, c.federal_result, c.state_result], ["efiled", "given_to_client", null]);
  assert.equal(await lastMessage(caseId),
    "PCDC gave your federal return on paper to you or the person you sent, and e-filed your Pennsylvania return. If the federal return isn't signed yet, sign it, then mail it yourself. A reply can take about 3 months after you mail it.");
});
await t.test("a first filing missing a return is refused", async () => {
  const caseId = await f.approvedCase();
  await f.act(f.presenter, caseId, f.sam, "MARK_READY_TO_EFILE", { confirmed: true });
  await assert.rejects(() => f.act(f.presenter, caseId, f.sam, "MARK_EFILED", { confirmed: true, methods: { federal: "efile" } }), rejected("VALIDATION"));
});
await t.test("second filing on paper completes the case", async () => {
  const caseId = await filedCase();
  await record(caseId, { federal: { result: "accepted", date: await nyDay() }, state: { result: "rejected", date: await nyDay(), code: "PA-1" } });
  await f.act(f.presenter, caseId, f.sam, "RETURN_TO_SIGNING", { confirmed: true });
  await f.act(f.presenter, caseId, f.sam, "MARK_READY_TO_EFILE", { confirmed: true });
  await assert.rejects(() => f.act(f.presenter, caseId, f.sam, "MARK_EFILED", { confirmed: true, methods: { federal: "efile", state: "paper" } }), rejected("VALIDATION"));
  await f.act(f.presenter, caseId, f.sam, "MARK_EFILED", { confirmed: true, methods: { state: "paper" } });
  const c = await columns(caseId);
  assert.deepEqual([c.stage, c.federal_result, c.state_result], ["accepted", "accepted", "given_to_client"]);
  assert.equal(await lastMessage(caseId),
    "PCDC gave your Pennsylvania return on paper to you or the person you sent. If it isn't signed yet, sign it, then mail it yourself. A reply can take about 3 months after you mail it.");
});
await t.test("stored mailed is renamed", async () => {
  // Seed a 035-style row with the check dropped, re-run 037's rename statement, and expect given_to_client and a null date.
});
```

The "stored mailed is renamed" body:
- Inside one transaction, drop `cases_filing_results` and the `filing_returns_result_check`.
- Seed a paper return with `result='mailed'` and a date.
- Run 037's section 1 statements, read from the file between `-- 037 §1 begin` and `-- 037 §1 end` markers.
- Assert `given_to_client` and `answered_on` null.

In the `filing_line` group (about line 233), replace the mailed assertions with:

```js
assert.equal(await filing("given_to_client", "given_to_client"), "PCDC gave your federal and Pennsylvania returns on paper to you or the person you sent. If they aren't signed yet, sign them, then mail them yourself. A reply can take about 3 months after you mail them.");
assert.equal(await filing(null, "given_to_client"), "PCDC gave your Pennsylvania return on paper to you or the person you sent. If it isn't signed yet, sign it, then mail it yourself. A reply can take about 3 months after you mail it.");
```

Set the `database-stages.mjs` constant to `"PCDC recorded that your return is ready. PCDC will take the next step."`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:database -- --test-name-pattern="filing|stages"` (or `node --env-file=.env.test --test tests/database-filing.mjs tests/database-stages.mjs`).
Expected: FAIL on the new groups. The federal paper / state e-file pair is refused, the result is null, and the lines are the old ones.

- [ ] **Step 3: Write 037, sections 1–3**

1. **§1, the rename and the checks.** Wrap in `-- 037 §1 begin` / `-- 037 §1 end`:
   - drop `cases_filing_results` and the `filing_returns` result check;
   - `update public.cases set federal_result='given_to_client' where federal_result='mailed'`, and the same for `state_result`;
   - `update public.filing_returns set result='given_to_client', answered_on=null where result='mailed'`;
   - re-add `cases_filing_methods` without the `not (federal_method='paper' and state_method='efile')` clause, `cases_filing_results` with `given_to_client`, and the `filing_returns` result check `in ('accepted','rejected','given_to_client')`.

   The header comment (D3) states: nothing is hosted (Task 10B); paper returns filed under 035 and still waiting are left as they are; a sample reset clears them.
2. **§2, the sentences.** `filing_line`: replace each `'mailed'` branch with `'given_to_client'` and the handover sentences (spec "Clients are told", the Given to the client row). `efiled_line`: the four first-filing lines and the four second-filing lines from the spec's history table.
3. **§3, `act_mark_efiled` (from 035):**
   - drop the two pair refusals (lines 438–441 and the `(v_federal='paper' and v_state='efile')` term at 459);
   - for each return filed `paper` in this move, set the case's `<kind>_result='given_to_client'`, and insert its `filing_returns` row with `result='given_to_client'`, `answered_on` null and `recorded_by=p_person.id`;
   - then `stage = case when both results in ('accepted','given_to_client') then 'accepted' else 'efiled' end`, in both the first-filing and second-filing branches;
   - the returned message stays `efiled_line(...)`.

- [ ] **Step 4: Write 037, sections 4–6**

4. **§4, `check_payload` (from 036).** In the `RECORD_FILING_RESULT` branch, `not in ('accepted','rejected')`. Nothing else changes.
5. **§5, `act_record_filing_result` (from 035).** The fit check becomes `v_row.method<>'efile'` → `VALIDATION`. The stage rule's `('accepted','mailed')` becomes `('accepted','given_to_client')`.
6. **§6, `act_mark_ready_to_efile` (from 033).** The message becomes `'PCDC recorded that your return is ready. PCDC will take the next step.'`.

- [ ] **Step 5: Apply and run until the tests pass**

Run: `npm run db:migrate:test`, then `node --env-file=.env.test --test tests/database-filing.mjs tests/database-stages.mjs`.
Expected: PASS.

- [ ] **Step 6: Confirm 037 is safe to apply again**

To re-apply on the same stack: delete 037's row from `supabase_migrations.schema_migrations`, run `npm run db:migrate:test` again, and re-run the filing tests.
Expected: the migration succeeds, and the tests PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/037_adjust_filing_to_pcdc.sql tests/database-filing.mjs tests/database-stages.mjs
git commit -m "Filing: a paper return is given to the client at Mark e-filed; all four pairs"
```

### Task 2: Database: the samples

**Files:**
- Modify: `supabase/migrations/037_adjust_filing_to_pcdc.sql`, §8 (`fixture_history` and `apply_fixture_scenario` from 036)
- Modify: `tests/database-fixtures.mjs:503-508`

**Interfaces:**
- Consumes: §6's new Mark ready to e-file line.

- [ ] **Step 1: Write the failing expectations.** In `database-fixtures.mjs`:
  - both sample lines read `"PCDC recorded that your return is ready. PCDC will take the next step."`;
  - add an assertion that the `rejected` sample's `filing_notes.note` is `"Fictional note: site coordinator to correct the dependent's SSN in TaxSlayer."`.
- [ ] **Step 2: Run** `node --env-file=.env.test --test tests/database-fixtures.mjs`. Expected: FAIL on those lines.
- [ ] **Step 3: Write 037 §8.** Copy `fixture_history` (036 lines ~902/915: the `MARK_READY_TO_EFILE` message) and `apply_fixture_scenario` (036 line ~1150: the note) with only those lines marked `-- 037`. Add the closing `revoke all on all functions in schema vitally_private …` as 036 ends.
- [ ] **Step 4: Run** `npm run db:migrate:test`, then `npm run test:database`. Expected: PASS in full.
- [ ] **Step 5: Commit**: `git commit -m "Samples: the new signing line and the site coordinator's fix note"`.

### Task 3: Database: `vitally_close_unsigned`

**Files:**
- Modify: `supabase/migrations/037_adjust_filing_to_pcdc.sql`, §7 (place it before §8, so the file's closing revoke stays last)
- Modify: `tests/support/database-fixture.mjs` (add `f.closeUnsigned`)
- Create: `tests/database-season-close.mjs`. The `tests/database*.mjs` glob picks it up.

**Interfaces:**
- Produces:
  - SQL `public.vitally_close_unsigned(p_action_id uuid, p_person_id uuid, p_cases jsonb, p_confirmed boolean) returns jsonb`. It returns `{actionId, cases:[{caseId, reference, revision}]}`, and is granted `execute` to `authenticated` like `vitally_log_contact`.
  - Fixture `f.closeUnsigned(client, personId, cases, { actionId = randomUUID(), confirmed = true } = {})`, where `cases` is `[{caseId, revision}]`.

- [ ] **Step 1: Add `f.closeUnsigned`.** It calls `client.rpc("vitally_close_unsigned", {p_action_id, p_person_id, p_cases, p_confirmed})` and throws `createAppError(error)`, as `f.logContact` does.
- [ ] **Step 2: Write the failing tests** in `tests/database-season-close.mjs`. Build cases with `f.approvedCase()` (Ready to exit), and a signing Hold with `PUT_ON_HOLD` on one. Read revisions with `select revision from public.cases`. Tests:
  - `"closes signing cases as dismissed"`: both are `stage='closed'` and `closing_reason='dismissed'`; each `f.clientMessages(id).at(-1)` is `"PCDC could not reach you, so this application was closed. Your return was not filed."`; each has exactly one `CLOSE_CASE` event whose `detail` deep-equals `{reason:"dismissed", seasonEnd:true}`; `select count(*) from admin_followups where case_id=$1 and purpose='withdrawal_notice'` is 0; an open document request and an open follow-up on one case are `cancelled`.
  - `"all or nothing"`: list two cases, one with a stale revision. Expect `rejected("CONFLICT")`, and both still `review_approved` / `on_hold`. Repeat with a case at `ready_to_efile`, at `rejected`, at `awaiting_documents`, and at `on_hold` with `hold_origin='awaiting_documents'`. Each gives `CONFLICT`.
  - `"refusals"`: an empty list, a duplicate `caseId` and `p_confirmed=false` each give `rejected("VALIDATION")`. `f.alex` (a preparer) gives `rejected("FORBIDDEN")`. `f.applicantA` with `null` gives `rejected("FORBIDDEN")`.
  - `"replay"`: the same `actionId` twice returns a deep-equal receipt, and the event count stays 1 per case.
  - `"receipt"`: `receipt.cases` holds each `{caseId, reference, revision}`, with revision = the old revision + 1.
  - `"only listed cases"`: a third Ready to exit case left out is still `review_approved`.
- [ ] **Step 3: Run** `node --env-file=.env.test --test tests/database-season-close.mjs`. Expected: FAIL ("function … does not exist").
- [ ] **Step 4: Write 037 §7.** Order (design D9):
  1. `require_membership()`.
  2. Admin person check: reuse `check_operation_authority(v_member,p_person_id,'CLOSE_CASE')`, which refuses a null person and non-admins as `FORBIDDEN`.
  3. Envelope: `p_confirmed` must be true. `p_cases` must be a non-empty array, each element `{caseId: uuid string, revision: number}` with exactly those keys, with distinct IDs. Otherwise `VT007 VALIDATION`.
  4. Digest `{operation:'CLOSE_UNSIGNED', cases, personId}`, then `reserve_receipt(v_member,p_action_id,'CLOSE_UNSIGNED',v_digest,p_person_id)`. A receipt that exists is returned.
  5. Loop the IDs in sorted order: `lock_case`, revision check (`VT003 CONFLICT`), and the stage check (`review_approved`, or `on_hold` with `hold_origin='review_approved'`; otherwise `VT003 CONFLICT`).
  6. Second loop: `close_case_steps(c,'dismissed')`; insert into `case_events` (`action 'CLOSE_CASE'`, detail `{"reason":"dismissed","seasonEnd":true}`); insert into `client_events` with `closed_line('dismissed')`; `update cases set revision=revision+1, updated_at=now()`. Collect `{caseId, reference, revision}`.
  7. Update the receipt row (`target_id` and `target_reference` null, `receipt` = the result).
  8. `revoke all … from public,anon,authenticated` and `grant execute … to authenticated`.

  If the digest helper or the receipt helper rejects the operation name, add `'CLOSE_UNSIGNED'` to whatever list `reserve_receipt` checks, copying that function from its newest definition and marking the change `-- 037`.
- [ ] **Step 5: Run** `npm run db:migrate:test`, then `npm run test:database`. Expected: PASS, including every other database file.
- [ ] **Step 6: Commit**: `git commit -m "Season-end close: vitally_close_unsigned closes unsigned cases in one move"`.

### Task 4: Browser: domain and client text

**Files:**
- Modify: `src/domain.mjs:80-85` (fallback strings), `:177-265` (filing helpers and `METHOD_LABELS`)
- Modify: `src/client-text.mjs:163-202` (stage keys) and `:500-530` (history map, `filingLines()`)
- Modify: `src/zh-hant.mjs` (generated)
- Test: `tests/domain.test.mjs`, `tests/client-language.test.mjs`, `tests/client-views.test.mjs`

**Interfaces:**
- Produces:
  - `filingMethodKind(record) → 'both_efile'|'efile_and_paper'|'paper_and_efile'|'both_paper'|null`;
  - `returnState(record, kind) → 'waiting'|'accepted'|'rejected'|'given_to_client'|null` (any paper return → `'given_to_client'`);
  - `waitingReturns(record) → kind[]` (e-filed returns with no result only);
  - `describeStage(stage, lang, record)`, giving the label `'Ready to mail'` at `accepted` with any paper return and `'Ready'` at `ready_to_efile`.

- [ ] **Step 1: Write the failing tests.**
  - In `domain.test.mjs`, replace the 8879 expectations (lines ~78–81, 261–262, 281, 299–312) with the brainstorm Q3 strings.
  - Add:

    ```js
    test("four filing kinds and their names", () => {
      assert.equal(filingMethodKind({ federalMethod: "paper", stateMethod: "efile" }), "paper_and_efile");
      const name = (stage, f, s) => describeStage(stage, "en", { stage, federalMethod: f, stateMethod: s }).label;
      assert.equal(name("efiled", "efile", "paper"), "E-filed, PA on paper");
      assert.equal(name("efiled", "paper", "efile"), "E-filed, federal on paper");
      assert.equal(name("accepted", "efile", "paper"), "Accepted, PA on paper");
      assert.equal(name("accepted", "paper", "efile"), "Accepted, federal on paper");
      assert.equal(name("accepted", "paper", "paper"), "Paper");
    });
    test("client labels for paper and ready", () => {
      const label = (stage, rec, lang = "en") => describeStage(stage, lang, { stage, ...rec }).clientLabel;
      assert.equal(label("accepted", { federalMethod: "efile", stateMethod: "paper" }), "Ready to mail");
      assert.equal(label("accepted", { federalMethod: "paper", stateMethod: "paper" }, "zh-Hans"), "待邮寄");
      assert.equal(label("accepted", { federalMethod: "efile", stateMethod: "efile" }), "Complete");
      assert.equal(label("efiled", { federalMethod: "paper", stateMethod: "efile" }), "Filed");
      assert.equal(label("ready_to_efile", {}), "Ready");
    });
    test("a stuck paper return reads as given to the client", () => {
      const rec = { federalMethod: "paper", stateMethod: "paper", federalResult: null, stateResult: null };
      assert.equal(returnState(rec, "federal"), "given_to_client");
      assert.deepEqual(waitingReturns(rec), []);
    });
    ```

    Use the property names `describeStage` already returns (check the existing tests: `label` / `clientLabel` or equivalent).
  - Add a `filingMessage("accepted", "en", {federalMethod:"efile",stateMethod:"paper",federalResult:"accepted",stateResult:"given_to_client"})` test. It equals the IRS sentence + " " + the PA handover sentence + " " + the refund sentence.
  - In `client-language.test.mjs`:
    - the new lines translate exactly (spec history table);
    - the test `"legacy filing lines keep their translation"` checks that each of "PCDC mailed your returns.", "Your federal and Pennsylvania returns were mailed. A reply to a mailed return can take several weeks." and "PCDC recorded that you signed Form 8879. Your return is ready to e-file." still maps to its 035 简体.
  - Update the `client-views.test.mjs` lines ~842 and ~916–922 to the new and legacy expectations.
- [ ] **Step 2: Run** `npm test`. Expected: FAIL on those tests.
- [ ] **Step 3: Implement** in `src/domain.mjs`:
  - `filingMethodKind` adds `paper_and_efile`;
  - `returnState` returns `'given_to_client'` for any paper method;
  - `waitingReturns` filters to `efile` with no result;
  - `METHOD_LABELS` follows D5, with `clientKey: 'stage.accepted.paper.label'` for the three paper kinds at `accepted`, and `paper_and_efile` at `efiled` → `stage.efiled.filed.label`;
  - the fallback strings at 80–85 become the new text.
- [ ] **Step 4: Implement** in `src/client-text.mjs`:
  - the eight Q3 keys;
  - `stage.ready_to_efile.label` → `{en:"Ready", zh:"已准备好"}`;
  - add `stage.accepted.paper.label` `{en:"Ready to mail", zh:"待邮寄"}`;
  - remove `stage.efiled.mailed.label`;
  - rename `filing.*.mailed` to `filing.*.given_to_client`, with the Q4 sentences;
  - in `filingLines()`, iterate states `[null,"waiting","accepted","rejected","given_to_client"]` *and* a frozen `LEGACY_MAILED` table (`federal`, `state` and `both` with 035's exact en/zh), so every stored mailed combination still translates;
  - add the new `efiled_line` and #8 lines to the history map, and keep the 035 mailed lines and the 8879 line.
- [ ] **Step 5: Regenerate 繁體.** Run `npm run build:hant`, then `npm run build:hant -- --check`. Expected: no diff on check.
- [ ] **Step 6: Run** `npm test`. Expected: PASS for these files. Staff-view failures are fixed in Task 5.
- [ ] **Step 7: Commit**: `git add src/domain.mjs src/client-text.mjs src/zh-hant.mjs tests/domain.test.mjs tests/client-language.test.mjs tests/client-views.test.mjs` and `git commit -m "Client text: given to the client, four pairs, neutral signing, about 3 months"`.

### Task 5: Browser: staff screens

**Files:**
- Modify: `src/admin-views.mjs` (`:263`, `:277-290`, `:658-668`, `:778-800`, `:812-965`), `src/case-actions.mjs` (`:155-190`, `:287`), `src/office-views.mjs` (`:117`, `:226-279`), `src/staff-views.mjs` (`:156-160`, `:878-886`, `:2008`), `src/pool-views.mjs:30` (comment only)
- Test: `tests/admin-views.test.mjs`, `tests/office-views.test.mjs`, `tests/staff-views.test.mjs`, `tests/case-actions.test.mjs`, `tests/pool-views.test.mjs`

**Interfaces:**
- Consumes: Task 4's `filingMethodKind`, `returnState` and `waitingReturns`.

- [ ] **Step 1: Write the failing tests** with these exact strings:
  - **Mark e-filed** (`markEfiledDialogBody`): four radios, values `both_efile`, `efile_and_paper`, `paper_and_efile` and `both_paper`, labels per the spec. The box reads "Each return was e-filed, or given to the client on paper, as chosen above.". A second filing shows "On paper (given to the client to mail)" and "Pennsylvania return: on paper, given to the client. Nothing to file again.".
  - **Record filing result** (`recordFilingResultDialogBody`): no `mailed` option, no "Date mailed", no fieldset for a paper return. The note has no "mailed". The prompt reads "Fix note (only when a return is rejected): what needs fixing in TaxSlayer".
  - **Mark ready to e-file:** the box reads "The client signed Form 8879, or the return will be given to the client on paper.". `case-actions` `MARK_READY_TO_EFILE` confirmation (test at line 471) gets the same sentence. `case-actions` maps `paper_and_efile` to `{federal:"paper", state:"efile"}`.
  - **The case page:** heading "Signing"; "The office could not reach the client to sign."; "This is recorded once the client has signed."; no "Record when the … is mailed before …".
  - **office-views:**
    - the Ready to exit row reads "Waiting for the client to sign.", and the Hold row "Can't reach the client to sign.";
    - for `{federalMethod:"paper", stateMethod:"efile"}` at `efiled`, the Filing result row reads "Waiting for Pennsylvania's answer." and turns amber at 3 days;
    - "a stuck paper return renders": both paper at `efiled` with null results renders with no "mailed" text and doesn't throw.
  - **staff-views:**
    - the Filing panel paper entry is "Paper · Given to the client", with no date;
    - next steps: Rejected "A return was rejected. The site coordinator fixes it in TaxSlayer, and the office contacts the client.", Accepted "The returns are accepted or given to the client on paper. Nothing more is needed here.";
    - the history `MARK_READY_TO_EFILE` reads "recorded the client's signature";
    - the fixture notes at lines 1381–1418 become "Site coordinator to correct the SSN".
- [ ] **Step 2: Run** `npm test`. Expected: FAIL on those tests.
- [ ] **Step 3: Implement:**
  - `FILED_LINES` gains `paper_and_efile` and its paper lines (the same strings as `efiled_line`); `RESULT_WORDS` becomes `{accepted:"accepted", given_to_client:"on paper, given to the client"}`;
  - `efiledChoices` has four choices; `resultFields` handles only e-filed returns; the Record filing result note;
  - the signing panel strings and the return-to-signing refusal (the e-filed branch only);
  - `office-views` Filing result sentences without the paper branch, and colouring for any Filing result row;
  - `staff-views` `METHOD_NAMES`/`RESULT_NAMES` (`given_to_client: "Given to the client"`), no date for it, the two next steps, the history sentence;
  - the `pool-views` comment wording.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit**: `git commit -m "Staff screens: four pairs, no mailing wait, neutral signing, site coordinator"`.

### Task 6: Browser: the season-end dialog

**Files:**
- Modify: `src/supabase-store.mjs` (after `logContact`, ~line 667)
- Modify: `src/controller.mjs` (beside `logContact`, ~2485; export at ~2693)
- Modify: `src/office-views.mjs` (the Follow-ups header and a new `closeUnsignedDialogBody`)
- Modify: `src/app.mjs` (the `open-close-unsigned` action, the live count on checkbox change, submit)
- Modify: `src/staff-views.mjs` (history sentence for `CLOSE_CASE` with `detail.seasonEnd`)
- Test: `tests/office-views.test.mjs`, `tests/controller.test.mjs`, `tests/store.test.mjs`, `tests/staff-views.test.mjs`

**Interfaces:**
- Consumes: Task 3's RPC and its receipt shape.
- Produces:
  - `store.closeUnsigned({actionId, personId, cases, confirmed}) → receipt`;
  - `controller.closeUnsigned(cases: {caseId, revision}[]) → Promise<void>`;
  - `unsignedCases(cases) → record[]` (in `office-views.mjs`; stage `review_approved`, or `on_hold` with `holdOrigin==='review_approved'`; oldest `updatedAt` first);
  - `closeUnsignedDialogBody(state)`.

- [ ] **Step 1: Write the failing tests:**
  - `office-views`:
    - `unsignedCases` picks only the two kinds, oldest first;
    - Follow-ups for an admin shows the button "Close unsigned cases…", disabled with "No case is waiting for a signature." when `unsignedCases` is empty, and hidden for a volunteer;
    - `closeUnsignedDialogBody` lists each case with a checked box, reference, name, "Ready to exit"/"Hold" and `${waitingDays(updatedAt)} days`;
    - the heading is "Close 3 cases that are waiting for a signature, as Dismissed?", or "Close 2 of 3 cases…" with one unticked;
    - the box text is "These clients didn't come back to sign. None of these returns will be transmitted in TaxSlayer.".
  - `store.test`: `closeUnsigned` calls `vitally_close_unsigned` with `p_action_id`, `p_person_id`, `p_cases` and `p_confirmed`.
  - `controller.test`:
    - `"closeUnsigned sends the ticked list and applies revisions"`;
    - `"closeUnsigned conflict re-reads"`: the store rejects with `CONFLICT`, then the controller reloads the cases and keeps the dialog open with the current `unsignedCases`.
  - `staff-views`: a `CLOSE_CASE` event with `{reason:"dismissed", seasonEnd:true}` reads "closed the case at season end · Dismissed".
- [ ] **Step 2: Run** `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** following the Mark e-filed dialog's pattern in `app.mjs`:
  - the open action;
  - the checkbox change updates the heading and the confirm button's disabled state, which is disabled when nothing is ticked or the box isn't ticked;
  - submit collects the ticked `{caseId, revision}` and calls `controller.closeUnsigned`.

  The controller uses `newActionId()` and `state.selectedPersonId`, as `logContact` does.
- [ ] **Step 4: Run** `npm test`. Expected: PASS (the unit count above the 1317 baseline).
- [ ] **Step 5: Commit**: `git commit -m "Follow-ups: Close unsigned cases at season end"`.

### Task 7: The story

**Files:**
- Modify: `tests/browser.mjs` (lines ~2507, 2681, 2695, 2800, 2820, 2861, 2864, 2928, 2942, 2966, 3106–3162; a new final step after the last step)

**Interfaces:**
- Consumes: the dialog field IDs from Tasks 5–6. Name the new ones `field-close-unsigned-confirmed` and `close-unsigned-<caseId>`, following `fieldId`.

- [ ] **Step 1: Update the wording assertions** to the new strings (spec tables), in English and 简体. Line 2861: "Your return is ready. PCDC will take the next step.". Lines 2864 and 2928: the #8 line. Line 2942: its 简体. Lines 2681, 2695 and 2820: "Waiting for the client to sign.". Line 2800: the new Portal text. Line 2507: the new Go over first text. The fix note at 2966: "Site coordinator to correct the dependent's date of birth in TaxSlayer".
- [ ] **Step 2: Rewrite step 5:**
  - after `#field-efiled-method-state-paper`, expect the badge "Accepted, PA on paper" and stage `accepted`;
  - delete the Record filing result block;
  - `eventCount(..., "RECORD_FILING_RESULT")` = 1;
  - `poolTabShows("done", …)`;
  - the client badge is "Ready to mail", and `.status-explanation` contains the PA handover sentence and both refund sites, with no link;
  - `waitForHistoryLine(client, <the second-filing PA handover line>)`;
  - the evidence string becomes "both e-filed, federal accepted and state rejected, returned to signing, ready again, the state return given to the client on paper, Accepted, PA on paper; the client read each step".
- [ ] **Step 3: Add the final step "season-end close":**
  1. Reset the samples.
  2. Through the UI:
     - put the `review_approved` sample on hold (a signing Hold);
     - return the `rejected` sample to signing ("The fix is done."; both its returns are answered), so it's at Ready to exit.
  3. Open Close unsigned cases…. Assert two rows: "Hold" and "Ready to exit", each with its days (0) and a checked box. The heading reads "Close 2 cases that are waiting for a signature, as Dismissed?".
  4. Untick the `rejected` sample and assert the heading reads "Close 1 of 2 cases…". Tick the box and confirm.
  5. Assert:
     - the held sample is Closed · Dismissed and listed under the Closed tab's Dismissed filter;
     - the `rejected` sample is still `review_approved`;
     - the closed sample's last `client_events` message (read with `fixture.sql`) is "PCDC could not reach you, so this application was closed. Your return was not filed.";
     - Follow-ups has no row reading "The case was closed before filing; make sure the return is not transmitted in TaxSlayer.".
  6. Record `evidence.story.seasonEndClose`.
- [ ] **Step 4: Run** `npm run test:browser` (about 11–16 minutes). Expected: PASS, with the story count above the 75 baseline.
- [ ] **Step 5: Commit**: `git commit -m "Story: the PA-40 given to the client on paper; the season-end close"`.

### Task 8: Docs

**Files:**
- Modify: `docs/media/return-lifecycle.svg`, `docs/demo-script.md:35` and `:131` (plus the story walk-through), `docs/developer/database.md` (migration list ~line 40, state diagram ~332, action notes ~382–391, payload table ~458, test list ~736), `docs/developer/frontend.md:349-353` and `:411`

- [ ] **Step 1: Update the SVG's paper branch labels.** "E-filed & paper" becomes "E-filed, PA on paper"; "Both paper" becomes an arrow from Ready to e-file straight to Accepted labelled "Paper". Add "E-filed, federal on paper" beside the PA label. Open the SVG in a browser and check it renders.
- [ ] **Step 2: Update `demo-script.md`:**
  - line 35: "accepted or rejected for an e-filed return; a paper return is given to the client at Mark e-filed";
  - line 131: the signing wording;
  - add the story's paper step and the season-end close.
- [ ] **Step 3: Update `database.md`:**
  - 037's row;
  - `efiled --> accepted` plus `ready_to_efile --> accepted: MARK_EFILED (every return answered)`;
  - the `MARK_EFILED`/`RECORD_FILING_RESULT` notes with `given_to_client` and four pairs;
  - the `vitally_close_unsigned` section (signature, receipt, CONFLICT rule);
  - `database-season-close.mjs` in the test table.
- [ ] **Step 4: Update `frontend.md`:**
  - the names table, with four kinds, "Ready" and "Ready to mail";
  - the Mark e-filed four pairs, and Record filing result e-filed only;
  - the season-end dialog paragraph.
- [ ] **Step 5: Commit**: `git commit -m "Docs: paper handover, four pairs, season-end close"`.

### Task 9: Checks

- [ ] **Step 1:** `npm test`. Expected: PASS. Record the count against 1317.
- [ ] **Step 2:** `npm run db:migrate:test`, then `npm run test:database`. Expected: PASS. Record the count against 408.
- [ ] **Step 3:** `npm run test:browser`. Expected: PASS. Record the story count against 75.
- [ ] **Step 4:** `npm run build:hant -- --check` and `npm run build:intake`, then `git status --short`. Expected: no diff, and nothing to commit.
- [ ] **Step 5:** `npx openspec validate --all`. Expected: all valid.
- [ ] **Step 6:** Tick `tasks.md` 2.x–10.1 as each task's commits land. Note that `npm run test:auth-browser` wasn't run, because sign-in is untouched.
