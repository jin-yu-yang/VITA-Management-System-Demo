import { esc, icon, button } from "./ui.mjs";
import {
  renderStaffBoard,
  renderStaffCase,
  decorateStaffCase,
} from "./staff-views.mjs";
import {
  renderAdminBoard,
  renderAdminCase,
  closeCaseDialogBody,
} from "./admin-views.mjs";
import {
  renderPresenterPanel,
  resetDialogBody,
  checkpointDialogBody,
} from "./presenter-views.mjs";

// The shared shell: the frame every screen sits in, the dialogs, the two
// screens that belong to nobody in particular (setup needed, no access), and
// the staff frame — the persona selector and the `<main>` that the work board
// or one case workspace sits in. The client screens live in
// `client-views.mjs` and the staff screens in `staff-views.mjs`; this file
// renders no intake, no progress and no workflow button of its own.

const when = (condition, html) => (condition ? html : "");

export function header(state) {
  return `<header class="site-header"><button class="brand" data-action="open-applications" aria-label="ViTally home"><span class="brand-mark">${icon("home")}</span><span><strong>ViTally<span class="brand-dot">.</span></strong><small>PCDC COMMUNITY TAX ASSISTANCE</small></span></button><nav aria-label="Main navigation"><span class="season">2025 TAX SEASON</span>${button(`${icon("help")} Need help?`, "open-help", "text")}${when(
    state.principal,
    `<span class="header-divider"></span><span class="who">${icon("user")} ${esc(state.principal?.access === "presenter" ? "Volunteer" : "Signed in")}</span>${button(`${icon("signout")} Sign out`, "sign-out", "text")}`,
  )}</nav></header>`;
}

// A lost connection is stated plainly, and what is on screen stays readable.
// It never claims an action succeeded.
export function connectionNotice(state) {
  if (state.connection === "online" || state.connection === "unknown") return "";
  const reconnecting = state.connection === "reconnecting";
  return `<div class="connection-notice" role="status">${icon("clock")}<span>${
    reconnecting
      ? "The connection dropped and is being retried. What you see may be out of date, and actions cannot be confirmed until it is back."
      : "No connection to the server. You can read this page, but nothing can be saved or sent until the connection returns."
  }</span></div>`;
}

// Something worth saying that is not a failure: today, that somebody rebuilt
// the demonstration cases while this window was looking at one. It is a
// status, not an alert, and it is dismissed by the same control.
function noticeBanner(state) {
  if (!state.notice) return "";
  return `<div class="notice-banner" role="status">${icon("refresh")}<span>${esc(state.notice)}</span>${button("Dismiss", "dismiss-error", "inline")}</div>`;
}

function problemBanner(state) {
  if (!state.error || state.saveState === "failed") return "";
  // The staff workspace states a failure in place, beside the action that
  // failed, with the same Try again and Dismiss controls. One announcement is
  // enough, and that one is the more useful of the two — but only when that
  // screen is really the one being rendered (see `staffScreen`).
  if (state.screen === "staff-case" && state.savedCase) return "";
  return `<div class="problem-banner" role="alert">${icon("help")}<span>${esc(state.error.message)}</span>${when(state.retryable, button("Try again", "retry-action", "inline"))}${button("Dismiss", "dismiss-error", "inline")}</div>`;
}

export function footer() {
  return `<footer class="site-footer"><span>ViTally · Philadelphia Chinatown Development Corporation (PCDC)</span><span>Course prototype · Tax year 2025 · No real taxpayer data</span></footer>`;
}

export function page(state, body) {
  return `<a class="skip" href="#main">Skip to content</a>${header(state)}${connectionNotice(state)}${noticeBanner(state)}${problemBanner(state)}${body}${footer()}${dialog(state)}<div class="toast" id="toast" role="status" aria-live="polite"></div>`;
}

