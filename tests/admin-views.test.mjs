import test from "node:test";
import assert from "node:assert/strict";
import {
  renderAdminCase,
  renderAdminBoard,
  closeCaseDialogBody,
  adminEligibility,
  ASSISTED_ANSWERS_FORM_ID,
} from "../src/admin-views.mjs";
import { decorateStaffCase } from "../src/staff-views.mjs";
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
  attempts: [],
  ...overrides,
});

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
// The board
// ---------------------------------------------------------------------------

test("the board counts what each of its sections is showing", () => {
  const cases = [
    boardCase(),
    boardCase({
      id: "case-2",
      reference: "VT-BBBB-2222",
      stage: "review_ready",
      preparerId: "alex",
      answers: { service: "Drop-off", language: "Cantonese" },
    }),
    boardCase({
      id: "case-3",
      reference: "VT-CCCC-3333",
      stage: "preparing",
      preparerId: "alex",
      followups: [openTask({ id: "task-3" })],
      requests: [openRequest()],
    }),
    boardCase({
      id: "case-4",
      reference: "VT-DDDD-4444",
      stage: "closed",
      followups: [openTask({ id: "task-4", status: "resolved" })],
    }),
  ].map((record) => decorateStaffCase(record, PEOPLE));
  const html = renderAdminBoard(cases, [item(), item({ id: "item-2", status: "resolved" })], {
    person: SAM,
  });
  // Two cases are unclaimed work, one is waiting for a call, one assistance
  // request is unclaimed. Every number is derived from the records on screen.
  assert.match(
    html,
    /2 waiting to be claimed, 1 waiting for a call, 1 assistance request unclaimed/,
  );
  assert.match(html, /Available work<\/h2><span class="muted small">Waiting: 2/);
  assert.match(html, /Follow-up needed<\/h2><span class="muted small">Cases: 1/);
  assert.match(html, /Assistance requests<\/h2><span class="muted small">Requests: 2/);
  // The resolved task's case is not waiting for a call.
  assert.doesNotMatch(html, /VT-DDDD-4444/);
  // A case waiting for a call shows the language and the recorded preference.
  assert.match(html, /VT-CCCC-3333[^]*Prefers calls from the main office/);
  assert.match(html, /No taxpayer name/i);
  for (const forbidden of ["Mei", "19107", "Sample address"])
    assert.doesNotMatch(html, new RegExp(forbidden));
});

test("the language filter is the board's one stored choice", () => {
  const cases = [
    boardCase(),
    boardCase({
      id: "case-2",
      reference: "VT-BBBB-2222",
      answers: { service: "Drop-off", language: "Cantonese" },
    }),
  ];
  const all = renderAdminBoard(cases, [], { person: SAM });
  assert.match(all, /VT-AAAA-1111/);
  assert.match(all, /VT-BBBB-2222/);
  const one = renderAdminBoard(cases, [], {
    person: SAM,
    filters: { language: "Cantonese" },
  });
  assert.doesNotMatch(one, /VT-AAAA-1111/);
  assert.match(one, /VT-BBBB-2222/);
  // The chips use the work board's own filter action and key, not a second one.
  assert.match(
    one,
    /data-action="set-board-filter" data-filter="language" data-value="Cantonese" aria-pressed="true"/,
  );
});

test("a reminder is offered on available work only, and says what it did not do", () => {
  const waiting = boardCase();
  const claimed = boardCase({
    id: "case-2",
    reference: "VT-BBBB-2222",
    stage: "preparing",
    preparerId: "alex",
  });
  const html = renderAdminBoard([waiting, claimed], [], { person: SAM });
  assert.match(html, /data-case-action="REMIND" data-case-id="case-1"/);
  assert.doesNotMatch(html, /data-case-action="REMIND" data-case-id="case-2"/);
  // The claimed case is not even in the available section.
  assert.doesNotMatch(html, /VT-BBBB-2222/);
  // Ineligible personas see the reason rather than a missing button.
  const forAlex = renderAdminBoard([waiting], [], { person: ALEX });
  assert.doesNotMatch(forAlex, /data-case-action="REMIND"/);
  assert.match(forAlex, /Needs office administrator access\./);
  // "Recently reminded" is derived from the record, so it can only appear once
  // a reminder really landed.
  assert.doesNotMatch(html, /Reminder recorded\./);
  const reminded = renderAdminBoard(
    [
      decorateStaffCase(
        {
          ...waiting,
          lastRemindedAt: "2026-09-13T09:00:00.000Z",
          lastRemindedByPersonId: "sam",
        },
        PEOPLE,
      ),
    ],
    [],
    { person: SAM },
  );
  assert.match(reminded, /Reminder recorded\. No external message sent\./);
  assert.match(reminded, /Last reminded [^<]*by Sam/);
});

