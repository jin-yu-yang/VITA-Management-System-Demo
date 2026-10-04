-- Part 4b2, Task 4: visits and document cards on the server
-- (docs/superpowers/specs/2026-10-04-intake-redesign-design.md §3.7 and §6.3).
--
--   * `cases.intake_visited`, the sub-steps a client has opened. SAVE_ANSWERS
--     takes an optional `visited` array (at most 64 ids); the stored set is the
--     union of what was there and what was sent, minus ids the catalogue no
--     longer has. A version-1 case refuses `visited`.
--   * `case_document_cards`, one row per card the client or staff has acted on:
--     a status (`later`, `none`, or null for "Not done") and a group override
--     (`needed`, set by staff). Rows are never deleted. There is no person
--     column: the client reads these rows and realtime sends them whole; who
--     changed a card is in case_events, which only staff read.
--   * Two case actions: SET_DOCUMENT_CARD `{ slotId, status }` and
--     SET_DOCUMENT_GROUP `{ slotId, group }`.
--   * vitally_private.document_card_rules(), the 46 rule ids with their owner
--     kind. tests/database-redesign.mjs compares it with src/document-cards.mjs.
--
-- Every statement can be applied again. The redefined functions are copied
-- verbatim from 013 (check_operation_authority, check_authority, check_payload,
-- vitally_apply_action) and 011 (check_related, act_save_answers) with only the
-- branches named below added. The same revoke that ends 013 ends this file.

-- ---------------------------------------------------------------------------
-- 1. Visits (spec §3.7).
alter table public.cases add column if not exists intake_visited text[] not null default '{}'::text[];

