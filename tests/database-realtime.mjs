import test from "node:test";
import assert from "node:assert/strict";
import { createDatabaseFixture } from "./support/database-fixture.mjs";
import { createStore } from "../src/supabase-store.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";

// What a client may watch, and what it must never receive.
//
// Postgres Changes evaluates the same row-level security the tables already
// carry, so a subscription without an owner filter is exactly the question
// this file asks: *given no filter at all, does one applicant's channel ever
// carry another applicant's row?* The answer has to be proved, not assumed,
// and silence is never the proof — a channel that never connected, a tenant
// that stopped streaming, or a change that was never committed would all look
// like perfect isolation.
//
// So every check here is built the same way:
//
//   1. Both applicants subscribe, with no filters, and both must reach
//      SUBSCRIBED before anything is committed.
//   2. A **control** change owned by B is committed and must arrive on B's
//      channel. Until it does, the machinery is not known to work, so nothing
//      that follows would mean anything. Realtime restarts a tenant's
//      streaming lazily, so the control is repeated until it lands.
//   3. A **uniquely marked** change owned by A is committed and must arrive on
//      A's channel, matching by id, by marker, and — for `cases` — by the
//      exact revision the action returned.
//   4. A later **fence** change owned by B is committed and must arrive on
//      B's *same* channel. Postgres Changes delivers a channel's events in
//      commit order, so B receiving the fence proves B has already been
//      offered everything committed before it, A's marked change included.
//   5. Only then is B's collected traffic examined: through that fence, it
//      carries no id and no marker of A's.
//
// Every wait carries a deadline, and a deadline that expires fails the test.
// Channel errors are failures too. Channels are removed in `finally`.
//
// See https://supabase.com/docs/guides/realtime/postgres-changes for the
// ordering this relies on.

const REALTIME_DEADLINE_MS = 15_000;
// How long one retry of a warm-up control waits before committing another.
const CONTROL_ATTEMPT_MS = 2_500;

