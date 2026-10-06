import test from "node:test";
import assert from "node:assert/strict";
import { checkDrafts, formValuesWithLists, restoreDraft } from "../src/form-values.mjs";

// A form is only read through `new FormData(form)` and `querySelectorAll`, so
// a tiny stand-in with a real FormData is enough (node has no DOM).
function fakeForm(entries, checkboxNames = []) {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return {
    data,
    form: {
      querySelectorAll: (selector) => {
        assert.equal(selector, "input[type=checkbox][name]");
        return checkboxNames.map((name) => ({ name }));
      },
    },
  };
}

test("two ticked boxes of one name read as an array of two", () => {
  const { form, data } = fakeForm(
    [
      ["received", "photo_id"],
      ["received", "ssn_itin"],
    ],
    ["received", "received", "received"],
  );
  assert.deepEqual(formValuesWithLists(form, data), { received: ["photo_id", "ssn_itin"] });
});

test("a checkbox group with nothing ticked reads as an empty list", () => {
  const { form, data } = fakeForm([], ["received", "received"]);
  assert.deepEqual(formValuesWithLists(form, data), { received: [] });
});

test("one ticked box is still a list", () => {
  const { form, data } = fakeForm([["bestContactTime", "weekend"]], ["bestContactTime", "bestContactTime"]);
  assert.deepEqual(formValuesWithLists(form, data), { bestContactTime: ["weekend"] });
});

test("a single text field reads as a string, beside a checkbox group", () => {
  const { form, data } = fakeForm(
    [
      ["bestContactNote", "After 6 pm"],
      ["bestContactTime", "weekend"],
    ],
    ["bestContactTime"],
  );
  assert.deepEqual(formValuesWithLists(form, data), {
    bestContactNote: "After 6 pm",
    bestContactTime: ["weekend"],
  });
});

test("a repeated name that is not a checkbox still becomes an array", () => {
  const { form, data } = fakeForm([
    ["tag", "a"],
    ["tag", "b"],
  ]);
  assert.deepEqual(formValuesWithLists(form, data), { tag: ["a", "b"] });
});

// ---- What a staff form holds until it is sent (app.mjs's formDrafts) -------
// A redraw rebuilds every staff form from saved state, so what is ticked but
// not yet sent is kept by id and put back. A box's value is its option and is
// never empty, so a tick has to be kept as its own state.

const box = (id, { checked = false, disabled = false, type = "checkbox", name = "received", form = null } = {}) => ({
  id,
  type,
  name,
  value: id,
  checked,
  disabled,
  form,
});

test("a ticked box is kept as its tick, by its id", () => {
  assert.deepEqual(checkDrafts(box("field-materials-photo_id", { checked: true })), [
    ["field-materials-photo_id", { checked: true }],
  ]);
  assert.deepEqual(checkDrafts(box("field-materials-w2")), [["field-materials-w2", { checked: false }]]);
});

test("a radio keeps its whole group: the one it turned off sent no event", () => {
  const form = { elements: [] };
  const a = box("field-x-a", { type: "radio", name: "x", form });
  const b = box("field-x-b", { type: "radio", name: "x", form, checked: true });
  const other = box("field-y-a", { type: "radio", name: "y", form, checked: true });
  form.elements.push(a, b, other);
  assert.deepEqual(checkDrafts(b), [
    ["field-x-a", { checked: false }],
    ["field-x-b", { checked: true }],
  ]);
});

test("a redraw's unticked box gets its unsaved tick back, and an untick too", () => {
  const rebuilt = box("field-materials-photo_id");
  restoreDraft(rebuilt, { checked: true });
  assert.equal(rebuilt.checked, true);
  const saved = box("field-materials-w2", { checked: true });
  restoreDraft(saved, { checked: false });
  assert.equal(saved.checked, false);
});

test("a tick is not put into a box the redraw disabled: it would not be sent", () => {
  const rebuilt = box("field-materials-photo_id", { disabled: true });
  restoreDraft(rebuilt, { checked: true });
  assert.equal(rebuilt.checked, false);
});

test("typed text still only fills a box the redraw left empty", () => {
  const empty = { id: "field-reason", type: "textarea", value: "" };
  restoreDraft(empty, "Half a reason");
  assert.equal(empty.value, "Half a reason");
  const prefilled = { id: "field-note", type: "textarea", value: "Saved note" };
  restoreDraft(prefilled, "Typed");
  assert.equal(prefilled.value, "Saved note");
  // A field the redraw no longer draws is left alone.
  restoreDraft(null, "Typed");
});
