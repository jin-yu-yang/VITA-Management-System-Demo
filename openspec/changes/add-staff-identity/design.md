## Context

**How staff identity works today.**
- A staff window signs in with a `presenter` membership and picks a persona from `people` in the browser (`presenter-views.mjs`, `selectedPersonId`).
- Every staff RPC call carries that persona as `p_person_id`.
- `people` rows are not linked to Auth accounts.
- `vitally_private.check_operation_authority` (newest in migration 018) checks that the persona exists in the member's workspace and has the action's capability. It never checks that the caller is that person.

**Where `access = 'presenter'` is tested.** Each place below must learn about `staff`, or stay presenter-only on purpose:
- about 16 RLS policies (migrations 001, 002, 006, 011, 013, 017, 031);
- the row locks `lock_case` (003) and `lock_assistance_item` (005);
- `contact_person` and the inline checks in `vitally_log_contact` and `vitally_edit_contact` (031);
- assisted mode in `vitally_create_case` (023);
- the demo tools: `vitally_reset_fixtures`, `vitally_load_checkpoint` and `seed_fixtures` (009, 019, 023);
- in the browser: `supabase-store.mjs`, `controller.mjs`, `views.mjs`, `app.mjs`, `language.mjs`.

**How the raw `p_person_id` flows.** Each public entry point computes a request digest and reserves an `action_receipts` row from the raw `p_person_id` (`actor_person_id`) before any authority check. `check_authority` (018) reads `p_person_id is null` as "the client is acting" for `SAVE_ANSWERS`, `SUBMIT` and `UPDATE_CONTACT`. It does not test the access type itself.

**Workspace setup.**
- `initialize_workspace` (001) creates Alex (`prepare`), Morgan (`review`) and Sam (`admin`, `assist`, `followup`, `receive_documents`).
- It makes Sam the workspace's `default_followup_person_id`, which `ESCALATE_CONTACT` (004) assigns new follow-ups to.
- It refuses a re-run unless the workspace has exactly 3 people and Sam is the default.
- `tools/admin/roster.mjs` refuses a roster without a presenter. It creates Auth accounts through the admin API, outside the database transaction, then calls `initialize_workspace` in a serializable transaction.

**Constraints.**
- Applied migrations are final; every changed function or policy is redefined in a new migration, copied from its newest version.
- The classroom demo (`docs/demo-script.md`) and the browser story switch one presenter window between personas, and must keep passing.
- Staff screens stay English.
- Fictional data only.

**Stakeholders.**
- The volunteers and office staff who will sign in.
- The team: the classroom demo; #73's lifecycle chain, which edits the same functions.
- PCDC's site coordinator, who decides roles and capabilities later.

## Goals / Non-Goals

**Goals:**
- A `staff` account always acts as its own `people` row, decided by the database from `auth.uid()`.
- Every record of "who did this" names the signed-in staff member: receipts, case history, participation, reviews, contact log.
- The independence rule holds across real accounts.
- Staff see exactly what presenters see, including through Realtime.
- Staff accounts, and optionally the default follow-up person, are created from the roster. Staff-only workspaces work.
- A staff account gets the staff screens without the persona picker or the demo tools.
- Presenter and client behaviour, and every RPC signature, stay unchanged.

**Non-Goals:**
- Narrowing staff visibility to their own and claimable cases.
- Mapping the spec's volunteer roles to capabilities.
- An admin screen; changing an existing staff member's capabilities; deactivating staff.
- Removing presenter mode, the persona picker or `p_person_id`.
- Client-facing changes; hosted deployment.

## Decisions

### D1: Add `staff` beside `presenter`
- **Choice:** a third membership access, `staff`, linked to exactly one person. `presenter` is unchanged.
- **Reason:** the real path is enforced while the classroom demo and the browser story keep working. Removing demo parts is roadmap §5, a separate change.
- **Alternatives considered:**
  - Replacing presenter outright: breaks the demo script and most of the story.
  - Linking several people to one presenter account: an account could still act as several people.

### D2: Link people to accounts with `people.user_id`
- **Choice:** `people.user_id uuid null`, unique per workspace, with a composite foreign key to `memberships(workspace_id, user_id)`.
  - A deferred constraint trigger enforces, at commit, that a linked membership is `staff` and that every `staff` membership has exactly one linked person.
  - The demo people stay unlinked.
- **Reason:**
  - The person already carries the name and capabilities that every action checks, so linking it is the smallest change.
  - Commit-time enforcement means a half-made staff member can never be saved, yet the creation function can insert the membership and the person in either order.
- **Alternatives considered:**
  - `memberships.person_id`: puts staff detail on a table clients also have rows in, and the person would still need to be unique.
  - A separate link table: more joins for no gain at one person per account.

