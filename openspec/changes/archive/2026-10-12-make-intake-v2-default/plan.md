# Make intake version 2 the default — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every workspace, existing and new, defaults to intake version 2, so new client and office applications and sample resets use version 2, while existing applications keep their version.

**Architecture:** One hand-written migration, `020_intake_v2_default.sql`. It sets `workspaces.default_intake_version`'s column default to 2 and sets every workspace to 2. Every consumer already follows that column:
- 011's insert trigger copies it into a new case, and its update trigger pins the version;
- 019's sample seeding follows it;
- the office's Add a case reads `workspace.defaultIntakeVersion`.

So no application code changes. Database tests in `tests/database-intake-default.mjs` prove the switch-over through a fixture workspace that keeps the real column default (`intakeVersion: null`).

**Tech Stack:** PostgreSQL (the local Supabase test stack), `tools/admin/migrate.mjs`, `node:test` with `tests/support/database-fixture.mjs`.

**Spec:** `openspec/changes/make-intake-v2-default/specs/client-intake/spec.md`. Read it with `proposal.md` and `design.md` in the same folder (decisions D1–D5).

## Global Constraints

- **Migrations** in `supabase/migrations/` are hand-written and final once applied. Never edit an applied migration. 001–019, 021 and 022 are applied; never touch them.
- **020's scope:** it contains exactly the two statements in Task 1, Step 4, plus its header comment. It redefines no function and loads no catalogue, so it is order-independent against 021 and 022 (design D1, D2).
- **No other code changes:** no application code (`src/`), client text, catalogue (`docs/intake-questions/`) or test-fixture default changes. Both `createDatabaseFixture` and `createBrowserFixture` keep `intakeVersion = 1` (design D4).
- **Fictional data only** in tests and fixtures.
- **Test stack:** `vitally-task2` on port 54321. If it is down: `docker start $(docker ps -aq --filter name=vitally-task2)`. Never run `supabase start` (or `npx supabase start`) from the repo root.
- **PATH prefix for every command:** `PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`.
- **Checks:** `npm test`, `npm run db:migrate:test`, then `npm run test:database`. No browser, sign-in or `build:hant` check (design D5).
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Leave alone:** the untracked `VITA-Management-System-Demo/` directory, `.claude/worktrees/`, `.stitch/captures`, `src/pcdc-logo.png`, and everything under `docs/superpowers/`.

---

### Task 1: The switch-over checks, then migration 020

**Files:**
- Modify: `tests/database-intake-default.mjs` (header comment, lines 6–10; the subtest "the column default is still 1 (no switch-over here)", lines 60–73; a new top-level test after the first one)
- Create: `supabase/migrations/020_intake_v2_default.sql`

**Interfaces:**
- **Consumes:** the fixture API already used in this file:
  - `createDatabaseFixture({ intakeVersion })` (with `1 | 2 | null`; `null` keeps the column default);
  - `f.workspaceId`, `f.sql(text, params)`, `f.createCase(actor, actionId, { mode?, personId?, answers })` returning `{ caseId }`;
  - `f.act(actor, caseId, personId, type, payload)`, `f.seedFixtures()`, `f.close()`;
  - actors `f.applicantA` and `f.presenter`, the persona `f.sam`;
  - this file's helpers `versionsOf(f)` and `samples(f)`;
  - `makeSampleAnswers()` from `src/sample-data.mjs` (version 1 by default).
- **Produces:** the migration file name `020_intake_v2_default.sql`, which Task 2's docs reference.

- [ ] **Step 1: Confirm the fixture calls before writing tests.**
  - Read `f.seedFixtures` in `tests/support/database-fixture.mjs` and confirm it resets the workspace's samples: it deletes the old ones and seeds six again. The rollback check below calls it twice in one fixture.
  - Read `f.act` and confirm its signature, and that it supplies the expected revision itself.
  - If either differs, adapt the calls in Step 2 to the real API and say so in your report. Don't change the fixture.

- [ ] **Step 2: Write the failing checks.**

Replace the header comment at the top of the file (lines 6–10) with:

```js
// The fixture's `intakeVersion` option, samples that follow their
// workspace's version, version-2 samples, a checkpoint reload that clears a
// sample's materials and card marks (part 4c, Task 5), and the switch-over
// that makes version 2 the default (migration 020, OpenSpec change
// make-intake-v2-default, spec client-intake).
```

