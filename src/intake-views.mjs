// The version-2 client screens (docs/superpowers/specs/2026-10-04-intake-redesign-design.md
// §2–§6): the rail tree, the sub-step pages, the Documents step, Review &
// submit, the read-only answers after Submit and the progress page's open
// documents. Pure functions of one controller snapshot, like client-views.mjs:
// no store, no timers, no DOM, and everything from a person or the database is
// escaped on the way out.
//
// Rules are never re-implemented here: visibility, marks and the place in the
// form come from intake-form.mjs, the catalogue from intake-catalogue.mjs and
// the cards from document-cards.mjs. This module imports nothing from
// client-views.mjs; the save chip, the conflict panel and the fictional tools
// are passed in as `chrome`.
import { esc, icon, button, caseButton, officeContact } from "./ui.mjs";
import { describeStage } from "./domain.mjs";
import {
  renderQuestion,
  renderRichText,
  formatAnswer,
  invalidAnswers,
  visibleSubsteps,
  resolveSubstep,
  substepStatus,
  stepRollup,
} from "./intake-form.mjs";
import {
  CONTACT_FIELDS,
  stepsFor,
  substepsFor,
  findSubstep,
  substepOfQuestion,
  substepQuestions,
  findQuestion,
  wording,
  isVisible,
  missingToSubmit,
} from "./intake-catalogue.mjs";
import { cardsFor } from "./document-cards.mjs";

const when = (condition, html) => (condition ? html : "");

