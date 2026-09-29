# ViTally redesign — review, DESIGN.md proposal, and implementation plan

> **Where the designs live.** The interactive HTML designs are kept outside the repository (the gitignored `.stitch/designs` folder on the designer's machine, and the ViTally Stitch project). This folder has the written review, the design system (`DESIGN.md`), and screenshots of the final screens in `screens/`. The "before" captures used for the presentation are also kept outside the repository, in `.stitch/captures`.

Scope: the static pages and screenshots in `.stitch/designs` (current set listed under `currentScreens` in `.stitch/metadata.json`), compared with the running app (`src/*.mjs`, `src/styles.css`, the Supabase schema). `.stitch/captures` (the "before" screenshots) is kept for the presentation.

**Status (updated Sep 28, 2026).**
- The group answered all twelve decisions (section 3), and the screens they affected were redesigned the same day.
- Phase 0 of the plan is implemented on the `phase-0-foundations` branch.
- Part 1 PRs 1–3 (work board, case page, client screens) are merged; PR 4 (office screens) is in review, and part 1 is done when it merges.
- Still open: certification levels (D9) and a confirmation of the serif font (D11).

**Canonical design files** (everything else in `.stitch/designs` is an earlier iteration):

| Area | File |
|---|---|
| Volunteer dashboard | `volunteer-dashboard-v4.html` |
| Work board | `staff-board-v7.html` (volunteer) · `admin-work-board.html` (admin case pool) |
| Add a case | `add-case-v6.html` |
| Case page · reviewer / preparer / corrections dialog | `case-detail-v2-lav.html` · `case-preparer-view-v3.html` · `case-corrections-dialog-lav.html` |
| Case page · all tabs (preparer, Client #093) | `case-tabs.html` |
| Client intake, desktop | `intake-step1…9-v2.html` (step 5 as `intake-step5-zh-v2.html`); earlier: `intake-step3-lav.html`, `intake-step4-situation-lav.html`, `intake-step5-household-zh-v2-lav.html`, `intake-step6-income-lav.html`, `intake-step7-lav.html`, `intake-step8-fix-lav.html`, `intake-step9-fix-lav.html` |
| Client intake, mobile (not in the MVP) | `intake-mobile-step1…9.html` |
| Admin | `admin-dashboard-v2.html`, `admin-followups.html`, `admin-post-update.html`, `admin-season-settings.html`, `admin-people.html` |

---

## 1. Inconsistencies

### Between the designs and the app
1. **Stages.** The designs use the ~20-stage lifecycle from `docs/media/return-lifecycle.svg` ("Pending intake", "Filing in process", "Accepted"…). The app has 9 stages (`STAGES` in `src/contracts.mjs`), enforced by the database. *Decided (D1): adopt the lifecycle. The boards now group stages into phases (section 3), which replace the old status tabs (`STATUS_GROUPS` in `src/staff-views.mjs`).*
2. **Client numbers** (#093…) appear everywhere. The data model only has the Application ID (`VT-XXXX-XXXX`). Nothing stores or sequences client numbers. *Decided (D2): assigned on submit, restarting at #001 each season.*
3. **Intake questions.** The designs follow the drafts in `docs/intake-questions/` (9 steps). The app has 4 steps and 17 whitelisted answer keys (`INTAKE_ANSWER_KEYS`, migrations 001/003/009). The volunteer "Add a case" form also uses the 9-section layout. *Decided (D3): replace the intake with the drafts.*
   - **The two drafts share the same field IDs.** `intake-questions.md` (standard) and `intake-questions-senior-v2.md` (senior) differ only in wording.
   - **The English screens had followed the senior draft** without saying so. They now show the standard wording by default and the senior wording behind a switch.
4. **Styling technology.** The design files use the Tailwind CDN, Material Symbols and Stitch's token names. The app uses hand-written `src/styles.css` with `:root` variables and its own SVG `icon()` helper in `src/ui.mjs`, with no framework and no build step for CSS. Implementation must port tokens and patterns into `styles.css`, not copy Tailwind markup.
5. **Headline font.** The designs render Georgia; the Stitch design system says Noto Serif. The app uses Georgia (`--serif`). *Decided (D11): keep Georgia (to be confirmed).*
6. **Documents.** The designs show uploads ("Take photo", file chips). The app only simulates documents (README: "document uploads … are simulated"). *Decided (D4): keep simulated documents for now.*
7. **Privacy wording.** The work board showed client phone numbers while its footnote still said "no taxpayer names, no addresses". The app's board deliberately shows workflow only. *Decided (D5): phones are masked on every list, and the redesigned boards' footnotes say so.*
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

**Responsive.** Mobile layouts are out of the MVP (D12), client intake included. Only client intake has a mobile design, and it still shows the senior wording only. All volunteer and admin screens were checked at 1280 and 1440px only. There's no tablet or phone layout. Phones would need the sidebar as an overlay (`appShell` already does this below 800px), tables as stacked cards and drawers full-screen. The contribution graph resizes down to about 1024px; below that it scrolls sideways inside its card.

**States with no design yet:**
- **Empty:**
  - no cases, or nothing in a board filter
  - an empty follow-ups queue
  - no notifications
  - a dashboard before the season has any activity
  - a returning-client search with no match (designed)
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
| Add a case | `add-case-v6.html` | **Returning client search** (D2) at the top: search earlier seasons by name or phone (phones masked in results) and review the kept details. Each detail has a checkbox so you can leave out anything that changed. It also lists what to ask again (documents, income, filing status, bank account, best time). Filled sections get a "From last season · check" tag; months in the home, student and disability are asked again; old client numbers aren't reused. **Materials received** now uses the D9 checklist. |
| Client intake, all 9 steps | `intake-step1-v2.html` … `intake-step9-v2.html` (step 5 in Chinese: `intake-step5-zh-v2.html`) | **Standard wording is the default** (`intake-questions.md`). A "Senior version" switch in the top bar, and the new first question "Would you like to use the senior version of this form?", switch to the senior wording (`intake-questions-senior-v2.md`). Both versions use the same field IDs, so switching keeps every answer. Step 2 adds **Best time to reach you** (weekday mornings, afternoons or evenings, weekends, any time, plus a note). The help card shows the office phone and email. |

**Intake wording.** Every desktop step now shows the standard wording (`intake-questions.md`) by default, and the senior wording (`intake-questions-senior-v2.md`) when the switch is on, in English and in Chinese (step 5). The wording comes from the drafts. A few extra hints from the earlier designs are kept in both versions (for example the name example on step 5). The mobile intake still shows only the senior wording; it is after the MVP. Both drafts now include `form_version` (Q0.1) and `best_contact_time` / `best_contact_note` (Q1.8–Q1.9).

### Straightforward implementation details (no decision needed)
- *Done in Phase 0:*
  - **Tokens:** added as a separate `--vt-*` block rather than by renaming `--ink` / `--blue`. Each screen switches to them when it is restyled, so screens that aren't restyled yet don't change.
  - **Logo:** served as `src/pcdc-logo.png`, now that the server also serves PNG files.
  - **Icons:** added to `icon()`.
  - **Sidebar:** `appShell()` provides the sidebar and toggle.
- Remember whether the sidebar is open in `window-state.mjs` (session storage, per user).
- Tabs are phases (section 3). A phase is computed from the stage plus who is assigned, in one function beside `describeStage()`, and the stage badge color comes from a stage → family map in the same place.
- Masked phones come from one helper. It shows the number only to admins, and to volunteers on their own cases. It never puts the full number in a `title` or other attribute.
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
   - Georgia headlines (D11)
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
7. **Content rules:** bilingual wording in standard form style (家庭成员, not literal translations); standard wording by default with the senior wording behind a switch; the office contact on client screens; how the deadline is computed; the privacy notes.
8. **Component-to-code mapping:** the table in section 5, so the document stays tied to the implementation.

*So far:* `DESIGN.md` gained section 8 (phases, masked phones, access, waiting times). The restructure above is still to do.

---

## 5. Mapping designs to existing components and data flows

| Design element | Existing code | Data / actions today | Gap |
|---|---|---|---|
| Sidebar shell, account row | `appShell()` and `header()` in `src/views.mjs`; persona picker in `src/presenter-views.mjs` | `state.principal`, `state.people`, `selectedPersonId` (window state) | Nav destinations beyond board/office don't exist; the toggle isn't wired yet |
| Work board: phase tabs, filters, table | `staffScreen()` → board renderer in `src/staff-views.mjs` (`STATUS_GROUPS`, `DEFAULT_BOARD_FILTERS`) | `state.cases` via `supabase-store.mjs`; realtime refresh | Phases instead of status tabs; client number, labels, masked phone, location, lifecycle stage names |
| Admin case pool | Office board in `src/admin-views.mjs` | Same cases | Phase tabs; filters for location and prepared/reviewed by; phone reveal for admins |
| Case page: next step, tabs, history | Staff case view in `src/staff-views.mjs`; `case-actions.mjs`; `caseButton()` actions (`CLAIM_PREPARATION`, `SUBMIT_REVIEW`, `CLAIM_REVIEW`, `APPROVE_REVIEW`, `VERIFY_DOCUMENT`, …) | Capability checks decide which buttons show, which is exactly what the "Your next step" card needs | Household panel and best time need new fields; the corrections dialog maps to the existing request-corrections flow |
| Add a case | Assisted intake panel in `src/admin-views.mjs` (`assistedIntakeForm`) | `SAVE_ANSWERS`, `SUBMIT` | 9 sections (D3); the materials checklist (D9); returning-client search needs a kept-details store across seasons (name, phone, date of birth, address, household only) |
| Client intake steps | `intakeScreen()` / `intakeBody()` in `src/client-views.mjs`; `screening()` in `domain.mjs` | Draft answers, `formStep`, save status, conflict reconcile | Language switcher (no i18n layer yet); a wording layer for standard/senior (`form_version`, saved with the answers); best time to reach; new question types |
| Follow-ups queue | Office queues in `src/admin-views.mjs` (intake checks, available work, follow-up, assistance) | `VERIFY_INTAKE`, `REMIND`, `RECORD_CONTACT`, `RESOLVE_FOLLOWUP`, `CLAIM` / `RESOLVE`, `CLOSE_CASE` | Call outcome and "next follow-up" fields; best time |
| Notifications, Post an update | none (the notice banner is transient) | — | New table and read acknowledgements |
| People | `tools/admin/roster.mjs` (CLI roster), `people` rows with capabilities | Workspace roster, capabilities | Certification, languages, days, phone sharing, invite UI |
| Season settings | none | — | Settings table; the deadline function (already written in the designs' JS) |
| Dashboards and contribution graph | none | Case events exist (history) | Aggregation query over case events (refunds dropped, D8); unclaimed-case aging for admins |

---

## 6. Recommended first screen: the **Work board**

- **It uses the new shell** (sidebar, tokens, logo, status tabs, stage badges), so later screens reuse most of it.
- **It needs no new data** if built with the current 9 stages, Application IDs and existing filters. Client numbers, labels, masked phones and the lifecycle stages arrive with the Phase 5 data work.
- **The three volunteer tabs work on today's stages:**
  - Available: submitted and nobody has claimed preparation.
  - Waiting for preparation: claimed and being prepared, or sent back for corrections.
  - Waiting for review: waiting for a reviewer or in review.

  No test depends on the old tab names.
- **It's the busiest volunteer screen** and is easy to demo side by side with `.stitch/captures/staff-board.png`.
- **Its behavior is well tested already** (board filters, available work, persona read-only state), so regressions will show up in the existing suites.

---

## 7. Phased implementation plan (preserving existing functionality)

> **Superseded.** The plan is now `docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md`: a roadmap of eight parts, with part 1 (the visual restyle) specified in full. The phases below are kept for reference.

**Guardrails for every phase:**
- `npm test`, `npm run test:database`, `npm run test:auth-browser` and `npm run test:browser` stay green.
- `data-action`, ids, roles and accessible names don't change.
- Each phase is its own branch and PR.
- MVP scope follows D6: SMS, messaging, Schedule, the Documents page and mobile layouts are after the MVP.

**Phase 0 · Foundations (no visible behavior change)** · done
- Tokens in `styles.css`: a second `:root` block of `--vt-*` tokens (palette, accents, stage families, phases, labels, waiting-time colors, Georgia headlines, sidebar width, 44px tap size). No existing rule reads them yet; each screen adopts them when it is restyled.
- Logo: `src/pcdc-logo.png` (the PCDC file, unchanged). The `server.mjs` allowlist now also serves `/src/*.png` as `image/png`.
- Icons in `ui.mjs`: sidebar, dashboard, board, calendar, message, bell, settings, label, pin, plus, eye, filter, expand, more, history, people, megaphone, chart; `ICON_NAMES` lists them.
- `appShell()` in `views.mjs` with its CSS: sidebar plus corner toggle (`data-action="toggle-sidebar"`, wired in Phase 1). Without a sidebar it returns the page unchanged.
- D11 (Georgia) and D10 (presenter controls stay) need no code change.
- Tests: `tests/shell.test.mjs`, plus the logo route in `tests/server.test.mjs`. `npm test` passes. The browser and database suites still need a run: they reset the local Supabase.

**Phase 1 · Work board restyle (recommended first screen)** · next
- Sidebar shell (with only destinations that exist) and the corner toggle, with its open/closed state remembered per user.
- The volunteer board's three phase tabs (Available, Waiting for preparation, Waiting for review) with Mine / Everyone, built on today's 9 stages.
- Stage badges and the table in the new tokens.
- Empty, read-only and connection states.

**Phase 2 · Case page restyle**
- "Your next step" card, driven by the existing capability checks.
- Tabs over the existing sections.
- Plain-language history.
- The corrections dialog wired to the existing action.
- The household panel and best time, once their fields exist (Phase 5).

**Phase 3 · Client flows restyle, still on the current 4 steps**
- Sign-in, reference card, applications, intake and progress in the new client shell.
- Language switcher UI only (English), to prepare for i18n.
- The senior-version switch and the office contact card.

**Phase 4 · Office restyle**
- The Follow-ups queue built from the existing queues and actions, with the "Log a call" drawer mapped to `RECORD_CONTACT` / `RESOLVE_FOLLOWUP`.
- The admin case pool, with phase tabs and the location and prepared/reviewed-by filters.

**Phase 5 · Data-model features, per decision** (each needs a migration and tests)
- Client numbers, restarting each season, plus the returning-client search in Add a case (D2)
- Lifecycle stages (D1), then the Filing, Needs attention, Done and Closed phases
- The new intake questions, with 9-step intake and "Add a case", and `form_version` for the standard/senior wording (D3)
- Labels, groups and pinned cases (D6)
- Notifications with Post an update and acknowledgements
- People (extending the roster) and Season settings
- Best time, the materials checklist, phone masking and the access rules (D9, D5)

**Phase 6 · Insight and reach**
- Dashboards: the volunteer's claimed cases by phase, and the contribution graph (D8)
- Admin office overview: unclaimed cases by age and language with Assign, and each volunteer's cases
- i18n with Chinese intake (D3)

**Phase 7 · After the MVP**
- Case-based messaging (D7) and SMS
- Real document uploads (D4) and the Documents page
- Schedule, where volunteers add their own office hours (D9)
- Mobile intake and responsive volunteer and admin layouts (D12)
- Certification levels, once the group decides (D9)
