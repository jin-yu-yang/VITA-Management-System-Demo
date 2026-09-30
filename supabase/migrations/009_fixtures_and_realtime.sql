-- The six demonstration cases, the presenter-only reset that rebuilds them,
-- and the checkpoints that move one of them to a chosen point in the story.
--
-- Three things this file is careful about.
--
--   * **A reset is not a wipe.** It deletes exactly the rows it made — cases
--     marked `fixture` and assistance items marked `fixture`, whose children
--     cascade — and nothing else. Auth users, memberships, the permanent
--     people and their capabilities, the workspace's default follow-up person,
--     the private fixture-client bindings and every case a student created are
--     all outside it. `public.action_receipts` has no foreign key to a case,
--     so receipts survive their targets by design (migration 001).
--
--   * **The deletion announces itself without naming anything.** Migration 007
--     publishes INSERT and UPDATE only, because a deleted row cannot be
--     authorized through the row-level security state it no longer has. The
--     signal is therefore one UPDATE on `public.workspaces`:
--     `fixture_generation` moves, every member of the workspace may read that
--     row, and the payload carries a workspace id and a number — no case id,
--     no reference, no answers. The browser reacts by re-reading its own lists
--     through the same RLS-scoped reads it always uses.
--
--   * **One scenario routine, two callers.** `apply_fixture_scenario` owns
--     every stage, assignment, participation record, document request,
--     follow-up, review attempt and history row that a scenario consists of.
--     The reset calls it on a freshly inserted case; a checkpoint calls it on
--     an existing fixture case, which keeps its id, its reference and its
--     bound owner. Neither holds a second copy of the data.
--
-- Everything here is `create or replace` and adds no table, so the file can be
-- re-applied as a whole: a database that already applied an earlier version of
-- this migration is either recreated from scratch, or has this file's own
-- functions and its `schema_migrations` row dropped first by a local script
-- that is not part of the repository. No object from migrations 001-008 is
-- dropped or replaced, and migration 007 keeps sole ownership of the
-- publication and its flags.

-- ---------------------------------------------------------------------------
-- Readable references
-- ---------------------------------------------------------------------------

-- The same eight characters from the same alphabet `vitally_create_case` draws
-- (`REFERENCE_ALPHABET` in src/contracts.mjs). Uniqueness is the table's job:
-- the caller retries on `cases_reference_key` and on nothing else, exactly as
-- the create path does.
create or replace function vitally_private.new_reference() returns text
language plpgsql security definer set search_path='' as $$
declare v_random bytea=extensions.gen_random_bytes(8);
 v_reference text='VT-';
begin
 for i in 0..7 loop
  if i=4 then v_reference=v_reference||'-';
 end if;
  v_reference=v_reference||substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',get_byte(v_random,i)%32+1,1);
 end loop;
 return v_reference;
end;
$$;

-- ---------------------------------------------------------------------------
-- The scenario data
-- ---------------------------------------------------------------------------

-- The six scenario keys, in the order the story runs. `cases.fixture_key` and
-- `vitally_private.fixture_client_bindings` already constrain the same six.
create or replace function vitally_private.fixture_keys() returns text[]
language sql immutable security definer set search_path='' as $$
 select array['preparation_ready','waiting_documents','admin_followup','review_ready','corrections_required','review_approved']
$$;

-- The checkpoint vocabulary the browser may ask for, mapped to the scenario
-- that produces it. An unknown name maps to nothing and is refused.
create or replace function vitally_private.checkpoint_scenario(p_checkpoint text) returns text
language sql immutable security definer set search_path='' as $$
 select case p_checkpoint
  when 'intake_ready' then 'preparation_ready'
  when 'document_requested' then 'waiting_documents'
  when 'admin_followup_needed' then 'admin_followup'
  when 'ready_for_review' then 'review_ready'
  when 'corrections_required' then 'corrections_required'
 end
$$;

