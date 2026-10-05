# Part 4d: Chinese on screen — Design

**Status:** approved in brainstorming on 2026-10-05; for the group's review with the other new wording.
**Roadmap:** part 4 of `docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md` (4a catalogue, 4b client intake, 4c staff views and Add a case, **4d Chinese**). Earlier specs said only "4d: turning on Chinese"; the language switch has shown 简体中文 and 繁體中文 disabled since the restyle.

## 1. Scope and decisions

| Decision | Choice |
|---|---|
| Where Chinese reaches | **The whole client side.** Staff and presenter screens stay English. |
| Scripts | **Simplified and Traditional.** Traditional is **derived from the Simplified at build time** (OpenCC, Hong Kong character forms, no vocabulary swaps), with hand-written overrides. |
| Where the choice is kept | **Per browser** (`localStorage`), defaulting from the browser's languages. No migration. |
| Who writes the Chinese | **Claude drafts the Simplified** for all screen text. Everything goes to the group's wording review; 4d ships complete and wording is corrected in a follow-up. |
| How text is organised | **A keyed text table** (`src/client-text.mjs`) plus a **generated Traditional map** (`src/zh-hant.mjs`). |

**What already exists:**
- **The catalogue** (`src/intake-catalogue-data.mjs`) has Simplified `zh` for all 659 of its strings: step, sub-step and section titles, questions, options, tips and intros, in both wordings.
- **The document cards** (`src/document-cards.mjs`) carry `zh`.
- **`wording()` and the form renderer** already take `lang`.
- **No Traditional text exists anywhere.**

**Out of scope:**
- staff and presenter screens;
- the operators' "not configured" setup screen;
- the version-1 form, which goes with version 1 after 4d;
- the sign-in email, which Supabase sends from outside the app;
- machine translation of anything the office types;
- preset document-request types with their own translations (a possible later improvement).

## 2. The language and the switch

- **Three values:** `en`, `zh-Hans` and `zh-Hant`, the switch buttons' own `lang` attributes.
  - Catalogue and card text: `zh-Hans` reads `zh`; `zh-Hant` reads `zh` and looks it up in the Traditional map (§4).
- **`src/language.mjs`** reads and writes `localStorage["vitally.lang"]`, every access in try/catch; blocked storage means English. The first visit defaults from `navigator.languages`:
  - `zh-TW`, `zh-HK`, `zh-MO` and `zh-Hant*` give `zh-Hant`;
  - any other `zh*` gives `zh-Hans`;
  - anything else gives `en`.
- **The controller** holds `state.lang`; `setLanguage(lang)` saves it and redraws. It isn't part of the per-user window state, because it has to work before sign-in.
- **Other tabs follow (decision 2026-10-05).** `app.mjs` listens for the browser's `storage` event on `vitally.lang`, so another tab of the same browser redraws in the new language at once. A move to 繁體 loads the map first (§4). Typed text is swept first there too.
- **The page title** (`document.title`, today "ViTally · PCDC community tax help · 2025 tax year") follows the language on client screens and is English on staff screens.
- **No answer is pre-filled from the screen language (decision 2026-10-05).** The intake's "preferred language for service" (`language`) is a different question from the reading script, and the client answers it themselves.
- **The switch** (`languageSwitch` in `src/views.mjs`):
  - Its three buttons become live with `data-action="set-language"` and `data-lang`. `aria-pressed` marks the current one, and the "Chinese coming soon" note goes.
  - It stays in the client top bar, which is on every client screen, sign-in included.
  - After the redraw the keyboard stays on the pressed button.
- **Staff screens are always English** whatever is stored, and have no switch. That includes the presenter's window.
- **Screens shown before anyone is known follow the stored language,** because they come before the app knows whether this is a client or a presenter: sign-in, "unreachable" and "no access". So does a presenter's sign-in in a browser set to Chinese. That's accepted: the presenter's screens turn English once signed in.
- **`<html lang>`** follows the language on client screens and is `en` on staff screens.
- **Switching never loses work.** On the version-2 form typed text is swept into the draft first, as for every action. Answers are codes, so they don't change. The press goes through the redraw hold. Scroll and the current sub-step stay.
- **A version-1 draft's form stays English, but its frame follows the language.** The top bar, banners, footer and toasts are translated as on any client screen. A client in Chinese who opens one sees a one-line note, in their language, that this older application is available in English only. The form body carries `lang="en"`, so screen readers read it in English inside a Chinese page.
- **Shared modules default to English.**
  - `intake-form.mjs`, `document-cards.mjs`, `ui.mjs` and the stage descriptions are also used by staff screens and Add a case.
  - Every function that produces text takes `lang` with the default `"en"`.
  - Only client paths pass the chosen language.
  - Examples: invalid-answer messages, `formatAnswer`, stage badges and `clientMessage`.
