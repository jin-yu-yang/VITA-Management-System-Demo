# Replace Simulated Screening Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `VERIFY_INTAKE` records PCDC's real screening checks: phone, documents and in_scope on every case, plus identity for an online client. "Simulated" goes from the panel, the toast, the staff history sentence and the client's new history line.

**Architecture:**
- One list, `screeningCheckKeys(service)`, drives what the panel shows and what the builder sends (D1).
- The database checks the key set in `check_payload` and the identity-iff-online rule in `act_verify_intake` (D2).
- `fixture_history` reseeds the samples in the new shape (D5). Old events keep their stored detail and sentence.

**Tech Stack:** PostgreSQL/Supabase plpgsql (hand-written migrations), plain ES modules, `node:test`, Playwright (`tests/browser.mjs`).

**Spec:** `openspec/changes/replace-simulated-screening-checks/`. Read `design.md` (D1–D6) and `specs/case-lifecycle/spec.md` with this plan. `brainstorm.md` holds the agreed design and the code findings.

## Global Constraints

- **Gate:** met. Hailey approved the client sentence (design D4) as drafted on 2026-10-20.
- **Migration:**
  - One new file, `supabase/migrations/034_screening_checks.sql`, one after the newest migration, with no gaps (renumber per tasks 1.2).
  - Never edit 001–033.
  - Every statement can be applied again (`create or replace`).
- **Copied functions:** each is copied verbatim from its newest definition, with changed lines marked `-- 034`:
  - `check_payload` from 033;
  - `act_verify_intake` from 032;
  - `fixture_history` from 023.

  `vitally_apply_action` and `check_operation_authority` are not redefined.
- **Check keys:** exactly `phone`, `documents`, `in_scope`, and `identity` only when `answers.service === "online"`.
- **Check labels (exact):**
  - `phone`: The client can be reached at the phone number on the application.
  - `documents`: The basic documents are present (photo ID, Social Security or ITIN cards, the income documents on the list).
  - `in_scope`: The return is within VITA scope.
  - `identity`: Identity confirmed: the client's face matches their photo ID (in person or on video), checked by a certified volunteer.
- **Fixed strings:**
  - title "Screening checks";
  - button "Record the screening checks";
  - hint and builder refusal "Tick every check before recording them.";
  - toast "The screening checks are recorded.";
  - eligibility refusal "The screening checks are already recorded.";
  - staff history sentence "recorded the screening checks".
- **Client line (D4, pending Hailey):**
  - English: "PCDC finished screening your application. A volunteer will start preparing your return next."
  - 简体: "PCDC 已完成对您申请的审核。接下来会有志愿者开始准备您的报税表。"
  - The old sentence and its 简体 stay in the translation table.
- **Wording:** no "simulated" in the panel, the toast, the staff history sentence or the new client line. The presenter panel's general note is out of scope.
- **Data:** fictional data only.
- **Commits:** end each commit message with the Co-Authored-By trailer for your model.
- **Checks to run:**
  - `npm test`;
  - `npm run db:migrate:test` then `npm run test:database`;
  - `npm run test:browser`;
  - `npm run build:hant -- --check`;
  - `npx openspec validate --all`, and `npm run build:intake` leaves nothing to commit.

## Review Focus

1. **A case with no `service` answer, or an unknown one** gets the three checks in the panel, the builder and the database. It is never asked for identity, and identity sent for it is refused. Tests: Task 2 `identity refused without online service`; Task 4 `screeningCheckKeys: unknown service`.
2. **A stale tick from a hidden check:** an `identity` box ticked earlier must not be sent for a non-online case. Test: Task 4 `drops identity unless online`.
3. **Old events still render**, staff and client, in all three languages. Tests: Task 5 `old VERIFY_INTAKE event renders`; Task 6 `old simulated line keeps its 简体`.
4. **A replayed old payload** (a stale tab sending `interview`/`consent`) is refused with nothing changed. Test: Task 2 `old four-key payload refused`.
5. **The online sample's checks include identity, and the others' don't.** Test: Task 3 `fixture checks by service`.

