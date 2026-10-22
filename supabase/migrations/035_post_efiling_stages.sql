-- 035: the stages after E-filed (OpenSpec change add-post-efiling-stages,
-- design D2).
--
--   * Two stages, `rejected` and `accepted`, after `efiled`.
--   * Four nullable `cases` columns: how each return was filed (`federal_method`,
--     `state_method`: efile or paper) and its result (`federal_result`,
--     `state_result`: accepted, rejected or mailed). A case e-filed before 035
--     has null methods and results.
--   * Three staff-only tables: `filing_attempts` (one row per filing),
--     `filing_returns` (one row per return of an attempt) and the append-only
--     `filing_notes` (what the office fixed after a rejection). No client reads
--     any of them, and none is added to the realtime publication.
--
-- Later sections redefine these shared functions. Each is copied verbatim from
-- its newest definition, with only the lines marked `-- 035` changed, as 033
-- does:
--
--   | Function                                   | Copied from               | What 035 changes |
--   |--------------------------------------------|---------------------------|------------------|
--   | vitally_private.check_payload              | 034                       | MARK_EFILED carries the method of each return (split from MARK_READY_TO_EFILE); new RECORD_FILING_RESULT branch |
--   | vitally_private.fixture_history            | 034                       | (later task) |
--   | vitally_private.apply_fixture_scenario     | 033                       | (later task) |
--   | vitally_private.act_mark_efiled            | 032                       | a first filing records both methods, attempt 1 and its two returns (more in later sections) |
--   | vitally_private.act_close_case             | 032                       | (later task) |
--   | vitally_private.check_operation_authority  | 032                       | RECORD_FILING_RESULT joins the admin-only group (more in later sections) |
--   | public.vitally_apply_action                | 032                       | dispatches RECORD_FILING_RESULT (more in later sections) |
--   | vitally_private.fixture_keys               | 009                       | (later task) |
--
-- New functions: vitally_private.filing_line and vitally_private.efiled_line
-- (the client sentences for the filing results and the Mark e-filed line), and
-- vitally_private.act_record_filing_result.
--
-- Written to be safe to apply again on a local test stack whose
-- schema_migrations row for this file was deleted during development: every
-- statement is `if not exists`, `create or replace`, or a drop-then-add.

-- ---------------------------------------------------------------------------
-- 1. The stage list: 032's, plus rejected and accepted.

alter table public.cases drop constraint if exists cases_stage_check;
alter table public.cases add constraint cases_stage_check check (stage in (
  'draft','received','screening','preparation_ready','preparing','review_ready',
  'reviewing','corrections_required','review_approved','ready_to_efile','efiled',
  'rejected','accepted','closed'));

-- ---------------------------------------------------------------------------
-- 2. The filing columns. Methods are both set or both null, and a federal paper
-- return with an e-filed state return is an unused combination. A result needs
-- its method: mailed belongs to paper, accepted and rejected to e-file.

alter table public.cases add column if not exists federal_method text;
alter table public.cases add column if not exists state_method text;
alter table public.cases add column if not exists federal_result text;
alter table public.cases add column if not exists state_result text;
alter table public.cases drop constraint if exists cases_filing_methods;
alter table public.cases add constraint cases_filing_methods check(
 (federal_method is null or federal_method in ('efile','paper'))
 and (state_method is null or state_method in ('efile','paper'))
 and ((federal_method is null)=(state_method is null))
 and not (federal_method='paper' and state_method='efile'));
alter table public.cases drop constraint if exists cases_filing_results;
alter table public.cases add constraint cases_filing_results check(
 (federal_result is null or (federal_result in ('accepted','rejected','mailed') and federal_method is not null and (federal_result='mailed')=(federal_method='paper')))
 and (state_result is null or (state_result in ('accepted','rejected','mailed') and state_method is not null and (state_result='mailed')=(state_method='paper'))));

-- ---------------------------------------------------------------------------
-- The foreign keys to people below are deferred: a workspace delete removes its
-- people before its cases, and the check must wait until the cases (and so
-- these rows) are gone too.
--
-- 3. filing_attempts: one row per time the case was filed. Only the action RPC
-- writes it; the select policy is 013's presenter-only one.

create table if not exists public.filing_attempts (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 case_id uuid not null,
 attempt int not null check(attempt>=1),
 filed_at timestamptz not null default now(),
 filed_by uuid not null,
 unique(case_id,attempt),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(workspace_id,filed_by) references public.people(workspace_id,id) deferrable initially deferred
);
-- No direct workspace foreign key (see filing_notes): a workspace delete reaches
-- the attempts through their case only.
alter table public.filing_attempts drop constraint if exists filing_attempts_workspace_id_fkey;
alter table public.filing_attempts enable row level security;
drop policy if exists presenter_filing_attempts on public.filing_attempts;
create policy presenter_filing_attempts on public.filing_attempts for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=filing_attempts.case_id where m.workspace_id=filing_attempts.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')));
revoke all on public.filing_attempts from public, anon, authenticated;
grant select on public.filing_attempts to authenticated;
grant select, insert, update, delete on public.filing_attempts to service_role;

