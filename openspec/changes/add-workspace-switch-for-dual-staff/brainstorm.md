<!--
Raw capture of the brainstorm. The design was brainstormed and approved
elsewhere (all 5 promotion criteria held); the user handed over its
conclusions and asked that they be written here as they stand, without
asking again. The code observations below were read on 2026-10-30 to ground
those conclusions; they do not reopen any decision.
-->

# Brainstorm: a workspace switch for dual staff accounts

## Background

- **Ruling R55** picks the whole staff shell from the acting person: a person
  with `admin` gets the office workspace (Follow-ups, All cases, Add a case,
  the office case page), everyone else the volunteer workspace (Work board, the
  volunteer case page). In code that is `isAdmin(person)` in
  `src/views.mjs` (`staffScreen`, `staffSidebar`).
- A **presenter** gets around this by switching persona. A **staff account** is
  one person (add-staff-identity) and cannot switch.
- **The finding (issue #104).** Rehearsing with real staff accounts on
  2026-10-30, Jordan Lee, who holds both `admin` and `review`, saw only the
  office workspace and could never reach *Claim review*. The roadmap entry
  "One person, two workspaces" in `docs/developer/production-roadmap.md`
  records it as needed on day 1 of the pilot.
- **PCDC in practice.** Three or four admins sometimes prepare or review a
  case; running the office is their main job.

## Decisions

### Q1. Scope

Give a staff account that holds `admin` **and** `prepare` or `review` an
**Office / Cases** mode switch.

Out of scope: the case page's panel logic (which panels an office or volunteer
page shows), the database, and presenters.

### Q2. Approach

- **Chosen: a mode switch.** The account picks which of the two existing
  workspaces it is in; each workspace stays as it is.
- **Rejected: one case page showing both the office and the volunteer actions.**
  It would mean rewriting how the office and volunteer panels exclude each
  other, for a situation that comes up only occasionally.

### Q3. Where the switch lives and how it behaves

- In the sidebar, **above "Signed in as"**, with two options: **Office** and
  **Cases**.
- Shown **only to dual accounts** (staff, `admin` plus `prepare` or `review`).
- **Default: Office.**
- **Remembered per person** through `window-state.mjs`, the same mechanism as
  `sidebarOpen`, so a reload keeps the mode.

### Q4. A hint on the office case page

On a case page in Office mode, when the signed-in person could claim the case
(`staffEligibility`'s `claimPreparation` or `claimReview` allows it), the
action area shows one line: "You can claim / review this case — switch to
Cases". Pressing it switches to Cases mode and stays on that case.

### Q5. Cases mode

Cases mode is the ordinary volunteer workspace. What the person can claim is
decided by the database from their capabilities, as for any volunteer.

### Q6. Dependencies

None outside the browser code. All ready.

### Q7. Acceptance

- A dual account signs in to Office mode and sees the switch.
- Switching to Cases shows the work board, and the person can Claim.
- Switching back to Office shows Follow-ups and All cases.
- A reload keeps the mode.
- Accounts with one capability, and admin-only accounts, have no switch, and
  their screens are unchanged.
- The hint appears on a case the person can claim, and switches mode.
- Presenters are unchanged.
- Checks: `npm test` and `npm run test:browser` (the story gains a scene: a dual
  account switches mode and claims a case). The database is not touched.

### Q8. Historical reading

`docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md`,
the sidebar section and the office persona section. What still holds: the
sidebar runs top to bottom as brand, navigation to screens that exist, then
the account row (the acting person, Need help?, Sign out); `toggle-sidebar`
flips `sidebarOpen`, saved per user in `window-state.mjs`, a missing or
unreadable value meaning open; office personas get Follow-ups and All cases;
the office case page uses the same frame and tabs as the volunteer one.

## What the code shows (grounding, not new decisions)

- `staffScreen` in `src/views.mjs` computes `office = isAdmin(person)` once and
  uses it for the sidebar, the case page (`renderAdminCase` or
  `renderStaffCase`), the home screen (Follow-ups or Work board) and the office
  screens (`office-cases`, `office-add-case`). A volunteer on an office screen is
  already sent to the board. So the mode only has to change that one boolean
  for a dual account.
- The home screen key is `staff` in both workspaces, so a switch on the home
  screen lands on Follow-ups or the Work board without a navigation.
- `src/controller.mjs` `actingAdmin()` starts screening when an admin opens a
  Request sent case. It reads the capability, not the workspace.
- `window-state.mjs` keeps a `FIELDS` allowlist with a shape check per field;
  `sidebarOpen` uses `asBoolean`. A new field joins that list with its own
  check, and `persistSession`/`restoreSession` in the controller carry it.
- Leaving Add a case goes through `leaveAddCaseFirst` in `src/app.mjs`, which
  asks before typed answers are lost.

## Details settled while writing these artifacts

These follow from the decisions above. They are recorded so the reviewer can
correct them; none changes the scope.

1. **Screening follows the workspace, not the capability.** In Cases mode a
   dual account sees the volunteer case page; quietly starting screening there
   would move the case from a page that shows no office work. So opening a
   Request sent case starts screening only in Office mode. (The canonical
   requirement "Screening starts when an admin first opens a case" is modified
   to say so.)
2. **Hint wording.** One line, one of two forms: "You can claim this case —
   switch to Cases" when preparation can be claimed, "You can review this case —
   switch to Cases" when the review can be claimed. "Switch to Cases" is the
   button.
3. **Switching from Add a case** goes through the same leave guard as the
   sidebar's other exits.
4. **Switching on the case page** stays on the same case and shows the other
   workspace's case page. Switching on an office-only screen (All cases)
   to Cases lands on the Work board, as the code already does for a volunteer.
5. **Stored value.** `workspaceMode`, `"office"` or `"cases"`; anything else is
   ignored and the window falls back to Office. It is honoured only for a dual
   staff account; for a presenter or any other account it is ignored.
