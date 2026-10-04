-- Part 4c, Task 5 (docs/superpowers/specs/2026-09-30-intake-screens-design.md §5,
-- the sample part): the six demonstration samples follow their workspace's
-- intake version, and a checkpoint reload clears a sample's materials and
-- document-card marks.
--
--   * `seed_fixtures` is copied verbatim from 009 with one change: it reads the
--     workspace's `default_intake_version`. Version 1 inserts exactly what 009
--     did. Version 2 inserts the case empty (011's insert trigger refuses
--     anything else), then sets its answers from `fixture_answers_v2` and adds
--     its `case_contacts` row from `fixture_contact_v2`, all before the
--     scenario is applied.
--   * `apply_fixture_scenario` is copied verbatim from 009 with two deletes
--     beside the others: the case's `case_materials` and `case_document_cards`
--     (office work on a sample). It keeps `case_contacts`.
--   * Two new private functions: `fixture_answers_v2(key)`, one base answer set
--     with per-key overrides, and `fixture_contact_v2(key)`, the sample's phone,
--     best time and note.
--
-- This file changes no workspace's `default_intake_version` and not the column
-- default: it seeds version-2 samples only in workspaces already set to 2. The
-- switch-over is a later, separate migration. Every statement can be applied
-- again (`create or replace`, no table).

-- ---------------------------------------------------------------------------
-- 1. The version-2 sample data
-- ---------------------------------------------------------------------------

-- The base is makeSampleAnswers({ version: 2, seed: 0 }) without its four
-- contact fields (they live in case_contacts); its household member carries the
-- member_id 015 requires. The overrides are the six keys of 009's
-- fixture_answers in version-2 codes. No gcf_* key and no form_version.
create or replace function vitally_private.fixture_answers_v2(p_key text) returns jsonb
language sql immutable security definer set search_path='' as $$
 select '{"service":"drop_off","language":"english","tp_first_name":"Mei","tp_last_name":"Chen","tp_dob":"1984-05-12","tp_job_title":"Office assistant","addr_street":"100 Example Street","addr_city":"Philadelphia","addr_state":"PA","addr_zip":"19107","marital_status":"never_married","multi_state":"no","claimed_by_other":"no","us_citizen":["me"],"on_visa":["none"],"fulltime_student":["none"],"legally_blind":["none"],"disabled":["none"],"ippin":["none"],"digital_assets":["none"],"has_household_members":"yes","hh":[{"member_id":"000000000000000000000000000003e9","first_name":"Lin","last_name":"Chen","dob":"2015-03-14","relationship":"son_daughter","months_lived":"12","married":"single","us_citizen":"yes","resident_na":"yes","fulltime_student":"no","disabled":"no","ippin":"no"}],"inc_wages":"yes","inc_wages_job_count":"1","inc_tips":"no","inc_retirement":"no","inc_disability":"no","inc_social_security":"no","inc_unemployment":"no","inc_state_refund":"no","inc_interest_div":"no","inc_sale_assets":"no","inc_alimony":"no","inc_rental_home":"no","inc_rental_property":"no","inc_gambling":"no","inc_self_employed":"no","inc_other":"no","exp_mortgage_interest":"no","exp_taxes":"no","exp_medical":"no","exp_charity":"no","exp_student_loan":"no","exp_dependent_care":"no","exp_retirement_contrib":"no","exp_educator":"no","exp_alimony_paid":"no","evt_education":"no","evt_sold_home":"no","evt_hsa":"no","evt_marketplace":"no","evt_energy":"no","evt_other":"no","evt_debt_canceled":"no","evt_disaster":"no","evt_credit_disallowed":"no","evt_irs_letter":"no","evt_estimated_payments":"no","evt_brought_prior_return":"no","refund_method":"direct_deposit","payment_method":"bank_account","irs_language_pref":["none"],"pecf":["none"]}'::jsonb
  || jsonb_build_object('tp_first_name',v.first_name,'tp_last_name',v.last_name,
   'service',v.service,'language',v.language,'addr_zip',v.zip)
 from (values
  ('preparation_ready','Mei','Chen','drop_off','mandarin','19107'),
  ('waiting_documents','Jordan','Rivera','drop_off','cantonese','19123'),
  ('admin_followup','Linh','Tran','same_day','cantonese','19148'),
  ('review_ready','Dana','Okafor','online','english','19130'),
  ('corrections_required','Wei','Lam','drop_off','mandarin','19104'),
  ('review_approved','Tomas','Ortiz','same_day','english','19146')
 ) as v(key,first_name,last_name,service,language,zip)
 where v.key=p_key
