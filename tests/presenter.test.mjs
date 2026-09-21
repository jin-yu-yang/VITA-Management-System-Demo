import test from "node:test";
import assert from "node:assert/strict";
import {
  renderPresenterPanel,
  resetDialogBody,
  checkpointDialogBody,
} from "../src/presenter-views.mjs";
import { page, staffScreen, dialog } from "../src/views.mjs";
import { applicationsScreen } from "../src/client-views.mjs";
import { CHECKPOINTS } from "../src/contracts.mjs";

const PEOPLE = [
  { id: "person-alex", name: "Alex", capabilities: ["prepare"] },
  { id: "person-morgan", name: "Morgan", capabilities: ["review"] },
  { id: "person-sam", name: "Sam", capabilities: ["admin", "followup"] },
];

const caseRow = (overrides = {}) => ({
  id: "case-1",
  reference: "VT-AB2C-DE3F",
  stage: "preparation_ready",
  revision: 3,
  fixture: true,
  answers: { language: "Mandarin" },
  ...overrides,
});

const presenterView = (overrides = {}) => ({
  principal: {
    userId: "user-1",
    workspaceId: "3f2a91c7-1111-2222-3333-444455556666",
    access: "presenter",
  },
  people: PEOPLE,
  selectedPersonId: "person-alex",
  connection: "online",
  workspace: {
    id: "3f2a91c7-1111-2222-3333-444455556666",
    fixtureGeneration: 4,
    defaultFollowupPersonId: "person-sam",
  },
  cases: [caseRow(), caseRow({ id: "case-2", reference: "VT-KK44-MM55", fixture: false })],
  ...overrides,
});

// The controls in this panel are the two only a presenter may use. Every one
// of them has to be absent — not disabled, not explained — for anybody else.
const PRIVILEGED = [
  'data-action="open-reset-fixtures"',
  'data-action="open-checkpoint"',
  'data-action="select-person"',
];

test("an applicant is offered no presenter control at all", () => {
  for (const principal of [
    null,
    undefined,
    { userId: "user-2", workspaceId: "w1", access: "applicant" },
    { access: "" },
  ])
    assert.equal(
      renderPresenterPanel(presenterView({ principal })),
      "",
      "the panel is empty for anybody but a presenter",
    );
  // Called with nothing at all, it is still empty rather than a crash.
  assert.equal(renderPresenterPanel(), "");
  assert.equal(renderPresenterPanel({}), "");
});

test("a presenter gets the reset, the checkpoints and the persona choice", () => {
  const html = renderPresenterPanel(presenterView());
  for (const control of PRIVILEGED) assert.ok(html.includes(control), control);
  // One button per person, and the acting persona says so to a screen reader.
  for (const person of PEOPLE) assert.ok(html.includes(person.name), person.name);
  assert.match(html, /data-person-id="person-alex" aria-pressed="true"/);
  assert.match(html, /data-person-id="person-morgan" aria-pressed="false"/);
  // The fictional-details helper stays reachable from here too.
  assert.match(html, /data-action="fill-assisted-intake"/);
});

test("the panel says which class workspace and which sample set is on screen", () => {
  const html = renderPresenterPanel(presenterView());
  const indicator = html.match(
    /data-role="fixture-indicator">([^<]*)</,
  )?.[1];
  assert.ok(indicator, "the indicator is rendered");
  // The short form of the workspace id, the generation, and how many sample
  // cases are actually on screen.
  assert.match(indicator, /3f2a91c7/);
  assert.match(indicator, /sample set 4/);
  assert.match(indicator, /1 sample case/);
  // A workspace that has not been read yet says so rather than showing a blank.
  assert.match(
    renderPresenterPanel(presenterView({ workspace: null })),
    /sample set not loaded/,
  );
  // Generation zero is a number, not an absence.
  assert.match(
    renderPresenterPanel(
      presenterView({ workspace: { id: "abc12345-0000", fixtureGeneration: 0 } }),
    ),
    /sample set 0/,
  );
});

test("the panel states the connection it is working over", () => {
  assert.match(renderPresenterPanel(presenterView()), /Connected/);
  assert.match(
    renderPresenterPanel(presenterView({ connection: "reconnecting" })),
    /Reconnecting/,
  );
  assert.match(
    renderPresenterPanel(presenterView({ connection: "offline" })),
    /No connection/,
  );
});

