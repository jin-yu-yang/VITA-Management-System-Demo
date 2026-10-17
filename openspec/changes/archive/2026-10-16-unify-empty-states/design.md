## Context

- **Issue #73.** The empty-states item follows #75 (`screen-states`: toast, banners, list loading and couldn't-load lines) and runs alongside #78, which is open and adds confirmation dialogs and `confirmBody` to `src/ui.mjs`.
- **§2 of `docs/design/redesign-review.md`** lists missing empty states but sets no wording or look. The look in use is the `.empty-state` CSS: centred, a 44px icon, an `h2` at 24px, a muted `p` at 14px.
- **Today's lists:**
  - Four panel lists hand-build `div.empty-state`: the work board, the Follow-ups queue, the case pool and the client's applications.
  - Nine case-page sections hand-write a one-line `<p>`.
  - The case pool's sentence is wrong for an empty, unfiltered season.
- **Things that pin the markup:**
  - The browser story's queue check uses `.office-queue .empty-state [data-action="set-board-filter"]`.
  - `app.mjs:1439` moves focus to the filter chip after an empty state's undo button is gone.
  - View tests match `class="empty-state"` and the sentences.
- **Jinyu's lifecycle change** will:
  - replace the board's three tabs (`EMPTY_TAB`) and the pool's phase tabs;
  - rewrite "Your next step";
  - change client stage messages and history lines.

## Goals / Non-Goals

**Goals:**

- One helper for panel lists and one for one-line sections, used by every list the app has.
- Identical markup everywhere except the case pool (icon and wording) and the drawer line (now muted).
- The case pool says "No cases yet this season." when nothing is filtered.
- Requirements in `screen-states` that say what an empty list shows.

**Non-Goals:**

- New empty states for lists that don't exist yet: notifications, dashboard, day view, labels, returning-client search.
- The Application ID lookup's no-match (stays an amber notice), and the client review's "no alerts" result.
- Any change to tab logic, `EMPTY_TAB`'s shape, history lines, "Your next step", or client text.
- A visual redesign of `.empty-state`.

## Decisions

### D1: `emptyState` and `emptyLine` live next to `loadingLine` in `src/ui.mjs`

- **Choice:**
  - `emptyState({ icon, title, text, actions = [], className })` returns, in order: `<div class="empty-state[ className]">`, `icon(icon)` if given, `<h2>title</h2>` if given, `<p>text</p>`, the actions joined, `</div>`.
  - `emptyLine(text)` returns `<p class="muted">text</p>`.
  - `text`, `title` and the actions are HTML the caller has already escaped or built.
- **Reason:** #75 put a list's loading and couldn't-load lines there. A list's four states then read side by side, and each list keeps its own wording and its own undo buttons.
- **Alternatives considered:**
  - One helper with a `size` option for both shapes. Rejected: two very different outputs behind one flag; two small functions read better.
  - A declarative `actions: [{ label, action, data }]`. Rejected: the queue's buttons carry two `data-*` attributes and the board's a different action, so ready-made buttons keep those in their files, as #78's `confirmBody` does.

### D2: Byte-identical markup, guarded by a golden test

- **Choice:** before any view changes, capture each list's empty rendering from the current code into a fixture, and compare against it afterwards. Two states are left out of the fixture and tested explicitly, because they change on purpose:
  - the case pool (D3);
  - the Log a call drawer's line, whose plain `<p>` becomes `<p class="muted">` (D4).
- **Reason:** the story's queue selector, `app.mjs`'s focus return and the view tests depend on today's markup. A golden test proves the move changed nothing else.
- **What it covers:**
  - board: each tab empty, mine, filtered, searched;
  - queue: empty, kind-filtered, language-filtered;
  - client applications: EN and 简体;
  - a staff case page with empty sections;
  - an admin case page with empty sections;
  - client progress with no history.
  
  Case pages are rendered whole, with a fixed `now`.

### D3: The case pool's two sentences

- **Choice:**
  - `narrowed` false → `emptyState({ icon: "folder", text: "No cases yet this season." })`.
  - `narrowed` true → `emptyState({ icon: "folder", text: "No case matches these filters." })`.
  - No action inside the empty state: the summary line just above already shows Clear filters when narrowed.
- **Reason:** the old sentence claims a filter that may not exist. The folder icon matches the board.
- **Alternative considered:** a Clear filters button inside the empty state too. Rejected: two buttons with the same name and action next to each other.

### D4: Case sections: only the empty line changes

- **Choice:** in each of the nine sections, replace only the empty-branch expression with `emptyLine("…")`, keeping the same text. The rest of each function (headings, lists, forms, the drawer's Close button) is untouched. The client history keeps `say("progress.history_empty")`.
- **Reason:** Jinyu's lifecycle change edits the areas around them (history lines, next step). Touching one expression per section keeps merges trivial.

### D5: Requirements in `screen-states`

- **Choice:** ADDED requirements in the existing capability:
  - what an empty list shows (panel or line), the sentence rules, and the filtered-list undo;
  - the case pool's two sentences as scenarios.
- **Reason:** #75's requirement already says a loaded, empty list shows "its empty state". This defines it.

## Risks / Trade-offs

- [Risk] PR #78 and this change both edit `src/ui.mjs` and the top import of `tests/ui.test.mjs`, and both add requirements to `screen-states`. → Mitigation: different hunks in `ui.mjs`, a one-line import conflict, and requirements appended at archive after merging `main` (CLAUDE.md step 8).
- [Risk] Jinyu's phases need empty sentences. → Mitigation: `EMPTY_TAB` keeps its shape. The PR description says a new phase adds one entry there, and the pool's sentences are chosen in one place.
- [Risk] Whole-page golden captures are brittle if a render reads the clock. → Mitigation: fix `now` in the captured states, and check that the capture is deterministic by rendering twice before saving.
- [Trade-off] The drawer line becomes muted, a small visual change. → Accepted: it matches every other case-section line.

## Migration Plan

N/A. No deployment, database or configuration change. Rollback is reverting the commits.

## Open Questions

- (none)
