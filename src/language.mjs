// The client's language (spec 2026-10-05 §2): en, zh-Hans or zh-Hant, kept per
// browser. Staff screens are always English. Catalogue and card text reaches
// the screen only through sourceText, so no module indexes the catalogue with
// a screen language.
import { toHant } from "./hant.mjs";

export const LANGS = Object.freeze(["en", "zh-Hans", "zh-Hant"]);
export const STORAGE_KEY = "vitally.lang";
const LOCALES = Object.freeze({ en: "en-US", "zh-Hans": "zh-CN", "zh-Hant": "zh-HK" });

export const localeOf = (lang) => LOCALES[lang] ?? LOCALES.en;
export const isLang = (value) => LANGS.includes(value);

export function defaultLanguage(languages) {
  const first = String((Array.isArray(languages) ? languages : [])[0] ?? "").toLowerCase();
  if (!first.startsWith("zh")) return "en";
  if (/^zh-(tw|hk|mo)\b/.test(first) || first.startsWith("zh-hant")) return "zh-Hant";
  return "zh-Hans";
}

export function readLanguage({ storage, languages }) {
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    // Blocked storage: fall through to the browser's languages.
  }
  return defaultLanguage(languages);
}

export function writeLanguage(lang, { storage }) {
  if (!isLang(lang)) throw new Error(`Unknown language: ${lang}`);
  try {
    storage?.setItem(STORAGE_KEY, lang);
  } catch {
    // Blocked storage: the choice lasts for this page only.
  }
}

// Staff and presenter screens are English whatever this browser chose.
export const viewLang = (state) =>
  state?.principal?.access === "presenter" ? "en" : isLang(state?.lang) ? state.lang : "en";

export const fill = (template, params = {}) =>
  String(template).replace(/\{(\w+)\}/g, (whole, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  );

const plural = (en, params) =>
  typeof en === "string" ? en : Number(params?.n) === 1 ? en.one : en.other;

// One catalogue- or card-style value in the screen language. zh may be a
// template ({ template, params }): the template is converted, then filled, so
// the client's own words are never converted.
export function sourceText(pair, lang = "en") {
  if (!pair) return "";
  const params = pair.params ?? (typeof pair.zh === "object" ? pair.zh?.params : undefined) ?? {};
  const english = () => fill(plural(pair.en ?? "", params), params);
  if (pair.literal) return lang === "en" ? String(pair.en ?? "") : String(pair.zh ?? pair.en ?? "");
  if (lang === "en" || pair.zh === undefined || pair.zh === null || pair.zh === "") return english();
  const convert = (s) => (lang === "zh-Hant" ? toHant(s) : s);
  if (typeof pair.zh === "object") return fill(convert(pair.zh.template), pair.zh.params ?? {});
  return convert(pair.zh);
}
