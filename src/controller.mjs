import { CASE_ACTIONS } from "./contracts.mjs";
import { INTAKE_ANSWER_KEYS } from "./domain.mjs";
import { createWindowState } from "./window-state.mjs";

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
//   * **Window state is per window and per user.** Selection, screen, form step,
//     open panels, the persona and the board's filters live in session storage
//     under the authenticated user's id, so two windows disagree freely and two
//     accounts never share a view. That storage is a collaborator of its own
//     (`window-state.mjs`, Ruling R44); this file decides what the values mean.

// Screens each principal can be on, first entry first. A restored value outside
// the caller's own list is ignored rather than trusted — which is also what
// stops a client screen from being restored for a presenter, and the reverse.
const CLIENT_SCREENS = Object.freeze([
  "applications",
  "reference",
  "intake",
  "progress",
]);
const STAFF_SCREENS = Object.freeze(["staff", "staff-case"]);

// An action whose answer never arrived may or may not have been applied. Those
// are the only failures worth retrying with the same envelope; a refusal is
// final and its expected revision is already stale.
const UNKNOWN_OUTCOME = Object.freeze(["OFFLINE", "SERVER_ERROR"]);

const CONFLICT_MESSAGE =
  "Someone else changed this application. The newest version is shown — check it and try again.";
