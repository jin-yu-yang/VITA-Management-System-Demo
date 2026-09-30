import test from "node:test";
import assert from "node:assert/strict";
import { POOL_STAGES, poolPhase, poolFilters, filterPool, poolCounts, renderCasePool } from "../src/pool-views.mjs";
import { describeStage } from "../src/domain.mjs";

test("every stage lands on exactly one pool phase", () => {
  const expected = {
    draft: "intake", received: "intake",
    preparation_ready: "available", preparing: "preparation", corrections_required: "preparation",
    review_ready: "review", reviewing: "review",
    review_approved: "done", closed: "closed",
  };
  assert.deepEqual(POOL_STAGES, Object.keys(expected));
  for (const [stage, phase] of Object.entries(expected))
    assert.equal(poolPhase({ stage, preparerId: null }), phase, stage);
  assert.equal(poolPhase({ stage: "preparation_ready", preparerId: "p1" }), "preparation");
  assert.equal(poolPhase({ stage: "made_up" }), null);
  for (const stage of POOL_STAGES) assert.notEqual(describeStage(stage).label, "Application");
});

test("unknown saved values fall back to All, and volunteer keys are ignored", () => {
  const chosen = poolFilters({ poolPhase: "mine", poolStage: "made_up", status: "review" });
  assert.equal(chosen.poolPhase, "all");
  assert.equal(chosen.poolStage, "all");
  assert.equal("status" in chosen, false);
});

test("prepared by and reviewed by match a person, or nobody", () => {
  const cases = [
    { id: "1", stage: "preparing", preparerId: "p-alex", answers: {} },
    { id: "2", stage: "preparation_ready", preparerId: null, answers: {} },
  ];
  assert.deepEqual(filterPool(cases, poolFilters({ poolPreparer: "unassigned" })).map((c) => c.id), ["2"]);
  assert.deepEqual(filterPool(cases, poolFilters({ poolPreparer: "p-alex" })).map((c) => c.id), ["1"]);
});

test("tab counts respect the other filters but not the tab", () => {
  const cases = [
    { id: "1", stage: "received", answers: { language: "Mandarin" } },
    { id: "2", stage: "closed", answers: { language: "English" } },
    { id: "3", stage: "draft", answers: { language: "Mandarin" } },
  ];
  const counts = poolCounts(cases, poolFilters({ poolPhase: "closed", poolLanguage: "Mandarin" }));
  assert.equal(counts.all, 2);
  assert.equal(counts.intake, 2);
  assert.equal(counts.closed, 0);
});

// ---------------------------------------------------------------------------
// The renderer
// ---------------------------------------------------------------------------

const NOW = Date.parse("2026-03-10T12:00:00Z");
const PEOPLE = [
  { id: "p-alex", name: "Alex" },
  { id: "p-sam", name: "Sam" },
];
const rec = (id, stage, extra = {}) => ({
  id,
  reference: `VT-${id}`,
  stage,
  answers: { language: "English", service: "Federal return" },
  preparerId: null,
  reviewerId: null,
  preparerName: null,
  reviewerName: null,
  updatedAt: "2026-03-09T10:00:00Z",
  ...extra,
});
const CASES = [
  rec("A", "received", { updatedAt: "2026-03-01T10:00:00Z" }),
  rec("B", "preparing", { preparerId: "p-alex", preparerName: "Alex", updatedAt: "2026-03-09T10:00:00Z" }),
  rec("C", "review_ready", { reviewerId: "p-sam", reviewerName: "Sam", answers: { language: "Mandarin", service: "State return" }, updatedAt: "2026-03-05T10:00:00Z" }),
  rec("D", "closed"),
  rec("E", "preparation_ready"),
];
const render = (filters = {}, cases = CASES) =>
  renderCasePool(cases, PEOPLE, { filters, now: NOW });

test("the pool shows seven phase tabs with counts and pressed state", () => {
  const html = render({ poolPhase: "review" });
  assert.match(html, /role="group" aria-label="Case phase"/);
  const tabs = html.match(/<button[^>]*data-filter="poolPhase"[^>]*>/g) ?? [];
  assert.equal(tabs.length, 7);
  for (const tab of tabs) assert.match(tab, /data-action="set-board-filter"/);
  assert.match(html, /data-value="review"[^>]*aria-pressed="true"/);
  assert.match(html, /data-value="all"[^>]*aria-pressed="false"/);
  assert.match(html, /data-value="all"[^>]*>All cases <span class="count">5<\/span><\/button>/);
});

