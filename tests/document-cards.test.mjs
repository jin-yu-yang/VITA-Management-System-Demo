import test from "node:test";
import assert from "node:assert/strict";
import {
  CARD_RULES, CARD_SUBSTEPS, CARD_TEMPLATES, CARD_WHY, RULE_TYPES, SLOT_PATTERN, cardsFor,
} from "../src/document-cards.mjs";
import { findQuestion } from "../src/intake-catalogue.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";
import { LANGS, sourceText } from "../src/language.mjs";
import { setHantMap } from "../src/hant.mjs";
import MAP from "../src/zh-hant.mjs";

const ID_A = "a".repeat(32);
const ID_B = "0123456789abcdef0123456789abcdef";
const single = { marital_status: "never_married" };
const married = { marital_status: "married", sp_first_name: "Mei", sp_last_name: "Lin" };

const slots = (answers, state) => cardsFor(answers, state).map((c) => c.slotId);
const find = (answers, slotId, state) => cardsFor(answers, state).find((c) => c.slotId === slotId);

test("nothing answered: photo ID, SSN and the optional Other card", () => {
  const cards = cardsFor(single);
  assert.deepEqual(cards.map((c) => c.slotId), ["photo_id.tp", "ssn.tp", "other.household"]);
  assert.deepEqual(cards.map((c) => c.substep), ["identity", "identity", "other"]);
  assert.deepEqual(cards.map((c) => c.group), ["needed", "needed", "optional"]);
  assert.deepEqual(cardsFor({}).map((c) => c.slotId), ["photo_id.tp", "ssn.tp", "other.household"]);
  assert.deepEqual(cardsFor(null).map((c) => c.slotId), ["photo_id.tp", "ssn.tp", "other.household"]);
  const card = cards[0];
  assert.deepEqual(Object.keys(card).sort(), ["ask", "baseGroup", "group", "hint", "label", "owner", "ownerLine", "ruleId", "slotId", "status", "substep", "why"]);
  assert.equal(card.status, "not_done");
  assert.equal(card.baseGroup, "needed");
  assert.equal(card.label.en, "Photo ID (driver's license, state ID, passport)");
});

test("married adds the spouse's photo ID and SSN, with the file-together hint", () => {
  const cards = cardsFor(married).filter((c) => c.owner === "sp");
  assert.deepEqual(cards.map((c) => c.slotId), ["photo_id.sp", "ssn.sp"]);
  for (const c of cards) {
    assert.equal(c.group, "needed");
    assert.deepEqual(c.hint, { en: "Needed if you file together", zh: "如合并申报则需要" });
  }
  const tp = find(married, "ssn.tp");
  assert.notDeepEqual(tp.hint, cards[1].hint);
  assert.ok(!slots(single).includes("photo_id.sp"));
});

test("household members: Maybe-needed SSN cards in list order, only with a valid id", () => {
  const answers = {
    ...single, has_household_members: "yes",
    hh: [
      { member_id: ID_A, first_name: "Kai", last_name: "Chen" },
      { first_name: "No", last_name: "Id" },
      { member_id: "NOT-HEX", first_name: "Bad" },
      { member_id: ID_B },
    ],
  };
  const cards = cardsFor(answers).filter((c) => c.ruleId === "ssn" && c.owner.startsWith("hh."));
  assert.deepEqual(cards.map((c) => c.slotId), [`ssn.hh.${ID_A}`, `ssn.hh.${ID_B}`]);
  assert.deepEqual(cards.map((c) => c.group), ["maybe", "maybe"]);
  assert.deepEqual(cards[0].ownerLine, { en: "Kai Chen", zh: "Kai Chen", literal: true });
  assert.deepEqual(cards[1].ownerLine, { en: "Person 4", zh: { template: "成员 {n}", params: { n: 4 } } });
  // hidden: household answers behind has_household_members = no
  assert.deepEqual(slots({ ...answers, has_household_members: "no" }), ["photo_id.tp", "ssn.tp", "other.household"]);
});

