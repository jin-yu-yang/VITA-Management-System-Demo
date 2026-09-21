// The payload rules for every workflow action a control can dispatch, as one
// pure function (Ruling R50). The wiring layer reads a control's dataset and
// its form's values and hands them here; nothing in this file touches the DOM,
// the controller or the store, so the payload contract can be tested on its
// own and cannot drift into an event handler.
//
// The table below is `contracts-excerpt.md`'s payload table, in the same order.
// Lengths and related-record membership are the database's to enforce — this
// file refuses only what it can know by itself: an unknown action, a missing
// related id, an empty required field and an outcome outside its own list.

import { CASE_ACTIONS } from "./contracts.mjs";

// The one fictional file the demo ever sends (Ruling R18); the database accepts
// no other name.
export const SAMPLE_DOCUMENT_FILENAME = "demo-mileage-record-2025.pdf";

// A contact attempt's outcome, and the subset that may also resolve the task.
export const CONTACT_OUTCOMES = Object.freeze([
  "no_answer",
  "reached",
  "no_further_contact",
  "closure_requested",
]);
export const FOLLOWUP_RESOLUTION_OUTCOMES = Object.freeze([
  "reached",
  "no_further_contact",
]);

function validation(message) {
  return Object.assign(new Error(message), { code: "VALIDATION" });
}

// A required free-text field. Blank is the same as absent: the database would
// refuse it, and saying so here keeps an empty envelope from being sent.
function text(values, key, label) {
  const value = String(values?.[key] ?? "").trim();
  if (!value) throw validation(`${label} is required.`);
  return value;
}

// A related record's id. The button carries it in its dataset (`data-request-id`
// → `dataset.requestId`); a form may carry it in a hidden field instead.
function relatedId(dataset, values, key, label) {
  const value = String(dataset?.[key] ?? values?.[key] ?? "").trim();
  if (!value) throw validation(`This ${label} is no longer on screen.`);
  return value;
}

function outcome(values, allowed) {
  const value = String(values?.outcome ?? "").trim();
  if (!allowed.includes(value))
    throw validation("Choose what happened on the call.");
  return value;
}

// SAVE_ANSWERS is deliberately absent: it is built by the controller from the
// draft it holds and the revision the edits started at, not from a form.
const BUILDERS = Object.freeze({
  SUBMIT: () => ({ confirmed: true }),
  // Demo attestations, never a claim that a real identity check happened.
  VERIFY_INTAKE: () => ({
    checks: {
      interview: true,
      identity: true,
      documents: true,
      consent: true,
    },
  }),
  CLAIM_PREPARATION: () => ({}),
  SUBMIT_REVIEW: () => ({}),
  CLAIM_REVIEW: () => ({}),
  APPROVE_REVIEW: () => ({}),
  REMIND: () => ({}),
  REQUEST_DOCUMENT: (dataset, values) => ({
    title: text(values, "title", "A short title"),
    message: text(values, "message", "A message for the client"),
  }),
  RESPOND_DOCUMENT: (dataset, values) => ({
    requestId: relatedId(dataset, values, "requestId", "request"),
    filename: SAMPLE_DOCUMENT_FILENAME,
  }),
  RECORD_DOCUMENT_RESPONSE: (dataset, values) => ({
    requestId: relatedId(dataset, values, "requestId", "request"),
    filename: SAMPLE_DOCUMENT_FILENAME,
  }),
  VERIFY_DOCUMENT: (dataset, values) => ({
    requestId: relatedId(dataset, values, "requestId", "request"),
  }),
  ESCALATE_CONTACT: (dataset, values) => ({
    requestId: relatedId(dataset, values, "requestId", "request"),
    reason: text(values, "reason", "A reason for the office"),
  }),
  RECORD_CONTACT: (dataset, values) => ({
    followupId: relatedId(dataset, values, "followupId", "task"),
    outcome: outcome(values, CONTACT_OUTCOMES),
    note: text(values, "note", "A note"),
  }),
  RESOLVE_FOLLOWUP: (dataset, values) => ({
    followupId: relatedId(dataset, values, "followupId", "task"),
    outcome: outcome(values, FOLLOWUP_RESOLUTION_OUTCOMES),
    note: text(values, "note", "A note"),
  }),
  REQUEST_CORRECTIONS: (dataset, values) => ({
    findings: text(values, "findings", "The corrections to make"),
  }),
  RESUBMIT_REVIEW: (dataset, values) => ({
    resolution: text(values, "resolution", "What was corrected"),
  }),
  RECORD_REVIEW_CONTACT: (dataset, values) => ({
    outcome: outcome(values, CONTACT_OUTCOMES),
    note: text(values, "note", "A note"),
  }),
  CLOSE_CASE: (dataset, values) => ({
    reason: text(values, "reason", "A reason"),
    confirmed: true,
  }),
});

// Every action this function can build, for tests and for the wiring layer's
// own guard. `SAVE_ANSWERS` is the one member of CASE_ACTIONS that is missing.
export const PAYLOAD_ACTIONS = Object.freeze(
  CASE_ACTIONS.filter((type) => Object.hasOwn(BUILDERS, type)),
);

/**
 * Build one action envelope's `{type, payload}` from a control's dataset and
 * the values of the form it sits in.
 *
 * @param {string} type       a canonical name from CASE_ACTIONS
 * @param {object} dataset    the control's `dataset` (camelCased data-* keys)
 * @param {object} formValues the form's named values, e.g. Object.fromEntries(new FormData(form))
 * @returns {{type: string, payload: object}}
 * @throws  {Error} with `code:'VALIDATION'` for an unknown type or a missing
 *          required field. Nothing is sent in that case.
 */
export function payloadFor(type, dataset = {}, formValues = {}) {
  // `hasOwn`, so an inherited property name ("toString") is an unknown action
  // rather than a function to call.
  if (!Object.hasOwn(BUILDERS, type))
    throw validation("This step is not available.");
  return { type, payload: BUILDERS[type](dataset ?? {}, formValues ?? {}) };
}
