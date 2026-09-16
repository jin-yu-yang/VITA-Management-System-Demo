-- Assistance work, simulated reminders and administrative closure. The two new
-- case actions extend the 003 spine the way 004's did: one branch per action in
-- each ordered check, one handler each. The second public entry point,
-- vitally_assistance_action, runs the same ordered checks over the same private
-- helpers against an assistance item instead of a case. Every function here is
-- `create or replace`, so the file can be re-applied as a whole; no 001-004
-- object is dropped.

-- A reminder is a timestamp and an internal note, so it needs two new columns
-- rather than a table. The person reference uses the same-workspace pattern the
-- other case people columns use in 001.
alter table public.cases add column if not exists last_reminded_at timestamptz;
alter table public.cases add column if not exists last_reminded_by_person_id uuid;
alter table public.cases drop constraint if exists cases_last_reminded_person;
alter table public.cases add constraint cases_last_reminded_person
 foreign key(workspace_id,last_reminded_by_person_id) references public.people(workspace_id,id);

-- Step 4, target-independent half. Replaces the 004 definition, adding the
-- reminder, closure and assistance branches. Assistance operations are named
-- `ASSISTANCE:<type>` so one capability table, one replay re-check and one
-- unknown-operation rule serve both entry points.
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
  when 'CLAIM_PREPARATION','REMIND' then
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

