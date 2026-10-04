import test from "node:test";
import assert from "node:assert/strict";
import { createController } from "../src/controller.mjs";
import { POOL_FILTER_KEYS } from "../src/pool-views.mjs";
import { saveStatus } from "../src/client-views.mjs";
import { CONTACT_FIELDS, isMemberId } from "../src/intake-catalogue.mjs";
import { withholdInvalid } from "../src/intake-form.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";

// Doubles, not mocks: every test asserts the envelopes that reach the store and
// the state the controller ends in, never "this function was called".

function fakeSession(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      data.set(key, String(value));
    },
    removeItem: (key) => {
      data.delete(key);
    },
    keys: () => [...data.keys()],
    raw: (key) => (data.has(key) ? data.get(key) : null),
  };
}

function fakeEvents() {
  const handlers = new Map();
  return {
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      handlers.get(type)?.delete(handler);
    },
    count: (type) => handlers.get(type)?.size ?? 0,
    async emit(type) {
      for (const handler of [...(handlers.get(type) ?? [])]) await handler();
    },
  };
}

// A store double that records every read and every action envelope.
function fakeStore({
  principal = { userId: "user-1", workspaceId: "w1", access: "applicant" },
  cases = [],
  people = [],
  assistance = [],
  workspace = {
    id: "w1",
    fixtureGeneration: 3,
    defaultFollowupPersonId: "person-sam",
    defaultIntakeVersion: 1,
  },
} = {}) {
  const records = new Map(cases.map((entry) => [entry.id, entry]));
  const items = new Map(assistance.map((entry) => [entry.id, entry]));
  const store = {
    workspace,
    calls: [],
    writes: [],
    subscriptions: 0,
    released: 0,
    handlers: null,
    failNext: null,
    records,
    async getPrincipal() {
      store.calls.push("getPrincipal");
      if (principal instanceof Error) throw principal;
      return principal;
    },
    async listPeople() {
      store.calls.push("listPeople");
      return people;
    },
    async listCases() {
      store.calls.push("listCases");
      return [...records.values()];
    },
    async getCase(id) {
      store.calls.push(`getCase:${id}`);
      const found = records.get(id);
      if (!found) throw Object.assign(new Error("gone"), { code: "NOT_FOUND" });
      return found;
    },
    async createCase(request) {
      store.calls.push("createCase");
      store.writes.push(request);
      const failure = store.failNext;
      if (failure) {
        store.failNext = null;
        throw failure;
      }
      const seen = [...records.values()].find(
        (entry) => entry.createdBy === request.actionId,
      );
      if (seen)
        return {
          actionId: request.actionId,
          caseId: seen.id,
          reference: seen.reference,
          revision: seen.revision,
        };
      const id = `case-${records.size + 1}`;
      records.set(id, {
        id,
        reference: `VT-NEW${records.size + 1}-AAAA`,
        stage: "draft",
        revision: 1,
        answers: {},
        createdBy: request.actionId,
      });
      return {
        actionId: request.actionId,
        caseId: id,
        reference: records.get(id).reference,
        revision: 1,
      };
    },
    async act(action) {
      store.calls.push(`act:${action.type}`);
      store.writes.push(action);
      const failure = store.failNext;
      if (failure) {
        store.failNext = null;
        throw failure;
      }
      const record = records.get(action.caseId);
      const next = {
        ...record,
        revision: record.revision + 1,
        answers:
          action.type === "SAVE_ANSWERS"
            ? { ...action.payload.answers }
            : record.answers,
      };
      records.set(action.caseId, next);
      return {
        actionId: action.actionId,
        caseId: action.caseId,
        reference: next.reference,
        revision: next.revision,
      };
    },
    items,
    async listAssistance() {
      store.calls.push("listAssistance");
      return [...items.values()];
    },
    async actAssistance(request) {
      store.calls.push(`actAssistance:${request.type}`);
      store.writes.push(request);
      const failure = store.failNext;
      if (failure) {
        store.failNext = null;
        throw failure;
      }
      const current = items.get(request.itemId);
      items.set(request.itemId, {
        ...current,
        revision: current.revision + 1,
        status: request.type === "CLAIM" ? "assigned" : "resolved",
        assigneeId:
          request.type === "CLAIM" ? request.personId : current.assigneeId,
        resolutionNote: request.note ?? current.resolutionNote,
      });
    },
    async getWorkspace() {
      store.calls.push("getWorkspace");
      return { ...store.workspace };
    },
    // The demonstration set, as the database treats it: the fixture cases are
    // replaced by new ones with new ids, and the generation moves once.
    async resetFixtures(request) {
      store.calls.push("resetFixtures");
      store.writes.push(request);
      const failure = store.failNext;
      if (failure) {
        store.failNext = null;
        throw failure;
      }
      if (store.seeded.has(request.actionId)) return;
      store.seeded.add(request.actionId);
      for (const [id, record] of [...records])
        if (record.fixture) records.delete(id);
      store.workspace = {
        ...store.workspace,
        fixtureGeneration: store.workspace.fixtureGeneration + 1,
      };
      const id = `fixture-${store.workspace.fixtureGeneration}`;
      records.set(id, {
        id,
        reference: `VT-SEED-${store.workspace.fixtureGeneration}AAA`,
        stage: "preparation_ready",
        revision: 4,
        fixture: true,
        answers: {},
      });
    },
    async loadCheckpoint(request) {
      store.calls.push("loadCheckpoint");
      store.writes.push(request);
      const failure = store.failNext;
      if (failure) {
        store.failNext = null;
        throw failure;
      }
      if (store.seeded.has(request.actionId)) return;
      store.seeded.add(request.actionId);
      const record = records.get(request.caseId);
      records.set(request.caseId, {
        ...record,
        revision: record.revision + 1,
        stage: "preparation_ready",
      });
    },
    seeded: new Set(),
    subscribe(handlers) {
      store.subscriptions += 1;
      store.handlers = handlers;
      return () => {
        store.released += 1;
        store.handlers = null;
      };
    },
  };
  return store;
}

const idleAuth = () => ({
  getSession: async () => ({ user: { id: "user-1" } }),
  subscribe: () => () => {},
  signOut: async () => {},
  cooldownRemaining: () => 0,
});

function build(options = {}) {
  // `focus` records the argument of every render, because it decides whether
  // the rebuilt page takes the keyboard back to the top.
  const renders = { count: 0, focus: [] };
  const events = options.windowEvents ?? fakeEvents();
  const sessionStorage = options.sessionStorage ?? fakeSession();
  const controller = createController({
    store: options.store,
    auth: options.auth ?? idleAuth(),
    render: (focus = false) => {
      renders.count += 1;
      renders.focus.push(focus === true);
    },
    sessionStorage,
    windowEvents: events,
    clock: options.clock,
    newActionId: options.newActionId,
    cooldownSeconds: options.cooldownSeconds,
  });
  return { controller, events, sessionStorage, renders };
}

// ---------------------------------------------------------------------------
// The task brief's test, verbatim.
// ---------------------------------------------------------------------------
test("remote refresh preserves unsaved answers", async () => {
  let current = {
    id: "case-a",
    revision: 1,
    stage: "draft",
    answers: { firstName: "Old" },
  };
  const writes = [];
  const store = {
    getPrincipal: async () => ({ userId: "a", access: "applicant" }),
    listCases: async () => [current],
    getCase: async () => current,
    act: async (action) => {
      writes.push(action);
      current = {
        ...current,
        revision: current.revision + 1,
        answers: action.payload.answers,
      };
      return {
        actionId: action.actionId,
        caseId: current.id,
        revision: current.revision,
      };
    },
    subscribe: () => () => {},
  };
  const controller = createController({
    store,
    auth: { getSession: async () => ({}), subscribe: () => () => {} },
    render: () => {},
    sessionStorage: { getItem: () => null, setItem: () => {} },
  });
  await controller.start();
  await controller.selectCase("case-a");
  controller.editAnswers({ firstName: "Unsaved" });
  current = { ...current, revision: 2, answers: { firstName: "Server edit" } };
  await controller.refresh();
  assert.equal(controller.getState().draftAnswers.firstName, "Unsaved");
  assert.equal(controller.getState().savedCase.revision, 2);
  assert.equal(controller.getState().savedCase.answers.firstName, "Server edit");
  assert.equal(controller.getState().editBaseRevision, 1);
  assert.deepEqual(controller.getState().conflict, {
    code: "REMOTE_CHANGED",
    baseRevision: 1,
    serverRevision: 2,
  });
  await assert.rejects(controller.saveAnswers(), (error) => error.code === "CONFLICT");
  assert.equal(writes.length, 0);
  await assert.rejects(
    controller.reconcileAnswers({
      answers: { firstName: "Chosen" },
      expectedServerRevision: 1,
    }),
    (error) => error.code === "CONFLICT",
  );
  await controller.reconcileAnswers({
    answers: { firstName: "Chosen" },
    expectedServerRevision: 2,
  });
  assert.equal(controller.getState().conflict, null);
  assert.equal(controller.getState().editBaseRevision, 2);
  await controller.saveAnswers();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].type, "SAVE_ANSWERS");
  assert.equal(writes[0].expectedRevision, 2);
  assert.equal(writes[0].payload.answers.firstName, "Chosen");
  controller.stop();
});

// The browser story's two-window conflict, with the re-reads a real window has
// in flight when the person presses "Keep my edits": Realtime publishes more
// than one row per action, so a re-read can answer after the choice — and one
// that left before the other window saved answers with the older revision.
test("re-reads that land after a reconcile never replace the chosen answers", async () => {
  let current = { id: "case-a", revision: 1, stage: "draft", answers: { residenceCity: "Base" } };
  const held = [];
  let hold = false;
  const writes = [];
  const store = {
    getPrincipal: async () => ({ userId: "a", access: "applicant" }),
    listCases: async () => [current],
    getCase: async () => {
      const snapshot = current;
      if (!hold) return snapshot;
      return await new Promise((resolve) => held.push(() => resolve(snapshot)));
    },
    act: async (action) => {
      writes.push(action);
      return { actionId: action.actionId, caseId: current.id, revision: current.revision + 1 };
    },
    subscribe: () => () => {},
  };
  const controller = createController({
    store,
    auth: { getSession: async () => ({}), subscribe: () => () => {} },
    render: () => {},
    sessionStorage: { getItem: () => null, setItem: () => {} },
  });
  await controller.start();
  await controller.selectCase("case-a");
  controller.editAnswers({ residenceCity: "Keepmine City" });

  // A re-read that leaves before the other window saves, and answers late.
  hold = true;
  const stale = controller.refresh();
  hold = false;
  current = { ...current, revision: 2, answers: { residenceCity: "Otherwindow City" } };
  await controller.refresh();
  assert.equal(controller.getState().conflict?.serverRevision, 2);
  // One more that sees the other window's save and is still in flight.
  hold = true;
  const late = controller.refresh();
  hold = false;

  await controller.reconcileAnswers({
    answers: controller.getState().draftAnswers,
    expectedServerRevision: 2,
  });
  for (const release of held.splice(0)) release();
  await Promise.all([stale, late]);

  const state = controller.getState();
  assert.equal(state.draftAnswers.residenceCity, "Keepmine City");
  assert.equal(state.conflict, null);
  assert.equal(state.dirty, true);
  assert.equal(state.editBaseRevision, 2);
  await controller.saveAnswers();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].expectedRevision, 2);
  assert.equal(writes[0].payload.answers.residenceCity, "Keepmine City");
  controller.stop();
});

// ---------------------------------------------------------------------------

test("start reads the principal before subscribing and makes no staff read as an applicant", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} }],
  });
  const { controller, events } = build({ store });
  await controller.start();
  assert.equal(store.calls[0], "getPrincipal");
  assert.ok(!store.calls.includes("listPeople"));
  assert.equal(store.subscriptions, 1);
  // The subscription is opened only after identity is known.
  assert.ok(store.calls.indexOf("getPrincipal") < store.calls.indexOf("listCases"));
  assert.equal(controller.getState().principal.userId, "user-1");
  assert.equal(controller.getState().cases.length, 1);
  assert.equal(events.count("focus"), 1);
  assert.equal(events.count("online"), 1);
  controller.stop();
  assert.equal(store.released, 1);
  assert.equal(events.count("focus"), 0);
  assert.equal(events.count("online"), 0);
});

test("an identity failure never reaches the subscription path", async () => {
  const store = fakeStore({
    principal: Object.assign(new Error("no access"), { code: "FORBIDDEN" }),
  });
  const { controller } = build({ store });
  await controller.start();
  assert.equal(store.subscriptions, 0);
  assert.equal(controller.getState().error.code, "FORBIDDEN");
  assert.equal(controller.getState().principal, null);
  controller.stop();
});

test("a presenter start loads people and the staff landing", async () => {
  const store = fakeStore({
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    people: [{ id: "person-1", name: "Alex", capabilities: ["prepare"] }],
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "received", revision: 1, answers: {} }],
  });
  const { controller } = build({ store });
  await controller.start();
  assert.ok(store.calls.includes("listPeople"));
  assert.equal(controller.getState().people.length, 1);
  assert.equal(controller.getState().screen, "staff");
  controller.stop();
});

test("an out-of-order response never replaces a newer known revision", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 4, answers: { firstName: "New" } }],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("case-a");
  assert.equal(controller.getState().savedCase.revision, 4);
  // A slow earlier read lands after the newer one.
  store.records.set("case-a", {
    id: "case-a",
    reference: "VT-AAAA-BBBB",
    stage: "draft",
    revision: 2,
    answers: { firstName: "Stale" },
  });
  await controller.refresh();
  assert.equal(controller.getState().savedCase.revision, 4);
  assert.equal(controller.getState().savedCase.answers.firstName, "New");
  assert.equal(controller.getState().conflict, null);
  controller.stop();
});

test("a subscribed change refreshes the affected case, and another case's change does not", async () => {
  const store = fakeStore({
    cases: [
      { id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} },
      { id: "case-b", reference: "VT-CCCC-DDDD", stage: "draft", revision: 1, answers: {} },
    ],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("case-a");
  const before = store.calls.filter((entry) => entry === "getCase:case-a").length;
  await store.handlers.onChange({ table: "client_events", eventType: "INSERT", id: "e1", caseId: "case-b" });
  assert.equal(
    store.calls.filter((entry) => entry === "getCase:case-a").length,
    before,
  );
  await store.handlers.onChange({ table: "client_events", eventType: "INSERT", id: "e2", caseId: "case-a" });
  assert.equal(
    store.calls.filter((entry) => entry === "getCase:case-a").length,
    before + 1,
  );
  // A case row change also refreshes the list behind "My applications".
  const lists = store.calls.filter((entry) => entry === "listCases").length;
  await store.handlers.onChange({ table: "cases", eventType: "UPDATE", id: "case-b", caseId: "case-b" });
  assert.equal(store.calls.filter((entry) => entry === "listCases").length, lists + 1);
  store.handlers.onConnection("offline");
  assert.equal(controller.getState().connection, "offline");
  controller.stop();
  assert.equal(store.released, 1);
});

test("only a screen change asks the page to take the keyboard back", async () => {
  // The render argument is how the wiring layer knows a new screen was drawn:
  // a new screen puts the keyboard at the top of it, and a rebuild of the same
  // screen — a refresh, somebody else's change, a refused action — must leave
  // it where the person put it.
  const store = fakeStore({
    cases: [
      { id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} },
      { id: "case-b", reference: "VT-CCCC-DDDD", stage: "draft", revision: 1, answers: {} },
    ],
  });
  const { controller, renders, events } = build({ store });
  await controller.start();
  const since = () => renders.focus.slice(mark);
  let mark = renders.focus.length;
  controller.navigate("applications");
  assert.deepEqual(since(), [true], "navigating is a screen change");

  mark = renders.focus.length;
  await controller.selectCase("case-a");
  assert.ok(since().includes(true), "opening a case is a screen change");

  // Everything that redraws the screen the person is already on.
  mark = renders.focus.length;
  await controller.selectCase("case-b", { navigate: false });
  await controller.refresh();
  await events.emit("focus");
  await store.handlers.onChange({
    table: "cases",
    eventType: "UPDATE",
    id: "case-a",
    caseId: "case-a",
  });
  store.handlers.onConnection("offline");
  controller.togglePanel("confirmed");
  controller.openDialog("help");
  controller.closeDialog();
  store.failNext = Object.assign(new Error("no"), { code: "CONFLICT" });
  await assert.rejects(() => controller.runAction("SUBMIT", { confirmed: true }));
  assert.ok(since().length > 0, "these really did re-render");
  assert.deepEqual(
    since().filter(Boolean),
    [],
    "a rebuild of the same screen never moves the keyboard",
  );
  controller.stop();
});

test("focus and online events refresh, and stop removes the listeners", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} }],
  });
  const { controller, events } = build({ store });
  await controller.start();
  const before = store.calls.filter((entry) => entry === "listCases").length;
  await events.emit("focus");
  await events.emit("online");
  assert.equal(
    store.calls.filter((entry) => entry === "listCases").length,
    before + 2,
  );
  controller.stop();
  await events.emit("focus");
  assert.equal(
    store.calls.filter((entry) => entry === "listCases").length,
    before + 2,
  );
});

test("save state moves unsaved to saving to saved, and an edit whitelists its keys", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} }],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("case-a");
  assert.equal(controller.getState().saveState, "idle");
  controller.editAnswers({ firstName: "Mei", ownerUserId: "forged", stage: "closed" });
  assert.equal(controller.getState().saveState, "unsaved");
  assert.equal(controller.getState().dirty, true);
  assert.equal(controller.getState().editBaseRevision, 1);
  assert.equal(Object.hasOwn(controller.getState().draftAnswers, "ownerUserId"), false);
  assert.equal(Object.hasOwn(controller.getState().draftAnswers, "stage"), false);
  const seen = [];
  const saving = controller.saveAnswers();
  seen.push(controller.getState().saveState);
  await saving;
  seen.push(controller.getState().saveState);
  assert.deepEqual(seen, ["saving", "saved"]);
  assert.equal(controller.getState().dirty, false);
  assert.equal(controller.getState().editBaseRevision, null);
  assert.equal(store.writes[0].payload.answers.firstName, "Mei");
  assert.equal(Object.hasOwn(store.writes[0].payload.answers, "ownerUserId"), false);
  assert.equal(store.writes[0].personId, null);
  assert.equal(controller.getState().savedCase.revision, 2);
  controller.stop();
});

test("a failed save keeps the draft editable and retries the identical envelope", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} }],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("case-a");
  controller.editAnswers({ firstName: "Mei" });
  store.failNext = Object.assign(new Error("offline"), { code: "OFFLINE" });
  await assert.rejects(controller.saveAnswers(), (error) => error.code === "OFFLINE");
  assert.equal(controller.getState().saveState, "failed");
  assert.equal(controller.getState().dirty, true);
  assert.equal(controller.getState().draftAnswers.firstName, "Mei");
  assert.equal(controller.getState().retryable, true);
  await controller.retryLast();
  assert.equal(store.writes.length, 2);
  // The same envelope object: same action id, payload, persona and expectation.
  assert.equal(store.writes[0], store.writes[1]);
  assert.equal(store.writes[1].actionId, store.writes[0].actionId);
  assert.equal(controller.getState().saveState, "saved");
  assert.equal(controller.getState().retryable, false);
  assert.equal(controller.getState().dirty, false);
  controller.stop();
});

