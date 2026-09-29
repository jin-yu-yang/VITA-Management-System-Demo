-- Part 2: client numbers (docs/superpowers/specs/2026-09-29-client-numbers-design.md).
--
-- A submitted case gets the next number in its workspace's current season;
-- numbers are never reused (the counter never goes down, even when a reset
-- deletes the samples) and never change once set.
--
-- Written to be safe to apply again on a local test stack whose
-- schema_migrations row for this file was deleted during development: every
-- statement is `if not exists`, `create or replace`, or a drop-then-add, and
-- the backfill only numbers rows that have no number.

alter table public.workspaces add column if not exists current_season smallint not null default 2025;
alter table public.workspaces drop constraint if exists workspaces_current_season_range;
alter table public.workspaces add constraint workspaces_current_season_range
 check (current_season between 2000 and 2100);

alter table public.cases add column if not exists season smallint;
alter table public.cases add column if not exists client_number integer;
alter table public.cases drop constraint if exists cases_client_number_pair;
alter table public.cases add constraint cases_client_number_pair
 check ((season is null and client_number is null)
     or (season is not null and client_number is not null and client_number > 0));
alter table public.cases drop constraint if exists cases_client_number_key;
alter table public.cases add constraint cases_client_number_key unique (workspace_id, season, client_number);

-- The last number handed out per (workspace, season). Private: only the
-- security-definer functions below read or write it.
create table if not exists vitally_private.client_number_counters (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 season smallint not null,
 last_number integer not null default 0 check (last_number >= 0),
 primary key (workspace_id, season)
);
revoke all on vitally_private.client_number_counters from public, anon, authenticated, service_role;

-- `create or replace` cannot change a function's return type, so a re-apply
-- during development drops the two table-returning functions first. Nothing
-- stores a reference to them: the trigger body names next_client_number by
-- text and resolves it when it runs.
drop function if exists vitally_private.next_client_number(uuid);
drop function if exists vitally_private.backfill_client_numbers(uuid);

-- The next number in the workspace's current season. The UPDATE locks the
-- counter row until the calling transaction ends, so two submits at once
-- queue here and get consecutive numbers; a rollback returns nothing to use.
create or replace function vitally_private.next_client_number(p_workspace_id uuid)
returns table(season smallint, client_number integer)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare v_season smallint;
begin
 select w.current_season into v_season from public.workspaces w where w.id=p_workspace_id;
 if v_season is null then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 insert into vitally_private.client_number_counters as c (workspace_id, season)
  values (p_workspace_id, v_season) on conflict do nothing;
 return query
  update vitally_private.client_number_counters c set last_number = c.last_number + 1
   where c.workspace_id = p_workspace_id and c.season = v_season
   returning c.season, c.last_number;
end;
$$;

-- One trigger for both rules. A number, once set, never changes. A case
-- leaving draft for anything but `closed` is being submitted (or seeded as a
-- sample, which is inserted as a draft and then moved to its stage) and takes
-- the next number. Closing an unowned draft is the one exit that is not a
-- submission, so it takes none.
create or replace function vitally_private.cases_client_number()
returns trigger language plpgsql security definer set search_path='' as $$
declare v record;
begin
 if old.client_number is not null then
  if new.client_number is distinct from old.client_number or new.season is distinct from old.season then
   raise sqlstate 'VT007' using message='VALIDATION';
  end if;
  return new;
 end if;
 if old.stage = 'draft' and new.stage not in ('draft', 'closed') and new.client_number is null then
  select * into v from vitally_private.next_client_number(new.workspace_id);
  new.season = v.season;
  new.client_number = v.client_number;
 end if;
 return new;
end;
$$;
drop trigger if exists cases_client_number on public.cases;
create trigger cases_client_number before update on public.cases
 for each row execute function vitally_private.cases_client_number();

-- Numbers every case that was submitted (a SUBMIT row in its history) or is a
-- sample past draft, and has none yet: samples first in fixture_keys() order,
-- then the rest in the order they were submitted. A
-- closed draft the office never sent has no SUBMIT row and stays unnumbered.
-- `p_workspace_id` null means every workspace. Returns how many it numbered.
create or replace function vitally_private.backfill_client_numbers(p_workspace_id uuid default null)
returns int language plpgsql security definer set search_path='' as $$
declare r record; v record; n int = 0;
begin
 for r in
  select c.id, c.workspace_id
  from public.cases c
  left join lateral (
   select min(e.created_at) as at from public.case_events e
   where e.case_id = c.id and e.action = 'SUBMIT'
  ) s on true
  where c.client_number is null and c.stage <> 'draft'
   and (s.at is not null or c.fixture)
   and (p_workspace_id is null or c.workspace_id = p_workspace_id)
  -- Samples first, in fixture_keys() order, exactly as a reset numbers them:
  -- their seeded SUBMIT times depend on each scenario's history length, so
  -- history order would not match. Then everything else in submit order.
  order by c.workspace_id, (not c.fixture),
   array_position(vitally_private.fixture_keys(), c.fixture_key) nulls last,
   coalesce(s.at, c.created_at), c.reference
 loop
  select * into v from vitally_private.next_client_number(r.workspace_id);
  update public.cases set season = v.season, client_number = v.client_number where id = r.id;
  n = n + 1;
 end loop;
 return n;
end;
$$;

-- act_submit, verbatim from 003 apart from the two lines marked (1) and (2):
-- it reads back the number the trigger assigned and records it in the event.
create or replace function vitally_private.act_submit(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_answers jsonb=p_case.answers;
 v_number integer;
begin
 if p_case.stage<>'draft' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 if exists(select 1 from unnest(array['service','year','language','residenceCity','residenceState','firstName','lastName','address','city','state','zip','household','helper','documents']) k
  where coalesce(btrim(v_answers->>k),'')='') then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 if v_answers->>'year'<>'2025' or v_answers->>'residenceState'='Other' or v_answers->>'helper'<>'self' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 -- screening() continues only on a complete, supported screen.
 if coalesce(v_answers->>'rideshare','') not in ('yes','no')
  or coalesce(v_answers->>'other','') not in ('yes','no')
  or coalesce(v_answers->>'stocks','') not in ('yes','no')
  or v_answers->>'other'='yes' or v_answers->>'stocks'='yes' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 update public.cases set stage='received' where id=p_case.id returning client_number into v_number; -- (1)
 return jsonb_build_object('detail',jsonb_build_object('screening','continue','clientNumber',v_number), -- (2)
  'message','Application received. A volunteer will check your information and documents.');
end;
$$;

select vitally_private.backfill_client_numbers();

revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
