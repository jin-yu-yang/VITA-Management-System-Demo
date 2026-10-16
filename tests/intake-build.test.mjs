import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parseDraft,
  buildCatalogue,
  checkSubsteps,
  catalogueHash,
  LOADER_VERSION,
  nextCatalogueMigration,
  readMigrationEntries,
  RULES,
  TAX_YEAR,
} from "../tools/build-intake-catalogue.mjs";
import COMMITTED from "../src/intake-catalogue-data.mjs";

// ---------------------------------------------------------------------------
// Fixture drafts: one question per type, a group, every condition form, a
// conditional tip, an intro, a sub-heading and a footer. The senior draft is
// the standard one with some wording changed, never its structure.

const STANDARD = [
  "# Fixture intake",
  "",
  "## Design Conventions (for developers)",
  "",
  "- Anything here is ignored, even `odd` · Lines · Like this",
  "- **Who** options:",
  "  - `me` (Me / 本人)",
  "  - `spouse` (My spouse / 配偶), **shown only when married**",
  "  - `none` (No one / 均无), which clears the other two",
  "- **Every Yes/No question** has `not_sure` (I'm not sure / 不确定).",
  "",
  "## Section 0: Start / 开始",
  "",
  "**Page text (no input required):**",
  "",
  "> Welcome.",
  "> - Bring your papers",
  ">",
  "> 欢迎。",
  "> - 带上您的文件",
  "",
  "Questions? Ask us. / 有问题？请问我们。",
  "> Note for developers: not shown.",
  "",
  "**Q0.1** Pick a colour / 选颜色",
  "`colour` · Single choice · Required",
  "- `red` Red / 红 · `blue` Blue / 蓝",
  "- `green_blue` Green / Blue / 绿/蓝",
  "> Tip (show if `colour = red`): Red is warm. / 红色是暖色。",
  "> Note for developers: ignored.",
  "",
  "**Q0.2** Toppings / 配料",
  "`toppings` · Multi-select · Optional",
  "- `cheese` Cheese / 奶酪",
  "- `ham` Ham / 火腿",
  "",
  "**Q0.3** Who likes it? / 谁喜欢？",
  "`likes` · Who (multi-select) · Required",
  "",
  "**Q0.4** Hungry? / 饿吗？",
  "`hungry` · Yes / No / Not sure · Required",
  "**Show if** `colour ≠ blue`",
  "",
  "**Q0.5** Full? / 饱吗？",
  "`full` · Yes / No · Required",
  "",
  "---",
  "",
  "## Section 1: Details / 详情",
  "",
  "**Q1.1** Name / 名字",
  "`name` · Text · Required",
  "> Tip: As on your card. / 与卡上一致。",
  "",
  "**Q1.2** Story / 故事",
  "`story` · Long text · Optional",
  "**Show if** `name` is filled AND `hungry = yes`",
  "",
  "**Q1.3** Sign here / 在此签名",
  "`sig` · Signature · Optional",
  "",
  "**Q1.4** Email / 邮箱",
  "`mail` · Email · Optional",
  "",
  "**Q1.5** Phone / 电话",
  "`tel` · Phone · Required",
  "",
  "### Part B: More / 更多",
  "",
  "**Q1.6** ZIP code / 邮编",
  "`zip5` · ZIP · Required",
  "",
  "**Q1.7** Birthday / 生日",
  "`born` · Date · Required",
  "",
  "**Q1.8** Year / 年份",
  "`yr` · Year · Optional",
  "",
  "**Q1.9** How many? / 多少？",
  "`count` · Number · Optional",
  "",
  "## Section 5: Family / 家庭",
  "",
  "**Q5.0** Any kids? / 有孩子吗？",
  "`has_kids` · Yes / No · Required",
  "",
  "**Q5.G** Kids / 孩子",
  "`kids` · Group · Required",
  "**Show if** `has_kids = yes`",
  "",
  "**Q5.1** Kid's name / 孩子的名字",
  "`kids[i].name` · Text · Required",
  "",
  "**Q5.2** Months at home / 在家月数",
  "`kids[i].months` · Number 0–12 · Required",
  "",
  "**Footer text:**",
  "> Thanks.",
  "> 谢谢。",
  "",
  "## Appendix A: Ignored",
  "",
  "`nonsense` · Whatever",
].join("\n");

const SENIOR = STANDARD.replace("`spouse` (My spouse / 配偶)", "`spouse` (My spouse / 我爱人)").replace(
  "**Q0.1** Pick a colour / 选颜色",
  "**Q0.1** Which colour do you like? / 您喜欢什么颜色？",
)
  .replace("`red` Red / 红", "`red` Red, like fire / 红色，像火")
  .replace(
    "> Tip: As on your card. / 与卡上一致。",
    "> Tip: Write it like your card. / 照卡上写。",
  )
  .replace("## Section 1: Details / 详情", "## Section 1: About you / 关于您");

