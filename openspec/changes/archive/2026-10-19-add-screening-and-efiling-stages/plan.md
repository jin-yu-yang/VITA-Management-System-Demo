# Add Screening and E-filing Stages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- A case moves along the main chain: Request sent → Screening in progress → Pending intake / filing → Filing in progress (↔ Corrections in progress) → Pending review → Review in progress → Ready to exit → Ready to e-file → E-filed.
- Screening starts on an admin's first open.
- Admins mark Ready to e-file and E-filed behind a confirmation.
- Staff and clients each see their own stage names and messages.

**Architecture:**
- **Migration 032** widens the stage `CHECK`, adds three admin-only actions (`START_SCREENING`, `MARK_READY_TO_EFILE`, `MARK_EFILED`) through the existing action pipeline, and adjusts `VERIFY_INTAKE`, `SUBMIT` (office cases) and `CLOSE_CASE`.
- **The controller** sends `START_SCREENING` quietly when an admin persona opens a Request sent case.
- **The views** read new stage descriptions (staff label, client label, client message), new tabs and rows, and two `confirmBody` dialogs.

**Tech Stack:**
- plain ES modules;
- `node:test`;
- Postgres/Supabase (the local stack `vitally-task2`);
- Playwright (the story, run by the controller).

**Spec:** in `openspec/changes/add-screening-and-efiling-stages/`:
- `specs/case-lifecycle/spec.md`;
- `design.md` (D1–D9);
- `brainstorm.md` (Q1–Q11);
- `proposal.md` and `tasks.md`.

## Global Constraints

- **Data:** fictional data only, in code, tests, fixtures and screenshots.
- **Migrations:**
  - `032_screening_and_efiling_stages.sql` is hand-written, and comes after #88's `031_contact_log.sql`.
  - Never edit an applied migration.
  - Redefined functions are copied **verbatim** from their latest definitions (named in each step), changing only the lines this plan names.
- **Implementers run only:**
  - `npm test`;
  - `npm run build:hant` and `npm run build:hant -- --check`;
  - `npm run build:intake`;
  - `node --check`;
  - focused `node --test`;
  - `npx openspec validate --all`.

  They never run `npm run db:migrate:test`, `npm run test:database`, `npm run test:browser` or `npm run test:auth-browser`, and never pipe SQL into the database. The controller dry-runs and applies migrations (031, then 032) only after the user's OK in chat, and runs those suites.
- Never run `supabase start` or `npx supabase start` from the repo root.
- **Commands:** `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && <one command>`.
- **繁體:** after any 简体 change, run `npm run build:hant` and commit `src/zh-hant.mjs`. Staff screens stay English.
- **Kept as they are:**
  - existing `data-action` / `data-case-action` values, ids, roles and accessible names, unless this plan says otherwise;
  - the stage keys (no renames).
- **Git, inside the worktree:**
  - run each git command on its own, never chained with `&&` or `;`, and never inside `$(…)`;
  - stage files by name, never `git add -A` or `git add .`;
  - write commit messages to a scratchpad file and run `git commit -F <file>`;
  - confirm with `git rev-parse --short HEAD` and `git status --short`;
  - **every commit message ends with a blank line and exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, whatever model you are.**
- Never write under `docs/superpowers/`, and never commit `.superpowers/`.
- **The stages, in chain order (exact):**

  ```
  draft, received, screening, preparation_ready, preparing, review_ready,
  reviewing, corrections_required, review_approved, ready_to_efile, efiled, closed
  ```

- **The new actions (exact):** `START_SCREENING`, `MARK_READY_TO_EFILE`, `MARK_EFILED`.
- **Staff names (exact):**

  | Key | Staff name |
  |---|---|
  | `draft` | Draft |
  | `received` | Request sent |
  | `screening` | Screening in progress |
  | `preparation_ready` | Pending intake / filing |
  | `preparing` | Filing in progress (preparing) |
  | `corrections_required` | Corrections in progress |
  | `review_ready` | Pending review |
  | `reviewing` | Review in progress |
  | `review_approved` | Ready to exit |
  | `ready_to_efile` | Ready to e-file |
  | `efiled` | E-filed |
  | `closed` | Closed |

- **Client labels (exact, en / 简体):**

  | Key | Client label |
  |---|---|
  | `draft` | Draft / 草稿 |
  | `received` | Sent to PCDC / 已发送给 PCDC |
  | `screening` | Being reviewed / 审核中 |
  | `preparation_ready` | Waiting for a volunteer / 等待志愿者 |
  | `preparing` | Being prepared / 准备中 |
  | `corrections_required` | Being corrected / 正在更正 |
  | `review_ready` | Waiting for review / 等待检查 |
  | `reviewing` | Being checked / 检查中 |
  | `review_approved` | Ready to sign / 等待签名 |
  | `ready_to_efile` | Signed / 已签名 |
  | `efiled` | E-filed / 已电子递交 |
  | `closed` | Closed / 已关闭 |

- **Client messages (exact, en / 简体).** Unlisted stages keep today's text.

  | Key | English | 简体 |
  |---|---|---|
  | `received` | Your application is with PCDC. The office will review it soon and may call you. | PCDC 已收到您的申请。办公室会尽快查看，并可能致电您。 |
  | `screening` | PCDC is reviewing your application. We may call you to confirm your information and documents. | PCDC 正在审核您的申请。我们可能会致电您，核对您的信息和文件。 |
  | `preparation_ready` | Your application has been checked. It is waiting for a volunteer to start preparing your return. | 您的申请已核对完毕，正在等待志愿者开始准备您的报税表。 |
  | `review_ready` | Your return is prepared and is waiting for an independent reviewer. | 您的报税表已准备好，正在等待审核志愿者检查。 |
  | `review_approved` | Your return has been checked. PCDC will contact you to sign Form 8879, which is needed before your return can be filed. | 您的报税表已检查完毕。PCDC 会联系您签署 8879 表，签署后才能递交报税表。 |
  | `ready_to_efile` | You signed Form 8879. PCDC will e-file your return next. | 您已签署 8879 表。PCDC 接下来会以电子方式递交您的报税表。 |
  | `efiled` | Your return was e-filed. The IRS will confirm whether it is accepted. | 您的报税表已电子递交。国税局会确认是否接受。 |

- **History lines (exact), written by the database and translated in `SENTENCES`:**

  | Line | 简体 |
  |---|---|
  | `PCDC started reviewing your application. We may call you.` | PCDC 已开始审核您的申请。我们可能会致电您。 |
  | `PCDC recorded that you signed Form 8879. Your return is ready to e-file.` | PCDC 已记录您签署了 8879 表。您的报税表可以电子递交了。 |
  | `PCDC e-filed your return.` | PCDC 已电子递交您的报税表。 |

- **No client text names a phone number.**

---

### Task 1: The database (migration 032) and its tests

**Files:**
- Create: `supabase/migrations/032_screening_and_efiling_stages.sql`
- Modify:
  - `tests/support/database-fixture.mjs`:
    - client builders that gain `START_SCREENING`: `readyCase` (~:328, VERIFY_INTAKE at :333) and `prepareClassCase` (~:475, VERIFY_INTAKE at :487);
    - `assistedCase` (~:342, VERIFY_INTAKE at :347) is an office case: **no** new line, since its submit now lands in `screening`;
    - `preparedCase` (~:362) builds on `readyCase` and needs nothing of its own;
    - new helpers (below): `submittedClientCase`, `clientMessages`, `approvedCase`.
  - the direct client `SUBMIT` → `VERIFY_INTAKE` call sites (check each is a client case; an office case gets no new line):
    - database-actions.mjs: 500–513, 645, 743–746;
    - database-assistance.mjs: 71;
    - database-intake.mjs: 768;
    - database-realtime.mjs: 182;
    - database-redesign.mjs: 111.
  - the `case_events` / history action lists that name `VERIFY_INTAKE` after `SUBMIT` (insert `"START_SCREENING"` after `"SUBMIT"` for client cases):
    - database-actions.mjs: 115, 149, 157, 235, 277;
    - database-assistance.mjs: 571, 593;
    - database-documents.mjs: 106, 117, 703, 713;
    - database-review.mjs: 165, 213.
  - hard-coded revisions downstream of a client builder or site above, each one more:
    - database-actions.mjs: 104, 118, 130, 138, and the `applyArgs` `revision: 3` at :293 (becomes 4);
    - database-assistance.mjs: 580, 590, 604, 615, 637, 663, 870, 905, and the `applyArgs` at :760.

    Then read every other `revision` literal in `tests/database*.mjs` (about 74) and decide for each whether a changed builder precedes it. List each change in the report.
  - assertions that an **office** submit lands at `received`, which become `"screening"`:
    - database-intake-default.mjs: 261;
    - database-intake.mjs: 385 (`byOffice`);
    - database-actions.mjs: 565.

    database-intake-default.mjs:242 and database-intake.mjs:332 are client submits and stay `"received"`.
- Create: `tests/database-stages.mjs`. `npm run test:database` globs `tests/database*.mjs`, so nothing needs registering.

**Interfaces:**
- Produces:
  - the stage `CHECK` with the twelve stages;
  - `START_SCREENING` (empty payload), `MARK_READY_TO_EFILE` and `MARK_EFILED` (payload exactly `{"confirmed": true}`), all admin-only;
  - `MARK_READY_TO_EFILE` refused (`INVALID_TRANSITION`) until the latest approved review's `client_contact_status` is `'completed'`;
  - `VERIFY_INTAKE` from `screening` only;
  - an office `SUBMIT` landing in `screening`;
  - `CLOSE_CASE` from `screening`.

- [ ] **Step 1: The migration**

`supabase/migrations/032_screening_and_efiling_stages.sql`. **No `begin;` or `commit;` in the file:** `tools/admin/migrate.mjs` runs every pending file inside its own transaction and records `schema_migrations` in it, and no existing migration has either. An inner `commit;` would end that transaction early, and would make the controller's dry run real.

```sql
-- 032: the main chain of stages (OpenSpec change add-screening-and-efiling-stages).
-- Three stages join the twelve-value check: screening (between received and
-- preparation_ready), ready_to_efile and efiled (after review_approved). Three
-- admin-only actions move a case into them. VERIFY_INTAKE now starts from
-- screening, an office case's SUBMIT lands there, and CLOSE_CASE allows it.
-- Every redefined function is copied verbatim from its latest definition, with
-- only the lines marked "032" changed.

alter table public.cases drop constraint if exists cases_stage_check;
alter table public.cases add constraint cases_stage_check check (stage in (
  'draft','received','screening','preparation_ready','preparing','review_ready',
  'reviewing','corrections_required','review_approved','ready_to_efile','efiled','closed'));
```

