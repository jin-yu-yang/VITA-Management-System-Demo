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
  officeContact,
  formatClientNumber,
  ANSWER_LABELS as answerLabels,
} from "./ui.mjs";
import {
  describeStage,
  screening,
  missingAnswers,
  submissionBlocker,
} from "./domain.mjs";
import { invalidAnswers, formatAnswer, sendable } from "./intake-form.mjs";
import {
  stepsFor,
  questionsFor,
  wording,
  isAnswered,
  serviceLabel,
  languageLabel,
} from "./intake-catalogue.mjs";
import {
  intakeFormV2,
  submittedV2,
  progressDocumentsV2,
  serverAnswersV2,
  variantOf,
} from "./intake-views.mjs";
import { viewLang } from "./language.mjs";
import { t, sentence, historyLine } from "./client-text.mjs";

// Every client screen, as pure functions of one controller snapshot. No state,
// no store, no timers, no DOM: each returns an HTML string, and everything that
// came from a person or from the database is escaped on the way out.
//
// Two conventions hold throughout:
//   * workflow buttons carry `data-case-action` with a name from CASE_ACTIONS;
//   * navigation, dialogs and prototype helpers carry `data-action`, and are
//     never translated into a database action.
// Stage words are never written here — they come from `describeStage`.
//
// Every screen speaks `viewLang(state)` (spec 2026-10-05 §2, §3): its words
// come from client-text.mjs, finished English sentences (errors, sign-in,
// history) go through `sentence`, and what a person typed is shown as typed.
// Without a language everything is the English it always was.

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
const troubleshooting = (lang) =>
  `<div class="support-note">${icon("help")}<div><strong>${esc(t("signin.no_code", {}, lang))}</strong><p>${esc(t("signin.no_code_body", {}, lang))}</p><p>${esc(t("signin.still_stuck", {}, lang))}</p>${officeContact()}${button(esc(t("signin.get_help", {}, lang)), "open-help", "inline")}</div></div>`;

function emailStep(state, lang) {
  return `<form id="email-form" class="panel access-panel">${input(
    t("signin.email", {}, lang),
    "email",
    state.authEmail,
    "email",
    `required autocomplete="email" placeholder="${esc(t("signin.email_placeholder", {}, lang))}" maxlength="254"`,
  )}<p class="field-note">${esc(t("signin.email_note", {}, lang))}</p>${authFailure(state, lang)}<button class="btn primary full" type="submit">${esc(t("signin.send", {}, lang))} ${icon("arrow")}</button></form>`;
}

// The countdown and the Resend label use the keys app.mjs patches in place
// every second, so the first draw and the live update agree.
function codeStep(state, lang) {
  const waiting = Number(state.resendSeconds) > 0;
  // The code is rendered from state, never blank. A re-render can arrive at any
  // moment — the countdown, a connection change, a realtime notification — and
  // a half-typed code must survive all of them, or the field is silently empty
  // when the person presses Verify and the required attribute stops the form
  // with nothing on screen to explain it.
  const seconds = esc(state.resendSeconds);
  return `<form id="code-form" class="panel access-panel">${input(
    t("signin.code", {}, lang),
    "code",
    state.authCode,
    "text",
    `required inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="${esc(t("signin.code_placeholder", {}, lang))}"`,
  )}<p class="field-note">${when(state.authEmail, t("signin.as", { email: `<strong>${esc(state.authEmail)}</strong>` }, lang))}${esc(t("signin.code_note", {}, lang))}</p>${authFailure(state, lang)}<button class="btn primary full" type="submit">${esc(t("signin.verify", {}, lang))} ${icon("arrow")}</button><div class="resend-row"><span>${esc(t("signin.didnt_receive", {}, lang))}</span>${button(
    waiting ? t("signin.resend_in", { n: seconds }, lang) : t("signin.resend", {}, lang),
    "resend-code",
    "inline",
    waiting ? "disabled" : "",
  )}<span class="cooldown" role="status" data-role="resend-countdown">${when(waiting, t("signin.countdown", { n: seconds }, lang))}</span></div>${button(esc(t("signin.other_email", {}, lang)), "back-to-email", "text")}</form>`;
}

function authFailure(state, lang = "en") {
  if (!state.authError) return "";
  return `<p class="error" role="alert">${esc(sentence(state.authError.message, lang))}</p>`;
}

