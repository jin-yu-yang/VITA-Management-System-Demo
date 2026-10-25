import test from "node:test";
import assert from "node:assert/strict";
import {
  signDefault,
  needsAppointment,
  goOverPrefill,
  preparerQuestionnaire,
  reviewerQuestionnaire,
  exitFormFrom,
  changedAnswers,
  LOCAL_TYPES,
  SIGN_METHODS,
  todayIso,
} from "../src/questionnaires.mjs";

const invalid = (error) => error.code === "VALIDATION";

const PREPARER_FORM = {
  confirmedBy: "client",
  confirmedMethod: "phone",
  shadedPartsCompleted: "yes",
  stateForgivenessSet: "yes",
  readyForReviewOn: "2026-10-16",
};
const REVIEWER_FORM = {
  completedOn: "2026-10-17",
  paForgiveness: "eligible",
  wentOver: "yes",
  wentOverOn: "2026-10-16",
  wentOverHow: "phone",
  signMethod: "portal",
};

test("signDefault follows service", () => {
  assert.equal(signDefault("same_day"), "in_person");
  assert.equal(signDefault("online"), "portal");
  assert.equal(signDefault("drop_off"), "");
  assert.equal(signDefault(undefined), "");
});

test("vocabularies are frozen value/label pairs", () => {
  assert.ok(Object.isFrozen(SIGN_METHODS) && Object.isFrozen(SIGN_METHODS[0]));
  assert.deepEqual(LOCAL_TYPES.map(([v]) => v), ["NPT", "BIRT", "EET", "SIT", "PAIBWTR"]);
});

test("todayIso is the local date", () => {
  assert.match(todayIso(), /^\d{4}-\d{2}-\d{2}$/);
  const d = new Date(2026, 9, 5, 23, 59);
  assert.equal(todayIso(d.getTime()), "2026-10-05");
});

test("a preparer form builds exactly the database keys", () => {
  assert.deepEqual(preparerQuestionnaire(PREPARER_FORM), {
    confirmedBy: "client",
    confirmedMethod: "phone",
    shadedPartsCompleted: true,
    stateForgivenessSet: true,
    readyForReviewOn: "2026-10-16",
  });
  const q = preparerQuestionnaire({ ...PREPARER_FORM, confirmedBy: "other", confirmedByName: "  Pat Doe " });
  assert.equal(q.confirmedByName, "Pat Doe");
});

test("a stale name is dropped when the confirmer is not other", () => {
  const q = preparerQuestionnaire({ ...PREPARER_FORM, confirmedByName: "Pat Doe" });
  assert.ok(!("confirmedByName" in q));
});

test("blank other name is refused", () => {
  assert.throws(
    () => preparerQuestionnaire({ ...PREPARER_FORM, confirmedBy: "other", confirmedByName: "  " }),
    invalid,
  );
  assert.throws(
    () => preparerQuestionnaire({ ...PREPARER_FORM, confirmedBy: "other", confirmedByName: "x".repeat(121) }),
    invalid,
  );
});

test("unticked confirmations are refused", () => {
  const messages = new Set();
  for (const key of ["shadedPartsCompleted", "stateForgivenessSet"]) {
    const form = { ...PREPARER_FORM };
    delete form[key];
    assert.throws(() => preparerQuestionnaire(form), (e) => {
      messages.add(e.message);
      return invalid(e);
    });
  }
  assert.equal(messages.size, 2);
  assert.throws(() => preparerQuestionnaire({ ...PREPARER_FORM, readyForReviewOn: "2026-02-30" }), invalid);
  assert.throws(() => preparerQuestionnaire({ ...PREPARER_FORM, confirmedMethod: "" }), invalid);
});

test("a reviewer form builds the database keys, with an untouched Exit Form", () => {
  assert.deepEqual(reviewerQuestionnaire({ ...REVIEWER_FORM, remarks: "  Looks right. " }, "online"), {
    completedOn: "2026-10-17",
    paForgiveness: "eligible",
    wentOver: true,
    wentOverOn: "2026-10-16",
    wentOverHow: "phone",
    signMethod: "portal",
    exitForm: { federal: null, state: null, local: [] },
    remarks: "Looks right.",
  });
});

