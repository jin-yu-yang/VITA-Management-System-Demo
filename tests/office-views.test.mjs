import test from "node:test";
import assert from "node:assert/strict";
import {
  followupQueue,
  officeFilters,
  queueCounts,
  renderFollowups,
  waitingDays,
  waitingLabel,
} from "../src/office-views.mjs";

const NOW = Date.parse("2026-09-27T15:00:00");
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString();
const sam = { id: "p-sam", name: "Sam", capabilities: ["admin", "followup", "assist", "receive_documents"] };
const kase = (over) => ({
  id: over.id,
  reference: over.reference ?? `VT-${over.id}`,
  stage: "received",
  intakeVerified: false,
  ownerUserId: "u-1",
  answers: { language: "Cantonese", service: "Drop-off" },
  updatedAt: daysAgo(1),
  revision: 1,
  ...over,
});

test("each queue kind comes from today's data", () => {
  const cases = [
    kase({ id: "a" }), // received → intake
    kase({ id: "b", stage: "draft", ownerUserId: null }), // assisted draft → intake
    kase({ id: "c", stage: "draft" }), // a client's own draft → nothing
    kase({ id: "d", stage: "preparation_ready", preparerId: null }), // → unclaimed
    kase({ id: "e", stage: "preparing", preparerId: "p-alex", openFollowups: 2 }), // → call
  ];
  const help = [
    { id: "h1", status: "open", title: "Help with forms", createdAt: daysAgo(0) },
    { id: "h2", status: "resolved", title: "Done", createdAt: daysAgo(9) },
  ];
  const rows = followupQueue(cases, help, NOW);
  assert.deepEqual(
    rows.map((row) => `${row.kind}:${row.record?.id ?? row.item?.id}`).sort(),
    ["call:e", "help:h1", "intake:a", "intake:b", "unclaimed:d"],
  );
  assert.equal(rows.find((row) => row.record?.id === "b").draft, true);
});

test("most urgent first: longest waiting, then kind order, then reference", () => {
  const rows = followupQueue(
    [
      kase({ id: "x", reference: "VT-B", updatedAt: daysAgo(2) }),
      kase({ id: "y", reference: "VT-A", updatedAt: daysAgo(2) }),
      kase({ id: "z", stage: "preparation_ready", updatedAt: daysAgo(6) }),
    ],
    [],
    NOW,
  );
  assert.deepEqual(rows.map((row) => row.record.id), ["z", "y", "x"]);
});

test("waiting is counted in calendar days, and says so in words", () => {
  assert.equal(waitingDays(daysAgo(0), NOW), 0);
  assert.equal(waitingDays(daysAgo(3), NOW), 3);
  assert.equal(waitingDays("not a date", NOW), null);
  assert.deepEqual([0, 1, 4, null].map(waitingLabel), ["Today", "1 day", "4 days", "—"]);
});

test("the kind and language filters, with counts that respect the language", () => {
  assert.deepEqual(officeFilters({}), { kind: "all", language: "all" });
  assert.deepEqual(officeFilters({ officeKind: "nonsense", language: "Mandarin" }), {
    kind: "all",
    language: "Mandarin",
  });
  const rows = followupQueue(
    [kase({ id: "a" }), kase({ id: "b", answers: { language: "Mandarin" } })],
    [{ id: "h", status: "open", title: "Forms", language: "Mandarin", createdAt: daysAgo(0) }],
    NOW,
  );
  const counts = queueCounts(rows, officeFilters({ language: "Mandarin" }));
  assert.equal(counts.all, 2);
  assert.equal(counts.intake, 1);
  assert.equal(counts.help, 1);
});

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const ALEX = { id: "p-alex", name: "Alex", capabilities: ["prepare"] };
const casey = { id: "p-casey", name: "Casey", capabilities: ["assist"] };
const page = (cases, help = [], person = sam, filters = {}) =>
  renderFollowups(cases, help, { person, filters, busy: false, now: NOW });