export function accessScreen(state) {
  const lang = viewLang(state);
  const onCode = state.authStep === "code";
  return `<main id="main" class="narrow" tabindex="-1"><div class="center-icon">${icon(onCode ? "lock" : "mail")}</div><div class="page-intro centered"><span class="overline">${esc(t(onCode ? "signin.check_inbox" : "signin.welcome", {}, lang))}</span><h1>${esc(t(onCode ? "signin.enter_code" : "signin.title", {}, lang))}</h1><p>${
    onCode
      ? `${esc(sentence(state.authMessage, lang))}`
      : esc(t("signin.intro", {}, lang))
  }</p></div>${onCode ? codeStep(state, lang) : emailStep(state, lang)}${troubleshooting(lang)}<p class="footnote">${esc(t("signin.footnote", {}, lang))}</p></main>`;
}

// ---------------------------------------------------------------------------
// My applications
// ---------------------------------------------------------------------------

function applicationRow(entry, updatedAt, lang = "en") {
  return `<button class="application-row" data-action="open-case" data-case-id="${esc(entry.id)}"><span class="application-id"><span class="application-reference">${esc(entry.reference)}</span>${when(entry.clientNumber != null, `<span class="application-number">${esc(formatClientNumber(entry.clientNumber))}</span>`)}</span><span class="application-stage">${stageBadge(entry.stage, lang)}</span><span class="application-when">${updatedAt ? esc(t("apps.updated", { when: updatedAt }, lang)) : esc(t("apps.no_updates", {}, lang))}</span>${icon("chevron")}</button>`;
}

export function applicationsScreen(state) {
  const lang = viewLang(state);
  const say = (key) => esc(t(key, {}, lang));
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
      ? formatTime(state.savedCase.history?.at(-1)?.createdAt, lang)
      : "";
  const list = shown.length
    ? `<div class="application-list">${shown.map((entry) => applicationRow(entry, updatedFor(entry), lang)).join("")}</div>`
    : query
      ? `<div class="notice amber" role="status">${icon("help")}<div><h3>${say("apps.not_found")}</h3><p>${say("apps.not_found_body")}</p></div></div>`
      : `<div class="panel empty-state">${icon("folder")}<h2>${say("apps.empty")}</h2><p>${say("apps.empty_body")}</p></div>`;
  return `<main id="main" class="narrow" tabindex="-1"><div class="page-intro"><span class="overline">${say("apps.overline")}</span><h1>${say("apps.title")}</h1><p>${say("apps.intro")}</p></div><form id="lookup-form" class="lookup-form">${input(
    t("id.application", {}, lang),
    "lookup",
    state.lookup,
    "text",
    `autocomplete="off" placeholder="${say("apps.lookup_placeholder")}"`,
  )}<button class="btn secondary" type="submit">${icon("search")} ${say("apps.find")}</button>${when(query, button(say("apps.show_all"), "clear-lookup", "text"))}</form>${list}<div class="start-row">${button(`${icon("file")} ${say("apps.start")}`, "start-application", "primary full")}<p class="field-note">${say("apps.start_note")}</p></div></main>`;
}

// ---------------------------------------------------------------------------
// The generated reference card
// ---------------------------------------------------------------------------

export function referenceScreen(state) {
  const record = state.savedCase;
  if (!record) return applicationsScreen(state);
  const lang = viewLang(state);
  const say = (key) => esc(t(key, {}, lang));
  return `<main id="main" class="narrow" tabindex="-1"><div class="center-icon success">${icon("check")}</div><div class="page-intro centered"><span class="overline">${say("ref.overline")}</span><h1>${say("ref.title_1")}<br>${say("ref.title_2")}</h1><p>${say("ref.intro_1")}<br>${say("ref.intro_2")}</p></div><div class="reference-card"><span>ViTally <small>${say("ref.card_org")}</small></span><p>${say("ref.your_id")}</p><strong>${esc(record.reference)}</strong><div class="reference-bottom">${say("ref.tax_year")} <span>${say("ref.keep")}</span></div></div><div class="card-tools">${button(`${icon("copy")} ${say("ref.copy")}`, "copy-reference", "secondary")}${button(`${icon("print")} ${say("ref.print")}`, "print-reference", "secondary")}</div>${button(`${say("ref.continue")} ${icon("arrow")}`, "continue-intake", "primary full")}<p class="footnote">${say("ref.footnote")}</p></main>`;
}

// ---------------------------------------------------------------------------
// Save state and conflict reconciliation
// ---------------------------------------------------------------------------

