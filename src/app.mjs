import { createAuth } from "./auth.mjs";
import { createStore } from "./supabase-store.mjs";
import { createController } from "./controller.mjs";
import { CASE_ACTIONS, ASSISTANCE_ACTIONS } from "./contracts.mjs";
import { payloadFor } from "./case-actions.mjs";
import { makeSampleAnswers, fillBlankAnswers } from "./sample-data.mjs";
import { checkValue, findQuestion, findSubstep, missingToSubmit } from "./intake-catalogue.mjs";
import {
  countText,
  drivesVisibility,
  invalidAnswers,
  needsRedraw,
  newMemberId,
  noteState,
  readField,
  readForm,
  sendable,
  stepRollup,
  substepStatus,
} from "./intake-form.mjs";
import { cardsFor } from "./document-cards.mjs";
import {
  describeFocus,
  focusSelectors,
  dialogFocusTarget,
  fieldId,
  nextTabIndex,
} from "./ui.mjs";
import * as views from "./views.mjs";
import * as client from "./client-views.mjs";
import * as admin from "./admin-views.mjs";
import { POOL_FILTER_KEYS } from "./pool-views.mjs";

// Bootstrap and DOM wiring, and nothing else. No state lives here (the
// controller owns it), no HTML is written here (the view modules own it), and
// no database call is made here (the store owns it). This file reads the
// configuration, builds the three modules, and turns DOM events into
// controller calls.

