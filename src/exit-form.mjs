// The Exit Form: PCDC's one-page bilingual hand-out for the client, filled
// from the reviewer's questionnaire (its Exit Form groups and remarks) and
// the case (tax year, client number, taxpayer name). The template has no
// form fields, so every value is drawn at a fixed place on the page.
// exitFormMarks says what goes where; buildExitFormPdf draws it.
import { oneLine, usDate } from "./draft-form.mjs";
import { needsEmbeddedFont, patchSubsetPadding, printable } from "./draft-pdf.mjs";
import { LOCAL_TYPES } from "./questionnaires.mjs";

// The Local taxes, in the questionnaire's order: a row each under Other Tax.
const LOCAL_TAXES = Object.freeze(LOCAL_TYPES.map(([type]) => type));

export const EXIT_FORM_FILE = "src/forms/exit-form-pcdc.pdf";

const PAGE_HEIGHT = 792;
const TEXT_SIZE = 11;
const SMALL_SIZE = 8;
const MIN_SIZE = 6;

// Places on the template, in points from the page's top-left corner (as a
// PDF reader measures them); buildExitFormPdf turns them into PDF space.
// A text place is { x, y, width } with y its baseline; a box is its centre.
export const EXIT_FORM_LAYOUT = Object.freeze({
  taxYear: { x: 226, y: 141, width: 80 },
  date: { x: 134, y: 174, width: 190 },
  clientNumber: { x: 500, y: 174, width: 100 },
  taxpayer: { x: 252, y: 204, width: 310 },
  remarks: { x: 130, y: 557, width: 430 },
  // "Other Tax": the template's own boxes are covered and replaced by one
  // row per Local tax, printed whether or not it applies, so the form can
  // still be ticked by hand: ☐ NPT $____  ☐ 補繳 Owe  ☐ 退稅 Refund.
  local: {
    covers: [
      { x: 47, y: 444, width: 39, height: 20 }, // the blank before 其他稅
      { x: 190, y: 422.5, width: 395, height: 97.5 }, // boxes and Amount, all three rows
      { x: 47, y: 466, width: 145, height: 54 }, // the Refund and Owe labels
    ],
    firstBaseline: 456,
    pitch: 15,
    box: 8.5,
    typeBox: 196,
    typeLabel: { x: 209, width: 56 },
    amount: { x: 280, width: 66, ruleFrom: 278, ruleTo: 348 },
    oweBox: 368,
    oweLabel: { x: 381, width: 60 },
    refundBox: 448,
    refundLabel: { x: 461, width: 70 },
  },
  groups: {
    federal: {
      amount: { x: 503, y: 246, width: 60 },
      debitOn: { x: 390, y: 299, width: 33 },
      boxes: {
        efile: [174, 241], paper: [281, 241],
        direct_deposit: [134, 267], check: [444, 267],
        direct_debit: [132.5, 293], mail_check: [445, 293],
      },
    },
    state: {
      amount: { x: 467, y: 350, width: 95 },
      debitOn: { x: 390, y: 403, width: 33 },
      boxes: {
        efile: [147.5, 345], paper: [254.5, 345],
        direct_deposit: [134, 371], check: [444, 371],
        direct_debit: [132.5, 397], mail_check: [445, 397],
      },
    },
  },
});

