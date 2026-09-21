import assert from "node:assert/strict";
import { chromium, firefox } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createAppServer } from "../../server.mjs";
import { NEUTRAL_SEND_MESSAGE } from "../../src/auth.mjs";
import { assertTestTarget } from "../../tools/admin/test-target.mjs";
import { createDatabaseFixture } from "./database-fixture.mjs";

// The shared browser harness: one guarded test target, one in-process
// application server, one database fixture of confirmed synthetic users, and
// the two real engines. Task 5A proves it; Task 10A imports it unchanged.
//
// Three rules this file exists to keep:
//
//   * **Nothing secret leaves the page.** The generated one-time code stays in
//     this process, the access token stays in the browser, and the assertions
//     that need them run where they already are. No value here is ever printed.
//   * **Only the send is simulated.** The exact guarded `/auth/v1/otp` URL is
//     intercepted so automation never asks a mail server for anything; the real
//     `/auth/v1/verify` is always untouched, so a passing login is a real one.
//   * **Users come from the database fixture.** It owns provisioning and
//     run-scoped cleanup; this file never creates an Auth user of its own.

// The published resend cooldown the app is served with. The server's own
// minimum email interval (60s on the verified stack) plus five seconds.
export const APP_COOLDOWN_SECONDS = 65;

// The one URL automation is allowed to answer for the application.
export const SEND_PATH = "/auth/v1/otp";

// The app's own window-state key, keyed by the authenticated user (Task 6).
export const sessionStateKey = (userId) => `vitally:client:v1:${userId}`;