test("a retained envelope never outlives the answers it was built from", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} }],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("case-a");
  controller.editAnswers({ firstName: "First try" });
  store.failNext = Object.assign(new Error("offline"), { code: "OFFLINE" });
  await assert.rejects(controller.saveAnswers(), (error) => error.code === "OFFLINE");
  assert.equal(controller.getState().retryable, true);
  // The person keeps typing while the save is still unsent.
  controller.editAnswers({ firstName: "Newer answer" });
  assert.equal(
    controller.getState().retryable,
    false,
    "no banner may still offer to re-send the older answers",
  );
  assert.equal(await controller.retryLast(), null);
  assert.equal(store.writes.length, 1, "the stale envelope is never re-sent");
  assert.equal(controller.getState().draftAnswers.firstName, "Newer answer");
  assert.equal(controller.getState().dirty, true);
  // Saving now sends the newer answers under a fresh envelope.
  await controller.saveAnswers();
  assert.equal(store.writes.length, 2);
  assert.notEqual(store.writes[1].actionId, store.writes[0].actionId);
  assert.equal(store.writes[1].payload.answers.firstName, "Newer answer");
  assert.equal(controller.getState().savedCase.answers.firstName, "Newer answer");
  controller.stop();
});

test("an unreachable server is never shown as a sign-in form, and retries by itself", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} }],
  });
  let reachable = false;
  const auth = {
    ...idleAuth(),
    getSession: async () => {
      if (!reachable)
        throw Object.assign(
          new Error("The demo cannot reach the server. Check the connection."),
          { code: "OFFLINE" },
        );
      return { user: { id: "user-1" } };
    },
  };
  const { controller, events } = build({ store, auth });
  await controller.start();
  let state = controller.getState();
  assert.equal(state.session, "unknown", "whether they are signed in is not known");
  assert.equal(state.principal, null);
  assert.equal(state.error.code, "OFFLINE");
  assert.equal(store.calls.length, 0, "nothing is read and nothing is subscribed");
  assert.equal(store.subscriptions, 0);
  // Coming back to the window re-attempts the identity load.
  await events.emit("focus");
  assert.equal(controller.getState().session, "unknown");
  reachable = true;
  await events.emit("online");
  state = controller.getState();
  assert.equal(state.session, "present");
  assert.equal(state.principal.userId, "user-1");
  assert.equal(state.error, null);
  assert.equal(state.cases.length, 1);
  assert.equal(store.subscriptions, 1);
  controller.stop();
});

test("a signed-in visitor the server cannot identify is not signed out either", async () => {
  const store = fakeStore({
    principal: Object.assign(new Error("offline"), { code: "OFFLINE" }),
  });
  const { controller } = build({ store });
  await controller.start();
  const state = controller.getState();
  assert.equal(state.session, "present", "the session was read; the principal was not");
  assert.equal(state.principal, null);
  assert.equal(state.error.code, "OFFLINE");
  assert.equal(store.subscriptions, 0);
  // Signing out is the one thing that makes the sign-in form right again.
  await controller.signOut();
  assert.equal(controller.getState().session, "none");
  controller.stop();
});

test("a corrected email address is the one bound, even inside the cooldown", async () => {
  const session = fakeSession();
  let now = 2_000_000;
  const sends = [];
  const verified = [];
  const auth = {
    getSession: async () => null,
    subscribe: () => () => {},
    signOut: async () => {},
    cooldownRemaining: () => 0,
    sendCode: async (email) => {
      sends.push(email);
      return {
        state: "code_entry",
        message: "If this address is eligible, check your inbox for a sign-in code.",
        retryAfterSeconds: 65,
      };
    },
    verifyCode: async (email, code) => {
      verified.push([email, code]);
    },
  };
  const { controller } = build({
    store: fakeStore(),
    auth,
    sessionStorage: session,
    clock: () => now,
    cooldownSeconds: 65,
  });
  await controller.start();
  await controller.sendCode("mei@exmaple.org");
  assert.equal(controller.getState().authEmail, "mei@exmaple.org");
  // The typo is noticed and corrected while the cooldown is still running.
  controller.restartSignIn();
  assert.equal(controller.getState().authStep, "email");
  assert.equal(controller.getState().authEmail, "");
  now += 5_000;
  assert.equal(controller.cooldownRemaining(), 60, "R38: the cooldown still runs");
  const answer = await controller.sendCode("mei@example.org");
  assert.equal(sends.length, 1, "nothing leaves inside the cooldown");
  assert.equal(
    answer.message,
    "If this address is eligible, check your inbox for a sign-in code.",
  );
  assert.equal(answer.retryAfterSeconds, 60);
  assert.equal(controller.getState().authStep, "code");
  assert.equal(
    controller.getState().authEmail,
    "mei@example.org",
    "the corrected address is bound, not the typo",
  );
  await controller.verifyCode("123456");
  assert.deepEqual(verified, [["mei@example.org", "123456"]]);
  controller.stop();

  // And the binding survives a reload, like the cooldown itself.
  now += 1_000;
  const again = build({
    store: fakeStore(),
    auth: { ...auth, getSession: async () => null },
    sessionStorage: session,
    clock: () => now,
    cooldownSeconds: 65,
  });
  session.setItem(
    "vitally:access:v1",
    JSON.stringify({
      startedAt: now - 5_000,
      email: "mei@example.org",
      message: "If this address is eligible, check your inbox for a sign-in code.",
    }),
  );
  await again.controller.start();
  assert.equal(again.controller.getState().authEmail, "mei@example.org");
  again.controller.stop();
});

test("an action that succeeded is never reported as failed by a later read", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} }],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("case-a");
  controller.editAnswers({ firstName: "Mei" });
  // The write lands, then the connection drops before the re-read.
  const realList = store.listCases;
  store.listCases = async () => {
    store.calls.push("listCases");
    throw Object.assign(new Error("offline"), { code: "OFFLINE" });
  };
  await controller.saveAnswers();
  const state = controller.getState();
  assert.equal(state.saveState, "saved", "the save is not undone by a stale view");
  assert.equal(state.dirty, false);
  assert.equal(state.retryable, false, "there is no envelope left to re-send");
  assert.equal(state.connection, "offline");
  store.listCases = realList;
  await controller.retryLast();
  assert.equal(store.writes.length, 1, "nothing is sent a second time");
  controller.stop();
});

test("panels opened on one application do not follow to another", async () => {
  const store = fakeStore({
    cases: [
      { id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} },
      { id: "case-b", reference: "VT-CCCC-DDDD", stage: "draft", revision: 1, answers: {} },
    ],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("case-a");
  controller.togglePanel("confirmed");
  controller.setFormStep(3);
  assert.deepEqual(controller.getState().openPanels, ["confirmed"]);
  await controller.selectCase("case-b");
  assert.deepEqual(controller.getState().openPanels, []);
  assert.equal(controller.getState().formStep, 0);
  controller.stop();
});

test("a refusal nobody has dismissed survives an unrelated background re-read", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} }],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("case-a");
  controller.editAnswers({ firstName: "Mei" });
  store.failNext = Object.assign(
    new Error("The demo cannot reach the server. Check the connection."),
    { code: "OFFLINE" },
  );
  await assert.rejects(controller.saveAnswers(), (error) => error.code === "OFFLINE");
  const shown = controller.getState().error;
  assert.equal(shown.code, "OFFLINE");
  assert.match(shown.message, /cannot reach the server/);

  // Somebody else's window resets the sample cases. That says nothing about
  // this person's save, and must not answer for it.
  await store.handlers.onChange({ table: "cases", eventType: "UPDATE", id: "case-a", caseId: "case-a" });
  assert.deepEqual(controller.getState().error, shown, "the reason is still on screen");
  assert.equal(controller.getState().saveState, "failed");

  // Nor does a reconnect, a window focus or any other re-read.
  await controller.refresh();
  assert.deepEqual(controller.getState().error, shown);

  // Their own next action is what clears it.
  controller.editAnswers({ lastName: "Chen" });
  assert.equal(controller.getState().error, null);
  controller.stop();
});

test("each way a person can answer a refusal clears it", async () => {
  const fresh = async () => {
    const store = fakeStore({
      cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} }],
    });
    const { controller } = build({ store });
    await controller.start();
    await controller.selectCase("case-a");
    store.failNext = Object.assign(new Error("offline"), { code: "OFFLINE" });
    await assert.rejects(controller.runAction("SUBMIT", { confirmed: true }));
    assert.equal(controller.getState().error.code, "OFFLINE");
    return { store, controller };
  };

  const dismissed = await fresh();
  dismissed.controller.dismissError();
  assert.equal(dismissed.controller.getState().error, null, "the dismiss control");
  dismissed.controller.stop();

  const navigated = await fresh();
  navigated.controller.navigate("applications");
  assert.equal(navigated.controller.getState().error, null, "navigation");
  navigated.controller.stop();

  const acted = await fresh();
  await acted.controller.runAction("SUBMIT", { confirmed: true });
  assert.equal(acted.controller.getState().error, null, "the next action");
  acted.controller.stop();

  const saved = await fresh();
  saved.controller.editAnswers({ firstName: "Mei" });
  await saved.controller.saveAnswers();
  assert.equal(saved.controller.getState().error, null, "a save");
  saved.controller.stop();
});

test("a conflict explains itself and its own re-read does not erase the explanation", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "preparing", revision: 3, answers: {} }],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("case-a");
  // The office's work moved the revision a moment ago.
  store.failNext = Object.assign(new Error("conflict"), { code: "CONFLICT" });
  await assert.rejects(
    controller.runAction("RESPOND_DOCUMENT", {
      requestId: "req-1",
      filename: "demo-mileage-record-2025.pdf",
    }),
    (error) => error.code === "CONFLICT",
  );
  // The post-conflict re-read is what shows the newest case; it must not take
  // the sentence explaining the refusal with it.
  const after = controller.getState();
  assert.equal(after.error.code, "CONFLICT");
  assert.match(after.error.message, /someone else changed this/i);
  // And a background change arriving afterwards leaves it alone too.
  await store.handlers.onChange({ table: "cases", eventType: "UPDATE", id: "case-a", caseId: "case-a" });
  assert.equal(controller.getState().error.code, "CONFLICT");
  controller.stop();
});

test("a rejected action is not retryable and a remote conflict refreshes the case", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} }],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("case-a");
  const reads = store.calls.filter((entry) => entry === "getCase:case-a").length;
  store.failNext = Object.assign(new Error("conflict"), { code: "CONFLICT" });
  await assert.rejects(
    controller.runAction("SUBMIT", { confirmed: true }),
    (error) => error.code === "CONFLICT",
  );
  assert.equal(controller.getState().retryable, false);
  assert.match(controller.getState().error.message, /someone else changed this/i);
  assert.equal(
    store.calls.filter((entry) => entry === "getCase:case-a").length,
    reads + 1,
  );
  controller.stop();
});

test("runAction rejects an unknown type locally and sends no staff person for an applicant", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "preparing", revision: 3, answers: {} }],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("case-a");
  await assert.rejects(
    controller.runAction("DELETE_EVERYTHING", {}),
    (error) => error.code === "VALIDATION",
  );
  assert.equal(store.writes.length, 0);
  // Even an explicitly requested persona is dropped for an applicant.
  controller.selectPerson("person-9");
  await controller.runAction(
    "RESPOND_DOCUMENT",
    { requestId: "req-1", filename: "demo-mileage-record-2025.pdf" },
    { personId: "person-9" },
  );
  assert.deepEqual(
    { ...store.writes[0], actionId: "id" },
    {
      actionId: "id",
      caseId: "case-a",
      expectedRevision: 3,
      personId: null,
      type: "RESPOND_DOCUMENT",
      payload: { requestId: "req-1", filename: "demo-mileage-record-2025.pdf" },
    },
  );
  controller.stop();
});

test("a presenter's selected person travels with the action", async () => {
  const store = fakeStore({
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    people: [{ id: "person-1", name: "Alex", capabilities: ["prepare"] }],
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "preparation_ready", revision: 2, answers: {} }],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("case-a");
  controller.selectPerson("person-1");
  await controller.runAction("CLAIM_PREPARATION", {});
  assert.equal(store.writes[0].personId, "person-1");
  assert.equal(store.writes[0].expectedRevision, 2);
  controller.stop();
});

test("a presenter opens a case on the staff workspace and claims it as the chosen person", async () => {
  const store = fakeStore({
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    people: [
      { id: "alex", name: "Alex", capabilities: ["prepare"] },
      { id: "morgan", name: "Morgan", capabilities: ["review"] },
    ],
    cases: [
      {
        id: "case-a",
        reference: "VT-AAAA-BBBB",
        stage: "review_ready",
        revision: 4,
        answers: {},
        preparerId: "alex",
        reviewerId: null,
        participants: ["alex"],
      },
    ],
  });
  const { controller } = build({ store });
  await controller.start();
  assert.equal(controller.getState().screen, "staff");
  await controller.selectCase("case-a");
  assert.equal(
    controller.getState().screen,
    "staff-case",
    "a presenter never lands on the client's progress screen",
  );
  controller.selectPerson("morgan");
  // The board's claim button sends exactly this: the canonical type, an empty
  // payload, and the persona this window is acting as.
  await controller.runAction("CLAIM_REVIEW", {});
  assert.deepEqual(
    { ...store.writes[0], actionId: "id" },
    {
      actionId: "id",
      caseId: "case-a",
      expectedRevision: 4,
      personId: "morgan",
      type: "CLAIM_REVIEW",
      payload: {},
    },
  );
  controller.stop();
});

test("the board's filters are this window's, kept per user and dropped on sign-out", async () => {
  const shared = fakeSession();
  const staffCases = [
    { id: "case-a", reference: "VT-AAAA-BBBB", stage: "review_ready", revision: 4, answers: {} },
  ];
  const store = fakeStore({
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    people: [{ id: "alex", name: "Alex", capabilities: ["prepare"] }],
    cases: staffCases,
  });
  const first = build({ store, sessionStorage: shared });
  await first.controller.start();
  assert.deepEqual(first.controller.getState().boardFilters, {});
  first.controller.setBoardFilter("status", "available");
  first.controller.setBoardFilter("language", "Cantonese");
  first.controller.selectPerson("alex");
  assert.deepEqual(first.controller.getState().boardFilters, {
    status: "available",
    language: "Cantonese",
  });
  first.controller.stop();

  // A reload of the same window restores them, next to the persona.
  const again = build({ store, sessionStorage: shared });
  await again.controller.start();
  assert.deepEqual(again.controller.getState().boardFilters, {
    status: "available",
    language: "Cantonese",
  });
  assert.equal(again.controller.getState().selectedPersonId, "alex");
  again.controller.clearBoardFilters();
  assert.deepEqual(again.controller.getState().boardFilters, {});
  again.controller.setBoardFilter("search", "VT-AAAA");
  assert.equal(again.controller.getState().boardFilters.search, "VT-AAAA");
  // Choosing a tab is choosing what to see, so it ends the search.
  again.controller.setBoardFilter("status", "review");
  assert.deepEqual(again.controller.getState().boardFilters, { status: "review" });

  // Signing out drops them with everything else this window held.
  await again.controller.signOut();
  assert.deepEqual(again.controller.getState().boardFilters, {});
  assert.equal(shared.raw("vitally:client:v1:p1"), null);
  again.controller.stop();
});

test("clearing named board filters keeps the others", async () => {
  const { controller } = build({ store: fakeStore() });
  await controller.start();
  controller.setBoardFilter("status", "review");
  controller.setBoardFilter("poolLanguage", "Mandarin");
  controller.setBoardFilter("poolPhase", "closed");
  controller.clearBoardFilters(POOL_FILTER_KEYS);
  assert.deepEqual(controller.getState().boardFilters, { status: "review" });
  controller.clearBoardFilters();
  assert.deepEqual(controller.getState().boardFilters, {});
  controller.stop();
});

test("the board search draft survives a re-render but not a filter change", async () => {
  const store = fakeStore({
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    people: [{ id: "alex", name: "Alex", capabilities: ["prepare"] }],
    cases: [],
  });
  const { controller, sessionStorage } = build({ store });
  await controller.start();
  assert.equal(controller.getState().boardSearchDraft, undefined);

  // Typing sets the draft, like `setLookup` does for the applications lookup.
  controller.setBoardSearchDraft("VT-Z");
  assert.equal(controller.getState().boardSearchDraft, "VT-Z");

  // A search submit — `setBoardFilter("search", …)` — sends it and clears the
  // draft, so the field falls back to reading the saved search.
  controller.setBoardFilter("search", "VT-Z");
  assert.equal(controller.getState().boardSearchDraft, undefined);
  assert.equal(controller.getState().boardFilters.search, "VT-Z");

  // Any other filter choice ends a half-typed search too ("Clear search" is
  // one of these: `set-board-filter` with `data-filter="search"`).
  controller.setBoardSearchDraft("something else");
  controller.setBoardFilter("language", "Cantonese");
  assert.equal(controller.getState().boardSearchDraft, undefined);

  // So does clearing every filter.
  controller.setBoardSearchDraft("more typing");
  controller.clearBoardFilters();
  assert.equal(controller.getState().boardSearchDraft, undefined);

  // Never written to window-local storage: only the saved search is.
  controller.setBoardSearchDraft("not persisted");
  const stored = sessionStorage.keys().map((key) => sessionStorage.raw(key)).join("\n");
  assert.doesNotMatch(stored, /not persisted/);
  controller.stop();
});

test("starting a new application is explicit, idempotent and selects the new case", async () => {
  const store = fakeStore();
  let next = 0;
  const { controller, sessionStorage } = build({
    store,
    newActionId: () => `action-${(next += 1)}`,
  });
  await controller.start();
  assert.equal(store.writes.length, 0);
  // A transport failure keeps the pending action id.
  store.failNext = Object.assign(new Error("offline"), { code: "OFFLINE" });
  await assert.rejects(controller.createCase(), (error) => error.code === "OFFLINE");
  assert.equal(store.writes[0].actionId, "action-1");
  assert.ok(
    sessionStorage
      .raw("vitally:client:v1:user-1")
      .includes("action-1"),
    "the pending action id survives in window state",
  );
  // The retry reuses it, so the server replays one receipt instead of acting twice.
  const first = controller.createCase();
  const second = controller.createCase();
  await Promise.all([first, second]);
  assert.equal(store.writes.length, 2, "a second click while pending is a no-op");
  assert.equal(store.writes[1].actionId, "action-1");
  assert.equal(store.writes[1].mode, "client");
  assert.equal(store.writes[1].personId, null);
  assert.deepEqual(store.writes[1].answers, {});
  const state = controller.getState();
  assert.equal(state.selectedCaseId, state.savedCase.id);
  assert.equal(state.screen, "reference");
  assert.equal(state.cases.length, 1);
  assert.ok(!sessionStorage.raw("vitally:client:v1:user-1").includes("action-1"));
  // A second deliberate application uses a new action id.
  await controller.createCase();
  assert.equal(store.writes[2].actionId, "action-2");
  assert.equal(controller.getState().cases.length, 2);
  controller.stop();
});

