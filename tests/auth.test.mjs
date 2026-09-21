import test from "node:test";
import assert from "node:assert/strict";
import { createAuth, NEUTRAL_SEND_MESSAGE } from "../src/auth.mjs";
import {
  AUTH_SEND_EVIDENCE,
  AUTH_SEND_OUTCOMES,
} from "./fixtures/auth-send-outcomes.mjs";

// The one state every syntactically valid request resolves to, whatever the
// server answered. `retryAfterSeconds` is the configured cooldown, never a
// server Retry-After, so response timing cannot distinguish two addresses.
const neutral = (cooldownSeconds = 65) => ({
  state: "code_entry",
  message: NEUTRAL_SEND_MESSAGE,
  retryAfterSeconds: cooldownSeconds,
});

// A clock the test moves by hand, so a slow or fast answer cannot change when
// the cooldown began.
function fakeClock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms) => (now += ms) };
}

// One captured SDK double. `send` decides what signInWithOtp does with the
// recorded arguments; everything else records its call.
function fakeClient({ send = async () => ({ error: null }), verify } = {}) {
  const calls = { send: [], verify: [], getSession: 0, signOut: 0, listen: [] };
  return {
    calls,
    auth: {
      signInWithOtp: async (args) => {
        calls.send.push(args);
        return send(args);
      },
      verifyOtp: async (args) => {
        calls.verify.push(args);
        return verify ? verify(args) : { data: { session: {} }, error: null };
      },
      getSession: async () => {
        calls.getSession += 1;
        return { data: { session: { access_token: "fake" } }, error: null };
      },
      signOut: async () => {
        calls.signOut += 1;
        return { error: null };
      },
      onAuthStateChange: (handler) => {
        calls.listen.push(handler);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                calls.unsubscribed = (calls.unsubscribed ?? 0) + 1;
              },
            },
          },
        };
      },
    },
  };
}

test("email requests do not create public users", async () => {
  const calls = [];
  const client = {
    auth: {
      signInWithOtp: async (args) => {
        calls.push(args);
        return { error: null };
      },
    },
  };
  await createAuth(client).sendCode("student@example.com");
  assert.deepEqual(calls, [
    { email: "student@example.com", options: { shouldCreateUser: false } },
  ]);
});

test("every recorded send outcome returns one identical neutral state", async () => {
  assert.ok(AUTH_SEND_EVIDENCE.version, "the evidence table is versioned");
  for (const outcome of AUTH_SEND_OUTCOMES) {
    const seen = [];
    const client = fakeClient({ send: async () => ({ error: outcome.error }) });
    const auth = createAuth(client, {
      clock: fakeClock().now,
      onDiagnostic: (category) => seen.push(category),
    });
    const result = await auth.sendCode("student@example.com");
    assert.deepEqual(result, neutral(), outcome.label);
    // The diagnostic is the only thing that may differ, and it carries a
    // category word alone: no address, code, token or provider message.
    assert.deepEqual(seen, [outcome.category], outcome.label);
    assert.equal(client.calls.send.length, 1, outcome.label);
  }
});

test("an unknown code and a thrown transport failure stay just as neutral", async () => {
  const known = new Set(AUTH_SEND_OUTCOMES.map((outcome) => outcome.error?.code));
  assert.ok(!known.has("a_future_code_nobody_has_seen"));
  const cases = [
    {
      label: "arbitrary unknown code",
      send: async () => ({ error: { code: "a_future_code_nobody_has_seen" } }),
      category: "unknown",
    },
    {
      label: "error object without a code",
      send: async () => ({ error: { message: "something happened" } }),
      category: "unknown",
    },
    {
      label: "thrown transport failure",
      send: async () => {
        throw new TypeError("fetch failed");
      },
      category: "transport",
    },
  ];
  for (const { label, send, category } of cases) {
    const seen = [];
    const auth = createAuth(fakeClient({ send }), {
      clock: fakeClock().now,
      onDiagnostic: (value) => seen.push(value),
    });
    assert.deepEqual(await auth.sendCode("student@example.com"), neutral(), label);
    assert.deepEqual(seen, [category], label);
  }
});

