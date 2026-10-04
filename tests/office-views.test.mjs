import test from "node:test";
import assert from "node:assert/strict";
import { INTAKE_ANSWER_KEYS } from "../src/domain.mjs";
import {
  ADD_CASE_SECTIONS,
  followupQueue,
  logCallDrawerBody,
  officeFilters,
  resolveHelpDrawerBody,
  queueCounts,
  renderAddCase,
  renderAddCaseV2,
  renderFollowups,
  waitingDays,
  waitingLabel,
} from "../src/office-views.mjs";
import { makeSampleAnswers } from "../src/sample-data.mjs";
import { findSubstep } from "../src/intake-catalogue.mjs";
import { visibleSubsteps } from "../src/intake-form.mjs";

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

test("version-2 language codes and version-1 labels read and filter as one", () => {
  const cases = [
    kase({ id: "a", reference: "VT-V2", answers: { language: "cantonese", service: "drop_off" } }),
    kase({ id: "b", reference: "VT-V1", answers: { language: "Cantonese", service: "Drop-off" } }),
    kase({ id: "c", reference: "VT-MAND", answers: { language: "mandarin" } }),
  ];
  const all = page(cases, [], sam, {});
  assert.doesNotMatch(all, /cantonese|mandarin/);
  assert.equal([...all.matchAll(/data-filter="language" data-value="Cantonese"/g)].length, 1);
  assert.match(all, /data-filter="language" data-value="Mandarin"/);
  const html = page(cases, [], sam, { language: "Cantonese" });
  assert.match(html, /VT-V2/);
  assert.match(html, /VT-V1/);
  assert.doesNotMatch(html, /VT-MAND/);
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
  // Rebuilt on every render, so it is not a live region: it would re-announce.
  assert.match(html, /<span class="muted small">3 open · 2 over 3 days<\/span>/);
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

// ---------------------------------------------------------------------------
// The two drawers
// ---------------------------------------------------------------------------

const task = (over = {}) => ({
  id: "f1",
  status: "open",
  reason: "Ask for the missing W-2",
  assigneeId: "p-sam",
  assigneeName: "Sam",
  attempts: [
    { outcome: "no_answer", actorName: "Sam", createdAt: daysAgo(1), note: "Rang twice" },
  ],
  ...over,
});
const called = (followups) =>
  kase({ id: "c1", reference: "VT-CALL", stage: "preparing", followups });
const count = (html, pattern) => (html.match(pattern) ?? []).length;

test("the Log a call drawer holds Sam's own task and both of its forms", () => {
  const html = logCallDrawerBody({ record: called([task()]), person: sam, ui: {}, caseId: "c1" });
  assert.match(html, /VT-CALL/);
  assert.match(html, /class="badge/);
  assert.match(html, /Ask for the missing W-2/);
  assert.match(html, /Calls so far/);
  assert.match(html, /class="attempt-list"/);
  assert.match(html, /Rang twice/);
  assert.match(html, /data-case-action="RECORD_CONTACT"[^>]*data-followup-id="f1"/);
  assert.match(html, /data-case-action="RESOLVE_FOLLOWUP"[^>]*data-followup-id="f1"/);
  assert.match(html, /data-action="open-case"[^>]*data-case-id="c1"[^>]*>Open the case</);
});

test("a task assigned to someone else shows the reason and no form", () => {
  const html = logCallDrawerBody({
    record: called([task({ assigneeId: "p-jo", assigneeName: "Jo" })]),
    person: sam,
    ui: {},
    caseId: "c1",
  });
  assert.match(html, /The office assigned this task to someone else\./);
  assert.doesNotMatch(html, /RECORD_CONTACT/);
});

test("two open tasks are two sections with their own field ids", () => {
  const html = logCallDrawerBody({
    record: called([task(), task({ id: "f2", reason: "Confirm the address" })]),
    person: sam,
    ui: {},
    caseId: "c1",
  });
  assert.equal(count(html, /<section class="drawer-task">/g), 2);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "every field id is unique");
  assert.match(html, /data-followup-id="f2"/);
});

test("a case with no open task left says so and offers to close", () => {
  const html = logCallDrawerBody({
    record: called([task({ status: "resolved" })]),
    person: sam,
    ui: {},
    caseId: "c1",
  });
  assert.match(html, /No open follow-up is left on this case\./);
  assert.match(html, /data-action="close-dialog"/);
  assert.doesNotMatch(html, /RECORD_CONTACT/);
});

test("a drawer for another case, or none, opens nothing", () => {
  for (const record of [called([task()]), null]) {
    const html = logCallDrawerBody({ record, person: sam, ui: {}, caseId: "c2" });
    assert.match(html, /This case could not be opened\. Close this and try again\./);
    assert.doesNotMatch(html, /<form/);
  }
});

test("a refusal is stated once in the drawer, with its own controls", () => {
  const error = { code: "VALIDATION", message: "The note is too long." };
  const retry = logCallDrawerBody({
    record: called([task()]),
    person: sam,
    ui: { error, retryable: true },
    caseId: "c1",
  });
  assert.match(retry, /<div class="notice amber" role="alert" id="drawer-error">/);
  assert.match(retry, /The note is too long\./);
  assert.match(retry, /data-action="dismiss-error"/);
  assert.match(retry, /data-action="retry-action"/);
  const final = logCallDrawerBody({ record: called([task()]), person: sam, ui: { error }, caseId: "c1" });
  assert.match(final, /id="drawer-error"/);
  assert.doesNotMatch(final, /data-action="retry-action"/);
});

test("the help drawer resolves one assigned request, as the old card did", () => {
  const item = {
    id: "h2",
    status: "assigned",
    assigneeId: "p-sam",
    assigneeName: "Sam",
    title: "Help reading a letter",
    language: "Mandarin",
    contactPreference: "Phone call",
    revision: 2,
  };
  const html = resolveHelpDrawerBody({ item, person: sam, ui: {} });
  assert.match(html, /Help reading a letter/);
  assert.match(html, /Mandarin/);
  assert.match(html, /Phone call/);
  assert.match(
    html,
    /Helping a client with their own forms is separate from preparing a return: resolving a request changes nothing about the case's intake, stage or preparer\./,
  );
  const form = html.match(/<form class="staff-form">[\s\S]*?<\/form>/)?.[0] ?? "";
  assert.match(form, /What you helped with/);
  assert.match(form, /<textarea[^>]*maxlength="1000"/);
  assert.match(form, /<textarea[^>]*required/);
  assert.match(form, /<button type="submit"[^>]*data-assistance-action="RESOLVE" data-item-id="h2"/);

  // Somebody else's request: the reason, and nothing to submit.
  const jo = resolveHelpDrawerBody({ item: { ...item, assigneeId: "p-jo" }, person: sam, ui: {} });
  assert.match(jo, /Only the helper holding this request resolves it\./);
  assert.doesNotMatch(jo, /data-assistance-action="RESOLVE"/);
  // Gone, or no longer assigned.
  for (const gone of [null, { ...item, status: "resolved" }])
    assert.match(resolveHelpDrawerBody({ item: gone, person: sam, ui: {} }), /This request is no longer open\./);
  // Its own refusal.
  const refused = resolveHelpDrawerBody({ item, person: sam, ui: { error: { code: "VALIDATION", message: "No." } } });
  assert.match(refused, /id="drawer-error"/);
});

test("the Log a call drawer states a refusal once in every branch without a task", () => {
  const ui = { error: { code: "VALIDATION", message: "Refused here." } };
  for (const [record, caseId] of [
    [called([task()]), "c2"], // another case
    [null, "c1"], // none loaded
    [called([task({ status: "resolved" })]), "c1"], // no open task left
  ]) {
    const html = logCallDrawerBody({ record, person: sam, ui, caseId });
    assert.equal(count(html, /role="alert"/g), 1);
    assert.match(html, /id="drawer-error"[\s\S]*Refused here\./);
  }
});

test("the help drawer states a refusal once in every branch", () => {
  const ui = { error: { code: "VALIDATION", message: "Refused here." } };
  const item = { id: "h2", status: "assigned", assigneeId: "p-sam", title: "Letter", revision: 2 };
  for (const current of [null, { ...item, status: "resolved" }, { ...item, assigneeId: "p-jo" }]) {
    const html = resolveHelpDrawerBody({ item: current, person: sam, ui });
    assert.equal(count(html, /role="alert"/g), 1);
    assert.match(html, /id="drawer-error"[\s\S]*Refused here\./);
  }
});

test("the add-a-case sections hold every intake answer exactly once, in order", () => {
  assert.deepEqual(
    ADD_CASE_SECTIONS.flatMap(([, , keys]) => keys),
    [...INTAKE_ANSWER_KEYS],
  );
});

test("Add a case is one form with every intake field", () => {
  const html = renderAddCase({ person: sam });
  assert.match(html, /<form id="assisted-intake-form" class="staff-form add-case-form">/);
  for (const key of INTAKE_ANSWER_KEYS)
    assert.match(html, new RegExp(`id="field-assisted-${key}"`), key);
  const legends = [...html.matchAll(/<fieldset class="panel add-case-section"><legend>.*?<\/span> (.*?)<\/legend>/g)].map((m) => m[1]);
  assert.deepEqual(legends, ["Visit", "2025 situation", "Client details", "Paperwork"]);
  assert.match(html, /data-action="fill-assisted-intake"/);
  assert.equal((html.match(/type="submit"/g) ?? []).length, 1);
  assert.match(html, /type="submit"[^>]*>[^]*?Create case<\/button>/);
  assert.match(html, /<button[^>]*data-action="open-board"[^>]*>/);
  assert.match(html.match(/<button[^>]*data-action="open-board"[^>]*>/)[0], /type="button"/);
  assert.match(html, /Creating it saves a draft the office owns\. Nobody is emailed or invited\./);
  assert.match(html, /Mailing city/);
});

test("Add a case refuses a persona without the right, and asks for a persona", () => {
  const volunteer = { id: "p-al", name: "Alex", capabilities: ["prepare"] };
  const refused = renderAddCase({ person: volunteer });
  assert.match(refused, /staff-reason/);
  assert.doesNotMatch(refused, /<form/);
  const none = renderAddCase({ person: null });
  assert.match(none, /Choose a volunteer persona to act as\./);
  assert.doesNotMatch(none, /<form/);
});

test("Add a case's side card names who creates it", () => {
  const html = renderAddCase({ person: sam });
  assert.match(html, /Application ID<\/span><strong>Assigned when the case is created/);
  assert.match(html, /Created by<\/span><strong>Sam</);
});

test("a queue row and the Log a call drawer show the client number", () => {
  const html = page([kase({ id: "n", reference: "VT-NUM", clientNumber: 93, season: 2025 })]);
  assert.match(rowOf(html, "n"), /<span class="client-number">#093<\/span><button class="board-reference"/);
  const drawer = logCallDrawerBody({
    record: { ...called([task()]), clientNumber: 93, season: 2025 },
    person: sam,
    ui: {},
    caseId: "c1",
  });
  assert.match(drawer, /#093 · VT-CALL <span class="badge/);
});

// ---------------------------------------------------------------------------
// Part 4c, Task 4: the version-2 Add a case page.
// ---------------------------------------------------------------------------

const V2_SAMPLE = () => makeSampleAnswers({ version: 2 });
const withoutIds = (answers, ...ids) =>
  Object.fromEntries(Object.entries(answers).filter(([id]) => !ids.includes(id)));
const ALL_PARTS = () =>
  visibleSubsteps(V2_SAMPLE(), []).filter((id) => findSubstep(id).kind === "questions");
const savedV2 = (over = {}) => ({
  id: "case-v2",
  reference: "VT-V2AA-0001",
  stage: "draft",
  ownerUserId: null,
  intakeVersion: 2,
  revision: 4,
  answers: {},
  contact: null,
  materials: [],
  documentCards: [],
  createdAt: "2026-10-01T15:00:00.000Z",
  internalHistory: [
    { eventType: "case_created", actorPersonId: "p-sam", createdAt: "2026-10-01T15:00:00.000Z" },
    { eventType: "answers_saved", actorPersonId: "p-al", createdAt: "2026-10-02T15:00:00.000Z" },
  ],
  ...over,
});
const addV2 = (over = {}) =>
  renderAddCaseV2({
    person: sam,
    busy: false,
    officeSaving: false,
    draftAnswers: {},
    savedCase: null,
    openAddSubsteps: ["before.ready"],
    openPanels: [],
    addCaseShowMissing: false,
    revealed: [],
    dirty: false,
    saveState: "idle",
    error: null,
    retryable: false,
    people: [sam, { id: "p-al", name: "Alex", capabilities: ["prepare"] }],
    ...over,
  });
const formOf = (html) => html.slice(html.indexOf('<form id="add-case-v2-form"'), html.indexOf("</form>") + 7);
const subOf = (html, id) => {
  const start = html.indexOf(`<div class="add-sub" data-substep="${id}">`);
  assert.ok(start >= 0, `${id} is an accordion`);
  const next = html.indexOf('<div class="add-sub" ', start + 1);
  const end = html.indexOf("</section>", start);
  return html.slice(start, next >= 0 && next < end ? next : end);
};
const statusOf = (html, id) =>
  new RegExp(`<span id="add-sub-${id.replace(/\./g, "-")}-status" class="add-sub-status is-(\\w+)">([^<]*)</span>`).exec(html);
const docCardOf = (html, slot) =>
  new RegExp(`<article class="doc-card" id="doc-${slot.replace(/\./g, "-")}"[\\s\\S]*?</article>`).exec(html)?.[0];
const sendOf = (html) => /<button[^>]*id="add-case-send"[^>]*>/.exec(html)?.[0] ?? "";
const saveOf = (html) => /<button[^>]*data-action="save-office-draft"[^>]*>/.exec(html)?.[0] ?? "";

test("the version-2 Add a case: one section per step in order, without Review", () => {
  const html = addV2({ draftAnswers: V2_SAMPLE() });
  const form = formOf(html);
  const steps = [...form.matchAll(/<section class="add-step" data-step-id="([a-z]+)"[^>]*><h2[^>]*>([^<]*)<\/h2>/g)];
  assert.deepEqual(
    steps.map((m) => m[1]),
    ["before", "about", "household", "income", "expenses", "refund", "optional", "documents", "notes"],
  );
  assert.deepEqual(
    steps.map((m) => m[2]),
    [
      "Before you start",
      "1. About you",
      "2. Household",
      "3. Income",
      "4. Expenses &amp; life events",
      "5. Refund &amp; permission",
      "6. Optional questions",
      "7. Documents",
      "8. Anything else",
    ],
  );
  assert.doesNotMatch(form, /review\.|Review &amp; submit/);
  assert.match(form, /<form id="add-case-v2-form"[^>]* novalidate/);
});

test("the visible question sub-steps are accordions, and only the open ones hold questions", () => {
  const single = addV2({ draftAnswers: V2_SAMPLE(), openAddSubsteps: ["about.you"] });
  const parts = [...formOf(single).matchAll(/<div class="add-sub" data-substep="([a-z_.]+)">/g)].map((m) => m[1]);
  // The Documents step sits between Optional questions and Anything else.
  const expected = ALL_PARTS();
  expected.splice(expected.indexOf("notes.anything"), 0, "documents");
  assert.deepEqual(parts, expected);
  assert.doesNotMatch(single, /Your spouse/);
  const married = addV2({ draftAnswers: makeSampleAnswers({ version: 2, married: true }) });
  assert.match(married, /data-substep="about\.spouse"/);
  assert.match(married, /Your spouse/);
  // Open: its questions; closed: none.
  assert.match(subOf(single, "about.you"), /id="field-office-tp_first_name"/);
  assert.doesNotMatch(subOf(single, "about.address"), /data-control/);
  assert.doesNotMatch(subOf(single, "before.ready"), /data-control/);
  // Each toggle names its id, what it controls and whether it is open.
  for (const id of ALL_PARTS()) {
    const dashed = id.replace(/\./g, "-");
    const toggle = new RegExp(
      `<button type="button" class="add-sub-toggle" data-action="toggle-add-substep" data-substep="${id.replace(/\./g, "\\.")}" id="add-sub-${dashed}-toggle" aria-expanded="(true|false)" aria-controls="add-sub-${dashed}-body">`,
    ).exec(single);
    assert.ok(toggle, `${id} has its toggle`);
    assert.equal(toggle[1], String(id === "about.you"));
  }
  assert.match(single, /id="add-sub-documents-toggle"/);
  assert.match(single, /<div id="add-sub-about-you-body" class="add-sub-body">/);
});

test("a closed part shows a one-line summary of its answers", () => {
  const html = addV2({ draftAnswers: V2_SAMPLE(), openAddSubsteps: [] });
  const summary = /<p class="add-sub-summary">([^<]*)<\/p>/.exec(subOf(html, "about.you"));
  assert.ok(summary, "about.you has a summary");
  assert.ok(summary[1].startsWith("Mei · "), summary[1]);
  const unescaped = (text) =>
    text.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  for (const [, text] of html.matchAll(/<p class="add-sub-summary">([^<]*)<\/p>/g))
    assert.ok(unescaped(text).length <= 140, text);
  const long = addV2({ draftAnswers: { ...V2_SAMPLE(), tp_job_title: "x".repeat(300) }, openAddSubsteps: [] });
  const cut = unescaped(/<p class="add-sub-summary">([^<]*)<\/p>/.exec(subOf(long, "about.you"))[1]);
  assert.equal(cut.length, 140);
  assert.ok(cut.endsWith("…"));
  const empty = addV2({ draftAnswers: {}, openAddSubsteps: [] });
  assert.match(subOf(empty, "about.you"), /<p class="add-sub-summary">Nothing entered yet<\/p>/);
});

test("an open part shows its lead line, and no section intro", () => {
  const html = addV2({ draftAnswers: V2_SAMPLE(), openAddSubsteps: ["before.ready", "income.wages", "household.members", "refund.consent", "optional.questions"] });
  assert.match(subOf(html, "income.wages"), /<p class="q-lead">Did you or your spouse receive any of these in 2025\?<\/p>/);
  for (const intro of ["Please have these ready", "everyone who lived with you", "This consent is optional", "These questions are"])
    assert.doesNotMatch(html, new RegExp(intro), intro);
  assert.doesNotMatch(html, /class="q-intro/);
  // Every household member carries its hidden member id.
  const members = V2_SAMPLE().hh.length;
  assert.equal((subOf(html, "household.members").match(/<input type="hidden" data-control data-q="hh" data-member="\d+" data-sub="member_id"/g) ?? []).length, members);
});

test("the header: breadcrumb, the Application ID and the save chip inside .application-meta, and no second heading", () => {
  const html = addV2();
  assert.doesNotMatch(html, /<h1/);
  assert.match(html, /<nav aria-label="Breadcrumb"[^>]*>[\s\S]*?<button type="button" class="btn inline" data-action="open-board"[^>]*>Work board<\/button>[\s\S]*?Add a case[\s\S]*?<\/nav>/);
  const meta = /<div class="application-meta">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(meta, "one .application-meta");
  assert.match(meta[1], /Application ID: assigned when you save/);
  assert.match(meta[1], /Draft · <span class="save-chip[^"]*"/);
  const saved = addV2({ savedCase: savedV2() });
  assert.match(/<div class="application-meta">([\s\S]*?)<\/div>/.exec(saved)[1], /Application ID: VT-V2AA-0001/);
  assert.doesNotMatch(saved, /assigned when you save/);
  assert.match(addV2({ dirty: true, saveState: "unsaved" }), /<div class="application-meta">[\s\S]*?Unsaved changes/);
});

test("the layout: the form and its side column are siblings, never nested", () => {
  const html = addV2({ savedCase: savedV2() });
  assert.match(html, /<div class="add-case-layout"><form id="add-case-v2-form"/);
  assert.ok(html.indexOf("</form>") < html.indexOf('id="materials-form"'), "the materials form comes after");
  assert.ok(html.indexOf('<aside class="add-case-side">') > html.indexOf("</form>"));
  assert.equal((html.match(/<form /g) ?? []).length, 2);
  // No browser validation anywhere on the page.
  assert.doesNotMatch(formOf(addV2({ draftAnswers: V2_SAMPLE(), openAddSubsteps: ALL_PARTS() })), / (required|min|max|pattern)(=|\s|>)/);
});

test("the side column: case info and the materials, disabled until the first save", () => {
  const before = addV2();
  const side = before.slice(before.indexOf('<aside class="add-case-side">'));
  assert.match(side, /Case info/);
  assert.match(side, /Stage<\/span><strong>Draft</);
  assert.match(side, /Created by<\/span><strong>Sam</);
  assert.match(side, /Created at<\/span><strong>When you save</);
  assert.match(side, /Materials received/);
  assert.equal((side.match(/<input type="checkbox"[^>]*name="received"[^>]* disabled>/g) ?? []).length, 11);
  assert.match(side, /Save the draft first to record materials/);
  assert.doesNotMatch(side, /data-case-action="RECORD_MATERIALS"/);

  const after = addV2({ savedCase: savedV2() });
  const saved = after.slice(after.indexOf('<aside class="add-case-side">'));
  assert.match(saved, /Created by<\/span><strong>Sam</, "the earliest event's actor");
  assert.doesNotMatch(saved, /When you save/);
  assert.match(saved, /<form id="materials-form"/);
  assert.match(saved, /data-case-action="RECORD_MATERIALS"/);
  assert.doesNotMatch(saved, /name="received"[^>]* disabled/);
  assert.doesNotMatch(saved, /Save the draft first/);
  // The earliest entry decides, whatever the order; nobody named: the office.
  const reordered = savedV2();
  reordered.internalHistory = [...reordered.internalHistory].reverse();
  assert.match(addV2({ savedCase: reordered }), /Created by<\/span><strong>Sam</);
  assert.match(addV2({ savedCase: savedV2({ internalHistory: [] }) }), /Created by<\/span><strong>The office</);
  assert.match(
    addV2({ savedCase: savedV2({ internalHistory: [{ actorPersonId: null, createdAt: "2026-10-01T15:00:00.000Z" }] }) }),
    /Created by<\/span><strong>The office</,
  );
});

test("the Documents accordion: office cards, marked only once the draft is saved", () => {
  const answers = V2_SAMPLE();
  const closed = addV2({ draftAnswers: answers });
  assert.doesNotMatch(subOf(closed, "documents"), /doc-card/);
  const statusNone = statusOf(closed, "documents");
  assert.equal(statusNone[1], "none");

  const before = addV2({ draftAnswers: answers, openAddSubsteps: ["documents"] });
  const docs = subOf(before, "documents");
  assert.match(docs, /<div id="add-sub-documents-body" class="add-sub-body"><p[^>]*>Save the draft first to mark documents\.<\/p>/);
  for (const title of ["Identity", "Income forms", "Health and other events", "Other documents"])
    assert.match(docs, new RegExp(`<h4[^>]*>${title}</h4>`), title);
  const w2 = docCardOf(docs, "w2.household");
  assert.ok(w2, "the W-2 card");
  assert.match(w2, /data-action="mark-card" data-slot="w2\.household" data-status="later" disabled>Later<\/button>/);
  assert.match(w2, /data-status="none" disabled>Don&#39;t have<\/button>/);
  assert.match(w2, /<p class="doc-why">Asked by: /);
  assert.doesNotMatch(w2, /<p class="doc-why">[^<]*You (said|wrote)/);
  assert.match(w2, /Uploads come later\. Mark what the client will send later or doesn&#39;t have\./);
  assert.doesNotMatch(w2, /data-action="go-substep"/);

  const saved = addV2({ draftAnswers: answers, savedCase: savedV2(), openAddSubsteps: ["documents"] });
  const open = subOf(saved, "documents");
  assert.doesNotMatch(open, /Save the draft first/);
  assert.match(docCardOf(open, "w2.household"), /data-status="later">Later<\/button>/);
  for (const flag of [{ busy: true }, { officeSaving: true }])
    assert.match(
      docCardOf(subOf(addV2({ draftAnswers: answers, savedCase: savedV2(), openAddSubsteps: ["documents"], ...flag }), "documents"), "w2.household"),
      /data-status="later" disabled>/,
      JSON.stringify(flag),
    );
  // Same-day: still every card in full, with its marks.
  const sameDay = subOf(
    addV2({ draftAnswers: { ...answers, service: "same_day" }, savedCase: savedV2(), openAddSubsteps: ["documents"] }),
    "documents",
  );
  assert.match(docCardOf(sameDay, "w2.household"), /data-status="later">Later<\/button>/);
  assert.doesNotMatch(sameDay, /bring-list/);
});

test("the count of parts, the part statuses and the missing notes", () => {
  const answers = withoutIds(V2_SAMPLE(), "addr_city");
  const html = addV2({ draftAnswers: answers, openAddSubsteps: [] });
  assert.match(html, /<p id="add-case-count"[^>]* tabindex="-1">1 part still needs answers<\/p>/);
  assert.deepEqual([...statusOf(html, "about.address")].slice(1), ["needs", "Needs answers"]);
  for (const id of ALL_PARTS().filter((part) => part !== "about.address"))
    assert.deepEqual([...statusOf(html, id)].slice(1), ["none", ""], id);
  const open = addV2({ draftAnswers: answers, openAddSubsteps: ["about.address"] });
  assert.deepEqual([...statusOf(open, "about.address")].slice(1), ["needs", "Needs answers"]);
  // The note says "Needs an answer" only after a refused Send.
  assert.match(open, /<p id="field-office-addr_city-note" class="q-note" aria-live="polite"><\/p>/);
  const shown = addV2({ draftAnswers: answers, openAddSubsteps: ["about.address"], addCaseShowMissing: true });
  assert.match(shown, /<p id="field-office-addr_city-note" class="q-note is-missing" aria-live="polite">Needs an answer<\/p>/);
  // Two parts; then an invalid answer counts too.
  assert.match(addV2({ draftAnswers: withoutIds(answers, "tp_first_name") }), /2 parts still need answers/);
  assert.match(addV2({ draftAnswers: { ...V2_SAMPLE(), addr_zip: "12" } }), /1 part still needs answers/);
  assert.match(addV2({ draftAnswers: V2_SAMPLE() }), /<p id="add-case-count"[^>]*>Every part is answered<\/p>/);
});

test("the bottom bar: Cancel, Save draft, the confirmation and Send", () => {
  const answers = withoutIds(V2_SAMPLE(), "addr_city");
  const html = addV2({ draftAnswers: answers });
  const bar = html.slice(html.indexOf('<div class="add-case-bar">'));
  assert.match(bar, /<button type="button" class="btn text" data-action="open-board"[^>]*>Cancel<\/button>/);
  assert.match(bar, /<label class="checkbox-row" for="field-confirmed"><input type="checkbox" id="field-confirmed" name="confirmed"\s*><span>I have checked these answers with the client<\/span><\/label>/);
  assert.match(bar, /This confirms the answers on screen\. It is not a signature on a tax or consent form\./);
  assert.doesNotMatch(bar, /data-q=/);
  assert.doesNotMatch(bar, /type="submit"/);
  assert.match(sendOf(html), /type="button"/);
  assert.match(sendOf(html), /data-action="send-office-draft"/);
  assert.match(sendOf(html), / disabled/, "unticked");
  // Ticked: enabled even with a missing answer (option a).
  const ticked = addV2({ draftAnswers: answers, openPanels: ["confirmed"] });
  assert.match(ticked, /id="field-confirmed" name="confirmed" checked>/);
  assert.doesNotMatch(sendOf(ticked), /disabled/);
  assert.match(ticked, />Send to the office<\/button>/);
  assert.doesNotMatch(saveOf(ticked), /disabled/);
  assert.match(saveOf(ticked), /type="button"/);
  for (const flag of [{ busy: true }, { officeSaving: true }]) {
    const off = addV2({ draftAnswers: answers, openPanels: ["confirmed"], ...flag });
    assert.match(sendOf(off), /disabled/, JSON.stringify(flag));
    assert.match(saveOf(off), /disabled/, JSON.stringify(flag));
  }
  // Typing during a save is kept, so the fields stay on.
  assert.doesNotMatch(formOf(addV2({ draftAnswers: answers, officeSaving: true, openAddSubsteps: ["about.address"] })), /<input[^>]*data-control[^>]* disabled/);
  assert.match(html, /data-action="fill-assisted-intake"/);
});

test("the version-2 Add a case refuses a persona without the right", () => {
  const refused = addV2({ person: { id: "p-al", name: "Alex", capabilities: ["prepare"] } });
  assert.match(refused, /staff-reason/);
  assert.doesNotMatch(refused, /<form/);
  assert.match(refused, /fill-assisted-intake/);
  assert.match(addV2({ person: null }), /Choose a volunteer persona to act as\./);
});

// Fix round 1 (I1): a conflict on a saved office draft shows the shared choice
// under the header, and the document marks wait for it, as the client's do.
test("a conflict on a saved office draft shows the reconcile panel and holds the marks", () => {
  const answers = V2_SAMPLE();
  const conflict = { code: "REMOTE_CHANGED", baseRevision: 4, serverRevision: 5 };
  const record = savedV2({ revision: 5, answers: { ...withoutIds(answers, "tp_phone", "best_contact_time", "best_contact_note"), tp_first_name: "Lan" } });
  const html = addV2({ draftAnswers: answers, savedCase: record, conflict, openAddSubsteps: ["documents"], dirty: true, saveState: "unsaved" });
  const meta = html.indexOf('<div class="application-meta">');
  const panel = html.indexOf('<section class="panel conflict-panel"');
  assert.ok(meta >= 0 && panel > meta, "the panel follows the header");
  assert.ok(panel < html.indexOf('<form id="add-case-v2-form"'), "and comes before the form");
  assert.match(html, /data-action="reconcile-mine"/);
  assert.match(html, /data-action="reconcile-server"/);
  assert.match(html, /<th scope="row">[^<]*<\/th><td>Mei<\/td><td>Lan<\/td>/);
  assert.match(docCardOf(subOf(html, "documents"), "w2.household"), /data-status="later" disabled>/);
  // No conflict: no panel, and the marks are on.
  const calm = addV2({ draftAnswers: answers, savedCase: savedV2(), openAddSubsteps: ["documents"] });
  assert.doesNotMatch(calm, /conflict-panel/);
  assert.match(docCardOf(subOf(calm, "documents"), "w2.household"), /data-status="later">/);
});
