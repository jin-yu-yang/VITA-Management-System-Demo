import {
  esc,
  icon,
  button,
  caseButton,
  caseSubmit,
  input,
  textarea,
  select,
  fieldId,
  stageBadge,
  formatTime,
  ANSWER_LABELS,
} from "./ui.mjs";
import { describeStage, INTAKE_ANSWER_KEYS, submissionBlocker } from "./domain.mjs";
import {
  CONTACT_OUTCOMES,
  FOLLOWUP_RESOLUTION_OUTCOMES,
  INTAKE_CHECK_KEYS,
  SAMPLE_DOCUMENT_FILENAME,
} from "./case-actions.mjs";
import {
  when,
  named,
  explain,
  detailRow,
  problemNotice,
  caseHeader,
  answersPanel,
  documentsPanel,
  historyPanel,
  staffEligibility,
  isAvailableWork,
  boardFilters,
  stageWork,
  REQUEST_STATUS,
  FOLLOWUP_STATUS,
  CONTACT_OUTCOME_LABELS,
  CHOOSE_PERSONA,
  UNKNOWN_PERSON,
} from "./staff-views.mjs";

// Sam's side of the workspace: the office board and the office view of one
// case. Pure functions, exactly like `staff-views.mjs` — no state, no store, no
// timers, no DOM — and the same four conventions hold:
//
//   * workflow buttons carry `data-case-action` with a name from CASE_ACTIONS
//     and any related id in `data-request-id` / `data-followup-id`;
//   * assistance controls carry `data-assistance-action="CLAIM"|"RESOLVE"` with
//     `data-item-id`. Assistance is **not** a case action: it has its own RPC,
//     its own revision and its own list, so it has its own attribute and the
//     wiring layer validates it against its own vocabulary;
//   * navigation, filters and dialogs carry `data-action`;
//   * a person who may not do something sees the reason, not a missing button.
//     `adminEligibility` is the one place those rules live (Ruling R53).
//
// Every section that also exists on the preparer/reviewer screens is imported
// from `staff-views.mjs` rather than written again, so one case cannot describe
// itself two ways (Ruling R55).
//
// Nothing here claims a real identity check, a sent message, a signature or a
// filing. The intake checks are simulated attestations, a reminder records a
// nudge and sends nothing, and closure closes ViTally's own workflow only.

const OFFICE_NOTE =
  "ViTally records office work only. It sends no email, no letter and no text message.";

// ---------------------------------------------------------------------------
// Eligibility (Ruling R53) — one implementation, asked by the board and by the
// case workspace, so the two can never disagree about who may act.
// ---------------------------------------------------------------------------

const allowed = { allowed: true, reason: "" };
const refused = (reason) => ({ allowed: false, reason });

// A capability is a step-4 check in the database's order (contracts §"validation
// order"): the persona and what it is allowed to do at all come first, then the
// case's stage, then the target record's own state and who holds it. These
// refusals are in that order for the same reason the preparer's are — so the
// browser and the server refuse for the same reason, in the same sequence.
const NEEDS = Object.freeze({
  admin: "Needs office administrator access.",
  followup: "Needs office follow-up access.",
  receive_documents: "Needs office document-receipt access.",
  assist: "Needs client assistance access.",
});

const DOCUMENT_STAGES = Object.freeze(["preparing", "corrections_required"]);
// The stages `vitally_private.act_close_case` accepts, plus the assisted draft
// nobody owns. An approved review and a closed case are deliberately absent.
const CLOSABLE_STAGES = Object.freeze([
  "received",
  "preparation_ready",
  "preparing",
  "review_ready",
  "reviewing",
  "corrections_required",
]);

/**
 * What one office persona may do, on one case and on the related records the
 * screen is showing. Every answer is `{allowed, reason}`: a refusal carries the
 * sentence to show, because an absent button explains nothing.
 *
 * @param {object} targets `{caseRecord, followup, request, item}` — whichever
 *   the caller is about to render. Each is optional; a decision about a target
 *   that was not supplied refuses rather than guessing.
 * @param {{id:string,name:string,capabilities:string[]}|null} person
 */
