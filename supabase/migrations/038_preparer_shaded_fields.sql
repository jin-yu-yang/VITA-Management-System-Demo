-- 038: the shaded section of Form 13614-C, filled by the preparer (OpenSpec
-- change add-preparer-13614c-fields, design D2 and D3).
--
--   * D3: `preparer_shaded_fields` holds one row per case: a flat, sparse jsonb
--     object (blank means absent), a version that counts saves, and who saved
--     last. Staff read it; only the action RPC writes it.
--   * `vitally_private.check_preparer_fields(jsonb)` is the shape check on that
--     object. It repeats the key table of `src/shaded-fields.mjs` (the browser
--     applies the same rules first; the database stays the authority). It does
--     not check the season bound on the year or the household rows with no
--     member, which need the case; the action does.
--
-- Text lengths are counted in characters (code points), as the browser counts
-- them. A text that is only space, tab, line break, form feed or vertical tab
-- is blank, and blank means absent, so it is refused.
--
-- Written to be safe to apply again on a local test stack whose
-- schema_migrations row for this file was deleted during development: every
-- statement is `if not exists`, `create or replace`, or a drop-then-add.

-- ---------------------------------------------------------------------------
-- 1. The shape check.

create or replace function vitally_private.check_preparer_fields(p jsonb) returns boolean
language plpgsql immutable security definer set search_path='' as $$
declare
 cells text[] := array['household1QualifyingChild','household1OwnSupport','household1LowIncome','household1SupportProvided','household1CostOfHome','household2QualifyingChild','household2OwnSupport','household2LowIncome','household2SupportProvided','household2CostOfHome','household3QualifyingChild','household3OwnSupport','household3LowIncome','household3SupportProvided','household3CostOfHome','household4QualifyingChild','household4OwnSupport','household4LowIncome','household4SupportProvided','household4CostOfHome'];
 boxes text[] := array['incomeW2s','incomeTips','income1099R','incomeQcd','incomeDisability','incomeSsaRrb','income1099G','incomeRefund','itemizedLastYear','itemizedLastYearYes','itemizedLastYearNo','income1099Int','income1099Div','income1099B','capitalLossCarryover','capitalLossCarryoverYes','capitalLossCarryoverNo','incomeAlimony','alimonyExcludedYes','alimonyExcludedNo','incomeRental','incomeRentalExpense','incomeW2G','incomeScheduleC','income1099Misc','income1099Nec','income1099K','incomeReportedElsewhere','incomeScheduleCExpenses','incomeOther','deduction1098','deductionStandard','deductionItemized','expense1098E','expenseChildCare','expenseIra','expenseEducator','expenseAlimony','alimonyAdjustmentYes','alimonyAdjustmentNo','infoScholarship','info1098T','infoEducationCredit','infoHomeSale','infoHsaContributions','infoHsaDistributions','info1095A','infoEnergyImprovement','infoVehicleCredit','info1099C','info1099A','infoDisasterRelief','infoDisallowed','infoLitcReferral','infoEstimatedPayments','infoPriorRefundApplied','infoLastReturnAvailable'];
 counts text[] := array['incomeW2sCount','income1099RCount','incomeDisabilityCount','incomeSsaRrbCount','income1099GCount','income1099IntCount','income1099DivCount','income1099BCount','incomeW2GCount','income1099MiscCount','income1099NecCount','income1099KCount','deduction1098Count'];
 amounts text[] := array['incomeQcdAmount','incomeRefundAmount','incomeAlimonyAmount','incomeRentalExpenseAmount','incomeScheduleCExpensesAmount','expenseEducatorAmount','expenseAlimonyAmount','infoEstimatedPaymentsAmount','infoPriorRefundAppliedAmount'];
 vins text[] := array['infoVin'];
 years text[] := array['infoDisallowedYear'];
 reasons text[] := array['infoDisallowedReason'];
 notes text[] := array['incomeNotes','deductionNotes','expenseNotes','infoNotes'];
 k text;
 v jsonb;
 s text;
begin
 if p is null or jsonb_typeof(p)<>'object' then return false; end if;
 for k, v in select key, value from jsonb_each(p) loop
  if k=any(cells) then
   if jsonb_typeof(v)<>'string' or (v#>>'{}') not in ('yes','no','na') then return false; end if;
  elsif k=any(boxes) then
   if v<>'true'::jsonb then return false; end if;
  elsif k=any(counts) then
   if jsonb_typeof(v)<>'number' or (v#>>'{}')!~'^[0-9]{1,2}$' then return false; end if;
  elsif k=any(amounts) then
   if jsonb_typeof(v)<>'string' or (v#>>'{}')!~'^(0|[1-9][0-9]{0,5})(\.[0-9]{1,2})?$' then return false; end if;
  elsif k=any(vins) then
   if jsonb_typeof(v)<>'string' or (v#>>'{}')!~'^[A-Za-z0-9]{1,17}$' then return false; end if;
  elsif k=any(years) then
   if jsonb_typeof(v)<>'string' or (v#>>'{}')!~'^[0-9]{4}$' or (v#>>'{}')::int<2000 then return false; end if;
  elsif k=any(reasons) or k=any(notes) then
   if jsonb_typeof(v)<>'string' then return false; end if;
   s:=v#>>'{}';
   if s~'^[ \t\n\r\f\v]*$' or char_length(s)>(case when k=any(reasons) then 120 else 500 end) then return false; end if;
  else
   return false;
  end if;
 end loop;
 -- The four Yes/No pairs are never both ticked.
 if (p ? 'itemizedLastYearYes' and p ? 'itemizedLastYearNo')
  or (p ? 'capitalLossCarryoverYes' and p ? 'capitalLossCarryoverNo')
  or (p ? 'alimonyExcludedYes' and p ? 'alimonyExcludedNo')
  or (p ? 'alimonyAdjustmentYes' and p ? 'alimonyAdjustmentNo') then return false; end if;
 return true;
end $$;
revoke all on function vitally_private.check_preparer_fields(jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. preparer_shaded_fields (D3): one row per case. Only the action RPC
-- writes it; the select policy is 033's presenter-only one.

create table if not exists public.preparer_shaded_fields (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 case_id uuid not null unique,
 fields jsonb not null,
 version bigint not null check(version>=1),
 updated_by_person_id uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(workspace_id,case_id) references public.cases(workspace_id,id) on delete cascade,
 foreign key(workspace_id,updated_by_person_id) references public.people(workspace_id,id)
);
alter table public.preparer_shaded_fields drop constraint if exists preparer_shaded_fields_fields_shape;
alter table public.preparer_shaded_fields add constraint preparer_shaded_fields_fields_shape check(vitally_private.check_preparer_fields(fields));
alter table public.preparer_shaded_fields enable row level security;
drop policy if exists presenter_preparer_shaded_fields on public.preparer_shaded_fields;
create policy presenter_preparer_shaded_fields on public.preparer_shaded_fields for select to authenticated using(exists(select 1 from public.memberships m join public.cases c on c.workspace_id=m.workspace_id and c.id=preparer_shaded_fields.case_id where m.workspace_id=preparer_shaded_fields.workspace_id and m.user_id=(select auth.uid()) and m.active and m.access='presenter' and (c.origin<>'client' or c.stage<>'draft')));
revoke all on public.preparer_shaded_fields from public, anon, authenticated;
grant select on public.preparer_shaded_fields to authenticated;
grant select, insert, update, delete on public.preparer_shaded_fields to service_role;
