# Draft 13614-C font spike (intake redesign 4b2, Task 1)

Question: which Chinese font source can the browser fetch at runtime and hand to pdf-lib so the draft
Form 13614-C (the `f13614cn-2025.pdf` / `f13614ct-2025.pdf` templates) draws real glyphs?

Tools: pdf-lib 1.17.1, @pdf-lib/fontkit 1.1.1. Renders were made with `sips -s format png` (macOS
CoreGraphics) and looked at as PNGs. The same code was also run in Google Chrome and Firefox through
Playwright 1.63.0 (an esbuild bundle) to confirm that it builds there.

## Decision

Use **static Noto Sans SC / TC Regular (400) TrueType files plus Noto Sans (Latin) from the npm packages
`@expo-google-fonts/*`, served by jsDelivr's `/npm/` route**, with a small patch to fontkit's subsetter
(see "Required fontkit patch"). Draw Chinese text as per-character **runs**.

```js
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
```

`en` and `zh-s` forms use the `zh-s` entry (Simplified); `zh-t` uses the Traditional one.

- Totals per script (raw bytes): zh-s 11,188,308 (10.7 MiB), zh-t 7,738,484 (7.4 MiB). Both are far under 25 MB.
  jsDelivr sends them compressed (`content-length` seen in the browser: 5.8 MB, 4.0 MB, 0.28 MB).
- What is fetched never depends on the text. Embedding is `embedFont(bytes, { subset: true })`, so the
  draft PDF only carries the glyphs used (a few KB of font), not the 10 MB file.
- CORS: every URL answers `200` with `access-control-allow-origin: *` (checked with curl and with
  `fetch` inside Chrome and Firefox).
- All three packages pin an exact npm version, and jsDelivr npm versions are immutable.
- Licence: the fonts are SIL Open Font License 1.1 (Noto Sans SC / TC / Noto Sans, (c) The Noto Project
  Authors). The npm wrapper packages are tagged `MIT AND OFL-1.1`. Fonts are fetched at runtime and never
  committed to the repo.

### DRAFT_FONT_FIXTURES (offline tests)

jsDelivr serves the file out of the npm tarball, so the installed package is byte-identical. This was
verified by downloading each URL with curl and comparing sha256 against the file installed by npm.

```js
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
```

Install as exact-version devDependencies. The wrapper packages are large (96 MB / 65 MB / 13 MB unpacked, all
weights); that is a dev-time cost only.

### Required fontkit patch (root cause of the "dots" in the earlier test)

`@pdf-lib/fontkit` 1.1.1's TrueType subsetter (`TTFSubset._addGlyph`) copies each glyph record from `glyf`
unpadded, then writes a **short** `loca` (offsets / 2). A record of odd length shifts every later offset, so
about half of the glyphs come out corrupt (confirmed by parsing the embedded subset with fontTools:
`struct.error` on the 4th glyph) and the PDF viewer draws nothing for them. Noto TTFs from Google Fonts
have odd-length records (SC: 15,284 of 30,898; TC: 10,385 of 20,812; Latin: 1,323 of 4,503). The fontsource
`.woff` pieces have none (0 of 196), which is why those worked with `subset: true`.
Pad every subset glyph record to a multiple of 4 before embedding anything:

```js
import fontkit from "@pdf-lib/fontkit";
// Call once, with the bytes of any TrueType (glyf) font, before the first embedFont({ subset: true }).
export function patchSubsetPadding(anyTtfBytes) {
  const P = Object.getPrototypeOf(fontkit.create(anyTtfBytes).createSubset());
  if (P.__padded) return;
  const orig = P._addGlyph;
  P._addGlyph = function (gid) {
    const r = orig.call(this, gid);
    const i = this.glyf.length - 1, b = this.glyf[i], pad = (4 - (b.length % 4)) % 4;
    if (pad) { this.glyf[i] = b.constructor.concat([b, b.constructor.alloc(pad)]); this.offset += pad; }
    return r;
  };
  P.__padded = true;
}
```

`b.constructor` is the Buffer class bundled inside fontkit (a plain `Uint8Array` makes fontkit's encoder
throw "Invalid non-string/buffer chunk"). It depends on fontkit 1.1.1 internals, so keep fontkit pinned.

