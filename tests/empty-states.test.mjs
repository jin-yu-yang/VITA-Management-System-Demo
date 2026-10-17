import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderStaffBoard, renderStaffCase } from "../src/staff-views.mjs";
import { renderFollowups } from "../src/office-views.mjs";
import { renderAdminCase, attemptList } from "../src/admin-views.mjs";
import { applicationsScreen, progressScreen } from "../src/client-views.mjs";
import { STATES, SENTENCES } from "./empty-states.states.mjs";

// Moving the empty states onto emptyState / emptyLine must not change a
// character (change unify-empty-states, design D2). The case pool and the Log
// a call drawer change on purpose and are tested on their own.
const GOLDEN = JSON.parse(readFileSync(new URL("./fixtures/empty-states.json", import.meta.url), "utf8"));
const render = { renderStaffBoard, renderStaffCase, renderFollowups, renderAdminCase, attemptList, applicationsScreen, progressScreen };

test("every list's empty state renders exactly as it did before the helpers", () => {
  assert.deepEqual(Object.keys(GOLDEN).sort(), Object.keys(STATES).sort());
  for (const [name, [fn, args]] of Object.entries(STATES)) assert.equal(render[fn](...args), GOLDEN[name], name);
});

test("the golden states really are the empty ones", () => {
  const all = Object.values(GOLDEN).join("\n");
  for (const sentence of SENTENCES) assert.ok(all.includes(sentence), sentence);
});