-- One fictional intake answer set per scenario, with all seventeen whitelisted
-- keys (`vitally_private.intake_answer_keys`, migration 003) and values from
-- the vocabularies the client's own form offers. The names are invented, the
-- addresses are withheld, and there is no email, phone number or identifier of
-- any real person anywhere in them: a screening that continues, nothing more.
create or replace function vitally_private.fixture_answers(p_key text) returns jsonb
language sql immutable security definer set search_path='' as $$
 select jsonb_build_object(
  'service',v.service,'year','2025','language',v.language,
  'residenceCity','Philadelphia','residenceState','PA','city','Philadelphia','state','PA',
  'rideshare',v.rideshare,'other','no','stocks','no',
  'firstName',v.first_name,'lastName',v.last_name,'address',v.address,'zip',v.zip,
  'household',v.household,'helper','self','documents',v.documents)
 from (values
  ('preparation_ready','Drop-off','Mandarin','no','Mei','Chen','Sample address withheld','19107','1','ready'),
  ('waiting_documents','Drop-off','Cantonese','yes','Jordan','Rivera','Fictional address withheld','19123','2','some'),
  ('admin_followup','Same-day','Cantonese','no','Linh','Tran','Example address withheld','19148','3','some'),
  ('review_ready','Online','English','yes','Dana','Okafor','Sample address withheld','19130','1','ready'),
  ('corrections_required','Drop-off','Mandarin','no','Wei','Lam','Fictional address withheld','19104','4','ready'),
  ('review_approved','Same-day','English','no','Tomas','Ortiz','Example address withheld','19146','2','ready')
 ) as v(key,service,language,rideshare,first_name,last_name,address,zip,household,documents)
 where v.key=p_key
$$;

