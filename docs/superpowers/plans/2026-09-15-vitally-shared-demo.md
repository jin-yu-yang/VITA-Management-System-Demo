# ViTally Shared Classroom Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing local prototype into a classroom-only, multi-case ViTally demo with real email access, shared browser state, and connected admin/preparer/reviewer workflows.

**Architecture:** Retain the plain JavaScript interface and local asset server. Put browser data access behind one Supabase adapter; database policies and transactional functions enforce identity, ownership, claims, and transitions. Real class-client authentication is separate from presenter-authorized fictional staff personas.

**Tech Stack:** Node v24.21.0, browser ES modules, Supabase Auth/PostgreSQL/Realtime, Supabase JavaScript SDK, esbuild for a browser bundle, Node test runner, Playwright Chrome and Firefox, SQL integration tests against a separate test Supabase project or isolated local Supabase instance.

**Spec:** [Approved design](../specs/2026-09-15-vitally-shared-demo-design.md). Read the entire spec before executing; this plan implements its revised class-access model.

## Global Constraints

- Product name: ViTally. PCDC remains the site context.
- Support both review approval and correction/resubmission.
- A person who participated in preparation cannot review that case. Changing roles or assignments never removes this restriction.
- Escalating an unresponsive client creates a separate admin follow-up task. The preparer stays assigned.
- Resolving follow-up does not verify documents or automatically resume preparation.
- TaxSlayer milestones are manually recorded provisionally; no automatic integration is presumed.
- Use fictional application details and simulated documents, reminders, and tax-work milestones; real email verification is included.
- New applicants are limited to the user's group/class, with explicitly approved email addresses.
- Generate unique application IDs and keep one-click random fictional form filling. Filling details never sends an email or submits an application.
- Use the user's school Gmail as the preferred SMTP sender if its account policy permits it. Only authentication email is included; other email notifications remain deferred.
- Only modify deliverables outside `sources/`; synced project references are read-only.
- Do not overwrite the old localStorage case or upload it to Supabase. Do not claim live delivery or synchronization before verifying them.
- Use Node v24.21.0 explicitly. No global Node configuration change is part of this task.
- No accounts, external messages, paid services, or deployment are created merely by writing this plan.
- Pre-implementation review is complete and the latest revision is user-approved. Task 1 is complete. The user has authorized Task 2 implementation; later tasks retain their execution boundaries. Execute the smaller numbered/lettered tasks with fresh subagents and review between tasks; hosted account setup and publication remain parent-owned.

---

## 1. Execution context and boundaries

Working repository: `/Users/jinyuyang/VITA-Management-System-Demo`. Task 1 and the README updates have been merged into `main`. Task 2 is being implemented on `codex/task2-identity` in an isolated Git worktree based on `daa4468`. All application and documentation paths below are relative to this repository root. Task 1 was originally implemented in the project mirror's `output/vita-local-build/` and then transferred here after verifying the repository matched its baseline.

Observed starting points:

- `src/app.mjs` owns a single `c` record, synchronous events, localStorage persistence, simulated email/phone codes, and a cross-window storage listener.
- `src/domain.mjs` hardcodes the application ID and Alex, and merges document holds into the main status. Retain screening rules; replace those state assumptions.
- `src/views.mjs` contains client, volunteer, toolbar, and dialog renderers. Extract new role-specific rendering into focused modules as those features are added.
- `server.mjs` serves only index and flat `src` assets. Extend its explicit allowlist for the compiled bundle and public configuration; never expose the workspace wholesale.
- Existing tests assume one browser and fixed code `246810`; replace those assumptions rather than retaining a hidden auth bypass.
- The original project mirror has no Git repository. The user identified this existing repository after Task 1 and authorized committing the reviewed changes here. Continue version-controlled work here; do not initialize Git in the mirror.

This is one integrated workstream with sequential, testable milestones. Authentication/persistence, workflow, screens, and browser integration are dependent parts of the same approved demo, not independent products.

### Runtime commands

Run application commands from the repository root with these task-specific variables:

```sh
VITALLY_NODE=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin/node
VITALLY_NODE_BIN=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin
VITALLY_NPM=/Users/jinyuyang/.nvm/versions/node/v24.21.0/lib/node_modules/npm/bin/npm-cli.js
"$VITALLY_NODE" --version
"$VITALLY_NODE" --test tests/domain.test.mjs
```

Verify the npm path exists before installation. Prefix npm and tool commands that spawn Node children with command-scoped `PATH="$VITALLY_NODE_BIN:$PATH"`; this includes installation, builds through npm, and browser/CLI setup. It does not change the global shell configuration. Resolve packages with `npm install --save-exact` and preserve the lockfile; pin the Supabase CLI as well. Application startup is `"$VITALLY_NODE" --env-file-if-exists=.env.local server.mjs`, allowing a setup-needed screen if configuration is absent. Database tests still require `.env.test` and fail closed if configuration is missing.

Use a separate automated-test Supabase project, or an isolated local Supabase instance, for migrations, privileged fixtures, and browser tests. A workspace inside the classroom project is insufficient isolation. `.env.test` always specifies `VITALLY_TEST_MODE=hosted|local`, `VITALLY_TEST_SUPABASE_URL`, `VITALLY_TEST_PUBLISHABLE_KEY`, `VITALLY_TEST_ADMIN_KEY`, and `VITALLY_TEST_DATABASE_URL`. Install exact-pinned `pg` as a development dependency for migrations, transactional setup, and SQL catalog/ACL inspection; PostgREST is not a SQL-catalog interface. Use one checked-out database connection throughout each transaction. Never expose or print the database URL.

- **Hosted guard:** additionally require nonempty `VITALLY_TEST_PROJECT_REF` and `VITALLY_CLASSROOM_PROJECT_REF`, require them to differ, and match the test API URL and direct database/pooler project identity to an explicitly approved local test manifest. Missing classroom ref is a failure, not permission to proceed. TLS certificate verification stays enabled.
- **Local guard:** require explicit `VITALLY_TEST_LOCAL_INSTANCE_ID` matching the uniquely named run-owned CLI/Docker stack in the manifest. Both API and database URLs must use approved literal loopback addresses and exact manifest ports/database identity. Verify that stack's running container/port ownership before migrations or cleanup. No hosted project ref is invented or required in local mode, and no non-loopback target or fallback from a failed hosted guard is allowed.

Guard all privileged paths through one shared module before even the first Auth-admin/SQL call. No fallback to application environment values is permitted. The class/test project split uses the normally available two Free-project slots if hosted tests are chosen; check account availability during setup. Browser test app configuration must also point exclusively to the test project.

Before any privileged call, enforce the project guard. Track exact Auth-user/workspace IDs created under a cryptographically random test-run ID, reject deletion of IDs outside that manifest, and never sweep users by email domain. Test credentials never reach browser bundles, logs, or artifacts. Public browser keys and ordinary sessions are the only browser credentials. The parent performs the test-project portion of Task 10B early if local infrastructure is unavailable; independent pure code/tests can proceed while that dependency is pending.

### Classroom administration target (design fixed before Task 2)

Use a separate ignored `.env.admin`, never `.env.test` or browser config, for classroom provisioning. It must define `VITALLY_ADMIN_SUPABASE_URL`, `VITALLY_ADMIN_AUTH_KEY`, `VITALLY_ADMIN_DATABASE_URL`, `VITALLY_CLASSROOM_PROJECT_REF`, and `VITALLY_ADMIN_CONFIRMED_PROJECT_REF`. The last field records the operator's explicit confirmation of the intended classroom project and must exactly equal the nonempty classroom ref; never populate it automatically from the target URL. The locally approved target manifest independently records classroom API origin and SQL host/port/database/project-associated username, and the selected test identity (hosted ref/endpoints or local instance/endpoints). A missing manifest/confirmation is a guard failure.

`assertClassroomTarget()` in `tools/admin/classroom-target.mjs` validates that entire tuple, TLS, and mode before any classroom Auth-admin call, migration, or initialization. Reject any match to the manifest's test project/ref or endpoints, any loopback target, a mismatched API/SQL project, and absent confirmation. For hosted tests, also require the manifest's nonempty test ref to differ from classroom ref. For local tests, compare the explicit isolated instance endpoints; no fictitious hosted test ref is required. Do not import test cleanup or person-override helpers into classroom tools. Reuse only the shared initializer after the appropriate guard. Add `.env.admin.example` with empty documented variables; `.env.admin` and approved private target manifests must be ignored and never served.

**Database connection mode:** Use one persistent `pg` connection for migrations and the entire serializable setup transaction. For hosted targets, default to the IPv4-compatible **Session pooler** URL from the project's Connect dialog (normally port 5432 with a project-qualified username). The guard verifies the exact approved endpoint and session mode; reject transaction-pooler URLs (normally 6543). Direct PostgreSQL is allowed only as an explicitly approved reachable IPv6 target, and local tests use their manifest's direct loopback endpoint. Do not assume the Free direct host is IPv4-accessible or reconstruct a pooler host from a region. [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres) documents these choices. “Direct SQL” elsewhere means SQL rather than PostgREST, and allows this session-mode connection.

### Commit rule

Each task ends with review of its changes and a focused commit **if an actual repository exists**. Stage only its changed files. Do not commit credentials, roster emails, auth tokens, generated screenshots containing addresses, or `.env` files. Keep a checklist of completed tasks here if commits are unavailable. The existing repository is now available for this work.

## 2. File map

| Files | Responsibility |
| --- | --- |
| `src/domain.mjs`, `src/sample-data.mjs` | Pure presentation rules, allowed states, screening, coherent fictional answers |
| `src/contracts.mjs`, `src/errors.mjs` | Stable constants/data shapes and shared SQLSTATE-to-thrown-error mapping |
| `src/auth.mjs`, `src/supabase-store.mjs` | OTP session handling and all application data transport |
| `src/controller.mjs`, `src/app.mjs` | Async app state, local edits/navigation, subscriptions, event wiring |
| `src/views.mjs`, `src/client-views.mjs` | Shared shell/dialogs and client flow |
| `src/staff-views.mjs`, `src/admin-views.mjs`, `src/presenter-views.mjs` | Staff work/review, admin tasks, privileged demo controls |
| `src/ui.mjs`, `src/styles.css`, `index.html` | Shared controls, responsive styling, ViTally document identity |
| `tools/build.mjs`, `server.mjs`, `package.json`, `package-lock.json` | Reproducible bundle and restricted local serving |
| `supabase/migrations/001_identity_and_cases.sql` | Workspace membership, people, cases, initial policies and case creation |
| `supabase/migrations/002_workflow_schema.sql` | Requests, history, follow-up, assistance schema and policies |
| `supabase/migrations/003_action_core.sql` | Transaction core and initial preparation actions |
| `supabase/migrations/004_documents_followup.sql` | Document and follow-up actions |
| `supabase/migrations/005_assistance_closure.sql` | Assistance, reminders, and closure actions |
| `supabase/migrations/006_review.sql` | Independent review and correction actions |
| `supabase/migrations/007_fixtures_and_realtime.sql` | Fixture controls and authorized change notifications |
| `tests/*.test.mjs`, `tests/browser.mjs`, `tests/database.mjs` | Pure/unit, cross-engine, database/access verification |
| `tools/admin/workspace-setup.mjs`, `tools/admin/test-target.mjs`, `tools/admin/classroom-target.mjs` | Shared initializer and separate fail-closed test/classroom target guards |
| `tests/support/workspace-overrides.mjs` | Guarded test-only person/capability additions after normal initialization |
| `tests/support/database-fixture.mjs`, `tests/support/browser-fixture.mjs` | Isolated test records and authorized test sessions |
| `README.md`, `docs/setup.md`, `docs/demo-script.md`, `.env.example`, `.gitignore` | Setup, approved-recipient testing, rehearsal, public configuration boundaries |

