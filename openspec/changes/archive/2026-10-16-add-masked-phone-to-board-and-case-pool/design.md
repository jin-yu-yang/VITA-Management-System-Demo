## Context

### What #68 left in place

- `phoneMask(value, allowed, id = "")` in `src/staff-views.mjs` renders a client phone on staff screens:
  - **Allowed:** `<span class="phone-mask" id=… tabindex="0">`, then the dots, the full number as a text node, and an eye icon. CSS swaps the number in on hover or focus.
  - **Not allowed:** `<span class="phone-mask is-locked" title="Claim this case to see the full number">`, then the dots, an sr-only "Ends in 1234. Claim this case to see the full number." and a lock icon. It has no id, no tabindex and no full number.
  - An empty value returns "Not given".
- `canSeeContact(record, person)` in `src/intake-catalogue.mjs` is the only rule: `followup` or `admin` on any case, otherwise only the case's `preparerId` or `reviewerId`.
- The canonical spec is `openspec/specs/staff-case-work/spec.md`, which has three case-page requirements.

### The two lists today

| | Volunteer work board | Admin case pool |
|---|---|---|
| Renderer | `renderStaffBoard` -> `boardRow(record, person, ui)` (`staff-views.mjs`) | `renderCasePool` -> `poolRow(record, now)` (`pool-views.mjs`) |
| Columns | Client, Stage, Language, Service, Preparer, Reviewer, Updated, actions | Client, Stage, Language, Service, Preparer, Reviewer, Updated |
| Who sees it | any staff persona that is not an admin (`views.mjs:217`) | admins only |
| Person in scope | yes | no (`views.mjs:273` passes `{filters, now}`) |
| Footnote | "This board shows workflow only: …" | "This pool shows workflow only: …" |

Both get their rows from `state.cases`, loaded by `listCases()`. For a presenter, that reads `cases` (`select *`, which has no phone) plus three grouped reads, `.in("case_id", ids)` with named columns. No phone reaches either list today.

### Refresh and focus

- A claim updates `cases` (`stage`, `preparer_id`/`reviewer_id`, `revision`). The claiming window runs `refresh()` -> `loadList()` and then opens the case. Every other window gets a realtime `cases` change -> `loadList()` -> redraw.
- A phone is written only by `act_save_answers`, which also updates `cases.answers`, so a phone edit reloads the list too.
- Before a redraw, `describeFocus` records the focused element's `id`, and focus goes back to it afterwards.

### Constraints

- Display-only: no database, migration, RPC, RLS or realtime change.
- Do not change existing `data-action` values, ids, roles or accessible names.
- Fictional data only. Staff screens stay English.

## Goals / Non-Goals

**Goals:**

- Both lists show the client's phone in a "Phone" column after Stage, rendered by `phoneMask`, with `canSeeContact` deciding the state.
- Locked rows never carry the full number, in text or in an attribute, and are not focusable.
- Revealable rows have a unique id per row, so a realtime redraw keeps focus on them and keeps the number revealed.
- In each row, the case link comes before the phone in tab order.
- A claim unlocks the row on any board showing it to the claimer, without a reload.
- DESIGN.md §8 matches the behaviour.

**Non-Goals:**

- Protecting the number from the browser (staff identity, RLS on `case_contacts`). That is roadmap §1.
- The spouse phone in lists.
- The case page, the office follow-up queue, the log-call drawer and the client's screens.
- Updating the `staff-case-work` Purpose line (follow-up).

## Decisions

### D1: Requirements go into `staff-case-work`
- **Choice:** ADDED requirements in the existing capability.
- **Reason:** the mask and its rule are specified there. A list requirement can point to that rule rather than restate it.
- **Alternative considered:** a new `work-board` capability. Rejected, because the phone rule would then live in two specs. The cost of the choice is that the Purpose line still says "case page"; the user owns that follow-up.

