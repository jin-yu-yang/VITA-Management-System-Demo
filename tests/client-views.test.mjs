import test from "node:test";
import assert from "node:assert/strict";
import {
  accessScreen,
  applicationsScreen,
  referenceScreen,
  intakeScreen,
  progressScreen,
  conflictForm,
  saveStatus,
} from "../src/client-views.mjs";
import {
  page,
  setupNeeded,
  staffScreen,
  renderStaffLanding,
  connectionNotice,
  unreachableScreen,
} from "../src/views.mjs";
import { describeStage } from "../src/domain.mjs";

// Views are pure functions of a controller snapshot, so these tests operate on
// the HTML string itself. No DOM library, and nothing here may reach a store.

const baseState = (overrides = {}) => ({
  session: "present",
  principal: { userId: "user-1", workspaceId: "w1", access: "applicant" },
  connection: "online",
  error: null,
  retryable: false,
  authStep: "email",
  authEmail: "",
  authCode: "",
  authMessage: "",
  authError: null,
  resendSeconds: 0,
  cases: [],
  people: [],
  savedCase: null,
  draftAnswers: {},
  editBaseRevision: null,
  dirty: false,
  conflict: null,
  saveState: "idle",
  busy: false,
  screen: "applications",
  selectedCaseId: null,
  selectedPersonId: null,
  formStep: 0,
  openPanels: [],
  lookup: "",
  dialog: null,
  ...overrides,
});

const caseRecord = (overrides = {}) => ({
  id: "case-a",
  reference: "VT-AB2C-DE3F",
  workspaceId: "w1",
  ownerUserId: "user-1",
  stage: "draft",
  revision: 1,
  preparationVersion: 1,
  answers: {},
  intakeVerified: false,
  preparerId: null,
  reviewerId: null,
  requests: [],
  documents: [],
  history: [],
  ...overrides,
});

// A label is really associated with its control, not merely adjacent to it.
function labelledControl(html, text) {
  const label = new RegExp(
    `<label[^>]*\\bfor="([^"]+)"[^>]*>(?:(?!</label>).)*${text}(?:(?!</label>).)*</label>`,
    "s",
  ).exec(html);
  assert.ok(label, `no <label for> carrying ${text}`);
  const id = label[1];
  const control = new RegExp(`<(input|select|textarea)[^>]*\\bid="${id}"`).exec(
    html,
  );
  assert.ok(control, `no control with id="${id}" for ${text}`);
  return html.slice(control.index, html.indexOf(">", control.index) + 1);
}

// An accessible name spelled exactly, on a real button element.
function hasButton(html, name) {
  return new RegExp(
    `<button[^>]*>(?:(?!</button>).)*${name}(?:(?!</button>).)*</button>`,
    "s",
  ).test(html);
}

test("the access screen carries the exact labels and buttons the story automates", () => {
  const emailStep = accessScreen(baseState({ screen: "access", principal: null }));
  const control = labelledControl(emailStep, "Email address");
  assert.match(control, /type="email"/);
  assert.ok(hasButton(emailStep, "Send verification code"));

  const codeStep = accessScreen(
    baseState({
      screen: "access",
      principal: null,
      authStep: "code",
      authEmail: "mei@example.org",
      authMessage: "If this address is eligible, check your inbox for a sign-in code.",
    }),
  );
  labelledControl(codeStep, "Verification code");
  assert.ok(hasButton(codeStep, "Verify and continue"));
  // The neutral message is shown exactly as the auth module returned it.
  assert.ok(
    codeStep.includes(
      "If this address is eligible, check your inbox for a sign-in code.",
    ),
  );
  // The promise is about passwords, not about there being no account.
  assert.ok(emailStep.includes("No password to remember"));
  assert.ok(!/no account/i.test(emailStep));
});

test("no fixed demo code and no phone sign-in appear in the access screens", () => {
  const screens = [
    accessScreen(baseState({ principal: null })),
    accessScreen(baseState({ principal: null, authStep: "code", resendSeconds: 41 })),
    accessScreen(
      baseState({
        principal: null,
        authStep: "code",
        authError: {
          code: "AUTH_INVALID_CODE",
          message: "That code is invalid or has expired. Request a new code.",
        },
      }),
    ),
  ];
  for (const html of screens) {
    assert.ok(!html.includes("246810"), "a fixed demo code is never shown");
    assert.ok(!/demo code/i.test(html));
    assert.ok(!/phone/i.test(html), "there is no phone sign-in option");
    assert.ok(!/type="tel"/.test(html));
    assert.ok(!/one-time code is simulated/i.test(html));
  }
  // The invalid-code failure is its own message, not the neutral send copy.
  assert.ok(/invalid or has expired/i.test(screens[2]));
  // The resend control is disabled while the cooldown runs, and it says so.
  assert.match(screens[1], /<button[^>]*disabled[^>]*data-action="resend-code"|<button[^>]*data-action="resend-code"[^>]*disabled/);
  assert.ok(screens[1].includes("41"));
});

