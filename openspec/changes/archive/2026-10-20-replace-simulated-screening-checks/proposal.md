## Why

The office records screening with four "simulated" checks (interview, identity, documents, consent) and a note saying they assert nothing happened. Real clients use ViTally from November 2026, so screening should record the checks PCDC actually does before a return can be prepared: the client can be reached, the basic documents are there, the return is within VITA scope, and, for an online client, a certified volunteer confirmed their identity on video or in person. The client's history should stop saying "Simulated".

## What Changes

**The screening checks (`VERIFY_INTAKE`)**
- From: four simulated checks, always all four: interview, identity, documents and consent.
- To: three checks on every case (`phone`, `documents`, `in_scope`), plus `identity` only when the intake answer `service` is `online`. Consent is removed.
- Impact: breaking for the RPC payload. The old four-key payload is refused. Staff screens only, except the client sentence below.

**Wording**
- From: "Simulated intake checks", "Record the simulated intake checks", "Tick all four before recording them.", a demo disclaimer, and "The simulated intake checks are recorded."
- To:
  - the section title "Screening checks";
  - the button "Record the screening checks";
  - the hint "Tick every check before recording them.";
  - no disclaimer;
  - the toast "The screening checks are recorded.";
  - the staff history sentence "recorded the screening checks".

**The client's history line**
- From: "Simulated intake checks are recorded. Your application is waiting for a volunteer to start preparation."
- To: a sentence that doesn't say simulated, in English and 简体 (繁體 generated). The draft for review is in design.md, D4.
- Lines already stored keep their words and translation.

**Sample cases** record the new checks: three, plus identity on the online sample.

**Out of scope:** the claim popup (dropped); what happens when a check fails (later; the button stays disabled until every check shown is ticked); any new stage.

**Sequencing:** this change is on the PR #92 branch, after `add-preparer-and-reviewer-questionnaires`. Its migration is 034, one after #92's 033.

**Tracking:** part of #85. The PR uses no Fixes/Closes/Resolves.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `case-lifecycle`:
  - an ADDED requirement for the screening checks: which checks show, the button rule, and the database's refusals;
  - "Clients are told at each new step" is MODIFIED for the new history line after the checks.

## Impact

- **Database:** one new migration, `034_screening_checks.sql`, with new definitions of:
  - `check_payload` (from 033);
  - `act_verify_intake` (from 032);
  - `fixture_history` (from 023).
- **Browser:**
  - `src/case-actions.mjs`: `screeningCheckKeys(service)` and the builder;
  - `src/admin-views.mjs`: the panel and the refusal wording;
  - `src/app.mjs`: the toast;
  - `src/staff-views.mjs`: the history sentence;
  - `src/client-text.mjs` and the generated `src/zh-hant.mjs`: the new line;
  - `src/contracts.mjs`: notes.
- **Tests:**
  - unit: `case-actions`, `admin-views`, `client-language`, `staff-views`, `store`, `domain`;
  - the database suites and `tests/support/database-fixture.mjs`;
  - the story `tests/browser.mjs`.
- **Docs:** `docs/demo-script.md`, `docs/developer/database.md`, `docs/developer/architecture.md`, `docs/setup.md`.
- **Unchanged:**
  - the stage model, `START_SCREENING`, and who may record the checks (an admin, at Screening in progress);
  - `intake_verified`;
  - events already stored.
