import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as OpenCC from "opencc-js";
import * as views from "../src/views.mjs";
import * as client from "../src/client-views.mjs";
import { setHantMap } from "../src/hant.mjs";
import MAP from "../src/zh-hant.mjs";
import { SENTENCES, t, sentence, historyLine } from "../src/client-text.mjs";
import { NEUTRAL_SEND_MESSAGE } from "../src/auth.mjs";
import { payloadFor, SAMPLE_DOCUMENT_FILENAME } from "../src/case-actions.mjs";
import { OFFICE_CONTACT } from "../src/ui.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";
import { visibleSubsteps } from "../src/intake-form.mjs";
import { cardsFor } from "../src/document-cards.mjs";
import { findQuestion } from "../src/intake-catalogue.mjs";
import { intakeFormV2 } from "../src/intake-views.mjs";
import {
  textOf,
  latinLeaks,
  dataTokens,
  historySentences,
  migrationSentences,
  REQUEST_PREFIX,
} from "./support/language-sweep.mjs";

// Part 4d Task 6 (spec 2026-10-05 §3, §6): the client frame, sign-in, the
// applications list, the reference screen and the progress page, rendered in
// 简体 and 繁體, with nothing left in English and no Simplified character left
// in 繁體.

setHantMap(MAP);

// The screen app.mjs picks (screenFor), for a client or a visitor.
function screenFor(state) {
  if (!state.principal) {
    if (state.error?.code === "FORBIDDEN") return views.noAccessScreen(state);
    if (state.session !== "none") return views.unreachableScreen(state);
    return client.accessScreen(state);
  }
  return client.clientScreen(state);
}
const render = (state) => views.page(state, screenFor(state));

// Sample free text uses only characters that are the same in both scripts.
const EMAIL = "lin.mei@example.org";
const REFERENCE = "VT-AB2C-DE3F";
const REFERENCE_2 = "VT-GJPY-JAY9";
const REQUEST_TITLE = "中山路文件";
const REQUEST_MESSAGE = "林美的文件";
const DATA = [
  REFERENCE,
  REFERENCE_2,
  EMAIL,
  "林",
  "美",
  OFFICE_CONTACT.phone,
  OFFICE_CONTACT.email,
  SAMPLE_DOCUMENT_FILENAME,
  REQUEST_TITLE,
  REQUEST_MESSAGE,
];

const baseState = (overrides = {}) => ({
  session: "present",
  principal: { userId: "user-1", workspaceId: "w1", access: "applicant" },
  connection: "online",
  error: null,
  retryable: false,
  notice: null,
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
  dirty: false,
  conflict: null,
  saveState: "idle",
  busy: false,
  screen: "applications",
  selectedCaseId: null,
  formStep: 0,
  openPanels: [],
  lookup: "",
  dialog: null,
  ...overrides,
});

const v2Answers = () => {
  const answers = makeSampleAnswers({ version: 2 });
  return {
    ...answers,
    tp_first_name: "美",
    tp_last_name: "林",
    addr_street: "中山路 100",
    hh: answers.hh.map((member) => ({ ...member, first_name: "文", last_name: "林" })),
  };
};

const v2Case = (overrides = {}) => ({
  id: "case-v2",
  reference: REFERENCE_2,
  workspaceId: "w1",
  ownerUserId: "user-1",
  stage: "preparing",
  revision: 6,
  intakeVersion: 2,
  clientNumber: 12,
  answers: v2Answers(),
  contact: null,
  documentCards: [{ slotId: "w2.household", status: "later" }],
  requests: [],
  documents: [],
  history: [],
  ...overrides,
});

const HISTORY = [
  "Application received. A volunteer will check your information and documents.",
  "Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation.",
  "A volunteer has started preparing your return.",
  `${REQUEST_PREFIX}${REQUEST_TITLE}`,
].map((message, index) => ({
  id: `e${index}`,
  action: "X",
  message,
  createdAt: `2026-01-0${index + 2}T15:04:05Z`,
}));

const progressCase = v2Case({
  requests: [
    { id: "req-1", caseId: "case-v2", title: REQUEST_TITLE, message: REQUEST_MESSAGE, status: "open" },
  ],
  documents: [{ id: "d1", requestId: "req-0", filename: SAMPLE_DOCUMENT_FILENAME, source: "client" }],
  history: HISTORY,
});

