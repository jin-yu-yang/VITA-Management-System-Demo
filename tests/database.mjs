import test from "node:test";
import assert from "node:assert/strict";
import { createDatabaseFixture } from "./support/database-fixture.mjs";
import { REFERENCE_PATTERN } from "../src/contracts.mjs";
import { initializeWorkspace } from "../tools/admin/workspace-setup.mjs";
import { extendTestWorkspace } from "./support/workspace-overrides.mjs";
const rejected = (code) => (error) => error.code === code;
async function rows(client, table, filter = {}) {
  let q = client.from(table).select("*");
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data, error } = await q;
  assert.equal(error, null);
  return data;
}
test("identity, references, ownership, and privileged setup on real Supabase", async (t) => {
  const f = await createDatabaseFixture();
  try {
    await t.test(
      "references are stable and unique; IDs and references do not authorize access",
      async () => {
        const actionId = crypto.randomUUID();
        const [first, retry] = await Promise.all([
          f.createCase(f.applicantA, actionId),
          f.createCase(f.applicantA, actionId),
        ]);
        assert.deepEqual(first, retry);
        assert.match(first.reference, REFERENCE_PATTERN);
        const many = await Promise.all(
          Array.from({ length: 12 }, () =>
            f.createCase(f.applicantA, crypto.randomUUID()),
          ),
        );
        assert.equal(
          new Set([first, ...many].map((x) => x.reference)).size,
          13,
        );
        assert.equal(new Set([first, ...many].map((x) => x.caseId)).size, 13);
        assert.deepEqual(
          await rows(f.applicantB, "cases", { id: first.caseId }),
          [],
        );
        assert.deepEqual(
          await rows(f.applicantB, "cases", { reference: first.reference }),
          [],
        );
        assert.equal(
          (await rows(f.applicantA, "cases", { id: first.caseId })).length,
          1,
        );
        await assert.rejects(
          () =>
            f.createCase(f.applicantA, actionId, {
              answers: { firstName: "Changed" },
            }),
          rejected("VALIDATION"),
        );
        await assert.rejects(
          () =>
            f.createCase(f.applicantA, crypto.randomUUID(), {
              answers: { owner_user_id: f.applicantBUserId },
            }),
          rejected("VALIDATION"),
        );
        f.first = first;
        f.firstActionId = actionId;
      },
    );
    await t.test(
      "schema rejects inconsistent fixture markers and cross-workspace ownership",
      async () => {
        await f.sql("begin");
        try {
          await assert.rejects(
            () =>
              f.sql("update public.cases set fixture=true where id=$1", [
                f.first.caseId,
              ]),
            (error) => error.code === "23514",
          );
        } finally {
          await f.sql("rollback");
        }
        await assert.rejects(
          () =>
            f.sql("update public.cases set owner_user_id=$1 where id=$2", [
              f.outsiderUserId,
              f.first.caseId,
            ]),
          (error) => error.code === "23503",
        );
        await assert.rejects(
          () =>
            f.sql("update public.cases set reference=$1 where id=$2", [
              "VT-0000-1111",
              f.first.caseId,
            ]),
          (error) => error.code === "23514",
        );
        await assert.rejects(
          () =>
            f.createCase(f.applicantA, crypto.randomUUID(), {
              answers: { firstName: 42 },
            }),
          rejected("VALIDATION"),
        );
      },
    );
    await t.test(
      "presenter sees staff-created and submitted cases, never private applicant drafts",
      async () => {
        assert.deepEqual(
          await rows(f.presenter, "cases", { id: f.first.caseId }),
          [],
        );
        await assert.rejects(
          () => f.createCase(f.presenter, crypto.randomUUID()),
          rejected("FORBIDDEN"),
        );
        await assert.rejects(
          () =>
            f.createCase(f.presenter, crypto.randomUUID(), {
              mode: "assisted",
              personId: f.people.alex,
            }),
          rejected("FORBIDDEN"),
        );
        await assert.rejects(
          () =>
            f.createCase(f.applicantA, crypto.randomUUID(), {
              personId: f.people.sam,
            }),
          rejected("FORBIDDEN"),
        );
        await assert.rejects(
          () =>
            f.createCase(f.applicantA, crypto.randomUUID(), {
              mode: "assisted",
              personId: f.people.sam,
            }),
          rejected("FORBIDDEN"),
        );
        await assert.rejects(
          () =>
            f.createCase(f.presenter, crypto.randomUUID(), {
              mode: "assisted",
              personId: f.foreignPeople.sam,
            }),
          rejected("FORBIDDEN"),
        );
        const assisted = await f.createCase(f.presenter, crypto.randomUUID(), {
          mode: "assisted",
          personId: f.people.sam,
        });
        const [staff] = await rows(f.presenter, "cases", {
          id: assisted.caseId,
        });
        assert.equal(staff.owner_user_id, null);
        assert.equal(staff.created_by_user_id, f.presenterUserId);
        assert.equal(staff.created_by_person_id, f.people.sam);
        assert.deepEqual(
          await rows(f.applicantA, "cases", { id: assisted.caseId }),
          [],
        );
        await f.sql("update public.cases set stage=$1 where id=$2", [
          "received",
          f.first.caseId,
        ]);
        assert.equal(
          (await rows(f.presenter, "cases", { id: f.first.caseId })).length,
          1,
        );
      },
    );
    await t.test(
      "direct writes, anonymous APIs, outsider and unapproved accounts fail closed",
      async () => {
        for (const actor of [f.applicantA, f.presenter])
          for (const table of [
            "workspaces",
            "memberships",
            "people",
            "cases",
            "action_receipts",
          ]) {
            const response = await actor
              .from(table)
              .delete()
              .eq(
                table === "memberships" ? "user_id" : "id",
                table === "memberships" ? f.applicantAUserId : f.workspaceId,
              );
            assert.ok(response.error, `${table} direct DELETE must fail`);
          }
        for (const table of [
          "workspaces",
          "memberships",
          "people",
          "cases",
          "action_receipts",
        ])
          assert.ok((await f.anonymous.from(table).select("*")).error);
        assert.ok(
          (
            await f.anonymous.rpc("vitally_create_case", {
              p_action_id: crypto.randomUUID(),
              p_mode: "client",
              p_person_id: null,
              p_answers: {},
            })
          ).error,
        );
        assert.deepEqual(
          await rows(f.outsider, "cases", { id: f.first.caseId }),
          [],
        );
        assert.deepEqual(await rows(f.unapproved, "cases"), []);
        await assert.rejects(
          () => f.createCase(f.unapproved, crypto.randomUUID()),
          rejected("FORBIDDEN"),
        );
        assert.equal((await rows(f.applicantA, "memberships")).length, 1);
        assert.deepEqual(await rows(f.applicantA, "people"), []);
        assert.equal((await rows(f.presenter, "people")).length, 3);
        assert.ok(
          (await f.applicantA.from("action_receipts").select("*")).error,
        );
        assert.ok((await f.presenter.rpc("initialize_workspace", {})).error);
      },
    );
    await t.test(
      "normal initializer preserves people, default, capabilities and binding; adds roster only explicitly",
      async () => {
        const before = await f.snapshot();
        const [result, concurrent] = await Promise.all([
          initializeWorkspace(f.setup),
          initializeWorkspace(f.setup),
        ]);
        assert.deepEqual(result, concurrent);
        assert.deepEqual(result.people, f.people);
        assert.deepEqual(await f.snapshot(), before);
        const people = (
          await f.sql(
            "select person_key,capabilities from public.people where workspace_id=$1 order by person_key",
            [f.workspaceId],
          )
        ).rows;
        assert.deepEqual(people, [
          { person_key: "alex", capabilities: ["prepare"] },
          { person_key: "morgan", capabilities: ["review"] },
          {
            person_key: "sam",
            capabilities: ["admin", "assist", "followup", "receive_documents"],
          },
        ]);
        const workspace = (
          await f.sql(
            "select default_followup_person_id from public.workspaces where id=$1",
            [f.workspaceId],
          )
        ).rows[0];
        assert.equal(workspace.default_followup_person_id, f.people.sam);
        await assert.rejects(
          () =>
            f.sql(
              "update public.workspaces set default_followup_person_id=$1 where id=$2",
              [f.foreignPeople.sam, f.workspaceId],
            ),
          (error) => error.code === "23503",
        );
        const added = await initializeWorkspace({
          ...f.setup,
          applicantUserIds: [...f.setup.applicantUserIds, f.unapprovedUserId],
        });
        assert.deepEqual(added.people, f.people);
        assert.equal((await rows(f.unapproved, "memberships")).length, 1);
        await assert.rejects(
          () =>
            initializeWorkspace({
              ...f.setup,
              fixtureClientBindings: { preparation_ready: f.applicantBUserId },
            }),
          rejected("VALIDATION"),
        );
      },
    );
    await t.test(
      "explicit service role table grants work, and receipts survive target removal",
      async () => {
        const { data, error } = await f.service((admin) =>
          admin
            .from("cases")
            .update({ fixture: true, fixture_key: "preparation_ready" })
            .eq("id", f.first.caseId)
            .select(),
        );
        assert.equal(error, null);
        assert.equal(data.length, 1);
        const del = await f.service((admin) =>
          admin.from("cases").delete().eq("id", f.first.caseId),
        );
        assert.equal(del.error, null);
        const replay = await f.createCase(f.applicantA, f.firstActionId);
        assert.deepEqual(replay, f.first);
        assert.deepEqual(
          await rows(f.applicantA, "cases", { id: f.first.caseId }),
          [],
        );
        const receipt = (
          await f.sql(
            "select target_id,target_reference from public.action_receipts where action_id=$1",
            [f.firstActionId],
          )
        ).rows[0];
        assert.equal(receipt.target_id, f.first.caseId);
        assert.equal(receipt.target_reference, f.first.reference);
      },
    );
    await t.test(
      "revocation removes reads and accepted replay authority and cannot be silently reactivated",
      async () => {
        const acceptedId = crypto.randomUUID();
        await f.createCase(f.applicantB, acceptedId);
        await f.sql(
          "update public.memberships set active=false where user_id=$1",
          [f.applicantBUserId],
        );
        await assert.rejects(
          () => f.createCase(f.applicantB, acceptedId),
          rejected("FORBIDDEN"),
        );
        const old = await f
          .createCase(f.applicantB, crypto.randomUUID())
          .catch((error) => {
            assert.equal(error.code, "FORBIDDEN");
          });
        assert.equal(old, undefined);
        const before = await f.snapshot();
        await assert.rejects(
          () => initializeWorkspace(f.setup),
          rejected("VALIDATION"),
        );
        assert.deepEqual(await f.snapshot(), before);
        assert.deepEqual(await rows(f.applicantB, "workspaces"), []);
        assert.deepEqual(await rows(f.applicantB, "cases"), []);
        await assert.rejects(
          () => f.createCase(f.applicantB, crypto.randomUUID()),
          rejected("FORBIDDEN"),
        );
        await f.sql(
          "update public.memberships set active=true where user_id=$1",
          [f.applicantBUserId],
        );
      },
    );
    await t.test(
      "test enrichment is additive, idempotent, scoped and permanently blocks normal initializer",
      async () => {
        const addition = {
          runManifest: f.runManifest,
          workspaceId: f.workspaceId,
          addPeople: [
            { key: "casey", name: "Casey", capabilities: ["prepare"] },
          ],
          addCapabilities: [{ personId: f.people.alex, capability: "review" }],
        };
        const result = await extendTestWorkspace(addition);
        const before = await f.snapshot();
        assert.deepEqual(await extendTestWorkspace(addition), result);
        assert.deepEqual(await f.snapshot(), before);
        await assert.rejects(
          () =>
            extendTestWorkspace({
              ...addition,
              addCapabilities: [
                { personId: f.foreignPeople.sam, capability: "review" },
              ],
            }),
          rejected("VALIDATION"),
        );
        await assert.rejects(
          () =>
            extendTestWorkspace({
              ...addition,
              addPeople: [
                { key: "casey", name: "Wrong", capabilities: ["prepare"] },
              ],
            }),
          rejected("VALIDATION"),
        );
        await assert.rejects(
          () =>
            extendTestWorkspace({
              ...addition,
              addCapabilities: [
                { personId: f.people.alex, capability: "root" },
              ],
            }),
          rejected("VALIDATION"),
        );
        await assert.rejects(
          () => initializeWorkspace(f.setup),
          rejected("VALIDATION"),
        );
        assert.deepEqual(await f.snapshot(), before);
        await assert.rejects(
          () =>
            extendTestWorkspace({
              ...addition,
              workspaceId: crypto.randomUUID(),
            }),
          rejected("TARGET_REJECTED"),
        );
        await assert.rejects(
          () =>
            extendTestWorkspace({
              ...addition,
              runManifest: { runId: f.runManifest.runId },
            }),
          rejected("TARGET_REJECTED"),
        );
        await assert.rejects(
          () =>
            extendTestWorkspace({ ...addition, removePeople: [f.people.sam] }),
          rejected("VALIDATION"),
        );
        await f.sql(
          "update vitally_private.test_workspaces set run_id=$1 where workspace_id=$2",
          [crypto.randomUUID(), f.workspaceId],
        );
        try {
          await assert.rejects(
            () => extendTestWorkspace(addition),
            rejected("VALIDATION"),
          );
        } finally {
          await f.sql(
            "update vitally_private.test_workspaces set run_id=$1 where workspace_id=$2",
            [f.runManifest.runId, f.workspaceId],
          );
        }
      },
    );
    await t.test(
      "effective table, function, RLS, defaults and receipt foreign keys enforce the boundary",
      async () => {
        const tableNames = [
          "workspaces",
          "memberships",
          "people",
          "cases",
          "action_receipts",
        ];
        for (const table of tableNames) {
          const result = (
            await f.sql(
              "select relrowsecurity from pg_class where oid=$1::regclass",
              [`public.${table}`],
            )
          ).rows[0];
          assert.equal(result.relrowsecurity, true);
          for (const role of ["anon", "authenticated", "service_role"]) {
            const acl = (
              await f.sql(
                "select has_table_privilege($1,$2,'SELECT') as sel,has_table_privilege($1,$2,'INSERT') as can_insert,has_table_privilege($1,$2,'UPDATE') as can_update,has_table_privilege($1,$2,'DELETE') as can_delete",
                [role, `public.${table}`],
              )
            ).rows[0];
            assert.equal(acl.can_insert, role === "service_role");
            assert.equal(acl.can_update, role === "service_role");
            assert.equal(acl.can_delete, role === "service_role");
            assert.equal(
              acl.sel,
              role === "service_role" ||
                (role === "authenticated" && table !== "action_receipts"),
            );
          }
        }
        const functions = (
          await f.sql(
            "select n.nspname,p.oid::regprocedure::text as signature,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') as anon,has_function_privilege('authenticated',p.oid,'EXECUTE') as browser,has_function_privilege('service_role',p.oid,'EXECUTE') as service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='vitally_private' or (n.nspname='public' and p.proname like 'vitally_%')",
          )
        ).rows;
        assert.ok(functions.length >= 2);
        for (const fn of functions) {
          assert.equal(fn.anon, false);
          assert.equal(fn.browser, fn.nspname === "public");
          if (fn.nspname === "vitally_private") assert.equal(fn.service, false);
          assert.ok(fn.proconfig.includes('search_path=""'));
        }
        const fks = (
          await f.sql(
            "select confrelid::regclass::text as target from pg_constraint where conrelid='public.action_receipts'::regclass and contype='f'",
          )
        ).rows;
        assert.deepEqual(fks, [{ target: "workspaces" }]);
        await f.sql("begin");
        try {
          await f.sql(
            "create function vitally_private.default_acl_probe() returns int language sql as $$select 1$$",
          );
          const acl = (
            await f.sql(
              "select has_function_privilege('anon','vitally_private.default_acl_probe()','execute') as anon,has_function_privilege('authenticated','vitally_private.default_acl_probe()','execute') as browser,has_function_privilege('service_role','vitally_private.default_acl_probe()','execute') as service",
            )
          ).rows[0];
          assert.deepEqual(acl, {
            anon: false,
            browser: false,
            service: false,
          });
        } finally {
          await f.sql("rollback");
        }
      },
    );
  } finally {
    await f.close();
  }
});
test("failed workspace setup rolls back marker and workspace and cleans tracked Auth users", async () => {
  let proof;
  await assert.rejects(async () => {
    const unexpected = await createDatabaseFixture({
      afterInitialize: async (details) => {
        proof = details;
        throw Object.assign(new Error("Injected setup failure."), {
          code: "TEST_SETUP_FAILURE",
        });
      },
    });
    await unexpected.close();
  }, rejected("TEST_SETUP_FAILURE"));
  assert.ok(proof);
  const { readFile } = await import("node:fs/promises");
  const manifest = JSON.parse(
    await readFile(`.vitally-runs/${proof.runId}.json`, "utf8"),
  );
  assert.equal(manifest.active, false);
  assert.deepEqual(manifest.userIds, []);
  assert.deepEqual(manifest.workspaceIds, []);
  assert.deepEqual(manifest.pendingWorkspaceIds, []);
  const { openDatabase } = await import("../tools/admin/database.mjs");
  const client = await openDatabase();
  try {
    assert.equal(
      (
        await client.query("select id from public.workspaces where id=$1", [
          proof.workspaceId,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await client.query(
          "select id from auth.users where id=any($1::uuid[])",
          [proof.userIds],
        )
      ).rowCount,
      0,
    );
  } finally {
    await client.end();
  }
});
test("serializable setup retries the whole transaction and bounds exhaustion", async () => {
  const { openDatabase, serializable } =
    await import("../tools/admin/database.mjs");
  const client = await openDatabase();
  try {
    await client.query("create temporary table retry_probe(attempt integer)");
    let attempts = 0;
    const accepted = await serializable(client, async (connection) => {
      attempts++;
      await connection.query("insert into retry_probe values($1)", [attempts]);
      if (attempts < 3)
        await connection.query("do $$begin raise serialization_failure; end$$");
      return attempts;
    });
    assert.equal(accepted, 3);
    assert.deepEqual(
      (await client.query("select attempt from retry_probe")).rows,
      [{ attempt: 3 }],
    );
    await client.query("truncate retry_probe");
    attempts = 0;
    await assert.rejects(
      () =>
        serializable(client, async (connection) => {
          attempts++;
          await connection.query("insert into retry_probe values($1)", [
            attempts,
          ]);
          await connection.query(
            "do $$begin raise serialization_failure; end$$",
          );
        }),
      (error) => error.code === "40001",
    );
    assert.equal(attempts, 3);
    assert.deepEqual(
      (await client.query("select attempt from retry_probe")).rows,
      [],
    );
  } finally {
    await client.end();
  }
});
