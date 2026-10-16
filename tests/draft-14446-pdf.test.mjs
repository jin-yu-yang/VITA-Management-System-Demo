import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";

// The draft Form 14446 forms (openspec change add-form-14446-consent, design D5).
const FILES = { en: "src/forms/f14446-pcdc-en.pdf", "zh-t": "src/forms/f14446-pcdc-zh-t.pdf" };
const P3 = "form1[0].page3[0].";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const loadQuietly = async (file) => {
  const warned = [];
  const warn = console.warn;
  console.warn = (...args) => warned.push(args.join(" "));
  try {
    const doc = await PDFDocument.load(await readFile(file));
    doc.getForm();
    return { doc, warned };
  } finally {
    console.warn = warn;
  }
};

test("the 14446 forms have no XFA, so loading them warns nothing", async () => {
  for (const file of Object.values(FILES)) assert.deepEqual((await loadQuietly(file)).warned, [], file);
});

test("the 14446 forms' Yes/No boxes on page 3 all start clear", async () => {
  const boxes = {
    en: ["consentYes[0]", "consentNo[0]", "amAgreeingTo[0].agreeingYes[0]", "amAgreeingTo[0].agreeingNo[0]"],
    "zh-t": ["yes[0]", "no[0]", "I_am[0].yes[0]", "I_am[0].no[0]"],
  };
  for (const [form, names] of Object.entries(boxes)) {
    const fields = (await loadQuietly(FILES[form])).doc.getForm();
    for (const name of names) assert.equal(fields.getCheckBox(P3 + name).isChecked(), false, `${form} ${name}`);
  }
});

test("the 14446 forms flatten after filling, as buildDraftPdf does, without throwing or warning (spike)", async () => {
  for (const [form, file] of Object.entries(FILES)) {
    const { doc, warned } = await loadQuietly(file);
    const name = form === "en" ? `${P3}signature1[0].printedName[0]` : `${P3}signature_1[0].printedName[0]`;
    const fields = doc.getForm();
    fields.getTextField(name).setText("Mei Chen");
    // Exactly what buildDraftPdf does (src/draft-pdf.mjs:394-395): appearances
    // in Helvetica, then a flatten that doesn't update them again.
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    fields.updateFieldAppearances(helvetica);
    fields.flatten({ updateFieldAppearances: false });
    assert.ok((await doc.save()).length > 0, form);
    assert.deepEqual(warned, [], form);
  }
});

test("page 3's boxes take fictional values, the read-only 繁體 signature included (spike)", async () => {
  const values = {
    en: { "signature1[0].printedName[0]": "Mei Chen", "signature1[0].dateOfBirth[0]": "05/12/1984", "signature1[0].signatureTypePrint[0]": "Mei Chen" },
    "zh-t": { "signature_1[0].printedName[0]": "Mei Chen", "signature_1[0].DOB[0]": "05/12/1984", "signature_1[0].signature[0]": "Mei Chen" },
  };
  for (const [form, boxes] of Object.entries(values)) {
    const { doc } = await loadQuietly(FILES[form]);
    const fields = doc.getForm();
    for (const [name, value] of Object.entries(boxes)) fields.getTextField(P3 + name).setText(value);
    const reread = (await PDFDocument.load(await doc.save())).getForm();
    for (const [name, value] of Object.entries(boxes)) assert.equal(reread.getTextField(P3 + name).getText(), value, `${form} ${name}`);
  }
});
