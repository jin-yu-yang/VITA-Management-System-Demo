import test from "node:test";
import assert from "node:assert/strict";
import { demoValues, demoFillButton } from "../src/demo-fill.mjs";
import { preparerQuestionnaire, reviewerQuestionnaire } from "../src/questionnaires.mjs";
import { payloadFor } from "../src/case-actions.mjs";

// The form values a browser would read once the button has filled the form:
// a ticked checkbox sends its value ("yes" / "true"), everything else its text.
const asForm = (values, ticked = "yes") =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === true ? ticked : value]));

const NOW = Date.parse("2026-02-10T15:00:00Z");

test("the auto-fill button names its action", () => {
  assert.match(demoFillButton(), /data-action="demo-fill"/);
  assert.match(demoFillButton(), /type="button"/); // never submits the form
});

test("the fictional data passes the preparer questionnaire", () => {
  const payload = preparerQuestionnaire(asForm(demoValues(NOW)));
  assert.equal(payload.confirmedBy, "client");
  assert.equal(payload.readyForReviewOn, "2026-02-10");
});

test("the fictional data passes the reviewer questionnaire for every service", () => {
  for (const service of ["same_day", "drop_off", "online", undefined]) {
    for (const signMethod of ["portal", "in_person"]) {
      const values = { ...asForm(demoValues(NOW)), signMethod };
      const payload = reviewerQuestionnaire(values, service);
      assert.equal(payload.exitForm.federal.result, "refund");
      assert.equal(payload.exitForm.state.oweBy, "direct_debit");
      assert.deepEqual(payload.exitForm.local, []);
    }
  }
});

test("the fictional data passes the review-contact form and a corrections resubmit", () => {
  const values = asForm(demoValues(NOW));
  assert.equal(payloadFor("RECORD_REVIEW_CONTACT", {}, values).payload.outcome, "reached");
  assert.doesNotThrow(() => payloadFor("RESUBMIT_REVIEW", {}, values));
});

test("the fictional data passes the filing dialogs", () => {
  const values = asForm(demoValues(NOW), "true");
  assert.doesNotThrow(() => payloadFor("MARK_READY_TO_EFILE", {}, values));
  assert.doesNotThrow(() => payloadFor("MARK_EFILED", {}, values));
  assert.doesNotThrow(() => payloadFor("RETURN_TO_SIGNING", {}, values));
  const { payload: result } = payloadFor("RECORD_FILING_RESULT", { stage: "efiled" }, values);
  assert.equal(result.results.federal.result, "accepted");
  assert.equal(result.fixNote, undefined);
});