const rowOf = (html, id) => {
  const rows = html.split('<tr class="queue-row"').slice(1);
  const found = rows.find(
    (row) => row.includes(`data-case-id="${id}"`) || row.includes(`data-item-id="${id}"`),
  );
  assert.ok(found, `no row for ${id}`);
  return found.slice(0, found.indexOf("</tr>"));
};
const actions = (html) => [...html.matchAll(/data-case-action="([A-Z_]+)"/g)].map((m) => m[1]);

test("an intake row opens the case and carries no workflow action", () => {
  const html = page([
    kase({ id: "a", reference: "VT-AAAA" }),
    kase({ id: "b", reference: "VT-BBBB", stage: "draft", ownerUserId: null }),
  ]);
  assert.match(html, /<tr class="queue-row" data-kind="intake">/);
  const a = rowOf(html, "a");
  assert.match(a, /<button class="board-reference" data-action="open-case" data-case-id="a">VT-AAAA<\/button>/);
  assert.match(a, /data-action="open-case" data-case-id="a"[^>]*>[^]*Record intake checks/);
  assert.deepEqual(actions(a), []);
  assert.match(rowOf(html, "b"), /Finish and send/);
  assert.match(html, /<h2 id="office-queue-title" tabindex="-1">Office queue<\/h2>/);
});

test("an unclaimed row offers a reminder to the office and a reason to everyone else", () => {
  const record = kase({ id: "d", stage: "preparation_ready", preparerId: null });
  assert.match(rowOf(page([record]), "d"), /data-case-action="REMIND"[^>]*data-case-id="d"/);
  assert.doesNotMatch(rowOf(page([record]), "d"), /No external message sent/);
  const reminded = { ...record, lastRemindedAt: "2026-09-26T09:00:00.000Z" };
  assert.match(page([reminded]), /No external message sent\./);
  const forAlex = page([record], [], ALEX);
  assert.deepEqual(actions(forAlex), []);
  assert.match(forAlex, /Needs office administrator access\./);
});

test("a call row opens the log-a-call drawer and says who owes the call", () => {
  const html = page([
    kase({ id: "e", stage: "preparing", openFollowups: 2, followupAssigneeNames: ["Sam", "Jo"] }),
  ]);
  const row = rowOf(html, "e");
  assert.match(row, /data-action="open-log-call"[^>]*data-case-id="e"/);
  assert.match(row, /2 open tasks · waiting on Sam, Jo/);
});

