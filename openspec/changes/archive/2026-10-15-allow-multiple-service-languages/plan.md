# Allow Multiple Service Languages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- A client names a preferred service language (unchanged) and, optionally, any others.
- Every staff table (the work board, the case pool and Follow-ups) shows all of a client's languages, preferred first, as letters (E, C, M, O), with the full names on hover and for screen readers.
- The language filters match any language the client speaks.
- The client's progress page lists every language by full name.

**Architecture:**
- Two new catalogue questions:
  - Q0.5 `language_also` (multi-select, optional);
  - Q0.6 `language_also_other` (text, shown if Q0.5 includes Other).
- They go into both drafts. `npm run build:intake` regenerates the catalogue and writes migration 026.
- One data helper in `src/intake-catalogue.mjs` (`clientLanguages` plus small formatters) and one cell helper in `src/ui.mjs` (`languageCell`). Every table, filter and the progress page call them.
- No stored answer, seed or SQL function changes.

**Tech Stack:**
- plain ES modules;
- `node:test`;
- the Markdown catalogue drafts and `tools/build-intake-catalogue.mjs`;
- Supabase/Postgres (local stack `vitally-task2`);
- Playwright (the story).

**Spec:** in `openspec/changes/allow-multiple-service-languages/`:
- `specs/client-intake/spec.md` and `specs/staff-case-work/spec.md`;
- `design.md` (D1–D9);
- `brainstorm.md` (Q1–Q9, I1–I6);
- `proposal.md` and `tasks.md`.

## Global Constraints

- Fictional data only, in code, tests, fixtures and screenshots.
- **The only migration is the generated `026_intake_catalogue_<hash8>.sql`.**
  - Never write SQL by hand, and never edit an applied migration.
  - Implementers never run `npm run db:migrate:test`, `npm run test:database`, `npm run test:auth-browser` or `npm run test:browser`. The controller runs every stack and browser suite, and applies 026 only after the user says yes in chat.
