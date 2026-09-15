# PCDC Local Demo Implementation Plan

> **For agentic workers:** Use Superpowers execution and test-first verification, task by task.

**Goal:** Deliver the agreed two-minute interactive prototype in the user's local repository.

**Architecture:** A static browser app has one persistent fictional case and a pure transition function. Client and volunteer renderers consume the same case; presenter controls simulate external steps. A dependency-free Node server serves only application assets.

**Tech Stack:** HTML, CSS, ES modules, Node test runner; Playwright for browser validation.

**Spec:** ../specs/2026-09-14-vita-figma-demo-design.md

## Global constraints

Fictional data only. No actual messaging, identity verification, signatures, uploads, or tax filing. One 2025 case, ID DEMO-7K4P-92. Retain drafts and shared state. Uber/Lyft alone passes this rule; other self-employment or more than 10 stock transactions blocks normal submission. Unknown answers request office assistance. Uploaded response stays on hold awaiting verification. Demo role switching is visibly distinct from product access.

## Task 1: Shared case and persistence

Files: src/domain.mjs, tests/domain.test.mjs, package.json.

- [x] Write failing behavioral tests for screening, duplicate submission, explicit intake check and claim, requests, and response receipt.
- [x] Run `node --test tests/domain.test.mjs`; confirm missing functionality fails.
- [x] Implement `newCase()`, `screening(answers)`, `updateCase(state, event)`, `restoreCase(serialized)`.
- [x] Run tests and ensure forbidden transitions leave input unchanged or throw readable errors.

Interface: `updateCase(case, {type, ...payload})` returns an independent case; events are CREATE, ANSWERS, SUBMIT, VERIFY_INTAKE, CLAIM, REQUEST, RESPOND. Status values are draft, received, queued, preparing, held, responded. `screening` returns continue, unsupported, assistance, or incomplete.

## Task 2: Client and volunteer views

Files: index.html, src/app.mjs, src/views.mjs, src/ui.mjs, src/styles.css; tests/browser.mjs.

- [x] Add browser assertions for access, form validation, save/retrieve, full handoff, mixed-income exception, and reset before implementing views.
- [x] Implement event-delegated rendering with escaped client text and persistent shared case.
- [x] Access routes: home, access, id, intake, progress, volunteer. Intake sections: visit, screening, details, review.
- [x] Add clearly labeled presenter controls, sample-file selection/submit, retryable failure, help, print preview, and copy fallback.
- [x] Run browser flows at desktop and mobile sizes; inspect screenshots and console errors.

## Task 3: Local delivery

Files: server.mjs, README.md, .gitignore.

- [x] Implement a localhost static server with explicit served-path allowlist.
- [x] Document setup, demo code, two-minute route, persistence/reset, and prototype limits.
- [x] Run unit tests, browser verification, and fresh source syntax checks.
- [x] Copy reviewed app into the user-provided repository on a feature branch, preserving README content and LICENSE; run final tests there.

## Execution notes

User requested implementation in the named starter repository. Build staging stays in the writable task directory; final reviewed files will be copied to the requested folder with filesystem approval. No additional worktree is needed for this empty starter. Figma tools are unavailable in the current task, so local implementation uses the already approved Figma-oriented design. No hosted deployment or Figma-file creation is claimed.

## Verification evidence

- Eight case-workflow tests passed after initially failing against the unimplemented model.
- Full browser walkthrough passed at desktop and mobile sizes, with zero captured browser errors.
- Regression checks reproduced and then verified fixes for residence/mailing separation, refreshed retrieval mode, and exception-draft restoration.
- Static review findings were fixed and re-reviewed.
- Visual checks covered welcome, client action, volunteer response, and mobile welcome.
- Local server startup and requested-repository copy are verified at delivery.
