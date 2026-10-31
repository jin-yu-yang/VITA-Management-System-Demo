<!--
Raw capture of the brainstorm. The design was brainstormed and approved
elsewhere (all 5 promotion criteria held); the user handed over its
conclusions and asked that they be written here without asking again. One
question came up while grounding them in the code (Q4) and the user answered
it on 2026-10-31; that answer is recorded as given.
-->

# Brainstorm: the lifecycle bar draws Closed after Accepted (issue #109)

## Background

- The staff case page's lifecycle bar (`lifecycleBar` in
  `src/staff-views.mjs`) draws its steps from one list, `LIFECYCLE`, which ends
  `… "efiled", "accepted", "closed"`. So Closed is drawn as the hollow next step
  after Accepted.
- The case-lifecycle spec says closing is refused from E-filed and Accepted:
  Accepted is the end. The bar contradicts it.
- The source is the case-lifecycle spec's case-page bullet, "Its lifecycle bar
  SHALL show … E-filed, Accepted and Closed", which predates #95/#97.
- Today a closed case marks Closed as `current` and every other step `todo`
  ("a case can be closed from any stage, so nothing before it is claimed as
  done"; the History tab shows the path).

## Decisions

### Q1. Scope

Only the staff case page's lifecycle bar, and its sentence in the spec. The
client's progress stepper, the database and every action stay as they are.

### Q2. At Accepted

Every step up to and including Accepted is done. There is no current step,
and Closed does not appear.

### Q3. Other stages

Unchanged. Rejected still shows on E-filed, and Corrections in progress on
Filing in progress, each marked as amendment.

### Q4. At Closed (answered 2026-10-31)

The first idea was to draw Closed in place of the step the case stopped at,
with the steps before it done. Grounding it showed that nothing records that
stage: the case row has `stage = "closed"` and `closingReason`, and the
`CLOSE_CASE` event's detail holds only the reason, the note and `seasonEnd`.
The client stepper draws no track at all for a closed case, so it does not
answer the question either.

Options weighed:
1. Infer the stage from the internal history (the last action before
   `CLOSE_CASE`). Rejected: a guess, fragile through corrections, rejection and
   hold loops.
2. Record the stage at closing with a new migration. Rejected for this change:
   it is a database change, outside the agreed scope.
3. **Chosen:** a closed case marks only Closed, as its current step. The steps
   before it are neither done nor todo: they are neutral. Where the case
   stopped is read in the History tab.

Option 2 is kept as a later, separate change, aligned with how a Hold records
the stage it came from (`holdOrigin`).

### Q5. Dependencies

None. All ready.

### Q6. Acceptance

- An Accepted case: every step done, no current, no Closed.
- A Closed case: only Closed is highlighted; the steps before it are neutral.
- Rejected and Corrections in progress show as before.
- `npm test`, with unit tests on the bar for these cases, and
  `npm run test:browser`.

### Q7. Historical reading

`docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md`,
the case header: "A lifecycle bar across today's 9 stages, with finished steps
in `--vt-progress` and the current step highlighted." That still holds; this
change keeps the two looks and adds a neutral one for a closed case.

## Details settled while writing these artifacts

1. **Closed appears only on a closed case.** Q2 removes Closed from an
   Accepted case. If an open case (say, Pending review) still showed a hollow
   Closed after Accepted, the bar would keep saying that Closed follows
   Accepted, which is the error #109 reports. So Closed is not one of the
   bar's steps; it is drawn, after Accepted, only when the case is closed.
   Every open case's bar loses its last hollow step and is otherwise unchanged.
2. **Neutral is its own class.** A neutral step is drawn like a todo step but
   muted, and its connector is never the progress colour, so nothing on a
   closed case's bar reads as progress. Closed's own connector is plain too.