test("window state is keyed by the authenticated user", async () => {
  const shared = fakeSession();
  const storeOne = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} }],
  });
  const one = build({ store: storeOne, sessionStorage: shared });
  await one.controller.start();
  await one.controller.selectCase("case-a");
  one.controller.setFormStep(2);
  one.controller.stop();

  const storeTwo = fakeStore({
    principal: { userId: "user-2", workspaceId: "w1", access: "applicant" },
    cases: [{ id: "case-z", reference: "VT-ZZZZ-YYYY", stage: "draft", revision: 1, answers: {} }],
  });
  const two = build({ store: storeTwo, sessionStorage: shared });
  await two.controller.start();
  assert.equal(two.controller.getState().selectedCaseId, null);
  assert.equal(two.controller.getState().formStep, 0);
  two.controller.stop();

  // The first user's window state is still their own.
  const again = build({ store: storeOne, sessionStorage: shared });
  await again.controller.start();
  assert.equal(again.controller.getState().selectedCaseId, "case-a");
  assert.equal(again.controller.getState().formStep, 2);
  assert.equal(again.controller.getState().savedCase.id, "case-a");
  again.controller.stop();
  assert.deepEqual(shared.keys().sort(), [
    "vitally:client:v1:user-1",
    "vitally:client:v1:user-2",
  ]);
});

test("signing out clears cached records, drafts and the user's window state", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} }],
  });
  let signedOut = 0;
  const auth = { ...idleAuth(), signOut: async () => { signedOut += 1; } };
  const { controller, sessionStorage } = build({ store, auth });
  await controller.start();
  await controller.selectCase("case-a");
  controller.editAnswers({ firstName: "Mei" });
  assert.ok(sessionStorage.raw("vitally:client:v1:user-1"));
  await controller.signOut();
  assert.equal(signedOut, 1);
  const state = controller.getState();
  assert.equal(state.principal, null);
  assert.equal(state.savedCase, null);
  assert.deepEqual(state.draftAnswers, {});
  assert.deepEqual(state.cases, []);
  assert.equal(state.dirty, false);
  assert.equal(state.selectedCaseId, null);
  assert.equal(state.screen, "access");
  assert.equal(sessionStorage.raw("vitally:client:v1:user-1"), null);
  assert.equal(store.released, 1, "the subscription is released on sign-out");
  controller.stop();
});

test("the resend cooldown survives a reload of the same window", async () => {
  const session = fakeSession();
  let now = 1_000_000;
  const sends = [];
  const makeAuth = () => ({
    getSession: async () => null,
    subscribe: () => () => {},
    signOut: async () => {},
    cooldownRemaining: () => 0,
    sendCode: async (email) => {
      sends.push(email);
      return {
        state: "code_entry",
        message: "If this address is eligible, check your inbox for a sign-in code.",
        retryAfterSeconds: 65,
      };
    },
    verifyCode: async () => {},
  });
  const store = fakeStore();
  const first = build({
    store,
    auth: makeAuth(),
    sessionStorage: session,
    clock: () => now,
    cooldownSeconds: 65,
  });
  await first.controller.start();
  assert.equal(first.controller.getState().screen, "access");
  assert.equal(store.calls.length, 0, "a signed-out visitor reads nothing");
  await first.controller.sendCode("mei@example.org");
  assert.equal(first.controller.getState().authStep, "code");
  assert.equal(first.controller.cooldownRemaining(), 65);
  first.controller.stop();

  now += 10_000;
  const second = build({
    store,
    auth: makeAuth(),
    sessionStorage: session,
    clock: () => now,
    cooldownSeconds: 65,
  });
  await second.controller.start();
  assert.equal(second.controller.getState().authStep, "code");
  assert.equal(second.controller.cooldownRemaining(), 55);
  // A resend inside the window sends nothing at all and says the same thing.
  const answer = await second.controller.sendCode("mei@example.org");
  assert.equal(sends.length, 1);
  assert.equal(
    answer.message,
    "If this address is eligible, check your inbox for a sign-in code.",
  );
  now += 60_000;
  assert.equal(second.controller.cooldownRemaining(), 0);
  await second.controller.sendCode("mei@example.org");
  assert.equal(sends.length, 2);
  second.controller.stop();
});

test("the code being typed is held in state and cleared on every way out", async () => {
  const store = fakeStore();
  const sent = [];
  let session = null;
  const auth = {
    getSession: async () => session,
    subscribe: () => () => {},
    signOut: async () => {},
    cooldownRemaining: () => 0,
    sendCode: async () => ({
      state: "code_entry",
      message: "If this address is eligible, check your inbox for a sign-in code.",
      retryAfterSeconds: 65,
    }),
    verifyCode: async (email, code) => {
      sent.push([email, code]);
      if (code !== "246") throw Object.assign(new Error("no"), { code: "AUTH_INVALID_CODE" });
      session = { user: { id: "user-1" } };
    },
  };
  const { controller, renders } = build({ store, auth });
  await controller.start();
  await controller.sendCode("mei@example.org");

  // Typing does not re-render: the field already shows the characters, and a
  // rebuild would take them away again.
  const before = renders.count;
  controller.editAuthCode("24");
  controller.editAuthCode("246");
  assert.equal(controller.getState().authCode, "246");
  assert.equal(renders.count, before, "a keystroke never rebuilds the page");
  // Typing the address works the same way.
  controller.editAuthEmail("mei@example.org");
  assert.equal(controller.getState().authEmail, "mei@example.org");
  assert.equal(renders.count, before);

  // Called with nothing, the stored code is what is submitted.
  await assert.rejects(
    (async () => {
      controller.editAuthCode("999");
      await controller.verifyCode();
    })(),
    (error) => error.code === "AUTH_INVALID_CODE",
  );
  assert.deepEqual(sent.at(-1), ["mei@example.org", "999"]);
  assert.equal(controller.getState().authCode, "999", "a failed code stays editable");

  // Called with an argument, state and submission agree on that argument.
  await controller.verifyCode("246");
  assert.deepEqual(sent.at(-1), ["mei@example.org", "246"]);
  assert.equal(controller.getState().authCode, "", "cleared once it is spent");
  assert.equal(controller.getState().principal.userId, "user-1");

  await controller.signOut();
  assert.equal(controller.getState().authCode, "");
  controller.stop();
});

test("restarting sign-in forgets the code as well as the address", async () => {
  const auth = {
    ...idleAuth(),
    getSession: async () => null,
    sendCode: async () => ({
      state: "code_entry",
      message: "If this address is eligible, check your inbox for a sign-in code.",
      retryAfterSeconds: 65,
    }),
    verifyCode: async () => {},
  };
  const { controller } = build({ store: fakeStore(), auth });
  await controller.start();
  await controller.sendCode("mei@exmaple.org");
  controller.editAuthCode("123456");
  controller.restartSignIn();
  assert.equal(controller.getState().authCode, "");
  assert.equal(controller.getState().authEmail, "");
  assert.equal(controller.getState().authStep, "email");
  controller.stop();
});

test("an invalid code is a distinct failure and a verified visitor loads their own cases", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} }],
  });
  let session = null;
  const auth = {
    getSession: async () => session,
    subscribe: () => () => {},
    signOut: async () => {},
    cooldownRemaining: () => 0,
    sendCode: async () => ({
      state: "code_entry",
      message: "If this address is eligible, check your inbox for a sign-in code.",
      retryAfterSeconds: 65,
    }),
    verifyCode: async (email, code) => {
      if (code !== "123456")
        throw Object.assign(
          new Error("That code is invalid or has expired. Request a new code."),
          { code: "AUTH_INVALID_CODE" },
        );
      session = { user: { id: "user-1" } };
    },
  };
  const { controller } = build({ store, auth });
  await controller.start();
  await controller.sendCode("mei@example.org");
  await assert.rejects(
    controller.verifyCode("000000"),
    (error) => error.code === "AUTH_INVALID_CODE",
  );
  assert.equal(controller.getState().authError.code, "AUTH_INVALID_CODE");
  assert.equal(controller.getState().principal, null);
  await controller.verifyCode("123456");
  assert.equal(controller.getState().authError, null);
  assert.equal(controller.getState().principal.userId, "user-1");
  assert.equal(controller.getState().cases.length, 1);
  assert.equal(controller.getState().screen, "applications");
  controller.stop();
});

// ---------------------------------------------------------------------------
// The office: assisted intake and assistance requests (Ruling R52)
// ---------------------------------------------------------------------------

const officeStore = (extra = {}) =>
  fakeStore({
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    people: [
      {
        id: "sam",
        name: "Sam",
        capabilities: ["admin", "assist", "followup", "receive_documents"],
      },
    ],
    ...extra,
  });

test("an assisted application is created once, as the chosen office persona", async () => {
  const store = officeStore();
  let next = 0;
  const { controller, sessionStorage } = build({
    store,
    newActionId: () => `action-${(next += 1)}`,
  });
  await controller.start();
  controller.selectPerson("sam");
  const answers = { firstName: "Mei", language: "Mandarin" };
  // A transport failure keeps the pending action id, exactly like a client's.
  store.failNext = Object.assign(new Error("offline"), { code: "OFFLINE" });
  await assert.rejects(
    controller.createAssistedCase({ answers }),
    (error) => error.code === "OFFLINE",
  );
  assert.equal(store.writes[0].actionId, "action-1");
  assert.ok(
    sessionStorage.raw("vitally:client:v1:p1").includes("action-1"),
    "the pending action id survives in window state",
  );
  // The retry is the same request, and a second click while one is in flight
  // sends nothing at all.
  const first = controller.createAssistedCase({ answers });
  const second = controller.createAssistedCase({ answers });
  await Promise.all([first, second]);
  assert.equal(store.writes.length, 2, "a second click while pending is a no-op");
  assert.deepEqual(store.writes[1], {
    actionId: "action-1",
    mode: "assisted",
    personId: "sam",
    answers: { firstName: "Mei", language: "Mandarin" },
  });
  // The new case is open, on the staff workspace, and the id is spent.
  const state = controller.getState();
  assert.equal(state.selectedCaseId, state.savedCase.id);
  assert.equal(state.screen, "staff-case");
  assert.ok(!sessionStorage.raw("vitally:client:v1:p1").includes("action-1"));
  // Only intake answers travel: nothing else can be smuggled into a new case.
  await controller.createAssistedCase({
    answers: { firstName: "Jordan", ownerUserId: "someone", stage: "closed" },
  });
  assert.deepEqual(store.writes[2].answers, { firstName: "Jordan" });
  assert.equal(store.writes[2].actionId, "action-2");
  controller.stop();
});

test("an assisted application needs a presenter with a chosen persona", async () => {
  const office = officeStore();
  const { controller } = build({ store: office });
  await controller.start();
  await assert.rejects(
    controller.createAssistedCase({ answers: {} }),
    (error) => error.code === "VALIDATION",
  );
  assert.equal(office.writes.length, 0, "nothing is sent without a persona");
  controller.stop();

  const client = fakeStore();
  const asClient = build({ store: client });
  await asClient.controller.start();
  await assert.rejects(
    asClient.controller.createAssistedCase({ answers: {} }),
    (error) => error.code === "FORBIDDEN",
  );
  assert.equal(client.writes.length, 0);
  asClient.controller.stop();
});

test("assistance is loaded for a presenter only, and refreshed when its table changes", async () => {
  const applicant = fakeStore();
  const asClient = build({ store: applicant });
  await asClient.controller.start();
  assert.ok(!applicant.calls.includes("listAssistance"));
  assert.deepEqual(asClient.controller.getState().assistance, []);
  asClient.controller.stop();

  const store = officeStore({
    assistance: [
      { id: "item-1", title: "Help with the forms", status: "open", revision: 1 },
    ],
  });
  const { controller } = build({ store });
  await controller.start();
  assert.equal(
    store.calls.filter((entry) => entry === "listAssistance").length,
    1,
  );
  assert.equal(controller.getState().assistance[0].id, "item-1");
  // A change naming the assistance table re-reads the list, and nothing else.
  store.items.set("item-1", {
    id: "item-1",
    title: "Help with the forms",
    status: "assigned",
    revision: 2,
  });
  const listReads = store.calls.filter((entry) => entry === "listCases").length;
  await store.handlers.onChange({
    table: "assistance_items",
    eventType: "UPDATE",
    id: "item-1",
    caseId: null,
  });
  assert.equal(controller.getState().assistance[0].status, "assigned");
  assert.equal(
    store.calls.filter((entry) => entry === "listCases").length,
    listReads,
    "an assistance change is not a case change",
  );
  // A reconnect re-reads it too: a subscription is never the only way back.
  const assistanceReads = store.calls.filter(
    (entry) => entry === "listAssistance",
  ).length;
  await controller.refresh();
  assert.equal(
    store.calls.filter((entry) => entry === "listAssistance").length,
    assistanceReads + 1,
  );
  // Signing out drops the list with everything else.
  await controller.signOut();
  assert.deepEqual(controller.getState().assistance, []);
  controller.stop();
});

test("an assistance action carries the item's own revision and re-reads the list", async () => {
  const store = officeStore({
    assistance: [
      {
        id: "item-1",
        title: "Help with the forms",
        status: "open",
        revision: 4,
        assigneeId: null,
      },
    ],
  });
  let next = 0;
  const { controller } = build({
    store,
    newActionId: () => `action-${(next += 1)}`,
  });
  await controller.start();
  controller.selectPerson("sam");
  await controller.runAssistanceAction("CLAIM", "item-1");
  assert.deepEqual(store.writes[0], {
    actionId: "action-1",
    itemId: "item-1",
    expectedRevision: 4,
    personId: "sam",
    type: "CLAIM",
    note: null,
  });
  // The list is re-read, so the card now shows the new status and revision.
  assert.equal(controller.getState().assistance[0].status, "assigned");
  assert.equal(controller.getState().assistance[0].revision, 5);
  // A resolution carries the note and the revision the claim produced.
  await controller.runAssistanceAction("RESOLVE", "item-1", "Filled it in together.");
  assert.deepEqual(store.writes[1], {
    actionId: "action-2",
    itemId: "item-1",
    expectedRevision: 5,
    personId: "sam",
    type: "RESOLVE",
    note: "Filled it in together.",
  });
  assert.equal(controller.getState().assistance[0].status, "resolved");
  assert.equal(controller.getState().busy, false);
  // A claim never carries a note, whatever it is handed.
  store.items.set("item-2", {
    id: "item-2",
    title: "Another form",
    status: "open",
    revision: 1,
  });
  await store.handlers.onChange({
    table: "assistance_items",
    eventType: "INSERT",
    id: "item-2",
    caseId: null,
  });
  await controller.runAssistanceAction("CLAIM", "item-2", "smuggled");
  assert.equal(store.writes[2].note, null);
  controller.stop();
});

test("a stale assistance item is a conflict in the words of the item", async () => {
  const store = officeStore({
    assistance: [
      { id: "item-1", title: "Help with the forms", status: "open", revision: 1 },
    ],
  });
  const { controller } = build({ store });
  await controller.start();
  controller.selectPerson("sam");
  const reads = store.calls.filter((entry) => entry === "listAssistance").length;
  store.failNext = Object.assign(new Error("conflict"), { code: "CONFLICT" });
  await assert.rejects(
    controller.runAssistanceAction("CLAIM", "item-1"),
    (error) => error.code === "CONFLICT",
  );
  const state = controller.getState();
  assert.equal(state.error.code, "CONFLICT");
  assert.match(state.error.message, /Someone else changed this item/);
  assert.equal(state.retryable, false, "an assistance action is never re-sent");
  assert.equal(state.busy, false);
  assert.equal(
    store.calls.filter((entry) => entry === "listAssistance").length,
    reads + 1,
    "the newest version is read before the failure is shown",
  );
  controller.stop();
});

test("an unknown assistance type, or an item that is gone, never reaches the store", async () => {
  const store = officeStore({
    assistance: [
      { id: "item-1", title: "Help with the forms", status: "open", revision: 1 },
    ],
  });
  const { controller } = build({ store });
  await controller.start();
  controller.selectPerson("sam");
  for (const type of ["RELEASE", "claim", "CLOSE_CASE", "toString", ""])
    await assert.rejects(
      controller.runAssistanceAction(type, "item-1"),
      (error) => error.code === "VALIDATION",
      type,
    );
  await assert.rejects(
    controller.runAssistanceAction("CLAIM", "item-missing"),
    (error) => error.code === "NOT_FOUND",
  );
  assert.equal(store.writes.length, 0);
  controller.stop();
});

test("the office answers for a walk-in client as its own persona", async () => {
  const store = officeStore({
    cases: [
      {
        id: "case-a",
        reference: "VT-AAAA-BBBB",
        stage: "draft",
        revision: 2,
        ownerUserId: null,
        answers: {},
      },
    ],
  });
  const { controller } = build({ store });
  await controller.start();
  controller.selectPerson("sam");
  await controller.selectCase("case-a");
  controller.editAnswers({ firstName: "Mei" });
  await controller.saveAnswers();
  // The database refuses SAVE_ANSWERS from a presenter who sends no person at
  // all, and accepts it only from an `admin` one on an owner-less draft.
  assert.equal(store.writes[0].type, "SAVE_ANSWERS");
  assert.equal(store.writes[0].personId, "sam");
  assert.equal(store.writes[0].expectedRevision, 2);
  assert.deepEqual(store.writes[0].payload, { answers: { firstName: "Mei" } });
  // A client still answers for themselves, with no persona at all.
  const asClient = build({
    store: fakeStore({
      cases: [
        { id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} },
      ],
    }),
  });
  await asClient.controller.start();
  await asClient.controller.selectCase("case-a");
  asClient.controller.editAnswers({ firstName: "Mei" });
  await asClient.controller.saveAnswers();
  assert.equal(asClient.controller.getState().savedCase.answers.firstName, "Mei");
  controller.stop();
  asClient.controller.stop();
});

// ---------------------------------------------------------------------------
// The presenter's own two controls
// ---------------------------------------------------------------------------

const presenterStore = (overrides = {}) =>
  fakeStore({
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    people: [{ id: "person-sam", name: "Sam", capabilities: ["admin"] }],
    ...overrides,
  });

const sampleCase = (overrides = {}) => ({
  id: "fixture-a",
  reference: "VT-SEED-1AAA",
  stage: "review_approved",
  revision: 11,
  fixture: true,
  answers: {},
  ...overrides,
});

test("a presenter start reads the workspace the fixture generation lives on", async () => {
  const store = presenterStore({ cases: [sampleCase()] });
  const { controller } = build({ store });
  await controller.start();
  assert.ok(store.calls.includes("getWorkspace"));
  assert.deepEqual(controller.getState().workspace, {
    id: "w1",
    fixtureGeneration: 3,
    defaultFollowupPersonId: "person-sam",
    defaultIntakeVersion: 1,
  });
  controller.stop();

  // A client has no panel, so the workspace is never read for them.
  const clientStore = fakeStore({ cases: [] });
  const asClient = build({ store: clientStore });
  await asClient.controller.start();
  assert.ok(!clientStore.calls.includes("getWorkspace"));
  assert.equal(asClient.controller.getState().workspace, null);
  asClient.controller.stop();
});

