-- 038: staff identity (OpenSpec change add-staff-identity, design D1-D9).
--
-- A new membership access, `staff`, is linked to exactly one `people` row, so
-- the database can say who is acting instead of trusting a persona the browser
-- names. `presenter` is unchanged.
--
-- This file is built in parts. Part 1 (this section) holds the inventory below
-- and the schema. Later parts append to the same file: the `acting_person`
-- resolver and the six entry points, then the widened locks, authority check and
-- policies, then `add_staff_member`, `set_default_followup` and
-- `initialize_workspace`.
--
-- The 'presenter' inventory (design D5)
-- -------------------------------------
-- Made with `grep -n "'presenter'" supabase/migrations/*.sql`, then
-- `grep -n presenter` for the comment hits, and checked against the live
-- definitions (pg_policies and pg_proc of the test stack). A later `create or
-- replace function`, or a later `drop policy` and `create policy`, supersedes an
-- earlier one, so each object lists only the migration that holds its NEWEST
-- definition. Every older hit is superseded and needs no decision.
--
-- Decision "accepts staff": the check becomes `access in ('presenter','staff')`
-- with every other condition copied unchanged. Part 3 redefines the object,
-- copied from the newest migration named here.
--
-- A. Functions
--
--   | Object                                          | Newest | Decision                |
--   |-------------------------------------------------|--------|-------------------------|
--   | vitally_private.check_operation_authority       | 036    | accepts staff (guard)   |
--   | vitally_private.lock_case                       | 003    | accepts staff           |
--   | vitally_private.lock_assistance_item            | 005    | accepts staff           |
--   | vitally_private.contact_person                  | 031    | accepts staff           |
--   | public.vitally_log_contact (inline check)       | 031    | accepts staff           |
--   | public.vitally_edit_contact (inline check)      | 031    | accepts staff           |
--   | public.vitally_create_case (assisted mode)      | 023    | accepts staff           |
--   | vitally_private.initialize_workspace            | 001    | no access test to widen (see below); part 4 rewrites it for D6/D7 |
--   | public.vitally_reset_fixtures                   | 009    | stays presenter-only    |
--   | public.vitally_load_checkpoint                  | 009    | stays presenter-only    |
--   | vitally_private.seed_fixtures                   | 023    | stays presenter-only    |
--
--   Notes on the functions:
--   * check_operation_authority: the guard `if p_member.access<>'presenter'`
--     (036 line 647) is the one hit. 003, 004, 005, 006, 013, 017, 018, 032 and
--     035 held earlier copies, all superseded by 036. Part 3 widens only the
--     guard.
--   * lock_case (003): `p_member.access='presenter' and (c.origin<>'client' or
--     c.stage<>'draft')`. lock_assistance_item (005): `p_member.access='presenter'`
--     in its visibility test.
--   * contact_person (031) and the two inline checks in vitally_log_contact and
--     vitally_edit_contact (031): `p_member.access<>'presenter' or
--     p_person_id is null` becomes `p_member.access not in
--     ('presenter','staff') or p_person_id is null`.
--   * vitally_create_case (023): the assisted-mode test `v_member.access<>
--     'presenter'`. The 001 copy of the same line is superseded.
--   * Stays presenter-only, on purpose, because these are classroom demo tools
--     and must not be reachable by a real staff account: vitally_reset_fixtures
--     and vitally_load_checkpoint (009, check `v_member.access<>'presenter'`),
--     and seed_fixtures' lookup of the presenter that the sample rows are
--     recorded against (023; 009 and 019 held superseded copies).
--   * Comment-only hits, no decision needed: vitally_private.act_close_case
--     (036 line 525, "case_events is presenter-only"), 005 line 187, 032
--     line 334 and 035 line 504 (the same sentence in superseded copies), and
--     the descriptive comments in 006, 007, 011, 013, 031, 033 and 035.
--
-- B. Row-level security policies (all `for select to authenticated`). Every
--    one accepts staff, so staff see exactly what presenters see.
--
--   | Policy                                  | Table                          | Newest |
--   |-----------------------------------------|--------------------------------|--------|
--   | presenter_people                        | people                         | 001    |
--   | visible_cases                           | cases                          | 001    |
--   | visible_document_requests               | document_requests              | 002    |
--   | visible_documents                       | documents                      | 002    |
--   | visible_client_events                   | client_events                  | 002    |
--   | presenter_preparation_participants      | preparation_participants       | 002    |
--   | presenter_admin_followups               | admin_followups                | 002    |
--   | presenter_contact_attempts              | contact_attempts               | 002    |
--   | presenter_case_events                   | case_events                    | 002    |
--   | presenter_assistance_items              | assistance_items               | 002    |
--   | presenter_reviews                       | reviews                        | 006    |
--   | visible_case_contacts                   | case_contacts                  | 011    |
--   | presenter_case_materials                | case_materials                 | 013    |
--   | visible_case_document_cards             | case_document_cards            | 017    |
--   | presenter_contact_log                   | contact_log                    | 031    |
--   | presenter_contact_log_versions          | contact_log_versions           | 031    |
--   | presenter_preparer_questionnaires       | preparer_questionnaires        | 033    |
--   | presenter_reviewer_questionnaires       | reviewer_questionnaires        | 033    |
--   | presenter_filing_attempts               | filing_attempts                | 035    |
--   | presenter_filing_returns                | filing_returns                 | 035    |
--   | presenter_filing_notes                  | filing_notes                   | 035    |
--
--   Notes on the policies:
--   * 21 policies. The `visible_*` ones also carry an applicant branch (their
--     own case); only the presenter branch widens, the applicant branch is
--     copied unchanged.
--   * filing_notes stays append-only: its policy is widened for READING only.
--     Staff get no insert, update or delete grant, and 035's append-only trigger
--     is untouched.
--
-- Other 'presenter' text: initialize_workspace (001) only writes presenter rows
-- (`select u as id,'presenter' as access`), and part 4 adds staff rows to it.
-- The 001 hit `v_member.access<>'presenter'` at line 206 is in the superseded
-- version-1 copy of vitally_create_case, not in initialize_workspace. Every
-- other occurrence is in a comment.
--
-- Part 1: the schema ------------------------------------------------------