// The fixture's own steps: buildCatalogue takes the step table as an option,
// so the fixture drafts need not name the real catalogue's questions.
const titled = (en, zh) => ({ general: { en, zh }, senior: { en, zh } });
const FIXTURE_STEPS = [
  {
    id: "start",
    n: 1,
    title: { en: "Start", zh: "开始" },
    sections: [0],
    substeps: [
      { id: "start.all", kind: "questions", title: titled("Start", "开始"), questions: ["colour", "toppings", "likes", "hungry", "full"] },
    ],
  },
  {
    id: "details",
    n: 2,
    title: { en: "Details", zh: "详情" },
    sections: [1],
    substeps: [
      { id: "details.name", kind: "questions", title: titled("Name", "名字"), lead: titled("Who?", "是谁？"), questions: ["name", "story", "sig"] },
      { id: "details.more", kind: "questions", title: titled("More", "更多"), questions: ["mail", "tel", "zip5", "born", "yr", "count"] },
    ],
  },
  {
    id: "family",
    n: 3,
    title: { en: "Family", zh: "家庭" },
    sections: [5],
    substeps: [{ id: "family.kids", kind: "questions", title: titled("Kids", "孩子"), questions: ["has_kids", "kids"] }],
  },
  {
    id: "review",
    n: 4,
    title: { en: "Review", zh: "检查" },
    sections: [],
    substeps: [{ id: "review.check", kind: "review", title: titled("Review", "检查"), questions: [] }],
  },
];
const build = (standard = STANDARD, senior = SENIOR, steps = FIXTURE_STEPS) =>
  buildCatalogue(standard, senior, { steps });

const lineOf = (text, needle) =>
  text.split("\n").findIndex((line) => line.includes(needle)) + 1;

const findQuestion = (catalogue, id) => {
  for (const step of catalogue.steps)
    for (const section of step.sections)
      for (const question of section.questions)
        if (question.id === id) return question;
  return undefined;
};

const allQuestions = (catalogue) =>
  catalogue.steps.flatMap((step) =>
    step.sections.flatMap((section) => section.questions),
  );

const both = (en, zh) => ({ general: { en, zh }, senior: { en, zh } });

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