const draftCase = { id: "case-d", reference: REFERENCE, stage: "draft", clientNumber: null };
const receivedCase = { id: "case-v2", reference: REFERENCE_2, stage: "received", clientNumber: 12 };

const visitor = (overrides) => baseState({ principal: null, session: "none", screen: "access", ...overrides });

// Every state that changes the text of these screens.
const STATES = {
  "sign-in: the email step": visitor(),
  "sign-in: the code step with a countdown": visitor({
    authStep: "code",
    authEmail: EMAIL,
    authMessage: NEUTRAL_SEND_MESSAGE,
    resendSeconds: 42,
  }),
  "sign-in: the code step with an auth error": visitor({
    authStep: "code",
    authEmail: EMAIL,
    authMessage: NEUTRAL_SEND_MESSAGE,
    authError: { code: "AUTH_INVALID_CODE", message: "That code is invalid or has expired. Request a new code." },
  }),
  "sign-in: the email step with a validation error": visitor({
    authError: { code: "OFFLINE", message: "The demo cannot reach the server. Check the connection." },
  }),
  "sign-in: the code step, resend ready": visitor({ authStep: "code", authEmail: EMAIL, authMessage: NEUTRAL_SEND_MESSAGE }),
  "applications: one draft and one received": baseState({
    cases: [draftCase, receivedCase],
    savedCase: v2Case({ id: "case-v2", history: HISTORY }),
  }),
  "applications: none yet": baseState(),
  "applications: a lookup that finds nothing": baseState({ cases: [draftCase], lookup: "VT-ZZZZ" }),
  "the reference screen": baseState({ screen: "reference", savedCase: v2Case({ stage: "draft", clientNumber: null }) }),
  "progress: a request, history and a document sent": baseState({ screen: "progress", savedCase: progressCase }),
  "progress: an upload failure": baseState({
    screen: "progress",
    savedCase: progressCase,
    openPanels: ["upload-failed", "upload-failure"],
  }),
  "progress: in review, nothing open": baseState({
    screen: "progress",
    savedCase: v2Case({ stage: "reviewing", documentCards: [], history: [] }),
  }),
  "progress: same-day bring list": baseState({
    screen: "progress",
    savedCase: v2Case({ stage: "received", answers: { ...v2Answers(), service: "same_day" } }),
  }),
  "the frame: reconnecting": baseState({ connection: "reconnecting", cases: [draftCase] }),
  "the frame: offline": baseState({ connection: "offline", cases: [draftCase] }),
  "the frame: the notice banner": baseState({
    notice: "Sample cases were reset. The one you had open is no longer there.",
  }),
  "the frame: the problem banner": baseState({
    error: { code: "SERVER_ERROR", message: "Something went wrong. Please try again." },
    retryable: true,
  }),
  "the frame: the help dialog": baseState({ dialog: "help" }),
  "the frame: the regenerate dialog": baseState({ dialog: "regenerate" }),
  "the frame: the print dialog": baseState({ dialog: "print", savedCase: v2Case() }),
  "the unreachable screen": baseState({
    principal: null,
    session: "unknown",
    error: { code: "OFFLINE", message: "The demo cannot reach the server. Check the connection." },
  }),
  "the no-access screen": baseState({
    principal: null,
    session: "present",
    error: { code: "FORBIDDEN", message: "You do not have access to this step." },
  }),
};

const toTw = OpenCC.Converter({ from: "cn", to: "tw" });
// The switch's own buttons name each language in itself (简体中文 included), so
// they are not page text for the 繁體 check.
const withoutSwitchNames = (html) => html.replace(/<button[^>]*data-action="set-language"[^>]*>[^<]*<\/button>/g, "");

for (const [name, state] of Object.entries(STATES)) {
  test(`简体: ${name} has nothing left in English`, () => {
    const html = render({ ...state, lang: "zh-Hans" });
    assert.deepEqual(latinLeaks(textOf(html), DATA), []);
    assert.match(textOf(html), /\p{Script=Han}/u);
  });
  test(`繁體: ${name} has nothing in English and no Simplified character`, () => {
    const html = render({ ...state, lang: "zh-Hant" });
    assert.deepEqual(latinLeaks(textOf(html), DATA), []);
    const text = textOf(withoutSwitchNames(html));
    assert.equal(toTw(text), text);
  });
}

