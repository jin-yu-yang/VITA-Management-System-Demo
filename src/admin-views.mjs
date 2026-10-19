import {
  esc,
  icon,
  button,
  caseButton,
  caseSubmit,
  textarea,
  select,
  fieldId,
  formatTime,
  confirmBody,
  emptyLine,
} from "./ui.mjs";
import {
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
  caseTabs,
  caseDetails,
  intakeAnswersTab,
  documentsPanel,
  documentChecklist,
  historyPanel,
  staffEligibility,
  isAvailableWork,
  REQUEST_STATUS,
  FOLLOWUP_STATUS,
  CONTACT_OUTCOME_LABELS,
  CHOOSE_PERSONA,
  UNKNOWN_PERSON,
  contactsPanel,
  logContactForm,
  taskContacts,
} from "./staff-views.mjs";

// The task's own list lives beside the Contacts tab, in staff-views.mjs, and
// the office drawer takes it from here as it always took the attempt list.
export { taskContacts };

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

export const OFFICE_NOTE =
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
  "screening",
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
    if (stage !== "screening")
      return refused(
        stage === "received"
          ? "Screening starts when an admin opens the case."
          : record.intakeVerified
            ? "The simulated intake checks are already recorded."
            : "The intake checks are recorded during screening, before preparation.",
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
    if (["review_approved", "ready_to_efile", "efiled"].includes(stage))
      return refused("An approved case is not closed from here.");
    if (stage === "draft" && record.ownerUserId)
      return refused("A client's own draft is theirs to finish or leave.");
    if (stage !== "draft" && !CLOSABLE_STAGES.includes(stage))
      return refused("This case cannot be closed at this stage.");
    return allowed;
  };

  const markReadyToEfile = () => {
    const stopped = gate("admin");
    if (stopped) return stopped;
    if (stage !== "review_approved")
      return refused("This is recorded once the reviewer has approved the return.");
    // The reviewer's call with the client comes first, as the database checks.
    // A full case carries its reviews; a list row carries only reviewContactStatus.
    const call =
      record.reviewContactStatus ??
      (record.reviews ?? []).findLast((review) => review?.status === "approved")
        ?.clientContactStatus;
    return call === "completed"
      ? allowed
      : refused("The reviewer still needs to record the conversation with the client.");
  };

  const markEfiled = () => {
    const stopped = gate("admin");
    if (stopped) return stopped;
    return stage === "ready_to_efile"
      ? allowed
      : refused("This is recorded once the client has signed Form 8879.");
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
    markReadyToEfile: markReadyToEfile(),
    markEfiled: markEfiled(),
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

const outcomeOptions = (values) =>
  values.map((value) => [value, named(CONTACT_OUTCOME_LABELS, value, value)]);

export const openFollowups = (record) =>
  (record?.followups ?? []).filter((task) => task?.status === "open");

// A board row is a scalar Case and carries no follow-up records at all, so the
// count comes from the summary the presenter list attaches instead (Ruling
// R56). An opened case carries the records themselves and is counted from
// them, which is always the more exact of the two.
export const openFollowupCount = (record) =>
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
export const remindedNote = (record) =>
  when(
    record?.lastRemindedAt,
    `<p class="staff-reason" role="status">${icon("clock")} Reminder recorded. No external message sent. Last reminded ${esc(
      formatTime(record?.lastRemindedAt),
    )}${when(record?.lastRemindedByName, ` by ${esc(record?.lastRemindedByName)}`)}.</p>`,
  );

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

// An office draft is entered on the Add a case page, not here.
function continueInAddCase(record, rights) {
  const head = '<div class="section-head"><h2 id="assisted-case-title">The answers the office entered</h2></div>';
  return `<section class="panel" aria-labelledby="assisted-case-title">${head}${
    rights.assistedIntake.allowed
      ? `<p class="field-note">${esc("This walk-in client's answers are entered in Add a case.")}</p>${button(
          `${icon("arrow")} Continue in Add a case`,
          "continue-add-case",
          "primary",
          `data-case-id="${esc(record.id)}"`,
        )}`
      : explain(rights.assistedIntake)
  }</section>`;
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
    : `${emptyLine("No document request on this case is waiting for a response.")}${when(
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

// The two forms an assignee uses on an open task: the shared Log contact form,
// linked to the task, then Resolve. Shared by the case page's Follow-up tab
// and the office queue's Log contact drawer, so the two can never ask for
// different things; the Contacts tab draws the same form, unlinked.
export function followupForms(record, task, person, ui = {}) {
  const busy = ui.busy ? "disabled" : "";
  const rights = adminEligibility({ caseRecord: record, followup: task }, person);
  if (!rights.recordContact.allowed) return explain(rights.recordContact);
  const resolveScope = `resolve-${task?.id ?? "task"}`;
  const hidden = `<input type="hidden" name="followupId" value="${esc(task?.id ?? "")}">`;
  return `${logContactForm(record, person, ui, { followupId: task?.id ?? null })}<p class="field-note">Logging a contact never resolves the task, even when you reached the client. Resolving it is the separate step below.</p><form class="staff-form"><h4>Resolve this task</h4>${hidden}${select(
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
      )}<p class="field-note">Resolving closes the office's contact task only. It does not verify a document, change the preparer, or close the case.</p></form>`;
}

function followupTask(record, task, person, ui) {
  const request = requestById(record, task?.requestId);
  const answered = when(
    task?.status === "open" && request?.status === "awaiting_verification",
    `<p class="field-note" role="status">${icon(
      "file",
    )} The client responded; awaiting preparer verification. Resolving this task does not verify the document.</p>`,
  );
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
  )}${answered}<h4>Contacts so far</h4>${taskContacts(record, task)}${when(
    task?.resolutionNote,
    `<p class="field-note">${icon("check")} ${esc(
      named(CONTACT_OUTCOME_LABELS, task?.resolutionOutcome, "Resolved"),
    )} — ${esc(task.resolutionNote)}</p>`,
  )}${when(task?.status === "open", followupForms(record, task, person, ui))}</li>`;
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
      : emptyLine("No office follow-up has been raised on this case.")
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
  }${when(
    record.stage === "review_approved",
    `<h3>Form 8879</h3><p class="field-note">Record that the client signed Form 8879. The client is told.</p>${
      rights.markReadyToEfile.allowed
        ? button(
            `${icon("check")} Mark ready to e-file…`,
            "open-mark-ready-to-efile",
            "primary",
            busy,
          )
        : explain(rights.markReadyToEfile)
    }`,
  )}${when(
    record.stage === "ready_to_efile",
    `<h3>E-file</h3><p class="field-note">Record that the return was e-filed. The client is told.</p>${
      rights.markEfiled.allowed
        ? button(`${icon("check")} Mark e-filed…`, "open-mark-efiled", "primary", busy)
        : explain(rights.markEfiled)
    }`,
  )}<h3>Close this case</h3><p class="field-note">Closing cancels the pending document requests and office tasks <strong>in ViTally</strong>. It does not cancel, withdraw or amend any return filed elsewhere, and it changes nothing at any tax authority.</p>${
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
  return confirmBody({
    lead: `Closing <strong>${esc(
      record.reference ?? "this case",
    )}</strong> ends the office's work on it in ViTally. Its open document requests and office tasks are cancelled; their titles, reasons, notes and received documents stay exactly as they are.`,
    note: {
      icon: "shield",
      html: "This does not cancel, withdraw or amend any return filed elsewhere, and it changes nothing at any tax authority. The client is told the office closed the application.",
    },
    form: {
      fields: `${textarea(
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
      )}" name="confirmed" value="true" required><span>I understand this closes the case for everyone.</span></label>`,
    },
    confirm: caseSubmit(
      `${icon("close")} Close this case`,
      "CLOSE_CASE",
      "primary full",
      state.busy ? "disabled" : "",
    ),
    keep: "Keep it open",
  });
}