export function adminEligibility({ caseRecord, followup, request, item } = {}, person) {
  const record = caseRecord ?? {};
  const stage = record.stage;
  const id = person?.id ?? null;
  const capabilities = Array.isArray(person?.capabilities) ? person.capabilities : [];
  const has = (capability) => capabilities.includes(capability);

  // Persona first, then the capability: both are refused before any target is
  // inspected, so an ineligible persona learns nothing about the record.
  const gate = (capability) => {
    if (!id) return refused(CHOOSE_PERSONA);
    if (!has(capability)) return refused(NEEDS[capability]);
    return null;
  };

  const verifyIntake = () => {
    const stopped = gate("admin");
    if (stopped) return stopped;
    if (stage === "draft")
      return refused("The client has not sent this application yet.");
    if (stage !== "received")
      return refused(
        record.intakeVerified
          ? "The simulated intake checks are already recorded."
          : "The intake checks are recorded when an application arrives, before preparation.",
      );
    return allowed;
  };

  const remind = () => {
    const stopped = gate("admin");
    if (stopped) return stopped;
    if (!isAvailableWork(record))
      return refused("A reminder is only for work nobody has claimed yet.");
    return allowed;
  };

  const closeCase = () => {
    const stopped = gate("admin");
    if (stopped) return stopped;
    if (stage === "closed") return refused("This case is already closed.");
    if (stage === "review_approved")
      return refused("An approved case is not closed from here.");
    if (stage === "draft" && record.ownerUserId)
      return refused("A client's own draft is theirs to finish or leave.");
    if (stage !== "draft" && !CLOSABLE_STAGES.includes(stage))
      return refused("This case cannot be closed at this stage.");
    return allowed;
  };

  // Starting an assisted application needs no case at all.
  const assistedIntake = () => gate("admin") ?? allowed;

  // The office contacts a client about one task. The assignment is the
  // server's (`ESCALATE_CONTACT` reads the workspace default), so there is no
  // assignee selector anywhere and no way to take a task from someone else.
  const followupWork = () => {
    const stopped = gate("followup");
    if (stopped) return stopped;
    if (!followup) return refused("This task is no longer on screen.");
    if (followup.assigneeId !== id)
      return refused("The office assigned this task to someone else.");
    if (followup.status !== "open")
      return refused(
        followup.status === "cancelled"
          ? "This task was cancelled when the case closed."
          : "This task is already resolved.",
      );
    return allowed;
  };

  const recordDocumentResponse = () => {
    const stopped = gate("receive_documents");
    if (stopped) return stopped;
    if (record.ownerUserId)
      return refused("This client has their own account, so they send it themselves.");
    if (!DOCUMENT_STAGES.includes(stage))
      return refused("A document is recorded while the case is being prepared.");
    if (!request) return refused("This request is no longer on screen.");
    if (request.status !== "open")
      return refused("This request is not waiting for a document.");
    return allowed;
  };

  const claimAssistance = () => {
    const stopped = gate("assist");
    if (stopped) return stopped;
    if (!item) return refused("This request is no longer on screen.");
    if (item.status !== "open")
      return refused(
        item.status === "assigned"
          ? "Someone is already helping with this request."
          : "This request is already resolved.",
      );
    return allowed;
  };

  const resolveAssistance = () => {
    const stopped = gate("assist");
    if (stopped) return stopped;
    if (!item) return refused("This request is no longer on screen.");
    // Ruling R23: the status decides first, and only then who is holding it.
    if (item.status !== "assigned")
      return refused(
        item.status === "open"
          ? "Claim this request before resolving it."
          : "This request is already resolved.",
      );
    if (item.assigneeId !== id)
      return refused("Only the helper holding this request resolves it.");
    return allowed;
  };

  const contact = followupWork();
  return {
    personId: id,
    isAdmin: has("admin"),
    canFollowup: has("followup"),
    canReceiveDocuments: has("receive_documents"),
    canAssist: has("assist"),
    verifyIntake: verifyIntake(),
    remind: remind(),
    closeCase: closeCase(),
    assistedIntake: assistedIntake(),
    // One rule, two actions: the database checks the same capability, the same
    // assignment and the same open status for both.
    recordContact: contact,
    resolveFollowup: contact,
    recordDocumentResponse: recordDocumentResponse(),
    claimAssistance: claimAssistance(),
    resolveAssistance: resolveAssistance(),
  };
}

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

const ASSISTANCE_STATUS = Object.freeze({
  open: "Waiting for a helper",
  assigned: "Being helped",
  resolved: "Resolved",
});
const ASSISTANCE_TONE = Object.freeze({
  open: "blue",
  assigned: "amber",
  resolved: "green",
});

const outcomeOptions = (values) =>
  values.map((value) => [value, named(CONTACT_OUTCOME_LABELS, value, value)]);

const openFollowups = (record) =>
  (record?.followups ?? []).filter((task) => task?.status === "open");

// A board row is a scalar Case and carries no follow-up records at all, so the
// count comes from the summary the presenter list attaches instead (Ruling
// R56). An opened case carries the records themselves and is counted from
// them, which is always the more exact of the two.
const openFollowupCount = (record) =>
  Array.isArray(record?.followups)
    ? openFollowups(record).length
    : Number(record?.openFollowups ?? 0);

const requestById = (record, requestId) =>
  (record?.requests ?? []).find((entry) => entry?.id === requestId) ?? null;

// How this case started. A staff-entered case has no client account at all, and
// that is exactly how the database says so: `cases_origin_owner` (migration
// 001) allows a null owner only for an assisted or fixture case. The Case the
// store maps carries no `origin` column, so the owner is what the browser
// reads — and only an explicit `null` means it, because a record that simply
// does not carry the field says nothing about who owns the case.
const assisted = (record) => record?.ownerUserId === null;
const clientOwned = (record) => Boolean(record?.ownerUserId);

const originRows = (record) =>
  `${detailRow(
    "How it started",
    assisted(record)
      ? "Assisted (staff-entered)"
      : clientOwned(record)
        ? "The client's own application"
        : "Not recorded on this record",
  )}${detailRow(
    "Client account",
    assisted(record)
      ? "No client account"
      : clientOwned(record)
        ? "The client signs in for themselves"
        : "Not recorded on this record",
  )}`;