test("the assisted intake entry point opens a form that creates nothing by itself", () => {
  const closed = renderAdminBoard([], [], { person: SAM });
  assert.match(closed, /data-action="toggle-assisted-intake"/);
  assert.doesNotMatch(closed, /id="assisted-intake-form"/);
  const open = renderAdminBoard([], [], {
    person: SAM,
    openPanels: ["assisted-intake"],
  });
  assert.match(open, /<form id="assisted-intake-form" class="staff-form">/);
  assert.match(open, /data-action="fill-assisted-intake"/);
  // Every intake answer has a labelled box, with the client's own wording.
  for (const [name, label] of [
    ["service", "Service"],
    ["language", "Preferred language"],
    ["firstName", "First name"],
    ["household", "People in your household"],
  ]) {
    assert.match(open, new RegExp(`for="field-assisted-${name}"`));
    assert.match(open, new RegExp(`<span>${label}</span>`));
  }
  // It is a plain form submit: creating a case is not a case action, and no
  // workflow or assistance action is dispatched from here.
  assert.deepEqual(caseActions(open), []);
  assert.doesNotMatch(open, /data-assistance-action/);
  assert.match(open, /no client account/i);
  // A persona without the office role is told why, not shown the form.
  const forMorgan = renderAdminBoard([], [], {
    person: MORGAN,
    openPanels: ["assisted-intake"],
  });
  assert.doesNotMatch(forMorgan, /id="assisted-intake-form"/);
  assert.match(forMorgan, /Needs office administrator access\./);
});

// ---------------------------------------------------------------------------
// Assistance
// ---------------------------------------------------------------------------

test("assistance cards offer the one action their status allows", () => {
  const items = [
    item(),
    item({ id: "item-2", status: "assigned", assigneeId: "sam", assigneeName: "Sam" }),
    item({
      id: "item-3",
      status: "resolved",
      assigneeId: "sam",
      assigneeName: "Sam",
      resolutionNote: "Walked through the form at the desk.",
    }),
  ];
  const html = renderAdminBoard([], items, { person: SAM });
  assert.match(html, /data-assistance-action="CLAIM" data-item-id="item-1"/);
  assert.doesNotMatch(html, /data-assistance-action="RESOLVE" data-item-id="item-1"/);
  assert.match(html, /data-assistance-action="RESOLVE" data-item-id="item-2"/);
  assert.doesNotMatch(html, /data-assistance-action="CLAIM" data-item-id="item-2"/);
  // Resolving carries a note; claiming carries none.
  assert.match(html, /for="field-assist-item-2-note"/);
  assert.doesNotMatch(html, /for="field-assist-item-1-note"/);
  // A resolved item offers nothing and shows what was done.
  assert.doesNotMatch(html, /data-assistance-action="[A-Z]+" data-item-id="item-3"/);
  assert.match(html, /Walked through the form at the desk\./);
  assert.match(html, /Waiting for a helper/);
  assert.match(html, /Being helped/);
  // Assistance is not case work: the card says so.
  assert.match(html, /resolving a request changes nothing about the case/i);
});

