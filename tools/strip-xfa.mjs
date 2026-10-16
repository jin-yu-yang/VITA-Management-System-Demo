// Writes the draft Form 14446 forms (openspec change add-form-14446-consent,
// design D5): PCDC's own copies in docs/media without their XFA layer, so
// pdf-lib opens them without its "Removing XFA form data" console warning,
// and with page 3's Yes/No boxes cleared ("Request to Review your Tax Return
// for Accuracy" and "I agree to use this site's Virtual VITA/TCE Process"), so
// the client's answers decide them. Run it once when PCDC's
// copies change; the outputs are committed and pinned by SHA-256.
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument, PDFName } from "pdf-lib";

const FORMS = [
  {
    from: "docs/media/f14446 - Taxpayer.pdf",
    to: "src/forms/f14446-pcdc-en.pdf",
    clear: ["consentYes[0]", "consentNo[0]", "amAgreeingTo[0].agreeingYes[0]", "amAgreeingTo[0].agreeingNo[0]"].map((box) => `form1[0].page3[0].${box}`),
  },
  {
    from: "docs/media/f14446 - 主报税人.pdf",
    to: "src/forms/f14446-pcdc-zh-t.pdf",
    clear: ["yes[0]", "no[0]", "I_am[0].yes[0]", "I_am[0].no[0]"].map((box) => `form1[0].page3[0].${box}`),
  },
];

for (const { from, to, clear } of FORMS) {
  const doc = await PDFDocument.load(await readFile(from));
  const acro = doc.catalog.lookup(PDFName.of("AcroForm"));
  acro?.delete(PDFName.of("XFA"));
  doc.catalog.delete(PDFName.of("NeedsRendering"));
  const form = doc.getForm();
  // pdf-lib flattens each field from its existing appearance and throws on a
  // widget with none: the empty electronic-signature fields (which the draft
  // never fills) have none, so those fields go.
  for (const field of form.getFields()) {
    const lacksAppearance = field.acroField.getWidgets().some((widget) => !widget.dict.lookup(PDFName.of("AP"))?.get(PDFName.of("N")));
    if (lacksAppearance) {
      // form.removeField itself throws on such a widget, so unhook it by hand:
      // off its page, off the form, out of the file.
      for (const widget of field.acroField.getWidgets()) {
        const widgetRef = doc.context.getObjectRef(widget.dict);
        form.findWidgetPage(widget).node.removeAnnot(widgetRef);
      }
      form.acroForm.removeField(field.acroField);
      doc.context.delete(field.ref);
      console.log(`  removed ${field.getName()} (no appearance)`);
    }
  }
  for (const name of clear) form.getCheckBox(name).uncheck();
  // A fixed date keeps the output byte-identical from run to run.
  const fixed = new Date(Date.UTC(2026, 0, 1));
  doc.setModificationDate(fixed);
  doc.setCreationDate(fixed);
  await writeFile(to, await doc.save({ useObjectStreams: false }));
  console.log(`wrote ${to}`);
}
