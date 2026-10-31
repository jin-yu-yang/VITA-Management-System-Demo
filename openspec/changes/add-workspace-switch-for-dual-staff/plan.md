# Workspace switch for dual staff accounts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A staff account with `admin` and `prepare` or `review` gets an Office / Cases switch that chooses between the existing office and volunteer workspaces. The window remembers the choice, and the office case page points to cases the person could claim.

**Architecture:** One rule in `src/contracts.mjs` (`hasWorkspaceSwitch`, `inOfficeWorkspace`) replaces `isAdmin(person)` as the R55 choice in `staffScreen` and in the controller's screening start. The mode is a window choice (`workspaceMode`) saved by `window-state.mjs` the same way as `sidebarOpen`. The switch and the hint both send the DOM action `set-workspace-mode` with `data-mode`.

**Tech Stack:** Plain ES modules in the browser, `node:test` unit tests, the Playwright story in `tests/browser.mjs`.

**Spec:** `openspec/changes/add-workspace-switch-for-dual-staff/design.md` and `specs/staff-case-work/spec.md` and `specs/case-lifecycle/spec.md` in the same folder. Read both before starting a task.

## Global Constraints

- Only a `staff` principal (`principal.access === "staff"`) whose person has `admin` and at least one of `prepare` or `review` has the switch. Presenters never do.
- Mode values are exactly `"office"` and `"cases"`. The default is `"office"`. Anything else stored is dropped.
- Exact copy: switch group label "Workspace"; buttons "Office" and "Cases"; hint "You can claim this case — switch to Cases" / "You can review this case — switch to Cases" (an em dash, U+2014); hint button "Switch to Cases".
- No database, RPC, policy, migration, client-text or catalogue change. Staff screens stay English.
- Fictional data only in tests: reuse the story's invented names; a new staff person is "Morgan Diaz" (fictional).
- Commit messages follow the repo's style ("Area: what now holds") and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A dual account on a Request sent case in Cases mode** must not move it to Screening. The volunteer page shows no office work (design D7). Pinned in Task 2.
2. **A stored `"cases"` read by an account that lost `review`**, or by an admin-only or presenter window, must show R55's workspace with no switch. Pinned in Tasks 1 and 3.
3. **Switching on All cases or Add a case to Cases** must land on the Work board, not a blank or office screen. The controller state must change too, so a reload does not restore an office screen. Pinned in Task 2.
4. **The hint on a case the dual person prepared** (review_ready, they are a participant) must not appear, because the claim would be refused as SELF_REVIEW. Pinned in Task 4.
5. **Pressing the mode already pressed** must change nothing: no redraw-induced tab reset, and no screening re-send. Pinned in Task 2.

---

### Task 1: The workspace rule

**Files:**
- Modify: `src/contracts.mjs` (beside `isStaffWindow`, line ~134)
- Create test: `tests/workspace-mode.test.mjs` (there is no `tests/contracts.test.mjs`)

**Interfaces:**
- Produces:
  - `export const WORKSPACE_MODES = Object.freeze(["office", "cases"])`
  - `export const hasWorkspaceSwitch = (principal, person) => boolean`
  - `export const inOfficeWorkspace = (principal, person, mode) => boolean`: with the switch, `mode !== "cases"`; without it, whether `person.capabilities` includes `"admin"`

- [ ] **Step 1: Write the failing tests**

```js
const staff = { access: "staff" };
const presenter = { access: "presenter" };
const p = (...capabilities) => ({ id: "x", name: "X", capabilities });

test("only a staff account with admin and volunteer work has the switch", () => {
  assert.equal(hasWorkspaceSwitch(staff, p("admin", "review")), true);
  assert.equal(hasWorkspaceSwitch(staff, p("admin", "prepare", "followup")), true);
  assert.equal(hasWorkspaceSwitch(staff, p("admin", "followup")), false);
  assert.equal(hasWorkspaceSwitch(staff, p("prepare", "review")), false);
  assert.equal(hasWorkspaceSwitch(presenter, p("admin", "review")), false);
  assert.equal(hasWorkspaceSwitch(staff, null), false);
  assert.equal(hasWorkspaceSwitch(null, p("admin", "review")), false);
});

test("the mode chooses the workspace only for an account with the switch", () => {
  const dual = p("admin", "review");
  assert.equal(inOfficeWorkspace(staff, dual, "office"), true);
  assert.equal(inOfficeWorkspace(staff, dual, "cases"), false);
  assert.equal(inOfficeWorkspace(staff, dual, undefined), true);
  assert.equal(inOfficeWorkspace(staff, p("admin"), "cases"), true, "admin-only ignores a stored mode");
  assert.equal(inOfficeWorkspace(staff, p("review"), "office"), false);
  assert.equal(inOfficeWorkspace(presenter, dual, "cases"), true, "a presenter keeps R55");
  assert.equal(inOfficeWorkspace(presenter, null, "office"), false);
});
```

