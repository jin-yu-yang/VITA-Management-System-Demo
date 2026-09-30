# ViTally redesign: roadmap and part 1 (visual restyle)

Date: 2026-09-28

Status: Design approved section by section in conversation; written spec awaiting review. Phase 0 (tokens, logo, icons, `appShell()`) is implemented on the `phase-0-foundations` branch.

## 1. Purpose

Turn the redesign into work that can be built and reviewed in pieces.

This spec does two things:

1. **Sets the roadmap.** It replaces section 7 of `docs/design/redesign-review.md` as the plan. The review stays as background: inconsistencies, missing states, the decisions log (D1–D12), the phase table and the code mapping.
2. **Specifies part 1, the visual restyle, in full.** Parts 2–8 each get their own spec when they start.

The designs live outside the repository: `.stitch/designs` locally, and the ViTally Stitch project. `docs/design/screens/` holds screenshots, and `docs/design/DESIGN.md` holds the design system.

## 2. Roadmap

| # | Part | Delivers | Depends on | MVP |
|---|---|---|---|---|
| 1 | Visual restyle (4 PRs) | Shell and volunteer board → case page → client screens → office screens, on today's data | Phase 0 | Yes |
| 2 | Client numbers | Assigned on submit, restarting at #001 each season; shown wherever the designs show `#093` | — | Yes |
| 3 | Lifecycle stages | The ~25 stages in `docs/media/return-lifecycle.svg` replace today's 9, with the full phase set (Filing, Needs attention, Done, Closed) | 1 | Yes |
| 4 | New intake | The drafted questions, standard and senior wording (`form_version`), best time to reach, the client phone field, the materials checklist; 9-step client intake and Add a case; Chinese translation. Split into 4a catalogue and server, 4b client intake, 4c Add a case and staff views, 4d Chinese. | 1 | Yes |
| 5 | Access and masking | Masked phones; on available cases volunteers see intake answers only. Enforced by the database, not only on screen. | 4 | Yes |
| 6 | Returning clients | The kept-details store across seasons (name, phone, date of birth, address, household only) and the search in Add a case | 2, 4 | Yes |
| 7 | Team features | Labels, groups and pinned cases, notifications and posting, the teammate contact card with phone sharing, People, Season settings | 1 | Yes |
| 8 | Dashboards | Volunteer: claimed cases by phase, contribution graph. Admin: unclaimed-case aging, each volunteer's cases, office activity. | 3 | Yes |
| — | After the MVP | Case messaging and SMS, real uploads and the Documents page, Schedule (office hours), mobile layouts, certification levels | — | No |

**Order.** Client numbers come second because they are small, visible everywhere and independent. Returning clients follow the new intake, because the search fills in the new intake's fields. Access and masking follow the new intake, because the phone field arrives there.

**Rules for every part:**

- `npm test`, `npm run test:database`, `npm run test:auth-browser` and `npm run test:browser` pass.
- Existing `data-action` values, ids, roles and accessible names stay unless that part's spec says otherwise.
- Each part has its own spec, plan and PR(s).
- Only fictional data. The PCDC logo is the unchanged file `src/pcdc-logo.png`; it is never regenerated or recolored.
- **Part 1 changes no database schema.** Anything that needs a new column or table belongs to parts 2–8.

## 3. Part 1 approach

**Restyle in place, one screen group per PR.** The existing renderers (`staff-views.mjs`, `admin-views.mjs`, `client-views.mjs`, `presenter-views.mjs`, `views.mjs`) keep their role and data flow and emit new markup that uses the `--vt-*` tokens. Each PR deletes the CSS rules it replaces.

**Rejected alternatives:**

- **Parallel v2 renderers behind a switch.** This means two copies of every screen during the work and a large final PR.
- **The Stitch HTML with Tailwind.** It adds a CSS runtime or build step, and the Stitch markup lacks the app's accessibility and data hooks.

**Accepted trade-off.** Between PRs, restyled and older screens sit side by side. Shared elements, restyled in PR 1, keep the look consistent where it matters most.

## 4. Shared frame and elements (PR 1)

### Staff frame

The staff screens (work board and case, for volunteer and office personas) render inside `appShell()`.

- **Sidebar, top to bottom:**
  - The PCDC logo (`src/pcdc-logo.png`) and the ViTally wordmark.
  - Navigation to screens that exist. Volunteers get **Work board**. Office personas get **Office work**, and **All cases** from PR 4.
  - An account row at the bottom: the persona this window is acting as, **Need help?** and **Sign out**. Both keep today's accessible names and actions (`open-help`, `sign-out`).
- **Not in the sidebar in part 1:** Dashboard, Schedule, Documents, Messages, groups, pins, recent cases and notifications.
- **Toggle.** The `toggle-sidebar` action flips `sidebarOpen`. The state is saved per user in `window-state.mjs`, and a missing or unreadable value means open.
- **Presenter controls (D10).** They stay as a slim strip at the top of the main area, with the persona picker inside, working exactly as today.
- **Old site header.** Staff screens stop rendering it. Client screens keep it until PR 3.

