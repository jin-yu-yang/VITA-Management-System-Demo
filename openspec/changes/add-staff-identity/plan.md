# Staff Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Check off the matching `tasks.md` items as each task completes.

**Goal:** Add a `staff` membership linked to one person, so a staff member signs in as themselves and the database, not the browser, decides who is acting. Presenters and clients are unchanged.

**Architecture:**
- One hand-written migration, `032_staff_identity.sql`:
  - a new access value, `staff`, and a nullable `people.user_id`;
  - a resolver, `vitally_private.acting_person`, that every public RPC taking `p_person_id` calls first, before its digest and receipt;
  - every check that grants staff behaviour widened from `'presenter'` to `('presenter','staff')`.
- The roster creates staff through two new private functions inside the existing setup transaction.
- The browser treats `staff` as staff with a fixed acting person and no demo tools.

**Tech Stack:**
- PostgreSQL 17 on Supabase (RLS, plpgsql `security definer` functions, Realtime);
- `@supabase/supabase-js` 2.116.0;
- plain browser ES modules;
- Node 24 `node:test`, `pg`, Playwright 1.63.

**Spec:** `openspec/changes/add-staff-identity/` — `design.md` (decisions D1–D10), `specs/sign-in/spec.md`, `specs/staff-case-work/spec.md`, `tasks.md`. Read `design.md` D3 (the resolver table) and D5 before any database task.

## Global Constraints

- **Migrations:** never edit an applied migration (`001`–`031`). Every changed function or policy is redefined in `032_staff_identity.sql`, copied from its **newest** `create or replace` in any migration, with only the intended lines changed.
- **Unchanged signatures:** `vitally_apply_action(uuid,uuid,bigint,uuid,text,jsonb)`, `vitally_assistance_action(uuid,uuid,bigint,uuid,text,text)`, `vitally_create_case(uuid,text,uuid,jsonb)`, `vitally_log_contact(uuid,uuid,uuid,uuid,jsonb)`, `vitally_edit_contact(uuid,uuid,bigint,uuid,jsonb)`.
- **Error codes:** `VT001` FORBIDDEN, `VT002` NOT_FOUND, `VT003` CONFLICT, `VT004` INVALID_TRANSITION, `VT007` VALIDATION. A refusal leaves no receipt.
- **Values:**
  - access values: exactly `applicant`, `presenter`, `staff`;
  - capabilities: exactly `prepare`, `review`, `admin`, `followup`, `receive_documents`, `assist`;
  - reserved person keys: `alex`, `morgan`, `sam`;
  - person key pattern: `^[a-z][a-z0-9_]{0,39}$`; name: 1–80 characters.
- **Private functions** are `security definer set search_path=''` and revoked from `public, anon, authenticated, service_role`.
- **The browser** sends `p_person_id: null` for staff. Staff screens stay English. No client text changes, so no `build:hant` work.
- **Fictional data only.** Example staff are "Riley Park" (`riley`, `prepare`) and "Jordan Lee" (`jordan`, `review`). Test addresses use `@vitally.invalid`. Never print an address in roster output.
- **Local stack only.** Never run `supabase start` from the repo root.
- **Commits:** end each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A deactivated staff membership** (`active=false`) must lose all access at once: RPCs return `VT001`, and reads return no rows. Test in Task 2.
2. **Another account's action id:** a staff member replaying an action id that a presenter used must not get the presenter's receipt (receipts are keyed per `actor_user_id`). Test in Task 3.
3. **A persona stored in a presenter window that now names a staff person** must produce a refusal the browser shows as an error, not a crash or a silent act-as-someone. Test in Task 9.
4. **Roster addresses with different case or spaces** (`" Riley@Example.org"` and `"riley@example.org"`) are the same address across `presenters`, `applicants` and `staff`. Test in Task 6.
5. **Sam's open follow-ups after a staff member becomes the default:** only the assignee may act on a follow-up (`lock_open_followup`, 004:356), so a staff member with `followup` acting on Sam's open follow-up is refused with `VT001`, exactly as a presenter acting as anyone but Sam is. That task stays Sam's until resolved. New escalations go to the staff member. Test in Task 5.

---

### Task 1: Staff fixture helper and the failing staff-identity suite

**Files:**
- Modify: `tests/support/database-fixture.mjs` (inside `createDatabaseFixture`, after the actor loop near line 640)
- Create: `tests/database-staff-identity.mjs`