- **Copy ranges.** The line numbers below are approximate. Copy each function whole, from its `create or replace function` line to its closing `$$;`, and check that the file you copy from is still its latest definition: `grep -ln "function vitally_private.<name>(" supabase/migrations/*.sql`, then take the highest number. Today that is 018 for `check_operation_authority`, 017 for `check_payload` and `vitally_apply_action`, 003 for `act_verify_intake`, 005 for `act_close_case`, and 023 for `act_submit`.
- **`vitally_private.check_operation_authority`:** copy 018:17–98 verbatim. Change the admin-only group (018:42) to:

  ```sql
   when 'VERIFY_INTAKE','REMIND','CLOSE_CASE','START_SCREENING','MARK_READY_TO_EFILE','MARK_EFILED' then -- 032
  ```

- **`vitally_private.check_payload`:** copy 017:262–387 verbatim.
  - Add `'START_SCREENING'` to the empty-payload group (017:286): `when 'CLAIM_PREPARATION','REMIND','SUBMIT_REVIEW','CLAIM_REVIEW','APPROVE_REVIEW','START_SCREENING' then -- 032`.
  - Add a branch before the final `else`:

    ```sql
     when 'MARK_READY_TO_EFILE','MARK_EFILED' then -- 032
      if vitally_private.payload_keys(p_payload)<>array['confirmed']
        or p_payload->'confirmed'<>'true'::jsonb then
       raise sqlstate 'VT007' using message='VALIDATION';
      end if;
    ```

- **The new handlers:**

  ```sql
  create or replace function vitally_private.act_start_screening(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
  returns jsonb language plpgsql security definer set search_path='' as $$
  begin
   if p_case.stage<>'received' then
    raise sqlstate 'VT004' using message='INVALID_TRANSITION';
   end if;
   update public.cases set stage='screening' where id=p_case.id;
   return jsonb_build_object('detail','{}'::jsonb,
    'message','PCDC started reviewing your application. We may call you.');
  end; $$;

  -- The reviewer's call with the client comes first (brainstorm Q12): until
  -- #85 moves it before approval, it is recorded at review_approved.
  create or replace function vitally_private.act_mark_ready_to_efile(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
  returns jsonb language plpgsql security definer set search_path='' as $$
  declare v_status text;
  begin
   if p_case.stage<>'review_approved' then
    raise sqlstate 'VT004' using message='INVALID_TRANSITION';
   end if;
   select client_contact_status into v_status from public.reviews
    where workspace_id=p_case.workspace_id and case_id=p_case.id and status='approved'
    order by created_at desc limit 1;
   if v_status is distinct from 'completed' then
    raise sqlstate 'VT004' using message='INVALID_TRANSITION';
   end if;
   update public.cases set stage='ready_to_efile' where id=p_case.id;
   return jsonb_build_object('detail','{}'::jsonb,
    'message','PCDC recorded that you signed Form 8879. Your return is ready to e-file.');
  end; $$;

  create or replace function vitally_private.act_mark_efiled(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
  returns jsonb language plpgsql security definer set search_path='' as $$
  begin
   if p_case.stage<>'ready_to_efile' then
    raise sqlstate 'VT004' using message='INVALID_TRANSITION';
   end if;
   update public.cases set stage='efiled' where id=p_case.id;
   return jsonb_build_object('detail','{}'::jsonb,'message','PCDC e-filed your return.');
  end; $$;
  ```

- **`vitally_private.act_verify_intake`:** `create or replace`, copied from 003:210–220, with `if p_case.stage<>'screening' then -- 032`.
- **`vitally_private.act_submit`:** `create or replace`, copied from 023:266–285. Replace the stage update and the return with:

  ```sql
   -- 032: the office has already screened a client it entered itself.
   update public.cases set stage=case when p_case.owner_user_id is null then 'screening' else 'received' end
    where id=p_case.id returning client_number into v_number;
   return jsonb_build_object('detail',jsonb_build_object('clientNumber',v_number),
    'message',case when p_case.owner_user_id is null
      then 'PCDC started reviewing your application. We may call you.'
      else 'Application received. A volunteer will check your information and documents.' end);
  ```

- **`vitally_private.act_close_case`:** `create or replace`, copied from 005:175–192, with the list `('received','screening','preparation_ready','preparing','review_ready','reviewing','corrections_required') -- 032`.
- **`public.vitally_apply_action`:** `create or replace`, copied from 017:540–600. Add before `when 'UPDATE_CONTACT'`:

  ```sql
   when 'START_SCREENING' then v_outcome=vitally_private.act_start_screening(v_member,v_case,v_person,p_payload); -- 032
   when 'MARK_READY_TO_EFILE' then v_outcome=vitally_private.act_mark_ready_to_efile(v_member,v_case,v_person,p_payload); -- 032
   when 'MARK_EFILED' then v_outcome=vitally_private.act_mark_efiled(v_member,v_case,v_person,p_payload); -- 032
  ```

- **Grants:** re-apply exactly as 017 ends (the revoke/grant on `vitally_apply_action`, then `revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;`). The file ends there, with no `commit;`.
- **A comment** at the top of each redefined function names its source migration. Check that every new `vitally_private` function is `security definer` (a test enforces it).

- [ ] **Step 2: The database tests**

**Existing tests.**
- Every builder and site listed under **Files** inserts, between `SUBMIT` and `VERIFY_INTAKE`:

  ```js
  await f.act(f.presenter, caseId, f.sam, "START_SCREENING", {});
  ```

  Use the site's own client and case id variable.
- Office cases (`assistedCase`, any `mode: "assisted"` submit) **skip** the new line: their submit lands in `screening`.
- The history lists and the hard-coded revisions change as listed under **Files**.

**New helpers** in `tests/support/database-fixture.mjs`, beside `preparedCase`:

```js
  // A client case just submitted: stage received, no screening yet.
  f.submittedClientCase = async () => {
    // tests/database-actions.mjs:35 has the same steps as a local
    // `submittedCase(f)` (draftCase, then SUBMIT as applicantA). Move that
    // helper here and have both files use it. Return { caseId }.
  };
  // The client's history lines for a case, oldest first (client_events.message).
  f.clientMessages = async (caseId) =>
    (await f.sql("select message from public.client_events where case_id=$1 order by created_at, id", [caseId])).rows.map((row) => row.message);
  // A case at review_approved. With { called: true } (the default) the
  // reviewer has also recorded the call with the client.
  f.approvedCase = async ({ called = true } = {}) => {
    const caseId = await f.preparedCase();
    await f.act(f.presenter, caseId, f.morgan, "CLAIM_REVIEW", {});
    await f.act(f.presenter, caseId, f.morgan, "APPROVE_REVIEW", {});
    if (called)
      await f.act(f.presenter, caseId, f.morgan, "RECORD_REVIEW_CONTACT", { outcome: "reached", note: "Told the fictional client the return is ready." });
    return caseId;
  };
```

`submittedClientCase` is written as a comment above on purpose: move `submittedCase` from `tests/database-actions.mjs` rather than writing a third copy of those steps. Check the `client_events` column names against migration 008 before using `clientMessages`, and the `RECORD_REVIEW_CONTACT` payload against `tests/database-review.mjs:31`.

**New tests,** in `tests/database-stages.mjs`. Follow `tests/database-review.mjs`'s structure: import `createDatabaseFixture` and `rejected` from `./support/database-fixture.mjs`, then `const f = await createDatabaseFixture(); try { … } finally { await f.close(); }`.

```js
test("the main chain's new stages against real Supabase", async (t) => {
  const f = await createDatabaseFixture();
  try {

  await t.test("an admin starts screening; the history tells the client", async () => {
    const { caseId } = await f.submittedClientCase(); // draftCase + SUBMIT as applicantA; add to database-fixture.mjs
    await f.act(f.presenter, caseId, f.sam, "START_SCREENING", {});
    assert.equal((await f.readStaffCase(caseId)).stage, "screening");
    assert.ok((await f.clientMessages(caseId)).includes("PCDC started reviewing your application. We may call you."));
  });

  await t.test("START_SCREENING refusals, in check order", async () => {
    const { caseId } = await f.submittedClientCase();
    for (const personId of [f.alex, f.morgan, null])
      await assert.rejects(() => f.act(f.presenter, caseId, personId, "START_SCREENING", {}), rejected("FORBIDDEN"));
    await assert.rejects(() => f.act(f.presenter, caseId, f.sam, "START_SCREENING", { x: 1 }), rejected("VALIDATION"));
    await f.act(f.presenter, caseId, f.sam, "START_SCREENING", {});
    await assert.rejects(() => f.act(f.presenter, caseId, f.sam, "START_SCREENING", {}), rejected("INVALID_TRANSITION"));
  });

  await t.test("VERIFY_INTAKE waits for screening", async () => {
    const { caseId } = await f.submittedClientCase();
    await assert.rejects(() => f.act(f.presenter, caseId, f.sam, "VERIFY_INTAKE", { checks: f.intakeChecks }), rejected("INVALID_TRANSITION"));
    assert.equal((await f.readStaffCase(caseId)).stage, "received");
  });

  await t.test("an office case lands in screening with a client number", async () => {
    // draftCase with mode "assisted" as f.sam, then SUBMIT as f.sam (see assistedCase)
    // assert stage "screening", clientNumber not null, history line "PCDC started reviewing…"
  });

  await t.test("signing and e-filing, admin only, confirmed only", async () => {
    const caseId = await f.approvedCase();
    const confirmed = { confirmed: true };
    await assert.rejects(() => f.act(f.presenter, caseId, f.sam, "MARK_EFILED", confirmed), rejected("INVALID_TRANSITION"));
    for (const personId of [f.alex, f.morgan, null])
      await assert.rejects(() => f.act(f.presenter, caseId, personId, "MARK_READY_TO_EFILE", confirmed), rejected("FORBIDDEN"));
    for (const payload of [{}, { confirmed: false }, { confirmed: "true" }, { confirmed: true, x: 1 }])
      await assert.rejects(() => f.act(f.presenter, caseId, f.sam, "MARK_READY_TO_EFILE", payload), rejected("VALIDATION"));
    await f.act(f.presenter, caseId, f.sam, "MARK_READY_TO_EFILE", confirmed);
    assert.equal((await f.readStaffCase(caseId)).stage, "ready_to_efile");
    assert.ok((await f.clientMessages(caseId)).includes("PCDC recorded that you signed Form 8879. Your return is ready to e-file."));
    for (const personId of [f.alex, f.morgan, null])
      await assert.rejects(() => f.act(f.presenter, caseId, personId, "MARK_EFILED", confirmed), rejected("FORBIDDEN"));
    await assert.rejects(() => f.act(f.presenter, caseId, f.sam, "MARK_EFILED", {}), rejected("VALIDATION"));
    await f.act(f.presenter, caseId, f.sam, "MARK_EFILED", confirmed);
    assert.equal((await f.readStaffCase(caseId)).stage, "efiled");
    assert.ok((await f.clientMessages(caseId)).includes("PCDC e-filed your return."));
    await assert.rejects(() => f.act(f.presenter, caseId, f.sam, "MARK_EFILED", confirmed), rejected("INVALID_TRANSITION"));
  });

  await t.test("ready to e-file waits for the reviewer's call", async () => {
    const caseId = await f.approvedCase({ called: false });
    await assert.rejects(() => f.act(f.presenter, caseId, f.sam, "MARK_READY_TO_EFILE", { confirmed: true }), rejected("INVALID_TRANSITION"));
    assert.equal((await f.readStaffCase(caseId)).stage, "review_approved");
    await f.act(f.presenter, caseId, f.morgan, "RECORD_REVIEW_CONTACT", { outcome: "reached", note: "Told the fictional client the return is ready." });
    await f.act(f.presenter, caseId, f.sam, "MARK_READY_TO_EFILE", { confirmed: true });
    assert.equal((await f.readStaffCase(caseId)).stage, "ready_to_efile");
  });

  await t.test("closing: allowed during screening, refused after review", async () => {
    // CLOSE_CASE at screening → closed. Use the payload database-assistance.mjs sends to CLOSE_CASE.
    // CLOSE_CASE at review_approved, ready_to_efile and efiled (approvedCase, then the marks) → INVALID_TRANSITION each
  });

  await t.test("a rejected action commits nothing", async () => {
    // a MARK_READY_TO_EFILE refused for its stage leaves revision, case_events and client_events as they were
    // (follow database-assistance.mjs:741–760)
  });
  } finally {
    await f.close();
  }
});
```