-- Steps 6-8 for the reminder. Ruling R24: a reminder belongs on work that is
-- genuinely waiting to be picked up, so it records who nudged and when, and
-- nothing else. The demo never sends a message, so there is no client event and
-- no contact record: the simulated flag says so in the internal history.
create or replace function vitally_private.act_remind(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not ((p_case.stage='preparation_ready' and p_case.preparer_id is null)
      or (p_case.stage='review_ready' and p_case.reviewer_id is null)) then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 update public.cases set last_reminded_at=now(),last_reminded_by_person_id=p_person.id where id=p_case.id;
 return jsonb_build_object('detail',jsonb_build_object('simulated',true));
end;
$$;

-- Steps 6-8 for closure. Ruling R25: an admin may close work in progress and an
-- assisted draft nobody owns, but never an approved return or a closed case.
-- Pending requests and tasks are cancelled, never deleted: their titles,
-- reasons, attempts and received documents stay exactly as they are, and so do
-- the preparer, the reviewer and the participation records.
create or replace function vitally_private.act_close_case(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not (p_case.stage in ('received','preparation_ready','preparing','review_ready','reviewing','corrections_required')
   or (p_case.stage='draft' and p_case.owner_user_id is null)) then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 update public.cases set stage='closed' where id=p_case.id;
 update public.document_requests set status='cancelled',updated_at=now()
  where workspace_id=p_case.workspace_id and case_id=p_case.id and status in ('open','awaiting_verification');
 update public.admin_followups set status='cancelled'
  where workspace_id=p_case.workspace_id and case_id=p_case.id and status='open';
 -- The reason is staff context: case_events is presenter-only, and the client
 -- message says plainly that an office decision, not a filing, has changed.
 return jsonb_build_object('detail',jsonb_build_object('reason',p_payload->>'reason'),
  'message','Your application was closed by the office. This does not change any return filed elsewhere. Contact PCDC if you have questions.');
end;
$$;

-- Step 3 for assistance: the item is locked through presenter visibility only,
-- and a linked case keeps its draft privacy rule, exactly as the RLS policy in
-- 002 reads it. Absent, other-workspace and client-visible-only are one
-- indistinguishable NOT_FOUND.
create or replace function vitally_private.lock_assistance_item(p_member public.memberships,p_item_id uuid)
returns public.assistance_items language plpgsql security definer set search_path='' as $$
declare v_item public.assistance_items;
begin
 select * into v_item from public.assistance_items i
  where i.id=p_item_id and i.workspace_id=p_member.workspace_id and p_member.access='presenter'
   and (i.case_id is null or exists(select 1 from public.cases c
    where c.workspace_id=i.workspace_id and c.id=i.case_id and (c.origin<>'client' or c.stage<>'draft')))
  for update;
 if not found then
  raise sqlstate 'VT002' using message='NOT_FOUND';
 end if;
 return v_item;
end;
$$;

-- Step 5 for assistance: the note is the whole request body, so its rule is the
-- action's. A claim carries none; a resolution says what was done.
create or replace function vitally_private.check_assistance_note(p_type text,p_note text) returns void
language plpgsql immutable security definer set search_path='' as $$
begin
 case p_type
  when 'CLAIM' then
   if coalesce(p_note,'')<>'' then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'RESOLVE' then
   if coalesce(btrim(p_note),'')='' or length(p_note)>1000 then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
end;
$$;

-- Steps 6-8 per assistance action, returning the item's new revision. Ruling
-- R23: the status decides first, and only then the helper holding the item, so
-- a second helper cannot tell an open item from one already taken.
create or replace function vitally_private.act_assistance_claim(p_item public.assistance_items,p_person public.people)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_revision bigint;
begin
 if p_item.status<>'open' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 update public.assistance_items set status='assigned',assignee_person_id=p_person.id,
  revision=revision+1,updated_at=now() where id=p_item.id returning revision into v_revision;
 return v_revision;
end;
$$;

create or replace function vitally_private.act_assistance_resolve(p_item public.assistance_items,p_person public.people,p_note text)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_revision bigint;
begin
 if p_item.status<>'assigned' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 if p_item.assignee_person_id is distinct from p_person.id then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 -- The helper who took the item stays recorded on it after it is resolved.
 update public.assistance_items set status='resolved',resolution_note=p_note,
  revision=revision+1,updated_at=now() where id=p_item.id returning revision into v_revision;
 return v_revision;
end;
$$;

-- Step 8 for assistance: the receipt only. Assistance work is beside the tax
-- workflow (Ruling R22), so it appends no case or client history and touches no
-- case row; commit_action stays the case-action commit.
create or replace function vitally_private.commit_assistance(p_action_id uuid,p_item public.assistance_items,p_revision bigint,p_receipt public.action_receipts)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 v_result=jsonb_build_object('actionId',p_action_id,'itemId',p_item.id,'revision',p_revision);
 update public.action_receipts set target_id=p_item.id,receipt=v_result where id=p_receipt.id;
 return v_result;
end;
$$;

-- The assistance entry point runs the same ordered checks as the case entry
-- point over the same membership, receipt and authority helpers, against an
-- assistance item. Any raise rolls back the whole statement, reserved receipt
-- included.
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
 -- A malformed envelope cannot be digested or reserved; the note is still
 -- checked at step 5, after the target and authority checks.
 if p_action_id is null or p_item_id is null or p_expected_revision is null or p_type is null then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 v_operation='ASSISTANCE:'||p_type;
 v_digest=encode(extensions.digest(jsonb_build_object('operation',v_operation,'itemId',p_item_id,'expectedRevision',p_expected_revision,'personId',p_person_id,'note',p_note)::text,'sha256'),'hex');
 v_receipt=vitally_private.reserve_receipt(v_member,p_action_id,v_operation,v_digest,p_person_id);
 -- An identical accepted replay returns its receipt after the current membership
 -- and operation-authority checks, without repeating the mutation and without
 -- reaching the target.
 if v_receipt.receipt is not null then
  perform vitally_private.check_operation_authority(v_member,p_person_id,v_operation);
  return v_receipt.receipt;
 end if;
 v_item=vitally_private.lock_assistance_item(v_member,p_item_id);
 v_person=vitally_private.check_operation_authority(v_member,p_person_id,v_operation);
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
  when 'REMIND' then v_outcome=vitally_private.act_remind(v_member,v_case,v_person,p_payload);
  when 'CLOSE_CASE' then v_outcome=vitally_private.act_close_case(v_member,v_case,v_person,p_payload);
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
 return vitally_private.commit_action(v_member,v_case,v_person,p_action_id,p_type,v_outcome,v_receipt);
end;
$$;
revoke all on function public.vitally_apply_action(uuid,uuid,bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.vitally_apply_action(uuid,uuid,bigint,uuid,text,jsonb) to authenticated;
revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
