# Preparer 13614-C Shaded Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The case's preparer fills the 106 shaded fields of the 13614-C, in a pdf.js editor or by download and upload. The values are saved as checked data through `SAVE_PREPARER_FIELDS`, and the staff draft fills them in all three forms.

**Architecture:** One pure module holds the 106-field table and the reading and checking rules. Both input paths (the pdf.js layer, and the pdf-lib upload reader) produce `{pdfFieldName: raw}` for it, and the database mirrors its rules as the authority. `draft-pdf.mjs` gains an editing copy (a partial flatten that keeps only the shaded fields live), and `draft-form.mjs` fills stored values into the normal draft. The pdf.js editor is a dialog element beside `#app`, so the full-page re-render never touches it.

**Tech Stack:** Browser ES modules (no build step at request time); pdf-lib 1.17.1 plus @pdf-lib/fontkit (vendored); pdfjs-dist 6.4.299, legacy build (vendored); Supabase Postgres with plpgsql RPCs; `node:test`; Playwright (`tests/browser.mjs`).

**Spec:** `openspec/changes/add-preparer-13614c-fields/`. Read `design.md` (D1–D10) and `specs/shaded-section/spec.md`, `specs/draft-13614c/spec.md` and `specs/screen-states/spec.md`. `brainstorm.md` has the reasons and the builder-check calls.

## Global Constraints

