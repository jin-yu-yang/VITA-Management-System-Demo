import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { appShell, staffSidebar, page, clientHeader, languageSwitch, dialog, DRAWERS } from "../src/views.mjs";
import { icon, ICON_NAMES } from "../src/ui.mjs";

// Phase 0 of the redesign adds the frame without moving any screen into it,
// so the one thing that must hold today is that a page without a sidebar is
// untouched.
test("without a sidebar the page body comes back unchanged", () => {
  const body = `<main id="main">Work board</main>`;
  assert.equal(appShell({ body }), body);
  assert.equal(appShell({ body, sidebar: "" }), body);
});

test("with a sidebar the toggle names what it does and what it controls", () => {
  const open = appShell({ sidebar: "<nav>Links</nav>", body: "<main></main>" });
  assert.match(open, /class="app-shell"/);
  assert.match(open, /aria-controls="app-sidebar"/);
  assert.match(open, /aria-expanded="true"/);
  assert.match(open, /aria-label="Hide the sidebar"/);
  assert.match(open, /<aside id="app-sidebar" class="app-sidebar" aria-label="Workspace">/);

  const closed = appShell({ sidebar: "<nav>Links</nav>", body: "<main></main>", open: false });
  assert.match(closed, /class="app-shell sidebar-closed"/);
  assert.match(closed, /aria-expanded="false"/);
  assert.match(closed, /aria-label="Show the sidebar"/);
  assert.match(closed, /<aside[^>]* hidden>/);
});

test("every named icon draws its own shape rather than the fallback", () => {
  const fallback = icon("no-such-icon");
  for (const name of ICON_NAMES.filter((n) => n !== "file"))
    assert.notEqual(icon(name), fallback, name);
  for (const name of ["sidebar", "dashboard", "board", "bell", "label", "pin", "eye", "people", "chart"])
    assert.ok(ICON_NAMES.includes(name), name);
});

test("the staff sidebar carries the logo, the one screen that exists, and the account", () => {
  const alex = { id: "alex", name: "Alex", capabilities: ["prepare"] };
  const html = staffSidebar({ screen: "staff" }, alex, false);
  assert.match(html, /<img src="src\/pcdc-logo\.png" alt="PCDC"/);
  assert.match(html, /data-action="open-board"[^>]*aria-current="page"[^>]*>[\s\S]*Work board/);
  assert.match(html, /Alex/);
  assert.match(html, /data-action="open-help"/);
  assert.match(html, /data-action="sign-out"/);
  assert.match(html, /Sign out/);
  // Nothing without a screen behind it.
  assert.doesNotMatch(html, /Dashboard|Schedule|Documents|Messages|Notifications/);

  const office = staffSidebar({ screen: "staff-case" }, { id: "sam", name: "Sam", capabilities: ["admin"] }, true);
  assert.match(office, /Follow-ups/);
  assert.doesNotMatch(office, /aria-current/, "on a case, no nav item is current");
  assert.match(staffSidebar({ screen: "staff" }, null, false), /No persona chosen/);
});

test("presenters get the sidebar; clients get the client top bar and shell", () => {
  const presenter = page({ principal: { access: "presenter" }, connection: "online" }, "<main></main>");
  assert.doesNotMatch(presenter, /class="client-bar"/);
  assert.doesNotMatch(presenter, /class="client-shell"/);
  const client = page({ principal: { access: "applicant" }, connection: "online", screen: "applications" }, "<main></main>");
  assert.match(client, /<header class="client-bar">/);
  assert.match(client, /<div class="client-shell"><main><\/main><\/div>/);
});

// A closed sidebar carries `hidden` (see the `open: false` case above); the
// stylesheet must actually hide it. `.app-sidebar { display: flex }` used to
// win over the UA `[hidden]{display:none}` rule because both are author-level
// specificity 0-1-0 and the flex rule came second, so the fixed overlay could
// not be dismissed on narrow screens (final review, finding 1).
test("the stylesheet hides a closed sidebar rather than leaving it to the UA default", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../src/styles.css", import.meta.url)),
    "utf8",
  );
  assert.match(css, /\.app-sidebar\[hidden\]\s*\{[^}]*display:\s*none/);
});

test("an inactive case tab is not displayed", () => {
  const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
  // Any author `display` on .case-panel overrides [hidden] unless this exists.
  assert.match(css, /\.case-panel\[hidden\]\s*\{[^}]*display:\s*none/);
});

// The old `.case-tabs button` rule (0-1-1) used to beat the new `.case-tab`
// rule (0-1-0), leaving an inactive tab's label at a legacy green that fails
// contrast (final whole-branch review, finding 1). Nothing should style tabs
// through a bare `button` selector any more.
test("no legacy .case-tabs button selector styles the case tabs", () => {
  const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
  assert.doesNotMatch(css, /\.case-tabs\s+button/);
});

