-- Part 4a: the version-2 intake (docs/superpowers/specs/2026-09-29-intake-catalogue-design.md §3).
--
-- Schema only: the versions, the field table and its loader, the value and
-- visibility checks, `case_contacts`, and version-2 SAVE_ANSWERS / SUBMIT.
-- There are no questions here. The first catalogue load is the generated
-- `012_intake_catalogue_<hash8>.sql`; a later catalogue change ships as a new
-- `NNN_intake_catalogue_*.sql` written by `npm run build:intake`.
--
-- Every check here mirrors src/intake-catalogue.mjs (isAnswered, isVisible,
-- checkValue, missingToSubmit); tests/database-intake.mjs compares the two.
--
-- Version 1 is untouched: its cases keep today's answer rules, submit rules
-- and screening. New cases stay version 1 while every workspace's
-- `default_intake_version` is 1.
--
-- Written to be safe to apply again on a local test stack whose
-- schema_migrations row for this file was deleted during development: every
-- statement is `if not exists`, `create or replace`, or a drop-then-add.

-- ---------------------------------------------------------------------------
-- 1. Versions.

alter table public.workspaces add column if not exists default_intake_version smallint not null default 1;
alter table public.workspaces drop constraint if exists workspaces_default_intake_version_range;
alter table public.workspaces add constraint workspaces_default_intake_version_range
 check (default_intake_version in (1, 2));

alter table public.cases add column if not exists intake_version smallint not null default 1;
alter table public.cases drop constraint if exists cases_intake_version_range;
alter table public.cases add constraint cases_intake_version_range
 check (intake_version in (1, 2));

-- A case takes its workspace's default version when it is created, whatever
-- the insert says. A version-2 case starts empty: vitally_create_case (001)
-- checks creation answers against version 1's keys, so version-2 answers
-- arrive only through SAVE_ANSWERS, which checks them against the catalogue.
create or replace function vitally_private.cases_intake_version_insert()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_version smallint;
begin
 select w.default_intake_version into v_version from public.workspaces w where w.id=new.workspace_id;
 new.intake_version = coalesce(v_version, 1);
 if new.intake_version = 2 and new.answers is distinct from '{}'::jsonb then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 return new;
end;
$$;
drop trigger if exists cases_intake_version_insert on public.cases;
create trigger cases_intake_version_insert before insert on public.cases
 for each row execute function vitally_private.cases_intake_version_insert();

-- A case's version never changes: its answers are only meaningful in it.
create or replace function vitally_private.cases_intake_version_fixed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.intake_version is distinct from old.intake_version then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 return new;
end;
$$;
drop trigger if exists cases_intake_version_fixed on public.cases;
create trigger cases_intake_version_fixed before update on public.cases
 for each row execute function vitally_private.cases_intake_version_fixed();

-- ---------------------------------------------------------------------------
-- 2. The field table: one row per catalogue question, and one per group
-- sub-field (`field_id` "hh.dob", `group_id` "hh"). Private: only the
-- security-definer functions below read it.

create table if not exists vitally_private.intake_fields (
 version smallint not null check (version in (1, 2)),
 field_id text not null,
 type text not null check (type in ('text','longtext','signature','email','phone','zip','date','year',
  'number','choice','multi','who','yesno','group')),
 options text[],
 max_length int,
 min_value int,
 max_value int,
 required_to_submit boolean not null default false,
 show_if jsonb not null default '[]'::jsonb check (jsonb_typeof(show_if) = 'array'),
 step smallint not null,
 group_id text,
 sensitive boolean not null default false,
 primary key (version, field_id)
);
revoke all on vitally_private.intake_fields from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The loader. It replaces every row of one version, in the caller's
-- transaction, and refuses a catalogue that fails its own shape checks.
-- `fixedOptions` and `materials` are ignored: each question's own `options`
-- already hold every allowed value, `who` and `yesno` included.

