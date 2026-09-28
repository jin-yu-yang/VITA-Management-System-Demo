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
  boardFilters,
  DEFAULT_BOARD_FILTERS,
  caseTabs,
  lifecycleBar,
  caseHeader,
  caseDetails,
  CASE_TABS,
  nextStep,
  correctionsDialogBody,
  historySentence,
  EVENT_SENTENCES,
  historyPanel,
} from "../src/staff-views.mjs";
import { describeStage } from "../src/domain.mjs";
import { CASE_ACTIONS } from "../src/contracts.mjs";

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
  // The Available tab is where unclaimed preparation shows up on the board.
  assert.ok(shows(board({ person: ALEX }), "VT-AAAA-1111"));
});

test("the board shows one tab at a time, and search reaches every stage", () => {
  // BOARD: case-1 available, case-2 preparing (Alex), case-3 review_ready
  // (prepared by Alex), case-4 reviewing (Alex/Morgan), case-5 closed.
  assert.deepEqual(DEFAULT_BOARD_FILTERS, {
    status: "available",
    assignment: "anyone",
    language: "all",
    service: "all",
    search: "",
  });
  const ids = (filters, person = ALEX) =>
    filterCases(BOARD, filters, person).map((record) => record.id);

  assert.deepEqual(ids({}), ["case-1"], "Available is the default tab");
  assert.deepEqual(ids({ status: "preparation" }), ["case-2"]);
  assert.deepEqual(ids({ status: "review" }), ["case-3", "case-4"]);
  // Mine / Everyone narrows only the two waiting tabs.
  assert.deepEqual(ids({ status: "review", assignment: "mine" }, MORGAN), ["case-4"]);
  assert.deepEqual(ids({ status: "preparation", assignment: "mine" }, MORGAN), []);
  assert.deepEqual(ids({ status: "available", assignment: "mine" }, MORGAN), ["case-1"]);
  // Old saved values fall back instead of hiding everything.
  for (const old of ["all", "mine", "in_progress", "waiting", "done"])
    assert.deepEqual(ids({ status: old }), ["case-1"], old);
  assert.equal(boardFilters({ assignment: "unassigned" }).assignment, "anyone");
  // Language and service still narrow the tab.
  assert.deepEqual(ids({ status: "review", language: "English" }), ["case-4"]);
  // Search ignores the tab and the scope, keeps language and service, and
  // reaches stages that have no tab.
  assert.deepEqual(ids({ search: "eeee" }), ["case-5"]);
  assert.deepEqual(ids({ status: "review", assignment: "mine", search: "VT-" }, MORGAN), [
    "case-1",
    "case-2",
    "case-3",
    "case-4",
    "case-5",
  ]);
  assert.deepEqual(ids({ search: "VT-", language: "Cantonese" }), ["case-2", "case-3"]);
  assert.deepEqual(ids({ search: "   " }), ["case-1"], "blank search is no search");

  // Counts: one per tab, respecting language, service and scope.
  assert.deepEqual(boardCounts(BOARD, {}, ALEX), { available: 1, preparation: 1, review: 2 });
  assert.deepEqual(boardCounts(BOARD, { assignment: "mine" }, MORGAN), {
    available: 1,
    preparation: 0,
    review: 1,
  });
  assert.deepEqual(boardCounts(BOARD, { language: "Cantonese" }, ALEX), {
    available: 0,
    preparation: 1,
    review: 1,
  });
});

