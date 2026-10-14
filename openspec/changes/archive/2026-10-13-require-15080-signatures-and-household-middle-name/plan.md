# Form 15080 Signatures and Household Middle Name: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- A client who consents to Form 15080 must sign it, and so must the spouse when married.
- A household member gets an optional middle name, shown as "First Middle Last" on the form and on the draft 13614-C.

**Architecture:**
- **Everything is a catalogue change.** Edit the two drafts in `docs/intake-questions/`. Then `npm run build:intake` regenerates `src/intake-catalogue-data.mjs` and writes migration `024_intake_catalogue_<hash8>.sql`. The browser and the database both read required-ness, show-if rules and group fields from the catalogue, so no rule code changes.
- **The only hand-written code** is one shared helper, `memberNameParts`, used by the three places that join a member's name.

**Tech Stack:** plain ES modules (no bundler), `node:test`, Postgres/Supabase (local stack `vitally-task2`), Playwright (the browser story), pdf-lib (the draft 13614-C).

**Spec:** this change's `specs/client-intake/spec.md` and `specs/draft-13614c/spec.md`. Read them with `design.md` (D1–D8), `proposal.md` and `tasks.md` in `openspec/changes/require-15080-signatures-and-household-middle-name/`.

## Global Constraints

- Fictional data only, in code, tests, fixtures and screenshots.
- Never edit an applied migration. The only migration here is the generated `024_intake_catalogue_<hash8>.sql`, and nothing is written by hand.
- **Never apply the migration without the user's OK.** `npm run db:migrate:test` runs only after the controller has reviewed 024 and the user has said yes in chat.
- Never run `supabase start` or `npx supabase start` from the repo root. The test stack is `vitally-task2` on port 54321.
- **Commands run with this PATH prefix:** `PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`. `VITALLY_NODE` and `VITALLY_NODE_BIN` come from `~/.zshrc`. If they're unset, use `VITALLY_NODE_BIN=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin` and `VITALLY_NODE=$VITALLY_NODE_BIN/node`.
- **繁體:** after any change to 简体 text (catalogue Chinese included), run `npm run build:hant` and commit `src/zh-hant.mjs`.
- **Git, inside the worktree:**
  - run each git command on its own, never chained with `&&` or `;`;
  - stage files by name, and never use `git add -A` or `git add .` (node_modules is a symlink);
  - after committing, confirm with `git rev-parse --short HEAD` and `git log --oneline -1`;
  - every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never write under `docs/superpowers/`, and never commit `.superpowers/`.
- **Exact wording (design D2, D5)**, copied verbatim into both drafts:
  - **standard Q6.1a:** `Middle name / 中间名`, with the tip `Leave blank if this person doesn't have one. / 如没有可留空。`
  - **senior Q6.1a:** `Middle name / 这个人的中间名`, with the tip `If this person doesn't have a middle name, leave this empty. / 有就写，没有就空着。`
  - **standard Q14.4 tip:** `Both of you need to sign. If your spouse can't sign, choose **I do not consent** above. / 需要您和配偶都签名。如配偶无法签名，请在上方选择**不同意**。`
  - **senior Q14.4 tip:** `You both need to sign. If your spouse can't sign, choose **No, I do not agree** above. / 您和您爱人都要签名。如果您爱人没办法签名，请在上面选**不同意**。`
- **What stays optional:** `gcf_consent`, `gcf_tp_date` and `gcf_sp_date`. Nothing auto-fills a date.
- **Document cards (`src/document-cards.mjs`) stay "First Last"** (design D6).

---

### Task 1: The catalogue drafts and the generated catalogue

**Files:**
- Modify: `docs/intake-questions/intake-questions.md`, the Q6.1/Q6.1b block (~line 257) and Q14.2/Q14.4 (~lines 642–653).
- Modify: `docs/intake-questions/intake-questions-senior-v2.md`, the Q6.1/Q6.1b block (~line 261) and Q14.2/Q14.4 (~lines 648–660).
- Generated: `src/intake-catalogue-data.mjs`, `supabase/migrations/024_intake_catalogue_<hash8>.sql`, `src/zh-hant.mjs`.
- Test: `tests/intake-build.test.mjs`.