-- ---------------------------------------------------------------------------
-- 2. Card state (spec §6.3). Rows are never deleted: "Not done" is a null status.
create table if not exists public.case_document_cards (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null,
 slot_id text not null check (slot_id ~ '^[a-z0-9_]+\.(tp|sp|household|hh\.[0-9a-f]{32})$'),
 status text check (status is null or status in ('later','none')),
 group_override text check (group_override is null or group_override = 'needed'),
 changed_at timestamptz not null default now(),
 primary key (case_id, slot_id),
 foreign key (workspace_id, case_id) references public.cases(workspace_id, id) on delete cascade
);
-- No person column: the client reads these rows, and realtime sends them whole.
-- Who changed a card is in case_events (commit_action), which only staff read.
alter table public.case_document_cards enable row level security;
drop policy if exists visible_case_document_cards on public.case_document_cards;
create policy visible_case_document_cards on public.case_document_cards for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=case_document_cards.case_id where m.workspace_id=case_document_cards.workspace_id and m.user_id=(select auth.uid()) and m.active and ((m.access='applicant' and c.owner_user_id=m.user_id) or (m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')))));
revoke all on public.case_document_cards from public, anon, authenticated;
grant select on public.case_document_cards to authenticated;
grant select, insert, update, delete on public.case_document_cards to service_role;

-- Realtime, with 007's pattern: INSERT and UPDATE only, under the same RLS.
do $$
begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
  raise exception 'The supabase_realtime publication is missing; enable Realtime on this project before migrating.';
 end if;
 if not exists(
  select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='case_document_cards'
 ) then
  alter publication supabase_realtime add table public.case_document_cards;
 end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The rule ids and the kind of owner each takes (RULE_TYPES in
-- src/document-cards.mjs; tests/database-redesign.mjs compares the two).
create or replace function vitally_private.document_card_rules()
returns table(rule_id text, card_type text) language sql immutable security definer set search_path='' as $$
 select * from (values
  ('photo_id','person'),
  ('ssn','person'),
  ('ippin','person'),
  ('prior_return','household'),
  ('w2','shared'),
  ('tip_records','shared'),
  ('1099r','shared'),
  ('disability','shared'),
  ('ssa1099','shared'),
  ('1099g_unemployment','shared'),
  ('1099g_refund','shared'),
  ('1099int_div','shared'),
  ('1099b','shared'),
  ('digital_assets','shared'),
  ('alimony_received','household'),
  ('rental_home','shared'),
  ('rental_property','shared'),
  ('w2g','shared'),
  ('1099nec_k_misc','shared'),
  ('app_tax_summary','shared'),
  ('business_costs','household'),
  ('other_income','shared'),
  ('1098','household'),
  ('taxes_paid','household'),
  ('medical','household'),
  ('charity','household'),
  ('1098e','shared'),
  ('dependent_care','household'),
  ('ira_contrib','shared'),
  ('educator','household'),
  ('alimony_paid','household'),
  ('education','shared'),
  ('home_sale','household'),
  ('hsa','shared'),
  ('1095a','household'),
  ('energy','household'),
  ('other_event','household'),
  ('debt_canceled','household'),
  ('disaster','household'),
  ('credit_disallowed','household'),
  ('irs_letter','household'),
  ('estimated_payments','household'),
  ('visa','person'),
  ('custody','household'),
  ('bank','household'),
  ('other','household')
 ) as r(rule_id, card_type)
$$;

-- ---------------------------------------------------------------------------
-- 4. check_operation_authority, verbatim from 013 with the SET_DOCUMENT_CARD
-- and SET_DOCUMENT_GROUP branches added before the assistance branch.
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
  when 'SET_DOCUMENT_CARD' then
   -- The client for themselves, or a staff person with admin.
   if p_person_id is null then
    if p_member.access<>'applicant' then raise sqlstate 'VT001' using message='FORBIDDEN'; end if;
   elsif not ('admin'=any(v_person.capabilities)) then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'SET_DOCUMENT_GROUP' then
   if p_person_id is null or not ('receive_documents'=any(v_person.capabilities)) then
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
-- 5. check_authority, verbatim from 013 with the SET_DOCUMENT_CARD and
-- SET_DOCUMENT_GROUP branches added after RECORD_MATERIALS.
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
  when 'SET_DOCUMENT_CARD','SET_DOCUMENT_GROUP' then
   if p_person_id is null then
    if p_case.owner_user_id is distinct from p_member.user_id then raise sqlstate 'VT001' using message='FORBIDDEN'; end if;
   elsif p_case.owner_user_id is not null and p_case.stage='draft' then
    -- Never staff on a client's unsent draft.
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  else null;
 end case;
 return v_person;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. check_payload, verbatim from 013 with SAVE_ANSWERS taking an optional
-- `visited` and the SET_DOCUMENT_CARD and SET_DOCUMENT_GROUP shapes added
-- before CLOSE_CASE. payload_keys (003) returns its keys sorted.
create or replace function vitally_private.check_payload(p_type text,p_payload jsonb) returns void
language plpgsql immutable security definer set search_path='' as $$
begin
 case p_type
  when 'SAVE_ANSWERS' then
   -- The per-key answer checks are check_related's: they depend on the case's version.
   if vitally_private.payload_keys(p_payload) not in (array['answers'], array['answers','visited'])
    or jsonb_typeof(p_payload->'answers')<>'object'
    or (p_payload ? 'visited' and (jsonb_typeof(p_payload->'visited')<>'array'
     or jsonb_array_length(p_payload->'visited')>64
     or exists(select 1 from jsonb_array_elements(p_payload->'visited') v
      where jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^[a-z]+\.[a-z_]+$'))) then
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
  when 'SET_DOCUMENT_CARD' then
   if vitally_private.payload_keys(p_payload)<>array['slotId','status']
    or jsonb_typeof(p_payload->'slotId')<>'string'
    or (p_payload->>'slotId') !~ '^[a-z0-9_]+\.(tp|sp|household|hh\.[0-9a-f]{32})$'
    or coalesce(p_payload->>'status','') not in ('later','none','not_done') then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'SET_DOCUMENT_GROUP' then
   if vitally_private.payload_keys(p_payload)<>array['group','slotId']
    or jsonb_typeof(p_payload->'slotId')<>'string'
    or (p_payload->>'slotId') !~ '^[a-z0-9_]+\.(tp|sp|household|hh\.[0-9a-f]{32})$'
    or coalesce(p_payload->>'group','') not in ('needed','maybe') then
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
-- 7. check_related, verbatim from 011 with `visited` checked in SAVE_ANSWERS
-- and a SET_DOCUMENT_CARD / SET_DOCUMENT_GROUP branch added. Both card actions
-- are for version-2 cases, and the slot's owner kind must fit its rule.
create or replace function vitally_private.check_related(p_case public.cases,p_type text,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 case p_type
  when 'SAVE_ANSWERS' then
   if p_case.intake_version = 2 then
    if exists(select 1 from jsonb_each(p_payload->'answers') a
     left join vitally_private.intake_fields f on f.version = p_case.intake_version and f.group_id is null and f.field_id = a.key
     where f.field_id is null
      or (vitally_private.intake_answered(a.value) and not vitally_private.check_intake_value(f, a.value))) then
     raise sqlstate 'VT007' using message='VALIDATION';
    end if;
   elsif exists(select 1 from jsonb_each(p_payload->'answers') a
     where a.key<>all(vitally_private.intake_answer_keys()) or jsonb_typeof(a.value)<>'string' or length(a.value#>>'{}')>1000) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
   if p_payload ? 'visited' then
    if p_case.intake_version<>2 or exists(select 1 from jsonb_array_elements_text(p_payload->'visited') v
     where not exists(select 1 from vitally_private.intake_substeps s where s.version = p_case.intake_version and s.id = v)) then
     raise sqlstate 'VT007' using message='VALIDATION';
    end if;
   end if;
  when 'RESPOND_DOCUMENT','RECORD_DOCUMENT_RESPONSE','VERIFY_DOCUMENT','ESCALATE_CONTACT' then
   if not exists(select 1 from public.document_requests r where r.workspace_id=p_case.workspace_id
    and r.case_id=p_case.id and r.id=vitally_private.payload_uuid(p_payload,'requestId')) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'RECORD_CONTACT','RESOLVE_FOLLOWUP' then
   if not exists(select 1 from public.admin_followups t where t.workspace_id=p_case.workspace_id
    and t.case_id=p_case.id and t.id=vitally_private.payload_uuid(p_payload,'followupId')) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'SET_DOCUMENT_CARD','SET_DOCUMENT_GROUP' then
   if p_case.intake_version<>2 or not exists(
    select 1 from vitally_private.document_card_rules() r
    where r.rule_id = split_part(p_payload->>'slotId','.',1)
     and case when r.card_type='person'
      then substr(p_payload->>'slotId', length(r.rule_id)+2) ~ '^(tp|sp|hh\.[0-9a-f]{32})$'
      else substr(p_payload->>'slotId', length(r.rule_id)+2) = 'household' end) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  else null;
 end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. act_save_answers, verbatim from 011 with the visits update added before
-- its return.
create or replace function vitally_private.act_save_answers(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_in jsonb;
 v_contact jsonb;
 v_answers jsonb;
 v_key text;
 v_value jsonb;
begin
 if p_case.stage<>'draft' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 if p_case.intake_version = 2 then
  v_in = p_payload->'answers';
  select coalesce(jsonb_object_agg(a.key, a.value), '{}'::jsonb) into v_contact from jsonb_each(v_in) a
   where a.key in ('tp_phone', 'sp_phone', 'best_contact_time', 'best_contact_note');
  if v_contact <> '{}'::jsonb then
   insert into public.case_contacts as cc (workspace_id, case_id, phone, spouse_phone, best_contact_time, best_contact_note, updated_at)
   values (p_case.workspace_id, p_case.id,
    case when vitally_private.intake_answered(v_contact->'tp_phone')
     then regexp_replace(v_contact->>'tp_phone', '[^0-9]', '', 'g') end,
    case when vitally_private.intake_answered(v_contact->'sp_phone')
     then regexp_replace(v_contact->>'sp_phone', '[^0-9]', '', 'g') end,
    case when vitally_private.intake_answered(v_contact->'best_contact_time')
     then array(select jsonb_array_elements_text(v_contact->'best_contact_time')) end,
    case when vitally_private.intake_answered(v_contact->'best_contact_note')
     then v_contact->>'best_contact_note' end,
    now())
   on conflict (case_id) do update set
    phone = case when v_contact ? 'tp_phone' then excluded.phone else cc.phone end,
    spouse_phone = case when v_contact ? 'sp_phone' then excluded.spouse_phone else cc.spouse_phone end,
    best_contact_time = case when v_contact ? 'best_contact_time' then excluded.best_contact_time else cc.best_contact_time end,
    best_contact_note = case when v_contact ? 'best_contact_note' then excluded.best_contact_note else cc.best_contact_note end,
    updated_at = now();
  end if;
  v_answers = p_case.answers;
  for v_key, v_value in select a.key, a.value from jsonb_each(v_in) a
   where a.key not in ('tp_phone', 'sp_phone', 'best_contact_time', 'best_contact_note') loop
   if vitally_private.intake_answered(v_value) then
    v_answers = v_answers || jsonb_build_object(v_key, v_value);
   else
    v_answers = v_answers - v_key;
   end if;
  end loop;
  if not vitally_private.answers_within_limit(v_answers) then
   raise sqlstate 'VT007' using message='VALIDATION';
  end if;
  update public.cases set answers=v_answers where id=p_case.id;
 else
  update public.cases set answers=answers||(p_payload->'answers') where id=p_case.id;
 end if;
 if p_payload ? 'visited' then
  -- The union of what was stored and what was sent, minus ids the catalogue no longer has (spec §3.7).
  update public.cases c set intake_visited = coalesce((
   select array_agg(distinct v order by v) from unnest(c.intake_visited || array(select jsonb_array_elements_text(p_payload->'visited'))) v
   where exists(select 1 from vitally_private.intake_substeps s where s.version = p_case.intake_version and s.id = v)), '{}'::text[])
  where c.id = p_case.id;
 end if;
 -- Internal history records which fields changed, never the answers themselves.
 return jsonb_build_object('detail',jsonb_build_object('fields',to_jsonb(vitally_private.payload_keys(p_payload->'answers'))));
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. The card handlers. A client's mark is the client's own (check_authority);
-- history names the slot and the new state, never a person column on the row.
create or replace function vitally_private.act_set_document_card(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_case.stage='closed' then raise sqlstate 'VT004' using message='INVALID_TRANSITION'; end if;
 insert into public.case_document_cards as d (workspace_id, case_id, slot_id, status, changed_at)
 values (p_case.workspace_id, p_case.id, p_payload->>'slotId',
  case when p_payload->>'status'='not_done' then null else p_payload->>'status' end, now())
 on conflict (case_id, slot_id) do update set status=excluded.status, changed_at=now();
 return jsonb_build_object('detail',jsonb_build_object('slotId',p_payload->>'slotId','status',p_payload->>'status'));
end;
$$;

create or replace function vitally_private.act_set_document_group(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_case.stage='closed' then raise sqlstate 'VT004' using message='INVALID_TRANSITION'; end if;
 if p_payload->>'group'='maybe' then
  -- Only a card staff moved up can move back down.
  update public.case_document_cards set group_override=null, changed_at=now()
  where case_id=p_case.id and slot_id=p_payload->>'slotId' and group_override is not null;
  if not found then raise sqlstate 'VT007' using message='VALIDATION'; end if;
 else
  insert into public.case_document_cards as d (workspace_id, case_id, slot_id, group_override, changed_at)
  values (p_case.workspace_id, p_case.id, p_payload->>'slotId', 'needed', now())
  on conflict (case_id, slot_id) do update set group_override='needed', changed_at=now();
 end if;
 return jsonb_build_object('detail',jsonb_build_object('slotId',p_payload->>'slotId','group',p_payload->>'group'));
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. vitally_apply_action, verbatim from 013 with the two dispatch lines added
-- after RECORD_MATERIALS.
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
  when 'SET_DOCUMENT_CARD' then v_outcome=vitally_private.act_set_document_card(v_member,v_case,v_person,p_payload);
  when 'SET_DOCUMENT_GROUP' then v_outcome=vitally_private.act_set_document_group(v_member,v_case,v_person,p_payload);
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
