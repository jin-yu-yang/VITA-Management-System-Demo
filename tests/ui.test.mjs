import test from "node:test";
import assert from "node:assert/strict";
import {
  describeFocus,
  focusSelectors,
  dialogFocusTarget,
  esc,
  stageBadge,
} from "../src/ui.mjs";

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
    assert.deepEqual(found, { id: null, name: `f-${type}`, action: null, related: [], caret: null }, type);
  }
  // A select has no selection range either, and no `type` worth trusting.
  assert.deepEqual(
    describeFocus({ tagName: "SELECT", name: "residenceState" }),
    { id: null, name: "residenceState", action: null, related: [], caret: null },
  );
});

test("a text-like control keeps its caret", () => {
  for (const type of ["text", "search", "url", "tel", "password"])
    assert.deepEqual(
      describeFocus(element({ type, caret: 5 })),
      { id: null, name: "field", action: null, related: [], caret: 5 },
      type,
    );
  assert.deepEqual(
    describeFocus(element({ tagName: "TEXTAREA", type: undefined, caret: 12 })),
    { id: null, name: "field", action: null, related: [], caret: 12 },
  );
  // An input with no type attribute is a text input.
  assert.deepEqual(describeFocus({ tagName: "INPUT", name: "field", selectionStart: 2 }), {
    id: null,
    name: "field",
    action: null,
    related: [],
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
    action: null,
    related: [],
    caret: 7,
  });
  assert.deepEqual(describeFocus(second), {
    id: "field-req-2-reason",
    name: "reason",
    action: null,
    related: [],
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
    action: null,
    related: [],
    caret: null,
  });
  // A non-numeric caret is not a caret.
  assert.deepEqual(describeFocus({ tagName: "INPUT", type: "text", name: "f", selectionStart: null }), {
    id: null,
    name: "f",
    action: null,
    related: [],
    caret: null,
  });
});

// A control the person presses, rather than types into. Every `data-action`
// button in this application has neither an id nor a name.
const pressable = (dataset, className = "btn") => ({
  tagName: "BUTTON",
  className,
  dataset,
});

// What `restoreField` does against the rebuilt page, in one place so the test
// proves the selectors resolve rather than just that they were produced.
const resolveAmong = (page, focus) => {
  for (const selector of focusSelectors(focus)) {
    const found = page.find((element) => matches(element, selector));
    if (found) return found;
  }
  return null;
};
const matches = (element, selector) => {
  const parts = [...selector.matchAll(/\[([a-z-]+)="((?:[^"\\]|\\.)*)"\]/g)];
  if (!parts.length) return false;
  return parts.every(([, attribute, raw]) => {
    const value = raw.replace(/\\(.)/g, "$1");
    if (attribute === "id") return (element.id ?? "") === value;
    if (attribute === "name") return (element.name ?? "") === value;
    const key = attribute
      .replace(/^data-/, "")
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return (element.dataset?.[key] ?? null) === value;
  });
};

test("a button with no id and no name is described by what it does", () => {
  const help = pressable({ action: "open-help" });
  assert.deepEqual(describeFocus(help), {
    id: null,
    name: null,
    action: { attribute: "data-action", value: "open-help" },
    related: [],
    caret: null,
  });
  // It resolves back to itself on the rebuilt page — this is the whole point:
  // a shared update used to send the keyboard to the top of the document.
  const page = [pressable({ action: "sign-out" }), help, pressable({ action: "open-applications" })];
  assert.equal(resolveAmong(page, describeFocus(help)), help);

  // The workflow and assistance vocabularies are described the same way.
  assert.deepEqual(describeFocus(pressable({ caseAction: "CLAIM_REVIEW" })).action, {
    attribute: "data-case-action",
    value: "CLAIM_REVIEW",
  });
  assert.deepEqual(describeFocus(pressable({ assistanceAction: "CLAIM" })).action, {
    attribute: "data-assistance-action",
    value: "CLAIM",
  });
});

test("a related id tells one namesake button from another", () => {
  // Every open request renders the same button; only the request id differs.
  const first = pressable({ caseAction: "RESPOND_DOCUMENT", requestId: "req-1" });
  const second = pressable({ caseAction: "RESPOND_DOCUMENT", requestId: "req-2" });
  const page = [first, second];
  assert.equal(resolveAmong(page, describeFocus(second)), second, "the second request");
  assert.equal(resolveAmong(page, describeFocus(first)), first);
  assert.deepEqual(describeFocus(second).related, [
    { attribute: "data-request-id", value: "req-2" },
  ]);
  // Ambiguity resolves to the first match only when nothing disambiguates:
  // a control that belongs to no row is looked up by what it does.
  const plain = pressable({ caseAction: "RESPOND_DOCUMENT" });
  assert.deepEqual(describeFocus(plain).related, []);
  assert.equal(resolveAmong(page, describeFocus(plain)), first);

  // A row that is gone after the rebuild is not found — it never steals the
  // keyboard for a different request. This is the whole point of naming the
  // row: the other button is live, and a keypress on it would send a real
  // workflow action against the wrong request.
  assert.equal(resolveAmong([second], describeFocus(first)), null);
  assert.equal(resolveAmong([], describeFocus(first)), null);
  // The one that is still there is still found, on the same page.
  assert.equal(resolveAmong([second], describeFocus(second)), second);
});