test("owner lines for the client and the spouse", () => {
  assert.deepEqual(find(single, "photo_id.tp").ownerLine, { en: "You", zh: "本人" });
  assert.deepEqual(find({ ...single, tp_first_name: "Ana", tp_last_name: "Reyes" }, "photo_id.tp").ownerLine, { en: "Ana Reyes", zh: "Ana Reyes", literal: true });
  assert.deepEqual(find({ ...single, tp_first_name: "Ana" }, "photo_id.tp").ownerLine, { en: "Ana", zh: "Ana", literal: true });
  assert.deepEqual(find({ marital_status: "married" }, "photo_id.sp").ownerLine, { en: "Your spouse", zh: "配偶" });
  assert.deepEqual(find(married, "photo_id.sp").ownerLine, { en: "Mei Lin", zh: "Mei Lin", literal: true });
});

test("owner lines for shared and household cards", () => {
  const a = { inc_wages: "yes", exp_medical: "yes" };
  assert.deepEqual(find({ ...single, ...a }, "w2.household").ownerLine, { en: "For you", zh: "本人" });
  assert.deepEqual(find({ ...married, ...a }, "w2.household").ownerLine, { en: "For you and your spouse", zh: "您和配偶" });
  assert.deepEqual(find({ ...single, ...a }, "medical.household").ownerLine, { en: "For your household", zh: "全家共用" });
  assert.deepEqual(find({ ...married, ...a }, "medical.household").ownerLine, { en: "For your household", zh: "全家共用" });
});

test("wages: yes is Needed, not_sure is Maybe needed, no is none", () => {
  const w2 = (v) => find({ ...single, inc_wages: v }, "w2.household");
  assert.equal(w2("yes").group, "needed");
  assert.equal(w2("not_sure").group, "maybe");
  assert.equal(w2("no"), undefined);
  assert.equal(w2(""), undefined);
  assert.equal(w2("yes").hint, null);
  assert.deepEqual(w2("yes").why, { en: "You said you had wages from a job", zh: "您说有工资收入" });
  assert.equal(w2("yes").ask, "inc_wages");
});

test("w2 hint comes from the job count", () => {
  const hint = (count) => find({ ...single, inc_wages: "yes", inc_wages_job_count: count }, "w2.household").hint;
  assert.deepEqual(hint("2"), { en: "You said 2 jobs. Upload 2 W-2s.", zh: { template: "您说有 {n} 份工作，请上传 {n} 张 W-2。", params: { n: 2 } } });
  assert.deepEqual(hint("1"), { en: "You said 1 job. Upload 1 W-2.", zh: { template: "您说有 {n} 份工作，请上传 {n} 张 W-2。", params: { n: 1 } } });
  assert.equal(hint(""), null);
  assert.equal(hint(undefined), null);
  assert.equal(hint("0"), null);
  assert.equal(hint("abc"), null);
});

test("other income and other event show the client's description", () => {
  const oi = find({ ...single, inc_other: "yes", inc_other_desc: "Jury duty pay" }, "other_income.household");
  assert.deepEqual(oi.why, { en: "You wrote: Jury duty pay", zh: { template: "您填写的是：{written}", params: { written: "Jury duty pay" } } });
  const oe = find({ ...single, evt_other: "yes", evt_other_desc: "Bought a car" }, "other_event.household");
  assert.deepEqual(oe.why, { en: "You wrote: Bought a car", zh: { template: "您填写的是：{written}", params: { written: "Bought a car" } } });
  const blank = find({ ...single, inc_other: "yes", inc_other_desc: "  " }, "other_income.household");
  assert.equal(blank.why.en, "You said you had other income");
  // hidden description (inc_other = no) is not read
  assert.equal(find({ ...single, inc_other: "no", inc_other_desc: "x" }, "other_income.household"), undefined);
});

test("prior return: hidden answers do not count", () => {
  const stale = { ...single, inc_sale_assets: "no", inc_sale_assets_prior_loss: "yes", evt_brought_prior_return: "no" };
  assert.equal(find(stale, "prior_return.household"), undefined);
  const stale2 = { ...single, inc_self_employed: "no", inc_self_employed_prior_loss: "yes", evt_brought_prior_return: "no" };
  assert.equal(find(stale2, "prior_return.household"), undefined);
});

