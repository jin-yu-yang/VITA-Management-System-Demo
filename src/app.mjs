import { createAuth } from "./auth.mjs";
import { createStore } from "./supabase-store.mjs";
import { createController } from "./controller.mjs";
import { CASE_ACTIONS, ASSISTANCE_ACTIONS } from "./contracts.mjs";
import { payloadFor } from "./case-actions.mjs";
import { checkDrafts, formValuesWithLists, isCheckable, restoreDraft, textDraft } from "./form-values.mjs";
import { sampleAnswersFor, fictionalAnswers } from "./sample-data.mjs";
import { checkValue, findQuestion, findSubstep, isAnswered } from "./intake-catalogue.mjs";
import {
  countText,
  drivesVisibility,
  needsRedraw,
  newMemberId,
  noteState,
  readField,
  readForm,
  sendable,
  stepRollup,
  substepStatus,
  visibleSubsteps,
} from "./intake-form.mjs";
import {
  addCaseParts,
  addCaseCountText,
  addCasePartStatus,
  addCaseSendOff,
} from "./office-views.mjs";
import { cardsFor } from "./document-cards.mjs";
import { FORM_FILES, draftFields } from "./draft-form.mjs";
import { FORM_14446_FILES, draft14446Fields } from "./draft-virtual-consent.mjs";
import { buildDraftPdf, createDraftOffer, draftFontsFor, draftLink, fieldsNeedFont } from "./draft-pdf.mjs";
import {
  describeFocus,
  focusSelectors,
  dialogFocusTarget,
  fieldId,
  icon,
  nextTabIndex,
} from "./ui.mjs";
import * as views from "./views.mjs";
import * as client from "./client-views.mjs";
import { POOL_FILTER_KEYS } from "./pool-views.mjs";
import { createSidebarPeek, peekZone, toggleLabel } from "./sidebar-peek.mjs";
import { STORAGE_KEY, createLanguageRequests, isLang, loadHantWithin, viewLang } from "./language.mjs";
import { createHantLoader, hantReady } from "./hant.mjs";
import { t, SENTENCES } from "./client-text.mjs";
import { createToastTimer } from "./toast.mjs";

// Bootstrap and DOM wiring, and nothing else. No state lives here (the
// controller owns it), no HTML is written here (the view modules own it), and
// no database call is made here (the store owns it). This file reads the
// configuration, builds the three modules, and turns DOM events into
// controller calls.

const root = document.querySelector("#app");

// The two version-2 forms: the client's own, and the office's Add a case.
// Both are drawn from the controller's draft and share one wiring: the redraw
// hold, the sweep, the quiet edit and the in-place notes (spec §2.4).
const V2_FORMS = "#intake-v2-form, #add-case-v2-form";

// Relative on purpose: the same files are served from a project subfolder on
// GitHub Pages, where an absolute path would leave the site (Ruling R33/R34).
async function readConfig() {
  try {
    const response = await fetch("./public-config.json", { cache: "no-store" });
    if (!response.ok) return null;
    const config = await response.json();
    return config?.configured ? config : null;
  } catch {
    return null;
  }
}

const config = await readConfig();

// The browser's localStorage can throw just by being read (blocked or private
// storage), so it is read here, every time, and null stands in for it.
function readLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// The Traditional map (spec 2026-10-05 §4) loads only when 繁體 is chosen,
// or when the 繁體 draft 13614-C is made. A retry after a failure asks for a
// fresh URL (hant.mjs).
const loadHant = createHantLoader((url) => import(url));
// How long a saved 繁體 waits for its map before startup shows 简体; the
// 繁體 draft waits as long before it fails.
const HANT_START_TIMEOUT_MS = 5000;