test("buildCatalogue turns the fixture drafts into the catalogue", () => {
  const catalogue = build();
  assert.equal(catalogue.version, 2);
  assert.equal(catalogue.steps.length, 4);
  assert.deepEqual(
    catalogue.steps.map((step) => step.sections.map((s) => s.n)),
    [[0], [1], [5], []],
  );
  assert.deepEqual(catalogue.steps.map((step) => step.id), ["start", "details", "family", "review"]);
  assert.deepEqual(catalogue.steps[1].substeps[0], FIXTURE_STEPS[1].substeps[0]);

  const start = catalogue.steps[0].sections[0];
  assert.deepEqual(start.title, both("Start", "开始"));
  assert.deepEqual(
    start.intro,
    both(
      "Welcome.\n- Bring your papers\n\nQuestions? Ask us.",
      "欢迎。\n- 带上您的文件\n\n有问题？请问我们。",
    ),
  );
  assert.deepEqual(catalogue.steps[1].sections[0].title, {
    general: { en: "Details", zh: "详情" },
    senior: { en: "About you", zh: "关于您" },
  });

  assert.deepEqual(findQuestion(catalogue, "colour"), {
    id: "colour",
    type: "choice",
    required: true,
    options: [
      {
        value: "red",
        label: {
          general: { en: "Red", zh: "红" },
          senior: { en: "Red, like fire", zh: "红色，像火" },
        },
      },
      { value: "blue", label: both("Blue", "蓝") },
      { value: "green_blue", label: both("Green / Blue", "绿/蓝") },
    ],
    tips: {
      general: [
        {
          showIf: [{ field: "colour", op: "eq", value: "red" }],
          en: "Red is warm.",
          zh: "红色是暖色。",
        },
      ],
      senior: [
        {
          showIf: [{ field: "colour", op: "eq", value: "red" }],
          en: "Red is warm.",
          zh: "红色是暖色。",
        },
      ],
    },
    wording: {
      general: { en: "Pick a colour", zh: "选颜色" },
      senior: { en: "Which colour do you like?", zh: "您喜欢什么颜色？" },
    },
  });

  assert.deepEqual(findQuestion(catalogue, "likes"), {
    id: "likes",
    type: "who",
    required: true,
    options: [{ value: "me" }, { value: "spouse" }, { value: "none" }],
    wording: both("Who likes it?", "谁喜欢？"),
  });

  assert.deepEqual(findQuestion(catalogue, "hungry"), {
    id: "hungry",
    type: "yesno",
    required: true,
    options: [{ value: "yes" }, { value: "no" }, { value: "not_sure" }],
    showIf: [{ field: "colour", op: "ne", value: "blue" }],
    wording: both("Hungry?", "饿吗？"),
  });
  assert.deepEqual(
    findQuestion(catalogue, "full").options.map((o) => o.value),
    ["yes", "no"],
  );

  assert.deepEqual(findQuestion(catalogue, "story"), {
    id: "story",
    type: "longtext",
    required: false,
    showIf: [
      { field: "name", op: "filled" },
      { field: "hungry", op: "eq", value: "yes" },
    ],
    wording: both("Story", "故事"),
  });

  assert.deepEqual(findQuestion(catalogue, "name").tips, {
    general: [{ en: "As on your card.", zh: "与卡上一致。" }],
    senior: [{ en: "Write it like your card.", zh: "照卡上写。" }],
  });

  assert.deepEqual(
    Object.fromEntries(
      ["sig", "mail", "tel", "zip5", "born", "yr", "count"].map((id) => [
        id,
        findQuestion(catalogue, id).type,
      ]),
    ),
    {
      sig: "signature",
      mail: "email",
      tel: "phone",
      zip5: "zip",
      born: "date",
      yr: "year",
      count: "number",
    },
  );
  assert.deepEqual(findQuestion(catalogue, "zip5").heading, both("Part B: More", "更多"));
  assert.equal(findQuestion(catalogue, "tel").heading, undefined);

  assert.deepEqual(findQuestion(catalogue, "kids"), {
    id: "kids",
    type: "group",
    required: true,
    showIf: [{ field: "has_kids", op: "eq", value: "yes" }],
    fields: [
      {
        id: "name",
        type: "text",
        required: true,
        wording: both("Kid's name", "孩子的名字"),
      },
      {
        id: "months",
        type: "number",
        required: true,
        min: 0,
        max: 12,
        wording: both("Months at home", "在家月数"),
      },
    ],
    wording: both("Kids", "孩子"),
  });
  assert.deepEqual(
    catalogue.steps[2].sections[0].footer,
    both("Thanks.", "谢谢。"),
  );
  assert.equal(findQuestion(catalogue, "nonsense"), undefined);
  assert.equal(findQuestion(catalogue, "odd"), undefined);
  assert.ok(catalogue.materials.some((m) => m.id === "photo_id"));
  assert.deepEqual(catalogue.fixedOptions, {
    who: {
      options: [
        { value: "me", label: both("Me", "本人") },
        {
          value: "spouse",
          label: {
            general: { en: "My spouse", zh: "配偶" },
            senior: { en: "My spouse", zh: "我爱人" },
          },
        },
        { value: "none", label: both("No one", "均无") },
      ],
      spouseShowIf: RULES.joint_possible,
    },
    yesno: {
      options: [
        { value: "yes", label: both("Yes", "是") },
        { value: "no", label: both("No", "否") },
        { value: "not_sure", label: both("I'm not sure", "不确定") },
      ],
    },
  });
});

test("the build fails when a draft's conventions lack a fixed option's label", () => {
  const text = STANDARD.replace("  - `none` (No one / 均无), which clears the other two\n", "");
  assert.throws(() => parseDraft(text, { role: "standard" }), /^Error: intake-questions\.md: .*`none`/);
  assert.throws(() => build(STANDARD, SENIOR.replace("`not_sure` (I'm not sure / 不确定)", "")), /not_sure/);
});

test("parseDraft rejects lines outside the grammar with file:line", () => {
  const cases = [
    ["`name` · Text · Required", "`name` · Colour · Required", /unknown type/],
    ["`name` · Text · Required", "`name` · Text", /Required or Optional/],
    ["**Show if** `colour ≠ blue`", "**Show if** `colr ≠ blue`", /unknown field/],
    ["**Show if** `colour ≠ blue`", "**Show if** `colour ≠ green`", /not an option/],
    ["> Tip: As on your card. / 与卡上一致。", "Just some text", /unexpected line/],
    ["### Part B: More / 更多", "### Part B: More / 更多\n> Tip: Stray. / 游离。", /unexpected line/],
  ];
  for (const [from, to, reason] of cases) {
    const text = STANDARD.replace(from, to);
    const line = lineOf(text, to.split("\n").at(-1));
    assert.throws(
      () => parseDraft(text, { role: "standard" }),
      (error) => {
        assert.match(error.message, new RegExp(`^intake-questions\\.md:${line}: `));
        assert.match(error.message, reason);
        return true;
      },
      to,
    );
  }
  assert.throws(
    () => parseDraft(SENIOR.replace("`name` · Text", "`name` · Tx"), { role: "senior" }),
    /^Error: intake-questions-senior-v2\.md:\d+: /,
  );
});

