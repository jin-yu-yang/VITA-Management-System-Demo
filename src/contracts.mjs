export const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERENCE_PATTERN = /^VT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export const STAGES = Object.freeze([
  "draft",
  "received",
  "screening",
  "preparation_ready",
  "preparing",
  "review_ready",
  "reviewing",
  "corrections_required",
  "review_approved",
  "ready_to_efile",
  "efiled",
  "closed",
]);

export const CASE_ACTIONS = Object.freeze([
  "SAVE_ANSWERS",
  "SUBMIT",
  "START_SCREENING",
  "VERIFY_INTAKE",
  "CLAIM_PREPARATION",
  "REQUEST_DOCUMENT",
  "RESPOND_DOCUMENT",
  "RECORD_DOCUMENT_RESPONSE",
  "VERIFY_DOCUMENT",
  "ESCALATE_CONTACT",
  // RECORD_CONTACT left the browser with the contact log (change
  // add-contact-log, design D12); the database refuses new requests.
  "RESOLVE_FOLLOWUP",
  "SUBMIT_REVIEW",
  "CLAIM_REVIEW",
  "REQUEST_CORRECTIONS",
  "RESUBMIT_REVIEW",
  "APPROVE_REVIEW",
  "RECORD_REVIEW_CONTACT",
  "MARK_READY_TO_EFILE",
  "MARK_EFILED",
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
//   intakeVersion: 2. contact: the case_contacts row as
//   { phone, spousePhone, bestContactTime, bestContactNote }, or null when
//   there is none. A list entry carries only the
//   scalars, intakeVersion and intakeVisited (sub-step ids, [] when none)
//   included, and no contact. A presenter's list entry also carries six
//   summaries: participants, openFollowups, followupAssigneeIds,
//   openRequests, phone and reviewContactStatus (the latest approved
//   review's client_contact_status: 'pending', 'completed', or null when no
//   review has been approved). A list entry's goOverOpen is true while a
//   go_over_return follow-up is open (D13). documentCards: the case_document_cards rows as
//   [{ slotId, status: 'later'|'none'|null, groupOverride: 'needed'|null,
//   changedAt }], for both principals.
// Staff case additionally includes participants, reviews, followups,
// internalHistory and materials: [{ item, receivedAt, recordedByPersonId }].
// These are never loaded by the applicant adapter.
// Action: { actionId, caseId, expectedRevision, personId, type, payload }
//   SUBMIT_REVIEW and APPROVE_REVIEW payloads are { questionnaire };
//   RESUBMIT_REVIEW's is { questionnaire, resolution }.
//   Preparer questionnaire: { confirmedBy: client|spouse|other,
//   confirmedByName (only with other, 1-120 trimmed), confirmedMethod:
//   phone|in_person|text|email|video, shadedPartsCompleted: true,
//   stateForgivenessSet: true, readyForReviewOn: 'YYYY-MM-DD' }.
//   Reviewer questionnaire: { completedOn, paForgiveness: eligible|
//   not_eligible, wentOver: boolean, wentOverOn (only and required with
//   wentOver true), wentOverHow (only with true, optional: in_person|phone|
//   video|other), signMethod: portal|in_person, signAppointmentAt
//   ('YYYY-MM-DDTHH:MM' site wall time; only when in person and the service
//   is not same_day), exitForm, remarks (optional, 1-2000 trimmed) }.
//   exitForm: { federal: Group|null, state: Group|null, local: [Group +
//   type: NPT|BIRT|EET|SIT|PAIBWTR] } (all three keys always present).
//   Group: { method: efile|paper, result: refund|owe|none, amount: decimal
//   string 0-999999.99 (refund, owe), refundBy: direct_deposit|check
//   (refund), oweBy: direct_debit|mail_check (owe), debitOn: 'YYYY-MM-DD'
//   (direct_debit) }. No account or routing number is ever stored.
// Receipt: { actionId, caseId, reference, revision }
// AppError: Error with a code from ERROR_CODES (auth errors mapped separately).
// Controller state: {savedCase, draftAnswers, editBaseRevision,
//                    dirty, conflict, saveState, connection, ...navigation}
// There is no state.case alias.