**Interfaces:**
- Produces:
  - catalogue field `hh.middle_name` (type `text`, `required: false`, no `showIf`), the third entry of `hh.fields` after `member_id` and `first_name`;
  - `gcf_tp_signature.required === true` and `gcf_sp_signature.required === true`, with their `showIf` unchanged;
  - `gcf_sp_signature.tips` holding the D2 tip.

- [ ] **Step 1: Write the failing build tests**

In `tests/intake-build.test.mjs`, change the agreed optional list in `"every real question states required, and the optional set is the agreed list"`: remove `"gcf_tp_signature"` and `"gcf_sp_signature"`, and add `"hh.middle_name"`. Then add this test after `"the real catalogue gains hh.member_id, and gcf_sp_date waits for the spouse's signature"`:

```js
test("the real catalogue adds hh.middle_name and requires the 15080 signatures when shown", () => {
  const hh = findQuestion(COMMITTED, "hh");
  assert.deepEqual(hh.fields.slice(0, 4).map((f) => f.id), ["member_id", "first_name", "middle_name", "last_name"]);
  const middle = hh.fields.find((f) => f.id === "middle_name");
  assert.deepEqual([middle.type, middle.required, middle.showIf], ["text", false, undefined]);
  assert.deepEqual(middle.wording, {
    general: { en: "Middle name", zh: "中间名" },
    senior: { en: "Middle name", zh: "这个人的中间名" },
  });
  assert.deepEqual(middle.tips, {
    general: [{ en: "Leave blank if this person doesn't have one.", zh: "如没有可留空。" }],
    senior: [{ en: "If this person doesn't have a middle name, leave this empty.", zh: "有就写，没有就空着。" }],
  });

  const tp = findQuestion(COMMITTED, "gcf_tp_signature");
  assert.equal(tp.required, true);
  assert.deepEqual(tp.showIf, [{ field: "gcf_consent", op: "eq", value: "yes" }]);
  const sp = findQuestion(COMMITTED, "gcf_sp_signature");
  assert.equal(sp.required, true);
  assert.deepEqual(sp.showIf, [
    { field: "gcf_consent", op: "eq", value: "yes" },
    { field: "marital_status", op: "eq", value: "married" },
  ]);
  assert.deepEqual(sp.tips, {
    general: [{
      en: "Both of you need to sign. If your spouse can't sign, choose **I do not consent** above.",
      zh: "需要您和配偶都签名。如配偶无法签名，请在上方选择**不同意**。",
    }],
    senior: [{
      en: "You both need to sign. If your spouse can't sign, choose **No, I do not agree** above.",
      zh: "您和您爱人都要签名。如果您爱人没办法签名，请在上面选**不同意**。",
    }],
  });
  for (const id of ["gcf_consent", "gcf_tp_date", "gcf_sp_date"])
    assert.equal(findQuestion(COMMITTED, id).required, false, id);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `"$VITALLY_NODE" --test tests/intake-build.test.mjs`
Expected: FAIL. `hh.fields` has no `middle_name`, and both signatures are `required: false`.

- [ ] **Step 3: Edit the standard draft**

In `docs/intake-questions/intake-questions.md`, insert this block between the Q6.1 block (`hh[i].first_name`) and `**Q6.1b** Last name / 姓`, with one blank line around it:

```markdown
**Q6.1a** Middle name / 中间名
`hh[i].middle_name` · Text · Optional
> Tip: Leave blank if this person doesn't have one. / 如没有可留空。
```

Change Q14.2's ID line to ``gcf_tp_signature` · Signature · Required``. Change Q14.4's block to:

