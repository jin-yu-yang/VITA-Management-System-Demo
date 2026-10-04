# The sidebar: hover to peek, click to pin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the staff frame, a mouse resting on the collapsed sidebar's toggle opens the sidebar over the page (a peek), and a click pins it, as spec §8 describes. Pinning works as today.

**Architecture:**
- A small DOM-free state machine, `src/sidebar-peek.mjs`, decides when a peek opens and closes. It is driven by pointer zone, focus zone, toggle clicks and Escape, and has injectable timers so it is unit-tested.
- `app.mjs` feeds it delegated pointer and focus events and applies its state in place on the shell after every render, by changing a class, the sidebar's `hidden` attribute, and the toggle's `aria-expanded` and label. It never renders.
- `appShell` markup and `sidebarOpen` are unchanged.

**Tech Stack:** vanilla ES modules, `node:test`, Playwright, CSS.

**Spec:** `docs/superpowers/specs/2026-10-04-intake-redesign-design.md` §8 (the sidebar) and §11's test line ("Sidebar PR: peek, stay, close after leaving, pin, collapse with no re-peek, keyboard, and touch").

## Global Constraints

- **Pinned, as today:** clicking the toggle opens the sidebar, which pushes the page; clicking again collapses it. This is still `sidebarOpen`, saved per window (`window-state.mjs`). `appShell` in `src/views.mjs` and its tests stay unchanged.
- **Peek:**
  - While collapsed, a mouse resting on the toggle opens the sidebar **over** the page, without pushing it, so the board doesn't jump.
  - It stays open while the pointer is on the toggle or in the sidebar, and closes **300 ms** after the pointer leaves both.
  - Clicking during a peek pins it.
- **After a click collapses the sidebar,** peek stays off until the pointer leaves the toggle.
- **Mouse only:** touch and pen get no peek (`pointerType`); their taps behave as clicks.
- **Keyboard:**
  - Focusing the toggle doesn't peek, and Enter or Space pins.
  - Tabbing into a peeked sidebar keeps it open, and Escape closes the peek.
  - `aria-expanded` follows what is visible.
- **Peek is a class change in place, never a render.** `app.mjs` keeps the peek state (not saved), which it re-applies after every render, so a realtime redraw keeps the peek.
- **Module names under `src/` match `^[a-z-]+\.mjs$`** (`server.mjs` serves nothing else). The new module is `src/sidebar-peek.mjs`.
- **Colours only from `--vt-*` tokens.** The overlay's shadow copies the existing narrow-screen sidebar rule's value (`styles.css` ~2877). The CSS goes in a fenced `/* Sidebar peek */ … /* end sidebar peek */` block right after the `@media (max-width: 800px)` app-shell rule.
- **New wording goes to the group for review:** the toggle's peek label "Keep the sidebar open".
- **Test stack:** `vitally-task2` on port 54321; start with `docker start $(docker ps -aq --filter name=vitally-task2)`; never `npx supabase start` from the repo root.
- **PATH prefix:** `PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`.
- **Commands:** `npm test`, `npm run test:browser`.
- **House rules:**
  - Fictional data only.
  - Never substitute or generate PCDC logos.
  - Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Leave the untracked `VITA-Management-System-Demo/` directory alone.

## Rulings made while planning

- **"Resting" means 200 ms.** A peek opens after the mouse has rested on the toggle for 200 ms (`PEEK_OPEN_MS`). A pointer sweeping past the top-left corner then doesn't flash the sidebar, and a click within those 200 ms pins as today. Closing uses the spec's 300 ms (`PEEK_CLOSE_MS`).
- **Only keyboard focus inside the sidebar holds a peek open, the same as the pointer.** When it leaves and the pointer is outside both, the peek closes after the same 300 ms. "Keyboard focus" means the focused element matches `:focus-visible`. Neither of these counts:
  - **Focus on the toggle.** A mouse click focuses the toggle in Chrome, and a toggle that kept focus would hold every later peek open after the mouse left. So Shift+Tab from the sidebar back to the toggle lets the peek close; the toggle stays visible.
  - **Focus from a mouse click inside the peeked sidebar.** Today every sidebar control navigates (focus goes to `#main`) or opens a dialog, so this is a safeguard for the sidebar content the redesign adds later (Groups, Pinned, Recent). It has no browser check.

  **`focusout` never decides on its own.** When focus moves within the sidebar, the following `focusin` decides. `focusout` only clears the hold when focus goes outside the sidebar. At `focusout` time the next element doesn't match `:focus-visible` yet.