Below the `missingOf` helper, add:

```js
const columnDefault = async (f) =>
  String(
    (
      await f.sql(
        "select column_default from information_schema.columns where table_schema='public' and table_name='workspaces' and column_name='default_intake_version'",
      )
    ).rows[0].column_default,
  ).trim();

const versionOfCase = async (f, caseId) =>
  Number((await f.sql("select intake_version from public.cases where id=$1", [caseId])).rows[0].intake_version);

const setWorkspaceVersion = (f, version) =>
  f.sql("update public.workspaces set default_intake_version=$2 where id=$1", [f.workspaceId, version]);
```

Replace the subtest `"the column default is still 1 (no switch-over here)"` (lines 60–73) with:

```js
  await t.test("the column default is 2, and a workspace that keeps it is version 2", async () => {
    const f = await createDatabaseFixture({ intakeVersion: null });
    try {
      assert.equal(await columnDefault(f), "2");
      assert.deepEqual(await versionsOf(f), [2, 2]);
    } finally {
      await f.close();
    }
  });
```

After the first top-level `test(...)` block, add:

```js
test("the switch-over (020): new applications are version 2, existing ones keep theirs", async (t) => {
  await t.test("a client's new application is version 2", async () => {
    const f = await createDatabaseFixture({ intakeVersion: null });
    try {
      const { caseId } = await f.createCase(f.applicantA, crypto.randomUUID(), { answers: {} });
      assert.equal(await versionOfCase(f, caseId), 2);
    } finally {
      await f.close();
    }
  });

  await t.test("the office's new assisted application is version 2", async () => {
    const f = await createDatabaseFixture({ intakeVersion: null });
    try {
      const { caseId } = await f.createCase(f.presenter, crypto.randomUUID(), {
        mode: "assisted",
        personId: f.sam,
        answers: {},
      });
      assert.equal(await versionOfCase(f, caseId), 2);
    } finally {
      await f.close();
    }
  });

  await t.test("a version-1 application keeps version 1 after the switch and after an update", async () => {
    const f = await createDatabaseFixture({ intakeVersion: null });
    try {
      await setWorkspaceVersion(f, 1);
      const { caseId } = await f.createCase(f.applicantA, crypto.randomUUID(), { answers: {} });
      assert.equal(await versionOfCase(f, caseId), 1);
      await setWorkspaceVersion(f, 2);
      assert.equal(await versionOfCase(f, caseId), 1, "after the workspace is version 2");
      await f.act(f.applicantA, caseId, null, "SAVE_ANSWERS", { answers: makeSampleAnswers() });
      assert.equal(await versionOfCase(f, caseId), 1, "after an update");
    } finally {
      await f.close();
    }
  });

  await t.test("a reset seeds version-2 samples; set back to 1, the next reset seeds version 1", async () => {
    const f = await createDatabaseFixture({ intakeVersion: null });
    try {
      await f.seedFixtures();
      let rows = await samples(f);
      assert.equal(rows.length, 6);
      for (const row of rows) assert.equal(row.intake_version, 2, row.fixture_key);
      await setWorkspaceVersion(f, 1);
      await f.seedFixtures();
      rows = await samples(f);
      assert.equal(rows.length, 6);
      for (const row of rows) assert.equal(row.intake_version, 1, row.fixture_key);
    } finally {
      await f.close();
    }
  });
});
```

`crypto.randomUUID()` is the global already used in this file. `makeSampleAnswers()` with no arguments gives version-1 answers, as the version-1 tests in this file use it.

- [ ] **Step 3: Run the database suite and see the new checks fail.**

Run: `npm run test:database` (with the PATH prefix).

Expected: FAIL. The following fail because the column default is still 1:
- "the column default is 2…" (`"1" !== "2"`);
- "a client's new application is version 2";
- "the office's new assisted application is version 2";
- the reset check's first loop.

"A version-1 application keeps version 1…" already passes: 011 pins the version, so this check guards behaviour the switch-over must keep. Every other test passes. Record the failing output in your report.

- [ ] **Step 4: Write the migration.**

Create `supabase/migrations/020_intake_v2_default.sql`:

```sql
-- The version-2 switch-over (OpenSpec change make-intake-v2-default, spec
-- client-intake). Version 2 of the client intake becomes the default: the
-- column default for new workspaces, and the setting of every workspace that
-- exists now. New applications, a client's own and the office's Add a case,
-- take the workspace's version through 011's insert trigger, and sample resets
-- follow it through 019, so nothing else changes here. Existing applications
-- keep their version: 011 fixes it on insert and refuses to change it on
-- update.
--
-- This file redefines no function and loads no catalogue. It therefore gives
-- the same result whether it runs before 021 and 022 (a new database) or after
-- them (a database that already has them). Both statements can be applied
-- again. To roll back, a later migration sets the workspaces (and, if wanted,
-- the column default) back to 1; a workspace's next reset then seeds version-1
-- samples.

alter table public.workspaces alter column default_intake_version set default 2;
update public.workspaces set default_intake_version = 2;
```

- [ ] **Step 5: Apply it to the test stack.**

Run: `npm run db:migrate:test`
Expected: exit 0. 020 is applied after 021 and 022, which are already recorded.

Then confirm that no workspace was left at version 1:

```bash
docker exec $(docker ps -q --filter name=supabase_db_vitally-task2) psql -U postgres -tAc "select count(*) from public.workspaces where default_intake_version <> 2; select count(*) from vitally_private.schema_migrations where name='020_intake_v2_default.sql';"
```

Expected: `0`, then `1`. Record both in your report. The database container is `supabase_db_vitally-task2.<suffix>`; the filter finds it. Read-only: run only this `select`.

- [ ] **Step 6: Run the suites.**

Run: `npm test`, then `npm run test:database`.
Expected:
- `npm test` passes as on `main` (923/923).
- `npm run test:database` passes, including the new checks. Record its count, which should be 233 plus the new subtests. Docs need it in Task 2.

- [ ] **Step 7: Commit.**

```bash
git add tests/database-intake-default.mjs supabase/migrations/020_intake_v2_default.sql
git commit -m "Switch-over: version 2 of the intake is the default (migration 020)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Docs and the project rule say version 2 is the default

**Files:**
- Modify: `docs/developer/database.md` (line 25; the migration table, lines ~46–50; the samples note, line ~448)
- Modify: `docs/developer/architecture.md` (the intake-version paragraph, lines ~108–110)
- Modify: `docs/setup.md` (line 310; the migration table, lines ~335–340; the tests table's Database row, line ~395, and its "last-verified" sentence, lines ~387–389)
- Modify: `README.md` (the part-4 row for 4c, line ~51)
- Modify: `docs/design/redesign-review.md` (status date, line 7; the Part 4c bullet, line 15)
- Modify: `CLAUDE.md` (Project rules, the **Versions** bullet)

**Interfaces:**
- **Consumes:** from Task 1, the file name `020_intake_v2_default.sql`, the database suite's observed count, and the commit it was verified at.
- **Produces:** nothing code-facing.

- [ ] **Step 1: `docs/developer/database.md`.**
  - Line 25: "twenty-one plain SQL files" becomes "twenty-two plain SQL files".
  - In the migration table, add this row between `019_fixtures_v2.sql` and `021_review_approved_message.sql`:
    ```
    | `020_intake_v2_default.sql` | The switch-over: version 2 is the default intake version (column default and every workspace). Redefines no function, so it gives the same result before or after 021 and 022. Existing cases keep their version |
    ```
  - In the 021 row, delete the trailing sentence "020 is left free for the version-2 switch-over".
  - In the samples note (line ~448), replace "No migration yet changes a workspace's `default_intake_version`: the switch-over is held for the group's wording review." with "Migration 020 sets every workspace's `default_intake_version` to 2, so a reset seeds these version-2 samples unless a workspace is set back to 1."

- [ ] **Step 1b: `docs/developer/architecture.md`.**
  - In the paragraph that starts "New cases take the workspace's `default_intake_version`." (lines ~108–110), replace "On `main` it is still 1 everywhere, so version 2 is built and tested (parts 4a and 4b) but not reachable yet. Part 4c adds the staff views and the version-2 Add a case, then switches the default to 2." with "Since migration 020 the default is 2 everywhere, so new client applications, the office's Add a case and sample resets are version 2."
  - Keep the rest of the paragraph ("Version-1 cases keep working, and version 1 is removed in its own part once none is open. The design is in…") as it is.

- [ ] **Step 2: `docs/setup.md`.**
  - Line 310: "Twenty-one migrations, applied in order (number 020 is left free for the version-2 switch-over)." becomes "Twenty-two migrations, applied in order. 020, the version-2 switch-over, was added after 021 and 022: a stack that already has them applies it last, and a new one applies it in number order. Both give the same result."
  - In the migration table, add this row between the 019 and 021 rows:
    ```
    | `020_intake_v2_default.sql` | The switch-over: version 2 of the intake is the default. The column default becomes 2 and every workspace is set to 2, so new client and office applications and sample resets are version 2. Existing cases keep their version. Setting a workspace back to 1 is the rollback |
    ```
  - In the 021 row, delete the trailing sentence "Number 020 is left free for the version-2 switch-over".
  - In the tests table's Database row, replace `233/233` with the count Task 1 observed.
  - In the "last-verified" sentence above the table (lines ~387–389), rewrite the whole database clause. Today it reads "and the database count on the final task of part 4d (2026-10-05, at commit `957cbba`), since neither cleanup changed any SQL". That is already wrong, because #57 added 021 and 022. Replace it with "and the database count on the version-2 switch-over (2026-10-12, migration 020 applied after 021 and 022)", using the count Task 1 observed.
  - Leave the unit, auth gate and story clause ("on the cleanup follow-ups (2026-10-10; the story twice…)") as it is, because this change runs neither browser suite.

- [ ] **Step 3: `README.md`.**
  - In the 4c row, "version 2 ready, switch-over held for the wording review" becomes "version 2 the default since the switch-over (migration 020), after the group's wording review".

- [ ] **Step 4: `docs/design/redesign-review.md`.**
  - Line 7: "**Status (updated Oct 5, 2026).**" becomes "**Status (updated Oct 12, 2026).**"
  - In the Part 4c bullet (line 15), replace "Version 2 is ready. The switch-over (migration 020) that makes new cases version 2 is held until the group has reviewed the new wording (decided Oct 4, 2026); it ships as its own small PR. Existing cases keep their version." with "Version 2 is the default: the switch-over (migration 020) shipped after the group reviewed the wording (#48, Oct 12, 2026). Existing cases keep their version."

- [ ] **Step 5: `CLAUDE.md`.** Replace the **Versions** bullet in Project rules:
  - From: `- **Versions:** version 1 of the intake stays as it is until its own removal part. Version 2 is not yet every workspace's default: the switch-over migration waits on the group's wording review.`
  - To: `- **Versions:** version 2 of the intake is every workspace's default (migration 020). Version 1 stays as it is, for the cases created on it, until its own removal change.`

