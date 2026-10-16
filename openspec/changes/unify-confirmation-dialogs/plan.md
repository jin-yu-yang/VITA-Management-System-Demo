# Unify Confirmation Dialogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All six confirmation dialogs render through one shared `confirmBody` with byte-identical markup. While a dialog is open, the page behind it is inert, except the live regions. The Tab trap also holds when focus is on the dialog container.

**Architecture:**
- Three pure helpers go into `src/ui.mjs`, next to `dialogFocusTarget`:
  - `confirmBody` builds the markup;
  - `inertWhileDialog` decides which `#app` children become inert;
  - `trapTarget` decides where Tab goes.
- The six dialog bodies call `confirmBody` with ready-made confirm controls, so actions and payloads stay in their own files.
- `src/app.mjs` applies `inert` after each render, clears it in `closeDialog` before focus returns, and asks `trapTarget` in the keydown handler.

**Tech Stack:** plain ES modules, no framework; `node --test` unit tests (no DOM; fakes and source checks); Playwright browser story (`tests/browser.mjs`).

**Spec:** `openspec/changes/unify-confirmation-dialogs/specs/screen-states/spec.md`. Design: `openspec/changes/unify-confirmation-dialogs/design.md` (D1–D5).

## Global Constraints

- Every action and payload stays exactly as today: `CLOSE_CASE`, `REQUEST_CORRECTIONS`, `confirm-reset-fixtures`, `open-reset-fixtures`, `#checkpoint-submit` in `#checkpoint-form`, `confirm-regenerate`, `confirm-leave-add-case`, and every `close-dialog`.
- Building a dialog from the shared body does not change its words, its action, the action's payload, or its controls' ids. The goal is identical markup, guarded by the golden test from Task 1.
- The live regions never become inert: `#toast` (outside `#app`), `.connection-notice`, `.notice-banner`, `.problem-banner`. Neither does the dialog itself, `.modal-backdrop`.
- When the dialog closes, nothing on the page stays inert, and this happens before focus returns to the opener.
- No client text changes; `src/client-text.mjs` and `src/zh-hant.mjs` are untouched. `npm run build:hant -- --check` must report nothing to do.
- Staff screens stay English. Fictional data only.
- Do not touch `docs/superpowers/`. Never commit `.superpowers/`.
- Commit messages end with `Co-Authored-By: <the model that wrote the commit> <noreply@anthropic.com>`.
- The browser suite (`npm run test:browser`, 13–16 min) is run by the controller, **once**. A failure at a step this change doesn't touch is recorded, not retried.

## Review Focus