test("a reset is one request, retried as itself and never sent twice", async () => {
  const store = presenterStore({ cases: [sampleCase()] });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("fixture-a");
  assert.equal(controller.getState().selectedCaseId, "fixture-a");

  // The first attempt cannot be confirmed, so the envelope is kept.
  store.failNext = Object.assign(new Error("timeout"), { code: "OFFLINE" });
  await assert.rejects(() => controller.resetFixtures(), { code: "OFFLINE" });
  const first = store.writes.at(-1);
  assert.ok(first.actionId, "a reset carries an action id");
  assert.equal(controller.getState().error.code, "OFFLINE");

  // Pressing it again re-sends the identical request, which is what lets the
  // server answer with its stored receipt instead of resetting twice.
  await controller.resetFixtures();
  assert.equal(store.writes.at(-1).actionId, first.actionId);
  assert.equal(
    store.calls.filter((entry) => entry === "resetFixtures").length,
    2,
  );
  assert.equal(controller.getState().workspace.fixtureGeneration, 4);
  // The sample case that was open is gone, so the selection goes with it and
  // the window is told why.
  assert.equal(controller.getState().selectedCaseId, null);
  assert.equal(controller.getState().savedCase, null);
  assert.equal(controller.getState().screen, "staff");
  assert.match(controller.getState().notice, /Sample cases were reset/);
  assert.match(controller.getState().notice, /no longer there/);

  // A third press is a new request: the last one is spent.
  await controller.resetFixtures();
  assert.notEqual(store.writes.at(-1).actionId, first.actionId);
  assert.equal(controller.getState().workspace.fixtureGeneration, 5);
  assert.equal(controller.getState().notice, "Sample cases were reset.");
  controller.stop();
});

test("a refused reset spends its envelope rather than repeating it", async () => {
  const store = presenterStore({ cases: [sampleCase()] });
  const { controller } = build({ store });
  await controller.start();
  store.failNext = Object.assign(new Error("no"), { code: "FORBIDDEN" });
  await assert.rejects(() => controller.resetFixtures(), { code: "FORBIDDEN" });
  const refused = store.writes.at(-1).actionId;
  await controller.resetFixtures();
  assert.notEqual(
    store.writes.at(-1).actionId,
    refused,
    "a refusal is final, so the retry is a new request",
  );
  controller.stop();
});

test("an applicant can neither reset the samples nor load a checkpoint", async () => {
  const store = fakeStore({ cases: [sampleCase()] });
  const { controller } = build({ store });
  await controller.start();
  await assert.rejects(() => controller.resetFixtures(), { code: "FORBIDDEN" });
  await assert.rejects(
    () =>
      controller.loadCheckpoint({
        caseId: "fixture-a",
        checkpoint: "intake_ready",
      }),
    { code: "FORBIDDEN" },
  );
  assert.deepEqual(store.writes, [], "nothing privileged is ever sent");
  assert.ok(!store.calls.includes("resetFixtures"));
  assert.ok(!store.calls.includes("loadCheckpoint"));
  controller.stop();
});

test("a checkpoint carries the case's own revision and the chosen point", async () => {
  const store = presenterStore({
    cases: [sampleCase(), sampleCase({ id: "case-b", fixture: false })],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.loadCheckpoint({
    caseId: "fixture-a",
    checkpoint: "ready_for_review",
  });
  assert.deepEqual(
    { ...store.writes.at(-1), actionId: "any" },
    {
      actionId: "any",
      caseId: "fixture-a",
      expectedRevision: 11,
      checkpoint: "ready_for_review",
    },
  );
  // The case stays itself: a checkpoint keeps its id and its reference.
  assert.equal(controller.getState().cases[0].id, "fixture-a");
  assert.equal(controller.getState().notice, null);
  assert.ok(store.calls.includes("getWorkspace"));

  // A name the database does not know never leaves the browser.
  await assert.rejects(
    () =>
      controller.loadCheckpoint({ caseId: "fixture-a", checkpoint: "all_done" }),
    { code: "VALIDATION" },
  );
  // Neither does a case this class created, or one that is not on screen.
  await assert.rejects(
    () =>
      controller.loadCheckpoint({ caseId: "case-b", checkpoint: "intake_ready" }),
    { code: "VALIDATION" },
  );
  await assert.rejects(
    () =>
      controller.loadCheckpoint({ caseId: "case-zz", checkpoint: "intake_ready" }),
    { code: "NOT_FOUND" },
  );
  assert.equal(
    store.calls.filter((entry) => entry === "loadCheckpoint").length,
    1,
    "a refusal reaches no store call",
  );
  controller.stop();
});

test("a checkpoint retry is the same request until the choice changes", async () => {
  const store = presenterStore({ cases: [sampleCase()] });
  const { controller } = build({ store });
  await controller.start();
  store.failNext = Object.assign(new Error("gone"), { code: "SERVER_ERROR" });
  await assert.rejects(
    () =>
      controller.loadCheckpoint({
        caseId: "fixture-a",
        checkpoint: "intake_ready",
      }),
    { code: "SERVER_ERROR" },
  );
  const first = store.writes.at(-1).actionId;
  await controller.loadCheckpoint({
    caseId: "fixture-a",
    checkpoint: "intake_ready",
  });
  assert.equal(
    store.writes.at(-1).actionId,
    first,
    "the retry is the same request",
  );
  // A different point in the story is a different request entirely.
  await controller.loadCheckpoint({
    caseId: "fixture-a",
    checkpoint: "document_requested",
  });
  assert.notEqual(store.writes.at(-1).actionId, first);
  controller.stop();
});

test("the shared generation signal refetches everything it could have replaced", async () => {
  const store = presenterStore({
    cases: [sampleCase()],
    assistance: [
      { id: "item-1", title: "Help with the forms", status: "open", revision: 1 },
    ],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("fixture-a");
  const before = {
    cases: store.calls.filter((entry) => entry === "listCases").length,
    workspace: store.calls.filter((entry) => entry === "getWorkspace").length,
    assistance: store.calls.filter((entry) => entry === "listAssistance").length,
  };
  // Somebody else reset the samples: the row that moved is the workspace, and
  // it names no case at all.
  store.records.delete("fixture-a");
  store.workspace = { ...store.workspace, fixtureGeneration: 9 };
  await store.handlers.onChange({
    table: "workspaces",
    eventType: "UPDATE",
    id: "w1",
    caseId: null,
  });
  assert.equal(
    store.calls.filter((entry) => entry === "listCases").length,
    before.cases + 1,
  );
  assert.equal(
    store.calls.filter((entry) => entry === "getWorkspace").length,
    before.workspace + 1,
  );
  assert.equal(
    store.calls.filter((entry) => entry === "listAssistance").length,
    before.assistance + 1,
  );
  assert.equal(controller.getState().workspace.fixtureGeneration, 9);
  assert.equal(controller.getState().selectedCaseId, null);
  assert.equal(controller.getState().screen, "staff");
  assert.match(controller.getState().notice, /Sample cases were reset/);
  assert.equal(controller.getState().error, null, "a reset is not a failure");
  // Dismissing clears it.
  controller.dismissError();
  assert.equal(controller.getState().notice, null);
  controller.stop();
});

test("a generation signal with the open case still there keeps the selection", async () => {
  const store = presenterStore({ cases: [sampleCase()] });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("fixture-a");
  await store.handlers.onChange({
    table: "workspaces",
    eventType: "UPDATE",
    id: "w1",
    caseId: null,
  });
  assert.equal(controller.getState().selectedCaseId, "fixture-a");
  assert.equal(controller.getState().notice, null);
  controller.stop();
});

test("signing out forgets the workspace and the notice with everything else", async () => {
  const store = presenterStore({ cases: [sampleCase()] });
  const { controller } = build({ store });
  await controller.start();
  await controller.resetFixtures();
  assert.ok(controller.getState().notice);
  await controller.signOut();
  assert.equal(controller.getState().workspace, null);
  assert.equal(controller.getState().notice, null);
  controller.stop();
});

test("the sidebar starts open, toggles, survives a reload and reopens after sign-out", async () => {
  const shared = fakeSession();
  const store = fakeStore({
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    people: [{ id: "alex", name: "Alex", capabilities: ["prepare"] }],
    cases: [],
  });
  const first = build({ store, sessionStorage: shared });
  await first.controller.start();
  assert.equal(first.controller.getState().sidebarOpen, true);
  first.controller.toggleSidebar();
  assert.equal(first.controller.getState().sidebarOpen, false);
  first.controller.stop();

  const again = build({ store, sessionStorage: shared });
  await again.controller.start();
  assert.equal(again.controller.getState().sidebarOpen, false, "a reload keeps it");
  await again.controller.signOut();
  assert.equal(again.controller.getState().sidebarOpen, true);
  again.controller.stop();
});

test("the case tab is this window's, and resets for another case, another persona and sign-out", async () => {
  const shared = fakeSession();
  const store = fakeStore({
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    people: [
      { id: "alex", name: "Alex", capabilities: ["prepare"] },
      { id: "sam", name: "Sam", capabilities: ["admin"] },
    ],
    cases: [
      { id: "case-a", reference: "VT-AAAA-AAAA", stage: "preparing", revision: 1, answers: {} },
      { id: "case-b", reference: "VT-BBBB-BBBB", stage: "preparing", revision: 1, answers: {} },
    ],
  });
  const first = build({ store, sessionStorage: shared });
  await first.controller.start();
  assert.equal(first.controller.getState().caseTab, "overview");
  await first.controller.selectCase("case-a");
  first.controller.setCaseTab("documents");
  assert.equal(first.controller.getState().caseTab, "documents");
  // Re-opening the same case keeps the tab.
  await first.controller.selectCase("case-a");
  assert.equal(first.controller.getState().caseTab, "documents");
  first.controller.stop();

  // A reload of the same window restores it.
  const again = build({ store, sessionStorage: shared });
  await again.controller.start();
  assert.equal(again.controller.getState().caseTab, "documents");
  // Another case starts on Overview.
  await again.controller.selectCase("case-b");
  assert.equal(again.controller.getState().caseTab, "overview");
  // Another persona starts on Overview.
  again.controller.setCaseTab("history");
  again.controller.selectPerson("sam");
  assert.equal(again.controller.getState().caseTab, "overview");
  again.controller.setCaseTab("followup");
  await again.controller.signOut();
  assert.equal(again.controller.getState().caseTab, "overview");
  again.controller.stop();
});

// ---------------------------------------------------------------------------
// The office drawers
// ---------------------------------------------------------------------------

test("a dialog can carry what it is about, and every way out forgets it", async () => {
  const store = presenterStore({ cases: [sampleCase({ id: "c1" })] });
  const { controller } = build({ store });
  await controller.start();
  controller.openDialog("log-call", { caseId: "c1" });
  assert.equal(controller.getState().dialog, "log-call");
  assert.deepEqual(controller.getState().dialogContext, { caseId: "c1" });
  controller.closeDialog();
  assert.equal(controller.getState().dialog, null);
  assert.equal(controller.getState().dialogContext, null);

  controller.openDialog("log-call", { caseId: "c1" });
  controller.navigate("staff");
  assert.equal(controller.getState().dialog, null);
  assert.equal(controller.getState().dialogContext, null);

  controller.openDialog("help");
  assert.equal(controller.getState().dialog, "help");
  assert.equal(controller.getState().dialogContext, null);
  controller.stop();
});

test("a case that is gone only moves a window that was showing it", async () => {
  const store = presenterStore({ cases: [sampleCase({ id: "c1" })] });
  const { controller } = build({ store });
  await controller.start();

  // Elsewhere on purpose: the selection is cleared and the screen stays.
  await controller.selectCase("c1", { navigate: false });
  controller.navigate("office-cases");
  store.records.delete("c1");
  await controller.refresh();
  assert.equal(controller.getState().selectedCaseId, null);
  assert.equal(controller.getState().savedCase, null);
  assert.equal(controller.getState().screen, "office-cases");

  // On the case page itself, the page has nothing left to show.
  store.records.set("c1", sampleCase({ id: "c1" }));
  await controller.selectCase("c1");
  assert.equal(controller.getState().screen, "staff-case");
  store.records.delete("c1");
  await controller.refresh();
  assert.equal(controller.getState().selectedCaseId, null);
  assert.equal(controller.getState().screen, "staff");

  // Opening a gone case in place from elsewhere leaves the screen alone too.
  controller.navigate("office-cases");
  await assert.rejects(
    () => controller.selectCase("c1", { navigate: false }),
    (error) => error.code === "NOT_FOUND",
  );
  assert.equal(controller.getState().selectedCaseId, null);
  assert.equal(controller.getState().screen, "office-cases");
  controller.stop();
});

test("the office screens are a presenter's, and a client falls back home", async () => {
  const shared = fakeSession();
  const presenter = build({ store: presenterStore(), sessionStorage: shared });
  await presenter.controller.start();
  presenter.controller.navigate("office-add-case");
  assert.equal(presenter.controller.getState().screen, "office-add-case");
  presenter.controller.navigate("office-cases");
  assert.equal(presenter.controller.getState().screen, "office-cases");
  presenter.controller.stop();

  // A reload keeps either one for a presenter.
  for (const screen of ["office-add-case", "office-cases"]) {
    const store = presenterStore();
    const first = build({ store, sessionStorage: shared });
    await first.controller.start();
    first.controller.navigate(screen);
    first.controller.stop();
    const again = build({ store: presenterStore(), sessionStorage: shared });
    await again.controller.start();
    assert.equal(again.controller.getState().screen, screen);
    again.controller.stop();
  }

  // A client principal restoring either screen lands on its own home.
  const client = build({
    store: fakeStore({ principal: { userId: "p1", workspaceId: "w1", access: "applicant" } }),
    sessionStorage: shared,
  });
  await client.controller.start();
  assert.equal(client.controller.getState().screen, "applications");
  client.controller.stop();
});

// ---------------------------------------------------------------------------
// Version 2: the draft, withheld invalid values, sub-steps, visits on the
// server, the revealed list and card actions (spec 2026-09-30 §2.5, §3.3–§3.4;
// spec 2026-10-04 §3.1, §3.7, §3.8, §5.2, §6.3).
// ---------------------------------------------------------------------------

// The version-2 server as the fake sees it: a save merges (null clears) and the
// four contact fields go to the case's contact record, never into answers. Like
// the server, it refuses an envelope whose expected revision is not the case's,
// stores the union of the visited sub-steps it is sent, keeps card rows, and
// bumps the revision for every action.
function v2Store({
  answers = {},
  contact = null,
  revision = 1,
  stage = "draft",
  intakeVisited = [],
  documentCards = [],
  others = [],
  ...shared
} = {}) {
  const store = fakeStore({
    ...shared,
    cases: [
      {
        id: "case-v2",
        reference: "VT-V2AA-BBBB",
        stage,
        revision,
        intakeVersion: 2,
        answers,
        contact,
        intakeVisited,
        documentCards,
      },
      ...others,
    ],
  });
  // Refusals to throw from `act`, one per call, before anything is stored.
  store.refusals = [];
  store.act = async (action) => {
    store.calls.push(`act:${action.type}`);
    store.writes.push(action);
    const failure = store.failNext ?? store.refusals.shift();
    store.failNext = null;
    if (failure) throw failure;
    const record = store.records.get(action.caseId);
    if (action.expectedRevision !== record.revision)
      throw Object.assign(new Error("stale"), { code: "CONFLICT" });
    const next = { ...record, revision: record.revision + 1 };
    if (action.type === "SAVE_ANSWERS") {
      const merged = { ...record.answers };
      let contact = record.contact;
      for (const [id, value] of Object.entries(action.payload.answers)) {
        if (CONTACT_FIELDS[id]) {
          contact = { ...(contact ?? {}), [CONTACT_FIELDS[id]]: value };
          continue;
        }
        if (value === null) delete merged[id];
        else merged[id] = value;
      }
      next.answers = merged;
      next.contact = contact;
      if (action.payload.visited)
        next.intakeVisited = [...new Set([...(record.intakeVisited ?? []), ...action.payload.visited])];
    }
    // The office's best time and note go to the case's contact record; a null clears.
    if (action.type === "UPDATE_CONTACT")
      next.contact = { ...(record.contact ?? {}), ...action.payload };
    const setCard = (slotId, change) => {
      const cards = [...(record.documentCards ?? [])];
      const at = cards.findIndex((card) => card.slotId === slotId);
      const row = { slotId, status: null, groupOverride: null, ...(at >= 0 ? cards[at] : {}), ...change, changedAt: "2026-10-04T12:00:00Z" };
      if (at >= 0) cards[at] = row;
      else cards.push(row);
      next.documentCards = cards;
    };
    if (action.type === "SET_DOCUMENT_CARD")
      setCard(action.payload.slotId, { status: action.payload.status === "not_done" ? null : action.payload.status });
    if (action.type === "SET_DOCUMENT_GROUP")
      setCard(action.payload.slotId, { groupOverride: action.payload.group === "needed" ? "needed" : null });
    store.records.set(action.caseId, next);
    return { actionId: action.actionId, caseId: action.caseId, reference: next.reference, revision: next.revision };
  };
  return store;
}

test("the office's UPDATE_CONTACT leaves the case's contact changed and its revision the store's", async () => {
  const { controller, store } = await openV2({
    answers: { tp_first_name: "Mei" },
    contact: { phone: "2155550101", bestContactTime: ["weekday_evening"], bestContactNote: "After 6 pm." },
    stage: "preparing",
  });
  await controller.runAction("UPDATE_CONTACT", { bestContactTime: ["weekend"] });
  const saved = controller.getState().savedCase;
  assert.deepEqual(saved.contact.bestContactTime, ["weekend"]);
  assert.equal(saved.contact.phone, "2155550101", "the phone is never part of this action");
  assert.equal(saved.contact.bestContactNote, "After 6 pm.", "a key the form did not send is left alone");
  assert.equal(saved.revision, store.records.get("case-v2").revision);
  assert.equal(store.writes.at(-1).type, "UPDATE_CONTACT");
  assert.deepEqual(store.writes.at(-1).payload, { bestContactTime: ["weekend"] });
  controller.stop();
});

// Somebody else's change to the open case: a newer revision of the record,
// then the realtime signal for it.
async function remoteChange(store, change) {
  const record = store.records.get("case-v2");
  store.records.set("case-v2", { ...record, revision: record.revision + 1, ...change });
  await store.handlers.onChange({ table: "cases", caseId: "case-v2" });
}

const offline = () => Object.assign(new Error("offline"), { code: "OFFLINE" });
const chip = (controller) => saveStatus(controller.getState()).replace(/<[^>]+>/g, "").trim();

async function openV2(options = {}) {
  const store = v2Store(options);
  const built = build({ store, sessionStorage: options.sessionStorage });
  await built.controller.start();
  await built.controller.selectCase("case-v2");
  return { store, ...built };
}

// A version-2 case whose last save succeeded: the chip reads "Saved".
async function savedV2(answers = { tp_first_name: "Mei" }) {
  const opened = await openV2({ answers: { ...answers, tp_last_name: "Old" } });
  opened.controller.editAnswers({ tp_last_name: "Chen" });
  await opened.controller.saveAnswers();
  assert.equal(opened.controller.getState().saveState, "saved");
  assert.equal(chip(opened.controller), "Saved");
  return opened;
}

test("a version-2 draft takes its contact fields from the case's contact record", async () => {
  const bare = await openV2({ answers: { tp_first_name: "Mei" }, contact: null });
  const draft = bare.controller.getState().draftAnswers;
  assert.deepEqual(draft, { tp_first_name: "Mei" });
  for (const id of Object.keys(CONTACT_FIELDS)) assert.equal(Object.hasOwn(draft, id), false, id);
  bare.controller.stop();

  const withContact = await openV2({
    answers: { tp_first_name: "Mei" },
    contact: { phone: "2155550199", spousePhone: null, bestContactTime: ["weekend"], bestContactNote: null },
  });
  assert.deepEqual(withContact.controller.getState().draftAnswers, {
    tp_first_name: "Mei",
    tp_phone: "2155550199",
    best_contact_time: ["weekend"],
  });
  withContact.controller.stop();
});

test("a version-2 edit keeps structured values and null, and the save carries them with the contact", async () => {
  const { controller, store } = await openV2({
    answers: { tp_first_name: "Mei", tp_middle_name: "Lan", ownerUserId: "forged" },
    contact: { phone: "2155550199", bestContactTime: ["weekend"] },
  });
  assert.equal(Object.hasOwn(controller.getState().draftAnswers, "ownerUserId"), false);
  controller.editAnswers({ tp_middle_name: null });
  assert.equal(controller.getState().draftAnswers.tp_middle_name, null);
  controller.editAnswers({ hh: [{ member_id: "0123456789abcdef0123456789abcdef", first_name: "Xiao" }], best_contact_time: ["weekend", "any_time"], stage: "closed" });
  assert.deepEqual(controller.getState().draftAnswers.hh, [{ member_id: "0123456789abcdef0123456789abcdef", first_name: "Xiao" }]);
  assert.equal(Object.hasOwn(controller.getState().draftAnswers, "stage"), false);
  await controller.saveAnswers();
  const sent = store.writes[0].payload.answers;
  assert.equal(sent.tp_middle_name, null);
  assert.equal(sent.tp_phone, "2155550199");
  assert.deepEqual(sent.best_contact_time, ["weekend", "any_time"]);
  assert.deepEqual(sent.hh, [{ member_id: "0123456789abcdef0123456789abcdef", first_name: "Xiao" }]);
  controller.stop();
});

test("leaving married drops the spouse from every who answer in the same edit", async () => {
  const { controller } = await openV2({
    answers: { marital_status: "married", us_citizen: ["me", "spouse"], on_visa: ["spouse"], pecf: ["none"] },
  });
  controller.editAnswers({ marital_status: "married", disabled: ["spouse"] });
  assert.deepEqual(controller.getState().draftAnswers.disabled, ["spouse"], "still married: nothing is cleared");
  controller.editAnswers({ marital_status: "never_married" });
  const draft = controller.getState().draftAnswers;
  assert.equal(draft.marital_status, "never_married");
  assert.deepEqual(draft.us_citizen, ["me"]);
  assert.deepEqual(draft.pecf, ["none"]);
  for (const id of ["us_citizen", "on_visa", "disabled", "pecf"])
    assert.equal((draft[id] ?? []).includes("spouse"), false, id);
  controller.stop();
});

test("goToSubstep records the sub-step being left, saves a dirty draft, then moves", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" } });
  assert.equal(controller.getState().formSubstep, "before.ready");
  assert.deepEqual(controller.getState().visitedSubsteps, []);
  await controller.goToSubstep("before.service");
  assert.equal(controller.getState().formSubstep, "before.service");
  assert.deepEqual(controller.getState().visitedSubsteps, ["before.ready"]);
  controller.editAnswers({ tp_first_name: "Ming" });
  await controller.goToSubstep("about.address");
  assert.equal(store.writes.length, 2);
  assert.equal(store.writes[1].payload.answers.tp_first_name, "Ming");
  assert.deepEqual(store.writes[1].payload.visited, ["before.ready", "before.service"]);
  assert.equal(controller.getState().formSubstep, "about.address");
  assert.deepEqual(controller.getState().visitedSubsteps, ["before.ready", "before.service"]);
  assert.equal(controller.getState().saveState, "saved");
  assert.equal(controller.getState().dirty, false);
  controller.stop();
});

test("goToSubstep still moves when its save fails", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" } });
  controller.editAnswers({ tp_first_name: "Ming" });
  store.failNext = offline();
  await controller.goToSubstep("about.you");
  assert.equal(controller.getState().formSubstep, "about.you");
  assert.equal(controller.getState().saveState, "failed");
  assert.equal(controller.getState().dirty, true);
  controller.stop();
});

// Holds every `act` until `release()`, so a test can act during a save.
function holdSaves(store) {
  const act = store.act;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  store.actCalls = 0;
  store.act = async (action) => {
    store.actCalls += 1;
    await gate;
    return act(action);
  };
  return () => release();
}

test("a second sub-step change during the first one's save is ignored, so no false conflict", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" } });
  controller.editAnswers({ tp_first_name: "Ming" });
  const release = holdSaves(store);
  const first = controller.goToSubstep("before.service");
  const second = controller.goToSubstep("income.wages");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.actCalls, 1, "one SAVE_ANSWERS only");
  release();
  await Promise.all([first, second]);
  assert.equal(store.actCalls, 1);
  assert.equal(controller.getState().formSubstep, "before.service");
  assert.equal(controller.getState().saveState, "saved");
  assert.equal(controller.getState().conflict, null);
  await controller.goToSubstep("income.wages");
  assert.equal(controller.getState().formSubstep, "income.wages", "the guard is gone once the save lands");
  assert.equal(controller.getState().conflict, null);
  controller.stop();
});