test("prior return: Maybe needed when it is missing but the answers suggest it, Needed when brought", () => {
  const maybe = find({ ...single, inc_state_refund: "yes", evt_brought_prior_return: "no" }, "prior_return.household");
  assert.equal(maybe.group, "maybe");
  assert.deepEqual(maybe.why, { en: "If you can find it, last year's return helps the volunteer", zh: "如果能找到，去年的报税表对志愿者很有帮助。" });
  const needed = cardsFor({ ...single, inc_state_refund: "yes", evt_brought_prior_return: "yes" }).filter((c) => c.ruleId === "prior_return");
  assert.equal(needed.length, 1);
  assert.equal(needed[0].group, "needed");
  assert.equal(needed[0].baseGroup, "needed");
  assert.match(needed[0].hint.en, /^If you filed together last year, upload one return\./);
  // every feeder works
  for (const extra of [
    { inc_sale_assets: "yes", inc_sale_assets_prior_loss: "yes" },
    { inc_self_employed: "yes", inc_self_employed_prior_loss: "yes" },
    { evt_credit_disallowed: "yes" },
    { evt_estimated_payments: "yes" },
  ]) {
    assert.equal(find({ ...single, ...extra, evt_brought_prior_return: "no" }, "prior_return.household")?.group, "maybe", JSON.stringify(extra));
  }
  // no feeder, no card
  assert.equal(find({ ...single, evt_brought_prior_return: "no" }, "prior_return.household"), undefined);
});

test("bank: direct deposit or split is Needed, a bank payment alone is Maybe, both make one Needed card", () => {
  const bank = (a) => cardsFor({ ...single, ...a }).filter((c) => c.ruleId === "bank");
  assert.equal(bank({ refund_method: "direct_deposit" })[0].group, "needed");
  assert.equal(bank({ refund_method: "split" })[0].group, "needed");
  assert.equal(bank({ refund_method: "check" }).length, 0);
  assert.equal(bank({ refund_method: "other" }).length, 0);
  assert.deepEqual(bank({ payment_method: "bank_account" }).map((c) => c.group), ["maybe"]);
  assert.equal(bank({ payment_method: "mail" }).length, 0);
  const both = bank({ refund_method: "direct_deposit", payment_method: "bank_account" });
  assert.equal(both.length, 1);
  assert.equal(both[0].group, "needed");
  assert.equal(both[0].baseGroup, "needed");
  assert.equal(both[0].hint.en, "The account must be in your name (or your spouse's).");
});

test("Who questions: IP PIN, visa and digital assets", () => {
  const ip = cardsFor({ ...married, ippin: ["me", "spouse"] }).filter((c) => c.ruleId === "ippin");
  assert.deepEqual(ip.map((c) => [c.slotId, c.group]), [["ippin.tp", "needed"], ["ippin.sp", "needed"]]);
  assert.deepEqual(slots({ ...single, ippin: ["none"] }).filter((s) => s.startsWith("ippin")), []);
  assert.deepEqual(slots({ ...single, ippin: ["spouse"] }).filter((s) => s.startsWith("ippin")), [], "no spouse on the return");
  const visa = find({ ...single, on_visa: ["me"] }, "visa.tp");
  assert.equal(visa.group, "maybe");
  assert.equal(visa.substep, "events");
  assert.equal(find({ ...married, on_visa: ["spouse"] }, "visa.sp").group, "maybe");
  const da = find({ ...single, digital_assets: ["me"] }, "digital_assets.household");
  assert.equal(da.group, "maybe");
  assert.equal(da.substep, "income");
  assert.equal(cardsFor({ ...married, digital_assets: ["me", "spouse"] }).filter((c) => c.ruleId === "digital_assets").length, 1);
});

test("household member IP PIN", () => {
  const answers = {
    ...single, has_household_members: "yes",
    hh: [{ member_id: ID_A, first_name: "Kai", ippin: "yes" }, { member_id: ID_B, ippin: "no" }, { first_name: "x", ippin: "yes" }],
  };
  const ip = cardsFor(answers).filter((c) => c.ruleId === "ippin");
  assert.deepEqual(ip.map((c) => [c.slotId, c.group]), [[`ippin.hh.${ID_A}`, "needed"]]);
});

test("custody: not married with a member under 6 months", () => {
  const hh = [{ member_id: ID_A, months_lived: "4" }];
  const base = { has_household_members: "yes", hh };
  const c = find({ ...single, ...base }, "custody.household");
  assert.equal(c.group, "maybe");
  assert.equal(c.substep, "events");
  assert.equal(find({ ...married, ...base }, "custody.household"), undefined);
  assert.equal(find({ ...single, has_household_members: "yes", hh: [{ member_id: ID_A, months_lived: "6" }] }, "custody.household"), undefined);
  assert.equal(find({ ...single, has_household_members: "yes", hh: [{ member_id: ID_A, months_lived: "" }] }, "custody.household"), undefined);
  assert.equal(find({ ...single, has_household_members: "no", hh }, "custody.household"), undefined);
});

