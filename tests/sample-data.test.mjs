import test from "node:test";
import assert from "node:assert/strict";
import { makeSampleAnswers, fillBlankAnswers } from "../src/sample-data.mjs";
import { screening, submissionBlocker } from "../src/domain.mjs";
import { checkValue, findQuestion, missingToSubmit } from "../src/intake-catalogue.mjs";

test("fictional filling preserves edits and excludes identity", () => {
  const sample = makeSampleAnswers({ seed: 21, scenario: "ordinary" });
  const filled = fillBlankAnswers(
    {
      firstName: "My edit",
      lastName: "   ",
      address: null,
      email: "drop@example.com",
      ownerUserId: "forged",
      stage: "review_approved",
      unknown: "drop",
    },
    {
      ...sample,
      email: "also-drop@example.com",
      id: "forged",
      reference: "forged",
    },
  );
  assert.equal(filled.firstName, "My edit");
  assert.equal(filled.lastName, sample.lastName);
  assert.equal(filled.address, sample.address);
  assert.equal(screening(filled), "continue");
  for (const key of [
    "email",
    "ownerUserId",
    "id",
    "reference",
    "stage",
    "unknown",
  ])
    assert.equal(Object.hasOwn(filled, key), false);
});

test("fictional seed selection is deterministic and returns independent results", () => {
  const seedZero = makeSampleAnswers({ seed: 0, scenario: "ordinary" });
  const seedOne = makeSampleAnswers({ seed: 1, scenario: "ordinary" });
  const seedOneAgain = makeSampleAnswers({ seed: 1, scenario: "ordinary" });

  assert.equal(seedZero.firstName, "Mei");
  assert.equal(seedZero.household, "1");
  assert.equal(seedOne.firstName, "Jordan");
  assert.equal(seedOne.household, "2");
  assert.notDeepEqual(seedZero, seedOne);
  assert.deepEqual(seedOne, seedOneAgain);
  assert.notStrictEqual(seedOne, seedOneAgain);

  seedOne.firstName = "Changed locally";
  assert.equal(seedOneAgain.firstName, "Jordan");
});

test("ordinary fictional samples satisfy actual submission validation", () => {
  // The server's SUBMIT branch is the authority (tests/database-actions.mjs,
  // "payload whitelists and server-side screening reject unsupported answers").
  // This keeps the promise the helper makes locally: a generated ordinary
  // sample leaves nothing required blank and nothing screened out.
  const sample = makeSampleAnswers({ seed: 1, scenario: "ordinary" });
  assert.equal(submissionBlocker(sample), null);
});

test("exception samples are explicitly unsupported", () => {
  const sample = makeSampleAnswers({ seed: 8, scenario: "exception" });
  assert.equal(sample.other, "yes");
  assert.equal(screening(sample), "unsupported");
});

// ---------------------------------------------------------------------------
// Version 2 (spec 2026-09-30 §3.3)
// ---------------------------------------------------------------------------

const passesEveryCheck = (answers) => {
  for (const [id, value] of Object.entries(answers)) {
    const question = findQuestion(2, id);
    assert.ok(question, `${id} is a catalogue field`);
    assert.equal(checkValue(question, value), null, `${id} passes its check`);
  }
};

test("version 1 output is unchanged by the version option", () => {
  assert.deepEqual(makeSampleAnswers({ seed: 0, scenario: "ordinary" }), {
    service: "Drop-off",
    year: "2025",
    language: "English",
    firstName: "Mei",
    lastName: "Chen",
    address: "Sample address withheld",
    city: "Philadelphia",
    state: "PA",
    zip: "19107",
    residenceCity: "Philadelphia",
    residenceState: "PA",
    household: "1",
    rideshare: "yes",
    stocks: "no",
    other: "no",
    helper: "self",
    documents: "ready",
  });
  assert.deepEqual(
    makeSampleAnswers({ seed: 0, scenario: "ordinary", version: 1 }),
    makeSampleAnswers({ seed: 0, scenario: "ordinary" }),
  );
});

