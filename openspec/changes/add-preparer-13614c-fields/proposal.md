## Why

Today the 13614-C's shaded section ("To be completed by certified volunteer") lives only on paper or in the preparer's head. ViTally records the preparer's tick "I have completed the shaded parts", but not what they filled in. The staff draft therefore always shows the section empty, and the reviewer can't see it. Issue #94 item 4 asks for the shaded section inside ViTally for M4, with a go / no-go on Thu Oct 29. Filling the fields directly on the PDF keeps the preparer on the form they already know, and storing only the values keeps clients' data out of stored files.

## What Changes

- **New: the preparer fills the 106 shaded fields of the 13614-C in ViTally.**
  - There are two ways, both always offered on the case page:
    - **Fill here:** a full-screen pdf.js view of an *editing copy* of the English draft. The client's answers are flattened, and only the shaded fields are live.
    - **Download / upload:** the same copy, filled in Acrobat or Chrome and read back with pdf-lib in the browser.
  - Only the values are kept. The file is never uploaded or stored.
- **New action `SAVE_PREPARER_FIELDS`** through `vitally_apply_action`:
  - the case's preparer only, at Filing in progress and Corrections in progress;
  - checked in the browser and by the database;
  - guarded by a row version, so a save from a second tab or a stale download is refused rather than overwriting;
  - each save adds a staff history line naming the changed fields, never their values, and no client line.
- **New staff-only table** `preparer_shaded_fields`: one row per case, holding a checked `jsonb` of the values. Clients can't read it.
- **The staff draft 13614-C fills the stored values in all three forms**:
  - household cells as Yes / No / N/A;
  - long shaded notes wrapped in their box and continued in Additional Comments.

  **Draft stamp**
  - From: "DRAFT – prepared from online answers, <date>, <reference>" on every 13614-C draft.
  - To: "DRAFT – online answers and preparer entries, <date>, <reference>" when shaded values exist; unchanged otherwise.
  - Reason: the old wording would credit the preparer's entries to the client.
  - Impact: non-breaking. Staff only; the 14446 stamp is unchanged.
- **Sample cases** that already carry a preparer questionnaire also get a fictional shaded row, so the demo never shows "completed" beside an empty section.
- **Dialog behaviour for the editor.**
  - From: Escape always closes a dialog.
  - To: Escape on an editor with unsaved changes asks "Discard your changes?" first.
  - Reason: unsaved typing on the form shouldn't be lost to one key.
  - Impact: non-breaking. Only the new editor.
- **New vendored dependency:** `pdfjs-dist` 6.4.299, legacy build, copied by `npm run build:vendor` and loaded only when the editor opens. It supports Chrome / Edge 125+, Firefox ESR and Safari 18+. Below those, the download / upload path applies.
- **This replaces #94's plan of an HTML form beside the answers.** #94 put pdf.js out of scope; this change brings it in.

## Capabilities

### New Capabilities
- `shaded-section`: the preparer's 13614-C shaded section. It covers which fields exist and their allowed values, who may save and when, saving and conflicts, the staff history line, the pdf.js editor and the download / upload path, who can read the values (staff only), and the sample data.

### Modified Capabilities
- `draft-13614c`: the staff draft fills the stored shaded values in all three forms, continues long shaded notes in Additional Comments, and words its stamp by whether preparer entries are present.
- `screen-states`: Escape on the shaded-section editor with unsaved changes asks first, and the error rule covers an editor that couldn't open and an uploaded copy that couldn't be read.

## Impact

- **Database:** a new migration (next free number when the PR opens) with:
  - the table and its presenter-only select policy;
  - `check_preparer_fields`;
  - `act_save_preparer_fields`;
  - redefinitions of `check_payload`, `vitally_apply_action`, `check_operation_authority` and `apply_fixture_scenario`.

  #90 also edits those four functions, so tell the group before touching them.
- **Browser:**
  - a new pure module for the field table, reading and checks;
  - `src/draft-form.mjs` (the shaded fill) and `src/draft-pdf.mjs` (the editing copy, partial flatten, shaded comment wrapping, stamp);
  - `src/app.mjs` (the editor layer outside `#app`, download and upload);
  - `src/staff-views.mjs` (the buttons, History labels);
  - `src/supabase-store.mjs` (loading the row);
  - `src/case-actions.mjs` and the controller (the action).
- **Build:** `tools/build.mjs` copies `src/vendor/pdfjs.mjs` and `src/vendor/pdfjs-worker.mjs`. The server's vendor allowlist already matches those names.
- **Tests:**
  - unit (the field table against all three PDFs, rules, the partial flatten including a Chinese-name sample, the draft fill, overflow, stamps, the upload reader);
  - database (authority, stages, validation, conflict, history, RLS, fixtures);
  - browser story (one pdf.js step, one download / upload step).
- **Docs:** `docs/developer/frontend.md`, `docs/developer/database.md`, `docs/setup.md` (the vendor bundle), and the `build:vendor` lines in `docs/developer/backend.md` and `docs/developer/README.md`.
- **Unchanged:** client screens and client text; the questionnaire's shaded tick; sign-in.
