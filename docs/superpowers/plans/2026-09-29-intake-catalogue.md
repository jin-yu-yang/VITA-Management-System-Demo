# Part 4a: Intake catalogue and server side, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The version-2 intake exists as data and server rules, but nothing is visible yet:
- the two drafts are normalized;
- a build turns them into `intake-catalogue-data.mjs` and catalogue migrations;
- the server stores and checks version-2 answers, contacts and materials;
- the browser can read all of it.

New cases stay version 1.

**Architecture:**
- `tools/build-intake-catalogue.mjs` parses the drafts. It writes `src/intake-catalogue-data.mjs`, and, when the catalogue's hash has changed, the next `NNN_intake_catalogue_<hash8>.sql`, which calls a loader.
- **Migrations:**
  - `011_intake_v2.sql` adds the schema, the version triggers, the field table and its loader, `case_contacts`, and version-2 `SAVE_ANSWERS` / `SUBMIT` checks, via `check_related` and `act_submit`.
  - `012_intake_catalogue_<hash8>.sql` is the first generated load.
  - `013_contact_materials.sql` adds `case_materials` and the `UPDATE_CONTACT` / `RECORD_MATERIALS` actions.
- **Browser:** `src/intake-catalogue.mjs` reads the JSON. The store maps the new data, and the boards display service and language through label lookups.

**Tech Stack:**
- Node ES modules; the build script has no dependencies.
- PL/pgSQL migrations applied by `tools/admin/migrate.mjs`.
- `node:test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-intake-catalogue-design.md` (all of it).

## Global Constraints

- **Drafts:** `docs/intake-questions/intake-questions.md` (standard) and `intake-questions-senior-v2.md` (senior).
  - **Wording never changes** in the rewrite, except the new Q0.2–Q0.4 and the `Q6.G` group heading.
  - **The grammar** is spec §2.2, exactly.
  - **Required flags follow spec §2.2's list.** Optional: `tp_middle_name`, `email`, `best_contact_time`, `best_contact_note`, `addr_apt`, `sp_middle_name`, `sp_phone`, `additional_notes`, all of Section 12, the Form 15080 consent and its signature and date fields, `inc_wages_job_count`, `refund_method_other`, `inc_other_desc`, `evt_other_desc`, `irs_language`, `language_other`. Everything else is Required (required when shown).
- **New questions (spec §2.2):**
  - `service`: `same_day` / `drop_off` / `online`.
  - `language`: `english` / `cantonese` / `mandarin` / `other`.
  - `language_other`: text, optional, shown if `language = other`.
  - Values are codes. Labels come from `serviceLabel()` / `languageLabel()`.
- **Types and limits (spec §2.2):**
  - `text` 200, `longtext` 5,000, `signature` 200, `email` 254.
  - `phone` 10 digits, `zip` 5 digits, `date` `YYYY-MM-DD`, `year` 4 digits, `number` ≤ 6 digits or a declared range.
  - `choice`, `multi`, `who`, `yesno` (+`not_sure` if listed), and `group` (≤ 10 members).
  - The whole answers value ≤ 64 KB.
- **No screening in version 2:** version 2 never refuses on the client's situation. Version 1 is untouched.
- **Contacts:** `tp_phone`, `sp_phone`, `best_contact_time` and `best_contact_note` live in `case_contacts`, never in `answers`.
  - `UPDATE_CONTACT` edits only best time and note. It's allowed for the owner on their own draft, for office staff (`followup` or `admin` capability) on any case, and for a volunteer only on a case where they are `preparer_id` or `reviewer_id`.
- **Materials:** staff only. `RECORD_MATERIALS` payload `{ received: string[] }` replaces the set. The items are `photo_id`, `ssn_itin`, `green_card`, `birth_certificate`, `w2`, `1099nec`, `1099misc`, `1099int`, `1098t`, `1095a`, `prior_year_1040`.
- **Nothing visible changes:** `workspaces.default_intake_version` stays 1, and every version-1 path and screen is unchanged.
- **Migrations:** they are applied by the migrator, which refuses a changed applied file. Write every migration re-apply-safe:
  - `if not exists`, `create or replace`, `drop … if exists` then `add`;
  - drop table-returning functions before recreating them.

  To re-apply a changed file on the local test stack only:
  1. Find the container: `docker ps --format '{{.Names}}' | grep supabase_db_vitally-task2`.
  2. `docker exec <db container> psql -U postgres -c "delete from vitally_private.schema_migrations where name='<file>'"`
  3. `npm run db:migrate:test`.

  Never edit migrations 001–010.
