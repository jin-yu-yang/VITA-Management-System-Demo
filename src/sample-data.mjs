import { INTAKE_ANSWER_KEYS } from "./domain.mjs";
import { findQuestion, isAnswered } from "./intake-catalogue.mjs";

const sharedAnswers = Object.freeze({
  service: "Drop-off",
  year: "2025",
  language: "English",
  residenceCity: "Philadelphia",
  residenceState: "PA",
  city: "Philadelphia",
  state: "PA",
  rideshare: "yes",
  stocks: "no",
  helper: "self",
  documents: "ready",
});

const scenarioTemplates = Object.freeze({
  ordinary: Object.freeze([
    Object.freeze({
      ...sharedAnswers,
      other: "no",
      firstName: "Mei",
      lastName: "Chen",
      address: "Sample address withheld",
      zip: "19107",
      household: "1",
    }),
    Object.freeze({
      ...sharedAnswers,
      other: "no",
      firstName: "Jordan",
      lastName: "Rivera",
      address: "Fictional address withheld",
      zip: "19123",
      household: "2",
    }),
  ]),
  exception: Object.freeze([
    Object.freeze({
      ...sharedAnswers,
      other: "yes",
      firstName: "Avery",
      lastName: "Patel",
      address: "Example address withheld",
      zip: "19130",
      household: "3",
    }),
  ]),
});

function templateFor(seed, scenario) {
  const templates = scenarioTemplates[scenario];
  if (!templates) throw new RangeError(`Unknown fictional scenario: ${scenario}`);
  const numericSeed = Number.isFinite(Number(seed)) ? Math.trunc(Number(seed)) : 0;
  return templates[((numericSeed % templates.length) + templates.length) % templates.length];
}

function isBlank(value) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

export function makeSampleAnswers({ seed = 0, scenario = "ordinary", version = 1, married = false } = {}) {
  if (Number(version) === 2) return versionTwoAnswers(seed, married);
  const template = templateFor(seed, scenario);
  const result = {};
  for (const key of INTAKE_ANSWER_KEYS) result[key] = template[key];
  return result;
}

export function fillBlankAnswers(current = {}, generated = {}, version = 1) {
  if (Number(version) === 2) return fillBlankVersionTwo(current ?? {}, generated ?? {});
  const result = {};
  for (const key of INTAKE_ANSWER_KEYS) {
    if (!isBlank(current[key])) result[key] = current[key];
    else if (!isBlank(generated[key])) result[key] = generated[key];
  }
  return result;
}

// ---------------------------------------------------------------------------
// Version 2 (spec 2026-09-30 §3.3). One fictional person, written out: a text
// question has no "first valid value", so nothing here walks the catalogue.
// ---------------------------------------------------------------------------

const V2_PEOPLE = Object.freeze([
  Object.freeze({ first: "Mei", last: "Chen", dob: "1984-05-12", child: "Lin", childDob: "2015-03-14" }),
  Object.freeze({ first: "Jordan", last: "Rivera", dob: "1979-11-02", child: "Sam", childDob: "2012-08-30" }),
  Object.freeze({ first: "Avery", last: "Patel", dob: "1990-01-23", child: "Kai", childDob: "2018-06-05" }),
  Object.freeze({ first: "Wen", last: "Huang", dob: "1972-09-17", child: "Yan", childDob: "2010-12-01" }),
]);
const V2_SPOUSES = Object.freeze([
  Object.freeze({ first: "Hua", dob: "1983-02-08" }),
  Object.freeze({ first: "Casey", dob: "1980-07-19" }),
  Object.freeze({ first: "Robin", dob: "1988-10-26" }),
]);

const pick = (list, seed) => list[((seed % list.length) + list.length) % list.length];
const numericSeed = (seed) => (Number.isFinite(Number(seed)) ? Math.trunc(Number(seed)) : 0);
// 2155550100 to 2155550199, a fictional-looking range chosen by seed.
const samplePhone = (seed, offset = 0) =>
  `215555${String(100 + ((((seed + offset) % 100) + 100) % 100)).padStart(4, "0")}`;

function versionTwoAnswers(seed, married) {
  const n = numericSeed(seed);
  const person = pick(V2_PEOPLE, n);
  // A new object (and new arrays and members) on every call, so a caller can
  // never change another caller's sample.
  const answers = {
    service: "drop_off",
    language: "english",
    tp_first_name: person.first,
    tp_last_name: person.last,
    tp_dob: person.dob,
    tp_job_title: "Office assistant",
    tp_phone: samplePhone(n),
    best_contact_time: ["weekday_evening"],
    best_contact_note: "After 6 pm is best.",
    addr_street: "100 Example Street",
    addr_city: "Philadelphia",
    addr_state: "PA",
    addr_zip: "19107",
    marital_status: "never_married",
    multi_state: "no",
    claimed_by_other: "no",
    us_citizen: ["me"],
    on_visa: ["none"],
    fulltime_student: ["none"],
    legally_blind: ["none"],
    disabled: ["none"],
    ippin: ["none"],
    digital_assets: ["none"],
    has_household_members: "yes",
    hh: [
      {
        first_name: person.child,
        last_name: person.last,
        dob: person.childDob,
        relationship: "son_daughter",
        months_lived: "12",
        married: "single",
        us_citizen: "yes",
        resident_na: "yes",
        fulltime_student: "no",
        disabled: "no",
        ippin: "no",
      },
    ],
    inc_wages: "yes",
    inc_wages_job_count: "1",
    inc_tips: "no",
    inc_retirement: "no",
    inc_disability: "no",
    inc_social_security: "no",
    inc_unemployment: "no",
    inc_state_refund: "no",
    inc_interest_div: "no",
    inc_sale_assets: "no",
    inc_alimony: "no",
    inc_rental_home: "no",
    inc_rental_property: "no",
    inc_gambling: "no",
    inc_self_employed: "no",
    inc_other: "no",
    exp_mortgage_interest: "no",
    exp_taxes: "no",
    exp_medical: "no",
    exp_charity: "no",
    exp_student_loan: "no",
    exp_dependent_care: "no",
    exp_retirement_contrib: "no",
    exp_educator: "no",
    exp_alimony_paid: "no",
    evt_education: "no",
    evt_sold_home: "no",
    evt_hsa: "no",
    evt_marketplace: "no",
    evt_energy: "no",
    evt_other: "no",
    evt_debt_canceled: "no",
    evt_disaster: "no",
    evt_credit_disallowed: "no",
    evt_irs_letter: "no",
    evt_estimated_payments: "no",
    evt_brought_prior_return: "no",
    refund_method: "direct_deposit",
    payment_method: "bank_account",
    irs_language_pref: ["none"],
    pecf: ["none"],
    // No form_version, and nothing from section 14 (the Form 15080 consent):
    // consent is the client's own choice.
  };
  if (!married) return answers;
  const spouse = pick(V2_SPOUSES, n);
  return {
    ...answers,
    marital_status: "married",
    married_last_day: "yes",
    lived_apart_last_6mo: "no",
    sp_first_name: spouse.first,
    sp_last_name: person.last,
    sp_dob: spouse.dob,
    sp_job_title: "Teacher",
    sp_phone: samplePhone(n, 50),
  };
}

// Blank is "not answered" (null, "", spaces, []), and only catalogue fields.
function fillBlankVersionTwo(current, generated) {
  const result = {};
  for (const key of new Set([...Object.keys(current), ...Object.keys(generated)])) {
    if (!findQuestion(2, key)) continue;
    if (isAnswered(current[key])) result[key] = current[key];
    else if (isAnswered(generated[key])) result[key] = generated[key];
  }
  return result;
}