---

### Task 1: Gate

**Files:** none, except this change's artifacts if D4 changes.

- [x] **Step 1:** Confirm Hailey approved D4's sentence (tasks 1.1). If she changed it, update design D4, `specs/case-lifecycle/spec.md` and Global Constraints first.
- [x] **Step 2:** Run `ls supabase/migrations | tail -1`. The new file is that number plus one; it is 034 if the last is 033. For each function in design D6, run `grep -l "function [a-z_.]*\b<name>(" supabase/migrations/*.sql | tail -1` and confirm the source file. Tick tasks 1.1–1.2.

### Task 2: Database — payload, handler, and the test sweep

**Files:**
- Create: `supabase/migrations/034_screening_checks.sql`, sections 1–2. The header names design D2/D6 and the copied functions.
- Modify: `tests/support/database-fixture.mjs` (`INTAKE_CHECKS` and its `VERIFY_INTAKE` calls); every database suite that sends the old checks (`database-actions`, `-assistance`, `-documents`, `-intake`, `-realtime`, `-redesign`, `-review`, `-stages`).
- Test: `tests/database-actions.mjs` (new `test(...)` block).

**Interfaces:**
- Produces:
  - **`check_payload`, branch `VERIFY_INTAKE`:** `payload_keys(p_payload) = array['checks']`, `checks` is an object, `payload_keys(checks)` is in (`array['documents','in_scope','phone']`, `array['documents','identity','in_scope','phone']`), and every value is `'true'::jsonb`. Anything else raises `VT007 VALIDATION`.
  - **`act_verify_intake`:**
    - after 032's stage check, raise `VALIDATION` unless `(p_payload->'checks' ? 'identity') = coalesce(p_case.answers->>'service' = 'online', false)`;
    - return `detail = {checks: p_payload->'checks'}` (no `simulated`) and the D4 message.
  - **Test support:** the fixture exports `screeningChecks(service)`, which returns `{phone, documents, in_scope}` all true, plus `identity: true` when service is `online`. Its `VERIFY_INTAKE` calls read the case's `answers->>'service'` and use it.

- [x] **Step 1: Write the failing tests** in `tests/database-actions.mjs`:

```js
test("screening checks: the set follows the service", async () => {
  // drop-off case at screening: {phone, documents, in_scope} accepted → stage preparation_ready, intake_verified true
  // online case: the same three refused (VALIDATION); with identity accepted
  // detail of the VERIFY_INTAKE case_event deepEquals { checks: { … } } — no "simulated" key
  // client_events message equals the D4 English sentence exactly
});
test("old four-key payload refused", …)                // {interview, identity, documents, consent} → VALIDATION, stage still screening, revision unchanged
test("identity refused without online service", …)     // drop-off + identity → VALIDATION; answers without service + identity → VALIDATION
test("missing, extra or false checks refused", …)      // drop in_scope; add note:"x"; documents:false → each VALIDATION, nothing changed
```