$$;

-- Fictional phones 2155550101-2155550106 in fixture_keys() order, an evening
-- best time and one fictional note.
create or replace function vitally_private.fixture_contact_v2(p_key text)
returns table(phone text,best_contact_time text[],best_contact_note text)
language sql immutable security definer set search_path='' as $$
 select '21555501'||pg_catalog.lpad(k.n::text,2,'0'),array['weekday_evening']::text[],
  'Fictional sample; call any weekday evening.'::text
 from pg_catalog.unnest(vitally_private.fixture_keys()) with ordinality as k(key,n)
 where k.key=p_key
$$;

-- ---------------------------------------------------------------------------
-- 2. apply_fixture_scenario, verbatim from 009 plus the two deletes
-- ---------------------------------------------------------------------------

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
-- 3. seed_fixtures, verbatim from 009 plus the version-2 branch
-- ---------------------------------------------------------------------------

create or replace function vitally_private.seed_fixtures(p_workspace_id uuid,p_generation bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_key text;
 v_owner uuid;
 v_actor uuid;
 v_case public.cases;
 v_reference text;
 v_constraint text;
 v_events int;
 v_version smallint;
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
 -- Samples follow the workspace's version (spec 2026-09-30 §5).
 select w.default_intake_version into v_version from public.workspaces w where w.id=p_workspace_id;
 foreach v_key in array vitally_private.fixture_keys() loop
  select b.owner_user_id into v_owner from vitally_private.fixture_client_bindings b
   where b.workspace_id=p_workspace_id and b.fixture_key=v_key;
  -- A collision on the reference is the only failure worth retrying, exactly
  -- as `vitally_create_case` retries it.
  loop
   v_reference=vitally_private.new_reference();
   begin
    if v_version=2 then
     -- 011's insert trigger refuses version-2 answers on insert, so the case
     -- starts empty and takes its answers and its contact row straight after.
     insert into public.cases(reference,workspace_id,owner_user_id,fixture,fixture_key,origin,
       created_by_user_id,created_by_person_id,answers,stage,revision,preparation_version,intake_verified)
     values(v_reference,p_workspace_id,v_owner,true,v_key,'fixture',v_actor,null,
       '{}'::jsonb,'draft',1,0,false)
     returning * into v_case;
     update public.cases set answers=vitally_private.fixture_answers_v2(v_key) where id=v_case.id
      returning * into v_case;
     insert into public.case_contacts(workspace_id,case_id,phone,best_contact_time,best_contact_note)
     select p_workspace_id,v_case.id,c.phone,c.best_contact_time,c.best_contact_note
      from vitally_private.fixture_contact_v2(v_key) c;
    else
     insert into public.cases(reference,workspace_id,owner_user_id,fixture,fixture_key,origin,
       created_by_user_id,created_by_person_id,answers,stage,revision,preparation_version,intake_verified)
     values(v_reference,p_workspace_id,v_owner,true,v_key,'fixture',v_actor,null,
       vitally_private.fixture_answers(v_key),'draft',1,0,false)
     returning * into v_case;
    end if;
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
-- 4. Privileges: 009's closing revoke, which covers every function above, and
-- an explicit one for each new function (a new function is executable by
-- `public` until revoked).
revoke all on function vitally_private.fixture_answers_v2(text) from public,anon,authenticated,service_role;
revoke all on function vitally_private.fixture_contact_v2(text) from public,anon,authenticated,service_role;
revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;
