import { makeSampleAnswers } from "../../src/sample-data.mjs";

// Every public application entry point installed so far, with a valid argument
// shape and the member allowed to call it. The database suite asserts this list
// matches exactly what the database exposes, calls each one anonymously, and
// then calls the same shape as a member so blanket denial cannot pass.
// Later migrations add their entry point here as they install it.
export const RPC_SIGNATURES = Object.freeze([
  Object.freeze({
    name: "vitally_create_case",
    signature: "vitally_create_case(uuid,text,uuid,jsonb)",
    authorized: (f) => f.applicantA,
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
]);
