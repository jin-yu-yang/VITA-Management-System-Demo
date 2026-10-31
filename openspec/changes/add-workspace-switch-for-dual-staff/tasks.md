## 1. The workspace rule

- [ ] 1.1 Add `hasWorkspaceSwitch(principal, person)` and `inOfficeWorkspace(principal, person, mode)` to `src/contracts.mjs`, beside `isStaffWindow`, with unit tests: dual staff accounts (admin+prepare, admin+review), admin-only, volunteer-only and presenter personas, and a missing person (design D2)

## 2. The remembered mode

- [ ] 2.1 Add `workspaceMode` to `window-state.mjs` `FIELDS` with a check that keeps only `"office"` or `"cases"`, with tests in `tests/window-state.test.mjs` (round trip, unknown value dropped) (D3)
- [ ] 2.2 Add `workspaceMode: "office"` to controller state, carry it in `persistSession` / `restoreSession`, and add `setWorkspaceMode(mode)` (refuses an unknown mode; resets `caseTab`; persists; redraws; runs `startScreeningIfDue`), with controller tests (D3)
- [ ] 2.3 Make `actingAdmin()` use `inOfficeWorkspace`, so a dual account in Cases starts no screening and switching to Office on a Request sent case starts it; controller tests for both, and for presenters and admin-only accounts unchanged (D7)
- [ ] 2.4 Confirm that a case opened in Office mode is loaded by the same path as in Cases mode (`selectCase` → `store.getCase`), so `savedCase` carries `participants` and `reviews` as arrays (`staffShaped` in `src/staff-views.mjs`); if not, make `setWorkspaceMode("cases")` re-read the open case before drawing. A controller test switches on a case page and asserts `Array.isArray` for both fields on `savedCase` (D5)

## 3. The shell and the sidebar

- [ ] 3.1 In `src/views.mjs`, compute the R55 boolean in `staffScreen` with `inOfficeWorkspace(state.principal, person, state.workspaceMode)` and pass `canSwitch` to `renderAdminCase`; shell tests for each landing in design D5 (D1, D5)
- [ ] 3.2 Render the Office / Cases switch in `staffSidebar` above "Signed in as", only when `hasWorkspaceSwitch`: two buttons, Office and Cases, with `aria-pressed` (`"true"` on the current mode, `"false"` on the other), inside a container with `role="group"` and `aria-label="Workspace"`; shell tests for its presence, the group's role and label, absence (admin-only, volunteer, presenter) and both pressed states (D4)
- [ ] 3.3 Style the switch in `src/styles.css` with the existing tokens, in the open and narrow sidebar, without horizontal scroll at 390px (D4)

## 4. The claim hint

- [ ] 4.1 In `renderAdminCase`, show the one-line hint and Switch to Cases button when `ui.canSwitch` and `staffEligibility` allows `claimPreparation` or `claimReview`; admin-view tests for both wordings, a case the person prepared, and an account without the switch (D6)

## 5. Wiring

- [ ] 5.1 In `src/app.mjs`, dispatch `set-workspace-mode` to `controller.setWorkspaceMode(value)`, through `leaveAddCaseFirst` when on Add a case (so a lost-answers leave asks first), and make the leave dialog's confirm finish the switch (D5)

## 6. The browser story

- [ ] 6.1 Add a phase to `tests/browser.mjs` after the two-staff-accounts phase: a fictional dual staff account (`admin`, `review`) signs in to Office with the switch; an admin-only account and the existing single-capability accounts show none; the office case page of a review-ready case shows the review hint; Switch to Cases opens that case's volunteer page (never "Staff sections are not loaded") and Claim review succeeds under the account's person; a reload keeps Cases; Office shows Follow-ups and All cases again; the presenter's screens are unchanged

## 7. Checks

- [ ] 7.1 Run `npm test`
- [ ] 7.2 Run `npm run test:browser`
- [ ] 7.3 Run `npx openspec validate --all`; record that the database, sign-in and Chinese text suites are not needed (no database, sign-in or client-text change)
