# VITA Site Management System

**Project name:** ViTally
**Course:** CSE 416 — Software Engineering Project
**Partner:** PCDC (Philadelphia Chinatown Development Corporation)
**Term:** Fall 2026
**Team:** Cody Chi · Hailey Zheng · Jinyu Yang · Kelvin Chiu · Manqi Lu

---

## 1. Overview

The VITA Site Management System (project name: ViTally) is a bilingual (English/Chinese) web application designed to digitize and streamline case management for a Volunteer Income Tax Assistance (VITA) site operated by PCDC. The system replaces a largely paper- and phone-based process with an online workflow that carries a tax return case from client intake through preparation, quality review, and completion, while giving clients, volunteers, and administrators role-appropriate visibility into each case's status.

This document consolidates the team's planning notes, requirements discussions, pre-survey findings, and design drafts produced during the first weeks of the project into a single specification to guide implementation and to serve as the Milestone 1 project proposal.

## 2. Background: The IRS VITA Program & PCDC

### 2.1 What is VITA?

VITA stands for Volunteer Income Tax Assistance — a community-based program supported by the IRS that trains volunteers to provide free tax preparation services to eligible taxpayers (low-to-moderate-income taxpayers, individuals with disabilities, and people with limited English proficiency). The IRS provides limited grants to help run a VITA site, awarded based on each site's report and proposal — which is part of why better data and reporting matter to PCDC directly.

As a VITA volunteer, typical responsibilities include:

- Reviewing tax documents such as W-2s, 1099s, and similar forms.

- Entering income, deductions, and tax credits into tax preparation software.

- Checking taxpayer information for accuracy.

VITA generally handles relatively straightforward individual tax returns; more complex tax situations fall outside the program's scope.

### 2.2 What is PCDC?

PCDC (Philadelphia Chinatown Development Corporation) is a Philadelphia-based nonprofit that has run a free VITA tax preparation program for its community for over 10 years. PCDC's VITA site is the real-world site the team is using as its case study, and the source of the problem research, pre-survey findings, and workflow details throughout this document.

## 3. Problem Statement & Motivation

### 3.1 Who this is for, and what hurts today

This project is for VITA volunteers, PCDC site administrators, and the taxpayers (clients) they serve. Today, the process relies on repeated paperwork and gives volunteers and administrators limited visibility into each client's progress through the pipeline.

### 3.2 Current Site Service Models

PCDC currently accepts and processes cases through three separate channels:

| **Channel** | **How it works**                                                                                                              |
|-------------|-------------------------------------------------------------------------------------------------------------------------------|
| Same Day    | Full on-site process with same-day service, held on 4–5 weekends per season.                                                  |
| Drop-off    | The client drops documents off in person on weekdays; volunteers work remotely; admin staff coordinate the handoff.           |
| Online      | Fully remote: online submission → remote preparation → identity verification over Zoom → completed return delivered by email. |

### 3.3 Quantified Pain Points

- **Volunteer–client imbalance —** roughly 20 active volunteers serve 700+ requests each season, with inconsistent availability and varying certification levels. This raises a core question the system needs to help answer: how do we assign cases efficiently?

- **Limited, tightly stretched grant funding —** IRS grant funding works out to less than \$10 per case when divided evenly, without accounting for operating costs or case complexity.

- **No data-driven case management —** the site has no dedicated data role, which limits its ability to report impact and secure future grants.

### 3.4 Current Bottlenecks

- The process typically begins with taxpayers bringing in physical documents; volunteers must manually review and enter that information, and a second certified volunteer must review the return before submission.

- No centralized case tracking across the three service channels (status, documents, turnaround time), and no unified volunteer-matching system by availability, certification level, or language.

- Service capacity depends heavily on the number and certification level of available volunteers, and the workflow remains labor-intensive and dependent on volunteer availability.

- Manual, ad hoc communication (phone calls, emails) adds administrative workload, delays, and errors — and gives taxpayers little visibility into the status of their return before it is submitted to the IRS (see the direct quotes in Section 4). They often do not know whether documents have been reviewed, whether a volunteer is actively preparing the return, whether something is missing, or whether the return is waiting for quality review, which drives repeated phone/email contact with volunteers.

