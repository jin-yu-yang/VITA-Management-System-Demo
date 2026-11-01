## Context

`lifecycleBar(subject)` in `src/staff-views.mjs` draws the staff case page's lifecycle bar from `LIFECYCLE`: Request sent through Accepted, then Closed. Each step gets one state: `done` (before the case's step), `current` (the case's step, with `aria-current="step"`), or `todo` (after it). Corrections in progress, Rejected, Waiting for documents and Hold each show on another step, marked `amend`. A closed case marks Closed as `current` and everything else as `todo`.

The case-lifecycle spec refuses closing from E-filed and Accepted, so Accepted is the end of the path. The bar's step list comes from the spec's case-page bullet, written before #95/#97, and it still lists Closed after Accepted (issue #109).

Nothing records which stage a closed case was closed from. The case row has `stage` and `closingReason`, and the `CLOSE_CASE` event detail holds the reason, the note and `seasonEnd`. The client's progress stepper (`progressTrack` in `src/client-views.mjs`) draws no track for a closed case.

The historical design (`docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md`, the case header) describes the bar's finished steps in `--vt-progress` and the current step highlighted. That still holds.

## Goals / Non-Goals

**Goals:**
- An Accepted case's bar shows the path finished: every step done, no current, no Closed.
- No open case's bar suggests that Closed follows Accepted.
- A closed case's bar shows Closed and claims nothing about the steps before it.

**Non-Goals:**
- Showing which stage a closed case stopped at (see Open Questions).
- The client's progress stepper, the database, actions, and stage names.

## Decisions

### D1: Closed is not one of the bar's steps
- **Choice:** `LIFECYCLE` ends at `accepted`. `lifecycleBar` adds a Closed step after Accepted only when `stage === "closed"`.
- **Reason:** Accepted is the end of the path. A hollow Closed on an open case says the opposite.
- **Alternative considered:** keep Closed on every bar and only drop it at Accepted. Rejected: an open case would still show Closed as the step after Accepted.

### D2: At Accepted every step is done and none is current
- **Choice:** for `stage === "accepted"`, every step gets `done`, none gets `current`, and the bar has no `aria-current`.
- **Reason:** the path is finished. The same rule is already used by the client stepper, where an accepted case has "finished every step, so none is current".
- **Alternative considered:** Accepted as the current step (today's behaviour). Rejected: a current step implies something is still in progress.

### D3: A closed case's earlier steps are neutral
- **Choice:** a new step state, `neutral`. For a closed case, every step from Request sent to Accepted is `neutral`, and Closed is `current` with `aria-current="step"`. In `src/styles.css`, a neutral step's dot and label are muted and its connector never uses `--vt-progress`. The connector into a closed case's Closed step is plain too, so nothing reads as progress.
- **Reason:** nothing records where the case stopped, so the bar must claim neither done nor still-to-come. The History tab shows the path.
- **Alternatives considered:** infer the stage from the internal history. Rejected as a guess that breaks on correction, rejection and hold loops. Record it with a migration: deferred, see Open Questions. Keep `todo`: rejected, because todo says the step is still ahead.

### D4: Everything else is unchanged
- **Choice:** the `done`/`current`/`todo` calculation and the `amend` marking stay as they are for every stage but Accepted and Closed.
- **Reason:** the scope is the error in #109 only.

## Risks / Trade-offs

- [Risk] A test or the browser story counts the bar's steps (eleven today). → Mitigation: the existing unit tests in `tests/staff-views.test.mjs` are updated to ten steps, eleven for a closed case. The story does not read the bar, and `npm run test:browser` confirms it.
- [Risk] A neutral step looks like todo, and a reader takes a closed case's path as unstarted. → Mitigation: a muted style, distinct from todo, and Closed is the only current step. The History tab names the path.
- [Trade-off] A closed case's bar does not say where the case stopped. → Accepted: the data does not exist yet, and guessing would be worse.

## Migration Plan

N/A: a view change only, with no deployment, database or data change. Rolling back restores the old bar.

## Open Questions

- **Recording the stage a case was closed from** (owner: the team; a later, separate change). A new migration would write `fromStage` into the `CLOSE_CASE` event detail, or a column on `cases`, aligned with how a Hold records `holdOrigin`. The bar could then draw Closed in place of the step the case stopped at, with the steps before it done. It affects only the closed case's bar; this change's other rules stand.