**Interfaces:**
- Consumes: `createDatabaseFixture`, `f.act`, `f.createCase`, `f.readyCase`, `f.logContact`, `f.editContact`, `f.actAssistance`, `f.receiptsFor`, `f.sql`, `f.withSetupLock`, `applyArgs`, `rejected`. Sessions use `signInWithPassword`, as the existing actor loop does.
- Produces: `f.staff({ key, name, capabilities }) -> Promise<{ client, userId, personId, email }>`. It creates a confirmed `@vitally.invalid` account (tracked in `run.users` for cleanup), then calls `select vitally_private.add_staff_member($1,$2,$3,$4,$5::text[])` with `(f.workspaceId, userId, key, name, capabilities)` inside `f.withSetupLock`, and signs the client in.

- [ ] **Step 1: Add `f.staff`** as specified. Reuse the actor loop's account-creation code; extract a local `provision()` from it rather than duplicating it.
- [ ] **Step 2: Write `tests/database-staff-identity.mjs`.** One fixture per file, as `tests/database-contacts.mjs` does. Name the tests after the spec scenarios. Assertions to include, with exact values:

```js
test("a staff call with no person acts as its own person", async () => {
  const riley = await f.staff({ key: "riley", name: "Riley Park", capabilities: ["prepare"] });
  const { caseId } = await f.readyCase();
  const receipt = await f.act(riley.client, caseId, null, "CLAIM_PREPARATION", {});
  const row = (await f.sql("select preparer_id from public.cases where id=$1", [caseId])).rows[0];
  assert.equal(row.preparer_id, riley.personId);
  const actor = (await f.sql(
    "select actor_person_id from public.action_receipts where action_id=$1", [receipt.actionId])).rows[0];
  assert.equal(actor.actor_person_id, riley.personId);
});
test("a staff call naming someone else is FORBIDDEN with no receipt", async () => { /* send f.alex; then another staff member's personId; expect VT001 via rejected("VT001") and f.receiptsFor(id) === 0 */ });
```

  Cover every scenario in both specs:
  - **`sign-in`:**
    - access values (`insert ... access='admin'` fails with `23514`);
    - commit refused for a staff membership without a person, and for a person linked to a presenter: run both inside `begin ... commit` through `f.sql`, expecting an error at `commit`;
    - each entry point with null and with another person's id;
    - capabilities still apply (Riley closing a case: `VT001`);
    - replay with null and then with its own id returns the same receipt;
    - a presenter naming Riley's person: `VT001`; a presenter naming `f.alex` still works;
    - a client naming a person: `VT001`;
    - `vitally_reset_fixtures` and `vitally_load_checkpoint` as staff: `VT001`.
  - **`staff-case-work`:**
    - Riley prepares and Jordan reviews, with `case_events.actor_person_id` naming each, and `actor_user_id` naming each one's own account;
    - Riley, with `["prepare","review"]`, cannot `CLAIM_REVIEW` a case Riley prepared; Jordan can;
    - for each table in `STAFF_TABLES` (import it from `src/supabase-store.mjs`), the row ids Riley reads equal the ids `f.presenter` reads, and a private draft of `f.applicantA` is invisible to both;
    - a Realtime insert reaches Riley's channel, following `tests/database-realtime.mjs`.
  - **Roster functions:**
    - `add_staff_member` repeated with identical values returns the same person id;
    - it refuses `sam` (`VT007`), changed name or capabilities (`VT007`), `["prepare","teach"]` (`VT007`), and a user with an active membership elsewhere (`VT007`);
    - `set_default_followup` refuses a person without `followup` (`VT007`);
    - after it, an `ESCALATE_CONTACT` assigns to the staff member, while Sam's existing open follow-up keeps `assignee_person_id = f.sam`;
    - `initialize_workspace` re-run through `f.withSetupLock` succeeds once staff exist.
  - **Review Focus 1:** set the staff membership `active=false` through `f.sql`; then any RPC is `VT001`, and `select` on `cases` returns `[]`.
- [ ] **Step 3: Run it and confirm it fails.** Run `node --env-file=.env.test --test tests/database-staff-identity.mjs`. Expected: FAIL. `add_staff_member` does not exist (`42883`).
- [ ] **Step 4: Commit:** `git add tests/support/database-fixture.mjs tests/database-staff-identity.mjs && git commit -m "Staff identity: database tests first (add-staff-identity 1.1-1.4)"`.

