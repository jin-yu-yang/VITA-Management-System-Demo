-- Document requests, client and staff receipts, verification, and admin
-- follow-up. These extend the 003 spine rather than changing it: one branch per
-- action in each ordered check, one handler each. The four shared checks and
-- the dispatcher are replaced in place with their added branches; no 001-003
-- object is dropped. Every function here is `create or replace`, so the file
-- can be re-applied as a whole.

-- A related record named in a payload must be a well-formed uuid before any
-- lookup casts it; anything else is a payload error, never a server error.
create or replace function vitally_private.payload_uuid(p_payload jsonb,p_key text) returns uuid
language sql immutable security definer set search_path='' as $$
 select case when jsonb_typeof(p_payload->p_key)='string'
   and p_payload->>p_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then (p_payload->>p_key)::uuid end
$$;

-- Free text in a payload: a string with content, inside the column's bound.
create or replace function vitally_private.payload_text(p_payload jsonb,p_key text,p_limit int) returns boolean
language sql immutable security definer set search_path='' as $$
 select jsonb_typeof(p_payload->p_key)='string' and btrim(p_payload->>p_key)<>''
  and length(p_payload->>p_key)<=p_limit
$$;

-- Step 4, target-independent half. Replaces the 003 definition, adding the
-- document and follow-up branches. `prepare` stays a step-7 qualification and
-- is deliberately not tested here; `receive_documents` and `followup` are
-- operational capabilities and belong here.
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
  when 'VERIFY_INTAKE' then
   if p_person_id is null or not ('admin'=any(v_person.capabilities)) then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'CLAIM_PREPARATION','REQUEST_DOCUMENT','VERIFY_DOCUMENT','ESCALATE_CONTACT' then
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
  -- Unknown or not-yet-implemented actions never reach a handler.
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
 return v_person;
end;
$$;

-- Step 4: the operation authority above, then the half that depends on which
-- case this is. Ownership is the only target-dependent rule these actions have.
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
  else null;
 end case;
 return v_person;
end;
$$;

-- Step 5 (payload): explicit shapes; anything outside the whitelist is rejected.
-- Stays immutable and table-free: related-record membership is check_related.
create or replace function vitally_private.check_payload(p_type text,p_payload jsonb) returns void
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
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
end;
$$;