- Fictional data only in code, tests and fixtures. Never touch `src/pcdc-logo.png`.
- Migrations are hand-written and never edited once applied. One new file: `supabase/migrations/<next>_preparer_shaded_fields.sql`, numbered with the next free number. Re-check the number when the PR opens. Every statement must be re-runnable (`if not exists`, `create or replace`, drop-then-add), as in 033.
- Redefined SQL functions are copied **verbatim from their latest migration**, with new lines marked `-- <next>`. Latest versions today: `check_payload` in 037, `vitally_apply_action` and `check_operation_authority` in 036, `apply_fixture_scenario` in 037. Tell the group before touching them (#90 overlap).
- Staff screens are English. This change adds no client text, so `src/client-text.mjs` and `src/zh-hant.mjs` stay unchanged.
- Only intake version 2 exists. Don't touch the catalogue.
- Never run `supabase start` from the repo root. Use `$VITALLY_STACK` (docs/setup.md).
- The vendor allowlist is `^/src/vendor/[a-z-]+\.mjs$`. The new files are exactly `src/vendor/pdfjs.mjs` and `src/vendor/pdfjs-worker.mjs`.
- Error codes come from the existing set: `VALIDATION` (VT007), `CONFLICT` (VT003), `INVALID_TRANSITION` (VT004), `FORBIDDEN` (VT001), `INELIGIBLE` (VT006).
- Exact copy:
  - stamps: "DRAFT – online answers and preparer entries" and "DRAFT – prepared from online answers";
  - "This copy has no form fields. In Chrome, use the download button, not Print.";
  - "The editor could not be opened. Try again, or use Download to fill elsewhere.";
  - "Discard your changes?";
  - "Saved elsewhere since you opened this. Close and reopen to see the latest.";
  - "Continued from page <n>, <block> notes:";
  - buttons "Fill the shaded section", "Download to fill elsewhere", "Upload the filled copy";
  - History: "saved the shaded section".
- Browser support for the editor: Chrome / Edge 125+, Firefox ESR+, Safari 18+.

## Review Focus

1. **Whitespace-only input.** A cell, count or note holding only spaces is blank and absent, not refused (Task 2 test `blank means absent`).
2. **Checkbox export values.** pdf.js and other PDF programs report a ticked box as `"Yes"`, `"On"`, `"1"`, `true` or the box's own export name. Anything except `"Off"`, `false`, `""` or `null` is ticked (Task 2 test `any export value ticks`, Task 9 test `rawFromPdfjs reads ticked boxes`).
3. **Leading zeros.** A count typed `02` is 2, while `2.0` and `-1` are refused (Task 2 test `counts`).
4. **A non-PDF or broken upload.** It gets an in-place sentence ("This file isn't a PDF the editor can read."), not "Something went wrong." (Task 6 test `a broken file is refused with a sentence`).
5. **A double press of Save.** A second press while the first is in flight sends nothing, so it can't cause a false `CONFLICT` (Task 9 test `save is single-flight`).

---

### Task 1: Spike (throwaway, before Tue Oct 27)

No tests and no commits to the branch. Work in a scratch folder.

- [ ] **Step 1:** Partial flatten. Load `src/forms/f13614c-2025.pdf` with npm `pdf-lib`. Flatten every field except the 106 names in the table (Task 2). Pass if `getForm().getFields().length === 106` and page 1's drawn answers remain (render it with pdf.js and look). Note how shared parent fields behave.
- [ ] **Step 2:** Chinese text in a live field. Set `/V` on `IncomeIncludedComments` to "收入说明：一份 W-2" without an appearance, and set AcroForm `NeedAppearances true`. Open it in pdf.js (forms enabled) and in Chrome's viewer. Pass if both show the text.
- [ ] **Step 3:** pdf.js legacy build: render an editing copy whose client first name is "美玲". Record any `.bcmap` request, the selectors of the annotation-layer inputs, and that `getFieldObjects()` keys by full field name.
- [ ] **Step 4:** Record the findings in the ledger. If step 1 fails, D6's fallback applies: the read-only flag on non-shaded fields, which changes Task 5. If step 2 fails, stop: Latin-only text is a contract change and goes to the user. If `.bcmap` files are requested, Task 8 adds a narrow allowlist entry in `server.mjs` with a `tests/server.test.mjs` case and a backend.md line. In every one of those cases, tell the user and run `/opsx:update` before Task 5.

### Task 2: The shaded-field table and reader

**Files:**
- Create: `src/shaded-fields.mjs`
- Test: `tests/shaded-fields.test.mjs`

**Interfaces:**
- Produces:
  - `SHADED_FIELDS`: a frozen array of `{ key, en, zh, kind, label, block }`. `en` and `zh` are the full field names with the `form1[0].` prefix. `kind` is one of `"cell" | "box" | "count" | "amount" | "vin" | "year" | "reason" | "note"`. `block` is one of `"household" | "income" | "deduction" | "expense" | "info"`.
  - `SHADED_PAIRS`: `[[yesKey, noKey], …]` (4 pairs).
  - `shadedName(key, form)`: the field name; form `"en" | "zh-s" | "zh-t"`.
  - `shadedNames(form)`: string[] of 106 names.
  - `readShaded(raw, { form = "en", householdSize, season })`: `{ values, errors }`. `raw` is `{ [pdfFieldName]: string | boolean | null }`, `values` is the sparse stored object, and `errors` is `[{ key, label, message }]`.
  - `checkShaded(values, { householdSize, season })`: the same rules applied to stored-shape values, returning `errors`.
  - `shadedPrint(key, value)`: the text to print (`"Yes" | "No" | "N/A"` for cells, `String(value)` otherwise).
  - `shadedLabel(key)`: the History label.
  - Constants: `COUNT_MAX = 99`, `AMOUNT = /^(0|[1-9][0-9]{0,5})(\.[0-9]{1,2})?$/`, `VIN = /^[A-Za-z0-9]{1,17}$/`, `REASON_MAX = 120`, `NOTE_MAX = 500`, `YEAR_MIN = 2000`.

**The keys (the contract; the database repeats them):**

| block | PDF name under `form1[0].` (English; `[0]` on every part) | key | kind |
|---|---|---|---|
| household | `page1.namesOf.Row{n}.qualifyingChildDependent` / `ownSupport` / `lessThanIncome` / `supportForPerson` / `costMaintainingHome` (n = 1–4) | `household{n}QualifyingChild` / `OwnSupport` / `LowIncome` / `SupportProvided` / `CostOfHome` | cell |
| income | `page2.incomeIncluded.formW2s`, `formW2sNumber` | `incomeW2s`, `incomeW2sCount` | box, count |
| income | `tipsBasicReported` | `incomeTips` | box |
| income | `form1099R`, `form1099RNumber` | `income1099R`, `income1099RCount` | box, count |
| income | `qualifiedCharitableDistribution`, `qualifiedCharitableAmount` | `incomeQcd`, `incomeQcdAmount` | box, amount |
| income | `disabilityBenefits`, `disabilityBenefitsNumber` | `incomeDisability`, `incomeDisabilityCount` | box, count |
| income | `ssaRRB1099`, `ssaRRB1099Number` | `incomeSsaRrb`, `incomeSsaRrbCount` | box, count |
| income | `form1099G`, `form1099GNumber` | `income1099G`, `income1099GCount` | box, count |
| income | `refund.refund`, `refund.refundAmount` | `incomeRefund`, `incomeRefundAmount` | box, amount |
| income | `itemizedLastYear.itemizedLastYear` / `.itemizedYes` / `.itemizedNo` | `itemizedLastYear`, `itemizedLastYearYes`, `itemizedLastYearNo` | box ×3 |
| income | `form1099INTDIV.form1099INT` / `form1099INTNumber` / `form1099DIV` / `form1099DIVNumber` | `income1099Int`, `income1099IntCount`, `income1099Div`, `income1099DivCount` | box, count, box, count |
| income | `form1099B.form1099B` / `form1099BNumber` | `income1099B`, `income1099BCount` | box, count |
| income | `form1099B.capitalLossCarryover.capitalLossCarryover` / `…Yes` / `…No` | `capitalLossCarryover`, `capitalLossCarryoverYes`, `capitalLossCarryoverNo` | box ×3 |
| income | `alimonyIncome.alimonyIncome` / `alimonyAmount` / `excludedYes` / `excludedNo` | `incomeAlimony`, `incomeAlimonyAmount`, `alimonyExcludedYes`, `alimonyExcludedNo` | box, amount, box, box |
| income | `rentalIncome.rentalIncome` / `rentalExpense` / `rentalExpenseAmount` | `incomeRental`, `incomeRentalExpense`, `incomeRentalExpenseAmount` | box, box, amount |
| income | `formW2G.formW2G` / `formW2GNumber` | `incomeW2G`, `incomeW2GCount` | box, count |
| income | `scheduleC` | `incomeScheduleC` | box |
| income | `form1099MISC` / `form1099MISCNumber`, `form1099NEC` / `form1099NECNumber`, `form1099K` / `form1099KNumber` | `income1099Misc`, `income1099MiscCount`, `income1099Nec`, `income1099NecCount`, `income1099K`, `income1099KCount` | box, count ×3 |
| income | `otherInomceReported` | `incomeReportedElsewhere` | box |
| income | `scheduleCExpenses` / `scheduleCExpensesAmount` | `incomeScheduleCExpenses`, `incomeScheduleCExpensesAmount` | box, amount |
| income | `otherIncome.otherIncome` | `incomeOther` | box |
| income | `page2.IncomeIncludedComment.IncomeIncludedComments` | `incomeNotes` | note |
| deduction | `page3.stndardItemizedDeductions.form1098` / `form1098Number` / `standardDeduction` / `itemizedDeduction` | `deduction1098`, `deduction1098Count`, `deductionStandard`, `deductionItemized` | box, count, box, box |
| deduction | `page3.stndardItemizedComments.stndardItemizedComments` | `deductionNotes` | note |
| expense | `page3.expensesToReport.form1098E` / `childDependentCare` / `iraBasicRoth` / `educatorExpensesDeduction` / `educatorExpensesDeductionAmount` | `expense1098E`, `expenseChildCare`, `expenseIra`, `expenseEducator`, `expenseEducatorAmount` | box ×4, amount |
| expense | `alimonyPayments.alimonyPayments` / `alimonyPaymentsAmount` / `adjustementYes` / `adjustementNo` | `expenseAlimony`, `expenseAlimonyAmount`, `alimonyAdjustmentYes`, `alimonyAdjustmentNo` | box, amount, box, box |
| expense | `page3.expensesReportComments.expensesReportComments` | `expenseNotes` | note |
| info | `page3.informationToReport.taxableScholarshipIncome` / `form1098T` / `educationCreditTuition` / `saleOfHome` / `hsaContributions` / `hsaDistributions` / `form1095A` | `infoScholarship`, `info1098T`, `infoEducationCredit`, `infoHomeSale`, `infoHsaContributions`, `infoHsaDistributions`, `info1095A` | box ×7 |
| info | `efficientHomeImprovement.efficientHomeImprovement` (**zh: `efficientHomeImprovement` only**) | `infoEnergyImprovement` | box |
| info | `vinNumber.numberVIN` / `vinNumber.vinNumber` | `infoVehicleCredit`, `infoVin` | box, vin |
| info | `form1099C` / `form1099A` / `disasterReliefImpacts` / `disallowedPreviousYear` | `info1099C`, `info1099A`, `infoDisasterRelief`, `infoDisallowed` | box ×4 |
| info | `YearDisallowedReason.yearDisallowed` / `.reasonDisallowed` | `infoDisallowedYear`, `infoDisallowedReason` | year, reason |
| info | `eligibleLITCReferral` | `infoLitcReferral` | box |
| info | `estimatedTaxPayments.estimatedTaxPayments` / `.taxPaymentsAmount` | `infoEstimatedPayments`, `infoEstimatedPaymentsAmount` | box, amount |
| info | `lastYearsRefund.lastYearsRefund` / `.refundAmount` | `infoPriorRefundApplied`, `infoPriorRefundAppliedAmount` | box, amount |
| info | `lastReturnAvailable` | `infoLastReturnAvailable` | box |
| info | `page3.informationReportComment.informationReportComment` | `infoNotes` | note |

Pairs: `itemizedLastYearYes/No`, `capitalLossCarryoverYes/No`, `alimonyExcludedYes/No`, `alimonyAdjustmentYes/No`.

Labels come from the form's tooltip wording (e.g. "W-2s", "W-2s #", "Refund $"). Household labels are "Row <n>: <column>". Notes are "Income notes", "Standard or itemized deductions notes", "Expenses to report notes" and "Information to report notes".

- [ ] **Step 1: Write the failing tests** in `tests/shaded-fields.test.mjs`:
  - `the table names every shaded field in all three forms`: load each `FORM_FILES` PDF with npm `pdf-lib`. Every `shadedName(key, form)` resolves with `form.getField`. Box kinds are `PDFCheckBox` and the others `PDFTextField`. `SHADED_FIELDS.length === 106`, and the keys are unique.
  - `the one name that differs`: `shadedName("infoEnergyImprovement","en")` ends with `efficientHomeImprovement[0].efficientHomeImprovement[0]`, and the `zh-s` / `zh-t` names end with `informationToReport[0].efficientHomeImprovement[0]`.
  - `cells`: `y`, `Yes`, `N`, `no`, `n/a` and `NA` read as `yes/yes/no/no/na/na`; `maybe` gives one error naming "Row 1: …".
  - `any export value ticks`: `"Yes"`, `"On"`, `"1"`, `true` and `"/Choice1"` all give `true`; `"Off"`, `false`, `""` and `null` give absent.
  - `counts`: `02` → 2 (a JSON integer); `120`, `2.0` and `-1` are errors.
  - `amounts`: `$1,250.50` → `"1250.50"`; `1000000` and `12.345` are errors.
  - `vin, year, reason`: an 18-character VIN is an error. With `season: 2026`, 2025 is accepted and 2026 and 1999 are errors. A 121-character reason is an error.
  - `notes`: 500 characters with line breaks are accepted, 501 is an error, and Chinese is kept as typed.
  - `blank means absent`: `"   "` in a cell, count or note gives no key and no error.
  - `pairs`: Yes and No both ticked gives an error naming the pair.
  - `empty rows`: with `householdSize: 2`, a value on `household3QualifyingChild` gives an error naming "Row 3"; rows above 4 never exist.
  - `unknown keys`: `checkShaded({ nope: true })` gives an error.
- [ ] **Step 2:** Run `node --test tests/shaded-fields.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `src/shaded-fields.mjs`. It is pure, with no DOM and no PDF library, following `src/questionnaires.mjs`'s style. `readShaded` normalises and then calls `checkShaded`.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run `npm test`, expected: PASS.
- [ ] **Step 5:** Commit `src/shaded-fields.mjs` and `tests/shaded-fields.test.mjs`: "Shaded section: the 106-field table and its rules".

### Task 3: Database, table and checks

**Files:**
- Create: `supabase/migrations/<next>_preparer_shaded_fields.sql` (part 1)
- Test: `tests/database-shaded.mjs` (it matches the `tests/database*.mjs` glob)

**Interfaces:**
- Produces:
  - `public.preparer_shaded_fields(id uuid pk, workspace_id, case_id unique, fields jsonb not null check(vitally_private.check_preparer_fields(fields)), version bigint not null check(version>=1), updated_by_person_id uuid not null, created_at timestamptz default now(), updated_at timestamptz default now())`, with the foreign keys of `preparer_questionnaires` (033).
  - `vitally_private.check_preparer_fields(jsonb) returns boolean`: immutable. It checks the keys against the Task 2 table grouped by kind, and every rule except the season bound and empty rows. For the year it checks only `^[0-9]{4}$` and ≥ 2000.

- [ ] **Step 1: Write the failing tests:**
  - `shaded table is staff-only`: modelled on `database-review.mjs` "questionnaire tables are staff-only". The applicant gets `[]`, the presenter sees the row, and inserts from either are refused.
  - `the table refuses a bad shape`: a service-role insert with `{"incomeW2sCount":120}`, `{"nope":true}`, `{"itemizedLastYearYes":true,"itemizedLastYearNo":true}` or `{"household1QualifyingChild":"maybe"}` fails.
  - `the SQL key lists match the JS table`: a unit-style assertion inside this file reads the migration text and compares its key arrays per kind with `SHADED_FIELDS`.
- [ ] **Step 2:** Run `npm run db:migrate:test`, then `node --env-file=.env.test --test tests/database-shaded.mjs`. Expected: FAIL.
- [ ] **Step 3:** Write part 1 of the migration: the function, the table, RLS, the select policy copied from `presenter_preparer_questionnaires` (033:61) with the table name swapped, and the grants as in 033:62-64.
- [ ] **Step 4:** Run migrate and the test again. Expected: PASS.
- [ ] **Step 5:** Commit: "Shaded section: table and shape check".

### Task 4: Database, the action and the samples

**Files:**
- Modify: `supabase/migrations/<next>_preparer_shaded_fields.sql` (part 2; not yet applied anywhere shared)
- Test: `tests/database-shaded.mjs`

**Interfaces:**
- Consumes: `require_case_preparer`, `commit_action` and `vitally_apply_action`'s envelope, plus `applyArgs` and `rejected` from `tests/support/database-fixture.mjs`.
- Produces:
  - `vitally_private.act_save_preparer_fields(p_member, p_case, p_person, p_payload) returns jsonb`. It returns `{"detail":{"changed":[sorted keys],"version":n}}` with no `message`.
  - Action `SAVE_PREPARER_FIELDS` with payload exactly `{"basedOnVersion": int, "fields": object}`.

- [ ] **Step 1: Write the failing tests:**
  - `the case's preparer saves`: a case at `preparing` with the PREPARER persona, saving `{incomeW2s:true, incomeW2sCount:2}` with `basedOnVersion:0`, is accepted. The row has `version` 1.
  - `who is refused`: the reviewer persona, an admin who isn't the preparer, and another volunteer are refused.
  - `stages`: `review_ready`, `on_hold` and `review_approved` give `INVALID_TRANSITION`, and `corrections_required` is accepted.
  - `stale version`: a save with `basedOnVersion:0` after version 1 exists gives `CONFLICT`, and the row is unchanged.
  - `other actions don't block`: a `RECORD_MATERIALS` between two saves, with the second sent at the new revision and `basedOnVersion:1`, is accepted.
  - `season and rows`: on a season-2026 case, `infoDisallowedYear:"2026"` gives `VALIDATION` and `"2025"` is accepted. `household3QualifyingChild` on a 2-member household gives `VALIDATION`.
  - `payload shape`: extra keys, a missing `basedOnVersion` and a non-object `fields` give `VALIDATION`.
  - `history`: the `case_events` detail `changed` equals `["incomeNotes","incomeW2sCount"]` after changing those two. An unchanged save gives `[]` and the version rises. No `client_events` row is added.
  - `samples`: after `initializeWorkspace`, every sample case with a `preparer_questionnaires` row has a `preparer_shaded_fields` row.
- [ ] **Step 2:** Run migrate and the test. Expected: FAIL.
- [ ] **Step 3:** Part 2 of the migration:
  - `act_save_preparer_fields`: the stage check, `require_case_preparer`, the version check against `coalesce(stored.version,0)`, the season bound via `coalesce(p_case.season, w.current_season)`, and the empty-row check against `jsonb_array_length(answers->'hh')` capped at 4 (read the application's answers as `act_save_answers` does). Then upsert, compute the sorted symmetric difference of keys and values, and return.
  - Redefine `check_payload` (037) with a `SAVE_PREPARER_FIELDS` branch: `payload_keys = array['basedOnVersion','fields']`, an integer ≥ 0, and an object.
  - Redefine `check_operation_authority` (036) with the type added to the staff-person group, and `vitally_apply_action` (036) with the dispatch line.
  - Redefine `apply_fixture_scenario` (037) with one insert of the fictional row (brainstorm Q10's values) inside the same `if` that seeds preparer questionnaires.
- [ ] **Step 4:** Run migrate, the test, then the full `npm run test:database`. Expected: all PASS. The 421 existing tests still pass.
- [ ] **Step 5:** Commit: "Shaded section: SAVE_PREPARER_FIELDS and sample rows".

### Task 5: The draft fill, the note overflow and the stamp

**Files:**
- Modify: `src/draft-form.mjs` (`draftStamp`, `draftFields`), `src/draft-pdf.mjs` (`buildDraftPdf`)
- Test: `tests/draft-form.test.mjs`, `tests/draft-pdf.test.mjs`

**Interfaces:**
- Consumes: `shadedName`, `shadedPrint` and `SHADED_FIELDS` (Task 2).
- Produces:
  - `draftStamp(reference, today, { preparerEntries = false } = {})`.
  - `draftFields(answers, { form, reference, today, shaded = null })`, which now also returns `notes: [{ name, text, block, page }]` (the shaded notes, kept out of `text`) and `preparerEntries: boolean`.
  - `buildDraftPdf` draws `fields.notes`.

- [ ] **Step 1: Write the failing tests:**
  - draft-form: `shaded values fill every form`: for `en`, `zh-s` and `zh-t`, with `shaded:{household1QualifyingChild:"yes", incomeW2s:true, incomeW2sCount:2, incomeRefundAmount:"412.00"}`, `text[shadedName("household1QualifyingChild",form)] === "Yes"`, the W-2 box is in `checks`, and the count is `"2"` and the amount `"412.00"`.
  - draft-form: `stamp wording`: with any shaded value, `"DRAFT – online answers and preparer entries, 10/04/2026, VT-ABCD-EFGH"`; without, the existing line (`tests/draft-form.test.mjs:398`).
  - draft-pdf: `shaded values round-trip`: `build(answers, {flatten:false})` with shaded values gives `getTextField(...).getText() === "Yes"` and `getCheckBox(...).isChecked()`, in all three forms. A Chinese reason prints through `runs` (`fontFiles` from `DRAFT_FONT_FIXTURES`).
  - draft-pdf: `a long note continues in Additional Comments`: a 400-character `deductionNotes` gives the box's lines plus "Continued from page 3, Standard or itemized deductions notes:" and the rest. The concatenated drawn text (`draftPageText` style) contains every character.
- [ ] **Step 2:** Run `node --test tests/draft-form.test.mjs tests/draft-pdf.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement:
  - `draftFields` maps the stored values through the table.
  - `buildDraftPdf` wraps each `notes` entry in its widget rectangle with the existing `wrap` and `drawLine` (pushed to `later`). The lines that don't fit are prepended to the Additional Comments lines with the "Continued from …" line in front, before the capacity and overflow logic.
- [ ] **Step 4:** Run the tests, then `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: "Draft 13614-C: fill the shaded section; wrap and continue its notes; stamp wording".

### Task 6: The editing copy and the upload reader

**Files:**
- Modify: `src/draft-pdf.mjs`, `tools/vendor-pdf-entry.mjs` (export the extra pdf-lib names the partial flatten needs, e.g. `PDFName`, `PDFBool`, `PDFHexString`, `PDFCheckBox`, `PDFTextField`), and `src/vendor/pdf-lib.mjs` (rebuilt by `npm run build:vendor`; same pdf-lib version)
- Test: `tests/draft-pdf.test.mjs`

**Interfaces:**
- Produces:
  - `buildEditingCopy({ PDFLib, fontkit, formBytes, fontFiles, fields, shaded, reference, version }) → Uint8Array`. `fields` is `draftFields(answers, {form:"en", reference, today})` with no shaded values. The copy:
    - partially flattens every field except `shadedNames("en")`;
    - sets the stored values live: `setText` / `check` for WinAnsi text, and `/V` without an appearance plus `NeedAppearances` otherwise;
    - sets Keywords to `["vitally-shaded", "case:<reference>", "version:<version>"]`.
  - `readFilledCopy({ PDFLib, bytes, reference }) → { raw, version }`. It throws an error whose `code` is `"NOT_A_PDF"`, `"OTHER_CASE"` or `"NO_FIELDS"`, each with the exact sentence as `message` (Review Focus 4; "This copy has no form fields. In Chrome, use the download button, not Print.").

- [ ] **Step 1: Write the failing tests:**
  - `the editing copy keeps exactly the shaded fields`: 106 fields, and their names equal `shadedNames("en")`.
  - `an editing copy for a Chinese name builds`: answers with first name "美玲" and stored `incomeNotes:"收入说明：一份 W-2"` give a build with no throw and exactly 106 fields. `/V` of the note decodes to the text.
  - `the copy round-trips through the reader`: fill the copy with npm pdf-lib (tick `incomeW2s`, count `2`), then `readFilledCopy` → `readShaded` gives `{incomeW2s:true, incomeW2sCount:2}` and `version` from Keywords.
  - `another case's copy is refused` (`OTHER_CASE`), `a flattened copy is refused` (`NO_FIELDS`, the exact sentence), and `a broken file is refused with a sentence` (`NOT_A_PDF`).
- [ ] **Step 2:** Run `node --test tests/draft-pdf.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement. Base the partial flatten on pdf-lib 1.17.1's `PDFForm.flatten` (draw each widget's appearance on its page, then `removeField`), restricted to fields outside the keep list. Use the approach the spike chose.
- [ ] **Step 4:** Run `npm run build:vendor`, then the tests and `npm test`. Expected: PASS. `src/vendor/pdf-lib.mjs`'s banner still names pdf-lib 1.17.1.
- [ ] **Step 5:** Commit: "Shaded section: editing copy and filled-copy reader".

### Task 7: Store, action and staff page (download / upload milestone)

**Files:**
- Modify: `src/contracts.mjs` (`CASE_ACTIONS` += `"SAVE_PREPARER_FIELDS"`), `src/supabase-store.mjs` (the staff table list at line 42; `preparerShadedFields: await relatedRows("preparer_shaded_fields", id)`), `src/controller.mjs` (`saveShadedSection(fields, basedOnVersion)` via `runAction`, plus `controller.saveShadedSection` exported beside `runAction`), `src/staff-views.mjs` (rights `shadedSection`, the tools in `draftTools` or the Overview next step, and `EVENT_SENTENCES.SAVE_PREPARER_FIELDS` plus the changed labels in `historySentence`), and `src/app.mjs` (download, upload, and an in-place error)
- Test: `tests/staff-views.test.mjs`, `tests/controller.test.mjs`, `tests/store.test.mjs`, `tests/browser.mjs`

**Interfaces:**
- Consumes: Tasks 2 and 6.
- Produces:
  - `rights.shadedSection` (`allowed` / `refused(...)`, the same rule as `preparationWork`).
  - `record.preparerShadedFields` (`[row]` or `[]`).
  - Buttons with `data-action="download-shaded-copy"`, and an `<input type="file" accept="application/pdf" data-action="upload-shaded-copy">` labelled "Upload the filled copy".
  - The History line "<actor> saved the shaded section · <labels joined by ", ">", or "· no fields changed".

- [ ] **Step 1: Write the failing tests:**
  - staff-views: `shaded tools only for the case's preparer at the two stages`: offered for the preparer at `preparing` and `corrections_required`, and refused with the `preparationWork` sentences otherwise.
  - staff-views: `history names changed fields`: `historySentence({action:"SAVE_PREPARER_FIELDS", actorName:"Alex", detail:{changed:["incomeW2sCount","incomeNotes"]}})` equals `"Alex saved the shaded section · W-2s #, Income notes."`, and an empty list gives `"… · no fields changed."`.
  - controller: `saveShadedSection sends the latest revision`: after a realtime revision bump, the dispatched action carries the new `expectedRevision` and the payload `{fields, basedOnVersion}`.
  - store: the staff record carries `preparerShadedFields`, and the applicant path never names the table.
  - browser story step (after the claim, near `tests/browser.mjs:1293`): download the copy, fill it with npm pdf-lib, upload it with `setInputFiles`, and the English draft's `draftPageText(page 2)` contains `2`. History shows "saved the shaded section".
- [ ] **Step 2:** Run `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement the wiring. Upload reads `file.arrayBuffer()`, then `readFilledCopy`, then `readShaded` (with the case's household size and season), then `saveShadedSection(values, version)`. Errors are recorded in place beside the upload control (screen-states).
- [ ] **Step 4:** Run `npm test`, then `npm run test:browser`. Expected: PASS.
- [ ] **Step 5:** Commit: "Shaded section: save, download and upload on the case page". **Milestone (tasks 6.4):** download / upload works end to end, and the draft shows the values in all three forms.

### Task 8: Vendor pdf.js

**Files:**
- Modify: `package.json` / `package-lock.json` (`"pdfjs-dist": "6.4.299"` devDependency, exact) and `tools/build.mjs` (copy, not bundle: the legacy `pdf.min.mjs` to `src/vendor/pdfjs.mjs` and `pdf.worker.min.mjs` to `src/vendor/pdfjs-worker.mjs`, each with the banner "// Copied by tools/build.mjs … pdfjs-dist 6.4.299 (legacy build)"; `buildVendorBundle` returns their sizes)
- Create: `src/vendor/pdfjs.mjs`, `src/vendor/pdfjs-worker.mjs` (generated)
- Test: `tests/server.test.mjs`

- [ ] **Step 1:** Write the failing test `serves the pdf.js vendor files`: GET `/src/vendor/pdfjs.mjs` and `/src/vendor/pdfjs-worker.mjs` → 200 with a JavaScript content type, and `/src/vendor/pdf.min.mjs` → 404.
- [ ] **Step 2:** Run `node --test tests/server.test.mjs`. Expected: FAIL (files missing).
- [ ] **Step 3:** Add the dependency (`npm install --save-dev --save-exact pdfjs-dist@6.4.299`), extend `tools/build.mjs`, and run `npm run build:vendor`. Add the `.bcmap` allowlist only if Task 1 step 3 required it.
- [ ] **Step 4:** Run the test and `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: "Vendor pdfjs-dist 6.4.299 (legacy build)".

### Task 9: The pdf.js editor layer

**Files:**
- Create: `src/shaded-editor.mjs` (the layer; DOM, pdf.js injected)
- Modify: `src/app.mjs` (open, close, and the layer beside `#app` with `#app` inert), `src/staff-views.mjs` (the "Fill the shaded section" button, `data-action="open-shaded-editor"`), and the CSS (the layer, toolbar and status)
- Test: `tests/shaded-editor.test.mjs`, `tests/browser.mjs`

**Interfaces:**
- Consumes: `buildEditingCopy`, `readShaded`, `controller.saveShadedSection`.
- Produces:
  - `rawFromPdfjs(fieldObjects, storageValues) → { [pdfFieldName]: raw }` (pure, exported).
  - `openShadedEditor({ document, loadPdfjs, bytes, onSave, onClose, explainRefusal }) → { close() }`.
  - `loadPdfjs()` in app.mjs: `import("./vendor/pdfjs.mjs")`, with `GlobalWorkerOptions.workerSrc = "./src/vendor/pdfjs-worker.mjs"`.

- [ ] **Step 1: Write the failing tests** (`node:test` with the repo's DOM stand-in, as other view tests do; if there is none, test the pure parts only):
  - `rawFromPdfjs reads ticked boxes`: a field object of type `checkbox` with value `"Yes"` / `"Off"`, and edited storage overriding the stored values.
  - `save is single-flight`: two `Save` presses while `onSave` is pending call it once.
  - `save is disabled until a change`.
  - `close with changes asks first`: "Discard your changes?"; cancelling keeps the editor open.
  - `a stage refusal disables Save and keeps the edits`; `a CONFLICT shows the conflict sentence and keeps the edits`.
- [ ] **Step 2:** Run `node --test tests/shaded-editor.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement:
  - The layer is a `role="dialog" aria-modal="true"` element appended to `document.body`, a sibling of `#app`.
  - It renders all pages with `AnnotationMode.ENABLE_FORMS`. The toolbar holds Save, Close and the status (`aria-live`).
  - Escape and Close follow the screen-states delta. `beforeunload` is set while there are changes. Focus returns to the opener.
  - A load failure closes the layer and records "The editor could not be opened. Try again, or use Download to fill elsewhere." in place.
- [ ] **Step 4:** Story step (after Task 7's step): open the editor, type `Yes` in row 1's qualifying-child input (selector from the spike), tick W-2s, enter `2`, type a note, and Save. Check "Saved" and the History line. Check that Escape with a pending change shows "Discard your changes?". Close, and the English draft's page text has `Yes`, `2`, the note and "DRAFT – online answers and preparer entries". Run `npm test` and `npm run test:browser`. Expected: PASS.
- [ ] **Step 5:** Commit: "Shaded section: pdf.js editor". **Oct 29 go / no-go (tasks 7.6).** If it fails, revert Tasks 8–9's commits and delete the pdf.js-only requirement blocks from the delta specs, as listed in tasks 7.6.

### Task 10: Docs and final checks

**Files:**
- Modify: `docs/developer/frontend.md`, `docs/developer/database.md`, `docs/setup.md` ("The vendor bundle"), `docs/developer/backend.md:127`, `docs/developer/README.md:97-103`

- [ ] **Step 1:** Write the docs:
  - frontend: the shaded-field module, the editing copy, the layer beside `#app` and why, download / upload, and the vendor files;
  - database: the table, the check, the action, the version guard, the fixtures;
  - setup, backend and README: all three vendor outputs (pdf-lib is missing today).
- [ ] **Step 2:** Run `npm test`, then `npm run db:migrate:test`, `npm run test:database`, `npm run test:browser` and `npx openspec validate --all`. Expected: all PASS. Record the counts against the baseline (unit 1336, database 421, story 77).
- [ ] **Step 3:** Commit: "Docs: shaded section, vendor files".