- **The language is applied at render time, never stored as text.**
  - State that holds a sentence today keeps holding the English sentence: `authMessage`, also saved in the window's access record; `error.message`; and notices.
  - Each is translated when it's drawn (§3.2), so switching language re-translates what's already on screen.
  - Toasts raised on client screens are translated when they're raised.

## 3. What is translated

**Translated:**
- **The frame of every client screen:**
  - the skip link;
  - the top bar (logo label, Help, Save & exit, Sign out);
  - the connection, notice and problem banners;
  - the "Need help?" dialog;
  - the footer;
  - toasts;
  - the "unreachable" and "no access" screens.
- **Sign-in:** the email and code steps, the troubleshooting text and the footnote.
- **The applications list and the reference screen.**
- **The version-2 intake:**
  - the rail and its part labels;
  - the catalogue text and the senior switch;
  - Continue and Back;
  - the save chip;
  - the conflict panel;
  - Review & submit: alerts, warnings, summary, Change links, confirmation and Submit;
  - the Documents step: card text from `document-cards.mjs`, marks and the client wording;
  - Additional Notes;
  - the submitted page.
- **The draft 13614-C buttons on Review & submit** keep all three forms. The current language's form comes first, then the other two.
- **The progress page:** status, client number, requests, sending a document, the open document cards and the history (§3.3).
- **Errors, sign-in messages and notices:** translated by exact English sentence (§3.2).
- **The version-1 note** (§2).

**As typed, never translated:**
- what the client typed (names, addresses, notes);
- Application IDs and email addresses;
- text the office types (§3.4).

### 3.1 Attributes count as text

`aria-label`, `title`, `placeholder` and `alt` on client screens are translated like visible text. For example, the switch group's "Language" label and the logo's "ViTally home" are translated. The switch's own button names stay in their own language: English, 简体中文 and 繁體中文.

### 3.2 Sentences that arrive in English (decision 2026-10-05)

- **What they are:** many messages reach the screen as a finished English sentence.
  - `errors.mjs`'s one sentence per code.
  - The controller's own `controllerError` sentences, 18 today.
  - The sign-in sentences from `auth.mjs` and the controller (for example `NEUTRAL_SEND_MESSAGE`), which are also saved in the window's sign-in record.
  - The history sentences (§3.3).
- **How they're translated:** one sentence-keyed table in `client-text.mjs`, from the exact English sentence to its `zh`. The lookup happens when the sentence is drawn on a client screen.
- **Unknown sentences show in English.** Codes are too coarse to translate by, because `VALIDATION` alone covers many sentences.
- **A unit test pins every sentence** in `errors.mjs`, every literal `controllerError` sentence in `controller.mjs`, and every sentence in `auth.mjs` to an entry. Staff-only sentences cost nothing to include.
- **Toasts raised on client screens** use keys, not sentences, and are translated when raised.

### 3.3 The application history

- **Where it comes from:** each `client_events` row holds an action code and an English sentence written by the database. Every sentence in the migrations is fixed, except "A volunteer requested a document: " followed by the title the office typed.
- **Translated in the browser, keyed by the exact stored English sentence.** Keying on the sentence also covers the seeded sample rows, and stays right if one action ever writes two sentences.
- **The request line:** its English prefix is replaced by the translated prefix, and the office's title is kept as typed.
- **Unknown sentences show in English.** No migration; the database keeps writing English.
- **A unit test pins every sentence found in `supabase/migrations/*.sql` to an entry.**

### 3.4 Text the office types

- **Request titles and messages, and the title inside the history line, are shown as typed.**
- **Only the labels around them are translated** (for example 需要的文件, 办公室留言), so the client sees whose words they are.
- **No `lang` attribute is set on them** (they could be English or Chinese).
- **No machine translation.**

