import test from "node:test";
import assert from "node:assert/strict";
import {
  payloadFor,
  PAYLOAD_ACTIONS,
  SAMPLE_DOCUMENT_FILENAME,
  CONTACT_OUTCOMES,
  FOLLOWUP_RESOLUTION_OUTCOMES,
} from "../src/case-actions.mjs";
import { CASE_ACTIONS } from "../src/contracts.mjs";
import { MATERIALS_ITEMS } from "../src/intake-catalogue.mjs";

// The payload rules are a pure function, so these tests are the payload table
// of `contracts-excerpt.md` read back out of the code.

const invalid = (error) => error.code === "VALIDATION";

test("every action builds exactly the payload the contract names", () => {
  const cases = [
    ["SUBMIT", {}, {}, { confirmed: true }],
    [
      "VERIFY_INTAKE",
      {},
      // Four ticked checkboxes, exactly as a form reports them.
      { interview: "true", identity: "true", documents: "true", consent: "true" },
      {
        checks: {
          interview: true,
          identity: true,
          documents: true,
          consent: true,
        },
      },
    ],
    ["CLAIM_PREPARATION", {}, {}, {}],
    ["SUBMIT_REVIEW", {}, {}, {}],
    ["CLAIM_REVIEW", {}, {}, {}],
    ["APPROVE_REVIEW", {}, {}, {}],
    ["REMIND", {}, {}, {}],
    [
      "REQUEST_DOCUMENT",
      {},
      { title: " Mileage record ", message: " Please add the sample. " },
      { title: "Mileage record", message: "Please add the sample." },
    ],
    [
      "RESPOND_DOCUMENT",
      { requestId: "req-1" },
      {},
      { requestId: "req-1", filename: SAMPLE_DOCUMENT_FILENAME },
    ],
    [
      "RECORD_DOCUMENT_RESPONSE",
      { requestId: "req-1" },
      {},
      { requestId: "req-1", filename: SAMPLE_DOCUMENT_FILENAME },
    ],
    ["VERIFY_DOCUMENT", { requestId: "req-1" }, {}, { requestId: "req-1" }],
    [
      "ESCALATE_CONTACT",
      { requestId: "req-1" },
      { reason: "No response in a week" },
      { requestId: "req-1", reason: "No response in a week" },
    ],
    [
      "RECORD_CONTACT",
      { followupId: "task-1" },
      { outcome: "no_answer", note: "Left a message" },
      { followupId: "task-1", outcome: "no_answer", note: "Left a message" },
    ],
    [
      "RESOLVE_FOLLOWUP",
      { followupId: "task-1" },
      { outcome: "reached", note: "Spoke with the client" },
      { followupId: "task-1", outcome: "reached", note: "Spoke with the client" },
    ],
    [
      "REQUEST_CORRECTIONS",
      {},
      { findings: "Check the household size" },
      { findings: "Check the household size" },
    ],
    [
      "RESUBMIT_REVIEW",
      {},
      { resolution: "Household size corrected" },
      { resolution: "Household size corrected" },
    ],
    [
      "RECORD_REVIEW_CONTACT",
      {},
      { outcome: "reached", note: "Explained the next step" },
      { outcome: "reached", note: "Explained the next step" },
    ],
    [
      "CLOSE_CASE",
      {},
      { reason: "Client moved away", confirmed: "true" },
      { reason: "Client moved away", confirmed: true },
    ],
    [
      "UPDATE_CONTACT",
      {},
      { bestContactTime: ["weekday_morning", "weekend"], bestContactNote: " After 5pm " },
      { bestContactTime: ["weekday_morning", "weekend"], bestContactNote: "After 5pm" },
    ],
    [
      "RECORD_MATERIALS",
      {},
      { received: ["photo_id", "w2"] },
      { received: ["photo_id", "w2"] },
    ],
  ];
  for (const [type, dataset, values, payload] of cases)
    assert.deepEqual(payloadFor(type, dataset, values), { type, payload }, type);
  // Every action in the table is covered, and the table is every action this
  // module claims to build.
  assert.deepEqual(
    cases.map(([type]) => type).toSorted(),
    [...PAYLOAD_ACTIONS].toSorted(),
  );
});

test("the claim buttons send an empty payload and no dataset leaks into it", () => {
  assert.deepEqual(payloadFor("CLAIM_REVIEW", {}, {}), {
    type: "CLAIM_REVIEW",
    payload: {},
  });
  // A dataset carries the case id and whatever else the markup needed; none of
  // it may become an action payload field.
  assert.deepEqual(
    payloadFor(
      "CLAIM_REVIEW",
      { caseId: "case-a", personId: "morgan", requestId: "req-1" },
      { findings: "ignored" },
    ),
    { type: "CLAIM_REVIEW", payload: {} },
  );
  assert.deepEqual(payloadFor("CLAIM_PREPARATION", { caseId: "case-a" }, {}), {
    type: "CLAIM_PREPARATION",
    payload: {},
  });
});