1. **A realtime redraw while a dialog is open** rebuilds `#app`. The page behind must be inert again after the redraw, not only after the first render. Pinned in Task 4 by a source check that the inert loop runs on every render, right after `root.innerHTML = views.page(`.
2. **Closing a dialog while a render is held** (the version-2 form waits during a press or IME composition). Focus must still return to the opener, so `closeDialog` clears `inert` itself before `findField(focusBeforeDialog)`. Pinned in Task 4 by a source-order check.
3. **A drawer's fallback focus** (`#office-queue-title`, when its row has gone). That heading lives in an `#app` child that was inert, so the clear-before-focus in item 2 covers it. Pinned by the same Task 4 check.
4. **Shift+Tab from the dialog container** (after clicking the dialog's text). It must stay inside. Pinned in Task 2 (`trapTarget` with a non-control `active`) and in the browser story (Task 5).
5. **The Chinese regenerate dialog** must be byte-identical in 简体. Pinned in Task 1's golden fixture (`regenerateZh`).

---

### Task 1: Golden markup of the six confirmations

**Files:**
- Create: `tests/fixtures/confirm-dialogs.json` (captured once, from unchanged code)
- Create: `tests/confirm-dialogs.test.mjs`

**Interfaces:**
- Consumes: today's `closeCaseDialogBody` (`src/admin-views.mjs`), `correctionsDialogBody` (`src/staff-views.mjs`), `resetDialogBody` and `checkpointDialogBody` (`src/presenter-views.mjs`), and `dialog` (`src/views.mjs`).
- Produces: the `GOLDEN` cases. Tasks 3 and 6 rely on this test staying green.

- [ ] **Step 1: Capture the fixture from the unchanged code.** First create `tests/confirm-dialogs.states.mjs` (below). Then run this from the worktree root, before touching any `src/` file. It writes the JSON once; it is a capture, not a generator, so don't add it to any script.

```bash
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { closeCaseDialogBody } from "./src/admin-views.mjs";
import { correctionsDialogBody } from "./src/staff-views.mjs";
import { resetDialogBody, checkpointDialogBody } from "./src/presenter-views.mjs";
import { dialog } from "./src/views.mjs";
import { STATES } from "./tests/confirm-dialogs.states.mjs";
const render = { closeCaseDialogBody, correctionsDialogBody, resetDialogBody, checkpointDialogBody, dialog };
const out = Object.fromEntries(Object.entries(STATES).map(([name, [fn, state]]) => [name, render[fn](state)]));
writeFileSync("tests/fixtures/confirm-dialogs.json", JSON.stringify(out, null, 2) + "\n");
console.log(Object.keys(out).length, "captured");
'
```

The shared states file, `tests/confirm-dialogs.states.mjs`. Its name doesn't match `*.test.mjs`, so `npm test` doesn't run it on its own:

```js
// The states the golden confirmation test renders. Shared by the one-time
// capture (plan Task 1) and tests/confirm-dialogs.test.mjs, so both render
// exactly the same inputs. Fictional references only.
import { STAGES } from "../src/contracts.mjs";

const six = Array.from({ length: 6 }, (_, i) => ({
  id: `sample-${i}`,
  reference: `VT-SAMP-000${i}`,
  stage: STAGES[0],
  fixture: true,
}));

export const STATES = Object.freeze({
  closeIdle: ["closeCaseDialogBody", { savedCase: { reference: "VT-TEST-0001" } }],
  closeBusy: ["closeCaseDialogBody", { savedCase: { reference: "VT-TEST-0001" }, busy: true }],
  corrections: ["correctionsDialogBody", {}],
  correctionsRetry: [
    "correctionsDialogBody",
    { error: { code: "CONFLICT", message: "This case changed." }, retryable: true },
  ],
  correctionsRefused: [
    "correctionsDialogBody",
    { error: { code: "FORBIDDEN", message: "Not allowed." }, retryable: false },
  ],
  reset: ["resetDialogBody", { cases: six }],
  checkpoint: ["checkpointDialogBody", { cases: six }],
  checkpointEmpty: ["checkpointDialogBody", {}],
  regenerateEn: ["dialog", { dialog: "regenerate" }],
  regenerateZh: ["dialog", { dialog: "regenerate", lang: "zh-Hans" }],
  leaveAddCase: ["dialog", { dialog: "leave-add-case", dialogContext: { to: "open-board" } }],
});
```

Expected output of the capture: `11 captured`.

- [ ] **Step 2: Write the test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { closeCaseDialogBody } from "../src/admin-views.mjs";
import { correctionsDialogBody } from "../src/staff-views.mjs";
import { resetDialogBody, checkpointDialogBody } from "../src/presenter-views.mjs";
import { dialog } from "../src/views.mjs";
import { STATES } from "./confirm-dialogs.states.mjs";

// Moving the confirmations onto confirmBody must not change a single
// character (change unify-confirmation-dialogs, design D1): the strings were
// captured from the code before the move.
const GOLDEN = JSON.parse(
  readFileSync(new URL("./fixtures/confirm-dialogs.json", import.meta.url), "utf8"),
);
const render = { closeCaseDialogBody, correctionsDialogBody, resetDialogBody, checkpointDialogBody, dialog };

test("every confirmation renders exactly as it did before confirmBody", () => {
  assert.deepEqual(Object.keys(GOLDEN).sort(), Object.keys(STATES).sort());
  for (const [name, [fn, state]] of Object.entries(STATES))
    assert.equal(render[fn](state), GOLDEN[name], name);
});
```

- [ ] **Step 3: Run it.** Run: `node --test tests/confirm-dialogs.test.mjs`. Expected: PASS (1 test). It passes on unchanged code by construction; it guards Tasks 3 and 6.
- [ ] **Step 4: Run the whole unit suite.** Run: `npm test`. Expected: all pass, one more test than before.
- [ ] **Step 5: Commit**

```bash
git add tests/confirm-dialogs.states.mjs tests/confirm-dialogs.test.mjs tests/fixtures/confirm-dialogs.json
git commit -m "Golden markup of the six confirmation dialogs, before confirmBody

Co-Authored-By: <model> <noreply@anthropic.com>"
```

---

### Task 2: `confirmBody`, `inertWhileDialog`, `trapTarget`

**Files:**
- Modify: `src/ui.mjs` (after `dialogFocusTarget`, around line 342)
- Test: `tests/ui.test.mjs` (add to the import list at the top, and add tests after "a dialog always has somewhere to put the keyboard", around line 336)

**Interfaces:**
- Consumes: `button(text, action, kind, extra)` and `icon(name)` from `src/ui.mjs`.
- Produces:
  - `confirmBody({ before = "", lead, note = null, form = null, confirm, keep }) → string`.
    - `lead`: escaped HTML, wrapped in `<p>`.
    - `note`: `{ icon, html, inForm? }`.
    - `form`: `{ attrs = 'class="staff-form"', fields }`.
    - `confirm`: ready-made control HTML.
    - `keep`: escaped label for the `close-dialog` text button.
  - `inertWhileDialog(element) → boolean`.
  - `trapTarget(controls, active, shift) → element | null`.

- [ ] **Step 1: Write the failing tests** in `tests/ui.test.mjs`. Add `confirmBody, inertWhileDialog, trapTarget, button, icon` to the import from `../src/ui.mjs`, then:

```js
test("a confirmation has one shape: lead, note, form or confirm, keep", () => {
  const confirm = button("Do it", "confirm-thing", "primary full");
  const keep = button("Keep it", "close-dialog", "text");
  // The simplest: a sentence, the confirm control, the keep button.
  assert.equal(confirmBody({ lead: "It happens.", confirm, keep: "Keep it" }), `<p>It happens.</p>${confirm}${keep}`);
  // A note sits between the lead and the confirm.
  assert.equal(
    confirmBody({ lead: "It happens.", note: { icon: "shield", html: "Nothing else." }, confirm, keep: "Keep it" }),
    `<p>It happens.</p><div class="info-note">${icon("shield")}<p>Nothing else.</p></div>${confirm}${keep}`,
  );
  // A form wraps its fields and the confirm, and the keep button stays outside it.
  assert.equal(
    confirmBody({ lead: "L", form: { fields: "<i>f</i>" }, confirm, keep: "Keep it" }),
    `<p>L</p><form class="staff-form"><i>f</i>${confirm}</form>${keep}`,
  );
  // A note can sit inside the form, after its fields (the checkpoint dialog).
  assert.equal(
    confirmBody({
      lead: "L",
      note: { icon: "help", html: "N", inForm: true },
      form: { attrs: 'id="x-form" class="staff-form"', fields: "<i>f</i>" },
      confirm,
      keep: "Keep it",
    }),
    `<p>L</p><form id="x-form" class="staff-form"><i>f</i><div class="info-note">${icon("help")}<p>N</p></div>${confirm}</form>${keep}`,
  );
  // Something said before everything else (the corrections dialog's refusal).
  assert.equal(
    confirmBody({ before: "<div>refused</div>", lead: "L", confirm, keep: "Keep it" }),
    `<div>refused</div><p>L</p>${confirm}${keep}`,
  );
});

test("only the dialog and the live regions stay out of inert", () => {
  const el = (...names) => ({ classList: { contains: (name) => names.includes(name) } });
  for (const name of ["modal-backdrop", "connection-notice", "notice-banner", "problem-banner"])
    assert.equal(inertWhileDialog(el(name)), false, name);
  for (const name of ["skip", "client-header", "client-shell", "app-shell", "site-footer"])
    assert.equal(inertWhileDialog(el(name)), true, name);
  assert.equal(inertWhileDialog(el("connection-notice", "reconnecting")), false);
});

test("Tab stays inside a dialog, from its ends and from the dialog itself", () => {
  const first = { name: "first" };
  const middle = { name: "middle" };
  const last = { name: "last" };
  const container = { name: "modal" };
  const controls = [first, middle, last];
  assert.equal(trapTarget(controls, last, false), first);
  assert.equal(trapTarget(controls, first, true), last);
  assert.equal(trapTarget(controls, middle, false), null);
  assert.equal(trapTarget(controls, middle, true), null);
  assert.equal(trapTarget(controls, first, false), null);
  assert.equal(trapTarget(controls, last, true), null);
  // The dialog itself, or its text, holds the keyboard: Tab goes in at the start,
  // Shift+Tab at the end, and never out behind the dialog.
  assert.equal(trapTarget(controls, container, false), first);
  assert.equal(trapTarget(controls, container, true), last);
  assert.equal(trapTarget(controls, null, true), last);
  // One control: it keeps the keyboard either way.
  assert.equal(trapTarget([first], first, false), first);
  assert.equal(trapTarget([first], first, true), first);
  // No controls: the browser decides.
  assert.equal(trapTarget([], container, false), null);
  assert.equal(trapTarget(), null);
});
```

- [ ] **Step 2: Run them to verify they fail.** Run: `node --test tests/ui.test.mjs`. Expected: FAIL with "does not provide an export named 'confirmBody'".
- [ ] **Step 3: Implement** in `src/ui.mjs`, directly after `dialogFocusTarget`:

```js
// Every confirmation has one shape (screen-states, "Every confirmation has the
// same shape"): a sentence, an optional note, an optional form, the confirm
// control, and a text button that closes without sending anything. The
// confirm control comes ready-made from the caller, so its action, its kind,
// its `disabled` and the payload's fields stay with the dialog that owns them.
// `lead` and `note.html` are HTML the caller has already escaped.
export function confirmBody({ before = "", lead, note = null, form = null, confirm, keep }) {
  const said = note ? `<div class="info-note">${icon(note.icon)}<p>${note.html}</p></div>` : "";
  const action = form
    ? `<form ${form.attrs ?? 'class="staff-form"'}>${form.fields}${note?.inForm ? said : ""}${confirm}</form>`
    : confirm;
  return `${before}<p>${lead}</p>${note && !note.inForm ? said : ""}${action}${button(keep, "close-dialog", "text")}`;
}

// While a dialog is open everything behind it is inert, except the dialog and
// the live regions: a toast or a banner announced while it is open, or just
// after it closes, still has to reach a screen reader. The toast lives outside
// #app, so it is never a candidate. A new live region inside #app joins this
// list.
const STAYS_REACHABLE = Object.freeze([
  "modal-backdrop",
  "connection-notice",
  "notice-banner",
  "problem-banner",
]);
export const inertWhileDialog = (element) =>
  !STAYS_REACHABLE.some((name) => element?.classList?.contains(name));

// Where Tab goes inside an open dialog: round from the last control to the
// first and back, and in at the right end when the keyboard is on the dialog
// itself or on its text (a click there focuses the container, which carries
// tabindex="-1"). Null leaves the move to the browser.
export function trapTarget(controls = [], active = null, shift = false) {
  if (!controls.length) return null;
  const first = controls[0];
  const last = controls.at(-1);
  if (!controls.includes(active)) return shift ? last : first;
  if (shift && active === first) return last;
  if (!shift && active === last) return first;
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass.** Run: `node --test tests/ui.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/ui.mjs tests/ui.test.mjs
git commit -m "confirmBody, inertWhileDialog and trapTarget in ui.mjs

Co-Authored-By: <model> <noreply@anthropic.com>"
```

---

### Task 3: The six confirmations use `confirmBody`

**Files:**
- Modify: `src/admin-views.mjs` (`closeCaseDialogBody`, around line 537; add `confirmBody` to its `./ui.mjs` import)
- Modify: `src/staff-views.mjs` (`correctionsDialogBody`, around line 1300; add `confirmBody` to its `./ui.mjs` import block, lines 22–40)
- Modify: `src/presenter-views.mjs` (`resetDialogBody` and `checkpointDialogBody`, lines 109–150; import line 1)
- Modify: `src/views.mjs` (the `regenerate` and `leave-add-case` branches of `dialog()`, around lines 415–422; import line 1)
- Test: `tests/confirm-dialogs.test.mjs` (unchanged; it is the guard), plus the existing suites

**Interfaces:**
- Consumes: `confirmBody` from Task 2. The golden fixture from Task 1.
- Produces: the same exported functions with the same output. No signature changes.

- [ ] **Step 1: Close case.** Replace the body of `closeCaseDialogBody`:

```js
export function closeCaseDialogBody(state = {}) {
  const record = state.savedCase ?? {};
  return confirmBody({
    lead: `Closing <strong>${esc(
      record.reference ?? "this case",
    )}</strong> ends the office's work on it in ViTally. Its open document requests and office tasks are cancelled; their titles, reasons, notes and received documents stay exactly as they are.`,
    note: {
      icon: "shield",
      html: "This does not cancel, withdraw or amend any return filed elsewhere, and it changes nothing at any tax authority. The client is told the office closed the application.",
    },
    form: {
      fields: `${textarea(
        "Why the office is closing this case",
        "reason",
        "",
        'required maxlength="1000" rows="3"',
        "close",
      )}<label class="checkbox-row" for="${fieldId(
        "confirmed",
        "close",
      )}"><input type="checkbox" id="${fieldId(
        "confirmed",
        "close",
      )}" name="confirmed" value="true" required><span>I understand this closes the case for everyone.</span></label>`,
    },
    confirm: caseSubmit(
      `${icon("close")} Close this case`,
      "CLOSE_CASE",
      "primary full",
      state.busy ? "disabled" : "",
    ),
    keep: "Keep it open",
  });
}
```

Run: `node --test tests/confirm-dialogs.test.mjs tests/admin-views.test.mjs`. Expected: PASS.

- [ ] **Step 2: Corrections.** Keep the `refused` block exactly as it is, then replace the `return`:

```js
  return confirmBody({
    before: refused,
    lead: "Tell the preparer what to correct in TaxSlayer. The client never sees these words.",
    form: {
      fields: textarea(
        "Corrections to send back to the preparer",
        "findings",
        "",
        `required maxlength="2000" rows="4"${state.error ? ' aria-describedby="corrections-error"' : ""}`,
        "corrections",
      ),
    },
    confirm: caseSubmit(
      `${icon("back")} Send back for corrections`,
      "REQUEST_CORRECTIONS",
      "primary full",
      state.busy ? "disabled" : "",
    ),
    keep: "Keep reviewing",
  });