test("stored state: status and the Needed override", () => {
  const w2 = { ...single, inc_wages: "yes" };
  assert.equal(find(w2, "w2.household", [{ slotId: "w2.household", status: "later", groupOverride: null }]).status, "later");
  assert.equal(find(w2, "w2.household", [{ slotId: "w2.household", status: "none", groupOverride: null }]).status, "none");
  assert.equal(find(w2, "w2.household", [{ slotId: "w2.household", status: null, groupOverride: null }]).status, "not_done");
  assert.equal(find(w2, "w2.household", []).status, "not_done");
  const answers = { ...single, has_household_members: "yes", hh: [{ member_id: ID_A }] };
  const slotId = `ssn.hh.${ID_A}`;
  const moved = find(answers, slotId, [{ slotId, status: null, groupOverride: "needed" }]);
  assert.equal(moved.group, "needed");
  assert.equal(moved.baseGroup, "maybe");
  assert.equal(moved.status, "not_done");
  // moved up cards sort with the Needed ones
  const order = cardsFor(answers, [{ slotId, status: null, groupOverride: "needed" }]).map((c) => c.slotId);
  assert.deepEqual(order, ["photo_id.tp", "ssn.tp", slotId, "other.household"]);
  // state for a card that is not shown is ignored
  assert.deepEqual(slots(single, [{ slotId: "w2.household", status: "later", groupOverride: "needed" }]), slots(single));
  // junk state is ignored
  assert.equal(find(w2, "w2.household", [null, {}, { slotId: "w2.household", status: "bogus", groupOverride: "maybe" }]).status, "not_done");
  assert.equal(find(w2, "w2.household", [{ slotId: "w2.household", status: "bogus", groupOverride: "maybe" }]).group, "needed");
});

test("the other card is optional and stored state never changes its group", () => {
  const state = [{ slotId: "other.household", status: null, groupOverride: "needed" }];
  const c = find(single, "other.household", state);
  assert.equal(c.group, "optional");
  assert.equal(c.baseGroup, "optional");
  assert.equal(c.substep, "other");
  assert.equal(c.owner, "household");
  assert.deepEqual(c.hint, { en: "For example, a city tax notice, or a blank local tax form you received.", zh: "例如市政府的税务通知，或您收到的空白地方税表。" });
});

test("ordering: sub-step, then Needed before Maybe needed, then rule order, then owner", () => {
  const answers = {
    ...married, has_household_members: "yes",
    hh: [{ member_id: ID_A, first_name: "A" }, { member_id: ID_B, first_name: "B" }],
    inc_wages: "yes", inc_tips: "not_sure", inc_retirement: "yes", digital_assets: ["me"],
    exp_medical: "yes", evt_education: "yes", on_visa: ["me"], refund_method: "direct_deposit",
  };
  const cards = cardsFor(answers);
  const subIdx = cards.map((c) => CARD_SUBSTEPS.indexOf(c.substep));
  assert.deepEqual(subIdx, [...subIdx].sort((a, b) => a - b));
  const rank = { needed: 0, maybe: 1, optional: 2 };
  for (let i = 1; i < cards.length; i++) {
    if (cards[i].substep === cards[i - 1].substep) assert.ok(rank[cards[i].group] >= rank[cards[i - 1].group], cards[i].slotId);
  }
  assert.deepEqual(cards.filter((c) => c.substep === "identity").map((c) => c.slotId), [
    "photo_id.tp", "photo_id.sp", "ssn.tp", "ssn.sp", `ssn.hh.${ID_A}`, `ssn.hh.${ID_B}`,
  ]);
  assert.deepEqual(cards.filter((c) => c.substep === "income").map((c) => c.slotId), [
    "w2.household", "1099r.household", "tip_records.household", "digital_assets.household",
  ]);
  assert.equal(cards[0].slotId, "photo_id.tp");
  assert.equal(cards.at(-1).slotId, "other.household");
});

