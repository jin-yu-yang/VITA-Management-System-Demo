import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { inflateSync } from "node:zlib";
import {
  PDFDocument, PDFDict, PDFName, PDFArray, PDFCheckBox, PDFTextField, StandardFonts, rgb,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import * as bundled from "../src/vendor/pdf-lib.mjs";
import { FORM_FILES, FORM_SHA256, draftFields, draftFieldNames } from "../src/draft-form.mjs";
import {
  CJK_DRAW, DRAFT_FONTS, DRAFT_FONT_FIXTURES, WIN_ANSI_CODE_POINTS, buildDraftPdf, draftFontsFor,
  fieldsNeedFont, needsEmbeddedFont, patchSubsetPadding, printable,
} from "../src/draft-pdf.mjs";

// Node, with pdf-lib and fontkit from node_modules. The fonts are the
// byte-identical copies installed from npm (DRAFT_FONT_FIXTURES); no test here
// reaches the network. All names and data are fictional.
const PDFLib = { PDFDocument, StandardFonts, rgb };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const formBytes = (form) => readFile(new URL(`../${FORM_FILES[form]}`, import.meta.url));
const fixtureBytes = (url) => readFile(new URL(`../${DRAFT_FONT_FIXTURES[url].path}`, import.meta.url));
const fontFilesFor = (form) => Promise.all(draftFontsFor(form).files.map((file) => fixtureBytes(file.url)));
const F = (name) => `form1[0].${name}`;
const NOTICE = "Some characters could not be printed. The online answers have them in full.";

// pdf-lib warns once per load that it drops the forms' XFA layer; that is
// expected (the draft uses the AcroForm fields only), so keep the output quiet.
const warn = console.warn;
console.warn = (...args) => (/XFA/.test(String(args[0])) ? undefined : warn(...args));

const BASE = Object.freeze({
  tp_first_name: "Mei",
  tp_last_name: "Lin",
  tp_dob: "1961-04-05",
  tp_job_title: "Bookkeeper",
  tp_phone: "2155550199",
  marital_status: "married",
  married_last_day: "yes",
  lived_apart_last_6mo: "no",
  sp_first_name: "Lan",
  sp_last_name: "Lin",
  us_citizen: ["me"],
  inc_wages: "yes",
  gcf_consent: "no",
  additional_notes: "My 1099-INT has not arrived yet.",
});
const OPTIONS = { reference: "VT-ABCD-EFGH", today: "2026-10-04" };

/** A fontFiles stand-in that records whether the builder touched it. */
function watchedFiles(files = []) {
  const seen = { read: false };
  const proxy = new Proxy(files, {
    get(target, key, receiver) {
      seen.read = true;
      return Reflect.get(target, key, receiver);
    },
  });
  return { proxy, seen };
}

async function build(answers, { form = "en", fontFiles = [], flatten = true } = {}) {
  const fields = draftFields(answers, { ...OPTIONS, form });
  const bytes = await buildDraftPdf({
    PDFLib, fontkit, formBytes: await formBytes(form), fontFiles, fields,
    stamp: fields.stamp, fileName: fields.fileName, flatten,
  });
  assert.ok(bytes instanceof Uint8Array);
  return { bytes, fields, doc: await PDFDocument.load(bytes) };
}

const decoded = (stream) => {
  const filter = stream.dict.lookup(PDFName.of("Filter"));
  const raw = Buffer.from(stream.contents ?? stream.getContents());
  return filter === PDFName.of("FlateDecode") ? inflateSync(raw) : raw;
};

/** Every content stream of the page, decoded, as one latin1 string. */
function pageContent(page) {
  const contents = page.node.lookup(PDFName.of("Contents"));
  const streams = contents instanceof PDFArray
    ? contents.asArray().map((ref) => page.doc.context.lookup(ref))
    : [contents];
  return streams.map((stream) => decoded(stream).toString("latin1")).join("\n");
}

const hexOf = (text) => Buffer.from(text, "latin1").toString("hex").toUpperCase();
const hasHexText = (content, text) => content.toUpperCase().includes(`<${hexOf(text)}`);
/** The Helvetica (WinAnsi) strings drawn on the page, in order, without the stamp or embedded-font (CID) runs. */
const drawnLines = (page) =>
  [...pageContent(page).matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)]
    .map((m) => Buffer.from(m[1], "hex").toString("latin1"))
    .filter((line) => !line.startsWith("DRAFT ") && !line.includes("\x00"));