```

Run: `node --test tests/confirm-dialogs.test.mjs tests/staff-views.test.mjs`. Expected: PASS.

- [ ] **Step 3: Reset and checkpoint.** Change line 1 of `src/presenter-views.mjs` to `import { esc, icon, button, select, confirmBody } from "./ui.mjs";`, then:

```js
export function resetDialogBody(state = {}) {
  const samples = (state.cases ?? []).filter((record) => record?.fixture);
  return confirmBody({
    lead: `This rebuilds the ${esc(samples.length || "six")} sample cases and the sample request for help with forms. They get new Application IDs, so any sample case open in another window is replaced.`,
    note: {
      icon: "shield",
      html: "Applications this class created stay exactly as they are, and so do every sign-in, every volunteer persona and the office's own settings. Nobody is emailed.",
    },
    confirm: button("Reset the sample cases", "confirm-reset-fixtures", "primary full"),
    keep: "Keep them as they are",
  });
}
```

In `checkpointDialogBody`, replace the empty-state `return`:

```js
  if (!samples.length)
    return confirmBody({
      lead: "There are no sample cases in this workspace yet.",
      note: { icon: "help", html: "Reset the sample cases first; that is what creates them." },
      confirm: button("Reset the sample cases", "open-reset-fixtures", "primary full"),
      keep: "Close",
    });
