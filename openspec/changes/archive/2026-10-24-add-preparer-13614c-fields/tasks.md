## 1. Spike (throwaway, before Tue Oct 27)

- [x] 1.1 Partial flatten: with pdf-lib, flatten every field of `f13614c-2025.pdf` except the 106 shaded ones, and confirm exactly 106 fields remain and the drawn answers are intact. On failure, record the fallback (the read-only flag on non-shaded fields, design D6).
- [x] 1.2 Chinese text in a live field: set `/V` without an appearance plus `NeedAppearances` on a shaded note in Chinese, and open the copy in pdf.js and in Chrome's viewer. On failure, stop and raise Latin-only shaded text with the user (a contract change).
- [x] 1.3 pdf.js with the legacy build: render an editing copy for a sample client with a Chinese name, with forms enabled. Record whether the `UniGB-UTF16-H` / `UniCNS-UTF16-H` `.bcmap` files are requested, and whether `getFieldObjects()` and `annotationStorage` give the shaded values by full field name.
- [x] 1.4 Record the spike's findings in the apply ledger (summarised later in `retrospective.md`). If a fallback or a server allowlist entry is needed, tell the user and revise the change with `/opsx:update` before group 4.

## 2. The field table and reader

- [x] 2.1 Add the pure module with the 106-entry table (key, English name, Chinese name, kind, English label) and `readShaded(raw)`, applying every rule in the `shaded-section` spec.
- [x] 2.2 Unit tests: every key names one field in each of the three PDFs, and no shaded field is left without a key; each kind's rule; the pair rule; normalisation (`y`, `N/A`, `$1,250.50`); unknown keys; the empty-row rule given a household size.

## 3. Database

