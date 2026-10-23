-- 036: Waiting for documents and Hold, the closing reasons and the client's
-- withdrawal (OpenSpec change add-hold-and-closing, design D1-D14).
--
--   * Two stages, `awaiting_documents` and `on_hold`, before `closed`.
--   * Three nullable `cases` columns: `documents_origin` (the stage the office
--     asked for documents from: screening or preparation_ready), `hold_origin`
--     (the stage a Hold came from: awaiting_documents or review_approved) and
--     `closing_reason` (why a case was closed). Check constraints keep each
--     consistent with the stage.
--   * The office asks for documents at intake (REQUEST_DOCUMENTS_AT_INTAKE), and
--     an admin records and verifies them there.
--
-- Later sections redefine these shared functions. Each is copied verbatim from
-- its newest definition, with only the lines marked `-- 036` changed, as 035
-- does:
--
--   | Function                                   | Copied from               | What 036 changes |
--   |--------------------------------------------|---------------------------|------------------|
--   | vitally_private.check_payload              | 035                       | new REQUEST_DOCUMENTS_AT_INTAKE, PUT_ON_HOLD and RESUME_FROM_HOLD branches; CLOSE_CASE takes one of six reasons and an optional note (`other` needs it) |
--   | vitally_private.act_close_case             | 035                       | also closes from Waiting for documents and Hold, stores the reason, clears both origins, tells the client the reason's line |
--   | vitally_private.receive_document           | 004                      | also accepted at Waiting for documents, and at a Hold that came from it |
--   | vitally_private.act_verify_document        | 004                       | at those stages an admin verifies, and the last verified request returns the case |
--   | vitally_private.check_operation_authority  | 035                       | REQUEST_DOCUMENTS_AT_INTAKE, PUT_ON_HOLD and RESUME_FROM_HOLD join the admin-only group |
--   | public.vitally_apply_action                | 035                       | dispatches REQUEST_DOCUMENTS_AT_INTAKE, PUT_ON_HOLD, RESUME_FROM_HOLD and WITHDRAW |
--   | vitally_private.check_authority            | 018                       | WITHDRAW needs the case's owner, as RESPOND_DOCUMENT does |
--
-- (check_payload also gains a WITHDRAW branch, and check_operation_authority
-- puts WITHDRAW with RESPOND_DOCUMENT in the applicant-only group.)
--
-- New functions: vitally_private.act_request_documents_at_intake,
-- vitally_private.return_from_documents, vitally_private.act_put_on_hold,
-- vitally_private.act_resume_from_hold, vitally_private.closed_line,
-- vitally_private.close_case_steps and vitally_private.act_withdraw.
--
-- Written to be safe to apply again on a local test stack whose
-- schema_migrations row for this file was deleted during development: every
-- statement is `if not exists`, `create or replace`, or a drop-then-add.

-- ---------------------------------------------------------------------------
-- 1. The stage list: 035's, plus awaiting_documents and on_hold.

alter table public.cases drop constraint if exists cases_stage_check;
alter table public.cases add constraint cases_stage_check check (stage in (
  'draft','received','screening','preparation_ready','preparing','review_ready',
  'reviewing','corrections_required','review_approved','ready_to_efile','efiled',
  'rejected','accepted','awaiting_documents','on_hold','closed'));

-- ---------------------------------------------------------------------------
-- 2. The origin and reason columns. documents_origin is set exactly while the
-- case waits for documents (Waiting for documents, or a Hold that came from it);
-- hold_origin exactly while it is on Hold; closing_reason only once closed.

alter table public.cases add column if not exists documents_origin text;
alter table public.cases add column if not exists hold_origin text;
alter table public.cases add column if not exists closing_reason text;
alter table public.cases drop constraint if exists cases_documents_origin;
alter table public.cases add constraint cases_documents_origin check(
 (documents_origin is null or documents_origin in ('screening','preparation_ready'))
 and ((documents_origin is not null)=(stage='awaiting_documents' or (stage='on_hold' and coalesce(hold_origin='awaiting_documents',false)))));
alter table public.cases drop constraint if exists cases_hold_origin;
alter table public.cases add constraint cases_hold_origin check(
 (hold_origin is null or hold_origin in ('awaiting_documents','review_approved'))
 and ((hold_origin is not null)=(stage='on_hold')));
