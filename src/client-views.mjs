import {
  esc,
  icon,
  button,
  caseButton,
  input,
  select,
  radio,
  stageBadge,
  formatTime,
  fieldId,
  ANSWER_LABELS as answerLabels,
} from "./ui.mjs";
import {
  describeStage,
  screening,
  missingAnswers,
  submissionBlocker,
} from "./domain.mjs";

// Every client screen, as pure functions of one controller snapshot. No state,
// no store, no timers, no DOM: each returns an HTML string, and everything that
// came from a person or from the database is escaped on the way out.
//
// Two conventions hold throughout:
//   * workflow buttons carry `data-case-action` with a name from CASE_ACTIONS;
//   * navigation, dialogs and prototype helpers carry `data-action`, and are
//     never translated into a database action.
// Stage words are never written here — they come from `describeStage`.

const when = (condition, html) => (condition ? html : "");

const steps = [
  "Your visit",
  "Your situation",
  "Your details",
  "Check your answers",
];

const row = (label, value) =>
  `<div class="detail-row"><span>${esc(label)}</span><strong>${esc(value || "—")}</strong></div>`;

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

// Identical for every visitor. It names no roster, no account and no delivery
// channel, so reading it tells nobody whether an address is known here.
const troubleshooting = `<div class="support-note">${icon("help")}<div><strong>Didn’t get a code?</strong><p>A code can take a minute to arrive. Check the junk or spam folder, make sure the address is the one the office approved for this demo, and request another code once the timer ends.</p><p>Still stuck? A volunteer at the PCDC office can help in person.</p>${button("Get help from the office", "open-help", "inline")}</div></div>`;

function emailStep(state) {
  return `<form id="email-form" class="panel access-panel">${input(
    "Email address",
    "email",
    state.authEmail,
    "email",
    'required autocomplete="email" placeholder="you@example.org" maxlength="254"',
  )}<p class="field-note">We send a one-time code to this address. No password to remember, and no code is ever shown on this page.</p>${authFailure(state)}<button class="btn primary full" type="submit">Send verification code ${icon("arrow")}</button></form>`;
}

function codeStep(state) {
  const waiting = Number(state.resendSeconds) > 0;
  // The code is rendered from state, never blank. A re-render can arrive at any
  // moment — the countdown, a connection change, a realtime notification — and
  // a half-typed code must survive all of them, or the field is silently empty
  // when the person presses Verify and the required attribute stops the form
  // with nothing on screen to explain it.
  return `<form id="code-form" class="panel access-panel">${input(
    "Verification code",
    "code",
    state.authCode,
    "text",
    'required inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="6-digit code"',
  )}<p class="field-note">${when(state.authEmail, `Signing in as <strong>${esc(state.authEmail)}</strong>. `)}This confirms you can read that inbox. A volunteer verifies taxpayer identity separately.</p>${authFailure(state)}<button class="btn primary full" type="submit">Verify and continue ${icon("arrow")}</button><div class="resend-row"><span>Didn’t receive it?</span>${button(
    waiting ? `Resend code in ${esc(state.resendSeconds)}s` : "Resend code",
    "resend-code",
    "inline",
    waiting ? "disabled" : "",
  )}<span class="cooldown" role="status" data-role="resend-countdown">${when(waiting, `You can request another code in ${esc(state.resendSeconds)} seconds.`)}</span></div>${button("Use a different email address", "back-to-email", "text")}</form>`;
}

function authFailure(state) {
  if (!state.authError) return "";
  return `<p class="error" role="alert">${esc(state.authError.message)}</p>`;
}

export function accessScreen(state) {
  const onCode = state.authStep === "code";
  return `<main id="main" class="narrow" tabindex="-1"><div class="center-icon">${icon(onCode ? "lock" : "mail")}</div><div class="page-intro centered"><span class="overline">${onCode ? "CHECK YOUR INBOX" : "WELCOME TO VITALLY"}</span><h1>${onCode ? "Enter your code" : "Sign in with your email"}</h1><p>${
    onCode
      ? `${esc(state.authMessage)}`
      : "Use the email address the office approved for this demo. No password to remember."
  }</p></div>${onCode ? codeStep(state) : emailStep(state)}${troubleshooting}<p class="footnote">ViTally is a fictional walkthrough of the PCDC community tax service for tax year 2025. Never enter real taxpayer information.</p></main>`;
}

