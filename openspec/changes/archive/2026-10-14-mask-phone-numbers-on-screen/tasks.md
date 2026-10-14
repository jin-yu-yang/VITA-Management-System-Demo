## 1. The phone helper

- [x] 1.1 Write the unit tests first (`tests/staff-views.test.mjs`) for `phoneMask(value, allowed, id)`.

  **Allowed** (`"2155550123"` and `"(215) 555-0123"`):
  - the output has `class="phone-mask"`, `tabindex="0"` and the given `id`;
  - the dots span is `aria-hidden="true"` and reads `(•••) •••-0123`;
  - `(215) 555-0123` appears once, as text inside `.phone-full`;
  - no attribute value contains `555` or `215`, which you can check by scanning every `attr="…"`;
  - the eye icon is present.

  **Not allowed:**
  - the output contains no `215`, no `555`, no `tabindex` and no `id`;
  - it has `is-locked`, the lock icon, and `title="Claim this case to see the full number"`;
  - its sr-only text reads "Ends in 0123. Claim this case to see the full number.";
  - the dots span is `aria-hidden`.

  **Edge cases:**
  - an empty, null or missing value returns "Not given" (the contact card's wording, as today) in both states; the answers panel never passes an empty phone to the helper;
  - a value with fewer than four digits gives bullets only.

  Run the tests and see them fail.
- [x] 1.2 Add `phoneMask(value, allowed, id)` and a non-escaping row `htmlRow(label, html)` to `src/staff-views.mjs` (design D2–D6).
  - The full text comes from `formatAnswer(findQuestion(2, "tp_phone"), value)`.
  - The mask uses the last four digits only.
  - Every text part is escaped.

  The 1.1 tests pass.

## 2. The contact card and the answers panel

- [x] 2.1 Update the unit tests first. Run them and see them fail.

  `tests/staff-views.test.mjs` (around the `v2Panel` / contact-card tests):
  - **Allowed (Sam, or the case's preparer):**
    - the Phone and Spouse phone rows render through `phoneMask`, with the eye icon and `.phone-full`;
    - the best time, the note, and the edit button for an allowed editor are unchanged.
  - **Not allowed (a volunteer on an unclaimed case):**
    - the contact card keeps its "Contact details" heading;
    - it shows the locked Phone and Spouse phone rows, then the unchanged `CONTACT_NOT_SHOWN` sentence;
    - it has no best time, no note and no edit button;
    - the HTML contains no full number.
  - **Answers panel, not allowed:**
    - it now shows the `tp_phone` / `sp_phone` rows, locked;
    - it still leaves out `best_contact_time` and `best_contact_note`;
    - an empty required phone still reads "Not answered", for every viewer, as today (an empty optional phone shows no row).
  - **Draft buttons:** still not rendered for a viewer who is not allowed.

  `tests/admin-views.test.mjs` (~748): Sam's intake tab has the mask, the eye icon and the full number inside `.phone-full`, and no attribute carries it.
- [x] 2.2 Change `contactCard` in `src/staff-views.mjs` (design D7).
  - **Allowed:** the phone rows use `htmlRow` + `phoneMask(…, true, "contact-phone")` and `phoneMask(…, true, "contact-spouse-phone")`.
  - **Not allowed:** the heading, the two locked rows, then `<p class="muted">${CONTACT_NOT_SHOWN}</p>`.
  - Ids, `data-action` values, the heading and the `aria-labelledby` stay as they are.
- [x] 2.3 Change `answersPanelV2`.
  - The contact-field filter leaves out only `best_contact_time` and `best_contact_note` when `showContact` is false.
  - The `tp_phone` / `sp_phone` rows render through `phoneMask(…, showContact, id)`, with the id `answers-tp_phone` or `answers-sp_phone`.

  The 2.1 tests pass, and `npm test` passes.

## 3. Styles

- [x] 3.1 Add the `.phone-mask` styles to `src/styles.css`, next to the contact card's styles.
  - Tabular numerals.
  - `.phone-full` hidden with the same rules as `.sr-only` until `.phone-mask:hover` / `.phone-mask:focus-within`, which show it and set `.phone-dots` to `display: none`.
  - A visible focus outline in the existing focus style.
  - A lavender eye icon.
  - `.is-locked`: muted text (Quiet Slate) and the lock icon.
  - Use DESIGN.md's existing color tokens. Add no new color.

## 4. The browser story

- [x] 4.1 `tests/browser.mjs`, before the claim (around lines 777–805):
  - keep the `CONTACT_NOT_SHOWN` assertion;
  - assert the contact card and the answers panel each show a `.phone-mask.is-locked` with the tooltip `title`;
  - assert `SAMPLE_PHONE` matches neither `#app`'s `textContent` nor its `innerHTML`, which covers attributes;
  - the story retakes the `staff-contact-hidden` screenshot in `artifacts/browser/` (not committed; the tracked `docs/design/screens/implemented-staff-contact-hidden.png` is left as it is).
- [x] 4.2 `tests/browser.mjs`, after the claim (around lines 812–835):
  - keep the `textContent` check on the Phone row;
  - add visibility checks on the contact card's Phone `.phone-full`:
    - hidden by default (its box is the sr-only clip, so test `checkVisibility` or bounding size);
    - visible on hover;
    - hidden after the pointer moves away;
    - visible after keyboard focus (focus the span);
    - after a click and moving the pointer away, still visible;
    - hidden after focus moves elsewhere (`Tab` or a click on the heading).
- [x] 4.3 `tests/browser.mjs`, after Alex's contact edits (around line 984): a realtime update while the number is revealed.
  - Focus `#contact-phone`.
  - Change `case_contacts.best_contact_note` through the database fixture. The table is in the realtime publication (migration 011).
  - Wait for the staff page to redraw with the new note.
  - Assert `#contact-phone` still has focus and its number is still shown.
  - Put the note back and wait for it.
- [x] 4.4 Run `npm run test:browser`. Every phase passes.

## 5. DESIGN.md and the checks

- [x] 5.1 Update `docs/design/DESIGN.md` §8 "Masked phone" (design D8): replace "There's no click-to-copy, so a shared screen never keeps a number on display." with wording that says:
  - the number stays shown only while the mask has focus, so it can be selected and copied;
  - there is no copy button.
- [x] 5.2 Run `npm test` and `npm run test:browser`. Record in verify.md why the database suites, `test:auth-browser` and `build:hant -- --check` aren't needed:
  - no database, sign-in or Chinese text changes;
  - staff screens stay English.
- [ ] 5.3 The PR description says this is display-only masking:
  - the full number still reaches the browser for every staff persona (RLS lets them all read `case_contacts`);
  - real protection comes with the staff-identity / database change (production roadmap §1).