test("the client top bar: logo home, language, help, save on intake, sign out", () => {
  const signedIn = { principal: { access: "applicant" }, screen: "applications" };
  const html = clientHeader(signedIn);
  assert.match(html, /<button class="client-brand" data-action="open-applications" aria-label="ViTally home">/);
  assert.match(html, /<img src="src\/pcdc-logo\.png" alt="PCDC"/);
  assert.match(html, /data-action="open-help"/);
  assert.match(html, /data-action="sign-out"[^>]*>[\s\S]*Sign out/);
  assert.doesNotMatch(html, /data-action="save-exit"/, "Save & exit belongs to the intake only");
  const intake = clientHeader({ ...signedIn, screen: "intake", savedCase: { stage: "draft" } });
  assert.match(intake, /data-action="save-exit"[^>]*>Save &amp; exit/);
  const submitted = clientHeader({ ...signedIn, screen: "intake", savedCase: { stage: "received" } });
  assert.doesNotMatch(submitted, /data-action="save-exit"/);
  const signedOut = clientHeader({ principal: null, screen: "access" });
  assert.doesNotMatch(signedOut, /data-action="sign-out"/);
});

test("the language switch offers English and says Chinese is coming", () => {
  const html = languageSwitch();
  assert.match(html, /<div class="language-switch" role="group" aria-label="Language">/);
  assert.match(html, /<button type="button" class="lang current" lang="en" aria-pressed="true">English<\/button>/);
  assert.match(html, /lang="zh-Hans" disabled[^>]*>简体中文/);
  assert.match(html, /lang="zh-Hant" disabled[^>]*>繁體中文/);
  assert.match(html, /<span class="lang-note">Chinese coming soon<\/span>/);
  assert.doesNotMatch(html, /data-action=/, "the switch does nothing yet");
});

test("the help dialog gives the office phone and email", () => {
  const html = page({ principal: { access: "applicant" }, connection: "online", screen: "applications", dialog: "help" }, "<main></main>");
  assert.match(html, /href="tel:\+12159226156"/);
  assert.match(html, /href="mailto:vita@chinatown-pcdc\.org"/);
});

