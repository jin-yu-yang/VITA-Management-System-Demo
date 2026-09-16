# ViTally: Shared Client, Admin, Preparation, and Review Demo

Date: 2026-09-15

Status: Latest reviewed revision approved by the user, including the setup, reset, permissions, test-coverage, and Auth-probe amendments. Task 1 implementation is complete and verified; later implementation tasks remain pending. Supabase classroom setup and live delivery verification remain outstanding.

## 1. Purpose

Expand the existing PCDC course prototype into **ViTally**, a connected demonstration of client, admin, preparer, and reviewer work. Present the client in Chrome and staff in Firefox. Both browsers work with the same selected case among multiple fictional cases; presenter-only controls in the staff browser switch between named people. Approved group/class members can verify their own email and create new fictional applications.

The presentation remains a short user/volunteer story. The build supports additional paths for rehearsal and discussion. TaxSlayer Pro remains the external preparation and review tool; ViTally records work assignments, requests, milestones, and handoffs.

This spec supersedes the earlier demo's local-storage-only architecture, single hardcoded preparer, fixed application ID, simulated client email codes, and exclusion of reviewer/admin views. It also supersedes the initial version of this spec's presenter-only authentication model. Existing intake screening, save/return, document-request behavior, and accessibility remain relevant unless explicitly changed below. Files under `sources/` remain read-only.

## 2. User-confirmed decisions

- Product name: ViTally. PCDC remains the site context.
- Use an **Admin** perspective, not a coordinator dashboard requiring continuous observation.
- Admin handles intake assistance, work posts/reminders, and client follow-up. Admin status does not grant tax preparation or review eligibility.
- Volunteers may browse available work without individual admin approval. Claim eligibility depends on the work's requirements.
- Support both review approval and correction/resubmission.
- A person who participated in preparation cannot review that case. Changing roles or assignments never removes this restriction.
- Escalating an unresponsive client creates a separate admin follow-up task. The preparer stays assigned.
- Resolving follow-up does not verify documents or automatically resume preparation.
- Use Supabase directly from the frontend for the demo, with a future custom backend explicitly outside today's implementation scope.
- TaxSlayer milestones are manually recorded provisionally; no automatic integration is presumed.
- Use fictional application details and simulated documents, reminders, and tax-work milestones; real email verification is included.
- New applicants are limited to the user's group/class, with explicitly approved email addresses.
- Generate unique application IDs and keep one-click random fictional form filling. Filling details never sends an email or submits an application.
- Use the user's school Gmail as the preferred SMTP sender if its account policy permits it. Only authentication email is included; other email notifications remain deferred.

The operational background supplied by the user informs this design: a small admin team supports intake and daily cases, language barriers affect handoffs, and some clients prefer calls from the main office. This is stakeholder context, not an independently verified policy statement.

## 3. Scope

### Included

1. ViTally branding across the demo, retaining PCDC as the service site.
2. Group/class-only client entry and return through real email OTP, plus client-owned fictional applications.
3. Admin entry of a fictional drop-off case and an explicit intake-readiness checkpoint.
4. Shared work board containing tax-return cases and a small intake-assistance example.
5. Named demo personas and independent browser/window navigation.
6. Preparation claims, document requests, sample responses, and explicit document verification.
7. Admin follow-up tasks with contact attempts and outcomes, without releasing the preparer.
8. Review claims, findings, correction/resubmission, approval, and recorded client follow-up.
9. Central state, live change notifications, recoverable failed saves, and synchronized reset.
10. Presenter shortcuts for repeatable story checkpoints.
11. Database-generated unique application IDs, safe one-click fictional form filling, and six varied seed cases alongside newly created applications.
12. Real case ownership/access checks for class applicants; privileged persona switching and resets remain presenter-only.

### Deferred

Recruitment, promotions, procurement, training management, meetings, policy-announcement distribution, partner-site administration, real Slack/SMS/Google Voice integration, non-authentication email notifications, actual document uploads, taxpayer identity verification, signatures, filing, tax calculations, TaxSlayer integration, public self-sign-up, and a custom application backend. Real phone/SMS sign-in is deferred; the active applicant access route is email.

The reviewer can record that a conversation about the reviewed return occurred. ViTally does not capture account/routing numbers, calculate amounts, or give payment/refund instructions in this increment. Review approval is neither signing completion nor filing acceptance.

## 4. Personas and permissions

| Persona | Demo capability | Primary workspace |
| --- | --- | --- |
| Mei Chen, fictional client | Own application and client-visible requests/progress | Client portal |
| Alex, fictional preparer | Claim eligible preparation work, request/check documents, record preparation, resolve corrections | Volunteer worklist and case |
| Morgan, fictional reviewer | Claim eligible independent reviews, record findings/approval, record client follow-up | Volunteer worklist and review |
| Sam, fictional admin | Assisted intake, assistance work, reminders, client follow-up, permitted case closure | Admin work board and follow-up tasks |
| Approved group/class applicant | Create fictional applications; access only their own client-visible records | Client portal |

Sam's default profile has no preparation or review capability. The model allows an admin to hold separately established review eligibility; title alone grants none. Eligibility is preconfigured in fictional profiles, not a certification-management feature.

