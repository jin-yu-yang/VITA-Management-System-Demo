## Why

D5 says a client's phone is masked everywhere on lists. The staff-board-v7 and admin case pool mockups both show a masked Phone column. #68 masked the phone on the staff case page only, so DESIGN.md §8 still says "no list shows a phone". A volunteer who wants to call a client they just claimed has to open the case first. This change adds the masked column to both lists, reusing #68's helper and rule, so the board and the pool match the case page.

## What Changes

**Volunteer work board and admin case pool: a Phone column**

- From: neither table shows a phone.
- To:
  - Both tables get a "Phone" column right after Stage. It shows the client's phone only, never the spouse's.
  - Where the viewer may see the case's contact details (`canSeeContact`: their own cases, or any case for office staff and admins), the phone is a revealable mask. Hover or keyboard focus shows the full number, as on the case page. Each mask has a per-row id (`board-phone-<caseId>`, `pool-phone-<caseId>`), so a realtime redraw keeps a revealed number revealed.
  - Anywhere else (an available case, or a case someone else prepares or reviews), it is the locked mask: lock icon, tooltip "Claim this case to see the full number", not focusable, and no full number in the page.
  - A case with no phone shows "—", like other empty list cells.
  - In each row, the case link comes before the phone in tab order.
- Reason: D5 / DESIGN.md §8, and the two mockups.
- Impact: non-breaking. Revealable rows add one tab stop each.

**Footnotes**

- From: each table's note says it shows workflow only.
- To: that note stays, and each gets one sentence about masked phones.

**The list read**

- From: a presenter's `listCases` makes three grouped reads (participants, open follow-ups, open requests).
- To: a fourth grouped read, `case_contacts` with `case_id,phone` only, scoped to the listed cases. Each list record gets a `phone` field. A client's list is unchanged.

**DESIGN.md §8 "Masked phone"**

- From: "Today that is the case page's contact card and intake answers; no list shows a phone."
- To: the sentence names the case page, the volunteer work board and the admin case pool.

**Display-only masking**

- The full number still reaches the browser for every staff persona. RLS lets them all read `case_contacts`, and the case page already loads it. The mask is a screen rule.
- Real protection comes with the staff-identity / database change (production roadmap §1). The PR says so, as #68's did.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `staff-case-work`: adds requirements for the masked phone on the volunteer work board and the admin case pool, under the same rule as the case page. The case-page requirements are unchanged. The spec's Purpose line still names only the case page; updating it is a follow-up, because archive does not edit a Purpose.

## Impact

- **Code:**
  - `src/supabase-store.mjs`: `listCases` adds the phone-only grouped read.
  - `src/staff-views.mjs`: the board's Phone header and cell, and the footnote sentence.
  - `src/pool-views.mjs`: the pool's Phone header and cell, the footnote sentence, and `renderCasePool` taking `person`.
  - `src/views.mjs`: passes `person` to `renderCasePool`.
- **Tests:**
  - `tests/staff-views.test.mjs` and `tests/pool-views.test.mjs`: the new column.
  - `tests/store.test.mjs`: five summary fields and four reads, where it pins four and three.
  - `tests/browser.mjs`: a two-window claim check that the row unlocks in place, plus tab order.
- **Docs:** `docs/design/DESIGN.md` §8.
- **Not affected:**
  - the database, migrations, RPCs, RLS and realtime;
  - the case page, the office follow-up queue and the client's screens;
  - existing `data-action` values, ids, roles and accessible names.
- **Checks:** `npm test`, then `npm run db:migrate:test` and `npm run test:browser`.