### D2: Load the phone with a fourth grouped read
- **Choice:** in the presenter branch of `listCases`, read `case_contacts` with columns `case_id,phone`, `.in("case_id", ids)`, alongside the other three. Each record gets `phone` (the row's phone, or `null` when the case has no contact row).
- **Reason:** it follows the existing pattern (Ruling R56: grouped reads, named columns, scoped to the listed ids). It asks for nothing the board doesn't show: no spouse phone, best time or note.
- **Alternatives considered:**
  - Join or embed through `cases`. Rejected: no other summary is read that way.
  - A last-four RPC or view. Rejected: it needs a migration and an RPC, which is a database change, and the number already reaches the browser through `getCase`.
  - Reading the whole contact row. Rejected: it carries more than the board shows.

### D3: One list helper, `phoneMask` inside
- **Choice:** a small exported helper next to `phoneMask` in `src/staff-views.mjs`, `listPhone(record, person, prefix)`, returns `phoneMask(record.phone, canSeeContact(record, person), prefix + "-" + record.id)`, or "—" when the record has no phone. Both tables put it in a plain `<td>` after the Stage cell; `pool-views.mjs` imports it.
- **Reason:** one place decides the list's empty wording, its id and its rule, so the board and the pool cannot drift. `phoneMask` already ignores the id for a locked mask, so locked rows get no id. Checking for an empty phone in the list keeps "Not given" for the contact card and gives lists the same "—" as their other empty cells.
- **Alternatives considered:** each table building its own cell (two copies of the same rule call); a list mode inside `phoneMask` for the empty wording (a parameter on a shared helper for one string). Both rejected.

### D4: Ids `board-phone-<caseId>` and `pool-phone-<caseId>`
- **Choice:** a prefix per table plus the case id.
- **Reason:** case ids are UUIDs, so the ids are unique on a page and valid. They can't collide with the case page's `contact-phone` and `answers-*` ids. `describeFocus` needs only the id to find the mask after a redraw.

### D5: The pool goes through `canSeeContact` too
- **Choice:** `views.mjs` passes `person` to `renderCasePool` in its `ui` object, and `poolRow` calls `canSeeContact(record, person)`.
- **Reason:** there is one rule. Today only admins reach the pool, so every pool row is revealable, but if the gate changes, the mask still follows the rule.
- **Alternative considered:** hard-coding `allowed = true` on the pool. Rejected because it would be a second rule.

### D6: Column after Stage; tab order follows the markup
- **Choice:** Phone is the third column in both tables.
- **Reason:** it matches both mockups. The first cell (`th scope="row"`) holds the client number as text and then the reference button, so tab order in a row is reference button -> phone -> actions, with no `tabindex` tricks. A unit test checks the markup order; the browser check checks real Tab.

### D7: Footnote sentences
- **Choice:** keep the "workflow only" notes and append:
  - board: "Phone numbers stay masked: on cases you work on, hover over or tab to a number to see it."
  - pool: "Phone numbers stay masked until you hover over or tab to them, so they don't show on a shared screen."
- **Reason:** the mockups explain the masking under each table. The existing notes are still true.

### D8: The browser check uses two windows of one persona
- **Choice:** window B (Alex) shows the case on the board through the board search, which reaches every stage, so the row stays listed after the claim moves the case off the Available tab. Window A (Alex) claims the `preparation_ready` case. B's row turns from locked to `#board-phone-<caseId>` without a reload. A, back on the board, shows it revealable too. In B, Tab from the row's reference button lands on the mask and reveals the number.
- **Reason:** a board claim moves the claiming window to the case page, so only another window can show the row unlocking in place. The `staffB` window pattern already exists (`tests/browser.mjs:1577`).

## Risks / Trade-offs

- [Trade-off] Every revealable row adds a tab stop (about 41 on the sample pool) → Accepted by the user, so the lists behave like the case page. The case link stays first in each row.
- [Trade-off] The full number for every listed case is now in browser state, not only the opened case → Accepted. It adds no exposure: `getCase` already loads it for any staff persona, and RLS allows the read. The PR says the change is display-only.
- [Risk] A phone changed in a way that doesn't touch `cases` would leave the board stale → Mitigation: today only `act_save_answers` writes a phone, and it updates `cases.answers`. A future writer that bypasses `cases` would need `case_contacts` added to the list's realtime triggers; noted for whoever adds one.
- [Risk] One more read per list load → Mitigation: it is one grouped read with two columns, the same shape as the three already there.
- [Risk] The wider table on narrow screens → Mitigation: the table wrapper already scrolls horizontally, and the mask keeps `white-space: nowrap`.

## Migration Plan

N/A: no deployment, database or configuration change. Rollback is reverting the commit.

## Open Questions

- The `staff-case-work` Purpose line still names only the case page. Owner: the user, as a follow-up after archive. It affects only the spec's wording.