- **One catalogue migration per branch.** Only migrations on `main` are immutable. If the drafts change on this branch after `012_intake_catalogue_*.sql` was generated (for example, in a fix round):
  1. Delete that file.
  2. Forget it on the local test stack (the recipe above, with its name).
  3. Re-run `npm run build:intake`, which regenerates it as 012 with the new hash.
  4. Re-apply.

  Never let the build write a second catalogue migration on this branch: it would take number 013 and collide with `013_contact_materials.sql`.
- **Replacing an existing function** (`check_related`, `act_submit`, `check_operation_authority`, `check_authority`, `check_payload`, `vitally_apply_action`): copy its **latest** definition verbatim and change only the lines the task names. Find the latest one with `grep -n "function vitally_private.<name>\|function public.<name>" supabase/migrations/*.sql`, taking the highest-numbered file.
- **New public tables follow 002's conventions exactly:**
  - a `workspace_id` column, with `foreign key (workspace_id, case_id) references public.cases(workspace_id, id) on delete cascade`;
  - RLS enabled;
  - `grant select … to authenticated` and `grant select, insert, update, delete … to service_role`;
  - a select policy copied verbatim from 002 with only the table name changed. `case_contacts` copies `visible_document_requests` (the client-visible template). `case_materials` copies `presenter_admin_followups` (the presenter-only template).

  So a presenter never sees the contact row of an applicant's own unsent draft, just as with the other workflow tables.
- **New tables join the realtime publication** in the migration that creates them, with 007's `if not exists … alter publication supabase_realtime add table` pattern. They also join `SUBSCRIBED_TABLES` in `src/supabase-store.mjs`: `case_contacts` in `CLIENT_TABLES`, `case_materials` in `STAFF_TABLES`. `tests/database-store.mjs` ("the Realtime publication is exactly what the adapter watches") requires both.
- **New tables join the table lists in `tests/database.mjs`:** `case_contacts` in `CLIENT_VISIBLE_TABLES` (Task 3) and `case_materials` in `PRESENTER_ONLY_TABLES` (Task 4). Their existing RLS, grant and visibility checks then cover the new tables. Those checks create rows only for their own fixture cases, so read what each loop expects, and seed a `case_contacts` or `case_materials` row for the fixture cases they use if needed.
- **Test stack:** the Docker Supabase `vitally-task2.M5anE7XP` on 54321 (`.env.test`). If it's down, start it with `docker start $(docker ps -aq --filter name=vitally-task2)`. Never run `npx supabase start` from the repo root.
- **Shell PATH:** prefix node, npm and docker commands with `PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`.
- **Test imports:** a test file that imports a name its module doesn't export fails to load as a whole, and that is the expected RED when a step adds such an import.
- Only fictional data. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Out of scope:**
- Any screen for version 2 (4b and 4c).
- Version-2 sample answers (4b).
- Appendix A's volunteer-only fields (4c).
- Phone masking (part 5).
- Chinese on screen (4d).

---

## File map

