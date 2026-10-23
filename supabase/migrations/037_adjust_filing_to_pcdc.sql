-- 037: adjust filing to PCDC's answers (OpenSpec change adjust-filing-to-pcdc,
-- design D1-D4, D12).
--
--   * PCDC never mails a return. A return filed on paper is "given to the
--     client" at Mark e-filed: its result is `given_to_client` from that move on,
--     with no date, and the client is told to sign it and mail it themselves.
--   * All four federal/state method pairs are allowed (federal paper with state
--     e-file is no longer refused).
--   * The stored result value `mailed` is renamed `given_to_client`.
--   * A new RPC, and the sample fixtures, follow in later sections.
--
-- Nothing is hosted (D3, Task 10B): paper returns filed under 035 that are still
-- waiting for a result are left as they are (no result), and a sample reset
-- clears them. Only a stored `mailed` result is renamed, and its date dropped:
-- PCDC no longer records when a paper return was mailed.
--
-- Later sections redefine these shared functions. Each is copied verbatim from
-- its newest definition, with only the lines marked `-- 037` changed, as 036
-- does:
--
--   | Function                                   | Copied from               | What 037 changes |
--   |--------------------------------------------|---------------------------|------------------|
--   | vitally_private.check_payload              | 036                       | RECORD_FILING_RESULT accepts `accepted` and `rejected` only |
--   | vitally_private.filing_line                | 035                       | `given_to_client` replaces `mailed`, with the handover sentences |
--   | vitally_private.efiled_line                | 035                       | the first-filing lines for the four pairs and the second-filing lines tell the handover |
--   | vitally_private.act_mark_efiled            | 035                       | no pair is refused; a paper return gets result `given_to_client` and its row at once; Accepted when both returns are answered |
--   | vitally_private.act_record_filing_result   | 035                       | only an e-filed return takes a result; the stage rule counts `given_to_client` |
--   | vitally_private.act_mark_ready_to_efile    | 033                       | the client line no longer names Form 8879 |
--   | vitally_private.fixture_history            | 036                       | (a later section) |
--   | vitally_private.apply_fixture_scenario     | 036                       | (a later section) |
--
-- Written to be safe to apply again on a local test stack whose
-- schema_migrations row for this file was deleted during development: every
-- statement is `create or replace`, an idempotent `update`, or a drop-then-add.

-- ---------------------------------------------------------------------------
-- 1. The rename and the checks. 035's checks name `mailed` and refuse federal
-- paper with state e-file; both are dropped first so the rename can run, then
-- re-added. The rename is idempotent: a second run finds no `mailed` row.

-- 037 §1 begin
alter table public.cases drop constraint if exists cases_filing_results;
alter table public.filing_returns drop constraint if exists filing_returns_result_check;
update public.cases set federal_result='given_to_client' where federal_result='mailed';
update public.cases set state_result='given_to_client' where state_result='mailed';
update public.filing_returns set result='given_to_client',answered_on=null where result='mailed';
alter table public.cases drop constraint if exists cases_filing_methods;
alter table public.cases add constraint cases_filing_methods check(
 (federal_method is null or federal_method in ('efile','paper'))
 and (state_method is null or state_method in ('efile','paper'))
 and ((federal_method is null)=(state_method is null)));
alter table public.cases add constraint cases_filing_results check(
 (federal_result is null or (federal_result in ('accepted','rejected','given_to_client') and federal_method is not null and (federal_result='given_to_client')=(federal_method='paper')))
 and (state_result is null or (state_result in ('accepted','rejected','given_to_client') and state_method is not null and (state_result='given_to_client')=(state_method='paper'))));
alter table public.filing_returns add constraint filing_returns_result_check
 check(result is null or result in ('accepted','rejected','given_to_client'));
-- 037 §1 end

-- ---------------------------------------------------------------------------
-- 2. The sentences: filing_line and efiled_line, from 035.

