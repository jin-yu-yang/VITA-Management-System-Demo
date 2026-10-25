<!--
Raw capture of superpowers:brainstorming output.

本檔原樣捕捉 brainstorming skill 的產出，不強制結構。
Skill 的自然產出通常是 decision log 格式（背景 → 決議鏈 Q1-Qn → 設計取捨），
但依對話內容可能有不同組織方式。

design.md 從本檔萃取並重新整理為結構化設計文件。

不要將本檔的內容複製到 design.md — design.md 是獨立的重組產物，
兩者互補但不重疊。
-->

# add-staff-identity: brainstorm (2026-10-18)

The design was worked out in conversation with the user on 2026-10-18, before propose. This file
records it as a decision log. Items marked **(builder's call)** were not discussed with the user;
they are defaults chosen so the design is complete, and the user can overturn any of them at
review.

## Background

Roadmap §1 (`docs/developer/production-roadmap.md`, "Staff identity") is the first gap between the
demo and something PCDC could use. Today:

- A staff window signs in with an account whose membership is `access = 'presenter'`. The
  presenter picks a persona (Alex, Morgan, Sam: rows in `people`, created by
  `vitally_private.initialize_workspace`) in the browser, and every staff RPC call carries that
  persona as `p_person_id`.
- `vitally_private.check_operation_authority(member, p_person_id, type)` (newest version in 018)
  checks only that the persona exists in the member's workspace and has the capability the action
  needs. It never checks that this account *is* that person. Two staff accounts can both act as
  "Alex", and anyone with a presenter account can act as anyone.
- `people` rows are not linked to Auth accounts at all.
- About 16 RLS policies test `m.access = 'presenter'` (migrations 001, 002, 006, 011, 013, 017,
  031). Presenters see every case except other clients' unsubmitted drafts.
- The classroom demo (`docs/demo-script.md`) and the browser story (`tests/browser.mjs`) depend on
  one staff window switching personas: Sam handles the follow-up, Alex prepares, Morgan reviews.

The goal: a staff member signs in as themselves, and the database, not the browser, decides who is
acting. The independence rule (a preparer never reviews their own case) works on person ids and
must keep working unchanged.

## Decision log

### Q1. Replace presenter mode, or add real staff beside it?

Options compared:

- **A. Replace presenter entirely.** Every persona becomes its own account; the demo needs three
  staff windows. Rejected: breaks the demo script and most of the 59-step browser story, and
  removing demo-only parts is already a separate roadmap step (§5).
- **B. Add a new membership access `staff` beside `presenter`.** A `staff` membership is linked to
  exactly one person; it gets no persona picker, and the database ignores the browser's persona
  claim. `presenter` stays exactly as it is for demo workspaces until the demo-removal change.
- **C. Link several people to one presenter account,** with the picker showing only "your"
  people. Rejected: half-way; a staff account can still act as several people.

**Decision (user): B.** The real path is enforced, the classroom demo keeps working, and the
change stays smaller. Accepted cost: two staff paths in the database until presenter mode is
removed.

### Q2. The RPC contract

**Decision (user):**

- Keep every public RPC signature unchanged (`p_person_id` stays), so existing browsers, tests and
  `tests/support/rpc-signatures.mjs` keep working.
- For a `staff` member, the acting person is the `people` row linked to `auth.uid()`'s membership.
  `p_person_id` must be null or equal that person; anything else is refused with `FORBIDDEN`
  (VT001).
- For a `presenter` member: unchanged.
- For an `applicant` member: unchanged.
- Dropping `p_person_id` comes later, with presenter removal.

The public RPCs this covers: `vitally_apply_action`, `vitally_assistance_action`,
`vitally_create_case` (assisted mode), `vitally_log_contact`, `vitally_edit_contact`.
`vitally_reset_fixtures` and `vitally_load_checkpoint` stay presenter-only: they are demo tools,
and a `staff` member is refused as today's non-presenters are.

### Q3. How staff accounts come into being

**Decision (user):**

- The roster file gains a `staff` list. Each entry: `email`, `name` (display name), `personKey`
  (a `people.person_key`) and `capabilities` (a subset of `prepare`, `review`, `admin`, `followup`,
  `receive_documents`, `assist`).
- `tools/admin/roster.mjs` creates the confirmed, password-free Auth account, the `staff`
  membership and the linked `people` row, in one transaction.
- The workspace's default follow-up person, today hardcoded to Sam by `initialize_workspace`,
  becomes a roster setting naming one staff entry, which must have the `followup` capability.
- No admin screen in this change.

### Q3a. Questions from the builder check (user, 2026-10-18)

- **Staff-only workspaces: presenters become optional.** The roster accepts a file with staff and
  no presenter, as PCDC's workspace will be. `initialize_workspace` still creates Alex, Morgan and
  Sam there, unused. With no presenter, nobody can reset sample cases or load checkpoints. That is
  correct, since those are presenter-only; `seed_fixtures`' refusal of a workspace with no
  presenter stays as it is. A roster must still name at least one presenter or one staff member.
- **Staff are always new people.** The demo keys `alex`, `morgan` and `sam` are reserved. A staff
  entry using one is refused, by the roster and by the staff-creation function. The function
  therefore only inserts a new linked person, or confirms one that already exists with identical
  values; it never links an existing unlinked person.
- **Follow-up default: new follow-ups only.** With no `defaultFollowup`, Sam stays the default.
  With one, new follow-ups (`ESCALATE_CONTACT`) go to that staff member, and open follow-ups stay
  with whoever has them. In a workspace with both presenters and staff, presenters cannot act as
  that assignee. That is accepted, and is the operator's choice.

### Q4. What staff can see

**Decision (user):** unchanged. A `staff` member sees exactly what a presenter sees today. Every
policy that tests `access = 'presenter'` accepts `'staff'` as well. Narrowing visibility
(volunteers see only their own and claimable cases) is a separate, later change: the roadmap says
it must change every policy and `lock_case` together, and it needs its own decision about the rule.

### Q5. Scope boundary

**In:** `staff` access; `people` linked to accounts; the acting person derived from `auth.uid()`
for staff; roster support for staff and for the follow-up default; browser support for a signed-in
staff member (no picker, a fixed acting person); tests; docs.

**Out:** narrowing staff visibility; mapping the spec's volunteer roles (Site Coordinator, VITA
Volunteer...) to capabilities, which needs PCDC input (owner: the team, with PCDC's site
coordinator; it affects only which capabilities the roster grants, not this design); an admin
screen for managing staff; removing presenter mode, the persona picker or `p_person_id`; any
change for clients.

