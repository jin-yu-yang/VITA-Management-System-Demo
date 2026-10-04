-- Intake redesign 4b2, Task 2 (docs/superpowers/specs/2026-10-04-intake-redesign-design.md §9.2):
-- the loader learns what the version-2 catalogue now carries.
--
--   * the hidden field type `id`, used only inside a group (`hh.member_id`,
--     32 lowercase hexadecimal characters);
--   * `vitally_private.intake_substeps`, one row per catalogue sub-step in order,
--     loaded by `load_intake_catalogue`;
--   * `check_intake_value` refuses a household member without a well-formed
--     `member_id` and two members that share one.
--
-- Every statement can be applied again. The three functions are copied verbatim
-- from 011_intake_v2.sql with the lines named below added. The generated
-- catalogue migration that follows (016) loads the catalogue through them.
-- The same revoke that ends 013 ends this file.

-- 1. The hidden field type `id`, for hh.member_id.
alter table vitally_private.intake_fields drop constraint if exists intake_fields_type_check;
alter table vitally_private.intake_fields add constraint intake_fields_type_check check (type in ('text','longtext','signature','email','phone','zip','date','year',
 'number','choice','multi','who','yesno','group','id'));

-- 2. The sub-steps, one row per catalogue sub-step, in order. Private like intake_fields.
create table if not exists vitally_private.intake_substeps (
 version smallint not null check (version in (1, 2)),
 id text not null check (id ~ '^[a-z]+\.[a-z_]+$'),
 step smallint not null,
 position int not null,
 primary key (version, id)
);
revoke all on vitally_private.intake_substeps from public, anon, authenticated, service_role;

-- 3. put_intake_field, verbatim from 011 with 'id' added to the type list and
-- `or (v_type = 'id' and p_group is null)` added to the refusals.
create or replace function vitally_private.put_intake_field(p_version smallint,p_question jsonb,p_step smallint,p_group text)
returns void language plpgsql security definer set search_path='' as $$
declare v_id text; v_type text; v_field_id text;
begin
 v_id = p_question->>'id';
 v_type = p_question->>'type';
 if jsonb_typeof(p_question) is distinct from 'object'
  or jsonb_typeof(p_question->'id') is distinct from 'string' or v_id !~ '^[a-z][a-z0-9_]*$'
  or v_type is null or v_type not in ('text','longtext','signature','email','phone','zip','date','year',
   'number','choice','multi','who','yesno','group','id')
  or (p_group is not null and v_type = 'group')
  or (v_type = 'id' and p_group is null)
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

-- 4. load_intake_catalogue, verbatim from 011 with the sub-step rows added: the
-- version's old rows are deleted next to the field delete, and each step's
-- `substeps` (when present, an array of objects with a string `id`) is inserted
-- with a running position across the whole catalogue.
create or replace function vitally_private.load_intake_catalogue(p_version smallint,p_catalogue jsonb)
returns int language plpgsql security definer set search_path='' as $$
declare v_step jsonb; v_section jsonb; v_question jsonb; v_field jsonb; v_n smallint; v_sub jsonb; v_position int = 0;
begin
 if p_version is null or jsonb_typeof(p_catalogue) is distinct from 'object'
  or jsonb_typeof(p_catalogue->'steps') is distinct from 'array' or jsonb_array_length(p_catalogue->'steps') = 0 then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 delete from vitally_private.intake_fields where version = p_version;
 delete from vitally_private.intake_substeps where version = p_version;
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
  if v_step ? 'substeps' then
   if jsonb_typeof(v_step->'substeps') is distinct from 'array' then
    raise sqlstate 'VT007' using message='VALIDATION';
   end if;
   for v_sub in select value from jsonb_array_elements(v_step->'substeps') loop
    if jsonb_typeof(v_sub) is distinct from 'object' or jsonb_typeof(v_sub->'id') is distinct from 'string' then
     raise sqlstate 'VT007' using message='VALIDATION';
    end if;
    v_position = v_position + 1;
    insert into vitally_private.intake_substeps (version, id, step, position)
    values (p_version, v_sub->>'id', v_n, v_position);
   end loop;
  end if;
 end loop;
 return (select count(*) from vitally_private.intake_fields where version = p_version);
end;
$$;

-- 5. check_intake_value, verbatim from 011 with the `id` branch before the group
-- branch and the member-id check at the end of the group branch.
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
 if p_field.type = 'id' then
  return jsonb_typeof(p_value) = 'string' and (p_value#>>'{}') ~ '^[0-9a-f]{32}$';
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
  -- Every member needs a well-formed id and no two share one. The per-key loop
  -- above cannot decide this: it reads "" as unset before any type branch.
  if exists(select 1 from jsonb_array_elements(p_value) m
    where jsonb_typeof(m->'member_id') is distinct from 'string' or (m->>'member_id') !~ '^[0-9a-f]{32}$')
   or (select count(distinct m->>'member_id') from jsonb_array_elements(p_value) m) <> jsonb_array_length(p_value) then
   return false;
  end if;
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

revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
