import { esc, icon, button, caseButton, stageBadge } from "./ui.mjs";
import { adminEligibility, openFollowupCount, remindedNote } from "./admin-views.mjs";
import {
  when,
  explain,
  stageWork,
  isAvailableWork,
  boardFilters,
  CHOOSE_PERSONA,
} from "./staff-views.mjs";

// Sam's office screens that are not one case: the Follow-ups queue. Pure
// functions of records and one persona, exactly like `admin-views.mjs` — no
// state, no store, no timers, no DOM — and the same four conventions hold:
//
//   * workflow buttons carry `data-case-action` with a name from CASE_ACTIONS;
//   * assistance controls carry `data-assistance-action` with `data-item-id`;
//   * navigation, filters and dialogs carry `data-action`;
//   * a person who may not do something sees the reason, not a missing button.
//
// Nothing here sends a message: a reminder is recorded, never sent. Imports go
// one way only, from here into `admin-views.mjs`, never back.

export const QUEUE_KINDS = Object.freeze([
  ["intake", "Intake checks"],
  ["call", "Call the client"],
  ["help", "Help request"],
  ["unclaimed", "Unclaimed work"],
]);
const KIND_VALUES = Object.freeze(QUEUE_KINDS.map(([value]) => value));
const KIND_LABELS = Object.freeze(Object.fromEntries(QUEUE_KINDS));
const KIND_ICONS = Object.freeze({ intake: "shield", call: "phone", help: "help", unclaimed: "user" });