test("a sub-step change whose save outlives its case leaves the newly opened case's place alone", async () => {
  const { controller, store } = await openV2({
    answers: { tp_first_name: "Mei" },
    others: [{ id: "case-w", reference: "VT-WWWW-BBBB", stage: "draft", revision: 1, intakeVersion: 2, answers: {} }],
  });
  controller.editAnswers({ tp_first_name: "Ming" });
  const release = holdSaves(store);
  const moving = controller.goToSubstep("income.wages");
  await controller.selectCase("case-w");
  const opened = controller.getState().formSubstep;
  assert.equal(opened, "before.ready");
  release();
  await moving;
  assert.equal(controller.getState().selectedCaseId, "case-w");
  assert.equal(controller.getState().formSubstep, opened);
  controller.stop();
});

test("using the office's values on a version-2 case keeps the four contact fields", async () => {
  const { controller, store } = await openV2({
    answers: { tp_first_name: "Mei" },
    contact: { phone: "2155550199", spousePhone: null, bestContactTime: ["weekend"], bestContactNote: "After six" },
  });
  controller.editAnswers({ tp_first_name: "Ming" });
  store.records.set("case-v2", {
    ...store.records.get("case-v2"),
    revision: 2,
    answers: { tp_first_name: "Lan" },
  });
  await store.handlers.onChange({ table: "cases", caseId: "case-v2" });
  const state = controller.getState();
  assert.equal(state.conflict?.code, "REMOTE_CHANGED");
  assert.equal(Object.hasOwn(state.savedCase.answers, "tp_phone"), false, "the contact is not in answers");
  await controller.reconcileAnswers({
    answers: state.savedCase.answers,
    expectedServerRevision: state.savedCase.revision,
    fromServer: true,
  });
  assert.deepEqual(controller.getState().draftAnswers, {
    tp_first_name: "Lan",
    tp_phone: "2155550199",
    best_contact_time: ["weekend"],
    best_contact_note: "After six",
  });
  assert.equal(controller.getState().conflict, null);
  controller.stop();
});

test("fromServer changes nothing on a version-1 case: the given answers are used", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: { firstName: "Server" } }],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("case-a");
  await controller.reconcileAnswers({
    answers: { firstName: "Chosen" },
    expectedServerRevision: 1,
    fromServer: true,
  });
  assert.equal(controller.getState().draftAnswers.firstName, "Chosen");
  controller.stop();
});

test("another case starts with no visited sub-steps, nothing revealed and no return", async () => {
  const { controller } = await openV2({
    answers: { tp_first_name: "Mei" },
    others: [{ id: "case-w", reference: "VT-WWWW-BBBB", stage: "draft", revision: 1, intakeVersion: 2, answers: {} }],
  });
  await controller.goToSubstep("about.you");
  controller.editAnswers({ email: "a@" });
  await controller.openForChange("about.address");
  assert.deepEqual(controller.getState().visitedSubsteps, ["before.ready", "about.you"]);
  assert.deepEqual(controller.getState().revealed, ["email"]);
  assert.equal(controller.getState().returnToSummary, true);
  await controller.selectCase("case-w");
  assert.deepEqual(controller.getState().visitedSubsteps, []);
  assert.deepEqual(controller.getState().revealed, []);
  assert.equal(controller.getState().returnToSummary, false);
  assert.equal(controller.getState().formSubstep, "before.ready");
  controller.stop();
});

test("a version-2 save withholds invalid values and trims, and never touches the draft", async () => {
  const { controller, store } = await openV2();
  controller.editAnswers({ tp_first_name: "Mei", email: "a@", addr_zip: " 19107 " });
  await controller.saveAnswers();
  assert.deepEqual(store.writes[0].payload.answers, { tp_first_name: "Mei", addr_zip: "19107" });
  const draft = controller.getState().draftAnswers;
  assert.equal(draft.addr_zip, " 19107 ");
  assert.equal(draft.email, "a@");
  controller.stop();
});

test("version-2 dirty means a save would change the server", async () => {
  const { controller } = await savedV2();
  // Valid to invalid: the field is withheld, so nothing would change.
  controller.editAnswers({ email: "a@" });
  assert.equal(controller.getState().dirty, false);
  assert.equal(chip(controller), "Saved");
  controller.revealInvalid("email");
  assert.equal(chip(controller), "1 answer needs checking");
  // Editing an already-invalid value leaves it as it was.
  controller.editAnswers({ email: "a@@" });
  assert.equal(controller.getState().dirty, false);
  // Spaces alone would send the same value.
  controller.editAnswers({ tp_first_name: "Mei " });
  assert.equal(controller.getState().dirty, false);
  assert.equal(controller.getState().editBaseRevision, null);
  assert.equal(controller.getState().saveState, "saved");
  // A real change pins the revision the person was looking at.
  controller.editAnswers({ tp_first_name: "Ming" });
  assert.equal(controller.getState().dirty, true);
  assert.equal(controller.getState().saveState, "unsaved");
  assert.equal(controller.getState().editBaseRevision, 2);
  controller.stop();
});

test("an undo returns to the save state it replaced", async () => {
  const saved = await savedV2();
  saved.controller.editAnswers({ tp_first_name: "Ming" });
  assert.equal(chip(saved.controller), "Unsaved changes");
  saved.controller.editAnswers({ tp_first_name: "Mei" });
  assert.equal(saved.controller.getState().dirty, false);
  assert.equal(saved.controller.getState().saveState, "saved");
  assert.equal(saved.controller.getState().editBaseRevision, null);
  assert.equal(chip(saved.controller), "Saved");
  // With a revealed invalid email in the draft, the undo shows the count.
  saved.controller.editAnswers({ email: "a@" });
  saved.controller.revealInvalid("email");
  saved.controller.editAnswers({ tp_first_name: "Ming" });
  saved.controller.editAnswers({ tp_first_name: "Mei" });
  assert.equal(chip(saved.controller), "1 answer needs checking");
  saved.controller.stop();

  const fresh = await openV2({ answers: { tp_first_name: "Mei" } });
  fresh.controller.editAnswers({ tp_first_name: "Ming" });
  fresh.controller.editAnswers({ tp_first_name: "Mei" });
  assert.equal(fresh.controller.getState().dirty, false);
  assert.equal(fresh.controller.getState().saveState, "idle");
  assert.equal(chip(fresh.controller), "Up to date");
  fresh.controller.stop();
});

test("the pin is cleared on undo, so a later office save is not a false conflict", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" }, revision: 5 });
  controller.editAnswers({ tp_first_name: "Ming" });
  assert.equal(controller.getState().editBaseRevision, 5);
  controller.editAnswers({ tp_first_name: "Mei" });
  assert.equal(controller.getState().dirty, false);
  assert.equal(controller.getState().editBaseRevision, null);
  // The office saves in between.
  store.records.set("case-v2", {
    ...store.records.get("case-v2"),
    revision: 6,
    answers: { tp_first_name: "Mei", tp_last_name: "Chen" },
  });
  await store.handlers.onChange({ table: "cases", caseId: "case-v2" });
  assert.equal(controller.getState().conflict, null);
  assert.equal(controller.getState().draftAnswers.tp_last_name, "Chen");
  controller.editAnswers({ tp_first_name: "Ming" });
  assert.equal(controller.getState().editBaseRevision, 6);
  await controller.saveAnswers();
  assert.equal(store.writes[0].expectedRevision, 6);
  assert.equal(controller.getState().conflict, null);
  assert.equal(controller.getState().saveState, "saved");
  controller.stop();
});

test("after a failed save an undo stays dirty and keeps its pin", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" } });
  controller.editAnswers({ tp_first_name: "Ming" });
  store.failNext = offline();
  await assert.rejects(controller.saveAnswers(), (error) => error.code === "OFFLINE");
  assert.equal(controller.getState().retryable, true);
  controller.editAnswers({ tp_first_name: "Mei" });
  assert.equal(controller.getState().dirty, true);
  assert.equal(controller.getState().editBaseRevision, 1);
  assert.equal(controller.getState().saveState, "failed");
  assert.equal(controller.getState().retryable, false, "the envelope no longer matches");
  assert.equal(await controller.retryLast(), null);
  await controller.saveAnswers();
  assert.equal(store.writes.length, 2);
  assert.equal(store.writes[1].payload.answers.tp_first_name, "Mei");
  assert.equal(store.writes[1].expectedRevision, 1);
  controller.stop();
});

test("local-only differences survive every refresh", async () => {
  const { controller, store } = await openV2();
  controller.editAnswers({ tp_first_name: "Mei", email: "a@", addr_zip: " 19107 " });
  await controller.saveAnswers();
  assert.equal(Object.hasOwn(store.records.get("case-v2").answers, "email"), false);
  assert.equal(store.records.get("case-v2").answers.addr_zip, "19107");
  let draft = controller.getState().draftAnswers;
  assert.equal(draft.email, "a@");
  assert.equal(draft.addr_zip, " 19107 ");
  // Somebody else changes the name.
  store.records.set("case-v2", {
    ...store.records.get("case-v2"),
    revision: 3,
    answers: { ...store.records.get("case-v2").answers, tp_first_name: "Ming" },
  });
  await store.handlers.onChange({ table: "cases", caseId: "case-v2" });
  draft = controller.getState().draftAnswers;
  assert.equal(draft.tp_first_name, "Ming");
  assert.equal(draft.email, "a@");
  assert.equal(draft.addr_zip, " 19107 ");
  controller.stop();
});

test("a retained envelope ignores withheld fields and spaces", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" } });
  controller.editAnswers({ tp_last_name: "Chen", email: "a@" });
  store.failNext = offline();
  await assert.rejects(controller.saveAnswers());
  controller.editAnswers({ email: "b@" });
  assert.equal(controller.getState().retryable, true, "the invalid email was never in the envelope");
  controller.editAnswers({ tp_last_name: "Chen " });
  assert.equal(controller.getState().retryable, true, "spaces alone send the same value");
  await controller.retryLast();
  assert.equal(store.writes.length, 2);
  assert.equal(store.writes[1], store.writes[0], "the identical envelope");
  assert.equal(controller.getState().saveState, "saved");

  controller.editAnswers({ tp_last_name: "Wang" });
  store.failNext = offline();
  await assert.rejects(controller.saveAnswers());
  controller.editAnswers({ tp_first_name: "Ming" });
  assert.equal(controller.getState().retryable, false);
  assert.equal(await controller.retryLast(), null);
  assert.equal(store.writes.length, 3);
  controller.stop();
});

test("the revealed list: typing never adds, a fix or a new case removes", async () => {
  const { controller } = await savedV2();
  controller.editAnswers({ email: "a@" });
  assert.deepEqual(controller.getState().revealed, [], "typing adds nothing");
  assert.equal(chip(controller), "Saved");
  controller.revealInvalid("email");
  assert.deepEqual(controller.getState().revealed, ["email"]);
  controller.revealInvalid("email");
  assert.deepEqual(controller.getState().revealed, ["email"], "added once");
  controller.revealInvalid("tp_first_name");
  assert.deepEqual(controller.getState().revealed, ["email"], "a valid value is never revealed");
  controller.editAnswers({ email: "mei@example.com" });
  assert.deepEqual(controller.getState().revealed, []);
  controller.editAnswers({ email: "a@" });
  assert.deepEqual(controller.getState().revealed, []);
  controller.revealInvalid("email");
  controller.editAnswers({ email: null });
  assert.deepEqual(controller.getState().revealed, [], "empty is not invalid");
  controller.stop();
});

test("leaving a sub-step reveals its invalid answers", async () => {
  const { controller } = await savedV2();
  await controller.goToSubstep("about.you");
  controller.editAnswers({ email: "a@", sp_dob: "1990-02-30" });
  assert.equal(chip(controller), "Saved");
  await controller.goToSubstep("about.address");
  assert.deepEqual(controller.getState().revealed, ["email"], "only the sub-step being left, and only visible questions");
  assert.equal(chip(controller), "1 answer needs checking");
  controller.stop();
});

test("a revealed answer whose question is hidden is not counted, and stays revealed", async () => {
  const { controller, store } = await openV2({ answers: { marital_status: "married" } });
  controller.editAnswers({ sp_dob: "1990-02-30" });
  assert.equal(controller.getState().dirty, false);
  controller.revealInvalid("sp_dob");
  assert.equal(chip(controller), "1 answer needs checking");
  store.records.set("case-v2", {
    ...store.records.get("case-v2"),
    revision: 2,
    answers: { marital_status: "never_married" },
  });
  await store.handlers.onChange({ table: "cases", caseId: "case-v2" });
  assert.equal(controller.getState().draftAnswers.sp_dob, "1990-02-30");
  assert.deepEqual(controller.getState().revealed, ["sp_dob"]);
  assert.equal(chip(controller), "Up to date");
  controller.stop();
});

test("removing a household member renumbers the revealed ids after it", async () => {
  const { controller } = await openV2();
  controller.editAnswers({
    has_household_members: "yes",
    hh: [
      { member_id: "00000000000000000000000000000001", first_name: "An", dob: "2015-02-30" },
      { member_id: "00000000000000000000000000000002", first_name: "Bo", dob: "2016-02-30" },
      { member_id: "00000000000000000000000000000003", first_name: "Cy", dob: "2017-01-01" },
    ],
  });
  controller.revealInvalid("hh[0].dob");
  controller.revealInvalid("hh[1].dob");
  assert.deepEqual(controller.getState().revealed, ["hh[0].dob", "hh[1].dob"]);
  const before = controller.getState().draftAnswers.hh;
  controller.removeMember(0);
  assert.deepEqual(controller.getState().revealed, ["hh[0].dob"]);
  assert.deepEqual(
    controller.getState().draftAnswers.hh.map((member) => member.first_name),
    ["Bo", "Cy"],
  );
  assert.equal(before.length, 3, "the old array is never changed in place");
  controller.removeMember(1);
  controller.removeMember(0);
  assert.deepEqual(controller.getState().revealed, []);
  assert.equal(controller.getState().draftAnswers.hh, null, "no members left reads null");
  controller.stop();
});

test("taking the office's valid value unreveals it", async () => {
  const { controller, store } = await savedV2();
  controller.editAnswers({ email: "a@" });
  controller.revealInvalid("email");
  controller.editAnswers({ tp_first_name: "Ming" });
  const server = { ...store.records.get("case-v2").answers, email: "office@example.com" };
  store.records.set("case-v2", { ...store.records.get("case-v2"), revision: 3, answers: server });
  await store.handlers.onChange({ table: "cases", caseId: "case-v2" });
  assert.equal(controller.getState().conflict?.code, "REMOTE_CHANGED");
  assert.deepEqual(controller.getState().revealed, ["email"]);
  await controller.reconcileAnswers({ answers: server, expectedServerRevision: 3 });
  assert.equal(controller.getState().draftAnswers.email, "office@example.com");
  assert.deepEqual(controller.getState().revealed, []);
  controller.editAnswers({ email: "a@" });
  assert.deepEqual(controller.getState().revealed, []);
  assert.equal(controller.getState().dirty, false);
  assert.equal(chip(controller), "Saved");
  controller.stop();
});