// A reminder is recorded, never sent. The sentence appears exactly when a
// reminder really landed, because `lastRemindedAt` is what an accepted REMIND
// writes — so it can never announce a refused one.
const remindedNote = (record) =>
  when(
    record?.lastRemindedAt,
    `<p class="staff-reason" role="status">${icon("clock")} Reminder recorded. No external message sent. Last reminded ${esc(
      formatTime(record?.lastRemindedAt),
    )}${when(record?.lastRemindedByName, ` by ${esc(record?.lastRemindedByName)}`)}.</p>`,
  );

// ---------------------------------------------------------------------------
// The office board
// ---------------------------------------------------------------------------

const boardCard = (record, body) =>
  `<article class="board-row"><div class="board-row-head"><button class="board-reference" data-action="open-case" data-case-id="${esc(
    record.id,
  )}">${esc(record.reference ?? "This case")} ${icon("chevron")}</button>${stageBadge(
    record.stage,
  )}</div>${body}</article>`;

function availableCard(record, rights, ui) {
  const busy = ui.busy ? "disabled" : "";
  return boardCard(
    record,
    `<p>${esc(stageWork(record.stage).work)}</p>${detailRow(
      "Language",
      record?.answers?.language,
    )}${detailRow(
      "Waiting since",
      record.updatedAt ? formatTime(record.updatedAt) : "—",
    )}${remindedNote(record)}<div class="board-actions">${
      rights.remind.allowed
        ? caseButton(
            `${icon("clock")} Send a reminder`,
            "REMIND",
            "secondary",
            `data-case-id="${esc(record.id)}" ${busy}`,
          )
        : explain(rights.remind)
    }</div>`,
  );
}

// A case waiting for a call. The language is the client's own intake answer;
// the contact preference is the one the office recorded when this client asked
// for help with their forms — an assistance item is the only place this demo
// stores one, so it is read from the item linked to the same case and says so
// plainly when there is none.
function followupCard(record, item) {
  const tasks = openFollowups(record);
  // A board row knows how many calls are owed and who owes them; the reasons
  // are on the case itself, which is where the call is recorded anyway.
  const owed = record?.followupAssigneeNames ?? [];
  return boardCard(
    record,
    `${detailRow("Open tasks", `${openFollowupCount(record)}`)}${detailRow(
      "Language",
      record?.answers?.language || item?.language,
    )}${detailRow(
      "Contact preference",
      item?.contactPreference || "Not recorded for this case",
    )}${
      tasks.length
        ? tasks
            .map(
              (task) =>
                `<p class="field-note">${icon("phone")} ${esc(task?.reason)} <small>${esc(
                  task?.assigneeName ?? UNKNOWN_PERSON,
                )}</small></p>`,
            )
            .join("")
        : when(
            owed.length,
            `<p class="field-note">${icon("phone")} Waiting on ${esc(owed.join(", "))}.</p>`,
          )
    }<p class="field-note">Open the case to record a call or resolve the task.</p>`,
  );
}

function assistanceCard(item, cases, rights, ui) {
  const busy = ui.busy ? "disabled" : "";
  const linked = (cases ?? []).find((record) => record?.id === item?.caseId) ?? null;
  const scope = `assist-${item?.id ?? "item"}`;
  const claim = when(
    item?.status === "open",
    rights.claimAssistance.allowed
      ? `<button type="button" class="btn primary" data-assistance-action="CLAIM" data-item-id="${esc(
          item.id,
        )}" ${busy}>${icon("user")} Take this request</button>`
      : explain(rights.claimAssistance),
  );
  const resolve = when(
    item?.status === "assigned",
    rights.resolveAssistance.allowed
      ? `<form class="staff-form">${textarea(
          "What you helped with",
          "note",
          "",
          'required maxlength="1000" rows="2"',
          scope,
        )}<button type="submit" class="btn primary" data-assistance-action="RESOLVE" data-item-id="${esc(
          item.id,
        )}" ${busy}>${icon("check")} Record this as resolved</button></form>`
      : explain(rights.resolveAssistance),
  );
  return `<article class="request-card"><div class="section-head"><h3>${esc(
    item?.title,
  )}</h3><span class="badge ${named(ASSISTANCE_TONE, item?.status, "neutral")}"><i></i>${esc(
    named(ASSISTANCE_STATUS, item?.status, "Request"),
  )}</span></div>${detailRow("Language", item?.language)}${detailRow(
    "Contact preference",
    item?.contactPreference,
  )}${detailRow(
    "Helper",
    item?.assigneeName ?? (item?.assigneeId ? UNKNOWN_PERSON : "Nobody yet"),
  )}${
    // The linked case is shown as a case — its own reference and its own stage
    // label. An assistance status is never rendered as a case stage, and a case
    // stage never as an assistance status: they are two different workflows.
    item?.caseId
      ? linked
        ? `<div class="detail-row"><span>Linked case</span><strong><button class="board-reference" data-action="open-case" data-case-id="${esc(
            linked.id,
          )}">${esc(linked.reference)} ${icon("chevron")}</button> ${esc(
            describeStage(linked.stage).label,
          )}</strong></div>`
        : detailRow("Linked case", "A case in this workspace")
      : detailRow("Linked case", "Not linked to a case")
  }${when(
    item?.resolutionNote,
    `<p class="field-note">${icon("check")} ${esc(item.resolutionNote)}</p>`,
  )}<p class="field-note">Requested ${esc(formatTime(item?.createdAt))}</p>${claim}${resolve}</article>`;
}

