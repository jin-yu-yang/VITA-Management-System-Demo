import { esc, icon, button } from "./ui.mjs";
import {
  renderStaffBoard,
  renderStaffCase,
  decorateStaffCase,
} from "./staff-views.mjs";

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
  return `<a class="skip" href="#main">Skip to content</a>${header(state)}${connectionNotice(state)}${problemBanner(state)}${body}${footer()}${dialog(state)}<div class="toast" id="toast" role="status" aria-live="polite"></div>`;
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

function personaPicker(people = [], selectedPersonId = null) {
  if (!people.length) return "";
  return `<section class="panel persona-picker" aria-labelledby="persona-title"><h2 id="persona-title">Acting as</h2><p class="field-note">Choose the volunteer this window is working as. The choice is local to this window and travels with staff actions only.</p><div class="persona-row">${people
    .map((person) =>
      button(
        `${icon("user")} ${esc(person.name)}<small>${esc(person.capabilities?.join(", ") ?? "")}</small>`,
        "select-person",
        selectedPersonId === person.id ? "secondary selected" : "secondary",
        `data-person-id="${esc(person.id)}" aria-pressed="${selectedPersonId === person.id}"`,
      ),
    )
    .join("")}</div></section>`;
}

// A presenter is on one of two screens: the work board, or one case. Both get
// the persona selector, because which volunteer this window is acting as is
// what decides who may do what. The records are decorated here — once, with the
// roster this screen already holds — so the renderers never see a bare id.
export function staffScreen(state) {
  const people = state.people ?? [];
  const person =
    people.find((entry) => entry.id === state.selectedPersonId) ?? null;
  const picker = personaPicker(people, state.selectedPersonId);
  if (state.screen === "staff-case" && state.savedCase)
    return `<main id="main" class="narrow" tabindex="-1"><div class="page-intro"><span class="overline">VOLUNTEER WORKSPACE</span><h1>One case</h1><p>Everything this case holds, and the work you may do on it as the volunteer you are acting as.</p>${button(`${icon("back")} Back to the work board`, "open-board", "text")}</div>${picker}${renderStaffCase(
      decorateStaffCase(state.savedCase, people),
      person,
      {
        busy: state.busy,
        error: state.error,
        retryable: state.retryable,
      },
    )}</main>`;
  return `<main id="main" class="narrow" tabindex="-1"><div class="page-intro"><span class="overline">VOLUNTEER WORKSPACE</span><h1>Work board</h1><p>Every case in this workspace, what it is waiting for, and the work you can take on.</p></div>${picker}${renderStaffBoard(
    (state.cases ?? []).map((record) => decorateStaffCase(record, people)),
    people,
    { person, filters: state.boardFilters, busy: state.busy },
  )}</main>`;
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
  if (state.dialog === "print") {
    title = "Your application reference card";
    body = `<div class="print-card"><strong>ViTally · PCDC Community Tax Assistance</strong><span>APPLICATION ID</span><b>${esc(state.savedCase?.reference)}</b><p>2025 tax year · Sign in with your email to return.</p></div><p class="field-note">This card holds no tax answers and no sign-in code.</p>${button(`${icon("print")} Print this card`, "print-now", "primary full")}`;
  }
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="close-btn" data-action="close-dialog" aria-label="Close dialog">${icon("close")}</button><span class="overline">ViTally · HERE TO HELP</span><h2 id="modal-title">${esc(title)}</h2>${body}</section></div>`;
}
