# Part 4a: The intake catalogue and the server side

**Status:** approved in brainstorming on 2026-09-29.

**Roadmap:** part 4 of `docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md` §2, split into four pieces:
- **4a (this spec):** the question catalogue and the server side.
- **4b:** the client's 9-step intake, with the senior switch.
- **4c:** Add a case, the staff answer views, and the materials checklist on screen.
- **4d:** turning on Chinese.

Each piece has its own spec, plan and PR.

**Decisions it implements:**
- D3: the senior version as a switch, same questions.
- D9: best time to reach, editable by the client, volunteers and admins; the materials checklist.
- Part 5 depends on this spec: the phone is stored separately so the database can mask it.

## 1. Scope

**In:**
- **The catalogue:** one generated description of every version-2 intake question, built from the two drafts. It covers IDs, types, options, show-if rules, the nine steps, and four wordings (standard or senior, English or Chinese).
- **Server side:** a version per case, the version-2 field table, structured-answer validation for `SAVE_ANSWERS` and `SUBMIT`, the contact table, the materials table, and the `UPDATE_CONTACT` and `RECORD_MATERIALS` actions.
- **Browser side:** a catalogue reader module; the store maps the version, the contact row and the materials; `case-actions.mjs` learns the two new actions.

**Out:**
- **Any visible change.** New cases stay version 1 until 4b.
- The volunteer-only fields of the drafts' Appendix A (decided in 4c).
- Masking the phone (part 5).
- The returning-client search (part 6).

## 2. The catalogue

### 2.1 Source

- The two drafts in `docs/intake-questions/` remain the only place questions are written.
- `intake-questions.md` (standard) supplies the ID, type, options, required flag, show-if rule, and the standard English and Chinese wording.
- `intake-questions-senior-v2.md` supplies only the senior wording. Its IDs, types, options, required flags and show-if rules must equal the standard draft's; the build fails otherwise.

### 2.2 The draft grammar

The build accepts exactly this. Anything else fails with the line number.

- **Section:** a heading `## Section N: English / 中文`. A section heading that isn't a numbered section (Design Conventions, the appendices) is ignored along with its contents.
- **Question:** a line `**Qn.m** English / 中文`, followed immediately by a line ``` `field_id` · Type · Required|Optional ```, then any of:
  - **Options:** one or more lines of ``` `value` English / 中文 ``` items, one per bullet or several separated by ` · ` on one bullet line.
  - `> Tip: English / 中文`, or `> Tip (show if …): English / 中文`, for a tip shown only under that condition.
  - `**Show if** <condition>`.
  - `> Note for developers: …`, which the build ignores.
- **Types:**

  | Type | Value stored | Checks |
  |---|---|---|
  | `text` | string | ≤ 200 characters |
  | `longtext` | string | ≤ 5,000 characters |
  | `signature` | string | ≤ 200 characters |
  | `email` | string | ≤ 254 characters, one `@` |
  | `phone` | string | 10 digits, formatting stripped |
  | `zip` | string | 5 digits |
  | `date` | string | `YYYY-MM-DD`, a real date |
  | `year` | string | 4 digits |
  | `number` | string | digits only, ≤ 6 |
  | `choice` | string | one of the options |
  | `multi` | array of strings | each one of the options, no duplicates |
  | `who` | array of strings | subset of `me`, `spouse`, `none`; `none` alone |
  | `yesno` | string | `yes` or `no`, plus `not_sure` if the question lists it |
  | `group` | array of objects | ≤ 10 members; each member's keys are the group's sub-fields, each checked by its own type |

  A `group` question's sub-fields are the questions written under it, numbered `Qn.m` inside the group's section and marked by the group's show-if line ("Repeatable group"). The build records them as the group's `fields`.
- **Conditions** (show-if rules only):
  - `field = value`, `field ≠ value`, `field is filled`;
  - joined by `AND`;
  - `field` may name any question in the catalogue, and `value` must be one of its options.
