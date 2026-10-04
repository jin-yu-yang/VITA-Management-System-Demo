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
  // Part 4a (migration 013). No screen offers them until 4b and 4c.
  "UPDATE_CONTACT",
  "RECORD_MATERIALS",
  // Part 4b2 (migration 017): the document cards. The controller builds them.
  "SET_DOCUMENT_CARD",
  "SET_DOCUMENT_GROUP",
]);

// Assistance is its own workflow with its own RPC, so its controls carry their
// own attribute and are validated against this vocabulary — never translated
// into a case action. Shared, so the controller and the wiring layer cannot
// hold two different ideas of what an assistance control may say.
export const ASSISTANCE_ACTIONS = Object.freeze(["CLAIM", "RESOLVE"]);

// The points in the story a presenter may put one demonstration case back to.
// The database enforces the same five names (migration 009); this is the one
// place the browser spells them, so the panel and the controller cannot drift.
export const CHECKPOINTS = Object.freeze([
  "intake_ready",
  "document_requested",
  "admin_followup_needed",
  "ready_for_review",
  "corrections_required",
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
//         preparerId, reviewerId, season, clientNumber, intakeVersion,
//         intakeVisited, contact, documentCards, requests, documents, history }
//   intakeVersion: 1 | 2. contact: the case_contacts row as
//   { phone, spousePhone, bestContactTime, bestContactNote }, or null when
//   there is none (always null for version 1). A list entry carries only the
//   scalars, intakeVersion and intakeVisited (sub-step ids, [] when none)
//   included, and no contact. documentCards: the case_document_cards rows as
//   [{ slotId, status: 'later'|'none'|null, groupOverride: 'needed'|null,
//   changedAt }], for both principals.
// Staff case additionally includes participants, reviews, followups,
// internalHistory and materials: [{ item, receivedAt, recordedByPersonId }].
// These are never loaded by the applicant adapter.
// Action: { actionId, caseId, expectedRevision, personId, type, payload }
// Receipt: { actionId, caseId, reference, revision }
// AppError: Error with a code from ERROR_CODES (auth errors mapped separately).
// Controller state: {savedCase, draftAnswers, editBaseRevision,
//                    dirty, conflict, saveState, connection, ...navigation}
// There is no state.case alias.
