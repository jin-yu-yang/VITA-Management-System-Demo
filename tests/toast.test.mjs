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
