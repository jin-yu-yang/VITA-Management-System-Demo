-- 033: the preparer's and the reviewer's questionnaires (OpenSpec change
-- add-preparer-and-reviewer-questionnaires, design D2, D5 and D11).
--
--   * D2: `preparer_questionnaires` (one row per preparation version) and
--     `reviewer_questionnaires` (one row per review), both staff-only.
--   * D5: `admin_followups.purpose` (`request_documents` or `go_over_return`,
--     the contact log's keys) and a nullable `request_id`, so the office can be
--     asked to go over the return with a client.
--   * D11: `cases.signing_plan` and `cases.signing_appointment_at`, the only
--     part of a questionnaire a client reads. Nothing here, and no client
--     message or event, may mention an answer, an amount or a payment method.
--
-- The Exit Form stores only payment methods, amounts and the debit date,
-- never an account number, routing number or other banking detail (D3). This
-- departs from ruling R28, which kept every money detail out of the database.
--
-- Later sections redefine these shared functions (design D12). Each is copied
-- verbatim from its newest definition, with only the lines marked `-- 033`
-- changed, as 032 does:
--
--   | Function                                   | Copied from               | What 033 changes |
--   |--------------------------------------------|---------------------------|------------------|
--   | vitally_private.check_payload              | 032                       | SUBMIT_REVIEW and APPROVE_REVIEW leave the empty-payload group (CLAIM_PREPARATION, REMIND, CLAIM_REVIEW and START_SCREENING stay). New branches for SUBMIT_REVIEW, APPROVE_REVIEW and RESUBMIT_REVIEW. Every other branch, including 032's MARK_READY_TO_EFILE/MARK_EFILED, is verbatim. |
--   | vitally_private.act_submit_review          | 006 (its only definition) | the TaxSlayer date check and the questionnaire insert |
--   | vitally_private.act_resubmit_review        | 006 (its only definition) | the same |
--   | vitally_private.act_approve_review         | 021 (#91 did not redefine it) | the date and appointment checks, the reviewer insert, the D5 follow-up, the D10 contact step, the D11 signing plan; its client message is unchanged |
--   | vitally_private.apply_fixture_scenario     | 031 (#88's, newest; #91 did not redefine it) | the D8 deletes, seeds and case columns; #88's contact-log lines kept |
--   | vitally_private.act_mark_ready_to_efile    | 032 (its only definition) | the D13 wait on an open go-over follow-up, after 032's contact-step check; its client message is unchanged |
--
-- `vitally_apply_action` and `check_operation_authority` are not redefined.
--
-- Written to be safe to apply again on a local test stack whose
-- schema_migrations row for this file was deleted during development: every
-- statement is `if not exists`, `create or replace`, or a drop-then-add.

-- ---------------------------------------------------------------------------
-- 1. preparer_questionnaires (D2): the preparer's hand-off answers. Only the
-- action RPC writes it; the select policy is 013's presenter-only one.

create table if not exists public.preparer_questionnaires (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null,
 preparation_version bigint not null check(preparation_version>=1),
 submitted_by_person_id uuid not null,
 confirmed_by text not null check(confirmed_by in ('client','spouse','other')),
 confirmed_by_name text check(confirmed_by_name is null or length(confirmed_by_name) between 1 and 120),
 confirmed_method text not null check(confirmed_method in ('phone','in_person','text','email','video')),
 shaded_parts_completed boolean not null check(shaded_parts_completed=true),
 state_forgiveness_set boolean not null check(state_forgiveness_set=true),
 ready_for_review_on date not null,
 created_at timestamptz not null default now(),
 constraint preparer_questionnaires_other_name check((confirmed_by='other')=(confirmed_by_name is not null)),
 unique(case_id,preparation_version),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(workspace_id,submitted_by_person_id) references public.people(workspace_id,id)
);
alter table public.preparer_questionnaires enable row level security;
drop policy if exists presenter_preparer_questionnaires on public.preparer_questionnaires;
create policy presenter_preparer_questionnaires on public.preparer_questionnaires for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=preparer_questionnaires.case_id where m.workspace_id=preparer_questionnaires.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')));
revoke all on public.preparer_questionnaires from public, anon, authenticated;
grant select on public.preparer_questionnaires to authenticated;
grant select, insert, update, delete on public.preparer_questionnaires to service_role;

-- ---------------------------------------------------------------------------
-- 2. reviewer_questionnaires (D2, D3): the reviewer's approval answers. The
-- Exit Form groups are checked jsonb (the action's check_payload validates
-- the shape); `exit_form` holds methods, amounts and the debit date only.

create table if not exists public.reviewer_questionnaires (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null,
 review_id uuid not null unique,
 answered_by_person_id uuid not null,
 completed_on date not null,
 pa_forgiveness text not null check(pa_forgiveness in ('eligible','not_eligible')),
 went_over boolean not null,
 went_over_on date,
 went_over_how text check(went_over_how in ('in_person','phone','video','other')),
 sign_method text not null check(sign_method in ('portal','in_person')),
 sign_appointment_at timestamp,
 exit_form jsonb not null,
 remarks text check(remarks is null or length(remarks) between 1 and 2000),
 created_at timestamptz not null default now(),
 constraint reviewer_questionnaires_went_over check(went_over=(went_over_on is not null)),
 constraint reviewer_questionnaires_went_over_how check(went_over or went_over_how is null),
 constraint reviewer_questionnaires_appointment_minute check(sign_appointment_at is null or date_trunc('minute',sign_appointment_at)=sign_appointment_at),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(workspace_id,case_id,review_id) references public.reviews(workspace_id,case_id,id) on delete cascade,
 foreign key(workspace_id,answered_by_person_id) references public.people(workspace_id,id)
);
alter table public.reviewer_questionnaires enable row level security;
drop policy if exists presenter_reviewer_questionnaires on public.reviewer_questionnaires;
create policy presenter_reviewer_questionnaires on public.reviewer_questionnaires for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=reviewer_questionnaires.case_id where m.workspace_id=reviewer_questionnaires.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')));
revoke all on public.reviewer_questionnaires from public, anon, authenticated;
grant select on public.reviewer_questionnaires to authenticated;
grant select, insert, update, delete on public.reviewer_questionnaires to service_role;

-- Realtime, with 013's pattern: INSERT and UPDATE only, under the same RLS.
do $$
declare v_table text;
begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
  raise exception 'The supabase_realtime publication is missing; enable Realtime on this project before migrating.';
 end if;
 foreach v_table in array array['preparer_questionnaires','reviewer_questionnaires'] loop
  if not exists(
   select 1 from pg_publication_tables
   where pubname='supabase_realtime' and schemaname='public' and tablename=v_table
  ) then
   execute format('alter publication supabase_realtime add table public.%I',v_table);
  end if;
 end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The follow-up's purpose (D5). Every existing row is a document
-- escalation, which the default covers. A go-over task has no request.

alter table public.admin_followups add column if not exists purpose text not null default 'request_documents';
alter table public.admin_followups drop constraint if exists admin_followups_purpose_check;
alter table public.admin_followups add constraint admin_followups_purpose_check check(purpose in ('request_documents','go_over_return'));
alter table public.admin_followups alter column request_id drop not null;
alter table public.admin_followups drop constraint if exists admin_followups_purpose_request;
alter table public.admin_followups add constraint admin_followups_purpose_request check((purpose='request_documents')=(request_id is not null));

-- ---------------------------------------------------------------------------
-- 4. The signing plan (D11): the one thing a client reads of a questionnaire.
-- `visible_cases` already lets an applicant read their own row, and `cases` is
-- already published, so no policy changes. Both are null until an approval
-- records a plan.

alter table public.cases add column if not exists signing_plan text;
alter table public.cases add column if not exists signing_appointment_at timestamp;
alter table public.cases drop constraint if exists cases_signing_plan_check;
alter table public.cases add constraint cases_signing_plan_check check(signing_plan is null or signing_plan in ('appointment','same_day','portal','go_over_first'));
alter table public.cases drop constraint if exists cases_signing_appointment;
alter table public.cases add constraint cases_signing_appointment check((signing_plan is not distinct from 'appointment')=(signing_appointment_at is not null));

-- ---------------------------------------------------------------------------
-- 5. Payload validation (D3, D4). Every failure is VT007 VALIDATION, raised by
-- check_payload. The checkers answer true or false and never raise, so a
-- malformed payload (a number where an object belongs) is a refusal, not a
-- server error. The date window and the appointment rule need the case and
-- belong to the handlers.

-- A date key: a string `YYYY-MM-DD` that is a real calendar date, else null.
create or replace function vitally_private.payload_date(p jsonb,key text) returns date
language plpgsql immutable security definer set search_path='' as $$
begin
 if jsonb_typeof(p->key)='string' and p->>key ~ '^\d{4}-\d{2}-\d{2}$' then
  return (p->>key)::date;
 end if;
 return null;
exception when others then
 return null;
end;
$$;

-- A wall-clock minute: a string `YYYY-MM-DDTHH:MM` that is a real time, else
-- null. The hour is bound to 00-23, because the cast would accept 24:00.
create or replace function vitally_private.payload_minute(p jsonb,key text) returns timestamp
language plpgsql immutable security definer set search_path='' as $$
begin
 if jsonb_typeof(p->key)='string' and p->>key ~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$' then
  return (p->>key)::timestamp;
 end if;
 return null;
exception when others then
 return null;
end;
$$;

-- One Exit Form group (D3). `p_local` adds the `type` key a local entry carries.
create or replace function vitally_private.check_exit_group(g jsonb,p_local boolean) returns boolean
language plpgsql immutable security definer set search_path='' as $$
begin
 if jsonb_typeof(g) is distinct from 'object' then
  return false;
 end if;
 if p_local then
  if not vitally_private.payload_keys(g)<@array['amount','debitOn','method','oweBy','refundBy','result','type']
   or jsonb_typeof(g->'type') is distinct from 'string' or g->>'type' not in ('NPT','BIRT','EET','SIT','PAIBWTR') then
   return false;
  end if;
 elsif not vitally_private.payload_keys(g)<@array['amount','debitOn','method','oweBy','refundBy','result'] then
  return false;
 end if;
 if jsonb_typeof(g->'method') is distinct from 'string' or g->>'method' not in ('efile','paper')
  or jsonb_typeof(g->'result') is distinct from 'string' or g->>'result' not in ('refund','owe','none') then
  return false;
 end if;
 if g->>'result'='none' then
  return not (g ? 'amount' or g ? 'refundBy' or g ? 'oweBy' or g ? 'debitOn');
 end if;
 if jsonb_typeof(g->'amount') is distinct from 'string' or g->>'amount' !~ '^(0|[1-9][0-9]{0,5})(\.[0-9]{1,2})?$' then
  return false;
 end if;
 if g->>'result'='refund' then
  return jsonb_typeof(g->'refundBy')='string' and g->>'refundBy' in ('direct_deposit','check')
   and not (g ? 'oweBy' or g ? 'debitOn');
 end if;
 if jsonb_typeof(g->'oweBy') is distinct from 'string' or g->>'oweBy' not in ('direct_debit','mail_check') or g ? 'refundBy' then
  return false;
 end if;
 if g->>'oweBy'='direct_debit' then
  return vitally_private.payload_date(g,'debitOn') is not null;
 end if;
 return not g ? 'debitOn';
end;
$$;

-- The Exit Form (D3): federal and state are a group or null, local is at most
-- one entry per type. It has no key for, and so refuses, any banking detail.
create or replace function vitally_private.check_exit_form(p jsonb) returns boolean
language plpgsql immutable security definer set search_path='' as $$
begin
 if jsonb_typeof(p) is distinct from 'object' or vitally_private.payload_keys(p)<>array['federal','local','state'] then
  return false;
 end if;
 if (jsonb_typeof(p->'federal') is distinct from 'null' and not vitally_private.check_exit_group(p->'federal',false))
  or (jsonb_typeof(p->'state') is distinct from 'null' and not vitally_private.check_exit_group(p->'state',false)) then
  return false;
 end if;
 if jsonb_typeof(p->'local') is distinct from 'array' or jsonb_array_length(p->'local')>5 then
  return false;
 end if;
 if exists(select 1 from jsonb_array_elements(p->'local') e where not vitally_private.check_exit_group(e,true)) then
  return false;
 end if;
 return (select count(distinct e->>'type') from jsonb_array_elements(p->'local') e)=jsonb_array_length(p->'local');
end;
$$;

-- The preparer's questionnaire, SUBMIT_REVIEW's and RESUBMIT_REVIEW's.
create or replace function vitally_private.check_preparer_questionnaire(q jsonb) returns boolean
language plpgsql immutable security definer set search_path='' as $$
begin
 if jsonb_typeof(q) is distinct from 'object' then
  return false;
 end if;
 if not (vitally_private.payload_keys(q)<@array['confirmedBy','confirmedByName','confirmedMethod','readyForReviewOn','shadedPartsCompleted','stateForgivenessSet']
   and vitally_private.payload_keys(q)@>array['confirmedBy','confirmedMethod','readyForReviewOn','shadedPartsCompleted','stateForgivenessSet']) then
  return false;
 end if;
 if jsonb_typeof(q->'confirmedBy') is distinct from 'string' or q->>'confirmedBy' not in ('client','spouse','other')
  or jsonb_typeof(q->'confirmedMethod') is distinct from 'string' or q->>'confirmedMethod' not in ('phone','in_person','text','email','video')
  or q->'shadedPartsCompleted' is distinct from 'true'::jsonb or q->'stateForgivenessSet' is distinct from 'true'::jsonb
  or vitally_private.payload_date(q,'readyForReviewOn') is null then
  return false;
 end if;
 if q->>'confirmedBy'='other' then
  return vitally_private.payload_text(q,'confirmedByName',120) and length(btrim(q->>'confirmedByName'))<=120;
 end if;
 return not q ? 'confirmedByName';
end;
$$;

-- The reviewer's questionnaire, APPROVE_REVIEW's.
create or replace function vitally_private.check_reviewer_questionnaire(q jsonb) returns boolean
language plpgsql immutable security definer set search_path='' as $$
begin
 if jsonb_typeof(q) is distinct from 'object' then
  return false;
 end if;
 if not (vitally_private.payload_keys(q)<@array['completedOn','exitForm','paForgiveness','remarks','signAppointmentAt','signMethod','wentOver','wentOverHow','wentOverOn']
   and vitally_private.payload_keys(q)@>array['completedOn','exitForm','paForgiveness','signMethod','wentOver']) then
  return false;
 end if;
 if vitally_private.payload_date(q,'completedOn') is null
  or jsonb_typeof(q->'paForgiveness') is distinct from 'string' or q->>'paForgiveness' not in ('eligible','not_eligible')
  or jsonb_typeof(q->'wentOver') is distinct from 'boolean'
  or jsonb_typeof(q->'signMethod') is distinct from 'string' or q->>'signMethod' not in ('portal','in_person') then
  return false;
 end if;
 if q->'wentOver'='true'::jsonb then
  if vitally_private.payload_date(q,'wentOverOn') is null then
   return false;
  end if;
  if q ? 'wentOverHow' and (jsonb_typeof(q->'wentOverHow') is distinct from 'string' or q->>'wentOverHow' not in ('in_person','phone','video','other')) then
   return false;
  end if;
 elsif q ? 'wentOverOn' or q ? 'wentOverHow' then
  return false;
 end if;
 if q ? 'signAppointmentAt' and vitally_private.payload_minute(q,'signAppointmentAt') is null then
  return false;
 end if;
 if q ? 'remarks' and not vitally_private.payload_text(q,'remarks',2000) then
  return false;
 end if;
 return vitally_private.check_exit_form(q->'exitForm');
end;
$$;

revoke all on function vitally_private.payload_date(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function vitally_private.payload_minute(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function vitally_private.check_exit_group(jsonb,boolean) from public,anon,authenticated,service_role;
revoke all on function vitally_private.check_exit_form(jsonb) from public,anon,authenticated,service_role;
revoke all on function vitally_private.check_preparer_questionnaire(jsonb) from public,anon,authenticated,service_role;
revoke all on function vitally_private.check_reviewer_questionnaire(jsonb) from public,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- check_payload, verbatim from 032 with SUBMIT_REVIEW and APPROVE_REVIEW out of
-- the empty-payload group, and a questionnaire for each of the three review
-- hand-offs.
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
  when 'MARK_READY_TO_EFILE','MARK_EFILED' then -- 032
   if vitally_private.payload_keys(p_payload)<>array['confirmed'] -- 032
    or p_payload->'confirmed'<>'true'::jsonb then -- 032
    raise sqlstate 'VT007' using message='VALIDATION'; -- 032
   end if; -- 032
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The three handlers (D5, D6, D10, D11, D12). Each is copied verbatim from
-- its newest definition; only the lines marked `-- 033` differ. The payload
-- shape was checked by check_payload already; these checks need the case.

-- D6: a TaxSlayer date runs from 1 January of the case's season (the
-- workspace's current season when the case has none) to the day after the
-- server's date, which absorbs time zones.
create or replace function vitally_private.check_taxslayer_date(p_case public.cases,d date) returns void -- 033
language plpgsql stable security definer set search_path='' as $$ -- 033
declare v_season int; -- 033
begin -- 033
 select coalesce(p_case.season,w.current_season) into v_season from public.workspaces w where w.id=p_case.workspace_id; -- 033
 if d is null or v_season is null or d<make_date(v_season,1,1) or d>current_date+1 then -- 033
  raise sqlstate 'VT007' using message='VALIDATION'; -- 033
 end if; -- 033
end; -- 033
$$; -- 033
revoke all on function vitally_private.check_taxslayer_date(public.cases,date) from public,anon,authenticated,service_role;

create or replace function vitally_private.act_submit_review(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_version bigint;
 v_q jsonb=p_payload->'questionnaire'; -- 033
begin
 if p_case.stage<>'preparing' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 perform vitally_private.require_case_preparer(p_case,p_person);
 -- Readiness: recorded intake, then no document still waiting on anybody.
 if not p_case.intake_verified then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 perform vitally_private.require_documents_settled(p_case);
 v_version=vitally_private.hand_to_review(p_case);
 perform vitally_private.check_taxslayer_date(p_case,vitally_private.payload_date(v_q,'readyForReviewOn')); -- 033
 insert into public.preparer_questionnaires(workspace_id,case_id,preparation_version,submitted_by_person_id,confirmed_by,confirmed_by_name,confirmed_method,shaded_parts_completed,state_forgiveness_set,ready_for_review_on) -- 033
 values(p_case.workspace_id,p_case.id,v_version,p_person.id,v_q->>'confirmedBy',btrim(v_q->>'confirmedByName'),v_q->>'confirmedMethod',true,true,vitally_private.payload_date(v_q,'readyForReviewOn')); -- 033
 -- The milestone is a manual one in external tax software; the client is told
 -- what happened in plain language, with no amounts and no findings.
 return jsonb_build_object('detail',jsonb_build_object('preparationVersion',v_version),
  'message','Your volunteer recorded that preparation is complete in the tax software. An independent reviewer will check it next.');
end;
$$;

create or replace function vitally_private.act_resubmit_review(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_review public.reviews;
 v_version bigint;
 v_q jsonb=p_payload->'questionnaire'; -- 033
begin
 if p_case.stage<>'corrections_required' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 perform vitally_private.require_case_preparer(p_case,p_person);
 -- Readiness, after the assignment, exactly as the first hand-off orders it.
 perform vitally_private.require_documents_settled(p_case);
 select * into v_review from public.reviews
  where workspace_id=p_case.workspace_id and case_id=p_case.id and status='corrections_requested'
  order by preparation_version desc,created_at desc limit 1 for update;
 if not found then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 update public.reviews set resolution=p_payload->>'resolution' where id=v_review.id;
 v_version=vitally_private.hand_to_review(p_case);
 perform vitally_private.check_taxslayer_date(p_case,vitally_private.payload_date(v_q,'readyForReviewOn')); -- 033
 insert into public.preparer_questionnaires(workspace_id,case_id,preparation_version,submitted_by_person_id,confirmed_by,confirmed_by_name,confirmed_method,shaded_parts_completed,state_forgiveness_set,ready_for_review_on) -- 033
 values(p_case.workspace_id,p_case.id,v_version,p_person.id,v_q->>'confirmedBy',btrim(v_q->>'confirmedByName'),v_q->>'confirmedMethod',true,true,vitally_private.payload_date(v_q,'readyForReviewOn')); -- 033
 return jsonb_build_object('detail',jsonb_build_object('reviewId',v_review.id,'preparationVersion',v_version),
  'message','Your volunteer recorded the requested corrections in the tax software. An independent reviewer will check the updated return.');
end;
$$;

-- Approval: the reviewer's answers are stored, a "no" opens the office's
-- go-over task (D5), the review-contact step is settled (D10) and the signing
-- plan is recorded for the client (D11). The client message is 021's.
create or replace function vitally_private.act_approve_review(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_review public.reviews;
 v_q jsonb=p_payload->'questionnaire'; -- 033
 v_went_over boolean=(p_payload->'questionnaire'->>'wentOver')::boolean; -- 033
 v_in_person boolean=p_payload->'questionnaire'->>'signMethod'='in_person'; -- 033
 v_same_day boolean=coalesce(p_case.answers->>'service'='same_day',false); -- 033
 v_appointment timestamp=vitally_private.payload_minute(p_payload->'questionnaire','signAppointmentAt'); -- 033
 v_assignee public.people; -- 033
 v_plan text; -- 033
begin
 if p_case.stage<>'reviewing' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 perform vitally_private.require_case_reviewer(p_case,p_person);
 v_review=vitally_private.lock_active_review(p_case,p_person);
 perform vitally_private.check_taxslayer_date(p_case,vitally_private.payload_date(v_q,'completedOn')); -- 033
 if v_went_over then -- 033
  perform vitally_private.check_taxslayer_date(p_case,vitally_private.payload_date(v_q,'wentOverOn')); -- 033
 end if; -- 033
 -- D6: an appointment is required for an in-person signing that is not the same day, and absent otherwise.
 if (v_in_person and not v_same_day)<>(v_appointment is not null) then -- 033
  raise sqlstate 'VT007' using message='VALIDATION'; -- 033
 end if; -- 033
 insert into public.reviewer_questionnaires(workspace_id,case_id,review_id,answered_by_person_id,completed_on,pa_forgiveness,went_over,went_over_on,went_over_how,sign_method,sign_appointment_at,exit_form,remarks) -- 033
 values(p_case.workspace_id,p_case.id,v_review.id,p_person.id,vitally_private.payload_date(v_q,'completedOn'),v_q->>'paForgiveness',v_went_over, -- 033
  vitally_private.payload_date(v_q,'wentOverOn'),v_q->>'wentOverHow',v_q->>'signMethod',v_appointment,v_q->'exitForm',btrim(v_q->>'remarks')); -- 033
 if not v_went_over then -- 033
  -- D5: the office takes the conversation over. The assignee is the workspace's
  -- configured follow-up person, found as act_escalate_contact (004) finds them.
  select p.* into v_assignee from public.people p -- 033
   join public.workspaces w on w.id=p.workspace_id and w.default_followup_person_id=p.id -- 033
   where w.id=p_case.workspace_id; -- 033
  if not found or not ('followup'=any(v_assignee.capabilities)) then -- 033
   raise sqlstate 'VT007' using message='VALIDATION'; -- 033
  end if; -- 033
  insert into public.admin_followups(workspace_id,case_id,request_id,purpose,assignee_person_id,reason,created_by_person_id) -- 033
  values(p_case.workspace_id,p_case.id,null,'go_over_return',v_assignee.id,'Go over the return with the client: the reviewer did not.',p_person.id); -- 033
 end if; -- 033
 -- D10: the contact step is settled at approval, never left pending.
 update public.reviews set status='approved',decided_at=now(),client_contact_status='completed', -- 033
  client_contacted_at=now(),client_contact_outcome=case when v_went_over then 'reached' else null end -- 033
  where id=v_review.id;
 -- D11: the plan the client reads, in the design's order.
 v_plan=case when not v_went_over then 'go_over_first' when not v_in_person then 'portal' -- 033
  when v_same_day then 'same_day' else 'appointment' end; -- 033
 -- The approving reviewer stays on the case: the contact task is theirs.
 update public.cases set stage='review_approved',signing_plan=v_plan, -- 033
  signing_appointment_at=case when v_plan='appointment' then v_appointment else null end where id=p_case.id; -- 033
 return jsonb_build_object('detail',jsonb_build_object('reviewId',v_review.id,'preparationVersion',v_review.preparation_version),
  'message','Your return has been checked by the reviewer. A volunteer will contact you soon to sign and file.');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6a. act_mark_ready_to_efile, verbatim from 032 (D13): signing waits for the
-- office's go-over while the case has an open go_over_return follow-up, whatever
-- outcome later resolves it. The client message is 032's.
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
 if exists(select 1 from public.admin_followups
   where workspace_id=p_case.workspace_id and case_id=p_case.id
    and purpose='go_over_return' and status='open') then -- 033
  raise sqlstate 'VT004' using message='INVALID_TRANSITION'; -- 033
 end if; -- 033
 update public.cases set stage='ready_to_efile' where id=p_case.id;
 return jsonb_build_object('detail','{}'::jsonb,
  'message','PCDC recorded that you signed Form 8879. Your return is ready to e-file.');
end; $$;

-- ---------------------------------------------------------------------------
-- 7. apply_fixture_scenario, verbatim from 031 (D8, D12): it also clears the
-- two questionnaire tables, seeds fictional answers for the review scenarios,
-- sets the sample's signing plan, and seeds the approved sample's contact step
-- as reached (so it is at once eligible for Mark ready to e-file). Changed lines
-- end `-- 033`.

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
 v_review uuid; -- 033
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
 delete from public.contact_attempts where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.contact_log where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.admin_followups where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.documents where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.document_requests where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.preparation_participants where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.reviewer_questionnaires where workspace_id=p_case.workspace_id and case_id=p_case.id; -- 033
 delete from public.preparer_questionnaires where workspace_id=p_case.workspace_id and case_id=p_case.id; -- 033
 delete from public.reviews where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.case_events where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.client_events where workspace_id=p_case.workspace_id and case_id=p_case.id;
 -- A sample's materials and document-card marks are office work on the sample,
 -- so a checkpoint clears them with the rest. `case_contacts` stays: it is the
 -- sample's own contact details, not scenario work.
 delete from public.case_materials where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.case_document_cards where workspace_id=p_case.workspace_id and case_id=p_case.id;

 -- Preparation has been claimed in every scenario but the first, and claiming
 -- is the participation threshold (contracts, "Authority and participation").
 if p_scenario<>'preparation_ready' then
  v_preparer=v_alex;
  insert into public.preparation_participants(workspace_id,case_id,person_id)
  values(p_case.workspace_id,p_case.id,v_alex);
 end if;

 -- One open request in the two document scenarios; a verified one, with the
 -- office's recorded receipt of the client's paper, in the review scenarios.
 if p_scenario in ('waiting_documents','admin_followup') then
  insert into public.document_requests(workspace_id,case_id,title,message,status,requested_by_person_id)
  values(p_case.workspace_id,p_case.id,'Mileage record','Please add the fictional sample.','open',v_alex)
  returning id into v_request;
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

 -- Review attempts. Findings and resolutions are internal staff text and live
 -- only here; no client-readable row carries a word of them.
 if p_scenario='corrections_required' then
  insert into public.reviews(workspace_id,case_id,preparation_version,reviewer_person_id,status,findings,decided_at,created_at)
  values(p_case.workspace_id,p_case.id,1,v_morgan,'corrections_requested',
   'Check the household size against the intake answers, and confirm the filing status before this comes back.',
   now()-interval '2 hours',now()-interval '4 hours');
 elsif p_scenario='review_approved' then
  insert into public.reviews(workspace_id,case_id,preparation_version,reviewer_person_id,status,findings,resolution,decided_at,created_at)
  values(p_case.workspace_id,p_case.id,1,v_morgan,'corrections_requested',
   'Check the household size against the intake answers, and confirm the filing status before this comes back.',
   'Corrected the household size and re-checked the filing status in the tax software.',
   now()-interval '6 hours',now()-interval '8 hours');
  -- Approved, with the client conversation the approval opens already done:
  -- the reviewer went over the return, so the contact step is reached and the
  -- case can be marked ready to e-file at once (D8, D10).
  insert into public.reviews(workspace_id,case_id,preparation_version,reviewer_person_id,status,decided_at,client_contact_status,client_contact_outcome,client_contacted_at,created_at) -- 033
  values(p_case.workspace_id,p_case.id,2,v_morgan,'approved',now()-interval '1 hour','completed','reached',now()-interval '1 hour',now()-interval '3 hours') -- 033
  returning id into v_review; -- 033
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
 end;
 if p_scenario='review_ready' or p_scenario='corrections_required' then v_version=1;
 end if;
 if p_scenario='review_approved' then
  v_version=2;
  v_reviewer=v_morgan;
 end if;

 -- Fictional questionnaire answers (D8): each version the sample reached has
 -- its preparer's hand-off, and the approved attempt has the reviewer's answers.
 if p_scenario in ('review_ready','corrections_required','review_approved') then -- 033
  insert into public.preparer_questionnaires(workspace_id,case_id,preparation_version,submitted_by_person_id, -- 033
    confirmed_by,confirmed_method,shaded_parts_completed,state_forgiveness_set,ready_for_review_on) -- 033
  values(p_case.workspace_id,p_case.id,1,v_alex,'client', -- 033
   case when p_scenario='review_approved' then 'in_person' else 'phone' end,true,true,current_date); -- 033
 end if; -- 033
 if p_scenario='review_approved' then -- 033
  insert into public.preparer_questionnaires(workspace_id,case_id,preparation_version,submitted_by_person_id, -- 033
    confirmed_by,confirmed_method,shaded_parts_completed,state_forgiveness_set,ready_for_review_on) -- 033
  values(p_case.workspace_id,p_case.id,2,v_alex,'client','phone',true,true,current_date); -- 033
  insert into public.reviewer_questionnaires(workspace_id,case_id,review_id,answered_by_person_id,completed_on, -- 033
    pa_forgiveness,went_over,went_over_on,went_over_how,sign_method,sign_appointment_at,exit_form,remarks) -- 033
  values(p_case.workspace_id,p_case.id,v_review,v_morgan,current_date, -- 033
   'eligible',true,current_date,'phone','portal',null, -- 033
   '{"federal":{"method":"efile","result":"refund","amount":"412.00","refundBy":"direct_deposit"},"state":null,"local":{"type":"NPT","method":"paper","result":"none"}}'::jsonb, -- 033
   null); -- 033
 end if; -- 033

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

 update public.cases set stage=v_stage,intake_verified=true,preparation_version=v_version,
  preparer_id=v_preparer,reviewer_id=v_reviewer,last_reminded_at=null,last_reminded_by_person_id=null,
  signing_plan=case when p_scenario='review_approved' then 'portal' end,signing_appointment_at=null, -- 033
  updated_at=now()
  where id=p_case.id;
 return v_total;
end;
$$;