test("latinLeaks matches data by whole token: short English words never hide inside the data", () => {
  const html = render({ ...STATES["progress: a request, history and a document sent"], lang: "zh-Hans" });
  assert.deepEqual(latinLeaks(textOf(html), DATA), []);
  const injected = html.replace("您的进度", "您的进度 a record in town");
  assert.notEqual(injected, html);
  assert.deepEqual(latinLeaks(textOf(injected), DATA), ["a", "record", "in", "town"]);
  // The data's own tokens still pass: the email, the file name and the reference.
  const tokens = dataTokens(DATA);
  for (const word of ["lin", "mei", "example", "org", "demo-mileage-record-2025", "pdf", "chinatown-pcdc", "vita", REFERENCE])
    assert.ok(tokens.has(word), word);
  for (const word of ["a", "in", "town", "record", "demo", "chinatown"]) assert.ok(!tokens.has(word), word);
});

test("English is the default: the same states render in English without a language", () => {
  for (const state of Object.values(STATES)) {
    const english = render(state);
    assert.equal(render({ ...state, lang: "en" }), english);
  }
});

test("a presenter's frame stays English whatever the browser chose", () => {
  const presenter = baseState({
    principal: { userId: "p", workspaceId: "w1", access: "presenter" },
    dialog: "help",
    notice: "Sample cases were reset.",
  });
  assert.equal(views.page({ ...presenter, lang: "zh-Hans" }, ""), views.page(presenter, ""));
});

test("the code step's first draw uses the countdown keys app.mjs patches in place", () => {
  const html = render({ ...STATES["sign-in: the code step with a countdown"], lang: "zh-Hans" });
  assert.ok(html.includes(t("signin.countdown", { n: 42 }, "zh-Hans")));
  assert.ok(html.includes(t("signin.resend_in", { n: 42 }, "zh-Hans")));
  const ready = render({ ...STATES["sign-in: the code step, resend ready"], lang: "zh-Hans" });
  assert.ok(ready.includes(t("signin.resend", {}, "zh-Hans")));
});

test("the progress page shows the office's words as typed, with Chinese labels around them", () => {
  const html = render({ ...STATES["progress: a request, history and a document sent"], lang: "zh-Hant" });
  assert.ok(html.includes(REQUEST_TITLE) && html.includes(REQUEST_MESSAGE));
  assert.ok(html.includes(t("progress.request_title", {}, "zh-Hant")));
  assert.ok(html.includes(t("progress.request_message", {}, "zh-Hant")));
  assert.ok(html.includes(t("history.requested", { title: REQUEST_TITLE }, "zh-Hant")));
  assert.equal(t("progress.request_title", {}, "zh-Hans"), "需要的文件");
  assert.equal(t("progress.request_message", {}, "zh-Hans"), "办公室留言");
  // No lang attribute on the office's text.
  assert.doesNotMatch(html, new RegExp(`lang="[^"]*"[^>]*>${REQUEST_TITLE}`));
});

// ---------------------------------------------------------------------------
// The version-1 intake: English body, translated frame, a one-line note
// ---------------------------------------------------------------------------

test("a version-1 draft's form stays English inside lang=\"en\", under a Chinese note", () => {
  const record = { id: "v1", reference: REFERENCE, stage: "draft", revision: 1, answers: {}, requests: [], documents: [], history: [] };
  const state = baseState({ screen: "intake", savedCase: record, lang: "zh-Hans" });
  const html = client.intakeScreen(state);
  assert.ok(html.includes("这份较早的申请只有英文版本。"));
  const body = /<div[^>]*lang="en"[^>]*>([\s\S]*)<\/div><\/main>$/.exec(html);
  assert.ok(body, "the form body is wrapped in lang=\"en\"");
  assert.match(body[1], /Your visit/);
  assert.match(body[1], /Fictional data only/);
  assert.doesNotMatch(body[1], /这份较早/);
  // English has no note and no wrapper.
  const english = client.intakeScreen({ ...state, lang: "en" });
  assert.doesNotMatch(english, /lang="en"/);
  assert.equal(english, client.intakeScreen({ ...state, lang: undefined }));
  // Submitted: the read-only answers are English too.
  const sent = client.intakeScreen({ ...state, savedCase: { ...record, stage: "received" } });
  assert.match(sent, /<div lang="en">[\s\S]*Your answers are with the office/);
  assert.ok(sent.includes("这份较早的申请只有英文版本。"));
  // The frame around it is translated.
  assert.match(views.page(state, html), /跳到主要内容/);
});

