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

// The map's loader. `importModule` is the caller's own import(), so the path
// stays relative to the page's modules. Some engines cache a failed module
// fetch, so after a failure each retry asks for a fresh URL (?r=1, ?r=2, …);
// the first try is the plain path.
export function createHantLoader(importModule) {
  let failures = 0;
  return async function loadHant() {
    const url = failures === 0 ? "./zh-hant.mjs" : `./zh-hant.mjs?r=${failures}`;
    try {
      setHantMap((await importModule(url)).default);
    } catch (error) {
      failures += 1;
      throw error;
    }
  };
}
