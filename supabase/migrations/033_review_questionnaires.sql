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
