import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  parseDraft,
  buildCatalogue,
  catalogueHash,
  nextCatalogueMigration,
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

const SENIOR = STANDARD.replace(
  "**Q0.1** Pick a colour / 选颜色",
  "**Q0.1** Which colour do you like? / 您喜欢什么颜色？",
)
  .replace("`red` Red / 红", "`red` Red, like fire / 红色，像火")
  .replace(
    "> Tip: As on your card. / 与卡上一致。",
    "> Tip: Write it like your card. / 照卡上写。",
  )
  .replace("## Section 1: Details / 详情", "## Section 1: About you / 关于您");

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
  const catalogue = buildCatalogue(STANDARD, SENIOR);
  assert.equal(catalogue.version, 2);
  assert.equal(catalogue.steps.length, 9);
  assert.deepEqual(
    catalogue.steps.map((step) => step.sections.map((s) => s.n)),
    [[0], [1], [], [5], [], [], [], [], []],
  );

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
    catalogue.steps[3].sections[0].footer,
    both("Thanks.", "谢谢。"),
  );
  assert.equal(findQuestion(catalogue, "nonsense"), undefined);
  assert.equal(findQuestion(catalogue, "odd"), undefined);
  assert.ok(catalogue.materials.some((m) => m.id === "photo_id"));
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

test("buildCatalogue refuses drafts whose structure drifts apart", () => {
  const drifted = SENIOR.replace("`blue` Blue / 蓝", "`navy` Blue / 蓝");
  assert.throws(() => buildCatalogue(STANDARD, drifted), /colour/);
  const flagged = SENIOR.replace("`yr` · Year · Optional", "`yr` · Year · Required");
  assert.throws(() => buildCatalogue(STANDARD, flagged), /yr/);
  const shown = SENIOR.replace("`colour ≠ blue`", "`colour ≠ red`");
  assert.throws(() => buildCatalogue(STANDARD, shown), /hungry/);
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

test("the real catalogue has the nine steps of spec 2.3", () => {
  assert.equal(COMMITTED.version, 2);
  assert.deepEqual(
    COMMITTED.steps.map((step) => [step.n, step.title.en, step.sections.map((s) => s.n)]),
    [
      [1, "Before you start", [0]],
      [2, "About you", [1, 2]],
      [3, "Marriage & spouse", [3, 4]],
      [4, "Your 2025 situation", [5]],
      [5, "Household", [6]],
      [6, "Income", [9]],
      [7, "Expenses & events", [10, 11]],
      [8, "Refund & preferences", [7, 8, 12, 13]],
      [9, "Consent", [14]],
    ],
  );
  for (const step of COMMITTED.steps) {
    assert.ok(step.title.zh, `step ${step.n} has a Chinese title`);
    assert.ok(
      step.sections.some((section) => section.questions.length > 0),
      `step ${step.n} has a question`,
    );
  }
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
    ].sort(),
  );
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

test("catalogueHash is the SHA-256 of the key-sorted, unspaced JSON", () => {
  const expected = createHash("sha256").update('{"a":[{"x":1,"y":2}],"b":1}').digest("hex");
  assert.equal(catalogueHash({ b: 1, a: [{ y: 2, x: 1 }] }), expected);
});

test("nextCatalogueMigration names, skips and round-trips catalogue migrations", () => {
  const catalogue = buildCatalogue(STANDARD, SENIOR);
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