test("the board names the workflow and no taxpayer", () => {
  const html = board({ person: ALEX, filters: { status: "review" } });
  assert.match(html, /Drop-off/);
  assert.match(html, /Cantonese/);
  assert.match(html, new RegExp(describeStage("review_ready").label));
  // Alex prepared case-3, so the review claim is refused in place, with why.
  assert.match(html, /VT-CCCC-3333[\s\S]*prepared this case/i);
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

test("the board draws tabs with counts, a search box and one table", () => {
  const now = new Date(2026, 8, 14, 12, 0).getTime();
  const html = board({ person: ALEX, filters: { status: "review" }, now });
  // Tabs keep the filter hook and say how many each holds.
  for (const [value, count] of [["available", 1], ["preparation", 1], ["review", 2]])
    assert.match(
      html,
      new RegExp(
        `data-action="set-board-filter" data-filter="status" data-value="${value}" aria-pressed="${value === "review"}"[^>]*>[^<]*<span class="tab-count">${count}</span>`,
      ),
    );
  assert.match(html, /Showing 2 of 5 cases/);
  assert.match(html, /<form id="board-search-form"[^>]*role="search"/);
  assert.match(html, /<input id="field-board-search" name="boardSearch" type="search"/);
  assert.match(html, /<table class="board-table">/);
  assert.equal((html.match(/<tr class="board-row/g) ?? []).length, 2);
  // Mine / Everyone shows on the waiting tabs only.
  assert.match(html, /data-filter="assignment" data-value="mine"/);
  assert.doesNotMatch(board({ person: ALEX }), /data-filter="assignment"/);
  // The current persona reads as "You", and their rows are marked and first.
  assert.match(html, /<tr class="board-row own">[\s\S]*?VT-CCCC-3333/);
  assert.match(html, /<strong class="you">You<\/strong>/);
  assert.match(html, /Unassigned/);
  // Dates read as days (built in local time, so any time zone agrees).
  const dated = renderStaffBoard(
    [boardCase({ updatedAt: new Date(2026, 8, 12, 9, 0).toISOString() })],
    PEOPLE,
    { person: ALEX, now },
  );
  assert.match(dated, /2 days ago/);
  // Actions: Claim review for a reviewer; Open when nothing can be claimed.
  const morgan = board({ person: MORGAN, filters: { status: "review" }, now });
  assert.match(morgan, /data-case-action="CLAIM_REVIEW" data-case-id="case-3"/);
  assert.match(morgan, /data-action="open-case" data-case-id="case-4"[^>]*>Open</);
  // Dropped columns stay dropped.
  assert.doesNotMatch(html, /Work needed|Requires|Last reminded/);
});

// A re-render mid-keystroke (a realtime update, a notice, a persona click)
// must not wipe out what somebody is typing into the board search box (final
// review, finding 3): the box shows the draft when the wiring layer passes
// one, and only falls back to the saved search otherwise.
test("the search box shows the in-progress draft over the saved search", () => {
  const withDraft = board({ person: ALEX, filters: { search: "VT-AAAA" }, searchDraft: "VT-Z" });
  assert.match(withDraft, /<input id="field-board-search" name="boardSearch" type="search" value="VT-Z"/);
  // An empty draft (every character deleted) still wins over the saved search.
  const emptyDraft = board({ person: ALEX, filters: { search: "VT-AAAA" }, searchDraft: "" });
  assert.match(emptyDraft, /<input id="field-board-search" name="boardSearch" type="search" value=""/);
  // No draft at all: the saved search shows, exactly as before.
  const noDraft = board({ person: ALEX, filters: { search: "VT-AAAA" } });
  assert.match(noDraft, /<input id="field-board-search" name="boardSearch" type="search" value="VT-AAAA"/);
  // The submit button carries a stable id so the wiring layer can restore
  // focus to the field after a search or a clear.
  assert.match(noDraft, /<button id="board-search-submit" class="btn secondary" type="submit">/);
});

test("search results replace the tab, and empty states say what to do", () => {
  const found = board({ person: ALEX, filters: { status: "review", search: "eeee" } });
  assert.match(found, /Search results/);
  assert.match(found, /Showing 1 of 5 cases/);
  assert.ok(shows(found, "VT-EEEE-5555"), "a closed case is reachable by search");
  assert.match(found, /aria-pressed="false"[^>]*>Waiting for review/);
  assert.match(found, /data-action="set-board-filter" data-filter="search" data-value=""/);

  const none = board({ person: ALEX, filters: { search: "ZZZZ" } });
  assert.match(none, /No case matches “ZZZZ”\./);
  assert.match(none, /data-action="clear-board-filters"/);

  const quiet = renderStaffBoard([], PEOPLE, { person: ALEX });
  assert.match(quiet, /Nothing to claim right now/);
  const mineOnly = board({ person: MORGAN, filters: { status: "preparation", assignment: "mine" } });
  assert.match(mineOnly, /Nothing of yours is waiting for preparation\./);
  const narrowed = board({ person: ALEX, filters: { language: "Polish" } });
  assert.match(narrowed, /Nothing on this tab matches these filters\./);
  assert.match(narrowed, /data-action="clear-board-filters"/);
  // The finished-case hint is always there.
  assert.match(quiet, /find one by its Application ID/);
});

test("reminders are shown on the case page, not the board", () => {
  assert.doesNotMatch(board({ person: ALEX, filters: { status: "review" } }), /Last reminded/);

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
  const own = renderStaffBoard(ownPreparation, PEOPLE, {
    person: capablePreparer,
    filters: { status: "review" },
  });
  assert.doesNotMatch(own, /data-case-action="CLAIM_REVIEW"/);
  assert.match(own, /You prepared this case, so you cannot review it\./);
  // Another volunteer sees the button on the very same row.
  assert.match(
    renderStaffBoard(ownPreparation, PEOPLE, {
      person: MORGAN,
      filters: { status: "review" },
    }),
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

test("two open requests get two forms that cannot be confused", () => {
  const html = renderStaffCase(
    staffCase({
      requests: [
        {
          id: "req-first",
          title: "Mileage record",
          message: "Please add the fictional sample.",
          status: "open",
          createdAt: "2026-09-12T15:00:00.000Z",
        },
        {
          id: "req-second",
          title: "Second page",
          message: "The second page is missing.",
          status: "open",
          createdAt: "2026-09-12T15:30:00.000Z",
        },
      ],
    }),
    ALEX,
  );
  // Each escalation form names its own request, in the button's dataset and in
  // the hidden field, so whichever one is submitted carries the right id.
  for (const id of ["req-first", "req-second"]) {
    assert.match(
      html,
      new RegExp(`data-case-action="ESCALATE_CONTACT" data-request-id="${id}"`),
      id,
    );
    assert.match(
      html,
      new RegExp(`<input type="hidden" name="requestId" value="${id}">`),
      id,
    );
  }
  // And each `reason` box has its own id, which is what lets the cursor go back
  // to the box it came from after a re-render (see `describeFocus`).
  const ids = [...html.matchAll(/<textarea id="([^"]+)" name="reason"/g)].map(
    (match) => match[1],
  );
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2, "the two boxes do not share an id");
  for (const id of ids) assert.match(id, /^field-req-(first|second)-reason$/);
  // The labels point at their own box, not at the first one.
  for (const id of ids)
    assert.match(html, new RegExp(`<label class="field" for="${id}">`));
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
  assert.match(forMorgan, /data-action="open-request-corrections"/);
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
  assert.match(html, /asked the preparer for corrections/i);
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

// ---------------------------------------------------------------------------
// The case page frame (Task 2)
// ---------------------------------------------------------------------------

test("case tabs follow the ARIA tab pattern and keep every panel in the page", () => {
  assert.deepEqual(CASE_TABS.map(([key]) => key), ["overview", "intake", "documents", "followup", "history"]);
  const panels = CASE_TABS.map(([key, label]) => [key, label, `<p>${key} body</p>`]);
  const html = caseTabs(panels, "documents", { documents: 2 });
  assert.match(html, /<div class="case-tabs" role="tablist" aria-label="Case sections">/);
  assert.match(html, /<button type="button" role="tab" id="case-tab-documents" aria-controls="case-panel-documents" aria-selected="true" tabindex="0" class="case-tab selected" data-action="set-case-tab" data-value="documents">Documents <span class="tab-count">2<\/span><\/button>/);
  assert.match(html, /id="case-tab-overview" aria-controls="case-panel-overview" aria-selected="false" tabindex="-1"/);
  assert.match(html, /<div role="tabpanel" id="case-panel-documents" aria-labelledby="case-tab-documents" class="case-panel" tabindex="0">/);
  assert.match(html, /<div role="tabpanel" id="case-panel-overview" aria-labelledby="case-tab-overview" class="case-panel" tabindex="0" hidden>/);
  for (const [key] of CASE_TABS) assert.match(html, new RegExp(`${key} body`));
  // An unknown tab falls back to the first.
  assert.match(caseTabs(panels, "nonsense"), /id="case-tab-overview" aria-controls="case-panel-overview" aria-selected="true"/);
});

test("the lifecycle bar marks done, current and still-to-come steps", () => {
  const steps = (stage) =>
    [...lifecycleBar(stage).matchAll(/class="lifecycle-step ([a-z ]+)"/g)].map((m) => m[1]);
  assert.deepEqual(steps("preparing"), ["done", "done", "done", "current", "todo", "todo", "todo", "todo"]);
  assert.deepEqual(steps("draft")[0], "current");
  assert.deepEqual(steps("corrections_required")[3], "current amend");
  assert.match(lifecycleBar("corrections_required"), /Corrections in progress/);
  assert.match(lifecycleBar("reviewing"), /aria-current="step"[^>]*>[\s\S]*?In review/);
  assert.ok(steps("nonsense").every((s) => s === "todo"));
  // Closed can happen at any stage, so nothing before it is claimed as done.
  assert.deepEqual(steps("closed"), ["todo", "todo", "todo", "todo", "todo", "todo", "todo", "current"]);
});

test("the case header names the case, its stage and its people", () => {
  const html = caseHeader(staffCase({ stage: "reviewing", preparerId: "alex", reviewerId: "morgan" }), MORGAN);
  assert.match(html, /<h2 id="case-title">VT-AB2C-DE3F<\/h2>/);
  assert.match(html, /class="badge prep"/);
  assert.match(html, /<ol class="lifecycle"/);
  assert.match(html, /Preparer<\/small> Alex/);
  assert.match(html, /Reviewer<\/small> <strong class="you">You<\/strong>/);
  assert.match(html, /Acting as Morgan\./);
  assert.match(caseHeader(staffCase(), null), /Choose a volunteer persona to act as\./);
});

test("case details keep the rows the story and the office read", () => {
  const html = caseDetails(staffCase({ intakeVerified: true, lastRemindedAt: "2026-09-11T14:00:00.000Z", lastRemindedByPersonId: "sam" }));
  for (const label of ["Stage", "Preparation version", "Intake checks", "Preparer", "Reviewer", "Last reminded", "Updated"])
    assert.match(html, new RegExp(`<div class="detail-row"><span>${label}</span>`), label);
  assert.match(html, /<span>Intake checks<\/span><strong>Recorded<\/strong>/);
  assert.match(html, /<span>Preparer<\/span><strong>Alex<\/strong>/);
});

// ---------------------------------------------------------------------------
// "Your next step", the corrections dialog and the tabbed case page (Task 3)
// ---------------------------------------------------------------------------

test("your next step offers the one action that fits, or says who the case waits on", () => {
  const step = (overrides, person) => {
    const record = staffCase(overrides);
    return nextStep(record, staffEligibility(record, person), {});
  };
  // Claim preparation.
  assert.match(step({ stage: "preparation_ready", preparerId: null, participants: [] }, ALEX), /data-case-action="CLAIM_PREPARATION"/);
  assert.doesNotMatch(step({ stage: "preparation_ready", preparerId: null, participants: [] }, MORGAN), /data-case-action=/);
  assert.match(step({ stage: "preparation_ready", preparerId: null, participants: [] }, MORGAN), /Needs preparation eligibility\./);
  // Record preparation complete (the preparer only).
  assert.match(step({ stage: "preparing" }, ALEX), /data-case-action="SUBMIT_REVIEW"/);
  // A volunteer who can prepare, but is not this case's preparer.
  const CASEY = { id: "casey", name: "Casey", capabilities: ["prepare"] };
  // `esc` turns an apostrophe into `&#39;`, like every other quoted refusal
  // reason on this page.
  assert.match(step({ stage: "preparing" }, CASEY), /Only this case&#39;s current preparer can do this work\./);
  assert.match(step({ stage: "preparing" }, MORGAN), /Needs preparation eligibility\./);
  // Claim review, and the self-review refusal.
  assert.match(step({ stage: "review_ready", preparerId: "alex", participants: ["alex"] }, MORGAN), /data-case-action="CLAIM_REVIEW"/);
  assert.match(step({ stage: "review_ready", preparerId: "alex", participants: ["alex"] }, ALEX), /You prepared this case, so you cannot review it\./);
  // Decide the review: approve here, corrections through the dialog.
  const deciding = step({ stage: "reviewing", preparerId: "alex", reviewerId: "morgan", participants: ["alex"] }, MORGAN);
  assert.match(deciding, /data-case-action="APPROVE_REVIEW"/);
  assert.match(deciding, /data-action="open-request-corrections"/);
  assert.doesNotMatch(deciding, /data-case-action="REQUEST_CORRECTIONS"/);
  // Corrections: the reviewer's words stay visible to everyone on the case.
  const correcting = step({
    stage: "corrections_required",
    reviews: [{ id: "r1", status: "corrections_requested", findings: "Fix the mileage.", preparationVersion: 1 }],
  }, ALEX);
  assert.match(correcting, /Corrections the reviewer asked for/);
  assert.match(correcting, /Fix the mileage\./);
  assert.match(correcting, /data-case-action="RESUBMIT_REVIEW"/);
  // Office intake stages and a closed case: no action, just the state.
  assert.doesNotMatch(step({ stage: "received" }, ALEX), /data-case-action=/);
  assert.match(step({ stage: "received" }, ALEX), /<h2 id="next-step-title">Your next step<\/h2>/);
  // No persona.
  assert.match(step({ stage: "preparing" }, null), /Choose a volunteer persona to act as\./);
});

test("the staff case page is five tabs, with each action in exactly one place", () => {
  const html = renderStaffCase(staffCase({ stage: "reviewing", preparerId: "alex", reviewerId: "morgan", participants: ["alex"], reviews: [{ id: "r1", status: "open", preparationVersion: 1 }] }), MORGAN, { caseTab: "documents" });
  assert.match(html, /<h2 id="case-title">/);
  for (const [key] of CASE_TABS) assert.match(html, new RegExp(`id="case-panel-${key}"`));
  assert.match(html, /id="case-tab-documents" aria-controls="case-panel-documents" aria-selected="true"/);
  assert.match(html, /id="case-panel-overview"[^>]*hidden>[\s\S]*Your next step[\s\S]*Case details[\s\S]*Preparation milestones[\s\S]*Independent review/);
  assert.equal((html.match(/data-case-action="APPROVE_REVIEW"/g) ?? []).length, 1);
  assert.match(html, /id="case-panel-intake"[^>]*>[\s\S]*What the client told us/);
  assert.match(html, /id="case-panel-history"[^>]*>[\s\S]*History/);
});

test("the corrections dialog carries the form the action is built from", () => {
  const html = correctionsDialogBody({ busy: false });
  assert.match(html, /<form class="staff-form">/);
  assert.match(html, /<span>Corrections to send back to the preparer<\/span><textarea id="field-corrections-findings" name="findings"/);
  assert.match(html, /<button type="submit" class="btn primary full" data-case-action="REQUEST_CORRECTIONS"/);
  assert.match(html, /data-action="close-dialog"/);
  assert.match(correctionsDialogBody({ busy: true }), /data-case-action="REQUEST_CORRECTIONS"\s+disabled/);
  // A refused send is repeated inside the dialog, which would otherwise hide it.
  const refused = correctionsDialogBody({ error: { code: "CONFLICT", message: "Someone else changed this case." } });
  assert.match(refused, /<div class="notice amber" role="status">[\s\S]*Someone else changed this case\./);
  assert.doesNotMatch(correctionsDialogBody({}), /role="status"/);
});

test("internal history reads as sentences, with who did it", () => {
  const record = staffCase({
    internalHistory: [
      { id: "e1", action: "CLAIM_PREPARATION", actorPersonId: "alex", createdAt: "2026-09-12T15:00:00.000Z" },
      { id: "e2", action: "LOAD_SOMETHING_NEW", actorPersonId: null, createdAt: "2026-09-12T16:00:00.000Z" },
    ],
  });
  assert.equal(record.internalHistory[0].actorName, "Alex");
  assert.equal(historySentence(record.internalHistory[0]), "Alex claimed preparation.");
  // An event this table does not know still reads as words, never as a code.
  assert.equal(historySentence(record.internalHistory[1]), "Load something new.");
  for (const action of CASE_ACTIONS) assert.ok(EVENT_SENTENCES[action], action);
  const html = historyPanel(record, true);
  assert.match(html, /Alex claimed preparation\./);
  assert.doesNotMatch(html, /CLAIM_PREPARATION/);
});