- **Fill in the two commented subtests** with real assertions, following the neighbouring files' builders and helpers, and finish the office-case subtest above the same way. List in the report what each one asserts.
- **No unit RED is possible** for this task: implementers can't run the database suite. Run `node --check` on every changed test file, and `npm test` (unit) must stay green.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/032_screening_and_efiling_stages.sql tests/support/database-fixture.mjs tests/database-stages.mjs <each changed tests/database-*.mjs>
git commit -F <scratchpad>/commit-task1.txt
```

Message: "Migration 032: screening, ready to e-file and e-filed; the intake check waits for screening", then the trailer.

- [ ] **Step 4 (controller): dry run, apply, test**
- **Check first:** `grep -c "^begin;\|^commit;" supabase/migrations/032_*.sql` prints 0.
- **Dry run:** 031 and 032 in the controller's own `begin … rollback` on `vitally-task2`. It checks the `CHECK`, an office submit landing in `screening`, `VERIFY_INTAKE` refused at `received`, and each new action on a test case.
- **Apply:** after the user's OK, `npm run db:migrate:test`.
- **Test:** `npm run test:database`.

---

### Task 2: Stages, labels and text

**Files:**
- Modify:
  - `src/contracts.mjs` (`STAGES` :4–14, `CASE_ACTIONS` :16–42);
  - `src/domain.mjs` (`STAGE_DESCRIPTIONS` :11–55, `UNKNOWN_STAGE`, `describeStage` :63);
  - `src/ui.mjs` (`STAGE_TONES` :204, `stageBadge` :215);
  - `src/case-actions.mjs` (`BUILDERS` :148–152 and beside `CLOSE_CASE`);
  - `src/client-text.mjs` (`stage.*` :145–164, `SENTENCES` :386–);
  - `src/client-views.mjs`: only the three client badges (the applications list :121, the review panel :333, the status panel :349) gain `{ audience: "client" }`, so 简体 client pages never show English staff names between this task and Task 6;
  - `src/zh-hant.mjs` (generated).
- Test: `tests/domain.test.mjs`, `tests/case-actions.test.mjs`, `tests/ui.test.mjs`, `tests/client-language.test.mjs`, `tests/client-views.test.mjs`

**Interfaces:**
- Produces:
  - `STAGES` (twelve, chain order);
  - `CASE_ACTIONS` with the three new types;
  - `describeStage(stage, lang) → { label, clientLabel, clientMessage }`, where `label` is always the staff English and the other two are in `lang`;
  - `stageBadge(stage, lang = "en", { audience = "staff" } = {})`, where `audience: "client"` shows `clientLabel`;
  - payload builders `START_SCREENING: () => ({})`, and `MARK_READY_TO_EFILE`/`MARK_EFILED: (dataset, values) => ({ confirmed: confirmation(values, "<sentence>") })`.

- [ ] **Step 1: Tests first**

`tests/domain.test.mjs`:

```js
test("the twelve stages, in chain order", () => {
  assert.deepEqual(STAGES, ["draft","received","screening","preparation_ready","preparing","review_ready","reviewing","corrections_required","review_approved","ready_to_efile","efiled","closed"]);
});

test("each stage has a staff name, a client label and a client message", () => {
  const STAFF = { draft: "Draft", received: "Request sent", screening: "Screening in progress", preparation_ready: "Pending intake / filing", preparing: "Filing in progress (preparing)", corrections_required: "Corrections in progress", review_ready: "Pending review", reviewing: "Review in progress", review_approved: "Ready to exit", ready_to_efile: "Ready to e-file", efiled: "E-filed", closed: "Closed" };
  const CLIENT_EN = { draft: "Draft", received: "Sent to PCDC", screening: "Being reviewed", preparation_ready: "Waiting for a volunteer", preparing: "Being prepared", corrections_required: "Being corrected", review_ready: "Waiting for review", reviewing: "Being checked", review_approved: "Ready to sign", ready_to_efile: "Signed", efiled: "E-filed", closed: "Closed" };
  const CLIENT_ZH = { draft: "草稿", received: "已发送给 PCDC", screening: "审核中", preparation_ready: "等待志愿者", preparing: "准备中", corrections_required: "正在更正", review_ready: "等待检查", reviewing: "检查中", review_approved: "等待签名", ready_to_efile: "已签名", efiled: "已电子递交", closed: "已关闭" };
  for (const stage of STAGES) {
    assert.equal(describeStage(stage).label, STAFF[stage], stage);
    assert.equal(describeStage(stage, "zh-Hans").label, STAFF[stage], `${stage}: staff names stay English`);
    assert.equal(describeStage(stage).clientLabel, CLIENT_EN[stage], stage);
    assert.equal(describeStage(stage, "zh-Hans").clientLabel, CLIENT_ZH[stage], stage);
    assert.ok(describeStage(stage).clientMessage && describeStage(stage, "zh-Hans").clientMessage, stage);
  }
  assert.equal(describeStage("efiled").clientMessage, "Your return was e-filed. The IRS will confirm whether it is accepted.");
  assert.equal(describeStage("screening", "zh-Hans").clientMessage, "PCDC 正在审核您的申请。我们可能会致电您，核对您的信息和文件。");
});

const PHONE = /\d{3}\D{0,2}\d{3}\D{0,2}\d{4}/;
const NEW_HISTORY = [
  "PCDC started reviewing your application. We may call you.",
  "PCDC recorded that you signed Form 8879. Your return is ready to e-file.",
  "PCDC e-filed your return.",
];

test("no stage message or new history line names a phone number", () => {
  for (const stage of STAGES)
    for (const lang of ["en", "zh-Hans"]) {
      assert.doesNotMatch(describeStage(stage, lang).clientMessage, PHONE, `${stage} ${lang}`);
      assert.doesNotMatch(describeStage(stage, lang).clientLabel, PHONE, `${stage} ${lang}`);
    }
  for (const line of NEW_HISTORY)
    for (const lang of ["en", "zh-Hans"]) assert.doesNotMatch(translateSentence(line, lang), PHONE, `${line} ${lang}`);
});
```

Use the function `SENTENCES` is read through in `src/client-text.mjs` for `translateSentence` (read the file for its real name and signature; the client page's history uses it).

Also add the exact client messages from the Global Constraints for `received`, `preparation_ready`, `review_ready`, `review_approved` and `ready_to_efile`, in English and 简体.

**Existing `tests/domain.test.mjs` assertions that change on purpose** (list each in the report):
- the full `CASE_ACTIONS` list (~:100, `deepEqual`) gains the three new types in their places;
- `Object.keys(describeStage("reviewing")).sort()` (~:48) becomes `["clientLabel","clientMessage","label"]`;
- the old staff labels (~:52 "In review", ~:66 "In preparation") become the new staff names;
- the `review_approved` message regex (~:57) follows the new Ready to exit message;
- the unknown stage's shape (~:78) gains `clientLabel: "Application"`;
- "describeStage takes a language" (~:174–193): `zh.label` is now English. The Han check and the uniqueness check (~:185, :190) move to `clientLabel`;
- "the text table's English stage entries match" (~:201) compares `t("stage.X.label")` with `clientLabel`, not `label`;
- the comment at ~:29 ("no claim that a later milestone has happened") now reads: no claim of a milestone the case hasn't reached. The `efiled` message names e-filing because the case is there. The unknown-stage list (~:70, `"signed"`, `"filed"`) stays: neither is a key.

`tests/ui.test.mjs`:

```js
test("a stage badge shows the staff name, or the client's label for a client", () => {
  assert.match(stageBadge("screening"), /Screening in progress/);
  assert.match(stageBadge("screening", "zh-Hans", { audience: "client" }), /审核中/);
  assert.match(stageBadge("review_approved", "en", { audience: "client" }), /Ready to sign/);
  for (const stage of ["screening", "ready_to_efile", "efiled"]) assert.doesNotMatch(stageBadge(stage), /class="badge neutral"/, stage);
});
```

`tests/case-actions.test.mjs`:
- `payloadFor("START_SCREENING", {}, {})` gives `{ type, payload: {} }`.
- `payloadFor("MARK_READY_TO_EFILE", {}, { confirmed: "true" })` gives `{ confirmed: true }`.
- Without `confirmed`, it throws a VALIDATION with the sentence "Confirm that the client signed Form 8879." For `MARK_EFILED` the sentence is "Confirm that the return was e-filed."
- `PAYLOAD_ACTIONS` includes the three.

`tests/client-language.test.mjs` (or wherever `SENTENCES` coverage lives): the three history lines translate exactly as in the Global Constraints.

- [ ] **Step 2: Run them to see them fail**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/domain.test.mjs tests/ui.test.mjs tests/case-actions.test.mjs tests/client-language.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/contracts.mjs`:
- `STAGES` is the Global Constraints list.
- `CASE_ACTIONS` adds `"START_SCREENING"` after `"SUBMIT"`, and `"MARK_READY_TO_EFILE"`, `"MARK_EFILED"` after `"RECORD_REVIEW_CONTACT"`.