### Q6. Dependencies

- Supabase Auth, PostgREST, Realtime on the local stack (CLI 2.117.0, PostgREST pinned to 16.3):
  **ready** (stack created 2026-10-18; unit 1120/1120, database 272/272, sign-in 20/20 on main).
- Hosted classroom project: **not needed**. Everything is tested on the local stack.
- No new library, and no Supabase upgrade.

### Q7. Acceptance

The change passes when:

- A `staff` account can act only as its own person. Sending another person's id is refused with
  `FORBIDDEN`, for every public RPC that takes `p_person_id`. Sending null or its own id acts as
  its own person, and the receipt records that person.
- A `staff` membership with no linked person cannot be committed. **(builder's call: this
  replaces "acting with no linked person is refused", which the commit-time check makes
  unreachable through normal paths. The test asserts the commit is refused rather than bypassing
  the check.)**
- A `staff` member who prepared a case cannot claim or approve its review (the independence rule
  holds when each person is their own account).
- Staff see exactly the rows presenters see, including through Realtime.
- `staff` members cannot reset fixtures or load checkpoints.
- Presenter and applicant behaviour is unchanged: the existing database, sign-in and browser suites
  pass unmodified, except where a test asserts the exact set of access values.
- A roster with a `staff` list creates linked accounts, and re-running it creates nothing new.
  A staff-only roster (no presenters) works. A staff entry using `alex`, `morgan` or `sam` is
  refused.
- With `defaultFollowup` set, a new follow-up is assigned to that staff member, and open ones are
  not moved. Without it, Sam stays the default.
- In the browser, a staff account sees the staff screens with no persona picker, shows who is
  signed in, and its actions are attributed to its own person.
- A browser scenario: two staff accounts in separate windows work one case (one prepares, the
  other reviews), and the second cannot review a case they prepared.
- Checks: `npm test`; `npm run db:migrate:test` then `npm run test:database`;
  `npm run test:auth-browser`; `npm run test:browser`. CI's checks pass, including
  `npx openspec validate --all`.

## Design detail

### Database (new migration `032_staff_identity.sql`, hand-written)

Applied migrations are never edited, so every function and policy that changes is redefined here,
copied from its newest version and changed.

