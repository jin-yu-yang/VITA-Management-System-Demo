## 1. The bar

- [ ] 1.1 Update the lifecycle bar tests in `tests/staff-views.test.mjs` to the new rules: an open case's bar has ten steps ending at Accepted with no Closed; Accepted is all done with no current and no `aria-current`; a closed case is ten `neutral` steps then Closed `current`; Rejected and Corrections in progress unchanged (design D1–D4)
- [ ] 1.2 In `src/staff-views.mjs`, end `LIFECYCLE` at `accepted`, append Closed only for a closed case, and compute `done` / `current` / `todo` / `neutral` per D1–D3, keeping the `amend` marking
- [ ] 1.3 In `src/styles.css`, style `.lifecycle-step.neutral` as muted, with no progress-coloured connector, and keep a closed case's Closed connector plain (D3)

## 2. Checks

- [ ] 2.1 Run `npm test`
- [ ] 2.2 Run `npm run test:browser`
- [ ] 2.3 Run `npx openspec validate --all`; record that the database, sign-in and Chinese text suites are not needed (no database, sign-in or client-text change)