`src/domain.mjs`:
- Each `STAGE_DESCRIPTIONS` entry becomes `{ label, clientLabel, clientMessage }` with the exact staff name, client label (English) and client message. Today's text is kept for `draft`, `preparing`, `corrections_required`, `reviewing` and `closed`.
- `UNKNOWN_STAGE` gains `clientLabel: "Application"`.
- `describeStage`:

  ```js
  export function describeStage(stage, lang = "en") {
    const known = Object.hasOwn(STAGE_DESCRIPTIONS, stage ?? "");
    const base = known ? STAGE_DESCRIPTIONS[stage] : UNKNOWN_STAGE;
    if (!isLang(lang) || lang === "en") return { ...base };
    const key = known ? stage : "unknown";
    // The staff name is a volunteer convention and stays English; the client's
    // label and message speak the screen's language.
    return { label: base.label, clientLabel: t(`stage.${key}.label`, {}, lang), clientMessage: t(`stage.${key}.client`, {}, lang) };
  }
  ```

  The staff callers keep `.label` (pool filter, lifecycle bar, presenter panel). The only client callers of a stage *name* are the three `stageBadge` calls in `src/client-views.mjs` (:121, :333, :349): pass `{ audience: "client" }` to each in this task. `intake-views.mjs:640` reads only `clientMessage` and needs nothing. Add one `tests/client-views.test.mjs` check that the 简体 applications list shows 审核中 for a `screening` case and no "Screening in progress".

`src/ui.mjs`:
- `STAGE_TONES` gains `screening: "intake"`, `ready_to_efile: "filing"`, `efiled: "filing"`.
- `stageBadge`:

  ```js
  export const stageBadge = (stage, lang = "en", { audience = "staff" } = {}) => {
    const described = describeStage(stage, lang);
    const text = audience === "client" ? described.clientLabel : described.label;
    return `<span class="badge ${STAGE_TONES[stage] ?? "neutral"}"><i></i>${esc(text)}</span>`;
  };
  ```

  Keep its current argument order.

`src/case-actions.mjs`:
- `START_SCREENING: () => ({}),`
- `MARK_READY_TO_EFILE: (dataset, values) => ({ confirmed: confirmation(values, "Confirm that the client signed Form 8879.") }),`
- `MARK_EFILED: (dataset, values) => ({ confirmed: confirmation(values, "Confirm that the return was e-filed.") }),`

If `confirmation` takes no sentence today, give it an optional second argument that defaults to today's "Confirm that you want to close this case.".

`src/client-text.mjs`:
- `stage.<key>.label` becomes the **client** label, and `stage.<key>.client` the client message, for all twelve stages plus `unknown` (`{ en, zh }`, exact).
- `SENTENCES` gains the three history lines.

Run `npm run build:hant`.

- [ ] **Step 4: Run the tests**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
Then: `npm run build:hant -- --check`.
Expected: PASS, and clean. Existing tests that pin old labels ("Received", "Waiting for preparation", "In preparation", "Review complete", …) are updated to the new staff names on purpose. List each file in the report. The work board's tab names ("Waiting for preparation", …) are tab labels, not stage names: they stay.

- [ ] **Step 5: Commit**

```bash
git add src/contracts.mjs src/domain.mjs src/ui.mjs src/case-actions.mjs src/client-text.mjs src/client-views.mjs src/zh-hant.mjs <changed tests>
git commit -F <scratchpad>/commit-task2.txt
```

Message: "Stages: twelve keys, staff names, client labels and messages, and the new history lines", then the trailer.

---

### Task 3: Screening starts on an admin's open

**Files:**
- Modify: `src/controller.mjs` (`selectCase` :1325, `selectPerson` :1245, `refresh` :738, `load` ~:985–1000, `clearSelection` :792, `signOut` :1178)
- Test: `tests/controller.test.mjs`

**Interfaces:**
- Consumes: `CASE_ACTIONS` with `START_SCREENING` (Task 2).
- Produces: internal `startScreeningIfDue()`. No new API is needed, but expose it if a test needs it.

- [ ] **Step 1: Tests first** (append to `tests/controller.test.mjs`)

```js
const RECEIVED = { id: "case-r", reference: "VT-RRRR-RRRR", stage: "received", revision: 3, answers: {} };
const adminPeople = [
  { id: "person-sam", name: "Sam", capabilities: ["admin", "followup"] },
  { id: "person-alex", name: "Alex", capabilities: ["prepare"] },
];
const startWrites = (store) => store.writes.filter((write) => write.type === "START_SCREENING");

test("an admin persona opening a Request sent case starts screening, once", async () => {
  const store = presenterStore({ cases: [RECEIVED], people: adminPeople });
  const { controller } = build({ store });
  await controller.start();
  controller.selectPerson("person-sam");
  await controller.selectCase("case-r");
  await tick();
  assert.equal(startWrites(store).length, 1);
  assert.deepEqual({ ...startWrites(store)[0], actionId: "id" }, { actionId: "id", caseId: "case-r", expectedRevision: 3, personId: "person-sam", type: "START_SCREENING", payload: {} });
  await controller.selectCase("case-r");
  await tick();
  assert.equal(startWrites(store).length, 1, "not twice");
  assert.equal(controller.getState().busy, false);
  controller.stop();
});

test("a volunteer persona starts nothing; switching to an admin starts it", async () => {
  const store = presenterStore({ cases: [RECEIVED], people: adminPeople });
  const { controller } = build({ store });
  await controller.start();
  controller.selectPerson("person-alex");
  await controller.selectCase("case-r");
  await tick();
  assert.equal(startWrites(store).length, 0);
  controller.selectPerson("person-sam");
  await tick();
  assert.equal(startWrites(store).length, 1);
  controller.stop();
});

test("another admin got there first: no error, the case is re-read", async () => {
  const store = presenterStore({ cases: [RECEIVED], people: adminPeople });
  store.failNext = Object.assign(new Error("INVALID_TRANSITION"), { code: "INVALID_TRANSITION" });
  const { controller } = build({ store });
  await controller.start();
  controller.selectPerson("person-sam");
  await controller.selectCase("case-r");
  await tick();
  const state = controller.getState();
  assert.equal(state.error, null);
  assert.equal(state.retryable, false);
  assert.ok(store.calls.filter((c) => c === "getCase:case-r").length >= 2, "re-read");
  controller.stop();
});

test("offline on open: nothing shows, and a refresh sends the same start again", async () => {
  const store = presenterStore({ cases: [RECEIVED], people: adminPeople });
  store.failNext = Object.assign(new Error("offline"), { code: "OFFLINE" });
  const { controller } = build({ store });
  await controller.start();
  controller.selectPerson("person-sam");
  await controller.selectCase("case-r");
  await tick();
  assert.equal(controller.getState().error, null);
  const first = startWrites(store)[0].actionId;
  await controller.refresh();
  await tick();
  assert.equal(startWrites(store).length, 2);
  assert.equal(startWrites(store)[1].actionId, first, "the same action id, so a receipt answers a replay");
  controller.stop();
});

test("a case past Request sent starts nothing", async () => {
  const store = presenterStore({ cases: [{ ...RECEIVED, stage: "screening" }], people: adminPeople });
  const { controller } = build({ store });
  await controller.start();
  controller.selectPerson("person-sam");
  await controller.selectCase("case-r");
  await tick();
  assert.equal(startWrites(store).length, 0);
  controller.stop();
});

test("selecting a case in place from a list is not an open", async () => {
  const store = presenterStore({ cases: [RECEIVED], people: adminPeople });
  const { controller } = build({ store });
  await controller.start();
  controller.selectPerson("person-sam");
  // Follow-ups' Log contact and the Mark buttons read the case without leaving
  // the list; after start() the window is on its home screen, not a case page.
  await controller.selectCase("case-r", { navigate: false });
  await tick();
  assert.notEqual(controller.getState().screen, "staff-case");
  assert.equal(startWrites(store).length, 0);
  controller.stop();
});

test("a reload on the case page starts screening", async () => {
  const store = presenterStore({ cases: [RECEIVED], people: adminPeople });
  // A stored session as restoreSession reads it: this case open on the staff
  // case page, acting as Sam. Read restoreSession for the real key and shape.
  const sessionStorage = fakeSession({ /* key: JSON with selectedCaseId "case-r", selectedPersonId "person-sam", screen "staff-case" */ });
  const { controller } = build({ store, sessionStorage });
  await controller.start();
  await tick();
  assert.equal(startWrites(store).length, 1);
  controller.stop();
});

test("the connection's return sends the held start, unchanged", async () => {
  const store = presenterStore({ cases: [RECEIVED], people: adminPeople });
  store.failNext = Object.assign(new Error("offline"), { code: "OFFLINE" });
  const { controller } = build({ store });
  await controller.start();
  controller.selectPerson("person-sam");
  await controller.selectCase("case-r");
  await tick();
  await store.handlers.onConnection("offline");
  await store.handlers.onConnection("online");
  await tick();
  const sent = startWrites(store);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1], sent[0], "the same action, id and revision alike");
  controller.stop();
});

test("a race that leaves the case at Request sent tries once more, at the new revision", async () => {
  const store = presenterStore({ cases: [RECEIVED], people: adminPeople });
  // The first start meets a case that moved on (another admin logged a
  // contact): revision 4, still Request sent.
  const act = store.act;
  let first = true;
  store.act = async (action) => {
    if (first && action.type === "START_SCREENING") {
      first = false;
      store.writes.push(action);
      store.records.set("case-r", { ...RECEIVED, revision: 4 });
      throw Object.assign(new Error("CONFLICT"), { code: "CONFLICT" });
    }
    return act(action);
  };
  const { controller } = build({ store });
  await controller.start();
  controller.selectPerson("person-sam");
  await controller.selectCase("case-r");
  await tick();
  const sent = startWrites(store);
  assert.equal(sent.length, 2);
  assert.notEqual(sent[1].actionId, sent[0].actionId, "a fresh action");
  assert.equal(sent[1].expectedRevision, 4);
  assert.equal(controller.getState().error, null);
  controller.stop();
});

test("a refusal that isn't a race is given up on for this case", async () => {
  const store = presenterStore({ cases: [RECEIVED], people: adminPeople });
  store.failNext = Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
  const { controller } = build({ store });
  await controller.start();
  controller.selectPerson("person-sam");
  await controller.selectCase("case-r");
  await tick();
  await controller.refresh();
  await tick();
  assert.equal(startWrites(store).length, 1, "no retry on every refresh");
  assert.equal(controller.getState().error, null);
  controller.stop();
});
```

- **The fake store** (`fakeStore`, `presenterStore` at the top of the file) already has `writes`, `failNext` (thrown once by `act`), `calls`, `records` and `handlers` (set by `subscribe`). The race test wraps `act` once; if `act` reads `store` through a closure that the wrapper bypasses, adapt it and say how. Its `act` doesn't change a stage: make it set `stage: "screening"` for `START_SCREENING`, so the "not twice" check is real. `tick` is defined further down the file.
- **The one placeholder in these tests** is on purpose: the stored-session shape must be read from the controller (`restoreSession` ~:471, `persistSession`). Replace it with the real key and value, and say in the report what you used. If the restored session doesn't restore `screen`, set `navigate` the way a reload's `load()` does and say so.

