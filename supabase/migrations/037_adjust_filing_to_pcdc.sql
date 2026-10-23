-- 037: adjust filing to PCDC's answers (OpenSpec change adjust-filing-to-pcdc,
-- design D1-D4, D12).
--
--   * PCDC never mails a return. A return filed on paper is "given to the
--     client" at Mark e-filed: its result is `given_to_client` from that move on,
--     with no date, and the client is told to sign it and mail it themselves.
--   * All four federal/state method pairs are allowed (federal paper with state
--     e-file is no longer refused).
--   * The stored result value `mailed` is renamed `given_to_client`.
--   * A new RPC, public.vitally_close_unsigned (new function, no earlier
--     definition), closes the listed signing cases at season end (section 7);
--     the sample fixtures follow in section 8.
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
--   | vitally_private.fixture_history            | 036                       | the two filed samples' Mark ready to e-file line is the one act_mark_ready_to_efile writes now |
--   | vitally_private.apply_fixture_scenario     | 036                       | the `rejected` sample's fix note is the site coordinator's |
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

-- ---------------------------------------------------------------------------
-- 7. The season-end close (design D9). One admin RPC closes, all or nothing, the
-- listed cases that are at Ready to exit or on a Hold from Ready to exit, with
-- reason `dismissed`. Each case gets one CLOSE_CASE event and one client line
-- (closed_line), and no withdrawal_notice follow-up. Any raise rolls back the
-- whole statement, receipt included, so a stale or ineligible case changes
-- nothing; the caller's dialog reopens without that case.

