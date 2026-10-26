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
-- with every other condition copied unchanged, from the newest migration named
-- here. Part 3 redefines the four helper functions and the 21 policies. The
-- three public entry points that hold their own inline check
-- (vitally_create_case in assisted mode, vitally_log_contact and
-- vitally_edit_contact) were redefined in part 2, together with the
-- acting-person change to the same functions.
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
--   * contact_person (031): `p_member.access<>'presenter' or p_person_id is
--     null` becomes `p_member.access not in ('presenter','staff') or
--     p_person_id is null` (part 3).
--   * The two inline checks in vitally_log_contact and vitally_edit_contact
--     (031) test the resolved person, so in part 2 `v_member.access<>
--     'presenter' or p_person_id is null` became `v_member.access not in
--     ('presenter','staff') or v_person.id is null`.
--   * vitally_create_case (023): the assisted-mode test `v_member.access<>
--     'presenter'` became `v_member.access not in ('presenter','staff')` in
--     part 2. The 001 copy of the same line is superseded.
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

-- Part 2: the acting person (design D3, D4) -------------------------------

-- 4. Who is acting, decided by the database. Every public RPC that takes
-- `p_person_id` calls this right after finding the membership, before its
-- request digest and its receipt, and uses the returned id wherever it used
-- `p_person_id`. So a staff call looks exactly like a presenter call with a
-- valid persona, and the receipt records the staff member's own person.
--
--   | Access    | p_person_id                                | Result                |
--   |-----------|--------------------------------------------|-----------------------|
--   | applicant | null                                       | nulls (the client)    |
--   | applicant | anything                                   | FORBIDDEN (see below) |
--   | presenter | a person of the workspace with no user_id  | that person           |
--   | presenter | a staff member's person, or unknown        | FORBIDDEN             |
--   | staff     | null, or its own person's id               | its own person        |
--   | staff     | anyone else                                | FORBIDDEN             |
--
-- A presenter sending null gets nulls, as before: the checks after this one
-- refuse it exactly as they do today (no staff action accepts a presenter
-- without a persona), so their order of errors is unchanged.
--
-- An applicant naming a person is still refused with FORBIDDEN, but by the
-- same later checks as today, not here: the id is handed on unchanged, so the
-- target is looked up first and a forged persona on a case or item the client
-- cannot see is the same NOT_FOUND as before (tests/database-assistance.mjs,
-- tests/database-review.mjs). Every entry point refuses an applicant with a
-- person: check_operation_authority's guard, vitally_create_case's client and
-- assisted checks, and the contact RPCs' inline check. An applicant is never
-- given nulls for a named person, which would make the call the client's own.
create or replace function vitally_private.acting_person(p_member public.memberships,p_person_id uuid)
returns public.people language plpgsql stable security definer set search_path='' as $$
declare v_person public.people;
begin
 if p_member.access='staff' then
  select * into v_person from public.people
   where workspace_id=p_member.workspace_id and user_id=p_member.user_id;
  if not found or (p_person_id is not null and p_person_id<>v_person.id) then
   raise sqlstate 'VT001' using message='FORBIDDEN';
  end if;
 elsif p_person_id is null then
  null;
 elsif p_member.access='presenter' then
  select * into v_person from public.people
   where workspace_id=p_member.workspace_id and id=p_person_id and user_id is null;
  if not found then
   raise sqlstate 'VT001' using message='FORBIDDEN';
  end if;
 elsif p_member.access='applicant' then
  v_person.id=p_person_id;
 else
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 return v_person;
end;
$$;
revoke all on function vitally_private.acting_person(public.memberships,uuid) from public,anon,authenticated,service_role;

-- 5. The six entry points, each copied from its newest definition with its
-- revoke and grant. The only changes: `v_person` is resolved by acting_person
-- right after the membership lookup, and `v_person.id` replaces every later
-- `p_person_id` (the digest's personId, reserve_receipt, the authority checks
-- and the rows written). Where the function had no `v_person`, its declaration
-- is added. The signatures are unchanged.
--   * vitally_apply_action: from 036.
--   * vitally_close_unsigned: from 037. acting_person runs before its
--     check_operation_authority, which now gets the resolved id.
--   * vitally_assistance_action: from 005 (later migrations only re-grant it).
--   * vitally_create_case: from 023. It finds its membership inline, so the
--     person is resolved right after that lookup. Assisted mode accepts staff
--     (`access not in ('presenter','staff')`, inventory above).
--   * vitally_log_contact and vitally_edit_contact: from 031. Their inline
--     check becomes `access not in ('presenter','staff') or v_person.id is null`.