- [ ] **Step 2: Run them to see them fail**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/controller.test.mjs`
Expected: FAIL (no `START_SCREENING` writes).

- [ ] **Step 3: Implement** (in `src/controller.mjs`)

```js
  // Screening starts when an admin first opens a Request sent case's page
  // (design D4). An open is not a press: nothing is disabled, and no refusal is
  // shown. A race ("another admin got there first", a stale revision) is
  // answered by re-reading the case. Any other refusal gives up on this case in
  // this window. An offline start is held whole and resent unchanged, as
  // dispatch's pendingAction is, so its receipt answers the replay.
  const RACES = ["INVALID_TRANSITION", "CONFLICT"]; // VT003 reaches here as CONFLICT (contracts.mjs)
  let screeningStart = null; // { action, inFlight, gaveUp }
  function actingAdmin() {
    const person = (state.people ?? []).find((entry) => entry?.id === state.selectedPersonId);
    return state.principal?.access === "presenter" && Array.isArray(person?.capabilities) && person.capabilities.includes("admin");
  }
  async function startScreeningIfDue({ afterRace = false } = {}) {
    const record = state.savedCase;
    if (!record || record.stage !== "received" || state.screen !== "staff-case" || !actingAdmin()) return;
    if (state.busy || pendingAction) return;
    if (screeningStart?.action.caseId !== record.id)
      screeningStart = {
        action: {
          actionId: newActionId(),
          caseId: record.id,
          expectedRevision: Number(record.revision),
          personId: state.selectedPersonId,
          type: "START_SCREENING",
          payload: {},
        },
        inFlight: false,
        gaveUp: false,
      };
    if (screeningStart.inFlight || screeningStart.gaveUp) return;
    const held = screeningStart;
    held.inFlight = true;
    let raced = false;
    try {
      await store.act(held.action);
      noteConnected();
      if (screeningStart === held) screeningStart = null;
    } catch (error) {
      held.inFlight = false;
      if (UNKNOWN_OUTCOME.includes(error?.code)) {
        if (error?.code === "OFFLINE") state.connection = "offline";
        show();
        return;
      }
      if (RACES.includes(error?.code)) {
        raced = true;
        if (screeningStart === held) screeningStart = null;
      } else held.gaveUp = true;
    }
    try {
      await loadSelected();
    } catch {
      /* the next refresh reads it */
    }
    show();
    // The case changed but is still at Request sent: try once more at the new
    // revision. A second race in a row waits for the next open or refresh.
    if (raced && !afterRace && state.savedCase?.stage === "received") await startScreeningIfDue({ afterRace: true });
  }
```

- **Check the error codes** against the store: read how `src/supabase-store.mjs` maps `VT003` and a revision conflict (it may already turn both into `CONFLICT`), and keep `RACES` to the codes the store actually throws. Say which in the report.
- **The calls:**
  - at the end of `selectCase`'s success branch, `void startScreeningIfDue();` (after `applyCase(next)` and the screen choice);
  - at the end of `load()`, after its `loadSelected()` block (~:993–1000), `void startScreeningIfDue();`. This is the reload: `state.people` and the restored persona are loaded by then;
  - in `selectPerson`, after `show()`, `void startScreeningIfDue();`;
  - at the end of a successful `refresh()`, `void startScreeningIfDue();`. The reconnect (`onConnection` "online"), the window focus and the `online` event all come through `refresh`. `dispatch` also calls `refresh()` after every action (~:1949), which is harmless because the start is stage-gated.
- **`clearSelection`** and `signOut` (~:1178) set `screeningStart = null`.
- **Nothing here** calls `noteFailure` or `refuse`, sets `busy`, or touches `pendingAction`.
- `store.act`'s name and signature must match what `dispatch` uses; read `dispatch` (~:1920).

- [ ] **Step 4: Run the tests**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
Expected: PASS. Existing controller tests that open `received` cases as an admin persona may now see a `START_SCREENING` write. Update their write counts on purpose, and list each one.

- [ ] **Step 5: Commit**

```bash
git add src/controller.mjs tests/controller.test.mjs
git commit -F <scratchpad>/commit-task3.txt
```

Message: "An admin's first open of a Request sent case starts screening, quietly and once", then the trailer.

---

### Task 4: The case pages and the confirmations

**Files:**
- Modify:
  - `src/admin-views.mjs`: `CLOSABLE_STAGES` :96; `adminEligibility` :115 (`verifyIntake` :130); `intakeChecksPanel` :320; `officeActionsPanel` ~:492; new dialog bodies after `closeCaseDialogBody` :512;
  - `src/staff-views.mjs`: `STAGE_WORK` :100; `LIFECYCLE` :733; `lifecycleBar` :744; `EVENT_SENTENCES` :1570;
  - `src/views.mjs`: `dialog()`;
  - `src/app.mjs`: `runNavigation`'s `open-close-case` neighbourhood :1495; `runCaseAction`'s `closeDialog` lines; `STAFF_NOTICES` :996;
  - `tests/confirm-dialogs.test.mjs` (its render map), `tests/confirm-dialogs.states.mjs` and `tests/fixtures/confirm-dialogs.json`.
- Test: `tests/admin-views.test.mjs`, `tests/staff-views.test.mjs`, `tests/confirm-dialogs.test.mjs`, `tests/shell.test.mjs`

**Interfaces:**
- Consumes: `describeStage`, `stageBadge` (Task 2); the actions (Tasks 1, 2).
- Produces:
  - `adminEligibility(...).markReadyToEfile` and `.markEfiled` (`{allowed, reason}`);
  - `markReadyToEfileDialogBody(state)` and `markEfiledDialogBody(state)`, exported from `src/admin-views.mjs`;
  - dialog names `"mark-ready-to-efile"` and `"mark-efiled"`;
  - navigation actions `"open-mark-ready-to-efile"` and `"open-mark-efiled"` (the buttons may carry `data-case-id`, used by Task 5).

- [ ] **Step 1: Tests first**

`tests/admin-views.test.mjs`:

```js
test("the intake checks wait for screening; the e-file marks wait for their stages", () => {
  const sam = { id: "p-sam", name: "Sam", capabilities: ["admin"] };
  const called = [{ status: "approved", clientContactStatus: "completed" }];
  const at = (stage, reviews = called) => adminEligibility({ caseRecord: { stage, ownerUserId: "u1", reviews } }, sam);
  assert.equal(at("screening").verifyIntake.allowed, true);
  assert.equal(at("received").verifyIntake.allowed, false);
  assert.equal(at("review_approved").markReadyToEfile.allowed, true);
  assert.equal(at("ready_to_efile").markReadyToEfile.allowed, false);
  assert.equal(at("ready_to_efile").markEfiled.allowed, true);
  assert.equal(at("efiled").markEfiled.allowed, false);
  // A list row has no reviews, only the summary Task 5 adds.
  const listRow = (status) => adminEligibility({ caseRecord: { stage: "review_approved", ownerUserId: "u1", reviewContactStatus: status } }, sam).markReadyToEfile.allowed;
  assert.equal(listRow("completed"), true);
  assert.equal(listRow("pending"), false);
  const waiting = at("review_approved", [{ status: "approved", clientContactStatus: "pending" }]).markReadyToEfile;
  assert.equal(waiting.allowed, false);
  assert.equal(waiting.reason, "The reviewer still needs to record the conversation with the client.");
  assert.equal(at("screening").closeCase.allowed, true);
  for (const stage of ["review_approved", "ready_to_efile", "efiled"]) assert.equal(at(stage).closeCase.allowed, false, stage);
  const alex = { id: "p-alex", name: "Alex", capabilities: ["prepare"] };
  assert.equal(adminEligibility({ caseRecord: { stage: "review_approved", reviews: called } }, alex).markReadyToEfile.allowed, false);
  assert.equal(adminEligibility({ caseRecord: { stage: "ready_to_efile" } }, alex).markEfiled.allowed, false);
});

test("the admin page: the intake form at screening, the marks at their stages", () => {
  // renderAdminCase(record, ui) with person Sam (follow the file's existing renderAdminCase tests)
  // at received: no data-case-action="VERIFY_INTAKE", and the text "Screening starts when an admin opens the case."
  // at screening: the VERIFY_INTAKE form
  // at review_approved: a button data-action="open-mark-ready-to-efile" reading "Mark ready to e-file…"
  // at ready_to_efile: a button data-action="open-mark-efiled" reading "Mark e-filed…"
  // at review_approved with the call still pending: no open-mark-ready-to-efile, and the sentence
  //   "The reviewer still needs to record the conversation with the client."
});

test("a volunteer's case page never offers the e-file marks", () => {
  // the volunteer page (renderStaffCase or the file's equivalent) as Alex and as Morgan,
  // at review_approved (call completed) and at ready_to_efile:
  // no "open-mark-ready-to-efile", no "open-mark-efiled", no "MARK_" anywhere in the HTML
});

