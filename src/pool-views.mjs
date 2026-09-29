import { phaseTab, describeStage } from "./domain.mjs";
import { esc, icon, button, relativeDay, stageBadge } from "./ui.mjs";

export const POOL_TABS = Object.freeze([
  ["all", "All cases"],
  ["intake", "Intake"],
  ["available", "Available"],
  ["preparation", "Waiting for preparation"],
  ["review", "Waiting for review"],
  ["done", "Done"],
  ["closed", "Closed"],
]);
const TAB_VALUES = Object.freeze(POOL_TABS.map(([value]) => value));
export const POOL_STAGES = Object.freeze([
  "draft", "received", "preparation_ready", "preparing", "corrections_required",
  "review_ready", "reviewing", "review_approved", "closed",
]);
export const DEFAULT_POOL_FILTERS = Object.freeze({
  poolPhase: "all", poolStage: "all", poolLanguage: "all",
  poolService: "all", poolPreparer: "all", poolReviewer: "all",
});
export const POOL_FILTER_KEYS = Object.freeze(Object.keys(DEFAULT_POOL_FILTERS));

// The office's phases on today's nine stages. The three middle ones are the
// volunteer board's own tabs (`phaseTab`), so a case never sits on one tab
// for a volunteer and another for the office. Part 3 replaces both.
export function poolPhase(record) {
  switch (record?.stage) {
    case "draft":
    case "received":
      return "intake";
    case "review_approved":
      return "done";
    case "closed":
      return "closed";
    default:
      return phaseTab(record);
  }
}

export function poolFilters(filters) {
  const chosen = { ...DEFAULT_POOL_FILTERS };
  for (const key of POOL_FILTER_KEYS) {
    const value = String(filters?.[key] ?? "").trim();
    if (value) chosen[key] = value;
  }
  if (!TAB_VALUES.includes(chosen.poolPhase)) chosen.poolPhase = "all";
  if (chosen.poolStage !== "all" && !POOL_STAGES.includes(chosen.poolStage)) chosen.poolStage = "all";
  return chosen;
}

const matchesValue = (value, chosen) => chosen === "all" || (value ?? "") === chosen;
const matchesPerson = (id, chosen) =>
  chosen === "all" || (chosen === "unassigned" ? !id : id === chosen);

export function filterPool(cases = [], chosen, { ignorePhase = false } = {}) {
  return (Array.isArray(cases) ? cases : []).filter(
    (record) =>
      (ignorePhase || chosen.poolPhase === "all" || poolPhase(record) === chosen.poolPhase) &&
      matchesValue(record?.stage, chosen.poolStage) &&
      matchesValue(record?.answers?.language, chosen.poolLanguage) &&
      matchesValue(record?.answers?.service, chosen.poolService) &&
      matchesPerson(record?.preparerId, chosen.poolPreparer) &&
      matchesPerson(record?.reviewerId, chosen.poolReviewer),
  );
}