```

Then replace the final `return`, keeping `cases` and `points` as they are:

```js
  return confirmBody({
    lead: "This puts one sample case back to a chosen point in the story. It keeps its Application ID and its client, and replaces the work recorded on it.",
    note: {
      icon: "help",
      html: "The records it writes are simulated, and the case's history says so. Nothing is filed, signed or sent.",
      inForm: true,
    },
    form: {
      attrs: 'id="checkpoint-form" class="staff-form"',
      fields: `${select("Sample case", "caseId", "", cases, "required", "checkpoint")}${select(
        "Point in the story",
        "checkpoint",
        "",
        points,
        "required",
        "checkpoint",
      )}`,
    },
    confirm: `<button type="submit" id="checkpoint-submit" class="btn primary full">Load this checkpoint</button>`,
    keep: "Leave this case as it is",
  });
```

Before editing, read the current function to confirm that the note text and the select arguments match the lines above exactly. If any character differs, keep the current one: the golden test decides.

Run: `node --test tests/confirm-dialogs.test.mjs tests/presenter.test.mjs`. Expected: PASS.

- [ ] **Step 4: Regenerate and leave Add a case.** Add `confirmBody` to line 1 of `src/views.mjs`, then in `dialog()`:

```js
  if (state.dialog === "regenerate") {
    title = t("regenerate.title", {}, lang);
    body = confirmBody({
      lead: say("regenerate.body"),
      note: { icon: "help", html: say("regenerate.note") },
      confirm: button(say("regenerate.confirm"), "confirm-regenerate", "primary full"),
      keep: say("regenerate.keep"),
    });
  }
  if (state.dialog === "leave-add-case") {
    title = "Leave without saving?";
    body = confirmBody({
      lead: "The answers on this page are not saved yet. If you leave now, they are lost. Nothing has been sent to the office.",
      confirm: button("Leave and discard", "confirm-leave-add-case", "primary full"),
      keep: "Keep editing",
    });
  }
