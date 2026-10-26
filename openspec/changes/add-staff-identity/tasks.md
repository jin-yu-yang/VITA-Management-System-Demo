Before apply: confirm `038` is still the next free migration number, and take a fresh test baseline on `main`.

Groups 1–2 come first, and group 3 needs them. Groups 4 and 5 need group 2's migration and can then run side by side. Group 6 needs 5. Group 7 can be written alongside, and is finished last.

## 1. Database tests first

- [x] 1.1 Add a staff helper to `tests/support/database-fixture.mjs`: `f.staff({ key, name, capabilities })` creates a confirmed test account, calls `vitally_private.add_staff_member` inside the setup lock, and returns a signed-in client plus the person id; the run manifest records the account so cleanup deletes it.
- [x] 1.2 Write `tests/database-staff-identity.mjs` with `createDatabaseFixture`. It fails until group 2 exists. It checks the `sign-in` spec:
  - the three access values, and another value refused;
  - commit refused for a staff membership without a person, and for a person linked to a presenter;
  - for each of `vitally_apply_action`, `vitally_close_unsigned`, `vitally_assistance_action`, `vitally_create_case` (assisted), `vitally_log_contact` and `vitally_edit_contact`: a staff call with null and with its own id acts as its own person, and another person's id is `VT001` with no receipt stored;
  - receipts record the resolved actor, and a replay with null or its own id returns the stored receipt;
  - capabilities still apply to staff;
  - a presenter naming a staff member's person is `VT001`, and naming Alex works as before;
  - a client naming a person is `VT001`;
  - `vitally_reset_fixtures` and `vitally_load_checkpoint` refuse staff.
- [x] 1.3 In the same file, check the `staff-case-work` spec:
  - Riley prepares and Jordan reviews one case, and history, receipts, participation and the review name each of them;
  - a staff member with `prepare` and `review` cannot claim review of their own case, and another reviewer can;
  - for every table in `STAFF_TABLES`, a staff member and a presenter in the same workspace read the same rows, a client's private draft is invisible to both, and nothing in the foreign workspace is visible;
  - a staff member receives the Realtime change a presenter receives (follow the pattern in `tests/database-realtime.mjs`).
- [x] 1.4 In the same file, check the roster-side database functions:
  - `add_staff_member` creates a linked staff member, and is a no-op on an identical repeat;
  - it refuses a reserved key (`alex`, `morgan`, `sam`), changed values, an unknown capability and a membership in another workspace;
  - `set_default_followup` assigns new escalations to the staff member, leaves Sam's open follow-up with Sam, and refuses a person without `followup`;
  - `initialize_workspace` re-runs succeed on a workspace that has staff, and a workspace with no presenter works once a staff member is its default follow-up person.

## 2. Database migration

- [x] 2.1 List every `'presenter'` occurrence in `supabase/migrations/*.sql` with the newest definition of the function or policy holding it. Record each as "accepts staff" or "stays presenter-only" (design D5) in the migration's header comment.
- [x] 2.2 Add `supabase/migrations/038_staff_identity.sql`, part 1 (design D2):
  - `memberships.access` allows `staff`;
  - `people.user_id`, unique per workspace, with the composite foreign key to `memberships`;
  - the deferred constraint trigger: a linked membership is `staff`, and each `staff` membership has exactly one person.
- [x] 2.3 Part 2 (design D3, D4): `vitally_private.acting_person`, following the table in D3. Redefine each entry point from its newest version so it calls the helper right after the membership lookup, before the digest and receipt, and uses the resolved id everywhere it used `p_person_id`:
  - `vitally_apply_action` (036);
  - `vitally_close_unsigned` (037);
  - `vitally_assistance_action` (005);
  - `vitally_create_case` (023);
  - `vitally_log_contact` and `vitally_edit_contact` (031).

  Do not redefine `check_authority`.
- [x] 2.4 Part 3 (design D5): redefine `check_operation_authority` (036), `lock_case` (003), `lock_assistance_item` (005) and `contact_person` (031) to accept `staff`. Drop and recreate each policy from 2.1 with `access in ('presenter','staff')`, its other conditions unchanged. This includes the questionnaire policies (033) and the filing policies (035); `filing_notes` gains a read policy only, with no write grant for staff. Leave the demo tools presenter-only.
- [x] 2.5 Part 4 (design D6, D7):
  - `vitally_private.add_staff_member` and `vitally_private.set_default_followup`, revoked from every browser role;
  - `initialize_workspace` redefined from 001 so re-runs check the three demo people instead of counting exactly 3, and accept any default person with `followup`.