test("the parser maps `Hidden id` to the id type, and only inside a group", () => {
  const withId = STANDARD.replace(
    "**Q5.1** Kid's name / 孩子的名字",
    "**Q5.0m** Kid id / 孩子编号\n`kids[i].member_id` · Hidden id · Optional\n\n**Q5.1** Kid's name / 孩子的名字",
  );
  const kids = parseDraft(withId, { role: "standard" }).sections.flatMap((s) => s.questions).find((q) => q.id === "kids");
  assert.deepEqual(kids.fields.map((f) => [f.id, f.type, f.required]), [
    ["member_id", "id", false],
    ["name", "text", true],
    ["months", "number", true],
  ]);
  const loose = STANDARD.replace(
    "**Q1.2** Story / 故事",
    "**Q1.1m** Stray id / 编号\n`stray_id` · Hidden id · Optional\n\n**Q1.2** Story / 故事",
  );
  assert.throws(
    () => parseDraft(loose, { role: "standard" }),
    (error) => {
      assert.match(error.message, new RegExp(`^intake-questions\\.md:${lineOf(loose, "`stray_id`")}: `));
      assert.match(error.message, /a hidden id belongs inside a group/);
      return true;
    },
  );
});

test("checkSubsteps refuses an unknown question, a question in two sub-steps and one in none", () => {
  const good = build();
  assert.doesNotThrow(() => checkSubsteps(good));
  const edit = (change) => {
    const copy = structuredClone(good);
    change(copy);
    return copy;
  };
  assert.throws(
    () => checkSubsteps(edit((c) => c.steps[0].substeps[0].questions.push("nonesuch"))),
    /unknown question 'nonesuch'/,
  );
  assert.throws(
    () => checkSubsteps(edit((c) => c.steps[1].substeps[1].questions.push("name"))),
    /'name' is in two sub-steps/,
  );
  assert.throws(
    () => checkSubsteps(edit((c) => c.steps[2].substeps[0].questions.push("colour"))),
    /'colour'.*another step/,
  );
  assert.throws(
    () => checkSubsteps(edit((c) => c.steps[0].substeps[0].questions.pop())),
    /'full'.*no sub-step/,
  );
  assert.throws(() => checkSubsteps(edit((c) => (c.steps[3].substeps = []))), /at least one sub-step/);
  assert.throws(
    () => checkSubsteps(edit((c) => (c.steps[0].substeps[0].kind = "wizard"))),
    /kind/,
  );
  // buildCatalogue runs the check itself.
  const missing = FIXTURE_STEPS.map((s) => ({
    ...s,
    substeps: s.substeps.map((x) => ({ ...x, questions: x.questions.filter((id) => id !== "yr") })),
  }));
  assert.throws(() => buildCatalogue(STANDARD, SENIOR, { steps: missing }), /'yr'.*no sub-step/);
});

test("buildCatalogue refuses drafts whose structure drifts apart", () => {
  const drifted = SENIOR.replace("`blue` Blue / 蓝", "`navy` Blue / 蓝");
  assert.throws(() => build(STANDARD, drifted), /colour/);
  const flagged = SENIOR.replace("`yr` · Year · Optional", "`yr` · Year · Required");
  assert.throws(() => build(STANDARD, flagged), /yr/);
  const shown = SENIOR.replace("`colour ≠ blue`", "`colour ≠ red`");
  assert.throws(() => build(STANDARD, shown), /hungry/);
  const extra = SENIOR.replace("  - `me` (Me / 本人)", "  - `me` (Me / 本人)\n  - `maybe` (Maybe / 也许)");
  assert.throws(() => build(STANDARD, extra), /fixedOptions/);
});

// ---------------------------------------------------------------------------
// The real drafts.

const STANDARD_TEXT = readFileSync(
  new URL("../docs/intake-questions/intake-questions.md", import.meta.url),
  "utf8",
);
const SENIOR_TEXT = readFileSync(
  new URL("../docs/intake-questions/intake-questions-senior-v2.md", import.meta.url),
  "utf8",
);

test("the committed catalogue module is a fresh build of the drafts", () => {
  assert.deepEqual(buildCatalogue(STANDARD_TEXT, SENIOR_TEXT), COMMITTED);
});