Scope: `patchSubsetPadding` replaces `_addGlyph` on the **shared `TTFSubset` prototype**, so it changes the
subsetting of **every** TrueType font embedded afterwards in that page or bundle (CJK and Latin alike), not
only the font passed in. Call it once per page/bundle, before the first `embedFont(..., { subset: true })`.
Calling it again is harmless (guarded by `__padded`). The padding is valid for any glyf font, so global scope
is intended.
Verified: after the patch, 3000 distinct CJK characters embed, every glyph of the embedded subset parses with
fontTools, and the render is correct (see "Render verification limits" below). The fallback if the patch is ever unwanted is `subset: false`, which
embeds the whole font (draft PDF grows to about 6.4 MB for SC) and also renders correctly.

## Step 2: Candidate A, fontsource pieces (`@fontsource/noto-sans-sc` / `-tc` 5.3.0)

The piece containing 林 is `noto-sans-sc-115-400-normal`; 美 is in piece 118, so one piece never holds even this short string.
Text drawn: 林美 示例街100号 广东省.

| combination | result |
|---|---|
| `.woff`, `subset: true` | real glyphs for the characters the piece holds (林, 例, 省); the others, including digits, draw as the .notdef box |
| `.woff`, `subset: false` | row of dots (raw WOFF container embedded as if it were TrueType) |
| `.woff2`, `subset: true` | one black blob |
| `.woff2`, `subset: false` | row of dots |

Only `.woff` + `subset: true` draws glyphs, and only because a piece covers a small unicode-range. Full set
for one script, 400 weight: SC 102 pieces, 4,638,716 bytes as `.woff` (3,553,000 as `.woff2`); TC 106 pieces,
4,231,068 bytes (3,244,108 as `.woff2`). It would work, but needs ~100 requests per script, one embedded font
per piece (up to ~100 fonts in a PDF), and a text-dependent choice of font per character, and it cannot
serve a field appearance (one font). Rejected in favour of B.

## Step 3: Candidate B, whole-font files

Same text, plus the Latin names. "Unpatched" means stock fontkit 1.1.1.

| file | size | outlines | `subset:false` | `subset:true` unpatched |
|---|---|---|---|---|
| `@expo-google-fonts/noto-sans-sc@0.4.3/400Regular/NotoSansSC_400Regular.ttf` (jsDelivr npm) | 10,559,284 | glyf (TrueType) | correct, PDF 6.4 MB | wrong: only 示例 drawn; with the patch: correct, PDF 5.5 KB |
| `@expo-google-fonts/noto-sans-tc@0.4.3/...NotoSansTC_400Regular.ttf` | 7,109,460 | glyf | not run | not run unpatched (10,385 odd records, same bug expected); correct with the patch in the browser build |
| `gh/google/fonts@main/ofl/notosanssc/NotoSansSC[wght].ttf` | 17,772,300 | glyf, variable | correct but light (default instance is a thin weight); PDF 11.4 MB | wrong glyphs; not pinned (branch) and larger |
| `gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf` | 16,437,364 | CFF (OTTO) | correct, PDF 13.8 MB | wrong glyphs (58 KB PDF, garbage) |

The `gh/...@main` URLs are branch-pinned (the jsDelivr package API also refuses `noto-cjk` listing: over
50 MB), larger, and give no npm-installable byte-identical fixture, so they were not pursued. The expo
packages are TrueType, static, exact-version-pinned and byte-identical to the npm install. Chosen.

Rendered check (page 1, "Your name" row, 美 and 林 plus Latin names) of the patched SC/TC output: glyphs are
clean, evenly weighted Noto Sans; TC form shows the Traditional labels (中間名縮寫) with the same names.

## Step 4: Browser check

esbuild bundle of pdf-lib + fontkit + the patch, loaded from a local page in **Google Chrome** (Playwright
`channel: "chrome"`; the Playwright-managed Chromium is not installed on this machine, so I did not
download it) and in Playwright **Firefox**. This matches the repo's own browser story: `tests/support/browser-fixture.mjs`
launches `chromium.launch({ channel: "chrome" })` for the `"chrome"` engine and Firefox for `"firefox"`
(permutations in `tests/browser.mjs`), and Playwright's bundled Chromium is not installed. The page `fetch`es the two jsDelivr URLs per script, embeds
them, writes the names on page 1 of the form, flattens, and returns the byte length. No exceptions.

