-- Part 4a: contact details and materials (docs/superpowers/specs/2026-09-29-intake-catalogue-design.md §3.4–§3.5).
--
-- `case_materials` (staff only), and two case actions:
--   * UPDATE_CONTACT `{ bestContactTime?, bestContactNote? }` edits the best
--     time and note in `case_contacts` (011). It never changes a phone. It is
--     for the owner on their own draft, for office staff (`followup` or
--     `admin`) on any case they can see, and for a volunteer only on a case
--     they prepare or review. A version-1 case has no contacts row: VALIDATION.
--   * RECORD_MATERIALS `{ received: string[] }` replaces the set of materials
--     the site has received, on a case of either version.
-- Neither sends the client a message.
--
-- Written to be safe to apply again on a local test stack whose
-- schema_migrations row for this file was deleted during development: every
-- statement is `if not exists`, `create or replace`, or a drop-then-add.

-- ---------------------------------------------------------------------------
-- 1. The materials list (D9). The catalogue JSON mirrors it as `materials`;
-- tests/database-intake.mjs compares the two.

create or replace function vitally_private.materials_items() returns text[]
language sql immutable security definer set search_path='' as $$
 select array['photo_id','ssn_itin','green_card','birth_certificate','w2','1099nec','1099misc','1099int','1098t','1095a','prior_year_1040']
$$;

-- ---------------------------------------------------------------------------
-- 2. case_materials: one row per item received. Only the action RPC writes it;
-- the select policy is 002's `presenter_admin_followups`, renamed, so an
-- applicant reads no row and a presenter never sees a private client draft's.
-- The item check spells the list out rather than calling materials_items(),
-- which no client or service role may execute.

create table if not exists public.case_materials (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null,
 item text not null check (item in ('photo_id','ssn_itin','green_card','birth_certificate','w2','1099nec','1099misc','1099int','1098t','1095a','prior_year_1040')),
 received_at timestamptz not null default now(),
 recorded_by_person_id uuid not null,
 primary key (case_id, item),
 foreign key (workspace_id, case_id) references public.cases(workspace_id, id) on delete cascade,
 foreign key (workspace_id, recorded_by_person_id) references public.people(workspace_id, id)
);
alter table public.case_materials enable row level security;
drop policy if exists presenter_case_materials on public.case_materials;
create policy presenter_case_materials on public.case_materials for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=case_materials.case_id where m.workspace_id=case_materials.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')));
revoke all on public.case_materials from public, anon, authenticated;
grant select on public.case_materials to authenticated;
grant select, insert, update, delete on public.case_materials to service_role;

-- Realtime, with 007's pattern: INSERT and UPDATE only, under the same RLS.
-- src/supabase-store.mjs watches it on the staff channel (SUBSCRIBED_TABLES).
do $$
begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
  raise exception 'The supabase_realtime publication is missing; enable Realtime on this project before migrating.';
 end if;
 if not exists(
  select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='case_materials'
 ) then
  alter publication supabase_realtime add table public.case_materials;
 end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Who among the staff works on a case: office staff (`followup` or
-- `admin`) on any case, and a volunteer only as its preparer or reviewer. A
-- volunteer on an unclaimed case is not one of them (D5: no contact details).
create or replace function vitally_private.works_on_case(p_case public.cases,p_person public.people)
returns boolean language sql stable security definer set search_path='' as $$
 select p_person.id is not null and (
  'followup'=any(p_person.capabilities) or 'admin'=any(p_person.capabilities)
  or p_person.id is not distinct from p_case.preparer_id
  or p_person.id is not distinct from p_case.reviewer_id)
$$;

