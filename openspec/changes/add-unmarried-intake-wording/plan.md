# Unmarried Intake Wording: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a client who isn't married reads no "spouse" in Q5.2, Q9.1a, Q12.4, the nine income/expense/event leads or section 6's intro, and every screen showing one application uses the wording that client saw.

**Architecture:**
- **Drafts and builder:** the drafts gain `> Not married:` lines and a `**Intro text (not married):**` block. The builder turns them, and its lead constants, into new catalogue keys `wordingUnmarried`, `leadUnmarried` and `introUnmarried`.
- **The rule and the readers:** `src/intake-catalogue.mjs` owns the rule `spouseShown(answers)` (= `who.spouseShowIf`, unanswered = not married) and the three readers `wording()`, `leadOf()` and `introOf()`. Each takes an optional `answers`.
- **The screens:** each one passes its application's answers.
- **Database:** only the generated text migration 025.

**Tech Stack:** plain ES modules, `node:test`, the Markdown catalogue drafts plus `tools/build-intake-catalogue.mjs`, Supabase/Postgres (local stack `vitally-task2`), Playwright (the story).

**Spec:** in `openspec/changes/add-unmarried-intake-wording/`:
- `specs/client-intake/spec.md` and `specs/draft-13614c/spec.md`;
- `design.md` (D1–D8);
- `brainstorm.md` (Q4 is the wording table);
- `proposal.md`, `tasks.md`.

## Global Constraints

- Fictional data only, in code, tests, fixtures and screenshots.
- **The only migration is the generated `025_intake_catalogue_<hash8>.sql`.**
  - Never write SQL by hand, and never edit an applied migration.
  - Implementers never run `npm run db:migrate:test`, `npm run test:database`, `npm run test:auth-browser` or `npm run test:browser`. The controller runs every stack or browser suite, and applies 025 only after the user says yes in chat.
- Never run `supabase start` or `npx supabase start` from the repo root.
- **Commands:** `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && <one command>`.
- **繁體:** after any 简体 change (catalogue Chinese included), run `npm run build:hant` and commit `src/zh-hant.mjs`.
- **Git, inside the worktree:**
  - run each git command on its own, never chained with `&&` or `;`;
  - stage files by name, never `git add -A` or `git add .`;
  - confirm each commit with `git rev-parse --short HEAD` and `git log --oneline -1`;
  - **every commit message ends with a blank line and exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, whatever model you are.**
- Never write under `docs/superpowers/`, and never commit `.superpowers/`.
- **The rule (design D3):** married means `marital_status = married`, the same `CATALOGUE.fixedOptions.who.spouseShowIf` that offers "My spouse". Every other value, and an unanswered one, means not married.
- **The texts (brainstorm Q4, design D6), exact:**

  | Item | Version | Unmarried English | Unmarried 简体 |
  |---|---|---|---|
  | `claimed_by_other` | standard | Can anyone else (such as a parent or adult child) claim you as a dependent on their tax return? | 是否有其他人（如父母或成年子女）可以在其报税表上将您列为受抚养人？ |
  | `claimed_by_other` | senior | Can someone else (like a parent or grown child) list you as a dependent on their tax return? | 有没有别人（比如您的父母或成年子女）报税时，会把您写进他们的税表里，算作由他们养活的人？ |
  | `inc_wages_job_count` | standard | How many jobs did you have in 2025? | 2025 年您共有几份工作？ |
  | `inc_wages_job_count` | senior | How many jobs did you have in 2025? | 2025 年，您一共做了几份工作？ |
  | `opt_veteran` | standard | Are you a veteran of the U.S. Armed Forces? | 您是否为美国退伍军人？ |
  | `opt_veteran` | senior | Are you a U.S. military veteran? | 您是美国退伍军人吗？ |
  | income leads (`RECEIVED`) | both | Did you receive any of these in 2025? | 2025 年，您是否有以下收入？ |
  | expense leads (`PAID`) | both | Did you pay for any of these in 2025? | 2025 年，您是否支付过以下费用？ |
  | events lead (`HAPPENED`) | both | Did any of these happen to you in 2025? | 2025 年，您是否发生过以下事项？ |

  **Senior married lead Chinese:**
  - 2025 年，您或您爱人是否有以下收入？
  - 2025 年，您或您爱人是否支付过以下费用？
  - 2025 年，您或您爱人是否发生过以下事项？

  The standard married leads keep 您或配偶, and the married English doesn't change.

  **The direct-deposit card (design D7):**
  - not married: `The account must be in your name.` / `账户必须是您名下的账户。`, office `The account must be in the client's name.`;
  - married: today's text, unchanged.

  **Section 6, not-married intro:**
  - standard: `List **everyone who lived with you in 2025**, and **anyone you financially supported** who did not live with you.` / `请列出 2025 年与您同住的所有人，以及未与您同住但由您提供经济支持的人。`
  - senior: the senior intro with " (not your spouse)" removed from line 1 and （您爱人除外） removed from the Chinese, with every other line unchanged:
    - line 1 reads `Tell us about **everyone who lived with you in 2025**.`
    - the Chinese line reads `请告诉我们 2025 年和您住在一起的所有人，以及虽然不住在一起、但您出钱养的人。`

---

### Task 1: The catalogue: unmarried text in the drafts and the builder

**Files:**
- Modify: `tools/build-intake-catalogue.mjs`:
  - the lead constants and `questions()` (~lines 62–75);
  - the parser's intro mode (~line 519) and its attribute lines (~line 525, before the `> Tip` match);
  - `skeleton` and `mergeQuestion` (~lines 600–625);
  - the section merge in `buildCatalogue` (~lines 670–690).
- Modify: `docs/intake-questions/intake-questions.md`: Q5.2 (~line 207), Q9.1a (~line 355), Q12.4 (~line 565), and section 6's intro (~line 241).
- Modify: `docs/intake-questions/intake-questions-senior-v2.md`: the same four places.
- Generated: `src/intake-catalogue-data.mjs`, `supabase/migrations/025_intake_catalogue_<hash8>.sql`, `src/zh-hant.mjs`.
- Test: `tests/intake-build.test.mjs`.