test("an unknown type is a local validation failure, never a request", () => {
  for (const type of [
    "BOGUS",
    "claim_review",
    "CLAIM REVIEW",
    "",
    null,
    undefined,
    // An inherited property name is not an action either.
    "toString",
    "constructor",
  ])
    assert.throws(() => payloadFor(type, {}, {}), invalid, String(type));
  // SAVE_ANSWERS is a real action, but not one a form builds: the controller
  // owns the draft and the revision the edits started from.
  assert.ok(CASE_ACTIONS.includes("SAVE_ANSWERS"));
  assert.ok(!PAYLOAD_ACTIONS.includes("SAVE_ANSWERS"));
  assert.throws(() => payloadFor("SAVE_ANSWERS", {}, {}), invalid);
});

test("a missing required field refuses before anything is sent", () => {
  const missing = [
    ["REQUEST_DOCUMENT", {}, { message: "Only a message" }],
    ["REQUEST_DOCUMENT", {}, { title: "Only a title" }],
    ["REQUEST_DOCUMENT", {}, { title: "   ", message: "   " }],
    ["RESPOND_DOCUMENT", {}, {}],
    ["RECORD_DOCUMENT_RESPONSE", {}, {}],
    ["VERIFY_DOCUMENT", {}, {}],
    ["VERIFY_DOCUMENT", { requestId: "  " }, {}],
    ["ESCALATE_CONTACT", { requestId: "req-1" }, {}],
    ["ESCALATE_CONTACT", {}, { reason: "No response" }],
    ["RECORD_CONTACT", { followupId: "task-1" }, { outcome: "reached" }],
    ["RECORD_CONTACT", { followupId: "task-1" }, { note: "A note" }],
    ["RECORD_CONTACT", {}, { outcome: "reached", note: "A note" }],
    ["RESOLVE_FOLLOWUP", { followupId: "task-1" }, { outcome: "reached" }],
    ["REQUEST_CORRECTIONS", {}, {}],
    ["REQUEST_CORRECTIONS", {}, { findings: "\n\t " }],
    ["RESUBMIT_REVIEW", {}, {}],
    ["RECORD_REVIEW_CONTACT", {}, { note: "A note" }],
    ["RECORD_REVIEW_CONTACT", {}, { outcome: "reached" }],
    ["CLOSE_CASE", {}, {}],
    ["CLOSE_CASE", {}, { reason: "Client moved away" }],
    ["CLOSE_CASE", {}, { confirmed: "true" }],
    // Three of the four attestations is not an attestation.
    ["VERIFY_INTAKE", {}, {}],
    [
      "VERIFY_INTAKE",
      {},
      { interview: "true", identity: "true", documents: "true" },
    ],
    [
      "VERIFY_INTAKE",
      {},
      {
        interview: "true",
        identity: "true",
        documents: "true",
        consent: "false",
      },
    ],
  ];
  for (const [type, dataset, values] of missing)
    assert.throws(
      () => payloadFor(type, dataset, values),
      invalid,
      `${type} ${JSON.stringify(values)}`,
    );
});

test("an outcome outside its own list is refused", () => {
  for (const value of ["", "resolved", "REACHED", "maybe", null])
    assert.throws(
      () =>
        payloadFor("RECORD_CONTACT", { followupId: "t" }, {
          outcome: value,
          note: "A note",
        }),
      invalid,
      String(value),
    );
  // Recording an attempt accepts all four; resolving accepts only two.
  for (const value of CONTACT_OUTCOMES) {
    assert.equal(
      payloadFor("RECORD_CONTACT", { followupId: "t" }, { outcome: value, note: "n" })
        .payload.outcome,
      value,
    );
    assert.equal(
      payloadFor("RECORD_REVIEW_CONTACT", {}, { outcome: value, note: "n" }).payload
        .outcome,
      value,
    );
    const resolving = () =>
      payloadFor("RESOLVE_FOLLOWUP", { followupId: "t" }, { outcome: value, note: "n" });
    if (FOLLOWUP_RESOLUTION_OUTCOMES.includes(value))
      assert.equal(resolving().payload.outcome, value);
    else assert.throws(resolving, invalid, value);
  }
});