test("the old site header's styles are gone and the client shell sets its ink", () => {
  const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
  assert.doesNotMatch(css, /\.site-header\b/);
  assert.doesNotMatch(css, /\.header-divider\b/);
  assert.match(css, /\.client-shell\s*\{[^}]*color:\s*var\(--vt-intake-ink\)/);
  assert.match(css, /\.client-bar\s*\{/);
  assert.match(css, /\.office-contact\s*\{/);
});

test("staff case history keeps its own unscoped timeline text size, separate from the client override", () => {
  const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
  assert.match(
    css,
    /(?<![.\w-])\.timeline-item p\s*\{\s*font-size:\s*12px;\s*color:\s*#75876c;\s*\}/,
    "an unscoped .timeline-item p rule at 12px must still exist for staff screens",
  );
});

test("the body behind the restyled frames uses the lavender background, not the old canvas", () => {
  const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
  assert.match(
    css,
    /body:has\(\.client-shell\),\s*body:has\(\.app-shell\)\s*\{\s*background:\s*var\(--vt-background\);/,
  );
});

// ---------------------------------------------------------------------------
// The office drawers
// ---------------------------------------------------------------------------

const drawerSam = { id: "p-sam", name: "Sam", capabilities: ["admin", "followup", "assist"] };
const drawerCase = {
  id: "c1",
  reference: "VT-CALL",
  stage: "preparing",
  revision: 3,
  answers: {},
  followups: [{ id: "f1", status: "open", reason: "Ask for the W-2", assigneeId: "p-sam", attempts: [] }],
};
const drawerState = (over = {}) => ({
  principal: { access: "presenter" },
  connection: "online",
  screen: "staff",
  people: [drawerSam],
  selectedPersonId: drawerSam.id,
  cases: [],
  assistance: [],
  ...over,
});

test("while a drawer is open, a refusal is announced once, by the drawer", () => {
  const error = { code: "VALIDATION", message: "Refused." };
  const open = page(
    drawerState({ error, dialog: "log-call", dialogContext: { caseId: "c1" }, savedCase: drawerCase }),
    "<main></main>",
  );
  assert.equal((open.match(/role="alert"/g) ?? []).length, 1);
  assert.match(open, /role="alert" id="drawer-error"/);
  assert.doesNotMatch(open, /problem-banner/);

  const closed = page(drawerState({ error, dialog: null }), "<main></main>");
  assert.equal((closed.match(/role="alert"/g) ?? []).length, 1);
  assert.match(closed, /class="problem-banner" role="alert"/);
});

test("the drawer is the modal frame at the edge, and each dialog names its place", () => {
  const drawer = dialog(
    drawerState({ dialog: "log-call", dialogContext: { caseId: "c1" }, savedCase: drawerCase }),
  );
  assert.match(drawer, /class="modal office-drawer"/);
  assert.match(drawer, /OFFICE FOLLOW-UP/);
  assert.match(drawer, /Log a call/);
  assert.match(drawer, /data-case-action="RECORD_CONTACT"/);

  const help = dialog(
    drawerState({
      dialog: "resolve-help",
      dialogContext: { itemId: "h1" },
      assistance: [{ id: "h1", status: "assigned", assigneeId: "p-sam", title: "Letter", revision: 1 }],
    }),
  );
  assert.match(help, /class="modal office-drawer"/);
  assert.match(help, /Resolve a help request/);
  assert.match(help, /data-assistance-action="RESOLVE" data-item-id="h1"/);

  assert.match(dialog({ dialog: "reset-fixtures", cases: [] }), /PRESENTER CONTROLS/);
  assert.match(dialog({ dialog: "help" }), /ViTally · HERE TO HELP/);
  assert.doesNotMatch(dialog({ dialog: "help" }), /office-drawer/);
});

test("the drawer list is exported once, for the renderer and app.mjs's focus fallback alike", () => {
  assert.deepEqual([...DRAWERS], ["log-call", "resolve-help"]);
  assert.ok(Object.isFrozen(DRAWERS));
  const app = readFileSync(fileURLToPath(new URL("../src/app.mjs", import.meta.url)), "utf8");
  assert.doesNotMatch(app, /\["log-call",\s*"resolve-help"\]/);
  assert.match(app, /views\.DRAWERS\.includes\(/);
});

// PR 4 (the office screens) styles its new containers in one marked block of
// the stylesheet, on the design tokens only.
const stylesheet = () =>
  readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");

test("the office drawer is the modal frame placed at the right edge", () => {
  const css = stylesheet();
  assert.match(css, /\.modal\.office-drawer\s*\{/);
  assert.match(css, /\.modal-backdrop:has\(\.office-drawer\)\s*\{[^}]*justify-content:\s*flex-end/);
});

test("the shared dialog notes read the tokens, so the help dialog's note is legible", () => {
  const css = stylesheet();
  assert.match(css, /\.modal \.info-note p\s*\{[^}]*color:\s*var\(--vt-/);
});

test("the office block of the stylesheet uses tokens, not hex colors", () => {
  const css = stylesheet();
  const start = css.indexOf("/* PR 4: office screens */");
  const end = css.indexOf("/* end PR 4 */");
  assert.ok(start >= 0 && end > start, "the PR 4 block is marked");
  const block = css.slice(start, end);
  const hexes = (block.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).filter((hex) => hex.toLowerCase() !== "#fff");
  assert.deepEqual(hexes, []);
});

test("the queue's row actions keep the 44px staff control minimum", () => {
  assert.match(stylesheet(), /\.office-queue \.queue-action \.btn\s*\{[^}]*min-height:\s*var\(--vt-tap\)/);
});

test("every filter chip, on every staff screen, keeps the 44px staff minimum", () => {
  // One base rule for the volunteer board, the office queue and the pool.
  assert.match(stylesheet(), /\n\.btn\.chip\s*\{[^}]*min-height:\s*var\(--vt-tap\)/);
});

test("the old palette is gone: every color and font reads a --vt-* token", () => {
  const css = stylesheet();
  for (const name of ["ink", "muted", "blue", "teal", "line", "canvas", "serif", "sans"]) {
    assert.doesNotMatch(css, new RegExp(`var\\(--${name}\\)`), `var(--${name}) is still read`);
    assert.doesNotMatch(css, new RegExp(`\\n\\s*--${name}:`), `--${name} is still defined`);
  }
});

test("the office drawer fills the dynamic viewport, with 100vh as the fallback", () => {
  const rule = stylesheet().match(/\.modal\.office-drawer\s*\{([^}]*)\}/)[1];
  assert.match(rule, /height:\s*100vh;\s*height:\s*100dvh;/);
  assert.match(rule, /max-height:\s*100vh;\s*max-height:\s*100dvh;/);
});

test("the client-number block of the stylesheet uses tokens, not hex colors", () => {
  const css = stylesheet();
  const start = css.indexOf("/* Part 2: client numbers */");
  const end = css.indexOf("/* end part 2 */");
  assert.ok(start >= 0 && end > start, "the part 2 block is marked");
  const block = css.slice(start, end);
  assert.match(block, /\.client-number\s*\{/);
  const hexes = (block.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).filter((hex) => hex.toLowerCase() !== "#fff");
  assert.deepEqual(hexes, []);
});
