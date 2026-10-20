## 1. Gate before apply

- [x] 1.1 Hailey approves the client sentence (design D4), or replaces it. If she changes it, update design D4, the delta spec and plan.md first.
- [x] 1.2 Just before apply, check the migration list. 034 is one after the newest migration. If anything took 034, renumber with no gap. Re-run the D6 lookup and recopy any function whose newest definition moved.

## 2. Database

- [x] 2.1 Write failing database tests for `VERIFY_INTAKE`:
  - three checks accepted on a drop-off case, and four on an online case;
  - refused with `VALIDATION`, and nothing changed, for each of these:
    - a missing check;
    - an extra key;
    - a `false` check;
    - the old `interview` or `consent` keys;
    - `identity` on a drop-off case;
    - no `identity` on an online case;
  - the stored detail is `{checks}`, with no `simulated` flag;
  - the client line is the D4 sentence.
- [x] 2.2 New migration `034_screening_checks.sql`:
  - `check_payload` copied from 033, with only `VERIFY_INTAKE`'s branch changed (design D2, D6);
  - `act_verify_intake` copied from 032, adding the identity-iff-online check, the detail and the message.
- [ ] 2.3 `fixture_history` copied from 023, with only its six `VERIFY_INTAKE` rows changed (design D5). Fixture tests: `review_ready`'s checks include identity; the other samples have three.
- [x] 2.4 Move every database test that sends the old four checks to the new sets: `tests/support/database-fixture.mjs` (`CHECKS` and the `VERIFY_INTAKE` calls), and the `actions`, `assistance`, `documents`, `intake`, `realtime`, `redesign`, `review` and `stages` suites. Run `npm run db:migrate:test`, then `npm run test:database`.

## 3. Browser

- [ ] 3.1 `src/case-actions.mjs`: `screeningCheckKeys(service)` replaces `INTAKE_CHECK_KEYS`. The `VERIFY_INTAKE` builder reads `dataset.service` and refuses with "Tick every check before recording them." Write the tests in `tests/case-actions.test.mjs` first.
- [ ] 3.2 `src/admin-views.mjs`:
  - the Screening checks panel (D1 labels, D3 wording; no disclaimer);
  - the button carries `data-service`;
  - the refusal "The screening checks are already recorded.".

  View tests in `tests/admin-views.test.mjs`: three or four checks by service; the button disabled until every shown check is ticked; no "simulated" in the panel.
- [ ] 3.3 Other wording:
  - the toast "The screening checks are recorded." (`src/app.mjs`);
  - `EVENT_SENTENCES.VERIFY_INTAKE` "recorded the screening checks" (`src/staff-views.mjs`);
  - `src/contracts.mjs` notes.

  Update the tests that assert the old strings.
- [ ] 3.4 Client text: add the D4 sentence to `src/client-text.mjs`, in English and 简体, and keep the old sentence's entry. Run `npm run build:hant` and commit `src/zh-hant.mjs`. Update `tests/client-language.test.mjs` for the new line, keeping the old one.
- [ ] 3.5 Run `npm test` and `npm run build:hant -- --check`.

## 4. Story, docs and full checks

- [ ] 4.1 `tests/browser.mjs`:
  - the intake-check ticks use the new keys per case (around lines 1100–1140 and 3955), and the direct payload near 3074;
  - assert the panel's new title, button and hint;
  - assert the identity check on an online case, if the story has one; otherwise rely on the unit and database tests and say so in verify.md.
- [ ] 4.2 Docs: update `docs/demo-script.md`, `docs/developer/database.md`, `docs/developer/architecture.md` and `docs/setup.md` where they describe the panel, the checks, the payload or the migration list (034 row). Leave the historical mentions in `docs/spec.md`, `docs/proposal.md` and the roadmap.
- [ ] 4.3 Run `npm run test:browser`.
- [ ] 4.4 Run `npx openspec validate --all`, and confirm that `npm run build:intake` leaves nothing to commit.