| File | Change |
|---|---|
| `docs/intake-questions/*.md` | Normalized to the grammar; Q0.2–Q0.4; required flags; `Q6.G` |
| `tools/build-intake-catalogue.mjs` (new) | Parser, catalogue JSON, catalogue migration writer |
| `src/intake-catalogue-data.mjs` (new, generated) | The catalogue, as `export default {…}` |
| `src/intake-catalogue.mjs` (new) | Reader: steps, questions, wording, visibility, value checks, missing-to-submit, labels |
| `supabase/migrations/011_intake_v2.sql` (new) | Versions, `intake_fields`, loader, `case_contacts`, version-2 save/submit |
| `supabase/migrations/012_intake_catalogue_<hash8>.sql` (new, generated) | First catalogue load |
| `supabase/migrations/013_contact_materials.sql` (new) | `case_materials`, `UPDATE_CONTACT`, `RECORD_MATERIALS` |
| `src/supabase-store.mjs`, `src/contracts.mjs`, `src/case-actions.mjs` | Map `intakeVersion`, `contact`, `materials`; the two actions |
| `src/staff-views.mjs`, `src/office-views.mjs`, `src/pool-views.mjs` | Service and language shown and filtered through the label lookups |
| `package.json` | `"build:intake": "node tools/build-intake-catalogue.mjs"` |
| `docs/setup.md` | §4 Migrations: thirteen, and the catalogue-migration rule |
| Tests | `tests/intake-catalogue.test.mjs`, `tests/intake-build.test.mjs` (new); `tests/database-intake.mjs` (new); updates to `tests/store.test.mjs`, `tests/case-actions.test.mjs`, board tests |

---

### Task 1: Normalize the drafts and build the catalogue

**Files:**
- Modify: both drafts.
- Create: `tools/build-intake-catalogue.mjs`, `src/intake-catalogue-data.mjs`, `tests/intake-build.test.mjs`.
- Modify: `package.json`.

**Interfaces:**
- **Produces** `tools/build-intake-catalogue.mjs`, which exports:
  - `parseDraft(markdownText, { role: "standard" | "senior" })` → `{ sections: [...] }`. It throws `Error("<file>:<line>: <reason>")` on anything outside the grammar.
  - `buildCatalogue(standardText, seniorText)` → the catalogue object (spec §2.4 shape, `version: 2`). It throws if the two drafts differ in IDs, types, options, required flags or show-if rules.
  - `catalogueHash(catalogue)` → the SHA-256 hex of the canonical JSON: keys sorted, no whitespace.
  - `nextCatalogueMigration(catalogue, migrationsDirEntries)` → `null` if the newest `NNN_intake_catalogue_*.sql` records the same hash; otherwise `{ name, text }`.
    - `name` is the next three-digit number after the highest migration, then `_intake_catalogue_<first 8 hex>.sql`.
    - `text` holds `-- catalogue-hash: <full hash>` and `select vitally_private.load_intake_catalogue(2, '<json with single quotes doubled>'::jsonb);`.
  - A CLI (`node tools/build-intake-catalogue.mjs`) that writes `src/intake-catalogue-data.mjs` as `// Generated by tools/build-intake-catalogue.mjs from docs/intake-questions — do not edit.\nexport default <pretty two-space JSON>;\n` and, only if `nextCatalogueMigration` is non-null **and** `supabase/migrations/011_intake_v2.sql` exists, writes the migration. Otherwise it prints what it would write.
- **The catalogue shape** is spec §2.4, plus:
  - each question also carries `showIf` parsed to `[{ field, op: "eq" | "ne" | "filled", value? }]`, an AND list;
  - `number` questions carry `min` / `max`;
  - `group` questions carry `fields: [question…]`, and their IDs are the bare names (`first_name`);
  - the top level carries `materials: [{ id, label: { en, zh } }]`, the spec §3.5 list with English and Chinese labels (for example `photo_id` "Photo ID" / "带照片身份证件").

- [ ] **Step 1: Read both drafts end to end.** List every line that falls outside spec §2.2's grammar. Expect at least:
  - the type lines the spec names;
  - options written inline as `Label (中文)`;
  - `hh[i].*` fields;
  - the "Repeatable group" note;
  - "Number 0–12";
  - show-if lines inside `>` notes;
  - the `form_version` line ("Default `general`").

  Record the list in your report.
