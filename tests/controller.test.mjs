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
} = {}) {
  const records = new Map(cases.map((entry) => [entry.id, entry]));
  const store = {
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
  const renders = { count: 0 };
  const events = options.windowEvents ?? fakeEvents();
  const sessionStorage = options.sessionStorage ?? fakeSession();
  const controller = createController({
    store: options.store,
    auth: options.auth ?? idleAuth(),
    render: () => {
      renders.count += 1;
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