function assistedIntakePanel(ui) {
  const open = (ui.openPanels ?? []).includes("assisted-intake");
  const rights = ui.rights;
  return `<section class="panel" aria-labelledby="assisted-title"><div class="section-head"><h2 id="assisted-title">Assisted intake</h2></div><p>Enter a walk-in client's answers yourself. The case has no client account: the office owns it, and nobody is emailed or invited.</p>${
    rights.assistedIntake.allowed
      ? button(
          open
            ? `${icon("close")} Hide the assisted intake form`
            : `${icon("user")} Start an assisted application`,
          "toggle-assisted-intake",
          open ? "secondary" : "primary",
          `aria-expanded="${open}" ${ui.busy ? "disabled" : ""}`,
        )
      : explain(rights.assistedIntake)
  }${when(open && rights.assistedIntake.allowed, assistedIntakeForm(ui))}</section>`;
}

// The intake questions, as one flat staff form. The labels are the client's own
// (`ANSWER_LABELS`) and the order is `INTAKE_ANSWER_KEYS`, so the office and the
// client can never name the same question differently. Every control is a text
// box or a select — never a radio — so "Fill fictional details" can fill them
// all the same way, and so a half-typed form survives a re-render by id.
const ASSISTED_OPTIONS = Object.freeze({
  service: ["Same-day", "Drop-off", "Online"],
  year: ["2025"],
  language: ["English", "Cantonese", "Mandarin"],
  residenceState: ["PA", "NJ", "DE", "Other"],
  state: ["PA", "NJ", "DE"],
  rideshare: [
    ["yes", "Yes"],
    ["no", "No"],
    ["unsure", "Not sure"],
  ],
  other: [
    ["yes", "Yes"],
    ["no", "No"],
    ["unsure", "Not sure"],
  ],
  stocks: [
    ["yes", "Yes"],
    ["no", "No"],
    ["unsure", "Not sure"],
  ],
  helper: [
    ["self", "The taxpayer answered these questions"],
    ["helper", "Someone answered on their behalf"],
  ],
  documents: [
    ["ready", "Ready"],
    ["some", "Some are missing"],
    ["unsure", "Needs help checking"],
  ],
});

const answerField = (key, value, scope) =>
  Object.hasOwn(ASSISTED_OPTIONS, key)
    ? select(
        ANSWER_LABELS[key],
        key,
        value ?? "",
        ASSISTED_OPTIONS[key],
        "",
        scope,
      )
    : input(ANSWER_LABELS[key], key, value ?? "", "text", 'maxlength="200"', scope);

function assistedIntakeForm(ui) {
  const busy = ui.busy ? "disabled" : "";
  return `<form id="assisted-intake-form" class="staff-form"><h3>A walk-in client's answers</h3><p class="field-note">These are fictional demo answers. ${esc(
    OFFICE_NOTE,
  )}</p>${button(
    `${icon("spark")} Fill fictional details`,
    "fill-assisted-intake",
    "secondary",
    busy,
  )}<div class="form-grid">${INTAKE_ANSWER_KEYS.map((key) =>
    answerField(key, "", "assisted"),
  ).join(
    "",
  )}</div><button type="submit" class="btn primary" ${busy}>${icon("arrow")} Create this application</button><p class="field-note">Creating it saves a draft the office owns. You still record the intake checks and send it to the office from the case itself.</p></form>`;
}

const countLine = (label, value) =>
  `<span class="muted small">${esc(label)}: ${esc(value)}</span>`;

/**
 * The office board: the work waiting to be nudged, the cases waiting for a
 * call, the assistance requests, and the way in to an assisted application.
 *
 * @param {object[]} cases      decorated Cases (`decorateStaffCase`)
 * @param {object[]} assistance `listAssistance()`, decorated with helper names
 * @param {object}   ui         `{person, filters, busy, openPanels}`
 */