test("no send outcome leaks through a failing diagnostic listener", async () => {
  // A broken listener must not turn one outcome into a rejected promise while
  // another resolves: that difference alone would answer "is this on the roster".
  for (const outcome of AUTH_SEND_OUTCOMES) {
    const auth = createAuth(
      fakeClient({ send: async () => ({ error: outcome.error }) }),
      {
        clock: fakeClock().now,
        onDiagnostic: () => {
          throw new Error("listener is broken");
        },
      },
    );
    assert.deepEqual(await auth.sendCode("student@example.com"), neutral());
  }
});

test("local email syntax is the only rejection before the send", async () => {
  const client = fakeClient();
  const auth = createAuth(client, { clock: fakeClock().now });
  for (const address of ["", "   ", "student", "student@example", "a b@c.org", "@example.org", "student@.org"])
    await assert.rejects(
      () => auth.sendCode(address),
      (error) => {
        assert.equal(error.code, "VALIDATION");
        assert.ok(error.message.length > 0 && error.message.length <= 120);
        // Plain local copy: it names no account, roster or server answer.
        assert.ok(!/eligible|account|registered/i.test(error.message));
        return true;
      },
      address,
    );
  assert.equal(client.calls.send.length, 0);
  // Surrounding whitespace is trimmed rather than rejected, and the trimmed
  // address is what the SDK receives.
  assert.deepEqual(await auth.sendCode("  student@example.com \n"), neutral());
  assert.deepEqual(client.calls.send, [
    { email: "student@example.com", options: { shouldCreateUser: false } },
  ]);
});

test("the resend cooldown runs from request initiation, not the answer", async () => {
  const clock = fakeClock();
  // A deliberately slow answer: 30 seconds pass inside the SDK call.
  const client = fakeClient({
    send: async () => {
      clock.advance(30_000);
      return { error: null };
    },
  });
  const auth = createAuth(client, { clock: clock.now, cooldownSeconds: 65 });
  assert.deepEqual(await auth.sendCode("student@example.com"), neutral(65));
  // Thirty of the sixty-five seconds are already spent, because the cooldown
  // started when the request left rather than when the answer came back.
  assert.equal(auth.cooldownRemaining(), 35);
  clock.advance(30_000); // t = 60s
  assert.deepEqual(
    await auth.sendCode("student@example.com"),
    { state: "code_entry", message: NEUTRAL_SEND_MESSAGE, retryAfterSeconds: 5 },
    "a second click inside the cooldown reports the remainder",
  );
  assert.equal(client.calls.send.length, 1, "and makes no SDK call at all");
  clock.advance(5_000); // t = 65s
  assert.deepEqual(await auth.sendCode("student@example.com"), neutral(65));
  assert.equal(client.calls.send.length, 2, "the send is enabled again at 65s");
});

test("a failed send holds the same cooldown as an accepted one", async () => {
  for (const send of [
    async () => ({ error: { code: "otp_disabled" } }),
    async () => {
      throw new TypeError("fetch failed");
    },
  ]) {
    const clock = fakeClock();
    const client = fakeClient({ send });
    const auth = createAuth(client, { clock: clock.now, cooldownSeconds: 65 });
    await auth.sendCode("student@example.com");
    assert.equal(auth.cooldownRemaining(), 65);
    clock.advance(64_000);
    assert.deepEqual(await auth.sendCode("student@example.com"), {
      state: "code_entry",
      message: NEUTRAL_SEND_MESSAGE,
      retryAfterSeconds: 1,
    });
    assert.equal(client.calls.send.length, 1);
  }
});

test("cooldownRemaining is zero before the first request", () => {
  const auth = createAuth(fakeClient(), { clock: fakeClock(5_000).now });
  assert.equal(auth.cooldownRemaining(), 0);
});

test("verification sends the typed code and resolves with nothing on success", async () => {
  const client = fakeClient();
  const auth = createAuth(client, { clock: fakeClock().now });
  assert.equal(await auth.verifyCode(" student@example.com ", " 123456 "), undefined);
  assert.deepEqual(client.calls.verify, [
    { email: "student@example.com", token: "123456", type: "email" },
  ]);
});