const root = document.querySelector("#app");

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
  });

  let toastTimer = null;
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
  // Where the last render drew: screen, case and sub-step (version 1: form
  // step). A version-2 render at the same place keeps focus, caret and scroll;
  // one at a new place (a new sub-step, or entering or leaving the form)
  // starts at the top.
  let lastPlace = null;
  // What is half-typed into a staff form, by field id. A re-render can arrive
  // at any moment — a realtime change, a persona click, a connection notice —
  // and rebuilding the page must not empty a box somebody is writing in. It is
  // dropped the moment the text is sent or the person moves to another case, so
  // nothing can reappear where it does not belong.
  const formDrafts = new Map();

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
    // A version-2 case's place is its sub-step (resolved as the page resolves
    // it), so scroll and focus restore compare sub-steps; version 1 keeps
    // its step index.
    const place = `${state.screen}|${state.selectedCaseId}|${controller.currentSubstep() ?? state.formStep}`;
    const wasV2 = v2OnPage();
    // A full rebuild replaces the fields, so remember where the keyboard was.
    // `describeFocus` decides what can be read; nothing it does may throw here,
    // because this runs before the page is replaced.
    const active = document.activeElement;
    const keyboard = active?.closest?.("#app") ? describeFocus(active) : null;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    root.innerHTML = views.page(state, screenFor(state));
    const v2Place = wasV2 || v2OnPage();
    restoreFormDrafts();
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
    lastPlace = place;
  }

  // ---- the version-2 form's redraw hold (spec §2.4) ----------------------

  function v2OnPage() {
    return Boolean(root.querySelector("#intake-v2-form"));
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

  // Staff form fields are not rendered from controller state — they are blank
  // boxes for text that only exists until it is sent — so what was typed is put
  // back by hand after a rebuild, and only into a field that is still empty.
  function restoreFormDrafts() {
    for (const [id, value] of formDrafts) {
      const field = root.querySelector(`#${CSS.escape(id)}`);
      if (field && !field.value) field.value = value;
    }
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
      countdown.textContent = `You can request another code in ${secondsLeft} seconds.`;
      resend.textContent = `Resend code in ${secondsLeft}s`;
      resend.disabled = true;
      return;
    }
    countdown.textContent = "";
    resend.textContent = "Resend code";
    resend.disabled = false;
  }

  function notify(text) {
    window.clearTimeout(toastTimer);
    const toast = root.querySelector("#toast");
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("visible");
    toastTimer = window.setTimeout(
      () => toast.classList.remove("visible"),
      3500,
    );
  }

  // A typed character must not rebuild the page under the cursor, so the draft
  // is updated quietly and only the save chip is refreshed in place.
  function refreshSaveChip() {
    const chip = root.querySelector(".application-meta .save-chip");
    if (chip) chip.outerHTML = client.saveStatus(controller.getState());
  }

  // The office's copy of the same rule. Its screen has no save chip; what it has
  // is a notice that says the edits are not saved and a send button that must
  // not act on them, so those two are patched instead. Both are recomputed from
  // state on the next real render, and an unsaved edit can only ever *add* the
  // lock, so patching it here can never release one the renderer applied.
  function refreshOfficeDraft() {
    if (!controller.getState().dirty) return;
    const unsaved = root.querySelector('[data-role="assisted-unsaved"]');
    if (unsaved) unsaved.hidden = false;
    const send = root.querySelector('[data-role="assisted-submit"]');
    if (send) send.disabled = true;
  }

  // Which form on screen is an intake-answer form: the client's own, and the
  // office's copy of it. Both are rendered from `state.draftAnswers`, so both
  // must write back to it — a box that renders from state and does not update
  // it silently reverts what was typed on the next render.
  const ANSWER_FORMS = `#intake-form, #${admin.ASSISTED_ANSWERS_FORM_ID}`;

  // One quiet edit, used by both: the field already shows the character, and
  // rebuilding the page under the cursor is the defect this avoids.
  function editAnswerField(field) {
    quiet = true;
    try {
      controller.editAnswers({ [field.name]: field.value });
    } finally {
      quiet = false;
    }
    refreshSaveChip();
    refreshOfficeDraft();
  }

  // ---- the client's version-2 form (spec §2.4, §2.5) --------------------
  //
  // Its controls carry `data-control` and `data-q` (the question, "hh" for a
  // household control), and are read with the renderer's own `readField` and
  // `readForm`. `#field-confirmed` has no `data-q`, so it never matches.
  const V2_CONTROLS = "#intake-v2-form [data-control][data-q]";
  const isV2Case = (state) => Number(state.savedCase?.intakeVersion) === 2;
  // A sub-step or slot id in an element id: "about.you" → "about-you".
  const dashed = (id) => String(id ?? "").replace(/\./g, "-");

  // What a control answers, as plain values, so an update queued behind a
  // press can find its question again after the page has been replaced.
  function v2Ref(control) {
    const { q, member, sub } = control.dataset;
    return member !== undefined && sub !== undefined
      ? { q, member: Number(member), sub }
      : { q };
  }

  // The question a ref points at, its value in `draft`, the id base of its
  // note and count, and its revealed id (`hh[<n>].<sub>` in a household).
  function v2Answer(ref, draft) {
    const top = findQuestion(2, ref.q);
    if (!top) return null;
    if (ref.sub === undefined)
      return { question: top, value: draft[ref.q], base: `field-client-${ref.q}`, id: ref.q };
    const question = (top.fields ?? []).find((field) => field.id === ref.sub);
    if (!question) return null;
    const members = Array.isArray(draft[ref.q]) ? draft[ref.q] : [];
    return {
      question,
      value: members[ref.member]?.[ref.sub],
      base: `field-client-${ref.q}-${ref.member}-${ref.sub}`,
      id: `${ref.q}[${ref.member}].${ref.sub}`,
      group: top,
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
    const showMissing = (state.visitedSubsteps ?? []).includes(controller.currentSubstep());
    const revealed = new Set(state.revealed ?? []);
    const note = document.getElementById(`${answer.base}-note`);
    if (note)
      paintInPlace(
        note,
        "q-note",
        noteState(answer.question, answer.value, {
          showMissing,
          showInvalid: showInvalid(note, answer, revealed),
        }),
      );
    if (answer.group)
      paintInPlace(
        document.getElementById(`field-client-${ref.q}-note`),
        "q-note",
        noteState(answer.group, draft[ref.q], { showMissing, showInvalid: revealed.has(ref.q) }),
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
    };
    const paint = (id, status) =>
      paintInPlace(document.getElementById(id), "rail-status", {
        text: status.text,
        className: `is-${status.key}`,
      });
    paint(`rail-sub-${dashed(current)}-status`, substepStatus(current, marks));
    paint(`rail-step-${substep.step.id}-status`, stepRollup(substep.step.id, marks));
  }

  // A longtext's character count.
  function paintV2Count(ref) {
    const answer = v2Answer(ref, controller.getState().draftAnswers ?? {});
    if (answer?.question.type !== "longtext") return;
    const count = document.getElementById(`${answer.base}-count`);
    if (count && count.textContent !== countText(answer.value))
      count.textContent = countText(answer.value);
  }

  // Every rendered answer into the draft, quietly: the action that follows
  // (a step change, a save, a fill) draws the page. Empty household cards are
  // dropped, as `readForm` drops them.
  function sweepV2Form() {
    const form = root.querySelector("#intake-v2-form");
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
        paintV2Rail();
        refreshSaveChip();
      });
    // A full redraw only when the visible questions change (rule 3): the ids
    // on the page against the ids the draft makes visible. Queued, so a Tab's
    // new target is the focus the render puts back.
    const choice =
      field.type === "radio" || field.type === "checkbox" || field.tagName === "SELECT";
    let redraw = choice;
    if (!redraw && drivesVisibility(ref.q)) {
      const form = field.closest("#intake-v2-form");
      const renderedIds = new Set(
        [...form.querySelectorAll("[data-q]")].map((element) => element.dataset.q),
      );
      redraw = needsRedraw(
        renderedIds,
        controller.currentSubstep(),
        controller.getState().draftAnswers ?? {},
      );
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
  // steps" and a documents sub-step's Maybe needed group. Rail steps have
  // their own action (`setRailExpanded`), and nothing else is a panel here.
  const V2_PANELS = /^(rail-all|maybe:[a-z]+\.[a-z_]+)$/;

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
    controller.closeDialog();
    const opener = findField(focusBeforeDialog);
    if (opener) opener.focus();
    else if (fallback) root.querySelector(fallback)?.focus();
    focusBeforeDialog = null;
  }

  function fictional(replaceEverything) {
    const state = controller.getState();
    sampleSeed += 1;
    if (isV2Case(state)) {
      // What is in the boxes first, so a fill sees every answer as typed.
      sweepV2Form();
      const draft = controller.getState().draftAnswers ?? {};
      const generated = makeSampleAnswers({
        version: 2,
        seed: sampleSeed,
        married: draft.marital_status === "married",
      });
      // A regenerate is the new example plus a clear of every other answer
      // already in the draft (the wording choice kept); a fill touches blank
      // answers only.
      const cleared = Object.fromEntries(
        Object.keys(draft)
          // The senior switch is the person's choice of wording, not an answer.
          .filter(
            (key) =>
              key !== "form_version" &&
              // The email is the person's own, as version 1 keeps the verified one.
              key !== "email" &&
              findQuestion(2, key) &&
              !(key in generated),
          )
          .map((key) => [key, null]),
      );
      controller.editAnswers(
        replaceEverything
          ? { ...cleared, ...generated }
          : fillBlankAnswers(draft, generated, 2),
      );
      notify(
        replaceEverything
          ? "A different fictional example replaced the answers. Nothing is saved yet."
          : "Fictional details filled in. Nothing is saved yet.",
      );
      return;
    }
    const generated = makeSampleAnswers({
      seed: sampleSeed,
      scenario: "ordinary",
    });
    // Blank fields only, unless the person deliberately asked for a whole new
    // example. Neither touches the verified email, the reference or the stage.
    controller.editAnswers(
      replaceEverything
        ? generated
        : fillBlankAnswers(state.draftAnswers, generated),
    );
    notify(
      replaceEverything
        ? "A different fictional example replaced the answers. Nothing is saved yet."
        : "Fictional details filled in. Nothing is saved yet.",
    );
  }

  // The office's own "fill fictional details", the same generator the client's
  // form uses. It never submits a form, never creates a case and never sends a
  // message to anybody.
  //
  // Two forms wear this button, and they hold their text in two different
  // places. On a case there is a draft, so the fill goes through the controller
  // like the client's own helper does and the render puts it on screen; on the
  // board there is no case yet, so it fills the boxes and the wiring layer's
  // draft map. Writing to the boxes in the first case would fill them behind
  // the draft's back and the next render would throw the answers away.
  function fillAssistedIntake() {
    sampleSeed += 1;
    const generated = makeSampleAnswers({
      seed: sampleSeed,
      scenario: "ordinary",
    });
    if (root.querySelector(`#${admin.ASSISTED_ANSWERS_FORM_ID}`)) {
      controller.editAnswers(
        fillBlankAnswers(controller.getState().draftAnswers, generated),
      );
      notify("Fictional details filled in. Nothing is saved yet.");
      return;
    }
    let boxes = 0;
    let filled = 0;
    for (const [name, value] of Object.entries(generated)) {
      const field = root.querySelector(`#field-assisted-${name}`);
      if (!field) continue;
      boxes += 1;
      // Blank boxes only, exactly like the client's own helper: what a
      // volunteer typed for a real person in front of them is never replaced.
      if (field.value) continue;
      field.value = value ?? "";
      formDrafts.set(field.id, field.value);
      filled += 1;
    }
    notify(
      !boxes
        ? "There is no assisted intake form on screen."
        : filled
          ? "Fictional details filled in. Nothing is created or sent yet."
          : "Every box already has an answer. Nothing was replaced.",
    );
  }

  async function reconcile(useMine) {
    const state = controller.getState();
    await controller.reconcileAnswers({
      answers: useMine ? state.draftAnswers : (state.savedCase?.answers ?? {}),
      expectedServerRevision: state.savedCase?.revision,
      // Version 2: the office's side also holds the four contact fields,
      // which the server keeps outside `answers`.
      fromServer: !useMine,
    });
    notify(
      useMine
        ? "Your answers are kept. Save when you are ready."
        : "The office’s answers are loaded. Save when you are ready.",
    );
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

  async function runCaseAction(target, form = null) {
    const type = target.dataset.caseAction;
    // The DOM says a canonical name or it says nothing at all.
    if (!CASE_ACTIONS.includes(type)) return;
    const state = controller.getState();
    if (type === "SAVE_ANSWERS") {
      // The controller owns the draft and the revision the edits started from,
      // so this one is never built from a form's payload. An answer form's
      // boxes are already in the draft — every keystroke puts them there — and
      // this last sweep is for a value that reached the box without an input
      // event at all, such as a browser autofill. `editAnswers` whitelists it
      // into the same draft, and the save is still the controller's.
      if (form?.matches?.(ANSWER_FORMS))
        controller.editAnswers(Object.fromEntries(new FormData(form)));
      await controller.saveAnswers();
      clearFormDrafts(form);
      notify("Your answers are saved.");
      return;
    }
    if (type === "SUBMIT" && !state.openPanels.includes("confirmed")) {
      notify("Confirm that you have checked your answers first.");
      return;
    }
    if (type === "SUBMIT" && isV2Case(state)) {
      // Anything still in the boxes is saved before the submit, which sends
      // the saved case's revision: otherwise it would be dropped, and the
      // refresh would raise a conflict on a submitted case.
      sweepV2Form();
      // Submit's disabled state is drawn at render, and typing never
      // redraws, so the gate is checked again from the draft (spec §2.5:
      // nothing invalid is ever submitted). Failing it reveals every invalid
      // answer and goes to review.check, whose alerts list them.
      const draft = controller.getState().draftAnswers ?? {};
      const invalid = invalidAnswers(null, draft);
      if (
        invalid.length ||
        missingToSubmit(2, draft).length ||
        !controller.getState().openPanels.includes("confirmed")
      ) {
        quiet = true;
        try {
          for (const id of invalid) controller.revealInvalid(id);
        } finally {
          quiet = false;
        }
        // Submit stays off: the alerts list says what to fix, and the
        // keyboard goes to its heading.
        await controller.goToSubstep("review.check");
        notify("Some answers still need a change before you can send.");
        focusV2Arrival();
        return;
      }
      if (controller.getState().dirty) await controller.saveAnswers();
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
    const { payload } = payloadFor(
      type,
      target.dataset,
      form ? Object.fromEntries(new FormData(form)) : {},
    );
    // The receipt is the evidence the action landed. Nothing is announced
    // without it: a refusal throws before this line, and a `null` would mean
    // nothing was sent at all.
    const receipt = await controller.runAction(type, payload);
    // Sent: whatever was typed *for this action* is no longer a draft.
    clearFormDrafts(form);
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
        notify("The application is with the office. Record the intake checks next.");
        return;
      }
      controller.navigate("progress");
      notify("Your application was sent to the office.");
      return;
    }
    if (type === "RESPOND_DOCUMENT") {
      if (controller.getState().openPanels.includes("upload-failed"))
        controller.togglePanel("upload-failed");
      notify("Your sample document was sent.");
      return;
    }
    // A claim opens the case that was just taken on.
    if (
      CLAIMS.includes(type) &&
      controller.getState().principal?.access === "presenter"
    )
      controller.navigate("staff-case");
    if (receipt && STAFF_NOTICES[type]) notify(STAFF_NOTICES[type]);
  }

  // ---- assistance actions -----------------------------------------------

  // Assistance controls carry their own attribute and are validated against
  // their own shared vocabulary — never translated into a case action.
  const ASSISTANCE_NOTICES = Object.freeze({
    CLAIM: "This request is yours. The client's case is unchanged.",
    RESOLVE: "The request is recorded as resolved. The client's case is unchanged.",
  });

  async function runAssistanceAction(target, form = null) {
    const type = target.dataset.assistanceAction;
    if (!ASSISTANCE_ACTIONS.includes(type)) return;
    const values = form ? Object.fromEntries(new FormData(form)) : {};
    // A claim carries no note at all; a resolution says what was done, and the
    // database refuses an empty one.
    const note = type === "RESOLVE" ? String(values.note ?? "").trim() : null;
    if (type === "RESOLVE" && !note) {
      notify("Say what you helped with before resolving this request.");
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
    if (sent) notify(ASSISTANCE_NOTICES[type]);
  }

  // ---- navigation actions -----------------------------------------------

  async function runNavigation(action, target) {
    const state = controller.getState();
    if (action.startsWith("edit-")) {
      controller.setFormStep(Number(action.slice(5)));
      controller.navigate("intake");
      return;
    }
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
        formDrafts.clear();
        controller.navigate("staff");
        break;
      case "open-cases":
        formDrafts.clear();
        controller.navigate("office-cases");
        break;
      case "clear-pool-filters":
        controller.clearBoardFilters(POOL_FILTER_KEYS);
        // "Clear filters" goes once nothing is narrowed; the keyboard goes to
        // the first filter rather than falling out to the page.
        if (!root.querySelector('[data-action="clear-pool-filters"]'))
          root.querySelector("#field-poolStage")?.focus();
        break;
      case "open-add-case":
        formDrafts.clear();
        controller.navigate("office-add-case");
        break;
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
        notify("The sample cases were rebuilt. Nothing else was touched.");
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
        controller.toggleSidebar();
        break;
      case "set-case-tab":
        controller.setCaseTab(target.dataset.value);
        root.querySelector(`#case-tab-${CSS.escape(target.dataset.value ?? "")}`)?.focus();
        break;
      case "start-application": {
        // `createCase` answers null when one is already in flight; nothing was
        // created, so nothing is announced (acceptance 11: no false success).
        const started = await controller.createCase();
        if (started) notify("A new fictional application is ready.");
        break;
      }
      case "continue-intake":
        controller.navigate("intake");
        break;
      case "back-step":
        // Version 2 saves on every sub-step change; version 1's Back never did.
        if (isV2Case(state)) await moveV2(() => controller.moveSubstep(-1));
        else controller.setFormStep(Math.max(0, state.formStep - 1));
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
      case "print-summary":
        // Only `.summary-print` prints while the body carries the class
        // (styles.css, part 4b2); "afterprint" takes it off again.
        document.body.classList.add("print-summary");
        window.print();
        break;
      case "view-draft":
        notify("The draft is not available yet.");
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
        let dirty = state.dirty;
        if (isV2Case(state)) {
          sweepV2Form();
          dirty = controller.getState().dirty;
        }
        if (dirty) await controller.saveAnswers();
        controller.navigate("applications");
        notify("Your answers are saved.");
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
        await reconcile(true);
        break;
      case "reconcile-server":
        await reconcile(false);
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
        controller.selectPerson(target.dataset.personId);
        break;
      case "clear-lookup":
        controller.setLookup("");
        render();
        break;
      case "copy-reference":
        try {
          await navigator.clipboard.writeText(state.savedCase?.reference ?? "");
          notify("Application ID copied.");
        } catch {
          openDialog("print");
          notify("Select the ID on the card to copy it.");
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
        if (sent) notify("Sent again.");
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
      default:
        break;
    }
  }

  root.addEventListener("click", async (event) => {
    const caseTarget = event.target.closest("[data-case-action]");
    const assistTarget = event.target.closest("[data-assistance-action]");
    // A submit button inside a form is handled by the submit event, where the
    // form's own values are; acting on the click too would send it twice.
    if (caseTarget?.type === "submit" || assistTarget?.type === "submit") return;
    const target =
      caseTarget ?? assistTarget ?? event.target.closest("[data-action]");
    if (!target) return;
    try {
      if (caseTarget) await runCaseAction(caseTarget);
      else if (assistTarget) await runAssistanceAction(assistTarget);
      else await runNavigation(target.dataset.action, target);
    } catch (error) {
      // The controller has already recorded the failure and re-rendered; this
      // only makes sure a refused action is announced rather than silent.
      notify(error?.message ?? "Something went wrong.");
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
      paintV2Rail();
      paintV2Count(ref);
    } else if (field.closest(ANSWER_FORMS) && field.name && field.type !== "checkbox") {
      // An answer form first: the office's copy is also a `.staff-form`, and its
      // boxes belong to the draft rather than to the wiring layer's own map.
      editAnswerField(field);
    } else if (field.closest(".staff-form") && field.id) {
      // Held in the wiring layer, not in the controller: this text is not part
      // of any record until the action that carries it is sent.
      formDrafts.set(field.id, field.value);
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
    if (field.matches?.(V2_CONTROLS)) {
      changeV2Field(field);
      return;
    }
    if (!field.closest(ANSWER_FORMS) || !field.name) return;
    if (field.type === "radio" || field.tagName === "SELECT") {
      // These change what the rest of the step says, so the page is rebuilt and
      // the control the person used keeps the focus.
      editAnswerField(field);
      render();
      const again = [...root.querySelectorAll(`[name="${field.name}"]`)].find(
        (element) => element.value === field.value || element.tagName === "SELECT",
      );
      again?.focus();
    }
  });

  root.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
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
        notify(error?.message ?? "Something went wrong.");
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
        await runCaseAction(caseControl, form);
      } else if (assistControl) {
        await runAssistanceAction(assistControl, form);
      } else if (form.id === "assisted-intake-form") {
        // Creating a case is not a case action — there is no case yet — so it
        // is the form's own submit, exactly like the client's "Start a new
        // application" is its own control.
        await controller.createAssistedCase({
          answers: Object.fromEntries(values),
        });
        // Opening the new case empties the board's own panels, so the form is
        // already put away by the time this returns.
        formDrafts.clear();
        notify("An assisted application is ready. Nobody was emailed.");
      } else if (form.id === "checkpoint-form") {
        // The choice and its confirmation are the same submit: the dialog says
        // what a checkpoint does, and this button is the person agreeing to it.
        await controller.loadCheckpoint({
          caseId: String(values.get("caseId") ?? ""),
          checkpoint: String(values.get("checkpoint") ?? ""),
        });
        formDrafts.clear();
        closeDialog();
        notify("The sample case was moved to that point in the story.");
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
      } else if (form.id === "intake-form") {
        const state = controller.getState();
        if (state.dirty) await controller.saveAnswers();
        controller.setFormStep(Math.min(3, state.formStep + 1));
      }
    } catch (error) {
      notify(error?.message ?? "Something went wrong.");
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

  await controller.start();
}
