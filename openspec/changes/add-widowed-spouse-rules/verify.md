# Verification Report

**Change**: `add-widowed-spouse-rules`
**Verified at**: `2026-10-16`
**Verifier**: Claude (Opus 5.5), the controller of the subagent-driven apply. The `openspec-verify-change` skill isn't installed, so the checks below were run directly (CLAUDE.md, lifecycle step 6).

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] Every item is `"valid": true`.

**Result:**

```text
change/add-widowed-spouse-rules    valid
spec/client-intake                 valid
spec/draft-13614c                  valid
spec/staff-case-work               valid
totals: 4 items, 4 passed, 0 failed
```

The INFO notes about long requirement texts in `client-intake` and `staff-case-work` predate this change and are not failures.

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [x] Every `- [ ]` is now `- [x]`: 13 of 13, with 0 open (committed in af2742e).

| Task | Why unfinished | Blocks archive? |
|---|---|---|
| — | — | — |

---

## 3. Delta Spec Sync State

| Capability | Sync state | Notes |
|---|---|---|
| `client-intake` | ✗ Needs sync | Two MODIFIED requirements ("An unmarried client isn't asked about a spouse" and "An unmarried client answers the 'who' questions with Yes or No", now following rule J) and two ADDED ("A recently widowed client gives their late spouse's details", "The year of a spouse's death is checked"). Merged by `/opsx:archive`. Its Purpose gains a recently widowed client's late spouse (design D8). |
| `draft-13614c` | ✗ Needs sync | One MODIFIED requirement (the not-sure lines follow rule J) and one ADDED ("The draft's spouse lines appear only when a joint return is possible"). Merged by `/opsx:archive`. |

---

## 4. Design / Specs Coherence Spot Check

| Sample | Design | Spec | Gap |
|---|---|---|---|
| The two rules | D2: `spouse_on_return` (married, or a death from 2023 to 2025) and `joint_possible` (married, or a 2025 death), defined once in the builder | client-intake "A recently widowed client gives their late spouse's details" (2024, 2025 and 2015 scenarios) | None |
| New show-if kinds | D1: `gte`, `lte` (a whole number without a leading zero) and `any`, the same in the browser and the database | "The browser and the server SHALL evaluate both rules identically…"; "The server agrees" scenario | None, after the final-review fix (below) |
| The year range | D3: `Year 1900–2025`, message "Enter a year from 1900 to 2025." | client-intake "The year of a spouse's death is checked" (2205 and boundary scenarios) | None |
| The who clean-up | D7, I10: a changed marital status, or a whole valid year as sent, while J is off | client-intake "who" requirement: "The year changes to an earlier death" and "Retyping the year keeps the spouse" | None |
| The rail redraw | D7, I11: a driver's `change` redraws when the page's listed sub-steps differ from the draft's | "The rail follows the year" scenario | None; the story is its only check |
| Cards and title | D5, D6: "Your late spouse", J for the spouse cards and owner line, the late bank hint, custody for anyone not married now | client-intake MODIFIED and ADDED requirements (bank hint and custody scenarios) | None |
| The draft 13614-C | D7: spouse name and date-of-birth lines only under J | draft-13614c "The draft's spouse lines appear only when a joint return is possible" | None |

**Drift warnings (non-blocking), each fixed before verify:**
- **A year with spaces (final review, Important).** `sendable` trims a year before checking and saving it, but the browser's rules read the raw draft. So "2024 " hid the late spouse's questions while the server, given "2024", required them. That broke the spec's "evaluate both rules identically" for the answers missing before submission. Fixed in 48ffc71: the browser's `gte`/`lte` and the who clean-up read the year as sent. design.md D1 and D7 now say so.
- **Fill on a recently widowed client (final review, Important).** The married sample's hidden `sp_phone` reached `case_contacts` and the staff contact card, and Regenerate turned a widow married. Fixed in 48ffc71 with `sampleAnswersFor`; design.md D7 now describes it. This reverses the Task 4 ruling, whose premise ("hidden answers never surface") was false for the phone.
- **The deploy-order rationale (final review, Minor).** design.md's Migration Plan said the browser sends the new show-ifs; it doesn't, the server reads its own catalogue. Steps 4 and 5 now give the real risky order (a new database with the old front end) and the rollback order (the catalogue reload before restoring 011's `intake_holds`).

---

## 5. Implementation Signal

- [x] Nothing unstaged in the worktree. Only the local `node_modules` link is untracked; the `.env.test` link is ignored.
- [ ] All related commits pushed: not yet. They are pushed at lifecycle step 9, after archive.

**Commit range**: `4842962..af2742e`, 10 commits after the planning commit. Branch `add-widowed-spouse-rules`, base `main` d16f2bf.

**Checks run** (CLAUDE.md, Verification):

| Check | Result | Why |
|---|---|---|
| `npm test` | 969/969 (943 on `main`, plus 26 new: 22 planned and 4 from the final fix wave) | Always |
| `npm run build:hant -- --check` | clean | Catalogue and card Chinese changed (已故配偶, the late bank hint, the year-range message) |
| `npm run build:intake` | leaves nothing to commit | CI; the catalogue changed and `028_intake_catalogue_40593b97.sql` is committed |
| `npx openspec validate --all` | 4/4 valid | CI |
| `npm run db:migrate:test` | 027 and 028 applied to `vitally-task2` after the user's OK. Dry runs in `begin … rollback` first: 027 alone (four functions compile and are security definer), then 027 + 028 (116 fields; 2025 shows the job title, 2024 doesn't; 2205 and "02025" switch nothing on) | A hand-written migration and a catalogue migration |
| `npm run test:database` | 253/253 after the tasks, and 253/253 after the final fix wave | Migrations 027–028: the browser/database parity for `gte`/`lte`/`any`, the loader's refusals, the spouse questions' visibility and missing answers, the year range |
| `npm run test:browser` | 49/53 on the first run: a later story step expected the spouse part "never opened", stale because the new walk opens it, fixed in ca7e7fc. Then 57/57 (837 s), and 57/57 after the final fix wave (807 s) | The form, rail, cards, draft and `app.mjs` changed; the story is the only check of the rail redraw |
| `npm run test:auth-browser` | not run | No sign-in change |

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

- [x] Only historical files predating the schema.

The 8 files under `docs/superpowers/specs/` are the historical design documents of parts 1–4d. This change wrote nothing under `docs/superpowers/`.

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` deferred rows, so this section passes empty.

---

## Overall Decision

- [ ] ✅ PASS
- [x] ⚠️ PASS WITH WARNINGS: the three drifts in §4, each fixed before verify (two in code with tests, one in design.md).
- [ ] ❌ FAIL

**Next step:** write `retrospective.md` (lifecycle step 7), then merge `main` and run `/opsx:archive` (step 8).