Distinguish operational authority from technical eligibility in the implementation plan's shared action-check order. Step 4 checks owner/presenter authority, that the selected person belongs to the workspace, and operational flags (`admin`, `followup`, `assist`, `receive_documents`); failures are `FORBIDDEN`. The `prepare` and `review` flags are technical eligibility checks performed only at step 7, after revision/stage checks and the self-review check; missing qualification is `INELIGIBLE`. For a fresh Ready for review case that Sam did not prepare, a presenter's claim as Sam returns `INELIGIBLE`. An applicant forging a staff persona on their own case returns `FORBIDDEN` before those eligibility checks. Admin title does not substitute for either technical flag.

Store stable person IDs independently from display names and capabilities. A successful preparation claim atomically inserts the person into preparation participation history; claiming is the demo's conservative participation threshold. Keep that record for the case's lifetime across correction cycles and role changes. Prepared fixtures must include every former/current preparer. Intake assistance/checks, staff-recorded receipt, admin contact, and review do not add preparation participants. Every review claim and review completion checks eligibility and participation history. Reassignment scenarios are privileged test fixtures only; a product reassignment/release feature is deferred.

The presenter-only toolbar switches named demo people; it does not modify their eligibility. Switching a persona never changes case ownership. A prototype-only verification fixture may give Alex review eligibility to demonstrate that self-review remains blocked. Class applicant access grants no staff capabilities or presenter controls. Only specifically provisioned presenter accounts may select staff personas; ordinary classmates cannot promote themselves through account metadata or requests.

## 4A. Group/class entry, IDs, and sample data

### Approved email access

Use an exact email roster, not a whole-school domain rule or a shared password. During privileged setup, pre-provision approved Auth users and active class memberships; disable public and anonymous sign-up. The frontend requests email OTP for existing users only. Supabase's server configuration and database permissions enforce this restriction even if someone bypasses the UI. Roster and presenter permissions cannot be changed by applicants.

The applicant experience remains simple: enter the approved email, request a code, verify it, then start or resume an application. There is no chosen password or separate registration form. Privileged roster setup does not itself send invitations; users request their own verification messages. Disable data access immediately when a class membership is revoked, including for existing sessions.

Supabase supports restricting sign-in to existing users by disabling sign-up; the frontend's `shouldCreateUser: false` is an additional behavior setting, not the security boundary. See [Auth configuration](https://supabase.com/docs/guides/auth/general-configuration) and [email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless).

### Start and return

After verification, explicitly starting a new application creates a new case with a stable owner tied to the authenticated user. One user may create multiple fictional applications for testing; reopening, refreshing, retrying, or filling a form does not create an additional case. Provide a simple “My applications” list.

Generate an internal UUID and a readable reference such as `VT-7K4P-92DX` in the database. Enforce uniqueness across the project and retry reference collisions; retain action IDs to prevent duplicate creation on retry. The application reference is not an access credential.

The reference contract is `VT-XXXX-XXXX` with alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, excluding I, O, 0, and 1. The database, frontend, and tests share that exact format.

Return uses the original approved email and a real OTP, then an owned-application selection or Application ID lookup. Do not reveal case details or the registered email from a public ID lookup. Authenticating a different email does not transfer ownership. Store no real verification codes in case records or history.

Admin-created and seeded cases have no automatic ownership inferred from typed email or fictional names. Such cases remain staff-managed unless privileged setup explicitly binds a presentation fixture to a designated test client account. General-purpose transfer/recovery of client access is deferred.

### SMTP and delivery