test("a help row offers the one action its status allows", () => {
  const items = [
    { id: "h1", status: "open", title: "Forms", createdAt: daysAgo(1) },
    { id: "h2", status: "assigned", assigneeId: "p-sam", assigneeName: "Sam", title: "Second request", createdAt: daysAgo(1) },
  ];
  const html = page([], items);
  assert.match(rowOf(html, "h1"), /data-assistance-action="CLAIM" data-item-id="h1"/);
  assert.match(rowOf(html, "h2"), /data-action="open-resolve-help"[^>]*data-item-id="h2"/);
  assert.match(rowOf(html, "h2"), /Helper: Sam/);
  assert.doesNotMatch(rowOf(html, "h2"), /data-assistance-action="CLAIM"/);
  // Somebody else holds h2: the reason, no button.
  // A refused row carries no id attribute, so find it by its title.
  const forCasey = page([], items, casey);
  const refused = forCasey.split('<tr class="queue-row"').find((row) => row.includes("Second request"));
  assert.match(refused, /Only the helper holding this request resolves it\./);
  assert.doesNotMatch(refused, /open-resolve-help/);
  // A linked case is shown as a case, with its own stage, not the request status.
  const linked = page(
    [kase({ id: "k", reference: "VT-LINK", stage: "preparing" })],
    [{ ...items[0], id: "h3", caseId: "k" }],
  );
  const row = rowOf(linked, "h3");
  assert.match(row, /data-case-id="k">VT-LINK<\/button>/);
  assert.match(row, /class="badge/);
  assert.doesNotMatch(row, /Waiting for a helper|Being helped/);
});

test("the task-type toggles narrow the rows and show counts", () => {
  const cases = [kase({ id: "a" }), kase({ id: "e", stage: "preparing", openFollowups: 1 })];
  const html = page(cases);
  assert.match(html, /role="group" aria-label="Task type"/);
  assert.equal(
    [...html.matchAll(/data-action="set-board-filter" data-filter="officeKind"/g)].length,
    5,
  );
  assert.match(html, /data-filter="officeKind" data-value="all" aria-pressed="true"/);
  const calls = page(cases, [], sam, { officeKind: "call" });
  assert.match(calls, /data-filter="officeKind" data-value="call" aria-pressed="true"/);
  assert.match(calls, /data-kind="call"/);
  assert.doesNotMatch(calls, /data-kind="intake"/);
  assert.match(calls, /Call the client <span class="tab-count">1<\/span>/);
});

test("the language chips keep the shared filter key and narrow the rows", () => {
  const cases = [
    kase({ id: "a", reference: "VT-CANT" }),
    kase({ id: "b", reference: "VT-MAND", answers: { language: "Mandarin" } }),
  ];
  const html = page(cases, [], sam, { language: "Mandarin" });
  assert.match(html, /data-filter="language" data-value="Mandarin" aria-pressed="true"/);
  assert.match(html, /VT-MAND/);
  assert.doesNotMatch(html, /VT-CANT/);
});

test("waiting is shown in words and marked amber at 3 days, red at 5", () => {
  const html = page([
    kase({ id: "a", updatedAt: daysAgo(6) }),
    kase({ id: "b", updatedAt: daysAgo(3) }),
    kase({ id: "c", updatedAt: daysAgo(1) }),
  ]);
  assert.match(rowOf(html, "a"), /class="queue-waiting late">6 days</);
  assert.match(rowOf(html, "b"), /class="queue-waiting aging">3 days</);
  assert.match(rowOf(html, "c"), /class="queue-waiting ">1 day</);
  assert.match(html, /3 open · 2 over 3 days/);
});

test("empty and read-only states explain themselves", () => {
  const empty = page([]);
  assert.match(empty, /class="empty-state"/);
  assert.match(empty, /Nothing is waiting on the office right now\./);
  assert.doesNotMatch(empty, /Show every task|Show all languages/);
  const none = page([kase({ id: "a" })], [], sam, { officeKind: "help" });
  assert.match(none, /Nothing here matches these filters\./);
  assert.match(none, /Show every task/);
  assert.match(none, /data-filter="officeKind" data-value="all"/);
  assert.doesNotMatch(none, /Show all languages/);
  assert.doesNotMatch(none, /clear-board-filters/);
  const noPerson = page(
    [kase({ id: "d", stage: "preparation_ready", preparerId: null })],
    [{ id: "h", status: "open", title: "Forms", createdAt: daysAgo(1) }],
    null,
  );
  assert.match(noPerson, /Choose a volunteer persona to act as\./);
  assert.deepEqual(actions(noPerson), []);
  assert.doesNotMatch(noPerson, /data-assistance-action/);
  assert.match(noPerson, /class="staff-reason"/);
});

test("an empty queue offers to undo exactly the filters that emptied it", () => {
  const cases = [kase({ id: "a" })];
  const byLanguage = page(cases, [], sam, { language: "Mandarin" });
  assert.match(byLanguage, /Nothing here matches these filters\./);
  assert.match(byLanguage, /data-filter="language" data-value="all"[^>]*>Show all languages/);
  assert.doesNotMatch(byLanguage, /Show every task/);
  const both = page(cases, [], sam, { language: "Mandarin", officeKind: "help" });
  assert.match(both, /Show every task/);
  assert.match(both, /Show all languages/);
  assert.doesNotMatch(both, /clear-board-filters/);
});

test("references, titles and languages are escaped", () => {
  const nasty = '<script>alert("x")</script>';
  const html = page(
    [kase({ id: "a", reference: nasty, answers: { language: nasty } })],
    [{ id: "h", status: "open", title: nasty, language: nasty, contactPreference: nasty, createdAt: daysAgo(1) }],
  );
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
