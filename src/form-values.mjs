// Reads a form into a plain object where a name that appears more than once
// is a list. `Object.fromEntries(new FormData(form))` keeps only the last
// value of a repeated name, so a group of checkboxes needs this instead.
//
// A checkbox group is always a list — one ticked box is a list of one, and
// nothing ticked is `[]` — because an unticked box sends nothing at all and
// "nothing" has to be told apart from "the field is not on this form".
// Every other name is a string, or a list when it repeats.

/**
 * @param {HTMLFormElement} form
 * @param {FormData} [data] the form's entries; read from `form` when omitted
 *   (a test passes its own, since node has no DOM)
 */
export function formValuesWithLists(form, data = new FormData(form)) {
  const checkboxes = new Set(
    [...form.querySelectorAll("input[type=checkbox][name]")].map((box) => box.name),
  );
  const values = {};
  for (const name of checkboxes) values[name] = [];
  for (const [name, value] of data.entries()) {
    if (checkboxes.has(name)) values[name].push(value);
    else if (!Object.hasOwn(values, name)) values[name] = value;
    else values[name] = [].concat(values[name], value);
  }
  return values;
}