### Shared elements (existing class names, restyled)

- **Buttons, form fields, radio cards, chips and links.** Lavender primary (`--vt-primary`), a minimum height of `--vt-tap` (44px), and focus rings in the token colors.
- **Stage badges.** `stageBadge()` maps today's stages to the design's families, and every badge keeps its words.

  | Stages | Family |
  |---|---|
  | `draft`, `received` | intake (blue) |
  | `preparation_ready`, `preparing`, `review_ready`, `reviewing` | preparation and review (grey) |
  | `corrections_required` | amendment (amber) |
  | `review_approved` | filing (green) |
  | `closed`, unknown | neutral |

- **Banners and toast.** The connection notice, notice banner, problem banner and `#toast`.
- **Empty states.** One pattern for every list: an icon, one sentence and an optional action.

## 5. PR 1: volunteer work board

### Tabs

The six status chips become three tabs. They keep the hook `data-action="set-board-filter" data-filter="status"` and take new values:

| Tab | `status` value | Today's stages |
|---|---|---|
| Available | `available` | `preparation_ready` with no preparer |
| Waiting for preparation | `preparation` | `preparing`, `corrections_required` |
| Waiting for review | `review` | `review_ready`, `reviewing` |

- **One source of truth.** A single function, `phaseTab(record)`, beside `describeStage()`, decides a case's tab and returns `null` for stages not on the board.
- **Default tab.** Available is the default.
- **Counts.** Each tab shows a count that respects the other filters.
- **Stages not on the board.** `draft` and `received` are office intake; `review_approved` and `closed` are finished. A line under the table says they can be found by Application ID, and will also appear on the dashboard (part 8).
- **Saved filters.** A saved status value from before (`all`, `mine`, `in_progress`, `waiting`, `done`) falls back to `available`.
- **Status line.** "In this view: … available, … mine…" is removed; the tab counts replace it.

### Mine / Everyone

- **Filter.** This reuses the `assignment` filter with the values `mine` and `anyone`, and shows only on the two "Waiting" tabs. The default is `anyone`, so reviewers can find returns to claim.
- **Your own rows.** Rows where you are the preparer or reviewer are tinted and listed first.
- **Old values.** The `unassigned` value is removed, and a saved `unassigned` falls back to `anyone`.

### Search (amended 2026-09-28)

- **Search box.** The board keeps the designed box, "Find an Application ID". Searching matches the Application ID across every case the window can see, in any stage, including cases that are on no tab (`draft`, `received`, `review_approved`, `closed`).
- **Results.** While a search is active, results replace the tab's rows. The Language and Service filters still apply; the tab and Mine / Everyone do not.
- **Leaving search.** Choosing a tab or **Clear search** ends the search.
- **Saved.** The search is saved with the other board filters (`boardFilters.search`).
- **Why.** Without it, a volunteer could not reopen a just-submitted, approved or closed case until the dashboards arrive (part 8).

### Other filters

Language and service stay as chip groups built from the data. They are restyled as compact pills and keep the same hooks.

### Table

| Column | Content |
|---|---|
| Application ID | Opens the case (`data-action="open-case"`) |
| Stage | The badge |
| Language, Service | From the answers |
| Preparer, Reviewer | Name; **You** in `--vt-you` for the current persona; "Unassigned" |
| Updated | Relative date from `updatedAt` |
| Actions | **Claim** (`CLAIM_PREPARATION`), **Claim review** (`CLAIM_REVIEW`) or **Open**. Refusals stay in place with their reason. |

- **Removed from the board.** Work needed, Requires and Last reminded. Last reminded remains on the case page.
- **Added in later parts.** Client number, labels, masked phone and location.

### States

- **No persona chosen.** The board is read-only, with today's note.
- **Empty tab.** Each tab has its own sentence: Available says "Nothing to claim right now."
- **Nothing matches.** A **Clear filters** action (`clear-board-filters`).
- **Connection lost.** The shared banner.
- **Narrow screens.** The table scrolls inside its card and the page never scrolls sideways. There is no phone layout.

## 6. PR 2: case page

### Header

- The Application ID and the stage badge.
- A lifecycle bar across today's 9 stages, with finished steps in `--vt-progress` and the current step highlighted.
- Preparer and reviewer name pills.
- **Back to the work board** (`open-board`).

### Tabs

| Tab | Contents |
|---|---|
| Overview (default) | **Your next step**, then Preparation milestones and Independent review |
| Intake answers | Today's "What the client told us" |
| Documents | Requests; send, verify and escalate |
| Follow-up | Office follow-up tasks |
| History | Existing events as plain-language sentences, with a staff view and a client view |

- **Pattern.** The tabs follow the ARIA tab pattern (`role="tab"`, `tabpanel`, arrow keys, Home and End).
- **Remembered tab.** A new `caseTab` window-state entry keeps the chosen tab. It resets to Overview when a different case opens.

### Your next step

- **Source.** It is built from `staffEligibility()` and the stage.
- **The action.** It shows the one action that fits the stage and persona: claim preparation, record milestones, send for review, claim review, approve, or request corrections.
- **When there is no action.** It says who the case is waiting on and why an action is refused.
- **No new actions.** It reuses the existing `data-case-action` buttons.