test("a form value never overrides the file name or the confirmation flag", () => {
  assert.equal(
    payloadFor(
      "RESPOND_DOCUMENT",
      { requestId: "req-1" },
      { filename: "real-taxpayer-w2.pdf" },
    ).payload.filename,
    SAMPLE_DOCUMENT_FILENAME,
  );
  assert.deepEqual(payloadFor("SUBMIT", {}, { confirmed: "false" }).payload, {
    confirmed: true,
  });
  // Closing needs the confirmation, and the flag that leaves is always the
  // literal `true` the contract names: a form can withhold it, never redefine
  // it as something else.
  assert.throws(
    () => payloadFor("CLOSE_CASE", {}, { reason: "r", confirmed: "no" }),
    invalid,
  );
  const closure = payloadFor("CLOSE_CASE", {}, {
    reason: "r",
    confirmed: "on",
  }).payload;
  assert.deepEqual(Object.keys(closure).toSorted(), ["confirmed", "reason"]);
  assert.equal(closure.confirmed, true);
  // The same for the intake checks: a "false" checkbox value is not a tick, and
  // no extra field can join the four the database accepts.
  assert.throws(
    () =>
      payloadFor("VERIFY_INTAKE", {}, {
        interview: "true",
        identity: "true",
        documents: "true",
        consent: "no",
      }),
    invalid,
  );
  assert.deepEqual(
    payloadFor("VERIFY_INTAKE", {}, {
      interview: "true",
      identity: "true",
      documents: "true",
      consent: "true",
      smuggled: "true",
    }).payload,
    { checks: { interview: true, identity: true, documents: true, consent: true } },
  );
});

test("a related id may come from the dataset or from a hidden field", () => {
  assert.equal(
    payloadFor("VERIFY_DOCUMENT", { requestId: "from-dataset" }, {
      requestId: "from-form",
    }).payload.requestId,
    "from-dataset",
    "the control that was pressed wins",
  );
  assert.equal(
    payloadFor("ESCALATE_CONTACT", {}, {
      requestId: "from-form",
      reason: "No response",
    }).payload.requestId,
    "from-form",
  );
});

// Part 4a, Task 4: the two version-2 contact and materials actions.
test("UPDATE_CONTACT sends only the keys the form carries, checked like the catalogue", () => {
  // One key alone, and a single ticked checkbox arrives as a string.
  assert.deepEqual(payloadFor("UPDATE_CONTACT", {}, { bestContactTime: "weekend" }), {
    type: "UPDATE_CONTACT",
    payload: { bestContactTime: ["weekend"] },
  });
  assert.deepEqual(payloadFor("UPDATE_CONTACT", {}, { bestContactNote: "Text first" }).payload, {
    bestContactNote: "Text first",
  });
  // A blank note and an empty list clear the field.
  assert.deepEqual(
    payloadFor("UPDATE_CONTACT", {}, { bestContactNote: "   ", bestContactTime: [] }).payload,
    { bestContactNote: null, bestContactTime: null },
  );
  // A phone, a snake_case key or a dataset value never joins the payload.
  assert.deepEqual(
    payloadFor(
      "UPDATE_CONTACT",
      { phone: "2155550111", caseId: "case-a" },
      { bestContactNote: "Hi", phone: "2155550111", tp_phone: "2155550111", best_contact_note: "x" },
    ).payload,
    { bestContactNote: "Hi" },
  );
  for (const values of [
    {},
    { phone: "2155550111" },
    { bestContactTime: ["bogus"] },
    { bestContactTime: ["weekend", "weekend"] },
    { bestContactNote: "x".repeat(201) },
  ])
    assert.throws(() => payloadFor("UPDATE_CONTACT", {}, values), invalid, JSON.stringify(values));
  assert.equal(
    payloadFor("UPDATE_CONTACT", {}, { bestContactNote: "x".repeat(200) }).payload.bestContactNote
      .length,
    200,
  );
});

test("RECORD_MATERIALS sends the whole set received, from the catalogue's list", () => {
  // No ticked box is the empty set: nothing received.
  assert.deepEqual(payloadFor("RECORD_MATERIALS", {}, {}), {
    type: "RECORD_MATERIALS",
    payload: { received: [] },
  });
  assert.deepEqual(payloadFor("RECORD_MATERIALS", {}, { received: "w2" }).payload, {
    received: ["w2"],
  });
  // A repeated item is sent once.
  assert.deepEqual(
    payloadFor("RECORD_MATERIALS", {}, { received: ["w2", "photo_id", "w2"] }).payload,
    { received: ["w2", "photo_id"] },
  );
  for (const received of [["passport"], ["W2"], [""], [1]])
    assert.throws(
      () => payloadFor("RECORD_MATERIALS", {}, { received }),
      invalid,
      JSON.stringify(received),
    );
  assert.deepEqual(
    payloadFor("RECORD_MATERIALS", {}, { received: MATERIALS_ITEMS.map((item) => item.id) })
      .payload.received,
    MATERIALS_ITEMS.map((item) => item.id),
  );
  assert.ok(CASE_ACTIONS.includes("UPDATE_CONTACT"));
  assert.ok(CASE_ACTIONS.includes("RECORD_MATERIALS"));
});
