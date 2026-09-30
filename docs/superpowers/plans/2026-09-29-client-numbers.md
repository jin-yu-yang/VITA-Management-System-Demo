# Part 2: Client numbers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every submitted case gets a client number, counted per workspace and season, never reused and never changed. The number is shown on the staff and client screens, and the volunteer board search finds it.

**Architecture:**
- One migration (`010`) adds:
  - `workspaces.current_season`;
  - `cases.season` and `cases.client_number`;
  - a private counter table;
  - `next_client_number()`, which locks the counter row;
  - one `before update` trigger on `cases` that numbers a case as it leaves draft (except to `closed`) and refuses later changes;
  - a backfill.
- `act_submit` is replaced only to put the number in its history detail.
- The browser maps the two columns and the workspace's season. One pair of `ui.mjs` helpers decides how a number (or its absence) reads, and every screen uses them.

**Tech Stack:**
- PL/pgSQL migrations applied by `tools/admin/migrate.mjs`.
- Vanilla ES modules rendering HTML strings.
- `node:test`.
- Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-client-numbers-design.md` (all of it).

## Global Constraints

- **Rules from spec §2:**
  - A number is assigned on submit only: a draft has none, and a refused, rolled-back or closed-without-sending draft gets none.
  - Numbers are counted per (workspace, `current_season`), starting at 1.
  - A number is never reused or changed.
  - Samples draw from the same counter, in `fixture_keys()` order.
- **Display:** `formatClientNumber(n)` gives `"#"` plus the number padded to 3 digits ("#093", "#1000"). A case with no number reads **"Never sent"** when `stage === "closed"`, otherwise **"No number yet"**.
- **Hooks that must not change** (spec §5):
  - `#case-title` text equals the Application ID.
  - `button.board-reference[data-action="open-case"]` holds the Application ID as its text.
  - `#field-board-search` and `#board-search-form`.
  - `.reference-card strong`, `.application-row`, and the `SUBMIT` case action.
- **Suites:** `npm test`, `npm run test:database`, `npm run test:auth-browser` and `npm run test:browser` pass.
  - They run against the local test stack, the Docker Supabase `vitally-task2.M5anE7XP` on 54321 (`.env.test`). Start it with `docker start $(docker ps -aq --filter name=vitally-task2)`.
  - Never run `npx supabase start` from the repo root.
- **Migrations:** apply them with `npm run db:migrate:test` before the database, auth-browser and browser suites. The migrator stores a SHA-256 of every applied file and **refuses a file whose text changed after it was applied** ("Applied migration differs").
  - So `010` is written to be safe to re-apply: `if not exists`, `create or replace`, `drop … if exists` before `add`, and a backfill that only touches unnumbered rows.
  - If `010` must change after it has been applied to the **local test stack**, forget it there and re-apply. First confirm the database container's name with `docker ps --format '{{.Names}}' | grep supabase_db_vitally-task2`; it was `supabase_db_vitally-task2.M5anE7XP` when this plan was written:
    ```bash
    docker exec supabase_db_vitally-task2.M5anE7XP psql -U postgres -c "delete from vitally_private.schema_migrations where name='010_client_numbers.sql'"
    npm run db:migrate:test
    ```
    Never do this against the classroom target.
- **Shell PATH:** prefix node, npm and docker commands with `PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`.
- **CSS:** colors come from `--vt-*` tokens, with no new hex values (`#fff` allowed).
- **Test imports:** a test file that imports a name its module doesn't export fails to load as a whole. When a failing step adds an import, the expected failure is the whole file.
- Only fictional data.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Out of scope** (spec §1):
- The returning-client search (part 6).
- Season settings, the numbers-left warning, and season labels on older numbers (part 7).
- A pool search box.

---

## File map

| File | Change |
|---|---|
| `supabase/migrations/010_client_numbers.sql` (new) | Columns, constraints, counter table, `next_client_number`, trigger, `backfill_client_numbers`, `act_submit` replacement |
| `tests/database-client-numbers.mjs` (new) | The spec §6 database cases |
| `docs/setup.md` | §4 Migrations: ten migrations, and what 010 does |
| `src/supabase-store.mjs` | `mapCase` adds `season`, `clientNumber`; `getWorkspace` adds `currentSeason` |
| `src/ui.mjs` | `formatClientNumber`, `clientNumberLabel`, `clientNumberTag` |
| `src/staff-views.mjs` | Board "Client" column, `matchesBoardSearch`, search label, `caseHeader` line, `historySentence` |
| `src/office-views.mjs`, `src/pool-views.mjs` | The number in queue rows, pool rows and the drawer's case line |
| `src/views.mjs` | `staffScreen` passes `currentSeason`; the print card's number line |
| `src/client-views.mjs` | Progress id-pill and My applications rows |
| `src/styles.css` | `.client-number` and friends |
| Tests | `tests/store.test.mjs`, `tests/ui.test.mjs`, `tests/staff-views.test.mjs`, `tests/office-views.test.mjs`, `tests/pool-views.test.mjs`, `tests/client-views.test.mjs`, `tests/shell.test.mjs`, `tests/browser.mjs` |

