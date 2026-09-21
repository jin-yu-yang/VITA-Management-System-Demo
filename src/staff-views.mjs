import {
  esc,
  icon,
  button,
  caseButton,
  caseSubmit,
  input,
  textarea,
  select,
  stageBadge,
  formatTime,
  ANSWER_LABELS,
} from "./ui.mjs";
import { describeStage } from "./domain.mjs";
import { CONTACT_OUTCOMES } from "./case-actions.mjs";

// The two staff screens for preparers and reviewers — the work board and the
// selected case — as pure functions. No state, no store, no timers, no DOM:
// each returns an HTML string, and every value that came from a person or from
// the database is escaped on the way out.
//
// Four conventions hold throughout:
//
//   * workflow buttons carry `data-case-action` with a name from CASE_ACTIONS,
//     and any related id in `data-request-id` / `data-followup-id`; forms put
//     that attribute on their submit button and name their fields after the
//     payload keys (`src/case-actions.mjs` turns the two into a payload);
//   * navigation and filters carry `data-action` and never become an action;
//   * stage words come from `describeStage` and names from `decorateStaffCase`
//     — this file invents neither;
//   * a person who may not do something sees the reason, not a missing button.
//     `staffEligibility` is the one place those rules live, so the board and
//     the case workspace can never disagree about who may act.
//
// There is no amount, refund, bank or routing field anywhere in this demo, so
// none is ever rendered: ViTally records the workflow, and the return itself
// lives in the tax software.
//
// The section renderers a second staff screen needs — the header, the answers
// summary, the requests/documents list and the history — are **exported** (the
// office workspace in `admin-views.mjs` imports them, Ruling R55). They are
// shared, not copied: one case can never describe itself two ways depending on
// which volunteer is looking at it. The same goes for the small vocabularies
// below and for `explain`, so a refusal reads the same on every screen.

export const when = (condition, html) => (condition ? html : "");
export const UNKNOWN_PERSON = "Unknown person";

// ---------------------------------------------------------------------------
// Vocabularies (stage words are never redefined here — see describeStage)
// ---------------------------------------------------------------------------

// What staff do next at each stage, and which technical qualification that work
// needs. This is the *staff* half of the stage table; the label and the client
// sentence stay in `describeStage`, which is the only place they exist.
const STAGE_WORK = Object.freeze({
  draft: { work: "Nothing yet. The client has not sent this application.", needs: null },
  received: { work: "The office records the intake checks.", needs: null },
  preparation_ready: {
    work: "Waiting for a preparer to claim it.",
    needs: "prepare",
  },
  preparing: {
    work: "Preparation in the tax software, document requests, then the hand-off to review.",
    needs: "prepare",
  },
  review_ready: {
    work: "Waiting for an independent reviewer to claim it.",
    needs: "review",
  },
  reviewing: {
    work: "The reviewer approves the work or asks for corrections.",
    needs: "review",
  },
  corrections_required: {
    work: "The preparer records the corrections and sends it back to review.",
    needs: "prepare",
  },
  review_approved: {
    work: "The reviewer records the conversation with the client.",
    needs: "review",
  },
  closed: { work: "Closed. Nothing further is recorded here.", needs: null },
});
const UNKNOWN_WORK = Object.freeze({ work: "Waiting on the office.", needs: null });
export const stageWork = (stage) =>
  Object.hasOwn(STAGE_WORK, stage ?? "") ? STAGE_WORK[stage] : UNKNOWN_WORK;

const ELIGIBILITY_LABELS = Object.freeze({
  prepare: "Preparation eligibility",
  review: "Review eligibility",
});

export const REQUEST_STATUS = Object.freeze({
  open: "Waiting for the client",
  awaiting_verification: "Received, not verified yet",
  verified: "Verified",
  cancelled: "Cancelled",
});

const REVIEW_STATUS = Object.freeze({
  active: "Open review",
  corrections_requested: "Corrections requested",
  approved: "Approved",
  superseded: "Superseded by a newer version",
});

export const FOLLOWUP_STATUS = Object.freeze({
  open: "Open with the office",
  resolved: "Resolved",
});

export const CONTACT_OUTCOME_LABELS = Object.freeze({
  no_answer: "No answer",
  reached: "Spoke with the client",
  no_further_contact: "Client wants no further contact",
  closure_requested: "Client asked to close the case",
});

export const named = (table, key, fallback = "—") =>
  Object.hasOwn(table, key ?? "") ? table[key] : fallback;

// The manual milestone wording, in one place: ViTally never prepares, signs or
// files anything — it records that a person did that work elsewhere.
const TAXSLAYER_NOTE =
  "ViTally records the milestone only. The return itself is prepared by hand in TaxSlayer.";

// ---------------------------------------------------------------------------
// Names (Ruling R49)
// ---------------------------------------------------------------------------