- No consolidated data across channels limits visibility into demand, volunteer utilization, and bottlenecks — and, combined with the lack of a dedicated data role, limits the site's ability to report impact for future grant applications.

- Manual document intake, data entry, and limited virtual-service capacity all represent clear opportunities for improved efficiency through automation and digital document processing.

### 3.5 Why This Requires a Semester Project

This is not a weekend script — it requires several interconnected workflows (intake, assignment, preparation, quality review, and filing) tied together for every tax return submitted, shared data across roles, real user accounts, sensitive document handling, bilingual support, and audit logging.

## 4. Voice of the User: Pre-Survey Findings

Before drafting requirements, the team ran an informal pre-survey to gather concerns directly from people who use the current PCDC VITA process — clients, volunteers, and site administration. A full structured questionnaire was deferred due to time constraints, but the responses below already surface concrete, recurring pain points that directly inform the feature list in Section 8.

### 4.1 Clients

**Ms. Xu** *(Case #619, TY2022–2025)*

*“The office hotline is never reachable. Every time, I have to physically go to the office just to check my case status or find out what documents are missing, and it's hard for me to walk.”*

**Mr. Li** *(Case #344, TY2024–2025)*

*“Everything is communicated by phone. Sometimes I don't understand, and sometimes I forget what documents I still need to bring by the time I get home. I wish they could text me instead — but even when they say they'll text, it often never comes, and I have to call again to follow up.”*

**Ms. Liu** *(Case #512, TY2025)*

*“My case was actually simple, but while I was waiting on-site, I noticed Case #526 got finished before mine. I don't know why, and I don't know how much longer I'll have to wait. When I asked, I was just told to wait a bit more.”*

### 4.2 Volunteers

**Liu Fen** *(TY2024 & TY2025 Volunteer)*

*“My schedule has always been flexible, but I happened to miss the workflow training session. Because of that, I didn't really understand the workflow for a long time — it took a while before I gradually figured it out. The admin team also didn't realize I was actually flexible until much later, so cases weren't assigned to me early on. I wish there was a more intuitive way to see what cases are available for me to take.”*

**Roger** *(Volunteer, 20+ years with VITA; CPA / retired accountant)*

*“Sometimes I see a lot of simple cases sitting there with no one working on them, so I just pick them up myself. Meanwhile, complex cases end up going to newer volunteers instead, who then keep coming to me with questions. Honestly, it would probably be more efficient if the complex cases were just assigned directly to me.”*

### 4.3 Site Administration

**Eunice** *(Site Coordinator, 2022–2023)*

*“When we're at work trying to reach clients, they're usually at work too, so phone calls often don't go through. On top of that, clients tend not to trust voicemails or text messages from an unfamiliar number. Also, a lot of our clients don't know how to use Zoom, and many have mobility issues, which makes identity verification really difficult for them.”*

*Together, these accounts point at the same handful of gaps the system needs to close: real-time, self-serve status visibility for clients; a case-claiming experience that matches work to volunteer availability and skill level instead of first-come-first-served; and communication that does not depend entirely on synchronous phone calls.*

## 5. Goals & Purpose of the Website

The website gives taxpayers a single place to upload and manage documents, track the real-time status of their return, see what actions they still need to take and what information is missing, and receive status notifications — while also helping VITA volunteers manage their caseload more efficiently.

Primary goals:

- Reduce repeated manual paperwork for volunteers and staff.

- Give every role real-time visibility into case status.

- Streamline the tax filing workflow to reduce manual work and errors, using a secure, scalable database to store and manage client information.

- Support both English- and Chinese-speaking clients throughout the experience.

## 6. Users & Roles

The system supports three roles, each with a distinct set of permissions:

| **Role**  | **Description**                                             | **Key Permissions**                                                                                                             |
|-----------|-------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
| Client    | The taxpayer submitting documents for return preparation.   | Submit an intake application; upload documents; check case status; print, correct, or withdraw an application.                  |
| Volunteer | A certified VITA volunteer who prepares or reviews returns. | Claim cases; communicate with clients; check the status of claimed cases; prepare and/or review returns.                        |
| Admin     | Site coordinator(s) overseeing the VITA site.               | Reassign case preparers; view the status of all cases; generate reports; issue alerts; post reference materials for volunteers. |

*Visibility follows role: a client can only see their own case; a volunteer can see the cases they are preparing or reviewing; the admin team can see all cases.*

*Note: splitting the team strictly into “client / volunteer / admin” views is a reasonable v1 starting point, but role definitions (e.g., additional volunteer sub-roles) are expected to evolve as requirements are refined.*

## 7. Scope

### 7.1 In Scope — v1 / MVP

- Three roles with distinct permissions: client, volunteer, admin.

- Bilingual (English and Chinese) intake form, potentially including document upload.

- Auto-generation of IRS Form 13614-C (Intake/Interview & Quality Review Sheet) and Form 14446 (Virtual VITA/TCE Taxpayer Consent).

- A secure, structured database for client, case, and volunteer data.

- Standard web application security practices for handling sensitive personal and tax documents.

- Conversion of the on-site process into an online, trackable status pipeline, modeled as the case status state machine defined in Section 8.2.

### 7.2 Out of Scope — v1

- Facial recognition for identity verification.

- Direct in-app communication with accountants (Slack is used as an interim channel).

- A full alert system (e.g., automated site-closure notifications).

- Appointment scheduling (possible for a later version).

- Integration or cooperation with organizations other than PCDC.

### 7.3 Future / Non-MVP Candidates

- In-app communication with accountants.

- Alert system (items to bring, site closed/open status, etc.).

- AI-assisted customer support.

- Refinements to the case state machine as real workflow data is collected.

## 8. Functional Requirements

### 8.1 Account Creation & Authentication

**Volunteers / Admins**

1.  Upload a signed volunteer agreement and a government-issued ID.

2.  Provide name, email address, mailing address, zip code, and choose a username and password.

3.  Select a role: IRS SPEC, Territory Manager, SPEC OPI Volunteer, Site Coordinator, VITA Volunteer, or Volunteer Instructor.

4.  Verify the provided email address before the account becomes active.

**Clients**

5.  Start an application via an intake form — no authentication required to begin.

6.  On submission, an application ID is generated and an account is auto-created with a temporary username and password.

7.  The client logs in with the temporary credentials, is required to change their password, and is then routed to the client portal.

8.  A returning client can retrieve an existing application from the welcome page.

### 8.2 Case Status State Machine

The diagram below is the team's working state machine for a case, from intake through e-filing. It replaces the earlier draft state list with the actual states and transitions the team has designed, including the missing-documents hold loop, the client-unreachable loop at signature time, and both terminal states (filed, and cancelled/out-of-scope).

![Case status state machine](media/case-state-machine.png)

*Figure 1. Case status state machine.*

**States**

- Intake — client has checked in; documents are taken and scanned.

- PendingPrepare — intake form submitted (auto-generates Form 13614-C / 14446); case is verified and waiting in the preparer queue.

- InPrepare — a preparer has scanned the folder to claim the case and is actively working on it.

- PendingReview — preparation is complete; the case is waiting in the reviewer queue.

- InReview — a reviewer has scanned the folder to claim the case for quality review.

- Pending — on hold because documents are missing; returns to PendingPrepare once the client's documents are complete.

- ReadyToExit — quality review passed; the case is ready to exit, pending the client's signature.

- NeedSign — awaiting the client's signature before e-filing.

- CantFindClient — the client could not be reached to obtain a signature; returns to NeedSign once the client calls in or returns.

- Efiled — terminal state: the return has been signed and electronically filed.

- Cancelled — terminal state: the case was out of scope for VITA, or the client withdrew at intake.

**Key Transitions**

| **From**       | **Trigger**                             | **To**         |
|----------------|-----------------------------------------|----------------|
| (start)        | Check in · take folder · scan           | Intake         |
| Intake         | Submit form (generates 13614-C / 14446) | PendingPrepare |
| Intake         | Out of scope, or client withdraws       | Cancelled      |
| PendingPrepare | Preparer scans to claim                 | InPrepare      |
| InPrepare      | Preparation complete                    | PendingReview  |
| InPrepare      | Missing documents                       | Pending        |
| PendingReview  | Reviewer scans to claim                 | InReview       |
| InReview       | Review passed                           | ReadyToExit    |
| InReview       | Missing documents                       | Pending        |
| Pending        | Documents complete — returns to pool    | PendingPrepare |
| ReadyToExit    | Awaiting client signature               | NeedSign       |
| NeedSign       | Client signs — e-file                   | Efiled (end)   |
| NeedSign       | Client not found                        | CantFindClient |
| CantFindClient | Client returns / calls in               | NeedSign       |

*Every transition should be attributable to a specific staff member (intaker, preparer, reviewer, or admin) and timestamped to support the case-history / audit-trail view described in Section 8.4.*

### 8.3 Client Portal

The client portal is the client's home view of their own case and should surface:

- Current stage of the case (e.g., waiting, verified, hold for missing documents) and, while queued, their queue position.

- Pending actions the client must take.

- Preparer contact information once a volunteer has claimed the case for preparation.

- Reviewer contact information once the case moves into quality review.

- Notifications about status changes.

- Access to the completed tax return once filing is finished.

- Actions: print the application, make corrections, or withdraw the application.

- Ability to request an appointment (future), ask questions, and view site contact information.

### 8.4 Volunteer Portal

- A worklist of cases, sortable by role (preparer or reviewer) and other criteria.

- For each case: who is preparing/reviewing it and their contact information.

- A case detail view showing intake form responses, uploaded documentation, and (future) an AI-generated summary.

- A case status / history tab showing key timestamps (intake completed, preparation started, client contacted, documents uploaded) and every staff member who has touched the case.

- The service method for the case: drop-off, same-day, or online.

- A volunteer profile page: preferred name, certifications earned, and contact information.

- (Future) direct messaging between volunteers and clients or other volunteers.

### 8.5 Admin Dashboard

- Site-wide view of volunteer workload.

- List of clients currently on hold.

- Case counts broken down by pipeline stage.

- Ability to reassign the preparer/reviewer on a case.

- Report generation.

- Ability to post reference materials for volunteers.

- Ability to issue alerts (future, see Section 7.3).

### 8.6 Automated Form Generation

Based on a client's intake responses, the system should auto-generate a completed draft of IRS Form 13614-C (Intake/Interview & Quality Review Sheet) and Form 14446 (Virtual VITA/TCE Taxpayer Consent), reducing duplicate manual data entry by volunteers.

## 9. Non-Functional Requirements

- **Bilingual support —** the intake form, portals, and notifications are available in both English and Chinese.

- **Security —** the system handles sensitive personal and tax documents and must follow standard web application security practices (authentication, authorization by role, encrypted storage/transport of documents).

- **Data integrity & scalability —** a relational database stores client, case, and volunteer data reliably as the site's caseload grows season over season.

- **Auditability —** every status change and every staff interaction with a case is logged, tied to a specific user and timestamp.

- **Accessibility —** the VITA program serves individuals with disabilities and limited English proficiency, so the interface should follow basic accessibility practices in addition to bilingual support.

## 10. Team & Responsibilities

| **Name**     | **Sub-team** | **Responsibilities**                        |
|--------------|--------------|---------------------------------------------|
| Hailey Zheng | Frontend     | UI development; intake question design      |
| Jinyu Yang   | Frontend     | UI development                              |
| Manqi Lu     | Frontend     | UI development; English–Chinese translation |
| Cody Chi     | Backend      | Server development                          |
| Kelvin Chiu  | Backend      | Database design                             |

*A strict frontend/backend split is not the ideal long-term structure for the team, but it is a workable starting point for v1 and is expected to change as concrete feature ownership emerges.*

## 11. Progress to Date & Next Steps

### 11.1 Completed (as of 9/9)

- Understood the current on-site workflow and service model.

- Created the GitHub repository.

- Ran a pre-survey to gather concerns from previous clients, admins, and volunteers (see Section 4); a full questionnaire was deferred due to time constraints.

- Drafted the case status state machine (Section 8.2).

- Met with the PCDC site manager to discuss promotion, testing, and requirements/expectations.

- Evaluating options for a shared coding-collaboration tool subscription.

### 11.2 Next Steps

- Design the database schema / class diagram.

- Build a light functional demo.

- Prepare the Milestone 1 topic presentation.

### 11.3 Milestone Roadmap

| **Milestone** | **Focus**                                                                                        |
|---------------|--------------------------------------------------------------------------------------------------|
| Milestone 1   | Project proposal: problem, users, scope, team roles, and evidence of planning and collaboration. |
| Milestone 2   | To be defined as the team progresses.                                                            |
| Milestone 3   | To be defined as the team progresses.                                                            |
| Milestone 4   | To be defined as the team progresses.                                                            |
| Milestone 5   | To be defined as the team progresses.                                                            |
| Milestone 6   | To be defined as the team progresses.                                                            |

## 12. Team Collaboration & Meeting Cadence

The team splits into a frontend group (bilingual UI first, since the client base is bilingual) and a backend group, coordinating through shared documents and regular meetings.

| # | Date | Time | Attendance |
|---|---|---|---|
| 1 | 9/6 | 4:00–6:00 PM | Full team |
| 2 | 9/8 | 10:00 AM–12:00 PM | Frontend sub-team (Hailey, Manqi, Jinyu) |
| 3 | 9/14 | 7:00–8:30 PM | Full team |
| 4 | 9/15 | 5:00–6:30 PM | M1 speakers (Cody, Hailey) |
| 5 | 9/16 | 11:00 AM–2:00 PM | M1 speakers (Cody, Hailey, Jinyu) |

Meeting notes and decisions are tracked via Google Calendar invites, Zoom minutes, and shared Google Docs edit history.

## 13. Open Questions / Items to Resolve

The following items were raised during planning and remain undecided; they are tracked here so they are not lost.

**Intake**

- Should the intake form support document upload directly, or is that deferred to a later step?

- Is a "Voice / info icon" needed on intake questions for additional guidance?

- A client record is generated once the client submits the form, even when the client turns out to be out of scope (OOS). What happens to those records, and how are they surfaced to admins?

**Throughput during filing season**

- If the site is overwhelmed with workload during filing season, priority should be given to e-filing cases rather than collecting completed documents. This implies a faster path into the system — creating a case record directly and bypassing the intake form. What does that path look like, who is allowed to use it, and how does such a case rejoin the normal state machine?

**Workflow details to specify**

- Email verification: at what point it is required, and what a client can do before it completes.

- Case claiming: how "who claimed this case" is recorded and displayed, and whether a claim can be released or reassigned.

**Features under consideration**

- Is an AI-generated case summary feasible for the volunteer portal, or is it a stretch goal?

- Is appointment scheduling in or out of v1?

## 14. Appendix: Alignment with Milestone 1 Expectations

The table below maps the questions the course uses to evaluate an M1 proposal to where this document addresses them, as a self-check before submission.

| **M1 Expectation**                                                                   | **Where This Document Addresses It**                                                                                                                                                                                       |
|--------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Is there a proposal?                                                                 | This entire document, serving as the team's Milestone 1 proposal.                                                                                                                                                          |
| Is the proposal carefully generated — many edge cases considered?                    | Section 8.2 (case status state machine, including the missing-documents hold loop, the client-unreachable loop, and both terminal states) and Section 3 (quantified pain points, current service models, and bottlenecks). |
| Are there efforts spent studying users' needs?                                       | Section 4 (Voice of the User: direct pre-survey quotes from clients, volunteers, and site administration) and Section 3.3 (quantified pain points from the current site).                                                  |
| Are the team working together, as an organized group with every member contributing? | Section 10 (Team & Responsibilities) and Section 12 (meeting cadence, with dates, attendance, and a documented meeting trail).                                                                                             |
| Has the work actually been done?                                                     | Section 11.1 (Progress to Date) lists concrete completed artifacts: repo, pre-survey, state machine, PCDC site-manager meeting.                                                                                            |
| Do the team own the work, or does AI do it?                                          | The underlying research (interviews, meeting notes, service-model details, state machine design) is the team's own; this document was assembled and formatted with AI assistance from that original material.              |
