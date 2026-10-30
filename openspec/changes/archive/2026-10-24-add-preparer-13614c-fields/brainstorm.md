<!--
Raw capture of superpowers:brainstorming output.

本檔原樣捕捉 brainstorming skill 的產出，不強制結構。
Skill 的自然產出通常是 decision log 格式（背景 → 決議鏈 Q1-Qn → 設計取捨），
但依對話內容可能有不同組織方式。

design.md 從本檔萃取並重新整理為結構化設計文件。

不要將本檔的內容複製到 design.md — design.md 是獨立的重組產物，
兩者互補但不重疊。
-->

# Brainstorm: add-preparer-13614c-fields

Issue #94, item 4: the preparer completes the 13614-C's shaded section ("To be
completed by certified volunteer") inside ViTally. Brainstormed 2026-10-24 on
branch `add-preparer-13614c-fields`, cut from `main` at `96f1a1d` (#97).
Baseline there: unit 1336, database 421, browser story 77.

## Background

### Dates (#94, as corrected)

- Propose by **Tue Oct 27** (the kickoff note said "Mon"; Oct 27, 2026 is a Tuesday).
- **Thu Oct 29: go / no-go.** A generated 13614-C showing the preparer's values end to end on the branch.
- **Code freeze: treated as Fri Oct 30, 23:59** until the group confirms. #94 says "Fri Oct 31", but Oct 31, 2026 is a Saturday.
- Migration number: the next free one when the PR opens (#94's rule). 037 is the latest on `main`. #90 (staff identity) is planned as 038.

### A change of approach from #94

#94 planned an HTML form beside the client's answers and put in-browser PDF
editing out of scope ("no pdf.js in the repo"). This change replaces that.
**The preparer fills the shaded fields directly on the 13614-C in the
browser, with pdf.js** rendering the draft with the client's answers already
filled in. On Save, only the shaded fields' values are read and stored **as
data, never as a PDF file**. The staff draft then fills the stored values back
in with the existing pdf-lib generator. There is also a **download / upload
path**: the preparer fills the same copy in Acrobat or Chrome and uploads it,
and its values are read with pdf-lib. One module maps and validates the values
for both paths. Still out of scope from #94: the reviewer's field-by-field
comparison and version history.

### Corrections to the kickoff note (accepted by the user)

1. The weekdays above.
2. `draftFieldNames(form)` does not map between forms. It lists the names one
   form's draft can produce, and none of the shaded fields are in it: the
   generator never writes them today. The three forms have the same 297
   fields. In the shaded section only one name differs, English
   `informationToReport[0].efficientHomeImprovement[0].efficientHomeImprovement[0]`
   against Chinese `informationToReport[0].efficientHomeImprovement[0]`.
   `f13614cn` and `f13614ct` share all names. The shaded fields need an
   explicit list, which handles that difference the way `FORM_NAMES` in
   `src/draft-form.mjs` handles today's English/Chinese differences.
3. Untracked `.claude/worktrees/` and `docs/media/EXIT Form Blank.pdf` are
   ignored. There were no tracked changes.
4. There are **106** shaded fields, not "roughly 105".
5. SQL fixtures live in migrations 034–037 (`apply_fixture_scenario`). JS fixtures are in `tests/database-fixtures.mjs` and `tests/fixtures/`.

Only the first field of each shaded block carries the "To be completed by
certified volunteer" tooltip, so the code can't find the section by tooltip.
It needs an explicit list.

### The 106 fields

| Group | Fields | Kinds |
|---|---|---|
| Page 1 household table, `namesOf[0].Row1..4`, columns `qualifyingChildDependent`, `ownSupport`, `lessThanIncome`, `supportForPerson`, `costMaintainingHome` | 20 | text cells, Yes / No / N/A |
| Page 2 `incomeIncluded` | 47 | 30 checkboxes, 12 counts "#", 5 amounts "$" |
| Page 2 `IncomeIncludedComment` | 1 | notes |
| Page 3 `stndardItemizedDeductions` | 4 | 3 checkboxes (1098, standard, itemized), 1 count |
| Page 3 `stndardItemizedComments` | 1 | notes |
| Page 3 `expensesToReport` | 9 | 7 checkboxes, 2 amounts |
| Page 3 `expensesReportComments` | 1 | notes |
| Page 3 `informationToReport` | 22 | 17 checkboxes, 2 amounts, VIN, year disallowed, reason |
| Page 3 `informationReportComment` | 1 | notes |

Totals: 20 cells, 57 checkboxes, 13 counts, 9 amounts, 3 other text (VIN,
year, reason), 4 comments. Four yes/no pairs are three checkboxes each: a
parent box plus separate Yes and No boxes (`itemizedLastYear`,
`capitalLossCarryover`, alimony `excluded…`, alimony payments `adjustement…`).

## Decision chain

### Q1. Which fields are in M4: all 106

The options were all 106, #94's subset (table + checkboxes + counts +
comments = 93), or the table + checkboxes only (77). With pdf.js the viewer
draws every shaded field anyway, so leaving fields out costs more, not less:
those boxes must be locked, the page must explain why, and in the
download / upload path the preparer could fill them and lose the values
silently. The extra cost of all 106 is two more value types (amount, short
text) in a mechanical table. **Decision: all 106.**

### Q2. The viewer

- **Node:** no pin needed. `package.json` engines `>=24.21.0`, and CI
  `node-version: 24.21.0`. Both satisfy pdfjs-dist 6.x's `>=22.13.0 || >=24`.
  (This machine runs 24.13.0, below the repo's own minimum. That's local, not this change's concern.)
- **Vendoring and loading:** exact-pinned devDependency `pdfjs-dist@6.4.299`.
  `npm run build:vendor` (`tools/build.mjs`) copies the prebuilt ES modules
  into `src/vendor/` with a version banner, as it does for pdf-lib. No esbuild
  bundle, because they are already ESM. They are loaded by `import()` only when the editor opens.
  - **Legacy build** (`legacy/build/pdf.min.mjs` 524 KB +
    `legacy/build/pdf.worker.min.mjs` 1.32 MB), chosen over the modern build
    (459 KB + 1.26 MB). The pdf.js FAQ states minimums only for the legacy
    build: **Chrome / Edge (Chromium) 125+, Firefox ESR+, Safari 18+
    ("mostly")**. The modern build is for "the latest versions" only. The
    design records these minimums. Below them the download / upload path
    applies.
  - The server's vendor allowlist is `^/src/vendor/[a-z-]+\.mjs$`
    (`server.mjs:17`), so the files are published as `src/vendor/pdfjs.mjs`
    and `src/vendor/pdfjs-worker.mjs`, which need no server change.
  - The Chinese forms reference one non-embedded CJK font each
    (`NotoSansCJKsc-Regular` with `UniGB-UTF16-H`, `NotoSansCJKtc-Regular`
    with `UniCNS-UTF16-H`). The preparer edits the English copy, but the
    spike checks whether pdf.js needs those two `.bcmap` files anywhere. If
    it does, they need a server allowlist entry, which is a server change
    with its tests and a backend.md line.
- **Where it shows: a full-screen layer beside `#app`, not inside it.**
  `render()` replaces the whole page with `root.innerHTML = views.page(...)`
  on every state change, realtime redraws included (`src/app.mjs:264`). A
  viewer inside `#app` would lose the preparer's typing on any case update. A new
  tab (as View Draft uses) has no controller and can't save. The layer has a
  toolbar (Save, Close) and scrolling pages. `#app` is inert behind it, and it is a
  dialog under screen-states' keyboard rules.
- **Keeping non-shaded fields uneditable: partial flatten.** pdf-lib builds
  an *editing copy*: the draft as today, but every field except the 106 is
  flattened, and the 106 stay live, pre-filled with stored values. That same
  file is the download for the other path, so in Acrobat or Chrome only the
  shaded fields can be filled. pdf-lib has no per-field flatten
  (`form.flatten()` does all), so this is about 20 lines of our own code. It
  is the first spike item. The alternatives were the read-only flag (leaves
  every field a widget, and pdf.js draws disabled inputs over the CJK text
  that `draft-pdf.mjs` draws on the page after flattening) and ignoring edits on Save (the
  preparer types into boxes that are thrown away). **If the partial flatten
  fights back in the spike, the read-only flag is the fallback.**
- **Language: English-only editing.** Stored values are keyed in English, so
  the staff draft fills them in all three forms. Staff screens stay English.
  **This does not avoid the CJK fonts.** `draftFontsFor("en")` returns the
  Simplified chain (`src/draft-pdf.mjs:51`), so an English draft for a client
  who typed Chinese in a name or address downloads the fonts. The spike checks
  the editor with such a sample.

### Q3. Reading and checking the values

Following `src/questionnaires.mjs`: the browser applies the database's rules
first so the volunteer reads a sentence, and the SQL check stays the
authority.

```
 pdf.js: getFieldObjects() + annotationStorage --+
                                                 +--> { pdfFieldName: raw }
 download/upload: pdf-lib form.getField(name) ---+            |
                                                              v
           shared module  readShaded(raw) -> { key: value } | errors
           (one explicit table: key, English name, Chinese name, kind, label)
                                                              |
                                                              v
           SAVE_PREPARER_FIELDS --> SQL check_preparer_fields(jsonb)
```

- **Keys:** our own clean camelCase keys in the explicit table (for example
  `incomeW2s`, `incomeW2sCount`, `itemizedLastYearYes`). The PDF's names,
  typos included (`otherInomceReported`, `stndard…`, `adjustement…`), live
  only in the table.
- **Sparse:** only filled values are stored. A missing key means blank, and a checkbox is stored only as `true`.
- **Household cell:** `yes` / `no` / `na`. Input `Y`, `yes`, `N`, `no`, `N/A`,
  `NA` in any case is normalised, and anything else is refused, naming the row and
  column.
- **Checkbox:** ticked or not. One cross-field rule: a pair's Yes and No can't
  both be ticked (4 pairs). A filled count or amount does **not** require its parent box, because the paper form doesn't.
- **Count:** whole number 0–99.
- **Amount:** the existing Exit Form `AMOUNT` rule,
  `^(0|[1-9][0-9]{0,5})(\.[0-9]{1,2})?$`. A `$` and commas are stripped on read.
- **VIN:** 1–17 letters and digits, with no check digit. **Year:** four digits, 2000 to the
  season year − 1. **Reason:** text of at most 120 characters.
- **Comments:** at most 500 characters each, and line breaks are allowed.
- **Characters:** any printable text. The draft already draws CJK through its
  `runs` path.
- **Where checked:** one pure module shared by both input paths, plus SQL
  `check_preparer_fields` mirroring it. Unknown keys are refused, and a refused save
  changes nothing.

### Q4. Storage

The household is frozen once the case reaches the preparer. Answers change
only through `SAVE_ANSWERS`, which refuses unless the case is at Draft
(`act_save_answers`, latest in migration 023), and no staff action rewrites
`hh`. Row n is household member n, as in the draft
(`src/draft-form.mjs:438-439`).

- **Table:** new `public.preparer_shaded_fields`, **one row per case**, updated in
  place. It has `fields jsonb` with `check(check_preparer_fields(fields))`,
  `version` (Q6), `updated_by_person_id` and `updated_at`. Only the action RPC
  writes it. Its select policy copies 033's presenter-only one. The rejected
  options: one row per preparation version (that's version history, and it needs
  copy-forward), a column on `cases` (clients can read their own case, so it's a
  compliance boundary), and 106 typed columns.
- **Shape:** flat, household as 20 keys (`household1QualifyingChild` …
  `household4CostOfHome`). Counts are JSON integers; amounts, VIN, year and
  text are strings (as the Exit Form stores amounts); checkboxes are `true`.
- **Rows:** 1–4 only. Persons 5+ have no shaded cells on the form, so the preparer
  uses the shaded comments, as on paper.
- **Cells on empty rows** (row 3 when the household has 2 members) are refused in
  JS and in the action, naming the row.
- A resubmit after corrections shows the current values, with no copy-forward.

### Q5. Who edits, and when

- **Who:** only the case's preparer, through the existing
  `require_case_preparer` (the `prepare` capability, the case's `preparer_id`, a
  preparation participant), the same rule as Send to review. In
  `check_operation_authority` the new action joins the "a staff person" group.
  The rule is written against `people`, so it carries over to #90.
- **When:** only at `preparing` (Filing in progress) and
  `corrections_required` (Corrections in progress). Anything else, including
  On hold, is `INVALID_TRANSITION`.
- **Admin:** no admin edit.
- **Everyone else** (the reviewer, the admin, the preparer after Send to review)
  gets no editor and sees the values in the staff draft. The "Fill the
  shaded section" button is offered only when the save would be allowed,
  through `staffEligibility` rights and `explain(...)`.
- **Ledger:** after a rejection the site coordinator fixes the return and the
  case goes back through Return to signing, never through preparing, so the
  shaded section can't be updated after a rejection fix. Accepted for M4.

### Q6. Saving

Every accepted action raises the case revision (`commit_action`, migration
008), and a mismatched expected revision is `CONFLICT`. The case can change
while the editor is open, for example a contact log or materials.

- **Action:** `SAVE_PREPARER_FIELDS` through `vitally_apply_action`, with the usual
  action id and receipt. The payload is `{fields, basedOnVersion}`; `fields` is
  the whole sparse set and replaces the row.
- **Stale case:** the browser sends the **latest known** case revision, which realtime keeps
  current, so unrelated actions don't block the save. The row has a
  `version` column, and `basedOnVersion` must equal it (0 when there is no row yet) or the
  save is `CONFLICT`. That catches a second tab, and a stale download in the
  other path.
- **On conflict or refusal:** the edits stay on screen. The toolbar says why ("Saved
  elsewhere since you opened this. Close and reopen to see the latest", or the
  stage reason), and Save is disabled for stage reasons.
- **Partial saves allowed:** every field is optional.
- **History:** a staff `case_events` row whose detail is `{changed: [keys]}`,
  worked out on the server by comparing old and new: **keys only, never values**
  (user addition), so a change after review is visible without version
  history. The History tab shows the keys by their English labels from the
  table. There is **no client line** (the outcome has no `message`).
- **No changes:** Save is disabled until something changes. The server accepts an
  unchanged set (empty `changed`).
- **After saving:** the editor stays open showing "Saved", and the new version becomes the baseline.
- **Leaving unsaved:** Close on a changed editor asks "Discard your changes?" inside
  the layer. `beforeunload` covers tab close and reload. In-app navigation is
  impossible while the layer is open.

### Q7. The questionnaire tick: keep it as it is

"I have completed the shaded parts of the 13614-C" stays the preparer's own
statement. Nothing changes in review-and-corrections. The rejected options: requiring a saved
row (it proves only that a row exists), replacing the tick with a derived check (a
contract change to a just-merged questionnaire), and a save-status hint beside
the tick (helpful, but it's extra UI and tests on a deadline).

### Q8. The draft

The four comment boxes are 133 pt wide: about 1,300 / 120 / 240 / 780
Latin characters at their 10 pt. The single-line path would shrink a long note
to 4 pt.

- `draftFields(answers, {form, …, shaded})` turns the stored values into the
  existing `fields.text` / `fields.checks` through the key table. It stays pure.
- Household cells print `Yes` / `No` / `N/A` on all three forms.
- Counts, amounts (no `$`), VIN, year and reason print as stored, with CJK through `runs`.
- **Shaded comments** are wrapped in their own box with the Additional Comments
  code (`wrap` plus `drawLine`, mixed fonts). Whatever doesn't fit continues in
  Additional Comments under a line like "Continued from page 3, Expenses to
  report notes:". That already overflows onto extra pages, so nothing is cut off.
- **Stamp:** when shaded values exist, the 13614-C stamp reads "DRAFT – online
  answers and preparer entries, <date>, <reference>". Otherwise it is unchanged.
  The 14446 stamp is unchanged. No canonical spec states the stamp wording
  (draft-14446 only says "a 'DRAFT' stamp, like the draft 13614-C"), so this is
  an ADDED requirement in draft-13614c.
- The editing copy has the shaded fields live and pre-filled.
- Clients: unchanged. The draft is presenter-only (`viewDraft`'s guard), and the
  client store never loads the row. Persons 5+: unchanged overflow lines.
- Data path: the staff store loads the row as a related row, as it does the
  questionnaires (`src/supabase-store.mjs:609`).

### Q9. The download / upload path: ship both, fallback first

- The download is the editing copy (English). Its metadata (Keywords) carries the case
  reference and the row `version`. On upload the reference must match the open
  case, and the version becomes `basedOnVersion`.
- A file with none of the 106 fields is refused with a sentence. "Print → Save as PDF"
  in Chrome flattens the form: "This copy has no form fields. In Chrome, use
  the download button, not Print."
- The file is read in the browser, values only, never uploaded or stored.
- **Both paths always ship:** "Fill here" and "Download to fill elsewhere /
  Upload the filled copy". There is no browser sniffing. If pdf.js fails to load, the
  error points to the download path.
- **Build order: download / upload first.** The shared reader, the action and the
  draft fill land with it, so an end-to-end path exists before Oct 29, and pdf.js
  comes on top.
- **Oct 29 go / no-go:** pdf.js ships if, on the branch: (1) the editing copy
  opens in the layer with only shaded fields editable, including the
  Chinese-name sample; (2) save, then the staff draft shows the values in all three
  forms; (3) its story step passes. Otherwise pdf.js is cut and the
  download / upload path ships alone.

### Q10. Samples and tests

- The staff draft is flattened, so the story can't read field values back. It
  reads drawn Latin text with `draftPageText` (`tests/browser.mjs:470`), which
  covers counts, `Yes`, comments and the stamp, but not checkboxes or CJK glyphs. Field
  values, checkboxes included, are checked in unit tests with
  `buildDraftPdf({flatten: false})`.
- **Seeded samples:** every scenario that seeds a preparer questionnaire (whose
  `shaded_parts_completed` is true) also gets one fictional shaded row, in the
  same `if` block of `apply_fixture_scenario`. Without it, the demo shows "I have
  completed the shaded parts" beside an empty section. Example values: household row 1 yes /
  no / yes / na / yes; W-2s ticked with count 1; 1099-INT ticked with count 1;
  standard deduction ticked; income note "Fictional: one W-2 from a part-time
  job."
- **Story step 1 (pdf.js):** in the story's own case after the claim, open the
  editor, then type `Yes` in row 1, tick W-2s, enter count `2`, add a comment, and Save.
  Check "Saved" and a History line naming the changed fields. Then the English draft
  shows `Yes`, `2`, the comment and the new stamp.
- **Story step 2 (download / upload):** the test fills a downloaded copy with
  pdf-lib (standing in for Acrobat), uploads it with `setInputFiles`, and checks "Saved" and one
  value in the draft.
- **Unit:**
  - the key table names all 106 fields in all three PDFs;
  - `readShaded` rules;
  - the partial flatten leaves exactly the 106 fields;
  - **an editing copy built from answers with a Chinese name builds with exactly
    the 106 live fields** (user addition: covers the font chain under the partial flatten);
  - the draft fill with `flatten: false` in all three forms;
  - comment overflow;
  - both stamps;
  - the upload reader on a pdf-lib-filled copy.
- **Database:**
  - authority (preparer only; reviewer and admin refused) and stages;
  - each `VALIDATION` rule, including cells on empty rows;
  - `basedOnVersion` `CONFLICT`;
  - changed keys in `case_events`, and no `client_events` row;
  - an applicant can't select the table;
  - fixture rows pass the constraint.
- The pdf.js rendering check with a Chinese-name sample stays a **manual spike** item.

### Q11. Out of scope (ledger)

| Out | Where |
|---|---|
| Reviewer field-by-field comparison; version history | #94 non-goals |
| Exit Form PDF | #85 Later |
| Staff identity | #90 |
| Document upload; storing the uploaded PDF | #94 item 3 |
| Updating the shaded section after a rejection fix | Return to signing path; accepted for M4 |
| Shaded cells for household members 5+ | 4 rows on the form; shaded comments instead |
| Admin editing; reassigning a preparer | Q5 |
| A read-only pdf.js view | Q5; the draft shows the values |
| Editing on the Chinese forms | Q2 |
| Requiring a save before Send to review; a derived tick; a save-status hint | Q7 |
| Browser sniffing | Q9 |

## Builder check (a fresh reader, after the decisions above)

A fresh reviewer read this file as a builder would and asked five questions.
None needed the user. Each is settled below **as Claude's call**, for the user
to check while reviewing.

1. **Chinese text in a live field of the editing copy.** pdf-lib draws a live
   field's appearance in Helvetica (WinAnsi), so pre-filling a shaded note in
   Chinese would fail or show wrong glyphs. Q8's `runs` path covers only the
   flattened draft. *Call:* for a value that needs an embedded font, the
   editing copy sets the field's value without building its appearance, and it
   sets `NeedAppearances`. pdf.js shows the value in its own input, and Acrobat
   and Chrome rebuild the appearance. A unit test builds an editing copy with a
   Chinese shaded note, and the spike opens it in pdf.js and Chrome. **If that
   fails, the fallback is Latin-only shaded text in JS and SQL. That is a
   contract change, so it goes back to the user before it is made.**
2. **"Season year" in the year rule.** It is the case's season, as in
   `check_taxslayer_date`: `coalesce(case.season, workspace.current_season)`,
   the filing year. So "Year disallowed" runs from 2000 to season − 1, the
   current tax year. *Consequence:* `check_preparer_fields(jsonb)` backs a check
   constraint and can't see the case, so it checks the shape (four digits). The
   season bound and the empty-row rule (Q4) are checked in the action function,
   as `check_taxslayer_date` is.
3. **An upload saves at once.** *Call:* the upload is read, checked and saved in
   one press. It does not open the layer, and errors show in place beside the
   upload control. "Save disabled until changed" and "Discard your changes?"
   apply only to the layer.
4. **An unchanged save.** `commit_action` always writes a `case_events` row.
   *Call:* every accepted save raises the row's `version` (one rule, and it
   keeps a stale download detectable) and writes its event. History reads
   "saved the shaded section · no fields changed" when `changed` is empty.
5. **Keeping pdf.js cuttable at Oct 29.** *Call:* the pdf.js parts are separate
   requirement blocks in the delta specs (the layer, the Escape rule, the
   editor-open error) and separate tasks after the download / upload milestone.
   Cutting pdf.js is then one revert plus deleting those blocks. The go / no-go
   call is the user's.

## Spec impact found by grepping the canonical specs

- **New capability** for the shaded section (save, rules, who and when, the
  editor, the download / upload path).
- **draft-13614c: ADDED.** The shaded fill in all three forms, comment
  overflow, and the stamp wording.
- **screen-states: MODIFIED.**
  - "A dialog takes the keyboard and gives it back" says Escape closes the
    dialog, but a changed editor asks "Discard your changes?" first.
  - "Errors are shown where the person is looking" lists the failures it
    covers, and gains the editor that couldn't open and an uploaded copy that
    couldn't be read.
- **No delta needed:**
  - client-intake's "A client page never makes a draft 13614-C" holds, because
    only the case's preparer gets the editor.
  - staff-case-work's "draft 13614-C buttons SHALL NOT be offered" without
    contact rights holds for the same reason.
  - review-and-corrections' tick is unchanged (Q7).
  - No canonical spec states staff History wording.

## Open items and owners

- **Code freeze date** (Fri Oct 30 or Sat Oct 31). Owner: the user and the group.
  It affects only the plan's last date.
- **Telling the group** before touching `check_payload`, `vitally_apply_action`,
  `check_operation_authority` and `apply_fixture_scenario`, all of which #90
  also edits. Owner: the user. It affects merge order with #90.
- **Spike before Tue Oct 27.** Owner: the implementer. It covers the partial
  flatten (fallback: read-only flag), whether the `.bcmap` files are needed
  (if so: server allowlist), and pdf.js with a Chinese-name sample.
- **Migration number** when the PR opens.

## Checks and deliverables

- **Checks:**
  - `npm test`;
  - `npm run db:migrate:test`, then `npm run test:database` (new table, action, fixtures);
  - `npm run test:browser` (layer, buttons, story);
  - `npx openspec validate --all`.
  - Not needed: `npm run test:auth-browser` (sign-in untouched) and
    `npm run build:hant -- --check` (all new text is English staff text or
    the English stamp, and no client text changes).
- **Docs:**
  - `docs/developer/frontend.md` (the layer, the editing copy, the vendor files);
  - `docs/developer/database.md` (table, action, check, fixtures);
  - `docs/setup.md` "The vendor bundle" section;
  - `docs/developer/backend.md:127` and `docs/developer/README.md:97-103`, which
    name `build:vendor` and list only `supabase.mjs`.
