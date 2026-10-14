## Why

D5 and DESIGN.md §8 say a client's phone shows masked, as `(•••) •••-1234`, and that only people who work on the case may reveal it. Today the staff case page shows the full number to anyone allowed to see contact details. Anyone else gets a sentence instead of the card, so the two cases look nothing alike. A projected or shared screen also shows the full number with no action needed. Issue #44 starts with this display layer. Staff identity and database rules come in the next change.

## What Changes

**Contact details card and answers panel: allowed viewers**

This covers office/admin on any case, and a volunteer on a case they prepare or review (`canSeeContact`).

- From: the Phone and Spouse phone rows show the full number as plain text.
- To:
  - The rows show `(•••) •••-1234` with a lavender eye icon.
  - Hover or keyboard focus swaps in the full number.
  - After a click, the number stays shown until focus leaves, so it can be selected and copied.
  - Screen readers always read the full number, which is a text node and never an attribute.
- Reason: D5 / §8. A shared screen should not show a number until someone asks for it.
- Impact: non-breaking. The number is one hover or focus away.

**Contact details card and answers panel: viewers who are not allowed**

This covers a volunteer on an unclaimed case or on someone else's case.

- From:
  - The contact card is replaced by the `CONTACT_NOT_SHOWN` sentence.
  - The answers panel leaves out the phone rows.
- To:
  - Both places show the phone rows masked and muted, with a lock icon and the tooltip "Claim this case to see the full number".
  - The full number is never in the page.
  - Best time and the note stay hidden behind the unchanged `CONTACT_NOT_SHOWN` sentence.
- Reason: D5 / §8.
- Impact: these viewers now see the last four digits, which is slightly more than before. D5 accepts that.

**One helper**

- One view helper renders every client phone on staff screens.
- It takes the value and whether the viewer is allowed, and `canSeeContact` stays the only rule.

**DESIGN.md §8 "Masked phone"**

- From: "There's no click-to-copy, so a shared screen never keeps a number on display."
- To: the number stays shown only while the mask has focus, and there is no copy button.

**Unchanged**

- The draft 13614-C buttons stay hidden from viewers who are not allowed, and the PDF keeps the full number.
- Office Add a case and the client's own screens are unchanged.
- No list shows a phone today, and none is added.

**Display-only masking**

- The full number still reaches the browser for every staff persona: RLS lets them all read `case_contacts`.
- Real protection comes with the staff-identity / database change (production roadmap §1).

## Capabilities

### New Capabilities
- `staff-case-work`: what staff see and do on a case page. It starts with how a client's phone numbers are shown, masked or revealable, depending on whether the chosen persona works on the case.

### Modified Capabilities
None. `draft-13614c` and `client-intake` keep their requirements.

## Impact

- **Code:**
  - `src/staff-views.mjs`: the contact card, the answers panel's contact rows, and the new phone helper.
  - `src/styles.css`: the mask, the reveal and the locked state.
  - `src/admin-views.mjs` reuses the same tab and needs no change of its own.
- **Tests:**
  - `tests/staff-views.test.mjs` and `tests/admin-views.test.mjs` (updated).
  - New unit tests for the helper.
  - `tests/browser.mjs`: the before-claim and after-claim contact checks, plus hover, focus, click and blur. The `staff-contact-hidden` screenshot changes.
- **Docs:** `docs/design/DESIGN.md` §8.
- **Not affected:**
  - the database, migrations, RPCs, RLS and realtime;
  - the catalogue and client text;
  - existing `data-action` values, ids, roles and accessible names.
- **Checks:** `npm test` and `npm run test:browser`.
