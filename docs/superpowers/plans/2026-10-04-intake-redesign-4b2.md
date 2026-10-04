# Part 4b2: The intake redesign, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the client's version-2 intake as steps 0–9 with sub-steps and a rail tree, with visits stored on the server, an answer-driven Documents checklist with card state on the server, a Review & submit step, and a draft Form 13614-C built in the browser. The form stays unreachable in normal use (`default_intake_version` stays 1), like 4b.

**Architecture:**
- **Catalogue.** The build's `STEPS` table gains stable step ids and `substeps[]` (lists of question ids) beside the unchanged `steps[].sections[].questions`. The household gains a hidden, required `member_id`. A hand-written loader migration (015) teaches the database the new type and sub-steps; the build then generates the catalogue migration (016).
- **Documents.** A pure rules module, `src/document-cards.mjs`, turns visible answers plus stored card state into cards. Card state lives in `case_document_cards`, written by two new actions in migration 017, which also stores visits (`cases.intake_visited`) through an optional `visited` key on `SAVE_ANSWERS`.
- **Form.** `src/intake-form.mjs` gains the sub-step logic (visibility, fallback, marks). `src/intake-views.mjs` (new) renders the v2 form, documents, review and the progress additions. The controller moves version 2 from `formStep` to `formSubstep`, and stops raising the conflict screen for revisions that change no answers.
- **Draft 13614-C.** `src/draft-form.mjs` (pure field map) and `src/draft-pdf.mjs` (PDF builder taking an injected pdf-lib) fill the three Rev. 10-2025 forms in `src/forms/`. pdf-lib is its own lazy vendor bundle. The Chinese font comes from a CDN, chosen by a spike (Task 1).

**Tech Stack:** vanilla ES modules rendering HTML strings; `node:test`; Playwright; Postgres/Supabase on the local test stack; pdf-lib 1.17.1 and @pdf-lib/fontkit 1.1.1 (bundled with esbuild).

**Spec:** `docs/superpowers/specs/2026-10-04-intake-redesign-design.md` (all of it except §8, the sidebar, which has its own plan). It revises `docs/superpowers/specs/2026-09-30-intake-screens-design.md`, whose §2 (renderer, redraw rules, invalid values) still binds, with the renames in the new spec's §3.6.

## Global Constraints

- **Version 1 is untouched.** A version-1 draft gets today's four-step form, byte-for-byte. Version 1 keeps `formStep` (0–3). No version-1 test changes except where a shared helper's signature changes.
- **Nothing reaches version 2 in normal use.** `default_intake_version` stays 1 everywhere. No migration in this PR changes a default or a workspace row.
- **Migrations 001–014 are never edited.** New migrations are `015_intake_loader.sql`, `016_intake_catalogue_<hash8>.sql` (generated) and `017_documents_and_visits.sql`. **Each is final when its task ends**: the test stack refuses a migration whose text changed after it was applied (`tools/admin/migrate.mjs`, `MIGRATION_CHANGED`). If a later task finds a bug in an earlier migration, it fixes it in a new migration, never by editing.
- **Redefinitions copy the latest definition verbatim** and add only the stated branches, as 013 does (`-- verbatim from 013 with … added`). Latest definitions today: `check_operation_authority`, `check_authority`, `check_payload` and `vitally_apply_action` in `013_contact_materials.sql`; `check_related`, `check_intake_value`, `put_intake_field`, `load_intake_catalogue`, `act_save_answers` in `011_intake_v2.sql`.
- **Module names under `src/` match `^[a-z-]+\.mjs$`** (`server.mjs:16` serves nothing else), so no digits: `draft-form.mjs`, not `form-13614c.mjs`. The forms are served by a new route (Task 8).
- **Catalogue rules come from `src/intake-catalogue.mjs`; sub-step and status logic from `src/intake-form.mjs`; card rules from `src/document-cards.mjs`.** Nothing re-implements them.
- **Status marks are an icon and a word, never colour alone:** "Done", "Needs answers", "Needs documents", or blank.
- **Redraw rules (earlier spec §2.4) are unchanged.** `input` never redraws; only `className`/`textContent` change in place: the question's note, the current sub-step's rail span `rail-sub-<id, "." as "-">-status`, its step's span `rail-step-<step id>-status`, a longtext's count.
- **No browser validation blocks Continue.** The renderer emits no `required`, `min`, `max` or `pattern`.
- **Card rows are never deleted** (realtime publishes inserts and updates only, `007_realtime_publication.sql:50`). "Not done" is an update to a null status.
- **No font files in the repo.** The Chinese font is fetched from a CDN, pinned to a version, and **what is fetched never depends on the text** (spec §7.3).
- **The draft PDF never leaves the browser.** No upload, no server call to build it.
- **Fictional data only** in tests, samples and screenshots. Never substitute or generate PCDC logos (`src/pcdc-logo.png` stays as is).
- **New wording goes to the group for review.** Use the spec's wording exactly; where the spec gives none, use the wording in this plan.
- **Test stack:** `vitally-task2` on port 54321. Start it with `docker start $(docker ps -aq --filter name=vitally-task2)`. Never run `npx supabase start` from the repo root. Shell PATH prefix for node, npm and docker: `PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`.
- **Commands:** `npm test` (unit), `npm run test:database` (needs `npm run db:migrate:test` first), `npm run test:browser`, `npm run build:intake`, `npm run build:vendor`.
- **Between Task 2 and Task 10 the old nine-step tests are in the way.** Task 2 changes the catalogue to ten steps, so unit tests that assume the nine-step layout (the v2 rail and step-9 tests in `tests/client-views.test.mjs`, step-index tests in `tests/intake-form.test.mjs` and `tests/controller.test.mjs`) can fail before their rewrite. The task that breaks one marks it `test.todo("<old name> — rewritten in Task <n>")` and lists it in its report; Tasks 5–7 replace every one, and Task 7 ends with no `todo` left (`grep -n "test.todo" tests/*.mjs` is empty). The browser suite's version-2 phase is rewritten in Task 10 and is not run before then.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Leave the untracked `VITA-Management-System-Demo/` directory at the repo root alone.

## Rulings made while planning

- **Three migrations, not two** (spec §9.2 updated to match): 015 loader, 016 generated catalogue, 017 documents and visits. Each task's migration is final when the task ends (digest guard), and the build numbers the generated migration after the highest existing one.
- **A sub-step with a lead line shows the lead, not its section's intro.** The Section 9 intro would otherwise say the same thing twice on `income.wages`. Section 9's intro is removed from both drafts.
- **The window state checks `formSubstep`'s shape only** (`^[a-z]+\.[a-z_]+$`); the controller resolves an id the catalogue doesn't know to the first sub-step (spec §3.1). Same outcome as the spec, without importing the catalogue into `window-state.mjs`.
- **The server cannot tell an answer-Needed card from a Maybe one** (the rules live in JavaScript). `SET_DOCUMENT_GROUP {group: "maybe"}` therefore clears a stored `group_override` and is refused when there is none. That is exactly "only a card staff moved up can move back down".
- **"Other documents" is optional** (spec A.5 updated): `cardsFor` gives it `group: "optional"`. It is always shown, has the upload buttons but no "I will send it later" / "I don't have this", and never counts toward a mark, 9.1's warnings or the progress page. As Needed it would read "Needs documents" until marked; as Maybe needed it would sit in the warnings, and it is neither.
- **The phone "All steps" disclosure, the rail's expanded steps and the Maybe-needed groups** are entries in `openPanels` (`rail-all`, `rail:<step id>`, `maybe:<sub-step id>`), so they survive redraws the way the confirmation tick does.

## File map

| File | Responsibility | Tasks |
|---|---|---|
| `docs/superpowers/notes/2026-10-04-draft-font-spike.md` | Spike findings and the chosen font source | 1 |
| `docs/intake-questions/intake-questions.md`, `…-senior-v2.md` | Question source: `member_id`, wording, tips, `gcf_sp_date` | 2 |
| `tools/build-intake-catalogue.mjs` | `STEPS` with ids and sub-steps, `Hidden id` type, `LOADER_VERSION = 2` | 2 |
| `src/intake-catalogue-data.mjs` | Generated catalogue | 2 |
| `supabase/migrations/015_intake_loader.sql` | Type `id`, `member_id` check, `intake_substeps`, loader | 2 |
| `supabase/migrations/016_intake_catalogue_<hash8>.sql` | Generated catalogue load | 2 |
| `src/intake-catalogue.mjs` | Sub-step lookups, `visibleAnswers`, `id` type checks | 2 |
| `src/sample-data.mjs` | `member_id` on every generated household member | 2 |
| `src/document-cards.mjs` (new) | Card rules (spec Appendix A) and `cardsFor` | 3 |
| `supabase/migrations/017_documents_and_visits.sql` | Visits, `case_document_cards`, two actions, rule list | 4 |
| `src/supabase-store.mjs`, `src/contracts.mjs` | `intakeVisited`, `documentCards`, the two actions | 4 |
| `src/intake-form.mjs` | Sub-step visibility, fallback, marks, member id in cards, carry-forwards | 5 |
| `src/window-state.mjs`, `src/controller.mjs` | `formSubstep`, `revealedAnswers`, visits, §3.8, card actions, return to summary, carry-forwards | 6 |
| `src/intake-views.mjs` (new), `src/client-views.mjs`, `src/styles.css` | Rail tree, sub-step page, Documents, Review, progress additions | 7 |
| `src/app.mjs`, `server.mjs` | Wiring; the forms route | 8 |
| `src/draft-form.mjs`, `src/draft-pdf.mjs` (new), `src/forms/*.pdf`, `tools/build.mjs`, `tools/vendor-pdf-entry.mjs` (new), `src/vendor/pdf-lib.mjs` (generated), `package.json` | Draft 13614-C | 9 |
| `tests/browser.mjs`, `tests/support/story-pages.mjs` | The version-2 browser phase | 10 |

The three forms are already committed in `src/forms/`:

| File | Revision | sha256 |
|---|---|---|
| `f13614c-2025.pdf` | Rev. 10-2025 (English) | `160507ac6daa8cc5e3126ad51ba5c2050c786337048f434f8336b48d92992c9d` |
| `f13614cn-2025.pdf` | Rev. 10-2025 (Simplified Chinese) | `a8c4909bf41a947cd7bcffdca4c106b8e5640fc4f24cc9bb4f29f018f121f5c2` |
| `f13614ct-2025.pdf` | Rev. 10-2025 (Traditional Chinese) | `f3eef75ca2683ab106281198b33c7ea0485f06dcadd9f16decfe4d790ac33487` |

---

### Task 1: Spike — the Chinese font for the draft

A throwaway investigation. Nothing it builds is kept except the notes file. Work in a scratch directory outside the repo (the session scratchpad).

**Files:** Create `docs/superpowers/notes/2026-10-04-draft-font-spike.md`.

**Interfaces:**
- Produces, in the notes file, a **Decision** section that Task 9 copies verbatim into `DRAFT_FONTS` in `src/draft-pdf.mjs`:
  ```js
  // One entry per Chinese form. `files` are fetched in full, in this order, whatever the text says.
  export const DRAFT_FONTS = {
    "zh-s": { files: [{ url: "https://cdn.jsdelivr.net/…", sha256: "…" }, …] },
    "zh-t": { files: [{ url: "https://cdn.jsdelivr.net/…", sha256: "…" }, …] },
  };
  export const CJK_DRAW = "runs"; // or "field": how Chinese text reaches the page
  ```
- Produces also, for offline tests, `DRAFT_FONT_FIXTURES`: for each file above, an npm package (installed by Task 9 as an exact-version devDependency) and the path inside `node_modules` of a **byte-identical** file (same sha256). Unit tests read those bytes; the browser test serves them for the CDN URLs with `page.route`. No test may reach the internet.

Background: in brainstorming, pdf-lib drew glyphs from `@fontsource/noto-sans-sc` pieces as dots, while a TrueType system font drew correctly in the same script. One AcroForm field appearance can use only one font.

