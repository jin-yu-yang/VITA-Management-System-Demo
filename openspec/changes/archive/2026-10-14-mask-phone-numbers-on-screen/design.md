## Context

### Who may see contact details

`canSeeContact(record, person)` in `src/intake-catalogue.mjs` decides who may see a case's contact details. It mirrors migration 013's `works_on_case`:

- office staff (`followup` or `admin`) on any case;
- a volunteer only as the case's preparer or reviewer.

In the demo, Sam has `admin` and `followup`, Alex has `prepare` and Morgan has `review`. The persona is whichever one is chosen in the persona picker. RLS lets every staff persona read `case_contacts`, so screens enforce the rule and the full number reaches the browser either way.

### Where a client phone shows on staff screens today

| Place | Allowed viewer | Viewer who is not allowed |
|---|---|---|
| Contact details card (`contactCard`, Intake answers tab) | full number in `detailRow` | whole card replaced by `CONTACT_NOT_SHOWN` |
| "What the client told us" (`answersPanelV2`), `tp_phone` / `sp_phone` rows | full number in `answerRow` | rows left out (`showContact` false) |
| Admin/office case page | reuses `intakeAnswersTab`, so it gets both rows above | same |
| Draft 13614-C buttons → PDF | buttons shown; the PDF prints the full number | buttons hidden |

- No list (work board, case pool, follow-ups queue, log-call drawer, presenter views) shows a phone.
- Office Add a case is a data-entry form, and its phone sits in an input value.
- The client's screens show the client's own number.

### Rules this change implements

- **D5** (`docs/design/redesign-review.md`): masked everywhere on lists; admins see every detail and can reveal a phone; volunteers see every detail of their claimed cases and no unmasked phone on available cases.
- **DESIGN.md §8:**
  - The mask is `(•••) •••-1234` in tabular numerals.
  - Allowed viewers get a lavender `visibility` (eye) icon, and hover or focus reveals the number.
  - Viewers who are not allowed get a muted mask with a `lock` icon and the tooltip "Claim this case to see the full number".

### Constraints

- Do not change existing `data-action` values, ids, roles or accessible names.
- Fictional data only. Staff screens stay English.

### Code facts the design relies on

- `detailRow` and `answerRow` in `src/staff-views.mjs` escape their value, so neither can carry the helper's HTML as is.
- `formatAnswer(findQuestion(2, "tp_phone"), value)` returns `(215) 555-0123`.
- `icon()` in `src/ui.mjs` renders SVGs with `aria-hidden="true"`. It has `lock` and `eye` paths.
- `.sr-only` exists in `src/styles.css`.

## Goals / Non-Goals

**Goals:**

- Every client phone on the staff case page (contact card and answers panel, on both the volunteer and the admin/office case pages) renders through one helper. The helper has two states:
  - **revealable**, for allowed viewers;
  - **locked**, for viewers who are not allowed.
- For viewers who are not allowed, the full number is never in the DOM, in text or in any attribute.
- For allowed viewers, the full number is never in an attribute.
- Revealing the number works with a mouse (hover), with a keyboard (focus), and by clicking. After a click it stays revealed until focus leaves.
- Screen readers have one defined behaviour per state.
- DESIGN.md §8 matches the behaviour when the change lands.

**Non-Goals:**

- Staff identity, the persona picker, splitting the presenter role, RLS and the `case_contacts` select policy. These belong to the next change, roadmap §1.
- Adding a phone column to any list.
- The draft 13614-C PDF, office Add a case, and client screens.
- A copy button, or any clipboard API use.
- Changing who may see contact details. `canSeeContact` is unchanged.

## Decisions

### D1: Same masked display for every viewer (DESIGN.md §8), not full numbers for some viewers

- **Choice:** every viewer sees the mask first.
  - Allowed viewers get the eye icon and can reveal the number.
  - Viewers who are not allowed get the lock.
