// Versioned evidence for the neutral sign-in-code request.
//
// This table is the *oracle* for `src/auth.mjs`: each row records an outcome of
// `auth.signInWithOtp`, where the code came from, and the sanitized diagnostic
// category it must be classified as. `tests/auth.test.mjs` drives the
// neutrality assertions from it, so the production classifier is checked
// against recorded observations rather than against a copy of itself.
//
// Classification is by `error.code` alone — never a regex over a message and
// never an HTTP status. The status column is recorded only as evidence of what
// the probe saw. Every row, and every code that is not in this table, must
// produce the same state, message and cooldown; masking has to cover future
// codes too, or an incomplete table would leak roster membership.
//
// Re-run the probe and bump the version when the target or its Auth version
// changes. `observed` rows were reproduced against a real stack; `source` rows
// come from Supabase's error-code documentation only and are candidate tests,
// not evidence of deployed behaviour.
export const AUTH_SEND_EVIDENCE = Object.freeze({
  version: "2026-09-15",
  target: "isolated local Supabase, GoTrue v2.196.0, supabase-js 2.116.0",
  probe: "docs/superpowers/reviews/2026-09-15-vitally-auth-probe.md",
});

export const AUTH_SEND_OUTCOMES = Object.freeze([
  Object.freeze({
    label: "request accepted",
    error: null,
    status: 200,
    category: "accepted",
    evidence: "observed",
    scenario:
      "The request completed. Delivery is not claimed: the copy says nothing about mail being sent.",
  }),
  Object.freeze({
    label: "unknown address with signup disabled",
    error: { code: "otp_disabled", message: "Signups not allowed for otp" },
    status: 422,
    category: "unknown_identity",
    evidence: "observed",
    scenario:
      "shouldCreateUser:false against an address with no account. No user is created and no mail is sent.",
  }),
  Object.freeze({
    label: "known address inside the resend floor",
    error: {
      code: "over_email_send_rate_limit",
      message: "For security purposes, you can only request this after 60s.",
    },
    status: 429,
    category: "rate_limited",
    evidence: "observed",
    scenario:
      "A confirmed address asked again within the server's 60s minimum interval. Answering in 35ms is why timing alone must not drive the UI.",
  }),
  Object.freeze({
    label: "email provider disabled by misconfiguration",
    error: {
      code: "email_provider_disabled",
      message: "Email logins are disabled",
    },
    status: 422,
    category: "provider_unavailable",
    evidence: "observed",
    scenario:
      "auth.email.enable_signup=false produced GOTRUE_EXTERNAL_EMAIL_ENABLED=false, so even a known address failed.",
  }),
  Object.freeze({
    label: "generic request quota",
    error: { code: "over_request_rate_limit", message: "Request rate limit" },
    status: 429,
    category: "rate_limited",
    evidence: "source",
    scenario:
      "Documented by Supabase but not reproduced on the probed target; kept as a candidate so the mapping is covered either way.",
  }),
]);