### Other changes

- **Request corrections.** It becomes the designed dialog, wired to the existing corrections action and fields.
- **Office persona.** The case page uses the same frame and tabs. The office panels go under Overview (intake checks, assisted answers, receipt, office actions) and Follow-up (follow-up tasks).
- **Not in PR 2.** The household panel, best time, labels and the contact card arrive in parts 4, 5 and 7.

## 7. PR 3: client screens

- **Screens covered.** Sign-in (email, then code), My applications, the Application ID reference card, today's 4-step intake, and the progress page.
- **Client frame.** A top bar with the logo, a language switcher, **Need help?** and **Save & exit**. In the switcher only English works; the other two languages show as disabled, marked "coming soon".
- **Intake.**
  - A step rail for today's 4 steps.
  - Near-black text (`--vt-intake-ink`), hints in `--vt-intake-hint`, and controls at least 44px.
  - Yes / No / Not sure question cards.
  - The existing save status and conflict (reconcile) form, restyled.
- **Help card.** It shows the office contact: (215) 922-6156 and vita@chinatown-pcdc.org, as tap-to-call and email links.
- **Progress page.** The client-facing lifecycle and document requests, in the new look.
- **Not in PR 3.** The senior-version switch waits for the new intake's senior wording (part 4).

## 8. PR 4: office screens

- **Office work.** It becomes the designed Follow-ups page, built from today's queues: intake checks, work waiting to be claimed, clients to call, and help requests. **Log a call** becomes a drawer mapped to `RECORD_CONTACT` and `RESOLVE_FOLLOWUP`.
- **Add a case.** Today's assisted intake form in the new layout, on the current fields.
- **All cases.** A new sidebar item for office personas: the admin case pool on today's data, with no schema change.
  - **Phase tabs.** Intake (`draft`, `received`), Available, Waiting for preparation, Waiting for review, Done (`review_approved`), Closed (`closed`), plus All.
  - **Filters.** Stage, language, service, prepared by and reviewed by (including Unassigned).
  - **Added in later parts.** Location and phone reveal (parts 4 and 5), and the full phase set (part 3).
- **Presenter dialogs.** Reset and checkpoint are restyled.

## 9. Testing and acceptance

**Per PR:**

- **All four test suites pass.**
- **Tests change only where behavior changes on purpose.**
  - Board tabs (PR 1): `staff-views.test.mjs` status values and counts, the Last reminded board check, and the `controller.test.mjs` status examples. The browser suite finds cases by searching, and its totals check the whole workspace (`tests/support/story-pages.mjs`, `tests/browser.mjs`).
  - Case tabs (PR 2): the browser suites open a tab before using its controls.
  - Office pool (PR 4).
- **Run the browser and database suites only when the local Supabase is free.** They reset the local Supabase on port 54321, so run them only when no other project is using it.

**New unit tests:**

- `phaseTab()` for all 9 stages, and fallback of old saved filter values (PR 1).
- `toggle-sidebar` and the window-state round trip (PR 1).
- "Your next step" for each stage and persona combination the eligibility rules allow, including refusals (PR 2).
- The case tab's keyboard behavior, and its reset on opening another case (PR 2).
- The pool's phase tabs and filters (PR 4).

**Visual check per PR:**

- Screenshots at 1440px and 1024px, compared with the Stitch design and the `.stitch/captures` "before" image.
- No horizontal page scroll.
- The served logo's hash matches `docs/media/Shao-Transparent BLUE.png`.

**Accessibility:**

- Every control is reachable by keyboard with a visible focus ring.
- The case-page tabs (PR 2) follow the ARIA tab pattern. The work board's tabs are filter toggle buttons (`aria-pressed` in a labelled group), because they filter one list and keep the `set-board-filter` hook.
- The dialog and drawer trap focus and return it on close.
- Color is never the only signal.
- Client controls are at least 44px, and contrast follows `DESIGN.md`.

**Part 1 is done when:**

- All four PRs are merged.
- Every staff and client screen uses the `--vt-*` tokens.
- Old palette variables and rules that are no longer used are deleted.
- `docs/design/screens/` shows the implemented screens.

## 10. Risks

- **Hidden controls on the case page.** The case tabs hide controls the browser tests use. PR 2 updates those tests to open the tab first.
- **Mixed look between PRs.** Accepted. Shared elements are restyled first to limit it.
- **Size of `styles.css`.** It has about 3,100 lines. Each PR deletes the rules it replaces, and review checks that the file does not simply grow.
- **Cases leave the volunteer board's tabs.** After PR 1, volunteers reach submitted, approved and closed cases through the search. The browser suite finds cases the same way, and it counts the whole workspace through the "Showing X of Y" total.

## 11. Out of scope for part 1

- Any database change.
- Client numbers, lifecycle stages, the new intake questions, the standard and senior wording, masked phones, labels, groups, pins, notifications, the contact card, People, Season settings, dashboards, i18n, and mobile layouts.
- These are parts 2–8 or after the MVP.
