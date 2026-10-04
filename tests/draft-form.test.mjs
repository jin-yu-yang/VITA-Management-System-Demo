import test from "node:test";
import assert from "node:assert/strict";
import {
  FORM_FILES, FORM_SHA256, draftFields, draftFieldNames,
} from "../src/draft-form.mjs";

// Every name below is written without the "form1[0]." prefix the module adds.
const F = (name) => `form1[0].${name}`;
const ids = (n) => String(n).padStart(32, "0");

// A fictional married client. Every value is made up.
const MARRIED = Object.freeze({
  form_version: "general",
  service: "drop_off",
  language: "mandarin",
  language_other: "Should not appear",
  best_contact_time: ["weekday_evening"],
  best_contact_note: "After six",
  tp_first_name: "Mei",
  tp_middle_name: "qing",
  tp_last_name: "Lin",
  tp_dob: "1961-04-05",
  tp_job_title: "Bookkeeper",
  tp_phone: "2155550199",
  email: "mei.lin@example.com",
  addr_street: "100 Example Street",
  addr_apt: "2B",
  addr_city: "Philadelphia",
  addr_state: "PA",
  addr_zip: "19107",
  marital_status: "married",
  married_last_day: "yes",
  lived_apart_last_6mo: "no",
  sp_first_name: "José",
  sp_middle_name: "Andrés",
  sp_last_name: "Peña",
  sp_dob: "1960-12-31",
  sp_job_title: "Cook",
  sp_phone: "(267) 555-0142",
  multi_state: "no",
  claimed_by_other: "not_sure",
  us_citizen: ["me", "spouse"],
  on_visa: ["none"],
  fulltime_student: ["spouse"],
  legally_blind: ["none"],
  disabled: ["me"],
  ippin: ["none"],
  digital_assets: ["none"],
  irs_language_pref: ["me"],
  irs_language: "Chinese",
  pecf: ["none"],
  has_household_members: "yes",
  hh: [
    { member_id: ids(1), first_name: "Ana", last_name: "Lin", dob: "2015-06-07", relationship: "son_daughter", months_lived: "12", married: "single", us_citizen: "yes", resident_na: "yes", fulltime_student: "no", disabled: "no", ippin: "not_sure" },
  ],
  inc_wages: "yes",
  inc_wages_job_count: "2",
  inc_tips: "not_sure",
  inc_retirement: "no",
  inc_disability: "no",
  inc_social_security: "yes",
  inc_unemployment: "no",
  inc_state_refund: "no",
  inc_interest_div: "yes",
  inc_sale_assets: "yes",
  inc_sale_assets_prior_loss: "no",
  inc_alimony: "no",
  inc_rental_home: "yes",
  inc_rental_home_under15: "yes",
  inc_rental_property: "no",
  inc_gambling: "no",
  inc_self_employed: "yes",
  inc_self_employed_prior_loss: "not_sure",
  inc_other: "yes",
  inc_other_desc: "Jury duty",
  exp_mortgage_interest: "yes",
  exp_taxes: "no",
  exp_medical: "no",
  exp_charity: "no",
  exp_student_loan: "no",
  exp_dependent_care: "yes",
  exp_retirement_contrib: "no",
  exp_educator: "no",
  exp_alimony_paid: "no",
  evt_education: "no",
  evt_sold_home: "no",
  evt_hsa: "not_sure",
  evt_marketplace: "no",
  evt_energy: "not_sure",
  evt_other: "yes",
  evt_other_desc: "Bought a car",
  evt_debt_canceled: "no",
  evt_disaster: "no",
  evt_credit_disallowed: "no",
  evt_irs_letter: "yes",
  evt_estimated_payments: "no",
  evt_brought_prior_return: "yes",
  refund_method: "other",
  refund_method_other: "Prepaid card",
  payment_method: "installment",
  gcf_consent: "yes",
  gcf_tp_signature: "Mei Lin",
  gcf_tp_date: "2026-02-01",
  gcf_sp_signature: "José Peña",
  gcf_sp_date: "2026-02-02",
  opt_english_speak: "not_well",
  opt_english_read: "prefer_not_to_answer",
  opt_household_disability: "no",
  opt_veteran: "prefer_not_to_answer",
  opt_race_tp: ["asian"],
  opt_race_sp: ["hispanic_latino", "white"],
  additional_notes: "My 1099-INT has not arrived yet.",
});