## 3. Contracts used by every task

Use camelCase in browser objects and snake_case columns/SQL arguments. The adapter alone maps between them.

```js
// Contracts documented in src/contracts.mjs.
export const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const REFERENCE_PATTERN = /^VT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
// Readable references have exactly the form VT-XXXX-XXXX, using this alphabet.
export const STAGES = Object.freeze([
  'draft', 'received', 'preparation_ready', 'preparing',
  'review_ready', 'reviewing', 'corrections_required',
  'review_approved', 'closed',
]);
export const CASE_ACTIONS = Object.freeze([
  'SAVE_ANSWERS', 'SUBMIT', 'VERIFY_INTAKE', 'CLAIM_PREPARATION',
  'REQUEST_DOCUMENT', 'RESPOND_DOCUMENT', 'RECORD_DOCUMENT_RESPONSE', 'VERIFY_DOCUMENT',
  'ESCALATE_CONTACT', 'RECORD_CONTACT', 'RESOLVE_FOLLOWUP',
  'SUBMIT_REVIEW', 'CLAIM_REVIEW', 'REQUEST_CORRECTIONS',
  'RESUBMIT_REVIEW', 'APPROVE_REVIEW', 'RECORD_REVIEW_CONTACT',
  'REMIND', 'CLOSE_CASE',
]);
export const ERROR_CODES = Object.freeze([
  'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'INVALID_TRANSITION',
  'SELF_REVIEW', 'INELIGIBLE', 'VALIDATION', 'OFFLINE', 'SERVER_ERROR',
]);
// Principal: { userId, workspaceId, access: 'applicant'|'presenter', email }
// Person: { id, name, capabilities: string[] }
// Case: { id, reference, workspaceId, ownerUserId, fixture, stage,
//         revision, preparationVersion, answers, intakeVerified,
//         preparerId, reviewerId, requests, documents, history }
// Staff case additionally includes participants, reviews, followups,
// internalHistory. These are never loaded by the applicant adapter.
// Action: { actionId, caseId, expectedRevision, personId, type, payload }
// Receipt: { actionId, caseId, reference, revision }
// AppError: Error with a code from ERROR_CODES (auth errors mapped separately).
// Controller state: {savedCase, draftAnswers, editBaseRevision,
//                    dirty, conflict, saveState, connection, ...navigation}
// There is no state.case alias.
```

Browser interfaces:

```js
// createAuth(client) =>
// { sendCode(email): Promise<{state:'code_entry',message:string}>, verifyCode(email, code): Promise<void>,
//   getSession(): Promise<object|null>, signOut(): Promise<void>,
//   subscribe(handler): () => void }
// createStore(client) =>
// { getPrincipal(): Promise<Principal>, listPeople(): Promise<Person[]>,
//   listCases(): Promise<Case[]>, getCase(id): Promise<Case>,
//   createCase({actionId, mode:'client'|'assisted', personId:null|uuid, answers}): Promise<Receipt>,
//   act(Action): Promise<Receipt>, listAssistance(): Promise<object[]>,
//   actAssistance({actionId, itemId, expectedRevision, personId,
//                  type:'CLAIM'|'RESOLVE', note}): Promise<void>,
//   resetFixtures({actionId}): Promise<void>,
//   loadCheckpoint({actionId, caseId, expectedRevision, checkpoint}): Promise<void>,
//   subscribe({onChange, onConnection}): () => void }
// createController({store, auth, render, sessionStorage}) =>
// { start(), stop(), selectCase(id), selectPerson(id), editAnswers(patch),
//   saveAnswers(), reconcileAnswers({answers,expectedServerRevision}),
//   runAction(type, payload), refresh(), getState() }
```

SQL public functions are `vitally_create_case(p_action_id uuid, p_mode text, p_person_id uuid, p_answers jsonb)`, `vitally_apply_action(p_action_id uuid, p_case_id uuid, p_expected_revision bigint, p_person_id uuid, p_type text, p_payload jsonb)`, `vitally_assistance_action(p_action_id uuid, p_item_id uuid, p_expected_revision bigint, p_person_id uuid, p_type text, p_note text)`, `vitally_reset_fixtures(p_action_id uuid)`, and `vitally_load_checkpoint(p_action_id uuid, p_case_id uuid, p_expected_revision bigint, p_checkpoint text)`. Caller identity/workspace come from server-side membership, not a trusted browser argument. The demo admits one active workspace membership per account.

Action payloads are explicit; reject unknown fields that could alter ownership, capability, or stage:

| Action | Payload |
| --- | --- |
| SAVE_ANSWERS | `{answers}` using the intake-answer whitelist |
| SUBMIT | `{confirmed:true}`; server checks saved required answers |
| VERIFY_INTAKE | `{checks:{interview:true,identity:true,documents:true,consent:true}}`, labeled simulated |
| CLAIM_PREPARATION, SUBMIT_REVIEW, CLAIM_REVIEW, APPROVE_REVIEW, REMIND | `{}` |
| REQUEST_DOCUMENT | `{title,message}` |
| RESPOND_DOCUMENT, RECORD_DOCUMENT_RESPONSE | `{requestId,filename:'demo-mileage-record-2025.pdf'}` |
| VERIFY_DOCUMENT | `{requestId}` |
| ESCALATE_CONTACT | `{requestId,reason}` |
| RECORD_CONTACT, RESOLVE_FOLLOWUP | `{followupId,outcome,note}` |
| REQUEST_CORRECTIONS | `{findings}` |
| RESUBMIT_REVIEW | `{resolution}` |
| RECORD_REVIEW_CONTACT | `{outcome,note}` |
| CLOSE_CASE | `{reason,confirmed:true}` |

Validate each related record ID belongs to the locked case. A contact outcome is `no_answer`, `reached`, `no_further_contact`, or `closure_requested`; `RESOLVE_FOLLOWUP` accepts only `reached` and `no_further_contact`. Recording an attempt never resolves the task, even if its outcome is reached. Reviewer contact can remain pending after `no_answer`; closure remains its own admin action. Implement intake check attestations as demo flags, without asserting completion of real identity checks.

### Authority and participation

`CLAIM_PREPARATION` inserts `(case_id,person_id)` into `preparation_participants` in the same transaction as assignment; claiming is the conservative participation threshold. Keep the unique pair for the case's lifetime. Prepared fixtures populate all historical participants. Corrections and persona changes never delete them; intake, admin contact, staff receipt, and review never create them.

| Action family | Required authority |
| --- | --- |
| SAVE_ANSWERS/SUBMIT | Owner of a client draft, or presenter acting as admin on an assisted draft |
| VERIFY_INTAKE/CLOSE_CASE | Presenter + admin capability |
| CLAIM_PREPARATION | Presenter + eligible preparation person on an available case |
| REQUEST_DOCUMENT/VERIFY_DOCUMENT/SUBMIT_REVIEW/RESUBMIT_REVIEW/ESCALATE_CONTACT | Presenter + current eligible preparer + existing participation; documents allowed in preparing/corrections_required |
| RESPOND_DOCUMENT | Authenticated client owner, open matching request, no selected staff persona |
| RECORD_DOCUMENT_RESPONSE | Presenter + admin receipt capability; client owner is null; open request in preparing/corrections_required |
| RECORD_CONTACT/RESOLVE_FOLLOWUP | Presenter + assigned follow-up person + follow-up capability |
| Review decisions/contact | Presenter + eligible independent reviewer; active assignment as required after stage validation |
| REMIND | Presenter + admin capability |

Workspace setup stores `default_followup_person_id` pointing to Sam. ESCALATE_CONTACT assigns that person server-side; the browser supplies no assignee. Missing/ineligible default is a VALIDATION setup error and creates no task. There is no follow-up claim/reassignment feature in this scope. General case reassignment/release is likewise not a product action: the self-review regression uses privileged **test-project-only historical fixtures** with former/current preparers.

### SQL errors and validation order

Freeze this shared mapping in `contracts.mjs`: `VT001→FORBIDDEN`, `VT002→NOT_FOUND`, `VT003→CONFLICT`, `VT004→INVALID_TRANSITION`, `VT005→SELF_REVIEW`, `VT006→INELIGIBLE`, `VT007→VALIDATION`. Use `raise sqlstate 'VT002' using message='NOT_FOUND'` consistently, never untyped `raise exception` messages. Standard `42501` maps to FORBIDDEN. OFFLINE is a transport error; unexpected server errors map to SERVER_ERROR with safe copy. Map by `error.code`, not regexes over messages or HTTP status.

Case-action check order:

1. Verify `auth.uid()` and active membership without inspecting or revealing any target identity.
2. Lock/reserve the caller+workspace+action receipt. Compare operation, immutable request digest, and target metadata. Identical accepted replay returns its existing receipt after current membership/operation-authority checks, without repeating mutation; changed payload yields VALIDATION.
3. Lock the target through permitted visibility. Missing, other-workspace, or another applicant's case returns the same NOT_FOUND, with no reference/name/revision details.
4. Check general action authority (FORBIDDEN): applicant versus presenter access, a selected staff person in this workspace, and operational capabilities required by the action (`admin`, `followup`, `receive_documents`, `assist`). Client actions require a null staff person. A client who forges staff identity on an owned case gets FORBIDDEN. Do **not** test the technical `prepare`/`review` qualifications here; a presenter may attempt those action families using any same-workspace person and proceed to the ordered checks below.
5. Check expected revision (CONFLICT), then payload shape and related-record membership (VALIDATION).
6. Check allowed stage and preparation/review-version conditions (INVALID_TRANSITION).
7. Check preparation participation on review actions (SELF_REVIEW), then required technical qualification (`prepare` for preparation actions, `review` for review actions; missing qualification gives INELIGIBLE), then stage-specific assignment (wrong current preparer/reviewer/helper gives FORBIDDEN) and readiness (unverified document/intake blockers give INVALID_TRANSITION). In particular, reviewer assignment must not precede the stage check for APPROVE_REVIEW. At a fresh revision on an available review_ready case, nonparticipant Sam has valid presenter/person authority at step 4 but lacks review qualification at step 7: CLAIM_REVIEW returns INELIGIBLE. Admin title confers no tax qualification.
8. Mutate records, append history, increment revision, and store receipt atomically. On rejection, no receipt or partial mutation is committed.

For applicant actions, step 1 does not inspect or disclose any target identity; step 3 always applies to target-based lookup before action-specific state. At a fresh revision, approval after corrections gives INVALID_TRANSITION; at an old revision it correctly gives CONFLICT. New action IDs addressing deleted fixtures return NOT_FOUND. Receipt replays never re-create a deleted target; UI refresh can observe it is gone.

Both `createStore().act()` and the test helper `f.act()` must inspect `{error}` returned by supabase-js and **throw** an Error with `.code` set to the mapped domain code. Tests use predicates such as `error => error.code === 'SELF_REVIEW'`. Generic identity errors from Supabase Auth are separately masked as described in Task 5.

### Explicit privileges and private helpers

Keep entry RPCs in `public`; put every implementation helper in non-exposed `vitally_private`. Set security-definer `search_path=''` and fully qualify table/function references. RLS uses deliberate inline membership predicates; helpers callable only by RPC owners have no client grants.

For each application RPC, use the exact signature to revoke PUBLIC, anon, and authenticated before granting the entry point to authenticated. Repeat this after every replacement migration. For each application table, revoke all from PUBLIC/anon/authenticated, then grant authenticated only required SELECT with RLS; no browser reads on action_receipts and no direct DML. Never issue broad revokes against unrelated platform objects.