create or replace function vitally_private.put_intake_field(p_version smallint,p_question jsonb,p_step smallint,p_group text)
returns void language plpgsql security definer set search_path='' as $$
declare v_id text; v_type text; v_field_id text;
begin
 v_id = p_question->>'id';
 v_type = p_question->>'type';
 if jsonb_typeof(p_question) is distinct from 'object'
  or jsonb_typeof(p_question->'id') is distinct from 'string' or v_id !~ '^[a-z][a-z0-9_]*$'
  or v_type is null or v_type not in ('text','longtext','signature','email','phone','zip','date','year',
   'number','choice','multi','who','yesno','group')
  or (p_group is not null and v_type = 'group')
  or jsonb_typeof(coalesce(p_question->'required', 'false'::jsonb)) <> 'boolean'
  or jsonb_typeof(coalesce(p_question->'showIf', '[]'::jsonb)) <> 'array'
  or jsonb_typeof(coalesce(p_question->'min', '0'::jsonb)) <> 'number'
  or jsonb_typeof(coalesce(p_question->'max', '0'::jsonb)) <> 'number'
  or (v_type in ('choice','multi','who','yesno') and (jsonb_typeof(p_question->'options') is distinct from 'array'
   or jsonb_array_length(p_question->'options') = 0
   or exists(select 1 from jsonb_array_elements(p_question->'options') o where jsonb_typeof(o->'value') is distinct from 'string')))
  or (v_type = 'group' and (jsonb_typeof(p_question->'fields') is distinct from 'array'
   or jsonb_array_length(p_question->'fields') = 0))
  or exists(select 1 from jsonb_array_elements(coalesce(p_question->'showIf', '[]'::jsonb)) c
   where jsonb_typeof(c->'field') is distinct from 'string' or coalesce(c->>'op', '') not in ('eq','ne','filled')) then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 v_field_id = case when p_group is null then v_id else p_group || '.' || v_id end;
 if exists(select 1 from vitally_private.intake_fields f where f.version = p_version and f.field_id = v_field_id) then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 insert into vitally_private.intake_fields
  (version, field_id, type, options, max_length, min_value, max_value, required_to_submit, show_if, step, group_id, sensitive)
 values (
  p_version, v_field_id, v_type,
  case when p_question ? 'options'
   then array(select o->>'value' from jsonb_array_elements(p_question->'options') with ordinality as e(o, n) order by n) end,
  case v_type when 'text' then 200 when 'signature' then 200 when 'longtext' then 5000 when 'email' then 254 end,
  (p_question->>'min')::int, (p_question->>'max')::int,
  coalesce((p_question->>'required')::boolean, false),
  coalesce(p_question->'showIf', '[]'::jsonb),
  p_step, p_group, v_type = 'phone');
end;
$$;

create or replace function vitally_private.load_intake_catalogue(p_version smallint,p_catalogue jsonb)
returns int language plpgsql security definer set search_path='' as $$
declare v_step jsonb; v_section jsonb; v_question jsonb; v_field jsonb; v_n smallint;
begin
 if p_version is null or jsonb_typeof(p_catalogue) is distinct from 'object'
  or jsonb_typeof(p_catalogue->'steps') is distinct from 'array' or jsonb_array_length(p_catalogue->'steps') = 0 then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 delete from vitally_private.intake_fields where version = p_version;
 for v_step in select value from jsonb_array_elements(p_catalogue->'steps') loop
  if jsonb_typeof(v_step->'n') is distinct from 'number' or jsonb_typeof(v_step->'sections') is distinct from 'array' then
   raise sqlstate 'VT007' using message='VALIDATION';
  end if;
  v_n = (v_step->>'n')::smallint;
  for v_section in select value from jsonb_array_elements(v_step->'sections') loop
   if jsonb_typeof(v_section->'questions') is distinct from 'array' then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
   for v_question in select value from jsonb_array_elements(v_section->'questions') loop
    perform vitally_private.put_intake_field(p_version, v_question, v_n, null);
    if v_question->>'type' = 'group' then
     for v_field in select value from jsonb_array_elements(v_question->'fields') loop
      perform vitally_private.put_intake_field(p_version, v_field, v_n, v_question->>'id');
     end loop;
    end if;
   end loop;
  end loop;
 end loop;
 return (select count(*) from vitally_private.intake_fields where version = p_version);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Value checks (spec §2.2), mirroring checkValue.

