-- Case action transaction core. Document, contact and review actions are later
-- migrations: they add a handler plus one branch in each ordered check below.

-- Step 1: caller identity and one active membership, without inspecting a target.
create function vitally_private.require_membership() returns public.memberships
language plpgsql security definer set search_path='' as $$
declare v_member public.memberships;
 v_user uuid=auth.uid();
begin
 if v_user is null then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 select * into v_member from public.memberships where user_id=v_user and active for share;
 if not found then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 return v_member;
end;
$$;

-- Step 2: the caller's own receipt for this action id, compared by immutable digest.
create function vitally_private.reserve_receipt(p_member public.memberships,p_action_id uuid,p_operation text,p_digest text,p_person_id uuid)
returns public.action_receipts language plpgsql security definer set search_path='' as $$
declare v_receipt public.action_receipts;
 v_generation bigint;
begin
 select fixture_generation into v_generation from public.workspaces where id=p_member.workspace_id;
 insert into public.action_receipts(workspace_id,actor_user_id,action_id,operation,request_digest,actor_person_id,generation)
 values(p_member.workspace_id,p_member.user_id,p_action_id,p_operation,p_digest,p_person_id,v_generation)
 on conflict(workspace_id,actor_user_id,action_id) do nothing;
 select * into v_receipt from public.action_receipts
  where workspace_id=p_member.workspace_id and actor_user_id=p_member.user_id and action_id=p_action_id for update;
 if v_receipt.operation<>p_operation or v_receipt.request_digest<>p_digest then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 return v_receipt;
end;
$$;

-- Step 3: lock the case through permitted visibility only. Absent, other-workspace
-- and another applicant's case are one indistinguishable NOT_FOUND.
create function vitally_private.lock_case(p_member public.memberships,p_case_id uuid)
returns public.cases language plpgsql security definer set search_path='' as $$
declare v_case public.cases;
begin
 select * into v_case from public.cases c
  where c.id=p_case_id and c.workspace_id=p_member.workspace_id
   and ((p_member.access='applicant' and c.owner_user_id=p_member.user_id)
     or (p_member.access='presenter' and (c.origin<>'client' or c.stage<>'draft')))
  for update;
 if not found then
  raise sqlstate 'VT002' using message='NOT_FOUND';
 end if;
 return v_case;
end;
$$;

-- The target-independent half of step 4: who the caller is, which staff person
-- they selected, and the operational capability the action type requires. The
-- replay path runs exactly this, so the two paths cannot drift. The technical
-- prepare/review qualification is step 7 and must not be tested here.
create function vitally_private.check_operation_authority(p_member public.memberships,p_person_id uuid,p_type text)
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
  when 'VERIFY_INTAKE' then
   if p_person_id is null or not ('admin'=any(v_person.capabilities)) then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'CLAIM_PREPARATION' then
   if p_person_id is null then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  -- Unknown or not-yet-implemented actions never reach a handler.
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
 return v_person;
end;
$$;

-- Step 4: the operation authority above, then the half that depends on which
-- case this is. Ownership is the only target-dependent rule these actions have.
create function vitally_private.check_authority(p_member public.memberships,p_case public.cases,p_person_id uuid,p_type text)
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
  else null;
 end case;
 return v_person;
end;
$$;

create function vitally_private.payload_keys(p_payload jsonb) returns text[]
language sql immutable security definer set search_path='' as $$
 select coalesce(pg_catalog.array_agg(k order by k),array[]::text[]) from pg_catalog.jsonb_object_keys(p_payload) k
$$;

-- The intake whitelist mirrors INTAKE_ANSWER_KEYS in src/domain.mjs.
create function vitally_private.intake_answer_keys() returns text[]
language sql immutable security definer set search_path='' as $$
 select array['service','year','language','residenceCity','residenceState','city','state','rideshare','other','stocks','firstName','lastName','address','zip','household','helper','documents']
$$;

