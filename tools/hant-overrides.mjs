// Hand fixes applied after OpenCC (Taiwan character forms (tw), characters
// only, no vocabulary swaps), where a Simplified character has several
// Traditional ones and the converter picked the wrong one for our sentence, or
// segmented it wrongly. One line of reason each. Matched as substrings of the
// converted text: { from: <Simplified source substring>, to: <Traditional>, reason }.
export default Object.freeze([]);