export function renderAdminBoard(cases = [], assistance = [], ui = {}) {
  const view = ui ?? {};
  const person = view.person ?? null;
  const records = Array.isArray(cases) ? cases : [];
  const items = Array.isArray(assistance) ? assistance : [];
  // One stored filter, read through the board's own defaults, so this screen
  // adds no second key scheme of its own (the window state holds it already).
  const language = boardFilters(view.filters).language;
  const inLanguage = (record) =>
    language === "all" || (record?.answers?.language ?? "") === language;
  const languages = [
    ...new Set(
      records.map((record) => String(record?.answers?.language ?? "").trim()).filter(Boolean),
    ),
  ].sort();

  const available = records.filter((record) => isAvailableWork(record) && inLanguage(record));
  const needsCall = records.filter(
    (record) => openFollowupCount(record) && inLanguage(record),
  );
  const rights = adminEligibility({}, person);
  const panelUi = { ...view, rights };

  const chips = `<div class="board-filters"><div class="filter-group" role="group" aria-label="Language">${[
    ["all", "Any language"],
    ...languages.map((value) => [value, value]),
  ]
    .map(([value, label]) =>
      button(
        esc(label),
        "set-board-filter",
        language === value ? "chip selected" : "chip",
        `data-filter="language" data-value="${esc(value)}" aria-pressed="${language === value}"`,
      ),
    )
    .join("")}</div></div>`;

  return `<section class="panel staff-board" aria-labelledby="office-title"><div class="section-head"><h2 id="office-title">Office work</h2>${countLine(
    "Cases",
    records.length,
  )}</div><p class="board-counts" role="status">${esc(available.length)} waiting to be claimed, ${esc(
    needsCall.length,
  )} waiting for a call, ${esc(
    items.filter((item) => item?.status === "open").length,
  )} assistance ${
    items.filter((item) => item?.status === "open").length === 1 ? "request" : "requests"
  } unclaimed.</p>${chips}${when(
    !person,
    `<p class="staff-reason" role="note">${icon("user")} ${esc(CHOOSE_PERSONA)} Until then this board is read-only.</p>`,
  )}<p class="field-note">This board shows workflow only: no taxpayer names, no addresses and no document contents.</p></section><section class="panel" aria-labelledby="available-title"><div class="section-head"><h2 id="available-title">Available work</h2>${countLine(
    "Waiting",
    available.length,
  )}</div><p class="field-note">${esc(
    OFFICE_NOTE,
  )} A reminder records a nudge in ViTally so the next volunteer sees it.</p>${
    available.length
      ? `<div class="board-list">${available
          .map((record) =>
            availableCard(record, adminEligibility({ caseRecord: record }, person), view),
          )
          .join("")}</div>`
      : '<p class="muted">Every case is claimed. Nothing needs a nudge right now.</p>'
  }</section><section class="panel" aria-labelledby="calls-title"><div class="section-head"><h2 id="calls-title">Follow-up needed</h2>${countLine(
    "Cases",
    needsCall.length,
  )}</div>${
    needsCall.length
      ? `<div class="board-list">${needsCall
          .map((record) =>
            followupCard(
              record,
              items.find((item) => item?.caseId === record?.id) ?? null,
            ),
          )
          .join("")}</div>`
      : '<p class="muted">No case on this board is waiting for a call. Each case lists its own office tasks.</p>'
  }</section><section class="panel" aria-labelledby="assistance-title"><div class="section-head"><h2 id="assistance-title">Assistance requests</h2>${countLine(
    "Requests",
    items.length,
  )}</div><p class="field-note">Helping a client with their own forms is separate from preparing a return: resolving a request changes nothing about the case's intake, stage or preparer.</p>${
    items.length
      ? items
          .map((item) =>
            assistanceCard(
              item,
              records,
              adminEligibility({ item }, person),
              view,
            ),
          )
          .join("")
      : '<p class="muted">No client has asked the office for help with their forms.</p>'
  }</section>${assistedIntakePanel(panelUi)}`;
}

// ---------------------------------------------------------------------------
// The office view of one case
// ---------------------------------------------------------------------------

const INTAKE_CHECK_LABELS = Object.freeze({
  interview: "A volunteer sat down with the client (simulated).",
  identity: "Identity documents were looked at (simulated).",
  documents: "The income documents on the list were seen (simulated).",
  consent: "The consent forms were explained and signed (simulated).",
});

function intakeChecksPanel(record, rights, ui) {
  const ticked = (key) => (ui.openPanels ?? []).includes(`intake-check-${key}`);
  const all = INTAKE_CHECK_KEYS.every(ticked);
  const body = rights.verifyIntake.allowed
    ? `<form class="staff-form">${INTAKE_CHECK_KEYS.map(
        (key) =>
          `<label class="checkbox-row small" for="${fieldId(key, "intake")}"><input type="checkbox" id="${fieldId(
            key,
            "intake",
          )}" name="${key}" value="true" ${ticked(key) ? "checked" : ""} data-action="toggle-intake-check" data-check="${key}"><span>${esc(
            INTAKE_CHECK_LABELS[key],
          )}</span></label>`,
      ).join("")}${caseSubmit(
        `${icon("shield")} Record the simulated intake checks`,
        "VERIFY_INTAKE",
        "primary",
        !all || ui.busy ? "disabled" : "",
      )}${when(
        !all,
        '<p class="field-note">Tick all four before recording them.</p>',
      )}</form>`
    : explain(rights.verifyIntake);
  return `<section class="panel" aria-labelledby="checks-title"><div class="section-head"><h2 id="checks-title">Simulated intake checks</h2><span class="badge ${
    record.intakeVerified ? "green" : "blue"
  }"><i></i>${record.intakeVerified ? "Recorded" : "Not recorded yet"}</span></div><p class="field-note">These are demo attestations for a course prototype. Ticking them records flags in ViTally; it is not an interview, an identity check, a document check or a consent signature, and it asserts that none of those happened.</p>${body}</section>`;
}