test("an offline visitor reads the last view behind a connection notice", () => {
  const notice = connectionNotice(baseState({ connection: "offline" }));
  assert.ok(notice.length > 0);
  assert.match(notice, /connection/i);
  assert.equal(connectionNotice(baseState({ connection: "online" })), "");
  const offline = accessScreen(
    baseState({
      principal: null,
      authStep: "code",
      authError: { code: "OFFLINE", message: "The demo cannot reach the server. Check the connection." },
    }),
  );
  assert.match(offline, /cannot reach the server/i);
});

test("an unreachable server gets its own screen, not the sign-in form", () => {
  const html = unreachableScreen(
    baseState({
      session: "unknown",
      principal: null,
      connection: "offline",
      error: {
        code: "OFFLINE",
        message: "The demo cannot reach the server. Check the connection.",
      },
    }),
  );
  assert.match(html, /cannot reach the server/i);
  assert.match(html, /data-action="retry-connection"/);
  // It must not read as a sign-out, and it must not ask for the address again.
  assert.ok(!/Sign in with your email/.test(html));
  assert.ok(!/Send verification code/.test(html));
  assert.ok(!/<input[^>]*type="email"/.test(html));
  assert.match(html, /not signed out/i);
  assert.ok(!/data-case-action/.test(html));
});

test("a half-typed code survives a re-render, and the countdown has a stable hook", () => {
  const html = accessScreen(
    baseState({
      principal: null,
      session: "none",
      authStep: "code",
      authEmail: "mei@example.org",
      authCode: "12",
      resendSeconds: 41,
    }),
  );
  // The field renders what is being typed, not a blank: a re-render arriving
  // between a keystroke and pressing Verify must not empty a required field.
  const field = labelledControl(html, "Verification code");
  assert.match(field, /value="12"/);
  // The countdown is patched in place by the tick, so it needs a stable hook.
  assert.match(html, /data-role="resend-countdown"/);
  const countdown = /<span[^>]*data-role="resend-countdown"[^>]*>([^<]*)</.exec(html);
  assert.ok(countdown, "the countdown element is a single stable element");
  assert.match(countdown[1], /41 seconds/);
  // The element is present even at zero, so the tick has something to write to.
  assert.match(
    accessScreen(baseState({ principal: null, session: "none", authStep: "code" })),
    /data-role="resend-countdown"/,
  );
  // And a value from the visitor is escaped like any other.
  assert.match(
    labelledControl(
      accessScreen(
        baseState({ principal: null, session: "none", authStep: "code", authCode: '"><script>' }),
      ),
      "Verification code",
    ),
    /value="&quot;&gt;&lt;script&gt;"/,
  );
});

test("the code step names the address it is bound to", () => {
  const html = accessScreen(
    baseState({
      principal: null,
      session: "none",
      authStep: "code",
      authEmail: "mei@example.org",
    }),
  );
  assert.ok(html.includes("mei@example.org"));
  assert.match(html, /Signing in as/);
  assert.match(html, /data-action="back-to-email"/);
  // An address is the visitor's own input, never a claim about the roster.
  assert.ok(!/registered|on file|approved address/i.test(html));
  // And with nothing bound yet, nothing is claimed.
  assert.ok(
    !/Signing in as/.test(
      accessScreen(baseState({ principal: null, session: "none", authStep: "code" })),
    ),
  );
});

test("applicant text is escaped everywhere it is rendered", () => {
  const nasty = '<script>alert("x")</script>';
  const state = baseState({
    screen: "progress",
    selectedCaseId: "case-a",
    savedCase: caseRecord({
      stage: "received",
      reference: nasty,
      answers: { firstName: nasty, service: "Drop-off" },
      history: [
        { id: "e1", action: "SUBMIT", message: nasty, createdAt: "2026-01-02T15:04:05Z" },
      ],
    }),
    draftAnswers: { firstName: nasty },
  });
  for (const html of [
    progressScreen(state),
    referenceScreen(state),
    intakeScreen({ ...state, screen: "intake", formStep: 2 }),
    applicationsScreen({ ...state, cases: [state.savedCase], lookup: nasty }),
  ]) {
    assert.ok(!html.includes("<script>"), "raw markup never reaches the page");
    assert.ok(html.includes("&lt;script&gt;"));
  }
});

