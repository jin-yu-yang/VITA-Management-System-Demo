import test from "node:test";
import assert from "node:assert/strict";
import {
  CATALOGUE, stepsFor, findQuestion, wording, checkValue,
} from "../src/intake-catalogue.mjs";
import { esc } from "../src/ui.mjs";
import {
  renderQuestion, valuesFromControls, mergeIntoDraft, drivesVisibility, visibleIds,
  needsRedraw, noteState, invalidAnswers, sendable, withholdInvalid, withheldFields,
  sendableDiffers, keepLocalOnly, countText, stepStatus, renderRichText, formatAnswer,
} from "../src/intake-form.mjs";

// Part 4b, Task 2 (docs/superpowers/specs/2026-09-30-intake-screens-design.md §2).

const q = (id) => findQuestion(2, id);
const HH = q("hh");
const sub = (id) => HH.fields.find((f) => f.id === id);
const client = (question, value, options = {}) => renderQuestion(question, value, { scope: "client", ...options });
const ALL = stepsFor(2).flatMap((s) => s.sections.flatMap((x) => x.questions));
const label = (option, variant = "general") => option.label[variant].en;
const yesnoLabel = (value) => label(CATALOGUE.fixedOptions.yesno.options.find((o) => o.value === value));
const whoLabel = (value) => label(CATALOGUE.fixedOptions.who.options.find((o) => o.value === value));

// Undo esc() for attribute values and text read back from the HTML.
const unescape = (text) =>
  text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}(?:="([^"]*)")?(?=[\\s>]|$)`).exec(tag);
  return m ? unescape(m[1] ?? "") : undefined;
};

// Builds control descriptors from rendered HTML, as describeControl would from
// the DOM: data-* attributes, the type, the value and the checked state.
function descriptorsFrom(html) {
  const out = [];
  const re = /<input\b([^>]*)>|<(select|textarea)\b([^>]*)>([\s\S]*?)<\/\2>/g;
  for (const m of html.matchAll(re)) {
    const tag = m[2] ?? "input";
    const attrs = m[1] ?? m[3];
    const body = m[4] ?? "";
    if (attr(attrs, "data-control") === undefined) continue;
    const d = { q: attr(attrs, "data-q") };
    if (attr(attrs, "data-member") !== undefined) d.member = attr(attrs, "data-member");
    if (attr(attrs, "data-sub") !== undefined) d.sub = attr(attrs, "data-sub");
    if (attr(attrs, "data-date-part") !== undefined) d.part = attr(attrs, "data-date-part");
    if (tag === "input") {
      d.type = attr(attrs, "type") ?? "text";
      d.value = attr(attrs, "value") ?? "";
      d.checked = attr(attrs, "checked") !== undefined;
    } else if (tag === "select") {
      d.type = "select-one";
      const selected = [...body.matchAll(/<option\b([^>]*)>/g)].find((o) => attr(o[1], "selected") !== undefined);
      d.value = selected ? attr(selected[1], "value") : "";
      d.checked = false;
    } else {
      d.type = "textarea";
      d.value = unescape(body);
      d.checked = false;
    }
    out.push(d);
  }
  return out;
}
const roundTrip = (question, value, options = {}) =>
  valuesFromControls(descriptorsFrom(client(question, value, options)))[question.id];

const text = (qid, value) => ({ q: qid, type: "text", value, checked: false });
const box = (qid, choice, checked, type = "checkbox") => ({ q: qid, type, value: choice, checked });

