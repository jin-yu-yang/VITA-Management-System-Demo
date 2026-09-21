import test from "node:test";
import assert from "node:assert/strict";
import { createDatabaseFixture, rejected } from "./support/database-fixture.mjs";
import { createStore, SUBSCRIBED_TABLES } from "../src/supabase-store.mjs";
import { REFERENCE_PATTERN } from "../src/contracts.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";

// The staff sections an applicant's Case must not even carry as keys.
const STAFF_SECTIONS = ["participants", "followups", "reviews", "internalHistory"];
// How long Realtime gets to connect and to deliver one change. A timeout is a
// failure: silence must never read as success.
const REALTIME_DEADLINE_MS = 15_000;

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

// A thin delegate around a real supabase-js client that records channel
// removal, so cleanup can be asserted against the live client rather than a
// double.
function watchChannels(client) {
  const removed = [];
  return {
    removed,
    live: client,
    auth: client.auth,
    from: (table) => client.from(table),
    rpc: (name, args) => client.rpc(name, args),
    channel: (name) => client.channel(name),
    removeChannel: (channel) => {
      removed.push(channel);
      return client.removeChannel(channel);
    },
  };
}

// One deferred promise that a handler can settle.
function pending() {
  let settle;
  const promise = new Promise((resolve) => (settle = resolve));
  return { promise, settle };
}