/**
 * Attach the display names a staff screen needs to one case record. The store
 * stays name-free — it returns person ids — so this is where ids become names,
 * once, before any renderer sees the record.
 *
 * An id with no matching person becomes "Unknown person" rather than an id on
 * screen. Sections the record does not carry (a board row has no follow-ups or
 * reviews) are not invented; only the names are added.
 *
 * @param {object} caseRecord a Case from the store
 * @param {Array<{id:string,name:string}>} people `listPeople()`
 */
export function decorateStaffCase(caseRecord, people = []) {
  if (!caseRecord) return caseRecord;
  const roster = Array.isArray(people) ? people : [];
  const nameOf = (id) =>
    id ? (roster.find((person) => person?.id === id)?.name ?? UNKNOWN_PERSON) : null;
  const decorated = {
    ...caseRecord,
    preparerName: nameOf(caseRecord.preparerId),
    reviewerName: nameOf(caseRecord.reviewerId),
    lastRemindedByName: nameOf(caseRecord.lastRemindedByPersonId),
    participantNames: (caseRecord.participants ?? []).map(
      (id) => nameOf(id) ?? UNKNOWN_PERSON,
    ),
  };
  if (Array.isArray(caseRecord.followups))
    decorated.followups = caseRecord.followups.map((followup) => ({
      ...followup,
      assigneeName: nameOf(followup?.assigneeId),
      attempts: (followup?.attempts ?? []).map((attempt) => ({
        ...attempt,
        actorName: nameOf(attempt?.actorPersonId),
      })),
    }));
  if (Array.isArray(caseRecord.reviews))
    decorated.reviews = caseRecord.reviews.map((review) => ({
      ...review,
      reviewerName: nameOf(review?.reviewerId),
    }));
  return decorated;
}

// ---------------------------------------------------------------------------
// Eligibility — the one implementation the board and the case workspace share
// ---------------------------------------------------------------------------

const PREPARATION_WORK_STAGES = Object.freeze(["preparing", "corrections_required"]);
const UNSETTLED_REQUEST_STATUSES = Object.freeze(["open", "awaiting_verification"]);

export const CHOOSE_PERSONA = "Choose a volunteer persona to act as.";

const allowed = { allowed: true, reason: "" };
const refused = (reason) => ({ allowed: false, reason });

/**
 * Who may do what on one case. Every answer is `{allowed, reason}`: a refusal
 * carries the sentence to show, because an absent button explains nothing.
 *
 * The order mirrors the database's check order (contracts §"validation order"):
 * stage, then participation, then the technical qualification, then the
 * assignment — so the browser and the server refuse for the same reason.
 *
 * Participation is read from `participants` when the record carries it. A board
 * row is a scalar Case and does not, so the current preparer is taken as the
 * known participant there; the database is the authority either way and answers
 * SELF_REVIEW to anything this cannot see.
 */
export function staffEligibility(caseRecord, person) {
  const record = caseRecord ?? {};
  const stage = record.stage;
  const id = person?.id ?? null;
  const capabilities = Array.isArray(person?.capabilities) ? person.capabilities : [];
  const canPrepare = capabilities.includes("prepare");
  const canReview = capabilities.includes("review");
  const participantIds = Array.isArray(record.participants)
    ? record.participants
    : record.preparerId
      ? [record.preparerId]
      : [];
  const participant = Boolean(id) && participantIds.includes(id);
  const isPreparer = Boolean(id) && record.preparerId === id;
  const isReviewer = Boolean(id) && record.reviewerId === id;
  const preparationAvailable = stage === "preparation_ready" && !record.preparerId;
  const reviewAvailable = stage === "review_ready" && !record.reviewerId;

  const claimPreparation = () => {
    if (!id) return refused(CHOOSE_PERSONA);
    if (stage !== "preparation_ready")
      return refused("This case is not waiting to be claimed for preparation.");
    if (record.preparerId)
      return refused("Another volunteer has already claimed preparation.");
    if (!canPrepare) return refused("Needs preparation eligibility.");
    return allowed;
  };

  const claimReview = () => {
    if (!id) return refused(CHOOSE_PERSONA);
    if (stage !== "review_ready")
      return refused("This case is not waiting for an independent reviewer.");
    if (record.reviewerId)
      return refused("Another volunteer has already claimed the review.");
    if (participant)
      return refused("You prepared this case, so you cannot review it.");
    if (!canReview) return refused("Needs review eligibility.");
    return allowed;
  };

  // Document work and both hand-offs: the case's current preparer, with the
  // participation the claim created.
  const preparationWork = () => {
    if (!id) return refused(CHOOSE_PERSONA);
    if (!PREPARATION_WORK_STAGES.includes(stage))
      return refused("Preparation work happens while this case is being prepared.");
    if (!canPrepare) return refused("Needs preparation eligibility.");
    if (!isPreparer)
      return refused(
        record.preparerId
          ? "Only this case's current preparer can do this work."
          : "Nobody has claimed preparation yet.",
      );
    return allowed;
  };

  const reviewDecision = () => {
    if (!id) return refused(CHOOSE_PERSONA);
    if (stage !== "reviewing")
      return refused("No review is open on this case right now.");
    if (participant)
      return refused("You prepared this case, so you cannot review it.");
    if (!canReview) return refused("Needs review eligibility.");
    if (!isReviewer)
      return refused("Only the assigned reviewer records a review decision.");
    return allowed;
  };

  const reviewContact = () => {
    if (!id) return refused(CHOOSE_PERSONA);
    if (stage !== "review_approved")
      return refused("The client conversation is recorded after the review is approved.");
    if (participant)
      return refused("You prepared this case, so you cannot review it.");
    if (!canReview) return refused("Needs review eligibility.");
    if (!isReviewer)
      return refused("Only the reviewer who approved this case records the conversation.");
    return allowed;
  };

  return {
    personId: id,
    canPrepare,
    canReview,
    participant,
    isPreparer,
    isReviewer,
    preparationAvailable,
    reviewAvailable,
    claimPreparation: claimPreparation(),
    claimReview: claimReview(),
    preparationWork: preparationWork(),
    reviewDecision: reviewDecision(),
    reviewContact: reviewContact(),
  };
}

