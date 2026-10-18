// The contact log's vocabulary, its one-line summary and its New York clock.
//
// Pure: no DOM, no store, no timers. The summary text is built here once, so
// the list, Copy and Copy all can never describe a contact two ways. Every time
// in the log is America/New_York, whatever zone the browser is set to (design
// D7). This module must not import staff-views.mjs: that file imports this one.

const pairs = (list) => Object.freeze(list.map((p) => Object.freeze(p)));

// [stored key, button label]
export const CONTACT_DIRECTIONS = pairs([["outgoing", "We contacted"], ["incoming", "The client contacted us"]]);
export const CONTACT_WITH = pairs([["client", "Client"], ["spouse", "Spouse"], ["other", "Other"]]);
export const CONTACT_METHODS = pairs([
  ["phone", "Phone"], ["text", "Text"], ["email", "Email"], ["in_person", "In person"], ["video", "Video"],
]);
export const CONTACT_PURPOSES = pairs([
  ["go_over_return", "Go over tax return"], ["ask_question", "Ask a question"],
  ["request_documents", "Request documents"], ["schedule_appointment", "Schedule an appointment"], ["other", "Other"],
]);
export const VOICE_OUTCOMES = pairs([
  ["reached", "Reached"], ["no_answer", "No answer"], ["left_voicemail", "Left voicemail"],
  ["wrong_number", "Wrong or invalid number"],
]);
export const WRITTEN_OUTCOMES = pairs([["sent", "Sent"], ["replied", "Client replied"], ["failed", "Failed to deliver"]]);

// The line reads in lower case and spells the outcome in full.
const METHOD_WORDS = Object.freeze({ phone: "phone", text: "text", email: "email", in_person: "in person", video: "video" });
const labelOf = (list, key) => (list.find(([k]) => k === key) || [, key])[1];

// Same words as UNKNOWN_PERSON in staff-views.mjs (which imports this module,
// so the constant cannot be imported back).
const UNKNOWN = "Unknown person";

// Incoming and in-person contacts are always "reached", so they have no choice.
export const outcomesFor = (method, direction) => {
  if (direction === "incoming" || method === "in_person") return [];
  return method === "phone" || method === "video" ? VOICE_OUTCOMES : WRITTEN_OUTCOMES;
};

export const staffShortName = (name) => {
  const words = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return UNKNOWN;
  if (words.length === 1) return words[0];
  return `${words[0]} ${words.at(-1)[0]}.`;
};

// ---------------------------------------------------------------------------
// New York time
// ---------------------------------------------------------------------------

const NY = { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric", minute: "2-digit" };
const partsOf = (formatter, date) =>
  Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
const clockFormat = new Intl.DateTimeFormat("en-US", { ...NY, hour: "numeric", hour12: true });
const fieldFormat = new Intl.DateTimeFormat("en-US", { ...NY, hour: "2-digit", hourCycle: "h23" });
const pad = (n, width = 2) => String(n).padStart(width, "0");

export const contactTime = (iso) => {
  const p = partsOf(clockFormat, new Date(iso));
  return `${p.month}/${p.day}/${p.year} ${p.hour}:${p.minute} ${p.dayPeriod}`;
};

// "YYYY-MM-DDTHH:mm" in New York wall time, for a datetime-local input.
export const nyLocalInput = (iso) => {
  const p = partsOf(fieldFormat, new Date(iso));
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${p.minute}`;
};

// A wall time to an instant. The offset is -04:00 or -05:00, so try both and
// keep those that read back as the same wall time. A repeated hour (clocks go
// back) matches twice and the first wins; a skipped hour (clocks go forward)
// matches neither and falls to -05:00, which reads one hour later. The result
// always ends in "Z": the database refuses a time without an offset.
export const nyLocalToIso = (value) => {
  const text = String(value).slice(0, 16);
  const candidates = ["-04:00", "-05:00"].map((offset) => new Date(`${text}:00${offset}`));
  const hits = candidates.filter((d) => !Number.isNaN(d.getTime()) && nyLocalInput(d) === text);
  return (hits[0] ?? candidates[1]).toISOString();
};

export const nowInput = (now = Date.now()) => nyLocalInput(new Date(now));

// ---------------------------------------------------------------------------
// The summary line (design D7)
// ---------------------------------------------------------------------------

const fullName = (first, last) => [first, last].map((s) => String(s ?? "").trim()).filter(Boolean).join(" ");

const whoOf = (entry, answers) => {
  if (entry.withWhom === "other") return String(entry.otherName ?? "").trim();
  const prefix = entry.withWhom === "spouse" ? "sp" : "tp";
  const name = fullName(answers[`${prefix}_first_name`], answers[`${prefix}_last_name`]);
  return name ? `${entry.withWhom} (${name})` : entry.withWhom;
};

export const contactSummary = (entry, { answers = {} } = {}) => {
  const logger = staffShortName(entry.loggedByName);
  const who = whoOf(entry, answers);
  const route = entry.direction === "incoming" ? `${who} → ${logger}` : `${logger} → ${who}`;
  const parts = [contactTime(entry.contactedAt), `${route}, ${METHOD_WORDS[entry.method] ?? entry.method}`,
    labelOf(CONTACT_PURPOSES, entry.purpose)];
  if (outcomesFor(entry.method, entry.direction).length > 0) {
    parts.push(labelOf([...VOICE_OUTCOMES, ...WRITTEN_OUTCOMES], entry.outcome));
  }
  const note = String(entry.note ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim();
  // The note's own ending stands; no second period.
  return `${parts.join(" — ")}.${note ? ` Note: ${note}` : ""}`;
};

export const contactSummaries = (entries, options) =>
  [...entries]
    .sort((a, b) => Date.parse(a.contactedAt) - Date.parse(b.contactedAt))
    .map((e) => contactSummary(e, options))
    .join("\n");

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

// Both outcome groups sit in the form, one hidden; only the group that matches
// the method counts, so Phone → No answer, then Text, cannot send no_answer.
export const contactEntryFromForm = (values) => {
  const { direction, method } = values;
  const outcome = outcomesFor(method, direction).length === 0 ? "reached"
    : method === "phone" || method === "video" ? values.outcomeVoice : values.outcomeWritten;
  const note = String(values.note ?? "").trim();
  const otherName = values.withWhom === "other" ? String(values.otherName ?? "").trim() : null;
  return {
    contactedAt: nyLocalToIso(values.contactedAt),
    direction, withWhom: values.withWhom, otherName, method, purpose: values.purpose, outcome,
    note: note || null,
  };
};