// ---------------------------------------------------------------------------
// The save chip and the conflict panel (version 2)
// ---------------------------------------------------------------------------

test("the version-2 save chip and conflict panel speak the client's language", () => {
  const v2 = (overrides) =>
    baseState({ screen: "intake", savedCase: v2Case({ stage: "draft" }), draftAnswers: v2Answers(), lang: "zh-Hans", ...overrides });
  for (const overrides of [
    { saveState: "saving" },
    { saveState: "saved" },
    { saveState: "failed", error: { message: "Someone else updated this application. Refresh and try again." }, retryable: true },
    { saveState: "failed" },
    { saveState: "unsaved" },
    { saveState: "idle" },
    { saveState: "saved", revealed: ["tp_phone"], draftAnswers: { ...v2Answers(), tp_phone: "12" } },
  ]) {
    const chip = client.saveStatus(v2(overrides));
    assert.deepEqual(latinLeaks(textOf(chip), DATA), [], JSON.stringify(overrides));
  }
  const conflict = client.conflictForm(
    v2({
      conflict: { serverRevision: 7, baseRevision: 6 },
      draftAnswers: { ...v2Answers(), tp_first_name: "文" },
    }),
  );
  assert.deepEqual(latinLeaks(textOf(conflict), DATA), []);
  assert.match(conflict, /文/);
  // Version 1 and the office keep English.
  const v1 = baseState({ screen: "intake", lang: "zh-Hans", saveState: "saved", savedCase: { id: "v1", stage: "draft", answers: {} } });
  assert.match(client.saveStatus(v1), /Saved/);
});

// ---------------------------------------------------------------------------
// History: every sentence the migrations write has an entry
// ---------------------------------------------------------------------------

test("the history parser finds exactly the sentences, prefixes and seeded lines", () => {
  const sql = `
    -- 'message','A comment is not a sentence.'
    perform record(jsonb_build_object('stage','received',
      'message','Application received.'));
    perform record(jsonb_build_object('message', 'It''s spaced and quoted.'));
    if vitally_private.payload_keys(p_payload)<>array['message','title'] then
    if not vitally_private.payload_text(p_payload,'message',2000) then
    insert into public.document_requests(title,message,x) values(p_payload->>'title',p_payload->>'message',p_person.id);
    perform record(jsonb_build_object('message','A volunteer requested a document: '||(p_payload->>'title')));
    perform record(jsonb_build_object('message',case when v_completed then 'A volunteer spoke with you.' end));
    perform record(jsonb_build_object('message',v_message));
    insert into public.client_events(workspace_id,case_id,action,message) values(p_case.workspace_id,p_case.id,p_type,p_outcome->>'message');
    insert into public.client_events(workspace_id,case_id,action,message) values('w','c','SUBMIT','Inserted directly.');
    insert into public.other_table(action,message) values('X','Not a client event.');
    select v.message from (values
      ('a',1,'SUBMIT',null::text,'{"x":1}'::jsonb,'Seeded sentence.'::text),
      ('a',2,'X','sam','{}',null),
      ('a',3,'REQUEST_DOCUMENT','alex','{}','A volunteer requested a document: Mileage record')
    ) as v(key,seq,action,person_key,detail,message);
    select v.title from (values ('Not a message column.')) as v(title);
  `;
  const found = historySentences(sql);
  assert.deepEqual(found.sentences.sort(), [
    "A volunteer spoke with you.",
    "Application received.",
    "Inserted directly.",
    "It's spaced and quoted.",
    "Seeded sentence.",
  ]);
  assert.deepEqual(found.prefixes, [REQUEST_PREFIX]);
  assert.deepEqual(found.requests, ["A volunteer requested a document: Mileage record"]);
});

