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
  // Stage names and the client's status message (domain.mjs describeStage; the English is
  // STAGE_DESCRIPTIONS there, kept in step by tests/domain.test.mjs)
  "stage.draft.label": { en: "Draft", zh: "草稿" },
  "stage.draft.client": { en: "Your application is saved and has not been sent to the office yet.", zh: "您的申请已保存，尚未发送给办公室。" },
  "stage.received.label": { en: "Received", zh: "已收到" },
  "stage.received.client": { en: "Your application is with the office. A volunteer will check your information and documents.", zh: "办公室已收到您的申请。志愿者会核对您的信息和文件。" },
  "stage.preparation_ready.label": { en: "Waiting for preparation", zh: "等待准备" },
  "stage.preparation_ready.client": { en: "Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.", zh: "模拟的登记核查已记录。您的申请正在等待志愿者开始准备报税表。" },
  "stage.preparing.label": { en: "In preparation", zh: "准备中" },
  "stage.preparing.client": { en: "A volunteer is preparing your return.", zh: "志愿者正在准备您的报税表。" },
  "stage.review_ready.label": { en: "Waiting for review", zh: "等待审核" },
  "stage.review_ready.client": { en: "Preparation is complete in the tax software. Your return is waiting for an independent reviewer.", zh: "报税软件中的准备工作已完成。您的报税表正在等待独立审核员审核。" },
  "stage.reviewing.label": { en: "In review", zh: "审核中" },
  "stage.reviewing.client": { en: "An independent reviewer is checking your return.", zh: "独立审核员正在检查您的报税表。" },
  "stage.corrections_required.label": { en: "Corrections in progress", zh: "正在更正" },
  "stage.corrections_required.client": { en: "The reviewer asked your preparer to make corrections. No action is needed from you right now.", zh: "审核员已请为您准备报税表的志愿者进行更正。您目前无需做任何事。" },
  "stage.review_approved.label": { en: "Review complete", zh: "审核完成" },
  "stage.review_approved.client": { en: "Independent review is complete. A volunteer will contact you about next steps. Signing and filing are later milestones and are not done yet.", zh: "独立审核已完成。志愿者会联系您说明后续步骤。签名和递交报税表是之后的步骤，目前尚未进行。" },
  "stage.closed.label": { en: "Closed", zh: "已关闭" },
  "stage.closed.client": { en: "This application was closed by the office. This does not change any return filed elsewhere.", zh: "此申请已由办公室关闭。这不影响在其他地方递交的任何报税表。" },
  "stage.unknown.label": { en: "Application", zh: "申请" },
  "stage.unknown.client": { en: "This application is with the office. Contact PCDC if you have questions.", zh: "此申请正在办公室处理。如有疑问，请联系 PCDC。" },
  // Days on lists (ui.mjs relativeDay); older dates use the language's own month and day
  "day.today": { en: "Today", zh: "今天" },
  "day.yesterday": { en: "Yesterday", zh: "昨天" },
  "day.ago": { en: "{n} days ago", zh: "{n} 天前" },
  // A case without a client number (ui.mjs clientNumberLabel)
  "client_number.none": { en: "No number yet", zh: "尚无编号" },
  "client_number.never": { en: "Never sent", zh: "从未发送" },
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
