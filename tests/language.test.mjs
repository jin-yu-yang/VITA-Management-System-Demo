import test from "node:test";
import assert from "node:assert/strict";
import { LANGS, STORAGE_KEY, defaultLanguage, readLanguage, writeLanguage, sourceText, viewLang, localeOf, fill } from "../src/language.mjs";
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
    const ens = typeof entry.en === "string" ? [entry.en] : [entry.en.one, entry.en.other];
    if (typeof entry.en !== "string") assert.ok(entry.en.one && entry.en.other, `${key} plural needs one and other`);
    for (const en of ens) assert.equal(names(en), names(entry.zh), `${key} placeholders differ`);
  }
});
