// Pure client-side rules. Nothing here decides a workflow transition and
// nothing here persists anything: the database owns stages, authority and
// revisions (see `supabase/migrations/`), and this file only names what the
// browser is allowed to show and to send.
import { isLang } from "./language.mjs";
import { t, filingSentences } from "./client-text.mjs";

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
  // Rejected and Accepted (change add-post-efiling-stages). Their messages are
  // built per return by filingMessage; these are the stage's closing sentence,
  // which is all a record with no filing methods has.
  rejected: {
    label: "Rejected",
    clientLabel: "Needs a correction",
    clientMessage: "PCDC will contact you about the correction.",
  },
  accepted: {
    label: "Accepted",
    clientLabel: "Complete",
    clientMessage:
      "If you are due a refund, you can check on it with \"Where's My Refund?\" at irs.gov/refunds for your federal return, and with myPATH at mypath.pa.gov for your Pennsylvania return.",
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
const SIGNING_PLANS = Object.freeze(["appointment", "same_day", "portal", "go_over_first"]);
const SIGNING_LOCALES = Object.freeze({ en: "en-US", "zh-Hans": "zh-CN", "zh-Hant": "zh-Hant" });

// The appointment is a wall-clock time at the site, stored without a zone
// ("YYYY-MM-DDTHH:MM", maybe with ":SS"). The parts are read as written and
// formatted in UTC, so the browser's zone can never move the time.
export function signingWhen(isoMinute, lang = "en") {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(isoMinute ?? ""));
  if (!match) return "";
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const locale = SIGNING_LOCALES[isLang(lang) ? lang : "en"];
  // Only the words come from Intl (weekday, English month, AM/PM); the shape is
  // ours, because ICU versions differ on spacing (e.g. "11月2日 星期一" vs
  // "11月2日星期一"). UTC, so the browser's zone never moves the time.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    })
      .formatToParts(new Date(Date.UTC(year, month - 1, day, hour, minute)))
      .map((part) => [part.type, part.value]),
  );
  const clock = `${hour % 12 || 12}:${String(minute).padStart(2, "0")}`;
  return locale === "en-US"
    ? `${parts.weekday}, ${parts.month} ${day} at ${clock} ${parts.dayPeriod}`
    : `${month}月${day}日${parts.weekday} ${parts.dayPeriod}${clock}`;
}

// At Ready to exit, the case's signing plan says how and when the client signs
// Form 8879 (design D11); without a plan the stage's own message stands.
function signingMessage(stage, lang, record) {
  if (stage !== "review_approved") return null;
  // Back at Ready to exit after a rejection: the re-sign message replaces any variant.
  if (returnedToSigning(record)) return t("stage.review_approved.client.resign", {}, lang);
  const plan = record?.signingPlan;
  if (!SIGNING_PLANS.includes(plan)) return null;
  const when = plan === "appointment" ? signingWhen(record.signingAppointmentAt, lang) : "";
  if (plan === "appointment" && !when) return null;
  return t(`stage.review_approved.client.${plan}`, { when }, lang);
}

// ---------------------------------------------------------------------------
// Filing methods and results (change add-post-efiling-stages). The columns are
// the database's; these read them and name nothing the database has not decided.
// ---------------------------------------------------------------------------

const RETURN_KINDS = Object.freeze(["federal", "state"]);

// How the case was filed: both returns e-filed, the federal e-filed and the
// state on paper, or both on paper. A case e-filed before methods existed has
// none, and neither does a combination PCDC does not use.
export function filingMethodKind(record) {
  const federal = record?.federalMethod ?? null;
  const state = record?.stateMethod ?? null;
  if (federal === "efile" && state === "efile") return "both_efile";
  if (federal === "efile" && state === "paper") return "efile_and_paper";
  if (federal === "paper" && state === "paper") return "both_paper";
  return null;
}

// 'waiting' (e-filed, no answer yet), 'accepted', 'rejected', 'mailed' (a paper
// return, answered or not), or null when this return was never filed.
export function returnState(record, kind) {
  const method = record?.[`${kind}Method`] ?? null;
  if (!method) return null;
  const result = record?.[`${kind}Result`] ?? null;
  if (result) return result;
  return method === "paper" ? "mailed" : "waiting";
}

