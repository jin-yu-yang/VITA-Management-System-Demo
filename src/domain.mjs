// Pure client-side rules. Nothing here decides a workflow transition and
// nothing here persists anything: the database owns stages, authority and
// revisions (see `supabase/migrations/`), and this file only names what the
// browser is allowed to show and to send.
import { isLang } from "./language.mjs";
import { t } from "./client-text.mjs";

// Names and plain-language copy for every server stage in STAGES, so the
// browser can name what it is showing without deciding anything. Each stage has
// three texts: `label`, the staff name (a volunteer convention, always English);
// `clientLabel`, the short badge a client sees; and `clientMessage`, the
// sentence under it. This is presentation only: no transition, authority or
// eligibility rule lives here, and no message claims a milestone the case has
// not reached.
const STAGE_DESCRIPTIONS = Object.freeze({
  draft: {
    label: "Draft",
    clientLabel: "Draft",
    clientMessage:
      "Your application is saved and has not been sent to the office yet.",
  },
  received: {
    label: "Request sent",
    clientLabel: "Sent to PCDC",
    clientMessage:
      "Your application is with PCDC. The office will review it soon and may call you.",
  },
  screening: {
    label: "Screening in progress",
    clientLabel: "Being reviewed",
    clientMessage:
      "PCDC is reviewing your application. We may call you to confirm your information and documents.",
  },
  preparation_ready: {
    label: "Pending intake / filing",
    clientLabel: "Waiting for a volunteer",
    clientMessage:
      "Your application has been checked. It is waiting for a volunteer to start preparing your return.",
  },
  preparing: {
    label: "Filing in progress (preparing)",
    clientLabel: "Being prepared",
    clientMessage: "A volunteer is preparing your return.",
  },
  review_ready: {
    label: "Pending review",
    clientLabel: "Waiting for review",
    clientMessage:
      "Your return is prepared and is waiting for an independent reviewer.",
  },
  reviewing: {
    label: "Review in progress",
    clientLabel: "Being checked",
    clientMessage: "An independent reviewer is checking your return.",
  },
  corrections_required: {
    label: "Corrections in progress",
    clientLabel: "Being corrected",
    clientMessage:
      "The reviewer asked your preparer to make corrections. No action is needed from you right now.",
  },
  review_approved: {
    label: "Ready to exit",
    clientLabel: "Ready to sign",
    clientMessage:
      "Your return has been checked. PCDC will contact you to sign Form 8879, which is needed before your return can be filed.",
  },
  ready_to_efile: {
    label: "Ready to e-file",
    clientLabel: "Signed",
    clientMessage: "You signed Form 8879. PCDC will e-file your return next.",
  },
  efiled: {
    label: "E-filed",
    clientLabel: "E-filed",
    clientMessage:
      "Your return was e-filed. The IRS will confirm whether it is accepted.",
  },
  closed: {
    label: "Closed",
    clientLabel: "Closed",
    clientMessage:
      "This application was closed by the office. This does not change any return filed elsewhere.",
  },
});
const UNKNOWN_STAGE = Object.freeze({
  label: "Application",
  clientLabel: "Application",
  clientMessage:
    "This application is with the office. Contact PCDC if you have questions.",
});
// A fresh copy, so a caller that edits what it renders cannot change the table.
// An unrecognised stage — including an inherited property name — falls back to
// neutral copy rather than showing nothing or guessing a milestone. The staff
// name stays English in every language; the client's label and message come
// from the client text table (stage.<stage>.label / .client), and English, the
// default, is this table.
export function describeStage(stage, lang = "en") {
  const known = Object.hasOwn(STAGE_DESCRIPTIONS, stage ?? "");
  const base = known ? STAGE_DESCRIPTIONS[stage] : UNKNOWN_STAGE;
  if (!isLang(lang) || lang === "en") return { ...base };
  const key = known ? stage : "unknown";
  return {
    label: base.label,
    clientLabel: t(`stage.${key}.label`, {}, lang),
    clientMessage: t(`stage.${key}.client`, {}, lang),
  };
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
