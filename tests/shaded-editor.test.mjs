import test from "node:test";
import assert from "node:assert/strict";
import {
  CONFLICT_SENTENCE,
  DISCARD_QUESTION,
  OPEN_FAILED,
  createEditorSession,
  rawFromPdfjs,
} from "../src/shaded-editor.mjs";

// The shaded-section editor (change add-preparer-13614c-fields, design D7).
// The repo has no DOM stand-in, so the layer's DOM is covered by the browser
// story; what it decides — the values it reads and when Save, Close and
// Escape may act — is the pure part tested here.

const W2 = "form1[0].page2[0].incomeIncluded[0].formW2s[0]";
const W2_COUNT = "form1[0].page2[0].incomeIncluded[0].formW2sNumber[0]";
const ROW1 = "form1[0].page1[0].namesOf[0].Row1[0].qualifyingChildDependent[0]";
const NOTES = "form1[0].page2[0].IncomeIncludedComment[0].IncomeIncludedComments[0]";

// As pdf.js gives them: a Map keyed by full name, each an array of field
// dicts, with the non-terminal parents (type "") among them.
const fieldObjects = () =>
  new Map([
    ["form1[0]", [{ id: "1R", type: "", kidIds: ["2R"] }]],
    [W2, [{ id: "840R", type: "checkbox", value: "Off", exportValues: "1", name: W2 }]],
    [W2_COUNT, [{ id: "841R", type: "text", value: "", name: W2_COUNT }]],
    [ROW1, [{ id: "1010R", type: "text", value: "Yes", name: ROW1 }]],
    [NOTES, [{ id: "839R", type: "text", value: "", multiline: true, name: NOTES }]],
    ["form1[0].page2[0].incomeIncluded[0].formW2G[0]", [{ id: "850R", type: "checkbox", value: "Yes", exportValues: "Yes" }]],
  ]);

test("rawFromPdfjs reads ticked boxes", () => {
  const raw = rawFromPdfjs(fieldObjects(), new Map());
  assert.equal(raw[W2], false, "Off is not ticked");
  assert.equal(raw["form1[0].page2[0].incomeIncluded[0].formW2G[0]"], true, "an export value is ticked");
  assert.equal(raw[ROW1], "Yes");
  assert.equal(raw[W2_COUNT], "");
  assert.equal(Object.hasOwn(raw, "form1[0]"), false, "a parent is not a field");
  // Edited storage, keyed by annotation id, overrides the stored values.
  const storage = new Map([
    ["840R", { value: true }],
    ["841R", { value: "2" }],
    ["1010R", { value: "" }],
    ["850R", { value: false }],
    ["839R", { value: "收入说明\n第二行" }],
  ]);
  const edited = rawFromPdfjs(fieldObjects(), storage);
  assert.equal(edited[W2], true);
  assert.equal(edited[W2_COUNT], "2");
  assert.equal(edited[ROW1], "");
  assert.equal(edited["form1[0].page2[0].incomeIncluded[0].formW2G[0]"], false);
  assert.equal(edited[NOTES], "收入说明\n第二行");
  // pdf.js's own AnnotationStorage (getRawValue) and a plain object read the same.
  const own = { getRawValue: (id) => storage.get(id) };
  assert.deepEqual(rawFromPdfjs(fieldObjects(), own), edited);
  assert.deepEqual(rawFromPdfjs(Object.fromEntries(fieldObjects()), Object.fromEntries(storage)), edited);
  // A box whose storage holds an export-value string is ticked unless Off.
  assert.equal(rawFromPdfjs(fieldObjects(), new Map([["840R", { value: "Off" }]]))[W2], false);
  assert.equal(rawFromPdfjs(fieldObjects(), new Map([["840R", { value: "1" }]]))[W2], true);
});

// A session over a fake form: `values` is what the layer holds now.
function session({ onSave, explainRefusal } = {}) {
  const form = { values: { [W2]: false, [W2_COUNT]: "" } };
  const changes = [];
  const closed = [];
  const s = createEditorSession({
    read: () => ({ ...form.values }),
    onSave: onSave ?? (async () => {}),
    explainRefusal,
    onChange: (view) => changes.push(view),
    onClose: () => closed.push(true),
  });
  s.start();
  const edit = (name, value) => {
    form.values[name] = value;
    s.mark();
  };
  return { s, form, edit, changes, closed };
}

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

test("save is disabled until a change", async () => {
  let saves = 0;
  const { s, edit } = session({ onSave: async () => void (saves += 1) });
  assert.equal(s.view().saveEnabled, false);
  await s.save();
  assert.equal(saves, 0, "Save with nothing changed sends nothing");
  edit(W2, true);
  assert.equal(s.view().saveEnabled, true);
  assert.equal(s.view().dirty, true);
  // Changing it back is no change.
  edit(W2, false);
  assert.equal(s.view().saveEnabled, false);
  edit(W2_COUNT, "2");
  await s.save();
  assert.equal(saves, 1);
  // Saved, the editor stays open, and Save waits for the next change.
  assert.equal(s.view().status, "Saved");
  assert.equal(s.view().saveEnabled, false);
  assert.equal(s.view().closed, false);
  edit(W2_COUNT, "3");
  assert.equal(s.view().saveEnabled, true);
  assert.equal(s.view().status, "", "a new change clears Saved");
});