test("the browser adapter reads, acts and subscribes against real Supabase", async (t) => {
  const f = await createDatabaseFixture();
  try {
    const applicant = createStore(f.applicantA);
    const presenter = createStore(f.presenter);

    // A private draft of applicant A, and one case carried far enough to have
    // a request, a document and client-visible progress.
    const draft = await f.createCase(f.applicantA, crypto.randomUUID(), {
      answers: makeSampleAnswers(),
    });
    const caseId = await f.readyCase();
    await f.act(f.presenter, caseId, f.alex, "CLAIM_PREPARATION", {});
    await f.act(
      f.presenter,
      caseId,
      f.alex,
      "REQUEST_DOCUMENT",
      f.sampleRequest,
    );
    await f.act(f.applicantA, caseId, null, "RESPOND_DOCUMENT", {
      filename: f.sampleFilename,
    });
    const other = await f.createCase(f.applicantB, crypto.randomUUID(), {
      answers: makeSampleAnswers(),
    });
    await f.act(f.applicantB, other.caseId, null, "SUBMIT", { confirmed: true });

    await t.test("the principal is the caller's own membership", async () => {
      assert.deepEqual(await applicant.getPrincipal(), {
        userId: f.applicantAUserId,
        workspaceId: f.workspaceId,
        access: "applicant",
        email: (await f.applicantA.auth.getUser()).data.user.email,
      });
      const staff = await presenter.getPrincipal();
      assert.equal(staff.access, "presenter");
      assert.equal(staff.workspaceId, f.workspaceId);
      assert.equal(staff.userId, f.presenterUserId);
    });

    await t.test("an account with no membership is refused", async () => {
      await assert.rejects(
        () => createStore(f.unapproved).getPrincipal(),
        rejected("FORBIDDEN"),
      );
    });

    await t.test("case lists stay inside what RLS allows", async () => {
      const mine = await applicant.listCases();
      const ids = mine.map((row) => row.id);
      assert.ok(ids.includes(draft.caseId));
      assert.ok(ids.includes(caseId));
      assert.ok(!ids.includes(other.caseId), "another applicant's case is absent");
      assert.ok(
        mine.every((row) => row.ownerUserId === f.applicantAUserId),
        "every listed case is the caller's own",
      );
      // Rows carry the Case scalars and no related sections.
      for (const section of [...STAFF_SECTIONS, "requests", "documents", "history"])
        assert.ok(!(section in mine[0]), section);

      const staffIds = (await presenter.listCases()).map((row) => row.id);
      assert.ok(staffIds.includes(caseId));
      assert.ok(staffIds.includes(other.caseId));
      assert.ok(
        !staffIds.includes(draft.caseId),
        "a client's private draft is not a staff case",
      );
    });

    await t.test("an applicant case read loads no staff section", async () => {
      const found = await applicant.getCase(caseId);
      assert.equal(found.id, caseId);
      assert.match(found.reference, REFERENCE_PATTERN);
      assert.equal(found.requests.length, 1);
      assert.equal(found.requests[0].title, f.sampleRequest.title);
      assert.equal(found.documents.length, 1);
      assert.equal(found.documents[0].filename, f.sampleFilename);
      assert.ok(found.history.length >= 2, "client-visible progress is there");
      for (const section of STAFF_SECTIONS)
        assert.ok(!(section in found), `${section} is absent, not empty`);
    });

    await t.test("a presenter case read adds the staff sections", async () => {
      const staff = await presenter.getCase(caseId);
      for (const section of STAFF_SECTIONS)
        assert.ok(section in staff, section);
      assert.deepEqual(staff.participants, [f.alex]);
      assert.deepEqual(staff.reviews, []);
      assert.deepEqual(staff.followups, []);
      assert.ok(staff.internalHistory.length >= 4, "internal history is there");
      assert.equal(staff.preparerId, f.alex);
      // The one mapping: the fixture helper is this same read.
      assert.deepEqual(await f.readStaffCase(caseId), staff);
    });

    await t.test("another applicant's case and a stranger id are NOT_FOUND", async () => {
      for (const id of [other.caseId, crypto.randomUUID()])
        await assert.rejects(() => applicant.getCase(id), rejected("NOT_FOUND"));
    });

    await t.test("createCase returns a receipt with a readable reference", async () => {
      const receipt = await applicant.createCase({
        actionId: crypto.randomUUID(),
        mode: "client",
        personId: null,
        answers: makeSampleAnswers(),
      });
      assert.deepEqual(Object.keys(receipt).toSorted(), [
        "actionId",
        "caseId",
        "reference",
        "revision",
      ]);
      assert.match(receipt.reference, REFERENCE_PATTERN);
      assert.equal(receipt.revision, 1);
    });

    await t.test("an action returns a receipt and a stale revision CONFLICTs", async () => {
      const before = await applicant.getCase(draft.caseId);
      const receipt = await applicant.act({
        actionId: crypto.randomUUID(),
        caseId: draft.caseId,
        expectedRevision: before.revision,
        personId: null,
        type: "SAVE_ANSWERS",
        payload: { answers: { city: "Philadelphia" } },
      });
      assert.equal(receipt.caseId, draft.caseId);
      assert.equal(receipt.revision, before.revision + 1);
      await assert.rejects(
        () =>
          applicant.act({
            actionId: crypto.randomUUID(),
            caseId: draft.caseId,
            expectedRevision: before.revision,
            personId: null,
            type: "SAVE_ANSWERS",
            payload: { answers: { city: "Camden" } },
          }),
        rejected("CONFLICT"),
      );
    });

    await t.test("a client who forges a staff person is refused", async () => {
      const current = await applicant.getCase(draft.caseId);
      await assert.rejects(
        () =>
          applicant.act({
            actionId: crypto.randomUUID(),
            caseId: draft.caseId,
            expectedRevision: current.revision,
            personId: f.sam,
            type: "SAVE_ANSWERS",
            payload: { answers: { city: "Philadelphia" } },
          }),
        rejected("FORBIDDEN"),
      );
    });

    await t.test("assistance is a presenter list and a presenter action", async () => {
      const { itemId } = await f.seedAssistance();
      const items = await presenter.listAssistance();
      const item = items.find((row) => row.id === itemId);
      assert.ok(item, "the seeded request is listed");
      assert.equal(item.status, "open");
      assert.equal(item.revision, 1);
      assert.equal(item.language, f.sampleAssistance.language);
      // The adapter checks access before reading, so an applicant is told no
      // rather than handed an empty list that looks like an empty workspace.
      await assert.rejects(
        () => applicant.listAssistance(),
        rejected("FORBIDDEN"),
      );
      await assert.rejects(() => applicant.listPeople(), rejected("FORBIDDEN"));
      assert.ok(
        (await presenter.listPeople()).some((person) => person.id === f.alex),
      );

      await presenter.actAssistance({
        actionId: crypto.randomUUID(),
        itemId,
        expectedRevision: 1,
        personId: f.sam,
        type: "CLAIM",
        note: null,
      });
      const claimed = await f.readStaffAssistance(itemId);
      assert.equal(claimed.revision, 2);
      assert.equal(claimed.status, "assigned");
      assert.equal(claimed.assigneeId, f.sam);
    });

    await t.test("the Task 9 RPCs are called and answer SERVER_ERROR today", async () => {
      // Both functions arrive with fixture reset and checkpoints. Until then
      // PostgREST cannot find them, and the shared mapper reports the generic
      // server failure. Task 9 flips this test.
      await assert.rejects(
        () => presenter.resetFixtures({ actionId: crypto.randomUUID() }),
        rejected("SERVER_ERROR"),
      );
      await assert.rejects(
        () =>
          presenter.loadCheckpoint({
            actionId: crypto.randomUUID(),
            caseId,
            expectedRevision: 1,
            checkpoint: "review_ready",
          }),
        rejected("SERVER_ERROR"),
      );
    });

    await t.test("the Realtime publication is exactly what the adapter watches", async () => {
      // Migration 007 owns the published list; `SUBSCRIBED_TABLES` splits it by
      // access. Asserting they are the same set keeps them from drifting: an
      // unpublished table in a channel's set silently drops that channel's
      // whole subscription, while Realtime still answers SUBSCRIBED.
      const publication = (
        await f.sql(
          "select pubinsert, pubupdate, pubdelete, pubtruncate from pg_publication where pubname='supabase_realtime'",
        )
      ).rows;
      assert.equal(publication.length, 1, "the supabase_realtime publication exists");
      // Never DELETE: a removed row cannot be authorized through the RLS state
      // it no longer has (spec section 7).
      assert.deepEqual(publication[0], {
        pubinsert: true,
        pubupdate: true,
        pubdelete: false,
        pubtruncate: false,
      });
      const published = (
        await f.sql(
          "select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' order by tablename",
        )
      ).rows.map((row) => row.tablename);
      assert.deepEqual(published, [...SUBSCRIBED_TABLES.presenter].toSorted());
      // Receipts and the private schema are never published.
      assert.ok(!published.includes("action_receipts"));
    });

    await t.test("a subscription connects, announces a change and is removed", async () => {
      const watched = watchChannels(f.applicantA);
      const online = pending();
      const announced = pending();
      const states = [];
      const changes = [];
      const stop = createStore(watched).subscribe({
        onConnection: (state) => {
          states.push(state);
          if (state === "online") online.settle(state);
        },
        onChange: (change) => {
          changes.push(change);
          if (change.table === "cases" && change.id === draft.caseId)
            announced.settle(change);
        },
      });
      try {
        await withDeadline(online.promise, "the channel never came online");
        assert.equal(states[0], "online");
        // An action the applicant may take on their own case, which updates
        // the `cases` row and so must reach their own subscription.
        const save = () =>
          f.act(f.applicantA, draft.caseId, null, "SAVE_ANSWERS", {
            answers: { city: "Philadelphia" },
          });
        // Realtime stops a tenant's Postgres Changes streaming once nothing is
        // subscribed, and drops the tenant entirely once nobody is connected.
        // On an idle stack the very first change can therefore fall into the
        // window between SUBSCRIBED and streaming restarting, so the action is
        // repeated until a change arrives. The deadline still fails the test —
        // silence is never a pass — and a refused action still throws.
        let change = null;
        announced.promise.then((value) => (change = value));
        const deadline = Date.now() + REALTIME_DEADLINE_MS;
        await save();
        while (!change && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (!change && Date.now() < deadline) await save();
        }
        assert.ok(
          change,
          `no change for the applicant's own case arrived within ${REALTIME_DEADLINE_MS}ms`,
        );
        assert.deepEqual(change, {
          table: "cases",
          eventType: "UPDATE",
          id: draft.caseId,
          caseId: draft.caseId,
        });
      } finally {
        stop();
      }
      assert.equal(watched.removed.length, 1, "the channel is removed once");
      assert.deepEqual(f.applicantA.getChannels(), []);
    });
  } finally {
    await f.close();
  }
});
