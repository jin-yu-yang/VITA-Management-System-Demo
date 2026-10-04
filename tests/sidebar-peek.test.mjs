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
