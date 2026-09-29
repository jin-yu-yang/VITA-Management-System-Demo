# Restyle PR 4: the office screens

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the office persona's screens on today's data:
- **Follow-ups.** Office work becomes one "Office queue" table: intake checks, unclaimed work, clients to call and help requests, most urgent first.
- **Log a call drawer.** It records `RECORD_CONTACT` and `RESOLVE_FOLLOWUP` from the queue. The same drawer resolves a help request.
- **Add a case.** A page of its own replaces the inline assisted-intake form.
- **All cases.** A new case pool with phase tabs and filters.
- **Presenter dialogs.** The reset and checkpoint dialogs are restyled.

**Architecture:** Restyle in place, as in PRs 1–3.
- Two new renderer files keep `admin-views.mjs` (1,074 lines) from growing:
  - `src/office-views.mjs`: the Follow-ups page, the drawer bodies and the Add a case page.
  - `src/pool-views.mjs`: the case pool.
- `admin-views.mjs` keeps `adminEligibility` and the office case page, and loses the old board.
- Two new staff screens join `STAFF_SCREENS`: `office-cases` and `office-add-case`.
- The drawer is the existing modal frame with a `drawer` class, so it inherits the focus trap, Escape and focus return.
- No database change and no store change.

**Tech Stack:**
- Vanilla ES modules rendering HTML strings, and hand-written `src/styles.css`.
- `node:test` for unit tests.
- Playwright browser suites, and database suites against the repo's local Supabase test stack.

**Spec:** `docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md`, sections 4 (staff frame, shared elements), 8 (PR 4) and 9 (testing, acceptance, accessibility).

**Design references:**
- `docs/design/screens/admin-followups-full-page.png`: Follow-ups
- `docs/design/screens/admin-work-board-full-page.png`: the case pool
- `docs/design/screens/add-case-v6-full-page.png`: Add a case

They show later parts' data: client numbers, labels, best time to reach, location, phone, groups and pins. Apply their layout, table and type treatment to the fields that exist today. The "before" capture for comparison is `.stitch/captures/` (the office board, if present).

## Global Constraints

- Part 1 changes no database schema, adds no store call and adds no intake question or answer key.
- `npm test`, `npm run test:database`, `npm run test:auth-browser` and `npm run test:browser` pass.
  - The last three run against the repo's local test stack, the Docker Supabase `vitally-task2.M5anE7XP` on port 54321 (`.env.test`). Start it with `docker start $(docker ps -aq --filter name=vitally-task2)`.
  - Never run `npx supabase start` from the repository root.
- Shell PATH: prefix node, npm and docker commands with `PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`. Without it the shell may use Node 18, and `test:database` fails with `TARGET_REJECTED` if Docker isn't on PATH.
- **Hooks that must survive.** The browser suite reaches the office through these; keep them:
  - `open-board` goes to the office's first screen.
  - `button.board-reference[data-action="open-case"]` with the Application ID as its text is on every queue and pool row that has a case (`openCaseByReference`).
  - `fill-assisted-intake`, `#assisted-intake-form`, `#field-assisted-<key>` for every intake key, and `#assisted-intake-form button[type="submit"]`.
  - The office case page and its Follow-up tab, unchanged: "Follow-up with the client", "What happened", "Note for the office", "How it ended", "What the office concluded", and the `RECORD_CONTACT` / `RESOLVE_FOLLOWUP` case actions with `data-followup-id`.
  - `open-reset-fixtures`, `confirm-reset-fixtures`, `open-checkpoint`, `#checkpoint-form`, `.modal`, `[data-role="fixture-indicator"]`.
  - `data-assistance-action="CLAIM"|"RESOLVE"` with `data-item-id`.
- **Hooks that change on purpose.** Tests change to match:
  - `OFFICE_BOARD_HEADING` in `tests/support/story-pages.mjs` becomes `"Office queue"`.
  - The "arrived" row selector becomes `tr.queue-row[data-kind="intake"]`.
  - `toggle-assisted-intake` is gone; `open-add-case` opens the Add a case page.
- **Filters.**
  - Queue and pool filters live in the same `state.boardFilters` object under their own keys. The queue uses `officeKind`, plus the existing shared `language`. The pool uses `poolPhase`, `poolStage`, `poolLanguage`, `poolService`, `poolPreparer` and `poolReviewer`.
  - The volunteer board's keys (`status`, `assignment`, `service`, `search`) are never written by an office screen. `boardFilters()` would reset an unknown `status` value to `available`, so sharing a key would silently break the volunteer board.
- Colors come from the `--vt-*` tokens. Add no new hex values in rules this plan writes; white `#fff` is allowed. Staff controls are at least `var(--vt-tap)` (44px) tall, except inline text links.
- Any rule that gives an element with a `hidden` attribute a `display` must be paired with `[hidden] { display: none; }`.
- **Scope new CSS to the new containers.** Use `.office-queue`, `.office-drawer`, `.add-case`, `.case-pool` and `.modal`. Don't change a shared rule (`.board-table`, `.chip`, `.tab`, `.info-note`, `.modal`) at its base unless the change is meant for every screen that uses it. The re-review of PR 3 caught exactly this: an unscoped margin leaked into a staff notice.
- Only fictional data. The logo is the unchanged `src/pcdc-logo.png`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Test imports.** A test file that imports a name its module doesn't export fails to load as a whole: `node --test` reports one failed file and runs none of its tests. So a test file imports a name only in the step that writes its first test, and when a "failing" step adds an import, the expected failure is the whole file. Never report "the other tests pass" from a run where the file didn't load.

**Out of scope, and why:**
- **Best time to reach, location, phone reveal, client numbers, labels, groups and pins.** Their data doesn't exist yet (parts 2–5). The queue shows the assistance item's contact preference where there is one.
- **The "Waiting on client" and "Ready to close" queue kinds.** They need part 3's stages.
- **A pool search box.** Spec §8 lists tabs and filters only. The Follow-ups page and any case page still reach a case by its Application ID button. Flag it to the user if the design review wants it.
- **Mobile layouts** (D12). Pages must still not scroll sideways at 390px.

---

## File map

| File | Change |
|---|---|
| `src/office-views.mjs` (new) | Queue model (`followupQueue`, `officeFilters`, `queueCounts`, `waitingDays`), `renderFollowups`, `logCallDrawerBody`, `resolveHelpDrawerBody`, `renderAddCase`. It imports `ASSISTED_OPTIONS`, `answerField` and `OFFICE_NOTE` from `admin-views.mjs`; the office case page uses them too. Imports only go office-views → admin-views, never back. |
| `src/pool-views.mjs` (new) | `POOL_TABS`, `POOL_STAGES`, `poolPhase`, `poolFilters`, `filterPool`, `poolCounts`, `POOL_FILTER_KEYS`, `renderCasePool` |
| `src/admin-views.mjs` | Delete the old board (`renderAdminBoard` and its cards, `assistedIntakePanel`, `assistedIntakeForm`, `ASSISTED_OPTIONS`, `answerField`, `countLine`). Export `openFollowups`, `openFollowupCount`, `remindedNote` and a new `followupForms(record, task, person, ui)`, which `followupTask` now uses. |
| `src/views.mjs` | `staffSidebar` office nav (Follow-ups, All cases); `staffScreen` routes the office screens and passes header actions; `dialog()` renders the drawer variant and the presenter overline |
| `src/controller.mjs` | `STAFF_SCREENS` gains `office-cases`, `office-add-case`; `openDialog(name, context)` / `state.dialogContext`; `clearBoardFilters(keys)` |
| `src/app.mjs` | Actions `open-cases`, `open-add-case`, `open-log-call`, `open-resolve-help`, `clear-pool-filters`; the pool's select change handler; drawer close after a resolve; row-exact focus return; `select` in the focus trap |
| `src/styles.css` | Office queue, kind pills, waiting tones, drawer, Add a case, pool, presenter dialogs, `.modal .info-note`; delete the old board card rules nothing uses |
| Tests | new `tests/office-views.test.mjs`, new `tests/pool-views.test.mjs`; `tests/admin-views.test.mjs` (board tests move out), `tests/controller.test.mjs`, `tests/shell.test.mjs`, `tests/presenter.test.mjs`; `tests/browser.mjs`, `tests/support/story-pages.mjs` |

---

### Task 1: The Follow-ups page

**Files:**
- Create: `src/office-views.mjs`, `tests/office-views.test.mjs`
- Modify: `src/admin-views.mjs`, `src/views.mjs`, `tests/admin-views.test.mjs`, `tests/shell.test.mjs`

