// Reads the generated intake catalogue (version 2). Version 1 is not in the
// catalogue; its code lives elsewhere and is untouched.
import CATALOGUE_DATA from "./intake-catalogue-data.mjs";
import { sourceText } from "./language.mjs";

export const CATALOGUE = CATALOGUE_DATA;
export const MATERIALS_ITEMS = CATALOGUE_DATA.materials;

export const stepsFor = (version) => (Number(version) === 2 ? CATALOGUE.steps : []);

export const questionsFor = (version, step) => {
  const found = stepsFor(version).find((s) => s.n === (step?.n ?? step));
  return found ? found.sections.flatMap((section) => section.questions) : [];
};

const allQuestions = (version) => stepsFor(version).flatMap((s) => s.sections.flatMap((x) => x.questions));

export const findQuestion = (version, id) =>
  allQuestions(version).find((q) => q.id === id) ?? null;

// ---------------------------------------------------------------------------
// Sub-steps (spec 2026-10-04 §2): every step lists its sub-steps in order.
// ---------------------------------------------------------------------------

/** Every sub-step of the version, in order, each `{ ...substep, step }` (`step` is its step object). */
export const substepsFor = (version) =>
  stepsFor(version).flatMap((step) => step.substeps.map((substep) => ({ ...substep, step })));

/** The sub-step with this id, or null. Version 2 only: version 1 has no sub-steps. */
export const findSubstep = (id) => substepsFor(2).find((s) => s.id === id) ?? null;

/** The id of the sub-step holding this top-level question, or null. */
export const substepOfQuestion = (questionId) =>
  substepsFor(2).find((s) => s.questions.includes(questionId))?.id ?? null;

/** The question objects of a sub-step, in its order ([] for an unknown, documents or review sub-step). */
export const substepQuestions = (substepId) =>
  (findSubstep(substepId)?.questions ?? []).map((id) => findQuestion(2, id)).filter(Boolean);

/** The hidden household member id: 32 lowercase hexadecimal characters. */
export const isMemberId = (value) => typeof value === "string" && /^[0-9a-f]{32}$/.test(value);

// The catalogue is never indexed with the screen language: its { en, zh } pair
// goes through sourceText, which serves zh to both Chinese languages.
export const wording = (question, { variant = "general", lang = "en" } = {}) => {
  const w = question?.wording;
  return sourceText({ en: w?.[variant]?.en ?? w?.general?.en, zh: w?.[variant]?.zh ?? w?.general?.zh }, lang);
};

/** Answered: not null/undefined, not "" after trim, not an empty array. Task 3's SQL mirrors this. */
export const isAnswered = (value) =>
  value === undefined || value === null
    ? false
    : Array.isArray(value)
      ? value.length > 0
      : typeof value === "string"
        ? value.trim() !== ""
        : true;
const filled = isAnswered;

const holds = (condition, answers) => {
  const value = answers?.[condition.field];
  if (condition.op === "filled") return filled(value);
  const same = Array.isArray(value) ? value.includes(condition.value) : value === condition.value;
  if (condition.op === "eq") return same;
  if (condition.op === "ne") return filled(value) && !same;
  return false;
};

export const isVisible = (question, answers) =>
  (question?.showIf ?? []).every((condition) => holds(condition, answers ?? {}));

/** A copy of `answers` without the keys of hidden top-level questions. Other keys stay. */
export function visibleAnswers(version, answers = {}) {
  const hidden = new Set(
    allQuestions(version)
      .filter((question) => !isVisible(question, answers))
      .map((question) => question.id),
  );
  return Object.fromEntries(Object.entries(answers ?? {}).filter(([key]) => !hidden.has(key)));
}

// ---------------------------------------------------------------------------
// Value checks (spec 2.2). Each returns null or a short reason.
// ---------------------------------------------------------------------------

const validDate = (text) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
};

const optionValues = (question) => (question.options ?? []).map((o) => o.value);
const isString = (value) => typeof value === "string";
const tooLong = (value, limit) => (value.length > limit ? `Use at most ${limit} characters.` : null);

function checkGroup(question, value) {
  if (!Array.isArray(value)) return "Expected a list.";
  if (value.length > 10) return "At most 10 people.";
  const fields = new Map((question.fields ?? []).map((f) => [f.id, f]));
  for (const member of value) {
    if (!member || typeof member !== "object" || Array.isArray(member)) return "Each person must be an object.";
    for (const [key, item] of Object.entries(member)) {
      const field = fields.get(key);
      if (!field) return `Unknown field ${key}.`;
      if (key === "member_id") continue; // checked below: "" does not count as unanswered here
      const reason = checkValue(field, item);
      if (reason) return `${key}: ${reason}`;
    }
  }
  // Every person needs an id the server can trust, and no two share one.
  const ids = new Set();
  for (const member of value) {
    if (!isMemberId(member.member_id)) return "Each person needs an id.";
    if (ids.has(member.member_id)) return "Two people share an id.";
    ids.add(member.member_id);
  }
  return null;
}

/**
 * Checks an answered value against its type. An unanswered value (null, "" or
 * []) returns null: clearing a field is always allowed; whether it may stay
 * empty is missingToSubmit's business.
 * Contracts the server mirrors: phone = strip every non-digit, then exactly
 * 10 digits; email = at most 254 characters, exactly one "@", non-empty on
 * both sides, otherwise deliberately loose. One known difference: the browser
 * also rejects any whitespace ("a b@c" fails here), while the server's
 * check_intake_value accepts it. The direction is safe, because the client
 * withholds an invalid value from every save (spec 2026-09-30 §2.5).
 */