if (!config) {
  // Nothing to sign in to. Say what to set, and stop before any SDK loads.
  root.innerHTML = views.setupNeeded();
} else {
  // The only place the Supabase SDK is imported, from the committed bundle.
  const { createClient } = await import("./vendor/supabase.mjs");
  const supabase = createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    { auth: { persistSession: true, autoRefreshToken: true } },
  );
  const auth = createAuth(supabase, {
    cooldownSeconds: config.authResendCooldownSeconds,
  });
  const store = createStore(supabase);
  const controller = createController({
    store,
    auth,
    render,
    sessionStorage: window.sessionStorage,
    windowEvents: window,
    cooldownSeconds: config.authResendCooldownSeconds,
    localStorage: readLocalStorage(),
    languages: [...(navigator.languages ?? [navigator.language])],
  });
  // The screen language now, for text this file writes itself.
  const screenLang = () => viewLang(controller.getState());

  // A toast that has to wait for the first render: a
  // saved 繁體 whose map could not load at startup.
  let pendingToast = null;
  // The switch, other tabs and startup all ask for a language here; only the
  // newest wish is applied once 繁體's map has loaded.
  const languageRequests = createLanguageRequests({ hantReady, loadHant });
  // Nothing is drawn before controller.start(): a language adopted earlier
  // is drawn by start's own first render.
  let controllerStarted = false;
  let cooldownTimer = null;
  // Where the keyboard was when a dialog opened (a `describeFocus` record), so
  // closing it returns to that very control — the row's own Log a call button,
  // not the first one on the page.
  let focusBeforeDialog = null;
  // The dialog the last render drew. Only a dialog that has just opened takes
  // the keyboard; a re-render of one already open (its own busy state, the
  // re-read after an action, another window's change) leaves the caret where
  // the person is typing.
  let shownDialog = null;
  // A control inside the open dialog that its own action disabled while it was
  // in flight: the keyboard goes back to it once the action lands, rather than
  // being left on the dialog container.
  let heldInDialog = null;
  let quiet = false;
  let sampleSeed = 0;
  // The version-2 form's redraw hold (spec §2.4 rules 1 and 4). While a pointer
  // is down on the page, or an IME is composing, a requested render waits:
  // replacing the page between mousedown and mouseup would swallow the click.
  let pointerHeld = false, composing = false, heldRender = null; // heldRender: the `focus` argument of the held call
  let holdTimer = null;
  // In-place DOM updates waiting for the press to end (afterPress).
  let heldUpdates = [];
  // Where the last render drew: screen, case and sub-step. A version-2 render
  // at the same place keeps focus, caret and scroll; one at a new place (a new
  // sub-step, or entering or leaving the form) starts at the top.
  let lastPlace = null;
  // What is half-typed into a staff form, by field id. A re-render can arrive
  // at any moment — a realtime change, a persona click, a connection notice —
  // and rebuilding the page must not empty a box somebody is writing in. What
  // was typed for an action is dropped the moment it is sent. An edit to a
  // saved value is kept as `{ value }` and a tick not yet sent as `{ checked }`
  // (form-values.mjs). Cancel on the best time drops its whole form, and a
  // dialog closing drops its ticks. It all belongs to the one signed in, the
  // persona chosen and the case it was typed on: anyone else, or nobody, or
  // another case opened (by any path), starts with none, so nothing can
  // reappear where it does not belong.
  const formDrafts = new Map();
  // Whose unsent entries formDrafts holds, and the case they were typed on
  // (the last case open; null before any), both checked on every render
  // (restoreFormDrafts), like the draft link's maker.
  let draftsOwner = null;
  let draftsCase = null;
  // The link offered when the browser blocks the draft's tab. It lives here,
  // not in the page: every render draws it again (showDraftLink) until it is
  // opened, a new press replaces it, its URL is revoked a minute on, or its
  // maker is no longer the one signed in.
  const draftOffers = createDraftOffer({
    revoke: (url) => URL.revokeObjectURL(url),
    onExpire: () => showDraftLink(),
  });

  function screenFor(state) {
    if (!state.principal) {
      // The sign-in form is only for a visitor who is known to be signed out.
      if (state.error?.code === "FORBIDDEN") return views.noAccessScreen(state);
      if (state.session !== "none") return views.unreachableScreen(state);
      return client.accessScreen(state);
    }
    if (state.principal.access === "presenter") return views.staffScreen(state);
    return client.clientScreen(state);
  }

  // ---- the staff sidebar's peek (spec 2026-10-04 §8) -----------------------
  // Never saved and never a render: the peek is applied to the page in place,
  // after every render too, so a realtime redraw keeps it.
  const peek = createSidebarPeek({ onChange: () => applyPeek() });
  function applyPeek() {
    const shell = root.querySelector(".app-shell");
    if (!shell) {
      peek.setPinned(true); // no sidebar on this screen: end any peek and its timers
      return;
    }
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

  function render(focus = false) {
    if (quiet) return;
    // On the version-2 form a render waits for the press (or the composition)
    // to end; `flushHeld` draws it then, unless another render drew first.
    if (v2OnPage() && (pointerHeld || composing)) {
      heldRender = heldRender || focus;
      return;
    }
    heldRender = null; // a real render: any held request is now satisfied (spec §2.4 rule 1)
    const state = controller.getState();
    // A case's place is its sub-step (resolved as the page resolves it), so
    // scroll and focus restore compare sub-steps. Add a case is one place: an
    // accordion toggle, a realtime redraw and the first save (which adopts a
    // case) keep focus, caret and scroll.
    const place =
      state.screen === "office-add-case"
        ? state.screen
        : `${state.screen}|${state.selectedCaseId}|${controller.currentSubstep()}`;
    const wasV2 = v2OnPage();
    // A full rebuild replaces the fields, so remember where the keyboard was.
    // `describeFocus` decides what can be read; nothing it does may throw here,
    // because this runs before the page is replaced.
    const active = document.activeElement;
    const keyboard = active?.closest?.("#app") ? describeFocus(active) : null;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    root.innerHTML = views.page(state, screenFor(state));
    applyPeek();
    const lang = viewLang(state);
    document.documentElement.lang = lang;
    document.title = t("frame.title", {}, lang);
    if (pendingToast) {
      notify("warning", t(pendingToast, {}, lang));
      pendingToast = null;
    }
    const v2Place = wasV2 || v2OnPage();
    restoreFormDrafts();
    showDraftLink();
    tickCooldown(state);
    const opened = Boolean(state.dialog) && state.dialog !== shownDialog;
    shownDialog = state.dialog ?? null;
    const held = heldInDialog;
    heldInDialog = null;
    if (opened)
      requestAnimationFrame(() => {
        const modal = root.querySelector(".modal");
        if (!modal) return;
        // Something inside the dialog always takes the keyboard, even when the
        // body is only prose: the close button, or the container itself.
        dialogFocusTarget(
          [...modal.querySelectorAll("button,input,textarea,select,a[href]")],
          modal,
        )?.focus();
      });
    else if (state.dialog) {
      // Already open: put the keyboard back where it was, looked up inside the
      // dialog only — the drawer's "Open the case" has a twin in the queue
      // behind it. If that control is gone or disabled, the dialog itself
      // keeps the keyboard, so it never falls out behind an aria-modal.
      const modal = root.querySelector(".modal");
      const scope = modal ?? root;
      const wanted = keyboard ?? held;
      if (!(wanted && restoreField(wanted, scope))) {
        modal?.focus();
        if (wanted && findField(wanted, scope)?.disabled) heldInDialog = wanted;
      }
    } else if (v2Place && !focus) {
      // Version 2 only (spec §2.4 rule 4). The place is compared here rather
      // than inferred from the caller: a step change also arrives as
      // `show()` → `render(false)`, the same path as a realtime redraw.
      if (place === lastPlace) {
        if (keyboard) restoreField(keyboard);
        window.scrollTo(scrollX, scrollY);
      } else {
        root.querySelector("#main")?.focus({ preventScroll: true });
        window.scrollTo(0, 0);
      }
    } else if (focus) {
      root.querySelector("#main")?.focus();
      window.scrollTo(0, 0);
    } else if (keyboard) restoreField(keyboard);
    // A render that removed the focused sidebar control (and whose restore
    // missed) must not leave the peek held.
    peek.focus(peekZone(document.activeElement) === "sidebar" && keyboardFocus(document.activeElement));
    lastPlace = place;
    // The page under the toast may have changed (a staff screen, Add a case's bar).
    placeToast();
  }

  // ---- the version-2 form's redraw hold (spec §2.4) ----------------------

  function v2OnPage() {
    return Boolean(root.querySelector(V2_FORMS));
  }

  root.addEventListener("pointerdown", () => {
    pointerHeld = true;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(release, 2000); // safety: a pointerup that never arrives
  }, true);
  function release() {
    if (!pointerHeld) return;
    pointerHeld = false;
    clearTimeout(holdTimer);
    setTimeout(flushHeld, 0); // after the click
  }
  window.addEventListener("pointerup", release, true);
  window.addEventListener("pointercancel", release, true);
  window.addEventListener("contextmenu", release, true); // right-click, Ctrl+click
  window.addEventListener("blur", release);
  document.addEventListener("visibilitychange", release);
  // A pointerover on root itself is Chrome moving the hover to root when a
  // render removed the node under a resting mouse; the pointer didn't move,
  // so it is not a leave (it would end the no-re-peek after a collapse). The
  // pointerout that follows it names the new node.
  root.addEventListener("pointerover", (event) => {
    if (event.target !== root) peek.pointer(peekZone(event.target), event.pointerType);
  });
  root.addEventListener("pointerout", (event) => peek.pointer(peekZone(event.relatedTarget), event.pointerType));
  // Only keyboard focus in the sidebar holds a peek (a mouse click focuses
  // buttons in Chrome). Within the sidebar the next focusin decides.
  function keyboardFocus(element) {
    try { return element.matches(":focus-visible"); } catch { return true; }
  }
  root.addEventListener("focusin", (event) =>
    peek.focus(peekZone(event.target) === "sidebar" && keyboardFocus(event.target)));
  root.addEventListener("focusout", (event) => {
    if (peekZone(event.relatedTarget) !== "sidebar") peek.focus(false);
  });
  root.addEventListener("compositionstart", () => { composing = true; });
  root.addEventListener("compositionend", () => { composing = false; setTimeout(flushHeld, 0); });
  function flushHeld() {
    if (pointerHeld || composing) return;
    if (heldRender !== null) render(heldRender); // render() sets heldRender = null
    for (const fn of heldUpdates.splice(0)) fn(); // each looks its node up by id; a gone node is a no-op
  }
  // A DOM update caused by `change` can move the layout (a note gaining text
  // pushes Continue down), so it waits for any press in progress, like a render.
  function afterPress(fn) {
    if (pointerHeld || composing) heldUpdates.push(fn);
    else setTimeout(fn, 0);
  }

  // What was sent is no longer a draft — and only what was sent. A page holds
  // one form per open request and per open task, so emptying the whole map
  // would throw away a half-typed escalation reason for request A because
  // request B was verified. A control that carries no form (a plain button)
  // carried no typed text either, so there is nothing of its own to clear.
  function clearFormDrafts(form) {
    if (!form) return;
    for (const field of form.querySelectorAll("[id]")) formDrafts.delete(field.id);
  }

  // A dialog's form put away unsent takes its ticks with it: opened again, it
  // shows what is saved. (Its typed text is kept, as it always was.)
  function clearFormTicks(form) {
    if (!form) return;
    for (const field of form.querySelectorAll("input[type=checkbox][id], input[type=radio][id]"))
      formDrafts.delete(field.id);
  }

  // One input event's draft for a field, or null: the field is back to what
  // it was drawn with, and keeps none.
  function keepDraft(id, draft) {
    if (draft === null) formDrafts.delete(id);
    else formDrafts.set(id, draft);
  }

  // Staff form fields are not rendered from controller state — they are blank
  // boxes for text that only exists until it is sent, and boxes drawn from
  // what is saved — so what was typed is put back by hand after a rebuild:
  // into a blank box only while it is still empty, and an edit to a saved
  // value, or an unsent tick (or untick), as it was. Somebody else signed in,
  // or nobody, gets none of it: a sign-out from another tab or an expired
  // session counts too, as it does for the draft link. Nor does another case,
  // however it was opened: the open case can go (deleted elsewhere) and a
  // board control's claim select the next without passing `open-case`. A page
  // with no case open changes nothing, so the board's own forms keep theirs
  // and a list and back to the same case keeps the case's.
  function restoreFormDrafts() {
    const userId = signedInUserId();
    if (userId !== draftsOwner) formDrafts.clear();
    draftsOwner = userId;
    const state = controller.getState();
    const caseId = state.savedCase?.id ?? state.selectedCaseId ?? null;
    if (caseId !== null && draftsCase !== null && caseId !== draftsCase) formDrafts.clear();
    if (caseId !== null) draftsCase = caseId;
    for (const [id, value] of formDrafts)
      restoreDraft(root.querySelector(`#${CSS.escape(id)}`), value);
  }

  // Every field the page rebuilds is rendered from state, so the value is back
  // already; this puts the cursor back where it was so typing can continue.
  // The id decides which field that is: a page can hold several fields with the
  // same name — one `reason` box per open document request — and the name alone
  // would put the cursor in the first of them.
  function findField(focus, scope = root) {
    // Most specific first; a button that carries only what it does is found by
    // that, which is what keeps the keyboard on it across a shared update.
    for (const selector of focusSelectors(focus)) {
      const field = scope.querySelector(selector);
      if (field) return field;
    }
    return null;
  }

  // Answers whether the keyboard really landed (a disabled button refuses it).
  function restoreField(focus, scope = root) {
    const field = findField(focus, scope);
    if (!field) return false;
    field.focus();
    const landed = document.activeElement === field;
    if (focus.caret === null || !("setSelectionRange" in field)) return landed;
    try {
      field.setSelectionRange(focus.caret, focus.caret);
    } catch {
      // Some input types refuse a selection range; the focus is what matters.
    }
    return landed;
  }

  // The countdown is the only thing on the page that changes by itself, so it
  // is the only thing that owns a timer, and it stops the moment it reaches 0.
  // It patches its own two elements rather than re-rendering: a rebuild once a
  // second would replace the code field under a visitor who is still typing
  // into it, and `required` would then stop the form with nothing on screen.
  function tickCooldown(state) {
    const running =
      !state.principal &&
      state.authStep === "code" &&
      controller.cooldownRemaining() > 0;
    if (running && !cooldownTimer)
      cooldownTimer = window.setInterval(() => {
        const left = controller.cooldownRemaining();
        if (left <= 0) {
          window.clearInterval(cooldownTimer);
          cooldownTimer = null;
        }
        paintCountdown(left);
      }, 1000);
    else if (!running && cooldownTimer) {
      window.clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }

  function paintCountdown(secondsLeft) {
    const countdown = root.querySelector('[data-role="resend-countdown"]');
    const resend = root.querySelector('[data-action="resend-code"]');
    if (!countdown || !resend) return;
    if (secondsLeft > 0) {
      countdown.textContent = t("signin.countdown", { n: secondsLeft }, screenLang());
      resend.textContent = t("signin.resend_in", { n: secondsLeft }, screenLang());
      resend.disabled = true;
      return;
    }
    countdown.textContent = "";
    resend.textContent = t("signin.resend", {}, screenLang());
    resend.disabled = false;
  }

  // The user id signed in right now, or null for nobody: the one notion of
  // "who" that unsent entries, the draft link and a press's message share.
  function signedInUserId() {
    return controller.getState().principal?.userId ?? null;
  }

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

  // `kind` is "success", "info" or "warning" (design D4); errors never toast
  // (design D1). `by` is the user id signed in when a press started (a press
  // takes it before its first await). Its result message is for that person
  // only: if somebody else is signed in by now, or nobody, it is not shown.
  // Messages that are not the result of a press leave `by` out.
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
    // A toast that replaces another keeps the hold the page still has: no new
    // mouseenter or focusin fires under a pointer or focus that hasn't moved.
    toast.hover(toastHost.matches(":hover"));
    toast.focus(toastHost.contains(document.activeElement));
  }

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

  // A typed character must not rebuild the page under the cursor, so the draft
  // is updated quietly and only the save chip is refreshed in place.
  function refreshSaveChip() {
    const chip = root.querySelector(".application-meta .save-chip");
    if (chip) chip.outerHTML = client.saveStatus(controller.getState());
  }

  // ---- the version-2 forms (spec §2.4, §2.5) ----------------------------
  //
  // Their controls carry `data-control` and `data-q` (the question, "hh" for a
  // household control), and are read with the renderer's own `readField` and
  // `readForm`. `#field-confirmed` has no `data-q`, so it never matches. Each
  // form is spelled out: `${V2_FORMS} [data-control]…` would match the client
  // form element itself through its first part.
  const V2_CONTROLS = "#intake-v2-form [data-control][data-q], #add-case-v2-form [data-control][data-q]";
  // A sub-step or slot id in an element id: "about.you" → "about-you".
  const dashed = (id) => String(id ?? "").replace(/\./g, "-");

  // The renderer's id scope of the form a control sits in: the client's own,
  // or the office's on Add a case.
  const scopeOf = (element) => (element?.closest?.("#add-case-v2-form") ? "office" : "client");

  // What a control answers, as plain values, so an update queued behind a
  // press can find its question again after the page has been replaced.
  function v2Ref(control) {
    const { q, member, sub } = control.dataset;
    const scope = scopeOf(control);
    return member !== undefined && sub !== undefined
      ? { q, member: Number(member), sub, scope }
      : { q, scope };
  }

  // The question a ref points at, its value in `draft`, the id base of its
  // note and count, and its revealed id (`hh[<n>].<sub>` in a household).
  function v2Answer(ref, draft) {
    const top = findQuestion(2, ref.q);
    if (!top) return null;
    const scope = ref.scope ?? "client";
    if (ref.sub === undefined)
      return { question: top, value: draft[ref.q], base: `field-${scope}-${ref.q}`, id: ref.q };
    const question = (top.fields ?? []).find((field) => field.id === ref.sub);
    if (!question) return null;
    const members = Array.isArray(draft[ref.q]) ? draft[ref.q] : [];
    return {
      question,
      value: members[ref.member]?.[ref.sub],
      base: `field-${scope}-${ref.q}-${ref.member}-${ref.sub}`,
      id: `${ref.q}[${ref.member}].${ref.sub}`,
      group: top,
      groupBase: `field-${scope}-${ref.q}`,
    };
  }

  // className and textContent only (spec §2.4 rule 2), and only when they
  // differ, so a live note is not re-announced on every keystroke.
  function paintInPlace(node, baseClass, { text, className }) {
    if (!node) return;
    const wanted = className ? `${baseClass} ${className}` : baseClass;
    if (node.className !== wanted) node.className = wanted;
    if (node.textContent !== text) node.textContent = text;
  }

  // The note of the control's question (and in a household, the group's own
  // note too), from the controller's state now. `showInvalid(note, answer,
  // revealed)` decides whether an invalid value shows its error.
  function paintV2Note(ref, showInvalid) {
    const state = controller.getState();
    const draft = state.draftAnswers ?? {};
    const answer = v2Answer(ref, draft);
    if (!answer) return;
    // Add a case marks what is missing only after a refused Send; the client's
    // form once the sub-step has been left.
    const showMissing =
      ref.scope === "office"
        ? Boolean(state.addCaseShowMissing)
        : (state.visitedSubsteps ?? []).includes(controller.currentSubstep());
    const revealed = new Set(state.revealed ?? []);
    const note = document.getElementById(`${answer.base}-note`);
    if (note)
      paintInPlace(
        note,
        "q-note",
        noteState(answer.question, answer.value, {
          showMissing,
          showInvalid: showInvalid(note, answer, revealed),
          lang: viewLang(state),
        }),
      );
    if (answer.group)
      paintInPlace(
        document.getElementById(`${answer.groupBase}-note`),
        "q-note",
        noteState(answer.group, draft[ref.q], { showMissing, showInvalid: revealed.has(ref.q), lang: viewLang(state) }),
      );
  }

  // The current sub-step's rail mark and its step's, the same functions the
  // render uses. Either span may be absent (the phone bar folds the tree).
  function paintV2Rail() {
    const state = controller.getState();
    const current = controller.currentSubstep();
    const substep = current ? findSubstep(current) : null;
    if (!substep) return;
    const answers = state.draftAnswers ?? {};
    const marks = {
      answers,
      visited: state.visitedSubsteps ?? [],
      revealed: new Set(state.revealed ?? []),
      cards: cardsFor(answers, state.savedCase?.documentCards ?? []),
      lang: viewLang(state),
    };
    const paint = (id, status) =>
      paintInPlace(document.getElementById(id), "rail-status", {
        text: status.text,
        className: `is-${status.key}`,
      });
    paint(`rail-sub-${dashed(current)}-status`, substepStatus(current, marks));
    paint(`rail-step-${substep.step.id}-status`, stepRollup(substep.step.id, marks));
  }

  // Add a case's count of parts, each part's status and Send, from the draft
  // now: className, textContent and Send's disabled only (spec §2.4 rule 2).
  function paintAddCase() {
    if (!root.querySelector("#add-case-v2-form")) return;
    const state = controller.getState();
    const parts = addCaseParts(state.draftAnswers ?? {});
    const count = document.getElementById("add-case-count");
    const text = addCaseCountText(parts);
    if (count && count.textContent !== text) count.textContent = text;
    for (const part of parts) {
      const status = addCasePartStatus(part.needs);
      paintInPlace(document.getElementById(`add-sub-${dashed(part.id)}-status`), "add-sub-status", status);
    }
    const send = document.getElementById("add-case-send");
    if (send)
      send.disabled = addCaseSendOff({
        confirmed: (state.openPanels ?? []).includes("confirmed"),
        busy: state.busy,
        officeSaving: state.officeSaving,
      });
  }

  // A longtext's character count.
  function paintV2Count(ref) {
    const state = controller.getState();
    const answer = v2Answer(ref, state.draftAnswers ?? {});
    if (answer?.question.type !== "longtext") return;
    const lang = viewLang(state);
    const count = document.getElementById(`${answer.base}-count`);
    if (count && count.textContent !== countText(answer.value, lang))
      count.textContent = countText(answer.value, lang);
  }

  // The sub-steps the page lists differ from the ones the draft shows now: a
  // driver can add or remove another sub-step without changing this page's
  // own questions (a death year adds "Your late spouse"). The page is the
  // "before", as in needsRedraw: typing has already put the value in the
  // draft. The client's form lists them in the rail; Add a case lists its
  // question parts, plus its fixed Documents part.
  function listedSubstepsStale(form) {
    const state = controller.getState();
    const answers = state.draftAnswers ?? {};
    const ids = (selector) => [...root.querySelectorAll(selector)].map((element) => element.dataset.substep);
    if (form.id === "add-case-v2-form")
      return (
        ids("#add-case-v2-form .add-sub[data-substep]").filter((id) => id !== "documents").join(" ") !==
        addCaseParts(answers).map((part) => part.id).join(" ")
      );
    const cards = cardsFor(answers, state.savedCase?.documentCards ?? []);
    return ids(".rail-sublink[data-substep]").join(" ") !== visibleSubsteps(answers, cards, state.visitedSubsteps ?? []).join(" ");
  }

  // Every rendered answer into the draft, quietly: the action that follows
  // (a step change, a save, a fill) draws the page. Empty household cards are
  // dropped, as `readForm` drops them.
  function sweepV2Form() {
    const form = root.querySelector(V2_FORMS);
    if (!form) return;
    // A held redraw means the draft has moved on (a realtime change landed
    // during the press) and the boxes still show the old values: sweeping them
    // would write those back over the office's edit. Every keystroke is
    // already in the draft through `input`; the sweep only catches autofill.
    if (heldRender !== null) return;
    quiet = true;
    try {
      controller.editAnswers(readForm(form));
    } finally {
      quiet = false;
    }
  }

  // A version-2 control's `change`. For a text field it fires on the
  // mousedown of the next press, so nothing on screen may move now (spec §2.4
  // rule 1): the state is updated at once, the page after the press.
  function changeV2Field(field) {
    const ref = v2Ref(field);
    // `change` fires each time focus moves between a date's three boxes, so a
    // date's error is revealed only when its step is left (spec §2.5).
    const isDate = field.dataset.datePart !== undefined;
    quiet = true;
    try {
      controller.editAnswers(readField(field));
      if (!isDate) {
        const answer = v2Answer(ref, controller.getState().draftAnswers ?? {});
        if (answer && checkValue(answer.question, sendable(answer.question, answer.value)))
          controller.revealInvalid(answer.id);
      }
    } finally {
      quiet = false;
    }
    if (!isDate)
      // Everything read when it runs, not now: a press may have changed the
      // step or replaced the page in between, and then this writes exactly
      // what that render wrote, or finds its node gone.
      afterPress(() => {
        paintV2Note(ref, (_note, answer, revealed) => revealed.has(answer.id));
        // The rail is the client form's only; Add a case has its count instead.
        if (ref.scope === "office") paintAddCase();
        else paintV2Rail();
        refreshSaveChip();
      });
    // A full redraw only when the visible questions change (rule 3): the ids
    // on the page against the ids the draft makes visible. Queued, so a Tab's
    // new target is the focus the render puts back.
    const choice =
      field.type === "radio" || field.type === "checkbox" || field.tagName === "SELECT";
    let redraw = choice;
    if (!redraw && drivesVisibility(ref.q)) {
      const form = field.closest(V2_FORMS);
      const draft = controller.getState().draftAnswers ?? {};
      const idsIn = (scope) =>
        new Set([...scope.querySelectorAll("[data-q]")].map((element) => element.dataset.q));
      if (form.id === "add-case-v2-form")
        // Each open part against what the draft makes visible in it.
        redraw = [...form.querySelectorAll(".add-sub[data-substep]")].some((part) => {
          const id = part.dataset.substep;
          const body = document.getElementById(`add-sub-${dashed(id)}-body`);
          return id !== "documents" && body && !body.hidden && needsRedraw(idsIn(body), id, draft);
        });
      else redraw = needsRedraw(idsIn(form), controller.currentSubstep(), draft);
      if (!redraw) redraw = listedSubstepsStale(form);
    }
    if (redraw) setTimeout(() => render(), 0);
  }

  // A sub-step change: what is in the boxes first (the move saves it), then
  // the move, then the keyboard to the new page.
  async function moveV2(go, focusId = null) {
    sweepV2Form();
    await go();
    focusV2Arrival(focusId);
  }

  // Where the keyboard lands after a sub-step change: the element `focusId`
  // names (an "Upload now" card on the new page), else the alerts heading on
  // arriving at review.check, else `#main` (the render has already scrolled
  // to the top).
  function focusV2Arrival(focusId = null) {
    const card = focusId ? document.getElementById(focusId) : null;
    if (card && root.contains(card)) return card.focus();
    const alerts =
      controller.currentSubstep() === "review.check" ? root.querySelector("#alerts-title") : null;
    if (alerts) return alerts.focus();
    root.querySelector("#main")?.focus({ preventScroll: true });
  }

  // The panels a generic `toggle-panel` control may open: the phone's "All
  // steps", a documents sub-step's Maybe needed group, and a summary section
  // (`summary-shut:<step id>`, collapsed while present). Rail steps have their
  // own action (`setRailExpanded`), and nothing else is a panel here.
  const V2_PANELS = /^(rail-all|maybe:[a-z]+\.[a-z_]+|summary-shut:[a-z]+)$/;

  // `opener` is passed when the control was described before an await (the
  // Log a call button, captured before its case is loaded); otherwise it is
  // whatever holds the keyboard now.
  function openDialog(name, context = null, opener = null) {
    const active = document.activeElement;
    focusBeforeDialog = opener ?? (active?.closest?.("#app") ? describeFocus(active) : null);
    controller.openDialog(name, context);
  }

  // Back to the very control that opened the dialog — matched on its row
  // (`data-case-id`, `data-item-id`) as well as what it does — or, when that
  // row has gone, to the fallback. A drawer's row can go while it is open
  // (another window resolved the task), so a drawer always has one: the queue.
  function closeDialog(fallbackFocusSelector) {
    const fallback =
      fallbackFocusSelector ??
      (views.DRAWERS.includes(controller.getState().dialog)
        ? "#office-queue-title"
        : null);
    // A dialog's form closes with it; ticks left unsent go too.
    for (const form of root.querySelectorAll(".modal form")) clearFormTicks(form);
    controller.closeDialog();
    const opener = findField(focusBeforeDialog);
    if (opener) opener.focus();
    else if (fallback) root.querySelector(fallback)?.focus();
    focusBeforeDialog = null;
  }

  function fictional(replaceEverything) {
    sampleSeed += 1;
    // What is in the boxes first, so a fill sees every answer as typed.
    sweepV2Form();
    const draft = controller.getState().draftAnswers ?? {};
    // A married sample for a spouse on the return; a widowed client stays
    // widowed, and the late spouse gets no phone (sampleAnswersFor).
    const generated = sampleAnswersFor(draft, { seed: sampleSeed });
    // A regenerate is the new example plus a clear of every other answer
    // already in the draft (the wording choice kept); a fill touches blank
    // answers only.
    controller.editAnswers(fictionalAnswers(draft, generated, { replaceEverything }));
    notify("info", t(replaceEverything ? "toast.fictional_replaced" : "toast.fictional_filled", {}, screenLang()));
  }

  // The office's own "fill fictional details", the same generator the client's
  // form uses. It never submits a form, never creates a case and never sends a
  // message to anybody. Add a case is the one form that wears this button: what
  // is in the boxes first, then its blank answers, through the draft like the
  // client's own.
  function fillAssistedIntake() {
    sampleSeed += 1;
    if (!root.querySelector("#add-case-v2-form")) {
      controller.noteLocalFailure({ code: "VALIDATION", message: "There is no assisted intake form on screen." });
      return;
    }
    sweepV2Form();
    const draft = controller.getState().draftAnswers ?? {};
    // A married sample for a spouse on the return; a widowed client stays
    // widowed, and the late spouse gets no phone (sampleAnswersFor).
    const sample = sampleAnswersFor(draft, { seed: sampleSeed });
    controller.editAnswers(fictionalAnswers(draft, sample));
    notify("info", "Fictional details filled in. Nothing is saved yet.");
  }

  async function reconcile(useMine, by) {
    const state = controller.getState();
    await controller.reconcileAnswers({
      answers: useMine ? state.draftAnswers : (state.savedCase?.answers ?? {}),
      expectedServerRevision: state.savedCase?.revision,
      // Version 2: the office's side also holds the four contact fields,
      // which the server keeps outside `answers`.
      fromServer: !useMine,
    });
    notify("info", t(useMine ? "toast.reconcile_mine" : "toast.reconcile_office", {}, screenLang()), by);
    // On Add a case the choice's panel goes once made, and its button with it:
    // the keyboard goes to Save draft, the next thing to press.
    if (controller.getState().screen === "office-add-case" && !root.contains(document.activeElement))
      root.querySelector('[data-action="save-office-draft"]')?.focus();
  }

  // ---- workflow actions -------------------------------------------------

  // One short sentence per staff action, said after it lands. The screen itself
  // already shows the new state; this is the confirmation that it was this
  // click that changed it.
  const STAFF_NOTICES = Object.freeze({
    VERIFY_INTAKE: "The simulated intake checks are recorded.",
    REMIND: "Reminder recorded. No external message sent.",
    RECORD_CONTACT: "The attempt is recorded. The task is still open.",
    RESOLVE_FOLLOWUP: "The contact task is resolved. Nothing else changed.",
    RECORD_DOCUMENT_RESPONSE:
      "Recorded as staff-recorded, awaiting preparer verification.",
    CLOSE_CASE: "The case is closed and its pending work is cancelled.",
    CLAIM_PREPARATION: "This case is yours to prepare.",
    CLAIM_REVIEW: "This review is yours.",
    REQUEST_DOCUMENT: "The client was asked for this document.",
    VERIFY_DOCUMENT: "The document is verified.",
    ESCALATE_CONTACT: "The office was asked to contact the client.",
    SUBMIT_REVIEW:
      "Preparation is recorded as complete. The case is waiting for a reviewer.",
    RESUBMIT_REVIEW:
      "The corrections are recorded. The case is waiting for a reviewer.",
    REQUEST_CORRECTIONS: "The preparer was asked for corrections.",
    APPROVE_REVIEW: "The review result is recorded.",
    RECORD_REVIEW_CONTACT: "The conversation is recorded.",
  });
  const CLAIMS = Object.freeze(["CLAIM_PREPARATION", "CLAIM_REVIEW"]);
  // Actions whose form holds a checkbox group (contact best time, materials).
  const LIST_FORMS = Object.freeze(["UPDATE_CONTACT", "RECORD_MATERIALS"]);

  async function runCaseAction(target, form = null, by) {
    const type = target.dataset.caseAction;
    // The DOM says a canonical name or it says nothing at all.
    if (!CASE_ACTIONS.includes(type)) return;
    const state = controller.getState();
    if (type === "SAVE_ANSWERS") {
      // The controller owns the draft and the revision the edits started from,
      // so this one is never built from a form's payload.
      // Null: the case it was pressed on is no longer open, so nothing was
      // saved for it. A failure throws, and is shown by the caller.
      if (!(await controller.saveAnswers())) return;
      clearFormDrafts(form);
      notify("success", t("toast.saved", {}, screenLang()), by);
      return;
    }
    if (type === "SUBMIT" && !state.openPanels.includes("confirmed")) {
      notify("warning", t("toast.confirm_first", {}, screenLang()));
      return;
    }
    if (type === "SUBMIT" && state.savedCase) {
      // Anything still in the boxes is saved before the submit, which sends
      // the saved case's revision: otherwise it would be dropped, and the
      // refresh would raise a conflict on a submitted case.
      sweepV2Form();
      // Submit's disabled state is drawn at render, and a press can land on a
      // page drawn before the draft changed, so the controller checks the
      // draft again (guardSubmit). Refused, it has revealed every invalid
      // answer and gone to review.check: the toast says why, and the keyboard
      // goes to the alerts heading.
      if (!(await controller.guardSubmit())) {
        notify("warning", t("toast.needs_change", {}, screenLang()), by);
        focusV2Arrival();
        return;
      }
      if (controller.getState().dirty && !(await controller.saveAnswers())) return;
    }
    if (type === "RESPOND_DOCUMENT" && state.openPanels.includes("upload-failure")) {
      // The simulated failure never reaches the server, so there is nothing to
      // duplicate: the request stays open and the same button retries.
      if (!state.openPanels.includes("upload-failed"))
        controller.togglePanel("upload-failed");
      else render();
      return;
    }
    // A control on the work board names the case it belongs to. Opening it
    // first is what gives the action its case id and its expected revision.
    const boardCaseId = target.dataset.caseId;
    if (boardCaseId && state.savedCase?.id !== boardCaseId)
      await controller.selectCase(boardCaseId, { navigate: false });
    // The payload rules are a pure function of the control and its form.
    // The two forms with checkbox groups read repeated names as lists; every
    // other form keeps its reader.
    const readValues = LIST_FORMS.includes(type)
      ? formValuesWithLists
      : (formElement) => Object.fromEntries(new FormData(formElement));
    const { payload } = payloadFor(type, target.dataset, form ? readValues(form) : {});
    // The receipt is the evidence the action landed. Nothing is announced
    // without it: a refusal throws before this line, and a `null` would mean
    // nothing was sent at all.
    const receipt = await controller.runAction(type, payload);
    // Sent: whatever was typed *for this action* is no longer a draft.
    clearFormDrafts(form);
    // The best-time form puts itself away once the change has landed (the
    // controller's dispatch already re-read the case).
    if (
      type === "UPDATE_CONTACT" &&
      receipt &&
      controller.getState().openPanels.includes("edit-contact")
    ) {
      controller.togglePanel("edit-contact");
    }
    // Closing is confirmed in a dialog, so the dialog closes when it lands.
    if (type === "CLOSE_CASE" && receipt) closeDialog("#case-title");
    if (type === "REQUEST_CORRECTIONS" && receipt) closeDialog("#next-step-title");
    // Resolving the task finishes the drawer's work; recording an attempt does
    // not, and the new attempt shows in it because the action re-read the case.
    if (type === "RESOLVE_FOLLOWUP" && receipt && controller.getState().dialog === "log-call")
      closeDialog("#office-queue-title");
    if (type === "SUBMIT") {
      // The office submits an assisted application from the case workspace and
      // stays there; "progress" is a client screen and a presenter has none.
      if (controller.getState().principal?.access === "presenter") {
        notify("success", "The application is with the office. Record the intake checks next.", by);
        return;
      }
      controller.navigate("progress");
      notify("success", t("toast.sent", {}, screenLang()), by);
      return;
    }
    if (type === "RESPOND_DOCUMENT") {
      if (controller.getState().openPanels.includes("upload-failed"))
        controller.togglePanel("upload-failed");
      notify("success", t("toast.document_sent", {}, screenLang()), by);
      return;
    }
    // A claim opens the case that was just taken on.
    if (
      CLAIMS.includes(type) &&
      controller.getState().principal?.access === "presenter"
    )
      controller.navigate("staff-case");
    if (receipt && STAFF_NOTICES[type]) notify("success", STAFF_NOTICES[type], by);
  }

  // ---- assistance actions -----------------------------------------------

  // Assistance controls carry their own attribute and are validated against
  // their own shared vocabulary — never translated into a case action.
  const ASSISTANCE_NOTICES = Object.freeze({
    CLAIM: "This request is yours. The client's case is unchanged.",
    RESOLVE: "The request is recorded as resolved. The client's case is unchanged.",
  });

  async function runAssistanceAction(target, form = null, by) {
    const type = target.dataset.assistanceAction;
    if (!ASSISTANCE_ACTIONS.includes(type)) return;
    const values = form ? Object.fromEntries(new FormData(form)) : {};
    // A claim carries no note at all; a resolution says what was done, and the
    // database refuses an empty one.
    const note = type === "RESOLVE" ? String(values.note ?? "").trim() : null;
    if (type === "RESOLVE" && !note) {
      notify("warning", "Say what you helped with before resolving this request.");
      return;
    }
    const sent = await controller.runAssistanceAction(
      type,
      target.dataset.itemId,
      note,
    );
    clearFormDrafts(form);
    if (sent && type === "RESOLVE" && controller.getState().dialog === "resolve-help")
      closeDialog("#office-queue-title");
    if (sent) notify("success", ASSISTANCE_NOTICES[type], by);
  }

  // ---- navigation actions -----------------------------------------------

  // The draft 13614-C (spec 2026-10-04 §7), built here in the browser: the
  // PDF never leaves it. The tab opens at once, inside the press, because a
  // tab opened after the build no longer counts as part of it and popup
  // blockers stop it; the PDF is loaded into it when ready. pdf-lib and the
  // form load only now, and the Chinese font only when some answer needs it
  // (the same files whatever the text says).
  function writeTab(tab, text) {
    try {
      const page = tab.document;
      page.title = t("draft.tab_title", {}, screenLang());
      page.documentElement?.setAttribute("lang", screenLang());
      if (!page.body) page.documentElement?.append(page.createElement("body"));
      page.body.textContent = text;
    } catch {
      // A tab we can no longer reach is left as it is.
    }
  }

  async function fetchBytes(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async function fetchCheckedFont(file) {
    const bytes = await fetchBytes(file.url);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (hex !== file.sha256) {
      const error = new Error(t("draft.font_unchecked"));
      error.draftFont = true;
      throw error;
    }
    return bytes;
  }

  // The blocked-tab link, drawn into #draft-ready from draftOffers: after
  // every render (which replaced it; before the render's focus restore, which
  // finds it by its id) and whenever the offer changes. It is drawn only for
  // the user who made it, on the page of the case it was made for; anyone
  // else signed in, or nobody, ends it first, whatever the screen.
  function showDraftLink() {
    const state = controller.getState();
    const userId = signedInUserId();
    draftOffers.follow(userId);
    const ready = root.querySelector("#draft-ready");
    if (!ready) return;
    const offer = draftOffers.current(state.savedCase?.id ?? null, userId);
    if (!offer) {
      ready.replaceChildren();
      return;
    }
    const link = draftLink(document, offer, t("draft.link", {}, screenLang()));
    link.addEventListener("click", () => draftOffers.drop());
    ready.replaceChildren(link);
  }

  async function viewDraft(form, by, kind = "13614c") {
    const files = kind === "14446" ? FORM_14446_FILES : FORM_FILES;
    if (!Object.hasOwn(files, form)) return;
    const tab = window.open("", "_blank");
    if (tab) writeTab(tab, t("draft.preparing", {}, screenLang()));
    // An earlier press's link goes: this press makes a new draft.
    draftOffers.drop();
    showDraftLink();
    try {
      const state = controller.getState();
      const caseId = state.savedCase?.id ?? null;
      const userId = signedInUserId();
      const reference = state.savedCase?.reference ?? "";
      const now = new Date();
      const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
        .map((n) => String(n).padStart(2, "0"))
        .join("-");
      // The 繁體 draft's lines need the map, whatever the screen language;
      // loading it changes nothing on screen. A failure, or a load still
      // hanging after HANT_START_TIMEOUT_MS, is draft.failed.
      // The 14446 has no generated lines of its own, so it never needs the map.
      if (kind !== "14446" && form === "zh-t") await loadHantWithin({ hantReady, loadHant }, HANT_START_TIMEOUT_MS);
      const fields = (kind === "14446" ? draft14446Fields : draftFields)(state.draftAnswers ?? {}, { form, reference, today });
      const PDFLib = await import("./vendor/pdf-lib.mjs");
      const [formBytes, fontFiles] = await Promise.all([
        fetchBytes(files[form]),
        fieldsNeedFont(fields) ? Promise.all(draftFontsFor(form).files.map(fetchCheckedFont)) : [],
      ]);
      const bytes = await buildDraftPdf({
        PDFLib, fontkit: PDFLib.fontkit, formBytes, fontFiles, fields,
        stamp: fields.stamp, fileName: fields.fileName,
      });
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      // Revoked a minute on; a link offered below goes with it.
      draftOffers.keep(url);
      if (tab && !tab.closed) {
        tab.location.href = url;
      } else {
        // The browser blocked even the early tab: offer a link instead, drawn
        // into the page as it is now and again after every redraw.
        draftOffers.offer({ url, fileName: fields.fileName, caseId, userId });
        showDraftLink();
      }
      // A draft that was built and offered: an earlier draft problem is over.
      if (controller.getState().error?.code === "DRAFT") controller.dismissError();
    } catch (error) {
      if (tab && !tab.closed) writeTab(tab, t("draft.failed", {}, screenLang()));
      if (by !== signedInUserId()) return;
      // A draft that couldn't be built is an error: the banner, with Try again.
      controller.noteLocalFailure(
        {
          code: "DRAFT",
          message: error?.draftFont ? "The draft font could not be checked. Try again later." : "The draft could not be made. Try again.",
        },
        () => viewDraft(form, by, kind),
      );
    }
  }

  // ---- leaving Add a case ----------------------------------------------
  //
  // What each exit from Add a case does once it may go. The confirm in the
  // leave dialog runs these directly, past the guard.
  const EXITS = Object.freeze({
    "open-board": () => {
      formDrafts.clear();
      controller.navigate("staff");
    },
    "open-cases": () => {
      formDrafts.clear();
      controller.navigate("office-cases");
    },
    // Pressed again while on the page: a fresh draft, which is what it asks for.
    "open-add-case": async () => {
      formDrafts.clear();
      await controller.openAddCase();
    },
  });

  // On Add a case, an exit that would lose typed answers asks first: a new
  // office draft with any answer, or a saved draft with unsaved edits. True
  // when it asked (the exit then waits for the dialog). Sign out and the
  // persona switch leave without asking.
  function leaveAddCaseFirst(action, target) {
    if (controller.getState().screen !== "office-add-case") return false;
    sweepV2Form();
    const state = controller.getState();
    const loses = state.officeDraft
      ? Object.values(state.draftAnswers ?? {}).some(isAnswered)
      : Boolean(state.savedCase) && Boolean(state.dirty);
    if (!loses) return false;
    openDialog("leave-add-case", { to: action }, describeFocus(target));
    return true;
  }

  async function runNavigation(action, target, by) {
    const state = controller.getState();
    switch (action) {
      case "open-applications":
        controller.navigate("applications");
        break;
      case "open-progress":
        controller.navigate("progress");
        break;
      case "open-case":
        // Another case is another set of forms; nothing half-typed follows it.
        formDrafts.clear();
        // From inside a drawer: the drawer must not stay open over the case.
        if (state.dialog) {
          focusBeforeDialog = null;
          controller.closeDialog();
        }
        await controller.selectCase(target.dataset.caseId);
        break;
      case "open-board":
        if (leaveAddCaseFirst("open-board", target)) break;
        EXITS["open-board"]();
        break;
      case "open-cases":
        if (leaveAddCaseFirst("open-cases", target)) break;
        EXITS["open-cases"]();
        break;
      case "clear-pool-filters":
        controller.clearBoardFilters(POOL_FILTER_KEYS);
        // "Clear filters" goes once nothing is narrowed; the keyboard goes to
        // the first filter rather than falling out to the page.
        if (!root.querySelector('[data-action="clear-pool-filters"]'))
          root.querySelector("#field-poolStage")?.focus();
        break;
      case "open-add-case":
        if (leaveAddCaseFirst("open-add-case", target)) break;
        await EXITS["open-add-case"]();
        break;
      case "confirm-leave-add-case": {
        const exit = EXITS[state.dialogContext?.to] ?? EXITS["open-board"];
        closeDialog();
        await exit();
        break;
      }
      case "continue-add-case":
        formDrafts.clear();
        await controller.openAddCase({ caseId: target.dataset.caseId });
        break;
      case "toggle-add-substep": {
        const id = target.dataset.substep ?? "";
        sweepV2Form();
        controller.toggleAddSubstep(id);
        document.getElementById(`add-sub-${dashed(id)}-toggle`)?.focus();
        break;
      }
      case "save-office-draft": {
        sweepV2Form();
        const { reason } = await controller.saveOfficeDraft();
        // Said only when the save really landed: no reason, a case, and the
        // draft now matches the server ("saved", or "idle" when there was
        // nothing to send). "busy" and "left" saved nothing by this press,
        // and a failure has already thrown with its error on screen.
        const after = controller.getState();
        const landed =
          !reason && Boolean(after.savedCase) && !after.dirty && ["saved", "idle"].includes(after.saveState);
        if (landed) notify("info", "The draft is saved. Nobody was emailed.", by);
        // The button was off while the save ran, which dropped the keyboard;
        // it goes back to it, unless the office has moved on to a field.
        if (!root.contains(document.activeElement))
          root.querySelector('[data-action="save-office-draft"]')?.focus();
        break;
      }
      case "send-office-draft": {
        sweepV2Form();
        const { sent, reason } = await controller.saveOfficeDraft({ send: true });
        if (sent) notify("success", "The application is with the office.", by);
        else if (reason === "answers") {
          notify("warning", "The draft is saved. Some answers still need attention before it can be sent.", by);
          root.querySelector("#add-case-count")?.focus();
        } else if (reason === "unconfirmed") {
          notify("warning", "Confirm that you have checked these answers with the client first.", by);
          root.querySelector("#field-confirmed")?.focus();
        }
        break;
      }
      case "fill-assisted-intake":
        fillAssistedIntake();
        break;
      case "toggle-intake-check":
        controller.togglePanel(`intake-check-${target.dataset.check}`);
        // The page is rebuilt around the checkbox, so give it back the focus.
        root.querySelector(`#field-intake-${target.dataset.check}`)?.focus();
        break;
      case "open-close-case":
        openDialog("close-case");
        break;
      case "open-log-call": {
        // Described before the await: by the time the case has loaded, the
        // page has been rebuilt and the keyboard may be anywhere.
        const opener = describeFocus(target);
        const caseId = target.dataset.caseId;
        controller.dismissError();
        // A queue row carries no follow-up tasks, so the case is read in place.
        await controller.selectCase(caseId, { navigate: false });
        if (controller.getState().savedCase?.id === caseId)
          openDialog("log-call", { caseId }, opener);
        break;
      }
      case "open-resolve-help":
        controller.dismissError();
        openDialog("resolve-help", { itemId: target.dataset.itemId }, describeFocus(target));
        break;
      case "open-request-corrections":
        // Clear any earlier refusal so the dialog only ever shows the error
        // from its own send, not a stale one left over from a previous try.
        controller.dismissError();
        openDialog("request-corrections");
        break;
      // The presenter's own two controls. Both confirm first: one replaces
      // every sample case on the projector, and the other rewrites one of
      // them in front of the room.
      case "open-reset-fixtures":
        openDialog("reset-fixtures");
        break;
      case "open-checkpoint":
        openDialog("load-checkpoint");
        break;
      case "confirm-reset-fixtures":
        await controller.resetFixtures();
        formDrafts.clear();
        closeDialog();
        notify("success", "The sample cases were rebuilt. Nothing else was touched.", by);
        break;
      case "set-board-filter":
        controller.setBoardFilter(target.dataset.filter, target.dataset.value);
        // "Clear search" is the one filter chip that stands in for a field —
        // give the box the keyboard back, the way a search submit does.
        if (target.dataset.filter === "search")
          root.querySelector("#field-board-search")?.focus();
        // An empty state's "Show every task" or "Show all languages" goes with
        // the empty state. If the keyboard fell out with it, it lands on the
        // chip that now shows that choice ("All", "Any language").
        else if (!root.contains(document.activeElement))
          root
            .querySelector(
              `.filter-group [data-action="set-board-filter"][data-filter="${CSS.escape(
                target.dataset.filter ?? "",
              )}"][data-value="${CSS.escape(target.dataset.value ?? "")}"]`,
            )
            ?.focus();
        break;
      case "clear-board-filters":
        controller.clearBoardFilters();
        break;
      case "toggle-sidebar":
        {
          // Pinning needs no peek call: the render's applyPeek → setPinned(true)
          // ends a peek. Collapsing marks the pointer as not to re-peek.
          const wasOpen = controller.getState().sidebarOpen;
          controller.toggleSidebar();
          if (wasOpen) peek.collapsed();
        }
        break;
      case "toggle-edit-contact":
        // Cancel: the best time opens again as saved, its Note included.
        clearFormDrafts(root.querySelector("#contact-form"));
        controller.togglePanel("edit-contact");
        root
          .querySelector('[data-action="toggle-edit-contact"]')
          ?.focus();
        break;
      case "set-case-tab":
        controller.setCaseTab(target.dataset.value);
        root.querySelector(`#case-tab-${CSS.escape(target.dataset.value ?? "")}`)?.focus();
        break;
      case "start-application": {
        // `createCase` answers null when one is already in flight; nothing was
        // created, so nothing is announced (acceptance 11: no false success).
        // Nor to anyone but the person who pressed (`notify`'s `by`): not on
        // the sign-in screen after a sign-out, not to the next user.
        const started = await controller.createCase();
        if (started) notify("success", t("toast.started", {}, screenLang()), by);
        break;
      }
      case "continue-intake":
        controller.navigate("intake");
        break;
      case "back-step":
        // Back saves, as every sub-step change does.
        await moveV2(() => controller.moveSubstep(-1));
        break;
      // A rail link, an alert, a card's why line, "Upload now" (which names
      // the card to land on in `data-focus`).
      case "go-substep":
        await moveV2(
          () => controller.goToSubstep(target.dataset.substep),
          target.dataset.focus ?? null,
        );
        break;
      // The summary's Change: the sub-step opens with "Back to summary".
      case "change-substep":
        await moveV2(() => controller.openForChange(target.dataset.substep));
        break;
      case "back-to-summary":
        await moveV2(() => controller.backToSummary());
        break;
      case "toggle-rail-step": {
        const stepId = target.dataset.stepId ?? "";
        controller.setRailExpanded(stepId, target.getAttribute("aria-expanded") !== "true");
        // The tree was redrawn: the keyboard stays on this step's toggle.
        root
          .querySelector(`.rail-toggle[data-step-id="${CSS.escape(stepId)}"]`)
          ?.focus();
        break;
      }
      case "toggle-panel": {
        const name = target.dataset.panel ?? "";
        if (!V2_PANELS.test(name)) break;
        controller.togglePanel(name);
        root
          .querySelector(`[data-action="toggle-panel"][data-panel="${CSS.escape(name)}"]`)
          ?.focus();
        break;
      }
      case "summary-expand-all":
      case "summary-collapse-all": {
        // Every section at once (design D7): Collapse all names the sections
        // on the page, Expand all none. The pressed button keeps the keyboard.
        const shut =
          action === "summary-collapse-all"
            ? [...root.querySelectorAll('.summary-toggle[data-panel^="summary-shut:"]')].map((toggle) =>
                toggle.dataset.panel.slice("summary-shut:".length),
              )
            : [];
        controller.setSummaryShut(shut);
        document.getElementById(target.id)?.focus();
        break;
      }
      case "mark-card": {
        const slot = target.dataset.slot ?? "";
        sweepV2Form();
        await controller.setDocumentCard(slot, target.dataset.status);
        // The card's status line, never a button: the upload buttons are
        // disabled and the mark buttons change with the status. On the
        // progress page a card marked "Don't have" leaves the list.
        (
          document.getElementById(`doc-${dashed(slot)}-status`) ??
          document.getElementById(`doc-${dashed(slot)}`) ??
          root.querySelector("#main")
        )?.focus();
        break;
      }
      case "move-card": {
        const slot = target.dataset.slot ?? "";
        await controller.setDocumentGroup(target.dataset.slot, target.dataset.group);
        // The same ids `mark-card` focuses: the status line, then the row.
        (
          document.getElementById(`doc-${dashed(slot)}-status`) ??
          document.getElementById(`doc-${dashed(slot)}`) ??
          root.querySelector("#main")
        )?.focus();
        break;
      }
      case "print-summary":
        // Only `.summary-print` prints while the body carries the class
        // (styles.css, part 4b2); "afterprint" takes it off again.
        document.body.classList.add("print-summary");
        window.print();
        break;
      case "view-draft":
        await viewDraft(target.dataset.form ?? "en", by, target.dataset.draft ?? "13614c");
        break;
      case "toggle-senior":
        controller.editAnswers({
          form_version: state.draftAnswers?.form_version === "senior" ? "general" : "senior",
        });
        break;
      case "add-member": {
        // A new array, never the draft's own: a card with no answers yet but
        // its own id, which its document cards are keyed by.
        const members = Array.isArray(state.draftAnswers?.hh) ? state.draftAnswers.hh : [];
        if (members.length < 10)
          controller.editAnswers({ hh: [...members, { member_id: newMemberId() }] });
        break;
      }
      case "remove-member":
        // The controller renumbers the revealed ids of the members after it.
        controller.removeMember(Number(target.dataset.member));
        break;
      case "save-exit": {
        sweepV2Form();
        // Not saved: no "Saved", and the page stays.
        if (controller.getState().dirty && !(await controller.saveAnswers())) break;
        controller.navigate("applications");
        notify("success", t("toast.saved", {}, screenLang()), by);
        break;
      }
      case "fill-fictional":
        fictional(false);
        break;
      case "regenerate-fictional":
        openDialog("regenerate");
        break;
      case "confirm-regenerate":
        fictional(true);
        closeDialog();
        break;
      case "reconcile-mine":
        await reconcile(true, by);
        break;
      case "reconcile-server":
        await reconcile(false, by);
        break;
      case "toggle-upload-failure": {
        controller.togglePanel("upload-failure");
        // The page is rebuilt around the checkbox, so give it back the focus —
        // the box that was clicked, which is the one scoped to its own request.
        const box = fieldId("simulate-upload-failure", target.dataset.requestId ?? "");
        root.querySelector(`#${CSS.escape(box)}`)?.focus();
        break;
      }
      case "select-person":
        // Another persona is another person at the same keyboard; the one
        // already chosen is nobody new, and what was typed stays.
        if (target.dataset.personId !== controller.getState().selectedPersonId) formDrafts.clear();
        controller.selectPerson(target.dataset.personId);
        break;
      case "clear-lookup":
        controller.setLookup("");
        render();
        break;
      case "copy-reference":
        try {
          await navigator.clipboard.writeText(state.savedCase?.reference ?? "");
          notify("success", t("toast.id_copied", {}, screenLang()), by);
        } catch {
          openDialog("print");
          notify("info", t("toast.id_select", {}, screenLang()), by);
        }
        break;
      case "print-reference":
        openDialog("print");
        break;
      case "print-now":
        window.print();
        break;
      case "resend-code":
        await controller.sendCode(state.authEmail);
        break;
      case "back-to-email":
        controller.restartSignIn();
        break;
      case "sign-out":
        await controller.signOut();
        break;
      case "retry-action": {
        // Nothing to retry, or an envelope that no longer matches the draft:
        // the controller answers null and says so on screen. "Sent again."
        // would be a claim that something left this window.
        const sent = await controller.retryLast();
        if (sent && !sent.local) notify("success", t("toast.sent_again", {}, screenLang()), by);
        break;
      }
      case "retry-connection":
        await controller.refresh();
        break;
      case "dismiss-error":
        controller.dismissError();
        break;
      case "open-help":
        openDialog("help");
        break;
      case "close-dialog":
        closeDialog();
        break;
      // The language switch (spec 2026-10-05 §2). What is in the boxes first,
      // since the redraw rebuilds them; 繁體's map on first use. The redraw
      // puts the keyboard back on the pressed button (its data-value).
      case "set-language": {
        const lang = target.dataset.value;
        if (!isLang(lang)) break;
        sweepV2Form();
        // A press made while 繁體 is still loading wins over it.
        const outcome = await languageRequests.want(lang, (wanted) => controller.setLanguage(wanted));
        if (outcome === "failed") notify("warning", t("toast.hant_failed", {}, screenLang()), by);
        break;
      }
      default:
        break;
    }
  }

  root.addEventListener("click", async (event) => {
    // Who pressed, before anything is awaited (see `notify`).
    const by = signedInUserId();
    const shown = controller.getState().error;
    const caseTarget = event.target.closest("[data-case-action]");
    const assistTarget = event.target.closest("[data-assistance-action]");
    // A submit button inside a form is handled by the submit event, where the
    // form's own values are; acting on the click too would send it twice.
    if (caseTarget?.type === "submit" || assistTarget?.type === "submit") return;
    const target =
      caseTarget ?? assistTarget ?? event.target.closest("[data-action]");
    if (!target) return;
    try {
      if (caseTarget) await runCaseAction(caseTarget, null, by);
      else if (assistTarget) await runAssistanceAction(assistTarget, null, by);
      else await runNavigation(target.dataset.action, target, by);
    } catch (error) {
      // The safety net: never a toast (design D1).
      safetyNet(error, by, shown);
    }
  });

  root.addEventListener("input", (event) => {
    const field = event.target;
    if (field.matches?.(V2_CONTROLS)) {
      // The version-2 form (spec §2.4 rule 2): the draft, quietly, then the
      // note, the rail mark and a longtext's count in place, never a redraw.
      // The event's own target, so a ticked "No one" clears the others.
      quiet = true;
      try {
        controller.editAnswers(readField(field));
      } finally {
        quiet = false;
      }
      refreshSaveChip();
      const ref = v2Ref(field);
      // Typing never adds an error, but clears one once the value is valid
      // or empty (the controller drops the id at the same moment).
      paintV2Note(ref, (note) => note.classList.contains("is-invalid"));
      if (ref.scope === "office") paintAddCase();
      else paintV2Rail();
      paintV2Count(ref);
    } else if (field.closest(".staff-form") && field.id) {
      // Held in the wiring layer, not in the controller: this text is not part
      // of any record until the action that carries it is sent.
      if (!isCheckable(field)) keepDraft(field.id, textDraft(field));
      // A tick likewise — except a box drawn from state (a toggle with its own
      // action, the "I have checked" box), which a redraw already draws as it
      // is.
      else if (!field.matches("[data-action], #field-confirmed"))
        for (const [id, draft] of checkDrafts(field)) keepDraft(id, draft);
    } else if (field.name === "lookup") controller.setLookup(field.value);
    else if (field.name === "boardSearch") controller.setBoardSearchDraft(field.value);
    // Kept in state so a re-render re-renders them rather than blanking them.
    // None of these three re-render: the field already shows what was typed.
    else if (field.name === "code") controller.editAuthCode(field.value);
    else if (field.name === "email") controller.editAuthEmail(field.value);
  });

  root.addEventListener("change", (event) => {
    const field = event.target;
    if (field.matches?.("select[data-board-filter]")) {
      controller.setBoardFilter(field.dataset.boardFilter, field.value);
      root.querySelector(`#${field.id}`)?.focus();
      return;
    }
    if (field.id === "field-confirmed") {
      controller.togglePanel("confirmed");
      root.querySelector("#field-confirmed")?.focus();
      return;
    }
    if (field.matches?.(V2_CONTROLS)) changeV2Field(field);
  });

  root.addEventListener("submit", async (event) => {
    event.preventDefault();
    // Who pressed, before anything is awaited (see `notify`).
    const by = signedInUserId();
    const shown = controller.getState().error;
    const form = event.target;
    // Add a case has no submit: its bar's controls are buttons. Enter in a
    // lone text box would otherwise reach `reportValidity`.
    if (form.id === "add-case-v2-form") return;
    if (form.id === "intake-v2-form") {
      // Continue. Before `reportValidity`, which ignores `novalidate`: the
      // form warns but always moves on, and a half-typed `type="email"` would
      // otherwise block it.
      try {
        // Enter in a lone text box submits even with no Continue on the page;
        // after a Change, that is the way back to the summary.
        if (controller.getState().returnToSummary)
          await moveV2(() => controller.backToSummary());
        else await moveV2(() => controller.moveSubstep(1));
      } catch (error) {
        // The safety net: never a toast (design D1).
        safetyNet(error, by, shown);
      }
      return;
    }
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    try {
      // A staff form carries its action on its own submit button and names its
      // fields after the payload keys; everything else is a known form id. The
      // selector is deliberately narrow: the intake form also holds a workflow
      // button, but that one is `type="button"` and belongs to the click path.
      const caseControl = form.querySelector(
        'button[type="submit"][data-case-action]',
      );
      const assistControl = form.querySelector(
        'button[type="submit"][data-assistance-action]',
      );
      if (caseControl) {
        await runCaseAction(caseControl, form, by);
      } else if (assistControl) {
        await runAssistanceAction(assistControl, form, by);
      } else if (form.id === "checkpoint-form") {
        // The choice and its confirmation are the same submit: the dialog says
        // what a checkpoint does, and this button is the person agreeing to it.
        await controller.loadCheckpoint({
          caseId: String(values.get("caseId") ?? ""),
          checkpoint: String(values.get("checkpoint") ?? ""),
        });
        formDrafts.clear();
        closeDialog();
        notify("success", "The sample case was moved to that point in the story.", by);
      } else if (form.id === "email-form") {
        await controller.sendCode(String(values.get("email") ?? ""));
      } else if (form.id === "code-form") {
        await controller.verifyCode(String(values.get("code") ?? ""));
      } else if (form.id === "board-search-form") {
        controller.setBoardFilter("search", String(values.get("boardSearch") ?? "").trim());
        root.querySelector("#field-board-search")?.focus();
      } else if (form.id === "lookup-form") {
        controller.setLookup(String(values.get("lookup") ?? ""));
        render();
      }
    } catch (error) {
      // The safety net: never a toast (design D1).
      safetyNet(error, by, shown);
    }
  });

  // The summary's print mode lasts for one print only.
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("print-summary");
  });

  // The case page's tabs follow the ARIA tab pattern: arrows, Home and End move
  // to a tab and show it, and the keyboard stays on the tab.
  root.addEventListener("keydown", (event) => {
    const tab = event.target.closest?.('[role="tab"][data-action="set-case-tab"]');
    if (!tab) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')];
    const next = nextTabIndex(event.key, tabs.indexOf(tab), tabs.length);
    if (next === null) return;
    event.preventDefault();
    const target = tabs[next];
    controller.setCaseTab(target.dataset.value);
    root.querySelector(`#${CSS.escape(target.id)}`)?.focus();
  });

  // Dialogs keep the keyboard inside them, and Escape always closes.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !controller.getState().dialog) {
      if (event.isComposing) return; // never block an IME's own cancel
      // applyPeek moves the keyboard to the toggle if it was in the sidebar.
      if (peek.escape()) event.preventDefault();
      return;
    }
    if (!controller.getState().dialog) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...document.querySelectorAll(
        '.modal button:not([disabled]),.modal input:not([type="hidden"]),.modal select,.modal textarea,.modal a[href]',
      ),
    ];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // Another tab chose a language: this one follows, without writing it back.
  // It is the newest wish, so it also wins over a 繁體 load still in flight.
  window.addEventListener("storage", async (event) => {
    if (event.key !== STORAGE_KEY) return;
    const storage = readLocalStorage();
    if (!storage || event.storageArea !== storage) return;
    const lang = event.newValue;
    if (!isLang(lang)) return;
    sweepV2Form();
    const outcome = await languageRequests.want(lang, (wanted) => {
      if (wanted !== controller.getState().lang)
        controller.adoptLanguage(wanted, { draw: controllerStarted });
    });
    if (outcome === "failed") notify("warning", t("toast.hant_failed", {}, screenLang()));
  });

  // A saved 繁體 needs its map before the first render. If another tab chose
  // meanwhile, its choice stands. If 繁體 is still the language but its map
  // could not load, the page shows 简体 (the saved choice stays) and says so
  // once it is drawn.
  if (controller.getState().lang === "zh-Hant") {
    // A load still hanging after HANT_START_TIMEOUT_MS fails, and its turn is
    // stale: a map that lands later never switches the page to 繁體.
    const outcome = await languageRequests.want("zh-Hant", () => {}, { timeoutMs: HANT_START_TIMEOUT_MS });
    if (controller.getState().lang === "zh-Hant" && (outcome === "failed" || !hantReady())) {
      controller.adoptLanguage("zh-Hans", { draw: false });
      pendingToast = "toast.hant_failed_start";
    }
  }

  controllerStarted = true;
  await controller.start();
}
