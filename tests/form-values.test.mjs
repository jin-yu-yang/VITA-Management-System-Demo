import test from "node:test";
import assert from "node:assert/strict";
import { formValuesWithLists } from "../src/form-values.mjs";

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