- [ ] **Step 2: Run to verify they fail.** Run `node --test tests/workspace-mode.test.mjs`. Expected: FAIL, the exports are not defined.
- [ ] **Step 3: Implement the three exports in `src/contracts.mjs`,** with a comment naming Ruling R55 and issue #104.
- [ ] **Step 4: Run to verify they pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** Message: "Workspace rule: a staff account with admin and volunteer work can choose its workspace".

### Task 2: The remembered mode and screening in the controller

**Files:**
- Modify: `src/window-state.mjs` (`FIELDS`, ~line 63)
- Modify: `src/controller.mjs` (initial state ~line 360; `persistSession` ~480; `restoreSession` ~497; `toggleSidebar` neighbourhood ~1365 for the new method; `actingAdmin` ~1438; the returned API ~2939)
- Test: `tests/window-state.test.mjs`, `tests/controller.test.mjs`

**Interfaces:**
- Consumes: `WORKSPACE_MODES`, `inOfficeWorkspace` from Task 1.
- Produces:
  - controller state `workspaceMode: "office" | "cases"`, default `"office"`, reset to `"office"` on sign-out as `sidebarOpen` is reset
  - `controller.setWorkspaceMode(mode)`: an unknown mode throws `refuse("VALIDATION", …)` and changes nothing. The current mode is a no-op that does not redraw. Otherwise it sets the mode, sets `caseTab = "overview"`, moves `screen` from `office-cases`/`office-add-case` to `"staff"` when the new mode is `"cases"`, persists, calls `show()`, then `void startScreeningIfDue()`

- [ ] **Step 1: Write the failing window-state test** in `tests/window-state.test.mjs`:

```js
test("the workspace mode is kept only when it is office or cases", () => {
  const window = createWindowState({ sessionStorage: fakeSession() });
  window.write("user-1", { screen: "staff", workspaceMode: "cases" });
  assert.deepEqual(window.read("user-1"), { screen: "staff", workspaceMode: "cases" });
  window.write("user-1", { screen: "staff", workspaceMode: "admin" });
  assert.deepEqual(window.read("user-1"), { screen: "staff" });
});
```

- [ ] **Step 2: Write the failing controller tests** in `tests/controller.test.mjs`, after the add-staff-identity block. Use `STAFF_PRINCIPAL` with a dual person: `{ id: "person-riley", name: "Riley Park", capabilities: ["admin", "review", "followup"] }`.
  - `"a dual staff account starts in office, switches, and a reload keeps the mode"`: `getState().workspaceMode === "office"` after start; after `setWorkspaceMode("cases")` it is `"cases"`; a second `build` on the same `fakeSession()` restores `"cases"`; after `signOut()` it is `"office"`.
  - `"switching to cases from an office screen lands on the board"`: `navigate("office-cases")`, then `setWorkspaceMode("cases")`, then `screen === "staff"`; and on `staff-case` it stays `staff-case` with `caseTab === "overview"`.
  - `"an unknown mode is refused and the current mode changes nothing"`: `assert.throws(() => controller.setWorkspaceMode("admin"))`; the state is unchanged; calling `setWorkspaceMode("office")` while in Office leaves `caseTab` as it was (set it to `"documents"` first).
  - `"a dual staff account in cases starts no screening; switching to office starts it"`: with `RECEIVED`, `setWorkspaceMode("cases")`, `selectCase("case-r")`, `tick()`, `startWrites(store).length === 0`; then `setWorkspaceMode("office")`, `tick()`, it is `1` and its `personId` is `"person-riley"`.
  - The existing tests "an admin persona opening a Request sent case starts screening, once" and "a volunteer persona starts nothing…" must pass unchanged. They are the presenter half of R55.
- [ ] **Step 3: Run to verify they fail.** Run `node --test tests/window-state.test.mjs tests/controller.test.mjs`. Expected: the new tests FAIL.
- [ ] **Step 4: Implement.** Add `workspaceMode` to `FIELDS` with `asMode = (v) => (WORKSPACE_MODES.includes(v) ? v : undefined)`. Carry it in `persistSession` and `restoreSession` beside `sidebarOpen`. Add `setWorkspaceMode` per the Interfaces block and export it. Change `actingAdmin()` to `inOfficeWorkspace(state.principal, person, state.workspaceMode)` after its `staffWindow()` check.
- [ ] **Step 5: Run to verify they pass.** Run `npm test`. Expected: all PASS.
- [ ] **Step 6: Commit.** Message: "Workspace mode: the window remembers it, and screening starts only from the office".

### Task 3: The shell and the sidebar switch

