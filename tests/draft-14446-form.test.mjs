import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { FORM_14446_FILES, FORM_14446_SHA256, draft14446Fields } from "../src/draft-virtual-consent.mjs";

const F = (name) => `form1[0].page3[0].${name}`;
const MEI = Object.freeze({
  tp_first_name: "Mei", tp_last_name: "Chen", tp_dob: "1984-05-12", tp_phone: "2155550101", email: "mei@example.com",
  marital_status: "never_married", vc_agree: ["yes"], vc_review: "yes", vc_tp_signature: "Mei Chen", vc_tp_date: "2026-02-02",
});
const WEI = Object.freeze({ sp_first_name: "Wei", sp_last_name: "Lin", sp_dob: "1982-03-04", sp_phone: "2155550150", vc_sp_email: "wei@example.com" });
const draft = (answers, form = "en") => draft14446Fields(answers, { form, reference: "VT-AAAA-BBBB", today: "2026-02-03" });

test("the 14446 forms match their pinned sha256", async () => {
  for (const [form, file] of Object.entries(FORM_14446_FILES))
    assert.equal(createHash("sha256").update(await readFile(file)).digest("hex"), FORM_14446_SHA256[form], form);
});

test("the client's block (draft-14446)", () => {
  const { text, fileName } = draft(MEI);
  assert.equal(text[F("signature1[0].printedName[0]")], "Mei Chen");
  assert.equal(text[F("signature1[0].dateOfBirth[0]")], "05/12/1984");
  assert.equal(text[F("signature1[0].dateSigned[0]")], "02/02/2026");
  assert.equal(text[F("signature1[0].telephoneNumber[0]")], "(215) 555-0101");
  assert.equal(text[F("signature1[0].emailAddress[0]")], "mei@example.com");
  assert.equal(text[F("signature1[0].signatureTypePrint[0]")], "Mei Chen");
  assert.equal(fileName, "14446-draft.pdf");
  const { vc_tp_date: _d, ...undated } = MEI;
  assert.equal(draft(undated).text[F("signature1[0].dateSigned[0]")] ?? "", "");
});

test("the spouse block only when the spouse signed under J (draft-14446)", () => {
  const married = { ...MEI, ...WEI, marital_status: "married" };
  const signed = draft({ ...married, vc_sp_signature: "Wei Lin", vc_sp_date: "2026-02-02" }).text;
  assert.equal(signed[F("signature2[0].printedName[0]")], "Wei Lin");
  assert.equal(signed[F("signature2[0].signatureTypePrint[0]")], "Wei Lin");
  assert.equal(signed[F("signature2[0].emailAddress[0]")], "wei@example.com");
  const unsigned = draft(married).text;
  assert.deepEqual(Object.keys(unsigned).filter((name) => name.includes("signature2")), []);
  const late = draft({ ...MEI, ...WEI, marital_status: "widowed", spouse_death_year: "2025", vc_sp_signature: "Wei Lin" }).text;
  assert.equal(late[F("signature2[0].printedName[0]")], "Wei Lin");
  assert.equal(late[F("signature2[0].telephoneNumber[0]")] ?? "", "");
  assert.equal(late[F("signature2[0].emailAddress[0]")] ?? "", "");
  const earlier = draft({ ...MEI, ...WEI, marital_status: "widowed", spouse_death_year: "2024", vc_sp_signature: "Wei Lin" }).text;
  assert.deepEqual(Object.keys(earlier).filter((name) => name.includes("signature2")), []);
});

test("the review boxes follow vc_review, the agreement follows vc_agree; the electronic signature stays empty (draft-14446)", () => {
  const AGREE = F("amAgreeingTo[0].agreeingYes[0]");
  assert.deepEqual(draft(MEI).checks.toSorted(), [AGREE, F("consentYes[0]")].toSorted());
  assert.deepEqual(draft({ ...MEI, vc_review: "no" }).checks.toSorted(), [AGREE, F("consentNo[0]")].toSorted());
  assert.deepEqual(draft({ ...MEI, vc_review: null }).checks, [AGREE]);
  assert.deepEqual(draft({ ...MEI, vc_agree: null, vc_review: null }).checks, []);
  assert.deepEqual(Object.keys(draft(MEI).text).filter((name) => name.includes("signatureElectronic")), []);
});

test("the 繁體 form's field names (draft-14446)", () => {
  const { text, checks } = draft({ ...MEI, vc_review: "no" }, "zh-t");
  assert.equal(text[F("signature_1[0].printedName[0]")], "Mei Chen");
  assert.equal(text[F("signature_1[0].DOB[0]")], "05/12/1984");
  assert.equal(text[F("signature_1[0].signature[0]")], "Mei Chen");
  assert.deepEqual(checks.toSorted(), [F("I_am[0].yes[0]"), F("no[0]")].toSorted());
  assert.throws(() => draft(MEI, "zh-s"), /Unknown/);
});