```

Run: `node --test tests/confirm-dialogs.test.mjs tests/shell.test.mjs tests/client-views.test.mjs`. Expected: PASS.

- [ ] **Step 5: Run the whole unit suite.** Run: `npm test`. Expected: all pass, with no existing test edited. If the golden test fails, diff `GOLDEN[name]` against the output and restore the differing character in the caller. Never edit the fixture.
- [ ] **Step 6: Commit**

```bash
git add src/admin-views.mjs src/staff-views.mjs src/presenter-views.mjs src/views.mjs
git commit -m "The six confirmations use confirmBody, with identical markup

Close case keeps CLOSE_CASE and its reason and confirmed fields; every
other action and payload is unchanged too.

Co-Authored-By: <model> <noreply@anthropic.com>"
```

---

### Task 4: Inert page behind the dialog, and the Tab trap (`src/app.mjs`)

**Files:**
- Modify: `src/app.mjs`:
  - the import from `./ui.mjs` (lines 32–39);
  - `render()` (after `root.innerHTML = views.page(state, screenFor(state));`, around line 256);
  - `closeDialog` (around lines 915–927);
  - the dialog keydown handler (around lines 1873–1889).
- Test: `tests/shell.test.mjs` (source checks, in the style of the existing `renderBody.indexOf(...)` checks around line 363)

**Interfaces:**
- Consumes: `inertWhileDialog`, `trapTarget` from Task 2.
- Produces: no exports. The browser story (Task 5) observes the behaviour.

- [ ] **Step 1: Write the failing source checks** in `tests/shell.test.mjs`. Read how the file already loads `app` and slices `renderBody` (around line 340–365), reuse that, and add:

```js
test("the page behind an open dialog is inert, on every render, and never when it closes", () => {
  const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
  const renderBody = app.slice(app.indexOf("function render(focus = false)"), app.indexOf("function render(focus = false)") + 6000);
  const inertLoop = "for (const child of root.children) child.inert = Boolean(state.dialog) && inertWhileDialog(child);";
  assert.ok(renderBody.includes(inertLoop), "every render recomputes inert");
  assert.ok(renderBody.indexOf(inertLoop) > renderBody.indexOf("root.innerHTML = views.page("), "after the page is drawn");
  const closeBody = app.slice(app.indexOf("function closeDialog("), app.indexOf("function fictional("));
  const clear = "for (const child of root.children) child.inert = false;";
  assert.ok(closeBody.includes(clear), "closing clears inert itself (a held render may not)");
  assert.ok(closeBody.indexOf(clear) > closeBody.indexOf("controller.closeDialog();"));
  assert.ok(closeBody.indexOf(clear) < closeBody.indexOf("findField(focusBeforeDialog)"), "before focus goes back");
});