**Files:**
- Modify: `src/views.mjs` (`isAdmin` and `staffSidebar` ~lines 186–220; `staffScreen` ~line 254 and the `ui` object for the case page)
- Modify: `src/styles.css` (beside `.sidebar-account` / `.account-row`, ~line 2741)
- Test: `tests/shell.test.mjs`

**Interfaces:**
- Consumes: `hasWorkspaceSwitch`, `inOfficeWorkspace` (Task 1); `state.workspaceMode` (Task 2).
- Produces: `staffScreen` passes `ui.canSwitch: boolean` to `renderAdminCase` (Task 4 reads it). The switch markup is `<div class="workspace-switch" role="group" aria-label="Workspace">` holding two `button(…, "set-workspace-mode", "text", 'data-mode="office" aria-pressed="true|false"')` buttons. It sits inside `.sidebar-account`, before `.account-row`.

- [ ] **Step 1: Write the failing tests** in `tests/shell.test.mjs`:
  - `"a dual staff account's sidebar has the switch above Signed in as, with its mode pressed"`: `staffSidebar({ screen: "staff", principal: { access: "staff" }, workspaceMode: "office" }, dual, true)` matches `/aria-label="Workspace"/`. The index of `data-mode="office"` is before the index of `Signed in as`. The office button has `aria-pressed="true"` and the cases button `aria-pressed="false"`.
  - `"no switch for admin-only, volunteer-only and presenter windows"`: `doesNotMatch /set-workspace-mode/` for a staff `["admin","followup"]`, a staff `["prepare","review"]`, and `{ access: "presenter" }` with a dual persona.
  - `"in cases a dual account gets the volunteer shell"`: `staffScreen` with a staff principal, `people: [dual]`, `selectedPersonId: dual.id`, `screen: "staff"`, `workspaceMode: "cases"`, `cases: []`, `lists: {}` matches `/Work board/` and does not match `/Follow-ups/`. With `workspaceMode: "office"` the reverse holds, and `/All cases/` appears.
  - `"a stored cases mode does not move an admin-only account"`: same call with an `["admin"]` person and `workspaceMode: "cases"` matches `/Follow-ups/` and has no `set-workspace-mode`.
- [ ] **Step 2: Run to verify they fail.** Run `node --test tests/shell.test.mjs`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** In `staffScreen`, `office = inOfficeWorkspace(state.principal, person, state.workspaceMode)`. Pass `canSwitch: hasWorkspaceSwitch(state.principal, person)` in the case page `ui`. In `staffSidebar`, render the switch when `hasWorkspaceSwitch(state?.principal, person)`, reading the pressed mode from `state.workspaceMode ?? "office"`. Update the R55 comment above `isAdmin` to say a dual staff account chooses by mode. Keep `isAdmin` only if something still uses it.
- [ ] **Step 4: Style `.workspace-switch`** as a two-segment control with the existing sidebar tokens; `[aria-pressed="true"]` shows the selected segment. It must wrap within the sidebar at 390px.
- [ ] **Step 5: Run to verify they pass.** Run `npm test`. Expected: all PASS, including the existing "the staff sidebar carries the logo…" test.
- [ ] **Step 6: Commit.** Message: "Staff sidebar: an Office / Cases switch for a staff account with admin and volunteer work".

### Task 4: The claim hint on the office case page

**Files:**
- Modify: `src/admin-views.mjs` (`renderAdminCase`, ~line 1135; Overview panel list)
- Test: `tests/admin-views.test.mjs`

**Interfaces:**
- Consumes: `ui.canSwitch` (Task 3); `staffRights` already computed in `renderAdminCase` from `staffEligibility(record, person)`.
- Produces: in the Overview list, immediately before `officeActionsPanel(...)`, `<p class="field-note workspace-hint" data-role="workspace-hint">TEXT ${button("Switch to Cases", "set-workspace-mode", "text", 'data-mode="cases"')}</p>`, or `""`.

- [ ] **Step 1: Write the failing tests:**
  - `"a dual account sees the review hint on a case waiting for a reviewer"`: `renderAdminCase({ stage: "review_ready", preparerId: "alex", participants: ["alex"], reviewerId: null, … }, { person: { id: "morgan", name: "Morgan Diaz", capabilities: ["admin", "review"] }, canSwitch: true })` matches `/You can review this case — switch to Cases/` and `/data-action="set-workspace-mode"[^>]*data-mode="cases"/`.
  - `"…and the claim hint on a case waiting for a preparer"`: `stage: "preparation_ready"`, no preparer, a person with `["admin", "prepare"]` matches `/You can claim this case — switch to Cases/`.
  - `"no hint on a case the person prepared, or without the switch"`: `review_ready` with `participants: ["morgan"]` gives no `workspace-hint`. The first case with `canSwitch: false` (or omitted) gives no `workspace-hint`.