```sql
revoke all on function public.vitally_create_case(uuid,text,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.vitally_create_case(uuid,text,uuid,jsonb)
  to authenticated;
revoke all on public.cases from public, anon, authenticated;
grant select on public.cases to authenticated;
-- RLS bypass is not an SQL object grant. Preserve explicit fixture access.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.cases to service_role;
revoke all on schema vitally_private from public, anon, authenticated;
revoke all on all functions in schema vitally_private from public, anon, authenticated;
```

Audit effective default privileges for the actual migration creator role. Global PUBLIC EXECUTE must be revoked without `IN SCHEMA`; a schema-local revoke does not undo a global grant. Also revoke schema-local defaults directly granted to anon/authenticated, then grant explicit per-object access. Existing objects still require explicit ACLs. See [Supabase functions](https://supabase.com/docs/guides/database/functions#function-privileges) and [PostgreSQL default privileges](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html).

Grant `service_role` the deliberately enumerated application-table CRUD privileges required by provisioning/fixtures, plus sequence access only where used. Repeat/inspect these effective grants after all migrations; do not assume BYPASSRLS supplies them. Browser roles never inherit them. The direct SQL owner invokes the private initializer; an administrative API key is not a substitute for a database connection, and service_role needs no blanket private-helper EXECUTE.

### Privileged workspace setup and durable identities

Define **one** `initializeWorkspace({workspaceId,presenterUserIds,applicantUserIds,fixtureClientBindings})` in `tools/admin/workspace-setup.mjs`, used by classroom setup and every database/browser fixture. It returns `{workspaceId,people:{alex,morgan,sam}}`. Migrations define schema/functions only; no migration assumes a future workspace already exists. Approved Auth users are provisioned before the database transaction, with confirmed addresses for automated tests. Track newly created user IDs immediately; Auth administration cannot be atomically rolled back with SQL and cleanup must never delete preexisting users.

The initializer invokes an owner-only SQL routine in unexposed `vitally_private` over the direct SQL connection (not a sixth public RPC). In one serializable transaction, lock the workspace setup identity, insert/verify workspace with a null default, insert stable people keyed by `(workspace_id,person_key)`, their fixed capabilities, memberships, and private fixture-client bindings; then set `default_followup_person_id` to Sam and commit. Retry the whole transaction on SQLSTATE 40001 at most three times with bounded backoff, reusing the same workspace ID/input; do not repeat Auth provisioning during SQL retries. Exhaustions fail clearly without partial setup. A composite same-workspace FK validates the default after the people exist. Alex has `prepare`; Morgan `review`; Sam `admin`, `followup`, `receive_documents`, `assist`. Identical reruns preserve IDs; inconsistent existing configuration fails with VALIDATION instead of silently changing capabilities or reactivating revoked memberships. Explicit new roster additions use this same privileged routine.

People are **permanent workspace records**, outside fixture reset. The private setup-only binding table stores `(workspace_id,fixture_key,owner_user_id)` against the stable six scenario keys, never against disposable case IDs. Reset recreates each bound fixture with its saved owner; it cannot infer ownership from fictional contact details or reactivate membership. Default Sam, memberships, capabilities, people IDs, and bindings all survive reset. Only intentional whole test-workspace teardown removes them.

### Test-only people and capabilities (design fixed before Task 2)

During Task 2, after its schema/initializer exist and before any tests use overrides, add one `extendTestWorkspace({runManifest,workspaceId,addPeople:[],addCapabilities:[]})` helper in `tests/support/workspace-overrides.mjs`. Run `assertTestTarget()` before opening any privileged connection, require the workspace ID to be owned by that exact active test-run manifest, and require a matching private run-owned workspace marker created by test fixture setup. This is not a browser RPC, never a classroom setup option, and never a second implementation of normal people seeding.

After the shared initializer completes, this helper may insert an explicitly named additional test person or add an explicitly allowed capability to an existing same-workspace person. Validate additions against the capability vocabulary, reject unknown/cross-workspace IDs, deletions/replacements and identity changes, and transact the additions plus a private `test_overrides_applied` marker atomically. Repeated identical additions are idempotent and retain person IDs; conflicting name/key definitions fail VALIDATION. It cannot grant Auth membership or change the default Sam/bindings. Task 4 uses it to add `review` to Alex and add Casey (`prepare`) as the different current preparer, then creates historical assignment/participation records referencing those IDs.

**Initializer rerun policy:** Once any test overrides are applied, `initializeWorkspace` rejects that workspace with VALIDATION before any mutation, even for otherwise identical inputs. It never removes additions or silently restores base capabilities. Create a fresh run-owned workspace when a test needs the normal initializer again. Ordinary untouched workspaces keep the documented idempotent rerun behavior. This makes the test exception explicit and keeps classroom initialization strict. Test guard failures must occur before SQL; test successful additions, duplicate stability, rejected cross-workspace changes, and rerun rejection with unchanged people/capabilities/membership snapshots.

### DOM action convention

Workflow buttons use canonical constants directly: `data-case-action="CLAIM_REVIEW"`. Navigation/dialog controls continue to use `data-action` and are never translated implicitly into SQL actions. Event handling reads `target.dataset.caseAction`, validates inclusion in CASE_ACTIONS, then calls `controller.runAction(value,payload)`. Test both the presence of the eligible action and absence for an ineligible person; a negative selector alone is insufficient.

## Task 1: Case contracts, fictional form filling, and runtime baseline

**Files:** Modify `src/domain.mjs`, `tests/domain.test.mjs`, `package.json`; create `src/contracts.mjs`, `src/sample-data.mjs`, `tests/sample-data.test.mjs`.

**Consumes:** Existing intake screening and required fields. **Produces:** Contracts above; `makeSampleAnswers({seed, scenario})` and `fillBlankAnswers(current, generated)`.

- [x] Run the existing domain suite with Node v24.21.0 and record the baseline before edits.
- [x] Add a failing test showing sample filling preserves edited values and cannot add identity fields:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSampleAnswers, fillBlankAnswers } from '../src/sample-data.mjs';
import { screening } from '../src/domain.mjs';
test('fictional filling preserves edits and excludes identity', () => {
  const sample = makeSampleAnswers({seed: 21, scenario: 'ordinary'});
  const filled = fillBlankAnswers({firstName:'My edit',email:'drop@example.com',
    ownerUserId:'forged',stage:'review_approved',unknown:'drop'},
    {...sample,email:'also-drop@example.com',id:'forged',reference:'forged'});
  assert.equal(filled.firstName, 'My edit');
  assert.equal(screening(filled), 'continue');
  for (const key of ['email', 'ownerUserId', 'id', 'reference', 'stage', 'unknown'])
    assert.equal(Object.hasOwn(filled, key), false);
});
```

- [x] Run `"$VITALLY_NODE" --test tests/sample-data.test.mjs`; expect missing exports before implementation.
- [x] Implement seeded fictional selection from small named scenario templates. Construct a fresh result by iterating only whitelisted answer keys; never spread either input. Exclude email, identity, stage, IDs even when already in current values. Ordinary examples have 2025, supported residence, `helper:self`, consistent household values, `other:no`, `stocks:no`; exception scenario explicitly sets `other:yes`. Preserve nonblank current answers and fill remaining keys from the generated whitelist. Export reference/error/action contracts and retain `screening()` behavior.
- [x] Add deterministic-seed and exception-screening assertions; run both suites. Remove obsolete local-only case transition assertions only when Tasks 2–4 replace them with authoritative tests. Record the replacement coverage, not silent deletion.
- [x] Review and commit this focused change if a repository exists.

**Task 1 completion evidence:** Implemented in the writable local app; Node v24.21.0 `npm test` passed 13/13, including all eight legacy tests. Independent spec/quality review approved after strengthening the seed test and demonstrating failure when seed selection is disabled. The original mirror had no Git repository; the user subsequently identified this repository for committing the reviewed changes. New pure helpers are not wired into the UI until later tasks.

## Task 2: Identity, ownership, cases, and generated references

**Files:** Create `supabase/migrations/001_identity_and_cases.sql`, `tests/database.mjs`, `tests/support/database-fixture.mjs`, `tools/admin/workspace-setup.mjs`, `tools/admin/test-target.mjs`, `tools/admin/classroom-target.mjs`, `tests/support/workspace-overrides.mjs`, `.env.test.example`, `.env.admin.example`, `.gitignore`; modify `package.json`, `package-lock.json`; extend `src/contracts.mjs` if error mapping needs details.

**Verification:** Node v24.21.0: 17 unit/guard tests and 12 real Supabase integration tests pass on an isolated local stack with PostgREST 16.3. See [database setup](../../setup.md) for reproducible configuration. No classroom project or browser integration is included.

**Consumes:** Case/Principal contracts. **Produces:** Workspace/membership schema, policies, `vitally_create_case`, client-visible data reads.

- [x] Install the SDK used by the database test fixture before running those tests: `PATH="$VITALLY_NODE_BIN:$PATH" "$VITALLY_NODE" "$VITALLY_NPM" install --save-exact @supabase/supabase-js`. Install exact-pinned `pg` as a dev dependency and apply the same scoped PATH to CLI installation. Add migrations and ACL queries through the guarded direct SQL connection. First establish the isolated test project guard/configuration; no live SMTP is required for provisioned Auth fixtures.
- [x] Add `createDatabaseFixture()` returning `{applicantA, applicantB, presenter, outsider, anonymous, createCase, close}`. `anonymous` uses only the publishable key with session persistence/refresh disabled and no login. Other actors are created with `email_confirm:true` and have independently authenticated test sessions. Call the shared initializer after migrations and Auth provisioning; do not duplicate workspace/person seeding logic in test helpers. The privileged test process checks project identity and tracks every created user/workspace ID before deletion; `close()` deletes only that manifest's resources. Never fall back to classroom credentials or delete untracked users. Missing test configuration is a failing prerequisite.
- [x] Write the failing isolation/creation test:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseFixture } from './support/database-fixture.mjs';
import { REFERENCE_PATTERN } from '../src/contracts.mjs';
test('references are stable, unique, and do not authorize access', async () => {
  const f = await createDatabaseFixture();
  try {
    const actionId = crypto.randomUUID();
    const first = await f.createCase(f.applicantA, actionId);
    const retry = await f.createCase(f.applicantA, actionId);
    const second = await f.createCase(f.applicantA, crypto.randomUUID());
    assert.equal(first.caseId, retry.caseId);
    assert.equal(first.reference, retry.reference);
    assert.match(first.reference, REFERENCE_PATTERN);
    assert.match(second.reference, REFERENCE_PATTERN);
    assert.notEqual(first.caseId, second.caseId);
    assert.notEqual(first.reference, second.reference);
    const {data, error} = await f.applicantB.from('cases')
      .select('*').eq('id', first.caseId);
    assert.equal(error, null);
    assert.deepEqual(data, []);
    const byReference = await f.applicantB.from('cases')
      .select('*').eq('reference', first.reference);
    assert.equal(byReference.error, null);
    assert.deepEqual(byReference.data, []);
  } finally { await f.close(); }
});
```