const STEPS = stepsFor(2);
const SUBSTEPS = substepsFor(2);
// The client sees Steps 1–9: "Before you start" is shown unnumbered.
const NUMBERED = STEPS.filter((step) => step.id !== "before").map((step) => step.id);
const stepNumber = (stepId) => {
  const at = NUMBERED.indexOf(stepId);
  return at < 0 ? null : at + 1;
};
const dashed = (id) => String(id).replace(/\./g, "-");
const topId = (id) => String(id).replace(/\[.*$/, "");
const localized = (text, variant) => text?.[variant]?.en ?? text?.general?.en ?? "";
const stepTitle = (step) => step?.title?.en ?? "";
const substepTitle = (substep, variant) => localized(substep?.title, variant);
const stepLabel = (step) => {
  const n = stepNumber(step.id);
  return n ? `Step ${n}: ${stepTitle(step)}` : stepTitle(step);
};
const isSameDay = (answers) => answers?.service === "same_day";
const isDocuments = (id) => findSubstep(id)?.step.id === "documents";

export const variantOf = (answers) => (answers?.form_version === "senior" ? "senior" : "general");

/**
 * The server's side of a version-2 case: its answers plus the contact record's
 * four fields (a null contact, or a null inside it, is empty).
 */
export function serverAnswersV2(record) {
  const result = { ...(record?.answers ?? {}) };
  for (const [id, key] of Object.entries(CONTACT_FIELDS)) {
    const value = record?.contact?.[key];
    if (value !== undefined && value !== null) result[id] = value;
  }
  return result;
}

// A section's intro shows on the first sub-step holding its questions, unless
// that sub-step has a lead line (spec §2.1).
const SECTION_OF = new Map(
  STEPS.flatMap((step) => step.sections.flatMap((section) => section.questions.map((question) => [question.id, section]))),
);
const FIRST_SUBSTEP_OF = new Map();
for (const substep of SUBSTEPS)
  for (const id of substep.questions) {
    const section = SECTION_OF.get(id);
    if (section && !FIRST_SUBSTEP_OF.has(section)) FIRST_SUBSTEP_OF.set(section, substep.id);
  }

// Sub-step order, for the alerts list.
const ORDER_OF = new Map(SUBSTEPS.flatMap((substep) => substep.questions).map((id, index) => [id, index]));

// ---------------------------------------------------------------------------
// The view of the draft form
// ---------------------------------------------------------------------------

function formView(state) {
  const record = state.savedCase;
  const answers = state.draftAnswers ?? {};
  const cards = cardsFor(answers, record?.documentCards ?? []);
  const visited = Array.isArray(state.visitedSubsteps) ? state.visitedSubsteps : [];
  const revealed = new Set(state.revealed ?? []);
  const visible = visibleSubsteps(answers, cards);
  const current = resolveSubstep(state.formSubstep, answers, cards) ?? visible[0];
  const substep = findSubstep(current);
  const inStep = visible.filter((id) => findSubstep(id).step.id === substep.step.id);
  return {
    state,
    record,
    answers,
    cards,
    visited,
    revealed,
    visible,
    current,
    substep,
    variant: variantOf(answers),
    openPanels: Array.isArray(state.openPanels) ? state.openPanels : [],
    marks: { answers, visited, revealed, cards },
    // While an action is in flight the controller ignores a sub-step change
    // or a card mark (one write at a time), so the page offers none: every
    // control that moves the form or marks a card carries this attribute.
    off: offWhileBusy(state),
    within: `${inStep.indexOf(current) + 1} of ${inStep.length}`,
  };
}

// ---------------------------------------------------------------------------
// The rail tree (spec §3.2, §3.3)
// ---------------------------------------------------------------------------

// The attribute for a control that would send while an action is in flight.
const offWhileBusy = (state) => (state?.busy ? " disabled" : "");

// Each mark is one fixed span, so typing can restyle it in place (className
// and textContent only); its icon is drawn by CSS keyed on the span's class.
const markSpan = (id, status) =>
  `<span id="${esc(id)}" class="rail-status is-${esc(status.key)}">${esc(status.text)}</span>`;

function railStep(step, view) {
  const visible = new Set(view.visible);
  const subs = SUBSTEPS.filter((substep) => substep.step.id === step.id && visible.has(substep.id));
  if (!subs.length) return "";
  const panels = view.openPanels;
  const isCurrent = view.substep.step.id === step.id;
  // Expanded when not shut, and either opened or the current step.
  const expanded = !panels.includes(`rail-shut:${step.id}`) && (panels.includes(`rail-open:${step.id}`) || isCurrent);
  const statuses = new Map(subs.map((substep) => [substep.id, substepStatus(substep.id, view.marks)]));
  const target = subs.find((substep) => statuses.get(substep.id).key !== "done") ?? subs[0];
  const n = stepNumber(step.id);
  const title = stepTitle(step);
  const id = esc(step.id);
  const items = subs
    .map((substep) => {
      const here = substep.id === view.current;
      return `<li><button type="button" class="rail-sublink" data-action="go-substep" data-substep="${esc(substep.id)}"${here ? ' aria-current="step"' : ""}${view.off}><span class="rail-subtitle">${esc(substepTitle(substep, view.variant))}</span>${here ? '<small class="rail-here">You are here</small>' : ""}${markSpan(`rail-sub-${dashed(substep.id)}-status`, statuses.get(substep.id))}</button></li>`;
    })
    .join("");
  return `<li class="rail-step${isCurrent ? " is-current" : ""}" data-step-id="${id}"><div class="rail-step-head"><button type="button" class="rail-toggle" data-action="toggle-rail-step" data-step-id="${id}" aria-expanded="${expanded}" aria-controls="rail-subs-${id}">${icon("expand")}<span class="sr-only">Show or hide the parts of ${esc(title)}</span></button><button type="button" class="rail-link" data-action="go-substep" data-substep="${esc(target.id)}"${view.off}>${n ? `<span class="rail-step-num" aria-hidden="true">${n}</span>` : ""}<span class="rail-step-body"><span class="rail-step-title">${n ? `<span class="sr-only">Step ${n}: </span>` : ""}${esc(title)}</span>${markSpan(`rail-step-${step.id}-status`, stepRollup(step.id, view.marks))}</span></button></div><ol id="rail-subs-${id}" class="rail-subs"${expanded ? "" : " hidden"}>${items}</ol></li>`;
}

function rail(view) {
  const open = view.openPanels.includes("rail-all");
  const position = view.visible.indexOf(view.current) + 1;
  const count = view.visible.length;
  // The phone bar shows at ≤800px only (CSS); the tree folds behind it there.
  return `<div class="rail-phone"><span>${esc(stepTitle(view.substep.step))} · ${view.within}</span><button type="button" class="btn secondary" data-action="toggle-panel" data-panel="rail-all" aria-expanded="${open}" aria-controls="rail-tree">All steps</button></div><nav class="rail-nav" aria-label="Form steps"><ol id="rail-tree" class="rail-tree${open ? " is-open" : ""}">${STEPS.map((step) => railStep(step, view)).join("")}</ol></nav><div class="rail-progress"><progress class="rail-bar" max="${count}" value="${position}" aria-hidden="true"></progress><p>Part ${position} of ${count}</p></div>`;
}

// ---------------------------------------------------------------------------
// The page: header, questions and actions (spec §3.4)
// ---------------------------------------------------------------------------

function header(view) {
  const step = view.substep.step;
  const n = stepNumber(step.id);
  const name = stepTitle(step).toUpperCase();
  const overline = n ? `STEP ${n} OF ${NUMBERED.length} · ${name}` : name;
  return `<div class="page-intro"><span class="overline">${esc(overline)}</span><h1>${esc(substepTitle(view.substep, view.variant))}</h1><p class="substep-count">${view.within}</p></div>`;
}

// The sub-step's visible questions in its order, one card per heading group.
// A heading starts a new group; a group with no visible question is left out.
function questionsBody(view) {
  const { substep, answers, variant } = view;
  const questions = substepQuestions(substep.id);
  const groups = [];
  for (const question of questions) {
    if (question.heading || !groups.length) groups.push({ heading: question.heading ?? null, questions: [] });
    groups.at(-1).questions.push(question);
  }
  const showMissing = view.visited.includes(view.current);
  const cards = groups
    .map((group) => ({ ...group, questions: group.questions.filter((question) => isVisible(question, answers)) }))
    .filter((group) => group.questions.length)
    .map(
      (group) =>
        `<div class="q-card">${group.heading ? `<h2 class="q-heading">${esc(localized(group.heading, variant))}</h2>` : ""}${group.questions
          .map((question) =>
            renderQuestion(question, answers[question.id], {
              variant,
              lang: "en",
              scope: "client",
              answers,
              showMissing,
              revealed: view.revealed,
            }),
          )
          .join("")}</div>`,
    )
    .join("");
  const extra =
    substep.id === "before.ready"
      ? `<p class="q-intro-extra">${isSameDay(answers) ? "You will get a list of what to bring." : "You will upload them in the Documents step."}</p>`
      : "";
  const lead = localized(substep.lead, variant);
  let intro = "";
  if (lead) intro = `<p class="q-lead">${esc(lead)}</p>`;
  else {
    const section = SECTION_OF.get(questions[0]?.id);
    const text = section && FIRST_SUBSTEP_OF.get(section) === substep.id ? localized(section.intro, variant) : "";
    if (text) intro = `<div class="q-intro">${renderRichText(text)}${extra}</div>`;
  }
  if (extra && !intro.includes(extra)) intro += extra;
  return `<div class="q-section">${intro}${cards}</div>`;
}

function actions(view, alerts) {
  const { state, visible, current } = view;
  const off = Boolean(state.conflict || state.busy);
  let primary;
  if (current === "review.submit") {
    const confirmed = view.openPanels.includes("confirmed");
    primary = caseButton(
      `Submit application ${icon("arrow")}`,
      "SUBMIT",
      "primary",
      alerts.length > 0 || !confirmed || off ? "disabled" : "",
    );
  } else if (state.returnToSummary) {
    primary = `<button type="button" class="btn primary" data-action="back-to-summary"${off ? " disabled" : ""}>Back to summary</button>`;
  } else {
    primary = `<button type="submit" class="btn primary"${off ? " disabled" : ""}>Continue ${icon("arrow")}</button>`;
  }
  return `<div class="form-actions"><div>${when(visible[0] !== current, button(`${icon("back")} Back`, "back-step", "text", view.off.trim()))}</div>${primary}</div>`;
}

// ---------------------------------------------------------------------------
// Document cards (spec §6.4–§6.6)
// ---------------------------------------------------------------------------

const STATUS = Object.freeze({
  not_done: { word: "Not done", icon: "upload" },
  later: { word: "Later", icon: "clock" },
  none: { word: "Don't have", icon: "close" },
});
const statusOf = (card) => STATUS[card.status] ?? STATUS.not_done;
const markButton = (slot, status, text, off = "") =>
  button(esc(text), "mark-card", "secondary", `data-slot="${esc(slot)}" data-status="${status}"${off}`);

// One card. `links` is false where the answers are locked (the progress page),
// so the why line is plain text there. The optional "other" card has the
// upload buttons but no marks and no status (ruling R1). `off` is
// `offWhileBusy`: the marks and the why link wait for an action in flight.
function docCard(card, { links = true, off = "" } = {}) {
  const id = `doc-${esc(dashed(card.slotId))}`;
  const optional = card.group === "optional";
  const target = links && card.ask ? substepOfQuestion(card.ask) : null;
  const whyText = card.why?.en ?? "";
  const why = whyText
    ? `<p class="doc-why">${target ? `<button type="button" class="inline" data-action="go-substep" data-substep="${esc(target)}"${off}>${esc(whyText)}</button>` : esc(whyText)}</p>`
    : "";
  const hint = card.hint?.en ? `<p class="doc-hint">${esc(card.hint.en)}</p>` : "";
  const noteId = `${id}-note`;
  const upload = `<div class="doc-upload"><button type="button" class="btn secondary" disabled aria-describedby="${noteId}">${icon("camera")} Take a photo</button><button type="button" class="btn secondary" disabled aria-describedby="${noteId}">${icon("upload")} Choose a file</button></div><p class="doc-note" id="${noteId}">Uploading arrives soon. For now, bring it or mark it below.</p>`;
  const status = statusOf(card);
  const marks = optional
    ? ""
    : `<div class="doc-marks">${markButton(card.slotId, "later", "I will send it later", off)}${markButton(card.slotId, "none", "I don't have this", off)}${when(card.status !== "not_done", markButton(card.slotId, "not_done", "Mark as not done", off))}</div><p class="doc-status is-${esc(card.status)}" id="${id}-status" tabindex="-1">${icon(status.icon)}<span class="sr-only">Status: </span>${esc(status.word)}</p>`;
  return `<article class="doc-card" id="${id}" data-slot="${esc(card.slotId)}" tabindex="-1"><h3>${esc(card.label?.en)}</h3><p class="doc-owner">${esc(card.ownerLine?.en)}</p>${why}${hint}${upload}${marks}</article>`;
}

// Same-day: a printable checklist, Needed first and then Maybe needed, with no
// buttons and no statuses. The optional card is neither, so it is left out.
function bringList(cards) {
  const items = [...cards.filter((card) => card.group === "needed"), ...cards.filter((card) => card.group === "maybe")];
  return `<ul class="bring-list">${items
    .map((card) => {
      const maybe = card.group === "maybe";
      return `<li class="bring-item${maybe ? " is-maybe" : ""}"><strong>${esc(card.label?.en)}</strong><span class="doc-owner">${esc(card.ownerLine?.en)}</span>${card.hint?.en ? `<span class="doc-hint">${esc(card.hint.en)}</span>` : ""}${maybe ? '<small class="bring-maybe">Maybe needed</small>' : ""}</li>`;
    })
    .join("")}</ul>`;
}

function documentsBody(view) {
  const { substep, cards } = view;
  if (substep.cards === "bring") return bringList(cards);
  const mine = cards.filter((card) => card.substep === substep.cards);
  const main = mine.filter((card) => card.group !== "maybe");
  const maybe = mine.filter((card) => card.group === "maybe");
  if (!maybe.length) return `<div class="doc-list">${main.map((card) => docCard(card, { off: view.off })).join("")}</div>`;
  const panel = `maybe:${substep.id}`;
  const open = view.openPanels.includes(panel);
  const listId = `doc-maybe-${esc(dashed(substep.id))}`;
  return `<div class="doc-list">${main.map((card) => docCard(card, { off: view.off })).join("")}</div><div class="doc-maybe"><button type="button" class="doc-maybe-toggle" data-action="toggle-panel" data-panel="${esc(panel)}" aria-expanded="${open}" aria-controls="${listId}">Maybe needed (${maybe.length})</button><div id="${listId}" class="doc-list"${open ? "" : " hidden"}>${open ? maybe.map((card) => docCard(card, { off: view.off })).join("") : ""}</div></div>`;
}

// ---------------------------------------------------------------------------
// Review & submit (spec §5)
// ---------------------------------------------------------------------------

// The words an alert lists an id under: its question's wording, or for a
// household sub-field "Person <n+1>: <sub-question wording>".
function itemLabel(id, variant) {
  const options = { variant, lang: "en" };
  const member = /^([^[]+)\[(\d+)\]\.(.+)$/.exec(id);
  if (member) {
    const field = (findQuestion(2, member[1])?.fields ?? []).find((f) => f.id === member[3]);
    return `Person ${Number(member[2]) + 1}: ${wording(field, options) || member[3]}`;
  }
  return wording(findQuestion(2, id), options) || id;
}

// Sub-step order: the question, then the member, then the sub-field.
function itemOrder(id) {
  const top = topId(id);
  const member = /\[(\d+)\]\.(.+)$/.exec(id);
  const subs = findQuestion(2, top)?.fields ?? [];
  return [ORDER_OF.get(top) ?? -1, member ? Number(member[1]) : -1, member ? subs.findIndex((f) => f.id === member[2]) : -1];
}
const byOrder = (a, b) => {
  const [x, y] = [itemOrder(a.id), itemOrder(b.id)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

// Alerts block Submit: every missing required answer and every invalid one,
// from the draft alone (it holds the contact fields).
function alertsOf(answers) {
  return [
    ...missingToSubmit(2, answers).map((id) => ({ id, kind: "missing", flag: "Needs an answer" })),
    ...invalidAnswers(null, answers).map((id) => ({ id, kind: "invalid", flag: "Needs a change" })),
  ].map((item) => ({ ...item, substep: substepOfQuestion(topId(item.id)) }));
}

// Warnings never block: Needed cards Not done or Later, and the open Maybe
// needed cards as one line. None for same-day.
function warningsOf(view) {
  if (isSameDay(view.answers)) return { needed: [], maybe: [] };
  const open = (card) => card.status === "not_done" || card.status === "later";
  return {
    needed: view.cards.filter((card) => card.group === "needed" && open(card)),
    maybe: view.cards.filter((card) => card.group === "maybe" && open(card)),
  };
}

function checkBody(view, alerts) {
  const warnings = warningsOf(view);
  let body = "";
  if (alerts.length) {
    const groups = STEPS.map((step) => ({
      step,
      items: alerts.filter((item) => findSubstep(item.substep)?.step.id === step.id).sort(byOrder),
    })).filter((group) => group.items.length);
    body += `<div class="alerts-block"><h3>Fix before you submit</h3>${groups
      .map(
        ({ step, items }) =>
          `<div class="alerts-step"><h4>${esc(stepLabel(step))}</h4><ul>${items
            .map(
              (item) =>
                `<li><button type="button" class="alert-item is-${item.kind}" data-action="go-substep" data-substep="${esc(item.substep)}"${view.off}><span class="alert-q">${esc(itemLabel(item.id, view.variant))}</span><span class="alert-flag">${item.flag}</span>${icon("chevron")}</button></li>`,
            )
            .join("")}</ul></div>`,
      )
      .join("")}</div>`;
  }
  if (warnings.needed.length || warnings.maybe.length) {
    const firstDocuments = view.visible.find(isDocuments);
    const n = warnings.maybe.length;
    body += `<div class="warnings-block"><h3>You can still submit</h3><ul>${warnings.needed
      .map(
        (card) =>
          `<li class="warning-item"><span class="warning-doc"><strong>${esc(card.label?.en)}</strong><small>${esc(card.ownerLine?.en)} · ${esc(statusOf(card).word)}</small></span><button type="button" class="btn secondary" data-action="go-substep" data-substep="documents.${esc(card.substep)}" data-focus="doc-${esc(dashed(card.slotId))}"${view.off}>Upload now</button></li>`,
      )
      .join("")}${when(
      n && firstDocuments,
      `<li class="warning-maybe"><button type="button" class="inline" data-action="go-substep" data-substep="${esc(firstDocuments)}"${view.off}>${n} more ${n === 1 ? "document" : "documents"} may be needed</button></li>`,
    )}</ul></div>`;
  }
  if (!body) body = `<p class="alerts-empty">We found no alerts or warnings in your application.</p>`;
  return `<div class="review-intro"><p>Please review your application and check it for accuracy and completeness before you submit it.</p><p>The IRS Volunteer Income Tax Assistance (VITA) program is completely free if you qualify. We will never ask you to pay.</p></div><section class="alerts-panel" aria-labelledby="alerts-title"><h2 id="alerts-title" tabindex="-1">Alerts and warnings</h2>${body}</section>`;
}

const row = (label, value) =>
  `<div class="detail-row"><span>${esc(label)}</span><strong>${esc(value).replace(/\n/g, "<br>")}</strong></div>`;

// Every visible answer, grouped by step and sub-step, through formatAnswer.
// With `change`, each sub-step is listed with its Change link even when
// nothing in it is answered yet; without, only what has answers. `off` is
// `offWhileBusy` for the Change links.
function answerSteps(answers, variant, { change, off = "" }) {
  const visible = new Set(visibleSubsteps(answers, []));
  const options = { variant, lang: "en" };
  const [stepClass, subClass] = change ? ["summary-step", "summary-sub"] : ["answer-step", "answer-sub"];
  return STEPS.map((step) => {
    const subs = SUBSTEPS.filter((substep) => substep.step.id === step.id && substep.kind === "questions" && visible.has(substep.id))
      .map((substep) => {
        const rows = substepQuestions(substep.id)
          .filter((question) => isVisible(question, answers))
          .map((question) => [question, formatAnswer(question, answers[question.id], options)])
          .filter(([, text]) => text !== null)
          .map(([question, text]) => row(wording(question, options), text))
          .join("");
        const title = esc(substepTitle(substep, variant));
        if (!change) return rows ? `<div class="${subClass}"><h3>${title}</h3>${rows}</div>` : "";
        return `<div class="${subClass}"><div class="summary-sub-head"><h3>${title}</h3><button type="button" class="inline" data-action="change-substep" data-substep="${esc(substep.id)}"${off}>Change</button></div>${rows || '<p class="summary-none">Nothing answered yet.</p>'}</div>`;
      })
      .join("");
    return subs ? `<section class="${stepClass}"><h2>${esc(stepTitle(step))}</h2>${subs}</section>` : "";
  }).join("");
}

// The cards and their status, so the printout shows what is still to come.
function documentsSummary(view) {
  const step = STEPS.find((candidate) => candidate.id === "documents");
  if (isSameDay(view.answers))
    return `<section class="summary-step summary-documents"><h2>Bring these to your visit</h2>${bringList(view.cards)}</section>`;
  const subs = view.visible
    .filter(isDocuments)
    .map((id) => {
      const substep = findSubstep(id);
      const cards = view.cards.filter((card) => card.substep === substep.cards && card.group !== "optional");
      if (!cards.length) return "";
      const rows = cards
        .map((card) =>
          row(
            `${card.label?.en ?? ""} · ${card.ownerLine?.en ?? ""}${card.group === "maybe" ? " · Maybe needed" : ""}`,
            statusOf(card).word,
          ),
        )
        .join("");
      return `<div class="summary-sub"><div class="summary-sub-head"><h3>${esc(substepTitle(substep, view.variant))}</h3><button type="button" class="inline" data-action="change-substep" data-substep="${esc(id)}"${view.off}>Change</button></div>${rows}</div>`;
    })
    .join("");
  return subs ? `<section class="summary-step summary-documents"><h2>${esc(stepTitle(step))}</h2>${subs}</section>` : "";
}

const formatDay = (date) => date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

function summaryBody(view, today) {
  const printed = `<div class="summary-print"><div class="summary-meta">${row("Application ID", view.record?.reference)}${row("Date", formatDay(today))}</div>${answerSteps(view.answers, view.variant, { change: true, off: view.off })}${documentsSummary(view)}</div>`;
  const tools = `<div class="summary-tools">${button(`${icon("print")} Print`, "print-summary", "secondary")}${button(`${icon("file")} View Draft 13614-C`, "view-draft", "secondary", 'data-form="en"')}<span class="draft-languages">${button("简体中文版", "view-draft", "inline", 'data-form="zh-s" lang="zh-Hans"')}<span aria-hidden="true">·</span>${button("繁體中文版", "view-draft", "inline", 'data-form="zh-t" lang="zh-Hant"')}</span><p id="draft-ready" class="draft-ready" aria-live="polite"></p></div>`;
  return printed + tools;
}

function submitBody(view, alerts) {
  const confirmed = view.openPanels.includes("confirmed");
  return `${when(
    alerts.length,
    `<div class="notice amber" role="status">${icon("help")}<div><p>Some answers need attention before you can submit.</p><button type="button" class="inline" data-action="go-substep" data-substep="review.check"${view.off}>See the alerts</button></div></div>`,
  )}<label class="checkbox-row" for="field-confirmed"><input type="checkbox" id="field-confirmed" name="confirmed" ${confirmed ? "checked" : ""}><span>I have checked my answers</span></label><p class="field-note">This confirms your answers. It is not a signature on a tax form.</p>`;
}

// ---------------------------------------------------------------------------
// The screens
// ---------------------------------------------------------------------------

/**
 * The version-2 draft form. `chrome` is `{ saveStatus, conflictForm,
 * fictionalTools }` from client-views.mjs, plus an optional `today` (a Date)
 * for the summary's printed date.
 */
export function intakeFormV2(state, chrome = {}) {
  const view = formView(state);
  const alerts = alertsOf(view.answers);
  const today = chrome.today instanceof Date && !Number.isNaN(chrome.today.getTime()) ? chrome.today : new Date();
  const kind = view.substep.kind;
  const body =
    kind === "documents"
      ? documentsBody(view)
      : view.current === "review.check"
        ? checkBody(view, alerts)
        : view.current === "review.summary"
          ? summaryBody(view, today)
          : view.current === "review.submit"
            ? submitBody(view, alerts)
            : questionsBody(view);
  const reference = view.record?.reference;
  return `<main id="main" class="workspace intake-v2" tabindex="-1"><aside class="intake-sidebar"><div class="sidebar-top"><span class="overline">YOUR APPLICATION</span><h2>A few steps.<br>We’re here to help.</h2>${rail(view)}</div><div class="sidebar-help">${icon("help")}<h3>Prefer to talk it through?</h3><p>Our volunteers can help at the PCDC office, or by phone.</p>${officeContact()}</div></aside><section class="form-workspace"><div class="application-meta"><span>${esc(reference)}</span>${chrome.saveStatus ? chrome.saveStatus(state) : ""}</div>${chrome.conflictForm ? chrome.conflictForm(state) : ""}${header(view)}${chrome.fictionalTools ?? ""}<form id="intake-v2-form" novalidate data-substep="${esc(view.current)}">${body}${when(state.error, `<p class="error" role="alert">${esc(state.error?.message)}</p>`)}${actions(view, alerts)}</form></section></main>`;
}

/** After submission: read-only, grouped by step and sub-step (contact fields from record.contact). */
export function submittedV2(state) {
  const record = state.savedCase;
  const answers = serverAnswersV2(record);
  return `<main id="main" class="narrow" tabindex="-1"><div class="page-intro"><span class="overline">${esc(record.reference)}</span><h1>Your answers are with the office</h1><p>${esc(describeStage(record.stage).clientMessage)}</p></div><div class="panel answers-v2">${answerSteps(answers, variantOf(answers), { change: false })}</div><p class="field-note">A volunteer makes corrections after submission, so these answers are read-only here.</p>${button(`See your progress ${icon("arrow")}`, "open-progress", "primary full")}</main>`;
}

/**
 * The progress page's documents (spec §5.4): the Needed cards still Not done
 * or Later, with their marks, or for same-day the printable "Bring these to
 * your visit" list. Empty when there is nothing open, or once the case is
 * closed (the server refuses card marks then).
 */
export function progressDocumentsV2(state) {
  const record = state.savedCase;
  if (!record || record.stage === "closed") return "";
  const answers = serverAnswersV2(record);
  const cards = cardsFor(answers, record.documentCards ?? []);
  const head = (title) =>
    `<div class="section-head"><h2 id="open-documents-title">${title}</h2></div>`;
  if (isSameDay(answers))
    return `<section class="panel open-documents" aria-labelledby="open-documents-title"><div class="summary-print">${head("Bring these to your visit")}${row("Application ID", record.reference)}${bringList(cards)}</div><div class="summary-tools">${button(`${icon("print")} Print`, "print-summary", "secondary")}</div></section>`;
  const open = cards.filter((card) => card.group === "needed" && (card.status === "not_done" || card.status === "later"));
  if (!open.length) return "";
  return `<section class="panel open-documents" aria-labelledby="open-documents-title">${head("Open documents")}<p class="field-note">The office still needs these. You can mark each one below.</p><div class="doc-list">${open.map((card) => docCard(card, { links: false, off: offWhileBusy(state) })).join("")}</div></section>`;
}