test("an assistance item somebody else holds is refused, with the reason", () => {
  const held = item({
    id: "item-2",
    status: "assigned",
    assigneeId: "sam",
    assigneeName: "Sam",
  });
  const helper = { id: "casey", name: "Casey", capabilities: ["assist"] };
  const html = renderAdminBoard([], [held], { person: helper });
  assert.doesNotMatch(html, /data-assistance-action/);
  assert.match(html, /Only the helper holding this request resolves it\./);
  // No assistance capability at all is a different, earlier refusal.
  const forAlex = renderAdminBoard([], [item()], { person: ALEX });
  assert.doesNotMatch(forAlex, /data-assistance-action/);
  assert.match(forAlex, /Needs client assistance access\./);
});

test("a linked case is shown as a case, never as an assistance status", () => {
  const linked = boardCase({ id: "case-9", reference: "VT-ZZZZ-9999", stage: "preparing" });
  const html = renderAdminBoard([linked], [item({ caseId: "case-9" })], {
    person: SAM,
  });
  assert.match(
    html,
    /<span>Linked case<\/span><strong><button class="board-reference" data-action="open-case" data-case-id="case-9">VT-ZZZZ-9999/,
  );
  // The case keeps its own stage label and the item keeps its own status word.
  assert.match(html, new RegExp(`VT-ZZZZ-9999[^]*${describeStage("preparing").label}`));
  assert.doesNotMatch(html, /VT-ZZZZ-9999[^]*<\/strong>[^]*Waiting for a helper<\/span>/);
  // An item with no case says so rather than inventing one.
  const unlinked = renderAdminBoard([linked], [item()], { person: SAM });
  assert.match(unlinked, /<span>Linked case<\/span><strong>Not linked to a case/);
});

// ---------------------------------------------------------------------------
// Intake checks
// ---------------------------------------------------------------------------

test("the intake checks are offered once, as four simulated attestations", () => {
  const arrived = officeCase({ stage: "received", intakeVerified: false });
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
  assert.equal((all.match(/checked/g) ?? []).length, 4);
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
  // And it is an office action: a preparer sees the reason, not the form.
  const forAlex = renderAdminCase(arrived, { person: ALEX });
  assert.doesNotMatch(forAlex, /data-case-action="VERIFY_INTAKE"/);
  assert.match(forAlex, /Needs office administrator access\./);
});

// ---------------------------------------------------------------------------
// Follow-up
// ---------------------------------------------------------------------------

