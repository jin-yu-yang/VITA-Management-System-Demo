-- Identity foundation only. Workflow RPCs and Realtime are later migrations.
create schema if not exists vitally_private;
revoke all on schema vitally_private from public, anon, authenticated, service_role;
-- Global default EXECUTE must be revoked globally, not merely per schema.
alter default privileges revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges in schema public revoke all on functions from anon, authenticated, service_role;
alter default privileges in schema vitally_private revoke all on functions from public, anon, authenticated, service_role;
alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema vitally_private revoke all on tables from public, anon, authenticated, service_role;

create table public.workspaces (
 id uuid primary key,
 default_followup_person_id uuid,
 fixture_generation bigint not null default 0 check(fixture_generation>=0)
);
create table public.memberships (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 access text not null check(access in ('applicant','presenter')),
 active boolean not null default true,
 primary key(workspace_id,user_id)
);
create unique index memberships_one_active_workspace on public.memberships(user_id) where active;
create table public.people (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 person_key text not null check(person_key ~ '^[a-z][a-z0-9_]{0,39}$'),
 name text not null check(length(name) between 1 and 80),
 capabilities text[] not null check(capabilities <@ array['prepare','review','admin','followup','receive_documents','assist']::text[]),
 unique(workspace_id,person_key), unique(workspace_id,id)
);
alter table public.workspaces add constraint workspaces_default_person_same_workspace
 foreign key(id,default_followup_person_id) references public.people(workspace_id,id) deferrable initially deferred;