const clientName = (record) =>
  [record?.answers?.tp_first_name, record?.answers?.tp_last_name]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ") || "this client";

/** The Form 8879 confirmation: the client is told it was signed. */
export function markReadyToEfileDialogBody(state = {}) {
  const record = state.savedCase ?? {};
  return confirmBody({
    lead: `Mark <strong>${esc(record.reference ?? "this case")}</strong> for <strong>${esc(
      clientName(record),
    )}</strong> as ready to e-file?`,
    note: {
      icon: "shield",
      html: "The client will be told PCDC recorded that they signed Form 8879. This can't be undone.",
    },
    form: {
      fields: `<label class="checkbox-row" for="${fieldId(
        "confirmed",
        "ready-efile",
      )}"><input type="checkbox" id="${fieldId(
        "confirmed",
        "ready-efile",
      )}" name="confirmed" value="true" required><span>The client signed Form 8879.</span></label>`,
    },
    confirm: caseSubmit(
      `${icon("check")} Mark ready to e-file`,
      "MARK_READY_TO_EFILE",
      "primary full",
      state.busy ? "disabled" : "",
    ),
    keep: "Keep it as it is",
  });
}

/** The e-filed confirmation: the client is told the return was e-filed. */
export function markEfiledDialogBody(state = {}) {
  const record = state.savedCase ?? {};
  return confirmBody({
    lead: `Mark <strong>${esc(record.reference ?? "this case")}</strong> for <strong>${esc(
      clientName(record),
    )}</strong> as e-filed?`,
    note: {
      icon: "shield",
      html: "The client will be told their return was e-filed. This can't be undone.",
    },
    form: {
      fields: `<label class="checkbox-row" for="${fieldId(
        "confirmed",
        "efiled",
      )}"><input type="checkbox" id="${fieldId(
        "confirmed",
        "efiled",
      )}" name="confirmed" value="true" required><span>The return was e-filed.</span></label>`,
    },
    confirm: caseSubmit(
      `${icon("check")} Mark e-filed`,
      "MARK_EFILED",
      "primary full",
      state.busy ? "disabled" : "",
    ),
    keep: "Keep it as it is",
  });
}