test("slot ids, rule ids and types", () => {
  const everything = {
    ...married, has_household_members: "yes", hh: [{ member_id: ID_A, ippin: "yes", months_lived: "2" }],
    ippin: ["me", "spouse"], on_visa: ["me"], digital_assets: ["spouse"], refund_method: "split", payment_method: "bank_account",
    evt_brought_prior_return: "yes",
  };
  for (const c of cardsFor(everything)) {
    assert.match(c.slotId, SLOT_PATTERN);
    assert.equal(c.slotId, `${c.ruleId}.${c.owner}`);
    assert.ok(RULE_TYPES.has(c.ruleId));
  }
  assert.ok(SLOT_PATTERN.test(`1099g_refund.hh.${ID_A}`));
  assert.ok(!SLOT_PATTERN.test("w2.hh.xyz"));
  assert.ok(!SLOT_PATTERN.test("W2.tp"));
  assert.ok(!SLOT_PATTERN.test("w2.tp.extra"));
  assert.equal(RULE_TYPES.size, 46);
  assert.equal(new Set(CARD_RULES.map((r) => r.id)).size, 46);
  for (const r of CARD_RULES) {
    assert.equal(RULE_TYPES.get(r.id), r.type);
    assert.ok(["person", "shared", "household"].includes(r.type), r.id);
    assert.ok(CARD_SUBSTEPS.includes(r.substep), r.id);
    assert.ok(r.label.en && r.label.zh, r.id);
  }
  assert.deepEqual(CARD_SUBSTEPS, ["identity", "income", "expenses", "events", "other"]);
  // owners fit their types
  for (const c of cardsFor(everything)) {
    const type = RULE_TYPES.get(c.ruleId);
    if (type === "person") assert.ok(/^(tp|sp|hh\.)/.test(c.owner), c.slotId);
    else assert.equal(c.owner, "household", c.slotId);
  }
});

// Appendix A, row by row: [rule id, answers that trigger it, sub-step, group, type].
const yes = (field) => ({ [field]: "yes" });
const APPENDIX_A = [
  ["photo_id", {}, "identity", "needed", "person"],
  ["ssn", {}, "identity", "needed", "person"],
  ["ippin", { ippin: ["me"] }, "identity", "needed", "person"],
  ["prior_return", yes("evt_brought_prior_return"), "identity", "needed", "household"],
  ["w2", yes("inc_wages"), "income", "needed", "shared"],
  ["tip_records", yes("inc_tips"), "income", "needed", "shared"],
  ["1099r", yes("inc_retirement"), "income", "needed", "shared"],
  ["disability", yes("inc_disability"), "income", "needed", "shared"],
  ["ssa1099", yes("inc_social_security"), "income", "needed", "shared"],
  ["1099g_unemployment", yes("inc_unemployment"), "income", "needed", "shared"],
  ["1099g_refund", yes("inc_state_refund"), "income", "needed", "shared"],
  ["1099int_div", yes("inc_interest_div"), "income", "needed", "shared"],
  ["1099b", yes("inc_sale_assets"), "income", "needed", "shared"],
  ["digital_assets", { digital_assets: ["me"] }, "income", "maybe", "shared"],
  ["alimony_received", yes("inc_alimony"), "income", "needed", "household"],
  ["rental_home", yes("inc_rental_home"), "income", "needed", "shared"],
  ["rental_property", yes("inc_rental_property"), "income", "needed", "shared"],
  ["w2g", yes("inc_gambling"), "income", "needed", "shared"],
  ["1099nec_k_misc", yes("inc_self_employed"), "income", "needed", "shared"],
  ["app_tax_summary", yes("inc_self_employed"), "income", "needed", "shared"],
  ["business_costs", yes("inc_self_employed"), "income", "needed", "household"],
  ["other_income", yes("inc_other"), "income", "needed", "shared"],
  ["1098", yes("exp_mortgage_interest"), "expenses", "needed", "household"],
  ["taxes_paid", yes("exp_taxes"), "expenses", "needed", "household"],
  ["medical", yes("exp_medical"), "expenses", "needed", "household"],
  ["charity", yes("exp_charity"), "expenses", "needed", "household"],
  ["1098e", yes("exp_student_loan"), "expenses", "needed", "shared"],
  ["dependent_care", yes("exp_dependent_care"), "expenses", "needed", "household"],
  ["ira_contrib", yes("exp_retirement_contrib"), "expenses", "needed", "shared"],
  ["educator", yes("exp_educator"), "expenses", "needed", "household"],
  ["alimony_paid", yes("exp_alimony_paid"), "expenses", "needed", "household"],
  ["education", yes("evt_education"), "events", "needed", "shared"],
  ["home_sale", yes("evt_sold_home"), "events", "needed", "household"],
  ["hsa", yes("evt_hsa"), "events", "needed", "shared"],
  ["1095a", yes("evt_marketplace"), "events", "needed", "household"],
  ["energy", yes("evt_energy"), "events", "needed", "household"],
  ["other_event", yes("evt_other"), "events", "needed", "household"],
  ["debt_canceled", yes("evt_debt_canceled"), "events", "needed", "household"],
  ["disaster", yes("evt_disaster"), "events", "needed", "household"],
  ["credit_disallowed", yes("evt_credit_disallowed"), "events", "needed", "household"],
  ["irs_letter", yes("evt_irs_letter"), "events", "needed", "household"],
  ["estimated_payments", yes("evt_estimated_payments"), "events", "needed", "household"],
  ["visa", { on_visa: ["me"] }, "events", "maybe", "person"],
  ["custody", { has_household_members: "yes", hh: [{ member_id: ID_A, months_lived: "3" }] }, "events", "maybe", "household"],
  ["bank", { refund_method: "direct_deposit" }, "events", "needed", "household"],
  ["other", {}, "other", "optional", "household"],
];

