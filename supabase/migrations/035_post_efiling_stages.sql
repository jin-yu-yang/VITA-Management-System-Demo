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
--   | vitally_private.check_payload              | 034                       | (later task) |
--   | vitally_private.fixture_history            | 034                       | (later task) |
--   | vitally_private.apply_fixture_scenario     | 033                       | (later task) |
--   | vitally_private.act_mark_efiled            | 032                       | (later task) |
--   | vitally_private.act_close_case             | 032                       | (later task) |
--   | vitally_private.check_operation_authority  | 032                       | (later task) |
--   | vitally_private.vitally_apply_action       | 032                       | (later task) |
--   | vitally_private.fixture_keys               | 009                       | (later task) |
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
-- 3. filing_attempts: one row per time the case was filed. Only the action RPC
-- writes it; the select policy is 013's presenter-only one.

create table if not exists public.filing_attempts (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null,
 attempt int not null check(attempt>=1),
 filed_at timestamptz not null default now(),
 filed_by uuid not null,
 unique(case_id,attempt),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(workspace_id,filed_by) references public.people(workspace_id,id)
);
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
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
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
 foreign key(workspace_id,recorded_by) references public.people(workspace_id,id)
);
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
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null,
 attempt int not null,
 note text not null check(char_length(note) between 1 and 1000),
 recorded_by uuid not null,
 recorded_at timestamptz not null default now(),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(case_id,attempt) references public.filing_attempts(case_id,attempt) on delete cascade,
 foreign key(workspace_id,recorded_by) references public.people(workspace_id,id)
);
alter table public.filing_notes enable row level security;
drop policy if exists presenter_filing_notes on public.filing_notes;
create policy presenter_filing_notes on public.filing_notes for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=filing_notes.case_id where m.workspace_id=filing_notes.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')));
revoke all on public.filing_notes from public, anon, authenticated;
grant select on public.filing_notes to authenticated;
grant select, insert, update, delete on public.filing_notes to service_role;

create or replace function vitally_private.filing_notes_append_only() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- A note goes only with its case: when the case itself is being deleted (a
 -- workspace teardown), the cascade is allowed through.
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