test("the sub-step and the revealed list round-trip through the window state; visits come from the server", async () => {
  const sessionStorage = fakeSession();
  // The fake server holds an invalid email (the real one never would), so the
  // restored id still has something to point at after the case is re-read.
  const first = await openV2({ answers: { email: "a@" }, sessionStorage });
  await first.controller.goToSubstep("about.you");
  await first.controller.goToSubstep("about.address");
  assert.deepEqual(first.controller.getState().revealed, ["email"]);
  const stored = JSON.parse(sessionStorage.raw("vitally:client:v1:user-1"));
  assert.equal(stored.formSubstep, "about.address");
  assert.deepEqual(stored.revealedAnswers, { caseId: "case-v2", ids: ["email"] });
  assert.equal(Object.hasOwn(stored, "visitedSteps"), false);
  first.controller.stop();

  const second = build({ store: first.store, sessionStorage });
  await second.controller.start();
  assert.equal(second.controller.getState().selectedCaseId, "case-v2");
  assert.equal(second.controller.getState().formSubstep, "about.address");
  assert.deepEqual(second.controller.getState().revealed, ["email"]);
  assert.deepEqual(second.controller.getState().visitedSubsteps, ["before.ready", "about.you"]);
  second.controller.stop();

  // A record for another case is not this case's; a stale 4b record and an id
  // the catalogue doesn't have are ignored (the latter lands on the first).
  const other = fakeSession({
    "vitally:client:v1:user-1": JSON.stringify({
      selectedCaseId: "case-v2",
      formSubstep: "old.gone",
      revealedAnswers: { caseId: "case-other", ids: ["email"] },
      visitedSteps: { caseId: "case-v2", steps: [3], revealed: ["email"] },
    }),
  });
  const third = build({ store: first.store, sessionStorage: other });
  await third.controller.start();
  assert.deepEqual(third.controller.getState().revealed, []);
  assert.equal(Object.hasOwn(third.controller.getState(), "visitedSteps"), false);
  assert.equal(third.controller.currentSubstep(), "before.ready");
  third.controller.stop();
});

test("a refusal that names a field is retried once without it", async () => {
  const refusal = (field) => Object.assign(new Error("refused"), { code: "VALIDATION", ...(field ? { field } : {}) });
  const once = await openV2();
  once.controller.editAnswers({ tp_first_name: "Mei", tp_dob: "1980-01-01" });
  once.store.refusals.push(refusal("tp_dob"));
  await once.controller.saveAnswers();
  assert.equal(once.store.writes.length, 2);
  assert.equal(once.store.writes[0].payload.answers.tp_dob, "1980-01-01");
  assert.equal(Object.hasOwn(once.store.writes[1].payload.answers, "tp_dob"), false);
  assert.equal(once.store.writes[1].payload.answers.tp_first_name, "Mei");
  assert.equal(once.store.writes[1].expectedRevision, once.store.writes[0].expectedRevision);
  assert.equal(once.controller.getState().saveState, "saved");
  once.controller.stop();

  const twice = await openV2();
  twice.controller.editAnswers({ tp_first_name: "Mei", tp_dob: "1980-01-01" });
  twice.store.refusals.push(refusal("tp_dob"), refusal("tp_first_name"), refusal("tp_first_name"));
  await assert.rejects(twice.controller.saveAnswers(), (error) => error.code === "VALIDATION");
  assert.equal(twice.store.writes.length, 2, "never a loop");
  assert.equal(twice.controller.getState().saveState, "failed");
  twice.controller.stop();

  const unnamed = await openV2();
  unnamed.controller.editAnswers({ tp_first_name: "Mei" });
  unnamed.store.refusals.push(refusal());
  await assert.rejects(unnamed.controller.saveAnswers(), (error) => error.code === "VALIDATION");
  assert.equal(unnamed.store.writes.length, 1);
  unnamed.controller.stop();
});

test("a version-1 case keeps today's whole-draft save, any-edit dirty and no revealed list", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: { firstName: "Mei" } }],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("case-a");
  controller.editAnswers({ firstName: "Mei", zip: "191", household: 2, stocks: null, tp_first_name: "x" });
  assert.deepEqual(controller.getState().draftAnswers, { firstName: "Mei", zip: "191", household: "2" });
  assert.equal(controller.getState().dirty, true, "any edit is dirty, even the same value");
  assert.equal(controller.getState().saveState, "unsaved");
  controller.editAnswers({ firstName: null });
  assert.equal(controller.getState().draftAnswers.firstName, "Mei", "null is dropped as today");
  controller.revealInvalid("zip");
  await controller.goToSubstep("about.you");
  assert.equal(store.writes.length, 0, "a version-1 case has no sub-steps");
  assert.equal(controller.currentSubstep(), null);
  await controller.saveAnswers();
  assert.deepEqual(controller.getState().revealed, []);
  assert.deepEqual(store.writes[0].payload.answers, { firstName: "Mei", zip: "191", household: "2" });
  assert.equal(chip(controller), "Saved");
  controller.stop();
});

// ---------------------------------------------------------------------------
// Sub-steps, visits on the server, revisions that change no answers, card
// actions and the return to the summary (spec 2026-10-04 §3.1, §3.7, §3.8,
// §5.2, §6.3).
// ---------------------------------------------------------------------------

// Every before.* and about.you answer a Done mark needs, tp_phone from the
// contact record.
const BEFORE_AND_YOU = {
  service: "drop_off",
  language: "english",
  tp_first_name: "Mei",
  tp_last_name: "Chen",
  tp_dob: "1980-01-01",
  tp_job_title: "Cook",
};

test("a new case opens at before.ready, and a resumed one at its first unfinished sub-step", async () => {
  const fresh = await openV2();
  assert.equal(fresh.controller.getState().formSubstep, "before.ready");
  assert.equal(fresh.controller.currentSubstep(), "before.ready");
  assert.equal(fresh.controller.getState().returnToSummary, false);
  fresh.controller.stop();

  const resumed = await openV2({
    answers: BEFORE_AND_YOU,
    contact: { phone: "2155550199" },
    intakeVisited: ["before.ready", "before.service", "before.language", "about.you"],
  });
  assert.equal(resumed.controller.getState().formSubstep, "about.address");
  assert.deepEqual(resumed.controller.getState().visitedSubsteps, [
    "before.ready",
    "before.service",
    "before.language",
    "about.you",
  ]);
  resumed.controller.stop();
});

test("leaving a sub-step with nothing edited saves the visit once, with the answers unchanged", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" } });
  await controller.goToSubstep("before.service");
  assert.equal(store.writes.length, 1);
  assert.equal(store.writes[0].type, "SAVE_ANSWERS");
  assert.equal(store.writes[0].expectedRevision, 1);
  assert.deepEqual(store.writes[0].payload, { answers: { tp_first_name: "Mei" }, visited: ["before.ready"] });
  assert.deepEqual(store.records.get("case-v2").intakeVisited, ["before.ready"]);
  assert.equal(controller.getState().dirty, false);
  assert.equal(controller.getState().formSubstep, "before.service");
  controller.stop();
});

test("revisiting already-visited sub-steps with nothing edited sends nothing", async () => {
  const { controller, store } = await openV2({
    answers: { tp_first_name: "Mei" },
    intakeVisited: ["before.ready", "before.service"],
  });
  assert.equal(controller.getState().formSubstep, "before.service");
  await controller.goToSubstep("before.ready");
  await controller.goToSubstep("before.service");
  assert.equal(store.writes.length, 0);
  assert.equal(controller.getState().dirty, false);
  assert.equal(controller.getState().formSubstep, "before.service");
  controller.stop();
});

test("a visited id the catalogue doesn't know is kept but never sent, and never makes the draft dirty", async () => {
  const { controller, store } = await openV2({
    answers: { tp_first_name: "Mei" },
    intakeVisited: ["old.gone"],
  });
  assert.equal(controller.getState().dirty, false);
  assert.ok(controller.getState().visitedSubsteps.includes("old.gone"));
  await controller.goToSubstep("before.service");
  assert.equal(store.writes.length, 1);
  assert.deepEqual(store.writes[0].payload.visited, ["before.ready"]);
  controller.editAnswers({ tp_first_name: "Ming" });
  await controller.saveAnswers();
  assert.deepEqual(store.writes[1].payload.visited, ["before.ready"]);
  controller.stop();
});

test("a presenter never sends visits, and its visits never make the draft dirty", async () => {
  const store = v2Store({ answers: { tp_first_name: "Mei" } });
  const presenterPrincipal = { userId: "user-9", workspaceId: "w1", access: "presenter" };
  store.getPrincipal = async () => presenterPrincipal;
  store.listPeople = async () => [{ id: "person-admin", capabilities: ["admin"] }];
  const { controller } = build({ store });
  await controller.start();
  controller.selectPerson("person-admin");
  await controller.selectCase("case-v2");
  await controller.goToSubstep("before.service");
  assert.equal(store.writes.length, 0);
  assert.equal(controller.getState().dirty, false);
  controller.editAnswers({ tp_first_name: "Ming" });
  await controller.saveAnswers();
  assert.equal(Object.hasOwn(store.writes[0].payload, "visited"), false);
  assert.equal(store.writes[0].personId, "person-admin");
  controller.stop();
});

test("on a submitted case, visits are never pending and a card mark sends only the card action", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" }, stage: "received" });
  await controller.goToSubstep("about.you");
  assert.ok(controller.getState().visitedSubsteps.includes("before.ready"), "a visit the server lacks");
  assert.equal(controller.getState().dirty, false);
  await controller.setDocumentCard("w2.household", "later");
  assert.deepEqual(
    store.writes.map((write) => write.type),
    ["SET_DOCUMENT_CARD"],
  );
  assert.deepEqual(store.writes[0].payload, { slotId: "w2.household", status: "later" });
  assert.equal(store.writes[0].expectedRevision, 1);
  assert.equal(store.writes[0].personId, null);
  assert.equal(controller.getState().savedCase.documentCards[0].status, "later");
  assert.equal(controller.getState().dirty, false);
  controller.stop();
});

test("two tabs: a submit elsewhere while only visits are unsaved takes the newer case, and a card mark goes through", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" } });
  store.failNext = offline();
  await controller.goToSubstep("before.service");
  assert.equal(controller.getState().dirty, true, "the visit is unsaved");
  // Tab B submits.
  await remoteChange(store, { stage: "received" });
  let state = controller.getState();
  assert.equal(state.conflict, null);
  assert.equal(state.savedCase.stage, "received");
  assert.equal(state.dirty, false);
  assert.equal(state.editBaseRevision, null);
  assert.deepEqual(state.visitedSubsteps, [], "the server's visits, the unsent one dropped");
  assert.equal(state.retryable, false, "the visits' envelope can no longer be sent");
  await controller.setDocumentCard("w2.household", "none");
  state = controller.getState();
  assert.deepEqual(
    store.writes.map((write) => write.type),
    ["SAVE_ANSWERS", "SET_DOCUMENT_CARD"],
  );
  assert.equal(store.writes[1].expectedRevision, 2);
  assert.equal(state.conflict, null);
  assert.equal(state.error, null);
  controller.stop();
});

test("§3.8 (a): a newer revision that changes no answers moves the pin and keeps the typing", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" } });
  controller.editAnswers({ tp_first_name: "Ming" });
  assert.equal(controller.getState().editBaseRevision, 1);
  await remoteChange(store, {
    documentCards: [{ slotId: "w2.household", status: "later", groupOverride: null, changedAt: "2026-10-04T12:00:00Z" }],
  });
  const state = controller.getState();
  assert.equal(state.conflict, null);
  assert.equal(state.editBaseRevision, 2);
  assert.equal(state.dirty, true);
  assert.equal(state.saveState, "unsaved");
  assert.equal(state.draftAnswers.tp_first_name, "Ming");
  assert.equal(state.savedCase.documentCards.length, 1);
  await controller.saveAnswers();
  assert.equal(store.writes[0].expectedRevision, 2);
  assert.equal(controller.getState().saveState, "saved");
  assert.equal(store.records.get("case-v2").answers.tp_first_name, "Ming");
  controller.stop();
});

test("§3.8 (b): a newer revision that changes an answer while answers are unsaved is a conflict", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" } });
  controller.editAnswers({ tp_first_name: "Ming" });
  await remoteChange(store, { answers: { tp_first_name: "Mei", addr_city: "Philadelphia" } });
  const state = controller.getState();
  assert.equal(state.conflict?.code, "REMOTE_CHANGED");
  assert.equal(state.conflict.baseRevision, 1);
  assert.equal(state.conflict.serverRevision, 2);
  assert.equal(state.editBaseRevision, 1);
  assert.equal(state.draftAnswers.tp_first_name, "Ming");
  assert.equal(Object.hasOwn(state.draftAnswers, "addr_city"), false);
  // A later answer-free revision does not clear a conflict already raised.
  await remoteChange(store, { documentCards: [{ slotId: "w2.household", status: "none", groupOverride: null }] });
  assert.equal(controller.getState().conflict?.code, "REMOTE_CHANGED");
  assert.equal(controller.getState().editBaseRevision, 1);
  controller.stop();
});

test("§3.8 (c): with only visits unsaved, a newer revision's answers are taken and the visits still sent", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" } });
  store.failNext = offline();
  await controller.goToSubstep("before.service");
  assert.equal(controller.getState().dirty, true);
  await remoteChange(store, { answers: { tp_first_name: "Mei", addr_city: "Philadelphia" } });
  let state = controller.getState();
  assert.equal(state.conflict, null);
  assert.equal(state.draftAnswers.addr_city, "Philadelphia");
  assert.deepEqual(state.visitedSubsteps, ["before.ready"]);
  assert.equal(state.editBaseRevision, 2);
  assert.equal(state.dirty, true);
  await controller.saveAnswers();
  const sent = store.writes.at(-1);
  assert.equal(sent.expectedRevision, 2);
  assert.deepEqual(sent.payload.visited, ["before.ready"]);
  assert.equal(sent.payload.answers.addr_city, "Philadelphia");
  state = controller.getState();
  assert.equal(state.saveState, "saved");
  assert.equal(state.dirty, false);
  assert.deepEqual(store.records.get("case-v2").intakeVisited, ["before.ready"]);
  controller.stop();
});

test("§3.8 (d): a stage change while answers are unsaved is handled as today", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" } });
  controller.editAnswers({ tp_first_name: "Ming" });
  await remoteChange(store, { stage: "received" });
  const state = controller.getState();
  assert.equal(state.conflict?.code, "REMOTE_CHANGED");
  assert.equal(state.editBaseRevision, 1, "never re-pinned");
  assert.equal(state.savedCase.stage, "received");
  assert.equal(state.draftAnswers.tp_first_name, "Ming");
  controller.stop();
});

test("a card action saves a dirty draft first, and a failed save stops it", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" } });
  controller.editAnswers({ tp_first_name: "Ming" });
  await controller.setDocumentCard("w2.household", "later");
  assert.deepEqual(
    store.writes.map((write) => [write.type, write.expectedRevision]),
    [
      ["SAVE_ANSWERS", 1],
      ["SET_DOCUMENT_CARD", 2],
    ],
  );
  assert.equal(controller.getState().conflict, null);
  assert.equal(controller.getState().dirty, false);
  controller.stop();

  const failing = await openV2({ answers: { tp_first_name: "Mei" } });
  failing.controller.editAnswers({ tp_first_name: "Ming" });
  failing.store.failNext = offline();
  assert.equal(await failing.controller.setDocumentCard("w2.household", "later"), null);
  assert.deepEqual(
    failing.store.writes.map((write) => write.type),
    ["SAVE_ANSWERS"],
  );
  assert.equal(failing.controller.getState().saveState, "failed");
  assert.equal(failing.controller.getState().error?.code, "OFFLINE");
  failing.controller.stop();
});

test("a card's group is moved through the same path", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" }, stage: "received" });
  await controller.setDocumentGroup("w2.household", "needed");
  assert.equal(store.writes.length, 1);
  assert.equal(store.writes[0].type, "SET_DOCUMENT_GROUP");
  assert.deepEqual(store.writes[0].payload, { slotId: "w2.household", group: "needed" });
  assert.equal(controller.getState().savedCase.documentCards[0].groupOverride, "needed");
  controller.stop();
});

test("a rail step collapses and expands in one change each", async () => {
  const { controller, renders } = await openV2({ answers: { tp_first_name: "Mei" } });
  await controller.goToSubstep("about.you");
  controller.togglePanel("rail-open:about");
  let before = renders.count;
  controller.setRailExpanded("about", false);
  assert.equal(renders.count, before + 1);
  let panels = controller.getState().openPanels;
  assert.ok(panels.includes("rail-shut:about"));
  assert.equal(panels.includes("rail-open:about"), false);
  before = renders.count;
  controller.setRailExpanded("about", true);
  assert.equal(renders.count, before + 1);
  panels = controller.getState().openPanels;
  assert.ok(panels.includes("rail-open:about"));
  assert.equal(panels.includes("rail-shut:about"), false);
  assert.equal(panels.filter((name) => name.endsWith(":about")).length, 1);
  controller.stop();
});

test("Change sets a return to the summary; Back to summary or a rail jump clears it", async () => {
  const { controller } = await openV2({ answers: { tp_first_name: "Mei" } });
  await controller.openForChange("about.address");
  assert.equal(controller.getState().formSubstep, "about.address");
  assert.equal(controller.getState().returnToSummary, true);
  await controller.backToSummary();
  assert.equal(controller.getState().formSubstep, "review.summary");
  assert.equal(controller.getState().returnToSummary, false);
  await controller.openForChange("about.address");
  await controller.goToSubstep("about.you");
  assert.equal(controller.getState().returnToSummary, false);
  await controller.openForChange("about.address");
  await controller.moveSubstep(1);
  assert.equal(controller.getState().returnToSummary, false);
  controller.stop();
});

test("moveSubstep goes to the next or previous visible sub-step and does nothing at either end", async () => {
  const { controller, store } = await openV2({ answers: { marital_status: "never_married" } });
  await controller.moveSubstep(-1);
  assert.equal(controller.getState().formSubstep, "before.ready");
  assert.equal(store.writes.length, 0, "nothing left, nothing visited");
  assert.deepEqual(controller.getState().visitedSubsteps, []);
  await controller.moveSubstep(1);
  assert.equal(controller.getState().formSubstep, "before.service");
  await controller.goToSubstep("about.marital");
  await controller.moveSubstep(1);
  assert.equal(controller.getState().formSubstep, "about.situation", "the hidden spouse sub-step is skipped");
  await controller.goToSubstep("review.submit");
  const writes = store.writes.length;
  await controller.moveSubstep(1);
  assert.equal(controller.getState().formSubstep, "review.submit");
  assert.equal(store.writes.length, writes);
  controller.stop();
});