test("five filter dropdowns each have a label and no blank choice", () => {
  const html = render({ poolPreparer: "p-alex" });
  const selects = [...html.matchAll(/<select[^>]*data-board-filter="(\w+)"[^>]*>(.*?)<\/select>/g)];
  assert.deepEqual(selects.map((m) => m[1]), ["poolStage", "poolLanguage", "poolService", "poolPreparer", "poolReviewer"]);
  for (const [, key, options] of selects) {
    assert.match(html, new RegExp(`<label[^>]*for="field-${key}"`));
    assert.doesNotMatch(options, /Select an option/);
    assert.doesNotMatch(options, /value=""/);
  }
  assert.doesNotMatch(html, /<select[^>]*\sname=/);
  const options = Object.fromEntries(selects.map((m) => [m[1], [...m[2].matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)].map((o) => [o[1], o[2]])]));
  assert.deepEqual(options.poolStage[0], ["all", "Any stage"]);
  assert.deepEqual(options.poolStage.slice(1).map((o) => o[1]), POOL_STAGES.map((s) => describeStage(s).label));
  assert.deepEqual(options.poolLanguage, [["all", "Any language"], ["English", "English"], ["Mandarin", "Mandarin"]]);
  assert.equal(options.poolService[0][1], "Any service");
  assert.deepEqual(options.poolPreparer, [["all", "Anyone"], ["unassigned", "Unassigned"], ["p-alex", "Alex"], ["p-sam", "Sam"]]);
  assert.deepEqual(options.poolReviewer.slice(0, 2), [["all", "Anyone"], ["unassigned", "Unassigned"]]);
  assert.match(html, /<option value="p-alex" selected>/);
});

test("a row shows the reference, stage, phase, people and how long ago", () => {
  const html = render({}, [CASES[1], CASES[2]]);
  assert.match(html, /<tr class="pool-row">/);
  assert.match(html, /<button class="board-reference" data-action="open-case" data-case-id="B">VT-B<\/button>/);
  assert.match(html, /class="pool-phase">Waiting for preparation</);
  assert.match(html, /class="pool-phase">Waiting for review</);
  assert.match(html, /Mandarin/);
  assert.match(html, /State return/);
  assert.match(html, /Alex/);
  assert.match(html, /Unassigned/);
  assert.match(html, /Yesterday/);
  assert.match(html, /5 days ago/);
  assert.match(html, /class="badge/);
});

test("rows are newest first", () => {
  const html = render();
  const order = [...html.matchAll(/data-case-id="(\w)"/g)].map((m) => m[1]);
  const dates = { A: "2026-03-01", B: "2026-03-09", C: "2026-03-05", D: "2026-03-09", E: "2026-03-09" };
  const times = order.map((id) => dates[id]);
  assert.deepEqual(times, [...times].sort().reverse());
  assert.equal(order[order.length - 1], "A");
});

test("the count line and the clear-filters control", () => {
  const narrowed = render({ poolLanguage: "Mandarin", poolPhase: "review" });
  assert.match(narrowed, /<span[^>]*role="status"[^>]*>Showing 1 of 5 cases<\/span>/);
  assert.match(narrowed, /data-action="clear-pool-filters"[^>]*>Clear filters</);
  assert.doesNotMatch(narrowed, /No filters\./);
  const plain = render({ poolPhase: "review" });
  assert.match(plain, /No filters\. Showing every case this season\./);
  assert.doesNotMatch(plain, /clear-pool-filters/);
});

test("no matching case is an empty state", () => {
  const html = render({ poolLanguage: "Mandarin", poolPhase: "closed" });
  assert.match(html, /class="empty-state"[^>]*>[\s\S]*No case matches these filters\./);
  assert.doesNotMatch(html, /<tr class="pool-row"/);
});

test("version-2 codes and version-1 labels read and filter as one", () => {
  const cases = [
    rec("X", "received", { answers: { language: "cantonese", service: "drop_off" } }),
    rec("Y", "received", { answers: { language: "Cantonese", service: "Drop-off" } }),
    rec("Z", "received", { answers: { language: "english", service: "online" } }),
  ];
  const html = render({}, cases);
  assert.doesNotMatch(html, /drop_off|cantonese|online<|english</);
  const opts = (key) => [...html.match(new RegExp(`data-board-filter="${key}"[^>]*>(.*?)</select>`))[1].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(opts("poolLanguage"), ["all", "Cantonese", "English"]);
  assert.deepEqual(opts("poolService"), ["all", "Drop-off", "Online"]);
  const narrowed = render({ poolService: "Drop-off", poolLanguage: "Cantonese" }, cases);
  assert.match(narrowed, /VT-X/);
  assert.match(narrowed, /VT-Y/);
  assert.doesNotMatch(narrowed, /VT-Z/);
});

test("references and languages are escaped, and the footnote says what is not shown", () => {
  const html = render({}, [rec("X", "received", { reference: "<script>x</script>", answers: { language: "<script>y</script>", service: "s" } })]);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;x/);
  assert.match(html, /&lt;script&gt;y/);
  assert.match(html, /<section class="panel case-pool" aria-labelledby="pool-title"><h2 id="pool-title">All cases<\/h2>/);
  assert.match(html, /class="board-table pool-table"/);
  assert.match(html, /This pool shows workflow only: no taxpayer names, no addresses and no document contents\./);
});

test("the pool's first column is the client number, before the reference", () => {
  const html = render({}, [rec("N", "received", { clientNumber: 93, season: 2025 })]);
  assert.match(html, /<th scope="col">Client<\/th>/);
  assert.match(html, /<span class="client-number">#093<\/span><button class="board-reference"/);
});