1. **Schema.**
   - `memberships.access` check widens to `('applicant','presenter','staff')`.
   - `people.user_id uuid null`, unique per workspace, with a composite foreign key to
     `memberships(workspace_id, user_id)`. A trigger or check ensures a linked membership is
     `staff`, and a `staff` membership has exactly one linked person **(builder's call: enforce in
     the staff-creation function plus a deferred constraint trigger, so a half-made staff member can
     never commit)**.
2. **Resolving the acting person.** A new private helper (working name
   `vitally_private.acting_person(p_member public.memberships, p_person_id uuid)`) returns the
   `people` row the call acts as:
   - `applicant`: `p_person_id` must be null, returns null (today's rule).
   - `presenter`: today's rule (the persona must exist in the workspace) **plus (builder's call) a
     presenter may not act as a person linked to a staff account.** Otherwise presenter mode would
     be a back door around real identity in any workspace that holds both.
   - `staff`: the linked person; `p_person_id` must be null or that person's id, else `FORBIDDEN`.
3. **Authority: resolve the person at each entry point, first.** The builder check found that
   the raw `p_person_id` is used before and beside `check_operation_authority`, so resolving it
   there alone is not enough:
   - `check_authority` (018) reads `p_person_id is null` as "the client is acting" for
     `SAVE_ANSWERS`, `SUBMIT` and `UPDATE_CONTACT`;
   - the request digest and `reserve_receipt(..., p_person_id)` record
     `action_receipts.actor_person_id` from the raw argument (017, 005, 031).

   So each entry point calls the helper **before** its digest and receipt, and passes the resolved
   person id everywhere it passes `p_person_id` today:
   - `vitally_apply_action` (from 017);
   - `vitally_assistance_action` (from 005);
   - `vitally_create_case` (from 023);
   - `vitally_log_contact` and `vitally_edit_contact` (from 031).

   A staff call that sends null is then indistinguishable, downstream, from one that sends its
   own id. Anything recorded as "who did this" (`action_receipts`, `case_events`,
   `created_by_person_id`, participation, reviews, contact log authors) records the signed-in
   staff member. `check_operation_authority`'s capability branches do not change.
3a. **Presenter-only checks outside the policies** must also accept `staff`, or every staff
   action fails. None of these is redefined after the migration named:
   - `vitally_private.lock_case` (003): it tests `p_member.access='presenter'`, so without the
     change a staff case action returns `NOT_FOUND`;
   - `vitally_private.lock_assistance_item` (005);
   - `vitally_private.contact_person` (031), which `vitally_log_contact` and
     `vitally_edit_contact` use instead of `check_operation_authority`;
   - the inline `access<>'presenter' or p_person_id is null` checks in `vitally_log_contact` and
     `vitally_edit_contact` (031);
   - the assisted-mode check in `vitally_create_case` (023), which also reads `p_person_id`
     directly.

   The implementation must search every migration for `'presenter'` and account for each hit:
   either it accepts `staff`, or it stays presenter-only on purpose (fixtures and checkpoints).
4. **Visibility.** Each policy that tests `access = 'presenter'` is dropped and recreated with
   `access in ('presenter','staff')`. The rule's other conditions are copied unchanged. This
   includes `presenter_people`, so staff can read the people list.