```markdown
**Q14.4** Secondary taxpayer (spouse) signature (type full name) / 配偶签名（输入全名）
`gcf_sp_signature` · Signature · Required
**Show if** `gcf_consent = yes` AND `marital_status = married`
> Tip: Both of you need to sign. If your spouse can't sign, choose **I do not consent** above. / 需要您和配偶都签名。如配偶无法签名，请在上方选择**不同意**。
```

A tip after the `Show if` line is the order Q9.1a already uses (`Show if inc_wages = yes`, then its Tip).

- [ ] **Step 4: Edit the senior draft**

In `docs/intake-questions/intake-questions-senior-v2.md`, insert this between Q6.1 (`这个人的名字（名）`) and Q6.1b:

```markdown
**Q6.1a** Middle name / 这个人的中间名
`hh[i].middle_name` · Text · Optional
> Tip: If this person doesn't have a middle name, leave this empty. / 有就写，没有就空着。
```

Change Q14.2's ID line to ``gcf_tp_signature` · Signature · Required``. Change Q14.4's ID line to ``gcf_sp_signature` · Signature · Required``, and add under its `Show if` line:

```markdown
> Tip: You both need to sign. If your spouse can't sign, choose **No, I do not agree** above. / 您和您爱人都要签名。如果您爱人没办法签名，请在上面选**不同意**。
```

The senior draft's structure must equal the standard draft's. The build checks that.

- [ ] **Step 5: Build the catalogue and the 繁體 map**

```bash
ls supabase/migrations
```
Expected: the newest file is `023_remove_intake_v1.sql`. If a `024_*` already exists on this branch's base, stop and report it.

```bash
npm run build:intake
npm run build:hant
```
Expected: `src/intake-catalogue-data.mjs` changes, a new `supabase/migrations/024_intake_catalogue_<hash8>.sql` exists, and `src/zh-hant.mjs` changes (the new Chinese). **Do not run `npm run db:migrate:test`.**

- [ ] **Step 6: Run the unit suite**

Run: `npm test`
Expected: the new build test and the optional-list test pass. If another unit test lists the `hh` fields or counts catalogue strings, add `middle_name` there with the same values and say so in the report. If it lists required question IDs, add the two signatures there. Everything else passes.

- [ ] **Step 7: Commit**

```bash
git add docs/intake-questions/intake-questions.md docs/intake-questions/intake-questions-senior-v2.md src/intake-catalogue-data.mjs src/zh-hant.mjs tests/intake-build.test.mjs
git add supabase/migrations/024_intake_catalogue_<hash8>.sql
git commit -m "Catalogue: household middle name, Form 15080 signatures required when shown (migration 024, not applied)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git rev-parse --short HEAD
```
(Use the real file name for 024. Stage any other test file Step 6 touched by name.)

---

### Task 2: Required signatures: the browser and the database agree

**Files:**
- Test: `tests/intake-catalogue.test.mjs` (after `test("missingToSubmit", …)`, ~line 108).
- Test: `tests/intake-form.test.mjs` (near the `stepRollup` tests, ~line 470; `ctx` is defined at ~line 348).
- Test: `tests/database-intake.mjs`: in `test("version-2 intake: versions, answers, submit and contacts", …)` after the subtest `"a household member missing a required field blocks SUBMIT"`, and in the parity loop's `sets` array (~line 532).

**Interfaces:**
- Consumes:
  - Task 1's catalogue;
  - `missingToSubmit(version, answers, contact?)` and `substepStatus(id, { answers, visited, cards })` → `{ key, text }`;
  - from `tests/database-intake.mjs`: `completeAnswers(base, { complete })`, which fills every required visible question with sample values (so with `gcf_consent: "yes"` it now fills `gcf_tp_signature: "Sample"`), plus `member(overrides)`, `v2Case`, `save`, `caseRow` and `rejected`.

- [ ] **Step 1: Unit tests for the missing-answers check**

Add to `tests/intake-catalogue.test.mjs`:

```js
test("missingToSubmit: the Form 15080 signatures are required when shown", () => {
  const section14 = (answers) => missingToSubmit(2, answers).filter((id) => id.startsWith("gcf_")).sort();
  assert.deepEqual(section14({ gcf_consent: "yes" }), ["gcf_tp_signature"]);
  assert.deepEqual(section14({ gcf_consent: "yes", gcf_tp_signature: "  " }), ["gcf_tp_signature"]);
  assert.deepEqual(section14({ gcf_consent: "yes", marital_status: "married" }), ["gcf_sp_signature", "gcf_tp_signature"]);
  assert.deepEqual(section14({ gcf_consent: "yes", marital_status: "married", gcf_tp_signature: "Mei Lin" }), ["gcf_sp_signature"]);
  assert.deepEqual(section14({ gcf_consent: "yes", marital_status: "married", gcf_tp_signature: "Mei Lin", gcf_sp_signature: "Wei Lin" }), []);
  assert.deepEqual(section14({ gcf_consent: "yes", marital_status: "never_married", gcf_tp_signature: "Mei Lin" }), []);
  assert.deepEqual(section14({ gcf_consent: "no" }), []);
  assert.deepEqual(section14({}), []);
});
```

Add to `tests/intake-form.test.mjs`:

```js
test("substepStatus: refund.consent isn't Done while a required signature is missing", () => {
  const status = (answers) =>
    substepStatus("refund.consent", { answers, visited: ["refund.consent"], cards: cardsFor(answers) }).key;
  assert.equal(status({ gcf_consent: "yes" }), "needs");
  assert.equal(status({ gcf_consent: "yes", marital_status: "married", gcf_tp_signature: "Mei Lin" }), "needs");
  assert.equal(
    status({ gcf_consent: "yes", marital_status: "married", gcf_tp_signature: "Mei Lin", gcf_sp_signature: "Wei Lin" }),
    "done",
  );
  assert.equal(status({ gcf_consent: "yes", marital_status: "never_married", gcf_tp_signature: "Mei Lin" }), "done");
  assert.equal(status({ gcf_consent: "no" }), "done");
  assert.equal(status({}), "done");
});
```

- [ ] **Step 2: Run the unit suite**

Run: `npm test`
Expected: PASS. These tests pin behaviour that Task 1's catalogue already gives. To confirm they would have caught the bug, temporarily set `"required": true` back to `false` for `gcf_tp_signature` in `src/intake-catalogue-data.mjs`, see the two new tests fail, then restore the file (`git checkout src/intake-catalogue-data.mjs`).

- [ ] **Step 3: Database tests**

In `tests/database-intake.mjs`, add these entries to the parity loop's `sets` array (the loop compares `intake_missing` with `missingToSubmit`):

```js
        [{ gcf_consent: "yes" }, {}],
        [{ gcf_consent: "yes", marital_status: "married", gcf_tp_signature: "Mei Lin" }, {}],
        [completeAnswers({ gcf_consent: "no" }), {}],
        [completeAnswers({ has_household_members: "yes", hh: [(({ middle_name: _m, ...rest }) => rest)(member())] }), {}],