### D3: Resolve the acting person first, at every entry point
- **Choice:** a private helper, `vitally_private.acting_person(p_member public.memberships, p_person_id uuid) returns public.people`. Each public RPC that takes `p_person_id` calls it right after finding the membership, before its digest and receipt, and uses the resolved id wherever it used `p_person_id`. The RPCs: `vitally_apply_action` (017), `vitally_assistance_action` (005), `vitally_create_case` (023), `vitally_log_contact` and `vitally_edit_contact` (031).

  | Access | `p_person_id` | Result |
  | --- | --- | --- |
  | `applicant` | null | null (the client acts) |
  | `applicant` | anything | `FORBIDDEN` (today's rule) |
  | `presenter` | a person in the workspace with no `user_id` | that person |
  | `presenter` | a staff member's person, or unknown | `FORBIDDEN` |
  | `staff` | null, or its own person's id | its own person |
  | `staff` | anyone else | `FORBIDDEN` |

- **Reason:**
  - The receipt and digest are computed before any authority check, and `check_authority` treats a null person as the client. So the swap must happen at the top of each entry point.
  - After the swap, a staff call looks exactly like a presenter call with a valid persona. `check_authority` and every action branch then work unchanged.
- **Alternatives considered:**
  - Resolving inside `check_operation_authority` only: receipts would record no actor, and a staff call sending null would be judged as the client.
  - Requiring staff to send their own id: the browser would still be claiming an identity, for no extra safety.

### D4: Presenters cannot act as staff people
- **Choice:** the helper refuses a presenter whose `p_person_id` names a linked person.
- **Reason:** otherwise presenter mode is a way around real identity in any workspace that has both.
- **Alternatives considered:** allowing it in "demo" workspaces would need a workspace flag. No workspace mixes them yet, so the stricter rule costs nothing.

### D5: Accept `staff` wherever staff behaviour is decided
- **Choice:**
  - Every presenter-only check that grants staff behaviour accepts `access in ('presenter','staff')`, with its other conditions copied unchanged: the RLS policies, `lock_case`, `lock_assistance_item`, `contact_person`, the inline checks in the two contact-log RPCs, assisted mode in `vitally_create_case`, and `check_operation_authority`'s guard.
  - The demo tools stay presenter-only: `vitally_reset_fixtures`, `vitally_load_checkpoint` and `seed_fixtures`' presenter lookup.
  - The implementation searches every migration for `'presenter'` and records a decision for each hit.
- **Reason:** staff visibility is unchanged by agreement (Q4). The search keeps a missed check from turning into a mysterious `NOT_FOUND`.
- **Alternatives considered:** a helper such as `is_staff_access(access)` used everywhere. Rejected for now: every policy is being rewritten anyway, and the visibility change after this one rewrites them again with the real rule.

### D6: Staff come from the roster, as new people only
- **Choice:**
  - The roster file takes an optional `staff` list (`email`, `name`, `personKey`, `capabilities`) and an optional `defaultFollowup` (a `personKey` from that list).
  - `presenters` becomes optional; a roster needs at least one presenter or one staff member.
  - `roster.mjs` creates and confirms each Auth account as it does today. Then, inside `initializeWorkspace`'s transaction, it calls `vitally_private.add_staff_member(workspace, user, key, name, capabilities)` for each staff entry and `vitally_private.set_default_followup(workspace, key)` when given.
  - `add_staff_member` inserts the `staff` membership and the linked person, or confirms both if they already exist with identical values. It refuses different values for an existing key or account, a reserved key (`alex`, `morgan`, `sam`), a membership in another workspace, and capabilities outside the known set.
  - `set_default_followup` refuses a person without `followup`. It moves only the default; open follow-ups keep their assignee.
- **Reason:**
  - The roster is already how accounts exist (public sign-up is off).
  - New-people-only keeps the demo personas intact.
  - Refusing different values matches how `initialize_workspace` treats conflicting re-runs; changing capabilities is out of scope.
- **Alternatives considered:**
  - An admin screen: out of scope.
  - Linking existing people: breaks the demo personas and the sample cases.
  - Moving open follow-ups: needs an audit trail, and the user chose new follow-ups only.

### D7: `initialize_workspace` re-runs survive staff
- **Choice:** redefine it so a re-run checks that the three demo people exist with their keys, names and capabilities unchanged, ignoring linked staff rows, instead of counting exactly 3 people. It accepts any current default whose person has `followup`, instead of only Sam. A new workspace still gets Alex, Morgan and Sam, with Sam as the default.
- **Reason:** without this, the first roster run that adds staff makes every later run fail.
- **Alternatives considered:** not creating the demo people in staff-only workspaces. Rejected: the sample-case code expects them, and unused rows cost nothing.

### D8: Atomicity of roster runs
- **Choice:** memberships, people and the follow-up default are atomic (one serializable transaction). The Auth account is not: it is created first through the admin API, as for presenters today. A failed run can leave a confirmed account with no membership; a re-run completes it.
- **Reason:** Auth's admin API is outside the database transaction. This is the existing behaviour.

### D9: The browser treats `staff` as staff with a fixed person
- **Choice:**
  - `contracts.mjs`: the principal's `access` adds `staff` and carries `personId`.
  - `supabase-store.mjs`: reads the access type and the linked person; staff share `STAFF_TABLES`, subscriptions and case lists with presenters; staff calls send `p_person_id: null`; reset and checkpoint stay presenter-only.
  - `controller.mjs`: where today's `presenter()` decides staff behaviour, it means presenter or staff. For staff, the acting person comes from the principal, and the persona actions are refused.
  - `views.mjs` and `app.mjs`: route staff to the staff screens.
  - `presenter-views.mjs`: for staff, shows "Signed in as <name>" and no picker, reset or checkpoints.
  - `window-state.mjs`: never saves a persona for staff.
  - `language.mjs`: staff screens are English.
- **Reason:** staff use the same screens and data, and only who is acting differs. Sending null means the browser never claims an identity (D3).
- **Alternatives considered:** a separate staff shell: duplicates the presenter screens for no behaviour difference.

### D10: Specs
- **Choice:**
  - A new capability, `sign-in`, for what a signed-in account acts as and how staff accounts are created. No canonical spec covers sign-in yet; this starts it, for this slice only.
  - Delta requirements in `staff-case-work` for attribution, independence across accounts, staff visibility and the staff screens for a staff account.
- **Reason:** CLAUDE.md names capabilities by feature area in the team's words, and writes specs only for what the change touches.

## Risks / Trade-offs

- [Risk] **A policy or check copied by hand changes a condition, or one is missed.** → Mitigation:
  - the new database suite compares the rows a staff account and a presenter can read in every staff table, and checks each public RPC as staff;
  - the `'presenter'` search (D5) records a decision for every hit;
  - the existing database, sign-in and browser suites must pass unchanged.
- [Risk] **A redefined function is copied from a stale version and undoes a later change.** → Mitigation: copy each one from its newest `create or replace`, found by searching all migrations, and diff the copy against its source in review.
- [Risk] **A merge conflict with #73's lifecycle chain,** which redefines `vitally_apply_action`, its helpers and the stage functions, and may touch the same policies. → Mitigation: agree the order with the team before apply (Open Questions). Whoever merges second rebuilds their migration on the other's newest definitions and renumbers it. Keep this change's redefinitions to the minimum D3 and D5 need.
- [Trade-off] **Two staff paths (presenter and staff) until presenter mode is removed.** → Accepted: one helper decides the acting person for every access type, so there is one place to read, and the demo keeps working.
- [Trade-off] **Staff see every submitted case, as presenters do.** → Accepted for this round. Visibility is the next change, and no real client data is allowed before it (roadmap: sections 1, 3 and 8).
- [Risk] **Orphaned Auth accounts after a failed roster run.** → Accepted (D8): unchanged behaviour; a re-run completes them.

## Migration Plan

1. Merge `main` into the branch. Confirm `032` is still the next free migration number; renumber if not.
2. `npm run db:migrate:test` applies `032_staff_identity.sql` to the local stack. Then run `npm run test:database`, `npm test`, `npm run test:auth-browser` and `npm run test:browser`.
3. Existing workspaces need nothing:
   - no membership becomes `staff` by itself;
   - presenters and clients behave as before;
   - Sam stays the default follow-up person until a roster sets another.
4. To add staff: add a `staff` list (and optionally `defaultFollowup`) to the roster file and re-run `tools/admin/roster.mjs`.
5. Rollback: a follow-up migration can revoke `staff` behaviour. Applied migrations are never edited. No data is moved, so there is nothing to restore; staff memberships and linked people can be deleted by an operator.
6. The classroom project does not exist yet. When it does, the migration is applied there with `migrate.mjs --target classroom` like any other.

## Open Questions

- **Order against #73's lifecycle chain.** Owner: the user, with the team (Jinyu and Hailey). #73 says the chain and this change cannot be built at the same time without conflicts, and makes the chain the M3 priority (Oct 21). It affects when apply starts, the migration number, and which change rebuilds its redefinitions on the other's. It does not affect this design. Planning can finish and be reviewed now.
- **Role-to-capability mapping.** Owner: the team with PCDC's site coordinator. It affects only which capabilities a roster grants, not this design.
- **Narrowed staff visibility.** Owner: the team, as the next change. It affects every policy and `lock_case` again.
