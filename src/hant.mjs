// The Traditional map's registry (spec 2026-10-05 §4). The map itself is the
// generated src/zh-hant.mjs, loaded only when 繁體 is chosen; until then — or
// for a string the map lacks — toHant returns the Simplified unchanged. Keys
// are exact source strings: never look up assembled text.
let map = null;

export function setHantMap(next) {
  map = next && typeof next === "object" ? next : null;
}

export const hantReady = () => map !== null;

export const toHant = (text) => (map && typeof text === "string" && Object.hasOwn(map, text) ? map[text] : text);
