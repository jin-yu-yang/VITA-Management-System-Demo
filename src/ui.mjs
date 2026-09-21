import { describeStage } from "./domain.mjs";

export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  arrow: "m9 5 7 7-7 7M4 12h12",
  back: "m14 5-7 7 7 7M7 12h13",
  check: "m5 12 4 4L19 6",
  file: "M14 3H5v18h14V8l-5-5Zm0 0v6h5M8 13h8M8 17h5",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6",
  phone: "M7 3H4c-1 8 9 18 17 17v-4l-5-2-2 2-6-6 2-2-3-5Z",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  help: "M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  copy: "M8 8h12v13H8ZM4 16H2V2h13v3",
  upload: "M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6",
  user: "M17 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0M3 22v-3c0-7 18-7 18 0v3",
  home: "m2 11 10-9 10 9M5 9v13h14V9M10 22v-8h4v8",
  mail: "M2 4h20v16H2ZM2 5l10 8L22 5",
  close: "m5 5 14 14M5 19 19 5",
  refresh: "M3 10a9 9 0 1 1 1 8M3 3v7h7",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z",
  lock: "M5 10h14v12H5ZM8 10V6a4 4 0 0 1 8 0v4M12 15v3",
  play: "m7 3 14 9-14 9V3Z",
  chevron: "m9 5 7 7-7 7",
  folder: "M2 6h8l2 3h10v12H2V6Zm0 0V3h8l2 3h8v3",
  print: "M6 8V2h12v6M6 17H2V8h20v9h-4M6 13h12v9H6Z",
  search: "M20 20l-4-4m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  signout: "M10 21H4V3h6M16 8l4 4-4 4M20 12H9",
};
export const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;
export const button = (text, action, kind = "primary", extra = "") =>
  `<button type="button" class="btn ${kind}" data-action="${action}" ${extra}>${text}</button>`;

// Workflow buttons name the canonical action directly, so the DOM and the
// database speak the same vocabulary (contracts.mjs, DOM action convention).
export const caseButton = (text, action, kind = "primary", extra = "") =>
  `<button type="button" class="btn ${kind}" data-case-action="${action}" ${extra}>${text}</button>`;

// The same, as a form's submit control: the named fields around it are what the
// payload is built from, so the button has to submit the form rather than fire
// on click (the click handler skips submit buttons for exactly that reason).
export const caseSubmit = (text, action, kind = "primary", extra = "") =>
  `<button type="submit" class="btn ${kind}" data-case-action="${action}" ${extra}>${text}</button>`;

// One id per field name, so every control has a real `for` association rather
// than only a wrapping element. A `scope` keeps ids unique when the same field
// name appears in more than one form on a page (one escalation form per open
// document request, for instance).
export const fieldId = (name, scope = "") =>
  `field-${scope ? `${esc(scope)}-` : ""}${name}`;