-- ---------------------------------------------------------------------------
-- 4. check_operation_authority, verbatim from 006 with the UPDATE_CONTACT and
-- RECORD_MATERIALS branches added before the assistance branch.
create or replace function vitally_private.check_operation_authority(p_member public.memberships,p_person_id uuid,p_type text)
returns public.people language plpgsql security definer set search_path='' as $$
declare v_person public.people;
begin
 -- Client actions carry no staff person; a selected one must exist in this workspace.
 if p_person_id is not null then
  if p_member.access<>'presenter' then
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
  when 'VERIFY_INTAKE','REMIND','CLOSE_CASE' then
   if p_person_id is null or not ('admin'=any(v_person.capabilities)) then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'CLAIM_PREPARATION','REQUEST_DOCUMENT','VERIFY_DOCUMENT','ESCALATE_CONTACT',
       'SUBMIT_REVIEW','RESUBMIT_REVIEW','CLAIM_REVIEW','REQUEST_CORRECTIONS',
       'APPROVE_REVIEW','RECORD_REVIEW_CONTACT' then
   if p_person_id is null then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'RESPOND_DOCUMENT' then
   -- The client answers for themselves: no staff persona at all.
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

-- ---------------------------------------------------------------------------
-- 5. check_authority, verbatim from 004 with the UPDATE_CONTACT and
-- RECORD_MATERIALS branches added after RECORD_DOCUMENT_RESPONSE.
create or replace function vitally_private.check_authority(p_member public.memberships,p_case public.cases,p_person_id uuid,p_type text)
returns public.people language plpgsql security definer set search_path='' as $$
declare v_person public.people;
begin
 v_person=vitally_private.check_operation_authority(p_member,p_person_id,p_type);
 case p_type
  when 'SAVE_ANSWERS','SUBMIT' then
   if p_person_id is null then
    if p_case.owner_user_id is distinct from p_member.user_id then
     raise sqlstate 'VT001' using message='FORBIDDEN';
    end if;
   elsif p_case.owner_user_id is not null then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'RESPOND_DOCUMENT' then
   -- The authenticated owner answers; lock_case already hides other clients'
   -- cases, and this states the same rule where the action's authority lives.
   if p_case.owner_user_id is distinct from p_member.user_id then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'RECORD_DOCUMENT_RESPONSE' then
   -- The staff receipt exists only where there is no client to answer; it
   -- never speaks for one who could.
   if p_case.owner_user_id is not null then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'UPDATE_CONTACT' then
   -- The owner only while the case is their draft; staff per works_on_case.
   if p_person_id is null then
    if p_case.owner_user_id is distinct from p_member.user_id or p_case.stage<>'draft' then
     raise sqlstate 'VT001' using message='FORBIDDEN';
    end if;
   elsif not vitally_private.works_on_case(p_case,v_person) then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'RECORD_MATERIALS' then
   if not vitally_private.works_on_case(p_case,v_person) then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  else null;
 end case;
 return v_person;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. check_payload, verbatim from 011 with the UPDATE_CONTACT and
