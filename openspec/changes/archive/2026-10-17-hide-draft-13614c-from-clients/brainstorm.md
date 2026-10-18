# Brainstorm: hide-draft-13614c-from-clients

Captured from the design agreed with Hailey on 2026-10-17 ("Brainstorm result: Form 13614-C — clients stop seeing it, preparers complete it", Change 1 of 2, from the 2026-10-16 sync with Jinyu), plus two decisions taken during propose (Q6, Q7). GitHub issue #80. Change 2 (`add-volunteer-section-to-13614c`, name open) comes after this one.

## Background

- **Why.** Form 13614-C has shaded parts that only a certified volunteer fills in. The client's copy is half finished, and it should not be printed or handed in as if it were complete. Form 14446 is the client's to sign, so the client keeps it.
- **What the client sees today on 9.2** (`summaryBody` in `src/intake-views.mjs:610`):
  - the intro's third paragraph, `summary.intro_tools`: "With the buttons below, you can print this summary, or view and download a draft Form 13614-C or Form 14446 made from your answers." (您可以用下方的按钮打印这份汇总，或查看并下载根据您的回答生成的 13614-C 或 14446 草稿。);
  - the tools: Print, then `draftButtons(lang)` (View Draft 13614-C, with the other two languages as inline buttons), then `draft14446Buttons(lang)`.
- **What staff see** (`draftTools` in `src/staff-views.mjs:952`): the 13614-C in three languages and the 14446 in two, after the claim. Their buttons are written out in English and don't use `draftButtons`, `DRAFT_FORMS`, `draft.view` or `draft.form_zh_s`.
- **One handler for both.** `viewDraft(form, by, kind)` in `src/app.mjs:1214` builds every draft, client or staff, from `data-form` and `data-draft` on the pressed button. The page decides only which buttons exist, so a button forged in devtools would still build a 13614-C on a client page today.
- **Who is who.** `state.principal.access` is `"presenter"` for staff (the board, the case page, the office's Add a case) and `"applicant"` for a client (`src/controller.mjs`).
- **Text keys** (`src/client-text.mjs`):
  - Only `draftButtons` uses `draft.view` and `draft.form_zh_s`.
  - `draft14446Buttons` still uses `draft.form_en` and `draft.form_zh_t`.
  - The tab's `draft.tab_title` is "Draft 13614-C" / "13614-C 草稿", whatever the form.
  - `draft.preparing`, `draft.link`, `draft.failed` and `draft.font_unchecked` don't name a form.
- **Specs that name the client's 13614-C:**
  - `client-intake` → "The summary page explains itself and puts its tools first";
  - `draft-14446` → "The draft comes in English and 繁體" ("next to the draft 13614-C buttons");
  - `screen-states` → the scenario "A draft that couldn't be built" ("a client presses View Draft Form 13614-C").
- **Tests that pin it:**
  - `tests/client-views.test.mjs:1238` and `:1286` (the toolbox, the intro sentence, the order);
  - `tests/client-language.test.mjs:582` (the three forms per language);
  - the browser story's client draft section, `tests/browser.mjs:4390`–`4660`.
- **The story's client draft section** uses the client's 13614-C for more than the button:
  - English with no font fetched;
  - the 简体 and 繁體 font fetches, with a Chinese first name;
  - a font whose bytes aren't the pinned ones;
  - the form itself refused (500), with the banner's Try again;
  - the blocked-tab link and its redraw.
  
  The 14446 checks (en, then zh-t with the Chinese name) sit in the middle of it. The staff side of the story (`tests/browser.mjs:1060`–`1080`) checks the five staff buttons and opens one English 13614-C in Chrome.

## Decision chain

**Q1. Scope.**
→ In: the client's summary page (9.2) stops offering the draft Form 13614-C in any language, and the draft Form 14446 buttons stay. Out: the staff draft buttons, which are unchanged, and the volunteer section (change 2).

**Q2. The summary's tools.**
→ `summaryBody` renders Print and `draft14446Buttons(lang)` only. `draftButtons` and `DRAFT_FORMS` go, because nothing else uses them.

**Q3. Client text.**
→ `summary.intro_tools` drops "Form 13614-C" in English and 简体. `draft.view` and `draft.form_zh_s` go, because nothing else uses them. Then `npm run build:hant`, and commit `src/zh-hant.mjs`.

**Q4. A forged button.**
→ The client's `view-draft` must refuse a 13614-C request on a client page: no URL or data attribute can bring it back. The guard goes in `viewDraft`: a 13614-C is built only for a staff principal (`access === "presenter"`). Anyone else gets nothing: no tab, no build, no error. *(Placing the guard on the principal, before `window.open`, is my call from the code; the brainstorm only asked that the handler refuse.)*

**Q5. Spec delta.**
→ MODIFIED `client-intake` → "The summary page explains itself and puts its tools first":
- the intro's third paragraph names only Form 14446;
- item 2 lists Print and View Draft Form 14446 (with its 繁體中文版), with no View Draft 13614-C;
- update its two scenarios.

Found during propose: `draft-14446`'s "next to the draft 13614-C buttons" and `screen-states`' client scenario also name the client's 13614-C, so they are MODIFIED too. Neither changes what they require beyond that.

**Q6. The story's client draft checks (decided during propose).**
→ **Retarget them to the client's Form 14446.** The refused font, the refused form with Try again, and the blocked-tab link run on the client's 14446 instead of the 13614-C. The 14446 en and zh-t checks stay. The client's 13614-C opens (en, zh-s, zh-t) go. New checks:
- 9.2 has no 13614-C button;
- a forged 13614-C button on the client page opens no tab and builds nothing.

What is given up: the 13614-C's 简体 and 繁體 font fetches in a real browser are then covered only by unit tests. The staff side keeps its English 13614-C open. Rejected: also having the staff window open the 简体 and 繁體 13614-C. That needs a Chinese answer on the staff case and adds story steps and time.

**Q7. The draft tab's title (decided during propose).**
→ **Title by form.** While a draft is made, its tab is titled:
- for a 13614-C: "Draft 13614-C" (13614-C 草稿), as today;
- for a 14446: "Draft Form 14446" (14446 表草稿), a new key, `draft14446.tab_title`.

Otherwise a client, who now only opens a 14446, would still read "13614-C" in that tab. This is new client text (EN + 简体, then `build:hant`), and it goes in the spec delta. Rejected: leaving it as a known leftover.

## Dependencies

- None on other systems. The change doesn't touch the database, so it doesn't conflict with Jinyu's lifecycle work (#73).
- Change 2 relies on this one: clients never see the 13614-C, so the volunteer section is staff only.

## Acceptance

- A client on 9.2, in English, 简体 and 繁體, sees Print and the Form 14446 buttons, and no 13614-C button. The intro sentence no longer mentions 13614-C.
- A forged 13614-C button on a client page opens nothing.
- A 14446's tab reads "Draft Form 14446" (14446 表草稿) while it is being made.
- Staff case pages still offer the 13614-C draft in three languages plus Form 14446, after the claim, as today.
- Checks:
  - `npm test`;
  - `npm run build:hant -- --check`;
  - `npm run test:browser`, because the story's client draft steps change;
  - `npx openspec validate --all`.
  
  The unit tests in `tests/client-views.test.mjs` and `tests/client-language.test.mjs` that expect the button are updated.