// ---------------------------------------------------------------------------
// My applications
// ---------------------------------------------------------------------------

function applicationRow(entry, updatedAt) {
  return `<button class="application-row" data-action="open-case" data-case-id="${esc(entry.id)}"><span class="application-reference">${esc(entry.reference)}</span><span class="application-stage">${stageBadge(entry.stage)}</span><span class="application-when">${updatedAt ? `Updated ${esc(updatedAt)}` : "No updates yet"}</span>${icon("chevron")}</button>`;
}

export function applicationsScreen(state) {
  const query = String(state.lookup ?? "").trim().toUpperCase();
  // The lookup searches this account's own applications and nothing else: an
  // unknown reference says only that it is not one of yours.
  const shown = query
    ? state.cases.filter((entry) =>
        String(entry.reference ?? "").toUpperCase().includes(query),
      )
    : state.cases;
  const updatedFor = (entry) =>
    state.savedCase?.id === entry.id
      ? formatTime(state.savedCase.history?.at(-1)?.createdAt)
      : "";
  const list = shown.length
    ? `<div class="application-list">${shown.map((entry) => applicationRow(entry, updatedFor(entry))).join("")}</div>`
    : query
      ? `<div class="notice amber" role="status">${icon("help")}<div><h3>We could not find that Application ID</h3><p>Check the characters and try again. This search only covers applications started with the email address you signed in with.</p></div></div>`
      : `<div class="panel empty-state">${icon("folder")}<h2>No applications yet</h2><p>Start one whenever you are ready. Nothing is sent to the office until you submit it.</p></div>`;
  return `<main id="main" class="narrow" tabindex="-1"><div class="page-intro"><span class="overline">YOUR APPLICATIONS</span><h1>My applications</h1><p>Every application you started with this email address. You can keep more than one for testing.</p></div><form id="lookup-form" class="lookup-form">${input(
    "Application ID",
    "lookup",
    state.lookup,
    "text",
    'autocomplete="off" placeholder="VT-XXXX-XXXX"',
  )}<button class="btn secondary" type="submit">${icon("search")} Find</button>${when(query, button("Show all", "clear-lookup", "text"))}</form>${list}<div class="start-row">${button(`${icon("file")} Start a new application`, "start-application", "primary full")}<p class="field-note">This creates one new fictional application. Reopening, refreshing or filling a form never creates another.</p></div></main>`;
}

// ---------------------------------------------------------------------------
// The generated reference card
// ---------------------------------------------------------------------------

export function referenceScreen(state) {
  const record = state.savedCase;
  if (!record) return applicationsScreen(state);
  return `<main id="main" class="narrow" tabindex="-1"><div class="center-icon success">${icon("check")}</div><div class="page-intro centered"><span class="overline">YOU’RE READY TO BEGIN</span><h1>A small card.<br>One less thing to remember.</h1><p>Keep your Application ID somewhere handy.<br>You’ll use it whenever you come back.</p></div><div class="reference-card"><span>ViTally <small>PCDC COMMUNITY TAX ASSISTANCE</small></span><p>YOUR APPLICATION ID</p><strong>${esc(record.reference)}</strong><div class="reference-bottom">2025 tax year <span>Save this ID · Keep it private</span></div></div><div class="card-tools">${button(`${icon("copy")} Copy ID`, "copy-reference", "secondary")}${button(`${icon("print")} Print reference card`, "print-reference", "secondary")}</div>${button(`Continue to application ${icon("arrow")}`, "continue-intake", "primary full")}<p class="footnote">Signing in with your email is still how you return. Your ID card holds no tax information.</p></main>`;
}

// ---------------------------------------------------------------------------
// Save state and conflict reconciliation
// ---------------------------------------------------------------------------

export function saveStatus(state) {
  if (state.saveState === "saving")
    return `<span class="save-chip saving" role="status">${icon("refresh")} Saving…</span>`;
  if (state.saveState === "saved")
    return `<span class="save-chip saved" role="status">${icon("check")} Saved</span>`;
  if (state.saveState === "failed")
    return `<span class="save-chip failed" role="alert">${icon("help")} Not saved. ${esc(state.error?.message ?? "Please try again.")} ${when(state.retryable, button("Try again", "retry-action", "inline"))}</span>`;
  if (state.saveState === "unsaved" || state.dirty)
    return `<span class="save-chip unsaved" role="status">${icon("clock")} Unsaved changes</span>`;
  return `<span class="save-chip" role="status">${icon("check")} Up to date</span>`;
}