alter table public.cases drop constraint if exists cases_closing_reason;
alter table public.cases add constraint cases_closing_reason check(
 closing_reason is null or (stage='closed' and closing_reason in ('out_of_scope','no_need_to_file','duplicate','dismissed','withdrawn','other')));

-- ---------------------------------------------------------------------------
-- 3. check_payload, verbatim from 035 with the REQUEST_DOCUMENTS_AT_INTAKE branch.
create or replace function vitally_private.check_payload(p_type text,p_payload jsonb) returns void
language plpgsql immutable security definer set search_path='' as $$
declare v_e record; -- 035
 v_d date; -- 035
 v_n record; -- 036
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
    or vitally_private.payload_keys(p_payload->'checks') not in (array['documents','in_scope','phone'], array['documents','identity','in_scope','phone']) -- 034
    or exists(select 1 from jsonb_each(p_payload->'checks') c where c.value<>'true'::jsonb) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'CLAIM_PREPARATION','REMIND','CLAIM_REVIEW','START_SCREENING' then -- 033
   if vitally_private.payload_keys(p_payload)<>array[]::text[] then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'REQUEST_DOCUMENT' then
   if vitally_private.payload_keys(p_payload)<>array['message','title']
    or not vitally_private.payload_text(p_payload,'title',120)
    or not vitally_private.payload_text(p_payload,'message',2000) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'REQUEST_DOCUMENTS_AT_INTAKE' then -- 036
   -- One to five requests, each with the same limits as a preparer's. -- 036
   if vitally_private.payload_keys(p_payload)<>array['requests'] -- 036
    or jsonb_typeof(p_payload->'requests')<>'array' -- 036
    or jsonb_array_length(p_payload->'requests') not between 1 and 5 then -- 036
    raise sqlstate 'VT007' using message='VALIDATION'; -- 036
   end if; -- 036
   for v_n in select e.value from jsonb_array_elements(p_payload->'requests') e loop -- 036
    if jsonb_typeof(v_n.value)<>'object' -- 036
     or vitally_private.payload_keys(v_n.value)<>array['message','title'] -- 036
     or not vitally_private.payload_text(v_n.value,'title',120) -- 036
     or not vitally_private.payload_text(v_n.value,'message',2000) then -- 036
     raise sqlstate 'VT007' using message='VALIDATION'; -- 036
    end if; -- 036
   end loop; -- 036
  when 'PUT_ON_HOLD' then -- 036
   -- An explicit confirmation and an optional staff note (1 to 1000 characters). -- 036
   if vitally_private.payload_keys(p_payload) not in (array['confirmed'], array['confirmed','note']) -- 036
    or p_payload->'confirmed'<>'true'::jsonb -- 036
    or (p_payload ? 'note' and not vitally_private.payload_text(p_payload,'note',1000)) then -- 036
    raise sqlstate 'VT007' using message='VALIDATION'; -- 036
   end if; -- 036
  when 'RESUME_FROM_HOLD' then -- 036
   if vitally_private.payload_keys(p_payload)<>array['confirmed'] -- 036
    or p_payload->'confirmed'<>'true'::jsonb then -- 036
    raise sqlstate 'VT007' using message='VALIDATION'; -- 036
   end if; -- 036
  when 'WITHDRAW' then -- 036
   if vitally_private.payload_keys(p_payload)<>array['confirmed'] -- 036
    or p_payload->'confirmed'<>'true'::jsonb then -- 036
    raise sqlstate 'VT007' using message='VALIDATION'; -- 036
   end if; -- 036
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
  when 'SUBMIT_REVIEW' then -- 033
   if vitally_private.payload_keys(p_payload)<>array['questionnaire'] -- 033
    or not coalesce(vitally_private.check_preparer_questionnaire(p_payload->'questionnaire'),false) then -- 033
    raise sqlstate 'VT007' using message='VALIDATION'; -- 033
   end if; -- 033
  when 'APPROVE_REVIEW' then -- 033
   if vitally_private.payload_keys(p_payload)<>array['questionnaire'] -- 033
    or not coalesce(vitally_private.check_reviewer_questionnaire(p_payload->'questionnaire'),false) then -- 033
    raise sqlstate 'VT007' using message='VALIDATION'; -- 033
   end if; -- 033
  when 'RESUBMIT_REVIEW' then
   if vitally_private.payload_keys(p_payload)<>array['questionnaire','resolution'] -- 033
    or not coalesce(vitally_private.check_preparer_questionnaire(p_payload->'questionnaire'),false) -- 033
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
   -- Closing is deliberate: one of six reasons, an optional staff note, and an explicit confirmation. -- 036
   if vitally_private.payload_keys(p_payload) not in (array['confirmed','reason'], array['confirmed','note','reason']) -- 036
    or p_payload->'confirmed'<>'true'::jsonb
    or jsonb_typeof(p_payload->'reason')<>'string' -- 036
    or (p_payload->>'reason') not in ('out_of_scope','no_need_to_file','duplicate','dismissed','withdrawn','other') -- 036
    or (p_payload ? 'note' and not vitally_private.payload_text(p_payload,'note',1000)) -- 036
    or (p_payload->>'reason'='other' and not p_payload ? 'note') then -- 036
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'MARK_READY_TO_EFILE','RETURN_TO_SIGNING' then -- 035
   if vitally_private.payload_keys(p_payload)<>array['confirmed'] -- 032
    or p_payload->'confirmed'<>'true'::jsonb then -- 032
    raise sqlstate 'VT007' using message='VALIDATION'; -- 032
   end if; -- 032
  when 'MARK_EFILED' then -- 035
   -- The case-dependent rules (which returns, which pairs) are the handler's.
   if vitally_private.payload_keys(p_payload)<>array['confirmed','methods'] -- 035
    or p_payload->'confirmed'<>'true'::jsonb -- 035
    or jsonb_typeof(p_payload->'methods')<>'object' -- 035
    or not (vitally_private.payload_keys(p_payload->'methods')<@array['federal','state']) -- 035
    or exists(select 1 from jsonb_each(p_payload->'methods') m where m.value not in ('"efile"'::jsonb,'"paper"'::jsonb)) then -- 035
    raise sqlstate 'VT007' using message='VALIDATION'; -- 035
   end if; -- 035
  when 'RECORD_FILING_RESULT' then -- 035
   -- The shape and the rules that need no case; whether a return is waiting, the
   -- method fit and the date window are the handler's.
   if vitally_private.payload_keys(p_payload) not in (array['confirmed','results'], array['confirmed','fixNote','results']) -- 035
    or p_payload->'confirmed'<>'true'::jsonb -- 035
    or jsonb_typeof(p_payload->'results')<>'object' then -- 035
    raise sqlstate 'VT007' using message='VALIDATION'; -- 035
   end if; -- 035
   if p_payload ? 'fixNote' and not vitally_private.payload_text(p_payload,'fixNote',1000) then -- 035
    raise sqlstate 'VT007' using message='VALIDATION'; -- 035
   end if; -- 035
   if cardinality(vitally_private.payload_keys(p_payload->'results'))=0 -- 035
    or not (vitally_private.payload_keys(p_payload->'results')<@array['federal','state']) then -- 035
    raise sqlstate 'VT007' using message='VALIDATION'; -- 035
   end if; -- 035
   for v_e in select r.key,r.value from jsonb_each(p_payload->'results') r loop -- 035
    if jsonb_typeof(v_e.value)<>'object' then -- 035
     raise sqlstate 'VT007' using message='VALIDATION'; -- 035
    end if; -- 035
    -- A rejection carries its code (1 to 40 characters, not blank); nothing else does. -- 035
    if vitally_private.payload_keys(v_e.value) not in (array['date','result'], array['code','date','result']) -- 035
     or coalesce(v_e.value->>'result','') not in ('accepted','rejected','mailed') -- 035
     or (v_e.value->>'result'='rejected')<>(v_e.value ? 'code') -- 035
     or (v_e.value ? 'code' and not vitally_private.payload_text(v_e.value,'code',40)) -- 035
     or jsonb_typeof(v_e.value->'date')<>'string' -- 035
     or (v_e.value->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then -- 035
     raise sqlstate 'VT007' using message='VALIDATION'; -- 035
    end if; -- 035
    begin -- 035
     v_d:=(v_e.value->>'date')::date; -- 035
    exception when others then -- 035
     raise sqlstate 'VT007' using message='VALIDATION'; -- 035
    end; -- 035
   end loop; -- 035
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. return_from_documents: when no request is left open or awaiting
-- verification, the case goes back to the stage the documents were asked from,
-- and both origins are cleared. Returns whether it moved the case.

create or replace function vitally_private.return_from_documents(p_case public.cases) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_origin text;
begin
 if exists(select 1 from public.document_requests r where r.workspace_id=p_case.workspace_id
   and r.case_id=p_case.id and r.status in ('open','awaiting_verification')) then
  return false;
 end if;
 select c.documents_origin into v_origin from public.cases c
  where c.id=p_case.id and c.documents_origin is not null
   and (c.stage='awaiting_documents' or (c.stage='on_hold' and c.hold_origin='awaiting_documents'));
 if v_origin is null then
  return false;
 end if;
 update public.cases set stage=v_origin,documents_origin=null,hold_origin=null where id=p_case.id;
 return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. act_request_documents_at_intake: an admin asks the client for one to five
-- documents. From Screening or Pending intake / filing the case moves to
-- Waiting for documents and remembers where it came from; at Waiting for
-- documents, or a Hold that came from it, the requests are added and the stage
-- stays. One event and one client line per move, naming every title in order.

create or replace function vitally_private.act_request_documents_at_intake(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item record;
 v_id uuid;
 v_ids uuid[]:=array[]::uuid[];
 v_titles text[]:=array[]::text[];
begin
 if not (p_case.stage in ('screening','preparation_ready','awaiting_documents')
   or (p_case.stage='on_hold' and p_case.hold_origin='awaiting_documents')) then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 for v_item in select e.value,e.ordinality from jsonb_array_elements(p_payload->'requests') with ordinality e order by e.ordinality loop
  insert into public.document_requests(workspace_id,case_id,title,message,requested_by_person_id)
  values(p_case.workspace_id,p_case.id,v_item.value->>'title',v_item.value->>'message',p_person.id)
  returning id into v_id;
  v_ids:=v_ids||v_id;
  v_titles:=v_titles||(v_item.value->>'title');
 end loop;
 if p_case.stage in ('screening','preparation_ready') then
  update public.cases set stage='awaiting_documents',documents_origin=p_case.stage where id=p_case.id;
 end if;
 return jsonb_build_object('detail',jsonb_build_object('requestIds',to_jsonb(v_ids)),
  'message','PCDC asked for these documents: '||array_to_string(v_titles,', ')||'.');
end;
$$;

-- ---------------------------------------------------------------------------
-- 5b. act_put_on_hold and act_resume_from_hold. A Hold records where it came
-- from (Waiting for documents or Review approved); documents_origin stays on a
-- documents Hold. Getting in touch returns the case to that stage. The optional
-- note is staff context: it goes in the event detail only, never the client line.

create or replace function vitally_private.act_put_on_hold(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_case.stage not in ('awaiting_documents','review_approved') then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 update public.cases set stage='on_hold',hold_origin=p_case.stage where id=p_case.id;
 return jsonb_build_object(
  'detail',case when p_payload ? 'note' then jsonb_build_object('note',p_payload->>'note') else '{}'::jsonb end,
  'message','PCDC is trying to reach you.');
end;
$$;

create or replace function vitally_private.act_resume_from_hold(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_case.stage<>'on_hold' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 update public.cases set stage=p_case.hold_origin,hold_origin=null where id=p_case.id;
 return jsonb_build_object('detail','{}'::jsonb,
  'message','PCDC is working on your application again.');
end;
$$;

-- ---------------------------------------------------------------------------
-- 5c. closed_line: the client's line for each closing reason. `other` keeps the
-- generic line that every close had before reasons existed. No line names the
-- other application of a duplicate or carries a staff note.

create or replace function vitally_private.closed_line(p_reason text) returns text
language sql immutable security definer set search_path='' as $$
 select case p_reason
  when 'out_of_scope' then 'This application was closed because the return is outside what VITA volunteers can prepare. Your return was not filed by PCDC.'
  when 'no_need_to_file' then 'A PCDC volunteer confirmed with you that you don''t need to file a return this year, so this application was closed.'
  when 'duplicate' then 'This application was closed. Your return continues under your other application with PCDC.'
  when 'dismissed' then 'PCDC could not reach you, so this application was closed. Your return was not filed.'
  when 'withdrawn' then 'You withdrew this application. Your return was not filed.'
  else 'Your application was closed by the office. This does not change any return filed elsewhere. Contact PCDC if you have questions.'
 end;
$$;

-- ---------------------------------------------------------------------------
-- 6. receive_document, verbatim from 004 with the stages where the office has
-- asked for documents.

create or replace function vitally_private.receive_document(p_case public.cases,p_payload jsonb,p_source text,p_user_id uuid,p_person_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request public.document_requests;
 v_document uuid;
begin
 if not (p_case.stage in ('preparing','corrections_required','awaiting_documents') -- 036
   or (p_case.stage='on_hold' and p_case.hold_origin='awaiting_documents')) then -- 036
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

-- ---------------------------------------------------------------------------
-- 7. act_verify_document, verbatim from 004. At Waiting for documents (and a
-- Hold that came from it) an admin verifies instead of the preparer, and the
-- last verified request returns the case. A handler returns one message, so the
-- extra client line is a second client_events row written here, in the same
-- transaction. commit_action writes the verify line with the transaction's
-- now(); clock_timestamp() is later, so the extra line follows it in the history.

create or replace function vitally_private.act_verify_document(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request public.document_requests;
 v_intake boolean:=p_case.stage='awaiting_documents' -- 036
  or (p_case.stage='on_hold' and p_case.hold_origin='awaiting_documents'); -- 036
begin
 if not (v_intake or p_case.stage in ('preparing','corrections_required')) then -- 036
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 if v_intake then -- 036
  if not ('admin'=any(p_person.capabilities)) then -- 036
   raise sqlstate 'VT001' using message='FORBIDDEN'; -- 036
  end if; -- 036
 else -- 036
  perform vitally_private.require_case_preparer(p_case,p_person);
 end if; -- 036
 select * into v_request from public.document_requests
  where workspace_id=p_case.workspace_id and case_id=p_case.id
   and id=vitally_private.payload_uuid(p_payload,'requestId') for update;
 -- Nothing to verify before a receipt, and nothing to verify twice.
 if v_request.status is distinct from 'awaiting_verification' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 update public.document_requests set status='verified',updated_at=now() where id=v_request.id;
 if v_intake and vitally_private.return_from_documents(p_case) then -- 036
  insert into public.client_events(workspace_id,case_id,action,message,created_at) -- 036
  values(p_case.workspace_id,p_case.id,'VERIFY_DOCUMENT','PCDC is working on your application again.',clock_timestamp()); -- 036
 end if; -- 036
 return jsonb_build_object('detail',jsonb_build_object('requestId',v_request.id),
  'message','A volunteer verified your document. No further action is needed for this request.');
end;
$$;

-- ---------------------------------------------------------------------------
-- 7a. close_case_steps: what every close does to the case row and its open work,
-- shared by act_close_case and act_withdraw. The stage rules and the client line
-- stay with the callers.

create or replace function vitally_private.close_case_steps(p_case public.cases,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.cases set stage='closed',closing_reason=p_reason,documents_origin=null,hold_origin=null where id=p_case.id;
 update public.document_requests set status='cancelled',updated_at=now()
  where workspace_id=p_case.workspace_id and case_id=p_case.id and status in ('open','awaiting_verification');
 update public.admin_followups set status='cancelled'
  where workspace_id=p_case.workspace_id and case_id=p_case.id and status='open';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7b. act_close_case, verbatim from 035 with Waiting for documents and Hold in
-- the closable stages, the reason stored and both origins cleared (the row and
-- cancellations are close_case_steps).

create or replace function vitally_private.act_close_case(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not (p_case.stage in ('received','screening','preparation_ready','preparing','review_ready','reviewing','corrections_required','rejected','awaiting_documents','on_hold') -- 036
   or (p_case.stage='draft' and p_case.owner_user_id is null)) then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 perform vitally_private.close_case_steps(p_case,p_payload->>'reason'); -- 036
 -- The reason and note are staff context: case_events is presenter-only, and the client
 -- message says plainly that an office decision, not a filing, has changed.
 return jsonb_build_object('detail',jsonb_build_object('reason',p_payload->>'reason') -- 036
   ||case when p_payload ? 'note' then jsonb_build_object('note',p_payload->>'note') else '{}'::jsonb end, -- 036
  'message',vitally_private.closed_line(p_payload->>'reason')); -- 036
end;
$$;

-- ---------------------------------------------------------------------------
-- 7c. The follow-up purpose (from 033) gains withdrawal_notice, which names no
-- request, like go_over_return.

alter table public.admin_followups drop constraint if exists admin_followups_purpose_check;
alter table public.admin_followups add constraint admin_followups_purpose_check check(purpose in ('request_documents','go_over_return','withdrawal_notice'));
alter table public.admin_followups drop constraint if exists admin_followups_purpose_request;
alter table public.admin_followups add constraint admin_followups_purpose_request check((purpose='request_documents')=(request_id is not null));

-- ---------------------------------------------------------------------------
-- 7d. act_withdraw: the applicant closes their own application (design D7). It
-- does what Close does with reason `withdrawn`. When a preparer or reviewer was
-- at work (Filing in progress, Corrections in progress, Review in progress) it
-- also opens a withdrawal_notice follow-up for the office to tell them to stop;
-- that row is inserted after the close cancels the open ones, so it stays open
-- on the Closed case. The assignee is the workspace's follow-up person, found as
-- act_escalate_contact (004) finds them. RESOLVE_FOLLOWUP needs no change: no
-- step of its path refuses a closed case.

create or replace function vitally_private.act_withdraw(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_assignee public.people;
begin
 if not (p_case.stage in ('received','screening','awaiting_documents','preparation_ready','preparing','corrections_required','review_ready','reviewing')
   or (p_case.stage='on_hold' and p_case.hold_origin='awaiting_documents')) then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 if p_case.stage in ('preparing','corrections_required','reviewing')
   and (p_case.preparer_id is not null or p_case.reviewer_id is not null) then
  select p.* into v_assignee from public.people p
   join public.workspaces w on w.id=p.workspace_id and w.default_followup_person_id=p.id
   where w.id=p_case.workspace_id;
  if not found or not ('followup'=any(v_assignee.capabilities)) then
   raise sqlstate 'VT007' using message='VALIDATION';
  end if;
 end if;
 perform vitally_private.close_case_steps(p_case,'withdrawn');
 if v_assignee.id is not null then
  insert into public.admin_followups(workspace_id,case_id,request_id,purpose,assignee_person_id,reason,created_by_person_id)
  values(p_case.workspace_id,p_case.id,null,'withdrawal_notice',v_assignee.id,'The client withdrew the application: tell the volunteer to stop work.',v_assignee.id);
 end if;
 return jsonb_build_object('detail','{}'::jsonb,
  'message','You withdrew your application. Your return was not filed.');
end;
$$;

-- ---------------------------------------------------------------------------
-- 7e. check_authority, verbatim from 018 with WITHDRAW beside RESPOND_DOCUMENT:
-- only the case's owner withdraws it.

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
  when 'RESPOND_DOCUMENT','WITHDRAW' then -- 036
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
   elsif not vitally_private.works_on_case(p_case,v_person) then
    -- Office staff on any case; a volunteer only as its preparer or reviewer.
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  else null;
 end case;
 return v_person;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. check_operation_authority, verbatim from 035 with REQUEST_DOCUMENTS_AT_INTAKE
-- in the admin-only group.
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

-- ---------------------------------------------------------------------------
-- 9. vitally_apply_action, verbatim from 035 with the dispatch line for
-- REQUEST_DOCUMENTS_AT_INTAKE; the grants end the file as they end 035.
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
-- The assistance entry point is unchanged by this migration; its privileges are
-- re-applied here because a replacement migration must leave both entry points
-- with exactly the grants the contract fixes for them.
revoke all on function public.vitally_assistance_action(uuid,uuid,bigint,uuid,text,text) from public,anon,authenticated;
grant execute on function public.vitally_assistance_action(uuid,uuid,bigint,uuid,text,text) to authenticated;

revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
