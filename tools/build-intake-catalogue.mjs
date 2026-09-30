// Builds the version-2 intake catalogue from the two drafts in
// `docs/intake-questions/` (spec docs/superpowers/specs/2026-09-29-intake-catalogue-design.md §2).
//
// The standard draft supplies every field's ID, type, options, required flag
// and show-if rule, plus the standard wording; the senior draft supplies only
// the senior wording, and its structure must equal the standard one's.
//
// Outputs:
//   - `src/intake-catalogue-data.mjs`, the catalogue as `export default {…}`
//     (a module, not JSON, because server.mjs serves only /src/<name>.mjs|css|svg|png);
//   - the next `supabase/migrations/NNN_intake_catalogue_<hash8>.sql`, only when
//     the hash of the catalogue and LOADER_VERSION differs from the newest
//     catalogue migration's and `011_intake_v2.sql` (which defines the loader)
//     exists.
//
// Run with:
//   node tools/build-intake-catalogue.mjs        (npm run build:intake)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const FILES = {
  standard: "intake-questions.md",
  senior: "intake-questions-senior-v2.md",
};

// Draft type names (as written on the ID line) → catalogue types.
const TYPES = {
  Text: "text",
  "Long text": "longtext",
  Signature: "signature",
  Email: "email",
  Phone: "phone",
  ZIP: "zip",
  Date: "date",
  Year: "year",
  Number: "number",
  "Single choice": "choice",
  "Multi-select": "multi",
  "Who (multi-select)": "who",
  "Yes / No": "yesno",
  "Yes / No / Not sure": "yesno",
  Group: "group",
};

// Fixed value sets of the types that carry no option lines.
const FIXED_OPTIONS = {
  "Who (multi-select)": ["me", "spouse", "none"],
  "Yes / No": ["yes", "no"],
  "Yes / No / Not sure": ["yes", "no", "not_sure"],
};

// Spec §2.3: the nine steps and the draft sections each one shows. The Chinese
// step titles are new wording (the drafts have none) for the group to review.
const STEPS = [
  { n: 1, title: { en: "Before you start", zh: "开始之前" }, sections: [0] },
  { n: 2, title: { en: "About you", zh: "关于您" }, sections: [1, 2] },
  { n: 3, title: { en: "Marriage & spouse", zh: "婚姻与配偶" }, sections: [3, 4] },
  { n: 4, title: { en: "Your 2025 situation", zh: "您 2025 年的情况" }, sections: [5] },
  { n: 5, title: { en: "Household", zh: "家庭成员" }, sections: [6] },
  { n: 6, title: { en: "Income", zh: "收入" }, sections: [9] },
  { n: 7, title: { en: "Expenses & events", zh: "支出与事项" }, sections: [10, 11] },
  { n: 8, title: { en: "Refund & preferences", zh: "退税与偏好" }, sections: [7, 8, 12, 13] },
  { n: 9, title: { en: "Consent", zh: "同意书" }, sections: [14] },
];

// Spec §3.5 / D9: the materials checklist, mirrored by vitally_private.materials_items().
const MATERIALS = [
  { id: "photo_id", label: { en: "Photo ID", zh: "带照片身份证件" } },
  { id: "ssn_itin", label: { en: "SSN / ITIN", zh: "社会安全号码 / ITIN" } },
  { id: "green_card", label: { en: "Green card", zh: "绿卡" } },
  { id: "birth_certificate", label: { en: "Birth certificate", zh: "出生证明" } },
  { id: "w2", label: { en: "W-2", zh: "W-2 表" } },
  { id: "1099nec", label: { en: "1099-NEC", zh: "1099-NEC 表" } },
  { id: "1099misc", label: { en: "1099-MISC", zh: "1099-MISC 表" } },
  { id: "1099int", label: { en: "1099-INT", zh: "1099-INT 表" } },
  { id: "1098t", label: { en: "1098-T", zh: "1098-T 表" } },
  { id: "1095a", label: { en: "1095-A", zh: "1095-A 表" } },
  { id: "prior_year_1040", label: { en: "Prior-year return (1040)", zh: "去年的报税表（1040）" } },
];

