import { INTAKE_ANSWER_KEYS } from "./domain.mjs";

const sharedAnswers = Object.freeze({
  service: "Drop-off",
  year: "2025",
  language: "English",
  residenceCity: "Philadelphia",
  residenceState: "PA",
  city: "Philadelphia",
  state: "PA",
  rideshare: "yes",
  stocks: "no",
  helper: "self",
  documents: "ready",
});

const scenarioTemplates = Object.freeze({
  ordinary: Object.freeze([
    Object.freeze({
      ...sharedAnswers,
      other: "no",
      firstName: "Mei",
      lastName: "Chen",
      address: "Sample address withheld",
      zip: "19107",
      household: "1",
    }),
    Object.freeze({
      ...sharedAnswers,
      other: "no",
      firstName: "Jordan",
      lastName: "Rivera",
      address: "Fictional address withheld",
      zip: "19123",
      household: "2",
    }),
  ]),
  exception: Object.freeze([
    Object.freeze({
      ...sharedAnswers,
      other: "yes",
      firstName: "Avery",
      lastName: "Patel",
      address: "Example address withheld",
      zip: "19130",
      household: "3",
    }),
  ]),
});

function templateFor(seed, scenario) {
  const templates = scenarioTemplates[scenario];
  if (!templates) throw new RangeError(`Unknown fictional scenario: ${scenario}`);
  const numericSeed = Number.isFinite(Number(seed)) ? Math.trunc(Number(seed)) : 0;
  return templates[((numericSeed % templates.length) + templates.length) % templates.length];
}

function isBlank(value) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

export function makeSampleAnswers({ seed = 0, scenario = "ordinary" } = {}) {
  const template = templateFor(seed, scenario);
  const result = {};
  for (const key of INTAKE_ANSWER_KEYS) result[key] = template[key];
  return result;
}

export function fillBlankAnswers(current = {}, generated = {}) {
  const result = {};
  for (const key of INTAKE_ANSWER_KEYS) {
    if (!isBlank(current[key])) result[key] = current[key];
    else if (!isBlank(generated[key])) result[key] = generated[key];
  }
  return result;
}
