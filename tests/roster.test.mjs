import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRoster,
  parseRosterArgs,
  applyRoster,
} from "../tools/admin/roster.mjs";

const WORKSPACE = "3f1c2b4a-8d7e-4f60-9a1b-2c3d4e5f6a7b";
const valid = () => ({
  workspaceId: WORKSPACE,
  presenters: ["  Presenter@Example.org "],
  applicants: ["client-a@example.org", "client-b@example.org"],
  sampleCaseOwners: { preparation_ready: "Client-A@example.org" },
});
const invalid = (pattern) => (error) =>
  error.code === "ROSTER_INVALID" && pattern.test(error.message);

test("a roster is trimmed, lower-cased and kept in order", () => {
  assert.deepEqual(parseRoster(valid()), {
    workspaceId: WORKSPACE,
    presenters: ["presenter@example.org"],
    applicants: ["client-a@example.org", "client-b@example.org"],
    sampleCaseOwners: { preparation_ready: "client-a@example.org" },
  });
  const { sampleCaseOwners, ...bare } = valid();
  assert.deepEqual(parseRoster(bare).sampleCaseOwners, {});
});

test("a malformed roster names the problem, never the address", () => {
  assert.throws(() => parseRoster(null), invalid(/JSON object/));
  assert.throws(
    () => parseRoster({ ...valid(), workspaceId: "not-a-uuid" }),
    invalid(/workspaceId/),
  );
  assert.throws(
    () => parseRoster({ ...valid(), presenters: [] }),
    invalid(/at least one presenter/),
  );
  assert.throws(
    () => parseRoster({ ...valid(), applicants: "client@example.org" }),
    invalid(/applicants must be a list/),
  );
  const badAddress = { ...valid(), applicants: ["ok@example.org", "no at sign"] };
  assert.throws(() => parseRoster(badAddress), (error) =>
    invalid(/applicants\[1\]/)(error) && !error.message.includes("no at sign"),
  );
  const twice = { ...valid(), applicants: ["PRESENTER@example.org"] };
  assert.throws(() => parseRoster(twice), (error) =>
    invalid(/applicants\[0\] is already on the roster/)(error) &&
    !/presenter@/i.test(error.message),
  );
  assert.throws(
    () => parseRoster({ ...valid(), sampleCaseOwners: { intake_ready: "client-a@example.org" } }),
    invalid(/intake_ready is not a sample case/),
  );
  assert.throws(
    () => parseRoster({ ...valid(), sampleCaseOwners: { review_ready: "presenter@example.org" } }),
    (error) =>
      invalid(/review_ready must name an applicant/)(error) &&
      !error.message.includes("presenter@"),
  );
});

test("the command needs an explicit target and a roster file", () => {
  assert.deepEqual(
    parseRosterArgs(["--target", "test", "--roster", "roster.json"]),
    { target: { kind: "test" }, rosterPath: "roster.json" },
  );
  assert.deepEqual(
    parseRosterArgs(["--roster", "r.json", "--target", "classroom"]),
    { target: { kind: "classroom" }, rosterPath: "r.json" },
  );
  for (const argv of [
    [],
    ["--roster", "r.json"],
    ["--target", "production", "--roster", "r.json"],
    ["--target", "test"],
    ["--target", "test", "--roster"],
    ["--target", "test", "--roster", "r.json", "--extra"],
  ])
    assert.throws(() => parseRosterArgs(argv), (error) => error.code === "ROSTER_USAGE");
});

function fakeAdmin(existing, { failCreate = false, perPage } = {}) {
  const calls = { list: [], create: [], confirm: [] };
  const users = existing.map((user) => ({ ...user }));
  let next = 1;
  const admin = {
    auth: {
      admin: {
        async listUsers({ page, perPage: size }) {
          calls.list.push({ page, perPage: size });
          const limit = perPage ?? size;
          return {
            data: { users: users.slice((page - 1) * limit, page * limit) },
            error: null,
          };
        },
        async createUser(attributes) {
          calls.create.push(attributes);
          if (failCreate)
            return { data: { user: null }, error: { message: `boom for ${attributes.email}` } };
          const user = {
            id: `00000000-0000-4000-8000-00000000000${next++}`,
            email: attributes.email,
            email_confirmed_at: "now",
          };
          users.push(user);
          return { data: { user }, error: null };
        },
        async updateUserById(id, attributes) {
          calls.confirm.push({ id, attributes });
          return { data: { user: { id } }, error: null };
        },
      },
    },
  };
  return { admin, calls };
}

test("missing accounts are created confirmed, and the workspace gets their ids", async () => {
  const { admin, calls } = fakeAdmin([
    { id: "aaaaaaaa-0000-4000-8000-000000000001", email: "presenter@example.org", email_confirmed_at: "then" },
    { id: "bbbbbbbb-0000-4000-8000-000000000002", email: "Client-B@Example.org", email_confirmed_at: null },
    { id: "cccccccc-0000-4000-8000-000000000003", email: "someone-else@example.org", email_confirmed_at: "then" },
  ]);
  const setups = [];
  const result = await applyRoster(parseRoster(valid()), {
    admin,
    initialize: async (setup) => {
      setups.push(setup);
      return { workspaceId: setup.workspaceId };
    },
  });
  assert.deepEqual(calls.create, [
    { email: "client-a@example.org", email_confirm: true },
  ]);
  assert.equal("password" in calls.create[0], false);
  assert.deepEqual(calls.confirm, [
    { id: "bbbbbbbb-0000-4000-8000-000000000002", attributes: { email_confirm: true } },
  ]);
  assert.deepEqual(setups, [
    {
      workspaceId: WORKSPACE,
      presenterUserIds: ["aaaaaaaa-0000-4000-8000-000000000001"],
      applicantUserIds: [
        "00000000-0000-4000-8000-000000000001",
        "bbbbbbbb-0000-4000-8000-000000000002",
      ],
      fixtureClientBindings: {
        preparation_ready: "00000000-0000-4000-8000-000000000001",
      },
    },
  ]);
  assert.deepEqual(result, {
    workspaceId: WORKSPACE,
    presenters: 1,
    applicants: 2,
    created: 1,
    confirmed: 1,
  });
});

test("every page of existing accounts is read before anything is created", async () => {
  const existing = Array.from({ length: 5 }, (_, i) => ({
    id: `dddddddd-0000-4000-8000-00000000000${i}`,
    email: `filler-${i}@example.org`,
    email_confirmed_at: "then",
  }));
  existing.push({
    id: "eeeeeeee-0000-4000-8000-000000000009",
    email: "presenter@example.org",
    email_confirmed_at: "then",
  });
  const { admin, calls } = fakeAdmin(existing, { perPage: 2 });
  await applyRoster(
    parseRoster({ workspaceId: WORKSPACE, presenters: ["presenter@example.org"], applicants: [] }),
    { admin, initialize: async () => ({}), perPage: 2 },
  );
  assert.deepEqual(calls.list.map((call) => call.page), [1, 2, 3, 4]);
  assert.deepEqual(calls.create, []);
});

test("an account failure stops before the workspace changes and hides the address", async () => {
  const { admin } = fakeAdmin([], { failCreate: true });
  let initialized = false;
  await assert.rejects(
    applyRoster(parseRoster(valid()), {
      admin,
      initialize: async () => {
        initialized = true;
      },
    }),
    (error) =>
      error.code === "ROSTER_ACCOUNT_FAILED" &&
      /presenters\[0\]/.test(error.message) &&
      !error.message.includes("@"),
  );
  assert.equal(initialized, false);
});