// A deliberate choice between two sets of answers. It shows only what actually
// differs, and neither button saves: reconciliation picks a new edit base, and
// the save that follows still goes through the database revision check.
export function conflictForm(state) {
  if (!state.conflict) return "";
  const server = state.savedCase?.answers ?? {};
  const mine = state.draftAnswers ?? {};
  const keys = [...new Set([...Object.keys(answerLabels)])].filter(
    (key) => String(mine[key] ?? "") !== String(server[key] ?? ""),
  );
  return `<section class="panel conflict-panel" aria-labelledby="conflict-title"><div class="section-head"><h2 id="conflict-title">Someone else changed this application</h2></div><p>Your edits are still here and nothing has been saved. The office now has version ${esc(state.conflict.serverRevision)}; you started from version ${esc(state.conflict.baseRevision)}. Choose which answers to keep.</p><table class="conflict-table"><thead><tr><th scope="col">Question</th><th scope="col">Your edits</th><th scope="col">The office’s values</th></tr></thead><tbody>${keys
    .map(
      (key) =>
        `<tr><th scope="row">${esc(answerLabels[key])}</th><td>${esc(mine[key] || "—")}</td><td>${esc(server[key] || "—")}</td></tr>`,
    )
    .join("")}</tbody></table><div class="conflict-choices">${button("Keep my edits", "reconcile-mine", "primary")}${button("Use the office’s values", "reconcile-server", "secondary")}</div><p class="field-note">Whichever you choose stays unsaved until you save it, and the office’s copy decides who wins if it changes again.</p></section>`;
}

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

const fictionalTools = `<div class="fiction-tools"><span class="demo-fiction">Fictional data only</span>${button(`${icon("spark")} Fill fictional details`, "fill-fictional", "demo")}${button(`${icon("refresh")} Generate another example`, "regenerate-fictional", "demo subtle")}</div>`;