-- 1. The access values. The column's inline check from 001 has the default
-- name `memberships_access_check`. `drop constraint if exists` first, so this
-- file can be applied again over an earlier version of itself in development.
alter table public.memberships drop constraint if exists memberships_access_check;
alter table public.memberships add constraint memberships_access_check
 check(access in ('applicant','presenter','staff'));

-- 2. The link from a person to the staff account that is that person. Null for
-- every existing person (the demo people stay unlinked). One account is one
-- person in a workspace; the composite foreign key keeps the account inside the
-- same workspace as the person. A null user_id skips the foreign key. It is
-- deferred like the trigger below, so the person may be inserted before its
-- membership in one transaction.
alter table public.people add column if not exists user_id uuid;
alter table public.people drop constraint if exists people_workspace_user_unique;
alter table public.people add constraint people_workspace_user_unique unique(workspace_id,user_id);
alter table public.people drop constraint if exists people_membership_fkey;
alter table public.people add constraint people_membership_fkey
 foreign key(workspace_id,user_id) references public.memberships(workspace_id,user_id)
 deferrable initially deferred;

-- 3. Commit-time rule (D2): a linked membership is `staff`, and every `staff`
-- membership has a linked person. It is deferred, so one transaction can insert
-- the membership and the person in either order. The row is read again at
-- commit, so a row removed or changed later in the transaction is judged as it
-- ends. More than one person per account is already impossible, because of the
-- unique constraint above.
create or replace function vitally_private.check_staff_links() returns trigger
 language plpgsql security definer set search_path=''
as $$
declare
 v_access text;
 v_workspace uuid;
 v_user uuid;
begin
 if tg_table_name='memberships' then
  v_workspace=new.workspace_id; v_user=new.user_id;
 else
  v_workspace=new.workspace_id; v_user=new.user_id;
  if tg_op='UPDATE' and old.user_id is not null and old.user_id is distinct from new.user_id then
   -- The person stopped being linked: the account it left must still have one.
   select m.access into v_access from public.memberships m
    where m.workspace_id=old.workspace_id and m.user_id=old.user_id;
   if v_access='staff' and not exists(select 1 from public.people p
    where p.workspace_id=old.workspace_id and p.user_id=old.user_id) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  end if;
  if v_user is null then
   return null;
  end if;
 end if;
 select m.access into v_access from public.memberships m
  where m.workspace_id=v_workspace and m.user_id=v_user;
 if not found then
  return null;
 end if;
 if v_access='staff' then
  if not exists(select 1 from public.people p where p.workspace_id=v_workspace and p.user_id=v_user) then
   raise sqlstate 'VT007' using message='VALIDATION';
  end if;
 elsif exists(select 1 from public.people p where p.workspace_id=v_workspace and p.user_id=v_user) then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 return null;
end $$;
revoke all on function vitally_private.check_staff_links() from public,anon,authenticated,service_role;

drop trigger if exists memberships_staff_links on public.memberships;
create constraint trigger memberships_staff_links after insert or update on public.memberships
 deferrable initially deferred for each row execute function vitally_private.check_staff_links();
drop trigger if exists people_staff_links on public.people;
create constraint trigger people_staff_links after insert or update on public.people
 deferrable initially deferred for each row execute function vitally_private.check_staff_links();
