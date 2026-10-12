## 1. Switch-over checks (written first, seen failing)

- [x] 1.1 In `tests/database-intake-default.mjs`, replace "the column default is still 1 (no switch-over here)" with the switch-over checks:
  - The column default is 2 (`information_schema.columns`).
  - A workspace from `createDatabaseFixture({ intakeVersion: null })` is version 2.
  - A client case created in that workspace is version 2.
  - An assisted (office) case created in that workspace is version 2.
- [x] 1.2 Add the version-kept checks:
  - A version-1 case, created while its workspace is set to 1, keeps version 1 after the workspace is set to 2.
  - The same case keeps version 1 after it is updated.
- [x] 1.3 Add the sample checks, in a `intakeVersion: null` workspace:
  - A reset seeds version-2 samples.
  - After setting the workspace to 1, the next reset seeds version-1 samples.
- [x] 1.4 Update the file's header comment: this file now covers the switch-over, 020.
- [x] 1.5 Run `npm run test:database` and see the new checks fail against the stack without 020. Record the failing output.

## 2. Migration 020

- [x] 2.1 Write `supabase/migrations/020_intake_v2_default.sql`. Its header comment says:
  - it is the switch-over;
  - it sets the column default to 2 and sets every workspace to 2;
  - it redefines no function and touches no catalogue, so it may run before or after 021 and 022;
  - it is re-appliable.
- [x] 2.2 Run `npm run db:migrate:test`, then confirm on the test stack that no workspace is left at version 1 (one `select`). Record the result.
- [x] 2.3 Run `npm test` and `npm run test:database`. Everything passes.

## 3. Docs and project rules

- [ ] 3.1 Update `docs/developer/database.md`, `docs/developer/architecture.md` and `docs/setup.md`:
  - add the `020_intake_v2_default.sql` row;
  - the count becomes 22 migrations, and drop "020 is left free";
  - reword the "still 1 everywhere" and "No migration yet changes… held" lines to say 020 made version 2 the default;
  - rewrite setup.md's last-verified database clause with this change's count and date;
  - record the database suite's observed count.
- [ ] 3.2 Update `README.md` and `docs/design/redesign-review.md`: version 2 is the default.
- [ ] 3.3 Update CLAUDE.md's "Versions" rule. Version 2 is the default for new applications. Version 1 stays for existing cases until its own removal change. Drop the note about the wording review.
