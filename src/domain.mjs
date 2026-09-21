// Pure client-side rules. Nothing here decides a workflow transition and
// nothing here persists anything: the database owns stages, authority and
// revisions (see `supabase/migrations/`), and this file only names what the
// browser is allowed to show and to send.

export const INTAKE_ANSWER_KEYS = Object.freeze([
  "service",
  "year",
  "language",
  "residenceCity",
  "residenceState",
  "city",
  "state",
  "rideshare",
  "other",
  "stocks",
  "firstName",
  "lastName",
  "address",
  "zip",
  "household",
  "helper",
  "documents",
]);

// The answers the server's SUBMIT branch re-checks before it accepts an
// application (`vitally_private.act_submit`). Listing them here lets the form
// say what is still missing; the server remains the one that decides.
export const REQUIRED_ANSWER_KEYS = Object.freeze([
  "service",
  "year",
  "language",
  "residenceCity",
  "residenceState",
  "firstName",
  "lastName",
  "address",
  "city",
  "state",
  "zip",
  "household",
  "helper",
  "documents",
]);

export function screening(a) {
  if (a.other === "yes" || a.stocks === "yes") return "unsupported";
  if ([a.rideshare, a.other, a.stocks].includes("unsure")) return "assistance";
  if (![a.rideshare, a.other, a.stocks].every((x) => ["yes", "no"].includes(x)))
    return "incomplete";
  return "continue";
}

export function missingAnswers(answers = {}) {
  return REQUIRED_ANSWER_KEYS.filter(
    (key) => !String(answers?.[key] ?? "").trim(),
  );
}

// Why the form cannot be submitted yet, or null when nothing local stands in
// the way. The order mirrors the server's, so the browser never offers a
// button the database would refuse — but a null here is a prediction, not a
// permission, and the action still goes through the same checks.
export function submissionBlocker(answers = {}) {
  if (missingAnswers(answers).length) return "incomplete";
  if (answers.year !== "2025") return "year";
  if (answers.residenceState === "Other") return "residenceState";
  if (answers.helper !== "self") return "helper";
  const result = screening(answers);
  return result === "continue" ? null : result;
}

// Plain-language status copy for every server stage in STAGES, so the browser
// can name what it is showing without deciding anything. This is presentation
// only: no transition, authority or eligibility rule lives here, and no
// message mentions findings, amounts, signing, filing or acceptance as done.
const STAGE_DESCRIPTIONS = Object.freeze({
  draft: {
    label: "Draft",
    clientMessage:
      "Your application is saved and has not been sent to the office yet.",
  },
  received: {
    label: "Received",
    clientMessage:
      "Your application is with the office. A volunteer will check your information and documents.",
  },
  preparation_ready: {
    label: "Waiting for preparation",
    clientMessage:
      "Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.",
  },
  preparing: {
    label: "In preparation",
    clientMessage: "A volunteer is preparing your return.",
  },
  review_ready: {
    label: "Waiting for review",
    clientMessage:
      "Preparation is complete in the tax software. Your return is waiting for an independent reviewer.",
  },
  reviewing: {
    label: "In review",
    clientMessage: "An independent reviewer is checking your return.",
  },
  corrections_required: {
    label: "Corrections in progress",
    clientMessage:
      "The reviewer asked your preparer to make corrections. No action is needed from you right now.",
  },
  review_approved: {
    label: "Review complete",
    clientMessage:
      "Independent review is complete. A volunteer will contact you about next steps. Signing and filing are later milestones and are not done yet.",
  },
  closed: {
    label: "Closed",
    clientMessage:
      "This application was closed by the office. This does not change any return filed elsewhere.",
  },
});
const UNKNOWN_STAGE = Object.freeze({
  label: "Application",
  clientMessage:
    "This application is with the office. Contact PCDC if you have questions.",
});
// A fresh copy, so a caller that edits what it renders cannot change the table.
// An unrecognised stage — including an inherited property name — falls back to
// neutral copy rather than showing nothing or guessing a milestone.
export function describeStage(stage) {
  return {
    ...(Object.hasOwn(STAGE_DESCRIPTIONS, stage ?? "")
      ? STAGE_DESCRIPTIONS[stage]
      : UNKNOWN_STAGE),
  };
}
