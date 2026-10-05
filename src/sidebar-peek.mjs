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