// The returns filed and not yet answered, federal first.
export function waitingReturns(record) {
  return RETURN_KINDS.filter(
    (kind) => record?.[`${kind}Method`] && !record?.[`${kind}Result`],
  );
}

// Some waiting return was e-filed, so the IRS or Pennsylvania will answer it.
export function awaitsAcknowledgment(record) {
  return waitingReturns(record).some((kind) => record[`${kind}Method`] === "efile");
}

// Back at Ready to exit after a rejection: the case has methods on file.
export function returnedToSigning(record) {
  return record?.stage === "review_approved" && (record?.federalMethod ?? null) !== null;
}

// The newest fix note across every filing, or null.
export function latestFixNote(record) {
  // A list-shaped record carries only the newest note, read by the staff list.
  if (!record?.filingAttempts?.length && record?.latestFixNote) return record.latestFixNote;
  let newest = null;
  let newestAt = -Infinity;
  for (const attempt of record?.filingAttempts ?? [])
    for (const entry of attempt?.notes ?? []) {
      const at = Date.parse(entry?.recordedAt);
      if (newest === null || (Number.isFinite(at) ? at : -Infinity) >= newestAt) {
        newest = entry.note;
        newestAt = Number.isFinite(at) ? at : -Infinity;
      }
    }
  return newest;
}

// The staff name and the client's label for E-filed and Accepted by filing
// method (spec: case-lifecycle). Every other stage has one name.
const METHOD_LABELS = Object.freeze({
  efiled: {
    both_efile: { label: "Both e-filed", clientLabel: "E-filed" },
    efile_and_paper: { label: "E-filed & paper", clientLabel: "Filed", clientKey: "stage.efiled.filed.label" },
    both_paper: { label: "Both paper", clientLabel: "Mailed", clientKey: "stage.efiled.mailed.label" },
  },
  accepted: {
    both_efile: { label: "Accepted" },
    efile_and_paper: { label: "Accepted & mailed" },
    both_paper: { label: "Mailed" },
  },
});

// What the client reads at E-filed, Rejected and Accepted: a sentence about each
// return (the combined one when both are alike), then the stage's closing
// sentence. A case e-filed before filing methods existed has no returns to
// tell apart, so E-filed keeps its one message. Never names a code or a note.
export function filingMessage(stage, lang = "en", record = null) {
  const federal = returnState(record, "federal");
  const state = returnState(record, "state");
  const joiner = !isLang(lang) || lang === "en" ? " " : "";
  if (!federal && !state && stage === "efiled") return t("stage.efiled.client", {}, lang);
  return [
    filingSentences(federal, state, lang),
    stage === "rejected" || stage === "accepted" ? t(`filing.closing.${stage}`, {}, lang) : "",
  ]
    .filter(Boolean)
    .join(joiner);
}

const FILING_STAGES = Object.freeze(["efiled", "rejected", "accepted"]);

export function describeStage(stage, lang = "en", record = null) {
  const known = Object.hasOwn(STAGE_DESCRIPTIONS, stage ?? "");
  const base = known ? STAGE_DESCRIPTIONS[stage] : UNKNOWN_STAGE;
  const variant = FILING_STAGES.includes(stage)
    ? filingMessage(stage, lang, record)
    : signingMessage(stage, lang, record);
  const byMethod = known
    ? METHOD_LABELS[stage]?.[filingMethodKind(record)] ?? null
    : null;
  const label = byMethod?.label ?? base.label;
  if (!isLang(lang) || lang === "en") {
    return {
      ...base,
      label,
      clientLabel: byMethod?.clientLabel ?? base.clientLabel,
      ...(variant ? { clientMessage: variant } : {}),
    };
  }
  const key = known ? stage : "unknown";
  return {
    label,
    clientLabel: t(byMethod?.clientKey ?? `stage.${key}.label`, {}, lang),
    clientMessage: variant ?? t(`stage.${key}.client`, {}, lang),
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