/** The embedded TrueType files (FontFile2) of a saved PDF, with their ToUnicode maps. */
function embeddedFonts(doc) {
  const found = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    const descendants = object.lookup(PDFName.of("DescendantFonts"));
    if (!descendants) continue;
    const cid = descendants.lookup(0);
    const descriptor = cid.lookup(PDFName.of("FontDescriptor"));
    const file = descriptor.lookup(PDFName.of("FontFile2"));
    // Only the draft's own fonts: the Chinese forms carry fonts of their own.
    if (!file || !/^\/NotoSans(SC|TC)?-Regular-\d+$/.test(String(object.get(PDFName.of("BaseFont"))))) continue;
    const toUnicode = object.lookup(PDFName.of("ToUnicode"));
    found.push({ file: decoded(file), toUnicode: toUnicode ? decoded(toUnicode).toString("latin1") : "" });
  }
  return found;
}

/**
 * Task 1's regression check for the fontkit subset bug: the embedded subset
 * parses, its `loca` agrees with its `glyf`, and every glyph it maps decodes
 * to the same outline as in the source font.
 */
function subsetProblems({ file, toUnicode }, sourceFonts) {
  const problems = [];
  const subset = fontkit.create(file);
  const offsets = subset.loca.offsets;
  const glyfLength = subset.directory.tables.glyf.length;
  if (offsets.some((offset, i) => i > 0 && offset < offsets[i - 1])) problems.push("loca not monotonic");
  if (offsets.at(-1) !== glyfLength) problems.push(`loca ends at ${offsets.at(-1)}, glyf is ${glyfLength} bytes`);
  // Padded records: every offset a multiple of 4 (so also of 2, as a short loca needs).
  if (offsets.some((offset) => offset % 4 !== 0)) problems.push("a glyph record is not padded");
  const pairs = [...toUnicode.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4,8})>/g)].map((m) => [
    parseInt(m[1], 16),
    String.fromCodePoint(...m[2].match(/.{4}/g).map((h) => parseInt(h, 16))).codePointAt(0),
  ]);
  if (pairs.length === 0) problems.push("no ToUnicode pairs");
  for (const [gid, codePoint] of pairs) {
    if (gid === 0) continue; // .notdef
    const source = sourceFonts.find((font) => font.hasGlyphForCodePoint(codePoint));
    try {
      const got = subset.getGlyph(gid).path.toSVG();
      const want = source.glyphForCodePoint(codePoint).path.toSVG();
      if (got !== want) problems.push(`glyph ${gid} (U+${codePoint.toString(16)}) differs`);
    } catch (error) {
      problems.push(`glyph ${gid} (U+${codePoint.toString(16)}) does not decode: ${error.message}`);
    }
  }
  return problems;
}

test("the three forms match their pinned sha256", async () => {
  for (const form of Object.keys(FORM_FILES)) assert.equal(sha256(await formBytes(form)), FORM_SHA256[form], form);
});

test("every name the map can produce exists in its form, with the right type", async () => {
  for (const form of Object.keys(FORM_FILES)) {
    const pdf = await PDFDocument.load(await formBytes(form));
    const fields = pdf.getForm();
    for (const name of draftFieldNames(form)) assert.ok(fields.getField(name), `${form}: ${name}`);
    const rows = draftFieldNames(form).filter((name) => /namesOf\[0\]\.Row[1-4]\[0\]/.test(name));
    assert.equal(rows.length, 40, `${form}: four rows of ten columns`);
    // The two kinds land on the right kind of box.
    const produced = draftFields({ ...BASE, gcf_consent: "yes", gcf_tp_signature: "Mei Lin", gcf_tp_date: "2026-02-01" }, { ...OPTIONS, form });
    for (const name of Object.keys(produced.text)) assert.ok(fields.getField(name) instanceof PDFTextField, `${form}: ${name}`);
    for (const name of produced.checks) assert.ok(fields.getField(name) instanceof PDFCheckBox, `${form}: ${name}`);
  }
});