export function poolCounts(cases = [], chosen) {
  const scoped = filterPool(cases, chosen, { ignorePhase: true });
  return Object.fromEntries(
    TAB_VALUES.map((tab) => [tab, tab === "all" ? scoped.length : scoped.filter((r) => poolPhase(r) === tab).length]),
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

// No `ui.select`: it adds a blank "Select an option" entry, which reads as a
// real choice here. And no `name`, so no form handler or answer draft reads it.
const filterSelect = (label, key, value, options) =>
  `<label class="field pool-filter" for="field-${key}"><span>${esc(label)}</span><select id="field-${key}" data-board-filter="${key}">${options
    .map(([v, t]) => `<option value="${esc(v)}"${v === value ? " selected" : ""}>${esc(t)}</option>`)
    .join("")}</select></label>`;

const valueOptions = (cases, key, anyLabel) => [
  ["all", anyLabel],
  ...[
    ...new Set(
      cases.map((record) => String(record?.answers?.[key] ?? "").trim()).filter(Boolean),
    ),
  ]
    .sort()
    .map((value) => [value, value]),
];

const personOptions = (people) => [
  ["all", "Anyone"],
  ["unassigned", "Unassigned"],
  ...people.map((person) => [person.id, person.name ?? person.id]),
];

const TAB_LABELS = Object.fromEntries(POOL_TABS);
const NARROWING_KEYS = POOL_FILTER_KEYS.filter((key) => key !== "poolPhase");
const who = (name, id) => (id ? esc(name ?? "Unknown") : `<span class="unassigned">Unassigned</span>`);

function poolRow(record, now) {
  const phase = TAB_LABELS[poolPhase(record)];
  return `<tr class="pool-row"><th scope="row"><button class="board-reference" data-action="open-case" data-case-id="${esc(record.id)}">${esc(record.reference)}</button></th><td>${stageBadge(record.stage)}${
    phase ? `<span class="pool-phase">${esc(phase)}</span>` : ""
  }</td><td>${esc(record?.answers?.language || "—")}</td><td>${esc(record?.answers?.service || "—")}</td><td>${who(record.preparerName, record.preparerId)}</td><td>${who(record.reviewerName, record.reviewerId)}</td><td class="board-updated">${esc(
    record.updatedAt ? relativeDay(record.updatedAt, now) : "No updates yet",
  )}</td></tr>`;
}

export function renderCasePool(cases = [], people = [], ui = {}) {
  const all = Array.isArray(cases) ? cases : [];
  const now = ui.now ?? Date.now();
  const chosen = poolFilters(ui.filters);
  const counts = poolCounts(all, chosen);
  const shown = filterPool(all, chosen).sort(
    (a, b) => (Date.parse(b?.updatedAt) || 0) - (Date.parse(a?.updatedAt) || 0),
  );
  const narrowed = NARROWING_KEYS.some((key) => chosen[key] !== "all");
  const tabs = `<div class="filter-group" role="group" aria-label="Case phase">${POOL_TABS.map(([value, label]) =>
    button(
      `${esc(label)} <span class="count">${counts[value]}</span>`,
      "set-board-filter",
      chosen.poolPhase === value ? "chip selected" : "chip",
      `data-filter="poolPhase" data-value="${esc(value)}" aria-pressed="${chosen.poolPhase === value}"`,
    ),
  ).join("")}</div>`;
  const filters = `<div class="pool-filters">${filterSelect(
    "Stage", "poolStage", chosen.poolStage,
    [["all", "Any stage"], ...POOL_STAGES.map((stage) => [stage, describeStage(stage).label])],
  )}${filterSelect("Language", "poolLanguage", chosen.poolLanguage, valueOptions(all, "language", "Any language"))}${filterSelect(
    "Service", "poolService", chosen.poolService, valueOptions(all, "service", "Any service"),
  )}${filterSelect("Prepared by", "poolPreparer", chosen.poolPreparer, personOptions(people))}${filterSelect(
    "Reviewed by", "poolReviewer", chosen.poolReviewer, personOptions(people),
  )}</div>`;
  const summary = `<p class="pool-summary"><span role="status">Showing ${shown.length} of ${all.length} cases</span> ${
    narrowed
      ? button("Clear filters", "clear-pool-filters", "text")
      : `<span class="field-note">No filters. Showing every case this season.</span>`
  }</p>`;
  const body = shown.length
    ? `<div class="board-table-wrap"><table class="board-table pool-table"><thead><tr><th scope="col">Application ID</th><th scope="col">Stage</th><th scope="col">Language</th><th scope="col">Service</th><th scope="col">Preparer</th><th scope="col">Reviewer</th><th scope="col">Updated</th></tr></thead><tbody>${shown
        .map((record) => poolRow(record, now))
        .join("")}</tbody></table></div>`
    : `<div class="empty-state"><p>No case matches these filters.</p></div>`;
  return `<section class="panel case-pool" aria-labelledby="pool-title"><h2 id="pool-title">All cases</h2>${tabs}${filters}${summary}${body}<p class="field-note board-note">${icon("lock")} This pool shows workflow only: no taxpayer names, no addresses and no document contents.</p></section>`;
}
