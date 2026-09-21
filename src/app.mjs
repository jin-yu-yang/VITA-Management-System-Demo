import { createAuth } from "./auth.mjs";
import { createStore } from "./supabase-store.mjs";
import { createController } from "./controller.mjs";
import { CASE_ACTIONS } from "./contracts.mjs";
import { makeSampleAnswers, fillBlankAnswers } from "./sample-data.mjs";
import * as views from "./views.mjs";
import * as client from "./client-views.mjs";

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

  const SAMPLE_FILE = "demo-mileage-record-2025.pdf";
  let toastTimer = null;
  let cooldownTimer = null;
  let focusBeforeDialog = null;
  let quiet = false;
  let sampleSeed = 0;

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
    const active = document.activeElement;
    const focused = active?.closest?.("#app") ? active.name : null;
    const caret = focused && "selectionStart" in active ? active.selectionStart : null;
    root.innerHTML = views.page(state, screenFor(state));
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
    } else if (focused) restoreField(focused, caret);
  }

  // Every field the page rebuilds is rendered from state, so the value is back
  // already; this puts the cursor back where it was so typing can continue.
  function restoreField(name, caret) {
    const field = root.querySelector(`[name="${name}"]`);
    if (!field) return;
    field.focus();
    if (caret === null || !("setSelectionRange" in field)) return;
    try {
      field.setSelectionRange(caret, caret);
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

  function payloadFor(type, target) {
    if (type === "SUBMIT") return { confirmed: true };
    if (type === "RESPOND_DOCUMENT")
      return { requestId: target.dataset.requestId, filename: SAMPLE_FILE };
    return {};
  }

  async function runCaseAction(target) {
    const type = target.dataset.caseAction;
    // The DOM says a canonical name or it says nothing at all.
    if (!CASE_ACTIONS.includes(type)) return;
    const state = controller.getState();
    if (type === "SAVE_ANSWERS") {
      await controller.saveAnswers();
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
    await controller.runAction(type, payloadFor(type, target));
    if (type === "SUBMIT") {
      controller.navigate("progress");
      notify("Your application was sent to the office.");
    }
    if (type === "RESPOND_DOCUMENT") {
      if (controller.getState().openPanels.includes("upload-failed"))
        controller.togglePanel("upload-failed");
      notify("Your sample document was sent.");
    }
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
        await controller.selectCase(target.dataset.caseId);
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
    const target = caseTarget ?? event.target.closest("[data-action]");
    if (!target) return;
    try {
      if (caseTarget) await runCaseAction(caseTarget);
      else await runNavigation(target.dataset.action, target);
    } catch (error) {
      // The controller has already recorded the failure and re-rendered; this
      // only makes sure a refused action is announced rather than silent.
      notify(error?.message ?? "Something went wrong.");
    }
  });

  root.addEventListener("input", (event) => {
    const field = event.target;
    if (field.closest("#intake-form") && field.name && field.type !== "checkbox") {
      quiet = true;
      try {
        controller.editAnswers({ [field.name]: field.value });
      } finally {
        quiet = false;
      }
      refreshSaveChip();
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
    if (!field.closest("#intake-form") || !field.name) return;
    if (field.type === "radio" || field.tagName === "SELECT") {
      // These change what the rest of the step says, so the page is rebuilt and
      // the control the person used keeps the focus.
      quiet = true;
      try {
        controller.editAnswers({ [field.name]: field.value });
      } finally {
        quiet = false;
      }
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
      if (form.id === "email-form") {
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
