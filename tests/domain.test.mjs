import test from "node:test";
import assert from "node:assert/strict";
import {
  newCase,
  screening,
  updateCase,
  restoreCase,
  sampleAnswers,
  describeStage,
} from "../src/domain.mjs";
import {
  CASE_ACTIONS,
  ERROR_CODES,
  REFERENCE_ALPHABET,
  REFERENCE_PATTERN,
  SQLSTATE_ERROR_CODES,
  STAGES,
} from "../src/contracts.mjs";
const ready = () =>
  updateCase(
    updateCase(newCase(), {
      type: "CREATE",
      contact: { method: "phone", value: "2025550142" },
    }),
    { type: "ANSWERS", answers: sampleAnswers },
  );
test("rideshare does not override other unsupported self-employment", () => {
  assert.equal(screening({ ...sampleAnswers, other: "yes" }), "unsupported");
  assert.equal(
    screening({ ...sampleAnswers, rideshare: "no", other: "yes" }),
    "unsupported",
  );
  assert.equal(screening(sampleAnswers), "continue");
  assert.equal(screening({ ...sampleAnswers, stocks: "yes" }), "unsupported");
  assert.equal(screening({ ...sampleAnswers, other: "unsure" }), "assistance");
  assert.equal(screening({ ...sampleAnswers, stocks: "" }), "incomplete");
});
test("submission records receipt once, without verifying intake", () => {
  let c = ready();
  assert.equal(c.status, "draft");
  c = updateCase(c, { type: "SUBMIT" });
  assert.equal(c.status, "received");
  assert.equal(c.intakeVerified, false);
  assert.equal(
    updateCase(c, { type: "SUBMIT" }).history.length,
    c.history.length,
  );
});
test("unsupported and unanswered cases cannot submit", () => {
  assert.throws(() =>
    updateCase(
      updateCase(ready(), { type: "ANSWERS", answers: { other: "yes" } }),
      { type: "SUBMIT" },
    ),
  );
  assert.throws(() => updateCase(newCase(), { type: "SUBMIT" }));
});
test("preparation requires intake checks and explicit claim", () => {
  let c = updateCase(ready(), { type: "SUBMIT" });
  assert.throws(() => updateCase(c, { type: "CLAIM" }));
  c = updateCase(c, { type: "VERIFY_INTAKE" });
  assert.equal(c.status, "queued");
  assert.equal(c.owner, null);
  c = updateCase(c, { type: "CLAIM" });
  assert.equal(c.status, "preparing");
  assert.equal(c.owner, "Alex");
  assert.throws(() => updateCase(c, { type: "CLAIM" }));
});
test("a client response never verifies a document or resumes preparation", () => {
  let c = updateCase(
    updateCase(updateCase(ready(), { type: "SUBMIT" }), {
      type: "VERIFY_INTAKE",
    }),
    { type: "CLAIM" },
  );
  c = updateCase(c, {
    type: "REQUEST",
    title: "Mileage record",
    message: "Please provide your 2025 mileage record.",
  });
  assert.equal(c.status, "held");
  assert.equal(c.request.status, "open");
  const before = structuredClone(c);
  c = updateCase(c, {
    type: "RESPOND",
    filename: "demo-mileage-record-2025.pdf",
  });
  assert.equal(c.status, "responded");
  assert.equal(c.request.status, "awaiting_verification");
  assert.equal(c.documents.at(-1).verified, false);
  assert.equal(c.owner, "Alex");
  assert.deepEqual(before.documents.length, 1);
  assert.equal(c.history.at(-1).actor, "Mei Chen");
  assert.equal(
    updateCase(c, { type: "RESPOND", filename: "demo-mileage-record-2025.pdf" })
      .documents.length,
    2,
  );
});
test("invalid request or response cannot fabricate a workflow event", () => {
  assert.throws(() =>
    updateCase(ready(), { type: "REQUEST", title: "", message: "" }),
  );
  assert.throws(() =>
    updateCase(ready(), { type: "RESPOND", filename: "x.pdf" }),
  );
});
test("saved draft survives restoration and corrupted storage resets safely", () => {
  const c = ready();
  assert.equal(restoreCase(JSON.stringify(c)).answers.firstName, "Mei");
  assert.equal(restoreCase(JSON.stringify(c)).id, "DEMO-7K4P-92");
  assert.equal(restoreCase("{broken").status, "draft");
  assert.equal(restoreCase("{}").id, null);
});
test("submitted answers cannot be silently overwritten", () => {
  const c = updateCase(ready(), { type: "SUBMIT" });
  assert.throws(() =>
    updateCase(c, { type: "ANSWERS", answers: { firstName: "Someone else" } }),
  );
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
