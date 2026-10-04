# Part 4c (re-planned on 4b2): Staff views, the version-2 Add a case, and the switch-over — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff work version-2 cases on the 4b2 layout: read the answers by step and sub-step with "Not sure" highlighted, edit the best time to call, record materials, see and work the client's document checklist, and print a draft 13614-C; take in a walk-in client on a version-2 Add a case built from sub-steps with a Documents accordion. Move the browser story onto version 2 (its workspace set to 2 by the test fixture). The switch-over that makes version 2 the default everywhere is written here but **held**: it ships as its own small PR after the group's wording review (decision 2026-10-04).

**Architecture:**
- **Staff views** (`src/staff-views.mjs`): a version-2 answers panel grouped by step and sub-step from the catalogue, a contact card and a materials card (materials on version 1 too), and a document checklist in the Documents tab with marks and Needed/Maybe moves. The draft 13614-C button reuses 4b2's `view-draft` wiring.
- **Add a case** (`src/office-views.mjs`): a version-2 page with one accordion per visible sub-step under step headings, plus one Documents accordion reusing 4b2's card markup. The controller gains a "new office draft" (a version-2 draft with no case yet): its first save creates an empty case, adopts it in place, then saves, then (for Send) submits. It never creates a second case.
- **Database:** three migrations. `018_document_card_authority.sql` (ships in 4c): staff who work on the case (office staff, or its preparer or reviewer) may mark and move document cards. `019_fixtures_v2.sql` (ships in 4c): samples follow the workspace's version (version-2 samples with contacts and household member ids), and a checkpoint reload clears a sample's materials and card marks. `020_intake_v2_default.sql` (**held**, its own PR after the wording review): version 2 becomes the default.
- **Tests:** test workspaces stay version 1 unless a test asks otherwise. The browser story runs on version 2, plus one version-1 phase.

**Tech Stack:** vanilla ES modules rendering HTML strings; `node:test`; Playwright; the local Supabase test stack; PostgreSQL migrations.

