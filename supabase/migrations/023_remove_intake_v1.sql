-- Remove intake version 1 (OpenSpec change remove-intake-v1, spec client-intake).
-- Version 2 is the only intake version from here on. In order:
--   1. the rule as two pure predicates and a count;
--   2. the guard: refuse while a version-1 application exists that is neither
--      a sample nor in a test workspace (a real client's application);
--   3. the cleanup: delete version-1 samples and test-workspace version-1
--      cases (children cascade; action_receipts stay, as with a reset), and
--      bump fixture_generation so open windows re-read their lists;
--   4. every workspace still at 1 is set to 2;
--   5. the functions redefined without their version-1 paths, each copied
--      verbatim from its latest definition (named below), then the
--      version-1-only functions dropped;
--   6. deferred checks run (set constraints all immediate), then both CHECKs
--      narrowed to 2.
-- Nothing is re-seeded: the next "Reset sample cases" seeds version 2. The
-- whole file is one transaction, so a refused guard changes nothing.

-- 1. The rule ---------------------------------------------------------------
create or replace function vitally_private.version_one_blocks(p_intake_version smallint, p_fixture boolean, p_in_test_workspace boolean)
returns boolean language sql immutable security definer set search_path='' as $$
 select p_intake_version = 1 and not p_fixture and not p_in_test_workspace
$$;
create or replace function vitally_private.version_one_disposable(p_intake_version smallint, p_fixture boolean, p_in_test_workspace boolean)
returns boolean language sql immutable security definer set search_path='' as $$
 select p_intake_version = 1 and (p_fixture or p_in_test_workspace)
$$;
create or replace function vitally_private.version_one_blockers()
returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.cases c
  where vitally_private.version_one_blocks(c.intake_version, c.fixture,
   exists (select 1 from vitally_private.test_workspaces t where t.workspace_id = c.workspace_id))
$$;
revoke all on function vitally_private.version_one_blocks(smallint,boolean,boolean) from public,anon,authenticated,service_role;
revoke all on function vitally_private.version_one_disposable(smallint,boolean,boolean) from public,anon,authenticated,service_role;
revoke all on function vitally_private.version_one_blockers() from public,anon,authenticated,service_role;

-- 2. The guard --------------------------------------------------------------
do $$
declare v_blockers bigint = vitally_private.version_one_blockers();
begin
 if v_blockers > 0 then
  raise exception 'Migration 023 refused: % version-1 application(s) exist outside test workspaces (workspaces: %). Clear them first (docs/setup.md, "Migrations").',
   v_blockers,
   (select string_agg(distinct c.workspace_id::text, ', ') from public.cases c
     where vitally_private.version_one_blocks(c.intake_version, c.fixture,
      exists (select 1 from vitally_private.test_workspaces t where t.workspace_id = c.workspace_id)));
 end if;
end
$$;

-- 3. The cleanup ------------------------------------------------------------
with gone as (
 delete from public.cases c
  where vitally_private.version_one_disposable(c.intake_version, c.fixture,
   exists (select 1 from vitally_private.test_workspaces t where t.workspace_id = c.workspace_id))
  returning c.workspace_id)
update public.workspaces set fixture_generation = fixture_generation + 1
 where id in (select workspace_id from gone);

-- 4. Every workspace is version 2 -------------------------------------------
update public.workspaces set default_intake_version = 2 where default_intake_version <> 2;

-- 5. The functions without their version-1 paths (see the list below) ------

-- vitally_create_case, verbatim from 001 (with its revoke and grant) without
-- its version-1 key list: a create now carries no answers at all, as 011's
-- insert trigger already required of version 2. The signature, the grants
-- and the receipt digest are unchanged (design D6). 001 said plain
-- `create function`; this copy replaces it.
create or replace function public.vitally_create_case(p_action_id uuid,p_mode text,p_person_id uuid,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.memberships;
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
 if p_mode='client' then
  if v_member.access<>'applicant' or p_person_id is not null then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
  v_owner=v_user;
 elsif p_mode='assisted' then
  if v_member.access<>'presenter' then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
  select capabilities into v_capabilities from public.people where id=p_person_id and workspace_id=v_member.workspace_id;
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
 v_digest=encode(extensions.digest(jsonb_build_object('operation','CREATE_CASE','mode',p_mode,'personId',p_person_id,'answers',p_answers)::text,'sha256'),'hex');
 select fixture_generation into v_generation from public.workspaces where id=v_member.workspace_id;
 insert into public.action_receipts(workspace_id,actor_user_id,action_id,operation,request_digest,actor_person_id,generation)
 values(v_member.workspace_id,v_user,p_action_id,'CREATE_CASE',v_digest,p_person_id,v_generation) on conflict(workspace_id,actor_user_id,action_id) do nothing;
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
   values(v_reference,v_member.workspace_id,v_owner,false,p_mode,v_user,p_person_id,p_answers) returning id into v_case;
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

-- cases_intake_version_insert, verbatim from 011 without its version-1 paths:
-- a case takes its workspace's version, and every version starts empty.
create or replace function vitally_private.cases_intake_version_insert()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_version smallint;
begin
 select w.default_intake_version into v_version from public.workspaces w where w.id=new.workspace_id;
 new.intake_version = v_version;
 if new.answers is distinct from '{}'::jsonb then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 return new;
end;
$$;

-- check_related, verbatim from 017 without its version-1 paths.
create or replace function vitally_private.check_related(p_case public.cases,p_type text,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 case p_type
  when 'SAVE_ANSWERS' then
    if exists(select 1 from jsonb_each(p_payload->'answers') a
     left join vitally_private.intake_fields f on f.version = p_case.intake_version and f.group_id is null and f.field_id = a.key
     where f.field_id is null
      or (vitally_private.intake_answered(a.value) and not vitally_private.check_intake_value(f, a.value))) then
     raise sqlstate 'VT007' using message='VALIDATION';
    end if;
   if p_payload ? 'visited' then
    if exists(select 1 from jsonb_array_elements_text(p_payload->'visited') v
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
   if not exists(
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

-- act_save_answers, verbatim from 017 without its version-1 merge.
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

-- act_submit, verbatim from 011 without its version-1 path (required keys,
-- year, residence, helper and screening checks, and the screening detail).
create or replace function vitally_private.act_submit(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_answers jsonb=p_case.answers;
 v_number integer;
 v_contact jsonb;
begin
 if p_case.stage<>'draft' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
  select jsonb_strip_nulls(jsonb_build_object('tp_phone', c.phone, 'sp_phone', c.spouse_phone,
    'best_contact_time', to_jsonb(c.best_contact_time), 'best_contact_note', c.best_contact_note))
   into v_contact from public.case_contacts c where c.case_id=p_case.id;
  if cardinality(vitally_private.intake_missing(p_case.intake_version, v_answers, coalesce(v_contact, '{}'::jsonb))) > 0 then
   raise sqlstate 'VT007' using message='VALIDATION';
  end if;
  update public.cases set stage='received' where id=p_case.id returning client_number into v_number;
  return jsonb_build_object('detail',jsonb_build_object('clientNumber',v_number),
   'message','Application received. A volunteer will check your information and documents.');
end;
$$;

-- act_update_contact, verbatim from 013 without its version-1 refusal.
create or replace function vitally_private.act_update_contact(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_field vitally_private.intake_fields;
 v_key text;
 v_value jsonb;
begin
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

-- seed_fixtures, verbatim from 019 without its version-1 branch: samples are
-- always version 2.
create or replace function vitally_private.seed_fixtures(p_workspace_id uuid,p_generation bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_key text;
 v_owner uuid;
 v_actor uuid;
 v_case public.cases;
 v_reference text;
 v_constraint text;
 v_events int;
 v_ids jsonb='{}'::jsonb;
begin
 if p_workspace_id is null or p_generation is null then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 -- The member recorded on the rows that require one. A presenter is the only
 -- account that could have performed this work, and a workspace with none is
 -- not ready to be seeded.
 select m.user_id into v_actor from public.memberships m
  where m.workspace_id=p_workspace_id and m.active and m.access='presenter'
  order by m.user_id limit 1;
 if v_actor is null then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 foreach v_key in array vitally_private.fixture_keys() loop
  select b.owner_user_id into v_owner from vitally_private.fixture_client_bindings b
   where b.workspace_id=p_workspace_id and b.fixture_key=v_key;
  -- A collision on the reference is the only failure worth retrying, exactly
  -- as `vitally_create_case` retries it.
  loop
   v_reference=vitally_private.new_reference();
   begin
     -- 011's insert trigger refuses version-2 answers on insert, so the case
     -- starts empty and takes its answers and its contact row straight after.
     insert into public.cases(reference,workspace_id,owner_user_id,fixture,fixture_key,origin,
       created_by_user_id,created_by_person_id,answers,stage,revision,preparation_version,intake_verified)
     values(v_reference,p_workspace_id,v_owner,true,v_key,'fixture',v_actor,null,
       '{}'::jsonb,'draft',1,0,false)
     returning * into v_case;
     update public.cases set answers=vitally_private.fixture_answers_v2(v_key) where id=v_case.id
      returning * into v_case;
     insert into public.case_contacts(workspace_id,case_id,phone,best_contact_time,best_contact_note)
     select p_workspace_id,v_case.id,c.phone,c.best_contact_time,c.best_contact_note
      from vitally_private.fixture_contact_v2(v_key) c;
    exit;
   exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint<>'cases_reference_key' then raise;
 end if;
   end;
  end loop;
  v_events=vitally_private.apply_fixture_scenario(v_case,v_key,v_actor);
  -- One entry per recorded step, so the revision a browser sends back matches
  -- the history the case shows. The first internal entry names the generation
  -- that produced this set as a convenience for anyone reading the timeline;
  -- `public.workspaces.fixture_generation` is the authoritative record, and a
  -- later checkpoint on this case deletes every `case_events` row it has —
  -- this one included.
  insert into public.case_events(workspace_id,case_id,actor_user_id,actor_person_id,action,detail,created_at)
  values(p_workspace_id,v_case.id,null,null,'FIXTURE_SEEDED',
   jsonb_build_object('simulated',true,'fixtureKey',v_key,'generation',p_generation),
   now()-make_interval(hours=>v_events+1));
  update public.cases set revision=v_events+2 where id=v_case.id;
  v_ids=v_ids||jsonb_build_object(v_key,v_case.id);
 end loop;
 -- The one assistance request, on the case the office is already chasing, so
 -- the follow-up screen has the language and the contact preference the office
 -- recorded when this client asked for help with the forms (Ruling R57).
 insert into public.assistance_items(workspace_id,case_id,title,status,revision,assignee_person_id,
   language,contact_preference,fixture)
 values(p_workspace_id,(v_ids->>'admin_followup')::uuid,'Client needs help completing intake forms',
   'open',1,null,'Cantonese','Prefers calls from the main office',true);
 return v_ids;
end;
$$;

-- fixture_history, verbatim from 021 without the version-1 "screening" key in
-- the six sample SUBMIT details, so a seeded sample's history matches a
-- version-2 case played through.
create or replace function vitally_private.fixture_history(p_key text)
returns table(seq int,action text,person_key text,detail jsonb,message text)
language sql immutable security definer set search_path='' as $$
 select v.seq,v.action,v.person_key,v.detail,v.message from (values
  ('preparation_ready',1,'SUBMIT',null::text,'{"simulated":true}'::jsonb,'Application received. A volunteer will check your information and documents.'::text),
  ('preparation_ready',2,'VERIFY_INTAKE','sam','{"simulated":true,"checks":{"interview":true,"identity":true,"documents":true,"consent":true}}','Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.'),

  ('waiting_documents',1,'SUBMIT',null,'{"simulated":true}','Application received. A volunteer will check your information and documents.'),
  ('waiting_documents',2,'VERIFY_INTAKE','sam','{"simulated":true,"checks":{"interview":true,"identity":true,"documents":true,"consent":true}}','Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.'),
  ('waiting_documents',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('waiting_documents',4,'REQUEST_DOCUMENT','alex','{"simulated":true,"title":"Mileage record"}','A volunteer requested a document: Mileage record'),

  ('admin_followup',1,'SUBMIT',null,'{"simulated":true}','Application received. A volunteer will check your information and documents.'),
  ('admin_followup',2,'VERIFY_INTAKE','sam','{"simulated":true,"checks":{"interview":true,"identity":true,"documents":true,"consent":true}}','Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.'),
  ('admin_followup',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('admin_followup',4,'REQUEST_DOCUMENT','alex','{"simulated":true,"title":"Mileage record"}','A volunteer requested a document: Mileage record'),
  ('admin_followup',5,'ESCALATE_CONTACT','alex','{"simulated":true}',null),
  ('admin_followup',6,'RECORD_CONTACT','sam','{"simulated":true,"outcome":"no_answer"}',null),

  ('review_ready',1,'SUBMIT',null,'{"simulated":true}','Application received. A volunteer will check your information and documents.'),
  ('review_ready',2,'VERIFY_INTAKE','sam','{"simulated":true,"checks":{"interview":true,"identity":true,"documents":true,"consent":true}}','Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.'),
  ('review_ready',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('review_ready',4,'REQUEST_DOCUMENT','alex','{"simulated":true,"title":"Mileage record"}','A volunteer requested a document: Mileage record'),
  ('review_ready',5,'RECORD_DOCUMENT_RESPONSE','sam','{"simulated":true,"source":"staff_recorded"}','A sample document was recorded by staff and is awaiting verification.'),
  ('review_ready',6,'VERIFY_DOCUMENT','alex','{"simulated":true}','A volunteer verified your document. No further action is needed for this request.'),
  ('review_ready',7,'SUBMIT_REVIEW','alex','{"simulated":true,"preparationVersion":1}','Your volunteer recorded that preparation is complete in the tax software. An independent reviewer will check it next.'),

  ('corrections_required',1,'SUBMIT',null,'{"simulated":true}','Application received. A volunteer will check your information and documents.'),
  ('corrections_required',2,'VERIFY_INTAKE','sam','{"simulated":true,"checks":{"interview":true,"identity":true,"documents":true,"consent":true}}','Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.'),
  ('corrections_required',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('corrections_required',4,'SUBMIT_REVIEW','alex','{"simulated":true,"preparationVersion":1}','Your volunteer recorded that preparation is complete in the tax software. An independent reviewer will check it next.'),
  ('corrections_required',5,'CLAIM_REVIEW','morgan','{"simulated":true}','An independent reviewer is checking your return.'),
  ('corrections_required',6,'REQUEST_CORRECTIONS','morgan','{"simulated":true,"preparationVersion":1}','The reviewer asked your preparer to make corrections. No action is needed from you right now.'),

  ('review_approved',1,'SUBMIT',null,'{"simulated":true}','Application received. A volunteer will check your information and documents.'),
  ('review_approved',2,'VERIFY_INTAKE','sam','{"simulated":true,"checks":{"interview":true,"identity":true,"documents":true,"consent":true}}','Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.'),
  ('review_approved',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('review_approved',4,'SUBMIT_REVIEW','alex','{"simulated":true,"preparationVersion":1}','Your volunteer recorded that preparation is complete in the tax software. An independent reviewer will check it next.'),
  ('review_approved',5,'CLAIM_REVIEW','morgan','{"simulated":true}','An independent reviewer is checking your return.'),
  ('review_approved',6,'REQUEST_CORRECTIONS','morgan','{"simulated":true,"preparationVersion":1}','The reviewer asked your preparer to make corrections. No action is needed from you right now.'),
  ('review_approved',7,'RESUBMIT_REVIEW','alex','{"simulated":true,"preparationVersion":2}','Your volunteer recorded the requested corrections in the tax software. An independent reviewer will check the updated return.'),
  ('review_approved',8,'CLAIM_REVIEW','morgan','{"simulated":true}','An independent reviewer is checking your return.'),
  ('review_approved',9,'APPROVE_REVIEW','morgan','{"simulated":true,"preparationVersion":2}','Your return has been checked by the reviewer. A volunteer will contact you soon to sign and file.')
 ) as v(key,seq,action,person_key,detail,message)
 where v.key=p_key
 order by v.seq
$$;

drop function if exists vitally_private.intake_answer_keys();
drop function if exists vitally_private.fixture_answers(text);

-- 6. Only version 2 -----------------------------------------------------------
-- Run queued deferred FK checks now: a workspace updated twice above leaves pending trigger events that block ALTER TABLE.
set constraints all immediate;
alter table public.workspaces drop constraint workspaces_default_intake_version_range;
alter table public.workspaces add constraint workspaces_default_intake_version_range check (default_intake_version = 2);
alter table public.cases drop constraint cases_intake_version_range;
alter table public.cases add constraint cases_intake_version_range check (intake_version = 2);
-- 011 gave cases.intake_version a column default of 1. The insert trigger
-- always overrides it, but no version-1 value is left in the schema.
alter table public.cases alter column intake_version set default 2;