export function checkValue(question, value) {
  const type = question?.type;
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  if (type === "group") return checkGroup(question, value);
  if (type === "multi" || type === "who") {
    if (!Array.isArray(value) || !value.every(isString)) return "Expected a list of choices.";
    if (new Set(value).size !== value.length) return "No duplicates.";
    const allowed = type === "who" ? CATALOGUE.fixedOptions.who.options.map((o) => o.value) : optionValues(question);
    if (!value.every((v) => allowed.includes(v))) return "Not one of the choices.";
    if (type === "who" && value.includes("none") && value.length > 1) return "\"No one\" can't be combined.";
    return null;
  }
  if (!isString(value)) return "Expected text.";
  switch (type) {
    case "text":
    case "signature":
      return tooLong(value, 200);
    case "longtext":
      return tooLong(value, 5000);
    case "email":
      return value.length > 254 || /\s/.test(value) || value.split("@").length !== 2 || value.startsWith("@") || value.endsWith("@")
        ? "Enter a valid email address."
        : null;
    case "phone":
      return value.replace(/\D/g, "").length === 10  ? null : "Enter a 10-digit phone number.";
    case "zip":
      return /^\d{5}$/.test(value) ? null : "Enter a 5-digit ZIP code.";
    case "date":
      return validDate(value) ? null : "Enter a real date as YYYY-MM-DD.";
    case "year":
      return /^\d{4}$/.test(value) ? null : "Enter a 4-digit year.";
    case "number": {
      if (!/^\d+$/.test(value)) return "Digits only.";
      if (question.min !== undefined || question.max !== undefined) {
        const n = Number(value);
        if (n < (question.min ?? 0) || n > (question.max ?? Infinity))
          return `Enter a number from ${question.min ?? 0} to ${question.max}.`;
        return null;
      }
      return value.length > 6 ? "At most 6 digits." : null;
    }
    case "id":
      return isMemberId(value) ? null : "Not a valid id.";
    case "choice":
      return optionValues(question).includes(value) ? null : "Not one of the choices.";
    case "yesno":
      return optionValues(question).includes(value) ? null : "Choose yes or no.";
    default:
      return "Unknown question type.";
  }
}

// ---------------------------------------------------------------------------
// Submit check
// ---------------------------------------------------------------------------

/** Catalogue field id -> the store's contact key (spec 4). */
export const CONTACT_FIELDS = Object.freeze({
  tp_phone: "phone",
  sp_phone: "spousePhone",
  best_contact_time: "bestContactTime",
  best_contact_note: "bestContactNote",
});

/**
 * Whether `person` may see a case's contact details (D5: none on an available
 * case). RLS lets every staff persona read `case_contacts`, since it can't
 * tell personas apart, so screens enforce this. Mirrors 013's
 * `vitally_private.works_on_case`: office staff (`followup` or `admin`) on any
 * case, a volunteer only as the case's preparer or reviewer.
 */
export function canSeeContact(record, person) {
  if (!person) return false;
  const capabilities = Array.isArray(person.capabilities) ? person.capabilities : [];
  if (capabilities.includes("followup") || capabilities.includes("admin")) return true;
  return Boolean(person.id) && (person.id === record?.preparerId || person.id === record?.reviewerId);
}

/** IDs of required, visible, unanswered questions. Contact fields come from `contact`. */
export function missingToSubmit(version, answers = {}, contact = {}) {
  const merged = { ...answers };
  for (const [id, key] of Object.entries(CONTACT_FIELDS)) {
    const value = contact?.[key] !== undefined ? contact[key] : contact?.[id];
    if (value !== undefined) merged[id] = value;
  }
  const missing = [];
  for (const question of allQuestions(version)) {
    if (!isVisible(question, merged)) continue;
    if (question.type === "group") {
      const members = Array.isArray(merged[question.id]) ? merged[question.id] : [];
      if (question.required && members.length === 0) missing.push(question.id);
      members.forEach((member, i) => {
        for (const field of question.fields ?? [])
          if (field.required && !isAnswered(member?.[field.id])) missing.push(`${question.id}[${i}].${field.id}`);
      });
      continue;
    }
    if (question.required && !isAnswered(merged[question.id])) missing.push(question.id);
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Service and language labels. Version 2 stores codes, version 1 stores labels.
// ---------------------------------------------------------------------------

const labelTable = (id) => new Map((findQuestion(2, id)?.options ?? []).map((o) => [o.value, o]));
const SERVICE_LABELS = labelTable("service");
const LANGUAGE_LABELS = labelTable("language");

// A stored label (version 1) or an unknown code comes back as it is.
const labelOf = (table, value, lang) => {
  if (typeof value !== "string" || !table.has(value)) return value;
  const option = table.get(value);
  return sourceText({ en: option.label?.general?.en ?? option.value, zh: option.label?.general?.zh }, lang);
};
export const serviceLabel = (value, lang = "en") => labelOf(SERVICE_LABELS, value, lang);
export const languageLabel = (value, lang = "en") => labelOf(LANGUAGE_LABELS, value, lang);