### 3.5 The draft 13614-C's generated lines

These are the lines the app writes onto the form: Additional Comments, "Not sure" lines and household overflow rows.

- **The English form:** English lines, as today.
- **The 简体 form:** Simplified lines, with question wording taken from the catalogue's `zh`.
- **The 繁體 form:** Traditional lines, through the Traditional map.
- **The font follows from this.** A 简体 or 繁體 draft with any generated line now always contains Chinese, so it fetches the Noto font even when every answer is in Latin letters. Today that happens only when an answer is in Chinese. The 4b2 font rules are unchanged. Only the English form keeps "no font for Latin-only answers", which the 4c staff phase asserts.
- **Existing tests that pin English lines on a Chinese form change on purpose.** For example, `tests/draft-form.test.mjs`'s "Not sure:" line is checked on the English form. The plan lists each test it changes.

## 4. Generating Traditional

- **Tool:** `tools/build-hant.mjs` (`npm run build:hant`), using `opencc-js` pinned to an exact version as a dev dependency. Downloading it from npm is approved.
  - **Conversion:** Simplified → **Hong Kong character forms**, with no phrase or vocabulary conversion, so the wording stays the reviewed Simplified wording in the other script.
- **Inputs:** every Simplified string a client can see:
  - the catalogue's `zh`;
  - the cards' `zh`;
  - the client text table;
  - the draft's Simplified lines.
- **Templates:** a string with a placeholder (`您填写的是：{written}`) is converted as a template, and the client's text is filled in afterwards, never converted. `document-cards.mjs`'s inline `zh` strings that embed client text become placeholder templates.
- **Overrides:** `tools/hant-overrides.mjs` holds hand-written replacements applied after conversion, for example where 发 or 干 has several Traditional forms. Each override carries a one-line reason. It starts with whatever the first build's review turns up.
- **Output:** `src/zh-hant.mjs`, a checked-in map from each Simplified string to its Traditional form (keys sorted), plus `toHant(text)`.
  - A missing entry falls back to the Simplified text and never fails.
- **Loading:** the map is loaded only when 繁體 is chosen. Switching imports it, then redraws. English and 简体 users never download it.
  - **A failed switch:** the language stays as it was, and a toast says so.
  - **Starting in 繁體** (saved in the browser): `app.mjs` loads the map before the first page is drawn. **If that load fails, the page starts in 简体 (decision 2026-10-05)**, the same language in the other script, with a toast. The saved choice stays 繁體, so the next visit tries again.

## 5. Formatting, fonts and layout

- **Dates:** one helper per kind in `src/ui.mjs`; no screen keeps its own `"en-US"`.
  - **Dates in answers** are formatted by hand from a per-language month list. This replaces `MONTHS` (`src/intake-form.mjs:25`). English stays "Apr 12, 1961"; Chinese is "1961年4月12日".
  - **Times** (history, status) use `Intl` with `en-US`, `zh-CN` or `zh-HK`.
- **The date boxes:**
  - **Order:** in Chinese the three boxes are ordered 年 / 月 / 日; English keeps month / day / year.
  - **Labels and placeholders** come from the text table (`DATE_PARTS`, `src/intake-form.mjs:20`).
  - **Ids** stay `${base}-${part}`, so code that fills them by id is unaffected, and the form reads them by name, so nothing stored changes.
- **Range hints** ("65 or more", "0 to 10", `rangeText`, `src/intake-form.mjs:305`), the long-answer counter and every other assembled phrase go through the text table.
- **Numbers** keep the same digits and grouping.
- **Plurals:** English entries may have `one` and `other`; Chinese has one form. `t()` takes both shapes.
- **Fonts:** no Chinese web font is downloaded. Under `:lang(zh-Hans)` and `:lang(zh-Hant)`, system fallbacks follow the Latin fonts:
  - 简体: PingFang SC, Microsoft YaHei, Noto Sans SC;
  - 繁體: PingFang HK, Microsoft JhengHei, Noto Sans TC.

  Serif headings use the same sans fallbacks in Chinese.
