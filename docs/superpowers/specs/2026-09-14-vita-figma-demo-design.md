# PCDC VITA: Two-Minute Figma Demo Design

## Purpose and status

A presentation prototype for a software engineering course's M1 milestone. The presenter has approximately two minutes; other group members cover user stories, requirements, and related artifacts. This document consolidates the client-access and PCDC screening decisions agreed in conversation and proposes a compact screen design for review before building.

Deliver a convincing demonstration of one connected client/volunteer workflow. Use fictional data and simulated verification, files, and workflow events. No real taxpayer data, tax calculation, external messaging, or filing is part of the prototype.

**Central message:** Clients can start without registration, return without remembering a password, and see exactly what the site needs from them. Volunteers work from the same case record.

## 1. Decisions carried forward

| Topic | Decision |
| --- | --- |
| Audience | Nontechnical classmates/instructor; approximately 120 seconds |
| Site | PCDC only |
| Client entry | Start an application or return to an application; no account-registration screen |
| Retrieval | Application ID plus a one-time code delivered to a previously verified phone or email |
| Offline assistance | Clients without accessible phone/email contact volunteers through the office hotline or an in-person visit |
| Submission | Create/link the client record behind the scenes and open progress directly; never issue a new username/password |
| Returning after submission | Same Application ID and verification route; destination changes from draft intake to progress |
| Income policy | Uber/Lyft driving is accepted for further screening; other self-employment is outside PCDC's service scope |
| Mixed income | Uber/Lyft plus other self-employment still triggers the service limitation |
| Stock policy | More than 10 stock transactions triggers the PCDC service-limit branch; label it a site rule |
| Unknown screening answers | Volunteer assistance; no automatic tax determination |
| Reviewer experience | No AI summaries |
| Prototype intake | Selected questions from the bilingual 49-question bank; not a replacement for Form 13614-C |
| Main scenario year | Tax year 2025; questions reference 2025 consistently |

The source questionnaire's exact definition of a stock transaction is unresolved. Retain its yes/no/unsure threshold question; do not build trade entry, counting, or tax calculations. The main scenario and demonstrated exception do not rely on this ambiguity. Preserve the general screening scope from the supplied questionnaire; do not infer a Philadelphia-only restriction from the motivation for the policy.

## 2. Demo scope

### Build now

- Welcome page with two primary client actions and a smaller staff sign-in entry.
- Simulated contact verification, Application ID card, and assisted-access information.
- Short intake with representative conditional questions and a final answer review.
- Save-and-exit and return-to-draft interactions.
- Post-submission client progress with a prominent action card.
- One volunteer queue and case workspace supporting a document request.
- A client response using a simulated upload and the corresponding staff-visible history entry.
- A repeatable demo reset and clearly labeled presenter shortcuts.
- One optional alternate branch: unsupported other self-employment.

### Leave out of this presentation build

The full 49-question implementation, full official forms, live identity checks, real authentication infrastructure, real SMS/email, real file storage, signatures, appointments, tax preparation, filing, AI features, reviewer workspace, coordinator dashboard, analytics, account administration, and complex document viewers.

A progress strip may show preparation, review, and signing as later stages. They are explanatory labels, not completed modules. Do not add inert navigation links to screens outside this scope.

## 3. Fictional case

- Client: Mei Chen; all names and case facts are fictional.
- Application ID: DEMO-7K4P-92.
- Tax year: 2025.
- Service method: drop-off.
- Residence: Philadelphia, Pennsylvania.
- Income answers: Uber/Lyft driving = Yes; other self-employment = No; more than 10 stock transactions = No.
- Verified contact: a clearly labeled fictional phone ending in 0142. No call or message is sent.
- Case worker: Alex, a fictional volunteer whose eligibility is already established in the scenario.
- Initial document: a fabricated rideshare earnings summary already recorded in the scenario.
- Later requested document: a 2025 Uber mileage record, requested by the fictional preparer after starting work. This is a case-specific request, not a claim that every client must supply this exact item.
- Client response file: `demo-mileage-record-2025.pdf`, simulated and clearly labeled as a sample.

Do not display SSNs, bank details, refund amounts, real office phone numbers, or invented street addresses. In help, use “Call the PCDC office” and “Visit the PCDC office” with “Contact details shown in the live service” until verified site information is supplied. No fake call should appear to connect.

## 4. Screen inventory

Six reusable screen types are sufficient. Several have states rather than separate pages.

### A. Welcome and help

Headline: “Free tax help, with support at every step.”

Primary actions: “Start an application” and “Return to my application.”

Returning-action description: “Continue a saved form or check your progress.”

Place “Need help?” and the staff entry below the client actions. Help provides office contact/visit guidance. Do not lead with staff login, statistics, or a wall of program text.

