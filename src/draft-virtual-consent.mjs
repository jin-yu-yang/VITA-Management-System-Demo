// The draft Form 14446 (openspec change add-form-14446-consent, design D5):
// PCDC's own form, pages 1-2 as PCDC filled them, page 3 filled here from the
// answers. buildDraftPdf (draft-pdf.mjs) builds it, as it builds the 13614-C.
// The file name has no digits on purpose: the server's module rule admits none.
import { isAnswered, memberNameParts, spouseShown, visibleAnswers } from "./intake-catalogue.mjs";
import { consented } from "./intake-form.mjs";
import { draftStamp, oneLine, phone, usDate } from "./draft-form.mjs";

export const FORM_14446_FILES = Object.freeze({
  en: "src/forms/f14446-pcdc-en.pdf",
  "zh-t": "src/forms/f14446-pcdc-zh-t.pdf",
});

// Pinned, so a silent swap of a form can't break the field map.
export const FORM_14446_SHA256 = Object.freeze({
  en: "52f1a04f3fcbae9f62c8f4a04ad97b8d3a5a1760c24c7d4c3aab3b5332053864",
  "zh-t": "2f809156bb7f8305d7496a572c4d50b05cd42d2aea15e3b2bf0d0c632de00339",
});

const P3 = "form1[0].page3[0].";
// Page 3's box names, per form: the 繁體 form names its fields differently.
const NAMES = Object.freeze({
  en: {
    blocks: ["signature1[0].", "signature2[0]."],
    boxes: { name: "printedName[0]", dob: "dateOfBirth[0]", date: "dateSigned[0]", phone: "telephoneNumber[0]", email: "emailAddress[0]", signature: "signatureTypePrint[0]" },
    review: { yes: "consentYes[0]", no: "consentNo[0]" },
    agree: "amAgreeingTo[0].agreeingYes[0]",
  },
  "zh-t": {
    blocks: ["signature_1[0].", "signature_2[0]."],
    boxes: { name: "printedName[0]", dob: "DOB[0]", date: "date[0]", phone: "phone[0]", email: "email[0]", signature: "signature[0]" },
    review: { yes: "yes[0]", no: "no[0]" },
    agree: "I_am[0].yes[0]",
  },
});

// Which answers fill each person's block.
const PEOPLE = Object.freeze([
  { prefix: "tp", dob: "tp_dob", phone: "tp_phone", email: "email", signature: "vc_tp_signature", date: "vc_tp_date" },
  { prefix: "sp", dob: "sp_dob", phone: "sp_phone", email: "vc_sp_email", signature: "vc_sp_signature", date: "vc_sp_date" },
]);

/**
 * The text and the checks of page 3, from the answers: the client's block
 * always, the spouse's only while the spouse signed under J. The electronic
 * signature fields stay empty (Task 1 removed them) and every empty value is
 * left out. Returns what `buildDraftPdf` takes as `fields`, plus `stamp` and
 * `fileName`.
 */
export function draft14446Fields(answers, { form = "en", reference = "", today } = {}) {
  if (!Object.hasOwn(NAMES, form)) throw new Error(`Unknown draft form: ${form}`);
  const names = NAMES[form];
  const visible = visibleAnswers(2, answers ?? {});
  const text = {};
  const checks = [];
  const answered = (id) => Object.hasOwn(visible, id) && isAnswered(visible[id]);
  const put = (box, value) => {
    if (value !== "") text[P3 + box] = value;
  };

  PEOPLE.forEach((person, i) => {
    if (i === 1 && !(spouseShown(visible) && answered(person.signature))) return;
    const block = names.blocks[i];
    const member = {
      first_name: visible[`${person.prefix}_first_name`],
      middle_name: visible[`${person.prefix}_middle_name`],
      last_name: visible[`${person.prefix}_last_name`],
    };
    put(block + names.boxes.name, memberNameParts(member).map(oneLine).join(" "));
    if (answered(person.dob)) put(block + names.boxes.dob, usDate(visible[person.dob]));
    if (answered(person.date)) put(block + names.boxes.date, usDate(visible[person.date]));
    if (answered(person.phone)) put(block + names.boxes.phone, phone(visible[person.phone]));
    if (answered(person.email)) put(block + names.boxes.email, oneLine(visible[person.email]));
    if (answered(person.signature)) put(block + names.boxes.signature, oneLine(visible[person.signature]));
  });

  if (visible.vc_review === "yes" || visible.vc_review === "no") checks.push(P3 + names.review[visible.vc_review]);
  if (consented(answers)) checks.push(P3 + names.agree);

  return { text, checks, comments: "", consentPage: true, words: {}, stamp: draftStamp(reference, today), fileName: "14446-draft.pdf" };
}