---

### Task 1: The migration and its database tests

**Files:**
- Create: `supabase/migrations/010_client_numbers.sql`, `tests/database-client-numbers.mjs`
- Modify: `docs/setup.md` (§4 Migrations)

**Interfaces:**
- Produces:
  - Column `public.workspaces.current_season smallint`.
  - Columns `public.cases.season smallint` and `public.cases.client_number integer`.
  - `vitally_private.next_client_number(uuid) returns table(season smallint, client_number integer)`.
  - `vitally_private.backfill_client_numbers(p_workspace_id uuid default null) returns int` (how many cases it numbered).
  - Trigger `cases_client_number`.
  - The SUBMIT event's `detail.clientNumber`.

- [ ] **Step 1: Read what you are building on.**
  - Read `supabase/migrations/003_action_core.sql` `act_submit` (around lines 180-205). Task 1 replaces it, and its body must stay identical apart from the two marked lines.
  - Read `009_fixtures_and_realtime.sql` `seed_fixtures` (around 317) and `apply_fixture_scenario` (around 179). Confirm that a sample is inserted as `draft` and then updated to its stage (that update is what the trigger numbers), and that its seeded history writes a `SUBMIT` row into `public.case_events`.
  - Read `005_assistance_closure.sql` `act_close_case` (around 175), which may close an unowned draft.
  - Confirm with `grep -n "act_submit" supabase/migrations/*.sql` that 003 holds the only definition.