test("the Tab trap asks trapTarget, so the dialog itself cannot be tabbed out of", () => {
  const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
  assert.match(app, /const target = trapTarget\(focusable, document\.activeElement, event\.shiftKey\);/);
  assert.doesNotMatch(app, /document\.activeElement === first\)/);
});
```

If `readFileSync` is already imported (it is, line 3), don't import it twice.

- [ ] **Step 2: Run them to verify they fail.** Run: `node --test tests/shell.test.mjs`. Expected: the two new tests FAIL.
- [ ] **Step 3: Implement.**
  - Add `inertWhileDialog, trapTarget` to the `./ui.mjs` import.
  - In `render()`, directly after `root.innerHTML = views.page(state, screenFor(state));`:

```js
    // The page behind an open dialog is inert; the dialog and the live
    // regions are not (screen-states). Every render, because a realtime
    // redraw replaces everything it applied to.
    for (const child of root.children) child.inert = Boolean(state.dialog) && inertWhileDialog(child);
```

  - In `closeDialog`, directly after `controller.closeDialog();`:

```js
    // A render on the version-2 form can be held for a press in progress, so
    // the page is made usable here, before the keyboard goes back to it.
    for (const child of root.children) child.inert = false;
```

  - In the keydown handler, replace the block from `const first = focusable[0];` to the end of the `else if` with:

```js
    const target = trapTarget(focusable, document.activeElement, event.shiftKey);
    if (target) {
      event.preventDefault();
      target.focus();
    }
