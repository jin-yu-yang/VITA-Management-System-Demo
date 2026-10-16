-- OpenSpec change add-widowed-spouse-rules (design D1, D3, D4): the show-if
-- language gains `gte`, `lte` and `any`, and a year can carry a range.
--
--   * intake_holds: verbatim from 011_intake_v2.sql, with the `gte`, `lte`
--     and `any` branches added. gte/lte hold only for a string holding a whole
--     number without a leading zero ("02025" never counts as 2025);
--     `any` holds when one of its groups (each an AND list) holds.
--   * intake_show_if_ok: new. put_intake_field's show-if check, recursive
--     through `any`.
--   * put_intake_field: verbatim from 015_intake_loader.sql, with its last
--     refusal (the op list) replaced by a call to intake_show_if_ok.
--   * check_intake_value: verbatim from 015_intake_loader.sql, with the year
--     branch reading min_value and max_value.
--
-- The catalogue migration that uses them (028) comes after this one: 015's
-- put_intake_field refuses `any`. Every statement can be applied again.

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
   when 'gte' then case when pg_catalog.jsonb_typeof(p_merged->(c->>'field')) = 'string'
     and (p_merged->>(c->>'field')) ~ '^(0|[1-9][0-9]*)$'
    then (p_merged->>(c->>'field'))::numeric >= (c->>'value')::numeric else false end
   when 'lte' then case when pg_catalog.jsonb_typeof(p_merged->(c->>'field')) = 'string'
     and (p_merged->>(c->>'field')) ~ '^(0|[1-9][0-9]*)$'
    then (p_merged->>(c->>'field'))::numeric <= (c->>'value')::numeric else false end
   when 'any' then exists(select 1 from pg_catalog.jsonb_array_elements(coalesce(c->'groups', '[]'::jsonb)) g
    where vitally_private.intake_holds(g, p_merged))
   else false end), true)
 from pg_catalog.jsonb_array_elements(coalesce(p_show_if, '[]'::jsonb)) c
$$;

-- A show-if list the loader accepts: an array of objects, each
-- `eq`/`ne`/`filled` with a string field, `gte`/`lte` with a string field and
-- a number value, or `any` with a non-empty array of non-empty groups, each
-- itself an acceptable list.
create or replace function vitally_private.intake_show_if_ok(p_show_if jsonb) returns boolean
language plpgsql immutable security definer set search_path='' as $$
declare c jsonb; g jsonb;
begin
 if jsonb_typeof(coalesce(p_show_if, '[]'::jsonb)) <> 'array' then
  return false;
 end if;
 for c in select value from jsonb_array_elements(coalesce(p_show_if, '[]'::jsonb)) loop
  if jsonb_typeof(c) is distinct from 'object' then
   return false;
  end if;
  case coalesce(c->>'op', '')
   when 'eq', 'ne', 'filled' then
    if jsonb_typeof(c->'field') is distinct from 'string' then
     return false;
    end if;
   when 'gte', 'lte' then
    if jsonb_typeof(c->'field') is distinct from 'string' or jsonb_typeof(c->'value') is distinct from 'number' then
     return false;
    end if;
   when 'any' then
    if jsonb_typeof(c->'groups') is distinct from 'array' or jsonb_array_length(c->'groups') = 0 then
     return false;
    end if;
    for g in select value from jsonb_array_elements(c->'groups') loop
     if jsonb_typeof(g) is distinct from 'array' or jsonb_array_length(g) = 0
      or not vitally_private.intake_show_if_ok(g) then
      return false;
     end if;
    end loop;
   else
    return false;
  end case;
 end loop;
 return true;
end;
$$;

-- put_intake_field: 015's, with the show-if check delegated to intake_show_if_ok.
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
  or not vitally_private.intake_show_if_ok(coalesce(p_question->'showIf', '[]'::jsonb)) then
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

-- check_intake_value: 015's, with a year held to min_value and max_value.
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
   if v !~ '^[0-9]{4}$' then
    return false;
   end if;
   return (p_field.min_value is null or v::int >= p_field.min_value)
    and (p_field.max_value is null or v::int <= p_field.max_value);
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
