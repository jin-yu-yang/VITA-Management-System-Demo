## Context

Ruling R55 decides the staff shell from the acting person. `staffScreen` in `src/views.mjs` computes `office = isAdmin(person)` once and uses it for four things: the sidebar (`staffSidebar`: Follow-ups and All cases, or Work board), the home screen (Follow-ups or the Work board, both under the screen key `staff`), the case page (`renderAdminCase` or `renderStaffCase`), and the office-only screens (`office-cases`, `office-add-case`), which a non-office window is already redirected away from. The choice is a view choice: the database re-checks every capability on every action.

A presenter crosses between the workspaces by choosing another persona. Since add-staff-identity a staff account is its own person, so a staff member with `admin` and `review` (or `prepare`) is held in the office workspace and cannot reach *Claim review*. This was found at the 2026-10-30 rehearsal (issue #104). At PCDC, three or four admins occasionally prepare or review; office work is their main job.

Two other places read "admin" as "office": `actingAdmin()` in `src/controller.mjs`, which starts screening when an admin opens a Request sent case, and the R55 boolean above. Everything else that checks `admin` is a capability check on an action (verifying intake documents, editing someone else's contact), and those stay capability checks.

Window-local choices live in `src/window-state.mjs`: a `FIELDS` allowlist with a shape check per field, stored per user in session storage and carried by the controller's `persistSession` and `restoreSession`. `sidebarOpen` is the closest example.

The historical design `docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md` sets the sidebar order (brand, navigation to screens that exist, then the account row with the acting person, Need help? and Sign out), saves `sidebarOpen` in `window-state.mjs`, and gives office personas Follow-ups and All cases on the same case-page frame and tabs. All of that still holds.

## Goals / Non-Goals

**Goals:**
- A staff account with `admin` and `prepare` or `review` can move between the office workspace and the volunteer workspace, and claim cases there.
- The window remembers the choice across a reload.
- The office case page points such a person to a case they could claim.
- Every other account and every presenter sees exactly what it sees today.

**Non-Goals:**
- A case page that shows office and volunteer actions together.
- Any change to which panels the office or volunteer case page shows.
- Any database change: schema, RPCs, policies, Realtime.
- Any presenter change. A presenter keeps choosing the workspace by persona.
- Role mapping, or changing a staff member's capabilities (the roadmap's separate entry).

## Decisions

### D1: A mode switch between the two existing workspaces
- **Choice:** a dual account picks a mode, Office or Cases. The mode replaces `isAdmin(person)` as the R55 boolean for that account only. Each workspace is shown as it is.
- **Reason:** the two workspaces already exist and are tested. Changing one boolean reuses them whole.
- **Alternative considered:** one case page with both the office and the volunteer actions. Rejected: it means rewriting how the office and volunteer panels exclude each other, for an occasional situation.

### D2: One rule for "which workspace", in `contracts.mjs`
- **Choice:** two small exports beside `isStaffWindow`:
  - `hasWorkspaceSwitch(principal, person)`: true only when `principal.access === "staff"` and the person has `admin` and at least one of `prepare` or `review`.
  - `inOfficeWorkspace(principal, person, mode)`: for an account with the switch, `mode !== "cases"`. For everyone else, whether the person has `admin` (R55 unchanged).
  
  `staffScreen`/`staffSidebar` and the controller's `actingAdmin()` both call `inOfficeWorkspace`.
- **Reason:** the view and the screening start must agree on which workspace the window is in. `contracts.mjs` is already imported by both `views.mjs` and `controller.mjs` and holds `isStaffWindow`.
- **Alternative considered:** checking the mode separately in the view and in the controller. Rejected: two copies of the rule drift.

### D3: The mode is window state, saved like `sidebarOpen`
- **Choice:** controller state `workspaceMode`, `"office"` by default. `window-state.mjs` gains the field with its own check: only `"office"` or `"cases"`; anything else is dropped, and the window falls back to Office. `persistSession` writes it and `restoreSession` reads it. A controller method `setWorkspaceMode(mode)` sets it, resets `caseTab` to Overview (the two case pages have different tabs, as `selectPerson` already does for a persona change), persists, redraws and then runs `startScreeningIfDue()`.
- **Reason:** this is the same per-user, per-window mechanism the sidebar uses, and the brainstorm asked for exactly that. It survives a reload and is cleared on sign-out with the rest.
- **Alternative considered:** storing the mode on the server, per person. Rejected: it needs a database change, and the decision is a view choice.

### D4: The switch's place and shape
- **Choice:** in `staffSidebar`, inside the account area, above the "Signed in as" row: a container with `role="group"` and `aria-label="Workspace"`, holding two buttons, **Office** and **Cases**, on the action `set-workspace-mode` with `data-mode`. Each button carries `aria-pressed`: `"true"` on the current mode, `"false"` on the other. It is rendered only when `hasWorkspaceSwitch` is true. The navigation above follows the mode (Follow-ups and All cases, or Work board).
- **Reason:** the brainstorm placed it there. Two pressed-state buttons are a familiar, keyboard-reachable control and match the sidebar's other buttons.
- **Alternative considered:** a select or a single toggle. Rejected: two named options read more clearly than one control that hides the other state.

### D5: Where a switch lands
- **Choice:**
  - On the home screen (`staff`): it stays on `staff`, which is Follow-ups in Office and the Work board in Cases.
  - On a case page: it stays on the same case and shows the other workspace's case page. **Precondition:** the volunteer case page (`renderStaffCase` in `src/staff-views.mjs`) needs a staff-shaped record, one whose `participants` and `reviews` are arrays (`staffShaped`). Without them it shows "Staff sections are not loaded" and offers no case action. Both workspaces appear to open a case through the same path (`selectCase` → `store.getCase` in `src/controller.mjs`), so the `savedCase` the office page holds should already carry both fields. Apply confirms this first (tasks 2.4). If the office path turns out to load a record without them, `setWorkspaceMode("cases")` re-reads the open case (`selectCase(id, { navigate: false })`) before the volunteer page is drawn.
  - On All cases, switching to Cases: the existing redirect sends a non-office window on an office screen to the Work board.
  - On Add a case: the switch goes through `leaveAddCaseFirst` in `src/app.mjs`, as the sidebar's other exits do, so typed answers are not lost without asking. It then lands on the Work board.
- **Reason:** each case reuses a path the code already has.

### D6: The claim hint on the office case page
- **Choice:** `renderAdminCase` receives `canSwitch` (from `hasWorkspaceSwitch`) in its `ui` argument. When it is true and `staffEligibility(record, person)` allows `claimPreparation` or `claimReview`, the Overview tab's action area shows one line ahead of the office decisions. The text is "You can claim this case — switch to Cases" or "You can review this case — switch to Cases", with a **Switch to Cases** button on `set-workspace-mode` with the value `cases`. Pressing it calls `setWorkspaceMode("cases")`. The window is already on that case's page (`staff-case`), so it shows the volunteer page of the same case, where the person claims it.
- **Reason:** `staffEligibility` is the one place the claim rules live. The office page already computes it as `staffRights`.
- **Alternative considered:** a hint on Follow-ups or All cases rows. Rejected: out of the agreed scope.

### D7: Screening on open follows the workspace
- **Choice:** `actingAdmin()` becomes "the window is in the office workspace" (`inOfficeWorkspace`). A dual account in Cases mode opening a Request sent case starts nothing. Switching from Cases to Office while that case is open starts it, as switching a presenter's persona to an admin already does.
- **Reason:** in Cases mode the page is the volunteer page, which shows no office work. Moving the case from it would be a hidden effect. For presenters and admin-only accounts the result is the same as today.
- **Alternative considered:** keep starting screening on any open by an admin. Rejected for the reason above. Confirmed in the review of these planning artifacts.

## Risks / Trade-offs

- [Risk] A dual person forgets which mode they are in and looks for a control in the wrong workspace. → Mitigation: the sidebar navigation and the page's overline ("OFFICE WORKSPACE" or "VOLUNTEER WORKSPACE") already name the workspace, and the switch shows the pressed mode. The hint points to claimable work from the office page.
- [Risk] Switching to Cases on a case page draws the volunteer page from a record the office loaded. If that record lacks `participants` or `reviews`, the page says "Staff sections are not loaded" and the person cannot claim. → Mitigation: tasks 2.4 confirms that both workspaces load the case the same way, with both fields; if they do not, the switch re-reads the case (D5). The browser story asserts that the volunteer page after the hint never shows "Staff sections are not loaded".
- [Risk] A stored mode survives a change of capabilities, for example when `review` is taken away. → Mitigation: the mode is honoured only while `hasWorkspaceSwitch` is true. Otherwise R55 decides, whatever is stored.
- [Trade-off] The mode is per window (session storage), not per person on the server, so a second window or browser opens in Office. → Accepted: this matches every other window choice (R44) and needs no database change. Office is the main job, so it is the right default.
- [Trade-off] The hint covers claiming only, not work the person already holds as preparer or reviewer. → Accepted: in the agreed scope. Their own cases are on the Work board in Cases mode.

## Migration Plan

N/A: no deployment, database or data change. The new window-state field is optional, so a window saved before this change restores as before and opens in Office. Rolling back the code leaves an unused field in session storage, which the old `pick` ignores.

## Open Questions

None. D7 (screening only from the office workspace) and D3 (the mode stored per window) were confirmed in review.