-- Answered: not null, not a string that is empty after trimming, not an empty
-- array (isAnswered). "Trimming" is JavaScript's String.prototype.trim, whose
-- whitespace is spelled out here, because [[:space:]] leaves out some of it
-- (U+00A0 among others): tab, line feed, vertical tab, form feed, carriage
-- return (U+0009-U+000D), space, no-break space (U+00A0), U+1680,
-- U+2000-U+200A, line and paragraph separators (U+2028, U+2029), U+202F,
-- U+205F, U+3000, and the byte-order mark (U+FEFF). Every server decision
-- about "empty" goes through this function: the save's clear rule, the
-- answer checks and the submit check.
create or replace function vitally_private.intake_answered(p_value jsonb) returns boolean
language sql immutable security definer set search_path='' as $$
 select case
  when p_value is null or pg_catalog.jsonb_typeof(p_value) = 'null' then false
  when pg_catalog.jsonb_typeof(p_value) = 'string' then (p_value#>>'{}')
   !~ '^[\u0009-\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*$'
  when pg_catalog.jsonb_typeof(p_value) = 'array' then pg_catalog.jsonb_array_length(p_value) > 0
  else true end
$$;

-- A string's length as JavaScript counts it (UTF-16 code units), so a
-- character outside the Basic Multilingual Plane counts twice, as in the browser.
create or replace function vitally_private.js_length(p_text text) returns int
language sql immutable security definer set search_path='' as $$
 select pg_catalog.length(p_text)
  + pg_catalog.length(pg_catalog.regexp_replace(p_text, '[^\U00010000-\U0010FFFF]', '', 'g'))
$$;

-- The whole answers value is at most 64 KB of stored text. Measured on the
-- text, not pg_column_size, which can report a compressed size.
create or replace function vitally_private.answers_within_limit(p_answers jsonb) returns boolean
language sql immutable security definer set search_path='' as $$
 select pg_catalog.octet_length(p_answers::text) <= 65536
$$;

-- True if the value passes its field's type check. An unset value (null, ""
-- or []) passes: clearing is always allowed, and whether a field may stay
-- empty is the submit check's business.
create or replace function vitally_private.check_intake_value(p_field vitally_private.intake_fields,p_value jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v text;
 v_member jsonb;
 v_key text;
 v_item jsonb;
 v_sub vitally_private.intake_fields;
 v_year int; v_month int; v_day int;
begin
 if p_value is null or jsonb_typeof(p_value) = 'null' or p_value = '""'::jsonb or p_value = '[]'::jsonb then
  return true;
 end if;
 if p_field.type = 'group' then
  if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 10 then
   return false;
  end if;
  for v_member in select value from jsonb_array_elements(p_value) loop
   if jsonb_typeof(v_member) <> 'object' then
    return false;
   end if;
   for v_key, v_item in select key, value from jsonb_each(v_member) loop
    select * into v_sub from vitally_private.intake_fields s
     where s.version = p_field.version and s.group_id = p_field.field_id and s.field_id = p_field.field_id || '.' || v_key;
    if not found or not vitally_private.check_intake_value(v_sub, v_item) then
     return false;
    end if;
   end loop;
  end loop;
  return true;
 end if;
 if p_field.type in ('multi', 'who') then
  if jsonb_typeof(p_value) <> 'array'
   or exists(select 1 from jsonb_array_elements(p_value) e where jsonb_typeof(e) <> 'string') then
   return false;
  end if;
  if (select count(distinct e) from jsonb_array_elements_text(p_value) e) <> jsonb_array_length(p_value)
   or exists(select 1 from jsonb_array_elements_text(p_value) e where e <> all(coalesce(p_field.options, array[]::text[])))
   or (p_field.type = 'who' and p_value ? 'none' and jsonb_array_length(p_value) > 1) then
   return false;
  end if;
  return true;
 end if;
 if jsonb_typeof(p_value) <> 'string' then
  return false;
 end if;
 v = p_value#>>'{}';
 case p_field.type
  when 'text', 'signature', 'longtext' then
   return vitally_private.js_length(v) <= p_field.max_length;
  when 'email' then
   -- Deliberately loose: at most 254 characters, exactly one "@", something on both sides.
   return vitally_private.js_length(v) <= 254 and length(v) - length(replace(v, '@', '')) = 1
    and left(v, 1) <> '@' and right(v, 1) <> '@';
  when 'phone' then
   -- Every non-digit is dropped first, so "(215) 555-0100" is ten digits.
   return length(regexp_replace(v, '[^0-9]', '', 'g')) = 10;
  when 'zip' then
   return v ~ '^[0-9]{5}$';
  when 'year' then
   return v ~ '^[0-9]{4}$';
  when 'date' then
   if v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
   end if;
   v_year = substr(v, 1, 4)::int; v_month = substr(v, 6, 2)::int; v_day = substr(v, 9, 2)::int;
   -- The browser's Date.UTC reads years 0-99 as 1900-1999, so they never round-trip.
   return v_year >= 100 and v_month between 1 and 12 and v_day >= 1
    and v_day <= extract(day from (make_date(v_year, v_month, 1) + interval '1 month' - interval '1 day'));
  when 'number' then
   if v !~ '^[0-9]+$' then
    return false;
   end if;
   if p_field.min_value is not null or p_field.max_value is not null then
    return v::numeric >= coalesce(p_field.min_value, 0) and (p_field.max_value is null or v::numeric <= p_field.max_value);
   end if;
   return length(v) <= 6;
  when 'choice', 'yesno' then
   return v = any(coalesce(p_field.options, array[]::text[]));
  else
   return false;
 end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Visibility, mirroring isVisible: `eq` is string-equal or array-contains;
-- `ne` is answered and not that; `filled` is answered; a list is AND.
-- `p_merged` is the answers with the contact fields merged in, keyed by field id.

create or replace function vitally_private.intake_holds(p_show_if jsonb,p_merged jsonb) returns boolean
language sql immutable security definer set search_path='' as $$
 select coalesce(pg_catalog.bool_and(
  case c->>'op'
   when 'filled' then vitally_private.intake_answered(p_merged->(c->>'field'))
   when 'eq' then coalesce(case when pg_catalog.jsonb_typeof(p_merged->(c->>'field')) = 'array'
    then (p_merged->(c->>'field')) @> pg_catalog.jsonb_build_array(c->'value')
    else (p_merged->(c->>'field')) = (c->'value') end, false)
   when 'ne' then vitally_private.intake_answered(p_merged->(c->>'field'))
    and not coalesce(case when pg_catalog.jsonb_typeof(p_merged->(c->>'field')) = 'array'
     then (p_merged->(c->>'field')) @> pg_catalog.jsonb_build_array(c->'value')
     else (p_merged->(c->>'field')) = (c->'value') end, false)
   else false end), true)
 from pg_catalog.jsonb_array_elements(coalesce(p_show_if, '[]'::jsonb)) c
$$;

-- `p_contact` holds the contact fields keyed by field id (tp_phone, sp_phone,
-- best_contact_time, best_contact_note); they override the answers.
create or replace function vitally_private.intake_visible(p_version smallint,p_field_id text,p_answers jsonb,p_contact jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select vitally_private.intake_holds(f.show_if, coalesce(p_answers, '{}'::jsonb) || coalesce(p_contact, '{}'::jsonb))
  from vitally_private.intake_fields f where f.version = p_version and f.field_id = p_field_id), false)
