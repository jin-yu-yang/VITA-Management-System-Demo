import test from "node:test";
import assert from "node:assert/strict";
import {
  createWindowState,
  windowStateKey,
  ACCESS_KEY,
} from "../src/window-state.mjs";

// A session-storage double that also records what was written, so the tests can
// assert the stored document and not only what comes back out.
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

test("choices are stored per user and restored as they were", () => {
  const sessionStorage = fakeSession();
  const window = createWindowState({ sessionStorage });
  assert.equal(window.read("user-1"), null, "nothing stored is nothing restored");

  window.write("user-1", {
    screen: "staff-case",
    selectedCaseId: "case-a",
    selectedPersonId: "alex",
    formStep: 2,
    openPanels: ["confirmed"],
    pendingCreateActionId: "action-1",
    boardFilters: { status: "available", assignment: "mine" },
  });
  window.write("user-2", { screen: "applications", selectedCaseId: "case-z" });

  assert.deepEqual(window.read("user-1"), {
    screen: "staff-case",
    selectedCaseId: "case-a",
    selectedPersonId: "alex",
    formStep: 2,
    openPanels: ["confirmed"],
    pendingCreateActionId: "action-1",
    boardFilters: { status: "available", assignment: "mine" },
  });
  assert.deepEqual(window.read("user-2"), {
    screen: "applications",
    selectedCaseId: "case-z",
  });
  assert.deepEqual(sessionStorage.keys().toSorted(), [
    windowStateKey("user-1"),
    windowStateKey("user-2"),
  ]);
  assert.equal(windowStateKey("user-1"), "vitally:client:v1:user-1");
  // Staff filters and the persona live in the same record as the client's
  // selection: one key scheme, so one sign-out clears everything.
  assert.ok(sessionStorage.raw(windowStateKey("user-1")).includes("boardFilters"));
});

test("only known fields of the right shape survive a round trip", () => {
  const sessionStorage = fakeSession();
  const window = createWindowState({ sessionStorage });
  window.write("user-1", {
    screen: "staff",
    formStep: "2",
    openPanels: "confirmed",
    boardFilters: ["available"],
    selectedCaseId: 17,
    access: "presenter",
    answers: { firstName: "Mei" },
    authCode: "123456",
  });
  assert.deepEqual(window.read("user-1"), { screen: "staff" });
  const stored = sessionStorage.raw(windowStateKey("user-1"));
  for (const forbidden of ["answers", "authCode", "access", "Mei", "123456"])
    assert.ok(!stored.includes(forbidden), forbidden);
});

test("an unreadable record restores nothing and never throws", () => {
  const broken = fakeSession({
    [windowStateKey("user-1")]: "{not json",
    [ACCESS_KEY]: "[]",
  });
  const window = createWindowState({ sessionStorage: broken });
  assert.equal(window.read("user-1"), null);
  assert.deepEqual(window.readAccess(), {}, "a non-object access record is empty");

  // A window with no session storage at all behaves the same way.
  const none = createWindowState({});
  assert.equal(none.read("user-1"), null);
  none.write("user-1", { screen: "staff" });
  none.clear("user-1");
  assert.deepEqual(none.readAccess(), {});
  none.writeAccess({ startedAt: 1 });
  none.clearAccess();
  assert.equal(none.cooldownRemaining(65), 0);

  // Storage that refuses to be written is not a failure either.
  const refusing = createWindowState({
    sessionStorage: {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    },
  });
  assert.equal(refusing.read("user-1"), null);
  refusing.write("user-1", { screen: "staff" });
  refusing.clear("user-1");
});

test("clearing one user's record leaves the other window state alone", () => {
  const sessionStorage = fakeSession();
  const window = createWindowState({ sessionStorage });
  window.write("user-1", { screen: "staff", selectedPersonId: "alex" });
  window.write("user-2", { screen: "applications" });
  window.writeAccess({ startedAt: 1_000, email: "mei@example.org" });

  window.clear("user-1");
  assert.equal(window.read("user-1"), null);
  assert.deepEqual(window.read("user-2"), { screen: "applications" });
  assert.equal(
    window.readAccess().email,
    "mei@example.org",
    "the access record belongs to the window, not to a user",
  );
  window.clearAccess();
  assert.deepEqual(window.readAccess(), {});
  assert.deepEqual(sessionStorage.keys(), [windowStateKey("user-2")]);
});