```

After the subtest `"a household member missing a required field blocks SUBMIT"`, add:

```js
    await t.test("Form 15080: consent needs the signatures, whoever fills the application", async () => {
      const signedSingle = completeAnswers({ gcf_consent: "yes" });
      assert.equal(signedSingle.gcf_tp_signature, "Sample");
      const { gcf_tp_signature: _tp, ...noPrimary } = signedSingle;
      const signedMarried = completeAnswers({ marital_status: "married", gcf_consent: "yes" });
      assert.equal(signedMarried.gcf_sp_signature, "Sample");
      const { gcf_sp_signature: _sp, ...noSpouse } = signedMarried;
      const declined = completeAnswers({ gcf_consent: "no" });
      assert.equal("gcf_tp_signature" in declined, false);

      const submitted = async (answers, actor = f.applicantA, personId = null, options = {}) => {
        const { caseId } = await v2Case(f, actor, options);
        await save(f, caseId, answers, actor, personId);
        await f.act(actor, caseId, personId, "SUBMIT", { confirmed: true });
        return caseId;
      };
      await assert.rejects(submitted(noPrimary), rejected("VALIDATION"));
      await assert.rejects(submitted(noSpouse), rejected("VALIDATION"));
      for (const answers of [signedSingle, signedMarried, declined])
        assert.equal((await caseRow(f, await submitted(answers))).stage, "received");

      // An office-filled application meets the same rule (act_submit runs intake_missing for both).
      const byOffice = (answers) => submitted(answers, f.presenter, f.sam, { mode: "assisted", personId: f.sam });
      await assert.rejects(byOffice(noPrimary), rejected("VALIDATION"));
      assert.equal((await caseRow(f, await byOffice(signedSingle))).stage, "received");
    });

    await t.test("a household member's middle name is saved", async () => {
      const { caseId } = await v2Case(f);
      await save(f, caseId, { has_household_members: "yes", hh: [member({ middle_name: "Mei" })] });
      assert.equal((await caseRow(f, caseId)).answers.hh[0].middle_name, "Mei");
    });
