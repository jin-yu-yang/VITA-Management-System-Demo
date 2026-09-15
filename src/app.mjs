import { newCase, sampleAnswers, updateCase, restoreCase } from "./domain.mjs";
import { esc, icon, button } from "./ui.mjs";
import * as views from "./views.mjs";
const KEY = "pcdc-vita-demo-v1",
  UIKEY = "pcdc-vita-view-v1",
  BACKUP = "pcdc-vita-main-backup";
const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
let c = restoreCase(read(KEY));
const defaults = {
  route: "home",
  step: 0,
  method: "phone",
  contact: "",
  applicationId: "",
  accessMode: "start",
  codeSent: false,
  code: "",
  destination: "",
  modal: null,
  error: "",
  tab: "overview",
  confirmed: false,
  sampleFile: false,
  failUpload: false,
  exception: false,
  storageError: false,
};
let savedUI = {};
try {
  savedUI = JSON.parse(read(UIKEY)) || {};
} catch {}
let u = {
  ...defaults,
  ...savedUI,
  modal: null,
  error: "",
  code: "",
  codeSent: false,
};
if (
  !["home", "access", "id", "intake", "progress", "volunteer"].includes(u.route)
)
  u.route = "home";
if (["id", "intake", "progress"].includes(u.route) && !c.id) u.route = "home";
if (u.route === "progress" && c.status === "draft") u.route = "intake";
let toastTimer, focusBeforeModal;
const root = document.querySelector("#app");
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
    localStorage.setItem(
      UIKEY,
      JSON.stringify({
        route: u.route,
        step: u.step,
        tab: u.tab,
        accessMode: u.accessMode,
        exception: u.exception,
      }),
    );
    u.storageError = false;
  } catch {
    u.storageError = true;
  }
}
function dispatch(event) {
  c = updateCase(c, event);
  persist();
}
function render(focus = false) {
  const page =
    u.route === "home"
      ? views.home()
      : u.route === "access"
        ? views.access(c, u)
        : u.route === "id"
          ? views.idCard(c)
          : u.route === "intake"
            ? views.intake(c, u)
            : u.route === "progress"
              ? views.progress(c)
              : views.volunteer(c, u);
  root.innerHTML = `${views.header(u)}${u.exception ? `<div class="exception-banner">${icon("help")} Exception sample · Your main walkthrough is preserved. ${button("Return to main walkthrough", "restore-main", "inline")}</div>` : ""}${u.storageError ? '<div class="storage-banner" role="alert">Browser storage is unavailable. Your progress is kept only until this page closes.</div>' : ""}${page}<footer class="site-footer"><span>PCDC VITA · Community comes first.</span><span>Course prototype · No real taxpayer data</span></footer>${views.toolbar(c, u)}${views.modal(c, u)}<div class="toast" id="toast" role="status" aria-live="polite"></div>`;
  if (u.modal) {
    requestAnimationFrame(() =>
      root.querySelector(".modal input,.modal button,.modal textarea")?.focus(),
    );
  } else if (focus) {
    root.querySelector("#main")?.focus();
    window.scrollTo(0, 0);
  }
}
function go(route) {
  u.route = route;
  u.error = "";
  u.modal = null;
  persist();
  render(true);
}
function notify(text) {
  clearTimeout(toastTimer);
  const t = document.querySelector("#toast");
  t.textContent = text;
  t.classList.add("visible");
  toastTimer = setTimeout(() => t.classList.remove("visible"), 3500);
}
function openModal(name) {
  focusBeforeModal = document.activeElement?.dataset?.action;
  u.modal = name;
  u.error = "";
  render();
}
function closeModal() {
  u.modal = null;
  u.error = "";
  render();
  if (focusBeforeModal)
    root.querySelector(`[data-action="${focusBeforeModal}"]`)?.focus();
}
function setAnswers(values) {
  dispatch({ type: "ANSWERS", answers: values });
}
function fillSample() {
  if (u.route === "access") {
    if (u.codeSent) u.code = "246810";
    else if (u.accessMode === "return")
      u.applicationId = c.id || "DEMO-7K4P-92";
    else
      u.contact =
        u.contact ||
        (u.method === "phone" ? "2025550142" : "mei.chen@example.com");
  } else if (u.route === "intake" && c.status === "draft") {
    const groups = [
      ["service", "year", "language"],
      ["residenceCity", "residenceState", "rideshare", "other", "stocks"],
      [
        "firstName",
        "lastName",
        "address",
        "city",
        "state",
        "zip",
        "household",
        "helper",
        "documents",
      ],
      [],
    ];
    setAnswers(
      Object.fromEntries(
        groups[u.step]
          .filter((k) => !c.answers[k])
          .map((k) => [k, sampleAnswers[k]]),
      ),
    );
  } else {
    notify("Open a form step to fill its sample details.");
    return;
  }
  render();
  notify("Fictional sample details filled.");
}
function createException() {
  if (!u.exception) {
    localStorage.setItem(
      BACKUP,
      JSON.stringify({
        case: c,
        ui: {
          route: u.route,
          step: u.step,
          tab: u.tab,
          accessMode: u.accessMode,
        },
      }),
    );
  }
  c = updateCase(newCase(), {
    type: "CREATE",
    contact: { method: "phone", value: "2025550142" },
  });
  c = updateCase(c, {
    type: "ANSWERS",
    answers: { ...sampleAnswers, other: "yes" },
  });
  u.exception = true;
  u.step = 1;
  go("intake");
}
root.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  try {
    if (action.startsWith("edit-")) {
      u.step = Number(action.at(-1));
      go("intake");
      return;
    }
    if (action.startsWith("tab-")) {
      u.tab = action.slice(4);
      persist();
      render();
      return;
    }
    switch (action) {
      case "home":
        go("home");
        break;
      case "start":
        if (c.id) {
          u.accessMode = "return";
          notify("You already have a saved application.");
        } else u.accessMode = "start";
        u.codeSent = false;
        u.code = "";
        u.contact = "";
        go("access");
        break;
      case "return":
        u.accessMode = "return";
        u.codeSent = false;
        u.code = "";
        u.applicationId = "";
        go("access");
        break;
      case "method-phone":
      case "method-email":
        u.method = action.slice(7);
        u.contact = "";
        u.error = "";
        render();
        break;
      case "demo-code":
        u.code = "246810";
        render();
        break;
      case "resend":
        u.code = "";
        render();
        notify("A new code was simulated. Use 246810.");
        break;
      case "sample":
        fillSample();
        break;
      case "continue-intake":
        u.step = 0;
        go("intake");
        break;
      case "back-step":
        u.step = Math.max(0, u.step - 1);
        u.confirmed = false;
        go("intake");
        break;
      case "save-exit":
        persist();
        go("home");
        notify(
          u.storageError
            ? "Saved for this session only."
            : "Your application is saved on this device.",
        );
        break;
      case "help":
        openModal("help");
        break;
      case "staff-login":
        openModal("staff");
        break;
      case "enter-staff":
        go("volunteer");
        break;
      case "switch":
        go(
          u.route === "volunteer"
            ? c.id
              ? c.status === "draft"
                ? "intake"
                : "progress"
              : "home"
            : "volunteer",
        );
        break;
      case "intake-check":
        dispatch({ type: "VERIFY_INTAKE" });
        render();
        notify("Demo time jump: intake checks recorded.");
        break;
      case "claim":
        dispatch({ type: "CLAIM" });
        render();
        notify("Case assigned to Alex.");
        break;
      case "request":
        u.requestTitle = "2025 Uber mileage record";
        u.requestMessage =
          "Please provide your 2025 mileage record for Uber driving.";
        openModal("request");
        break;
      case "upload":
        u.sampleFile = false;
        u.failUpload = false;
        openModal("upload");
        break;
      case "choose-sample":
        u.sampleFile = true;
        u.error = "";
        render();
        break;
      case "remove-sample":
        u.sampleFile = false;
        render();
        break;
      case "submit-document":
        if (!u.sampleFile) return;
        if (u.failUpload) {
          u.error =
            "The sample upload failed. Please try again. Your request is still open.";
          render();
          return;
        }
        dispatch({ type: "RESPOND", filename: "demo-mileage-record-2025.pdf" });
        closeModal();
        notify("Response received. A volunteer will check it next.");
        break;
      case "reset":
        openModal("reset");
        break;
      case "confirm-reset":
        c = newCase();
        u = { ...defaults };
        try {
          localStorage.removeItem(BACKUP);
        } catch {}
        persist();
        render(true);
        notify("Ready for a fresh walkthrough.");
        break;
      case "exception":
        createException();
        break;
      case "restore-main": {
        const backup = JSON.parse(read(BACKUP) || "null");
        if (backup) {
          c = restoreCase(JSON.stringify(backup.case));
          u = { ...defaults, ...backup.ui };
          try {
            localStorage.removeItem(BACKUP);
          } catch {}
          go(u.route);
        }
        break;
      }
      case "print":
        openModal("print");
        break;
      case "print-now":
        window.print();
        break;
      case "copy":
        try {
          await navigator.clipboard.writeText(c.id);
          notify("Application ID copied.");
        } catch {
          openModal("print");
          notify("Select your ID on the card to copy it.");
        }
        break;
      case "close-modal":
        closeModal();
        break;
    }
  } catch (error) {
    if (u.modal || ["intake", "access"].includes(u.route)) {
      u.error = error.message;
      render();
    } else notify(error.message);
  }
});
root.addEventListener("input", (event) => {
  const { name, value, type, checked } = event.target;
  if (event.target.closest("#intake-form")) {
    if (name === "confirmed") u.confirmed = checked;
    else if (name) setAnswers({ [name]: value });
  } else if (event.target.closest("#access-form")) {
    if (name === "contact") u.contact = value;
    if (name === "applicationId") u.applicationId = value;
    if (name === "code") u.code = value;
  } else if (event.target.closest("#request-form")) {
    if (name === "requestTitle") u.requestTitle = value;
    if (name === "requestMessage") u.requestMessage = value;
  }
  if (event.target.id === "upload-failure") u.failUpload = checked;
});
root.addEventListener("change", (event) => {
  if (
    event.target.closest("#intake-form") &&
    (["radio"].includes(event.target.type) ||
      ["helper", "residenceState"].includes(event.target.name))
  ) {
    const name = event.target.name;
    const value = event.target.value;
    render();
    const el = Array.from(root.querySelectorAll(`[name="${name}"]`)).find(
      (x) => x.value === value,
    );
    el?.focus();
  }
});
root.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  if (!form.reportValidity()) return;
  try {
    if (form.id === "access-form") {
      if (!u.codeSent) {
        if (
          u.accessMode === "start" &&
          u.method === "phone" &&
          u.contact.replace(/\D/g, "").length < 10
        )
          throw new Error("Enter a phone number that can receive a code.");
        u.validReturn =
          u.accessMode === "return" &&
          u.applicationId.trim().toUpperCase() === c.id;
        u.destination =
          u.accessMode === "start"
            ? u.method === "phone"
              ? `your phone ending in ${u.contact.replace(/\D/g, "").slice(-4)}`
              : "your email address"
            : "your previously verified contact";
        u.codeSent = true;
        u.error = "";
        render();
      } else {
        if (
          u.code !== "246810" ||
          (u.accessMode === "return" && !u.validReturn)
        )
          throw new Error(
            "That code did not work. Check your Application ID and code, or contact the office.",
          );
        if (u.accessMode === "start") {
          dispatch({
            type: "CREATE",
            contact: { method: u.method, value: u.contact },
          });
          go("id");
        } else go(c.status === "draft" ? "intake" : "progress");
      }
    } else if (form.id === "intake-form") {
      if (u.step < 3) {
        u.step++;
        go("intake");
      } else {
        dispatch({ type: "SUBMIT" });
        go("progress");
      }
    } else if (form.id === "request-form") {
      dispatch({
        type: "REQUEST",
        title: u.requestTitle,
        message: u.requestMessage,
      });
      closeModal();
      notify("Request added to the client’s application.");
    }
  } catch (error) {
    u.error = error.message;
    render();
  }
});
document.addEventListener("keydown", (event) => {
  if (!u.modal) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
  }
  if (event.key === "Tab") {
    const els = [
      ...document.querySelectorAll(
        ".modal button:not([disabled]),.modal input,.modal textarea,.modal a[href]",
      ),
    ];
    if (!els.length) return;
    const first = els[0],
      last = els.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
window.addEventListener("storage", (e) => {
  if (e.key === KEY) {
    c = restoreCase(e.newValue);
    if (!c.id && ["progress", "intake", "id"].includes(u.route))
      u.route = "home";
    render();
  }
});
render();
