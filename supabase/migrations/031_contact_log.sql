-- OpenSpec change add-contact-log (openspec/changes/add-contact-log/design.md,
-- D1-D6, D11, D12): a staff-only contact log beside the case actions.
--
--   * `contact_log` holds each entry's current version and
--     `contact_log_versions` every version, the first included. Staff read
--     both through RLS; no browser role writes or deletes either.
--   * Two RPCs, `vitally_log_contact` and `vitally_edit_contact`, run the
--     ordered checks of the case actions (membership, envelope, receipt, target,
--     authority, revision, entry) without touching the case row, its history
--     or the shared case-action helpers.
--   * The office's follow-up attempts (`contact_attempts`) are moved into the
--     log once, linked to their task; the table stays, empty.
--   * `act_record_contact` refuses every new RECORD_CONTACT (D12), and
--     `apply_fixture_scenario` clears a sample's entries and seeds the sample
--     follow-up's call as a log entry (D6).
--
-- Written to be safe to apply again on a local test stack whose
-- schema_migrations row for this file was deleted during development: every
-- statement is `if not exists`, `create or replace`, or a drop-then-add, and
-- the move finds nothing left to move the second time.

-- ---------------------------------------------------------------------------
-- 1. The tables (D4). The entry rules are spelled out on both tables; the
-- contact time's upper bound needs now(), so it is check_contact_entry's alone.

create table if not exists public.contact_log (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null,
 followup_id uuid,
 logged_by_user_id uuid not null,
 logged_by_person_id uuid not null,
 logged_at timestamptz not null default now(),
 revision bigint not null default 1 check (revision >= 1),
 edited_at timestamptz,
 direction text not null check (direction in ('outgoing','incoming')),
 contacted_at timestamptz not null,
 with_whom text not null check (with_whom in ('client','spouse','other')),
 other_name text,
 method text not null check (method in ('phone','text','email','in_person','video')),
 purpose text not null check (purpose in ('go_over_return','ask_question','request_documents','schedule_appointment','other')),
 outcome text not null check (outcome in ('reached','no_answer','left_voicemail','wrong_number','sent','replied','failed')),
 note text,
 constraint contact_log_edited check ((revision = 1) = (edited_at is null)),
 constraint contact_log_other_name check ((with_whom = 'other') = (other_name is not null)
  and (other_name is null or (length(other_name) between 1 and 80 and btrim(other_name) = other_name))),
 constraint contact_log_note check (note is null or (length(note) between 1 and 1000 and btrim(note) <> '')),
 constraint contact_log_outcome check (case
  when direction = 'incoming' or method = 'in_person' then outcome = 'reached'
  when method in ('phone','video') then outcome in ('reached','no_answer','left_voicemail','wrong_number')
  else outcome in ('sent','replied','failed') end),
 unique (workspace_id, case_id, id),
 foreign key (workspace_id, case_id) references public.cases(workspace_id, id) on delete cascade,
 foreign key (workspace_id, case_id, followup_id) references public.admin_followups(workspace_id, case_id, id) on delete cascade,
 foreign key (workspace_id, logged_by_user_id) references public.memberships(workspace_id, user_id),
 foreign key (workspace_id, logged_by_person_id) references public.people(workspace_id, id)
);
create index if not exists contact_log_case_contacted on public.contact_log(case_id, contacted_at);
create index if not exists contact_log_followup on public.contact_log(followup_id);

