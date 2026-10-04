// The draft Form 13614-C, part two: the PDF, built in the browser from the
// boxes `draft-form.mjs` chose (spec 2026-10-04 §7). pdf-lib and fontkit are
// passed in, never imported, so this module loads with the page while the
// libraries (src/vendor/pdf-lib.mjs) and the fonts load only when the draft is
// asked for. The PDF never leaves the browser.
import { COMMENTS_FIELD } from "./draft-form.mjs";

// ---------------------------------------------------------------------------
// Fonts (Task 1's decision: docs/superpowers/notes/2026-10-04-draft-font-spike.md)
// ---------------------------------------------------------------------------

// One entry per Chinese form. `files` are fetched in full, in this order, whatever the text says.
// For each character the first file whose cmap has the glyph is used (Latin falls to file 2 only
// where the CJK font lacks it: Ł ł Ż ż ć ą ę š č ... ).
export const DRAFT_FONTS = {
  "zh-s": { files: [
    { url: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-sc@0.4.3/400Regular/NotoSansSC_400Regular.ttf",
      sha256: "d45f67f0a7c0ca3f256950777ce6a61cc7ce5f9696d02900cbbaac25f8aa7d16" },   // 10,559,284 bytes
    { url: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans@0.4.2/400Regular/NotoSans_400Regular.ttf",
      sha256: "fe8c022f48d8dd29f17b744d16f9346f4357e16f7d4f7be58b000ae7c291b614" },   //    629,024 bytes
  ] },
  "zh-t": { files: [
    { url: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-tc@0.4.3/400Regular/NotoSansTC_400Regular.ttf",
      sha256: "add35d53f70727657b4509531677c4e3712b67df3d54661efdee5d3a0c16d954" },   //  7,109,460 bytes
    { url: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans@0.4.2/400Regular/NotoSans_400Regular.ttf",
      sha256: "fe8c022f48d8dd29f17b744d16f9346f4357e16f7d4f7be58b000ae7c291b614" },
  ] },
};
export const CJK_DRAW = "runs";

// The byte-identical copies npm installs (exact-version devDependencies), so
// tests read the fonts offline: unit tests from these paths, the browser
// story by serving them for the CDN URLs. jsDelivr serves the npm tarball.
export const DRAFT_FONT_FIXTURES = {
  "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-sc@0.4.3/400Regular/NotoSansSC_400Regular.ttf":
    { package: "@expo-google-fonts/noto-sans-sc", version: "0.4.3",
      path: "node_modules/@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf",
      sha256: "d45f67f0a7c0ca3f256950777ce6a61cc7ce5f9696d02900cbbaac25f8aa7d16" },
  "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans-tc@0.4.3/400Regular/NotoSansTC_400Regular.ttf":
    { package: "@expo-google-fonts/noto-sans-tc", version: "0.4.3",
      path: "node_modules/@expo-google-fonts/noto-sans-tc/400Regular/NotoSansTC_400Regular.ttf",
      sha256: "add35d53f70727657b4509531677c4e3712b67df3d54661efdee5d3a0c16d954" },
  "https://cdn.jsdelivr.net/npm/@expo-google-fonts/noto-sans@0.4.2/400Regular/NotoSans_400Regular.ttf":
    { package: "@expo-google-fonts/noto-sans", version: "0.4.2",
      path: "node_modules/@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf",
      sha256: "fe8c022f48d8dd29f17b744d16f9346f4357e16f7d4f7be58b000ae7c291b614" },
};

/** The font entry a form uses: the English and Simplified forms the Simplified font, Traditional its own. */
export const draftFontsFor = (form) => (form === "zh-t" ? DRAFT_FONTS["zh-t"] : DRAFT_FONTS["zh-s"]);

/**
 * fontkit 1.1.1's TrueType subsetter copies each glyph record unpadded and
 * then writes a short `loca`, so a record of odd length shifts every later
 * glyph and about half of them come out corrupt (drawn as nothing). Pad every
 * subset record to a multiple of 4. Depends on fontkit 1.1.1 internals, which
 * is why the version is pinned; tests/draft-pdf.test.mjs fails if it stops
 * working. It patches the shared `TTFSubset` prototype of this fontkit copy,
 * so every TrueType font embedded afterwards is padded; calling it again is
 * harmless. Call it once, before the first `embedFont(…, { subset: true })`.
 */