-- The history each scenario leaves behind, oldest first. `person_key` names
-- the staff person the entry belongs to and is null for the client's own
-- actions; `message` is the plain-language line the client reads and is null
-- for internal-only work, exactly as the live handlers decide it. The client
-- sentences are the same strings migrations 003-006 write, so a seeded case
-- and a played-through case read identically.
create or replace function vitally_private.fixture_history(p_key text)
returns table(seq int,action text,person_key text,detail jsonb,message text)
language sql immutable security definer set search_path='' as $$
 select v.seq,v.action,v.person_key,v.detail,v.message from (values
  ('preparation_ready',1,'SUBMIT',null::text,'{"simulated":true,"screening":"continue"}'::jsonb,'Application received. A volunteer will check your information and documents.'::text),
  ('preparation_ready',2,'VERIFY_INTAKE','sam','{"simulated":true,"checks":{"interview":true,"identity":true,"documents":true,"consent":true}}','Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.'),

  ('waiting_documents',1,'SUBMIT',null,'{"simulated":true,"screening":"continue"}','Application received. A volunteer will check your information and documents.'),
  ('waiting_documents',2,'VERIFY_INTAKE','sam','{"simulated":true,"checks":{"interview":true,"identity":true,"documents":true,"consent":true}}','Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.'),
  ('waiting_documents',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('waiting_documents',4,'REQUEST_DOCUMENT','alex','{"simulated":true,"title":"Mileage record"}','A volunteer requested a document: Mileage record'),

  ('admin_followup',1,'SUBMIT',null,'{"simulated":true,"screening":"continue"}','Application received. A volunteer will check your information and documents.'),
  ('admin_followup',2,'VERIFY_INTAKE','sam','{"simulated":true,"checks":{"interview":true,"identity":true,"documents":true,"consent":true}}','Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.'),
  ('admin_followup',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('admin_followup',4,'REQUEST_DOCUMENT','alex','{"simulated":true,"title":"Mileage record"}','A volunteer requested a document: Mileage record'),
  ('admin_followup',5,'ESCALATE_CONTACT','alex','{"simulated":true}',null),
  ('admin_followup',6,'RECORD_CONTACT','sam','{"simulated":true,"outcome":"no_answer"}',null),

  ('review_ready',1,'SUBMIT',null,'{"simulated":true,"screening":"continue"}','Application received. A volunteer will check your information and documents.'),
  ('review_ready',2,'VERIFY_INTAKE','sam','{"simulated":true,"checks":{"interview":true,"identity":true,"documents":true,"consent":true}}','Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.'),
  ('review_ready',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('review_ready',4,'REQUEST_DOCUMENT','alex','{"simulated":true,"title":"Mileage record"}','A volunteer requested a document: Mileage record'),
  ('review_ready',5,'RECORD_DOCUMENT_RESPONSE','sam','{"simulated":true,"source":"staff_recorded"}','A sample document was recorded by staff and is awaiting verification.'),
  ('review_ready',6,'VERIFY_DOCUMENT','alex','{"simulated":true}','A volunteer verified your document. No further action is needed for this request.'),
  ('review_ready',7,'SUBMIT_REVIEW','alex','{"simulated":true,"preparationVersion":1}','Your volunteer recorded that preparation is complete in the tax software. An independent reviewer will check it next.'),

  ('corrections_required',1,'SUBMIT',null,'{"simulated":true,"screening":"continue"}','Application received. A volunteer will check your information and documents.'),
  ('corrections_required',2,'VERIFY_INTAKE','sam','{"simulated":true,"checks":{"interview":true,"identity":true,"documents":true,"consent":true}}','Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.'),
  ('corrections_required',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('corrections_required',4,'SUBMIT_REVIEW','alex','{"simulated":true,"preparationVersion":1}','Your volunteer recorded that preparation is complete in the tax software. An independent reviewer will check it next.'),
  ('corrections_required',5,'CLAIM_REVIEW','morgan','{"simulated":true}','An independent reviewer is checking your return.'),
  ('corrections_required',6,'REQUEST_CORRECTIONS','morgan','{"simulated":true,"preparationVersion":1}','The reviewer asked your preparer to make corrections. No action is needed from you right now.'),

  ('review_approved',1,'SUBMIT',null,'{"simulated":true,"screening":"continue"}','Application received. A volunteer will check your information and documents.'),
  ('review_approved',2,'VERIFY_INTAKE','sam','{"simulated":true,"checks":{"interview":true,"identity":true,"documents":true,"consent":true}}','Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.'),
  ('review_approved',3,'CLAIM_PREPARATION','alex','{"simulated":true}','A volunteer has started preparing your return.'),
  ('review_approved',4,'SUBMIT_REVIEW','alex','{"simulated":true,"preparationVersion":1}','Your volunteer recorded that preparation is complete in the tax software. An independent reviewer will check it next.'),
  ('review_approved',5,'CLAIM_REVIEW','morgan','{"simulated":true}','An independent reviewer is checking your return.'),
  ('review_approved',6,'REQUEST_CORRECTIONS','morgan','{"simulated":true,"preparationVersion":1}','The reviewer asked your preparer to make corrections. No action is needed from you right now.'),
  ('review_approved',7,'RESUBMIT_REVIEW','alex','{"simulated":true,"preparationVersion":2}','Your volunteer recorded the requested corrections in the tax software. An independent reviewer will check the updated return.'),
  ('review_approved',8,'CLAIM_REVIEW','morgan','{"simulated":true}','An independent reviewer is checking your return.'),
  ('review_approved',9,'APPROVE_REVIEW','morgan','{"simulated":true,"preparationVersion":2}','Independent review is complete. A volunteer will contact you about next steps. Signing and filing are later milestones and are not done yet.')
 ) as v(key,seq,action,person_key,detail,message)
 where v.key=p_key
 order by v.seq
$$;

-- ---------------------------------------------------------------------------
-- The one scenario routine
-- ---------------------------------------------------------------------------

-- Put one case into one scenario: clear whatever workflow records it holds,
-- write the scenario's own, and set the case columns that go with them. The
-- case row itself — its id, its reference, its owner, its answers — is never
-- touched here, which is what lets a checkpoint reuse this on a live case.
--
-- `p_actor` is the workspace member recorded on the rows whose columns demand
-- one (`contact_attempts.actor_user_id` and `documents.submitted_by_user_id`
-- are not null and reference `memberships`). History rows deliberately carry
-- no actor user at all: they were seeded, not performed, and every detail is
-- marked `simulated`.
--
-- Returns the number of history entries written, which is what the reset turns
-- into a plausible starting revision.
create or replace function vitally_private.apply_fixture_scenario(p_case public.cases,p_scenario text,p_actor uuid)
returns int language plpgsql security definer set search_path='' as $$
declare v_alex uuid;
 v_morgan uuid;
 v_sam uuid;
 v_request uuid;
 v_followup uuid;
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
 delete from public.admin_followups where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.documents where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.document_requests where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.preparation_participants where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.reviews where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.case_events where workspace_id=p_case.workspace_id and case_id=p_case.id;
 delete from public.client_events where workspace_id=p_case.workspace_id and case_id=p_case.id;

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

 -- The office's contact task, with one unanswered call already recorded on it.
 -- Recording an attempt never resolves the task, so it is still open.
 if p_scenario='admin_followup' then
  insert into public.admin_followups(workspace_id,case_id,request_id,assignee_person_id,status,reason,created_by_person_id)
  values(p_case.workspace_id,p_case.id,v_request,v_sam,'open','No response to the document request.',v_alex)
  returning id into v_followup;
  insert into public.contact_attempts(workspace_id,case_id,followup_id,actor_user_id,actor_person_id,outcome,note)
  values(p_case.workspace_id,p_case.id,v_followup,p_actor,v_sam,'no_answer','Called during office hours. No answer, so a message was left.');
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
-- Seeding
-- ---------------------------------------------------------------------------

-- Build the whole demonstration set in one workspace: six cases and the single
-- assistance request beside them. Private on purpose — the classroom setup and
-- the tests can reach it through the same owner-only connection the workspace
-- initializer uses, and no sixth public RPC exists for it.
--
-- Each case gets a fresh id and a fresh reference, and the saved fixture-client
-- binding decides its owner: a bound scenario belongs to that account after
-- every reset, an unbound one has no client account at all.
--
-- Returns `{fixture_key: case id}` for the six cases it created.
create or replace function vitally_private.seed_fixtures(p_workspace_id uuid,p_generation bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_key text;
 v_owner uuid;
 v_actor uuid;
 v_case public.cases;
 v_reference text;
 v_constraint text;
 v_events int;
 v_ids jsonb='{}'::jsonb;
begin
 if p_workspace_id is null or p_generation is null then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 -- The member recorded on the rows that require one. A presenter is the only
 -- account that could have performed this work, and a workspace with none is
 -- not ready to be seeded.
 select m.user_id into v_actor from public.memberships m
  where m.workspace_id=p_workspace_id and m.active and m.access='presenter'
  order by m.user_id limit 1;
 if v_actor is null then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 foreach v_key in array vitally_private.fixture_keys() loop
  select b.owner_user_id into v_owner from vitally_private.fixture_client_bindings b
   where b.workspace_id=p_workspace_id and b.fixture_key=v_key;
  -- A collision on the reference is the only failure worth retrying, exactly
  -- as `vitally_create_case` retries it.
  loop
   v_reference=vitally_private.new_reference();
   begin
    insert into public.cases(reference,workspace_id,owner_user_id,fixture,fixture_key,origin,
      created_by_user_id,created_by_person_id,answers,stage,revision,preparation_version,intake_verified)
    values(v_reference,p_workspace_id,v_owner,true,v_key,'fixture',v_actor,null,
      vitally_private.fixture_answers(v_key),'draft',1,0,false)
    returning * into v_case;
    exit;
   exception when unique_violation then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint<>'cases_reference_key' then raise;
 end if;
   end;
  end loop;
  v_events=vitally_private.apply_fixture_scenario(v_case,v_key,v_actor);
  -- One entry per recorded step, so the revision a browser sends back matches
  -- the history the case shows. The first internal entry names the generation
  -- that produced this set as a convenience for anyone reading the timeline;
  -- `public.workspaces.fixture_generation` is the authoritative record, and a
  -- later checkpoint on this case deletes every `case_events` row it has —
  -- this one included.
  insert into public.case_events(workspace_id,case_id,actor_user_id,actor_person_id,action,detail,created_at)
  values(p_workspace_id,v_case.id,null,null,'FIXTURE_SEEDED',
   jsonb_build_object('simulated',true,'fixtureKey',v_key,'generation',p_generation),
   now()-make_interval(hours=>v_events+1));
  update public.cases set revision=v_events+2 where id=v_case.id;
  v_ids=v_ids||jsonb_build_object(v_key,v_case.id);
 end loop;
 -- The one assistance request, on the case the office is already chasing, so
 -- the follow-up screen has the language and the contact preference the office
 -- recorded when this client asked for help with the forms (Ruling R57).
 insert into public.assistance_items(workspace_id,case_id,title,status,revision,assignee_person_id,
   language,contact_preference,fixture)
 values(p_workspace_id,(v_ids->>'admin_followup')::uuid,'Client needs help completing intake forms',
   'open',1,null,'Cantonese','Prefers calls from the main office',true);
 return v_ids;
end;
$$;

-- ---------------------------------------------------------------------------
-- The two presenter entry points
-- ---------------------------------------------------------------------------

-- Rebuild this workspace's demonstration set.
--
-- The ordered checks are the shared ones (contracts, "SQL errors and
-- validation order"): the caller's membership, then the authority the
-- operation needs, then the caller's own receipt for this action id. There is
-- no target to lock — the operation names the caller's workspace and nothing
-- else — so step 3 has nothing to do.
--
-- Replaying the same action id returns the stored receipt and stops: no second
-- deletion, no second seeding, and no second increment of the generation.
create or replace function public.vitally_reset_fixtures(p_action_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.memberships;
 v_receipt public.action_receipts;
 v_digest text;
 v_generation bigint;
 v_ids jsonb;
 v_result jsonb;
begin
 v_member=vitally_private.require_membership();
 if p_action_id is null then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 -- Presenter work, and only presenter work. A client is refused before
 -- anything is reserved, so their attempt leaves no receipt behind either.
 if v_member.access<>'presenter' then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 -- The request has no arguments beyond its own identity, so the digest is the
 -- operation: the same action id with a different operation is a VALIDATION.
 v_digest=encode(extensions.digest(jsonb_build_object('operation','RESET_FIXTURES')::text,'sha256'),'hex');
 v_receipt=vitally_private.reserve_receipt(v_member,p_action_id,'RESET_FIXTURES',v_digest,null);
 if v_receipt.receipt is not null then return v_receipt.receipt;
 end if;
 -- Two presenters can press the button at the same moment. Without this the
 -- second one would delete the first one's cases and then collide with them on
 -- `cases_one_fixture_key`; with it the second simply waits, replaces what the
 -- first seeded, and the generation moves once per accepted reset.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_member.workspace_id::text,0));
 -- Fixture rows only. Children cascade from the case; `action_receipts` has no
 -- foreign key to one and is deliberately left where it is.
 --
 -- `assistance_items.case_id` is one of those children (`on delete cascade`,
 -- migration 002), so an item linked to a fixture case goes with the case even
 -- when the item itself is not marked `fixture`. Latent today: nothing a
 -- presenter or a client can do creates an assistance item against a fixture
 -- case — the seeded one is itself a fixture row, and the browser has no
 -- create-item path at all.
 delete from public.cases where workspace_id=v_member.workspace_id and fixture;
 delete from public.assistance_items where workspace_id=v_member.workspace_id and fixture;
 -- The shared signal, in a row every member of this workspace may read. It
 -- carries a number, not a case: the browser re-reads its own lists.
 update public.workspaces set fixture_generation=fixture_generation+1
  where id=v_member.workspace_id returning fixture_generation into v_generation;
 v_ids=vitally_private.seed_fixtures(v_member.workspace_id,v_generation);
 v_result=jsonb_build_object('actionId',p_action_id,'generation',v_generation,'fixtureCaseIds',v_ids);
 update public.action_receipts set receipt=v_result where id=v_receipt.id;
 return v_result;
end;
$$;
revoke all on function public.vitally_reset_fixtures(uuid) from public,anon,authenticated;
grant execute on function public.vitally_reset_fixtures(uuid) to authenticated;

-- Move one demonstration case to a chosen point in the story.
--
-- The case keeps everything that identifies it — its id, its readable
-- reference and its bound client — and exchanges only its workflow records for
-- the checkpoint's. The ordered checks are the case-action ones: membership,
-- authority, the caller's receipt, then the target through permitted
-- visibility (absent, another workspace's and another applicant's case are one
-- NOT_FOUND), then the expected revision, then that it is a fixture case at
-- all — CONFLICT ahead of VALIDATION, as everywhere else.
create or replace function public.vitally_load_checkpoint(p_action_id uuid,p_case_id uuid,p_expected_revision bigint,p_checkpoint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_member public.memberships;
 v_receipt public.action_receipts;
 v_case public.cases;
 v_digest text;
 v_scenario text;
 v_revision bigint;
 v_result jsonb;
begin
 v_member=vitally_private.require_membership();
 if p_action_id is null or p_case_id is null or p_expected_revision is null or p_checkpoint is null then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 if v_member.access<>'presenter' then
  raise sqlstate 'VT001' using message='FORBIDDEN';
 end if;
 v_scenario=vitally_private.checkpoint_scenario(p_checkpoint);
 if v_scenario is null then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 v_digest=encode(extensions.digest(jsonb_build_object('operation','LOAD_CHECKPOINT','caseId',p_case_id,
  'expectedRevision',p_expected_revision,'checkpoint',p_checkpoint)::text,'sha256'),'hex');
 v_receipt=vitally_private.reserve_receipt(v_member,p_action_id,'LOAD_CHECKPOINT',v_digest,null);
 -- The replay never reaches the target, which may since have been reset away.
 if v_receipt.receipt is not null then return v_receipt.receipt;
 end if;
 v_case=vitally_private.lock_case(v_member,p_case_id);
 -- CONFLICT comes before every VALIDATION (contracts, "SQL errors and
 -- validation order", step 5; the same order as `006_review.sql`): a caller
 -- holding a stale revision is told so first, whatever the target turns out to
 -- be, so a refusal never depends on which of the two a target failed.
 if v_case.revision<>p_expected_revision then
  raise sqlstate 'VT003' using message='CONFLICT';
 end if;
 -- A case a student created is not a demonstration case and is never rewritten
 -- by this. It is visible to the caller, so saying so is a validation answer
 -- rather than the indistinguishable NOT_FOUND above.
 if not v_case.fixture then
  raise sqlstate 'VT007' using message='VALIDATION';
 end if;
 perform vitally_private.apply_fixture_scenario(v_case,v_scenario,v_member.user_id);
 -- The one entry that says what really happened: a checkpoint was loaded, and
 -- the records around it are simulated.
 insert into public.case_events(workspace_id,case_id,actor_user_id,actor_person_id,action,detail)
 values(v_case.workspace_id,v_case.id,v_member.user_id,null,'CHECKPOINT',
  jsonb_build_object('checkpoint',p_checkpoint,'simulated',true));
 update public.cases set revision=revision+1,updated_at=now()
  where id=v_case.id returning revision into v_revision;
 v_result=jsonb_build_object('actionId',p_action_id,'caseId',v_case.id,'reference',v_case.reference,'revision',v_revision);
 update public.action_receipts set target_id=v_case.id,target_reference=v_case.reference,receipt=v_result
  where id=v_receipt.id;
 return v_result;
end;
$$;
revoke all on function public.vitally_load_checkpoint(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.vitally_load_checkpoint(uuid,uuid,bigint,text) to authenticated;

revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