// Option values whose labels come from each draft's Design Conventions.
const CONVENTION_VALUES = ["me", "spouse", "none", "not_sure"];

// "Yes" and "No" have no Chinese in the conventions. Section 12's options use
// "Yes / 是" and "No / 否" (standard Q12.3); the build takes them from there
// and falls back to these, for both variants.
const YES_NO_FALLBACK = { yes: { en: "Yes", zh: "是" }, no: { en: "No", zh: "否" } };

const CJK = /[\p{Script=Han}　-〿＀-￯]/u;
const ID = "[a-z][a-z0-9_]*";
const VALUE = "[a-z0-9_]+";

// ---------------------------------------------------------------------------
// Parsing one draft.

// "English / 中文": split at the last " / " before the first Chinese character,
// so English that itself contains " / " ("Son / Daughter / 子女") stays whole.
function splitWording(text) {
  const first = text.search(CJK);
  if (first < 0) return null;
  const at = text.lastIndexOf(" / ", first);
  if (at <= 0) return null;
  const en = text.slice(0, at).trim();
  const zh = text.slice(at + 3).trim();
  if (!en || !zh || CJK.test(en)) return null;
  return { en, zh };
}

function parseCondition(text) {
  return text.split(" AND ").map((clause) => {
    let m = clause.match(new RegExp(`^\`(${ID}) (=|≠) (${VALUE})\`$`));
    if (m) return { field: m[1], op: m[2] === "=" ? "eq" : "ne", value: m[3] };
    m = clause.match(new RegExp(`^\`(${ID})\` is filled$`));
    if (m) return { field: m[1], op: "filled" };
    return null;
  });
}

// Intro and footer text: blockquote or plain lines, each English or Chinese
// (or "English / 中文" on one line); a blank line is a paragraph break.
function textBlock() {
  const en = [];
  const zh = [];
  return {
    add(line) {
      const text = line.replace(/^>\s?/, "");
      if (text.trim() === "") return this.brk();
      const both = CJK.test(text) ? splitWording(text) : null;
      if (both) {
        en.push(both.en);
        zh.push(both.zh);
      } else if (CJK.test(text)) zh.push(text);
      else en.push(text);
    },
    brk() {
      en.push("");
      zh.push("");
    },
    result() {
      const tidy = (lines) =>
        lines
          .filter((line, i) => line !== "" || (i > 0 && lines[i - 1] !== ""))
          .join("\n")
          .trim();
      const out = { en: tidy(en), zh: tidy(zh) };
      return out.en || out.zh ? out : null;
    },
  };
}

/**
 * Parses one draft into `{ sections }`, each question in one wording. Throws
 * `Error("<file>:<line>: <reason>")` on any line outside the grammar.
 */
