import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as PDFLib from "../src/vendor/pdf-lib.mjs";
import {
  EXIT_FORM_FILE,
  EXIT_FORM_LAYOUT,
  buildExitFormPdf,
  exitFormFontFields,
  exitFormMarks,
  exitFormNeedsFont,
} from "../src/exit-form.mjs";
import { DRAFT_FONT_FIXTURES, draftFontFiles, draftFontsFor } from "../src/draft-pdf.mjs";

// Fictional case and answers only.
const CASE = { taxYear: 2025, clientNumber: 31, firstName: "Mei", lastName: "Chen" };
const L = EXIT_FORM_LAYOUT;
const valueAt = (marks, place) => marks.text.find((m) => m.x === place.x && m.y === place.y)?.value;
const ticked = (marks, at) => marks.checks.some((c) => c.x === at[0] && c.y === at[1]);

test("the header comes from the case and today", () => {
  const marks = exitFormMarks({ exitForm: { federal: null, state: null, local: [] } }, CASE, "2026-11-01");
  assert.equal(valueAt(marks, L.taxYear), "2025");
  assert.equal(valueAt(marks, L.date), "11/01/2026");
  assert.equal(valueAt(marks, L.clientNumber), "31");
  assert.equal(valueAt(marks, L.taxpayer), "Mei Chen");
  assert.equal(marks.checks.length, 0);
  assert.equal(marks.fileName, "exit-form-31.pdf");
});

test("a refund ticks the method and how it is paid, with the amount as money", () => {
  const q = { exitForm: { federal: { method: "efile", result: "refund", amount: "1234.5", refundBy: "direct_deposit" }, state: null, local: [] } };
  const marks = exitFormMarks(q, CASE, "2026-11-01");
  const g = L.groups.federal;
  assert.equal(valueAt(marks, g.amount), "$1,234.50");
  assert.ok(ticked(marks, g.boxes.efile));
  assert.ok(ticked(marks, g.boxes.direct_deposit));
  assert.equal(marks.checks.length, 2);
});

test("an owed direct debit prints its date", () => {
  const q = {
    exitForm: {
      federal: null,
      state: { method: "paper", result: "owe", amount: "86", oweBy: "direct_debit", debitOn: "2026-04-15" },
      local: [],
    },
  };
  const marks = exitFormMarks(q, CASE, "2026-11-01");
  assert.equal(valueAt(marks, L.groups.state.debitOn), "04/15/2026");
  assert.ok(ticked(marks, L.groups.state.boxes.paper));
  assert.ok(ticked(marks, L.groups.state.boxes.direct_debit));
});

test("no refund or tax owed ticks only the filing method", () => {
  const q = { exitForm: { federal: { method: "efile", result: "none" }, state: null, local: [] } };
  const marks = exitFormMarks(q, CASE, "2026-11-01");
  assert.deepEqual(marks.checks, [{ x: L.groups.federal.boxes.efile[0], y: L.groups.federal.boxes.efile[1] }]);
  assert.equal(valueAt(marks, L.groups.federal.amount), undefined);
});

// The cells of one "Other Tax" line, by column.
const localRow = (marks, i) => {
  const y = L.local.firstBaseline + i * L.local.pitch;
  return Object.fromEntries(
    Object.entries(L.local.columns).map(([key, col]) => [key, marks.text.find((m) => m.x === col.x && m.y === y)?.value ?? ""]),
  );
};

test("Other Tax lists each Local entry in both languages: tax, refund or owed and how, amount", () => {
  const q = {
    remarks: "Bring photo ID.",
    exitForm: {
      federal: null,
      state: null,
      local: [
        { type: "NPT", method: "paper", result: "refund", amount: "40", refundBy: "check" },
        { type: "BIRT", method: "paper", result: "owe", amount: "1250", oweBy: "mail_check" },
        { type: "SIT", method: "efile", result: "owe", amount: "12.3", oweBy: "direct_debit", debitOn: "2026-04-15" },
        { type: "EET", method: "paper", result: "none" },
      ],
    },
  };
  const marks = exitFormMarks(q, CASE, "2026-11-01");
  assert.deepEqual(localRow(marks, 0), { type: "NPT", how: "退稅 Refund · 支票 Check", amount: "$40.00" });
  assert.deepEqual(localRow(marks, 1), { type: "BIRT", how: "補繳 Owe · 郵寄支票 Mail check", amount: "$1,250.00" });
  assert.deepEqual(localRow(marks, 2), { type: "SIT (E-file)", how: "補繳 Owe · 銀行扣款 Direct debit 04/15/2026", amount: "$12.30" });
  assert.deepEqual(localRow(marks, 3), { type: "EET", how: "無退稅或補繳 No refund or tax owed", amount: "" });
  assert.equal(marks.checks.length, 0);
  assert.equal(exitFormNeedsFont(marks), true);
  assert.equal(valueAt(marks, L.remarks), "Bring photo ID.");
  // The template's own Other Tax boxes are covered.
  assert.deepEqual(marks.covers, L.local.covers);
});

test("no Local entry says None under Other Tax", () => {
  const marks = exitFormMarks({ exitForm: { federal: null, state: null, local: [] } }, CASE, "2026-11-01");
  assert.equal(localRow(marks, 0).type, "無 None");
});

test("the filled PDF is one page with a blank author", async () => {
  const q = { remarks: "Signed in person.", exitForm: { federal: { method: "efile", result: "refund", amount: "10", refundBy: "check" }, state: null, local: [] } };
  const marks = exitFormMarks(q, CASE, "2026-11-01");
  const fontFiles = await draftFontFiles(draftFontsFor("zh-t"), exitFormFontFields(marks), {
    fontkit: PDFLib.fontkit,
    fetchFont: (file) => readFile(DRAFT_FONT_FIXTURES[file.url].path),
  });
  const bytes = await buildExitFormPdf({ PDFLib, fontkit: PDFLib.fontkit, formBytes: await readFile(EXIT_FORM_FILE), fontFiles, marks });
  const doc = await PDFLib.PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.equal(doc.getAuthor() ?? "", "");
});

test("Chinese in a name or the remarks is drawn with the downloaded fonts", async () => {
  const marks = exitFormMarks({ remarks: "已電話確認", exitForm: { federal: null, state: null, local: [] } }, { ...CASE, firstName: "美" }, "2026-11-01");
  assert.equal(exitFormNeedsFont(marks), true);
  await assert.rejects(
    buildExitFormPdf({ PDFLib, fontkit: PDFLib.fontkit, formBytes: await readFile(EXIT_FORM_FILE), marks }),
    /font files/,
  );
  const fontFiles = await draftFontFiles(draftFontsFor("zh-t"), exitFormFontFields(marks), {
    fontkit: PDFLib.fontkit,
    fetchFont: (file) => readFile(DRAFT_FONT_FIXTURES[file.url].path),
  });
  const bytes = await buildExitFormPdf({ PDFLib, fontkit: PDFLib.fontkit, formBytes: await readFile(EXIT_FORM_FILE), fontFiles, marks });
  assert.equal((await PDFLib.PDFDocument.load(bytes)).getPageCount(), 1);
});
