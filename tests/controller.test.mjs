import test from "node:test";
import assert from "node:assert/strict";
import { createController } from "../src/controller.mjs";

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
  again.controller.setBoardFilter("status", "mine");

  // Signing out drops them with everything else this window held.
  await again.controller.signOut();
  assert.deepEqual(again.controller.getState().boardFilters, {});
  assert.equal(shared.raw("vitally:client:v1:p1"), null);
  again.controller.stop();
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