test("the real catalogue has the ten steps of the redesign", () => {
  assert.equal(COMMITTED.version, 2);
  assert.deepEqual(
    COMMITTED.steps.map((step) => [step.id, step.n, step.title.en, step.sections.map((s) => s.n)]),
    [
      ["before", 1, "Before you start", [0]],
      ["about", 2, "About you", [1, 2, 3, 4, 5, 8]],
      ["household", 3, "Household", [6]],
      ["income", 4, "Income", [9]],
      ["expenses", 5, "Expenses & life events", [10, 11]],
      ["refund", 6, "Refund & permission", [7, 14]],
      ["optional", 7, "Optional questions", [12]],
      ["documents", 8, "Documents", []],
      ["notes", 9, "Anything else", [13]],
      ["review", 10, "Review & submit", []],
    ],
  );
  for (const step of COMMITTED.steps) {
    assert.ok(step.title.zh, `step ${step.id} has a Chinese title`);
    assert.ok(step.substeps.length > 0, `step ${step.id} has a sub-step`);
    for (const sub of step.substeps)
      for (const variant of ["general", "senior"])
        for (const lang of ["en", "zh"]) assert.ok(sub.title[variant][lang], `${sub.id} ${variant} ${lang}`);
  }
  assert.doesNotThrow(() => checkSubsteps(COMMITTED));
});

test("the real sub-steps carry their kind, cards and lead lines", () => {
  const subs = COMMITTED.steps.flatMap((s) => s.substeps);
  assert.equal(subs.length, 32);
  const kinds = (id) => subs.find((x) => x.id === id).kind;
  assert.equal(kinds("income.wages"), "questions");
  assert.equal(kinds("review.summary"), "review");
  assert.deepEqual(
    subs.filter((x) => x.kind === "documents").map((x) => [x.id, x.cards, x.questions]),
    [
      ["documents.bring", "bring", []],
      ["documents.identity", "identity", []],
      ["documents.income", "income", []],
      ["documents.expenses", "expenses", []],
      ["documents.events", "events", []],
      ["documents.other", "other", []],
    ],
  );
  const lead = (id) => subs.find((x) => x.id === id).lead;
  const married = (en, zh, seniorZh) => ({ general: { en, zh }, senior: { en, zh: seniorZh } });
  assert.deepEqual(lead("income.rental"), married("Did you or your spouse receive any of these in 2025?", "2025 年，您或配偶是否有以下收入？", "2025 年，您或您爱人是否有以下收入？"));
  assert.deepEqual(lead("expenses.other"), married("Did you or your spouse pay for any of these in 2025?", "2025 年，您或配偶是否支付过以下费用？", "2025 年，您或您爱人是否支付过以下费用？"));
  assert.deepEqual(lead("expenses.events"), married("Did any of these happen to you or your spouse in 2025?", "2025 年，您或配偶是否发生过以下事项？", "2025 年，您或您爱人是否发生过以下事项？"));
  assert.equal(lead("about.you"), undefined);
  assert.equal(subs.filter((x) => x.lead).length, 9);
});