export const input = (
  label,
  name,
  value = "",
  type = "text",
  extra = "",
  scope = "",
) =>
  `<label class="field" for="${fieldId(name, scope)}"><span>${esc(label)}</span><input id="${fieldId(name, scope)}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
export const textarea = (label, name, value = "", extra = "", scope = "") =>
  `<label class="field" for="${fieldId(name, scope)}"><span>${esc(label)}</span><textarea id="${fieldId(name, scope)}" name="${name}" ${extra}>${esc(value)}</textarea></label>`;
export const select = (label, name, value, options, extra = "", scope = "") =>
  `<label class="field" for="${fieldId(name, scope)}"><span>${esc(label)}</span><select id="${fieldId(name, scope)}" name="${name}" ${extra}><option value="">Select an option</option>${options
    .map((o) => {
      const [val, txt] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(val)}" ${value === val ? "selected" : ""}>${esc(txt)}</option>`;
    })
    .join("")}</select></label>`;
// One vocabulary for the intake answers, shared by the client's own screens and
// by the staff summary of the same answers, so the two can never name the same
// question differently.
export const ANSWER_LABELS = Object.freeze({
  service: "Service",
  year: "Tax year",
  language: "Preferred language",
  residenceCity: "City of residence",
  residenceState: "State of residence",
  city: "Mailing city",
  state: "Mailing state",
  zip: "ZIP code",
  address: "Mailing address",
  rideshare: "Uber / Lyft income",
  other: "Other self-employment",
  stocks: "More than 10 stock transactions",
  firstName: "First name",
  lastName: "Last name",
  household: "People in your household",
  helper: "Who is completing this form",
  documents: "Income documents",
});

// One time format for every screen. An unusable value renders as nothing at
// all rather than "Invalid Date".
export function formatTime(value) {
  const at = new Date(value ?? "");
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const radio = (
  label,
  name,
  value,
  options = [
    ["yes", "Yes"],
    ["no", "No"],
    ["unsure", "Not sure"],
  ],
) =>
  `<fieldset class="question"><legend>${esc(label)}</legend><div class="radio-row">${options.map(([val, text]) => `<label class="radio-card ${value === val ? "selected" : ""}"><input type="radio" name="${name}" value="${val}" ${value === val ? "checked" : ""} required><span>${esc(text)}</span></label>`).join("")}</div></fieldset>`;

// Colour is never the only signal: every badge carries its own words, and the
// words come from the one stage table in domain.mjs.
const STAGE_TONES = Object.freeze({
  draft: "neutral",
  received: "blue",
  preparation_ready: "blue",
  preparing: "blue",
  review_ready: "teal",
  reviewing: "teal",
  corrections_required: "amber",
  review_approved: "green",
  closed: "neutral",
});
export const stageBadge = (stage) =>
  `<span class="badge ${STAGE_TONES[stage] ?? "neutral"}"><i></i>${esc(describeStage(stage).label)}</span>`;

// Rebuilding the page loses the keyboard, so the wiring layer records where it
// was first — by **id** before name, because a name is not unique on a page any
// more: a case with two open document requests renders one escalation form per
// request, each with a `reason` field. Restoring by name alone would move the
// cursor to the first of them, and the rest of the sentence would be typed
// into, and sent for, the wrong request. Ids already carry the request they
// belong to (`fieldId(name, scope)`); the name stays as the fallback for a
// control that has none.
//
// Only these controls have a text selection at all: `selectionStart`
// is defined on `HTMLInputElement.prototype` for *every* input, so testing
// `"selectionStart" in element` proves nothing about whether it can be read.
// The measured behaviour for the rest (radio, checkbox, number, email, date,
// colour, range, file) is `null` in Chromium 153 and Firefox 155 — but the
// specification allows an `InvalidStateError` instead, engines have differed
// historically, and this runs *before* the page is replaced, so a throw here
// would take the whole render with it. Hence the allowlist and the try/catch:
// a field with no caret still gets its focus back, just without one.
const SELECTABLE_INPUT_TYPES = Object.freeze([
  "text",
  "search",
  "url",
  "tel",
  "password",
]);

// A button carries neither an id nor a name — every `data-action` control in
// this application is in that class — so what it *does* is its stable hook, in
// the same vocabulary the click handler reads. Without this a keyboard user is
// sent back to the top of the document by any background update, and there are
// two of those for every accepted action.
const ACTION_KEYS = Object.freeze([
  ["action", "data-action"],
  ["caseAction", "data-case-action"],
  ["assistanceAction", "data-assistance-action"],
]);

// What tells one namesake from another: every "Send sample document" button
// says RESPOND_DOCUMENT, and only the request id says which request. A filter
// or a check is the same idea for the staff board.
const RELATED_KEYS = Object.freeze([
  ["caseId", "data-case-id"],
  ["requestId", "data-request-id"],
  ["itemId", "data-item-id"],
  ["followupId", "data-followup-id"],
  ["personId", "data-person-id"],
  ["check", "data-check"],
  ["filter", "data-filter"],
  ["value", "data-value"],
]);

const attributeValue = (value) =>
  `"${String(value).replace(/[\\"]/g, (character) => `\\${character}`)}"`;

export function describeFocus(active) {
  if (!active) return null;
  const id = active.id || null;
  const name = active.name || null;
  const data = active.dataset ?? {};
  let action = null;
  for (const [key, attribute] of ACTION_KEYS)
    if (data[key]) {
      action = { attribute, value: data[key] };
      break;
    }
  const related = action
    ? RELATED_KEYS.filter(([key]) => data[key] != null && data[key] !== "").map(
        ([key, attribute]) => ({ attribute, value: data[key] }),
      )
    : [];
  // With none of the three there is nothing to find again after the rebuild.
  if (!id && !name && !action) return null;
  const description = { id, name, action, related, caret: null };
  const selectable =
    active.tagName === "TEXTAREA" ||
    (active.tagName === "INPUT" &&
      SELECTABLE_INPUT_TYPES.includes(
        String(active.type ?? "text").toLowerCase(),
      ));
  if (!selectable) return description;
  try {
    const caret = active.selectionStart;
    return {
      ...description,
      caret: typeof caret === "number" ? caret : null,
    };
  } catch {
    return description;
  }
}

// How to find that element again, most specific first: its own id, then its
// name, then what it does *and* which row it belongs to, and only then what it
// does. The last one can match several buttons; it resolves to the first, which
// is why the related id comes before it rather than instead of it.
export function focusSelectors(focus) {
  if (!focus) return [];
  const selectors = [];
  // Attribute form throughout, so no value needs CSS.escape — which does not
  // exist outside a browser, and this has to be testable without one.
  if (focus.id) selectors.push(`[id=${attributeValue(focus.id)}]`);
  if (focus.name) selectors.push(`[name=${attributeValue(focus.name)}]`);
  if (focus.action) {
    const base = `[${focus.action.attribute}=${attributeValue(focus.action.value)}]`;
    const related = (focus.related ?? [])
      .map(({ attribute, value }) => `[${attribute}=${attributeValue(value)}]`)
      .join("");
    if (related) selectors.push(`${base}${related}`);
    selectors.push(base);
  }
  return selectors;
}

// Opening a dialog has to move the keyboard into it: it is `aria-modal`, and
// the Tab trap only stops focus leaving from the first or last control, so it
// can never recover focus that never arrived. A dialog whose body is three
// paragraphs has only its close button, and a dialog with nothing at all still
// has the container, which carries `tabindex="-1"` for exactly this.
const isCloseButton = (element) =>
  String(element?.className ?? "")
    .split(/\s+/)
    .includes("close-btn");

export function dialogFocusTarget(controls = [], container = null) {
  const usable = controls.filter((control) => control && !control.disabled);
  return (
    usable.find((control) => !isCloseButton(control)) ??
    usable.find(isCloseButton) ??
    container ??
    null
  );
}
