## 1. Golden markup, captured before any change

- [ ] 1.1 Add `tests/empty-states.states.mjs` (the states) and `tests/fixtures/empty-states.json` (captured once from the unchanged code), plus `tests/empty-states.test.mjs`, which compares each render with the fixture. Cover:
  - board: Available, Preparation and Review empty; "Nothing of yours"; filtered; searched;
  - queue: empty; kind-filtered; language-filtered;
  - client applications: EN and 简体;
  - client progress with no history;
  - a staff case page and an admin case page whose sections are empty;
  - `attemptList` with no calls.

  The pool and the drawer line are left out: they change on purpose. The test also asserts that each expected empty sentence appears in some captured string, so a wrong state can't hide a list. It passes on unchanged code.

## 2. The helpers in `src/ui.mjs`

- [ ] 2.1 Write failing tests in `tests/ui.test.mjs` for `emptyState` (icon, title, text, actions, className; each optional part absent) and `emptyLine`.
- [ ] 2.2 Implement `emptyState({ icon, title, text, actions = [], className })` and `emptyLine(text)` next to `loadingLine` / `unloadedLine` (design D1). The tests pass.

## 3. Panel lists

- [ ] 3.1 Work board, Follow-ups queue and client applications use `emptyState`, with identical markup. The golden test passes unchanged.
- [ ] 3.2 Case pool:
  - unfiltered → "No cases yet this season."; filtered → "No case matches these filters.";
  - both with the folder icon, built with `emptyState`; no action inside (design D3).
  - Update `tests/pool-views.test.mjs:254` for the unfiltered wording, and add tests for both sentences, the icon, and Clear filters appearing once.
- [ ] 3.3 Run `npm test`.

## 4. Case sections

- [ ] 4.1 Replace only the empty-branch expression with `emptyLine(...)`, same text, in nine places:
  - staff: `documentsPanel`, `reviewAttempts`, `followupPanel`, `historyPanel`;
  - admin: `receiptPanel`, `attemptList`, `adminFollowupPanel`;
  - office: `logCallDrawerBody`;
  - client: `progressScreen`'s history.

  Nothing around them changes. The golden test passes unchanged.
- [ ] 4.2 Add a test that the Log a call drawer's line is now `<p class="muted">No open follow-up is left on this case.</p>`, followed by its Close button as before.
- [ ] 4.3 Run `npm test`.

## 5. Browser check

- [ ] 5.1 Run `npm run db:migrate:test`.
- [ ] 5.2 Run `npm run test:browser` **once**. If it fails at a step this change doesn't touch, record the step and the error in verify.md and move on (user rule).

## 6. Checks and docs

- [ ] 6.1 In `docs/developer/frontend.md`, next to the list loading states, add one or two sentences:
  - an empty list uses `emptyState` (panels) or `emptyLine` (sections) from `src/ui.mjs`;
  - a new board phase adds its sentence to `EMPTY_TAB`.
- [ ] 6.2 Run `npm run build:hant -- --check` (expected: nothing to regenerate) and `npx openspec validate --all`.
