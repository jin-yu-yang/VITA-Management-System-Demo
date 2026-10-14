<!--
Raw capture of superpowers:brainstorming output.

本檔原樣捕捉 brainstorming skill 的產出，不強制結構。
Skill 的自然產出通常是 decision log 格式（背景 → 決議鏈 Q1-Qn → 設計取捨），
但依對話內容可能有不同組織方式。

design.md 從本檔萃取並重新整理為結構化設計文件。

不要將本檔的內容複製到 design.md — design.md 是獨立的重組產物，
兩者互補但不重疊。
-->

# Brainstorm: mask-phone-numbers-on-screen

Decision log from the conversation on 2026-10-14 (explore, then a verbal
brainstorm with the user). Issue #44, "access and masking", first part.

## Background

**The request.** Mask phone numbers on screen. Whether the full number shows
depends on the persona currently chosen in the persona picker.

- **In scope:** the display layer only.
- **Out of scope:** staff identity (linking people to accounts, removing the
  persona picker, splitting the presenter role) and database-level access (RLS,
  the select policy on `case_contacts`). That is the next change; see section 1
  of `docs/developer/production-roadmap.md`.

**Sources of the rule:**

- D5 in the decisions table of `docs/design/redesign-review.md`.
- `docs/design/DESIGN.md` §8, "Masked phone" and "Access".

### Explore findings (re-checked on `main` at fc80386)

**Where a client phone shows on staff screens today:**

- **A. Contact details card** (case page, Intake answers tab): the Phone and
  Spouse phone rows, `contactCard` in `src/staff-views.mjs`.
  - A viewer who may not see contact details gets the sentence
    `CONTACT_NOT_SHOWN` in place of the whole card.
- **B. "What the client told us"** (`answersPanelV2`): the `tp_phone` and
  `sp_phone` rows.
  - Rows are left out entirely when `showContact` is false.
- **C. The admin/office case page**, which reuses `intakeAnswersTab`
  (`src/admin-views.mjs`), so A and B apply there too.
- **D. The draft 13614-C PDF.** It prints the full phones.
  - Its three buttons render only when `canSeeContact` is true.
- **E. Office "Add a case".** A data-entry form; the phone sits in an input
  value and in the printed summary.
- **F. The client's own screens:** their own number.
- **No list shows a phone at all:** the work board, office case pool,
  follow-ups queue, log-call drawer and presenter views. The follow-ups queue
  shows only the contact preference ("Phone call").
- `(215) 922-6156` in `src/ui.mjs` is PCDC's office number, not client data.

**The rule already lives in one function:** `canSeeContact(record, person)` in
`src/intake-catalogue.mjs`.

- It returns true for `followup` or `admin` on any case.
- For a volunteer, it returns true only as the case's preparer or reviewer.
- It mirrors 013's `works_on_case`.
- Sam is the only persona with `admin`, and Sam also has `followup`. Alex is
  `prepare` and Morgan is `review`.

**Tests that read phones:**

- **`tests/browser.mjs`:**
  - Line 798 asserts `CONTACT_NOT_SHOWN` in the contact card before the claim.
  - Line 799 asserts `SAMPLE_PHONE` (`/\(215\) 555-01\d\d/`) is nowhere in the
    app text before the claim.
  - Lines 820–830 assert the Phone row matches `SAMPLE_PHONE` after Alex claims.
  - The screenshot `staff-contact-hidden` is taken before the claim.
- **`tests/auth-browser.mjs`** reads no phones.
- **Unit tests:**
  - `tests/admin-views.test.mjs` (~748) checks Sam's intake tab for the full
    number.
  - `tests/staff-views.test.mjs` (~1391–1398) checks the answers panel hides
    the phone rows without contact rights and shows `<strong>(215) 555-01xx</strong>`
    with them.

**Specs:** `openspec/specs/` has `client-intake` and `draft-13614c`. Nothing
canonical covers the staff case page.

## Decision chain

**Q1. Which treatment do allowed viewers get on the case page?**

- **Options:**
  - **(a)** The brief as written: full number for a claimed volunteer, mask with
    a reveal for an admin.
  - **(b)** DESIGN.md §8 everywhere: one widget for everyone.
  - **(c)** Full number for allowed viewers, a mask only for viewers who aren't
    allowed.
- **Decided (b).**
  - Allowed viewers (office/admin on any case, a volunteer on a case they
    prepare or review) see `(•••) •••-1234` with a lavender eye icon. Hover or
    keyboard focus swaps in the full number.
  - Viewers who are not allowed see the mask muted, with a lock icon and the
    tooltip "Claim this case to see the full number".
- **Constraint from the user:** for viewers who are not allowed, the full number
  is never in the DOM, not even as hidden text. Only allowed viewers get the
  hidden swap-in text.
- **Accepted disclosure:** showing the last four digits to viewers who aren't
  allowed reveals slightly more than today's sentence. D5 says to show them, so
  it is accepted. It must be written down explicitly in design.md.

**Q2. Which capability?** A new `staff-case-work`, one of the names CLAUDE.md
already suggests. Considered: a narrow `contact-privacy`. Rejected because it is
a name the team does not use.