// Why the office cannot send this application yet, in the words of the answer
// that stands in the way. The server re-checks the *saved* answers, so that is
// what this reads — unsaved edits are named separately, because saving them is
// the step that would change the answer.
const SUBMISSION_BLOCKERS = Object.freeze({
  incomplete: "Some answers are still missing. Fill them in and save first.",
  year: "This prototype accepts tax year 2025 only.",
  residenceState:
    "A state outside PA, NJ and DE needs the office to check first; it cannot be sent from here.",
  helper:
    "An application answered on somebody else's behalf is handled by the office, not sent from here.",
  unsupported:
    "These answers are outside PCDC's current service scope, so this cannot be sent. That is a service limitation, not a judgement about anyone's taxes.",
  assistance:
    "Some screening answers still need checking with the client before this is sent.",
});

// The office's copy of the client intake form. Its boxes are rendered from the
// controller's **draft**, not from the saved case, exactly like the client's own
// `#intake-form` — which is why it carries an id: the wiring layer routes an
// edit in a form with that id into `controller.editAnswers`, so a re-render
// puts back what is on screen rather than what was last saved, and `dirty`, the
// unsaved notice and the SUBMIT lock all describe the same thing.
//
// The unsaved notice and the send button carry stable `data-role` hooks and the
// notice is always present (hidden when there is nothing to say), so a typed
// character can reveal the one and lock the other in place — rebuilding the page
// under the cursor is the defect that pattern exists to avoid (`paintCountdown`
// in `app.mjs` does the same for the resend countdown). Both are recomputed from
// state on the next real render, so the patch can only ever add the lock.
export const ASSISTED_ANSWERS_FORM_ID = "assisted-answers-form";

function assistedAnswersPanel(record, rights, ui) {
  const answers = ui.draftAnswers ?? record.answers ?? {};
  const blocker = submissionBlocker(record.answers ?? {});
  const busy = ui.busy ? "disabled" : "";
  const confirmed = (ui.openPanels ?? []).includes("confirmed");
  if (!rights.assistedIntake.allowed)
    return `<section class="panel" aria-labelledby="assisted-case-title"><div class="section-head"><h2 id="assisted-case-title">The answers the office entered</h2></div>${explain(
      rights.assistedIntake,
    )}</section>`;
  return `<section class="panel" aria-labelledby="assisted-case-title"><div class="section-head"><h2 id="assisted-case-title">The answers the office entered</h2></div><p class="field-note">This draft belongs to the office. ${esc(
    OFFICE_NOTE,
  )}</p><form id="${ASSISTED_ANSWERS_FORM_ID}" class="staff-form">${button(
    `${icon("spark")} Fill fictional details`,
    "fill-assisted-intake",
    "secondary",
    busy,
  )}<div class="form-grid">${INTAKE_ANSWER_KEYS.map((key) =>
    answerField(key, answers[key], "assisted"),
  ).join("")}</div>${caseSubmit(
    `${icon("check")} Save these answers`,
    "SAVE_ANSWERS",
    "secondary",
    busy,
  )}</form><label class="checkbox-row" for="field-confirmed"><input type="checkbox" id="field-confirmed" name="confirmed" ${
    confirmed ? "checked" : ""
  }><span>I have checked these answers with the client</span></label><p class="field-note">This confirms the answers on screen. It is not a signature on a tax or consent form.</p>${
    blocker
      ? `<p class="staff-reason" role="note">${icon("lock")} ${esc(
          named(SUBMISSION_BLOCKERS, blocker, "This cannot be sent yet."),
        )}</p>`
      : ""
  }<p class="staff-reason" role="note" data-role="assisted-unsaved" ${when(
    !ui.dirty,
    "hidden",
  )}>${icon(
    "clock",
  )} These edits are not saved yet. The office checks the saved answers, so save before sending.</p>${caseButton(
    `${icon("arrow")} Send this application to the office`,
    "SUBMIT",
    "primary",
    `data-role="assisted-submit" ${
      blocker || ui.dirty || !confirmed || ui.busy ? "disabled" : ""
    }`,
  )}</section>`;
}

