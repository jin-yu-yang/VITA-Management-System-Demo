import test from "node:test";
import assert from "node:assert/strict";
import { LANGS, STORAGE_KEY, defaultLanguage, readLanguage, writeLanguage, createLanguageRequests, sourceText, viewLang, localeOf, fill } from "../src/language.mjs";
import { setHantMap, toHant, hantReady } from "../src/hant.mjs";
import { TEXT, SENTENCES, t, sentence } from "../src/client-text.mjs";

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
};
const blockedStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };

test("the three languages and the storage key", () => {
  assert.deepEqual(LANGS, ["en", "zh-Hans", "zh-Hant"]);
  assert.equal(STORAGE_KEY, "vitally.lang");
});

test("the first visit follows the browser's languages", () => {
  assert.equal(defaultLanguage(["zh-TW"]), "zh-Hant");
  assert.equal(defaultLanguage(["zh-HK", "en"]), "zh-Hant");
  assert.equal(defaultLanguage(["zh-MO"]), "zh-Hant");
  assert.equal(defaultLanguage(["zh-Hant-US"]), "zh-Hant");
  assert.equal(defaultLanguage(["zh-CN"]), "zh-Hans");
  assert.equal(defaultLanguage(["zh"]), "zh-Hans");
  assert.equal(defaultLanguage(["zh-Hans-SG"]), "zh-Hans");
  assert.equal(defaultLanguage(["en-US", "zh-CN"]), "en", "the first preference wins");
  assert.equal(defaultLanguage([]), "en");
  assert.equal(defaultLanguage(undefined), "en");
});

test("a saved choice wins; blocked or odd storage means the default or English", () => {
  assert.equal(readLanguage({ storage: memoryStorage({ "vitally.lang": "zh-Hant" }), languages: ["en"] }), "zh-Hant");
  assert.equal(readLanguage({ storage: memoryStorage({ "vitally.lang": "klingon" }), languages: ["zh-CN"] }), "zh-Hans");
  assert.equal(readLanguage({ storage: memoryStorage(), languages: ["zh-TW"] }), "zh-Hant");
  assert.equal(readLanguage({ storage: blockedStorage, languages: ["zh-CN"] }), "zh-Hans");
  assert.equal(readLanguage({ storage: null, languages: [] }), "en");
  const storage = memoryStorage();
  writeLanguage("zh-Hans", { storage });
  assert.equal(storage.data["vitally.lang"], "zh-Hans");
  assert.doesNotThrow(() => writeLanguage("zh-Hans", { storage: blockedStorage }));
  assert.throws(() => writeLanguage("fr", { storage }), /language/);
});

test("staff screens are English; everything else follows the chosen language", () => {
  assert.equal(viewLang({ lang: "zh-Hans", principal: { access: "presenter" } }), "en");
  assert.equal(viewLang({ lang: "zh-Hans", principal: { access: "applicant" } }), "zh-Hans");
  assert.equal(viewLang({ lang: "zh-Hant", principal: null }), "zh-Hant");
  assert.equal(viewLang({}), "en");
  assert.equal(localeOf("en"), "en-US");
  assert.equal(localeOf("zh-Hans"), "zh-CN");
  assert.equal(localeOf("zh-Hant"), "zh-HK");
});

test("fill puts each {name} in, and leaves an unknown one visible", () => {
  assert.equal(fill("您说有 {n} 份工作，请上传 {n} 张 W-2。", { n: 2 }), "您说有 2 份工作，请上传 2 张 W-2。");
  assert.equal(fill("Hello {name}", {}), "Hello {name}");
});

test("toHant looks up exact strings and falls back to the Simplified", () => {
  setHantMap(null);
  assert.equal(hantReady(), false);
  assert.equal(toHant("身份证件"), "身份证件");
  setHantMap({ "身份证件": "身份證件", "您说有 {n} 份工作": "您說有 {n} 份工作" });
  assert.equal(hantReady(), true);
  assert.equal(toHant("身份证件"), "身份證件");
  assert.equal(toHant("身份证件。"), "身份证件。", "assembled text is never looked up");
  setHantMap(null);
});