-- Step 5 (payload): explicit shapes; anything outside the whitelist is rejected.
create function vitally_private.check_payload(p_type text,p_payload jsonb) returns void
language plpgsql immutable security definer set search_path='' as $$
begin
 case p_type
  when 'SAVE_ANSWERS' then
   if vitally_private.payload_keys(p_payload)<>array['answers'] or jsonb_typeof(p_payload->'answers')<>'object'
    or exists(select 1 from jsonb_each(p_payload->'answers') a
     where a.key<>all(vitally_private.intake_answer_keys()) or jsonb_typeof(a.value)<>'string' or length(a.value#>>'{}')>1000) then
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
  when 'CLAIM_PREPARATION' then
   if vitally_private.payload_keys(p_payload)<>array[]::text[] then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
end;
$$;

-- Steps 6-8 per action. Each handler owns its stage rule, its qualification and
-- its records, and returns the internal detail plus optional client-visible copy.
create function vitally_private.act_save_answers(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_case.stage<>'draft' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 update public.cases set answers=answers||(p_payload->'answers') where id=p_case.id;
 -- Internal history records which fields changed, never the answers themselves.
 return jsonb_build_object('detail',jsonb_build_object('fields',to_jsonb(vitally_private.payload_keys(p_payload->'answers'))));
end;
$$;

-- The payload only confirms intent; the server re-checks the saved answers, in
-- the same order as the SUBMIT branch of updateCase in src/domain.mjs.
create function vitally_private.act_submit(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_answers jsonb=p_case.answers;
begin
 if p_case.stage<>'draft' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 if exists(select 1 from unnest(array['service','year','language','residenceCity','residenceState','firstName','lastName','address','city','state','zip','household','helper','documents']) k
  where coalesce(btrim(v_answers->>k),'')='') then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 if v_answers->>'year'<>'2025' or v_answers->>'residenceState'='Other' or v_answers->>'helper'<>'self' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 -- screening() continues only on a complete, supported screen.
 if coalesce(v_answers->>'rideshare','') not in ('yes','no')
  or coalesce(v_answers->>'other','') not in ('yes','no')
  or coalesce(v_answers->>'stocks','') not in ('yes','no')
  or v_answers->>'other'='yes' or v_answers->>'stocks'='yes' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 update public.cases set stage='received' where id=p_case.id;
 return jsonb_build_object('detail',jsonb_build_object('screening','continue'),
  'message','Application received. A volunteer will check your information and documents.');
end;
$$;

-- Demo attestations only: this records simulated checks and asserts no real
-- interview, identity, document or consent verification.
create function vitally_private.act_verify_intake(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_case.stage<>'received' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 update public.cases set stage='preparation_ready',intake_verified=true where id=p_case.id;
 return jsonb_build_object('detail',jsonb_build_object('simulated',true,'checks',p_payload->'checks'),
  'message','Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.');
end;
$$;

-- One winner: the row lock from step 3 plus the revision check from step 5 makes
-- a second simultaneous claim a CONFLICT. Participation is recorded with the
-- assignment and kept for the case's lifetime.
create function vitally_private.act_claim_preparation(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_case.stage<>'preparation_ready' or p_case.preparer_id is not null then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 if p_person.id is null or not ('prepare'=any(p_person.capabilities)) then
  raise sqlstate 'VT006' using message='INELIGIBLE';
 end if;
 update public.cases set stage='preparing',preparer_id=p_person.id where id=p_case.id;
 insert into public.preparation_participants(workspace_id,case_id,person_id)
 values(p_case.workspace_id,p_case.id,p_person.id) on conflict do nothing;
 return jsonb_build_object('detail',jsonb_build_object('preparerPersonId',p_person.id),
  'message','A volunteer has started preparing your return.');
end;
$$;

-- Step 8: history, revision and receipt commit with the handler's mutation.
create function vitally_private.commit_action(p_member public.memberships,p_case public.cases,p_person public.people,p_action_id uuid,p_type text,p_outcome jsonb,p_receipt public.action_receipts)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_revision bigint;
 v_result jsonb;
begin
 insert into public.case_events(workspace_id,case_id,actor_user_id,actor_person_id,action,detail)
 values(p_case.workspace_id,p_case.id,p_member.user_id,p_person.id,p_type,coalesce(p_outcome->'detail','{}'::jsonb));
 -- Client-relevant actions add plain-language progress with no internal detail.
 if p_outcome->>'message' is not null then
  insert into public.client_events(workspace_id,case_id,action,message)
  values(p_case.workspace_id,p_case.id,p_type,p_outcome->>'message');
 end if;
 update public.cases set revision=revision+1 where id=p_case.id returning revision into v_revision;
 v_result=jsonb_build_object('actionId',p_action_id,'caseId',p_case.id,'reference',p_case.reference,'revision',v_revision);
 update public.action_receipts set target_id=p_case.id,target_reference=p_case.reference,receipt=v_result where id=p_receipt.id;
 return v_result;
end;
$$;

-- The entry point runs the ordered common checks, dispatches one handler, then
-- commits. Any raise rolls back the whole statement, reserved receipt included.
create function public.vitally_apply_action(p_action_id uuid,p_case_id uuid,p_expected_revision bigint,p_person_id uuid,p_type text,p_payload jsonb)
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
 case p_type
  when 'SAVE_ANSWERS' then v_outcome=vitally_private.act_save_answers(v_member,v_case,v_person,p_payload);
  when 'SUBMIT' then v_outcome=vitally_private.act_submit(v_member,v_case,v_person,p_payload);
  when 'VERIFY_INTAKE' then v_outcome=vitally_private.act_verify_intake(v_member,v_case,v_person,p_payload);
  when 'CLAIM_PREPARATION' then v_outcome=vitally_private.act_claim_preparation(v_member,v_case,v_person,p_payload);
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
 return vitally_private.commit_action(v_member,v_case,v_person,p_action_id,p_type,v_outcome,v_receipt);
end;
$$;
revoke all on function public.vitally_apply_action(uuid,uuid,bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.vitally_apply_action(uuid,uuid,bigint,uuid,text,jsonb) to authenticated;
revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