test("the Chinese forms' own marital boxes sit where the English ones do", async () => {
  const rect = (pdf, name) => pdf.getForm().getField(F(name)).acroField.getWidgets()[0].getRectangle();
  const en = await PDFDocument.load(await formBytes("en"));
  const pairs = [
    ["lastDay[0].lastDayYes[0]", "marriedForAll[0].forAllYes[0]"],
    ["lastDay[0].lastDayNo[0]", "marriedForAll[0].forAllNo[0]"],
    ["liveApart[0].liveApartYes[0]", "liveWithSpouse[0].liveWithYes[0]"],
    ["liveApart[0].liveApartNo[0]", "liveWithSpouse[0].liveWithNo[0]"],
  ];
  for (const form of ["zh-s", "zh-t"]) {
    const zh = await PDFDocument.load(await formBytes(form));
    for (const [english, chinese] of pairs) {
      const a = rect(en, `page1[0].maritalStatus[0].${english}`);
      const b = rect(zh, `page1[0].maritalStatus[0].${chinese}`);
      assert.ok(Math.abs(a.y - b.y) <= 2, `${form} ${chinese} y`);
      assert.ok(Math.abs(a.x - b.x) <= 2, `${form} ${chinese} x`);
    }
  }
});

test("needsEmbeddedFont: WinAnsi is exactly what Helvetica can encode", async () => {
  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  assert.deepEqual([...WIN_ANSI_CODE_POINTS].sort((a, b) => a - b), helvetica.getCharacterSet().sort((a, b) => a - b));
  assert.equal(needsEmbeddedFont("José"), false);
  assert.equal(needsEmbeddedFont("José Peña"), false);
  assert.equal(needsEmbeddedFont("Mei Lin – “quoted” €5"), false);
  assert.equal(needsEmbeddedFont("line one\nline two"), false);
  assert.equal(needsEmbeddedFont("Nguyễn"), true);
  assert.equal(needsEmbeddedFont("Łukasz"), true);
  assert.equal(needsEmbeddedFont("美"), true);
  assert.equal(fieldsNeedFont({ text: { a: "Mei" }, comments: "fine" }), false);
  assert.equal(fieldsNeedFont({ text: { a: "Mei" }, comments: "林" }), true);
  assert.equal(fieldsNeedFont({ text: { a: "美" }, comments: "" }), true);
});