```

In `tests/support/intake-value-cases.mjs`, after the existing `both("hh", …)` rows (~line 141), add. `tests/intake-form.test.mjs` (~line 902) runs the browser side, and `tests/database-intake.mjs` (~line 490) runs the database side.

```js
  both("hh", [member({ middle_name: "Mei" })], true),
  both("hh", [member({ middle_name: "x".repeat(200) })], true),
  both("hh", [member({ middle_name: "x".repeat(201) })], false),
  both("hh", [member({ middle_name: 7 })], false),
```

If the database side disagrees with any of these four after 024 is applied (Step 6), stop and report it. Don't change the expected values to match.

- [ ] **Step 4: Commit the tests**

The database tests can't run until 024 is applied (Step 6). Commit them now, and if Step 6 shows a mistake in them, fix it in a follow-up commit.

```bash
git add tests/intake-catalogue.test.mjs tests/intake-form.test.mjs tests/database-intake.mjs tests/support/intake-value-cases.mjs
git commit -m "Tests: Form 15080 signatures required when shown, client and office; household middle name saved

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git rev-parse --short HEAD
```

- [ ] **Step 5: STOP before applying 024**

Report to the controller with status DONE_WITH_CONCERNS: "024 is generated and committed but not applied; the database tests need it". Don't run `npm run db:migrate:test`.

The controller then:
1. reviews `024_intake_catalogue_<hash8>.sql`. It should only call `vitally_private.load_intake_catalogue(2::smallint, '<catalogue json>')`, the same shape as 022, with the new field and flags in the JSON;
2. asks the user in chat, saying that once 024 is on `vitally-task2`, `main`'s `npm run test:database` fails "the field table matches the catalogue" until this change merges (design, Risks);
3. after their yes, resumes this implementer for Step 6.

- [ ] **Step 6: Apply 024 and run the database suite (after the user's OK)**

```bash
npm run db:migrate:test
npm run test:database
```
Expected: 024 applies. All database tests pass, including `"the field table matches the catalogue"` (which now sees `hh.middle_name` and the two `required_to_submit = true` rows), the new parity sets, and the two new subtests.

---

### Task 3: One name rule for a household member

**Files:**
- Modify: `src/intake-catalogue.mjs` (next to `isAnswered`, ~line 51).
- Modify: `src/intake-form.mjs:740` (`memberLine`) and its import list at lines 8–11.
- Modify: `src/draft-form.mjs:312` (`memberLine`) and `src/draft-form.mjs:429` (the `nameFirstLast` row), and its import at line 11.
- Test: `tests/intake-catalogue.test.mjs`, `tests/intake-form.test.mjs` (~line 724), `tests/draft-form.test.mjs` (after `"household rows 1–4 on the form, members 5–6 in Additional Comments"`).

**Interfaces:**
- Produces: `memberNameParts(member) → string[]`, exported from `src/intake-catalogue.mjs`. It returns the answered values of `first_name`, `middle_name` and `last_name`, in that order. A null or undefined member gives `[]`.

- [ ] **Step 1: Write the failing tests**

In `tests/intake-catalogue.test.mjs`, add `memberNameParts` to the import list, then:

```js
test("memberNameParts: first, middle, last, skipping empty parts", () => {
  assert.deepEqual(memberNameParts({ first_name: "Ana", middle_name: "Mei", last_name: "Lin" }), ["Ana", "Mei", "Lin"]);
  assert.deepEqual(memberNameParts({ first_name: "Ana", last_name: "Lin" }), ["Ana", "Lin"]);
  assert.deepEqual(memberNameParts({ first_name: "Ana", middle_name: "  ", last_name: "Lin" }), ["Ana", "Lin"]);
  assert.deepEqual(memberNameParts({ middle_name: "Mei" }), ["Mei"]);
  assert.deepEqual(memberNameParts({}), []);
  assert.deepEqual(memberNameParts(null), []);
});
```

In `tests/intake-form.test.mjs`, after the existing `formatAnswer(HH, [...])` assertion (~line 724), add:

```js
  assert.equal(
    formatAnswer(HH, [{ member_id: "0123456789abcdef0123456789abcdef", first_name: "Xiao Ming", middle_name: "Q", last_name: "Wang", relationship: "son_daughter", dob: "2015-03-14", months_lived: "12" }]),
    `Xiao Ming Q Wang · ${relationship} · born Mar 14, 2015 · lived with you 12 months`,
  );
