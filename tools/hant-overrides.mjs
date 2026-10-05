// Hand fixes applied after OpenCC (Hong Kong forms), where a Simplified
// character has several Traditional ones and the converter picked the wrong
// one for our sentence, or left a Simplified-source character alone. One line
// of reason each. Matched as substrings of the converted text:
// { from: <Simplified source substring>, to: <Traditional>, reason }.
export default Object.freeze([
  { from: "税", to: "稅", reason: "the catalogue writes 税 (U+7A0E, a GB variant); OpenCC leaves it, Traditional is 稅 (U+7A05)" },
  { from: "户", to: "戶", reason: "the catalogue writes 户 (U+6237, a variant of 戶); OpenCC leaves it, Traditional is 戶 (U+6236)" },
  { from: "兑", to: "兌", reason: "the catalogue writes 兑 (U+5151, a variant of 兌); OpenCC leaves it, Traditional is 兌 (U+514C)" },
  { from: "说", to: "說", reason: "OpenCC's hk output is the variant 説 (U+8AAC); Hong Kong standard is 說 (U+8AAA)" },
  { from: "阅", to: "閱", reason: "OpenCC's hk output is the variant 閲 (U+95B2); Hong Kong standard is 閱 (U+95B1)" },
  { from: "侄", to: "姪", reason: "侄 (nephew/niece) is unchanged by OpenCC; Traditional is 姪" },
  { from: "家人参加", to: "家人參加", reason: "OpenCC reads 人参 (ginseng) across 家人参加 and writes 蔘; 'take part' is 參加" },
  { from: "汇总", to: "匯總", reason: "OpenCC picks 彙總; Hong Kong writes 匯總 for a summary statement" },
]);