-- ---------------------------------------------------------------------------
-- 4. filing_returns: the federal and the state return of an attempt, with the
-- answer once recorded. A reject code is internal staff text.

create table if not exists public.filing_returns (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 case_id uuid not null,
 attempt int not null,
 return_kind text not null check(return_kind in ('federal','state')),
 method text not null check(method in ('efile','paper')),
 result text check(result is null or result in ('accepted','rejected','mailed')),
 answered_on date,
 reject_code text check(reject_code is null or char_length(reject_code) between 1 and 40),
 recorded_by uuid,
 unique(case_id,attempt,return_kind),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(case_id,attempt) references public.filing_attempts(case_id,attempt) on delete cascade,
 foreign key(workspace_id,recorded_by) references public.people(workspace_id,id) deferrable initially deferred
);
alter table public.filing_returns drop constraint if exists filing_returns_workspace_id_fkey;
alter table public.filing_returns enable row level security;
drop policy if exists presenter_filing_returns on public.filing_returns;
create policy presenter_filing_returns on public.filing_returns for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=filing_returns.case_id where m.workspace_id=filing_returns.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')));
revoke all on public.filing_returns from public, anon, authenticated;
grant select on public.filing_returns to authenticated;
grant select, insert, update, delete on public.filing_returns to service_role;

-- ---------------------------------------------------------------------------
-- 5. filing_notes: what the office fixed after a rejection. Append-only: a note
-- is never changed or removed, by anyone.

create table if not exists public.filing_notes (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 case_id uuid not null,
 attempt int not null,
 note text not null check(char_length(note) between 1 and 1000),
 recorded_by uuid not null,
 recorded_at timestamptz not null default now(),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(case_id,attempt) references public.filing_attempts(case_id,attempt) on delete cascade,
 foreign key(workspace_id,recorded_by) references public.people(workspace_id,id) deferrable initially deferred
);
-- A note cascades only through its case and its filing, never straight from
-- the workspace, so the trigger below always sees the case row already gone
-- when a case or a workspace is deleted. (An earlier draft had a direct
-- workspace foreign key; this drops it where it was applied.)
alter table public.filing_notes drop constraint if exists filing_notes_workspace_id_fkey;
alter table public.filing_notes enable row level security;
drop policy if exists presenter_filing_notes on public.filing_notes;
create policy presenter_filing_notes on public.filing_notes for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=filing_notes.case_id where m.workspace_id=filing_notes.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')));
revoke all on public.filing_notes from public, anon, authenticated;
grant select on public.filing_notes to authenticated;
grant select, insert, update, delete on public.filing_notes to service_role;

create or replace function vitally_private.filing_notes_append_only() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- A note may go only together with its whole case (a sample reset, a fixture
 -- or workspace teardown), never on its own. A delete cascading from a deleted
 -- case sees the case row already gone, so it passes; a direct delete, or a
 -- cascade from deleting just a filing attempt, finds the case and is refused.
 if tg_op='DELETE' and not exists(select 1 from public.cases where id=old.case_id) then
  return old;
 end if;
 raise sqlstate 'VT007' using message='VALIDATION';
end;
$$;
revoke all on function vitally_private.filing_notes_append_only() from public,anon,authenticated,service_role;
drop trigger if exists filing_notes_append_only on public.filing_notes;
create trigger filing_notes_append_only before update or delete on public.filing_notes
 for each row execute function vitally_private.filing_notes_append_only();

-- ---------------------------------------------------------------------------
-- 6. check_payload, verbatim from 034 with MARK_EFILED split from MARK_READY_TO_EFILE:
-- it carries the method of each return.
create or replace function vitally_private.check_payload(p_type text,p_payload jsonb) returns void
language plpgsql immutable security definer set search_path='' as $$
declare v_e record; -- 035
 v_d date; -- 035
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
   -- Closing is deliberate: a written reason and an explicit confirmation.
   if vitally_private.payload_keys(p_payload)<>array['confirmed','reason']
    or p_payload->'confirmed'<>'true'::jsonb
    or not vitally_private.payload_text(p_payload,'reason',1000) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'MARK_READY_TO_EFILE' then -- 035
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
-- 7. The client sentences. filing_line takes the state of each return
-- ('waiting', 'accepted', 'rejected' or 'mailed'; null when the return is not in
-- this line): one sentence per return, federal first, replaced by the combined
-- sentence when both are the same. efiled_line is the Mark e-filed history
-- line; on a second filing a null method means that return was not filed.