test("both presenter controls confirm before they change anything", () => {
  // Nothing in the panel acts on its own: each control opens a dialog.
  const html = renderPresenterPanel(presenterView());
  assert.ok(!html.includes('data-action="confirm-reset-fixtures"'));
  assert.ok(!html.includes('id="checkpoint-form"'));

  const state = { dialog: "reset-fixtures", cases: presenterView().cases };
  const reset = dialog(state);
  assert.match(reset, /Reset the sample cases\?/);
  assert.match(reset, /data-action="confirm-reset-fixtures"/);
  assert.match(reset, /data-action="close-dialog"/);
  // It says what survives, because that is the question somebody about to
  // press it is actually asking.
  assert.match(reset, /Applications this class created stay exactly as they are/);
  assert.match(reset, /Nobody is emailed/);

  const checkpoint = dialog({ ...state, dialog: "load-checkpoint" });
  assert.match(checkpoint, /<form id="checkpoint-form"/);
  assert.match(checkpoint, /name="caseId"/);
  assert.match(checkpoint, /name="checkpoint"/);
  assert.match(checkpoint, /type="submit"/);
  for (const name of CHECKPOINTS)
    assert.ok(checkpoint.includes(`value="${name}"`), name);
});

test("only the sample cases can be moved to a checkpoint", () => {
  const html = checkpointDialogBody({ cases: presenterView().cases });
  assert.ok(html.includes('value="case-1"'), "the sample case is offered");
  assert.ok(
    !html.includes('value="case-2"'),
    "a case this class created is not a demonstration prop",
  );
  // With nothing seeded yet, it says so and offers the one control that helps.
  const empty = checkpointDialogBody({ cases: [] });
  assert.match(empty, /no sample cases in this workspace yet/);
  assert.match(empty, /data-action="open-reset-fixtures"/);
  assert.ok(!empty.includes("checkpoint-form"));
  assert.equal(checkpointDialogBody().includes("checkpoint-form"), false);
  assert.ok(resetDialogBody().includes("confirm-reset-fixtures"));
});

test("the staff frame carries the panel and a client page carries none of it", () => {
  const state = {
    ...presenterView(),
    screen: "staff",
    savedCase: null,
    assistance: [],
    boardFilters: {},
    openPanels: [],
    error: null,
    notice: null,
    dialog: null,
  };
  const staff = page(state, staffScreen(state));
  for (const control of PRIVILEGED) assert.ok(staff.includes(control), control);
  assert.match(staff, /Presenter controls/);

  const clientState = {
    principal: { userId: "user-2", workspaceId: "w1", access: "applicant" },
    people: [],
    cases: [caseRow({ fixture: false })],
    assistance: [],
    openPanels: [],
    draftAnswers: {},
    error: null,
    notice: null,
    dialog: null,
    connection: "online",
    screen: "applications",
  };
  const client = page(clientState, applicationsScreen(clientState));
  for (const control of PRIVILEGED)
    assert.ok(!client.includes(control), `a client must not see ${control}`);
  assert.ok(!client.includes("Presenter controls"));
  assert.ok(!client.includes("Reset sample cases"));
});

test("a reset somebody else ran is said plainly, and dismissed", () => {
  const state = {
    principal: { userId: "user-2", workspaceId: "w1", access: "applicant" },
    people: [],
    cases: [],
    assistance: [],
    openPanels: [],
    draftAnswers: {},
    connection: "online",
    screen: "applications",
    error: null,
    notice: "Sample cases were reset. The one you had open is no longer there.",
    dialog: null,
  };
  const html = page(state, applicationsScreen(state));
  assert.match(html, /notice-banner/);
  assert.match(html, /Sample cases were reset/);
  assert.match(html, /role="status"/);
  assert.match(html, /data-action="dismiss-error"/);
  // It is not an alert: nothing failed.
  assert.ok(!/notice-banner[^>]*role="alert"/.test(html));
  assert.ok(!page({ ...state, notice: null }, "").includes("notice-banner"));
});
