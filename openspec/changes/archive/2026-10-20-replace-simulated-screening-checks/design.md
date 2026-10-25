## Context

- **Today** (PR #92 branch at 62b2059; main 71e84d1). An admin records `VERIFY_INTAKE` at Screening in progress
  (#91).
  - The panel (`intakeChecksPanel`, `src/admin-views.mjs`) shows four "simulated" checks and a disclaimer.
  - The builder (`src/case-actions.mjs`) sends `{checks: {interview, identity, documents, consent: true}}`.
  - `check_payload` requires exactly those four keys. Its newest definition is in #92's 033.
  - `act_verify_intake` (newest 032) moves the case to Pending intake / filing, sets `intake_verified`, and returns
    detail `{simulated: true, checks}` with the client line "Simulated intake checks are recorded. Your application is
    waiting for a volunteer to start preparation."
- **Histories.** The staff history renders one sentence per action (`EVENT_SENTENCES`), never the event's `detail`.
  The client history shows the stored sentence, translated by the exact-string table in `src/client-text.mjs`.
- **Fixtures.** `fixture_history` (newest 023) seeds a `VERIFY_INTAKE` row in all six samples, with the old detail and
  sentence. Only `review_ready` (Dana Okafor) is an online case (`fixture_answers_v2`, 030).
- **Spec.** `case-lifecycle` owns the intake-check move, the rule that its form shows at Screening in progress only,
  and "Clients are told at each new step". The last includes "Earlier history lines SHALL keep their words and
  translations".
- **Stakeholders:** the office (admins who screen), clients (the history line), and Jinyu (#91's chain).
- `brainstorm.md` holds the agreed design and the code findings.

## Goals / Non-Goals

**Goals:**
- The screening checks PCDC actually does:
  - `phone`, `documents` and `in_scope` on every case;
  - `identity` only for an online client.
- The button enables only when every check shown is ticked, and the database enforces the same set.
- No "simulated" wording in the panel, the toast, the staff history sentence or the client's new line.
- Old events and old translations keep rendering.

**Non-Goals:**
- The claim popup.
- What happens when a check fails. The button just stays disabled.
- Any new stage, a change to who may record the checks, or to `START_SCREENING`.
- Rewriting events already stored.

## Decisions

### D1: The check set depends on the intake's service

- **Choice:**
  - `src/case-actions.mjs` exports `screeningCheckKeys(service)`, which returns `phone`, `documents` and
    `in_scope`, then `identity` when `service === "online"`. The panel and the builder both use it.
  - The builder reads the service from the submit button's `data-service`, as `APPROVE_REVIEW` does. A missing or
    unknown service gets the three checks.
- **Labels (exact):**
  - `phone`: "The client can be reached at the phone number on the application."
  - `documents`: "The basic documents are present (photo ID, Social Security or ITIN cards, the income documents on
    the list)."
  - `in_scope`: "The return is within VITA scope."
  - `identity`: "Identity confirmed: the client's face matches their photo ID (in person or on video), checked by a
    certified volunteer."
- **Reason:** one list drives what is shown and what is sent, so they can't disagree.
- **Alternatives considered:** sending every key and letting the database ignore `identity` on a non-online case.
  Rejected: the agreed design says identity is "not accepted otherwise".

### D2: The database enforces the set; `identity` in the handler

- **Choice:**
  - **`check_payload`**, copied verbatim from 033 with `-- 034` lines. `VERIFY_INTAKE` accepts exactly the keys
    `{documents, in_scope, phone}` or `{documents, identity, in_scope, phone}` (sorted, as `payload_keys` returns
    them), every value `true`.
  - **`act_verify_intake`**, copied verbatim from 032 with `-- 034` lines.
    - After its stage check, it refuses with `VALIDATION` unless `identity` is present exactly when
      `answers->>'service' = 'online'`.
    - It returns detail `{checks}` (no `simulated` flag) and the new client sentence (D4).
  - Every refusal changes nothing (one transaction, as today).
- **Reason:** `check_payload` is immutable and never sees the case. The service rule needs the case, so it goes in
  the handler, as 033 did for the appointment rule.
- **Alternatives considered:** reading the case in `check_payload`. Rejected: it would break its immutability and
  every call site's contract.

### D3: Wording

- **Panel:**
  - section title "Screening checks";
  - button "Record the screening checks";
  - hint, while any shown check is unticked: "Tick every check before recording them.";
  - the demo disclaimer is removed;
  - badge as today: "Recorded" or "Not recorded yet".
- **Elsewhere:**
  - builder refusal "Tick every check before recording them.";
  - toast "The screening checks are recorded.";
  - `adminEligibility.verifyIntake`'s already-done refusal "The screening checks are already recorded.";
  - staff history sentence "recorded the screening checks". This renders for old and new events alike, because
    neither history reads `detail`.
- **Unchanged:** the presenter panel's general note that the demo's records are simulated (`src/presenter-views.mjs`)
  is outside this panel.

### D4: The client's history line

- **Draft, for Hailey to review:**
  - English: "PCDC finished screening your application. A volunteer will start preparing your return next."
  - 简体: "PCDC 已完成对您申请的审核。接下来会有志愿者开始准备您的报税表。"
- 审核 matches the label the client already sees for Screening in progress (审核中).
- 繁體 is generated with `npm run build:hant`.
- The old sentence and its 简体 stay in the translation table, so events already stored keep rendering in Chinese.
- The status-panel message for Pending intake / filing is unchanged.

### D5: Fixtures

- **Choice:** `fixture_history` is copied verbatim from 023 with `-- 034` lines. Only its six `VERIFY_INTAKE` rows
  change:
  - detail `{"checks":{"phone":true,"documents":true,"in_scope":true}}`, plus `"identity":true` on `review_ready`;
  - the D4 sentence.
- `apply_fixture_scenario` (033) reads `fixture_history` and is not redefined.
- **Reason:** seeded and played-through cases read alike.

### D6: Functions 034 redefines, and their sources

| Function | Copied from | What 034 changes |
|---|---|---|
| `vitally_private.check_payload` | **033** (#92's, newest) | the `VERIFY_INTAKE` branch only |
| `vitally_private.act_verify_intake` | **032** (its newest) | the identity-iff-online check, the detail and the message |
| `vitally_private.fixture_history` | **023** (its newest) | the six `VERIFY_INTAKE` rows |

**Not redefined:** `vitally_apply_action` and `check_operation_authority` (newest 032), because no action is added
or regrouped. `apply_fixture_scenario` (033) is not redefined either.

Before apply and before the PR, re-run `grep -l "function [a-z_.]*\b<name>(" supabase/migrations/*.sql` for each
function, and recopy any whose newest definition moved.

## Risks / Trade-offs

- [Risk] **Old browser tabs** send the four-key payload and are refused. → Mitigation: `VALIDATION` with the usual
  banner, and a reload fixes it. Classroom demo, no long-lived clients.
- [Risk] **Many tests send the old payload** (unit, database fixture and suites, the story). → Mitigation: the
  fixture's `CHECKS` constant and `screeningCheckKeys` become the single sources, and one plan task sweeps the callers.
- [Risk] **Migration order.** 034 depends on 033 (`check_payload`'s newest definition). → Mitigation: this change
  ships on #92's branch, after 033. If anything else takes 034 first, renumber at merge with no gap, and recopy per
  D6.
- [Trade-off] **Failed checks.** A check that fails has no path yet: the button simply stays disabled. → Accepted:
  failure handling is a later change.

## Migration Plan

- **One migration, `034_screening_checks.sql`**, numbered one after the newest (033). Every statement can be
  applied again (`create or replace`).
- **Existing data:**
  - stored events keep their detail and sentence;
  - cases already past screening are untouched;
  - a case still at Screening in progress gets the new checks.
- **Rollback:** a forward migration restoring the previous definitions.
- **Acceptance:**
  - the scenarios in `specs/`;
  - `npm test`;
  - `npm run db:migrate:test` + `npm run test:database`;
  - `npm run test:browser`;
  - `npm run build:hant -- --check`;
  - `npx openspec validate --all`, and `npm run build:intake` leaves nothing to commit.

## Open Questions

None. The client sentence (D4) was approved by Hailey as drafted, in English and 简体, on 2026-10-20.