```

  Keep `if (!focusable.length) return;`. `trapTarget` returns null for an empty list, but the early return documents intent.

- [ ] **Step 4: Run the tests to verify they pass.** Run: `npm test`. Expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add src/app.mjs tests/shell.test.mjs
git commit -m "The page behind an open dialog is inert, except the live regions; Tab can't leave the dialog from its container

Co-Authored-By: <model> <noreply@anthropic.com>"
```

---

### Task 5: Browser checks

**Files:**
- Modify: `tests/browser.mjs`:
  - the phase "a dialog takes the keyboard and gives it back" (around line 2085);
  - the phase "the presenter's reset leaves exactly the six seeded cases" (around line 740).

**Interfaces:**
- Consumes: the behaviour from Tasks 3 and 4; `waitFor`, `waitForQuiet` and `resetSampleCases` from `tests/support/story-pages.mjs`.
- Produces: `evidence.regressions.dialogInert` and `evidence.story.resetToast`.

- [ ] **Step 1: In the dialog phase**, after `const regenerate = await openWithKeyboard("regenerate-fictional");` and its `landed` assert, add:

```js
      // The page behind is inert; the dialog and the live regions are not, and
      // the toast (outside #app) never is (screen-states).
      const inertWhileOpen = await client.evaluate(() => ({
        stray: [...document.querySelector("#app").children]
          .filter(
            (child) =>
              !child.inert &&
              !["modal-backdrop", "connection-notice", "notice-banner", "problem-banner"].some((name) =>
                child.classList.contains(name),
              ),
          )
          .map((child) => child.className || child.tagName),
        modalInert: Boolean(document.querySelector(".modal")?.closest("[inert]")),
        toastInert: Boolean(document.querySelector("#toast")?.closest("[inert]")),
      }));
      assert.deepEqual(inertWhileOpen.stray, [], "something behind the dialog can still be reached");
      assert.equal(inertWhileOpen.modalInert, false, "the dialog itself is inert");
      assert.equal(inertWhileOpen.toastInert, false, "the toast is inside something inert");
      // From the dialog itself (a click on its text), Shift+Tab stays inside.
      await client.evaluate(() => document.querySelector(".modal").focus());
      await client.keyboard.press("Shift+Tab");
      const fromContainer = await where();
      assert.equal(fromContainer.inModal, true, "Shift+Tab from the dialog itself left the dialog");
```