test("the assignee records attempts and resolves separately, and nobody else can", () => {
  const record = officeCase({
    requests: [openRequest()],
    followups: [
      openTask({
        attempts: [
          {
            id: "att-1",
            outcome: "no_answer",
            note: "Rang twice, no voicemail.",
            actorPersonId: "sam",
            createdAt: "2026-09-12T12:00:00.000Z",
          },
        ],
      }),
    ],
  });
  const html = renderAdminCase(record, { person: SAM });
  assert.match(html, /data-case-action="RECORD_CONTACT" data-followup-id="task-1"/);
  assert.match(html, /data-case-action="RESOLVE_FOLLOWUP" data-followup-id="task-1"/);
  // The request the task is about, its reason and the assignee the server chose.
  assert.match(html, /<h3>Mileage record<\/h3>/);
  assert.match(html, /No answer on the number we have\./);
  assert.match(html, /<span>Assigned to<\/span><strong>Sam<\/strong>/);
  // The attempt list carries the outcome, the note, the person and the time.
  assert.match(html, /No answer · Sam · [^<]*<small>Rang twice, no voicemail\.<\/small>/);
  // Four outcomes for an attempt, two for a resolution, with per-task ids so
  // two tasks can never share a box.
  for (const value of ["no_answer", "reached", "no_further_contact", "closure_requested"])
    assert.match(html, new RegExp(`id="field-contact-task-1-outcome"[^]*value="${value}"`));
  const resolveForm = html.slice(html.indexOf('id="field-resolve-task-1-outcome"'));
  const resolveOptions = [...resolveForm.matchAll(/<option value="([a-z_]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(resolveOptions.slice(0, 2), ["reached", "no_further_contact"]);
  assert.ok(!resolveOptions.includes("no_answer"));
  assert.ok(!resolveOptions.includes("closure_requested"));
  // The two steps say plainly that they are two steps.
  assert.match(html, /Recording an attempt never resolves the task/);
  assert.match(html, /does not verify a document, change the preparer, or close the case/);
  // There is no way to hand the task to somebody else.
  assert.doesNotMatch(html, /name="assignee/i);
  assert.match(html, /no way to hand it to someone else/i);

  // Both directions of the rule (Ruling R53).
  const forAlex = renderAdminCase(record, { person: ALEX });
  assert.doesNotMatch(forAlex, /data-case-action="RECORD_CONTACT"/);
  assert.doesNotMatch(forAlex, /data-case-action="RESOLVE_FOLLOWUP"/);
  assert.match(forAlex, /Needs office follow-up access\./);
  // Holding the capability is still not holding the task.
  const forMorgan = renderAdminCase(record, { person: MORGAN_FOLLOWUP });
  assert.doesNotMatch(forMorgan, /data-case-action="RECORD_CONTACT"/);
  assert.match(forMorgan, /The office assigned this task to someone else\./);
  assert.doesNotMatch(forMorgan, /Needs office follow-up access\./);
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
    "field-contact-task-1-outcome",
    "field-contact-task-1-note",
    "field-resolve-task-1-outcome",
    "field-resolve-task-1-note",
    "field-contact-task-2-outcome",
    "field-contact-task-2-note",
    "field-resolve-task-2-outcome",
    "field-resolve-task-2-note",
  ]) {
    assert.equal(
      (html.match(new RegExp(`id="${id}"`, "g")) ?? []).length,
      1,
      id,
    );
    assert.match(html, new RegExp(`<label class="field" for="${id}">`));
  }
  // Each form names its own task on the button and in its hidden field.
  for (const type of ["RECORD_CONTACT", "RESOLVE_FOLLOWUP"])
    for (const taskId of ["task-1", "task-2"])
      assert.match(
        html,
        new RegExp(`data-case-action="${type}" data-followup-id="${taskId}"`),
      );
  assert.equal(
    (html.match(/<input type="hidden" name="followupId" value="task-2">/g) ?? [])
      .length,
    2,
    "one hidden id per form, and both belong to the second task",
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
  assert.doesNotMatch(html, /data-case-action="RECORD_CONTACT"/);
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
  assert.match(html, /data-case-action="RECORD_CONTACT"/);
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
// Assisted intake, on the case
// ---------------------------------------------------------------------------

test("an office draft is editable and submitted from the case, a client's is not", () => {
  const draft = officeCase({
    stage: "draft",
    intakeVerified: false,
    answers: {},
    requests: [],
  });
  const html = renderAdminCase(draft, { person: SAM });
  assert.match(html, /<span>How it started<\/span><strong>Assisted \(staff-entered\)/);
  assert.match(html, /<span>Client account<\/span><strong>No client account/);
  assert.match(html, /data-case-action="SAVE_ANSWERS"/);
  assert.match(html, /data-case-action="SUBMIT"/);
  // The id the input and change listeners look for: without it a typed answer
  // reaches no draft and the next render throws it away (`app.mjs`,
  // `ANSWER_FORMS`). The panel and the wiring layer share the one constant.
  assert.equal(ASSISTED_ANSWERS_FORM_ID, "assisted-answers-form");
  assert.match(html, /<form id="assisted-answers-form" class="staff-form">/);
  // Nothing can be sent before the saved answers are complete and checked.
  assert.match(html, /data-case-action="SUBMIT" data-role="assisted-submit" disabled>/);
  assert.match(html, /Some answers are still missing\. Fill them in and save first\./);
  assert.match(html, /It is not a signature on a tax or consent form\./);
  // Nothing to say yet, but the notice is already there for the wiring layer
  // to reveal without rebuilding the page under the cursor.
  assert.match(html, /data-role="assisted-unsaved" hidden>/);
  // Every box renders from the draft, so what was typed survives a re-render —
  // and the draft wins over the saved answer it differs from.
  const typing = renderAdminCase(
    officeCase({
      stage: "draft",
      intakeVerified: false,
      answers: { firstName: "Mei", language: "English" },
      requests: [],
    }),
    {
      person: SAM,
      dirty: true,
      draftAnswers: { firstName: "Mei-Ling", language: "Cantonese" },
    },
  );
  assert.match(typing, /id="field-assisted-firstName"[^>]*value="Mei-Ling"/);
  assert.doesNotMatch(typing, /id="field-assisted-firstName"[^>]*value="Mei"/);
  assert.match(
    typing,
    /<option value="Cantonese" selected>/,
    "a select renders the draft's choice too",
  );
  // Unsaved edits are named as their own reason and lock the send button,
  // because saving them is the step that changes the answer the office checks.
  assert.match(typing, /data-role="assisted-unsaved" >/);
  assert.doesNotMatch(typing, /data-role="assisted-unsaved" hidden>/);
  assert.match(typing, /These edits are not saved yet\./);
  assert.match(typing, /data-case-action="SUBMIT" data-role="assisted-submit" disabled>/);
  // A refusal outside the service scope says what it is, and what it is not.
  const outside = renderAdminCase(
    officeCase({
      stage: "draft",
      intakeVerified: false,
      answers: {
        service: "Drop-off",
        year: "2025",
        language: "English",
        residenceCity: "Philadelphia",
        residenceState: "PA",
        firstName: "Mei",
        lastName: "Chen",
        address: "Sample address withheld",
        city: "Philadelphia",
        state: "PA",
        zip: "19107",
        household: "1",
        helper: "self",
        documents: "ready",
        rideshare: "no",
        other: "yes",
        stocks: "no",
      },
    }),
    { person: SAM },
  );
  assert.match(outside, /outside PCDC&#39;s current service scope/);
  assert.match(outside, /not a judgement about anyone&#39;s taxes/);
  assert.match(
    outside,
    /data-case-action="SUBMIT" data-role="assisted-submit" disabled>/,
  );

  // A client's own case is never edited here: the summary is read-only.
  const owned = renderAdminCase(officeCase({ ownerUserId: "owner-1" }), { person: SAM });
  assert.doesNotMatch(owned, /data-case-action="SAVE_ANSWERS"/);
  assert.match(owned, /<span>How it started<\/span><strong>The client&#39;s own application/);
  assert.match(owned, /What the client told us/);
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
  const board = renderAdminBoard([boardCase()], [item()], {});
  assert.deepEqual(caseActions(board), []);
  assert.doesNotMatch(board, /data-assistance-action/);
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
    "RECORD_CONTACT",
    "RESOLVE_FOLLOWUP",
    "RECORD_DOCUMENT_RESPONSE",
    "SAVE_ANSWERS",
  ])
    assert.ok(!caseActions(html).includes(type), type);
  assert.doesNotMatch(html, /data-assistance-action/);
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
        attempts: [
          {
            id: "att-1",
            outcome: "no_answer",
            note: nasty,
            actorPersonId: "sam",
            createdAt: "2026-09-12T12:00:00.000Z",
          },
        ],
      }),
    ],
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
  const board = renderAdminBoard(
    [boardCase({ followups: [openTask({ reason: nasty })], answers: { language: nasty } })],
    [item({ title: nasty, contactPreference: nasty, resolutionNote: nasty })],
    { person: SAM },
  );
  assert.doesNotMatch(board, /<script>/);
  assert.match(board, /&lt;script&gt;/);
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
  assert.match(office, /OFFICE WORKSPACE/);
  assert.match(office, /Office work<\/h2>/);
  assert.match(office, /Assistance requests/);
  // The helper is named, not shown as an id.
  assert.match(office, /<span>Helper<\/span><strong>Sam<\/strong>/);
  assert.doesNotMatch(office, /Work board<\/h2>/);

  // Anyone else keeps the preparation and review board.
  const preparer = staffScreen({ ...state, selectedPersonId: "alex" });
  assert.match(preparer, /VOLUNTEER WORKSPACE/);
  assert.match(preparer, /Work board<\/h2>/);
  assert.doesNotMatch(preparer, /Assistance requests/);

  // The same rule on one case.
  const onCase = {
    ...state,
    screen: "staff-case",
    savedCase: officeCase({ stage: "received", intakeVerified: false }),
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
