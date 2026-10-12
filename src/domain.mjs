// Pure client-side rules. Nothing here decides a workflow transition and
// nothing here persists anything: the database owns stages, authority and
// revisions (see `supabase/migrations/`), and this file only names what the
// browser is allowed to show and to send.
import { isLang } from "./language.mjs";
import { t } from "./client-text.mjs";

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
      "Your return has been checked by the reviewer. A volunteer will contact you soon to sign and file.",
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
// neutral copy rather than showing nothing or guessing a milestone. Chinese
// comes from the client text table (stage.<stage>.label / .client); English,
// the default, is this table.
export function describeStage(stage, lang = "en") {
  const known = Object.hasOwn(STAGE_DESCRIPTIONS, stage ?? "");
  if (!isLang(lang) || lang === "en") return { ...(known ? STAGE_DESCRIPTIONS[stage] : UNKNOWN_STAGE) };
  const key = known ? stage : "unknown";
  return { label: t(`stage.${key}.label`, {}, lang), clientMessage: t(`stage.${key}.client`, {}, lang) };
}

// The volunteer work board's three tabs (spec 2026-09-28, section 5), on
// today's nine stages. Draft and received cases are the office's intake;
// approved and closed cases are finished. Neither has a tab, and the board's
// search is how a volunteer reaches them. Part 3 of the roadmap replaces the
// stage list, and with it this mapping.
export const BOARD_TABS = Object.freeze([
  ["available", "Available"],
  ["preparation", "Waiting for preparation"],
  ["review", "Waiting for review"],
]);

export function phaseTab(record) {
  switch (record?.stage) {
    case "preparation_ready":
      return record?.preparerId ? "preparation" : "available";
    case "preparing":
    case "corrections_required":
      return "preparation";
    case "review_ready":
    case "reviewing":
      return "review";
    default:
      return null;
  }
}