- [x] Run `"$VITALLY_NODE" --env-file=.env.test --test tests/database.mjs`; expect missing schema/function before migration. Local test delivery can use Supabase's local mail catcher; it does not verify hosted Gmail delivery.
- [x] Create `workspaces`, `memberships`, `people`, `cases`, and `action_receipts`. Membership stores immutable setup-granted `access`, `active`, `user_id`, and `workspace_id`. Add nullable `workspaces.default_followup_person_id` and its same-workspace FK after defining people, plus private durable fixture bindings. Cases store internal UUID, globally unique readable reference, owner, fixture flag/key, origin, created_by_user_id, created_by_person_id, answers, stage/revision/version, assignments, and intake status. Do not mix internal notes into the client-readable row.
- [x] Enable RLS on every exposed table. Applicant SELECT requires active membership and `owner_user_id=auth.uid()`; presenter SELECT permits submitted or staff-created cases in that workspace, not applicant drafts. People and roster are presenter-restricted; a user may read their own membership without listing the class. Revoke direct client DML and all unauthenticated table access.
- [x] Implement case creation as a security-definer entry with `search_path=''`, qualified names, and VT SQLSTATEs. Explicitly revoke PUBLIC/anon/authenticated then grant only authenticated execution; apply the privilege contract to tables/helpers/defaults. A client cannot supply owner, workspace, fixture flag, or presenter access. Client mode requires `p_person_id=null` and derives owner from auth.uid(); any supplied staff person is FORBIDDEN. Assisted mode requires presenter membership and a same-workspace selected person with admin capability, leaves client owner null, and records both authenticated user and selected person as creators. Include mode/person in the immutable action digest. Assert Alex is denied, Sam succeeds with attribution, and a foreign-workspace person is denied.

```sql
-- Shape of server-generated identity; readable reference collisions retry.
insert into public.cases(id, reference, workspace_id, owner_user_id,
                         fixture, origin, created_by_user_id, created_by_person_id,
                         stage, revision, preparation_version, answers)
values (gen_random_uuid(), v_reference, v_workspace_id, v_owner_user_id,
        false, p_mode, auth.uid(), p_person_id, 'draft', 1, 0, p_answers)
returning id, reference, revision into v_case_id, v_reference, v_revision;
```

- [x] Reserve `(workspace_id,authenticated user,action_id)` transactionally. Store operation, complete canonical request digest, historical target UUID/reference, generation, and receipt. Target IDs have **no foreign key** to resettable cases/assistance/reviews (no ON DELETE CASCADE). People remain permanent; receipt actor IDs are also historical scalar values. Receipts persist across fixture reset and are removed only by intentional workspace teardown. A repeated accepted identical action returns its original receipt, while changed payload gets VT007. Generate reference characters with REFERENCE_ALPHABET, enforce regex/check and unique index, and retry only the reference constraint's collisions.
- [x] Implement/test the shared initializer and the post-initialization extendTestWorkspace helper. Test classroom guard confirmation/missing-target/test-project rejection plus session-versus-transaction endpoint checks without issuing writes to a classroom target. Test initializer idempotency/stable person IDs, default Sam FK/capabilities, durable bindings, membership revocation preservation, explicit service_role fixture CRUD, and fail-closed hosted/local guards (including missing classroom ref and wrong DB target). Test creation/reference uniqueness under concurrency, duplicate-action stability, revocation, outsider reads, owner forgery, draft privacy, direct writes, anonymous create RPC denial, and authenticated success. Commit verified schema/tests if possible.

## Task 3A: Workflow schema and policies

**Files:** Create `supabase/migrations/002_workflow_schema.sql`; extend `tests/database.mjs` and `tests/support/database-fixture.mjs`.

**Consumes:** Task 2 identity/schema/ACL contracts. **Produces:** `preparation_participants`, `document_requests`, `documents`, `admin_followups`, `contact_attempts`, `case_events`, `client_events`, and `assistance_items`, with no new action implementation yet.

- [ ] Add failing access tests for every new table. Privileged fixture setup inserts minimal linked records; applicant A may read their own requests/documents/client events. Staff tables needed by the presenter have authenticated SELECT plus presenter-only RLS, so applicants receive no internal contacts/events/participants. Applicant B receives no A records; anonymous requests fail. The presenter's positive read must return the seeded internal row, proving the denial is not blanket misconfiguration.
- [ ] Create relational records with metadata-only documents, unique `(case_id,person_id)` participants, and a partial unique index enforcing one active follow-up per request. Store stable actor user/person IDs and contact source. Keep contact/internal event data separate from client-readable events.
- [ ] Constrain related IDs to the same workspace/case. The Task 2 shared initializer supplies permanent people/capabilities and sets Sam after people creation; this migration neither seeds future workspaces nor replaces their people. Verify those prerequisites in each fixture.
- [ ] Apply explicit table grants, RLS, and private-helper protections from the common contract. Policies must not recurse through themselves; use self-membership visibility and deliberate inline predicates. Receipt reads remain denied.

```js
const internal = await f.applicantA.from('contact_attempts').select('*');
assert.equal(internal.error,null);
assert.deepEqual(internal.data,[]); // presenter-only RLS, including owned cases
const publicRows = await f.applicantB.from('client_events').select('*');
assert.equal(publicRows.error, null);
assert.deepEqual(publicRows.data, []);
```

- [ ] Run database access tests and inspect effective ACLs. Review/commit this schema-only deliverable before Task 3B.

## Task 3B: Transaction core and preparation participation

**Files:** Create `supabase/migrations/003_action_core.sql`; extend `tests/database.mjs`, `tests/support/database-fixture.mjs`; create `src/errors.mjs` for the shared code mapper.

**Consumes:** Tasks 2/3A and frozen error/order contract. **Produces:** `vitally_apply_action` with SAVE_ANSWERS, SUBMIT, VERIFY_INTAKE, CLAIM_PREPARATION; reusable owner-only helpers in `vitally_private`.

- [ ] Extend test helpers with `readyCase()`, `act(client,caseId,personId,type,payload)`, `readStaffCase(caseId)`, and `alex`, `morgan`, `sam`. `readyCase` supplies confirmation/check payloads and returns a received-then-intake-verified unclaimed case. `act` obtains the current visible revision and uses the shared mapper to throw `.code`; race tests call RPC directly with the same explicit revision. A lookup returning no visible row throws NOT_FOUND, not a raw SDK row-count error.
- [ ] Add failing concurrent-claim, other-owner-versus-absent NOT_FOUND, duplicate-retry, and participant-insertion tests. Use `createAppError(error)` from `src/errors.mjs` in both test and production adapters:

```js
const {data,error} = await client.rpc('vitally_apply_action', args);
if (error) throw createAppError(error); // maps error.code using the VT mapping
return data;
```

- [ ] For visibility/error parity and idempotent replays, invoke `client.rpc` directly with fully specified immutable arguments, bypassing f.act's convenience reads. Assert both an absent case and another applicant's case return database code VT002; this must be a server result, not a helper-generated error. Replay tests reuse the identical original envelope, including expected revision, so the request digest is unchanged. Test mapper behavior separately.

- [ ] Implement auth/membership, idempotency reservation, scoped case lookup/lock, capability, revision, payload, stage, self-review/assignment ordering exactly as specified. All helpers have fixed empty search path, qualified names, private schema, and no client EXECUTE.

```sql
-- Scope v_case to current membership and owner/presenter visibility before locking.
if not found then raise sqlstate 'VT002' using message='NOT_FOUND'; end if;
if v_case.revision <> p_expected_revision then
  raise sqlstate 'VT003' using message='CONFLICT';
end if;
```

- [ ] Implement whitelisted draft answers, server-side required fields/screening, simulated intake checks, and single-winner preparation claim. The claim inserts the selected person into participants atomically; every subsequent preparation action requires that participant record as well as current assignment. Failed actions commit no changes or receipts.
- [ ] Add `RPC_SIGNATURES` test metadata for every currently installed public application entry point, including valid argument shapes. For each, call with the unauthenticated client and assert rejection/no state changes. Check successful authenticated operations as well; blanket denial must not pass the suite.
- [ ] Run targeted tests and commit/review core before document work. Do not add product reassignment or release actions.

## Task 3C: Documents and admin follow-up

**Files:** Create `supabase/migrations/004_documents_followup.sql`; extend database tests/helpers and RPC dispatch.

**Consumes:** Task 3B transaction core and Task 3A tables. **Produces:** REQUEST_DOCUMENT, RESPOND_DOCUMENT, RECORD_DOCUMENT_RESPONSE, VERIFY_DOCUMENT, ESCALATE_CONTACT, RECORD_CONTACT, RESOLVE_FOLLOWUP.

- [ ] Add failing tests for retained preparer/blocker, automatic Sam assignment, disallowed actors, assisted response receipt, and explicit follow-up resolution. For compact tests only, `f.act` fills an omitted requestId/followupId from the fixture's one current request/task; UI calls always supply selected IDs.

```js
const id = await f.readyCase();
await f.act(f.presenter,id,f.alex,'CLAIM_PREPARATION',{});
await f.act(f.presenter,id,f.alex,'REQUEST_DOCUMENT',
  {title:'Mileage record',message:'Please add the fictional sample.'});
await f.act(f.presenter,id,f.alex,'ESCALATE_CONTACT',{reason:'Office contact needed'});
let c = await f.readStaffCase(id);
assert.equal(c.followups[0].assigneeId,f.sam);
await f.act(f.presenter,id,f.sam,'RECORD_CONTACT',
  {outcome:'reached',note:'Client will respond'});
c = await f.readStaffCase(id);
assert.equal(c.followups[0].status,'open');
await f.act(f.presenter,id,f.sam,'RESOLVE_FOLLOWUP',
  {outcome:'reached',note:'Contact completed'});
c = await f.readStaffCase(id);
assert.equal(c.preparerId,f.alex);
assert.equal(c.requests[0].status,'open');
assert.equal(c.followups[0].status,'resolved');
```

- [ ] Implement request/verify only for current assigned eligible preparation participants in preparing/corrections_required. Client response requires case ownership. The separate staff receipt action requires presenter + receive_documents capability and owner null; record `source:staff_recorded`, actor user/person, and awaiting verification. Staff receipt cannot impersonate a client or add participation.
- [ ] Implement follow-up creation with server-derived default Sam assignment; reject unknown assignee fields. Contact/resolve require assigned task person and capability. A reached contact attempt alone changes no task status. RESOLVE_FOLLOWUP only accepts reached/no_further_contact and never alters request verification or preparation assignment.
- [ ] Test a response while follow-up is open, duplicate escalation, missing default person, wrong-case request ID, wrong preparer verification, and correct preparer verification before receipt (rejected). Client/staff receipt must leave verification pending, participation unchanged, and follow-up open. An identical receipt retry adds exactly one document/event; a fresh action ID on an already-responded request is rejected. Also test admin receipt on an owned case, client forgery, and failed actions with no side effects. Inspect updated public RPC ACLs after replacement.
- [ ] Run/commit/review this bounded document-and-follow-up deliverable.

## Task 3D: Assistance, reminders, and closure

**Files:** Create `supabase/migrations/005_assistance_closure.sql`; extend database tests/helpers.

**Consumes:** Earlier core/actions. **Produces:** `vitally_assistance_action`, REMIND, CLOSE_CASE.

- [ ] Add failing tests for assistance CLAIM/RESOLVE, reminder preserving case count/access, and reasoned pre-approval closure cancelling pending tasks without erasing history. `seedAssistance()` is a privileged test-helper method creating a single linked item with `{status:"open",revision:1,assigneeId:null}` and a received case; expose it through the fixture helper only. Add `readStaffAssistance(itemId)` returning status, revision, assigneeId, and resolutionNote.