- zh-s: fetch 0.5-0.6 s, build 0.7-0.8 s, PDF 2,031,233 bytes (the blank template is 1,821,136).
- zh-t: fetch 0.2-0.3 s, build 0.6-0.8 s, PDF 2,061,350 bytes (Chrome) / 2,061,348 (Firefox; template 1,851,925).
- All four responses: HTTP 200, `access-control-allow-origin: *`.
- The browser-built PDFs were rendered with CoreGraphics and read correctly: "美 Łukasz Żółć" / "林 Nguyễn Thị Lan" on
  the zh-s form, "美 Zoë Ångström" / "林 Nguyễn" on the zh-t form.

## Step 4b: Latin coverage

Checked with fontTools against the cmaps (Basic Latin, Latin-1, Latin Extended-A, Vietnamese block, a few
punctuation marks):

- Noto Sans SC and TC (identical result): **Nguyễn Thị Lan** and **Zoë Ångström** draw fully (Latin-1 and
  Vietnamese are present). **Łukasz Żółć** does not: Ł ł Ż ż ć are missing (drawn as the .notdef box). In all,
  112 code points in the range tested are absent, mainly Latin Extended-A: Ą ą Ć ć Č č Ď ď Ę ę Ğ ğ İ ı Ł ł Ń ń
  (Ņ ņ) Ő ő Ř ř Ś ś Ş ş Š š Ţ ţ Ť ť Ů ů Ű ű Ź ź Ż ż Ž ž ſ Ÿ and a few more.
- Noto Sans (Latin): lacks none of those. Hence the second file in each `files` list, used per character
  wherever the CJK font has no glyph. Characters in neither file (for example Thai or Arabic) still draw as .notdef; the draft
  code should replace those with "?".

## Step 5: Field or runs

zh-s form, `form1[0].page1[0].yourFirstName[0]` (rect x 18, y 468, 180 x 12.24; default appearance
`/NotoSansCJKsc-Regular 9 Tf`; page is landscape 792 x 612).

- Field route: `setText("美")`, `form.updateFieldAppearances(font)` with the embedded patched SC font, then
  `form.flatten()`: renders correctly (美 in the first-name box, 林 in the last-name box).
  With the mixed value "Łukasz 美" the same route draws a .notdef box for Ł, because a field appearance can
  use only one font and the CJK font lacks Ł.
- Runs route: read each widget's rectangle, `drawText` one character at a time at `x = rect.x + 2`,
  `y = rect.y + 3`, choosing the first font that has the character (`font.getCharacterSet().includes(cp)`),
  advancing by `widthOfTextAtSize`, then `form.flatten()`: "美 Łukasz" and "林 Nguyễn" render fully.
- **CJK_DRAW = "runs"**, because no single file covers every character (the CJK font lacks Ł ł Ż ż ć).

For Task 9: with "runs" the field's own value is not updated by `updateFieldAppearances`, so draw the text
from the widget rect before flattening (as above), and wrap if the text is wider than the rectangle.

Regression test required (Task 9): add a unit test that embeds glyphs with odd-length `glyf` records
(for example 美 林 and Latin letters such as `l o d 1 0` from the pinned SC font fixture) with
`embedFont(bytes, { subset: true })` after `patchSubsetPadding`, saves the PDF, extracts the embedded
FontFile2 stream, and asserts that the subset parses: via fontkit, `loca` is consistent with `glyf` (offsets
monotonic, last offset equals the `glyf` length, every offset a multiple of 4 or 2 for short loca) and every
glyph of the subset can be decoded without throwing. Without the patch this test fails (it is the exact
"dots" bug), so a fontkit upgrade or a Buffer change breaks a test instead of drawing blanks.

## Render verification limits

Renders were checked only with macOS CoreGraphics (`sips`), plus structural validation of the embedded subset
with fontTools (every glyph parses). pdf.js, Chrome's built-in PDF viewer and Acrobat were **not** checked.
Chrome and Firefox only ran the build in the page (no exception, byte length returned); neither displayed
the result.