**Interfaces:**
- Consumes:
  - From `admin-views.mjs`: `adminEligibility`, and after this task's exports, `openFollowupCount`, `remindedNote`.
  - From `staff-views.mjs`: `when`, `named`, `explain`, `detailRow`, `stageWork`, `isAvailableWork`, `boardFilters`, `CHOOSE_PERSONA`, `UNKNOWN_PERSON`.
  - From `ui.mjs`: `esc`, `icon`, `button`, `caseButton`, `stageBadge`.
- Produces:
  - `QUEUE_KINDS` (`[[value, label], …]` for `intake`, `call`, `help`, `unclaimed`).
  - `waitingDays(value, now) → number|null` and `waitingLabel(days) → string`.
  - `followupQueue(cases, assistance, now) → Row[]`, where `Row = {kind, record|null, item|null, draft:boolean, days:number|null}`.
  - `officeFilters(filters) → {kind, language}` and `queueCounts(rows, chosen) → {all, intake, call, help, unclaimed}`.
  - `renderFollowups(cases, assistance, ui)`, where `ui = {person, filters, busy, now}`.
  - Heading `h2#office-queue-title` with `tabindex="-1"` and the text "Office queue".

- [ ] **Step 1: Export the helpers the queue needs from `admin-views.mjs`.** Change `const openFollowups`, `const openFollowupCount` and `const remindedNote` to `export const`. Add, and use from `followupTask`:

```js
// The two forms an assignee uses on an open task: record an attempt, then
// resolve it. Shared by the case page's Follow-up tab and the office queue's
// Log a call drawer, so the two can never ask for different things.
export function followupForms(record, task, person, ui = {}) {
  const busy = ui.busy ? "disabled" : "";
  const rights = adminEligibility({ caseRecord: record, followup: task }, person);
  if (!rights.recordContact.allowed) return explain(rights.recordContact);
  const contactScope = `contact-${task?.id ?? "task"}`;
  const resolveScope = `resolve-${task?.id ?? "task"}`;
  const hidden = `<input type="hidden" name="followupId" value="${esc(task?.id ?? "")}">`;
  return `<form class="staff-form"><h4>Record a call</h4>…</form><form class="staff-form"><h4>Resolve this task</h4>…</form>`;
}
```

  The two `…` are the bodies of today's two forms in `followupTask` (`src/admin-views.mjs`, the `forms` constant). Cut them from there character for character, including the hidden input, field scopes and field notes. Don't retype them.

  Move the two `<form>` strings out of `followupTask` unchanged; `followupTask` then does `${when(task?.status === "open", followupForms(record, task, person, ui))}`. Run `npm test`: the admin case-page tests still pass unchanged. This is a pure refactor.

- [ ] **Step 2: Write the failing queue-model tests** in `tests/office-views.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  followupQueue,
  officeFilters,
  queueCounts,
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
```

- [ ] **Step 3: Run it to confirm it fails.**
  ```bash
  node --test tests/office-views.test.mjs
  ```
  Expected: FAIL, "Cannot find module".

- [ ] **Step 4: Write the model in `src/office-views.mjs`.** Open the file with a header comment in the style of `admin-views.mjs`: pure functions, the four DOM conventions, and nothing here sends a message.

```js
export const QUEUE_KINDS = Object.freeze([
  ["intake", "Intake checks"],
  ["call", "Call the client"],
  ["help", "Help request"],
  ["unclaimed", "Unclaimed work"],
]);
const KIND_VALUES = Object.freeze(QUEUE_KINDS.map(([value]) => value));
const KIND_ICONS = Object.freeze({ intake: "shield", call: "phone", help: "help", unclaimed: "user" });

const calendarDay = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
export function waitingDays(value, now = Date.now()) {
  const at = new Date(value ?? "");
  if (Number.isNaN(at.getTime())) return null;
  return Math.max(0, Math.round((calendarDay(new Date(now)) - calendarDay(at)) / 86_400_000));
}
export const waitingLabel = (days) =>
  days === null || days === undefined ? "—" : days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`;
// Amber at three days, red at five (the design's rule). The words carry the
// same fact, so the color is never the only signal.
const waitingTone = (days) => (days >= 5 ? "late" : days >= 3 ? "aging" : "");

export function followupQueue(cases = [], assistance = [], now = Date.now()) {
  const records = Array.isArray(cases) ? cases : [];
  const rows = [];
  for (const record of records) {
    if (record?.stage === "received" && !record?.intakeVerified)
      rows.push({ kind: "intake", record, item: null, draft: false, since: record.updatedAt });
    else if (record?.stage === "draft" && record?.ownerUserId === null)
      rows.push({ kind: "intake", record, item: null, draft: true, since: record.updatedAt });
    if (isAvailableWork(record))
      rows.push({ kind: "unclaimed", record, item: null, draft: false, since: record.updatedAt });
    if (openFollowupCount(record))
      rows.push({ kind: "call", record, item: null, draft: false, since: record.updatedAt });
  }
  for (const item of Array.isArray(assistance) ? assistance : [])
    if (item?.status === "open" || item?.status === "assigned")
      rows.push({
        kind: "help",
        record: records.find((record) => record?.id === item?.caseId) ?? null,
        item,
        draft: false,
        since: item.createdAt,
      });
  return rows
    .map(({ since, ...row }) => ({ ...row, days: waitingDays(since, now) }))
    .sort(
      (a, b) =>
        (b.days ?? -1) - (a.days ?? -1) ||
        KIND_VALUES.indexOf(a.kind) - KIND_VALUES.indexOf(b.kind) ||
        String(a.record?.reference ?? "").localeCompare(String(b.record?.reference ?? "")),
    );
}

export function officeFilters(filters) {
  const kind = String(filters?.officeKind ?? "");
  return {
    kind: KIND_VALUES.includes(kind) ? kind : "all",
    language: boardFilters(filters).language,
  };
}

const rowLanguage = (row) => row.record?.answers?.language || row.item?.language || "";
const inLanguage = (row, chosen) => chosen.language === "all" || rowLanguage(row) === chosen.language;

export function queueCounts(rows, chosen) {
  const inScope = rows.filter((row) => inLanguage(row, chosen));
  return Object.fromEntries([
    ["all", inScope.length],
    ...KIND_VALUES.map((kind) => [kind, inScope.filter((row) => row.kind === kind).length]),
  ]);
}
```

  Resolved help requests leave the queue on purpose; the queue lists work still to do. The old board listed them; its test for that case moves to "offers no action", below.

- [ ] **Step 5: Run the model tests.** Expected: the four model tests PASS.

- [ ] **Step 6: Write the failing renderer tests.** First add `renderFollowups` to the file's import list. Until it exists, the whole file fails to load with `SyntaxError: … does not provide an export named 'renderFollowups'`, and none of its tests run, the model tests included. That is this step's expected failure. Then add these to `tests/office-views.test.mjs`. They carry over every behavior the old board tests in `tests/admin-views.test.mjs` checked; delete those old tests in the same commit:
  - "a case that has just arrived is reachable from the office board"
  - "an assisted draft the office has not sent is reachable too"
  - "the arrived section filters and escapes like the rest of the board"
  - "the board counts what each of its sections is showing"
  - "the language filter is the board's one stored choice"
  - "a reminder is offered on available work only, and says what it did not do"
  - "assistance cards offer the one action their status allows"
  - "an assistance item somebody else holds is refused, with the reason"
  - "a linked case is shown as a case, never as an assistance status"
  - "the assisted intake entry point opens a form that creates nothing by itself" (moves to Task 3)

  Write one test per behavior:
  1. **An intake row opens the case.** A `received` row is `tr.queue-row[data-kind="intake"]`. It contains `button.board-reference[data-action="open-case"][data-case-id="a"]` with the reference, and an "Record intake checks" `open-case` button. It has **no** `data-case-action`. An assisted draft's button reads "Finish and send".
  2. **Unclaimed rows.** Sam gets `data-case-action="REMIND"` with `data-case-id`. With a reminder on the record, the row says "No external message sent." A persona without the office roles gets the `staff-reason` explanation and no `REMIND`.
  3. **Call rows.** A call row has `data-action="open-log-call"` with `data-case-id`, and says how many tasks are open and who owes the call (from `followupAssigneeNames`).
  4. **Help rows.**
     - An `open` item has `data-assistance-action="CLAIM"` with `data-item-id`.
     - An `assigned` item held by Sam has `data-action="open-resolve-help"` with `data-item-id`.
     - An item held by someone else shows the refusal reason.
     - A linked case shows its own reference button and stage badge, never the assistance status as a stage.
  5. **Kind toggles.** Five toggles (All plus the four kinds) carry `data-action="set-board-filter" data-filter="officeKind"`, show counts and use `aria-pressed`, inside `role="group"` with `aria-label="Task type"`. Choosing `officeKind: "call"` shows only call rows.
  6. **Language chips.** They keep `data-filter="language"` (the shared key) and narrow the rows.
  7. **Waiting column.** A 6-day-old row renders "6 days" inside a cell with class `late`; a 3-day-old row gets `aging`.
  8. **Empty and read-only states.** An empty queue renders `.empty-state` with one sentence. With no persona, the page shows the `CHOOSE_PERSONA` note, and every action is refused with a reason, not missing.
  9. **Escaping.** A reference, title and language containing `<script>` render escaped.

- [ ] **Step 7: Write `renderFollowups`.** Structure:

```js
const KIND_LABELS = Object.freeze(Object.fromEntries(QUEUE_KINDS));

