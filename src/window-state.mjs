// Everything this browser window remembers by itself (Ruling R44). The
// controller owns what the server said; this collaborator owns what *this
// window* chose — which case is open, which screen it is on, which persona a
// presenter is acting as, how the work board is filtered — plus the access
// record that makes the resend cooldown survive a reload.
//
// Three rules it exists to keep:
//
//   * **Per window, per user.** Every choice is stored under the authenticated
//     user's id, so two windows disagree freely and two accounts sharing one
//     session storage never see each other's selection.
//   * **One key scheme.** Client and staff state live in the same record. There
//     is no second key, so signing out clears all of it at once.
//   * **Storage is a convenience, never a dependency.** A window with no
//     session storage, a quota failure or an unreadable value all behave the
//     same way: the window simply forgets, and nothing throws.
//
// It holds no code, token or answer — only navigation choices and the moment
// the last sign-in code was requested.

const WINDOW_STATE_PREFIX = "vitally:client:v1:";
const ACCESS_KEY = "vitally:access:v1";

export const windowStateKey = (userId) => `${WINDOW_STATE_PREFIX}${userId}`;
export { ACCESS_KEY };

const asString = (value) => (typeof value === "string" ? value : undefined);
const asStep = (value) => (Number.isInteger(value) ? value : undefined);
const asNames = (value) =>
  Array.isArray(value)
    ? value.filter((entry) => typeof entry === "string")
    : undefined;
// The board's filters are a small map of plain strings; anything else in there
// is ignored rather than trusted.
const asFilters = (value) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          ([, entry]) => typeof entry === "string",
        ),
      )
    : undefined;

// The stored fields, with the check each one has to pass to be restored. A
// screen name is restored as a string: which screens exist is the controller's
// knowledge, and it applies its own allowlist to what comes back.
const FIELDS = Object.freeze({
  screen: asString,
  selectedCaseId: asString,
  selectedPersonId: asString,
  formStep: asStep,
  openPanels: asNames,
  pendingCreateActionId: asString,
  boardFilters: asFilters,
});

/**
 * @param {object} options
 * @param {Storage} [options.sessionStorage] the window's session storage
 * @param {() => number} [options.clock]     current time in milliseconds
 * @returns {{
 *   read(userId: string): object|null,
 *   write(userId: string, value: object): void,
 *   clear(userId: string): void,
 *   readAccess(): object,
 *   writeAccess(record: object): void,
 *   clearAccess(): void,
 *   cooldownRemaining(seconds: number): number,
 * }}
 */
export function createWindowState({ sessionStorage, clock = () => Date.now() } = {}) {
  const readJson = (key) => {
    try {
      const raw = sessionStorage?.getItem?.(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const writeJson = (key, value) => {
    try {
      sessionStorage?.setItem?.(key, JSON.stringify(value));
    } catch {
      // A window with no session storage still works; it just forgets.
    }
  };

  const dropKey = (key) => {
    try {
      sessionStorage?.removeItem?.(key);
    } catch {
      // Nothing to do: the value is already unreachable.
    }
  };

  // Only the known fields, only when they are the right shape. A record that
  // was written by an older version, or edited by hand, contributes whatever
  // still makes sense and nothing else.
  const pick = (source) => {
    if (!source || typeof source !== "object") return null;
    const result = {};
    for (const [key, check] of Object.entries(FIELDS)) {
      const value = check(source[key]);
      if (value !== undefined) result[key] = value;
    }
    return result;
  };

  return {
    // What this user chose in this window, or null when nothing usable is
    // stored. Only the fields that were actually stored come back.
    read(userId) {
      if (!userId) return null;
      const saved = pick(readJson(windowStateKey(userId)));
      return saved && Object.keys(saved).length ? saved : null;
    },

    write(userId, value) {
      if (!userId) return;
      writeJson(windowStateKey(userId), pick(value) ?? {});
    },

    clear(userId) {
      if (!userId) return;
      dropKey(windowStateKey(userId));
    },

    // The access record (Ruling R38): `{startedAt, email, message}` — when the
    // last sign-in code was requested, the address it was requested for, and
    // the one neutral sentence shown for it. Never a code or a token.
    readAccess() {
      const saved = readJson(ACCESS_KEY);
      return saved && typeof saved === "object" && !Array.isArray(saved)
        ? saved
        : {};
    },

    writeAccess(record) {
      writeJson(ACCESS_KEY, record ?? {});
    },

    clearAccess() {
      dropKey(ACCESS_KEY);
    },

    // Whole seconds left of the resend cooldown, derived from the stored
    // moment so reloading the window cannot buy another send.
    cooldownRemaining(seconds) {
      const { startedAt } = this.readAccess();
      if (!Number.isFinite(startedAt) || !Number.isFinite(seconds)) return 0;
      return Math.max(0, Math.ceil((startedAt + seconds * 1000 - clock()) / 1000));
    },
  };
}
