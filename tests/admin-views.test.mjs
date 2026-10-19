import test from "node:test";
import assert from "node:assert/strict";
import {
  renderAdminCase,
  closeCaseDialogBody,
  markReadyToEfileDialogBody,
  markEfiledDialogBody,
  adminEligibility,
} from "../src/admin-views.mjs";
import { decorateStaffCase, renderStaffCase } from "../src/staff-views.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";
import { CONTACT_FIELDS } from "../src/intake-catalogue.mjs";
import { staffScreen, dialog } from "../src/views.mjs";
import { payloadFor } from "../src/case-actions.mjs";
import { describeStage } from "../src/domain.mjs";

// The admin screens are pure functions of records and one persona, so these
// tests read the HTML string itself. No DOM library, and nothing here may reach
// a store.

// ---------------------------------------------------------------------------
// The task brief's test, verbatim.
// ---------------------------------------------------------------------------
test('admin task and preparation have distinct owners', () => {
  const html = renderAdminCase({stage:'preparing',preparerId:'alex',
    preparerName:'Alex',followups:[{assigneeName:'Sam',status:'open'}],
    requests:[],history:[],answers:{language:'Mandarin'}}, {});
  assert.match(html, /Preparation[^]*Alex/);
  assert.match(html, /Follow-up[^]*Sam/);
});

// ---------------------------------------------------------------------------

const ALEX = { id: "alex", name: "Alex", capabilities: ["prepare"] };
const MORGAN = { id: "morgan", name: "Morgan", capabilities: ["review"] };
// Task 4's `extendTestWorkspace` can add a capability to an existing person;
// holding `followup` is still not holding the task.
const MORGAN_FOLLOWUP = {
  id: "morgan",
  name: "Morgan",
  capabilities: ["review", "followup"],
};
const SAM = {
  id: "sam",
  name: "Sam",
  capabilities: ["admin", "assist", "followup", "receive_documents"],
};
const PEOPLE = [ALEX, MORGAN, SAM];

const officeCase = (overrides = {}) =>
  decorateStaffCase(
    {
      id: "case-a",
      reference: "VT-AB2C-DE3F",
      workspaceId: "w1",
      ownerUserId: null,
      fixture: false,
      stage: "preparing",
      revision: 5,
      preparationVersion: 0,
      answers: { service: "Drop-off", language: "Cantonese", firstName: "Mei" },
      intakeVerified: true,
      preparerId: "alex",
      reviewerId: null,
      lastRemindedAt: null,
      lastRemindedByPersonId: null,
      createdAt: "2026-09-10T15:00:00.000Z",
      updatedAt: "2026-09-12T16:30:00.000Z",
      participants: ["alex"],
      requests: [],
      documents: [],
      followups: [],
      reviews: [],
      history: [],
      internalHistory: [],
      ...overrides,
    },
    PEOPLE,
  );

const boardCase = (overrides = {}) =>
  decorateStaffCase(
    {
      id: "case-1",
      reference: "VT-AAAA-1111",
      ownerUserId: "owner-1",
      stage: "preparation_ready",
      revision: 3,
      preparationVersion: 0,
      answers: { service: "Drop-off", language: "English" },
      intakeVerified: true,
      preparerId: null,
      reviewerId: null,
      lastRemindedAt: null,
      updatedAt: "2026-09-12T16:30:00.000Z",
      ...overrides,
    },
    PEOPLE,
  );

const item = (overrides = {}) => ({
  id: "item-1",
  caseId: null,
  title: "Client needs help completing intake forms",
  status: "open",
  revision: 1,
  assigneeId: null,
  assigneeName: null,
  resolutionNote: null,
  language: "Mandarin",
  contactPreference: "Prefers calls from the main office",
  createdAt: "2026-09-12T10:00:00.000Z",
  ...overrides,
});

const openTask = (overrides = {}) => ({
  id: "task-1",
  requestId: "req-1",
  assigneeId: "sam",
  status: "open",
  reason: "No answer on the number we have.",
  resolutionOutcome: null,
  resolutionNote: null,
  createdAt: "2026-09-12T11:00:00.000Z",
  ...overrides,
});

// A contact log entry, as the store maps it, with its one version.
const contactEntry = (overrides = {}) => {
  const entry = {
    direction: "outgoing",
    contactedAt: "2026-09-12T16:00:00.000Z",
    withWhom: "client",
    otherName: null,
    method: "phone",
    purpose: "request_documents",
    outcome: "no_answer",
    note: "Rang twice, no voicemail.",
    ...overrides,
  };
  return {
    id: "contact-1",
    caseId: "case-a",
    followupId: "task-1",
    revision: 1,
    loggedAt: entry.contactedAt,
    editedAt: null,
    loggedByPersonId: "sam",
    versions: [{ version: 1, createdAt: entry.contactedAt, editedByPersonId: "sam", ...entry }],
    ...entry,
    ...overrides,
  };
};

// The shared Log contact form, linked to one task.
const linkedForm = (taskId) =>
  new RegExp(`<form class="staff-form contact-form" data-case-id="case-a" data-followup-id="${taskId}">`);

const openRequest = (overrides = {}) => ({
  id: "req-1",
  title: "Mileage record",
  message: "Please bring the fictional sample.",
  status: "open",
  createdAt: "2026-09-11T09:00:00.000Z",
  ...overrides,
});

const caseActions = (html) => [
  ...html.matchAll(/data-case-action="([A-Z_]+)"/g),
].map((match) => match[1]);

// ---------------------------------------------------------------------------
// Intake checks
// ---------------------------------------------------------------------------

