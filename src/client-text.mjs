// Every client-screen string (spec 2026-10-05 §1, §3): English and the drafted
// Simplified Chinese, for the group's wording review. Traditional comes from
// the generated map (npm run build:hant). Keys are "<area>.<name>".
import { fill, plural, isLang } from "./language.mjs";
import { toHant } from "./hant.mjs";

export const TEXT = Object.freeze({
  // The frame
  "frame.skip": { en: "Skip to content", zh: "跳到主要内容" },
  "frame.language": { en: "Language", zh: "语言" },
  // Counts
  "count.parts": { en: { one: "1 part still needs answers", other: "{n} parts still need answers" }, zh: "还有 {n} 个部分需要回答" },
  // The version-2 form (intake-form.mjs): the long-answer counter
  "count.long": { en: "{length} of {limit} characters", zh: "已输入 {length} / {limit} 个字" },
  // The version-2 form: number range hints
  "range.or_more": { en: "{min} or more", zh: "{min} 或以上" },
  "range.between": { en: "{min} to {max}", zh: "{min} 至 {max}" },
  // The version-2 form: date boxes (Chinese order 年 / 月 / 日; the hints stay YYYY, MM, DD)
  "date.year": { en: "Year", zh: "年" },
  "date.month": { en: "Month", zh: "月" },
  "date.day": { en: "Day", zh: "日" },
  "date.year_hint": { en: "YYYY", zh: "YYYY" },
  "date.month_hint": { en: "MM", zh: "MM" },
  "date.day_hint": { en: "DD", zh: "DD" },
  // The version-2 form: the note under a question and the answer checks built with numbers
  "note.needs_answer": { en: "Needs an answer", zh: "需要回答" },
  "invalid.too_long": { en: "Use at most {limit} characters.", zh: "最多 {limit} 个字" },
  "invalid.number_range": { en: "Enter a number from {min} to {max}.", zh: "请输入 {min} 至 {max} 之间的数字" },
  "invalid.unknown_field": { en: "Unknown field {field}.", zh: "未知字段 {field}。" },
  "invalid.member_field": { en: "{field}: {reason}", zh: "{field}：{reason}" },
  // The version-2 form: part statuses on the rail
  "status.needs": { en: "Needs answers", zh: "需要回答" },
  "status.docs": { en: "Needs documents", zh: "需要文件" },
  "status.done": { en: "Done", zh: "已完成" },
  // The version-2 form: the household cards
  "member.person": { en: "Person {n}", zh: "成员 {n}" },
  "member.remove": { en: "Remove", zh: "移除" },
  "member.remove_label": { en: "Remove person {n}", zh: "移除成员 {n}" },
  "member.add": { en: "Add a person", zh: "添加一位成员" },
  // The version-2 form: a household member's read-only line (n picks one/other only)
  "member.born": { en: "born {date}", zh: "{date}出生" },
  "member.months": { en: { one: "{count} month", other: "{count} months" }, zh: "居住 {count} 个月" },
  // The version-2 form: the select's blank option and the separator between picked choices
  "form.select_option": { en: "Select an option", zh: "请选择" },
  "form.list_separator": { en: ", ", zh: "、" },
});

// Sentences that arrive in English (spec §3.2, §3.3): errors, sign-in, history.
export const SENTENCES = Object.freeze({
  "You do not have access to this step.": "您无权进行这一步。",
  // The version-2 form: checkValue's fixed messages (intake-catalogue.mjs), shown in the note
  "Enter a valid email address.": "请输入有效的电子邮箱。",
  "Enter a 10-digit phone number.": "请输入 10 位数字的电话号码。",
  "Enter a 5-digit ZIP code.": "请输入 5 位数字的邮编。",
  "Enter a real date as YYYY-MM-DD.": "请输入有效的日期，格式为 YYYY-MM-DD。",
  "Enter a 4-digit year.": "请输入 4 位数字的年份。",
  "Digits only.": "只能输入数字。",
  "At most 6 digits.": "最多 6 位数字。",
  "Not one of the choices.": "请从给出的选项中选择。",
  "Choose yes or no.": "请选择\"是\"或\"否\"。",
  "Expected a list of choices.": "请从选项中选择。",
  "No duplicates.": "选项不能重复。",
  "\"No one\" can't be combined.": "\"均无\"不能与其他选项同时选择。",
  "Expected text.": "请输入文字。",
  "Not a valid id.": "编号无效。",
  "Unknown question type.": "未知的问题类型。",
  // The version-2 form: checkGroup's messages (the household)
  "Expected a list.": "应为成员列表。",
  "At most 10 people.": "最多 10 位成员。",
  "Each person must be an object.": "成员资料格式不正确。",
  "Each person needs an id.": "每位成员都需要编号。",
  "Two people share an id.": "两位成员的编号相同。",
});

// An unknown language is English; null params mean none.
export function t(key, params = {}, lang = "en") {
  const entry = TEXT[key];
  if (!entry) throw new Error(`Unknown text key: ${key}`);
  const given = params ?? {};
  if (!isLang(lang) || lang === "en") return fill(plural(entry.en, given), given);
  const zh = lang === "zh-Hant" ? toHant(entry.zh) : entry.zh;
  return fill(zh, given);
}

export function sentence(text, lang = "en") {
  if (typeof text !== "string") return "";
  if (!isLang(lang) || lang === "en" || !Object.hasOwn(SENTENCES, text)) return text;
  return lang === "zh-Hant" ? toHant(SENTENCES[text]) : SENTENCES[text];
}
