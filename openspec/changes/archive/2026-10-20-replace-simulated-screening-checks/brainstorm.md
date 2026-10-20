# Brainstorm: replace-simulated-screening-checks

Agreed with Hailey on 2026-10-20, in the conversation (CLAUDE.md §2, step 2). She asked for the propose with the
design settled. The first part below is that design, in its own words. The last part, "Found in the code during
propose", is not part of the approval. It lists what reading the code showed and the calls Claude made because of it,
each marked so it can be checked.

This change sits on the PR #92 branch (`add-preparer-and-reviewer-questionnaires`), after that change's archive, at
Hailey's request.

---

## Scope

**In:** replace `VERIFY_INTAKE`'s four simulated checks (interview, identity, documents, consent) with the real
screening checks.

**Out:**
- the claim popup (dropped);
- what happens when a check fails (later; the button just stays disabled until every check shown is ticked);
- any new stage.

## The checks (staff screen, English)

| Key | Text | Shown |
|---|---|---|
| `phone` | The client can be reached at the phone number on the application. | every case |
| `documents` | The basic documents are present (photo ID, Social Security or ITIN cards, the income documents on the list). | every case |
| `in_scope` | The return is within VITA scope. | every case |
| `identity` | Identity confirmed: the client's face matches their photo ID (in person or on video), checked by a certified volunteer. | only when the intake answer `service` = `online`; not shown and not accepted otherwise |

The old `consent` check is removed.

## Design points

- **"Simulated" goes, everywhere in this panel:**
  - section title "Screening checks";
  - button "Record the screening checks";
  - hint "Tick every check before recording them.";
  - the toast and the history wording to match.
