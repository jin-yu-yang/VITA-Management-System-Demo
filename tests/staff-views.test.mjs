import test from "node:test";
import assert from "node:assert/strict";
import {
  renderStaffCase,
  renderStaffBoard,
  decorateStaffCase,
  staffEligibility,
  isAvailableWork,
  filterCases,
  boardCounts,
  DEFAULT_BOARD_FILTERS,
} from "../src/staff-views.mjs";
import { describeStage } from "../src/domain.mjs";

// The staff screens are pure functions of one record and one persona, so these
// tests operate on the HTML string itself. No DOM library, and nothing here may
// reach a store.

// ---------------------------------------------------------------------------
// The task brief's test, verbatim.
// ---------------------------------------------------------------------------
test('preparer cannot obtain a self-review action', () => {
  const html = renderStaffCase({stage:'review_ready', preparerId:'alex',
    participants:['alex'], requests:[], reviews:[], history:[]},
    {id:'alex',name:'Alex',capabilities:['prepare','review']});
  assert.match(html, /prepared this case/i);
  assert.doesNotMatch(html, /data-case-action="CLAIM_REVIEW"/);
  const eligible = renderStaffCase({stage:'review_ready',preparerId:'alex',
    participants:['alex'],requests:[],reviews:[],history:[]},
    {id:'morgan',name:'Morgan',capabilities:['review']});
  assert.match(eligible, /data-case-action="CLAIM_REVIEW"/);
});

// ---------------------------------------------------------------------------

const ALEX = { id: "alex", name: "Alex", capabilities: ["prepare"] };
const MORGAN = { id: "morgan", name: "Morgan", capabilities: ["review"] };
const SAM = {
  id: "sam",
  name: "Sam",
  capabilities: ["admin", "assist", "followup", "receive_documents"],
};
const PEOPLE = [ALEX, MORGAN, SAM];