**Interfaces:**
- Produces, in the catalogue:
  - `question.wordingUnmarried`: `{ general: {en, zh}, senior: {en, zh} }`, on `claimed_by_other`, `inc_wages_job_count` and `opt_veteran` only;
  - `substep.leadUnmarried`: same shape, on the nine lead sub-steps;
  - `section.introUnmarried`: `{ general: {en, zh}, senior: {en, zh} }`, on section 6 only.

- [ ] **Step 1: Write the failing build tests**

In `tests/intake-build.test.mjs`, add after the fixture helpers (`build`, `lineOf`). These use the existing `STANDARD` and `SENIOR` fixtures, `build()` and `parseDraft`:

```js
// The fixture's Q1.1 names a spouse so it may take a "Not married" line.
const SPOUSE_NAME = ["**Q1.1** Name / 名字", "**Q1.1** Your or your spouse's name / 您或配偶的名字"];
const withSpouseName = (text) => text.replace(...SPOUSE_NAME);
const addAfter = (text, anchor, line) => text.replace(anchor, `${anchor}\n${line}`);

test("a 'Not married' line becomes wordingUnmarried, in both drafts", () => {
  const standard = addAfter(withSpouseName(STANDARD), "`name` · Text · Required", "> Not married: Your name / 您的名字");
  const senior = addAfter(withSpouseName(SENIOR), "`name` · Text · Required", "> Not married: Write your name / 写您的名字");
  const name = build(standard, senior).steps.flatMap((s) => s.sections.flatMap((x) => x.questions)).find((q) => q.id === "name");
  assert.deepEqual(name.wordingUnmarried, {
    general: { en: "Your name", zh: "您的名字" },
    senior: { en: "Write your name", zh: "写您的名字" },
  });
  assert.equal(build().steps.flatMap((s) => s.sections.flatMap((x) => x.questions)).find((q) => q.id === "name").wordingUnmarried, undefined);
});

test("'Not married' lines are refused when they don't fit", () => {
  const line = "> Not married: Your name / 您的名字";
  // In one draft only.
  assert.throws(
    () => build(addAfter(withSpouseName(STANDARD), "`name` · Text · Required", line), withSpouseName(SENIOR)),
    /drafts differ at 'name'/,
  );
  // On a question that names no spouse.
  assert.throws(
    () => build(addAfter(STANDARD, "`name` · Text · Required", line), addAfter(SENIOR, "`name` · Text · Required", line)),
    /'name' names no spouse/,
  );
  // On a group field.
  assert.throws(
    () => parseDraft(addAfter(STANDARD, "`kids[i].name` · Text · Required", line)),
    /a group field takes no 'Not married' line/,
  );
  // Twice.
  assert.throws(
    () => parseDraft(addAfter(addAfter(withSpouseName(STANDARD), "`name` · Text · Required", line), "`name` · Text · Required", line)),
    /a second 'Not married' line/,
  );
});

test("an 'Intro text (not married)' block becomes introUnmarried", () => {
  // The senior fixture renames Section 1 ("About you / 关于您"), so each draft keeps its own heading.
  const STANDARD_1 = "## Section 1: Details / 详情\n";
  const SENIOR_1 = "## Section 1: About you / 关于您\n";
  const intro = (heading, married, single) =>
    `${heading}\n**Intro text:**\n> ${married}\n> 您和配偶。\n\n**Intro text (not married):**\n> ${single}\n> 您。\n`;
  const standard = STANDARD.replace(STANDARD_1, intro(STANDARD_1, "You and your spouse.", "You."));
  const senior = SENIOR.replace(SENIOR_1, intro(SENIOR_1, "You and your spouse, please.", "You, please."));
  assert.notEqual(standard, STANDARD);
  assert.notEqual(senior, SENIOR);
  const section = build(standard, senior).steps.flatMap((s) => s.sections).find((x) => x.n === 1);
  assert.deepEqual(section.intro.general, { en: "You and your spouse.", zh: "您和配偶。" });
  assert.deepEqual(section.introUnmarried, {
    general: { en: "You.", zh: "您。" },
    senior: { en: "You, please.", zh: "您。" },
  });
  // In one draft only.
  const seniorWithoutSingle = SENIOR.replace(SENIOR_1, `${SENIOR_1}\n**Intro text:**\n> You and your spouse, please.\n> 您和配偶。\n`);
  assert.throws(() => build(standard, seniorWithoutSingle), /Section 1's introUnmarried/);
});
```

Then add these real-catalogue tests next to `"the real sub-steps carry their kind, cards and lead lines"`. In that existing test, update the three `lead(...)` assertions (~lines 540–542): the senior Chinese is now 您或您爱人, so compare `{ general: {...}, senior: {...} }` explicitly:

```js
  const married = (en, zh, seniorZh) => ({ general: { en, zh }, senior: { en, zh: seniorZh } });
  assert.deepEqual(lead("income.rental"), married("Did you or your spouse receive any of these in 2025?", "2025 年，您或配偶是否有以下收入？", "2025 年，您或您爱人是否有以下收入？"));
  assert.deepEqual(lead("expenses.other"), married("Did you or your spouse pay for any of these in 2025?", "2025 年，您或配偶是否支付过以下费用？", "2025 年，您或您爱人是否支付过以下费用？"));
  assert.deepEqual(lead("expenses.events"), married("Did any of these happen to you or your spouse in 2025?", "2025 年，您或配偶是否发生过以下事项？", "2025 年，您或您爱人是否发生过以下事项？"));
```

New test:

```js
test("the real catalogue's unmarried wording, leads and intro", () => {
  const questions = allQuestions(COMMITTED);
  const unmarried = (id) => findQuestion(COMMITTED, id).wordingUnmarried;
  assert.deepEqual(questions.filter((q) => q.wordingUnmarried).map((q) => q.id).sort(), ["claimed_by_other", "inc_wages_job_count", "opt_veteran"]);
  assert.deepEqual(unmarried("claimed_by_other"), {
    general: { en: "Can anyone else (such as a parent or adult child) claim you as a dependent on their tax return?", zh: "是否有其他人（如父母或成年子女）可以在其报税表上将您列为受抚养人？" },
    senior: { en: "Can someone else (like a parent or grown child) list you as a dependent on their tax return?", zh: "有没有别人（比如您的父母或成年子女）报税时，会把您写进他们的税表里，算作由他们养活的人？" },
  });
  assert.deepEqual(unmarried("inc_wages_job_count"), {
    general: { en: "How many jobs did you have in 2025?", zh: "2025 年您共有几份工作？" },
    senior: { en: "How many jobs did you have in 2025?", zh: "2025 年，您一共做了几份工作？" },
  });
  assert.deepEqual(unmarried("opt_veteran"), {
    general: { en: "Are you a veteran of the U.S. Armed Forces?", zh: "您是否为美国退伍军人？" },
    senior: { en: "Are you a U.S. military veteran?", zh: "您是美国退伍军人吗？" },
  });

  const subs = COMMITTED.steps.flatMap((s) => s.substeps);
  const both = (en, zh) => ({ general: { en, zh }, senior: { en, zh } });
  const RECEIVED = both("Did you receive any of these in 2025?", "2025 年，您是否有以下收入？");
  const PAID = both("Did you pay for any of these in 2025?", "2025 年，您是否支付过以下费用？");
  const HAPPENED = both("Did any of these happen to you in 2025?", "2025 年，您是否发生过以下事项？");
  const expected = {
    "income.wages": RECEIVED, "income.retirement": RECEIVED, "income.investments": RECEIVED,
    "income.rental": RECEIVED, "income.business": RECEIVED, "income.other": RECEIVED,
    "expenses.deductible": PAID, "expenses.other": PAID, "expenses.events": HAPPENED,
  };
  assert.deepEqual(Object.fromEntries(subs.filter((s) => s.leadUnmarried).map((s) => [s.id, s.leadUnmarried])), expected);

  const section6 = COMMITTED.steps.flatMap((s) => s.sections).find((x) => x.n === 6);
  assert.equal(section6.introUnmarried.general.en, "List **everyone who lived with you in 2025**, and **anyone you financially supported** who did not live with you.");
  assert.equal(section6.introUnmarried.general.zh, "请列出 2025 年与您同住的所有人，以及未与您同住但由您提供经济支持的人。");
  assert.equal(section6.introUnmarried.senior.en, section6.intro.senior.en.replace(" (not your spouse)", ""));
  assert.equal(section6.introUnmarried.senior.zh, section6.intro.senior.zh.replace("（您爱人除外）", ""));
  assert.equal(COMMITTED.steps.flatMap((s) => s.sections).filter((x) => x.introUnmarried).length, 1);
});
```

(`allQuestions` and `findQuestion(COMMITTED, id)` are already used this way in this file, e.g. `"the real catalogue gains hh.member_id…"`.)