/** Work nobody has taken: the two states a claim button exists for. */
export const isAvailableWork = (record) =>
  (record?.stage === "preparation_ready" && !record?.preparerId) ||
  (record?.stage === "review_ready" && !record?.reviewerId);

const unsettledRequests = (record) =>
  (record?.requests ?? []).filter((request) =>
    UNSETTLED_REQUEST_STATUSES.includes(request?.status),
  );

const openFollowupFor = (record, requestId) =>
  (record?.followups ?? []).find(
    (followup) => followup?.requestId === requestId && followup?.status === "open",
  );

// A refusal, said plainly, where the button would have been.
export const explain = (decision, extra = "") =>
  `<p class="staff-reason" role="note">${icon("lock")} ${esc(decision.reason)}${when(extra, ` ${esc(extra)}`)}</p>`;

// ---------------------------------------------------------------------------
// The work board
// ---------------------------------------------------------------------------

export const DEFAULT_BOARD_FILTERS = Object.freeze({
  status: "all",
  assignment: "anyone",
  language: "all",
  service: "all",
});

const STATUS_GROUPS = Object.freeze([
  ["all", "All work"],
  ["available", "Available"],
  ["mine", "Mine"],
  ["in_progress", "In progress"],
  ["waiting", "Waiting"],
  ["done", "Done"],
]);
const ASSIGNMENT_GROUPS = Object.freeze([
  ["anyone", "Anyone"],
  ["unassigned", "No one assigned"],
  ["mine", "Mine"],
]);

const IN_PROGRESS_STAGES = Object.freeze(["preparing", "reviewing", "corrections_required"]);
const WAITING_STAGES = Object.freeze([
  "draft",
  "received",
  "preparation_ready",
  "review_ready",
]);
const DONE_STAGES = Object.freeze(["review_approved", "closed"]);

const mine = (record, personId) =>
  Boolean(personId) &&
  (record?.preparerId === personId || record?.reviewerId === personId);

// The groups deliberately overlap: an unclaimed `preparation_ready` case is
// both "available" and "waiting". They are filters, not a partition.
function inStatusGroup(record, group, personId) {
  switch (group) {
    case "available":
      return isAvailableWork(record);
    case "mine":
      return mine(record, personId);
    case "in_progress":
      return IN_PROGRESS_STAGES.includes(record?.stage);
    case "waiting":
      return WAITING_STAGES.includes(record?.stage);
    case "done":
      return DONE_STAGES.includes(record?.stage);
    default:
      return true;
  }
}

function inAssignmentGroup(record, group, personId) {
  if (group === "mine") return mine(record, personId);
  if (group === "unassigned") return !record?.preparerId && !record?.reviewerId;
  return true;
}

export const boardFilters = (filters) => ({ ...DEFAULT_BOARD_FILTERS, ...(filters ?? {}) });

/** The records one set of filters leaves on screen. */
export function filterCases(cases = [], filters, person = null) {
  const chosen = boardFilters(filters);
  const personId = person?.id ?? null;
  return cases.filter(
    (record) =>
      inStatusGroup(record, chosen.status, personId) &&
      inAssignmentGroup(record, chosen.assignment, personId) &&
      (chosen.language === "all" ||
        (record?.answers?.language ?? "") === chosen.language) &&
      (chosen.service === "all" || (record?.answers?.service ?? "") === chosen.service),
  );
}

