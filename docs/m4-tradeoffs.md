# M4 trade-offs: what we cut, what we refused to cut, and why

M4 is graded as feature-complete: the planned feature set is merged into `main` by Wed Nov 4
([#94](https://github.com/jin-yu-yang/VITA-Management-System-Demo/issues/94)). This page records
the scope decisions behind that. It names what we cut for the semester, what we refused to cut,
and the reason for each. Everything we cut goes on the roadmap for the **February PCDC pilot**
(Dec–Jan work), not to M5 or M6, which are for testing and hardening.

The goal for M4 was:

> A client submits intake and uploads documents; a case goes to Accepted or Rejected and is closed
> with a reason; staff sign in as themselves; the preparer completes the 13614-C shaded section
> inside ViTally.

> **TODO (Manqi, after the Oct 29 go / no-go and the Oct 31 code freeze):** update the status
> column below. As of Oct 27, change 2 and change 3 are merged; staff identity (#90) and the
> 13614-C shaded section (#98) are open PRs; document upload has no PR yet.

## Where M4 stands

| M4 goal | Status (Oct 27) | Where |
| --- | --- | --- |
| A client submits intake | Merged | Intake version 2, steps 0–9 (migration 023 onward) |
| A client uploads documents | Not started in a PR | Oct 29 go / no-go |
| A case goes to Accepted or Rejected | Merged | Change 2, #95; adjusted to PCDC's answers in #97 |
| A case is closed with a reason | Merged | Change 3, #96 |
| Staff sign in as themselves | Open PR | #90; fallback below |
| The preparer completes the 13614-C shaded section | Open PR | #98; Oct 29 go / no-go |

**Go / no-go rule.** On Oct 29, whichever of document upload and the 13614-C section is behind
becomes "stretch, not reached" and moves to the February roadmap. We chose a dated rule over
"finish both if we can" so that nothing half-built is left in a branch at the deadline: M4 counts
only what is merged.

**Staff identity fallback.** If #90 is not merged by Oct 30, the demo uses the presenter personas
(one account acting as Alex, Morgan or Sam), and the talk says so.

## What we cut

Each of these is out of the semester's scope. None is in M4, M5 or M6.

| Cut | Why | Where it lands |
| --- | --- | --- |
| **Amendment loop** (changing a return after it is accepted) | PCDC hasn't tracked amendments before, and they happen after the season. Rejected → Return to signing is already the mechanism an amendment will reuse, so adding it later is a new value, not a redesign. | Feb pilot |
| **Same-day service path** and **FSA** (Facilitated Self Assistance) | They are separate service models with their own flow, and neither is in the four M4 goals. The assisted intake staff already use for walk-ins is the starting point for same day. | Same day: Feb pilot. FSA: after the pilot |
| **Document-upload hardening**: virus scanning, retention and automatic deletion, per-volunteer visibility, a paid Supabase tier for storage, PCDC's security plan updated | These are what make real tax documents safe to store. M4's upload carries fictional files only. If they slip, the pilot falls back to PCDC's OneDrive, with the case storing the folder link. | Feb pilot, before any real document |
| **Who sees which case** (a volunteer sees only the cases they prepare or review) | #90 makes each staff member sign in as themselves; changing every visibility rule at the same time would touch every policy in the database at once. | Feb pilot |
| **Hosting, real accounts, backup-restore drill, security review** | See [Hosting moved to February](#hosting-moved-from-november-to-february) below. | Feb pilot |
| **Importing the IRS's and Pennsylvania's answers** from TaxSlayer, and **reassignment** of a case's preparer or reviewer | The office records each answer by hand; nothing is sent to or read from the IRS or Pennsylvania. Reassignment must keep the self-review block, which the database already enforces, so it can be added safely later. | Feb pilot |
| **A plain-language rejection reason for the client** | The client is told their return needs a correction and that PCDC will contact them. A reason table is left until PCDC says it wants one. | If PCDC asks |
| **13614-C extras**: editing the PDF in the browser, the reviewer's field-by-field comparison, version history | The preparer's answers are saved as data and filled into the existing 13614-C generator. That covers the M4 goal without adding a PDF editor. | After the pilot |
| **Email and text notifications** | The contact log covers day one: staff record every call and message on the case. | After the pilot |
| **Appointment scheduling** | The product spec already lists it as "possible for a later version" ([`docs/spec.md`](spec.md)), and it is not needed on day one of the pilot. | After the pilot |

> **TODO (Manqi / Hailey):** add reasons from the PCDC and client interviews where we have them,
> especially for same day, FSA and scheduling. The repository records the design reasons, not the
> interview notes.

### Hosting moved from November to February

The M3 slides said ViTally would be hosted in November, and change 2's proposal still says "real
clients use ViTally from November 2026". We moved it to the February pilot.

The rule in [`docs/developer/production-roadmap.md`](developer/production-roadmap.md) is: **do not
put real client data into any environment until staff identity, documents, and security and
privacy are done.** None of those three is finished for real data this semester: #90 is still open,
document storage has no virus scanning or retention yet, and there has been no security review.
Hosting without them would mean either real data on an unsafe system, or a hosted system nobody
can use. So hosting waits for the same Dec–Jan work as the rest of the pilot.

> **TODO (Manqi / Hailey):** confirm this is the reason we gave, and add anything else that drove
> it (for example cost, or PCDC's timing).

## What we refused to cut

These stayed in even under the deadline, because cutting them would make the demo misleading or
unsafe to build on.

- **All four M4 goals, end to end, merged into `main`.** Ugly screens, missing edge cases and thin
  tests were acceptable. Work left in a branch was not.
- **Real staff accounts (#90).** The presenter persona picker lets any presenter act as anyone. A
  system for tax data has to know who did each thing, so this was not traded away for more
  features. It has a stated fallback rather than a silent cut.
- **The independence rule.** A preparer can never review their own case. The database enforces
  it, not the screen, and it carries over unchanged to real staff accounts.
- **What the client never sees.** Reject codes, fix notes and staff notes stay staff-only; the
  client is told what is happening in plain words. Phone numbers are masked on staff screens.
- **A signature after every fix.** PCDC confirmed that a corrected return is signed again before it
  is filed again, so Return to signing has no shortcut.
- **A return is not transmitted after a withdrawal.** When a client withdraws late, the office gets
  a notice to make sure the return is not transmitted in TaxSlayer.
- **Bilingual client screens.** Every client screen is in English, 简体 and 繁體, including the
  new filing and closing messages. Serving English- and Chinese-speaking clients is one of the
  product's goals ([`docs/proposal.md`](proposal.md)), not a finishing touch.
- **Fictional data only.** Every environment, test and screenshot uses fictional people until the
  February items above are done.
- **Every change specified and tested.** Each feature went through an OpenSpec change with its own
  specs, and CI runs the unit tests, the 繁體 check, the catalogue check and spec validation on
  every pull request.

## Where scope grew instead

Scope did not only shrink. Three things #94 listed as out of scope were built, because PCDC's
answers or a gap in the workflow made them necessary:

- **Waiting for documents and Hold** (#96). A failed screening check had nowhere to go, and a
  client who stopped answering at signing stayed at Ready to exit forever.
- **Paper returns** (#97). PCDC uses all four combinations of federal and state, e-filed or on
  paper, and hands the paper return to the client to mail.
- **The client's own withdrawal** (#96), with the stop-work notice above.

> **TODO (Hailey):** check this framing for the talk.

## The February pilot roadmap

Day one of the pilot needs, in Dec–Jan:

1. The same-day service path.
2. The amendment loop.
3. Document-upload hardening (or the OneDrive fallback).
4. Hosting, real accounts, a backup-restore drill and a security review.
5. Whichever of document upload and the 13614-C section did not make the Oct 29 go / no-go.

After the pilot: email and text notifications, appointment scheduling, and FSA.

The longer list of what separates the demo from a production system is in
[`docs/developer/production-roadmap.md`](developer/production-roadmap.md).
