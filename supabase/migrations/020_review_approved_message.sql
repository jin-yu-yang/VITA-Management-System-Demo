-- Wording review (#48): the client's line when a review is approved now says
-- that signing and filing come next, in place of "Signing and filing are
-- later milestones and are not done yet". It matches the status text in
-- src/domain.mjs (review_approved) and its 简体 in src/client-text.mjs.
--
--   * act_approve_review is copied verbatim from 006 with only its message
--     changed.
--   * fixture_history is copied verbatim from 009 with only the
--     review_approved scenario's APPROVE_REVIEW message changed, so a seeded
--     case and a played-through case still read identically.
--
-- History rows already stored keep the old sentence; the client text table
-- keeps its 简体 for it. Every statement can be applied again.

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
  'message','Your return has been checked by the reviewer. A volunteer will contact you soon to sign and file.');
end;
$$;

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
  ('review_approved',9,'APPROVE_REVIEW','morgan','{"simulated":true,"preparationVersion":2}','Your return has been checked by the reviewer. A volunteer will contact you soon to sign and file.')
 ) as v(key,seq,action,person_key,detail,message)
 where v.key=p_key
 order by v.seq
$$;