5. **Staff creation.** A private function, revoked from every browser role, creates or confirms a
   staff member: membership `staff`, person row linked to it, with the given key, name and
   capabilities. Re-running it with the same values is a no-op; different values for an existing
   person are refused **(builder's call: refuse, as `initialize_workspace` refuses conflicting
   re-runs today; changing a staff member's capabilities is out of scope)**.
6. **Follow-up default.** A private function sets `workspaces.default_followup_person_id` to a
   named staff person, refusing one without `followup`. `initialize_workspace` is redefined only as
   far as needed for re-runs to keep working once staff exist. Two checks refuse them today:
   - a default that is not Sam;
   - a people count other than exactly 3 (001, line 132). Once staff people exist, every roster
     re-run would fail. The count check becomes "the three demo people exist and are unchanged",
     ignoring linked staff rows.

   It still creates Alex, Morgan and Sam.
7. **Fixtures.** Untouched. The sample cases keep using the demo personas; reset and checkpoint
   stay presenter-only.

### Admin tools

- `tools/admin/roster.mjs`: read and validate the optional `staff` list and `defaultFollowup` (a
  `personKey` from that list). Create each Auth account as it does for presenters, then call the
  staff-creation function and the follow-up function inside `initializeWorkspace`'s transaction.
  Never print an address (existing rule).
- **Atomicity, corrected by the builder check:** Q3's "one transaction" holds for the
  membership, person and follow-up default, which run inside `initializeWorkspace`'s serializable
  transaction. It does not hold for the Auth account: `applyRoster` creates and confirms it
  through the admin API first, outside that transaction, as it does for presenters today. A failed
  run can leave a confirmed account with no membership. A re-run then completes it, so this is
  acceptable and unchanged.
- `tools/admin/workspace-setup.mjs`: pass the staff entries through.
- `tools/admin/roster.example.json`: show a `staff` list.

### Browser

- `src/contracts.mjs`: the principal's `access` adds `'staff'`, and the principal carries
  `personId` for staff.
- `src/supabase-store.mjs`: read the access type and, for staff, the linked person. Staff use the
  same tables, subscriptions and case lists as presenters (`STAFF_TABLES`). Staff calls send
  `p_person_id` as null **(builder's call: null rather than the linked id, so the browser never
  claims an identity at all)**. Reset and checkpoint remain presenter-only.
- `src/controller.mjs`: "is staff" means presenter or staff wherever today's `presenter()` decides
  staff behaviour. For staff, the acting person comes from the principal, never from
  `selectedPersonId`, and the picker actions are refused.
- `src/views.mjs`, `src/app.mjs`: route staff accounts to the staff screens.
- `src/presenter-views.mjs`: for staff, no persona picker, reset or checkpoint controls; show
  "Signed in as <name>" instead.
- `src/window-state.mjs`: never save or restore a persona for staff.
- `src/language.mjs`: staff screens are English, as for presenters.

Staff screens stay English (project rule); no client text changes, so `build:hant` is untouched.

### Tests

- New database suite (working name `tests/database-staff-identity.mjs`) for the acceptance list
  above, written first.
- `tests/support/database-fixture.mjs`: create staff accounts and sign them in.
- Unit tests for the store, controller, presenter views, window state and roster.
- `tests/browser.mjs` and its support files: the two-staff-account scenario. The existing presenter
  story stays as it is.

### Docs

`docs/developer/database.md`, `architecture.md`, `frontend.md`, `backend.md` (roster format, and the
outdated "There is no CI" line), `production-roadmap.md` (§1 partly done; visibility and presenter
removal remain), `docs/setup.md` (staff rehearsal accounts), `docs/developer/README.md` (glossary:
Membership, Person). No new documents under `docs/superpowers/`.

### Specs

- New capability `sign-in`: what a signed-in account acts as (applicant, presenter, staff), and how
  staff accounts are created. Today no canonical spec covers sign-in, so this change starts it, for
  this slice only.
- `staff-case-work` (exists): staff actions are attributed to the signed-in staff member, and the
  independence rule holds across accounts. Only the requirements this change touches.

## Risks

- **Policy copying.** Recreating about 16 policies by hand can silently change a condition.
  Mitigation: the new suite checks that staff and presenters see identical row sets across every
  staff table, and the existing suites still pass.
- **Function copying.** The redefined entry points are copied from five different migrations. A
  stale copy would undo a later change. Mitigation: copy from the newest definition, found by
  searching every migration for each `create or replace`, and diff each copy against its source.
- **Two staff paths** until presenter removal. Mitigation: one helper decides the acting person for
  every access type, so there is only one place to read.
- **Migration number clash.** No other branch had migration 032 or later on 2026-10-18. Recheck
  before archive (CLAUDE.md step 8 merges `main` first).

## Update after merging `main` (2026-10-25)

The lifecycle chain (#91, #95–#97) merged to `main` after this brainstorm, so these points changed. The other decisions above stand.
- The migration is `038_staff_identity.sql`; 032–037 are taken.
- `vitally_close_unsigned` (037) takes `p_person_id`, so it resolves the acting person too: six entry points, not five.
- Functions are copied from their newest definitions (`vitally_apply_action` and `check_operation_authority` are in 036).
- The questionnaire (033) and filing (035) policies also accept `staff`; `filing_notes` stays read-only and append-only.
- New (user, 2026-10-25): a roster with no presenter must name `defaultFollowup`, because escalated follow-ups and withdrawal notices (036) would otherwise go to Sam, whom nobody can act as in that workspace.
