export const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERENCE_PATTERN = /^VT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export const STAGES = Object.freeze([
  "draft",
  "received",
  "preparation_ready",
  "preparing",
  "review_ready",
  "reviewing",
  "corrections_required",
  "review_approved",
  "closed",
]);

export const CASE_ACTIONS = Object.freeze([
  "SAVE_ANSWERS",
  "SUBMIT",
  "VERIFY_INTAKE",
  "CLAIM_PREPARATION",
  "REQUEST_DOCUMENT",
  "RESPOND_DOCUMENT",
  "RECORD_DOCUMENT_RESPONSE",
  "VERIFY_DOCUMENT",
  "ESCALATE_CONTACT",
  "RECORD_CONTACT",
  "RESOLVE_FOLLOWUP",
  "SUBMIT_REVIEW",
  "CLAIM_REVIEW",
  "REQUEST_CORRECTIONS",
  "RESUBMIT_REVIEW",
  "APPROVE_REVIEW",
  "RECORD_REVIEW_CONTACT",
  "REMIND",
  "CLOSE_CASE",
]);

export const ERROR_CODES = Object.freeze([
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INVALID_TRANSITION",
  "SELF_REVIEW",
  "INELIGIBLE",
  "VALIDATION",
  "OFFLINE",
  "SERVER_ERROR",
]);

export const SQLSTATE_ERROR_CODES = Object.freeze({
  VT001: "FORBIDDEN",
  VT002: "NOT_FOUND",
  VT003: "CONFLICT",
  VT004: "INVALID_TRANSITION",
  VT005: "SELF_REVIEW",
  VT006: "INELIGIBLE",
  VT007: "VALIDATION",
});

// Principal: { userId, workspaceId, access: 'applicant'|'presenter', email }
// Person: { id, name, capabilities: string[] }
// Case: { id, reference, workspaceId, ownerUserId, fixture, stage,
//         revision, preparationVersion, answers, intakeVerified,
//         preparerId, reviewerId, requests, documents, history }
// Staff case additionally includes participants, reviews, followups,
// internalHistory. These are never loaded by the applicant adapter.
// Action: { actionId, caseId, expectedRevision, personId, type, payload }
// Receipt: { actionId, caseId, reference, revision }
// AppError: Error with a code from ERROR_CODES (auth errors mapped separately).
// Controller state: {savedCase, draftAnswers, editBaseRevision,
//                    dirty, conflict, saveState, connection, ...navigation}
// There is no state.case alias.