/**
 * One case, as the office sees it: what the client answered, the simulated
 * intake checks, documents taken in at the desk, the contact tasks, and the two
 * office decisions, alongside the preparer and reviewer tabs, read-only, in
 * the same tabbed case page the preparer and reviewer use.
 *
 * @param {object} caseRecord a decorated staff Case (`decorateStaffCase`)
 * @param {object} ui `{person, busy, error, retryable, draftAnswers, openPanels, caseTab}`
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
  const origin = `<section class="panel" aria-labelledby="origin-title"><div class="section-head"><h2 id="origin-title">How this case reached the office</h2></div>${originRows(
    record,
  )}<p class="field-note">${esc(OFFICE_NOTE)}</p></section>`;
  const openFollowups = (record.followups ?? []).filter((task) => task?.status === "open").length;
  const panels = [
    [
      "overview",
      "Overview",
      [
        origin,
        intakeChecksPanel(record, rights, view),
        draftForOffice ? continueInAddCase(record, rights) : "",
        receiptPanel(record, person, view),
        officeActionsPanel(record, rights, view),
        caseDetails(record),
      ].join(""),
    ],
    [
      "intake",
      "Intake answers",
      // An office draft is entered in Add a case, so its tab reads like any
      // case's.
      intakeAnswersTab(record, staffRights, view, person),
    ],
    [
      "documents",
      "Documents",
      `${documentChecklist(record, staffRights, view)}${documentsPanel(record, staffRights, view)}`,
    ],
    ["followup", "Follow-up", adminFollowupPanel(record, person, view)],
    ["contacts", "Contacts", contactsPanel(record, person, view)],
    ["history", "History", historyPanel(record, Array.isArray(record.internalHistory))],
  ];
  return [
    problemNotice(view),
    caseHeader(record, person),
    caseTabs(panels, view.caseTab, {
      documents: (record.requests ?? []).length,
      followup: openFollowups,
      contacts: (record.contacts ?? []).length,
    }),
  ].join("");
}
