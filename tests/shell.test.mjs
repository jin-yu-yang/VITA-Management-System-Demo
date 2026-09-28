import test from "node:test";
import assert from "node:assert/strict";
import { appShell } from "../src/views.mjs";
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