function receiptPanel(record, person, ui) {
  const busy = ui.busy ? "disabled" : "";
  const requests = record.requests ?? [];
  const open = requests.filter((request) => request?.status === "open");
  const recorded = (record.documents ?? []).filter(
    (document) => document?.source === "staff_recorded",
  );
  const rights = adminEligibility(
    { caseRecord: record, request: open[0] ?? null },
    person,
  );
  const body = open.length
    ? open
        .map((request) => {
          const each = adminEligibility({ caseRecord: record, request }, person);
          return `<div class="request-card"><div class="section-head"><h3>${esc(
            request?.title,
          )}</h3><span class="badge blue"><i></i>${esc(
            named(REQUEST_STATUS, request?.status, "Requested"),
          )}</span></div><p>${esc(request?.message)}</p>${
            each.recordDocumentResponse.allowed
              ? caseButton(
                  `${icon("file")} Record sample document received`,
                  "RECORD_DOCUMENT_RESPONSE",
                  "primary",
                  `data-request-id="${esc(request.id)}" ${busy}`,
                )
              : explain(each.recordDocumentResponse)
          }</div>`;
        })
        .join("")
    : `<p class="muted">No document request on this case is waiting for a response.</p>${when(
        !rights.recordDocumentResponse.allowed && requests.length,
        explain(rights.recordDocumentResponse),
      )}`;
  return `<section class="panel" aria-labelledby="receipt-title"><div class="section-head"><h2 id="receipt-title">Documents the office took in</h2></div><p class="field-note">Requesting a document and verifying one are the preparer's work, shown above; this is the office's own step. The office records a document it received in person for a client with no account. It is marked <strong>staff-recorded</strong> and stays <strong>awaiting preparer verification</strong>: taking delivery is not verifying, and it never changes the preparer. The one fictional file this demo accepts is <code>${esc(
    SAMPLE_DOCUMENT_FILENAME,
  )}</code>.</p>${when(
    recorded.length,
    `<ul class="document-list">${recorded
      .map(
        (document) =>
          `<li>${icon("file")} ${esc(document.filename)} <small>staff-recorded · ${esc(
            named(
              REQUEST_STATUS,
              requestById(record, document.requestId)?.status,
              "Requested",
            ),
          )} · ${esc(formatTime(document.createdAt))}</small></li>`,
      )
      .join("")}</ul>`,
  )}${body}</section>`;
}

function attemptList(task) {
  const attempts = task?.attempts ?? [];
  if (!attempts.length)
    return '<p class="muted">No call has been recorded on this task yet.</p>';
  return `<ul class="attempt-list">${attempts
    .map(
      (attempt) =>
        `<li>${esc(
          named(CONTACT_OUTCOME_LABELS, attempt?.outcome, "Attempt"),
        )} · ${esc(attempt?.actorName ?? UNKNOWN_PERSON)} · ${esc(
          formatTime(attempt?.createdAt),
        )}<small>${esc(attempt?.note)}</small></li>`,
    )
    .join("")}</ul>`;
}

function followupTask(record, task, person, ui) {
  const busy = ui.busy ? "disabled" : "";
  const rights = adminEligibility({ caseRecord: record, followup: task }, person);
  const request = requestById(record, task?.requestId);
  const contactScope = `contact-${task?.id ?? "task"}`;
  const resolveScope = `resolve-${task?.id ?? "task"}`;
  const hidden = `<input type="hidden" name="followupId" value="${esc(task?.id ?? "")}">`;
  const answered = when(
    task?.status === "open" && request?.status === "awaiting_verification",
    `<p class="field-note" role="status">${icon(
      "file",
    )} The client responded; awaiting preparer verification. Resolving this task does not verify the document.</p>`,
  );
  const forms = rights.recordContact.allowed
    ? `<form class="staff-form"><h4>Record a call</h4>${hidden}${select(
        "What happened",
        "outcome",
        "",
        outcomeOptions(CONTACT_OUTCOMES),
        "required",
        contactScope,
      )}${textarea(
        "Note for the office",
        "note",
        "",
        'required maxlength="1000" rows="2"',
        contactScope,
      )}${caseSubmit(
        `${icon("phone")} Record this attempt`,
        "RECORD_CONTACT",
        "secondary",
        `data-followup-id="${esc(task?.id ?? "")}" ${busy}`,
      )}<p class="field-note">Recording an attempt never resolves the task, even when you reached the client. Resolving it is the separate step below.</p></form><form class="staff-form"><h4>Resolve this task</h4>${hidden}${select(
        "How it ended",
        "outcome",
        "",
        outcomeOptions(FOLLOWUP_RESOLUTION_OUTCOMES),
        "required",
        resolveScope,
      )}${textarea(
        "What the office concluded",
        "note",
        "",
        'required maxlength="1000" rows="2"',
        resolveScope,
      )}${caseSubmit(
        `${icon("check")} Resolve this task`,
        "RESOLVE_FOLLOWUP",
        "primary",
        `data-followup-id="${esc(task?.id ?? "")}" ${busy}`,
      )}<p class="field-note">Resolving closes the office's contact task only. It does not verify a document, change the preparer, or close the case.</p></form>`
    : explain(rights.recordContact);
  return `<li><div class="section-head"><h3>${esc(
    request?.title ?? "Contact the client",
  )}</h3><span class="badge ${task?.status === "open" ? "amber" : "green"}"><i></i>${esc(
    named(FOLLOWUP_STATUS, task?.status, "Task"),
  )}</span></div><p>${esc(task?.reason)}</p>${detailRow(
    "Assigned to",
    task?.assigneeName ?? (task?.assigneeId ? UNKNOWN_PERSON : "Nobody"),
  )}${detailRow(
    "Raised",
    task?.createdAt ? formatTime(task.createdAt) : "—",
  )}${answered}<h4>Calls so far</h4>${attemptList(task)}${when(
    task?.resolutionNote,
    `<p class="field-note">${icon("check")} ${esc(
      named(CONTACT_OUTCOME_LABELS, task?.resolutionOutcome, "Resolved"),
    )} — ${esc(task.resolutionNote)}</p>`,
  )}${when(task?.status === "open", forms)}</li>`;
}