test("every history sentence in the migrations is a SENTENCES key; the request line keeps the title", () => {
  const { sentences, prefixes, requests } = migrationSentences();
  assert.ok(sentences.length >= 13, "the live handlers and the seeded rows");
  assert.ok(sentences.includes("A volunteer spoke with you about the next service step."));
  for (const text of sentences) assert.ok(Object.hasOwn(SENTENCES, text), text);
  assert.deepEqual(prefixes, [REQUEST_PREFIX]);
  for (const line of requests) {
    const title = line.slice(REQUEST_PREFIX.length);
    assert.equal(historyLine(line, "zh-Hans"), `志愿者请求了一份文件：${title}`);
    assert.equal(historyLine(line, "en"), line);
  }
  // The office's title is never converted or filled.
  assert.equal(historyLine(`${REQUEST_PREFIX}发达 {n}`, "zh-Hant"), `${t("history.requested", { title: "" }, "zh-Hant")}发达 {n}`);
  // Other lines go through the sentence table; unknown ones stay English.
  assert.equal(historyLine(sentences[0], "zh-Hans"), SENTENCES[sentences[0]]);
  assert.equal(historyLine("Something new.", "zh-Hans"), "Something new.");
});

// ---------------------------------------------------------------------------
// Errors, sign-in and notices: every sentence that can reach a client
// ---------------------------------------------------------------------------

const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const literal = (text) => JSON.parse(text);