- [x] 3.1 New migration (number when the PR opens): `check_preparer_fields(jsonb)` (shape), and the `preparer_shaded_fields` table with `version`, its check constraint, RLS, the presenter-only select policy and grants.
- [x] 3.2 `act_save_preparer_fields`: `require_case_preparer`, the two stages, `basedOnVersion` against `version`, the season bound for the year, cells only on rows with a member, the replace, `version + 1`, and the sorted `changed` keys in `detail` with no `message`.
- [x] 3.3 Redefine `check_payload` (payload exactly `fields` and `basedOnVersion`), `vitally_apply_action` (dispatch) and `check_operation_authority` (the staff-person group) verbatim from their latest versions, plus marked lines. Tell the group first (#90 overlap).
- [x] 3.4 Redefine `apply_fixture_scenario` from 037, plus one fictional shaded row for every scenario that seeds a preparer questionnaire.
- [x] 3.5 Database tests: authority (preparer accepted; reviewer, admin and other staff refused); every other stage refused, On hold included; each `VALIDATION` rule; `CONFLICT` on a stale `basedOnVersion`; an unrelated action doesn't block; `version` rises on every save; `changed` keys in `case_events` and no `client_events` row; a client selects no row; the fixture rows pass the constraint.

## 4. The draft and the editing copy

- [x] 4.1 `draftFields(answers, {…, shaded})` fills the stored values through the table, with English or Chinese names by form family: cells as Yes / No / N/A, no `$` on amounts.
- [x] 4.2 Shaded notes are wrapped in their boxes with the Additional Comments code. The rest continues in Additional Comments under "Continued from page <n>, <block> notes:".
- [x] 4.3 Stamp: "DRAFT – online answers and preparer entries, …" when any shaded value exists. The 14446 is unchanged.
- [x] 4.4 The editing-copy build: the draft fill, the partial flatten keeping the 106, stored values set live (`/V` plus `NeedAppearances` for text that needs an embedded font), and the case reference and section version in Keywords.
- [x] 4.5 Unit tests: the fill in all three forms with `flatten: false` (cells, boxes, counts, amounts, CJK reason); note overflow with every character printed; both stamps; the editing copy has exactly 106 fields; **an editing copy from answers with a Chinese name and a Chinese note builds with exactly the 106 live fields**.

## 5. Staff case page wiring

- [x] 5.1 `supabase-store.mjs` loads the row with the case's related rows. The realtime change reaches staff only.
- [x] 5.2 `case-actions.mjs` and the controller: `SAVE_PREPARER_FIELDS` with the latest known case revision and `basedOnVersion`; refusals and `CONFLICT` reported without losing input.
- [x] 5.3 Rights: the shaded-section tools are offered only when a save would be accepted (`staffEligibility`), with `explain(...)` otherwise.
- [x] 5.4 History renders a save's changed keys by their labels, or "no fields changed". Unit tests for the view.

## 6. Download / upload path (milestone: end to end before Oct 29)

- [x] 6.1 "Download to fill elsewhere" saves the editing copy. "Upload the filled copy" reads the chosen PDF in the browser with pdf-lib: it checks the reference, refuses a copy with no fields using the Print sentence, reads into `readShaded`, and saves in the same press. Errors show in place.
- [x] 6.2 Unit test: the upload reader on a copy filled with pdf-lib returns the same values; another case's copy and a flattened copy are refused.
- [x] 6.3 Story step: after the claim, fill a downloaded copy with pdf-lib, upload it with `setInputFiles`, and check "Saved" and one value in the English draft via `draftPageText`.
- [x] 6.4 Milestone check: the download / upload path works end to end on the branch, and the staff draft shows the values in all three forms.

## 7. pdf.js editor (cut entirely if the Oct 29 gate fails)

- [x] 7.1 Add `pdfjs-dist@6.4.299` exact-pinned. `tools/build.mjs` copies the legacy `pdf.min.mjs` and `pdf.worker.min.mjs` to `src/vendor/pdfjs.mjs` and `src/vendor/pdfjs-worker.mjs` with a version banner. Run `npm run build:vendor` and commit them. Add the `.bcmap` allowlist entry and its server test only if spike 1.3 needs them.
- [x] 7.2 The editor layer beside `#app`: a dialog, with `#app` inert, opened by "Fill the shaded section". It loads pdf.js by `import()` and renders the editing copy with forms enabled. The toolbar has Save (disabled until changed), Close and the status ("Saved", refusal reasons, the conflict sentence).
- [x] 7.3 Save reads `getFieldObjects()` and `annotationStorage` into `readShaded` and sends the action. Edits survive redraws, case changes and refusals. Close or Escape on a changed editor asks "Discard your changes?", `beforeunload` is set, and focus returns to the opener.
- [x] 7.4 The editor-open error with Try again, pointing to "Download to fill elsewhere" (screen-states).
- [x] 7.5 Story step: after the claim, open the editor, type Yes in row 1, tick W-2s, enter 2 W-2s, add a note and Save. Check "Saved" and the History line. Close, then the English draft shows `Yes`, `2`, the note and the new stamp. Check Escape asks first with unsaved changes.
- [x] 7.6 Oct 29 go / no-go: (1) the layer opens with only the shaded fields editable, including the Chinese-name sample; (2) save, then the draft shows the values in all three forms; (3) task 7.5 passes. If not, revert group 7 and remove the pdf.js-only requirement blocks from the delta specs ("The preparer fills the section on the form in ViTally", "The editor states the browsers it supports", the screen-states editor lines).

## 8. Docs

- [x] 8.1 `docs/developer/frontend.md`: the shaded-field module, the editing copy, the editor layer outside `#app`, the download / upload path, and the vendor files.
- [x] 8.2 `docs/developer/database.md`: the table, `check_preparer_fields`, `SAVE_PREPARER_FIELDS`, the version guard and the fixtures.
- [x] 8.3 `docs/setup.md` "The vendor bundle", `docs/developer/backend.md`'s `build:vendor` row, and `docs/developer/README.md`'s vendor and `build.mjs` lines: name all three vendor outputs. pdf-lib is missing there today.

## 9. Checks

- [x] 9.1 `npm test`.
- [x] 9.2 `npm run db:migrate:test`, then `npm run test:database`.
- [x] 9.3 `npm run test:browser`.
- [x] 9.4 `npx openspec validate --all`.
- [x] 9.5 Record why `npm run test:auth-browser` (sign-in untouched) and `npm run build:hant -- --check` (no client text changed) were not needed.