$$;

-- The required, visible, unanswered fields, as missingToSubmit names them
-- ("tp_phone", "hh", "hh[0].dob"). A group's members are checked only while
-- the group is shown.
create or replace function vitally_private.intake_missing(p_version smallint,p_answers jsonb,p_contact jsonb)
returns text[] language plpgsql stable security definer set search_path='' as $$
declare v_merged jsonb = coalesce(p_answers, '{}'::jsonb) || coalesce(p_contact, '{}'::jsonb);
 v_field vitally_private.intake_fields;
 v_sub vitally_private.intake_fields;
 v_members jsonb;
 v_missing text[] = array[]::text[];
 i int;
begin
 for v_field in select * from vitally_private.intake_fields f
  where f.version = p_version and f.group_id is null order by f.step, f.field_id loop
  if not vitally_private.intake_holds(v_field.show_if, v_merged) then
   continue;
  end if;
  if v_field.type = 'group' then
   v_members = case when jsonb_typeof(v_merged->v_field.field_id) = 'array' then v_merged->v_field.field_id else '[]'::jsonb end;
   if v_field.required_to_submit and jsonb_array_length(v_members) = 0 then
    v_missing = v_missing || v_field.field_id;
   end if;
   for i in 0 .. jsonb_array_length(v_members) - 1 loop
    for v_sub in select * from vitally_private.intake_fields s
     where s.version = p_version and s.group_id = v_field.field_id and s.required_to_submit order by s.field_id loop
     if not vitally_private.intake_answered(v_members->i->substr(v_sub.field_id, length(v_field.field_id) + 2)) then
      v_missing = v_missing || format('%s[%s].%s', v_field.field_id, i, substr(v_sub.field_id, length(v_field.field_id) + 2));
     end if;
    end loop;
   end loop;
  elsif v_field.required_to_submit and not vitally_private.intake_answered(v_merged->v_field.field_id) then
   v_missing = v_missing || v_field.field_id;
  end if;
 end loop;
 return v_missing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Contact details. Both phones, the best time and the note live here, never
-- in `answers`, so part 5 masks phones in one place. Only the action RPCs
-- write it; the select policy is 002's `visible_document_requests`, renamed,
-- so a presenter never sees the row of an applicant's own unsent draft.