test("sourceText reads en, zh, or zh through toHant; literals and templates", () => {
  setHantMap({ "带照片的身份证件": "帶照片的身份證件", "您填写的是：{written}": "您填寫的是：{written}" });
  const pair = { en: "Photo ID", zh: "带照片的身份证件" };
  assert.equal(sourceText(pair, "en"), "Photo ID");
  assert.equal(sourceText(pair, "zh-Hans"), "带照片的身份证件");
  assert.equal(sourceText(pair, "zh-Hant"), "帶照片的身份證件");
  assert.equal(sourceText({ en: "Photo ID" }, "zh-Hans"), "Photo ID", "a missing zh falls back to en");
  assert.equal(sourceText({ en: "林美", zh: "林美", literal: true }, "zh-Hant"), "林美");
  const wrote = { en: "You wrote: 车", zh: { template: "您填写的是：{written}", params: { written: "车" } } };
  assert.equal(sourceText(wrote, "zh-Hant"), "您填寫的是：车", "the client's text is filled in after, never converted");
  const plural = { en: { one: "{n} job", other: "{n} jobs" }, zh: { template: "{n} 份工作", params: { n: 3 } }, params: { n: 3 } };
  assert.equal(sourceText(plural, "en"), "3 jobs");
  assert.equal(sourceText(undefined, "en"), "");
  setHantMap(null);
});

test("t picks the language, the plural and the params; unknown keys throw", () => {
  setHantMap({ "跳到主要内容": "跳到主要內容" });
  assert.equal(t("frame.skip", {}, "en"), "Skip to content");
  assert.equal(t("frame.skip", {}, "zh-Hans"), "跳到主要内容");
  assert.equal(t("frame.skip", {}, "zh-Hant"), "跳到主要內容");
  assert.equal(t("frame.skip"), "Skip to content", "English by default");
  assert.throws(() => t("no.such.key", {}, "en"), /no\.such\.key/);
  setHantMap(null);
});

test("sentence translates a known English sentence and leaves an unknown one", () => {
  const [english, zh] = Object.entries(SENTENCES)[0];
  assert.equal(sentence(english, "zh-Hans"), zh);
  assert.equal(sentence(english, "en"), english);
  assert.equal(sentence("A sentence nobody wrote down.", "zh-Hans"), "A sentence nobody wrote down.");
  assert.equal(sentence(undefined, "zh-Hans"), "");
});

test("every TEXT entry has en and zh with the same placeholders", () => {
  const names = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const [key, entry] of Object.entries(TEXT)) {
    assert.ok(entry.en && entry.zh, `${key} needs en and zh`);
    if (typeof entry.en === "string") {
      assert.equal(names(entry.en), names(entry.zh), `${key} placeholders differ`);
      continue;
    }
    assert.ok(entry.en.one && entry.en.other, `${key} plural needs one and other`);
    assert.equal(names(entry.en.other), names(entry.zh), `${key} placeholders differ`);
    const allowed = names(entry.zh).split(",");
    for (const name of names(entry.en.one).split(",").filter(Boolean)) {
      assert.ok(allowed.includes(name), `${key} one-form uses {${name}}, which zh lacks`);
    }
  }
});

test("a plain-string en is verbatim: client text with braces is never filled", () => {
  setHantMap({ "您写了：{written}": "您寫了：{written}" });
  const card = { en: "You wrote: {n} cars", zh: { template: "x {n}", params: { n: "3" } } };
  assert.equal(sourceText(card, "en"), "You wrote: {n} cars");
  const typed = { en: "You wrote: {n} 辆", zh: { template: "您写了：{written}", params: { written: "{n} 辆" } } };
  assert.equal(sourceText(typed, "en"), "You wrote: {n} 辆");
  assert.equal(sourceText(typed, "zh-Hans"), "您写了：{n} 辆");
  assert.equal(sourceText(typed, "zh-Hant"), "您寫了：{n} 辆");
  setHantMap(null);
});

test("sourceText: one params for the plural English and the Chinese template", () => {
  const pair = { en: { one: "{n} job", other: "{n} jobs" }, zh: { template: "{n} 份工作" }, params: { n: 4 } };
  assert.equal(sourceText(pair, "en"), "4 jobs");
  assert.equal(sourceText(pair, "zh-Hans"), "4 份工作");
  assert.equal(sourceText({ ...pair, params: { n: 1 } }, "en"), "1 job");
});

