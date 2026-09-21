import test from "node:test";
import assert from "node:assert/strict";
import {
  createStore,
  mapCase,
  mapAssistance,
  SUBSCRIBED_TABLES,
} from "../src/supabase-store.mjs";

// The staff tables an applicant read must never touch. The live file proves
// RLS would refuse them anyway; this asserts the adapter does not even ask.
const STAFF_ONLY_TABLES = [
  "people",
  "preparation_participants",
  "admin_followups",
  "contact_attempts",
  "case_events",
  "reviews",
  "assistance_items",
  "action_receipts",
];

const CASE_ROW = Object.freeze({
  id: "case-1",
  reference: "VT-ABCD-2345",
  workspace_id: "workspace-1",
  owner_user_id: "user-1",
  fixture: false,
  fixture_key: null,
  origin: "client",
  created_by_user_id: "user-1",
  created_by_person_id: null,
  answers: { year: "2025" },
  stage: "preparing",
  revision: 7,
  preparation_version: 1,
  intake_verified: true,
  preparer_id: "person-alex",
  reviewer_id: null,
  last_reminded_at: null,
  last_reminded_by_person_id: null,
  created_at: "2026-09-10T15:00:00.000Z",
  updated_at: "2026-09-12T16:30:00.000Z",
});

// Every related row the staff read assembles, one per table.
const RELATED_ROWS = Object.freeze({
  document_requests: [
    {
      id: "request-1",
      workspace_id: "workspace-1",
      case_id: "case-1",
      title: "Mileage record",
      message: "Please add the fictional sample.",
      status: "open",
      requested_by_person_id: "person-alex",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
  ],
  documents: [
    {
      id: "document-1",
      workspace_id: "workspace-1",
      case_id: "case-1",
      request_id: "request-1",
      filename: "demo-mileage-record-2025.pdf",
      source: "client",
      submitted_by_user_id: "user-1",
      submitted_by_person_id: null,
      created_at: "2026-09-02T00:00:00Z",
    },
  ],
  client_events: [
    {
      id: "client-event-1",
      workspace_id: "workspace-1",
      case_id: "case-1",
      action: "SUBMIT",
      message: "Application received.",
      created_at: "2026-09-01T00:00:00Z",
    },
  ],
  case_events: [
    {
      id: "case-event-1",
      workspace_id: "workspace-1",
      case_id: "case-1",
      actor_user_id: "user-2",
      actor_person_id: "person-sam",
      action: "VERIFY_INTAKE",
      detail: { simulated: true },
      created_at: "2026-09-01T00:00:00Z",
    },
  ],
  preparation_participants: [
    {
      workspace_id: "workspace-1",
      case_id: "case-1",
      person_id: "person-alex",
      created_at: "2026-09-01T00:00:00Z",
    },
  ],
  admin_followups: [
    {
      id: "followup-1",
      workspace_id: "workspace-1",
      case_id: "case-1",
      request_id: "request-1",
      assignee_person_id: "person-sam",
      status: "open",
      reason: "No response to the document request.",
      resolution_outcome: null,
      resolution_note: null,
      created_by_person_id: "person-alex",
      created_at: "2026-09-03T00:00:00Z",
      resolved_at: null,
    },
  ],
  contact_attempts: [
    {
      id: "attempt-1",
      workspace_id: "workspace-1",
      case_id: "case-1",
      followup_id: "followup-1",
      actor_user_id: "user-2",
      actor_person_id: "person-sam",
      outcome: "no_answer",
      note: null,
      created_at: "2026-09-04T00:00:00Z",
    },
  ],
  reviews: [
    {
      id: "review-1",
      workspace_id: "workspace-1",
      case_id: "case-1",
      preparation_version: 1,
      reviewer_person_id: "person-morgan",
      status: "active",
      findings: null,
      resolution: null,
      client_contact_status: null,
      client_contact_outcome: null,
      client_contact_note: null,
      client_contacted_at: null,
      created_at: "2026-09-05T00:00:00Z",
      decided_at: null,
    },
  ],
  people: [
    {
      id: "person-alex",
      workspace_id: "workspace-1",
      person_key: "alex",
      name: "Alex",
      capabilities: ["prepare"],
    },
  ],
  assistance_items: [
    {
      id: "item-1",
      workspace_id: "workspace-1",
      case_id: "case-1",
      title: "Client needs help completing intake forms",
      status: "open",
      revision: 1,
      assignee_person_id: null,
      language: "Mandarin",
      contact_preference: "Prefers calls from the main office",
      resolution_note: null,
      fixture: false,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
  ],
});

// A captured supabase-js double: it records every table read, every RPC
// envelope and every channel, and answers from plain fixture rows.
// What supabase-js returns from `getUser()` when there is no session: an
// `AuthSessionMissingError`, which carries a name and a status but no
// database code. The SDK never answers with a null user and no error.
const SESSION_MISSING = Object.freeze({
  name: "AuthSessionMissingError",
  status: 400,
  message: "Auth session missing!",
});
// What it returns when the request could not reach the server. It is returned,
// not thrown, and it is just as code-less as the one above.
const RETRYABLE_FETCH = Object.freeze({
  name: "AuthRetryableFetchError",
  status: 0,
  message: "Failed to fetch",
});

function fakeClient({
  access = "presenter",
  user = { id: "user-1", email: "student@example.com" },
  rows = {},
  rpc,
  readError,
  authError,
  authThrows,
} = {}) {
  const table = (name) =>
    name === "memberships"
      ? access === null
        ? []
        : [{ user_id: user?.id, workspace_id: "workspace-1", access }]
      : name === "cases"
        ? (rows.cases ?? [CASE_ROW])
        : (rows[name] ?? RELATED_ROWS[name] ?? []);
  const client = {
    reads: [],
    rpcCalls: [],
    channels: [],
    removed: [],
    auth: {
      // Mirrors the SDK: a failure is returned, never `error: undefined`, and
      // a null user always comes with the error that explains it.
      getUser: async () => {
        if (authThrows) throw authThrows;
        if (authError) return { data: { user: null }, error: authError };
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: SESSION_MISSING };
      },
    },
    from(name) {
      const read = { table: name, filters: [], orders: [] };
      client.reads.push(read);
      const builder = {
        select(columns) {
          read.columns = columns;
          return builder;
        },
        eq(column, value) {
          read.filters.push([column, value]);
          return builder;
        },
        order(column) {
          read.orders.push(column);
          return builder;
        },
        then: (onFulfilled, onRejected) =>
          Promise.resolve()
            .then(() => {
              if (readError) return { data: null, error: readError };
              const matches = table(name).filter((row) =>
                read.filters.every(([column, value]) => row[column] === value),
              );
              return { data: matches, error: null };
            })
            .then(onFulfilled, onRejected),
      };
      return builder;
    },
    async rpc(name, args) {
      client.rpcCalls.push({ name, args });
      return rpc
        ? rpc(name, args)
        : { data: { actionId: args.p_action_id }, error: null };
    },
    channel(name) {
      const record = { name, bindings: [], status: null, handlers: {} };
      client.channels.push(record);
      const channel = {
        record,
        on(type, filter, handler) {
          record.bindings.push({ type, filter, handler });
          return channel;
        },
        subscribe(onStatus) {
          record.onStatus = onStatus;
          return channel;
        },
      };
      record.channel = channel;
      return channel;
    },
    removeChannel(channel) {
      client.removed.push(channel);
    },
  };
  return client;
}

// `subscribe` resolves the caller's access before it opens a channel, so tests
// wait for the channel rather than guessing at a tick count.
const settle = async () => {
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
};

test("the principal is the caller's own membership plus their identity", async () => {
  const client = fakeClient({ access: "applicant" });
  assert.deepEqual(await createStore(client).getPrincipal(), {
    userId: "user-1",
    workspaceId: "workspace-1",
    access: "applicant",
    email: "student@example.com",
  });
  assert.deepEqual(
    client.reads.map((read) => read.table),
    ["memberships"],
  );
});

test("no membership and no session are both FORBIDDEN", async () => {
  await assert.rejects(() => createStore(fakeClient({ access: null })).getPrincipal(), {
    code: "FORBIDDEN",
  });
  await assert.rejects(
    () => createStore(fakeClient({ user: null })).getPrincipal(),
    { code: "FORBIDDEN" },
  );
});

test("an unreachable server is OFFLINE, not a refusal", async () => {
  // The SDK returns this failure instead of throwing it, and it is as
  // code-less as a missing session. Telling an offline visitor with a cached
  // session that they have no access would be the wrong answer, and the wrong
  // screen.
  await assert.rejects(
    () => createStore(fakeClient({ authError: RETRYABLE_FETCH })).getPrincipal(),
    (error) => {
      assert.equal(error.code, "OFFLINE");
      assert.equal(error.cause, RETRYABLE_FETCH);
      return true;
    },
  );
  // A visitor who is simply signed out still gets the refusal.
  await assert.rejects(
    () => createStore(fakeClient({ authError: SESSION_MISSING })).getPrincipal(),
    { code: "FORBIDDEN" },
  );
  // A thrown call stays OFFLINE, as before.
  await assert.rejects(
    () =>
      createStore(
        fakeClient({ authThrows: new TypeError("fetch failed") }),
      ).getPrincipal(),
    { code: "OFFLINE" },
  );
});

test("listCases maps rows to the Case scalars with no related tables", async () => {
  const client = fakeClient({ access: "applicant" });
  const cases = await createStore(client).listCases();
  assert.deepEqual(cases, [
    {
      id: "case-1",
      reference: "VT-ABCD-2345",
      workspaceId: "workspace-1",
      ownerUserId: "user-1",
      fixture: false,
      stage: "preparing",
      revision: 7,
      preparationVersion: 1,
      answers: { year: "2025" },
      intakeVerified: true,
      preparerId: "person-alex",
      reviewerId: null,
      lastRemindedAt: null,
      lastRemindedByPersonId: null,
      createdAt: "2026-09-10T15:00:00.000Z",
      updatedAt: "2026-09-12T16:30:00.000Z",
    },
  ]);
  assert.deepEqual(cases[0], mapCase(CASE_ROW));
  assert.deepEqual(
    client.reads.map((read) => read.table),
    ["cases"],
  );
});

test("an applicant case read asks for no staff table at all", async () => {
  const client = fakeClient({ access: "applicant" });
  const found = await createStore(client).getCase("case-1");
  const tables = client.reads.map((read) => read.table);
  assert.deepEqual(tables.toSorted(), [
    "cases",
    "client_events",
    "document_requests",
    "documents",
    "memberships",
  ]);
  for (const staffTable of STAFF_ONLY_TABLES)
    assert.ok(!tables.includes(staffTable), staffTable);
  assert.deepEqual(Object.keys(found).toSorted(), [
    "answers",
    "createdAt",
    "documents",
    "fixture",
    "history",
    "id",
    "intakeVerified",
    "lastRemindedAt",
    "lastRemindedByPersonId",
    "ownerUserId",
    "preparationVersion",
    "preparerId",
    "reference",
    "requests",
    "reviewerId",
    "revision",
    "stage",
    "updatedAt",
    "workspaceId",
  ]);
  assert.equal(found.requests[0].requestedByPersonId, "person-alex");
  assert.equal(found.history[0].message, "Application received.");
});

test("a presenter case read adds exactly the staff sections", async () => {
  const client = fakeClient({ access: "presenter" });
  const found = await createStore(client).getCase("case-1");
  assert.deepEqual(
    client.reads.map((read) => read.table).toSorted(),
    [
      "admin_followups",
      "case_events",
      "cases",
      "client_events",
      "contact_attempts",
      "document_requests",
      "documents",
      "memberships",
      "preparation_participants",
      "reviews",
    ],
  );
  assert.deepEqual(found.participants, ["person-alex"]);
  assert.deepEqual(found.reviews, [
    {
      id: "review-1",
      preparationVersion: 1,
      reviewerId: "person-morgan",
      status: "active",
      findings: null,
      resolution: null,
      clientContactStatus: null,
      clientContactOutcome: null,
      clientContactNote: null,
      createdAt: "2026-09-05T00:00:00Z",
      decidedAt: null,
      clientContactedAt: null,
    },
  ]);
  assert.deepEqual(found.followups, [
    {
      id: "followup-1",
      requestId: "request-1",
      assigneeId: "person-sam",
      status: "open",
      reason: "No response to the document request.",
      resolutionOutcome: null,
      resolutionNote: null,
      createdByPersonId: "person-alex",
      createdAt: "2026-09-03T00:00:00Z",
      resolvedAt: null,
      attempts: [
        {
          id: "attempt-1",
          outcome: "no_answer",
          note: null,
          actorPersonId: "person-sam",
          createdAt: "2026-09-04T00:00:00Z",
        },
      ],
    },
  ]);
  assert.equal(found.internalHistory[0].action, "VERIFY_INTAKE");
});

test("an invisible or absent case is one NOT_FOUND", async () => {
  const client = fakeClient({ access: "applicant", rows: { cases: [] } });
  await assert.rejects(() => createStore(client).getCase("case-1"), {
    code: "NOT_FOUND",
  });
});

test("the roster and the assistance list are presenter reads", async () => {
  const presenter = createStore(fakeClient({ access: "presenter" }));
  assert.deepEqual(await presenter.listPeople(), [
    { id: "person-alex", name: "Alex", capabilities: ["prepare"] },
  ]);
  assert.deepEqual(await presenter.listAssistance(), [
    mapAssistance(RELATED_ROWS.assistance_items[0]),
  ]);
  const applicant = createStore(fakeClient({ access: "applicant" }));
  // Access is checked first, so an applicant gets a refusal rather than an
  // empty roster that looks like a workspace with no volunteers.
  await assert.rejects(() => applicant.listPeople(), { code: "FORBIDDEN" });
  await assert.rejects(() => applicant.listAssistance(), { code: "FORBIDDEN" });
});

test("act sends the frozen envelope and maps the SQLSTATE", async () => {
  const client = fakeClient({
    rpc: async () => ({ data: null, error: { code: "VT003" } }),
  });
  const action = {
    actionId: "action-1",
    caseId: "case-1",
    expectedRevision: 7,
    personId: null,
    type: "SAVE_ANSWERS",
    payload: { answers: { year: "2025" } },
  };
  await assert.rejects(() => createStore(client).act(action), {
    code: "CONFLICT",
  });
  assert.deepEqual(client.rpcCalls, [
    {
      name: "vitally_apply_action",
      args: {
        p_action_id: "action-1",
        p_case_id: "case-1",
        p_expected_revision: 7,
        p_person_id: null,
        p_type: "SAVE_ANSWERS",
        p_payload: { answers: { year: "2025" } },
      },
    },
  ]);
});

test("a thrown transport failure becomes OFFLINE through the shared mapper", async () => {
  const client = fakeClient({
    rpc: async () => {
      throw new TypeError("fetch failed");
    },
  });
  await assert.rejects(
    () =>
      createStore(client).act({
        actionId: "action-1",
        caseId: "case-1",
        expectedRevision: 7,
        type: "SUBMIT",
        payload: { confirmed: true },
      }),
    { code: "OFFLINE" },
  );
});

test("a read failure is mapped too, and 42501 is FORBIDDEN", async () => {
  await assert.rejects(
    () => createStore(fakeClient({ readError: { code: "42501" } })).listCases(),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    () =>
      createStore(fakeClient({ readError: { code: "PGRST301" } })).listCases(),
    { code: "SERVER_ERROR" },
  );
});

test("a retry of a timed-out action re-sends the identical envelope", async () => {
  let attempt = 0;
  const client = fakeClient({
    rpc: async (name, args) => {
      attempt += 1;
      if (attempt === 1) throw new TypeError("fetch failed");
      return { data: { actionId: args.p_action_id, revision: 8 }, error: null };
    },
  });
  const store = createStore(client);
  // The caller did not supply an action id, so the store mints one — once.
  const action = {
    caseId: "case-1",
    expectedRevision: 7,
    type: "SUBMIT",
    payload: { confirmed: true },
  };
  await assert.rejects(() => store.act(action), { code: "OFFLINE" });
  await store.act(action);
  assert.equal(client.rpcCalls.length, 2);
  assert.deepEqual(client.rpcCalls[0].args, client.rpcCalls[1].args);
  assert.equal(typeof client.rpcCalls[0].args.p_action_id, "string");
  // It is kept on the action itself, so the caller can persist it too.
  assert.equal(action.actionId, client.rpcCalls[0].args.p_action_id);
});

test("every other RPC uses its documented signature", async () => {
  const client = fakeClient();
  const store = createStore(client);
  await store.createCase({
    actionId: "action-1",
    mode: "client",
    personId: null,
    answers: { year: "2025" },
  });
  await store.actAssistance({
    actionId: "action-2",
    itemId: "item-1",
    expectedRevision: 1,
    personId: "person-sam",
    type: "CLAIM",
    note: null,
  });
  await store.resetFixtures({ actionId: "action-3" });
  await store.loadCheckpoint({
    actionId: "action-4",
    caseId: "case-1",
    expectedRevision: 7,
    checkpoint: "review_ready",
  });
  assert.deepEqual(client.rpcCalls, [
    {
      name: "vitally_create_case",
      args: {
        p_action_id: "action-1",
        p_mode: "client",
        p_person_id: null,
        p_answers: { year: "2025" },
      },
    },
    {
      name: "vitally_assistance_action",
      args: {
        p_action_id: "action-2",
        p_item_id: "item-1",
        p_expected_revision: 1,
        p_person_id: "person-sam",
        p_type: "CLAIM",
        p_note: null,
      },
    },
    { name: "vitally_reset_fixtures", args: { p_action_id: "action-3" } },
    {
      name: "vitally_load_checkpoint",
      args: {
        p_action_id: "action-4",
        p_case_id: "case-1",
        p_expected_revision: 7,
        p_checkpoint: "review_ready",
      },
    },
  ]);
});

test("createCase returns the server receipt unchanged", async () => {
  const receipt = {
    actionId: "action-1",
    caseId: "case-1",
    reference: "VT-ABCD-2345",
    revision: 1,
  };
  const client = fakeClient({ rpc: async () => ({ data: receipt, error: null }) });
  assert.deepEqual(
    await createStore(client).createCase({
      actionId: "action-1",
      mode: "client",
      personId: null,
      answers: {},
    }),
    receipt,
  );
});

test("a subscription watches only the tables its principal may read", async () => {
  for (const [access, expected] of Object.entries(SUBSCRIBED_TABLES)) {
    const client = fakeClient({ access });
    const stop = createStore(client).subscribe({
      onChange: () => {},
      onConnection: () => {},
    });
    await settle();
    assert.equal(client.channels.length, 1, access);
    const [channel] = client.channels;
    assert.deepEqual(
      [...new Set(channel.bindings.map((binding) => binding.filter.table))],
      [...expected],
      access,
    );
    // INSERT and UPDATE only: a removed row is never announced.
    assert.deepEqual(
      [...new Set(channel.bindings.map((binding) => binding.filter.event))],
      ["INSERT", "UPDATE"],
      access,
    );
    assert.ok(
      channel.bindings.every(
        (binding) =>
          binding.type === "postgres_changes" &&
          binding.filter.schema === "public",
      ),
    );
    stop();
  }
  assert.deepEqual(SUBSCRIBED_TABLES.applicant, [
    "cases",
    "document_requests",
    "documents",
    "client_events",
    "workspaces",
  ]);
});

test("a change announces identifiers only", async () => {
  const seen = [];
  const client = fakeClient({ access: "applicant" });
  const stop = createStore(client).subscribe({ onChange: (change) => seen.push(change) });
  await settle();
  const [channel] = client.channels;
  const fire = (table, eventType, row) =>
    channel.bindings
      .filter(
        (binding) =>
          binding.filter.table === table && binding.filter.event === eventType,
      )
      .forEach((binding) => binding.handler({ eventType, new: row, old: {} }));
  fire("cases", "UPDATE", {
    id: "case-1",
    reference: "VT-ABCD-2345",
    answers: { firstName: "Mei" },
  });
  fire("client_events", "INSERT", {
    id: "client-event-1",
    case_id: "case-1",
    message: "Application received.",
  });
  assert.deepEqual(seen, [
    { table: "cases", eventType: "UPDATE", id: "case-1", caseId: "case-1" },
    {
      table: "client_events",
      eventType: "INSERT",
      id: "client-event-1",
      caseId: "case-1",
    },
  ]);
  stop();
});

test("channel status becomes a connection state and cleanup happens once", async () => {
  const states = [];
  const client = fakeClient({ access: "applicant" });
  const stop = createStore(client).subscribe({
    onChange: () => {},
    onConnection: (state) => states.push(state),
  });
  await settle();
  const [channel] = client.channels;
  for (const status of [
    "SUBSCRIBED",
    "TIMED_OUT",
    "CHANNEL_ERROR",
    "CLOSED",
    "SOMETHING_NEW",
  ])
    channel.onStatus(status);
  assert.deepEqual(states, ["online", "reconnecting", "reconnecting", "offline"]);
  stop();
  stop();
  stop();
  assert.deepEqual(client.removed, [channel.channel]);
});

test("unsubscribing before the channel opens never opens one", async () => {
  const client = fakeClient({ access: "applicant" });
  const stop = createStore(client).subscribe({ onChange: () => {} });
  stop();
  await settle();
  assert.deepEqual(client.channels, []);
  assert.deepEqual(client.removed, []);
});