- [ ] **Step 2: Write the failing build tests** in `tests/intake-build.test.mjs`:
  - **Fixture drafts.** A small standard + senior pair written inline in the test, with one question per type, a group, a show-if with `=`, `≠`, `is filled` and `AND`, and a tip with a condition.
    - `buildCatalogue` produces the expected JSON (write it out literally for a few questions).
    - `parseDraft` rejects an unknown type, a missing Required/Optional flag, a show-if naming an unknown field, and a show-if value not among the field's options, each with a `file:line` message.
  - **Drift between drafts.** Changing one option value in the senior fixture makes `buildCatalogue` throw with the field ID.
  - **The real drafts.**
    - `buildCatalogue(readFile(standard), readFile(senior))` deep-equals the default export of the committed `src/intake-catalogue-data.mjs` (import it).
    - The catalogue has 9 steps with the spec §2.3 section mapping.
    - Every question has `required` true or false.
    - The optional set equals the Global Constraints list; compute it from the catalogue and compare as a sorted array.
    - `service`, `language` and `language_other` exist with the listed values.
    - `form_version` is optional with options `general`, `senior`.
    - `hh` is a group with fields including `first_name`, `last_name`, `dob`, `relationship`, `months_lived` (`min` 0, `max` 12).
    - `tp_phone` and `sp_phone` have type `phone`.
  - **Migration writer.**
    - `nextCatalogueMigration(cat, ["011_intake_v2.sql"])` names `012_intake_catalogue_<hash8>.sql`.
    - With an entry whose text records the same hash, it returns `null`.
    - With a different recorded hash, it names the next number.
    - Its `text` round-trips: extract the JSON literal, un-double the quotes, `JSON.parse`, and it deep-equals the catalogue.
- [ ] **Step 3: Run them to confirm they fail.** `node --test tests/intake-build.test.mjs`. Expected: the whole file fails to load (module missing).
- [ ] **Step 4: Rewrite both drafts** to the grammar:
  - Keep every English and Chinese wording.
  - Give inline options snake_case values; for example Q6.3's `son_daughter`, `stepchild`, `foster_child`, `grandchild`, `sibling`, `niece_nephew`, `parent`, `grandparent`, `other_relative`, `none`.
  - Write `Required` / `Optional` on every ID line per the Global Constraints list.
  - Add Q0.2–Q0.4 (spec §2.2 wording; the senior draft gets the same wording).
  - Turn the household note into `**Q6.G** People in your household / 家庭成员`, `` `hh` · Group · Required ``, `**Show if** \`has_household_members = yes\``.
  - Keep `> Note for developers` lines.
  - Commit the drafts on their own first (`git commit -m "Normalize the intake drafts to the catalogue grammar"`), so the wording-only diff is easy to review.
- [ ] **Step 5: Write the build script.**
  - Parse line by line with a small state machine: section → question → attribute lines.
  - Normalize the date type to `date` and store dates as `YYYY-MM-DD`; "auto-fill today" is only a tip for 4b.
  - Map `Who (multi-select)` to `who`, and `Yes / No / Not sure` to `yesno` with `not_sure`.
  - Canonical JSON for the hash: recursively sort object keys, then `JSON.stringify` with no spacing.
  - Wire the CLI, and add `"build:intake"` to `package.json`.
- [ ] **Step 6: Generate and run.** `npm run build:intake` writes `intake-catalogue-data.mjs`; no migration yet, because 011 doesn't exist. Then `node --test tests/intake-build.test.mjs` and `npm test`. Expected: PASS.
- [ ] **Step 7: Commit.**
  ```bash
  git add tools/build-intake-catalogue.mjs src/intake-catalogue-data.mjs tests/intake-build.test.mjs package.json
  git commit -m "Build the intake catalogue from the drafts

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```

---

### Task 2: The catalogue reader and the service/language labels

**Files:**
- Create: `src/intake-catalogue.mjs`, `tests/intake-catalogue.test.mjs`.
- Modify: `src/staff-views.mjs`, `src/office-views.mjs`, `src/pool-views.mjs`, and their tests.

**Interfaces:**
- **Consumes:** `src/intake-catalogue-data.mjs` (Task 1), with `import CATALOGUE_DATA from "./intake-catalogue-data.mjs";`.
  - The files are flat under `src/` and plain `.mjs`, because the local server (`server.mjs`) serves only `/src/<name>.(mjs|css|svg|png)`. Don't change that allowlist.
