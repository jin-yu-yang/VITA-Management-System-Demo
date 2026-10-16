// Hand fixes applied after OpenCC (Taiwan character forms (tw), characters
// only, no vocabulary swaps), where a Simplified character has several
// Traditional ones and the converter picked the wrong one for our sentence, or
// segmented it wrongly. One line of reason each. Matched as substrings of the
// converted text: { from: <Simplified source substring>, to: <Traditional>, reason }.
export default Object.freeze([
  { from: "不合并申报", to: "不合併申報", reason: "合併申報 is the tax term; OpenCC segments 不合|并" },
]);
