// Every Simplified string a client can see, as source strings (spec §4): the
// catalogue's zh, the client text table and its sentences. Task 4 adds the
// document cards' tables. Assembled text is never collected.
import CATALOGUE from "../src/intake-catalogue-data.mjs";
import { TEXT, SENTENCES } from "../src/client-text.mjs";

const HAN = /\p{Script=Han}/u;

function walkPairs(value, out) {
  if (Array.isArray(value)) {
    for (const item of value) walkPairs(item, out);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (typeof value.zh === "string" && (typeof value.en === "string" || typeof value.en === "object")) {
    if (!value.literal && HAN.test(value.zh)) out.add(value.zh);
  }
  if (value.zh && typeof value.zh === "object" && typeof value.zh.template === "string") out.add(value.zh.template);
  for (const [key, child] of Object.entries(value)) if (key !== "zh") walkPairs(child, out);
}

export function collectSimplified() {
  const out = new Set();
  walkPairs(CATALOGUE, out);
  for (const entry of Object.values(TEXT)) out.add(entry.zh);
  for (const zh of Object.values(SENTENCES)) out.add(zh);
  return [...out].filter((s) => HAN.test(s)).sort();
}

export { walkPairs };
