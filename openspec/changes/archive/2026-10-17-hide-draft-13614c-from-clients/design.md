## Context

The client's summary page (9.2, `summaryBody` in `src/intake-views.mjs`) offers three things: Print, the draft Form 13614-C in three languages (`draftButtons`), and the draft Form 14446 in two (`draft14446Buttons`). Staff get their own buttons (`draftTools` in `src/staff-views.mjs`). They are written out in English and offered only after the claim.

Every press, client or staff, goes to one handler, `viewDraft(form, by, kind)` in `src/app.mjs`. It reads `data-form` and `data-draft` from the button. The page only decides which buttons exist. The principal is `state.principal`: `access` is `"presenter"` for staff and `"applicant"` for a client.

The 13614-C has shaded parts that only a certified volunteer completes. Change 2 will let the preparer complete them inside ViTally. This change removes the client's half-finished copy first. Stakeholders: Hailey (owner), Jinyu (lifecycle work, #73, which this change doesn't touch), PCDC's volunteers.

## Goals / Non-Goals

**Goals:**
- A client on 9.2, in any language, is offered Print and the draft Form 14446, and no draft 13614-C.
- No button, attribute or URL can make a client page build a 13614-C.
- The intro and the draft tab's title no longer mention 13614-C to a client.
- The browser story keeps covering the draft machinery (fonts, a refused font, a refused form with Try again, the blocked-tab link) on the client page, through the 14446.

**Non-Goals:**
- The staff draft buttons, and anything about who may see them.
- The draft forms' contents (`draft-form.mjs`, `draft-virtual-consent.mjs`, `draft-pdf.mjs`).
- The volunteer section (change 2).
- Server-side enforcement. The draft is built in the browser from answers the client already has. There is nothing secret to protect, only a half-finished form not to hand out.

## Decisions

### D1: Remove the client's 13614-C buttons and their helpers
- **Choice:** `summaryBody` renders Print, `draft14446Buttons(lang)` and the `#draft-ready` line. `draftButtons` and `DRAFT_FORMS` are deleted, because nothing else uses them. The summary's comment drops "the draft buttons" in favour of "the draft Form 14446".
- **Why:** dead code would invite someone to put the button back.
- **Alternative considered:** hide the buttons with CSS or a flag. Rejected: the markup would still carry them, and the guard (D2) would be the only barrier.

### D2: `viewDraft` builds a 13614-C only for staff
- **Choice:** the first line of `viewDraft` (before `window.open`) returns when `kind !== "14446"` and `controller.getState().principal?.access !== "presenter"`. A refused request opens no tab, draws no link and raises no error, like the existing unknown-form return.
- **Why:**
  - The handler is shared, and its buttons are only data attributes. Checking the principal stops a forged button whatever page it is on.
  - Returning before `window.open` leaves no empty tab behind.
- **Alternatives considered:**
  - Check the screen (`state.screen` in `CLIENT_SCREENS`). Rejected: the principal is what decides, and the screen list is the controller's private value.
  - An error message. Rejected: no real button can reach it, so there's nothing to tell the client.

### D3: Client text
- **Choice:**
  - `summary.intro_tools` becomes "With the buttons below, you can print this summary, or view and download a draft Form 14446 made from your answers." / "您可以用下方的按钮打印这份汇总，或查看并下载根据您的回答生成的 14446 表草稿。" ("14446 表草稿" matches the button's "查看 14446 表草稿".)
  - `draft.view` and `draft.form_zh_s` are removed.
  - `draft.form_en` and `draft.form_zh_t` stay, because the 14446 uses them.
  - Then `npm run build:hant`.
- **Why:** unused keys are dead text that the wording review would still read.

### D4: The draft tab is titled by form
- **Choice:** a new key, `draft14446.tab_title`: "Draft Form 14446" / "14446 表草稿". `writeTab(tab, text, kind)` titles the tab with it for a 14446, and with `draft.tab_title` otherwise. Every caller passes the `kind` it has.
- **Why:** otherwise a client, who now only opens a 14446, reads "13614-C" in the tab while it is prepared or after it fails.
- **Alternative considered:** a neutral "Draft form". Rejected: the tab should name the form, as the file name already does.

### D5: The story retargets its client draft checks to the 14446
- **Choice:** in `tests/browser.mjs`'s client draft section (Chrome only, as today):
  - The client's 13614-C opens (en, zh-s, zh-t, with their font counts) go.
  - The 14446 en and zh-t checks stay as they are. The zh-t one already proves the Chinese-name path fetches the 繁體 and Latin fonts.
  - These move to the 14446:
    - the refused font: the Latin font's bytes are swapped while the 繁體 14446 is built with the Chinese name;
    - the refused form with Try again: the route becomes `src/forms/f14446-pcdc-en.pdf`, and the 14446 en is opened;
    - the blocked-tab link: the 14446 zh-t, whose download is `14446-draft-<reference>-zh-t.pdf`.
  - New checks:
    - on 9.2, no `view-draft` button lacks `data-draft="14446"`;
    - a 13614-C button injected into the client page opens no popup, and the page shows no `#draft-ready` link and no problem banner;
    - the failed 14446 tab (from the refused-form check, where the tab stays on `draft.failed`) is titled "Draft Form 14446". The title is read on the failed tab, not while it is being prepared, which would race the build.
- **Why:** the machinery under test is shared, so the 14446 exercises the same code. The user chose this over also moving the 简体/繁體 13614-C opens to the staff window.
- **Alternative considered:** move the 13614-C's 简体/繁體 opens to the staff window. Rejected by the user: the staff case would need a Chinese answer, and the story would get longer.

### D6: Unit tests follow the markup
- **Choice:**
  - `tests/client-views.test.mjs`: the summary toolbox has Print and the 14446 buttons, and no `view-draft` without `data-draft="14446"`. The intro sentence is pinned in its new wording. The order is Print, then the 14446.
  - `tests/client-language.test.mjs`: the three-forms test becomes "the summary offers no 13614-C in any language". `draft.view` is gone, so nothing refers to it.
  - `tests/shell.test.mjs`: `viewDraft` returns for a non-presenter 13614-C before `window.open`, and `writeTab` uses `draft14446.tab_title`.
  - `tests/staff-views.test.mjs` is unchanged and still pins the five staff buttons.

## Risks / Trade-offs

- [Trade-off] The 13614-C's 简体 and 繁體 font fetch is no longer exercised in a real browser. → Accepted (user's choice). `tests/draft-pdf.test.mjs` covers the fonts and the build, and the 14446 zh-t covers the browser's font fetch and its sha256 check.
- [Risk] The refused-form check now routes the 14446's form URL. If the 14446 build fails earlier (for example on a font), the check would pass for the wrong reason. → Mitigation: it opens the English 14446, which fetches no font (asserted just before), and it still awaits the 500 console line it excuses.
- [Risk] A staff principal on a client screen. → Not reachable: the controller never restores a client screen for a presenter, and a presenter's 13614-C is allowed anyway.
- [Risk] Removing `draft.form_zh_s` breaks a test or a view that still names it. → Mitigation: grep before removal (only `DRAFT_FORMS` uses it today); `npm test` and `build:hant -- --check`.

## Migration Plan

N/A: there is no deployment or database change. The client page changes on the next load. Rollback is a revert of the PR.

## Open Questions

- None for this change. Change 2's name and the office's walk-in rule belong to change 2 (owner: Hailey).
