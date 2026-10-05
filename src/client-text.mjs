// Every client-screen string (spec 2026-10-05 §1, §3): English and the drafted
// Simplified Chinese, for the group's wording review. Traditional comes from
// the generated map (npm run build:hant). Keys are "<area>.<name>".
import { fill } from "./language.mjs";
import { toHant } from "./hant.mjs";

export const TEXT = Object.freeze({
  // The frame
  "frame.skip": { en: "Skip to content", zh: "跳到主要内容" },
  "frame.language": { en: "Language", zh: "语言" },
});

// Sentences that arrive in English (spec §3.2, §3.3): errors, sign-in, history.
export const SENTENCES = Object.freeze({
  "You do not have access to this step.": "您无权进行这一步。",
});

const pick = (en, params) => (typeof en === "string" ? en : Number(params?.n) === 1 ? en.one : en.other);

export function t(key, params = {}, lang = "en") {
  const entry = TEXT[key];
  if (!entry) throw new Error(`Unknown text key: ${key}`);
  if (lang === "en") return fill(pick(entry.en, params), params);
  const zh = lang === "zh-Hant" ? toHant(entry.zh) : entry.zh;
  return fill(zh, params);
}

export function sentence(text, lang = "en") {
  if (typeof text !== "string") return "";
  if (lang === "en" || !Object.hasOwn(SENTENCES, text)) return text;
  return lang === "zh-Hant" ? toHant(SENTENCES[text]) : SENTENCES[text];
}
