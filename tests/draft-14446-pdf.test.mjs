import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { buildDraftPdf } from "../src/draft-pdf.mjs";
import { FORM_14446_FILES, draft14446Fields } from "../src/draft-virtual-consent.mjs";

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

test("buildDraftPdf fills the 14446 forms with page 3's values, quietly (draft-14446)", async () => {
  const answers = {
    tp_first_name: "Mei", tp_last_name: "Chen", tp_dob: "1984-05-12", marital_status: "never_married",
    vc_agree: ["yes"], vc_review: "no", vc_tp_signature: "Mei Chen", vc_tp_date: "2026-02-02",
  };
  const names = {
    en: { name: `${P3}signature1[0].printedName[0]`, signature: `${P3}signature1[0].signatureTypePrint[0]`, no: `${P3}consentNo[0]` },
    "zh-t": { name: `${P3}signature_1[0].printedName[0]`, signature: `${P3}signature_1[0].signature[0]`, no: `${P3}no[0]` },
  };
  const warned = [];
  const warn = console.warn;
  console.warn = (...args) => warned.push(args.join(" "));
  try {
    for (const [form, file] of Object.entries(FORM_14446_FILES)) {
      const fields = draft14446Fields(answers, { form, reference: "VT-AAAA-BBBB", today: "2026-02-03" });
      const bytes = await buildDraftPdf({
        PDFLib: { PDFDocument, StandardFonts, rgb }, fontkit, formBytes: await readFile(file),
        fields, stamp: fields.stamp, fileName: fields.fileName, flatten: false,
      });
      const reread = (await PDFDocument.load(bytes)).getForm();
      assert.equal(reread.getTextField(names[form].name).getText(), "Mei Chen", form);
      assert.equal(reread.getTextField(names[form].signature).getText(), "Mei Chen", form);
      assert.equal(reread.getCheckBox(names[form].no).isChecked(), true, form);
    }
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(warned, []);
});

test("buildDraftPdf's default, flattening build of the 14446 forms neither throws nor warns (draft-14446)", async () => {
  const answers = { tp_first_name: "Mei", tp_last_name: "Chen", vc_agree: ["yes"], vc_review: "yes", vc_tp_signature: "Mei Chen" };
  const warned = [];
  const warn = console.warn;
  console.warn = (...args) => warned.push(args.join(" "));
  try {
    for (const [form, file] of Object.entries(FORM_14446_FILES)) {
      const fields = draft14446Fields(answers, { form, reference: "VT-AAAA-BBBB", today: "2026-02-03" });
      const bytes = await buildDraftPdf({
        PDFLib: { PDFDocument, StandardFonts, rgb }, fontkit, formBytes: await readFile(file),
        fields, stamp: fields.stamp, fileName: fields.fileName,
      });
      assert.equal((await PDFDocument.load(bytes)).getPageCount(), 3, form);
    }
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(warned, []);
});
