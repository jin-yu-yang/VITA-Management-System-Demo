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
      spouseShowIf: [{ field: "marital_status", op: "eq", value: "married" }],
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
  assert.deepEqual(lead("income.rental"), titled("Did you or your spouse receive any of these in 2025?", "2025 年，您或配偶是否有以下收入？"));
  assert.deepEqual(lead("expenses.other"), titled("Did you or your spouse pay for any of these in 2025?", "2025 年，您或配偶是否支付过以下费用？"));
  assert.deepEqual(lead("expenses.events"), titled("Did any of these happen to you or your spouse in 2025?", "2025 年，您或配偶是否发生过以下事项？"));
  assert.equal(lead("about.you"), undefined);
  assert.equal(subs.filter((x) => x.lead).length, 9);
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
      "gcf_tp_signature",
      "gcf_tp_date",
      "gcf_sp_signature",
      "gcf_sp_date",
      "inc_wages_job_count",
      "refund_method_other",
      "inc_other_desc",
      "evt_other_desc",
      "irs_language",
      "language_other",
      "form_version",
      "hh.member_id",
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
  assert.deepEqual(who.spouseShowIf, [{ field: "marital_status", op: "eq", value: "married" }]);
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