**Q3. What does a viewer who is not allowed see in the contact card and the
answers panel?**

- **Decided:** masked rows, with the lock, in both places.
  - **Contact card:** the Phone and Spouse phone rows show masks.
  - **Best time and note:** these stay hidden. The `CONTACT_NOT_SHOWN` sentence
    shows in their place, with its wording unchanged.
  - **Answers panel:** shows the `tp_phone` / `sp_phone` rows masked, instead of
    leaving them out.
  - An empty spouse phone still reads "Not given".
- **Considered:** masks in the card only, keeping the answers panel's rows left
  out. Rejected as inconsistent with §8.

**Q4. Defaults the user accepted:**

1. **The draft 13614-C buttons stay hidden** from viewers who are not allowed.
   The PDF needs the full number, and masking it would mean changing
   `draft-13614c`.
2. **Out of scope:** office Add a case and the client's own screens. Those are
   data entry or the client's own number, not staff display.
3. **CSS-only reveal** (with the additions in Q5 and Q6).
4. **One helper renders the phone**, something like `phoneMask(value, allowed)`,
   next to the shared view helpers. The contact card and the answers panel both
   call it with `canSeeContact` as `allowed`, so `canSeeContact` stays the single
   rule.

**Q5. Click to copy.**

- **The user's addition:** clicking the mask keeps the full number shown until
  focus leaves, so a volunteer can select and copy it to call the client.
- **How:** with `tabindex="0"`, a click focuses the element and `:focus-within`
  covers it. This must be tested.
- **Conflict surfaced:** §8 says "There's no click-to-copy, so a shared screen
  never keeps a number on display".
- **Resolved:**
  - "No click-to-copy" means no copy button and nothing written to the clipboard
    for the user.
  - Selecting the text and copying it manually is allowed.
  - The number stays shown only while the mask has focus.
- **The user asked that this change also update DESIGN.md §8** to say exactly
  that, so the design doc and the code agree when this lands.

**Q6. Screen readers.** Pick one approach and use no attributes holding a
number.

- **Decided, for allowed viewers:**
  - The full number is always in the accessibility tree, as an ordinary text
    node in `.phone-full`.
  - `.phone-full` uses sr-only styling until `:hover` / `:focus-within`, which
    shows it normally.
  - The dots (`.phone-dots`) are `aria-hidden="true"` and hidden on reveal.
  - The eye icon is `aria-hidden` (the `icon()` helper already sets that).
- **Accepted:** the full number is ordinary page text for allowed viewers, so
  find-in-page and select-all copying include it. The user accepted this because
  those viewers may see the number. It goes in design.md.
- **Decided, for viewers who are not allowed:**
  - The dots are `aria-hidden`.
  - An sr-only text reads "Ends in 1234. Claim this case to see the full number."
  - The lock icon is `aria-hidden`.
  - `title="Claim this case to see the full number"` holds the sentence only.
  - The element is not focusable, since there is nothing to reveal.
- **Rejected:** rendering the full number only after focus. It needs JavaScript
  and state, and does not work with the `innerHTML` re-renders.

Sketch (allowed):

```html
<span class="phone-mask" tabindex="0">
  <span class="phone-dots" aria-hidden="true">(•••) •••-0123</span>
  <span class="phone-full">(215) 555-0123</span>
  <svg class="icon" aria-hidden="true">…eye…</svg>
</span>
```

Sketch (not allowed):

```html
<span class="phone-mask is-locked" title="Claim this case to see the full number">
  <span class="phone-dots" aria-hidden="true">(•••) •••-0123</span>
  <span class="sr-only">Ends in 0123. Claim this case to see the full number.</span>
  <svg class="icon" aria-hidden="true">…lock…</svg>
</span>
```

## Constraints carried from the request

- Don't change existing `data-action` values, ids, roles or accessible names.
- Fictional data only.
- Staff screens stay English.
- The PR description must say this is display-only masking:
  - the full number still reaches the browser (the store reads `case_contacts`
    for every staff persona);
  - real protection comes with the staff-identity / database change.

## Acceptance (agreed)

**Unit tests for the helper:**

- Not-allowed output contains no full number (no first six digits in any form)
  and no `tabindex`.
- Allowed output contains the full number only in a text node, never in an
  attribute.
- Empty values read "Not given".

**Unit tests updated** in `staff-views` and `admin-views`.

**Browser test, before the claim:**

- The mask and the lock show.
- `CONTACT_NOT_SHOWN` is still present.
- `SAMPLE_PHONE` is nowhere in the DOM.

**Browser test, after the claim:**

- Hover reveals the number.
- Keyboard focus reveals it.
- After a click, the number stays visible when the mouse moves away.
- It is hidden again after blur.

**Screenshot:** `staff-contact-hidden` is refreshed.

**DESIGN.md §8 "Masked phone"** is updated.

**Checks to run:**

- `npm test`.
- `npm run test:browser`.
- Not needed: the database suites, `test:auth-browser` and
  `build:hant -- --check`. No database, sign-in or Chinese text changes.

**Dependencies:** none external. `canSeeContact` and the `lock` / `eye` icons are
ready in the repo.