test("the intake checks are offered once, as four simulated attestations", () => {
  const arrived = officeCase({ stage: "screening", intakeVerified: false });
  const none = renderAdminCase(arrived, { person: SAM });
  assert.match(none, /data-case-action="VERIFY_INTAKE"/);
  for (const key of ["interview", "identity", "documents", "consent"]) {
    assert.match(none, new RegExp(`id="field-intake-${key}"`));
    assert.match(none, new RegExp(`name="${key}" value="true"`));
  }
  // Nothing is claimed about a real check.
  assert.match(none, /simulated/i);
  assert.match(none, /it is not an interview, an identity check/i);
  // Without all four ticked the button is disabled.
  assert.match(none, /data-case-action="VERIFY_INTAKE" disabled>/);
  const all = renderAdminCase(arrived, {
    person: SAM,
    openPanels: [
      "intake-check-interview",
      "intake-check-identity",
      "intake-check-documents",
      "intake-check-consent",
    ],
  });
  assert.doesNotMatch(all, /data-case-action="VERIFY_INTAKE" disabled/);
  // Counted outside the Contacts tab, whose form draws its own defaults.
  const outsideContacts = all.slice(0, all.indexOf('id="case-panel-contacts"'));
  assert.equal((outsideContacts.match(/checked/g) ?? []).length, 4);
  // The payload the form's four ticked boxes build is exactly the contract's.
  assert.deepEqual(
    payloadFor("VERIFY_INTAKE", {}, {
      interview: "true",
      identity: "true",
      documents: "true",
      consent: "true",
    }).payload,
    { checks: { interview: true, identity: true, documents: true, consent: true } },
  );
  assert.throws(
    () =>
      payloadFor("VERIFY_INTAKE", {}, {
        interview: "true",
        identity: "true",
        documents: "true",
      }),
    (error) => error.code === "VALIDATION",
  );
  // At every other stage it is explained rather than offered.
  const already = renderAdminCase(officeCase(), { person: SAM });
  assert.doesNotMatch(already, /data-case-action="VERIFY_INTAKE"/);
  assert.match(already, /The simulated intake checks are already recorded\./);
  const draft = renderAdminCase(officeCase({ stage: "draft", intakeVerified: false }), {
    person: SAM,
  });
  assert.match(draft, /The client has not sent this application yet\./);
  // A request that has not been opened yet waits for screening.
  const waiting = renderAdminCase(officeCase({ stage: "received", intakeVerified: false }), {
    person: SAM,
  });
  assert.doesNotMatch(waiting, /data-case-action="VERIFY_INTAKE"/);
  assert.match(waiting, /Screening starts when an admin opens the case\./);
  // And it is an office action: a preparer sees the reason, not the form.
  const forAlex = renderAdminCase(arrived, { person: ALEX });
  assert.doesNotMatch(forAlex, /data-case-action="VERIFY_INTAKE"/);
  assert.match(forAlex, /Needs office administrator access\./);
});

// ---------------------------------------------------------------------------
// Follow-up
// ---------------------------------------------------------------------------