test("the e-file dialogs name the client and the application", () => {
  const state = { busy: false, savedCase: { reference: "VT-AAAA-BBBB", answers: { tp_first_name: "Mei", tp_last_name: "Chen" } } };
  const ready = markReadyToEfileDialogBody(state);
  assert.match(ready, /Mei Chen/);
  assert.match(ready, /VT-AAAA-BBBB/);
  assert.match(ready, /data-case-action="MARK_READY_TO_EFILE"/);
  assert.match(ready, /name="confirmed" value="true" required/);
  const filed = markEfiledDialogBody(state);
  assert.match(filed, /data-case-action="MARK_EFILED"/);
  assert.match(filed, /told their return was e-filed/);
  assert.match(markEfiledDialogBody({ savedCase: { reference: "VT-X", answers: {} } }), /this client/);
  // Keeping it as it is sends nothing: the keep control is confirmBody's close
  // control and carries no case action.
  for (const html of [ready, filed]) {
    assert.match(html, /Keep it as it is/);
    assert.equal((html.match(/data-case-action=/g) ?? []).length, 1, "only the confirm button sends");
  }
});
```

Fill in the two commented tests with real assertions, using the file's existing `renderAdminCase` setup and the volunteer page's renderer (read `tests/staff-views.test.mjs` for it).

`tests/staff-views.test.mjs`:
- **The lifecycle bar:** for `ready_to_efile`, every step before it is done, and the bar names "Ready to e-file" and "E-filed". For `corrections_required`, the "Filing in progress (preparing)" step reads "Corrections in progress".
- **The new `STAGE_WORK` sentences** (exact):

  | Stage | Sentence |
  |---|---|
  | `screening` | "The office is screening this application." |
  | `received` | "The office starts screening when an admin opens the case." |
  | `ready_to_efile` | "The office e-files the return." |
  | `efiled` | "The return is e-filed. Nothing more is needed here." |
  | `review_approved` | "The reviewer records the conversation with the client; the office records the client's signature." |

- **`EVENT_SENTENCES`:** `START_SCREENING: "started screening"`, `MARK_READY_TO_EFILE: "recorded the client's Form 8879 signature"`, `MARK_EFILED: "recorded that the return was e-filed"`.

**The confirm-dialog golden test:**
- `tests/confirm-dialogs.test.mjs` has a hard-coded render map and asserts that `GOLDEN` and `STATES` have the same keys. Import both new bodies and add them to the map.
- `tests/confirm-dialogs.states.mjs`: add the two dialogs' states (Mei Chen's case, and a nameless case for "this client").
- `tests/fixtures/confirm-dialogs.json` has no capture script (its header says the golden was captured before the `confirmBody` move). Add the two entries **by hand**, from the rendered output of the new bodies, after reading that output for the exact lead, note, checkbox and buttons. Check that the diff only adds those two entries.

`tests/shell.test.mjs` pins:
- `case "open-mark-ready-to-efile":` and `case "open-mark-efiled":` in app.mjs, each opening its dialog;
- `if (type === "MARK_READY_TO_EFILE" && receipt) closeDialog("#case-title")`, and the same for `MARK_EFILED`;
- `STAFF_NOTICES` gains `MARK_READY_TO_EFILE: "Marked ready to e-file. The client was told."` and `MARK_EFILED: "Marked e-filed. The client was told."`.

- [ ] **Step 2: Run them to see them fail**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/admin-views.test.mjs tests/staff-views.test.mjs tests/confirm-dialogs.test.mjs tests/shell.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/admin-views.mjs`:
- `CLOSABLE_STAGES` adds `"screening"`.
- `closeCase`: today's `if (stage === "review_approved") return refused("An approved case is not closed from here.")` covers `ready_to_efile` and `efiled` too (`["review_approved", "ready_to_efile", "efiled"].includes(stage)`), with the same sentence. Assert it in the eligibility test.
- `verifyIntake`: `if (stage !== "screening") return refused(stage === "received" ? "Screening starts when an admin opens the case." : record.intakeVerified ? "The simulated intake checks are already recorded." : "The intake checks are recorded during screening, before preparation.");`
- New decisions:

  ```js
    const markReadyToEfile = () => {
      const stopped = gate("admin");
      if (stopped) return stopped;
      if (stage !== "review_approved") return refused("This is recorded once the reviewer has approved the return.");
      // The reviewer's call with the client comes first (brainstorm Q12), as the database checks.
      // A full case carries its reviews; a list row carries only reviewContactStatus (Task 5).
      const call =
        record.reviewContactStatus ??
        (record.reviews ?? []).findLast((review) => review?.status === "approved")?.clientContactStatus;
      return call === "completed"
        ? allowed
        : refused("The reviewer still needs to record the conversation with the client.");
    };
    const markEfiled = () => {
      const stopped = gate("admin");
      if (stopped) return stopped;
      return stage === "ready_to_efile" ? allowed : refused("This is recorded once the client has signed Form 8879.");
    };
  ```

  Both go in the returned object.
- `intakeChecksPanel`: unchanged, except it shows `explain(rights.verifyIntake)` at `received`, which now carries the screening sentence.
- `officeActionsPanel`: before the Close row, when `rights.markReadyToEfile.allowed`:

  ```js
  button(`${icon("check")} Mark ready to e-file…`, "open-mark-ready-to-efile", "primary", busy)
  ```

  When `rights.markEfiled.allowed`:

  ```js
  button(`${icon("check")} Mark e-filed…`, "open-mark-efiled", "primary", busy)
  ```

  Follow that panel's row markup.
- The dialog bodies (model: `closeCaseDialogBody`):

  ```js
  const clientName = (record) =>
    [record?.answers?.tp_first_name, record?.answers?.tp_last_name].map((part) => String(part ?? "").trim()).filter(Boolean).join(" ") || "this client";

  export function markReadyToEfileDialogBody(state = {}) {
    const record = state.savedCase ?? {};
    return confirmBody({
      lead: `Mark <strong>${esc(record.reference ?? "this case")}</strong> for <strong>${esc(clientName(record))}</strong> as ready to e-file?`,
      note: { icon: "shield", html: "The client will be told PCDC recorded that they signed Form 8879. This can't be undone." },
      form: {
        fields: `<label class="checkbox-row" for="${fieldId("confirmed", "ready-efile")}"><input type="checkbox" id="${fieldId("confirmed", "ready-efile")}" name="confirmed" value="true" required><span>The client signed Form 8879.</span></label>`,
      },
      confirm: caseSubmit(`${icon("check")} Mark ready to e-file`, "MARK_READY_TO_EFILE", "primary full", state.busy ? "disabled" : ""),
      keep: "Keep it as it is",
    });
  }

  export function markEfiledDialogBody(state = {}) {
    const record = state.savedCase ?? {};
    return confirmBody({
      lead: `Mark <strong>${esc(record.reference ?? "this case")}</strong> for <strong>${esc(clientName(record))}</strong> as e-filed?`,
      note: { icon: "shield", html: "The client will be told their return was e-filed. This can't be undone." },
      form: {
        fields: `<label class="checkbox-row" for="${fieldId("confirmed", "efiled")}"><input type="checkbox" id="${fieldId("confirmed", "efiled")}" name="confirmed" value="true" required><span>The return was e-filed.</span></label>`,
      },
      confirm: caseSubmit(`${icon("check")} Mark e-filed`, "MARK_EFILED", "primary full", state.busy ? "disabled" : ""),
      keep: "Keep it as it is",
    });
  }
  ```

  Check `confirmBody`'s `form`/`fields` shape against `closeCaseDialogBody`; it may need `attrs`.

`src/views.mjs` `dialog()`:

```js
  if (state.dialog === "mark-ready-to-efile") { title = "Mark ready to e-file?"; body = markReadyToEfileDialogBody(state); }
  if (state.dialog === "mark-efiled") { title = "Mark e-filed?"; body = markEfiledDialogBody(state); }
```

Import both. Neither is in `OWN_ERROR_DIALOGS`, so `dialogError` shows their errors.