/** Counts over whatever is on screen, so the numbers always match the rows. */
export function boardCounts(cases = [], person = null) {
  const personId = person?.id ?? null;
  return {
    shown: cases.length,
    available: cases.filter((record) => isAvailableWork(record)).length,
    mine: cases.filter((record) => mine(record, personId)).length,
    inProgress: cases.filter((record) => IN_PROGRESS_STAGES.includes(record?.stage))
      .length,
    waiting: cases.filter((record) => WAITING_STAGES.includes(record?.stage)).length,
    done: cases.filter((record) => DONE_STAGES.includes(record?.stage)).length,
    reminded: cases.filter((record) => Boolean(record?.lastRemindedAt)).length,
  };
}

const FILTER_GROUP_LABELS = Object.freeze({
  status: "Status",
  assignment: "Assignment",
  language: "Language",
  service: "Service",
});

const filterChips = (name, options, current) =>
  `<div class="filter-group" role="group" aria-label="${esc(named(FILTER_GROUP_LABELS, name, "Filter"))}">${options
    .map(([value, label]) =>
      button(
        esc(label),
        "set-board-filter",
        current === value ? "chip selected" : "chip",
        `data-filter="${esc(name)}" data-value="${esc(value)}" aria-pressed="${current === value}"`,
      ),
    )
    .join("")}</div>`;

// Language and service come from the records themselves, so a workspace with
// one language does not show filters for languages nobody asked for.
const valueOptions = (cases, key, allLabel) => [
  ["all", allLabel],
  ...[
    ...new Set(
      cases
        .map((record) => String(record?.answers?.[key] ?? "").trim())
        .filter(Boolean),
    ),
  ]
    .sort()
    .map((value) => [value, value]),
];

const fact = (label, value) =>
  `<div class="board-fact"><dt>${esc(label)}</dt><dd>${esc(value || "—")}</dd></div>`;

function boardRow(record, person, ui) {
  const work = stageWork(record?.stage);
  const rights = staffEligibility(record, person);
  const busy = ui.busy ? "disabled" : "";
  const claims = [];
  if (rights.claimPreparation.allowed)
    claims.push(
      caseButton(
        `${icon("play")} Claim preparation`,
        "CLAIM_PREPARATION",
        "primary",
        `data-case-id="${esc(record.id)}" ${busy}`,
      ),
    );
  else if (record?.stage === "preparation_ready")
    claims.push(explain(rights.claimPreparation));
  if (rights.claimReview.allowed)
    claims.push(
      caseButton(
        `${icon("check")} Claim review`,
        "CLAIM_REVIEW",
        "primary",
        `data-case-id="${esc(record.id)}" ${busy}`,
      ),
    );
  else if (record?.stage === "review_ready") claims.push(explain(rights.claimReview));
  return `<article class="board-row"><div class="board-row-head"><button class="board-reference" data-action="open-case" data-case-id="${esc(record.id)}">${esc(record.reference)} ${icon("chevron")}</button>${stageBadge(record.stage)}${when(isAvailableWork(record), '<span class="badge teal"><i></i>Available</span>')}</div><dl class="board-facts">${fact(
    "Service",
    record?.answers?.service,
  )}${fact("Language", record?.answers?.language)}${fact("Work needed", work.work)}${fact(
    "Requires",
    work.needs ? ELIGIBILITY_LABELS[work.needs] : "No volunteer qualification",
  )}${fact(
    "Preparer",
    record.preparerName ?? (record.preparerId ? UNKNOWN_PERSON : "Unassigned"),
  )}${fact(
    "Reviewer",
    record.reviewerName ?? (record.reviewerId ? UNKNOWN_PERSON : "Unassigned"),
  )}${fact(
    "Last reminded",
    record.lastRemindedAt ? formatTime(record.lastRemindedAt) : "Not reminded yet",
  )}${fact(
    "Updated",
    record.updatedAt ? formatTime(record.updatedAt) : "No updates yet",
  )}</dl><div class="board-actions">${claims.join("")}</div></article>`;
}

/**
 * The work board: every case this presenter can see, filtered by four local
 * choices, with the claim a chosen persona may make on each row.
 *
 * @param {object[]} cases  decorated Cases (see `decorateStaffCase`)
 * @param {object[]} people `listPeople()`, used to resolve `ui.personId`
 * @param {object}   ui     `{person|personId, filters, busy, total}`
 */
