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
import { stepsFor, findQuestion, findSubstep, wording } from "../src/intake-catalogue.mjs";
import { formatAnswer, visibleSubsteps, substepStatus, stepRollup } from "../src/intake-form.mjs";
import { cardsFor } from "../src/document-cards.mjs";
import { intakeFormV2, docCard } from "../src/intake-views.mjs";
import { icon } from "../src/ui.mjs";

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
// Version 2: sub-steps, the rail tree, Documents, Review & submit
// (spec 2026-10-04 §2–§6)
// ---------------------------------------------------------------------------

const v2Case = (overrides = {}) =>
  caseRecord({ id: "case-v2", reference: "VT-GJPY-JAY9", intakeVersion: 2, answers: {}, contact: null, documentCards: [], ...overrides });
const v2State = (overrides = {}) =>
  baseState({
    screen: "intake",
    selectedCaseId: "case-v2",
    savedCase: v2Case(),
    draftAnswers: makeSampleAnswers({ version: 2 }),
    formSubstep: "before.ready",
    visitedSubsteps: [],
    revealed: [],
    returnToSummary: false,
    ...overrides,
  });
const without = (answers, ...ids) =>
  Object.fromEntries(Object.entries(answers).filter(([id]) => !ids.includes(id)));
const plain = (html) => html.replace(/<[^>]+>/g, "").trim();
const escText = (text) => text.replace(/&/g, "&amp;").replace(/'/g, "&#39;");
const reEsc = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sample = () => makeSampleAnswers({ version: 2 });
const TODAY = new Date(2026, 9, 4, 12);
const chrome = { saveStatus, conflictForm, fictionalTools: "", today: TODAY };
const form = (overrides) => intakeFormV2(v2State(overrides), chrome);

// One step's <li>, up to the next step (its sub-steps included).
const railStepOf = (html, id) => {
  const start = html.search(new RegExp(`<li class="rail-step[^"]*" data-step-id="${id}">`));
  assert.ok(start >= 0, `rail step ${id} is rendered`);
  const next = html.indexOf(`<li class="rail-step`, start + 1);
  return html.slice(start, next < 0 ? html.indexOf("</nav>", start) : next);
};
const markOf = (html, spanId) => {
  const found = new RegExp(`<span id="${reEsc(spanId)}" class="rail-status is-(\\w+)">([^<]*)</span>`).exec(html);
  assert.ok(found, `${spanId} is rendered`);
  return { key: found[1], text: found[2] };
};
const subLinkOf = (html, id) => {
  const found = new RegExp(`<button type="button" class="rail-sublink" data-action="go-substep" data-substep="${reEsc(id)}"[^>]*>[\\s\\S]*?</button>`).exec(html);
  assert.ok(found, `the rail links to ${id}`);
  return found[0];
};
const slug = (slot) => slot.replace(/\./g, "-");
const cardOf = (html, slot) =>
  new RegExp(`<article class="doc-card" id="doc-${reEsc(slug(slot))}" data-slot="${reEsc(slot)}" tabindex="-1">[\\s\\S]*?</article>`).exec(html)?.[0];
const submitOf = (html) => {
  const found = /<button[^>]*data-case-action="SUBMIT"[^>]*>/.exec(html);
  assert.ok(found, "review.submit has Submit");
  return found[0];
};
const MEMBER = "000000000000000000000000000003e9"; // the sample's first household member

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

test("a version-2 draft gets the sub-step page: form, overline, title and count", () => {
  const html = intakeScreen(v2State({ formSubstep: "about.address" }));
  assert.match(html, /<form id="intake-v2-form" novalidate data-substep="about\.address">/);
  assert.match(html, /<span class="overline">STEP 1 OF 9 · ABOUT YOU<\/span><h1>Mailing address<\/h1><p class="substep-count">2 of 5<\/p>/);
  // The office card stays under the rail, and the chrome comes from client-views.
  assert.match(html, /class="sidebar-help"/);
  assert.match(html, /Fill fictional details/);
  assert.match(html, /<span class="save-chip/);
  // Before you start has no number; an ampersand in a title is escaped.
  assert.match(intakeScreen(v2State()), /<span class="overline">BEFORE YOU START<\/span><h1>Before you start<\/h1><p class="substep-count">1 of 3<\/p>/);
  assert.match(
    intakeScreen(v2State({ formSubstep: "expenses.other" })),
    /<span class="overline">STEP 4 OF 9 · EXPENSES &amp; LIFE EVENTS<\/span><h1>Other expenses<\/h1><p class="substep-count">2 of 3<\/p>/,
  );
  // A hidden sub-step resolves to the next visible one; an unknown id to the first.
  assert.match(intakeScreen(v2State({ formSubstep: "about.spouse" })), /<form id="intake-v2-form" novalidate data-substep="about\.situation">/);
  assert.match(intakeScreen(v2State({ formSubstep: "nowhere.at_all" })), /<form id="intake-v2-form" novalidate data-substep="before\.ready">/);
  // The senior titles are used when chosen.
  const senior = intakeScreen(v2State({ formSubstep: "about.address", draftAnswers: { ...sample(), form_version: "senior" } }));
  assert.ok(senior.includes(`<h1>${escText(findSubstep("about.address").title.senior.en)}</h1>`));
});

test("the rail tree: the current step expanded, the others collapsed, each with its toggle, link and marks", () => {
  const draftAnswers = sample();
  const visitedSubsteps = ["before.ready", "before.service", "before.language", "about.you"];
  const html = intakeScreen(v2State({ formSubstep: "about.address", visitedSubsteps }));
  assert.match(html, /<nav class="rail-nav" aria-label="Form steps"><ol id="rail-tree" class="rail-tree">/);
  const steps = stepsFor(2);
  assert.equal((html.match(/<li class="rail-step/g) ?? []).length, steps.length);
  for (const step of steps) {
    const item = railStepOf(html, step.id);
    const expanded = step.id === "about";
    assert.match(
      item,
      new RegExp(`<button type="button" class="rail-toggle" data-action="toggle-rail-step" data-step-id="${step.id}" aria-expanded="${expanded}" aria-controls="rail-subs-${step.id}">`),
    );
    assert.ok(item.includes(`<span class="sr-only">Show or hide the parts of ${escText(step.title.en)}</span>`));
    assert.match(item, new RegExp(`<ol id="rail-subs-${step.id}" class="rail-subs"${expanded ? "" : " hidden"}>`));
    // The step's mark is its roll-up.
    const rollup = stepRollup(step.id, { answers: draftAnswers, visited: visitedSubsteps, revealed: new Set(), cards: cardsFor(draftAnswers, []) });
    assert.deepEqual(markOf(item, `rail-step-${step.id}-status`), { key: rollup.key, text: rollup.text });
  }
  // Numbers 1–9; Before you start has none.
  assert.doesNotMatch(railStepOf(html, "before"), /rail-step-num/);
  assert.match(railStepOf(html, "about"), /<span class="rail-step-num" aria-hidden="true">1<\/span>/);
  assert.match(railStepOf(html, "review"), /<span class="rail-step-num" aria-hidden="true">9<\/span>/);
  // A step's name links to its first sub-step that isn't Done, or its first when all are.
  assert.match(railStepOf(html, "about"), /<button type="button" class="rail-link" data-action="go-substep" data-substep="about\.address">/);
  assert.match(railStepOf(html, "before"), /<button type="button" class="rail-link" data-action="go-substep" data-substep="before\.ready">/);
  // The current sub-step: aria-current and "You are here"; only it.
  const here = subLinkOf(html, "about.address");
  assert.match(here, /aria-current="step"/);
  assert.match(here, /<small class="rail-here">You are here<\/small>/);
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
  assert.equal((html.match(/You are here/g) ?? []).length, 1);
  assert.doesNotMatch(subLinkOf(html, "about.you"), /aria-current/);
  // Sub-step marks: fixed ids with "." as "-".
  assert.deepEqual(markOf(html, "rail-sub-about-you-status"), { key: "done", text: "Done" });
  assert.deepEqual(markOf(html, "rail-sub-about-address-status"), { key: "none", text: "" });
  assert.deepEqual(markOf(html, "rail-step-before-status"), { key: "done", text: "Done" });
  // A hidden sub-step is not listed (the spouse, for an unmarried client).
  assert.doesNotMatch(html, /data-substep="about\.spouse"/);
  assert.doesNotMatch(html, /rail-sub-about-spouse-status/);
  // Collapsed steps still render their sub-steps' spans, hidden.
  assert.match(railStepOf(html, "income"), /rail-sub-income-wages-status/);
});

test("the rail's open and shut entries win over the current step, and the phone bar opens the tree", () => {
  const html = intakeScreen(v2State({ formSubstep: "about.address", openPanels: ["rail-open:income", "rail-shut:about"] }));
  assert.match(railStepOf(html, "about"), /aria-expanded="false" aria-controls="rail-subs-about"/);
  assert.match(railStepOf(html, "about"), /<ol id="rail-subs-about" class="rail-subs" hidden>/);
  assert.match(railStepOf(html, "income"), /aria-expanded="true" aria-controls="rail-subs-income"/);
  assert.match(railStepOf(html, "income"), /<ol id="rail-subs-income" class="rail-subs">/);
  // The phone bar, and the tree closed until "All steps" opens it.
  assert.match(
    html,
    /<div class="rail-phone"><span>About you · 2 of 5<\/span><button type="button" class="btn secondary" data-action="toggle-panel" data-panel="rail-all" aria-expanded="false" aria-controls="rail-tree">All steps<\/button><\/div>/,
  );
  const open = intakeScreen(v2State({ formSubstep: "about.address", openPanels: ["rail-all"] }));
  assert.match(open, /<ol id="rail-tree" class="rail-tree is-open">/);
  assert.match(open, /data-panel="rail-all" aria-expanded="true" aria-controls="rail-tree"/);
});

test("the progress bar counts visible sub-steps", () => {
  const draftAnswers = sample();
  const count = visibleSubsteps(draftAnswers, cardsFor(draftAnswers, [])).length;
  const html = intakeScreen(v2State({ formSubstep: "about.address" }));
  assert.match(html, new RegExp(`<progress class="rail-bar" max="${count}" value="5"[^>]*></progress><p>Part 5 of ${count}</p>`));
  // A married client has one more part.
  const married = makeSampleAnswers({ version: 2, married: true });
  const more = visibleSubsteps(married, cardsFor(married, [])).length;
  assert.equal(more, count + 1);
  assert.match(intakeScreen(v2State({ formSubstep: "about.address", draftAnswers: married })), new RegExp(`max="${more}" value="5"`));
});

test("the rail counts a revealed invalid answer on its sub-step and its step", () => {
  const draftAnswers = { ...sample(), email: "a@" };
  const html = intakeScreen(v2State({ formSubstep: "income.wages", draftAnswers, visitedSubsteps: ["about.you"], revealed: ["email"] }));
  assert.deepEqual(markOf(html, "rail-sub-about-you-status"), { key: "needs", text: "Needs answers" });
  assert.deepEqual(markOf(html, "rail-step-about-status"), { key: "needs", text: "Needs answers" });
  const ctx = { answers: draftAnswers, visited: ["about.you"], revealed: new Set(["email"]), cards: cardsFor(draftAnswers, []) };
  assert.equal(substepStatus("about.you", ctx).key, "needs");
});

test("a Documents sub-step with a Needed card still Not done reads Needs documents", () => {
  const html = intakeScreen(v2State({ formSubstep: "notes.anything", visitedSubsteps: ["documents.identity"] }));
  assert.deepEqual(markOf(html, "rail-sub-documents-identity-status"), { key: "docs", text: "Needs documents" });
  assert.deepEqual(markOf(html, "rail-step-documents-status"), { key: "docs", text: "Needs documents" });
  // Later or Don't have clears it.
  const marked = intakeScreen(
    v2State({
      formSubstep: "notes.anything",
      visitedSubsteps: ["documents.identity"],
      savedCase: v2Case({ documentCards: [{ slotId: "photo_id.tp", status: "later" }, { slotId: "ssn.tp", status: "none" }] }),
    }),
  );
  assert.deepEqual(markOf(marked, "rail-sub-documents-identity-status"), { key: "done", text: "Done" });
});

test("Needs an answer shows on the current sub-step only once it was visited", () => {
  const fresh = intakeScreen(v2State({ formSubstep: "about.you", draftAnswers: {} }));
  assert.doesNotMatch(fresh, /Needs an answer/);
  assert.doesNotMatch(fresh, /is-missing/);
  const again = intakeScreen(v2State({ formSubstep: "about.you", draftAnswers: {}, visitedSubsteps: ["about.you"] }));
  assert.match(again, /<p id="field-client-tp_first_name-note" class="q-note is-missing" aria-live="polite">Needs an answer<\/p>/);
  // Every rendered question is a data-q wrapper (the page's renderedIds), and only this sub-step's.
  for (const id of ["tp_first_name", "tp_dob", "tp_phone", "email"]) assert.match(again, new RegExp(`data-q="${id}"`));
  assert.doesNotMatch(again, /data-q="addr_zip"/);
});

test("a revealed error shows on an unvisited sub-step, in the note and the rail", () => {
  const draftAnswers = { ...sample(), email: "a@" };
  const html = intakeScreen(v2State({ formSubstep: "about.you", draftAnswers, revealed: ["email"] }));
  assert.match(html, /<p id="field-client-email-note" class="q-note is-invalid" aria-live="polite">Enter a valid email address\.<\/p>/);
  assert.deepEqual(markOf(html, "rail-sub-about-you-status"), { key: "needs", text: "Needs answers" });
  const quiet = intakeScreen(v2State({ formSubstep: "about.you", draftAnswers }));
  assert.doesNotMatch(quiet, /is-invalid/);
  assert.deepEqual(markOf(quiet, "rail-sub-about-you-status"), { key: "none", text: "" });
});

test("with the senior wording chosen, questions use it", () => {
  const html = intakeScreen(v2State({ formSubstep: "about.you", draftAnswers: { ...sample(), form_version: "senior" } }));
  assert.ok(html.includes(escText(findQuestion(2, "tp_first_name").wording.senior.en)));
  assert.ok(!html.includes(`>${findQuestion(2, "tp_first_name").wording.general.en}<`));
  const general = intakeScreen(v2State({ formSubstep: "about.you" }));
  assert.ok(general.includes(`>${findQuestion(2, "tp_first_name").wording.general.en}<`));
});

test("show-if: the spouse questions render only for a married client", () => {
  const married = intakeScreen(v2State({ formSubstep: "about.spouse", draftAnswers: makeSampleAnswers({ version: 2, married: true }) }));
  assert.match(married, /<form id="intake-v2-form" novalidate data-substep="about\.spouse">/);
  assert.match(married, /data-q="sp_first_name"/);
  const single = intakeScreen(v2State({ formSubstep: "about.spouse" }));
  assert.doesNotMatch(single, /data-q="sp_first_name"/);
  assert.match(single, /<form id="intake-v2-form" novalidate data-substep="about\.situation">/);
});

test("a lead line replaces the section intro; a section's intro shows on its first sub-step only", () => {
  const wages = intakeScreen(v2State({ formSubstep: "income.wages" }));
  assert.match(wages, /<p class="q-lead">Did you or your spouse receive any of these in 2025\?<\/p>/);
  assert.match(intakeScreen(v2State({ formSubstep: "expenses.events" })), /<p class="q-lead">Did any of these happen to you or your spouse in 2025\?<\/p>/);
  // No Section 9 intro anywhere, and no intro beside a lead.
  for (const id of ["income.wages", "income.retirement", "income.investments", "income.rental", "income.business", "income.other"])
    assert.doesNotMatch(intakeScreen(v2State({ formSubstep: id })), /class="q-intro"/, id);
  // Section 6's intro on the household page; nothing on About you's later pages.
  assert.match(intakeScreen(v2State({ formSubstep: "household.members" })), /class="q-intro"/);
  assert.doesNotMatch(intakeScreen(v2State({ formSubstep: "about.address" })), /class="q-intro"/);
  // Section 0's intro on before.ready only, not on the later Before you start pages.
  assert.match(intakeScreen(v2State()), /<div class="q-intro"><p>Please have these ready:/);
  assert.doesNotMatch(intakeScreen(v2State({ formSubstep: "before.service" })), /class="q-intro"/);
});

test("before.ready adds a line after the S0 text: the Documents step, or a list for same-day", () => {
  const html = intakeScreen(v2State());
  assert.match(html, /ts\.voltax@irs\.gov[\s\S]*<p class="q-intro-extra">You will upload them in the Documents step\.<\/p>/);
  assert.doesNotMatch(html, /You will get a list of what to bring/);
  const sameDay = intakeScreen(v2State({ draftAnswers: { ...sample(), service: "same_day" } }));
  assert.match(sameDay, /<p class="q-intro-extra">You will get a list of what to bring\.<\/p>/);
  assert.doesNotMatch(sameDay, /Documents step/);
  assert.doesNotMatch(intakeScreen(v2State({ formSubstep: "before.service" })), /q-intro-extra/);
});

test("Back, Continue and Back to summary", () => {
  const first = intakeScreen(v2State());
  assert.doesNotMatch(first, /data-action="back-step"/);
  assert.match(first, /<button type="submit" class="btn primary"[^>]*>Continue/);
  const middle = intakeScreen(v2State({ formSubstep: "about.you" }));
  assert.match(middle, /data-action="back-step"/);
  assert.match(middle, /<button type="submit" class="btn primary"[^>]*>Continue/);
  const submit = intakeScreen(v2State({ formSubstep: "review.submit" }));
  assert.match(submit, /data-action="back-step"/);
  assert.doesNotMatch(submit, /type="submit"/);
  // A Change link's return: the primary button goes back to the summary instead.
  const change = intakeScreen(v2State({ formSubstep: "about.address", returnToSummary: true }));
  assert.match(change, /<button type="button" class="btn primary" data-action="back-to-summary"[^>]*>Back to summary<\/button>/);
  assert.doesNotMatch(change, /type="submit"/);
  // A conflict or a save in flight disables the primary button.
  assert.match(intakeScreen(v2State({ formSubstep: "about.you", busy: true })), /<button type="submit" class="btn primary" disabled>/);
});

test("a Documents sub-step: Needed cards, then the Maybe needed group, each card with its marks", () => {
  const html = intakeScreen(v2State({ formSubstep: "documents.identity" }));
  assert.match(html, /<span class="overline">STEP 7 OF 9 · DOCUMENTS<\/span><h1>Identity<\/h1>/);
  const photo = cardOf(html, "photo_id.tp");
  assert.ok(photo, "the photo ID card is rendered");
  assert.match(photo, /<h3>Photo ID \(driver&#39;s license, state ID, passport\)<\/h3>/);
  assert.match(photo, /<p class="doc-owner">Mei Chen<\/p>/);
  // Upload buttons, disabled, described by the note.
  for (const name of ["Take a photo", "Choose a file"])
    assert.match(photo, new RegExp(`<button type="button" class="btn secondary" disabled aria-describedby="doc-photo_id-tp-note">[\\s\\S]*?${name}</button>`));
  assert.match(photo, /<p class="doc-note" id="doc-photo_id-tp-note">Uploading arrives soon\. For now, bring it or mark it below\.<\/p>/);
  assert.match(photo, /<button type="button" class="btn secondary" data-action="mark-card" data-slot="photo_id\.tp" data-status="later">I will send it later<\/button>/);
  assert.match(photo, /<button type="button" class="btn secondary" data-action="mark-card" data-slot="photo_id\.tp" data-status="none">I don&#39;t have this<\/button>/);
  assert.doesNotMatch(photo, /data-status="not_done"/);
  assert.match(photo, /<p class="doc-status is-not_done" id="doc-photo_id-tp-status" tabindex="-1">[\s\S]*Not done<\/p>/);
  assert.match(photo, /<svg/, "the status has an icon");
  // No why line on photo ID, so no link.
  assert.doesNotMatch(photo, /data-action="go-substep"/);
  // Maybe needed: a closed toggle after the Needed cards, its cards not shown.
  const toggle = /<button type="button" class="doc-maybe-toggle" data-action="toggle-panel" data-panel="maybe:documents\.identity" aria-expanded="false"[^>]*>Maybe needed \(1\)<\/button>/.exec(html);
  assert.ok(toggle, "the Maybe needed toggle is rendered");
  assert.ok(html.indexOf(cardOf(html, "ssn.tp")) < toggle.index);
  assert.equal(cardOf(html, `ssn.hh.${MEMBER}`), undefined);
  // Open, the Maybe needed card shows, with its why line linking back.
  const open = intakeScreen(v2State({ formSubstep: "documents.identity", openPanels: ["maybe:documents.identity"] }));
  assert.match(open, /data-panel="maybe:documents\.identity" aria-expanded="true"/);
  const member = cardOf(open, `ssn.hh.${MEMBER}`);
  assert.ok(member, "the household member's card shows");
  assert.match(member, /<p class="doc-owner">Lin Chen<\/p>/);
  assert.match(member, /<button type="button" class="inline" data-action="go-substep" data-substep="household\.members">You listed this person in your household<\/button>/);
  assert.ok(open.indexOf(member) > open.indexOf("doc-maybe-toggle"));
});

test("a card's status reads Later or Don't have, and then offers Mark as not done", () => {
  const state = (status) =>
    v2State({ formSubstep: "documents.income", savedCase: v2Case({ documentCards: [{ slotId: "w2.household", status }] }) });
  const later = cardOf(intakeScreen(state("later")), "w2.household");
  assert.match(later, /<p class="doc-status is-later" id="doc-w2-household-status" tabindex="-1">[\s\S]*Later<\/p>/);
  assert.match(later, /<button type="button" class="btn secondary" data-action="mark-card" data-slot="w2\.household" data-status="not_done">Mark as not done<\/button>/);
  const none = cardOf(intakeScreen(state("none")), "w2.household");
  assert.match(none, /<p class="doc-status is-none" id="doc-w2-household-status" tabindex="-1">[\s\S]*Don&#39;t have<\/p>/);
  assert.match(none, /data-status="not_done">Mark as not done/);
  // The why line links to the question that asked.
  assert.match(later, /<button type="button" class="inline" data-action="go-substep" data-substep="income\.wages">You said you had wages from a job<\/button>/);
  assert.match(later, /<p class="doc-owner">For you<\/p>/);
  assert.match(later, /You said 1 job\. Upload 1 W-2\./);
});

test("while an action is in flight, the form's navigation and the card marks are disabled", () => {
  // The controller ignores a sub-step change or a mark while one is in flight
  // (a second write would meet a false conflict); disabled, the page never
  // offers one, so nothing is dropped silently.
  const GUARDED = /<button[^>]*data-action="(?:go-substep|change-substep|back-step|back-to-summary|mark-card)"[^>]*>/g;
  const tagsOf = (html) => html.match(GUARDED) ?? [];
  const draftAnswers = { ...without(sample(), "tp_first_name"), email: "a@" };
  const later = v2Case({ documentCards: [{ slotId: "w2.household", status: "later" }] });
  const pages = [
    { formSubstep: "about.you" },
    { formSubstep: "about.address", returnToSummary: true },
    { formSubstep: "documents.income", savedCase: later },
    { formSubstep: "documents.identity", openPanels: ["maybe:documents.identity"] },
    { formSubstep: "review.check", draftAnswers },
    { formSubstep: "review.summary", savedCase: later },
    { formSubstep: "review.submit", draftAnswers },
  ];
  const seen = new Set();
  for (const page of pages) {
    const idle = tagsOf(intakeScreen(v2State(page)));
    const busy = tagsOf(intakeScreen(v2State({ ...page, busy: true })));
    assert.ok(busy.length > 0 && busy.length === idle.length, page.formSubstep);
    for (const tag of idle) assert.doesNotMatch(tag, /\sdisabled/, `${page.formSubstep}: ${tag}`);
    for (const tag of busy) {
      assert.match(tag, /\sdisabled[\s>]/, `${page.formSubstep}: ${tag}`);
      seen.add(/data-action="([^"]+)"/.exec(tag)[1]);
    }
    // Opening and closing parts of the page sends nothing, so it stays live.
    const busyHtml = intakeScreen(v2State({ ...page, busy: true }));
    for (const toggle of busyHtml.match(/<button[^>]*data-action="(?:toggle-rail-step|toggle-panel)"[^>]*>/g) ?? [])
      assert.doesNotMatch(toggle, /\sdisabled/, toggle);
  }
  assert.deepEqual([...seen].sort(), ["back-step", "back-to-summary", "change-substep", "go-substep", "mark-card"]);
  // The progress page's marks too.
  const progress = (busy) =>
    progressScreen(baseState({ screen: "progress", busy, savedCase: v2Case({ stage: "received", answers: sample() }) }));
  const idleMarks = tagsOf(progress(false));
  const busyMarks = tagsOf(progress(true));
  assert.ok(busyMarks.length > 0 && busyMarks.length === idleMarks.length);
  for (const tag of idleMarks) assert.doesNotMatch(tag, /\sdisabled/, tag);
  for (const tag of busyMarks) assert.match(tag, /\sdisabled[\s>]/, tag);
});

test("the optional Other documents card has the upload buttons but no marks and no status", () => {
  const html = intakeScreen(v2State({ formSubstep: "documents.other" }));
  const other = cardOf(html, "other.household");
  assert.ok(other, "the Other documents card shows");
  assert.match(other, /<h3>Other documents<\/h3>/);
  assert.match(other, /<p class="doc-owner">For your household<\/p>/);
  assert.match(other, /For example, a city tax notice, or a blank local tax form you received\./);
  assert.match(other, /disabled aria-describedby="doc-other-household-note"/);
  assert.match(other, /class="doc-note"/);
  assert.doesNotMatch(other, /mark-card/);
  assert.doesNotMatch(other, /doc-status/);
  assert.doesNotMatch(html, /doc-maybe-toggle/);
});

test("same-day: Bring these to your visit, a list with no buttons and no statuses", () => {
  const draftAnswers = { ...sample(), service: "same_day" };
  const html = intakeScreen(v2State({ formSubstep: "documents.bring", draftAnswers }));
  assert.match(html, /<h1>Bring these to your visit<\/h1>/);
  const list = /<ul class="bring-list">[\s\S]*?<\/ul>/.exec(html)?.[0];
  assert.ok(list, "the bring list is rendered");
  for (const card of cardsFor(draftAnswers, []).filter((c) => c.group !== "optional"))
    assert.ok(list.includes(escText(card.label.en)), card.slotId);
  // Needed first, then Maybe needed.
  assert.ok(list.indexOf("A voided check") < list.indexOf("Maybe needed"));
  assert.doesNotMatch(list, /Other documents/);
  assert.doesNotMatch(html, /data-action="mark-card"/);
  assert.doesNotMatch(html, /doc-status/);
  assert.doesNotMatch(html, /Take a photo/);
  assert.doesNotMatch(html, /<article class="doc-card"/);
});

test("review.check: the two texts, alerts grouped by step and the document warnings", () => {
  const draftAnswers = { ...without(sample(), "tp_first_name", "refund_method"), email: "a@" };
  const html = intakeScreen(v2State({ formSubstep: "review.check", draftAnswers }));
  assert.match(html, /<p>Please review your application and check it for accuracy and completeness before you submit it\.<\/p>/);
  assert.match(html, /<p>The IRS Volunteer Income Tax Assistance \(VITA\) program is completely free if you qualify\. We will never ask you to pay\.<\/p>/);
  assert.match(html, /<section class="alerts-panel" aria-labelledby="alerts-title"><h2 id="alerts-title" tabindex="-1">Alerts and warnings<\/h2>/);
  const alerts = /<div class="alerts-block">[\s\S]*?<\/div><div class="warnings-block">/.exec(html)?.[0];
  assert.ok(alerts, "alerts come before warnings");
  assert.match(alerts, /Fix before you submit/);
  const item = (kind, id, wordingOf, flag) =>
    new RegExp(`<button type="button" class="alert-item is-${kind}" data-action="go-substep" data-substep="${reEsc(id)}">[\\s\\S]*?${reEsc(escText(wordingOf))}[\\s\\S]*?${flag}[\\s\\S]*?</button>`);
  assert.match(alerts, item("missing", "about.you", findQuestion(2, "tp_first_name").wording.general.en, "Needs an answer"));
  assert.match(alerts, item("invalid", "about.you", findQuestion(2, "email").wording.general.en, "Needs a change"));
  assert.match(alerts, item("missing", "refund.payment", findQuestion(2, "refund_method").wording.general.en, "Needs an answer"));
  // Grouped by step, in step order.
  assert.ok(alerts.indexOf("Step 1: About you") < alerts.indexOf("Step 5: Refund &amp; permission"));
  assert.ok(alerts.indexOf("Step 1: About you") < alerts.indexOf(escText(findQuestion(2, "tp_first_name").wording.general.en)));
  // Warnings: every Needed card Not done or Later, each with Upload now.
  const warnings = /<div class="warnings-block">[\s\S]*?<\/section>/.exec(html)[0];
  assert.match(warnings, /You can still submit/);
  for (const [slot, substep] of [["photo_id.tp", "identity"], ["ssn.tp", "identity"], ["w2.household", "income"]])
    assert.match(warnings, new RegExp(`data-action="go-substep" data-substep="documents\\.${substep}" data-focus="doc-${reEsc(slug(slot))}">Upload now</button>`));
  // The Maybe needed cards as one line (the member's SSN and the bank letter).
  assert.match(warnings, /<button type="button" class="inline" data-action="go-substep" data-substep="documents\.identity">2 more documents may be needed<\/button>/);
  assert.doesNotMatch(html, /alerts-empty/);
});

test("review.check: Later still warns, Don't have does not, and nothing at all reads the empty sentence", () => {
  const cards = (statuses) => v2Case({ documentCards: Object.entries(statuses).map(([slotId, status]) => ({ slotId, status })) });
  const later = intakeScreen(v2State({ formSubstep: "review.check", savedCase: cards({ "photo_id.tp": "later", "ssn.tp": "none" }) }));
  assert.match(later, /data-focus="doc-photo_id-tp">Upload now/);
  assert.doesNotMatch(later, /data-focus="doc-ssn-tp"/);
  assert.doesNotMatch(later, /alerts-block/);
  const settled = cards({
    "photo_id.tp": "none",
    "ssn.tp": "none",
    "w2.household": "none",
    "bank.household": "none",
    [`ssn.hh.${MEMBER}`]: "none",
  });
  const empty = intakeScreen(v2State({ formSubstep: "review.check", savedCase: settled }));
  assert.match(empty, /<p class="alerts-empty">We found no alerts or warnings in your application\.<\/p>/);
  assert.doesNotMatch(empty, /alerts-block|warnings-block/);
  // One Maybe needed card reads in the singular.
  const one = intakeScreen(v2State({ formSubstep: "review.check", savedCase: cards({ "photo_id.tp": "none", "ssn.tp": "none", "w2.household": "none", "bank.household": "none" }) }));
  assert.match(one, />1 more document may be needed</);
});

test("review.check: same-day gets no document warnings, and alerts come from the draft alone", () => {
  const sameDay = intakeScreen(v2State({ formSubstep: "review.check", draftAnswers: { ...sample(), service: "same_day" } }));
  assert.match(sameDay, /alerts-empty/);
  assert.doesNotMatch(sameDay, /Upload now|may be needed/);
  // The phone is on the server's contact record but not in the draft: still an alert.
  const html = intakeScreen(
    v2State({
      formSubstep: "review.check",
      draftAnswers: without(sample(), "tp_phone"),
      savedCase: v2Case({ contact: { phone: "2155550100", spousePhone: null, bestContactTime: null, bestContactNote: null } }),
    }),
  );
  assert.match(html, /class="alert-item is-missing" data-action="go-substep" data-substep="about\.you"/);
});

test("review.summary: everything the printout shows sits in one block, with Change links and the cards", () => {
  const html = form({ formSubstep: "review.summary", savedCase: v2Case({ documentCards: [{ slotId: "w2.household", status: "later" }] }) });
  const start = html.indexOf('<div class="summary-print">');
  const tools = html.indexOf('<div class="summary-tools">');
  assert.ok(start >= 0 && tools > start, "the tools come after the printed block");
  const printed = html.slice(start, tools);
  assert.match(printed, /VT-GJPY-JAY9/);
  assert.match(printed, /October 4, 2026/);
  // Steps and sub-steps, each sub-step with its Change link.
  assert.match(printed, /<section class="summary-step"><h2>About you<\/h2>/);
  assert.match(printed, /<div class="summary-sub"><div class="summary-sub-head"><h3>Mailing address<\/h3><button type="button" class="inline" data-action="change-substep" data-substep="about\.address">Change<\/button><\/div>/);
  assert.match(printed, /<span>[^<]*<\/span><strong>Philadelphia<\/strong>/);
  assert.ok(printed.includes(`<strong>${escText(formatAnswer(findQuestion(2, "marital_status"), "never_married"))}</strong>`));
  assert.doesNotMatch(printed, /data-substep="about\.spouse"/);
  assert.doesNotMatch(printed, /data-substep="review\./);
  // The cards and their status.
  assert.match(printed, /W-2 from each job[\s\S]*?<strong>Later<\/strong>/);
  assert.match(printed, /Photo ID[\s\S]*?<strong>Not done<\/strong>/);
  assert.doesNotMatch(printed, /Other documents/);
  // The tools, outside the printed block.
  const toolbox = html.slice(tools);
  assert.match(toolbox, /data-action="print-summary"[^>]*>[\s\S]*?Print<\/button>/);
  assert.match(toolbox, /data-action="view-draft" data-form="en"[^>]*>[\s\S]*?View Draft 13614-C<\/button>/);
  assert.match(toolbox, /data-action="view-draft" data-form="zh-s"[^>]*>简体中文版<\/button>/);
  assert.match(toolbox, /data-action="view-draft" data-form="zh-t"[^>]*>繁體中文版<\/button>/);
  assert.match(toolbox, /<p id="draft-ready" class="draft-ready" aria-live="polite"><\/p>/);
  // Same-day: the bring list instead of the cards.
  const sameDay = form({ formSubstep: "review.summary", draftAnswers: { ...sample(), service: "same_day" } });
  assert.match(sameDay.slice(sameDay.indexOf("summary-print"), sameDay.indexOf("summary-tools")), /<ul class="bring-list">/);
});

test("review.submit: Submit waits for no alerts and the confirmation", () => {
  const clean = { formSubstep: "review.submit" };
  const html = intakeScreen(v2State(clean));
  assert.match(html, /<input type="checkbox" id="field-confirmed" name="confirmed"\s*>/);
  assert.match(html, /I have checked my answers/);
  assert.match(submitOf(html), /disabled/);
  assert.doesNotMatch(submitOf(intakeScreen(v2State({ ...clean, openPanels: ["confirmed"] }))), /disabled/);
  // Any alert keeps it disabled, ticked or not, and says where to look.
  const missing = intakeScreen(v2State({ ...clean, openPanels: ["confirmed"], draftAnswers: without(sample(), "tp_first_name") }));
  assert.match(submitOf(missing), /disabled/);
  assert.match(missing, /data-action="go-substep" data-substep="review\.check"/);
  const invalid = intakeScreen(v2State({ ...clean, openPanels: ["confirmed"], draftAnswers: { ...sample(), email: "a@" } }));
  assert.match(submitOf(invalid), /disabled/);
  // Document warnings never block.
  assert.ok(cardsFor(sample(), []).some((card) => card.group === "needed" && card.status === "not_done"));
  // A conflict or a save in flight does.
  assert.match(submitOf(intakeScreen(v2State({ ...clean, openPanels: ["confirmed"], busy: true }))), /disabled/);
});

test("a submitted version-2 case shows its answers read-only, grouped by step and sub-step", () => {
  const answers = without(sample(), "tp_phone", "best_contact_time", "best_contact_note");
  const html = intakeScreen(
    v2State({
      savedCase: v2Case({
        stage: "received",
        answers,
        contact: { phone: "2155550123", spousePhone: null, bestContactTime: ["weekday_morning"], bestContactNote: null },
      }),
      draftAnswers: {},
    }),
  );
  assert.match(html, /Your answers are with the office/);
  assert.doesNotMatch(html, /<form|<input|data-action="change-substep"/);
  assert.match(html, /<section class="answer-step"><h2>About you<\/h2>/);
  assert.match(html, /<div class="answer-sub"><h3>About you<\/h3>/);
  assert.match(html, /<div class="answer-sub"><h3>Mailing address<\/h3>/);
  // Contact fields come from the contact record.
  assert.match(html, /<strong>\(215\) 555-0123<\/strong>/);
  assert.match(html, /<strong>Weekday mornings<\/strong>/);
  // Unanswered and hidden questions are left out; so is a sub-step with nothing answered.
  assert.doesNotMatch(html, /data-q=/);
  assert.doesNotMatch(html, /<h3>Your spouse<\/h3>/);
  assert.match(html, /data-action="open-progress"/);
});

test("the progress page lists open documents for version 2, with their marks", () => {
  const progress = (overrides) =>
    progressScreen(baseState({ screen: "progress", savedCase: v2Case({ stage: "received", answers: sample(), ...overrides }) }));
  const html = progress({ documentCards: [{ slotId: "ssn.tp", status: "none" }, { slotId: "w2.household", status: "later" }] });
  const panel = /<section class="panel open-documents"[\s\S]*?<\/section>/.exec(html)?.[0];
  assert.ok(panel, "the open documents panel is rendered");
  assert.match(panel, /<h2 id="open-documents-title">Open documents<\/h2>/);
  assert.ok(cardOf(panel, "photo_id.tp"));
  assert.match(cardOf(panel, "w2.household"), /Later/);
  assert.match(cardOf(panel, "w2.household"), /data-status="not_done">Mark as not done/);
  assert.match(cardOf(panel, "photo_id.tp"), /data-action="mark-card" data-slot="photo_id\.tp" data-status="later"/);
  // Don't have, Maybe needed and the optional card are not open documents.
  assert.equal(cardOf(panel, "ssn.tp"), undefined);
  assert.equal(cardOf(panel, `ssn.hh.${MEMBER}`), undefined);
  assert.equal(cardOf(panel, "other.household"), undefined);
  // Answers are locked: no link back into the form.
  assert.doesNotMatch(panel, /data-action="go-substep"/);
  // After the status panel.
  assert.ok(html.indexOf("status-panel") < html.indexOf("open-documents"));
  // Same-day: the bring list.
  const sameDay = progressScreen(baseState({ screen: "progress", savedCase: v2Case({ stage: "received", answers: { ...sample(), service: "same_day" } }) }));
  assert.match(sameDay, /<h2 id="open-documents-title">Bring these to your visit<\/h2>/);
  assert.match(sameDay, /<ul class="bring-list">/);
  assert.doesNotMatch(sameDay, /mark-card/);
  // Version 1 has none.
  assert.doesNotMatch(progressScreen(baseState({ screen: "progress", savedCase: caseRecord({ stage: "received" }) })), /open-documents/);
});

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

// Part 4c (Task 4): the card is exported for Add a case. Without `office` it is
// 4b2's markup byte for byte; with it, the marks and notes speak to the office.
test("docCard without office is unchanged; with office it speaks to the office", () => {
  const cards = cardsFor(makeSampleAnswers({ version: 2 }), []);
  const w2 = cards.find((card) => card.slotId === "w2.household");
  assert.equal(
    docCard(w2, { links: false }),
    `<article class="doc-card" id="doc-w2-household" data-slot="w2.household" tabindex="-1"><h3>W-2 from each job</h3><p class="doc-owner">For you</p><p class="doc-why">You said you had wages from a job</p><p class="doc-hint">You said 1 job. Upload 1 W-2.</p><div class="doc-upload"><button type="button" class="btn secondary" disabled aria-describedby="doc-w2-household-note">${icon("camera")} Take a photo</button><button type="button" class="btn secondary" disabled aria-describedby="doc-w2-household-note">${icon("upload")} Choose a file</button></div><p class="doc-note" id="doc-w2-household-note">Uploading arrives soon. For now, bring it or mark it below.</p><div class="doc-marks"><button type="button" class="btn secondary" data-action="mark-card" data-slot="w2.household" data-status="later">I will send it later</button><button type="button" class="btn secondary" data-action="mark-card" data-slot="w2.household" data-status="none">I don&#39;t have this</button></div><p class="doc-status is-not_done" id="doc-w2-household-status" tabindex="-1">${icon("upload")}<span class="sr-only">Status: </span>Not done</p></article>`,
  );
  assert.match(docCard(w2), /<p class="doc-why"><button type="button" class="inline" data-action="go-substep" data-substep="income\.wages">You said you had wages from a job<\/button><\/p>/);

  const office = docCard({ ...w2, status: "later" }, { links: false, off: " disabled", office: true });
  assert.match(office, /data-status="later" disabled>Later<\/button>/);
  assert.match(office, /data-status="none" disabled>Don&#39;t have<\/button>/);
  assert.match(office, /data-status="not_done" disabled>Mark as not done<\/button>/);
  assert.match(office, new RegExp(`<p class="doc-why">Asked by: ${escText(wording(findQuestion(2, "inc_wages"), { variant: "general", lang: "en" }))}</p>`));
  // The reason line never quotes the client ("You said…", "You wrote…").
  assert.doesNotMatch(office, /<p class="doc-why">[^<]*You (said|wrote)/);
  assert.doesNotMatch(office, /I will send|I don&#39;t have/);
  assert.match(office, /<p class="doc-note" id="doc-w2-household-note">Uploads come later\. Mark what the client will send later or doesn&#39;t have\.<\/p>/);
  // A card with no asking question has no reason line on the office's side.
  const photo = cards.find((card) => card.slotId === "photo_id.tp");
  assert.equal(photo.ask ?? null, null);
  assert.doesNotMatch(docCard(photo, { links: false, office: true }), /doc-why/);
});

// Part 4d Task 6: the progress page's cards and request in the client's language.
test("docCard speaks the client's language; the office's card stays English whatever lang says", () => {
  const cards = cardsFor(makeSampleAnswers({ version: 2 }), []);
  const w2 = cards.find((card) => card.slotId === "w2.household");
  const zh = docCard({ ...w2, status: "later" }, { links: false, lang: "zh-Hans" });
  assert.match(zh, /<h3>每份工作的 W-2<\/h3>/);
  assert.match(zh, /<p class="doc-owner">本人<\/p>/);
  assert.match(zh, /<p class="doc-hint">您说有 1 份工作，请上传 1 张 W-2。<\/p>/);
  assert.match(zh, /data-status="later">我稍后再提供<\/button>/);
  assert.match(zh, /data-status="not_done">标记为未完成<\/button>/);
  assert.match(zh, /<span class="sr-only">状态：<\/span>稍后提供<\/p>/);
  assert.equal(docCard(w2, { links: false, lang: "en" }), docCard(w2, { links: false }));
  assert.equal(docCard(w2, { links: false, office: true, lang: "zh-Hans" }), docCard(w2, { links: false, office: true }));
});

test("a document request labels the office's words in Chinese and shows them as typed", () => {
  const state = (lang) =>
    baseState({
      screen: "progress",
      lang,
      savedCase: caseRecord({
        stage: "preparing",
        requests: [{ id: "req-1", title: "Mileage record", message: "Please send it.", status: "open" }],
        history: [{ id: "e1", message: "A volunteer requested a document: Mileage record", createdAt: "2026-01-02T15:04:05Z" }],
      }),
    });
  const zh = progressScreen(state("zh-Hans"));
  assert.match(zh, /<span class="request-label">需要的文件<\/span><h2>Mileage record<\/h2><span class="request-label">办公室留言<\/span><p>Please send it\.<\/p>/);
  assert.match(zh, /<p>志愿者请求了一份文件：Mileage record<\/p>/);
  const en = progressScreen(state("en"));
  assert.doesNotMatch(en, /request-label/);
  assert.match(en, /<h2>Mileage record<\/h2><p>Please send it\.<\/p>/);
  assert.match(en, /<p>A volunteer requested a document: Mileage record<\/p>/);
});
