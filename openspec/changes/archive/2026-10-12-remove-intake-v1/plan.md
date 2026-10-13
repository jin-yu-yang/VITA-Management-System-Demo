# Remove intake version 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Version 2 becomes the only intake version. Version 1's screens, branches, samples, key list and database paths are removed, and migration 023 guards real data, cleans up test and sample data, and narrows both version columns to 2.

**Architecture:**
- The tests move to version 2 first (Task 1), so every later task has a green suite to change against.
- The app loses its version-1 code (Task 2).
- Migration `023_remove_intake_v1.sql` runs in this order (Task 3):
  1. guard;
  2. cleanup;
  3. set every workspace to 2;
  4. redefine the functions without their version-1 paths, then drop the version-1-only ones;
  5. narrow both `CHECK`s.

  The guard and cleanup are built from two pure predicates the database suite tests with plain values.
- Task 4 removes the story's version-1 phase, updates the docs and runs every suite.

**Tech Stack:**
- plain ES modules (`src/`);
- PostgreSQL / Supabase migrations, applied by `tools/admin/migrate.mjs`;
- `node:test` for the unit and database suites, using `tests/support/database-fixture.mjs`;
- Playwright (`tests/browser.mjs`).

**Spec:** `openspec/changes/remove-intake-v1/specs/client-intake/spec.md`. Read it with `proposal.md` and `design.md` (decisions D1–D9) in the same folder. The current canonical spec is `openspec/specs/client-intake/spec.md`.

## Global Constraints

- **Migrations** in `supabase/migrations/` are hand-written and final once applied. Never edit 001–022. 023 is the only new one.
- **Every redefinition** in 023 is copied **verbatim** from the function's latest definition (design D4 names the source file and lines), with only the version-1 lines removed. Nothing else in the function changes.
- **No contract change** beyond the spec:
  - `vitally_create_case` keeps its signature, grants and receipt digest (design D6);
  - the store keeps mapping `intakeVersion` and `defaultIntakeVersion`;
  - no action envelope changes.
- **The strict line with #58:** delete only version-1 screens and their strings. Never reword or remove a string version 2 also uses: the client's "Fill fictional details" and "Generate another example" and their messages, the version-2 Add a case fill, "Simulated intake checks", the footer, the sign-in notes.
- **Client text:** screen text lives in `src/client-text.mjs`. After removing any 简体 entry, run `npm run build:hant` and commit `src/zh-hant.mjs`. Staff screens stay English.
- **Rule 3, no silent coverage loss:** every test deleted or rewritten in a task is listed in that task's report as **version-1 only** (its behaviour is gone) or **general → `<replacement test name>`**.
- **Story rules (`tests/browser.mjs`):** a press under test is one `locator.click()` with no retry, and there are no sleeps.
- **The catalogue is unchanged.** Never edit `docs/intake-questions/`: a catalogue change makes `npm run build:intake` write a new catalogue migration, and CI fails on it. The word "rideshare" appears there as tip wording, not a version-1 key.
- **Fictional data only.** Never touch:
  - `src/pcdc-logo.png`;
  - `.stitch/captures`;
  - `.claude/worktrees/`;
  - the untracked `VITA-Management-System-Demo/` directory;
  - anything under `docs/superpowers/`.
- **Test stack:**
  - `vitally-task2` on port 54321; its database container is `supabase_db_vitally-task2.M5anE7XP`.
  - If it's down, run `docker start $(docker ps -aq --filter name=vitally-task2)`.
  - Never run `supabase start` or `npx supabase start` from the repo root.
- **PATH prefix for every command:** `PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`.
- **Worktree git:**
  - Run git as separate plain commands (stage, then commit).
  - Never `git add -A`, because the worktree's `node_modules` is an untracked symlink.
  - Confirm each commit with `git rev-parse --short HEAD` and `git status --short`.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Irreversible stack operations** need the user's confirmation at that moment, relayed by the controller. They are: deleting the rehearsal workspace, and running `db:migrate:test` with 023.

---

### Task 1: Tests and fixtures move to version 2 (the database is still at 022)

**Files:**
- Modify:
  - `tests/support/database-fixture.mjs` (the `intakeVersion` option, lines ~125–135 and ~631–637; the helpers `readyCase` ~259, `assistedCase` ~275, `seedAssistance` ~341, the stage helper ~420);
  - `tests/support/browser-fixture.mjs` (line ~348, the `intakeVersion` option);
  - `tests/support/rpc-signatures.mjs` (line ~19).

  `src/sample-data.mjs` is **not** changed here: the app's version-1 fill paths (`app.mjs` ~841 and ~881) still call `makeSampleAnswers()` without a version until Task 2 removes them.