test("My applications lists owned cases, looks up only those, and starts one explicitly", () => {
  const cases = [
    caseRecord({ id: "case-a", reference: "VT-AB2C-DE3F", stage: "draft" }),
    caseRecord({
      id: "case-b",
      reference: "VT-KK44-MM55",
      stage: "reviewing",
      revision: 9,
    }),
  ];
  const html = applicationsScreen(baseState({ cases }));
  assert.ok(html.includes("VT-AB2C-DE3F"));
  assert.ok(html.includes("VT-KK44-MM55"));
  assert.ok(html.includes(describeStage("draft").label));
  assert.ok(html.includes(describeStage("reviewing").label));
  assert.ok(hasButton(html, "Start a new application"));
  assert.match(html, /data-action="start-application"/);
  assert.match(html, /data-action="open-case"[^>]*data-case-id="case-b"|data-case-id="case-b"[^>]*data-action="open-case"/);
  labelledControl(html, "Application ID");

  const found = applicationsScreen(baseState({ cases, lookup: " vt-kk44-mm55 " }));
  assert.ok(found.includes("VT-KK44-MM55"));
  assert.ok(!found.includes("VT-AB2C-DE3F"));
  assert.ok(!/we could not find/i.test(found));

  const missing = applicationsScreen(
    baseState({ cases, lookup: "VT-ZZZZ-ZZZZ" }),
  );
  assert.match(missing, /we could not find/i);
  // A reference that is not this person's reveals nothing at all.
  assert.ok(!missing.includes("VT-AB2C-DE3F"));
  assert.ok(!missing.includes("VT-KK44-MM55"));
  assert.ok(!/registered|email address on file/i.test(missing));
});

test("the reference card can be copied and printed and starts the form", () => {
  const html = referenceScreen(
    baseState({ screen: "reference", savedCase: caseRecord() }),
  );
  assert.ok(html.includes("VT-AB2C-DE3F"));
  assert.match(html, /data-action="copy-reference"/);
  assert.match(html, /data-action="print-reference"/);
  assert.match(html, /data-action="continue-intake"/);
  assert.ok(!/data-case-action/.test(html));
});

test("intake keeps residence and mailing separate, explains screening and offers fictional details", () => {
  const state = baseState({
    screen: "intake",
    formStep: 1,
    savedCase: caseRecord(),
    draftAnswers: {
      residenceCity: "Philadelphia",
      residenceState: "PA",
      rideshare: "yes",
      other: "yes",
      stocks: "no",
    },
  });
  const screening = intakeScreen(state);
  assert.ok(screening.includes("City of residence"));
  assert.ok(screening.includes("State of residence"));
  assert.ok(!screening.includes("Mailing address"));
  assert.match(screening, /current service scope|service limitation/i);
  assert.match(screening, /data-action="fill-fictional"/);
  assert.match(screening, /data-action="regenerate-fictional"/);

  const details = intakeScreen({ ...state, formStep: 2 });
  assert.ok(details.includes("Mailing address"));
  assert.ok(!details.includes("City of residence"));

  const check = intakeScreen({ ...state, formStep: 3, draftAnswers: { ...state.draftAnswers, other: "no" } });
  assert.match(check, /data-case-action="SUBMIT"/);
});

test("the save state is named in words and a failed save keeps a retry", () => {
  assert.match(saveStatus(baseState({ saveState: "unsaved", dirty: true })), /unsaved/i);
  assert.match(saveStatus(baseState({ saveState: "saving" })), /saving/i);
  assert.match(saveStatus(baseState({ saveState: "saved" })), /saved/i);
  const failed = saveStatus(
    baseState({
      saveState: "failed",
      dirty: true,
      retryable: true,
      error: { code: "OFFLINE", message: "The demo cannot reach the server. Check the connection." },
    }),
  );
  assert.match(failed, /not saved/i);
  assert.match(failed, /data-action="retry-action"/);
});

test("the conflict form offers both choices and neither is automatic", () => {
  const html = conflictForm(
    baseState({
      savedCase: caseRecord({ revision: 4, answers: { firstName: "Server" } }),
      draftAnswers: { firstName: "Mine" },
      dirty: true,
      editBaseRevision: 2,
      conflict: { code: "REMOTE_CHANGED", baseRevision: 2, serverRevision: 4 },
    }),
  );
  assert.match(html, /data-action="reconcile-mine"/);
  assert.match(html, /data-action="reconcile-server"/);
  assert.ok(html.includes("Mine"));
  assert.ok(html.includes("Server"));
  assert.ok(!/data-case-action/.test(html), "reconciliation never saves by itself");
  assert.equal(conflictForm(baseState()), "");
});