create or replace function public.vitally_apply_action(p_action_id uuid,p_case_id uuid,p_expected_revision bigint,p_person_id uuid,p_type text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.memberships;
 v_receipt public.action_receipts;
 v_case public.cases;
 v_person public.people;
 v_outcome jsonb;
 v_digest text;
begin
 v_member=vitally_private.require_membership();
 v_person=vitally_private.acting_person(v_member,p_person_id);
 -- A malformed envelope cannot be digested or reserved; payload contents are
 -- still whitelisted at step 5, after the target and authority checks.
 if p_action_id is null or p_case_id is null or p_expected_revision is null or p_type is null
  or p_payload is null or jsonb_typeof(p_payload)<>'object' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 v_digest=encode(extensions.digest(jsonb_build_object('operation',p_type,'caseId',p_case_id,'expectedRevision',p_expected_revision,'personId',v_person.id,'payload',p_payload)::text,'sha256'),'hex');
 v_receipt=vitally_private.reserve_receipt(v_member,p_action_id,p_type,v_digest,v_person.id);
 -- An identical accepted replay returns its receipt after the current membership
 -- and operation-authority checks, without repeating the mutation and without
 -- reaching the target, which may since have been deleted.
 if v_receipt.receipt is not null then
  perform vitally_private.check_operation_authority(v_member,v_person.id,p_type);
  return v_receipt.receipt;
 end if;
 v_case=vitally_private.lock_case(v_member,p_case_id);
 v_person=vitally_private.check_authority(v_member,v_case,v_person.id,p_type);
 if v_case.revision<>p_expected_revision then
  raise sqlstate 'VT003' using message='CONFLICT';
 end if;
 perform vitally_private.check_payload(p_type,p_payload);
 perform vitally_private.check_related(v_case,p_type,p_payload);
 case p_type
  when 'SAVE_ANSWERS' then v_outcome=vitally_private.act_save_answers(v_member,v_case,v_person,p_payload);
  when 'SUBMIT' then v_outcome=vitally_private.act_submit(v_member,v_case,v_person,p_payload);
  when 'VERIFY_INTAKE' then v_outcome=vitally_private.act_verify_intake(v_member,v_case,v_person,p_payload);
  when 'CLAIM_PREPARATION' then v_outcome=vitally_private.act_claim_preparation(v_member,v_case,v_person,p_payload);
  when 'REQUEST_DOCUMENT' then v_outcome=vitally_private.act_request_document(v_member,v_case,v_person,p_payload);
  when 'RESPOND_DOCUMENT' then v_outcome=vitally_private.act_respond_document(v_member,v_case,v_person,p_payload);
  when 'RECORD_DOCUMENT_RESPONSE' then v_outcome=vitally_private.act_record_document_response(v_member,v_case,v_person,p_payload);
  when 'VERIFY_DOCUMENT' then v_outcome=vitally_private.act_verify_document(v_member,v_case,v_person,p_payload);
  when 'ESCALATE_CONTACT' then v_outcome=vitally_private.act_escalate_contact(v_member,v_case,v_person,p_payload);
  when 'RECORD_CONTACT' then v_outcome=vitally_private.act_record_contact(v_member,v_case,v_person,p_payload);
  when 'RESOLVE_FOLLOWUP' then v_outcome=vitally_private.act_resolve_followup(v_member,v_case,v_person,p_payload);
  when 'SUBMIT_REVIEW' then v_outcome=vitally_private.act_submit_review(v_member,v_case,v_person,p_payload);
  when 'CLAIM_REVIEW' then v_outcome=vitally_private.act_claim_review(v_member,v_case,v_person,p_payload);
  when 'REQUEST_CORRECTIONS' then v_outcome=vitally_private.act_request_corrections(v_member,v_case,v_person,p_payload);
  when 'RESUBMIT_REVIEW' then v_outcome=vitally_private.act_resubmit_review(v_member,v_case,v_person,p_payload);
  when 'APPROVE_REVIEW' then v_outcome=vitally_private.act_approve_review(v_member,v_case,v_person,p_payload);
  when 'RECORD_REVIEW_CONTACT' then v_outcome=vitally_private.act_record_review_contact(v_member,v_case,v_person,p_payload);
  when 'REMIND' then v_outcome=vitally_private.act_remind(v_member,v_case,v_person,p_payload);
  when 'CLOSE_CASE' then v_outcome=vitally_private.act_close_case(v_member,v_case,v_person,p_payload);
  when 'START_SCREENING' then v_outcome=vitally_private.act_start_screening(v_member,v_case,v_person,p_payload); -- 032
  when 'MARK_READY_TO_EFILE' then v_outcome=vitally_private.act_mark_ready_to_efile(v_member,v_case,v_person,p_payload); -- 032
  when 'MARK_EFILED' then v_outcome=vitally_private.act_mark_efiled(v_member,v_case,v_person,p_payload); -- 032
  when 'RECORD_FILING_RESULT' then v_outcome=vitally_private.act_record_filing_result(v_member,v_case,v_person,p_payload); -- 035
  when 'RETURN_TO_SIGNING' then v_outcome=vitally_private.act_return_to_signing(v_member,v_case,v_person,p_payload); -- 035
  when 'REQUEST_DOCUMENTS_AT_INTAKE' then v_outcome=vitally_private.act_request_documents_at_intake(v_member,v_case,v_person,p_payload); -- 036
  when 'PUT_ON_HOLD' then v_outcome=vitally_private.act_put_on_hold(v_member,v_case,v_person,p_payload); -- 036
  when 'RESUME_FROM_HOLD' then v_outcome=vitally_private.act_resume_from_hold(v_member,v_case,v_person,p_payload); -- 036
  when 'WITHDRAW' then v_outcome=vitally_private.act_withdraw(v_member,v_case,v_person,p_payload); -- 036
  when 'UPDATE_CONTACT' then v_outcome=vitally_private.act_update_contact(v_member,v_case,v_person,p_payload);
  when 'RECORD_MATERIALS' then v_outcome=vitally_private.act_record_materials(v_member,v_case,v_person,p_payload);
  when 'SET_DOCUMENT_CARD' then v_outcome=vitally_private.act_set_document_card(v_member,v_case,v_person,p_payload);
  when 'SET_DOCUMENT_GROUP' then v_outcome=vitally_private.act_set_document_group(v_member,v_case,v_person,p_payload);
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
 return vitally_private.commit_action(v_member,v_case,v_person,p_action_id,p_type,v_outcome,v_receipt);
end;
$$;
revoke all on function public.vitally_apply_action(uuid,uuid,bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.vitally_apply_action(uuid,uuid,bigint,uuid,text,jsonb) to authenticated;

create or replace function public.vitally_close_unsigned(p_action_id uuid,p_person_id uuid,p_cases jsonb,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.memberships;
 v_person public.people;
 v_receipt public.action_receipts;
 v_case public.cases;
 v_item jsonb;
 v_ids uuid[]:='{}';
 v_id uuid;
 v_revisions jsonb:='{}'::jsonb;
 v_digest text;
 v_cases jsonb:='[]'::jsonb;
 v_revision bigint;
 v_result jsonb;
begin
 v_member=vitally_private.require_membership();
 v_person=vitally_private.acting_person(v_member,p_person_id);
 -- Admin only: a null person and a person without `admin` are FORBIDDEN.
 perform vitally_private.check_operation_authority(v_member,v_person.id,'CLOSE_CASE');
 if p_action_id is null or p_confirmed is not true or p_cases is null or jsonb_typeof(p_cases)<>'array'
  or jsonb_array_length(p_cases)=0 then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 for v_item in select value from jsonb_array_elements(p_cases) loop
  if jsonb_typeof(v_item)<>'object'
   or (select count(*) from jsonb_object_keys(v_item))<>2
   or not (v_item ? 'caseId') or not (v_item ? 'revision')
   or jsonb_typeof(v_item->'caseId')<>'string'
   or (v_item->>'caseId')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or jsonb_typeof(v_item->'revision')<>'number'
   or (v_item->>'revision')::numeric<>trunc((v_item->>'revision')::numeric) then
   raise sqlstate 'VT007' using message='VALIDATION';
  end if;
  v_id=(v_item->>'caseId')::uuid;
  if v_id=any(v_ids) then
   raise sqlstate 'VT007' using message='VALIDATION';
  end if;
  v_ids=array_append(v_ids,v_id);
  v_revisions=v_revisions||jsonb_build_object(v_id::text,v_item->'revision');
 end loop;
 v_digest=encode(extensions.digest(jsonb_build_object('operation','CLOSE_UNSIGNED','cases',p_cases,
  'personId',v_person.id)::text,'sha256'),'hex');
 v_receipt=vitally_private.reserve_receipt(v_member,p_action_id,'CLOSE_UNSIGNED',v_digest,v_person.id);
 if v_receipt.receipt is not null then
  return v_receipt.receipt;
 end if;
 -- Lock in a fixed order so two closes cannot deadlock, and check every case
 -- before changing any.
 select array_agg(x order by x) into v_ids from unnest(v_ids) as x;
 foreach v_id in array v_ids loop
  v_case=vitally_private.lock_case(v_member,v_id);
  if v_case.revision<>(v_revisions->>(v_id::text))::numeric
   or not (v_case.stage='review_approved' or (v_case.stage='on_hold' and v_case.hold_origin='review_approved')) then
   raise sqlstate 'VT003' using message='CONFLICT';
  end if;
 end loop;
 foreach v_id in array v_ids loop
  select * into v_case from public.cases where id=v_id;
  perform vitally_private.close_case_steps(v_case,'dismissed');
  insert into public.case_events(workspace_id,case_id,actor_user_id,actor_person_id,action,detail)
  values(v_case.workspace_id,v_case.id,v_member.user_id,v_person.id,'CLOSE_CASE',
   jsonb_build_object('reason','dismissed','seasonEnd',true));
  insert into public.client_events(workspace_id,case_id,action,message)
  values(v_case.workspace_id,v_case.id,'CLOSE_CASE',vitally_private.closed_line('dismissed'));
  update public.cases set revision=revision+1,updated_at=now() where id=v_id returning revision into v_revision;
  v_cases=v_cases||jsonb_build_array(jsonb_build_object('caseId',v_id,'reference',v_case.reference,'revision',v_revision));
 end loop;
 v_result=jsonb_build_object('actionId',p_action_id,'cases',v_cases);
 update public.action_receipts set target_id=null,target_reference=null,receipt=v_result where id=v_receipt.id;
 return v_result;
end;
$$;
revoke all on function public.vitally_close_unsigned(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.vitally_close_unsigned(uuid,uuid,jsonb,boolean) to authenticated;

create or replace function public.vitally_assistance_action(p_action_id uuid,p_item_id uuid,p_expected_revision bigint,p_person_id uuid,p_type text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.memberships;
 v_receipt public.action_receipts;
 v_item public.assistance_items;
 v_person public.people;
 v_operation text;
 v_digest text;
 v_revision bigint;
begin
 v_member=vitally_private.require_membership();
 v_person=vitally_private.acting_person(v_member,p_person_id);
 -- A malformed envelope cannot be digested or reserved; the note is still
 -- checked at step 5, after the target and authority checks.
 if p_action_id is null or p_item_id is null or p_expected_revision is null or p_type is null then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 v_operation='ASSISTANCE:'||p_type;
 v_digest=encode(extensions.digest(jsonb_build_object('operation',v_operation,'itemId',p_item_id,'expectedRevision',p_expected_revision,'personId',v_person.id,'note',p_note)::text,'sha256'),'hex');
 v_receipt=vitally_private.reserve_receipt(v_member,p_action_id,v_operation,v_digest,v_person.id);
 -- An identical accepted replay returns its receipt after the current membership
 -- and operation-authority checks, without repeating the mutation and without
 -- reaching the target.
 if v_receipt.receipt is not null then
  perform vitally_private.check_operation_authority(v_member,v_person.id,v_operation);
  return v_receipt.receipt;
 end if;
 v_item=vitally_private.lock_assistance_item(v_member,p_item_id);
 v_person=vitally_private.check_operation_authority(v_member,v_person.id,v_operation);
 if v_item.revision<>p_expected_revision then
  raise sqlstate 'VT003' using message='CONFLICT';
 end if;
 perform vitally_private.check_assistance_note(p_type,p_note);
 case p_type
  when 'CLAIM' then v_revision=vitally_private.act_assistance_claim(v_item,v_person);
  when 'RESOLVE' then v_revision=vitally_private.act_assistance_resolve(v_item,v_person,p_note);
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
 return vitally_private.commit_assistance(p_action_id,v_item,v_revision,v_receipt);
end;
$$;
revoke all on function public.vitally_assistance_action(uuid,uuid,bigint,uuid,text,text) from public,anon,authenticated;
grant execute on function public.vitally_assistance_action(uuid,uuid,bigint,uuid,text,text) to authenticated;

create or replace function public.vitally_create_case(p_action_id uuid,p_mode text,p_person_id uuid,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.memberships;
 v_person public.people;
 v_user uuid=auth.uid();
 v_digest text;
 v_receipt public.action_receipts;
 v_case uuid;
 v_reference text;
 v_result jsonb;
 v_generation bigint;
 v_random bytea;
 v_constraint text;
 v_owner uuid;
 v_capabilities text[];
begin
 select * into v_member from public.memberships where user_id=v_user and active for share;
 if v_user is null or not found then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 v_person=vitally_private.acting_person(v_member,p_person_id);
 if p_mode='client' then
  if v_member.access<>'applicant' or v_person.id is not null then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
  v_owner=v_user;
 elsif p_mode='assisted' then
  if v_member.access not in ('presenter','staff') then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
  select capabilities into v_capabilities from public.people where id=v_person.id and workspace_id=v_member.workspace_id;
  if not found then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
  if not ('admin'=any(v_capabilities)) then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 else raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 if p_action_id is null or p_answers is null or jsonb_typeof(p_answers)<>'object' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 if p_answers<>'{}'::jsonb then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 v_digest=encode(extensions.digest(jsonb_build_object('operation','CREATE_CASE','mode',p_mode,'personId',v_person.id,'answers',p_answers)::text,'sha256'),'hex');
 select fixture_generation into v_generation from public.workspaces where id=v_member.workspace_id;
 insert into public.action_receipts(workspace_id,actor_user_id,action_id,operation,request_digest,actor_person_id,generation)
 values(v_member.workspace_id,v_user,p_action_id,'CREATE_CASE',v_digest,v_person.id,v_generation) on conflict(workspace_id,actor_user_id,action_id) do nothing;
 select * into v_receipt from public.action_receipts where workspace_id=v_member.workspace_id and actor_user_id=v_user and action_id=p_action_id for update;
 if v_receipt.operation<>'CREATE_CASE' or v_receipt.request_digest<>v_digest then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 if v_receipt.receipt is not null then return v_receipt.receipt;
 end if;
 loop
  v_random=extensions.gen_random_bytes(8);v_reference='VT-';
  for i in 0..7 loop
   if i=4 then v_reference=v_reference||'-';
 end if;
   v_reference=v_reference||substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',get_byte(v_random,i)%32+1,1);
  end loop;
  begin
   insert into public.cases(reference,workspace_id,owner_user_id,fixture,origin,created_by_user_id,created_by_person_id,answers)
   values(v_reference,v_member.workspace_id,v_owner,false,p_mode,v_user,v_person.id,p_answers) returning id into v_case;
   exit;
  exception when unique_violation then
   get stacked diagnostics v_constraint=constraint_name;
   if v_constraint<>'cases_reference_key' then raise;
 end if;
  end;
 end loop;
 v_result=jsonb_build_object('actionId',p_action_id,'caseId',v_case,'reference',v_reference,'revision',1);
 update public.action_receipts set target_id=v_case,target_reference=v_reference,receipt=v_result where id=v_receipt.id;
 return v_result;
end;
$$;
revoke all on function public.vitally_create_case(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vitally_create_case(uuid,text,uuid,jsonb) to authenticated;

create or replace function public.vitally_log_contact(p_action_id uuid,p_case_id uuid,p_person_id uuid,p_followup_id uuid,p_entry jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.memberships;
 v_receipt public.action_receipts;
 v_case public.cases;
 v_person public.people;
 v_entry jsonb;
 v_digest text;
 v_id uuid;
 v_result jsonb;
begin
 v_member=vitally_private.require_membership();
 v_person=vitally_private.acting_person(v_member,p_person_id);
 if p_action_id is null or p_case_id is null or p_entry is null or jsonb_typeof(p_entry)<>'object' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 -- Staff only: an applicant is refused before any target is read.
 if v_member.access not in ('presenter','staff') or v_person.id is null then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 v_digest=encode(extensions.digest(jsonb_build_object('operation','LOG_CONTACT','caseId',p_case_id,'personId',v_person.id,
  'followupId',p_followup_id,'entry',p_entry)::text,'sha256'),'hex');
 v_receipt=vitally_private.reserve_receipt(v_member,p_action_id,'LOG_CONTACT',v_digest,v_person.id);
 -- An identical accepted replay returns its receipt after re-checking the
 -- persona, without reaching the target.
 if v_receipt.receipt is not null then
  perform vitally_private.contact_person(v_member,v_person.id);
  return v_receipt.receipt;
 end if;
 v_case=vitally_private.lock_case(v_member,p_case_id);
 v_person=vitally_private.contact_person(v_member,v_person.id);
 -- A contact linked to a follow-up task keeps RECORD_CONTACT's rule: the
 -- task's assignee, holding `followup`, on an open task.
 if p_followup_id is not null then
  if not ('followup'=any(v_person.capabilities)) then
   raise sqlstate 'VT001' using message='FORBIDDEN';
  end if;
  perform vitally_private.lock_open_followup(v_case,v_person,jsonb_build_object('followupId',p_followup_id));
 end if;
 v_entry=vitally_private.check_contact_entry(p_entry);
 insert into public.contact_log(workspace_id,case_id,followup_id,logged_by_user_id,logged_by_person_id,
   direction,contacted_at,with_whom,other_name,method,purpose,outcome,note)
 values(v_case.workspace_id,v_case.id,p_followup_id,v_member.user_id,v_person.id,
   v_entry->>'direction',(v_entry->>'contactedAt')::timestamptz,v_entry->>'withWhom',v_entry->>'otherName',
   v_entry->>'method',v_entry->>'purpose',v_entry->>'outcome',v_entry->>'note')
 returning id into v_id;
 insert into public.contact_log_versions(contact_id,version,workspace_id,case_id,edited_by_user_id,edited_by_person_id,created_at,
   direction,contacted_at,with_whom,other_name,method,purpose,outcome,note)
 select l.id,1,l.workspace_id,l.case_id,l.logged_by_user_id,l.logged_by_person_id,l.logged_at,
   l.direction,l.contacted_at,l.with_whom,l.other_name,l.method,l.purpose,l.outcome,l.note
 from public.contact_log l where l.id=v_id;
 v_result=jsonb_build_object('actionId',p_action_id,'contactId',v_id,'caseId',v_case.id,'revision',1);
 update public.action_receipts set target_id=v_id,receipt=v_result where id=v_receipt.id;
 return v_result;
end;
$$;
revoke all on function public.vitally_log_contact(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vitally_log_contact(uuid,uuid,uuid,uuid,jsonb) to authenticated;

create or replace function public.vitally_edit_contact(p_action_id uuid,p_contact_id uuid,p_expected_revision bigint,p_person_id uuid,p_entry jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.memberships;
 v_receipt public.action_receipts;
 v_contact public.contact_log;
 v_case public.cases;
 v_person public.people;
 v_entry jsonb;
 v_digest text;
 v_revision bigint;
 v_result jsonb;
begin
 v_member=vitally_private.require_membership();
 v_person=vitally_private.acting_person(v_member,p_person_id);
 if p_action_id is null or p_contact_id is null or p_expected_revision is null
  or p_entry is null or jsonb_typeof(p_entry)<>'object' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 if v_member.access not in ('presenter','staff') or v_person.id is null then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 v_digest=encode(extensions.digest(jsonb_build_object('operation','EDIT_CONTACT','contactId',p_contact_id,
  'expectedRevision',p_expected_revision,'personId',v_person.id,'entry',p_entry)::text,'sha256'),'hex');
 v_receipt=vitally_private.reserve_receipt(v_member,p_action_id,'EDIT_CONTACT',v_digest,v_person.id);
 if v_receipt.receipt is not null then
  perform vitally_private.contact_person(v_member,v_person.id);
  return v_receipt.receipt;
 end if;
 -- The case first, then the entry, in the same order as every case action;
 -- the entry is re-read under its lock and must still be on that case.
 select * into v_contact from public.contact_log
  where id=p_contact_id and workspace_id=v_member.workspace_id;
 if not found then
  raise sqlstate 'VT002' using message='NOT_FOUND';
 end if;
 v_case=vitally_private.lock_case(v_member,v_contact.case_id);
 select * into v_contact from public.contact_log
  where id=p_contact_id and workspace_id=v_member.workspace_id and case_id=v_case.id for update;
 if not found then
  raise sqlstate 'VT002' using message='NOT_FOUND';
 end if;
 v_person=vitally_private.contact_person(v_member,v_person.id);
 if v_contact.logged_by_person_id is distinct from v_person.id and not ('admin'=any(v_person.capabilities)) then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 if v_contact.revision<>p_expected_revision then
  raise sqlstate 'VT003' using message='CONFLICT';
 end if;
 v_entry=vitally_private.check_contact_entry(p_entry);
 v_revision=v_contact.revision+1;
 insert into public.contact_log_versions(contact_id,version,workspace_id,case_id,edited_by_user_id,edited_by_person_id,created_at,
   direction,contacted_at,with_whom,other_name,method,purpose,outcome,note)
 values(v_contact.id,v_revision,v_contact.workspace_id,v_contact.case_id,v_member.user_id,v_person.id,now(),
   v_entry->>'direction',(v_entry->>'contactedAt')::timestamptz,v_entry->>'withWhom',v_entry->>'otherName',
   v_entry->>'method',v_entry->>'purpose',v_entry->>'outcome',v_entry->>'note');
 update public.contact_log set direction=v_entry->>'direction',contacted_at=(v_entry->>'contactedAt')::timestamptz,
   with_whom=v_entry->>'withWhom',other_name=v_entry->>'otherName',method=v_entry->>'method',
   purpose=v_entry->>'purpose',outcome=v_entry->>'outcome',note=v_entry->>'note',
   revision=v_revision,edited_at=now()
  where id=v_contact.id;
 v_result=jsonb_build_object('actionId',p_action_id,'contactId',v_contact.id,'caseId',v_contact.case_id,'revision',v_revision);
 update public.action_receipts set target_id=v_contact.id,receipt=v_result where id=v_receipt.id;
 return v_result;
end;
$$;
revoke all on function public.vitally_edit_contact(uuid,uuid,bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vitally_edit_contact(uuid,uuid,bigint,uuid,jsonb) to authenticated;

-- Part 3: staff accepted by the locks, the authority check and the policies --
-- (design D5)

-- 6. The four helper functions, each copied from its newest definition (the
-- inventory above names the migration). The only change in each is the access
-- test: `access='presenter'` becomes `access in ('presenter','staff')` and
-- `access<>'presenter'` becomes `access not in ('presenter','staff')`. None of
-- them is granted to a client role, as before.
--   * check_operation_authority: from 036 (the guard on a named person).
--   * lock_case: from 003.
--   * lock_assistance_item: from 005.
--   * contact_person: from 031.

create or replace function vitally_private.check_operation_authority(p_member public.memberships,p_person_id uuid,p_type text)
returns public.people language plpgsql security definer set search_path='' as $$
declare v_person public.people;
begin
 -- Client actions carry no staff person; a selected one must exist in this workspace.
 if p_person_id is not null then
  if p_member.access not in ('presenter','staff') then
   raise sqlstate 'VT001' using message='FORBIDDEN';
  end if;
  select * into v_person from public.people where workspace_id=p_member.workspace_id and id=p_person_id;
  if not found then
   raise sqlstate 'VT001' using message='FORBIDDEN';
  end if;
 end if;
 case p_type
  when 'SAVE_ANSWERS','SUBMIT' then
   -- Client-permitted: an applicant answers for themselves, or a presenter
   -- assists with an admin-capable person.
   if p_person_id is null then
    if p_member.access<>'applicant' then
     raise sqlstate 'VT001' using message='FORBIDDEN';
    end if;
   elsif not ('admin'=any(v_person.capabilities)) then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'VERIFY_INTAKE','REMIND','CLOSE_CASE','START_SCREENING','MARK_READY_TO_EFILE','MARK_EFILED','RECORD_FILING_RESULT','RETURN_TO_SIGNING','REQUEST_DOCUMENTS_AT_INTAKE','PUT_ON_HOLD','RESUME_FROM_HOLD' then -- 036
   if p_person_id is null or not ('admin'=any(v_person.capabilities)) then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'CLAIM_PREPARATION','REQUEST_DOCUMENT','VERIFY_DOCUMENT','ESCALATE_CONTACT',
       'SUBMIT_REVIEW','RESUBMIT_REVIEW','CLAIM_REVIEW','REQUEST_CORRECTIONS',
       'APPROVE_REVIEW','RECORD_REVIEW_CONTACT' then
   if p_person_id is null then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'RESPOND_DOCUMENT','WITHDRAW' then -- 036
   -- The client answers or withdraws for themselves: no staff persona at all.
   if p_person_id is not null or p_member.access<>'applicant' then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'RECORD_DOCUMENT_RESPONSE' then
   if p_person_id is null or not ('receive_documents'=any(v_person.capabilities)) then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'RECORD_CONTACT','RESOLVE_FOLLOWUP' then
   if p_person_id is null or not ('followup'=any(v_person.capabilities)) then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'UPDATE_CONTACT' then
   -- The client for themselves, or a selected staff person. Which staff person
   -- may depends on the case, so that half is check_authority's.
   if p_person_id is null and p_member.access<>'applicant' then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'RECORD_MATERIALS' then
   -- Staff only; which staff person may depends on the case (check_authority).
   if p_person_id is null then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'SET_DOCUMENT_CARD' then
   -- The client for themselves, or a selected staff person; which staff person
   -- may depends on the case, so that half is check_authority's.
   if p_person_id is null and p_member.access<>'applicant' then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'SET_DOCUMENT_GROUP' then
   -- Staff only; which staff person may depends on the case (check_authority).
   if p_person_id is null then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'ASSISTANCE:CLAIM','ASSISTANCE:RESOLVE' then
   -- Helping a client with their own forms is its own capability; holding it
   -- is still not holding the item, which is a step-7 rule on the target.
   if p_person_id is null or not ('assist'=any(v_person.capabilities)) then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  -- Unknown or not-yet-implemented actions never reach a handler.
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
 return v_person;
end;
$$;

create or replace function vitally_private.lock_case(p_member public.memberships,p_case_id uuid)
returns public.cases language plpgsql security definer set search_path='' as $$
declare v_case public.cases;
begin
 select * into v_case from public.cases c
  where c.id=p_case_id and c.workspace_id=p_member.workspace_id
   and ((p_member.access='applicant' and c.owner_user_id=p_member.user_id)
     or (p_member.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')))
  for update;
 if not found then
  raise sqlstate 'VT002' using message='NOT_FOUND';
 end if;
 return v_case;
end;
$$;

create or replace function vitally_private.lock_assistance_item(p_member public.memberships,p_item_id uuid)
returns public.assistance_items language plpgsql security definer set search_path='' as $$
declare v_item public.assistance_items;
begin
 select * into v_item from public.assistance_items i
  where i.id=p_item_id and i.workspace_id=p_member.workspace_id and p_member.access in ('presenter','staff')
   and (i.case_id is null or exists(select 1 from public.cases c
    where c.workspace_id=i.workspace_id and c.id=i.case_id and (c.origin<>'client' or c.stage<>'draft')))
  for update;
 if not found then
  raise sqlstate 'VT002' using message='NOT_FOUND';
 end if;
 return v_item;
end;
$$;

create or replace function vitally_private.contact_person(p_member public.memberships,p_person_id uuid)
returns public.people language plpgsql stable security definer set search_path='' as $$
declare v_person public.people;
begin
 if p_member.access not in ('presenter','staff') or p_person_id is null then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 select * into v_person from public.people where workspace_id=p_member.workspace_id and id=p_person_id;
 if not found then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 return v_person;
end;
$$;

-- 7. The 21 policies of inventory section B, each dropped and created again
-- with the same name, the same `for select to authenticated` and the condition
-- of its newest definition, with only the presenter access test widened. The
-- applicant branch of the `visible_*` policies is unchanged. Nothing is
-- granted: filing_notes stays select-only for `authenticated` and 035's
-- append-only trigger stays.

drop policy if exists presenter_people on public.people;
create policy presenter_people on public.people for select to authenticated using(exists(select 1 from public.memberships m where m.workspace_id=people.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access in ('presenter','staff')));

drop policy if exists visible_cases on public.cases;
create policy visible_cases on public.cases for select to authenticated using(exists(select 1 from public.memberships m where m.workspace_id=cases.workspace_id and m.user_id=(select auth.uid()) and m.active and ((m.access='applicant' and cases.owner_user_id=m.user_id) or (m.access in ('presenter','staff') and (cases.origin<>'client' or cases.stage<>'draft')))));

drop policy if exists visible_document_requests on public.document_requests;
create policy visible_document_requests on public.document_requests for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=document_requests.case_id where m.workspace_id=document_requests.workspace_id and m.user_id=(select auth.uid()) and m.active and ((m.access='applicant' and c.owner_user_id=m.user_id) or (m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')))));

drop policy if exists visible_documents on public.documents;
create policy visible_documents on public.documents for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=documents.case_id where m.workspace_id=documents.workspace_id and m.user_id=(select auth.uid()) and m.active and ((m.access='applicant' and c.owner_user_id=m.user_id) or (m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')))));

drop policy if exists visible_client_events on public.client_events;
create policy visible_client_events on public.client_events for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=client_events.case_id where m.workspace_id=client_events.workspace_id and m.user_id=(select auth.uid()) and m.active and ((m.access='applicant' and c.owner_user_id=m.user_id) or (m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')))));

drop policy if exists presenter_preparation_participants on public.preparation_participants;
create policy presenter_preparation_participants on public.preparation_participants for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=preparation_participants.case_id where m.workspace_id=preparation_participants.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')));

drop policy if exists presenter_admin_followups on public.admin_followups;
create policy presenter_admin_followups on public.admin_followups for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=admin_followups.case_id where m.workspace_id=admin_followups.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')));

drop policy if exists presenter_contact_attempts on public.contact_attempts;
create policy presenter_contact_attempts on public.contact_attempts for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=contact_attempts.case_id where m.workspace_id=contact_attempts.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')));

drop policy if exists presenter_case_events on public.case_events;
create policy presenter_case_events on public.case_events for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=case_events.case_id where m.workspace_id=case_events.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')));

drop policy if exists presenter_assistance_items on public.assistance_items;
create policy presenter_assistance_items on public.assistance_items for select to authenticated using(exists(select 1 from public.memberships m where m.workspace_id=assistance_items.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access in ('presenter','staff')) and (assistance_items.case_id is null or exists(select 1 from public.cases c where c.workspace_id=assistance_items.workspace_id and c.id=assistance_items.case_id and (c.origin<>'client' or c.stage<>'draft'))));

drop policy if exists presenter_reviews on public.reviews;
create policy presenter_reviews on public.reviews for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=reviews.case_id where m.workspace_id=reviews.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')));

drop policy if exists visible_case_contacts on public.case_contacts;
create policy visible_case_contacts on public.case_contacts for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=case_contacts.case_id where m.workspace_id=case_contacts.workspace_id and m.user_id=(select auth.uid()) and m.active and ((m.access='applicant' and c.owner_user_id=m.user_id) or (m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')))));

drop policy if exists presenter_case_materials on public.case_materials;
create policy presenter_case_materials on public.case_materials for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=case_materials.case_id where m.workspace_id=case_materials.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')));

drop policy if exists visible_case_document_cards on public.case_document_cards;
create policy visible_case_document_cards on public.case_document_cards for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=case_document_cards.case_id where m.workspace_id=case_document_cards.workspace_id and m.user_id=(select auth.uid()) and m.active and ((m.access='applicant' and c.owner_user_id=m.user_id) or (m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')))));

drop policy if exists presenter_contact_log on public.contact_log;
create policy presenter_contact_log on public.contact_log for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=contact_log.case_id where m.workspace_id=contact_log.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')));

drop policy if exists presenter_contact_log_versions on public.contact_log_versions;
create policy presenter_contact_log_versions on public.contact_log_versions for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=contact_log_versions.case_id where m.workspace_id=contact_log_versions.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')));

drop policy if exists presenter_preparer_questionnaires on public.preparer_questionnaires;
create policy presenter_preparer_questionnaires on public.preparer_questionnaires for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=preparer_questionnaires.case_id where m.workspace_id=preparer_questionnaires.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')));

drop policy if exists presenter_reviewer_questionnaires on public.reviewer_questionnaires;
create policy presenter_reviewer_questionnaires on public.reviewer_questionnaires for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=reviewer_questionnaires.case_id where m.workspace_id=reviewer_questionnaires.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')));

drop policy if exists presenter_filing_attempts on public.filing_attempts;
create policy presenter_filing_attempts on public.filing_attempts for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=filing_attempts.case_id where m.workspace_id=filing_attempts.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')));

drop policy if exists presenter_filing_returns on public.filing_returns;
create policy presenter_filing_returns on public.filing_returns for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=filing_returns.case_id where m.workspace_id=filing_returns.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')));

drop policy if exists presenter_filing_notes on public.filing_notes;
create policy presenter_filing_notes on public.filing_notes for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=filing_notes.case_id where m.workspace_id=filing_notes.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access in ('presenter','staff') and (c.origin<>'client' or c.stage<>'draft')));