create or replace function vitally_private.filing_line(p_federal text,p_state text) returns text
language sql immutable security definer set search_path='' as $$
 select case
  when p_federal is null and p_state is null then null
  when p_federal=p_state then case p_federal
   when 'waiting' then 'Your federal and Pennsylvania returns were e-filed. The IRS and Pennsylvania will each confirm whether they are accepted.'
   when 'accepted' then 'The IRS and Pennsylvania accepted your returns.'
   when 'rejected' then 'Your federal and Pennsylvania returns need a correction before they can be accepted.'
   when 'mailed' then 'Your federal and Pennsylvania returns were mailed. A reply to a mailed return can take several weeks.'
  end
  else concat_ws(' ',
   case p_federal
    when 'waiting' then 'Your federal return was e-filed. The IRS will confirm whether it is accepted.'
    when 'accepted' then 'The IRS accepted your federal return.'
    when 'rejected' then 'Your federal return needs a correction before it can be accepted.'
    when 'mailed' then 'Your federal return was mailed. A reply to a mailed return can take several weeks.'
   end,
   case p_state
    when 'waiting' then 'Your Pennsylvania return was e-filed. Pennsylvania will confirm whether it is accepted.'
    when 'accepted' then 'Pennsylvania accepted your Pennsylvania return.'
    when 'rejected' then 'Your Pennsylvania return needs a correction before it can be accepted.'
    when 'mailed' then 'Your Pennsylvania return was mailed. A reply to a mailed return can take several weeks.'
   end)
 end;
$$;
revoke all on function vitally_private.filing_line(text,text) from public,anon,authenticated,service_role;

create or replace function vitally_private.efiled_line(p_federal_method text,p_state_method text,p_second boolean) returns text
language sql immutable security definer set search_path='' as $$
 select case
  when p_federal_method is null and p_state_method is null then null
  when p_second and p_state_method is null then
   case p_federal_method when 'efile' then 'PCDC e-filed your federal return.' else 'PCDC mailed your federal return.' end
  when p_second and p_federal_method is null then
   case p_state_method when 'efile' then 'PCDC e-filed your Pennsylvania return.' else 'PCDC mailed your Pennsylvania return.' end
  when p_federal_method='efile' and p_state_method='efile' then 'PCDC e-filed your return.'
  when p_federal_method='efile' and p_state_method='paper' then 'PCDC e-filed your federal return and mailed your Pennsylvania return.'
  when p_federal_method='paper' and p_state_method='paper' then 'PCDC mailed your returns.'
 end;
$$;
revoke all on function vitally_private.efiled_line(text,text,boolean) from public,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 8. act_mark_efiled, verbatim from 032 with the first filing's methods.

create or replace function vitally_private.act_mark_efiled(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_federal text; v_state text; -- 035
begin
 if p_case.stage<>'ready_to_efile' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 -- 035: a first filing (no methods yet) names both returns, in a used pair.
 -- (A filing after Return to signing is a later section's.)
 v_federal:=p_payload->'methods'->>'federal'; -- 035
 v_state:=p_payload->'methods'->>'state'; -- 035
 if p_case.federal_method is not null or p_case.state_method is not null -- 035
  or v_federal is null or v_state is null or (v_federal='paper' and v_state='efile') then -- 035
  raise sqlstate 'VT007' using message='VALIDATION'; -- 035
 end if; -- 035
 update public.cases set stage='efiled',federal_method=v_federal,state_method=v_state where id=p_case.id; -- 035
 insert into public.filing_attempts(workspace_id,case_id,attempt,filed_by) values(p_case.workspace_id,p_case.id,1,p_person.id); -- 035
 insert into public.filing_returns(workspace_id,case_id,attempt,return_kind,method) -- 035
  values(p_case.workspace_id,p_case.id,1,'federal',v_federal),(p_case.workspace_id,p_case.id,1,'state',v_state); -- 035
 return jsonb_build_object('detail',jsonb_build_object('attempt',1,'methods',jsonb_build_object('federal',v_federal,'state',v_state)), -- 035
  'message',vitally_private.efiled_line(v_federal,v_state,false)); -- 035
end; $$;

-- ---------------------------------------------------------------------------
-- 9. act_record_filing_result: an admin records the answer of one or both
-- returns of the current filing. check_payload has checked the shape, the
-- result and code rules and the date format.

create or replace function vitally_private.act_record_filing_result(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_today date:=(now() at time zone 'America/New_York')::date;
 v_fm text:=p_case.federal_method;
 v_sm text:=p_case.state_method;
 v_attempt int;
 v_filed date;
 v_filed_at timestamptz;
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
  v_filed_at:=coalesce((select max(e.created_at) from public.case_events e where e.case_id=p_case.id and e.action='MARK_EFILED'),p_case.updated_at);
  update public.cases set federal_method='efile',state_method='efile' where id=p_case.id;
  insert into public.filing_attempts(workspace_id,case_id,attempt,filed_at,filed_by) values(p_case.workspace_id,p_case.id,1,v_filed_at,p_person.id);
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
   or (v_in->>'result'='mailed')<>(v_row.method='paper') then
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
  when v_federal in ('accepted','mailed') and v_state in ('accepted','mailed') then 'accepted'
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
-- 10. check_operation_authority, verbatim from 032 with RECORD_FILING_RESULT in
-- the admin-only group.
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
  when 'VERIFY_INTAKE','REMIND','CLOSE_CASE','START_SCREENING','MARK_READY_TO_EFILE','MARK_EFILED','RECORD_FILING_RESULT' then -- 035
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
-- 11. vitally_apply_action, verbatim from 032 with the dispatch line for
-- RECORD_FILING_RESULT; the grants end the file as they end 032.
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

-- The vitally_private functions keep the privileges 003 gave them.
revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
