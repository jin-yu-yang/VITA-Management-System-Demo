## Context

The 13614-C has a shaded section for the certified volunteer: 106 fields over pages 1–3. They are household-table cells, income, deduction, expense and information checkboxes, counts, amounts, a VIN, a year, a reason and four note boxes. ViTally builds a staff draft 13614-C in the browser from the client's answers (`src/draft-form.mjs` chooses the values, and `src/draft-pdf.mjs` fills and flattens the IRS form with the vendored pdf-lib). The shaded section is always empty in that draft. The preparer's only record is the questionnaire tick "I have completed the shaded parts of the 13614-C" (review-and-corrections).

Current state that constrains the design:
- The page is rebuilt from HTML strings on every state change, realtime included (`root.innerHTML = views.page(...)`, `src/app.mjs:264`). View Draft opens a PDF in a new tab, which has no controller.
- The draft is flattened, and Chinese text is drawn on the page after flattening (`src/draft-pdf.mjs:422-424`).
- The three IRS forms share 297 field names. In the shaded section only `efficientHomeImprovement` differs between English and Chinese.
- Answers change only at Draft (`act_save_answers`), so the household is frozen once a preparer works on the case.
- Every accepted action raises the case revision. A stale expected revision is `CONFLICT`.
- `require_case_preparer` defines "the case's preparer". The presenter-only select policy is today's staff boundary.
- The server serves vendor files matching `^/src/vendor/[a-z-]+\.mjs$`.
- Node is ≥ 24.21.0 in the repo and in CI.

People involved: preparers, who are certified volunteers; reviewers, who read the draft; the office; and the #90 work, which edits the same four SQL functions. Dates (#94): propose Tue Oct 27, go / no-go Thu Oct 29, code freeze treated as Fri Oct 30.

## Goals / Non-Goals

**Goals:**
- The case's preparer fills all 106 shaded fields at Filing in progress or Corrections in progress, either in a pdf.js view or by download and upload, and saves them as checked data.
- The staff draft 13614-C shows the saved values in English, 简体 and 繁體 forms.
- The database is the authority. The browser applies the same rules first so the preparer reads a sentence. Clients can never read the values.
- Each save's history line shows which fields changed, so a change after review is visible.
- The pdf.js path can be cut on Oct 29 without disturbing the rest.