- **Escape behaves like a collapse.** It closes the peek, and peek then stays off until the pointer leaves the toggle, if it is on it. An open dialog takes Escape first, as today.
- **A peek never hides the keyboard.** Whenever `applyPeek` hides the sidebar while `document.activeElement` is inside it, the keyboard moves to the toggle, which is always visible. That covers Escape, the close timer and a dialog closing.
- **An open dialog holds the peek** (`peek.hold(Boolean(state.dialog))` in `applyPeek`). "Need help?" sits in the sidebar, and a dialog returns the keyboard to the control that opened it. If the peek closed behind the dialog, that control would be hidden when the dialog closed. Once the dialog closes, the usual 300 ms close applies, and the rule above then moves the keyboard to the toggle.
- **The suppression after a collapse applies only when the pointer is on the toggle.** A keyboard collapse with the mouse elsewhere doesn't leave peek stuck off.
- **During a peek the toggle reads "Keep the sidebar open"**, with `aria-expanded="true"`. Pinned, it reads "Hide the sidebar"; collapsed, "Show the sidebar" (both as today).
- **The peek uses the narrow-screen overlay's look at every width:** fixed on the left, the sidebar's width, above the page, with the same shadow. Below 800px a pinned sidebar is already that overlay.
- **No animation.** YAGNI, and there's no motion to reduce.

## File map

| File | Change | Task |
|---|---|---|
| `src/sidebar-peek.mjs` (new) | `createSidebarPeek`, `PEEK_OPEN_MS`, `PEEK_CLOSE_MS`, `peekZone`, `toggleLabel` | 1 |
| `src/app.mjs` | Feed the events; `applyPeek()` right after every render's `innerHTML`; the toggle click tells the peek whether it pinned or collapsed; Escape | 1 |
| `src/styles.css` | `/* Sidebar peek */` block | 1 |
| `tests/sidebar-peek.test.mjs` (new) | The state machine | 1 |
| `tests/shell.test.mjs` | Wiring pins | 1 |
| `tests/browser.mjs` | A sidebar phase | 2 |
| `docs/developer/frontend.md`, `docs/setup.md`, `README.md` | Peek described; suite counts | 2 |

---

### Task 1: The peek state machine, its wiring and its CSS

**Files:**
- Create: `src/sidebar-peek.mjs`, `tests/sidebar-peek.test.mjs`
- Modify: `src/app.mjs` (render, listeners, the `toggle-sidebar` case, Escape), `src/styles.css`, `tests/shell.test.mjs`

**Interfaces:**
- Produces (Task 2 relies on the DOM effects only):
  - while peeking, `.app-shell` has class `sidebar-peek` as well as `sidebar-closed`;
  - `#app-sidebar` has no `hidden`;
  - the toggle has `aria-expanded="true"` and `aria-label`/`title` "Keep the sidebar open".
  - With no peek, the DOM is exactly `appShell`'s output.

- [ ] **Step 1: Write the failing unit tests** (`tests/sidebar-peek.test.mjs`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createSidebarPeek, PEEK_OPEN_MS, PEEK_CLOSE_MS, peekZone, toggleLabel } from "../src/sidebar-peek.mjs";

// A hand-run clock: timers fire only when the test advances time.
function fakeClock() {
  let now = 0;
  let next = 1;
  const timers = new Map();
  return {
    setTimer(fn, ms) { const id = next++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimer(id) { timers.delete(id); },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = until;
    },
  };
}

function setup({ pinned = false } = {}) {
  const clock = fakeClock();
  let changes = 0;
  const peek = createSidebarPeek({ setTimer: clock.setTimer, clearTimer: clock.clearTimer, onChange: () => { changes += 1; } });
  peek.setPinned(pinned);
  return { peek, clock, changes: () => changes };
}