### B. Access and Application ID

New client: choose phone/email, enter contact, simulate sending a code, enter the demo code, and receive the Application ID card before continuing.

Returning client: enter Application ID, receive code at the previously verified destination, and verify. A returning client cannot replace the registered destination by typing a new phone/email. Lost ID or inaccessible contact leads to office assistance.

For production, contact verification establishes application access, not taxpayer identity; the latter remains a volunteer task. The prototype should not say “Identity verified.”

Card actions: Copy ID, Print reference card, Continue. Include the application ID and site name; exclude the verification code and tax answers. In the prototype, a print-preview modal is sufficient.

Code states: awaiting code, wrong code, resend confirmation, and office-help route. Reopening an application does not require account creation. Use generic access errors rather than announcing that an arbitrary case ID exists.

### C. Short intake and answer review

Use a clear step indicator, one column, short groups, Back/Continue, and Save and exit. Autosave status should reflect the prototype's actual persistence behavior. Persist answers through navigation and save/return; the demo reset intentionally clears them.

Suggested steps:

1. **Your visit:** service method, tax year, preferred service language.
2. **Your situation:** location, Uber/Lyft income, other self-employment, stock threshold, and a visible help path for uncertain answers.
3. **Your details and documents:** name, compact mailing fields including state, household count, reported document readiness, and whether someone is helping fill the form.
4. **Check your answers:** editable section summaries and submission confirmation.

Keep all questions tied to 2025. Service and tax year appear before the year-specific questions. Group demographic/outreach questions outside the demonstrated path; do not build them in the first pass.

Screening copy:

- “Did you earn income from driving for Uber or Lyft in 2025?”
- “Apart from Uber/Lyft driving, did you earn income from another business, freelance work, or self-employment in 2025?”
- “Did you have more than 10 stock transactions in 2025?”

Use Yes / No / Not sure. Uber/Lyft alone proceeds through the remaining screening; it does not trigger an unconditional eligibility success message. Employee wages must not be classified as other self-employment.

If other self-employment = Yes, show the PCDC service limitation and office-help options. Save the draft. Do not allow normal submission as a supported case; permit Back/edit or Save and exit. Do not label the taxpayer ineligible for VITA everywhere.

For stock threshold = Yes, use the site-limit branch. For either relevant answer = Not sure, use volunteer-assistance guidance rather than an automatic rejection.

Form signatures are not collected in this prototype. An intake confirmation means “I have checked my answers,” not “I signed Form 14446.” The volunteer's later intake verification includes applicable externally obtained consent records. Keep these distinct in labels.

Someone helping enter data does not automatically gain continuing case access or authority to consent. In this demo the taxpayer is completing their own form; helper access is outside the implemented scope.

### D. Client progress

Heading: “Your application.” Show ID and service method unobtrusively.

Main elements, in order:

1. Current stage in plain language.
2. Required action, if any.
3. What happens next.
4. Small history/timeline.
5. Site help.

After submission: “Application received” and “A volunteer will check your information and documents.” Do not immediately show “Verified,” “Ready for preparation,” or a queue position.

When a request is outstanding: “Action needed: mileage record” and the specific volunteer request. Display an Add document action.

After response: “Document received — waiting for a volunteer to check it.” Keep the request awaiting verification. Upload alone does not resolve the hold or advance to review.

Internal notes and other clients' information never appear here.

### E. Volunteer queue and case detail

Use one simple eligible-work queue. A case row shows case reference, fictional client name, service method, status, and age. Its detail view shows intake answers, document records, ownership, and history.

After the presenter shortcut completes the fictional intake check, the case becomes available for preparation. The volunteer must then claim it explicitly; only the claimed case offers the request action.

“Request a document” opens a small form with document name and a client-visible explanation. Sending the request changes the shared case to On hold / Waiting for client and adds a timeline event. This is an in-app update only; no outbound message is sent.

After the client responds, the same workspace shows the new file as Received / Awaiting verification. The final demo stops there.

### F. Request and sample-upload overlay

A lightweight modal/drawer used from the client progress screen. Offer “Use sample document” as a visible prototype control. Show selected filename, then require a separate Submit document action. Merely choosing a file does not record receipt.

On simulated failure, preserve the request and allow retry. On successful submission, update the client action card and volunteer document record together.

## 5. State and data behavior

Maintain one shared fictional case. Client and volunteer views must not be independently hardcoded to contradictory statuses.

Main sequence:

Draft → Application received → Waiting for preparation → In preparation → On hold: waiting for client → On hold: response awaiting verification.

