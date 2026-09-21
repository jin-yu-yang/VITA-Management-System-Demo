import { createAuth } from "./auth.mjs";
import { createStore } from "./supabase-store.mjs";
import { createController } from "./controller.mjs";
import { CASE_ACTIONS } from "./contracts.mjs";
import { payloadFor } from "./case-actions.mjs";
import { makeSampleAnswers, fillBlankAnswers } from "./sample-data.mjs";
import { describeFocus } from "./ui.mjs";
import * as views from "./views.mjs";
import * as client from "./client-views.mjs";
import * as admin from "./admin-views.mjs";

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
  let focusBeforeDialog = null;
  let quiet = false;
  let sampleSeed = 0;
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
    const state = controller.getState();
    // A full rebuild replaces the fields, so remember where the keyboard was.
    // `describeFocus` decides what can be read; nothing it does may throw here,
    // because this runs before the page is replaced.
    const active = document.activeElement;
    const keyboard = active?.closest?.("#app") ? describeFocus(active) : null;
    root.innerHTML = views.page(state, screenFor(state));
    restoreFormDrafts();
    tickCooldown(state);
    if (state.dialog)
      requestAnimationFrame(() =>
        root
          .querySelector(".modal button:not(.close-btn),.modal input,.modal textarea")
          ?.focus(),
      );
    else if (focus) {
      root.querySelector("#main")?.focus();
      window.scrollTo(0, 0);
    } else if (keyboard) restoreField(keyboard);
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
  function restoreField(focus) {
    const field =
      (focus.id ? root.querySelector(`#${CSS.escape(focus.id)}`) : null) ??
      (focus.name ? root.querySelector(`[name="${focus.name}"]`) : null);
    if (!field) return;
    field.focus();
    if (focus.caret === null || !("setSelectionRange" in field)) return;
    try {
      field.setSelectionRange(focus.caret, focus.caret);
    } catch {
      // Some input types refuse a selection range; the focus is what matters.
    }
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

  function openDialog(name) {
    focusBeforeDialog = document.activeElement?.dataset?.action ?? null;
    controller.openDialog(name);
  }

  function closeDialog() {
    controller.closeDialog();
    if (focusBeforeDialog)
      root.querySelector(`[data-action="${focusBeforeDialog}"]`)?.focus();
    focusBeforeDialog = null;
  }

  function fictional(replaceEverything) {
    const state = controller.getState();
    sampleSeed += 1;
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
      formDrafts.clear();
      notify("Your answers are saved.");
      return;
    }
    if (type === "SUBMIT" && !state.openPanels.includes("confirmed")) {
      notify("Confirm that you have checked your answers first.");
      return;
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
    // Sent: whatever was typed for it is no longer a draft.
    formDrafts.clear();
    // Closing is confirmed in a dialog, so the dialog closes when it lands.
    if (type === "CLOSE_CASE" && receipt) closeDialog();
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

  // Assistance is its own workflow with its own RPC, so its controls carry
  // their own attribute and are validated against their own vocabulary — never
  // translated into a case action.
  const ASSISTANCE_ACTIONS = Object.freeze(["CLAIM", "RESOLVE"]);
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
    formDrafts.clear();
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
        await controller.selectCase(target.dataset.caseId);
        break;
      case "open-board":
        formDrafts.clear();
        controller.navigate("staff");
        break;
      case "toggle-assisted-intake":
        controller.togglePanel("assisted-intake");
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
        break;
      case "clear-board-filters":
        controller.clearBoardFilters();
        break;
      case "start-application":
        await controller.createCase();
        notify("A new fictional application is ready.");
        break;
      case "continue-intake":
        controller.navigate("intake");
        break;
      case "back-step":
        controller.setFormStep(Math.max(0, state.formStep - 1));
        break;
      case "save-exit":
        if (state.dirty) await controller.saveAnswers();
        controller.navigate("applications");
        notify("Your answers are saved.");
        break;
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
      case "toggle-upload-failure":
        controller.togglePanel("upload-failure");
        // The page is rebuilt around the checkbox, so give it back the focus.
        root.querySelector("#field-simulate-upload-failure")?.focus();
        break;
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
      case "retry-action":
        await controller.retryLast();
        notify("Sent again.");
        break;
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
    // An answer form first: the office's copy is also a `.staff-form`, and its
    // boxes belong to the draft rather than to the wiring layer's own map.
    if (field.closest(ANSWER_FORMS) && field.name && field.type !== "checkbox") {
      editAnswerField(field);
    } else if (field.closest(".staff-form") && field.id) {
      // Held in the wiring layer, not in the controller: this text is not part
      // of any record until the action that carries it is sent.
      formDrafts.set(field.id, field.value);
    } else if (field.name === "lookup") controller.setLookup(field.value);
    // Kept in state so a re-render re-renders them rather than blanking them.
    // None of these three re-render: the field already shows what was typed.
    else if (field.name === "code") controller.editAuthCode(field.value);
    else if (field.name === "email") controller.editAuthEmail(field.value);
  });

  root.addEventListener("change", (event) => {
    const field = event.target;
    if (field.id === "field-confirmed") {
      controller.togglePanel("confirmed");
      root.querySelector("#field-confirmed")?.focus();
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
        ".modal button:not([disabled]),.modal input,.modal textarea,.modal a[href]",
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