### Task 2: Migration part 1 — the presenter inventory and the schema

**Files:**
- Create: `supabase/migrations/032_staff_identity.sql`

**Interfaces:**
- Produces:
  - `people.user_id uuid null`, unique per workspace (`unique(workspace_id,user_id)`), with `foreign key(workspace_id,user_id) references public.memberships(workspace_id,user_id)`;
  - `memberships.access` check `in ('applicant','presenter','staff')`;
  - the constraint trigger function `vitally_private.check_staff_links() returns trigger`, attached as `deferrable initially deferred` `after insert or update` on `public.memberships` and `public.people`.

- [ ] **Step 1: Run the inventory.** `grep -n "'presenter'" supabase/migrations/*.sql`. For each hit, find the newest definition holding it. Write a header comment listing each object as "accepts staff" or "stays presenter-only". Stays presenter-only: `vitally_reset_fixtures`, `vitally_load_checkpoint`, `seed_fixtures`.
- [ ] **Step 2: Write the schema section.** `check_staff_links` raises `VT007` VALIDATION when a person's `user_id` points at a membership whose access is not `staff`, or when a `staff` membership has zero linked people. More than one is already impossible, because of `unique(workspace_id,user_id)`.
- [ ] **Step 3: Apply and run.** `npm run db:migrate:test`, then `node --env-file=.env.test --test tests/database-staff-identity.mjs`. Expected: the access-value and commit-refusal tests pass; the rest still fail.
- [ ] **Step 4: Commit:** `"032 part 1: staff access and people.user_id (add-staff-identity 2.1-2.2)"`.

### Task 3: Migration part 2 — resolve the acting person at every entry point

**Files:**
- Modify: `supabase/migrations/032_staff_identity.sql`

**Interfaces:**
- Produces: `vitally_private.acting_person(p_member public.memberships, p_person_id uuid) returns public.people`. It returns a row of nulls for an applicant, and raises `VT001` per design D3's table.
  - A presenter: an existing person in `p_member.workspace_id` with `user_id is null`.
  - A staff member: the person `where workspace_id=p_member.workspace_id and user_id=p_member.user_id`, and `p_person_id` must be null or equal its id.
