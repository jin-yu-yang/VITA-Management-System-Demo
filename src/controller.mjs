import { CASE_ACTIONS } from "./contracts.mjs";
import { INTAKE_ANSWER_KEYS } from "./domain.mjs";

// The one place browser state lives. It owns what is loaded, what is being
// edited, and which action envelope is in flight; it renders nothing and knows
// no HTML. Everything it reads or writes goes through the injected store and
// auth modules, so the same controller runs in the browser and against doubles.
//
// Three rules this file exists to keep:
//
//   * **savedCase and draftAnswers are different things.** A remote change
//     replaces what the server says; it never rewrites what the person typed.
//     When the two diverge the controller says so (`conflict`) and refuses to
//     save until a human chooses. Pending edits are never silently rebased.
//   * **An unknown outcome keeps its envelope.** A timed-out action is retried
//     as the identical object — same action id, payload, persona and expected
//     revision — so the server replays its receipt instead of acting twice.
//   * **Window state is per window and per user.** Selection, screen, form step
//     and open panels live in session storage under the authenticated user's
//     id, so two windows disagree freely and two accounts never share a view.

const SESSION_PREFIX = "vitally:client:v1:";
const ACCESS_KEY = "vitally:access:v1";

// Screens the applicant can be on. A restored value outside this list is
// ignored rather than trusted.
const CLIENT_SCREENS = Object.freeze([
  "applications",
  "reference",
  "intake",
  "progress",
]);

// An action whose answer never arrived may or may not have been applied. Those
// are the only failures worth retrying with the same envelope; a refusal is
// final and its expected revision is already stale.
const UNKNOWN_OUTCOME = Object.freeze(["OFFLINE", "SERVER_ERROR"]);

const CONFLICT_MESSAGE =
  "Someone else changed this application. The newest version is shown — check it and try again.";
const EDIT_CONFLICT_MESSAGE =
  "Someone else changed this application while you were editing. Choose which answers to keep.";

function controllerError(code, message, cause) {
  return Object.assign(new Error(message, { cause }), { code });
}

// The intake whitelist is the only thing that reaches `answers`. Anything else
// — an owner id, a stage, a forged reference — is dropped here, once.
function pickAnswers(source) {
  const result = {};
  if (!source || typeof source !== "object") return result;
  for (const key of INTAKE_ANSWER_KEYS) {
    const value = source[key];
    if (value === undefined || value === null) continue;
    result[key] = String(value);
  }
  return result;
}