- Modify the tests that use version-1 data or the `intakeVersion` option:
  - `tests/database-*.mjs`, especially `database-actions`, `database-client-numbers`, `database-assistance`, `database-realtime`, `database-store`, `database-intake`, `database-intake-default`, `database-redesign` (it sets workspace versions and asserts a version-1 case, ~83 and ~165), `database-review` and `database-fixtures`;
  - `tests/browser.mjs` (only the `createBrowserFixture({ intakeVersion: 2 })` call at ~464, which becomes `createBrowserFixture()`);
  - every `createDatabaseFixture({ intakeVersion: … })` call (for example `database-intake-default.mjs`'s `intakeVersion: null` and `intakeVersion: 2`), which becomes `createDatabaseFixture()`. A leftover option would be silently ignored, so remove it rather than rely on that.

  `tests/sample-data.test.mjs` is Task 2's, together with `sample-data.mjs`.

**Interfaces:**
- **Produces, for Tasks 2–4:**
  - `createDatabaseFixture({ afterInitialize } = {})` and `createBrowserFixture() `. There's no `intakeVersion` option, and fixture workspaces keep the column default, which is 2 since 020.
  - Tests build version-2 answers with `makeSampleAnswers({ version: 2, seed, married })`. The default is still version 1 until Task 2.
  - `f.draftCase(actor, { mode = "client", personId = null, answers = makeSampleAnswers({ version: 2 }) } = {})`, which creates an empty case, saves `answers` with `SAVE_ANSWERS` and returns `{ caseId }`. For an assisted case, the actor is `f.presenter` with `personId: f.sam`.
- **Consumes:** the existing `f.createCase`, `f.act`, `f.seedFixtures` and `INTAKE_CHECKS`.

- [ ] **Step 1: The fixture option goes.** In `createDatabaseFixture`:
  - delete the `intakeVersion` parameter, its `TypeError` check and its comment;
  - delete the `if (intakeVersion !== null) await connection.query("update public.workspaces set default_intake_version = $2 where id = $1", …)` block in `initializeOwned`'s `afterInitialize`.

  In `createBrowserFixture`, make the signature `createBrowserFixture()` and call `createDatabaseFixture()`.

- [ ] **Step 2: The helper for a draft with answers.** Add it beside `f.createCase`:

```js
  // A draft with answers. Version 2 refuses a create that carries answers (011's
  // insert trigger, VT007), so the case is created empty and the answers are
  // saved straight after, as the client's own form does.
  f.draftCase = async (
    actor,
    { mode = "client", personId = null, answers = makeSampleAnswers({ version: 2 }) } = {},
  ) => {
    const created = await f.createCase(actor, randomUUID(), { mode, personId, answers: {} });
    await f.act(actor, created.caseId, personId, "SAVE_ANSWERS", { answers });
    return created;
  };
```

- [ ] **Step 3: Move the helpers onto it.**
  - `readyCase` uses `const created = await f.draftCase(f.applicantA);`.
  - `assistedCase` uses `const created = await f.draftCase(f.presenter, { mode: "assisted", personId: f.sam });`.
  - `seedAssistance` uses `const created = await f.draftCase(f.applicantA);`.
  - In the stage helper (~420), the `!current?.answers?.year` test is a version-1 key. Make it `Object.keys(current?.answers ?? {}).length === 0`, and make the call `makeSampleAnswers({ version: 2 })`.

  Every other `f.createCase(…, { answers: makeSampleAnswers() })` in `tests/` becomes `f.draftCase(…)` with the same actor, mode and person.

- [ ] **Step 4: Version-2 data in the tests.** Every `makeSampleAnswers()` a database test or fixture helper uses for a general flow becomes `makeSampleAnswers({ version: 2 })`, with the same `seed`. `src/sample-data.mjs` itself is unchanged in this task.

- [ ] **Step 5: The signature test.** `tests/support/rpc-signatures.mjs`'s create call sends `p_answers: {}` instead of `makeSampleAnswers()`.

- [ ] **Step 6: Each database test file.** For every test that:
  - **used version-1 data for a general flow** (client numbers, assistance, realtime, actions, store, review): keep the test, now running on version 2 through the helpers. Fix any assertion that read a version-1 key, such as `answers.firstName`; version 2 uses `tp_first`-style ids from the catalogue. Read the real ids from `makeSampleAnswers()`'s output.
  - **tested version 1 itself** (`database-intake-default.mjs`'s version-1 samples test, its "a version-1 application keeps version 1…" and "set back to 1" checks, `database-intake.mjs`'s version-1 paths, `database-fixtures.mjs`'s version-1 seeding): delete it, and **list it** under Rule 3. If a deleted test also covered something general, name the version-2 test that covers it, or add one.
  - **set a workspace to version 1 and back** (for example `database-intake.mjs`'s `v2Case`): delete the set-to-1 step.

- [ ] **Step 7: `tests/sample-data.test.mjs`** is left for Task 2, which changes `sample-data.mjs`.

- [ ] **Step 8: Run the suites on the stack at 022.**

Run: `npm test` (expect it green), then `npm run test:database` (expect it green; the count drops, so report it). If a test fails because it still assumes version 1, fix it under Step 6's rules.

- [ ] **Step 9: Commit.**

```bash
git add tests/support/database-fixture.mjs tests/support/browser-fixture.mjs tests/support/rpc-signatures.mjs <each changed tests/*.mjs, by name>
git commit -m "Tests: fixtures are version 2 only; version-1 database tests removed, general ones moved to version 2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Version 1 leaves the app

**Files:**
- Modify:
  - `src/domain.mjs`;
  - `src/client-views.mjs`, `src/intake-views.mjs` (only if it holds a version branch), `src/office-views.mjs`, `src/admin-views.mjs`, `src/staff-views.mjs` and `src/views.mjs`;
  - `src/controller.mjs`, `src/app.mjs` and `src/supabase-store.mjs`;
  - `src/sample-data.mjs`;
  - `src/window-state.mjs` (`FIELDS.formStep` and `asStep`);
  - `src/contracts.mjs` (the `intakeVersion: 1 | 2` comment, which becomes `2`);
  - `src/client-text.mjs`, with `src/zh-hant.mjs` regenerated;
  - `src/styles.css` (the `.v1-note`/`.v1-english` rules).
- Tests:
  - `tests/client-views.test.mjs`, `tests/staff-views.test.mjs`, `tests/admin-views.test.mjs`, `tests/office-views.test.mjs` and `tests/domain.test.mjs`;
  - `tests/controller.test.mjs`, `tests/shell.test.mjs`, `tests/store.test.mjs` and `tests/client-language.test.mjs`;
  - `tests/window-state.test.mjs` (or wherever window state is tested);
  - `tests/sample-data.test.mjs`, plus every test or helper still passing `{ version: 2 }` to `makeSampleAnswers`.

**Interfaces:**
- **Consumes:** Task 1's version-2 `makeSampleAnswers` and fixtures.
- **Produces:**
  - an app with no version branches; Task 4's story relies on the version-2 screens only;
  - `makeSampleAnswers({ seed = 0, married = false } = {})`, which always returns version-2 answers. Task 3's tests call it this way.

- [ ] **Step 1: The inventory.** Run:

```bash
grep -nE "intakeVersion|defaultIntakeVersion|isV2Case|caseVersion\(|isVersionTwo|answersPanelV1|intakeBody|intakeScreen\b|renderAddCase\b|assistedAnswersPanel|INTAKE_ANSWER_KEYS|REQUIRED_ANSWER_KEYS|screening|missingAnswers|submissionBlocker|formStep\b|setFormStep|v1\.english_only|v1-english|v1-note|version-1|version 1" src/*.mjs src/styles.css
```

List every hit in the report, with its fate: removed, or kept because it's in the store mapping or `intakeChecksPanel`.

- [ ] **Step 2: Client.**
  - **Delete:** `intakeBody`, version-1 `intakeScreen` and the version-1 English wrapper (`client-views.mjs` ~296–360); `domain.mjs`'s `INTAKE_ANSWER_KEYS`, `REQUIRED_ANSWER_KEYS`, `screening`, `missingAnswers` and `submissionBlocker`; and the `v1.english_only` entry in `client-text.mjs`.
  - Keep `intakeScreenV2` and route every intake screen to it, renaming it `intakeScreen` only if no test or import pins the old name. Report which.
  - Remove the 8 version branches in `client-views.mjs` (the save chip, the fill tools, the progress page), keeping the version-2 side of each.

- [ ] **Step 3: Office and staff.**
  - **Delete:** `renderAddCase` (version 1, `office-views.mjs` ~360), `assistedAnswersPanel` (`admin-views.mjs` ~423) along with its fill tool and the `year: "This prototype accepts tax year 2025 only."` blocker, and `answersPanelV1` (`staff-views.mjs` ~728).
  - `answersPanel` and `intakeAnswersTab` always take the version-2 path.
  - **Keep** `intakeChecksPanel`.
  - Remove the `version2`/`draftForOffice && !version2` branches (`admin-views.mjs` ~712–740) and `views.mjs`'s `defaultIntakeVersion === 2` test (~326). The office always gets the version-2 Add a case.

- [ ] **Step 4: Controller, app and store.**
  - Remove every version branch in `controller.mjs`, keeping the version-2 side, including:
    - `pickAnswers`' version-1 path (the `INTAKE_ANSWER_KEYS` loop ~109);
    - `saveNow`'s `version !== 2 ? … ` envelope path;
    - the version-1 office draft;
    - `enterOfficeDraftIfNeeded`'s and `startOfficeDraft`'s version tests (always version 2 now);
    - the "This workspace now takes version-1 applications. Start again from Add a case." notice, together with its `SENTENCES` entry in `client-text.mjs`;
    - **`formStep`** (design D8): `state.formStep`, `setFormStep`, its save and restore (~448 and ~471), its reset in `clearSelection` (~750), `app.mjs`'s version-1 Back and Next (~1452 and ~1811) and the render-key fallback (~245);
    - `window-state.mjs`'s `FIELDS.formStep`, and `asStep` if nothing else uses it;
    - `staff-views.mjs`'s version-1 refusals ("A version-1 case has no contact card." and "… no document checklist.", ~324 and ~334), the `!== 2` early return (~976), and `admin-views.mjs`'s "Some screening answers still need checking…" (~405).
  - Remove `app.mjs`'s 5 version branches.
  - In `supabase-store.mjs`, keep mapping `intakeVersion` and `defaultIntakeVersion`, but drop both fallbacks: `Number(row.intake_version ?? 1)` (~91) becomes `Number(row.intake_version)`, and `Number(row.default_intake_version ?? 1)` (~344) becomes `Number(row.default_intake_version)`.

- [ ] **Step 4b: `sample-data.mjs` is version-2 only.**
  - `makeSampleAnswers({ seed = 0, married = false } = {})` returns today's `versionTwoAnswers(seed, married)`. `fillBlankAnswers` loses its `version` parameter if only version 1 used it.
  - Delete `templateFor`, the version-1 templates and scenarios, and the `INTAKE_ANSWER_KEYS` import.
  - Remove every now-redundant `{ version: 2 }` argument in `src/` and `tests/`, including Task 1's `f.draftCase` default.
  - Read the file first. If a version-1 part feeds anything version 2 uses (for example `fictionalAnswers`), keep it and report it.
  - In `tests/sample-data.test.mjs`, delete the version-1 template tests (Rule 3: version-1 only) and keep the version-2 ones.

- [ ] **Step 5: 繁體.** Run `npm run build:hant`, then `npm run build:hant -- --check` (expect it to pass).

- [ ] **Step 6: Unit tests (Rule 3 list).** Delete the tests of version-1 screens and logic, and move any general one to version 2:
  - `domain.test.mjs`'s screening and missing-answers tests;
  - `client-views.test.mjs`'s version-1 form and note tests;
  - `staff-views.test.mjs`'s `answersPanelV1` tests;
  - `admin-views.test.mjs`'s assisted-panel tests;
  - `office-views.test.mjs`'s version-1 Add a case tests;
  - `controller.test.mjs`'s version-1 save and draft tests;
  - `store.test.mjs`'s three fallback tests: `default_intake_version: null → 1` (~533), `intake_version: "1" → 1` (~1049) and the row with no `intake_version` (~1050). Rewrite or remove each to match the new mapping, which has no `?? 1`, and report which;
  - `shell.test.mjs`'s version-1 pins.

  Add two tests (design D8):

```js
// tests/window-state.test.mjs, beside "the version-2 sub-step is kept when it has a sub-step id's shape":
test("a version-1 step number saved by an older version is not restored", () => {
  const sessionStorage = fakeSession();
  const window = createWindowState({ sessionStorage });
  window.write("user-1", { screen: "intake", formStep: 2, formSubstep: "about.you" });
  assert.deepEqual(window.read("user-1"), { screen: "intake", formSubstep: "about.you" });
});
```

  `write` may itself drop unknown fields before storing. If it does, write the raw record straight into `fakeSession()` under `windowStateKey("user-1")`, the way the file's "a stored visited-steps record from 4b is ignored" test does, so the test proves `read` ignores it.

  ```text
  controller.test.mjs: opening a saved case id that no longer exists (the store
  answers NOT_FOUND on load) clears the selection; follow the existing
  forgetGoneCase test's setup and assert state.selectedCaseId === null.
  ```

  If the gone-case behaviour already has a test (`controller.test.mjs` has NOT_FOUND cases around lines 1673, 1877 and 2111), cite it instead of adding one.

- [ ] **Step 7: The acceptance grep (design D5).** Re-run Step 1's grep. Expected:
  - only the store's `intakeVersion`/`defaultIntakeVersion` mapping lines remain;
  - nothing named `answersPanelV1`, `intakeBody`, `INTAKE_ANSWER_KEYS`, `screening(`, `assistedAnswersPanel`, `v1.english_only` or `version-1` (comments included) remains in `src/`.

  Report the output.

- [ ] **Step 8: Run.** `npm test` (expect it green; report the count) and `npm run build:hant -- --check`.

- [ ] **Step 9: Commit.**

```bash
git add <every changed src/*.mjs and tests/*.mjs and tests/support/*.mjs by name> src/zh-hant.mjs
git commit -m "Version 1 leaves the app: the old form and screening, the old Add a case and office draft, the version-1 answers panel, every version branch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Migration 023 and its database tests

**Files:**
- Create: `supabase/migrations/023_remove_intake_v1.sql`.
- Create: `tests/database-intake-v1-removed.mjs`.

**Interfaces:**
- **Consumes:** Task 1's fixtures (version-2 workspaces, `f.draftCase`, `f.seedFixtures`, `f.sql`).
- **Produces** these SQL functions:
  - `vitally_private.version_one_blocks(smallint, boolean, boolean) returns boolean`;
  - `vitally_private.version_one_disposable(smallint, boolean, boolean) returns boolean`;
  - `vitally_private.version_one_blockers() returns bigint`.

- [ ] **Step 1: Write the failing database tests** in `tests/database-intake-v1-removed.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabaseFixture } from "./support/database-fixture.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";

// Migration 023 (OpenSpec change remove-intake-v1, spec client-intake): version 2
// is the only intake version. The guard and the cleanup run once, inside the
// migration, so their rule is tested here through its two pure predicates.

const rejects = (promise, code) => assert.rejects(promise, (error) => error.code === code);

test("the guard's and the cleanup's rule, as plain values", async (t) => {
  const f = await createDatabaseFixture();
  try {
    const rule = async (fn, version, fixture, inTest) =>
      (await f.sql(`select vitally_private.${fn}($1::smallint,$2,$3) as r`, [version, fixture, inTest])).rows[0].r;
    // version, sample, in a test workspace -> blocks, disposable
    const table = [
      [1, false, false, true, false],
      [1, true, false, false, true],
      [1, false, true, false, true],
      [1, true, true, false, true],
      [2, false, false, false, false],
      [2, true, false, false, false],
      [2, false, true, false, false],
      [2, true, true, false, false],
    ];
    for (const [version, fixture, inTest, blocks, disposable] of table) {
      await t.test(`version ${version}, sample ${fixture}, test workspace ${inTest}`, async () => {
        assert.equal(await rule("version_one_blocks", version, fixture, inTest), blocks);
        assert.equal(await rule("version_one_disposable", version, fixture, inTest), disposable);
      });
    }
    await t.test("no version-1 application blocks the migrated database", async () => {
      assert.equal(Number((await f.sql("select vitally_private.version_one_blockers() as n")).rows[0].n), 0);
    });
    await t.test("the new private functions are not executable by clients", async () => {
      for (const signature of [
        "vitally_private.version_one_blocks(smallint,boolean,boolean)",
        "vitally_private.version_one_disposable(smallint,boolean,boolean)",
        "vitally_private.version_one_blockers()",
      ])
        for (const role of ["anon", "authenticated"]) {
          const { rows } = await f.sql("select has_function_privilege($1, $2::regprocedure, 'execute') as ok", [role, signature]);
          assert.equal(rows[0].ok, false, `${role} on ${signature}`);
        }
    });
  } finally {
    await f.close();
  }
});

test("version 2 is the only accepted version", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await t.test("neither version column keeps a default of 1", async () => {
      const { rows } = await f.sql(
        "select table_name, column_default from information_schema.columns where table_schema='public' and ((table_name='cases' and column_name='intake_version') or (table_name='workspaces' and column_name='default_intake_version')) order by 1",
      );
      assert.deepEqual(rows.map((r) => [r.table_name, String(r.column_default).trim()]), [["cases", "2"], ["workspaces", "2"]]);
    });
    await t.test("a workspace defaults to 2 and can't be set to 1", async () => {
      assert.equal(Number((await f.sql("select default_intake_version v from public.workspaces where id=$1", [f.workspaceId])).rows[0].v), 2);
      await rejects(f.sql("update public.workspaces set default_intake_version=1 where id=$1", [f.workspaceId]), "23514");
    });
    await t.test("a client's and the office's new applications are version 2", async () => {
      const own = await f.createCase(f.applicantA, randomUUID(), { answers: {} });
      const office = await f.createCase(f.presenter, randomUUID(), { mode: "assisted", personId: f.sam, answers: {} });
      for (const { caseId } of [own, office])
        assert.equal(Number((await f.sql("select intake_version v from public.cases where id=$1", [caseId])).rows[0].v), 2);
    });
    await t.test("a create that carries answers is refused", async () => {
      await assert.rejects(f.createCase(f.applicantA, randomUUID(), { answers: { tp_first: "Mei" } }));
    });
    await t.test("an application's version never changes", async () => {
      const { caseId } = await f.draftCase(f.applicantA);
      await f.act(f.applicantA, caseId, null, "SAVE_ANSWERS", { answers: makeSampleAnswers({ seed: 1 }) });
      assert.equal(Number((await f.sql("select intake_version v from public.cases where id=$1", [caseId])).rows[0].v), 2);
      await assert.rejects(f.sql("update public.cases set intake_version=1 where id=$1", [caseId]));
    });
    await t.test("the version-1-only functions are gone", async () => {
      for (const name of ["intake_answer_keys", "fixture_answers"])
        assert.equal(
          (await f.sql("select count(*) n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='vitally_private' and p.proname=$1", [name])).rows[0].n,
          "0",
          name,
        );
    });
    await t.test("a reset seeds six version-2 samples whose submit history has no screening detail", async () => {
      await f.seedFixtures();
      const { rows } = await f.sql("select id, intake_version from public.cases where workspace_id=$1 and fixture", [f.workspaceId]);
      assert.equal(rows.length, 6);
      for (const row of rows) assert.equal(Number(row.intake_version), 2);
      const { rows: events } = await f.sql(
        "select detail from public.case_events where workspace_id=$1 and action='SUBMIT' and case_id = any($2::uuid[])",
        [f.workspaceId, rows.map((r) => r.id)],
      );
      for (const event of events) assert.equal(event.detail?.screening, undefined);
    });
  } finally {
    await f.close();
  }
});
```

  Two notes on this test code:
  - `f.createCase` rejects with the store's error. If its `code` for a create with answers is something other than `VALIDATION`, keep `assert.rejects` without a code check, as above.
  - Check the real column names of `public.case_events` (`action`, `detail`, `case_id`, `workspace_id` on the stack today) before relying on them.

- [ ] **Step 2: See them fail against the stack at 022.**

Run: `node --env-file=.env.test --test tests/database-intake-v1-removed.mjs` (with the PATH prefix).
Expected: FAIL. The predicates and `version_one_blockers` don't exist; setting a workspace to 1 succeeds; the two version-1-only functions exist; the seeded histories carry `screening`. Record the output.

- [ ] **Step 3: Write `023_remove_intake_v1.sql`.** It's built in this order (design D3):

```sql
-- Remove intake version 1 (OpenSpec change remove-intake-v1, spec client-intake).
-- Version 2 is the only intake version from here on. In order:
--   1. the rule as two pure predicates and a count;
--   2. the guard: refuse while a version-1 application exists that is neither
--      a sample nor in a test workspace (a real client's application);
--   3. the cleanup: delete version-1 samples and test-workspace version-1
--      cases (children cascade; action_receipts stay, as with a reset), and
--      bump fixture_generation so open windows re-read their lists;
--   4. every workspace still at 1 is set to 2;
--   5. the functions redefined without their version-1 paths, each copied
--      verbatim from its latest definition (named below), then the
--      version-1-only functions dropped;
--   6. both CHECKs narrowed to 2.
-- Nothing is re-seeded: the next "Reset sample cases" seeds version 2. The
-- whole file is one transaction, so a refused guard changes nothing.

-- 1. The rule ---------------------------------------------------------------
create or replace function vitally_private.version_one_blocks(p_intake_version smallint, p_fixture boolean, p_in_test_workspace boolean)
returns boolean language sql immutable set search_path='' as $$
 select p_intake_version = 1 and not p_fixture and not p_in_test_workspace
$$;
create or replace function vitally_private.version_one_disposable(p_intake_version smallint, p_fixture boolean, p_in_test_workspace boolean)
returns boolean language sql immutable set search_path='' as $$
 select p_intake_version = 1 and (p_fixture or p_in_test_workspace)
$$;
create or replace function vitally_private.version_one_blockers()
returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.cases c
  where vitally_private.version_one_blocks(c.intake_version, c.fixture,
   exists (select 1 from vitally_private.test_workspaces t where t.workspace_id = c.workspace_id))
$$;
revoke all on function vitally_private.version_one_blocks(smallint,boolean,boolean) from public,anon,authenticated,service_role;
revoke all on function vitally_private.version_one_disposable(smallint,boolean,boolean) from public,anon,authenticated,service_role;
revoke all on function vitally_private.version_one_blockers() from public,anon,authenticated,service_role;

-- 2. The guard --------------------------------------------------------------
do $$
declare v_blockers bigint = vitally_private.version_one_blockers();
begin
 if v_blockers > 0 then
  raise exception 'Migration 023 refused: % version-1 application(s) exist outside test workspaces (workspaces: %). Clear them first (docs/setup.md, "Migrations").',
   v_blockers,
   (select string_agg(distinct c.workspace_id::text, ', ') from public.cases c
     where vitally_private.version_one_blocks(c.intake_version, c.fixture,
      exists (select 1 from vitally_private.test_workspaces t where t.workspace_id = c.workspace_id)));
 end if;
end
$$;

-- 3. The cleanup ------------------------------------------------------------
with gone as (
 delete from public.cases c
  where vitally_private.version_one_disposable(c.intake_version, c.fixture,
   exists (select 1 from vitally_private.test_workspaces t where t.workspace_id = c.workspace_id))
  returning c.workspace_id)
update public.workspaces set fixture_generation = fixture_generation + 1
 where id in (select workspace_id from gone);

-- 4. Every workspace is version 2 -------------------------------------------
update public.workspaces set default_intake_version = 2 where default_intake_version <> 2;

-- 5. The functions without their version-1 paths (see the list below) ------
-- ... (one block per function, copied as described in Step 4) ...

drop function vitally_private.intake_answer_keys();
drop function vitally_private.fixture_answers(text);

-- 6. Only version 2 -----------------------------------------------------------
alter table public.workspaces drop constraint workspaces_default_intake_version_range;
alter table public.workspaces add constraint workspaces_default_intake_version_range check (default_intake_version = 2);
alter table public.cases drop constraint cases_intake_version_range;
alter table public.cases add constraint cases_intake_version_range check (intake_version = 2);
-- 011 gave cases.intake_version a column default of 1. The insert trigger
-- always overrides it, but no version-1 value is left in the schema.
alter table public.cases alter column intake_version set default 2;
```

  `fixture_answers(text)` is the version-1 one. **Do not drop `fixture_answers_v2(text)`**. Check the exact signature first with `\df vitally_private.fixture_answers*`, read-only.

- [ ] **Step 4: The redefinitions (design D4).** Each goes in section 5 of 023 and is copied **verbatim** from these lines, with only the listed version-1 lines removed.
  - **Every block must start `create or replace function`.** Seven of the eight sources already do. **`vitally_create_case`'s source (001:181) says plain `create function`**: copied as it is, 023 fails with "function already exists". Change only that word.
  - Keep the grants that follow a source when it states them. `vitally_create_case`'s revoke and grant at 001:256–257 are repeated as they are; they're harmless and keep the block self-describing.

  | Function | Copy from | Remove |
  |---|---|---|
  | `public.vitally_create_case` | `001_identity_and_cases.sql:181-255` (grants 256–257) | Replace the version-1 key check at line 221–223 with: `if p_answers <> '{}'::jsonb then raise sqlstate 'VT007' using message='VALIDATION'; end if;`. Everything else, the digest included, is unchanged |
  | `vitally_private.cases_intake_version_insert` | `011_intake_v2.sql:37-48` | `new.intake_version = coalesce(v_version, 1);` becomes `new.intake_version = v_version;`. `if new.intake_version = 2 and new.answers is distinct from '{}'::jsonb` becomes `if new.answers is distinct from '{}'::jsonb` |
  | `vitally_private.check_related` | `017_documents_and_visits.sql:393-437` | In `SAVE_ANSWERS`, unwrap `if p_case.intake_version = 2 then … elsif <intake_answer_keys check> … end if;` to the version-2 body. In `visited`, `if p_case.intake_version<>2 or exists(…)` becomes `if exists(…)`. In `SET_DOCUMENT_CARD`/`SET_DOCUMENT_GROUP`, `if p_case.intake_version<>2 or not exists(` becomes `if not exists(` |
  | `vitally_private.act_save_answers` | `017_documents_and_visits.sql:442-502` | Unwrap `if p_case.intake_version = 2 then <body> else update … answers||… end if;` to `<body>` |
  | `vitally_private.act_submit` | `011_intake_v2.sql:592-630` | Unwrap `if p_case.intake_version = 2 then <body incl. return> end if;` to `<body>`. Delete lines 612–628 (the version-1 path, with its `screening` detail) |
  | `vitally_private.act_update_contact` | `013_contact_materials.sql:318-349` | Delete the comment at line 324 and the `if p_case.intake_version<>2 then raise … end if;` at 325–327 |
  | `vitally_private.seed_fixtures` | `019_fixtures_v2.sql:196-280` | Unwrap `if v_version=2 then <version-2 insert> else <version-1 insert> end if;` to the version-2 insert. Delete `v_version` and its `select … into v_version`, unless something else uses it (check) |
  | `vitally_private.fixture_history` | `021_review_approved_message.sql:33-79` | In the **six** sample `SUBMIT` rows (lines 37, 40, 45, 52, 60 and 67, one per scenario), change `'{"simulated":true,"screening":"continue"}'` to `'{"simulated":true}'`. Nothing else |

  For each function, report a diff of your 023 block against its source lines that shows only those removals, plus `create function` → `create or replace function` for `vitally_create_case`. Keep the temporary files in the git-ignored SDD workspace, never in the repo or `/tmp`:

```bash
W=.superpowers/sdd/plan
sed -n 393,437p supabase/migrations/017_documents_and_visits.sql > $W/src.sql   # adapt per function
# put the 023 block into $W/new.sql, then:
diff $W/src.sql $W/new.sql
```

  The header comment of each block names its source, for example `-- check_related, verbatim from 017 without its version-1 paths.`

- [ ] **Step 5: Re-read 023 against design D3 and D4 before applying it.** Applying it is final on the stack.

- [ ] **Step 6: Stop and report READY_TO_APPLY.** Do not run the migration yourself. The controller relays the next step to the user.

  **The following is done by the controller only after the user confirms:**
  1. find the rehearsal workspace:

     ```sql
     select w.id from public.workspaces w where not exists (select 1 from vitally_private.test_workspaces t where t.workspace_id = w.id)
     ```

     It must be exactly one row;
  2. delete it: `delete from public.workspaces where id = '<that id>'`;
  2b. preview the guard. Its functions don't exist before 023 runs, so the controller runs the same rule as plain SQL. It must return 0, or 023 would refuse:

     ```sql
     select count(*) from public.cases c where c.intake_version = 1 and not c.fixture and not exists (select 1 from vitally_private.test_workspaces t where t.workspace_id = c.workspace_id)
     ```
  3. record the counts before:

     ```sql
     select c.intake_version, c.fixture, (t.workspace_id is not null) in_test, count(*) from public.cases c left join vitally_private.test_workspaces t on t.workspace_id = c.workspace_id group by 1,2,3 order by 1,2,3
     ```

     plus `select default_intake_version, count(*) from public.workspaces group by 1`. On this stack every workspace is already at 2 (020), so 023's step 4 is a no-op here. The "existing workspace is switched" scenario's evidence is then the statement plus these counts, and `verify.md` says so;
  4. run `npm run db:migrate:test`;
  5. record the same counts after.

- [ ] **Step 7 (after the controller's go-ahead): Run.**
  - `node --env-file=.env.test --test tests/database-intake-v1-removed.mjs`: expect PASS.
  - `npm run test:database`: expect PASS (report the count).
  - `npm test`: expect PASS.

- [ ] **Step 8: Commit.**

```bash
git add supabase/migrations/023_remove_intake_v1.sql tests/database-intake-v1-removed.mjs
git commit -m "Migration 023: version 2 is the only intake version (guard, cleanup, functions without their version-1 paths, CHECKs narrowed)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The story, the docs and the final runs

**Files:**
- Modify:
  - `tests/browser.mjs` (the phase "a version-1 draft still finishes in the old form", ~2731–2900, and the version-1 comments at ~292, ~754 and ~1829);
  - `docs/setup.md`, `docs/developer/README.md`, `docs/developer/architecture.md`, `docs/developer/database.md`, `docs/developer/frontend.md`, `docs/developer/production-roadmap.md`, `README.md` and `docs/design/redesign-review.md`;

  `docs/proposal.md` and `docs/spec.md` say "v1" meaning the product's first release (the MVP), not intake version 1. Leave them alone.
  - `CLAUDE.md` (the Project rules **Versions** bullet).

**Interfaces:**
- **Consumes:** Tasks 1–3, the counts the controller recorded, and the suite counts.

- [ ] **Step 1: The story.**
  - Delete the version-1 phase, and the helpers or comments that only it used (for example the version-1 "fill every blank and walk the four version-1 steps" helper at ~292, if nothing else calls it).
  - Remove the version-1 mentions in comments at ~754 and ~1829.
  - Keep every version-2 phase unchanged.

- [ ] **Step 2: The docs.**
  - **`docs/setup.md`:**
    - add 023's row to the migration table and say "Twenty-three migrations";
    - under "Migrations", add a short paragraph on the guard: what makes it refuse, and how to clear a rehearsal workspace or recreate the stack;
    - drop every version-1 description;
    - update the tests table's counts and the last-verified sentence (each suite's date and change).
  - **`docs/developer/database.md`:** 023's row; "twenty-three"; the `workspaces` row's `default_intake_version` (011; only 2 since 023); the version-1 key list removed; the database suite count.
  - **`docs/developer/README.md`:** the file map's `domain.mjs` line (~78, "Version-1 intake keys, required answers, screening; …") keeps only what's left, and `sample-data.mjs` (~93) says version 2 only.
  - **`docs/developer/architecture.md`:** the intake-version paragraph says version 2 is the only version since 023.
  - **`docs/developer/frontend.md`:** the unit count, and any version-1 screen description.
  - **`docs/developer/production-roadmap.md`:** the "Remove version 1" bullet is done (remove it, or mark it done in the roadmap's style).
  - **`README.md`:** the part-4 rows mention version 1 as removed.
  - **`docs/design/redesign-review.md`:** the "Next: removing version 1" line.
  - **CLAUDE.md "Versions":** `- **Versions:** version 2 is the only intake version (migration 023). Workspaces and applications accept no other value.`

- [ ] **Step 3: The check that nothing still calls version 1 current.**

```bash
grep -rn -iE "version[- ]1 (stays|keeps|cases keep|is removed in its own|removal)|old (four-step )?form|still finishes in the old form|set back to 1|setting a workspace back to 1" README.md CLAUDE.md docs --include='*.md' | grep -v docs/superpowers/
```

Expected: no output, apart from historical statements that are clearly past tense. Report each one kept.

- [ ] **Step 4: The final runs.** Run all of:
  - `npm test`;
  - `npm run test:database`;
  - `npm run test:auth-browser`;
  - `npm run test:browser` (about 11–16 minutes, in the background; one run, reporting the count and duration);
  - `npm run build:hant -- --check`.

  If a story phase this change didn't touch fails, re-run once and report both runs. Put the counts into the docs from Step 2.

- [ ] **Step 5: Commit.**

```bash
git add tests/browser.mjs docs/setup.md docs/developer/README.md docs/developer/architecture.md docs/developer/database.md docs/developer/frontend.md docs/developer/production-roadmap.md README.md docs/design/redesign-review.md CLAUDE.md
git commit -m "Story and docs: version 1 is gone (migration 023); counts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage** (`specs/client-intake/spec.md`):
  - **"New applications use intake version 2" (MODIFIED):**
    - a new workspace defaults to 2, and setting it to 1 is refused: Task 3 tests;
    - "an existing workspace is switched": 023's step 4, plus the counts after;
    - the client's and the office's new applications are version 2: Task 3 tests.
  - **"An application's intake version never changes" (ADDED):** Task 3's test (a save keeps 2, and a direct change is refused).
  - **"Sample cases are version 2" (ADDED):** Task 3's reset test.
  - **The REMOVED requirements:** their behaviours are gone. Their version-1 tests are deleted under Rule 3 in Task 1.
- **Design coverage:**
  - D1: Task 3 step 6;
  - D2: Task 3 steps 1 and 3;
  - D3: Task 3 step 3;
  - D4: Task 3 step 4;
  - D5: Task 2;
  - D6: Task 3 (`vitally_create_case`) and Task 1 step 5;
  - D7: Tasks 1 and 3;
  - D8: Task 2 step 6;
  - D9: Task 3 step 6 (the controller's counts before and after).
- **tasks.md mapping:**
  - 1.1–1.4 → Task 1;
  - 2.1–2.6 → Task 2;
  - 3.1–3.4 → Task 3;
  - 4.1–4.3 → Task 4.
- **Names across tasks:**
  - `f.draftCase(actor, { mode, personId, answers })` (Task 1), used in Task 3;
  - `makeSampleAnswers({ version: 2 })` in Task 1, and `makeSampleAnswers({ seed, married })` from Task 2 on, used in Task 3;
  - `version_one_blocks`, `version_one_disposable` and `version_one_blockers` (Task 3);
  - `023_remove_intake_v1.sql` (Tasks 3 and 4);
  - `tests/database-intake-v1-removed.mjs` (Task 3).
