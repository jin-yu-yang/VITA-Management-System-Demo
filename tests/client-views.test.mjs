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
  connectionNotice,
  unreachableScreen,
  dialog,
} from "../src/views.mjs";
import { describeStage } from "../src/domain.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";
import { stepsFor, findQuestion } from "../src/intake-catalogue.mjs";
import { invalidAnswers, stepStatus } from "../src/intake-form.mjs";

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

test("a dialog can always take the keyboard, whatever its body holds", () => {
  // The help dialog's body is prose: its only control is the close button. The
  // container carries tabindex="-1" so there is somewhere to put the keyboard
  // even for a future dialog that has neither.
  const help = dialog(baseState({ dialog: "help" }));
  assert.match(help, /<section class="modal"[^>]*tabindex="-1"/);
  assert.match(help, /role="dialog"/);
  assert.match(help, /aria-modal="true"/);
  assert.match(help, /class="close-btn"/);
  assert.equal(dialog(baseState({ dialog: null })), "");
  // Every dialog this module renders gets the same container.
  for (const name of ["help", "regenerate", "print"]) {
    const html = dialog(baseState({ dialog: name, savedCase: caseRecord() }));
    assert.match(html, /<section class="modal"[^>]*tabindex="-1"/, name);
  }
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

test("the intake rail marks the current step and gives the office contact", () => {
  const state = { ...baseState(), screen: "intake", savedCase: { id: "c1", reference: "VT-AAAA-AAAA", stage: "draft", answers: {}, revision: 1 }, draftAnswers: {}, formStep: 1 };
  const html = intakeScreen(state);
  assert.match(html, /<li class="active" aria-current="step">/);
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
  assert.match(html, /class="sidebar-help"[\s\S]*class="office-contact"[\s\S]*tel:\+12159226156/);
  // Save & exit lives in the top bar now; the form keeps Back and Continue.
  assert.doesNotMatch(html, /data-action="save-exit"/);
  assert.match(html, /STEP 2 OF 4/);
});

test("sign-in and progress point to the office by phone and email", () => {
  assert.match(accessScreen({ ...baseState(), authStep: "email" }), /class="office-contact"/);
  const progress = progressScreen({ ...baseState(), screen: "progress", savedCase: { id: "c1", reference: "VT-AAAA-AAAA", stage: "received", answers: { firstName: "Mei" }, requests: [], documents: [], history: [] } });
  assert.match(progress, /class="help-card"[\s\S]*class="office-contact"/);
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

test("two open requests render two distinct simulate-failure boxes", () => {
  // A shared id would make both labels address the first box, so clicking the
  // second request's label would tick the first request's checkbox.
  const requests = ["req-1", "req-2"].map((id) => ({
    id,
    caseId: "case-a",
    title: `Document ${id}`,
    message: "Please add the fictional sample.",
    status: "open",
  }));
  const html = progressScreen(
    baseState({
      screen: "progress",
      savedCase: caseRecord({
        stage: "preparing",
        revision: 6,
        intakeVerified: true,
        requests,
      }),
    }),
  );
  const boxes = [
    ...html.matchAll(/<input[^>]*data-action="toggle-upload-failure"[^>]*>/g),
  ].map(([tag]) => tag);
  assert.equal(boxes.length, 2);
  const ids = boxes.map((tag) => /id="([^"]+)"/.exec(tag)[1]);
  assert.equal(new Set(ids).size, 2, "the two boxes carry the same id");
  for (const [index, id] of ids.entries()) {
    assert.ok(id.includes(requests[index].id), "the id names its request");
    assert.match(boxes[index], /data-request-id="req-[12]"/);
    assert.ok(
      html.includes(`<label class="checkbox-row small" for="${id}">`),
      "each label addresses its own box",
    );
  }
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

test("a presenter gets the persona selector, the board and one case workspace", () => {
  const cases = [
    caseRecord({ id: "case-a", reference: "VT-AB2C-DE3F", stage: "preparing", preparerId: "person-1" }),
  ];
  const staffState = (overrides = {}) =>
    baseState({
      principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
      screen: "staff",
      cases,
      people: [
        { id: "person-1", name: "Alex", capabilities: ["prepare"] },
        { id: "person-2", name: "Morgan", capabilities: ["review"] },
      ],
      selectedPersonId: "person-1",
      boardFilters: { status: "preparation" },
      ...overrides,
    });
  const board = staffScreen(staffState());
  assert.ok(board.includes("VT-AB2C-DE3F"));
  assert.ok(board.includes(describeStage("preparing").label));
  assert.ok(board.includes("Alex"), "the preparer is named, not an id");
  assert.ok(!board.includes("person-1</"), "no person id is shown as a name");
  assert.match(board, /data-action="select-person"/);
  assert.match(board, /data-action="open-case" data-case-id="case-a"/);

  // Opening a case is the same screen function, with the workspace inside it.
  const workspace = staffScreen(
    staffState({
      screen: "staff-case",
      savedCase: {
        ...cases[0],
        participants: ["person-1"],
        requests: [],
        documents: [],
        followups: [],
        reviews: [],
        internalHistory: [],
      },
    }),
  );
  assert.match(workspace, /Preparation milestones/);
  assert.match(workspace, /data-case-action="SUBMIT_REVIEW"/);
  assert.match(workspace, /data-action="open-board"/);
  assert.match(workspace, /data-action="select-person"/);

  // The applicant never sees the persona selector or a staff screen.
  const clientPage = page(baseState(), applicationsScreen(baseState()));
  assert.ok(!/data-action="select-person"/.test(clientPage));
  assert.ok(!clientPage.includes("Morgan"));
  assert.ok(!/data-case-action="CLAIM_/.test(clientPage));
});

test("the staff workspace announces a failure once, beside the work", () => {
  const state = baseState({
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    screen: "staff-case",
    error: {
      code: "CONFLICT",
      message: "Someone else changed this case. The newest version is shown — check it and try again.",
    },
    people: [{ id: "person-1", name: "Alex", capabilities: ["prepare"] }],
    selectedPersonId: "person-1",
    savedCase: {
      ...caseRecord({ id: "case-a", stage: "preparing", preparerId: "person-1" }),
      participants: ["person-1"],
      requests: [],
      documents: [],
      followups: [],
      reviews: [],
      internalHistory: [],
    },
  });
  const html = page(state, staffScreen(state));
  assert.equal(
    html.match(/Someone else changed this case/g).length,
    1,
    "the page-wide banner steps aside for the in-place notice",
  );
  assert.match(html, /data-action="dismiss-error"/);
  // The board keeps the page-wide banner, which is the only notice there.
  const onBoard = { ...state, screen: "staff" };
  assert.match(page(onBoard, staffScreen(onBoard)), /problem-banner/);
});

test("the brand is ViTally, attributed to PCDC, for tax year 2025", () => {
  const html = page(baseState(), applicationsScreen(baseState()));
  assert.ok(html.includes("ViTally"));
  assert.ok(html.includes("PCDC"));
  assert.ok(html.includes("2025"));
  assert.match(html, /data-action="sign-out"/);
});

test("the progress page shows the client number after the Application ID", () => {
  const record = { id: "c1", reference: "VT-AAAA-AAAA", stage: "received", answers: { firstName: "Mei" }, requests: [], documents: [], history: [] };
  const numbered = progressScreen({ ...baseState(), screen: "progress", savedCase: { ...record, clientNumber: 93 } });
  const pill = numbered.match(/<div class="id-pill">[\s\S]*?<\/div><\/div>(?=<\/div>)/)[0];
  assert.ok(pill.includes("<small>CLIENT NUMBER</small><strong>#093</strong>"));
  assert.ok(pill.indexOf("VT-AAAA-AAAA") < pill.indexOf("#093"));
  const plain = progressScreen({ ...baseState(), screen: "progress", savedCase: { ...record, clientNumber: null } });
  assert.ok(!plain.includes("CLIENT NUMBER"));
});

test("my applications shows the client number on submitted rows only", () => {
  const html = applicationsScreen(baseState({
    cases: [
      caseRecord({ id: "case-a", reference: "VT-AB2C-DE3F", stage: "received", clientNumber: 93 }),
      caseRecord({ id: "case-b", reference: "VT-KK44-MM55", stage: "draft", clientNumber: null }),
    ],
  }));
  const rows = html.split('<button class="application-row"').slice(1);
  assert.match(rows[0], /<span class="application-id"><span class="application-reference">VT-AB2C-DE3F<\/span><span class="application-number">#093<\/span><\/span>/);
  assert.ok(!rows[1].includes("application-number"));
});

test("a version-2 chip counts the revealed invalid answers of visible questions", () => {
  const v2 = (overrides = {}) =>
    baseState({ savedCase: { id: "c2", intakeVersion: 2, answers: {} }, revealed: [], ...overrides });
  const text = (html) => html.replace(/<[^>]+>/g, "").trim();
  const one = saveStatus(v2({ saveState: "saved", draftAnswers: { email: "a@" }, revealed: ["email"] }));
  assert.equal(text(one), "1 answer needs checking");
  assert.match(one, /class="save-chip checking" role="status"/);
  const two = saveStatus(
    v2({ saveState: "idle", draftAnswers: { email: "a@", addr_zip: "191" }, revealed: ["email", "addr_zip"] }),
  );
  assert.equal(text(two), "2 answers need checking");
  // Typed but not revealed, and revealed but hidden, are never counted.
  assert.equal(text(saveStatus(v2({ saveState: "saved", draftAnswers: { email: "a@" } }))), "Saved");
  assert.equal(
    text(saveStatus(v2({ saveState: "saved", draftAnswers: { marital_status: "single", sp_dob: "1990-02-30" }, revealed: ["sp_dob"] }))),
    "Saved",
  );
  // A revealed id whose value is valid again counts for nothing.
  assert.equal(text(saveStatus(v2({ saveState: "idle", draftAnswers: { email: "a@b" }, revealed: ["email"] }))), "Up to date");
  // Saving, Failed and Unsaved come first.
  const shown = { draftAnswers: { email: "a@" }, revealed: ["email"] };
  assert.match(text(saveStatus(v2({ ...shown, saveState: "saving" }))), /Saving/);
  assert.match(text(saveStatus(v2({ ...shown, saveState: "failed", dirty: true }))), /Not saved/);
  assert.equal(text(saveStatus(v2({ ...shown, saveState: "unsaved", dirty: true }))), "Unsaved changes");
  // Version 1 never shows it, whatever the state holds.
  assert.equal(
    text(saveStatus(baseState({ saveState: "saved", savedCase: { id: "c1", answers: {} }, draftAnswers: { email: "a@" }, revealed: ["email"] }))),
    "Saved",
  );
});

// ---------------------------------------------------------------------------
// Version 2: the nine-step form (spec 2026-09-30 §3)
// ---------------------------------------------------------------------------

const v2Case = (overrides = {}) =>
  caseRecord({ id: "case-v2", reference: "VT-GJPY-JAY9", intakeVersion: 2, answers: {}, contact: null, ...overrides });
const v2State = (overrides = {}) =>
  baseState({
    screen: "intake",
    selectedCaseId: "case-v2",
    savedCase: v2Case(),
    draftAnswers: makeSampleAnswers({ version: 2 }),
    formStep: 0,
    visitedSteps: [],
    revealed: [],
    ...overrides,
  });
const without = (answers, ...ids) =>
  Object.fromEntries(Object.entries(answers).filter(([id]) => !ids.includes(id)));
const railOf = (html) => {
  const start = html.indexOf('<ol class="rail"');
  assert.ok(start >= 0, "the rail is rendered");
  return html.slice(start, html.indexOf("</ol>", start));
};
const railStatus = (html, n) => {
  const found = new RegExp(`<span id="rail-step-${n}-status" class="rail-status is-(\\w+)">([^<]*)</span>`).exec(html);
  assert.ok(found, `rail-step-${n}-status is rendered`);
  return { key: found[1], text: found[2] };
};
const railLink = (html, n) => {
  const rail = railOf(html);
  const at = rail.indexOf(`data-step="${n}"`);
  const start = rail.lastIndexOf("<button", at);
  return rail.slice(start, rail.indexOf("</button>", at) + "</button>".length);
};
const plain = (html) => html.replace(/<[^>]+>/g, "").trim();
const v2Submit = (html) => {
  const found = /<button[^>]*data-case-action="SUBMIT"[^>]*>/.exec(html);
  assert.ok(found, "step 9 has Submit");
  return found[0];
};
const titles = stepsFor(2).map((step) => step.title.en);
const escText = (text) => text.replace(/&/g, "&amp;").replace(/'/g, "&#39;");

test("intakeScreen dispatches on intakeVersion: version 1 keeps its four steps", () => {
  for (const savedCase of [caseRecord(), caseRecord({ intakeVersion: 1 })]) {
    const html = intakeScreen(baseState({ screen: "intake", savedCase, formStep: 0 }));
    assert.match(html, /<form id="intake-form">/);
    assert.match(html, /STEP 1 OF 4/);
    assert.doesNotMatch(html, /intake-v2-form/);
    assert.doesNotMatch(html, /rail-step-/);
  }
  const v2 = intakeScreen(v2State());
  assert.doesNotMatch(v2, /id="intake-form"/);
  assert.doesNotMatch(v2, /OF 4/);
});

test.todo("a version-2 draft gets the nine-step form, titled from the catalogue — rewritten in Task 7");

test.todo("the rail: nine go-step links, the current one marked, a fixed status per step — rewritten in Task 7");

test("the rail counts a revealed invalid answer on a visited step", () => {
  const draftAnswers = { ...makeSampleAnswers({ version: 2 }), email: "a@" };
  const html = intakeScreen(v2State({ formStep: 3, draftAnswers, visitedSteps: [1], revealed: ["email"] }));
  assert.deepEqual(railStatus(html, 1), { key: "needs", text: "Needs answers" });
  assert.deepEqual(
    railStatus(html, 1),
    { key: stepStatus(1, draftAnswers, [1], new Set(["email"])).key, text: "Needs answers" },
  );
});

test.todo("show-if: the spouse questions render only for a married client — rewritten in Task 7");

test("Needs an answer shows on the current step only once it was visited", () => {
  const fresh = intakeScreen(v2State({ formStep: 1, draftAnswers: {} }));
  assert.doesNotMatch(fresh, /Needs an answer/);
  assert.doesNotMatch(fresh, /is-missing/);
  const again = intakeScreen(v2State({ formStep: 1, draftAnswers: {}, visitedSteps: [1] }));
  assert.match(again, /<p id="field-client-tp_first_name-note" class="q-note is-missing" aria-live="polite">Needs an answer<\/p>/);
  // Every rendered question is a data-q wrapper Task 5 reads as renderedIds.
  for (const id of ["tp_first_name", "tp_dob", "tp_phone", "email", "addr_zip"]) assert.match(again, new RegExp(`data-q="${id}"`));
});

test("a revealed error shows on an unvisited step, in the note and the rail", () => {
  const draftAnswers = { ...makeSampleAnswers({ version: 2 }), email: "a@" };
  const html = intakeScreen(v2State({ formStep: 1, draftAnswers, visitedSteps: [], revealed: ["email"] }));
  assert.match(html, /<p id="field-client-email-note" class="q-note is-invalid" aria-live="polite">Enter a valid email address\.<\/p>/);
  assert.deepEqual(railStatus(html, 1), { key: "needs", text: "Needs answers" });
  // Not revealed: nothing shows yet.
  const quiet = intakeScreen(v2State({ formStep: 1, draftAnswers, visitedSteps: [], revealed: [] }));
  assert.doesNotMatch(quiet, /is-invalid/);
  assert.deepEqual(railStatus(quiet, 1), { key: "done", text: "Done" });
});

test.todo("step 9 lists what is still to answer and what needs a change, each linking to its step — rewritten in Task 7");

test.todo("step 9's missing list comes from the draft alone, never from record.contact — rewritten in Task 7");

test.todo("Submit waits for no missing, no invalid and the confirmation — rewritten in Task 7");

test("the version-2 chip: revealed invalid answers need checking, in every quiet save state", () => {
  const chip = (overrides) => plain(saveStatus(v2State(overrides)));
  const sample = makeSampleAnswers({ version: 2 });
  const one = { draftAnswers: { ...sample, email: "a@" }, revealed: ["email"] };
  assert.equal(chip({ ...one, saveState: "saved" }), "1 answer needs checking");
  assert.equal(chip({ ...one, saveState: "idle" }), "1 answer needs checking");
  assert.equal(
    chip({ saveState: "saved", draftAnswers: { ...sample, email: "a@", tp_dob: "1984-02-30" }, revealed: ["email", "tp_dob"] }),
    "2 answers need checking",
  );
  assert.equal(chip({ saveState: "saved", draftAnswers: { ...sample, email: "a@" }, revealed: [] }), "Saved");
  assert.equal(chip({ ...one, saveState: "unsaved", dirty: true }), "Unsaved changes");
  // Version 1 reads exactly as today.
  const v1 = (saveState) => plain(saveStatus(baseState({ saveState, savedCase: caseRecord(), ...one })));
  assert.equal(v1("saved"), "Saved");
  assert.equal(v1("idle"), "Up to date");
});

test("with the senior wording chosen, questions use it", () => {
  const html = intakeScreen(
    v2State({ formStep: 1, draftAnswers: { ...makeSampleAnswers({ version: 2 }), form_version: "senior" } }),
  );
  assert.ok(html.includes(escText(findQuestion(2, "tp_first_name").wording.senior.en)));
  assert.ok(!html.includes(`>${findQuestion(2, "tp_first_name").wording.general.en}<`));
  const general = intakeScreen(v2State({ formStep: 1 }));
  assert.ok(general.includes(`>${findQuestion(2, "tp_first_name").wording.general.en}<`));
});

test.todo("a submitted version-2 case shows its answers read-only, grouped by step — rewritten in Task 7");

test("the version-2 conflict screen compares sendable values and labels rows by wording", () => {
  const sample = makeSampleAnswers({ version: 2 });
  const member = sample.hh[0];
  const html = conflictForm(
    v2State({
      savedCase: v2Case({
        revision: 4,
        answers: { ...without(sample, "best_contact_time", "email"), tp_first_name: "Mei", hh: [member] },
        contact: { phone: sample.tp_phone, spousePhone: null, bestContactTime: ["weekday_morning"], bestContactNote: sample.best_contact_note },
      }),
      draftAnswers: {
        ...sample,
        tp_first_name: "Mei ",
        email: null,
        best_contact_time: ["weekday_evening", "weekend"],
        hh: [member, { member_id: "fedcba9876543210fedcba9876543210", first_name: "An", last_name: "Chen" }],
      },
      dirty: true,
      editBaseRevision: 2,
      conflict: { code: "REMOTE_CHANGED", baseRevision: 2, serverRevision: 4 },
    }),
  );
  const rows = [...html.matchAll(/<tr><th scope="row">([^<]*)<\/th><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/g)].map((m) => m.slice(1));
  assert.deepEqual(
    rows.map(([label]) => label),
    [findQuestion(2, "best_contact_time").wording.general.en, findQuestion(2, "hh").wording.general.en],
  );
  assert.match(rows[0][1], /Weekday evenings, Weekends/);
  assert.match(rows[0][2], /Weekday mornings/);
  assert.match(rows[1][1], /Lin Chen · Son \/ Daughter · born Mar 14, 2015 · 12 months[\s\S]*An Chen/);
  assert.doesNotMatch(rows[1][2], /An Chen/);
  assert.match(html, /data-action="reconcile-mine"/);
  assert.match(html, /data-action="reconcile-server"/);
});

test("the progress page labels service and language codes, for both versions", () => {
  const progress = (savedCase) => progressScreen(baseState({ screen: "progress", savedCase }));
  const v2 = progress(v2Case({ stage: "received", answers: { service: "drop_off", language: "english", tp_first_name: "Mei" } }));
  assert.match(v2, /<span>Service<\/span><strong>Drop-off<\/strong>/);
  assert.match(v2, /<span>Language<\/span><strong>English<\/strong>/);
  assert.match(v2, /Hello, Mei\./);
  const v1 = progress(caseRecord({ stage: "received", answers: { service: "Drop-off", language: "Mandarin" } }));
  assert.match(v1, /<span>Service<\/span><strong>Drop-off<\/strong>/);
  assert.match(v1, /<span>Language<\/span><strong>Mandarin<\/strong>/);
});