```js
const {itemId,caseId} = await f.seedAssistance();
const before = await f.readStaffCase(caseId);
const initial = await f.readStaffAssistance(itemId);
assert.equal(initial.status,'open');
assert.equal(initial.revision,1);
assert.equal(initial.assigneeId,null);
for (const [type,revision] of [['CLAIM',1],['RESOLVE',2]]) {
  const result = await f.presenter.rpc('vitally_assistance_action',{
    p_action_id:crypto.randomUUID(),p_item_id:itemId,
    p_expected_revision:revision,p_person_id:f.sam,p_type:type,
    p_note:type==='RESOLVE'?'Helped complete fictional forms':'',
  });
  assert.equal(result.error,null);
  const item = await f.readStaffAssistance(itemId);
  assert.equal(item.status,type==='CLAIM'?'assigned':'resolved');
  assert.equal(item.revision,revision+1);
  assert.equal(item.assigneeId,f.sam);
}
assert.equal((await f.readStaffAssistance(itemId)).resolutionNote,
  'Helped complete fictional forms');
const after = await f.readStaffCase(caseId);
for (const key of ['stage','intakeVerified','preparerId','reviewerId'])
  assert.deepEqual(after[key],before[key]);
```

- [ ] Implement assistance state/revision checks in its RPC, with presenter/assist capability, assigned-helper resolution, and the same error/idempotency order. Do not route it through tax-review states. Add the RPC to the anonymous test inventory and explicit ACL statements.
- [ ] Implement REMIND as a simulated timestamp/event on available work. Implement CLOSE_CASE for an admin, with reason+confirmation, only before approval. Cancel open requests/follow-up without deleting their histories; do not equate this with cancelling an externally filed return.
- [ ] Run assistance-race/wrong-helper/linked-intake invariants, closure-state/reason, reminder counts, replay, anonymous RPC, and direct-DML tests. Review/commit before Task 4.

## Task 4: Independent review and correction cycles

**Files:** Create `supabase/migrations/006_review.sql`; extend `tests/database.mjs`, `tests/support/database-fixture.mjs`, and `src/domain.mjs` for status explanations only.

**Consumes:** Transactional action handler, preparation participants. **Produces:** Review attempts/findings/resolutions, preparation-version rules, remaining review actions.

- [ ] Add `preparedCase()` to the database fixture: readyCase, Alex claim, SUBMIT_REVIEW. Use guarded extendTestWorkspace after normal initialization to give Alex review capability in the test fixture only, proving self-review is independently blocked; initializer reruns on this enriched workspace must reject as documented.
- [ ] Write failing self-review and correction tests:

```js
test('capable preparer still cannot review own case', async () => {
  const f = await createDatabaseFixture();
  try {
    const id = await f.preparedCase();
    await assert.rejects(
      f.act(f.presenter, id, f.alex, 'CLAIM_REVIEW', {}),
      error => error.code === 'SELF_REVIEW');
    await assert.rejects(
      f.act(f.presenter, id, f.sam, 'CLAIM_REVIEW', {}),
      error => error.code === 'INELIGIBLE');
    await f.act(f.presenter, id, f.morgan, 'CLAIM_REVIEW', {});
    await f.act(f.presenter, id, f.morgan, 'REQUEST_CORRECTIONS',
      {findings:'Recheck the fictional mileage entry.'});
    await assert.rejects(
      f.act(f.presenter, id, f.morgan, 'APPROVE_REVIEW', {}),
      error => error.code === 'INVALID_TRANSITION');
    await f.act(f.presenter, id, f.alex, 'RESUBMIT_REVIEW',
      {resolution:'Corrected and rechecked in external software.'});
    await assert.rejects(
      f.act(f.presenter, id, f.sam, 'CLAIM_REVIEW', {}),
      error => error.code === 'INELIGIBLE');
    await f.act(f.presenter, id, f.morgan, 'CLAIM_REVIEW', {});
    await f.act(f.presenter, id, f.morgan, 'APPROVE_REVIEW', {});
    const c = await f.readStaffCase(id);
    assert.equal(c.stage, 'review_approved');
    assert.equal(c.preparationVersion, 2);
    assert.equal(c.reviews.length, 2);
  } finally { await f.close(); }
});
```

- [ ] Add a regression with an owned ready case: Alex claims, requests a document, escalates to Sam, applicant responds, Alex verifies, and the follow-up deliberately remains open. Then SUBMIT_REVIEW must succeed; assert stage review_ready, preparationVersion 1, preparer Alex, resolved request, and the same open follow-up assigned to Sam. This tests the independent task boundary, not merely a resolved-follow-up happy path.
- [ ] Run tests before implementation; expect missing review actions to fail.
- [ ] Create `reviews` and related internal findings/resolution fields. `SUBMIT_REVIEW` and `RESUBMIT_REVIEW` require assigned preparation ownership, completed intake, no unverified requests, and resolution text on resubmission. Increment preparation version and clear the previous active reviewer.
- [ ] `CLAIM_REVIEW` requires review eligibility and no preparation participation. Repeat that check at approval/correction; persist the attempt's version. Require active reviewer ownership for decisions. Corrections preserve preparation assignment and stay `corrections_required` until explicit resubmission. Contact attempts increment sync revision without altering the reviewed preparation version.
- [ ] `APPROVE_REVIEW` records completed review and pending client follow-up. `RECORD_REVIEW_CONTACT` requires the assigned reviewer and approved stage; record outcome without banking fields. Approval never changes to signed/filed/accepted.
- [ ] Test both paths, alternate reviewer after resubmission, stale-version approval, admin without eligibility, and client denial of internal findings. For reassignment exclusion, use a privileged test-project fixture with former preparer Alex and current preparer Casey created through extendTestWorkspace, retaining both participants; assert Alex cannot claim/approve. No reassignment/release button or application action is introduced. Add paired latest-revision approval-after-corrections (INVALID_TRANSITION) and stale-revision (CONFLICT) assertions. Commit if possible.

## Task 5: Real email access, Supabase adapter, and safe local serving

**Files:** Create `src/auth.mjs`, `src/supabase-store.mjs`, `tools/build.mjs`, `.env.example`, `.gitignore`, `tests/auth.test.mjs`, `tests/store.test.mjs`, `tests/server.test.mjs`; modify `server.mjs`, `index.html`, `package.json`, `package-lock.json`.

**Consumes:** SQL functions and data contracts. **Produces:** `createAuth`/`createStore`; compiled browser bundle; public config route.

- [ ] Write a failing auth unit test capturing SDK calls and asserting signup is disabled in the request:

```js
test('email requests do not create public users', async () => {
  const calls = [];
  const client = {auth:{signInWithOtp: async args => {
    calls.push(args); return {error:null};
  }}};
  await createAuth(client).sendCode('student@example.com');
  assert.deepEqual(calls, [{email:'student@example.com',
    options:{shouldCreateUser:false}}]);
});
```