// The errors a version-2 form shows: invalid answers of visible questions whose
// ids are in the revealed list, the same ids the notes show (spec §2.5).
function shownErrors(state) {
  const revealed = new Set(state.revealed ?? []);
  if (!revealed.size) return 0;
  return invalidAnswers(null, state.draftAnswers ?? {}).filter((id) => revealed.has(id)).length;
}

// The chip and the conflict panel follow the client's language on a
// version-2 form; a version-1 form is English throughout (spec §2), and the
// office's Add a case is a staff screen.
const formLang = (state) => (isVersionTwo(state?.savedCase) ? viewLang(state) : "en");

export function saveStatus(state) {
  const lang = formLang(state);
  const say = (key) => esc(t(key, {}, lang));
  if (state.saveState === "saving")
    return `<span class="save-chip saving" role="status">${icon("refresh")} ${say("save.saving")}</span>`;
  // Version 2 only, after Saving, Failed and Unsaved and before Saved.
  if (
    Number(state.savedCase?.intakeVersion) === 2 &&
    state.saveState !== "failed" &&
    state.saveState !== "unsaved" &&
    !state.dirty
  ) {
    const count = shownErrors(state);
    if (count > 0)
      return `<span class="save-chip checking" role="status">${icon("help")} ${esc(t("save.checking", { n: count }, lang))}</span>`;
  }
  if (state.saveState === "saved")
    return `<span class="save-chip saved" role="status">${icon("check")} ${say("save.saved")}</span>`;
  if (state.saveState === "failed")
    return `<span class="save-chip failed" role="alert">${icon("help")} ${say("save.not_saved")} ${esc(sentence(state.error?.message ?? "Please try again.", lang))} ${when(state.retryable, button(say("frame.try_again"), "retry-action", "inline"))}</span>`;
  if (state.saveState === "unsaved" || state.dirty)
    return `<span class="save-chip unsaved" role="status">${icon("clock")} ${say("save.unsaved")}</span>`;
  return `<span class="save-chip" role="status">${icon("check")} ${say("save.up_to_date")}</span>`;
}

// A deliberate choice between two sets of answers. It shows only what actually
// differs, and neither button saves: reconciliation picks a new edit base, and
// the save that follows still goes through the database revision check.
export function conflictForm(state) {
  if (!state.conflict) return "";
  if (isVersionTwo(state.savedCase)) return conflictFormV2(state);
  const server = state.savedCase?.answers ?? {};
  const mine = state.draftAnswers ?? {};
  const keys = [...new Set([...Object.keys(answerLabels)])].filter(
    (key) => String(mine[key] ?? "") !== String(server[key] ?? ""),
  );
  return conflictPanel(
    state,
    "en",
    keys
      .map(
        (key) =>
          `<tr><th scope="row">${esc(answerLabels[key])}</th><td>${esc(mine[key] || "—")}</td><td>${esc(server[key] || "—")}</td></tr>`,
      )
      .join(""),
  );
}

// Version 2: every catalogue field, the four contact fields included, compared
// by what a save would send (spec §3.3). Unanswered is one state, so a null in
// the draft and a missing key on the server are the same answer.
function conflictFormV2(state) {
  const server = serverAnswersV2(state.savedCase);
  const mine = state.draftAnswers ?? {};
  const variant = variantOf(mine);
  const lang = formLang(state);
  const shown = (question, value) =>
    esc(formatAnswer(question, value, { variant, lang }) ?? "—").replace(/\n/g, "<br>");
  const rows = allQuestionsV2()
    .filter((question) => !sameAnswer(sendable(question, mine[question.id]), sendable(question, server[question.id])))
    .map(
      (question) =>
        `<tr><th scope="row">${esc(wording(question, { variant, lang }))}</th><td>${shown(question, mine[question.id])}</td><td>${shown(question, server[question.id])}</td></tr>`,
    )
    .join("");
  return conflictPanel(state, lang, rows);
}

