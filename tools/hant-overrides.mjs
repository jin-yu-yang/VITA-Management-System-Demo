// Hand fixes applied after OpenCC (common Traditional, characters only), where
// a Simplified character has several Traditional ones and the converter picked
// the wrong one for our sentence, or segmented it wrongly. One line of reason
// each. Matched as substrings of the converted text:
// { from: <Simplified source substring>, to: <Traditional>, reason }.
export default Object.freeze([
  { from: "家人参加", to: "家人參加", reason: "OpenCC reads 人参 (ginseng) across 家人参加 and writes 蔘; 'take part' is 參加" },
]);
