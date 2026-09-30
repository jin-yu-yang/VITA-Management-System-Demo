import test from "node:test";
import assert from "node:assert/strict";
import {
  CATALOGUE, stepsFor, questionsFor, findQuestion, wording, isVisible, checkValue,
  missingToSubmit, isAnswered, CONTACT_FIELDS, serviceLabel, languageLabel, MATERIALS_ITEMS,
  canSeeContact,
} from "../src/intake-catalogue.mjs";

const q = (id) => findQuestion(2, id);

test("steps: nine for version 2, none for version 1", () => {
  assert.equal(stepsFor(2).length, 9);
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
  const person = { first_name: "A", last_name: "B", dob: "2020-01-01", months_lived: "12" };
  assert.equal(checkValue(hh, [person]), null);
  assert.equal(typeof checkValue(hh, [{ ...person, nickname: "x" }]), "string");
  assert.equal(typeof checkValue(hh, [{ ...person, dob: "2020-13-01" }]), "string");
  assert.equal(checkValue(hh, Array(10).fill(person)), null);
  assert.equal(typeof checkValue(hh, Array(11).fill(person)), "string");
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
  const hh = missingToSubmit(2, { has_household_members: "yes", hh: [{ first_name: "A", last_name: "B", relationship: "parent", months_lived: "3" }] });
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

test("email is deliberately loose: 254 chars, one @, both sides non-empty", () => {
  const e = q("email");
  assert.equal(checkValue(e, "a b@c"), null);
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
  const hh = missingToSubmit(2, { has_household_members: "yes", hh: [{ first_name: "A", last_name: "B", dob: "", relationship: "parent", months_lived: "3" }] });
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
