// Reads the generated intake catalogue (version 2).
import CATALOGUE_DATA from "./intake-catalogue-data.mjs";
import { sourceText } from "./language.mjs";

export const CATALOGUE = CATALOGUE_DATA;
export const MATERIALS_ITEMS = CATALOGUE_DATA.materials;

// `version` is kept for the callers' sake; every caller passes 2, the only one.
export const stepsFor = (version) => CATALOGUE.steps;

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

/** Every sub-step, in order, each `{ ...substep, step }` (`step` is its step object). */
export const substepsFor = (version) =>
  stepsFor(version).flatMap((step) => step.substeps.map((substep) => ({ ...substep, step })));

/** The sub-step with this id, or null. */
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
// The text a screen shows for one application (design D4): the not-married
// version when `answers` say the client isn't married and the item has one,
// else the usual text. Without `answers` (no application), the usual text.
const forClient = (usual, unmarried, answers) => (answers && unmarried && !spouseShown(answers) ? unmarried : usual);
const inVariant = (text, variant, lang) =>
  sourceText({ en: text?.[variant]?.en ?? text?.general?.en ?? "", zh: text?.[variant]?.zh ?? text?.general?.zh }, lang);

export const wording = (question, { variant = "general", lang = "en", answers } = {}) => {
  const w = forClient(question?.wording, question?.wordingUnmarried, answers);
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

/** A household member's name parts, first, middle and last, skipping unanswered ones. */
export const memberNameParts = (member) =>
  [member?.first_name, member?.middle_name, member?.last_name].filter(isAnswered);

// A whole number written in ASCII digits without a leading zero, else null.
// gte and lte read only these, as the database's intake_holds does (change
// add-widowed-spouse-rules): "02025", which the year check refuses, never
// counts as 2025.
const wholeNumber = (value) => (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value) ? Number(value) : null);

const holds = (condition, answers) => {
  if (condition.op === "any")
    return (condition.groups ?? []).some((group) => group.every((inner) => holds(inner, answers)));
  const value = answers?.[condition.field];
  if (condition.op === "filled") return filled(value);
  if (condition.op === "gte" || condition.op === "lte") {
    const n = wholeNumber(value);
    return n !== null && (condition.op === "gte" ? n >= condition.value : n <= condition.value);
  }
  const same = Array.isArray(value) ? value.includes(condition.value) : value === condition.value;
  if (condition.op === "eq") return same;
  if (condition.op === "ne") return filled(value) && !same;
  return false;
};

export const isVisible = (question, answers) =>
  (question?.showIf ?? []).every((condition) => holds(condition, answers ?? {}));

/** J, "filing with the spouse possible": married, or widowed with the death in
 * the tax year (rules.joint_possible, the rule that offers "My spouse").
 * Unanswered is neither. */
export const spouseShown = (answers) => isVisible({ showIf: CATALOGUE.fixedOptions.who.spouseShowIf }, answers ?? {});

/** S, "spouse on the return": married, or widowed with the death from 2023 to
 * the tax year (rules.spouse_on_return). */
export const spouseOnReturn = (answers) => isVisible({ showIf: CATALOGUE.rules.spouse_on_return }, answers ?? {});

/** A sub-step's title for one application, in `lang`: a widowed client's
 * `titleWidowed` when the sub-step has one (design D5), else its title. */
export const substepTitleOf = (substep, { variant = "general", lang = "en", answers } = {}) =>
  inVariant(answers?.marital_status === "widowed" && substep?.titleWidowed ? substep.titleWidowed : substep?.title, variant, lang);

/** A sub-step's lead line for one application, in `lang`; "" without a lead. */
export const leadOf = (substep, { variant = "general", lang = "en", answers } = {}) =>
  substep?.lead ? inVariant(forClient(substep.lead, substep.leadUnmarried, answers), variant, lang) : "";

/** A section's intro for one application, in `lang`; "" without an intro. */
export const introOf = (section, { variant = "general", lang = "en", answers } = {}) =>
  section?.intro ? inVariant(forClient(section.intro, section.introUnmarried, answers), variant, lang) : "";

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
      if (!/^\d{4}$/.test(value)) return "Enter a 4-digit year.";
      if (question.min !== undefined && question.max !== undefined && (Number(value) < question.min || Number(value) > question.max))
        return `Enter a year from ${question.min} to ${question.max}.`;
      return null;
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
// Service and language labels. Answers store codes.
// ---------------------------------------------------------------------------