- [ ] Run auth/store tests; expect missing modules. The SDK is installed in Task 2; install exact esbuild/Playwright dev dependencies using `PATH="$VITALLY_NODE_BIN:$PATH" "$VITALLY_NODE" "$VITALLY_NPM" install --save-dev --save-exact esbuild playwright`. Add `tools/build.mjs` using esbuild's `build({entryPoints:['src/app.mjs'], bundle:true, format:'esm', platform:'browser', outfile:'dist/app.js'})`. Build bundles the SDK; no runtime CDN dependency is needed.
- [ ] Implement `createAuth` around signInWithOtp, verifyOtp, getSession, signOut, and onAuthStateChange. **Every syntactically valid code request**, whether accepted, identity-rejected, rate-limited, provider-failed, unknown-code, or transport-failed, returns the identical `{state:'code_entry',message:'If this address is eligible, check your inbox for a sign-in code.'}`. Start the same configured resend cooldown at request initiation: server email minimum interval plus 5 seconds (65 seconds for a verified 60-second server setting); do not vary copy, next screen, or cooldown based on SDK response or Retry-After. Display identical general troubleshooting guidance to everyone. A separate connection notice may reflect browser offline state or an address-independent connectivity check, identically for all addresses; never derive it from address-dependent Auth codes. Only local email syntax validation may reject before that state. Do not claim mail was sent. Invalid/expired code **verification** remains a distinct explicit failure without fixed-code fallback. Server signup restrictions/membership remain authoritative; this UI rule does not claim to fix enumeration through the directly callable Auth API.
- [ ] Classify send outcomes only by SDK `error.code`, never message regexes. A versioned test-evidence fixture records exact observed codes/status and scenario, with unknown codes also mapped to neutral UI. The [isolated early probe](../reviews/2026-09-15-vitally-auth-probe.md) observed `otp_disabled` / HTTP 422 for unknown email and `over_email_send_rate_limit` / HTTP 429 for a confirmed known address within the resend floor. It also observed `email_provider_disabled` / HTTP 422 under misconfiguration. Rerun against the selected target/version. The [source-documented](https://supabase.com/docs/guides/auth/debugging/error-codes) `over_request_rate_limit` is a candidate code test, not observed evidence until reproduced. Sanitize diagnostics: no email, code, token, request body, or raw provider message. Masking applies to **all** codes, including future ones, so incomplete classification cannot leak roster membership.
- [ ] Add paired unit/browser tests for success, observed unknown-email code, each observed rate-limit/provider code, source candidate codes, arbitrary unknown code, and thrown transport failure, comparing message, next screen, the identical request-time cooldown, and absence of roster-specific copy. Use a controllable clock so different response timing cannot alter the cooldown start; assert 65 seconds for the 60-second server fixture, no send at 60 seconds, and re-enabled send after 65 seconds. Independently verify the unknown address creates no Auth user/session/case. Keep real SMTP failure verification distinct from this UI test.
- [ ] Implement adapter RPC calls and SELECT reads. `getPrincipal` checks active membership; `listCases` respects RLS and maps rows. Applicant `getCase` fetches only client-safe related tables; presenter fetches staff tables. Persist the action ID when retrying a timed-out request. Subscribe to authorized case/client-event tables for applicants and staff-change tables for presenters; unsubscribe on logout or workspace change.

```js
const {data, error} = await client.rpc('vitally_apply_action', {
  p_action_id: action.actionId, p_case_id: action.caseId,
  p_expected_revision: action.expectedRevision,
  p_person_id: action.personId ?? null,
  p_type: action.type, p_payload: action.payload,
});
if (error) throw createAppError(error); // Import shared src/errors.mjs mapper.
return data;
```

- [ ] Add `/public-config.json` returning only `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and optional numeric `AUTH_RESEND_COOLDOWN_SECONDS` (default 65); URL/key remain the only required app env values. Setup must set/verify cooldown equals the actual configured server interval plus 5, identically for all users; this public duration is not a secret. Keep SMTP secrets out of runtime config. Launch with `"$VITALLY_NODE" --env-file-if-exists=.env.local server.mjs`. Expose only index, compiled bundle, and required CSS/static assets; tests request `.env.local`, migrations, and parent paths and expect 404. Test launching without the env file: server starts and configuration absence renders a setup-needed screen.
- [ ] Run auth/store/server tests and bundle creation. Assert auth failure does not create a case, resend cooldown prevents duplicate clicks, subscriptions clean up, and server responses contain no secrets. Commit if possible.

## Task 5A: Early two-engine Auth compatibility gate

**Owner:** One bounded testing subagent. **Files:** `tests/auth-browser.mjs`, shared `tests/support/browser-fixture.mjs`, sanitized evidence in setup docs. **Consumes:** Guarded isolated Auth target and minimal email/code form; the full story is not a prerequisite. **Produces:** Verified login helper before Task 10A.

- [ ] Run this gate as soon as the isolated target and minimal Task 5 form exist, before full application story work. The pre-implementation throwaway trial is recorded in [Auth probe evidence](../reviews/2026-09-15-vitally-auth-probe.md); it proves the method on that local version, not the future app or hosted sender. Repeat with the real app form when ready.
- [ ] Disable global signup while keeping the email sign-in provider enabled. On the probed CLI version, `auth.enable_signup=false` with `auth.email.enable_signup=true` preserves email login; setting both false disabled the email provider. Verify resolved behavior instead of trusting similarly named settings, and verify direct unknown-user signup remains rejected. Create confirmed test users (`email_confirm:true`); generate a magiclink using Auth Admin, read `properties.email_otp` privately, enter it through the real code field, and call the actual `verifyOtp({email,token,type:'email'})`. Confirm session user ID equals the provisioned actor, not just a visible screen change. Verify the one-time code cannot authenticate again.
- [ ] Run Chrome and Firefox separately. Intercept only the exact guarded test-origin OTP-send URL; support OPTIONS with explicit CORS headers, allow only the expected frontend Origin, reject unexpected methods, and count POST independently. Do not use `times:1`; an OPTIONS request must not consume the POST handler. Keep it until one POST completes, remove it in finally, and leave real verification unmocked. Unit-test the OPTIONS branch even if browser routing does not expose preflight on that runtime.
- [ ] Test two generateLink calls for the **same confirmed user within the verified server interval** (60 seconds for the local fixture) in both browser engines; record whether the second generation succeeds and whether its returned OTP verifies. The old probe did not establish this. Use fresh users for independent login scenarios. The sign-out/return persistence test must retain the same user; if repeat generation is limited, wait the configured server interval plus margin before generating the return code, with an explicit bounded test timeout. Never change identities to make a same-user return assertion pass, inject a session, or globally lower limits to bypass this gate.
- [ ] Observe exact sanitized Auth codes for unknown email, expiry/invalid verification, and safely induced test-only rate-limit/provider failures where supported. Never trigger real external mail or intentionally exhaust shared classroom limits. Record unsupported/unobserved scenarios explicitly; synthetic code tests do not count as observations. Verify unknown requests create no user, session, or case. Review before Task 10A consumes this helper.

## Task 6: Async controller and client experience

**Files:** Create `src/controller.mjs`, `src/client-views.mjs`, `tests/controller.test.mjs`, `tests/client-views.test.mjs`; modify `src/app.mjs`, `src/views.mjs`, `src/ui.mjs`, `src/styles.css`, `index.html`.

**Consumes:** Auth/store interfaces and sample helpers. **Produces:** Controller contract, ViTally email entry, My applications, generated ID card, intake and client progress.

- [ ] Write a controller test where a remote refresh arrives during editing:

```js
test('remote refresh preserves unsaved answers', async () => {
  let current = {id:'case-a', revision:1, stage:'draft', answers:{firstName:'Old'}};
  const writes = [];
  const store = {getPrincipal:async()=>({userId:'a',access:'applicant'}),
    listCases:async()=>[current], getCase:async()=>current,
    act:async action => {
      writes.push(action);
      current={...current,revision:current.revision+1,answers:action.payload.answers};
      return {actionId:action.actionId,caseId:current.id,revision:current.revision};
    },
    subscribe:()=>()=>{}};
  const controller = createController({store, auth:{getSession:async()=>({}),
    subscribe:()=>()=>{}},
    render:()=>{}, sessionStorage:{getItem:()=>null,setItem:()=>{}}});
  await controller.start(); await controller.selectCase('case-a');
  controller.editAnswers({firstName:'Unsaved'});
  current = {...current, revision:2, answers:{firstName:'Server edit'}};
  await controller.refresh();
  assert.equal(controller.getState().draftAnswers.firstName, 'Unsaved');
  assert.equal(controller.getState().savedCase.revision, 2);
  assert.equal(controller.getState().savedCase.answers.firstName, 'Server edit');
  assert.equal(controller.getState().editBaseRevision, 1);
  assert.deepEqual(controller.getState().conflict,
    {code:'REMOTE_CHANGED',baseRevision:1,serverRevision:2});
  await assert.rejects(controller.saveAnswers(), error => error.code === 'CONFLICT');
  assert.equal(writes.length,0);
  await assert.rejects(controller.reconcileAnswers({
    answers:{firstName:'Chosen'},expectedServerRevision:1,
  }),error => error.code === 'CONFLICT');
  await controller.reconcileAnswers({
    answers:{firstName:'Chosen'},expectedServerRevision:2,
  });
  assert.equal(controller.getState().conflict,null);
  assert.equal(controller.getState().editBaseRevision,2);
  await controller.saveAnswers();
  assert.equal(writes.length,1);
  assert.equal(writes[0].type,'SAVE_ANSWERS');
  assert.equal(writes[0].expectedRevision,2);
  assert.equal(writes[0].payload.answers.firstName,'Chosen');
});
```

- [ ] Run failing tests before replacing synchronous persistence. State consistently uses savedCase, draftAnswers, editBaseRevision, dirty, conflict, saveState, connection, error, principal, and local selection/navigation. `start` only performs staff reads when authorized; `stop` releases subscriptions/listeners. Local selection keys include authenticated user ID; logout clears cached records and drafts.
- [ ] On first edit, pin editBaseRevision to savedCase.revision. A newer remote snapshot updates savedCase, preserves draftAnswers/base, and sets the exact REMOTE_CHANGED conflict above. saveAnswers rejects locally with CONFLICT until explicit reconciliation; never substitute the new revision under old edits. For unknown-outcome retries retain the complete original action envelope (ID, payload, persona, expected revision). Subscribe/refocus/reconnect trigger refresh; no per-keystroke writes or false offline success.
- [ ] Implement async `reconcileAnswers({answers,expectedServerRevision})`: fetch the latest authorized case, reject with CONFLICT if its revision changed again, otherwise whitelist the chosen answers, set editBaseRevision to that revision, keep dirty=true, and clear conflict. It does not save automatically; a subsequent save still uses database revision checking. Expose a deliberate reconciliation form so users can retain server values or selected local edits.
- [ ] Move client rendering to `client-views.mjs`. Show approved-email entry, code entry with real errors/resend state, My applications, generated reference card, existing intake, and progress. New-case action is explicit and idempotent; switching forms never creates cases. Remove phone sign-in and `246810`/“Use demo code” from actual access UI.
- [ ] Wire safe sample filling and deliberate regeneration without modifying verified email. Preserve existing screening, assistance/help explanations, residence/mailing separation, copy/print reference, and sample upload retry. Update brand to ViTally with PCDC site attribution and tax year 2025. Use “No password to remember” rather than claiming there is no underlying account.
- [ ] Test multiple owned applications, new-case retry, navigation persistence, lost connection, own-case lookup, invalid ID, unsaved conflict, and escaped input rendering. Capture client screenshots during Task 10A. Commit if possible.

## Task 7: Staff work board and preparation/review screens

**Files:** Create `src/staff-views.mjs`, `tests/staff-views.test.mjs`; modify `src/app.mjs`, `src/views.mjs`, `src/ui.mjs`, `src/styles.css`.

**Consumes:** Presenter principal, listCases/listPeople, case action contract. **Produces:** Staff board, selected-case workspace, separate preparation/review actions.

- [ ] Add a renderer test that the staff view states why self-review is unavailable:

```js
test('preparer cannot obtain a self-review action', () => {
  const html = renderStaffCase({stage:'review_ready', preparerId:'alex',
    participants:['alex'], requests:[], reviews:[], history:[]},
    {id:'alex',name:'Alex',capabilities:['prepare','review']});
  assert.match(html, /prepared this case/i);
  assert.doesNotMatch(html, /data-case-action="CLAIM_REVIEW"/);
  const eligible = renderStaffCase({stage:'review_ready',preparerId:'alex',
    participants:['alex'],requests:[],reviews:[],history:[]},
    {id:'morgan',name:'Morgan',capabilities:['review']});
  assert.match(eligible, /data-case-action="CLAIM_REVIEW"/);
});
```

- [ ] Run the test expecting missing renderer. Implement `renderStaffBoard(cases, people, ui)` and `renderStaffCase(caseRecord, person)` with status/assignment/language/service filters, counts from actual records, clear claimant, document state, and next action.
- [ ] Wire data-case-action values directly to controller runAction using the DOM convention. Add a dispatch test proving the eligible button sends type CLAIM_REVIEW with payload `{}`; do not rely solely on absence checks. Use exact payload contracts for the remaining forms. Disable pending actions; show conflicts and refresh when another claim wins.
- [ ] Add review workspace showing preparation version, prior attempts, required correction text, current assignment, and manual TaxSlayer milestone descriptions. Never invent return amounts or tax documents. A client response only changes request visibility; verification remains explicit.
- [ ] Test eligible vs ineligible claims, direct correction resubmission states, contact after approval, reminder counts, and self-review explanation. Validate database tests still reject forbidden actions even when UI is bypassed. Commit if possible.

## Task 8: Admin follow-up and assistance workspace

**Files:** Create `src/admin-views.mjs`, `tests/admin-views.test.mjs`; modify `src/app.mjs`, `src/styles.css`.

**Consumes:** Cases with staff details, assistance items, controller/store actions. **Produces:** Admin intake, follow-up/attempt forms, assistance claim/resolve, reminder and closure dialogs.

- [ ] Add a failing view test with a preparing case, Alex assignment, and open follow-up; assert the case still displays Alex and the task displays Sam separately. Define `renderAdminCase(caseRecord, ui)` and `renderAdminBoard(cases, assistance, ui)` exports.

```js
test('admin task and preparation have distinct owners', () => {
  const html = renderAdminCase({stage:'preparing',preparerId:'alex',
    preparerName:'Alex',followups:[{assigneeName:'Sam',status:'open'}],
    requests:[],history:[],answers:{language:'Mandarin'}}, {});
  assert.match(html, /Preparation[^]*Alex/);
  assert.match(html, /Follow-up[^]*Sam/);
});
```

- [ ] Run the failing test, then implement board filters for available work and follow-up needed. Assisted intake creates an unowned-client case using `createCase({actionId,mode:'assisted',personId:selectedPersonId,answers})`, marks its origin, and requires explicit simulated intake checks.
- [ ] Implement contact preference/language display, server-assigned Sam ownership, no-answer vs reached outcomes, separate resolve action, and case-closure confirmation with reason. On an unowned assisted case with an open request, add “Record sample document received” dispatching RECORD_DOCUMENT_RESPONSE. Label staff-recorded source explicitly and keep verification pending. Never auto-release preparer or auto-verify documents.
- [ ] Implement assistance open/assigned/resolved cards using `actAssistance`; expose a linked case without converting its status. REMIND records a simulated post update; show “No external message sent.”
- [ ] Verify response-arrives-while-follow-up-open, no-answer leaves task open, close cancels pending work, and assistance resolution leaves case intake unchanged. Commit if possible.

## Task 9: Six seeded cases and presenter-only controls

**Files:** Create `supabase/migrations/007_fixtures_and_realtime.sql`, `src/presenter-views.mjs`, `tests/presenter.test.mjs`; extend `tests/database.mjs`, `src/app.mjs`, `src/supabase-store.mjs`.

**Consumes:** Complete workflow and role model. **Produces:** Reset/checkpoint RPCs, six coherent fixture cases plus one assistance item, role panel.

- [ ] Start the isolated local test stack **with Realtime included** and verify its service health and positive subscription controls. Do not copy the Auth probe's `--exclude realtime` option; that probe intentionally did not test Realtime. Any shared test-stack startup command used by Tasks 9/10A must omit realtime from exclusions.

- [ ] Add a failing database test: create applicant-owned case, reset fixtures, then assert the applicant case and Auth membership still exist and exactly six fixture cases exist. Attempt the reset as applicant and expect FORBIDDEN.

```js
test('sample reset preserves class-created applications', async () => {
  const f = await createDatabaseFixture();
  try {
    const created = await f.createCase(f.applicantA, crypto.randomUUID());
    // Snapshot helpers use guarded privileged SQL, scoped to this workspace.
    // stableSetup includes sorted people/capabilities, default Sam, memberships,
    // and durable fixture bindings; fixtureState includes generation and IDs.
    await f.prepareClassCase(created.caseId, f.alex);
    const stableSetup = await f.readStableSetup();
    const membership = await f.readMembership(f.applicantAUserId);
    const before = await f.readStaffCase(created.caseId);
    const {error} = await f.presenter.rpc('vitally_reset_fixtures',
      {p_action_id:crypto.randomUUID()});
    assert.equal(error, null);
    const after = await f.readStaffCase(created.caseId);
    for (const key of ['id','reference','ownerUserId','preparerId','participants'])
      assert.deepEqual(after[key],before[key]);
    assert.deepEqual(await f.readStableSetup(),stableSetup);
    assert.deepEqual(await f.readMembership(f.applicantAUserId),membership);
    const fixtures = await f.readFixtureCases();
    assert.equal(fixtures.length,6);
    assert.deepEqual(fixtures.map(c=>c.fixtureKey).sort(),[...f.fixtureKeys].sort());
    assert.equal((await f.readFixtureAssistance()).length,1);
    const bound = fixtures.find(c=>c.fixtureKey===f.boundFixtureKey);
    assert.equal(bound.ownerUserId,f.applicantAUserId);
    const visible = await f.applicantA.from('cases').select('id').eq('id',bound.id);
    assert.equal(visible.error,null);
    assert.deepEqual(visible.data,[{id:bound.id}]);
    const resetState = await f.readFixtureState();
    const denied = await f.applicantA.rpc('vitally_reset_fixtures',
      {p_action_id:crypto.randomUUID()});
    assert.equal(denied.error.code,'VT001'); // mapper separately tests FORBIDDEN
    assert.deepEqual(await f.readFixtureState(),resetState);
    assert.deepEqual(await f.readStableSetup(),stableSetup);
  } finally { await f.close(); }
});
```

- [ ] Implement the snapshot helpers named in the test, using the guarded SQL connection and deterministic sorting. `prepareClassCase` submits/verifies/claims through normal actions and preserves Alex participation. `fixtureKeys` contains exactly preparation_ready, waiting_documents, admin_followup, review_ready, corrections_required, review_approved. Set up one durable applicant-A fixture binding via the shared initializer before the test.
- [ ] Implement guarded fixture reset within the authenticated presenter's workspace. Delete only fixture-marked records and their fixture-related history; create fresh IDs/generation. Do not alter Auth users, memberships, permanent people/capabilities, default Sam, durable bindings, or class-created cases and their participants. Reapply each saved fixture-key/client binding when creating the fresh case; bound-client visibility must work after every reset. Seed realistic stage-consistent histories for the six states listed in the spec and one assistance example; no emails or Auth creation occur.
- [ ] Implement checkpoints only on fixture cases, preserving explicitly setup-bound test-client ownership. Receipt target IDs have no FK to resettable records. Retain pre-reset receipts: identical accepted replay returns its original receipt without mutations; a new action targeting a deleted fixture gets NOT_FOUND; reuse with changed payload gets VALIDATION. Repeating a reset action ID cannot reseed or increment generation twice. Test all four paths and inspect receipt survival after deletion.
- [ ] Enable authorized Realtime publication for case and related visible state. Do not rely on DELETE payloads alone for fixture resets: increment a workspace fixture-generation field in a record visible to affected members so clients re-fetch owned lists without receiving private record contents.
- [ ] Add Realtime ownership isolation coverage with separately authenticated A/B clients subscribed without owner filters to the same permitted table/event stream. Await both SUBSCRIBED, commit a B-owned control and await B's callback, then commit A's uniquely marked change and require A's exact revision callback. Commit a later B-owned fence change and await its callback on B's same channel. Assert B's collected payloads contain no A ID/marker before that fence. Run for every owner-scoped client-visible published table/event type; also test the production adapter path. Separately assert both authorized members receive only the non-sensitive shared workspace-generation signal, which is intentionally not an owner-private event. Missing controls, disconnects/channel errors, and a 15-second deadline are failures, never evidence of denial. Clean up channels in finally. This uses the ordered processing documented in [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes#scaling-postgres-changes), rather than treating a quiet timeout as proof. Include internal staff-note changes with presenter positive controls and no applicant data payload.
- [ ] Prevent raw DELETE events from exposing case IDs during fixture reset: configure the dedicated project's Realtime publication to publish INSERT/UPDATE only and inspect its catalog flags. RLS cannot authorize deleted rows. Do not rely merely on frontend filters; test a direct applicant subscription requesting DELETE and reset another client's fixtures, with an UPDATE control handler on that same channel and later ordered control events to establish delivery progress (a DELETE-only channel cannot receive the fence). Use the visible workspace generation update to trigger authorized refetch after reset. If a shared publication cannot be constrained without affecting unrelated consumers, use a dedicated non-deleted, RLS-protected change-notification table instead before enabling Realtime. Document the chosen migration and verify no raw delete path remains.

- [ ] Add `renderPresenterPanel({principal, people, selectedPersonId, connection})`, returning no privileged controls for applicants. Persona selection is local UI state, checked again server-side on every mutation. Keep sample-fill helper available independently in client forms. Confirm before reset/checkpoint changes.
- [ ] Extend RPC_SIGNATURES with reset/checkpoint entries so the anonymous inventory now covers all five public RPCs with valid argument shapes. Assert `error.code === '42501'` for every anonymous direct invocation and confirm no state changes; missing endpoints/signature errors must fail the test. Internal-helper API calls must fail because their schema is unexposed, and SQL ACL inspection must show no anon/authenticated helper EXECUTE. Run authenticated success cases too.
- [ ] Run fixture-count/history consistency, role-spoof, class-record preservation, revoked-member, stale-action, and synchronized-reset tests. Commit if possible.

## Task 10A: Local cross-browser verification

**Files:** Create `tests/support/browser-fixture.mjs`; rewrite `tests/browser.mjs`; extend test scripts in `package.json`.

**Owner:** One testing subagent. **Consumes:** Application and migrations through Task 9 plus the isolated test project and passed Task 5A. **Produces:** Both complete browser-role permutations and repeatable regression evidence.

- [ ] Verify test project guards before starting a test-configured local application server. Install browser runtimes with command-scoped Node24 PATH. Do not point automated cleanup or privileged auth calls at the classroom project.
- [ ] Reuse the helper already proven by Task 5A, and rerun its smoke test against the chosen test target before the story. Users are confirmed test accounts. Generate one code per login; enter it through the real form and assert the actual authenticated user ID. Never log codes or inject sessions.
- [ ] In email-free automation only, intercept the exact guarded test OTP-send endpoint with the CORS/OPTIONS handler below. Never intercept verify. This send step is simulated; hosted SMTP proof belongs to Task 10B.

```js
// Outline inside loginTestUser; secrets/admin stay in the Node test process.
const {data,error} = await admin.auth.admin.generateLink({
  type:'magiclink',email:actor.email,
});
if(error) throw error;
const otp = data.properties.email_otp;
assert.match(otp,/^[0-9]+$/);
const sendPattern = `${testAuthOrigin}/auth/v1/otp`;
let posts = 0;
const handler = async route => {
  const req = route.request();
  assert.equal(req.headers().origin,frontendOrigin);
  const headers = {
    'access-control-allow-origin':frontendOrigin,
    'access-control-allow-methods':'POST, OPTIONS',
    'access-control-allow-headers':'apikey, authorization, content-type, x-client-info, x-supabase-api-version',
    'vary':'Origin',
  };
  if(req.method()==='OPTIONS') return route.fulfill({status:204,headers});
  assert.equal(req.method(),'POST');
  assert.equal(++posts,1);
  return route.fulfill({status:200,headers,contentType:'application/json',body:'{}'});
};
await page.route(sendPattern,handler); // no times:1; OPTIONS is not a send
try {
  await page.getByLabel('Email address',{exact:true}).fill(actor.email);
  await page.getByRole('button',{name:'Send verification code',exact:true}).click();
  await page.getByLabel('Verification code',{exact:true}).fill(otp);
  await page.getByRole('button',{name:'Verify and continue',exact:true}).click();
  await assertAuthenticatedUser(page,actor.userId); // real session via app adapter
  assert.equal(posts,1);
} finally { await page.unroute(sendPattern,handler); }
```

- [ ] Parameterize `runStory({clientPage,staffPage,fixture})` and run it twice, each with fresh test fixtures: Chrome client/Firefox presenter, then Firefox client/Chrome presenter. Both engines must exercise client and staff behavior. Launch Chrome using `chromium.launch({channel:'chrome'})` and Firefox using `firefox.launch()`.
- [ ] `runStory` automates new application, reference-format assertion using imported REFERENCE_PATTERN, sample filling, submit, admin intake/claim, request document, follow-up/contact/resolve, client response, preparer verification, review claim/correction, resolution/resubmission, fresh review approval, and recorded follow-up. A second case uses direct approval. Assert no internal findings appear in either client engine. Use visible selectors and condition waits, not fixed sleeps.
- [ ] In **both** story permutations, capture the client's selected case, screen, form step, and open panel. Switch staff Alex → Sam → Morgan and reload the staff window; assert that client-local state stays identical while a separately triggered shared case update still arrives. Also open two independently opened presenter tabs/pages in the **same BrowserContext and origin** with the same account, choose different personas, refresh each, and assert each keeps its own persona/navigation. This detects accidental shared localStorage even when the main client has no persona control.
- [ ] Add browser regressions for simultaneous claims, two client identities, direct ID/reference lookup denial, role-forgery denial, disconnect/reconnect, unchanged raw action retry, dirty-answer conflict/reconciliation, fixed-code rejection, unknown-email neutral UI, assisted staff receipt, and fixture reset preserving class-created cases. Database suites prove the same restrictions through direct APIs.
- [ ] Capture safe fictional screenshots at 720px side-by-side and 390px mobile widths; avoid real email/token content. Inspect layouts, dialog keyboard focus, console errors, and overflow. Report actual engines and which send step was simulated. Review/commit this bounded test deliverable.

## Task 10B: Hosted projects, roster, and SMTP setup

**Files:** Setup notes in `docs/setup.md`; `.env.local`/`.env.test` remain ignored local configuration only.

**Owner:** Parent agent with the user, not an implementation subagent. **Consumes:** Account access and approved test recipient. **Produces:** Distinct classroom/test projects, real email access, and verified live configuration.

- [ ] Perform test-infrastructure setup early if Task 2 lacks an isolated local database. Provision or select separate test and classroom project identities; record them in ignored configuration and enforce the test URL/ref inequality guard. If two hosted project slots are unavailable, use an isolated local test instance or obtain approval for any paid alternative. Never combine privileged tests with the class project to save a slot.
- [ ] Request the school sender/presenter email and one approved test-client email only when setup begins. Additional roster members can be added later. User enters SMTP secrets directly in provider settings. Do not paste them into chat or expose them to browser assets.
- [ ] Load `.env.admin`, pass assertClassroomTarget against the explicitly confirmed classroom ref and session-mode SQL endpoint, then apply all migrations in order, audit effective function/table ACLs, pre-provision approved users, invoke the same privileged initializeWorkspace routine used by tests for permanent people/capabilities/memberships/bindings/default Sam, disable public/anonymous signup while retaining email sign-in (verify unknown-user creation is rejected), configure the OTP template with `{{ .Token }}`, and set the permitted application origins. Classroom setup uses its explicitly selected target and never imports test cleanup. Roster additions do not send invitations by default.
- [ ] Try permitted school Gmail SMTP first. If app passwords are unavailable, use the preselected **Resend SMTP** fallback on a presenter-controlled verified domain. The domain must actually be under their DNS control; a school address cannot be used as an unverified sender. Resend Free is the starting tier; domain registration, if needed, is separately approved. The built-in Supabase team-only sender is not a class fallback. See [Resend SMTP](https://resend.com/docs/send-with-smtp), [domain setup](https://resend.com/docs/dashboard/domains/introduction), and [Supabase default SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp).
- [ ] Confirm the hosted Auth minimum email resend interval in project settings; publish `AUTH_RESEND_COOLDOWN_SECONDS=serverInterval+5` (65 for a 60-second interval). Recheck this before rehearsal and test a legitimate resend after the client timer expires; never assume the local probe's interval is the hosted setting.
- [ ] With authorization for the specific test recipient, perform one real code delivery and verification using the actual class frontend; confirm arrival and own-case save/refresh persistence. Invalid/expired codes and sign-out/return are tested separately in the isolated environment; one delivered code cannot prove both expiry and successful verification. If live sign-out/return is also exercised, request a second real OTP only within the approved recipient-testing scope. No generated-link test substitutes for delivery evidence. Do not mail classmates or run destructive cleanup against the class project.
- [ ] Record completed setup checks and any still-missing account/domain requirements. Independent implementation/testing can continue while SMTP is pending, but live email success cannot be claimed until demonstrated.

## Task 10C: Documentation, rehearsal, and local handoff

**Files:** Update `README.md`, `docs/setup.md`, `docs/demo-script.md`, `.env.example`, `.gitignore`.

**Owner:** One documentation subagent. **Consumes:** Actual implementation/test evidence from Tasks 1–10B. **Produces:** Accurate setup/rehearsal instructions, without unverified completion claims.

- [ ] Document Node24 command-scoped PATH and `--env-file-if-exists=.env.local`, build/start/test commands, separate test-project guards, private test credentials, migration order, roster provisioning, and presenter/client login. `.env.example` lists empty public app URL/key values and the optional public resend duration; `.env.admin.example` documents the isolated privileged classroom setup variables and confirmation, with `.env.admin` ignored; `.env.test.example` documents required test variable names without real values and is ignored from the served app.
- [ ] Write a two-minute main story using one application amid six seeded cases, plus the longer correction and assisted-intake paths. Explain manual TaxSlayer milestones and simulated documents/reminders. Explain admin default assignment and preservation of preparer responsibility.
- [ ] Record test commands, results, both engine permutations, screenshots inspected, and hosted SMTP evidence separately. Check project availability and email delivery before rehearsal; do not promise a Free project stays continuously awake.
- [ ] Include how class members are added, why their cases survive fixture reset, and that ordinary users cannot impersonate staff. Describe return-by-email/application reference and neutral unknown-email messaging.
- [ ] Run documented commands in the configured environment, review links/paths for correctness, remove stale fixed-code instructions, and commit if possible. No real addresses or tokens enter the delivered docs/artifacts.

## Task 10D: Hosting and publication handoff

**Files:** Deployment-specific configuration only after a destination is chosen; update `docs/setup.md` with the resulting public URL/configuration.

**Owner:** Parent agent, with a bounded deployment subagent only after destination/authorization are established. **Consumes:** Reviewed local build, class Supabase configuration, and publication authorization. **Produces:** A verified class-accessible URL, or an explicit local-only handoff if hosting has not been authorized.

- [ ] Explain that localhost serves only the presentation computer. Ask the user for the hosting destination when publication is reached; do not invent or purchase one. Confirm actual repository/delivery location before copying outside the mirror.
- [ ] Build static/public assets with the pinned runtime and public-only environment config. Adapt the public-config delivery to the selected host without exposing test/admin/SMTP secrets. Do not deploy migrations, tests, rosters, or local environment files as static assets.
- [ ] Configure allowed origins/URLs for the actual host and verify approved-email access, client ownership, cross-browser updates, and absence of exposed secrets on the hosted app. Only an explicitly approved recipient is used for live email checks.
- [ ] Review the final diff and deployment preview; publish only with the user's authorization. Report a local-only artifact clearly if the destination remains unavailable. Provide the working URL and verified limits after successful publication.

## 4. Error behavior matrix

| Condition | Required behavior | Verification |
| --- | --- | --- |
| Non-roster email | No self-created user or data access; same neutral code-entry message/cooldown as approved email | Paired UI test + negative Auth/API test |
| Wrong/expired OTP | Stay on code entry; no application created | Auth/browser test |
| OTP-send failure/rate limit | Identical neutral code-entry notice and request-time server-interval-plus-5s cooldown (default 65s) for every valid address; never claim delivery or authenticate locally | Task 5/5A paired tests; observed codes recorded separately |
| Lost network during write | Retain form, unknown/pending outcome, retry same action ID | Adapter/controller/database tests |
| Another volunteer claims first | Server CONFLICT; refresh current assignment | Concurrent independent requests |
| Client forges staff/person ID | Own case: FORBIDDEN; another person's or missing case: NOT_FOUND; no event/write | Paired direct RPC test |
| Admin resolves follow-up | Preparer retained; document blocker unchanged | Workflow test |
| Review after corrections | New attempt/version required | Database test |
| Reset during pending fixture write | Old generation cannot recreate deleted data | Database/browser test |
| Remote refresh while editing | Preserve unsaved draft and make conflicts explicit | Controller test |
| Logout/revoked membership | Clear local sensitive state; server rejects further reads/writes | Auth/controller/database tests |

## 5. Spec coverage and handoff

| Spec sections | Implementing tasks |
| --- | --- |
| Purpose, scope, brand, constraints | 1, 6, 10C |
| Personas, identity, self-review | 2, 4, 5, 7, 9 |
| Group/class entry, email, IDs, sample filling | 1, 2, 5, 6, 10A, 10B |
| Board, assisted intake, assistance, reminders | 3A, 3B, 3D, 7, 8, 9 |
| Preparation, documents, admin tasks, closure | 3B, 3C, 3D, 6, 7, 8 |
| Review/corrections and client follow-up | 4, 7, 10A |
| Shared storage, policies, concurrency, errors | 2, 3A, 3B, 3C, 5, 6, 9 |
| Screens, presenter controls, fixtures | 6, 7, 8, 9 |
| Presentation and acceptance requirements | 10A, 10C and error matrix |
| Setup, Node runtime, provisional boundaries | 1, 2, 5, 5A, 10B, 10D |

Required user inputs are setup dependencies, not blockers to local implementation: school sender email/account permission, one approved test-client email, Supabase project/account participation, later class roster, and eventual hosting/repository destination. Secrets are entered through local/provider settings. Until hosted setup is available, proceed with local code and isolated tests, then explicitly report which live checks remain.

The user selected **subagent-driven execution**. Each numbered/lettered task is a separate bounded dispatch followed by review; no new execution-method approval is needed. Task 10B and publication decisions in 10D belong to the parent. Run the test-infrastructure part of 10B before dependent database tests when necessary. No implementation task is complete merely because this document exists.

## 6. Pre-implementation review disposition

| User finding | Resolution |
| --- | --- |
| 1. Missing reassignment/follow-up assignment | Reassignment remains an explicitly privileged historical test fixture, matching approved scope; server-side configured Sam assignment is now contractual. No unnecessary product actions added. |
| 2. Participation and document authority | Successful preparation claim inserts immutable participation; authority matrix defines request/verification. RECORD_DOCUMENT_RESPONSE supports unowned assisted cases. |
| 3. Supabase privileges | Explicit PUBLIC/anon/authenticated revocation, authenticated entry-only grants, table ACLs, private helpers, and anonymous tests for every RPC. Global-vs-schema default-privilege caveat documented. |
| 4. Errors and ordering | VT001–VT007 mapping, explicit SDK-error throwing, ordered stage-before-assignment validation, and owner/nonexistent NOT_FOUND parity. |
| 5. Optional environment file | Application uses --env-file-if-exists; strict test configuration remains required. Flag verified with installed Node v24.21.0. |
| 6. Test isolation | Separate test project/local instance with identity guard, no env fallback, and exact test-run cleanup manifest. |
| 7. References | Early shared alphabet/regex excludes I/O/0/1; creation tests assert format/uniqueness/retry stability and denied reference lookup. |
| 8. Controller | savedCase consistently; editBaseRevision and explicit REMOTE_CHANGED conflict prevent automatic overwrite. |
| 9. Whitelist test | Unwanted keys injected into both current/generated answers; implementation constructs from whitelist only. |
| 10. DOM mapping | Canonical data-case-action constants, eligible positive test, ineligible negative test, and dispatch assertion. |
| 11. Browser auth/engines | Both role-engine permutations; generateLink supplies OTP without email, real form and verify endpoint establish session. Send interception is test-only and explicitly simulated. |
| 12. Unknown email | Same neutral request copy/code state/cooldown; raw Auth errors hidden; direct API enumeration is not falsely claimed solved. |
| 13. Email fallback | Resend SMTP selected, requiring presenter-controlled verified domain; no default Supabase sender fallback. |
| 14. Task size | Task 3 split into 3A–3D; Task 10 split into 10A–10D, with parent-owned account setup/hosting. |
| 15. npm runtime | Node24 bin prepended to PATH per npm/tool command, including lifecycle scripts; no global change. |
| 16. Resolution/receipts | Only explicit RESOLVE_FOLLOWUP completes tasks; receipts use historical scalar target IDs without resettable FKs and survive resets. |

## 7. Second review disposition

| Finding | Revision |
| --- | --- |
| 1. Workspace setup | One private privileged initializer for class/tests; schema before data, Sam after people, explicit service_role grants. |
| 2. Reset identity | Permanent people/default/capabilities and durable fixture-client bindings survive reset; regression preserves Alex participation and client visibility. |
| 3. Check order | Operational authority is step 4 FORBIDDEN; prepare/review qualification is step 7 INELIGIBLE; Sam review claim explicitly tests INELIGIBLE. |
| 4. Assisted actor | create_case includes p_person_id, client-null/admin-required rules, creator attribution, and digest binding. |
| 5. SQL/guards | pg plus test database URL; hosted missing classroom ref fails; local exact loopback/instance manifest has its own strict guard. |
| 6. Realtime | A/B live positive controls and ordered fence events cover subscription isolation; raw DELETE publication is disabled. |
| 7. Follow-up | Verified document permits review submission with an open Sam task. |
| 8. Window isolation | Both story permutations plus two same-account presenter tabs sharing a BrowserContext prove local perspective isolation. |
| 9. Test examples | Reset sample now checks six fixtures, membership, denied reset, stable people/binding; assistance asserts revision 1 start and helper/final state. |
| 10. Auth risk | Early Task 5A and recorded throwaway two-engine probe; OPTIONS-safe CORS handler, confirmed users, real email OTP verification. |
| 11. Auth errors | All syntactically valid send outcomes neutral, including rate limits/unknown codes; exact observed versus source-only codes recorded separately. |

## 8. Task 1 authorization and follow-up review

Task 1 is complete and merged. Task 2 is approved for implementation. The prior review gate is satisfied. The design for the test-only workspace-extension helper/rerun policy and separate classroom target guard/configuration is settled before Task 2; implement them during Task 2 before dependent tests/setup use them. Later task requirements now explicitly include Realtime-enabled startup (9), repeated same-user generated-code login (5A), and a hosted-verified client cooldown longer than the server minimum (5/10B). The optional address-independent connection notice is accepted. The probe report is retained at `docs/superpowers/reviews/2026-09-15-vitally-auth-probe.md`; relative links from both documents resolve there.