test("a version-2 sample passes every value check and leaves nothing to answer", () => {
  for (const seed of [0, 1, 2, 7, 99, -3]) {
    for (const married of [false, true]) {
      const answers = makeSampleAnswers({ seed, scenario: "ordinary", version: 2, married });
      passesEveryCheck(answers);
      assert.deepEqual(missingToSubmit(2, answers), [], `seed ${seed}, married ${married}`);
      assert.equal(Object.hasOwn(answers, "form_version"), false);
      assert.deepEqual(Object.keys(answers).filter((id) => id.startsWith("gcf_")), []);
      assert.equal(answers.marital_status, married ? "married" : "never_married");
      assert.match(answers.tp_phone, /^21555501\d\d$/);
      assert.deepEqual(answers.best_contact_time, ["weekday_evening"]);
      assert.equal(answers.hh.length, 1);
      assert.equal(answers.inc_wages, "yes");
    }
  }
  const single = makeSampleAnswers({ seed: 0, version: 2 });
  assert.equal(single.marital_status, "never_married");
  assert.equal(Object.keys(single).some((id) => id.startsWith("sp_")), false);
  const married = makeSampleAnswers({ seed: 0, version: 2, married: true });
  for (const id of ["married_last_day", "lived_apart_last_6mo", "sp_first_name", "sp_last_name", "sp_dob", "sp_job_title", "sp_phone"])
    assert.ok(Object.hasOwn(married, id), id);
  assert.match(married.sp_phone, /^\d{10}$/);
});

test("the version-2 sample is deterministic for a seed and varies with it", () => {
  const a = makeSampleAnswers({ seed: 3, version: 2 });
  const b = makeSampleAnswers({ seed: 3, version: 2 });
  assert.deepEqual(a, b);
  assert.notStrictEqual(a, b);
  assert.notStrictEqual(a.hh, b.hh);
  a.hh[0].first_name = "Changed";
  assert.notEqual(b.hh[0].first_name, "Changed");
  const other = makeSampleAnswers({ seed: 4, version: 2 });
  assert.notEqual(other.tp_phone, a.tp_phone);
  assert.notDeepEqual(other, a);
});

test("filling after choosing married leaves nothing required missing", () => {
  const single = makeSampleAnswers({ seed: 5, version: 2 });
  const chosen = { ...single, marital_status: "married" };
  for (const id of Object.keys(chosen)) if (id.startsWith("sp_")) delete chosen[id];
  assert.notDeepEqual(missingToSubmit(2, chosen), []);
  const filled = fillBlankAnswers(chosen, makeSampleAnswers({ seed: 5, version: 2, married: true }), 2);
  assert.deepEqual(missingToSubmit(2, filled), []);
  passesEveryCheck(filled);
});

test("the version-2 fill keeps answered values and fills null, empty text and empty lists", () => {
  const generated = makeSampleAnswers({ seed: 0, version: 2 });
  const filled = fillBlankAnswers(
    {
      tp_first_name: "My edit",
      tp_last_name: "  ",
      tp_middle_name: null,
      best_contact_time: [],
      addr_city: null,
      stage: "closed",
      firstName: "version 1 key",
    },
    { ...generated, ownerUserId: "forged" },
    2,
  );
  assert.equal(filled.tp_first_name, "My edit");
  assert.equal(filled.tp_last_name, generated.tp_last_name);
  assert.deepEqual(filled.best_contact_time, generated.best_contact_time);
  assert.equal(filled.addr_city, generated.addr_city);
  assert.equal(Object.hasOwn(filled, "tp_middle_name"), false, "blank on both sides is left out");
  for (const key of ["stage", "firstName", "ownerUserId"]) assert.equal(Object.hasOwn(filled, key), false, key);
});