test("the fonts: which entry each form uses, pinned, with byte-identical fixtures", async () => {
  assert.equal(CJK_DRAW, "runs");
  assert.equal(draftFontsFor("en"), DRAFT_FONTS["zh-s"]);
  assert.equal(draftFontsFor("zh-s"), DRAFT_FONTS["zh-s"]);
  assert.equal(draftFontsFor("zh-t"), DRAFT_FONTS["zh-t"]);
  for (const entry of Object.values(DRAFT_FONTS)) {
    assert.equal(entry.files.length, 2);
    for (const file of entry.files) {
      assert.match(file.url, /^https:\/\/cdn\.jsdelivr\.net\/npm\/@expo-google-fonts\/[a-z-]+@\d+\.\d+\.\d+\//);
      const fixture = DRAFT_FONT_FIXTURES[file.url];
      assert.ok(fixture, file.url);
      assert.equal(fixture.sha256, file.sha256);
      assert.equal(sha256(await fixtureBytes(file.url)), file.sha256, file.url);
    }
  }
});

test("printable keeps what the fonts have, strips accents, then uses ?", async () => {
  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  assert.equal(printable("José Peña", helvetica), "José Peña");
  assert.equal(printable("Nguyễn Thị Lan", helvetica), "Nguyen Thi Lan");
  assert.equal(printable("Łukasz 美", helvetica), "?ukasz ?");
  doc.registerFontkit(fontkit);
  const files = await fontFilesFor("zh-s");
  patchSubsetPadding(fontkit, files[0]);
  const fonts = await Promise.all(files.map((bytes) => doc.embedFont(bytes, { subset: true })));
  assert.equal(printable("美 林 Łukasz Żółć Nguyễn", fonts), "美 林 Łukasz Żółć Nguyễn");
  assert.equal(printable("𓀀 Mei", fonts), "? Mei");
});

test("a build with flatten: false round-trips", async () => {
  const { doc } = await build(BASE, { flatten: false });
  const form = doc.getForm();
  assert.equal(form.getTextField(F("page1[0].yourFirstName[0]")).getText(), "Mei");
  assert.equal(form.getTextField(F("page1[0].yourTelephoneNumber[0]")).getText(), "(215) 555-0199");
  assert.equal(form.getCheckBox(F("page1[0].maritalStatus[0].statusMarried[0]")).isChecked(), true);
  assert.equal(form.getCheckBox(F("page1[0].maritalStatus[0].statusDivorced[0].statusDivorced[0]")).isChecked(), false);
  // Comments are written on page 5's ruled lines, not into the field.
  assert.deepEqual(drawnLines(doc.getPage(4)), ["My 1099-INT has not arrived yet."]);
  assert.equal(doc.getTitle(), "13614-C-draft-VT-ABCD-EFGH.pdf");
  assert.equal(doc.getPageCount(), 6);
});

test("the default build is flattened, stamped on every page and keeps six pages", async () => {
  const { doc } = await build(BASE);
  assert.equal(doc.getForm().getFields().length, 0, "no fields left");
  assert.equal(doc.getPageCount(), 6);
  for (const [i, page] of doc.getPages().entries()) {
    const content = pageContent(page);
    assert.ok(content.toUpperCase().includes("<4452414654"), `page ${i + 1} has the DRAFT stamp`);
    // "–" is 0x96 in WinAnsi; the rest of the line is plain ASCII.
    assert.ok(hasHexText(content, "DRAFT \x96 prepared from online answers, 10/04/2026, VT-ABCD-EFGH"), `page ${i + 1}`);
  }
});

test("page 6 stays blank without consent and is filled with it", async () => {
  const signed = { ...BASE, gcf_tp_signature: "Mei Lin", gcf_tp_date: "2026-02-01" };
  const without = await build({ ...signed, gcf_consent: "no" }, { flatten: false });
  assert.equal(without.doc.getPageCount(), 6);
  assert.equal(without.doc.getForm().getTextField(F("page6[0].primaryTaxpayer[0]")).getText(), undefined);
  assert.equal(without.doc.getForm().getTextField(F("page6[0].primaryDateSigned[0]")).getText(), undefined);
  // Even a fields object that carries page-6 text is ignored without consentPage.
  const fields = draftFields({ ...signed, gcf_consent: "yes" }, { ...OPTIONS, form: "en" });
  const forced = await buildDraftPdf({
    PDFLib, fontkit, formBytes: await formBytes("en"), fontFiles: [], stamp: fields.stamp,
    fields: { ...fields, consentPage: false }, flatten: false,
  });
  const forcedDoc = await PDFDocument.load(forced);
  assert.equal(forcedDoc.getForm().getTextField(F("page6[0].primaryTaxpayer[0]")).getText(), undefined);
  const withConsent = await build({ ...signed, gcf_consent: "yes" }, { flatten: false });
  assert.equal(withConsent.doc.getForm().getTextField(F("page6[0].primaryTaxpayer[0]")).getText(), "Mei Lin");
  assert.equal(withConsent.doc.getForm().getTextField(F("page6[0].primaryDateSigned[0]")).getText(), "02/01/2026");
});

test("a 6,000-character comment continues on a seventh page", async () => {
  const words = [];
  while (words.join(" ").length < 6000) words.push(`word${words.length}`);
  const long = words.join(" ").slice(0, 6000).replace(/\s+\S*$/, "");
  const answers = { ...BASE, additional_notes: long };
  for (const flatten of [false, true]) {
    const { doc } = await build(answers, { flatten });
    assert.equal(doc.getPageCount(), 7);
    const box = drawnLines(doc.getPage(4));
    assert.equal(box.length, 30, "one line on each of the 30 ruled lines");
    assert.equal(box.at(-1), "(continued on page 7)");
    const seventh = drawnLines(doc.getPage(6));
    assert.equal(seventh[0], "Additional comments (continued)");
    assert.ok(hasHexText(pageContent(doc.getPage(6)), "Additional comments (continued)"));
    // Nothing is cut off: the words run on, whole and in order, from page 5 to page 7.
    const printed = [...box.slice(0, -1), ...seventh.slice(1)].join(" ").split(/\s+/);
    assert.deepEqual(printed, long.split(" "));
    for (const [i, page] of doc.getPages().entries())
      assert.ok(pageContent(page).toUpperCase().includes("<4452414654"), `page ${i + 1} has the DRAFT stamp`);
  }
});

test("line breaks in comments are kept, and a comment that fits adds no page", async () => {
  const lines = Array.from({ length: 12 }, (_, i) => `Receipt ${i + 1} is in the blue folder.`);
  const { doc } = await build({ ...BASE, additional_notes: lines.join("\n"), inc_tips: "not_sure" });
  assert.equal(doc.getPageCount(), 6);
  assert.deepEqual(drawnLines(doc.getPage(4)), [...lines, "Not sure: Tips"]);
});

test("plain ASCII and WinAnsi names read no font", async () => {
  for (const names of [{}, { tp_first_name: "José", tp_last_name: "Peña", sp_first_name: "Zoë" }]) {
    const { proxy, seen } = watchedFiles();
    const fields = draftFields({ ...BASE, ...names }, { ...OPTIONS, form: "en" });
    const bytes = await buildDraftPdf({ PDFLib, fontkit, formBytes: await formBytes("en"), fontFiles: proxy, fields, stamp: fields.stamp });
    assert.equal(seen.read, false, JSON.stringify(names));
    assert.equal(embeddedFonts(await PDFDocument.load(bytes)).length, 0);
  }
});

test("Chinese and accented Latin names build with the fixture fonts", async () => {
  const cases = [
    ["zh-s", { tp_first_name: "美", tp_last_name: "林", additional_notes: "我的 1099 表还没收到。" }],
    ["zh-t", { tp_first_name: "美", tp_last_name: "林", addr_city: "費城" }],
    ["en", { tp_first_name: "Nguyễn Thị", tp_last_name: "Lan", sp_first_name: "Łukasz", sp_last_name: "Żółć" }],
    ["zh-s", { tp_first_name: "Łukasz 美", tp_last_name: "林 Nguyễn" }],
  ];
  for (const [form, names] of cases) {
    const files = await fontFilesFor(form);
    const { proxy, seen } = watchedFiles(files);
    const answers = { ...BASE, ...names };
    const fields = draftFields(answers, { ...OPTIONS, form });
    assert.equal(fieldsNeedFont(fields), true, form);
    const bytes = await buildDraftPdf({ PDFLib, fontkit, formBytes: await formBytes(form), fontFiles: proxy, fields, stamp: fields.stamp });
    assert.equal(seen.read, true, `${form}: the font path`);
    const doc = await PDFDocument.load(bytes);
    assert.equal(doc.getPageCount(), 6);
    const fonts = embeddedFonts(doc);
    assert.ok(fonts.length >= 1, `${form}: an embedded font`);
    const sources = files.map((bytes) => fontkit.create(bytes));
    for (const font of fonts) assert.deepEqual(subsetProblems(font, sources), [], form);
    // Nothing went missing, so no notice.
    const open = await buildDraftPdf({ PDFLib, fontkit, formBytes: await formBytes(form), fontFiles: files, fields, stamp: fields.stamp, flatten: false });
    assert.ok(!drawnLines((await PDFDocument.load(open)).getPage(4)).includes(NOTICE), form);
  }
  // Ł is in Noto Sans (Latin) only, so the Latin name embeds both files.
  const files = await fontFilesFor("en");
  const fields = draftFields({ ...BASE, sp_first_name: "Łukasz", tp_first_name: "美" }, { ...OPTIONS, form: "en" });
  const bytes = await buildDraftPdf({ PDFLib, fontkit, formBytes: await formBytes("en"), fontFiles: files, fields, stamp: fields.stamp });
  assert.equal(embeddedFonts(await PDFDocument.load(bytes)).length, 2);
});

test("Chinese comments with no spaces wrap by characters and continue on page 7", async () => {
  const files = await fontFilesFor("zh-s");
  const notes = "我的表还没收到".repeat(500); // 3,500 characters, no spaces
  const { doc } = await build({ ...BASE, additional_notes: notes }, { form: "zh-s", fontFiles: files });
  assert.equal(doc.getPageCount(), 7);
  assert.equal(drawnLines(doc.getPage(4)).at(-1), "(continued on page 7)");
  assert.equal(drawnLines(doc.getPage(6))[0], "Additional comments (continued)");
  // 29 ruled lines of runs on page 5 before the marker, the rest on page 7.
  const glyphRuns = (page) => [...pageContent(page).matchAll(/<(00[0-9A-Fa-f]*)>\s*Tj/g)].length;
  assert.equal(glyphRuns(doc.getPage(4)), 29);
  assert.ok(glyphRuns(doc.getPage(6)) > 0);
});

test("a character neither font has prints as ? and Additional Comments says so", async () => {
  const files = await fontFilesFor("en");
  const answers = { ...BASE, tp_first_name: "𓀀 Mei" };
  const fields = draftFields(answers, { ...OPTIONS, form: "en" });
  const open = await buildDraftPdf({ PDFLib, fontkit, formBytes: await formBytes("en"), fontFiles: files, fields, stamp: fields.stamp, flatten: false });
  assert.deepEqual(drawnLines((await PDFDocument.load(open)).getPage(4)), ["My 1099-INT has not arrived yet.", NOTICE]);
  const flat = await buildDraftPdf({ PDFLib, fontkit, formBytes: await formBytes("en"), fontFiles: files, fields, stamp: fields.stamp });
  assert.equal((await PDFDocument.load(flat)).getPageCount(), 6);
  // In the comments too, without the notice ending up twice.
  const inNotes = draftFields({ ...BASE, additional_notes: "Ask about 𓀀 and 𓀀" }, { ...OPTIONS, form: "en" });
  const notesPdf = await buildDraftPdf({ PDFLib, fontkit, formBytes: await formBytes("en"), fontFiles: files, fields: inNotes, stamp: inNotes.stamp });
  // The notes' line is drawn with the downloaded fonts ("?" for 𓀀, glyph
  // ids on the page); the notice is a WinAnsi line, drawn in Helvetica, once.
  const page5 = (await PDFDocument.load(notesPdf)).getPage(4);
  assert.deepEqual(drawnLines(page5), [NOTICE]);
  const runs = [...pageContent(page5).matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)].filter((m) => m[1].startsWith("00"));
  assert.ok(runs.length > 0, "a run in an embedded font (two-byte glyph ids)");
});