const CLIENT_OPTIONS = Object.freeze({
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const LAUNCHERS = Object.freeze({
  // The installed Google Chrome, not a bundled Chromium: the engine a visitor
  // actually has.
  chrome: () => chromium.launch({ channel: "chrome", headless: true }),
  firefox: () => firefox.launch({ headless: true }),
});

// The Playwright build that supplies each engine, for the evidence record.
const REVISIONS = Object.freeze({
  chrome: () => null,
  firefox: () => /firefox-(\d+)/.exec(firefox.executablePath())?.[1] ?? null,
});

/**
 * The OPTIONS-safe handler for the intercepted send.
 *
 * It answers a preflight without consuming the send, counts POSTs on its own,
 * and refuses anything else — which is why it carries no `times:1`: a browser
 * that does send a preflight would otherwise spend the handler on it and let
 * the real request through to Auth.
 *
 * Assertion failures are collected rather than thrown, because a throw inside a
 * Playwright route handler leaves the request hanging and prints an unhandled
 * error instead of failing the test. The refused request is aborted, so it can
 * never reach the real server, and the caller asserts `failures` is empty.
 */
export function createSendRoute({ frontendOrigin }) {
  let posts = 0;
  let preflights = 0;
  const failures = [];
  const corsHeaders = () => ({
    "access-control-allow-origin": frontendOrigin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers":
      "apikey, authorization, content-type, x-client-info, x-supabase-api-version",
    vary: "Origin",
  });
  const handler = async (route) => {
    const request = route.request();
    try {
      // Only the application's own page may be answered here. Anything else is
      // a different page talking to the test target, which is never expected.
      assert.equal(
        request.headers().origin,
        frontendOrigin,
        "the intercepted send came from an unexpected origin",
      );
      if (request.method() === "OPTIONS") {
        preflights += 1;
        return await route.fulfill({ status: 204, headers: corsHeaders() });
      }
      assert.equal(
        request.method(),
        "POST",
        "the intercepted send used an unexpected method",
      );
      posts += 1;
      assert.equal(posts, 1, "the application sent more than one code request");
      // `shouldCreateUser:false` is `create_user:false` on the wire: the demo
      // never creates an account from a sign-in attempt.
      assert.equal(
        request.postDataJSON()?.create_user,
        false,
        "the code request did not carry create_user:false",
      );
      return await route.fulfill({
        status: 200,
        headers: corsHeaders(),
        contentType: "application/json",
        body: "{}",
      });
    } catch (error) {
      failures.push(error);
      await route.abort().catch(() => {});
      return undefined;
    }
  };
  return {
    handler,
    get posts() {
      return posts;
    },
    get preflights() {
      return preflights;
    },
    get failures() {
      return failures;
    },
  };
}

/**
 * Prove the session, not the screen (Ruling R46). The signed-in screen is the
 * first condition, but a screen change alone says nothing about who is signed
 * in: the SDK's stored session is read in the page, and only the user id and
 * two booleans come back — the access token never leaves the browser.
 */
export async function assertAuthenticatedUser(page, userId) {
  await page
    .getByRole("heading", { name: "My applications", exact: true })
    .waitFor();
  const stored = await page.evaluate(
    ({ stateKey }) => {
      const key = Object.keys(localStorage).find((name) =>
        /^sb-.*-auth-token$/.test(name),
      );
      if (!key) return { key: null, parsed: false };
      let session = null;
      try {
        session = JSON.parse(localStorage.getItem(key));
      } catch {
        return { key, parsed: false };
      }
      return {
        key,
        parsed: true,
        userId: session?.user?.id ?? null,
        hasAccessToken:
          typeof session?.access_token === "string" &&
          session.access_token.length > 0,
        windowState: sessionStorage.getItem(stateKey) !== null,
      };
    },
    { stateKey: sessionStateKey(userId) },
  );
  assert.ok(stored.key, "the SDK stored no session under sb-<ref>-auth-token");
  assert.match(stored.key, /^sb-.*-auth-token$/);
  assert.equal(stored.parsed, true, "the stored session was not readable JSON");
  assert.equal(stored.userId, userId, "the session belongs to another user");
  assert.equal(
    stored.hasAccessToken,
    true,
    "the stored session carries no access token",
  );
  assert.equal(
    stored.windowState,
    true,
    "the app stored no window state for the signed-in user",
  );
}

// How long one attempt at the code form may take, and how long the whole
// submission may be retried for.
const VERIFY_ATTEMPT_TIMEOUT_MS = 5_000;
const VERIFY_DEADLINE_MS = 45_000;

/**
 * Enter the code and submit the real form.
 *
 * **Recorded defect this works around.** While the resend countdown runs, the
 * access screen rebuilds itself once a second (`app.mjs` `tickCooldown` →
 * `render`, which reassigns `#app.innerHTML`), and the rebuilt code field is
 * rendered with an empty value. A code typed in one tick is therefore gone in
 * the next, in both engines — measured at roughly 0.8s in Firefox and 1.2s in
 * Chrome. Two consequences, both handled here rather than in `src/`:
 *
 *   * The submitted attempt may carry an empty field. That submits *nothing*:
 *     the field is `required`, so `form.reportValidity()` stops it before any
 *     request leaves. Retrying is therefore safe and can never spend a code
 *     twice, which is why this loop exists instead of one hopeful click.
 *   * The button is destroyed and recreated every second, so Playwright's
 *     stability check never settles. `force` skips that check only; this is
 *     still a real click on the real button, running the real submit handler.
 *
 * Both work-arounds must be deleted when the defect is fixed.
 */
export async function submitVerificationCode({ page, code }) {
  const field = page.getByLabel("Verification code", { exact: true });
  const submit = page.getByRole("button", {
    name: "Verify and continue",
    exact: true,
  });
  // Either answer ends the attempt: the signed-in screen, or a stated refusal.
  const settled = page.locator(
    "#code-form p.error[role='alert'], h1:text-is('My applications')",
  );
  const deadline = Date.now() + VERIFY_DEADLINE_MS;
  for (let attempts = 1; ; attempts += 1) {
    await field.fill(String(code));
    await submit.click({ force: true, timeout: VERIFY_ATTEMPT_TIMEOUT_MS });
    try {
      await settled.first().waitFor({ timeout: VERIFY_ATTEMPT_TIMEOUT_MS });
      return attempts;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
    }
  }
}

/**
 * Sign one provisioned actor in through the real form.
 *
 * `otp` is optional: pass one that was generated earlier (a return visit, or a
 * repeat-generation measurement), otherwise one is generated here. The returned
 * code is for a caller that needs to prove it cannot be reused — it must never
 * be logged.
 */
export async function loginTestUser({ page, actor, fixture, otp }) {
  const code = otp ?? (await fixture.generateOtp(actor.email));
  assert.match(String(code), /^[0-9]+$/);
  const route = createSendRoute({ frontendOrigin: fixture.appOrigin });
  await page.route(fixture.sendPattern, route.handler);
  try {
    await page.getByLabel("Email address", { exact: true }).fill(actor.email);
    await page
      .getByRole("button", { name: "Send verification code", exact: true })
      .click();
    // The code step only renders once the send resolved, so the route stays
    // installed until exactly one POST has completed.
    await page.getByText(fixture.neutralSendMessage, { exact: true }).waitFor();
    const field = page.getByLabel("Verification code", { exact: true });
    await field.waitFor();
    assert.deepEqual(
      route.failures.map((error) => error.message),
      [],
    );
    assert.equal(route.posts, 1);
    const attempts = await submitVerificationCode({ page, code });
    // Real verification: /auth/v1/verify is never intercepted.
    await assertAuthenticatedUser(page, actor.userId);
    assert.equal(route.posts, 1);
    return {
      posts: route.posts,
      preflights: route.preflights,
      attempts,
      otp: code,
    };
  } finally {
    await page.unroute(fixture.sendPattern, route.handler);
  }
}

export async function createBrowserFixture() {
  const target = await assertTestTarget();
  const database = await createDatabaseFixture();
  const browsers = [];
  let server = null;
  try {
    // Ruling R45: the app is served in-process from the repository, configured
    // only with the guarded test target. No `.env.local` is ever written, and
    // port 0 keeps parallel runs and other sessions' servers out of the way.
    server = createAppServer({
      env: {
        SUPABASE_URL: target.apiUrl,
        SUPABASE_PUBLISHABLE_KEY: target.publishableKey,
        AUTH_RESEND_COOLDOWN_SECONDS: String(APP_COOLDOWN_SECONDS),
      },
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
  } catch (error) {
    server?.close?.();
    await database.close();
    throw error;
  }

  const appOrigin = `http://127.0.0.1:${server.address().port}`;

  const fixture = {
    // The guarded target's keys are deliberately not exposed: `anonClient` and
    // `generateLink` are the only ways in, and neither hands a caller a value
    // it could print.
    targetMode: target.mode,
    database,
    appOrigin,
    authOrigin: target.apiUrl,
    sendPattern: `${target.apiUrl}${SEND_PATH}`,
    cooldownSeconds: APP_COOLDOWN_SECONDS,
    neutralSendMessage: NEUTRAL_SEND_MESSAGE,
    sessionStateKey,
  };

  // One provisioned actor, by the name the database fixture uses.
  fixture.actor = (key) => {
    const email = database[`${key}Email`];
    const userId = database[`${key}UserId`];
    assert.ok(
      email && userId,
      `The database fixture exposes no ${key} actor (R46).`,
    );
    return { key, email, userId };
  };

  // A fresh unauthenticated client, for the checks that must not borrow a
  // session the fixture already holds.
  fixture.anonClient = () =>
    createClient(target.apiUrl, target.publishableKey, CLIENT_OPTIONS);

  // The privileged generation, re-guarded on every call by `database.service`.
  // The raw result is returned so a caller can record a refusal instead of
  // throwing on it.
  fixture.generateLink = (email) =>
    database.service((admin) =>
      admin.auth.admin.generateLink({ type: "magiclink", email }),
    );

  fixture.generateOtp = async (email) => {
    const { data, error } = await fixture.generateLink(email);
    if (error) throw error;
    const otp = data?.properties?.email_otp;
    assert.match(
      String(otp),
      /^[0-9]+$/,
      "the admin API returned no numeric one-time code",
    );
    return otp;
  };

  fixture.launch = async (engine) => {
    const launcher = LAUNCHERS[engine];
    assert.ok(launcher, `Unknown engine ${engine}.`);
    const browser = await launcher();
    browsers.push(browser);
    return {
      engine,
      browser,
      version: browser.version(),
      revision: REVISIONS[engine](),
      // Each page gets its own context, so two windows never share storage.
      // `pageErrors` are the application's own uncaught exceptions and must
      // always be empty. `errors` are console error lines, which include the
      // engine's own notice for a request the server refused — a deliberately
      // wrong code produces one — so a caller that expects a refusal checks
      // what they say rather than only that there are none.
      async newPage({ viewport = { width: 1280, height: 900 } } = {}) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        const errors = [];
        const pageErrors = [];
        page.on("pageerror", (error) =>
          pageErrors.push(String(error?.message ?? error)),
        );
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
        await page.goto(appOrigin);
        return { context, page, errors, pageErrors };
      },
      close: () => browser.close(),
    };
  };

  fixture.close = async () => {
    const problems = [];
    for (const browser of browsers.splice(0))
      await browser.close().catch((error) => problems.push(error));
    try {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(() => resolve()));
    } catch (error) {
      problems.push(error);
    }
    // The database fixture owns every Auth user and workspace this run made.
    await database.close();
    if (problems.length) throw problems[0];
  };

  return fixture;
}
