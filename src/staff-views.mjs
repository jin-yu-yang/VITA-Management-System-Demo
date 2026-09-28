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
  relativeDay,
  ANSWER_LABELS,
} from "./ui.mjs";
import { describeStage, phaseTab, BOARD_TABS } from "./domain.mjs";
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
  // A board row carries the people who owe a call rather than the tasks
  // themselves (Ruling R56), and they get names here like everybody else.
  if (Array.isArray(caseRecord.followupAssigneeIds))
    decorated.followupAssigneeNames = caseRecord.followupAssigneeIds.map(
      (id) => nameOf(id) ?? UNKNOWN_PERSON,
    );
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
  if (Array.isArray(caseRecord.internalHistory))
    decorated.internalHistory = caseRecord.internalHistory.map((entry) => ({
      ...entry,
      actorName: nameOf(entry?.actorPersonId),
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
  status: "available",
  assignment: "anyone",
  language: "all",
  service: "all",
  search: "",
});

const TAB_VALUES = Object.freeze(BOARD_TABS.map(([value]) => value));
const SCOPE_VALUES = Object.freeze(["anyone", "mine"]);

const mine = (record, personId) =>
  Boolean(personId) &&
  (record?.preparerId === personId || record?.reviewerId === personId);

// The board's choices with its own defaults filled in. A value saved by an
// older version of the board (`in_progress`, `unassigned`…) falls back to the
// default rather than hiding every case.
export function boardFilters(filters) {
  const chosen = { ...DEFAULT_BOARD_FILTERS, ...(filters ?? {}) };
  if (!TAB_VALUES.includes(chosen.status)) chosen.status = DEFAULT_BOARD_FILTERS.status;
  if (!SCOPE_VALUES.includes(chosen.assignment))
    chosen.assignment = DEFAULT_BOARD_FILTERS.assignment;
  chosen.search = String(chosen.search ?? "").trim();
  return chosen;
}

const inLanguageAndService = (record, chosen) =>
  (chosen.language === "all" || (record?.answers?.language ?? "") === chosen.language) &&
  (chosen.service === "all" || (record?.answers?.service ?? "") === chosen.service);

const matchesSearch = (record, search) =>
  String(record?.reference ?? "")
    .toUpperCase()
    .includes(search.toUpperCase());

const onTab = (record, chosen, personId) =>
  phaseTab(record) === chosen.status &&
  (chosen.status === "available" || chosen.assignment === "anyone" || mine(record, personId));

/**
 * The records one set of choices leaves on screen. A search looks across every
 * stage, tab or no tab, so a volunteer can reopen a submitted, approved or
 * closed case by its Application ID.
 */
export function filterCases(cases = [], filters, person = null) {
  const chosen = boardFilters(filters);
  const personId = person?.id ?? null;
  const narrowed = cases.filter((record) => inLanguageAndService(record, chosen));
  return chosen.search
    ? narrowed.filter((record) => matchesSearch(record, chosen.search))
    : narrowed.filter((record) => onTab(record, chosen, personId));
}

/** How many cases each tab would show with the other choices as they are. */
export function boardCounts(cases = [], filters, person = null) {
  const chosen = boardFilters(filters);
  return Object.fromEntries(
    TAB_VALUES.map((tab) => [
      tab,
      filterCases(cases, { ...chosen, status: tab, search: "" }, person).length,
    ]),
  );
}

const FILTER_GROUP_LABELS = Object.freeze({
  status: "Status",
  assignment: "Whose cases",
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

const SCOPES = Object.freeze([
  ["anyone", "Everyone"],
  ["mine", "Mine"],
]);
const EMPTY_TAB = Object.freeze({
  available: "Nothing to claim right now. New work appears here once the office has checked its intake.",
  preparation: "Nothing is waiting for preparation.",
  review: "Nothing is waiting for review.",
});

// A tab is a filter button: the same hook as every other board choice, with
// its count inside so a screen reader hears both.
function boardTabs(chosen, counts) {
  return `<div class="board-tabs" role="group" aria-label="Board tab">${BOARD_TABS.map(
    ([value, label]) => {
      const on = !chosen.search && chosen.status === value;
      return button(
        `${esc(label)} <span class="tab-count">${esc(counts[value])}</span>`,
        "set-board-filter",
        on ? "tab selected" : "tab",
        `data-filter="status" data-value="${value}" aria-pressed="${on}"`,
      );
    },
  ).join("")}</div>`;
}

function searchForm(chosen, ui = {}) {
  const value = ui.searchDraft !== undefined ? ui.searchDraft : chosen.search;
  return `<form id="board-search-form" class="board-search" role="search"><label class="sr-only" for="field-board-search">Find an Application ID</label><input id="field-board-search" name="boardSearch" type="search" value="${esc(value)}" placeholder="Find an Application ID" autocomplete="off"><button id="board-search-submit" class="btn secondary" type="submit">${icon("search")} Find</button>${when(
    chosen.search,
    button("Clear search", "set-board-filter", "text", 'data-filter="search" data-value=""'),
  )}</form>`;
}

const who = (id, name, personId) =>
  !id
    ? `<span class="unassigned">Unassigned</span>`
    : id === personId
      ? `<strong class="you">You</strong>`
      : esc(name ?? UNKNOWN_PERSON);

function boardRow(record, person, ui) {
  const rights = staffEligibility(record, person);
  const busy = ui.busy ? "disabled" : "";
  const id = esc(record.id);
  const actions = [];
  if (rights.claimPreparation.allowed)
    actions.push(caseButton(`${icon("play")} Claim`, "CLAIM_PREPARATION", "primary", `data-case-id="${id}" ${busy}`));
  else if (record?.stage === "preparation_ready") actions.push(explain(rights.claimPreparation));
  if (rights.claimReview.allowed)
    actions.push(caseButton(`${icon("check")} Claim review`, "CLAIM_REVIEW", "primary", `data-case-id="${id}" ${busy}`));
  else if (record?.stage === "review_ready") actions.push(explain(rights.claimReview));
  if (!rights.claimPreparation.allowed && !rights.claimReview.allowed)
    actions.push(button("Open", "open-case", "secondary", `data-case-id="${id}"`));
  const own = mine(record, person?.id);
  return `<tr class="board-row${own ? " own" : ""}"><th scope="row"><button class="board-reference" data-action="open-case" data-case-id="${id}">${esc(record.reference)}</button></th><td>${stageBadge(record.stage)}</td><td>${esc(record?.answers?.language || "—")}</td><td>${esc(record?.answers?.service || "—")}</td><td>${who(record.preparerId, record.preparerName, person?.id)}</td><td>${who(record.reviewerId, record.reviewerName, person?.id)}</td><td class="board-updated">${esc(record.updatedAt ? relativeDay(record.updatedAt, ui.now ?? Date.now()) : "No updates yet")}</td><td class="board-actions"><div class="board-row-actions">${actions.join("")}</div></td></tr>`;
}

// Your own rows first, otherwise in the order the store returned them.
const yoursFirst = (records, personId) =>
  [...records].sort((a, b) => Number(mine(b, personId)) - Number(mine(a, personId)));

/**
 * The volunteer work board: three tabs (spec 2026-09-28, section 5), a search
 * that reaches every stage, and one table of the cases the choices leave.
 *
 * @param {object[]} cases  decorated Cases (see `decorateStaffCase`)
 * @param {object[]} people `listPeople()`, used to resolve `ui.personId`
 * @param {object}   ui     `{person|personId, filters, busy, now, searchDraft}`
 */
export function renderStaffBoard(cases = [], people = [], ui = {}) {
  const roster = Array.isArray(people) ? people : [];
  const person = ui.person ?? roster.find((entry) => entry?.id === ui.personId) ?? null;
  const chosen = boardFilters(ui.filters);
  const shown = yoursFirst(filterCases(cases, chosen, person), person?.id ?? null);
  const counts = boardCounts(cases, chosen, person);
  const total = cases.length;
  const narrowed = chosen.language !== "all" || chosen.service !== "all";
  const emptyText = chosen.search
    ? `No case matches “${esc(chosen.search)}”.`
    : narrowed
      ? "Nothing on this tab matches these filters."
      : chosen.status !== "available" && chosen.assignment === "mine"
        ? `Nothing of yours is ${chosen.status === "preparation" ? "waiting for preparation" : "waiting for review"}.`
        : EMPTY_TAB[chosen.status];
  const body = shown.length
    ? `<div class="board-table-wrap"><table class="board-table"><thead><tr><th scope="col">Application ID</th><th scope="col">Stage</th><th scope="col">Language</th><th scope="col">Service</th><th scope="col">Preparer</th><th scope="col">Reviewer</th><th scope="col">Updated</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${shown
        .map((record) => boardRow(record, person, ui))
        .join("")}</tbody></table></div>`
    : `<div class="empty-state">${icon("folder")}<p>${emptyText}</p>${when(
        narrowed || chosen.search,
        button("Clear filters", "clear-board-filters", "secondary"),
      )}</div>`;
  return `<section class="panel staff-board" aria-labelledby="board-title"><div class="section-head"><h2 id="board-title">${chosen.search ? "Search results" : "Work board"}</h2><span class="muted small" role="status">Showing ${esc(shown.length)} of ${esc(total)} ${total === 1 ? "case" : "cases"}</span></div>${searchForm(chosen, ui)}${boardTabs(chosen, counts)}<div class="board-filters">${when(
    !chosen.search && chosen.status !== "available",
    filterChips("assignment", SCOPES, chosen.assignment),
  )}${filterChips("language", valueOptions(cases, "language", "Any language"), chosen.language)}${filterChips(
    "service",
    valueOptions(cases, "service", "Any service"),
    chosen.service,
  )}</div>${when(
    !person,
    `<p class="staff-reason" role="note">${icon("user")} ${esc(CHOOSE_PERSONA)} Until then this board is read-only.</p>`,
  )}${body}<p class="field-note board-note">${icon("lock")} This board shows workflow only: no taxpayer names, no addresses and no document contents. Submitted, approved and closed cases are not on these tabs; find one by its Application ID.</p></section>`;
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

// ---------------------------------------------------------------------------
// The case page frame (spec 2026-09-28, section 6)
// ---------------------------------------------------------------------------

export const CASE_TABS = Object.freeze([
  ["overview", "Overview"],
  ["intake", "Intake answers"],
  ["documents", "Documents"],
  ["followup", "Follow-up"],
  ["history", "History"],
]);

/**
 * The case page's tabs, following the ARIA tab pattern (spec section 9).
 * Every panel is rendered and the inactive ones are `hidden`, so each control
 * keeps its id and hook wherever it lives. The wiring layer handles the keys.
 *
 * @param {Array<[string, string, string]>} panels `[key, label, html]`
 * @param {string} active the key to show; an unknown key shows the first
 * @param {Record<string, number>} counts optional count per key
 */
export function caseTabs(panels, active = "overview", counts = {}) {
  const current = panels.some(([key]) => key === active) ? active : panels[0][0];
  const tabs = panels
    .map(([key, label]) => {
      const on = key === current;
      const count = counts[key] ? ` <span class="tab-count">${esc(counts[key])}</span>` : "";
      return `<button type="button" role="tab" id="case-tab-${key}" aria-controls="case-panel-${key}" aria-selected="${on}" tabindex="${on ? 0 : -1}" class="case-tab${on ? " selected" : ""}" data-action="set-case-tab" data-value="${key}">${esc(label)}${count}</button>`;
    })
    .join("");
  const bodies = panels
    .map(
      ([key, , html]) =>
        `<div role="tabpanel" id="case-panel-${key}" aria-labelledby="case-tab-${key}" class="case-panel" tabindex="0"${key === current ? "" : " hidden"}>${html}</div>`,
    )
    .join("");
  return `<div class="case-tabs" role="tablist" aria-label="Case sections">${tabs}</div>${bodies}`;
}

// The main path through today's nine stages. Corrections are a loop back into
// preparation, so they show on the preparation step, marked as amendment.
const LIFECYCLE = Object.freeze([
  "draft",
  "received",
  "preparation_ready",
  "preparing",
  "review_ready",
  "reviewing",
  "review_approved",
  "closed",
]);

export function lifecycleBar(stage) {
  const correcting = stage === "corrections_required";
  const at = LIFECYCLE.indexOf(correcting ? "preparing" : stage);
  return `<ol class="lifecycle" aria-label="Where this case is">${LIFECYCLE.map((step, index) => {
    // A case can be closed from any stage, so a closed case marks no step as
    // done; the History tab shows the path it took.
    const state =
      at < 0 ? "todo" : index === at ? "current" : index < at && stage !== "closed" ? "done" : "todo";
    const amend = correcting && step === "preparing";
    const label = describeStage(amend ? "corrections_required" : step).label;
    return `<li class="lifecycle-step ${state}${amend ? " amend" : ""}"${index === at ? ' aria-current="step"' : ""}><span class="lifecycle-dot"></span><span class="lifecycle-label">${esc(label)}</span></li>`;
  }).join("")}</ol>`;
}

const namePill = (role, id, name, personId) =>
  `<span class="name-pill"><small>${role}</small> ${who(id, name, personId)}</span>`;

export function caseHeader(record, person) {
  return `<section class="panel staff-header" aria-labelledby="case-title"><div class="case-title-row"><h2 id="case-title">${esc(record.reference ?? "This case")}</h2>${stageBadge(record.stage)}<span class="case-people">${namePill("Preparer", record.preparerId, record.preparerName, person?.id)}${namePill("Reviewer", record.reviewerId, record.reviewerName, person?.id)}</span></div>${lifecycleBar(record.stage)}<p class="field-note">${esc(
    person?.name ? `Acting as ${person.name}.` : CHOOSE_PERSONA,
  )}</p></section>`;
}

/** The facts the old header listed, kept as rows the story and office read. */
export function caseDetails(record) {
  const described = describeStage(record.stage);
  return `<section class="panel case-details" aria-labelledby="details-title"><div class="section-head"><h2 id="details-title">Case details</h2></div>${detailRow("Stage", described.label)}${detailRow(
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
    detailRow("Prepared by (all versions)", record.participantNames?.join(", ") || "Nobody yet"),
  )}${detailRow(
    "Last reminded",
    record.lastRemindedAt
      ? `${formatTime(record.lastRemindedAt)}${record.lastRemindedByName ? ` by ${record.lastRemindedByName}` : ""}`
      : "Not reminded yet",
  )}${detailRow("Updated", record.updatedAt ? formatTime(record.updatedAt) : "No updates yet")}</section>`;
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

/**
 * The one thing to do next on this case, for the persona this window acts as,
 * built from the same eligibility rules the database enforces. When there is
 * nothing to do, it says who the case is waiting on and, where an action was
 * refused, why.
 */
export function nextStep(record, rights, ui = {}) {
  const busy = ui.busy ? "disabled" : "";
  const blockers = preparationBlockers(record);
  const blocked = when(
    blockers.length,
    `<ul class="blocker-list">${blockers.map((line) => `<li>${icon("clock")} ${esc(line)}</li>`).join("")}</ul>`,
  );
  const approved = (record.reviews ?? []).findLast((review) => review?.status === "approved");
  const corrections = (record.reviews ?? []).findLast(
    (review) => review?.status === "corrections_requested",
  );
  let body = "";
  switch (record.stage) {
    case "preparation_ready":
      body = rights.claimPreparation.allowed
        ? caseButton(`${icon("play")} Claim preparation`, "CLAIM_PREPARATION", "primary", busy)
        : explain(rights.claimPreparation);
      break;
    case "preparing":
      body = rights.preparationWork.allowed
        ? `${blocked}${caseButton(
            `${icon("check")} Record that preparation is complete in TaxSlayer`,
            "SUBMIT_REVIEW",
            "primary",
            blockers.length || ui.busy ? "disabled" : "",
          )}`
        : explain(rights.preparationWork);
      break;
    case "corrections_required":
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
      break;
    case "review_ready":
      body = rights.claimReview.allowed
        ? caseButton(`${icon("check")} Claim review`, "CLAIM_REVIEW", "primary", busy)
        : explain(rights.claimReview);
      break;
    case "reviewing":
      body = rights.reviewDecision.allowed
        ? `<div class="next-step-actions">${caseButton(
            `${icon("check")} Approve this review`,
            "APPROVE_REVIEW",
            "primary",
            busy,
          )}${button(
            `${icon("back")} Ask the preparer for corrections`,
            "open-request-corrections",
            "secondary",
            busy,
          )}</div><p class="field-note">Approving records the result of the external review; it is not signing or filing, and it is not an acceptance by any tax authority.</p>`
        : explain(rights.reviewDecision);
      break;
    case "review_approved":
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
      break;
    default:
      body = "";
  }
  return `<section class="panel next-step" aria-labelledby="next-step-title"><div class="section-head"><h2 id="next-step-title">Your next step</h2></div><p class="next-step-waiting">${esc(stageWork(record.stage).work)}</p>${body}</section>`;
}

// What preparation is waiting on. The actions are in "Your next step".
function preparationPanel(record) {
  const blockers = ["preparing", "corrections_required"].includes(record.stage)
    ? preparationBlockers(record)
    : [];
  return `<section class="panel" aria-labelledby="preparation-title"><div class="section-head"><h2 id="preparation-title">Preparation milestones</h2></div><p class="field-note">${esc(TAXSLAYER_NOTE)} Nothing here signs or files a return.</p>${
    blockers.length
      ? `<ul class="blocker-list">${blockers.map((line) => `<li>${icon("clock")} ${esc(line)}</li>`).join("")}</ul>`
      : `<p class="muted">${esc(stageWork(record.stage).work)}</p>`
  }</section>`;
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

// Every review attempt on this case. The decision is in "Your next step".
function reviewPanel(record) {
  return `<section class="panel" aria-labelledby="review-title"><div class="section-head"><h2 id="review-title">Independent review</h2></div><p class="field-note">A reviewer never reviews a case they prepared, at any version.</p>${reviewAttempts(record)}</section>`;
}

/**
 * The Request corrections dialog: the form REQUEST_CORRECTIONS is built from.
 * A refused send is repeated here, because the page's own notice sits behind
 * the dialog. It is a status, not a second alert.
 */
export function correctionsDialogBody(state = {}) {
  const refused = state.error
    ? `<div class="notice amber" role="status">${icon("help")}<div><h3>${esc(
        state.error.code === "CONFLICT" ? "This case changed while you were working" : "That did not go through",
      )}</h3><p>${esc(state.error.message)}</p></div></div>`
    : "";
  return `${refused}<p>Tell the preparer what to correct in TaxSlayer. The client never sees these words.</p><form class="staff-form">${textarea(
    "Corrections to send back to the preparer",
    "findings",
    "",
    'required maxlength="2000" rows="4"',
    "corrections",
  )}${caseSubmit(
    `${icon("back")} Send back for corrections`,
    "REQUEST_CORRECTIONS",
    "primary full",
    state.busy ? "disabled" : "",
  )}</form>${button("Keep reviewing", "close-dialog", "text")}`;
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

// One plain sentence per recorded action (spec section 6). The actor is added
// when the event names one; an action this table does not know still reads
// as words, never as a code.
export const EVENT_SENTENCES = Object.freeze({
  SAVE_ANSWERS: "saved the intake answers",
  SUBMIT: "submitted the application",
  VERIFY_INTAKE: "recorded the intake checks",
  CLAIM_PREPARATION: "claimed preparation",
  REQUEST_DOCUMENT: "asked the client for a document",
  RESPOND_DOCUMENT: "sent a requested document",
  RECORD_DOCUMENT_RESPONSE: "recorded a document the office took in",
  VERIFY_DOCUMENT: "verified a document",
  ESCALATE_CONTACT: "asked the office to contact the client",
  RECORD_CONTACT: "recorded a call with the client",
  RESOLVE_FOLLOWUP: "resolved the office follow-up",
  SUBMIT_REVIEW: "recorded that preparation is complete",
  CLAIM_REVIEW: "claimed the review",
  REQUEST_CORRECTIONS: "asked the preparer for corrections",
  RESUBMIT_REVIEW: "recorded that the corrections are complete",
  APPROVE_REVIEW: "approved the review",
  RECORD_REVIEW_CONTACT: "recorded the conversation with the client",
  REMIND: "sent the client a reminder",
  CLOSE_CASE: "closed the case",
});

export function historySentence(entry) {
  const code = String(entry?.action ?? "");
  // `??` and `||` cannot be mixed without parentheses.
  const words =
    (EVENT_SENTENCES[code] ?? code.toLowerCase().replaceAll("_", " ").trim()) ||
    "recorded a change";
  const sentence = entry?.actorName ? `${entry.actorName} ${words}` : words;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
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
                `<div class="timeline-item"><span class="timeline-dot"></span><div><p>${esc(historySentence(entry))}</p><small>${esc(formatTime(entry?.createdAt))}</small></div></div>`,
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
 * One case: a header, then five tabs (spec section 6). Overview holds the next
 * step and the facts; the other tabs hold the rest. Every panel is rendered, so
 * each control keeps its hook whichever tab is showing.
 *
 * @param {object} caseRecord a decorated staff Case (`decorateStaffCase`)
 * @param {{id:string,name:string,capabilities:string[]}|null} person the persona
 * @param {object} ui `{busy, error, retryable, caseTab}` from the controller snapshot
 */
export function renderStaffCase(caseRecord, person, ui = {}) {
  const record = caseRecord ?? {};
  const view = ui ?? {};
  const rights = staffEligibility(record, person);
  // A record with no staff sections is an applicant's Case, or a list row: it
  // cannot be acted on, and no workflow control is offered for it.
  const staffShaped = Array.isArray(record.participants) && Array.isArray(record.reviews);
  const notLoaded = `<section class="panel"><div class="section-head"><h2>Staff sections are not loaded</h2></div><p class="muted">This record holds no participation, review or internal history, so no case action is offered here. Open the case from the work board to do the work.</p></section>`;
  const elsewhere = '<p class="muted">Open the case from the work board to see this.</p>';
  const panels = [
    [
      "overview",
      "Overview",
      staffShaped
        ? `${nextStep(record, rights, view)}${caseDetails(record)}${preparationPanel(record)}${reviewPanel(record)}`
        : `${caseDetails(record)}${notLoaded}`,
    ],
    ["intake", "Intake answers", answersPanel(record)],
    ["documents", "Documents", staffShaped ? documentsPanel(record, rights, view) : elsewhere],
    ["followup", "Follow-up", staffShaped ? followupPanel(record) : elsewhere],
    ["history", "History", historyPanel(record, staffShaped)],
  ];
  return [
    problemNotice(view),
    caseHeader(record, person),
    caseTabs(panels, view.caseTab, { documents: (record.requests ?? []).length }),
  ].join("");
}