- [ ] **Step 2: Run them and see them fail**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/intake-build.test.mjs`
Expected: FAIL. The new tests fail because there's no `wordingUnmarried`, `introUnmarried` or `leadUnmarried`, the refusal messages don't exist, and the leads test still expects the shared Chinese.

- [ ] **Step 3: The builder**

In `tools/build-intake-catalogue.mjs`, replace the three lead constants and `questions()`:

```js
// A lead line's married text (standard and senior) and its not-married text
// (design D6): the senior Chinese names the spouse 您爱人, as senior wording
// does everywhere else; the not-married text is the same in both versions.
const leads = (en, zh, seniorZh, singleEn, singleZh) => ({
  lead: { general: { en, zh }, senior: { en, zh: seniorZh } },
  leadUnmarried: both(singleEn, singleZh),
});
const questions = (id, title, ids, leadLines) => ({
  id,
  kind: "questions",
  title: both(...title),
  ...(leadLines ?? {}),
  questions: ids.split(/\s+/).filter(Boolean),
});
```

```js
const RECEIVED = leads(
  "Did you or your spouse receive any of these in 2025?", "2025 年，您或配偶是否有以下收入？", "2025 年，您或您爱人是否有以下收入？",
  "Did you receive any of these in 2025?", "2025 年，您是否有以下收入？",
);
const PAID = leads(
  "Did you or your spouse pay for any of these in 2025?", "2025 年，您或配偶是否支付过以下费用？", "2025 年，您或您爱人是否支付过以下费用？",
  "Did you pay for any of these in 2025?", "2025 年，您是否支付过以下费用？",
);
const HAPPENED = leads(
  "Did any of these happen to you or your spouse in 2025?", "2025 年，您或配偶是否发生过以下事项？", "2025 年，您或您爱人是否发生过以下事项？",
  "Did any of these happen to you in 2025?", "2025 年，您是否发生过以下事项？",
);
```

The nine `questions(…, RECEIVED|PAID|HAPPENED)` calls don't change. Update the comment above `both` (~line 58) so it no longer says leads are "the same text in both".

In `parseDraft`'s intro mode, put this before the existing `**(Page text|Intro text)…:**` skip:

```js
    if (mode === "intro") {
      if (line === "**Intro text (not married):**") {
        if (block?.key === "introUnmarried" || section.introUnmarried)
          fail(lineNo, "a second 'Intro text (not married)' block");
        closeBlock();
        block = { key: "introUnmarried", block: textBlock() };
        continue;
      }
      if (/^\*\*(Page text|Intro text)[^*]*:\*\*$/.test(line)) continue;
```

In the attribute lines, put this before `m = line.match(/^> Tip…/)`:

```js
    m = line.match(/^> Not married: (.+)$/);
    if (m) {
      if (group && group.fields.includes(question)) fail(lineNo, "a group field takes no 'Not married' line");
      if (question.wordingUnmarried) fail(lineNo, "a second 'Not married' line");
      const single = splitWording(m[1]);
      if (!single) fail(lineNo, "a 'Not married' line must be 'English / 中文'");
      question.wordingUnmarried = single;
      continue;
    }
```

In `skeleton`, add `unmarried: Boolean(q.wordingUnmarried),` after `heading`. That way the existing structure check (`the drafts differ at '<id>'`) refuses a line present in one draft only.

In `mergeQuestion`, after `out.wording = …`:

```js
  if (g.wordingUnmarried) out.wordingUnmarried = variants(g.wordingUnmarried, s.wordingUnmarried);
```

In `buildCatalogue`'s per-section loop, change `for (const key of ["intro", "footer"])` to `for (const key of ["intro", "introUnmarried", "footer"])`, and after `if (g.intro) out.intro = …` add:

```js
    if (g.introUnmarried) out.introUnmarried = variants(g.introUnmarried, s.introUnmarried);
```

After the `byN` loop (before `const mapped = …`), add the spouse check:

```js
  // A not-married text replaces wording that names a spouse; anything else is a
  // slip in the drafts (design D2).
  const SPOUSE = /spouse|配偶|爱人/i;
  const namesSpouse = (text) =>
    ["general", "senior"].some((v) => SPOUSE.test(text?.[v]?.en ?? "") || SPOUSE.test(text?.[v]?.zh ?? ""));
  for (const section of byN.values()) {
    if (section.introUnmarried && !namesSpouse(section.intro))
      throw new Error(`Section ${section.n}'s intro names no spouse, so it takes no 'not married' intro`);
    for (const q of section.questions)
      if (q.wordingUnmarried && !namesSpouse(q.wording))
        throw new Error(`'${q.id}' names no spouse, so it takes no 'Not married' line`);
  }
```

- [ ] **Step 4: The drafts**

In `docs/intake-questions/intake-questions.md`, add each line straight after the question's ID line, before any `**Show if**` or `> Tip` line:
- after Q5.2's `` `claimed_by_other` · … `` line:
  `> Not married: Can anyone else (such as a parent or adult child) claim you as a dependent on their tax return? / 是否有其他人（如父母或成年子女）可以在其报税表上将您列为受抚养人？`
- after Q9.1a's `` `inc_wages_job_count` · … `` line:
  `> Not married: How many jobs did you have in 2025? / 2025 年您共有几份工作？`
- after Q12.4's `` `opt_veteran` · … `` line:
  `> Not married: Are you a veteran of the U.S. Armed Forces? / 您是否为美国退伍军人？`
- in Section 6, after the existing `**Intro text:**` block (its two quoted lines), a blank line, then:

```markdown
**Intro text (not married):**
> List **everyone who lived with you in 2025**, and **anyone you financially supported** who did not live with you.
> 请列出 2025 年与您同住的所有人，以及未与您同住但由您提供经济支持的人。
```

In `docs/intake-questions/intake-questions-senior-v2.md`, the same places:
- Q5.2: `> Not married: Can someone else (like a parent or grown child) list you as a dependent on their tax return? / 有没有别人（比如您的父母或成年子女）报税时，会把您写进他们的税表里，算作由他们养活的人？`
- Q9.1a: `> Not married: How many jobs did you have in 2025? / 2025 年，您一共做了几份工作？`
- Q12.4: `> Not married: Are you a U.S. military veteran? / 您是美国退伍军人吗？`
- Section 6: copy the existing senior `**Intro text:**` block's lines into a new `**Intro text (not married):**` block after it. Remove ` (not your spouse)` from the first English line and `（您爱人除外）` from the Chinese line, and keep every other line.

- [ ] **Step 5: Build**

```bash
ls supabase/migrations
npm run build:intake
npm run build:hant
```
Expected: the newest migration before this step is `024_intake_catalogue_59560589.sql`; if a `025_*` already exists, stop and report. `build:intake` writes `025_intake_catalogue_<hash8>.sql`. `src/zh-hant.mjs` gains the new Chinese. **Don't apply 025.**

- [ ] **Step 6: Run the unit suite**

Run: `npm test`
Expected: the build tests pass. Other unit tests that quote the senior leads' old Chinese, or compare the whole catalogue, update with the regenerated data. Tests that render a sub-step's lead for the default sample, which is never married, belong to Task 3 and still pass here, because no screen reads `leadUnmarried` yet. Report any other failure.

- [ ] **Step 7: Commit**

```bash
git add tools/build-intake-catalogue.mjs docs/intake-questions/intake-questions.md docs/intake-questions/intake-questions-senior-v2.md src/intake-catalogue-data.mjs src/zh-hant.mjs tests/intake-build.test.mjs
git add supabase/migrations/025_intake_catalogue_<hash8>.sql
git commit -m "Catalogue: not-married wording for Q5.2, Q9.1a, Q12.4, the nine leads and section 6's intro; senior leads use 您爱人 (migration 025, not applied)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git rev-parse --short HEAD
```

---

### Task 2: One rule and one reader for each kind of text

**Files:**
- Modify: `src/intake-catalogue.mjs`: `wording` (~line 45); add `spouseShown`, `leadOf` and `introOf` after `isVisible` (~line 74).
- Modify: `src/intake-form.mjs`: remove the local `spouseShown` (~line 55) and import it.
- Modify: `src/draft-form.mjs:409`: use `spouseShown`.
- Test: `tests/intake-catalogue.test.mjs`.

**Interfaces:**
- Consumes: Task 1's `wordingUnmarried`, `leadUnmarried` and `introUnmarried`.
- Produces, exported from `src/intake-catalogue.mjs`:
  - `spouseShown(answers) → boolean`;
  - `wording(question, { variant = "general", lang = "en", answers } = {}) → string`;
  - `leadOf(substep, { variant = "general", lang = "en", answers } = {}) → string`, which is `""` when the sub-step has no lead;
  - `introOf(section, { variant = "general", lang = "en", answers } = {}) → string`, which is `""` when there's no intro.

  Without `answers`, each returns today's text.

- [ ] **Step 1: Write the failing tests**

In `tests/intake-catalogue.test.mjs`, add `spouseShown, leadOf, introOf` to the import from `../src/intake-catalogue.mjs`, then:

```js
test("spouseShown: married only; anything else, or unanswered, is not married", () => {
  assert.equal(spouseShown({ marital_status: "married" }), true);
  for (const status of ["never_married", "divorced", "separated", "widowed"])
    assert.equal(spouseShown({ marital_status: status }), false, status);
  assert.equal(spouseShown({}), false);
  assert.equal(spouseShown(null), false);
});

test("wording, leadOf and introOf pick the not-married text from the application's answers", () => {
  const single = { marital_status: "never_married" };
  const married = { marital_status: "married" };
  const jobs = q("inc_wages_job_count");
  assert.equal(wording(jobs, { answers: single }), "How many jobs did you have in 2025?");
  assert.equal(wording(jobs, { answers: married }), "How many jobs did you and your spouse have in 2025?");
  assert.equal(wording(jobs, { answers: {} }), "How many jobs did you have in 2025?");
  assert.equal(wording(jobs), "How many jobs did you and your spouse have in 2025?", "no application: today's text");
  assert.equal(wording(jobs, { variant: "senior", lang: "zh-Hans", answers: single }), "2025 年，您一共做了几份工作？");
  assert.equal(wording(q("opt_veteran"), { variant: "senior", answers: single }), "Are you a U.S. military veteran?");
  // A question without not-married text reads the same for everyone.
  assert.equal(wording(q("tp_first_name"), { answers: single }), wording(q("tp_first_name"), { answers: married }));

  const wages = findSubstep("income.wages");
  assert.equal(leadOf(wages, { answers: single }), "Did you receive any of these in 2025?");
  assert.equal(leadOf(wages, { answers: married }), "Did you or your spouse receive any of these in 2025?");
  assert.equal(leadOf(wages), "Did you or your spouse receive any of these in 2025?");
  assert.equal(leadOf(wages, { variant: "senior", lang: "zh-Hans", answers: married }), "2025 年，您或您爱人是否有以下收入？");
  assert.equal(leadOf(findSubstep("about.you"), { answers: single }), "");

  const section6 = CATALOGUE.steps.flatMap((s) => s.sections).find((x) => x.n === 6);
  assert.match(introOf(section6, { answers: married }), /\(except your spouse\)/);
  assert.doesNotMatch(introOf(section6, { answers: single }), /spouse/);
  assert.equal(introOf(CATALOGUE.steps.flatMap((s) => s.sections).find((x) => x.n === 1), { answers: single }), "");
});
```

(`q` and `findSubstep` are already available in this file; Simplified Chinese is `lang: "zh-Hans"`, as the file's other language tests use.)

- [ ] **Step 2: Run them and see them fail**

Run: `node --test tests/intake-catalogue.test.mjs`
Expected: FAIL. `spouseShown`, `leadOf` and `introOf` aren't exported, and `wording` ignores `answers`.

- [ ] **Step 3: Implement**

In `src/intake-catalogue.mjs`, replace `wording`:

```js
// The text a screen shows for one application (design D4): the not-married
// version when `answers` say the client isn't married and the item has one,
// else the usual text. Without `answers` (no application), the usual text.
const forClient = (usual, unmarried, answers) => (answers && unmarried && !spouseShown(answers) ? unmarried : usual);
const inVariant = (text, variant, lang) =>
  sourceText({ en: text?.[variant]?.en ?? text?.general?.en ?? "", zh: text?.[variant]?.zh ?? text?.general?.zh }, lang);

export const wording = (question, { variant = "general", lang = "en", answers } = {}) => {
  const w = forClient(question?.wording, question?.wordingUnmarried, answers);
  return sourceText({ en: w?.[variant]?.en ?? w?.general?.en, zh: w?.[variant]?.zh ?? w?.general?.zh }, lang);
};
```

After `isVisible`:

```js
/** Married, by the rule that offers "My spouse" (who.spouseShowIf); unanswered is not married. */
export const spouseShown = (answers) => isVisible({ showIf: CATALOGUE.fixedOptions.who.spouseShowIf }, answers ?? {});

/** A sub-step's lead line for one application, in `lang`; "" without a lead. */
export const leadOf = (substep, { variant = "general", lang = "en", answers } = {}) =>
  substep?.lead ? inVariant(forClient(substep.lead, substep.leadUnmarried, answers), variant, lang) : "";

/** A section's intro for one application, in `lang`; "" without an intro. */
export const introOf = (section, { variant = "general", lang = "en", answers } = {}) =>
  section?.intro ? inVariant(forClient(section.intro, section.introUnmarried, answers), variant, lang) : "";
```

In `src/intake-form.mjs`:
- delete `const spouseShown = …` (~line 55);
- add `spouseShown` to the import from `./intake-catalogue.mjs`.

In `src/draft-form.mjs`:
- add `spouseShown` to the import from `./intake-catalogue.mjs`;
- replace `const hasSpouse = isVisible({ showIf: CATALOGUE.fixedOptions.who.spouseShowIf }, visible);` with `const hasSpouse = spouseShown(visible);`. Keep its comment.

- [ ] **Step 4: Run them and see them pass**

Run: `npm test`
Expected: PASS, the whole unit suite.

- [ ] **Step 5: Commit**

```bash
git add src/intake-catalogue.mjs src/intake-form.mjs src/draft-form.mjs tests/intake-catalogue.test.mjs
git commit -m "One married rule (spouseShown) and readers that take the application's answers: wording, leadOf, introOf

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git rev-parse --short HEAD
```

---

### Task 3: Every screen passes its application's answers

**Files:**
- Modify:
  - `src/intake-form.mjs:360` and `:487`;
  - `src/intake-views.mjs`: `localized` uses at `:228` and `:233`, `itemLabel` `:363–371` and its call at `:421`, `answerSteps` `:453`;
  - `src/client-views.mjs:221`;
  - `src/office-views.mjs:421` (its own `inVariant` stays: it still reads headings and titles at `:427` and `:474`);
  - `src/staff-views.mjs:771`;
  - `src/draft-form.mjs:301` and `:331–342`.
- Test: `tests/client-views.test.mjs`, `tests/office-views.test.mjs`, `tests/staff-views.test.mjs`, `tests/draft-form.test.mjs`.

**Interfaces:**
- Consumes: Task 2's `wording(…, { answers })`, `leadOf` and `introOf`.

- [ ] **Step 1: Write the failing tests**

`tests/client-views.test.mjs` (helpers `v2State`, `form`, `without`, `makeSampleAnswers`, `findQuestion` and `conflictForm` already exist). `makeSampleAnswers()` is never married, and `makeSampleAnswers({ married: true })` is married.

```js
test("the client's form uses the not-married wording for an unmarried client", () => {
  const single = { ...makeSampleAnswers(), inc_wages: "yes" };
  const married = { ...makeSampleAnswers({ married: true }), inc_wages: "yes" };
  const wages = (answers) => form({ formSubstep: "income.wages", draftAnswers: answers });
  assert.match(wages(single), /<p class="q-lead">Did you receive any of these in 2025\?<\/p>/);
  assert.match(wages(single), /How many jobs did you have in 2025\?/);
  assert.doesNotMatch(wages(single), /your spouse/);
  assert.match(wages(married), /<p class="q-lead">Did you or your spouse receive any of these in 2025\?<\/p>/);
  assert.match(wages(married), /How many jobs did you and your spouse have in 2025\?/);

  const household = (answers) => form({ formSubstep: "household.members", draftAnswers: answers });
  assert.match(household(married), /\(except your spouse\)/);
  assert.doesNotMatch(household(single), /except your spouse/);

  // Alerts and the summary.
  const alerts = form({ formSubstep: "review.check", draftAnswers: without(makeSampleAnswers(), "claimed_by_other") });
  assert.match(alerts, /claim you as a dependent on their tax return\?/);
  assert.doesNotMatch(alerts, /claim you or your spouse/);
  const summary = form({ formSubstep: "review.summary", draftAnswers: makeSampleAnswers() });
  assert.match(summary, /claim you as a dependent on their tax return\?/);
});
```

Update the existing assertions that expect the married lead for the never-married default sample. At ~line 863:

```js
  assert.match(wages, /<p class="q-lead">Did you receive any of these in 2025\?<\/p>/);
```

At ~line 864, change the `expenses.events` match to `Did any of these happen to you in 2025\?`. Read those tests first and keep their other assertions.

Add next to the existing conflict test (~line 1205, `"the version-2 conflict screen compares…"`), using the same `v2State` and `v2Case` helpers:

```js
test("the conflict table labels a row with the wording the client saw", () => {
  const sample = makeSampleAnswers(); // never married
  const html = conflictForm(
    v2State({
      savedCase: v2Case({ revision: 4, answers: { ...sample, opt_veteran: "no" } }),
      draftAnswers: { ...sample, opt_veteran: "yes" },
      dirty: true,
      editBaseRevision: 2,
      conflict: { code: "REMOTE_CHANGED", baseRevision: 2, serverRevision: 4 },
    }),
  );
  assert.match(html, /<th scope="row">Are you a veteran of the U\.S\. Armed Forces\?<\/th>/);
  assert.doesNotMatch(html, /Are you or your spouse a veteran/);
});
```

(Other rows may appear, for example contact fields that differ between the two answer sets. The test checks only the veteran row.)

`tests/office-views.test.mjs` (`addV2` and `subOf` exist):

```js
test("the office's form uses the walk-in client's marital status for the wording", () => {
  const html = (answers) => addV2({ draftAnswers: { ...answers, inc_wages: "yes" }, openAddSubsteps: ["income.wages"] });
  assert.match(subOf(html(makeSampleAnswers()), "income.wages"), /<p class="q-lead">Did you receive any of these in 2025\?<\/p>/);
  assert.match(subOf(html(makeSampleAnswers()), "income.wages"), /How many jobs did you have in 2025\?/);
  assert.match(subOf(html(makeSampleAnswers({ married: true })), "income.wages"), /<p class="q-lead">Did you or your spouse receive any of these in 2025\?<\/p>/);
});
```

(Import `makeSampleAnswers` from `../src/sample-data.mjs` if the file doesn't already.) Update the existing assertion at ~line 566. If its draft is never married or empty, it now expects `Did you receive any of these in 2025\?`. Read the test first: an empty draft counts as not married.

`tests/staff-views.test.mjs` (`v2Case` and `v2Panel` exist):

```js
test("the staff answers panel shows the wording the client saw", () => {
  const single = v2Panel(v2Case({ answers: { marital_status: "divorced", opt_veteran: "no" } }));
  assert.match(single, /Are you a veteran of the U\.S\. Armed Forces\?/);
  assert.doesNotMatch(single, /Are you or your spouse a veteran/);
  const married = v2Panel(v2Case({ married: true, answers: { opt_veteran: "no" } }));
  assert.match(married, /Are you or your spouse a veteran of the U\.S\. Armed Forces\?/);
});
```

`tests/draft-form.test.mjs` (`draft` and `MARRIED` exist; `MARRIED.claimed_by_other` is `"not_sure"`):

```js
test("the not-sure lines quote the wording the client saw", () => {
  const { comments: married } = draft(MARRIED);
  assert.ok(married.includes("claim you or your spouse as a dependent on their tax return?"));
  const { comments: single } = draft({ ...MARRIED, marital_status: "never_married" });
  assert.ok(single.includes("Not sure: Can anyone else (such as a parent or adult child) claim you as a dependent on their tax return?"));
  assert.doesNotMatch(single, /claim you or your spouse/);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npm test`
Expected: FAIL. The new tests fail because the screens still show the spouse wording, and so do the updated lead assertions.

- [ ] **Step 3: Pass the answers (design D5)**

- **`src/intake-form.mjs`:**
  - `:360` → `const title = esc(wording(question, { variant, lang, answers }));` (the function already has `answers` in scope);
  - `:487` (the group legend) → `wording(question, { variant, lang, answers })`;
  - leave `:169` alone: group fields name no spouse.
- **`src/intake-views.mjs`:**
  - import `leadOf, introOf` from `./intake-catalogue.mjs`;
  - `:228` → `const lead = leadOf(substep, { variant, lang, answers });`;
  - `:233` → `introOf(section, { variant, lang, answers })` in place of `localized(section.intro, variant, lang)`. Check `answers` is the form's answers in `questionsBody` (it's already used as `isSameDay(answers)`);
  - `itemLabel(id, variant, lang = "en")` → `itemLabel(id, variant, lang = "en", answers)`, with `const options = { variant, lang, answers };`;
  - its call at `:421` → `itemLabel(item.id, view.variant, lang, view.answers)`;
  - `answerSteps` `:453` → `const options = { variant, lang, answers };` (`formatAnswer` ignores the extra key).
- **`src/client-views.mjs:221`** → `wording(question, { variant, lang, answers: mine })`. `mine` is the client's own draft in that function; read the function to confirm the variable name.
- **`src/office-views.mjs:421`** → `const lead = leadOf(findSubstep(id), { variant, lang: "en", answers });` (`answers` comes from `view`, as in `partBody`'s first line). Import `leadOf`. Keep `inVariant`, which still reads headings and titles. Question labels already get `answers` through `renderQuestion`.
- **`src/staff-views.mjs:771`** → `const options = { variant, lang: "en", answers };` (`answers` is `serverAnswersV2(record)`, defined above it).
- **`src/draft-form.mjs`:**
  - `:301` → `const generalWording = (question, lang, answers) => wording(question, { variant: "general", lang, answers });`;
  - in `notSureLabels(answers, lang)`, the top-level call becomes `generalWording(question, lang, answers)`. The group-field call (`:340`) stays without answers.

`intake-views.mjs:311` and `staff-views.mjs:928` (a document card's `ask` question) don't change: no card asks a question that has a not-married text. Confirm with `grep -n "ask:" src/document-cards.mjs`, and report if one does.

- [ ] **Step 4: Run them and see them pass**

```bash
npm test
npm run build:hant -- --check
```
Expected: PASS, the whole unit suite, and the 繁體 check is clean.

- [ ] **Step 5: Commit**

```bash
git add src/intake-form.mjs src/intake-views.mjs src/client-views.mjs src/office-views.mjs src/staff-views.mjs src/draft-form.mjs tests/client-views.test.mjs tests/office-views.test.mjs tests/staff-views.test.mjs tests/draft-form.test.mjs
git commit -m "Every screen of one application uses that client's wording: form, review, compare table, office, staff panel, draft 13614-C

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git rev-parse --short HEAD
```

---

### Task 4: The direct-deposit card's hint

**Files:**
- Modify: `src/document-cards.mjs`: `CARD_TEMPLATES` (~lines 27–45) and the `bank` rule (~lines 471–481).
- Generated: `src/zh-hant.mjs`.
- Test: `tests/document-cards.test.mjs` (the bank test, ~lines 142–155).

**Interfaces:**
- Consumes:
  - the module's existing `isMarried(a)` (`a.marital_status === "married"`, ~line 101), which means the same as `spouseShown` (design D3, D7);
  - `pair(en, zh, office)` (~line 22).
- Produces: `CARD_TEMPLATES.bank_hint` and `CARD_TEMPLATES.bank_hint_single`. The bank card's `hint` is one of them.

- [ ] **Step 1: Write the failing test**

In `tests/document-cards.test.mjs`, the bank test's last assertion (~line 154) uses `single` (never married). Change it to:

```js
  assert.equal(both[0].hint.en, "The account must be in your name.");
```

Add after that test:

```js
test("bank: the hint names the spouse only when married, for the client and the office", () => {
  const hint = (a) => cardsFor({ ...a, refund_method: "direct_deposit" }).find((c) => c.ruleId === "bank").hint;
  assert.deepEqual(hint(single), {
    en: "The account must be in your name.",
    zh: "账户必须是您名下的账户。",
    office: "The account must be in the client's name.",
  });
  assert.deepEqual(hint({}), hint(single), "an unanswered marital status is not married");
  assert.deepEqual(hint(married), {
    en: "The account must be in your name (or your spouse's).",
    zh: "账户必须是您（或配偶）名下的账户。",
    office: "The account must be in the client's or spouse's name.",
  });
  // A bank payment alone (a Maybe card) follows the same rule.
  const maybe = cardsFor({ ...single, payment_method: "bank_account" }).find((c) => c.ruleId === "bank");
  assert.equal(maybe.hint.en, "The account must be in your name.");
});
```

(`single` and `married` are defined at the top of the file, ~lines 14–15.)

- [ ] **Step 2: Run it and see it fail**

Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/document-cards.test.mjs`
Expected: FAIL. Every client still gets the spouse text.

- [ ] **Step 3: Implement**

In `CARD_TEMPLATES`, after `prior_return_hint`, add:

```js
  // The direct-deposit card's hint: the spouse only when married (change
  // add-unmarried-intake-wording, design D7).
  bank_hint: pair("The account must be in your name (or your spouse's).", "账户必须是您（或配偶）名下的账户。", "The account must be in the client's or spouse's name."),
  bank_hint_single: pair("The account must be in your name.", "账户必须是您名下的账户。", "The account must be in the client's name."),
```

In the `bank` rule, delete its `hint: { en: "The account must be in your name (or your spouse's).", … },` line, and give each match entry a hint:

```js
    match: (a) => {
      const hint = isMarried(a) ? CARD_TEMPLATES.bank_hint : CARD_TEMPLATES.bank_hint_single;
      return [
        ...(a.refund_method === "direct_deposit" || a.refund_method === "split"
          ? [{ owner: HOUSEHOLD, group: "needed", ask: "refund_method", why: CARD_WHY.bank_refund_method, hint }] : []),
        ...(a.payment_method === "bank_account"
          ? [{ owner: HOUSEHOLD, group: "maybe", ask: "payment_method", why: CARD_WHY.bank_payment_method, hint }] : []),
      ];
    },
```

(`cardsFor` reads `m.hint ?? rule.hint`, ~line 563, so the entry's hint wins.)

```bash
npm run build:hant
```
Expected: `src/zh-hant.mjs` gains 账户必须是您名下的账户。, which `walkPairs` collects from `CARD_TEMPLATES`.

- [ ] **Step 4: Run them and see them pass**

```bash
npm test
npm run build:hant -- --check
```
Expected: PASS. `tests/client-views.test.mjs:1293` (a married client's bank card) still reads "The account must be in your name (or your spouse&#39;s)." with no change. If another test renders the bank card for an unmarried client and expects the spouse text, update it to the single text and say so in the report.

- [ ] **Step 5: Commit**

```bash
git add src/document-cards.mjs src/zh-hant.mjs tests/document-cards.test.mjs
git commit -m "The direct-deposit card's hint names the spouse only when married (client and office)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git rev-parse --short HEAD
```

---

### Task 5: Database and the story

**Files:**
- Test: `tests/browser.mjs`, at the client's version-2 walk: the `income.wages` check (~line 3103) and the married part after `choose("marital_status", "married")` and the fill (~line 3545–3560).

**Interfaces:**
- Consumes: Tasks 1–4, and 025 applied.

- [ ] **Step 1: The controller applies 025 (not the implementer)**

The controller reviews `025_intake_catalogue_<hash8>.sql`. It should be the same shape as 024: a header, then one `vitally_private.load_intake_catalogue(2::smallint, '<json>')` call. The controller dry-runs it in a rolled-back transaction on `vitally-task2`, asks the user, and after their yes runs `npm run db:migrate:test` and `npm run test:database`. The controller reports whether `main`'s "the field table matches the catalogue" would still pass on the stack (025 changes only text).

- [ ] **Step 2: The story's two walks**

In `tests/browser.mjs`, at the `if (id === "income.wages")` check (~line 3103), the walk's client is never married. Change the expected lead:

```js
              { lead: "Did you receive any of these in 2025?", intros: 0 },
```

and add, in the same block:

```js
            // The label can carry a range note after the wording, so compare its start.
            assert.ok(
              (await page.evaluate(() => document.querySelector('[data-q="inc_wages_job_count"] .q-label')?.textContent.trim() ?? "")).startsWith(
                "How many jobs did you have in 2025?",
              ),
              "Q9.1a reads the not-married wording",
            );
```

The walk's fill (`tests/browser.mjs` ~2962, "Every blank filled once") answers `inc_wages = yes`, so Q9.1a is shown here. If it isn't, assert only the lead and say so in the report.

After the married fill (~line 3560, after `assert.notEqual(await rail("about.spouse"), null, …)`), add:

```js
        // Married now: the wages lead and Q9.1a name the spouse again.
        await jump("income.wages");
        await waitFor(
          page,
          "the married wages lead",
          () => document.querySelector("#intake-v2-form .q-lead")?.textContent.trim() === "Did you or your spouse receive any of these in 2025?",
          undefined,
          RENDER_MS,
        );
```

Then assert that Q9.1a's label starts with the spouse wording:

```js
        assert.ok(
          (await page.evaluate(() => document.querySelector('[data-q="inc_wages_job_count"] .q-label')?.textContent.trim() ?? "")).startsWith(
            "How many jobs did you and your spouse have in 2025?",
          ),
          "a married client's Q9.1a names the spouse",
        );
```

Run `node --check tests/browser.mjs`, then commit. The controller runs `npm run test:browser`.

```bash
git add tests/browser.mjs
git commit -m "Story: the never-married client reads the not-married wages lead; the married client reads the spouse lead

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git rev-parse --short HEAD
```

---

### Task 6: Docs and the full check

**Files:**
- Modify:
  - `docs/setup.md` (the migration count "Twenty-four", the table row after 024, the counts table and its last-verified sentence, and the story note);
  - `docs/developer/database.md` (the migrations table, the count sentence, the database test count);
  - `docs/developer/README.md` (`001-024` and the counts);
  - root `README.md` (`001–024`, with an en dash);
  - `docs/developer/frontend.md` (the Unit count, and one sentence on wording that depends on marital status).

**Interfaces:**
- Consumes: the counts from Step 1, which the controller runs.

- [ ] **Step 1: The controller runs every check**
  - `npm test`;
  - `npm run build:hant -- --check`;
  - `npm run build:intake`, then `git status --short`, which must be clean;
  - `npx openspec validate --all`;
  - `npm run test:database`;
  - `npm run test:auth-browser`;
  - `npm run test:browser`, using Task 5's run if no code changed after it.

  The controller hands the counts to the implementer.

- [ ] **Step 2: Edit the docs**
  - **Migrations:**
    - "Twenty-four migrations" → "Twenty-five migrations";
    - add a row after 024 in `docs/setup.md` and `docs/developer/database.md`: `| \`025_intake_catalogue_<hash8>.sql\` | Generated by \`npm run build:intake\`: not-married wording for Q5.2, Q9.1a, Q12.4, the nine income/expense/event leads and section 6's intro; the senior leads say 您爱人 (text only) |`, with the real hash;
    - `001-024` → `001-025` in `docs/developer/README.md`, and `(001–024)` → `(001–025)` in the root `README.md`.
  - **Counts:** fill in Step 1's numbers wherever the suites' counts appear (setup.md table and last-verified sentence; frontend.md "Unit (N)"; docs/developer/README.md; database.md's test count). The last-verified sentence names `add-unmarried-intake-wording`, migration 025 applied and the date. The story note leads with this run.
  - **frontend.md:** in the section on catalogue text or required questions, add one bullet:
    "- Some text depends on marital status: a question's `wordingUnmarried`, a sub-step's `leadUnmarried` and a section's `introUnmarried` replace the usual text when `spouseShown(answers)` is false (the rule that offers "My spouse"). `wording()`, `leadOf()` and `introOf()` take the application's `answers`; without them they return the usual text."

  Grep `README.md` and `docs/` (not `docs/superpowers/`) for `024` with a hyphen or an en dash, and for "Twenty-four" or "twenty-four", and fix any stale range.

- [ ] **Step 3: Commit**

```bash
git add docs/setup.md docs/developer/database.md docs/developer/README.md docs/developer/frontend.md README.md
git commit -m "Docs: migration 025, the counts, wording that depends on marital status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git rev-parse --short HEAD
```

---

## Self-review

- **Spec coverage:**
  - `client-intake` "An unmarried client isn't asked about a spouse":
    - never married: Tasks 2 and 3 (form) and Task 5 (story);
    - married: Tasks 2, 3 and 5;
    - unanswered: Task 2 (`spouseShown({})`, `wording(jobs, { answers: {} })`);
    - staff: Task 3 (the staff panel);
    - the office: Task 3;
    - the senior married lead in Chinese: Tasks 1 and 2;
    - the direct-deposit card, unmarried, unanswered and married, client and office: Task 4.
  - `draft-13614c` "The draft's not-sure lines quote the wording the client saw": Task 3 (`tests/draft-form.test.mjs`), both scenarios.
- **Placeholder scan:**
  - the generated `025_intake_catalogue_<hash8>.sql` name is decided by the build;
  - two places say "read the existing test first". They name the file, the line and the expected new value; they aren't open-ended.
- **Names:**
  - `spouseShown`, `wording(…, { answers })`, `leadOf` and `introOf` are used the same way in Tasks 2–3;
  - the catalogue keys `wordingUnmarried`, `leadUnmarried` and `introUnmarried` are used the same way in Tasks 1–3.