- **Rationale:**
  - It is one display with two states.
  - A shared or projected screen never shows a full number unless someone asks for it, which is the point of D5.
  - Sam and Alex see the same thing on a case they both may see.
- **Alternatives considered:**
  - **Full number for a claimed volunteer, mask with reveal for admins only** (the brief's literal reading). Rejected: Sam would see less than Alex, and there would be two displays for allowed viewers.
  - **Full number for every allowed viewer, mask only for viewers who are not allowed.** Rejected: §8's "masked everywhere" would then apply to nothing, since no list shows a phone.

### D2: One helper, with `canSeeContact` as the only rule

- **Choice:** one exported function in `src/staff-views.mjs`, `phoneMask(value, allowed, id)`.
  - It returns the HTML for one phone.
  - `id` is a new, unique element id for the revealable mask (see D4). It is used only when `allowed`.
  - **Empty phones read as they do today, for every viewer.**
    - The helper returns "Not given" for an empty or missing value. That is the contact card's wording.
    - The answers panel never passes an empty phone to the helper. An unanswered phone falls through to the panel's existing path: "Not answered" when required (`staff-views.mjs`, the `read.unanswered` branch), and no row when optional.
  - `contactCard` and `answersPanelV2` both call it.
  - `allowed` comes from `canSeeContact(record, person)`, through the existing `rights.seesContact` / `showContact`.
  - A small `htmlRow(label, html)` row, the same markup as `detailRow` but taking already-escaped HTML, carries the helper's output. `detailRow` and `answerRow` keep escaping as before.
- **Rationale:**
  - The rule already lives in one function, and the display gets one function too.
  - Putting the helper beside the other staff view helpers keeps it out of the client-facing `ui.mjs`.
- **Alternative considered:** a second visibility rule inside the helper (reading the persona's capabilities). Rejected because it would duplicate `canSeeContact`.

### D3: How the mask is built

- **Choice:**
  - Take the digits of the stored value.
  - The mask is `(•••) •••-` followed by the last four digits. If fewer than four digits exist, show bullets only.
  - The locked state takes nothing else from the value.
  - The full text for allowed viewers is `formatAnswer(tp_phone question, value)`, as today.
- **Rationale:** the locked output can be shown, by construction, to contain at most the last four digits.

### D4: Allowed viewers: CSS-only reveal, with the number kept shown while focused

Markup:

```html
<span class="phone-mask" tabindex="0">
  <span class="phone-dots" aria-hidden="true">(•••) •••-0123</span>
  <span class="phone-full">(215) 555-0123</span>
  <svg class="icon" aria-hidden="true"><!-- eye --></svg>
</span>
```

- **Default:** `.phone-full` uses the `.sr-only` styling, so it is in the accessibility tree but not visible.
- **On reveal** (`.phone-mask:hover`, `.phone-mask:focus-within`): `.phone-full` shows normally and `.phone-dots` is `display: none`.
- **Click:**
  - A click focuses the `tabindex="0"` span, so `:focus-within` keeps the number shown after the pointer leaves.
  - A drag-select inside it keeps focus, so the text can be selected and copied with the browser's own copy.
  - Focus leaving (a click elsewhere, Tab) hides it again.
- **No JavaScript, no state, no new `data-action`.**
- **Re-renders keep it revealed.**
  - A realtime update redraws the page with `innerHTML`, and `render()` in `src/app.mjs` puts focus back on the element with the same `id` (`describeFocus` / `restoreField`).
  - So each revealable mask carries a new unique id: `contact-phone` and `contact-spouse-phone` in the contact card, `answers-tp_phone` and `answers-sp_phone` in the answers panel.
  - A number revealed by focus stays revealed across a redraw. No existing id changes.
- **Visible focus:** the span keeps a focus outline like other focusable controls.
- **Alternative considered:** render the full number only after focus. Rejected: it needs JavaScript and controller state, and a re-render while focused would lose it.

### D5: Viewers who are not allowed: a locked mask with no number in the DOM

Markup:

```html
<span class="phone-mask is-locked" title="Claim this case to see the full number">
  <span class="phone-dots" aria-hidden="true">(•••) •••-0123</span>
  <span class="sr-only">Ends in 0123. Claim this case to see the full number.</span>
  <svg class="icon" aria-hidden="true"><!-- lock --></svg>
</span>
```

- No `tabindex`: there is nothing to reveal.
- `title` holds only the sentence.
- The mask is muted (Quiet Slate text), with the lock icon after it.

### D6: Screen readers

- **Allowed viewers:**
  - The full number is always read, because it is an ordinary text node.
  - The dots are hidden from assistive technology.
  - No `aria-label`, `title` or other attribute ever carries a number.
- **Viewers who are not allowed:** screen readers hear "Ends in 0123. Claim this case to see the full number." instead of a string of bullets.
- **Rationale:** the user may hear what they may see. It's one approach, and it needs no attribute holding the number.

### D7: What a viewer who is not allowed sees in the contact card and the answers panel

- **Contact card:**
  - "Contact details" heading.
  - Phone row (locked mask).
  - Spouse phone row (locked mask, or "Not given").
  - Then the unchanged `CONTACT_NOT_SHOWN` sentence, in place of best time and the note.
  - No edit button, as today.
- **Answers panel:**
  - Shows the `tp_phone` and `sp_phone` rows (locked) instead of leaving them out.
  - `best_contact_time` and `best_contact_note` stay left out.
- **Draft 13614-C buttons:** stay hidden. The PDF needs the full number, and `draft-13614c` is unchanged.

### D8: DESIGN.md §8 is updated in this change

- The "Masked phone" bullet that says "There's no click-to-copy, so a shared screen never keeps a number on display" becomes:
  - the number stays shown only while the mask has focus;
  - there is no copy button.
- "No click-to-copy" is read as no copy button and nothing put on the clipboard for the user. Selecting the text and copying it yourself is allowed.
- This is a deliberate reading, agreed with the user, so the doc and the code agree when this lands.

## Risks / Trade-offs

- **[Trade-off] Viewers who are not allowed now see the last four digits.**
  - Before this change they saw only the `CONTACT_NOT_SHOWN` sentence, so this discloses slightly more.
  - Accepted: D5 says to show the mask with the last four digits. The user accepted the disclosure explicitly.
- **[Trade-off] For allowed viewers the full number is ordinary page text.**
  - Find-in-page, select-all copying and screen readers reach it even while the dots show.
  - Accepted: those viewers may see the number. The mask protects against a glance at a shared screen, not against the viewer.
- **[Risk] Display-only masking.**
  - The full number still reaches every staff persona's browser through `case_contacts`, and devtools show it.
  - Mitigation: the PR description says so plainly. Real protection comes with the staff-identity / database change (roadmap §1).
- **[Risk] A number stays shown on a shared screen after a click.**
  - Mitigation: it's shown only while focused. Clicking anywhere else or pressing Tab hides it, and there is no copy button. The §8 wording is updated to match.
- **[Risk] Touch devices have no hover.**
  - Mitigation: a tap focuses the span, which reveals it, and tapping elsewhere hides it.
- **[Risk] A focusable `span` with no role.**
  - Its content is read as plain text, which is the intended behaviour.
  - Mitigation: it is not given a role such as `button`, so it doesn't claim an action it lacks. A visible focus outline makes it clear where focus is.
- **[Risk] Browser and unit tests that read the full number by `textContent` keep passing for allowed viewers**, because the number is in the DOM. That alone does not prove it's hidden.
  - Mitigation: the browser test also checks visibility. The number is hidden by default, visible on hover, focus and after a click, and hidden after blur.

## Migration Plan

N/A: no database, RPC or deployment change. The change is front-end only: views, CSS, tests and DESIGN.md. Rolling back means reverting the PR.

## Open Questions

None. All decisions were settled with the user on 2026-10-14 (see brainstorm.md).