- [ ] **Step 1: Set up.** In the scratch directory: `npm init -y && npm i pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1 @fontsource/noto-sans-sc@5.3.0 @fontsource/noto-sans-tc@5.3.0`. Copy `src/forms/f13614cn-2025.pdf` and `f13614ct-2025.pdf` in.
- [ ] **Step 2: Candidate A, fontsource pieces.** For one piece containing 林, try `embedFont` with each of: the `.woff`, the `.woff2`, `subset: true` and `subset: false`. Draw 林美 示例街100号 广东省 with `page.drawText`. Render page 1 with `sips -s format png <file>.pdf --out <file>.png` and look at the PNG. Record which combination, if any, draws real glyphs. Then measure the full set for one script: number of 400-weight pieces and total bytes.
- [ ] **Step 3: Candidate B, one file.** Try a single OFL Noto Sans SC (and TC) TrueType or OpenType file served by jsDelivr, pinned to a tag or commit, for example the `google/fonts` repository's `ofl/notosanssc/` or `notofonts/noto-cjk`'s `Sans/` files. Record the URL, its size, whether it is CFF or glyf, and whether pdf-lib draws it correctly (same text, same render check).
- [ ] **Step 4: Browser check.** For the best candidate, open a local page in Playwright Chromium that imports pdf-lib from an esbuild bundle, `fetch`es the font URL(s) (confirm jsDelivr answers with `access-control-allow-origin: *`), builds the PDF and returns its byte length. It must not throw.
- [ ] **Step 5: Field or runs.** Fill `page1[0].yourFirstName[0]` of the zh-s form with 美 through the field appearance (`updateFieldAppearances(font)`) and, separately, draw the same text at the widget's rectangle with `drawText`, then flatten. Pick `CJK_DRAW`: `"field"` only if one font file covers every character (candidate B) and the field route renders; otherwise `"runs"`.
- [ ] **Step 6: Write the notes file** with: each candidate's result (with the rendered PNGs described in words), sizes, the Decision block above with real URLs and sha256 of each file (`shasum -a 256`), `DRAFT_FONT_FIXTURES` (package, version, path, matching sha256), and the licence (SIL OFL 1.1). Which font each form uses: `en` and `zh-s` use the Simplified font, `zh-t` the Traditional one. The Decision must satisfy: every file fetched in full regardless of the text; total under 25 MB per script; renders correctly.
- [ ] **Step 7: Commit** the notes file only ("Draft 13614-C font spike: chosen source").

If no candidate renders correctly, stop and report BLOCKED with the evidence. Don't pick a source that draws wrong glyphs.

---

### Task 2: The catalogue — sub-steps, `member_id`, wording; migrations 015 and 016

**Files:**
- Modify: `docs/intake-questions/intake-questions.md`, `docs/intake-questions/intake-questions-senior-v2.md`, `tools/build-intake-catalogue.mjs`, `src/intake-catalogue.mjs`, `src/sample-data.mjs`
- Create: `supabase/migrations/015_intake_loader.sql`; generated `supabase/migrations/016_intake_catalogue_<hash8>.sql` and `src/intake-catalogue-data.mjs`
- Test: `tests/intake-build.test.mjs`, `tests/intake-catalogue.test.mjs`, `tests/sample-data.test.mjs`, `tests/support/intake-value-cases.mjs`, `tests/database-intake.mjs`

**Interfaces:**
- Produces in the catalogue: each step has `id` and `substeps: [{ id, kind, title, lead?, questions, cards? }]`:
  - `kind`: `"questions"`, `"documents"` or `"review"`;
  - `title` and `lead`: `{ general: { en, zh }, senior: { en, zh } }`;
  - `questions`: question ids in catalogue order ([] for documents and review);
  - `cards` (documents only): `"bring"`, `"identity"`, `"income"`, `"expenses"`, `"events"` or `"other"`.
- Produces in `src/intake-catalogue.mjs`:
  - `substepsFor(version)` → every sub-step in order, each `{ ...substep, step }` (`step` is its step object);
  - `findSubstep(id)` → that object or `null`;
  - `substepOfQuestion(questionId)` → the sub-step id holding a top-level question, or `null`;
  - `substepQuestions(substepId)` → the question objects, in the sub-step's order;
  - `visibleAnswers(version, answers)` → a copy of `answers` without the keys of hidden top-level questions (`isVisible` false);
  - `isMemberId(value)` → `/^[0-9a-f]{32}$/.test(value)`;
  - `checkValue` accepts type `id`; `checkGroup` requires a unique, well-formed `member_id` on every member.
- Produces in `src/sample-data.mjs`: every generated version-2 household member carries `member_id`.