test("each open task has the shared form and Resolve", () => {
  const record = officeCase({
    requests: [openRequest()],
    followups: [openTask()],
    contacts: [contactEntry()],
  });
  const html = renderAdminCase(record, { person: SAM, now: Date.parse("2026-09-12T17:00:00.000Z") });
  const followup = html.slice(html.indexOf('id="case-panel-followup"'), html.indexOf('id="case-panel-contacts"'));
  assert.match(followup, linkedForm("task-1"));
  assert.match(followup, /<h4>Log contact<\/h4>/);
  assert.match(followup, /id="field-contact-task-task-1-note"/);
  assert.doesNotMatch(html, /RECORD_CONTACT/);
  assert.match(followup, /data-case-action="RESOLVE_FOLLOWUP" data-followup-id="task-1"/);
  // The request the task is about, its reason and the assignee the server chose.
  assert.match(html, /<h3>Mileage record<\/h3>/);
  assert.match(html, /No answer on the number we have\./);
  assert.match(html, /<span>Assigned to<\/span><strong>Sam<\/strong>/);
  // "Resolve this task" is as it was: two outcomes, per-task ids.
  const resolveForm = html.slice(html.indexOf('id="field-resolve-task-1-outcome"'));
  const resolveOptions = [...resolveForm.matchAll(/<option value="([a-z_]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(resolveOptions.slice(0, 2), ["reached", "no_further_contact"]);
  assert.ok(!resolveOptions.includes("no_answer"));
  assert.ok(!resolveOptions.includes("closure_requested"));
  assert.match(html, /<h4>Resolve this task<\/h4>/);
  assert.match(html, /does not verify a document, change the preparer, or close the case/);
  // The log form comes before Resolve.
  assert.ok(followup.indexOf("contact-form") < followup.indexOf("Resolve this task"));
  // There is no way to hand the task to somebody else.
  assert.doesNotMatch(html, /name="assignee/i);
  assert.match(html, /no way to hand it to someone else/i);

  // Both directions of the rule (Ruling R53).
  const forAlex = renderAdminCase(record, { person: ALEX });
  assert.doesNotMatch(forAlex, linkedForm("task-1"));
  assert.doesNotMatch(forAlex, /data-case-action="RESOLVE_FOLLOWUP"/);
  assert.match(forAlex, /Needs office follow-up access\./);
  // Holding the capability is still not holding the task.
  const forMorgan = renderAdminCase(record, { person: MORGAN_FOLLOWUP });
  assert.doesNotMatch(forMorgan, linkedForm("task-1"));
  assert.match(forMorgan, /The office assigned this task to someone else\./);
  assert.doesNotMatch(forMorgan, /Needs office follow-up access\./);
});

test("the task lists its linked contacts", () => {
  const record = officeCase({
    requests: [openRequest()],
    followups: [openTask()],
    contacts: [contactEntry(), contactEntry({ id: "contact-2", followupId: null, note: "Not about the task." })],
  });
  const html = renderAdminCase(record, { person: SAM });
  const followup = html.slice(html.indexOf('id="case-panel-followup"'), html.indexOf('id="case-panel-contacts"'));
  assert.match(followup, /<h4>Contacts so far<\/h4><ul class="contact-task-list"><li>9\/12\/2026 12:00 PM — Sam → client, phone — Request documents — No answer\. Note: Rang twice, no voicemail\.<\/li><\/ul>/);
  assert.doesNotMatch(followup, /Not about the task/);
  const none = renderAdminCase(officeCase({ requests: [openRequest()], followups: [openTask()] }), { person: SAM });
  assert.match(none, /<h4>Contacts so far<\/h4><p class="muted">No contact has been logged on this task yet\.<\/p>/);
});

test("the office case has the Contacts tab with its count", () => {
  const html = renderAdminCase(
    officeCase({ contacts: [contactEntry({ followupId: null }), contactEntry({ id: "contact-2", followupId: null })] }),
    { person: SAM },
  );
  const order = [...html.matchAll(/role="tab" id="case-tab-([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["overview", "intake", "documents", "followup", "contacts", "history"]);
  assert.match(html, /data-value="contacts">Contacts <span class="tab-count">2<\/span><\/button>/);
  assert.match(html, /<h2 id="contacts-title">Contacts<\/h2>/);
  assert.match(html, /<form class="staff-form contact-form" data-case-id="case-a">/);
  // Sam is an admin: he may edit the entries he did not log too.
  assert.match(html, /data-action="toggle-contact-edit" data-contact-id="contact-2"/);
});

test("two open tasks get four forms that cannot be confused", () => {
  const record = officeCase({
    requests: [
      openRequest(),
      openRequest({ id: "req-2", title: "Bank letter", status: "open" }),
    ],
    followups: [openTask(), openTask({ id: "task-2", requestId: "req-2" })],
  });
  const html = renderAdminCase(record, { person: SAM });
  // Task 7's cursor fix resolves a focused field by **id**, so two tasks on one
  // page must never share one: a namesake would take the cursor, and the rest
  // of the sentence would be typed into, and sent for, the other task.
  for (const id of [
    "field-contact-task-task-1-direction-outgoing",
    "field-contact-task-task-1-contactedAt",
    "field-contact-task-task-1-note",
    "field-resolve-task-1-outcome",
    "field-resolve-task-1-note",
    "field-contact-task-task-2-direction-outgoing",
    "field-contact-task-task-2-contactedAt",
    "field-contact-task-task-2-note",
    "field-resolve-task-2-outcome",
    "field-resolve-task-2-note",
  ]) {
    assert.equal(
      (html.match(new RegExp(`id="${id}"`, "g")) ?? []).length,
      1,
      id,
    );
    assert.match(html, new RegExp(`<label class="(field|seg)" for="${id}">`));
  }
  // Each form names its own task: the log form on itself, Resolve on its
  // button and in its hidden field.
  for (const taskId of ["task-1", "task-2"]) {
    assert.match(html, linkedForm(taskId));
    assert.match(html, new RegExp(`data-case-action="RESOLVE_FOLLOWUP" data-followup-id="${taskId}"`));
  }
  assert.equal(
    (html.match(/<input type="hidden" name="followupId" value="task-2">/g) ?? [])
      .length,
    1,
    "one hidden id, on the second task's Resolve form",
  );
});

test("a resolved task keeps its history and offers no further action", () => {
  const record = officeCase({
    requests: [openRequest()],
    followups: [
      openTask({
        status: "resolved",
        resolutionOutcome: "reached",
        resolutionNote: "Spoke to the client; they will bring it in.",
      }),
    ],
  });
  const html = renderAdminCase(record, { person: SAM });
  assert.doesNotMatch(html, linkedForm("task-1"));
  assert.doesNotMatch(html, /data-case-action="RESOLVE_FOLLOWUP"/);
  assert.match(html, /Spoke with the client — Spoke to the client; they will bring it in\./);
  assert.match(html, /Resolved/);
});

test("a client response arriving while the task is open is shown beside it", () => {
  const record = officeCase({
    requests: [openRequest({ status: "awaiting_verification" })],
    followups: [openTask()],
  });
  const html = renderAdminCase(record, { person: SAM });
  assert.match(html, /The client responded; awaiting preparer verification\./);
  assert.match(html, /Resolving this task does not verify the document\./);
  // The task is still open and still both steps.
  assert.match(html, linkedForm("task-1"));
  assert.match(html, /data-case-action="RESOLVE_FOLLOWUP"/);
  // While the request is still open there is nothing to say about a response.
  const waiting = renderAdminCase(
    officeCase({ requests: [openRequest()], followups: [openTask()] }),
    { person: SAM },
  );
  assert.doesNotMatch(waiting, /The client responded/);
});

// ---------------------------------------------------------------------------
// The staff receipt
// ---------------------------------------------------------------------------

test("the office records a document only for a client with no account", () => {
  const record = officeCase({ requests: [openRequest()] });
  const html = renderAdminCase(record, { person: SAM });
  assert.match(
    html,
    /data-case-action="RECORD_DOCUMENT_RESPONSE" data-request-id="req-1"/,
  );
  assert.match(html, /Record sample document received/);
  assert.match(html, /staff-recorded/);
  assert.match(html, /awaiting preparer verification/);
  assert.match(html, /taking delivery is not verifying, and it never changes the preparer/);
  assert.match(html, /demo-mileage-record-2025\.pdf/);

  // A client who has their own account sends it themselves.
  const owned = renderAdminCase(
    officeCase({ ownerUserId: "owner-1", requests: [openRequest()] }),
    { person: SAM },
  );
  assert.doesNotMatch(owned, /data-case-action="RECORD_DOCUMENT_RESPONSE"/);
  assert.match(owned, /This client has their own account, so they send it themselves\./);

  // A settled request takes no second receipt.
  const settled = renderAdminCase(
    officeCase({ requests: [openRequest({ status: "awaiting_verification" })] }),
    { person: SAM },
  );
  assert.doesNotMatch(settled, /data-case-action="RECORD_DOCUMENT_RESPONSE"/);

  // Nor does a case outside the preparation window.
  const early = renderAdminCase(
    officeCase({ stage: "received", requests: [openRequest()] }),
    { person: SAM },
  );
  assert.doesNotMatch(early, /data-case-action="RECORD_DOCUMENT_RESPONSE"/);
  assert.match(early, /A document is recorded while the case is being prepared\./);

  // And the receipt capability is its own: a reviewer is refused by name.
  const forMorgan = renderAdminCase(record, { person: MORGAN });
  assert.doesNotMatch(forMorgan, /data-case-action="RECORD_DOCUMENT_RESPONSE"/);
  assert.match(forMorgan, /Needs office document-receipt access\./);

  // What was taken in is labelled, and its request still says it is unverified.
  const recorded = renderAdminCase(
    officeCase({
      requests: [openRequest({ status: "awaiting_verification" })],
      documents: [
        {
          id: "doc-1",
          requestId: "req-1",
          filename: "demo-mileage-record-2025.pdf",
          source: "staff_recorded",
          createdAt: "2026-09-12T13:00:00.000Z",
        },
      ],
    }),
    { person: SAM },
  );
  assert.match(
    recorded,
    /demo-mileage-record-2025\.pdf <small>staff-recorded · Received, not verified yet/,
  );
});

// ---------------------------------------------------------------------------
// Closure
// ---------------------------------------------------------------------------

test("closure is offered before approval only, and is confirmed in a dialog", () => {
  const html = renderAdminCase(officeCase(), { person: SAM });
  assert.match(html, /data-action="open-close-case"/);
  // The control opens a dialog; it is never itself a workflow action.
  assert.ok(!caseActions(html).includes("CLOSE_CASE"));
  assert.match(html, /in ViTally<\/strong>. It does not cancel, withdraw or amend/);

  for (const [stage, reason] of [
    ["review_approved", /An approved case is not closed from here\./],
    ["closed", /This case is already closed\./],
  ]) {
    const late = renderAdminCase(officeCase({ stage }), { person: SAM });
    assert.doesNotMatch(late, /data-action="open-close-case"/);
    assert.match(late, reason);
  }
  // A client's own draft is theirs.
  const clientDraft = renderAdminCase(
    officeCase({ stage: "draft", ownerUserId: "owner-1" }),
    { person: SAM },
  );
  assert.doesNotMatch(clientDraft, /data-action="open-close-case"/);
  assert.match(clientDraft, /A client&#39;s own draft is theirs to finish or leave\./);
  // An office draft nobody owns can be closed, as the database allows.
  const officeDraft = renderAdminCase(officeCase({ stage: "draft" }), { person: SAM });
  assert.match(officeDraft, /data-action="open-close-case"/);
  // Only the office may close.
  const forAlex = renderAdminCase(officeCase(), { person: ALEX });
  assert.doesNotMatch(forAlex, /data-action="open-close-case"/);
  assert.match(forAlex, /Needs office administrator access\./);
});

test("the close dialog asks for a reason and an explicit confirmation", () => {
  const html = closeCaseDialogBody({ savedCase: officeCase() });
  assert.match(html, /data-case-action="CLOSE_CASE"/);
  assert.match(html, /<textarea id="field-close-reason" name="reason" required/);
  assert.match(
    html,
    /<input type="checkbox" id="field-close-confirmed" name="confirmed" value="true" required>/,
  );
  assert.match(html, /does not cancel, withdraw or amend any return filed elsewhere/);
  assert.match(html, /cancelled/);
  assert.match(html, /data-action="close-dialog"/);
  // The confirmation is what the payload needs; a reason alone is refused.
  assert.throws(
    () => payloadFor("CLOSE_CASE", {}, { reason: "Client moved away" }),
    (error) => error.code === "VALIDATION",
  );
  assert.deepEqual(
    payloadFor("CLOSE_CASE", {}, { reason: "Client moved away", confirmed: "true" })
      .payload,
    { reason: "Client moved away", confirmed: true },
  );
});

// ---------------------------------------------------------------------------
// Screening, Form 8879 and e-filing
// ---------------------------------------------------------------------------

const CALLED = [
  { id: "r1", status: "approved", clientContactStatus: "completed", preparationVersion: 1 },
];
const WAITING = [
  { id: "r1", status: "approved", clientContactStatus: "pending", preparationVersion: 1 },
];

test("the intake checks wait for screening; the e-file marks wait for their stages", () => {
  const sam = { id: "p-sam", name: "Sam", capabilities: ["admin"] };
  const called = [{ status: "approved", clientContactStatus: "completed" }];
  const at = (stage, reviews = called, followups = []) =>
    adminEligibility({ caseRecord: { stage, ownerUserId: "u1", reviews, followups } }, sam);
  assert.equal(at("screening").verifyIntake.allowed, true);
  assert.equal(at("received").verifyIntake.allowed, false);
  assert.equal(at("review_approved").markReadyToEfile.allowed, true);
  assert.equal(at("ready_to_efile").markReadyToEfile.allowed, false);
  assert.equal(at("ready_to_efile").markEfiled.allowed, true);
  assert.equal(at("efiled").markEfiled.allowed, false);
  assert.equal(at("review_approved").markEfiled.allowed, false);
  // A list row has no reviews, only the summary a later task adds.
  const listRow = (status) =>
    adminEligibility(
      { caseRecord: { stage: "review_approved", ownerUserId: "u1", reviewContactStatus: status } },
      sam,
    ).markReadyToEfile.allowed;
  assert.equal(listRow("completed"), true);
  assert.equal(listRow("pending"), false);
  const waiting = at("review_approved", [
    { status: "approved", clientContactStatus: "pending" },
  ]).markReadyToEfile;
  assert.equal(waiting.allowed, false);
  assert.equal(
    waiting.reason,
    "The reviewer still needs to record the conversation with the client.",
  );
  // No review at all is not a completed call.
  assert.equal(at("review_approved", []).markReadyToEfile.allowed, false);
  // The latest approved review decides, not an earlier one.
  assert.equal(
    at("review_approved", [
      { status: "approved", clientContactStatus: "completed" },
      { status: "approved", clientContactStatus: "pending" },
    ]).markReadyToEfile.allowed,
    false,
  );
  // D13: then the office's go-over, until that task is resolved, whatever the outcome.
  const GO_OVER = "The office still needs to go over the return with the client.";
  const withTask = (task) => at("review_approved", called, [task]).markReadyToEfile;
  assert.equal(withTask({ purpose: "go_over_return", status: "open" }).reason, GO_OVER);
  assert.equal(withTask({ purpose: "request_documents", status: "open" }).allowed, true);
  for (const resolutionOutcome of ["reached", "no_further_contact"])
    assert.equal(
      withTask({ purpose: "go_over_return", status: "resolved", resolutionOutcome }).allowed,
      true,
      resolutionOutcome,
    );
  const overRow = (goOverOpen) =>
    adminEligibility(
      { caseRecord: { stage: "review_approved", ownerUserId: "u1", reviewContactStatus: "completed", goOverOpen } },
      sam,
    ).markReadyToEfile;
  assert.equal(overRow(true).reason, GO_OVER);
  assert.equal(overRow(false).allowed, true);
  // The reviewer's call stays first: a legacy pending call still gives its own sentence.
  assert.equal(
    at("review_approved", [{ status: "approved", clientContactStatus: "pending" }], [
      { purpose: "go_over_return", status: "open" },
    ]).markReadyToEfile.reason,
    "The reviewer still needs to record the conversation with the client.",
  );
  assert.equal(at("screening").closeCase.allowed, true);
  for (const stage of ["review_approved", "ready_to_efile", "efiled"]) {
    const refusal = at(stage).closeCase;
    assert.equal(refusal.allowed, false, stage);
    assert.equal(refusal.reason, "An approved case is not closed from here.", stage);
  }
  const alex = { id: "p-alex", name: "Alex", capabilities: ["prepare"] };
  assert.equal(
    adminEligibility({ caseRecord: { stage: "review_approved", reviews: called } }, alex)
      .markReadyToEfile.allowed,
    false,
  );
  assert.equal(
    adminEligibility({ caseRecord: { stage: "ready_to_efile" } }, alex).markEfiled.allowed,
    false,
  );
  assert.equal(
    adminEligibility({ caseRecord: { stage: "ready_to_efile" } }, null).markEfiled.allowed,
    false,
  );
});

test("the admin page: the intake form at screening, the marks at their stages", () => {
  const received = renderAdminCase(officeCase({ stage: "received", intakeVerified: false }), {
    person: SAM,
  });
  assert.ok(!caseActions(received).includes("VERIFY_INTAKE"));
  assert.match(received, /Screening starts when an admin opens the case\./);
  const screening = renderAdminCase(officeCase({ stage: "screening", intakeVerified: false }), {
    person: SAM,
  });
  assert.ok(caseActions(screening).includes("VERIFY_INTAKE"));

  const approved = renderAdminCase(officeCase({ stage: "review_approved", reviews: CALLED }), {
    person: SAM,
  });
  assert.match(
    approved,
    /<button[^>]*data-action="open-mark-ready-to-efile"[^>]*>[^]*?Mark ready to e-file…<\/button>/,
  );
  assert.doesNotMatch(approved, /data-action="open-mark-efiled"/);
  // The control opens a dialog; it is never itself a workflow action.
  assert.ok(!caseActions(approved).some((action) => action.startsWith("MARK_")));

  const signed = renderAdminCase(officeCase({ stage: "ready_to_efile", reviews: CALLED }), {
    person: SAM,
  });
  assert.match(
    signed,
    /<button[^>]*data-action="open-mark-efiled"[^>]*>[^]*?Mark e-filed…<\/button>/,
  );
  assert.doesNotMatch(signed, /data-action="open-mark-ready-to-efile"/);

  const pending = renderAdminCase(officeCase({ stage: "review_approved", reviews: WAITING }), {
    person: SAM,
  });
  assert.doesNotMatch(pending, /data-action="open-mark-ready-to-efile"/);
  assert.match(pending, /The reviewer still needs to record the conversation with the client\./);

  const filed = renderAdminCase(officeCase({ stage: "efiled", reviews: CALLED }), { person: SAM });
  assert.doesNotMatch(filed, /data-action="open-mark-/);
  // Only an admin is offered either mark.
  for (const person of [ALEX, MORGAN]) {
    const html = renderAdminCase(officeCase({ stage: "review_approved", reviews: CALLED }), {
      person,
    });
    assert.doesNotMatch(html, /data-action="open-mark-/);
    assert.match(html, /Needs office administrator access\./);
  }
});

test("a volunteer's case page never offers the e-file marks", () => {
  for (const stage of ["review_approved", "ready_to_efile"]) {
    for (const person of [ALEX, MORGAN]) {
      const html = renderStaffCase(officeCase({ stage, reviews: CALLED }), person);
      assert.doesNotMatch(html, /open-mark-ready-to-efile/, `${stage} ${person.name}`);
      assert.doesNotMatch(html, /open-mark-efiled/, `${stage} ${person.name}`);
      assert.doesNotMatch(html, /MARK_/, `${stage} ${person.name}`);
    }
  }
});

test("the e-file dialogs name the client and the application", () => {
  const state = {
    busy: false,
    savedCase: {
      reference: "VT-AAAA-BBBB",
      answers: { tp_first_name: "Mei", tp_last_name: "Chen" },
    },
  };
  const ready = markReadyToEfileDialogBody(state);
  assert.match(ready, /Mei Chen/);
  assert.match(ready, /VT-AAAA-BBBB/);
  assert.match(ready, /data-case-action="MARK_READY_TO_EFILE"/);
  assert.match(ready, /name="confirmed" value="true" required/);
  assert.match(ready, /signed Form 8879/);
  const filed = markEfiledDialogBody(state);
  assert.match(filed, /data-case-action="MARK_EFILED"/);
  assert.match(filed, /told their return was e-filed/);
  assert.match(
    markEfiledDialogBody({ savedCase: { reference: "VT-X", answers: {} } }),
    /this client/,
  );
  assert.match(markReadyToEfileDialogBody({}), /this case<\/strong> for <strong>this client/);
  assert.match(
    markEfiledDialogBody({ busy: true, savedCase: state.savedCase }),
    /data-case-action="MARK_EFILED" disabled/,
  );
  // Keeping it as it is sends nothing: the keep control is confirmBody's close
  // control and carries no case action.
  for (const html of [ready, filed]) {
    assert.match(html, /Keep it as it is/);
    assert.match(html, /data-action="close-dialog"/);
    assert.equal((html.match(/data-case-action=/g) ?? []).length, 1, "only the confirm button sends");
  }
});

// ---------------------------------------------------------------------------
// Refusals, escaping, and what nobody may do
// ---------------------------------------------------------------------------

test("a window with no persona is offered nothing at all", () => {
  const record = officeCase({
    requests: [openRequest()],
    followups: [openTask()],
  });
  const html = renderAdminCase(record, {});
  assert.deepEqual(caseActions(html), []);
  assert.doesNotMatch(html, /data-assistance-action/);
  assert.doesNotMatch(html, /data-action="open-close-case"/);
  assert.match(html, /Choose a volunteer persona to act as\./);
});

test("a persona without the office roles gets explanations, not office actions", () => {
  const record = officeCase({
    stage: "received",
    intakeVerified: false,
    preparerId: null,
    participants: [],
    requests: [openRequest()],
    followups: [openTask()],
  });
  const html = renderAdminCase(record, { person: MORGAN });
  for (const type of [
    "VERIFY_INTAKE",
    "REMIND",
    "CLOSE_CASE",
    "RESOLVE_FOLLOWUP",
    "RECORD_DOCUMENT_RESPONSE",
    "SAVE_ANSWERS",
  ])
    assert.ok(!caseActions(html).includes(type), type);
  assert.doesNotMatch(html, /data-assistance-action/);
  assert.doesNotMatch(html, linkedForm("task-1"));
  assert.match(html, /Needs office administrator access\./);
  assert.match(html, /Needs office follow-up access\./);
  assert.match(html, /Needs office document-receipt access\./);
});

test("notes, reasons and titles are escaped wherever they are shown", () => {
  const nasty = '<script>alert("x")</script>';
  const record = officeCase({
    requests: [openRequest({ title: nasty, message: nasty })],
    followups: [
      openTask({
        reason: nasty,
        status: "resolved",
        resolutionOutcome: "reached",
        resolutionNote: nasty,
      }),
    ],
    contacts: [contactEntry({ note: nasty, withWhom: "other", otherName: nasty })],
    documents: [
      {
        id: "doc-1",
        requestId: "req-1",
        filename: nasty,
        source: "staff_recorded",
        createdAt: "2026-09-12T13:00:00.000Z",
      },
    ],
  });
  const html = renderAdminCase(record, { person: SAM });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(closeCaseDialogBody({ savedCase: officeCase({ reference: nasty }) }), /<script>/);
});

// ---------------------------------------------------------------------------
// The eligibility helper on its own
// ---------------------------------------------------------------------------

test("adminEligibility answers about a target it was not given", () => {
  const none = adminEligibility({}, SAM);
  assert.equal(none.recordContact.allowed, false);
  assert.equal(none.recordContact.reason, "This task is no longer on screen.");
  assert.equal(none.claimAssistance.allowed, false);
  assert.equal(none.resolveAssistance.allowed, false);
  // Starting an assisted application needs no case at all.
  assert.equal(none.assistedIntake.allowed, true);
  // Every refusal carries a sentence; none is ever empty.
  for (const [name, decision] of Object.entries(adminEligibility({}, ALEX)))
    if (decision && typeof decision === "object" && decision.allowed === false)
      assert.ok(decision.reason.length > 10, name);
  // Recording an attempt and resolving are one rule, so they never disagree.
  const task = openTask();
  const rights = adminEligibility(
    { caseRecord: officeCase(), followup: task },
    SAM,
  );
  assert.deepEqual(rights.recordContact, rights.resolveFollowup);
  assert.equal(rights.recordContact.allowed, true);
});

// ---------------------------------------------------------------------------
// Routing: which workspace a persona gets (Ruling R55)
// ---------------------------------------------------------------------------

test("the persona decides which workspace a presenter is in", () => {
  const state = {
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    people: PEOPLE,
    selectedPersonId: "sam",
    cases: [boardCase()],
    assistance: [item({ assigneeId: "sam", status: "assigned" })],
    savedCase: null,
    screen: "staff",
    boardFilters: {},
    openPanels: [],
    draftAnswers: {},
    busy: false,
    error: null,
    retryable: false,
  };
  const office = staffScreen(state);
  assert.match(office, />OFFICE</);
  assert.match(office, /Office queue<\/h2>/);
  assert.match(office, /data-kind="help"/);
  // The helper is named, not shown as an id.
  assert.match(office, /Helper: Sam/);
  assert.doesNotMatch(office, /Work board<\/h2>/);

  // Anyone else keeps the preparation and review board.
  const preparer = staffScreen({ ...state, selectedPersonId: "alex" });
  assert.match(preparer, /VOLUNTEER WORKSPACE/);
  assert.match(preparer, /Work board<\/h2>/);
  assert.doesNotMatch(preparer, /Office queue/);

  // The same rule on one case.
  const onCase = {
    ...state,
    screen: "staff-case",
    savedCase: officeCase({ stage: "screening", intakeVerified: false }),
  };
  assert.match(staffScreen(onCase), /data-case-action="VERIFY_INTAKE"/);
  assert.doesNotMatch(
    staffScreen({ ...onCase, selectedPersonId: "alex" }),
    /data-case-action="VERIFY_INTAKE"/,
  );
  // And with no persona chosen at all, the preparation board, read-only.
  const none = staffScreen({ ...state, selectedPersonId: null });
  assert.match(none, /Work board<\/h2>/);
  assert.deepEqual(caseActions(none), []);
});

test("the close-case dialog is reachable from the shared modal frame", () => {
  const html = dialog({ dialog: "close-case", savedCase: officeCase(), busy: false });
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /Close this case\?/);
  assert.match(html, /data-case-action="CLOSE_CASE"/);
  assert.equal(dialog({ dialog: null }), "");
});

test("the office case page uses the same header and five tabs", () => {
  const html = renderAdminCase(officeCase(), { person: SAM, caseTab: "followup" });
  assert.match(html, /<h2 id="case-title" tabindex="-1">/);
  assert.match(html, /<ol class="lifecycle"/);
  assert.match(html, /id="case-tab-followup" aria-controls="case-panel-followup" aria-selected="true"/);
  assert.match(html, /id="case-panel-overview"[^>]*hidden>[\s\S]*How this case reached the office[\s\S]*Simulated intake checks[\s\S]*Case details/);
  // "Stage" used to appear twice on Overview: once in the origin section and
  // once in Case details. Only the Case details row is left.
  assert.equal((html.match(/<span>Stage<\/span>/g) ?? []).length, 1);
  assert.match(html, /id="case-panel-documents"[^>]*hidden>[\s\S]*<h2 id="documents-title">Documents<\/h2>/);
  assert.match(html, /id="case-panel-history"[^>]*hidden>[\s\S]*History/);
});

test("the office pool and the add-a-case page route by persona, and the sidebar follows", () => {
  const state = {
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    people: PEOPLE,
    selectedPersonId: "sam",
    cases: [boardCase()],
    assistance: [],
    savedCase: null,
    screen: "office-cases",
    boardFilters: {},
    openPanels: [],
    draftAnswers: {},
    busy: false,
    error: null,
    retryable: false,
  };
  const navItem = (html, label) =>
    html.match(new RegExp(`<button[^>]*>[^<]*(?:<svg.*?</svg>)?\\s*${label}</button>`))?.[0] ?? "";

  const pool = staffScreen(state);
  assert.match(pool, /Case pool/);
  assert.match(pool, /<h2 id="pool-title">All cases<\/h2>/);
  assert.match(navItem(pool, "All cases"), /aria-current="page"/);
  assert.doesNotMatch(navItem(pool, "Follow-ups"), /aria-current/);
  assert.match(navItem(pool, "Follow-ups"), /data-action="open-board"/);

  // A volunteer chosen while the pool is open gets the work board.
  const volunteer = staffScreen({ ...state, selectedPersonId: "alex" });
  assert.match(volunteer, /Work board<\/h2>/);
  assert.doesNotMatch(volunteer, /Case pool/);
  assert.match(navItem(volunteer, "Work board"), /aria-current="page"/);
  assert.doesNotMatch(volunteer, /All cases/);

  const adding = staffScreen({ ...state, screen: "office-add-case" });
  assert.match(adding, /Add a case<\/h1>/);
  assert.doesNotMatch(adding, /aria-current="page"/);
});

test("the staff sidebar nav holds nothing but its buttons", () => {
  const state = {
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    people: PEOPLE, selectedPersonId: "sam", cases: [], assistance: [],
    savedCase: null, screen: "staff", boardFilters: {}, openPanels: [],
    draftAnswers: {}, busy: false, error: null, retryable: false,
  };
  for (const selectedPersonId of ["sam", "alex"]) {
    const html = staffScreen({ ...state, selectedPersonId });
    const nav = html.match(/<nav class="sidebar-nav"[^>]*>(.*?)<\/nav>/s)[1];
    assert.equal(nav.replace(/<button[^>]*>.*?<\/button>/gs, "").trim(), "", selectedPersonId);
  }
});

test("the volunteer board searches client numbers in the workspace's current season", () => {
  const state = {
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    people: PEOPLE,
    selectedPersonId: "alex",
    workspace: { currentSeason: 2025 },
    cases: [
      boardCase({ id: "case-now", reference: "VT-NOWW-2025", clientNumber: 93, season: 2025 }),
      boardCase({ id: "case-then", reference: "VT-THEN-2024", clientNumber: 93, season: 2024 }),
    ],
    assistance: [],
    savedCase: null,
    screen: "staff",
    boardFilters: { search: "093" },
    openPanels: [],
    draftAnswers: {},
    busy: false,
    error: null,
    retryable: false,
  };
  const html = staffScreen(state);
  assert.match(html, /Search results<\/h2>/);
  assert.match(html, /VT-NOWW-2025/);
  assert.doesNotMatch(html, /VT-THEN-2024/);
});

// ---------------------------------------------------------------------------
// Part 4c, Task 1: the answers, contact and materials cards on the office page.
// ---------------------------------------------------------------------------

const intakeTab = (html) =>
  html.match(
    /<div role="tabpanel" id="case-panel-intake"[^>]*>([\s\S]*?)<div role="tabpanel" id="case-panel-documents"/,
  )[1];

test("a submitted version-2 case shows the answers, the contact card and the materials card on the office page", () => {
  const sample = makeSampleAnswers({ seed: 2 });
  const answers = Object.fromEntries(
    Object.entries(sample).filter(([id]) => !Object.hasOwn(CONTACT_FIELDS, id)),
  );
  const record = officeCase({
    stage: "received",
    intakeVersion: 2,
    answers,
    contact: { phone: sample.tp_phone, bestContactTime: ["weekend"], bestContactNote: null },
    materials: [{ item: "photo_id", receivedAt: "2026-09-14T15:00:00.000Z", recordedByPersonId: "sam" }],
  });
  const tab = intakeTab(renderAdminCase(record, { person: SAM }));
  const at = (text) => tab.indexOf(text);
  assert.ok(at("Wording used: Standard") >= 0);
  assert.ok(at("Wording used") < at('class="panel contact-card"'));
  assert.ok(at('class="panel contact-card"') < at('class="panel materials-card"'));
  assert.match(tab, /<span class="phone-mask" id="contact-phone" tabindex="0">/);
  assert.match(tab, /<span class="phone-full">\(215\) 555-01\d\d<\/span>/);
  assert.doesNotMatch(tab.replace(/<svg[\s\S]*?<\/svg>/g, ""), /="[^"]*555-01/, "no attribute carries the number");
  assert.match(tab, /Weekends/);
  assert.match(tab, /data-action="toggle-edit-contact"/);
  assert.match(tab, /Recorded by Sam ·/);
  assert.match(tab, /data-case-action="RECORD_MATERIALS"/);
  // The form opens from the panel list the page is given.
  const open = intakeTab(renderAdminCase(record, { person: SAM, openPanels: ["edit-contact"] }));
  assert.match(open, /id="contact-form"/);
});

// ---------------------------------------------------------------------------
// Part 4c, Task 2: the document checklist on the office page.
// ---------------------------------------------------------------------------

test("the office page's Documents tab starts with the checklist for a submitted version-2 case", () => {
  const sample = makeSampleAnswers({ seed: 2 });
  const answers = Object.fromEntries(
    Object.entries(sample).filter(([id]) => !Object.hasOwn(CONTACT_FIELDS, id)),
  );
  const record = officeCase({
    stage: "received",
    intakeVersion: 2,
    answers,
    contact: { phone: sample.tp_phone, bestContactTime: [], bestContactNote: null },
    materials: [],
    documentCards: [],
  });
  const html = renderAdminCase(record, { person: SAM });
  const tab = html.match(
    /id="case-panel-documents"[^>]*>([\s\S]*?)<div role="tabpanel" id="case-panel-followup"/,
  )[1];
  assert.ok(tab.startsWith('<section class="panel doc-checklist"'));
  assert.ok(tab.indexOf("doc-checklist") < tab.indexOf('id="documents-title"'));
  assert.match(tab, /data-action="mark-card"/, "Sam works every case: the marks show");
  // Alex does not prepare this one: the office page offers him no marks.
  const forAlex = renderAdminCase({ ...record, preparerId: "someone-else" }, { person: ALEX });
  assert.doesNotMatch(forAlex, /data-action="mark-card"/);
});

// ---------------------------------------------------------------------------
// Part 4c, Task 4: an office draft continues in Add a case.
// ---------------------------------------------------------------------------

test("an office draft continues in Add a case, and a client's own case is read-only", () => {
  const record = officeCase({
    stage: "draft",
    intakeVerified: false,
    intakeVersion: 2,
    answers: { tp_first_name: "Mei" },
    contact: null,
    materials: [],
    documentCards: [],
  });
  const html = renderAdminCase(record, { person: SAM });
  const overview = html.match(/id="case-panel-overview"[^>]*>([\s\S]*?)<div role="tabpanel" id="case-panel-intake"/)[1];
  assert.match(overview, /<span>How it started<\/span><strong>Assisted \(staff-entered\)/);
  assert.match(overview, /<span>Client account<\/span><strong>No client account/);
  assert.match(overview, /This walk-in client&#39;s answers are entered in Add a case\./);
  assert.match(overview, /<button type="button" class="btn primary" data-action="continue-add-case" data-case-id="case-a"[^>]*>[\s\S]*?Continue in Add a case<\/button>/);
  assert.doesNotMatch(html, /assisted-answers-form/);
  assert.doesNotMatch(html, /data-case-action="SAVE_ANSWERS"/);
  // The Intake answers tab holds the answers, contact and materials cards.
  const tab = intakeTab(html);
  assert.match(tab, /Wording used/);
  assert.match(tab, /class="panel contact-card"/);
  assert.match(tab, /class="panel materials-card"/);
  assert.doesNotMatch(tab, /filling in this walk-in client/);
  // Somebody without the office right is told why, with no way in.
  const forAlex = renderAdminCase(record, { person: ALEX });
  assert.doesNotMatch(forAlex, /data-action="continue-add-case"/);

  // A client's own case is never edited here: the summary is read-only.
  const owned = renderAdminCase(officeCase({ ownerUserId: "owner-1", intakeVersion: 2 }), { person: SAM });
  assert.doesNotMatch(owned, /data-case-action="SAVE_ANSWERS"/);
  assert.doesNotMatch(owned, /continue-add-case/);
  assert.match(owned, /<span>How it started<\/span><strong>The client&#39;s own application/);
  assert.match(owned, /What the client told us/);
});
