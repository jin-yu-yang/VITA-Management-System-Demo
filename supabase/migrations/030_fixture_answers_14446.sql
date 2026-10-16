-- OpenSpec change add-form-14446-consent (design D7): the seeded samples sign
-- Form 14446. fixture_answers_v2 is copied from 019_fixtures_v2.sql with the
-- 14446 answers added: the consent (vc_agree), the IRS-review answer, the
-- client's typed signature (the sample's own name) and a fixed date. 019 left
-- out every 15080 key because 15080 is optional; 14446 isn't, and without
-- these every sample would have three answers missing. Needs 029's fields.

-- The base is makeSampleAnswers({ version: 2, seed: 0 }) without its four
-- contact fields (they live in case_contacts); its household member carries the
-- member_id 015 requires. The overrides are the six keys of 009's
-- fixture_answers in version-2 codes. No gcf_* key and no form_version.
create or replace function vitally_private.fixture_answers_v2(p_key text) returns jsonb
language sql immutable security definer set search_path='' as $$
 select '{"service":"drop_off","language":"english","tp_first_name":"Mei","tp_last_name":"Chen","tp_dob":"1984-05-12","tp_job_title":"Office assistant","addr_street":"100 Example Street","addr_city":"Philadelphia","addr_state":"PA","addr_zip":"19107","marital_status":"never_married","multi_state":"no","claimed_by_other":"no","us_citizen":["me"],"on_visa":["none"],"fulltime_student":["none"],"legally_blind":["none"],"disabled":["none"],"ippin":["none"],"digital_assets":["none"],"has_household_members":"yes","hh":[{"member_id":"000000000000000000000000000003e9","first_name":"Lin","last_name":"Chen","dob":"2015-03-14","relationship":"son_daughter","months_lived":"12","married":"single","us_citizen":"yes","resident_na":"yes","fulltime_student":"no","disabled":"no","ippin":"no"}],"inc_wages":"yes","inc_wages_job_count":"1","inc_tips":"no","inc_retirement":"no","inc_disability":"no","inc_social_security":"no","inc_unemployment":"no","inc_state_refund":"no","inc_interest_div":"no","inc_sale_assets":"no","inc_alimony":"no","inc_rental_home":"no","inc_rental_property":"no","inc_gambling":"no","inc_self_employed":"no","inc_other":"no","exp_mortgage_interest":"no","exp_taxes":"no","exp_medical":"no","exp_charity":"no","exp_student_loan":"no","exp_dependent_care":"no","exp_retirement_contrib":"no","exp_educator":"no","exp_alimony_paid":"no","evt_education":"no","evt_sold_home":"no","evt_hsa":"no","evt_marketplace":"no","evt_energy":"no","evt_other":"no","evt_debt_canceled":"no","evt_disaster":"no","evt_credit_disallowed":"no","evt_irs_letter":"no","evt_estimated_payments":"no","evt_brought_prior_return":"no","refund_method":"direct_deposit","payment_method":"bank_account","irs_language_pref":["none"],"pecf":["none"],"vc_agree":["yes"],"vc_review":"yes","vc_tp_date":"2026-02-02"}'::jsonb
  || jsonb_build_object('tp_first_name',v.first_name,'tp_last_name',v.last_name,
   'service',v.service,'language',v.language,'addr_zip',v.zip,
   'vc_tp_signature',v.first_name||' '||v.last_name)
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

revoke all on function vitally_private.fixture_answers_v2(text) from public,anon,authenticated,service_role;