- **Every question states Required or Optional.** The flag goes on the ID line, and for a question with a show-if rule, Required means required when shown. There is no default.
- **Rewriting today's drafts.** 4a rewrites the drafts once, in both files, wherever they use another form. Known cases are "Dropdown / Text", "Who (multi-select)", "Single choice: …" with the options inline, "Yes (是) / No (否) / Prefer not to answer (不愿回答)", "Date (MM/DD/YYYY)", "Date (auto-fill today)", "Text (5 digits)", "Text (e-signature)" and "Multi-select (same options as Q12.5)". The wording doesn't change, only the type line and options.
- **Required or optional, decided with the group on 2026-09-29.** 4a writes the flag into every question in both drafts:
  - **Optional:**
    - `tp_middle_name`, `email`, `best_contact_time`, `best_contact_note`, `addr_apt`, `sp_middle_name`, `sp_phone` and `additional_notes`;
    - every question in Section 12 (statistics only);
    - the Form 15080 consent and its signature and date fields (Section 14, which the draft calls optional);
    - `inc_wages_job_count`, `refund_method_other`, `inc_other_desc`, `evt_other_desc`, `irs_language`, and `language_other` (below).
  - **Required when shown:** everything else. Questions offering "I'm not sure" or "No one" can always be answered, so requiring them never blocks a client who doesn't know.
- **Questions added to Section 0 of both drafts.** The work board, office queue and case pool filter and display `answers.service` and `answers.language`, so version 2 keeps both, under the same field IDs as version 1:
  - **Q0.2** `service` · choice · Required: `same_day` Same-day / 当天办理, `drop_off` Drop-off / 送件办理, `online` Online / 线上办理.
  - **Q0.3** `language` · choice · Required: `english` English / 英语, `cantonese` Cantonese / 粤语, `mandarin` Mandarin / 普通话, `other` Other / 其他.
  - **Q0.4** `language_other` · text · Optional · Show if `language = other`.
  - These are not the IRS-letter language questions (`irs_language_pref`, `irs_language`), which stay as drafted.
  - The group should review the Chinese wording of Q0.2–Q0.4, which is new rather than taken from the drafts. The senior draft uses the same wording until the group writes a simpler one.
  - **Values are stored lowercase** (`drop_off`), while version 1 stores labels ("Drop-off"). Wherever the boards group or display a case's service or language, they use a shared label lookup, so both versions read "Drop-off" and filter together. 4a adds the lookup (`serviceLabel(value)`, `languageLabel(value)` in `src/intake/catalogue.mjs`) and switches the board, queue and pool to it, with no visible change for version-1 cases.
- **The standard or senior choice** is the answer `form_version` (Q0.1): `general` or `senior`, stored in the case's answers like any other answer, and Optional because it defaults to `general`. 4b's switch at the top of the form saves it through `SAVE_ANSWERS`. Staff see which wording the client last used through the answer views (4c).

### 2.3 Steps

The catalogue maps the draft's sections onto the nine designed steps. 4b and 4c use this mapping.

| Step | Title | Sections |
|---|---|---|
| 1 | Before you start | 0 |
| 2 | About you | 1, 2 |
| 3 | Marriage & spouse | 3, 4 |
| 4 | Your 2025 situation | 5 |
| 5 | Household | 6 |
| 6 | Income | 9 |
| 7 | Expenses & events | 10, 11 |
| 8 | Refund & preferences | 7, 8, 12, 13 |
| 9 | Consent | 14 |

Section 0's page text becomes step 1's intro. Every other section heading becomes a heading within its step.

### 2.4 The build and its outputs

`node tools/build-intake-catalogue.mjs` writes:
- **`src/intake/catalogue.json`:** `{ version: 2, steps: [{ n, title: {en, zh}, sections: [{ n, title: {en, zh}, intro?, questions: […] }] }] }`. Each question carries `{ id, type, required, options?, showIf?, tips?, fields? (group), wording: { general: {en, zh}, senior: {en, zh} } }`.
- **A catalogue migration, only when the catalogue changed.** The build hashes the catalogue (SHA-256 of the canonical JSON) and reads the hash recorded in the newest `supabase/migrations/NNN_intake_catalogue_<hash8>.sql`.
  - If the hashes differ, or no catalogue migration exists, it writes the next-numbered migration, `NNN_intake_catalogue_<hash8>.sql`. That file holds a `-- catalogue-hash: <full hash>` line and one statement, `select vitally_private.load_intake_catalogue(2, '<catalogue json>'::jsonb);`.
  - If they match, it writes nothing.
  - An existing migration is never rewritten. A wording change later makes a new migration, and the migrator applies it after the earlier ones.
- There is no separate SQL copy of the catalogue. The browser reads `catalogue.json`, and the database reads the newest catalogue migration.

### 2.5 Reading it in the browser