create table if not exists public.case_contacts (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid primary key,
 phone text check (phone is null or phone ~ '^[0-9]{10}$'),
 spouse_phone text check (spouse_phone is null or spouse_phone ~ '^[0-9]{10}$'),
 best_contact_time text[] check (best_contact_time is null or cardinality(best_contact_time) between 1 and 20),
 best_contact_note text check (best_contact_note is null or length(best_contact_note) between 1 and 1000),
 updated_at timestamptz not null default now(),
 foreign key (workspace_id, case_id) references public.cases(workspace_id, id) on delete cascade
);
alter table public.case_contacts enable row level security;
drop policy if exists visible_case_contacts on public.case_contacts;
create policy visible_case_contacts on public.case_contacts for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=case_contacts.case_id where m.workspace_id=case_contacts.workspace_id and m.user_id=(select auth.uid()) and m.active and ((m.access='applicant' and c.owner_user_id=m.user_id) or (m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')))));
revoke all on public.case_contacts from public, anon, authenticated;
grant select on public.case_contacts to authenticated;
grant select, insert, update, delete on public.case_contacts to service_role;

-- Realtime, with 007's pattern: INSERT and UPDATE only, under the same RLS.
do $$
begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
  raise exception 'The supabase_realtime publication is missing; enable Realtime on this project before migrating.';
 end if;
 if not exists(
  select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='case_contacts'
 ) then
  alter publication supabase_realtime add table public.case_contacts;
 end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Answer checks. check_payload is immutable and does not know the case, so
-- the per-key checks move to check_related, which runs right after it and
-- before any handler: a bad answer is still VALIDATION before any stage check.

-- check_payload, verbatim from 006 except the SAVE_ANSWERS branch, which keeps
-- only the payload's shape.
create or replace function vitally_private.check_payload(p_type text,p_payload jsonb) returns void
language plpgsql immutable security definer set search_path='' as $$
begin
 case p_type
  when 'SAVE_ANSWERS' then
   -- The per-key answer checks are check_related's: they depend on the case's version.
   if vitally_private.payload_keys(p_payload)<>array['answers'] or jsonb_typeof(p_payload->'answers')<>'object' then
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
  when 'CLAIM_PREPARATION','REMIND','SUBMIT_REVIEW','CLAIM_REVIEW','APPROVE_REVIEW' then
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
  when 'RESUBMIT_REVIEW' then
   if vitally_private.payload_keys(p_payload)<>array['resolution']
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
  when 'CLOSE_CASE' then
   -- Closing is deliberate: a written reason and an explicit confirmation.
   if vitally_private.payload_keys(p_payload)<>array['confirmed','reason']
    or p_payload->'confirmed'<>'true'::jsonb
    or not vitally_private.payload_text(p_payload,'reason',1000) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
end;
$$;

-- check_related, verbatim from 004 with a SAVE_ANSWERS branch added at its start.
-- Version 1: the conditions that were check_payload's, unchanged. Version 2:
-- each key is a top-level version-2 field, and an answered value passes its
-- type check; an unanswered one (null, blank text, []) clears the field.
create or replace function vitally_private.check_related(p_case public.cases,p_type text,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 case p_type
  when 'SAVE_ANSWERS' then
   if p_case.intake_version = 2 then
    if exists(select 1 from jsonb_each(p_payload->'answers') a
     left join vitally_private.intake_fields f on f.version = p_case.intake_version and f.group_id is null and f.field_id = a.key
     where f.field_id is null
      or (vitally_private.intake_answered(a.value) and not vitally_private.check_intake_value(f, a.value))) then
     raise sqlstate 'VT007' using message='VALIDATION';
    end if;
   elsif exists(select 1 from jsonb_each(p_payload->'answers') a
     where a.key<>all(vitally_private.intake_answer_keys()) or jsonb_typeof(a.value)<>'string' or length(a.value#>>'{}')>1000) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'RESPOND_DOCUMENT','RECORD_DOCUMENT_RESPONSE','VERIFY_DOCUMENT','ESCALATE_CONTACT' then
   if not exists(select 1 from public.document_requests r where r.workspace_id=p_case.workspace_id
    and r.case_id=p_case.id and r.id=vitally_private.payload_uuid(p_payload,'requestId')) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  when 'RECORD_CONTACT','RESOLVE_FOLLOWUP' then
   if not exists(select 1 from public.admin_followups t where t.workspace_id=p_case.workspace_id
    and t.case_id=p_case.id and t.id=vitally_private.payload_uuid(p_payload,'followupId')) then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
  else null;
 end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. act_save_answers, verbatim from 003 with a version-2 branch. A version-2
-- save writes the contact keys to case_contacts (phones as their ten digits),
-- merges the rest into answers, drops the keys it clears, and keeps the
-- answers within 64 KB. History still lists the saved keys, never the values.
create or replace function vitally_private.act_save_answers(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_in jsonb;
 v_contact jsonb;
 v_answers jsonb;
 v_key text;
 v_value jsonb;
begin
 if p_case.stage<>'draft' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 if p_case.intake_version = 2 then
  v_in = p_payload->'answers';
  select coalesce(jsonb_object_agg(a.key, a.value), '{}'::jsonb) into v_contact from jsonb_each(v_in) a
   where a.key in ('tp_phone', 'sp_phone', 'best_contact_time', 'best_contact_note');
  if v_contact <> '{}'::jsonb then
   insert into public.case_contacts as cc (workspace_id, case_id, phone, spouse_phone, best_contact_time, best_contact_note, updated_at)
   values (p_case.workspace_id, p_case.id,
    case when vitally_private.intake_answered(v_contact->'tp_phone')
     then regexp_replace(v_contact->>'tp_phone', '[^0-9]', '', 'g') end,
    case when vitally_private.intake_answered(v_contact->'sp_phone')
     then regexp_replace(v_contact->>'sp_phone', '[^0-9]', '', 'g') end,
    case when vitally_private.intake_answered(v_contact->'best_contact_time')
     then array(select jsonb_array_elements_text(v_contact->'best_contact_time')) end,
    case when vitally_private.intake_answered(v_contact->'best_contact_note')
     then v_contact->>'best_contact_note' end,
    now())
   on conflict (case_id) do update set
    phone = case when v_contact ? 'tp_phone' then excluded.phone else cc.phone end,
    spouse_phone = case when v_contact ? 'sp_phone' then excluded.spouse_phone else cc.spouse_phone end,
    best_contact_time = case when v_contact ? 'best_contact_time' then excluded.best_contact_time else cc.best_contact_time end,
    best_contact_note = case when v_contact ? 'best_contact_note' then excluded.best_contact_note else cc.best_contact_note end,
    updated_at = now();
  end if;
  v_answers = p_case.answers;
  for v_key, v_value in select a.key, a.value from jsonb_each(v_in) a
   where a.key not in ('tp_phone', 'sp_phone', 'best_contact_time', 'best_contact_note') loop
   if vitally_private.intake_answered(v_value) then
    v_answers = v_answers || jsonb_build_object(v_key, v_value);
   else
    v_answers = v_answers - v_key;
   end if;
  end loop;
  if not vitally_private.answers_within_limit(v_answers) then
   raise sqlstate 'VT007' using message='VALIDATION';
  end if;
  update public.cases set answers=v_answers where id=p_case.id;
 else
  update public.cases set answers=answers||(p_payload->'answers') where id=p_case.id;
 end if;
 -- Internal history records which fields changed, never the answers themselves.
 return jsonb_build_object('detail',jsonb_build_object('fields',to_jsonb(vitally_private.payload_keys(p_payload->'answers'))));
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. act_submit, verbatim from 010 with a version-2 branch before version 1's
-- checks. Version 2 refuses only a missing required, visible field (contact
-- fields counted from case_contacts); there is no screening.
create or replace function vitally_private.act_submit(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_answers jsonb=p_case.answers;
 v_number integer;
 v_contact jsonb;
begin
 if p_case.stage<>'draft' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 if p_case.intake_version = 2 then
  select jsonb_strip_nulls(jsonb_build_object('tp_phone', c.phone, 'sp_phone', c.spouse_phone,
    'best_contact_time', to_jsonb(c.best_contact_time), 'best_contact_note', c.best_contact_note))
   into v_contact from public.case_contacts c where c.case_id=p_case.id;
  if cardinality(vitally_private.intake_missing(p_case.intake_version, v_answers, coalesce(v_contact, '{}'::jsonb))) > 0 then
   raise sqlstate 'VT007' using message='VALIDATION';
  end if;
  update public.cases set stage='received' where id=p_case.id returning client_number into v_number;
  return jsonb_build_object('detail',jsonb_build_object('clientNumber',v_number),
   'message','Application received. A volunteer will check your information and documents.');
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

revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
