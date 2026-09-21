import test from "node:test";
import assert from "node:assert/strict";
import { describeFocus, esc, stageBadge } from "../src/ui.mjs";

// `describeFocus` is the one piece of the DOM wiring that is worth testing on
// its own, because the thing it has to get right is invisible: reading
// `selectionStart` off a control that has no selection **throws**, and it is
// read before the page is rebuilt, so the throw takes the whole render with it.
// Fake elements stand in for the DOM; only the two properties it reads matter.

const element = ({ tagName = "INPUT", type = "text", name = "field", id = "", caret = 3, throws = false }) => ({
  tagName,
  name,
  id,
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
    assert.deepEqual(found, { id: null, name: `f-${type}`, caret: null }, type);
  }
  // A select has no selection range either, and no `type` worth trusting.
  assert.deepEqual(
    describeFocus({ tagName: "SELECT", name: "residenceState" }),
    { id: null, name: "residenceState", caret: null },
  );
});

test("a text-like control keeps its caret", () => {
  for (const type of ["text", "search", "url", "tel", "password"])
    assert.deepEqual(
      describeFocus(element({ type, caret: 5 })),
      { id: null, name: "field", caret: 5 },
      type,
    );
  assert.deepEqual(
    describeFocus(element({ tagName: "TEXTAREA", type: undefined, caret: 12 })),
    { id: null, name: "field", caret: 12 },
  );
  // An input with no type attribute is a text input.
  assert.deepEqual(describeFocus({ tagName: "INPUT", name: "field", selectionStart: 2 }), {
    id: null,
    name: "field",
    caret: 2,
  });
});

test("nothing focused, or nothing to find again, is nothing to restore", () => {
  assert.equal(describeFocus(null), null);
  assert.equal(describeFocus(undefined), null);
  assert.equal(describeFocus({ tagName: "BUTTON", name: "" }), null);
  assert.equal(describeFocus({ tagName: "BODY" }), null);
  assert.equal(describeFocus({ tagName: "INPUT", name: "", id: "" }), null);
});

test("the field is described by its id, so a namesake cannot take the cursor", () => {
  // The staff workspace renders one escalation form per open document request,
  // each with a `reason` box. They share a name and differ only by id, which is
  // scoped to the request (`fieldId(name, scope)`): restoring by name would put
  // the cursor — and the rest of the sentence — in the first request's box.
  const first = element({
    tagName: "TEXTAREA",
    type: undefined,
    name: "reason",
    id: "field-req-1-reason",
    caret: 7,
  });
  const second = element({
    tagName: "TEXTAREA",
    type: undefined,
    name: "reason",
    id: "field-req-2-reason",
    caret: 4,
  });
  assert.deepEqual(describeFocus(first), {
    id: "field-req-1-reason",
    name: "reason",
    caret: 7,
  });
  assert.deepEqual(describeFocus(second), {
    id: "field-req-2-reason",
    name: "reason",
    caret: 4,
  });
  assert.notEqual(describeFocus(first).id, describeFocus(second).id);

  // What the wiring layer does with that: the id wins, the name is the fallback
  // for a control that has none. (`restoreField` in `src/app.mjs` is this
  // lookup against the rebuilt page.)
  const page = [first, second];
  const resolve = (focus) =>
    (focus.id ? page.find((field) => field.id === focus.id) : null) ??
    (focus.name ? page.find((field) => field.name === focus.name) : null);
  assert.equal(resolve(describeFocus(second)), second, "the second box, not the first");
  assert.equal(resolve(describeFocus(first)), first);
  // A field with no id at all still comes back by name.
  const unnamedId = element({ type: "text", name: "lookup", caret: 2 });
  assert.equal(describeFocus(unnamedId).id, null);
  assert.equal(resolve({ id: null, name: "reason", caret: 0 }), first);
});

test("a caret that cannot be read is never allowed to escape", () => {
  // Belt and braces: even a text input whose getter throws (a detached node, a
  // future engine) must describe the field rather than take the render down.
  assert.deepEqual(describeFocus(element({ type: "text", throws: true })), {
    id: null,
    name: "field",
    caret: null,
  });
  // A non-numeric caret is not a caret.
  assert.deepEqual(describeFocus({ tagName: "INPUT", type: "text", name: "f", selectionStart: null }), {
    id: null,
    name: "f",
    caret: null,
  });
});

test("the shared helpers still escape and name stages", () => {
  assert.equal(esc('<a href="x">'), "&lt;a href=&quot;x&quot;&gt;");
  assert.match(stageBadge("corrections_required"), /Corrections in progress/);
  assert.match(stageBadge("nonsense"), /Application/);
});