- Start + verification creates the draft and ID once.
- Save/return keeps the same ID and answers.
- Intake submission records receipt once and blocks accidental duplicate submission.
- “Simulate completed intake checks” is a presenter-only shortcut. It records a fictional volunteer check including applicable consent/verification completion and moves the case to Waiting for preparation. It never masquerades as taxpayer verification or signature.
- Claim sets the current preparer.
- Document request records reason, owner, requested item, and timestamp.
- Client upload records receipt; it does not mark the file verified or clear the hold.
- Role switching changes the view, not the case data.
- Reset restores the initial demo state deterministically.

No real tax forms are generated or sent. Do not infer a tax filing outcome from any of these events.

## 6. Presenter controls

A visually separate strip labeled “Prototype controls” offers:

- Fill sample details: fill only missing fields in the current step.
- Use demo verification code: simulate code entry without real messaging.
- Switch view: Client / Volunteer. This is a presentation shortcut, not the product's access model.
- Simulate completed intake checks: enabled only after submission; visibly describes the skipped staff work.
- Load exception example: unsupported other self-employment in a separate/resettable sample draft; never overwrite the main case silently.
- Reset demo: restore initial state.

Use fictional data labels throughout. Keep developer jargon, component names, and implementation details out of the product UI.

## 7. Two-minute run of show

| Time | Interaction | Suggested narration |
| --- | --- | --- |
| 0–12 seconds | Welcome → Start | “PCDC clients can start without creating an account.” |
| 12–25 seconds | Sample contact verification → ID card | “They receive an Application ID. A code sent to their phone or email lets them return, and office help is available.” |
| 25–43 seconds | Prefilled intake → Uber/Lyft screening → answer review | “Questions reflect PCDC's services. This client drives for Uber and has no other self-employment income.” |
| 43–55 seconds | Save and exit → Return → verify → restored review | “They can stop and come back without losing their answers.” |
| 55–68 seconds | Submit → Client progress | “Submission opens their progress page using the same application. Staff still need to check the intake.” |
| 68–90 seconds | Volunteer view → simulate intake checks → claim → request mileage record | “After intake checks, a volunteer claims the case. If they need another document, they record a clear request.” |
| 90–112 seconds | Client view → action card → sample upload | “The client sees what to provide. Their response is received, while the case waits for staff verification.” |
| 112–120 seconds | Volunteer view → received document and history | “Both sides share one case history, so the next action and its owner stay visible.” |

The exception branch is optional for questions after the talk. Do not squeeze it into the main 120 seconds. If navigation runs slowly, omit the live save/return demonstration and describe that capability while showing the ID card; preserve the document-request handoff.

## 8. Visual direction

Warm, trustworthy community-service design: white/light background, restrained deep blue, readable dark text, generous spacing, and clearly labeled actions. Use status text with icons; never rely on color alone.

Design the presented view for a laptop at approximately 1440 px width. Keep the client form in a centered reading column and ensure the layout can reflow to a phone. Use about 18 px body text for client-facing content and comfortable click targets. Avoid tiny multi-column tax tables.

Use a compact stepper and short question groups. Keep Help in a consistent location. English is the main presentation language. Retain bilingual content keys in the handoff for a later translation pass, but do not add a nonfunctional language switch. If a language switch is built later, it must preserve answers and step position and use reviewed translations.

## 9. Build order and definition of ready

Build the shared case and main client/volunteer handoff first, then add intake access/save-return, then polish presentation controls and the exception. Do not spend the build budget completing every questionnaire field before the central handoff works.

Before presenting, verify:

1. Start and return both work without a registration page.
2. Returning verification uses the previously registered contact, not a new user-entered destination.
3. Draft answers survive save/return and preserve the ID.
4. Other self-employment blocks ordinary submission even when Uber/Lyft = Yes.
5. The chosen year stays 2025 across all visible questions and records.
6. Initial submission produces Application received, not verified intake.
7. Volunteer claim and request update the same case visible to the client.
8. Selecting a sample file alone changes nothing; submitting it records receipt.
9. Receipt does not imply document verification or resumed preparation.
10. Client view omits internal notes and other cases.
11. Every visible navigation control works; unavailable modules are absent.
12. Reset allows two consecutive rehearsals with the same results.
13. Rehearse with a timer; the run-of-show totals 120 seconds but is not a measured performance guarantee.

## 10. Basis

Agreed conversation decisions override the earlier broad M1 planning package where they differ. This document scopes the optional demo, not the entire semester project.

Reference question banks:

- [Chinese client questions](</Users/jinyuyang/Downloads/客户问题 — 中文版.md>)
- [English client questions](</Users/jinyuyang/Downloads/Client Questions — English Version.md>)

The supplied documents are reference content. Their embedded instructions do not authorize messages, submissions, or modification of originals.