test("the cooldown is measured from the stored moment, not from this instance", () => {
  let now = 1_000_000;
  const sessionStorage = fakeSession();
  const window = createWindowState({ sessionStorage, clock: () => now });
  assert.equal(window.cooldownRemaining(65), 0, "no request, no cooldown");

  window.writeAccess({ startedAt: now, email: "mei@example.org", message: "Check your inbox." });
  assert.equal(window.cooldownRemaining(65), 65);
  now += 20_000;
  assert.equal(window.cooldownRemaining(65), 45);

  // A reload is a new collaborator over the same storage: the timer survives.
  const reloaded = createWindowState({ sessionStorage, clock: () => now });
  assert.equal(reloaded.cooldownRemaining(65), 45);
  now += 45_000;
  assert.equal(reloaded.cooldownRemaining(65), 0);
  now += 60_000;
  assert.equal(reloaded.cooldownRemaining(65), 0, "it never goes negative");

  // Nonsense in either input is no cooldown at all, never NaN.
  window.writeAccess({ startedAt: "soon" });
  assert.equal(window.cooldownRemaining(65), 0);
  window.writeAccess({ startedAt: now });
  assert.equal(window.cooldownRemaining(undefined), 0);
});

test("the sidebar choice is kept only when it is a real boolean", () => {
  const sessionStorage = fakeSession();
  const window = createWindowState({ sessionStorage });
  window.write("user-1", { screen: "staff", sidebarOpen: false });
  assert.deepEqual(window.read("user-1"), { screen: "staff", sidebarOpen: false });
  window.write("user-1", { screen: "staff", sidebarOpen: "no" });
  assert.deepEqual(window.read("user-1"), { screen: "staff" });
});

test("the case tab is kept as a string", () => {
  const sessionStorage = fakeSession();
  const window = createWindowState({ sessionStorage });
  window.write("user-1", { screen: "staff-case", caseTab: "documents" });
  assert.deepEqual(window.read("user-1"), { screen: "staff-case", caseTab: "documents" });
  window.write("user-1", { screen: "staff-case", caseTab: 3 });
  assert.deepEqual(window.read("user-1"), { screen: "staff-case" });
});

test("the visited steps and revealed errors of one case round-trip", () => {
  const sessionStorage = fakeSession();
  const window = createWindowState({ sessionStorage });
  const visitedSteps = { caseId: "case-a", steps: [0, 1, 8], revealed: ["email", "hh[1].dob"] };
  window.write("user-1", { screen: "intake", visitedSteps });
  assert.deepEqual(window.read("user-1"), { screen: "intake", visitedSteps });

  // A record written before `revealed` existed reads as none revealed.
  window.write("user-1", { screen: "intake", visitedSteps: { caseId: "case-a", steps: [2] } });
  assert.deepEqual(window.read("user-1").visitedSteps, { caseId: "case-a", steps: [2], revealed: [] });
});

test("a malformed visited-steps record is dropped whole", () => {
  const sessionStorage = fakeSession();
  const window = createWindowState({ sessionStorage });
  for (const visitedSteps of [
    { caseId: 17, steps: [0], revealed: [] },
    { steps: [0], revealed: [] },
    { caseId: "case-a", steps: [0, 1.5], revealed: [] },
    { caseId: "case-a", steps: ["1"], revealed: [] },
    { caseId: "case-a", steps: [9], revealed: [] },
    { caseId: "case-a", steps: [-1], revealed: [] },
    { caseId: "case-a", steps: "0,1", revealed: [] },
    { caseId: "case-a", steps: [0], revealed: ["email", 3] },
    { caseId: "case-a", steps: [0], revealed: "email" },
    ["case-a", [0]],
    "case-a",
  ]) {
    window.write("user-1", { screen: "intake", visitedSteps });
    assert.deepEqual(window.read("user-1"), { screen: "intake" }, JSON.stringify(visitedSteps));
  }
});
