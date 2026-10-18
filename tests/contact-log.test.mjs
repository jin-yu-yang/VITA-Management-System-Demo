process.env.TZ = "America/Los_Angeles"; // before any Date use: the log must not depend on the viewer's zone
import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTACT_DIRECTIONS, CONTACT_WITH, CONTACT_METHODS, CONTACT_PURPOSES, VOICE_OUTCOMES, WRITTEN_OUTCOMES,
  outcomesFor, staffShortName, contactTime, nyLocalInput, nyLocalToIso, nowInput,
  contactSummary, contactSummaries, contactEntryFromForm,
} from "../src/contact-log.mjs";

const ANSWERS = { tp_first_name: "Mei", tp_last_name: "Wang", sp_first_name: "Lin", sp_last_name: "Wang" };
const BASE = {
  contactedAt: "2026-10-17T19:45:00Z", loggedByName: "Hailey Zhang", direction: "outgoing", withWhom: "client",
  otherName: null, method: "phone", purpose: "go_over_return", outcome: "reached", note: null,
};
const line = (over, answers = ANSWERS) => contactSummary({ ...BASE, ...over }, { answers });

test("the agreed outgoing line", () => {
  assert.equal(
    line({ note: "asked about the 1099-R; she'll bring it Monday." }),
    "10/17/2026 3:45 PM — Hailey Z. → client (Mei Wang), phone — Go over tax return — Reached. Note: asked about the 1099-R; she'll bring it Monday.",
  );
});

test("an incoming line turns the arrow and drops the outcome", () => {
  assert.equal(line({ direction: "incoming", purpose: "ask_question" }),
    "10/17/2026 3:45 PM — client (Mei Wang) → Hailey Z., phone — Ask a question.");
});

test("in person drops the outcome", () => {
  assert.equal(line({ loggedByName: "Alex", method: "in_person", purpose: "schedule_appointment" }),
    "10/17/2026 3:45 PM — Alex → client (Mei Wang), in person — Schedule an appointment.");
});

test("a text to the spouse", () => {
  const t = { loggedByName: "Alex", withWhom: "spouse", method: "text", purpose: "request_documents" };
  assert.ok(line({ ...t, outcome: "sent" }).endsWith("— Alex → spouse (Lin Wang), text — Request documents — Sent."));
  assert.ok(line({ ...t, outcome: "replied" }).endsWith("— Client replied."));
  assert.ok(line({ ...t, outcome: "failed" }).endsWith("— Failed to deliver."));
});

test("another person", () => {
  assert.ok(line({ withWhom: "other", otherName: "Sam Lee", outcome: "no_answer" })
    .endsWith("→ Sam Lee, phone — Go over tax return — No answer."));
});

test("no names in the intake", () => {
  assert.ok(line({}, {}).includes("→ client, phone"));
  assert.ok(line({ withWhom: "spouse" }, {}).includes("→ spouse, phone"));
  assert.ok(line({ withWhom: "spouse" }, { sp_first_name: "Lin" }).includes("→ spouse (Lin), phone"));
});

test("an unknown logger", () => {
  assert.ok(line({ loggedByName: null }).includes("— Unknown person → client"));
});

test("staffShortName", () => {
  assert.equal(staffShortName("Hailey Zhang"), "Hailey Z.");
  assert.equal(staffShortName("Mary Ann Lee"), "Mary L.");
  assert.equal(staffShortName("Alex"), "Alex");
  assert.equal(staffShortName(null), "Unknown person");
  assert.equal(staffShortName("  "), "Unknown person");
});

test("note punctuation and line breaks", () => {
  assert.ok(line({ note: "one\ntwo\r\nthree" }).endsWith("Reached. Note: one two three"));
  assert.ok(line({ note: "no period" }).endsWith("Reached. Note: no period"));
  assert.ok(!line({ note: "   " }).includes("Note:"));
  assert.ok(line({ note: "<b>\"Lee\" & co</b>" }).endsWith("Note: <b>\"Lee\" & co</b>"));
});

test("contactSummaries is oldest first", () => {
  const a = { ...BASE, contactedAt: "2026-10-18T15:00:00Z" };
  const b = { ...BASE, contactedAt: "2026-10-16T15:00:00Z" };
  const out = contactSummaries([a, b], { answers: ANSWERS }).split("\n");
  assert.equal(out.length, 2);
  assert.ok(out[0].startsWith("10/16/2026 11:00 AM"));
  assert.ok(out[1].startsWith("10/18/2026 11:00 AM"));
  assert.equal(contactSummaries([]), "");
});