test("the timings are the spec's close delay and the planned rest delay", () => {
  assert.equal(PEEK_OPEN_MS, 200);
  assert.equal(PEEK_CLOSE_MS, 300);
});

test("a mouse resting on the collapsed toggle peeks after the rest delay", () => {
  const { peek, clock, changes } = setup();
  peek.pointer("toggle", "mouse");
  clock.advance(PEEK_OPEN_MS - 1);
  assert.equal(peek.isPeeking(), false);
  clock.advance(1);
  assert.equal(peek.isPeeking(), true);
  assert.equal(changes(), 1);
});

test("a pointer that passes over the toggle without resting doesn't peek", () => {
  const { peek, clock } = setup();
  peek.pointer("toggle", "mouse");
  clock.advance(100);
  peek.pointer(null, "mouse");
  clock.advance(1000);
  assert.equal(peek.isPeeking(), false);
});

test("the peek stays while the pointer moves into the sidebar, and closes 300 ms after it leaves both", () => {
  const { peek, clock } = setup();
  peek.pointer("toggle", "mouse");
  clock.advance(PEEK_OPEN_MS);
  peek.pointer("sidebar", "mouse");
  clock.advance(5000);
  assert.equal(peek.isPeeking(), true, "inside the sidebar it stays");
  peek.pointer(null, "mouse");
  clock.advance(PEEK_CLOSE_MS - 1);
  assert.equal(peek.isPeeking(), true);
  clock.advance(1);
  assert.equal(peek.isPeeking(), false);
});

test("coming back within 300 ms keeps the peek", () => {
  const { peek, clock } = setup();
  peek.pointer("toggle", "mouse");
  clock.advance(PEEK_OPEN_MS);
  peek.pointer(null, "mouse");
  clock.advance(200);
  peek.pointer("sidebar", "mouse");
  clock.advance(1000);
  assert.equal(peek.isPeeking(), true);
});

test("touch and pen never peek", () => {
  for (const type of ["touch", "pen"]) {
    const { peek, clock } = setup();
    peek.pointer("toggle", type);
    clock.advance(5000);
    assert.equal(peek.isPeeking(), false, type);
  }
});

test("a pinned sidebar never peeks, and pinning ends a peek", () => {
  const pinned = setup({ pinned: true });
  pinned.peek.pointer("toggle", "mouse");
  pinned.clock.advance(5000);
  assert.equal(pinned.peek.isPeeking(), false);

  const { peek, clock } = setup();
  peek.pointer("toggle", "mouse");
  clock.advance(PEEK_OPEN_MS);
  peek.pinned();
  peek.setPinned(true);
  assert.equal(peek.isPeeking(), false);
});

test("after a click collapses the sidebar, peek stays off until the pointer leaves the toggle", () => {
  const { peek, clock } = setup({ pinned: true });
  peek.pointer("toggle", "mouse");
  peek.collapsed();
  peek.setPinned(false);
  clock.advance(5000);
  assert.equal(peek.isPeeking(), false, "no re-peek under the cursor");
  peek.pointer("sidebar", "mouse"); // still not the page: the toggle was left
  peek.pointer(null, "mouse");
  peek.pointer("toggle", "mouse");
  clock.advance(PEEK_OPEN_MS);
  assert.equal(peek.isPeeking(), true, "after leaving and coming back it peeks again");
});

test("a keyboard collapse with the mouse elsewhere doesn't leave peek stuck off", () => {
  const { peek, clock } = setup({ pinned: true });
  peek.collapsed(); // the pointer was never on the toggle
  peek.setPinned(false);
  peek.pointer("toggle", "mouse");
  clock.advance(PEEK_OPEN_MS);
  assert.equal(peek.isPeeking(), true);
});

test("focus never opens a peek, but focus inside holds one open", () => {
  const { peek, clock } = setup();
  peek.focus(true);
  clock.advance(5000);
  assert.equal(peek.isPeeking(), false, "focus never opens a peek");
  peek.focus(false);

  peek.pointer("toggle", "mouse");
  clock.advance(PEEK_OPEN_MS);
  peek.focus(true); // tabbed into the sidebar
  peek.pointer(null, "mouse");
  clock.advance(5000);
  assert.equal(peek.isPeeking(), true, "the keyboard inside keeps it");
  peek.focus(false);
  clock.advance(PEEK_CLOSE_MS);
  assert.equal(peek.isPeeking(), false, "closes once neither the pointer nor the keyboard is inside");
});