- [ ] **Step 1: Failing tests.**
  - `tests/intake-catalogue.test.mjs`:
    - `stepsFor(2).map((s) => s.id)` is `["before","about","household","income","expenses","refund","optional","documents","notes","review"]`, and `n` is 1–10 in that order.
    - Every step has at least one sub-step. Every top-level question id appears in exactly one sub-step's `questions`, and every id there names a question.
    - `substepsFor(2).map((s) => s.id)` equals the list in Step 3's table, in order, with `documents.bring` first in `documents`.
    - `substepOfQuestion("inc_alimony") === "income.other"`, `substepOfQuestion("tp_phone") === "about.you"`, `substepOfQuestion("gcf_sp_date") === "refund.consent"`.
    - `substepQuestions("income.other").map((q) => q.id)` is `["inc_alimony","inc_gambling","inc_other","inc_other_desc"]`.
    - `visibleAnswers(2, { inc_sale_assets: "no", inc_sale_assets_prior_loss: "yes" })` has no `inc_sale_assets_prior_loss` key.
    - `gcf_sp_date` (from the 4c plan, now here): with `q = findQuestion(2, "gcf_sp_date")`, `isVisible(q, { gcf_consent: "yes", marital_status: "married", gcf_sp_signature: "Wei Lin" })` is true, and false when `gcf_consent` is `"no"`, when `marital_status` is `"never_married"`, or when `gcf_sp_signature` is absent.
    - `checkValue({ type: "id" }, "0123456789abcdef0123456789abcdef")` is null; `"XYZ"` and `"0123"` give `"Not a valid id."`.
    - With `hh = findQuestion(2, "hh")`: `checkValue(hh, [{ first_name: "A" }])` is `"Each person needs an id."`; two members with the same `member_id` give `"Two people share an id."`; one member `{ member_id: "<32 hex>", first_name: "A" }` is null.
    - `hh.fields[0].id === "member_id"` and `hh.fields[0].type === "id"` and `required` is false.
  - `tests/intake-build.test.mjs`:
    - Replace "the newest catalogue migration is 014…" (it hardcodes two migrations, a 4b carry-forward) with: 012 exists; the highest-numbered `NNN_intake_catalogue_<hash8>.sql` carries the current hash; no two catalogue migrations share a hash8.
    - `LOADER_VERSION` is 2, and the hash test's expected JSON uses `"loaderVersion":2`.
    - The parser maps `Hidden id` to `id`, and refuses `Hidden id` outside a group (`a hidden id belongs inside a group`).
    - `buildCatalogue` refuses a `STEPS` sub-step that names an unknown question, a question in two sub-steps, and a question in no sub-step (export `checkSubsteps(catalogue)` and test it directly).
  - `tests/support/intake-value-cases.mjs`: add `id` cases (valid 32 hex; invalid upper-case, 31 chars, non-string) and household cases (missing `member_id`, duplicate, valid). Both suites already read this file.
  - **Every existing household literal in the tests gains a `member_id`** (`grep -n "hh: *\[" tests/*.mjs tests/support/*.mjs` finds 26 today, in `intake-catalogue`, `client-views`, `intake-form` and `controller` tests and `database-intake.mjs`), including the valid household cases already in `intake-value-cases.mjs`. Without one, `checkValue` now calls the household invalid and `withholdInvalid` silently drops it from the save, so those tests would test the wrong thing.
  - `tests/sample-data.test.mjs`: every member of `makeSampleAnswers({ version: 2, seed })` for seeds 0–5 has an `isMemberId` id, unique within the answers, and the same seed gives the same ids.
  - `tests/database-intake.mjs`:
    - `sampleValue` gains `case "id": return crypto.randomUUID().replaceAll("-", "");`.
    - `select type from vitally_private.intake_fields where version=2 and field_id='hh.member_id'` is `id`, and `required_to_submit` is false.
    - `select id, step from vitally_private.intake_substeps where version=2 order by position` matches `substepsFor(2)` (ids in order, `step` = the step's `n`).
    - A version-2 `SAVE_ANSWERS` with `hh: [{ first_name: "A" }]` (no id) is refused `VT007`; with a malformed id refused; with two members sharing an id refused; with distinct ids accepted.
    - `intake_missing` on answers whose members have every required field never lists `member_id`.
- [ ] **Step 2: Run** `node --test tests/intake-catalogue.test.mjs tests/intake-build.test.mjs tests/sample-data.test.mjs`. Expected: FAIL on the new tests.
- [ ] **Step 3: Change the two question drafts** (the same structure in both; senior wording in the senior file):
  - Under Q6.G, before Q6.1, add the hidden sub-field:
    ```
    **Q6.0m** Person id / 成员编号
    `hh[i].member_id` · Hidden id · Optional
    > Note for developers: never shown. "Add a person" generates it (32 lowercase hex characters); the server refuses a member without one.
    ```
  - Remove Section 9's intro text (ruling above).
  - `gcf_sp_date`: `**Show if** \`gcf_consent = yes\` AND \`marital_status = married\` AND \`gcf_sp_signature\` is filled`. If the parser refuses `AND … is filled`, stop and report.
  - The upload convention bullet becomes: `- **Upload**: The Tip names the document and says "You will upload it in the Documents step / 您将在「上传文件」步骤上传". All uploads happen in one place.`
  - Every Tip that says "upload" (Q9.9 "Please also upload your brokerage statement", Q11.1 "Upload Form 1098-T and payment receipts", and any other `grep -n -i "upload" ` finds in a Tip) is reworded to name the document and end "You will upload it in the Documents step. / 您将在「上传文件」步骤上传。".
  - Add document Tips, using Appendix A's card labels and the same closing sentence, to Q9.4, Q9.7, Q9.10, Q9.11, Q9.12, Q9.15, Q10.2, Q10.3, Q10.4, Q10.7, Q10.8, Q11.2, Q11.3, Q11.5, Q11.8, Q11.9, Q11.11.
  - Q9.2's Tip: `All tips, including cash tips, are income. Some tips may be deductible starting in 2025. You will upload your tip records (your tip log, or the tip page of your app's tax summary) in the Documents step. / 所有小费（含现金小费）均需申报。自 2025 年起部分小费可能可以扣除。您将在「上传文件」步骤上传小费记录（自己记的小费账，或平台年度报税摘要中的小费页）。`
  - Q9.14's Tip gains: `If you drive or deliver with an app, also upload the app's yearly tax summary. / 如果您开网约车或送外卖，也请上传平台的年度报税摘要。`
  - Q11.12's wording becomes `Do you have last year's tax return? / 您有去年的报税表吗？`.
- [ ] **Step 4: The build tool.**
  - `TYPES` gains `"Hidden id": "id"`. A `Hidden id` line outside a group fails with `a hidden id belongs inside a group`.
  - `LOADER_VERSION = 2` (the loader changes in 015), with the comment updated.
  - Replace `STEPS` with steps that carry `id`, `n`, `title`, `sections` and `substeps`. Sub-steps with `kind: "questions"` list their question ids; `buildCatalogue` copies them through and calls `checkSubsteps`. Titles are `{ general: { en, zh }, senior: { en, zh } }`; use the same text for both variants (the group adjusts senior wording later). Exact content:

    | step id (n) · title EN / ZH | sections | sub-step id · title EN / ZH · questions |
    |---|---|---|
    | `before` (1) · Before you start / 开始之前 | 0 | `before.ready` · Before you start / 开始之前 · form_version — `before.service` · How you'd like help / 服务方式 · service — `before.language` · Language / 语言 · language, language_other |
    | `about` (2) · About you / 基本信息 | 1,2,3,4,5,8 | `about.you` · About you / 个人信息 · tp_first_name, tp_middle_name, tp_last_name, tp_dob, tp_job_title, tp_phone, email, best_contact_time, best_contact_note — `about.address` · Mailing address / 邮寄地址 · addr_street, addr_apt, addr_city, addr_state, addr_zip — `about.marital` · Marital status / 婚姻状况 · marital_status, married_last_day, lived_apart_last_6mo, divorce_date, separation_date, spouse_death_year — `about.spouse` · Your spouse / 配偶信息 · sp_first_name, sp_middle_name, sp_last_name, sp_dob, sp_job_title, sp_phone — `about.situation` · Your 2025 situation / 2025 年基本情况 · multi_state, claimed_by_other, us_citizen, on_visa, fulltime_student, legally_blind, disabled, ippin, digital_assets — `about.irs` · IRS letters and election fund / 国税局信件与选举基金 · irs_language_pref, irs_language, pecf |
    | `household` (3) · Household / 家庭成员 | 6 | `household.members` · Household members and dependents / 家庭成员及受抚养人 · has_household_members, hh |
    | `income` (4) · Income / 收入 | 9 | `income.wages` · Wages and tips / 工资与小费 · inc_wages, inc_wages_job_count, inc_tips — `income.retirement` · Retirement and government benefits / 退休金与政府福利 · inc_retirement, inc_disability, inc_social_security, inc_unemployment, inc_state_refund — `income.investments` · Investments and sales / 投资与出售 · inc_interest_div, inc_sale_assets, inc_sale_assets_prior_loss — `income.rental` · Rental income / 租金收入 · inc_rental_home, inc_rental_home_under15, inc_rental_property — `income.business` · Business and self-employment / 经营与自雇 · inc_self_employed, inc_self_employed_prior_loss — `income.other` · Other income / 其他收入 · inc_alimony, inc_gambling, inc_other, inc_other_desc |
    | `expenses` (5) · Expenses & life events / 支出与生活事项 | 10,11 | `expenses.deductible` · Deductible expenses / 可扣除支出 · exp_mortgage_interest, exp_taxes, exp_medical, exp_charity — `expenses.other` · Other expenses / 其他支出 · exp_student_loan, exp_dependent_care, exp_retirement_contrib, exp_educator, exp_alimony_paid — `expenses.events` · Things that happened in 2025 / 2025 年发生的事项 · evt_education, evt_sold_home, evt_hsa, evt_marketplace, evt_energy, evt_other, evt_other_desc, evt_debt_canceled, evt_disaster, evt_credit_disallowed, evt_irs_letter, evt_estimated_payments, evt_brought_prior_return |
    | `refund` (6) · Refund & permission / 退税与授权 | 7,14 | `refund.payment` · Refund or payment / 退税或补税 · refund_method, refund_method_other, payment_method — `refund.consent` · Sharing your return next year (Form 15080) / 明年共享报税信息（15080 表） · gcf_consent, gcf_tp_signature, gcf_tp_date, gcf_sp_signature, gcf_sp_date |
    | `optional` (7) · Optional questions / 选填问题 | 12 | `optional.questions` · Optional questions / 选填问题 · opt_english_speak, opt_english_read, opt_household_disability, opt_veteran, opt_race_tp, opt_race_sp |
    | `documents` (8) · Documents / 上传文件 | — | kind documents: `documents.bring` · Bring these to your visit / 请携带以下文件 (cards `bring`) — `documents.identity` · Identity / 身份文件 (identity) — `documents.income` · Income forms / 收入税表 (income) — `documents.expenses` · Expenses / 支出凭证 (expenses) — `documents.events` · Health and other events / 医保及其他 (events) — `documents.other` · Other documents / 其他文件 (other) |
    | `notes` (9) · Anything else / 补充说明 | 13 | `notes.anything` · Anything else / 补充说明 · additional_notes |
    | `review` (10) · Review & submit / 检查并提交 | — | kind review: `review.check` · Review your application / 检查您的申请 — `review.summary` · Your application summary / 申请摘要 — `review.submit` · Submit / 提交 |

  - Lead lines (`lead`, both variants the same): every `income.*` sub-step: `Did you or your spouse receive any of these in 2025? / 2025 年，您或配偶是否有以下收入？`. `expenses.deductible` and `expenses.other`: `Did you or your spouse pay for any of these in 2025? / 2025 年，您或配偶是否支付过以下费用？`. `expenses.events`: `Did any of these happen to you or your spouse in 2025? / 2025 年，您或配偶是否发生过以下事项？`.
  - Keep the existing check that every section belongs to a step. Steps `documents` and `review` have `sections: []`.
- [ ] **Step 5: Write `supabase/migrations/015_intake_loader.sql`** (header comment naming this plan's Task 2 and the spec §9.2; every statement re-appliable):
  ```sql
  -- 1. The hidden field type `id`, for hh.member_id.
  alter table vitally_private.intake_fields drop constraint if exists intake_fields_type_check;
  alter table vitally_private.intake_fields add constraint intake_fields_type_check check (type in ('text','longtext','signature','email','phone','zip','date','year',
   'number','choice','multi','who','yesno','group','id'));

  -- 2. The sub-steps, one row per catalogue sub-step, in order. Private like intake_fields.
  create table if not exists vitally_private.intake_substeps (
   version smallint not null check (version in (1, 2)),
   id text not null check (id ~ '^[a-z]+\.[a-z_]+$'),
   step smallint not null,
   position int not null,
   primary key (version, id)
  );
  revoke all on vitally_private.intake_substeps from public, anon, authenticated, service_role;
  ```
  Before writing it, confirm the constraint name with `select conname from pg_constraint where conrelid='vitally_private.intake_fields'::regclass and contype='c'` on the test stack, and use the real name.
  - `put_intake_field`: verbatim from 011, with `'id'` added to the type list and `or (v_type = 'id' and p_group is null)` added to the refusals.
  - `load_intake_catalogue`: verbatim from 011, plus: `delete from vitally_private.intake_substeps where version = p_version;` next to the field delete; for each step, if `v_step ? 'substeps'`, it must be an array (else VALIDATION), and each element an object whose `id` is a string; insert `(p_version, id, v_n, position)` with a running position across the whole catalogue (a duplicate id fails on the primary key, which is fine).
  - `check_intake_value`: verbatim from 011, plus:
    - before the `group` branch: `if p_field.type = 'id' then return jsonb_typeof(p_value) = 'string' and (p_value#>>'{}') ~ '^[0-9a-f]{32}$'; end if;`
    - inside the `group` branch, after the existing per-member checks: every member must have a `member_id` key that passes the `id` check, and the ids must be distinct: `if (select count(distinct m->>'member_id') from jsonb_array_elements(p_value) m) <> jsonb_array_length(p_value) or exists(select 1 from jsonb_array_elements(p_value) m where not (m ? 'member_id')) then return false; end if;`
  - End with the same `revoke all on all functions in schema vitally_private from public,anon,authenticated,service_role;` line 013 ends with.
- [ ] **Step 6: Catalogue module.** In `src/intake-catalogue.mjs`, add `substepsFor`, `findSubstep`, `substepOfQuestion`, `substepQuestions`, `visibleAnswers` and `isMemberId` as specified in Interfaces. In `checkValue`, add `case "id": return /^[0-9a-f]{32}$/.test(value) ? null : "Not a valid id.";`. In `checkGroup`, after the per-key loop: a member without `member_id` returns `"Each person needs an id."`, and a repeated id returns `"Two people share an id."`.
- [ ] **Step 7: Samples.** In `src/sample-data.mjs`, each generated member gets `member_id: memberIdFor(n, index)`, where
  ```js
  // 32 lowercase hex characters, fixed by the seed and the member's place, so
  // the same seed gives the same sample (fictional ids, unique within a case).
  const memberIdFor = (n, index) => ((n + 1) * 1000 + index + 1).toString(16).padStart(32, "0");
  ```
- [ ] **Step 8: Build and migrate.** Run `npm run build:intake`. Expected: it writes `src/intake-catalogue-data.mjs` and `supabase/migrations/016_intake_catalogue_<hash8>.sql`. Then `npm run db:migrate:test`.
- [ ] **Step 9: Run** `npm test` and `npm run test:database`. Expected: PASS (nine-step screen tests that now fail become `test.todo`s per the Global Constraints rule), including the 4b mirror tests (`intake_holds` against `isVisible`) and the drives-visibility walk (still only `gcf_sp_signature` as a text-like driver).
- [ ] **Step 10: Commit** ("Intake catalogue: steps 0–9 with sub-steps, hidden member_id, document tips; migrations 015 and 016").

---

### Task 3: The card rules — `src/document-cards.mjs`

**Files:** Create `src/document-cards.mjs`; Test `tests/document-cards.test.mjs`.

**Interfaces:**
- Consumes: `visibleAnswers`, `isMemberId` (Task 2).
- Produces:
  - `CARD_SUBSTEPS = ["identity","income","expenses","events","other"]`;
  - `CARD_RULES`: an array of rules `{ id, type, substep, label, why?, hint?, ask?, match }`, where `type` is `"person"`, `"shared"` or `"household"`, `label`/`why`/`hint` are `{ en, zh }`, `ask` is the question id the "why" line links to, and `match(answers)` returns `[{ owner, group }]` (owner `"tp"`, `"sp"`, `"hh.<member_id>"` or `"household"`; group `"needed"` or `"maybe"`);
  - `RULE_TYPES`: `Map(rule id → type)`, one entry per distinct id;
  - `SLOT_PATTERN = /^[a-z0-9_]+\.(tp|sp|household|hh\.[0-9a-f]{32})$/`;
  - `cardsFor(answers, cardState = [])` → cards, each `{ slotId, ruleId, owner, ownerLine: { en, zh }, group, baseGroup, status, substep, label, why, hint, ask }`, where `status` is `"not_done"`, `"later"` or `"none"`, `baseGroup` is the answers' group and `group` applies a stored `groupOverride: "needed"`. `group` is `"optional"` for the `other` card only (ruling above), and a stored state never changes it. Sorted by `CARD_SUBSTEPS`, then Needed before Maybe needed, then rule order, then owner (tp, sp, household members in list order, household).
  - `cardState` items: `{ slotId, status: "later" | "none" | null, groupOverride: "needed" | null }`.

Rules (spec §6.1 and Appendix A, which is the source of every label, trigger and note):
- `cardsFor` reads `visibleAnswers(2, answers)` only.
- The yes/not-sure rule: `yes` → needed, `not_sure` → maybe, anything else → no card, unless the row says otherwise. For Who questions: `me` → owner `tp`, `spouse` → owner `sp`, each needed.
- Rows sharing an id and an owner make one card, with Needed winning (`bank`, `prior_return`).
- Shared and household cards have owner `household`. `ownerLine`: person `tp` → the client's `tp_first_name tp_last_name`, or `{ en: "You", zh: "本人" }` when blank; `sp` → the spouse's name, or `{ en: "Your spouse", zh: "配偶" }`; `hh.<id>` → that member's name, or `Person <n>` / `成员 <n>`; shared → `{ en: "For you", zh: "本人" }`, or `{ en: "For you and your spouse", zh: "您和配偶" }` when `marital_status` is `married`; household → `{ en: "For your household", zh: "全家共用" }`.
- Household members' owners use `member_id`; a member without a valid one gets no person card.

Three rows written out in full, to fix the shape (every other row of Appendix A follows it):
```js
const yesOrUnsure = (field) => (a) =>
  a[field] === "yes" ? [{ owner: "household", group: "needed" }] : a[field] === "not_sure" ? [{ owner: "household", group: "maybe" }] : [];

export const CARD_RULES = Object.freeze([
  {
    id: "photo_id", type: "person", substep: "identity",
    label: { en: "Photo ID (driver's license, state ID, passport)", zh: "带照片的身份证件" },
    hint: { en: "Any document with your photo, name and birth date counts: a driver's license, state ID, passport, green card, EAD, Philadelphia city ID or Certificate of Naturalization.", zh: "任何带照片、姓名和出生日期的证件均可：驾照、州身份证、护照、绿卡、工卡（EAD）、费城市民卡或入籍证书。" },
    match: (a) => [{ owner: "tp", group: "needed" }, ...(a.marital_status === "married" ? [{ owner: "sp", group: "needed" }] : [])],
  },
  {
    id: "w2", type: "shared", substep: "income", ask: "inc_wages",
    label: { en: "W-2 from each job", zh: "每份工作的 W-2" },
    why: { en: "You said you had wages from a job", zh: "您说有工资收入" },
    match: yesOrUnsure("inc_wages"),
  },
  {
    id: "custody", type: "household", substep: "events", ask: "hh",
    label: { en: "Form 8332 or the custody pages of the court order, if you have them", zh: "8332 表或法院监护权文件（如有）" },
    why: { en: "You said a child lived with you for less than 6 months", zh: "您说有孩子与您同住不足 6 个月" },
    match: (a) =>
      a.marital_status !== "married" && Array.isArray(a.hh) && a.hh.some((m) => Number(m?.months_lived) < 6)
        ? [{ owner: "household", group: "maybe" }] : [],
  },
]);
```
The spouse photo-ID and SSN cards carry the hint `{ en: "Needed if you file together", zh: "如合并申报则需要" }` on the `sp` card only: give the card a `hint` per owner by letting `match` return `{ owner, group, hint }` where needed, and have `cardsFor` prefer the match's hint over the rule's. The `w2` card's hint is built from `inc_wages_job_count`: "You said 2 jobs. Upload 2 W-2s." / "您说有 2 份工作，请上传 2 张 W-2。", and none when the count is blank. `other_income` and `other_event` show the client's description (`inc_other_desc`, `evt_other_desc`) as their `why` text when it is filled: "You wrote: <text>" / "您填写的是：<text>".

- [ ] **Step 1: Failing tests** (`tests/document-cards.test.mjs`), each against `cardsFor`:
  - A never-married client with nothing answered gets exactly `photo_id.tp`, `ssn.tp` (identity) and `other.household` (other, group `optional`).
  - Married adds `photo_id.sp` and `ssn.sp`, each Needed with the "Needed if you file together" hint.
  - Two household members with ids give `ssn.hh.<id>` cards in Maybe needed, owner lines from their names, in list order. A member without an id gets none.
  - `inc_wages: "yes"` gives `w2.household` Needed; `"not_sure"` gives it Maybe needed; `"no"` none. With `inc_wages_job_count: "2"`, the hint reads "You said 2 jobs. Upload 2 W-2s."
  - Hidden answers don't count: `{ inc_sale_assets: "no", inc_sale_assets_prior_loss: "yes", evt_brought_prior_return: "no" }` gives no `prior_return` card; with `inc_state_refund: "yes"` and `evt_brought_prior_return: "no"`, `prior_return.household` is Maybe needed with the "If you can find it…" why text; with `evt_brought_prior_return: "yes"` it is Needed (one card).
  - `refund_method: "direct_deposit"` gives `bank.household` Needed; `payment_method: "bank_account"` alone gives it Maybe needed; both give one Needed card.
  - `ippin: ["me","spouse"]` (married) gives `ippin.tp` and `ippin.sp`, Needed. `on_visa: ["me"]` gives `visa.tp` Maybe needed. `digital_assets: ["me"]` gives `digital_assets.household` Maybe needed.
  - Custody: never married with a member `months_lived: "4"` gives `custody.household` Maybe needed; married gives none.
  - State: `[{ slotId: "w2.household", status: "later", groupOverride: null }]` makes the w2 card's status `later`. `{ slotId: "ssn.hh.<id>", status: null, groupOverride: "needed" }` makes that card Needed with `baseGroup` `maybe`. State for a card that isn't shown is ignored.
  - Owner lines: shared reads "For you", or "For you and your spouse" when married; household reads "For your household".
  - Ordering: identity cards first, Needed before Maybe needed within a sub-step.
  - Every slot id matches `SLOT_PATTERN`; every rule id is in `RULE_TYPES` with one type; `RULE_TYPES.size` is 46 (the distinct ids of Appendix A).
  - A test walks Appendix A: for each rule id listed there, a scenario answering its trigger `yes` (or the Who/computed form) produces a card of that id in the stated sub-step and group. Write the scenarios as a table in the test.
- [ ] **Step 2: Run** `node --test tests/document-cards.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the module: transcribe Appendix A row by row into `CARD_RULES` (ids, types and sub-steps exactly as the appendix gives them; A.2's "shared unless noted" and A.3/A.4's "household unless noted"), then `cardsFor` as specified.
- [ ] **Step 4: Run** the test file and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** ("Document card rules: answers to cards, with owners, groups and stored state").

---

### Task 4: Server — visits, `case_document_cards`, two actions; migration 017; the store

**Files:**
- Create: `supabase/migrations/017_documents_and_visits.sql`, `tests/database-redesign.mjs`
- Modify: `src/supabase-store.mjs`, `src/contracts.mjs`, `tests/store.test.mjs`, `tests/support/rpc-signatures.mjs` (only if it lists action types)

**Interfaces:**
- Consumes: `vitally_private.intake_substeps` (Task 2), `RULE_TYPES` (Task 3).
- Produces:
  - `SAVE_ANSWERS` payload `{ answers, visited? }` (`visited`: array of sub-step ids, at most 64);
  - `SET_DOCUMENT_CARD { slotId, status }` (`later`, `none`, `not_done`) and `SET_DOCUMENT_GROUP { slotId, group }` (`needed`, `maybe`);
  - the store's Case gains `intakeVisited: string[]` (from `cases.intake_visited`, `[]` when absent) and `documentCards: [{ slotId, status, groupOverride, changedAt }]` for both principals;
  - `CASE_ACTIONS` gains `"SET_DOCUMENT_CARD"` and `"SET_DOCUMENT_GROUP"`.

- [ ] **Step 1: Failing database tests** (`tests/database-redesign.mjs`, using `createDatabaseFixture`, `f.act`, the `v2Case`/`save` pattern of `tests/database-intake.mjs`; Sam is the admin with `receive_documents`, Alex has neither):
  - **Visits:**
    - `SAVE_ANSWERS { answers: {}, visited: ["before.ready","about.you"] }` stores them; a second save with `["about.address"]` leaves all three (union); a save without `visited` leaves them.
    - An unknown id (`"about.nowhere"`) is refused `VT007`, as is a non-array, a non-string element and 65 ids.
    - `visited` on a version-1 case is refused `VT007`.
    - A stored id no longer in `intake_substeps` is dropped on the next save that sends `visited` (insert a stale id with `update public.cases set intake_visited = intake_visited || '{gone.step}'` as the test superuser, then save).
  - **Cards:**
    - The client marks `w2.household` `later` on their draft: one row, status `later`, `changed_by_person_id` null; a `case_events` row with action `SET_DOCUMENT_CARD`; no `client_events` row.
    - `not_done` updates the status to null and the row stays (`count(*)` still 1).
    - Refused `VT007`: an unknown rule id (`nope.household`), an owner kind that doesn't fit (`w2.tp`, `photo_id.household`), a malformed slot, a bad status, extra payload keys, and either action on a version-1 case.
    - Staff: Sam may mark on an office draft (an owner-less version-2 case created as the presenter) and on the client's case after `SUBMIT`. Sam on the client's unsent draft is refused (`VT001` or `VT002`, whichever `lock_case` gives; assert that it is refused and nothing was written). Alex (no `admin`) is refused `VT001`.
    - `SET_DOCUMENT_GROUP`: Sam moves `ssn.hh.<id>` to `needed` (row with `group_override` `needed`), then to `maybe` (override null). `maybe` with no override stored is refused `VT007`. A client is refused `VT001`. Alex is refused `VT001`.
    - Both actions on a closed case are refused `VT004`.
    - Both actions bump the case revision.
    - Read policy: the client reads their own rows; another applicant reads none; the presenter reads none on a client's unsent draft and all of them after submit.
    - `case_document_cards` is in the `supabase_realtime` publication.
  - **Rules parity:** `select rule_id, card_type from vitally_private.document_card_rules() order by rule_id` equals `[...RULE_TYPES]` sorted.
  - **The existing table lists:** add `case_document_cards` to `CLIENT_VISIBLE_TABLES` in `tests/database.mjs`, to its seeded rows (an insert like `case_contacts`') and to its direct-write map (insert and update refused for every client), so the existing "clients can't write workflow tables" and visibility tests cover it.
- [ ] **Step 2: Failing store tests** (`tests/store.test.mjs`): `mapCase` maps `intake_visited` to `intakeVisited` (`[]` when the column is absent); `getCase` reads `case_document_cards` with columns `slot_id,status,group_override,changed_at` for both principals and maps them; `CLIENT_TABLES` contains `case_document_cards`. Update every exact table list in `tests/store.test.mjs` (lines near 21, 522, 612 and 907 today); `tests/database-store.mjs` compares the publication with `SUBSCRIBED_TABLES.presenter`, so the store change covers it.
- [ ] **Step 3: Run** `node --test tests/store.test.mjs` and `npm run test:database`. Expected: FAIL.
- [ ] **Step 4: Write `017_documents_and_visits.sql`** (header comment naming the spec §3.7, §6.3 and this task; every statement re-appliable):
  ```sql
  -- 1. Visits (spec §3.7).
  alter table public.cases add column if not exists intake_visited text[] not null default '{}'::text[];

  -- 2. Card state (spec §6.3). Rows are never deleted: "Not done" is a null status.
  create table if not exists public.case_document_cards (
   workspace_id uuid not null references public.workspaces(id) on delete cascade,
   case_id uuid not null,
   slot_id text not null check (slot_id ~ '^[a-z0-9_]+\.(tp|sp|household|hh\.[0-9a-f]{32})$'),
   status text check (status is null or status in ('later','none')),
   group_override text check (group_override is null or group_override = 'needed'),
   changed_by_person_id uuid,
   changed_at timestamptz not null default now(),
   primary key (case_id, slot_id),
   foreign key (workspace_id, case_id) references public.cases(workspace_id, id) on delete cascade,
   foreign key (workspace_id, changed_by_person_id) references public.people(workspace_id, id)
  );
  alter table public.case_document_cards enable row level security;
  ```
  - **Select policy:** `visible_case_document_cards`, the same `using(...)` expression as `visible_case_contacts` (`011_intake_v2.sql:379`) with `case_contacts` replaced. Revoke all from public, anon, authenticated; grant select to authenticated; grant select, insert, update, delete to service_role.
  - **Realtime:** add the table to `supabase_realtime` with 013's guarded `do $$ … $$` block.
  - **`vitally_private.document_card_rules()`:** `returns table(rule_id text, card_type text) language sql immutable security definer set search_path=''`, a `values` list of the 46 `(id, type)` pairs from `RULE_TYPES`. Comment that `tests/database-redesign.mjs` compares it with `src/document-cards.mjs`.
  - **`check_operation_authority`** (verbatim from 013, branches added before the assistance branch):
    ```sql
      when 'SET_DOCUMENT_CARD' then
       -- The client for themselves, or a staff person with admin.
       if p_person_id is null then
        if p_member.access<>'applicant' then raise sqlstate 'VT001' using message='FORBIDDEN'; end if;
       elsif not ('admin'=any(v_person.capabilities)) then
        raise sqlstate 'VT001' using message='FORBIDDEN';
       end if;
      when 'SET_DOCUMENT_GROUP' then
       if p_person_id is null or not ('receive_documents'=any(v_person.capabilities)) then
        raise sqlstate 'VT001' using message='FORBIDDEN';
       end if;
    ```
  - **`check_authority`** (verbatim from 013, branches added after `RECORD_MATERIALS`):
    ```sql
      when 'SET_DOCUMENT_CARD','SET_DOCUMENT_GROUP' then
       if p_person_id is null then
        if p_case.owner_user_id is distinct from p_member.user_id then raise sqlstate 'VT001' using message='FORBIDDEN'; end if;
       elsif p_case.owner_user_id is not null and p_case.stage='draft' then
        -- Never staff on a client's unsent draft.
        raise sqlstate 'VT001' using message='FORBIDDEN';
       end if;
    ```
  - **`check_payload`** (verbatim from 013): the `SAVE_ANSWERS` branch becomes
    ```sql
      when 'SAVE_ANSWERS' then
       if vitally_private.payload_keys(p_payload) not in (array['answers'], array['answers','visited'])
        or jsonb_typeof(p_payload->'answers')<>'object'
        or (p_payload ? 'visited' and (jsonb_typeof(p_payload->'visited')<>'array'
         or jsonb_array_length(p_payload->'visited')>64
         or exists(select 1 from jsonb_array_elements(p_payload->'visited') v
          where jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^[a-z]+\.[a-z_]+$'))) then
        raise sqlstate 'VT007' using message='VALIDATION';
       end if;
    ```
    and two branches are added before `CLOSE_CASE`:
    ```sql
      when 'SET_DOCUMENT_CARD' then
       if vitally_private.payload_keys(p_payload)<>array['slotId','status']
        or jsonb_typeof(p_payload->'slotId')<>'string'
        or (p_payload->>'slotId') !~ '^[a-z0-9_]+\.(tp|sp|household|hh\.[0-9a-f]{32})$'
        or coalesce(p_payload->>'status','') not in ('later','none','not_done') then
        raise sqlstate 'VT007' using message='VALIDATION';
       end if;
      when 'SET_DOCUMENT_GROUP' then
       if vitally_private.payload_keys(p_payload)<>array['group','slotId']
        or jsonb_typeof(p_payload->'slotId')<>'string'
        or (p_payload->>'slotId') !~ '^[a-z0-9_]+\.(tp|sp|household|hh\.[0-9a-f]{32})$'
        or coalesce(p_payload->>'group','') not in ('needed','maybe') then
        raise sqlstate 'VT007' using message='VALIDATION';
       end if;
    ```
    Check `payload_keys` sorts its result (004 defines it); the arrays above assume sorted keys.
  - **`check_related`** (verbatim from 011): in `SAVE_ANSWERS`, after the version-2 answer check, `if p_payload ? 'visited'`: refuse on a version-1 case, and refuse any id not in `intake_substeps` for the case's version. Add:
    ```sql
      when 'SET_DOCUMENT_CARD','SET_DOCUMENT_GROUP' then
       if p_case.intake_version<>2 or not exists(
        select 1 from vitally_private.document_card_rules() r
        where r.rule_id = split_part(p_payload->>'slotId','.',1)
         and case when r.card_type='person'
          then substr(p_payload->>'slotId', length(r.rule_id)+2) ~ '^(tp|sp|hh\.[0-9a-f]{32})$'
          else substr(p_payload->>'slotId', length(r.rule_id)+2) = 'household' end) then
        raise sqlstate 'VT007' using message='VALIDATION';
       end if;
    ```
  - **`act_save_answers`** (verbatim from 011), before its `return`:
    ```sql
     if p_payload ? 'visited' then
      -- The union of what was stored and what was sent, minus ids the catalogue no longer has (spec §3.7).
      update public.cases c set intake_visited = coalesce((
       select array_agg(distinct v order by v) from unnest(c.intake_visited || array(select jsonb_array_elements_text(p_payload->'visited'))) v
       where exists(select 1 from vitally_private.intake_substeps s where s.version = p_case.intake_version and s.id = v)), '{}'::text[])
      where c.id = p_case.id;
     end if;
    ```
  - **Handlers:**
    ```sql
    create or replace function vitally_private.act_set_document_card(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
    returns jsonb language plpgsql security definer set search_path='' as $$
    begin
     if p_case.stage='closed' then raise sqlstate 'VT004' using message='INVALID_TRANSITION'; end if;
     insert into public.case_document_cards as d (workspace_id, case_id, slot_id, status, changed_by_person_id, changed_at)
     values (p_case.workspace_id, p_case.id, p_payload->>'slotId',
      case when p_payload->>'status'='not_done' then null else p_payload->>'status' end, p_person.id, now())
     on conflict (case_id, slot_id) do update set status=excluded.status, changed_by_person_id=excluded.changed_by_person_id, changed_at=now();
     return jsonb_build_object('detail',jsonb_build_object('slotId',p_payload->>'slotId','status',p_payload->>'status'));
    end;
    $$;

    create or replace function vitally_private.act_set_document_group(p_member public.memberships,p_case public.cases,p_person public.people,p_payload jsonb)
    returns jsonb language plpgsql security definer set search_path='' as $$
    begin
     if p_case.stage='closed' then raise sqlstate 'VT004' using message='INVALID_TRANSITION'; end if;
     if p_payload->>'group'='maybe' then
      -- Only a card staff moved up can move back down.
      update public.case_document_cards set group_override=null, changed_by_person_id=p_person.id, changed_at=now()
      where case_id=p_case.id and slot_id=p_payload->>'slotId' and group_override is not null;
      if not found then raise sqlstate 'VT007' using message='VALIDATION'; end if;
     else
      insert into public.case_document_cards as d (workspace_id, case_id, slot_id, group_override, changed_by_person_id, changed_at)
      values (p_case.workspace_id, p_case.id, p_payload->>'slotId', 'needed', p_person.id, now())
      on conflict (case_id, slot_id) do update set group_override='needed', changed_by_person_id=excluded.changed_by_person_id, changed_at=now();
     end if;
     return jsonb_build_object('detail',jsonb_build_object('slotId',p_payload->>'slotId','group',p_payload->>'group'));
    end;
    $$;
    ```
  - **`vitally_apply_action`** (verbatim from 013), two dispatch lines after `RECORD_MATERIALS`:
    ```sql
      when 'SET_DOCUMENT_CARD' then v_outcome=vitally_private.act_set_document_card(v_member,v_case,v_person,p_payload);
      when 'SET_DOCUMENT_GROUP' then v_outcome=vitally_private.act_set_document_group(v_member,v_case,v_person,p_payload);
    ```
    followed by 013's same grant/revoke lines, and the final `revoke all on all functions in schema vitally_private …`.
- [ ] **Step 5: The store and contracts.** `mapCase` adds `intakeVisited: Array.isArray(row.intake_visited) ? [...row.intake_visited] : []`. Add `CLIENT_COLUMNS.case_document_cards = "slot_id,status,group_override,changed_at"`, `mapDocumentCard = (row) => ({ slotId: row.slot_id, status: row.status, groupOverride: row.group_override, changedAt: row.changed_at })`, the read in `getCase` (both principals, ordered by `slot_id`), `documentCards` on both mapped cases, and `case_document_cards` in `CLIENT_TABLES`. Add the two actions to `CASE_ACTIONS`. In `src/case-actions.mjs`, the comment "`SAVE_ANSWERS` is the one member of CASE_ACTIONS that is missing" becomes "`SAVE_ANSWERS`, `SET_DOCUMENT_CARD` and `SET_DOCUMENT_GROUP` are built by the controller, not by a form" (no builders are added; `PAYLOAD_ACTIONS` filters by builder).
- [ ] **Step 6: Run** `npm run db:migrate:test`, `npm test`, `npm run test:database`. Expected: PASS.
- [ ] **Step 7: Commit** ("Visits and document cards on the server: migration 017, two card actions, store fields").

---

### Task 5: Sub-step logic and the renderer — `src/intake-form.mjs`

**Files:** Modify `src/intake-form.mjs`; Test `tests/intake-form.test.mjs`.

**Interfaces:**
- Consumes: Task 2's lookups, Task 3's cards (each card has `substep`, `group`, `status`).
- Produces (all pure; `cards` is the output of `cardsFor`):
  - `visibleSubsteps(answers, cards)` → visible sub-step ids in catalogue order. A `questions` sub-step is visible when one of its questions `isVisible`. Documents: `documents.bring` only when `answers.service === "same_day"`; `documents.other` always unless same-day; the other four when not same-day and some card has their `substep`. Review: always.
  - `resolveSubstep(id, answers, cards)` → `id` when visible; when hidden, the next visible sub-step after it in catalogue order, or the last visible one; when the catalogue has no such id (or `id` is null), the first visible sub-step.
  - `adjacentSubstep(id, answers, cards, delta)` → the visible sub-step `delta` (+1 or -1) away from `resolveSubstep(id, …)`, or `null` at either end.
  - `substepStatus(id, { answers, visited, revealed, cards })` → `{ key, text }`: `"needs"`/"Needs answers", `"docs"`/"Needs documents", `"done"`/"Done" or `"none"`/"" per spec §3.3 (visited is an array or Set of sub-step ids; revealed a Set of answer ids). Review: `review.check` is Done when visited with no missing and no invalid answer; `review.summary` Done when visited; `review.submit` always `"none"`. `documents.bring`: Done when visited.
  - `stepRollup(stepId, ctx)` → `{ key, text }` over the step's visible sub-steps (needs > docs > done-if-all > none).
  - `invalidAnswers(substepId | null, answers)` and `visibleIds(substepId, answers)` and `needsRedraw(renderedIds, substepId, answers)`: today's functions, keyed by sub-step id instead of step index (`null` for invalidAnswers means every sub-step).
  - `firstUnfinishedSubstep(answers, cards, visited, revealed)` → the first visible sub-step whose status isn't Done (spec §3.1 resume), or `review.check` when all are.
  - `newMemberId(random = globalThis.crypto)` → 32 lowercase hex characters from `random.getRandomValues(new Uint8Array(16))`.
  - `stepStatus` (step-index version) stays exported until Task 8 removes its last caller; Task 8 deletes it.

- [ ] **Step 1: Failing tests** (`tests/intake-form.test.mjs`; replace the step-index tests of `stepStatus`, `invalidAnswers`, `visibleIds` and `needsRedraw` with sub-step versions):
  - `visibleSubsteps({}, cardsFor({}))` has no `about.spouse`, no `documents.bring`, and ends with the three review sub-steps; with `marital_status: "married"` it has `about.spouse`; with `service: "same_day"` the documents step is only `documents.bring`.
  - `resolveSubstep("about.spouse", { marital_status: "never_married" }, cards)` is `"about.situation"`; `resolveSubstep("documents.bring", {}, cards)` is `"documents.identity"`; `resolveSubstep("nowhere.at_all", …)` and `resolveSubstep(null, …)` are `"before.ready"`.
  - `adjacentSubstep("about.irs", {}, cards, 1)` is `"household.members"`; `adjacentSubstep("before.ready", {}, cards, -1)` is null.
  - Status: `before.ready` is blank unvisited and Done visited; `about.you` visited with `tp_first_name` missing is Needs answers; `documents.identity` visited with `photo_id.tp` Not done is Needs documents, and Done once that card's status is `later`; a revealed invalid email on `about.you` makes it Needs answers even unvisited (4b's rule kept).
  - `stepRollup("about", …)` is Needs answers when one sub-step needs answers; Done only when every visible sub-step is Done.
  - `firstUnfinishedSubstep` returns `before.ready` for an empty draft, and `about.address` when everything up to it is visited and complete.
  - **`member_id` in the household:** `renderQuestion(hh, [{ member_id: "<id>", first_name: "A" }])` renders `<input type="hidden" data-control data-q="hh" data-member="0" data-sub="member_id" value="<id>">` and no label or note for it; `valuesFromControls` reads it back; `sendable(hh, [{ member_id: "<id>" }])` is `[]` (a card holding only its id is empty); `sendable(hh, [{ member_id: "<id>", first_name: " A " }])` is `[{ member_id: "<id>", first_name: "A" }]`.
  - `newMemberId({ getRandomValues: (a) => a.fill(171) })` is `"ab".repeat(16)`.
  - **Carry-forwards (from the 4c plan's Task 2):** date descriptors `{ part: "month", value: "0-4" }`, `{ part: "day", value: "12" }`, `{ part: "year", value: "1961" }` read `"1961-04-12"` (each part stripped of non-digits before joining); rendering `"1961--12"` puts 1961 in the year box and 12 in the day box. With 10 members (no "Add a person"), the household `<fieldset>`'s `aria-describedby` contains `field-client-hh-note` and `field-client-hh-tips`, and the tips container has `id="field-client-hh-tips"`.
- [ ] **Step 2: Run** `node --test tests/intake-form.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `renderGroup` renders each member's `member_id` as the hidden input above and skips `type: "id"` fields in the visible list. `readOne` already handles a non-radio, non-checkbox descriptor by its value.
  - `sendable`'s household branch drops a member whose only answered key is `member_id`: `.filter((member) => !(isPlainObject(member) && Object.keys(member).every((key) => key === "member_id")))`.
  - The sub-step functions as specified. `invalidAnswers` iterates `substepQuestions(id)` for the given sub-step (or every `questions` sub-step for null).
  - Date parts: in `readOne`, `const part = (name) => String(list.find((d) => d.part === name)?.value ?? "").replace(/\D/g, "")`. In the date renderer, split a stored value into exactly three parts at the first two `-` (`/^([^-]*)-([^-]*)-(.*)$/`), never more.
  - Household references as in the test.
- [ ] **Step 4: Run** the file and `npm test`. Expected: PASS, apart from `test.todo`s marked under the Global Constraints rule.
- [ ] **Step 5: Commit** ("Intake form: sub-step visibility, fallback and marks; hidden member id; date parts and household references").

---

### Task 6: Window state and the controller

**Files:** Modify `src/window-state.mjs`, `src/controller.mjs`; Test `tests/window-state.test.mjs`, `tests/controller.test.mjs`.

**Interfaces:**
- Consumes: Tasks 2–5; the store's `intakeVisited` and `documentCards`.
- Produces (controller):
  - state: `formSubstep: string | null`, `visitedSubsteps: string[]`, `returnToSummary: boolean`; `revealed` as today; `visitedSteps` removed. `getState()` returns copies of the arrays.
  - `goToSubstep(id, { keepReturn = false } = {})`: reveals the left sub-step's invalid answers, adds it to `visitedSubsteps` (when it's a catalogue sub-step), saves a dirty draft, then sets `formSubstep = resolveSubstep(id, …)`. `returnToSummary` is cleared unless `keepReturn`.
  - `moveSubstep(delta)`: `goToSubstep(adjacentSubstep(current, …, delta))`, doing nothing at either end.
  - `openForChange(id)`: `returnToSummary = true`, then `goToSubstep(id, { keepReturn: true })`.
  - `backToSummary()`: `goToSubstep("review.summary")` (which clears the return).
  - `currentSubstep()`: `resolveSubstep(state.formSubstep, …)`, computed from the draft and `cardsFor(state.draftAnswers, state.savedCase?.documentCards ?? [])`.
  - `setDocumentCard(slotId, status)` and `setDocumentGroup(slotId, group)`: save first when `dirty` (a failed save stops here, leaving the error on screen), then dispatch the action through the same path as `runAction`.
- Produces (window state): `formSubstep` (a string matching `^[a-z]+\.[a-z_]+$`) and `revealedAnswers: { caseId, ids }` in `FIELDS`; `visitedSteps` removed from `FIELDS`.

Behaviour to build (spec §3.1, §3.7, §3.8, §5.2):
- **Opening a case** with no `formSubstep` (cleared by `clearSelection`) sets it to `firstUnfinishedSubstep(…)` once the case is loaded; a new case therefore opens at `before.ready`.
- **Visits.** `visitedSubsteps` starts as the case's `intakeVisited`. Every refresh merges the server's set in (union). Ids the catalogue doesn't know (`findSubstep` null) are dropped before sending. `dirty` is `sendableDiffers(…) || visitsPending()`, where `visitsPending()` is true when the draft has a known visited id the server's `intakeVisited` lacks. Version-2 `saveAnswers` sends `{ answers, visited }` when acting as the client and the known visited set is non-empty; as a presenter it never sends `visited`.
- **§3.8 in `applyCase`,** when `dirty` and a pin is set and `next.revision` is newer:
  - stage changed → as today (conflict);
  - `serverAnswersOf(current)` and `serverAnswersOf(next)` equal field by field by `sendable` value → move the pin to `next.revision`, take `next` as `savedCase`, merge visits, no conflict, draft untouched;
  - answers changed but `sendableDiffers(draft, serverAnswersOf(current))` is false (only visits unsaved) → take `next`, rebuild the draft with `keepLocalOnly`, merge visits, move the pin, no conflict;
  - otherwise → conflict, as today.
- **Carry-forwards:**
  - **Undo after a failed save** (today it shows Saved or Up to date): the failed save may have landed, so the server may hold the edit that was undone. `markUnsaved` remembers `"failed"`; when the remembered state is `"failed"`, an undo back to the last known server answers keeps `dirty` and the pin, and the chip returns to "Not saved". The retained envelope is dropped as stale (it holds the undone edit), so the next save sends the undone values.
  - `reconcileAnswers` sets `dirty` only when the chosen answers differ from the server's (`sendableDiffers`); otherwise `dirty` false, no pin, `saveState` back to what it was.
- **Every household member has an id.** `editAnswers` (version 2) gives `newMemberId()` to any member without a valid `member_id` before committing. Otherwise `checkGroup` would call the household invalid and `withholdInvalid` would drop it from every save without a word.
- **Removing a household member** keeps today's revealed renumbering; members are identified by position in revealed ids (`hh[n].sub`), and by `member_id` everywhere else.

- [ ] **Step 1: Failing window-state tests:** `formSubstep` round-trips; `"About.You"`, `5` and `"about"` are dropped; `revealedAnswers` round-trips and a malformed one is dropped whole; a stored `visitedSteps` is ignored (not returned).
- [ ] **Step 2: Failing controller tests** (`tests/controller.test.mjs`). Update `v2Store` so its `act` refuses a stale envelope like the server (`expectedRevision !== record.revision` throws `{ code: "CONFLICT" }`), handles `visited` (union into `intakeVisited`), `SET_DOCUMENT_CARD` and `SET_DOCUMENT_GROUP` (update `documentCards`), and bumps the revision for every action. Rewrite the step tests ("goToStep records the step being left…", "goToStep still moves when its save fails", "a second step change during the first one's save is ignored…", "a step change whose save outlives its case…", "another case starts with no visited steps…", "leaving a step reveals its invalid answers", "visited steps and the revealed list round-trip…") for sub-step ids, and add:
  - A new case opens at `before.ready`; a case whose `intakeVisited` covers `before.*` and `about.you` with those complete opens at `about.address`.
  - `goToSubstep("before.service")` from `before.ready` with nothing edited saves once, with `visited: ["before.ready"]` and unchanged answers (the visit makes the draft dirty).
  - Revisiting an already-visited sub-step with nothing edited sends nothing.
  - A visited id the catalogue doesn't know (planted in `intakeVisited`) is never sent.
  - §3.8: (a) typing on `about.you`, then a newer revision changing only `documentCards` arrives → no conflict, pin moved, typing kept, and the next save is accepted by the fake (expected revision = newest); (b) the same with a newer revision that changes `addr_city` → conflict; (c) only visits unsaved, and a newer revision changing `addr_city` → no conflict, the draft takes `addr_city`, visits kept and still sent; (d) a newer revision that changes the stage → as today.
  - `setDocumentCard("w2.household", "later")` while dirty sends `SAVE_ANSWERS` first, then `SET_DOCUMENT_CARD` with the newer revision; when that save fails, no card action is sent.
  - `openForChange("about.address")` sets `returnToSummary`; `backToSummary()` lands on `review.summary` and clears it; a `goToSubstep` from the rail clears it.
  - The two carry-forwards: an edit, a failed save (`offline()`), an undo → the chip reads "Not saved…", `dirty` is true, and the next save sends the undone value; reconciling to the server's own answers leaves the form not dirty.
  - `editAnswers({ hh: [{ first_name: "A" }] })` stores a member with an `isMemberId` id.
- [ ] **Step 3: Run** `node --test tests/window-state.test.mjs tests/controller.test.mjs`. Expected: FAIL.
- [ ] **Step 4: Implement** as specified. `goToStep` was only ever called for version 2 (version 1 uses `setFormStep`, which is unchanged), so `goToSubstep` replaces it and `STEP_COUNT` goes.
- [ ] **Step 5: Run** the files and `npm test`. Expected: PASS for these files.
- [ ] **Step 6: Commit** ("Controller: sub-steps, visits on the server, no conflict for answer-free revisions, card actions, return to summary").

---

### Task 7: The version-2 screens — `src/intake-views.mjs`

**Files:**
- Create: `src/intake-views.mjs`
- Modify: `src/client-views.mjs` (dispatch to the new module; drop the v2 rail, sections and still-to-answer code it replaces), `src/styles.css`
- Test: `tests/client-views.test.mjs`, `tests/shell.test.mjs`

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces:
  - `intakeFormV2(state, chrome)` — the draft form; `chrome` is `{ saveStatus, conflictForm, fictionalTools }` from `client-views.mjs` (passed in, so the new module imports nothing from `client-views.mjs`).
  - `submittedV2(state)` — the read-only answers after Submit, grouped by step and sub-step.
  - `progressDocumentsV2(state)` — the progress page's "Open documents" panel, or the same-day "Bring these to your visit" list.
- Markup contract (Task 8 and the browser test rely on it):
  - `<form id="intake-v2-form" novalidate data-substep="<id>">`.
  - Rail: `<nav class="rail-nav" aria-label="Form steps"><ol class="rail-tree">`; per step `<li class="rail-step" data-step-id="<id>">` holding a toggle `<button type="button" class="rail-toggle" data-action="toggle-rail-step" data-step-id="<id>" aria-expanded="true|false" aria-controls="rail-subs-<id>">` (an icon and `<span class="sr-only">Show or hide the parts of <step title></span>`), the step link `<button type="button" class="rail-link" data-action="go-substep" data-substep="<first sub-step not Done>">`, its number (none for `before`), title and `<span id="rail-step-<id>-status" class="rail-status is-<key>">`, then `<ol id="rail-subs-<id>" class="rail-subs"${expanded ? "" : " hidden"}>` with one `<li>` per visible sub-step: `<button type="button" class="rail-sublink" data-action="go-substep" data-substep="<id>"${current ? ' aria-current="step"' : ""}>` holding the title, "You are here" (`<small class="rail-here">`) when current, and `<span id="rail-sub-<id with . as ->-status" class="rail-status is-<key>">`. A step is expanded when it is the current step or `openPanels` has `rail:<id>`.
  - Under the tree: `<progress class="rail-bar" max="<visible count>" value="<position>">` and "Part <position> of <visible count>".
  - Phone bar (shown by CSS at ≤800px): `<div class="rail-phone"><span>About you · 2 of 5</span><button type="button" class="btn secondary" data-action="toggle-panel" data-panel="rail-all" aria-expanded="…" aria-controls="rail-tree">All steps</button></div>`; the tree carries `id="rail-tree"` and the class `is-open` when `openPanels` has `rail-all`.
  - Header: `<span class="overline">STEP 1 OF 9 · ABOUT YOU</span>` (`BEFORE YOU START` for `before`), `<h1>` the sub-step title, `<p class="substep-count">2 of 5</p>` (position within the step's visible sub-steps).
  - Questions: the sub-step's visible questions in its order, grouped into cards by `heading` as `sectionV2` does today. The lead line (`<p class="q-lead">`) when the sub-step has one; otherwise the intro of the section that the first question belongs to, only on the first sub-step holding that section's questions. On `before.ready`, after the S0 intro: `<p class="q-intro-extra">You will upload them in the Documents step.</p>`, or for same-day `You will get a list of what to bring.`; Q0.1 gets the tip line `You can change back any time with the Senior version switch at the top. Your answers are kept.`. On `notes.anything`, Q13.1 gets the hint `For example, a form you haven't received yet.`.
  - Actions: Back (`back-step`) except on the first visible sub-step; Continue (`type="submit"`) except on `review.submit`; when `returnToSummary`, Continue is replaced by `<button type="button" class="btn primary" data-action="back-to-summary">Back to summary</button>`.
  - Documents sub-step: Needed cards, then `<button type="button" class="doc-maybe-toggle" data-action="toggle-panel" data-panel="maybe:<sub-step id>" aria-expanded="…">Maybe needed (<n>)</button>` and the Maybe needed cards when open. Each card `<article class="doc-card" id="doc-<slot with . as ->" data-slot="<slot>">`: `<h3>` label; `<p class="doc-owner">` owner line; the why line as `<button type="button" class="inline" data-action="go-substep" data-substep="<substepOfQuestion(ask)>">` (no link when there is no `ask`); the hint; two disabled buttons "Take a photo" and "Choose a file" with `aria-describedby` the note `<p class="doc-note">Uploading arrives soon. For now, bring it or mark it below.</p>`; `<button type="button" data-action="mark-card" data-slot data-status="later">I will send it later</button>`, `… data-status="none">I don't have this</button>`, and when the status isn't Not done, `… data-status="not_done">Mark as not done</button>`; status `<p class="doc-status is-<status>">` with an icon and "Not done", "Later" or "Don't have". Same-day `documents.bring`: a printable `<ul class="bring-list">` of the cards (Needed, then Maybe needed), with no buttons and no statuses.
  - `review.check`: Text 1 and Text 2 (spec §5.1) as `<p>`s; `<section class="alerts-panel" aria-labelledby="alerts-title"><h2 id="alerts-title" tabindex="-1">Alerts and warnings</h2>`; alerts `<div class="alerts-block">` "Fix before you submit" grouped by step, each item `<button type="button" class="alert-item is-missing|is-invalid" data-action="go-substep" data-substep="<id>">` with the question label and "Needs an answer" or "Needs a change"; warnings `<div class="warnings-block">` "You can still submit" listing Needed cards Not done or Later, each with `<button … data-action="go-substep" data-substep="documents.<substep>" data-focus="doc-<slot with . as ->">Upload now</button>`, and one line "<n> more documents may be needed" linking to the first documents sub-step when Maybe needed cards are open. Empty: `<p class="alerts-empty">We found no alerts or warnings in your application.</p>`. No document warnings for same-day.
  - `review.summary`: `<div class="summary-print">` with the Application ID and today's date, then per step `<section class="summary-step"><h2>`, per sub-step `<div class="summary-sub"><h3>…</h3><button type="button" class="inline" data-action="change-substep" data-substep="<id>">Change</button>` and its answered visible questions as `detail-row`s through `formatAnswer`; then the cards and their status (or the bring list); then `<div class="summary-tools">` with `print-summary` "Print", `view-draft` `data-form="en"` "View Draft 13614-C", and `view-draft` `data-form="zh-s"` "简体中文版" and `data-form="zh-t"` "繁體中文版", and `<p id="draft-ready" class="draft-ready" aria-live="polite"></p>`.
  - `review.submit`: 4b's confirmation (`#field-confirmed`, "I have checked my answers") and Submit (`data-case-action="SUBMIT"`), disabled until there are no alerts and the box is ticked.
  - Progress page: `progressDocumentsV2` renders "Open documents" with the Needed cards Not done or Later and the same mark buttons, or the same-day list; `progressScreen` includes it for version-2 cases after the status panel.
- [ ] **Step 1: Failing tests** (`tests/client-views.test.mjs`; replace the nine-step rail and step-9 tests): rail tree markup per the contract (current step expanded, others collapsed with `hidden`, `aria-expanded` matches, status spans' ids and texts); header and count; lead line on `income.wages` and no Section 9 intro anywhere; S0 extra line for same-day and not; Back absent on `before.ready`, Continue absent on `review.submit`, Back to summary when `returnToSummary`; a documents sub-step with a Needed and a Maybe card, the Maybe toggle, statuses and buttons (upload buttons disabled with the note); same-day bring list without buttons; `review.check` alerts and warnings grouping and the empty sentence; the summary's Change links, cards and tools; Submit disabled rules; progress page open documents; and the version-1 screens unchanged (existing tests).
- [ ] **Step 2: Failing CSS test** (`tests/shell.test.mjs`): a `/* Part 4b2: intake redesign */ … /* end part 4b2 */` block exists after 4b's; it styles `.rail-status.is-needs`, `.is-docs` and `.is-done` with a `::before` that sets `content` (an icon glyph or mask), so marks differ by shape; it contains `@media print` with `body.print-summary` rules.
- [ ] **Step 3: Run** `node --test tests/client-views.test.mjs tests/shell.test.mjs`. Expected: FAIL.
- [ ] **Step 4: Implement** the module and styles. Print rules, inside the new block:
  ```css
  @media print {
    body.print-summary #app > * { display: block; }
    body.print-summary * { visibility: hidden; }
    body.print-summary .summary-print, body.print-summary .summary-print * { visibility: visible; }
    body.print-summary .summary-print { position: absolute; inset: 0 auto auto 0; width: 100%; }
    body.print-summary .summary-tools { display: none; }
  }
  ```
  Phone width (≤800px): the rail tree is hidden unless `.is-open`, and `.rail-phone` shows. Use the existing tokens; keep the PCDC logo untouched.
- [ ] **Step 5: Run** the files and `npm test`. Expected: PASS.
- [ ] **Step 6: Commit** ("Intake screens: rail tree, sub-step pages, Documents, Review and submit, progress documents").

---

### Task 8: Wiring — `src/app.mjs` and the forms route

**Files:** Modify `src/app.mjs`, `server.mjs`; Test `tests/server.test.mjs`, `tests/shell.test.mjs` (if it pins app actions).

**Interfaces:**
- Consumes: Tasks 5–7.
- Produces: data-action handlers `go-substep`, `toggle-rail-step`, `back-step` (version 2: `moveSubstep(-1)`), Continue (`moveSubstep(1)`), `change-substep`, `back-to-summary`, `mark-card`, `print-summary`, `view-draft` (wired to Task 9's function; until Task 9 lands, it notifies "The draft is not available yet."), and `add-member` with a `member_id`.

- [ ] **Step 1: Failing server tests:** `/src/forms/f13614c-2025.pdf`, `/src/forms/f13614cn-2025.pdf` and `/src/forms/f13614ct-2025.pdf` answer 200 with `application/pdf`; `/src/forms/other.pdf`, `/src/forms/../server.mjs` and `/src/forms/f13614c-2026.pdf` answer 404.
- [ ] **Step 2: Run** `node --test tests/server.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `server.mjs`: `const FORMS = /^\/src\/forms\/f13614c[nt]?-2025\.pdf$/;` served with `".pdf": "application/pdf"`, after the same path checks as `ASSET`.
  - `app.mjs`:
    - Place key: for a version-2 case use `formSubstep` (resolved through `controller.currentSubstep()`), so scroll and focus restore compare sub-steps.
    - `V2_CONTROLS` and `v2Answer` unchanged. `paintV2Note`'s `showMissing` becomes `visitedSubsteps.includes(currentSubstep)`. `paintV2Rail` paints `rail-sub-<id>-status` with `substepStatus` and `rail-step-<step id>-status` with `stepRollup`, using `cardsFor(draft, savedCase.documentCards)`.
    - The `#intake-v2-form` submit handler: `sweepV2Form(); await controller.moveSubstep(1);` then focus `#main`.
    - `go-substep`: `sweepV2Form(); await controller.goToSubstep(target.dataset.substep);` focus `#main`. `change-substep`: `controller.openForChange(…)`. `back-to-summary`: `sweepV2Form(); controller.backToSummary()`.
    - **A generic `toggle-panel` handler** (none exists today): `controller.togglePanel(target.dataset.panel)` for names matching `^(rail-all|rail:[a-z]+|maybe:[a-z]+\.[a-z_]+)$` only; anything else is ignored. Focus goes back to the same control afterwards (found by `data-panel`).
    - After any `go-substep` with `data-focus`, focus that element (it is a card on the new page) instead of `#main`.
    - **The Submit guard** (`app.mjs` near line 740, which reveals invalid answers and focuses `#still-title`): when it refuses, it now goes to `review.check` (`controller.goToSubstep("review.check")`) and focuses `#alerts-title`. Delete the `#still-title` code.
    - `toggle-rail-step`: `controller.togglePanel("rail:" + target.dataset.stepId)`, keeping focus on the toggle (look it up by `data-step-id` after the redraw).
    - `mark-card`: `sweepV2Form(); await controller.setDocumentCard(target.dataset.slot, target.dataset.status)`; afterwards focus the same card's status (`#doc-<slot>`'s first button).
    - `add-member`: `controller.editAnswers({ hh: [...members, { member_id: newMemberId() }] })`.
    - `print-summary`: `document.body.classList.add("print-summary"); window.print();` and remove the class on `afterprint` (registered once).
    - `review.check` arrival: when the alerts panel is on the page after a sub-step change to `review.check`, focus `#alerts-title`.
- [ ] **Step 4: Remove** `stepStatus` (step-index version) from `src/intake-form.mjs` now that nothing imports it (`grep -rn "stepStatus" src tests` finds only `substepStatus`).
- [ ] **Step 5: Run** `npm test`. Expected: PASS.
- [ ] **Step 6: Commit** ("Wiring: sub-step navigation, rail toggles, card marks, summary print, forms route").

---

### Task 9: The draft 13614-C

**Files:**
- Create: `src/draft-form.mjs`, `src/draft-pdf.mjs`, `tools/vendor-pdf-entry.mjs`, generated `src/vendor/pdf-lib.mjs`
- Modify: `tools/build.mjs`, `package.json`, `package-lock.json`, `src/app.mjs` (the `view-draft` handler)
- Test: `tests/draft-form.test.mjs`, `tests/draft-pdf.test.mjs`, `tests/server.test.mjs` (vendor bundle served)

**Interfaces:**
- Consumes: Task 1's Decision (`DRAFT_FONTS`, `CJK_DRAW`); Task 2's catalogue (`wording`, `findQuestion`, `formatAnswer`'s date and phone helpers).
- Produces:
  - `draft-form.mjs` (pure): `FORM_FILES = { en: "src/forms/f13614c-2025.pdf", "zh-s": "src/forms/f13614cn-2025.pdf", "zh-t": "src/forms/f13614ct-2025.pdf" }`; `FORM_SHA256` (the three sums above); `draftFields(answers, { form, reference, today })` → `{ text: { [field]: string }, checks: string[], comments: string, consentPage: boolean }`.
  - `draft-pdf.mjs`: `DRAFT_FONTS`, `CJK_DRAW` (from Task 1), `hasCjk(text)`, `async buildDraftPdf({ PDFLib, fontkit, formBytes, fontFiles, fields, stamp, flatten = true })` → `Uint8Array`.
  - `src/vendor/pdf-lib.mjs`: `export { PDFDocument, StandardFonts, rgb } from "pdf-lib"; export { default as fontkit } from "@pdf-lib/fontkit";`, bundled like the Supabase bundle with its own banner.

**The field map** (prefix every name with `form1[0].`; booleans tick; `—` means no box). Dates print as `MM/DD/YYYY`; phones as `(215) 555-0199`; middle names as their first letter.

| Answer | Box(es) |
|---|---|
| tp_first_name, tp_middle_name, tp_last_name, tp_dob, tp_job_title | `page1[0].yourFirstName[0]`, `yourMiddleInitial[0]`, `yourLastName[0]`, `yourDateOfBirth[0]`, `yourJobTitle[0]` |
| sp_first_name … sp_job_title | `page1[0].spousesFirstName[0]`, `spousesMiddleInitial[0]`, `spousesLastName[0]`, `spousesDateOfBirth[0]`, `spousesJobTitle[0]` |
| addr_street, addr_apt, addr_city, addr_state, addr_zip | `page1[0].mailingAddress[0]`, `maillingApartmentNumber[0]`, `mailingCity[0]`, `mailingState[0]`, `mailingZIPCode[0]` |
| tp_phone, sp_phone, email | `page1[0].yourTelephoneNumber[0]`, `spousesTelephoneNumber[0]`, `yourEmailAddress[0]` |
| multi_state yes/no | `page1[0].liveWorkStates[0].liveWorkYes[0]` / `liveWorkNo[0]` |
| claimed_by_other yes/no | `page1[0].anyoneElseClaim[0].otherClaimYes[0]` / `otherClaimNo[0]` |
| us_citizen, on_visa, fulltime_student (Who: me, spouse, none) | `page1[0].youSpouseWereIn[0].column1[0].` + `usCitizen[0].usCitizen{You,Spouse,No}[0]`, `usOnVisa[0].onVisa{You,Spouse,No}[0]`, `fullTimeStudent[0].student{You,Spouse,No}[0]` |
| legally_blind, disabled, ippin, digital_assets (Who) | `page1[0].youSpouseWereIn[0].column2[0].` + `legallyBlind[0].legallyBlind{…}[0]`, `totallyPermanentlyDisabled[0].disabled{…}[0]`, `issuedIdentityProtection[0].identityProtection{…}[0]`, `holdDigitalAssets[0].digitalAssets{…}[0]` |
| refund_method direct_deposit, check, split, other; refund_method_other | `page1[0].dueARefund[0].refundDirectDeposit[0]`, `refundCheckMail[0]`, `refundSplitAccounts[0]`, `refundOther[0]`; `refundOtherExplain[0]` |
| payment_method bank_account, direct_pay, installment, mail | `page1[0].haveBlanceDue[0].blanceBankAccount[0]`, `blanceDirectPay[0]`, `blanceInstallmentAgreement[0]`, `blanceMailPayment[0]` |
| irs_language_pref (Who); irs_language | `page1[0].writtenCommunicationLanguage[0].otherLanguage{You,Spouse,No}[0]`; `whatLanguage[0]` |
| pecf (Who) | `page1[0].presidentialElectionFund[0].presidentialElectionFund{You,Spouse,No}[0]` |
| marital_status never_married, married, divorced, separated, widowed | `page1[0].maritalStatus[0].statusNeverMarried[0]`, `statusMarried[0]`, `statusDivorced[0].statusDivorced[0]`, `statusLegallySeparated[0].statusLegallySeparated[0]`, `statusWidowed[0].statusWidowed[0]` |
| divorce_date, separation_date, spouse_death_year | `page1[0].maritalStatus[0].statusDivorced[0].dateFinalDecree[0]`, `statusLegallySeparated[0].dateSeparateDecree[0]`, `statusWidowed[0].yearSpousesDeath[0]` |
| married_last_day yes/no | en `page1[0].maritalStatus[0].lastDay[0].lastDay{Yes,No}[0]`; zh `…maritalStatus[0].marriedForAll[0].forAll{Yes,No}[0]` |
| lived_apart_last_6mo yes/no | en `…maritalStatus[0].liveApart[0].liveApart{Yes,No}[0]`; zh `…maritalStatus[0].liveWithSpouse[0].liveWith{Yes,No}[0]` |
| hh members 1–4 | `page1[0].namesOf[0].Row<k>[0].` + `nameFirstLast[0]` ("First Last"), `dateOfBirth[0]`, `relationshipToYou[0]` (the option's English label), `monthsLivedHome[0]`, `singleMarried[0]` ("S"/"M"), `usCitizen[0]`, `residentUSCandaMexico[0]`, `fullTimeStudent[0]`, `totallyPermanentlyDisabled[0]`, `issuedIPPIN[0]` ("Y"/"N"; not_sure blank) |
| income yes (single boxes) | `page2[0].receivedMoneyFrom[0].` + inc_wages `wagesPartFull[0]` (+ inc_wages_job_count `howManyJobs[0]`), inc_tips `receivedMoneyTimps[0]`, inc_retirement `retirementAccount[0]`, inc_disability `disabilityBenefits[0].disabilityBenefits[0]`, inc_social_security `socialSecurityRailroad[0]`, inc_unemployment `unemploymentBenefits[0]`, inc_state_refund `refundStateLocal[0]`, inc_interest_div `interestOrDividends[0]`, inc_sale_assets `saleStocksBonds[0]`, inc_alimony `receivedAlimony[0]`, inc_rental_home en `incomeRentingHouse[0]` / zh `incomeRentingHouse[0].incomeRentingHouse[0]`, inc_rental_property `incomeRentingVehicle[0]`, inc_gambling `gamblingLotteryWinnings[0]`, inc_self_employed `paymentsContractSelf[0]`, inc_other `otherMoneyReceived[0].otherMoneyReceived[0]` |
| inc_sale_assets_prior_loss, inc_rental_home_under15, inc_self_employed_prior_loss yes/no | `page2[0].receivedMoneyFrom[0].reportALoss[0].reportLoss{Yes,No}[0]`, `useAsPersonal[0].personalResidence{Yes,No}[0]`, `lossLastReturn[0].reportLoss{Yes,No}[0]` |
| expenses yes | `page3[0].paidFollowingExpenses[0].` + exp_mortgage_interest `mortgageinterest[0]`, exp_taxes `taxesStateLocal[0]`, exp_medical `mendicalDentalPrescription[0]`, exp_charity `charitableContributions[0]`; `page3[0].paidExpenses[0].` + exp_student_loan `studentLoanInterest[0]`, exp_dependent_care `childDependentCare[0]`, exp_retirement_contrib `contributionsRetirementAccount[0]`, exp_educator `schooldSupplies[0]`, exp_alimony_paid `alimonyPayments[0]` |
| events yes | `page3[0].followingHappenDuring[0].` + evt_education `tookEducationalClasses[0].tookEducationalClasses[0]`, evt_sold_home `sellAHome[0]`, evt_hsa `healthSavingsAccount[0]`, evt_marketplace `purchaseMarketplaceInsurance[0]`, evt_energy `energyEfficientItems[0].energyEfficientItems[0]`, evt_other `otherPurchase[0]`, evt_debt_canceled `forgaveByLender[0].forgaveByLender[0]`, evt_disaster `lossRelatedDisaster[0]`, evt_credit_disallowed `taxCreditDisallowed[0].taxCreditDisallowed[0]`, evt_irs_letter `receivedLetterBill[0]`, evt_estimated_payments `estimatedTaxPayments[0].estimatedTaxPayments[0]`, evt_brought_prior_return `lastYearsReturn[0]` |
| opt_english_speak, opt_english_read (very_well, well, not_well, not_at_all, prefer_not_to_answer) | `page4[0].optionalQuestions[0].carryConversationEnglish[0].` / `readNewspaperEnglish[0].` + `veryWell[0]`, `well[0]`, `notWell[0]`, `notAtAll[0]`, `notAnswer[0]` |
| opt_household_disability, opt_veteran (yes, no, prefer_not_to_answer) | `page4[0].optionalQuestions[0].memberHouseholdDisability[0].disability{Yes,No}[0]` / `notAnswer[0]`; `youSpouseVeteran[0].veteran{Yes,No}[0]` / `notAnswer[0]` |
| opt_race_tp, opt_race_sp (multi) | `page4[0].yourRaceEthnicity[0].` / `yourSpousesRaceEthnicity[0].` + american_indian_alaska_native `americanIndian[0]`, asian `asian[0]`, black_african_american `blackAfricanAmerican[0]`, hispanic_latino `hispanicLatino[0]`, middle_eastern_north_african `middleEsternNorthAfrican[0]`, native_hawaiian_pacific_islander `hawaiianPacific[0]`, white `white[0]`; prefer_not_to_answer — |
| Additional Comments | `page5[0].AdditionalComments[0].AdditionalNotesComments[0]` |
| gcf_consent = yes: gcf_tp_signature, gcf_tp_date, gcf_sp_signature, gcf_sp_date | `page6[0].primaryTaxpayer[0]`, `primaryDateSigned[0]`, `secondaryTaxpayer[0]`, `secondaryDateSigned[0]` |
| form_version, service, language, language_other, best_contact_time, best_contact_note, has_household_members | — (no box) |

The two zh-only marital names are the same questions in the same place: before relying on them, compare each widget's rectangle (`field.acroField.getWidgets()[0].getRectangle()`) with the English widget's; equal `y` (±2) confirms the mapping. Every box on pages 2–3 outside `receivedMoneyFrom`, `paidFollowingExpenses`, `paidExpenses` and `followingHappenDuring`, and the household rows' last five columns, are volunteer-only and stay blank.

**Additional Comments**, in this order, separated by a blank line: Q13.1's text; `Not sure: <labels>` (the English wording of every visible not_sure answer, household ones as `Person <n> <sub-field wording>`, joined with ", "); `Other income: <inc_other_desc>`; `Other event: <evt_other_desc>`; one line per household member 5–10 in the spec's format (name · relationship · born · months · single or married · citizen · resident · student · disabled · IP PIN).

- [ ] **Step 1: Failing tests.**
  - `tests/draft-form.test.mjs` (pure): a fictional married client maps to the expected `text` and `checks` for a representative of each table row; Who answers tick the right You/Spouse/No boxes; a not_sure income item ticks nothing and appears in `Not sure:`; six household members fill rows 1–4 and put members 5–6 in comments; hidden answers are ignored (`visibleAnswers`); `consentPage` is true only for `gcf_consent = "yes"`; zh forms use the zh marital names and the zh `incomeRentingHouse` name; dates and phones format as stated; nothing in the "no box" row appears.
  - `tests/draft-pdf.test.mjs` (node, with pdf-lib and fontkit from `node_modules`, reading `src/forms/`): the three files' sha256 equal `FORM_SHA256`; every name `draftFields` can produce for each form exists in that PDF (`getForm().getField`), including every Row1–Row4 name; a build with `flatten: false` round-trips (reload, read back a text field and a checkbox); a 6,000-character comment adds a seventh page titled "Additional comments (continued)" and the page-5 box ends with "(continued on page 7)"; the stamp appears on every page: decode each page's content streams (inflate when the stream's `/Filter` is `/FlateDecode`) and find `<4452414654` (the WinAnsi hex of "DRAFT", which is how pdf-lib writes standard-font text); the continued page is found the same way (hex of "Additional comments (continued)"); with Chinese text (a fictional 美 林), `buildDraftPdf` succeeds using `fontFiles` read from `DRAFT_FONT_FIXTURES` (byte-identical to the CDN files), and `hasCjk` routes to the font path; without Chinese text no font is read.
  - `tests/server.test.mjs`: `/src/vendor/pdf-lib.mjs` is served as JavaScript.
- [ ] **Step 2: Run** `node --test tests/draft-form.test.mjs tests/draft-pdf.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `npm i -D pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1` and the `DRAFT_FONT_FIXTURES` packages, all at exact versions.
  - `tools/build.mjs` builds both bundles: the existing Supabase one, and `tools/vendor-pdf-entry.mjs` → `src/vendor/pdf-lib.mjs` with a banner naming both pdf-lib versions. `npm run build:vendor` writes both. `tools/vendor-entry.mjs` stays Supabase-only.
  - `draft-form.mjs` per the map; `draft-pdf.mjs`: load the form, `registerFontkit`, embed Helvetica (and the Chinese font when `hasCjk` of any value), set texts (Latin through `setText` + `updateFieldAppearances(helvetica)`; Chinese per `CJK_DRAW`), tick checks, set the document title to the file name (`setTitle`), fill the comments box by wrapping to its widget rectangle at its font size and moving overflow to a new page drawn as plain text, draw the stamp at the top margin of every page (9 pt, dark red), `flatten()`, `save()`.
  - `app.mjs` `view-draft`: synchronously `const tab = window.open("", "_blank")` and, if it opened, write "Preparing your draft…" into it; then `await import("./vendor/pdf-lib.mjs")`, `fetch` the form (and the font files for that form when any value `hasCjk`: `en` and `zh-s` use `DRAFT_FONTS["zh-s"]`, `zh-t` uses `DRAFT_FONTS["zh-t"]`; checking each file's sha256 with `crypto.subtle.digest` against `DRAFT_FONTS` and refusing a mismatch with "The draft font could not be checked. Try again later."), build, `URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }))`, then `tab.location.href = url`. When `tab` is null, fill `#draft-ready` with an `<a href="<url>" download="13614-C-draft-<reference>[-zh-s|-zh-t].pdf" target="_blank">Your draft is ready: open it</a>`. Revoke the URL after 60 seconds. Errors go to `notify`.
- [ ] **Step 4: Run** `npm run build:vendor`, `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** ("Draft 13614-C: field maps for the three Rev. 10-2025 forms, the PDF builder and its vendor bundle").

---

### Task 10: The browser story on the new layout

**Files:** Modify `tests/browser.mjs`, `tests/support/story-pages.mjs` (helpers only).

**Interfaces:** Consumes the markup contract of Task 7.

Rewrite the phase "a client walks the nine-step intake on a version-2 workspace" as "a client walks the version-2 intake, sub-step by sub-step". Keep 4b's checks that still apply (redraw holds, focus and caret, notes and chip, conflict screen, senior switch, fill), re-expressed with sub-step ids. The typing rule at the top of the phase stays.

- [ ] **Step 1: Helpers.** `waitForSubstep(page, id)` waits for `#intake-v2-form[data-substep="<id>"]`. `railSub(id)` reads `#rail-sub-<id>-status`. Replace `waitForStepOf9`.
- [ ] **Step 2: The walk.** On a version-2 workspace (as today: set `default_intake_version=2` for the run's workspace and restore it in `finally`):
  - Walk **every visible sub-step once with Continue**, from `before.ready` to `review.submit`, waiting for each `data-substep`. This checks the rail tree and every step boundary. Answer each sub-step's required questions on the way (Fill fictional details where 4b's walk used it).
  - Check on the way: the overline and count on `about.address` for a never-married client ("STEP 1 OF 9 · ABOUT YOU", "2 of 5", since `about.spouse` is hidden); the lead line on `income.wages`; `rail-sub-before-ready-status` is "Done" after leaving it; a sub-step left with a gap reads "Needs answers"; the current step is expanded and another step's toggle expands it without navigating.
  - Everywhere else in the phase, move with rail jumps (`go-substep`).
- [ ] **Step 3: Documents.** On `documents.identity`, the photo ID card's upload buttons are disabled with the note; "I will send it later" changes the status to "Later" and the mark to "Done" once every Needed card in it is marked; "Mark as not done" puts it back. Check the row in `case_document_cards` with `fixture.database.sql`.
- [ ] **Step 4: Review.** `review.check` lists a deliberately missing answer under "Fix before you submit" and a Later card under "You can still submit"; clicking the alert goes to its sub-step; `review.summary`'s Change on `about.address` shows "Back to summary", which returns; Submit stays disabled until no alerts and the box is ticked; after Submit, the progress page lists the open documents.
- [ ] **Step 5: Visits follow the client.** Open the same case in a fresh browser context (new sign-in for the same applicant, as the story's second-window checks do): the rail shows the same ticks, and it opens at the first unfinished sub-step.
- [ ] **Step 6: The draft.** On `review.summary`, "View Draft 13614-C" opens a new tab whose URL becomes a `blob:` URL with a PDF (`waitForEvent("popup")`; read its bytes with `fetch(url).then(r => r.arrayBuffer())` inside the popup and check the `%PDF` header and size > 100 KB). Repeat for "简体中文版" after setting the fictional first name 美 on `about.you`, so the Chinese font path runs. Serve the font URLs from `DRAFT_FONT_FIXTURES` with `page.route` (the story never reaches the internet). Do this only in Chromium (Firefox may download instead); note it in the evidence.
- [ ] **Step 7: Same-day.** Change `service` to `same_day` with a rail jump to `before.service`: step 7 shows only "Bring these to your visit", with no buttons, and `review.check` shows no document warnings.
- [ ] **Step 8: Console.** The version-2 window's `assertConsoleQuiet` allows nothing (`allow: []`), unless the phase deliberately causes a refusal; then list exactly that line's pattern beside the check that causes it (4b carry-forward).
- [ ] **Step 9: Screenshots** with fictional data: `intake-v2-rail-tree`, `intake-v2-documents`, `intake-v2-review-check`, `intake-v2-summary`, replacing the 4b step screenshots that no longer exist.
- [ ] **Step 10: Run** the full suites: `npm test`, `npm run test:database`, `npm run test:browser`. Expected: PASS in both engine permutations.
- [ ] **Step 11: Commit** ("Browser story: the version-2 intake by sub-step, documents, review, visits and the draft").

---

## Self-review notes (for the executor)

- Spec coverage: §2 → Tasks 2, 5, 7; §3.1–§3.6 → Tasks 5–8; §3.7 → Tasks 4, 6; §3.8 → Task 6; §4 → Task 7; §5 → Tasks 6–8; §6 → Tasks 3, 4, 7; §7 → Tasks 1, 9; §9.1 → Task 2; §9.2 → Tasks 2, 4; §9.3 → Tasks 2 (migration-count test, `gcf_sp_date`), 5 (date parts, household references), 6 (Undo, reconcile), 7 (rail cue), 10 (console check); §11 → every task's tests. §8 (sidebar) and §10 (4c) are not in this plan.
- Names used across tasks: `substepsFor`, `findSubstep`, `substepOfQuestion`, `substepQuestions`, `visibleAnswers`, `isMemberId` (Task 2); `cardsFor`, `CARD_RULES`, `RULE_TYPES`, `SLOT_PATTERN`, `CARD_SUBSTEPS` (Task 3); `intakeVisited`, `documentCards`, `SET_DOCUMENT_CARD`, `SET_DOCUMENT_GROUP` (Task 4); `visibleSubsteps`, `resolveSubstep`, `adjacentSubstep`, `substepStatus`, `stepRollup`, `firstUnfinishedSubstep`, `newMemberId` (Task 5); `formSubstep`, `visitedSubsteps`, `returnToSummary`, `goToSubstep`, `moveSubstep`, `openForChange`, `backToSummary`, `currentSubstep`, `setDocumentCard`, `setDocumentGroup`, `revealedAnswers` (Task 6); `intakeFormV2`, `submittedV2`, `progressDocumentsV2` (Task 7); `draftFields`, `FORM_FILES`, `FORM_SHA256`, `buildDraftPdf`, `DRAFT_FONTS`, `CJK_DRAW`, `hasCjk` (Task 9).