test("Appendix A: every rule id has a scenario that produces its card", () => {
  assert.deepEqual(new Set(APPENDIX_A.map((r) => r[0])), new Set(RULE_TYPES.keys()));
  assert.equal(APPENDIX_A.length, 46);
  for (const [id, trigger, substep, group, type] of APPENDIX_A) {
    const card = cardsFor({ ...single, ...trigger }).find((c) => c.ruleId === id);
    assert.ok(card, `${id}: no card`);
    assert.equal(card.substep, substep, id);
    assert.equal(card.group, group, id);
    assert.equal(RULE_TYPES.get(id), type, id);
    // the same scenario with the trigger absent gives no card, except the always-on rows
    if (!["photo_id", "ssn", "other"].includes(id)) {
      assert.equal(cardsFor(single).some((c) => c.ruleId === id), false, `${id} shows with nothing answered`);
    }
  }
});

test("Appendix A: not_sure gives Maybe needed for the plain yes/not-sure rows, no hides them", () => {
  const plain = APPENDIX_A.filter(([id, t]) => Object.values(t).every((v) => v === "yes") && Object.keys(t).length === 1 && !["prior_return"].includes(id));
  assert.ok(plain.length > 30);
  for (const [id, trigger] of plain) {
    const [field] = Object.keys(trigger);
    assert.equal(cardsFor({ ...single, [field]: "not_sure" }).find((c) => c.ruleId === id)?.group, "maybe", id);
    assert.equal(cardsFor({ ...single, [field]: "no" }).some((c) => c.ruleId === id), false, id);
  }
});

test("every answer-driven card has a why line and the question it links to", () => {
  for (const [id, trigger] of APPENDIX_A) {
    if (["photo_id", "ssn", "other"].includes(id)) continue;
    const card = cardsFor({ ...single, ...trigger }).find((c) => c.ruleId === id);
    assert.ok(card.why?.en && card.why?.zh, `${id}: why`);
    assert.match(card.ask, /^[a-z_0-9]+$/, `${id}: ask`);
    assert.ok(findQuestion(2, card.ask), `${id}: ask ${card.ask} is a question`);
  }
  const ssnHh = find({ ...single, has_household_members: "yes", hh: [{ member_id: ID_A }] }, `ssn.hh.${ID_A}`);
  assert.equal(ssnHh.ask, "hh");
  assert.ok(ssnHh.why.en);
});

// Part 4d: card text in three languages (spec 2026-10-05 §2, §4)

const FIELDS = ["label", "hint", "why", "ownerLine"];
const ALL_YES = (() => {
  const a = {
    marital_status: "married", tp_first_name: "Ana", sp_first_name: "Mei", has_household_members: "yes",
    hh: [{ member_id: ID_A, first_name: "Kai", ippin: "yes", months_lived: "3" }, { member_id: ID_B, ippin: "not_sure" }],
    inc_wages_job_count: "2", inc_other_desc: "Jury duty pay", evt_other_desc: "Bought a car",
    evt_brought_prior_return: "yes", refund_method: "split", payment_method: "bank_account",
    ippin: ["me", "spouse"], on_visa: ["me", "spouse"], digital_assets: ["me"],
  };
  for (const [, trigger] of APPENDIX_A) for (const [key, value] of Object.entries(trigger)) if (value === "yes") a[key] = "yes";
  return a;
})();
const SAMPLE_SETS = [
  ...Array.from({ length: 21 }, (_, seed) => [false, true].map((married) => makeSampleAnswers({ version: 2, seed, married }))).flat(),
  ALL_YES,
];