- **Letter-spacing goes to 0 under `:lang(zh)`:**
  - on the spaced uppercase overlines;
  - on the large serif headings, which use negative letter-spacing (`-2.3px` at `src/styles.css:294`, `-1.3px` at `:129`) that would cram Chinese characters together.
- **Body text** gets a slightly larger line height under `:lang(zh)`.
- **Buttons and the rail** are checked at 390px.
- **Unchanged:** input methods (the 4b redraw hold), native pickers (the browser's locale) and the character counter (characters).

## 6. Tests

**Unit:**
- **The text table:** every key has `en` and `zh`; both carry the same `{placeholders}`; plural entries have `one` and `other`.
- **`language.mjs`:** defaults from `navigator.languages` (`zh-TW`, `zh-HK`, `zh-CN`, `zh`, `en-US`, empty) and the blocked-storage fallback.
- **Nothing left in English:**
  - Every client screen is rendered in `zh-Hans`, with sample answers and every state that changes the text (sign-in steps, each intake sub-step, Review with alerts, Documents, submitted, progress with a request and history, banners, the help dialog, toasts, errors).
  - The sample answers' free-text fields (names, address, notes) are Chinese, so the allow-list stays short and any Latin text found is a leak.
  - The sweep reads visible text and the `aria-label`, `title`, `placeholder` and `alt` attributes.
  - The version-1 form body (`lang="en"`) is excluded.
  - The test flags any run of Latin words that isn't on a short allow-list:
    - the client's own text;
    - Application IDs and email addresses;
    - form and document names (W-2, 1099, ITIN, IRS, 13614-C and the like);
    - the brand (ViTally, PCDC);
    - any Latin word that appears in the reviewed Simplified source text itself, the catalogue's and the cards' `zh` (for example 工卡（EAD）). That text is deliberate, so the allow-list is derived from it rather than kept by hand.
- **History:** every client-event sentence in `supabase/migrations/*.sql` has an entry, and the request prefix keeps the office's title as typed.
- **Formatting:**
  - date order per language (年 / 月 / 日 in Chinese, month / day / year in English) and date-box labels and placeholders;
  - the hand-formatted answer dates;
  - range hints;
  - times in all three languages.
- **The draft:**
  - the 简体 form's generated lines are Simplified with catalogue wording;
  - **the 繁體 form's lines go through the Traditional map** (one test);
  - the English form is unchanged.
- **The Traditional map:**
  - its keys are exactly the current Simplified strings (nothing missing, nothing stale);
  - `npm run build:hant -- --check` regenerates in memory and must match the committed file;
  - the overrides apply.

**Browser story:**
- **Pin the locale in the existing contexts.** The first visit now defaults from `navigator.languages`, so a machine whose browser runs in Chinese could start the existing story in Chinese. Both `newContext` calls get `locale: "en-US"`: `tests/support/browser-fixture.mjs:391` and `tests/browser.mjs:2457`.
- **One new phase in its own `locale: "zh-CN"` context,** which also tests the default from the browser:
  - the client starts in 简体 before sign-in;
  - walks the version-2 intake with Fill and rail jumps through Review & submit;
  - submits, and checks the progress page in Chinese, including a history line;
  - switches to 繁體 once and checks a few strings;
  - checks that the Traditional map was requested only then (no request for `src/zh-hant.mjs` before the switch).
- **Locators:** the phase finds controls by id and `data-action`, never by English text, and waits for Chinese strings only where it checks wording. Any shared story helper it needs that matches English text gets a text-free variant.
- **Every other phase stays in English.**

**Screenshots:** three 简体 shots in `docs/design/screens/`, of the intake, Review & submit and the progress page, for the group's review.

## 7. Rollout and docs

- **Rollout:** no migration, no flag and no hold. The switch goes live when the PR merges, and the group corrects the wording afterwards.
- **Version-2 caveat:** Chinese reaches the questions only on version-2 cases. Until the held switch-over (migration 020) runs, live workspaces start version-1 applications, which stay English with the note in §2. Chinese pays off fully after the switch-over.
- **Docs:**
  - the README's 4d row;
  - `docs/developer/frontend.md`: how to add client text, how `t()` and `lang` work, and how to run `build:hant`;
  - `docs/setup.md`: the dev dependency and the counts.
- **The wording review:** the text table is the review list (English, 简体, and 繁體 through the map).
