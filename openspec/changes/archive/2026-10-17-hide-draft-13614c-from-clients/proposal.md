## Why

Form 13614-C has shaded parts that only a certified volunteer fills in. The draft a client opens from 9.2 is half finished, yet it can be printed or handed in as if it were complete. Form 14446 is the client's to sign, so the client keeps it. Change 2 (`add-volunteer-section-to-13614c`) will let the preparer complete the 13614-C inside ViTally, and it relies on clients no longer seeing the 13614-C. Issue #80.

## What Changes

**The summary page's tools (9.2)**
- From: Print, View Draft 13614-C (with its other two languages), View Draft Form 14446 (with its 繁體中文版).
- To: Print and View Draft Form 14446 (with its 繁體中文版). No 13614-C in any language.
- Reason: the client's 13614-C is half finished.
- Impact: client screen, in all three languages. Staff are unaffected.

**The summary page's intro**
- From: "…or view and download a draft Form 13614-C or Form 14446 made from your answers." (…或查看并下载根据您的回答生成的 13614-C 或 14446 草稿。)
- To: "…or view and download a draft Form 14446 made from your answers." (…或查看并下载根据您的回答生成的 14446 表草稿。)
- Impact: client text in EN and 简体; 繁體 regenerated.

**A forged button on a client page**
- From: any `view-draft` button builds a 13614-C, whichever page it is on, so one added in devtools works on a client page.
- To: a 13614-C is built only for staff. On a client page, the request opens no tab and builds nothing.
- Impact: non-breaking for every real button.

**The draft tab's title**
- From: "Draft 13614-C" (13614-C 草稿) for every draft.
- To: "Draft Form 14446" (14446 表草稿) for a 14446. A 13614-C keeps its title.
- Reason: a client now only opens a 14446.
- Impact: client and staff tabs; a new client text key.

**Out of scope:** the staff draft buttons (unchanged), the volunteer section (change 2), the draft forms' contents.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `client-intake`: "The summary page explains itself and puts its tools first" changes. The intro names only Form 14446, and the tools are Print and View Draft Form 14446. A new requirement says a client page never makes a draft 13614-C.
- `draft-14446`: "The draft comes in English and 繁體" no longer places the client's buttons "next to the draft 13614-C buttons". A new requirement names the 14446's tab.
- `screen-states`: "A draft that couldn't be built" is unchanged, but its client scenario presses View Draft Form 14446 instead of the 13614-C.

## Impact

- **Code:**
  - `src/intake-views.mjs`: `summaryBody`; remove `draftButtons` and `DRAFT_FORMS`.
  - `src/app.mjs`: `viewDraft` refuses a non-staff 13614-C; `writeTab` titles the tab by form.
  - `src/client-text.mjs`: `summary.intro_tools` reworded; `draft.view` and `draft.form_zh_s` removed; `draft14446.tab_title` added.
  - `src/zh-hant.mjs`: regenerated.
  - `docs/developer/frontend.md`: a line on who can open which draft.
- **Tests:**
  - `tests/client-views.test.mjs` and `tests/client-language.test.mjs`: the summary's tools and intro.
  - `tests/shell.test.mjs`: the guard and the tab title.
  - `tests/browser.mjs`: the client draft section retargeted to the 14446, plus the no-button and forged-button checks.
- **Unchanged:**
  - the database, RPCs and RLS;
  - the staff draft buttons;
  - `src/draft-form.mjs`, `src/draft-pdf.mjs` and `src/draft-virtual-consent.mjs`;
  - the question catalogue.
- **Overlap:** none with Jinyu's lifecycle work (#73), which touches the database and the boards.