create or replace function vitally_private.filing_line(p_federal text,p_state text) returns text
language sql immutable security definer set search_path='' as $$
 select case
  when p_federal is null and p_state is null then null
  when p_federal=p_state then case p_federal
   when 'waiting' then 'Your federal and Pennsylvania returns were e-filed. The IRS and Pennsylvania will each confirm whether they are accepted.'
   when 'accepted' then 'The IRS and Pennsylvania accepted your returns.'
   when 'rejected' then 'Your federal and Pennsylvania returns need a correction before they can be accepted.'
   when 'given_to_client' then 'PCDC gave your federal and Pennsylvania returns on paper to you or the person you sent. If they aren''t signed yet, sign them, then mail them yourself. A reply can take about 3 months after you mail them.' -- 037
  end
  else concat_ws(' ',
   case p_federal
    when 'waiting' then 'Your federal return was e-filed. The IRS will confirm whether it is accepted.'
    when 'accepted' then 'The IRS accepted your federal return.'
    when 'rejected' then 'Your federal return needs a correction before it can be accepted.'
    when 'given_to_client' then 'PCDC gave your federal return on paper to you or the person you sent. If it isn''t signed yet, sign it, then mail it yourself. A reply can take about 3 months after you mail it.' -- 037
   end,
   case p_state
    when 'waiting' then 'Your Pennsylvania return was e-filed. Pennsylvania will confirm whether it is accepted.'
    when 'accepted' then 'Pennsylvania accepted your Pennsylvania return.'
    when 'rejected' then 'Your Pennsylvania return needs a correction before it can be accepted.'
    when 'given_to_client' then 'PCDC gave your Pennsylvania return on paper to you or the person you sent. If it isn''t signed yet, sign it, then mail it yourself. A reply can take about 3 months after you mail it.' -- 037
   end)
 end;
$$;
revoke all on function vitally_private.filing_line(text,text) from public,anon,authenticated,service_role;

create or replace function vitally_private.efiled_line(p_federal_method text,p_state_method text,p_second boolean) returns text
language sql immutable security definer set search_path='' as $$
 select case
  when p_federal_method is null and p_state_method is null then null
  when p_second and p_state_method is null then
   case p_federal_method when 'efile' then 'PCDC e-filed your federal return.' else 'PCDC gave your federal return on paper to you or the person you sent. If it isn''t signed yet, sign it, then mail it yourself. A reply can take about 3 months after you mail it.' end -- 037
  when p_second and p_federal_method is null then
   case p_state_method when 'efile' then 'PCDC e-filed your Pennsylvania return.' else 'PCDC gave your Pennsylvania return on paper to you or the person you sent. If it isn''t signed yet, sign it, then mail it yourself. A reply can take about 3 months after you mail it.' end -- 037
  when p_federal_method='efile' and p_state_method='efile' then 'PCDC e-filed your return.'
  when p_federal_method='efile' and p_state_method='paper' then 'PCDC e-filed your federal return and gave your Pennsylvania return on paper to you or the person you sent. If it isn''t signed yet, sign it, then mail it yourself. A reply can take about 3 months after you mail it.' -- 037
  when p_federal_method='paper' and p_state_method='efile' then 'PCDC gave your federal return on paper to you or the person you sent, and e-filed your Pennsylvania return. If the federal return isn''t signed yet, sign it, then mail it yourself. A reply can take about 3 months after you mail it.' -- 037
  when p_federal_method='paper' and p_state_method='paper' then 'PCDC gave your returns on paper to you or the person you sent. If they aren''t signed yet, sign them, then mail them yourself. A reply can take about 3 months after you mail them.' -- 037
 end;
$$;
revoke all on function vitally_private.efiled_line(text,text,boolean) from public,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 3. act_mark_efiled, verbatim from 035 without the pair refusals. A return filed
-- on paper in this move is given to the client at once: its result is
-- given_to_client, with no date, and the case is Accepted when both returns are
-- answered.

