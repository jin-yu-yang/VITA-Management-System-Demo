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

// ---- What a staff form holds until it is sent ----------------------------
//
// app.mjs keeps it by field id (formDrafts) and puts it back after every
// redraw, because a redraw rebuilds each staff form from what is saved. Typed
// text is kept as its string. A checkbox's or radio's value is its option and
// is never empty, so a tick is kept as its own state: `{ checked }`.

export const isCheckable = (field) => field?.type === "checkbox" || field?.type === "radio";

/**
 * The [id, draft] pairs one input event on a checkbox or radio records. A
 * radio records its whole group: the one it turned off sent no event.
 */
export function checkDrafts(field) {
  const group =
    field.type === "radio" && field.name && field.form
      ? [...field.form.elements].filter((other) => other.type === "radio" && other.name === field.name)
      : [field];
  return group.filter((one) => one.id).map((one) => [one.id, { checked: Boolean(one.checked) }]);
}

/**
 * Put one draft back into the field a redraw built. Typed text only fills a
 * box the redraw left empty; a tick (or an untick) goes back as it was, unless
 * the box is now disabled, when it would not be sent.
 */
export function restoreDraft(field, draft) {
  if (!field) return;
  if (draft !== null && typeof draft === "object") {
    if (isCheckable(field) && !field.disabled) field.checked = draft.checked;
    return;
  }
  if (!field.value) field.value = draft;
}
