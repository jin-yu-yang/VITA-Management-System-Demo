import test from "node:test";
import assert from "node:assert/strict";
import { makeSampleAnswers, fillBlankAnswers } from "../src/sample-data.mjs";
import { screening, submissionBlocker } from "../src/domain.mjs";

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
