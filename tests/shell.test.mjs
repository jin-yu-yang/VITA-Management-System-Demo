import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { appShell, staffSidebar, page } from "../src/views.mjs";
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
  assert.match(office, /Office work/);
  assert.doesNotMatch(office, /aria-current/, "on a case, no nav item is current");
  assert.match(staffSidebar({ screen: "staff" }, null, false), /No persona chosen/);
});

test("presenters get the sidebar instead of the site header; clients keep the header", () => {
  const presenter = page({ principal: { access: "presenter" }, connection: "online" }, "<main></main>");
  assert.doesNotMatch(presenter, /class="site-header"/);
  const client = page({ principal: { access: "client" }, connection: "online" }, "<main></main>");
  assert.match(client, /class="site-header"/);
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