test("sourceText: an unknown language is English; a zh object without a template is English", () => {
  const pair = { en: "Photo ID", zh: "带照片的身份证件" };
  for (const lang of [undefined, null, "fr", ""]) assert.equal(sourceText(pair, lang), "Photo ID", `lang ${lang}`);
  assert.equal(sourceText({ en: "林美", zh: "林美", literal: true }, "fr"), "林美");
  assert.equal(sourceText({ en: "Photo ID", zh: { params: { n: 1 } } }, "zh-Hans"), "Photo ID");
  assert.equal(sourceText({ en: "Photo ID", zh: {} }, "zh-Hant"), "Photo ID");
});

test("t: plural entries, null params, unknown language", () => {
  setHantMap({ "还有 {n} 个部分需要回答": "還有 {n} 個部分需要回答" });
  assert.equal(t("count.parts", { n: 1 }, "en"), "1 part still needs answers");
  assert.equal(t("count.parts", { n: 3 }, "en"), "3 parts still need answers");
  assert.equal(t("count.parts", { n: 3 }, "zh-Hans"), "还有 3 个部分需要回答");
  assert.equal(t("count.parts", { n: 3 }, "zh-Hant"), "還有 3 個部分需要回答");
  assert.equal(t("frame.skip", null, "en"), "Skip to content");
  for (const lang of [undefined, null, "fr"]) assert.equal(t("frame.skip", {}, lang), "Skip to content", `lang ${lang}`);
  assert.equal(fill("Hello {name}", null), "Hello {name}");
  assert.equal(sentence("You do not have access to this step.", "fr"), "You do not have access to this step.");
  setHantMap(null);
});

// app.mjs's switch, storage event and startup share one of these: a 繁體 load
// that lands after a newer choice must neither redraw nor save it.
function deferredLoads() {
  let ready = false;
  const pending = [];
  return {
    hantReady: () => ready,
    loadHant: () =>
      new Promise((resolve, reject) =>
        pending.push({ resolve: () => { ready = true; resolve(); }, reject: () => reject(new Error("offline")) }),
      ),
    pending,
  };
}

test("language requests: a slow 繁體 load never overrides a newer choice", async () => {
  const loads = deferredLoads();
  const requests = createLanguageRequests(loads);
  const applied = [];
  const apply = (lang) => applied.push(lang);
  const hant = requests.want("zh-Hant", apply); // waits for the map
  const english = requests.want("en", apply); // pressed meanwhile: applied at once
  assert.equal(await english, "applied");
  assert.deepEqual(applied, ["en"]);
  loads.pending[0].resolve();
  assert.equal(await hant, "stale");
  assert.deepEqual(applied, ["en"], "the late load did not flip back to 繁體");
  // Once loaded, 繁體 applies at once.
  assert.equal(await requests.want("zh-Hant", apply), "applied");
  assert.deepEqual(applied, ["en", "zh-Hant"]);
});

test("language requests: of two 繁體 loads only the newest applies; a failure is reported only when newest", async () => {
  const loads = deferredLoads();
  const requests = createLanguageRequests(loads);
  const applied = [];
  const first = requests.want("zh-Hant", (lang) => applied.push(`first ${lang}`));
  const second = requests.want("zh-Hant", (lang) => applied.push(`second ${lang}`));
  loads.pending[0].resolve();
  loads.pending[1].resolve();
  assert.equal(await first, "stale");
  assert.equal(await second, "applied");
  assert.deepEqual(applied, ["second zh-Hant"]);

  const failing = deferredLoads();
  const again = createLanguageRequests(failing);
  const older = again.want("zh-Hant", () => assert.fail("never applied"));
  const newer = again.want("zh-Hans", () => {});
  failing.pending[0].reject();
  assert.equal(await older, "stale", "an outdated failure says nothing");
  assert.equal(await newer, "applied");
  const lone = again.want("zh-Hant", () => assert.fail("never applied"));
  failing.pending[1].reject();
  assert.equal(await lone, "failed");
});