export function createController({
  store,
  auth,
  render,
  sessionStorage,
  windowEvents = globalThis,
  clock = () => Date.now(),
  newActionId = () => crypto.randomUUID(),
  cooldownSeconds = 65,
}) {
  const state = {
    // Identity and transport
    principal: null,
    connection: "unknown",
    error: null,
    retryable: false,
    // Sign-in
    authStep: "email",
    authEmail: "",
    authMessage: "",
    authError: null,
    // Records
    cases: [],
    people: [],
    savedCase: null,
    draftAnswers: {},
    editBaseRevision: null,
    dirty: false,
    conflict: null,
    saveState: "idle",
    busy: false,
    // Window-local navigation
    screen: "access",
    selectedCaseId: null,
    selectedPersonId: null,
    formStep: 0,
    openPanels: [],
    lookup: "",
    dialog: null,
    pendingCreateActionId: null,
  };

  // The envelope of the last action whose outcome is unknown. Kept as the very
  // object that was sent, because retrying a copy would be a second action.
  let pendingAction = null;
  let creating = false;
  let releaseStore = null;
  let releaseAuth = null;
  let listening = false;
  let started = false;

  const show = () => render?.();

  // ---- window-local state ------------------------------------------------

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

  const sessionKey = () =>
    state.principal ? `${SESSION_PREFIX}${state.principal.userId}` : null;

  function persistSession() {
    const key = sessionKey();
    if (!key) return;
    writeJson(key, {
      screen: state.screen,
      selectedCaseId: state.selectedCaseId,
      selectedPersonId: state.selectedPersonId,
      formStep: state.formStep,
      openPanels: state.openPanels,
      pendingCreateActionId: state.pendingCreateActionId,
    });
  }

  function restoreSession() {
    const key = sessionKey();
    const saved = key ? readJson(key) : null;
    if (!saved) return;
    if (CLIENT_SCREENS.includes(saved.screen)) state.screen = saved.screen;
    if (typeof saved.selectedCaseId === "string")
      state.selectedCaseId = saved.selectedCaseId;
    if (typeof saved.selectedPersonId === "string")
      state.selectedPersonId = saved.selectedPersonId;
    if (Number.isInteger(saved.formStep)) state.formStep = saved.formStep;
    if (Array.isArray(saved.openPanels))
      state.openPanels = saved.openPanels.filter(
        (name) => typeof name === "string",
      );
    if (typeof saved.pendingCreateActionId === "string")
      state.pendingCreateActionId = saved.pendingCreateActionId;
  }

  // ---- the resend cooldown (Ruling R38) ----------------------------------
  //
  // The auth module's cooldown lives in memory, so a reload would start a fresh
  // one. The moment the last request left is written to session storage
  // instead, and the remaining time is derived from it, so reloading the window
  // cannot buy another send. It is per window, exactly like the rest of this
  // state, and holds no code or token.

  const accessRecord = () => readJson(ACCESS_KEY) ?? {};

  function storedRemaining() {
    const { startedAt } = accessRecord();
    if (!Number.isFinite(startedAt)) return 0;
    return Math.max(
      0,
      Math.ceil((startedAt + cooldownSeconds * 1000 - clock()) / 1000),
    );
  }

  const cooldownRemaining = () =>
    Math.max(storedRemaining(), auth?.cooldownRemaining?.() ?? 0);

  // ---- reading -----------------------------------------------------------

  function noteConnected() {
    if (state.connection !== "online") state.connection = "online";
  }

  function noteFailure(error, { message } = {}) {
    state.error = {
      code: error?.code ?? "SERVER_ERROR",
      message: message ?? error?.message ?? "Something went wrong.",
    };
    if (error?.code === "OFFLINE") state.connection = "offline";
  }

  // A snapshot from the server replaces what we knew only when it is newer, so
  // a slow earlier response cannot undo a later one. A newer revision arriving
  // mid-edit updates savedCase and raises the conflict; it never rebases the
  // draft.
  function applyCase(next) {
    if (!next) return;
    const current = state.savedCase;
    if (
      current &&
      current.id === next.id &&
      Number(next.revision) < Number(current.revision)
    )
      return;
    state.savedCase = next;
    if (state.dirty && state.editBaseRevision !== null) {
      state.conflict =
        Number(next.revision) > Number(state.editBaseRevision)
          ? {
              code: "REMOTE_CHANGED",
              baseRevision: Number(state.editBaseRevision),
              serverRevision: Number(next.revision),
            }
          : null;
      return;
    }
    state.draftAnswers = pickAnswers(next.answers);
    state.conflict = null;
  }

  async function loadList() {
    state.cases = await store.listCases();
    noteConnected();
  }

  async function loadSelected() {
    if (!state.selectedCaseId) return;
    const next = await store.getCase(state.selectedCaseId);
    applyCase(next);
    noteConnected();
  }

  // The public re-fetch: the list plus whatever case is open. Used by the
  // reconnect, the window focus and the online event alike, because a
  // subscription is never the only way back.
  async function refresh() {
    if (!state.principal) return;
    let failure = null;
    try {
      await loadList();
    } catch (error) {
      failure = error;
    }
    try {
      await loadSelected();
    } catch (error) {
      // A case that is gone is not a failure to report: the fixtures were
      // reset, or it was closed and removed. Fall back to the list.
      if (error?.code === "NOT_FOUND") {
        clearSelection();
        state.screen = "applications";
      } else failure = failure ?? error;
    }
    if (failure) noteFailure(failure);
    else state.error = null;
    persistSession();
    show();
  }

  function clearSelection() {
    state.selectedCaseId = null;
    state.savedCase = null;
    state.draftAnswers = {};
    state.editBaseRevision = null;
    state.dirty = false;
    state.conflict = null;
    state.saveState = "idle";
    state.formStep = 0;
    // Open panels are per case: a confirmation ticked on one application, or a
    // simulated upload failure on one request, means nothing on another.
    state.openPanels = [];
    pendingAction = null;
    state.retryable = false;
  }

  // ---- start / stop ------------------------------------------------------

  const onWake = () => refresh();

  function listen() {
    if (listening) return;
    listening = true;
    windowEvents?.addEventListener?.("focus", onWake);
    windowEvents?.addEventListener?.("online", onWake);
  }

  function unlisten() {
    if (!listening) return;
    listening = false;
    windowEvents?.removeEventListener?.("focus", onWake);
    windowEvents?.removeEventListener?.("online", onWake);
  }

  function subscribe() {
    if (releaseStore) return;
    releaseStore = store.subscribe({
      onChange: (change) => handleChange(change),
      onConnection: (status) => {
        const previous = state.connection;
        state.connection = status;
        show();
        // Reconnecting means the browser may have missed changes entirely.
        if (status === "online" && previous !== "online" && previous !== "unknown")
          refresh();
      },
    });
  }

  function unsubscribe() {
    const release = releaseStore;
    releaseStore = null;
    release?.();
  }

  // A change carries identifiers only, so the reaction is a targeted re-read
  // through the same access-scoped path — never the payload itself.
  async function handleChange(change) {
    if (!state.principal || !change) return;
    const touchesList = change.table === "cases";
    const touchesOpen =
      state.selectedCaseId && change.caseId === state.selectedCaseId;
    if (!touchesList && !touchesOpen) return;
    try {
      if (touchesList) await loadList();
      if (touchesOpen) await loadSelected();
      state.error = null;
    } catch (error) {
      if (error?.code !== "NOT_FOUND") noteFailure(error);
      else {
        clearSelection();
        state.screen = "applications";
      }
    }
    show();
  }

  // Identity first, and only then the subscription: a refused or unreachable
  // principal must never open a channel, and staff reads happen only when the
  // principal says staff.
  async function load() {
    let session;
    try {
      session = await auth.getSession();
    } catch (error) {
      noteFailure(error);
      state.screen = "access";
      show();
      return;
    }
    if (!session) {
      state.principal = null;
      state.screen = "access";
      const record = accessRecord();
      if (record.email) {
        state.authStep = "code";
        state.authEmail = record.email;
        state.authMessage = record.message ?? "";
      }
      show();
      return;
    }
    let principal;
    try {
      principal = await store.getPrincipal();
    } catch (error) {
      state.principal = null;
      noteFailure(error);
      show();
      return;
    }
    state.principal = principal;
    state.authError = null;
    dropKey(ACCESS_KEY);
    restoreSession();
    if (!CLIENT_SCREENS.includes(state.screen)) state.screen = "applications";
    if (principal.access === "presenter") state.screen = "staff";
    try {
      await loadList();
      if (principal.access === "presenter") state.people = await store.listPeople();
      state.error = null;
    } catch (error) {
      noteFailure(error);
    }
    subscribe();
    if (state.selectedCaseId) {
      try {
        await loadSelected();
      } catch (error) {
        if (error?.code === "NOT_FOUND") {
          clearSelection();
          state.screen =
            principal.access === "presenter" ? "staff" : "applications";
        } else noteFailure(error);
      }
    }
    persistSession();
    show();
  }

  async function start() {
    if (started) return;
    started = true;
    listen();
    releaseAuth = auth.subscribe?.(({ event }) => {
      // Another window signing out must not leave this one holding records.
      if (event === "SIGNED_OUT" && state.principal) forgetUser();
    });
    await load();
  }

  function stop() {
    started = false;
    unsubscribe();
    const releaseAuthListener = releaseAuth;
    releaseAuth = null;
    releaseAuthListener?.();
    unlisten();
  }

  // ---- sign-in -----------------------------------------------------------

  async function sendCode(email) {
    const address = String(email ?? "").trim();
    state.authError = null;
    const remaining = cooldownRemaining();
    if (remaining > 0) {
      // Inside the window nothing leaves at all, and the answer is the same
      // sentence as a real send: a cooldown must not become a second channel
      // for telling two addresses apart.
      const record = accessRecord();
      state.authStep = "code";
      state.authEmail = record.email ?? address;
      const answer = {
        state: "code_entry",
        message: record.message ?? state.authMessage,
        retryAfterSeconds: remaining,
      };
      state.authMessage = answer.message;
      show();
      return answer;
    }
    try {
      const answer = await auth.sendCode(address);
      state.authStep = "code";
      state.authEmail = address;
      state.authMessage = answer.message;
      writeJson(ACCESS_KEY, {
        startedAt: clock(),
        email: address,
        message: answer.message,
      });
      show();
      return answer;
    } catch (error) {
      state.authError = {
        code: error?.code ?? "AUTH_ERROR",
        message: error?.message ?? "Sign-in could not be completed.",
      };
      if (error?.code === "OFFLINE") state.connection = "offline";
      show();
      throw error;
    }
  }

  async function verifyCode(code) {
    state.authError = null;
    show();
    try {
      await auth.verifyCode(state.authEmail, code);
    } catch (error) {
      state.authError = {
        code: error?.code ?? "AUTH_ERROR",
        message: error?.message ?? "Sign-in could not be completed.",
      };
      if (error?.code === "OFFLINE") state.connection = "offline";
      show();
      throw error;
    }
    dropKey(ACCESS_KEY);
    state.authStep = "email";
    state.screen = "applications";
    await load();
  }

  function restartSignIn() {
    state.authStep = "email";
    state.authError = null;
    state.authMessage = "";
    show();
  }

  // Signing out drops every record this window holds, not just the session.
  function forgetUser() {
    const key = sessionKey();
    if (key) dropKey(key);
    unsubscribe();
    clearSelection();
    state.principal = null;
    state.cases = [];
    state.people = [];
    state.selectedPersonId = null;
    state.openPanels = [];
    state.lookup = "";
    state.dialog = null;
    state.pendingCreateActionId = null;
    state.error = null;
    state.authStep = "email";
    state.authEmail = "";
    state.authMessage = "";
    state.authError = null;
    state.screen = "access";
    show();
  }

  async function signOut() {
    try {
      await auth.signOut?.();
    } finally {
      forgetUser();
    }
  }

  // ---- navigation (window-local) -----------------------------------------

  function navigate(screen) {
    state.screen = screen;
    state.error = null;
    state.dialog = null;
    persistSession();
    show();
  }

  function setFormStep(step) {
    state.formStep = Math.max(0, Math.trunc(Number(step) || 0));
    persistSession();
    show();
  }

  function togglePanel(name) {
    state.openPanels = state.openPanels.includes(name)
      ? state.openPanels.filter((entry) => entry !== name)
      : [...state.openPanels, name];
    persistSession();
    show();
  }

  function setLookup(value) {
    state.lookup = String(value ?? "");
  }

  function openDialog(name) {
    state.dialog = name;
    show();
  }

  function closeDialog() {
    state.dialog = null;
    show();
  }

  function dismissError() {
    state.error = null;
    show();
  }

  // The selected persona is a window-local view choice. It reaches the server
  // only through `runAction`, and only for a presenter.
  function selectPerson(id) {
    state.selectedPersonId = id ?? null;
    persistSession();
    show();
  }

  // ---- cases -------------------------------------------------------------

  async function selectCase(id, { navigate: move = true } = {}) {
    if (state.savedCase?.id !== id) clearSelection();
    state.selectedCaseId = id;
    persistSession();
    try {
      const next = await store.getCase(id);
      applyCase(next);
      noteConnected();
      state.error = null;
      if (move)
        state.screen = next.stage === "draft" ? "intake" : "progress";
    } catch (error) {
      if (error?.code === "NOT_FOUND") {
        clearSelection();
        state.screen = "applications";
      }
      noteFailure(error);
      persistSession();
      show();
      throw error;
    }
    persistSession();
    show();
  }

  // Explicit and idempotent: the pending action id lives in window state until
  // its receipt arrives, so an offline retry reuses it and a second click while
  // one is in flight does nothing at all. Reopening, refreshing or filling a
  // form never reaches this function.
  async function createCase() {
    if (creating) return null;
    creating = true;
    if (!state.pendingCreateActionId) {
      state.pendingCreateActionId = newActionId();
      persistSession();
    }
    const request = {
      actionId: state.pendingCreateActionId,
      mode: "client",
      personId: null,
      answers: {},
    };
    try {
      const receipt = await store.createCase(request);
      // The receipt is the point of no return: the case exists, so the pending
      // id is spent and a later read failure cannot make it look unstarted.
      state.pendingCreateActionId = null;
      state.error = null;
      noteConnected();
      persistSession();
      try {
        await loadList();
        await selectCase(receipt.caseId);
        state.screen = "reference";
      } catch (error) {
        noteFailure(error);
      }
      persistSession();
      show();
      return receipt;
    } catch (error) {
      noteFailure(error);
      // The id stays in window state: the retry has to be the same request.
      persistSession();
      show();
      throw error;
    } finally {
      creating = false;
    }
  }

  // ---- editing and saving -------------------------------------------------

  function editAnswers(patch) {
    const clean = pickAnswers(patch);
    if (!Object.keys(clean).length) return;
    // The base revision is pinned on the first edit and kept until the edits
    // are saved or reconciled, so a later remote change is measured against
    // what this person was actually looking at.
    if (state.editBaseRevision === null && state.savedCase)
      state.editBaseRevision = Number(state.savedCase.revision);
    state.draftAnswers = { ...state.draftAnswers, ...clean };
    state.dirty = true;
    state.saveState = "unsaved";
    state.error = null;
    show();
  }

  async function dispatch(action, { save = false } = {}) {
    state.busy = true;
    state.error = null;
    if (save) state.saveState = "saving";
    show();
    try {
      const receipt = await store.act(action);
      pendingAction = null;
      state.retryable = false;
      noteConnected();
      if (save) {
        state.dirty = false;
        state.editBaseRevision = null;
        state.conflict = null;
        state.saveState = "saved";
      }
      // The action is done. A re-read that fails afterwards is a stale view,
      // never a failed action, and must not put the envelope back in hand.
      await refresh();
      state.busy = false;
      show();
      return receipt;
    } catch (error) {
      state.busy = false;
      if (save) state.saveState = "failed";
      if (UNKNOWN_OUTCOME.includes(error?.code)) {
        // The server may already have applied it. The retry must be the same
        // envelope so the stored receipt answers instead of a second action.
        pendingAction = { action, save };
        state.retryable = true;
        noteFailure(error);
      } else {
        pendingAction = null;
        state.retryable = false;
        noteFailure(
          error,
          error?.code === "CONFLICT" ? { message: CONFLICT_MESSAGE } : undefined,
        );
        if (error?.code === "CONFLICT")
          await loadSelected().catch(() => {});
      }
      show();
      throw error;
    }
  }

  async function saveAnswers() {
    if (!state.savedCase)
      throw controllerError("NOT_FOUND", "Open an application first.");
    if (state.conflict) {
      // Refusing here is the point: the pending edits are not rebased onto the
      // newer revision behind the person's back.
      state.saveState = "failed";
      noteFailure({ code: "CONFLICT" }, { message: EDIT_CONFLICT_MESSAGE });
      show();
      throw controllerError("CONFLICT", EDIT_CONFLICT_MESSAGE);
    }
    const action = {
      actionId: newActionId(),
      caseId: state.savedCase.id,
      expectedRevision:
        state.editBaseRevision ?? Number(state.savedCase.revision),
      personId: null,
      type: "SAVE_ANSWERS",
      payload: { answers: { ...state.draftAnswers } },
    };
    return await dispatch(action, { save: true });
  }

  // A deliberate choice between two sets of answers, and nothing more: it takes
  // a fresh look at the server, refuses if the case moved again, and leaves the
  // result unsaved so the save still goes through the database revision check.
  async function reconcileAnswers({ answers, expectedServerRevision }) {
    if (!state.selectedCaseId)
      throw controllerError("NOT_FOUND", "Open an application first.");
    const latest = await store.getCase(state.selectedCaseId);
    applyCase(latest);
    noteConnected();
    if (Number(latest.revision) !== Number(expectedServerRevision)) {
      show();
      throw controllerError(
        "CONFLICT",
        "This application changed again. Check the newest values and choose once more.",
      );
    }
    state.draftAnswers = pickAnswers(answers);
    state.editBaseRevision = Number(latest.revision);
    state.dirty = true;
    state.conflict = null;
    state.saveState = "unsaved";
    state.error = null;
    show();
  }

  async function runAction(type, payload, { personId } = {}) {
    if (!CASE_ACTIONS.includes(type))
      throw controllerError("VALIDATION", "This step is not available.");
    if (!state.savedCase)
      throw controllerError("NOT_FOUND", "Open an application first.");
    const action = {
      actionId: newActionId(),
      caseId: state.savedCase.id,
      expectedRevision: Number(state.savedCase.revision),
      // A client acts as themselves. A staff persona is sent only by a
      // presenter, and the server refuses one from anybody else anyway.
      personId:
        state.principal?.access === "presenter"
          ? (personId ?? state.selectedPersonId ?? null)
          : null,
      type,
      payload: payload ?? {},
    };
    return await dispatch(action);
  }

  async function retryLast() {
    if (!pendingAction) return null;
    const { action, save } = pendingAction;
    return await dispatch(action, { save });
  }

  function getState() {
    return {
      ...state,
      cases: [...state.cases],
      people: [...state.people],
      draftAnswers: { ...state.draftAnswers },
      openPanels: [...state.openPanels],
      conflict: state.conflict ? { ...state.conflict } : null,
      error: state.error ? { ...state.error } : null,
      authError: state.authError ? { ...state.authError } : null,
      resendSeconds: cooldownRemaining(),
    };
  }

  return {
    start,
    stop,
    getState,
    refresh,
    sendCode,
    verifyCode,
    restartSignIn,
    signOut,
    cooldownRemaining,
    selectCase,
    createCase,
    selectPerson,
    editAnswers,
    saveAnswers,
    reconcileAnswers,
    runAction,
    retryLast,
    navigate,
    setFormStep,
    togglePanel,
    setLookup,
    openDialog,
    closeDialog,
    dismissError,
  };
}