export function renderStaffBoard(cases = [], people = [], ui = {}) {
  const roster = Array.isArray(people) ? people : [];
  const person =
    ui.person ?? roster.find((entry) => entry?.id === ui.personId) ?? null;
  const chosen = boardFilters(ui.filters);
  const shown = filterCases(cases, chosen, person);
  const counts = boardCounts(shown, person);
  const total = cases.length;
  const rows = shown.length
    ? `<div class="board-list">${shown.map((record) => boardRow(record, person, ui)).join("")}</div>`
    : `<div class="panel empty-state">${icon("folder")}<h2>Nothing matches these filters</h2><p>Change or clear the filters to see the rest of the workspace.</p>${button("Show all work", "clear-board-filters", "secondary")}</div>`;
  return `<section class="panel staff-board" aria-labelledby="board-title"><div class="section-head"><h2 id="board-title">Work board</h2><span class="muted small">Showing ${esc(counts.shown)} of ${esc(total)} ${total === 1 ? "case" : "cases"}</span></div><p class="board-counts" role="status">In this view: ${esc(counts.available)} available, ${esc(counts.mine)} mine, ${esc(counts.inProgress)} in progress, ${esc(counts.waiting)} waiting, ${esc(counts.done)} done, ${esc(counts.reminded)} reminded.</p><div class="board-filters">${filterChips(
    "status",
    STATUS_GROUPS,
    chosen.status,
  )}${filterChips("assignment", ASSIGNMENT_GROUPS, chosen.assignment)}${filterChips(
    "language",
    valueOptions(cases, "language", "Any language"),
    chosen.language,
  )}${filterChips(
    "service",
    valueOptions(cases, "service", "Any service"),
    chosen.service,
  )}</div>${when(
    !person,
    `<p class="staff-reason" role="note">${icon("user")} ${esc(CHOOSE_PERSONA)} Until then this board is read-only.</p>`,
  )}${rows}<p class="field-note">This board shows workflow only: no taxpayer names, no addresses and no document contents. Open a case to do the work.</p></section>`;
}

// ---------------------------------------------------------------------------
// The selected case
// ---------------------------------------------------------------------------

export const detailRow = (label, value) =>
  `<div class="detail-row"><span>${esc(label)}</span><strong>${esc(value || "—")}</strong></div>`;

// A refused or interrupted action, said beside the work it belongs to rather
// than only in the page-wide banner — with the same two controls, so nothing is
// lost by announcing it here instead.
export function problemNotice(ui) {
  if (!ui?.error) return "";
  return `<div class="notice amber" role="alert">${icon("help")}<div><h3>${esc(
    ui.error.code === "CONFLICT"
      ? "This case changed while you were working"
      : "That step did not go through",
  )}</h3><p>${esc(ui.error.message)}</p><div class="conflict-choices">${when(
    ui.retryable,
    button("Try again", "retry-action", "inline"),
  )}${button("Dismiss", "dismiss-error", "inline")}</div></div></div>`;
}

export function caseHeader(record, person) {
  const described = describeStage(record.stage);
  return `<section class="panel staff-header" aria-labelledby="case-title"><div class="section-head"><h2 id="case-title">${esc(record.reference ?? "This case")}</h2>${stageBadge(record.stage)}</div><p>${esc(stageWork(record.stage).work)}</p>${detailRow("Stage", described.label)}${detailRow(
    "Preparation version",
    record.preparationVersion ? `Version ${record.preparationVersion}` : "Not prepared yet",
  )}${detailRow("Intake checks", record.intakeVerified ? "Recorded" : "Not recorded yet")}${detailRow(
    "Preparer",
    record.preparerName ?? (record.preparerId ? UNKNOWN_PERSON : "Unassigned"),
  )}${detailRow(
    "Reviewer",
    record.reviewerName ?? (record.reviewerId ? UNKNOWN_PERSON : "Unassigned"),
  )}${when(
    Array.isArray(record.participantNames),
    detailRow(
      "Prepared by (all versions)",
      record.participantNames?.join(", ") || "Nobody yet",
    ),
  )}${detailRow(
    "Last reminded",
    record.lastRemindedAt
      ? `${formatTime(record.lastRemindedAt)}${record.lastRemindedByName ? ` by ${record.lastRemindedByName}` : ""}`
      : "Not reminded yet",
  )}${detailRow("Updated", record.updatedAt ? formatTime(record.updatedAt) : "No updates yet")}<p class="field-note">${esc(
    person?.name ? `Acting as ${person.name}.` : CHOOSE_PERSONA,
  )}</p></section>`;
}

export function answersPanel(record) {
  const answers = record.answers ?? {};
  const rows = Object.keys(ANSWER_LABELS)
    .filter((key) => String(answers[key] ?? "").trim())
    .map((key) => detailRow(ANSWER_LABELS[key], answers[key]))
    .join("");
  return `<section class="panel" aria-labelledby="answers-title"><div class="section-head"><h2 id="answers-title">What the client told us</h2></div>${
    rows || '<p class="muted">No answers were saved on this case.</p>'
  }<p class="field-note">These are the intake answers, exactly as saved. ${esc(TAXSLAYER_NOTE)}</p></section>`;
}