const staffCase = (overrides = {}) =>
  decorateStaffCase(
    {
      id: "case-a",
      reference: "VT-AB2C-DE3F",
      workspaceId: "w1",
      ownerUserId: "owner-1",
      fixture: false,
      stage: "preparing",
      revision: 5,
      preparationVersion: 0,
      answers: {
        service: "Drop-off",
        language: "Cantonese",
        firstName: "Mei",
        lastName: "Chen",
        residenceCity: "Philadelphia",
        household: "3",
      },
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

// A board row is what `listCases` returns: the Case scalars, nothing related.
const boardCase = (overrides = {}) =>
  decorateStaffCase(
    {
      id: "case-1",
      reference: "VT-AAAA-1111",
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

const BOARD = [
  boardCase(),
  boardCase({
    id: "case-2",
    reference: "VT-BBBB-2222",
    stage: "preparing",
    preparerId: "alex",
    answers: { service: "Same-day", language: "Cantonese" },
  }),
  boardCase({
    id: "case-3",
    reference: "VT-CCCC-3333",
    stage: "review_ready",
    preparationVersion: 1,
    preparerId: "alex",
    answers: { service: "Drop-off", language: "Cantonese" },
  }),
  boardCase({
    id: "case-4",
    reference: "VT-DDDD-4444",
    stage: "reviewing",
    preparationVersion: 1,
    preparerId: "alex",
    reviewerId: "morgan",
    answers: { service: "Online", language: "English" },
    lastRemindedAt: "2026-09-11T14:00:00.000Z",
    lastRemindedByPersonId: "sam",
  }),
  boardCase({
    id: "case-5",
    reference: "VT-EEEE-5555",
    stage: "closed",
    preparationVersion: 2,
    preparerId: "alex",
    reviewerId: "morgan",
    answers: { service: "Online", language: "Mandarin" },
  }),
];

const board = (ui = {}) => renderStaffBoard(BOARD, PEOPLE, ui);
const shows = (html, reference) => html.includes(reference);

test("names come from the roster, and only the sections the record carries", () => {
  const decorated = decorateStaffCase(
    {
      id: "case-a",
      preparerId: "alex",
      reviewerId: "nobody-here",
      lastRemindedByPersonId: "sam",
      participants: ["alex", "casey"],
      followups: [
        {
          id: "task-1",
          assigneeId: "sam",
          attempts: [{ id: "a1", actorPersonId: "sam", outcome: "no_answer" }],
        },
      ],
      reviews: [{ id: "r1", reviewerId: "morgan" }],
    },
    PEOPLE,
  );
  assert.equal(decorated.preparerName, "Alex");
  assert.equal(decorated.reviewerName, "Unknown person", "an id nobody matches");
  assert.equal(decorated.lastRemindedByName, "Sam");
  assert.deepEqual(decorated.participantNames, ["Alex", "Unknown person"]);
  assert.equal(decorated.followups[0].assigneeName, "Sam");
  assert.equal(decorated.followups[0].attempts[0].actorName, "Sam");
  assert.equal(decorated.reviews[0].reviewerName, "Morgan");
  // The ids are still there: names are added, nothing is replaced.
  assert.equal(decorated.preparerId, "alex");

  // An unassigned case has no name to attach, and a list row gains no staff
  // section it did not have.
  const row = decorateStaffCase({ id: "case-b", preparerId: null }, PEOPLE);
  assert.equal(row.preparerName, null);
  assert.deepEqual(row.participantNames, []);
  assert.ok(!("followups" in row), "no follow-ups are invented");
  assert.ok(!("reviews" in row), "no reviews are invented");
  // An empty roster still renders something a person can read.
  assert.equal(decorateStaffCase({ preparerId: "alex" }).preparerName, "Unknown person");
});

test("available work is exactly the two unclaimed states", () => {
  assert.equal(isAvailableWork({ stage: "preparation_ready", preparerId: null }), true);
  assert.equal(isAvailableWork({ stage: "review_ready", reviewerId: null }), true);
  assert.equal(isAvailableWork({ stage: "preparation_ready", preparerId: "alex" }), false);
  assert.equal(isAvailableWork({ stage: "review_ready", reviewerId: "morgan" }), false);
  for (const stage of [
    "draft",
    "received",
    "preparing",
    "reviewing",
    "corrections_required",
    "review_approved",
    "closed",
  ])
    assert.equal(isAvailableWork({ stage }), false, stage);
  // The board says so on the row itself, next to the stage badge.
  const html = board({ person: ALEX });
  assert.match(html, /VT-AAAA-1111[\s\S]{0,400}Available/);
});

test("the board filters on four axes and counts what it shows", () => {
  const all = board({ person: ALEX });
  assert.match(all, /Showing 5 of 5 cases/);
  for (const reference of ["VT-AAAA-1111", "VT-EEEE-5555"]) assert.ok(shows(all, reference));
  assert.match(
    all,
    /In this view: 2 available, 4 mine, 2 in progress, 2 waiting, 1 done, 1 reminded\./,
  );

  const available = board({ person: ALEX, filters: { status: "available" } });
  assert.match(available, /Showing 2 of 5 cases/);
  assert.ok(shows(available, "VT-AAAA-1111"));
  assert.ok(shows(available, "VT-CCCC-3333"));
  assert.ok(!shows(available, "VT-BBBB-2222"));
  assert.match(available, /In this view: 2 available, 1 mine, 0 in progress/);

  const morgansOwn = board({ person: MORGAN, filters: { status: "mine" } });
  assert.match(morgansOwn, /Showing 2 of 5 cases/);
  assert.ok(shows(morgansOwn, "VT-DDDD-4444"));
  assert.ok(shows(morgansOwn, "VT-EEEE-5555"));
  assert.ok(!shows(morgansOwn, "VT-AAAA-1111"));

  const unassigned = board({ person: ALEX, filters: { assignment: "unassigned" } });
  assert.match(unassigned, /Showing 1 of 5 cases/);
  assert.ok(shows(unassigned, "VT-AAAA-1111"));

  const cantonese = board({ person: ALEX, filters: { language: "Cantonese" } });
  assert.match(cantonese, /Showing 2 of 5 cases/);
  assert.ok(shows(cantonese, "VT-BBBB-2222"));
  assert.ok(!shows(cantonese, "VT-AAAA-1111"));

  const dropOff = board({
    person: ALEX,
    filters: { service: "Drop-off", language: "Cantonese" },
  });
  assert.match(dropOff, /Showing 1 of 5 cases/);
  assert.ok(shows(dropOff, "VT-CCCC-3333"));

  // Nothing left is said plainly, with a way back.
  const nothing = board({ person: ALEX, filters: { status: "done", language: "Cantonese" } });
  assert.match(nothing, /Nothing matches these filters/);
  assert.match(nothing, /data-action="clear-board-filters"/);

  // The chosen filter is the pressed one, and the options come from the records.
  assert.match(
    all,
    /data-action="set-board-filter" data-filter="status" data-value="all" aria-pressed="true"/,
  );
  assert.match(
    available,
    /data-action="set-board-filter" data-filter="status" data-value="available" aria-pressed="true"/,
  );
  assert.match(all, /data-filter="language" data-value="Mandarin"/);
  assert.ok(!all.includes('data-filter="language" data-value="Polish"'));

  // The pure helpers answer the same way the screen does.
  assert.equal(filterCases(BOARD, DEFAULT_BOARD_FILTERS, ALEX).length, 5);
  assert.equal(filterCases(BOARD, { status: "available" }, ALEX).length, 2);
  assert.deepEqual(boardCounts(BOARD, MORGAN), {
    shown: 5,
    available: 2,
    mine: 2,
    inProgress: 2,
    waiting: 2,
    done: 1,
    reminded: 1,
  });
});

test("the board names the workflow and no taxpayer", () => {
  const html = board({ person: ALEX });
  assert.match(html, /Drop-off/);
  assert.match(html, /Cantonese/);
  assert.match(html, new RegExp(describeStage("review_ready").label));
  assert.match(html, /Waiting for an independent reviewer to claim it\./);
  assert.match(html, /Preparation eligibility/);
  assert.match(html, /Review eligibility/);
  // The answers hold a name and a city; the board shows neither, and no money.
  const withIdentifiers = renderStaffBoard(
    [
      boardCase({
        answers: {
          service: "Drop-off",
          language: "English",
          firstName: "Mei",
          lastName: "Chen",
          address: "123 Arch Street",
          zip: "19107",
        },
      }),
    ],
    PEOPLE,
    { person: ALEX },
  );
  for (const identifier of ["Mei", "Chen", "Arch Street", "19107"])
    assert.ok(!withIdentifiers.includes(identifier), identifier);
  assert.doesNotMatch(withIdentifiers, /\$/);
  assert.doesNotMatch(withIdentifiers, /refund|routing|deposit/i);
});

test("reminders are shown per case and counted on the board", () => {
  const html = board({ person: ALEX });
  assert.match(html, /VT-DDDD-4444[\s\S]{0,900}Last reminded<\/dt><dd>Sep 11/);
  assert.match(html, /VT-AAAA-1111[\s\S]{0,900}Last reminded<\/dt><dd>Not reminded yet/);
  assert.match(html, /1 reminded\./);
  assert.match(board({ person: ALEX, filters: { status: "done" } }), /0 reminded\./);

  const reminded = renderStaffCase(
    staffCase({
      lastRemindedAt: "2026-09-11T14:00:00.000Z",
      lastRemindedByPersonId: "sam",
    }),
    ALEX,
  );
  assert.match(reminded, /Last reminded<\/span><strong>Sep 11[^<]*by Sam/);
  assert.match(renderStaffCase(staffCase(), ALEX), /Last reminded<\/span><strong>Not reminded yet/);
  // Sending a reminder is the office's own screen, not this one.
  assert.doesNotMatch(reminded, /data-case-action="REMIND"/);
});

test("a claim is offered to the eligible volunteer and explained to everyone else", () => {
  const readyToPrepare = staffCase({
    stage: "preparation_ready",
    preparerId: null,
    participants: [],
    preparationVersion: 0,
  });
  const forAlex = renderStaffCase(readyToPrepare, ALEX);
  assert.match(forAlex, /data-case-action="CLAIM_PREPARATION"/);
  assert.doesNotMatch(forAlex, /Needs preparation eligibility/);

  const forMorgan = renderStaffCase(readyToPrepare, MORGAN);
  assert.doesNotMatch(forMorgan, /data-case-action="CLAIM_PREPARATION"/);
  assert.match(forMorgan, /Needs preparation eligibility\./);

  const forSam = renderStaffCase(readyToPrepare, SAM);
  assert.doesNotMatch(forSam, /data-case-action="CLAIM_PREPARATION"/);
  assert.match(forSam, /Needs preparation eligibility\./);

  // Already claimed: nobody may claim it again, and the screen says why.
  const claimed = renderStaffCase(
    staffCase({ stage: "preparation_ready", preparerId: "alex" }),
    MORGAN,
  );
  assert.doesNotMatch(claimed, /data-case-action="CLAIM_PREPARATION"/);
  assert.match(claimed, /Another volunteer has already claimed preparation\./);

  // The review side, with the same two answers.
  const readyToReview = staffCase({
    stage: "review_ready",
    preparationVersion: 1,
    preparerId: "alex",
    participants: ["alex"],
  });
  assert.match(renderStaffCase(readyToReview, MORGAN), /data-case-action="CLAIM_REVIEW"/);
  const samReviews = renderStaffCase(readyToReview, SAM);
  assert.doesNotMatch(samReviews, /data-case-action="CLAIM_REVIEW"/);
  assert.match(samReviews, /Needs review eligibility\./);
  const takenReview = renderStaffCase(
    staffCase({ stage: "review_ready", preparerId: "alex", reviewerId: "morgan" }),
    MORGAN,
  );
  assert.doesNotMatch(takenReview, /data-case-action="CLAIM_REVIEW"/);
  assert.match(takenReview, /Another volunteer has already claimed the review\./);
});

test("the board refuses a self-review with the same words the case does", () => {
  const ownPreparation = [
    boardCase({
      id: "case-9",
      reference: "VT-FFFF-9999",
      stage: "review_ready",
      preparationVersion: 1,
      preparerId: "alex",
    }),
  ];
  const capablePreparer = {
    id: "alex",
    name: "Alex",
    capabilities: ["prepare", "review"],
  };
  const own = renderStaffBoard(ownPreparation, PEOPLE, { person: capablePreparer });
  assert.doesNotMatch(own, /data-case-action="CLAIM_REVIEW"/);
  assert.match(own, /You prepared this case, so you cannot review it\./);
  // Another volunteer sees the button on the very same row.
  assert.match(
    renderStaffBoard(ownPreparation, PEOPLE, { person: MORGAN }),
    /data-case-action="CLAIM_REVIEW"/,
  );
});

test("a presenter with no persona reads the board and acts on nothing", () => {
  const html = board({ person: null });
  assert.match(html, /Choose a volunteer persona to act as\./);
  assert.match(html, /read-only/i);
  assert.doesNotMatch(html, /data-case-action=/);
  // Filters and navigation still work without a persona.
  assert.match(html, /data-action="set-board-filter"/);
  assert.match(html, /data-action="open-case" data-case-id="case-1"/);

  const one = renderStaffCase(staffCase({ stage: "preparation_ready", preparerId: null }), null);
  assert.doesNotMatch(one, /data-case-action=/);
  assert.match(one, /Choose a volunteer persona to act as\./);
});

test("the preparer's documents and hand-off, and nobody else's", () => {
  const withRequests = staffCase({
    requests: [
      {
        id: "req-open",
        title: "Mileage record",
        message: "Please add the fictional sample.",
        status: "open",
        createdAt: "2026-09-12T15:00:00.000Z",
      },
      {
        id: "req-sent",
        title: "Second page",
        message: "The second page is missing.",
        status: "awaiting_verification",
        createdAt: "2026-09-12T15:30:00.000Z",
      },
    ],
    documents: [
      {
        id: "doc-1",
        requestId: "req-sent",
        filename: "demo-mileage-record-2025.pdf",
        source: "client",
        createdAt: "2026-09-12T16:00:00.000Z",
      },
    ],
  });
  const forAlex = renderStaffCase(withRequests, ALEX);
  assert.match(forAlex, /data-case-action="REQUEST_DOCUMENT"/);
  assert.match(forAlex, /name="title"/);
  assert.match(forAlex, /name="message"/);
  assert.match(
    forAlex,
    /data-case-action="VERIFY_DOCUMENT" data-request-id="req-sent"/,
  );
  // Only the answered request can be verified.
  assert.ok(!forAlex.includes('data-case-action="VERIFY_DOCUMENT" data-request-id="req-open"'));
  assert.match(
    forAlex,
    /data-case-action="ESCALATE_CONTACT" data-request-id="req-open"/,
  );
  assert.match(forAlex, /name="reason"/);
  assert.match(forAlex, /Waiting for the client/);
  assert.match(forAlex, /Received, not verified yet/);

  // A case whose request already has an open office task is not escalated twice.
  const escalated = renderStaffCase(
    staffCase({
      requests: withRequests.requests,
      documents: withRequests.documents,
      followups: [
        {
          id: "task-1",
          requestId: "req-open",
          assigneeId: "sam",
          status: "open",
          reason: "No response for a week",
          attempts: [],
        },
      ],
    }),
    ALEX,
  );
  assert.doesNotMatch(escalated, /data-case-action="ESCALATE_CONTACT"/);
  assert.match(escalated, /The office is already contacting the client/);

  // Another volunteer gets the reason, not the controls.
  const forMorgan = renderStaffCase(withRequests, MORGAN);
  for (const action of ["REQUEST_DOCUMENT", "VERIFY_DOCUMENT", "ESCALATE_CONTACT"])
    assert.ok(!forMorgan.includes(`data-case-action="${action}"`), action);
  assert.match(forMorgan, /Needs preparation eligibility\./);
});

test("the hand-off to review waits for the intake checks and the documents", () => {
  const ready = renderStaffCase(staffCase(), ALEX);
  assert.match(
    ready,
    /data-case-action="SUBMIT_REVIEW"[^>]*>[\s\S]{0,400}Record that preparation is complete in TaxSlayer/,
  );
  assert.doesNotMatch(ready, /data-case-action="SUBMIT_REVIEW" [^>]*disabled/);
  assert.match(ready, /prepared by hand in TaxSlayer/);

  const blocked = renderStaffCase(
    staffCase({
      intakeVerified: false,
      requests: [
        {
          id: "req-open",
          title: "Mileage record",
          message: "Please add it.",
          status: "open",
          createdAt: "2026-09-12T15:00:00.000Z",
        },
      ],
    }),
    ALEX,
  );
  assert.match(blocked, /data-case-action="SUBMIT_REVIEW"[^>]*disabled/);
  assert.match(blocked, /has not recorded the intake checks yet/);
  assert.match(blocked, /1 document request is still open or unverified\./);
});

test("corrections are shown to the preparer, who resubmits with a resolution", () => {
  const corrected = staffCase({
    stage: "corrections_required",
    preparationVersion: 1,
    reviews: [
      {
        id: "review-1",
        preparationVersion: 1,
        reviewerId: "morgan",
        status: "corrections_requested",
        findings: "The household size does not match the intake answers.",
        resolution: null,
        clientContactStatus: null,
        createdAt: "2026-09-12T16:00:00.000Z",
        decidedAt: "2026-09-12T17:00:00.000Z",
      },
    ],
  });
  const forAlex = renderStaffCase(corrected, ALEX);
  assert.match(forAlex, /The household size does not match the intake answers\./);
  assert.match(forAlex, /data-case-action="RESUBMIT_REVIEW"/);
  assert.match(forAlex, /name="resolution"/);
  assert.match(
    forAlex,
    /data-case-action="RESUBMIT_REVIEW"[^>]*>[\s\S]{0,400}Record that the corrections are complete in TaxSlayer/,
  );
  assert.match(forAlex, /Corrections requested/);
  assert.doesNotMatch(forAlex, /data-case-action="SUBMIT_REVIEW"/);
  assert.doesNotMatch(forAlex, /data-case-action="REQUEST_CORRECTIONS"/);

  // The reviewer who asked for them cannot make them.
  const forMorgan = renderStaffCase(corrected, MORGAN);
  assert.doesNotMatch(forMorgan, /data-case-action="RESUBMIT_REVIEW"/);
  assert.match(forMorgan, /Needs preparation eligibility\./);

  // A resubmission is blocked by an unverified document, like the first one.
  const waiting = renderStaffCase(
    staffCase({
      stage: "corrections_required",
      preparationVersion: 1,
      reviews: corrected.reviews,
      requests: [
        {
          id: "req-open",
          title: "Mileage record",
          message: "Please add it.",
          status: "awaiting_verification",
          createdAt: "2026-09-12T15:00:00.000Z",
        },
      ],
    }),
    ALEX,
  );
  assert.match(waiting, /data-case-action="RESUBMIT_REVIEW"[^>]*disabled/);
  assert.match(waiting, /1 document request is still open or unverified\./);
});

test("the assigned reviewer decides, and the decision is never a filing", () => {
  const reviewing = staffCase({
    stage: "reviewing",
    preparationVersion: 1,
    reviewerId: "morgan",
    reviews: [
      {
        id: "review-1",
        preparationVersion: 1,
        reviewerId: "morgan",
        status: "active",
        findings: null,
        resolution: null,
        clientContactStatus: null,
        createdAt: "2026-09-12T16:00:00.000Z",
        decidedAt: null,
      },
    ],
  });
  const forMorgan = renderStaffCase(reviewing, MORGAN);
  assert.match(forMorgan, /data-case-action="REQUEST_CORRECTIONS"/);
  assert.match(forMorgan, /name="findings"/);
  assert.match(forMorgan, /data-case-action="APPROVE_REVIEW"/);
  assert.match(
    forMorgan,
    /records the result of the external review; it is not signing or filing/i,
  );
  assert.match(forMorgan, /Version 1/);

  // The preparer, and any other reviewer, get the reason instead.
  const forAlex = renderStaffCase(reviewing, ALEX);
  assert.doesNotMatch(forAlex, /data-case-action="APPROVE_REVIEW"/);
  assert.match(forAlex, /You prepared this case, so you cannot review it\./);
  const other = renderStaffCase(reviewing, {
    id: "riley",
    name: "Riley",
    capabilities: ["review"],
  });
  assert.doesNotMatch(other, /data-case-action="REQUEST_CORRECTIONS"/);
  assert.match(other, /Only the assigned reviewer records a review decision\./);
});

test("the client conversation is recorded once, by the reviewer, while it is pending", () => {
  const approved = (contact = {}) =>
    staffCase({
      stage: "review_approved",
      preparationVersion: 1,
      reviewerId: "morgan",
      reviews: [
        {
          id: "review-1",
          preparationVersion: 1,
          reviewerId: "morgan",
          status: "approved",
          findings: null,
          resolution: null,
          clientContactStatus: "pending",
          clientContactOutcome: null,
          clientContactNote: null,
          createdAt: "2026-09-12T16:00:00.000Z",
          decidedAt: "2026-09-12T18:00:00.000Z",
          clientContactedAt: null,
          ...contact,
        },
      ],
    });
  const pending = renderStaffCase(approved(), MORGAN);
  assert.match(pending, /data-case-action="RECORD_REVIEW_CONTACT"/);
  assert.match(pending, /name="outcome"/);
  assert.match(pending, /name="note"/);
  for (const outcome of ["no_answer", "reached", "no_further_contact", "closure_requested"])
    assert.match(pending, new RegExp(`value="${outcome}"`), outcome);
  assert.match(pending, /Recording an attempt never closes the case/);
  assert.doesNotMatch(pending, /data-case-action="CLOSE_CASE"/);

  // Once it is completed the form is gone, and the outcome is on the record.
  const done = renderStaffCase(
    approved({
      clientContactStatus: "completed",
      clientContactOutcome: "reached",
      clientContactNote: "Explained the next step.",
      clientContactedAt: "2026-09-13T15:00:00.000Z",
    }),
    MORGAN,
  );
  assert.doesNotMatch(done, /data-case-action="RECORD_REVIEW_CONTACT"/);
  assert.match(done, /Spoke with the client/);
  assert.match(done, /Explained the next step\./);

  // Pending, but the wrong person.
  const forAlex = renderStaffCase(approved(), ALEX);
  assert.doesNotMatch(forAlex, /data-case-action="RECORD_REVIEW_CONTACT"/);
  assert.match(forAlex, /You prepared this case, so you cannot review it\./);
  const forSam = renderStaffCase(approved(), SAM);
  assert.doesNotMatch(forSam, /data-case-action="RECORD_REVIEW_CONTACT"/);
  assert.match(forSam, /Needs review eligibility\./);
});

test("follow-up work is shown but never acted on from this screen", () => {
  const html = renderStaffCase(
    staffCase({
      followups: [
        {
          id: "task-1",
          requestId: "req-open",
          assigneeId: "sam",
          status: "open",
          reason: "No response for a week",
          resolutionNote: null,
          attempts: [
            {
              id: "attempt-1",
              outcome: "no_answer",
              note: "Left a message on the mobile number.",
              actorPersonId: "sam",
              createdAt: "2026-09-13T15:00:00.000Z",
            },
          ],
        },
      ],
    }),
    ALEX,
  );
  assert.match(html, /Open with the office/);
  assert.match(html, /No response for a week/);
  assert.match(html, /No answer/);
  assert.match(html, /Left a message on the mobile number\./);
  assert.match(html, /Sam/);
  for (const action of ["RECORD_CONTACT", "RESOLVE_FOLLOWUP", "REMIND", "CLOSE_CASE"])
    assert.ok(!html.includes(`data-case-action="${action}"`), action);
});

test("internal notes stay in the internal history, never in the client's", () => {
  const html = renderStaffCase(
    staffCase({
      stage: "corrections_required",
      preparationVersion: 1,
      reviews: [
        {
          id: "review-1",
          preparationVersion: 1,
          reviewerId: "morgan",
          status: "corrections_requested",
          findings: "Household size is wrong on line 6.",
          resolution: "Corrected the household size.",
          clientContactStatus: null,
          createdAt: "2026-09-12T16:00:00.000Z",
          decidedAt: "2026-09-12T17:00:00.000Z",
        },
      ],
      internalHistory: [
        { id: "e1", action: "REQUEST_CORRECTIONS", createdAt: "2026-09-12T17:00:00.000Z" },
      ],
      history: [
        {
          id: "c1",
          message:
            "The reviewer asked your preparer to make corrections. No action is needed from you right now.",
          createdAt: "2026-09-12T17:00:00.000Z",
        },
      ],
    }),
    ALEX,
  );
  assert.match(html, /Internal history — staff only/);
  assert.match(html, /REQUEST_CORRECTIONS/);
  const clientSection = html.slice(html.indexOf('data-role="client-history"'));
  assert.ok(clientSection.length > 0);
  assert.match(clientSection, /No action is needed from you right now\./);
  assert.ok(!clientSection.includes("Household size is wrong"), "no findings");
  assert.ok(!clientSection.includes("Corrected the household size"), "no resolution");
});

test("findings, notes and names are escaped on the way out", () => {
  const nasty = '<script>alert("x")</script>';
  const html = renderStaffCase(
    decorateStaffCase(
      {
        ...staffCase({
          stage: "review_approved",
          preparationVersion: 1,
          reviewerId: "morgan",
        }),
        reference: `VT-AB2C-DE3F${nasty}`,
        answers: { service: nasty, language: "English" },
        requests: [
          {
            id: 'req"1',
            title: nasty,
            message: nasty,
            status: "open",
            createdAt: "2026-09-12T15:00:00.000Z",
          },
        ],
        followups: [
          {
            id: "task-1",
            requestId: 'req"1',
            assigneeId: "sam",
            status: "open",
            reason: nasty,
            attempts: [
              { id: "a1", outcome: "no_answer", note: nasty, actorPersonId: "sam" },
            ],
          },
        ],
        reviews: [
          {
            id: "review-1",
            preparationVersion: 1,
            reviewerId: "morgan",
            status: "approved",
            findings: nasty,
            resolution: nasty,
            clientContactStatus: "completed",
            clientContactOutcome: "reached",
            clientContactNote: nasty,
            createdAt: "2026-09-12T16:00:00.000Z",
            decidedAt: "2026-09-12T18:00:00.000Z",
            clientContactedAt: "2026-09-13T15:00:00.000Z",
          },
        ],
        history: [{ id: "c1", message: nasty, createdAt: "2026-09-12T17:00:00.000Z" }],
        internalHistory: [
          { id: "e1", action: nasty, createdAt: "2026-09-12T17:00:00.000Z" },
        ],
      },
      PEOPLE,
    ),
    { id: "morgan", name: nasty, capabilities: ["review"] },
  );
  assert.ok(!html.includes("<script>"), "no injected element survives");
  assert.match(html, /&lt;script&gt;/);

  const boardHtml = renderStaffBoard(
    [
      decorateStaffCase(
        {
          id: 'case"1',
          reference: nasty,
          stage: "preparation_ready",
          answers: { service: nasty, language: nasty },
          updatedAt: "2026-09-12T16:30:00.000Z",
        },
        PEOPLE,
      ),
    ],
    PEOPLE,
    { person: ALEX },
  );
  assert.ok(!boardHtml.includes("<script>"));
  assert.match(boardHtml, /&lt;script&gt;/);
});

test("pending actions are disabled while one is in flight, and a conflict is shown", () => {
  const busy = renderStaffCase(
    staffCase({ stage: "preparation_ready", preparerId: null, participants: [] }),
    ALEX,
    { busy: true },
  );
  assert.match(busy, /data-case-action="CLAIM_PREPARATION"[^>]*disabled/);
  const idle = renderStaffCase(
    staffCase({ stage: "preparation_ready", preparerId: null, participants: [] }),
    ALEX,
    { busy: false },
  );
  assert.doesNotMatch(idle, /data-case-action="CLAIM_PREPARATION"[^>]*disabled/);

  const conflicted = renderStaffCase(staffCase(), ALEX, {
    error: {
      code: "CONFLICT",
      message: "Someone else changed this case. The newest version is shown — check it and try again.",
    },
  });
  assert.match(conflicted, /Someone else changed this case/);
  assert.match(conflicted, /role="alert"/);
});

test("an applicant-shaped record offers no case action at all", () => {
  // Exactly what `getCase` returns to an applicant: no participants, no
  // reviews, no internal history.
  const clientShaped = {
    id: "case-a",
    reference: "VT-AB2C-DE3F",
    stage: "preparing",
    revision: 4,
    preparationVersion: 0,
    answers: { service: "Drop-off", language: "English" },
    intakeVerified: true,
    preparerId: "alex",
    reviewerId: null,
    requests: [
      {
        id: "req-1",
        title: "Mileage record",
        message: "Please add it.",
        status: "awaiting_verification",
        createdAt: "2026-09-12T15:00:00.000Z",
      },
    ],
    documents: [],
    history: [{ id: "c1", message: "A volunteer is preparing your return.", createdAt: "2026-09-12T15:00:00.000Z" }],
  };
  const html = renderStaffCase(decorateStaffCase(clientShaped, PEOPLE), ALEX);
  assert.doesNotMatch(html, /data-case-action=/);
  assert.match(html, /Staff sections are not loaded/);
  assert.match(html, /A volunteer is preparing your return\./);
  // A board row is the same shape, and is equally inert.
  assert.doesNotMatch(renderStaffCase(boardCase(), ALEX), /data-case-action=/);
});

test("eligibility answers the same way for a board row and a full case", () => {
  const person = { id: "alex", name: "Alex", capabilities: ["prepare", "review"] };
  const row = staffEligibility(
    { stage: "review_ready", preparerId: "alex", reviewerId: null },
    person,
  );
  const full = staffEligibility(
    {
      stage: "review_ready",
      preparerId: "alex",
      reviewerId: null,
      participants: ["alex"],
    },
    person,
  );
  assert.equal(row.claimReview.allowed, false);
  assert.equal(row.claimReview.reason, full.claimReview.reason);
  assert.equal(row.participant, true, "a row knows its current preparer");

  // A former preparer is only visible on the full record, which is why the
  // database is the authority: the row lets the claim through and the server
  // answers SELF_REVIEW.
  const formerOnRow = staffEligibility(
    { stage: "review_ready", preparerId: "casey", reviewerId: null },
    person,
  );
  assert.equal(formerOnRow.claimReview.allowed, true);
  assert.equal(
    staffEligibility(
      {
        stage: "review_ready",
        preparerId: "casey",
        reviewerId: null,
        participants: ["alex", "casey"],
      },
      person,
    ).claimReview.allowed,
    false,
  );

  // Nothing is allowed without a persona.
  const nobody = staffEligibility({ stage: "preparation_ready" }, null);
  for (const decision of [
    "claimPreparation",
    "claimReview",
    "preparationWork",
    "reviewDecision",
    "reviewContact",
  ]) {
    assert.equal(nobody[decision].allowed, false, decision);
    assert.match(nobody[decision].reason, /Choose a volunteer persona/);
  }
});