test("Escape closes a peek and reports it; with no peek it does nothing", () => {
  const { peek, clock } = setup();
  assert.equal(peek.escape(), false);
  peek.pointer("toggle", "mouse");
  clock.advance(PEEK_OPEN_MS);
  assert.equal(peek.escape(), true);
  assert.equal(peek.isPeeking(), false);
  clock.advance(5000);
  assert.equal(peek.isPeeking(), false, "no re-peek while the pointer stays on the toggle");
});

test("an open dialog holds the peek; when it closes the usual delay applies", () => {
  const { peek, clock } = setup();
  peek.pointer("toggle", "mouse");
  clock.advance(PEEK_OPEN_MS);
  peek.hold(true);
  peek.pointer(null, "mouse");
  clock.advance(5000);
  assert.equal(peek.isPeeking(), true);
  peek.hold(false);
  clock.advance(PEEK_CLOSE_MS);
  assert.equal(peek.isPeeking(), false);
});

test("peekZone names the toggle, the sidebar, or nothing", () => {
  const el = (match) => ({ closest: (sel) => (sel === match ? {} : null) });
  assert.equal(peekZone(el(".sidebar-toggle")), "toggle");
  assert.equal(peekZone(el("#app-sidebar")), "sidebar");
  assert.equal(peekZone(el("main")), null);
  assert.equal(peekZone(null), null);
  assert.equal(peekZone({}), null);
});

