-- 038: the shaded section of Form 13614-C, filled by the preparer (OpenSpec
-- change add-preparer-13614c-fields, design D2 and D3).
--
--   * D3: `preparer_shaded_fields` holds one row per case: a flat, sparse jsonb
--     object (blank means absent), a version that counts saves, and who saved
--     last. Staff read it; only the action RPC writes it.
--   * `vitally_private.check_preparer_fields(jsonb)` is the shape check on that
--     object. It repeats the key table of `src/shaded-fields.mjs` (the browser
--     applies the same rules first; the database stays the authority). It does
--     not check the season bound on the year or the household rows with no
--     member, which need the case; the action does.
--
-- Text lengths are counted in characters (code points), as the browser counts
-- them. A text that is only space, tab, line break, form feed or vertical tab
-- is blank, and blank means absent, so it is refused.
--
-- Written to be safe to apply again on a local test stack whose
-- schema_migrations row for this file was deleted during development: every
-- statement is `if not exists`, `create or replace`, or a drop-then-add.

-- ---------------------------------------------------------------------------
-- 1. The shape check.

create or replace function vitally_private.check_preparer_fields(p jsonb) returns boolean
language plpgsql immutable security definer set search_path='' as $$
declare
 cells text[] := array['household1QualifyingChild','household1OwnSupport','household1LowIncome','household1SupportProvided','household1CostOfHome','household2QualifyingChild','household2OwnSupport','household2LowIncome','household2SupportProvided','household2CostOfHome','household3QualifyingChild','household3OwnSupport','household3LowIncome','household3SupportProvided','household3CostOfHome','household4QualifyingChild','household4OwnSupport','household4LowIncome','household4SupportProvided','household4CostOfHome'];
 boxes text[] := array['incomeW2s','incomeTips','income1099R','incomeQcd','incomeDisability','incomeSsaRrb','income1099G','incomeRefund','itemizedLastYear','itemizedLastYearYes','itemizedLastYearNo','income1099Int','income1099Div','income1099B','capitalLossCarryover','capitalLossCarryoverYes','capitalLossCarryoverNo','incomeAlimony','alimonyExcludedYes','alimonyExcludedNo','incomeRental','incomeRentalExpense','incomeW2G','incomeScheduleC','income1099Misc','income1099Nec','income1099K','incomeReportedElsewhere','incomeScheduleCExpenses','incomeOther','deduction1098','deductionStandard','deductionItemized','expense1098E','expenseChildCare','expenseIra','expenseEducator','expenseAlimony','alimonyAdjustmentYes','alimonyAdjustmentNo','infoScholarship','info1098T','infoEducationCredit','infoHomeSale','infoHsaContributions','infoHsaDistributions','info1095A','infoEnergyImprovement','infoVehicleCredit','info1099C','info1099A','infoDisasterRelief','infoDisallowed','infoLitcReferral','infoEstimatedPayments','infoPriorRefundApplied','infoLastReturnAvailable'];
 counts text[] := array['incomeW2sCount','income1099RCount','incomeDisabilityCount','incomeSsaRrbCount','income1099GCount','income1099IntCount','income1099DivCount','income1099BCount','incomeW2GCount','income1099MiscCount','income1099NecCount','income1099KCount','deduction1098Count'];
 amounts text[] := array['incomeQcdAmount','incomeRefundAmount','incomeAlimonyAmount','incomeRentalExpenseAmount','incomeScheduleCExpensesAmount','expenseEducatorAmount','expenseAlimonyAmount','infoEstimatedPaymentsAmount','infoPriorRefundAppliedAmount'];
 vins text[] := array['infoVin'];
 years text[] := array['infoDisallowedYear'];
 reasons text[] := array['infoDisallowedReason'];
 notes text[] := array['incomeNotes','deductionNotes','expenseNotes','infoNotes'];
 k text;
 v jsonb;
 s text;