export function parseDraft(markdownText, { role = "standard", file = FILES[role] ?? role } = {}) {
  const lines = markdownText.split("\n");
  const fail = (lineNo, reason) => {
    throw new Error(`${file}:${lineNo}: ${reason}`);
  };
  const sections = [];
  let section = null; // the numbered section being read, or null while ignoring
  let mode = "skip"; // skip | intro | body | footer
  let block = null; // intro or footer text being collected
  let question = null; // the last question (or group sub-field) read
  let group = null; // the open group of this section
  let heading = null; // a pending "### " heading for the next question
  const conditions = []; // [{ lineNo, list }] checked once every field is known
  const conventions = {}; // value → {en, zh}, from the Design Conventions bullets

  const closeBlock = () => {
    if (!block) return;
    const text = block.block.result();
    if (text) section[block.key] = text;
    block = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i].trimEnd();

    if (line.startsWith("## ")) {
      closeBlock();
      const m = line.match(/^## Section (\d+): (.+)$/);
      if (!m) {
        section = null;
        mode = /^## Design Conventions\b/.test(line) ? "conventions" : "skip";
        continue;
      }
      const title = splitWording(m[2]);
      if (!title) fail(lineNo, "a section title must be 'English / 中文'");
      section = { n: Number(m[1]), title, questions: [] };
      sections.push(section);
      mode = "intro";
      block = { key: "intro", block: textBlock() };
      question = null;
      group = null;
      heading = null;
      continue;
    }
    if (mode === "skip") continue;
    if (mode === "conventions") {
      // The labels of the fixed option sets: "`me` (Me / 本人)", "`not_sure` (I'm not sure / 不确定)".
      for (const cm of line.matchAll(new RegExp(`\`(${VALUE})\` \\(([^)]*)\\)`, "g"))) {
        const label = splitWording(cm[2]);
        if (!label) fail(lineNo, `the conventions' label for '${cm[1]}' must be 'English / 中文'`);
        if (conventions[cm[1]]) fail(lineNo, `the conventions define '${cm[1]}' twice`);
        conventions[cm[1]] = label;
      }
      continue;
    }
    if (line === "---") continue;
    if (line.trim() === "") {
      if (block) block.block.brk();
      continue;
    }
    if (/^> Note for developers:/.test(line)) continue;

    if (line === "**Footer text:**") {
      if (mode === "footer") fail(lineNo, "a second footer");
      closeBlock();
      mode = "footer";
      block = { key: "footer", block: textBlock() };
      continue;
    }
    if (mode === "footer") {
      if (/^(\*\*Q|### |`)/.test(line)) fail(lineNo, "unexpected line after the footer");
      block.block.add(line);
      continue;
    }

    let m = line.match(/^### (.+)$/);
    if (m) {
      closeBlock();
      if (heading) fail(lineNo, "two headings in a row");
      heading = splitWording(m[1]);
      if (!heading) fail(lineNo, "a heading must be 'English / 中文'");
      mode = "body";
      question = null; // attribute lines may not follow a heading
      continue;
    }

    m = line.match(/^\*\*Q(\d+)\.([0-9A-Za-z]+)\*\* (.+)$/);
    if (m) {
      closeBlock();
      mode = "body";
      if (Number(m[1]) !== section.n)
        fail(lineNo, `question Q${m[1]}.${m[2]} is in Section ${section.n}`);
      const wording = splitWording(m[3]);
      if (!wording) fail(lineNo, "question wording must be 'English / 中文'");
      const idLineNo = lineNo + 1;
      const idLine = (lines[i + 1] ?? "").trimEnd();
      i += 1;
      const parts = idLine.split(" · ");
      const idMatch = (parts[0] ?? "").match(
        new RegExp(`^\`(?:(${ID})\\[i\\]\\.)?(${ID})\`$`),
      );
      if (!idMatch) fail(idLineNo, "expected '`field_id` · Type · Required|Optional' after the question");
      if (parts.length !== 3 || !/^(Required|Optional)$/.test(parts[2]))
        fail(idLineNo, "the ID line must end with Required or Optional");
      const [, groupId, id] = idMatch;
      let typeName = parts[1];
      let min;
      let max;
      const range = typeName.match(/^Number (\d+)[–-](\d+)$/);
      if (range) {
        typeName = "Number";
        min = Number(range[1]);
        max = Number(range[2]);
        if (min > max) fail(idLineNo, "a number range must run low to high");
      }
      const type = TYPES[typeName];
      if (!type) fail(idLineNo, `unknown type '${parts[1]}'`);
      question = { id, type, required: parts[2] === "Required" };
      if (min !== undefined) Object.assign(question, { min, max });
      if (FIXED_OPTIONS[typeName])
        question.options = FIXED_OPTIONS[typeName].map((value) => ({ value }));
      if (type === "choice" || type === "multi") question.options = [];
      if (heading) question.heading = heading;
      heading = null;
      question.tips = [];
      question.wording = wording;
      question.line = lineNo;
      question.idLine = idLineNo;

      if (groupId) {
        if (!group || group.id !== groupId)
          fail(idLineNo, `'${groupId}[i].${id}' follows no '${groupId}' group in this section`);
        if (type === "group") fail(idLineNo, "a group cannot hold a group");
        if (group.fields.some((f) => f.id === id)) fail(idLineNo, `duplicate field '${groupId}[i].${id}'`);
        group.fields.push(question);
      } else {
        if (group) fail(idLineNo, `'${id}' follows the '${group.id}' group; only its fields may`);
        if (type === "group") {
          question.fields = [];
          group = question;
        }
        section.questions.push(question);
      }
      continue;
    }

    if (mode === "intro") {
      if (/^\*\*(Page text|Intro text)[^*]*:\*\*$/.test(line)) continue;
      if (/^(- `|`|\*\*Show if\*\*|> Tip)/.test(line)) fail(lineNo, "an attribute line before any question");
      block.block.add(line);
      continue;
    }

    // Attribute lines of the current question.
    if (!question) fail(lineNo, "unexpected line");
    if (line.startsWith("- ")) {
      if (question.type !== "choice" && question.type !== "multi")
        fail(lineNo, `a ${question.type} question takes no options`);
      for (const item of line.slice(2).split(" · ")) {
        const om = item.match(new RegExp(`^\`(${VALUE})\` (.+)$`));
        const label = om && splitWording(om[2]);
        if (!label) fail(lineNo, "an option must be '`value` English / 中文'");
        if (question.options.some((o) => o.value === om[1]))
          fail(lineNo, `duplicate option '${om[1]}'`);
        question.options.push({ value: om[1], label });
      }
      continue;
    }
    m = line.match(/^> Tip(?: \(show if (.+?)\))?: (.+)$/);
    if (m) {
      const tip = {};
      if (m[1]) {
        const list = parseCondition(m[1]);
        if (list.includes(null)) fail(lineNo, `unreadable condition '${m[1]}'`);
        tip.showIf = list;
        conditions.push({ lineNo, list });
      }
      const wording = splitWording(m[2]);
      if (!wording) fail(lineNo, "a tip must be 'English / 中文'");
      Object.assign(tip, wording);
      question.tips.push(tip);
      continue;
    }
    m = line.match(/^\*\*Show if\*\* (.+)$/);
    if (m) {
      if (question.showIf) fail(lineNo, "a second show-if line");
      const list = parseCondition(m[1]);
      if (list.includes(null)) fail(lineNo, `unreadable condition '${m[1]}'`);
      question.showIf = list;
      conditions.push({ lineNo, list });
      continue;
    }
    fail(lineNo, `unexpected line '${line.slice(0, 60)}'`);
  }
  closeBlock();

  // Whole-draft checks.
  const top = new Map();
  for (const s of sections)
    for (const q of s.questions) {
      if (top.has(q.id)) fail(q.idLine, `duplicate field '${q.id}'`);
      top.set(q.id, q);
      const all = [q, ...(q.fields ?? [])];
      for (const f of all)
        if ((f.type === "choice" || f.type === "multi") && f.options.length === 0)
          fail(f.idLine, `'${f.id}' needs options`);
      if (q.type === "group" && q.fields.length === 0) fail(q.idLine, `group '${q.id}' has no fields`);
    }
  for (const { lineNo, list } of conditions)
    for (const c of list) {
      const target = top.get(c.field);
      if (!target) fail(lineNo, `show-if names unknown field '${c.field}'`);
      if (c.op !== "filled" && !(target.options ?? []).some((o) => o.value === c.value))
        fail(lineNo, `show-if value '${c.value}' is not an option of '${c.field}'`);
    }
  for (const value of CONVENTION_VALUES)
    if (!conventions[value])
      throw new Error(`${file}: the Design Conventions don't give the label of \`${value}\``);
  return { sections, conventions };
}

// ---------------------------------------------------------------------------
// Merging the two drafts.

const skeleton = (q) => ({
  id: q.id,
  type: q.type,
  required: q.required,
  min: q.min,
  max: q.max,
  options: q.options?.map((o) => o.value),
  showIf: q.showIf,
  heading: Boolean(q.heading),
  fields: q.fields?.map(skeleton),
});

const variants = (general, senior) => ({ general, senior });

function mergeQuestion(g, s) {
  const out = { id: g.id, type: g.type, required: g.required };
  if (g.min !== undefined) Object.assign(out, { min: g.min, max: g.max });
  if (g.options)
    out.options = g.options.map((o, i) =>
      o.label ? { value: o.value, label: variants(o.label, s.options[i].label) } : { value: o.value },
    );
  if (g.showIf) out.showIf = g.showIf;
  if (g.heading) out.heading = variants(g.heading, s.heading);
  if (g.tips.length || s.tips.length) out.tips = variants(g.tips, s.tips);
  if (g.fields) out.fields = g.fields.map((f, i) => mergeQuestion(f, s.fields[i]));
  out.wording = variants(g.wording, s.wording);
  return out;
}

// Labels of the `who` and `yesno` values, shared by every such question (a
// question's own `options` still lists which values it offers).
function fixedOptions(general, senior) {
  const section12 = general.sections.find((s) => s.n === 12)?.questions ?? [];
  const yesNo = (value) =>
    section12
      .flatMap((q) => q.options ?? [])
      .find((o) => o.value === value && o.label)?.label ?? YES_NO_FALLBACK[value];
  const label = (value) =>
    value === "yes" || value === "no"
      ? variants(yesNo(value), yesNo(value))
      : variants(general.conventions[value], senior.conventions[value]);
  const options = (values) => values.map((value) => ({ value, label: label(value) }));
  return {
    who: {
      options: options(FIXED_OPTIONS["Who (multi-select)"]),
      spouseShowIf: [{ field: "marital_status", op: "eq", value: "married" }],
    },
    yesno: { options: options(FIXED_OPTIONS["Yes / No / Not sure"]) },
  };
}

/**
 * Builds the catalogue (spec §2.4, version 2) from the two drafts' texts.
 * Throws if their IDs, types, options, required flags or show-if rules differ.
 */
export function buildCatalogue(standardText, seniorText) {
  const general = parseDraft(standardText, { role: "standard" });
  const senior = parseDraft(seniorText, { role: "senior" });
  const sectionsNs = (d) => d.sections.map((s) => s.n).join(",");
  if (sectionsNs(general) !== sectionsNs(senior))
    throw new Error(`the drafts differ in their sections: ${sectionsNs(general)} / ${sectionsNs(senior)}`);

  const conventionValues = (d) => Object.keys(d.conventions).sort().join(",");
  if (conventionValues(general) !== conventionValues(senior))
    throw new Error(
      `the drafts differ in fixedOptions: ${conventionValues(general)} / ${conventionValues(senior)}`,
    );

  const byN = new Map();
  general.sections.forEach((g, index) => {
    const s = senior.sections[index];
    const count = Math.max(g.questions.length, s.questions.length);
    for (let i = 0; i < count; i++) {
      const a = g.questions[i];
      const b = s.questions[i];
      const left = JSON.stringify(a && skeleton(a));
      const right = JSON.stringify(b && skeleton(b));
      if (left !== right)
        throw new Error(
          `the drafts differ at '${a?.id ?? b?.id}' (Section ${g.n}): ${left} / ${right}`,
        );
    }
    for (const key of ["intro", "footer"])
      if (Boolean(g[key]) !== Boolean(s[key]))
        throw new Error(`the drafts differ in Section ${g.n}'s ${key}`);
    const out = { n: g.n, title: variants(g.title, s.title) };
    if (g.intro) out.intro = variants(g.intro, s.intro);
    out.questions = g.questions.map((q, i) => mergeQuestion(q, s.questions[i]));
    if (g.footer) out.footer = variants(g.footer, s.footer);
    byN.set(g.n, out);
  });

  const mapped = STEPS.flatMap((step) => step.sections);
  for (const n of byN.keys())
    if (!mapped.includes(n)) throw new Error(`Section ${n} belongs to no step`);

  return {
    version: 2,
    steps: STEPS.map((step) => ({
      n: step.n,
      title: step.title,
      sections: step.sections.filter((n) => byN.has(n)).map((n) => byN.get(n)),
    })),
    fixedOptions: fixedOptions(general, senior),
    materials: MATERIALS,
  };
}

// ---------------------------------------------------------------------------
// Hash and migration.

const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;

// Bump when 011's load_intake_catalogue or the intake_fields columns change.
// It is part of the hash, so a bump makes the build write a new catalogue
// migration even though the catalogue itself is unchanged.
export const LOADER_VERSION = 1;

/**
 * SHA-256 hex of the canonical JSON (keys sorted, no whitespace) of
 * `{ loaderVersion, catalogue }`, so the hash covers the loader too.
 */
export function catalogueHash(catalogue, loaderVersion = LOADER_VERSION) {
  return createHash("sha256")
    .update(JSON.stringify(canonical({ loaderVersion, catalogue })))
    .digest("hex");
}

const CATALOGUE_MIGRATION = /^(\d{3})_intake_catalogue_([0-9a-f]{8})\.sql$/;

/**
 * `migrationsDirEntries` lists the migration files, each a name or
 * `{ name, text }`. A catalogue migration given with its text is compared by
 * its `-- catalogue-hash:` line; given by name only, by the name's hash8.
 * Returns `null` if the newest catalogue migration records this catalogue's
 * hash (under `loaderVersion`, default LOADER_VERSION), otherwise the next
 * migration as `{ name, text }`.
 */
export function nextCatalogueMigration(catalogue, migrationsDirEntries, { loaderVersion = LOADER_VERSION } = {}) {
  const hash = catalogueHash(catalogue, loaderVersion);
  const entries = migrationsDirEntries
    .map((entry) => (typeof entry === "string" ? { name: entry } : entry))
    .filter((entry) => /^\d{3}_.*\.sql$/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const newest = entries.filter((entry) => CATALOGUE_MIGRATION.test(entry.name)).at(-1);
  if (newest) {
    const recorded =
      newest.text === undefined
        ? CATALOGUE_MIGRATION.exec(newest.name)[2]
        : newest.text.match(/^-- catalogue-hash: ([0-9a-f]{64})$/m)?.[1];
    if (recorded && hash.startsWith(recorded)) return null;
  }
  const highest = Math.max(0, ...entries.map((entry) => Number(entry.name.slice(0, 3))));
  const name = `${String(highest + 1).padStart(3, "0")}_intake_catalogue_${hash.slice(0, 8)}.sql`;
  const json = JSON.stringify(catalogue).replaceAll("'", "''");
  const text =
    "-- Generated by tools/build-intake-catalogue.mjs from docs/intake-questions — do not edit.\n" +
    "-- A later catalogue change ships as a new migration; never edit this one once applied.\n" +
    `-- catalogue-hash: ${hash}\n` +
    `select vitally_private.load_intake_catalogue(2::smallint, '${json}'::jsonb);\n`;
  return { name, text };
}

/** The migration directory's `.sql` files as `{ name, text }`. */
export function readMigrationEntries(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({ name, text: readFileSync(path.join(dir, name), "utf8") }));
}

// ---------------------------------------------------------------------------
// CLI.

function main() {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const drafts = path.join(root, "docs", "intake-questions");
  const catalogue = buildCatalogue(
    readFileSync(path.join(drafts, FILES.standard), "utf8"),
    readFileSync(path.join(drafts, FILES.senior), "utf8"),
  );
  const dataFile = path.join(root, "src", "intake-catalogue-data.mjs");
  writeFileSync(
    dataFile,
    "// Generated by tools/build-intake-catalogue.mjs from docs/intake-questions — do not edit.\n" +
      `export default ${JSON.stringify(catalogue, null, 2)};\n`,
  );
  console.log(`wrote ${path.relative(root, dataFile)} (catalogue ${catalogueHash(catalogue)})`);

  const migrations = path.join(root, "supabase", "migrations");
  const next = nextCatalogueMigration(catalogue, readMigrationEntries(migrations));
  if (!next) {
    console.log("the newest catalogue migration already records this catalogue");
    return;
  }
  if (!existsSync(path.join(migrations, "011_intake_v2.sql"))) {
    console.log(
      `would write supabase/migrations/${next.name} (${next.text.length} characters), ` +
        "but 011_intake_v2.sql, which defines the loader, doesn't exist yet",
    );
    return;
  }
  writeFileSync(path.join(migrations, next.name), next.text);
  console.log(`wrote supabase/migrations/${next.name}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
