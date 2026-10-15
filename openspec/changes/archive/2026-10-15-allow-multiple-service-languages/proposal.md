## Why

A client can name only one service language today, Q0.3. A client who prefers Cantonese but also understands Mandarin looks like a Cantonese-only client, so a Mandarin-speaking volunteer never finds them. The staff tables and filters show one language per client. The user's review of the intake screen asked for the other languages too, and for every staff table to show all of a client's languages, the preferred one first, in a compact form (E, M, C). The planned Office overview and its Assign menu, which suggests volunteers who speak the client's language, will rely on the same information.

## What Changes

**The intake's Language sub-step**
- From: Q0.3 "Preferred service language" (one choice, required), plus Q0.4 "Please specify" for Other.
- To:
  - Q0.3 and Q0.4 are unchanged.
  - Two new questions follow them:
    - Q0.5 `language_also`, "Any other languages we can help you in?" / 我们还可以用哪些语言为您服务？ It is multi-select and optional, with the same four options as Q0.3 and a "Choose all that apply…" tip.
    - Q0.6 `language_also_other`, "Please specify" / 请说明. It is text and optional, shown if Q0.5 includes Other.
  - Both drafts carry the same wording. The catalogue is regenerated, which writes migration 026.
- Reason: keep the preferred language, and add the others (brainstorm Q1, Q5).
- Impact: non-breaking. Stored answers, the seeded samples and the draft 13614-C are unchanged.

**The staff tables (work board, case pool, Follow-ups)**
- From: the Language column shows one full label, the preferred language.
- To:
  - The column shows every language the client speaks, preferred first, as letters: E (English), C (Cantonese), M (Mandarin), O (Other). For example, `C, M, O`.
  - A hover tooltip gives the full names, and screen readers read them instead of the letters, for example "Cantonese (preferred), Mandarin, Other: Vietnamese".
  - A Follow-ups row with no case uses the help request's own language text.
- Reason: the user's requirement (brainstorm Q2–Q4, Q8).
- Impact: staff screens only, in English.

**The language filters (work board chips, case pool select, Follow-ups chips)**
- From: one language compared with the preferred language.
- To: a filter matches any language the client speaks. The options are the full names of every language that appears, preferred or other.
- Reason: a volunteer can find every client they can help (brainstorm Q6).
- Impact: a client is counted under each of their languages.

**The client's progress page**
- From: "Language: Cantonese".
- To: every language by full name, preferred first, with the typed name for Other: "Cantonese, Mandarin" / "粤语、普通话".

**"Fill fictional details"** also answers Q0.5, with English preferred and Mandarin also (brainstorm Q7).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client-intake`: adds requirements that the client can name other service languages (Q0.5 and Q0.6), and that the progress page lists them.
- `staff-case-work`: adds requirements for showing a client's languages in the staff tables and filtering by any of them.

Both are new requirements. No existing requirement changes.

## Impact

- **Catalogue:**
  - `docs/intake-questions/intake-questions.md` and `intake-questions-senior-v2.md`;
  - `tools/build-intake-catalogue.mjs` (the `before.language` question list);
  - the generated `src/intake-catalogue-data.mjs` and `supabase/migrations/026_intake_catalogue_<hash8>.sql`;
  - `src/zh-hant.mjs` (generated).
- **Code:**
  - `src/intake-catalogue.mjs`: the language helpers;
  - `src/ui.mjs`: the cell helper;
  - `src/staff-views.mjs`, `src/pool-views.mjs`, `src/office-views.mjs`: the cells and filters;
  - `src/client-views.mjs`: the progress page;
  - `src/sample-data.mjs`: the Fill;
  - `src/styles.css` if the cell needs it.
- **Tests:**
  - unit tests for the build, catalogue, staff, pool, office, client views, sample data and client language;
  - the database suite, against migration 026;
  - the browser story (the Follow-ups language check, and a staff row reading `E, M`).
- **Database:**
  - only the generated catalogue migration 026, which adds two fields;
  - no RPC, policy, realtime or fixture change;
  - no rewrite of stored answers.
- **Docs:** the migration list and counts in `docs/developer/database.md`, `docs/setup.md`, `docs/developer/README.md` and `README.md`.
- **Out of scope:**
  - the Office overview dashboard;
  - Assign and volunteer languages;
  - the seeded samples;
  - the draft 13614-C;
  - other table-header changes.