function requestCard(record, request, rights, ui) {
  const busy = ui.busy ? "disabled" : "";
  const documents = (record.documents ?? []).filter(
    (document) => document?.requestId === request?.id,
  );
  const followup = openFollowupFor(record, request?.id);
  const scope = request?.id ?? "request";
  const verify = when(
    request?.status === "awaiting_verification",
    rights.preparationWork.allowed
      ? caseButton(
          `${icon("check")} Verify this document`,
          "VERIFY_DOCUMENT",
          "primary",
          `data-request-id="${esc(request.id)}" ${busy}`,
        )
      : explain(rights.preparationWork),
  );
  const escalate = when(
    request?.status === "open" && !followup,
    rights.preparationWork.allowed
      ? `<form class="staff-form"><input type="hidden" name="requestId" value="${esc(request.id)}">${textarea(
          "Why the office should call the client",
          "reason",
          "",
          'required maxlength="1000" rows="2"',
          scope,
        )}${caseSubmit(
          `${icon("phone")} Ask the office to contact the client`,
          "ESCALATE_CONTACT",
          "secondary",
          `data-request-id="${esc(request.id)}" ${busy}`,
        )}</form>`
      : "",
  );
  return `<div class="request-card"><div class="section-head"><h3>${esc(request?.title)}</h3><span class="badge ${request?.status === "verified" ? "green" : request?.status === "awaiting_verification" ? "amber" : "blue"}"><i></i>${esc(named(REQUEST_STATUS, request?.status, "Requested"))}</span></div><p>${esc(request?.message)}</p><p class="field-note">Requested ${esc(formatTime(request?.createdAt))}</p>${when(
    documents.length,
    `<ul class="document-list">${documents
      .map(
        (document) =>
          `<li>${icon("file")} ${esc(document.filename)} <small>${esc(
            document.source === "client" ? "sent by the client" : "recorded by the office",
          )} · ${esc(formatTime(document.createdAt))}</small></li>`,
      )
      .join("")}</ul>`,
  )}${when(
    Boolean(followup),
    `<p class="field-note">${icon("clock")} The office is already contacting the client about this request.</p>`,
  )}${verify}${escalate}</div>`;
}

export function documentsPanel(record, rights, ui) {
  const requests = record.requests ?? [];
  const busy = ui.busy ? "disabled" : "";
  const form = rights.preparationWork.allowed
    ? `<form class="staff-form"><h3>Request a document</h3>${input(
        "Short title",
        "title",
        "",
        "text",
        'required maxlength="120" placeholder="Mileage record"',
        "request",
      )}${textarea(
        "What the client should send",
        "message",
        "",
        'required maxlength="2000" rows="3"',
        "request",
      )}${caseSubmit(
        `${icon("file")} Request this document`,
        "REQUEST_DOCUMENT",
        "primary",
        busy,
      )}<p class="field-note">The client sees the title and this message. A response never verifies itself — you verify it here.</p></form>`
    : explain(rights.preparationWork);
  return `<section class="panel" aria-labelledby="documents-title"><div class="section-head"><h2 id="documents-title">Documents</h2><span class="muted small">${esc(requests.length)} requested, ${esc(unsettledRequests(record).length)} not settled</span></div>${
    requests.length
      ? requests.map((request) => requestCard(record, request, rights, ui)).join("")
      : '<p class="muted">No documents have been requested on this case.</p>'
  }${form}</section>`;
}

function preparationBlockers(record) {
  const blockers = [];
  if (!record.intakeVerified)
    blockers.push("The office has not recorded the intake checks yet.");
  const unsettled = unsettledRequests(record);
  if (unsettled.length)
    blockers.push(
      `${unsettled.length} document ${unsettled.length === 1 ? "request is" : "requests are"} still open or unverified.`,
    );
  return blockers;
}

