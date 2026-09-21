-- Realtime publication for the browser-readable tables.
--
-- Postgres Changes delivers only what the `supabase_realtime` publication
-- carries. A subscription to an unpublished table receives nothing — and
-- Realtime still answers SUBSCRIBED, so the silence looks like a quiet
-- workspace rather than a broken feature. Worse, a single unpublished table in
-- a channel's set drops that channel's whole subscription, taking the
-- published tables down with it. The list therefore lives here, in the schema,
-- instead of being applied by hand to each stack.
--
-- **Why publishing is safe for exactly these twelve tables.** Publishing a
-- table exposes its write-ahead log to Realtime, which then evaluates the same
-- row-level security policies the table already carries: an applicant still
-- receives only their own case, and a presenter still receives no private
-- client draft. So the list stops precisely where the browser's read
-- permissions stop. `public.action_receipts` and everything in
-- `vitally_private` are deliberately absent, and no future table belongs here
-- without a select policy to authorize its rows.
--
-- **INSERT and UPDATE only** (spec section 7). A deleted row cannot be
-- authorized through the RLS state it no longer has, so deletions are never
-- published; Task 9's fixture reset announces itself through the workspace
-- generation signal instead. TRUNCATE is off for the same reason.
--
-- Idempotent: a table already published — by hand, or by an earlier run of
-- this file — is left alone, so the migration can be re-applied as a whole.
do $$
declare
 v_table text;
begin
 -- A project without Realtime has no such publication. Fail loudly here
 -- rather than let the browser subscribe to silence.
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
  raise exception 'The supabase_realtime publication is missing; enable Realtime on this project before migrating.';
 end if;
 foreach v_table in array array[
  'cases','document_requests','documents','client_events','workspaces',
  'people','preparation_participants','admin_followups','contact_attempts',
  'case_events','assistance_items','reviews'
 ] loop
  if not exists(
   select 1 from pg_publication_tables
   where pubname='supabase_realtime' and schemaname='public' and tablename=v_table
  ) then
   execute format('alter publication supabase_realtime add table public.%I', v_table);
  end if;
 end loop;
end $$;

alter publication supabase_realtime set (publish = 'insert, update');