- [x] **Step 2:** Run `npm run test:database`. Expected: the new tests FAIL, because today's branch accepts only the four old keys.
- [x] **Step 3:** Write 034 sections 1–2 per Interfaces. Copy `check_payload` from 033 and `act_verify_intake` from 032, marking every changed line `-- 034`.
- [x] **Step 4:** Sweep the callers: `grep -rn "INTAKE_CHECKS\|interview: true\|\"interview\"" tests/` and replace each old payload with `screeningChecks(service)` (or the fixture helper's own call). Update any assertion on the old message or on `detail.simulated`.
- [x] **Step 5:** Run `npm run db:migrate:test`, then `npm run test:database`. Expected: everything passes.
- [x] **Step 6:** Tick tasks 2.1, 2.2 and 2.4, then commit: `git commit -am "Screening checks: the database records the real checks (034)"`.

### Task 3: Fixtures

**Files:**
- Modify: `supabase/migrations/034_screening_checks.sql`, section 3: `fixture_history`, copied from 023.
- Test: `tests/database-fixtures.mjs`.

**Interfaces:**
- Produces: the six `VERIFY_INTAKE` rows are rewritten. Each has detail `{"checks":{"phone":true,"documents":true,"in_scope":true}}`, plus `"identity":true` on `review_ready`, and the D4 sentence. No other row changes.

- [x] **Step 1: Write the failing test** `fixture checks by service`. Seed the samples, then for each sample read its `VERIFY_INTAKE` event's `detail.checks`:
  - `review_ready` has four keys, including `identity`;
  - the other five have exactly `phone`, `documents` and `in_scope`;
  - every client line equals the D4 sentence.
- [x] **Step 2:** Run `npm run test:database`. Expected: FAIL.
- [x] **Step 3:** Write section 3.
- [x] **Step 4:** Run `npm run db:migrate:test && npm run test:database`. Expected: PASS.
- [x] **Step 5:** Tick task 2.3, then commit: `git commit -am "Screening checks: samples record the new checks"`.

### Task 4: The check list and the builder

**Files:**
- Modify: `src/case-actions.mjs` (`INTAKE_CHECK_KEYS` → `screeningCheckKeys`; the `VERIFY_INTAKE` builder) and `src/contracts.mjs` (payload note).
- Test: `tests/case-actions.test.mjs`.

**Interfaces:**
- Produces:
  - `screeningCheckKeys(service: string | undefined): readonly string[]` returns `["phone","documents","in_scope"]`, then `"identity"` appended when `service === "online"`. It is frozen.
  - `SCREENING_CHECK_LABELS: Readonly<Record<string,string>>` holds the four exact labels (Global Constraints).
  - The `VERIFY_INTAKE` builder is `(dataset, values) => ({ checks })` over `screeningCheckKeys(dataset.service)`. Each key must be ticked; otherwise it throws `{code:"VALIDATION"}` with "Tick every check before recording them.". Keys not in the list are never sent.

- [x] **Step 1: Write the failing tests:**

```js
test("screeningCheckKeys by service", () => {
  assert.deepEqual(screeningCheckKeys("drop_off"), ["phone", "documents", "in_scope"]);
  assert.deepEqual(screeningCheckKeys("same_day"), ["phone", "documents", "in_scope"]);
  assert.deepEqual(screeningCheckKeys("online"), ["phone", "documents", "in_scope", "identity"]);
});
test("screeningCheckKeys: unknown service", …)   // undefined and "x" → the three
test("drops identity unless online", …)          // drop_off dataset, values with all four ticked → payload checks has no identity
test("VERIFY_INTAKE needs every shown check", …) // online, identity unticked → throws "Tick every check before recording them."
```

  Replace the old four-check tests.
- [x] **Step 2:** Run `node --test tests/case-actions.test.mjs`. Expected: FAIL.
- [x] **Step 3:** Implement the code per Interfaces. Update the `src/contracts.mjs` note for `VERIFY_INTAKE`.
- [x] **Step 4:** Run `npm test`. Expected: only the admin-views and story-related unit tests fail; Task 5 fixes those.
- [x] **Step 5:** Tick task 3.1, then commit: `git commit -am "Screening checks: one list for the panel and the payload"`.

### Task 5: The panel and the staff wording

**Files:**
- Modify: `src/admin-views.mjs` (`intakeChecksPanel`, `INTAKE_CHECK_LABELS` → `SCREENING_CHECK_LABELS`, the `verifyIntake` refusal), `src/app.mjs` (the `VERIFY_INTAKE` toast) and `src/staff-views.mjs` (`EVENT_SENTENCES.VERIFY_INTAKE`).
- Test: `tests/admin-views.test.mjs`, `tests/staff-views.test.mjs`, `tests/fixtures/empty-states.json` if its staff golden includes the panel.

**Interfaces:**
- Consumes: Task 4's `screeningCheckKeys` and `SCREENING_CHECK_LABELS`.
- Produces: the panel renders `screeningCheckKeys(record.answers?.service)`.
  - Each check keeps today's markup (`id` from `fieldId(key,"intake")`, `data-action="toggle-intake-check"`, `data-check=<key>`).
  - The submit carries `data-service`.
  - The button is disabled until every shown key is ticked in `ui.openPanels`.
  - The section title, button and hint are the exact Global Constraints strings, and the disclaimer paragraph is removed.

- [x] **Step 1: Write the failing tests:**

```js
test("screening checks panel: drop-off shows three", …)   // three labels, exact text; no identity; title "Screening checks"
test("screening checks panel: online shows identity", …)   // four, the identity label exact
test("the button waits for every shown check", …)          // two ticked → disabled + hint; three ticked (drop-off) → enabled, no hint
test("no simulated wording in the panel", …)              // assert.doesNotMatch(panelHtml, /simulat/i)
test("old VERIFY_INTAKE event renders", …)                 // history entry {action:"VERIFY_INTAKE", detail:{simulated:true, checks:{interview…}}} → "… recorded the screening checks"
```

  Update the existing tests that assert "Simulated intake checks", "Record the simulated intake checks" or "Tick all four", and the already-recorded refusal.
- [x] **Step 2:** Run `npm test`. Expected: FAIL.
- [x] **Step 3:** Implement the code per Interfaces, the toast and the history sentence.
- [x] **Step 4:** Run `npm test`. Expected: PASS.
- [x] **Step 5:** Tick tasks 3.2 and 3.3, then commit: `git commit -am "Screening checks: the panel and staff wording"`.

### Task 6: The client's line

**Files:**
- Modify: `src/client-text.mjs` (the history translation table) and `src/zh-hant.mjs` (generated).
- Test: `tests/client-language.test.mjs`.

**Interfaces:**
- Produces: a new table entry, the D4 English sentence mapped to the D4 简体. The old "Simulated intake checks are recorded. …" entry stays.

- [x] **Step 1: Write the failing tests:**
  - `new screening line translated`: the D4 English maps to the D4 简体, and the 繁體 is generated;
  - `old simulated line keeps its 简体`: the old entry is still present.
- [x] **Step 2:** Run `node --test tests/client-language.test.mjs`. Expected: FAIL.
- [x] **Step 3:** Add the entry, run `npm run build:hant`, and check the generated 繁體 by eye.
- [x] **Step 4:** Run `npm test` and `npm run build:hant -- --check`. Expected: PASS.
- [x] **Step 5:** Tick tasks 3.4 and 3.5, then commit, including `src/zh-hant.mjs`: `git commit -am "Screening checks: the client's history line"`.

### Task 7: Story, docs and full checks

**Files:**
- Modify: `tests/browser.mjs`: the intake-check ticks around lines 1100–1140 and 3955, and the direct payload near 3074.
- Modify: `docs/demo-script.md`, `docs/developer/database.md`, `docs/developer/architecture.md`, `docs/setup.md` (034 row, migration count).

- [x] **Step 1:** In the story, tick `screeningCheckKeys(<that case's service>)` instead of the four old keys. Send the new payload in the direct call near 3074. Assert the title "Screening checks", the button "Record the screening checks", and the hint while a box is unticked. If no story case is online, note in verify.md that identity is covered by Tasks 2, 4 and 5.
- [x] **Step 2:** Update the docs where they describe the panel, the checks, the payload or the migration list. Leave the historical mentions in `docs/spec.md`, `docs/proposal.md` and the roadmap.
- [x] **Step 3:** Run `npm run test:browser`. Expected: all pass (about 15–20 minutes).
- [x] **Step 4:** Run `npm test`, `npm run build:hant -- --check`, `npx openspec validate --all` and `npm run build:intake`, then `git status --short`. Expected: all pass, and the intake build leaves nothing to commit.
- [x] **Step 5:** Tick tasks 4.1–4.4, then commit: `git commit -am "Screening checks: the story and docs"`.
