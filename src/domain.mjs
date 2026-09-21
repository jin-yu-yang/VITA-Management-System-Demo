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
// the way, so the browser does not offer a button the database would refuse.
// A null here is a prediction, not a permission: `vitally_private.act_submit`
// (migration 003) re-checks the saved answers and decides.
//
// Which of that function's checks are mirrored, in its order:
//   1. stage must be `draft` — **not** mirrored here; the intake form is only
//      rendered for a draft case at all.
//   2. the fourteen required answers must be non-blank → "incomplete".
//   3. year/residenceState/helper — one check server-side, three here so the
//      form can say which one. Their relative order is the browser's own and
//      is not load-bearing: all three are the same refusal to the database.
//   4. screening must continue → "unsupported" | "assistance" | "incomplete".
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
