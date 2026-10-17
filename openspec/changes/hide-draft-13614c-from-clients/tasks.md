## 1. The summary page offers no 13614-C

- [x] 1.1 Update the failing tests first:
  - `tests/client-views.test.mjs` (the summary toolbox test, about line 1238): Print and the 14446 buttons, and no `view-draft` without `data-draft="14446"`. Pin the intro in its new wording.
  - The 14446 test (about line 1286): the intro sentence names only Form 14446, and the order is Print, then the 14446.
  - `tests/client-language.test.mjs` (about line 582): the three-forms test becomes "the summary offers no draft 13614-C in English, 简体 or 繁體", with the 14446's first form per language (en → en, zh-Hans and zh-Hant → zh-t).
- [x] 1.2 `src/intake-views.mjs`: `summaryBody` renders Print, `draft14446Buttons(lang)` and `#draft-ready`. Delete `draftButtons` and `DRAFT_FORMS`, and update the comments that name them (design D1).
- [x] 1.3 `src/client-text.mjs`:
  - reword `summary.intro_tools` in EN and 简体 (design D3);
  - remove `draft.view` and `draft.form_zh_s` after a grep shows nothing else uses them;
  - run `npm run build:hant`.
- [x] 1.4 Run `npm test`.

## 2. Only staff make a draft 13614-C; the 14446's tab names its form

- [ ] 2.1 Write the failing source checks in `tests/shell.test.mjs`'s draft block:
  - `viewDraft` returns for a non-presenter 13614-C before `window.open`;
  - `writeTab` takes the draft's kind and uses `"draft14446.tab_title"` for a 14446;
  - add `draft14446.tab_title` to the view-language key list.
- [ ] 2.2 `src/app.mjs`:
  - the guard on `principal?.access !== "presenter"` for `kind !== "14446"`, as `viewDraft`'s first check (design D2);
  - `writeTab(tab, text, kind)`, with every caller passing `kind` (design D4).
- [ ] 2.3 `src/client-text.mjs`: add `draft14446.tab_title` ("Draft Form 14446" / "14446 表草稿"), then run `npm run build:hant`.
- [ ] 2.4 Run `npm test` and `npm run build:hant -- --check`.

## 3. The browser story

- [ ] 3.1 `tests/browser.mjs`, client draft section (Chrome only), per design D5:
  - drop the client's 13614-C opens (en, zh-s, zh-t);
  - keep the 14446 en and zh-t checks;
  - move these to the 14446:
    - the refused font: the 繁體 14446, with the Chinese name;
    - the refused form and Try again: route `src/forms/f14446-pcdc-en.pdf`, open the 14446 en; assert the failed tab's title is "Draft Form 14446";
    - the blocked-tab link: the 14446 zh-t, download `14446-draft-<reference>-zh-t.pdf`, with its redraw check.
  - Update the comments and the `draft` summary keys to match.
- [ ] 3.2 `tests/browser.mjs`: on 9.2, assert every `view-draft` button carries `data-draft="14446"`. Inject a `data-action="view-draft" data-form="en"` button into the client page, press it, and assert: no popup, no `#draft-ready` link, no problem banner.
- [ ] 3.3 Confirm the staff side's checks (the five buttons and the English 13614-C open, about line 1060) are unchanged.
- [ ] 3.4 Run `npm run test:browser` once. Record failures at steps this change doesn't touch; don't retry them.

## 4. Docs and final checks

- [ ] 4.1 `docs/developer/frontend.md`:
  - the client's summary offers only the draft Form 14446;
  - `viewDraft` makes a 13614-C only for staff;
  - the tab is titled by form.
  
  Check `docs/developer/` for any other line that says the client opens the 13614-C.
- [ ] 4.2 Run `npm test`, `npm run build:hant -- --check` and `npx openspec validate --all`.