test("a field whose row is gone does not put the cursor in a namesake", () => {
  // The staff workspace renders one escalation form per open document request:
  // same `reason` name, ids scoped to the request. If the focused request is
  // resolved in a background rebuild while another stays open, the rest of the
  // sentence must not be typed into — and sent for — the other request.
  const box = (requestId, caret) => ({
    tagName: "TEXTAREA",
    id: `field-${requestId}-reason`,
    name: "reason",
    caret,
    get selectionStart() {
      return caret;
    },
  });
  const one = box("req-1", 9);
  const two = box("req-2", 0);
  assert.equal(resolveAmong([one, two], describeFocus(one)), one);
  assert.equal(resolveAmong([one, two], describeFocus(two)), two);
  assert.equal(resolveAmong([two], describeFocus(one)), null, "not the other box");
  // A control with no id of its own still comes back by name.
  const lookup = { tagName: "INPUT", type: "text", name: "lookup", selectionStart: 2 };
  assert.deepEqual(focusSelectors(describeFocus(lookup)), ['[name="lookup"]']);
  assert.equal(resolveAmong([lookup], describeFocus(lookup)), lookup);
});

test("every selector names the row as precisely as the element did", () => {
  // The id is the whole answer when there is one, and the row-specific action
  // is the only action selector for a control that named its row. Nothing in
  // this list can match a different row's control.
  assert.deepEqual(
    focusSelectors({
      id: "field-req-1-reason",
      name: "reason",
      action: { attribute: "data-action", value: "escalate" },
      related: [{ attribute: "data-request-id", value: "req-1" }],
      caret: null,
    }),
    [
      '[id="field-req-1-reason"]',
      '[data-action="escalate"][data-request-id="req-1"]',
    ],
  );
  // No id: the name is the fallback for a control that has none.
  assert.deepEqual(
    focusSelectors({ id: null, name: "lookup", action: null, related: [], caret: 0 }),
    ['[name="lookup"]'],
  );
  // No row: what it does is all there is, and all that is needed.
  assert.deepEqual(
    focusSelectors({
      id: null,
      name: null,
      action: { attribute: "data-action", value: "open-help" },
      related: [],
      caret: null,
    }),
    ['[data-action="open-help"]'],
  );
  // A row named once is never widened back to the bare action.
  const rowScoped = focusSelectors({
    id: null,
    name: null,
    action: { attribute: "data-case-action", value: "RESPOND_DOCUMENT" },
    related: [{ attribute: "data-request-id", value: "req-1" }],
    caret: null,
  });
  assert.deepEqual(rowScoped, [
    '[data-case-action="RESPOND_DOCUMENT"][data-request-id="req-1"]',
  ]);
  assert.ok(!rowScoped.includes('[data-case-action="RESPOND_DOCUMENT"]'));
  assert.deepEqual(focusSelectors(null), []);
  assert.deepEqual(focusSelectors({ id: null, name: null, action: null, related: [] }), []);
  // A value carrying a quote or a backslash cannot break out of the selector.
  assert.deepEqual(
    focusSelectors({ id: null, name: 'we"ird\\', action: null, related: [] }),
    ['[name="we\\"ird\\\\"]'],
  );
});

test("a dialog always has somewhere to put the keyboard", () => {
  const close = { tagName: "BUTTON", className: "close-btn" };
  const container = { tagName: "SECTION", className: "modal" };
  const control = { tagName: "BUTTON", className: "btn primary" };
  const disabled = { tagName: "BUTTON", className: "btn primary", disabled: true };
  // The first real control wins.
  assert.equal(dialogFocusTarget([close, control], container), control);
  assert.equal(dialogFocusTarget([control, close], container), control);
  // A dialog whose body is only prose still takes the keyboard, on its close
  // button — this is the "Need help?" dialog, which used to land on BODY.
  assert.equal(dialogFocusTarget([close], container), close);
  // Nothing focusable at all falls back to the container, which is why the
  // modal carries tabindex="-1".
  assert.equal(dialogFocusTarget([], container), container);
  assert.equal(dialogFocusTarget([disabled], container), container);
  assert.equal(dialogFocusTarget([], null), null);
  assert.equal(dialogFocusTarget(), null);
});

test("the shared helpers still escape and name stages", () => {
  assert.equal(esc('<a href="x">'), "&lt;a href=&quot;x&quot;&gt;");
  assert.match(stageBadge("corrections_required"), /Corrections in progress/);
  assert.match(stageBadge("nonsense"), /Application/);
});