// Step 2 (index 1) with every visible required question answered.
const STEP2 = {
  tp_first_name: "Mei", tp_last_name: "Lin", tp_dob: "1961-04-12", tp_job_title: "Cook",
  tp_phone: "2155550100", addr_street: "10 Race St", addr_city: "Philadelphia",
  addr_state: "PA", addr_zip: "19107",
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

test("every type renders its data-q, its label or legend, its wording and every option", () => {
  const picks = [
    "tp_first_name", "gcf_tp_signature", "additional_notes", "email", "tp_phone", "addr_zip",
    "spouse_death_year", "inc_wages_job_count", "tp_dob", "marital_status", "inc_wages",
    "married_last_day", "best_contact_time", "us_citizen", "hh",
  ];
  const types = new Set();
  for (const id of picks) {
    const question = q(id);
    types.add(question.type);
    const html = client(question, null, { answers: { marital_status: "married" } });
    assert.ok(html.includes(`data-q="${id}"`), id);
    assert.ok(html.includes(`<label for="field-client-${id}"`) || html.includes("<legend"), id);
    assert.ok(html.includes(esc(wording(question))), id);
    if (["choice", "yesno", "multi", "who"].includes(question.type)) {
      const options =
        question.type === "who" ? CATALOGUE.fixedOptions.who.options
          : question.type === "yesno" ? question.options.map((o) => CATALOGUE.fixedOptions.yesno.options.find((y) => y.value === o.value))
            : question.options;
      for (const option of options) assert.ok(html.includes(`>${esc(label(option))}<`), `${id} ${option.value}`);
    }
  }
  for (const type of ["text", "signature", "longtext", "email", "phone", "zip", "year", "number", "date", "choice", "yesno", "multi", "who", "group"])
    assert.ok(types.has(type), type);
  // A choice with more than six options (the member's relationship) is a <select>.
  const relationship = sub("relationship");
  assert.ok(relationship.options.length > 6);
  const select = renderQuestion(relationship, null, { scope: "client" });
  assert.match(select, /<select\b/);
  assert.ok(select.includes(`<label for="field-client-relationship"`));
  for (const option of relationship.options) assert.ok(select.includes(`>${label(option)}<`), option.value);
  // Six or fewer: radio cards, not a select.
  assert.doesNotMatch(client(q("marital_status"), null), /<select\b/);
  assert.match(client(q("marital_status"), null), /type="radio"/);
  // yesno: "I'm not sure" only when the question lists it.
  assert.ok(client(q("inc_wages"), null).includes("value=\"not_sure\""));
  assert.ok(!client(q("married_last_day"), null).includes("value=\"not_sure\""));
  assert.ok(client(q("inc_wages"), null).includes(esc(yesnoLabel("not_sure"))));
});

test("who shows My spouse only while married", () => {
  const who = q("us_citizen");
  assert.ok(!client(who, null).includes(whoLabel("spouse")));
  assert.ok(!client(who, null, { answers: { marital_status: "never_married" } }).includes(whoLabel("spouse")));
  assert.ok(client(who, null, { answers: { marital_status: "married" } }).includes(whoLabel("spouse")));
  assert.ok(client(who, null).includes(whoLabel("me")) && client(who, null).includes(whoLabel("none")));
});

test("a ranged number inside a household card: its range as text, no min or max", () => {
  const html = client(HH, [{ first_name: "Ming" }], { answers: { has_household_members: "yes" } });
  const months = sub("months_lived");
  const tag = /<input\b[^>]*id="field-client-hh-0-months_lived"[^>]*>/.exec(html)?.[0];
  assert.ok(tag, "months_lived input");
  assert.match(tag, /inputmode="numeric"/);
  assert.match(tag, /data-q="hh"/);
  assert.match(tag, /data-member="0"/);
  assert.match(tag, /data-sub="months_lived"/);
  assert.ok(html.includes(`${months.min} to ${months.max}`));
  assert.ok(html.includes("0 to 12"));
  assert.doesNotMatch(html, /\s(min|max)=/);
  assert.ok(html.includes('data-action="add-member"'));
  assert.ok(html.includes('data-action="remove-member"') && html.includes('data-member="0"'));
  // A sub-question's wrapper never carries its own data-q.
  assert.deepEqual([...new Set([...html.matchAll(/data-q="([^"]*)"/g)].map((m) => m[1]))], ["hh"]);
});

test("longtext: 5000 limit and a count container; countText near the limit", () => {
  const html = client(q("additional_notes"), "hello");
  assert.match(html, /<textarea\b[^>]*maxlength="5000"/);
  assert.match(html, /<p id="field-client-additional_notes-count" class="q-count">/);
  assert.doesNotMatch(/<p id="field-client-additional_notes-count"[^>]*>/.exec(html)[0], /aria-live/);
  assert.match(/<textarea\b[^>]*>/.exec(html)[0], /aria-describedby="[^"]*field-client-additional_notes-count/);
  assert.equal(countText("a".repeat(4500)), "");
  assert.equal(countText("a".repeat(4612)), "4,612 of 5,000 characters");
  assert.ok(client(q("additional_notes"), "a".repeat(4612)).includes("4,612 of 5,000 characters"));
});

test("no control is required, min, max or pattern; every radio and checkbox id is unique", () => {
  const answers = { marital_status: "married", has_household_members: "yes" };
  const members = [{ first_name: "Ming" }, { first_name: "Bo" }];
  const page = ALL.map((question) => client(question, question.id === "hh" ? members : null, { answers })).join("");
  const controls = [...page.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(controls.length > 100);
  for (const tag of controls) {
    assert.doesNotMatch(tag, /\s(required|min|max|pattern)(?=[\s=>])/, tag);
    assert.match(tag, /\sdata-control(?=[\s=>])/, tag);
  }
  const ids = [...page.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "every id on the page is unique");
  const optionIds = controls.filter((tag) => /type="(radio|checkbox)"/.test(tag)).map((tag) => attr(tag, "id"));
  assert.ok(optionIds.every(Boolean));
  assert.equal(new Set(optionIds).size, optionIds.length);
  assert.ok(optionIds.includes("field-client-inc_wages-yes"));
  assert.ok(optionIds.includes("field-client-hh-1-us_citizen-no"));
  // Radios of one question share a name; members' names differ.
  const radioNames = (html, id) => new Set([...html.matchAll(/<input\b[^>]*type="radio"[^>]*>/g)].filter((m) => m[0].includes(`id="${id}`)).map((m) => attr(m[0], "name")));
  assert.equal(radioNames(page, "field-client-inc_wages-").size, 1);
  assert.notDeepEqual(radioNames(page, "field-client-hh-0-us_citizen-"), radioNames(page, "field-client-hh-1-us_citizen-"));
  // A date's three boxes.
  const dob = client(q("tp_dob"), "1961-04-12");
  for (const part of ["month", "day", "year"]) assert.ok(dob.includes(`data-date-part="${part}"`), part);
});

test("renderRichText: escape, bold, lists and paragraphs", () => {
  const html = renderRichText("**W-2** & <b>\n- one\n- two");
  assert.ok(html.includes("<strong>W-2</strong> &amp; &lt;b&gt;"));
  const list = /<ul>([\s\S]*?)<\/ul>/.exec(html);
  assert.ok(list);
  assert.equal([...list[1].matchAll(/<li>/g)].length, 2);
  assert.ok(list[1].includes("<li>one</li>") && list[1].includes("<li>two</li>"));
  const paragraphs = renderRichText("First.\n\nSecond.");
  assert.equal([...paragraphs.matchAll(/<p>/g)].length, 2);
  // Tips render through it, under their question.
  assert.ok(client(q("inc_wages"), null).includes("<strong>W-2</strong>"));
});

test("tips: a tip with a condition renders only while it holds", () => {
  const refund = q("refund_method");
  const tip = refund.tips.general[0].en;
  assert.ok(client(refund, "direct_deposit", { answers: { refund_method: "direct_deposit" } }).includes(tip));
  assert.ok(!client(refund, "check", { answers: { refund_method: "check" } }).includes(tip));
  assert.ok(!client(refund, null).includes(tip));
});

test("drivesVisibility: conditions of questions, tips and who's spouse", () => {
  assert.equal(drivesVisibility("marital_status"), true);
  assert.equal(drivesVisibility("gcf_sp_signature"), true);
  assert.equal(drivesVisibility("refund_method"), true);
  assert.equal(drivesVisibility("gcf_tp_signature"), false);
  assert.equal(drivesVisibility("tp_first_name"), false);
  const textLike = new Set(["text", "longtext", "signature", "email", "phone", "zip", "year", "number", "date"]);
  const drivers = [...ALL, ...HH.fields].filter((x) => textLike.has(x.type) && drivesVisibility(x.id)).map((x) => x.id);
  assert.deepEqual(drivers, ["gcf_sp_signature"]);
});

test.todo("needsRedraw compares the rendered ids with the ids the draft makes visible — rewritten in Task 5");

test("every question has its note container, referenced by its controls", () => {
  const answers = { marital_status: "married", has_household_members: "yes" };
  for (const question of ALL) {
    for (const value of [null, question.type === "group" ? [{ first_name: "Ming" }] : null]) {
      for (const showMissing of [false, true]) {
        const html = client(question, value, { answers, showMissing });
        const note = new RegExp(`<p id="field-client-${question.id}-note" class="q-note[^"]*" aria-live="polite">`);
        assert.match(html, note, question.id);
        if (question.type === "group") continue;
        const controls = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => m[0]);
        assert.ok(controls.length > 0, question.id);
        for (const tag of controls) assert.ok(attr(tag, "aria-describedby").split(" ").includes(`field-client-${question.id}-note`), question.id);
      }
    }
  }
  const hh = client(HH, [{ first_name: "Ming" }], { answers });
  assert.match(hh, /<p id="field-client-hh-0-first_name-note" class="q-note[^"]*" aria-live="polite">/);
  assert.match(/<input\b[^>]*id="field-client-hh-0-first_name"[^>]*>/.exec(hh)[0], /aria-describedby="field-client-hh-0-first_name-note"/);
});

test("noteState: invalid outranks missing; only when shown", () => {
  const email = q("email");
  const first = q("tp_first_name");
  assert.deepEqual(noteState(first, null, { showMissing: true, showInvalid: false }), { text: "Needs an answer", className: "is-missing" });
  assert.deepEqual(noteState(first, "  ", { showMissing: true, showInvalid: true }), { text: "Needs an answer", className: "is-missing" });
  assert.deepEqual(noteState(email, "a@", { showMissing: true, showInvalid: true }), { text: "Enter a valid email address.", className: "is-invalid" });
  assert.deepEqual(noteState(email, "a@", { showMissing: true, showInvalid: false }), { text: "", className: "" });
  assert.deepEqual(noteState(first, "Mei", { showMissing: true, showInvalid: true }), { text: "", className: "" });
  assert.deepEqual(noteState(email, null, { showMissing: true, showInvalid: true }), { text: "", className: "" });
  // Checked through sendable: a padded ZIP is valid.
  assert.deepEqual(noteState(q("addr_zip"), " 12345 ", { showMissing: true, showInvalid: true }), { text: "", className: "" });
  // The rendered note carries the same text and class.
  assert.ok(client(first, null, { showMissing: true }).includes('<p id="field-client-tp_first_name-note" class="q-note is-missing" aria-live="polite">Needs an answer</p>'));
  assert.ok(client(email, "a@", { revealed: new Set(["email"]) }).includes('<p id="field-client-email-note" class="q-note is-invalid" aria-live="polite">Enter a valid email address.</p>'));
  assert.ok(client(email, "a@", { showMissing: true }).includes('<p id="field-client-email-note" class="q-note" aria-live="polite"></p>'));
});

test.todo("invalidAnswers: visible questions, catalogue order, through sendable — rewritten in Task 5");

test.todo("household errors belong to the member's sub-field — rewritten in Task 5");

test.todo("stepStatus: missing and invalid are computed from the draft alone — rewritten in Task 5");

test.todo("stepStatus: done, needs and none — rewritten in Task 5");

test("email with an inner space is invalid in the browser (spec §2.5)", () => {
  assert.equal(checkValue(q("email"), "mei lin@example.com"), "Enter a valid email address.");
});

test("the senior variant renders the senior wording", () => {
  const question = q("tp_first_name");
  assert.notEqual(question.wording.senior.en, question.wording.general.en);
  const senior = client(question, null, { variant: "senior" });
  assert.ok(senior.includes(question.wording.senior.en));
  assert.ok(!senior.includes(question.wording.general.en));
  assert.ok(client(question, null).includes(question.wording.general.en));
});

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

test("No one clears the others, and another option clears No one", () => {
  const both = [box("us_citizen", "me", true), box("us_citizen", "spouse", false), box("us_citizen", "none", true)];
  assert.deepEqual(valuesFromControls(both, { changed: { q: "us_citizen", value: "none" } }), { us_citizen: ["none"] });
  assert.deepEqual(valuesFromControls(both, { changed: { q: "us_citizen", value: "me" } }), { us_citizen: ["me"] });
  assert.deepEqual(valuesFromControls(both), { us_citizen: ["me", "none"] });
  // A change to another question leaves this one as checked.
  assert.deepEqual(valuesFromControls(both, { changed: { q: "disabled", value: "me" } }), { us_citizen: ["me", "none"] });
});

test("round trip: render with a value, read the controls back", () => {
  assert.equal(roundTrip(q("tp_dob"), "1961-04-12"), "1961-04-12");
  assert.deepEqual(roundTrip(q("us_citizen"), ["me", "spouse"], { answers: { marital_status: "married" } }), ["me", "spouse"]);
  assert.deepEqual(roundTrip(q("best_contact_time"), ["weekday_evening", "weekend"]), ["weekday_evening", "weekend"]);
  assert.equal(roundTrip(q("inc_wages"), "not_sure"), "not_sure");
  assert.equal(roundTrip(q("marital_status"), "married"), "married");
  assert.equal(roundTrip(q("additional_notes"), "Line one\n<Line & two>"), "Line one\n<Line & two>");
  assert.equal(roundTrip(q("tp_first_name"), `O'Brien "Mei"`), `O'Brien "Mei"`);
  const members = [
    {
      first_name: "Xiao Ming", last_name: "Wang", dob: "2015-03-14", relationship: "son_daughter",
      months_lived: "12", married: "single", us_citizen: "yes", resident_na: "yes",
      fulltime_student: "no", disabled: "no", ippin: "not_sure",
    },
    { first_name: "Bo" },
  ];
  assert.deepEqual(roundTrip(HH, members, { answers: { has_household_members: "yes" } }), members);
  // Empty values.
  assert.equal(roundTrip(q("tp_first_name"), null), null);
  assert.equal(roundTrip(q("tp_first_name"), ""), null);
  assert.equal(roundTrip(q("inc_wages"), null), null);
  assert.equal(roundTrip(q("tp_dob"), null), null);
});

test("reading keeps the box's text exactly", () => {
  assert.deepEqual(valuesFromControls([text("tp_first_name", "hello ")]), { tp_first_name: "hello " });
  assert.deepEqual(valuesFromControls([text("addr_zip", " 12345 ")]), { addr_zip: " 12345 " });
  assert.deepEqual(valuesFromControls([text("tp_first_name", "   ")]), { tp_first_name: null });
  assert.deepEqual(valuesFromControls([text("tp_first_name", "")]), { tp_first_name: null });
});

test("dates: all empty is null, a partial date is kept, an impossible date is read", () => {
  const date = (month, day, year) => [
    { q: "tp_dob", part: "month", type: "text", value: month, checked: false },
    { q: "tp_dob", part: "day", type: "text", value: day, checked: false },
    { q: "tp_dob", part: "year", type: "text", value: year, checked: false },
  ];
  assert.deepEqual(valuesFromControls(date("", "", "")), { tp_dob: null });
  assert.deepEqual(valuesFromControls(date("04", "12", "")), { tp_dob: "-04-12" });
  assert.deepEqual(valuesFromControls(date("02", "30", "2025")), { tp_dob: "2025-02-30" });
  assert.deepEqual(valuesFromControls(date("", "12", "1961")), { tp_dob: "1961--12" });
  // A partial date goes back into its boxes after a redraw.
  const partial = client(q("tp_dob"), "-04-12");
  const boxes = Object.fromEntries(descriptorsFrom(partial).map((d) => [d.part, d.value]));
  assert.deepEqual(boxes, { month: "04", day: "12", year: "" });
  assert.equal(roundTrip(q("tp_dob"), "-04-12"), "-04-12");
  assert.equal(roundTrip(q("tp_dob"), "1961--12"), "1961--12");
  // Invalid, so withheld.
  assert.equal(typeof checkValue(q("tp_dob"), "-04-12"), "string");
  assert.deepEqual(withholdInvalid({ tp_dob: "-04-12", tp_first_name: "Mei" }, 2), { tp_first_name: "Mei" });
});

test("an empty household card is kept by readField and dropped otherwise", () => {
  const card = (member, sub, value) => ({ q: "hh", member, sub, type: "text", value, checked: false });
  const descriptors = [
    card("0", "first_name", "Ming"), card("0", "last_name", ""),
    card("1", "first_name", ""), card("1", "last_name", "  "),
    { q: "hh", member: "1", sub: "us_citizen", type: "radio", value: "yes", checked: false },
  ];
  assert.deepEqual(valuesFromControls(descriptors, { keepEmptyMembers: true }), { hh: [{ first_name: "Ming" }, {}] });
  assert.deepEqual(valuesFromControls(descriptors), { hh: [{ first_name: "Ming" }] });
  assert.deepEqual(sendable(HH, [{ first_name: "Ming" }, {}]), [{ first_name: "Ming" }]);
  assert.deepEqual(sendable(HH, [{ first_name: " Ming ", last_name: "  " }]), [{ first_name: "Ming" }]);
});

test("mergeIntoDraft keeps absent keys, sets null and never mutates", () => {
  const draft = Object.freeze({ tp_first_name: "Mei", email: "mei@example.com", hh: Object.freeze([{ member_id: "0123456789abcdef0123456789abcdef", first_name: "Ming" }]) });
  const next = mergeIntoDraft(draft, { email: null, hh: [{ member_id: "fedcba9876543210fedcba9876543210", first_name: "Bo" }] });
  assert.deepEqual(next, { tp_first_name: "Mei", email: null, hh: [{ member_id: "fedcba9876543210fedcba9876543210", first_name: "Bo" }] });
  assert.notEqual(next, draft);
  assert.equal(draft.email, "mei@example.com");
});

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

test("withholdInvalid removes only invalid fields, trimmed; version 1 unchanged", () => {
  const draft = { email: "a@", tp_first_name: "Mei", tp_middle_name: null, addr_zip: "12345" };
  const copy = structuredClone(draft);
  assert.deepEqual(withholdInvalid(draft, 2), { tp_first_name: "Mei", tp_middle_name: null, addr_zip: "12345" });
  assert.deepEqual(draft, copy);
  assert.deepEqual(withheldFields(draft, 2), ["email"]);
  assert.deepEqual(withholdInvalid({ addr_zip: " 19107 ", tp_first_name: "Mei " }, 2), { addr_zip: "19107", tp_first_name: "Mei" });
  const household = { has_household_members: "yes", hh: [{ member_id: "0123456789abcdef0123456789abcdef", first_name: "Bo", dob: "2025-02-30" }] };
  const sent = withholdInvalid(household, 2);
  assert.equal("hh" in sent, false);
  assert.equal(sent.has_household_members, "yes");
  assert.deepEqual(withheldFields(household, 2), ["hh"]);
  const v1 = { firstName: "Mei", email: "a@" };
  assert.equal(withholdInvalid(v1, 1), v1);
  assert.deepEqual(withheldFields(v1, 1), []);
});

test("sendableDiffers: only what a save would change", () => {
  const server = { tp_first_name: "Mei", email: "mei@example.com", addr_zip: "19107" };
  assert.equal(sendableDiffers({ ...server }, server, 2), false);
  assert.equal(sendableDiffers({ ...server, tp_first_name: "Mei " }, server, 2), false);
  assert.equal(sendableDiffers({ ...server, email: "a@" }, server, 2), false);
  assert.equal(sendableDiffers({ ...server, tp_first_name: "Ming" }, server, 2), true);
  assert.equal(sendableDiffers({ ...server, tp_middle_name: null, best_contact_time: [] }, server, 2), false);
  assert.equal(sendableDiffers({ ...server, email: null }, server, 2), true);
  assert.equal(sendableDiffers({ ...server, hh: [{ member_id: "0123456789abcdef0123456789abcdef", first_name: "Ming" }, {}] }, { ...server, hh: [{ member_id: "0123456789abcdef0123456789abcdef", first_name: "Ming" }] }, 2), false);
  assert.equal(sendableDiffers({ ...server, hh: [{ member_id: "fedcba9876543210fedcba9876543210", first_name: "Bo" }] }, { ...server, hh: [{ member_id: "0123456789abcdef0123456789abcdef", first_name: "Ming" }] }, 2), true);
  assert.equal(sendableDiffers({ ...server, best_contact_time: ["weekend"] }, { ...server, best_contact_time: ["weekend"] }, 2), false);
});

test("keepLocalOnly keeps withheld values and space-only differences", () => {
  const previous = { tp_first_name: "Mei", email: "a@", addr_zip: " 19107 ", tp_last_name: "Lin", hh: [{ member_id: "0123456789abcdef0123456789abcdef", first_name: "Ming" }, {}] };
  const server = { tp_first_name: "Ming", addr_zip: "19107", tp_last_name: "Chen", hh: [{ member_id: "0123456789abcdef0123456789abcdef", first_name: "Ming" }], tp_dob: "1961-04-12" };
  assert.deepEqual(keepLocalOnly(previous, server, 2), {
    tp_first_name: "Ming", email: "a@", addr_zip: " 19107 ", tp_last_name: "Chen",
    hh: [{ member_id: "0123456789abcdef0123456789abcdef", first_name: "Ming" }, {}], tp_dob: "1961-04-12",
  });
});

// ---------------------------------------------------------------------------
// Read-only text
// ---------------------------------------------------------------------------

test("formatAnswer", () => {
  assert.equal(formatAnswer(q("tp_dob"), "1961-04-12"), "Apr 12, 1961");
  assert.equal(formatAnswer(q("tp_phone"), "2155550199"), "(215) 555-0199");
  assert.equal(formatAnswer(q("us_citizen"), ["me", "spouse"]), "Me, My spouse");
  assert.equal(formatAnswer(q("inc_wages"), "not_sure"), yesnoLabel("not_sure"));
  assert.equal(formatAnswer(q("service"), "drop_off"), "Drop-off");
  assert.equal(formatAnswer(q("tp_first_name"), "Mei"), "Mei");
  // The catalogue's relationship label is "Son / Daughter" (no "Son" option exists).
  const relationship = label(sub("relationship").options.find((o) => o.value === "son_daughter"));
  assert.equal(
    formatAnswer(HH, [{ first_name: "Xiao Ming", last_name: "Wang", relationship: "son_daughter", dob: "2015-03-14", months_lived: "12" }]),
    `Xiao Ming Wang · ${relationship} · born Mar 14, 2015 · 12 months`,
  );
  for (const empty of [null, undefined, "", "  ", []]) assert.equal(formatAnswer(q("tp_first_name"), empty), null);
  assert.equal(formatAnswer(q("us_citizen"), []), null);
  assert.equal(formatAnswer(HH, [{}]), null);
});
