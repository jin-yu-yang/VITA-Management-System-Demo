-- Independent review and correction cycles: the review attempt record and the
-- five review actions on the 003 spine, the way 004 and 005 added theirs — one
-- branch per action in each ordered check, one handler each. Every function is
-- `create or replace` and the table statements are guarded, so the file can be
-- re-applied as a whole; no 001-005 object is dropped.

-- One row per review attempt. Findings and resolutions are internal staff text
-- and live here, on a presenter-only table, never in client_events. The client
-- contact columns are the follow-up an approval opens (Ruling R28); there is no
-- banking, refund or amount field anywhere in this workflow.
create table if not exists public.reviews (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null,
 preparation_version bigint not null check(preparation_version>=1),
 reviewer_person_id uuid not null,
 status text not null default 'active' check(status in ('active','corrections_requested','approved','superseded')),
 findings text check(findings is null or length(findings) between 1 and 2000),
 resolution text check(resolution is null or length(resolution) between 1 and 2000),
 client_contact_status text check(client_contact_status in ('pending','completed')),
 client_contact_outcome text check(client_contact_outcome in ('no_answer','reached','no_further_contact','closure_requested')),
 client_contact_note text check(client_contact_note is null or length(client_contact_note) between 1 and 1000),
 client_contacted_at timestamptz,
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 -- A decision is dated; an attempt still open or overtaken by a newer version
 -- is not. Findings accompany the decision that asked for corrections.
 constraint reviews_decided check((status in ('corrections_requested','approved'))=(decided_at is not null)),
 constraint reviews_findings check((status='corrections_requested')=(findings is not null)),
 -- Client contact exists only after approval, and a completed conversation is
 -- the only one with a time on it.
 constraint reviews_contact_stage check(client_contact_status is null or status='approved'),
 constraint reviews_contacted check((coalesce(client_contact_status,'')='completed')=(client_contacted_at is not null)),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(workspace_id,reviewer_person_id) references public.people(workspace_id,id),
 unique(workspace_id,case_id,id)
);
-- At most one attempt is on a reviewer's desk at a time.
create unique index if not exists reviews_one_active_per_case on public.reviews(case_id) where status='active';

alter table public.reviews enable row level security;
-- The same presenter-only rule as presenter_case_events in 002, inlined here
-- too: a client reads no review attempt, and never its findings.
drop policy if exists presenter_reviews on public.reviews;
create policy presenter_reviews on public.reviews for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=reviews.case_id where m.workspace_id=reviews.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')));
revoke all on public.reviews from public,anon,authenticated;
grant select on public.reviews to authenticated;
grant select,insert,update,delete on public.reviews to service_role;

-- Step 4, target-independent half. Replaces the 005 definition, adding the six
-- review branches. Every one of them is presenter work with a selected staff
-- person; `review` is the step-7 technical qualification, exactly as `prepare`
-- is, and is deliberately not tested here.
create or replace function vitally_private.check_operation_authority(p_member public.memberships,p_person_id uuid,p_type text)
returns public.people language plpgsql security definer set search_path='' as $$
declare v_person public.people;
begin
 -- Client actions carry no staff person; a selected one must exist in this workspace.
 if p_person_id is not null then
  if p_member.access<>'presenter' then
   raise sqlstate 'VT001' using message='FORBIDDEN';
  end if;
  select * into v_person from public.people where workspace_id=p_member.workspace_id and id=p_person_id;
  if not found then
   raise sqlstate 'VT001' using message='FORBIDDEN';
  end if;
 end if;
 case p_type
  when 'SAVE_ANSWERS','SUBMIT' then
   -- Client-permitted: an applicant answers for themselves, or a presenter
   -- assists with an admin-capable person.
   if p_person_id is null then
    if p_member.access<>'applicant' then
     raise sqlstate 'VT001' using message='FORBIDDEN';
    end if;
   elsif not ('admin'=any(v_person.capabilities)) then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'VERIFY_INTAKE','REMIND','CLOSE_CASE' then
   if p_person_id is null or not ('admin'=any(v_person.capabilities)) then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'CLAIM_PREPARATION','REQUEST_DOCUMENT','VERIFY_DOCUMENT','ESCALATE_CONTACT',
       'SUBMIT_REVIEW','RESUBMIT_REVIEW','CLAIM_REVIEW','REQUEST_CORRECTIONS',
       'APPROVE_REVIEW','RECORD_REVIEW_CONTACT' then
   if p_person_id is null then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'RESPOND_DOCUMENT' then
   -- The client answers for themselves: no staff persona at all.
   if p_person_id is not null or p_member.access<>'applicant' then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'RECORD_DOCUMENT_RESPONSE' then
   if p_person_id is null or not ('receive_documents'=any(v_person.capabilities)) then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'RECORD_CONTACT','RESOLVE_FOLLOWUP' then
   if p_person_id is null or not ('followup'=any(v_person.capabilities)) then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  when 'ASSISTANCE:CLAIM','ASSISTANCE:RESOLVE' then
   -- Helping a client with their own forms is its own capability; holding it
   -- is still not holding the item, which is a step-7 rule on the target.
   if p_person_id is null or not ('assist'=any(v_person.capabilities)) then
    raise sqlstate 'VT001' using message='FORBIDDEN';
   end if;
  -- Unknown or not-yet-implemented actions never reach a handler.
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
 return v_person;