test("the subset padding patch: without it the subset is corrupt, with it every glyph decodes", async () => {
  const [sc] = await fontFilesFor("zh-s");
  const text = "美 林 l o d 1 0 示例";
  const embed = async (kit) => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(kit);
    const font = await doc.embedFont(sc, { subset: true });
    doc.addPage().drawText(text, { font, size: 12, x: 20, y: 20 });
    return embeddedFonts(await PDFDocument.load(await doc.save()));
  };
  const source = [fontkit.create(sc)];
  // A fresh, unpatched copy of fontkit 1.1.1: the check must catch the bug.
  const require = createRequire(import.meta.url);
  const path = require.resolve("@pdf-lib/fontkit");
  const cached = require.cache[path];
  delete require.cache[path];
  const unpatched = require(path);
  require.cache[path] = cached;
  assert.notEqual(unpatched, fontkit);
  const [broken] = await embed(unpatched);
  assert.notDeepEqual(subsetProblems(broken, source), [], "the unpatched subset is caught");
  // Patched (twice is harmless): consistent.
  patchSubsetPadding(unpatched, sc);
  patchSubsetPadding(unpatched, sc);
  const [fixed] = await embed(unpatched);
  assert.deepEqual(subsetProblems(fixed, source), []);
});

test("the committed vendor bundle builds a Chinese draft whose subsets decode", async () => {
  assert.equal(typeof bundled.PDFDocument.load, "function");
  assert.equal(typeof bundled.fontkit.create, "function");
  const files = await fontFilesFor("zh-t");
  const fields = draftFields({ ...BASE, tp_first_name: "美", tp_last_name: "林", sp_first_name: "Żółć" }, { ...OPTIONS, form: "zh-t" });
  const bytes = await buildDraftPdf({
    PDFLib: bundled, fontkit: bundled.fontkit, formBytes: await formBytes("zh-t"), fontFiles: files, fields, stamp: fields.stamp,
  });
  const fonts = embeddedFonts(await PDFDocument.load(bytes));
  assert.equal(fonts.length, 2);
  const sources = files.map((b) => fontkit.create(b));
  for (const font of fonts) assert.deepEqual(subsetProblems(font, sources), []);
});
