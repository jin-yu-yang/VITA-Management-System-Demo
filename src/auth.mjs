import { createAppError } from "./errors.mjs";

// Email sign-in over Supabase Auth one-time codes. This module owns the login
// session and nothing else: no DOM, no data reads, no controller state. The
// Supabase client is injected (Ruling R33), so the same code runs against the
// real SDK in the browser and against a captured double in the unit tests.
//
// The rule this file exists to keep: **a code request tells the visitor
// nothing about who is on the roster.** Accepted, unknown address,
// rate-limited, provider failure, unknown future code and outright transport
// failure all resolve to one identical state, with one identical message and
// one identical cooldown that starts when the request leaves — not when the
// answer arrives, so response timing cannot separate two addresses either. The
// server's signup restriction and membership remain the real boundary; this is
// the browser half of it, and it does not claim to fix enumeration through the
// directly callable Auth API.

// The one thing every syntactically valid request says. It does not claim mail
// was sent, and it names no account, roster or provider.
export const NEUTRAL_SEND_MESSAGE =
  "If this address is eligible, check your inbox for a sign-in code.";

// Auth failures are mapped separately from database errors (contracts.mjs).
// These are the codes the login screen can see.
export const AUTH_ERROR_CODES = Object.freeze([
  "VALIDATION",
  "AUTH_INVALID_CODE",
  "AUTH_ERROR",
  "OFFLINE",
]);

// Sanitized diagnostic categories. A category word is all `onDiagnostic` ever
// receives: no address, code, token, request body or provider message.
export const SEND_DIAGNOSTIC_CATEGORIES = Object.freeze([
  "accepted",
  "unknown_identity",
  "rate_limited",
  "provider_unavailable",
  "transport",
  "unknown",
]);

// Classification is by `error.code` alone — never a regex over a message and
// never an HTTP status. Codes missing from this table are `unknown`, which is
// masked exactly like the rest, so an incomplete table cannot leak membership.
// The observed evidence behind each entry is recorded in
// `tests/fixtures/auth-send-outcomes.mjs`.
const SEND_CATEGORIES = Object.freeze({
  otp_disabled: "unknown_identity",
  over_email_send_rate_limit: "rate_limited",
  over_request_rate_limit: "rate_limited",
  email_provider_disabled: "provider_unavailable",
});

// A deliberately simple local shape check, the only rejection allowed before a
// request: one @, no spaces, and a dotted domain. It decides nothing about
// whether the address exists.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const EMAIL_MAX_LENGTH = 254;

function authError(code, message, cause) {
  return Object.assign(new Error(message, { cause }), { code });
}

// A thrown Auth call never reached a database, so it carries no domain code:
// the one shared mapper turns it into OFFLINE, and this keeps the original
// error reachable on `.cause` rather than replacing it with a stub.
const transportError = (cause) =>
  authError("OFFLINE", createAppError(cause).message, cause);

export function createAuth(
  client,
  { clock = () => Date.now(), cooldownSeconds = 65, onDiagnostic } = {},
) {
  // When the most recent request *left*, or null before the first one.
  let startedAt = null;

  const cooldownRemaining = () =>
    startedAt === null
      ? 0
      : Math.max(
          0,
          Math.ceil((startedAt + cooldownSeconds * 1000 - clock()) / 1000),
        );

  const codeEntry = (retryAfterSeconds) => ({
    state: "code_entry",
    message: NEUTRAL_SEND_MESSAGE,
    retryAfterSeconds,
  });

  // A broken listener must not make one outcome reject while another resolves:
  // that difference alone would answer "is this address on the roster".
  const report = (category) => {
    try {
      onDiagnostic?.(category);
    } catch {
      // Observability is optional; neutrality is not.
    }
  };

  const category = (error) =>
    !error ? "accepted" : (SEND_CATEGORIES[error.code] ?? "unknown");

  async function sendCode(email) {
    const address = String(email ?? "").trim();
    if (address.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(address))
      throw authError(
        "VALIDATION",
        "Enter an email address, for example name@example.org.",
      );
    const remaining = cooldownRemaining();
    // Inside the cooldown nothing is sent at all, so a second click cannot
    // spend the server's quota or produce a different answer.
    if (remaining > 0) return codeEntry(remaining);
    // Recorded before awaiting: the cooldown measures the request, not the
    // answer, so a slow reply never shortens it.
    startedAt = clock();
    try {
      const { error } = await client.auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: false },
      });
      report(category(error));
    } catch {
      report("transport");
    }
    return codeEntry(cooldownSeconds);
  }

  // Verification is the opposite: a wrong or expired code is an explicit,
  // distinct failure. There is no fixed demo code and no bypass.
  async function verifyCode(email, code) {
    let result;
    try {
      result = await client.auth.verifyOtp({
        email: String(email ?? "").trim(),
        token: String(code ?? "").trim(),
        type: "email",
      });
    } catch (cause) {
      throw transportError(cause);
    }
    const error = result?.error;
    if (!error) return;
    if (error.code === "otp_expired")
      throw authError(
        "AUTH_INVALID_CODE",
        "That code is invalid or has expired. Request a new code.",
        error,
      );
    throw authError(
      "AUTH_ERROR",
      "Sign-in could not be completed. Please try again.",
      error,
    );
  }

  return {
    sendCode,
    verifyCode,
    cooldownRemaining,
    async getSession() {
      const { data } = await client.auth.getSession();
      return data?.session ?? null;
    },
    async signOut() {
      await client.auth.signOut();
    },
    subscribe(handler) {
      const { data } = client.auth.onAuthStateChange((event, session) =>
        handler({ event, session }),
      );
      return () => data.subscription.unsubscribe();
    },
  };
}