After `await closeWithEscape("regenerate-fictional");`, add:

```js
      const inertAfterClose = await client.evaluate(
        () => [...document.querySelector("#app").children].filter((child) => child.inert).length,
      );
      assert.equal(inertAfterClose, 0, "something stayed inert after the dialog closed");
```

And add to `evidence.regressions.dialogFocus`:

```js
        inert: { whileOpen: inertWhileOpen, afterClose: inertAfterClose, shiftTabFromContainer: fromContainer },
```

- [ ] **Step 2: In the reset phase**, replace `evidence.story.indicatorAfter = await resetSampleCases(staff);` with:

```js
      evidence.story.indicatorAfter = await resetSampleCases(staff);
      // The confirmation's toast reaches the live region, outside anything
      // inert, though the dialog closed only a moment ago (screen-states).
      await waitFor(
        staff,
        "the reset's toast, outside anything inert",
        () => {
          const toast = document.querySelector("#toast");
          return /sample cases were rebuilt/.test(toast?.textContent ?? "") && !toast.closest("[inert]");
        },
        undefined,
        RENDER_MS,
      );
      evidence.story.resetToast = "announced in #toast, outside anything inert";
```

Check that `waitFor` and `RENDER_MS` are already in scope in `tests/browser.mjs`; they are used in the dialog phase.

- [ ] **Step 3: Syntax check.** Run: `node --check tests/browser.mjs`. Expected: no output.
- [ ] **Step 4: Commit**

```bash
git add tests/browser.mjs
git commit -m "Story: the page behind a dialog is inert, the toast is not, and Shift+Tab stays inside

Co-Authored-By: <model> <noreply@anthropic.com>"
```

- [ ] **Step 5 (controller):**
  - Run `npm run db:migrate:test`, then `npm run test:browser` **once**, in the background, with nothing else running.
  - If it fails at a step this change doesn't touch, record the phase, the step and the error for verify.md, and don't retry.
  - If it fails in the dialog phase, the reset phase's toast wait, or anything about dialogs, fix it and run once more.

---

### Task 6: Docs and final checks

**Files:**
- Modify: `docs/developer/frontend.md` (the **Dialogs** bullet, line 170)

**Interfaces:**
- Consumes: everything above.
- Produces: docs only.

- [ ] **Step 1: Update the bullet.** Replace the line `- **Dialogs** take focus when they open and return it to the control that opened them.` with:

```markdown
- **Dialogs** take focus when they open and return it to the control that opened them. Tab stays
  inside, also from the dialog itself, and Escape closes. While one is open, every child of `#app`
  is `inert` except the dialog and the live regions (connection notice, notice banner, problem
  banner); the toast sits outside `#app`. Every confirmation's body is built with `confirmBody`
  (`src/ui.mjs`), which takes the confirm control ready-made, so the dialog keeps its own action
  and payload.
```

- [ ] **Step 2: Run the checks.**
  - `npm test`: all pass.
  - `npm run build:hant -- --check`: nothing to regenerate.
  - `npx openspec validate --all`: all valid.
- [ ] **Step 3: Commit**

```bash
git add docs/developer/frontend.md
git commit -m "Docs: dialogs are inert behind, trap Tab from the container, and use confirmBody

Co-Authored-By: <model> <noreply@anthropic.com>"
```
