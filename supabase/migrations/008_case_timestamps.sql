-- Case timestamps (Ruling R43).
--
-- `public.cases` had no time on it at all, so every list — the client's "My
-- applications" and the staff work board alike — could only say "no updates
-- yet" for any case whose history was not currently loaded. A board that
-- cannot say when a case last moved is not a work board.
--
-- Two columns, and one rule about them:
--
--   * `created_at` is when the case row came into being. It is never written
--     again by anything.
--   * `updated_at` is when the last **accepted** action was committed. It moves
--     in `vitally_private.commit_action`, which is the one place a case action
--     ever succeeds: the same statement that appends the history, increments
--     the revision and stores the receipt. A rejected action raises, the whole
--     statement rolls back, and the time does not move — so `updated_at` can
--     never suggest that something happened when nothing did.
--
-- Adding a `not null default now()` column fills every existing row with the
-- default in the same statement, which is the backfill: rows that predate this
-- migration are stamped with the moment it ran, not with a fabricated history.
--
-- `public.vitally_create_case` needs no change — the defaults apply to its
-- insert — and neither does any handler: they mutate the case row, and
-- `commit_action` runs after them, in the same transaction.
--
-- This migration replaces exactly one function, `create or replace`, preserving
-- its body verbatim apart from the one added assignment, and re-applies the
-- private-schema revoke the earlier migrations end with. No 001–007 object is
-- dropped.

alter table public.cases add column if not exists created_at timestamptz not null default now();
alter table public.cases add column if not exists updated_at timestamptz not null default now();

-- Step 8: history, revision and receipt commit with the handler's mutation.
create or replace function vitally_private.commit_action(p_member public.memberships,p_case public.cases,p_person public.people,p_action_id uuid,p_type text,p_outcome jsonb,p_receipt public.action_receipts)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_revision bigint;
 v_result jsonb;
begin
 insert into public.case_events(workspace_id,case_id,actor_user_id,actor_person_id,action,detail)
 values(p_case.workspace_id,p_case.id,p_member.user_id,p_person.id,p_type,coalesce(p_outcome->'detail','{}'::jsonb));
 -- Client-relevant actions add plain-language progress with no internal detail.
 if p_outcome->>'message' is not null then
  insert into public.client_events(workspace_id,case_id,action,message)
  values(p_case.workspace_id,p_case.id,p_type,p_outcome->>'message');
 end if;
 -- The revision and the moment it moved are written together: an accepted
 -- action is the only thing that changes either (Ruling R43).
 update public.cases set revision=revision+1,updated_at=now() where id=p_case.id returning revision into v_revision;
 v_result=jsonb_build_object('actionId',p_action_id,'caseId',p_case.id,'reference',p_case.reference,'revision',v_revision);
 update public.action_receipts set target_id=p_case.id,target_reference=p_case.reference,receipt=v_result where id=p_receipt.id;
 return v_result;
end;
$$;
revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