- [ ] **Step 2: Run to verify they fail.** Run `node --test tests/admin-views.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** a small `workspaceHint(staffRights, view)`. Claim wording wins when `claimPreparation().allowed`; review wording when `claimReview().allowed`; otherwise `""`.
- [ ] **Step 4: Run to verify they pass.** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: "Office case page: a dual account is told when it can claim the case".

### Task 5: Wiring the action

**Files:**
- Modify: `src/app.mjs` (`EXITS` ~line 1699; `runNavigation` ~line 1735)
- Test: covered by the browser story (Task 6); `app.mjs` has no unit harness for `runNavigation`

**Interfaces:**
- Consumes: `controller.setWorkspaceMode` (Task 2); `data-mode` on the buttons (Tasks 3, 4).
- Produces: `EXITS["switch-to-cases"] = () => { formDrafts.clear(); controller.setWorkspaceMode("cases"); }`. A `case "set-workspace-mode":` in `runNavigation`. With `target.dataset.mode === "cases"` it does `if (leaveAddCaseFirst("switch-to-cases", target)) break; EXITS["switch-to-cases"](); break;`. Otherwise it calls `controller.setWorkspaceMode(target.dataset.mode)`. The existing `confirm-leave-add-case` path then runs the exit by `dialogContext.to`.

- [ ] **Step 1: Implement** as in the Interfaces block. Also clear form drafts when leaving a case page by mode: the other workspace's case page holds other forms. Calling `formDrafts.clear()` in both branches is enough.
- [ ] **Step 2: Run `npm test`.** Expected: PASS (no regressions).
- [ ] **Step 3: Commit.** Message: "Workspace switch: the sidebar and the hint switch mode, through Add a case's leave guard".

### Task 6: The browser story

**Files:**
- Modify: `tests/browser.mjs`: a new `phase(...)` immediately after "two staff accounts work one case, each signed in as themselves" and before "nothing threw…"

**Interfaces:**
- Consumes: `fixture.database.staff({ key, name, capabilities })`, `fixture.database.preparedCase()` (review_ready, prepared by Alex), `loginTestUser`, `openWindow`, `readSignedInAs`, `findOnBoard`, `watchAlerts`, `assertConsoleQuiet`, `REFUSAL_LINES`, `ARRIVAL_MS`, `readWindowState` and the screenshot pattern from the previous phase.

- [ ] **Step 1: Write the phase** `"a staff account with admin and review switches workspace and claims a review"`:
  - Add Morgan Diaz, `capabilities: ["admin", "review", "followup"]`, and Casey Wu, `["admin", "followup"]` (both fictional). Build `caseId = preparedCase()`.
  - Morgan signs in (heading "Follow-ups"). Assert `readSignedInAs === "Morgan Diaz"`; `[data-action="set-workspace-mode"]` count is 2; Office is `aria-pressed="true"`; the sidebar has Follow-ups and All cases.
  - Open the case by its reference. Assert the overline "OFFICE WORKSPACE" and `[data-role="workspace-hint"]` with "You can review this case — switch to Cases". Take a 390px screenshot of the hint for the design check, and assert no horizontal overflow.
  - Press Switch to Cases. Assert the overline "VOLUNTEER WORKSPACE" on the same reference, and that Cases is pressed. Press Claim review and wait for the stage Review in progress. Assert `case_events` for `CLAIM_REVIEW` names Morgan's person.
  - Reload. Assert Cases is still pressed and `readWindowState(...).workspaceMode === "cases"`.
  - Press Office. Assert Follow-ups and All cases are in the sidebar.
  - Casey signs in in a second window. Assert Follow-ups with no `set-workspace-mode`. The earlier phase already covered Riley (`prepare`, `review`) and Jordan (`review`), so assert there that neither window shows `set-workspace-mode` (add that one assertion to the existing loop over the two pages).
  - The presenter window has no `set-workspace-mode` and still has `select-person`.
  - Both new windows pass `assertConsoleQuiet`. Record `evidence.story.workspaceSwitch` as one sentence.
- [ ] **Step 2: Run `npm run test:browser`** with the local stack running (`docs/setup.md`). Expected: all phases PASS (about 11–16 minutes).
- [ ] **Step 3: Commit.** Message: "Story: a staff account with admin and review switches to Cases and claims a review".

### Task 7: Checks

- [ ] **Step 1:** Run `npm test`. Expected: PASS.
- [ ] **Step 2:** Run `npm run test:browser`. Expected: PASS (already run in Task 6; run again only if anything changed since).
- [ ] **Step 3:** Run `npx openspec validate --all`. Expected: every item valid.
- [ ] **Step 4:** Record for `verify.md`: the database suites were not run (no migration, SQL or RPC change); sign-in was not run (`auth.mjs` and the sign-in flow are untouched); `build:hant -- --check` was not run (no client text).