function needed(row) {
  const { kind, record, item } = row;
  if (kind === "intake")
    return esc(row.draft
      ? "The office started this one and has not sent it yet. Finish the answers and send it."
      : stageWork(record.stage).work);
  if (kind === "unclaimed") return `${esc(stageWork(record.stage).work)}${remindedNote(record)}`;
  if (kind === "call") {
    const n = openFollowupCount(record);
    const owed = record?.followupAssigneeNames ?? [];
    return `${esc(n)} open ${n === 1 ? "task" : "tasks"}${when(owed.length, ` · waiting on ${esc(owed.join(", "))}`)}`;
  }
  return `${esc(item?.title)}${when(item?.assigneeName, `<small>Helper: ${esc(item.assigneeName)}</small>`)}`;
}

function rowAction(row, person, ui) {
  const busy = ui.busy ? "disabled" : "";
  const { kind, record, item } = row;
  const id = esc(record?.id ?? "");
  if (kind === "intake")
    return button(`${icon("arrow")} ${row.draft ? "Finish and send" : "Record intake checks"}`, "open-case", "primary", `data-case-id="${id}"`);
  if (kind === "unclaimed") {
    const rights = adminEligibility({ caseRecord: record }, person);
    return rights.remind.allowed
      ? caseButton(`${icon("clock")} Send a reminder`, "REMIND", "secondary", `data-case-id="${id}" ${busy}`)
      : explain(rights.remind);
  }
  if (kind === "call")
    return button(`${icon("phone")} Log a call`, "open-log-call", "primary", `data-case-id="${id}" ${busy}`);
  const rights = adminEligibility({ item }, person);
  if (item?.status === "open")
    return rights.claimAssistance.allowed
      ? `<button type="button" class="btn primary" data-assistance-action="CLAIM" data-item-id="${esc(item.id)}" ${busy}>${icon("user")} Take this request</button>`
      : explain(rights.claimAssistance);
  return rights.resolveAssistance.allowed
    ? button(`${icon("check")} Record as resolved`, "open-resolve-help", "secondary", `data-item-id="${esc(item.id)}" ${busy}`)
    : explain(rights.resolveAssistance);
}

function queueRow(row, person, ui) {
  const { kind, record, item } = row;
  // A help request can name a case this window's list doesn't hold; say so
  // rather than claiming there is no case.
  const client = record
    ? `<button class="board-reference" data-action="open-case" data-case-id="${esc(record.id)}">${esc(record.reference ?? "This case")}</button>${stageBadge(record.stage)}`
    : item?.caseId
      ? '<span class="muted">A case in this workspace</span>'
      : '<span class="muted">No case yet</span>';
  return `<tr class="queue-row" data-kind="${kind}"><td><span class="kind-pill ${kind}">${icon(KIND_ICONS[kind])} ${esc(KIND_LABELS[kind])}</span></td><th scope="row">${client}</th><td class="queue-needed">${needed(row)}</td><td>${esc(rowLanguage(row) || "—")}</td><td>${esc(item?.contactPreference || "—")}</td><td class="queue-waiting ${waitingTone(row.days)}">${esc(waitingLabel(row.days))}</td><td class="queue-action">${rowAction(row, person, ui)}</td></tr>`;
}
```

  `renderFollowups(cases, assistance, ui)` returns:
  - **Panel.** `<section class="panel office-queue" aria-labelledby="office-queue-title">`.
  - **Head.**
    - `<h2 id="office-queue-title" tabindex="-1">Office queue</h2>` plus `<span class="muted small">most urgent first</span>`.
    - On the right, `<span class="muted small" role="status">${counts.all} open · ${over3} over 3 days</span>`, where `over3` counts rows with `days >= 3` in the language scope.
  - **Kind toggles.** `role="group" aria-label="Task type"` toggles built like `boardTabs` in `staff-views.mjs`: class `chip`/`chip selected`, a `.tab-count` span, and `aria-pressed`. `All` comes first.
  - **Language chips.** Built like today's office board language chips (`data-filter="language"`), from the languages on the rows.
  - **Persona note.** The `CHOOSE_PERSONA` note when `!ui.person`.
  - **Table.** `<div class="board-table-wrap"><table class="board-table queue-table">` with headers Task, Client, What's needed, Language, Contact preference, Waiting, and a visually hidden "Action". The rows are filtered by kind and language. When nothing is left, `<div class="empty-state">` with `icon("check")` and one sentence:
    - No filter on: "Nothing is waiting on the office right now."
    - A kind or language filter on: "Nothing here matches these filters.", plus `button("Show everything", "set-board-filter", "secondary", 'data-filter="officeKind" data-value="all"')`. Don't use `clear-board-filters`: it would also wipe the volunteer board's saved choices.
  - **Footnote.** `<p class="field-note board-note">`: "Waiting turns amber at 3 days and red at 5. This queue shows workflow only: no taxpayer names, no addresses and no document contents."

- [ ] **Step 8: Route it.** In `src/views.mjs`:
  - Import `renderFollowups` from `./office-views.mjs` and drop the `renderAdminBoard` import.
  - The office board branch calls `renderFollowups(cases, assistance, { person, filters: state.boardFilters, busy: state.busy, now: Date.now() })`.
  - Change the frame's words to overline `OFFICE`, title `Follow-ups`, intro "Everything waiting on the office, most urgent first.".
  - Give `frame()` a sixth parameter `actions = ""`, rendered as `<div class="page-actions">${actions}</div>` inside `.page-intro`. For the office pages, pass `const addCaseAction = button(\`${icon("plus")} Add a case\`, "open-add-case", "primary");`, defined once at the top of `staffScreen`; Task 4 passes it to the pool page too. The action is wired in Task 3; until then the click is a no-op in `runNavigation`'s `default`.
  - In `staffSidebar`, the office label becomes `Follow-ups`.

- [ ] **Step 9: Delete the old board from `admin-views.mjs`.** Remove:
  - `renderAdminBoard` and its cards: `boardCard`, `availableCard`, `arrivedCard`, `followupCard`, `assistanceCard`
  - `countLine`, `ASSISTANCE_STATUS`, `ASSISTANCE_TONE`

  Keep `assistedIntakePanel`, `assistedIntakeForm`, `ASSISTED_OPTIONS` and `answerField` for now; Task 3 moves them. Use `grep -n` to confirm nothing else imports what you delete.

- [ ] **Step 10: Update the tests that named the old board.**
  - In `tests/shell.test.mjs:53`, `/Office work/` becomes `/Follow-ups/`.
  - In `tests/admin-views.test.mjs`, "the persona decides which workspace a presenter is in" (around line 1024) asserts four things about Sam's board that change: `OFFICE WORKSPACE`, `Office work</h2>`, `Assistance requests`, and `<span>Helper</span><strong>Sam</strong>`. Replace them with:
    - `/>OFFICE</` for the overline
    - `/Office queue<\/h2>/`
    - the help row `/data-kind="help"/`
    - `/Helper: Sam/`, so the helper is still named, not shown as an id

    The Alex half keeps asserting `Work board</h2>`, and now also `doesNotMatch(/Office queue/)`.
  - Run `npm test`. Expected: PASS.

- [ ] **Step 11: Commit.**

```bash
git add src/office-views.mjs src/admin-views.mjs src/views.mjs tests/office-views.test.mjs tests/admin-views.test.mjs tests/shell.test.mjs
git commit -m "Turn Office work into the Follow-ups queue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The Log a call drawer (and resolving a help request)

**Files:**
- Modify: `src/controller.mjs`, `src/app.mjs`, `src/views.mjs`, `src/office-views.mjs`
- Test: `tests/controller.test.mjs`, `tests/office-views.test.mjs`, `tests/shell.test.mjs`

**Interfaces:**
- Consumes:
  - `followupForms`, `openFollowups` and `attemptList` (export it) from `admin-views.mjs`.
  - `decorateStaffCase` from `staff-views.mjs`.
  - `describeFocus` and `focusSelectors` from `ui.mjs`.
- Produces:
  - `controller.openDialog(name, context = null)`, which sets `state.dialogContext`. `closeDialog()` and `navigate()` clear it.
  - `logCallDrawerBody({ record, person, ui, caseId })` and `resolveHelpDrawerBody({ item, person, ui })`.
  - Dialog names `log-call` and `resolve-help`.

**Why a dialog.** The spec (section 9) asks that the drawer trap focus and return it on close. The modal frame already does both, and handles Escape, so the drawer is the modal frame placed at the right edge.

**The pitfalls this task must handle:**
1. **Board rows don't carry follow-up tasks.** `listCases` returns only `openFollowups` and `followupAssigneeIds`. The drawer needs the tasks (ids, reasons, attempts), so opening it loads the case in place with `controller.selectCase(caseId, { navigate: false })`. That's the same call `runCaseAction` already makes for a board button that names a case.
2. **Focus must return to the right row.**
   - Today's `closeDialog` finds the opener by `[data-action="…"]` alone, which lands on the *first* Log a call button, not the one that was used.
   - Store `describeFocus(document.activeElement)` when opening, and restore with `focusSelectors(...)`. That matches on `data-case-id` / `data-item-id` too.
   - Capture it **before** the `await selectCase`.
   - If the row is gone (the task was resolved), fall back to `#office-queue-title`.
3. **The focus trap skips `select`.** The trap's selector lists button, input, textarea and `a[href]`. The drawer's first field is a select ("What happened"), so add `.modal select`. This also fixes the checkpoint dialog, which has two selects.
4. **Stale errors.** Call `controller.dismissError()` before opening the drawer, as `open-request-corrections` does, so the drawer only shows an error from its own send.
5. **"Open the case" inside the drawer.** `open-case` must close the dialog first, or the drawer stays open over the case page.
6. **Every re-render snatches focus inside an open dialog.**
   - `render()` in `src/app.mjs` (around line 99) runs `dialogFocusTarget(...)?.focus()` whenever `state.dialog` is set, on *every* render, not just the first.
   - The drawer stays open while other things move: the action's own `busy` render, the re-read after it, and realtime updates from other windows. A note half-typed in "Note for the office" would lose the keyboard to the first dropdown mid-sentence. (Its text survives through `formDrafts`, but the caret doesn't.)
   - The corrections dialog has the same latent bug; it's just shorter-lived.
   - Fix: move focus into the dialog only when it has just opened, and otherwise restore the field as for the page. See Step 6.
