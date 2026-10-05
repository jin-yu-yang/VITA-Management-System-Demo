import test from "node:test";
import assert from "node:assert/strict";
import * as OpenCC from "opencc-js";
import { collectSimplified } from "../tools/hant-sources.mjs";
import { convertAll, renderMap } from "../tools/build-hant.mjs";
import OVERRIDES from "../tools/hant-overrides.mjs";
import MAP from "../src/zh-hant.mjs";

test("the map holds exactly the current Simplified source strings", () => {
  const wanted = collectSimplified();
  assert.ok(wanted.length > 450, "the catalogue alone has about 480 unique strings");
  assert.deepEqual(Object.keys(MAP), wanted, "run npm run build:hant");
});

test("the committed map is what the build makes now", async () => {
  const converter = OpenCC.Converter({ from: "cn", to: "t" });
  const fresh = renderMap(convertAll(collectSimplified(), converter, OVERRIDES));
  const { readFile } = await import("node:fs/promises");
  const committed = await readFile(new URL("../src/zh-hant.mjs", import.meta.url), "utf8");
  assert.equal(committed, fresh, "run npm run build:hant");
});

test("common Traditional characters, no vocabulary swaps", () => {
  const converter = OpenCC.Converter({ from: "cn", to: "t" });
  const out = convertAll(["带照片的身份证件", "软件", "信息"], converter, []);
  assert.equal(out["带照片的身份证件"], "帶照片的身份證件");
  assert.equal(out["软件"], "軟件", "t keeps the word; twp would give 軟體");
  assert.equal(out["信息"], "信息", "t keeps the word; twp would give 資訊");
});

test("every override really lands in the generated map", async () => {
  const values = Object.values(MAP);
  for (const o of OVERRIDES) assert.ok(values.some((v) => v.includes(o.to)), `override ${o.from} → ${o.to} is not in the map`);
});

test("overrides apply after conversion, and each has a reason", () => {
  for (const o of OVERRIDES) {
    assert.equal(typeof o.from, "string");
    assert.equal(typeof o.to, "string");
    assert.ok(o.reason && o.reason.length > 5, `override ${o.from} needs a reason`);
  }
  const converter = (s) => s; // identity, to see the override alone
  const out = convertAll(["头发"], converter, [{ from: "头发", to: "頭髮", reason: "hair, not 發" }]);
  assert.equal(out["头发"], "頭髮");
});

test("templates keep their {placeholders}", () => {
  for (const [simplified, traditional] of Object.entries(MAP)) {
    const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).join(",");
    assert.equal(names(traditional), names(simplified), simplified);
  }
});