test("an invalid or expired code is an explicit, distinct failure", async () => {
  const auth = createAuth(
    fakeClient({
      verify: () => ({ data: { session: null }, error: { code: "otp_expired" } }),
    }),
    { clock: fakeClock().now },
  );
  await assert.rejects(
    () => auth.verifyCode("student@example.com", "000000"),
    (error) => {
      assert.equal(error.code, "AUTH_INVALID_CODE");
      assert.equal(
        error.message,
        "That code is invalid or has expired. Request a new code.",
      );
      return true;
    },
  );
});

test("other verification errors and transport failures stay separate and safe", async () => {
  const other = createAuth(
    fakeClient({
      verify: () => ({
        data: { session: null },
        error: { code: "validation_failed", message: "invalid type parameter" },
      }),
    }),
    { clock: fakeClock().now },
  );
  await assert.rejects(
    () => other.verifyCode("student@example.com", "000000"),
    (error) => {
      assert.equal(error.code, "AUTH_ERROR");
      // The provider's own wording never reaches the screen.
      assert.ok(!/invalid type parameter/.test(error.message));
      assert.equal(error.cause.code, "validation_failed");
      return true;
    },
  );
  const offline = createAuth(
    fakeClient({
      verify: () => {
        throw new TypeError("fetch failed");
      },
    }),
    { clock: fakeClock().now },
  );
  await assert.rejects(
    () => offline.verifyCode("student@example.com", "000000"),
    (error) => {
      assert.equal(error.code, "OFFLINE");
      assert.ok(error.cause instanceof TypeError);
      return true;
    },
  );
});

test("there is no fixed demo code and no bypass", async () => {
  const client = fakeClient({
    verify: () => ({ data: { session: null }, error: { code: "otp_expired" } }),
  });
  const auth = createAuth(client, { clock: fakeClock().now });
  for (const code of ["000000", "123456", "111111", "DEMO"])
    await assert.rejects(() => auth.verifyCode("student@example.com", code), {
      code: "AUTH_INVALID_CODE",
    });
  assert.equal(client.calls.verify.length, 4, "every code went to the server");
});

test("session, sign-out and change subscription delegate to the client", async () => {
  const client = fakeClient();
  const auth = createAuth(client, { clock: fakeClock().now });
  assert.deepEqual(await auth.getSession(), { access_token: "fake" });
  assert.equal(client.calls.getSession, 1);
  await auth.signOut();
  assert.equal(client.calls.signOut, 1);
  const seen = [];
  const stop = auth.subscribe((change) => seen.push(change));
  client.calls.listen[0]("SIGNED_IN", { access_token: "fake" });
  assert.deepEqual(seen, [
    { event: "SIGNED_IN", session: { access_token: "fake" } },
  ]);
  stop();
  assert.equal(client.calls.unsubscribed, 1);
});

test("a missing session reads as null rather than an error", async () => {
  const client = fakeClient();
  client.auth.getSession = async () => ({ data: { session: null }, error: null });
  assert.equal(await createAuth(client).getSession(), null);
  // The SDK reports a signed-out visitor with a code-less session error too.
  client.auth.getSession = async () => ({
    data: { session: null },
    error: { name: "AuthSessionMissingError", status: 400 },
  });
  assert.equal(await createAuth(client).getSession(), null);
});

test("an unreachable server while reading the session is not a sign-out", async () => {
  // Refreshing a stale session is a network call, and the SDK returns that
  // failure rather than throwing it. Reading it as "no session" would sign a
  // visitor out because their connection dropped.
  const returned = fakeClient();
  const failure = {
    name: "AuthRetryableFetchError",
    status: 0,
    message: "Failed to fetch",
  };
  returned.auth.getSession = async () => ({ data: { session: null }, error: failure });
  await assert.rejects(() => createAuth(returned).getSession(), (error) => {
    assert.equal(error.code, "OFFLINE");
    assert.equal(error.cause, failure);
    return true;
  });
  const thrown = fakeClient();
  thrown.auth.getSession = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(() => createAuth(thrown).getSession(), { code: "OFFLINE" });
});