const OPTIONS = { form: "en", reference: "VT-ABCD-EFGH", today: "2026-10-04" };
const draft = (answers = MARRIED, options = OPTIONS) => draftFields(answers, options);

test("the three forms are named and pinned", () => {
  assert.deepEqual(FORM_FILES, {
    en: "src/forms/f13614c-2025.pdf",
    "zh-s": "src/forms/f13614cn-2025.pdf",
    "zh-t": "src/forms/f13614ct-2025.pdf",
  });
  assert.deepEqual(FORM_SHA256, {
    en: "160507ac6daa8cc5e3126ad51ba5c2050c786337048f434f8336b48d92992c9d",
    "zh-s": "a8c4909bf41a947cd7bcffdca4c106b8e5640fc4f24cc9bb4f29f018f121f5c2",
    "zh-t": "f3eef75ca2683ab106281198b33c7ea0485f06dcadd9f16decfe4d790ac33487",
  });
});

test("a married client: names, dates, phones and the address", () => {
  const { text } = draft();
  const expected = {
    "page1[0].yourFirstName[0]": "Mei",
    "page1[0].yourMiddleInitial[0]": "Q",
    "page1[0].yourLastName[0]": "Lin",
    "page1[0].yourDateOfBirth[0]": "04/05/1961",
    "page1[0].yourJobTitle[0]": "Bookkeeper",
    "page1[0].spousesFirstName[0]": "José",
    "page1[0].spousesMiddleInitial[0]": "A",
    "page1[0].spousesLastName[0]": "Peña",
    "page1[0].spousesDateOfBirth[0]": "12/31/1960",
    "page1[0].spousesJobTitle[0]": "Cook",
    "page1[0].mailingAddress[0]": "100 Example Street",
    "page1[0].maillingApartmentNumber[0]": "2B",
    "page1[0].mailingCity[0]": "Philadelphia",
    "page1[0].mailingState[0]": "PA",
    "page1[0].mailingZIPCode[0]": "19107",
    "page1[0].yourTelephoneNumber[0]": "(215) 555-0199",
    "page1[0].spousesTelephoneNumber[0]": "(267) 555-0142",
    "page1[0].yourEmailAddress[0]": "mei.lin@example.com",
    "page1[0].writtenCommunicationLanguage[0].whatLanguage[0]": "Chinese",
    "page1[0].dueARefund[0].refundOtherExplain[0]": "Prepaid card",
    "page2[0].receivedMoneyFrom[0].howManyJobs[0]": "2",
  };
  for (const [name, value] of Object.entries(expected)) assert.equal(text[F(name)], value, name);
});