create or replace function vitally_private.act_mark_efiled(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_federal text; v_state text; -- 035
 v_rejected text[]; -- 035
 v_attempt int; -- 035
begin
 if p_case.stage<>'ready_to_efile' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 v_federal:=p_payload->'methods'->>'federal'; -- 035
 v_state:=p_payload->'methods'->>'state'; -- 035
 -- 035: a case that already has methods is back from Return to signing: a second
 -- filing names exactly the rejected returns; the others keep their method and
 -- answer.
 if p_case.federal_method is not null or p_case.state_method is not null then -- 035
  v_rejected:=array(select x.k from (values ('federal',p_case.federal_result),('state',p_case.state_result)) x(k,r) where x.r='rejected' order by x.k); -- 035
  if cardinality(v_rejected)=0 or vitally_private.payload_keys(p_payload->'methods')<>v_rejected then -- 035
   raise sqlstate 'VT007' using message='VALIDATION'; -- 035
  end if; -- 035
  select max(a.attempt)+1 into v_attempt from public.filing_attempts a where a.case_id=p_case.id; -- 035
  update public.cases set stage='efiled', -- 035
   federal_method=coalesce(v_federal,federal_method),state_method=coalesce(v_state,state_method), -- 035
   federal_result=case when v_federal is not null then case when v_federal='paper' then 'given_to_client' end else federal_result end, -- 037
   state_result=case when v_state is not null then case when v_state='paper' then 'given_to_client' end else state_result end -- 037
   where id=p_case.id; -- 035
  insert into public.filing_attempts(workspace_id,case_id,attempt,filed_by) values(p_case.workspace_id,p_case.id,v_attempt,p_person.id); -- 035
  if v_federal is not null then -- 035
   insert into public.filing_returns(workspace_id,case_id,attempt,return_kind,method,result,recorded_by) values(p_case.workspace_id,p_case.id,v_attempt,'federal',v_federal,case when v_federal='paper' then 'given_to_client' end,case when v_federal='paper' then p_person.id end); -- 037
  end if; -- 035
  if v_state is not null then -- 035
   insert into public.filing_returns(workspace_id,case_id,attempt,return_kind,method,result,recorded_by) values(p_case.workspace_id,p_case.id,v_attempt,'state',v_state,case when v_state='paper' then 'given_to_client' end,case when v_state='paper' then p_person.id end); -- 037
  end if; -- 035
  -- 037: Accepted when both returns are answered (a paper return is answered by the handover).
  update public.cases set stage=case when federal_result in ('accepted','given_to_client') and state_result in ('accepted','given_to_client') then 'accepted' else 'efiled' end where id=p_case.id; -- 037
  return jsonb_build_object('detail',jsonb_build_object('attempt',v_attempt,'methods',p_payload->'methods'), -- 035
   'message',vitally_private.efiled_line(v_federal,v_state,true)); -- 035
 end if; -- 035
 -- 037: a first filing names both returns, in any of the four pairs.
 if v_federal is null or v_state is null then -- 037
  raise sqlstate 'VT007' using message='VALIDATION'; -- 035
 end if; -- 035
 update public.cases set stage=case when v_federal='paper' and v_state='paper' then 'accepted' else 'efiled' end,federal_method=v_federal,state_method=v_state, -- 037
  federal_result=case when v_federal='paper' then 'given_to_client' end,state_result=case when v_state='paper' then 'given_to_client' end where id=p_case.id; -- 037
 insert into public.filing_attempts(workspace_id,case_id,attempt,filed_by) values(p_case.workspace_id,p_case.id,1,p_person.id); -- 035
 insert into public.filing_returns(workspace_id,case_id,attempt,return_kind,method,result,recorded_by) -- 037
  values(p_case.workspace_id,p_case.id,1,'federal',v_federal,case when v_federal='paper' then 'given_to_client' end,case when v_federal='paper' then p_person.id end), -- 037
   (p_case.workspace_id,p_case.id,1,'state',v_state,case when v_state='paper' then 'given_to_client' end,case when v_state='paper' then p_person.id end); -- 037
 return jsonb_build_object('detail',jsonb_build_object('attempt',1,'methods',jsonb_build_object('federal',v_federal,'state',v_state)), -- 035
  'message',vitally_private.efiled_line(v_federal,v_state,false)); -- 035
end; $$;

-- ---------------------------------------------------------------------------
-- 4. check_payload, verbatim from 036 with RECORD_FILING_RESULT taking accepted
-- and rejected only.

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
     or coalesce(v_e.value->>'result','') not in ('accepted','rejected') -- 037
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
-- 5. act_record_filing_result, verbatim from 035: only an e-filed return takes a
-- result, and given_to_client counts as answered.

create or replace function vitally_private.act_record_filing_result(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_today date:=(now() at time zone 'America/New_York')::date;
 v_fm text:=p_case.federal_method;
 v_sm text:=p_case.state_method;
 v_attempt int;
 v_filed date;
 v_filed_at timestamptz;
 v_filed_by uuid;
 v_kind text;
 v_in jsonb;
 v_row public.filing_returns;
 v_date date;
 v_code text;
 v_federal text;
 v_state text;
 v_stage text;
 v_note boolean:=false;
 v_results jsonb:='{}'::jsonb;
begin
 -- Allowed at E-filed, or at Rejected while a return still waits for its answer.
 if p_case.stage not in ('efiled','rejected')
  or (p_case.stage='rejected' and not ((p_case.federal_method is not null and p_case.federal_result is null)
   or (p_case.state_method is not null and p_case.state_result is null))) then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 -- A case e-filed before 035 has no methods and no filing rows: both returns
 -- were e-filed, in one filing that happened when it was marked E-filed.
 if v_fm is null then
  select e.created_at,e.actor_person_id into v_filed_at,v_filed_by
   from public.case_events e where e.case_id=p_case.id and e.action='MARK_EFILED'
   order by e.created_at desc limit 1; -- 035
  v_filed_at:=coalesce(v_filed_at,p_case.updated_at);
  v_filed_by:=coalesce(v_filed_by,p_person.id);
  update public.cases set federal_method='efile',state_method='efile' where id=p_case.id;
  insert into public.filing_attempts(workspace_id,case_id,attempt,filed_at,filed_by) values(p_case.workspace_id,p_case.id,1,v_filed_at,v_filed_by);
  insert into public.filing_returns(workspace_id,case_id,attempt,return_kind,method)
   values(p_case.workspace_id,p_case.id,1,'federal','efile'),(p_case.workspace_id,p_case.id,1,'state','efile');
 end if;
 select a.attempt,(a.filed_at at time zone 'America/New_York')::date into v_attempt,v_filed
  from public.filing_attempts a where a.case_id=p_case.id order by a.attempt desc limit 1;
 foreach v_kind in array array['federal','state'] loop
  v_in:=p_payload->'results'->v_kind;
  continue when v_in is null;
  select * into v_row from public.filing_returns r where r.case_id=p_case.id and r.attempt=v_attempt and r.return_kind=v_kind for update;
  -- The return must still be waiting, and the result must fit how it was filed.
  if not found or v_row.result is not null
   or v_row.method<>'efile' then -- 037
   raise sqlstate 'VT007' using message='VALIDATION';
  end if;
  v_date:=(v_in->>'date')::date;
  if v_date>v_today or v_date<v_filed then
   raise sqlstate 'VT007' using message='VALIDATION';
  end if;
  v_code:=btrim(v_in->>'code');
  update public.filing_returns set result=v_in->>'result',answered_on=v_date,reject_code=v_code,recorded_by=p_person.id where id=v_row.id;
  if v_kind='federal' then
   update public.cases set federal_result=v_in->>'result' where id=p_case.id;
  else
   update public.cases set state_result=v_in->>'result' where id=p_case.id;
  end if;
  v_results:=v_results||jsonb_build_object(v_kind,v_in->>'result');
 end loop;
 select c.federal_result,c.state_result into v_federal,v_state from public.cases c where c.id=p_case.id;
 v_stage:=case
  when 'rejected' in (v_federal,v_state) then 'rejected'
  when v_federal in ('accepted','given_to_client') and v_state in ('accepted','given_to_client') then 'accepted' -- 037
  else p_case.stage
 end;
 -- A fix note says what the office fixed: only when the case is, or becomes, Rejected.
 if p_payload ? 'fixNote' then
  if p_case.stage<>'rejected' and v_stage<>'rejected' then
   raise sqlstate 'VT007' using message='VALIDATION';
  end if;
  insert into public.filing_notes(workspace_id,case_id,attempt,note,recorded_by)
   values(p_case.workspace_id,p_case.id,v_attempt,btrim(p_payload->>'fixNote'),p_person.id);
  v_note:=true;
 end if;
 update public.cases set stage=v_stage where id=p_case.id;
 return jsonb_build_object('detail',jsonb_build_object('attempt',v_attempt,'results',v_results,'noteAdded',v_note),
  'message',vitally_private.filing_line(v_results->>'federal',v_results->>'state'));
end; $$;

-- ---------------------------------------------------------------------------
-- 6. act_mark_ready_to_efile, verbatim from 033 with the client line no longer
-- naming Form 8879.

create or replace function vitally_private.act_mark_ready_to_efile(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_status text;
begin
 if p_case.stage<>'review_approved' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 select client_contact_status into v_status from public.reviews
  where workspace_id=p_case.workspace_id and case_id=p_case.id and status='approved'
  order by created_at desc limit 1;
 if v_status is distinct from 'completed' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 if exists(select 1 from public.admin_followups -- 033
   where workspace_id=p_case.workspace_id and case_id=p_case.id -- 033
    and purpose='go_over_return' and status='open') then -- 033
  raise sqlstate 'VT004' using message='INVALID_TRANSITION'; -- 033
 end if; -- 033
 update public.cases set stage='ready_to_efile' where id=p_case.id;
 return jsonb_build_object('detail','{}'::jsonb,
  'message','PCDC recorded that your return is ready. PCDC will take the next step.'); -- 037
end; $$;