function preparationPanel(record, rights, ui) {
  const busy = ui.busy ? "disabled" : "";
  const blockers = preparationBlockers(record);
  const blocked = when(
    blockers.length,
    `<ul class="blocker-list">${blockers.map((line) => `<li>${icon("clock")} ${esc(line)}</li>`).join("")}</ul>`,
  );
  const corrections = (record.reviews ?? []).findLast(
    (review) => review?.status === "corrections_requested",
  );
  let body = "";
  if (rights.claimPreparation.allowed)
    body = caseButton(
      `${icon("play")} Claim preparation`,
      "CLAIM_PREPARATION",
      "primary",
      busy,
    );
  else if (record.stage === "preparation_ready") body = explain(rights.claimPreparation);
  else if (record.stage === "preparing")
    body = rights.preparationWork.allowed
      ? `${blocked}${caseButton(
          `${icon("check")} Record that preparation is complete in TaxSlayer`,
          "SUBMIT_REVIEW",
          "primary",
          blockers.length || ui.busy ? "disabled" : "",
        )}`
      : explain(rights.preparationWork);
  else if (record.stage === "corrections_required")
    body = `${when(
      Boolean(corrections),
      `<div class="notice amber" role="note">${icon("help")}<div><h3>Corrections the reviewer asked for</h3><p>${esc(corrections?.findings)}</p><small>${esc(corrections?.reviewerName ?? "")} · version ${esc(corrections?.preparationVersion)} · ${esc(formatTime(corrections?.decidedAt))}</small></div></div>`,
    )}${
      rights.preparationWork.allowed
        ? `${blocked}<form class="staff-form">${textarea(
            "What you corrected in TaxSlayer",
            "resolution",
            "",
            'required maxlength="2000" rows="3"',
            "resubmit",
          )}${caseSubmit(
            `${icon("check")} Record that the corrections are complete in TaxSlayer`,
            "RESUBMIT_REVIEW",
            "primary",
            blockers.length || ui.busy ? "disabled" : "",
          )}</form>`
        : explain(rights.preparationWork)
    }`;
  else body = `<p class="muted">${esc(stageWork(record.stage).work)}</p>`;
  return `<section class="panel" aria-labelledby="preparation-title"><div class="section-head"><h2 id="preparation-title">Preparation milestones</h2></div><p class="field-note">${esc(TAXSLAYER_NOTE)} Nothing here signs or files a return.</p>${body}</section>`;
}

function reviewAttempts(record) {
  const attempts = record.reviews ?? [];
  if (!attempts.length)
    return '<p class="muted">No review attempt has been opened on this case yet.</p>';
  return `<ol class="review-list">${attempts
    .map(
      (attempt) =>
        `<li class="review-attempt"><div class="section-head"><h3>Version ${esc(attempt?.preparationVersion)}</h3><span class="badge ${attempt?.status === "approved" ? "green" : attempt?.status === "corrections_requested" ? "amber" : "teal"}"><i></i>${esc(named(REVIEW_STATUS, attempt?.status, "Review"))}</span></div>${detailRow(
          "Reviewer",
          attempt?.reviewerName ?? (attempt?.reviewerId ? UNKNOWN_PERSON : "Unassigned"),
        )}${when(attempt?.findings, detailRow("Corrections asked for", attempt?.findings))}${when(
          attempt?.resolution,
          detailRow("What the preparer corrected", attempt?.resolution),
        )}${when(
          attempt?.clientContactStatus,
          detailRow(
            "Client conversation",
            attempt?.clientContactStatus === "completed"
              ? `${named(CONTACT_OUTCOME_LABELS, attempt?.clientContactOutcome, "Recorded")} · ${formatTime(attempt?.clientContactedAt)}`
              : "Still to record",
          ),
        )}${when(
          attempt?.clientContactNote,
          detailRow("Conversation note", attempt?.clientContactNote),
        )}<small>Opened ${esc(formatTime(attempt?.createdAt))}${when(attempt?.decidedAt, ` · decided ${esc(formatTime(attempt?.decidedAt))}`)}</small></li>`,
    )
    .join("")}</ol>`;
}

function reviewPanel(record, rights, ui) {
  const busy = ui.busy ? "disabled" : "";
  const approved = (record.reviews ?? []).findLast(
    (review) => review?.status === "approved",
  );
  let body = "";
  if (record.stage === "review_ready")
    body = rights.claimReview.allowed
      ? caseButton(`${icon("check")} Claim review`, "CLAIM_REVIEW", "primary", busy)
      : explain(rights.claimReview);
  else if (record.stage === "reviewing")
    body = rights.reviewDecision.allowed
      ? `<form class="staff-form">${textarea(
          "Corrections to send back to the preparer",
          "findings",
          "",
          'required maxlength="2000" rows="3"',
          "corrections",
        )}${caseSubmit(
          `${icon("back")} Ask the preparer for corrections`,
          "REQUEST_CORRECTIONS",
          "secondary",
          busy,
        )}</form>${caseButton(
          `${icon("check")} Approve this review`,
          "APPROVE_REVIEW",
          "primary",
          busy,
        )}<p class="field-note">Approving records the result of the external review; it is not signing or filing, and it is not an acceptance by any tax authority.</p>`
      : explain(rights.reviewDecision);
  else if (record.stage === "review_approved")
    body =
      approved?.clientContactStatus === "pending"
        ? rights.reviewContact.allowed
          ? `<form class="staff-form">${select(
              "What happened",
              "outcome",
              "",
              CONTACT_OUTCOMES.map((value) => [value, CONTACT_OUTCOME_LABELS[value]]),
              "required",
              "contact",
            )}${textarea(
              "Note for the office",
              "note",
              "",
              'required maxlength="1000" rows="2"',
              "contact",
            )}${caseSubmit(
              `${icon("phone")} Record this conversation`,
              "RECORD_REVIEW_CONTACT",
              "primary",
              busy,
            )}<p class="field-note">Recording an attempt never closes the case. Closure is the office's own step.</p></form>`
          : explain(rights.reviewContact)
        : `<p class="muted">The client conversation for this review is recorded. Nothing further is needed here.</p>`;
  else body = `<p class="muted">${esc(stageWork(record.stage).work)}</p>`;
  return `<section class="panel" aria-labelledby="review-title"><div class="section-head"><h2 id="review-title">Independent review</h2></div><p class="field-note">A reviewer never reviews a case they prepared, at any version.</p>${reviewAttempts(record)}${body}</section>`;
}