export function patchSubsetPadding(fontkit, anyTtfBytes) {
  const P = Object.getPrototypeOf(fontkit.create(anyTtfBytes).createSubset());
  if (P.__padded) return;
  const orig = P._addGlyph;
  P._addGlyph = function (gid) {
    const r = orig.call(this, gid);
    const i = this.glyf.length - 1, b = this.glyf[i], pad = (4 - (b.length % 4)) % 4;
    // `b.constructor` is the Buffer class bundled inside fontkit: a plain
    // Uint8Array makes its encoder throw.
    if (pad) { this.glyf[i] = b.constructor.concat([b, b.constructor.alloc(pad)]); this.offset += pad; }
    return r;
  };
  P.__padded = true;
}

// ---------------------------------------------------------------------------
// What Helvetica can print
// ---------------------------------------------------------------------------

// WinAnsi: what pdf-lib's standard Helvetica can encode (the test compares
// this with Helvetica's own character set).
export const WIN_ANSI_CODE_POINTS = new Set([
  ...Array.from({ length: 0x7f - 0x20 }, (_, i) => 0x20 + i),
  ...Array.from({ length: 0x100 - 0xa0 }, (_, i) => 0xa0 + i),
  0x152, 0x153, 0x160, 0x161, 0x178, 0x17d, 0x17e, 0x192, 0x2c6, 0x2dc,
  0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2020, 0x2021,
  0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122,
]);
// Line breaks and tabs are layout, never printed characters.
const LAYOUT = new Set([0x09, 0x0a, 0x0d]);

/** True when any character of `text` is one Helvetica can't encode (Chinese, "ễ", "Ł", …). */
export function needsEmbeddedFont(text) {
  for (const ch of String(text ?? "").normalize("NFC")) {
    const cp = ch.codePointAt(0);
    if (!WIN_ANSI_CODE_POINTS.has(cp) && !LAYOUT.has(cp)) return true;
  }
  return false;
}

const page6 = (name) => name.includes(".page6[0].");
/** The values that will be printed (page 6 only with consent). */
const printedValues = (fields) => [
  ...Object.entries(fields?.text ?? {})
    .filter(([name]) => fields?.consentPage || !page6(name))
    .map(([, value]) => value),
  fields?.comments ?? "",
];

/** Whether these draft fields need the downloaded font at all. */
export const fieldsNeedFont = (fields) => printedValues(fields).some(needsEmbeddedFont);

const charSets = new WeakMap();
const charSetOf = (font) => {
  if (!charSets.has(font)) charSets.set(font, new Set(font.getCharacterSet()));
  return charSets.get(font);
};

/**
 * The text as these fonts can print it: a character no font has is tried
 * without its accents ("ễ" → "e"), and otherwise printed as "?". Never throws.
 * `font` is one embedded font or a list of them (any of them may print a
 * character). Line breaks pass through.
 */
export function printable(text, font) {
  const fonts = (Array.isArray(font) ? font : [font]).filter(Boolean);
  const sets = fonts.map(charSetOf);
  const has = (cp) => sets.some((set) => set.has(cp));
  let out = "";
  for (const ch of String(text ?? "").normalize("NFC")) {
    const cp = ch.codePointAt(0);
    if (cp === 0x0a || has(cp)) {
      out += ch;
      continue;
    }
    const bare = ch.normalize("NFD").replace(/\p{M}/gu, "");
    if (bare && [...bare].every((c) => has(c.codePointAt(0)))) out += bare;
    else if (!/^\p{M}$/u.test(ch)) out += "?";
  }
  return out;
}

// The ruled lines of page 5 (Additional Notes/Comments), the same on the
// three pinned forms: rules every 18 pt from y = 558 down to y = 36. Each line
// of comments sits 2 pt above its rule.
const RULED = { firstBaseline: 560, pitch: 18 };
const NOTICE = "Some characters could not be printed. The online answers have them in full.";
const CONTINUED_TITLE = "Additional comments (continued)";
const STAMP_SIZE = 9;
const DARK_RED = [0.55, 0, 0];

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

const oneLine = (value) => String(value ?? "").replace(/[\s\p{Cc}]+/gu, " ").trim();
const cleanComments = (value) =>
  String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[^\P{Cc}\n]/gu, "")
    .trim();

/** The font size in the field's /DA (widget first, then field), or 10. */
function fontSizeOf(field) {
  const widget = field.acroField.getWidgets()[0];
  const da = widget?.getDefaultAppearance?.() ?? field.acroField.getDefaultAppearance() ?? "";
  const match = /(\d*\.?\d+)\s+Tf/.exec(da);
  const size = match ? Number(match[1]) : 0;
  return size > 0 ? size : 10;
}

/** Sets the size in the field's and its widget's /DA, for a value too wide for its box. */
function setFontSize(field, size) {
  const swap = (da) => (da && /\d*\.?\d+\s+Tf/.test(da) ? da.replace(/\d*\.?\d+(\s+Tf)/, `${size}$1`) : da);
  const widget = field.acroField.getWidgets()[0];
  const own = widget?.getDefaultAppearance?.();
  if (own) widget.setDefaultAppearance(swap(own));
  const shared = field.acroField.getDefaultAppearance();
  if (shared) field.acroField.setDefaultAppearance(swap(shared));
}