test("every errors.mjs, controller, auth and notice sentence is a SENTENCES key", () => {
  const wanted = new Set(["Something went wrong.", "Please try again."]);
  // errors.mjs: SAFE_MESSAGES
  const errors = /const SAFE_MESSAGES = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(source("errors.mjs"))[1];
  const safe = [...errors.matchAll(/:\s*("(?:[^"\\]|\\.)*")/g)].map((m) => literal(m[1]));
  assert.equal(safe.length, 9);
  safe.forEach((s) => wanted.add(s));
  // controller.mjs: literal controllerError and requirePresenter sentences, *_NOTICE and the client conflict messages
  const controller = source("controller.mjs");
  const errorsThrown = [...controller.matchAll(/controllerError\(\s*"[A-Z_]+"\s*,\s*("(?:[^"\\]|\\.)*")/g)].map((m) => literal(m[1]));
  assert.ok(errorsThrown.length >= 15);
  errorsThrown.forEach((s) => wanted.add(s));
  [...controller.matchAll(/requirePresenter\(\s*("(?:[^"\\]|\\.)*")/g)].forEach((m) => wanted.add(literal(m[1])));
  // The fallbacks a sign-in error falls back on when it carries no message
  const fallbacks = [...controller.matchAll(/message:\s*[\w?.]+\s*\?\?\s*("(?:[^"\\]|\\.)*")/g)].map((m) => literal(m[1]));
  assert.ok(fallbacks.includes("Sign-in could not be completed."));
  fallbacks.forEach((s) => wanted.add(s));
  const constants = [...controller.matchAll(/const (\w+_(?:NOTICE|MESSAGE)) =\s*("(?:[^"\\]|\\.)*")/g)];
  const notices = constants.filter(([, name]) => name.endsWith("_NOTICE"));
  assert.ok(notices.length >= 2);
  for (const [, name, text] of constants) if (!/^(STAFF|ASSISTANCE)_/.test(name)) wanted.add(literal(text));
  // auth.mjs: the neutral message and every authError sentence
  wanted.add(NEUTRAL_SEND_MESSAGE);
  const auth = [...source("auth.mjs").matchAll(/authError\(\s*"[A-Z_]+"\s*,\s*("(?:[^"\\]|\\.)*")/g)].map((m) => literal(m[1]));
  assert.equal(auth.length, 3);
  auth.forEach((s) => wanted.add(s));
  for (const text of wanted) assert.ok(Object.hasOwn(SENTENCES, text), text);
});

test("the client's own case actions refuse in sentences the table knows", () => {
  // The caseButtons on client screens: Submit and the sample document.
  const clientActions = new Set();
  for (const file of ["client-views.mjs", "intake-views.mjs"])
    for (const m of source(file).matchAll(/caseButton\(\s*[\s\S]*?,\s*"([A-Z_]+)"/g)) clientActions.add(m[1]);
  assert.deepEqual([...clientActions].sort(), ["RESPOND_DOCUMENT", "SUBMIT"]);
  const messages = ["This step is not available."];
  for (const type of clientActions) {
    try {
      payloadFor(type, {}, {});
    } catch (error) {
      messages.push(error.message);
    }
  }
  assert.ok(messages.includes("This request is no longer on screen."));
  try {
    payloadFor("NOT_AN_ACTION");
  } catch (error) {
    assert.equal(error.message, "This step is not available.");
  }
  for (const text of messages) {
    assert.ok(Object.hasOwn(SENTENCES, text), text);
    assert.notEqual(sentence(text, "zh-Hans"), text);
  }
});

// ---------------------------------------------------------------------------
// The version-2 intake (Task 7): every visible sub-step, Review & submit,
// Documents, the submitted page and the progress page's open cards
// ---------------------------------------------------------------------------

// The married sample, its free text (names, job titles, the contact note and
// the street) in characters that are the same in both scripts.
const intakeAnswers = (overrides = {}) => {
  const answers = makeSampleAnswers({ version: 2, seed: 1, married: true });
  return {
    ...answers,
    tp_first_name: "美",
    tp_last_name: "林",
    tp_job_title: "工人",
    best_contact_note: "晚上",
    addr_street: "中山路 100",
    sp_first_name: "文",
    sp_last_name: "林",
    sp_job_title: "店主",
    hh: answers.hh.map((member) => ({ ...member, first_name: "中", last_name: "林" })),
    ...overrides,
  };
};

const intakeCase = (overrides = {}) =>
  v2Case({ stage: "draft", clientNumber: null, answers: {}, documentCards: [], ...overrides });

const ALL_VISIBLE = visibleSubsteps(intakeAnswers(), cardsFor(intakeAnswers(), []));

const intakeState = (overrides = {}) =>
  baseState({
    screen: "intake",
    savedCase: intakeCase(),
    draftAnswers: intakeAnswers(),
    formSubstep: "before.ready",
    visitedSubsteps: ALL_VISIBLE,
    revealed: [],
    ...overrides,
  });

// Later, Don't have and Not done side by side, and the Maybe needed card still open.
const MARKED = [
  { slotId: "ssn.tp", status: "later" },
  { slotId: "photo_id.sp", status: "none" },
  { slotId: "w2.household", status: "later" },
];

// Alerts of each kind: a missing answer, a household member's missing date
// and an invalid email, with document warnings beside them.
const withAlerts = () => {
  const answers = intakeAnswers({ email: "lin.mei@" });
  delete answers.tp_phone;
  answers.hh = answers.hh.map(({ dob, ...member }) => member);
  return answers;
};

const INTAKE_STATES = {
  ...Object.fromEntries(
    ALL_VISIBLE.map((id) => [
      `intake: ${id}`,
      intakeState({ formSubstep: id, savedCase: intakeCase({ documentCards: MARKED }), openPanels: [`maybe:${id}`] }),
    ]),
  ),
  "intake: the senior wording": intakeState({ formSubstep: "about.you", draftAnswers: intakeAnswers({ form_version: "senior" }) }),
  "intake: Back to summary, a conflict, a failed save and an error": intakeState({
    formSubstep: "about.address",
    returnToSummary: true,
    conflict: { serverRevision: 7, baseRevision: 6 },
    saveState: "failed",
    retryable: true,
    error: { code: "CONFLICT", message: "Someone else updated this application. Refresh and try again." },
  }),
  "intake: an invalid answer revealed": intakeState({ formSubstep: "about.you", draftAnswers: withAlerts(), revealed: ["email", "tp_phone"] }),
  "review: alerts and warnings": intakeState({
    formSubstep: "review.check",
    draftAnswers: withAlerts(),
    savedCase: intakeCase({ documentCards: MARKED }),
  }),
  "review: no alerts and no warnings": intakeState({
    formSubstep: "review.check",
    draftAnswers: intakeAnswers({ service: "same_day" }),
  }),
  "review: the summary with marked cards": intakeState({ formSubstep: "review.summary", savedCase: intakeCase({ documentCards: MARKED }) }),
  "review: the summary with nothing answered in a part": intakeState({ formSubstep: "review.summary", draftAnswers: withAlerts() }),
  "review: submit with alerts": intakeState({ formSubstep: "review.submit", draftAnswers: withAlerts() }),
  "review: submit, confirmed and busy": intakeState({ formSubstep: "review.submit", openPanels: ["confirmed"], busy: true, saveState: "saving" }),
  "same-day: the bring list": intakeState({ formSubstep: "documents.bring", draftAnswers: intakeAnswers({ service: "same_day" }) }),
  "same-day: the summary": intakeState({ formSubstep: "review.summary", draftAnswers: intakeAnswers({ service: "same_day" }) }),
  "the submitted page": intakeState({
    savedCase: intakeCase({
      stage: "received",
      answers: intakeAnswers(),
      contact: { phone: "2155550123", spousePhone: null, bestContactTime: ["weekday_morning"], bestContactNote: "晚上" },
    }),
    draftAnswers: {},
  }),
  "progress: open document cards, Later and Not done": baseState({
    screen: "progress",
    savedCase: v2Case({ stage: "received", answers: intakeAnswers(), documentCards: MARKED }),
  }),
};

for (const [name, state] of Object.entries(INTAKE_STATES)) {
  test(`简体: ${name} has nothing left in English`, () => {
    const html = render({ ...state, lang: "zh-Hans" });
    assert.deepEqual(latinLeaks(textOf(html), DATA), []);
    assert.match(textOf(html), /\p{Script=Han}/u);
  });
  test(`繁體: ${name} has nothing in English and no Simplified character`, () => {
    const html = render({ ...state, lang: "zh-Hant" });
    assert.deepEqual(latinLeaks(textOf(html), DATA), []);
    const text = textOf(withoutSwitchNames(html));
    assert.equal(toTw(text), text);
  });
}

test("the intake sweep covers every visible sub-step of the married sample", () => {
  assert.ok(ALL_VISIBLE.length >= 30, ALL_VISIBLE.length);
  for (const id of ["about.spouse", "household.members", "documents.identity", "notes.anything", "review.submit"])
    assert.ok(ALL_VISIBLE.includes(id), id);
  // The free text holds no Latin letters beyond the city and state.
  const latin = Object.entries(intakeAnswers()).filter(
    ([id, value]) => typeof value === "string" && /[A-Za-z]/.test(value) && findQuestion(2, id)?.type === "text",
  );
  assert.deepEqual(latin.map(([id]) => id).sort(), ["addr_city", "addr_state"]);
});

test("English is the default on every intake state too", () => {
  for (const state of Object.values(INTAKE_STATES)) assert.equal(render({ ...state, lang: "en" }), render(state));
});

test("the draft buttons put the current language's form first, then the other two", () => {
  const forms = (lang) =>
    [...client.intakeScreen(intakeState({ formSubstep: "review.summary", lang })).matchAll(/data-action="view-draft" data-form="([^"]+)"/g)].map(
      (m) => m[1],
    );
  assert.deepEqual(forms("en"), ["en", "zh-s", "zh-t"]);
  assert.deepEqual(forms("zh-Hans"), ["zh-s", "en", "zh-t"]);
  assert.deepEqual(forms("zh-Hant"), ["zh-t", "en", "zh-s"]);
  // The first is the main button, named from the table; the others are named in the screen's script.
  const zh = client.intakeScreen(intakeState({ formSubstep: "review.summary", lang: "zh-Hans" }));
  assert.match(zh, new RegExp(`data-form="zh-s"[^>]*>[\\s\\S]*?${t("draft.view", {}, "zh-Hans")}</button>`));
  assert.match(zh, new RegExp(`data-form="en"[^>]*>${t("draft.form_en", {}, "zh-Hans")}</button>`));
  const hant = client.intakeScreen(intakeState({ formSubstep: "review.summary", lang: "zh-Hant" }));
  assert.match(hant, /data-form="zh-s"[^>]*>簡體中文版<\/button>/);
});

test("the summary's printed date is today's long date in the screen's language", () => {
  const today = new Date(2026, 9, 5);
  const html = (lang) => intakeFormV2(intakeState({ formSubstep: "review.summary", lang }), { today });
  assert.match(html("zh-Hans"), /2026年10月5日/);
  assert.match(html("zh-Hant"), /2026年10月5日/);
  assert.match(html(undefined), /October 5, 2026/);
});

test("the intake's Change links, alerts and Upload now keep their actions in Chinese", () => {
  const html = render({ ...INTAKE_STATES["review: alerts and warnings"], lang: "zh-Hans" });
  assert.match(html, /data-action="go-substep" data-substep="household\.members"[^>]*><span class="alert-q">成员 1：/);
  assert.ok(html.includes(t("alert.missing", {}, "zh-Hans")) && html.includes(t("alert.invalid", {}, "zh-Hans")));
  assert.match(html, new RegExp(`data-focus="doc-w2-household"[^>]*>${t("review.upload_now", {}, "zh-Hans")}<`));
  const summary = render({ ...INTAKE_STATES["review: the summary with marked cards"], lang: "zh-Hans" });
  assert.match(summary, /data-action="change-substep" data-substep="about\.address">修改<\/button>/);
});