function intakeBody(state) {
  const a = state.draftAnswers ?? {};
  const result = screening(a);
  if (state.formStep === 0)
    return `<div class="service-options">${[
      ["Same-day", "Meet with our volunteers at the site.", "home"],
      ["Drop-off", "Leave your documents. We’ll follow up.", "folder"],
      ["Online", "Work with us remotely.", "user"],
    ]
      .map(
        ([val, desc, ico]) =>
          `<label class="service-card ${a.service === val ? "selected" : ""}"><input type="radio" name="service" value="${val}" ${a.service === val ? "checked" : ""} required><span class="service-icon">${icon(ico)}</span><span><strong>${val}</strong><small>${desc}</small></span><i></i></label>`,
      )
      .join(
        "",
      )}</div><div class="form-grid">${select("Tax year", "year", a.year, ["2025"], "required")}${select("Preferred service language", "language", a.language, ["English", "Cantonese", "Mandarin"], "required")}</div><div class="info-note">${icon("help")}<p>This prototype covers selected intake questions for tax year 2025. A volunteer completes the full intake process with you.</p></div>`;
  if (state.formStep === 1)
    return `<div class="form-grid">${input("City of residence", "residenceCity", a.residenceCity, "text", "required")}${select("State of residence", "residenceState", a.residenceState, ["PA", "NJ", "DE", "Other"], "required")}</div><p class="field-note">Where you live can differ from where your mail goes. The next step asks for your mailing address.</p>${radio("Did you earn income from driving for Uber or Lyft in 2025?", "rideshare", a.rideshare)}${radio("Apart from Uber/Lyft driving, did you earn income from another business, freelance work, or self-employment in 2025?", "other", a.other)}<p class="field-note">Wages earned as an employee are not self-employment income.</p>${radio("Did you have more than 10 stock transactions in 2025?", "stocks", a.stocks)}${
      result === "unsupported"
        ? `<div class="notice amber" role="status">${icon("help")}<div><h3>Outside PCDC’s current service scope</h3><p>${a.other === "yes" ? "PCDC cannot prepare returns with other business or self-employment income under its current service policy. This also applies if you have Uber/Lyft income." : "More than 10 stock transactions exceeds PCDC’s current service limit."}</p><p>This is a PCDC service limitation, not a judgement about your taxes. Contact the office for guidance; your draft stays saved.</p>${button("Contact the office", "open-help", "secondary")}</div></div>`
        : result === "assistance" || a.residenceState === "Other"
          ? `<div class="notice amber" role="status">${icon("help")}<div><h3>Let’s check with a volunteer</h3><p>Our office can help clarify your situation before you continue. Your answers stay saved.</p>${button("Contact the office", "open-help", "secondary")}</div></div>`
          : ""
    }`;
  if (state.formStep === 2)
    return `<div class="form-grid">${input("First name", "firstName", a.firstName, "text", 'required autocomplete="given-name"')}${input("Last name", "lastName", a.lastName, "text", 'required autocomplete="family-name"')}</div>${input("Mailing address", "address", a.address, "text", 'required autocomplete="street-address"')}<div class="form-grid triple">${input("Mailing city", "city", a.city, "text", "required")}${select("Mailing state", "state", a.state, ["PA", "NJ", "DE"], "required")}${input("ZIP code", "zip", a.zip, "text", 'required inputmode="numeric" pattern="[0-9]{5}(-[0-9]{4})?"')}</div><p class="field-note">This is where the office would send mail. It does not have to match your city of residence.</p><div class="form-grid">${input("People in your household", "household", a.household, "number", 'required min="1" max="30"')}${select(
      "Who is completing this form?",
      "helper",
      a.helper,
      [
        ["self", "I am the taxpayer"],
        ["helper", "Someone is helping me"],
      ],
      "required",
    )}</div>${when(a.helper === "helper", `<div class="info-note">${icon("help")}<p>Contact the office for assisted applications. Helping enter answers does not grant access or signing authority.</p></div>`)}${select(
      "Are your income documents ready?",
      "documents",
      a.documents,
      [
        ["ready", "Yes, I have them ready"],
        ["some", "Some are still missing"],
        ["unsure", "I need help checking"],
      ],
      "required",
    )}<p class="field-note">This records what you have ready. A volunteer checks which documents are needed and verifies them.</p>`;
  const missing = missingAnswers(a);
  return `<div class="review-block"><div class="section-head"><h3>Your visit</h3>${button("Edit visit", "edit-0", "inline")}</div>${row("Service", a.service)}${row("Tax year", a.year)}${row("Preferred language", a.language)}</div><div class="review-block"><div class="section-head"><h3>Your situation</h3>${button("Edit screening", "edit-1", "inline")}</div>${row("City of residence", `${a.residenceCity || ""}${a.residenceState ? `, ${a.residenceState}` : ""}`)}${row("Uber / Lyft income", a.rideshare === "yes" ? "Yes" : a.rideshare === "no" ? "No" : "")}${row("Other self-employment", a.other === "yes" ? "Yes" : a.other === "no" ? "No" : "")}${row("More than 10 stock transactions", a.stocks === "yes" ? "Yes" : a.stocks === "no" ? "No" : "")}</div><div class="review-block"><div class="section-head"><h3>Your details</h3>${button("Edit details", "edit-2", "inline")}</div>${row("Name", `${a.firstName || ""} ${a.lastName || ""}`.trim())}${row("Mailing address", [a.address, a.city, `${a.state || ""} ${a.zip || ""}`.trim()].filter(Boolean).join(", "))}${row("Household size", a.household)}${row("Documents", a.documents === "ready" ? "Reported ready" : a.documents === "some" ? "Some missing" : a.documents === "unsure" ? "Needs help checking" : "")}</div>${when(missing.length, `<div class="notice amber" role="status">${icon("help")}<div><h3>Still to fill in</h3><p>${esc(missing.map((key) => answerLabels[key] ?? key).join(", "))}</p></div></div>`)}<label class="checkbox-row" for="field-confirmed"><input type="checkbox" id="field-confirmed" name="confirmed" ${state.openPanels.includes("confirmed") ? "checked" : ""}><span>I have checked my answers</span></label><p class="field-note">This confirms your answers. It is not a signature on a tax or consent form; a volunteer follows up about required forms.</p>`;
}