- [ ] **Step 2: Write the failing database tests** in `tests/database-client-numbers.mjs`. Base them on `tests/database-actions.mjs`:
  - Imports: `createDatabaseFixture` from `./support/database-fixture.mjs`, and `makeSampleAnswers` from `../src/sample-data.mjs`.
  - One top-level `test(...)` with `t.test` subtests.
  - Close the fixture in `finally`, the way the other files do.
  - `f.act(actor, caseId, personId, type, payload)` sends a case action.
  - `f.createCase(actor, actionId, { mode, personId, answers })` creates one.
  - `f.sql(text, values)` runs SQL as the database owner.
  - `f.seedFixtures()` resets the samples.
  - Before writing each case, read how the existing files do a stale-revision send and a `CLOSE_CASE` (for example `grep -n "CLOSE_CASE" tests/database*.mjs`).

  ```js
  const numberOf = async (f, caseId) =>
    (await f.sql("select season,client_number from public.cases where id=$1", [caseId])).rows[0];
  const counter = async (f, season = 2025) =>
    (await f.sql(
      "select last_number from vitally_private.client_number_counters where workspace_id=$1 and season=$2",
      [f.workspaceId, season],
    )).rows[0]?.last_number ?? 0;
  const submittedCase = async (f, actor = f.applicantA) => {
    const created = await f.createCase(actor, crypto.randomUUID(), { answers: {} });
    await f.act(actor, created.caseId, null, "SAVE_ANSWERS", { answers: makeSampleAnswers() });
    await f.act(actor, created.caseId, null, "SUBMIT", { confirmed: true });
    return created.caseId;
  };
  ```

  The subtests (each one self-contained; compare against `counter()` before and after rather than assuming absolute numbers, since other subtests run in the same workspace):
  1. **Submitting assigns the next number.**
     - A new draft has `season` and `client_number` both `null`.
     - After SUBMIT, it has `season = 2025` and `client_number = before + 1`, where `before` is `counter()` read first.
     - The SUBMIT row in `case_events` has `detail.clientNumber` equal to it.
  2. **An assisted submit takes the next number.** `f.createCase(f.presenter, id, { mode: "assisted", personId: f.sam, answers: makeSampleAnswers() })`, then `f.act(f.presenter, caseId, f.sam, "SUBMIT", { confirmed: true })`. Its number is one more than the previous case's.
  3. **A refused submit assigns nothing.**
     - SUBMIT a draft whose answers are incomplete. It's refused `VALIDATION`, the number is still `null`, and `counter()` is unchanged.
     - A stale-revision SUBMIT (follow the existing pattern) likewise leaves the counter unchanged.
  4. **Closing an assisted draft without sending assigns nothing.** Create an assisted draft and close it with `CLOSE_CASE` (existing payload pattern). The stage is `closed`, the number `null`, and the counter unchanged.
  5. **Concurrent submits get distinct consecutive numbers.**
     - Prepare two drafts (applicant A and applicant B, each saved with `makeSampleAnswers()`).
     - Send both SUBMITs with `Promise.all`.
     - Both succeed, and their numbers are `{before + 1, before + 2}` in some order.
  6. **A sample reset never reuses a number.**
     - Call `f.seedFixtures()`, then read the samples' numbers (`select client_number from public.cases where workspace_id=$1 and fixture order by client_number`). They are six consecutive numbers, and ordering the samples by `client_number` matches the `fixture_keys()` order of their `fixture_key`.
     - Reset again. The six new numbers are all higher than the first six.
     - Then a class submission's number is higher than every sample number either reset used.
  7. **A checkpoint keeps the sample's number.** Load a checkpoint on one sample the way `tests/database-fixtures.mjs` does. Its `client_number` is unchanged.
  8. **A season change restarts at 1.**
     - `update public.workspaces set current_season=2026 where id=$1`, then submit a case. It gets `season 2026`, `client_number 1`.
     - An old case keeps its 2025 number.
     - In `finally`, set `current_season` back to 2025.
  9. **Numbers never change.**
     - `f.sql("update public.cases set client_number=client_number+100 where id=$1")` is rejected.
     - Setting `client_number=null, season=null` is rejected.
     - Updating `season` alone is rejected.
     - Assert with `assert.rejects`.
  10. **The counter is private.** Each of these returns `false`:
      - `select has_table_privilege(r,'vitally_private.client_number_counters','select')` and `…'update'`, for `r` in `anon`, `authenticated`, `service_role`;
      - `has_function_privilege(r,'vitally_private.next_client_number(uuid)','execute')`.
  11. **The backfill numbers submitted cases only, in submit order.**
      - With `f.sql`, insert raw case rows into this workspace: two with `stage='received'`, each with a `SUBMIT` row in `case_events`, at 10:00 and 09:00. Copy the column list `seed_fixtures` uses for its insert, with `origin='assisted'` and `owner_user_id null`, and generate references with `vitally_private.new_reference()`. Also insert one with `stage='closed'` and no SUBMIT row.
      - An INSERT doesn't fire the `before update` trigger, so they start unnumbered. Satisfy the `public.cases` constraints in `001_identity_and_cases.sql` (the reference format, `created_by_user_id`, and `cases_origin_owner` for an ownerless row; `created_by_person_id` = Sam's person id works for an assisted row). Read them before writing the insert.
      - Call `select vitally_private.backfill_client_numbers($1)` with the workspace id. It returns 2.
      - The 09:00 case gets `before + 1` and the 10:00 case `before + 2`. The closed case stays `null`, and the counter ends at `before + 2`.
      - Add a second part for samples. Insert two raw sample rows (`fixture=true`, `origin='fixture'`, `fixture_key` `'review_ready'` and `'preparation_ready'`, each with a SUBMIT row, where the `review_ready` one is timed earlier). Backfill numbers `preparation_ready` before `review_ready`, because that is the `fixture_keys()` order, whatever their SUBMIT times. The fixture keys are unique per workspace, so run this part in a workspace whose samples aren't seeded, or delete that workspace's samples first. Read the `fixture_key` constraints in 009 before writing it.
  12. **An applicant reads their own number.** Through applicant A's client (`f.applicantA.from("cases").select("client_number").eq("id", id)`), their submitted case shows its number. Applicant B's same query returns no row (RLS unchanged).

- [ ] **Step 3: Run it to confirm it fails.**
  ```bash
  npm run test:database -- --test-name-pattern="client number"
  ```
  If the pattern flag doesn't pass through npm, run `node --env-file=.env.test --test tests/database-client-numbers.mjs`. Expected: failures on the missing columns (`column "client_number" does not exist`) and the missing functions.

- [ ] **Step 4: Write the migration** `supabase/migrations/010_client_numbers.sql`:

```sql
-- Part 2: client numbers (docs/superpowers/specs/2026-09-29-client-numbers-design.md).
--
-- A submitted case gets the next number in its workspace's current season;
-- numbers are never reused (the counter never goes down, even when a reset
-- deletes the samples) and never change once set.
--
-- Written to be safe to apply again on a local test stack whose
-- schema_migrations row for this file was deleted during development: every
-- statement is `if not exists`, `create or replace`, or a drop-then-add, and
-- the backfill only numbers rows that have no number.

alter table public.workspaces add column if not exists current_season smallint not null default 2025;
alter table public.workspaces drop constraint if exists workspaces_current_season_range;
alter table public.workspaces add constraint workspaces_current_season_range
 check (current_season between 2000 and 2100);

alter table public.cases add column if not exists season smallint;
alter table public.cases add column if not exists client_number integer;
alter table public.cases drop constraint if exists cases_client_number_pair;
alter table public.cases add constraint cases_client_number_pair
 check ((season is null and client_number is null)
     or (season is not null and client_number is not null and client_number > 0));
alter table public.cases drop constraint if exists cases_client_number_key;
alter table public.cases add constraint cases_client_number_key unique (workspace_id, season, client_number);

-- The last number handed out per (workspace, season). Private: only the
-- security-definer functions below read or write it.
create table if not exists vitally_private.client_number_counters (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 season smallint not null,
 last_number integer not null default 0 check (last_number >= 0),
 primary key (workspace_id, season)
);
revoke all on vitally_private.client_number_counters from public, anon, authenticated, service_role;

-- `create or replace` cannot change a function's return type, so a re-apply
-- during development drops the two table-returning functions first. Nothing
-- stores a reference to them: the trigger body names next_client_number by
-- text and resolves it when it runs.
drop function if exists vitally_private.next_client_number(uuid);
drop function if exists vitally_private.backfill_client_numbers(uuid);

-- The next number in the workspace's current season. The UPDATE locks the
-- counter row until the calling transaction ends, so two submits at once
-- queue here and get consecutive numbers; a rollback returns nothing to use.
create or replace function vitally_private.next_client_number(p_workspace_id uuid)
returns table(season smallint, client_number integer)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare v_season smallint;
begin
 select w.current_season into v_season from public.workspaces w where w.id=p_workspace_id;
 if v_season is null then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 insert into vitally_private.client_number_counters as c (workspace_id, season)
  values (p_workspace_id, v_season) on conflict do nothing;
 return query
  update vitally_private.client_number_counters c set last_number = c.last_number + 1
   where c.workspace_id = p_workspace_id and c.season = v_season
   returning c.season, c.last_number;
end;
$$;

-- One trigger for both rules. A number, once set, never changes. A case
-- leaving draft for anything but `closed` is being submitted (or seeded as a
-- sample, which is inserted as a draft and then moved to its stage) and takes
-- the next number. Closing an unowned draft is the one exit that is not a
-- submission, so it takes none.
create or replace function vitally_private.cases_client_number()
returns trigger language plpgsql security definer set search_path='' as $$
declare v record;
begin
 if old.client_number is not null then
  if new.client_number is distinct from old.client_number or new.season is distinct from old.season then
   raise sqlstate 'VT007' using message='VALIDATION';
  end if;
  return new;
 end if;
 if old.stage = 'draft' and new.stage not in ('draft', 'closed') and new.client_number is null then
  select * into v from vitally_private.next_client_number(new.workspace_id);
  new.season = v.season;
  new.client_number = v.client_number;
 end if;
 return new;
end;
$$;
drop trigger if exists cases_client_number on public.cases;
create trigger cases_client_number before update on public.cases
 for each row execute function vitally_private.cases_client_number();

-- Numbers every case that was submitted (a SUBMIT row in its history) or is a
-- sample past draft, and has none yet: samples first in fixture_keys() order,
-- then the rest in the order they were submitted. A
-- closed draft the office never sent has no SUBMIT row and stays unnumbered.
-- `p_workspace_id` null means every workspace. Returns how many it numbered.
create or replace function vitally_private.backfill_client_numbers(p_workspace_id uuid default null)
returns int language plpgsql security definer set search_path='' as $$
declare r record; v record; n int = 0;
begin
 for r in
  select c.id, c.workspace_id
  from public.cases c
  left join lateral (
   select min(e.created_at) as at from public.case_events e
   where e.case_id = c.id and e.action = 'SUBMIT'
  ) s on true
  where c.client_number is null and c.stage <> 'draft'
   and (s.at is not null or c.fixture)
   and (p_workspace_id is null or c.workspace_id = p_workspace_id)
  -- Samples first, in fixture_keys() order, exactly as a reset numbers them:
  -- their seeded SUBMIT times depend on each scenario's history length, so
  -- history order would not match. Then everything else in submit order.
  order by c.workspace_id, (not c.fixture),
   array_position(vitally_private.fixture_keys(), c.fixture_key) nulls last,
   coalesce(s.at, c.created_at), c.reference
 loop
  select * into v from vitally_private.next_client_number(r.workspace_id);
  update public.cases set season = v.season, client_number = v.client_number where id = r.id;
  n = n + 1;
 end loop;
 return n;
end;
$$;

-- act_submit, verbatim from 003 apart from the two lines marked (1) and (2):
-- it reads back the number the trigger assigned and records it in the event.
create or replace function vitally_private.act_submit(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_answers jsonb=p_case.answers;
 v_number integer;
begin
 -- … the body of 003's act_submit copied exactly, from `if p_case.stage<>'draft'`
 --   through the screening check …
 update public.cases set stage='received' where id=p_case.id returning client_number into v_number; -- (1)
 return jsonb_build_object('detail',jsonb_build_object('screening','continue','clientNumber',v_number), -- (2)
  'message','Application received. A volunteer will check your information and documents.');
end;
$$;

select vitally_private.backfill_client_numbers();

revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
```

  All of this except `act_submit` and the backfill function was dry-run against the local test stack while the plan was checked, inside a transaction that rolled back:
  - it compiles, including the `return query update … returning`;
  - two calls return 1 then 2;
  - moving a draft to `received` numbers it;
  - changing the number afterwards is refused with `VALIDATION`.

  The `…` inside `act_submit` means: paste 003's lines from `if p_case.stage<>'draft' then` through the last screening `end if;`, unchanged. Don't retype them; they are the server's submission rules.