test("every card field reads in English, Simplified and Traditional", () => {
  setHantMap(MAP);
  try {
    let seen = 0;
    for (const answers of SAMPLE_SETS) {
      for (const card of cardsFor(answers)) {
        for (const field of FIELDS) {
          if (card[field] == null) continue;
          assert.equal(typeof card[field].en, "string", `${card.slotId} ${field}: en is a plain string`);
          for (const lang of LANGS) assert.ok(sourceText(card[field], lang).trim(), `${card.slotId} ${field} ${lang}`);
          seen++;
        }
      }
    }
    assert.ok(seen > 500, `checked ${seen} fields`);
  } finally {
    setHantMap(null);
  }
});

test("every non-literal Chinese source on a card is in the Traditional map", () => {
  const missing = new Set();
  for (const answers of SAMPLE_SETS) {
    for (const card of cardsFor(answers)) {
      for (const field of FIELDS) {
        const pair = card[field];
        if (pair == null || pair.literal) continue;
        const source = typeof pair.zh === "string" ? pair.zh : pair.zh?.template;
        if (!Object.hasOwn(MAP, source)) missing.add(`${card.slotId} ${field}: ${source}`);
      }
    }
  }
  assert.deepEqual([...missing], []);
});

test("a name on the owner line is literal and never converted", () => {
  setHantMap(MAP);
  try {
    const answers = { ...single, tp_first_name: "Ana", tp_last_name: "发达" };
    const line = find(answers, "photo_id.tp").ownerLine;
    assert.deepEqual(line, { en: "Ana 发达", zh: "Ana 发达", literal: true });
    assert.equal(sourceText(line, "zh-Hant"), "Ana 发达");
    assert.equal(sourceText(find(single, "photo_id.tp").ownerLine, "zh-Hant"), "本人");
  } finally {
    setHantMap(null);
  }
});

test("the W-2 hint: English as today, Simplified and Traditional from the template", () => {
  const hint = find({ ...single, inc_wages: "yes", inc_wages_job_count: "2" }, "w2.household").hint;
  assert.equal(sourceText(hint, "en"), "You said 2 jobs. Upload 2 W-2s.");
  assert.equal(sourceText(hint, "zh-Hans"), "您说有 2 份工作，请上传 2 张 W-2。");
  setHantMap(MAP);
  try {
    const converted = MAP[CARD_TEMPLATES.w2_hint];
    assert.ok(converted, "the template is in the map");
    assert.equal(sourceText(hint, "zh-Hant"), converted.replaceAll("{n}", "2"));
    assert.match(sourceText(hint, "zh-Hant"), /請上傳 2 張 W-2/);
  } finally {
    setHantMap(null);
  }
});

test("the client's words in a why line are filled in after conversion", () => {
  setHantMap(MAP);
  try {
    const why = find({ ...single, inc_other: "yes", inc_other_desc: "发票" }, "other_income.household").why;
    assert.equal(sourceText(why, "en"), "You wrote: 发票");
    assert.equal(sourceText(why, "zh-Hant"), `${MAP[CARD_TEMPLATES.wrote].replace("{written}", "")}发票`);
  } finally {
    setHantMap(null);
  }
});

test("CARD_WHY holds every said() line, frozen, and the rules use its entries", () => {
  assert.ok(Object.isFrozen(CARD_WHY));
  assert.ok(Object.isFrozen(CARD_TEMPLATES));
  const said = Object.values(CARD_WHY).filter((p) => p.en.startsWith("You said "));
  assert.equal(said.length, 43);
  for (const pair of said) assert.ok(pair.zh.startsWith("您说"), pair.en);
  const whys = new Set(Object.values(CARD_WHY));
  for (const rule of CARD_RULES) if (rule.why && rule.why.en.startsWith("You said ") && !["w2", "custody"].includes(rule.id)) assert.ok(whys.has(rule.why), rule.id);
  for (const answers of SAMPLE_SETS) {
    for (const card of cardsFor(answers)) {
      if (card.why && !card.why.zh?.template && card.ruleId !== "w2" && card.ruleId !== "custody") assert.ok(whys.has(card.why), `${card.slotId} why comes from CARD_WHY`);
    }
  }
});