create table vitally_private.fixture_client_bindings (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 fixture_key text not null check(fixture_key in ('preparation_ready','waiting_documents','admin_followup','review_ready','corrections_required','review_approved')),
 owner_user_id uuid not null,
 primary key(workspace_id,fixture_key),
 foreign key(workspace_id,owner_user_id) references public.memberships(workspace_id,user_id)
);
create table vitally_private.test_workspaces (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 run_id uuid not null,
 test_overrides_applied boolean not null default false
);
create table public.cases (
 id uuid primary key default gen_random_uuid(),
 reference text not null constraint cases_reference_key unique,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 owner_user_id uuid,
 fixture boolean not null default false,
 fixture_key text,
 origin text not null check(origin in ('client','assisted','fixture')),
 created_by_user_id uuid not null references auth.users(id),
 created_by_person_id uuid,
 answers jsonb not null default '{}'::jsonb check(jsonb_typeof(answers)='object'),
 stage text not null default 'draft' check(stage in ('draft','received','preparation_ready','preparing','review_ready','reviewing','corrections_required','review_approved','closed')),
 revision bigint not null default 1 check(revision>=1),
 preparation_version bigint not null default 0 check(preparation_version>=0),
 intake_verified boolean not null default false,
 preparer_id uuid,
 reviewer_id uuid,
 constraint cases_reference_format check(reference ~ '^VT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
 constraint cases_fixture_key check((not fixture and fixture_key is null) or (fixture and fixture_key is not null and fixture_key in ('preparation_ready','waiting_documents','admin_followup','review_ready','corrections_required','review_approved'))),
 constraint cases_origin_owner check((origin='client' and owner_user_id is not null and created_by_person_id is null) or (origin='assisted' and owner_user_id is null and created_by_person_id is not null) or (origin='fixture' and fixture)),
 foreign key(workspace_id,owner_user_id) references public.memberships(workspace_id,user_id),
 foreign key(workspace_id,created_by_person_id) references public.people(workspace_id,id),
 foreign key(workspace_id,preparer_id) references public.people(workspace_id,id),
 foreign key(workspace_id,reviewer_id) references public.people(workspace_id,id),
 unique(workspace_id,id)
);
create unique index cases_one_fixture_key on public.cases(workspace_id,fixture_key) where fixture;
create index cases_owner on public.cases(workspace_id,owner_user_id);
create table public.action_receipts (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 actor_user_id uuid not null,
 action_id uuid not null,
 operation text not null,
 request_digest text not null,
 target_id uuid,
 target_reference text,
 actor_person_id uuid,
 generation bigint not null,
 receipt jsonb,
 unique(workspace_id,actor_user_id,action_id)
);
-- Receipt targets and actors are historical scalars: reset never cascades to them.

alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.people enable row level security;
alter table public.cases enable row level security;
alter table public.action_receipts enable row level security;
create policy own_membership on public.memberships for select to authenticated using(user_id=(select auth.uid()) and active);
create policy member_workspace on public.workspaces for select to authenticated using(exists(select 1 from public.memberships m where m.workspace_id=id and m.user_id=(select auth.uid()) and m.active));
create policy presenter_people on public.people for select to authenticated using(exists(select 1 from public.memberships m where m.workspace_id=people.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter'));
create policy visible_cases on public.cases for select to authenticated using(exists(select 1 from public.memberships m where m.workspace_id=cases.workspace_id and m.user_id=(select auth.uid()) and m.active and ((m.access='applicant' and cases.owner_user_id=m.user_id) or (m.access='presenter' and (cases.origin<>'client' or cases.stage<>'draft')))));
revoke all on public.workspaces,public.memberships,public.people,public.cases,public.action_receipts from public,anon,authenticated;
grant select on public.workspaces,public.memberships,public.people,public.cases to authenticated;
grant usage on schema public to service_role;
grant select,insert,update,delete on public.workspaces,public.memberships,public.people,public.cases,public.action_receipts to service_role;
revoke all on all tables in schema vitally_private from public,anon,authenticated,service_role;

create function vitally_private.initialize_workspace(p_workspace_id uuid,p_presenters uuid[],p_applicants uuid[],p_bindings jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_new boolean;
 v_person record;
 v_existing public.people;
 v_id uuid;
 v_access text;
 v_member record;
 v_binding record;
 v_people jsonb='{}'::jsonb;
 v_default uuid;
begin
 if p_workspace_id is null or p_presenters is null or p_applicants is null or p_bindings is null or jsonb_typeof(p_bindings)<>'object' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,0));
 if exists(select 1 from vitally_private.test_workspaces where workspace_id=p_workspace_id and test_overrides_applied) then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 if exists(select 1 from unnest(p_presenters||p_applicants) u where u is null) or cardinality(p_presenters||p_applicants)<>(select count(distinct u) from unnest(p_presenters||p_applicants) u) then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 if exists(select 1 from unnest(p_presenters||p_applicants) u where not exists(select 1 from auth.users a where a.id=u)) then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 select not exists(select 1 from public.workspaces where id=p_workspace_id) into v_new;
 insert into public.workspaces(id) values(p_workspace_id) on conflict do nothing;
 if not v_new and (select count(*) from public.people where workspace_id=p_workspace_id)<>3 then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 for v_person in select * from (values ('alex','Alex',array['prepare']),('morgan','Morgan',array['review']),('sam','Sam',array['admin','assist','followup','receive_documents'])) x(key,name,caps) loop
  select * into v_existing from public.people where workspace_id=p_workspace_id and person_key=v_person.key;
  if found then
   if v_existing.name<>v_person.name or v_existing.capabilities<>v_person.caps then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
   v_id=v_existing.id;
  else
   if not v_new then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
   insert into public.people(workspace_id,person_key,name,capabilities) values(p_workspace_id,v_person.key,v_person.name,v_person.caps) returning id into v_id;
  end if;
  v_people=v_people||jsonb_build_object(v_person.key,v_id);
 end loop;
 select default_followup_person_id into v_default from public.workspaces where id=p_workspace_id;
 if not v_new and v_default is distinct from (v_people->>'sam')::uuid then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 for v_member in select u as id,'presenter' as access from unnest(p_presenters) u union all select u,'applicant' from unnest(p_applicants) u loop
  if exists(select 1 from public.memberships where user_id=v_member.id and active and workspace_id<>p_workspace_id) then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
  if exists(select 1 from public.memberships where user_id=v_member.id and workspace_id=p_workspace_id and (access<>v_member.access or not active)) then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
  insert into public.memberships(workspace_id,user_id,access) values(p_workspace_id,v_member.id,v_member.access) on conflict do nothing;
 end loop;
 for v_binding in select * from jsonb_each_text(p_bindings) loop
  if v_binding.key not in ('preparation_ready','waiting_documents','admin_followup','review_ready','corrections_required','review_approved') or v_binding.value is null or v_binding.value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
  if not exists(select 1 from public.memberships where workspace_id=p_workspace_id and user_id=v_binding.value::uuid and active and access='applicant') then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
  if exists(select 1 from vitally_private.fixture_client_bindings where workspace_id=p_workspace_id and fixture_key=v_binding.key and owner_user_id<>v_binding.value::uuid) then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
  insert into vitally_private.fixture_client_bindings values(p_workspace_id,v_binding.key,v_binding.value::uuid) on conflict do nothing;
 end loop;
 update public.workspaces set default_followup_person_id=(v_people->>'sam')::uuid where id=p_workspace_id;
 return jsonb_build_object('workspaceId',p_workspace_id,'people',v_people);
end;
$$;
revoke all on function vitally_private.initialize_workspace(uuid,uuid[],uuid[],jsonb) from public,anon,authenticated,service_role;

create function public.vitally_create_case(p_action_id uuid,p_mode text,p_person_id uuid,p_answers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.memberships;
 v_user uuid=auth.uid();
 v_digest text;
 v_receipt public.action_receipts;
 v_case uuid;
 v_reference text;
 v_result jsonb;
 v_generation bigint;
 v_random bytea;
 v_constraint text;
 v_owner uuid;
 v_capabilities text[];
begin
 select * into v_member from public.memberships where user_id=v_user and active for share;
 if v_user is null or not found then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 if p_mode='client' then
  if v_member.access<>'applicant' or p_person_id is not null then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
  v_owner=v_user;
 elsif p_mode='assisted' then
  if v_member.access<>'presenter' then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
  select capabilities into v_capabilities from public.people where id=p_person_id and workspace_id=v_member.workspace_id;
  if not found then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
  if not ('admin'=any(v_capabilities)) then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 else raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 if p_action_id is null or p_answers is null or jsonb_typeof(p_answers)<>'object' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 if exists(select 1 from jsonb_each(p_answers) a where a.key not in ('service','year','language','residenceCity','residenceState','city','state','rideshare','stocks','other','helper','documents','firstName','lastName','address','zip','household') or jsonb_typeof(a.value)<>'string' or length(a.value#>>'{}')>1000) then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 v_digest=encode(extensions.digest(jsonb_build_object('operation','CREATE_CASE','mode',p_mode,'personId',p_person_id,'answers',p_answers)::text,'sha256'),'hex');
 select fixture_generation into v_generation from public.workspaces where id=v_member.workspace_id;
 insert into public.action_receipts(workspace_id,actor_user_id,action_id,operation,request_digest,actor_person_id,generation)
 values(v_member.workspace_id,v_user,p_action_id,'CREATE_CASE',v_digest,p_person_id,v_generation) on conflict(workspace_id,actor_user_id,action_id) do nothing;
 select * into v_receipt from public.action_receipts where workspace_id=v_member.workspace_id and actor_user_id=v_user and action_id=p_action_id for update;
 if v_receipt.operation<>'CREATE_CASE' or v_receipt.request_digest<>v_digest then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 if v_receipt.receipt is not null then return v_receipt.receipt;
 end if;
 loop
  v_random=extensions.gen_random_bytes(8);v_reference='VT-';
  for i in 0..7 loop
   if i=4 then v_reference=v_reference||'-';
 end if;
   v_reference=v_reference||substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',get_byte(v_random,i)%32+1,1);
  end loop;
  begin
   insert into public.cases(reference,workspace_id,owner_user_id,fixture,origin,created_by_user_id,created_by_person_id,answers)
   values(v_reference,v_member.workspace_id,v_owner,false,p_mode,v_user,p_person_id,p_answers) returning id into v_case;
   exit;
  exception when unique_violation then
   get stacked diagnostics v_constraint=constraint_name;
   if v_constraint<>'cases_reference_key' then raise;
 end if;
  end;
 end loop;
 v_result=jsonb_build_object('actionId',p_action_id,'caseId',v_case,'reference',v_reference,'revision',1);
 update public.action_receipts set target_id=v_case,target_reference=v_reference,receipt=v_result where id=v_receipt.id;
 return v_result;
end;
$$;
revoke all on function public.vitally_create_case(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vitally_create_case(uuid,text,uuid,jsonb) to authenticated;
revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
