// The Form 14446 consent and signatures (openspec change add-form-14446-consent).
// Test helpers that build a version-2 draft start from these, so the draft is
// consented and signed, and the 0.4 gate lets it open the other screens. A test
// about the unconsented client sets `vc_agree: null` (or leaves it out) itself.
export const CONSENT_14446 = Object.freeze({
  vc_agree: Object.freeze(["yes"]),
  vc_review: "yes",
  vc_tp_signature: "Mei Chen",
  vc_tp_date: "2026-02-02",
});
