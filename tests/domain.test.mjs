import test from "node:test";
import assert from "node:assert/strict";
import {
  newCase,
  screening,
  updateCase,
  restoreCase,
  sampleAnswers,
} from "../src/domain.mjs";
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