// The same event, in the words of the screen it lands on: staff read "case",
// clients read "application", and neither ever sees a revision number.
const STAFF_CONFLICT_MESSAGE =
  "Someone else changed this case. The newest version is shown — check it and try again.";
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
    // Identity and transport. `session` is what the last identity attempt
    // learned, and it is deliberately three-valued: a visitor who is signed out
    // and a server that cannot be reached must never be shown the same screen,
    // which is exactly why `auth.getSession()` throws OFFLINE rather than
    // answering null.
    session: "unknown", // 'unknown' | 'none' | 'present'
    principal: null,
    connection: "unknown",
    error: null,
    retryable: false,
    // Sign-in. The half-typed code lives here for the same reason answers do:
    // a re-render must never be able to empty a field somebody is using.
    authStep: "email",
    authEmail: "",
    authCode: "",
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
    // The staff board's filters, as chosen in this window. Only the choices a
    // person made are held; the board fills in its own defaults for the rest.
    boardFilters: {},
  };

  // Everything this window remembers by itself, under one key per user.
  const windowState = createWindowState({ sessionStorage, clock });

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
  //
  // What is stored, and how, belongs to the collaborator; what the values mean
  // — which screens exist, which of them this principal may be on — belongs
  // here.

  // Screens the current principal may be on, first entry first.
  const screens = () =>
    state.principal?.access === "presenter" ? STAFF_SCREENS : CLIENT_SCREENS;

  // Where "back to the list" goes for whoever is signed in.
  const homeScreen = () => screens()[0];

  function persistSession() {
    if (!state.principal) return;
    windowState.write(state.principal.userId, {
      screen: state.screen,
      selectedCaseId: state.selectedCaseId,
      selectedPersonId: state.selectedPersonId,
      formStep: state.formStep,
      openPanels: state.openPanels,
      pendingCreateActionId: state.pendingCreateActionId,
      boardFilters: state.boardFilters,
    });
  }

  function restoreSession() {
    const saved = state.principal
      ? windowState.read(state.principal.userId)
      : null;
    if (!saved) return;
    // Every field has already been checked for its shape; the screen is checked
    // here, against the list this principal is allowed.
    if (screens().includes(saved.screen)) state.screen = saved.screen;
    if (saved.selectedCaseId) state.selectedCaseId = saved.selectedCaseId;
    if (saved.selectedPersonId) state.selectedPersonId = saved.selectedPersonId;
    if (saved.formStep !== undefined) state.formStep = saved.formStep;
    if (saved.openPanels) state.openPanels = saved.openPanels;
    if (saved.pendingCreateActionId)
      state.pendingCreateActionId = saved.pendingCreateActionId;
    if (saved.boardFilters) state.boardFilters = saved.boardFilters;
  }

  // ---- the resend cooldown (Ruling R38) ----------------------------------
  //
  // The auth module's cooldown lives in memory, so a reload would start a fresh
  // one. The moment the last request left is written to session storage
  // instead, and the remaining time is derived from it, so reloading the window
  // cannot buy another send. It is per window, exactly like the rest of this
  // state, and holds no code or token.

  const accessRecord = () => windowState.readAccess();

  const cooldownRemaining = () =>
    Math.max(
      windowState.cooldownRemaining(cooldownSeconds),
      auth?.cooldownRemaining?.() ?? 0,
    );

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
    // Without a principal there is nothing to re-read, but there may still be
    // an identity to establish: a visitor whose session could not be read, or
    // who is signed in and could not be identified, gets another attempt here.
    // That is what makes focus, `online` and the retry button work when the
    // subscription never opened at all.
    if (!state.principal) {
      if (state.session !== "none") await load();
      return;
    }
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
        state.screen = homeScreen();
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
        state.screen = homeScreen();
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
      // Whether this visitor is signed in is simply not known, so the sign-in
      // form would be a guess. The screen says so and offers another attempt,
      // and focus/online events keep trying on their own.
      state.session = "unknown";
      state.principal = null;
      noteFailure(error);
      show();
      return;
    }
    if (!session) {
      state.session = "none";
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
    state.session = "present";
    let principal;
    try {
      principal = await store.getPrincipal();
    } catch (error) {
      // There is a session, so this is never the sign-in form: either this
      // account is not on the roster (FORBIDDEN) or the server is unreachable.
      state.principal = null;
      noteFailure(error);
      show();
      return;
    }
    state.principal = principal;
    state.authError = null;
    windowState.clearAccess();
    restoreSession();
    // A presenter lands on the work board and a client on their applications,
    // unless this window was already somewhere this principal may be.
    if (!screens().includes(state.screen)) state.screen = homeScreen();
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
          state.screen = homeScreen();
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
      // for telling two addresses apart. The cooldown runs against the window,
      // not against an address, so the address entered now is the one bound and
      // shown — a corrected typo must never stay tied to the typo.
      const record = accessRecord();
      state.authStep = "code";
      state.authEmail = address;
      const answer = {
        state: "code_entry",
        message: record.message ?? state.authMessage,
        retryAfterSeconds: remaining,
      };
      state.authMessage = answer.message;
      windowState.writeAccess({
        startedAt: record.startedAt,
        email: address,
        message: answer.message,
      });
      show();
      return answer;
    }
    try {
      const answer = await auth.sendCode(address);
      state.authStep = "code";
      state.authEmail = address;
      state.authMessage = answer.message;
      windowState.writeAccess({
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

  // What the visitor is typing, kept without a re-render: the field already
  // shows it, and rebuilding the page under the cursor is the defect this
  // exists to prevent. The address gets the same treatment — a connection
  // notice arriving mid-typing would otherwise empty that field too.
  function editAuthCode(value) {
    state.authCode = String(value ?? "");
  }

  function editAuthEmail(value) {
    state.authEmail = String(value ?? "");
  }

  // The argument wins when given — it is what the field actually showed at
  // submit time — and is stored, so the state and what was sent always agree.
  // Called with nothing, the stored value is used.
  async function verifyCode(code) {
    if (code !== undefined && code !== null) editAuthCode(code);
    state.authError = null;
    show();
    try {
      await auth.verifyCode(state.authEmail, state.authCode);
    } catch (error) {
      state.authError = {
        code: error?.code ?? "AUTH_ERROR",
        message: error?.message ?? "Sign-in could not be completed.",
      };
      if (error?.code === "OFFLINE") state.connection = "offline";
      show();
      throw error;
    }
    windowState.clearAccess();
    state.authStep = "email";
    state.authCode = "";
    // Which screen this visitor lands on is `load()`'s to decide: it knows the
    // principal, and this window may already have been somewhere.
    await load();
  }

  // "Use a different email address". The cooldown is the window's and survives
  // (R38 — a reload or a restart cannot buy another send), but the address it
  // was bound to does not: the next send binds whatever is typed then.
  function restartSignIn() {
    const record = accessRecord();
    state.authStep = "email";
    state.authEmail = "";
    state.authCode = "";
    state.authError = null;
    state.authMessage = "";
    if (record.startedAt === undefined) windowState.clearAccess();
    else
      windowState.writeAccess({
        startedAt: record.startedAt,
        message: record.message,
      });
    show();
  }

  // Signing out drops every record this window holds, not just the session.
  function forgetUser() {
    if (state.principal) windowState.clear(state.principal.userId);
    unsubscribe();
    clearSelection();
    state.session = "none";
    state.principal = null;
    state.cases = [];
    state.people = [];
    state.selectedPersonId = null;
    state.openPanels = [];
    state.lookup = "";
    state.dialog = null;
    state.pendingCreateActionId = null;
    state.boardFilters = {};
    state.error = null;
    state.authStep = "email";
    state.authEmail = "";
    state.authCode = "";
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

  // The work board's filters, one choice at a time. They are this window's
  // view of the same list everybody else sees, so they are stored beside the
  // selection rather than sent anywhere.
  function setBoardFilter(name, value) {
    if (!name) return;
    state.boardFilters = { ...state.boardFilters, [name]: String(value ?? "") };
    persistSession();
    show();
  }

  function clearBoardFilters() {
    state.boardFilters = {};
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
        state.screen =
          state.principal?.access === "presenter"
            ? "staff-case"
            : next.stage === "draft"
              ? "intake"
              : "progress";
    } catch (error) {
      if (error?.code === "NOT_FOUND") {
        clearSelection();
        state.screen = homeScreen();
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

  // A retained save envelope carries the answers it was built from. It is only
  // meaningful while those answers are still the draft: re-sending it after a
  // further edit would commit the older text at its older expected revision
  // and then be refreshed over, losing the newer typing without any error.
  const staleSave = () =>
    Boolean(
      pendingAction?.save &&
        JSON.stringify(pendingAction.action.payload?.answers ?? {}) !==
          JSON.stringify(state.draftAnswers),
    );

  function forgetPendingSave() {
    if (!pendingAction?.save) return;
    pendingAction = null;
    state.retryable = false;
  }

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
    // The next save builds a fresh envelope from the new draft; the old one is
    // dropped here so no banner can still offer to re-send it.
    forgetPendingSave();
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
          error?.code === "CONFLICT"
            ? {
                message:
                  state.principal?.access === "presenter"
                    ? STAFF_CONFLICT_MESSAGE
                    : CONFLICT_MESSAGE,
              }
            : undefined,
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
    // The chosen answers are a new draft, so any retained save envelope is as
    // stale here as it is after a keystroke.
    forgetPendingSave();
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
    // Second guard, for any path that changes the draft without going through
    // editAnswers: an envelope that no longer matches the draft is dropped, not
    // sent. Nothing is lost — the draft is still here and still saveable.
    if (staleSave()) {
      forgetPendingSave();
      show();
      return null;
    }
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
      boardFilters: { ...state.boardFilters },
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
    editAuthCode,
    editAuthEmail,
    restartSignIn,
    signOut,
    cooldownRemaining,
    selectCase,
    createCase,
    selectPerson,
    setBoardFilter,
    clearBoardFilters,
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
