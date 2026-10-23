import test from "node:test";
import assert from "node:assert/strict";
import { createDatabaseFixture, rejected } from "./support/database-fixture.mjs";

// Migration 036: Waiting for documents and Hold (the stage check, the origin
// columns) and the office's documents at intake.

test("documents at intake against real Supabase", async (t) => {
  const f = await createDatabaseFixture();
  try {
    const asSam = (caseId, type, payload = {}) => f.act(f.presenter, caseId, f.sam, type, payload);
    const columns = async (caseId) =>
      (
        await f.sql(
          "select stage, documents_origin, hold_origin, closing_reason from public.cases where id=$1",
          [caseId],
        )
      ).rows[0];
    const requests = async (caseId) =>
      (
        await f.sql(
          "select id, title, status, requested_by_person_id from public.document_requests where case_id=$1 order by created_at, title",
          [caseId],
        )
      ).rows;
    const atScreening = async () => {
      const { caseId } = await f.submittedClientCase();
      await asSam(caseId, "START_SCREENING");
      return caseId;
    };
    const ask = (caseId, titles, who = [f.presenter, f.sam]) =>
      f.act(
        who[0],
        caseId,
        who[1],
        "REQUEST_DOCUMENTS_AT_INTAKE",
        { requests: titles.map((title) => ({ title, message: "A fictional note." })) },
      );
    const answer = (caseId, requestId) =>
      f.act(f.applicantA, caseId, null, "RESPOND_DOCUMENT", { requestId, filename: f.sampleFilename });

    await t.test("the stage check and origin constraints", async () => {
      const { caseId } = await f.submittedClientCase();
      const set = (sql) => f.sql(`update public.cases set ${sql} where id=$1`, [caseId]);
      await set("stage='awaiting_documents', documents_origin='screening'");
      await assert.rejects(() => set("stage='awaiting_documents', documents_origin=null"));
      await assert.rejects(() => set("stage='on_hold', hold_origin=null, documents_origin=null"));
      await assert.rejects(() => set("stage='screening', documents_origin='screening'"));
      await assert.rejects(() => set("stage='screening', closing_reason='duplicate'"));
      await set("stage='on_hold', hold_origin='awaiting_documents', documents_origin='screening'");
      await set("stage='on_hold', hold_origin='review_approved', documents_origin=null");
      await assert.rejects(() => set("stage='on_hold', hold_origin='review_approved', documents_origin='screening'"));
      await set("stage='closed', hold_origin=null, documents_origin=null, closing_reason='duplicate'");
      await assert.rejects(() => set("closing_reason='nonsense'"));
    });

    await t.test("asking for documents at screening", async () => {
      const caseId = await atScreening();
      await ask(caseId, ["Photo ID"]);
      assert.deepEqual(await columns(caseId), {
        stage: "awaiting_documents",
        documents_origin: "screening",
        hold_origin: null,
        closing_reason: null,
      });
      const rows = await requests(caseId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, "open");
      assert.equal(rows[0].requested_by_person_id, f.sam);
      assert.ok((await f.clientMessages(caseId)).includes("PCDC asked for these documents: Photo ID."));
    });

    await t.test("asking from pending intake and with two titles in one move", async () => {
      const caseId = await f.readyCase();
      assert.equal((await columns(caseId)).stage, "preparation_ready");
      const before = (await f.clientMessages(caseId)).length;
      await ask(caseId, ["W-2", "Photo ID"]);
      assert.equal((await columns(caseId)).documents_origin, "preparation_ready");
      assert.equal((await requests(caseId)).length, 2);
      const lines = (await f.clientMessages(caseId)).slice(before);
      assert.deepEqual(lines, ["PCDC asked for these documents: W-2, Photo ID."]);
      const events = await f.sql(
        "select detail from public.case_events where case_id=$1 and action='REQUEST_DOCUMENTS_AT_INTAKE'",
        [caseId],
      );
      assert.equal(events.rows.length, 1);
      assert.equal(events.rows[0].detail.requestIds.length, 2);
      // A later move adds a request and a line, and the stage stays.
      await ask(caseId, ["Prior-year return"]);
      assert.equal((await columns(caseId)).stage, "awaiting_documents");
      assert.equal((await columns(caseId)).documents_origin, "preparation_ready");
      assert.equal((await requests(caseId)).length, 3);
    });

    await t.test("refusals", async () => {
      const caseId = await atScreening();
      for (const [who, code] of [
        [[f.presenter, f.alex], "FORBIDDEN"],
        [[f.presenter, f.morgan], "FORBIDDEN"],
        [[f.presenter, null], "FORBIDDEN"],
        [[f.applicantA, null], "FORBIDDEN"],
      ])
        await assert.rejects(() => ask(caseId, ["Photo ID"], who), rejected(code));
      const valid = { title: "Photo ID", message: "A fictional note." };
      for (const requests of [
        [],
        Array.from({ length: 6 }, (_, i) => ({ ...valid, title: `Doc ${i}` })),
        [{ ...valid, title: "  " }],
        [{ ...valid, extra: "x" }],
      ])
        await assert.rejects(
          () => asSam(caseId, "REQUEST_DOCUMENTS_AT_INTAKE", { requests }),
          rejected("VALIDATION"),
        );
      await assert.rejects(
        () => asSam(caseId, "REQUEST_DOCUMENTS_AT_INTAKE", { requests: [valid], extra: 1 }),
        rejected("VALIDATION"),
      );
      assert.equal((await columns(caseId)).stage, "screening");
      assert.equal((await requests(caseId)).length, 0);
      const preparing = await f.assistedCase();
      assert.equal((await columns(preparing)).stage, "preparing");
      await assert.rejects(() => ask(preparing, ["Photo ID"]), rejected("INVALID_TRANSITION"));
    });

    await t.test("the client answers and the office verifies", async () => {
      const caseId = await atScreening();
      await ask(caseId, ["Photo ID"]);
      const [request] = await requests(caseId);
      await answer(caseId, request.id);
      assert.equal((await requests(caseId))[0].status, "awaiting_verification");
      await assert.rejects(
        () => f.act(f.presenter, caseId, f.alex, "VERIFY_DOCUMENT", { requestId: request.id }),
        rejected("FORBIDDEN"),
      );
      await asSam(caseId, "VERIFY_DOCUMENT", { requestId: request.id });
      assert.deepEqual(await columns(caseId), {
        stage: "screening",
        documents_origin: null,
        hold_origin: null,
        closing_reason: null,
      });
      const lines = await f.clientMessages(caseId);
      assert.equal(lines.at(-1), "PCDC is working on your application again.");
      assert.equal(lines.at(-2), "A volunteer verified your document. No further action is needed for this request.");
    });

    await t.test("a second request keeps it waiting", async () => {
      const caseId = await atScreening();
      await ask(caseId, ["Photo ID"]);
      await ask(caseId, ["W-2"]);
      const rows = await requests(caseId);
      const first = rows.find((r) => r.title === "Photo ID");
      await answer(caseId, first.id);
      await asSam(caseId, "VERIFY_DOCUMENT", { requestId: first.id });
      assert.equal((await columns(caseId)).stage, "awaiting_documents");
      assert.equal((await f.clientMessages(caseId)).includes("PCDC is working on your application again."), false);
    });

    await t.test("the preparer's loop is unchanged", async () => {
      const caseId = await f.assistedCase();
      assert.equal((await columns(caseId)).stage, "preparing");
      await f.act(f.presenter, caseId, f.alex, "REQUEST_DOCUMENT", {
        title: "Second fictional document",
        message: "A fictional note.",
      });
      assert.equal((await columns(caseId)).stage, "preparing");
    });

    const hold = (caseId, payload = { confirmed: true }, who = [f.presenter, f.sam]) =>
      f.act(who[0], caseId, who[1], "PUT_ON_HOLD", payload);
    const resume = (caseId, payload = { confirmed: true }, who = [f.presenter, f.sam]) =>
      f.act(who[0], caseId, who[1], "RESUME_FROM_HOLD", payload);
    const waitingCase = async (titles = ["Photo ID"]) => {
      const caseId = await atScreening();
      await ask(caseId, titles);
      return caseId;
    };

    await t.test("a documents hold", async () => {
      const caseId = await waitingCase();
      const before = (await f.clientMessages(caseId)).length;
      await hold(caseId);
      assert.deepEqual(await columns(caseId), {
        stage: "on_hold",
        documents_origin: "screening",
        hold_origin: "awaiting_documents",
        closing_reason: null,
      });
      assert.deepEqual((await f.clientMessages(caseId)).slice(before), ["PCDC is trying to reach you."]);
      await resume(caseId);
      assert.deepEqual(await columns(caseId), {
        stage: "awaiting_documents",
        documents_origin: "screening",
        hold_origin: null,
        closing_reason: null,
      });
      assert.equal((await f.clientMessages(caseId)).at(-1), "PCDC is working on your application again.");
    });

    await t.test("the upload ends the hold", async () => {
      const caseId = await waitingCase();
      await hold(caseId, { confirmed: true, note: "Left a fictional voicemail." });
      const [request] = await requests(caseId);
      await answer(caseId, request.id);
      await asSam(caseId, "VERIFY_DOCUMENT", { requestId: request.id });
      assert.deepEqual(await columns(caseId), {
        stage: "screening",
        documents_origin: null,
        hold_origin: null,
        closing_reason: null,
      });
    });

    await t.test("an admin records a received document at the documents stages", async () => {
      const created = await f.draftCase(f.presenter, { mode: "assisted", personId: f.sam });
      const caseId = created.caseId;
      await asSam(caseId, "SUBMIT", { confirmed: true });
      await asSam(caseId, "VERIFY_INTAKE", { checks: await f.checksFor(caseId) });
      await ask(caseId, ["Photo ID", "W-2"]);
      const [first, second] = await requests(caseId);
      await asSam(caseId, "RECORD_DOCUMENT_RESPONSE", { requestId: first.id, filename: f.sampleFilename });
      assert.equal((await requests(caseId)).find((r) => r.id === first.id).status, "awaiting_verification");
      await hold(caseId);
      await asSam(caseId, "RECORD_DOCUMENT_RESPONSE", { requestId: second.id, filename: f.sampleFilename });
      assert.equal((await requests(caseId)).find((r) => r.id === second.id).status, "awaiting_verification");
      assert.equal((await columns(caseId)).stage, "on_hold");
    });

    await t.test("a signing hold", async () => {
      const caseId = await f.approvedCase();
      await hold(caseId);
      assert.deepEqual(await columns(caseId), {
        stage: "on_hold",
        documents_origin: null,
        hold_origin: "review_approved",
        closing_reason: null,
      });
      await assert.rejects(
        () => asSam(caseId, "MARK_READY_TO_EFILE", { confirmed: true }),
        rejected("INVALID_TRANSITION"),
      );
      await resume(caseId);
      assert.deepEqual(await columns(caseId), {
        stage: "review_approved",
        documents_origin: null,
        hold_origin: null,
        closing_reason: null,
      });
    });

    await t.test("hold refusals", async () => {
      const preparing = await f.assistedCase();
      await assert.rejects(() => hold(preparing), rejected("INVALID_TRANSITION"));
      const screening = await atScreening();
      await assert.rejects(() => hold(screening), rejected("INVALID_TRANSITION"));
      await assert.rejects(() => resume(screening), rejected("INVALID_TRANSITION"));
      const waiting = await waitingCase();
      for (const person of [f.alex, f.morgan])
        await assert.rejects(() => hold(waiting, { confirmed: true }, [f.presenter, person]), rejected("FORBIDDEN"));
      await assert.rejects(() => hold(waiting, { confirmed: true }, [f.applicantA, null]), rejected("FORBIDDEN"));
      for (const payload of [
        { confirmed: true, note: "x".repeat(1001) },
        { confirmed: true, note: "  " },
        {},
        { note: "A fictional note." },
        { confirmed: true, extra: 1 },
      ])
        await assert.rejects(() => hold(waiting, payload), rejected("VALIDATION"));
      assert.equal((await columns(waiting)).stage, "awaiting_documents");
      await hold(waiting);
      await assert.rejects(() => resume(waiting, {}), rejected("VALIDATION"));
      await assert.rejects(() => resume(waiting, { confirmed: true }, [f.presenter, f.alex]), rejected("FORBIDDEN"));
      await assert.rejects(() => hold(waiting), rejected("INVALID_TRANSITION"));
    });

    await t.test("the hold note stays with staff", async () => {
      const caseId = await waitingCase();
      const note = "Fictional note <b>called twice</b>.";
      await hold(caseId, { confirmed: true, note });
      const events = await f.sql(
        "select detail from public.case_events where case_id=$1 and action='PUT_ON_HOLD'",
        [caseId],
      );
      assert.equal(events.rows.length, 1);
      assert.equal(events.rows[0].detail.note, note);
      for (const line of await f.clientMessages(caseId)) assert.equal(line.includes("called twice"), false);
      // Without a note the detail carries none.
      const other = await waitingCase();
      await hold(other);
      const bare = await f.sql(
        "select detail from public.case_events where case_id=$1 and action='PUT_ON_HOLD'",
        [other],
      );
      assert.equal("note" in bare.rows[0].detail, false);
    });
  } finally {
    await f.close();
  }
});