test("drops hidden went-over answers", () => {
  const q = reviewerQuestionnaire(
    { ...REVIEWER_FORM, wentOver: "no", wentOverOn: "2026-10-17", wentOverHow: "phone" },
    "online",
  );
  assert.equal(q.wentOver, false);
  assert.ok(!("wentOverOn" in q) && !("wentOverHow" in q));
});

test("went over yes needs its date; how is optional", () => {
  assert.throws(() => reviewerQuestionnaire({ ...REVIEWER_FORM, wentOverOn: "" }, "online"), invalid);
  const q = reviewerQuestionnaire({ ...REVIEWER_FORM, wentOverHow: "" }, "online");
  assert.ok(!("wentOverHow" in q));
  assert.throws(() => reviewerQuestionnaire({ ...REVIEWER_FORM, wentOver: "" }, "online"), invalid);
});

test("drops the appointment when not in person", () => {
  const q = reviewerQuestionnaire(
    { ...REVIEWER_FORM, signMethod: "portal", signAppointmentAt: "2026-10-20T10:00" },
    "drop_off",
  );
  assert.ok(!("signAppointmentAt" in q));
});

test("same-day drops the appointment", () => {
  const q = reviewerQuestionnaire(
    { ...REVIEWER_FORM, signMethod: "in_person", signAppointmentAt: "2026-10-20T10:00" },
    "same_day",
  );
  assert.equal(q.signMethod, "in_person");
  assert.ok(!("signAppointmentAt" in q));
});

test("in person on drop-off needs an appointment", () => {
  const form = { ...REVIEWER_FORM, signMethod: "in_person" };
  assert.throws(() => reviewerQuestionnaire(form, "drop_off"), (e) => {
    assert.equal(e.message, "Choose the appointment to sign.");
    return invalid(e);
  });
  const q = reviewerQuestionnaire({ ...form, signAppointmentAt: "2026-10-20T10:00" }, "drop_off");
  assert.equal(q.signAppointmentAt, "2026-10-20T10:00");
  assert.throws(() => reviewerQuestionnaire({ ...form, signAppointmentAt: "2026-10-20T25:00" }, "drop_off"), invalid);
  // An unknown service is not same-day.
  assert.throws(() => reviewerQuestionnaire(form, undefined), invalid);
});

test("needsAppointment", () => {
  assert.equal(needsAppointment("online", "in_person"), true);
  assert.equal(needsAppointment(null, "in_person"), true);
  assert.equal(needsAppointment("same_day", "in_person"), false);
  assert.equal(needsAppointment("online", "portal"), false);
});

test("whitespace remarks are left out; long remarks refused", () => {
  assert.ok(!("remarks" in reviewerQuestionnaire({ ...REVIEWER_FORM, remarks: " \n " }, "online")));
  assert.throws(() => reviewerQuestionnaire({ ...REVIEWER_FORM, remarks: "x".repeat(2001) }, "online"), invalid);
});

test("an untouched Exit Form is three empties", () => {
  assert.deepEqual(exitFormFrom({}), { federal: null, state: null, local: [] });
  assert.deepEqual(exitFormFrom({ "federal.method": " ", "local.SIT.amount": "" }), {
    federal: null, state: null, local: [],
  });
});

test("half-filled Local entry names the entry", () => {
  assert.throws(() => exitFormFrom({ "local.SIT.amount": "10" }), (e) => /SIT/.test(e.message) && invalid(e));
  assert.throws(() => exitFormFrom({ "federal.amount": "10" }), (e) => /Federal/.test(e.message) && invalid(e));
});

test("refund carries amount and refundBy only", () => {
  const form = exitFormFrom({
    "federal.method": "efile",
    "federal.result": "refund",
    "federal.amount": "123.45",
    "federal.refundBy": "direct_deposit",
    "federal.oweBy": "direct_debit",
    "federal.debitOn": "2026-04-15",
  });
  assert.deepEqual(form.federal, {
    method: "efile", result: "refund", amount: "123.45", refundBy: "direct_deposit",
  });
});