```

In `tests/draft-form.test.mjs`, add:

```js
test("a household member's middle name is on the 13614-C row and in the comment lines", () => {
  const withMiddle = SIX.map((m, i) => (i === 0 ? { ...m, middle_name: "Mei" } : i === 4 ? { ...m, middle_name: "Q" } : m));
  const { text, comments } = draft({ ...MARRIED, hh: withMiddle });
  const name = (k) => text[F(`page1[0].namesOf[0].Row${k}[0].nameFirstLast[0]`)];
  assert.equal(name(1), "Ana Mei Lin");
  assert.equal(name(2), "Bo Lin", "no middle name: unchanged");
  assert.match(comments, /Person 5: Eva Q Lin · Grandchild/);
  assert.match(comments, /Person 6: Fei Lin · /);
});
```

(The taxpayer's and spouse's middle initials are already pinned by this file's existing tests: `tp_middle_name: "qing"` → `"Q"`. Leave them as they are.)

- [ ] **Step 2: Run them and see them fail**

Run: `npm test`
Expected: FAIL. `memberNameParts` isn't exported, the member line reads "Xiao Ming Wang", and the row reads "Ana Lin".

- [ ] **Step 3: Implement**

In `src/intake-catalogue.mjs`, after `isAnswered`:

```js
/** A household member's name parts, first, middle and last, skipping unanswered ones. */
export const memberNameParts = (member) =>
  [member?.first_name, member?.middle_name, member?.last_name].filter(isAnswered);
```

In `src/intake-form.mjs`, add `memberNameParts` to the import from `./intake-catalogue.mjs`, and in `memberLine` replace

```js
  const name = [member.first_name, member.last_name].filter(isAnswered).join(" ");
```
with
```js
  const name = memberNameParts(member).join(" ");
```

In `src/draft-form.mjs`, add `memberNameParts` to the import from `./intake-catalogue.mjs`. In `memberLine` (~line 312), replace

```js
  const name = [member.first_name, member.last_name].filter(isAnswered).map(oneLine).join(" ");
```
with
```js
  const name = memberNameParts(member).map(oneLine).join(" ");
```

and in the rows loop (~line 429), replace

```js
    put(rowBox(k, "nameFirstLast"), [member.first_name, member.last_name].filter(isAnswered).map(oneLine).join(" "));