- **Database:**
  - a new migration numbered one after the newest (034 while #92's 033 is the latest; no gaps);
  - `check_payload` is copied from its newest definition (033's), and `VERIFY_INTAKE` then requires exactly
    `phone`, `documents` and `in_scope` true, plus `identity` true if and only if the case's service is online;
  - `act_verify_intake` is copied from its newest definition, and refuses anything else with no change.
- **Client message after the checks:** replace "Simulated intake checks are recorded. ..." with a sentence that
  doesn't say simulated, in English and 简体 (Claude drafts; Hailey reviews). Then `npm run build:hant`.
- **Old data stays readable.** Existing events and seeded fixtures with the old four keys still render: history
  renders both shapes. The seeded fixtures that record `VERIFY_INTAKE` move to the new shape, and the online sample
  includes `identity`.
- **Specs:** a delta for the capability that covers screening and the intake checks. Pick the existing one (for
  example `case-lifecycle`); add a new one only if none fits.

## Acceptance

- The four (or three) checks show according to the case's service.
- The button enables only when every check shown is ticked.
- The database refuses missing, extra or false checks, and `identity` on a case that isn't online.
- The client sees the new sentence in English, 简体 and 繁體.
- Old events still render.
- Checks:
  - `npm test`;
  - `npm run db:migrate:test` + `npm run test:database`;
  - `npm run test:browser` (the story's intake-check steps change);
  - `npm run build:hant -- --check`;
  - `npx openspec validate --all`.

---

## Found in the code during propose (not part of the approval)

Read on the PR #92 branch at 62b2059 (main is 71e84d1; #92's 033 is the newest migration).

### What exists today

- **Browser:**
  - `src/case-actions.mjs` exports `INTAKE_CHECK_KEYS` (`interview`, `identity`, `documents`, `consent`).
  - The `VERIFY_INTAKE` builder requires all four ticked ("Tick all four simulated intake checks first.") and sends
    `{checks: {…four: true}}`.
- **Staff panel** (`intakeChecksPanel`, `src/admin-views.mjs`):
  - It renders `INTAKE_CHECK_LABELS` (each ending "(simulated)").
  - The heading is "Simulated intake checks", the button "Record the simulated intake checks", and the hint "Tick
    all four before recording them."
  - A field note says these are demo attestations that assert nothing happened.
  - Tick state lives in `ui.openPanels` (`intake-check-<key>`, toggled by `toggle-intake-check` in `src/app.mjs`).
- **Other wording:**
  - `adminEligibility.verifyIntake` refuses with "The simulated intake checks are already recorded."
  - The toast is "The simulated intake checks are recorded." (`src/app.mjs`).
  - The staff history sentence is "recorded the intake checks" (`EVENT_SENTENCES`, `src/staff-views.mjs`). The staff
    history renders one sentence per action, never the event's `detail`, so old and new detail shapes already render
    the same.
- **Database:**
  - `check_payload`'s `VERIFY_INTAKE` branch (newest in 033, copied there from 032) requires exactly the four keys,
    all true.
  - `act_verify_intake` (newest 032) runs from `screening` only. It sets `preparation_ready` and
    `intake_verified=true`, and returns detail `{simulated: true, checks}` and the message "Simulated intake checks
    are recorded. Your application is waiting for a volunteer to start preparation."
- **Client history:** it shows the stored English sentence, translated through the exact-string table in
  `src/client-text.mjs` (`"Simulated intake checks are recorded. …": "模拟的登记核查已记录。…"`). Events already stored
  keep their sentence, so that table entry must stay for them to keep their 简体.
- **Fixtures:** `fixture_history` (newest 023) seeds a `VERIFY_INTAKE` row in all six sample scenarios, each with the
  old four-key detail and the old sentence. The samples' service answers (`fixture_answers_v2`, 030) are:
  - `preparation_ready`, `waiting_documents` and `corrections_required`: drop-off;
  - `admin_followup` and `review_approved`: same day;
  - `review_ready`: **online**.
- **Tests that send or assert the old shape:**
  - unit: `case-actions`, `admin-views`, `client-language`, `domain`, `staff-views`, `store`;
  - database: `tests/support/database-fixture.mjs` (its `CHECKS` constant and three `VERIFY_INTAKE` calls), plus the
    `actions`, `assistance`, `documents`, `intake`, `realtime`, `redesign`, `review` and `stages` suites;
  - the story, `tests/browser.mjs`: the intake-check ticks around lines 1100–1140 and 3955, and a direct payload
    near 3074.
- **Docs** that mention the simulated intake checks: `docs/demo-script.md`, `docs/developer/database.md`,
  `docs/developer/architecture.md`, `docs/setup.md`. `docs/spec.md`, `docs/proposal.md` and
  `docs/developer/production-roadmap.md` mention them as history and plans.
- **Spec:** the canonical `case-lifecycle` already owns "The intake check" move, the rule that the intake-check form
  shows only at Screening in progress, and "Clients are told at each new step". The last says "Earlier history lines
  SHALL keep their words and translations". Changing `VERIFY_INTAKE`'s history line therefore modifies that
  requirement.

### Claude's calls (check these)

1. **`identity` is checked in the handler, not in `check_payload`.** `check_payload` is immutable and never sees the
   case. It accepts exactly `{documents, in_scope, phone}` or `{documents, identity, in_scope, phone}`, all true.
   `act_verify_intake` then requires `identity` if and only if `answers.service = 'online'`. Both refuse with
   `VALIDATION`. The stage check stays first, as today.
2. **The builder takes the service from the button**, as `APPROVE_REVIEW` does (`data-service`).
   `src/case-actions.mjs` exports `screeningCheckKeys(service)`, used by both the panel and the builder, in place of
   `INTAKE_CHECK_KEYS`.
3. **Draft client sentence** (Hailey reviews):
   - English: "PCDC finished screening your application. A volunteer will start preparing your return next."
   - 简体: "PCDC 已完成对您申请的审核。接下来会有志愿者开始准备您的报税表。"

   审核 is the word the client already sees for Screening in progress (审核中). The old sentence and its 简体 stay in
   the translation table for stored events.
4. **New detail shape:** `{checks: {...}}`, with no `simulated` flag. Old events keep `{simulated: true, checks: {four}}`
   in `case_events`; neither history view reads `detail`, so both render.
5. **Wording beyond the panel:**
   - toast "The screening checks are recorded.";
   - refusal "The screening checks are already recorded.";
   - staff history sentence "recorded the screening checks";
   - builder refusal "Tick every check before recording them." (the hint's words).
6. **The panel's demo-disclaimer field note is removed** with the word "simulated". The presenter panel's general
   note that the records are simulated (`src/presenter-views.mjs`) is outside this panel and stays.
7. **Fixtures:** `fixture_history` is copied from 023 and only its six `VERIFY_INTAKE` rows change:
   - the new detail is `{checks: {phone, documents, in_scope}}`, plus `identity` for `review_ready`;
   - the new sentence replaces the old one.
8. **Migration number:** 034, one after 033. If #92 merges first, 034 stays; if anything else takes 034 first, it is
   renumbered at merge, with no gap.
9. **Docs:** `docs/demo-script.md`, `docs/developer/database.md`, `docs/developer/architecture.md` and
   `docs/setup.md` are updated where they describe the panel or the payload. The historical mentions in `docs/spec.md`,
   `docs/proposal.md` and the roadmap are left alone.