7. **A case that disappears throws the window onto the home screen.**
   - After `selectCase(id, { navigate: false })`, the case stays selected. Every refresh re-reads it, and every refresh path treats `NOT_FOUND` as "clear the selection **and** set `state.screen = homeScreen()`". The paths are `refresh`, the realtime handler, `load`, and `selectCase`'s own catch.
   - Today only REMIND leaves a case selected while on the board, and the board *is* home, so nobody noticed.
   - With the drawer, a presenter who logged a call and then went to **Add a case** or **All cases** is thrown back to Follow-ups when the sample cases are reset, mid-typing on Add a case.
   - Fix: leave the screen alone unless it's one that shows the selected case. See Step 2b.
8. **A refusal would be announced twice.**
   - `problemBanner` (`src/views.mjs` around line 68) hides the page's `role="alert"` banner only on the case page, where failures are stated in place.
   - The queue is the `staff` screen, so a refused `RECORD_CONTACT`, `RESOLVE_FOLLOWUP` or help-request `RESOLVE` would render two alerts: the banner behind the drawer, and the drawer's own `#drawer-error`. Screen readers announce both. The banner's Try again and Dismiss would also sit behind an `aria-modal` dialog, where nobody can reach them.
   - Fix: while a drawer is open, the drawer states the failure and carries those two controls, and the banner steps aside. See Step 4 and Step 5.
   - (The polite `#toast` from the click and submit handlers is the case page's existing pattern alongside its in-place alert, and stays.)

- [ ] **Step 1: Controller tests (failing).** In `tests/controller.test.mjs`, using that file's existing controller setup helpers:
  - `openDialog("log-call", { caseId: "c1" })` sets `dialog` and `dialogContext: { caseId: "c1" }`.
  - `closeDialog()` clears both.
  - `navigate("staff")` clears both.
  - `openDialog("help")` leaves `dialogContext` null.

- [ ] **Step 2: Implement it** in `src/controller.mjs`:
  - Add `dialogContext: null` to the initial state.
  - `openDialog(name, context = null)` sets `state.dialogContext = context ? { ...context } : null`.
  - `closeDialog` and `navigate` set it to `null`.
  - Don't persist it; a reload closes every dialog today.
  - Every other place that sets `state.dialog = null` (around lines 683 and 713) also sets `state.dialogContext = null`. `dialog()` only reads the context for its own dialog name, so a stale one is harmless, but don't leave it lying around.
  - Run the controller tests. Expected: PASS.

- [ ] **Step 2b: A gone case only moves a window that was showing it.**
  - **Failing controller test first.** Build a presenter controller whose store's `getCase` rejects with `{ code: "NOT_FOUND" }` for `c1`, using the file's existing fake-store helpers.
    - With `screen: "office-cases"` and `selectedCaseId: "c1"`, `refresh()` clears `selectedCaseId` and `savedCase`, and the screen **stays** `office-cases`.
    - With `screen: "staff-case"`, the same refresh moves to `staff`, as today.
    - `selectCase("c1", { navigate: false })` from `office-cases` also stays put.
  - **Then** add one helper in `src/controller.mjs` and use it at all four `NOT_FOUND` sites (in `refresh`, the realtime handler, `load`, and `selectCase`'s catch):
    ```js
    // Screens that are about the selected case. Anywhere else, a case that has
    // gone only clears the selection: the person is somewhere else on purpose.
    const CASE_SCREENS = Object.freeze(["staff-case", "intake", "progress", "reference"]);
    function forgetGoneCase() {
      clearSelection();
      if (CASE_SCREENS.includes(state.screen)) state.screen = homeScreen();
    }
    ```
  - Keep the realtime handler's `FIXTURES_GONE_NOTICE` line as it is.
  - `reference` belongs in the list: the client's `referenceScreen` renders `state.savedCase` (`src/client-views.mjs` around line 137).

- [ ] **Step 3: Drawer body tests (failing)** in `tests/office-views.test.mjs`. Add `logCallDrawerBody` and `resolveHelpDrawerBody` to the file's import list. The expected failure is the whole file failing to load with "does not provide an export named …"; Task 1's tests in it don't run until Step 4 adds the exports.
  - **Sam's own open task.** With the decorated case carrying one open task assigned to Sam, `logCallDrawerBody` renders:
    - the case reference and stage badge
    - the task's reason, "Calls so far" and the attempt list
    - both forms, with `data-case-action="RECORD_CONTACT"` and `"RESOLVE_FOLLOWUP"`, each with that task's `data-followup-id`
    - an `open-case` button "Open the case" with the case id
  - **Another assignee's task.** It shows the refusal reason and no `RECORD_CONTACT`.
  - **Two open tasks.** They render two sections with distinct field ids (the scopes are per task).
  - **No open task left.** It renders "No open follow-up is left on this case." and a `close-dialog` button.
  - **Wrong case, or none.** If the loaded case is not `caseId` (`record?.id !== caseId`), it renders "This case could not be opened. Close this and try again." and no form.
  - **A refusal.** With `ui.error`, it renders `<div class="notice amber" role="alert" id="drawer-error">` with the error message and a `dismiss-error` button. With `ui.retryable` it also has `retry-action`; without it, no `retry-action`.
  - **Help drawer.** `resolveHelpDrawerBody` for an assigned item renders the textarea "What you helped with" (`maxlength="1000"`, `required`) and `data-assistance-action="RESOLVE"` with the item id. It's a submit button inside a `.staff-form`, exactly as the old assistance card built it. It also shows the item's title, language and contact preference, and the sentence "Helping a client with their own forms is separate from preparing a return: resolving a request changes nothing about the case's intake, stage or preparer."

- [ ] **Step 4: Write both bodies** in `src/office-views.mjs`:

```js
// The one announcement of a failure while a drawer is open (pitfall 8): the
// page banner steps aside, so its two controls live here instead.
const drawerError = (ui) =>
  ui?.error
    ? `<div class="notice amber" role="alert" id="drawer-error">${icon("help")}<div><h3>${esc(
        ui.error.code === "CONFLICT" ? "This case changed while you were working" : "That did not go through",
      )}</h3><p>${esc(ui.error.message)}</p><div class="conflict-choices">${when(
        ui.retryable,
        button("Try again", "retry-action", "secondary"),
      )}${button("Dismiss", "dismiss-error", "text")}</div></div></div>`
    : "";

export function logCallDrawerBody({ record, person, ui = {}, caseId } = {}) {
  if (!record || record.id !== caseId)
    return `<p>This case could not be opened. Close this and try again.</p>${button("Close", "close-dialog", "secondary")}`;
  const tasks = openFollowups(record);
  const head = `<div class="drawer-case">${esc(record.reference)} ${stageBadge(record.stage)}${button("Open the case", "open-case", "text", `data-case-id="${esc(record.id)}"`)}</div>`;
  if (!tasks.length)
    return `${head}<p>No open follow-up is left on this case.</p>${button("Close", "close-dialog", "secondary")}`;
  return `${head}${drawerError(ui)}${tasks
    .map(
      (task) =>
        `<section class="drawer-task"><h3>${esc(task.reason)}</h3>${detailRow("Assigned to", task.assigneeName ?? UNKNOWN_PERSON)}<h4>Calls so far</h4>${attemptList(task)}${followupForms(record, task, person, ui)}</section>`,
    )
    .join("")}`;
}
```

  `resolveHelpDrawerBody({ item, person, ui })` does the same for one item:
  - The error block and the sentence from Step 3.
  - `detailRow`s for Language and Contact preference.
  - The resolve `<form class="staff-form">` with `textarea("What you helped with", "note", "", 'required maxlength="1000" rows="3"', \`assist-${item.id}\`)` and the RESOLVE submit button.
  - The refusal when `adminEligibility({ item }, person).resolveAssistance` is refused.
  - "This request is no longer open." when the item is missing or not `assigned`.

- [ ] **Step 5: Frame the drawer** in `views.mjs` `dialog()`:
  - For `log-call`:
    - Title "Log a call".
    - Decorate `state.savedCase` with `decorateStaffCase(state.savedCase, state.people)`.
    - Find the persona as `staffScreen` does.
    - Call `logCallDrawerBody({ record, person, ui: { busy: state.busy, error: state.error, retryable: state.retryable }, caseId: state.dialogContext?.caseId })`. Pass the same `ui` to `resolveHelpDrawerBody`.
  - For `resolve-help`:
    - Title "Resolve a help request".
    - Find the item in `state.assistance` by `state.dialogContext?.itemId`, decorated with `decorateAssistance`.
  - Both render `<section class="modal office-drawer" …>`, so the drawer keeps the `.modal` class. The trap, `dialogFocusTarget` and the reset test all look for `.modal`.
  - **Overline per dialog:**
    - `OFFICE FOLLOW-UP` for the two drawers
    - `PRESENTER CONTROLS` for `reset-fixtures` and `load-checkpoint`
    - `ViTally · HERE TO HELP` for the rest
  - **The banner steps aside** (pitfall 8). In `problemBanner`, after the case-page line, add:
    ```js
    // A drawer states its own failure, with the same two controls (see
    // `drawerError`); a second alert behind an aria-modal dialog would be
    // announced twice and could not be reached.
    if (DRAWERS.includes(state.dialog)) return "";
    ```
    Define `const DRAWERS = Object.freeze(["log-call", "resolve-help"]);` beside `problemBanner`. When the drawer closes with the error still unread, the banner comes back on the queue, which is where it belongs.
  - Add a `tests/shell.test.mjs` test that `page(state, "<main></main>")` for a presenter on `staff`, with `error: { code: "VALIDATION", message: "Refused." }`, gives:
    - `dialog: "log-call"` (with a matching `savedCase` and `dialogContext`): exactly **one** `role="alert"` (count the matches), and it is `#drawer-error`.
    - `dialog: null`: exactly one `role="alert"`, the `problem-banner`.
  - Add a `tests/shell.test.mjs` test:
    - `dialog({ dialog: "log-call", dialogContext: { caseId: "c1" }, savedCase: …, people: [sam], selectedPersonId: sam.id })` contains `class="modal office-drawer"` and `OFFICE FOLLOW-UP`.
    - `dialog({ dialog: "reset-fixtures", cases: [] })` contains `PRESENTER CONTROLS`.

- [ ] **Step 6: Wire it** in `src/app.mjs`.
  - **`openDialog`** becomes `openDialog(name, context = null, opener = null)`:
    ```js
    focusBeforeDialog = opener ?? (document.activeElement?.closest?.("#app") ? describeFocus(document.activeElement) : null);
    controller.openDialog(name, context);
    ```
  - **`closeDialog(fallback)`**: after `controller.closeDialog()`, try `focusSelectors(focusBeforeDialog)` in order and focus the first match. Otherwise use the fallback selector. Then set `focusBeforeDialog = null`. The help dialog's opener (`[data-action="open-help"]` with no related keys) resolves exactly as before.
  - **Navigation cases:**
    ```js
    case "open-log-call": {
      const opener = describeFocus(target);
      const caseId = target.dataset.caseId;
      controller.dismissError();
      await controller.selectCase(caseId, { navigate: false });
      if (controller.getState().savedCase?.id === caseId) openDialog("log-call", { caseId }, opener);
      break;
    }
    case "open-resolve-help":
      controller.dismissError();
      openDialog("resolve-help", { itemId: target.dataset.itemId }, describeFocus(target));
      break;
    ```
  - **`open-case`**: before `selectCase`, add `if (state.dialog) controller.closeDialog();`.
  - **`runCaseAction`**: after the receipt, add `if (type === "RESOLVE_FOLLOWUP" && receipt && controller.getState().dialog === "log-call") closeDialog("#office-queue-title");`. `RECORD_CONTACT` leaves the drawer open, and the new attempt appears there because the accepted action re-reads the case.
  - **`runAssistanceAction`**: when `sent`, add `if (type === "RESOLVE" && controller.getState().dialog === "resolve-help") closeDialog("#office-queue-title");`.
  - **Focus on re-render (pitfall 6).** In `render()`, keep a closure variable `let shownDialog = null;` beside `focusBeforeDialog`, and replace the dialog branch with:
    ```js
    const opened = state.dialog && state.dialog !== shownDialog;
    shownDialog = state.dialog ?? null;
    if (opened)
      requestAnimationFrame(() => { /* today's dialogFocusTarget block, unchanged */ });
    else if (state.dialog && keyboard) restoreField(keyboard);
    else if (!state.dialog && focus) { /* today's #main focus + scrollTo, unchanged */ }
    else if (keyboard) restoreField(keyboard);
    ```
    - The keyboard inside the modal is described before the rebuild like any other field, because the modal is inside `#app`.
    - The drawer's submit button (`data-case-action` + `data-followup-id`) is found again after the re-read.
    - If the described element is gone, focus falls back to the modal container: add `else if (state.dialog) root.querySelector(".modal")?.focus();` when `restoreField` finds nothing. `restoreField` returns nothing today, so have it return `true` when it focused something.
  - **Focus trap**: its selector becomes `.modal button:not([disabled]),.modal input:not([type="hidden"]),.modal select,.modal textarea,.modal a[href]`. Hidden inputs can't take focus, and the old selector counted them as `last`.

- [ ] **Step 7: Run the unit tests.** Expected: `npm test` PASS. The wiring is checked end to end in Task 6.

- [ ] **Step 8: Commit.**

```bash
git add src/controller.mjs src/app.mjs src/views.mjs src/office-views.mjs src/admin-views.mjs tests/
git commit -m "Log a call and resolve help requests from a drawer on the queue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The Add a case page

**Files:**
- Modify: `src/office-views.mjs`, `src/admin-views.mjs`, `src/views.mjs`, `src/controller.mjs`, `src/app.mjs`
- Test: `tests/office-views.test.mjs`, `tests/controller.test.mjs`, `tests/admin-views.test.mjs`

**Interfaces:**
- Produces:
  - Screen `office-add-case` and action `open-add-case`.
  - `renderAddCase(ui)`, where `ui = {person, busy}`.
  - `ADD_CASE_SECTIONS` (`[[key, title, answerKeys], …]`).

- [ ] **Step 1: Failing tests.** Add `renderAddCase` and `ADD_CASE_SECTIONS` to `tests/office-views.test.mjs`'s imports. As in Task 2, the expected failure is the whole file failing to load, not just the new tests.
  - In `tests/controller.test.mjs`, a presenter can `navigate("office-add-case")` and `navigate("office-cases")`. A restored window state holding either screen is kept for a presenter. A client principal restoring either falls back to its own home screen.
  - In `tests/office-views.test.mjs`:
    1. The keys of `ADD_CASE_SECTIONS`, flattened, equal `INTAKE_ANSWER_KEYS` exactly, in the same order, so no answer is lost or doubled.
    2. `renderAddCase({ person: sam })` has:
       - `form#assisted-intake-form`
       - a `#field-assisted-<key>` control for every `INTAKE_ANSWER_KEYS` entry
       - four `fieldset.add-case-section` elements with legends "Visit", "2025 situation", "Client details", "Paperwork"
       - a `fill-assisted-intake` button
       - one `button[type="submit"]` inside the form, reading "Create case"
       - a Cancel button with `data-action="open-board"` and `type="button"`
       - the sentence that creating it saves a draft the office owns and emails nobody
    3. A persona without the assisted-intake right gets the `staff-reason` explanation and no form. With no persona, it gets the `CHOOSE_PERSONA` note and no form.
    4. The side card says the Application ID is "Assigned when the case is created" and names the persona under "Created by".

- [ ] **Step 2: Build the page from the existing form parts.**
  - **Don't move** `ASSISTED_OPTIONS`, `answerField` or `OFFICE_NOTE`. The office case page's assisted-answers panel (`assistedAnswersPanel`, `src/admin-views.mjs` around line 786) and its other panels use them too.
  - Moving them into `office-views.mjs` would force `admin-views.mjs` to import from `office-views.mjs`, which already imports from `admin-views.mjs`. That circular import can hit a temporal-dead-zone error on a `const` at load time.
  - Instead, add `export` to all three in `admin-views.mjs`, and import them into `office-views.mjs`.
  - Delete `assistedIntakePanel` and `assistedIntakeForm`.
  - Then:

```js
export const ADD_CASE_SECTIONS = Object.freeze([
  ["visit", "Visit", ["service", "year", "language"]],
  ["situation", "2025 situation", ["residenceCity", "residenceState", "city", "state", "rideshare", "other", "stocks"]],
  ["client", "Client details", ["firstName", "lastName", "address", "zip", "household"]],
  ["paperwork", "Paperwork", ["helper", "documents"]],
]);
```

  Order the section keys so the flattened list equals `INTAKE_ANSWER_KEYS`: `service, year, language, residenceCity, residenceState, city, state, rideshare, other, stocks, firstName, lastName, address, zip, household, helper, documents`. The mailing city and state therefore sit under "2025 situation", beside the residence. Label them with their own `ANSWER_LABELS` ("Mailing city", "Mailing state") so nothing reads wrong.

  `renderAddCase(ui)`:
  - **Fictional-data pill:** `<p class="fiction-pill">${icon("spark")} Fictional data only · ${button("Fill fictional details", "fill-assisted-intake", "text")}</p>`.
  - **Refused:** when there's no persona or the right is refused, return the pill plus the explanation.
  - **Otherwise, the form:**
    - `<form id="assisted-intake-form" class="staff-form add-case-form">`
    - `<div class="add-case-layout">` holding the sections and the side column.
    - Each section is `<fieldset class="panel add-case-section"><legend><span class="section-num">${n}</span> ${title}</legend><div class="form-grid">${keys.map((key) => answerField(key, "", "assisted")).join("")}</div></fieldset>`.
    - The side column is `<aside class="add-case-side">` with two panels:
      - "Case info", using `detailRow` for Application ID ("Assigned when the case is created"), Stage ("Draft until the office sends it") and Created by (the persona's name).
      - "What happens next": "Creating it saves a draft the office owns. Nobody is emailed or invited. You record the intake checks and send it from the case itself."
    - `<div class="add-case-bar">` inside the form: the Cancel `button("Cancel", "open-board", "text")`, a `.field-note` with the same sentence, and `<button type="submit" class="btn primary">${icon("arrow")} Create case</button>`.

- [ ] **Step 3: Route and wire.**
  - **Controller:** `STAFF_SCREENS` becomes `["staff", "staff-case", "office-cases", "office-add-case"]`. `office-cases` is added now so the screen list changes once; Task 4 renders it.
  - **`views.mjs` routing:**
    - `const OFFICE_SCREENS = ["office-cases", "office-add-case"];`
    - `const screen = !office && OFFICE_SCREENS.includes(state.screen) ? "staff" : state.screen;`
    - A volunteer persona chosen while an office screen is open gets the work board, never a blank page.
    - Use `screen` for routing, and call `staffSidebar({ ...state, screen }, person, office)`. `staffSidebar` reads `state.screen` for the current item, so passing the raw state would mark nothing current on the fallback board.
    - `office-add-case` renders `frame("OFFICE · ADD A CASE", "Add a case", "Enter a walk-in client's answers yourself. The case has no client account: the office owns it.", false, renderAddCase({ person, busy: state.busy }))`.
  - **Back link:** `frame`'s fourth parameter changes from a boolean `back` to a label string (`""` means no back button). The button keeps `data-action="open-board"`:
    - The office case page and Add a case pass `"Back to Follow-ups"`.
    - The volunteer case page passes `"Back to the work board"`.
    - The boards pass `""`.
  - **`app.mjs`:** `case "open-add-case": formDrafts.clear(); controller.navigate("office-add-case"); break;`. Delete the `toggle-assisted-intake` case.
  - **After create:** `createAssistedCase` already opens the new case (`selectCase` → `staff-case`); nothing else changes.

- [ ] **Step 4: Run `npm test`.** Expected: PASS. Delete the moved "assisted intake entry point" test from `tests/admin-views.test.mjs` if you didn't in Task 1.

- [ ] **Step 5: Commit.**

```bash
git add src/ tests/
git commit -m "Give Add a case its own page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The All cases pool

**Files:**
- Create: `src/pool-views.mjs`, `tests/pool-views.test.mjs`
- Modify: `src/views.mjs`, `src/controller.mjs`, `src/app.mjs`, `tests/controller.test.mjs`, `tests/shell.test.mjs`

**Interfaces:**
- Consumes: `phaseTab` and `describeStage` from `domain.mjs`; `decorateStaffCase` output (`preparerName`, `reviewerName`); `relativeDay` and `stageBadge` from `ui.mjs`.
- Produces:
  - `POOL_TABS`, `POOL_STAGES`, `POOL_FILTER_KEYS`, `DEFAULT_POOL_FILTERS`.
  - `poolPhase(record) → "intake"|"available"|"preparation"|"review"|"done"|"closed"|null`.
  - `poolFilters(filters)`, `filterPool(cases, chosen)`, `poolCounts(cases, chosen)`.
  - `renderCasePool(cases, people, ui)`, where `ui = {filters, now}`.
  - Action `open-cases`; `controller.clearBoardFilters(keys?)`; action `clear-pool-filters`.

- [ ] **Step 1: Failing model tests** in `tests/pool-views.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { POOL_STAGES, poolPhase, poolFilters, filterPool, poolCounts } from "../src/pool-views.mjs";
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
```

- [ ] **Step 2: Run it to confirm it fails**, then write the model:

```js
export const POOL_TABS = Object.freeze([
  ["all", "All cases"],
  ["intake", "Intake"],
  ["available", "Available"],
  ["preparation", "Waiting for preparation"],
  ["review", "Waiting for review"],
  ["done", "Done"],
  ["closed", "Closed"],
]);
const TAB_VALUES = Object.freeze(POOL_TABS.map(([value]) => value));
export const POOL_STAGES = Object.freeze([
  "draft", "received", "preparation_ready", "preparing", "corrections_required",
  "review_ready", "reviewing", "review_approved", "closed",
]);
export const DEFAULT_POOL_FILTERS = Object.freeze({
  poolPhase: "all", poolStage: "all", poolLanguage: "all",
  poolService: "all", poolPreparer: "all", poolReviewer: "all",
});
export const POOL_FILTER_KEYS = Object.freeze(Object.keys(DEFAULT_POOL_FILTERS));

// The office's phases on today's nine stages. The three middle ones are the
// volunteer board's own tabs (`phaseTab`), so a case never sits on one tab
// for a volunteer and another for the office. Part 3 replaces both.
export function poolPhase(record) {
  switch (record?.stage) {
    case "draft":
    case "received":
      return "intake";
    case "review_approved":
      return "done";
    case "closed":
      return "closed";
    default:
      return phaseTab(record);
  }
}

export function poolFilters(filters) {
  const chosen = { ...DEFAULT_POOL_FILTERS };
  for (const key of POOL_FILTER_KEYS) {
    const value = String(filters?.[key] ?? "").trim();
    if (value) chosen[key] = value;
  }
  if (!TAB_VALUES.includes(chosen.poolPhase)) chosen.poolPhase = "all";
  if (chosen.poolStage !== "all" && !POOL_STAGES.includes(chosen.poolStage)) chosen.poolStage = "all";
  return chosen;
}

const matchesValue = (value, chosen) => chosen === "all" || (value ?? "") === chosen;
const matchesPerson = (id, chosen) =>
  chosen === "all" || (chosen === "unassigned" ? !id : id === chosen);

export function filterPool(cases = [], chosen, { ignorePhase = false } = {}) {
  return (Array.isArray(cases) ? cases : []).filter(
    (record) =>
      (ignorePhase || chosen.poolPhase === "all" || poolPhase(record) === chosen.poolPhase) &&
      matchesValue(record?.stage, chosen.poolStage) &&
      matchesValue(record?.answers?.language, chosen.poolLanguage) &&
      matchesValue(record?.answers?.service, chosen.poolService) &&
      matchesPerson(record?.preparerId, chosen.poolPreparer) &&
      matchesPerson(record?.reviewerId, chosen.poolReviewer),
  );
}

export function poolCounts(cases = [], chosen) {
  const scoped = filterPool(cases, chosen, { ignorePhase: true });
  return Object.fromEntries(
    TAB_VALUES.map((tab) => [tab, tab === "all" ? scoped.length : scoped.filter((r) => poolPhase(r) === tab).length]),
  );
}
```

- [ ] **Step 3: Failing renderer tests** (same file). Add `renderCasePool` to the file's import list; the expected failure is the whole file failing to load. `renderCasePool(cases, people, { filters, now })`:
  1. **Tabs.** Seven tab toggles with `data-action="set-board-filter" data-filter="poolPhase"`, counts and `aria-pressed`, in `role="group" aria-label="Case phase"`.
  2. **Filter dropdowns.** Five `<select>`s with `data-board-filter` of `poolStage`, `poolLanguage`, `poolService`, `poolPreparer` and `poolReviewer`. Each has a visible `<label>`. None has a blank "Select an option". The first option is "Any stage" / "Any language" / "Any service" / "Anyone".
     - Prepared by and Reviewed by list "Unassigned" second, then the roster's people by name.
     - Stage lists `describeStage(stage).label` for each of `POOL_STAGES`.
     - The current value is `selected`.
  3. **Row.** A row is `tr.pool-row` with:
     - `button.board-reference[data-action="open-case"]` holding the reference
     - the stage badge plus a `.pool-phase` line naming the tab label
     - language, service, preparer name or "Unassigned", reviewer name or "Unassigned"
     - `relativeDay(updatedAt, now)`
  4. **Order.** Rows are sorted by `updatedAt`, newest first.
  5. **Count line.** "Showing 2 of 5 cases" is in a `role="status"` span.
  6. **No filters.** When no filter narrows beyond the tab: "No filters. Showing every case this season." When one does: a `clear-pool-filters` button "Clear filters".
  7. **Empty result.** `.empty-state` with "No case matches these filters."
  8. **Escaping.** A reference or language with `<script>` renders escaped.
  9. **Footnote.** "This pool shows workflow only: no taxpayer names, no addresses and no document contents." The phone column arrives with part 4 and 5's reveal.

- [ ] **Step 4: Write `renderCasePool`.**
  - **Selects.** Build them with a local `filterSelect(label, key, value, options)`:
    ```js
    `<label class="field pool-filter" for="field-${key}"><span>${esc(label)}</span><select id="field-${key}" data-board-filter="${key}">${options.map(([v, t]) => `<option value="${esc(v)}"${v === value ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`
    ```
    Don't use `ui.select`: it adds a blank "Select an option" entry, which reads as a real choice here. Put no `name` on the selects, so no form handler or answer draft ever reads them.
  - **Language and service options.** Take them from the records (as `valueOptions` does on the volunteer board).
  - **Table.** `board-table pool-table`, with headers Application ID, Stage, Language, Service, Preparer, Reviewer and Updated.
  - **Wrapper.** `<section class="panel case-pool" aria-labelledby="pool-title"><h2 id="pool-title">…</h2>`, where the title reads `All cases`.

- [ ] **Step 5: Route and wire.**
  - **`views.mjs`, sidebar.** For office personas, `staffSidebar` renders a second nav button: `button(\`${icon("folder")} All cases\`, "open-cases", …)`, with `current` and `aria-current="page"` when the resolved screen is `office-cases`. The Follow-ups item is current only on `staff`.
  - **`views.mjs`, page.**
    - `office-cases` renders `frame("OFFICE · ALL CASES", "Case pool", "Every case in this workspace, in every stage.", false, renderCasePool(cases, people, { filters: state.boardFilters, now: Date.now() }), addCaseAction)`.
    - Add a `tests/shell.test.mjs` check that Sam's sidebar has both items and Alex's has only Work board.
  - **`controller.mjs`.** `clearBoardFilters(keys)`:
    - With an array, delete only those keys from `state.boardFilters`.
    - Without one, keep today's behavior.
    - Add a controller test that clearing `POOL_FILTER_KEYS` keeps `status`.
  - **`app.mjs`.**
    - `case "open-cases": formDrafts.clear(); controller.navigate("office-cases"); break;`
    - `case "clear-pool-filters": controller.clearBoardFilters(POOL_FILTER_KEYS); break;`
    - At the top of the `change` listener, before the answer-form early return:
      ```js
      if (field.matches?.("select[data-board-filter]")) {
        controller.setBoardFilter(field.dataset.boardFilter, field.value);
        root.querySelector(`#${field.id}`)?.focus();
        return;
      }
      ```
      `setBoardFilter` only deletes `search` when the name is `status`, so the pool keys don't disturb the volunteer board's search.

- [ ] **Step 6: Run `npm test`.** Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/ tests/
git commit -m "Add the office's All cases pool with phase tabs and filters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Office styles and presenter dialogs

**Files:**
- Modify: `src/styles.css`, `tests/shell.test.mjs`

- [ ] **Step 1: Write the rules**, all on `--vt-*` tokens and scoped to the new containers:
  - **`.page-intro .page-actions`**: a flex row aligned to the right of the title on wide screens, wrapping under it below 800px.
  - **`.office-queue`**
    - Header row: title, then subtitle muted, then status on the right.
    - `.chip` kind toggles wrap.
    - `.queue-table` cells align to the top.
    - `.queue-needed small` on its own line in `--vt-muted`.
    - `.queue-action` right-aligned, no wrap for its button.
    - `.queue-waiting.aging` in the amendment/amber token and `.queue-waiting.late` in the danger token. Pick whichever of the existing `--vt-*` tokens `.badge.amber` and `.error` use, and check contrast in Step 3.
  - **`.kind-pill`**: an inline-flex pill with an icon at 14px. Each kind has a soft background and ink pair from existing tokens:
    - `intake`: the intake stage family
    - `call`: amber
    - `help`: the primary soft color
    - `unclaimed`: neutral
  - **`.office-drawer`**
    - `.modal-backdrop:has(.office-drawer)` aligns to the right edge (`justify-content: flex-end; align-items: stretch; padding: 0`).
    - `.modal.office-drawer`: `max-width: 480px`, `height: 100vh`, `max-height: 100vh`, `border-radius` only on the left, and `overflow-y: auto`.
    - `.drawer-case` is a row; `.drawer-task` sections are separated by a top border in `--vt-line`.
  - **`.add-case`**
    - `.fiction-pill`: dashed `--vt-primary-line` border, `--vt-primary-soft` background.
    - `.add-case-layout`: grid `minmax(0, 1fr) 300px`, gap 24px, one column below 1024px.
    - `.add-case-section legend .section-num`: a 24px circle in `--vt-primary` with white text. The legend sits inside the panel, not straddling the border; float it or give it `padding: 0` and a block display, as the PR 3 intake cards did.
    - `.add-case-side` sticky at `top: 24px`.
    - `.add-case-bar`: `position: sticky; bottom: 0`, surface background, top border, flex row with the submit last.
  - **`.case-pool`**
    - `.pool-filters` is a wrapping flex row of `.pool-filter` fields at 44px height.
    - `.pool-phase` is a 12px muted second line under the badge.
    - `.pool-table .unassigned` is italic muted (reuse the volunteer board's `.unassigned` rule if it's global).
  - **Presenter dialogs and the shared modal notes.** `.modal .info-note`, `.modal .info-note p` and `.modal .info-note strong` move to tokens: `--vt-primary-soft` background, `--vt-line` border, text `--vt-ink` / `--vt-muted`. This closes the residual PR 3 parked: the help dialog's note at 3.12:1. The client-scoped `.client-shell .info-note` rules stay as they are.
  - **Delete dead rules.** For each of `.board-list`, `article.board-row`/`.board-row-head` (the article card, not `.board-table .board-row`), `.request-card*` and `.board-counts`, run `grep -n "<class>" src/*.mjs`. Delete the rule only when no renderer emits the class any more. List what you deleted in your report.

- [ ] **Step 2: Stylesheet tests** in `tests/shell.test.mjs`:
  - `.modal.office-drawer` exists.
  - There's a `.modal-backdrop:has(.office-drawer)` rule.
  - `.modal .info-note p` has a `color: var(--vt-` value.
  - No rule this task added contains a hex other than `#fff`. Check it by slicing the stylesheet between `/* PR 4: office screens */` and `/* end PR 4 */`, the comment markers you add around the new block.

- [ ] **Step 3: Visual check with a fixture harness.** Write a script under `.superpowers/` (git-ignored) that:
  - **Renders** into a page linking `src/styles.css`, each wrapped in `appShell` + `staffSidebar` + the `frame` markup from `staffScreen`:
    - `renderFollowups` with at least one row of each kind, with ages 0, 3 and 6 days
    - the Log a call drawer (`dialog()` output) over it
    - `renderAddCase`
    - `renderCasePool` with all nine stages
    - the reset and checkpoint dialogs
  - **Screenshots** them with Puppeteer at 1440×900, 1024×768 and 390×844. Use `executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`, or the scratchpad's Puppeteer under `/private/tmp/claude-501/-Users-jinyuyang-VITA-Management-System-Demo/*/scratchpad/capture/node_modules`, or Playwright's Chromium from `node_modules`.
  - **Checks:**
    - `document.documentElement.scrollWidth === innerWidth` at all three widths.
    - Every visible text node reaches ≥ 4.5:1 contrast against its effective background (reuse the PR 3 audit approach: walk text nodes, compute the effective background, report failures).
    - The drawer sits at the right edge, full height.
    - Compare with the three design screenshots. Fix gaps in this task's scope and list the rest.

- [ ] **Step 4: Run `npm test`.** Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/styles.css tests/shell.test.mjs
git commit -m "Style the office queue, drawer, Add a case, case pool and presenter dialogs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Browser story and all four suites

**Files:**
- Modify: `tests/support/story-pages.mjs`, `tests/browser.mjs`

- [ ] **Step 1: Update the hooks that changed on purpose.**
  - In `story-pages.mjs`, `OFFICE_BOARD_HEADING = "Office queue"`.
  - In `browser.mjs` (around line 491), the arrived locator becomes `staff.locator('tr.queue-row[data-kind="intake"]').filter({ hasText: classReference }).first()`. The "no `[data-case-action]`" assertion stays.
  - The walk-in phase (around line 1225): `await clickAction(staff, "open-add-case")` replaces `toggle-assisted-intake`. Then wait for `#assisted-intake-form` to be visible before `fill-assisted-intake`.

- [ ] **Step 2: Add the drawer to the story.** In the phase "Alex asks the office to contact the client" (around line 542), the office currently opens the case's Follow-up tab to record the call. Change the *attempt* to go through the queue drawer, and leave the *resolve* on the case page. That way both paths stay covered.
  1. `await openBoard(staff, OFFICE_BOARD_HEADING)`.
  2. Click `tr.queue-row[data-kind="call"]` for the class reference: its `[data-action="open-log-call"]`.
  3. Wait for `.modal.office-drawer`.
  4. Fill "What happened" and "Note for the office", then click the drawer's `RECORD_CONTACT` submit.
  5. Wait for the attempt to appear in the drawer's attempt list. Then assert that the keyboard is back on the button that was pressed: `document.activeElement?.dataset.caseAction === "RECORD_CONTACT"`, inside `.modal.office-drawer`. This is the regression check for Task 2's focus-on-re-render fix. The accepted action re-renders twice, and before the fix each re-render moved focus to the drawer's first dropdown. That dropdown is also inside the drawer, so "focus is in the drawer" alone wouldn't catch the bug.
  6. Press Escape, and assert focus is back on that row's Log a call button:
     ```js
     document.activeElement?.dataset?.action === "open-log-call" &&
       document.activeElement.dataset.caseId === id
     ```
  7. Then `openCaseByReference` and continue the existing resolve step on the Follow-up tab.

  Use the existing helpers (`clickAction`, `waitFor`, `fillForm` or whichever helper the phase already uses to fill `{ "What happened": … }`). Read the phase before editing and keep its evidence and screenshots.

- [ ] **Step 3: Add a short pool check** after the walk-in phase:
  1. `clickAction(staff, "open-cases")`, then wait for the text "Case pool".
  2. Choose the `Intake` tab.
  3. Assert the assisted case's reference is visible.
  4. `selectOption` the "Prepared by" select to "Unassigned", and assert the count line still includes it.
  5. Click `clear-pool-filters`.
  6. `shoot(staff, "office-case-pool")`.

- [ ] **Step 4: Run all four suites.** Make sure the test stack is up:
  ```bash
  docker start $(docker ps -aq --filter name=vitally-task2)
  ```
  Wait for `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/auth/v1/health` to print `200`. Then run each suite in the foreground with long timeouts, redirecting output to a file under `/tmp`:
  ```bash
  npm test
  npm run test:database
  npm run test:auth-browser
  npm run test:browser
  ```
  Expected: all PASS.
  - If `test:browser` fails in a part this PR doesn't touch, re-run once and report both runs. A known unrelated flake: "a press reached nothing at all and had to be sent again".

- [ ] **Step 5: Commit.**

```bash
git add tests/
git commit -m "Walk the browser story through the office queue, drawer and pool

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Screenshots and docs

**Files:**
- Add: `docs/design/screens/implemented-office-followups.png`, `implemented-office-log-call.png`, `implemented-office-add-case.png`, `implemented-office-case-pool.png`
- Modify: `docs/design/README.md`, `docs/design/redesign-review.md` (status line)

- [ ] **Step 1: Copy four 1440 harness screenshots** from Task 5: the queue, the drawer, Add a case and the pool.

- [ ] **Step 2: Check the logo.**
  ```bash
  shasum -a 256 src/pcdc-logo.png "docs/media/Shao-Transparent BLUE.png"
  ```
  Expected: the same hash twice.

- [ ] **Step 3: Update the docs.**
  - In `docs/design/README.md`, under the admin rows, add:
    ```markdown
    | Implemented (part 1, PR 4): office screens on today's data, rendered from test fixtures | [follow-ups](screens/implemented-office-followups.png) · [log a call](screens/implemented-office-log-call.png) · [add a case](screens/implemented-office-add-case.png) · [case pool](screens/implemented-office-case-pool.png) |
    ```
  - In `redesign-review.md`, update the status line: PRs 1–3 merged, PR 4 (office screens) in review, and part 1 done when it merges.

- [ ] **Step 4: Check part 1's done-list** (spec §9) and report each item:
  - Every staff and client screen uses the `--vt-*` tokens.
    ```bash
    grep -n "var(--ink)\|var(--muted)\|var(--canvas)\|var(--line)\|var(--blue" src/styles.css
    ```
    List the remaining users of the old palette variables. Delete an old variable and its rules only where nothing uses them. Report what's left and why; don't refactor shared rules in this step.

- [ ] **Step 5: Commit.** Don't push; the finishing step pushes and opens the PR.
  ```bash
  git add docs/design
  git commit -m "Add the implemented office screen screenshots

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