create table if not exists public.contact_log_versions (
 contact_id uuid not null,
 version bigint not null check (version >= 1),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null,
 edited_by_user_id uuid not null,
 edited_by_person_id uuid not null,
 created_at timestamptz not null default now(),
 direction text not null check (direction in ('outgoing','incoming')),
 contacted_at timestamptz not null,
 with_whom text not null check (with_whom in ('client','spouse','other')),
 other_name text,
 method text not null check (method in ('phone','text','email','in_person','video')),
 purpose text not null check (purpose in ('go_over_return','ask_question','request_documents','schedule_appointment','other')),
 outcome text not null check (outcome in ('reached','no_answer','left_voicemail','wrong_number','sent','replied','failed')),
 note text,
 constraint contact_log_versions_other_name check ((with_whom = 'other') = (other_name is not null)
  and (other_name is null or (length(other_name) between 1 and 80 and btrim(other_name) = other_name))),
 constraint contact_log_versions_note check (note is null or (length(note) between 1 and 1000 and btrim(note) <> '')),
 constraint contact_log_versions_outcome check (case
  when direction = 'incoming' or method = 'in_person' then outcome = 'reached'
  when method in ('phone','video') then outcome in ('reached','no_answer','left_voicemail','wrong_number')
  else outcome in ('sent','replied','failed') end),
 primary key (contact_id, version),
 foreign key (workspace_id, case_id, contact_id) references public.contact_log(workspace_id, case_id, id) on delete cascade,
 foreign key (workspace_id, edited_by_user_id) references public.memberships(workspace_id, user_id),
 foreign key (workspace_id, edited_by_person_id) references public.people(workspace_id, id)
);

-- ---------------------------------------------------------------------------
-- 2. Staff-only reads (D5): 013's `presenter_case_materials` policy, renamed.
-- An applicant reads no row, and a presenter never sees a private client
-- draft's. Only the two RPCs write.

alter table public.contact_log enable row level security;
drop policy if exists presenter_contact_log on public.contact_log;
create policy presenter_contact_log on public.contact_log for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=contact_log.case_id where m.workspace_id=contact_log.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')));
revoke all on public.contact_log from public, anon, authenticated;
grant select on public.contact_log to authenticated;
grant select, insert, update, delete on public.contact_log to service_role;

alter table public.contact_log_versions enable row level security;
drop policy if exists presenter_contact_log_versions on public.contact_log_versions;
create policy presenter_contact_log_versions on public.contact_log_versions for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=contact_log_versions.case_id where m.workspace_id=contact_log_versions.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')));
revoke all on public.contact_log_versions from public, anon, authenticated;
grant select on public.contact_log_versions to authenticated;
grant select, insert, update, delete on public.contact_log_versions to service_role;

-- Realtime, with 007's pattern: INSERT and UPDATE only, under the same RLS.
do $$
declare v_table text;
begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
  raise exception 'The supabase_realtime publication is missing; enable Realtime on this project before migrating.';
 end if;
 foreach v_table in array array['contact_log','contact_log_versions'] loop
  if not exists(
   select 1 from pg_publication_tables
   where pubname='supabase_realtime' and schemaname='public' and tablename=v_table
  ) then
   execute format('alter publication supabase_realtime add table public.%I', v_table);
  end if;
 end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The entry rules (D4). Raises VALIDATION on any broken rule; returns the
-- entry with a blank note as null and the other person's name trimmed (a
-- blank name is no name). The contact time must carry its UTC offset, so the
-- instant never depends on the session's time zone.