export function intakeScreen(state) {
  const record = state.savedCase;
  if (!record) return applicationsScreen(state);
  if (record.stage !== "draft")
    return `<main id="main" class="narrow" tabindex="-1"><div class="page-intro"><span class="overline">${esc(record.reference)}</span><h1>Your answers are with the office</h1><p>${esc(describeStage(record.stage).clientMessage)}</p></div><div class="panel">${Object.keys(answerLabels)
      .filter((key) => record.answers?.[key])
      .map((key) => row(answerLabels[key], record.answers[key]))
      .join("")}</div><p class="field-note">A volunteer makes corrections after submission, so these answers are read-only here.</p>${button(`See your progress ${icon("arrow")}`, "open-progress", "primary full")}</main>`;
  const a = state.draftAnswers ?? {};
  const result = screening(a);
  const blocked =
    (state.formStep === 1 &&
      (result === "unsupported" ||
        result === "assistance" ||
        a.residenceState === "Other")) ||
    (state.formStep === 2 && a.helper === "helper");
  const cannotSubmit = submissionBlocker(a) !== null;
  return `<main id="main" class="workspace" tabindex="-1"><aside class="intake-sidebar"><div class="sidebar-top"><span class="overline">YOUR APPLICATION</span><h2>A few steps.<br>We’re here to help.</h2><ol class="step-list">${steps
    .map(
      (label, index) =>
        `<li class="${index === state.formStep ? "active" : index < state.formStep ? "complete" : ""}"><span>${index < state.formStep ? icon("check") : String(index + 1).padStart(2, "0")}</span><div>${label}${index === state.formStep ? "<small>YOU ARE HERE</small>" : ""}</div></li>`,
    )
    .join("")}</ol></div><div class="sidebar-help">${icon("help")}<h3>Prefer to talk it through?</h3><p>Our volunteers can help you at the PCDC office.</p>${button("Contact the office", "open-help", "inline")}</div></aside><section class="form-workspace"><div class="application-meta"><span>${esc(record.reference)}</span>${saveStatus(state)}</div>${conflictForm(state)}<div class="page-intro"><span class="overline">STEP ${state.formStep + 1} OF 4</span><h1>${esc(steps[state.formStep] ?? steps[0])}</h1><p>${
    [
      "How would you like to work with our volunteers?",
      "A few questions help us understand how we can help.",
      "Tell us a little about yourself and what you have ready.",
      "Take a moment to make sure everything looks right.",
    ][state.formStep] ?? ""
  }</p></div>${fictionalTools}<form id="intake-form">${intakeBody(state)}${when(state.error, `<p class="error" role="alert">${esc(state.error?.message)}</p>`)}<div class="form-actions"><div>${when(state.formStep, button(`${icon("back")} Back`, "back-step", "text"))}${button("Save and exit", "save-exit", "text")}</div>${
    state.formStep === 3
      ? caseButton(
          `Submit application ${icon("arrow")}`,
          "SUBMIT",
          "primary",
          cannotSubmit || state.conflict || state.busy ? "disabled" : "",
        )
      : `<button type="submit" class="btn primary" ${blocked || state.conflict || state.busy ? "disabled" : ""}>Continue ${icon("arrow")}</button>`
  }</div></form></section></main>`;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

const PROGRESS_STEPS = Object.freeze([
  ["Intake", ["draft", "received"]],
  ["Preparation", ["preparation_ready", "preparing"]],
  ["Review", ["review_ready", "reviewing", "corrections_required"]],
  ["Next steps", ["review_approved", "closed"]],
]);

const REVIEW_STAGES = Object.freeze([
  "review_ready",
  "reviewing",
  "corrections_required",
  "review_approved",
]);

function progressTrack(stage) {
  const current = PROGRESS_STEPS.findIndex(([, stages]) => stages.includes(stage));
  return `<div class="progress-steps">${PROGRESS_STEPS.map(([label], index) => {
    const status = index < current ? "done" : index === current ? "current" : "";
    return `<div class="${status}"><span>${index < current ? icon("check") : index + 1}</span><small>${label}</small><em class="sr-only">${index < current ? "complete" : index === current ? "in progress" : "not started"}</em></div>`;
  }).join("")}</div>`;
}

// One card per open request, so every id inside it is scoped to that request:
// two open requests would otherwise render the same checkbox id twice and both
// labels would toggle the first box.
function documentRequest(request, state) {
  const failed = state.openPanels.includes("upload-failed");
  const simulate = state.openPanels.includes("upload-failure");
  const simulateId = fieldId("simulate-upload-failure", request.id);
  return `<div class="action-card"><div class="action-label">${icon("clock")} ACTION NEEDED</div><h2>${esc(request.title)}</h2><p>${esc(request.message)}</p><div class="upload-zone has-file">${icon("file")}<strong>demo-mileage-record-2025.pdf</strong><span>One fictional sample document. Nothing is uploaded or stored.</span></div><label class="checkbox-row small" for="${simulateId}"><input type="checkbox" id="${simulateId}" ${simulate ? "checked" : ""} data-action="toggle-upload-failure" data-request-id="${esc(request.id)}"><span>Simulate an upload failure</span></label>${when(failed, `<p class="error" role="alert">The sample upload failed. Your request is still open and nothing was sent. Try again.</p>`)}${caseButton(
    `Send sample document ${icon("arrow")}`,
    "RESPOND_DOCUMENT",
    "primary",
    `data-request-id="${esc(request.id)}" ${state.busy ? "disabled" : ""}`,
  )}<small class="block">A volunteer checks the document before preparation continues.</small></div>`;
}

function reviewProgress(stage) {
  if (!REVIEW_STAGES.includes(stage)) return "";
  const described = describeStage(stage);
  return `<section class="panel review-panel"><div class="section-head"><h2>Review progress</h2>${stageBadge(stage)}</div><p>${esc(described.clientMessage)}</p><p class="field-note">An independent reviewer always checks the work of the volunteer who prepared it. Notes between volunteers stay with the office.</p></section>`;
}

export function progressScreen(state) {
  const record = state.savedCase;
  if (!record) return applicationsScreen(state);
  const described = describeStage(record.stage);
  const answers = record.answers ?? {};
  const open = (record.requests ?? []).filter(
    (request) => request.status === "open",
  );
  const documents = record.documents ?? [];
  const history = [...(record.history ?? [])].reverse();
  return `<main id="main" class="dashboard" tabindex="-1"><div class="page-intro dashboard-intro"><div><span class="overline">YOUR APPLICATION</span><h1>${answers.firstName ? `Hello, ${esc(answers.firstName)}.` : "Your application"}</h1><p>A little clarity on where things stand.</p></div><div class="id-pill">${icon("folder")}<div><small>APPLICATION ID</small><strong>${esc(record.reference)}</strong></div></div></div><div class="progress-grid"><section><div class="panel status-panel"><div class="section-head"><h2>Your progress</h2>${stageBadge(record.stage)}</div>${progressTrack(record.stage)}<p class="status-explanation">${esc(described.clientMessage)}</p></div>${
    open.length
      ? open.map((request) => documentRequest(request, state)).join("")
      : `<div class="next-card">${icon("shield")}<div><h3>You’re all set for now.</h3><p>Your next action appears here if the office needs anything else.</p></div></div>`
  }${when(
    documents.length,
    `<section class="panel"><div class="section-head"><h2>What you sent</h2></div>${documents
      .map(
        (document) =>
          `<div class="document-row">${icon("file")}<div><strong>${esc(document.filename)}</strong><small>Waiting for a volunteer to check it</small></div><span class="document-check pending">${icon("clock")}</span></div>`,
      )
      .join("")}</section>`,
  )}${reviewProgress(record.stage)}<section class="panel history-panel"><div class="section-head"><h2>Application history</h2><span class="muted small">The latest, all in one place</span></div>${
    history.length
      ? `<div class="timeline">${history
          .map(
            (entry) =>
              `<div class="timeline-item"><span class="timeline-dot"></span><div><p>${esc(entry.message)}</p><small>${esc(formatTime(entry.createdAt))}</small></div></div>`,
          )
          .join("")}</div>`
      : '<p class="muted">Updates from the office appear here.</p>'
  }</section></section><aside class="right-column"><div class="panel summary-panel"><span class="overline">AT A GLANCE</span><h3>Your service details</h3>${row("Tax year", "2025")}${row("Service", answers.service)}${row("Language", answers.language)}${row("Application ID", record.reference)}<div class="gentle-note">${icon("lock")} Your application is private to you and the site team.</div></div><div class="help-card"><span class="help-card-icon">${icon("help")}</span><h3>We’re here for you.</h3><p>Questions about your application? Our volunteers can help.</p>${button("Contact the office", "open-help", "secondary")}</div>${button("Back to my applications", "open-applications", "text")}</aside></div></main>`;
}

// ---------------------------------------------------------------------------
// The one entry point the app renders through
// ---------------------------------------------------------------------------

export function clientScreen(state) {
  if (state.screen === "reference") return referenceScreen(state);
  if (state.screen === "intake") return intakeScreen(state);
  if (state.screen === "progress") return progressScreen(state);
  return applicationsScreen(state);
}