const labelTable = (id) => new Map((findQuestion(2, id)?.options ?? []).map((o) => [o.value, o]));
const SERVICE_LABELS = labelTable("service");
const LANGUAGE_LABELS = labelTable("language");

// A label (a saved board filter's, say) or an unknown code comes back as it is.
const labelOf = (table, value, lang) => {
  if (typeof value !== "string" || !table.has(value)) return value;
  const option = table.get(value);
  return sourceText({ en: option.label?.general?.en ?? option.value, zh: option.label?.general?.zh }, lang);
};
export const serviceLabel = (value, lang = "en") => labelOf(SERVICE_LABELS, value, lang);
export const languageLabel = (value, lang = "en") => labelOf(LANGUAGE_LABELS, value, lang);

// ---------------------------------------------------------------------------
// The client's service languages (allow-multiple-service-languages, design
// D3): the preferred one (Q0.3, `language`) first, then the others (Q0.5,
// `language_also`) in option order, never twice. Other carries what was typed
// (Q0.4 or Q0.6). A label, from a version-1 answer or a help request's text,
// maps back to its code; any other text is Other with that text.
// ---------------------------------------------------------------------------

export const LANGUAGE_LETTERS = Object.freeze({ english: "E", cantonese: "C", mandarin: "M", other: "O" });
const LANGUAGE_CODES = [...LANGUAGE_LABELS.keys()];
const CODE_OF_LABEL = new Map(
  [...LANGUAGE_LABELS.values()].map((option) => [String(option.label?.general?.en ?? option.value).toLowerCase(), option.value]),
);
const trimmed = (value) => (typeof value === "string" ? value.trim() : "");

function languageEntry(value, typed) {
  const raw = trimmed(value);
  if (!raw) return null;
  const code = LANGUAGE_LABELS.has(raw) ? raw : CODE_OF_LABEL.get(raw.toLowerCase());
  if (code) return { code, label: languageLabel(code), text: code === "other" ? trimmed(typed) : "" };
  return { code: "other", label: languageLabel("other"), text: raw };
}

export function clientLanguages(answers) {
  const draft = answers ?? {};
  const also = Array.isArray(draft.language_also) ? draft.language_also : [];
  const entries = [
    languageEntry(draft.language, draft.language_other),
    ...LANGUAGE_CODES.filter((code) => also.includes(code)).map((code) => languageEntry(code, draft.language_also_other)),
  ].filter(Boolean);
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.code}|${entry.text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const languageLetters = (entries) => entries.map((entry) => LANGUAGE_LETTERS[entry.code] ?? "O").join(", ");

// Staff (`preferred`): English, the first marked "(preferred)", Other as
// "Other: <text>". A client: the screen language, Other as what they typed.
export function languageNames(entries, { lang = "en", preferred = false, separator = ", " } = {}) {
  const names = entries.map((entry) => {
    if (entry.code !== "other") return languageLabel(entry.code, preferred ? "en" : lang);
    if (preferred) return entry.text ? `${entry.label}: ${entry.text}` : entry.label;
    return entry.text || languageLabel("other", lang);
  });
  if (preferred && names.length) names[0] = `${names[0]} (preferred)`;
  return names.join(preferred ? ", " : separator);
}

// A filter's choice is a label (or a code), compared by its label.
export const speaksLanguage = (entries, chosen) =>
  chosen === "all" || entries.some((entry) => entry.label === languageLabel(chosen));

export const languageFilterLabels = (lists) =>
  [...new Set(lists.flatMap((entries) => entries.map((entry) => entry.label)))].sort();

// A language filter's options: "all" first, then the full name of every
// language any listed case's client speaks (design D5).
export const languageOptions = (cases, anyLabel) => [
  ["all", anyLabel],
  ...languageFilterLabels((cases ?? []).map((record) => clientLanguages(record?.answers))).map((label) => [label, label]),
];

export const languageSummary = (entries) => ({
  letters: languageLetters(entries),
  names: languageNames(entries, { preferred: true }),
  labels: entries.map((entry) => entry.label),
});