test("yes/no pairs, choices and the marital boxes", () => {
  const { checks, text } = draft();
  for (const name of [
    "page1[0].liveWorkStates[0].liveWorkNo[0]",
    "page1[0].maritalStatus[0].statusMarried[0]",
    "page1[0].maritalStatus[0].lastDay[0].lastDayYes[0]",
    "page1[0].maritalStatus[0].liveApart[0].liveApartNo[0]",
    "page1[0].dueARefund[0].refundOther[0]",
    "page1[0].haveBlanceDue[0].blanceInstallmentAgreement[0]",
    "page2[0].receivedMoneyFrom[0].reportALoss[0].reportLossNo[0]",
    "page2[0].receivedMoneyFrom[0].useAsPersonal[0].personalResidenceYes[0]",
    "page4[0].optionalQuestions[0].carryConversationEnglish[0].notWell[0]",
    "page4[0].optionalQuestions[0].readNewspaperEnglish[0].notAnswer[0]",
    "page4[0].optionalQuestions[0].memberHouseholdDisability[0].disabilityNo[0]",
    "page4[0].optionalQuestions[0].youSpouseVeteran[0].notAnswer[0]",
    "page4[0].yourRaceEthnicity[0].asian[0]",
    "page4[0].yourSpousesRaceEthnicity[0].hispanicLatino[0]",
    "page4[0].yourSpousesRaceEthnicity[0].white[0]",
  ])
    assert.ok(checks.includes(F(name)), name);
  // claimed_by_other is not_sure: neither box.
  assert.ok(!checks.some((n) => n.includes("anyoneElseClaim")));
  // inc_self_employed_prior_loss is not_sure: neither box.
  assert.ok(!checks.some((n) => n.includes("lossLastReturn")));
  assert.ok(!checks.some((n) => n.includes("liveWorkYes")));
  assert.equal(new Set(checks).size, checks.length, "no box twice");
  // Every produced name is one the map knows.
  const known = new Set(draftFieldNames("en"));
  for (const name of [...checks, ...Object.keys(text)]) assert.ok(known.has(name), name);
});

test("Who answers tick the You, Spouse and No boxes", () => {
  const { checks } = draft();
  const c1 = "page1[0].youSpouseWereIn[0].column1[0].";
  const c2 = "page1[0].youSpouseWereIn[0].column2[0].";
  const ticked = (prefix) => checks.filter((n) => n.startsWith(F(prefix))).map((n) => n.slice(F(prefix).length));
  assert.deepEqual(ticked(`${c1}usCitizen[0].`), ["usCitizenYou[0]", "usCitizenSpouse[0]"]);
  assert.deepEqual(ticked(`${c1}usOnVisa[0].`), ["onVisaNo[0]"]);
  assert.deepEqual(ticked(`${c1}fullTimeStudent[0].`), ["studentSpouse[0]"]);
  assert.deepEqual(ticked(`${c2}legallyBlind[0].`), ["legallyBlindNo[0]"]);
  assert.deepEqual(ticked(`${c2}totallyPermanentlyDisabled[0].`), ["disabledYou[0]"]);
  assert.deepEqual(ticked(`${c2}issuedIdentityProtection[0].`), ["identityProtectionNo[0]"]);
  assert.deepEqual(ticked(`${c2}holdDigitalAssets[0].`), ["digitalAssetsNo[0]"]);
  assert.deepEqual(ticked("page1[0].writtenCommunicationLanguage[0]."), ["otherLanguageYou[0]"]);
  assert.deepEqual(ticked("page1[0].presidentialElectionFund[0]."), ["presidentialElectionFundNo[0]"]);
  // A spouse choice left over from before a change of marital status ticks nothing.
  const single = draft({ ...MARRIED, marital_status: "never_married", us_citizen: ["spouse"] });
  assert.deepEqual(single.checks.filter((n) => n.includes("usCitizen[0].")), []);
});

