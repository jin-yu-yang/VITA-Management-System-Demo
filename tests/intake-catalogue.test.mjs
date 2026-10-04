import test from "node:test";
import assert from "node:assert/strict";
import {
  CATALOGUE, stepsFor, questionsFor, findQuestion, wording, isVisible, checkValue,
  missingToSubmit, isAnswered, CONTACT_FIELDS, serviceLabel, languageLabel, MATERIALS_ITEMS,
  canSeeContact, substepsFor, findSubstep, substepOfQuestion, substepQuestions, visibleAnswers, isMemberId,
} from "../src/intake-catalogue.mjs";
import { INTAKE_VALUE_CASES } from "./support/intake-value-cases.mjs";

const q = (id) => findQuestion(2, id);

test("steps: ten for version 2, none for version 1", () => {
  assert.equal(stepsFor(2).length, 10);
  assert.deepEqual(stepsFor(2).map((s) => s.id), ["before", "about", "household", "income", "expenses", "refund", "optional", "documents", "notes", "review"]);
  assert.deepEqual(stepsFor(2).map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(stepsFor(1), []);
  assert.ok(questionsFor(2, 1).some((x) => x.id === "service"));
  assert.deepEqual(questionsFor(1, 1), []);
  assert.ok(MATERIALS_ITEMS.length > 0 && CATALOGUE.version === 2);
});

test("wording differs by variant where the drafts differ, and by language", () => {
  const all = stepsFor(2).flatMap((s) => s.sections.flatMap((x) => x.questions));
  const differing = all.find((x) => x.wording.general.en !== x.wording.senior.en);
  assert.ok(differing);
  assert.notEqual(wording(differing, { variant: "general" }), wording(differing, { variant: "senior" }));
  assert.equal(wording(differing), differing.wording.general.en);
  assert.equal(wording(differing, { lang: "zh", variant: "senior" }), differing.wording.senior.zh);
});

test("isVisible: eq, ne, filled, arrays and AND", () => {
  const eq = { showIf: [{ field: "a", op: "eq", value: "x" }] };
  assert.equal(isVisible(eq, { a: "x" }), true);
  assert.equal(isVisible(eq, { a: "y" }), false);
  assert.equal(isVisible(eq, {}), false);
  assert.equal(isVisible(eq, { a: ["x", "z"] }), true);
  assert.equal(isVisible(eq, { a: ["z"] }), false);
  const ne = { showIf: [{ field: "a", op: "ne", value: "x" }] };
  assert.equal(isVisible(ne, {}), false);
  assert.equal(isVisible(ne, { a: "" }), false);
  assert.equal(isVisible(ne, { a: "y" }), true);
  assert.equal(isVisible(ne, { a: "x" }), false);
  assert.equal(isVisible(ne, { a: ["y"] }), true);
  assert.equal(isVisible(ne, { a: ["x", "y"] }), false);
  const filled = { showIf: [{ field: "a", op: "filled" }] };
  assert.equal(isVisible(filled, { a: "" }), false);
  assert.equal(isVisible(filled, { a: [] }), false);
  assert.equal(isVisible(filled, { a: "s" }), true);
  assert.equal(isVisible(filled, { a: ["s"] }), true);
  const both = { showIf: [{ field: "a", op: "eq", value: "x" }, { field: "b", op: "filled" }] };
  assert.equal(isVisible(both, { a: "x", b: "1" }), true);
  assert.equal(isVisible(both, { a: "x" }), false);
  assert.equal(isVisible({}, {}), true);
});

test("checkValue by type", () => {
  const ok = (id, v) => assert.equal(checkValue(q(id), v), null, `${id} ${JSON.stringify(v)}`);
  const bad = (id, v) => assert.equal(typeof checkValue(q(id), v), "string", `${id} ${JSON.stringify(v)}`);
  ok("tp_first_name", "a".repeat(200)); bad("tp_first_name", "a".repeat(201));
  ok("additional_notes", "a".repeat(5000)); bad("additional_notes", "a".repeat(5001));
  ok("gcf_tp_signature", "Jo"); bad("gcf_tp_signature", "a".repeat(201));
  ok("email", "a@b.co"); bad("email", "a@@b"); bad("email", "nope");
  ok("tp_phone", "(215) 555-0100"); bad("tp_phone", "555-0100");
  ok("sp_phone", "2155550100");
  ok("addr_zip", "19104"); bad("addr_zip", "1910");
  ok("tp_dob", "2000-02-29"); bad("tp_dob", "2025-02-30"); bad("tp_dob", "02/03/2000");
  ok("spouse_death_year", "2024"); bad("spouse_death_year", "24");
  ok("inc_wages_job_count", "3"); bad("inc_wages_job_count", "1234567"); bad("inc_wages_job_count", "1a");
  ok("service", "drop_off"); bad("service", "Drop-off");
  ok("best_contact_time", []); bad("best_contact_time", ["nonsense"]);
  const first = q("best_contact_time").options[0].value;
  ok("best_contact_time", [first]); bad("best_contact_time", [first, first]);
  ok("us_citizen", ["me"]); ok("us_citizen", ["none"]); bad("us_citizen", ["none", "me"]); bad("us_citizen", ["other"]);
  ok("inc_wages", "yes"); ok("inc_wages", "not_sure"); bad("inc_wages", "maybe");
  bad("married_last_day", "not_sure");
});

test("checkValue: number ranges and groups", () => {
  const hh = q("hh");
  const months = hh.fields.find((f) => f.id === "months_lived");
  assert.equal(checkValue(months, "12"), null);
  assert.equal(checkValue(months, 12), "Expected text.");
  assert.equal(typeof checkValue(months, "13"), "string");
  const person = { member_id: "0123456789abcdef0123456789abcdef", first_name: "A", last_name: "B", dob: "2020-01-01", months_lived: "12" };
  assert.equal(checkValue(hh, [person]), null);
  assert.equal(typeof checkValue(hh, [{ ...person, nickname: "x" }]), "string");
  assert.equal(typeof checkValue(hh, [{ ...person, dob: "2020-13-01" }]), "string");
  const people = (n) => Array.from({ length: n }, (_, i) => ({ ...person, member_id: i.toString(16).padStart(32, "0") }));
  assert.equal(checkValue(hh, people(10)), null);
  assert.equal(typeof checkValue(hh, people(11)), "string");
  assert.equal(typeof checkValue(hh, "x"), "string");
});

test("missingToSubmit", () => {
  const missing = missingToSubmit(2, {});
  for (const id of ["service", "language", "tp_first_name", "tp_phone"]) assert.ok(missing.includes(id), id);
  for (const id of ["tp_middle_name", "form_version", "sp_first_name", "hh"]) assert.ok(!missing.includes(id), id);
  assert.ok(!missingToSubmit(2, {}, { tp_phone: "2155550100" }).includes("tp_phone"));
  assert.ok(missingToSubmit(2, { marital_status: "single" }).every((id) => !id.startsWith("sp_")));
  const married = missingToSubmit(2, { marital_status: "married" });
  assert.ok(married.includes("sp_first_name"));
  assert.ok(!married.includes("sp_middle_name"));
  const hh = missingToSubmit(2, { has_household_members: "yes", hh: [{ member_id: "0123456789abcdef0123456789abcdef", first_name: "A", last_name: "B", relationship: "parent", months_lived: "3" }] });
  assert.ok(hh.includes("hh[0].dob"));
  assert.ok(!hh.includes("hh[0].first_name"));
  assert.ok(missingToSubmit(2, { has_household_members: "yes" }).includes("hh"));
  assert.deepEqual(missingToSubmit(1, {}), []);
});

test("service and language labels cover both versions", () => {
  assert.equal(serviceLabel("drop_off"), "Drop-off");
  assert.equal(serviceLabel("same_day"), "Same-day");
  assert.equal(serviceLabel("Drop-off"), "Drop-off");
  assert.equal(serviceLabel("Federal return"), "Federal return");
  assert.equal(serviceLabel(undefined), undefined);
  assert.equal(languageLabel("cantonese"), "Cantonese");
  assert.equal(languageLabel("Cantonese"), "Cantonese");
  assert.equal(languageLabel("Polish"), "Polish");
});

test("phone: strip every non-digit, then exactly 10 digits", () => {
  const p = q("tp_phone");
  assert.equal(checkValue(p, "(215) 555-0100"), null);
  assert.equal(checkValue(p, "2155550100x"), null);
  assert.equal(typeof checkValue(p, "555-0100"), "string");
  assert.equal(typeof checkValue(p, "21555501001"), "string");
});

test("email is loose but has no spaces: 254 chars, one @, both sides non-empty", () => {
  const e = q("email");
  // Spec §2.5: the browser rejects a space inside; the server's check doesn't
  // (the one intended difference, recorded in the contract table).
  assert.equal(checkValue(e, "a b@c"), "Enter a valid email address.");
  assert.equal(checkValue(e, "mei lin@example.com"), "Enter a valid email address.");
  assert.equal(typeof checkValue(e, "@c"), "string");
  assert.equal(typeof checkValue(e, "a@"), "string");
  assert.equal(typeof checkValue(e, "a@b@c"), "string");
  assert.equal(checkValue(e, "a@" + "b".repeat(252)), null);
  assert.equal(typeof checkValue(e, "a@" + "b".repeat(253)), "string");
});

test("contact accepts the store's shape and the field ids", () => {
  assert.deepEqual(CONTACT_FIELDS, {
    tp_phone: "phone", sp_phone: "spousePhone",
    best_contact_time: "bestContactTime", best_contact_note: "bestContactNote",
  });
  const answers = { marital_status: "married" };
  const time = [q("best_contact_time").options[0].value];
  assert.ok(missingToSubmit(2, answers).includes("tp_phone"));
  assert.ok(!missingToSubmit(2, answers, { phone: "2155550100", bestContactTime: time }).includes("tp_phone"));
  assert.ok(!missingToSubmit(2, answers, { tp_phone: "2155550100" }).includes("tp_phone"));
  assert.ok(missingToSubmit(2, answers, { phone: "" }).includes("tp_phone"));
});

test("empty strings and arrays are unanswered everywhere", () => {
  assert.equal(isAnswered(undefined), false);
  assert.equal(isAnswered(null), false);
  assert.equal(isAnswered(""), false);
  assert.equal(isAnswered("  "), false);
  assert.equal(isAnswered([]), false);
  assert.equal(isAnswered("a"), true);
  assert.equal(isAnswered(["a"]), true);
  const filled = { showIf: [{ field: "a", op: "filled" }] };
  assert.equal(isVisible(filled, { a: "  " }), false);
  assert.equal(isVisible({ showIf: [{ field: "a", op: "ne", value: "x" }] }, { a: "" }), false);
  const m = missingToSubmit(2, { service: "", language: [], tp_first_name: "  " });
  for (const id of ["service", "language", "tp_first_name"]) assert.ok(m.includes(id), id);
  const hh = missingToSubmit(2, { has_household_members: "yes", hh: [{ member_id: "0123456789abcdef0123456789abcdef", first_name: "A", last_name: "B", dob: "", relationship: "parent", months_lived: "3" }] });
  assert.ok(hh.includes("hh[0].dob"));
  for (const id of ["tp_first_name", "tp_dob", "best_contact_time", "hh", "tp_phone"])
    for (const empty of [null, "", []]) assert.equal(checkValue(q(id), empty), null, id);
});

test("canSeeContact: office staff always, a volunteer only on their own case (D5, 013's works_on_case)", () => {
  const record = { preparerId: "p-prep", reviewerId: "p-rev" };
  assert.equal(canSeeContact(record, { id: "p-office", capabilities: ["followup"] }), true);
  assert.equal(canSeeContact(record, { id: "p-admin", capabilities: ["admin"] }), true);
  assert.equal(canSeeContact({}, { id: "p-admin", capabilities: ["admin"] }), true);
  assert.equal(canSeeContact(record, { id: "p-prep", capabilities: ["prepare"] }), true);
  assert.equal(canSeeContact(record, { id: "p-rev", capabilities: ["review"] }), true);
  // A volunteer on an available (unclaimed) case, or on someone else's.
  assert.equal(canSeeContact({ preparerId: null, reviewerId: null }, { id: "p-prep", capabilities: ["prepare", "review"] }), false);
  assert.equal(canSeeContact(record, { id: "p-other", capabilities: ["prepare", "review", "assist", "receive_documents"] }), false);
  // No person, or a person without an id, never matches an empty slot.
  assert.equal(canSeeContact(record, null), false);
  assert.equal(canSeeContact(record, undefined), false);
  assert.equal(canSeeContact({ preparerId: undefined, reviewerId: undefined }, { capabilities: [] }), false);
  assert.equal(canSeeContact({ preparerId: null }, { id: null, capabilities: ["prepare"] }), false);
  assert.equal(canSeeContact(null, { id: "p-prep", capabilities: ["prepare"] }), false);
});

test("the value-check contract table: checkValue gives each row's js result (spec §6)", () => {
  for (const row of INTAKE_VALUE_CASES) {
    const question = q(row.field);
    assert.ok(question, `unknown catalogue id ${row.field}`);
    assert.equal(checkValue(question, row.value) === null, row.js, `${row.field} ${JSON.stringify(row.value).slice(0, 60)}`);
  }
  const marked = INTAKE_VALUE_CASES.filter((row) => row.js !== row.sql);
  assert.deepEqual(marked.map((row) => [row.field, row.value]), [["email", "mei lin@example.com"], ["email", "a b@c"]]);
  const types = new Set(INTAKE_VALUE_CASES.map((row) => q(row.field).type));
  for (const type of ["text", "longtext", "signature", "email", "phone", "zip", "date", "year", "number", "choice", "yesno", "multi", "who", "group"])
    assert.ok(types.has(type), type);
});

const SUBSTEP_IDS = [
  "before.ready", "before.service", "before.language",
  "about.you", "about.address", "about.marital", "about.spouse", "about.situation", "about.irs",
  "household.members",
  "income.wages", "income.retirement", "income.investments", "income.rental", "income.business", "income.other",
  "expenses.deductible", "expenses.other", "expenses.events",
  "refund.payment", "refund.consent",
  "optional.questions",
  "documents.bring", "documents.identity", "documents.income", "documents.expenses", "documents.events", "documents.other",
  "notes.anything",
  "review.check", "review.summary", "review.submit",
];

test("every step has a sub-step, and every top-level question is in exactly one", () => {
  for (const step of stepsFor(2)) assert.ok(step.substeps.length > 0, step.id);
  const all = stepsFor(2).flatMap((s) => s.sections.flatMap((x) => x.questions)).map((x) => x.id);
  const listed = stepsFor(2).flatMap((s) => s.substeps.flatMap((x) => x.questions));
  assert.deepEqual([...listed].sort(), [...all].sort());
  assert.equal(new Set(listed).size, listed.length);
  for (const id of listed) assert.ok(q(id), id);
});

test("substepsFor lists the sub-steps in order, each with its step", () => {
  const subs = substepsFor(2);
  assert.deepEqual(subs.map((s) => s.id), SUBSTEP_IDS);
  assert.deepEqual(substepsFor(2).filter((s) => s.step.id === "documents").map((s) => s.id)[0], "documents.bring");
  for (const sub of subs) assert.ok(stepsFor(2).includes(sub.step) && sub.step.substeps.some((x) => x.id === sub.id));
  assert.deepEqual(substepsFor(1), []);
  assert.equal(findSubstep("income.other").step.id, "income");
  assert.equal(findSubstep("income.other").kind, "questions");
  assert.equal(findSubstep("nope.nope"), null);
});

test("substepOfQuestion and substepQuestions", () => {
  assert.equal(substepOfQuestion("inc_alimony"), "income.other");
  assert.equal(substepOfQuestion("tp_phone"), "about.you");
  assert.equal(substepOfQuestion("gcf_sp_date"), "refund.consent");
  assert.equal(substepOfQuestion("nonesuch"), null);
  assert.deepEqual(substepQuestions("income.other").map((x) => x.id), ["inc_alimony", "inc_gambling", "inc_other", "inc_other_desc"]);
  assert.deepEqual(substepQuestions("documents.identity"), []);
  assert.deepEqual(substepQuestions("nope.nope"), []);
});

test("visibleAnswers drops the keys of hidden top-level questions", () => {
  const answers = { inc_sale_assets: "no", inc_sale_assets_prior_loss: "yes", tp_first_name: "Mei", nonsense: 1 };
  const seen = visibleAnswers(2, answers);
  assert.equal(Object.hasOwn(seen, "inc_sale_assets_prior_loss"), false);
  assert.equal(seen.inc_sale_assets, "no");
  assert.equal(seen.tp_first_name, "Mei");
  assert.equal(seen.nonsense, 1);
  assert.notStrictEqual(seen, answers);
  assert.equal(answers.inc_sale_assets_prior_loss, "yes");
  assert.equal(Object.hasOwn(visibleAnswers(2, { inc_sale_assets: "yes", inc_sale_assets_prior_loss: "yes" }), "inc_sale_assets_prior_loss"), true);
});

test("gcf_sp_date shows only with consent, a married filer and the spouse's signature", () => {
  const date = q("gcf_sp_date");
  const base = { gcf_consent: "yes", marital_status: "married", gcf_sp_signature: "Wei Lin" };
  assert.equal(isVisible(date, base), true);
  assert.equal(isVisible(date, { ...base, gcf_consent: "no" }), false);
  assert.equal(isVisible(date, { ...base, marital_status: "never_married" }), false);
  const { gcf_sp_signature, ...unsigned } = base;
  assert.equal(isVisible(date, unsigned), false);
});

test("the id type: 32 lowercase hex characters", () => {
  assert.equal(checkValue({ type: "id" }, "0123456789abcdef0123456789abcdef"), null);
  assert.equal(checkValue({ type: "id" }, "XYZ"), "Not a valid id.");
  assert.equal(checkValue({ type: "id" }, "0123"), "Not a valid id.");
  assert.equal(checkValue({ type: "id" }, "0123456789ABCDEF0123456789ABCDEF"), "Not a valid id.");
  assert.equal(isMemberId("0123456789abcdef0123456789abcdef"), true);
  assert.equal(isMemberId("0123456789abcdef0123456789abcde"), false);
  assert.equal(isMemberId(undefined), false);
  assert.equal(isMemberId(12), false);
});

test("a household needs a well-formed, unique id on every member", () => {
  const hh = q("hh");
  const A = "0123456789abcdef0123456789abcdef";
  const B = "fedcba9876543210fedcba9876543210";
  assert.equal(hh.fields[0].id, "member_id");
  assert.equal(hh.fields[0].type, "id");
  assert.equal(hh.fields[0].required, false);
  assert.equal(checkValue(hh, [{ first_name: "A" }]), "Each person needs an id.");
  assert.equal(checkValue(hh, [{ member_id: "", first_name: "A" }]), "Each person needs an id.");
  assert.equal(checkValue(hh, [{ member_id: "XYZ", first_name: "A" }]), "Each person needs an id.");
  assert.equal(checkValue(hh, [{ member_id: A }, { member_id: A }]), "Two people share an id.");
  assert.equal(checkValue(hh, [{ member_id: A }, { member_id: B }]), null);
  assert.equal(checkValue(hh, [{ member_id: A, first_name: "A" }]), null);
  assert.equal(checkValue(hh, [{ member_id: A }, {}]), "Each person needs an id.");
});