// Shown when `/public-config.json` cannot be read or reports `configured:false`.
// It explains what to set and nothing about what the values are.
export function setupNeeded() {
  return `<main id="main" class="narrow" tabindex="-1"><div class="center-icon">${icon("shield")}</div><div class="page-intro centered"><span class="overline">SETUP NEEDED</span><h1>ViTally is not configured yet</h1><p>This browser could not read a usable <code>/public-config.json</code>, so there is no project to sign in to.</p></div><section class="panel setup-panel"><h2>Add a local environment file</h2><p>Copy <code>.env.example</code> to <code>.env.local</code> in the project root and fill in the two published values of your own Supabase project:</p><pre><code>SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key</code></pre><p>Then restart the server with <code>npm start</code> and reload this page. Both values are the ones a browser is meant to hold; nothing private belongs in this file, and it is never committed.</p><p class="field-note">See <code>docs/setup.md</code> for the database migrations and workspace setup that come before this step.</p></section></main>`;
}

// The server could not be reached while establishing who this visitor is.
// Showing the sign-in form here would be a guess — and a misleading one for
// someone who is already signed in — so this says what is actually known and
// offers another attempt. Focus and `online` events retry on their own too.
export function unreachableScreen(state) {
  return `<main id="main" class="narrow" tabindex="-1"><div class="center-icon">${icon("clock")}</div><div class="page-intro centered"><span class="overline">NO CONNECTION</span><h1>ViTally cannot reach the server</h1><p>${esc(state.error?.message ?? "The demo cannot reach the server. Check the connection.")}</p></div><div class="panel"><p>You are not signed out — this browser simply could not check. Nothing has been lost, and nothing was sent.</p>${button(`${icon("refresh")} Try again`, "retry-connection", "primary full")}<p class="field-note">This page also retries by itself when the connection returns or when you come back to this window.</p></div></main>`;
}

// Signed in, but this account has no active membership in a workspace.
export function noAccessScreen(state) {
  return `<main id="main" class="narrow" tabindex="-1"><div class="center-icon">${icon("lock")}</div><div class="page-intro centered"><span class="overline">NOT ON THIS ROSTER</span><h1>This account has no access</h1><p>${esc(state.error?.message ?? "You do not have access to this step.")}</p></div><div class="panel"><p>ViTally is a closed demo: an organiser adds each address before it can be used. Ask the person running this session to add yours, then sign in again.</p>${button("Sign out", "sign-out", "primary full")}</div></main>`;
}

// ---------------------------------------------------------------------------
// The staff frame
// ---------------------------------------------------------------------------

// Which screens a presenter gets is decided by the persona this window is
// acting as, not by the account: an office administrator works in the follow-up
// and assistance workspace, everybody else in the preparation/review one
// (Ruling R55). The choice is a view choice — the database re-checks every
// capability on every action, so nothing here grants anything.
const isAdmin = (person) =>
  Array.isArray(person?.capabilities) && person.capabilities.includes("admin");