function conflictPanel(state, lang, rows) {
  const say = (key) => esc(t(key, {}, lang));
  return `<section class="panel conflict-panel" aria-labelledby="conflict-title"><div class="section-head"><h2 id="conflict-title">${say("conflict.title")}</h2></div><p>${esc(t("conflict.body", { server: state.conflict.serverRevision, base: state.conflict.baseRevision }, lang))}</p><table class="conflict-table"><thead><tr><th scope="col">${say("conflict.question")}</th><th scope="col">${say("conflict.yours")}</th><th scope="col">${say("conflict.office")}</th></tr></thead><tbody>${rows}</tbody></table><div class="conflict-choices">${button(say("conflict.keep_mine"), "reconcile-mine", "primary")}${button(say("conflict.use_office"), "reconcile-server", "secondary")}</div><p class="field-note">${say("conflict.note")}</p></section>`;
}

// ---------------------------------------------------------------------------
// Version 2 helpers
// ---------------------------------------------------------------------------

const isVersionTwo = (record) => Number(record?.intakeVersion) === 2;
const STEPS_V2 = stepsFor(2);
const allQuestionsV2 = () => STEPS_V2.flatMap((step) => questionsFor(2, step));

// Deep equality over strings, arrays and plain objects (key order ignored).
function sameAnswer(a, b) {
  if (!isAnswered(a) && !isAnswered(b)) return true;
  const canonical = (value) =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
        : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

// The fictional-data tools: English on version 1, the client's language on version 2.
const fictionTools = (lang = "en") => {
  const say = (key) => esc(t(key, {}, lang));
  return `<div class="fiction-tools"><span class="demo-fiction">${say("fiction.only")}</span>${button(`${icon("spark")} ${say("fiction.fill")}`, "fill-fictional", "demo")}${button(`${icon("refresh")} ${say("fiction.another")}`, "regenerate-fictional", "demo subtle")}</div>`;
};
const fictionalTools = fictionTools();

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

// A version-1 application is English only (spec 2026-10-05 §2). In Chinese its
// body carries lang="en" under a one-line note in the client's language; the
// frame around it (top bar, banners, footer) is translated as anywhere else.
// English is the page exactly as before, with no note and no wrapper.
function englishOnly(state, mainClass, inner) {
  const lang = viewLang(state);
  if (lang === "en") return `<main id="main" class="${mainClass}" tabindex="-1">${inner}</main>`;
  const note = `<p class="v1-note">${icon("help")} ${esc(t("v1.english_only", {}, lang))}</p>`;
  // The workspace is a grid of the rail and the form, so the grid moves onto
  // the English wrapper and the note sits above it.
  return mainClass === "workspace"
    ? `<main id="main" class="v1-english" tabindex="-1">${note}<div class="workspace" lang="en">${inner}</div></main>`
    : `<main id="main" class="${mainClass}" tabindex="-1">${note}<div lang="en">${inner}</div></main>`;
}

export function intakeScreen(state) {
  const record = state.savedCase;
  if (!record) return applicationsScreen(state);
  if (isVersionTwo(record)) return intakeScreenV2(state);
  if (record.stage !== "draft")
    return englishOnly(state, "narrow", `<div class="page-intro"><span class="overline">${esc(record.reference)}</span><h1>Your answers are with the office</h1><p>${esc(describeStage(record.stage).clientMessage)}</p></div><div class="panel">${Object.keys(answerLabels)
      .filter((key) => record.answers?.[key])
      .map((key) => row(answerLabels[key], record.answers[key]))
      .join("")}</div><p class="field-note">A volunteer makes corrections after submission, so these answers are read-only here.</p>${button(`See your progress ${icon("arrow")}`, "open-progress", "primary full")}`);
  const a = state.draftAnswers ?? {};
  const result = screening(a);
  const blocked =
    (state.formStep === 1 &&
      (result === "unsupported" ||
        result === "assistance" ||
        a.residenceState === "Other")) ||
    (state.formStep === 2 && a.helper === "helper");
  const cannotSubmit = submissionBlocker(a) !== null;
  return englishOnly(state, "workspace", `<aside class="intake-sidebar"><div class="sidebar-top"><span class="overline">YOUR APPLICATION</span><h2>A few steps.<br>We’re here to help.</h2><ol class="step-list">${steps
    .map(
      (label, index) =>
        `<li class="${index === state.formStep ? "active" : index < state.formStep ? "complete" : ""}"${index === state.formStep ? ' aria-current="step"' : ""}><span>${index < state.formStep ? icon("check") : String(index + 1).padStart(2, "0")}</span><div>${label}${index === state.formStep ? "<small>YOU ARE HERE</small>" : ""}</div></li>`,
    )
    .join("")}</ol></div><div class="sidebar-help">${icon("help")}<h3>Prefer to talk it through?</h3><p>Our volunteers can help at the PCDC office, or by phone.</p>${officeContact()}</div></aside><section class="form-workspace"><div class="application-meta"><span>${esc(record.reference)}</span>${saveStatus(state)}</div>${conflictForm(state)}<div class="page-intro"><span class="overline">STEP ${state.formStep + 1} OF 4</span><h1>${esc(steps[state.formStep] ?? steps[0])}</h1><p>${
    [
      "How would you like to work with our volunteers?",
      "A few questions help us understand how we can help.",
      "Tell us a little about yourself and what you have ready.",
      "Take a moment to make sure everything looks right.",
    ][state.formStep] ?? ""
  }</p></div>${fictionalTools}<form id="intake-form">${intakeBody(state)}${when(state.error, `<p class="error" role="alert">${esc(state.error?.message)}</p>`)}<div class="form-actions"><div>${when(state.formStep, button(`${icon("back")} Back`, "back-step", "text"))}</div>${
    state.formStep === 3
      ? caseButton(
          `Submit application ${icon("arrow")}`,
          "SUBMIT",
          "primary",
          cannotSubmit || state.conflict || state.busy ? "disabled" : "",
        )
      : `<button type="submit" class="btn primary" ${blocked || state.conflict || state.busy ? "disabled" : ""}>Continue ${icon("arrow")}</button>`
  }</div></form></section>`);
}

// ---------------------------------------------------------------------------
// Intake, version 2: the sub-step form lives in intake-views.mjs (spec
// 2026-10-04 §2–§6); this file passes it the chrome it shares with version 1.
// ---------------------------------------------------------------------------

function intakeScreenV2(state) {
  return state.savedCase.stage === "draft"
    ? intakeFormV2(state, { saveStatus, conflictForm, fictionalTools: fictionTools(viewLang(state)) })
    : submittedV2(state);
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

const PROGRESS_STEPS = Object.freeze([
  ["progress.step.intake", ["draft", "received"]],
  ["progress.step.preparation", ["preparation_ready", "preparing"]],
  ["progress.step.review", ["review_ready", "reviewing", "corrections_required"]],
  ["progress.step.next", ["review_approved", "closed"]],
]);

const REVIEW_STAGES = Object.freeze([
  "review_ready",
  "reviewing",
  "corrections_required",
  "review_approved",
]);

function progressTrack(stage, lang = "en") {
  const current = PROGRESS_STEPS.findIndex(([, stages]) => stages.includes(stage));
  return `<div class="progress-steps">${PROGRESS_STEPS.map(([label], index) => {
    const status = index < current ? "done" : index === current ? "current" : "";
    const state = index < current ? "progress.step.done" : index === current ? "progress.step.current" : "progress.step.waiting";
    return `<div class="${status}"><span>${index < current ? icon("check") : index + 1}</span><small>${esc(t(label, {}, lang))}</small><em class="sr-only">${esc(t(state, {}, lang))}</em></div>`;
  }).join("")}</div>`;
}

// One card per open request, so every id inside it is scoped to that request:
// two open requests would otherwise render the same checkbox id twice and both
// labels would toggle the first box.
// The office's title and message are shown as typed, with no lang attribute
// (spec §3.4). In Chinese a label says whose words they are; English shows
// them bare, as it always has.
function documentRequest(request, state, lang = "en") {
  const say = (key) => esc(t(key, {}, lang));
  const failed = state.openPanels.includes("upload-failed");
  const simulate = state.openPanels.includes("upload-failure");
  const simulateId = fieldId("simulate-upload-failure", request.id);
  const label = (key) => (lang === "en" ? "" : `<span class="request-label">${say(key)}</span>`);
  return `<div class="action-card"><div class="action-label">${icon("clock")} ${say("progress.action_needed")}</div>${label("progress.request_title")}<h2>${esc(request.title)}</h2>${label("progress.request_message")}<p>${esc(request.message)}</p><div class="upload-zone has-file">${icon("file")}<strong>demo-mileage-record-2025.pdf</strong><span>${say("progress.sample_note")}</span></div><label class="checkbox-row small" for="${simulateId}"><input type="checkbox" id="${simulateId}" ${simulate ? "checked" : ""} data-action="toggle-upload-failure" data-request-id="${esc(request.id)}"><span>${say("progress.simulate_failure")}</span></label>${when(failed, `<p class="error" role="alert">${say("progress.upload_failed")}</p>`)}${caseButton(
    `${say("progress.send_sample")} ${icon("arrow")}`,
    "RESPOND_DOCUMENT",
    "primary",
    `data-request-id="${esc(request.id)}" ${state.busy ? "disabled" : ""}`,
  )}<small class="block">${say("progress.checks_first")}</small></div>`;
}

function reviewProgress(stage, lang = "en") {
  if (!REVIEW_STAGES.includes(stage)) return "";
  const described = describeStage(stage, lang);
  return `<section class="panel review-panel"><div class="section-head"><h2>${esc(t("progress.review", {}, lang))}</h2>${stageBadge(stage, lang)}</div><p>${esc(described.clientMessage)}</p><p class="field-note">${esc(t("progress.review_note", {}, lang))}</p></section>`;
}

export function progressScreen(state) {
  const record = state.savedCase;
  if (!record) return applicationsScreen(state);
  const lang = viewLang(state);
  const say = (key) => esc(t(key, {}, lang));
  const described = describeStage(record.stage, lang);
  const answers = record.answers ?? {};
  const open = (record.requests ?? []).filter(
    (request) => request.status === "open",
  );
  const documents = record.documents ?? [];
  const history = [...(record.history ?? [])].reverse();
  const firstName = isVersionTwo(record) ? answers.tp_first_name : answers.firstName;
  return `<main id="main" class="dashboard" tabindex="-1"><div class="page-intro dashboard-intro"><div><span class="overline">${say("progress.overline")}</span><h1>${firstName ? esc(t("progress.hello", { name: firstName }, lang)) : say("progress.title")}</h1><p>${say("progress.intro")}</p></div><div class="id-pill">${icon("folder")}<div><small>${say("id.application_caps")}</small><strong>${esc(record.reference)}</strong></div>${when(record.clientNumber != null, `<div><small>${say("id.client_number_caps")}</small><strong>${esc(formatClientNumber(record.clientNumber))}</strong></div>`)}</div></div><div class="progress-grid"><section><div class="panel status-panel"><div class="section-head"><h2>${say("progress.your_progress")}</h2>${stageBadge(record.stage, lang)}</div>${progressTrack(record.stage, lang)}<p class="status-explanation">${esc(described.clientMessage)}</p></div>${isVersionTwo(record) ? progressDocumentsV2(state, lang) : ""}${
    open.length
      ? open.map((request) => documentRequest(request, state, lang)).join("")
      : `<div class="next-card">${icon("shield")}<div><h3>${say("progress.all_set")}</h3><p>${say("progress.all_set_body")}</p></div></div>`
  }${when(
    documents.length,
    `<section class="panel sent-panel"><div class="section-head"><h2>${say("progress.sent")}</h2></div>${documents
      .map(
        (document) =>
          `<div class="document-row">${icon("file")}<div><strong>${esc(document.filename)}</strong><small>${say("progress.sent_waiting")}</small></div><span class="document-check pending">${icon("clock")}</span></div>`,
      )
      .join("")}</section>`,
  )}${reviewProgress(record.stage, lang)}<section class="panel history-panel"><div class="section-head"><h2>${say("progress.history")}</h2><span class="muted small">${say("progress.history_note")}</span></div>${
    history.length
      ? `<div class="timeline">${history
          .map(
            (entry) =>
              `<div class="timeline-item"><span class="timeline-dot"></span><div><p>${esc(historyLine(entry.message, lang))}</p><small>${esc(formatTime(entry.createdAt, lang))}</small></div></div>`,
          )
          .join("")}</div>`
      : `<p class="muted">${say("progress.history_empty")}</p>`
  }</section></section><aside class="right-column"><div class="panel summary-panel"><span class="overline">${say("progress.glance")}</span><h3>${say("progress.details")}</h3>${row(t("progress.tax_year", {}, lang), "2025")}${row(t("progress.service", {}, lang), serviceLabel(answers.service, lang))}${row(t("progress.language", {}, lang), languageLabel(answers.language, lang))}${row(t("id.application", {}, lang), record.reference)}<div class="gentle-note">${icon("lock")} ${say("progress.private")}</div></div><div class="help-card"><span class="help-card-icon">${icon("help")}</span><h3>${say("progress.here")}</h3><p>${say("progress.questions")}</p>${officeContact()}${button(say("progress.contact"), "open-help", "secondary")}</div>${button(say("progress.back"), "open-applications", "text")}</aside></div></main>`;
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