test("currentSubstep resolves a place the draft has hidden to the next visible one", async () => {
  const { controller } = await openV2({ answers: { marital_status: "married" } });
  await controller.goToSubstep("about.spouse");
  assert.equal(controller.currentSubstep(), "about.spouse");
  controller.editAnswers({ marital_status: "never_married" });
  assert.equal(controller.getState().formSubstep, "about.spouse");
  assert.equal(controller.currentSubstep(), "about.situation");
  controller.stop();
});

test("an undo after a failed save stays Not saved, keeps its pin, and the next save sends the undone value", async () => {
  // An edit, a failed save, an undo.
  const edited = await savedV2();
  edited.controller.editAnswers({ tp_first_name: "Ming" });
  edited.store.failNext = offline();
  await assert.rejects(edited.controller.saveAnswers());
  edited.controller.editAnswers({ tp_first_name: "Mei" });
  assert.match(chip(edited.controller), /^Not saved\./);
  assert.equal(edited.controller.getState().dirty, true);
  await edited.controller.saveAnswers();
  assert.equal(edited.store.writes.at(-1).payload.answers.tp_first_name, "Mei");
  edited.controller.stop();

  // A failed clean save, then an edit and its undo: the failed save may have
  // landed, so the undo goes back to Not saved, not to Saved.
  const clean = await savedV2();
  clean.store.failNext = offline();
  await assert.rejects(clean.controller.saveAnswers());
  assert.equal(clean.controller.getState().dirty, false);
  clean.controller.editAnswers({ tp_first_name: "Ming" });
  assert.equal(clean.controller.getState().saveState, "unsaved");
  assert.equal(clean.controller.getState().editBaseRevision, 2);
  clean.controller.editAnswers({ tp_first_name: "Mei" });
  let state = clean.controller.getState();
  assert.equal(state.saveState, "failed");
  assert.equal(state.dirty, true);
  assert.equal(state.editBaseRevision, 2);
  assert.equal(state.retryable, false);
  assert.match(chip(clean.controller), /^Not saved\./);
  await clean.controller.saveAnswers();
  const sent = clean.store.writes.at(-1);
  assert.equal(sent.payload.answers.tp_first_name, "Mei");
  assert.equal(sent.expectedRevision, 2);
  state = clean.controller.getState();
  assert.equal(state.saveState, "saved");
  assert.equal(state.dirty, false);
  clean.controller.stop();
});

test("reconciling to the server's own answers leaves the form not dirty", async () => {
  const { controller, store } = await savedV2();
  controller.editAnswers({ tp_first_name: "Ming" });
  await remoteChange(store, { answers: { ...store.records.get("case-v2").answers, tp_last_name: "Wang" } });
  assert.equal(controller.getState().conflict?.code, "REMOTE_CHANGED");
  await controller.reconcileAnswers({ answers: {}, expectedServerRevision: 3, fromServer: true });
  let state = controller.getState();
  assert.equal(state.draftAnswers.tp_last_name, "Wang");
  assert.equal(state.draftAnswers.tp_first_name, "Mei");
  assert.equal(state.dirty, false);
  assert.equal(state.editBaseRevision, null);
  assert.equal(state.conflict, null);
  assert.equal(state.saveState, "saved");
  assert.equal(chip(controller), "Saved");

  // Keeping one's own edits is still a change to save, pinned at the newest.
  controller.editAnswers({ tp_first_name: "Ming" });
  await remoteChange(store, { answers: { ...store.records.get("case-v2").answers, tp_last_name: "Lee" } });
  await controller.reconcileAnswers({
    answers: controller.getState().draftAnswers,
    expectedServerRevision: 4,
  });
  state = controller.getState();
  assert.equal(state.dirty, true);
  assert.equal(state.editBaseRevision, 4);
  assert.equal(state.saveState, "unsaved");
  controller.stop();
});

test("every household member in the draft has a member id", async () => {
  const { controller, store } = await openV2({
    answers: { has_household_members: "yes", hh: [{ first_name: "Bo" }] },
  });
  // From the server: an id is given, and the same one survives a refresh.
  const fromServer = controller.getState().draftAnswers.hh[0].member_id;
  assert.ok(isMemberId(fromServer));
  await remoteChange(store, { answers: { has_household_members: "yes", hh: [{ first_name: "Bo" }], addr_city: "Philadelphia" } });
  assert.equal(controller.getState().draftAnswers.hh[0].member_id, fromServer);

  // An edit: a new member, an invalid id and a shared id all get their own.
  controller.editAnswers({
    hh: [
      { member_id: fromServer, first_name: "Bo" },
      { first_name: "A" },
      { member_id: "x", first_name: "C" },
      { member_id: fromServer, first_name: "D" },
    ],
  });
  const members = controller.getState().draftAnswers.hh;
  assert.equal(members[0].member_id, fromServer);
  assert.ok(members.every((member) => isMemberId(member.member_id)));
  assert.equal(new Set(members.map((member) => member.member_id)).size, 4);
  const ids = members.map((member) => member.member_id);
  controller.editAnswers({ tp_first_name: "Mei" });
  assert.deepEqual(controller.getState().draftAnswers.hh.map((member) => member.member_id), ids, "stable across edits");
  await controller.saveAnswers();
  assert.deepEqual(store.writes.at(-1).payload.answers.hh.map((member) => member.member_id), ids, "the household is sent, not withheld");
  controller.stop();

  const simple = await openV2();
  simple.controller.editAnswers({ hh: [{ first_name: "A" }] });
  assert.ok(isMemberId(simple.controller.getState().draftAnswers.hh[0].member_id));
  simple.controller.stop();
});

test("§3.8: after a failed save of an answer and its undo, a newer revision's answers are a choice, not taken", async () => {
  // The failed save may have landed: the newer revision may be that very
  // edit, which the person undid. Taking it silently would bring it back.
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" } });
  controller.editAnswers({ tp_first_name: "Ming" });
  store.failNext = offline();
  await controller.goToSubstep("before.service");
  controller.editAnswers({ tp_first_name: "Mei" });
  assert.equal(controller.getState().dirty, true);
  await remoteChange(store, { answers: { tp_first_name: "Ming" } });
  const state = controller.getState();
  assert.equal(state.conflict?.code, "REMOTE_CHANGED");
  assert.equal(state.draftAnswers.tp_first_name, "Mei");
  controller.stop();
});

test("a card mark and a sub-step change share one save at a time", async () => {
  // A mark during a sub-step change's save is ignored: no second save.
  const first = await openV2({ answers: { tp_first_name: "Mei" } });
  first.controller.editAnswers({ tp_first_name: "Ming" });
  let release = holdSaves(first.store);
  const moving = first.controller.goToSubstep("before.service");
  const marking = first.controller.setDocumentCard("w2.household", "later");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(first.store.actCalls, 1, "one SAVE_ANSWERS only");
  release();
  const [, marked] = await Promise.all([moving, marking]);
  assert.equal(marked, null);
  assert.deepEqual(first.store.writes.map((write) => write.type), ["SAVE_ANSWERS"]);
  assert.equal(first.controller.getState().formSubstep, "before.service");
  assert.equal(first.controller.getState().conflict, null);
  assert.equal(first.controller.getState().error, null);
  first.controller.stop();

  // A sub-step change during a mark's pre-save is ignored the same way.
  const second = await openV2({ answers: { tp_first_name: "Mei" } });
  second.controller.editAnswers({ tp_first_name: "Ming" });
  release = holdSaves(second.store);
  const marking2 = second.controller.setDocumentCard("w2.household", "later");
  const moving2 = second.controller.goToSubstep("about.you");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(second.store.actCalls, 1, "one SAVE_ANSWERS only");
  release();
  await Promise.all([marking2, moving2]);
  assert.deepEqual(
    second.store.writes.map((write) => [write.type, write.expectedRevision]),
    [
      ["SAVE_ANSWERS", 1],
      ["SET_DOCUMENT_CARD", 2],
    ],
  );
  assert.equal(second.controller.getState().formSubstep, "before.ready");
  assert.equal(second.controller.getState().conflict, null);
  assert.equal(second.controller.getState().error, null);
  second.controller.stop();
});

// A card mark is one action at a time from send to answer, not only during its
// pre-save: a second mark, or a sub-step change, sent while the first mark is
// in flight would carry the same expected revision and meet a false conflict.
test("a second card mark while the first is in flight is ignored, so no false conflict", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" } });
  assert.equal(controller.getState().dirty, false, "no pre-save: the mark goes straight out");
  const release = holdSaves(store);
  const first = controller.setDocumentCard("w2.household", "later");
  const second = controller.setDocumentCard("photo_id.tp", "none");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.actCalls, 1, "one SET_DOCUMENT_CARD only");
  release();
  const [marked, ignored] = await Promise.allSettled([first, second]);
  assert.equal(marked.status, "fulfilled");
  assert.deepEqual(ignored, { status: "fulfilled", value: null });
  assert.deepEqual(
    store.writes.map((write) => [write.type, write.payload.slotId, write.expectedRevision]),
    [["SET_DOCUMENT_CARD", "w2.household", 1]],
  );
  const state = controller.getState();
  assert.equal(state.conflict, null);
  assert.equal(state.error, null);
  assert.equal(state.savedCase.documentCards[0].status, "later");
  // Once it has landed, the next mark goes through with the new revision.
  await controller.setDocumentCard("photo_id.tp", "none");
  assert.deepEqual(store.writes.at(-1).expectedRevision, 2);
  assert.equal(controller.getState().error, null);
  controller.stop();
});

test("a sub-step change or a Change link while a card mark is in flight is ignored, so no false conflict", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" } });
  const release = holdSaves(store);
  const marking = controller.setDocumentCard("w2.household", "later");
  const moving = controller.goToSubstep("before.service");
  const continuing = controller.moveSubstep(1);
  const changing = controller.openForChange("about.you");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.actCalls, 1, "no visit save beside the mark");
  release();
  const results = await Promise.allSettled([marking, moving, continuing, changing]);
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled", "fulfilled", "fulfilled"]);
  assert.deepEqual(store.writes.map((write) => write.type), ["SET_DOCUMENT_CARD"]);
  const state = controller.getState();
  assert.equal(state.formSubstep, "before.ready", "the page stays where it was");
  assert.equal(state.returnToSummary, false);
  assert.deepEqual(state.visitedSubsteps, [], "an ignored move records no visit");
  assert.equal(state.dirty, false);
  assert.notEqual(state.saveState, "failed");
  assert.equal(state.conflict, null);
  assert.equal(state.error, null);
  // Once the mark has landed, the move goes through on the new revision.
  await controller.goToSubstep("before.service");
  assert.deepEqual(
    store.writes.map((write) => [write.type, write.expectedRevision]),
    [
      ["SET_DOCUMENT_CARD", 1],
      ["SAVE_ANSWERS", 2],
    ],
  );
  assert.equal(controller.getState().formSubstep, "before.service");
  assert.equal(controller.getState().error, null);
  controller.stop();
});

// ---------------------------------------------------------------------------
// The version-2 Add a case: a new office draft (spec 2026-10-04 §10)
// ---------------------------------------------------------------------------

// The office on a version-2 workspace. The server creates a case of the
// workspace's version with no owner, no contact, no visits and no card rows.
// `case-v2` is an owner-less version-2 office draft already saved.
function officeV2(options = {}) {
  const store = v2Store({
    principal: { userId: "p1", workspaceId: "w1", access: "presenter" },
    people: [{ id: "sam", name: "Sam", capabilities: ["admin", "assist", "followup"] }],
    workspace: { id: "w1", fixtureGeneration: 3, defaultFollowupPersonId: "sam", defaultIntakeVersion: 2 },
    ...options,
  });
  store.records.set("case-v2", { ...store.records.get("case-v2"), ownerUserId: null });
  const create = store.createCase;
  store.createCase = async (request) => {
    await store.createGate;
    const receipt = await create(request);
    const record = store.records.get(receipt.caseId);
    if (record.intakeVersion === undefined)
      store.records.set(receipt.caseId, {
        ...record,
        intakeVersion: store.workspace.defaultIntakeVersion,
        ownerUserId: null,
        contact: null,
        intakeVisited: [],
        documentCards: [],
      });
    return receipt;
  };
  // Reads to refuse, one per case id, before anything is returned.
  store.getFailures = new Map();
  const get = store.getCase;
  store.getCase = async (id) => {
    const failure = store.getFailures.get(id);
    if (failure) {
      store.getFailures.delete(id);
      store.calls.push(`getCase:${id}`);
      throw failure;
    }
    return get(id);
  };
  return store;
}

// Holds every create until `release()`.
function holdCreates(store) {
  let release;
  store.createGate = new Promise((resolve) => {
    release = resolve;
  });
  return () => release();
}

async function startOffice(options = {}) {
  const store = officeV2(options);
  let next = 0;
  const built = build({
    store,
    sessionStorage: options.sessionStorage,
    newActionId: () => `action-${(next += 1)}`,
  });
  await built.controller.start();
  built.controller.selectPerson("sam");
  return { store, ...built };
}

const writesOf = (store, type) => store.writes.filter((write) => (write.type ?? "createCase") === type);
const creates = (store) => store.writes.filter((write) => write.mode !== undefined);

test("Add a case on a version-2 workspace starts a new office draft that takes version-2 answers", async () => {
  const { controller } = await startOffice();
  await controller.openAddCase();
  let state = controller.getState();
  assert.equal(state.officeDraft, true);
  assert.equal(state.savedCase, null);
  assert.equal(state.selectedCaseId, null);
  assert.equal(state.screen, "office-add-case");
  assert.deepEqual(state.openAddSubsteps, ["before.ready"]);
  assert.equal(state.addCaseShowMissing, false);
  assert.equal(state.dirty, false);
  assert.equal(state.saveState, "idle");
  assert.deepEqual(state.revealed, []);
  controller.editAnswers({ tp_first_name: "Mei" });
  state = controller.getState();
  assert.equal(state.draftAnswers.tp_first_name, "Mei", "the version-2 key is kept");
  assert.equal(state.dirty, true, "anything typed is something to send");
  controller.editAnswers({ hh: [{ first_name: "A" }] });
  assert.ok(isMemberId(controller.getState().draftAnswers.hh[0].member_id));
  controller.stop();
});

test("the first Save draft creates one empty case, adopts it in place and saves without visits", async () => {
  const { controller, store } = await startOffice();
  await controller.openAddCase();
  controller.editAnswers({ tp_first_name: "Mei", email: "not-an-email" });
  const draft = controller.getState().draftAnswers;
  assert.deepEqual(await controller.saveOfficeDraft(), { sent: false });
  assert.deepEqual(creates(store), [
    { actionId: "action-1", mode: "assisted", personId: "sam", answers: {} },
  ]);
  const saves = writesOf(store, "SAVE_ANSWERS");
  assert.equal(saves.length, 1);
  assert.equal(saves[0].caseId, "case-2");
  assert.equal(saves[0].personId, "sam");
  assert.deepEqual(saves[0].payload.answers, withholdInvalid(draft, 2));
  assert.equal(Object.hasOwn(saves[0].payload, "visited"), false, "the office never sends visits");
  const state = controller.getState();
  assert.equal(state.officeDraft, false);
  assert.equal(state.officeDraftCaseId, null);
  assert.equal(state.savedCase.id, "case-2");
  assert.equal(state.selectedCaseId, "case-2");
  assert.equal(state.screen, "office-add-case");
  assert.equal(state.dirty, false);
  assert.equal(state.saveState, "saved");
  assert.equal(state.officeSaving, false);
  assert.equal(state.draftAnswers.email, "not-an-email", "the invalid value stays in the draft");
  controller.stop();
});

test("a save that fails after the create keeps the draft and the case, and never creates twice", async () => {
  const { controller, store } = await startOffice();
  await controller.openAddCase();
  controller.editAnswers({ tp_first_name: "Mei" });
  store.refusals.push(offline());
  await assert.rejects(controller.saveOfficeDraft(), { code: "OFFLINE" });
  let state = controller.getState();
  assert.equal(state.draftAnswers.tp_first_name, "Mei");
  assert.equal(state.selectedCaseId, "case-2");
  assert.equal(state.savedCase.id, "case-2");
  assert.equal(state.saveState, "failed");
  assert.equal(state.officeSaving, false);
  assert.equal(state.error.code, "OFFLINE");
  await controller.saveOfficeDraft();
  assert.equal(creates(store).length, 1, "no second case");
  assert.equal(writesOf(store, "SAVE_ANSWERS").length, 2, "one more save");
  state = controller.getState();
  assert.equal(state.saveState, "saved");
  assert.equal(store.records.get("case-2").answers.tp_first_name, "Mei");
  controller.stop();
});

test("a create with an unknown outcome is retried with the same action id", async () => {
  const { controller, store } = await startOffice();
  await controller.openAddCase();
  controller.editAnswers({ tp_first_name: "Mei" });
  store.failNext = offline();
  await assert.rejects(controller.saveOfficeDraft(), { code: "OFFLINE" });
  let state = controller.getState();
  assert.equal(state.officeDraft, true);
  assert.equal(state.savedCase, null);
  assert.equal(state.draftAnswers.tp_first_name, "Mei");
  await controller.saveOfficeDraft();
  assert.deepEqual(creates(store).map((write) => write.actionId), ["action-1", "action-1"]);
  state = controller.getState();
  assert.equal(state.savedCase.id, "case-2");
  assert.equal(writesOf(store, "SAVE_ANSWERS").length, 1);
  controller.stop();
});

test("a create that lands but whose case can't be read is used again, not created again", async () => {
  const { controller, store } = await startOffice();
  await controller.openAddCase();
  controller.editAnswers({ tp_first_name: "Mei" });
  store.getFailures.set("case-2", offline());
  await assert.rejects(controller.saveOfficeDraft(), { code: "OFFLINE" });
  let state = controller.getState();
  assert.equal(state.officeDraftCaseId, "case-2");
  assert.equal(state.officeDraft, true);
  assert.equal(state.savedCase, null);
  assert.equal(state.draftAnswers.tp_first_name, "Mei");
  assert.equal(state.error.code, "OFFLINE");
  assert.equal(writesOf(store, "SAVE_ANSWERS").length, 0);
  await controller.saveOfficeDraft();
  assert.equal(creates(store).length, 1, "no second case");
  assert.equal(writesOf(store, "SAVE_ANSWERS").length, 1);
  state = controller.getState();
  assert.equal(state.officeDraftCaseId, null);
  assert.equal(state.savedCase.id, "case-2");
  controller.stop();
});

test("what the office types while the case is being created is kept and saved", async () => {
  const { controller, store } = await startOffice();
  await controller.openAddCase();
  controller.editAnswers({ tp_first_name: "Mei" });
  const release = holdCreates(store);
  const saving = controller.saveOfficeDraft();
  await new Promise((resolve) => setImmediate(resolve));
  controller.editAnswers({ addr_city: "Camden" });
  release();
  await saving;
  const [save] = writesOf(store, "SAVE_ANSWERS");
  assert.equal(save.payload.answers.tp_first_name, "Mei");
  assert.equal(save.payload.answers.addr_city, "Camden");
  assert.equal(controller.getState().draftAnswers.addr_city, "Camden");
  assert.equal(controller.getState().dirty, false);
  controller.stop();
});

test("adopting the new case resets nothing on the page", async () => {
  const { controller } = await startOffice();
  await controller.openAddCase();
  controller.editAnswers({ tp_first_name: "Mei", email: "not-an-email" });
  controller.revealInvalid("email");
  controller.toggleAddSubstep("about.address");
  controller.togglePanel("confirmed");
  await controller.saveOfficeDraft();
  const state = controller.getState();
  assert.equal(state.savedCase.id, "case-2");
  assert.deepEqual(state.revealed, ["email"]);
  assert.deepEqual(state.openAddSubsteps, ["before.ready", "about.address"]);
  assert.ok(state.openPanels.includes("confirmed"));
  assert.equal(state.addCaseShowMissing, false);
  controller.stop();
});