**Spec:**
- `docs/superpowers/specs/2026-09-30-intake-screens-design.md` §4 (staff screens, Add a case, eligibility, scope), §5 (switch-over) and §6 (tests), as revised by
- `docs/superpowers/specs/2026-10-04-intake-redesign-design.md` §10 (the 4c revision), §6.7 (staff and the cards), §7.4 (the draft on the case page) and §3.7/§3.8 (visits and revisions, which the office's saves must respect).

Supersedes `docs/superpowers/plans/2026-09-30-intake-screens-4c.md` (written for the nine-step layout). Its Tasks 1–2 shipped in 4b2; its other decisions carry over unless a ruling below changes them.

## Global Constraints

- **Version 1 is untouched.**
  - A version-1 case renders and behaves byte-for-byte as today on every screen: client form, staff answers panel, office assisted-answers panel, and the version-1 Add a case page and its one-call creation (`createAssistedCase`).
  - **The one deliberate addition** is the materials card, below today's answers panel in a version-1 case's Intake answers tab (013 allows `RECORD_MATERIALS` on version 1, and version-1 cases outlive the switch-over).
  - `pickAnswers` version 1, `fixture_answers` and version-1 seeding are unchanged. Removing version 1 is its own part after 4d.
- **Add a case follows `workspaces.default_intake_version`.** 2 gets the new page; 1 gets today's page and `createAssistedCase` unchanged.
- **No service-scope stop on version 2 (decision 2026-09-30).** Version 1's screening stays version 1 only. Add no scope rule.
- **Contact details (D5):** shown, and editable (best time and note only; never a phone), only when `canSeeContact(record, person)` from `src/intake-catalogue.mjs`. Otherwise show exactly: "Contact details are shown to the office, and to the preparer and reviewer once the case is claimed."
- **Materials:** the eleven `MATERIALS_ITEMS` in catalogue order, on cases of both versions. Save (`RECORD_MATERIALS`) only for people who pass `canSeeContact`; everyone else sees the card read-only.
- **Document cards (spec 2026-10-04 §6.3, §6.7):** cards come only from `cardsFor` (`src/document-cards.mjs`); marks are `SET_DOCUMENT_CARD` and moves `SET_DOCUMENT_GROUP` ("maybe" only undoes a staff move). **From 018 (decision 2026-10-04):** the client may mark on their own case; staff may mark and move when they work on the case — `works_on_case` (013): office staff (`followup` or `admin`) on any case, a volunteer only as its preparer or reviewer — the same rule as contact details and materials, which the browser mirrors as `canSeeContact`. Never staff on a client's unsent draft; never once closed. Version 2 only. No action ever deletes a card row (realtime publishes inserts and updates only); the one exception is the fixture checkpoint in Task 5, a privileged reset that already announces itself through the workspace generation. The optional `other` card has no marks, no status line and no moves (ruling R1 of 4b2).
- **Visits are the client's own** (spec 2026-10-04 §3.7): the office never sends `visited`; the controller already enforces this for presenters — don't change it.
- **Rules come from the shared modules, never re-implemented:** `src/intake-catalogue.mjs` (`stepsFor`, `substepsFor`, `findSubstep`, `substepOfQuestion`, `substepQuestions`, `findQuestion`, `wording`, `isVisible`, `isAnswered`, `checkValue`, `missingToSubmit`, `visibleAnswers`, `CONTACT_FIELDS`, `MATERIALS_ITEMS`, `canSeeContact`), `src/intake-form.mjs` (`renderQuestion`, `readForm`, `readField`, `formatAnswer`, `invalidAnswers`, `sendable`, `withholdInvalid`, `needsRedraw`, `visibleIds`, `drivesVisibility`, `noteState`, `visibleSubsteps`, `newMemberId`), `src/document-cards.mjs` (`cardsFor`).
- **Version-2 draft rules from 4b/4b2 hold on Add a case:** withheld invalid values; "dirty" means a save would change the server; `keepLocalOnly`; the revealed list; the redraw hold; every household member carries a valid `member_id` (the controller's `withMemberIds`). Nothing invalid or missing is ever sent (`SUBMIT`).
- **Send on Add a case (decision 2026-09-30, option a):** "Send to the office" is disabled only until `#field-confirmed` is ticked, and while `busy` or `officeSaving`. With the box ticked it stays enabled when answers are missing or invalid; a press then is refused: missing questions say "Needs an answer" from then on, every part that counts opens, and the keyboard goes to the count.
- **A new office draft has no `savedCase`.** `app.mjs`'s `isV2Case(state)` reads `savedCase.intakeVersion`, so it is false on a new Add a case draft: Add a case paths decide by the form on the page (`#add-case-v2-form`) or by the controller's version (2 while `officeDraft`), never by `isV2Case`.
- **Redraw rules (2026-09-30 spec §2.4) are unchanged and now also bind `#add-case-v2-form`:** `input` never redraws; only `className`/`textContent` change in place; a press never loses its target; `change`-caused DOM updates go through the hold.
- **Migrations:** `018_document_card_authority.sql` (Task 2), `019_fixtures_v2.sql` (Task 5), and `020_intake_v2_default.sql` (Task 7, **held**). Each is hand-written and final when its task ends (the test stack refuses a changed applied migration). Never edit 001–017. Redefinitions copy the latest definition verbatim (`check_operation_authority`, `check_authority`: 017; `seed_fixtures`, `apply_fixture_scenario`: 009) and add only the stated changes.
- **Hold the switch-over (decision 2026-10-04).** Nothing in Tasks 1–6 changes a workspace's `default_intake_version` or its column default; the test fixtures set it per test. Task 7 is written now and executed only after the user confirms the group's wording review is done.
- **Module names under `src/` match `^[a-z-]+\.mjs$`** (`server.mjs` serves nothing else): the new helper module is `src/form-values.mjs`.
- **Test workspaces stay version 1 unless a test says otherwise:** `createDatabaseFixture({ intakeVersion = 1 })` sets its workspaces inside initialization, before anything seeds; the browser fixture passes `intakeVersion: 2` only from Task 6; a test that switches a workspace's version restores it in `finally`.
- **Multi-value forms:** `Object.fromEntries(new FormData(form))` keeps only the last checkbox of a name. The two new forms (contact, materials) use `formValuesWithLists` (Task 1). Every existing form keeps its reader.
- **Accessibility:** a real `<label>` per control, `<fieldset>`/`<legend>` for groups; controls at least `var(--vt-tap)`; visible focus; colour never the only signal (status and "Not sure" marks are an icon and a word); colours only from `--vt-*` tokens (`#fff` allowed), in a fenced `/* Part 4c */ … /* end part 4c */` CSS block after 4b2's; no sideways scroll at 390px.
- **New wording goes to the group for review.** Use the spec's wording exactly; where it gives none, use this plan's.
- **Test stack:** `vitally-task2` on port 54321; start with `docker start $(docker ps -aq --filter name=vitally-task2)`; never `npx supabase start` from the repo root. PATH prefix: `PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`.
- **Commands:** `npm test`, `npm run db:migrate:test`, `npm run test:database`, `npm run test:auth-browser`, `npm run test:browser`.
- Fictional data only. Never substitute or generate PCDC logos. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Leave the untracked `VITA-Management-System-Demo/` directory alone.

**Out of scope:** Chinese on screen (4d); removing version 1; phone masking (part 5); the returning-client search (part 6); real uploads; the sidebar peek/pin (its own PR); the digital-assets queue flag (dropped, spec 2026-10-04 §10).

## Rulings made while planning

- **Add a case picks its page by the open case's version, and by the workspace only for a new draft.** With a case open (`state.savedCase`), its `intakeVersion` decides: a version-2 office draft opens on the version-2 page even after the workspace is set back to 1 (the documented way back), and a version-1 case on today's page even while the workspace is on 2. With no case, `workspace.defaultIntakeVersion` decides.
- **The leave check covers every in-app exit from Add a case except Sign out and the persona switch:** `open-board` (Cancel, the breadcrumb, "Back to Follow-ups", the sidebar's main link), `open-cases` (the sidebar's "All cases"), and `open-add-case` pressed while already on the page (which would otherwise start a fresh draft and wipe the current one). This slightly extends spec §4.2, which promised Cancel and Work board. (As built, the "Add a case" button is not rendered on the Add a case page, so that last guard is never reachable by a press; the reachable exits are Cancel, the breadcrumb's Work board, "Back to Follow-ups" and the sidebar's Work board and All cases.)
- **Office wording on the cards.** On Add a case and the staff checklist, cards speak to the office: marks "Later" / "Don't have" / "Mark as not done"; the reason line is "Asked by: <the asking question's wording>" (no line when the card has no asking question); the upload note reads "Uploads come later. Mark what the client will send later or doesn't have." 4b2's client wording is unchanged.
- **The draft 13614-C button on the staff page shows only when `canSeeContact(record, person)`** (and only for version-2 cases). The draft prints the client's phones, so it follows D5; the interview it serves (spec §7.4) happens after a claim, when the volunteer passes `canSeeContact`.
- **The staff document checklist sits at the top of the Documents tab,** above the document requests. Both are about the client's papers.
- **Add a case lays out each step as a heading with one accordion per visible question sub-step under it**, plus one "Documents" accordion. `review` sub-steps aren't on the page (its bottom bar sends). Section intros aren't shown (they speak to the client); lead lines are, because the income and expense questions are noun phrases without them.
- **The bottom bar counts parts** (sub-steps): "n parts still need answers", "1 part still needs answers", "Every part is answered". The client's rail already says "Part n of N".
- **The first open part on a new Add a case is `before.ready`**, as the old plan opened the first section.
- **A checkpoint reload clears the sample's `case_document_cards` rows** along with its `case_materials` (both are office work on the sample), and keeps `case_contacts` (spec §5).
- **One in-flight guard for the office:** `saveOfficeDraft` holds the controller's existing one-save-at-a-time flag (the one `goToSubstep` and `cardAction` use) for its whole call, besides `officeSaving` for the UI, so a card mark can't race a Save draft.

## File map

| File | Change | Tasks |
|---|---|---|
| `src/staff-views.mjs` | Version-2 answers panel by step and sub-step with "Not sure"; contact card; materials card; document checklist; draft button; `staffEligibility` gains `editContact`, `recordMaterials`, `markDocumentCard`, `moveDocumentCard`; `decorateStaffCase` names material recorders | 1, 2 |
| `src/admin-views.mjs` | Office case page: the cards in the Intake answers tab; the checklist; a version-2 office draft shows "Continue in Add a case" | 1, 2, 4 |
| `src/form-values.mjs` (new) | `formValuesWithLists(form)` | 1 |
| `src/intake-views.mjs` | Export `docCard` for reuse, with an office wording option | 4 |
| `src/office-views.mjs` | `renderAddCaseV2` (the version-1 `renderAddCase` stays) | 4 |
| `src/views.mjs` | Add a case dispatch on the workspace's default version; the leave dialog | 4 |
| `src/controller.mjs` | New office draft, `openAddCase`, `saveOfficeDraft`, `toggleAddSubstep`, `enterOfficeDraftIfNeeded` | 3 |
| `src/supabase-store.mjs` | `getWorkspace` returns `defaultIntakeVersion` | 3 |
| `src/app.mjs` | Contact and materials forms; `move-card`; staff draft button; Add a case wiring | 1, 2, 4 |
| `src/styles.css` | `/* Part 4c */` block | 1, 2, 4 |
| `supabase/migrations/018_document_card_authority.sql` (new) | Card marks and moves for staff who work on the case | 2 |
| `supabase/migrations/019_fixtures_v2.sql` (new) | Samples follow the workspace's version; checkpoint clears materials and card marks | 5 |
| `supabase/migrations/020_intake_v2_default.sql` (new, **held**) | Default 2 everywhere | 7 |
| `tests/database-redesign.mjs` | Card authority under 018 | 2 |
| `tests/support/database-fixture.mjs`, `tests/support/browser-fixture.mjs` | `intakeVersion` option | 5, 6 |
| `tests/browser.mjs`, `tests/support/story-pages.mjs` | The story on version 2 | 6 |
| `docs/design/screens/`, `README.md`, `docs/design/redesign-review.md`, `docs/developer/*.md`, `docs/setup.md` | Screenshots and docs | 6, 7 |

---

### Task 1: Staff reading of a version-2 case — answers by sub-step, "Not sure", contact card, materials card (materials on version 1 too)

**Files:**
- Create: `src/form-values.mjs`
- Modify: `src/staff-views.mjs`, `src/admin-views.mjs` (placement only), `src/app.mjs` (the two forms), `src/styles.css`
- Test: `tests/staff-views.test.mjs`, `tests/admin-views.test.mjs`, `tests/controller.test.mjs`, `tests/form-values.test.mjs` (new)

**Interfaces:**
- Consumes: `formatAnswer`, `substepsFor`, `substepQuestions`, `stepsFor`, `isVisible`, `isAnswered`, `findQuestion`, `wording`, `CONTACT_FIELDS`, `MATERIALS_ITEMS`, `canSeeContact`.
- Produces:
  - `answersPanel(record, { person } = {})`: dispatches on `record.intakeVersion`. Version 1 ignores `person` and returns exactly today's output (keep today's body as `answersPanelV1`). Version 2 returns `answersPanelV2(record, { showContact: canSeeContact(record, person) })`. Both callers (`renderStaffCase`, `renderAdminCase`) pass the viewing person.
  - `contactCard(record, rights, ui)` and `materialsCard(record, rights, ui)`, exported for the office page and Add a case.
  - `staffEligibility(record, person)` gains:
    - `editContact`: allowed when `record.intakeVersion === 2` and `canSeeContact(record, person)`; otherwise refused with the D5 sentence, or for a version-1 case "A version-1 case has no contact card.";
    - `recordMaterials`: allowed when `canSeeContact(record, person)`, **on a case of either version**; otherwise refused with "Materials are recorded by the office, and by the preparer and reviewer once the case is claimed."
  - `decorateStaffCase` adds `recordedByName` to each `materials` entry, from the roster.
  - `#contact-form`: `bestContactTime` checkboxes, a `bestContactNote` textarea, `caseSubmit("Save best time", "UPDATE_CONTACT")`; toggle `data-action="toggle-edit-contact"` → `controller.togglePanel("edit-contact")`.
  - `#materials-form`: `received` checkboxes and `caseSubmit("Save materials", "RECORD_MATERIALS")`.
  - `src/form-values.mjs`: `formValuesWithLists(form)` — repeated names become arrays, a checkbox group with nothing ticked reads as `[]` (it uses every `input[type=checkbox][name]` in the form), other fields read as strings.

**`answersPanelV2(record, { showContact })`** (2026-09-30 spec §4.1, revised by 2026-10-04 §10):
- Heading "What the client told us" (the same as version 1). First line: "Wording used: Standard" or "Wording used: Senior" (`answers.form_version === "senior"`).
- The answers are `serverAnswersV2(record)` from `src/intake-views.mjs` (the record's answers plus its four contact fields through `CONTACT_FIELDS`); don't write a second merge.
- **Contact fields appear only when `showContact`.** Otherwise the four contact questions (`tp_phone`, `sp_phone`, `best_contact_time`, `best_contact_note`) are skipped entirely: no row and never "Not answered".
- **Grouped by step, then sub-step:** one `<section class="answers-step">` per catalogue step with an `<h3>` step title, and inside one `<div class="answers-sub">` per sub-step of kind `questions` with an `<h4>` sub-step title (`general` wording, `en`). Documents and review steps have no answer rows and are left out. For every visible question (`isVisible` against the answers) in `substepQuestions(id)` order:
  - answered: `detailRow(wording(q, { variant }), formatAnswer(q, value, { variant }))`; household members one row per member;
  - required and unanswered: the row value "Not answered", class `is-missing`;
  - optional and unanswered: left out.
  - A sub-step with no rows shows nothing; a step with no rows shows nothing.
- **"Not sure" is highlighted** (spec 2026-10-04 §10): a row whose value is `not_sure` gets class `is-not-sure` and, after the value, `<span class="not-sure-flag">${icon("help")} Not sure</span>`. A household member whose sub-fields include `not_sure` gets the same flag on its row, followed by the sub-field wordings with any trailing "?" removed (the household wordings are questions): "Not sure: U.S. citizen, Full-time student in 2025 (at least 5 months)". Above the steps, when any answer is not sure: `<p class="not-sure-count">${icon("help")} <n> answers are "Not sure". Ask about them at the interview.</p>` (singular "1 answer is").
- Nothing is editable.

**The contact card** (`<section class="panel contact-card">`, heading "Contact details"):
- When `canSeeContact`: rows for Phone and Spouse phone (`formatAnswer` of `tp_phone`/`sp_phone`), Best time to reach (`formatAnswer` of `best_contact_time`) and Note; "Not given" for an empty one; an "Edit best time" button (`toggle-edit-contact`, `aria-expanded`).
- While `openPanels` includes `"edit-contact"`: the form, pre-ticked from `record.contact`, with Cancel (the same toggle).
- Otherwise only the D5 sentence.

**The materials card** (`<section class="panel materials-card">`, heading "Materials received"):
- A `<fieldset>` with legend "Materials received" and one checkbox per `MATERIALS_ITEMS` entry, in order: `name="received" value="<id>"`, label `item.label.en`; ticked when `record.materials` has it, with "Recorded by <recordedByName> · <formatTime(receivedAt)>".
- When `rights.recordMaterials` allows: the Save button. Otherwise every checkbox `disabled` and the refusal reason.

**Placement:** a version-2 case's Intake answers tab holds `answersPanelV2`, then the contact card, then the materials card. A version-1 case's tab holds today's panel unchanged, then the materials card (no contact card). Both in `renderStaffCase` and `renderAdminCase`. For a version-1 office draft the materials card sits below today's note; Task 4 handles a version-2 office draft.

**Wiring (`app.mjs`):** `runCaseAction` uses `formValuesWithLists` instead of `Object.fromEntries(new FormData(form))` **only** for `UPDATE_CONTACT` and `RECORD_MATERIALS`; after `UPDATE_CONTACT` lands, close the `edit-contact` panel (the controller's `dispatch` already re-reads the case); `toggle-edit-contact` calls `controller.togglePanel("edit-contact")`.

- [ ] **Step 1: Failing tests.**
  - `tests/staff-views.test.mjs`, with a version-2 staff record built from `makeSampleAnswers({ version: 2, seed: 1 })` (contact fields moved into `contact` as the store would):
    - **answers panel:** step headings for the question steps only (no Documents, no Review); sub-step headings ("Mailing address" under "About you"); "Wording used: Standard", and "Senior" with `form_version: "senior"`; a date "Apr 12, 1961" style; a household member line; a required unanswered question shows "Not answered"; an optional unanswered one is absent; a hidden question (spouse questions when not married) and the hidden sub-step "Your spouse" are absent;
    - **"Not sure":** `inc_tips: "not_sure"` gives a row with class `is-not-sure` and the words "Not sure" with an icon; a household member with `us_citizen: "not_sure"` gets "Not sure: U.S. citizen" (the sub-field's wording "U.S. citizen?" without its "?"); the count line reads "1 answer is "Not sure"…" with one and "2 answers are…" with two; no count line with none;
    - **contact visibility:** an unclaimed case viewed by a volunteer has no phone digits anywhere on the page and shows the D5 sentence; the same case with that volunteer as preparer shows "(215) 555-01xx", the best time and Edit; an office person (`followup`) sees it;
    - **contact hidden:** the version-2 panel has no row for any contact question and no "Not answered" for `tp_phone`;
    - **contact form:** with `openPanels: ["edit-contact"]`, one checkbox per `best_contact_time` option, ticked from `contact.bestContactTime`, and a note textarea;
    - **materials card:** eleven checkboxes in catalogue order; a received one ticked with "Recorded by Alex ·" (the test roster's Alex is "Alex"); an unclaimed-volunteer view has every box disabled and no Save;
    - **version 1:** `answersPanel(v1) === answersPanelV1(v1)` for three version-1 fixtures; a version-1 page has no `contact-card` and no "Wording used"; its Intake answers tab holds today's panel then one `materials-card`. Update any test that pins the whole version-1 Intake answers tab deliberately, and list each one in the report;
    - `staffEligibility`: `editContact` and `recordMaterials` for the cases above plus a version-1 case.
  - `tests/admin-views.test.mjs`: a submitted version-2 case on the office page shows the three cards in the Intake answers tab; a submitted version-1 case shows today's panel plus the materials card, and no contact card.
  - `tests/controller.test.mjs`: give the fake store's `act` an `UPDATE_CONTACT` branch that writes the payload's keys into its case's `contact`; `runAction("UPDATE_CONTACT", { bestContactTime: ["weekend"] })` leaves `savedCase.contact.bestContactTime` `["weekend"]` and `savedCase.revision` equal to the store's.
  - `tests/form-values.test.mjs`: a tiny fake form (`FormData`-like entries plus `querySelectorAll`): two ticked `received` boxes give an array of two; none gives `[]`; a single text field gives a string.
- [ ] **Step 2: Run** the four files. Expected: FAIL.
- [ ] **Step 3: Implement** as above. CSS in the new `/* Part 4c */ … /* end part 4c */` block (after 4b2's): the cards, `.is-missing` and `.is-not-sure` rows, the "Not sure" flag (icon and word), the checkbox list at 390px.
- [ ] **Step 4: Run** the files and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** ("Staff read version-2 answers by sub-step with Not sure; contact and materials cards; materials on version 1 too").

---

### Task 2: The document checklist and the draft 13614-C on the staff case page

**Files:** Create `supabase/migrations/018_document_card_authority.sql`; Modify `src/staff-views.mjs`, `src/admin-views.mjs`, `src/app.mjs`, `src/styles.css`, `tests/database-redesign.mjs`; Test `tests/staff-views.test.mjs`, `tests/admin-views.test.mjs`, `tests/shell.test.mjs`.

**The migration** (`018_document_card_authority.sql`; header comment names this plan's Task 2 and the decision of 2026-10-04; re-appliable):
- `check_operation_authority`, verbatim from 017, with its two card branches replaced by:
  ```sql
    when 'SET_DOCUMENT_CARD' then
     -- The client for themselves, or a selected staff person; which staff person
     -- may depends on the case, so that half is check_authority's.
     if p_person_id is null and p_member.access<>'applicant' then
      raise sqlstate 'VT001' using message='FORBIDDEN';
     end if;
    when 'SET_DOCUMENT_GROUP' then
     -- Staff only; which staff person may depends on the case (check_authority).
     if p_person_id is null then
      raise sqlstate 'VT001' using message='FORBIDDEN';
     end if;
  ```
- `check_authority`, verbatim from 017, with its card branch replaced by:
  ```sql
    when 'SET_DOCUMENT_CARD','SET_DOCUMENT_GROUP' then
     if p_person_id is null then
      if p_case.owner_user_id is distinct from p_member.user_id then raise sqlstate 'VT001' using message='FORBIDDEN'; end if;
     elsif p_case.owner_user_id is not null and p_case.stage='draft' then
      -- Never staff on a client's unsent draft.
      raise sqlstate 'VT001' using message='FORBIDDEN';
     elsif not vitally_private.works_on_case(p_case,v_person) then
      -- Office staff on any case; a volunteer only as its preparer or reviewer.
      raise sqlstate 'VT001' using message='FORBIDDEN';
     end if;
  ```
- 017's grant and revoke lines for the redefined functions, and the closing `revoke all on all functions in schema vitally_private …`.
- **Database tests** (`tests/database-redesign.mjs`, update the 4b2 authority cases): Alex as the case's preparer may mark and move; Alex on a case he doesn't prepare is refused `VT001`; Morgan as its reviewer may; Sam (office) may on any submitted case and on an office draft; a staff person on a client's unsent draft is still refused and nothing is written; the closed-case and version-1 refusals still hold. Update the earlier cases that expected Alex refused for lack of `admin`/`receive_documents` and list them in the report.
- Run `npm run db:migrate:test` and `npm run test:database` with the rest of this task's steps.

**Interfaces:**
- Consumes: `cardsFor(answers, cardState)` (cards `{ slotId, ruleId, owner, ownerLine, group, baseGroup, status, substep, label, why, hint, ask }`), `CARD_SUBSTEPS`, the store's `record.documentCards`, `record.contact`, the controller's `setDocumentCard(slotId, status)` and `setDocumentGroup(slotId, group)`, 4b2's `mark-card` and `view-draft` handlers in `app.mjs`.
- Produces:
  - `staffEligibility` gains `markDocumentCard` and `moveDocumentCard`:
    - `markDocumentCard` and `moveDocumentCard` (one rule, two names, matching the two actions): allowed when `record.intakeVersion === 2`, the stage isn't `closed`, and `canSeeContact(record, person)` (the browser's mirror of `works_on_case`); refused with "Documents are marked by the office, and by the preparer and reviewer once the case is claimed." (not working on the case), "This case is closed." (closed), or "A version-1 case has no document checklist." (version 1).
  - `documentChecklist(record, rights, ui)`: exported; returns "" for a version-1 case. `renderAdminCase` passes `staffEligibility(record, person)` for it (the office page's own `adminEligibility` has no card rights).
  - `app.mjs`: a `move-card` handler (`data-slot`, `data-group`).

**The checklist** (top of the Documents tab, above the document requests; version 2 only): `<section class="panel doc-checklist" aria-labelledby="doc-checklist-title"><h2 id="doc-checklist-title">Document checklist</h2>`, with the field note "From the client's answers. Same-day clients bring these to the visit."
- Cards: `cardsFor(serverAnswersV2(record), record.documentCards ?? [])`, grouped under `<h3>` sub-step titles (Identity, Income forms, Expenses, Health and other events, Other documents) in `CARD_SUBSTEPS` order; a group with no cards is left out. Staff always see the full cards, whatever the service.
- Each card is `<article class="doc-row" id="doc-<slot with . as ->" data-slot="<slot>" tabindex="-1">` with:
  - the label (bold), the owner line, and the reason line in office wording (ruling above): "Asked by: <wording of the card's `ask` question>", none when the card has no `ask`;
  - the group as an icon and a word: "Needed", "Maybe needed", or for `other` "Optional"; a card moved up by staff reads "Needed (moved up by the office)";
  - its status `<p class="doc-status is-<status>" id="doc-<slot with . as ->-status" tabindex="-1">` with an icon and "Not done", "Later" or "Don't have" (none for `other`);
  - when `rights.markDocumentCard` allows (and not `other`): `mark-card` buttons "Later", "Don't have", and "Mark as not done" when the status isn't Not done (`data-slot`, `data-status` later / none / not_done) — the same data attributes 4b2's handler reads;
  - when `rights.moveDocumentCard` allows: on a card whose `baseGroup` is `maybe` and `group` is `maybe`, a `move-card` button "Move to Needed" (`data-group="needed"`); on one whose `baseGroup` is `maybe` and `group` is `needed`, "Move to Maybe needed" (`data-group="maybe"`). Answer-Needed cards and `other` get no move.
  - when a right is refused, its reason once at the top of the checklist (via `explain`), not per card.
  - All mark and move buttons are disabled while `ui.busy`.
- **The draft button** (spec §7.4; ruling above): in a version-2 case's Intake answers tab, after the answers panel, only when `canSeeContact(record, person)`: `<div class="summary-tools">` holding `button("View Draft 13614-C", "view-draft", "secondary", 'data-form="en"')`, `… "简体中文版" … data-form="zh-s"`, `… "繁體中文版" … data-form="zh-t"`, and `<p id="draft-ready" class="draft-ready" aria-live="polite"></p>`. 4b2's `viewDraft` builds from `controller.getState().draftAnswers`, which for a selected version-2 case is the server's answers with contact fields; nothing new is needed in `viewDraft`. Version 1: no button.
- **`move-card` in `app.mjs`:** `await controller.setDocumentGroup(target.dataset.slot, target.dataset.group)`, then focus `#doc-<slot>-status` (the status line), falling back to `#doc-<slot>` and then `#main`. 4b2's `mark-card` handler already focuses the same ids; staff markup reuses them.

- [ ] **Step 1: Failing tests.**
  - `tests/staff-views.test.mjs`:
    - a submitted version-2 record with `inc_wages: "yes"`, two household members with ids, `refund_method: "direct_deposit"` and `documentCards: [{ slotId: "w2.household", status: "later", groupOverride: null }, { slotId: "ssn.hh.<id1>", status: null, groupOverride: "needed" }]`, viewed by Sam (admin, receive_documents): the checklist lists identity, income, events and other groups in order; `w2.household` shows "Later" and Later/Don't have/Mark as not done; `ssn.hh.<id1>` reads "Needed (moved up by the office)" with "Move to Maybe needed"; `ssn.hh.<id2>` reads "Maybe needed" with "Move to Needed"; `photo_id.tp` (answer-Needed) has no move; `other.household` reads "Optional" with no marks, no status and no move;
    - viewed by Alex (prepare only) on a case he doesn't prepare: no mark or move buttons, and the refusal shown once; the same case with Alex as its preparer: marks and moves shown; Morgan as its reviewer: shown;
    - the W-2 card's reason line reads "Asked by: Wages from a part-time or full-time job"; `photo_id.tp` has no reason line;
    - a closed case: no buttons, "This case is closed.";
    - a version-1 record: `documentChecklist` is "";
    - with `busy: true`, every mark and move button is `disabled`;
    - same-day (`service: "same_day"`): the full cards with marks still show (staff never see the bring list);
    - the draft button: present (all three, plus `#draft-ready`) for an office person and for the case's preparer; absent for an unclaimed volunteer and on a version-1 case.
  - `tests/admin-views.test.mjs`: the office page's Documents tab starts with the checklist for a submitted version-2 case.
  - `tests/shell.test.mjs`: `app.mjs` handles `move-card` (the existing "every emitted action has a handler" check covers it once the views emit it).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** CSS in the `/* Part 4c */` block: `.doc-checklist`, `.doc-row`, the group mark (icon and word).
- [ ] **Step 4: Run** the files and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** ("Staff document checklist with marks and Needed/Maybe moves; the draft 13614-C on the case page").

---

### Task 3: The controller and store for the version-2 Add a case

**Files:** Modify `src/controller.mjs`, `src/supabase-store.mjs`; Test `tests/controller.test.mjs`, `tests/store.test.mjs`.

**Interfaces:**
- Consumes: the controller's `commitDraft`, `saveAnswers`, `runAction`, `revealInvalid`, `pruneRevealed`, `selectCase`, `startCase`, `serverAnswersOf`, `loadWorkspace`, `withMemberIds`, the one-save-at-a-time flag (`substepSaveInFlight`), `cardAction`; `mergeIntoDraft`, `missingToSubmit`, `invalidAnswers`, `visibleSubsteps`, `substepOfQuestion`; `cardsFor`.
- Produces:
  - **`store.getWorkspace()`** returns `defaultIntakeVersion: Number(row.default_intake_version ?? 1)`; the fake store gets the same field.
  - **`openAddCase({ caseId = null } = {})`** (presenter only):
    - without `caseId`: clears the selection and starts a new office draft: `officeDraft = true`, `savedCase = null`, `draftAnswers = {}`, `dirty` false, `saveState` `"idle"`, `revealed` `[]`, `openAddSubsteps` `["before.ready"]`, `addCaseShowMissing` false, `screen` `"office-add-case"`;
    - with `caseId` (an office draft): `await selectCase(caseId, { navigate: false })`, then `officeDraft = false`, `openAddSubsteps` `["before.ready"]`, `screen` `"office-add-case"` — **whatever the workspace's version** (ruling: the open case's version picks the page);
    - without `caseId` on a workspace whose `defaultIntakeVersion` is 1, it only sets the screen (today's page);
    - while `state.workspace` is null, it clears the selection, sets the screen and leaves `officeDraft` false; `enterOfficeDraftIfNeeded()` starts the draft when the row arrives (the page shows "Loading…" until then).
  - **`caseVersion()`** returns 2 while `state.officeDraft` is true; `serverAnswers()` is `{}` while there is no case, so `dirty` means "anything to send". Visits stay unsent for presenters (unchanged).
  - **`officeDraft` never outlives the page:** `navigate(screen)` to any other screen sets `officeDraft = false`, `officeDraftCaseId = null`, `addCaseShowMissing = false`; `clearSelection()` sets `officeDraft = false`. `saveOfficeDraft` never calls `clearSelection` (it adopts the case in place).
  - **`enterOfficeDraftIfNeeded()`**, called at the end of `loadWorkspace()` (on `load()` and on every realtime workspace update): acts **only** when `state.screen === "office-add-case"`, `!state.selectedCaseId`, `state.officeDraft === false` and `state.workspace?.defaultIntakeVersion === 2`, and then enters the new-draft state exactly as `openAddCase()` does. **It never acts while `officeDraft` is true** (a workspace update must not wipe what the office is typing). A reload on an unsaved new draft loses it (accepted, as today's version-1 page).
  - **`toggleAddSubstep(id)`:** adds or removes `id` (a sub-step id, or `"documents"`) in `state.openAddSubsteps`; opening one closes none.
  - **`saveOfficeDraft({ send = false } = {})`:**
    0. **Guards:** if `state.officeSaving` or the one-save-at-a-time flag is set, return `{ sent: false, reason: "busy" }`. If `send` and `openPanels` lacks `"confirmed"`, return `{ sent: false, reason: "unconfirmed" }` with no create, save or submit. Then set `state.officeSaving = true` **and** the one-save-at-a-time flag (ruling above), `show()`, and clear both in `finally` (then `show()`). Neither is persisted.
    1. **If `state.savedCase` is null, get the case and adopt it in place:**
       - if `state.officeDraftCaseId` is set (an earlier create landed but its read failed), use it;
       - otherwise `startCase({ mode: "assisted", personId: state.selectedPersonId, answers: {} }, null, { select: false })` — `startCase` gains a third argument `{ select = true } = {}`; with `select: false` it creates, spends `pendingCreateActionId`, reloads the list (swallowing a list error as today) and returns the receipt **without** `selectCase`. A `null` receipt (a create in flight) returns `{ sent: false, reason: "busy" }`. Otherwise record `state.officeDraftCaseId = receipt.caseId` at once;
       - read it: `await store.getCase(state.officeDraftCaseId)`; on failure note it, leave the draft and `officeDraft` as they are, and rethrow;
       - if the case isn't version 2, throw `controllerError("VALIDATION", "This workspace now takes version-1 applications. Start again from Add a case.")`, keeping the answers and sending no save;
       - adopt it in one synchronous step with no `await` and no `clearSelection`: `selectedCaseId = record.id`, `savedCase = record`, `officeDraft = false`, `officeDraftCaseId = null`, `commitDraft(mergeIntoDraft(serverAnswersOf(record), state.draftAnswers))`, `persistSession()`. Nothing else resets (`revealed`, `openAddSubsteps`, `openPanels`, `addCaseShowMissing` stay).
    2. `if (state.dirty) await saveAnswers()` (never with `visited`, as for any presenter).
    3. If `send`:
       - re-check from the draft: `missingToSubmit(2, state.draftAnswers).length === 0 && invalidAnswers(null, state.draftAnswers).length === 0`; if not: reveal the invalid ids, set `addCaseShowMissing = true`, add every question sub-step that holds a missing or invalid answer (`substepOfQuestion` of each id's top question) to `openAddSubsteps`, `show()`, return `{ sent: false, reason: "answers" }` (the draft was saved in step 2);
       - otherwise `await runAction("SUBMIT", { confirmed: true })`, then `selectCase(id)` with navigation (the office lands on the case page), reset `addCaseShowMissing` to false, return `{ sent: true }`.
    4. **Failure after the create:** the case stays selected, the draft keeps every answer, the error goes through today's banner; the next call finds `savedCase` and skips the create. It never creates a second case.
  - **Card marks on Add a case** use the existing `setDocumentCard` (`cardAction`, which saves a dirty draft first). It returns null while `officeSaving`/the flag is set; the page disables the marks then (Task 4).
  - `createAssistedCase` unchanged. Not persisted: `officeDraft`, `officeSaving`, the new draft's answers, `openAddSubsteps`, `addCaseShowMissing`.

- [ ] **Step 1: Failing tests** (`tests/controller.test.mjs`; a presenter principal and persona; the fake workspace has `defaultIntakeVersion: 2`; the fake store's `act` refuses a stale `expectedRevision` with `{ code: "CONFLICT" }` as 4b2's v2 fake does):
  - `openAddCase()`: `editAnswers({ tp_first_name: "Mei" })` keeps the version-2 key and makes `dirty` true; `editAnswers({ hh: [{ first_name: "A" }] })` stores a member with a valid `member_id`.
  - `saveOfficeDraft()`: exactly one create with `answers: {}` and `mode: "assisted"`, then one `SAVE_ANSWERS` whose answers are `withholdInvalid(draft, 2)` and which has **no** `visited` key; afterwards `officeDraft` false, `savedCase.id` the new case, the screen still `"office-add-case"`, `dirty` false.
  - Save fails after the create: the draft keeps the answers, the case is selected, `saveState` `"failed"`; a second call makes no second create and saves once.
  - The create fails with an unknown outcome: the retry sends the same create action id.
  - The create lands, reading the case fails: `officeDraftCaseId` holds the id, `officeDraft` stays true, the answers stay; the next call makes no second create.
  - Typing during the create is kept (a controlled `createCase` promise; `editAnswers({ addr_city: "Camden" })` meanwhile; the save includes it).
  - The adoption resets nothing (`revealed`, `openAddSubsteps` `["before.ready","about.address"]`, `"confirmed"`, `addCaseShowMissing` unchanged).
  - A second press during the first returns `{ sent: false, reason: "busy" }` with one create; a `setDocumentCard` during a Save draft returns null and sends nothing.
  - The workspace went back to version 1: VALIDATION, no `SAVE_ANSWERS`, answers kept.
  - Leaving resets; restore with `screen: "office-add-case"` and no case gives `officeDraft` true; a realtime workspace change doesn't wipe the draft; pressed before the workspace loads, the draft starts when it arrives.
  - A refused Send (ticked, one missing answer in `about.address`): created and saved, no `SUBMIT`, `addCaseShowMissing` true, `openAddSubsteps` includes `about.address`; resets on `navigate` and after a successful Send.
  - The confirmation: unticked returns `unconfirmed` with no calls; ticked on a new draft creates, saves and submits.
  - Ticked with a complete draft (`makeSampleAnswers({ version: 2 })`): one save, one `SUBMIT { confirmed: true }`, the screen is the case page; with an invalid email: no `SUBMIT`, `reason: "answers"`, `revealed` contains `email`.
  - `openAddCase({ caseId })` on a version-2 office draft selects it and stays on the page, **also on a workspace set back to 1** (the case opens; `officeDraft` false); `toggleAddSubstep` opens and closes independently; a version-1 workspace: `openAddCase()` (no case) sets only the screen and `createAssistedCase` behaves as today.
  - `tests/store.test.mjs`: `getWorkspace` maps `default_intake_version` (absent → 1).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the files and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** ("A version-2 office draft: create on first save, never twice; one save at a time").

---

### Task 4: The version-2 Add a case page and its wiring

**Files:** Modify `src/office-views.mjs`, `src/intake-views.mjs` (export `docCard`), `src/views.mjs`, `src/admin-views.mjs`, `src/app.mjs`, `src/styles.css`; Test `tests/office-views.test.mjs`, `tests/admin-views.test.mjs`, `tests/shell.test.mjs`.

**Interfaces:**
- Consumes: Task 1's `materialsCard`, Task 3's controller API, 4b2's renderer, `visibleSubsteps`, `cardsFor`, `docCard`, and its version-2 wiring in `app.mjs` (`V2_CONTROLS`, `v2Answer`, the hold, `sweepV2Form`, `mark-card`).
- Produces:
  - **`renderAddCaseV2(ui)`**, `ui = { person, busy, officeSaving, draftAnswers, savedCase, openAddSubsteps, openPanels, addCaseShowMissing, revealed, dirty, saveState, error, retryable, people }` (`views.mjs` fills every key; `savedCase` passes through `decorateStaffCase(state.savedCase, people)`).
    - **The gate:** as today's `renderAddCase`, when `adminEligibility({}, person).assistedIntake` isn't allowed, return the pill and `explain(...)` only.
    - **Header:** the frame in `views.mjs` already renders the `<h1>` "Add a case" and "Back to Follow-ups" (`open-board`); add **no second heading**. Below it: the breadcrumb `<nav aria-label="Breadcrumb">` "Work board / Add a case" (Work board is `open-board`); then one `<div class="application-meta">` holding "Application ID: assigned when you save" (or the reference) and "Draft · " plus the save chip (`saveStatus`). The wrapper matters: `app.mjs`'s in-place `refreshSaveChip` looks only inside `.application-meta`, so without it the chip stays stale while the office types.
    - **Layout, no nested forms:** `<div class="add-case-layout">` holding the form `#add-case-v2-form` and, **as its sibling, outside the form**, `<aside class="add-case-side">` (which holds `#materials-form`).
    - **Form `#add-case-v2-form`** (`novalidate`): for each catalogue step except `review`, in order, `<section class="add-step" data-step-id="<id>">` with an `<h2>` ("Before you start" unnumbered, then "1. About you" … "8. Anything else" in the client's numbering). Inside a question step, one accordion per **visible** sub-step of kind `questions` (`visibleSubsteps(draft, cards)`), `<div class="add-sub" data-substep="<id>">`:
      - a header button `data-action="toggle-add-substep" data-substep="<id>" id="add-sub-<id with . as ->-toggle"` with `aria-expanded` and `aria-controls="add-sub-<…>-body"`, showing the sub-step title and its status `<span id="add-sub-<…>-status" class="add-sub-status is-needs|is-none">` ("Needs answers" when the part counts, otherwise empty) whether open or closed;
      - closed: a one-line summary, the `formatAnswer` values of its visible answered questions joined with " · ", cut to 140 characters with "…", or "Nothing entered yet";
      - open: `<div id="add-sub-<…>-body">` with the lead line (`<p class="q-lead">`) when the sub-step has one, then its visible questions through `renderQuestion(q, value, { scope: "office", variant, lang: "en", answers, showMissing: addCaseShowMissing, revealed })`, grouped by heading as on the client form. No section intros.
    - **The Documents step** holds one accordion `data-substep="documents"` (toggle id `add-sub-documents-toggle`, status none): open, it lists `cardsFor(draft, savedCase?.documentCards ?? [])` under the same sub-step titles as the staff checklist, each through `docCard(card, { links: false, off, office: true })` (office wording, ruling above) where `off` is `" disabled"` while `busy` or `officeSaving` **or while there is no case yet**; before the first save the body starts with "Save the draft first to mark documents." The full cards with marks show for every service, same-day included (spec §6.7).
    - **Side column:** "Case info" (Application ID, stage "Draft", created by, created at — before the first save the persona's name and "When you save"; once saved `formatTime(savedCase.createdAt)` and the actor of the earliest `internalHistory` entry named through `people`, falling back to "The office"); "Materials received": Task 1's `materialsCard` once a case exists, before that the eleven items disabled with "Save the draft first to record materials".
    - **Bottom bar `.add-case-bar`:** Cancel (`open-board`); `<p id="add-case-count" tabindex="-1">`: "n parts still need answers" / "1 part still needs answers" / "Every part is answered" — a part counts when a visible question sub-step holds a required visible unanswered question or an invalid answer; **Save draft** `data-action="save-office-draft"` disabled while `busy` or `officeSaving`; the confirmation `<label class="checkbox-row" for="field-confirmed"><input type="checkbox" id="field-confirmed" name="confirmed" …><span>I have checked these answers with the client</span></label>` and the note "This confirms the answers on screen. It is not a signature on a tax or consent form." (ticked while `openPanels` includes `"confirmed"`; reuses the existing `field-confirmed` change branch; no `data-q`); **Send to the office** `data-action="send-office-draft" id="add-case-send"`, disabled only while unticked, `busy` or `officeSaving` (option a). Every bar control is `type="button"` or the checkbox.
    - The Fill fictional details pill: `fill-assisted-intake`, as today.
  - **`src/intake-views.mjs`:** `export` the existing `docCard`, with one new option `office = false`. With `office: true`: the marks read "Later", "Don't have" and "Mark as not done" (same `data-status` values); the reason line reads "Asked by: <wording of the card's `ask` question>" (`wording(findQuestion(2, card.ask), { variant: "general", lang: "en" })`), none when the card has no `ask`, and never the client's "You said…"/"You wrote…" text; the upload note reads "Uploads come later. Mark what the client will send later or doesn't have." Without the option the markup is byte-for-byte 4b2's (a test pins it).
  - **`views.mjs`:** the `office-add-case` screen picks its page (ruling above): **with a case open** (`state.savedCase`), `renderAddCaseV2` when `savedCase.intakeVersion === 2` and today's `renderAddCase` when it is 1, whatever the workspace says; **with no case**, `renderAddCaseV2` when `state.workspace?.defaultIntakeVersion === 2` (or while `officeDraft`), today's page when 1, and `<p class="muted" role="status">Loading…</p>` with no form while `state.workspace` is null. **The leave dialog** (`state.dialog === "leave-add-case"`) reuses the `regenerate` confirm pattern: title "Leave without saving?", body "The answers on this page are not saved yet. If you leave now, they are lost. Nothing has been sent to the office.", `button("Leave and discard", "confirm-leave-add-case", "primary full")`, `button("Keep editing", "close-dialog", "text")`.
  - **Office case page (`renderAdminCase`)**, for a version-2 office draft (`stage === "draft"`, owner-less): Overview shows, in place of `assistedAnswersPanel`, the note "This walk-in client's answers are entered in Add a case." and "Continue in Add a case" (`data-action="continue-add-case" data-case-id`); the Intake answers tab shows Task 1's cards; version-1 office drafts keep `assistedAnswersPanel` exactly.

**Wiring (`app.mjs`):**
- **Extend the version-2 wiring to `#add-case-v2-form`:**
  - `V2_FORMS = "#intake-v2-form, #add-case-v2-form"` wherever the form itself is matched (`v2OnPage()`, `field.closest(...)` in the change handler, the sweep).
  - **The control selector spelled out per form:** `V2_CONTROLS = "#intake-v2-form [data-control][data-q], #add-case-v2-form [data-control][data-q]"` (never `` `${V2_FORMS} [data-control][data-q]` ``, whose first part would match the client form element itself).
  - **Scope from the form:** `client` for `#intake-v2-form`, `office` for `#add-case-v2-form`; `v2Answer` builds `field-${scope}-…` ids for the note, the household group's note and a longtext's count.
  - **Client form only:** the rail paint, visits, `formSubstep`.
  - **On Add a case:** `showMissing` is `state.addCaseShowMissing`; in `changeV2Field`, the `needsRedraw` call that today passes `controller.currentSubstep()` for the client form instead runs per open accordion (each `[data-substep]` body in the form: its rendered `data-q` set against `visibleIds(substepId, draft)`); the in-place updates on `input` also set, recomputed from the draft, `#add-case-count`'s text, `#add-case-send`'s `disabled` (confirmation, `busy`, `officeSaving` only) and every `add-sub-<…>-status` span's `className`/`textContent`.
- **Place and scroll:** on `office-add-case`, the "same place" key is the screen alone, so an accordion toggle, a realtime redraw and the first Save draft keep focus, caret and scroll; arriving and leaving still scroll to the top and focus `#main`. Every other screen keeps its key.
- **Actions:**
  - `toggle-add-substep`: sweep, then `controller.toggleAddSubstep(target.dataset.substep)`; focus returns to `#add-sub-<…>-toggle` by id.
  - `save-office-draft`: sweep, `await controller.saveOfficeDraft()`, then `notify("The draft is saved. Nobody was emailed.")`; nothing on `reason: "busy"`.
  - `send-office-draft`: sweep, `const { sent, reason } = await controller.saveOfficeDraft({ send: true })`: sent → `notify("The application is with the office.")`; `answers` → `notify("The draft is saved. Some answers still need attention before it can be sent.")` and focus `#add-case-count`; `unconfirmed` → `notify("Confirm that you have checked these answers with the client first.")` and focus `#field-confirmed`; `busy` → nothing.
  - `mark-card` on Add a case: 4b2's handler as is (it sweeps first and calls `controller.setDocumentCard`).
  - `continue-add-case`: `controller.openAddCase({ caseId: target.dataset.caseId })`; `open-add-case` (existing): `controller.openAddCase()`.
  - `fill-assisted-intake` on the version-2 page: sweep, then `makeSampleAnswers({ version: 2, seed, married: draft.marital_status === "married" })` and `fillBlankAnswers(draft, generated, 2)` into `editAnswers`; today's version-1 branch stays.
- **The submit event:** return early for `#add-case-v2-form` next to the `intake-v2-form` branch (implicit submission from a lone text field must never reach `reportValidity`).
- **Leaving (ruling above):** one guard, `leaveAddCaseFirst(action, target)`, called at the top of the `open-board`, `open-cases` and `open-add-case` handlers when `state.screen === "office-add-case"` (for `open-add-case` that is "pressed again while on the page"). Leaving would lose typed answers when it's a new office draft with any answered value (`Object.values(draft).some(isAnswered)`, after the sweep) or a saved draft with `state.dirty`; then `openDialog("leave-add-case", { to: action }, describeFocus(target))` and the handler stops. `confirm-leave-add-case` closes the dialog and runs the stored action's body directly, skipping the guard: `open-board` → `formDrafts.clear(); controller.navigate("staff")`; `open-cases` → `formDrafts.clear(); controller.navigate("office-cases")`; `open-add-case` → `formDrafts.clear(); controller.openAddCase()` (a fresh draft, which is what the press asked for). Otherwise each handler runs as today at once; opening and leaving creates nothing. Sign out and the persona switch leave without asking (accepted).

- [ ] **Step 1: Failing tests.**
  - `tests/office-views.test.mjs` (`renderAddCaseV2`): step sections in order without Review; the visible question sub-steps as accordions (no "Your spouse" when not married, present when married); only open ones render questions; closed ones show their summary (with `makeSampleAnswers({ version: 2 })` and all closed, `about.you`'s summary starts with the first name); the lead line on an open `income.wages`; no section intro text; "Application ID: assigned when you save" without a case and the reference with one; the materials card disabled with its note before a case and enabled for an office persona after; the Documents accordion: before a case its marks are disabled with "Save the draft first to mark documents."; with a case they're enabled; a same-day draft still shows full cards with marks; with `busy` or `officeSaving` the marks are disabled; the count with one missing answer in `about.address` reads "1 part still needs answers" and Send is **enabled** once ticked; all answered reads "Every part is answered"; Send disabled unticked and with `busy`/`officeSaving`; Save draft disabled with either flag; the confirmation box and label; `#materials-form` isn't inside `#add-case-v2-form` (the form's `</form>` comes first); no `<h1>`; the breadcrumb; a person without `admin` gets the refusal; created by from the earliest `internalHistory` actor, else "The office"; no `required`/`min`/`max`/`pattern`; each toggle `id="add-sub-<…>-toggle"`; a missing answer in `about.address` makes its status "Needs answers" (`is-needs`) open or closed, others empty; with `addCaseShowMissing: true` and `about.address` open, the missing question's note reads "Needs an answer", and with false it's empty; every household member rendered carries its hidden `member_id` control.
  - `tests/shell.test.mjs`: the leave dialog renders; with no case, `office-add-case` renders `#add-case-v2-form` with `defaultIntakeVersion: 2`, `#assisted-intake-form` with 1, and "Loading…" with no workspace; **the two mismatches:** a version-2 office draft open while the workspace is 1 renders `#add-case-v2-form`, and a version-1 case open while the workspace is 2 renders today's page; the leave guard runs for `open-board`, `open-cases` and `open-add-case` (a source pin that each handler calls `leaveAddCaseFirst`, and that `confirm-leave-add-case` dispatches on the stored `to`); the new actions have handlers.
  - `tests/client-views.test.mjs` (or wherever 4b2's card tests live): `docCard` without `office` is unchanged (pin one card's markup); with `office: true` the marks read "Later" / "Don't have", the reason line reads "Asked by: …", no "You said", and the office upload note.
  - `tests/office-views.test.mjs` also: the header's chip sits inside `.application-meta`; the Documents accordion's cards use the office wording.
  - `tests/admin-views.test.mjs`: a version-2 office draft shows "Continue in Add a case" and no `#assisted-answers-form`; a version-1 office draft is unchanged.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** CSS in the `/* Part 4c */` block: step headings, accordions, summaries, the sticky bottom bar (never covering the last control at 390px), the disabled materials and marks.
- [ ] **Step 4: Run** `npm test`, then `npm run test:browser`, which must still pass on version 1 (the story's walk-in phase uses a version-1 workspace until Task 6). Expected: PASS.
- [ ] **Step 5: Commit** ("The version-2 Add a case page by sub-step, with a Documents accordion").

---

### Task 5: Version-2 samples and the fixture option, migration 019 (no switch-over)

**Files:** Create `supabase/migrations/019_fixtures_v2.sql`, `tests/database-intake-default.mjs`; Modify `tests/support/database-fixture.mjs`, `tests/support/browser-fixture.mjs` (pass-through only; the story's value is Task 6's).

**The migration** (2026-09-30 spec §5's sample part; header comment names it, says which functions are copied from 009 and what changed, and says it changes no workspace's version; re-appliable). It seeds version-2 samples only in workspaces already set to 2, so it is safe to ship before the switch-over:
1. **`vitally_private.fixture_answers_v2(p_key text) returns jsonb`** (immutable, security definer, `search_path=''`): a base object concatenated with per-key overrides.
   - **The base** is `makeSampleAnswers({ version: 2, seed: 0 })` without its four contact fields, pasted as one `'…'::jsonb` literal. Print it with `node -e 'import("./src/sample-data.mjs").then(({makeSampleAnswers})=>{const a=makeSampleAnswers({version:2,seed:0});for(const k of ["tp_phone","sp_phone","best_contact_time","best_contact_note"])delete a[k];console.log(JSON.stringify(a))})'`. Its household members carry their `member_id`s (32 lowercase hex, fixed by the seed), which 015 requires. It has no `gcf_*` key and no `form_version`.
   - **The overrides** (the six keys of 009's `fixture_answers`, in version-2 codes):

     | key | `tp_first_name` | `tp_last_name` | `service` | `language` | `addr_zip` |
     |---|---|---|---|---|---|
     | `preparation_ready` | Mei | Chen | drop_off | mandarin | 19107 |
     | `waiting_documents` | Jordan | Rivera | drop_off | cantonese | 19123 |
     | `admin_followup` | Linh | Tran | same_day | cantonese | 19148 |
     | `review_ready` | Dana | Okafor | online | english | 19130 |
     | `corrections_required` | Wei | Lam | drop_off | mandarin | 19104 |
     | `review_approved` | Tomas | Ortiz | same_day | english | 19146 |
2. **`vitally_private.fixture_contact_v2(p_key text) returns table(phone text, best_contact_time text[], best_contact_note text)`:** phones `2155550101`–`2155550106` in `fixture_keys()` order; best time `{weekday_evening}`; note `'Fictional sample; call any weekday evening.'`.
3. **`seed_fixtures`**, from 009 verbatim except: read `select w.default_intake_version into v_version from public.workspaces w where w.id = p_workspace_id`; version 1: exactly today's insert; version 2: insert with `answers='{}'::jsonb` (011's trigger refuses anything else), then `update public.cases set answers = vitally_private.fixture_answers_v2(v_key) where id = v_case.id returning * into v_case`, then `insert into public.case_contacts(workspace_id, case_id, phone, best_contact_time, best_contact_note) select p_workspace_id, v_case.id, c.phone, c.best_contact_time, c.best_contact_note from vitally_private.fixture_contact_v2(v_key) c`, all before `apply_fixture_scenario`.
4. **`apply_fixture_scenario`**, from 009 verbatim plus, beside its other deletes and in their shape: `delete from public.case_materials where workspace_id=p_case.workspace_id and case_id=p_case.id;` and `delete from public.case_document_cards where workspace_id=p_case.workspace_id and case_id=p_case.id;` (ruling above). It keeps `case_contacts` (spec §5). (A delete here isn't published to realtime; the fixture reset already announces itself through the workspace generation.)
5. **Privileges:** repeat 009's `revoke`/`grant` lines for every function 019 redefines, and revoke the two new private functions explicitly: `revoke all on function vitally_private.fixture_answers_v2(text) from public, anon, authenticated, service_role;` and the same for `fixture_contact_v2(text)` (a new function is executable by `public` until revoked).

**The fixture option:** `createDatabaseFixture({ afterInitialize, intakeVersion = 1 } = {})` runs `update public.workspaces set default_intake_version = $2 where id = $1` on the initialization connection inside `initializeOwned`'s `afterInitialize` hook, before the caller's own hook, so it applies to both workspaces the fixture initializes. `intakeVersion` must be 1, 2 or `null` (`null` skips the update and leaves the column default; only Task 7's switch-over test uses it); anything else throws. `tests/support/browser-fixture.mjs` accepts and passes `intakeVersion` through; its default stays 1 here.

- [ ] **Step 1: Failing tests** (`tests/database-intake-default.mjs`):
  - **No switch-over here:** the column default is still 1 (`information_schema.columns`), and a workspace from `createDatabaseFixture({ intakeVersion: null })` is version 1.
  - **Fixture option:** default gives version 1 for both workspaces; `{ intakeVersion: 2 }` gives 2 for both.
  - **Privileges:** `anon` and `authenticated` can't execute `fixture_answers_v2` or `fixture_contact_v2` (`has_function_privilege`).
  - **Samples on version 2** (fixture with `intakeVersion: 2`, then a presenter reset): six samples, all `intake_version = 2`; every sample's answers pass `vitally_private.check_intake_value` field by field (top level, including `hh` with its member ids); every sample has a `case_contacts` row with its phone; `vitally_private.intake_missing(2, answers, contact)` is empty for every sample, with `contact` built exactly as SUBMIT does (copy the expression from `011_intake_v2.sql`, around line 602); no sample carries a `gcf_*` answer.
  - **Samples on version 1** (default fixture): exactly today's six (`answers->>'firstName'` Mei … Tomas).
  - **Checkpoint:** on a version-2 `preparation_ready` sample, record materials (`RECORD_MATERIALS`) and a card mark (`SET_DOCUMENT_CARD` by Sam on `photo_id.tp`), then load the `intake_ready` checkpoint: no `case_materials` and no `case_document_cards` rows remain, the `case_contacts` row stays, `intake_missing` still empty.
  - **Round trips on version 2:** a client case (create empty, two `SAVE_ANSWERS`, `SUBMIT` gets a client number); an office case (`vitally_create_case` assisted with `{}`, `SAVE_ANSWERS`, `SUBMIT`).
  - Existing database tests stay green unchanged (they run on version-1 workspaces via the fixture default). If one fails because it assumed the column default, give it `intakeVersion: 1` explicitly and list it.
- [ ] **Step 2: Run** `npm run db:migrate:test` without the migration, then `npm run test:database`. Expected: the new file FAILs.
- [ ] **Step 3: Implement** the migration and the option; apply with `npm run db:migrate:test`.
- [ ] **Step 4: Run** `npm test`, `npm run test:database`, `npm run test:auth-browser` and `npm run test:browser`. All pass (the story still runs on version 1).
- [ ] **Step 5: Commit** ("Samples follow the workspace's version; version-2 samples; checkpoint clears materials and card marks").

---

### Task 6: The browser story on version 2, screenshots and docs

**Files:** Modify `tests/browser.mjs`, `tests/support/browser-fixture.mjs` (the call passes 2), `tests/support/story-pages.mjs` (new helpers only), `docs/design/screens/`, `README.md`, `docs/design/redesign-review.md`, `docs/developer/*.md`, `docs/setup.md`.

**Rules for every item:** text goes in with `locator.fill` or `focus()` plus the keyboard, never a click into a field; a press under test is one `locator.click()`, with no retry helper between the typing and that press; wait for quiet before setting a marker. Keep every existing assertion that still describes shipped behaviour; move a version-1-only assertion into the version-1 phase (item 6) rather than delete it. List every moved, changed or removed assertion in the report. Draft-PDF checks stay Chrome-client only (as 4b2's).

- [ ] **Step 1: The story's workspace is version 2.** `browser.mjs`'s fixture call passes `intakeVersion: 2` (Task 5's option), so the samples are version 2 — without the switch-over, which stays held (Task 7).
  1. "the presenter's reset leaves exactly the six seeded cases": unchanged; also check one sample's `intake_version` is 2.
  - **Leave check on Add a case:** besides Cancel, the sidebar's "All cases" (a second press on "Add a case" is not reachable, as that button isn't shown on the page) also shows "Leave without saving?" when the draft has answers; "Keep editing" keeps them.
  2. **"a new application is submitted and reaches the staff board"** on the version-2 form: add `fillIntakeV2ToSubmit(page)` (continue-intake, Fill fictional details, then rail jumps to `review.check`, check the alerts block is empty, then `review.submit`, tick, Submit with `act(client, "SUBMIT", { badge: "Received" })`); keep the client-number checks. Keep `fillIntakeToReview` (the version-1 walk) for item 6. On the way, on `about.marital` choose married and check "Your spouse" appears in the rail (a show-if), press Fill fictional details again (the spouse answers fill), and flip the senior switch and back (a wording change). The phase's screenshot is `intake-v2-review-check` taken before Submit.
  3. **Staff read version-2 answers, the contact card (D5), the checklist and the draft.** In the preparation phase, before Alex claims: the Intake answers tab shows "What the client told us", a step heading and a sub-step heading, "Wording used: Standard", no phone digits (`/\(215\) 555-01\d\d/` absent from `#app`), the D5 sentence, and no "View Draft 13614-C"; after the claim: the phone, the best time and the draft buttons. Alex saves materials (`locator.check()` on two labelled boxes, one click on "Save materials"; "Recorded by Alex"), then "Edit best time": tick `weekend`, save, and the card shows it (query `case_contacts`). Then as Sam on the same case's Documents tab: the checklist shows; "Move to Needed" on the sample child's SSN card (`ssn.hh.<that member's id>`, Maybe needed) turns it "Needed (moved up by the office)" (query `case_document_cards.group_override`), "Move to Maybe needed" undoes it; "Don't have" on `photo_id.tp` (always present) shows "Don't have". Pick cards from `cardsFor` on the sample's answers, never assume a trigger answer the sample may not have. In the Chrome-client permutation, "View Draft 13614-C" opens a popup whose blob is a PDF (`%PDF-`, > 100 KB); the sample names are ASCII, so no font is fetched (assert no request to `cdn.jsdelivr.net`).
  4. **Offline retry** on the version-2 form: continue-intake, Fill on `before.ready`, Continue while online (the recorded first save), then rail-jump to `about.address` (a visits save, also online), and take the receipt count after that last online save; change `addr_city` (as today's phase edits a city) and go offline; Continue is the save that goes offline and is retried as the same action. Keep every assertion about the same action id and the receipts.
  5. **Two windows**: both windows on `about.address`, each changes `addr_city`; the conflict panel lists the city row with its wording, and "Keep my edits" keeps the window's value on the server. Version-1-only checks move to item 6.
  6. **A new phase "a version-1 draft still finishes in the old form"**, after "reset rebuilds the samples…" and before 4b2's version-2 phase: set the workspace to 1, start an application with applicant A, set it back to 2 in `finally`; check `intake_version` is 1; walk the old four-step form keeping the moved checks (a blank required answer stops step 1, field `service`; `other = yes` stops it with `OUT_OF_SCOPE_NOTICE`, then is changed back); fill, reach "Check your answers", tick and Submit.
  7. **"the office takes in a walk-in client's application and its document"** on the version-2 Add a case:
     - Add a case shows `#add-case-v2-form` and "Application ID: assigned when you save"; the materials card and the Documents accordion's marks are disabled with their notes;
     - Fill fictional details, open `about.you` and check `field-office-tp_first_name` has a value;
     - the leave confirm: click Cancel once; "Leave without saving?" shows; "Keep editing" closes it, the value is still there, and no case was created (`workspaceCaseCount` unchanged);
     - **Save draft** with today's `pressUntilEffect`, `safeToRepeat` checking the workspace's case count grew by at most one; afterwards a case exists (by the reference in the header) with `owner_user_id` null, `intake_version` 2, saved answers and an empty `intake_visited`;
     - the materials card is enabled: tick one item and save; open Documents and mark one card "Later" (the office wording; query `case_document_cards`);
     - Send is disabled before `#field-confirmed`; tick it and Send is enabled;
     - open `about.you`, `fill("not-an-email")` on `field-office-email` and `fill("")` on `field-office-tp_last_name`; Send is still enabled and the last name's note is empty; one click on Send: the stage is still draft and the answers are saved; the count mentions a part and `about.you`'s status reads "Needs answers"; the last name's note reads "Needs an answer"; the email's note reads "Enter a valid email address."; the keyboard is on `#add-case-count`;
     - fix both (`fill("walkin@example.com")`, `fill("Rivera")`), one click on Send: the stage is `received`, the page is the case page, and the office board shows the case as today; keep today's document-taken-in and board assertions that follow.
  8. **4b2's version-2 phase:** it no longer switches the workspace (it is already 2): remove its set-to-2 and its `finally` set-to-1; everything else stays.
  9. Later phases stay, apart from version-2 sample facts they read (list each).
- [ ] **Step 2: Run** `npm run db:migrate:test`, `npm test`, `npm run test:database`, `npm run test:auth-browser` and `npm run test:browser`, in the foreground (up to 10 minutes each), output to the scratchpad. All pass. ("Synthetic Auth provisioning failed" is test-user setup: re-run once and report both runs.)
- [ ] **Step 3: Screenshots** (the story's 720px shots, fictional data, looked at first) into `docs/design/screens/`: `implemented-staff-answers-v2.png` (the Intake answers tab with the three cards, claimed), `implemented-staff-contact-hidden.png` (unclaimed), `implemented-staff-doc-checklist.png`, `implemented-add-case-v2.png` (accordions, one open, side column), `implemented-add-case-v2-saved.png`.
- [ ] **Step 4: Docs.** README's part-4 row: 4c done ("staff version-2 answers by sub-step, contact, materials and the document checklist; the version-2 Add a case; version 2 ready, switch-over held for the wording review"); `docs/design/redesign-review.md` status (4b2 merged, 4c in review); `docs/developer/database.md` and `docs/setup.md` gain `018_document_card_authority.sql` and `019_fixtures_v2.sql` (migration counts 19), the card authority (works on the case) and the version-2 samples; `docs/developer/frontend.md` the Add a case and staff views; `docs/setup.md`'s recorded suite counts.
- [ ] **Step 5: Commit** ("The story runs on version 2; staff, Add a case and a version-1 check; screenshots and docs").

---

### Task 7 (HELD): The switch-over, migration 020 — its own PR after the group's wording review

**Do not execute this task with Tasks 1–6.** Run it only when the user confirms the group's review of the new English wording (4b2's and 4c's; memory `intake-4b2-carry-forwards`) is done. It ships as its own small PR.

**Files:** Create `supabase/migrations/020_intake_v2_default.sql`; Modify `tests/database-intake-default.mjs`, `README.md`, `docs/design/redesign-review.md`, `docs/developer/database.md`, `docs/setup.md`.

**The migration** (2026-09-30 spec §5's default part; header comment names it; re-appliable): `alter table public.workspaces alter column default_intake_version set default 2;` and `update public.workspaces set default_intake_version = 2;`. Nothing else: the samples already follow each workspace's version (019).

- [ ] **Step 1: Failing tests** (`tests/database-intake-default.mjs`): replace Task 5's "No switch-over here" case with: the column default is 2; a workspace from `createDatabaseFixture({ intakeVersion: null })` is version 2 and a client case created in it is version 2; an existing version-1 case keeps version 1 after an update; a reset in that workspace seeds version-2 samples.
- [ ] **Step 2: Run** `npm run test:database`. Expected: FAIL.
- [ ] **Step 3: Implement** the migration; `npm run db:migrate:test`.
- [ ] **Step 4: Run** `npm test`, `npm run test:database`, `npm run test:auth-browser`, `npm run test:browser`. All pass (the story already runs on version 2 through the fixture option).
- [ ] **Step 5: Docs:** README "version 2 is the default"; `redesign-review.md` status; migration counts 20.
- [ ] **Step 6: Commit** ("Switch-over: version 2 is the default"), push, and open its PR.

---

## Self-review notes (for the executor)

- **Spec coverage:** 2026-09-30 §4.1 answers, contact and materials → Task 1; §4.2 Add a case → Tasks 3–4; §4.3 eligibility → Tasks 1–2; §4.4 scope → Global Constraints; §5 samples → Task 5, §5 default → Task 7 (held); §6 tests → every task. 2026-10-04 §10 (by step and sub-step, cards with moves, the draft, "Not sure", Add a case by sub-step with Documents, member ids, option a, switch-over last) → Tasks 1–5; §6.7 → Tasks 2 and 4; §7.4 → Task 2; §3.7 (office never sends visits) → Task 3's test.
- **Names across tasks:** `answersPanel`, `answersPanelV1`, `answersPanelV2`, `contactCard`, `materialsCard`, `formValuesWithLists` (Task 1); `documentChecklist`, `markDocumentCard`, `moveDocumentCard`, `move-card` (Task 2); `openAddCase`, `saveOfficeDraft`, `toggleAddSubstep`, `enterOfficeDraftIfNeeded`, `officeDraft`, `officeDraftCaseId`, `officeSaving`, `openAddSubsteps`, `addCaseShowMissing`, `defaultIntakeVersion` (Task 3); `renderAddCaseV2`, `docCard` export, `toggle-add-substep`, `save-office-draft`, `send-office-draft`, `continue-add-case`, `confirm-leave-add-case`, `#add-case-v2-form`, `#add-case-count`, `#add-case-send`, `add-sub-<id>-toggle|status|body` (Task 4); `018_document_card_authority.sql` (Task 2); `019_fixtures_v2.sql`, `fixture_answers_v2`, `fixture_contact_v2`, `intakeVersion` fixture option (Task 5); `leaveAddCaseFirst`, `docCard(card, { office })` (Task 4); `020_intake_v2_default.sql` (Task 7, held).