- Redefined (copied from source; the only change is `v_person := vitally_private.acting_person(v_member, p_person_id)` right after `require_membership()`, then `v_person.id` in place of every later use of `p_person_id`, including the digest and `reserve_receipt`):
  - `vitally_apply_action` (017:540);
  - `vitally_assistance_action` (005:283; 017 only re-grants it);
  - `vitally_create_case` (023, including the assisted branch's capability lookup);
  - `vitally_log_contact` and `vitally_edit_contact` (031). Their inline `access<>'presenter' or p_person_id is null` checks become `access not in ('presenter','staff') or v_person.id is null`.

- [ ] **Step 1: Add the test** for Review Focus 2 to `tests/database-staff-identity.mjs`. Riley calls `vitally_apply_action` with an `action_id` the presenter already used. Riley's call is judged as Riley's own new request, and never returns the presenter's receipt.
- [ ] **Step 2: Write `acting_person`** and the five redefinitions. Diff each against its source with `git diff --no-index` on extracted bodies; only the lines named above may differ.
- [ ] **Step 3: Apply and run** the suite. Expected: the entry-point, replay, presenter and client tests pass.
- [ ] **Step 4: Commit:** `"032 part 2: acting_person at every entry point (add-staff-identity 2.3)"`.

### Task 4: Migration part 3 — staff behaviour in locks, authority and policies

**Files:**
- Modify: `supabase/migrations/032_staff_identity.sql`

**Interfaces:**
- Redefined with `access in ('presenter','staff')` in place of `access='presenter'` (or `<>'presenter'` becomes `not in`), and nothing else changed:
  - `check_operation_authority` (018:17);
  - `lock_case` (003:42);
  - `lock_assistance_item` (005:198);
  - `contact_person` (031:194).
- Every policy the inventory marked "accepts staff": `drop policy` then `create policy` with the same name, the same `for select to authenticated`, and the widened condition.

- [ ] **Step 1: Write the redefinitions and the policies.**
- [ ] **Step 2: Apply.** Run `npm run db:migrate:test`, then `npm run test:database`. Expected: the visibility, Realtime, independence and attribution tests pass, and every existing database suite still passes.
- [ ] **Step 3: Commit:** `"032 part 3: staff accepted by locks, authority and policies (add-staff-identity 2.4)"`.

### Task 5: Migration part 4 — staff creation, follow-up default, re-runnable setup

**Files:**
- Modify: `supabase/migrations/032_staff_identity.sql`
- Modify: `tests/support/rpc-signatures.mjs`

**Interfaces:**
- Produces:
  - `vitally_private.add_staff_member(p_workspace_id uuid, p_user_id uuid, p_person_key text, p_name text, p_capabilities text[]) returns uuid`. It returns the person id. It inserts the `staff` membership and the linked person, returns the existing id when both match exactly, and otherwise raises `VT007`. That covers a reserved key, a pattern or name length violation, unknown capabilities, an existing key or user with different values, and an active membership in another workspace.
  - `vitally_private.set_default_followup(p_workspace_id uuid, p_person_key text) returns uuid`. It raises `VT007` unless the person exists, has `user_id`, and has `followup`.
  - `vitally_private.initialize_workspace(uuid,uuid[],uuid[],jsonb)` redefined from 001. The `count(*)<>3` check becomes "Alex, Morgan and Sam exist with their seeded name and capabilities". The re-run default check accepts any default person with `followup`. It does not overwrite a non-Sam default on a re-run.

- [ ] **Step 1: Add the Review Focus 5 test.** Escalate a request so Sam has an open follow-up, then `set_default_followup` to a staff member with `followup`. That staff member's `RESOLVE_FOLLOWUP` on Sam's task is `VT001` with no receipt. Sam (as the presenter) can still resolve it. A new escalation is assigned to the staff member.
- [ ] **Step 2: Write the three functions.**
- [ ] **Step 3: Update `tests/support/rpc-signatures.mjs`.** No public signature changed. Add assertions that `add_staff_member` and `set_default_followup` cannot be called by `f.anonymous` or `f.presenter` (`42501` or not found through PostgREST).
- [ ] **Step 4: Apply and run.** `npm run db:migrate:test`, then `npm run test:database`. Expected: every test passes, the new suite included.
- [ ] **Step 5: Commit:** `"032 part 4: add_staff_member, set_default_followup, re-runnable setup (add-staff-identity 2.5-2.7)"`.

### Task 6: Roster and workspace setup

**Files:**
- Modify: `tools/admin/roster.mjs` (`parseRoster` :47, `applyRoster` :110, `main` output)
- Modify: `tools/admin/workspace-setup.mjs`
- Modify: `tools/admin/roster.example.json`
- Test: `tests/roster.test.mjs`

**Interfaces:**
- Consumes: Task 5's `add_staff_member` and `set_default_followup`.
- Produces:
  - `parseRoster(raw) -> { workspaceId, presenters, applicants, staff: [{ email, name, personKey, capabilities }], defaultFollowup: string|null, sampleCaseOwners }`;
  - `initializeWorkspace({ workspaceId, presenterUserIds, applicantUserIds, fixtureClientBindings, staff: [{ userId, personKey, name, capabilities }], defaultFollowup, target })`;
  - `applyRoster` returns its current object plus `staff: <count>`.

- [ ] **Step 1: Write the failing tests** in `tests/roster.test.mjs`:
  - a staff entry parses;
  - `presenters` may be absent when `staff` is non-empty;
  - clients only throws `"The roster needs at least one presenter or staff member."`;
  - `personKey: "sam"` throws;
  - a duplicate `personKey` throws;
  - an address listed in both `presenters` and `staff` throws;
  - `"teach"` throws;
  - `defaultFollowup` naming no entry, or an entry without `followup`, throws;
  - Review Focus 4: `" Riley@Example.org"` in `staff` and `"riley@example.org"` in `applicants` throws as a duplicate;
  - `applyRoster` with a fake `admin` creates staff accounts and passes `staff` user ids to `initialize`;
  - no thrown message or return value contains an address.
- [ ] **Step 2: Run `npm test`** and confirm it fails.
- [ ] **Step 3: Implement.**
  - `parseRoster` normalises staff emails with the existing `addresses()` rules.
  - `applyRoster` provisions staff accounts in the same loop as presenters.
  - `initializeWorkspace` calls `add_staff_member` for each staff entry, then `set_default_followup` when given, on the same `connection` after `initialize_workspace` and before `afterInitialize`.
  - `roster.example.json` adds `"staff": [{ "email": "staff-a@example.org", "name": "Riley Park", "personKey": "riley", "capabilities": ["prepare"] }]`.
  - `main`'s summary line adds `<n> staff`.
- [ ] **Step 4: Run** `npm test` (expected PASS). Then run `node --env-file=.env.test tools/admin/roster.mjs --target test --roster <a scratch roster with one staff entry>` twice. The second run reports `0 account(s) created`.
- [ ] **Step 5: Commit:** `"Roster: staff list, optional presenters, defaultFollowup (add-staff-identity 3.1-3.4)"`.

### Task 7: Store and contracts

**Files:**
- Modify: `src/contracts.mjs` (:84 principal comment and any access enum)
- Modify: `src/supabase-store.mjs` (:43 `SUBSCRIBED_TABLES`, :314 `access`, :316 `requirePresenter`, `getPrincipal` :329, :390, :444)
- Test: `tests/store.test.mjs`

**Interfaces:**
- Produces:
  - `getPrincipal() -> { userId, workspaceId, access: 'applicant'|'presenter'|'staff', email, personId: string|null, personName: string|null }`. For staff, read `people` `where user_id = user.id`; otherwise both are null.
  - `SUBSCRIBED_TABLES.staff === STAFF_TABLES`.
  - A local `isStaffAccess(access) -> boolean` (presenter or staff) used at :390 and :444.
  - `requirePresenter` stays presenter-only.
  - Every RPC call passes `p_person_id: principal.access === 'staff' ? null : request.personId ?? null`.

- [ ] **Step 1: Write failing tests** with the fake client `tests/store.test.mjs` already uses:
  - a staff principal carries `personId` and `personName`;
  - a staff case list reads the staff tables;
  - a staff RPC sends `p_person_id: null` even when the request names a person;
  - `resetFixtures` as staff throws `VT001`.
- [ ] **Step 2: Run `npm test`**, confirm the failures, implement, run `npm test` again. Expected: PASS.
- [ ] **Step 3: Commit:** `"Store: staff principal, staff tables, no person claimed (add-staff-identity 4.1)"`.

### Task 8: Controller and window state

**Files:**
- Modify: `src/controller.mjs` (:706 `presenter`, :1246 `selectPerson`, :2015 acting person, :2425 `resetFixtures`, :2451 `loadCheckpoint`)
- Modify: `src/window-state.mjs`
- Test: `tests/controller.test.mjs`, `tests/window-state.test.mjs`

**Interfaces:**
- Consumes: Task 7's principal.
- Produces:
  - `staffWindow() -> boolean` (presenter or staff) replaces `presenter()` wherever staff behaviour is decided. `presenter()` remains for the demo tools and the persona picker.
  - `actingPersonId() -> string|null`: `principal.personId` for staff, `state.selectedPersonId` for a presenter, null otherwise.
  - `selectPerson`, `resetFixtures` and `loadCheckpoint` refuse staff with `FORBIDDEN`.
  - Window state neither writes nor restores `selectedPersonId` when `access === 'staff'`.

- [ ] **Step 1: Write failing tests:**
  - a staff controller's actions carry the staff person;
  - `selectPerson` as staff is refused and changes nothing;
  - a restored window state holding `selectedPersonId` is ignored for staff;
  - a presenter controller behaves as before (the existing tests stay green).
- [ ] **Step 2: Run `npm test`**, implement, run `npm test`. Expected: PASS.
- [ ] **Step 3: Commit:** `"Controller: staff windows act as their own person (add-staff-identity 4.2)"`.

### Task 9: Screens

**Files:**
- Modify: `src/views.mjs` (:130 shell, :196–206 the "Acting as" account row), `src/app.mjs` (:198, :592, :1103, :1120, :1307), `src/language.mjs` (:42), `src/presenter-views.mjs` (:70 `renderPresenterPanel`)
- Test: `tests/presenter.test.mjs`, `tests/shell.test.mjs`, `tests/language.test.mjs`, `tests/client-language.test.mjs`

**Interfaces:**
- Consumes: `staffWindow()` from Task 8, and the principal's `personName`.
- Produces:
  - for staff, the sidebar account row shows `<strong>{personName}</strong><small>Signed in as this volunteer</small>`;
  - `renderPresenterPanel` returns `""` for staff, as it does for clients, so no picker, checkpoint, reset or "Fill fictional details" appears;
  - `viewLang` returns `"en"` for staff;
  - routing, the staff toast style and the staff-only draft buttons use staff-or-presenter.

- [ ] **Step 1: Write failing tests:**
  - a staff shell shows "Riley Park" and "Signed in as this volunteer", and no `data-action="open-reset-fixtures"`, `"open-checkpoint"` or persona buttons;
  - `viewLang({ principal: { access: "staff" }, lang: "zh-Hans" }) === "en"`;
  - Review Focus 3: a presenter whose stored persona is refused with `VT001` shows the refusal in the existing error banner, and the window stays usable.
- [ ] **Step 2: Run `npm test`**, implement, run `npm test`. Expected: PASS.
- [ ] **Step 3: Commit:** `"Screens: staff accounts get the staff shell without demo tools (add-staff-identity 4.3-4.4)"`.

### Task 10: Browser story

**Files:**
- Modify: `tests/support/database-fixture.mjs` (if the story needs staff with emails: `f.staff` already returns `email`), `tests/support/browser-fixture.mjs`, `tests/support/story-pages.mjs`, `tests/browser.mjs`

**Interfaces:**
- Consumes: `f.staff`, `loginTestUser({ page, actor, fixture, otp, heading })`.
- Produces: `readSignedInAs(page) -> Promise<string>` in `story-pages.mjs`.

- [ ] **Step 1: Write the staff-identity phase** in `tests/browser.mjs`, run in both engine permutations like the existing phases:
  - Riley and Jordan sign in through the real form in separate windows;
  - each shows "Signed in as", with no "Acting as" buttons and no reset or checkpoint;
  - Riley claims and submits a case, Jordan's board updates without a reload, and Jordan claims and approves it;
  - the case History tab names Riley Park and Jordan Lee for their steps;
  - Riley's "Claim review" on a case Riley prepared is refused;
  - a `selectedPersonId` written into Riley's window storage before sign-in is ignored.
- [ ] **Step 2: Run** `npm run test:auth-browser`, then `npm run test:browser` (about 17 minutes). Expected: every test passes; 61 existing plus the new phase's tests.
- [ ] **Step 3: Commit:** `"Story: two staff accounts work one case (add-staff-identity 5.1-5.3)"`.

### Task 11: Documentation

**Files:**
- Modify: `docs/developer/database.md`, `docs/developer/architecture.md`, `docs/developer/frontend.md`, `docs/developer/backend.md`, `docs/developer/production-roadmap.md`, `docs/developer/README.md`, `docs/setup.md`

- [ ] **Step 1: Write the docs.**
  - `database.md`: the `staff` access, `people.user_id`, `acting_person` with design D3's table, the two private functions, the commit-time check, and a `032` row in the migrations table ("thirty-two" in its count sentence).
  - `architecture.md` and `frontend.md`: who can see what for staff; the principal's `personId` and `personName`; `staffWindow()` and `actingPersonId()`.
  - `backend.md`: the roster's `staff` list and `defaultFollowup`, and an example; replace "There is no CI" (line ≈151) with what `.github/workflows/ci.yml` runs.
  - `setup.md`: adding a fictional staff rehearsal account, and that its codes arrive in Mailpit.
  - Roadmap §1: real staff accounts exist; visibility, roles and presenter removal remain.
  - README glossary: Membership (three access types), Person / persona, Capability.
- [ ] **Step 2: Check.** `npx openspec validate --all` passes, and no document under `docs/superpowers/` changed (`git diff --stat -- docs/superpowers` is empty).
- [ ] **Step 3: Commit:** `"Docs: staff accounts (add-staff-identity 6.1-6.4)"`.

### Task 12: Final checks

- [ ] **Step 1: Run the build checks.** `npm test`, `npm run build:hant -- --check`, then `npm run build:intake` followed by `git status --porcelain` (expected empty), and `npx openspec validate --all`.
- [ ] **Step 2: Run the stack suites.** `npm run db:migrate:test`, `npm run test:database`, `npm run test:auth-browser`, `npm run test:browser`. Record the counts against the baseline from `main` on 2026-10-18 (unit 1120, database 272, sign-in 20, browser 61): each total grows by the new tests, with zero failures.
- [ ] **Step 3: Check off** tasks.md 7.1–7.2 and commit: `"tasks.md: final checks (add-staff-identity 7)"`.