test("progress names the stage, shows client history and answers a document request", () => {
  const state = baseState({
    screen: "progress",
    savedCase: caseRecord({
      stage: "preparing",
      revision: 6,
      intakeVerified: true,
      answers: { firstName: "Mei", service: "Drop-off", language: "English" },
      requests: [
        {
          id: "req-1",
          caseId: "case-a",
          title: "2025 mileage record",
          message: "Please provide your 2025 mileage record.",
          status: "open",
        },
      ],
      history: [
        { id: "e1", action: "SUBMIT", message: "Application received.", createdAt: "2026-01-02T15:04:05Z" },
      ],
    }),
  });
  const html = progressScreen(state);
  assert.ok(html.includes(describeStage("preparing").label));
  assert.ok(html.includes(describeStage("preparing").clientMessage));
  assert.ok(html.includes("Application received."));
  assert.ok(html.includes("2025 mileage record"));
  const button = /<button[^>]*data-case-action="RESPOND_DOCUMENT"[^>]*>/.exec(html);
  assert.ok(button, "the sample response uses the canonical action name");
  assert.match(button[0], /data-request-id="req-1"/);
  // A settled request offers no second response.
  const settled = progressScreen({
    ...state,
    savedCase: {
      ...state.savedCase,
      requests: [{ ...state.savedCase.requests[0], status: "awaiting_verification" }],
      documents: [
        { id: "d1", requestId: "req-1", filename: "demo-mileage-record-2025.pdf", source: "client" },
      ],
    },
  });
  assert.ok(!/data-case-action="RESPOND_DOCUMENT"/.test(settled));
  assert.ok(settled.includes("demo-mileage-record-2025.pdf"));
});

test("review progress is plain and never carries findings", () => {
  for (const stage of [
    "review_ready",
    "reviewing",
    "corrections_required",
    "review_approved",
  ]) {
    const html = progressScreen(
      baseState({
        screen: "progress",
        savedCase: caseRecord({ stage, revision: 8, intakeVerified: true }),
      }),
    );
    assert.ok(html.includes(describeStage(stage).label), stage);
    assert.ok(html.includes(describeStage(stage).clientMessage), stage);
    for (const word of ["findings", "refund", "routing", "deposit", "$"])
      assert.ok(!html.toLowerCase().includes(word), `${stage} must not say ${word}`);
  }
});

test("the setup-needed screen explains the configuration and holds no secrets", () => {
  const html = setupNeeded();
  assert.match(html, /\.env\.local/);
  assert.match(html, /SUPABASE_URL/);
  assert.match(html, /SUPABASE_PUBLISHABLE_KEY/);
  assert.ok(!/eyJ|secret|service_role/i.test(html));
  assert.ok(!/data-case-action/.test(html));
});

test("the presenter landing is read-only until the staff screens arrive", () => {
  const cases = [
    caseRecord({ id: "case-a", reference: "VT-AB2C-DE3F", stage: "preparing", preparerId: "person-1" }),
  ];
  const state = baseState({
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    screen: "staff",
    cases,
    people: [
      { id: "person-1", name: "Alex", capabilities: ["prepare"] },
      { id: "person-2", name: "Morgan", capabilities: ["review"] },
    ],
    selectedPersonId: "person-1",
  });
  const html = staffScreen(state);
  assert.ok(html.includes("VT-AB2C-DE3F"));
  assert.ok(html.includes(describeStage("preparing").label));
  assert.ok(html.includes("Alex"));
  assert.match(html, /Staff work screens arrive next/);
  assert.ok(!/data-case-action/.test(html), "no workflow buttons for staff yet");
  assert.match(html, /data-action="select-person"[^>]*|name="personId"/);
  assert.ok(renderStaffLanding(cases).includes("VT-AB2C-DE3F"));
  // The applicant never sees the persona selector.
  const clientPage = page(baseState(), applicationsScreen(baseState()));
  assert.ok(!/data-action="select-person"/.test(clientPage));
  assert.ok(!clientPage.includes("Morgan"));
});

test("the brand is ViTally, attributed to PCDC, for tax year 2025", () => {
  const html = page(baseState(), applicationsScreen(baseState()));
  assert.ok(html.includes("ViTally"));
  assert.ok(html.includes("PCDC"));
  assert.ok(html.includes("2025"));
  assert.match(html, /data-action="sign-out"/);
});