- **Produces** from `src/intake-catalogue.mjs`:
  - `CATALOGUE` (the object).
  - `stepsFor(version)` → steps, or `[]` for version 1.
  - `questionsFor(version, step)`.
  - `findQuestion(version, id)`.
  - `wording(question, { variant = "general", lang = "en" } = {})` → string.
  - `isVisible(question, answers)`:
    - `eq`: for a string value, equal; for an array value, contains.
    - `ne`: answered **and** (string ≠, or array doesn't contain).
    - `filled`: non-empty string or non-empty array.
  - `checkValue(question, value)` → `null` or a short reason, per the Global Constraints types.
    - Contact fields are checked the same way.
    - For a group, it checks each member's keys against `fields` and each value by its field.
  - `missingToSubmit(version, answers, contact = {})` → the IDs of required, visible, unanswered questions.
    - The contact fields are read from `contact`.
    - For a group, each member's required fields count, reported as `hh[0].dob`.
  - `serviceLabel(value)` and `languageLabel(value)`: version-2 codes → English label ("Drop-off", "Cantonese"); a version-1 label passes through unchanged ("Drop-off" → "Drop-off"); unknown → the value itself.
  - `MATERIALS_ITEMS` (from the JSON).

- [ ] **Step 1: Failing tests** in `tests/intake-catalogue.test.mjs`:
  - `stepsFor(2).length === 9` and `stepsFor(1)` is `[]`.
  - `wording` returns different text for `general` and `senior` on a question whose wordings differ. Find one in the catalogue in the test rather than hard-coding it.
  - `isVisible` covers `eq`, `ne` (unanswered → hidden), `filled`, array fields, and `AND`.
  - `checkValue`: for each type, one valid and one invalid value.
    - Include `longtext` at 5,000 characters (ok) and 5,001 (reason).
    - `text` at 200 and 201.
    - `phone` "(215) 555-0100" (ok, 10 digits) and "555-0100" (reason).
    - `date` "2025-02-30" (reason).
    - `who` `["none", "me"]` (reason).
    - `months_lived` 13 (reason).
    - A group member with an unknown key (reason), and 11 members (reason).
  - `missingToSubmit(2, {})` includes `service`, `language`, `tp_first_name`, `tp_phone`, and does not include `tp_middle_name` or `form_version`.
  - A married answer set makes the spouse questions required; a single one doesn't.
  - A household member missing `dob` yields `hh[0].dob`.
  - `serviceLabel("drop_off") === "Drop-off"`, `serviceLabel("Drop-off") === "Drop-off"`, and `languageLabel("cantonese") === "Cantonese"`.
  - In the board test files: a version-2 case (`answers.service = "drop_off"`) and a version-1 case (`"Drop-off"`) both show "Drop-off". The service filter groups them under one chip.
- [ ] **Step 2: Run to confirm they fail.** The file fails to load; the board assertions fail.
- [ ] **Step 3: Implement** `src/intake-catalogue.mjs`. Then, in the board (`staff-views.mjs`), queue (`office-views.mjs`) and pool (`pool-views.mjs`):
  - display service and language through `serviceLabel` / `languageLabel`;
  - build filter options from the labels;
  - match the filter against the record's label.

  A saved filter value from before is a label, which still matches. Keep every filter key and hook unchanged.
- [ ] **Step 4: Run** the focused tests, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** ("Read the intake catalogue; label service and language for both versions").

---

### Task 3: Migration 011 and the first catalogue load

**Files:**
- Create: `supabase/migrations/011_intake_v2.sql`, the generated `supabase/migrations/012_intake_catalogue_<hash8>.sql`, `tests/database-intake.mjs`.
- Modify: `docs/setup.md`.

**Interfaces:**
- **Produces:**
  - `cases.intake_version` and `workspaces.default_intake_version`.
  - `vitally_private.intake_fields(version, field_id, type, options text[], max_length int, min_value int, max_value int, required_to_submit bool, show_if jsonb, step smallint, group_id text, sensitive bool)`. A group sub-field's `field_id` is `"<group>.<name>"` (`hh.dob`), with `group_id` `"hh"`.
  - `vitally_private.load_intake_catalogue(smallint, jsonb)`.
  - `vitally_private.check_intake_value(vitally_private.intake_fields, jsonb) returns boolean`.
  - `public.case_contacts`.
  - Version-2 behaviour of `SAVE_ANSWERS` and `SUBMIT`.

- [ ] **Step 1: Failing database tests** in `tests/database-intake.mjs`. Use `createDatabaseFixture` and `f.act` like `tests/database-client-numbers.mjs`.
  - **Making a version-2 case.** `update public.workspaces set default_intake_version=2 where id=$1` via `f.sql`, create a case, and set the default back to 1 in `finally`.
  - **Version.**
    - A new case in a default-1 workspace has `intake_version` 1, and a default-2 workspace gives 2.
    - `update public.cases set intake_version=…` is refused.
    - A sample reset with the default at 1 gives version-1 samples.
  - **Version 1 is unchanged.** One save and submit round trip with `makeSampleAnswers()` succeeds exactly as today.
  - **Version-2 `SAVE_ANSWERS`:**
    - These are refused `VALIDATION`:
      - an unknown key (`firstName`, a version-1 key);
      - a bad value for each type: text over 200, longtext over 5,000, a bad choice, a bad date, `who` `["none","me"]`, `months_lived` 13 inside a group member, a group member with an unknown key, 11 group members;
      - (the 64 KB cap is tested directly, below, because valid answers can't reach it through `SAVE_ANSWERS`: every field has a length limit and the household holds at most 10 people.)
    - A valid structured set is stored exactly, with `null` clearing a key.
    - **The size cap:** `select vitally_private.answers_within_limit($1::jsonb)` is true for a realistic full answer set and false for a 70,000-character object (`{"x": "<70000 chars>"}`).
    - `tp_phone` and `best_contact_time` in a save land in `case_contacts` (`phone`, `best_contact_time`) and are absent from `answers`.
    - Phones are stored as 10 digits.
  - **Version-2 `SUBMIT`:**
    - An empty case is refused.
    - A complete case, built from the catalogue's required, visible questions, submits and gets a client number. Use a helper that fills every required, visible field with a valid value: single, no household, `inc_self_employed = yes`.
    - Hiding a required field via its show-if (not married) doesn't block.
    - A missing `hh[0].dob` blocks.
  - **Contacts visibility.**
    - Applicant A reads their own `case_contacts` row; applicant B reads none.
    - The presenter reads it once the case is submitted, or on an assisted case, but not on A's unsent draft (002's rule).
  - **Drift.** The `intake_fields` rows for version 2 equal the catalogue's fields: IDs, types, options, `required_to_submit`, `show_if`, `step`, `group_id`. Build the expected set from `src/intake-catalogue-data.mjs` in the test.
- [ ] **Step 2: Run to confirm they fail.** Columns and functions are missing.
- [ ] **Step 3: Write `011_intake_v2.sql`.** Keep it re-apply-safe.
  1. **Version columns** with their checks. A `before insert` trigger on `public.cases` sets `new.intake_version` from the workspace's default. A `before update` trigger raises `VALIDATION` if `intake_version` changes. Keep it separate from 010's `cases_client_number` trigger.
  2. **`vitally_private.intake_fields`**, as in the interfaces above, with no grants.
  3. **`vitally_private.load_intake_catalogue(p_version smallint, p_catalogue jsonb)`:**
     - Delete that version's rows, then insert one row per question, and one per group sub-field.
     - `required_to_submit` is the question's `required`.
     - `max_length` comes from the type table.
     - `show_if` is the question's parsed list.
     - `sensitive` is `type = 'phone'`.
     - Raise `VALIDATION` if the JSON lacks `steps`.
  4. **`vitally_private.check_intake_value(field, value)`** implements the Global Constraints types. It returns false on any mismatch. For `group` it checks the array length and, per member, every key against `intake_fields` rows with that `group_id`, and each value recursively.
  5. **`vitally_private.intake_visible(p_version, p_field_id, p_answers, p_contact jsonb)`** evaluates `show_if` with the Task 2 semantics.
  6. **`public.case_contacts`** (spec §3.4, including `spouse_phone`):
     - It follows the Global Constraints table conventions: composite FK, RLS, grants, and the `visible_document_requests` policy copied with the name changed.
     - Add it to the realtime publication, and add `case_contacts` to `CLIENT_VISIBLE_TABLES` in `tests/database.mjs`.
  7. **The answer checks move to `check_related`,** because `check_payload` is `immutable` and doesn't know the case, so it can't read `intake_fields` or tell the versions apart.
     - **Replace `check_payload`** (latest, 006). Change only its `SAVE_ANSWERS` branch: keep `payload_keys = ['answers']` and `answers` must be an object, and remove the per-key conditions.
     - **Replace `check_related`** (latest, 004) and add a `SAVE_ANSWERS` branch at its start. It runs right after `check_payload`, before any handler.
       - **Version 1:** the conditions removed from `check_payload`, verbatim: every key in `intake_answer_keys()`, a string value, ≤ 1000 characters.
       - **Version 2:** each key must be a top-level version-2 field (`group_id is null`), and `check_intake_value` must be true, or the value `null` to clear.
       - Either way, raise `VALIDATION`.
     - A version-1 case with a bad key still gets `VALIDATION`, before any stage check, so the existing check-order tests keep passing. Say so in your report, with the test that shows it.
  8. **`act_save_answers`: replace it** (latest, 003).
     - A version-1 case stays exactly as today.
     - A version-2 case:
       - splits the contact keys (`tp_phone`, `sp_phone`, `best_contact_time`, `best_contact_note`) into `insert … on conflict (case_id) do update` on `case_contacts`, storing phones as their 10 digits;
       - merges the rest into `answers`, removing keys whose value is `null`;
       - raises `VALIDATION` unless `vitally_private.answers_within_limit(new answers)`. That's a new function in 011, `octet_length(p_answers::text) <= 65536`, which measures the stored text rather than `pg_column_size`, which can report a compressed size.
     - Its history detail still lists the saved field keys.
  9. **`act_submit`: replace it** (latest, 010).
     - Version 1 stays byte-identical in its branch.
     - Version 2 checks every `required_to_submit`, top-level field whose `intake_visible` is true for presence, answers or contacts.
     - For the `hh` group, when it's visible, it checks each member's required sub-fields. Raise `VALIDATION` if anything is missing.
     - There is no screening. Then comes the same stage update and `returning client_number` as 010.
  10. Finish with 010's final blanket revoke.
- [ ] **Step 4: Generate 012.** `npm run build:intake` now finds 011 and writes `012_intake_catalogue_<hash8>.sql`. Apply with `npm run db:migrate:test`.
- [ ] **Step 5: Run.** `node --env-file=.env.test --test tests/database-intake.mjs`, then the whole `npm run test:database` and `npm test`. Expected: PASS, and the existing database tests are unchanged.
- [ ] **Step 6: Update `docs/setup.md` §4.** Say thirteen migrations (after Task 4) and describe 011–013, plus the rule: "Catalogue changes ship as a new `NNN_intake_catalogue_*.sql` written by `npm run build:intake`; never edit an applied one."
- [ ] **Step 7: Commit** ("Store and check version-2 intake answers").

---

### Task 4: Migration 013, the two actions, and the browser mapping

**Files:**
- Create: `supabase/migrations/013_contact_materials.sql`.
- Modify: `src/supabase-store.mjs`, `src/contracts.mjs`, `src/case-actions.mjs`, `tests/database-intake.mjs`, `tests/store.test.mjs`, `tests/case-actions.test.mjs`, and any test pinning `CASE_ACTIONS` (`grep -rln CASE_ACTIONS tests/`).

**Interfaces:**
- **Produces:**
  - `public.case_materials` and `vitally_private.materials_items()`.
  - The case actions `UPDATE_CONTACT` (payload `{ bestContactTime?: string[], bestContactNote?: string }`, at least one key) and `RECORD_MATERIALS` (payload `{ received: string[] }`).
  - Store: `intakeVersion` on every Case; `contact` on staff cases and on the applicant's own case; `materials` on staff cases.
  - `CASE_ACTIONS` gains both names.

- [ ] **Step 1: Failing tests.**
  - **Database** (`tests/database-intake.mjs`):
    - `UPDATE_CONTACT`: owner on own draft allowed; owner after submit refused; Sam (office) on any case allowed; a volunteer on an unclaimed case refused; the same volunteer as preparer allowed; another applicant refused; a payload with `phone` refused; each field's type check applies.
    - `RECORD_MATERIALS`: staff allowed; the applicant refused; an unknown item refused; a second call replaces the set; applicant reads return no materials rows.
  - **Unit:**
    - `store.test.mjs`: `mapCase` gives `intakeVersion`. The staff case gets `contact` and `materials`. The applicant case gets `contact` and not `materials`. Update the pinned key lists deliberately.
    - `case-actions.test.mjs`: payload rules and the builders for both actions.
- [ ] **Step 2: Run to confirm they fail.**
- [ ] **Step 3: Write `013_contact_materials.sql`.**
  - The `case_materials` table (spec §3.5), following the Global Constraints table conventions: composite FK, RLS, grants, and the `presenter_admin_followups` policy copied with the name changed. Add it to the realtime publication, and to `PRESENTER_ONLY_TABLES` in `tests/database.mjs`.
  - `vitally_private.materials_items()`.
  - Replace, each from its latest definition, adding only the new branches:
    - `check_operation_authority`:
      - `UPDATE_CONTACT`: a person must be absent (applicant) or present.
      - `RECORD_MATERIALS`: a person must be present.
    - `check_authority`, by target:
      - `UPDATE_CONTACT`: an applicant must own the case and it must be a draft. A person needs `followup` or `admin`, or must be the case's `preparer_id` or `reviewer_id`.
      - `RECORD_MATERIALS`: a person with `followup` or `admin`, or the case's preparer or reviewer.
    - `check_payload`: the two payload shapes.
    - `vitally_apply_action`: the two dispatch lines.
  - The handlers:
    - `act_update_contact` upserts `case_contacts`' best time and note; its detail lists the changed fields.
    - `act_record_materials` deletes the case's rows and inserts `received`, stamped with the person and `now()`; its detail is `{ items: [...] }`.
  - Neither returns a client message.
- [ ] **Step 4: Browser side.**
  - `contracts.mjs`: both action names, plus the Case comment gains `intakeVersion, contact`.
  - `supabase-store.mjs`:
    - `mapCase` adds `intakeVersion: Number(row.intake_version ?? 1)`.
    - The staff and applicant case reads select the contact row; the staff read also selects materials, with explicit column lists in `CLIENT_COLUMNS` style.
    - The applicant adapter never names `case_materials`.
    - `SUBSCRIBED_TABLES`: add `case_contacts` to `CLIENT_TABLES` and `case_materials` to `STAFF_TABLES`. `tests/database-store.mjs` checks this against the publication.
    - Update `tests/store.test.mjs`'s staff-only table list, so the applicant adapter never names `case_materials`, and its subscription expectations.
  - `case-actions.mjs`: builders and payload rules for both actions, following `REMIND` / `RECORD_CONTACT`.
- [ ] **Step 5: Run.** Apply with `npm run db:migrate:test`, then `node --env-file=.env.test --test tests/database-intake.mjs`, `npm test`, and `npm run test:database`. Expected: PASS.
- [ ] **Step 6: Commit** ("Contacts and materials actions; map the new case data").

---

### Task 5: All four suites and the docs

**Files:**
- Modify: `docs/design/redesign-review.md` (status), `docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md` (§2 row 4: note the 4a–4d split).

- [ ] **Step 1: Run all four suites** on the final tree, in the foreground, with output to `/tmp`:
  ```bash
  npm run db:migrate:test
  npm test
  npm run test:database
  npm run test:auth-browser
  npm run test:browser
  ```
  Expected: all PASS, and the browser story unchanged, since nothing visible changed.
  - If a database test fails with "Synthetic Auth provisioning failed", re-run once and report both runs.
  - Known browser flake: "a press reached nothing at all and had to be sent again".
- [ ] **Step 2: Confirm nothing visible changed.** `grep -rn "intake_version\|catalogue" src/*.mjs` shows no screen reading version 2 yet, apart from the service and language labels.
- [ ] **Step 3: Docs.**
  - In the roadmap's part 4 row, add: "Split into 4a catalogue and server, 4b client intake, 4c Add a case and staff views, 4d Chinese."
  - In `redesign-review.md`, update the status line: part 2 merged, and 4a in review.
- [ ] **Step 4: Commit** ("Part 4a status and roadmap split").