// A presenter is on one of two screens: the work board, or one case. Both get
// the presenter panel, because which volunteer this window is acting as is
// what decides who may do what — and because the person running the session
// needs their own controls wherever they happen to be standing. The records
// are decorated here — once, with the roster this screen already holds — so
// the renderers never see a bare id.
export function staffScreen(state) {
  const people = state.people ?? [];
  const person =
    people.find((entry) => entry.id === state.selectedPersonId) ?? null;
  const panel = renderPresenterPanel({
    principal: state.principal,
    people,
    selectedPersonId: state.selectedPersonId,
    connection: state.connection,
    workspace: state.workspace,
    cases: state.cases,
  });
  const office = isAdmin(person);
  const frame = (overline, title, intro, back, body) =>
    `<main id="main" class="narrow" tabindex="-1"><div class="page-intro"><span class="overline">${esc(overline)}</span><h1>${esc(title)}</h1><p>${esc(intro)}</p>${when(
      back,
      button(`${icon("back")} Back to the work board`, "open-board", "text"),
    )}</div>${panel}${body}</main>`;
  if (state.screen === "staff-case" && state.savedCase) {
    const record = decorateStaffCase(state.savedCase, people);
    const ui = {
      person,
      busy: state.busy,
      error: state.error,
      retryable: state.retryable,
      draftAnswers: state.draftAnswers,
      dirty: state.dirty,
      openPanels: state.openPanels,
    };
    return office
      ? frame(
          "OFFICE WORKSPACE",
          "One case",
          "What the office knows about this case, and the office work you may do on it.",
          true,
          renderAdminCase(record, ui),
        )
      : frame(
          "VOLUNTEER WORKSPACE",
          "One case",
          "Everything this case holds, and the work you may do on it as the volunteer you are acting as.",
          true,
          renderStaffCase(record, person, ui),
        );
  }
  const cases = (state.cases ?? []).map((record) =>
    decorateStaffCase(record, people),
  );
  return office
    ? frame(
        "OFFICE WORKSPACE",
        "Office work",
        "Work waiting to be claimed, clients waiting for a call, and the requests for help with forms.",
        false,
        renderAdminBoard(
          cases,
          (state.assistance ?? []).map((item) => decorateAssistance(item, people)),
          {
            person,
            filters: state.boardFilters,
            busy: state.busy,
            openPanels: state.openPanels,
          },
        ),
      )
    : frame(
        "VOLUNTEER WORKSPACE",
        "Work board",
        "Every case in this workspace, what it is waiting for, and the work you can take on.",
        false,
        renderStaffBoard(cases, people, {
          person,
          filters: state.boardFilters,
          busy: state.busy,
        }),
      );
}

// The same id-to-name step `decorateStaffCase` performs, for the one field an
// assistance item holds: the helper who took it. The store returns ids; no
// renderer ever sees one.
function decorateAssistance(item, people = []) {
  if (!item) return item;
  return {
    ...item,
    assigneeName: item.assigneeId
      ? (people.find((person) => person?.id === item.assigneeId)?.name ??
        "Unknown person")
      : null,
  };
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

export function dialog(state) {
  if (!state.dialog) return "";
  let title = "";
  let body = "";
  if (state.dialog === "help") {
    title = "A real person can help.";
    body = `<p>Contact the PCDC office if you need help with your application, cannot find your Application ID, or cannot read the inbox you signed up with.</p><div class="contact-option">${icon("home")}<div><strong>Visit the PCDC office</strong><small>Address and opening hours are shown in the live service.</small></div></div><div class="info-note">${icon("shield")}<p>Volunteers follow the site’s identity-check process before restoring access or changing contact details.</p></div>`;
  }
  if (state.dialog === "regenerate") {
    title = "Replace the fictional answers?";
    body = `<p>This replaces every answer in this form with a different fictional example, including answers you edited. Your email address, Application ID and current stage do not change.</p><div class="info-note">${icon("help")}<p>Nothing is saved until you save the form, so you can still step back through the form and check it first.</p></div>${button("Replace with another example", "confirm-regenerate", "primary full")}${button("Keep my answers", "close-dialog", "text")}`;
  }
  if (state.dialog === "close-case") {
    title = "Close this case?";
    // The office screens own their own copy; this frame only places it.
    body = closeCaseDialogBody(state);
  }
  if (state.dialog === "reset-fixtures") {
    title = "Reset the sample cases?";
    body = resetDialogBody(state);
  }
  if (state.dialog === "load-checkpoint") {
    title = "Load a sample checkpoint";
    body = checkpointDialogBody(state);
  }
  if (state.dialog === "print") {
    title = "Your application reference card";
    body = `<div class="print-card"><strong>ViTally · PCDC Community Tax Assistance</strong><span>APPLICATION ID</span><b>${esc(state.savedCase?.reference)}</b><p>2025 tax year · Sign in with your email to return.</p></div><p class="field-note">This card holds no tax answers and no sign-in code.</p>${button(`${icon("print")} Print this card`, "print-now", "primary full")}`;
  }
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="close-btn" data-action="close-dialog" aria-label="Close dialog">${icon("close")}</button><span class="overline">ViTally · HERE TO HELP</span><h2 id="modal-title">${esc(title)}</h2>${body}</section></div>`;
}
