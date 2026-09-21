import test from "node:test";
import assert from "node:assert/strict";
import { describeFocus, esc, stageBadge } from "../src/ui.mjs";

// `describeFocus` is the one piece of the DOM wiring that is worth testing on
// its own, because the thing it has to get right is invisible: reading
// `selectionStart` off a control that has no selection **throws**, and it is
// read before the page is rebuilt, so the throw takes the whole render with it.
// Fake elements stand in for the DOM; only the two properties it reads matter.

const element = ({ tagName = "INPUT", type = "text", name = "field", caret = 3, throws = false }) => ({
  tagName,
  name,
  type,
  get selectionStart() {
    if (throws)
      throw new DOMException(
        "Failed to read the 'selectionStart' property from 'HTMLInputElement': The input element's type ('radio') does not support selection.",
        "InvalidStateError",
      );
    return caret;
  },
});

test("a control with no selection is described without reading its caret", () => {
  // Every one of these throws on the getter in Chromium and Firefox, and the
  // accessor exists on the prototype either way — so the type is what decides.
  for (const type of ["radio", "checkbox", "number", "email", "date", "color", "range", "file"]) {
    const found = describeFocus(element({ type, throws: true, name: `f-${type}` }));
    assert.deepEqual(found, { name: `f-${type}`, caret: null }, type);
  }
  // A select has no selection range either, and no `type` worth trusting.
  assert.deepEqual(
    describeFocus({ tagName: "SELECT", name: "residenceState" }),
    { name: "residenceState", caret: null },
  );
});

test("a text-like control keeps its caret", () => {
  for (const type of ["text", "search", "url", "tel", "password"])
    assert.deepEqual(
      describeFocus(element({ type, caret: 5 })),
      { name: "field", caret: 5 },
      type,
    );
  assert.deepEqual(
    describeFocus(element({ tagName: "TEXTAREA", type: undefined, caret: 12 })),
    { name: "field", caret: 12 },
  );
  // An input with no type attribute is a text input.
  assert.deepEqual(describeFocus({ tagName: "INPUT", name: "field", selectionStart: 2 }), {
    name: "field",
    caret: 2,
  });
});

test("nothing focused, or nothing named, is nothing to restore", () => {
  assert.equal(describeFocus(null), null);
  assert.equal(describeFocus(undefined), null);
  assert.equal(describeFocus({ tagName: "BUTTON", name: "" }), null);
  assert.equal(describeFocus({ tagName: "BODY" }), null);
});

test("a caret that cannot be read is never allowed to escape", () => {
  // Belt and braces: even a text input whose getter throws (a detached node, a
  // future engine) must describe the field rather than take the render down.
  assert.deepEqual(describeFocus(element({ type: "text", throws: true })), {
    name: "field",
    caret: null,
  });
  // A non-numeric caret is not a caret.
  assert.deepEqual(describeFocus({ tagName: "INPUT", type: "text", name: "f", selectionStart: null }), {
    name: "f",
    caret: null,
  });
});

test("the shared helpers still escape and name stages", () => {
  assert.equal(esc('<a href="x">'), "&lt;a href=&quot;x&quot;&gt;");
  assert.match(stageBadge("corrections_required"), /Corrections in progress/);
  assert.match(stageBadge("nonsense"), /Application/);
});
