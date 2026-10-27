## Why

Staff sign in with a shared "presenter" account and pick a persona (Alex, Morgan, Sam) in the browser. Every staff action sends that persona as `p_person_id`, and the database checks only that the persona has the capability, never that the signed-in account is that person. Anyone with a presenter account can act as anyone, and nothing is truly attributed to a real volunteer. This is the first gap on the production roadmap (§1, Staff identity), and the "permission states" part of #73 waits for it. Real staff accounts let each volunteer sign in as themselves, with the database deciding who is acting. The classroom demo keeps working unchanged.

## What Changes

**A new kind of account: staff**

- From: memberships are `applicant` (a client) or `presenter` (a demo staff account that can act as any persona).
- To: a third access type, `staff`, linked to exactly one person in `people`. A staff account always acts as its own person.
- Impact: non-breaking. Presenters and clients are unchanged.

**The database decides who is acting**

- From: the browser names the acting person in `p_person_id`, and the database trusts it.
- To: for staff, the database takes the person linked to the signed-in account. A `p_person_id` that names anyone else is refused (`FORBIDDEN`). Receipts, history, participation, reviews and contact-log authors record the signed-in staff member. A presenter may not act as a person who belongs to a staff account. RPC signatures do not change.
- Impact: non-breaking for existing callers. The independence rule (a preparer never reviews their own case) now holds across real accounts.

**Staff accounts come from the roster**

- From: the roster creates presenters and clients; the workspace always gets Alex, Morgan and Sam, with Sam as the default follow-up person; a roster with no presenter is refused.
- To: the roster also takes a `staff` list (email, name, person key, capabilities) and an optional `defaultFollowup` naming one staff member with the `followup` capability. Presenters become optional, so a staff-only workspace works. A roster with no presenter must name a `defaultFollowup`, so office follow-ups never go to a demo persona nobody can act as. The keys `alex`, `morgan` and `sam` stay reserved for the demo. Re-running a roster still creates nothing new.
- Impact: existing roster files keep working.

**The staff screens for a staff account**

- A staff account gets the same staff screens as a presenter, with no persona picker, no sample reset or checkpoints, and "Signed in as <name>". Staff screens stay English.

**Not in this change**

- Narrowing what staff can see: staff see exactly what presenters see today. A later change.
- Mapping the spec's volunteer roles (Site Coordinator, VITA Volunteer and others) to capabilities.
- An admin screen for managing staff, or changing an existing staff member's capabilities.
- Removing presenter mode, the persona picker or `p_person_id`.
- Anything client-facing.

**Tracking:** part of #73 (its "permission states" item waits for real staff accounts). The PR says "Part of #73" and uses no closing keyword.

## Capabilities

### New Capabilities

- `sign-in`: who a signed-in account acts as (client, presenter or staff); how the database resolves the acting person for each; how staff accounts and the default follow-up person are created from the roster; staff-only workspaces.

### Modified Capabilities

- `staff-case-work`: staff actions are attributed to the signed-in staff member; the independence rule holds across staff accounts; staff see the same cases and rows as presenters, live; the staff screens for a staff account (no persona picker, no reset or checkpoints, who is signed in).

## Impact

- **Database:** one hand-written migration, `038_staff_identity.sql`:
  - schema: `memberships.access` gains `staff`; `people.user_id` links a person to a staff membership, with a commit-time check that each staff membership has exactly one person;
  - a private helper that resolves the acting person, called first by each public RPC that takes `p_person_id` (`vitally_apply_action`, `vitally_close_unsigned`, `vitally_assistance_action`, `vitally_create_case`, `vitally_log_contact`, `vitally_edit_contact`);
  - redefined: `check_operation_authority`, `lock_case`, `lock_assistance_item`, `contact_person` and `initialize_workspace`;
  - about 21 RLS policies recreated to accept `staff`, including the questionnaire and filing tables (`filing_notes` stays read-only and append-only);
  - private functions to create staff members and set the follow-up default;
  - fixtures, reset and checkpoints unchanged and presenter-only.
- **Admin tools:** `tools/admin/roster.mjs`, `tools/admin/workspace-setup.mjs`, `tools/admin/roster.example.json`.
- **Browser:** `src/contracts.mjs`, `src/supabase-store.mjs`, `src/controller.mjs`, `src/views.mjs`, `src/app.mjs`, `src/presenter-views.mjs`, `src/window-state.mjs`, `src/language.mjs`.
- **Tests:**
  - a new database suite for staff identity, plus the database fixture's staff helper;
  - unit tests for the store, controller, presenter views, window state and roster;
  - a two-staff-account scenario in the browser story;
  - existing suites otherwise unchanged.
- **Docs:** `docs/developer/` (database, architecture, frontend, backend, roadmap, README glossary) and `docs/setup.md`.
- **Related work:** #73's lifecycle chain (#91, #95–#97) redefined the same functions and policies and is now on `main`. This change builds on its newest definitions (036, 037).