test("save is single-flight", async () => {
  const pending = deferred();
  let calls = 0;
  const { s, edit } = session({
    onSave: () => {
      calls += 1;
      return pending.promise;
    },
  });
  edit(W2, true);
  const first = s.save();
  const second = s.save();
  assert.equal(calls, 1);
  assert.equal(s.view().saving, true);
  assert.equal(s.view().saveEnabled, false);
  pending.resolve();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(s.view().status, "Saved");
});

test("a change while a save is out stays a change", async () => {
  const pending = deferred();
  let sent = null;
  const { s, edit } = session({
    onSave: (raw) => {
      sent = raw;
      return pending.promise;
    },
  });
  edit(W2, true);
  const saving = s.save();
  edit(W2_COUNT, "2");
  pending.resolve();
  await saving;
  assert.equal(sent[W2_COUNT], "", "the save carries what was there when Save was pressed");
  assert.equal(s.view().dirty, true);
  assert.equal(s.view().saveEnabled, true);
});

test("close with changes asks first", () => {
  const { s, edit, closed } = session();
  // Nothing changed: Close closes.
  const clean = session();
  clean.s.requestClose();
  assert.equal(clean.s.view().closed, true);
  assert.equal(clean.closed.length, 1);
  edit(W2, true);
  s.requestClose();
  assert.equal(s.view().asking, DISCARD_QUESTION);
  assert.equal(DISCARD_QUESTION, "Discard your changes?");
  assert.equal(s.view().closed, false);
  // Cancelling keeps the editor open, with the change.
  s.keepEditing();
  assert.equal(s.view().asking, null);
  assert.equal(s.view().closed, false);
  assert.equal(s.view().dirty, true);
  assert.equal(closed.length, 0);
  // Confirming closes.
  s.requestClose();
  s.confirmDiscard();
  assert.equal(s.view().closed, true);
  assert.equal(closed.length, 1);
  // Closed once only.
  s.requestClose();
  assert.equal(closed.length, 1);
});

test("escape asks like Close, keeps the question on a second Escape, and never during composition", () => {
  const { s, edit } = session();
  edit(W2, true);
  assert.equal(s.escape({ isComposing: true }), false, "an IME's own cancel");
  assert.equal(s.view().asking, null);
  assert.equal(s.escape({}), true);
  assert.equal(s.view().asking, DISCARD_QUESTION);
  // Escape on the question is "keep editing".
  assert.equal(s.escape({}), true);
  assert.equal(s.view().asking, null);
  assert.equal(s.view().closed, false);
  const clean = session();
  clean.s.escape({});
  assert.equal(clean.s.view().closed, true);
});

test("a stage refusal disables Save and keeps the edits", async () => {
  const refusal = Object.assign(new Error("This case is not being prepared."), { code: "INVALID_TRANSITION" });
  const { s, edit, form } = session({
    onSave: async () => {
      throw refusal;
    },
  });
  edit(W2, true);
  await s.save();
  assert.equal(s.view().status, "This case is not being prepared.");
  assert.equal(s.view().saveEnabled, false);
  assert.equal(s.view().dirty, true, "the edits are kept");
  assert.equal(form.values[W2], true);
  edit(W2_COUNT, "2");
  assert.equal(s.view().saveEnabled, false, "Save stays disabled");
  // The right that is no longer allowed is said without sending anything.
  let sent = 0;
  const gone = session({
    onSave: async () => void (sent += 1),
    explainRefusal: () => "Only the case's preparer does preparation work.",
  });
  gone.edit(W2, true);
  await gone.s.save();
  assert.equal(sent, 0);
  assert.equal(gone.s.view().status, "Only the case's preparer does preparation work.");
  assert.equal(gone.s.view().saveEnabled, false);
});

test("a CONFLICT shows the conflict sentence and keeps the edits", async () => {
  const { s, edit } = session({
    onSave: async () => {
      throw Object.assign(new Error("CONFLICT"), { code: "CONFLICT" });
    },
  });
  edit(W2, true);
  await s.save();
  assert.equal(CONFLICT_SENTENCE, "Saved elsewhere since you opened this. Close and reopen to see the latest.");
  assert.equal(s.view().status, CONFLICT_SENTENCE);
  assert.equal(s.view().dirty, true);
  assert.equal(s.view().saveEnabled, false, "the copy is stale: saving it again would meet the same conflict");
  // Close still asks first: the edits are there to copy.
  s.requestClose();
  assert.equal(s.view().asking, DISCARD_QUESTION);
});

test("a value the rules refuse names the field, and Save stays offered", async () => {
  const { s, edit } = session({
    onSave: async () => {
      throw Object.assign(new Error("W-2s # must be a whole number from 0 to 99."), { code: "VALIDATION" });
    },
  });
  edit(W2_COUNT, "2.0");
  await s.save();
  assert.equal(s.view().status, "W-2s # must be a whole number from 0 to 99.");
  assert.equal(s.view().saveEnabled, true);
  // Any other failure says its sentence, or Something went wrong.
  const other = session({
    onSave: async () => {
      throw {};
    },
  });
  other.edit(W2, true);
  await other.s.save();
  assert.equal(other.s.view().status, "Something went wrong.");
  assert.equal(other.s.view().saveEnabled, true);
});

test("the open failure sentence", () => {
  assert.equal(OPEN_FAILED, "The editor could not be opened. Try again, or use Download to fill elsewhere.");
});

test("every change reaches the layer", () => {
  const { s, edit, changes } = session();
  const before = changes.length;
  edit(W2, true);
  assert.ok(changes.length > before);
  assert.equal(changes.at(-1).dirty, true);
  s.requestClose();
  assert.equal(changes.at(-1).asking, DISCARD_QUESTION);
});
