import test from "node:test";
import assert from "node:assert/strict";
import { makeSampleAnswers, fillBlankAnswers } from "../src/sample-data.mjs";
import { checkValue, findQuestion, isMemberId, missingToSubmit } from "../src/intake-catalogue.mjs";

const passesEveryCheck = (answers) => {
  for (const [id, value] of Object.entries(answers)) {
    const question = findQuestion(2, id);
    assert.ok(question, `${id} is a catalogue field`);
    assert.equal(checkValue(question, value), null, `${id} passes its check`);
  }
};

test("a version-2 sample passes every value check and leaves nothing to answer", () => {
  for (const seed of [0, 1, 2, 7, 99, -3]) {
    for (const married of [false, true]) {
      const answers = makeSampleAnswers({ seed, married });
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
  const single = makeSampleAnswers({ seed: 0 });
  assert.equal(single.marital_status, "never_married");
  assert.equal(Object.keys(single).some((id) => id.startsWith("sp_")), false);
  const married = makeSampleAnswers({ seed: 0, married: true });
  for (const id of ["married_last_day", "lived_apart_last_6mo", "sp_first_name", "sp_last_name", "sp_dob", "sp_job_title", "sp_phone"])
    assert.ok(Object.hasOwn(married, id), id);
  assert.match(married.sp_phone, /^\d{10}$/);
});

test("every version-2 sample member carries a well-formed id, unique in the answers and fixed by the seed", () => {
  for (const seed of [0, 1, 2, 3, 4, 5, -3]) {
    for (const married of [false, true]) {
      const answers = makeSampleAnswers({ seed, married });
      const ids = answers.hh.map((member) => member.member_id);
      assert.ok(ids.length > 0);
      for (const id of ids) assert.equal(isMemberId(id), true, `seed ${seed}: ${id}`);
      assert.equal(new Set(ids).size, ids.length);
      assert.deepEqual(makeSampleAnswers({ seed, married }).hh.map((m) => m.member_id), ids);
    }
  }
});

test("the version-2 sample is deterministic for a seed and varies with it", () => {
  const a = makeSampleAnswers({ seed: 3 });
  const b = makeSampleAnswers({ seed: 3 });
  assert.deepEqual(a, b);
  assert.notStrictEqual(a, b);
  assert.notStrictEqual(a.hh, b.hh);
  a.hh[0].first_name = "Changed";
  assert.notEqual(b.hh[0].first_name, "Changed");
  const other = makeSampleAnswers({ seed: 4 });
  assert.notEqual(other.tp_phone, a.tp_phone);
  assert.notDeepEqual(other, a);
});

test("filling after choosing married leaves nothing required missing", () => {
  const single = makeSampleAnswers({ seed: 5 });
  const chosen = { ...single, marital_status: "married" };
  for (const id of Object.keys(chosen)) if (id.startsWith("sp_")) delete chosen[id];
  assert.notDeepEqual(missingToSubmit(2, chosen), []);
  const filled = fillBlankAnswers(chosen, makeSampleAnswers({ seed: 5, married: true }));
  assert.deepEqual(missingToSubmit(2, filled), []);
  passesEveryCheck(filled);
});

test("the version-2 fill keeps answered values and fills null, empty text and empty lists", () => {
  const generated = makeSampleAnswers({ seed: 0 });
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
    { ...generated, ownerUserId: "forged", id: "forged", reference: "forged" },
  );
  assert.equal(filled.tp_first_name, "My edit");
  assert.equal(filled.tp_last_name, generated.tp_last_name);
  assert.deepEqual(filled.best_contact_time, generated.best_contact_time);
  assert.equal(filled.addr_city, generated.addr_city);
  assert.equal(Object.hasOwn(filled, "tp_middle_name"), false, "blank on both sides is left out");
  for (const key of ["stage", "firstName", "ownerUserId", "id", "reference"]) assert.equal(Object.hasOwn(filled, key), false, key);
});