test("owe carries debitOn only for direct debit; none carries nothing", () => {
  const owe = (by) => exitFormFrom({
    "state.method": "paper", "state.result": "owe", "state.amount": "5",
    "state.oweBy": by, "state.debitOn": "2026-04-15", "state.refundBy": "check",
  }).state;
  assert.deepEqual(owe("direct_debit"), {
    method: "paper", result: "owe", amount: "5", oweBy: "direct_debit", debitOn: "2026-04-15",
  });
  assert.deepEqual(owe("mail_check"), { method: "paper", result: "owe", amount: "5", oweBy: "mail_check" });
  assert.throws(() => exitFormFrom({
    "state.method": "paper", "state.result": "owe", "state.amount": "5", "state.oweBy": "direct_debit",
  }), invalid);
  assert.deepEqual(exitFormFrom({
    "federal.method": "efile", "federal.result": "none", "federal.amount": "9", "federal.oweBy": "mail_check",
  }).federal, { method: "efile", result: "none" });
});

test("amount accepts 0 and 999999.99, refuses 1.005 and -1", () => {
  const amount = (a) => exitFormFrom({
    "federal.method": "efile", "federal.result": "refund", "federal.amount": a, "federal.refundBy": "check",
  }).federal.amount;
  assert.equal(amount("0"), "0");
  assert.equal(amount("999999.99"), "999999.99");
  for (const bad of ["1.005", "-1", "", "1000000", "01", "abc", "1."])
    assert.throws(() => amount(bad), invalid, bad);
});

test("local entries come in catalogue order, each with its type", () => {
  const form = exitFormFrom({
    "local.SIT.method": "efile", "local.SIT.result": "none",
    "local.NPT.method": "paper", "local.NPT.result": "none",
  });
  assert.deepEqual(form.local, [
    { type: "NPT", method: "paper", result: "none" },
    { type: "SIT", method: "efile", result: "none" },
  ]);
});

test("changedAnswers marks the ready-for-review date only when it differs", () => {
  const before = { confirmedBy: "client", confirmedMethod: "phone", shadedPartsCompleted: true, stateForgivenessSet: true, readyForReviewOn: "2026-10-10" };
  assert.equal(changedAnswers(before, { ...before }).has("readyForReviewOn"), false);
  assert.equal(changedAnswers(before, { ...before, readyForReviewOn: "2026-10-17" }).has("readyForReviewOn"), true);
});

test("changedAnswers marks a changed method", () => {
  const before = preparerQuestionnaire(PREPARER_FORM);
  const after = preparerQuestionnaire({ ...PREPARER_FORM, confirmedMethod: "video" });
  assert.deepEqual([...changedAnswers(before, after)], ["confirmedMethod"]);
  assert.equal(changedAnswers(before, before).size, 0);
});

const entry = (over) => ({
  purpose: "go_over_return", outcome: "reached", direction: "outgoing", method: "phone",
  contactedAt: "2026-10-12T15:00:00-04:00", ...over,
});

test("goOverPrefill takes the latest reached go-over", () => {
  const got = goOverPrefill([
    entry({ contactedAt: "2026-10-15T15:00:00-04:00", method: "in_person" }),
    entry({ contactedAt: "2026-10-12T15:00:00-04:00" }),
  ]);
  assert.deepEqual(got, { wentOver: "yes", wentOverOn: "2026-10-15", wentOverHow: "in_person" });
});

test("goOverPrefill ignores other purposes and outcomes", () => {
  assert.equal(goOverPrefill([
    entry({ purpose: "request_documents" }),
    entry({ outcome: "no_answer" }),
  ]), null);
  assert.equal(goOverPrefill([]), null);
  assert.equal(goOverPrefill(undefined), null);
});

test("goOverPrefill counts an incoming email as other", () => {
  const got = goOverPrefill([entry({ direction: "incoming", method: "email" })]);
  assert.equal(got.wentOverHow, "other");
  assert.equal(goOverPrefill([entry({ method: "text" })]).wentOverHow, "other");
  assert.equal(goOverPrefill([entry({ method: "video" })]).wentOverHow, "video");
});

test("goOverPrefill uses the New York date", () => {
  const got = goOverPrefill([entry({ contactedAt: "2026-10-15T02:30:00Z" })]);
  assert.equal(got.wentOverOn, "2026-10-14");
});