begin
 if p is null or jsonb_typeof(p)<>'object' then return false; end if;
 for k, v in select key, value from jsonb_each(p) loop
  if k=any(cells) then
   if jsonb_typeof(v)<>'string' or (v#>>'{}') not in ('yes','no','na') then return false; end if;
  elsif k=any(boxes) then
   if v<>'true'::jsonb then return false; end if;
  elsif k=any(counts) then
   if jsonb_typeof(v)<>'number' or (v#>>'{}')!~'^[0-9]{1,2}$' then return false; end if;
  elsif k=any(amounts) then
   if jsonb_typeof(v)<>'string' or (v#>>'{}')!~'^(0|[1-9][0-9]{0,5})(\.[0-9]{1,2})?$' then return false; end if;
  elsif k=any(vins) then
   if jsonb_typeof(v)<>'string' or (v#>>'{}')!~'^[A-Za-z0-9]{1,17}$' then return false; end if;
  elsif k=any(years) then
   if jsonb_typeof(v)<>'string' or (v#>>'{}')!~'^[0-9]{4}$' or (v#>>'{}')::int<2000 then return false; end if;
  elsif k=any(reasons) or k=any(notes) then
   if jsonb_typeof(v)<>'string' then return false; end if;
   s:=v#>>'{}';
   if s~'^[ \t\n\r\f\v]*$' or char_length(s)>(case when k=any(reasons) then 120 else 500 end) then return false; end if;
  else
   return false;
  end if;
 end loop;
 -- The four Yes/No pairs are never both ticked.
 if (p ? 'itemizedLastYearYes' and p ? 'itemizedLastYearNo')
  or (p ? 'capitalLossCarryoverYes' and p ? 'capitalLossCarryoverNo')
  or (p ? 'alimonyExcludedYes' and p ? 'alimonyExcludedNo')
  or (p ? 'alimonyAdjustmentYes' and p ? 'alimonyAdjustmentNo') then return false; end if;
 return true;
end $$;
revoke all on function vitally_private.check_preparer_fields(jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. preparer_shaded_fields (D3): one row per case. Only the action RPC
-- writes it; the select policy is 033's presenter-only one.

create table if not exists public.preparer_shaded_fields (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null unique,
 fields jsonb not null,
 version bigint not null check(version>=1),
 updated_by_person_id uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(workspace_id,updated_by_person_id) references public.people(workspace_id,id)
);
alter table public.preparer_shaded_fields drop constraint if exists preparer_shaded_fields_fields_shape;
alter table public.preparer_shaded_fields add constraint preparer_shaded_fields_fields_shape check(vitally_private.check_preparer_fields(fields));
alter table public.preparer_shaded_fields enable row level security;
drop policy if exists presenter_preparer_shaded_fields on public.preparer_shaded_fields;
create policy presenter_preparer_shaded_fields on public.preparer_shaded_fields for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=preparer_shaded_fields.case_id where m.workspace_id=preparer_shaded_fields.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')));
revoke all on public.preparer_shaded_fields from public, anon, authenticated, service_role;
grant select on public.preparer_shaded_fields to authenticated;
-- Not 033's insert and update: the shape check calls check_preparer_fields,
-- which no client role may execute, so a direct write by service_role would
-- fail anyway. Only the action RPC (security definer) writes the row.
grant select, delete on public.preparer_shaded_fields to service_role;

-- Realtime, with 033's pattern: INSERT and UPDATE only, under the same RLS (a
-- presenter receives the change, an applicant never does).
do $$
declare v_table text;
begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
  raise exception 'The supabase_realtime publication is missing; enable Realtime on this project before migrating.';
 end if;
 foreach v_table in array array['preparer_shaded_fields'] loop
  if not exists(
   select 1 from pg_publication_tables
   where pubname='supabase_realtime' and schemaname='public' and tablename=v_table
  ) then
   execute format('alter publication supabase_realtime add table public.%I',v_table);
  end if;
 end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. act_save_preparer_fields (D2, D4, D5). The case's preparer replaces the
-- whole set while preparing or while corrections are requested. The version
-- the preparer last saw must still be the stored one (0 when there is no
-- row); other actions moving the case revision do not matter, because the
-- caller's revision was already checked by vitally_apply_action. The year must
-- be before the season and a household cell needs a household member, as
-- src/shaded-fields.mjs checks first. The staff history lists the changed
-- keys; there is no client message.

create or replace function vitally_private.act_save_preparer_fields(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_fields jsonb:=p_payload->'fields';
 v_based bigint:=(p_payload->>'basedOnVersion')::bigint;
 v_old jsonb;
 v_stored bigint;
 v_version bigint;
 v_season int;
 v_hh int:=0;
 v_changed jsonb;
begin
 if p_case.stage not in ('preparing','corrections_required') then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 perform vitally_private.require_case_preparer(p_case,p_person);
 select s.fields,s.version into v_old,v_stored from public.preparer_shaded_fields s where s.case_id=p_case.id for update;
 if coalesce(v_stored,0)<>v_based then
  raise sqlstate 'VT003' using message='CONFLICT';
 end if;
 select coalesce(p_case.season,w.current_season) into v_season from public.workspaces w where w.id=p_case.workspace_id;
 if v_fields ? 'infoDisallowedYear' and (v_season is null or (v_fields->>'infoDisallowedYear')::int>=v_season) then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 -- The household size as the intake answers give it, at most the four rows the form has.
 if jsonb_typeof(p_case.answers->'hh')='array' then
  v_hh:=least(jsonb_array_length(p_case.answers->'hh'),4);
 end if;
 if exists(select 1 from jsonb_object_keys(v_fields) k
   where k~'^household[1-4]' and substring(k from 10 for 1)::int>v_hh) then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 insert into public.preparer_shaded_fields as s(workspace_id,case_id,fields,version,updated_by_person_id)
 values(p_case.workspace_id,p_case.id,v_fields,1,p_person.id)
 on conflict (case_id) do update set fields=excluded.fields,version=s.version+1,
  updated_by_person_id=excluded.updated_by_person_id,updated_at=now()
 returning s.version into v_version;
 select coalesce(jsonb_agg(d.k order by d.k collate "C"),'[]'::jsonb) into v_changed from (
  select coalesce(o.key,n.key) as k
  from jsonb_each(coalesce(v_old,'{}'::jsonb)) o full join jsonb_each(v_fields) n on n.key=o.key
  where o.value is distinct from n.value) d;
 return jsonb_build_object('detail',jsonb_build_object('changed',v_changed,'version',v_version));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. check_payload, verbatim from 037 with the SAVE_PREPARER_FIELDS branch.

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
  when 'SAVE_PREPARER_FIELDS' then -- 038
   -- The whole set, based on the version the preparer last saw (a whole number, 0 for none). -- 038
   if vitally_private.payload_keys(p_payload)<>array['basedOnVersion','fields'] -- 038
    or jsonb_typeof(p_payload->'basedOnVersion')<>'number' -- 038
    or (p_payload->>'basedOnVersion') !~ '^[0-9]{1,15}$' -- 038
    or jsonb_typeof(p_payload->'fields')<>'object' -- 038
    or not coalesce(vitally_private.check_preparer_fields(p_payload->'fields'),false) then -- 038
    raise sqlstate 'VT007' using message='VALIDATION'; -- 038
   end if; -- 038
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
end;
$$;


-- ---------------------------------------------------------------------------
-- 5. check_operation_authority, verbatim from 036 with SAVE_PREPARER_FIELDS in
-- the staff-person group. Which person may is the handler's (require_case_preparer).

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
       'APPROVE_REVIEW','RECORD_REVIEW_CONTACT','SAVE_PREPARER_FIELDS' then -- 038
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
-- 6. vitally_apply_action, verbatim from 036 with the dispatch line for
-- SAVE_PREPARER_FIELDS; the grants end the section as they end 036.

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
  when 'SAVE_PREPARER_FIELDS' then v_outcome=vitally_private.act_save_preparer_fields(v_member,v_case,v_person,p_payload); -- 038
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
 return vitally_private.commit_action(v_member,v_case,v_person,p_action_id,p_type,v_outcome,v_receipt);
end;
$$;

revoke all on function public.vitally_apply_action(uuid,uuid,bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.vitally_apply_action(uuid,uuid,bigint,uuid,text,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. apply_fixture_scenario, verbatim from 037 with the lines marked -- 038: a
-- checkpoint clears the case's shaded row, and each sample that has a preparer
-- questionnaire gets a fictional shaded row beside it.

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
 v_hh int; -- 038
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
 delete from public.preparer_shaded_fields where workspace_id=p_case.workspace_id and case_id=p_case.id; -- 038
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
  -- The shaded section the preparer completed, with fictional values. The -- 038
  -- household row is filled only when the sample has a household member. -- 038
  select jsonb_array_length(c.answers->'hh') into v_hh from public.cases c where c.id=p_case.id and jsonb_typeof(c.answers->'hh')='array'; -- 038
  insert into public.preparer_shaded_fields(workspace_id,case_id,fields,version,updated_by_person_id) -- 038
  values(p_case.workspace_id,p_case.id, -- 038
   jsonb_build_object('incomeW2s',true,'incomeW2sCount',1,'income1099Int',true,'income1099IntCount',1,'deductionStandard',true, -- 038
    'incomeNotes','Fictional: one W-2 from a part-time job.') -- 038
   || case when coalesce(v_hh,0)>=1 then jsonb_build_object('household1QualifyingChild','yes','household1OwnSupport','no', -- 038
    'household1LowIncome','yes','household1SupportProvided','na','household1CostOfHome','yes') else '{}'::jsonb end, -- 038
   1,v_alex); -- 038
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