- [ ] **Step 6: Check nothing else still says the switch-over is held.**

Run: `grep -rn -i "switch-over held\|left free for the version-2\|waits on the group's wording review\|Twenty-one migrations\|twenty-one plain\|still 1 everywhere\|No migration yet changes\|is held for the group\|held until the group\|neither cleanup changed any SQL" README.md CLAUDE.md docs --include='*.md' | grep -v "docs/superpowers/"`
Expected: no output. `docs/superpowers/` is history and stays as it is.

- [ ] **Step 7: Run the unit suite.**

Run: `npm test`
Expected: PASS (docs-only change; some source-pin tests read docs).

- [ ] **Step 8: Commit.**

```bash
git add docs/developer/database.md docs/developer/architecture.md docs/setup.md README.md docs/design/redesign-review.md CLAUDE.md
git commit -m "Docs: version 2 is the default since migration 020; 22 migrations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

- **Spec coverage** (`specs/client-intake/spec.md`):
  - Requirement 1, "New applications use intake version 2":
    - its four scenarios are Task 1's column-default check, the "existing workspace" statement checked by Step 5's query, and the client and office case checks.
  - Requirement 2, "An application keeps the version it was created with":
    - its two scenarios are the version-1 check (after the switch, after an update).
  - Requirement 3, "A workspace's version decides its sample cases":
    - both scenarios are the reset check.
- **Tasks.md mapping:**
  - 1.1–1.5 → Task 1 Steps 1–3.
  - 2.1–2.3 → Task 1 Steps 4–6.
  - 3.1–3.3 → Task 2.
- **Names:** `columnDefault`, `versionOfCase` and `setWorkspaceVersion` are defined in Task 1 Step 2 and used only there. `020_intake_v2_default.sql` is the same in both tasks.