`src/staff-views.mjs`:
- `STAGE_WORK` gains or changes the sentences above, with `needs: null` for the office's stages.
- `LIFECYCLE` is `["received","screening","preparation_ready","preparing","review_ready","reviewing","review_approved","ready_to_efile","efiled","closed"]`: `draft` leaves the bar (today's list starts with it), and the existing lifecycle tests that pin `draft` are updated. `lifecycleBar` is otherwise unchanged; check what it draws for a `draft` case once `draft` is in no step, and keep today's behaviour for it (say what that is in the report).
- `EVENT_SENTENCES` gains the three entries.

`src/app.mjs`:
- in `runNavigation`, `case "open-mark-ready-to-efile": openDialog("mark-ready-to-efile"); break;` and `case "open-mark-efiled": openDialog("mark-efiled"); break;` (Task 5 adds the queue's case selection);
- in `runCaseAction`, `if (type === "MARK_READY_TO_EFILE" && receipt) closeDialog("#case-title");` and the same for `MARK_EFILED`;
- `STAFF_NOTICES` gains the two entries.

- [ ] **Step 4: Run the tests**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
Expected: PASS. Update tests that pinned the old `LIFECYCLE`, `STAGE_WORK` or `verifyIntake` sentences on purpose, and list them.

- [ ] **Step 5: Commit**

```bash
git add src/admin-views.mjs src/staff-views.mjs src/views.mjs src/app.mjs tests/admin-views.test.mjs tests/staff-views.test.mjs tests/confirm-dialogs.test.mjs tests/confirm-dialogs.states.mjs tests/fixtures/confirm-dialogs.json tests/shell.test.mjs
git commit -F <scratchpad>/commit-task4.txt
```

Message: "The case pages: intake checks during screening, and the e-file marks behind their confirmations", then the trailer.

---

### Task 5: The lists

**Files:**
- Modify:
  - `src/supabase-store.mjs` (`listCases` ~:389–440: a sixth list summary, `reviewContactStatus`);
  - `src/contracts.mjs` (the list-entry comment ~:91–96 names the new summary);
  - `src/office-views.mjs` (`QUEUE_KINDS` :70, `KIND_ICONS` :78, `followupQueue` :92, `needed` and `rowAction` ~:150–195);
  - `src/styles.css` (the `.kind-pill.<kind>` rules, ~:3354–3385);
  - `src/pool-views.mjs` (`POOL_TABS` :6, `POOL_STAGES` :16, `poolPhase` :28);
  - `src/app.mjs` (the two `open-mark-…` cases select the queue's case in place);
  - `src/staff-views.mjs` (only if a board test needs it).
- Test: `tests/office-views.test.mjs`, `tests/pool-views.test.mjs`, `tests/staff-views.test.mjs`, `tests/shell.test.mjs`

**Interfaces:**
- Consumes: `adminEligibility(...).markReadyToEfile/.markEfiled` (which already reads `record.reviewContactStatus` on a list row), the `open-mark-…` actions and dialogs (Task 4).
- Produces:
  - a presenter list row's `reviewContactStatus`: the latest approved review's `client_contact_status` (`"pending"`, `"completed"`, or `null` when the case has no approved review);
  - queue kinds `"screening"`, `"signing"`, `"efiling"`; pool phases `"signing"`, `"filing"`.

- [ ] **Step 1: Tests first**

`tests/store.test.mjs`, beside "a presenter list carries the summaries a work board reads" (~:536):
- that test's key list gains `"reviewContactStatus"` ("exactly six summary fields"), and its grouped-read count and columns gain one read of `reviews` (`case_id,client_contact_status,created_at`, `status = 'approved'`, scoped to the listed case ids);
- a new test: with two approved reviews for one case (the older `pending`, the newer `completed`), the row's `reviewContactStatus` is `"completed"`; a case with no approved review gets `null`. Add the `reviews` rows to that file's `fakeClient` the way its other tables are seeded;
- the applicant list still reads no staff table (the existing `STAFF_ONLY_TABLES` check, ~:530, already covers `reviews` if it's in that list; add it if it isn't).

`tests/database-store.mjs` (run by the controller in the database suite), beside the presenter `listCases` checks (~:114–136): a fresh case's row has `reviewContactStatus: null`; `f.approvedCase({ called: false })` gives `"pending"`, and `f.approvedCase()` gives `"completed"` (Task 1's helper).

`tests/office-views.test.mjs`. **Follow-ups renders list rows**, which have no `reviews`, so these rows carry `reviewContactStatus` like a real list:

```js
test("Follow-ups shows new applications, screening, signing and e-filing", () => {
  const sam = { id: "p-sam", name: "Sam", capabilities: ["admin", "followup"] };
  const rec = (id, stage, reviewContactStatus = "completed") => ({ id, reference: `VT-${id}`, stage, ownerUserId: "u", reviewContactStatus, updatedAt: "2026-10-18T10:00:00Z" });
  const rows = followupQueue([rec("A", "received"), rec("B", "screening"), rec("C", "review_approved"), rec("D", "ready_to_efile"), rec("E", "efiled")], [], Date.parse("2026-10-18T12:00:00Z"));
  const kinds = Object.fromEntries(rows.map((row) => [row.record.id, row.kind]));
  assert.deepEqual(kinds, { A: "intake", B: "screening", C: "signing", D: "efiling" });
  const html = renderFollowups([rec("A", "received"), rec("B", "screening"), rec("C", "review_approved"), rec("D", "ready_to_efile")], [], { person: sam, filters: {}, busy: false, now: Date.parse("2026-10-18T12:00:00Z") });
  assert.match(html, /New application: open it to start screening\./);
  assert.match(html, /Finish screening\./);
  assert.match(html, /Waiting for the client to sign Form 8879\./);
  assert.match(html, /data-action="open-mark-ready-to-efile"[^>]*data-case-id="C"|data-case-id="C"[^>]*data-action="open-mark-ready-to-efile"/);
  assert.match(html, /data-action="open-mark-efiled"[^>]*data-case-id="D"|data-case-id="D"[^>]*data-action="open-mark-efiled"/);
  // The reviewer hasn't recorded the call yet: the row explains instead of offering the mark.
  const waiting = renderFollowups([rec("F", "review_approved", "pending")], [], { person: sam, filters: {}, busy: false, now: Date.parse("2026-10-18T12:00:00Z") });
  assert.doesNotMatch(waiting, /open-mark-ready-to-efile/);
  assert.match(waiting, /The reviewer still needs to record the conversation with the client\./);
  // …and the description says what the row is waiting for.
  assert.match(waiting, /Waiting for the reviewer&#39;s call with the client\./); // esc() writes ' as &#39;
  assert.doesNotMatch(waiting, /Waiting for the client to sign Form 8879\./);
  // The new kinds have their own icon and pill class.
  for (const kind of ["screening", "signing", "efiling"]) assert.match(html, new RegExp(`kind-pill ${kind}`));
});
```

Read `button()`'s attribute order and pin the exact one rather than the alternation.

`tests/pool-views.test.mjs`:

```js
test("the pool's phases cover every stage", () => {
  const expect = { draft: "intake", received: "intake", screening: "intake", review_approved: "signing", ready_to_efile: "filing", efiled: "filing", closed: "closed" };
  for (const [stage, phase] of Object.entries(expect)) assert.equal(poolPhase({ stage }), phase, stage);
  assert.equal(poolPhase({ stage: "preparation_ready", preparerId: null }), "available");
  assert.deepEqual(POOL_STAGES, STAGES);
  // POOL_TABS lists all, intake, available, preparation, review, signing ("Waiting on client"), filing ("Filing"), closed; no "done"
});
```

Fill in the last comment with an exact `deepEqual` against `POOL_TABS`'s shape.

`tests/staff-views.test.mjs`: the board's tabs are unchanged, and its search finds a case at `efiled`.

`tests/shell.test.mjs`: each `open-mark-…` case reads `target.dataset.caseId` and, when it is set, awaits `controller.selectCase(caseId, { navigate: false })` before opening the dialog. Pin it the way `open-log-call` is pinned.

- [ ] **Step 2: Run them to see them fail**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/office-views.test.mjs tests/pool-views.test.mjs tests/staff-views.test.mjs tests/shell.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/supabase-store.mjs`, in `listCases`, after the `contacts` read:

```js
      // The reviewer's call with the client, for Follow-ups' Mark ready to
      // e-file (brainstorm Q12): the latest approved review's status alone.
      const approvals = await read(
        client
          .from("reviews")
          .select("case_id,client_contact_status,created_at")
          .in("case_id", ids)
          .eq("status", "approved")
          .order("created_at"),
      );
```

and in the returned row, `reviewContactStatus: forCase(approvals, record.id).at(-1)?.client_contact_status ?? null,`. Update the list-entry comment in `src/contracts.mjs` to name it.

`src/office-views.mjs`:
- **`QUEUE_KINDS`** gains `["screening", "Screening"]`, `["signing", "Signing"]` and `["efiling", "E-filing"]`, after `intake`. Keep its tuple shape; `intake` keeps "Intake checks". The three add filter chips.
- **`KIND_ICONS`** gains `screening: "clock"`, `signing: "file"`, `efiling: "check"`. Check each icon name exists in `src/ui.mjs`' icon set; if one doesn't, use the nearest existing one and say so.
- **`src/styles.css`:** `.kind-pill.screening` copies `.kind-pill.intake`'s colours, and `.kind-pill.signing` and `.kind-pill.efiling` copy `.kind-pill.unclaimed`'s.
- **`followupQueue`:**
  - the `received` row keeps `kind: "intake"`, without the `intakeVerified` test;
  - add `else if (record?.stage === "screening") rows.push({ kind: "screening", … })`;
  - `review_approved` gives `kind: "signing"`, and `ready_to_efile` gives `kind: "efiling"`.
- **`needed`:**

  | Row | Sentence |
  |---|---|
  | intake (not a draft) | "New application: open it to start screening." |
  | screening | "Finish screening." |
  | signing, call recorded | "Waiting for the client to sign Form 8879." |
  | signing, call still pending | "Waiting for the reviewer's call with the client." |
  | efiling | "Ready to e-file." |

- **`rowAction`:**
  - intake keeps `open-case`, with the label "Open" for a sent application ("Finish and send" for an office draft);
  - screening is `open-case` "Open";
  - signing is `button(`${icon("check")} Mark ready to e-file…`, "open-mark-ready-to-efile", "primary", `data-case-id="${id}" ${busy}`)` when `adminEligibility({ caseRecord: record }, person).markReadyToEfile.allowed`, else `explain(...)` of that decision, so a case whose reviewer hasn't recorded the call shows "The reviewer still needs to record the conversation with the client.". `needed` reads the same list summary: `row.record.reviewContactStatus === "completed"` gives the signing sentence, and anything else (`"pending"`, or `null`) gives the call-pending one. Follow-ups rows are list rows, so `needed` never reads `reviews`;
  - efiling is the same with `open-mark-efiled` and `markEfiled`.
- Keep the existing check that an intake row carries no `data-case-action`.

`src/pool-views.mjs`:
- `POOL_TABS` drops `done` and adds `["signing", "Waiting on client"]` and `["filing", "Filing"]` before `closed`. Keep the file's tuple shape.
- `POOL_STAGES = STAGES` (imported from contracts).
- `poolPhase`:

  ```js
  if (["draft", "received", "screening"].includes(stage)) return "intake";
  if (stage === "review_approved") return "signing";
  if (stage === "ready_to_efile" || stage === "efiled") return "filing";
  if (stage === "closed") return "closed";
  return phaseTab(record);
  ```

`src/app.mjs`, each `open-mark-…` case:

```js
      case "open-mark-ready-to-efile":
      case "open-mark-efiled": {
        const opener = describeFocus(target);
        const caseId = target.dataset.caseId;
        const name = target.dataset.action === "open-mark-efiled" ? "mark-efiled" : "mark-ready-to-efile";
        if (caseId) {
          controller.dismissError();
          await controller.selectCase(caseId, { navigate: false });
          if (controller.getState().savedCase?.id !== caseId) break;
        }
        openDialog(name, null, opener);
        break;
      }
```

This replaces Task 4's two one-line cases. After a confirm from the queue, `closeDialog("#case-title")` may not find that heading on Follow-ups. Use `closeDialog()` with the opener (read `closeDialog`'s fallback), and say in the report which you used.

- [ ] **Step 4: Run the tests**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
Expected: PASS. Update the pool and queue tests that pinned the old tabs, `done` or the "Record intake checks" label on purpose, and list them.

- [ ] **Step 5: Commit**

```bash
git add src/supabase-store.mjs src/contracts.mjs tests/store.test.mjs tests/database-store.mjs src/office-views.mjs src/styles.css src/pool-views.mjs src/app.mjs tests/office-views.test.mjs tests/pool-views.test.mjs tests/staff-views.test.mjs tests/shell.test.mjs
git commit -F <scratchpad>/commit-task5.txt
```

Message: "Follow-ups and the case pool show screening, signing and e-filing", then the trailer.

---

### Task 6: The client's page

**Files:**
- Modify: `src/client-views.mjs` (`PROGRESS_STEPS` :287, `REVIEW_STAGES` :294, `progressTrack` :301; the badges already moved to the client label in Task 2), `src/client-text.mjs` (`progress.step.*` :225–231), `src/zh-hant.mjs`
- Test: `tests/client-views.test.mjs`

**Interfaces:**
- Consumes: `describeStage(...).clientLabel` and `stageBadge(stage, lang, { audience: "client" })` (Task 2).

- [ ] **Step 1: Tests first**

```js
test("the client's progress has five steps", () => {
  assert.deepEqual(PROGRESS_STEPS.map(([key, stages]) => [key, stages]), [
    ["progress.step.intake", ["draft", "received", "screening"]],
    ["progress.step.preparation", ["preparation_ready", "preparing", "corrections_required"]],
    ["progress.step.review", ["review_ready", "reviewing"]],
    ["progress.step.signing", ["review_approved"]],
    ["progress.step.filing", ["ready_to_efile", "efiled"]],
  ]);
  assert.equal(t("progress.step.signing", {}, "zh-Hans"), "签名");
  assert.equal(t("progress.step.filing", {}, "zh-Hans"), "递交");
});

test("at Ready to exit, intake to review are done and signing is current", () => {
  // progressScreen(state with savedCase.stage "review_approved", lang "en"): three "complete" steps, "Signing" "in progress", "Filing" "not started"
});

test("the client sees their own label, never the staff name", () => {
  // applicationsScreen with one case at "screening" in zh-Hans: contains 审核中, not "Screening in progress"
  // progressScreen at "review_approved" in en: contains "Ready to sign" and the Ready to exit message, not "Ready to exit"
  // at "efiled": the status panel shows "Your return was e-filed. The IRS will confirm whether it is accepted."
});

test("a closed case shows its closed notice, not a step", () => {
  // progressScreen at "closed", in en and zh-Hans: no class="progress-steps" (or no "current" step),
  // the badge reads Closed / 已关闭, and the status panel shows stage.closed.client's text
});

test("the history shows the new lines in 简体", () => {
  // progressScreen in zh-Hans with record.history holding the three new English lines:
  // it shows PCDC 已开始审核您的申请。我们可能会致电您。, PCDC 已记录您签署了 8879 表。您的报税表可以电子递交了。
  // and PCDC 已电子递交您的报税表。, and an older line (Submit's "Application received. …") keeps its translation
});
```

- Fill in the commented tests with real `assert`s, using the file's existing state builders (`baseState`, `v2State`).
- `PROGRESS_STEPS` must be exported if it isn't; export it.
- Note the stepper at Ready to exit: Intake, Preparation and Review are done, and Signing is current.

- [ ] **Step 2: Run them to see them fail**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/client-views.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**
- **`PROGRESS_STEPS`** as in the test.
- **`REVIEW_STAGES`** adds `"ready_to_efile"` and `"efiled"`.
- **`progressTrack`:** `closed` is in no step. For a closed case it returns `""`, so the status panel shows the badge and the closed message alone:

  ```js
  function progressTrack(stage, lang = "en") {
    const current = PROGRESS_STEPS.findIndex(([, stages]) => stages.includes(stage));
    // A closed case has no current step: its notice says what happened instead.
    if (current < 0) return "";
    // …today's body, unchanged
  }
  ```

- **Check** that no client screen still reads `describeStage(...).label` (Task 2 moved the three badges): `grep -n "describeStage\|stageBadge" src/client-views.mjs src/intake-views.mjs`.
- **`src/client-text.mjs`:** add `"progress.step.signing": { en: "Signing", zh: "签名" }` and `"progress.step.filing": { en: "Filing", zh: "递交" }`. Remove `progress.step.next` if nothing reads it (search first).
- Run `npm run build:hant`.

- [ ] **Step 4: Run the tests**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
Then: `npm run build:hant -- --check`.
Expected: PASS, and clean. The language sweep may need the two new keys; add them where it expects.

- [ ] **Step 5: Commit**

```bash
git add src/client-views.mjs src/client-text.mjs src/zh-hant.mjs tests/client-views.test.mjs <sweep files if changed>
git commit -F <scratchpad>/commit-task6.txt
```

Message: "The client's page: five steps, their own labels, and the signing and filing messages", then the trailer.

---

### Task 7: The diagram and the docs

**Files:**
- Modify: `docs/media/return-lifecycle.svg`, `docs/developer/database.md` (:291–320 the state diagram and prose, :338–378 the action catalogue and payloads, :554–575 the recipe), `docs/developer/frontend.md`, `docs/developer/README.md` and `docs/setup.md` (the migration tables, and the unit count)

- [ ] **Step 1: The diagram**

In `docs/media/return-lifecycle.svg`:
- **A new box.** Add "Screening in progress" between "Request sent" and "Pending intake / filing":
  - in the main column, as an intake-coloured box, like Request sent;
  - with the arrow from Request sent labelled "Opened by an admin";
  - moving the boxes below it down as needed;
  - keeping the viewBox consistent, or growing its height.
- **Two renames:** "Filing in process (preparing)" becomes "Filing in progress (preparing)", and "Review in process" becomes "Review in progress".
- Run `node --check` on nothing here; the controller renders it to check.

- [ ] **Step 2: The docs**
- **`docs/developer/database.md`:**
  - the state diagram gains `received --> screening: START_SCREENING`, `screening --> preparation_ready: VERIFY_INTAKE`, `draft --> screening: SUBMIT (office)`, `review_approved --> ready_to_efile: MARK_READY_TO_EFILE` and `ready_to_efile --> efiled: MARK_EFILED`, with `screening --> closed: CLOSE_CASE`;
  - the prose no longer calls `review_approved` the end;
  - the action catalogue and payload table gain the three actions;
  - the recipe's "current definition" migration numbers become 018 (`check_operation_authority`), 017 (`check_payload`, `vitally_apply_action`) and 032 where it redefines them;
  - the catalogue row for `MARK_READY_TO_EFILE` says it waits for the reviewer's recorded call with the client;
  - the migration table (~:61) gains a `032_screening_and_efiling_stages.sql` row: "Hand-written: the `screening`, `ready_to_efile` and `efiled` stages, `START_SCREENING`, `MARK_READY_TO_EFILE` and `MARK_EFILED`, `VERIFY_INTAKE` from `screening`, an office submit landing in `screening`, and `CLOSE_CASE` from `screening`".
- **`docs/setup.md`:** the same row in its migration table (~:349), and "migration 031 applied" (~:410) becomes 032.
- **`docs/developer/frontend.md`:** stages and their client labels (`describeStage(...).clientLabel`, `stageBadge`'s `audience`), and the start on open (`startScreeningIfDue`).
- **The unit count:** set it where the docs give it, from `npm test`. The database suite's count (`database.md` ~:625, "272 tests") is the controller's to update after `npm run test:database`; leave it.

- [ ] **Step 3: Commit**

```bash
git add docs/media/return-lifecycle.svg docs/developer/database.md docs/developer/frontend.md docs/developer/README.md docs/setup.md
git commit -F <scratchpad>/commit-task7.txt
```

Message: "Docs: the lifecycle diagram's screening box and wording, and the new stages and actions", then the trailer.

---

### Task 8: The story and the checks

**Files:**
- Modify: `tests/browser.mjs` (the client case's intake ~958–990; the office case ~3228–3310; the client-side `received` checks ~5241–5527; badge texts across the file)

- [ ] **Step 1: The story**
- **The client case (~958–990):**
  - after `openCaseByReference(staff, classReference)`, wait for the case to be at `screening` (`caseById(fixture, …).stage`), and for the client window to show "Being reviewed" (`waitForBadge(client, "Being reviewed")`);
  - the client's history shows "PCDC started reviewing your application. We may call you.";
  - then tick the four intake checks and `VERIFY_INTAKE` as today;
  - `waitForBadge(client, …)` texts follow the client labels: "Waiting for a volunteer", not "Waiting for preparation".
- **A second admin window:** open the same case in a second presenter window (the file has a two-presenter-window phase; reuse its helpers) and assert no `.problem-banner` and no `#dialog-error` appear.
- **In place is not an open:** before Sam opens a fresh Request sent case's page, log a contact on it from its Follow-ups row (if the story has such a row; otherwise skip this and say so), and assert it is still at `received`.
- **The office case (~3240):** `stage` is `"screening"` right after Submit. The pool's Intake tab still shows it. The rest is unchanged.
- **A new phase, "the office records signing and e-filing":** on the story's approved case, after its reviewer's RECORD_REVIEW_CONTACT has completed the call. Not the `review_approved` sample: its call is still pending, so it shows "The reviewer still needs to record the conversation with the client." instead (assert that once, on its Follow-ups row):
  1. as Sam, open Follow-ups, find its signing row, and press **Mark ready to e-file…**;
  2. assert the dialog names the client and the reference, tick the box, and confirm; the stage becomes `ready_to_efile`;
  3. open the case, press **Mark e-filed…**, tick and confirm; the stage becomes `efiled`;
  4. the client's page shows the "Filing" step current, the badge "E-filed", the message "Your return was e-filed…", and the two history lines;
  5. once more in 简体: 已电子递交 and "PCDC 已电子递交您的报税表。".
- **Old names:** every badge or stage-label text that names an old name ("Received", "Waiting for preparation" on a badge, "In preparation", "In review", "Review complete") follows the new staff or client names. Search the file for each, and list every change in the report.
- **Checks:** `node --check tests/browser.mjs` and `node --check tests/support/story-pages.mjs` if changed.

- [ ] **Step 2: Checks**

Run, each on its own:
- `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
- `npm run build:hant -- --check`
- `npm run build:intake` (expected: "the newest catalogue migration already records this catalogue")
- `npx openspec validate --all`

Then commit:

```bash
git add tests/browser.mjs <tests/support/story-pages.mjs if changed>
git commit -F <scratchpad>/commit-task8.txt
```

Message: "Story: screening on open, a second admin window, and the office records signing and e-filing", then the trailer.

- [ ] **Step 3 (controller): the story**

`npm run test:browser`, in the background.

## Self-review

- **Spec coverage:**
  - "A case moves through the main chain of stages": Task 1 (database, every move and refusal), Task 2 (`STAGES`, actions).
  - "Screening starts when an admin first opens a case": Task 3 (open, reload through `load()`, persona switch, reconnect through `onConnection`, in-place selection not an open, races, give-up), and Task 8 (open, second window, in place).
  - "Admins record signing and e-filing, with a confirmation": Task 1 (`confirmed`, the reviewer's call first), Task 4 (dialogs, keep sends nothing, case page, no marks for volunteers), Task 5 (Follow-ups, the call-pending sentence), Task 8.
  - "Staff and clients each see their own stage names": Task 2 (labels, the client badges), Task 6 (stepper, closed notice).
  - "The lists and the case page show every stage": Tasks 4 and 5.
  - "Clients are told at each new step": Task 1 (history lines), Task 2 (messages, `SENTENCES`, no phone number in messages, labels or the new lines), Task 6 (panel, 简体 history with an older line kept), Task 8.
- **Types:**
  - `describeStage → { label, clientLabel, clientMessage }` and `stageBadge(stage, lang, { audience })` (Task 2) are read by Tasks 4–6.
  - `adminEligibility.markReadyToEfile/.markEfiled` and the `open-mark-…` actions (Task 4) are read by Task 5.
  - The dialog names `mark-ready-to-efile`/`mark-efiled` (Task 4) are used by Task 5's handler.
  - The call-pending sentence "The reviewer still needs to record the conversation with the client." is the same in the spec, Task 4's `markReadyToEfile` and Task 5's row; the call-pending row description "Waiting for the reviewer's call with the client." is the same in the spec, the design and Task 5.
  - `reviewContactStatus` (Task 5's list summary) is what Task 4's `markReadyToEfile` reads on a list row; a full case reads `reviews`. Task 5's Follow-ups test uses list-shaped rows, so it would fail if the store didn't carry it.
- **Rechecked again (2026-10-18):** Follow-ups' list rows had no reviews, so Mark ready to e-file could never show there (the list summary `reviewContactStatus` fixes it); a race that leaves the case at Request sent tries once more; `CASE_ACTIONS`' full-list test; closing refused at the new stages with today's "approved" sentence; `submittedCase` reused.
- **Rechecked (Sonnet review, 2026-10-18):** no `begin;`/`commit;` in 032; the reload trigger; the page check (`state.screen === "staff-case"`); the held action resent unchanged; client badges moved with `clientLabel` in Task 2; the real database fixture API; the hard-coded revisions and the office-submit assertions listed; the golden test's render map; the Follow-ups icons and pills; the closed notice; migration-table rows in the docs.
- **Placeholders:** some test steps leave the exact assertions to the implementer, against named existing helpers (the database builders, `renderAdminCase` and `progressScreen` setups). Each says what to assert, and the report must list what was written.