test("income, expense and event items tick only on yes; not_sure goes to Not sure", () => {
  const { checks, comments } = draft();
  for (const name of [
    "page2[0].receivedMoneyFrom[0].wagesPartFull[0]",
    "page2[0].receivedMoneyFrom[0].socialSecurityRailroad[0]",
    "page2[0].receivedMoneyFrom[0].interestOrDividends[0]",
    "page2[0].receivedMoneyFrom[0].saleStocksBonds[0]",
    "page2[0].receivedMoneyFrom[0].incomeRentingHouse[0]",
    "page2[0].receivedMoneyFrom[0].paymentsContractSelf[0]",
    "page2[0].receivedMoneyFrom[0].otherMoneyReceived[0].otherMoneyReceived[0]",
    "page3[0].paidFollowingExpenses[0].mortgageinterest[0]",
    "page3[0].paidExpenses[0].childDependentCare[0]",
    "page3[0].followingHappenDuring[0].otherPurchase[0]",
    "page3[0].followingHappenDuring[0].receivedLetterBill[0]",
    "page3[0].followingHappenDuring[0].lastYearsReturn[0]",
  ])
    assert.ok(checks.includes(F(name)), name);
  for (const name of ["receivedMoneyTimps", "healthSavingsAccount", "energyEfficientItems", "retirementAccount", "taxesStateLocal"])
    assert.ok(!checks.some((n) => n.includes(name)), name);
  // The volunteer-only columns of pages 2 and 3 stay blank.
  assert.ok(!checks.some((n) => /incomeIncluded|stndardItemized|expensesToReport|informationToReport/.test(n)));
  assert.equal(
    comments,
    [
      "My 1099-INT has not arrived yet.",
      "Not sure: Can anyone else (such as a parent or adult child) claim you or your spouse as a dependent on their tax return?, " +
        "Person 1 Issued an IP PIN?, Tips, Did you report a loss from this work on last year's return?, Had a Health Savings Account (HSA), " +
        "Purchased and installed energy-efficient home improvements (windows, furnace, insulation, etc.)",
      "Other income: Jury duty",
      "Other event: Bought a car",
    ].join("\n\n"),
  );
});

test("household rows 1–4 on the form, members 5–6 in Additional Comments", () => {
  const people = [
    ["Ana", "Lin", "2015-06-07", "son_daughter", "12", "single", "yes", "yes", "no", "no", "no"],
    ["Bo", "Lin", "2012-01-02", "stepchild", "6", "single", "no", "yes", "yes", "no", "yes"],
    ["Cai", "Lin", "1940-03-04", "parent", "12", "married", "yes", "no", "no", "yes", "not_sure"],
    ["Dan", "Lin", "2001-07-08", "sibling", "9", "single", "not_sure", "yes", "yes", "no", "no"],
    ["Eva", "Lin", "2019-09-10", "grandchild", "12", "single", "yes", "yes", "no", "no", "no"],
    ["Fei", "Lin", "1999-11-12", "none", "3", "married", "no", "not_sure", "no", "no", "yes"],
  ];
  const hh = people.map(([first, last, dob, rel, months, married, citizen, resident, student, disabled, ippin], i) => ({
    member_id: ids(i + 1), first_name: first, last_name: last, dob, relationship: rel, months_lived: months, married,
    us_citizen: citizen, resident_na: resident, fulltime_student: student, disabled, ippin,
  }));
  const { text, comments } = draft({ ...MARRIED, hh });
  const row = (k, column) => text[F(`page1[0].namesOf[0].Row${k}[0].${column}[0]`)];
  assert.equal(row(1, "nameFirstLast"), "Ana Lin");
  assert.equal(row(1, "dateOfBirth"), "06/07/2015");
  assert.equal(row(1, "relationshipToYou"), "Son / Daughter");
  assert.equal(row(1, "monthsLivedHome"), "12");
  assert.equal(row(1, "singleMarried"), "S");
  assert.equal(row(1, "usCitizen"), "Y");
  assert.equal(row(1, "residentUSCandaMexico"), "Y");
  assert.equal(row(1, "fullTimeStudent"), "N");
  assert.equal(row(1, "totallyPermanentlyDisabled"), "N");
  assert.equal(row(1, "issuedIPPIN"), "N");
  assert.equal(row(2, "relationshipToYou"), "Stepchild");
  assert.equal(row(3, "singleMarried"), "M");
  assert.equal(row(3, "issuedIPPIN"), undefined, "not_sure stays blank");
  assert.equal(row(4, "usCitizen"), undefined, "not_sure stays blank");
  assert.equal(row(4, "nameFirstLast"), "Dan Lin");
  assert.ok(!Object.keys(text).some((n) => /Row[5-9]/.test(n)));
  // The volunteer-only columns stay blank.
  assert.ok(!Object.keys(text).some((n) => /qualifyingChildDependent|ownSupport|lessThanIncome|supportForPerson|costMaintainingHome/.test(n)));
  const blocks = comments.split("\n\n");
  assert.equal(
    blocks.at(-1),
    [
      "Person 5: Eva Lin · Grandchild · born 09/10/2019 · 12 months · single · citizen: yes · resident: yes · student: no · disabled: no · IP PIN: no",
      "Person 6: Fei Lin · None · born 11/12/1999 · 3 months · married · citizen: no · resident: not sure · student: no · disabled: no · IP PIN: yes",
    ].join("\n"),
  );
  assert.match(comments, /Person 3 Issued an IP PIN\?, Person 4 U\.S\. citizen\?, Person 6 In 2025, was this person a resident/);
});