create or replace function public.vitally_close_unsigned(p_action_id uuid,p_person_id uuid,p_cases jsonb,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.memberships;
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
 -- Admin only: a null person and a person without `admin` are FORBIDDEN.
 perform vitally_private.check_operation_authority(v_member,p_person_id,'CLOSE_CASE');
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
  'personId',p_person_id)::text,'sha256'),'hex');
 v_receipt=vitally_private.reserve_receipt(v_member,p_action_id,'CLOSE_UNSIGNED',v_digest,p_person_id);
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
  values(v_case.workspace_id,v_case.id,v_member.user_id,p_person_id,'CLOSE_CASE',
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

-- ---------------------------------------------------------------------------
-- 8. The samples. fixture_history and apply_fixture_scenario, verbatim from 036
-- except the lines marked -- 037, then the closing revoke as 036 ends.

-- fixture_history, verbatim from 035 with the two new samples' histories. Their
-- client lines are the strings the real moves write: the documents line and the
-- Hold line (act_request_documents_at_intake, act_put_on_hold) and the withdrawal
-- line (act_withdraw). None carries a phone number or a note.
create or replace function vitally_private.fixture_history(p_key text)
returns table(seq int,action text,person_key text,detail jsonb,message text)
language sql immutable security definer set search_path='' as $$
 select v.seq,v.action,v.person_key,v.detail,v.message from (values
  ('preparation_ready',1,'SUBMIT',null::text,'{"simulated":true}'::jsonb,'Application received. A volunteer will check your information and documents.'::text),
  ('preparation_ready',2,'VERIFY_INTAKE','sam','{"checks":{"phone":true,"documents":true,"in_scope":true}}'::jsonb,'PCDC finished screening your application. A volunteer will start preparing your return next.'),

  ('waiting_documents',1,'SUBMIT',null,'{"simulated":true}','Application received. A volunteer will check your information and documents.'),
  ('waiting_documents',2,'VERIFY_INTAKE','sam','{"checks":{"phone":true,"documents":true,"in_scope":true}}','PCDC finished screening your application. A volunteer will start preparing your return next.'),
  ('waiting_documents',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('waiting_documents',4,'REQUEST_DOCUMENT','alex','{"simulated":true,"title":"Mileage record"}','A volunteer requested a document: Mileage record'),

  ('admin_followup',1,'SUBMIT',null,'{"simulated":true}','Application received. A volunteer will check your information and documents.'),
  ('admin_followup',2,'VERIFY_INTAKE','sam','{"checks":{"phone":true,"documents":true,"in_scope":true}}','PCDC finished screening your application. A volunteer will start preparing your return next.'),
  ('admin_followup',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('admin_followup',4,'REQUEST_DOCUMENT','alex','{"simulated":true,"title":"Mileage record"}','A volunteer requested a document: Mileage record'),
  ('admin_followup',5,'ESCALATE_CONTACT','alex','{"simulated":true}',null),
  ('admin_followup',6,'RECORD_CONTACT','sam','{"simulated":true,"outcome":"no_answer"}',null),

  ('review_ready',1,'SUBMIT',null,'{"simulated":true}','Application received. A volunteer will check your information and documents.'),
  ('review_ready',2,'VERIFY_INTAKE','sam','{"checks":{"phone":true,"documents":true,"in_scope":true,"identity":true}}','PCDC finished screening your application. A volunteer will start preparing your return next.'),
  ('review_ready',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('review_ready',4,'REQUEST_DOCUMENT','alex','{"simulated":true,"title":"Mileage record"}','A volunteer requested a document: Mileage record'),
  ('review_ready',5,'RECORD_DOCUMENT_RESPONSE','sam','{"simulated":true,"source":"staff_recorded"}','A sample document was recorded by staff and is awaiting verification.'),
  ('review_ready',6,'VERIFY_DOCUMENT','alex','{"simulated":true}','A volunteer verified your document. No further action is needed for this request.'),
  ('review_ready',7,'SUBMIT_REVIEW','alex','{"simulated":true,"preparationVersion":1}','Your volunteer recorded that preparation is complete in the tax software. An independent reviewer will check it next.'),

  ('corrections_required',1,'SUBMIT',null,'{"simulated":true}','Application received. A volunteer will check your information and documents.'),
  ('corrections_required',2,'VERIFY_INTAKE','sam','{"checks":{"phone":true,"documents":true,"in_scope":true}}','PCDC finished screening your application. A volunteer will start preparing your return next.'),
  ('corrections_required',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('corrections_required',4,'SUBMIT_REVIEW','alex','{"simulated":true,"preparationVersion":1}','Your volunteer recorded that preparation is complete in the tax software. An independent reviewer will check it next.'),
  ('corrections_required',5,'CLAIM_REVIEW','morgan','{"simulated":true}','An independent reviewer is checking your return.'),
  ('corrections_required',6,'REQUEST_CORRECTIONS','morgan','{"simulated":true,"preparationVersion":1}','The reviewer asked your preparer to make corrections. No action is needed from you right now.'),

  ('review_approved',1,'SUBMIT',null,'{"simulated":true}','Application received. A volunteer will check your information and documents.'),
  ('review_approved',2,'VERIFY_INTAKE','sam','{"checks":{"phone":true,"documents":true,"in_scope":true}}','PCDC finished screening your application. A volunteer will start preparing your return next.'),
  ('review_approved',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('review_approved',4,'SUBMIT_REVIEW','alex','{"simulated":true,"preparationVersion":1}','Your volunteer recorded that preparation is complete in the tax software. An independent reviewer will check it next.'),
  ('review_approved',5,'CLAIM_REVIEW','morgan','{"simulated":true}','An independent reviewer is checking your return.'),
  ('review_approved',6,'REQUEST_CORRECTIONS','morgan','{"simulated":true,"preparationVersion":1}','The reviewer asked your preparer to make corrections. No action is needed from you right now.'),
  ('review_approved',7,'RESUBMIT_REVIEW','alex','{"simulated":true,"preparationVersion":2}','Your volunteer recorded the requested corrections in the tax software. An independent reviewer will check the updated return.'),
  ('review_approved',8,'CLAIM_REVIEW','morgan','{"simulated":true}','An independent reviewer is checking your return.'),
  ('review_approved',9,'APPROVE_REVIEW','morgan','{"simulated":true,"preparationVersion":2}','Your return has been checked by the reviewer. A volunteer will contact you soon to sign and file.'),

  ('rejected',1,'SUBMIT',null,'{"simulated":true}','Application received. A volunteer will check your information and documents.'),
  ('rejected',2,'VERIFY_INTAKE','sam','{"checks":{"phone":true,"documents":true,"in_scope":true}}','PCDC finished screening your application. A volunteer will start preparing your return next.'),
  ('rejected',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('rejected',4,'SUBMIT_REVIEW','alex','{"simulated":true,"preparationVersion":1}','Your volunteer recorded that preparation is complete in the tax software. An independent reviewer will check it next.'),
  ('rejected',5,'CLAIM_REVIEW','morgan','{"simulated":true}','An independent reviewer is checking your return.'),
  ('rejected',6,'REQUEST_CORRECTIONS','morgan','{"simulated":true,"preparationVersion":1}','The reviewer asked your preparer to make corrections. No action is needed from you right now.'),
  ('rejected',7,'RESUBMIT_REVIEW','alex','{"simulated":true,"preparationVersion":2}','Your volunteer recorded the requested corrections in the tax software. An independent reviewer will check the updated return.'),
  ('rejected',8,'CLAIM_REVIEW','morgan','{"simulated":true}','An independent reviewer is checking your return.'),
  ('rejected',9,'APPROVE_REVIEW','morgan','{"simulated":true,"preparationVersion":2}','Your return has been checked by the reviewer. A volunteer will contact you soon to sign and file.'),
  ('rejected',10,'MARK_READY_TO_EFILE','sam','{"simulated":true}','PCDC recorded that your return is ready. PCDC will take the next step.'), -- 037
  ('rejected',11,'MARK_EFILED','sam','{"simulated":true,"attempt":1,"methods":{"federal":"efile","state":"efile"}}',vitally_private.efiled_line('efile','efile',false)),
  ('rejected',12,'RECORD_FILING_RESULT','sam','{"simulated":true,"attempt":1,"results":{"federal":"accepted","state":"rejected"},"noteAdded":true}',vitally_private.filing_line('accepted','rejected')),

  ('accepted',1,'SUBMIT',null,'{"simulated":true}','Application received. A volunteer will check your information and documents.'),
  ('accepted',2,'VERIFY_INTAKE','sam','{"checks":{"phone":true,"documents":true,"in_scope":true}}','PCDC finished screening your application. A volunteer will start preparing your return next.'),
  ('accepted',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('accepted',4,'SUBMIT_REVIEW','alex','{"simulated":true,"preparationVersion":1}','Your volunteer recorded that preparation is complete in the tax software. An independent reviewer will check it next.'),
  ('accepted',5,'CLAIM_REVIEW','morgan','{"simulated":true}','An independent reviewer is checking your return.'),
  ('accepted',6,'REQUEST_CORRECTIONS','morgan','{"simulated":true,"preparationVersion":1}','The reviewer asked your preparer to make corrections. No action is needed from you right now.'),
  ('accepted',7,'RESUBMIT_REVIEW','alex','{"simulated":true,"preparationVersion":2}','Your volunteer recorded the requested corrections in the tax software. An independent reviewer will check the updated return.'),
  ('accepted',8,'CLAIM_REVIEW','morgan','{"simulated":true}','An independent reviewer is checking your return.'),
  ('accepted',9,'APPROVE_REVIEW','morgan','{"simulated":true,"preparationVersion":2}','Your return has been checked by the reviewer. A volunteer will contact you soon to sign and file.'),
  ('accepted',10,'MARK_READY_TO_EFILE','sam','{"simulated":true}','PCDC recorded that your return is ready. PCDC will take the next step.'), -- 037
  ('accepted',11,'MARK_EFILED','sam','{"simulated":true,"attempt":1,"methods":{"federal":"efile","state":"efile"}}',vitally_private.efiled_line('efile','efile',false)),
  ('accepted',12,'RECORD_FILING_RESULT','sam','{"simulated":true,"attempt":1,"results":{"federal":"accepted","state":"accepted"},"noteAdded":false}',vitally_private.filing_line('accepted','accepted')),

  ('on_hold',1,'SUBMIT',null,'{"simulated":true}','Application received. A volunteer will check your information and documents.'), -- 036
  ('on_hold',2,'REQUEST_DOCUMENTS_AT_INTAKE','sam','{"simulated":true}','PCDC asked for these documents: Photo ID.'), -- 036
  ('on_hold',3,'PUT_ON_HOLD','sam','{"simulated":true}','PCDC is trying to reach you.'), -- 036

  ('withdrawn',1,'SUBMIT',null,'{"simulated":true}','Application received. A volunteer will check your information and documents.'), -- 036
  ('withdrawn',2,'VERIFY_INTAKE','sam','{"checks":{"phone":true,"documents":true,"in_scope":true}}','PCDC finished screening your application. A volunteer will start preparing your return next.'), -- 036
  ('withdrawn',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'), -- 036
  ('withdrawn',4,'WITHDRAW',null,'{"simulated":true}','You withdrew your application. Your return was not filed.') -- 036
 ) as v(key,seq,action,person_key,detail,message)
 where v.key=p_key
 order by v.seq
$$;

-- apply_fixture_scenario, verbatim from 035 with the two new samples. `on_hold`
-- is asked for a Photo ID from Screening and then put on Hold (the request is
-- open, the case remembers both origins, no preparer). `withdrawn` was at
-- Filing in progress with its preparer when the client withdrew, so it is Closed
-- with the reason `withdrawn` and the office's open withdrawal_notice follow-up
-- (no request), assigned to the workspace's follow-up person as act_withdraw
-- assigns it. A reload deletes the document requests and follow-ups with the
-- other rows, and the new origin and reason columns are rewritten with the stage.
create or replace function vitally_private.apply_fixture_scenario(p_case public.cases,p_scenario text,p_actor uuid)
returns int language plpgsql security definer set search_path='' as $$
declare v_alex uuid;
 v_morgan uuid;
 v_sam uuid;
 v_request uuid;
 v_followup uuid;
 v_contact uuid;
 v_total int;
 v_stage text;
 v_version bigint=0;
 v_preparer uuid;
 v_reviewer uuid;
 v_review uuid;
 v_signed boolean=p_scenario in ('review_approved','rejected','accepted');
 v_filed boolean=p_scenario in ('rejected','accepted');
 v_assignee uuid; -- 036
begin
 if p_scenario is null or not (p_scenario=any(vitally_private.fixture_keys())) then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 select id into v_alex from public.people where workspace_id=p_case.workspace_id and person_key='alex';
 select id into v_morgan from public.people where workspace_id=p_case.workspace_id and person_key='morgan';
 select id into v_sam from public.people where workspace_id=p_case.workspace_id and person_key='sam';
 -- The permanent people are the shared initializer's; a workspace without them
 -- is not set up, and seeding half a scenario would be worse than refusing.
 if v_alex is null or v_morgan is null or v_sam is null or p_actor is null then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 -- Everything this case currently holds, and only this case. Receipts are not
 -- in the list: they are historical scalars and outlive their targets.
 perform set_config('vitally.clearing_case',p_case.id::text,true);
 delete from public.filing_attempts where workspace_id=p_case.workspace_id and case_id=p_case.id;
 perform set_config('vitally.clearing_case','',true);
 delete from public.contact_attempts where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.contact_log where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.admin_followups where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.documents where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.document_requests where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.preparation_participants where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.reviewer_questionnaires where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.preparer_questionnaires where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.reviews where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.case_events where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.client_events where workspace_id=p_case.workspace_id and case_id=p_case.id;
 -- A sample's materials and document-card marks are office work on the sample,
 -- so a checkpoint clears them with the rest. `case_contacts` stays: it is the
 -- sample's own contact details, not scenario work.
 delete from public.case_materials where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.case_document_cards where workspace_id=p_case.workspace_id and case_id=p_case.id;

 -- Preparation has been claimed in every scenario but the first and the Hold,
 -- and claiming is the participation threshold (contracts, "Authority and participation").
 if p_scenario not in ('preparation_ready','on_hold') then -- 036
  v_preparer=v_alex;
  insert into public.preparation_participants(workspace_id,case_id,person_id)
  values(p_case.workspace_id,p_case.id,v_alex);
 end if;

 -- One open request in the two document scenarios; a verified one, with the
 -- office's recorded receipt of the client's paper, in the review scenarios.
 -- The Hold has the office's open request for a Photo ID.
 if p_scenario in ('waiting_documents','admin_followup') then
  insert into public.document_requests(workspace_id,case_id,title,message,status,requested_by_person_id)
  values(p_case.workspace_id,p_case.id,'Mileage record','Please add the fictional sample.','open',v_alex)
  returning id into v_request;
 elsif p_scenario='on_hold' then -- 036
  insert into public.document_requests(workspace_id,case_id,title,message,status,requested_by_person_id) -- 036
  values(p_case.workspace_id,p_case.id,'Photo ID','Please add the fictional sample.','open',v_sam) -- 036
  returning id into v_request; -- 036
 elsif p_scenario='review_ready' then
  insert into public.document_requests(workspace_id,case_id,title,message,status,requested_by_person_id)
  values(p_case.workspace_id,p_case.id,'Mileage record','Please add the fictional sample.','verified',v_alex)
  returning id into v_request;
  -- Recorded by the office rather than uploaded: a fixture case has no client
  -- session behind it, and the staff receipt is the path that exists for that.
  insert into public.documents(workspace_id,case_id,request_id,filename,source,submitted_by_user_id,submitted_by_person_id)
  values(p_case.workspace_id,p_case.id,v_request,'demo-mileage-record-2025.pdf','staff_recorded',p_actor,v_sam);
 end if;

 -- The office's contact task, with one unanswered call already logged on it.
 -- Logging a contact never resolves the task, so it is still open.
 if p_scenario='admin_followup' then
  insert into public.admin_followups(workspace_id,case_id,request_id,assignee_person_id,status,reason,created_by_person_id)
  values(p_case.workspace_id,p_case.id,v_request,v_sam,'open','No response to the document request.',v_alex)
  returning id into v_followup;
  insert into public.contact_log(workspace_id,case_id,followup_id,logged_by_user_id,logged_by_person_id,
    direction,contacted_at,with_whom,other_name,method,purpose,outcome,note)
  values(p_case.workspace_id,p_case.id,v_followup,p_actor,v_sam,
    'outgoing',now(),'client',null,'phone','request_documents','no_answer',
    'Called during office hours. No answer, so a message was left.')
  returning id into v_contact;
  insert into public.contact_log_versions(contact_id,version,workspace_id,case_id,edited_by_user_id,edited_by_person_id,created_at,
    direction,contacted_at,with_whom,other_name,method,purpose,outcome,note)
  select l.id,1,l.workspace_id,l.case_id,l.logged_by_user_id,l.logged_by_person_id,l.logged_at,
    l.direction,l.contacted_at,l.with_whom,l.other_name,l.method,l.purpose,l.outcome,l.note
  from public.contact_log l where l.id=v_contact;
 end if;

 -- The office's note to tell the volunteer to stop, left open on the Closed case.
 if p_scenario='withdrawn' then -- 036
  select w.default_followup_person_id into v_assignee from public.workspaces w where w.id=p_case.workspace_id; -- 036
  insert into public.admin_followups(workspace_id,case_id,request_id,purpose,assignee_person_id,status,reason,created_by_person_id) -- 036
  values(p_case.workspace_id,p_case.id,null,'withdrawal_notice',coalesce(v_assignee,v_sam),'open', -- 036
   'The client withdrew the application: tell the volunteer to stop work.',coalesce(v_assignee,v_sam)); -- 036
 end if; -- 036

 -- Review attempts. Findings and resolutions are internal staff text and live
 -- only here; no client-readable row carries a word of them.
 if p_scenario='corrections_required' then
  insert into public.reviews(workspace_id,case_id,preparation_version,reviewer_person_id,status,findings,decided_at,created_at)
  values(p_case.workspace_id,p_case.id,1,v_morgan,'corrections_requested',
   'Check the household size against the intake answers, and confirm the filing status before this comes back.',
   now()-interval '2 hours',now()-interval '4 hours');
 elsif v_signed then
  insert into public.reviews(workspace_id,case_id,preparation_version,reviewer_person_id,status,findings,resolution,decided_at,created_at)
  values(p_case.workspace_id,p_case.id,1,v_morgan,'corrections_requested',
   'Check the household size against the intake answers, and confirm the filing status before this comes back.',
   'Corrected the household size and re-checked the filing status in the tax software.',
   now()-interval '6 hours',now()-interval '8 hours');
  -- Approved, with the client conversation the approval opens already done:
  -- the reviewer went over the return, so the contact step is reached and the
  -- case can be marked ready to e-file at once (D8, D10).
  insert into public.reviews(workspace_id,case_id,preparation_version,reviewer_person_id,status,decided_at,client_contact_status,client_contact_outcome,client_contacted_at,created_at)
  values(p_case.workspace_id,p_case.id,2,v_morgan,'approved',now()-interval '1 hour','completed','reached',now()-interval '1 hour',now()-interval '3 hours')
  returning id into v_review;
 end if;

 -- Stage, versions and assignments. The approving reviewer stays on the case:
 -- the client contact task is theirs (Ruling R28).
 v_stage=case p_scenario
  when 'preparation_ready' then 'preparation_ready'
  when 'waiting_documents' then 'preparing'
  when 'admin_followup' then 'preparing'
  when 'review_ready' then 'review_ready'
  when 'corrections_required' then 'corrections_required'
  when 'review_approved' then 'review_approved'
  when 'rejected' then 'rejected'
  when 'accepted' then 'accepted'
  when 'on_hold' then 'on_hold' -- 036
  when 'withdrawn' then 'closed' -- 036
 end;
 if p_scenario='review_ready' or p_scenario='corrections_required' then v_version=1;
 end if;
 if v_signed then
  v_version=2;
  v_reviewer=v_morgan;
 end if;

 -- Fictional questionnaire answers (D8): each version the sample reached has
 -- its preparer's hand-off, and the approved attempt has the reviewer's answers.
 if p_scenario in ('review_ready','corrections_required') or v_signed then
  insert into public.preparer_questionnaires(workspace_id,case_id,preparation_version,submitted_by_person_id,
    confirmed_by,confirmed_method,shaded_parts_completed,state_forgiveness_set,ready_for_review_on)
  values(p_case.workspace_id,p_case.id,1,v_alex,'client',
   case when v_signed then 'in_person' else 'phone' end,true,true,current_date);
 end if;
 if v_signed then
  insert into public.preparer_questionnaires(workspace_id,case_id,preparation_version,submitted_by_person_id,
    confirmed_by,confirmed_method,shaded_parts_completed,state_forgiveness_set,ready_for_review_on)
  values(p_case.workspace_id,p_case.id,2,v_alex,'client','phone',true,true,current_date);
  insert into public.reviewer_questionnaires(workspace_id,case_id,review_id,answered_by_person_id,completed_on,
    pa_forgiveness,went_over,went_over_on,went_over_how,sign_method,sign_appointment_at,exit_form,remarks)
  values(p_case.workspace_id,p_case.id,v_review,v_morgan,current_date,
   'eligible',true,current_date,'phone','portal',null,
   '{"federal":{"method":"efile","result":"refund","amount":"412.00","refundBy":"direct_deposit"},"state":null,"local":[{"type":"NPT","method":"paper","result":"none"}]}'::jsonb,
   null);
 end if;

 -- The history, spaced an hour apart so the most recent entry is the newest
 -- and the timeline reads in the order the work happened.
 select max(h.seq) into v_total from vitally_private.fixture_history(p_scenario) h;
 insert into public.case_events(workspace_id,case_id,actor_user_id,actor_person_id,action,detail,created_at)
 select p_case.workspace_id,p_case.id,null,pp.id,h.action,h.detail,now()-make_interval(hours=>v_total-h.seq+1)
 from vitally_private.fixture_history(p_scenario) h
 left join public.people pp on pp.workspace_id=p_case.workspace_id and pp.person_key=h.person_key;
 insert into public.client_events(workspace_id,case_id,action,message,created_at)
 select p_case.workspace_id,p_case.id,h.action,h.message,now()-make_interval(hours=>v_total-h.seq+1)
 from vitally_private.fixture_history(p_scenario) h
 where h.message is not null;

 -- A case leaving draft straight for Closed takes no client number (010), but a
 -- withdrawn application was submitted, so a fresh sample steps through Received.
 if p_scenario='withdrawn' and p_case.stage='draft' then -- 036
  update public.cases set stage='received' where id=p_case.id; -- 036
 end if; -- 036

 update public.cases set stage=v_stage,intake_verified=(p_scenario<>'on_hold'),preparation_version=v_version, -- 036
  preparer_id=v_preparer,reviewer_id=v_reviewer,last_reminded_at=null,last_reminded_by_person_id=null,
  signing_plan=case when v_signed then 'portal' end,signing_appointment_at=null,
  federal_method=case when v_filed then 'efile' end,state_method=case when v_filed then 'efile' end,
  federal_result=case when v_filed then 'accepted' end,
  state_result=case p_scenario when 'rejected' then 'rejected' when 'accepted' then 'accepted' end,
  hold_origin=case when p_scenario='on_hold' then 'awaiting_documents' end, -- 036
  documents_origin=case when p_scenario='on_hold' then 'screening' end, -- 036
  closing_reason=case when p_scenario='withdrawn' then 'withdrawn' end, -- 036
  updated_at=now()
  where id=p_case.id;

 -- The filing: one attempt, filed an hour before its answer, with both returns
 -- answered. The reject code and the fix note are staff-only rows.
 if v_filed then
  insert into public.filing_attempts(workspace_id,case_id,attempt,filed_at,filed_by)
  values(p_case.workspace_id,p_case.id,1,now()-interval '2 hours',v_sam);
  insert into public.filing_returns(workspace_id,case_id,attempt,return_kind,method,result,answered_on,reject_code,recorded_by)
  values(p_case.workspace_id,p_case.id,1,'federal','efile','accepted',(now() at time zone 'America/New_York')::date,null,v_sam),
   (p_case.workspace_id,p_case.id,1,'state','efile',case p_scenario when 'rejected' then 'rejected' else 'accepted' end,
    (now() at time zone 'America/New_York')::date,case p_scenario when 'rejected' then 'IND-031-04' end,v_sam);
  if p_scenario='rejected' then
   insert into public.filing_notes(workspace_id,case_id,attempt,note,recorded_by,recorded_at)
   values(p_case.workspace_id,p_case.id,1,'Fictional note: site coordinator to correct the dependent''s SSN in TaxSlayer.',v_sam,now()-interval '1 hour'); -- 037
  end if;
 end if;
 return v_total;
end;
$$;

revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