// The deadline for a promise that has none of its own — a channel's SUBSCRIBED
// or an adapter's first "online". Everything that waits for a *payload* carries
// its own rejecting deadline instead (`waitFor` below), because a timer raced
// against another timer of the same delay is decided by insertion order rather
// than by what actually happened.
async function withDeadline(promise, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${message} within ${REALTIME_DEADLINE_MS}ms`)),
          REALTIME_DEADLINE_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const marker = () => `Marker-${crypto.randomUUID()}`;

// One raw supabase-js channel with a single `{event, table}` binding and no
// filter whatsoever. It records everything it is handed, reports its status,
// and lets a test wait for one specific payload.
function watchTable(client, bindings, label) {
  const payloads = [];
  const waiters = new Set();
  const errors = [];
  let stopped = false;
  const channel = client.channel(`vitally-test:${crypto.randomUUID()}`);
  for (const { event, table } of bindings)
    channel.on("postgres_changes", { event, schema: "public", table }, (payload) => {
      payloads.push(payload);
      for (const waiter of [...waiters]) waiter(payload);
    });
  let settle;
  const subscribed = new Promise((resolve) => (settle = resolve));
  channel.subscribe((status, error) => {
    if (status === "SUBSCRIBED") settle(status);
    // A channel that errors or closes mid-test is a failure, never evidence
    // that nothing was delivered.
    else if (status !== "CLOSED" || !stopped)
      errors.push(`${label}: ${status}${error ? ` (${error.message})` : ""}`);
  });
  const rowOf = (payload) => payload?.new ?? payload?.old ?? {};
  const watching = bindings
    .map(({ event, table }) => `${event} ${table}`)
    .join(", ");
  // One wait, in two shapes. `pending` resolves the first payload the
  // predicate accepts — including one already collected — and answers `null`
  // once `ms` has passed; only `controlUntilSeen` is allowed to see that null,
  // because it retries and then asserts for itself.
  const pending = (matches, ms) => {
    const already = payloads.find((payload) => matches(rowOf(payload), payload));
    if (already) return Promise.resolve(already);
    return new Promise((resolve) => {
      const finish = (value) => {
        clearTimeout(timer);
        waiters.delete(waiter);
        resolve(value);
      };
      const waiter = (payload) => {
        if (matches(rowOf(payload), payload)) finish(payload);
      };
      const timer = setTimeout(() => finish(null), ms);
      waiters.add(waiter);
    });
  };
  return {
    label,
    channel,
    payloads,
    errors,
    subscribed,
    rows: () => payloads.map(rowOf),
    // The wait every marker and every fence uses. An expired deadline
    // **throws**: a wait that ran out is a failure, never evidence that
    // nothing was delivered, and a caller that ignored the return value would
    // otherwise go on to assert something about silence.
    async waitFor(matches, what = "a matching change") {
      const seen = await pending(matches, REALTIME_DEADLINE_MS);
      if (!seen)
        throw new Error(
          `${label} (watching ${watching}) never received ${what} within ${REALTIME_DEADLINE_MS}ms`,
        );
      return seen;
    },
    // The retrying warm-up's shorter, non-throwing attempt.
    pollFor: pending,
    stop() {
      if (stopped) return;
      stopped = true;
      client.removeChannel(channel);
    },
  };
}

// Commit a change and wait for it, repeating until one arrives or the deadline
// passes. An expired deadline fails the test: this is the positive control
// that makes every later silence meaningful.
//
// Realtime stops a tenant's Postgres Changes streaming when nothing is
// subscribed to it, so on an idle stack the very first committed change can
// fall into the window between SUBSCRIBED and streaming restarting.
// `matcherFor(change)` builds the predicate that recognises exactly that one
// change — by id *and* by its unique mark, because two changes to the same row
// share an id and a fence that matched an earlier one would prove nothing.
async function controlUntilSeen(watch, commit, matcherFor, label) {
  const produced = [];
  const deadline = Date.now() + REALTIME_DEADLINE_MS;
  let seen = null;
  do {
    const change = await commit();
    produced.push(change);
    seen = await watch.pollFor(
      matcherFor(change),
      Math.max(500, Math.min(CONTROL_ATTEMPT_MS, deadline - Date.now())),
    );
  } while (!seen && Date.now() < deadline);
  assert.ok(seen, `${label} never arrived within ${REALTIME_DEADLINE_MS}ms`);
  return { seen, produced };
}

const assertHealthy = (...watches) => {
  for (const watch of watches)
    assert.deepEqual(watch.errors, [], `${watch.label} channel errors`);
};

// ---------------------------------------------------------------------------
// Building the records the matrix commits against
// ---------------------------------------------------------------------------

async function preparedCase(f, client) {
  const created = await f.createCase(client, crypto.randomUUID(), {
    answers: makeSampleAnswers(),
  });
  await f.act(client, created.caseId, null, "SUBMIT", { confirmed: true });
  await f.act(f.presenter, created.caseId, f.sam, "VERIFY_INTAKE", {
    checks: f.intakeChecks,
  });
  await f.act(f.presenter, created.caseId, f.alex, "CLAIM_PREPARATION", {});
  return created.caseId;
}

// One open document request on this owner's prepared case, carrying a marker
// in the message the client is allowed to read.
async function openRequest(f, owner) {
  const text = marker();
  await f.act(f.presenter, owner.caseId, f.alex, "REQUEST_DOCUMENT", {
    title: "Mileage record",
    message: text,
  });
  const [row] = (
    await f.sql(
      "select id from public.document_requests where case_id=$1 and message=$2",
      [owner.caseId, text],
    )
  ).rows;
  return { id: row.id, marker: text };
}

async function respondTo(f, owner, requestId) {
  await f.act(owner.client, owner.caseId, null, "RESPOND_DOCUMENT", {
    requestId,
    filename: f.sampleFilename,
  });
  const [row] = (
    await f.sql(
      "select id from public.documents where request_id=$1 order by created_at desc limit 1",
      [requestId],
    )
  ).rows;
  return row.id;
}

// The matrix: every owner-scoped table a client may read, for both published
// event types. `commit` produces one change owned by the given applicant and
// returns what identifies it; `identity` reads that same value back out of a
// payload row, and `markerOf` reads the human-readable mark the change wrote.
//
// `documents` and `client_events` are append-only in this workflow — no action
// updates either — so their UPDATE rows are written through the privileged
// test connection. That is a test-only write, and it is the only way to prove
// the isolation of an event type the publication really does carry.
const MATRIX = Object.freeze([
  {
    table: "cases",
    event: "INSERT",
    identity: (row) => row.id,
    markerOf: (row) => row.answers?.city,
    commit: async (f, owner) => {
      const text = marker();
      const created = await f.createCase(owner.client, crypto.randomUUID(), {
        answers: { ...makeSampleAnswers(), city: text },
      });
      return { id: created.caseId, marker: text };
    },
  },
  {
    table: "cases",
    event: "UPDATE",
    identity: (row) => row.id,
    markerOf: (row) => row.answers?.city,
    commit: async (f, owner) => {
      const text = marker();
      const receipt = await f.act(owner.client, owner.draftId, null, "SAVE_ANSWERS", {
        answers: { city: text },
      });
      return { id: owner.draftId, marker: text, revision: receipt.revision };
    },
  },
  {
    table: "document_requests",
    event: "INSERT",
    identity: (row) => row.id,
    markerOf: (row) => row.message,
    commit: (f, owner) => openRequest(f, owner),
  },
  {
    table: "document_requests",
    event: "UPDATE",
    identity: (row) => row.id,
    markerOf: (row) => row.message,
    commit: async (f, owner) => {
      const request = await openRequest(f, owner);
      await respondTo(f, owner, request.id);
      return request;
    },
  },
  {
    table: "documents",
    event: "INSERT",
    identity: (row) => row.id,
    markerOf: (row) => row.id,
    commit: async (f, owner) => {
      const request = await openRequest(f, owner);
      const id = await respondTo(f, owner, request.id);
      return { id, marker: id };
    },
  },
  {
    table: "documents",
    event: "UPDATE",
    identity: (row) => row.id,
    markerOf: (row) => row.filename,
    commit: async (f, owner) => {
      const request = await openRequest(f, owner);
      const id = await respondTo(f, owner, request.id);
      const text = `demo-mileage-record-2025-${crypto.randomUUID()}.pdf`;
      await f.sql("update public.documents set filename=$1 where id=$2", [text, id]);
      return { id, marker: text };
    },
  },
  {
    table: "client_events",
    event: "INSERT",
    identity: (row) => row.id,
    markerOf: (row) => row.message,
    commit: async (f, owner) => {
      const text = marker();
      await f.act(f.presenter, owner.caseId, f.alex, "REQUEST_DOCUMENT", {
        title: text,
        message: "Please add the fictional sample.",
      });
      const [row] = (
        await f.sql(
          "select id,message from public.client_events where case_id=$1 and message like $2",
          [owner.caseId, `%${text}%`],
        )
      ).rows;
      // The mark the client actually reads is the whole sentence the request
      // produced; the generated title is what makes it unique.
      return { id: row.id, marker: row.message };
    },
  },
  {
    table: "client_events",
    event: "UPDATE",
    identity: (row) => row.id,
    markerOf: (row) => row.message,
    commit: async (f, owner) => {
      const text = `Simulated progress note ${crypto.randomUUID()}`;
      const [row] = (
        await f.sql(
          "select id from public.client_events where case_id=$1 order by created_at limit 1",
          [owner.caseId],
        )
      ).rows;
      await f.sql("update public.client_events set message=$1 where id=$2", [
        text,
        row.id,
      ]);
      return { id: row.id, marker: text };
    },
  },
]);

// The staff-only tables. An applicant may not read a single row of any of
// them, so a subscription of theirs must stay empty while a presenter's
// receives the same change — and while the applicant's *other* channel, on a
// table they may read, keeps delivering.
const INTERNAL = Object.freeze([
  {
    table: "case_events",
    identity: (row) => row.id,
    commit: async (f, owner) => {
      await f.act(f.presenter, owner.caseId, f.alex, "REQUEST_DOCUMENT", {
        title: "Mileage record",
        message: marker(),
      });
      const [row] = (
        await f.sql(
          "select id from public.case_events where case_id=$1 order by created_at desc,id desc limit 1",
          [owner.caseId],
        )
      ).rows;
      return { id: row.id };
    },
  },
  {
    table: "preparation_participants",
    identity: (row) => `${row.case_id}:${row.person_id}`,
    commit: async (f) => {
      const caseId = await f.readyCase();
      await f.act(f.presenter, caseId, f.alex, "CLAIM_PREPARATION", {});
      return { id: `${caseId}:${f.alex}` };
    },
  },
  {
    table: "admin_followups",
    identity: (row) => row.id,
    commit: async (f, owner) => {
      const caseId = await preparedCase(f, owner.client);
      const request = await openRequest(f, { ...owner, caseId });
      await f.act(f.presenter, caseId, f.alex, "ESCALATE_CONTACT", {
        requestId: request.id,
        reason: "No response to the document request.",
      });
      const [row] = (
        await f.sql("select id from public.admin_followups where request_id=$1", [
          request.id,
        ])
      ).rows;
      return { id: row.id, followupId: row.id, caseId };
    },
  },
  {
    table: "contact_attempts",
    identity: (row) => row.id,
    commit: async (f, owner) => {
      const caseId = await preparedCase(f, owner.client);
      const request = await openRequest(f, { ...owner, caseId });
      await f.act(f.presenter, caseId, f.alex, "ESCALATE_CONTACT", {
        requestId: request.id,
        reason: "No response to the document request.",
      });
      const [followup] = (
        await f.sql("select id from public.admin_followups where request_id=$1", [
          request.id,
        ])
      ).rows;
      await f.act(f.presenter, caseId, f.sam, "RECORD_CONTACT", {
        followupId: followup.id,
        outcome: "no_answer",
        note: "Called during office hours. No answer.",
      });
      const [row] = (
        await f.sql("select id from public.contact_attempts where followup_id=$1", [
          followup.id,
        ])
      ).rows;
      return { id: row.id };
    },
  },
  {
    table: "reviews",
    identity: (row) => row.id,
    commit: async (f) => {
      const caseId = await f.preparedCase();
      await f.act(f.presenter, caseId, f.morgan, "CLAIM_REVIEW", {});
      const [row] = (
        await f.sql("select id from public.reviews where case_id=$1", [caseId])
      ).rows;
      return { id: row.id };
    },
  },
]);

// ---------------------------------------------------------------------------

test("Realtime carries one applicant's rows to that applicant only", async (t) => {
  const f = await createDatabaseFixture();
  // One channel held open for the whole file so the tenant keeps streaming
  // between checks; it is a presenter's, so it proves nothing about isolation
  // and is never read for evidence.
  let keepalive = null;
  try {
    const owners = {};
    for (const [name, client, userId] of [
      ["A", f.applicantA, f.applicantAUserId],
      ["B", f.applicantB, f.applicantBUserId],
    ]) {
      const draft = await f.createCase(client, crypto.randomUUID(), {
        answers: makeSampleAnswers(),
      });
      owners[name] = {
        name,
        client,
        userId,
        draftId: draft.caseId,
        caseId: await preparedCase(f, client),
      };
    }
    keepalive = watchTable(f.presenter, [{ event: "UPDATE", table: "cases" }], "keepalive");
    await withDeadline(keepalive.subscribed, "the keepalive channel never subscribed");
    // One repeatable change with a revision on it, so each attempt is its own.
    const saveFor = async (owner) => {
      const receipt = await f.act(owner.client, owner.draftId, null, "SAVE_ANSWERS", {
        answers: { city: marker() },
      });
      return { id: receipt.caseId, revision: receipt.revision };
    };
    const savedCase = (change) => (row) =>
      row.id === change.id && Number(row.revision) === change.revision;
    // A private client draft is invisible to staff by design, so the keepalive
    // control moves a case the presenter may actually read.
    const bumpStaffCase = async (owner) => {
      const receipt = await f.act(f.presenter, owner.caseId, f.alex, "REQUEST_DOCUMENT", {
        title: "Mileage record",
        message: marker(),
      });
      return { id: owner.caseId, revision: receipt.revision };
    };
    await controlUntilSeen(
      keepalive,
      () => bumpStaffCase(owners.B),
      savedCase,
      "the keepalive control",
    );

    for (const spec of MATRIX) {
      await t.test(
        `${spec.table} ${spec.event} reaches the owner and nobody else`,
        async () => {
          const bindings = [{ event: spec.event, table: spec.table }];
          const watchA = watchTable(f.applicantA, bindings, `A/${spec.table}`);
          const watchB = watchTable(f.applicantB, bindings, `B/${spec.table}`);
          try {
            await withDeadline(
              watchA.subscribed,
              `A never subscribed to ${spec.table}`,
            );
            await withDeadline(
              watchB.subscribed,
              `B never subscribed to ${spec.table}`,
            );
            // An accepted action writes the case row twice in one transaction —
            // the handler's own change, then `commit_action`'s revision — so a
            // `cases` payload is only the right one when its revision matches
            // the receipt too.
            const exactly = (change) => (row) =>
              spec.identity(row) === change.id &&
              spec.markerOf(row) === change.marker &&
              (change.revision === undefined ||
                Number(row.revision) === change.revision);
            // 2. The control: B's own change must reach B's channel.
            const control = await controlUntilSeen(
              watchB,
              () => spec.commit(f, owners.B),
              exactly,
              `B's ${spec.table} ${spec.event} control`,
            );
            assert.ok(
              control.produced.some((change) =>
                exactly(change)(control.seen.new ?? control.seen.old ?? {}),
              ),
              "the control that arrived is one B committed",
            );

            // 3. A's uniquely marked change must reach A's channel exactly.
            const mine = [];
            const marked = await controlUntilSeen(
              watchA,
              async () => {
                const change = await spec.commit(f, owners.A);
                mine.push(change);
                return change;
              },
              exactly,
              `A's ${spec.table} ${spec.event}`,
            );
            const row = marked.seen.new ?? {};
            const expected = mine.find((change) => exactly(change)(row));
            assert.ok(expected, `${spec.table} matched one of A's own changes`);
            assert.equal(marked.seen.eventType, spec.event, `${spec.table} event type`);
            assert.equal(spec.identity(row), expected.id, `${spec.table} id`);
            assert.equal(spec.markerOf(row), expected.marker, `${spec.table} marker`);
            if (expected.revision !== undefined)
              assert.equal(
                Number(row.revision),
                expected.revision,
                `${spec.table} revision`,
              );

            // 4. A later fence of B's, on B's same channel.
            const fence = await spec.commit(f, owners.B);
            const arrived = await watchB.waitFor(
              exactly(fence),
              `B's own ${spec.table} ${spec.event} fence`,
            );
            assert.ok(arrived, "the fence arrived");

            // 5. Through that fence, B was offered nothing of A's.
            const ids = new Set(mine.map((change) => change.id));
            const markers = new Set(mine.map((change) => change.marker));
            for (const seen of watchB.rows()) {
              assert.ok(
                !ids.has(spec.identity(seen)),
                `B received A's ${spec.table} id ${spec.identity(seen)}`,
              );
              assert.ok(
                !markers.has(spec.markerOf(seen)),
                `B received A's ${spec.table} marker`,
              );
            }
            // And A was offered nothing of B's either: isolation runs both ways.
            const theirs = new Set([
              ...control.produced.map((change) => change.id),
              fence.id,
            ]);
            for (const seen of watchA.rows())
              assert.ok(
                !theirs.has(spec.identity(seen)),
                `A received B's ${spec.table} id`,
              );
            assertHealthy(watchA, watchB, keepalive);
          } finally {
            watchA.stop();
            watchB.stop();
          }
        },
      );
    }

    await t.test("the production adapter draws the same line", async () => {
      // The same A/B scenario through `createStore().subscribe`, which is what
      // the browser actually runs: every table this principal may read, on one
      // channel, announced as identifiers only.
      const collected = { A: [], B: [] };
      const connections = { A: [], B: [] };
      const waiters = { A: new Set(), B: new Set() };
      const stops = [];
      const online = {};
      for (const name of ["A", "B"]) {
        let settle;
        online[name] = new Promise((resolve) => (settle = resolve));
        stops.push(
          createStore(owners[name].client).subscribe({
            onConnection: (state) => {
              connections[name].push(state);
              if (state === "online") settle(state);
            },
            onChange: (change) => {
              collected[name].push(change);
              for (const waiter of [...waiters[name]]) waiter(change);
            },
          }),
        );
      }
      // The adapter's own two shapes of the same wait, exactly as the raw
      // channels have them: a polling one for the retrying control, and a
      // throwing one for everything that must not proceed on silence.
      const pollChange = (name, matches, ms) => {
        const already = collected[name].find(matches);
        if (already) return Promise.resolve(already);
        return new Promise((resolve) => {
          const finish = (value) => {
            clearTimeout(timer);
            waiters[name].delete(waiter);
            resolve(value);
          };
          const waiter = (change) => {
            if (matches(change)) finish(change);
          };
          const timer = setTimeout(() => finish(null), ms);
          waiters[name].add(waiter);
        });
      };
      const awaitChange = async (name, matches, what) => {
        const seen = await pollChange(name, matches, REALTIME_DEADLINE_MS);
        if (!seen)
          throw new Error(
            `${name}'s adapter never received ${what} within ${REALTIME_DEADLINE_MS}ms`,
          );
        return seen;
      };
      try {
        await withDeadline(online.A, "A's adapter never came online");
        await withDeadline(online.B, "B's adapter never came online");
        // The adapter announces identifiers only, so a change is recognised by
        // its id and its table — which is precisely the browser's own view.
        const sameCase = (change) => (seen) =>
          seen.id === change.id && seen.table === "cases";
        const watcher = (name) => ({
          label: `${name} adapter`,
          pollFor: (matches, ms) => pollChange(name, matches, ms),
        });
        // Control, marked change, fence — the same three steps.
        const control = await controlUntilSeen(
          watcher("B"),
          () => saveFor(owners.B),
          sameCase,
          "B's adapter control",
        );
        assert.ok(control.seen);
        const mineIds = new Set();
        const marked = await controlUntilSeen(
          watcher("A"),
          async () => {
            const change = await saveFor(owners.A);
            mineIds.add(change.id);
            return change;
          },
          sameCase,
          "A's adapter change",
        );
        assert.deepEqual(
          { table: marked.seen.table, eventType: marked.seen.eventType },
          { table: "cases", eventType: "UPDATE" },
        );
        assert.equal(marked.seen.caseId, marked.seen.id);
        // A fresh case of B's makes the fence its own id, so it cannot be
        // satisfied by an event that arrived before A's change.
        const fence = await f.createCase(owners.B.client, crypto.randomUUID(), {
          answers: makeSampleAnswers(),
        });
        await awaitChange(
          "B",
          (change) => change.id === fence.caseId,
          "B's own fence, a case of their own",
        );
        for (const change of collected.B) {
          assert.ok(!mineIds.has(change.id), "B's adapter received A's id");
          assert.ok(!mineIds.has(change.caseId), "B's adapter received A's case");
        }
        // The adapter announces identifiers only: no row contents at all.
        for (const change of [...collected.A, ...collected.B])
          assert.deepEqual(
            Object.keys(change).toSorted(),
            ["caseId", "eventType", "id", "table"],
            "a change carries identifiers only",
          );
        // And the shared generation signal arrives as what it is: a workspace
        // row moved, with no case behind it. This is what tells the browser to
        // re-read its own lists after somebody resets the demonstration.
        await f.seedFixtures();
        const signal = await awaitChange(
          "A",
          (change) => change.table === "workspaces",
          "the shared generation signal",
        );
        assert.deepEqual(signal, {
          table: "workspaces",
          eventType: "UPDATE",
          id: f.workspaceId,
          caseId: null,
        });
      } finally {
        for (const stop of stops) stop();
      }
    });

    await t.test("the shared generation signal reaches every member", async () => {
      const bindings = [{ event: "UPDATE", table: "workspaces" }];
      const staff = watchTable(f.presenter, bindings, "presenter/workspaces");
      const client = watchTable(f.applicantA, bindings, "A/workspaces");
      try {
        await withDeadline(staff.subscribed, "the presenter never subscribed");
        await withDeadline(client.subscribed, "the applicant never subscribed");
        // A reset is the only thing that moves the generation, and it is
        // repeatable, so it is its own control.
        const control = await controlUntilSeen(
          staff,
          async () => {
            const receipt = await f.seedFixtures();
            return { id: f.workspaceId, generation: Number(receipt.generation) };
          },
          (change) => (row) =>
            row.id === change.id && Number(row.fixture_generation) === change.generation,
          "the generation signal",
        );
        const generation = control.produced.at(-1).generation;
        const onStaff = await staff.waitFor(
          (row) => Number(row.fixture_generation) === generation,
          `generation ${generation}`,
        );
        const onClient = await client.waitFor(
          (row) => Number(row.fixture_generation) === generation,
          `generation ${generation}`,
        );
        // Both members get the same row, and the row says nothing private: a
        // workspace id, the default follow-up person, and a number.
        for (const seen of [onStaff, onClient]) {
          assert.equal(seen.eventType, "UPDATE");
          assert.deepEqual(Object.keys(seen.new).toSorted(), [
            "default_followup_person_id",
            "fixture_generation",
            "id",
          ]);
          assert.equal(seen.new.id, f.workspaceId);
          assert.equal(Number(seen.new.fixture_generation), generation);
        }
        // No case id or case content travels with it, on either channel.
        const fixtures = new Set((await f.readFixtureCases()).map((row) => row.id));
        for (const seen of [...staff.rows(), ...client.rows()]) {
          assert.ok(!fixtures.has(seen.id), "a case id travelled with the signal");
          assert.equal(seen.answers, undefined);
          assert.equal(seen.reference, undefined);
        }
        assertHealthy(staff, client);
      } finally {
        staff.stop();
        client.stop();
      }
    });

    for (const spec of INTERNAL) {
      await t.test(`${spec.table} reaches staff and no client at all`, async () => {
        const bindings = [{ event: "INSERT", table: spec.table }];
        const staff = watchTable(f.presenter, bindings, `presenter/${spec.table}`);
        const denied = watchTable(f.applicantA, bindings, `A/${spec.table}`);
        // A's fence runs on a table A really can see, so "nothing arrived" is
        // never confused with "this channel was not delivering".
        const fence = watchTable(
          f.applicantA,
          [{ event: "UPDATE", table: "cases" }],
          `A/fence`,
        );
        try {
          await withDeadline(staff.subscribed, `staff never subscribed to ${spec.table}`);
          await withDeadline(denied.subscribed, `A never subscribed to ${spec.table}`);
          await withDeadline(fence.subscribed, "A never subscribed to the fence");
          // The positive control: the presenter receives the internal row, and
          // it is written on a case the applicant owns, so what keeps it from
          // them is the table and not the case.
          await controlUntilSeen(
            staff,
            () => spec.commit(f, owners.A),
            (change) => (row) => spec.identity(row) === change.id,
            `the presenter's ${spec.table} control`,
          );
          // An ordered fence afterwards, on A's own readable table.
          const moved = await saveFor(owners.A);
          await fence.waitFor(
            savedCase(moved),
            `A's own ordered fence after the ${spec.table} change`,
          );
          assert.deepEqual(
            denied.payloads,
            [],
            `an applicant received ${spec.table} rows`,
          );
          assertHealthy(staff, denied, fence);
        } finally {
          staff.stop();
          denied.stop();
          fence.stop();
        }
      });
    }

    await t.test("a reset publishes no deletion an applicant could read", async () => {
      // The publication carries INSERT and UPDATE only (migration 007). A
      // deleted row cannot be authorized through the row-level security state
      // it no longer has, so it is never offered to anybody — which this asks
      // directly, from a channel that requested deletions.
      const publication = (
        await f.sql(
          "select pubinsert,pubupdate,pubdelete,pubtruncate from pg_publication where pubname='supabase_realtime'",
        )
      ).rows;
      assert.deepEqual(publication, [
        { pubinsert: true, pubupdate: true, pubdelete: false, pubtruncate: false },
      ]);
      await f.seedFixtures();
      // One channel, two bindings: the deletions this test is asking about,
      // and the updates that prove the channel kept delivering.
      const watch = watchTable(
        f.applicantA,
        [
          { event: "DELETE", table: "cases" },
          { event: "UPDATE", table: "cases" },
        ],
        "A/cases delete",
      );
      try {
        await withDeadline(watch.subscribed, "A never subscribed for deletions");
        // Control first: this channel is delivering before the reset runs.
        const before = await controlUntilSeen(
          watch,
          () => saveFor(owners.A),
          savedCase,
          "A's pre-reset control",
        );
        assert.ok(before.seen);
        // Everything from here on was committed after the channel was proved
        // to be delivering, so what it carries is this reset's own traffic.
        const from = watch.payloads.length;
        const doomed = new Set((await f.readFixtureCases()).map((row) => row.id));
        const bound = (await f.readFixtureCases()).find(
          (row) => row.fixtureKey === f.boundFixtureKey,
        );
        assert.equal(
          bound.ownerUserId,
          f.applicantAUserId,
          "A owns one of the doomed rows",
        );
        // Another presenter resets the fixtures, deleting the case A owns.
        await f.seedFixtures();
        // Two ordered fences afterwards: the channel has been offered
        // everything committed before them, the deletion included.
        for (const attempt of [1, 2]) {
          const fence = await saveFor(owners.A);
          await watch.waitFor(
            savedCase(fence),
            `A's post-reset ordered fence ${attempt}`,
          );
        }
        const deletions = watch.payloads.filter(
          (payload) => payload.eventType === "DELETE",
        );
        assert.deepEqual(deletions, [], "a deletion was published");
        for (const payload of watch.payloads.slice(from)) {
          const row = payload.new ?? payload.old ?? {};
          assert.ok(
            !doomed.has(row.id),
            `a deleted case id reached the client: ${row.id}`,
          );
        }
        assertHealthy(watch);
      } finally {
        watch.stop();
      }
    });
  } finally {
    keepalive?.stop();
    await f.close();
  }
});
