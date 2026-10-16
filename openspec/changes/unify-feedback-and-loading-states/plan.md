# Unify Feedback and Loading States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Errors are recorded and shown once, where the person is looking (the open dialog, in place, the save chip, or the problem banner), never as a toast.
- The toast has three kinds, a Dismiss, readable timing, and a position that never covers the controls under it.
- Lists say "loading" and "couldn't load" rather than "empty" when they aren't.
- The pressed button shows it is working.
- The connection notice, the banners, the in-place errors and the save chip take DESIGN.md's look.

**Architecture:**
- **The controller** (`src/controller.mjs`) records every refusal with `refuse()`. It gains `noteLocalFailure(error, retry)`, one pending local retry, one error at a time, and `lists` (each list's load state, read by `loadData()`).
- **`src/toast.mjs`** holds the toast's timer, with no DOM. `app.mjs` owns the toast host outside `#app` and `notify(kind, text, by)`, marks the pressed button after each draw, and shows "You're back online." by comparing draws.
- **The views** read `lists`, render the toast's parts, the loading line, the dialog error block and the restyled banners.

**Tech Stack:**
- plain ES modules;
- `node:test`;
- CSS in `src/styles.css`;
- Playwright 1.63 (the story, run by the controller).

**Spec:** in `openspec/changes/unify-feedback-and-loading-states/`:
- `specs/screen-states/spec.md`;
- `design.md` (D1–D8);
- `brainstorm.md` (Q1–Q8, I1–I20);
- `proposal.md` and `tasks.md`.

## Global Constraints

- **Data:** fictional data only, in code, tests, fixtures and screenshots.
- **Implementers run only:**
  - `npm test`;
  - `npm run build:hant` and `npm run build:hant -- --check`;
  - `npm run build:intake`;
  - `node --check`;
  - focused `node --test`;
  - `npx openspec validate --all`.

  They never run `npm run test:browser`, `npm run test:auth-browser`, `npm run db:migrate:test` or `npm run test:database`. The controller runs the story and the sign-in suite.
- **Commands:** `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && <one command>`.
- **繁體:** after any 简体 change, run `npm run build:hant` and commit `src/zh-hant.mjs`. Staff screens stay English.
- **Kept as they are:**
  - existing `data-action` values, ids (`#toast` included), roles and accessible names, unless this plan says otherwise;
  - the sign-in screens' in-form alert;
  - the banners' size (13px, 11px padding) and their media-query and 44px rules.
- **Module names:** `src/` modules are letters and dashes only (`server.mjs` serves nothing else). `src/toast.mjs` qualifies.
- **Git, inside the worktree:**
  - run each git command on its own, never chained with `&&` or `;`, and never inside `$(…)`;
  - stage files by name, never `git add -A` or `git add .` (the worktree's `node_modules` and `.env.test` are links);
  - write commit messages to a scratchpad file and run `git commit -F <file>`;
  - confirm with `git rev-parse --short HEAD` and `git status --short`;
  - **every commit message ends with a blank line and exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, whatever model you are.**
- Never write under `docs/superpowers/`, and never commit `.superpowers/`.
- **Toast, exact:**
  - kinds are exactly `"success"`, `"info"`, `"warning"`;
  - `TOAST_MS = { success: 5000, info: 5000, warning: 8000 }`;
  - the icons are `check`, `info`, `warning`;
  - the Dismiss is 44 × 44 px.
- **Colours, exact:**
  - error `#fbeceb` / `#8a3b34`;
  - notice `#efedfb` / `#4b3fa3`;
  - attention background `#faf0dd` with text `#8a5a12`;
  - toast edges: success `#2f8a4c`, info `#6a5acd`, warning `#a07c32`.
- **Texts, exact** (English / 简体; 繁體 is generated):
  - `apps.loading`: "Loading your applications…" / 正在载入您的申请…
  - `apps.unloaded`: "Your applications couldn't load." / 无法载入您的申请。
  - `toast.back_online`: "You're back online." / 已重新连接。
  - `SENTENCES` gains:
    - "The draft could not be made. Try again." → 无法生成草稿。请再试一次。
    - "The draft font could not be checked. Try again later." → 无法核对草稿所用的字体。请稍后再试。
  - Staff (English only): "Loading cases…", "The cases couldn't load.", "Loading…" (Add a case).
- **The `notify` call sites and their kinds** (`src/app.mjs`, line numbers from `main` 73f88df):

  | Line | Text | Kind |
  |---|---|---|
  | 258 | `pendingToast` (`toast.hant_failed_start`) | warning |
  | 820 | `toast.fictional_filled` / `toast.fictional_replaced` | info |
  | 831 | "There is no assisted intake form on screen." | **not a toast:** `controller.noteLocalFailure({ code: "VALIDATION", message })`, no retry |
  | 840 | "Fictional details filled in. Nothing is saved yet." | info |
  | 852 | `toast.reconcile_mine` / `toast.reconcile_office` | info |
  | 901, 1462 | `toast.saved` | success |
  | 905 | `toast.confirm_first` | warning |
  | 919 | `toast.needs_change` | warning |
  | 971 | "The application is with the office. Record the intake checks next." | success |
  | 975 | `toast.sent` | success |
  | 981 | `toast.document_sent` | success |
  | 990 | `STAFF_NOTICES[type]` | success |
  | 1010 | "Say what you helped with before resolving this request." | warning |
  | 1021 | `ASSISTANCE_NOTICES[type]` | success |
  | 1128 | `draft.failed` / `draft.font_unchecked` | **not a toast:** Task 3 |
  | 1233 | "The draft is saved. Nobody was emailed." | info |
  | 1243 | "The application is with the office." | success |
  | 1245 | "The draft is saved. Some answers still need attention before it can be sent." | warning |
  | 1248 | "Confirm that you have checked these answers with the client first." | warning |
  | 1299 | "The sample cases were rebuilt. Nothing else was touched." | success |
  | 1349 | `toast.started` | success |
  | 1502 | `toast.id_copied` | success |
  | 1505 | `toast.id_select` | info |
  | 1528 | `toast.sent_again` | success, only for a replayed action (Task 3) |
  | 1552 | `toast.hant_failed` (the language switch) | warning |
  | 1578, 1653, 1696 | the three catches | **not a toast:** the safety net (Task 2) |
  | 1683 | "The sample case was moved to that point in the story." | success |
  | 1765 | `toast.hant_failed` (the `storage` handler, no `by`) | warning |
  | new | `toast.back_online` | info (Task 7) |

---

### Task 1: Errors are recorded, one at a time, with one local retry

**Files:**
- Modify: `src/controller.mjs`:
  - `noteFailure` at line 496;
  - the refusals at 1382, 1974, 2058, 2064, 2098, 2100, 2130, 2166, 2169, 2271, 2274, 2279;
  - `requirePresenter` at 2220;
  - `forgetPendingSave` at 1544;
  - `retryLast` at 2315;
  - the returned API at 2356.
- Test: `tests/controller.test.mjs`, `tests/client-language.test.mjs`

**Interfaces:**
- Produces:
  - `controller.noteLocalFailure(error: { code?: string, message: string }, retry?: () => unknown): void`
  - `controller.retryLast(): Promise<{ local: true } | receipt | null>`
  - internal `refuse(code, message): Error` (used as `throw refuse(…)`), `setLocalRetry(fn)`, `replaceFailedSave()`

- [ ] **Step 1: Write the failing tests** (append to `tests/controller.test.mjs`)

```js
test("a refusal is recorded before it is thrown, and offers no retry", async () => {
  const store = fakeStore();
  const { controller } = build({ store });
  await controller.start();
  await assert.rejects(controller.runAction("SUBMIT", { confirmed: true }), (error) => error.code === "NOT_FOUND");
  assert.deepEqual(controller.getState().error, { code: "NOT_FOUND", message: "Open an application first." });
  assert.equal(controller.getState().retryable, false);
  controller.stop();
});

test("a presenter-only refusal is recorded too", async () => {
  const store = fakeStore();
  const { controller } = build({ store });
  await controller.start();
  await assert.rejects(controller.resetFixtures(), (error) => error.code === "FORBIDDEN");
  assert.equal(controller.getState().error.code, "FORBIDDEN");
  assert.match(controller.getState().error.message, /^Only the person running the session/);
  controller.stop();
});

test("a stale checkpoint is recorded", async () => {
  const store = presenterStore({ cases: [sampleCase()] });
  const { controller } = build({ store });
  await controller.start();
  await assert.rejects(controller.loadCheckpoint({ caseId: "fixture-a", checkpoint: "no-such-point" }));
  assert.equal(controller.getState().error.message, "This checkpoint is not available.");
  controller.stop();
});

test("noteLocalFailure records the error, and Try again runs its retry once, synchronously", async () => {
  const store = fakeStore();
  const { controller } = build({ store });
  await controller.start();
  let runs = 0;
  controller.noteLocalFailure({ code: "DRAFT", message: "The draft could not be made. Try again." }, () => {
    runs += 1;
  });
  assert.deepEqual(controller.getState().error, { code: "DRAFT", message: "The draft could not be made. Try again." });
  assert.equal(controller.getState().retryable, true);
  const pending = controller.retryLast();
  assert.equal(runs, 1, "a rebuilt draft must open its tab inside the press");
  assert.deepEqual(await pending, { local: true });
  assert.equal(controller.getState().error, null);
  assert.equal(await controller.retryLast(), null, "the retry is used up");
  assert.equal(runs, 1);
  controller.stop();
});

test("without a retry, noteLocalFailure offers Dismiss only", async () => {
  const store = fakeStore();
  const { controller } = build({ store });
  await controller.start();
  controller.noteLocalFailure({ code: "VALIDATION", message: "There is no assisted intake form on screen." });
  assert.equal(controller.getState().retryable, false);
  assert.equal(await controller.retryLast(), null);
  controller.stop();
});

test("a newer error, a dismiss or a sign-out drops the local retry", async () => {
  const store = fakeStore();
  const { controller } = build({ store });
  await controller.start();
  let runs = 0;
  const retry = () => {
    runs += 1;
  };
  controller.noteLocalFailure({ code: "DRAFT", message: "x" }, retry);
  controller.dismissError();
  assert.equal(await controller.retryLast(), null);
  controller.noteLocalFailure({ code: "DRAFT", message: "x" }, retry);
  await assert.rejects(controller.runAction("SUBMIT", { confirmed: true })); // a refusal: a newer error
  assert.equal(await controller.retryLast(), null);
  controller.noteLocalFailure({ code: "DRAFT", message: "x" }, retry);
  await controller.signOut();
  assert.equal(await controller.retryLast(), null);
  assert.equal(runs, 0);
  controller.stop();
});

test("a local failure during a failed save falls back to unsaved and keeps the draft", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} }],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("case-a");
  controller.editAnswers({ tp_first_name: "Mei" });
  const realAct = store.act;
  store.act = async () => {
    throw Object.assign(new Error("offline"), { code: "OFFLINE" });
  };
  await assert.rejects(controller.saveAnswers());
  assert.equal(controller.getState().saveState, "failed");
  controller.noteLocalFailure({ code: "DRAFT", message: "The draft could not be made. Try again." }, () => {});
  const state = controller.getState();
  assert.equal(state.saveState, "unsaved");
  assert.equal(state.dirty, true, "the draft is still here");
  assert.equal(state.error.code, "DRAFT");
  store.act = realAct;
  assert.deepEqual(await controller.retryLast(), { local: true }, "Try again is the draft's, not the dropped save's");
  controller.stop();
});

test("retryLast still replays a pending action when no local retry is pending", async () => {
  const store = fakeStore({
    cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} }],
  });
  const { controller } = build({ store });
  await controller.start();
  await controller.selectCase("case-a");
  controller.editAnswers({ tp_first_name: "Mei" });
  const realAct = store.act;
  store.act = async () => {
    throw Object.assign(new Error("offline"), { code: "OFFLINE" });
  };
  await assert.rejects(controller.saveAnswers());
  assert.equal(controller.getState().retryable, true);
  store.act = realAct;
  const replay = await controller.retryLast();
  assert.ok(replay && !replay.local, "a replayed save is not a local retry");
  controller.stop();
});
```

- If `store.act` isn't the fake's write path for a save, use the offline pattern at `tests/controller.test.mjs:624–640`, and say so in the report.
- If `"OFFLINE"` isn't in `UNKNOWN_OUTCOME`, so `retryable` stays false, use a code that is. Read `UNKNOWN_OUTCOME` first.

In `tests/client-language.test.mjs:384`, widen the scrape so refusals keep their 简体 check:

```js
  const errorsThrown = [...controller.matchAll(/(?:controllerError|refuse)\(\s*"[A-Z_]+"\s*,\s*("(?:[^"\\]|\\.)*")/g)].map((m) => literal(m[1]));
```

- [ ] **Step 2: Run them to see them fail**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/controller.test.mjs`
Expected: FAIL. `state.error` is null after a refusal, and `noteLocalFailure` is not a function.

- [ ] **Step 3: Implement** (in `src/controller.mjs`)

```js
  // One local retry (design D3): what Try again runs for a failure outside the
  // store's actions. Any newer error drops it; only noteLocalFailure and
  // noteUnloaded set it, after recording.
  let localRetry = null;
  function setLocalRetry(fn) {
    localRetry = typeof fn === "function" ? fn : null;
    state.retryable = Boolean(localRetry);
  }

  function noteFailure(error, { message } = {}) {
    localRetry = null;
    state.error = {
      code: error?.code ?? "SERVER_ERROR",
      message: message ?? error?.message ?? "Something went wrong.",
    };
    if (error?.code === "OFFLINE") state.connection = "offline";
  }

  // One error at a time (design D2): a newer error replaces a failed save's.
  // The draft stays and goes with the next move or save.
  function replaceFailedSave() {
    if (state.saveState !== "failed") return;
    forgetPendingSave();
    state.saveState = "unsaved";
  }

  // A refusal the window makes itself: recorded, drawn, then thrown.
  function refuse(code, message) {
    replaceFailedSave();
    noteFailure({ code }, { message });
    state.retryable = false;
    show();
    return controllerError(code, message);
  }

  function noteLocalFailure(error, retry = null) {
    replaceFailedSave();
    noteFailure(error ?? {}, { message: error?.message ?? "Something went wrong." });
    setLocalRetry(retry);
    show();
  }
```

- Replace each listed `throw controllerError(code, message)` with `throw refuse(code, message)`; keep their messages. Leave the one at 1981, which already records.
- `requirePresenter` becomes `if (!presenter()) throw refuse("FORBIDDEN", message);`.
- `forgetPendingSave` must be defined before `replaceFailedSave` is called (function declarations hoist; check it isn't a `const`).
- `dismissError` and `forgetUser` set `localRetry = null`. Every other path that clears or replaces the error goes through `noteFailure` or sets `state.error = null`. A local retry left behind is harmless, since `retryLast` runs it only while an error shows.
- `retryLast`'s first branch, before any `await`:

```js
  async function retryLast() {
    if (localRetry && state.error) {
      const run = localRetry;
      localRetry = null;
      state.error = null;
      state.retryable = false;
      show();
      // Called before anything is awaited: a draft rebuilt here opens its tab
      // inside the press, as viewDraft does.
      await run();
      return { local: true };
    }
    localRetry = null;
    if (!pendingAction) return null;
    // …unchanged…
```

- Return `noteLocalFailure` from the API object, next to `dismissError`.

- [ ] **Step 4: Run the tests**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
Expected: PASS. Existing tests that asserted `state.error` is null after a refusal are changed on purpose; list each in the report.

- [ ] **Step 5: Commit**

```bash
git add src/controller.mjs tests/controller.test.mjs tests/client-language.test.mjs
git commit -F <scratchpad>/commit-task1.txt
```

Message: "Refusals are recorded before they are thrown; one error at a time; one local retry", then the trailer.

---

### Task 2: The toast

**Files:**
- Create: `src/toast.mjs`, `tests/toast.test.mjs`
- Modify:
  - `src/views.mjs` (`page` at line 131 stops rendering `#toast`; new `toastParts`);
  - `src/app.mjs`:
    - `notify` at 494;
    - every call site in the table;
    - the three catches at 1578, 1653 and 1696;
    - `fillAssistedIntake` at 831;
    - the `pendingToast` path at 257;
    - the press handlers' start;
  - `src/ui.mjs` (icons `info`, `warning`);
  - `src/styles.css` (`.toast` rules at 1583–1605, and the media-query `.toast` blocks at about 1870, 2090 and 2377).
- Test: `tests/toast.test.mjs`, `tests/client-views.test.mjs`, `tests/shell.test.mjs`

**Interfaces:**
- Consumes: `controller.noteLocalFailure` (Task 1).
- Produces:
  - `src/toast.mjs`: `TOAST_MS`, `TOAST_ICONS`, `createToastTimer({ setTimer, clearTimer, onHide }) → { show(kind), hover(on), focus(on), hide(), shown, kind }`;
  - `src/views.mjs`: `toastParts({ kind, text, lang }) → { icon: string, text: string, dismissLabel: string }`;
  - `app.mjs`: `notify(kind, text, by)`, the host `#toast` (`data-kind`, `.visible`, `.toast-staff`) with `.toast-icon-slot`, `.toast-text[role=status]` and `.toast-dismiss`.

- [ ] **Step 1: Write the failing tests**

`tests/toast.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { TOAST_MS, TOAST_ICONS, createToastTimer } from "../src/toast.mjs";

function clock() {
  let now = 0;
  let next = 1;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => {
      const id = next++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers])
        if (timer.at <= now) {
          timers.delete(id);
          timer.fn();
        }
    },
  };
}

test("the toast's times and icons", () => {
  assert.deepEqual(TOAST_MS, { success: 5000, info: 5000, warning: 8000 });
  assert.deepEqual(TOAST_ICONS, { success: "check", info: "info", warning: "warning" });
});

test("success and information leave after 5 s, warnings after 8 s", () => {
  for (const [kind, ms] of [["success", 5000], ["info", 5000], ["warning", 8000]]) {
    const c = clock();
    let hidden = 0;
    const toast = createToastTimer({ ...c, onHide: () => (hidden += 1) });
    toast.show(kind);
    c.advance(ms - 1);
    assert.equal(hidden, 0, `${kind} still shows`);
    c.advance(1);
    assert.equal(hidden, 1, `${kind} has gone`);
    assert.equal(toast.shown, false);
  }
});

test("the pointer or focus holds the toast, and the full time starts again when both leave", () => {
  const c = clock();
  let hidden = 0;
  const toast = createToastTimer({ ...c, onHide: () => (hidden += 1) });
  toast.show("success");
  c.advance(4000);
  toast.hover(true);
  c.advance(60000);
  assert.equal(hidden, 0, "held while the pointer is over it");
  toast.focus(true);
  toast.hover(false);
  c.advance(60000);
  assert.equal(hidden, 0, "still held by focus");
  toast.focus(false);
  c.advance(4999);
  assert.equal(hidden, 0, "the full time again");
  c.advance(1);
  assert.equal(hidden, 1);
});

test("a new toast replaces the current one and its timer", () => {
  const c = clock();
  let hidden = 0;
  const toast = createToastTimer({ ...c, onHide: () => (hidden += 1) });
  toast.show("success");
  c.advance(4000);
  toast.show("warning");
  assert.equal(toast.kind, "warning");
  c.advance(7999);
  assert.equal(hidden, 0, "the first timer is gone");
  c.advance(1);
  assert.equal(hidden, 1);
});

test("hide hides at once, and an unknown kind is refused", () => {
  const c = clock();
  let hidden = 0;
  const toast = createToastTimer({ ...c, onHide: () => (hidden += 1) });
  toast.show("info");
  toast.hide();
  assert.equal(hidden, 1);
  toast.hide();
  assert.equal(hidden, 1, "hiding a hidden toast says nothing");
  assert.throws(() => toast.show("error"), /kind/);
});
```

`tests/client-views.test.mjs` (import `toastParts` from `../src/views.mjs`):

```js
test("a toast's parts: an icon, the text, and a Dismiss label in the screen's language", () => {
  const parts = toastParts({ kind: "success", text: "Your answers are saved.", lang: "en" });
  assert.match(parts.icon, /<svg class="icon toast-icon[^"]*"[^>]*aria-hidden="true"/);
  assert.equal(parts.text, "Your answers are saved.");
  assert.equal(parts.dismissLabel, "Dismiss");
  assert.equal(toastParts({ kind: "info", text: "x", lang: "zh-Hans" }).dismissLabel, "关闭");
  assert.throws(() => toastParts({ kind: "error", text: "x", lang: "en" }), /kind/);
});
```

Add to the same file a page test: `page(...)` (as at line 586) no longer contains `id="toast"`.

`tests/shell.test.mjs`:
- **In "app.mjs writes no client text of its own…"** (line 788):
  - The first regex becomes `/notify\(\s*"(?:success|info|warning)",\s*(["'`])((?:(?!\1).)*)\1/g`.
  - The literal loop reads `call.replace(/^\s*"(success|info|warning)",\s*/, "")`.
  - Add:

```js
  for (const call of calls)
    assert.match(call, /^\s*"(success|info|warning)",/, `a toast without a kind: notify(${call.slice(0, 60)}…)`);
```

  - Remove `"There is no assisted intake form on screen."` from `STAFF_ONLY_TOASTS`.
  - Replace the two error-path assertions (812–813) with:

```js
  // Errors never toast (design D1).
  assert.doesNotMatch(app, /notify\([^)]*error/);
  assert.match(app, /notify\("success", t\("toast\.saved"/);
  assert.match(app, /notify\("warning", t\("toast\.confirm_first"/);
  assert.match(app, /notify\("warning", t\("toast\.needs_change"/);
  assert.match(app, /import \{ TOAST_MS[^}]*\} from "\.\/toast\.mjs"|createToastTimer/);
```

- **Line 361:** `notify\("success", t\("toast\.started", \{\}, screenLang\(\)\), by\)`.
- **Line 857:** `notify\("warning", t\(pendingToast, \{\}, lang\)\)`. Drop the `if (pendingToast…` host-existence part if the code no longer checks `#toast`; keep `pendingToast = null`.
- **Line 861:** the set-language pin reads `notify\("warning", t\("toast\.hant_failed", \{\}, screenLang\(\)\), by\)`.
- **Line 889:** `notify\("success", t\("toast\.saved"`.
- **Line 964:** `function notify\(kind, text, by\) \{\s+if \(by !== undefined && by !== signedInUserId\(\)\) return;`.
- **Lines 974–975:** the three catches:

```js
  const net = /\} catch \(error\) \{\s+\/\/[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*safetyNet\(error, by, shown\);/g;
  assert.equal([...click.matchAll(net)].length, 1, "the click handler's catch is the safety net");
  assert.equal([...submit.matchAll(net)].length, 2, "both submit catches are the safety net");
```

  plus a pin that both handlers take `const shown = controller.getState().error;` right after `const by = signedInUserId();`.
- **Lines 1001–1010:** `BEFORE_ANY_AWAIT` entries gain their kind, `'"warning", t("toast.confirm_first", {}, screenLang())'` and `'"warning", "Say what you helped with before resolving this request."'`. `awaitsBefore` searches `notify(${message})` with those strings.
- **Lines 1029–1033:** `said >= 24` becomes the new measured count. Count it and set the floor to it, saying the number in the report.

A new test for the safety net and the host:

```js
test("the safety net and the toast host (design D1, D4)", () => {
  const app = appSource();
  const net = app.slice(app.indexOf("function safetyNet("), app.indexOf("function safetyNet(") + 900);
  assert.match(net, /if \(by !== signedInUserId\(\)\) return;/);
  assert.match(net, /const state = controller\.getState\(\);\s*if \(!state\.principal \|\| state\.authError\) return;/);
  assert.match(net, /if \(state\.error !== shown\) return;/);
  assert.match(net, /controller\.noteLocalFailure\(/);
  assert.match(app, /root\.after\(toastHost\)/);
  assert.match(app, /setAttribute\("role", "status"\)/);
  assert.doesNotMatch(app, /toastHost\.setAttribute\("role"/, "the live region is the text span, not the host");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/toast.test.mjs tests/client-views.test.mjs tests/shell.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/toast.mjs`:

```js
// The toast's timer (design D4), with no DOM: app.mjs wires the page to it.
// Five seconds for success and information, eight for a warning. The pointer
// over the toast or focus inside it holds it; when both have left, the full
// time starts again.
export const TOAST_MS = Object.freeze({ success: 5000, info: 5000, warning: 8000 });
export const TOAST_ICONS = Object.freeze({ success: "check", info: "info", warning: "warning" });

export function createToastTimer({ setTimer, clearTimer, onHide }) {
  let kind = null;
  let shown = false;
  let hovered = false;
  let focused = false;
  let timer = null;
  const stop = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const arm = () => {
    stop();
    if (shown && !hovered && !focused) timer = setTimer(hide, TOAST_MS[kind]);
  };
  function show(next) {
    if (!Object.hasOwn(TOAST_MS, next)) throw new Error(`unknown toast kind: ${next}`);
    kind = next;
    shown = true;
    hovered = false;
    focused = false;
    arm();
  }
  function hide() {
    stop();
    const was = shown;
    shown = false;
    hovered = false;
    focused = false;
    if (was) onHide();
  }
  return {
    show,
    hide,
    hover(on) {
      hovered = Boolean(on);
      arm();
    },
    focus(on) {
      focused = Boolean(on);
      arm();
    },
    get shown() {
      return shown;
    },
    get kind() {
      return kind;
    },
  };
}
```

`src/ui.mjs`, in `paths`:

```js
  info: "M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  warning: "M12 3 2 21h20L12 3ZM12 10v5M12 18h.01",
```

`src/views.mjs` (import `TOAST_ICONS` from `./toast.mjs`):

```js
// The toast's parts (design D4). Its host lives outside the page, in app.mjs.
export function toastParts({ kind, text, lang = "en" }) {
  if (!Object.hasOwn(TOAST_ICONS, kind)) throw new Error(`unknown toast kind: ${kind}`);
  return {
    icon: icon(TOAST_ICONS[kind], "toast-icon"),
    text: String(text ?? ""),
    dismissLabel: t("frame.dismiss", {}, lang),
  };
}
```

and drop `<div class="toast" id="toast" role="status" aria-live="polite"></div>` from `page`.

`src/app.mjs` (import `createToastTimer` from `./toast.mjs`; `icon` from `./ui.mjs` if not imported). This replaces `notify`'s old body and `toastTimer`:

```js
  // The toast (design D4): one host beside #app, made once, never redrawn.
  // The live region is the text span; the Dismiss sits outside it.
  const toastHost = document.createElement("div");
  toastHost.id = "toast";
  toastHost.className = "toast";
  const toastIcon = document.createElement("span");
  toastIcon.className = "toast-icon-slot";
  const toastText = document.createElement("span");
  toastText.className = "toast-text";
  toastText.setAttribute("role", "status");
  toastText.setAttribute("aria-live", "polite");
  const toastDismiss = document.createElement("button");
  toastDismiss.type = "button";
  toastDismiss.className = "toast-dismiss";
  toastDismiss.innerHTML = icon("close");
  toastHost.append(toastIcon, toastText, toastDismiss);
  root.after(toastHost);
  let toastCameFrom = null;
  const toast = createToastTimer({
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: (id) => window.clearTimeout(id),
    onHide: () => {
      const hadFocus = toastHost.contains(document.activeElement);
      toastHost.classList.remove("visible");
      toastText.textContent = "";
      if (hadFocus) {
        const back = toastCameFrom?.isConnected ? toastCameFrom : root.querySelector("#main");
        back?.focus({ preventScroll: true });
      }
      toastCameFrom = null;
    },
  });
  toastHost.addEventListener("mouseenter", () => toast.hover(true));
  toastHost.addEventListener("mouseleave", () => toast.hover(false));
  toastHost.addEventListener("focusin", (event) => {
    if (!toastHost.contains(event.relatedTarget)) toastCameFrom = event.relatedTarget ?? null;
    toast.focus(true);
  });
  toastHost.addEventListener("focusout", (event) => {
    if (!toastHost.contains(event.relatedTarget)) toast.focus(false);
  });
  toastDismiss.addEventListener("click", () => toast.hide());
  toastHost.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      toast.hide();
    }
  });

  // On a staff screen bottom right; above Add a case's bar while it is sticky
  // and on screen. Re-measured on scroll and resize while the toast shows.
  function placeToast() {
    toastHost.classList.toggle("toast-staff", controller.getState().principal?.access === "presenter");
    const bar = root.querySelector(".add-case-bar");
    let lift = 0;
    if (bar && getComputedStyle(bar).position === "sticky") {
      const rect = bar.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) lift = Math.ceil(rect.height);
    }
    toastHost.style.setProperty("--toast-lift", `${lift}px`);
  }
  window.addEventListener("scroll", () => toast.shown && placeToast(), { passive: true });
  window.addEventListener("resize", () => toast.shown && placeToast());

  function notify(kind, text, by) {
    if (by !== undefined && by !== signedInUserId()) return;
    const parts = views.toastParts({ kind, text, lang: screenLang() });
    toastIcon.innerHTML = parts.icon;
    toastText.textContent = parts.text;
    toastDismiss.setAttribute("aria-label", parts.dismissLabel);
    toastHost.dataset.kind = kind;
    toastHost.classList.add("visible");
    placeToast();
    toast.show(kind);
  }
```

- **Where `notify` and the host are defined:** after `controller` is created, since `placeToast` reads `controller.getState()`. `notify` is only ever called after `controller.start()`, so this holds. If the current `notify` sits above the controller's creation, move these lines below it.
- **`render`:** remove the `#toast` lookups and call `placeToast()` at its end. `pendingToast` becomes `if (pendingToast) { notify("warning", t(pendingToast, {}, lang)); pendingToast = null; }`.
- **Every call site:** gets its kind from the table.
- **`fillAssistedIntake`'s missing-form branch:** `controller.noteLocalFailure({ code: "VALIDATION", message: "There is no assisted intake form on screen." });`.
- **The click and submit handlers:** after `const by = signedInUserId();`, add `const shown = controller.getState().error;`.
- **The safety net:**

```js
  // Errors never toast (design D1). The controller records what it refuses
  // and what fails; this only makes sure a press never fails silently. The
  // sign-in form states its own failures.
  function safetyNet(error, by, shown) {
    if (by !== signedInUserId()) return;
    const state = controller.getState();
    if (!state.principal || state.authError) return;
    if (state.error !== shown) return;
    const known = typeof error?.message === "string" && Object.hasOwn(SENTENCES, error.message);
    controller.noteLocalFailure({ code: error?.code ?? "SERVER_ERROR", message: known ? error.message : "Something went wrong." });
  }
```

  `SENTENCES` comes from `./client-text.mjs`. The three catches become `} catch (error) {` + a one-line comment + `safetyNet(error, by, shown);` (1653 keeps its `return;` after it).

`src/styles.css`: replace `.toast` and `.toast.visible` (1583–1605), and delete the three media-query `.toast` blocks:

```css
/* The toast (design D4): bottom centre for clients, bottom right for staff,
   lifted above Add a case's bar. Hidden means out of the Tab order. */
.toast {
  position: fixed;
  bottom: calc(24px + var(--toast-lift, 0px));
  left: 50%;
  z-index: 80;
  display: flex;
  align-items: center;
  gap: 12px;
  width: max-content;
  max-width: min(440px, calc(100vw - 32px));
  padding: 6px 6px 6px 18px;
  border-left: 4px solid var(--toast-edge, #6a5acd);
  border-radius: 10px;
  background: #fff;
  color: var(--vt-ink);
  box-shadow: 0 12px 32px rgb(42 39 69 / 0.18);
  font-size: 15px;
  line-height: 1.4;
  opacity: 0;
  visibility: hidden;
  transform: translate(-50%, 12px);
  transition: opacity 0.2s, transform 0.2s, visibility 0s linear 0.2s;
}
.toast.visible {
  opacity: 1;
  visibility: visible;
  transform: translate(-50%, 0);
  transition: opacity 0.2s, transform 0.2s, visibility 0s;
}
.toast.toast-staff { left: auto; right: 24px; transform: translateY(12px); }
.toast.toast-staff.visible { transform: none; }
.toast[data-kind="success"] { --toast-edge: #2f8a4c; }
.toast[data-kind="info"] { --toast-edge: #6a5acd; }
.toast[data-kind="warning"] { --toast-edge: #a07c32; }
.toast .toast-icon-slot { display: flex; color: var(--toast-edge); }
.toast .toast-icon { width: 20px; height: 20px; }
.toast .toast-text { flex: 1; padding: 8px 0; }
.toast .toast-dismiss {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #6c6886;
  cursor: pointer;
}
.toast .toast-dismiss:hover,
.toast .toast-dismiss:focus-visible { background: var(--vt-primary-soft); }
```

- [ ] **Step 4: Run the tests**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
Then: `node --check src/app.mjs`.
Expected: PASS. `tests/server.test.mjs` requests every `src/*.mjs`, so `src/toast.mjs` is served.

- [ ] **Step 5: Commit**

```bash
git add src/toast.mjs src/views.mjs src/app.mjs src/ui.mjs src/styles.css tests/toast.test.mjs tests/shell.test.mjs tests/client-views.test.mjs
git commit -F <scratchpad>/commit-task2.txt
```

Message: "The toast: three kinds, a Dismiss, 5/8 s with pause, its own host; errors never toast", then the trailer.

---

### Task 3: A draft that couldn't be built goes to the banner

**Files:**
- Modify: `src/app.mjs` (`viewDraft` at 1083 and its catch at 1126–1129; the `retry-action` case at 1523), `src/client-text.mjs` (`SENTENCES`), `src/zh-hant.mjs` (generated)
- Test: `tests/shell.test.mjs`, `tests/client-views.test.mjs`

**Interfaces:**
- Consumes: `controller.noteLocalFailure`, `controller.retryLast` (Task 1); `notify` (Task 2).

- [ ] **Step 1: Write the failing tests**

`tests/shell.test.mjs`, beside the `draft.failed` pins at line 365:

```js
  // A draft that couldn't be built is an error (design D1).
  const viewDraftFn = app.slice(app.indexOf("async function viewDraft("), app.indexOf("async function viewDraft(") + 6000);
  assert.match(viewDraftFn, /writeTab\(tab, t\("draft\.failed", \{\}, screenLang\(\)\)\)/);
  assert.match(viewDraftFn, /controller\.noteLocalFailure\(\s*\{\s*code: "DRAFT",\s*message: error\?\.draftFont \? "The draft font could not be checked\. Try again later\." : "The draft could not be made\. Try again\."\s*\},\s*\(\) => viewDraft\(form, by, kind\),?\s*\)/);
  assert.match(viewDraftFn, /if \(controller\.getState\(\)\.error\?\.code === "DRAFT"\) controller\.dismissError\(\);/);
  assert.doesNotMatch(viewDraftFn, /notify\([^)]*draft\.(failed|font_unchecked)/);
  assert.match(app, /const sent = await controller\.retryLast\(\);\s*if \(sent && !sent\.local\) notify\("success", t\("toast\.sent_again"/);
```

`tests/client-views.test.mjs`:

```js
test("the draft banner's sentences speak the screen's language", () => {
  assert.equal(sentence("The draft could not be made. Try again.", "zh-Hans"), "无法生成草稿。请再试一次。");
  assert.equal(sentence("The draft font could not be checked. Try again later.", "zh-Hans"), "无法核对草稿所用的字体。请稍后再试。");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/shell.test.mjs tests/client-views.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement**

- **After a draft is built and offered** (where `draftOffers.offer(...)` or the tab's navigation succeeds), add `if (controller.getState().error?.code === "DRAFT") controller.dismissError();`.
- **The catch:**

```js
    } catch (error) {
      if (tab && !tab.closed) writeTab(tab, t("draft.failed", {}, screenLang()));
      if (by !== signedInUserId()) return;
      controller.noteLocalFailure(
        {
          code: "DRAFT",
          message: error?.draftFont ? "The draft font could not be checked. Try again later." : "The draft could not be made. Try again.",
        },
        () => viewDraft(form, by, kind),
      );
    }
```

- **The `retry-action` case:** `if (sent && !sent.local) notify("success", t("toast.sent_again", {}, screenLang()), by);`.
- **`SENTENCES`:**

```js
  // app.mjs viewDraft: the banner's words for a draft that couldn't be built
  "The draft could not be made. Try again.": "无法生成草稿。请再试一次。",
  "The draft font could not be checked. Try again later.": "无法核对草稿所用的字体。请稍后再试。",
```

Run `npm run build:hant`.

- [ ] **Step 4: Run the tests**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
Then: `npm run build:hant -- --check`.
Expected: PASS, and clean.

- [ ] **Step 5: Commit**

```bash
git add src/app.mjs src/client-text.mjs src/zh-hant.mjs tests/shell.test.mjs tests/client-views.test.mjs
git commit -F <scratchpad>/commit-task3.txt
```

Message: "A draft that couldn't be built goes to the problem banner, and Try again rebuilds it", then the trailer.

---

### Task 4: Lists that are loading or couldn't load

**Files:**
- Modify:
  - `src/controller.mjs`: the initial state near line 256; `loadList` 645; `loadAssistance` 655; `load`'s data section 879–888; `refresh` 682–720; `forgetUser` 1031; `getState`;
  - `src/ui.mjs`: `loadingLine`, `unloadedLine`, icon `spinner`;
  - `src/views.mjs`: `staffScreen` 205–300 passes `list`; `addCasePage` 317–320;
  - `src/staff-views.mjs`: `renderStaffBoard` 566;
  - `src/pool-views.mjs`: `renderCasePool` 118;
  - `src/office-views.mjs`: `renderFollowups` 214;
  - `src/client-views.mjs`: `applicationsScreen` 120;
  - `src/client-text.mjs`, `src/zh-hant.mjs`, `src/styles.css`.
- Test: `tests/controller.test.mjs`, `tests/ui.test.mjs`, `tests/staff-views.test.mjs`, `tests/pool-views.test.mjs`, `tests/office-views.test.mjs`, `tests/client-views.test.mjs`, `tests/shell.test.mjs`

**Interfaces:**
- Consumes: `setLocalRetry`, `noteFailure` (Task 1).
- Produces:
  - `state.lists: { cases, assistance }`, each `"loading" | "ready" | "failed"`;
  - `loadingLine(text)` and `unloadedLine(text)` in `src/ui.mjs`;
  - `ui.list` (default `"ready"`) on `renderStaffBoard`, `renderCasePool` and `renderFollowups`.

- [ ] **Step 1: Write the failing tests**

`tests/controller.test.mjs`:

```js
const offlineList = () => async () => {
  throw Object.assign(new Error("offline"), { code: "OFFLINE" });
};

test("a list that never loaded says so, and Try again reads everything again", async () => {
  const store = presenterStore({ cases: [sampleCase()] });
  const realList = store.listCases;
  store.listCases = offlineList();
  const { controller } = build({ store });
  assert.equal(controller.getState().lists.cases, "loading");
  await controller.start();
  assert.equal(controller.getState().lists.cases, "failed");
  assert.equal(controller.getState().retryable, true);
  store.listCases = realList;
  store.calls.length = 0;
  assert.deepEqual(await controller.retryLast(), { local: true });
  const state = controller.getState();
  assert.equal(state.lists.cases, "ready");
  assert.equal(state.lists.assistance, "ready");
  assert.equal(state.cases.length, 1);
  assert.ok(store.calls.includes("listPeople"), "the people are read again");
  assert.ok(state.people.length > 0);
  assert.ok(state.workspace, "the workspace is read again");
  controller.stop();
});

test("a list that loaded once keeps its cases when a reload fails", async () => {
  const store = fakeStore({ cases: [{ id: "case-a", reference: "VT-AAAA-BBBB", stage: "draft", revision: 1, answers: {} }] });
  const { controller } = build({ store });
  await controller.start();
  assert.equal(controller.getState().lists.cases, "ready");
  store.listCases = offlineList();
  await controller.refresh();
  assert.equal(controller.getState().lists.cases, "ready");
  assert.equal(controller.getState().cases.length, 1);
  controller.stop();
});

test("an applicant's help-request list counts as loaded, and sign-out starts over", async () => {
  const store = fakeStore();
  const { controller } = build({ store });
  await controller.start();
  assert.deepEqual(controller.getState().lists, { cases: "ready", assistance: "ready" });
  await controller.signOut();
  assert.deepEqual(controller.getState().lists, { cases: "loading", assistance: "loading" });
  controller.stop();
});
```

If `presenterStore` has no `listAssistance` or `getWorkspace`-style method the fake reads, add what `loadAssistance`/`loadWorkspace` call, the way the fake's other methods are written, and say so in the report.

`tests/ui.test.mjs`:

```js
test("the loading and couldn't-load lines", () => {
  assert.match(loadingLine("Loading cases…"), /^<p class="loading-line" role="status"><svg class="icon spin"[^>]*aria-hidden="true"[\s\S]*<span>Loading cases…<\/span><\/p>$/);
  assert.match(unloadedLine("The cases couldn't load."), /^<p class="unloaded-line"><svg[\s\S]*<span>The cases couldn&#39;t load\.<\/span><\/p>$/);
  assert.ok(ICON_NAMES.includes("spinner"));
});
```

`tests/shell.test.mjs`:
- Line 615 becomes `assert.match(loading, /<p class="loading-line" role="status">[\s\S]*<span>Loading…<\/span><\/p>/);`.
- A CSS pin, next to the tests at 83 and 93:

```js
test("spinners stand still under reduced motion", () => {
  const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
  assert.match(css, /\.icon\.spin \{ animation: vt-spin [^}]*\}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.icon\.spin \{ animation: none; \}\s*\}/);
});
```

`tests/staff-views.test.mjs` (and the same shape in `tests/pool-views.test.mjs` with `renderCasePool([], PEOPLE, { list, filters: {}, now: NOW })` and "No case matches these filters.", and in `tests/office-views.test.mjs` with `renderFollowups([], [], { person, list, filters: {}, busy: false, now: NOW })` and "Nothing is waiting on the office right now."):

```js
test("the work board while its cases load, and when they couldn't", () => {
  const loading = renderStaffBoard([], PEOPLE, { person: ALEX, list: "loading" });
  assert.match(loading, /Loading cases…/);
  assert.doesNotMatch(loading, /Nothing to claim right now|data-filter="status"|Showing 0/);
  const failed = renderStaffBoard([], PEOPLE, { person: ALEX, list: "failed" });
  assert.match(failed, /The cases couldn&#39;t load\./);
  assert.doesNotMatch(failed, /Nothing to claim right now/);
  assert.match(renderStaffBoard([], PEOPLE, { person: ALEX }), /Nothing to claim right now/, "ready by default");
});
```

`tests/client-views.test.mjs`:

```js
test("the client's applications while they load, and when they couldn't", () => {
  const loading = applicationsScreen(baseState({ cases: [], lists: { cases: "loading", assistance: "ready" } }));
  assert.match(loading, /Loading your applications…/);
  assert.doesNotMatch(loading, /No applications yet/);
  const failed = applicationsScreen(baseState({ cases: [], lists: { cases: "failed", assistance: "ready" }, lang: "zh-Hans" }));
  assert.match(failed, /无法载入您的申请。/);
  assert.match(applicationsScreen(baseState({ cases: [] })), /No applications yet/, "no lists means loaded");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
Expected: FAIL in the new tests.

- [ ] **Step 3: Implement**

`src/controller.mjs`:
- **The initial state:** `lists: { cases: "loading", assistance: "loading" },`. `getState()` returns `lists: { ...state.lists }`.
- **`loadList`:** after the read, `state.lists.cases = "ready";`.
- **`loadAssistance`:** `if (!presenter()) { state.lists.assistance = "ready"; return; }`, and after the read `state.lists.assistance = "ready";`.
- **`load()`'s data section** moves into `loadData()`, which `load()` calls in its `try`:

```js
  // Everything the first load reads (design D6): the cases, and for a
  // presenter the people, the help requests and the workspace.
  async function loadData() {
    await loadList();
    if (state.principal?.access === "presenter") {
      state.people = await store.listPeople();
      await loadAssistance();
      await loadWorkspace();
    } else {
      state.lists.assistance = "ready";
    }
  }

  // A list that never loaded and whose read failed says so; one that loaded
  // once keeps what it shows. Try again reads everything again.
  function noteUnloaded() {
    let failed = false;
    for (const key of ["cases", "assistance"])
      if (state.lists[key] !== "ready") {
        state.lists[key] = "failed";
        failed = true;
      }
    if (failed)
      setLocalRetry(async () => {
        try {
          await loadData();
        } catch (error) {
          noteFailure(error);
          noteUnloaded();
        }
        show();
      });
  }
```

- **`load()`'s catch:** `catch (error) { noteFailure(error); noteUnloaded(); }`.
- **`refresh`:** `if (failure) { noteFailure(failure); noteUnloaded(); }`.
- **`forgetUser`:** `state.lists = { cases: "loading", assistance: "loading" };`.

`src/ui.mjs`:

```js
  spinner: "M21 12a9 9 0 1 1-9-9",
```

```js
// One loading pattern (design D6): a spinner and a sentence, as a status.
export const loadingLine = (text) =>
  `<p class="loading-line" role="status">${icon("spinner", "spin")}<span>${esc(text)}</span></p>`;
// A list that never loaded: said plainly, under the banner's Try again.
export const unloadedLine = (text) =>
  `<p class="unloaded-line">${icon("help")}<span>${esc(text)}</span></p>`;
```

The views. Each staff list returns early while not ready, with its section, heading and the line only. Read each function's current section markup and keep its class and heading.
- **`renderStaffBoard`:**

```js
  if (ui.list === "loading" || ui.list === "failed")
    return `<section class="panel staff-board" aria-labelledby="board-title"><div class="section-head"><h2 id="board-title">Work board</h2></div>${
      ui.list === "loading" ? loadingLine("Loading cases…") : unloadedLine("The cases couldn't load.")
    }</section>`;
```

- **`renderCasePool`:** the same with `case-pool`, `pool-title`, "All cases".
- **`renderFollowups`:** the same with its own section class and heading.
- **`staffScreen`:**
  - pass `list: state.lists?.cases ?? "ready"` to the board and the pool;
  - pass `list: combineLists(state.lists?.cases, state.lists?.assistance)` to Follow-ups, with

```js
const combineLists = (...states) => {
  const all = states.map((s) => s ?? "ready");
  return all.includes("failed") ? "failed" : all.includes("loading") ? "loading" : "ready";
};
```

- **`addCasePage`:** returns `loadingLine("Loading…")`.
- **`applicationsScreen`:** `const listState = state.lists?.cases ?? "ready";`, and `list` is `listState === "loading" ? loadingLine(t("apps.loading", {}, lang)) : listState === "failed" ? unloadedLine(t("apps.unloaded", {}, lang)) : <today's expression>`.

`src/client-text.mjs`:

```js
  "apps.loading": { en: "Loading your applications…", zh: "正在载入您的申请…" },
  "apps.unloaded": { en: "Your applications couldn't load.", zh: "无法载入您的申请。" },
```

`src/styles.css`:

```css
.loading-line,
.unloaded-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 24px 0;
  color: #6c6886;
  font-size: 15px;
}
.loading-line .icon,
.unloaded-line .icon { flex: none; width: 20px; height: 20px; }
.unloaded-line { color: #8a3b34; }
@keyframes vt-spin { to { transform: rotate(360deg); } }
.icon.spin { animation: vt-spin 0.9s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .icon.spin { animation: none; }
}
```

Run `npm run build:hant`.

- [ ] **Step 4: Run the tests**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
Then: `npm run build:hant -- --check`.
Expected: PASS. The language sweep (`tests/support/language-sweep.mjs`) may need the two new keys in its 简体 screen states. Add them there if it reports them, and list it in the report.

- [ ] **Step 5: Commit**

```bash
git add src/controller.mjs src/ui.mjs src/views.mjs src/staff-views.mjs src/pool-views.mjs src/office-views.mjs src/client-views.mjs src/client-text.mjs src/zh-hant.mjs src/styles.css tests/controller.test.mjs tests/ui.test.mjs tests/staff-views.test.mjs tests/pool-views.test.mjs tests/office-views.test.mjs tests/client-views.test.mjs tests/shell.test.mjs
git commit -F <scratchpad>/commit-task4.txt
```

Message: "Lists say when they are loading or couldn't load, and Try again reads everything again", then the trailer.

---

### Task 5: Busy buttons

**Files:**
- Modify: `src/app.mjs` (the click handler at 1559, the submit handler at 1634, `render`), `src/presenter-views.mjs` (the checkpoint submit at line 155), `src/styles.css`
- Test: `tests/shell.test.mjs`, `tests/presenter.test.mjs`

**Interfaces:**
- Consumes: `describeFocus`, `focusSelectors` (`src/ui.mjs`); `findField` (`app.mjs:420`); `icon("spinner", "spin")` (Task 4).

- [ ] **Step 1: Write the failing tests**

`tests/presenter.test.mjs`: the checkpoint dialog's submit is `<button type="submit" id="checkpoint-submit" class="btn primary full">Load this checkpoint</button>`.

`tests/shell.test.mjs`:

```js
test("a pressed control is found again after a redraw (design D5)", () => {
  const claim = { id: "", name: "", dataset: { caseAction: "CLAIM_PREPARATION", caseId: "case-7" }, tagName: "BUTTON" };
  const help = { id: "", name: "", dataset: { assistanceAction: "CLAIM", itemId: "help-3" }, tagName: "BUTTON" };
  const checkpoint = { id: "checkpoint-submit", name: "", dataset: {}, tagName: "BUTTON" };
  assert.ok(focusSelectors(describeFocus(claim)).some((s) => s.includes('data-case-action="CLAIM_PREPARATION"') && s.includes('data-case-id="case-7"')));
  assert.ok(focusSelectors(describeFocus(help)).some((s) => s.includes('data-assistance-action="CLAIM"') && s.includes('data-item-id="help-3"')));
  assert.deepEqual(focusSelectors(describeFocus(checkpoint)), ['[id="checkpoint-submit"]']);
});

test("app.mjs marks only the allow-listed press while it runs (design D5)", () => {
  const app = appSource();
  assert.match(app, /const BUSY_ACTIONS = Object\.freeze\(\["confirm-reset-fixtures", "save-office-draft", "send-office-draft"\]\);/);
  const allow = app.slice(app.indexOf("function busyControl("), app.indexOf("function busyControl(") + 600);
  assert.match(allow, /dataset\.caseAction \|\| control\.dataset\.assistanceAction/);
  assert.match(allow, /control\.id === "checkpoint-submit"/);
  assert.match(allow, /BUSY_ACTIONS\.includes\(control\.dataset\.action\)/);
  assert.match(app, /pressed = null;\s*if \(busyControl\(target\)\) pressed = describeFocus\(target\);/);
  assert.match(app, /pressed = null;\s*if \(event\.submitter && busyControl\(event\.submitter\)\) pressed = describeFocus\(event\.submitter\);/);
  const mark = app.slice(app.indexOf("function markPressed("), app.indexOf("function markPressed(") + 900);
  assert.match(mark, /if \(!state\.busy && !state\.officeSaving\) \{\s*pressed = null;\s*return;\s*\}/);
  assert.match(mark, /if \(!pressed \|\| state\.saveState === "saving"\) return;/);
  assert.match(mark, /control\.classList\.contains\("is-busy"\)/);
  assert.match(mark, /setAttribute\("aria-busy", "true"\)/);
  assert.match(mark, /icon\("spinner", "spin"\)/);
  const renderBody = app.slice(app.indexOf("function render(focus = false) {"), app.indexOf("function v2OnPage("));
  assert.match(renderBody, /markPressed\(state\);/);
});
```

Read `focusSelectors` before running: the first test pins today's behaviour for the case and assistance buttons and may pass at once, which is fine. The checkpoint row fails until the id exists only in the markup test.

- [ ] **Step 2: Run them to see them fail**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/shell.test.mjs tests/presenter.test.mjs`
Expected: the marking test and the presenter markup test FAIL.

- [ ] **Step 3: Implement**

`src/presenter-views.mjs:155`: the submit gains `id="checkpoint-submit"`.

`src/app.mjs`:

```js
  // The pressed control (design D5), kept only for the presses that hold the
  // buttons, and found again after every draw while the press runs. A
  // sub-step move is never marked: the save chip says Saving.
  const BUSY_ACTIONS = Object.freeze(["confirm-reset-fixtures", "save-office-draft", "send-office-draft"]);
  function busyControl(control) {
    if (!control?.dataset) return false;
    if (control.dataset.caseAction || control.dataset.assistanceAction) return true;
    if (control.id === "checkpoint-submit") return true;
    return BUSY_ACTIONS.includes(control.dataset.action);
  }
  let pressed = null;
  function markPressed(state) {
    if (!state.busy && !state.officeSaving) {
      pressed = null;
      return;
    }
    if (!pressed || state.saveState === "saving") return;
    const control = findField(pressed);
    if (!control || control.classList.contains("is-busy")) return;
    control.classList.add("is-busy");
    control.setAttribute("aria-busy", "true");
    control.insertAdjacentHTML("afterbegin", icon("spinner", "spin"));
  }
```

- **The click handler**, right after `if (!target) return;`: `pressed = null; if (busyControl(target)) pressed = describeFocus(target);`.
- **The submit handler**, after `const form = event.target;`: `pressed = null; if (event.submitter && busyControl(event.submitter)) pressed = describeFocus(event.submitter);`.
- **`render`**, after `restoreFormDrafts(); showDraftLink();`: `markPressed(state);`.

`src/styles.css`:

```css
/* The pressed button while its press runs (design D5). */
.btn.is-busy { cursor: progress; }
.btn.is-busy .icon.spin { width: 16px; height: 16px; margin-right: 6px; }
```

- [ ] **Step 4: Run the tests**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
Then: `node --check src/app.mjs`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app.mjs src/presenter-views.mjs src/styles.css tests/shell.test.mjs tests/presenter.test.mjs
git commit -F <scratchpad>/commit-task5.txt
```

Message: "The pressed button shows a spinner and aria-busy while its press runs", then the trailer.

---

### Task 6: Errors inside dialogs, and the error looks

**Files:**
- Modify:
  - `src/views.mjs`: `problemBanner` at 96; `dialog` at 361–426; a new `dialogError`;
  - `src/staff-views.mjs`: `problemNotice` 640; `correctionsDialogBody` 1283;
  - `src/office-views.mjs`: `drawerError` 283;
  - `src/styles.css`: the tokens at the top; `.connection-notice`/`.notice-banner`/`.problem-banner` at 2116–2147; `.notice` at 770–790; `.office-drawer .notice.amber` at 3393–3402; `.save-chip.failed` at 2226.
- Test: `tests/client-views.test.mjs`, `tests/staff-views.test.mjs`, `tests/office-views.test.mjs`, `tests/shell.test.mjs`

**Interfaces:**
- Produces: `dialogError(state, lang): string` in `src/views.mjs`.

- [ ] **Step 1: Write the failing tests**

`tests/client-views.test.mjs` (import `dialog` from `../src/views.mjs` if it isn't already; build the states with this file's helpers):

```js
test("an error shows inside the open dialog, and the banner steps aside", () => {
  const error = { code: "VALIDATION", message: "This checkpoint is not available." };
  for (const name of ["help", "regenerate", "leave-add-case", "close-case", "reset-fixtures", "load-checkpoint", "print"]) {
    const state = { ...baseState(), dialog: name, error, retryable: false };
    const html = dialog(state);
    assert.match(html, /<div class="notice error" role="alert" id="dialog-error">[\s\S]*This checkpoint is not available\./, name);
    assert.match(html, /data-action="dismiss-error"/, name);
    assert.doesNotMatch(page(state, "<main></main>"), /class="problem-banner"/, `${name}: no banner behind the dialog`);
  }
});

test("a dialog on the case page holds the only copy of the error", () => {
  // Build a staff case-page state the way this file's staff-case tests do.
  const state = { ...staffCaseState(), dialog: "close-case", error: { code: "SERVER_ERROR", message: "x" }, retryable: false };
  const html = staffScreen(state);
  assert.doesNotMatch(html, /That step did not go through/, "no in-place copy behind the modal");
});
```

Use whatever this file already does to build a presenter state for the presenter dialogs, a case for `close-case` and `print`, and a staff case-page state (`staffCaseState` above stands for it). If a dialog's body needs more state to render at all, give it the minimum and say so in the report.

`tests/office-views.test.mjs:386` and `tests/staff-views.test.mjs:1216` change `notice amber` to `notice error` (on purpose). Add to `tests/staff-views.test.mjs` (import `problemNotice`):

```js
test("the case page's in-place error is an error block with both controls", () => {
  const html = problemNotice({ error: { code: "SERVER_ERROR", message: "x" }, retryable: true });
  assert.match(html, /^<div class="notice error" role="alert">/);
  assert.match(html, /data-action="retry-action"/);
  assert.match(html, /data-action="dismiss-error"/);
});
```

`tests/shell.test.mjs`, a CSS pin:

```js
test("errors share one look (design D7)", () => {
  const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
  for (const token of ["--vt-error-bg: #fbeceb", "--vt-error: #8a3b34", "--vt-notice-bg: #efedfb", "--vt-notice: #4b3fa3", "--vt-attention-bg: #faf0dd"])
    assert.ok(css.includes(token), token);
  assert.match(css, /\.notice\.error p \{[^}]*color: var\(--vt-error\)/);
  assert.match(css, /\.office-drawer \.notice\.error/);
  assert.doesNotMatch(css, /\.office-drawer \.notice\.amber/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
Expected: FAIL in the new and the two changed tests.

- [ ] **Step 3: Implement**

`src/views.mjs`:

```js
// An error while a dialog is open is said inside it (design D2): the page's
// banner is behind an aria-modal and could not be reached or read.
const OWN_ERROR_DIALOGS = Object.freeze([...DRAWERS, "request-corrections"]);
export function dialogError(state, lang) {
  if (!state.error || !state.dialog || OWN_ERROR_DIALOGS.includes(state.dialog)) return "";
  const say = (key) => esc(t(key, {}, lang));
  return `<div class="notice error" role="alert" id="dialog-error">${icon("help")}<div><p>${esc(sentence(state.error.message, lang))}</p><div class="conflict-choices">${when(
    state.retryable,
    button(say("frame.try_again"), "retry-action", "secondary"),
  )}${button(say("frame.dismiss"), "dismiss-error", "text")}</div></div></div>`;
}
```

- **`dialog`:** builds the body as `${dialogError(state, lang)}${body}`.
- **`problemBanner`:** returns `""` whenever `state.dialog` is set. This replaces the `DRAWERS.includes(state.dialog)` line, and the comment says why.
- **`problemNotice`, `drawerError` and `correctionsDialogBody`'s refused block:** `notice amber` becomes `notice error`.
- **`staffScreen`:** the case page's `ui.error` is `state.dialog ? null : state.error`, so a dialog opened from the case page (close case, log a call) holds the only copy of the error.

`src/styles.css`:
- Add to the first `:root` block:

```css
  --vt-error-bg: #fbeceb;
  --vt-error: #8a3b34;
  --vt-notice-bg: #efedfb;
  --vt-notice: #4b3fa3;
  --vt-attention-bg: #faf0dd;
```

- The banners keep their layout rule and size, with their colours replaced:

```css
.connection-notice { background: var(--vt-attention-bg); color: var(--vt-stage-amend); }
.notice-banner { background: var(--vt-notice-bg); color: var(--vt-notice); }
.problem-banner { background: var(--vt-error-bg); color: var(--vt-error); }
.notice-banner .btn.inline,
.problem-banner .btn.inline { margin-left: auto; color: inherit; }
```

  The shared rule at 2116 loses its `background`/`color`; its padding and font size stay.
- The in-place error block, after `.notice.amber` (770–790):

```css
.notice.error {
  background: var(--vt-error-bg);
  border: 1px solid #efc9c5;
  color: var(--vt-error);
}
.notice.error h3,
.notice.error p { color: var(--vt-error); }
```

- `.office-drawer .notice.amber` (3393–3402) becomes `.office-drawer .notice.error`, keeping its spacing and taking the error colours.
- `.save-chip.failed`:

```css
.save-chip.failed {
  color: var(--vt-error);
  background: var(--vt-error-bg);
  border-radius: 7px;
  padding: 4px 10px;
  flex-wrap: wrap;
}
```

- [ ] **Step 4: Run the tests**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views.mjs src/staff-views.mjs src/office-views.mjs src/styles.css tests/client-views.test.mjs tests/staff-views.test.mjs tests/office-views.test.mjs tests/shell.test.mjs
git commit -F <scratchpad>/commit-task6.txt
```

Message: "Errors show inside the open dialog; in-place errors, banners and the failed save chip share DESIGN.md's error look", then the trailer.

---

### Task 7: The connection notice and "back online"

**Files:**
- Modify: `src/views.mjs` (`connectionNotice` 76), `src/app.mjs` (`render`), `src/client-text.mjs`, `src/zh-hant.mjs`
- Test: `tests/client-views.test.mjs`, `tests/shell.test.mjs`

**Interfaces:**
- Consumes: `notify` (Task 2), `icon("spinner", "spin")` (Task 4).

- [ ] **Step 1: Write the failing tests**

`tests/client-views.test.mjs` (import `connectionNotice` from `../src/views.mjs`):

```js
test("the connection notice: reconnecting spins, offline doesn't", () => {
  const reconnecting = connectionNotice({ ...baseState(), connection: "reconnecting" });
  assert.match(reconnecting, /^<div class="connection-notice reconnecting" role="status"><svg class="icon spin"/);
  const offline = connectionNotice({ ...baseState(), connection: "offline" });
  assert.match(offline, /^<div class="connection-notice offline" role="status">/);
  assert.doesNotMatch(offline, /class="icon spin"/);
  assert.equal(connectionNotice({ ...baseState(), connection: "online" }), "");
});

test("back online, in both languages", () => {
  assert.equal(t("toast.back_online", {}, "en"), "You're back online.");
  assert.equal(t("toast.back_online", {}, "zh-Hans"), "已重新连接。");
});
```

`tests/shell.test.mjs`:

```js
test("app.mjs says back online only after a real loss (design D7)", () => {
  const app = appSource();
  const renderBody = app.slice(app.indexOf("function render(focus = false) {"), app.indexOf("function v2OnPage("));
  assert.match(renderBody, /if \(\["offline", "reconnecting"\]\.includes\(drawnConnection\) && state\.connection === "online"\)\s*notify\("info", t\("toast\.back_online", \{\}, lang\)\);\s*drawnConnection = state\.connection;/);
  assert.match(app, /let drawnConnection = "unknown";/);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

`connectionNotice`:

```js
export function connectionNotice(state) {
  if (state.connection === "online" || state.connection === "unknown") return "";
  const reconnecting = state.connection === "reconnecting";
  return `<div class="connection-notice ${reconnecting ? "reconnecting" : "offline"}" role="status">${
    reconnecting ? icon("spinner", "spin") : icon("clock")
  }<span>${esc(t(reconnecting ? "frame.reconnecting" : "frame.offline", {}, viewLang(state)))}</span></div>`;
}
```

`src/client-text.mjs`: `"toast.back_online": { en: "You're back online.", zh: "已重新连接。" },`.

`src/app.mjs`: `let drawnConnection = "unknown";` beside the other render-time variables. At the end of `render`, after `markPressed(state)` and `placeToast()`:

```js
    // Back online after a real loss, never on the first connection (design D7).
    if (["offline", "reconnecting"].includes(drawnConnection) && state.connection === "online")
      notify("info", t("toast.back_online", {}, lang));
    drawnConnection = state.connection;
```

Run `npm run build:hant`.

- [ ] **Step 4: Run the tests**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
Then: `npm run build:hant -- --check`.
Expected: PASS, and clean.

- [ ] **Step 5: Commit**

```bash
git add src/views.mjs src/app.mjs src/client-text.mjs src/zh-hant.mjs tests/client-views.test.mjs tests/shell.test.mjs
git commit -F <scratchpad>/commit-task7.txt
```

Message: "The connection notice spins while reconnecting, and a returning connection says so", then the trailer.

---

### Task 8: The story, the docs and the checks

**Files:**
- Modify: `tests/support/story-pages.mjs` (`waitForQuiet` at 210; `watchAlerts` at 530), `tests/browser.mjs` (`openWindow` at 238 and the other page creations at 244, 2737, 4523; around lines 398, 2495, 3826, 4196–4210, 4285–4330, 4535), `docs/developer/frontend.md`, `docs/developer/README.md:105`, `docs/setup.md:415`
- The controller runs `npm run test:browser` and `npm run test:auth-browser`.

- [ ] **Step 1: The story's helpers** (`tests/support/story-pages.mjs`)
- **`watchAlerts`:** also observe `#toast`. After the `#app` observer, add `const toast = document.querySelector("#toast"); if (toast) new MutationObserver(sweep).observe(toast, { childList: true, subtree: true, characterData: true });`. Its comment says the toast now carries only successes, information and warnings.
- **`waitForQuiet`:** observes `#toast` the same way.
- **A new exported `guardToast(page)`** registers a locator handler, so a visible toast never blocks or pauses an action:

```js
// A visible toast takes the pointer (it has a Dismiss) and holds itself while
// hovered, so an action aimed under it would wait. Dismiss it first, then move
// the pointer to the top centre: (0, 0) is the staff sidebar toggle.
export async function guardToast(page) {
  await page.addLocatorHandler(page.locator("#toast.visible"), async () => {
    await page.locator("#toast .toast-dismiss").click({ timeout: CLICK_MS });
    const width = page.viewportSize()?.width ?? 1280;
    await page.mouse.move(Math.floor(width / 2), 2);
  }, { noWaitAfter: true });
}
```

- **Call `guardToast`** in `tests/browser.mjs`'s `openWindow` (238), after the page creations at 244, 2737 and 4523, and after any reload that re-installs `watchAlerts`.

- [ ] **Step 2: The story's checks** (`tests/browser.mjs`)
- **`shootQuiet`** (4535): before its `waitFor`, dismiss a visible toast the same way (`if (await page.locator("#toast.visible").count()) …`), then move the pointer to the top centre.
- **After the fill toast** (398):

```js
  await page.locator("#toast .toast-dismiss").click({ timeout: CLICK_MS });
  await waitFor(page, "Dismiss to hide the toast", () => !document.querySelector("#toast.visible"), undefined, RENDER_MS);
```

- **After the unconfirmed Submit's toast** (3826): `assert.equal(await page.evaluate(() => document.querySelector("#toast")?.dataset.kind), "warning");`.
- **After the Add a case save** (2495): when its toast shows, assert it sits above the sticky bar:

```js
      const clear = await staff.evaluate(() => {
        const toast = document.querySelector("#toast.visible")?.getBoundingClientRect();
        const bar = document.querySelector(".add-case-bar")?.getBoundingClientRect();
        return !toast || !bar || bar.top >= window.innerHeight || toast.bottom <= bar.top + 1;
      });
      assert.ok(clear, "the toast covers Add a case's bar");
```

- **The draft-failure checks** (4300, 4318): replace `toastSays(...)` with `bannerSays`, beside `toastSays`:

```js
          const bannerSays = (text) =>
            waitFor(
              page,
              `the problem banner to say ${JSON.stringify(text)}`,
              (wanted) => document.querySelector(".problem-banner")?.textContent.includes(wanted),
              text,
              ARRIVAL_MS,
            );
```

  - **The font case** waits for `bannerSays("The draft font could not be checked. Try again later.")`. Then it asserts `#toast` doesn't show it, and dismisses the banner (`clickAction(page, "dismiss-error")`).
  - **The refused-form case** waits for `bannerSays("The draft could not be made. Try again.")` and asserts no toast shows it.
  - **After `page.unroute(formUrl)`:**

```js
          const retried = page.waitForEvent("popup", { timeout: ARRIVAL_MS }).catch(() => null);
          await clickAction(page, "retry-action");
          const again = await retried;
          if (again) {
            assert.equal((await readDraft(again)).head, "%PDF-", "Try again did not rebuild the draft");
            await again.close();
          } else {
            await page.locator(".draft-link, [data-draft-link]").first().waitFor({ state: "visible", timeout: ARRIVAL_MS });
          }
          await waitFor(page, "the draft error to clear", () => !document.querySelector(".problem-banner"), undefined, ARRIVAL_MS);
```

    Read `draftLink` in `src/draft-pdf.mjs` for the link's real selector. Record which path ran in the run's facts.
  - **`DRAFT_FAILED`** stays the tab's text (`tabSays`).
  - The console-error excuse for the refused form stays as it is; the retry logs nothing.

- [ ] **Step 3: The docs**
- **`docs/developer/frontend.md`:** a short "Feedback" section covering:
  - where errors show, and one at a time;
  - `refuse` and `noteLocalFailure` with the local retry;
  - `src/toast.mjs`, the host, its kinds and timings;
  - `lists` and the two lines;
  - busy buttons (`markPressed`, the allow-list);
  - "back online".
- **The unit count:** set it in `docs/developer/README.md:105` and `docs/setup.md:415` to the new total.

- [ ] **Step 4: Checks**

Run, each on its own:
- `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
- `npm run build:hant -- --check`
- `npm run build:intake` (expected: "the newest catalogue migration already records this catalogue")
- `npx openspec validate --all`
- `node --check tests/browser.mjs` and `node --check tests/support/story-pages.mjs`

Then commit:

```bash
git add tests/browser.mjs tests/support/story-pages.mjs docs/developer/frontend.md docs/developer/README.md docs/setup.md
git commit -F <scratchpad>/commit-task8.txt
```

Message: "Story: a toast never blocks a click; Dismiss, kind and position; draft failures in the banner with Try again; docs", then the trailer.

- [ ] **Step 5 (controller): the story and the sign-in suite**

The controller runs `npm run test:browser` (about 16 minutes) in the background, and `npm run test:auth-browser`, again after any fix.

## Self-review

- **Spec coverage:**
  - "Errors are shown where the person is looking…":
    - refusals and the local retry: Task 1;
    - the safety net, and no error toast: Task 2;
    - drafts: Tasks 3 and 8;
    - dialogs and the error look: Task 6;
    - one error at a time: Task 1;
    - sign-in: Task 2's safety-net conditions and the controller's sign-in suite.
  - "A toast confirms, informs or warns…":
    - kinds, times, pause, restart and replace: Task 2 (`tests/toast.test.mjs`);
    - Dismiss, kind and position above the bar: Task 8;
    - the host outside the page: Task 2's pins;
    - focus return, Escape and leaving the Tab order: Task 2's wiring, checked by the story's Dismiss step.
  - "A list says when it is loading or couldn't load": Task 4.
  - "The pressed button shows it is working": Task 5 (the allow-list, no spinner on a sub-step move). The story doesn't hold a press long enough to see it.
  - "The connection notice…": Task 7, and Task 4's reduced-motion pin.
- **Types:**
  - `noteLocalFailure(error, retry)`, `setLocalRetry` and `retryLast() → { local: true }` (Task 1) are used by Tasks 2, 3 and 4.
  - `notify(kind, text, by)` and `toastParts` (Task 2) are used by Tasks 3 and 7.
  - `icon("spinner", "spin")` (Task 4) is used by Tasks 5 and 7.
  - `ui.list` (Task 4) is read by the board, pool and Follow-ups.
  - `dialogError` (Task 6) is used by `dialog`.
- **Placeholders:** none. Some steps let the implementer adapt a test call to the fake store or read a selector first, and say so in the report.