- [x] 2.6 Diff every copied function and policy against its source and confirm only the intended lines changed. Run `npm run db:migrate:test`, then `npm run test:database`: the new suite and every existing one pass.
- [x] 2.7 Update `tests/support/rpc-signatures.mjs`: the public signatures are unchanged; the new private functions are not callable by `anon` or `authenticated`.

## 3. Admin tools

- [x] 3.1 Tests first in `tests/roster.test.mjs`:
  - the optional `staff` list (field checks, reserved keys, duplicates across all lists, unknown capabilities);
  - an optional `presenters`, with at least one presenter or staff member;
  - `defaultFollowup` naming a staff entry with `followup`, and required when the roster has no presenter;
  - no address is ever printed.
- [x] 3.2 `tools/admin/roster.mjs`: parse and validate as tested; create and confirm staff Auth accounts as for presenters; pass staff entries and `defaultFollowup` to `initializeWorkspace`.
- [x] 3.3 `tools/admin/workspace-setup.mjs`: inside the same serializable transaction, after `initialize_workspace`, call `add_staff_member` for each staff entry, then `set_default_followup` when given. Add a `staff` list and a commented `defaultFollowup` to `tools/admin/roster.example.json`.
- [x] 3.4 Run `npm test`, then run the roster command twice against the test stack with a fictional staff roster. The second run creates nothing.

## 4. Browser

- [x] 4.1 `src/contracts.mjs`: the principal's `access` adds `staff` and carries `personId` and `personName` for staff. `src/supabase-store.mjs`:
  - read the access type and, for staff, the linked person;
  - `SUBSCRIBED_TABLES.staff` is `STAFF_TABLES`;
  - wherever `access() === "presenter"` grants staff reads, it also grants them to staff;
  - staff calls send `p_person_id: null`;
  - reset and checkpoint stay presenter-only.

  Update `tests/store.test.mjs`.
- [x] 4.2 `src/controller.mjs`: one helper says "this window is staff" (presenter or staff) and replaces `presenter()` wherever staff behaviour is decided. For staff, the acting person is the principal's `personId`; `selectPerson`, reset and checkpoint are refused. `src/window-state.mjs` never saves or restores `selectedPersonId` for staff. Update `tests/controller.test.mjs` and `tests/window-state.test.mjs`.
- [ ] 4.3 `src/views.mjs` and `src/app.mjs`: route staff to the staff screens; the staff toast style and staff-only draft buttons apply to staff. `src/language.mjs`: staff screens are English. `src/presenter-views.mjs`: for staff, show "Signed in as <name>" and no picker, reset or checkpoint controls. Update `tests/presenter.test.mjs`, `tests/shell.test.mjs`, `tests/language.test.mjs` and `tests/client-language.test.mjs`.
- [ ] 4.4 Run `npm test`.

## 5. Browser story

- [ ] 5.1 `tests/support/browser-fixture.mjs` and `tests/support/story-pages.mjs`: sign in a staff account (reuse `loginTestUser`) and read the "Signed in as" line.
- [ ] 5.2 `tests/browser.mjs`, a staff-identity phase:
  - two fictional staff accounts (Riley, `prepare`; Jordan, `review`), each in its own window and engine, with no persona picker and no reset or checkpoint controls;
  - Riley claims and submits a case; Jordan's board updates live, Jordan claims and approves it, and the case history names each of them;
  - Riley cannot claim review of a case Riley prepared;
  - a persona left in browser storage from a presenter window is ignored.

  The existing presenter story stays unchanged.
- [ ] 5.3 Run `npm run test:auth-browser` and `npm run test:browser`.

## 6. Documentation

- [ ] 6.1 `docs/developer/database.md`: the `staff` access, `people.user_id`, `acting_person` and the D3 table, the two new private functions, and migration 038 in the migrations table.
- [ ] 6.2 `docs/developer/architecture.md` and `docs/developer/frontend.md`: who can see what for staff, and the principal and controller changes.
- [ ] 6.3 `docs/developer/backend.md`: the roster's `staff` list and `defaultFollowup`; fix "There is no CI" to describe `.github/workflows/ci.yml`. `docs/setup.md`: adding fictional staff rehearsal accounts.
- [ ] 6.4 `docs/developer/production-roadmap.md` §1: real staff accounts exist; what remains (visibility, roles, presenter removal). `docs/developer/README.md`: the glossary entries Membership, Person / persona and Capability.

## 7. Final checks

- [ ] 7.1 Run `npm test`, `npm run build:hant -- --check`, `npm run build:intake` (nothing to commit) and `npx openspec validate --all`.
- [ ] 7.2 Run `npm run db:migrate:test` and `npm run test:database`, then `npm run test:auth-browser` and `npm run test:browser`. Compare with the baseline taken on `main` before apply (at #97: unit 1336, database 421, browser story 77; count sign-in then), each plus the new tests, with no failures.