-- RECORD_MATERIALS shapes added before CLOSE_CASE.
create or replace function vitally_private.check_payload(p_type text,p_payload jsonb) returns void
language plpgsql immutable security definer set search_path='' as $$
begin
 case p_type
  when 'SAVE_ANSWERS' then
   -- The per-key answer checks are check_related's: they depend on the case's version.
   if vitally_private.payload_keys(p_payload)<>array['answers'] or jsonb_typeof(p_payload->'answers')<>'object' then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'SUBMIT' then
   if vitally_private.payload_keys(p_payload)<>array['confirmed'] or p_payload->'confirmed'<>'true'::jsonb then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'VERIFY_INTAKE' then
   if vitally_private.payload_keys(p_payload)<>array['checks'] or jsonb_typeof(p_payload->'checks')<>'object'
    or vitally_private.payload_keys(p_payload->'checks')<>array['consent','documents','identity','interview']
    or exists(select 1 from jsonb_each(p_payload->'checks') c where c.value<>'true'::jsonb) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'CLAIM_PREPARATION','REMIND','SUBMIT_REVIEW','CLAIM_REVIEW','APPROVE_REVIEW' then
   if vitally_private.payload_keys(p_payload)<>array[]::text[] then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'REQUEST_DOCUMENT' then
   if vitally_private.payload_keys(p_payload)<>array['message','title']
    or not vitally_private.payload_text(p_payload,'title',120)
    or not vitally_private.payload_text(p_payload,'message',2000) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'RESPOND_DOCUMENT','RECORD_DOCUMENT_RESPONSE' then
   -- One simulated document exists in this demo; its name is fixed.
   if vitally_private.payload_keys(p_payload)<>array['filename','requestId']
    or vitally_private.payload_uuid(p_payload,'requestId') is null
    or p_payload->>'filename'<>'demo-mileage-record-2025.pdf' then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'VERIFY_DOCUMENT' then
   if vitally_private.payload_keys(p_payload)<>array['requestId']
    or vitally_private.payload_uuid(p_payload,'requestId') is null then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'ESCALATE_CONTACT' then
   -- The assignee is derived from workspace setup, so any assignee-shaped
   -- extra field is rejected rather than ignored.
   if vitally_private.payload_keys(p_payload)<>array['reason','requestId']
    or vitally_private.payload_uuid(p_payload,'requestId') is null
    or not vitally_private.payload_text(p_payload,'reason',1000) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'RECORD_CONTACT','RESOLVE_FOLLOWUP' then
   -- Resolution accepts only the two conclusive outcomes.
   if vitally_private.payload_keys(p_payload)<>array['followupId','note','outcome']
    or vitally_private.payload_uuid(p_payload,'followupId') is null
    or not vitally_private.payload_text(p_payload,'note',1000)
    or (p_type='RECORD_CONTACT' and p_payload->>'outcome' not in ('no_answer','reached','no_further_contact','closure_requested'))
    or (p_type='RESOLVE_FOLLOWUP' and p_payload->>'outcome' not in ('reached','no_further_contact')) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'REQUEST_CORRECTIONS' then
   -- The findings are the whole request body: internal text with content.
   if vitally_private.payload_keys(p_payload)<>array['findings']
    or not vitally_private.payload_text(p_payload,'findings',2000) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'RESUBMIT_REVIEW' then
   if vitally_private.payload_keys(p_payload)<>array['resolution']
    or not vitally_private.payload_text(p_payload,'resolution',2000) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'RECORD_REVIEW_CONTACT' then
   -- A contact attempt records what happened, never a payment detail.
   if vitally_private.payload_keys(p_payload)<>array['note','outcome']
    or not vitally_private.payload_text(p_payload,'note',1000)
    or p_payload->>'outcome' not in ('no_answer','reached','no_further_contact','closure_requested') then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'UPDATE_CONTACT' then
   -- Best time and note only, at least one of them. A phone is changed
   -- through the form (SAVE_ANSWERS), never here. Each value's type check
   -- reads the catalogue, so it is act_update_contact's.
   if cardinality(vitally_private.payload_keys(p_payload))=0
    or not (vitally_private.payload_keys(p_payload)<@array['bestContactNote','bestContactTime']) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'RECORD_MATERIALS' then
   -- The whole set now received: known items, each at most once.
   if vitally_private.payload_keys(p_payload)<>array['received'] or jsonb_typeof(p_payload->'received')<>'array' then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
   if exists(select 1 from jsonb_array_elements(p_payload->'received') e
     where jsonb_typeof(e)<>'string' or (e#>>'{}')<>all(vitally_private.materials_items())) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
   if (select count(distinct e) from jsonb_array_elements_text(p_payload->'received') e)<>jsonb_array_length(p_payload->'received') then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'CLOSE_CASE' then
   -- Closing is deliberate: a written reason and an explicit confirmation.
   if vitally_private.payload_keys(p_payload)<>array['confirmed','reason']
    or p_payload->'confirmed'<>'true'::jsonb
    or not vitally_private.payload_text(p_payload,'reason',1000) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. The handlers.

-- UPDATE_CONTACT: each value passes its catalogue field's check (the same one
-- SAVE_ANSWERS uses); null, blank text or [] clears that column. The other
-- column and both phones are left as they are. History names the fields sent,
-- never the values.
create or replace function vitally_private.act_update_contact(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_field vitally_private.intake_fields;
 v_key text;
 v_value jsonb;
begin
 -- Version 1 keeps no contacts row: its details are ordinary answers.
 if p_case.intake_version<>2 then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 for v_key, v_value in select a.key, a.value from jsonb_each(p_payload) a loop
  select * into v_field from vitally_private.intake_fields f
   where f.version=p_case.intake_version and f.group_id is null
    and f.field_id=case v_key when 'bestContactTime' then 'best_contact_time' when 'bestContactNote' then 'best_contact_note' end;
  if not found or (vitally_private.intake_answered(v_value) and not vitally_private.check_intake_value(v_field,v_value)) then
   raise sqlstate 'VT007' using message='VALIDATION';
  end if;
 end loop;
 insert into public.case_contacts as cc (workspace_id, case_id, best_contact_time, best_contact_note, updated_at)
 values (p_case.workspace_id, p_case.id,
  case when vitally_private.intake_answered(p_payload->'bestContactTime')
   then array(select jsonb_array_elements_text(p_payload->'bestContactTime')) end,
  case when vitally_private.intake_answered(p_payload->'bestContactNote')
   then p_payload->>'bestContactNote' end,
  now())
 on conflict (case_id) do update set
  best_contact_time = case when p_payload ? 'bestContactTime' then excluded.best_contact_time else cc.best_contact_time end,
  best_contact_note = case when p_payload ? 'bestContactNote' then excluded.best_contact_note else cc.best_contact_note end,
  updated_at = now();
 return jsonb_build_object('detail',jsonb_build_object('fields',to_jsonb(vitally_private.payload_keys(p_payload))));
end;
$$;

-- RECORD_MATERIALS: the payload is the whole set now received, so the case's
-- rows are replaced, each stamped with the recording person and now().
create or replace function vitally_private.act_record_materials(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 delete from public.case_materials where workspace_id=p_case.workspace_id and case_id=p_case.id;
 insert into public.case_materials(workspace_id, case_id, item, received_at, recorded_by_person_id)
 select p_case.workspace_id, p_case.id, e, now(), p_person.id
 from jsonb_array_elements_text(p_payload->'received') e;
 return jsonb_build_object('detail',jsonb_build_object('items',p_payload->'received'));
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. vitally_apply_action, verbatim from 006 with the two dispatch lines added
-- after CLOSE_CASE.
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
 -- A malformed envelope cannot be digested or reserved; payload contents are
 -- still whitelisted at step 5, after the target and authority checks.
 if p_action_id is null or p_case_id is null or p_expected_revision is null or p_type is null
  or p_payload is null or jsonb_typeof(p_payload)<>'object' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 v_digest=encode(extensions.digest(jsonb_build_object('operation',p_type,'caseId',p_case_id,'expectedRevision',p_expected_revision,'personId',p_person_id,'payload',p_payload)::text,'sha256'),'hex');
 v_receipt=vitally_private.reserve_receipt(v_member,p_action_id,p_type,v_digest,p_person_id);
 -- An identical accepted replay returns its receipt after the current membership
 -- and operation-authority checks, without repeating the mutation and without
 -- reaching the target, which may since have been deleted.
 if v_receipt.receipt is not null then
  perform vitally_private.check_operation_authority(v_member,p_person_id,p_type);
  return v_receipt.receipt;
 end if;
 v_case=vitally_private.lock_case(v_member,p_case_id);
 v_person=vitally_private.check_authority(v_member,v_case,p_person_id,p_type);
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
  when 'UPDATE_CONTACT' then v_outcome=vitally_private.act_update_contact(v_member,v_case,v_person,p_payload);
  when 'RECORD_MATERIALS' then v_outcome=vitally_private.act_record_materials(v_member,v_case,v_person,p_payload);
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
 return vitally_private.commit_action(v_member,v_case,v_person,p_action_id,p_type,v_outcome,v_receipt);
end;
$$;
revoke all on function public.vitally_apply_action(uuid,uuid,bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.vitally_apply_action(uuid,uuid,bigint,uuid,text,jsonb) to authenticated;
-- The assistance entry point is unchanged by this migration; its privileges are
-- re-applied here because a replacement migration must leave both entry points
-- with exactly the grants the contract fixes for them.
revoke all on function public.vitally_assistance_action(uuid,uuid,bigint,uuid,text,text) from public,anon,authenticated;
grant execute on function public.vitally_assistance_action(uuid,uuid,bigint,uuid,text,text) to authenticated;
revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