function followupPanel(record) {
  const followups = record.followups ?? [];
  return `<section class="panel" aria-labelledby="followup-title"><div class="section-head"><h2 id="followup-title">Office follow-up</h2><span class="muted small">${esc(followups.length)} ${followups.length === 1 ? "task" : "tasks"}</span></div>${
    followups.length
      ? `<ul class="followup-list">${followups
          .map(
            (followup) =>
              `<li><div class="section-head"><h3>${esc(named(FOLLOWUP_STATUS, followup?.status, "Task"))}</h3><span class="muted small">${esc(followup?.assigneeName ?? UNKNOWN_PERSON)}</span></div><p>${esc(followup?.reason)}</p>${when(
                (followup?.attempts ?? []).length,
                `<ul class="attempt-list">${followup.attempts
                  .map(
                    (attempt) =>
                      `<li>${esc(named(CONTACT_OUTCOME_LABELS, attempt?.outcome, "Attempt"))} · ${esc(formatTime(attempt?.createdAt))}<small>${esc(attempt?.note)}</small></li>`,
                  )
                  .join("")}</ul>`,
              )}${when(
                followup?.resolutionNote,
                `<p class="field-note">Resolved: ${esc(followup.resolutionNote)}</p>`,
              )}</li>`,
          )
          .join("")}</ul>`
      : '<p class="muted">No office follow-up has been raised on this case.</p>'
  }<p class="field-note">Follow-up calls are recorded on the office screens, not here.</p></section>`;
}

export function historyPanel(record, staffShaped) {
  const internal = [...(record.internalHistory ?? [])].reverse();
  const client = [...(record.history ?? [])].reverse();
  return `<section class="panel history-panel" aria-labelledby="history-title"><div class="section-head"><h2 id="history-title">History</h2></div>${when(
    staffShaped,
    `<h3>Internal history — staff only</h3>${
      internal.length
        ? `<div class="timeline" data-role="internal-history">${internal
            .map(
              (entry) =>
                `<div class="timeline-item"><span class="timeline-dot"></span><div><p>${esc(entry?.action)}</p><small>${esc(formatTime(entry?.createdAt))}</small></div></div>`,
            )
            .join("")}</div>`
        : '<p class="muted">Nothing has been recorded on this case yet.</p>'
    }`,
  )}<h3>What the client sees</h3>${
    client.length
      ? `<div class="timeline" data-role="client-history">${client
          .map(
            (entry) =>
              `<div class="timeline-item"><span class="timeline-dot"></span><div><p>${esc(entry?.message)}</p><small>${esc(formatTime(entry?.createdAt))}</small></div></div>`,
          )
          .join("")}</div>`
      : '<p class="muted" data-role="client-history">The client has seen no updates yet.</p>'
  }<p class="field-note">Findings, resolutions and office notes stay in the internal list. The client list is the plain-language progress the client reads.</p></section>`;
}

/**
 * One case, with the preparation and review work the chosen persona may do and
 * the reason for everything they may not.
 *
 * @param {object} caseRecord a decorated staff Case (`decorateStaffCase`)
 * @param {{id:string,name:string,capabilities:string[]}|null} person the persona
 * @param {object} ui `{busy, error}` from the controller snapshot
 */
export function renderStaffCase(caseRecord, person, ui = {}) {
  const record = caseRecord ?? {};
  const view = ui ?? {};
  const rights = staffEligibility(record, person);
  // A record with no staff sections is an applicant's Case, or a list row: it
  // cannot be acted on, and no workflow control is offered for it.
  const staffShaped =
    Array.isArray(record.participants) && Array.isArray(record.reviews);
  return [
    problemNotice(view),
    caseHeader(record, person),
    answersPanel(record),
    when(
      !staffShaped,
      `<section class="panel"><div class="section-head"><h2>Staff sections are not loaded</h2></div><p class="muted">This record holds no participation, review or internal history, so no case action is offered here. Open the case from the work board to do the work.</p></section>`,
    ),
    when(staffShaped, documentsPanel(record, rights, view)),
    when(staffShaped, preparationPanel(record, rights, view)),
    when(staffShaped, reviewPanel(record, rights, view)),
    when(staffShaped, followupPanel(record)),
    historyPanel(record, staffShaped),
  ].join("");
}