`src/intake/catalogue.mjs`:
- `stepsFor(version)` and `questionsFor(version, step)`.
- `wording(question, { variant, lang })`, where `variant` is `"general"` or `"senior"` and `lang` is `"en"` or `"zh"`.
- `isVisible(question, answers)`.
- `checkValue(question, value)` returns `null` or a reason, using the §2.2 type checks.
- `missingToSubmit(version, answers)` lists required, visible, unanswered field IDs.

Version 1 is not in the catalogue. Its existing code (`INTAKE_ANSWER_KEYS`, `REQUIRED_ANSWER_KEYS`, `screening()`) is untouched.

## 3. Data model and server

Migration `supabase/migrations/011_intake_v2.sql`, written re-apply-safe like 010.

### 3.1 Versions
- `cases.intake_version smallint not null default 1`, with `check (intake_version in (1, 2))`. It is set on insert and never changed (guarded by a trigger like 010's).
- `workspaces.default_intake_version smallint not null default 1`, with `check (… in (1, 2))`.
- `vitally_create_case` and `seed_fixtures` set a new case's `intake_version` from its workspace's default.
  - Version-2 samples need version-2 fixture answers. 4a adds them to `fixture_answers` keyed by version.
  - The seeder uses them only when the default is 2.

### 3.2 `vitally_private.intake_fields`
- Columns: `(version smallint, field_id text, type text, options text[], max_length int, required_to_submit bool, step smallint, group_id text null, sensitive bool, primary key (version, field_id))`.
  - `group_id` names the group a sub-field belongs to.
  - `sensitive` is true for `tp_phone` and `sp_phone`, and part 5 builds on it.
- Not granted to any client role.

### 3.3 Answers
- **A version-1 case:** exactly today's rules. Its answers are strings, its keys come from `intake_answer_keys()`, and its submit rules come from `act_submit`.
- **`SAVE_ANSWERS` on a version-2 case:**
  - Each key must be a version-2 `field_id` that is not a group sub-field.
  - Each value must pass its type's check from §2.2 against `intake_fields`, and a group's members are checked field by field.
  - `null` clears a field.
  - The merged answers must be ≤ 64 KB, `pg_column_size` of the jsonb.
  - The contact fields (`tp_phone`, `sp_phone`, `best_contact_time`, `best_contact_note`) are not stored in `answers`. They go to `case_contacts` (§3.4), in the same transaction. Both phones are there, so part 5 masks phones in one place.
- **`SUBMIT` on a version-2 case:** refused (`VALIDATION`) only if a `required_to_submit` field whose show-if holds is unanswered, counting the contact fields from `case_contacts`. Otherwise the case moves to `received` as today, and 010's trigger numbers it.
- **No screening in version 2.** The intake never turns a client away, including clients with self-employment income. A volunteer decides after reviewing the case, and tells the client in person if the site can't help. Version 1 keeps today's screening (`screening()` and `act_submit`'s checks) for its existing cases. A later part may add labels or highlights, such as "self-employment", to help volunteers choose which cases to claim; that is not in part 4.
- The browser's `missingToSubmit` and `checkValue` implement the same rules from `catalogue.json`. The two are kept equal by the drift test (§5).

### 3.4 `public.case_contacts`
- Columns: `(workspace_id, case_id primary key references cases on delete cascade, phone text, spouse_phone text, best_contact_time text[], best_contact_note text, updated_at)`.
- RLS select: the same rule as the case's own visibility (`visible_cases`).
- No client role may insert, update or delete it directly. Only the action RPCs write it.
- `UPDATE_CONTACT` (case action):
  - Payload `{ bestContactTime?, bestContactNote? }`, each checked by its field's type.
  - Allowed for:
    - the case's owner (the client), while the case is a draft;
    - office staff (a persona with the `followup` or `admin` capability), on any case;
    - a volunteer, only on a case they are preparing or reviewing (`preparer_id` or `reviewer_id` is them).
  - Refused for anyone else, including a volunteer on an unclaimed (available) case. This fits D5: volunteers see only intake answers on available cases, with no contact details.
  - It never changes either phone. Phones are edited only through the form (`SAVE_ANSWERS`), per D9 (best time only).
  - It is recorded in history as "updated the best time to reach".

### 3.5 `public.case_materials`
- Columns: `(workspace_id, case_id references cases on delete cascade, item text, received_at timestamptz, recorded_by_person_id, primary key (case_id, item))`.
- `item` is one of `photo_id`, `ssn_itin`, `green_card`, `birth_certificate`, `w2`, `1099nec`, `1099misc`, `1099int`, `1098t`, `1095a`, `prior_year_1040`. That is D9's list, stored as `vitally_private.materials_items()` and mirrored in the catalogue JSON as `materials: [{ id, label: {en, zh} }]`.
- RLS select: staff (presenter) only. An applicant's read returns no rows, and the adapter never asks.
- `RECORD_MATERIALS` (case action):
  - Payload `{ received: string[] }`: the full set of items now received. It replaces the case's rows.
  - Allowed for staff personas who may act on the case.
  - It is recorded in history as "recorded the materials received".

### 3.6 Loading the catalogue
- `011_intake_v2.sql` holds only the schema and `vitally_private.load_intake_catalogue(p_version smallint, p_catalogue jsonb)`. That function replaces every `intake_fields` row for `p_version` with the fields in `p_catalogue`, in one transaction, and refuses a catalogue that fails its own shape checks.
- 011 contains no questions. The first build writes `012_intake_catalogue_<hash8>.sql`.
- Loading never changes an existing case's answers. A field removed from the catalogue stays in old answers and is simply not accepted in new saves.

## 4. Browser side
- `src/intake/catalogue.json` and `src/intake/catalogue.mjs` (§2.4–2.5).
- **Store mapping:**
  - `cases.intake_version` → `intakeVersion`.
  - The `case_contacts` row → `contact: { phone, spousePhone, bestContactTime, bestContactNote }`, on staff reads and on the applicant's own case.
  - `case_materials` → `materials: [{ item, receivedAt, recordedByPersonId }]`, on staff reads only.
- `case-actions.mjs`: `UPDATE_CONTACT` and `RECORD_MATERIALS` are added to the action names, payload rules and eligibility. No screen offers them until 4b and 4c.
- Every version-1 screen and path is unchanged.

## 5. Testing and acceptance

**Unit:**
- A fresh build equals the committed `catalogue.json`, and its hash equals the hash recorded in the newest `NNN_intake_catalogue_*.sql`, so the database is never behind the browser.
- The two drafts have equal IDs, types, options, required flags and show-if rules.
- Every show-if condition names a real field and option.
- Every step has at least one question, and every section maps to exactly one step.
- For each type, a valid value passes and a bad one fails. That includes each length limit at the limit and one over it, among them 5,000 characters on `longtext`.
- `isVisible` works with `=`, `≠`, "is filled" and `AND`.
- `missingToSubmit` works on an empty set, a complete set, and a set where a hidden required field is skipped.
- The store maps `intakeVersion`, `contact` and `materials`.
- `serviceLabel` and `languageLabel` give the same label for version 1's stored labels and version 2's values, and the board, queue and pool filters group both versions together.
- The pinned store shapes are updated deliberately.

**Database:**
- A version-1 case behaves as today, and the existing tests are unchanged.
- **Version-2 `SAVE_ANSWERS`:**
  - An unknown field ID is refused.
  - A bad value is refused, one per type.
  - An unknown group sub-field is refused.
  - More than 10 group members are refused.
  - A save over 64 KB is refused.
  - Valid structured answers are stored.
  - The contact fields go to `case_contacts` and not to `answers`.
  - `null` clears a field.
- **Version-2 `SUBMIT`:**
  - A missing required visible field is refused.
  - A hidden required field doesn't block.
  - A complete case submits and gets a client number, including one that reports self-employment income (`inc_self_employed = yes`); version 2 never refuses on screening.
- **`UPDATE_CONTACT`:**
  - The owner's own draft is allowed.
  - The owner after submission is refused.
  - A staff persona who may act is allowed.
  - Another applicant is refused.
  - A volunteer on an unclaimed case is refused, and on a case they prepare is allowed.
  - Neither phone can be changed through it.
- **`RECORD_MATERIALS`:** staff only, the item list is enforced, and the full set replaces the old one.
- **Visibility:** an applicant sees their own contact row and never materials. Staff see both.
- **Versions:**
  - `default_intake_version` decides a new case's version.
  - Samples follow it, using version-2 fixture answers when it is 2.
  - The version can't be changed after insert.
- **Drift:** the `intake_fields` rows equal `catalogue.json`'s fields.

**Done when:**
- All four suites pass.
- `default_intake_version` is 1, and nothing visible has changed.
- The drafts parse under §2.2 with their wording unchanged.