```
with
```js
    put(rowBox(k, "nameFirstLast"), memberNameParts(member).map(oneLine).join(" "));
```

Don't touch `src/document-cards.mjs`.

- [ ] **Step 4: Run them and see them pass**

Run: `npm test`
Expected: PASS, the whole unit suite.

- [ ] **Step 5: Commit**

```bash
git add src/intake-catalogue.mjs src/intake-form.mjs src/draft-form.mjs tests/intake-catalogue.test.mjs tests/intake-form.test.mjs tests/draft-form.test.mjs
git commit -m "A household member's name reads first, middle, last on the form and the draft 13614-C

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git rev-parse --short HEAD
```

---

### Task 4: The browser story

**Files:**
- Test: `tests/browser.mjs`, in the client's own version-2 walk, inside the block that defines `jump`, `choose`, `box`, `answer` and `rail` (~lines 2709–2902). The 15080 part is at ~lines 3563–3613.

**Interfaces:**
- Consumes:
  - Task 1's catalogue, Task 3's name rule, and 024 applied (Task 2, Step 6);
  - story helpers: `jump(substepId)`, `choose(id, value)`, `box(id)` (= `#field-client-${id}`), `answer(key)`, which returns the saved answer as text (`answers->>key`), so `hh` comes back as JSON text;
  - `rail(substepId)` → `{ className, text }` or `null`, plus `waitFor(page, what, fn, arg, ms)`, `waitForQuiet(page)` and `RENDER_MS`.

- [ ] **Step 1: The household middle name**

Just before `await jump("refund.consent");` (~line 3563), add the code below. The "Fill fictional details" press at `tests/browser.mjs:3553` runs just before this point, and the sample always has one household member (`src/sample-data.mjs:59`). So `household.members` is in the rail, and member 0 exists.

```js
        // A household member's middle name sits between first and last name
        // (change require-15080-signatures-and-household-middle-name).
        await jump("household.members");
        await waitFor(
          page,
          "the first member's middle-name box",
          () => Boolean(document.querySelector('[data-q="hh"][data-member="0"][data-sub="middle_name"]')),
          undefined,
          RENDER_MS,
        );
        assert.deepEqual(
          await page.evaluate(() =>
            [...document.querySelectorAll('[data-q="hh"][data-member="0"][data-sub]')]
              .map((el) => el.dataset.sub)
              .filter((sub) => sub !== "member_id")
              .slice(0, 3),
          ),
          ["first_name", "middle_name", "last_name"],
        );
        await page.locator('[data-q="hh"][data-member="0"][data-sub="middle_name"]').fill("Q");
        await page.keyboard.press("Tab");
        await waitForQuiet(page);
        assert.equal(JSON.parse(await answer("hh"))[0].middle_name, "Q");
```

- [ ] **Step 2: The 15080 sub-step waits for both signatures**

In the 15080 part, replace

```js
        await box("gcf_tp_signature").fill("Mei Lin");
        await box("gcf_sp_signature").fill("Wei Lin");
```
with
```js
        // Consenting with only the primary signature leaves the sub-step
        // Needs answers: a married client's spouse signs too.
        await box("gcf_tp_signature").fill("Mei Lin");
        await page.keyboard.press("Tab");
        await jump("notes.anything");
        assert.deepEqual(await rail("refund.consent"), { className: "rail-status is-needs", text: "Needs answers" });
        await jump("refund.consent");
        await box("gcf_sp_signature").fill("Wei Lin");
```

After the existing lines

```js
        await jump("notes.anything");
        assert.equal(await answer("gcf_consent"), "yes");
        assert.equal(await answer("gcf_sp_signature"), "Wei Lin");
```
add
```js
        assert.deepEqual(await rail("refund.consent"), { className: "rail-status is-done", text: "Done" });
```

The existing check that `gcf_sp_date` isn't on the page before the Tab still holds: the page is drawn fresh with the spouse signature empty.

- [ ] **Step 3: Run the story**

