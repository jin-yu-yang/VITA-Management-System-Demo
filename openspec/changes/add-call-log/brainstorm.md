# Brainstorm result: call log

Agreed with Hailey on 2026-10-17. Change name: `add-call-log`.
Everything above "Findings during propose" is the approved brainstorm, as agreed. The last section records what
propose found in the code; it settles the one dependency the brainstorm left to check and adds no new alternative.

**This change can be applied now.** It only adds a table, RPCs and a case-page section. It does not touch the
stage functions (`SUBMIT_REVIEW`, `APPROVE_REVIEW`, …) that Jinyu's lifecycle chain (#73) is changing, and it
leaves the two existing contact records as they are.

---

## Why

Volunteers write contact history by hand in notes today ("10/17 HZ called, no answer, left VM"). Calls aren't
only to go over the return; many are to ask a question or request a document. The call log records each
contact in a few clicks, with the time and the volunteer filled in, and produces a one-line summary to paste
elsewhere (for example TaxSlayer's notes).

## Scope

**In:** logging a contact on a case at any stage; editing an entry (with history); a one-line summary per entry
with a Copy button, and Copy all for the case.

**Out:**
- Recording calls, speech-to-text or AI summaries (decided against: Pennsylvania requires every party's consent
  to record a call, the browser can't hear the client's side, and the call content is sensitive taxpayer data).
- Deleting entries.
- Changing the reviewer's "Record this conversation" (`RECORD_REVIEW_CONTACT`) or the office follow-up contact
  records. They stay as they are; merging them into the call log is a later decision.
- Client-facing anything.

## An entry

| Field | Values | Notes |
|---|---|---|
| When | Filled in: date and time | |
| Logged by | Filled in: the signed-in staff member | |
| With | Client / spouse / other (+ name, required for other) | |
| Method | Phone / text / email / in person / video | Required |
| Purpose | Go over tax return / ask a question / request documents / schedule an appointment / other | Required. "Go over tax return" is what the reviewer questionnaire (`add-preparer-and-reviewer-questionnaires`) reads to prefill its review date and method |
| Outcome | Reached / no answer / left voicemail / wrong or invalid number | Required |
| Note | Free text | Optional; length limit like other staff notes |

## Summary line

One line per entry, English (staff screens are English):

```
10/17/2026 3:45 PM — Hailey Z. → client (Mei Wang), phone — Go over tax return — Reached. Note: asked about the 1099-R; she'll bring it Monday.
```

- The logger as first name plus last initial.
- "→" then who was contacted (client / spouse with their name from the intake; other with the name typed), then
  the method.
- Then purpose, outcome, and "Note: …" only when there is a note.
- Built from the entry's latest version.
- **Copy** next to each entry copies its line; **Copy all** copies every entry for the case, one line each,
  oldest first. The copy works without leaving the page and confirms with the existing toast.

## Rules

| Rule | Decision |
|---|---|
| Who can add | Every staff member who can open the case (preparer, reviewer, office), at any stage |
| Who can edit | The person who logged the entry, and admins (to correct someone else's) |
| Edit history | Kept. An edited entry shows "edited <date time>"; the previous versions can be opened. Nothing is overwritten |
| Delete | Not possible. A wrong entry is corrected by editing it |
| Who can see | Staff only (RLS). Clients never |
| Where | A new "Calls" section on the staff case page: newest first, Copy all in the section header, an "Add a call" form |
| Phones | Logging shows no phone number; the masked-phone rules (#68, #74) are unchanged |

## Dependencies

| Dependency | Status |
|---|---|
| Staff names (for "Hailey Z.") | Ready, if the roster has first and last names; otherwise fall back to what the board shows today. Check during propose |
| Client and spouse names from the intake | Ready |
| Lifecycle chain (#73) | None: this change doesn't touch stage functions |
| `add-preparer-and-reviewer-questionnaires` | That change reads this one (prefill); this one doesn't depend on it |

## Acceptance

- A preparer, a reviewer and an office user can each log a call on a case they can open, at any stage; the
  entry shows the time and their name without typing them.
- "Other" requires a name; method, purpose and outcome are required.
- The logger and an admin can edit an entry; anyone else can't (refused by the database). An edited entry shows
  "edited …" and its earlier versions. No one can delete an entry.
- Copy and Copy all put the exact summary lines above on the clipboard.
- A client session can't read the call log (database test).
- Checks: `npm test`; `npm run db:migrate:test` + `npm run test:database`; `npm run test:browser`.
  Browser runs: new worktrees under OneDrive fail the story (see `hide-draft-13614c-from-clients`'s
  retrospective), so run the story from the main checkout as before.

## Open questions

None.

---

## Findings during propose (2026-10-17)

These are code facts found while writing the change. They settle the open dependency and fix details the brainstorm
left to the builder. Each "my call" is marked so it can be checked at review.

### Staff names: no last names in the roster

`public.people` has a single `name` column, and the roster seeded by `initialize_workspace` (migration 001) is three
one-word personas: Alex (`prepare`), Morgan (`review`) and Sam (`admin`, `assist`, `followup`, `receive_documents`).
So the brainstorm's fallback applies: the logger is shown as the name the board shows. The rule is written so that it
gives "Hailey Z." if the roster ever has two-word names: **first word plus the initial of the last word and a period
when the name has two or more words; the name as it is otherwise.** In the demo every line therefore reads "Alex", "Morgan" or
"Sam".

### Who "a staff member" and "an admin" are in this codebase

A presenter signs in and chooses a persona; every case action names the persona (`p_person_id`). So:
- **Logged by** is the chosen persona (`logged_by_person_id`), with the presenter's user id kept beside it as the
  other case tables do.
- **Who can add**: any persona, on any case a presenter can open (`lock_case`'s presenter rule: not a client's
  private draft). That gives Alex, Morgan and Sam as the preparer, reviewer and office user of the acceptance list.
- **Who can edit**: the persona that logged the entry, or a persona with the `admin` capability (Sam).

### Fit with the existing database (my calls)

- **Own RPCs, not `vitally_apply_action`.** The call log gets two public functions, `vitally_log_call` and
  `vitally_edit_call`, written like `vitally_assistance_action` (its own envelope, receipt and revision) but with their
  own checks. They do **not** redefine `check_operation_authority`, `check_authority`, `check_payload` or the
  dispatcher, which every case action shares and which #73 is changing. They reuse only `require_membership`,
  `reserve_receipt` and `lock_case`, unchanged.
- **The case row is not touched.** Logging a call does not bump `cases.revision`, so a call logged in one window never
  turns another window's open case form into a conflict. Each entry has its own `revision` for edit conflicts.
- **Two tables.** `case_calls` holds each entry's current fields and identity; `case_call_versions` holds every
  version, the first included, append-only. An edit writes a new version and updates the current fields in one
  transaction. Nothing is deleted; neither table grants delete or update to clients, and no RPC deletes.
- **Staff-only RLS** with the `case_materials` pattern (presenter, case not a client's private draft). Both tables are
  added to the Realtime publication and to the staff channel, so another window's open case re-reads its calls.
- **Fixtures.** A sample-case reset deletes fixture cases, and the foreign keys cascade to their calls. A checkpoint
  load (`apply_fixture_scenario`) clears a case's workflow rows but is not changed here, so it **leaves the call log as
  it is**: the calls happened, and changing that function would touch the fixture code #73 is also editing. No sample
  calls are seeded.

### Fit with the case page (my calls)

- **Where:** a new **Calls** tab on the staff case page, between Follow-up and History, with the entry count on the
  tab like Documents. It holds the "Calls" section: Copy all in its header, the "Add a call" form, then the entries
  newest first. A tab is how every other section of the case page is reached, and the case page's tab list is the
  one place every staff persona looks.
- **"With: Spouse"** is always offered. The line uses the spouse's first and last name from the intake (`sp_first_name`,
  `sp_last_name`) and reads just "spouse" when there is none; the client likewise uses `tp_first_name` and
  `tp_last_name` and reads just "client" when both are empty. Names are shown as typed.
- **When** is the time the entry was first logged, set by the database and never edited. An edit keeps it and records
  its own time ("edited …").
- **Time format:** `M/D/YYYY h:mm AM/PM` in the browser's time zone (`en-US`), the same in the list and in the copied
  line.
- **Note length:** 1000 characters, like `contact_attempts.note`. "Other" names: 80 characters, like a person's name.
- **Copy** uses `navigator.clipboard.writeText`, like the reference copy on the client's saved screen, and confirms
  with the existing toast ("Copied."/"Copied 3 calls."). If the clipboard is refused, the toast says so and the line
  stays on screen to select by hand.
- **Old versions** open in place under the entry ("Earlier versions (2)"), each shown as its own summary line with
  its edit time; they are read-only.
