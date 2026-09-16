import { makeSampleAnswers } from "../../src/sample-data.mjs";

// Every public application entry point installed so far, with a valid argument
// shape, the exact receipt it answers with, and the member allowed to call it.
// The database suite asserts this list matches exactly what the database
// exposes, calls each one anonymously, and then calls the same shape as a
// member so blanket denial cannot pass. Later migrations add their entry point
// here as they install it.
export const RPC_SIGNATURES = Object.freeze([
  Object.freeze({
    name: "vitally_create_case",
    signature: "vitally_create_case(uuid,text,uuid,jsonb)",
    authorized: (f) => f.applicantA,
    receiptKeys: Object.freeze(["actionId", "caseId", "reference", "revision"]),
    args: () => ({
      p_action_id: crypto.randomUUID(),
      p_mode: "client",
      p_person_id: null,
      p_answers: makeSampleAnswers(),
    }),
  }),
  Object.freeze({
    name: "vitally_apply_action",
    signature: "vitally_apply_action(uuid,uuid,bigint,uuid,text,jsonb)",
    authorized: (f) => f.applicantA,
    receiptKeys: Object.freeze(["actionId", "caseId", "reference", "revision"]),
    // The draft in `context` is the caller's own, so this shape is a legitimate
    // request: only the missing session makes the anonymous call fail.
    args: (context) => ({
      p_action_id: crypto.randomUUID(),
      p_case_id: context.draftCaseId,
      p_expected_revision: context.draftRevision,
      p_person_id: null,
      p_type: "SAVE_ANSWERS",
      p_payload: { answers: { city: "Pittsburgh" } },
    }),
  }),
  Object.freeze({
    name: "vitally_assistance_action",
    signature: "vitally_assistance_action(uuid,uuid,bigint,uuid,text,text)",
    // Assistance is presenter work, so its positive control is the presenter
    // with the workspace's `assist` person claiming the open item.
    authorized: (f) => f.presenter,
    receiptKeys: Object.freeze(["actionId", "itemId", "revision"]),
    args: (context) => ({
      p_action_id: crypto.randomUUID(),
      p_item_id: context.assistanceItemId,
      p_expected_revision: context.assistanceRevision,
      p_person_id: context.assistPersonId,
      p_type: "CLAIM",
      p_note: "",
    }),
  }),
]);