function adminFollowupPanel(record, person, ui) {
  const tasks = record.followups ?? [];
  return `<section class="panel" aria-labelledby="office-followup-title"><div class="section-head"><h2 id="office-followup-title">Follow-up with the client</h2><span class="muted small">${esc(
    tasks.length,
  )} ${tasks.length === 1 ? "task" : "tasks"}</span></div><p class="field-note">The office raises a task when a preparer asks it to contact a client. ViTally assigns it; there is no way to hand it to someone else here.</p>${
    tasks.length
      ? `<ul class="followup-list">${tasks
          .map((task) => followupTask(record, task, person, ui))
          .join("")}</ul>`
      : '<p class="muted">No office follow-up has been raised on this case.</p>'
  }</section>`;
}

function officeActionsPanel(record, rights, ui) {
  const busy = ui.busy ? "disabled" : "";
  return `<section class="panel" aria-labelledby="office-actions-title"><div class="section-head"><h2 id="office-actions-title">Office decisions</h2></div><h3>Reminder</h3><p class="field-note">${esc(
    OFFICE_NOTE,
  )} A reminder records a nudge so the next volunteer sees this case is waiting.</p>${remindedNote(
    record,
  )}${
    rights.remind.allowed
      ? caseButton(`${icon("clock")} Send a reminder`, "REMIND", "secondary", busy)
      : explain(rights.remind)
  }<h3>Close this case</h3><p class="field-note">Closing cancels the pending document requests and office tasks <strong>in ViTally</strong>. It does not cancel, withdraw or amend any return filed elsewhere, and it changes nothing at any tax authority.</p>${
    rights.closeCase.allowed
      ? button(
          `${icon("close")} Close this case…`,
          "open-close-case",
          "secondary",
          busy,
        )
      : explain(rights.closeCase)
  }</section>`;
}

/**
 * The close-case dialog's body. It lives here, with the rest of the office
 * screens, and `views.mjs` only places it in the shared modal frame.
 */
export function closeCaseDialogBody(state = {}) {
  const record = state.savedCase ?? {};
  return `<p>Closing <strong>${esc(
    record.reference ?? "this case",
  )}</strong> ends the office's work on it in ViTally. Its open document requests and office tasks are cancelled; their titles, reasons, notes and received documents stay exactly as they are.</p><div class="info-note">${icon(
    "shield",
  )}<p>This does not cancel, withdraw or amend any return filed elsewhere, and it changes nothing at any tax authority. The client is told the office closed the application.</p></div><form class="staff-form">${textarea(
    "Why the office is closing this case",
    "reason",
    "",
    'required maxlength="1000" rows="3"',
    "close",
  )}<label class="checkbox-row" for="${fieldId(
    "confirmed",
    "close",
  )}"><input type="checkbox" id="${fieldId(
    "confirmed",
    "close",
  )}" name="confirmed" value="true" required><span>I understand this closes the case for everyone.</span></label>${caseSubmit(
    `${icon("close")} Close this case`,
    "CLOSE_CASE",
    "primary full",
    state.busy ? "disabled" : "",
  )}</form>${button("Keep it open", "close-dialog", "text")}`;
}

/**
 * One case, as the office sees it: what the client answered, the simulated
 * intake checks, documents taken in at the desk, the contact tasks, and the two
 * office decisions. The preparer and reviewer sections stay where they are —
 * this screen reuses them, read-only, and never claims their work.
 *
 * @param {object} caseRecord a decorated staff Case (`decorateStaffCase`)
 * @param {object} ui `{person, busy, error, retryable, draftAnswers, openPanels}`
 */
export function renderAdminCase(caseRecord, ui = {}) {
  const record = caseRecord ?? {};
  const view = ui ?? {};
  const person = view.person ?? null;
  const rights = adminEligibility({ caseRecord: record }, person);
  // The preparer's own rules still decide the preparation sections; an office
  // persona is refused there, in the preparer screen's own words.
  const staffRights = staffEligibility(record, person);
  const draftForOffice = record.stage === "draft" && assisted(record);
  return [
    problemNotice(view),
    caseHeader(record, person),
    `<section class="panel" aria-labelledby="origin-title"><div class="section-head"><h2 id="origin-title">How this case reached the office</h2></div>${originRows(
      record,
    )}${detailRow("Stage", describeStage(record.stage).label)}<p class="field-note">${esc(
      OFFICE_NOTE,
    )}</p></section>`,
    draftForOffice
      ? assistedAnswersPanel(record, rights, view)
      : answersPanel(record),
    intakeChecksPanel(record, rights, view),
    documentsPanel(record, staffRights, view),
    receiptPanel(record, person, view),
    adminFollowupPanel(record, person, view),
    officeActionsPanel(record, rights, view),
    historyPanel(record, Array.isArray(record.internalHistory)),
  ].join("");
}
