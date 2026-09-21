import test from "node:test";
import assert from "node:assert/strict";
import {
  screening,
  describeStage,
  missingAnswers,
  submissionBlocker,
  INTAKE_ANSWER_KEYS,
  REQUIRED_ANSWER_KEYS,
} from "../src/domain.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";
import {
  CASE_ACTIONS,
  ERROR_CODES,
  REFERENCE_ALPHABET,
  REFERENCE_PATTERN,
  SQLSTATE_ERROR_CODES,
  STAGES,
} from "../src/contracts.mjs";

// The in-browser case machine of the local prototype is gone: stages,
// authority, revisions and history are the database's, and every transition it
// used to simulate is covered authoritatively by the live suites in
// `tests/database-*.mjs` (see the Task 6 report for the assertion-by-assertion
// map). What remains here is what the browser still decides for itself: what it
// may show, what it may send, and what it may say about a stage.

const complete = makeSampleAnswers({ seed: 0, scenario: "ordinary" });

test("rideshare does not override other unsupported self-employment", () => {
  assert.equal(screening({ ...complete, other: "yes" }), "unsupported");
  assert.equal(
    screening({ ...complete, rideshare: "no", other: "yes" }),
    "unsupported",
  );
  assert.equal(screening(complete), "continue");
  assert.equal(screening({ ...complete, stocks: "yes" }), "unsupported");
  assert.equal(screening({ ...complete, other: "unsure" }), "assistance");
  assert.equal(screening({ ...complete, stocks: "" }), "incomplete");
});

test("local readiness names what is missing without deciding the submission", () => {
  assert.equal(submissionBlocker(complete), null);
  assert.deepEqual(missingAnswers(complete), []);
  // Required answers are a subset of what the browser may ever send.
  for (const key of REQUIRED_ANSWER_KEYS)
    assert.ok(INTAKE_ANSWER_KEYS.includes(key), key);
  assert.deepEqual(missingAnswers({ ...complete, firstName: "   " }), [
    "firstName",
  ]);
  assert.equal(submissionBlocker({ ...complete, zip: "" }), "incomplete");
  // The same refusals the server's SUBMIT branch makes, in the same order.
  assert.equal(submissionBlocker({ ...complete, year: "2024" }), "year");
  assert.equal(
    submissionBlocker({ ...complete, residenceState: "Other" }),
    "residenceState",
  );
  assert.equal(submissionBlocker({ ...complete, helper: "helper" }), "helper");
  assert.equal(submissionBlocker({ ...complete, other: "yes" }), "unsupported");
  assert.equal(
    submissionBlocker({ ...complete, stocks: "unsure" }),
    "assistance",
  );
  assert.equal(submissionBlocker({}), "incomplete");
});

test("every server stage has plain status copy and no workflow decision", () => {
  const described = STAGES.map((stage) => describeStage(stage));
  for (const [index, stage] of STAGES.entries()) {
    const { label, clientMessage } = described[index];
    assert.equal(typeof label, "string", stage);
    assert.equal(typeof clientMessage, "string", stage);
    assert.ok(label.length > 0 && label.length <= 40, stage);
    assert.ok(clientMessage.length > 0, stage);
    // Status copy is client-facing: no internal words, no money, and no claim
    // that a later milestone has happened.
    for (const word of [
      "findings",
      "refund",
      "bank",
      "routing",
      "deposit",
      "$",
    ])
      assert.ok(
        !clientMessage.toLowerCase().includes(word),
        `${stage} must not mention ${word}`,
      );
  }
  // Every stage is described distinctly, and the table is stage-keyed only.
  assert.equal(
    new Set(described.map((entry) => entry.label)).size,
    STAGES.length,
  );
  assert.deepEqual(Object.keys(describeStage("reviewing")).sort(), [
    "clientMessage",
    "label",
  ]);
  assert.equal(describeStage("reviewing").label, "In review");
  assert.match(
    describeStage("corrections_required").clientMessage,
    /No action is needed from you right now/,
  );
  assert.match(
    describeStage("review_approved").clientMessage,
    /Signing and filing are later milestones and are not done yet/,
  );
  // Pure: the same input answers the same way, and an edited result never
  // changes the next answer.
  const first = describeStage("preparing");
  first.label = "Changed";
  assert.equal(describeStage("preparing").label, "In preparation");
  assert.deepEqual(describeStage("preparing"), describeStage("preparing"));
  // Anything the server never sends falls back to neutral copy.
  for (const unknown of [
    "signed",
    "filed",
    "accepted",
    "",
    undefined,
    null,
    "toString",
  ])
    assert.deepEqual(describeStage(unknown), {
      label: "Application",
      clientMessage:
        "This application is with the office. Contact PCDC if you have questions.",
    });
});

test("shared case contracts expose readable references and frozen vocabularies", () => {
  assert.equal(REFERENCE_ALPHABET, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
  assert.equal(REFERENCE_PATTERN.test("VT-A2BC-DE9F"), true);
  assert.equal(REFERENCE_PATTERN.test("VT-A1BC-DE0F"), false);
  assert.deepEqual(STAGES, [
    "draft",
    "received",
    "preparation_ready",
    "preparing",
    "review_ready",
    "reviewing",
    "corrections_required",
    "review_approved",
    "closed",
  ]);
  assert.deepEqual(CASE_ACTIONS, [
    "SAVE_ANSWERS",
    "SUBMIT",
    "VERIFY_INTAKE",
    "CLAIM_PREPARATION",
    "REQUEST_DOCUMENT",
    "RESPOND_DOCUMENT",
    "RECORD_DOCUMENT_RESPONSE",
    "VERIFY_DOCUMENT",
    "ESCALATE_CONTACT",
    "RECORD_CONTACT",
    "RESOLVE_FOLLOWUP",
    "SUBMIT_REVIEW",
    "CLAIM_REVIEW",
    "REQUEST_CORRECTIONS",
    "RESUBMIT_REVIEW",
    "APPROVE_REVIEW",
    "RECORD_REVIEW_CONTACT",
    "REMIND",
    "CLOSE_CASE",
  ]);
  assert.deepEqual(ERROR_CODES, [
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    "INVALID_TRANSITION",
    "SELF_REVIEW",
    "INELIGIBLE",
    "VALIDATION",
    "OFFLINE",
    "SERVER_ERROR",
  ]);
  assert.deepEqual(SQLSTATE_ERROR_CODES, {
    VT001: "FORBIDDEN",
    VT002: "NOT_FOUND",
    VT003: "CONFLICT",
    VT004: "INVALID_TRANSITION",
    VT005: "SELF_REVIEW",
    VT006: "INELIGIBLE",
    VT007: "VALIDATION",
  });
  assert.equal(Object.isFrozen(STAGES), true);
  assert.equal(Object.isFrozen(CASE_ACTIONS), true);
  assert.equal(Object.isFrozen(ERROR_CODES), true);
  assert.equal(Object.isFrozen(SQLSTATE_ERROR_CODES), true);
});