test("toggleLabel follows what is visible", () => {
  assert.equal(toggleLabel({ pinned: true, peeking: false }), "Hide the sidebar");
  assert.equal(toggleLabel({ pinned: false, peeking: false }), "Show the sidebar");
  assert.equal(toggleLabel({ pinned: false, peeking: true }), "Keep the sidebar open");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/sidebar-peek.test.mjs`
Expected: FAIL. The module `../src/sidebar-peek.mjs` doesn't exist.

- [ ] **Step 3: Write `src/sidebar-peek.mjs`**

```js
// The staff sidebar's peek (spec 2026-10-04 §8): while the sidebar is
// collapsed, a mouse resting on its toggle opens it over the page, and it
// closes 300 ms after the pointer (and the keyboard) leave the toggle and the
// sidebar. Clicking pins it, as today. This module only decides; app.mjs feeds
// it events and applies the result to the page in place, never by rendering.

export const PEEK_OPEN_MS = 200; // "resting": a pointer sweeping past doesn't flash it
export const PEEK_CLOSE_MS = 300;

// Which part of the peek an element belongs to: the toggle, the sidebar, or neither.
export function peekZone(element) {
  if (!element?.closest) return null;
  if (element.closest(".sidebar-toggle")) return "toggle";
  if (element.closest("#app-sidebar")) return "sidebar";
  return null;
}

export function toggleLabel({ pinned, peeking }) {
  if (pinned) return "Hide the sidebar";
  return peeking ? "Keep the sidebar open" : "Show the sidebar";
}

export function createSidebarPeek({ setTimer = setTimeout, clearTimer = clearTimeout, onChange = () => {} } = {}) {
  let pinnedOpen = true;
  let peeking = false;
  let zone = null; // where the mouse is: "toggle", "sidebar" or null
  let focusInside = false; // the keyboard is in the sidebar (not the toggle: a mouse click focuses it)
  let suppressed = false; // after a collapse or Escape, until the mouse leaves the toggle
  let held = false; // a dialog is open: the peek doesn't close behind it
  let openTimer = null;
  let closeTimer = null;

  const cancelOpen = () => { if (openTimer !== null) clearTimer(openTimer); openTimer = null; };
  const cancelClose = () => { if (closeTimer !== null) clearTimer(closeTimer); closeTimer = null; };
  const set = (value) => {
    if (peeking === value) return;
    peeking = value;
    onChange();
  };
  const scheduleClose = () => {
    if (!peeking || zone || focusInside || held || closeTimer !== null) return;
    closeTimer = setTimer(() => {
      closeTimer = null;
      if (!zone && !focusInside && !held) set(false);
    }, PEEK_CLOSE_MS);
  };
  const end = () => { cancelOpen(); cancelClose(); set(false); };

  return {
    isPeeking: () => peeking,
    // Each render says whether the sidebar is pinned open; a pinned sidebar has no peek.
    setPinned(open) {
      pinnedOpen = Boolean(open);
      if (pinnedOpen) end();
    },
    // The mouse is now in `next` ("toggle", "sidebar" or null). Touch and pen are ignored.
    pointer(next, pointerType) {
      if (pointerType !== "mouse") return;
      const before = zone;
      zone = next;
      if (before === "toggle" && next !== "toggle") suppressed = false;
      if (pinnedOpen) return;
      if (next) {
        cancelClose();
        if (!peeking && next === "toggle" && !suppressed && openTimer === null) {
          openTimer = setTimer(() => {
            openTimer = null;
            if (zone === "toggle" && !suppressed && !pinnedOpen) set(true);
          }, PEEK_OPEN_MS);
        }
      } else {
        cancelOpen();
        scheduleClose();
      }
    },
    // The keyboard is (or isn't) inside the sidebar. Focus never opens a peek.
    focus(inside) {
      focusInside = Boolean(inside);
      if (focusInside) cancelClose();
      else scheduleClose();
    },
    // A dialog is (or isn't) open; while one is, the peek stays.
    hold(on) {
      held = Boolean(on);
      if (held) cancelClose();
      else scheduleClose();
    },
    // The toggle was clicked and pinned the sidebar open.
    pinned() { end(); },
    // The toggle was clicked and collapsed the sidebar: no re-peek under the cursor.
    collapsed() {
      suppressed = zone === "toggle";
      end();
    },
    // Escape: closes a peek (true) or does nothing (false).
    escape() {
      if (!peeking) return false;
      suppressed = zone === "toggle";
      end();
      return true;
    },
  };
}
```

- [ ] **Step 4: Run the unit tests and see them pass**

Run: `node --test tests/sidebar-peek.test.mjs`
Expected: PASS, 14 tests.

- [ ] **Step 5: Write the failing wiring pins** (append to `tests/shell.test.mjs`; it already reads `app.mjs` for other source pins. If it doesn't, read it with `readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8")`).

```js
test("app.mjs applies the sidebar peek in place after every render and feeds it events", () => {
  const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
  assert.match(app, /import \{[^}]*createSidebarPeek[^}]*\} from "\.\/sidebar-peek\.mjs"/);
  // Applied straight after the page is replaced, before focus is restored,
  // so a redraw keeps the peek and the keyboard can go back into the sidebar.
  assert.match(app, /root\.innerHTML = views\.page\(state, screenFor\(state\)\);\s*applyPeek\(\);/);
  for (const event of ["pointerover", "pointerout", "focusin", "focusout"])
    assert.match(app, new RegExp(`root\\.addEventListener\\("${event}"`), event);
  // Only keyboard focus holds a peek.
  assert.match(app, /:focus-visible/);
  // The toggle tells the peek whether the click pinned or collapsed.
  assert.match(app, /case "toggle-sidebar":[\s\S]{0,200}peek\.(collapsed|pinned)\(\)/);
  assert.match(app, /peek\.escape\(\)/);
  // An open dialog holds the peek, and hiding the sidebar never strands the keyboard.
  assert.match(app, /peek\.hold\(Boolean\(controller\.getState\(\)\.dialog\)\)/);
  assert.match(app, /if \(hadFocus\) toggle\?\.focus\(\)/);
});
```

Run: `node --test tests/shell.test.mjs`
Expected: FAIL on the new test only.

- [ ] **Step 6: Wire it in `src/app.mjs`**

1. **Import:** add `import { createSidebarPeek, peekZone, toggleLabel } from "./sidebar-peek.mjs";` beside the other imports.
2. **Create it and `applyPeek`,** near the redraw-hold state, before `render` is defined:

```js
  // ---- the staff sidebar's peek (spec 2026-10-04 §8) -----------------------
  // Never saved and never a render: the peek is applied to the page in place,
  // after every render too, so a realtime redraw keeps it.
  const peek = createSidebarPeek({ onChange: () => applyPeek() });
  function applyPeek() {
    const shell = root.querySelector(".app-shell");
    if (!shell) return;
    const pinned = !shell.classList.contains("sidebar-closed");
    peek.setPinned(pinned);
    peek.hold(Boolean(controller.getState().dialog));
    const peeking = !pinned && peek.isPeeking();
    shell.classList.toggle("sidebar-peek", peeking);
    const toggle = shell.querySelector(".sidebar-toggle");
    if (toggle) {
      const label = toggleLabel({ pinned, peeking });
      toggle.setAttribute("aria-expanded", String(pinned || peeking));
      toggle.setAttribute("aria-label", label);
      toggle.setAttribute("title", label);
    }
    const sidebar = shell.querySelector("#app-sidebar");
    if (!sidebar) return;
    const hide = !pinned && !peeking;
    // A peek never hides the keyboard: closing it with focus inside moves
    // the keyboard to the toggle, which is always visible.
    const hadFocus = hide && !sidebar.hidden && sidebar.contains(document.activeElement);
    sidebar.hidden = hide;
    if (hadFocus) toggle?.focus();
  }
```

3. **In `render`:** change the line `root.innerHTML = views.page(state, screenFor(state));` to be followed directly by `applyPeek();`. It must come before `restoreFormDrafts()` and the focus restore.
4. **Listeners,** next to the redraw-hold listeners:

```js
  root.addEventListener("pointerover", (event) => peek.pointer(peekZone(event.target), event.pointerType));
  root.addEventListener("pointerout", (event) => peek.pointer(peekZone(event.relatedTarget), event.pointerType));
  // Only keyboard focus in the sidebar holds a peek (a mouse click focuses
  // buttons in Chrome). Within the sidebar the next focusin decides.
  const keyboardFocus = (element) => {
    try { return element.matches(":focus-visible"); } catch { return true; }
  };
  root.addEventListener("focusin", (event) =>
    peek.focus(peekZone(event.target) === "sidebar" && keyboardFocus(event.target)));
  root.addEventListener("focusout", (event) => {
    if (peekZone(event.relatedTarget) !== "sidebar") peek.focus(false);
  });
```

5. **The toggle:** replace the `toggle-sidebar` case body with:

```js
      case "toggle-sidebar":
        if (controller.getState().sidebarOpen) peek.collapsed();
        else peek.pinned();
        controller.toggleSidebar();
        break;
```

6. **Escape:** at the top of the existing `document.addEventListener("keydown", …)` handler for dialogs, before `if (!controller.getState().dialog) return;`, add:

```js
    if (event.key === "Escape" && !controller.getState().dialog) {
      // applyPeek moves the keyboard to the toggle if it was in the sidebar.
      if (peek.escape()) event.preventDefault();
      return;
    }
```

`peek.escape()` calls `onChange` → `applyPeek()`, which hides the sidebar and moves the keyboard to the toggle if it was inside.

- [ ] **Step 7: CSS** in `src/styles.css`, directly after the `@media (max-width: 800px) { .app-shell … }` block (~line 2884):

```css
/* Sidebar peek (spec 2026-10-04 §8): a collapsed sidebar shown over the page
   while the mouse rests on its toggle or in it. It never pushes the page;
   app.mjs adds .sidebar-peek in place. */
.app-shell.sidebar-closed.sidebar-peek .app-sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  width: min(var(--vt-sidebar-width), 85vw);
  z-index: 30;
  box-shadow: 0 12px 40px rgb(42 39 69 / 0.18);
}
/* end sidebar peek */
```

- [ ] **Step 8: Run** `node --test tests/sidebar-peek.test.mjs tests/shell.test.mjs`, then `npm test`.
Expected: PASS. The existing `appShell` tests are unchanged and pass.

- [ ] **Step 9: Commit**

```bash
git add src/sidebar-peek.mjs src/app.mjs src/styles.css tests/sidebar-peek.test.mjs tests/shell.test.mjs
git commit -m "Sidebar: hover the collapsed toggle to peek, click to pin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The browser story's sidebar phase and the docs

**Files:** Modify `tests/browser.mjs`, `docs/developer/frontend.md`, `docs/setup.md` (recorded suite counts), `README.md` (only if it lists the sidebar's behaviour or the suite counts).

**Interfaces:**
- Consumes Task 1's DOM effects:
  - `.app-shell.sidebar-peek` while peeking;
  - `#app-sidebar` `hidden` when collapsed and not peeking;
  - the toggle's `aria-expanded` and `aria-label` ("Show the sidebar", "Keep the sidebar open", "Hide the sidebar").
- Uses the story helpers `waitFor`, `waitForQuiet`, `RENDER_MS`, `CLICK_MS` (`tests/support/story-pages.mjs`).

**The phase** `"the sidebar peeks under a resting mouse and pins on a click"` comes right after `"a dialog takes the keyboard and gives it back"`, in the staff window (`staff`) while it is quiet. Write small local helpers inside the phase:
- `sidebarState(page)` returns `{ peek: shell.classList.contains("sidebar-peek"), hidden: sidebar.hidden, expanded, label, mainLeft }`, where `mainLeft` is `.app-main`'s `getBoundingClientRect().left`.
- `waitSidebar(page, what, predicate)` wraps `waitFor` with `RENDER_MS`.

Before step 1, set the staff window to `DESKTOP` (1280×900) with `setViewportSize` if an earlier phase left it narrower. Above 800px a pinned sidebar pushes the page, which step 6 measures.

Rules:
- Pointer moves use `page.mouse.move(x, y)`, with coordinates taken from `locator.boundingBox()`.
- A press under test is one `locator.click()`.
- No sleeps except where the step tests that nothing happens. Those use one `page.waitForTimeout(600)`, which is two close delays, and say so in a comment.
- Leave the sidebar pinned open at the end, as the phase found it, and move the mouse to the page's centre.

Steps:
1. **Collapse with no re-peek.** Starting pinned, record `mainLeft`. One click on the toggle collapses it (`expanded` "false", `hidden` true, "Show the sidebar"). The mouse is still on the toggle. After `waitForTimeout(600)` there is still no peek (`peek` false, `hidden` true).
2. **Peek.** Move the mouse to the page centre, then back onto the toggle's centre. Wait for `peek` true, `hidden` false, `expanded` "true" and the label "Keep the sidebar open". `mainLeft` equals its collapsed value, so the page didn't move.
3. **Stay.** Move the mouse into the sidebar (the centre of `#app-sidebar`'s box), then `waitForTimeout(600)`: still peeking.
4. **The peek survives a realtime redraw.** Set `data-peek-marker` on `#main`. Cause a redraw from outside the window by giving a case on the staff window's board a no-change bump: `await fixture.database.sql("update public.cases set revision = revision + 1 where id=$1", [id])`. This is the same bump the 4b2 version-2 phase's warm-up uses. Take the id from one of the seeded samples, looked up the way earlier phases do. Wait until the marker is gone, which means the page was rebuilt, then check `peek` is still true and `hidden` false. The mouse rests in the sidebar the whole time. Delegated listeners on `root` never see events from the removed nodes, so the peek's pointer zone stays "sidebar".
5. **Close after leaving.** Move the mouse to the page centre. Wait for `peek` false and `hidden` true; this takes 300 ms, so wait with `waitSidebar`.
6. **Pin.** Peek again (mouse to the toggle, wait for the peek), then one click on the toggle: `peek` false, `hidden` false, `expanded` "true", "Hide the sidebar". `mainLeft` is greater than the collapsed value, because the page is pushed. Saving `sidebarOpen` per window is unchanged and already covered by `tests/controller.test.mjs`, so don't reload here.
7. **Keyboard.**
   - Collapse with one click, then move the mouse to the page centre.
   - `focus()` the toggle: after `waitForTimeout(600)` there is no peek.
   - Press Enter: it pins, so `hidden` false and "Hide the sidebar". Collapse again with Enter.
   - Then peek with the mouse. Press Tab until `document.activeElement` is inside `#app-sidebar`, with at most 3 presses, starting from the focused toggle.
   - Move the mouse to the page centre. After `waitForTimeout(600)` it still peeks, because the keyboard holds it.
   - Press Escape: `peek` false, `hidden` true, and the keyboard is on the toggle (`document.activeElement` matches `.sidebar-toggle`).
7a. **A dialog opened from a peek.**
   - Peek with the mouse, then one `click()` on the sidebar's "Need help?" (`#app-sidebar [data-action="open-help"]`). The help dialog opens.
   - Move the mouse to the page centre. After `waitForTimeout(600)` the peek is still there behind the dialog (`peek` true).
   - Press Escape. The dialog closes and the keyboard goes back to "Need help?", with the sidebar still visible.
   - Press Escape a second time. The focus that came back to "Need help?" after a key press may count as keyboard focus (`:focus-visible`), in which case it holds the peek and this Escape closes it. If it doesn't count, the peek is already closing on its own.
   - Either way, wait for `peek` false. The keyboard ends on the toggle (`document.activeElement` matches `.sidebar-toggle`), not on a hidden control.
8. **Touch.**
   - With the sidebar collapsed and the mouse at the page centre, dispatch a touch hover on the toggle: `toggle.dispatchEvent("pointerover", { pointerType: "touch", bubbles: true })`. Playwright's `dispatchEvent` builds a `PointerEvent` for a pointer event name.
   - After `waitForTimeout(600)` there is no peek.
   - Then one click on the toggle pins it, as a tap does.
   - The phase ends pinned.

Run the phase in both permutations, so the staff window is Chrome in one and Firefox in the other.

- [ ] **Step 1: Write the phase** as above.
- [ ] **Step 2: Run** `npm run test:browser` in the foreground (up to 12 minutes), with output to the scratchpad. Expected: all pass, with the new phase in both permutations. If "Synthetic Auth provisioning failed" appears, that's test-user setup: re-run once and report both runs. Any other failure in an untouched phase: re-run once and report both runs.
- [ ] **Step 3: Docs.**
  - `docs/developer/frontend.md`: where the app shell is described (the `staffScreen` paragraph, ~line 131), add one or two sentences. The collapsed sidebar peeks over the page while a mouse rests on the toggle and closes 300 ms after the pointer and keyboard leave. A click pins it. `src/sidebar-peek.mjs` decides, and `app.mjs` applies it in place after every render.
  - `docs/setup.md`: the recorded suite counts (unit and browser) as observed.
  - `README.md`: only if it states the sidebar's behaviour or the counts.
- [ ] **Step 4: Commit** ("The story checks the sidebar's peek, pin, keyboard and touch; docs"), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## Self-review notes (for the executor)

- **Spec coverage** (§8 → task):
  - pinned as today → Global Constraints (`appShell` and its tests unchanged), Task 2 step 6;
  - peek over the page without pushing → Task 1 CSS, Task 2 step 2 (`mainLeft`);
  - stay → Task 1 tests, Task 2 step 3;
  - close 300 ms after leaving → Task 1 tests, Task 2 step 5;
  - click during peek pins → Task 2 step 6;
  - no re-peek after a collapse → Task 1 tests, Task 2 step 1;
  - mouse only → Task 1 tests, Task 2 step 8;
  - keyboard: focus no peek, Enter pins, Tab keeps, Escape closes → Task 1 tests, Task 2 step 7;
  - `aria-expanded` follows what's visible → `applyPeek`, Task 2 steps 2 and 6;
  - class change in place, survives a redraw → Task 1 wiring pin, Task 2 step 4.
  - §11's test line → Task 2.
- **Names:**
  - module: `createSidebarPeek`, `PEEK_OPEN_MS`, `PEEK_CLOSE_MS`, `peekZone`, `toggleLabel`;
  - instance methods: `isPeeking`, `setPinned`, `pointer`, `focus`, `pinned`, `collapsed`, `escape`;
  - `applyPeek` in `app.mjs`;
  - class `sidebar-peek`.