create or replace function vitally_private.check_contact_entry(p_entry jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_at timestamptz;
 v_name text;
 v_note text;
 v_direction text=p_entry->>'direction';
 v_method text=p_entry->>'method';
 v_outcome text=p_entry->>'outcome';
 v_allowed boolean;
begin
 if p_entry is null or jsonb_typeof(p_entry)<>'object'
  or vitally_private.payload_keys(p_entry)<>array['contactedAt','direction','method','note','otherName','outcome','purpose','withWhom']
  or exists(select 1 from pg_catalog.unnest(array['contactedAt','direction','method','outcome','purpose','withWhom']) k
   where jsonb_typeof(p_entry->k)<>'string')
  or jsonb_typeof(p_entry->'otherName') not in ('string','null')
  or jsonb_typeof(p_entry->'note') not in ('string','null')
  or v_direction not in ('outgoing','incoming')
  or p_entry->>'withWhom' not in ('client','spouse','other')
  or v_method not in ('phone','text','email','in_person','video')
  or p_entry->>'purpose' not in ('go_over_return','ask_question','request_documents','schedule_appointment','other')
  or p_entry->>'contactedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 begin
  v_at=(p_entry->>'contactedAt')::timestamptz;
 exception when others then
  raise sqlstate 'VT007' using message='VALIDATION';
 end;
 if v_at>now()+interval '5 minutes' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 v_name=nullif(btrim(p_entry->>'otherName'),'');
 if (p_entry->>'withWhom'='other') <> (v_name is not null) or length(v_name)>80 then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 v_note=case when btrim(p_entry->>'note')<>'' then p_entry->>'note' end;
 if length(v_note)>1000 then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 -- The outcome follows the method, as the tables' outcome check reads it.
 v_allowed=case
  when v_direction='incoming' or v_method='in_person' then v_outcome='reached'
  when v_method in ('phone','video') then v_outcome in ('reached','no_answer','left_voicemail','wrong_number')
  else v_outcome in ('sent','replied','failed') end;
 if not v_allowed then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 return p_entry||jsonb_build_object('otherName',v_name,'note',v_note);
end;
$$;

-- Who is logging or editing (D2): a presenter, naming a persona of their own
-- workspace. Any capability.
create or replace function vitally_private.contact_person(p_member public.memberships,p_person_id uuid)
returns public.people language plpgsql stable security definer set search_path='' as $$
declare v_person public.people;
begin
 if p_member.access<>'presenter' or p_person_id is null then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 select * into v_person from public.people where workspace_id=p_member.workspace_id and id=p_person_id;
 if not found then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 return v_person;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Log a contact (D1-D3). Neither RPC touches `cases`, `case_events` or
-- `client_events`: the entry has its own revision. Any raise rolls back the
-- whole statement, reserved receipt included.

create or replace function public.vitally_log_contact(p_action_id uuid,p_case_id uuid,p_person_id uuid,p_followup_id uuid,p_entry jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.memberships;
 v_receipt public.action_receipts;
 v_case public.cases;
 v_person public.people;
 v_entry jsonb;
 v_digest text;
 v_id uuid;
 v_result jsonb;
begin
 v_member=vitally_private.require_membership();
 if p_action_id is null or p_case_id is null or p_entry is null or jsonb_typeof(p_entry)<>'object' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 -- Staff only: an applicant is refused before any target is read.
 if v_member.access<>'presenter' or p_person_id is null then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 v_digest=encode(extensions.digest(jsonb_build_object('operation','LOG_CONTACT','caseId',p_case_id,'personId',p_person_id,
  'followupId',p_followup_id,'entry',p_entry)::text,'sha256'),'hex');
 v_receipt=vitally_private.reserve_receipt(v_member,p_action_id,'LOG_CONTACT',v_digest,p_person_id);
 -- An identical accepted replay returns its receipt after re-checking the
 -- persona, without reaching the target.
 if v_receipt.receipt is not null then
  perform vitally_private.contact_person(v_member,p_person_id);
  return v_receipt.receipt;
 end if;
 v_case=vitally_private.lock_case(v_member,p_case_id);
 v_person=vitally_private.contact_person(v_member,p_person_id);
 -- A contact linked to a follow-up task keeps RECORD_CONTACT's rule: the
 -- task's assignee, holding `followup`, on an open task.
 if p_followup_id is not null then
  if not ('followup'=any(v_person.capabilities)) then
   raise sqlstate 'VT001' using message='FORBIDDEN';
  end if;
  perform vitally_private.lock_open_followup(v_case,v_person,jsonb_build_object('followupId',p_followup_id));
 end if;
 v_entry=vitally_private.check_contact_entry(p_entry);
 insert into public.contact_log(workspace_id,case_id,followup_id,logged_by_user_id,logged_by_person_id,
   direction,contacted_at,with_whom,other_name,method,purpose,outcome,note)
 values(v_case.workspace_id,v_case.id,p_followup_id,v_member.user_id,v_person.id,
   v_entry->>'direction',(v_entry->>'contactedAt')::timestamptz,v_entry->>'withWhom',v_entry->>'otherName',
   v_entry->>'method',v_entry->>'purpose',v_entry->>'outcome',v_entry->>'note')
 returning id into v_id;
 insert into public.contact_log_versions(contact_id,version,workspace_id,case_id,edited_by_user_id,edited_by_person_id,created_at,
   direction,contacted_at,with_whom,other_name,method,purpose,outcome,note)
 select l.id,1,l.workspace_id,l.case_id,l.logged_by_user_id,l.logged_by_person_id,l.logged_at,
   l.direction,l.contacted_at,l.with_whom,l.other_name,l.method,l.purpose,l.outcome,l.note
 from public.contact_log l where l.id=v_id;
 v_result=jsonb_build_object('actionId',p_action_id,'contactId',v_id,'caseId',v_case.id,'revision',1);
 update public.action_receipts set target_id=v_id,receipt=v_result where id=v_receipt.id;
 return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Edit a contact (D2, D4): the logger or an admin, against the current
-- revision. Every edit appends the next version; the logger, the logged-at
-- time and the task link never change.

create or replace function public.vitally_edit_contact(p_action_id uuid,p_contact_id uuid,p_expected_revision bigint,p_person_id uuid,p_entry jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.memberships;
 v_receipt public.action_receipts;
 v_contact public.contact_log;
 v_case public.cases;
 v_person public.people;
 v_entry jsonb;
 v_digest text;
 v_revision bigint;
 v_result jsonb;
begin
 v_member=vitally_private.require_membership();
 if p_action_id is null or p_contact_id is null or p_expected_revision is null
  or p_entry is null or jsonb_typeof(p_entry)<>'object' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 if v_member.access<>'presenter' or p_person_id is null then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 v_digest=encode(extensions.digest(jsonb_build_object('operation','EDIT_CONTACT','contactId',p_contact_id,
  'expectedRevision',p_expected_revision,'personId',p_person_id,'entry',p_entry)::text,'sha256'),'hex');
 v_receipt=vitally_private.reserve_receipt(v_member,p_action_id,'EDIT_CONTACT',v_digest,p_person_id);
 if v_receipt.receipt is not null then
  perform vitally_private.contact_person(v_member,p_person_id);
  return v_receipt.receipt;
 end if;
 select * into v_contact from public.contact_log
  where id=p_contact_id and workspace_id=v_member.workspace_id for update;
 if not found then
  raise sqlstate 'VT002' using message='NOT_FOUND';
 end if;
 v_case=vitally_private.lock_case(v_member,v_contact.case_id);
 v_person=vitally_private.contact_person(v_member,p_person_id);
 if v_contact.logged_by_person_id is distinct from v_person.id and not ('admin'=any(v_person.capabilities)) then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 if v_contact.revision<>p_expected_revision then
  raise sqlstate 'VT003' using message='CONFLICT';
 end if;
 v_entry=vitally_private.check_contact_entry(p_entry);
 v_revision=v_contact.revision+1;
 insert into public.contact_log_versions(contact_id,version,workspace_id,case_id,edited_by_user_id,edited_by_person_id,created_at,
   direction,contacted_at,with_whom,other_name,method,purpose,outcome,note)
 values(v_contact.id,v_revision,v_contact.workspace_id,v_contact.case_id,v_member.user_id,v_person.id,now(),
   v_entry->>'direction',(v_entry->>'contactedAt')::timestamptz,v_entry->>'withWhom',v_entry->>'otherName',
   v_entry->>'method',v_entry->>'purpose',v_entry->>'outcome',v_entry->>'note');
 update public.contact_log set direction=v_entry->>'direction',contacted_at=(v_entry->>'contactedAt')::timestamptz,
   with_whom=v_entry->>'withWhom',other_name=v_entry->>'otherName',method=v_entry->>'method',
   purpose=v_entry->>'purpose',outcome=v_entry->>'outcome',note=v_entry->>'note',
   revision=v_revision,edited_at=now()
  where id=v_contact.id;
 v_result=jsonb_build_object('actionId',p_action_id,'contactId',v_contact.id,'caseId',v_contact.case_id,'revision',v_revision);
 update public.action_receipts set target_id=v_contact.id,receipt=v_result where id=v_receipt.id;
 return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Move the follow-up attempts into the log, once (D11): each becomes an
-- entry and its version 1, linked to its task, outgoing, by phone, with the
-- client, to request documents, at the attempt's time and by its persona. The
-- two closing outcomes were said by a client who was reached, so they keep
-- their meaning in the note. Returns the number moved.

create or replace function vitally_private.move_contact_attempts() returns int
language plpgsql security definer set search_path='' as $$
declare v_count int;
begin
 with moved as materialized (
  select gen_random_uuid() as contact_id,a.workspace_id,a.case_id,a.followup_id,a.actor_user_id,a.actor_person_id,a.created_at,
   case when a.outcome='no_answer' then 'no_answer' else 'reached' end as outcome,
   left(case a.outcome
    when 'no_further_contact' then concat_ws(' ','Client asked for no further contact.',nullif(btrim(a.note),''))
    when 'closure_requested' then concat_ws(' ','Client asked to close the case.',nullif(btrim(a.note),''))
    else case when btrim(a.note)<>'' then a.note end
   end,1000) as note
  from public.contact_attempts a
 ), logged as (
  insert into public.contact_log(id,workspace_id,case_id,followup_id,logged_by_user_id,logged_by_person_id,logged_at,
    direction,contacted_at,with_whom,other_name,method,purpose,outcome,note)
  select m.contact_id,m.workspace_id,m.case_id,m.followup_id,m.actor_user_id,m.actor_person_id,m.created_at,
    'outgoing',m.created_at,'client',null,'phone','request_documents',m.outcome,m.note
  from moved m
  returning id
 )
 insert into public.contact_log_versions(contact_id,version,workspace_id,case_id,edited_by_user_id,edited_by_person_id,created_at,
   direction,contacted_at,with_whom,other_name,method,purpose,outcome,note)
 select m.contact_id,1,m.workspace_id,m.case_id,m.actor_user_id,m.actor_person_id,m.created_at,
   'outgoing',m.created_at,'client',null,'phone','request_documents',m.outcome,m.note
 from moved m join logged l on l.id=m.contact_id;
 get diagnostics v_count=row_count;
 delete from public.contact_attempts;
 return v_count;
end;
$$;

select vitally_private.move_contact_attempts();

-- ---------------------------------------------------------------------------
-- 7. RECORD_CONTACT refuses new requests (D12). Receipts are checked before
-- the handler, so a replay of a request accepted before this change still
-- returns its receipt. The shared action code is left as it is.

create or replace function vitally_private.act_record_contact(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 -- Contacts are logged with vitally_log_contact (design D12).
 raise sqlstate 'VT007' using message='VALIDATION';
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. apply_fixture_scenario, verbatim from 019 with two changes (D6): it
-- deletes the case's contact log entries (their versions cascade) with the
-- rest of its work, and the sample follow-up's unanswered call is a linked
-- log entry and its version 1 instead of a contact_attempts row.

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
  -- Approved, with the client conversation the approval opens still pending.
  insert into public.reviews(workspace_id,case_id,preparation_version,reviewer_person_id,status,decided_at,client_contact_status,created_at)
  values(p_case.workspace_id,p_case.id,2,v_morgan,'approved',now()-interval '1 hour','pending',now()-interval '3 hours');
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
  updated_at=now()
  where id=p_case.id;
 return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Privileges: the two RPCs for signed-in members only, and no private
-- function for any client or service role.

revoke all on function public.vitally_log_contact(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vitally_log_contact(uuid,uuid,uuid,uuid,jsonb) to authenticated;
revoke all on function public.vitally_edit_contact(uuid,uuid,bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vitally_edit_contact(uuid,uuid,bigint,uuid,jsonb) to authenticated;
revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