test("hidden answers are ignored", () => {
  const hidden = {
    ...MARRIED,
    marital_status: "never_married",
    inc_wages: "no",
    inc_other: "no",
    evt_other: "no",
    refund_method: "check",
    irs_language_pref: ["none"],
    has_household_members: "no",
  };
  const { text, checks, comments } = draft(hidden);
  for (const absent of ["spousesFirstName", "spousesTelephoneNumber", "howManyJobs", "refundOtherExplain", "whatLanguage", "namesOf"])
    assert.ok(!Object.keys(text).some((n) => n.includes(absent)), absent);
  for (const absent of ["lastDay", "liveApart", "yourSpousesRaceEthnicity", "wagesPartFull"])
    assert.ok(!checks.some((n) => n.includes(absent)), absent);
  assert.ok(checks.includes(F("page1[0].maritalStatus[0].statusNeverMarried[0]")));
  assert.ok(checks.includes(F("page1[0].dueARefund[0].refundCheckMail[0]")));
  assert.ok(!comments.includes("Other income"));
  assert.ok(!comments.includes("Other event"));
  assert.ok(!comments.includes("Person 1"));
});

test("the 15080 page: only with gcf_consent = yes", () => {
  const yes = draft();
  assert.equal(yes.consentPage, true);
  assert.equal(yes.text[F("page6[0].primaryTaxpayer[0]")], "Mei Lin");
  assert.equal(yes.text[F("page6[0].primaryDateSigned[0]")], "02/01/2026");
  assert.equal(yes.text[F("page6[0].secondaryTaxpayer[0]")], "José Peña");
  assert.equal(yes.text[F("page6[0].secondaryDateSigned[0]")], "02/02/2026");
  for (const consent of ["no", undefined, ""]) {
    const answers = { ...MARRIED, gcf_consent: consent };
    const result = draft(answers);
    assert.equal(result.consentPage, false, String(consent));
    assert.ok(!Object.keys(result.text).some((n) => n.includes("page6[0]")), String(consent));
  }
});

test("the Chinese forms use their own marital and rental names", () => {
  for (const form of ["zh-s", "zh-t"]) {
    const { checks } = draft(MARRIED, { ...OPTIONS, form });
    assert.ok(checks.includes(F("page1[0].maritalStatus[0].marriedForAll[0].forAllYes[0]")), form);
    assert.ok(checks.includes(F("page1[0].maritalStatus[0].liveWithSpouse[0].liveWithNo[0]")), form);
    assert.ok(checks.includes(F("page2[0].receivedMoneyFrom[0].incomeRentingHouse[0].incomeRentingHouse[0]")), form);
    assert.ok(!checks.some((n) => n.includes("lastDay") || n.includes("liveApart")), form);
    const known = new Set(draftFieldNames(form));
    for (const name of checks) assert.ok(known.has(name), `${form} ${name}`);
    assert.ok(!known.has(F("page2[0].receivedMoneyFrom[0].incomeRentingHouse[0]")), form);
  }
  const no = draft({ ...MARRIED, married_last_day: "no", lived_apart_last_6mo: "yes" }, { ...OPTIONS, form: "zh-s" });
  assert.ok(no.checks.includes(F("page1[0].maritalStatus[0].marriedForAll[0].forAllNo[0]")));
  assert.ok(no.checks.includes(F("page1[0].maritalStatus[0].liveWithSpouse[0].liveWithYes[0]")));
});