- [ ] **Step 5: Apply and run.**
  ```bash
  npm run db:migrate:test
  node --env-file=.env.test --test tests/database-client-numbers.mjs
  ```
  Expected: PASS.
  - If a subtest shows the migration needs a fix, edit `010` and re-apply it with the local forget-and-reapply commands in Global Constraints.
  - If any existing database test compares the SUBMIT event's `detail` exactly (`grep -rn "screening" tests/database*.mjs`), update it to expect `clientNumber` too. That's a deliberate change.

- [ ] **Step 6: Run the whole database suite.**
  - `tests/database-realtime.mjs` (around line 791) asserts that the realtime `workspaces` row has exactly `default_followup_person_id`, `fixture_generation` and `id`. Adding `current_season` breaks it, so update that key list to include `"current_season"`, sorted. This is a deliberate change: the row still says nothing private, since a season is only a year. Extend the comment above it to say so.
  - Then run:
    ```bash
    npm run test:database
    ```
    Expected: all pass (151 before this task, plus the new file).

- [ ] **Step 7: Update `docs/setup.md` §4 Migrations.** "Nine migrations" becomes "Ten migrations". Add a line for `010_client_numbers.sql`, in the style of the others: client numbers per workspace and season, the private counter, the trigger, and the backfill.

- [ ] **Step 8: Commit.**
  ```bash
  git add supabase/migrations/010_client_numbers.sql tests/database-client-numbers.mjs docs/setup.md tests/database*.mjs
  git commit -m "Number every submitted case per workspace and season

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 2: The store and the display helpers

**Files:**
- Modify: `src/supabase-store.mjs`, `src/ui.mjs`
- Test: `tests/store.test.mjs`, `tests/ui.test.mjs`

**Interfaces:**
- Produces:
  - Case objects carry `season: number|null` and `clientNumber: number|null`.
  - `getWorkspace()` returns `currentSeason: number`.
  - From `ui.mjs`:
    - `formatClientNumber(n) → string|null`
    - `clientNumberLabel(record) → string`, one of "#093" / "Never sent" / "No number yet"
    - `clientNumberTag(record) → string`, which is `<span class="client-number">#093</span>`, or `<span class="client-number none">No number yet</span>` (or "Never sent") when there's no number

- [ ] **Step 1: Failing tests.**
  - In `tests/ui.test.mjs` (add the three names to its import):

```js
test("client numbers read as #, padded to three digits", () => {
  assert.equal(formatClientNumber(93), "#093");
  assert.equal(formatClientNumber(1), "#001");
  assert.equal(formatClientNumber(101), "#101");
  assert.equal(formatClientNumber(1000), "#1000");
  assert.equal(formatClientNumber(null), null);
  assert.equal(formatClientNumber(undefined), null);
});

test("a case without a number says why", () => {
  assert.equal(clientNumberLabel({ clientNumber: 93, stage: "received" }), "#093");
  assert.equal(clientNumberLabel({ clientNumber: null, stage: "draft" }), "No number yet");
  assert.equal(clientNumberLabel({ clientNumber: null, stage: "closed" }), "Never sent");
  assert.equal(
    clientNumberTag({ clientNumber: 93, stage: "received" }),
    '<span class="client-number">#093</span>',
  );
  assert.equal(
    clientNumberTag({ clientNumber: null, stage: "closed" }),
    '<span class="client-number none">Never sent</span>',
  );
});
```

  - In `tests/store.test.mjs`, follow its existing `mapCase` / fake-client patterns (read the file first):
    - `mapCase({ …, season: 2025, client_number: 93 })` gives `season: 2025, clientNumber: 93`.
    - A row with nulls gives `null`s.
    - `getWorkspace()` over a fake row `{ id, fixture_generation: 3, default_followup_person_id: null, current_season: 2025 }` returns `currentSeason: 2025`.

- [ ] **Step 2: Run to confirm they fail.**
  ```bash
  node --test tests/ui.test.mjs tests/store.test.mjs
  ```
  Expected: `ui.test.mjs` fails to load (missing exports), and the store assertions fail.

- [ ] **Step 3: Implement.** In `src/ui.mjs`, beside `relativeDay`:

```js
// Client numbers (part 2): "#" and at least three digits. A case without one
// is a draft ("No number yet") or an assisted draft the office closed before
// sending it ("Never sent") — a closed case with no number was never submitted.
export const formatClientNumber = (n) =>
  n === null || n === undefined ? null : `#${String(n).padStart(3, "0")}`;
export const clientNumberLabel = (record) =>
  formatClientNumber(record?.clientNumber) ??
  (record?.stage === "closed" ? "Never sent" : "No number yet");
export const clientNumberTag = (record) =>
  `<span class="client-number${record?.clientNumber == null ? " none" : ""}">${esc(clientNumberLabel(record))}</span>`;
```

  In `src/supabase-store.mjs`:
  - `mapCase` adds `season: row.season ?? null, clientNumber: row.client_number ?? null` after `reviewerId`.
  - `getWorkspace` adds `currentSeason: Number(row.current_season)`.
  - In `src/contracts.mjs`, add `season, clientNumber` to the documented Case shape (the comment around line 79).
  - In `tests/store.test.mjs`, add `season: 2025, client_number: 93` to `CASE_ROW`, so the existing key-list tests cover the new fields.

- [ ] **Step 4: Update the two store tests that pin exact shapes.** Both are deliberate changes:
  - `tests/store.test.mjs` (around line 456) compares `getWorkspace()`'s whole return value. Add `currentSeason: 2025`, and add `current_season: 2025` to that test's fake workspace row.
  - `tests/store.test.mjs` (around lines 480-500) lists the applicant case's keys exactly. Add `"clientNumber"` and `"season"` in sorted position.

- [ ] **Step 5: Run.** `node --test tests/ui.test.mjs tests/store.test.mjs`, then `npm test`. Expected: PASS.

- [ ] **Step 6: Commit.**
  ```bash
  git add src/ui.mjs src/supabase-store.mjs src/contracts.mjs tests/ui.test.mjs tests/store.test.mjs
  git commit -m "Map client numbers and the workspace season; one way to read them

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 3: Staff screens and the board search

**Files:**
- Modify: `src/staff-views.mjs`, `src/office-views.mjs`, `src/pool-views.mjs`, `src/views.mjs`, `src/styles.css`
- Test: `tests/staff-views.test.mjs`, `tests/office-views.test.mjs`, `tests/pool-views.test.mjs`, `tests/admin-views.test.mjs` (if a case-header assertion lives there), `tests/shell.test.mjs`

**Interfaces:**
- Consumes: `formatClientNumber`, `clientNumberLabel`, `clientNumberTag` (Task 2); `record.clientNumber`, `record.season`, and `state.workspace.currentSeason`.
- Produces:
  - `matchesBoardSearch(record, search, currentSeason) → boolean`, exported from `staff-views.mjs`.
  - `filterCases(cases, filters, person, currentSeason = null)` and `boardCounts(cases, filters, person, currentSeason = null)`.
  - `renderStaffBoard(cases, people, ui)` reads `ui.currentSeason`.

- [ ] **Step 1: Failing tests.** In `tests/staff-views.test.mjs`:
  - **`matchesBoardSearch`:**