const money = (amount) => {
  const [whole, cents = ""] = String(amount).split(".");
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents.padEnd(2, "0")}`;
};

const OWE_LABEL = "補繳 Owe";
const REFUND_LABEL = "退稅 Refund";
const HOW_NOTE = Object.freeze({ direct_deposit: "direct deposit", direct_debit: "direct debit" });

// What a Local entry needs said beyond its row (rare: e-file, direct
// deposit, direct debit), for the front of the remarks.
function localNote(entry) {
  const parts = [];
  if (entry.method === "efile") parts.push("e-filed");
  const how = entry.result === "refund" ? entry.refundBy : entry.result === "owe" ? entry.oweBy : null;
  if (HOW_NOTE[how]) parts.push(`${HOW_NOTE[how]}${entry.debitOn ? ` on ${usDate(entry.debitOn)}` : ""}`);
  return parts.length ? `${entry.type}: ${parts.join(", ")}` : "";
}

function groupMarks(layout, entry, out) {
  if (!entry) return;
  const box = (name) => {
    const at = layout.boxes[name];
    if (at) out.checks.push({ x: at[0], y: at[1] });
  };
  box(entry.method);
  if (entry.result === "none") return;
  if (entry.amount != null) out.text.push({ ...layout.amount, value: money(entry.amount), size: TEXT_SIZE });
  if (entry.result === "refund") box(entry.refundBy);
  if (entry.result === "owe") {
    box(entry.oweBy);
    if (entry.oweBy === "direct_debit" && entry.debitOn)
      out.text.push({ ...layout.debitOn, value: usDate(entry.debitOn), size: SMALL_SIZE });
  }
}

/**
 * What the Exit Form shows, from the reviewer's questionnaire and the case.
 * `case` is { taxYear, clientNumber, firstName, lastName }; `today` is
 * 'YYYY-MM-DD'. Returns { text: [{x, y, width, value, size}], checks:
 * [{x, y}], covers and squares: [{x, y, width, height}], rules: [{from, to,
 * y}], fileName }. "Other Tax" has a row for each Local tax; the ones that
 * apply are ticked with their amount and Owe or Refund. Nothing about a bank
 * account is ever drawn.
 */
export function exitFormMarks(questionnaire, { taxYear, clientNumber, firstName, lastName } = {}, today) {
  const L = EXIT_FORM_LAYOUT;
  const out = { text: [], checks: [], covers: [...L.local.covers], squares: [], rules: [] };
  const put = (place, value, size = TEXT_SIZE) => {
    const text = oneLine(value);
    if (text) out.text.push({ ...place, value: text, size });
  };
  put(L.taxYear, taxYear ?? "", 14);
  put(L.date, usDate(today));
  put(L.clientNumber, clientNumber ?? "");
  put(L.taxpayer, [firstName, lastName].map(oneLine).filter(Boolean).join(" "));

  const exit = questionnaire?.exitForm ?? {};
  groupMarks(L.groups.federal, exit.federal, out);
  groupMarks(L.groups.state, exit.state, out);
  const T = L.local;
  const entries = new Map((exit.local ?? []).map((entry) => [entry.type, entry]));
  const notes = [];
  LOCAL_TAXES.forEach((type, i) => {
    const y = T.firstBaseline + i * T.pitch;
    const square = (x) => {
      out.squares.push({ x, y: y - T.box + 0.5, width: T.box, height: T.box });
      return { x: x + T.box / 2, y: y - T.box / 2 + 0.5 };
    };
    const typeBox = square(T.typeBox);
    put({ ...T.typeLabel, y }, type, 10);
    out.rules.push({ from: T.amount.ruleFrom, to: T.amount.ruleTo, y: y + 2 });
    put({ x: T.amount.ruleFrom - 8, y, width: 8 }, "$", 10);
    const oweBox = square(T.oweBox);
    put({ ...T.oweLabel, y }, OWE_LABEL, 10);
    const refundBox = square(T.refundBox);
    put({ ...T.refundLabel, y }, REFUND_LABEL, 10);

    const entry = entries.get(type);
    if (!entry) return;
    out.checks.push(typeBox);
    if (entry.result === "owe") out.checks.push(oweBox);
    if (entry.result === "refund") out.checks.push(refundBox);
    if (entry.result !== "none" && entry.amount != null) put({ ...T.amount, y }, money(entry.amount).slice(1), 10);
    const note = localNote(entry);
    if (note) notes.push(note);
  });
  put(L.remarks, [...notes, oneLine(questionnaire?.remarks ?? "")].filter(Boolean).join("; "), 9);

  const ref = String(clientNumber ?? "").replace(/[^A-Za-z0-9-]/g, "");
  out.fileName = `exit-form${ref ? `-${ref}` : ""}.pdf`;
  return out;
}

/** The values exitFormMarks will draw, in the shape draftFontFiles reads. */
export const exitFormFontFields = (marks) => ({
  text: Object.fromEntries(marks.text.map((mark, i) => [String(i), mark.value])),
});

/** Whether any drawn value needs the downloaded CJK fonts. */
export const exitFormNeedsFont = (marks) => marks.text.some((mark) => needsEmbeddedFont(mark.value));

/**
 * The filled Exit Form's bytes. `fontFiles` (draftFontFiles' result) is
 * needed only when exitFormNeedsFont(marks). A value too wide for its place
 * is drawn smaller, down to 6 pt, and then cut with "…".
 */
export async function buildExitFormPdf({ PDFLib, fontkit, formBytes, fontFiles = [], marks }) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.load(formBytes);
  const page = doc.getPage(0);
  const color = rgb(0, 0, 0);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const fonts = [];
  if (exitFormNeedsFont(marks)) {
    if (!fontFiles.length) throw new Error("The Exit Form needs its font files.");
    doc.registerFontkit(fontkit);
    patchSubsetPadding(fontkit, fontFiles.at(-1));
    for (const bytes of fontFiles) fonts.push(await doc.embedFont(bytes, { subset: true }));
  }
  const fontFor = (ch) =>
    fonts.find((font) => font.getCharacterSet().includes(ch.codePointAt(0))) ?? fonts[0];

  // [text, font] runs: Helvetica for a value it can draw, else per character.
  const runsOf = (text) => {
    if (!needsEmbeddedFont(text)) return [[text, helvetica]];
    const runs = [];
    for (const ch of printable(text, fonts)) {
      const font = fontFor(ch);
      if (runs.length && runs.at(-1)[1] === font) runs.at(-1)[0] += ch;
      else runs.push([ch, font]);
    }
    return runs;
  };
  const widthOf = (runs, size) => runs.reduce((sum, [text, font]) => sum + font.widthOfTextAtSize(text, size), 0);

  // White boxes over the parts of the template this fill replaces.
  for (const c of marks.covers ?? [])
    page.drawRectangle({ x: c.x, y: PAGE_HEIGHT - c.y - c.height, width: c.width, height: c.height, color: rgb(1, 1, 1) });
  for (const q of marks.squares ?? [])
    page.drawRectangle({ x: q.x, y: PAGE_HEIGHT - q.y - q.height, width: q.width, height: q.height, borderColor: color, borderWidth: 0.7 });
  for (const r of marks.rules ?? [])
    page.drawLine({ start: { x: r.from, y: PAGE_HEIGHT - r.y }, end: { x: r.to, y: PAGE_HEIGHT - r.y }, thickness: 0.6, color });
  for (const mark of marks.text) {
    let text = mark.value;
    let size = mark.size;
    while (size > MIN_SIZE && widthOf(runsOf(text), size) > mark.width) size -= 0.5;
    while (text.length > 1 && widthOf(runsOf(text), size) > mark.width) text = `${[...text].slice(0, -2).join("")}…`;
    const runs = runsOf(text);
    let x = mark.align === "right" ? mark.x + mark.width - widthOf(runs, size) : mark.x;
    const y = PAGE_HEIGHT - mark.y;
    for (const [run, font] of runs) {
      page.drawText(run, { x, y, size, font, color });
      x += font.widthOfTextAtSize(run, size);
    }
  }
  // A tick as an X inside the box.
  for (const { x, y } of marks.checks) {
    const cy = PAGE_HEIGHT - y;
    const r = 3;
    page.drawLine({ start: { x: x - r, y: cy - r }, end: { x: x + r, y: cy + r }, thickness: 1.3, color });
    page.drawLine({ start: { x: x - r, y: cy + r }, end: { x: x + r, y: cy - r }, thickness: 1.3, color });
  }
  doc.setTitle("Exit Form");
  doc.setAuthor("");
  doc.setProducer("ViTally");
  doc.setCreator("ViTally");
  return doc.save();
}