end;
$$;

-- Step 5 (payload): explicit shapes; anything outside the whitelist is rejected.
-- Stays immutable and table-free: related-record membership is check_related,
-- which the review actions need no branch in — none of them names a record.
create or replace function vitally_private.check_payload(p_type text,p_payload jsonb) returns void
language plpgsql immutable security definer set search_path='' as $$
begin
 case p_type
  when 'SAVE_ANSWERS' then
   if vitally_private.payload_keys(p_payload)<>array['answers'] or jsonb_typeof(p_payload->'answers')<>'object'
    or exists(select 1 from jsonb_each(p_payload->'answers') a
     where a.key<>all(vitally_private.intake_answer_keys()) or jsonb_typeof(a.value)<>'string' or length(a.value#>>'{}')>1000) then
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

-- Step 7, first half for every review action: independence before qualification.
-- Anyone who took part in preparing this case is refused as its reviewer, even
-- when they hold `review`; the permanent participation record is what decides,
-- so a former preparer is excluded exactly like the current one.
create or replace function vitally_private.require_review_eligibility(p_case public.cases,p_person public.people) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_person.id is not null and exists(select 1 from public.preparation_participants p
  where p.case_id=p_case.id and p.person_id=p_person.id) then
  raise sqlstate 'VT005' using message='SELF_REVIEW';
 end if;
 if p_person.id is null or not ('review'=any(p_person.capabilities)) then
  raise sqlstate 'VT006' using message='INELIGIBLE';
 end if;
end;
$$;

-- Step 7 for the actions that also need this case's current reviewer, the twin
-- of require_case_preparer: eligibility first, then the live assignment. An
-- admin title, a `review` capability on its own and another reviewer's
-- assignment all fail here rather than reaching the attempt.
create or replace function vitally_private.require_case_reviewer(p_case public.cases,p_person public.people) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform vitally_private.require_review_eligibility(p_case,p_person);
 if p_case.reviewer_id is distinct from p_person.id then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
end;
$$;

-- The attempt on the reviewer's desk, locked for the decision about to be made
-- on it. Its own reviewer decides it, and only at the preparation version it
-- was opened against: a newer version needs a fresh review, so a decision
-- carried over from an earlier one is an invalid transition.
create or replace function vitally_private.lock_active_review(p_case public.cases,p_person public.people)
returns public.reviews language plpgsql security definer set search_path='' as $$
declare v_review public.reviews;
begin
 select * into v_review from public.reviews
  where workspace_id=p_case.workspace_id and case_id=p_case.id and status='active' for update;
 if v_review.reviewer_person_id is distinct from p_person.id then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 if v_review.preparation_version is distinct from p_case.preparation_version then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 return v_review;
end;
$$;

-- Step 6 blocker shared by both hand-offs: a requested document that nobody has
-- verified yet keeps preparation open. An admin follow-up does not — contact
-- work runs beside preparation and never holds up the reviewer (the brief's
-- regression). The blocker is case state every presenter can already read
-- through document_requests, so it discloses nothing the caller could not see.
create or replace function vitally_private.require_documents_settled(p_case public.cases) returns void
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.document_requests r
  where r.workspace_id=p_case.workspace_id and r.case_id=p_case.id
   and r.status in ('open','awaiting_verification')) then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
end;
$$;

-- Step 8 shared by both hand-offs: a new preparation version goes to review
-- with no reviewer on it, and any attempt still open is overtaken rather than
-- rewritten. Prior attempts keep their findings and resolutions for good.
create or replace function vitally_private.hand_to_review(p_case public.cases) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_version bigint;
begin
 update public.cases set preparation_version=preparation_version+1,stage='review_ready',reviewer_id=null
  where id=p_case.id returning preparation_version into v_version;
 update public.reviews set status='superseded'
  where workspace_id=p_case.workspace_id and case_id=p_case.id and status='active';
 return v_version;
end;
$$;

-- Steps 6-8 per action. The stage is step 6; the case's own participating
-- preparer is step 7, and the readiness blockers come after it (Ruling R21 and
-- R31, as 004 orders VERIFY_DOCUMENT and ESCALATE_CONTACT): a caller who is not
-- this case's preparer learns nothing about its intake or its documents.
create or replace function vitally_private.act_submit_review(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_version bigint;
begin
 if p_case.stage<>'preparing' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 perform vitally_private.require_case_preparer(p_case,p_person);
 -- Readiness: recorded intake, then no document still waiting on anybody.
 if not p_case.intake_verified then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 perform vitally_private.require_documents_settled(p_case);
 v_version=vitally_private.hand_to_review(p_case);
 -- The milestone is a manual one in external tax software; the client is told
 -- what happened in plain language, with no amounts and no findings.
 return jsonb_build_object('detail',jsonb_build_object('preparationVersion',v_version),
  'message','Your volunteer recorded that preparation is complete in the tax software. An independent reviewer will check it next.');
end;
$$;

-- One winner: the row lock from step 3 plus the revision check from step 5
-- makes a second simultaneous claim a CONFLICT. The attempt records the
-- version it is reviewing, so a later resubmission cannot be approved by it.
create or replace function vitally_private.act_claim_review(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_review uuid;
begin
 if p_case.stage<>'review_ready' or p_case.reviewer_id is not null then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 perform vitally_private.require_review_eligibility(p_case,p_person);
 update public.cases set stage='reviewing',reviewer_id=p_person.id where id=p_case.id;
 insert into public.reviews(workspace_id,case_id,preparation_version,reviewer_person_id,status)
 values(p_case.workspace_id,p_case.id,p_case.preparation_version,p_person.id,'active')
 returning id into v_review;
 return jsonb_build_object('detail',jsonb_build_object('reviewId',v_review,'reviewerPersonId',p_person.id),
  'message','An independent reviewer is checking your return.');
end;
$$;

-- The reviewer sends the case back. Preparation is untouched: the preparer and
-- the participants stay exactly as they are, and only explicit resubmission
-- moves the case on. The findings stay on the attempt, which no client reads.
create or replace function vitally_private.act_request_corrections(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_review public.reviews;
begin
 if p_case.stage<>'reviewing' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 perform vitally_private.require_case_reviewer(p_case,p_person);
 v_review=vitally_private.lock_active_review(p_case,p_person);
 update public.reviews set status='corrections_requested',findings=p_payload->>'findings',decided_at=now()
  where id=v_review.id;
 update public.cases set stage='corrections_required',reviewer_id=null where id=p_case.id;
 return jsonb_build_object('detail',jsonb_build_object('reviewId',v_review.id,'preparationVersion',v_review.preparation_version),
  'message','The reviewer asked your preparer to make corrections. No action is needed from you right now.');
end;
$$;

-- The preparer answers the correction request and hands a new version back.
-- The answered attempt keeps its findings and gains the resolution, so the
-- pair stays readable as history.
create or replace function vitally_private.act_resubmit_review(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_review public.reviews;
 v_version bigint;
begin
 if p_case.stage<>'corrections_required' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 perform vitally_private.require_case_preparer(p_case,p_person);
 -- Readiness, after the assignment, exactly as the first hand-off orders it.
 perform vitally_private.require_documents_settled(p_case);
 select * into v_review from public.reviews
  where workspace_id=p_case.workspace_id and case_id=p_case.id and status='corrections_requested'
  order by preparation_version desc,created_at desc limit 1 for update;
 if not found then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 update public.reviews set resolution=p_payload->>'resolution' where id=v_review.id;
 v_version=vitally_private.hand_to_review(p_case);
 return jsonb_build_object('detail',jsonb_build_object('reviewId',v_review.id,'preparationVersion',v_version),
  'message','Your volunteer recorded the requested corrections in the tax software. An independent reviewer will check the updated return.');
end;
$$;

-- Approval completes the review and opens the client conversation about the
-- next service step. It signs, files and accepts nothing: those are later
-- milestones this demo never performs.
create or replace function vitally_private.act_approve_review(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_review public.reviews;
begin
 if p_case.stage<>'reviewing' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 perform vitally_private.require_case_reviewer(p_case,p_person);
 v_review=vitally_private.lock_active_review(p_case,p_person);
 update public.reviews set status='approved',decided_at=now(),client_contact_status='pending'
  where id=v_review.id;
 -- The approving reviewer stays on the case: the contact task is theirs.
 update public.cases set stage='review_approved' where id=p_case.id;
 return jsonb_build_object('detail',jsonb_build_object('reviewId',v_review.id,'preparationVersion',v_review.preparation_version),
  'message','Independent review is complete. A volunteer will contact you about next steps. Signing and filing are later milestones and are not done yet.');
end;
$$;

-- Steps 6-8 for the contact the approval opened (Ruling R28). An unanswered
-- call leaves the task pending and may be repeated; a conversation that
-- happened completes it. Nothing here records banking, refund or amount
-- details, and the client hears about it only once it actually happened.
create or replace function vitally_private.act_record_review_contact(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_review public.reviews;
 v_completed boolean=p_payload->>'outcome' in ('reached','no_further_contact');
begin
 if p_case.stage<>'review_approved' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 -- The reviewer holding the case answers first: nobody else locks the attempt
 -- or learns from the error code whether the conversation already happened.
 perform vitally_private.require_case_reviewer(p_case,p_person);
 select * into v_review from public.reviews
  where workspace_id=p_case.workspace_id and case_id=p_case.id and status='approved'
  order by created_at desc limit 1 for update;
 if v_review.client_contact_status is distinct from 'pending' then
  raise sqlstate 'VT004' using message='INVALID_TRANSITION';
 end if;
 update public.reviews set client_contact_outcome=p_payload->>'outcome',client_contact_note=p_payload->>'note',
  client_contact_status=case when v_completed then 'completed' else client_contact_status end,
  client_contacted_at=case when v_completed then now() else client_contacted_at end
  where id=v_review.id;
 return jsonb_build_object('detail',jsonb_build_object('reviewId',v_review.id,'outcome',p_payload->>'outcome'),
  'message',case when v_completed then 'A volunteer spoke with you about the next service step.' end);
end;
$$;

-- The entry point runs the ordered common checks, dispatches one handler, then
-- commits. Any raise rolls back the whole statement, reserved receipt included.
create or replace function public.vitally_apply_action(p_action_id uuid,p_case_id uuid,p_expected_revision bigint,p_person_id uuid,p_type text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.memberships;
 v_receipt public.action_receipts;
 v_case public.cases;
 v_person public.people;
 v_outcome jsonb;
 v_digest text;
begin
 v_member=vitally_private.require_membership();
 -- A malformed envelope cannot be digested or reserved; payload contents are
 -- still whitelisted at step 5, after the target and authority checks.
 if p_action_id is null or p_case_id is null or p_expected_revision is null or p_type is null
  or p_payload is null or jsonb_typeof(p_payload)<>'object' then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 v_digest=encode(extensions.digest(jsonb_build_object('operation',p_type,'caseId',p_case_id,'expectedRevision',p_expected_revision,'personId',p_person_id,'payload',p_payload)::text,'sha256'),'hex');
 v_receipt=vitally_private.reserve_receipt(v_member,p_action_id,p_type,v_digest,p_person_id);
 -- An identical accepted replay returns its receipt after the current membership
 -- and operation-authority checks, without repeating the mutation and without
 -- reaching the target, which may since have been deleted.
 if v_receipt.receipt is not null then
  perform vitally_private.check_operation_authority(v_member,p_person_id,p_type);
  return v_receipt.receipt;
 end if;
 v_case=vitally_private.lock_case(v_member,p_case_id);
 v_person=vitally_private.check_authority(v_member,v_case,p_person_id,p_type);
 if v_case.revision<>p_expected_revision then
  raise sqlstate 'VT003' using message='CONFLICT';
 end if;
 perform vitally_private.check_payload(p_type,p_payload);
 perform vitally_private.check_related(v_case,p_type,p_payload);
 case p_type
  when 'SAVE_ANSWERS' then v_outcome=vitally_private.act_save_answers(v_member,v_case,v_person,p_payload);
  when 'SUBMIT' then v_outcome=vitally_private.act_submit(v_member,v_case,v_person,p_payload);
  when 'VERIFY_INTAKE' then v_outcome=vitally_private.act_verify_intake(v_member,v_case,v_person,p_payload);
  when 'CLAIM_PREPARATION' then v_outcome=vitally_private.act_claim_preparation(v_member,v_case,v_person,p_payload);
  when 'REQUEST_DOCUMENT' then v_outcome=vitally_private.act_request_document(v_member,v_case,v_person,p_payload);
  when 'RESPOND_DOCUMENT' then v_outcome=vitally_private.act_respond_document(v_member,v_case,v_person,p_payload);
  when 'RECORD_DOCUMENT_RESPONSE' then v_outcome=vitally_private.act_record_document_response(v_member,v_case,v_person,p_payload);
  when 'VERIFY_DOCUMENT' then v_outcome=vitally_private.act_verify_document(v_member,v_case,v_person,p_payload);
  when 'ESCALATE_CONTACT' then v_outcome=vitally_private.act_escalate_contact(v_member,v_case,v_person,p_payload);
  when 'RECORD_CONTACT' then v_outcome=vitally_private.act_record_contact(v_member,v_case,v_person,p_payload);
  when 'RESOLVE_FOLLOWUP' then v_outcome=vitally_private.act_resolve_followup(v_member,v_case,v_person,p_payload);
  when 'SUBMIT_REVIEW' then v_outcome=vitally_private.act_submit_review(v_member,v_case,v_person,p_payload);
  when 'CLAIM_REVIEW' then v_outcome=vitally_private.act_claim_review(v_member,v_case,v_person,p_payload);
  when 'REQUEST_CORRECTIONS' then v_outcome=vitally_private.act_request_corrections(v_member,v_case,v_person,p_payload);
  when 'RESUBMIT_REVIEW' then v_outcome=vitally_private.act_resubmit_review(v_member,v_case,v_person,p_payload);
  when 'APPROVE_REVIEW' then v_outcome=vitally_private.act_approve_review(v_member,v_case,v_person,p_payload);
  when 'RECORD_REVIEW_CONTACT' then v_outcome=vitally_private.act_record_review_contact(v_member,v_case,v_person,p_payload);
  when 'REMIND' then v_outcome=vitally_private.act_remind(v_member,v_case,v_person,p_payload);
  when 'CLOSE_CASE' then v_outcome=vitally_private.act_close_case(v_member,v_case,v_person,p_payload);
  else raise sqlstate 'VT007' using message='VALIDATION';
 end case;
 return vitally_private.commit_action(v_member,v_case,v_person,p_action_id,p_type,v_outcome,v_receipt);
end;
$$;
revoke all on function public.vitally_apply_action(uuid,uuid,bigint,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.vitally_apply_action(uuid,uuid,bigint,uuid,text,jsonb) to authenticated;
-- The assistance entry point is unchanged by this migration; its privileges are
-- re-applied here because a replacement migration must leave both entry points
-- with exactly the grants the contract fixes for them.
revoke all on function public.vitally_assistance_action(uuid,uuid,bigint,uuid,text,text) from public,anon,authenticated;
grant execute on function public.vitally_assistance_action(uuid,uuid,bigint,uuid,text,text) to authenticated;
revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