```js
test("the board search finds a client number in the current season, or an Application ID", () => {
  const c = { reference: "VT-AB2C-DE3F", clientNumber: 93, season: 2025 };
  for (const q of ["93", "093", "#093", " #93 "]) assert.equal(matchesBoardSearch(c, q, 2025), true, q);
  assert.equal(matchesBoardSearch(c, "9", 2025), false);
  assert.equal(matchesBoardSearch(c, "93", 2026), false);
  assert.equal(matchesBoardSearch(c, "93", null), true);
  assert.equal(matchesBoardSearch(c, "ab2c", 2025), true);
  assert.equal(matchesBoardSearch({ reference: "VT-AAAA-AAAA", clientNumber: null }, "93", 2025), false);
});
```

  - **Search through the board:** `renderStaffBoard` with `filters: { search: "093" }` and `currentSeason: 2025` finds a case with `clientNumber: 93` that is on no tab (stage `received`).
  - **Board row:**
    - The first header cell reads `Client`.
    - A row shows `<span class="client-number">#093</span>` before its `button.board-reference`, whose text is still exactly the reference.
    - A draft row shows "No number yet".
  - **Search box:** its `<label>` and placeholder read "Find a client # or Application ID", and it keeps `id="field-board-search"`.
  - **`caseHeader`:**
    - It renders `<div class="case-client-number">Client #093</div>` before the `<h2 id="case-title" …>`, and `#case-title`'s text is still exactly the reference.
    - A draft shows `<div class="case-client-number">No number yet</div>`.
    - It must be a `<div>`, not a `<p>`. `src/styles.css` has `.staff-header p:first-of-type` (PR 4's muted "Acting as" line), and a `<p>` before it would become the first `<p>`, stealing that style.
  - **`historySentence`:** `historySentence({ action: "SUBMIT", actorName: "Sam", detail: { clientNumber: 93 } })` gives `"Sam submitted the application. Client #093 assigned."`, and without `detail.clientNumber` it's unchanged from today.

  In `tests/office-views.test.mjs`:
  - A queue row for a case with `clientNumber: 93` has `<span class="client-number">#093</span>` before its reference button.
  - `logCallDrawerBody`'s case line contains `#093 · VT-…`. Match the drawer's actual case-line markup, where the reference is followed by the stage badge.

  In `tests/pool-views.test.mjs`:
  - The pool's first header reads `Client`.
  - A row shows the number before its reference button.

- [ ] **Step 2: Run to confirm they fail.** `node --test tests/staff-views.test.mjs tests/office-views.test.mjs tests/pool-views.test.mjs`. Expected: `staff-views.test.mjs` fails to load (`matchesBoardSearch` isn't exported), and the rest fail on assertions.

- [ ] **Step 3: Implement.**
  - **`staff-views.mjs`:**
    - Replace `matchesSearch` with:

```js
// A query of digits (optionally after one "#") is a client number, matched
// exactly and only in the current season once the workspace has told us which
// that is (part 7 adds season changes). Anything else is an Application ID.
const CLIENT_NUMBER_QUERY = /^#?(\d+)$/;
export function matchesBoardSearch(record, search, currentSeason = null) {
  const query = String(search ?? "").trim();
  const number = CLIENT_NUMBER_QUERY.exec(query);
  if (number)
    return (
      record?.clientNumber === Number(number[1]) &&
      (currentSeason == null || record?.season === currentSeason)
    );
  return String(record?.reference ?? "").toUpperCase().includes(query.toUpperCase());
}
```

    - Thread `currentSeason` through `filterCases`, `boardCounts` and `renderStaffBoard` (reading `ui.currentSeason`).
    - `boardRow`'s first cell becomes `<th scope="row">${clientNumberTag(record)}<button class="board-reference" …>${esc(record.reference)}</button></th>`, and the header cell becomes `Client`.
    - `searchForm`'s label and placeholder become "Find a client # or Application ID".
    - `caseHeader` puts `<div class="case-client-number">${esc(record.clientNumber == null ? clientNumberLabel(record) : `Client ${formatClientNumber(record.clientNumber)}`)}</div>` first inside the section. Use a `<div>`, not a `<p>`: see the test above.
    - Samples never show "Client #… assigned" in their history, because their seeded SUBMIT detail (009 `fixture_history`) is fixed text with no `clientNumber`. That is expected, not a bug, and the sentence falls back to today's words.
    - `historySentence` appends `` ` Client ${formatClientNumber(n)} assigned.` `` when `code === "SUBMIT"` and `entry?.detail?.clientNumber` is a number.
  - **`office-views.mjs`:** `queueRow`'s client cell puts `clientNumberTag(record)` before the reference button when there is a record. `logCallDrawerBody`'s case line starts with `${esc(clientNumberLabel(record))} · ` before the reference.
  - **`pool-views.mjs`:** the first header becomes `Client`, and each row's first cell puts `clientNumberTag(record)` before its reference button.
  - **`views.mjs` `staffScreen`:** pass `currentSeason: state.workspace?.currentSeason ?? null` into `renderStaffBoard`'s `ui`.
  - **`src/styles.css`**, in a block marked `/* Part 2: client numbers */` … `/* end part 2 */`:

```css
.client-number {
  display: block;
  font-weight: 700;
  font-size: 14px;
  color: var(--vt-ink);
}
.client-number.none {
  font-weight: 400;
  font-style: italic;
  font-size: 12px;
  color: var(--vt-muted);
}
.case-client-number {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vt-muted);
}
```

  Add a `tests/shell.test.mjs` check that the block exists and has no hex other than `#fff`, following the PR 4 block test.

- [ ] **Step 4: Run.** The focused tests, then `npm test`. Expected: PASS. Update any existing assertion that pinned the old "Application ID" header text or the old search label: these are deliberate changes.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/ tests/
  git commit -m "Show client numbers on the staff screens and find them from the board

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 4: Client screens

**Files:**
- Modify: `src/client-views.mjs`, `src/views.mjs` (the `print` dialog), `src/styles.css`
- Test: `tests/client-views.test.mjs`, `tests/shell.test.mjs`

**Interfaces:**
- Consumes: `formatClientNumber` and `record.clientNumber` (Task 2).

- [ ] **Step 1: Failing tests.** In `tests/client-views.test.mjs`:
  - **Progress page:** `progressScreen` for a submitted case with `clientNumber: 93` shows, inside `.id-pill`, a second entry `<small>CLIENT NUMBER</small><strong>#093</strong>` after the Application ID. A case without a number has no `CLIENT NUMBER` entry.
  - **My applications:** a row for a case with `clientNumber: 93` contains `<span class="application-number">#093</span>`. A draft row has no `application-number`.

  In `tests/shell.test.mjs`:
  - `dialog({ dialog: "print", savedCase: { reference: "VT-AB2C-DE3F", clientNumber: 93 } })` contains `CLIENT NUMBER` and `#093`.
  - Without a number, it contains neither.

- [ ] **Step 2: Run to confirm they fail.** `node --test tests/client-views.test.mjs tests/shell.test.mjs`.

- [ ] **Step 3: Implement.**
  - **`progressScreen`:** keep the Application ID first in `.id-pill`. The story's `readClientPlace` (`tests/support/story-pages.mjs` around line 699) reads the **first** `.id-pill strong` as the Application ID. So inside `.id-pill`, *after* the Application ID `<div>`, add ``${when(record.clientNumber != null, `<div><small>CLIENT NUMBER</small><strong>${esc(formatClientNumber(record.clientNumber))}</strong></div>`)}``.
  - **`applicationRow`:** after `.application-reference`, add ``${when(entry.clientNumber != null, `<span class="application-number">${esc(formatClientNumber(entry.clientNumber))}</span>`)}``.
  - **The `print` dialog in `views.mjs`:** after `<b>${esc(state.savedCase?.reference)}</b>`, add `` `<span>CLIENT NUMBER</span><b>${esc(formatClientNumber(…))}</b>` `` when there's a number.
  - **CSS:** add to the part 2 block `.client-shell .id-pill` spacing for two entries, and `.application-number { font-weight: 700; color: var(--vt-intake-ink); }`. Check `.print-card b` already styles the second `b`.
  - The reference screen shown right after starting (`referenceScreen`, a draft) is unchanged. It has no number yet.

- [ ] **Step 4: Run.** The focused tests, then `npm test`. Expected: PASS.

- [ ] **Step 5: Commit.**
  ```bash
  git add src/ tests/
  git commit -m "Show the client their number once the application is submitted

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 5: Browser story, all four suites, docs

**Files:**
- Modify: `tests/browser.mjs` (and `tests/support/story-pages.mjs` if a helper helps), `docs/design/redesign-review.md` (status line), `docs/design/README.md`
- Add: `docs/design/screens/implemented-client-numbers-board.png`, `implemented-client-numbers-progress.png`

- [ ] **Step 1: Add to the story.**
  - In the phase "a new application is submitted and reaches the staff board", applicant A submits, and the phase then runs `findOnBoard(staff, classReference)`. The case is at `received`, which is on no board tab, so its row is only visible through that search.
  - Put the new steps **after** that call, and end them by running `findOnBoard(staff, classReference)` again, so the rest of the phase starts from exactly the state it had:
  1. Read the client number from the client window's `.id-pill` (the `strong` after `CLIENT NUMBER`), matching `/^#\d{3,}$/`.
  2. Assert the class case's row in the staff window carries the same `.client-number` text.
  3. Search the volunteer board for that number without the `#` (for example "093"), using the existing search form (`#field-board-search`, `#board-search-form button[type="submit"]`), and wait for exactly one `button.board-reference` with the class reference.
  4. Run `findOnBoard(staff, classReference)` again, which restores the search the rest of the phase expects.
  5. Record `evidence.story.clientNumber`.

  Read the phase before editing, and keep its evidence and `shoot` calls.

- [ ] **Step 2: Run all four suites.**
  ```bash
  npm run db:migrate:test
  npm test
  npm run test:database
  npm run test:auth-browser
  npm run test:browser
  ```
  Run them in the foreground, with long timeouts, output to `/tmp`. Expected: all PASS.
  - If `test:browser` fails in a part this plan doesn't touch, re-run once and report both runs. A known unrelated flake: "a press reached nothing at all and had to be sent again".

- [ ] **Step 3: Screenshots.** Copy the story's `artifacts/browser/*--staff-board-six-cases-720.png` to `docs/design/screens/implemented-client-numbers-board.png`, and `*--progress-action-needed-720.png` to `implemented-client-numbers-progress.png`. Take both from the same engine pairing, and look at each first to confirm the numbers show.

- [ ] **Step 4: Docs.**
  - In `docs/design/README.md`, add beside the other Implemented rows:
    ```markdown
    | Implemented (part 2): client numbers on the work board and the client's progress page | [board](screens/implemented-client-numbers-board.png) · [progress](screens/implemented-client-numbers-progress.png) |
    ```
  - In `docs/design/redesign-review.md`, update the status line: part 1 merged, and part 2 (client numbers) in review.

- [ ] **Step 5: Commit.** Don't push; the finishing step does.
  ```bash
  git add tests/ docs/
  git commit -m "Walk client numbers through the browser story; screenshots and status

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