-- Step 5 (related records), after the shape check: an id in the payload must
-- name a record of the case locked at step 3. A request or task from another
-- case or workspace is a validation error, never a cross-case write.
create or replace function vitally_private.check_related(p_case public.cases,p_type text,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 case p_type
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
  else null;
 end case;
end;
$$;

-- Step 7 for the preparation-side document actions: the technical
-- qualification first, then this case's current assignment together with the
-- participation record the claim created. A former preparer, an admin title
-- and a reviewer assignment all fail the second test.
create or replace function vitally_private.require_case_preparer(p_case public.cases,p_person public.people) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_person.id is null or not ('prepare'=any(p_person.capabilities)) then
  raise sqlstate 'VT006' using message='INELIGIBLE';
 end if;
 if p_case.preparer_id is distinct from p_person.id
  or not exists(select 1 from public.preparation_participants p
   where p.case_id=p_case.id and p.person_id=p_person.id) then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
end;
$$;

-- Steps 6 and 8 shared by the client response and the staff receipt: the same
-- stage window, the same open request, the same awaiting-verification result.
-- Only the recorded source and actor differ, so neither handler can drift into
-- verifying, reassigning, or adding participation.
create or replace function vitally_private.receive_document(p_case public.cases,p_payload jsonb,p_source text,p_user_id uuid,p_person_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request public.document_requests;
 v_document uuid;
begin
 if p_case.stage not in ('preparing','corrections_required') then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 select * into v_request from public.document_requests
  where workspace_id=p_case.workspace_id and case_id=p_case.id
   and id=vitally_private.payload_uuid(p_payload,'requestId') for update;
 -- An already answered request takes no second receipt, even at a fresh revision.
 if v_request.status is distinct from 'open' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 insert into public.documents(workspace_id,case_id,request_id,filename,source,submitted_by_user_id,submitted_by_person_id)
 values(p_case.workspace_id,p_case.id,v_request.id,p_payload->>'filename',p_source,p_user_id,p_person_id)
 returning id into v_document;
 -- Receipt is not verification: the preparer still confirms the response.
 update public.document_requests set status='awaiting_verification',updated_at=now() where id=v_request.id;
 return jsonb_build_object('requestId',v_request.id,'documentId',v_document,'source',p_source);
end;
$$;

-- Steps 6-8 per action. The case stage never changes here: a document request
-- and an admin task are blockers beside the stage, not stages of their own.
create or replace function vitally_private.act_request_document(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request uuid;
begin
 if p_case.stage not in ('preparing','corrections_required') then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 perform vitally_private.require_case_preparer(p_case,p_person);
 insert into public.document_requests(workspace_id,case_id,title,message,requested_by_person_id)
 values(p_case.workspace_id,p_case.id,p_payload->>'title',p_payload->>'message',p_person.id)
 returning id into v_request;
 -- The client sees the title; the instructions live on the request itself.
 return jsonb_build_object('detail',jsonb_build_object('requestId',v_request),
  'message','A volunteer requested a document: '||(p_payload->>'title'));
end;
$$;

create or replace function vitally_private.act_respond_document(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 return jsonb_build_object(
  'detail',vitally_private.receive_document(p_case,p_payload,'client',p_member.user_id,null),
  'message','Your document was received and is waiting for a volunteer to verify it.');
end;
$$;

-- The administrative receipt records who took delivery. It claims no client
-- upload, creates no client access, and adds no preparation participation.
create or replace function vitally_private.act_record_document_response(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 return jsonb_build_object(
  'detail',vitally_private.receive_document(p_case,p_payload,'staff_recorded',p_member.user_id,p_person.id),
  'message','A sample document was recorded by staff and is awaiting verification.');
end;
$$;

create or replace function vitally_private.act_verify_document(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request public.document_requests;
begin
 select * into v_request from public.document_requests
  where workspace_id=p_case.workspace_id and case_id=p_case.id
   and id=vitally_private.payload_uuid(p_payload,'requestId') for update;
 -- Nothing to verify before a receipt, and nothing to verify twice.
 if v_request.status is distinct from 'awaiting_verification' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 perform vitally_private.require_case_preparer(p_case,p_person);
 update public.document_requests set status='verified',updated_at=now() where id=v_request.id;
 return jsonb_build_object('detail',jsonb_build_object('requestId',v_request.id),
  'message','A volunteer verified your document. No further action is needed for this request.');
end;
$$;

create or replace function vitally_private.act_escalate_contact(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request public.document_requests;
 v_assignee public.people;
 v_followup uuid;
begin
 select * into v_request from public.document_requests
  where workspace_id=p_case.workspace_id and case_id=p_case.id
   and id=vitally_private.payload_uuid(p_payload,'requestId') for update;
 -- One active task per unresolved request: repeated clicks add none.
 if v_request.status is distinct from 'open'
  or exists(select 1 from public.admin_followups t where t.request_id=v_request.id and t.status='open') then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 perform vitally_private.require_case_preparer(p_case,p_person);
 -- The workspace's configured follow-up person, never a browser-supplied one.
 -- A missing or unqualified default is a setup error that creates no task.
 select p.* into v_assignee from public.people p
  join public.workspaces w on w.id=p.workspace_id and w.default_followup_person_id=p.id
  where w.id=p_case.workspace_id;
 if not found or not ('followup'=any(v_assignee.capabilities)) then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 insert into public.admin_followups(workspace_id,case_id,request_id,assignee_person_id,reason,created_by_person_id)
 values(p_case.workspace_id,p_case.id,v_request.id,v_assignee.id,p_payload->>'reason',p_person.id)
 returning id into v_followup;
 -- Contact work is internal: staff notes never become client-visible progress.
 return jsonb_build_object('detail',jsonb_build_object('requestId',v_request.id,'followupId',v_followup,'assigneePersonId',v_assignee.id));
end;
$$;

-- Step 7 for the follow-up actions: the capability was checked at step 4, the
-- assignment is checked here, after the task's own state.
create or replace function vitally_private.lock_open_followup(p_case public.cases,p_person public.people,p_payload jsonb)
returns public.admin_followups language plpgsql security definer set search_path='' as $$
declare v_followup public.admin_followups;
begin
 select * into v_followup from public.admin_followups
  where workspace_id=p_case.workspace_id and case_id=p_case.id
   and id=vitally_private.payload_uuid(p_payload,'followupId') for update;
 if v_followup.status is distinct from 'open' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 if v_followup.assignee_person_id is distinct from p_person.id then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 return v_followup;
end;
$$;

create or replace function vitally_private.act_record_contact(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_followup public.admin_followups;
 v_attempt uuid;
begin
 v_followup=vitally_private.lock_open_followup(p_case,p_person,p_payload);
 insert into public.contact_attempts(workspace_id,case_id,followup_id,actor_user_id,actor_person_id,outcome,note)
 values(p_case.workspace_id,p_case.id,v_followup.id,p_member.user_id,p_person.id,p_payload->>'outcome',p_payload->>'note')
 returning id into v_attempt;
 -- Recording an attempt never resolves the task, even when the client answered.
 return jsonb_build_object('detail',jsonb_build_object('followupId',v_followup.id,'attemptId',v_attempt,'outcome',p_payload->>'outcome'));
end;
$$;

create or replace function vitally_private.act_resolve_followup(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_followup public.admin_followups;
begin
 v_followup=vitally_private.lock_open_followup(p_case,p_person,p_payload);
 -- Resolution closes the contact task only: the document request, its
 -- verification, the preparer and the participants are all left as they are.
 update public.admin_followups set status='resolved',resolution_outcome=p_payload->>'outcome',
  resolution_note=p_payload->>'note',resolved_at=now() where id=v_followup.id;
 return jsonb_build_object('detail',jsonb_build_object('followupId',v_followup.id,'outcome',p_payload->>'outcome'));
end;
$$;

-- The entry point runs the ordered common checks, dispatches one handler, then
-- commits. Any raise rolls back the whole statement, reserved receipt included.
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
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
 return vitally_private.commit_action(v_member,v_case,v_person,p_action_id,p_type,v_outcome,v_receipt);
end;
$$;
revoke all on function public.vitally_apply_action(uuid,uuid,bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.vitally_apply_action(uuid,uuid,bigint,uuid,text,jsonb) to authenticated;
revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