test("the real catalogue's unmarried wording, leads and intro", () => {
  const questions = allQuestions(COMMITTED);
  const unmarried = (id) => findQuestion(COMMITTED, id).wordingUnmarried;
  assert.deepEqual(questions.filter((q) => q.wordingUnmarried).map((q) => q.id).sort(), [
    "claimed_by_other", "digital_assets", "disabled", "fulltime_student", "inc_wages_job_count",
    "ippin", "legally_blind", "on_visa", "opt_veteran", "us_citizen",
  ]);
  assert.deepEqual(unmarried("us_citizen"), {
    general: { en: "Are you a U.S. citizen?", zh: "您是美国公民吗？" },
    senior: { en: "Are you a U.S. citizen?", zh: "您是美国公民吗？" },
  });
  assert.deepEqual(unmarried("ippin").senior, {
    en: "Did you get an Identity Protection PIN (IP PIN) from the IRS?",
    zh: "您收到过国税局（IRS）寄来的 6 位数字号码，叫\"身份保护码\"（IP PIN）吗？",
  });
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

test("the real drafts: every Tip that mentions uploading points to the Documents step", () => {
  for (const [name, text] of [["standard", STANDARD_TEXT], ["senior", SENIOR_TEXT]]) {
    const tips = text.split("\n").filter((line) => /^> Tip/.test(line) && /upload/i.test(line));
    assert.ok(tips.length > 15, name);
    // Q9.14's Tip carries the one other mention: the app's yearly tax summary.
    for (const line of tips.filter((x) => !/yearly tax summary/.test(x)))
      assert.match(line, /Documents step/, `${name}: ${line.slice(0, 80)}`);
  }
});

test("the real catalogue gains hh.member_id, and gcf_sp_date waits for the spouse's signature", () => {
  const hh = findQuestion(COMMITTED, "hh");
  assert.deepEqual([hh.fields[0].id, hh.fields[0].type, hh.fields[0].required], ["member_id", "id", false]);
  assert.deepEqual(findQuestion(COMMITTED, "gcf_sp_date").showIf, [
    { field: "gcf_consent", op: "eq", value: "yes" },
    { field: "marital_status", op: "eq", value: "married" },
    { field: "gcf_sp_signature", op: "filled" },
  ]);
  // Section 9's intro is gone (its lead lines replace it).
  const income = COMMITTED.steps.find((s) => s.id === "income");
  assert.equal(income.sections[0].intro, undefined);
});

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

test("every real question states required, and the optional set is the agreed list", () => {
  const questions = allQuestions(COMMITTED);
  const flat = questions.flatMap((q) => [
    q,
    ...(q.fields ?? []).map((f) => ({ ...f, id: `${q.id}.${f.id}` })),
  ]);
  for (const q of flat) assert.equal(typeof q.required, "boolean", q.id);
  assert.deepEqual(
    flat.filter((q) => !q.required).map((q) => q.id).sort(),
    [
      "tp_middle_name",
      "email",
      "best_contact_time",
      "best_contact_note",
      "addr_apt",
      "sp_middle_name",
      "sp_phone",
      "additional_notes",
      "opt_english_speak",
      "opt_english_read",
      "opt_household_disability",
      "opt_veteran",
      "opt_race_tp",
      "opt_race_sp",
      "gcf_consent",
      "gcf_tp_date",
      "gcf_sp_date",
      "inc_wages_job_count",
      "refund_method_other",
      "inc_other_desc",
      "evt_other_desc",
      "irs_language",
      "language_other",
      "language_also",
      "language_also_other",
      "form_version",
      "hh.member_id",
      "hh.middle_name",
    ].sort(),
  );
  const section12 = COMMITTED.steps.flatMap((s) => s.sections).find((s) => s.n === 12);
  assert.ok(section12.questions.length > 0);
  for (const q of section12.questions) assert.equal(q.required, false, `Section 12: ${q.id}`);
});

test("the real catalogue labels the who and yesno values from the drafts' conventions", () => {
  const { who, yesno } = COMMITTED.fixedOptions;
  assert.deepEqual(who.options.map((o) => o.value), ["me", "spouse", "none"]);
  assert.deepEqual(yesno.options.map((o) => o.value), ["yes", "no", "not_sure"]);
  for (const o of [...who.options, ...yesno.options])
    for (const variant of ["general", "senior"])
      for (const lang of ["en", "zh"]) assert.ok(o.label[variant][lang], `${o.value} ${variant} ${lang}`);
  const spouse = who.options[1].label;
  assert.deepEqual(spouse.general, { en: "My spouse", zh: "配偶" });
  assert.deepEqual(spouse.senior, { en: "My spouse", zh: "我爱人" });
  assert.deepEqual(yesno.options[2].label.senior, { en: "I'm not sure", zh: "我不确定" });
  assert.deepEqual(yesno.options[0].label.general, { en: "Yes", zh: "是" });
  assert.deepEqual(who.spouseShowIf, RULES.joint_possible);
});

test("the real catalogue keeps service, language, form_version, hh and the phones", () => {
  const values = (id) => findQuestion(COMMITTED, id).options.map((o) => o.value);
  const service = findQuestion(COMMITTED, "service");
  assert.equal(service.type, "choice");
  assert.equal(service.required, true);
  assert.deepEqual(values("service"), ["same_day", "drop_off", "online"]);
  assert.deepEqual(service.options[1].label.general, { en: "Drop-off", zh: "送件办理" });
  const language = findQuestion(COMMITTED, "language");
  assert.equal(language.required, true);
  assert.deepEqual(values("language"), ["english", "cantonese", "mandarin", "other"]);
  const other = findQuestion(COMMITTED, "language_other");
  assert.equal(other.type, "text");
  assert.equal(other.required, false);
  assert.deepEqual(other.showIf, [{ field: "language", op: "eq", value: "other" }]);

  // Q0.5 and Q0.6: the client's other languages (allow-multiple-service-languages, design D1, D2).
  const also = findQuestion(COMMITTED, "language_also");
  assert.equal(also.type, "multi");
  assert.equal(also.required, false);
  assert.deepEqual(values("language_also"), values("language"));
  assert.deepEqual(
    also.options.map((o) => o.label.general),
    language.options.map((o) => o.label.general),
  );
  const alsoOther = findQuestion(COMMITTED, "language_also_other");
  assert.equal(alsoOther.type, "text");
  assert.equal(alsoOther.required, false);
  assert.deepEqual(alsoOther.showIf, [{ field: "language_also", op: "eq", value: "other" }]);

  const version = findQuestion(COMMITTED, "form_version");
  assert.equal(version.required, false);
  assert.deepEqual(values("form_version"), ["general", "senior"]);

  const hh = findQuestion(COMMITTED, "hh");
  assert.equal(hh.type, "group");
  assert.deepEqual(hh.showIf, [{ field: "has_household_members", op: "eq", value: "yes" }]);
  const fieldIds = hh.fields.map((f) => f.id);
  for (const id of ["first_name", "last_name", "dob", "relationship", "months_lived"])
    assert.ok(fieldIds.includes(id), id);
  const months = hh.fields.find((f) => f.id === "months_lived");
  assert.deepEqual([months.type, months.min, months.max], ["number", 0, 12]);
  assert.deepEqual(
    hh.fields.find((f) => f.id === "relationship").options.map((o) => o.value),
    [
      "son_daughter",
      "stepchild",
      "foster_child",
      "grandchild",
      "sibling",
      "niece_nephew",
      "parent",
      "grandparent",
      "other_relative",
      "none",
    ],
  );

  assert.equal(findQuestion(COMMITTED, "tp_phone").type, "phone");
  assert.equal(findQuestion(COMMITTED, "sp_phone").type, "phone");
  assert.deepEqual(
    COMMITTED.materials.map((m) => m.id),
    [
      "photo_id",
      "ssn_itin",
      "green_card",
      "birth_certificate",
      "w2",
      "1099nec",
      "1099misc",
      "1099int",
      "1098t",
      "1095a",
      "prior_year_1040",
    ],
  );
  assert.deepEqual(COMMITTED.materials[0].label, { en: "Photo ID", zh: "带照片身份证件" });
});

// ---------------------------------------------------------------------------
// The hash and the migration writer.

test("the database is never behind the browser: the newest catalogue migration records this catalogue", () => {
  const entries = readMigrationEntries(fileURLToPath(new URL("../supabase/migrations/", import.meta.url)));
  assert.equal(nextCatalogueMigration(buildCatalogue(STANDARD_TEXT, SENIOR_TEXT), entries), null);
});

test("012 exists, the newest catalogue migration carries the current hash, and no two share a hash8", () => {
  const names = readdirSync(fileURLToPath(new URL("../supabase/migrations/", import.meta.url)))
    .filter((name) => /^\d{3}_intake_catalogue_[0-9a-f]{8}\.sql$/.test(name))
    .sort();
  const hash = catalogueHash(buildCatalogue(STANDARD_TEXT, SENIOR_TEXT));
  assert.match(names[0], /^012_intake_catalogue_[0-9a-f]{8}\.sql$/);
  assert.match(names.at(-1), new RegExp(`^\\d{3}_intake_catalogue_${hash.slice(0, 8)}\\.sql$`));
  const hashes = names.map((name) => name.slice(-12, -4));
  assert.equal(new Set(hashes).size, hashes.length, "two catalogue migrations share a hash8");
});

test("catalogueHash is the SHA-256 of the key-sorted, unspaced JSON of the loader version and catalogue", () => {
  assert.equal(LOADER_VERSION, 2);
  const expected = createHash("sha256")
    .update('{"catalogue":{"a":[{"x":1,"y":2}],"b":1},"loaderVersion":2}')
    .digest("hex");
  assert.equal(catalogueHash({ b: 1, a: [{ y: 2, x: 1 }] }), expected);
});

test("bumping LOADER_VERSION changes the hash, and so writes a new catalogue migration, for the same catalogue", () => {
  const catalogue = build();
  const current = catalogueHash(catalogue);
  const bumped = catalogueHash(catalogue, LOADER_VERSION + 1);
  assert.notEqual(bumped, current);
  assert.equal(catalogueHash(catalogue, LOADER_VERSION), current);
  const recorded = nextCatalogueMigration(catalogue, ["011_intake_v2.sql"]);
  const entries = ["011_intake_v2.sql", recorded];
  assert.equal(nextCatalogueMigration(catalogue, entries), null);
  const next = nextCatalogueMigration(catalogue, entries, { loaderVersion: LOADER_VERSION + 1 });
  assert.equal(next.name, `013_intake_catalogue_${bumped.slice(0, 8)}.sql`);
  assert.match(next.text, new RegExp(`^-- catalogue-hash: ${bumped}$`, "m"));
});

test("nextCatalogueMigration names, skips and round-trips catalogue migrations", () => {
  const catalogue = build();
  const hash = catalogueHash(catalogue);

  const first = nextCatalogueMigration(catalogue, ["010_client_numbers.sql", "011_intake_v2.sql"]);
  assert.equal(first.name, `012_intake_catalogue_${hash.slice(0, 8)}.sql`);
  assert.match(first.text, new RegExp(`^-- catalogue-hash: ${hash}$`, "m"));

  const recorded = { name: first.name, text: first.text };
  assert.equal(nextCatalogueMigration(catalogue, ["011_intake_v2.sql", recorded]), null);

  const stale = {
    name: "012_intake_catalogue_00000000.sql",
    text: `-- catalogue-hash: ${"0".repeat(64)}\nselect 1;\n`,
  };
  assert.equal(
    nextCatalogueMigration(catalogue, ["011_intake_v2.sql", stale, "013_contact_materials.sql"]).name,
    `014_intake_catalogue_${hash.slice(0, 8)}.sql`,
  );

  const literal = first.text.match(
    /^select vitally_private\.load_intake_catalogue\(2::smallint, '(.*)'::jsonb\);$/m,
  );
  assert.ok(literal, first.text.slice(0, 200));
  assert.deepEqual(JSON.parse(literal[1].replaceAll("''", "'")), catalogue);
});

test("the spouse rules, exactly (add-widowed-spouse-rules)", () => {
  const married = { field: "marital_status", op: "eq", value: "married" };
  const widowedFrom = (year) => [
    { field: "marital_status", op: "eq", value: "widowed" },
    { field: "spouse_death_year", op: "gte", value: year },
    { field: "spouse_death_year", op: "lte", value: 2025 },
  ];
  assert.equal(TAX_YEAR, 2025);
  assert.deepEqual(RULES.spouse_on_return, [{ op: "any", groups: [[married], widowedFrom(2023)] }]);
  assert.deepEqual(RULES.joint_possible, [{ op: "any", groups: [[married], widowedFrom(2025)] }]);
});

test("a 'rule' clause expands to the named rule, and AND joins it with other clauses (add-widowed-spouse-rules)", () => {
  const phone = "`sp_phone` · Phone · Optional\n**Show if** `marital_status = married`";
  assert.ok(STANDARD_TEXT.includes(phone));
  const showIfOf = (text, id) =>
    parseDraft(text, { role: "standard" }).sections.flatMap((s) => s.questions).find((q) => q.id === id).showIf;
  assert.deepEqual(showIfOf(STANDARD_TEXT, "sp_first_name"), RULES.spouse_on_return);
  const joined = STANDARD_TEXT.replace(phone, "`sp_phone` · Phone · Optional\n**Show if** rule `joint_possible` AND `tp_phone` is filled");
  assert.deepEqual(showIfOf(joined, "sp_phone"), [...RULES.joint_possible, { field: "tp_phone", op: "filled" }]);
  const unknown = STANDARD_TEXT.replace(phone, "`sp_phone` · Phone · Optional\n**Show if** rule `nope`");
  assert.throws(() => parseDraft(unknown, { role: "standard" }), /unreadable condition/);
});

test("a Year can carry a range, and spouse_death_year's must end at the tax year (add-widowed-spouse-rules)", () => {
  const year = parseDraft(STANDARD_TEXT, { role: "standard" }).sections.flatMap((s) => s.questions).find((q) => q.id === "spouse_death_year");
  assert.deepEqual([year.type, year.min, year.max], ["year", 1900, 2025]);
  const range = "`spouse_death_year` · Year 1900–2025 · Required";
  assert.ok(STANDARD_TEXT.includes(range) && SENIOR_TEXT.includes(range));
  const backwards = (text) => text.replace(range, "`spouse_death_year` · Year 2025–1900 · Required");
  assert.throws(() => parseDraft(backwards(STANDARD_TEXT), { role: "standard" }), /low to high/);
  const early = (text) => text.replace(range, "`spouse_death_year` · Year 1900–2024 · Required");
  assert.throws(() => buildCatalogue(early(STANDARD_TEXT), early(SENIOR_TEXT)), /tax year 2025/);
});

test("the real catalogue's spouse questions follow the two rules (add-widowed-spouse-rules)", () => {
  assert.deepEqual(COMMITTED.rules, RULES);
  for (const id of ["sp_first_name", "sp_middle_name", "sp_last_name", "sp_dob"])
    assert.deepEqual(findQuestion(COMMITTED, id).showIf, RULES.spouse_on_return, id);
  for (const id of ["sp_job_title", "opt_race_sp"]) assert.deepEqual(findQuestion(COMMITTED, id).showIf, RULES.joint_possible, id);
  const married = { field: "marital_status", op: "eq", value: "married" };
  assert.deepEqual(findQuestion(COMMITTED, "sp_phone").showIf, [married]);
  for (const id of ["gcf_sp_signature", "gcf_sp_date", "married_last_day", "lived_apart_last_6mo"])
    assert.ok(findQuestion(COMMITTED, id).showIf.some((c) => c.op === "eq" && c.field === "marital_status" && c.value === "married"), id);
  const spouse = COMMITTED.steps.flatMap((s) => s.substeps).find((s) => s.id === "about.spouse");
  assert.deepEqual(spouse.titleWidowed, {
    general: { en: "Your late spouse", zh: "已故配偶" },
    senior: { en: "Your late spouse", zh: "已故配偶" },
  });
  const year = findQuestion(COMMITTED, "spouse_death_year");
  assert.deepEqual([year.min, year.max], [1900, TAX_YEAR]);
});