test("New York time whatever the zone", () => {
  assert.equal(contactTime("2026-07-01T16:05:00Z"), "7/1/2026 12:05 PM");
  assert.equal(contactTime("2026-12-01T17:05:00Z"), "12/1/2026 12:05 PM");
  assert.equal(contactTime("2026-10-17T04:00:00Z"), "10/17/2026 12:00 AM");
});

test("the time field round-trips", () => {
  assert.equal(nyLocalToIso("2026-10-17T15:45"), "2026-10-17T19:45:00.000Z");
  assert.equal(nyLocalInput("2026-10-17T19:45:00Z"), "2026-10-17T15:45");
  assert.equal(nyLocalToIso("2026-01-15T10:00"), "2026-01-15T15:00:00.000Z");
  assert.equal(nyLocalInput("2026-01-15T15:00:00Z"), "2026-01-15T10:00");
  assert.equal(nyLocalInput("2026-10-17T04:00:00Z"), "2026-10-17T00:00");
  assert.match(nowInput(Date.parse("2026-10-17T19:45:30Z")), /^2026-10-17T15:45$/);
});

test("daylight-saving days", () => {
  assert.equal(nyLocalToIso("2026-11-01T01:30"), "2026-11-01T05:30:00.000Z"); // repeated hour: first
  assert.equal(nyLocalToIso("2026-03-08T02:30"), "2026-03-08T07:30:00.000Z"); // skipped hour: reads 03:30 EDT
  assert.ok(nyLocalToIso("2026-11-01T01:30").endsWith("Z"));
});

test("outcomesFor", () => {
  const keys = (m, d = "outgoing") => outcomesFor(m, d).map(([k]) => k);
  assert.deepEqual(keys("phone"), ["reached", "no_answer", "left_voicemail", "wrong_number"]);
  assert.deepEqual(keys("video"), keys("phone"));
  assert.deepEqual(keys("text"), ["sent", "replied", "failed"]);
  assert.deepEqual(keys("email"), keys("text"));
  assert.deepEqual(keys("in_person"), []);
  assert.deepEqual(keys("phone", "incoming"), []);
});

test("the labels", () => {
  assert.deepEqual(CONTACT_DIRECTIONS, [["outgoing", "We contacted"], ["incoming", "The client contacted us"]]);
  assert.deepEqual(CONTACT_WITH.map(([, l]) => l), ["Client", "Spouse", "Other"]);
  assert.deepEqual(CONTACT_METHODS.map(([, l]) => l), ["Phone", "Text", "Email", "In person", "Video"]);
  assert.deepEqual(CONTACT_PURPOSES.map(([, l]) => l),
    ["Go over tax return", "Ask a question", "Request documents", "Schedule an appointment", "Other"]);
  assert.deepEqual(VOICE_OUTCOMES.map(([, l]) => l), ["Reached", "No answer", "Left voicemail", "Wrong or invalid number"]);
  assert.deepEqual(WRITTEN_OUTCOMES.map(([, l]) => l), ["Sent", "Client replied", "Failed to deliver"]);
  assert.ok(Object.isFrozen(CONTACT_METHODS));
});

test("the form builder", () => {
  const form = { direction: "outgoing", withWhom: "client", otherName: "", method: "text", purpose: "ask_question",
    outcomeVoice: "no_answer", outcomeWritten: "sent", note: " hi ", contactedAt: "2026-10-17T15:45" };
  const e = contactEntryFromForm(form);
  assert.equal(e.outcome, "sent");
  assert.equal(e.note, "hi");
  assert.equal(e.contactedAt, "2026-10-17T19:45:00.000Z");
  assert.equal(contactEntryFromForm({ ...form, method: "phone" }).outcome, "no_answer");
  assert.equal(contactEntryFromForm({ ...form, method: "in_person" }).outcome, "reached");
  assert.equal(contactEntryFromForm({ ...form, direction: "incoming", method: "phone" }).outcome, "reached");
  assert.equal(contactEntryFromForm({ ...form, otherName: "x" }).otherName, null);
  assert.equal(contactEntryFromForm({ ...form, withWhom: "other", otherName: " Sam " }).otherName, "Sam");
  assert.equal(contactEntryFromForm({ ...form, note: "  " }).note, null);
  assert.deepEqual(Object.keys(e).sort(),
    ["contactedAt", "direction", "method", "note", "otherName", "outcome", "purpose", "withWhom"]);
});