**Non-Goals:**
- The reviewer's field-by-field comparison, and version history (#94).
- The Exit Form PDF (#85 Later).
- Staff identity (#90).
- Document upload, and storing the PDF (#94 item 3).
- Shaded cells for household members 5 and later.
- Admin edits, and reassigning a preparer.
- A read-only pdf.js view.
- Editing on the Chinese forms.
- Requiring a save before Send to review, or changing the questionnaire tick.
- Browser sniffing.
- Updating the section after a rejection fix: that path is Return to signing, which the ledger accepts.

## Decisions

### D1: All 106 shaded fields, in one explicit table
- **Choice:** a pure module (working name `src/shaded-fields.mjs`) holds one entry per field. Each entry has a stable camelCase key, the English PDF name, the Chinese PDF name (different only for `efficientHomeImprovement`), a kind (`cell`, `box`, `count`, `amount`, `vin`, `year`, `reason`, `note`), and an English label for History. Everything else uses this table: the reader, the checks, the draft fill, the partial flatten and the tests.
- **Why:** the tooltips can't identify the section, because only the first field of each block says "certified volunteer". The PDF names have typos (`otherInomceReported`, `stndard…`, `adjustement…`) that shouldn't become the contract. With pdf.js the viewer draws every shaded field anyway, so a subset would only add locked boxes and lose values in the download path.
- **Alternatives:** #94's subset of 93 fields, or 77 fields. Deriving keys from PDF names.

### D2: Values, their rules, and one shared reader
- **Choice:** values are sparse. Only filled values are stored, and a checkbox is stored only as `true`. The kinds:
  - `cell`: `yes` / `no` / `na`, normalised from Y / Yes / N / No / N/A / NA in any case.
  - `box`: `true`, with no Yes-and-No in the same one of the 4 pairs.
  - `count`: integer 0–99.
  - `amount`: the Exit Form `AMOUNT` pattern, with `$` and commas stripped on read.
  - `vin`: 1–17 letters and digits.
  - `year`: four digits, 2000 to season − 1.
  - `reason`: up to 120 characters.
  - `note`: up to 500 characters, line breaks allowed.

  Any printable text is allowed. One function `readShaded(raw)` takes `{pdfFieldName: rawValue}` from either path and returns `{key: value}` or errors that name the field.
- **Where checked:**
  - SQL `check_preparer_fields(jsonb)` checks the shape (keys, kinds, lengths, patterns, the pair rule) and backs the table's check constraint.
  - `act_save_preparer_fields` checks what needs the case. The year's season bound uses `coalesce(case.season, workspace.current_season)`, as `check_taxslayer_date` does. Household cells must be on rows that have a member (`jsonb_array_length` of the application's `hh`, capped at 4).
- **Why:** this follows `src/questionnaires.mjs`: the browser applies the rules first and the database decides.
- **Alternatives:** dense storage (blank and filled look the same). Plain strings for amounts. A strict VIN check digit. Latin-only text (it refuses real notes).

### D3: Storage, `public.preparer_shaded_fields`, one row per case
- **Choice:** columns:
  - `id`, `workspace_id`, `case_id` (unique);
  - `fields jsonb not null check(check_preparer_fields(fields))`;
  - `version bigint not null`;
  - `updated_by_person_id`, `updated_at`;
  - the same foreign keys as `preparer_questionnaires`.

  RLS is enabled. The select policy copies 033's `presenter_preparer_questionnaires`. Only `service_role` writes, through the action RPC. The shape is flat: the household is 20 keys (`household1QualifyingChild` … `household4CostOfHome`), counts are JSON integers, and everything else is a string or `true`. The staff store loads the row with the case's related rows (`src/supabase-store.mjs`).
- **Why:** updating in place matches "no version history". A table of its own keeps the values off `cases`, which clients can read. The household is frozen, so row n is member n for the life of the case.
- **Alternatives:** one row per preparation version (that's history, and it needs copy-forward). A column on `cases` (a compliance boundary). 106 typed columns.

### D4: Who and when
- **Choice:** the database layers:
  - `check_operation_authority` puts `SAVE_PREPARER_FIELDS` in the "a staff person" group.
  - The act function calls `require_case_preparer`.
  - The stage must be `preparing` or `corrections_required`, or the save is `INVALID_TRANSITION`.

  There is no admin path. The case page offers "Fill the shaded section", "Download to fill elsewhere" and "Upload the filled copy" only when a save would be allowed (`staffEligibility` rights), and shows `explain(...)` otherwise. Everyone else sees the values in the staff draft.
- **Why:** this is the same rule as Send to review. Hold pauses work. The rule is written against `people`, so it survives #90.
- **Alternatives:** `works_on_case`, which would let the reviewer edit what they review. An admin override.

### D5: Saving, `SAVE_PREPARER_FIELDS`
- **Choice:**
  - Through `vitally_apply_action` with the usual action id and receipt. The payload is exactly `{fields, basedOnVersion}`.
  - `fields` is the whole sparse set and replaces the row.
  - The browser sends the **latest known** case revision, which realtime keeps current.
  - `basedOnVersion` must equal the stored `version` (0 when no row exists), or the save is `CONFLICT`.
  - Every accepted save raises `version`.
  - The server diffs the old and new rows and returns `detail: {changed: [keys]}`, keys only and sorted, with no `message`. So `commit_action` writes the staff event and no client event.
  - History renders the keys through the table's labels, or "no fields changed" when the list is empty.
- **Why:** unrelated actions (contacts, materials) must not block a save. The row version catches a second tab and a stale download precisely. Keys without values make post-review changes visible without version history.
- **Alternatives:** the revision from when the editor opened. Last writer wins. Patch payloads. Autosave.

### D6: The editing copy and the partial flatten
- **Choice:** `draft-pdf.mjs` gains an editing build: the same fill as the draft from the answers, then a **partial flatten** that flattens every field except the 106, then the stored shaded values set on the live fields. pdf-lib's `form.flatten()` has no field filter, so our code limits it to a field list. That is spike item 1.
  - **Chinese text in a live field:** a value that needs an embedded font gets its `/V` set without an appearance, and the AcroForm gets `NeedAppearances`. pdf.js shows `/V` in its own input, and Acrobat and Chrome rebuild the appearance. This is spike item 3.
  - The editing copy is English only. The client's Chinese name or address still loads the Simplified font chain (`draftFontsFor("en")`).
  - The download carries the case reference and the row `version` in the PDF's Keywords.
- **Why:** one file serves both paths. Only the shaded fields can be edited in pdf.js, Acrobat or Chrome.
- **Alternatives:** the read-only flag on non-shaded fields (more widgets, and disabled inputs over drawn CJK text). This is the fallback if the partial flatten fails. Ignoring edits on Save.

### D7: The pdf.js editor, a layer outside `#app`
- **Choice:**
  - `pdfjs-dist@6.4.299`, exact-pinned. `tools/build.mjs` (`npm run build:vendor`) copies `legacy/build/pdf.min.mjs` to `src/vendor/pdfjs.mjs` and `legacy/build/pdf.worker.min.mjs` to `src/vendor/pdfjs-worker.mjs`, with a banner naming the version.
  - They are loaded by `import()` when the editor opens, and `GlobalWorkerOptions.workerSrc` points at the worker.
  - The editor is a full-screen element beside `#app`, which `render()` never touches. It is a dialog (`role="dialog"`, `aria-modal`), `#app` is inert, and the screen-states keyboard rules apply.
  - The toolbar holds Save, Close and the status.
  - The pdf.js annotation layer renders forms. Save reads `getFieldObjects()` plus `annotationStorage` into `{pdfFieldName: value}` for `readShaded`.
  - Close or Escape on a changed editor asks "Discard your changes?". `beforeunload` covers tab close and reload.
  - On `CONFLICT` or refusal the edits stay. The status explains, and Save is disabled for stage reasons.
- **Browser support:** the legacy build's stated minimums: **Chrome / Edge (Chromium) 125+, Firefox ESR+, Safari 18+ ("mostly")**. Below these the download / upload path is the way through. If pdf.js fails to load, the error says so and points to it.
- **Why:** the layer survives realtime redraws and keeps the controller for saving. The legacy build is the only one with stated minimums. The file names match the server allowlist.
- **Alternatives:** an inline tab panel (destroyed by redraws). A new tab (can't save). The modern build. A CDN (breaks static hosting and offline tests).

### D8: The download / upload path
- **Choice:**
  - "Download to fill elsewhere" saves the editing copy.
  - "Upload the filled copy" reads a chosen PDF in the browser with pdf-lib. The PDF must carry the open case's reference, and the 106 fields are read by name into `readShaded`. The Keywords `version` becomes `basedOnVersion`.
  - It saves in the same press, with no layer. Errors show in place beside the control.
  - A PDF with none of the shaded fields gets "This copy has no form fields. In Chrome, use the download button, not Print." The file is never uploaded or kept.
  - Both paths always ship. The download / upload path is built first.
- **Why:** browsers below the minimums need a way through. It gives an end-to-end path before Oct 29. It reuses D2, D5 and D6 unchanged.
- **Alternatives:** shipping it only if pdf.js misses the gate. Storing the file (that's #94 item 3).

### D9: The draft fills the stored values
- **Choice:**
  - `draftFields(answers, {form, reference, today, shaded})` maps stored values through the table into the existing `fields.text` / `fields.checks`, choosing English or Chinese names by form family.
  - Cells print `Yes` / `No` / `N/A` on all forms. Counts, amounts (without `$`), VIN, year and reason print as stored, with CJK through `runs`.
  - The four notes are wrapped in their own boxes with the Additional Comments code (`wrap`, `drawLine`). The rest continues in Additional Comments under "Continued from page <n>, <block> notes:" and from there onto continued pages, so nothing is cut off.
  - The stamp reads "DRAFT – online answers and preparer entries, <date>, <reference>" when any shaded value exists. Otherwise it reads "DRAFT – prepared from online answers, <date>, <reference>". The 14446 stamp is unchanged.
  - The draft stays presenter-only.
- **Why:** one source of field names, the existing CJK and overflow handling, and a stamp that doesn't credit the preparer's entries to the client.
- **Alternatives:** a second fill pass in the builder. Per-box character limits. Shrinking to fit. Chinese cell words.

### D10: Samples and tests
- **Choice:**
  - `apply_fixture_scenario` is redefined from 037, plus one fictional `preparer_shaded_fields` insert for every scenario that seeds a preparer questionnaire.
  - The story reads drawn Latin text with `draftPageText`, because the draft is flattened. Checkbox and field values are checked in unit tests with `buildDraftPdf({flatten: false})`.
  - The Chinese-name editing copy is a unit test. Its pdf.js rendering is a manual spike item.
- **Why:** the samples shouldn't contradict their own "completed" tick, and each check sits where it can actually run.

## Risks / Trade-offs

- [Risk] The partial flatten fights pdf-lib internals (shared parent fields, widget removal). → Mitigation: spike first, before Oct 27, with a unit test that exactly the 106 fields remain. The fallback is the read-only flag on non-shaded fields (D6).
- [Risk] A live field with Chinese text breaks the editing copy. → Mitigation: `/V` plus `NeedAppearances` (D6), with a unit test and a spike in pdf.js and Chrome. If it fails, Latin-only shaded text, raised with the user before changing the contract.
- [Risk] pdf.js needs the `UniGB-UTF16-H` / `UniCNS-UTF16-H` `.bcmap` files. → Mitigation: spike. If needed, serve the two files through a narrow server allowlist entry, with server tests and a backend.md line.
- [Risk] pdf.js misses the Oct 29 gate. → Mitigation: the download / upload path is built first. The pdf.js parts are separate tasks and separate requirement blocks, so cutting them is one revert plus deleting those blocks.
- [Risk] Merge conflicts with #90 in `check_payload`, `vitally_apply_action`, `check_operation_authority` and `apply_fixture_scenario`. → Mitigation: tell the group before touching them. Each redefinition stays verbatim plus marked lines (the repo's `-- 0NN` style), so a rebase is mechanical.
- [Risk] A PCDC computer below the browser minimums. → Mitigation: download / upload is always offered.
- [Trade-off] The household is keyed by row, which works only because answers are frozen after Draft. → Accepted. Re-check if staff ever gain an answer-editing action.
- [Trade-off] One row per case with no history of values. → Accepted for M4. Changed keys in History cover "what changed after review".
- [Trade-off] About 1.85 MB of new vendored files. → Accepted: they load only when the editor opens, and their size is close to pdf-lib's 1.37 MB.

## Migration Plan

1. One new hand-written migration, numbered with the next free number when the PR opens:
   - `check_preparer_fields`;
   - the table with RLS and grants;
   - `act_save_preparer_fields`;
   - `check_payload`, `vitally_apply_action` and `check_operation_authority` redefined verbatim from their latest versions plus the new action;
   - `apply_fixture_scenario` redefined from 037 plus the sample rows.

   Statements are re-runnable (`if not exists`, `create or replace`, drop-then-add), as in 033.
2. Vendor: add the devDependency, run `npm run build:vendor`, and commit `src/vendor/pdfjs.mjs` and `src/vendor/pdfjs-worker.mjs`.
3. Browser code, tests and docs land with the migration in one PR. The order of work is download / upload first, then pdf.js.
4. Rollback: a follow-up migration can drop the action from the three functions and drop the table. Nothing else depends on it. The questionnaire tick is unchanged, so the review flow keeps working without the section.
5. Acceptance:
   - `npm test`;
   - `npm run db:migrate:test` then `npm run test:database`;
   - `npm run test:browser`;
   - `npx openspec validate --all`;
   - the Oct 29 go / no-go criteria (brainstorm Q9).

## Open Questions

- Code freeze Fri Oct 30 or Sat Oct 31. Owner: the user and the group. It affects only the plan's last date.
- Telling the group before touching the four shared functions. Owner: the user. It affects merge order with #90.
- Spike results before Tue Oct 27: partial flatten, `.bcmap`, Chinese text in live fields, and pdf.js with a Chinese-name sample. Owner: the implementer. They decide D6's fallback and any server allowlist entry.
- The Oct 29 go / no-go call. Owner: the user.
