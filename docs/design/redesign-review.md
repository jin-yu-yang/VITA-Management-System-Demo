# ViTally redesign — review, DESIGN.md proposal, and implementation plan

> **Where the designs live.** The interactive HTML designs are kept outside the repository (the gitignored `.stitch/designs` folder on the designer's machine, and the ViTally Stitch project). This folder has the written review, the design system (`DESIGN.md`), and screenshots of the final screens in `screens/`. The "before" captures used for the presentation are also kept outside the repository, in `.stitch/captures`.

Scope: the static pages and screenshots in `.stitch/designs` (current set listed under `currentScreens` in `.stitch/metadata.json`), compared with the running app (`src/*.mjs`, `src/styles.css`, the Supabase schema). Nothing here is implemented. `.stitch/captures` (the "before" screenshots) is kept for the presentation.

**Canonical design files** (everything else in `.stitch/designs` is an earlier iteration):

| Area | File |
|---|---|
| Volunteer dashboard | `volunteer-dashboard-v4.html` |
| Work board | `staff-board-v7.html` (volunteer) · `admin-work-board.html` (admin case pool) |
| Add a case | `add-case-v5-lav.html` |
| Case page · reviewer / preparer / corrections dialog | `case-detail-v2-lav.html` · `case-preparer-view-v3.html` · `case-corrections-dialog-lav.html` |
| Case page · all tabs (preparer, Client #093) | `case-tabs.html` |
| Client intake, desktop | `intake-step{1,2,3}-lav.html`, `intake-step4-situation-lav.html`, `intake-step5-household-zh-v2-lav.html`, `intake-step6-income-lav.html`, `intake-step7-lav.html`, `intake-step8-fix-lav.html`, `intake-step9-fix-lav.html` |
| Client intake, mobile (not in the MVP) | `intake-mobile-step1…9.html` |
| Admin | `admin-dashboard-v2.html`, `admin-followups.html`, `admin-post-update.html`, `admin-season-settings.html`, `admin-people.html` |

---

## 1. Inconsistencies

### Between the designs and the app
1. **Stages.** The designs use the ~20-stage lifecycle from `docs/media/return-lifecycle.svg` ("Pending intake", "Filing in process", "Accepted"…). The app has 9 stages (`STAGES` in `src/contracts.mjs`), enforced by the database. The board's status tabs (All work / Available / Mine / In progress / Waiting / Done) do match `STATUS_GROUPS` in `src/staff-views.mjs`.
2. **Client numbers** (#093…) appear everywhere. The data model only has the Application ID (`VT-XXXX-XXXX`). Nothing stores or sequences client numbers.
3. **Intake questions.** The designs follow the 105-question drafts in `docs/intake-questions/` (9 steps). The app has 4 steps and 17 whitelisted answer keys (`INTAKE_ANSWER_KEYS`, migrations 001/003/009). The volunteer "Add a case" form also uses the 9-section layout.
4. **Styling technology.** The design files use the Tailwind CDN, Material Symbols and Stitch's token names. The app uses hand-written `src/styles.css` with `:root` variables and its own SVG `icon()` helper in `src/ui.mjs`, with no framework and no build step for CSS. Implementation must port tokens and patterns into `styles.css`, not copy Tailwind markup.
5. **Headline font.** The designs render Georgia; the Stitch design system says Noto Serif. The app uses Georgia (`--serif`).
6. **Documents.** The designs show uploads ("Take photo", file chips). The app only simulates documents (README: "document uploads … are simulated").
7. **Privacy wording.** The work board shows client phone numbers while its footnote still says "no taxpayer names, no addresses". The app's board deliberately shows workflow only.
8. **Screens not redesigned.** Sign-in (email and code), the Application ID reference card, "My applications", the client progress page (`/client/case`), and the presenter reset / checkpoint dialogs still use the old look, which will clash once the shell changes.

### Among the designs themselves
9. **Two design generations.** Stitch-generated screens (board, case pages, intake) use Stitch token classes. Hand-built screens (dashboards, admin) use literal hex values. The same color is written two ways, which is fine visually but must converge on one token set in code.
10. **Sample data drift.**
    - Alex is "preparer" on case pages but "preparer & reviewer" on the dashboards.
    - Dates mix the September demo date with in-season dates (e.g. "Today, Sep 25, 2025" on step 9).
    - Board counts were fixed by hand once already.

    Cosmetic, but visible in a presentation.
11. **Sidebar content varies.** The volunteer screens show Groups / Pinned / Recent. The admin screens add "Office · Admin". The client side has no sidebar. That split is intended, but the account row, badges and the notification panel are duplicated per file.
12. **Lavender versus logo blue.** Brand elements use `#6A5ACD`; the logo stays `#546196`. This is intended, but it should be written down so nobody "fixes" the logo color.

---

## 2. Missing responsive layouts and interaction states

**Responsive.** Only client intake has a mobile design. All volunteer and admin screens were checked at 1280 and 1440px only. There's no tablet or phone layout: the sidebar would need to become an overlay, tables would need to become stacked cards, and the drawers full-screen. The contribution graph resizes down to about 1024px; below that it scrolls sideways inside its card.

**States with no design yet:**
- **Empty:**
  - no cases, or nothing in a board filter
  - an empty follow-ups queue
  - no notifications
  - a dashboard before the season has any activity
  - a day with no work
  - no labels
- **Loading / connection:** the app already has a connection notice, a notice banner and a problem banner (`src/views.mjs`), and a stale-revision "reconcile" flow in the client form. None of these has a redesigned look.
- **Errors and validation:** intake field errors, sign-in failures, the resend cooldown, "Create case" when answers are missing (partly designed), and failed saves.
- **Confirmations:** close case, deactivate person, unpublish update, send back for corrections (designed), and presenter reset (exists in the app, not redesigned).
- **Permissions:**
  - the read-only board before a persona is chosen
  - a reviewer viewing their own prepared return (not allowed in VITA)
  - a volunteer opening an admin URL
  - a disabled "Create case" with its reason
- **Feedback:** the app's toast (`#toast`) after actions has no redesign.
- **Keyboard and focus:** focus rings exist on the new controls. The drawers and dialogs close on Esc, but focus trapping and returning focus afterwards are not specified.
- **Dark mode:** not designed. Recommend declaring it out of scope for the MVP.

---

## 3. Proposed changes to existing functionality

### Decisions (answered by the group, Sep 28, 2026)
| # | Decision | Answer |
|---|---|---|
| D1 | Lifecycle stages | **Adopt the ~20-stage lifecycle soon** (`docs/media/return-lifecycle.svg`). The boards group stages into phases (below). |
| D2 | Client numbers | Assigned **on submit**; **restart at #001 each season**. Returning clients: VITA policy doesn't allow keeping documents, but we may keep **name, phone, date of birth, address and household members**. New feature: in **Add a case**, search last season's cases by name or phone and fill in the match. |
| D3 | Intake questions | Replace the 17-key intake with the drafts **soon**. Add one question at the start ("Would you like the senior version of this form?") with a short note that the senior version has shorter descriptions and simpler wording; answering yes gives the senior questions. |
| D4 | Documents | **Keep simulated documents** for now. |
| D5 | Phone numbers and access | **Masked everywhere on lists:** `(215) 555-1234` shows as `(•••) •••-1234`. **Admins** see every detail of every case (including documents) and can hover or focus to reveal a phone. **Volunteers** see every detail of the cases they claimed; on **available** (unclaimed) cases they can read the intake answers only, with no unmasked phone and no documents. |
| D6 | MVP scope | **In:** ~20 stages, client numbers, the new intake questions, groups and pinned cases, notifications and posting, the teammate contact card with phone sharing, admin People and Season settings, styling, work board, Add a case, dashboards, email OTP (magic link). **Out:** SMS, the messaging system, Schedule, Documents page, mobile layouts. |
| D7 | Case messaging | Build later as designed (not in the MVP); phone contact meanwhile. |
| D8 | Contribution graph | Derive from case events (completing preparation = preparing; approving or requesting corrections = reviewing). **Refunds dropped:** they would need TaxSlayer Pro's weekly report and more admin work. |
| D9 | New fields | **Best time to reach:** a new intake question; the client, volunteers and admins can edit it. **Materials checklist** (volunteers and admins edit): ID, SSN/ITIN, green card, birth certificate, W-2, 1099-NEC, 1099-MISC, 1099-INT, 1098-T, 1095-A, prior-year return (1040). **Certification levels:** still to be discussed by the group. **Usual days:** later becomes a Schedule tab where volunteers add office hours (e.g. "7–10 PM, Sep 29"); each volunteer edits only their own. |
| D10 | Presenter controls | **Keep** them; they will be implemented soon. |
| D11 | Serif font | Answered "Yes"; read as **keep Georgia** (the first option). Confirm if Noto Serif was meant. |
| D12 | Mobile | Not in the MVP (client intake included). |

**Office contact** for client-facing screens (help text, footers, error states): vita@chinatown-pcdc.org · (215) 922-6156.

### Phases: how the boards group the lifecycle stages
| Phase | Stages | Volunteer board tab |
|---|---|---|
| Available | Pending intake / filing, no preparer | **Available** |
| Waiting for preparation | Pending intake / filing (claimed), Filing in process (preparing), Same day in process | **Waiting for preparation** (Mine / Everyone) |
| Waiting on client | Request sent, Waiting for documents, Hold, Ready to exit (signature) | — (shown on the volunteer's dashboard) |
| Waiting for review | Pending review, Review in process | **Waiting for review** (Mine / Everyone) |
| Filing | Ready to e-file, Both e-filed, E-filed & paper, Both paper, IRS acknowledged | — |
| Needs attention | Rejected, Amendment needed, Amendment in progress | — |
| Done | Accepted, FSA | — |
| Closed | Out of scope, No need to file, Duplicate, Client unreachable, Dismissed, Withdrawn | — |

The admin case pool shows every phase as a tab.

### Screens redesigned after the decisions
| Screen | File | What changed |
|---|---|---|
| Volunteer work board | `staff-board-v7.html` | Only three tabs (Available, Waiting for preparation, Waiting for review); Mine / Everyone switch; masked phones (lock on cases you haven't claimed, hover to reveal on yours); **Intake** and **Claim** / **Claim review** actions; you can't claim review of a return you prepared |
| Admin case pool | `admin-work-board.html` | Every case, a tab per phase, filters for stage (all ~25, grouped), labels, language, service type (drop-off, online, same-day), location (Main office, Crane Center, other site), prepared by and reviewed by (including Unassigned); active-filter chips; hover to reveal phones |
| Volunteer dashboard | `volunteer-dashboard-v4.html` | "Your cases" chart: a bar of all your claimed cases by phase, phase chips that filter the table, a role switch (preparer or reviewer) and "Waiting on you"; the contribution graph moved to the bottom; refunds removed |
| Admin dashboard | `admin-dashboard-v2.html` | "Not claimed yet": aging tiles (over a week, 3–6 days, under 3 days), sorted by submission date or grouped by language, with Assign (volunteers who speak the language first); "Volunteers and their cases": pick a volunteer to see their cases by phase, with stalled cases flagged; no personal graph (the office activity graph is at the bottom) |
| Case page tabs | `case-tabs.html`, `case-preparer-view-v3.html` | Review tab removed: Overview, Intake answers, Documents, Follow-up, History |

**Still to design:** the returning-client search in Add a case (D2), the senior-version question (D3), the best-time question and the updated materials checklist (D9), and the office contact on client screens.

### Straightforward implementation details (no decision needed)
- Port the lavender tokens, accents and the near-black intake text rule into `src/styles.css` `:root`, keeping the variable names the CSS already uses where possible (`--ink`, `--blue` → primary, and so on).
- Add the PCDC logo file to the served assets. The server allowlist (`ASSET` in `server.mjs`) only permits `src/*.mjs|css|svg`, so either add a `.png` rule or convert the logo to SVG.
- Add the needed icons to `icon()` in `src/ui.mjs` (sidebar toggle, labels, notifications, call, and so on) rather than pulling in Material Symbols.
- Sidebar shell with the hot-corner toggle; remember its state in `window-state.mjs` (session storage, per user).
- Status tabs reuse `STATUS_GROUPS` and `inStatusGroup`; the stage badge color comes from a stage → family map beside `describeStage()`.
- Plain-language history strings come from the existing event types (a lookup table next to `domain.mjs`).
- Keep every `data-action`, `id`, `role` and accessible name the controller and browser tests rely on (`tests/browser.mjs`, `tests/auth-browser.mjs`). Restyling must not rename them.
- 44px minimum tap targets on client screens; the contrast values already recorded in `DESIGN.md`.

---

## 4. Proposed updates to DESIGN.md

`.stitch/DESIGN.md` already has the lavender palette and appended sections. I propose restructuring it into one current document (the older palette files stay as history):

1. **Principles:** calm, plain language; fictional data only; the real logo is never regenerated, recolored or re-hosted; nothing that looks like a ranking of volunteers.
2. **Tokens:**
   - primary `#6A5ACD` / `#5646b5`; background `#f8f7fd`; ink `#2a2745`, muted `#6c6886`
   - intake near-black `#1b1b1f`, hints `#5c5c66`
   - accents: you/unread red `#c53030` and `#dc2626`, progress green `#2f8a4c`, office amber `#b7791f`
   - stage families (intake blue, preparation & review grey, filing green, amendment amber, stopped red)
   - label colors; the 5-step graph scale
   - Georgia headlines (or Noto Serif, D11)
3. **Layout shells:**
   - volunteer/admin: collapsible sidebar with the hot-corner toggle
   - client: top bar with language switcher and step rail
   - mobile client: app bar, step and language bottom sheets, sticky Continue
4. **Component catalog:**
   - buttons, cards, tables, filter pills, status tabs, stage badges, label chips
   - person badge and teammate contact card (shown and hidden phone, self view)
   - drawers (Log a call, Invite / edit), dialogs (Request corrections)
   - question cards (Yes / No / Not sure, Who chips, repeating person group, income checklist with upload)
   - contribution graph and day panel, stat tiles, language bar, notifications panel
5. **States:** empty, loading, error, disabled-with-reason, confirmation, toast (from section 2).
6. **Responsive rules:** breakpoints, sidebar as overlay, tables to cards, drawers full-screen on phones.
7. **Content rules:** bilingual wording in standard form style (家庭成员, not literal translations); how the deadline is computed; the privacy notes.
8. **Component-to-code mapping:** the table in section 5, so the document stays tied to the implementation.

---

## 5. Mapping designs to existing components and data flows

| Design element | Existing code | Data / actions today | Gap |
|---|---|---|---|
| Sidebar shell, account row | `frame()` / `header()` in `src/views.mjs`; persona picker in `src/presenter-views.mjs` | `state.principal`, `state.people`, `selectedPersonId` (window state) | Nav destinations beyond board/office don't exist |
| Work board: tabs, filters, table | `staffScreen()` → board renderer in `src/staff-views.mjs` (`STATUS_GROUPS`, `DEFAULT_BOARD_FILTERS`) | `state.cases` via `supabase-store.mjs`; realtime refresh | Client number, labels, phone column, lifecycle stage names |
| Case page: next step, tabs, history | Staff case view in `src/staff-views.mjs`; `case-actions.mjs`; `caseButton()` actions (`CLAIM_PREPARATION`, `SUBMIT_REVIEW`, `CLAIM_REVIEW`, `APPROVE_REVIEW`, `VERIFY_DOCUMENT`, …) | Capability checks decide which buttons show, which is exactly what the "Your next step" card needs | Household panel and best time need new fields; the corrections dialog maps to the existing request-corrections flow |
| Add a case | Assisted intake panel in `src/admin-views.mjs` (`assistedIntakeForm`) | `SAVE_ANSWERS`, `SUBMIT` | 9 sections need D3; the materials checklist needs D9 |
| Client intake steps | `intakeScreen()` / `intakeBody()` in `src/client-views.mjs`; `screening()` in `domain.mjs` | Draft answers, `formStep`, save status, conflict reconcile | Language switcher (no i18n layer yet); new question types |
| Follow-ups queue | Office queues in `src/admin-views.mjs` (intake checks, available work, follow-up, assistance) | `VERIFY_INTAKE`, `REMIND`, `RECORD_CONTACT`, `RESOLVE_FOLLOWUP`, `CLAIM` / `RESOLVE`, `CLOSE_CASE` | Call outcome and "next follow-up" fields; best time |
| Notifications, Post an update | none (the notice banner is transient) | — | New table and read acknowledgements |
| People | `tools/admin/roster.mjs` (CLI roster), `people` rows with capabilities | Workspace roster, capabilities | Certification, languages, days, phone sharing, invite UI |
| Season settings | none | — | Settings table; the deadline function (already written in the designs' JS) |
| Dashboards and contribution graph | none | Case events exist (history) | Aggregation query over case events (refunds dropped, D8) |

---

## 6. Recommended first screen: the **Work board**

- **It uses the new shell** (sidebar, tokens, logo, status tabs, stage badges), so later screens reuse most of it.
- **It needs no new data** if built with the current 9 stages, Application IDs and existing filters. Client numbers, labels and phones can wait for D1, D2, D5 and D6.
- **It's the busiest volunteer screen** and is easy to demo side by side with `.stitch/captures/staff-board.png`.
- **Its behavior is well tested already** (board filters, available work, persona read-only state), so regressions will show up in the existing suites.

---

## 7. Phased implementation plan (preserving existing functionality)

**Guardrails for every phase:**
- `npm test`, `npm run test:database`, `npm run test:auth-browser` and `npm run test:browser` stay green.
- `data-action`, ids, roles and accessible names don't change.
- Each phase is its own branch and PR.

**Phase 0 · Foundations (no visible behavior change)**
- Tokens in `styles.css`.
- Logo asset, with the `server.mjs` allowlist updated.
- New icons in `ui.mjs`.
- A layout wrapper that can host the sidebar.
- Georgia headlines (D11); presenter controls stay (D10).

**Phase 1 · Work board restyle (recommended first screen)**
- Sidebar shell (with only destinations that exist) and hot-corner toggle.
- Status tabs, stage badges and table on the existing data.
- Empty, read-only and connection states.

**Phase 2 · Case page restyle**
- "Your next step" card, driven by the existing capability checks.
- Tabs over the existing sections.
- Plain-language history.
- The corrections dialog wired to the existing action.
- The household panel only once D9 is decided.

**Phase 3 · Client flows restyle, still on the current 4 steps**
- Sign-in, reference card, applications, intake and progress in the new client shell.
- Language switcher UI only (English), to prepare for i18n.

**Phase 4 · Office restyle**
- The Follow-ups queue built from the existing queues and actions, with the "Log a call" drawer mapped to `RECORD_CONTACT` / `RESOLVE_FOLLOWUP`.

**Phase 5 · Data-model features, per decision** (each needs a migration and tests)
- Client numbers, restarting each season, plus the returning-client search in Add a case (D2)
- Lifecycle stages (D1)
- The new intake questions, with 9-step intake and "Add a case" (D3)
- Labels, groups and pinned cases (D6)
- Notifications with Post an update and acknowledgements
- People (extending the roster) and Season settings
- Best time, the materials checklist, phone masking and the access rules (D9, D5)

**Phase 6 · Insight and reach**
- Dashboards and the contribution graph (D8)
- Admin office overview
- i18n with Chinese intake (D3)
- Mobile intake (after the MVP, D12)
- Responsive volunteer and admin layouts

**Phase 7 · Later**
- Case-based messaging (D7)
- Real document uploads (D4)
- Schedule and Documents pages