const borderOf = (widget) => widget.getBorderStyle()?.getWidth() ?? 0;

/** Characters measured one at a time, as they are drawn (no kerning), with a cache. */
function measurer(fontFor, size) {
  const cache = new Map();
  const charWidth = (ch) => {
    if (!cache.has(ch)) cache.set(ch, fontFor(ch).widthOfTextAtSize(ch, size));
    return cache.get(ch);
  };
  return (text) => {
    let width = 0;
    for (const ch of text) width += charWidth(ch);
    return width;
  };
}

// A CJK character (or full-width form) may start a new line anywhere; other
// text breaks at spaces, or by characters when one word is wider than a line.
const CJK = "\\u2E80-\\u2FFF\\u3000-\\u9FFF\\uAC00-\\uD7AF\\uF900-\\uFAFF\\uFE30-\\uFE4F\\uFF00-\\uFFEF\\u{20000}-\\u{3FFFF}";
const TOKENS = new RegExp(`\\s+|[${CJK}]|[^\\s${CJK}]+`, "gu");

/** Greedy wrapping of one paragraph into lines no wider than `max`. */
function wrap(paragraph, widthOf, max) {
  if (paragraph === "") return [""];
  const lines = [];
  let line = "";
  const push = () => {
    lines.push(line.replace(/\s+$/u, ""));
    line = "";
  };
  const place = (token) => {
    // A token wider than a whole line is cut by characters.
    for (const ch of token) {
      if (line !== "" && widthOf(line + ch) > max) push();
      line += ch;
    }
  };
  for (const token of paragraph.match(TOKENS) ?? []) {
    if (/^\s+$/u.test(token)) {
      if (line !== "") line += token;
      continue;
    }
    if (widthOf(line + token) <= max) line += token;
    else if (line.replace(/\s+$/u, "") === "") {
      line = "";
      place(token);
    } else {
      push();
      if (widthOf(token) <= max) line = token;
      else place(token);
    }
  }
  if (line !== "" || lines.length === 0) push();
  return lines;
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

/**
 * Builds the draft. `fields` is `draftFields(…)`'s result; `fontFiles` the
 * bytes of `draftFontsFor(form).files`, in order (read only when some value
 * needs them); `stamp` the "DRAFT – …" line; `fileName` the document title.
 * Returns the PDF's bytes.
 */
export async function buildDraftPdf({
  PDFLib, fontkit, formBytes, fontFiles = [], fields, stamp = "", fileName = "13614-C-draft.pdf", flatten = true,
}) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.load(formBytes);
  doc.registerFontkit(fontkit);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const color = rgb(0, 0, 0);

  // The downloaded fonts, only when some printed value needs them.
  const fonts = [];
  if (fieldsNeedFont(fields)) {
    if (!fontFiles || fontFiles.length === 0) throw new Error("The draft needs its font files.");
    patchSubsetPadding(fontkit, fontFiles[0]);
    for (const bytes of fontFiles) fonts.push(await doc.embedFont(bytes, { subset: true }));
  }
  // The first font that has the character draws it (printable() made sure one does).
  const fontFor = (ch) => fonts.find((font) => charSetOf(font).has(ch.codePointAt(0))) ?? fonts[0];

  /** Draws text in runs of one font each, starting at (x, y). */
  const drawRuns = (page, text, x, y, size) => {
    let run = "";
    let runFont = null;
    const flush = () => {
      if (run === "") return;
      page.drawText(run, { x, y, size, font: runFont, color });
      x += runFont.widthOfTextAtSize(run, size);
      run = "";
    };
    for (const ch of text) {
      const font = fontFor(ch);
      if (font !== runFont) {
        flush();
        runFont = font;
      }
      run += ch;
    }
    flush();
  };
  /** One line in Helvetica if it can, otherwise in runs of the downloaded fonts. */
  const drawLine = (page, line, x, y, size) => {
    if (line.text === "") return;
    if (line.runs) drawRuns(page, line.text, x, y, size);
    else page.drawText(line.text, { x, y, size, font: helvetica, color });
  };

  const form = doc.getForm();
  const pages = doc.getPages();
  const pageOf = (name) => pages[Number(/\.page(\d+)\[0\]\./.exec(name)?.[1] ?? 1) - 1];
  const later = []; // drawn after flattening, so no field appearance covers it
  let lost = false;

  // Single-line boxes.
  for (const [name, raw] of Object.entries(fields?.text ?? {})) {
    if (name === COMMENTS_FIELD) continue;
    if (!fields.consentPage && page6(name)) continue; // Form 15080 stays blank without consent
    const value = oneLine(raw);
    if (value === "") continue;
    const field = form.getTextField(name);
    const widget = field.acroField.getWidgets()[0];
    const rect = widget.getRectangle();
    const size = fontSizeOf(field);
    const room = rect.width - 2 * (borderOf(widget) + 1) - 2;
    if (!needsEmbeddedFont(value)) {
      field.setText(value);
      const width = measurer(() => helvetica, size)(value);
      if (width > room) setFontSize(field, Math.max(4, Math.floor((size * room * 10) / width) / 10));
      continue;
    }
    // CJK_DRAW = "runs": one field appearance can use only one font, and no
    // one file covers every character, so the text is drawn on the page.
    const shown = printable(value, fonts);
    if (shown !== value.normalize("NFC")) lost = true;
    const width = measurer(fontFor, size)(shown);
    const fitted = width > room ? Math.max(4, (size * room) / width) : size;
    const x = rect.x + borderOf(widget) + 2;
    const y = rect.y + Math.max(1.5, (rect.height - fitted * 0.7) / 2);
    later.push(() => drawRuns(pageOf(name), shown, x, y, fitted));
  }

  for (const name of fields?.checks ?? []) form.getCheckBox(name).check();

  // Additional Comments: wrapped to the box's width at its font size and
  // written on its ruled lines; what doesn't fit continues on plain pages
  // after the form. Nothing is cut off. The text is drawn on the page rather
  // than set as the field's value, because a field's appearance can neither
  // mix fonts nor follow the ruling.
  let comments = cleanComments(fields?.comments);
  if (needsEmbeddedFont(comments) && printable(comments, fonts) !== comments.normalize("NFC")) lost = true;
  if (lost) comments = [comments, NOTICE].filter(Boolean).join("\n\n");
  if (comments !== "") {
    const field = form.getTextField(COMMENTS_FIELD);
    const widget = field.acroField.getWidgets()[0];
    const rect = widget.getRectangle();
    const size = fontSizeOf(field);
    const x = rect.x + borderOf(widget) + 2;
    const maxWidth = rect.width - 2 * (borderOf(widget) + 2);
    const helveticaWidth = measurer(() => helvetica, size);
    const runsWidth = fonts.length ? measurer(fontFor, size) : null;
    const lines = comments.split("\n").flatMap((paragraph) => {
      const runs = needsEmbeddedFont(paragraph);
      const text = runs ? printable(paragraph, fonts) : paragraph;
      return wrap(text, runs ? runsWidth : helveticaWidth, maxWidth).map((line) => ({ text: line, runs }));
    });
    const capacity = Math.floor((RULED.firstBaseline - rect.y) / RULED.pitch) + 1;
    let inBox = lines;
    let overflow = [];
    if (lines.length > capacity) {
      const next = doc.getPageCount() + 1;
      inBox = [...lines.slice(0, capacity - 1), { text: `(continued on page ${next})`, runs: false }];
      overflow = lines.slice(capacity - 1);
    }
    const page5 = pageOf(COMMENTS_FIELD);
    later.push(() =>
      inBox.forEach((line, k) => drawLine(page5, line, x, RULED.firstBaseline - k * RULED.pitch, size)));
    // The continued pages: plain text, the same size as page 5 and the same width as the box.
    const [width, height] = [page5.getWidth(), page5.getHeight()];
    const pitch = size * 1.5;
    while (overflow.length) {
      const page = doc.addPage([width, height]);
      page.drawText(CONTINUED_TITLE, { x, y: height - 40, size: 14, font: helvetica, color });
      for (let y = height - 40 - 14 - pitch; overflow.length && y >= 30; y -= pitch)
        drawLine(page, overflow.shift(), x, y, size);
    }
  }

  form.updateFieldAppearances(helvetica);
  if (flatten) form.flatten({ updateFieldAppearances: false });
  for (const draw of later) draw();

  // The stamp, at the top margin of every page, continued pages included.
  const shownStamp = printable(oneLine(stamp), helvetica);
  if (shownStamp !== "") {
    const stampWidth = helvetica.widthOfTextAtSize(shownStamp, STAMP_SIZE);
    for (const page of doc.getPages())
      page.drawText(shownStamp, {
        x: (page.getWidth() - stampWidth) / 2,
        y: page.getHeight() - 11,
        size: STAMP_SIZE,
        font: helvetica,
        color: rgb(...DARK_RED),
      });
  }

  doc.setTitle(fileName, { showInWindowTitleBar: true });
  return doc.save();
}