test("each marital status ticks its own box, with its date", () => {
  const cases = [
    ["never_married", {}, "statusNeverMarried[0]", null],
    ["divorced", { divorce_date: "2020-03-09" }, "statusDivorced[0].statusDivorced[0]", ["statusDivorced[0].dateFinalDecree[0]", "03/09/2020"]],
    ["separated", { separation_date: "2021-10-11" }, "statusLegallySeparated[0].statusLegallySeparated[0]", ["statusLegallySeparated[0].dateSeparateDecree[0]", "10/11/2021"]],
    ["widowed", { spouse_death_year: "2019" }, "statusWidowed[0].statusWidowed[0]", ["statusWidowed[0].yearSpousesDeath[0]", "2019"]],
  ];
  for (const [status, extra, box, date] of cases) {
    const { checks, text } = draft({ ...MARRIED, marital_status: status, ...extra });
    assert.ok(checks.includes(F(`page1[0].maritalStatus[0].${box}`)), status);
    assert.equal(checks.filter((n) => n.includes("maritalStatus")).length, 1, status);
    if (date) assert.equal(text[F(`page1[0].maritalStatus[0].${date[0]}`)], date[1], status);
  }
});

test("the questions with no box never appear", () => {
  const { text, comments } = draft();
  const values = Object.values(text).join("\n") + comments;
  for (const absent of ["Should not appear", "After six", "drop_off", "mandarin", "weekday_evening", "general"])
    assert.ok(!values.includes(absent), absent);
  assert.ok(!Object.values(text).includes("yes"));
});

test("an unanswered draft gives no boxes and no comments", () => {
  const empty = draft({});
  assert.deepEqual(empty.text, {});
  assert.deepEqual(empty.checks, []);
  assert.equal(empty.comments, "");
  assert.equal(empty.consentPage, false);
});

test("the stamp and the file name", () => {
  assert.equal(draft().stamp, "DRAFT – prepared from online answers, 10/04/2026, VT-ABCD-EFGH");
  assert.equal(draft().fileName, "13614-C-draft-VT-ABCD-EFGH.pdf");
  assert.equal(draft(MARRIED, { ...OPTIONS, form: "zh-s" }).fileName, "13614-C-draft-VT-ABCD-EFGH-zh-s.pdf");
  assert.equal(draft(MARRIED, { ...OPTIONS, form: "zh-t" }).fileName, "13614-C-draft-VT-ABCD-EFGH-zh-t.pdf");
  assert.throws(() => draft(MARRIED, { ...OPTIONS, form: "fr" }), /form/);
});

test("draftFieldNames covers all four household rows and the 15080 fields", () => {
  for (const form of ["en", "zh-s", "zh-t"]) {
    const names = draftFieldNames(form);
    assert.equal(new Set(names).size, names.length, form);
    for (let k = 1; k <= 4; k++)
      for (const column of ["nameFirstLast", "dateOfBirth", "relationshipToYou", "monthsLivedHome", "singleMarried", "usCitizen", "residentUSCandaMexico", "fullTimeStudent", "totallyPermanentlyDisabled", "issuedIPPIN"])
        assert.ok(names.includes(F(`page1[0].namesOf[0].Row${k}[0].${column}[0]`)), `${form} Row${k} ${column}`);
    for (const name of ["primaryTaxpayer", "primaryDateSigned", "secondaryTaxpayer", "secondaryDateSigned"])
      assert.ok(names.includes(F(`page6[0].${name}[0]`)), name);
    assert.ok(names.includes(F("page5[0].AdditionalComments[0].AdditionalNotesComments[0]")));
  }
});