Run: `npm run test:browser` (about 11–16 minutes). Run it in the background, and don't poll it in a loop.
Expected: PASS. If a later part of the story checks the household answers or the draft PDF's row text, update its expected name to include "Q", and say so in the report.

- [ ] **Step 4: Commit**

```bash
git add tests/browser.mjs
git commit -m "Story: household middle name; the 15080 sub-step waits for both signatures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git rev-parse --short HEAD
```

---

### Task 5: Docs and the full check

**Files:**
- Modify: `docs/setup.md` (~line 310, "Twenty-three migrations"; the migrations table after the `023_remove_intake_v1.sql` row, ~line 341; the counts table, ~line 407; and the "last verified" sentence above it, ~line 400).
- Modify: `docs/developer/database.md` (the migrations table after the 023 row, ~line 52).
- Modify: `docs/developer/README.md:98` (`migrations/001-023`).
- Modify: `docs/developer/frontend.md` (~line 437, "Unit (899)"; and one sentence in the intake catalogue section).

**Interfaces:**
- Consumes: the counts printed by Step 1, and Task 4's browser count.

- [ ] **Step 1: Run every check that covers the change**

```bash
npm test
npm run build:hant -- --check
npm run build:intake
git status --short
npx openspec validate --all
npm run test:database
npm run test:auth-browser
```
Expected:
- everything passes;
- `npm run build:intake` leaves `git status` clean;
- `test:browser`: use Task 4's passing run and its count. Re-run it only if code changed after Task 4's commit.
- `npm run test:auth-browser` runs even though sign-in is untouched, so that all four counts in `docs/setup.md` are re-verified on this change.

- [ ] **Step 2: Edit the docs**

- `docs/setup.md`:
  - "Twenty-three migrations" becomes "Twenty-four migrations";
  - after the 023 row, add `| \`024_intake_catalogue_<hash8>.sql\` | Generated by \`npm run build:intake\`: a household member's optional middle name, and the Form 15080 signatures required when the client consents (the spouse's too when married) |`, with the real hash in the file name.
- `docs/developer/database.md`: after the 023 row, add `| \`024_intake_catalogue_<hash8>.sql\` | Generated: the household middle name (\`hh.middle_name\`), and \`gcf_tp_signature\`/\`gcf_sp_signature\` required to submit when shown |`.
- `docs/developer/README.md:98`: `001-023` becomes `001-024`.
- `docs/developer/frontend.md`: in the section that describes the catalogue, or required questions and show-if, add one sentence: "A required question counts only while it is shown: the Form 15080 signatures are required once the client consents, and the spouse's only when married."
- The counts: fill in Step 1's numbers in `docs/setup.md`'s table and `docs/developer/frontend.md`'s "Unit (N)". The "last verified" sentence names this change, `require-15080-signatures-and-household-middle-name`, with migration 024 applied and today's date.

- [ ] **Step 3: Commit**

```bash
git add docs/setup.md docs/developer/database.md docs/developer/README.md docs/developer/frontend.md
git commit -m "Docs: migration 024, the counts, required-when-shown 15080 signatures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git rev-parse --short HEAD
```

---

## Self-review

- **Spec coverage:**
  - `client-intake` "A household member may have a middle name": Task 1 (the field), Task 2 (saved; the parity set without it), Task 3 (the member line), Task 4 (the form).
  - `client-intake` "A client who consents to Form 15080 signs it": Task 1 (the flags and tip), Task 2 (missing, the sub-step mark, submit refused or accepted for the client and the office), Task 4 (the rail mark).
  - `draft-13614c` "A household member's name on the draft shows first, middle and last name": Task 3, the row and the comment lines, with and without a middle name.
- **Placeholder scan:** the only variable is the generated file name `024_intake_catalogue_<hash8>.sql`, which the build decides. Each step names the real name being used.
- **Names:** `memberNameParts` is used in Task 3 throughout. The catalogue IDs are `hh.middle_name`, `gcf_tp_signature` and `gcf_sp_signature` everywhere.