- Never run `supabase start` or `npx supabase start` from the repo root.
- **Commands:** `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && <one command>`.
- **繁體:** after any 简体 change (catalogue Chinese included), run `npm run build:hant` and commit `src/zh-hant.mjs`. Staff screens stay English.
- **Git, inside the worktree:**
  - run each git command on its own, never chained with `&&` or `;`, and never inside `$(…)`;
  - stage files by name, never `git add -A` or `git add .` (the worktree's `node_modules` and `.env.test` are links);
  - write multi-line commit messages to a scratchpad file and run `git commit -F <file>`;
  - confirm each commit with `git rev-parse --short HEAD` and `git log --oneline -1`;
  - **every commit message ends with a blank line and exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, whatever model you are.**
- Never write under `docs/superpowers/`, and never commit `.superpowers/`.
- **The questions (brainstorm Q5), exact, the same in the standard and senior drafts:**

  ```
  **Q0.5** Any other languages we can help you in? / 我们还可以用哪些语言为您服务？
  `language_also` · Multi-select · Optional
  - `english` English / 英语 · `cantonese` Cantonese / 粤语 · `mandarin` Mandarin / 普通话 · `other` Other / 其他
  > Tip: Choose all that apply. Leave this blank if only your preferred language works for you. / 可多选。如果只能使用首选语言，请留空。

  **Q0.6** Please specify / 请说明
  `language_also_other` · Text · Optional
  **Show if** `language_also = other`
  ```

- **Letters (design D3):** `english` E, `cantonese` C, `mandarin` M, `other` O, joined by ", ".
- **Full names:**
  - **staff (hover and screen readers):** the English names, the first followed by " (preferred)", Other written as "Other: <typed text>" (or "Other" when nothing was typed), joined by ", ". For example, "Cantonese (preferred), Mandarin, Other: Vietnamese".
  - **client (progress page):** the names in the screen language, Other as the typed text (or "Other"/"其他" when nothing was typed), joined by `form.list_separator` (", " / "、"). For example, "Cantonese, Mandarin" / "粤语、普通话".
- **Order:** the preferred language first, then `language_also` in the option order (English, Cantonese, Mandarin, Other). No language listed twice (the same code with the same typed text).
- **Filters** match any language the client speaks. Options are the sorted, unique full English labels of every language among the cases.

---

### Task 1: The catalogue: Q0.5 and Q0.6

**Files:**
- Modify: `docs/intake-questions/intake-questions.md:57-65`, `docs/intake-questions/intake-questions-senior-v2.md:57-65`
- Modify: `tools/build-intake-catalogue.mjs:102` (`before.language`'s question list)
- Generated: `src/intake-catalogue-data.mjs`, `supabase/migrations/026_intake_catalogue_<hash8>.sql`, `src/zh-hant.mjs`
- Test: `tests/intake-build.test.mjs`, `tests/intake-catalogue.test.mjs`, `tests/support/intake-value-cases.mjs`

**Interfaces:**
- Produces: catalogue questions `language_also` (`type: "multi"`, options `english cantonese mandarin other`, `required: false`) and `language_also_other` (`type: "text"`, `showIf: [{ field: "language_also", op: "eq", value: "other" }]`), both in sub-step `before.language` after `language_other`.

- [ ] **Step 1: Write the failing tests**

  1. In `tests/intake-build.test.mjs`, in `the real catalogue keeps service, language, form_version, hh and the phones`, after the `language_other` assertions, add:

```js
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
```

     In the optional-ids list of the same file (around line 749, next to `"language_other"`), add `"language_also"` and `"language_also_other"`.

  2. In `tests/intake-catalogue.test.mjs`, add `substepQuestions` to the import from `../src/intake-catalogue.mjs` if it isn't imported, and add:

```js
test("before.language asks the preferred language, then the others", () => {
  assert.deepEqual(
    substepQuestions("before.language").map((question) => question.id),
    ["language", "language_other", "language_also", "language_also_other"],
  );
});
```

  3. In `tests/support/intake-value-cases.mjs`, under `// multi`, add:

```js
  both("language_also", ["mandarin", "other"], true),
  both("language_also", "mandarin", false),
  both("language_also", ["klingon"], false),
```

- [ ] **Step 2: Run them and see them fail**

  Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/intake-build.test.mjs tests/intake-catalogue.test.mjs`

  Expected: FAIL, because `findQuestion(…, "language_also")` is undefined and the sub-step list is short.

- [ ] **Step 3: Edit both drafts**

  In each of `docs/intake-questions/intake-questions.md` and `docs/intake-questions/intake-questions-senior-v2.md`:

  1. Replace the Q0.2 developer note line (`> Note for developers: Q0.2–Q0.4 keep version 1's …`) with:

```
> Note for developers: Q0.2–Q0.4 keep version 1's `service` and `language` answers; Q0.5–Q0.6 add the client's other languages (`language_also`), after the preferred one in Q0.3. The work board, Follow-ups and the case pool filter and display them. They are not on the paper form, and their wording is new: the group should review it (the Chinese especially).
```

  2. After the Q0.4 block (its `**Show if** \`language = other\`` line) and before the section's closing `---`, add the Q0.5 and Q0.6 blocks exactly as in Global Constraints, with a blank line before each `**Q…**` line, matching the file's spacing.

- [ ] **Step 4: Add the ids to the builder**

  In `tools/build-intake-catalogue.mjs`, change:

```js
      questions("before.language", ["Language", "语言"], "language language_other"),
```

  to:

```js
      questions("before.language", ["Language", "语言"], "language language_other language_also language_also_other"),
```

- [ ] **Step 5: Build the catalogue and 繁體**

  Run, one at a time:
  1. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && ls supabase/migrations`. Confirm that the newest file is `025_intake_catalogue_194034c5.sql` and that no 026 exists.
  2. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm run build:intake`. Expected: it writes `src/intake-catalogue-data.mjs` and `supabase/migrations/026_intake_catalogue_<hash8>.sql`.
  3. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm run build:hant`
  4. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm run build:hant -- --check`

  **Do not apply 026.** Read the generated 026 to confirm that it only reloads the catalogue (it calls `vitally_private.load_intake_catalogue`) and that the two new fields appear in it.

- [ ] **Step 6: Run the unit suite**

  Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`

  Expected: PASS. The Chinese sweep (`tests/client-language.test.mjs`) covers the new labels. If a test elsewhere lists `before.language`'s questions or the number of section-0 questions, update it, and name each one in your report.

- [ ] **Step 7: Commit**

  ```bash
  git add docs/intake-questions/intake-questions.md docs/intake-questions/intake-questions-senior-v2.md tools/build-intake-catalogue.mjs src/intake-catalogue-data.mjs src/zh-hant.mjs supabase/migrations/026_intake_catalogue_<hash8>.sql tests/intake-build.test.mjs tests/intake-catalogue.test.mjs tests/support/intake-value-cases.mjs
  ```

  Use the real file name for 026. Commit message:

  ```
  Catalogue: Q0.5 other service languages and Q0.6 their "Please specify" (migration 026)

  OpenSpec change allow-multiple-service-languages, design D1, D2.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

---

### Task 2: The language helpers

**Files:**
- Modify: `src/intake-catalogue.mjs:257-272` (the "Service and language labels" section)
- Modify: `src/ui.mjs` (a new export next to `stageBadge` / `clientNumberTag`)
- Modify: `src/styles.css` (one small rule)
- Test: `tests/intake-catalogue.test.mjs`, `tests/ui.test.mjs`

**Interfaces:**
- Consumes: Task 1's `language_also` and `language_also_other` answers.
- Produces, from `src/intake-catalogue.mjs`:
  - `LANGUAGE_LETTERS` (frozen `{ english: "E", cantonese: "C", mandarin: "M", other: "O" }`);
  - `clientLanguages(answers) → Array<{ code: string, label: string, text: string }>`, where `label` is the English label and `text` is the typed name for Other, or "";
  - `languageLetters(entries) → string`;
  - `languageNames(entries, { lang = "en", preferred = false, separator = ", " } = {}) → string`;
  - `speaksLanguage(entries, chosen) → boolean`;
  - `languageFilterLabels(listOfEntryLists) → string[]`;
  - `languageSummary(entries) → { letters, names, labels }`, which is the staff form: `names` uses `preferred: true`, and `labels` is the English labels.
- Produces, from `src/ui.mjs`: `languageCell({ letters, names, labels }) → string` (HTML).

- [ ] **Step 1: Write the failing tests**

  1. In `tests/intake-catalogue.test.mjs`, add the new names to the import from `../src/intake-catalogue.mjs`, and add:

```js
test("clientLanguages: the preferred language first, then the others in option order, never twice", () => {
  const codes = (answers) => clientLanguages(answers).map((entry) => entry.code);
  assert.deepEqual(codes({ language: "cantonese", language_also: ["other", "mandarin"] }), ["cantonese", "mandarin", "other"]);
  assert.deepEqual(codes({ language: "mandarin", language_also: ["mandarin", "english"] }), ["mandarin", "english"]);
  assert.deepEqual(codes({ language: "english" }), ["english"]);
  assert.deepEqual(codes({}), []);
  assert.deepEqual(codes({ language: "" , language_also: ["mandarin"] }), ["mandarin"]);
  // Other carries what was typed; the preferred one's box and the follow-up's are separate.
  assert.deepEqual(
    clientLanguages({ language: "other", language_other: " Vietnamese ", language_also: ["other"], language_also_other: "Tagalog" }),
    [
      { code: "other", label: "Other", text: "Vietnamese" },
      { code: "other", label: "Other", text: "Tagalog" },
    ],
  );
  assert.deepEqual(clientLanguages({ language: "other", language_other: "Tagalog", language_also: ["other"], language_also_other: "tagalog" }).length, 1);
  // A label (a version-1 answer, or a help request's text) maps back to its code; anything else is Other.
  assert.deepEqual(clientLanguages({ language: "Cantonese" }), [{ code: "cantonese", label: "Cantonese", text: "" }]);
  assert.deepEqual(clientLanguages({ language: "Polish" }), [{ code: "other", label: "Other", text: "Polish" }]);
  assert.deepEqual(clientLanguages({ language: "cantonese", language_also: "mandarin" }).length, 1, "a non-list follow-up is ignored");
});

test("language letters, names, filter labels and the staff summary", () => {
  const entries = clientLanguages({ language: "cantonese", language_also: ["mandarin", "other"], language_also_other: "Vietnamese" });
  assert.equal(languageLetters(entries), "C, M, O");
  assert.equal(languageNames(entries, { preferred: true }), "Cantonese (preferred), Mandarin, Other: Vietnamese");
  assert.equal(languageNames(entries), "Cantonese, Mandarin, Vietnamese");
  assert.equal(languageNames(entries, { lang: "zh-Hans", separator: "、" }), "粤语、普通话、Vietnamese");
  assert.equal(languageNames(clientLanguages({ language: "other" })), "Other");
  assert.equal(languageNames(clientLanguages({ language: "other" }), { preferred: true }), "Other (preferred)");
  assert.equal(languageNames(clientLanguages({ language: "other" }), { lang: "zh-Hans" }), "其他");
  assert.deepEqual(languageSummary(entries), {
    letters: "C, M, O",
    names: "Cantonese (preferred), Mandarin, Other: Vietnamese",
    labels: ["Cantonese", "Mandarin", "Other"],
  });
  assert.deepEqual(languageSummary([]), { letters: "", names: "", labels: [] });
  assert.equal(speaksLanguage(entries, "all"), true);
  assert.equal(speaksLanguage(entries, "Mandarin"), true);
  assert.equal(speaksLanguage(entries, "mandarin"), true, "a code is compared by its label");
  assert.equal(speaksLanguage(entries, "English"), false);
  assert.deepEqual(
    languageFilterLabels([entries, clientLanguages({ language: "english" }), clientLanguages({ language: "mandarin" })]),
    ["Cantonese", "English", "Mandarin", "Other"],
  );
  assert.deepEqual(LANGUAGE_LETTERS, { english: "E", cantonese: "C", mandarin: "M", other: "O" });
  assert.ok(Object.isFrozen(LANGUAGE_LETTERS));
});
```

  2. In `tests/ui.test.mjs`, add `languageCell` to the import from `../src/ui.mjs`, and add:

```js
test("languageCell: the letters for sighted staff, the names on hover and for screen readers, the labels for tests", () => {
  assert.equal(
    languageCell({ letters: "C, M", names: "Cantonese (preferred), Mandarin", labels: ["Cantonese", "Mandarin"] }),
    '<span class="language-letters" title="Cantonese (preferred), Mandarin" data-languages="Cantonese|Mandarin"><span aria-hidden="true">C, M</span><span class="sr-only">Cantonese (preferred), Mandarin</span></span>',
  );
  assert.equal(languageCell({ letters: "", names: "", labels: [] }), "—");
  assert.equal(languageCell(), "—");
  const odd = languageCell({ letters: "O", names: 'Other: <b>"x"</b>', labels: ["Other"] });
  assert.doesNotMatch(odd, /<b>/);
  assert.match(odd, /title="Other: &lt;b&gt;&quot;x&quot;&lt;\/b&gt;"/);
});
```

     Check `esc` in `src/ui.mjs` for how it writes `"` and `'`, and match the test's expected entities to it.

- [ ] **Step 2: Run them and see them fail**

  Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/intake-catalogue.test.mjs tests/ui.test.mjs`

  Expected: FAIL, because the new exports don't exist.

- [ ] **Step 3: Implement the data helpers in `src/intake-catalogue.mjs`**

  After `export const languageLabel = …;` add:

```js
// ---------------------------------------------------------------------------
// The client's service languages (allow-multiple-service-languages, design
// D3): the preferred one (Q0.3, `language`) first, then the others (Q0.5,
// `language_also`) in option order, never twice. Other carries what was typed
// (Q0.4 or Q0.6). A label, from a version-1 answer or a help request's text,
// maps back to its code; any other text is Other with that text.
// ---------------------------------------------------------------------------

export const LANGUAGE_LETTERS = Object.freeze({ english: "E", cantonese: "C", mandarin: "M", other: "O" });
const LANGUAGE_CODES = [...LANGUAGE_LABELS.keys()];
const CODE_OF_LABEL = new Map(
  [...LANGUAGE_LABELS.values()].map((option) => [String(option.label?.general?.en ?? option.value).toLowerCase(), option.value]),
);
const trimmed = (value) => (typeof value === "string" ? value.trim() : "");

function languageEntry(value, typed) {
  const raw = trimmed(value);
  if (!raw) return null;
  const code = LANGUAGE_LABELS.has(raw) ? raw : CODE_OF_LABEL.get(raw.toLowerCase());
  if (code) return { code, label: languageLabel(code), text: code === "other" ? trimmed(typed) : "" };
  return { code: "other", label: languageLabel("other"), text: raw };
}

export function clientLanguages(answers) {
  const draft = answers ?? {};
  const also = Array.isArray(draft.language_also) ? draft.language_also : [];
  const entries = [
    languageEntry(draft.language, draft.language_other),
    ...LANGUAGE_CODES.filter((code) => also.includes(code)).map((code) => languageEntry(code, draft.language_also_other)),
  ].filter(Boolean);
  const seen = new Set();
  return entries.filter((entry) => {
    const key = `${entry.code}|${entry.text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const languageLetters = (entries) => entries.map((entry) => LANGUAGE_LETTERS[entry.code] ?? "O").join(", ");

// Staff (`preferred`): English, the first marked "(preferred)", Other as
// "Other: <text>". A client: the screen language, Other as what they typed.
export function languageNames(entries, { lang = "en", preferred = false, separator = ", " } = {}) {
  const names = entries.map((entry) => {
    if (entry.code !== "other") return languageLabel(entry.code, preferred ? "en" : lang);
    if (preferred) return entry.text ? `${entry.label}: ${entry.text}` : entry.label;
    return entry.text || languageLabel("other", lang);
  });
  if (preferred && names.length) names[0] = `${names[0]} (preferred)`;
  return names.join(preferred ? ", " : separator);
}

// A filter's choice is a label (or a code), compared by its label.
export const speaksLanguage = (entries, chosen) =>
  chosen === "all" || entries.some((entry) => entry.label === languageLabel(chosen));

export const languageFilterLabels = (lists) =>
  [...new Set(lists.flatMap((entries) => entries.map((entry) => entry.label)))].sort();

export const languageSummary = (entries) => ({
  letters: languageLetters(entries),
  names: languageNames(entries, { preferred: true }),
  labels: entries.map((entry) => entry.label),
});
```

- [ ] **Step 4: Implement the cell helper in `src/ui.mjs`**

  After `clientNumberTag`, add the function below. Use the module's existing `esc`.

```js
// A staff table's Language cell (allow-multiple-service-languages, design D4):
// the letters for sighted staff, the full names on hover and for screen
// readers, and the labels (data-languages) for tests and the story.
export const languageCell = ({ letters = "", names = "", labels = [] } = {}) =>
  letters
    ? `<span class="language-letters" title="${esc(names)}" data-languages="${esc(labels.join("|"))}"><span aria-hidden="true">${esc(letters)}</span><span class="sr-only">${esc(names)}</span></span>`
    : "—";
```

  In `src/styles.css`, near the board table rules (search for `.board-table`), add:

```css
/* A Language cell's letters: the names are on hover (allow-multiple-service-languages). */
.language-letters {
  white-space: nowrap;
  cursor: help;
}
```

- [ ] **Step 5: Run the tests and see them pass**

  Run, one at a time:
  1. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/intake-catalogue.test.mjs tests/ui.test.mjs`
  2. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add src/intake-catalogue.mjs src/ui.mjs src/styles.css tests/intake-catalogue.test.mjs tests/ui.test.mjs
  ```

  Commit message:

  ```
  Language helpers: the client's languages, letters, names, filters and the staff cell

  OpenSpec change allow-multiple-service-languages, design D3, D4.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

---

### Task 3: The staff tables and filters

**Files:**
- Modify: `src/staff-views.mjs`: `inLanguageAndService` (~line 407), `valueOptions` (~line 476), the row cell (~line 544), the language chips (~line 585)
- Modify: `src/pool-views.mjs`: `filterPool` (~line 63), `valueOptions` (~line 88), `poolRow` (~line 113), the `poolLanguage` select (~line 138)
- Modify: `src/office-views.mjs`: `rowLanguage` / `inLanguage` (~lines 122–124), the chip list (~line 214), the queue row cell (~line 193)
- Test: `tests/staff-views.test.mjs`, `tests/pool-views.test.mjs`, `tests/office-views.test.mjs`

**Interfaces:**
- Consumes: Task 2's `clientLanguages`, `languageSummary`, `speaksLanguage`, `languageFilterLabels` (from `./intake-catalogue.mjs`) and `languageCell` (from `./ui.mjs`).

- [ ] **Step 1: Write the failing tests**

  Use each file's own helpers: `boardCase`, `filterCases`, `renderStaffBoard`, `ALEX` and `PEOPLE` in staff-views; `rec` and `render` in pool-views; `kase`, `page` and `sam` in office-views.

  1. **tests/staff-views.test.mjs:**

```js
test("the board's Language cell lists every language, preferred first, and the filter matches any of them", () => {
  const both = boardCase({ id: "b", reference: "VT-BOTH", answers: { language: "cantonese", language_also: ["mandarin"] } });
  const mand = boardCase({ id: "m", reference: "VT-MAND", answers: { language: "mandarin" } });
  const eng = boardCase({ id: "e", reference: "VT-ENG", answers: { language: "english", language_also: ["other"], language_also_other: "Vietnamese" } });
  const cases = [both, mand, eng];
  const ids = (filters) => filterCases(cases, { status: "available", ...filters }, ALEX).map((c) => c.id).sort();
  assert.deepEqual(ids({ language: "Mandarin" }), ["b", "m"]);
  assert.deepEqual(ids({ language: "Cantonese" }), ["b"]);
  assert.deepEqual(ids({ language: "Other" }), ["e"]);
  const html = renderStaffBoard(cases, PEOPLE, { person: ALEX, filters: { status: "available" } });
  assert.match(html, /<span class="language-letters" title="Cantonese \(preferred\), Mandarin" data-languages="Cantonese\|Mandarin"><span aria-hidden="true">C, M<\/span>/);
  assert.match(html, /title="English \(preferred\), Other: Vietnamese" data-languages="English\|Other"><span aria-hidden="true">E, O<\/span>/);
  for (const label of ["Cantonese", "English", "Mandarin", "Other"])
    assert.equal([...html.matchAll(new RegExp(`data-filter="language" data-value="${label}"`, "g"))].length, 1, label);
});
```

  2. **tests/pool-views.test.mjs:**

```js
test("the pool's Language cell lists every language, and its filter and options include second languages", () => {
  const cases = [
    rec("A", "received", { answers: { language: "cantonese", language_also: ["mandarin"] } }),
    rec("B", "received", { answers: { language: "english" } }),
  ];
  const opts = (html) => [...html.match(/data-board-filter="poolLanguage"[^>]*>(.*?)<\/select>/)[1].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
  const all = render({}, cases);
  assert.deepEqual(opts(all), ["all", "Cantonese", "English", "Mandarin"]);
  assert.match(all, /data-languages="Cantonese\|Mandarin"><span aria-hidden="true">C, M<\/span>/);
  const mandarin = render({ poolLanguage: "Mandarin" }, cases);
  assert.match(mandarin, /VT-A/);
  assert.doesNotMatch(mandarin, /VT-B/);
});
```

     Check how `rec` builds a reference (`VT-<id>`?) and adjust the regexes to it.

  3. **tests/office-views.test.mjs:**
     - Add a test that a case row with `answers: { language: "cantonese", language_also: ["mandarin"] }` shows `data-languages="Cantonese|Mandarin"` with letters `C, M`.
     - In the same test, choosing the "Mandarin" chip (`page(cases, [], sam, { language: "Mandarin" })`) keeps that row, and the chips include `data-value="Mandarin"`.
     - Add a second test for a help request with no case: build one the way this file's existing help-request tests do (around lines 34–60, the items given to `page(cases, help, …)`), with `language: "Cantonese"` and no matching case. Its cell shows `<span aria-hidden="true">C</span>`, with `title="Cantonese (preferred)"` and `data-languages="Cantonese"`.
     - In the same test, an item whose language is `"Polish"` shows `<span aria-hidden="true">O</span>`, with `title="Other: Polish (preferred)"` and `data-languages="Other"`. That is `languageNames(…, { preferred: true })`: Other with text gives "Other: Polish", then " (preferred)" is appended.
     - Its chip is "Other", not "Polish". A saved Follow-ups filter of "Polish" from before this change now matches nothing until it is cleared (design, Risks).

  4. **Update the existing assertions the new cell changes.** Keep what each test checks:
     - **staff-views** `answer codes display and filter by their labels`: the cell no longer holds "Cantonese" as plain text. Keep the "no raw codes" check (`!html.includes("cantonese")`) and the chip count checks.
     - **pool-views** `answer codes display and filter by their labels`: the `doesNotMatch(/drop_off|cantonese|online<|english</)` still holds, because the cell holds labels and letters, not codes.
     - **office-views** `language codes read and filter by their labels`: unchanged in intent.
     - Any test asserting `<td>Cantonese</td>` or similar for a Language cell: change it to the letter cell, for example `data-languages="Cantonese"` plus `>C<`.

     List every assertion you change in the report.

- [ ] **Step 2: Run them and see them fail**

  Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/staff-views.test.mjs tests/pool-views.test.mjs tests/office-views.test.mjs`

  Expected: FAIL on the new tests.

- [ ] **Step 3: The work board (`src/staff-views.mjs`)**

  Add `clientLanguages`, `languageSummary`, `speaksLanguage` and `languageFilterLabels` to the import from `./intake-catalogue.mjs`, and `languageCell` to the import from `./ui.mjs`.

  1. In `inLanguageAndService`, replace the language half with:

```js
  speaksLanguage(clientLanguages(record?.answers), chosen.language) &&
```

     Update the comment above it: "Answers store codes; they are compared, shown and grouped by their label, so a saved filter value, already a label, still matches. A client matches a language when they speak it, preferred or other."

  2. The board's language chips: replace `valueOptions(cases, "language", "Any language", languageLabel)` with:

```js
[["all", "Any language"], ...languageFilterLabels(cases.map((record) => clientLanguages(record?.answers))).map((label) => [label, label])]
```

     Leave `valueOptions` for the service chips.

  3. The row cell: replace `<td>${esc(languageLabel(record?.answers?.language) || "—")}</td>` with:

```js
<td>${languageCell(languageSummary(clientLanguages(record?.answers)))}</td>
```

  If `languageLabel` is no longer used in the file, remove it from the import.

- [ ] **Step 4: The case pool (`src/pool-views.mjs`)**

  Add the same imports.

  1. In `filterPool`, replace `matchesValue(record?.answers?.language, chosen.poolLanguage, languageLabel) &&` with:

```js
      speaksLanguage(clientLanguages(record?.answers), chosen.poolLanguage) &&
```

  2. The `poolLanguage` select's options: replace `valueOptions(all, "language", "Any language", languageLabel)` with:

```js
[["all", "Any language"], ...languageFilterLabels(all.map((record) => clientLanguages(record?.answers))).map((label) => [label, label])]
```

  3. In `poolRow`, replace the language `<td>` with `<td>${languageCell(languageSummary(clientLanguages(record?.answers)))}</td>`.

  Remove `languageLabel` from the import if it is unused.

- [ ] **Step 5: Follow-ups (`src/office-views.mjs`)**

  Add the imports.

  1. Replace `rowLanguage` and `inLanguage` with:

```js
// A row's languages (design D6): the case's answers, or for a help request
// with no case, the request's own language text (a label maps to its code).
const rowLanguages = (row) => {
  const fromCase = clientLanguages(row.record?.answers);
  return fromCase.length ? fromCase : clientLanguages({ language: row.item?.language });
};
const inLanguage = (row, chosen) => speaksLanguage(rowLanguages(row), chosen.language);
```

  2. The chip list: replace

```js
  const languages = [
    ...new Set(rows.map((row) => String(rowLanguage(row)).trim()).filter(Boolean)),
  ].sort();
```

     with:

```js
  const languages = languageFilterLabels(rows.map(rowLanguages));
```

  3. The queue row: replace `<td>${esc(rowLanguage(row) || "—")}</td>` with:

```js
<td>${languageCell(languageSummary(rowLanguages(row)))}</td>
```

  Search the file for any other `rowLanguage(` use and convert it the same way. Remove `languageLabel` from the import only if it is unused. The help-request drawer's `item.language` (around line 331) stays as it is: it is the request's own field.

- [ ] **Step 6: Run the tests and see them pass**

  Run, one at a time:
  1. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/staff-views.test.mjs tests/pool-views.test.mjs tests/office-views.test.mjs`
  2. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`

  Expected: PASS.

- [ ] **Step 7: Commit**

  ```bash
  git add src/staff-views.mjs src/pool-views.mjs src/office-views.mjs tests/staff-views.test.mjs tests/pool-views.test.mjs tests/office-views.test.mjs
  ```

  Commit message:

  ```
  Staff tables show every language a client speaks, and the filters match any of them

  OpenSpec change allow-multiple-service-languages, design D5, D6.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

---

### Task 4: The progress page and the Fill

**Files:**
- Modify: `src/client-views.mjs:358` (the progress page's Language row)
- Modify: `src/sample-data.mjs:37` (`versionTwoAnswers`)
- Test: `tests/client-views.test.mjs`, `tests/sample-data.test.mjs`, and any test whose render now shows the extra answer

**Interfaces:**
- Consumes: Task 2's `clientLanguages` and `languageNames`.
- Produces: `makeSampleAnswers()` and "Fill fictional details" answer `language: "english"` and `language_also: ["mandarin"]`. Task 5's story relies on this.

- [ ] **Step 1: Write the failing tests**

  1. In `tests/client-views.test.mjs`, in `the progress page labels service and language codes`, add after its existing assertions:

```js
  // Every language the client named, by full name, preferred first (allow-multiple-service-languages, design D7).
  const both = progress(v2Case({ stage: "received", answers: { service: "drop_off", language: "cantonese", language_also: ["mandarin"], tp_first_name: "Mei" } }));
  assert.match(both, /<span>Language<\/span><strong>Cantonese, Mandarin<\/strong>/);
  const zh = progressScreen(
    baseState({
      screen: "progress",
      lang: "zh-Hans",
      savedCase: v2Case({ stage: "received", answers: { language: "mandarin", language_also: ["other"], language_also_other: "Vietnamese", tp_first_name: "Mei" } }),
    }),
  );
  assert.match(zh, /<strong>普通话、Vietnamese<\/strong>/);
```

     Check the progress row's markup in `client-views.mjs` (`row(label, value)`), and the Chinese label for `progress.language`, and match them.

  2. In `tests/draft-form.test.mjs`, keep the draft 13614-C free of the new answers (proposal: the draft is unchanged).
     - Add `language_also: ["cantonese"], language_also_other: "Also should not appear",` to the `MARRIED` fixture, after `language_other`.
     - In `the questions with no box never appear`, add `"Also should not appear"` and `"cantonese"` to the `absent` list.

     This should pass both before and after the change: it guards against a future mapping.

  3. In `tests/sample-data.test.mjs`, add:

```js
test("the Fill names a second language, English preferred and Mandarin also", () => {
  const answers = makeSampleAnswers();
  assert.equal(answers.language, "english");
  assert.deepEqual(answers.language_also, ["mandarin"]);
});
```

     Import `makeSampleAnswers` if the file doesn't already. The existing test that every sample value passes `checkValue` then covers the new answer too.

- [ ] **Step 2: Run them and see them fail**

  Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --test tests/client-views.test.mjs tests/sample-data.test.mjs`

  Expected: FAIL.

- [ ] **Step 3: Implement**

  1. In `src/client-views.mjs`, add `clientLanguages` and `languageNames` to the import from `./intake-catalogue.mjs`. In the progress page, replace `languageLabel(answers.language, lang)` with:

```js
languageNames(clientLanguages(answers), { lang, separator: t("form.list_separator", {}, lang) })
```

     If `languageLabel` is then unused in the file, remove it from the import.

  2. In `src/sample-data.mjs`, in `versionTwoAnswers`, after `language: "english",` add:

```js
    language_also: ["mandarin"],
```

- [ ] **Step 4: Run the unit suite and fix the renders that now show the extra answer**

  Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`

  Tests that render `makeSampleAnswers()` now also show Q0.5's answer, as English "Mandarin" or Chinese "普通话". Examples are the review summary, the staff answers panel, the office's form and the Chinese sweep.

  - Fix any test that pins an exact row count or an exact list of section-0 rows.
  - Never weaken what a test checks.
  - The Chinese sweep's free-text check (no Latin letters in text answers) is unaffected, because `language_also` is not text.
  - List every test you change in the report.

  Expected after the fixes: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/client-views.mjs src/sample-data.mjs tests/client-views.test.mjs tests/sample-data.test.mjs tests/draft-form.test.mjs
  ```

  Also stage, by name, every other test file you changed. Commit message:

  ```
  Progress page lists every language; the Fill names English and Mandarin

  OpenSpec change allow-multiple-service-languages, design D7, D8.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

---

### Task 5: Migration 026 on the test stack, and the story

**Files:**
- Modify: `tests/browser.mjs` (the Follow-ups empty-state search around line 1351; the new application's staff row around line 667)
- Controller only: apply 026 to `vitally-task2`, then run `npm run test:database` and `npm run test:browser`.

**Interfaces:**
- Consumes:
  - Task 2's cell markup (`.language-letters`, `data-languages`, `title`, `[aria-hidden="true"]`);
  - Task 4's Fill (`english` preferred, `mandarin` also).

- [ ] **Step 1: The Follow-ups empty-state search reads `data-languages`**

  In `tests/browser.mjs`, in the empty-queue check (the `const emptyPair = await staff.evaluate(() => { … })` block), replace

```js
          language: row.cells[3]?.textContent.trim(),
```

  with:

```js
          languages: (row.cells[3]?.querySelector(".language-letters")?.dataset.languages ?? "").split("|").filter(Boolean),
```

  Then replace `!rows.some((row) => row.kind === kind && row.language === language)` with:

```js
!rows.some((row) => row.kind === kind && row.languages.includes(language))
```

  Update its comment: the cell shows letters, so the row's languages come from `data-languages`, and a row counts under every language it lists, as the filter does.

- [ ] **Step 2: The new application's staff row shows `E, M`**

  In the phase `a new application is submitted and reaches the staff board`, after:

```js
      assert.equal((await classRow.locator(".client-number").innerText()).trim(), clientNumber);
```

  add:

```js
      // The Fill names English (preferred) and Mandarin (allow-multiple-service-languages):
      // the cell shows letters, with the full names on hover and for screen readers.
      const languages = classRow.locator(".language-letters");
      assert.deepEqual(
        {
          letters: (await languages.locator('[aria-hidden="true"]').innerText()).trim(),
          title: await languages.getAttribute("title"),
          labels: await languages.getAttribute("data-languages"),
        },
        { letters: "E, M", title: "English (preferred), Mandarin", labels: "English|Mandarin" },
      );
```

- [ ] **Step 3: Check and commit**

  Run, one at a time:
  1. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && node --check tests/browser.mjs`
  2. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`

  ```bash
  git add tests/browser.mjs
  ```

  Commit message:

  ```
  Story: Follow-ups languages from data-languages; the new application reads E, M

  OpenSpec change allow-multiple-service-languages.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

- [ ] **Step 4 (controller): Dry-run 026, then apply it after the user's OK**

  1. Read `vitally_private.schema_migrations` on `vitally-task2` and confirm that 025 is the newest applied migration.
  2. Pipe the generated 026, wrapped in `begin; … rollback;`, from a scratchpad file to:

     ```
     docker exec -i supabase_db_vitally-task2.M5anE7XP psql -U postgres -v ON_ERROR_STOP=1 -tA
     ```

     with the full docker path. Confirm that it loads, and that `intake_fields` gains `language_also` (multi) and `language_also_other` (text).
  3. Ask the user in chat. Only after they say yes, run `npm run db:migrate:test`.

- [ ] **Step 5 (controller): Run the database suite and the story**

  Run, each with the PATH prefix that includes Docker:
  1. `npm run test:database`. Expected: PASS. The value mirror covers the new `language_also` cases, and the field table matches the catalogue.
  2. `npm run test:browser`, in the background. Expected: PASS (57/57 on `main`).

  If either fails, read the evidence and send the fix to an implementer.

---

### Task 6: Docs and the full check

**Files:**
- Modify:
  - `docs/developer/database.md` (the migration table after the 025 row, and the prose below it);
  - `docs/setup.md` (around lines 343 and 401–415);
  - `docs/developer/README.md` (around lines 98 and 105);
  - `README.md` (around line 137);
  - `docs/developer/frontend.md` (the version-2 intake form section, and the unit count).

**Interfaces:**
- Consumes: the generated 026 file name, and the final unit total from `npm test`.

- [ ] **Step 1: The migration list and ranges**

  1. In `docs/developer/database.md`, after the `025_intake_catalogue_194034c5.sql` row, add:

```markdown
| `026_intake_catalogue_<hash8>.sql` | Generated by `npm run build:intake`: Q0.5 `language_also` (the client's other service languages, multi-select, optional) and Q0.6 `language_also_other` (its "Please specify", shown if Q0.5 includes Other) |
```

     Use the real file name. If the prose below the table names the newest migration, update it.

  2. Change the ranges from 001–025 to 001–026:
     - `docs/developer/README.md` (`migrations/001-025`);
     - `README.md` (`001–025`);
     - `docs/setup.md`, in its migration list (~line 343) and range (~line 406).

     Use `grep -rn "025" docs README.md`, excluding `docs/superpowers/`, to find each one.

- [ ] **Step 2: The frontend guide**

  In `docs/developer/frontend.md`, in the version-2 intake form section's bullets (near the marital-status wording bullet), add:

```markdown
- **A client's service languages** (openspec change `allow-multiple-service-languages`): Q0.3 `language` is the preferred one; Q0.5 `language_also` adds the others (Q0.6 `language_also_other` for Other). `clientLanguages(answers)` in `intake-catalogue.mjs` lists them, preferred first, never twice; the work board, case pool and Follow-ups show them as letters through `languageCell` (`ui.mjs`), with the names on hover and for screen readers, and their language filters match any of them (`speaksLanguage`). The progress page lists the full names.
```

- [ ] **Step 3: The counts**

  1. Run: `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`. Expected total: **943**. That is 934 on `main` plus 9 new tests:
     - Task 1: 1 (`before.language` order);
     - Task 2: 3 (two in intake-catalogue, one in ui);
     - Task 3: 4 (one each for the board and the pool, two for Follow-ups);
     - Task 4: 1 (sample-data).

     If the total isn't 943, find out why before you change the docs, and say why in your report.
  2. Replace the unit count 934 with the new total in `docs/developer/README.md:105`, `docs/developer/frontend.md` (the "Unit (934)" row) and `docs/setup.md` (`934/934`).

  In `docs/setup.md`'s "last verified" sentence:
  - the unit and story counts were verified on this change, `allow-multiple-service-languages` (2026-10-15, migration 026 applied);
  - the database count was also verified on this change, if the controller reported its total (put that number in the table);
  - the auth-gate count stays from its earlier change.

  Ask the controller for the database and story results if they aren't in your brief.

- [ ] **Step 4: The full check**

  Run, one at a time:
  1. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm test`
  2. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm run build:hant -- --check`
  3. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npm run build:intake`, then `git status --short`, which must show no change under `src/` or `supabase/`.
  4. `export PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:$PATH && npx openspec validate --all`

- [ ] **Step 5: Commit**

  ```bash
  git add docs/developer/database.md docs/setup.md docs/developer/README.md README.md docs/developer/frontend.md
  ```

  Commit message:

  ```
  Docs: migration 026 and the client's service languages

  OpenSpec change allow-multiple-service-languages.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

---

## Self-review

**Spec coverage:**

| Requirement | Where |
|---|---|
| client-intake: a client can name other languages | Task 1 (the questions, catalogue tests, value cases); Task 5 (026 on the stack, and the database value mirror) |
| client-intake: the progress page lists every language | Task 4 (English, and Chinese with typed text) |
| staff-case-work: tables show every language | Task 2 (the helpers and cell); Task 3 (the three tables, Other, and a help request without a case); Task 5 (the story row `E, M`) |
| staff-case-work: filters match any language | Task 2 (`speaksLanguage`, `languageFilterLabels`); Task 3 (each table's filter and options); Task 5 (the Follow-ups empty-state search) |

**Placeholder scan:** the 026 file name comes from the build, and each task says so. There are no other gaps.

**Type consistency:**
- `clientLanguages(answers)` returns `{ code, label, text }` entries in every task.
- `languageSummary` returns `{ letters, names, labels }`, which `languageCell` consumes in Tasks 2, 3 and 5.
- `languageNames(entries, { lang, preferred, separator })` is used in Tasks 2 and 4.
- `speaksLanguage(entries, chosen)` and `languageFilterLabels(lists)` are used in Tasks 2 and 3.

**Checks this change needs** (CLAUDE.md, Verification):
- `npm test`;
- `npm run build:hant -- --check`;
- `npm run build:intake` (commit 026);
- `npm run db:migrate:test` and `npm run test:database`, for the generated migration;
- `npm run test:browser`, since browser-visible tables change;
- CI.

`test:auth-browser` isn't needed: no sign-in change.
