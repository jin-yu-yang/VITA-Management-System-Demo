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
