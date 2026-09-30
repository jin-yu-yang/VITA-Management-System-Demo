// Reads the generated intake catalogue (version 2). Version 1 is not in the
// catalogue; its code lives elsewhere and is untouched.
import CATALOGUE_DATA from "./intake-catalogue-data.mjs";

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

export const wording = (question, { variant = "general", lang = "en" } = {}) =>
  question?.wording?.[variant]?.[lang] ?? question?.wording?.general?.[lang] ?? "";

const filled = (value) =>
  Array.isArray(value) ? value.length > 0 : typeof value === "string" ? value !== "" : false;

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
      const reason = checkValue(field, item);
      if (reason) return `${key}: ${reason}`;
    }
  }
  return null;
}

export function checkValue(question, value) {
  const type = question?.type;
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
      return value.length > 254 || value.split("@").length !== 2 || value.startsWith("@") || value.endsWith("@")
        ? "Enter a valid email address."
        : null;
    case "phone":
      return value.replace(/\D/g, "").length === 10 && !/[a-z]/i.test(value) ? null : "Enter a 10-digit phone number.";
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

const CONTACT_IDS = ["tp_phone", "sp_phone", "best_contact_time", "best_contact_note"];

const answered = (value) => (Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== "");

/** IDs of required, visible, unanswered questions. Contact fields come from `contact`. */
export function missingToSubmit(version, answers = {}, contact = {}) {
  const merged = { ...answers };
  for (const id of CONTACT_IDS) if (contact?.[id] !== undefined) merged[id] = contact[id];
  const missing = [];
  for (const question of allQuestions(version)) {
    if (!isVisible(question, merged)) continue;
    if (question.type === "group") {
      const members = Array.isArray(merged[question.id]) ? merged[question.id] : [];
      if (question.required && members.length === 0) missing.push(question.id);
      members.forEach((member, i) => {
        for (const field of question.fields ?? [])
          if (field.required && !answered(member?.[field.id])) missing.push(`${question.id}[${i}].${field.id}`);
      });
      continue;
    }
    if (question.required && !answered(merged[question.id])) missing.push(question.id);
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Service and language labels. Version 2 stores codes, version 1 stores labels.
// ---------------------------------------------------------------------------

const labelTable = (id) =>
  new Map(
    (findQuestion(2, id)?.options ?? []).map((o) => [o.value, o.label?.general?.en ?? o.value]),
  );
const SERVICE_LABELS = labelTable("service");
const LANGUAGE_LABELS = labelTable("language");

const labelOf = (table, value) => (typeof value === "string" && table.has(value) ? table.get(value) : value);
export const serviceLabel = (value) => labelOf(SERVICE_LABELS, value);
export const languageLabel = (value) => labelOf(LANGUAGE_LABELS, value);