test("one save at a time: a second press, or a card mark, during a Save draft does nothing", async () => {
  const { controller, store } = await startOffice();
  await controller.openAddCase();
  controller.editAnswers({ tp_first_name: "Mei" });
  const release = holdCreates(store);
  const first = controller.saveOfficeDraft();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().officeSaving, true);
  assert.deepEqual(await controller.saveOfficeDraft({ send: true }), { sent: false, reason: "busy" });
  assert.deepEqual(await controller.saveOfficeDraft(), { sent: false, reason: "busy" });
  assert.equal(await controller.setDocumentCard("w2.household", "later"), null);
  release();
  await first;
  assert.equal(creates(store).length, 1);
  assert.equal(writesOf(store, "SET_DOCUMENT_CARD").length, 0);
  assert.equal(controller.getState().officeSaving, false);
  // Once it has landed, a mark goes through on the saved case.
  await controller.setDocumentCard("w2.household", "later");
  assert.equal(writesOf(store, "SET_DOCUMENT_CARD").length, 1);
  controller.stop();
});

test("a workspace set back to version 1 under a new draft refuses, keeping the answers", async () => {
  const { controller, store } = await startOffice();
  await controller.openAddCase();
  controller.editAnswers({ tp_first_name: "Mei" });
  store.workspace = { ...store.workspace, defaultIntakeVersion: 1 };
  await assert.rejects(controller.saveOfficeDraft(), {
    code: "VALIDATION",
    message: "This workspace now takes version-1 applications. Start again from Add a case.",
  });
  assert.equal(writesOf(store, "SAVE_ANSWERS").length, 0);
  const state = controller.getState();
  assert.equal(state.draftAnswers.tp_first_name, "Mei");
  assert.equal(state.savedCase, null);
  assert.equal(state.error.code, "VALIDATION");
  assert.equal(state.officeSaving, false);
  controller.stop();
});

test("a new office draft never outlives the page, and starts again on a reload or when the workspace arrives", async () => {
  // Leaving resets it.
  const left = await startOffice();
  await left.controller.openAddCase();
  left.controller.editAnswers({ tp_first_name: "Mei" });
  left.controller.navigate("staff");
  let state = left.controller.getState();
  assert.equal(state.officeDraft, false);
  assert.equal(state.officeDraftCaseId, null);
  assert.equal(state.addCaseShowMissing, false);
  left.controller.stop();

  // A reload on Add a case with no case starts a new draft.
  const sessionStorage = fakeSession();
  const first = await startOffice({ sessionStorage });
  await first.controller.openAddCase();
  first.controller.stop();
  const again = await startOffice({ sessionStorage });
  state = again.controller.getState();
  assert.equal(state.screen, "office-add-case");
  assert.equal(state.officeDraft, true);
  assert.deepEqual(state.openAddSubsteps, ["before.ready"]);

  // A realtime workspace change doesn't wipe what is being typed.
  again.controller.editAnswers({ tp_first_name: "Mei" });
  again.store.workspace = { ...again.store.workspace, fixtureGeneration: 4 };
  await again.store.handlers.onChange({ table: "workspaces" });
  state = again.controller.getState();
  assert.equal(state.workspace.fixtureGeneration, 4);
  assert.equal(state.officeDraft, true);
  assert.equal(state.draftAnswers.tp_first_name, "Mei");
  assert.equal(state.dirty, true);
  again.controller.stop();

  // Pressed before the workspace row has loaded: the draft starts when it arrives.
  const store = officeV2();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const getWorkspace = store.getWorkspace;
  store.getWorkspace = async () => {
    await gate;
    return getWorkspace();
  };
  const early = build({ store });
  const starting = early.controller.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(early.controller.getState().workspace, null);
  await early.controller.openAddCase();
  state = early.controller.getState();
  assert.equal(state.screen, "office-add-case");
  assert.equal(state.officeDraft, false);
  release();
  await starting;
  state = early.controller.getState();
  assert.equal(state.officeDraft, true);
  assert.equal(state.screen, "office-add-case");
  early.controller.stop();
});

test("a refused Send saves the draft, shows what is missing and opens its part", async () => {
  const { controller, store } = await startOffice();
  await controller.openAddCase();
  const { addr_city: _city, ...answers } = makeSampleAnswers({ version: 2 });
  controller.editAnswers(answers);
  controller.togglePanel("confirmed");
  assert.deepEqual(await controller.saveOfficeDraft({ send: true }), { sent: false, reason: "answers" });
  assert.equal(creates(store).length, 1);
  assert.equal(writesOf(store, "SAVE_ANSWERS").length, 1);
  assert.equal(writesOf(store, "SUBMIT").length, 0);
  let state = controller.getState();
  assert.equal(state.addCaseShowMissing, true);
  assert.ok(state.openAddSubsteps.includes("about.address"));
  assert.ok(state.openAddSubsteps.includes("before.ready"), "opening one closes none");
  assert.equal(state.screen, "office-add-case");
  assert.equal(state.savedCase.id, "case-2");
  // Answered now: the next Send goes, and the missing marks are reset.
  controller.editAnswers({ addr_city: "Camden" });
  assert.deepEqual(await controller.saveOfficeDraft({ send: true }), { sent: true });
  state = controller.getState();
  assert.equal(state.addCaseShowMissing, false);
  assert.equal(state.screen, "staff-case");
  assert.equal(creates(store).length, 1);
  assert.equal(writesOf(store, "SUBMIT").length, 1);
  controller.stop();

  // Leaving resets the missing marks too.
  const other = await startOffice();
  await other.controller.openAddCase();
  other.controller.editAnswers({ tp_first_name: "Mei" });
  other.controller.togglePanel("confirmed");
  await other.controller.saveOfficeDraft({ send: true });
  assert.equal(other.controller.getState().addCaseShowMissing, true);
  other.controller.navigate("staff");
  assert.equal(other.controller.getState().addCaseShowMissing, false);
  other.controller.stop();
});

test("Send needs the confirmation; ticked, a complete new draft is created, saved and sent", async () => {
  const unticked = await startOffice();
  await unticked.controller.openAddCase();
  unticked.controller.editAnswers(makeSampleAnswers({ version: 2 }));
  assert.deepEqual(await unticked.controller.saveOfficeDraft({ send: true }), {
    sent: false,
    reason: "unconfirmed",
  });
  assert.deepEqual(unticked.store.writes, [], "nothing is created, saved or sent");
  assert.equal(unticked.controller.getState().officeDraft, true);
  unticked.controller.stop();

  const { controller, store } = await startOffice();
  await controller.openAddCase();
  controller.editAnswers(makeSampleAnswers({ version: 2 }));
  controller.togglePanel("confirmed");
  assert.deepEqual(await controller.saveOfficeDraft({ send: true }), { sent: true });
  assert.deepEqual(
    store.writes.map((write) => write.type ?? "createCase"),
    ["createCase", "SAVE_ANSWERS", "SUBMIT"],
  );
  const submit = writesOf(store, "SUBMIT")[0];
  assert.deepEqual(submit.payload, { confirmed: true });
  assert.equal(submit.personId, "sam");
  assert.equal(submit.expectedRevision, 2, "the saved revision");
  const state = controller.getState();
  assert.equal(state.screen, "staff-case");
  assert.equal(state.selectedCaseId, "case-2");
  assert.equal(state.officeSaving, false);
  controller.stop();
});

test("a Send with an invalid answer saves, reveals it and sends nothing", async () => {
  const { controller, store } = await startOffice();
  await controller.openAddCase();
  controller.editAnswers({ ...makeSampleAnswers({ version: 2 }), email: "not-an-email" });
  controller.togglePanel("confirmed");
  assert.deepEqual(await controller.saveOfficeDraft({ send: true }), { sent: false, reason: "answers" });
  assert.equal(writesOf(store, "SAVE_ANSWERS").length, 1);
  assert.equal(writesOf(store, "SUBMIT").length, 0);
  const state = controller.getState();
  assert.ok(state.revealed.includes("email"));
  assert.ok(state.openAddSubsteps.includes("about.you"));
  assert.equal(state.addCaseShowMissing, true);
  assert.equal(state.screen, "office-add-case");
  controller.stop();
});

test("Add a case opens a saved office draft on the page, whatever the workspace's version", async () => {
  for (const version of [2, 1]) {
    const { controller, store } = await startOffice({ answers: { tp_first_name: "Mei" } });
    store.workspace = { ...store.workspace, defaultIntakeVersion: version };
    await controller.refresh();
    await controller.openAddCase({ caseId: "case-v2" });
    const state = controller.getState();
    assert.equal(state.selectedCaseId, "case-v2", `version ${version}`);
    assert.equal(state.savedCase.id, "case-v2");
    assert.equal(state.officeDraft, false);
    assert.equal(state.screen, "office-add-case");
    assert.deepEqual(state.openAddSubsteps, ["before.ready"]);
    assert.equal(state.draftAnswers.tp_first_name, "Mei");
    controller.stop();
  }
});

test("Add a case's parts open and close independently", async () => {
  const { controller } = await startOffice();
  await controller.openAddCase();
  controller.toggleAddSubstep("about.you");
  controller.toggleAddSubstep("documents");
  assert.deepEqual(controller.getState().openAddSubsteps, ["before.ready", "about.you", "documents"]);
  controller.toggleAddSubstep("before.ready");
  assert.deepEqual(controller.getState().openAddSubsteps, ["about.you", "documents"]);
  controller.stop();
});

test("a version-1 workspace keeps today's Add a case page and one-call creation", async () => {
  const store = officeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 2, ownerUserId: null, answers: {} }],
  });
  const { controller } = build({ store });
  await controller.start();
  controller.selectPerson("sam");
  await controller.selectCase("case-a", { navigate: false });
  await controller.openAddCase();
  let state = controller.getState();
  assert.equal(state.screen, "office-add-case");
  assert.equal(state.officeDraft, false);
  assert.equal(state.selectedCaseId, null, "today's page never reads the selection");
  assert.equal(state.savedCase, null);
  assert.deepEqual(store.writes, []);
  await controller.createAssistedCase({ answers: { firstName: "Mei" } });
  assert.deepEqual(store.writes[0].answers, { firstName: "Mei" });
  assert.equal(store.writes[0].mode, "assisted");
  state = controller.getState();
  assert.equal(state.screen, "staff-case");
  assert.equal(state.selectedCaseId, state.savedCase.id);
  controller.stop();
});

test("the adopted draft is pinned: a re-read of the new case before its save lands keeps the draft", async () => {
  const { controller, store } = await startOffice();
  await controller.openAddCase();
  controller.editAnswers({ tp_first_name: "Mei" });
  const release = holdSaves(store);
  const saving = controller.saveOfficeDraft();
  await new Promise((resolve) => setImmediate(resolve));
  let state = controller.getState();
  assert.equal(state.savedCase.id, "case-2");
  assert.equal(state.editBaseRevision, 1);
  // The create's own change arrives while the save is out.
  await store.handlers.onChange({ table: "cases", caseId: "case-2" });
  state = controller.getState();
  assert.equal(state.draftAnswers.tp_first_name, "Mei");
  assert.equal(state.conflict, null);
  release();
  await saving;
  assert.equal(store.records.get("case-2").answers.tp_first_name, "Mei");
  assert.equal(controller.getState().saveState, "saved");
  controller.stop();
});

// ---- fix round 1 ----------------------------------------------------------

// Starts a Save draft whose create is held, runs `meanwhile`, then lets the
// create land. Returns the Save draft's result.
async function leaveMidCreate(controller, store, meanwhile) {
  await controller.openAddCase();
  controller.editAnswers({ tp_first_name: "Lin" });
  const release = holdCreates(store);
  const saving = controller.saveOfficeDraft();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().officeSaving, true, "the create is out");
  await meanwhile();
  release();
  return await saving;
}

test("a create that lands after another case was opened adopts nothing and saves nothing", async () => {
  const { controller, store } = await startOffice({ answers: { tp_first_name: "Mei" } });
  const result = await leaveMidCreate(controller, store, () => controller.selectCase("case-v2"));
  assert.deepEqual(result, { sent: false, reason: "left" });
  const state = controller.getState();
  assert.equal(state.selectedCaseId, "case-v2");
  assert.equal(state.savedCase.id, "case-v2");
  assert.equal(state.screen, "staff-case");
  assert.equal(state.officeDraftCaseId, null);
  assert.equal(writesOf(store, "SAVE_ANSWERS").length, 0);
  assert.ok(store.records.has("case-2"), "the empty case stays, unselected");
  assert.equal(store.records.get("case-v2").answers.tp_first_name, "Mei");
  assert.equal(state.officeSaving, false);
  controller.stop();
});

test("a create that lands after the office left for the board adopts nothing and saves nothing", async () => {
  const { controller, store } = await startOffice();
  const result = await leaveMidCreate(controller, store, async () => controller.navigate("staff"));
  assert.deepEqual(result, { sent: false, reason: "left" });
  const state = controller.getState();
  assert.equal(state.screen, "staff");
  assert.equal(state.selectedCaseId, null);
  assert.equal(state.savedCase, null);
  assert.equal(state.officeDraftCaseId, null);
  assert.equal(writesOf(store, "SAVE_ANSWERS").length, 0);
  controller.stop();
});

test("a create that lands after sign-out, or after a fresh draft started, adopts nothing", async () => {
  const signedOut = await startOffice();
  const result = await leaveMidCreate(signedOut.controller, signedOut.store, () => signedOut.controller.signOut());
  assert.deepEqual(result, { sent: false, reason: "left" });
  let state = signedOut.controller.getState();
  assert.equal(state.principal, null);
  assert.equal(state.selectedCaseId, null);
  assert.equal(state.savedCase, null);
  assert.equal(state.officeDraftCaseId, null);
  assert.equal(writesOf(signedOut.store, "SAVE_ANSWERS").length, 0);
  signedOut.controller.stop();

  const fresh = await startOffice();
  const again = await leaveMidCreate(fresh.controller, fresh.store, () => fresh.controller.openAddCase());
  assert.deepEqual(again, { sent: false, reason: "left" });
  state = fresh.controller.getState();
  assert.equal(state.officeDraft, true, "the fresh draft is untouched");
  assert.equal(state.savedCase, null);
  assert.equal(state.officeDraftCaseId, null);
  assert.deepEqual(state.draftAnswers, {});
  assert.equal(writesOf(fresh.store, "SAVE_ANSWERS").length, 0);
  fresh.controller.stop();
});

test("a Send whose save outlives its case sends nothing", async () => {
  const { controller, store } = await startOffice({ answers: { tp_first_name: "Mei" } });
  await controller.openAddCase();
  controller.editAnswers(makeSampleAnswers({ version: 2 }));
  controller.togglePanel("confirmed");
  const release = holdSaves(store);
  const sending = controller.saveOfficeDraft({ send: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getState().savedCase.id, "case-2");
  await controller.selectCase("case-v2");
  release();
  assert.deepEqual(await sending, { sent: false, reason: "left" });
  assert.equal(writesOf(store, "SUBMIT").length, 0);
  assert.equal(controller.getState().selectedCaseId, "case-v2");
  controller.stop();
});

test("Add a case on a version-1 workspace drops a version-2 selection and a refused draft", async () => {
  const { controller, store } = await startOffice({ answers: { tp_first_name: "Mei" } });
  store.workspace = { ...store.workspace, defaultIntakeVersion: 1 };
  await store.handlers.onChange({ table: "workspaces" });
  await controller.selectCase("case-v2");
  await controller.openAddCase();
  let state = controller.getState();
  assert.equal(state.screen, "office-add-case");
  assert.equal(state.selectedCaseId, null);
  assert.equal(state.savedCase, null);
  assert.equal(state.officeDraft, false);
  controller.stop();

  // Refused because the workspace went back to version 1, then Add a case again.
  const refused = await startOffice();
  await refused.controller.openAddCase();
  refused.controller.editAnswers({ tp_first_name: "Lin" });
  refused.store.workspace = { ...refused.store.workspace, defaultIntakeVersion: 1 };
  await assert.rejects(refused.controller.saveOfficeDraft(), { code: "VALIDATION" });
  assert.equal(refused.controller.getState().officeDraftCaseId, "case-2");
  await refused.store.handlers.onChange({ table: "workspaces" });
  await refused.controller.openAddCase();
  state = refused.controller.getState();
  assert.equal(state.officeDraft, false);
  assert.equal(state.officeDraftCaseId, null);
  assert.deepEqual(state.draftAnswers, {});
  assert.equal(state.dirty, false);
  assert.equal(state.screen, "office-add-case");
  refused.controller.stop();
});

test("on a new office draft, typing while the first save is out is kept and still to send", async () => {
  const { controller, store } = await startOffice();
  await controller.openAddCase();
  controller.editAnswers({ tp_first_name: "Mei" });
  const release = holdSaves(store);
  const saving = controller.saveOfficeDraft();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.actCalls, 1);
  controller.editAnswers({ addr_city: "Camden" });
  release();
  await saving;
  let state = controller.getState();
  assert.equal(store.records.get("case-2").answers.tp_first_name, "Mei");
  assert.equal(Object.hasOwn(store.records.get("case-2").answers, "addr_city"), false);
  assert.equal(state.draftAnswers.addr_city, "Camden");
  assert.equal(state.draftAnswers.tp_first_name, "Mei");
  assert.equal(state.dirty, true);
  assert.equal(state.saveState, "unsaved");
  await controller.saveOfficeDraft();
  assert.equal(store.records.get("case-2").answers.addr_city, "Camden");
  state = controller.getState();
  assert.equal(state.dirty, false);
  assert.equal(state.error, null);
  controller.stop();
});

test("on the client's own version-2 draft, typing while a save is out is kept; the same value is not dirty", async () => {
  const { controller, store } = await openV2({ answers: { tp_first_name: "Mei" } });
  controller.editAnswers({ tp_first_name: "Ming" });
  let release = holdSaves(store);
  let saving = controller.saveAnswers();
  await new Promise((resolve) => setImmediate(resolve));
  controller.editAnswers({ addr_city: "Camden" });
  release();
  await saving;
  let state = controller.getState();
  assert.equal(state.draftAnswers.tp_first_name, "Ming");
  assert.equal(state.draftAnswers.addr_city, "Camden");
  assert.equal(state.dirty, true);
  await controller.saveAnswers();
  assert.equal(store.records.get("case-v2").answers.addr_city, "Camden");
  assert.equal(store.writes.at(-1).expectedRevision, 2);
  assert.equal(controller.getState().dirty, false);

  // Changed and changed back while the save is out: nothing new to send.
  controller.editAnswers({ tp_first_name: "Lan" });
  release = holdSaves(store);
  saving = controller.saveAnswers();
  await new Promise((resolve) => setImmediate(resolve));
  controller.editAnswers({ tp_first_name: "Mei" });
  controller.editAnswers({ tp_first_name: "Lan" });
  release();
  await saving;
  state = controller.getState();
  assert.equal(state.draftAnswers.tp_first_name, "Lan");
  assert.equal(state.dirty, false);
  assert.equal(state.saveState, "saved");
  controller.stop();
});
