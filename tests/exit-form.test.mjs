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
const CASE = { taxYear: 2025, clientNumber: "PCDC-0031", firstName: "Mei", lastName: "Chen" };
const L = EXIT_FORM_LAYOUT;
const valueAt = (marks, place) => marks.text.find((m) => m.x === place.x && m.y === place.y)?.value;
const ticked = (marks, at) => marks.checks.some((c) => c.x === at[0] && c.y === at[1]);

test("the header comes from the case and today", () => {
  const marks = exitFormMarks({ exitForm: { federal: null, state: null, local: [] } }, CASE, "2026-11-01");
  assert.equal(valueAt(marks, L.taxYear), "2025");
  assert.equal(valueAt(marks, L.date), "11/01/2026");
  assert.equal(valueAt(marks, L.clientNumber), "PCDC-0031");
  assert.equal(valueAt(marks, L.taxpayer), "Mei Chen");
  assert.equal(marks.checks.length, 0);
  assert.equal(marks.fileName, "exit-form-PCDC-0031.pdf");
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

test("an owed direct debit prints its date; a mail check none", () => {
  const q = {
    exitForm: {
      federal: null,
      state: { method: "paper", result: "owe", amount: "86", oweBy: "direct_debit", debitOn: "2026-04-15" },
      local: [{ type: "NPT", method: "efile", result: "owe", amount: "40", oweBy: "mail_check" }],
    },
  };
  const marks = exitFormMarks(q, CASE, "2026-11-01");
  assert.equal(valueAt(marks, L.groups.state.debitOn), "04/15/2026");
  assert.ok(ticked(marks, L.groups.state.boxes.paper));
  assert.ok(ticked(marks, L.groups.state.boxes.direct_debit));
  assert.equal(valueAt(marks, L.groups.local.type), "NPT");
  assert.ok(ticked(marks, L.groups.local.boxes.mail_check));
  assert.equal(valueAt(marks, L.groups.local.debitOn), undefined);
});

test("no refund or tax owed ticks only the filing method", () => {
  const q = { exitForm: { federal: { method: "efile", result: "none" }, state: null, local: [] } };
  const marks = exitFormMarks(q, CASE, "2026-11-01");
  assert.deepEqual(marks.checks, [{ x: L.groups.federal.boxes.efile[0], y: L.groups.federal.boxes.efile[1] }]);
  assert.equal(valueAt(marks, L.groups.federal.amount), undefined);
});

test("Local entries past the first go to the remarks, ahead of the reviewer's", () => {
  const q = {
    remarks: "Bring photo ID.",
    exitForm: {
      federal: null,
      state: null,
      local: [
        { type: "NPT", method: "paper", result: "none" },
        { type: "BIRT", method: "efile", result: "refund", amount: "12", refundBy: "check" },
      ],
    },
  };
  const marks = exitFormMarks(q, CASE, "2026-11-01");
  assert.equal(valueAt(marks, L.remarks), "BIRT: e-file, refund $12.00 by check; Bring photo ID.");
});

test("the filled PDF is one page and needs no font for Latin text", async () => {
  const q = { remarks: "Signed in person.", exitForm: { federal: { method: "efile", result: "refund", amount: "10", refundBy: "check" }, state: null, local: [] } };
  const marks = exitFormMarks(q, CASE, "2026-11-01");
  assert.equal(exitFormNeedsFont(marks), false);
  const bytes = await buildExitFormPdf({ PDFLib, fontkit: PDFLib.fontkit, formBytes: await readFile(EXIT_FORM_FILE), marks });
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
