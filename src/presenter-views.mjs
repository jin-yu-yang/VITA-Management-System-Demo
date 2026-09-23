import { esc, icon, button, select } from "./ui.mjs";
import { describeStage } from "./domain.mjs";
import { CHECKPOINTS } from "./contracts.mjs";

// The controls that belong to the person running the session, and nothing
// else. They are the two things only a presenter may do — rebuild the
// demonstration cases, and put one of them back to a chosen point in the
// story — together with the persona this window is acting as and a plain
// statement of which class workspace is on screen.
//
// Two rules this file keeps:
//
//   * **An applicant gets nothing at all.** `renderPresenterPanel` returns an
//     empty string for them: not a disabled button, not an explanation of a
//     control they cannot use. The database refuses them anyway — both entry
//     points check the caller's access before they reserve anything — so this
//     is the screen agreeing with the server rather than guarding it.
//   * **Nothing here decides anything.** The persona is a local view choice,
//     re-checked server-side on every action; the panel is a pure function of
//     what it is handed and holds no state of its own.

const when = (condition, html) => (condition ? html : "");

// What each checkpoint restores, said as the moment it puts the case back to
// rather than as the name the database knows it by.
const CHECKPOINT_LABELS = Object.freeze({
  intake_ready: "Waiting for a preparer",
  document_requested: "Waiting on a document",
  admin_followup_needed: "Waiting for a call from the office",
  ready_for_review: "Waiting for a reviewer",
  corrections_required: "Sent back for corrections",
});

const CONNECTION_LABELS = Object.freeze({
  online: "Connected",
  reconnecting: "Reconnecting",
  offline: "No connection",
});

// A workspace id is a UUID, which nobody reads aloud. Its first block is
// enough to tell two class workspaces apart on a projector.
const shortWorkspace = (id) => String(id ?? "").split("-")[0] || "unknown";

function personaPicker(people = [], selectedPersonId = null) {
  if (!people.length) return "";
  return `<div class="persona-block"><h3 id="persona-title">Acting as</h3><p class="field-note">Choose the volunteer this window is working as. The choice is local to this window and travels with staff actions only.</p><div class="persona-row" role="group" aria-labelledby="persona-title">${people
    .map((person) =>
      button(
        `${icon("user")} ${esc(person.name)}<small>${esc(person.capabilities?.join(", ") ?? "")}</small>`,
        "select-person",
        selectedPersonId === person.id ? "secondary selected" : "secondary",
        `data-person-id="${esc(person.id)}" aria-pressed="${selectedPersonId === person.id}"`,
      ),
    )
    .join("")}</div></div>`;
}

/**
 * The presenter's own panel.
 *
 * @param {object} view
 * @param {{access:string}|null} view.principal   who is signed in
 * @param {object[]} view.people                  `listPeople()`
 * @param {string|null} view.selectedPersonId     the persona this window acts as
 * @param {string} view.connection                the controller's connection state
 * @param {{id:string,fixtureGeneration:number}|null} view.workspace
 * @param {object[]} view.cases                   `listCases()`, for the sample count
 * @returns {string} HTML, or '' for anybody who is not a presenter
 */
export function renderPresenterPanel({
  principal = null,
  people = [],
  selectedPersonId = null,
  connection = "unknown",
  workspace = null,
  cases = [],
} = {}) {
  if (principal?.access !== "presenter") return "";
  const roster = Array.isArray(people) ? people : [];
  const records = Array.isArray(cases) ? cases : [];
  const samples = records.filter((record) => record?.fixture);
  const generation = workspace?.fixtureGeneration;
  return `<section class="panel presenter-panel" aria-labelledby="presenter-title"><div class="section-head"><h2 id="presenter-title">${icon("play")} Presenter controls</h2><span class="muted small" data-role="fixture-indicator">Class workspace ${esc(
    shortWorkspace(workspace?.id ?? principal?.workspaceId),
  )} · sample set ${esc(generation === undefined || generation === null ? "not loaded" : generation)} · ${esc(
    samples.length,
  )} sample ${samples.length === 1 ? "case" : "cases"}</span></div><p class="field-note">These controls belong to the person running the session. Everybody else in the room keeps working while they run, and every client, name and document in them is invented.</p><p class="connection-line" role="status">${icon(
    connection === "online" ? "check" : "clock",
  )} ${esc(CONNECTION_LABELS[connection] ?? "Checking the connection")}</p>${personaPicker(
    roster,
    selectedPersonId,
  )}<div class="presenter-actions">${button(
    `${icon("clock")} Load a sample checkpoint`,
    "open-checkpoint",
    "secondary",
  )}${button(`${icon("refresh")} Reset sample cases`, "open-reset-fixtures", "secondary")}${button(
    `${icon("spark")} Fill fictional details`,
    "fill-assisted-intake",
    "demo",
  )}</div><p class="field-note">A reset rebuilds the ${esc(
    samples.length || "six",
  )} sample cases from scratch. Applications this class created are not touched by it, and neither is anybody's sign-in.</p></section>`;
}

/**
 * The confirmation for a reset. It says what goes and what stays, because the
 * cases about to be replaced are the ones on the projector.
 */
export function resetDialogBody(state = {}) {
  const samples = (state.cases ?? []).filter((record) => record?.fixture);
  return `<p>This rebuilds the ${esc(samples.length || "six")} sample cases and the sample request for help with forms. They get new Application IDs, so any sample case open in another window is replaced.</p><div class="info-note">${icon(
    "shield",
  )}<p>Applications this class created stay exactly as they are, and so do every sign-in, every volunteer persona and the office's own settings. Nobody is emailed.</p></div>${button(
    "Reset the sample cases",
    "confirm-reset-fixtures",
    "primary full",
  )}${button("Keep them as they are", "close-dialog", "text")}`;
}

/**
 * The confirmation for a checkpoint: which sample case, and which point in the
 * story. The case keeps its Application ID, so a link already open stays good.
 */
export function checkpointDialogBody(state = {}) {
  const samples = (state.cases ?? []).filter((record) => record?.fixture);
  if (!samples.length)
    return `<p>There are no sample cases in this workspace yet.</p><div class="info-note">${icon(
      "help",
    )}<p>Reset the sample cases first; that is what creates them.</p></div>${button(
      "Reset the sample cases",
      "open-reset-fixtures",
      "primary full",
    )}${button("Close", "close-dialog", "text")}`;
  const cases = samples.map((record) => [
    record.id,
    `${record.reference ?? "Sample case"} · ${describeStage(record.stage).label}`,
  ]);
  const points = CHECKPOINTS.map((name) => [name, CHECKPOINT_LABELS[name]]);
  return `<p>This puts one sample case back to a chosen point in the story. It keeps its Application ID and its client, and replaces the work recorded on it.</p><form id="checkpoint-form" class="staff-form">${select(
    "Sample case",
    "caseId",
    "",
    cases,
    "required",
    "checkpoint",
  )}${select(
    "Point in the story",
    "checkpoint",
    "",
    points,
    "required",
    "checkpoint",
  )}<div class="info-note">${icon(
    "help",
  )}<p>The records it writes are simulated, and the case's history says so. Nothing is filed, signed or sent.</p></div><button type="submit" class="btn primary full">Load this checkpoint</button></form>${button(
    "Leave this case as it is",
    "close-dialog",
    "text",
  )}`;
}
