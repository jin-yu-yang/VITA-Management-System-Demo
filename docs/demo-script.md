# ViTally demonstration script

This is the rehearsal script for presenting ViTally. It describes only what the implemented,
tested application actually does — see [`docs/setup.md`](setup.md) for how to bring up the
isolated local stack this is rehearsed against. **Use fictional names only. Never type a real
address, a real phone number, or a real ID into any screen during a demonstration; the isolated
test stack and its sample data are fictional throughout, but a presenter's own typing is not
constrained by the software.**

Two browser windows drive every version of this: a **client** window (the applicant, signed in
with an approved email) and a **staff/presenter** window (Alex, Morgan, or Sam, chosen with the
persona switcher in the presenter panel). The cross-browser test suite
(`npm run test:browser`, see [`docs/setup.md`](setup.md#5-tests)) runs this exact story, twice,
with the browser engines swapped between the two windows — so everything below is a rehearsal of
what that suite already verified, not a hoped-for behavior.

> **Live email delivery has not been set up yet.** Configuring a real sender and admitting real
> addresses is Task 10B, a user-owned step that is still pending (see
> [`docs/setup.md`](setup.md#6-classroom-and-hosted-setup-pending)). Until it happens, a rehearsal
> runs against the isolated local stack, where the one-time code is caught by the stack's local
> mail catcher and read from its web UI ([`docs/setup.md`](setup.md#3-isolated-local-supabase-test-stack))
> rather than arriving in anyone's real inbox. Everything this script says about the sign-in
> itself — the neutral message, the countdown, the real `verifyOtp` check — is the same either way.

## What is simulated, and what is real

| | Simulated | Real |
| --- | --- | --- |
| Sign-in | — | Email OTP verification: a real one-time code, real `verifyOtp` |
| Shared state | — | Every case update, document, follow-up, and review is a real database write, delivered to the other window over a real Realtime subscription |
| Documents | The "sample mileage record" is a fixed fictional filename, never a real upload | — |
| Reminders | "No external message sent" — REMIND records an internal timestamp only | — |
| TaxSlayer preparation milestones | Recorded manually as text; no tax-preparation software is integrated | — |
| Intake/document checks | Recorded as demo attestations ("Simulated intake checks are recorded…") | — |
| Rehearsal/automation codes | In automated tests only, the outbound OTP **send** request is intercepted so no mail server is contacted; **verification is never intercepted** | In a rehearsal nothing is intercepted: a real code is really sent and really verified. On the isolated local stack it is caught by the stack's mail catcher; delivery to an approved real inbox waits on Task 10B (pending) |

Say this plainly during a presentation: **"The documents, reminders, and tax-preparation steps you
see are simulated. The sign-in, the shared updates between these two windows, and the review
decisions are real database and email operations."**

## The presenter panel

Visible only to a signed-in presenter (an applicant never sees it, and the server refuses these
actions from anyone else regardless of what the screen shows). It has:

- **A fixture indicator**: `Class workspace <short id> · sample set <generation> · N sample
  cases`. This is the thing to read off a projector to confirm which class workspace and which
  sample generation is on screen.
- **A connection line**: Connected / Reconnecting / No connection.
- **"Acting as"**: buttons for each staff persona (Alex, Morgan, Sam). This choice is local to the
  window it is made in and is re-checked by the server on every action — switching personas never
  bypasses a real authority check, and two presenter windows open at once each keep their own
  persona independently.
- **"Load a sample checkpoint"**: puts one sample case back to a chosen point in the story
  (`Waiting for a preparer`, `Waiting on a document`, `Waiting for a call from the office`,
  `Waiting for a reviewer`, `Sent back for corrections`). The case keeps its Application ID and
  its bound client; only its recorded work changes. Use this to skip ahead without narrating every
  intermediate step.
- **"Reset sample cases"**: rebuilds all six sample cases and the one sample assistance request
  from scratch, with fresh Application IDs. **Applications the class itself created are never
  touched, and neither is anyone's sign-in** — the reset only replaces `fixture=true` records.
- **"Fill fictional details"**: fills a form with generated fictional answers (used both by an
  applicant filling their own intake and by staff filling an assisted walk-in intake). It never
  submits anything by itself.

## The two-minute story

Begin from a prepared checkpoint (or the seeded sample cases directly) rather than a brand-new
application, and narrate the off-screen intake/tax-preparation work rather than performing every
click live. Everything here is clearly labeled simulated on screen, and nothing about a checkpoint
or a time jump is hidden from the audience.

1. **Start on the staff board with six sample cases visible.** Point out `waiting_documents`
   (Alex is preparing it and is waiting on a document) or load the `admin_followup_needed`
   checkpoint directly to skip to "the office has a call to make."
2. **Switch to Sam** and show the office board's "Follow-up needed" section: the task is assigned
   to Sam, not to Alex, even though Alex is still the preparer. Record the call ("reached") and
   resolve the follow-up. Point out that Alex is still shown as the preparer throughout — admin
   follow-up never reassigns or removes the preparer.
3. **Switch to the client window** for that same case (or narrate "the client would now send their
   document") and, if time allows, respond with the sample document.
4. **Switch to Alex**, verify the document, and record preparation complete.
5. **Switch to Morgan**, claim the review, and approve it directly (the short path — no
   corrections needed for this pass).
6. **Record the client conversation** and switch back to the client window: it now reads "Review
   complete" and the next service step — nothing about a refund amount, routing number, or
   deposit, and nothing from the reviewer's internal findings.

## The full story, as the browser test runs it

This is the complete demonstration script (spec section 9) end to end, with the regression
coverage the automated story adds. Use this version for a longer walkthrough or when rehearsing
what the test suite actually proved.

1. **Both windows sign in** with a real generated one-time code, verified through the real form.
2. **The presenter resets the sample cases** so the board shows exactly six known cases.
3. **A new application is submitted** in the client window: sign in with an approved email, fill
   fictional details in one click, confirm, and submit. Its generated Application ID
   (`VT-XXXX-XXXX`) appears on the staff board in the other window/engine — nothing is copied by
   hand.
4. **The office records intake readiness.** Sam opens the *newly arrived* case from the office
   board's **"Intake checks needed"** section (a case that has been submitted but not yet checked
   appears here, and nowhere else on the office board) and records the simulated intake checks.
   Meanwhile, the client window is shown to be unaffected by staff persona switches and page
   reloads: its selected case, screen, form step, and open panels stay exactly where the person
   left them, while the shared update it is actually waiting for (the case moving into
   preparation) still arrives without a reload.
5. **Alex claims preparation** and requests the sample mileage record.
6. **Alex escalates**: asks the office to contact the client (an admin follow-up task, assigned to
   Sam by the server — never chosen in the browser).
7. **Sam records the call and resolves the task.** Alex remains the assigned preparer throughout.
8. **The client sends the sample document** for their own case.
9. **Alex verifies the document** and records preparation complete.
10. **Morgan reviews.** Extended branch: Morgan requests corrections with a specific finding; the
    client sees "Corrections in progress" but never the finding text itself; Alex resolves and
    resubmits with a note describing what was corrected in TaxSlayer; Morgan re-claims the fresh
    submission and approves it. (Short branch: Morgan claims and approves directly, with no
    corrections — the second sample case in the story takes exactly this path.)
11. **Morgan records the client conversation.** The client's screen updates to "Review complete"
    and a plain description of the next step. The story asserts, at this exact point, that none of
    the reviewer's findings, the preparer's resolution note, the office's contact notes, or any
    `$`/refund/routing/deposit language appear anywhere in the client's window.

### The assisted-intake (walk-in) path

A separate regression, worth demonstrating on its own if a class asks "what if someone doesn't
have email, or is standing at the desk?":

1. **Sam** opens the office board's "Assisted intake" section, presses "Start an assisted
   application," and fills it with fictional details (the same one-click helper the client form
   uses).
2. Submitting creates a new case with **no client account attached** — it stays reachable only
   through the office board, not through anyone's "My applications" list, until (if ever) a real
   account is linked to it.
3. Sam records the simulated intake checks. Alex claims preparation and requests a document.
4. **Sam records that the office physically received the sample document** ("Record sample
   document received") — labeled explicitly as staff-recorded, distinct from a client's own
   upload, and it still leaves verification pending.
5. Alex verifies it, exactly as with a client-submitted document.

### Known behaviors to expect and narrate, not treat as bugs

- **A stale-revision refusal can happen if the client presses "Send sample document" within about
  a second of the office's own work on that case.** This is correct, required behavior (a stale
  write must never silently succeed), and the refusal now stays on screen until dismissed or acted
  on. If it happens during a live run, just press the button again.
- **`review_ready`'s seeded document was recorded by staff, not submitted by a client.** The
  fixture case has no client session behind it, so its sample document is honestly labeled
  "staff-recorded" rather than pretending to be a client upload. If this exact fixture is ever
  bound to a real student's account for a class exercise, that student will correctly see a
  document the office recorded on their behalf.
- **A seeded history row names the person the scenario says did that step, and no account at
  all.** Every `case_events` row a reset or checkpoint writes carries `actor_user_id = null` —
  nobody performed it — and the scenario's own `actor_person_id`: Sam on the intake checks and the
  recorded call, Alex on claiming preparation and the document request, Morgan on the review
  steps, and nobody at all on the client's own submission
  (`009_fixtures_and_realtime.sql:114-160`, `286-289`). So the timeline reads correctly, and every
  detail on it is marked `simulated`. The workspace's first active presenter membership — the
  lowest Auth user id, chosen at `009:334-336` — is recorded only where a column requires a real
  member: `cases.created_by_user_id` (`009:349-351`), `documents.submitted_by_user_id`
  (`009:234-235`) and `contact_attempts.actor_user_id` (`009:244-245`). Those three are internal,
  no screen renders any of them, and they name an account, not the persona the story attributes
  the step to.
- **An accepted action can produce more than one shared-update notification** for the same case.
  If narrating "watch it update live," the case's own badge/stage text is the reliable signal, not
  a raw update counter.
- **Most sample cases show "Not recorded for this case" where the office board shows a contact
  preference.** This demo stores a contact preference on an assistance item and nowhere else, and
  the seed creates exactly one of those — on the `admin_followup` case
  (`009_fixtures_and_realtime.sql:377-380`). Every other case therefore has none to show, and the
  board says so plainly rather than inventing one (`src/admin-views.mjs:365`, `390`).
- **The resend countdown belongs to the browser window, not to the address.** The moment the last
  code was requested is kept in that window's session storage
  (`src/window-state.mjs:132-153`, `src/controller.mjs:544-567`), so reloading the page does not
  buy another send, and correcting a typo in the address does not either — the wait continues and
  the corrected address is the one bound and shown. A second window starts its own countdown; the
  project's own minimum interval between emails (60 s, see [`docs/setup.md`](setup.md#3-isolated-local-supabase-test-stack))
  is what actually governs sending.

## The class-member story

What to say when a class member asks "what happens to my stuff":

- **Only exact, explicitly approved email addresses can sign in at all.** There is no domain-wide
  or public sign-up; an address not on the roster gets the same neutral response as anyone else
  (below), never an error that reveals whether it is or is not approved.
- **Applications a class member creates are never touched by a presenter's reset.** A reset only
  rebuilds the six `fixture=true` sample cases; anything a real signed-in person submitted keeps
  its Application ID, its stage, and its owner through any number of resets.
- **A class member cannot act as staff**, no matter what is typed or clicked. The persona switcher
  is presenter-only UI; even if an applicant somehow reached a staff control, the server checks
  real membership and capabilities on every action and refuses it — the browser story specifically
  proves an applicant's forged staff action on their own case is refused, with nothing recorded.
- **Returning to an existing application**: sign in again with the same email, real code entry.
  "My applications" lists every application started with that address; a specific one can also be
  found by its Application ID, but only within the applications tied to the signed-in address —
  looking up someone else's ID finds nothing ("We could not find that Application ID"). There is
  no separate way to look up a case by ID alone without also being signed in as its owner.
- **An address that is not approved** gets the identical neutral message every valid-looking
  address gets — `"If this address is eligible, check your inbox for a sign-in code."` — with the
  same resend countdown, so the screen itself reveals nothing about who has an account.
- **The old placeholder verification code (`246810`) is gone.** Any six-digit guess, including
  that one, is refused with "That code is invalid or has expired. Request a new code." and the
  form stays on the code-entry step. There is no "use demo code" shortcut anywhere in the shipped
  UI; every code typed in a rehearsal must be one the server really issued and really sent — read
  from the local stack's mail catcher today, and from the approved inbox it was sent to once live
  delivery is set up (Task 10B, pending).