const calendarDay = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
export function waitingDays(value, now = Date.now()) {
  const at = new Date(value ?? "");
  if (Number.isNaN(at.getTime())) return null;
  return Math.max(0, Math.round((calendarDay(new Date(now)) - calendarDay(at)) / 86_400_000));
}
export const waitingLabel = (days) =>
  days === null || days === undefined ? "—" : days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`;
// Amber at three days, red at five (the design's rule). The words carry the
// same fact, so the color is never the only signal.
const waitingTone = (days) => (days >= 5 ? "late" : days >= 3 ? "aging" : "");

export function followupQueue(cases = [], assistance = [], now = Date.now()) {
  const records = Array.isArray(cases) ? cases : [];
  const rows = [];
  for (const record of records) {
    if (record?.stage === "received" && !record?.intakeVerified)
      rows.push({ kind: "intake", record, item: null, draft: false, since: record.updatedAt });
    else if (record?.stage === "draft" && record?.ownerUserId === null)
      rows.push({ kind: "intake", record, item: null, draft: true, since: record.updatedAt });
    if (isAvailableWork(record))
      rows.push({ kind: "unclaimed", record, item: null, draft: false, since: record.updatedAt });
    if (openFollowupCount(record))
      rows.push({ kind: "call", record, item: null, draft: false, since: record.updatedAt });
  }
  for (const item of Array.isArray(assistance) ? assistance : [])
    if (item?.status === "open" || item?.status === "assigned")
      rows.push({
        kind: "help",
        record: records.find((record) => record?.id === item?.caseId) ?? null,
        item,
        draft: false,
        since: item.createdAt,
      });
  return rows
    .map(({ since, ...row }) => ({ ...row, days: waitingDays(since, now) }))
    .sort(
      (a, b) =>
        (b.days ?? -1) - (a.days ?? -1) ||
        KIND_VALUES.indexOf(a.kind) - KIND_VALUES.indexOf(b.kind) ||
        String(a.record?.reference ?? "").localeCompare(String(b.record?.reference ?? "")),
    );
}

export function officeFilters(filters) {
  const kind = String(filters?.officeKind ?? "");
  return {
    kind: KIND_VALUES.includes(kind) ? kind : "all",
    language: boardFilters(filters).language,
  };
}

const rowLanguage = (row) => row.record?.answers?.language || row.item?.language || "";
const inLanguage = (row, chosen) => chosen.language === "all" || rowLanguage(row) === chosen.language;

export function queueCounts(rows, chosen) {
  const inScope = rows.filter((row) => inLanguage(row, chosen));
  return Object.fromEntries([
    ["all", inScope.length],
    ...KIND_VALUES.map((kind) => [kind, inScope.filter((row) => row.kind === kind).length]),
  ]);
}

// ---------------------------------------------------------------------------
// The Follow-ups page
// ---------------------------------------------------------------------------

function needed(row) {
  const { kind, record, item } = row;
  if (kind === "intake")
    return esc(
      row.draft
        ? "The office started this one and has not sent it yet. Finish the answers and send it."
        : stageWork(record.stage).work,
    );
  if (kind === "unclaimed") return `${esc(stageWork(record.stage).work)}${remindedNote(record)}`;
  if (kind === "call") {
    const n = openFollowupCount(record);
    const owed = record?.followupAssigneeNames ?? [];
    return `${esc(n)} open ${n === 1 ? "task" : "tasks"}${when(owed.length, ` · waiting on ${esc(owed.join(", "))}`)}`;
  }
  return `${esc(item?.title)}${when(item?.assigneeName, `<small>Helper: ${esc(item.assigneeName)}</small>`)}`;
}

function rowAction(row, person, ui) {
  const busy = ui.busy ? "disabled" : "";
  const { kind, record, item } = row;
  const id = esc(record?.id ?? "");
  if (kind === "intake")
    return button(
      `${icon("arrow")} ${row.draft ? "Finish and send" : "Record intake checks"}`,
      "open-case",
      "primary",
      `data-case-id="${id}"`,
    );
  if (kind === "unclaimed") {
    const rights = adminEligibility({ caseRecord: record }, person);
    return rights.remind.allowed
      ? caseButton(`${icon("clock")} Send a reminder`, "REMIND", "secondary", `data-case-id="${id}" ${busy}`)
      : explain(rights.remind);
  }
  if (kind === "call")
    return button(`${icon("phone")} Log a call`, "open-log-call", "primary", `data-case-id="${id}" ${busy}`);
  const rights = adminEligibility({ item }, person);
  if (item?.status === "open")
    return rights.claimAssistance.allowed
      ? `<button type="button" class="btn primary" data-assistance-action="CLAIM" data-item-id="${esc(item.id)}" ${busy}>${icon("user")} Take this request</button>`
      : explain(rights.claimAssistance);
  return rights.resolveAssistance.allowed
    ? button(`${icon("check")} Record as resolved`, "open-resolve-help", "secondary", `data-item-id="${esc(item.id)}" ${busy}`)
    : explain(rights.resolveAssistance);
}

function queueRow(row, person, ui) {
  const { kind, record, item } = row;
  // A help request can name a case this window's list doesn't hold; say so
  // rather than claiming there is no case.
  const client = record
    ? `<button class="board-reference" data-action="open-case" data-case-id="${esc(record.id)}">${esc(record.reference ?? "This case")}</button>${stageBadge(record.stage)}`
    : item?.caseId
      ? '<span class="muted">A case in this workspace</span>'
      : '<span class="muted">No case yet</span>';
  return `<tr class="queue-row" data-kind="${kind}"><td><span class="kind-pill ${kind}">${icon(KIND_ICONS[kind])} ${esc(KIND_LABELS[kind])}</span></td><th scope="row">${client}</th><td class="queue-needed">${needed(row)}</td><td>${esc(rowLanguage(row) || "—")}</td><td>${esc(item?.contactPreference || "—")}</td><td class="queue-waiting ${waitingTone(row.days)}">${esc(waitingLabel(row.days))}</td><td class="queue-action">${rowAction(row, person, ui)}</td></tr>`;
}

/**
 * The office queue: everything waiting on the office in one table, most urgent
 * first. Resolved help requests leave it on purpose; it lists work still to do.
 *
 * @param {object[]} cases      decorated Cases (`decorateStaffCase`)
 * @param {object[]} assistance `listAssistance()`, decorated with helper names
 * @param {object}   ui         `{person, filters, busy, now}`
 */
export function renderFollowups(cases = [], assistance = [], ui = {}) {
  const view = ui ?? {};
  const person = view.person ?? null;
  const chosen = officeFilters(view.filters);
  const rows = followupQueue(cases, assistance, view.now ?? Date.now());
  const counts = queueCounts(rows, chosen);
  const scoped = rows.filter((row) => inLanguage(row, chosen));
  const over3 = scoped.filter((row) => (row.days ?? 0) >= 3).length;
  const shown = scoped.filter((row) => chosen.kind === "all" || row.kind === chosen.kind);
  const languages = [
    ...new Set(rows.map((row) => String(rowLanguage(row)).trim()).filter(Boolean)),
  ].sort();

  const toggles = `<div class="board-filters"><div class="filter-group" role="group" aria-label="Task type">${[
    ["all", "All"],
    ...QUEUE_KINDS,
  ]
    .map(([value, label]) =>
      button(
        `${esc(label)} <span class="tab-count">${esc(counts[value])}</span>`,
        "set-board-filter",
        chosen.kind === value ? "chip selected" : "chip",
        `data-filter="officeKind" data-value="${value}" aria-pressed="${chosen.kind === value}"`,
      ),
    )
    .join("")}</div></div>`;

  const chips = `<div class="board-filters"><div class="filter-group" role="group" aria-label="Language">${[
    ["all", "Any language"],
    ...languages.map((value) => [value, value]),
  ]
    .map(([value, label]) =>
      button(
        esc(label),
        "set-board-filter",
        chosen.language === value ? "chip selected" : "chip",
        `data-filter="language" data-value="${esc(value)}" aria-pressed="${chosen.language === value}"`,
      ),
    )
    .join("")}</div></div>`;

  const kindOn = chosen.kind !== "all";
  const languageOn = chosen.language !== "all";
  // Each button undoes one filter. `clear-board-filters` would also wipe the
  // volunteer board's saved choices, so it is never used here.
  const empty = `<div class="empty-state">${icon("check")}<p>${
    kindOn || languageOn ? "Nothing here matches these filters." : "Nothing is waiting on the office right now."
  }</p>${when(
    kindOn,
    button("Show every task", "set-board-filter", "secondary", 'data-filter="officeKind" data-value="all"'),
  )}${when(
    languageOn,
    button("Show all languages", "set-board-filter", "secondary", 'data-filter="language" data-value="all"'),
  )}</div>`;

  const table = `<div class="board-table-wrap"><table class="board-table queue-table"><thead><tr><th scope="col">Task</th><th scope="col">Client</th><th scope="col">What's needed</th><th scope="col">Language</th><th scope="col">Contact preference</th><th scope="col">Waiting</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead><tbody>${shown
    .map((row) => queueRow(row, person, view))
    .join("")}</tbody></table></div>`;

  return `<section class="panel office-queue" aria-labelledby="office-queue-title"><div class="section-head"><div><h2 id="office-queue-title" tabindex="-1">Office queue</h2> <span class="muted small">most urgent first</span></div><span class="muted small" role="status">${esc(counts.all)} open · ${esc(over3)} over 3 days</span></div>${toggles}${chips}${when(
    !person,
    `<p class="staff-reason" role="note">${icon("user")} ${esc(CHOOSE_PERSONA)} Until then this queue is read-only.</p>`,
  )}${shown.length ? table : empty}<p class="field-note board-note">Waiting turns amber at 3 days and red at 5. This queue shows workflow only: no taxpayer names, no addresses and no document contents.</p></section>`;
}
