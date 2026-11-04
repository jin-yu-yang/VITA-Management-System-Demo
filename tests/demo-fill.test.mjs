import test from "node:test";
import assert from "node:assert/strict";
import { demoValues, demoFillButton } from "../src/demo-fill.mjs";
import {
  markEfiledDialogBody,
  markReadyToEfileDialogBody,
  recordFilingResultDialogBody,
  returnToSigningDialogBody,
} from "../src/admin-views.mjs";
import { preparerQuestionnaire, reviewerQuestionnaire } from "../src/questionnaires.mjs";
import { payloadFor } from "../src/case-actions.mjs";

// The form values a browser would read once the button has filled the form:
// a ticked checkbox sends its value ("yes" / "true"), everything else its text.
const asForm = (values, ticked = "yes") =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === true ? ticked : value]));

const NOW = Date.parse("2026-02-10T15:00:00Z");

const PRESENTER = { access: "presenter" };

test("the auto-fill button names its action", () => {
  assert.match(demoFillButton(PRESENTER), /data-action="demo-fill"/);
  assert.match(demoFillButton(PRESENTER), /type="button"/); // never submits the form
});

test("only a presenter gets the auto-fill button: a staff account never fills a real case", () => {
  assert.equal(demoFillButton({ access: "staff" }), "", "a staff account");
  assert.equal(demoFillButton({ access: "applicant" }), "", "a client");
  assert.equal(demoFillButton(null), "", "signed out");
  assert.equal(demoFillButton(), "", "no principal given");
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

test("a filing dialog shows the auto-fill button to a presenter and never to a staff account", () => {
  const savedCase = { reference: "VT-TEST-0002", answers: { tp_first_name: "Mei", tp_last_name: "Chen" } };
  for (const body of [markReadyToEfileDialogBody, markEfiledDialogBody, recordFilingResultDialogBody, returnToSigningDialogBody]) {
    assert.match(body({ savedCase, principal: PRESENTER }), /data-action="demo-fill"/, `${body.name}, presenter`);
    assert.doesNotMatch(body({ savedCase, principal: { access: "staff" } }), /demo-fill/, `${body.name}, staff account`);
  }
});