Configure Supabase Auth's custom SMTP with the preferred school Gmail sender only if that account permits app-password-based SMTP. The selected fallback is Resend SMTP using a presenter-controlled verified domain; domain/DNS access is a setup dependency and any domain purchase needs the user's approval. Do not assume permission to send as the school's domain through Resend. Its Free tier is the starting plan; verify current limits at setup. Supabase's default sender is not the class-access fallback. Enter SMTP credentials in Supabase settings; never place them in browser assets, case data, source files, or chat. If neither sender can be configured yet, continue independent local work and report email delivery as pending; never silently simulate successful live delivery. See [Resend SMTP](https://resend.com/docs/send-with-smtp) and [domain verification](https://resend.com/docs/dashboard/domains/introduction).

Send only authentication OTP messages in this increment. Successful submission, document requests, reminders, and bulk fixture creation send no external email. Verification uses real invalid/expired-code handling; no fixed demo code appears on the real authentication screen. Details follow [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Google SMTP setup](https://support.google.com/a/answer/176600?hl=en), and [Google app-password availability](https://support.google.com/accounts/answer/185833).

Every syntactically valid code-send request enters the same code-entry state and shows exactly: “If this address is eligible, check your inbox for a sign-in code.” Start the same resend cooldown when the request begins, set to the verified server email minimum interval plus 5 seconds (65 seconds when the server interval is 60). Confirm the actual hosted interval during setup; expose only the numeric public cooldown configuration. Accepted sends, unknown email, rate limiting, provider errors, and transport failures all retain that identical notice/state/cooldown; do not replace it with outcome-specific retry guidance, a delivery claim, or raw Auth errors. A separate connection notice may reflect browser offline state or an address-independent connectivity check for all users; it must not depend on Auth error codes or the address. Invalid email syntax can be rejected locally before a send begins. Code verification is a separate operation and can show real invalid/expired-code failures without disclosing roster membership. This is a UI privacy measure, not a guarantee that the directly callable Supabase Auth service has indistinguishable responses.

Exact diagnostic status/error codes are implementation evidence to collect in the isolated Auth probe, not assumed facts or user-facing text. Keep observed diagnostics out of the applicant UI and exclude email addresses, OTPs, credentials, and tokens from delivered logs. Live sender delivery remains unverified until the approved-recipient test succeeds.

### Fictional details and seed cases

Keep “Fill fictional details” as a safe form helper for both the presenter and admitted applicants. The presenter panel also exposes it. Fill blank fields with a coherent fictional scenario while preserving the verified email and already edited answers. An explicit “Generate another example” action can replace the fictional answers after warning about replacement, without changing identity, case ID, or workflow stage. Use non-routable example contacts for unrelated fictional contact fields; never generate a real email recipient.

Use scenario templates with randomized fictional names/details so ordinary samples pass the demo's intake rules and household fields remain consistent. Unsupported-income examples stay a deliberate exception choice. Generating sample values never creates Auth users or sends mail.

Seed six tax-return cases: ready for preparation, waiting for documents, admin follow-up needed, ready for review, corrections required, and review approved. Seed one assistance work item separately. Each case has consistent assignments, requests, and history for its stage. Newly submitted class applications join the same class workspace's staff board without replacing fixtures. Clients see only their own applications, not the board or other clients' seeded cases.

## 5. Work board and intake

### Tax-return case

The board shows case reference, service type, language, work needed, eligibility requirements, stage, and assignment. Avoid taxpayer identifiers and document contents in board summaries. Eligible volunteers can claim available work without a separate approval step.

Admin can create the fictional drop-off example using sample details. The create-case contract includes the selected `personId`: assisted creation requires an authenticated presenter and a same-workspace person with `admin` capability, leaves the client owner null, and records both authenticated creator and acting admin. Client creation derives its owner/actor from authentication and requires no staff person; a supplied staff identity is rejected. The server never accepts owner/workspace authority from answers. Admin records receipt/checklist facts; submission alone is not verified intake. The existing explicit simulated intake checks move a received case into the preparation queue.

### Assistance request

A distinct work-item type supports the seeded example, “Client needs help completing intake forms.” It has open, assigned, and resolved states, an assigned helper, language/contact preferences, and an optional linked tax-return case. It does not pass through preparation or quality review. Completing assistance does not certify that a linked case has passed intake checks.

For this increment, the assistance example can be claimed and resolved, with an optional link to the main case. A new assistance fixture begins open at revision 1 with no helper; claiming produces assigned/revision 2 with the selected eligible helper, and resolving produces resolved/revision 3 while retaining that helper and resolution note. These actions leave the linked case's stage, intake verification, preparer, and reviewer unchanged. General-purpose task management and automatic conversion to a tax-return case are deferred.

### Reminders

Admin may record a simulated reminder on an available work post. The action records actor and time, marks that post as recently reminded, and displays a confirmation that no external message was sent. It creates neither a new case nor new access permissions. Both browsers see the update.

## 6. Case lifecycle

Represent work stage separately from a blocking document request or admin follow-up. A case can remain in preparation with Alex assigned while waiting for a document and while an admin task is active.

| Stage | Entry condition or action | Next action |
| --- | --- | --- |
| Draft | Client begins an application | Complete and submit intake |
| Received | Client/admin submits initial details | Record simulated intake checks |
| Ready for preparation | Intake checks complete | Eligible preparer claims |
| Preparing | Preparation claimed | Resolve blockers and record preparation complete |
| Ready for review | Assigned preparer records completed work in TaxSlayer | Eligible independent reviewer claims |
| In review | Review claimed | Request corrections or record approval |
| Corrections required | Reviewer records specific findings | Assigned preparer resolves findings and resubmits |
| Review approved | Reviewer records successful external review | Record client follow-up; explain that signing is a later milestone |
| Closed | Admin explicitly closes a pre-approval case with a reason | Read-only history |

Review client follow-up is a separate pending/completed activity after approval, not a claim that signing or filing is complete. No automatic transition to filed, accepted, or refund issued exists.

### Document request and response

1. The assigned preparer creates a named request and client-facing instructions.
2. The case retains its current Preparing or Corrections required stage with a “Waiting for client” blocker.
3. The client submits the fictional sample document.
4. The request becomes “Awaiting verification”; the preparation blocker remains.
5. The preparer explicitly verifies the response and resolves the blocker.

Only the current assigned eligible preparer, with an existing participation record, may request or verify documents in Preparing or Corrections required. A former preparer, admin title, or reviewer assignment grants no such authority. `RESPOND_DOCUMENT` requires the authenticated case owner. For an assisted case with no client owner, Sam may use a distinct “Record sample document received” action (`RECORD_DOCUMENT_RESPONSE`), with administrative receipt capability. This records source `staff_recorded` and both the authenticated presenter and selected staff person; it leaves the response awaiting the preparer's verification. It neither creates client access nor claims a client uploaded a file.

Open document requests prevent sending or resubmitting the case for review. A failed simulated upload preserves the request and lets the user retry without creating duplicate document records.

### Admin follow-up

Escalation requires a reason and creates one active follow-up for that unresolved request. Repeated clicks do not create duplicates. The server assigns the task to the workspace's configured default follow-up person, Sam; it never accepts a browser-supplied assignee. Setup guarantees that person exists and has follow-up capability. Contact attempts/resolution require that assigned person and capability. General admin-team reassignment and follow-up claim actions are deferred.

The task exposes language and contact preferences, including “Prefers calls from the main office.” Admin records attempts and results such as no answer, reached client, or client requested closure. No answer leaves follow-up open. Recording even a successful attempt does not resolve it. `RESOLVE_FOLLOWUP` accepts only `reached` and `no_further_contact`, with an outcome note.

The preparation owner and preparation history remain intact throughout. If the client responds while follow-up is open, admin sees the response and can resolve the task as no further contact needed; receipt alone does not resolve it automatically. Once the requested document is verified, an unfinished contact task does not itself block preparation or review submission; it remains visible to admin until resolved.

Closing a case is a separate admin action with a reason and confirmation. In this demo it is limited to cases before review approval, preserves history, and marks unfinished requests/tasks cancelled without representing external tax-return cancellation. No timeout automatically closes a case.

### Review and corrections

The preparer manually records that preparation in TaxSlayer is complete. Review is a distinct assignment, preserving the preparation owner and participants.

A reviewer records the result of external review. A correction request must contain specific findings, returns action to the assigned preparer, and remains visible in history. The case stays in Corrections required while the preparer works, including any document-request hold. The preparer records resolution notes and explicitly resubmits. The case returns to Ready for review; the previous reviewer may reclaim it, or another eligible independent reviewer may claim it. Only a fresh review of the resubmitted preparation version can approve it.

Each submission for review creates a preparation version and ends any earlier active review assignment. Review attempts refer to that version. Keep this version separate from the synchronization revision, which can also change because of administrative notes or contact attempts.

Prior review attempts remain immutable history. Internal findings are not copied into client-facing messages. The client sees plain-language progress; staff must create an explicit client-facing request when client action is needed. For this increment, missing-document requests are created by the preparer; a reviewer routes such a finding back through corrections.

## 7. Shared state and application structure

Retain the existing browser application and local asset server. Add a dedicated data-access module between screen/workflow actions and Supabase. Screens do not make scattered direct database calls. A future backend can replace this module's transport, while authoritative permission and transition logic will require a separate backend migration.

### Central records

- Class demo workspaces, owned by the presenter, with approved applicant memberships and separately granted presenter access.
- Seeded fixture collections with their own generation/reset boundary.
- Persistent named demo people, their preconfigured capabilities, and the workspace's default follow-up person.
- Privileged setup bindings from stable fixture keys to designated client accounts, independent of resettable case IDs.
- Cases, including authenticated client owner where applicable, readable ID, fixture flag, stage, revision, client answers, and contact/service preferences.
- Assignments and preparation participation history.
- Document metadata and document requests; no document contents.
- Review attempts, findings, and resolution records.
- Admin follow-up tasks and contact attempts.
- Assistance work items.
- Append-only workflow events, including actor, action, time, and relevant outcome.

Rows belong to a class demo workspace. Application IDs are unique across the project. Staff queue counts derive from visible submitted records, rather than being manually maintained. Applicant drafts remain private to their owner until submission; a staff-created intake draft is accessible to authorized staff. A workspace is an access boundary, not a requirement that both browsers use the same login.

Use one idempotent privileged workspace initializer shared by classroom setup and isolated-test setup. It creates or validates persistent workspace people first (Alex: `prepare`; Morgan: `review`; Sam: `admin`, `followup`, `receive_documents`, `assist`), then sets `default_followup_person_id` to that workspace's existing Sam. It also records explicit fixture-client bindings supplied by authorized setup. Repeating initialization preserves established person IDs and valid bindings; it neither creates duplicate people nor silently overwrites established configuration. This initializer is not an applicant/presenter browser operation and does not send email. A guarded test-only `extendTestWorkspace` helper may subsequently add an explicit person/capability (Alex review, Casey preparation) in a workspace belonging to the current isolated test-run manifest. It validates the test target and private run marker before any additions, preserves existing IDs, and never duplicates baseline seeding or grants Auth membership. It records test overrides atomically and is idempotent for identical additions. Once overrides exist, rerunning the normal initializer returns VALIDATION without changes; tests needing normal initialization again use a fresh workspace. Classroom tools cannot invoke this helper.

### Authentication, ownership, and prototype identities

Create a new Supabase project for the demo. For the full presentation, Chrome signs in as an approved test client using real email OTP; Firefox signs in as an authorized presenter and selects the staff persona. The same login is not required in both browsers. Class applicants use their own approved email identities.

Client isolation is enforced in database access policies and mutation functions, not just by hiding UI. Applicants may read their own client-visible application data, submit permitted client actions, and receive updates for those records. Store internal findings, staff contact notes, and internal history separately from client-readable records so selecting extra fields cannot expose them. Realtime subscriptions respect the same boundary.

Presenter accounts are explicitly provisioned to inspect submitted work and impersonate demo staff within their authorized workspace. This staff role switching remains a prototype facility, distinct from the authenticated class-client access model. A requested actor/persona ID never grants privilege on its own. Real taxpayer identity checks and production staff credential administration remain outside this demo.

Use a browser-safe publishable key. Never put an administrative/service secret into frontend assets. Unauthorized, revoked, or unauthenticated users cannot read or mutate workspace data. Only authorized setup can grant roster membership, presenter access, or ownership of a staff-created fixture.

Revoke execution on application RPCs explicitly from PUBLIC, anon, and authenticated before granting only the intended authenticated entry points. Apply equally explicit privileges to application tables; authenticated clients receive only required reads, not direct workflow writes. Internal helper functions live in a non-API-exposed `vitally_private` schema with no browser-client execute privilege. Grant `service_role` explicitly the schema usage and enumerated application-table privileges required by fixtures and scoped cleanup; do not assume RLS bypass supplies SQL privileges. The owner-only private initializer is invoked over the direct SQL connection and grants no private-helper EXECUTE to service_role. Scope grants to application-owned objects and audit them, including denial of client/private-helper access. Privileged credentials never reach browser assets. RLS checks and functions enforce ownership in addition to grants. An anonymous direct call to every public application RPC must fail.

### Writes, claims, and live updates

Database mutation functions validate authenticated membership, case ownership or presenter authority, permitted transitions, persona capability, self-review rules, and expected revision. Each accepted action updates its records and appends history in one transaction. Do not permit direct browser writes that bypass these checks. For clients, derive the actor from the authenticated user rather than trusting a supplied staff/persona ID.

Use a unique action ID for retry handling. A repeated accepted action returns its existing outcome; it does not add another claim, document, or history item. Competing claims allow exactly one winner. A stale write produces a readable conflict and reloads current state rather than silently overwriting it.

Action receipts must survive fixture reset: target case/person identifiers in receipts are historical scalar values without cascading foreign keys to resettable records. Scope receipts to authenticated user and workspace; retain their request digest and fixture generation. An old action cannot recreate reset data. Tests use a separate hosted Supabase test project or isolated local Supabase instance with privileged cleanup restricted to recorded run-owned user/workspace IDs, never the classroom project.

Use one SQLSTATE-to-domain-error mapping across database functions and the adapter. Apply target visibility before revealing state; applicants receive `NOT_FOUND` for absent and other-owner cases alike. Operational authorization returns `FORBIDDEN`; technical `prepare`/`review` qualification returns `INELIGIBLE` only at its later eligibility check. After general authorization and idempotency/revision checks, validate stage before self-review, technical eligibility, and stage-specific assignment checks, so approval after a correction request at the latest revision consistently yields `INVALID_TRANSITION`; a stale revision yields `CONFLICT` first. Failed SDK calls are explicitly converted from `{error}` to thrown domain errors by both production and test adapters.

After a successful write, show server-confirmed state. Subscribe only to authorized workspace/case changes and refresh affected records. Re-fetch when the subscription reconnects or the window regains focus; subscriptions are not the only recovery mechanism. Do not let out-of-order responses replace a newer known revision.

Publish only INSERT/UPDATE events for the dedicated demo's Realtime stream and verify the publication flags in the database catalog. Do not publish raw case DELETE events: deleted rows cannot be authorized through their former RLS state, so even deleted IDs must not reach another applicant. Fixture reset instead updates the authorized workspace generation signal and triggers a fresh authorized read. If an existing shared publication cannot be restricted without affecting unrelated consumers, use a dedicated, non-deleted, RLS-protected change-notification table and remove the raw delete path before enabling this demo's Realtime access.

### Local browser state and failures

Selected persona, navigation, form step, and open panels are local to each window, using session storage where persistence is useful. These are not shared case attributes. A staff persona switch must not navigate the client browser.

Supabase becomes the source of truth for case data. Existing local-storage demo cases are not automatically uploaded or merged; the class workspace starts from approved fictional fixtures and accepts new class applications.

Preserve unsaved form values when a remote notification arrives. Save on defined actions and show unsaved/saving/saved or failed states accurately. A failed save retains editable input and offers retry. Disconnected users can read the last loaded view with a connection notice, but workflow actions cannot report success until confirmed. Offline write queues and automatic local fallback are deferred to avoid divergent cases.

Controller state consistently uses `savedCase`. On first edit retain `editBaseRevision`; a newer server revision during editing updates `savedCase` but preserves local answers and marks a conflict. Do not silently rebase pending edits. Explicit reconciliation selects answers and a new edit base. Unknown-outcome retries preserve the complete original action envelope, not just its action ID.

## 8. Screens and presentation controls

- **Client:** email OTP entry/return, My applications, intake with fictional-details helper, progress, explicit next action, sample document response, and simple review progress.
- **Volunteer:** available and assigned work, preparation workspace, review workspace, documents, findings, and history.
- **Admin:** work board, assisted-intake entry, assistance example, follow-up tasks, contact attempts, reminders, and explicit closure.
- **Prototype panel (presenter only):** named personas, class workspace/fixture indicator, fictional-details helper, checkpoint loading, seed reset, and connection status. Applicants may use the form helper but cannot invoke privileged prototype actions, including through direct requests.

Keep layouts usable in two side-by-side windows. Preserve keyboard navigation, modal focus handling, clear errors, and text labels alongside status colors.

Checkpoint controls load a consistent fictional state for intake ready, document requested, admin follow-up needed, ready for review, or corrections required. They apply only to a selected seeded presentation case after confirmation; reject use on class-created applications. “Reset sample cases” replaces only that workspace's marked fixtures and seeded assistance item. It never deletes real class identities, approved email memberships, or class-created fictional applications. Both browsers refresh relevant state while retaining their local perspective where valid. Fresh fixture record identifiers/generation invalidate old in-flight actions so stale screens cannot restore reset data. No whole-class wipe control is included.

Reset also preserves permanent people, their IDs/capabilities, the default Sam pointer, and privileged fixture-client bindings. Store bindings by `(workspace_id, fixture_key)` outside resettable cases, with the designated client owner; setup verifies that the account belongs to the intended workspace. Each new fixture case keeps its stable fixture key and receives the corresponding explicitly configured owner despite its new case UUID. Unbound fixtures remain owner-null. Checkpoints preserve the same binding. Reset never grants or reactivates membership, and ordinary callers cannot modify binding configuration. Retained class-created assignments and preparation participation must continue to reference the same people after reset.

## 9. Demonstration script

1. Start with six cases visible on the staff board. In Chrome, an approved test applicant verifies their email, fills fictional details in one click, and submits a new application with a generated ID. Admin records intake readiness. An alternate shorter opening uses admin-assisted drop-off intake or a prepared fixture.
2. Alex claims preparation and requests the sample mileage record.
3. Presenter narrates the waiting scenario; Alex creates admin follow-up. There is no mandatory elapsed-time gate. A prepared checkpoint is an alternative for a seeded presentation case only.
4. Sam records contacting the fictional client through the office and resolves the follow-up. Alex remains assigned.
5. In Chrome, the authenticated test client responds with the sample document for their own case.
6. Alex verifies the document and records preparation complete.
7. In Firefox, switch to Morgan and claim independent review.
8. Short presentation: record approval. Extended branch: record a finding, switch to Alex to resolve/resubmit, then switch to Morgan to reclaim and approve.
9. Morgan records client follow-up; the client sees review complete and the next service step, without implying filing is complete.

For a two-minute presentation, begin from a prepared checkpoint and narrate off-screen intake/tax work. All checkpoints and time jumps are clearly labeled simulated.

## 10. Verification and acceptance

Implementation must demonstrate:

1. Chrome's approved client and Firefox's presenter see the same submitted case under different accounts; neither persona changes nor page refresh navigates the other window.
2. Application submission, document response, task changes, and review results appear in the other browser without manual data copying.
3. Two simultaneous claims produce exactly one owner and one claim event.
4. A person with review capability still cannot claim or approve a case they prepared, including after persona switches or reassignment fixtures.
5. Both review paths work; correction resolution requires resubmission and a subsequent review before approval.
6. Escalation preserves Alex's assignment. Admin resolution alone neither verifies a document nor removes a document blocker.
7. Client response during admin follow-up preserves both histories and requires explicit resolution/verification.
8. Assistance starts open at revision 1 with no helper, becomes assigned at revision 2 with Sam, and resolves at revision 3 retaining Sam and the resolution note. The linked case's stage, intake verification, preparer, and reviewer remain unchanged.
9. Reminder actions neither duplicate work nor send external messages.
10. Manual TaxSlayer milestone language, simulated uploads, real email-verification behavior, and review-versus-filing distinctions remain visible.
11. Failed saves, lost connections, stale revisions, and retrying accepted actions do not report false success or duplicate changes.
12. Reset/checkpoint changes affect only authorized fixture records, preserve class-created applications and identities, and prevent old pending writes from restoring previous fixture data.
13. Unauthenticated, unapproved, revoked, or other-workspace accounts cannot read/mutate restricted data; direct writes cannot bypass workflow functions.
14. Existing intake screening, save/return, required-field checks, accessible dialogs, and narrow-screen layouts continue to work.
15. An approved email receives a real OTP and can start/return; invalid/expired verification fails clearly without fixed-code bypasses. Every syntactically valid send, including unknown-email, rate-limit, provider, and transport outcomes, presents the identical neutral code-entry notice and configured server-interval-plus-5-second cooldown measured from request initiation (65 seconds for a 60-second server interval). A non-roster user cannot self-register by calling Auth directly.
16. Applicant A cannot read or change applicant B's case by guessing its reference, querying data/functions directly, or subscribing to changes. Applicants cannot read internal notes or impersonate staff.
17. New case creation generates distinct stable IDs; concurrent creation and retries do not collide or duplicate the same action. My applications shows only owned cases, including multiple test applications per account.
18. One-click filling preserves verified email and edited fields; explicit regeneration does not change case identity or stage. Neither action submits, sends mail, or creates Auth accounts.
19. Six coherent seeded cases coexist with new applications; board filters/counts reflect the selected workspace and actual stage. Resetting fixtures leaves new applications untouched.
20. Staff record a simulated response on an unowned assisted case; it still requires preparer verification. Record-contact alone cannot resolve a follow-up.
21. Anonymous requests to every application RPC and protected table fail; clients cannot call internal helpers. Public function ACLs are inspected after migrations.
22. Each complete browser story runs in both directions: Chrome client/Firefox staff, then Firefox client/Chrome staff. Email-free automated login enters a generated one-time code into the real form and calls real verification; live SMTP delivery is checked separately against approved recipients.
23. Subscribe as applicants A and B without owner filters to the same permitted stream and await both SUBSCRIBED. Commit a B-owned control and await B's callback, then commit A's uniquely marked change and require A's exact revision callback. Commit a later B-owned fence and await it on B's same channel; B's collected payloads through that ordered fence must contain no A ID/marker. Cover every owner-scoped client-visible published table/event type and the production adapter. Separately verify both authorized workspace members receive the shared generation signal without private case IDs or contents. Missing controls, disconnects, channel errors, or the 15-second deadline fail the test; a quiet timeout never proves isolation. Internal-note tests use presenter positive controls and verify no applicant data payload. A direct applicant DELETE subscription during another client's fixture reset must likewise receive no raw deleted IDs; include an UPDATE control handler on that same channel so later ordered fences prove delivery progress. Inspect INSERT/UPDATE-only publication flags and verify generation-driven refetch.
24. With admin follow-up still open, record a document response, have Alex verify it, then submit for review successfully. The case reaches Ready for review with its preparation version advanced and Alex retained; Sam's follow-up remains open. No contact-resolution action is required for this transition.
25. Reset yields exactly six coherent fixture cases and one assistance item while preserving the class-created case, its owner/reference, Auth membership, permanent people/capabilities, default Sam pointer, and durable binding configuration. The bound fixture gets a fresh UUID but the same configured client owner. An applicant's reset returns `FORBIDDEN` and changes neither fixture IDs nor generation. Assert query errors explicitly so a broken read cannot masquerade as preservation or isolation.
26. In both browser-role permutations, presenter persona changes and reloads leave the client's selected application, screen/form step, and local panels unchanged while authorized shared updates arrive. Two presenter tabs/pages in the same BrowserContext and origin under the same account can retain Alex and Morgan independently through refresh; persona state is window-local.
27. On a fresh Ready for review case with no Sam preparation participation, presenter-as-Sam gets exactly `INELIGIBLE` for review claim because Sam lacks `review`. The applicant's forged staff action on an owned case gets exactly `FORBIDDEN`. Assisted creation likewise requires a same-workspace admin and records both authenticated creator and acting person.
28. Before test overrides are applied, repeated privileged initialization preserves permanent identities and bindings, configures Sam only after people exist, and succeeds with its explicit setup grants. After test enrichment it returns VALIDATION without changing the workspace; the guarded extension helper remains idempotent for identical additions. A client cannot invoke that initializer or mutate setup bindings. Test-project API and PostgreSQL guards reject mismatched, missing, or classroom configuration before any privileged write or migration.

Use focused domain and database integration tests for workflow invariants, then actual browser verification of the presentation story. Cross-browser acceptance must include Chrome and Firefox, not solely two pages in one browser engine.

Before investing in the full browser story, run a minimal generated-OTP trial in both real Chrome and Firefox against the isolated test instance. Generate a fresh one-time credential for a pre-provisioned test user through authorized test setup, enter it through the actual code form, and call the real verification endpoint. The automated send request may be intercepted solely for the isolated test project to prevent email; verification must not be intercepted or bypassed. Confirm a real session and membership lookup in each engine. Record the actual supported generation/verification behavior and sanitized diagnostic codes as evidence; an unverified SDK assumption does not satisfy this gate. Invalid/expired verification coverage and live sender delivery remain separate tests.

## 11. Setup dependencies and delivery sequence

No Supabase project exists yet. Provision a classroom project plus a separate hosted test project or isolated local Supabase instance; do not run privileged test cleanup in the classroom project. Implementation planning must include project setup, the approved class email roster, privileged account provisioning, public-sign-up restrictions, presenter-account setup, client ownership/access policies, database migration/functions, Realtime configuration, custom SMTP/OTP templates, and browser-safe environment configuration. Verify school Gmail SMTP eligibility; if blocked, use the selected Resend fallback once the presenter-controlled domain is available. The user enters credentials directly. Do not send invitations or test messages to other classmates without explicit instruction. Account setup needs the user and parent agent; delegate implementation/testing against the isolated test environment. Do not claim email delivery or cloud synchronization is working until tested against the configured project.

Test configuration must explicitly select hosted or local mode and supply its own API URL, public key, privileged key, and `VITALLY_TEST_DATABASE_URL` for a direct PostgreSQL connection, used by the exact-pinned `pg` tool for migrations/transactions/catalog ACL checks; there is no fallback to classroom/application variables. In hosted mode, require nonempty VITALLY_TEST_PROJECT_REF and VITALLY_CLASSROOM_PROJECT_REF and reject equality or a missing classroom reference. Validate the exact approved test project reference/API origin and the approved direct or pooler PostgreSQL endpoint, port, database, and project-associated user against the test configuration; reject any classroom identity or inconsistent API/database pair. In local mode, require explicit approval of the isolated instance, a literal loopback API host and PostgreSQL host (`127.0.0.1` or `::1`) with the exact manifest ports/database/user and verified run-owned CLI/Docker instance identity, and reject remote endpoints or silent hosted fallback. Connection secrets are entered locally and are not printed. Execute these guards before migrations, initializer calls, privileged fixture creation, Auth provisioning, browser configuration, or cleanup; track run-owned IDs and restrict cleanup to that manifest. A local mode declaration does not waive endpoint checking.

Classroom tools load ignored `.env.admin` with `VITALLY_ADMIN_SUPABASE_URL`, `VITALLY_ADMIN_AUTH_KEY`, `VITALLY_ADMIN_DATABASE_URL`, `VITALLY_CLASSROOM_PROJECT_REF`, and separately operator-confirmed `VITALLY_ADMIN_CONFIRMED_PROJECT_REF`. A distinct classroom guard requires matching nonempty refs and an independently approved API/SQL target manifest; it rejects the configured hosted/local test identity/endpoints, loopback classroom targets, missing confirmation, and mismatched projects before privileged calls. Test configuration cannot substitute for admin configuration. Use the confirmed Session pooler endpoint for hosted migrations and serializable initialization on IPv4-only networks, on one checked-out `pg` connection; reject transaction pooling. Direct IPv6 PostgreSQL is an explicitly validated alternative, and isolated local tests retain their direct loopback connection. See [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

The Task 9 local stack must include Realtime; the early Auth probe excluded it and proves nothing about subscriptions. Task 5A must test repeated generateLink for the same user inside the configured interval. Independent tests can use new users, but sign-out/return retains the original user and waits the configured interval plus margin if generation is limited. The probe report does not establish repeat-generation behavior.

Privileged classroom provisioning and test setup use the same workspace initializer after required schema/people support exists, with Sam configured only after his permanent person row is available. Keep the minimal two-engine generated-OTP trial early in delivery, before the full workflow/browser story. The [early isolated Auth probe](../reviews/2026-09-15-vitally-auth-probe.md) records actual versions/outcomes and remaining gaps; repeat its tests against the eventual application and selected target. Additional Auth diagnostic probes remain implementation evidence, including any unobserved rate-limited/provider/transport outcomes; the applicant UI contract stays identical regardless of those observed codes.

The intended demo fits Supabase's Free tier based on expected classroom use and simulated documents; this is a planning estimate, not a usage guarantee. Custom SMTP sender availability must be confirmed independently. Before presentation, verify project availability and email delivery. Current limits are documented in [Supabase pricing](https://supabase.com/pricing) and [SMTP configuration](https://supabase.com/docs/guides/auth/auth-smtp).

Node v24.21.0 is installed and was verified executable. The task's default shell still resolves Node v18.20.8; use v24.21.0 explicitly. For npm and child-tool commands, prepend its bin directory to PATH for that command only, ensuring lifecycle scripts use the same Node. Use `--env-file-if-exists=.env.local` for application launch so missing config can show the setup screen. Tests independently require their isolated configuration. Do not change global configuration.

Sequence after written-spec approval: prepare an implementation plan; establish shared persistence and identity boundaries; extend the case workflow; add staff/client views; configure the demo project; verify both browsers and rehearse the story. The exact task breakdown belongs in that later plan.

The original project mirror is not a Git repository. After Task 1, the user identified `/Users/jinyuyang/VITA-Management-System-Demo` as the existing implementation repository and authorized committing the reviewed code and documents on its `codex/m1-demo` branch. Continue version-controlled implementation there; do not initialize Git in the mirror.

## 12. Provisional assumptions for later stakeholder validation

- Manual TaxSlayer milestone entry remains the default until the group confirms a different process.
- Client follow-up after approval is recorded as an outcome, without storing bank details or implementing signing/filing.
- Case requirements and volunteer eligibility use preconfigured fictional fixtures.
- The demo represents one site and one tax season. Partner-site administration remains deferred.
- Contact preferences and language needs inform admin follow-up; calls themselves occur outside ViTally.
- Group/class admission uses exact approved email addresses; domain-wide or public sign-up is deferred. Roster administration uses privileged setup rather than a new admin-management screen.
- Email is the real authentication route for this increment. Phone access remains a future service design; no SMS delivery is implied.

These assumptions do not block the defined prototype. A change to them requires a focused design update before expanding implementation scope.
