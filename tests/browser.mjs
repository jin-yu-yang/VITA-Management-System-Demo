import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  createBrowserFixture,
  loginTestUser,
  requestCode,
  submitVerificationCode,
} from "./support/browser-fixture.mjs";
import { applyArgs } from "./support/database-fixture.mjs";
import {
  ARRIVAL_MS,
  CLICK_MS,
  DESKTOP,
  MOBILE_WIDTH,
  OFFICE_BOARD_HEADING,
  REFUSAL_LINES,
  REFUSAL_NOTICE,
  RENDER_MS,
  HAS_BADGE,
  HAS_DETAIL,
  HAS_TEXT,
  WORK_BOARD_HEADING,
  alertText,
  assertConsoleQuiet,
  capture,
  caseActionCount,
  choosePersona,
  clickAction,
  clickCaseActionUntil,
  measureOverflow,
  openBoard,
  openCaseByReference,
  pageText,
  pressUntil,
  pressUntilEffect,
  readAlerts,
  readBoardTotals,
  readClientPlace,
  readFixtureIndicator,
  readPersona,
  redactAddresses,
  resetSampleCases,
  screenshotDir,
  submitCaseFormUntil,
  tickBox,
  waitFor,
  waitForBadge,
  waitForCaseWorkspace,
  waitForDetail,
  waitForQuiet,
  waitForText,
  waitForTextGone,
  watchAlerts,
} from "./support/story-pages.mjs";
import { REFERENCE_PATTERN, SQLSTATE_ERROR_CODES } from "../src/contracts.mjs";
import { SAMPLE_DOCUMENT_FILENAME } from "../src/case-actions.mjs";

// Task 10A: the demonstration story (spec §9) driven through two real engines,
// twice with the roles swapped, against the isolated local stack — plus the
// regression list, the window-isolation checks and repeatable evidence.
//
// What is real here and what is not:
//
//   * **Real:** every click, every form, every workflow action, the database
//     that answers them, the Realtime notifications that carry them to the
//     other window, and the one-time-code *verification* each sign-in performs.
//   * **Simulated:** the code *send* only (`/auth/v1/otp` is intercepted by the
//     Task 5A fixture so automation never asks a mail server for anything), and
//     the demo's own simulated intake checks, document upload and time jumps,
//     which the application labels as simulated on screen.
//
// Two denials cannot be expressed by any screen — an applicant sending a staff
// `personId`, and an applicant asking for another applicant's case by id or
// reference. Those are exercised from this process with the applicant's own
// authenticated client and asserted as FORBIDDEN/NOT_FOUND (Ruling R62).
// Everything else runs through the pages.
//
// Nothing here logs an address, a code or a token, and no screenshot is taken
// of a screen that carries one.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SHOTS = screenshotDir(ROOT);

// Enough for a database fixture, two engines, eight windows and the whole
// story with its regressions. A run that reaches this has stopped, not slowed.
const PERMUTATION_TIMEOUT_MS = 600_000;

// The fictional text this story types. Every sentence is invented, names a
// fictional person or a simulated step, and carries no address or contact
// detail of any kind.
const REQUEST_TITLE = "Mileage record";
const REQUEST_MESSAGE = "Please add the fictional sample mileage record.";
const ESCALATION_REASON =
  "The fictional client has not sent the sample yet; the office can ask about it.";
const CONTACT_NOTE = "Simulated call: the fictional client will send the sample.";
const RESOLUTION_NOTE = "Simulated call ended; the office task is done.";
// Internal staff text. It must never appear in a client window.
const FINDINGS = "Internal only: recheck the simulated mileage total before approval.";
const CORRECTION_NOTE = "Recorded the corrected simulated total in TaxSlayer.";
const REVIEW_CONTACT_NOTE = "Told the fictional client the review is complete.";
const OFFLINE_CITY = "Riverbend";
const MINE_CITY = "Keepmine City";
const OTHER_CITY = "Otherwindow City";

// Words a client screen must never carry: this demo records a workflow, and
// there is no amount, refund, bank or routing field anywhere in it.
const MONEY_WORDS = Object.freeze(["$", "refund", "routing", "deposit", "direct debit"]);

// What counts as the keyboard being somewhere a person can use it.
const CONTROLS = Object.freeze(["BUTTON", "INPUT", "TEXTAREA", "SELECT", "A"]);

// The screening answer that takes an application outside what PCDC prepares,
// and the sentence the form answers it with (`src/client-views.mjs`).
const OUT_OF_SCOPE_NOTICE = "Outside PCDC’s current service scope";
const RETURN_CITY = "Comebackton";

// ---------------------------------------------------------------------------
// Server-side reads — the receipts and rows a screen cannot show
// ---------------------------------------------------------------------------

const one = async (fixture, text, values) =>
  (await fixture.database.sql(text, values)).rows[0] ?? null;

const caseById = (fixture, id) =>
  one(
    fixture,
    "select id,reference,stage,revision,preparer_id,reviewer_id,owner_user_id,fixture,answers,intake_verified from public.cases where id=$1",
    [id],
  );

const caseByReference = (fixture, reference) =>
  one(
    fixture,
    "select id,reference,stage,revision,preparer_id,reviewer_id,owner_user_id,fixture,answers from public.cases where workspace_id=$1 and reference=$2",
    [fixture.database.workspaceId, reference],
  );

const workspaceCaseCount = async (fixture) =>
  Number(
    (
      await one(
        fixture,
        "select count(*)::int as count from public.cases where workspace_id=$1",
        [fixture.database.workspaceId],
      )
    ).count,
  );

const fixtureCases = async (fixture) =>
  (
    await fixture.database.sql(
      "select id,fixture_key,reference,stage,owner_user_id from public.cases where workspace_id=$1 and fixture order by fixture_key",
      [fixture.database.workspaceId],
    )
  ).rows;

// Receipts are the server's own record that an action landed exactly once.
const receiptCount = async (fixture, caseId, operation) =>
  Number(
    (
      await one(
        fixture,
        "select count(*)::int as count from public.action_receipts where target_id=$1 and operation=$2",
        [caseId, operation],
      )
    ).count,
  );

const eventCount = async (fixture, caseId, action) =>
  Number(
    (
      await one(
        fixture,
        "select count(*)::int as count from public.case_events where case_id=$1 and action=$2",
        [caseId, action],
      )
    ).count,
  );

const participantCount = async (fixture, caseId) =>
  Number(
    (
      await one(
        fixture,
        "select count(*)::int as count from public.preparation_participants where case_id=$1",
        [caseId],
      )
    ).count,
  );

const receiptsForActionId = async (fixture, actionId) =>
  Number(
    (
      await one(
        fixture,
        "select count(*)::int as count from public.action_receipts where action_id=$1",
        [actionId],
      )
    ).count,
  );

/** The domain code one raised SQLSTATE means to the application. */
const domainCode = (error) =>
  SQLSTATE_ERROR_CODES[error?.code] ?? error?.code ?? "none";

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

/** A page in its own context, with its own console and page-error record. */
async function openWindow(engine, { viewport = DESKTOP } = {}) {
  return await engine.newPage({ viewport });
}

/** A second page inside an existing context: the same storage, another window. */
async function openTab(context, appOrigin) {
  const page = await context.newPage();
  const errors = [];
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.message ?? error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(appOrigin);
  return { page, errors, pageErrors };
}

/** The intake form's own submit: save what is dirty and move a step on. */
async function clickContinue(page) {
  await waitForQuiet(page);
  await page
    .getByRole("button", { name: "Continue", exact: true })
    .first()
    .click({ timeout: CLICK_MS });
}

/** Start one fictional application and read back the generated reference. */
async function startApplication(page) {
  await clickAction(page, "start-application");
  const card = page.locator(".reference-card strong");
  await card.waitFor({ state: "visible", timeout: ARRIVAL_MS });
  return (await card.innerText()).trim();
}

/** Fill every blank in one click and walk the four intake steps. */
async function fillIntakeToReview(page) {
  await clickAction(page, "continue-intake");
  await waitForText(page, "Your visit", RENDER_MS);
  await clickAction(page, "fill-fictional");
  for (let step = 0; step < 3; step += 1) {
    await clickContinue(page);
    await waitFor(
      page,
      `intake step ${step + 2} of 4`,
      (wanted) =>
        (document.querySelector(".page-intro .overline")?.textContent ?? "").includes(
          wanted,
        ),
      `STEP ${step + 2} OF 4`,
      ARRIVAL_MS,
    );
  }
}

// ---------------------------------------------------------------------------
// One permutation: client in one engine, staff in the other
// ---------------------------------------------------------------------------

async function runPermutation(t, roles) {
  const fixture = await createBrowserFixture();
  const evidence = {
    roles,
    timings: {},
    story: {},
    regressions: {},
    windowIsolation: {},
    retries: [],
    screenshots: [],
    overflow: {},
    consoleErrors: {},
  };
  const timed = async (name, body) => {
    const started = Date.now();
    try {
      return await body();
    } finally {
      evidence.timings[name] = Date.now() - started;
    }
  };
  const phase = async (name, body) => {
    let failure = null;
    await t.test(name, async () => {
      try {
        await timed(name, body);
      } catch (error) {
        failure = error;
        throw error;
      }
    });
    // A linear story must stop where it broke: the steps after a failure would
    // report the wreckage rather than the defect.
    if (failure) throw failure;
  };
  // Hoisted so the evidence can still be gathered from them when a phase throws.
  let client = null;
  let staff = null;
  let classCase = null;
  // What a workflow interaction is waited for, as one of three rendered facts.
  const expectation = (expect) =>
    expect.badge
      ? { ready: HAS_BADGE, arg: expect.badge, what: `a badge reading ${JSON.stringify(expect.badge)}` }
      : expect.detail
        ? {
            ready: HAS_DETAIL,
            arg: expect.detail,
            what: `${expect.detail.label} reading ${JSON.stringify(expect.detail.value)}`,
          }
        : { ready: HAS_TEXT, arg: expect.text, what: `the text ${JSON.stringify(expect.text)}` };

  // The revision of the case an interaction acts on, read before it is sent:
  // if it has not moved, nothing was applied and a repeat cannot duplicate
  // anything. This is the only thing that ever authorises a second press.
  const unmovedSince = async (caseId) => {
    const id = caseId ?? classCase.id;
    const revision = async () => Number((await caseById(fixture, id)).revision);
    const before = await revision();
    return async () => (await revision()) === before;
  };
  const record = (type, outcome) => {
    if (outcome.attempts > 1 || outcome.conflicts || outcome.lost)
      evidence.retries.push({ type, ...outcome });
    return outcome;
  };
  const act = async (page, type, expect, { caseId, attributes = "" } = {}) =>
    record(
      type,
      await clickCaseActionUntil(page, type, {
        ...expectation(expect),
        attributes,
        safeToRepeat: await unmovedSince(caseId),
      }),
    );
  const actForm = async (page, type, fields, expect, { caseId, attributes = "" } = {}) =>
    record(
      type,
      await submitCaseFormUntil(page, type, fields, {
        ...expectation(expect),
        attributes,
        safeToRepeat: await unmovedSince(caseId),
      }),
    );

  const tag = `${roles.client}-client-${roles.staff}-staff`;
  const shoot = async (page, name) => {
    const shot = await capture(page, SHOTS, `${tag}--${name}`);
    evidence.screenshots.push(...shot.files);
    evidence.overflow[name] = shot.overflow;
    assert.equal(
      shot.overflow.scrollWidth,
      shot.overflow.clientWidth,
      `${name}: the page scrolls sideways at ${MOBILE_WIDTH}px`,
    );
  };

  try {
    const clientEngine = await fixture.launch(roles.client);
    const staffEngine = await fixture.launch(roles.staff);
    evidence.engines = {
      client: `${roles.client} ${clientEngine.version}${clientEngine.revision ? ` (playwright build ${clientEngine.revision})` : ""}`,
      staff: `${roles.staff} ${staffEngine.version}${staffEngine.revision ? ` (playwright build ${staffEngine.revision})` : ""}`,
    };
    evidence.simulated =
      "the code send only; every verification and every workflow action is real";

    const applicantA = fixture.actor("applicantA");
    const applicantB = fixture.actor("applicantB");
    const presenter = fixture.actor("presenter");
    const { alex, morgan, sam } = fixture.database;

    const clientWin = await openWindow(clientEngine);
    const staffWin = await openWindow(staffEngine);
    client = clientWin.page;
    staff = staffWin.page;

    // Named here so later phases can read what the story produced.
    let classReference = null;
    let samples = [];

    await phase("both windows sign in with a generated code and real verification", async () => {
      await loginTestUser({ page: client, actor: applicantA, fixture });
      await loginTestUser({
        page: staff,
        actor: presenter,
        fixture,
        heading: WORK_BOARD_HEADING,
      });
      // From here on, every notice either window shows is recorded — including
      // the ones the next re-read erases before anybody could read them.
      await watchAlerts(client);
      await watchAlerts(staff);
      evidence.story.signIn = "applicant A in the client window, the presenter in the staff window";
    });

    await phase("the presenter's reset leaves exactly the six seeded cases", async () => {
      evidence.story.indicatorBefore = await readFixtureIndicator(staff);
      evidence.story.indicatorAfter = await resetSampleCases(staff);
      const totals = await readBoardTotals(staff);
      assert.deepEqual(totals, { shown: 6, total: 6 });
      assert.equal(await staff.locator(".board-row").count(), 6);
      samples = await fixtureCases(fixture);
      assert.equal(samples.length, 6);
      assert.deepEqual(
        samples.map((row) => row.fixture_key).sort(),
        [...fixture.database.fixtureKeys].sort(),
      );
      await shoot(staff, "staff-board-six-cases");
    });

    await phase("a new application is submitted and reaches the staff board", async () => {
      classReference = await startApplication(client);
      assert.match(classReference, REFERENCE_PATTERN);
      classCase = await caseByReference(fixture, classReference);
      assert.ok(classCase, "the generated reference names no case");
      assert.equal(classCase.owner_user_id, applicantA.userId);
      assert.equal(classCase.fixture, false);
      // A client's own draft is theirs alone: the staff board cannot see it yet.
      assert.deepEqual(await readBoardTotals(staff), { shown: 6, total: 6 });
      await fillIntakeToReview(client);
      await waitForText(client, "Check your answers", RENDER_MS);
      await shoot(client, "intake-check-your-answers");
      await tickBox(client, "field-confirmed");
      await act(client, "SUBMIT", { badge: "Received" });
      // The same reference, on the other engine, with nothing copied by hand.
      await waitFor(
        staff,
        `the reference ${classReference} to arrive on the staff board`,
        (wanted) =>
          [...document.querySelectorAll("button.board-reference")].some((button) =>
            button.textContent.includes(wanted),
          ),
        classReference,
        ARRIVAL_MS,
      );
      assert.deepEqual(await readBoardTotals(staff), { shown: 7, total: 7 });
      evidence.story.reference = "matched REFERENCE_PATTERN and arrived on the board";
    });

    await phase(
      "staff persona switches and a staff reload leave the client window where it was",
      async () => {
        const before = await readClientPlace(client, applicantA.userId);
        assert.equal(before.stored.screen, "progress");
        assert.equal(before.stored.selectedCaseId, classCase.id);
        assert.equal(before.stored.formStep, 3);
        assert.deepEqual(before.stored.openPanels, ["confirmed"]);
        evidence.windowIsolation.clientBefore = before.stored;

        await choosePersona(staff, alex);
        await waitForText(staff, WORK_BOARD_HEADING, RENDER_MS);
        await choosePersona(staff, sam);
        await waitForText(staff, OFFICE_BOARD_HEADING, RENDER_MS);
        await choosePersona(staff, morgan);
        await waitForText(staff, WORK_BOARD_HEADING, RENDER_MS);
        await staff.reload();
        await waitForText(staff, WORK_BOARD_HEADING, ARRIVAL_MS);
        await watchAlerts(staff);
        assert.equal(await readPersona(staff), morgan, "the staff window forgot its own persona");

        const after = await readClientPlace(client, applicantA.userId);
        assert.deepEqual(after, before, "the staff window moved the client window");

        // …and the client window is not frozen: the next office step arrives.
        // The office opens it from its own board — "Intake checks needed" is
        // the first section, and a case at `received` is claimable by nobody,
        // so this is the only control on any office screen that reaches it.
        await choosePersona(staff, sam);
        await waitForText(staff, OFFICE_BOARD_HEADING, RENDER_MS);
        const arrived = staff
          .locator('section[aria-labelledby="arrived-title"] .board-row')
          .filter({ hasText: classReference })
          .first();
        await arrived.waitFor({ state: "visible", timeout: RENDER_MS });
        assert.equal(
          await arrived.locator("[data-case-action]").count(),
          0,
          "the way in to a new application offers a workflow action of its own",
        );
        await openCaseByReference(staff, classReference);
        await waitForText(staff, "Simulated intake checks", RENDER_MS);
        for (const check of ["interview", "identity", "documents", "consent"])
          await tickBox(staff, `field-intake-${check}`);
        await actForm(staff, "VERIFY_INTAKE", {}, {
          detail: { label: "Intake checks", value: "Recorded" },
        });
        await waitForBadge(client, "Waiting for preparation");
        const settled = await readClientPlace(client, applicantA.userId);
        assert.deepEqual(
          settled.stored,
          before.stored,
          "a shared update moved the client window",
        );
        evidence.windowIsolation.sharedUpdate =
          "the intake stage arrived in the client window with its navigation untouched";
      },
    );

    await phase("Alex claims preparation and requests the sample mileage record", async () => {
      await choosePersona(staff, alex);
      await waitForText(staff, "Preparation milestones", RENDER_MS);
      await act(staff, "CLAIM_PREPARATION", {
        detail: { label: "Preparer", value: "Alex" },
      });
      await waitForBadge(client, "In preparation");
      await actForm(
        staff,
        "REQUEST_DOCUMENT",
        {
          "Short title": REQUEST_TITLE,
          "What the client should send": REQUEST_MESSAGE,
        },
        { badge: "Waiting for the client" },
      );
      await waitForText(client, "ACTION NEEDED");
      await waitForText(client, REQUEST_TITLE, RENDER_MS);
      await shoot(client, "progress-action-needed");
      await shoot(staff, "staff-case-preparing");
    });

    await phase("Alex asks the office to contact the client", async () => {
      await actForm(
        staff,
        "ESCALATE_CONTACT",
        { "Why the office should call the client": ESCALATION_REASON },
        { text: "The office is already contacting the client about this request." },
      );
      assert.equal(
        await caseActionCount(staff, "ESCALATE_CONTACT"),
        0,
        "a second escalation is offered while one is open",
      );
    });

    await phase("Sam records the call and resolves the task; Alex stays the preparer", async () => {
      await choosePersona(staff, sam);
      await waitForText(staff, "Follow-up with the client", RENDER_MS);
      await actForm(
        staff,
        "RECORD_CONTACT",
        { "What happened": "reached", "Note for the office": CONTACT_NOTE },
        { text: CONTACT_NOTE },
      );
      // Recording a call never resolves the task.
      await waitForBadge(staff, "Open with the office");
      await shoot(staff, "office-case-followup");
      await actForm(
        staff,
        "RESOLVE_FOLLOWUP",
        { "How it ended": "reached", "What the office concluded": RESOLUTION_NOTE },
        { badge: "Resolved" },
      );
      await waitForDetail(staff, "Preparer", "Alex");
      const row = await caseById(fixture, classCase.id);
      assert.equal(row.preparer_id, alex, "the office's work moved the preparer");
      assert.equal(row.stage, "preparing");
    });

    await phase("the client sends the sample document for their own case", async () => {
      // The office has just finished working on this case, so this click can
      // meet a revision that moved a moment ago. The application refuses it and
      // says to try again — which is what this does, and counts.
      const response = await act(client, "RESPOND_DOCUMENT", {
        text: "What you sent",
      });
      evidence.story.documentResponse = response;
      // Ruling R65: a refusal is the person's to act on. Each one recorded here
      // was read back from the screen after the ten-second wait that followed
      // it — several background changes later — and had to still be there.
      for (const refusal of response.refusals) {
        assert.match(refusal.recorded, /Someone else (changed|updated) this/);
        assert.match(
          refusal.onScreen ?? "",
          /Someone else changed this application/,
          `a refusal left the screen before the client acted on it: ${JSON.stringify(refusal)}`,
        );
      }
      await waitForText(client, SAMPLE_DOCUMENT_FILENAME, RENDER_MS);
      await choosePersona(staff, alex);
      await waitForBadge(staff, "Received, not verified yet");
    });

    await phase("Alex verifies the document and records preparation complete", async () => {
      await act(staff, "VERIFY_DOCUMENT", { badge: "Verified" });
      await act(staff, "SUBMIT_REVIEW", { badge: "Waiting for review" });
      await waitForBadge(client, "Waiting for review");
      const row = await caseById(fixture, classCase.id);
      assert.equal(row.stage, "review_ready");
      assert.equal(row.preparer_id, alex);
      assert.equal(row.reviewer_id, null);
    });

    await phase("Morgan reviews: a finding, Alex's resubmission, then approval", async () => {
      await choosePersona(staff, morgan);
      await act(staff, "CLAIM_REVIEW", { detail: { label: "Reviewer", value: "Morgan" } });
      await waitForBadge(staff, "In review");
      await actForm(
        staff,
        "REQUEST_CORRECTIONS",
        { "Corrections to send back to the preparer": FINDINGS },
        { badge: "Corrections requested" },
      );
      await waitForBadge(client, "Corrections in progress");
      const duringCorrections = await pageText(client);
      assert.ok(
        !duringCorrections.includes(FINDINGS),
        "the reviewer's findings reached the client window",
      );

      await choosePersona(staff, alex);
      await waitForText(staff, "Corrections the reviewer asked for", RENDER_MS);
      await actForm(
        staff,
        "RESUBMIT_REVIEW",
        { "What you corrected in TaxSlayer": CORRECTION_NOTE },
        { badge: "Waiting for review" },
      );

      await choosePersona(staff, morgan);
      await act(staff, "CLAIM_REVIEW", { badge: "In review" });
      await act(staff, "APPROVE_REVIEW", { badge: "Review complete" });
      const row = await caseById(fixture, classCase.id);
      assert.equal(row.stage, "review_approved");
      assert.equal(row.reviewer_id, morgan);
      assert.equal(row.preparer_id, alex);
      evidence.story.reviewVersions = await eventCount(
        fixture,
        classCase.id,
        "APPROVE_REVIEW",
      );
      assert.equal(evidence.story.reviewVersions, 1);
    });

    await phase("Morgan records the client conversation and the client sees the next step", async () => {
      await actForm(
        staff,
        "RECORD_REVIEW_CONTACT",
        { "What happened": "reached", "Note for the office": REVIEW_CONTACT_NOTE },
        { text: "The client conversation for this review is recorded." },
      );
      await waitForBadge(client, "Review complete");
      await waitForText(
        client,
        "A volunteer will contact you about next steps.",
        RENDER_MS,
      );
      await waitForText(client, "A volunteer spoke with you about the next service step.");
      const seen = await pageText(client);
      for (const secret of [FINDINGS, CORRECTION_NOTE, REVIEW_CONTACT_NOTE, CONTACT_NOTE])
        assert.ok(
          !seen.includes(secret),
          `internal staff text reached the client window: ${secret.slice(0, 24)}…`,
        );
      for (const word of MONEY_WORDS)
        assert.ok(
          !seen.toLowerCase().includes(word),
          `the client window claimed something about money: ${word}`,
        );
      assert.equal(
        await client.locator('[data-role="internal-history"]').count(),
        0,
        "the client window rendered an internal history",
      );
      await shoot(client, "progress-review-complete");
      await shoot(staff, "staff-case-review-approved");
    });

    await phase("a second case takes the short path: claim review, approve", async () => {
      const short = samples.find((row) => row.fixture_key === "review_ready");
      await openBoard(staff, WORK_BOARD_HEADING);
      // Claimed from the board row itself, which names the case it belongs to.
      record(
        "CLAIM_REVIEW",
        await pressUntilEffect(staff, {
          press: async () => {
            await waitForQuiet(staff);
            await staff
              .locator(`.board-row:has(button.board-reference:has-text("${short.reference}"))`)
              .first()
              .locator('[data-case-action="CLAIM_REVIEW"]')
              .click({ timeout: CLICK_MS });
          },
          ready: HAS_DETAIL,
          arg: { label: "Reviewer", value: "Morgan" },
          what: "the claimed review, in its own case workspace",
          safeToRepeat: await unmovedSince(short.id),
        }),
      );
      await waitForCaseWorkspace(staff, short.reference);
      await act(staff, "APPROVE_REVIEW", { badge: "Review complete" }, { caseId: short.id });
      const row = await caseById(fixture, short.id);
      assert.equal(row.stage, "review_approved");
      assert.equal(await eventCount(fixture, short.id, "REQUEST_CORRECTIONS"), 0);
      evidence.story.shortPath = "claimed and approved with no correction round";
    });

    // -----------------------------------------------------------------------
    // Regressions
    // -----------------------------------------------------------------------

    const staffB = await openWindow(staffEngine);
    const clientB = await openWindow(clientEngine);
    const draftWin = await openWindow(clientEngine);

    await phase("two simultaneous claims leave exactly one owner", async () => {
      const target = samples.find((row) => row.fixture_key === "preparation_ready");
      await loginTestUser({
        page: staffB.page,
        actor: presenter,
        fixture,
        heading: WORK_BOARD_HEADING,
      });
      await watchAlerts(staffB.page);
      await choosePersona(staffB.page, alex);
      await choosePersona(staff, alex);
      await openBoard(staff, WORK_BOARD_HEADING);
      await openCaseByReference(staff, target.reference);
      await openCaseByReference(staffB.page, target.reference);
      const before = await caseById(fixture, target.id);
      assert.equal(before.stage, "preparation_ready");
      assert.equal(before.preparer_id, null);
      const windows = [staff, staffB.page];
      // Read from each window's own recorder rather than from the screen: a
      // refusal is not necessarily still there to be read, because
      // `handleChange` clears the error on its next successful re-read and the
      // winner's change is what arrives next (see the report's findings).
      const mark = await Promise.all(
        windows.map(async (page) => ((await readAlerts(page)) ?? []).length),
      );
      // Both presses are dispatched on the controls themselves, with no
      // actionability wait in between: the winner's own change removes the
      // loser's button within a few tens of milliseconds, and waiting for a
      // control to settle would make this a sequence rather than a race. Each
      // one is a real click event through the real handler, and each reports
      // whether it found a live button to press.
      for (const page of windows) await waitForQuiet(page);
      const fired = await Promise.all(
        windows.map((page) =>
          page.evaluate(() => {
            const button = document.querySelector('[data-case-action="CLAIM_PREPARATION"]');
            if (!button || button.disabled) return false;
            button.click();
            return true;
          }),
        ),
      );
      assert.deepEqual(
        fired,
        [true, true],
        "both windows must press their own claim for this to be a race",
      );
      await waitForDetail(staff, "Preparer", "Alex");
      await waitForDetail(staffB.page, "Preparer", "Alex");
      const said = await Promise.all(
        windows.map(async (page, index) =>
          ((await readAlerts(page)) ?? []).slice(mark[index]),
        ),
      );
      const refused = said.filter((lines) => lines.some((line) => REFUSAL_NOTICE.test(line)));
      const counts = {
        events: await eventCount(fixture, target.id, "CLAIM_PREPARATION"),
        receipts: await receiptCount(fixture, target.id, "CLAIM_PREPARATION"),
        participants: await participantCount(fixture, target.id),
      };
      assert.deepEqual(counts, { events: 1, receipts: 1, participants: 1 });
      assert.equal(
        refused.length,
        1,
        `exactly one window should have been refused; the two were told ${JSON.stringify(said)}`,
      );
      const stillShowing = await Promise.all(windows.map((page) => alertText(page)));
      evidence.regressions.simultaneousClaims = {
        ...counts,
        loserSaw: refused[0].find((line) => REFUSAL_NOTICE.test(line)).slice(0, 140),
        refusalStillOnScreen: stillShowing.filter(Boolean).length === 1,
      };
      assertConsoleQuiet(staffB, {
        name: "second staff window",
        allow: REFUSAL_LINES,
      });
      await staffB.context.close();
    });

    await phase("applicant B sees nothing of applicant A's case", async () => {
      await loginTestUser({ page: clientB.page, actor: applicantB, fixture });
      await waitForText(clientB.page, "No applications yet", RENDER_MS);
      await clientB.page
        .getByLabel("Application ID", { exact: true })
        .fill(classReference);
      await waitForQuiet(clientB.page);
      await clientB.page
        .getByRole("button", { name: "Find", exact: true })
        .click({ timeout: CLICK_MS });
      await waitForText(clientB.page, "We could not find that Application ID");
      assert.equal(
        await clientB.page.locator(".application-row").count(),
        0,
        "a stranger's application was listed",
      );

      // R62: the two denials no screen can express, through applicant B's own
      // authenticated client.
      const byId = await fixture.database.applicantB
        .from("cases")
        .select("id")
        .eq("id", classCase.id);
      const byReference = await fixture.database.applicantB
        .from("cases")
        .select("id")
        .eq("reference", classReference);
      assert.equal(byId.error, null);
      assert.equal(byReference.error, null);
      assert.deepEqual(byId.data, []);
      assert.deepEqual(byReference.data, []);
      const forged = await fixture.database.applicantB.rpc(
        "vitally_apply_action",
        applyArgs({
          caseId: classCase.id,
          revision: 1,
          type: "CLAIM_PREPARATION",
          personId: alex,
        }),
      );
      assert.ok(forged.error, "another applicant acted on a case that is not theirs");
      const otherCode = domainCode(forged.error);
      assert.ok(
        ["FORBIDDEN", "NOT_FOUND"].includes(otherCode),
        `unexpected refusal for another applicant's case: ${otherCode}`,
      );
      evidence.regressions.otherIdentity = {
        lookup: "not found, and nothing about the case is revealed",
        byId: "0 rows",
        byReference: "0 rows",
        action: otherCode,
      };
    });

    await phase("an applicant cannot forge a staff action on their own case", async () => {
      const actionId = randomUUID();
      const current = await caseById(fixture, classCase.id);
      const forged = await fixture.database.applicantA.rpc(
        "vitally_apply_action",
        applyArgs({
          actionId,
          caseId: classCase.id,
          revision: Number(current.revision),
          personId: sam,
          type: "VERIFY_INTAKE",
          payload: {
            checks: { interview: true, identity: true, documents: true, consent: true },
          },
        }),
      );
      assert.ok(forged.error, "an applicant performed a staff action");
      assert.equal(domainCode(forged.error), "FORBIDDEN");
      assert.equal(await receiptsForActionId(fixture, actionId), 0);
      const after = await caseById(fixture, classCase.id);
      assert.equal(after.revision, current.revision);
      evidence.regressions.roleForgery = "FORBIDDEN, with no receipt and no revision moved";
    });

    await phase(
      "an offline action reports no success and its retry is the same action",
      async () => {
        const reference = await startApplication(clientB.page);
        const own = await caseByReference(fixture, reference);
        await clickAction(clientB.page, "continue-intake");
        await waitForText(clientB.page, "Your visit", RENDER_MS);
        await clickAction(clientB.page, "fill-fictional");
        await clickContinue(clientB.page);
        await waitForText(clientB.page, "City of residence", ARRIVAL_MS);
        const savedOnce = await caseById(fixture, own.id);
        const receiptsBefore = await receiptCount(fixture, own.id, "SAVE_ANSWERS");

        // Offline, and refused at the door. `setOffline` alone is enough in
        // Chrome — the request fails at once — but Firefox leaves it pending
        // indefinitely instead, and a save that never answers is a different
        // test from a save that fails. Aborting the API origin makes the
        // disconnect mean the same thing in both engines; `setOffline` still
        // does the rest of the work (`navigator.onLine`, the dropped socket,
        // and the `online` event that drives the recovery below).
        const apiTraffic = `${fixture.authOrigin}/**`;
        const refuse = (route) => route.abort();
        await clientB.context.route(apiTraffic, refuse);
        await clientB.context.setOffline(true);
        await clientB.page
          .getByLabel("City of residence", { exact: true })
          .fill(OFFLINE_CITY);
        await clickContinue(clientB.page);
        await waitForText(clientB.page, "No connection to the server.");
        await waitForText(clientB.page, "Not saved.");
        const offlineRow = await caseById(fixture, own.id);
        assert.equal(
          Number(offlineRow.revision),
          Number(savedOnce.revision),
          "an offline action reached the server",
        );
        assert.notEqual(offlineRow.answers.residenceCity, OFFLINE_CITY);
        assert.equal(
          await receiptCount(fixture, own.id, "SAVE_ANSWERS"),
          receiptsBefore,
        );

        await clientB.context.unroute(apiTraffic, refuse);
        await clientB.context.setOffline(false);
        await clickAction(clientB.page, "retry-action");
        await waitForText(clientB.page, "Saved");
        await waitForTextGone(clientB.page, "No connection to the server.");
        const retried = await caseById(fixture, own.id);
        assert.equal(retried.answers.residenceCity, OFFLINE_CITY);
        assert.equal(
          Number(retried.revision),
          Number(savedOnce.revision) + 1,
          "the retry was a second action, not the same one",
        );
        assert.equal(
          await receiptCount(fixture, own.id, "SAVE_ANSWERS"),
          receiptsBefore + 1,
        );
        evidence.regressions.offlineRetry = {
          offline: "the connection notice appeared and nothing was saved",
          retry: "one further receipt and one further revision",
        };
      },
    );

    await phase("a draft edited in two windows offers a choice, and keeps it", async () => {
      await clickAction(client, "open-applications");
      const reference = await startApplication(client);
      const draftCase = await caseByReference(fixture, reference);
      await clickAction(client, "continue-intake");
      await waitForText(client, "Your visit", RENDER_MS);
      await clickAction(client, "fill-fictional");
      await clickContinue(client);
      await waitForText(client, "City of residence", ARRIVAL_MS);
      await client.getByLabel("City of residence", { exact: true }).fill(MINE_CITY);

      // Another window of the same account — the one thing that can change a
      // client's own draft, because the office is refused it by design.
      await loginTestUser({ page: draftWin.page, actor: applicantA, fixture });
      await waitForQuiet(draftWin.page);
      await draftWin.page
        .locator(`.application-row:has-text("${reference}")`)
        .first()
        .click({ timeout: CLICK_MS });
      await waitForText(draftWin.page, "Your visit", ARRIVAL_MS);
      await clickContinue(draftWin.page);
      await waitForText(draftWin.page, "City of residence", ARRIVAL_MS);
      await draftWin.page
        .getByLabel("City of residence", { exact: true })
        .fill(OTHER_CITY);
      await clickContinue(draftWin.page);
      await waitForText(draftWin.page, "Your details", ARRIVAL_MS);

      await waitForText(client, "Someone else changed this application");
      const conflict = await client.locator(".conflict-panel").innerText();
      assert.ok(conflict.includes(MINE_CITY), "the conflict hid this window's edit");
      assert.ok(conflict.includes(OTHER_CITY), "the conflict hid the other version");
      await clickAction(client, "reconcile-mine");
      await waitForTextGone(client, "Someone else changed this application");
      assert.equal(
        await client.getByLabel("City of residence", { exact: true }).inputValue(),
        MINE_CITY,
      );
      await clickContinue(client);
      await waitForText(client, "Your details", ARRIVAL_MS);
      const saved = await caseById(fixture, draftCase.id);
      assert.equal(saved.answers.residenceCity, MINE_CITY);
      evidence.regressions.conflict = "REMOTE_CHANGED offered both answers; the chosen one saved";
      assertConsoleQuiet(draftWin, {
        name: "second applicant-A window",
        allow: REFUSAL_LINES,
      });
      await draftWin.context.close();
    });

    await phase(
      "the form screens, blocks a blank required answer, and keeps what was saved",
      async () => {
        await clickAction(client, "open-applications");
        const reference = await startApplication(client);
        const own = await caseByReference(fixture, reference);
        const untouched = Number(own.revision);
        await clickAction(client, "continue-intake");
        await waitForText(client, "Your visit", RENDER_MS);

        // A required answer nobody has given stops the step, and the field
        // that stopped it says so for itself.
        await clickContinue(client);
        const blocked = await client.evaluate(() => {
          const form = document.querySelector("#intake-form");
          const invalid = [...form.elements].find(
            (element) => element.willValidate && !element.checkValidity(),
          );
          return {
            formValid: form.checkValidity(),
            step: document.querySelector(".page-intro .overline")?.textContent ?? null,
            field: invalid?.name ?? null,
            message: invalid?.validationMessage ?? null,
          };
        });
        assert.equal(blocked.formValid, false);
        assert.equal(blocked.step, "STEP 1 OF 4", "a blank required answer did not stop the step");
        assert.equal(blocked.field, "service", "a different field was the one that blocked");
        assert.ok(blocked.message, "the field that blocked the step explains nothing");
        assert.equal(
          Number((await caseById(fixture, own.id)).revision),
          untouched,
          "a form that refused to submit still sent something",
        );
        evidence.regressions.requiredField = {
          field: blocked.field,
          stoppedAt: blocked.step,
        };

        await clickAction(client, "fill-fictional");
        await clickContinue(client);
        await waitForText(client, "City of residence", ARRIVAL_MS);

        // Screening: an answer outside what PCDC prepares stops the
        // application where it stands, and says it is a service limit.
        await waitForQuiet(client);
        await client
          .locator('input[name="other"][value="yes"]')
          .click({ timeout: CLICK_MS });
        await waitForText(client, OUT_OF_SCOPE_NOTICE, RENDER_MS);
        const stopped = await client.evaluate(() => ({
          continueDisabled: [
            ...document.querySelectorAll("#intake-form button[type='submit']"),
          ].every((button) => button.disabled),
          submits: document.querySelectorAll('[data-case-action="SUBMIT"]').length,
        }));
        assert.equal(stopped.continueDisabled, true, "an unsupported answer still continues");
        assert.equal(stopped.submits, 0, "an unsupported answer can still be submitted");
        await waitForText(
          client,
          "This is a PCDC service limitation, not a judgement about your taxes.",
          RENDER_MS,
        );
        evidence.regressions.screening =
          "the out-of-scope notice appeared, Continue was disabled and nothing could be submitted";

        await waitForQuiet(client);
        await client
          .locator('input[name="other"][value="no"]')
          .click({ timeout: CLICK_MS });
        await waitForTextGone(client, OUT_OF_SCOPE_NOTICE, RENDER_MS);

        // Save and exit, sign out, come back as the same applicant, and open
        // the same application again from the list.
        await client.getByLabel("City of residence", { exact: true }).fill(RETURN_CITY);
        await clickAction(client, "save-exit");
        await waitForText(client, "My applications", RENDER_MS);
        assert.equal(
          (await caseById(fixture, own.id)).answers.residenceCity,
          RETURN_CITY,
          "save and exit saved nothing",
        );
        await clickAction(client, "sign-out");
        await waitForText(client, "Sign in with your email", RENDER_MS);
        // A fresh document, because the auth module's resend cooldown lives in
        // the one it signed out of (Task 5A, note 3).
        await client.goto(fixture.appOrigin);
        await loginTestUser({ page: client, actor: applicantA, fixture });
        await watchAlerts(client);
        await waitForQuiet(client);
        await client
          .locator(`.application-row:has-text("${reference}")`)
          .first()
          .click({ timeout: CLICK_MS });
        await waitForText(client, "Your visit", ARRIVAL_MS);
        await clickContinue(client);
        await waitForText(client, "City of residence", ARRIVAL_MS);
        assert.equal(
          await client.getByLabel("City of residence", { exact: true }).inputValue(),
          RETURN_CITY,
          "the answers saved before signing out did not come back",
        );
        evidence.regressions.saveAndReturn =
          "saved, signed out, signed back in, reopened from the list with the same answers";
        // Left on the step the reset phase reads a field from.
        await clickContinue(client);
        await waitForText(client, "Your details", ARRIVAL_MS);
      },
    );

    await phase("a dialog takes the keyboard and gives it back", async () => {
      // Run while the client window is quiet: a dialog is about the keyboard,
      // and a page that is rebuilding itself is a different question (see the
      // reset phase below, which measures exactly that).
      const where = () =>
        client.evaluate(() => ({
          inModal: Boolean(document.activeElement?.closest(".modal")),
          element: document.activeElement?.tagName ?? null,
          action: document.activeElement?.dataset?.action ?? null,
        }));
      const openWithKeyboard = async (action) => {
        const control = client.locator(`[data-action="${action}"]`).first();
        // Wait for stillness first: a rebuild replaces the control, and the
        // keyboard does not follow it (see the finding on `describeFocus`).
        await waitForQuiet(client);
        await control.focus();
        await waitFor(
          client,
          `the ${action} control to hold the keyboard`,
          (wanted) => document.activeElement?.dataset?.action === wanted,
          action,
          RENDER_MS,
        );
        const presses = await pressUntil(
          client,
          control,
          "Enter",
          () => Boolean(document.querySelector(".modal")),
          `the ${action} dialog`,
        );
        // The dialog moves the keyboard on the next animation frame, so this
        // waits for it rather than sampling — and reports rather than throws,
        // because whether it ever arrives is the measurement.
        const landed = await client
          .waitForFunction(
            () => Boolean(document.activeElement?.closest(".modal")),
            undefined,
            { timeout: 2_000, polling: 100 },
          )
          .then(() => true)
          .catch(() => false);
        return { presses, landed, focus: await where() };
      };
      const closeWithEscape = async (action) => {
        // Quiet again before the key: the focus this hands back is dropped by
        // any rebuild that arrives with it, which is the same finding as above
        // and not what this check is about.
        await waitForQuiet(client);
        await client.keyboard.press("Escape");
        await waitFor(
          client,
          `the ${action} dialog to close`,
          () => document.querySelector(".modal") === null,
          undefined,
          RENDER_MS,
        );
        await waitFor(
          client,
          `the ${action} dialog to give the keyboard back`,
          (wanted) => document.activeElement?.dataset?.action === wanted,
          action,
          RENDER_MS,
        );
      };

      // A dialog whose body carries controls: it takes the keyboard, keeps it
      // while Tab moves around inside, and hands it back on Escape.
      const regenerate = await openWithKeyboard("regenerate-fictional");
      assert.equal(
        regenerate.landed,
        true,
        `the dialog opened without taking the keyboard: ${JSON.stringify(regenerate.focus)}`,
      );
      await client.keyboard.press("Tab");
      const firstTab = await where();
      await client.keyboard.press("Tab");
      const secondTab = await where();
      assert.equal(firstTab.inModal, true, "Tab left the dialog");
      assert.equal(secondTab.inModal, true, "Tab left the dialog on the way round");
      await closeWithEscape("regenerate-fictional");

      // A dialog whose body is only prose — the help dialog's one focusable
      // control is its own close button. It still has to take the keyboard
      // (Ruling R65), and Tab still has to stay inside it.
      const helpDialog = await openWithKeyboard("open-help");
      assert.equal(
        helpDialog.landed,
        true,
        `the help dialog opened without taking the keyboard: ${JSON.stringify(helpDialog.focus)}`,
      );
      assert.ok(
        CONTROLS.includes(helpDialog.focus.element),
        `the help dialog put the keyboard on ${helpDialog.focus.element} rather than on a control`,
      );
      await client.keyboard.press("Tab");
      const helpAfterTab = await where();
      assert.equal(helpAfterTab.inModal, true, "Tab left the help dialog");
      await closeWithEscape("open-help");

      evidence.regressions.dialogFocus = {
        result: "Escape closed both dialogs and the focus returned to the control that opened each",
        regenerate: {
          ...regenerate.focus,
          landed: regenerate.landed,
          presses: regenerate.presses,
        },
        afterTabInside: [firstTab.inModal, secondTab.inModal],
        help: { ...helpDialog.focus, landed: helpDialog.landed, presses: helpDialog.presses },
        helpAfterTab,
      };
    });

    await phase("the office takes in a walk-in client's application and its document", async () => {
      await choosePersona(staff, sam);
      await openBoard(staff, OFFICE_BOARD_HEADING);
      await clickAction(staff, "toggle-assisted-intake");
      await waitForText(staff, "A walk-in client's answers", RENDER_MS);
      await clickAction(staff, "fill-assisted-intake");
      await waitFor(
        staff,
        "the assisted intake form to be filled in",
        () => Boolean(document.querySelector("#field-assisted-firstName")?.value),
        undefined,
        RENDER_MS,
      );
      // Creating a case is the form's own submit, not a case action — there is
      // no case yet — so what proves a repeat is safe is that no case appeared.
      const before = await workspaceCaseCount(fixture);
      record(
        "CREATE_ASSISTED",
        await pressUntilEffect(staff, {
          press: async () => {
            await waitForQuiet(staff);
            await staff
              .locator('#assisted-intake-form button[type="submit"]')
              .click({ timeout: CLICK_MS });
          },
          ready: HAS_TEXT,
          arg: "The answers the office entered",
          what: "the assisted application's own case workspace",
          safeToRepeat: async () => (await workspaceCaseCount(fixture)) === before,
        }),
      );
      const assistedReference = (await staff.locator("#case-title").innerText()).trim();
      const assisted = await caseByReference(fixture, assistedReference);
      assert.equal(assisted.owner_user_id, null, "an assisted case has a client account");
      const onAssisted = { caseId: assisted.id };
      await tickBox(staff, "field-confirmed");
      await act(
        staff,
        "SUBMIT",
        { badge: "Received" },
        { ...onAssisted, attributes: '[data-role="assisted-submit"]' },
      );
      for (const check of ["interview", "identity", "documents", "consent"])
        await tickBox(staff, `field-intake-${check}`);
      await actForm(
        staff,
        "VERIFY_INTAKE",
        {},
        { detail: { label: "Intake checks", value: "Recorded" } },
        onAssisted,
      );

      await choosePersona(staff, alex);
      await act(
        staff,
        "CLAIM_PREPARATION",
        { detail: { label: "Preparer", value: "Alex" } },
        onAssisted,
      );
      await actForm(
        staff,
        "REQUEST_DOCUMENT",
        {
          "Short title": REQUEST_TITLE,
          "What the client should send": REQUEST_MESSAGE,
        },
        { badge: "Waiting for the client" },
        onAssisted,
      );

      await choosePersona(staff, sam);
      await waitForText(staff, "Documents the office took in", RENDER_MS);
      await act(
        staff,
        "RECORD_DOCUMENT_RESPONSE",
        { badge: "Received, not verified yet" },
        onAssisted,
      );
      const recorded = await one(
        fixture,
        "select source,filename from public.documents where case_id=$1",
        [assisted.id],
      );
      assert.deepEqual(recorded, {
        source: "staff_recorded",
        filename: SAMPLE_DOCUMENT_FILENAME,
      });

      await choosePersona(staff, alex);
      await act(staff, "VERIFY_DOCUMENT", { badge: "Verified" }, onAssisted);
      await shoot(staff, "office-board-assisted");
      evidence.regressions.assistedReceipt =
        "created, submitted, verified intake, claimed, requested, staff-recorded, verified";
    });

    await phase("two presenter windows in one browser keep their own persona", async () => {
      const context = await staffEngine.browser.newContext({ viewport: DESKTOP });
      try {
        const tabOne = await openTab(context, fixture.appOrigin);
        await loginTestUser({
          page: tabOne.page,
          actor: presenter,
          fixture,
          heading: WORK_BOARD_HEADING,
        });
        // The same account, the same origin, the same storage: a second window.
        const tabTwo = await openTab(context, fixture.appOrigin);
        await waitForText(tabTwo.page, WORK_BOARD_HEADING, ARRIVAL_MS);
        await choosePersona(tabOne.page, alex);
        await choosePersona(tabTwo.page, morgan);
        await openCaseByReference(tabTwo.page, classReference);
        await tabOne.page.reload();
        await tabTwo.page.reload();
        await waitForText(tabOne.page, WORK_BOARD_HEADING, ARRIVAL_MS);
        await waitForCaseWorkspace(tabTwo.page, classReference);
        assert.equal(await readPersona(tabOne.page), alex);
        assert.equal(await readPersona(tabTwo.page), morgan);
        assert.equal(
          await tabOne.page.locator("#case-title").count(),
          0,
          "the first window followed the second one into a case",
        );
        assertConsoleQuiet(tabOne, { name: "presenter tab 1" });
        assertConsoleQuiet(tabTwo, { name: "presenter tab 2" });
        evidence.windowIsolation.presenterTabs =
          "one BrowserContext, one account, two personas and two places, each surviving its own reload";
      } finally {
        await context.close();
      }
    });

    await phase("a fixed code is refused and an unknown address says nothing", async () => {
      const codeWin = await openWindow(clientEngine);
      try {
        const { release } = await requestCode({
          page: codeWin.page,
          fixture,
          address: applicantB.email,
        });
        let pending = null;
        try {
          // The deleted prototype's fixed code is just a wrong number now.
          await submitVerificationCode({ page: codeWin.page, code: "246810" });
          await waitForText(
            codeWin.page,
            "That code is invalid or has expired. Request a new code.",
          );
          await codeWin.page.getByLabel("Verification code", { exact: true }).waitFor();
        } catch (error) {
          pending = error;
          throw error;
        } finally {
          await release({ pending });
        }
        evidence.regressions.fixedCode = "refused, and the form stays on the code step";
        assertConsoleQuiet(codeWin, {
          name: "wrong-code window",
          allow: REFUSAL_LINES,
        });
      } finally {
        await codeWin.context.close();
      }

      const unknownWin = await openWindow(clientEngine);
      try {
        const { release } = await requestCode({
          page: unknownWin.page,
          fixture,
          // Syntactically valid, and nobody's.
          address: `unknown-${randomUUID()}@vitally.invalid`,
        });
        let pending = null;
        try {
          await waitForText(unknownWin.page, fixture.neutralSendMessage, RENDER_MS);
          const resend = unknownWin.page.locator("[data-action='resend-code']");
          assert.match((await resend.innerText()).trim(), /^Resend code in \d+s$/);
          assert.equal(await resend.isDisabled(), true);
        } catch (error) {
          pending = error;
          throw error;
        } finally {
          await release({ pending });
        }
        evidence.regressions.unknownAddress =
          "the same neutral message and the same disabled countdown";
        assertConsoleQuiet(unknownWin, {
          name: "unknown-address window",
          allow: REFUSAL_LINES,
        });
      } finally {
        await unknownWin.context.close();
      }
    });

    await phase("a reset rebuilds the samples and leaves the class's own work alone", async () => {
      const before = await fixtureCases(fixture);
      // Two things this phase asserts about the client window while somebody
      // else rebuilds the sample cases underneath it. Both were defects this
      // story found; both are fixed, and this is what pins them (Ruling R65).
      //
      // (1) A refusal the person has not dismissed. The save below is refused
      //     because the API is unreachable, and the notice names why.
      const apiTraffic = `${fixture.authOrigin}/**`;
      const refuse = (route) => route.abort();
      await clientWin.context.route(apiTraffic, refuse);
      await client.getByLabel("ZIP code", { exact: true }).fill("19104");
      await clickContinue(client);
      await waitForText(client, "Not saved.");
      const refusalBefore = await alertText(client);
      assert.ok(refusalBefore, "the refused save said nothing at all");
      await clientWin.context.unroute(apiTraffic, refuse);
      // (2) Where the keyboard is when the rebuild arrives.
      await client.locator('[data-action="open-help"]').first().focus();
      await choosePersona(staff, sam);
      await openBoard(staff, OFFICE_BOARD_HEADING);
      const indicator = await resetSampleCases(staff);
      const after = await fixtureCases(fixture);
      assert.equal(after.length, 6);
      assert.equal(
        after.filter((row) => before.some((old) => old.id === row.id)).length,
        0,
        "a reset kept an old sample case id",
      );
      assert.deepEqual(
        after.map((row) => row.fixture_key).sort(),
        before.map((row) => row.fixture_key).sort(),
      );
      const kept = await caseById(fixture, classCase.id);
      assert.equal(kept.reference, classReference);
      assert.equal(kept.owner_user_id, applicantA.userId);
      assert.equal(kept.stage, "review_approved");
      // Both measurements are about what the *client* window does when the
      // change reaches it, so they wait for the sign that it has: the refused
      // save left the connection notice on screen, and the re-read that
      // handles the reset is what takes it away again.
      const reconnected = await client
        .waitForFunction(
          () =>
            !(document.querySelector("#app")?.innerText ?? "").includes(
              "No connection to the server.",
            ),
          undefined,
          { timeout: ARRIVAL_MS, polling: 150 },
        )
        .then(() => true)
        .catch(() => false);
      const reset = {
        indicator,
        keptClassCase: "same reference, same owner, same stage",
        clientRecovered: reconnected,
        keyboardBeforeSharedUpdate: "open-help",
        keyboardAfterSharedUpdate: await client.evaluate(
          () =>
            document.activeElement?.dataset?.action ??
            document.activeElement?.tagName ??
            null,
        ),
        refusalBefore,
        refusalAfter: await alertText(client),
      };
      reset.refusalKept = reset.refusalAfter === refusalBefore;
      evidence.regressions.reset = reset;
      // Both checks below are about what the reset did to the client window,
      // so they mean nothing until the reset has reached it. This is the sign
      // that it did: the connection notice the refused save left behind is
      // gone, which only the re-read that handles the reset can do.
      assert.equal(
        reset.clientRecovered,
        true,
        "the client window never re-read after the reset, so the checks below prove nothing",
      );
      assert.equal(
        reset.keyboardAfterSharedUpdate,
        reset.keyboardBeforeSharedUpdate,
        "a shared update took the keyboard away from the control it was on",
      );
      assert.equal(
        reset.refusalKept,
        true,
        `a refusal nobody had dismissed was changed by a background update: ${JSON.stringify(reset.refusalAfter)}`,
      );
      // The client's own window still lists their own application, unchanged.
      await clickAction(client, "open-applications");
      await waitForText(client, classReference, ARRIVAL_MS);
    });

    await phase("nothing threw, and every console line was one we asked for", async () => {
      evidence.consoleErrors = {
        // The client window's own refusals are the stale-revision conflicts
        // counted above; Chrome logs one resource line per refused request and
        // Firefox logs none. Nothing else may appear on any of these pages.
        client: assertConsoleQuiet(clientWin, {
          name: "client window",
          allow: REFUSAL_LINES,
        }),
        staff: assertConsoleQuiet(staffWin, {
          name: "staff window",
          allow: REFUSAL_LINES,
        }),
        clientB: assertConsoleQuiet(clientB, {
          name: "second applicant window",
          allow: REFUSAL_LINES,
        }),
      };
      // A press that reached nothing at all is an application defect, not a
      // retry case: the page rebuilt itself under the pointer (Ruling R65).
      assert.deepEqual(
        evidence.retries.filter((entry) => entry.lost > 0),
        [],
        "a press reached nothing at all and had to be sent again",
      );
      // Recorded, not asserted: the measurement that matters is the one each
      // screenshot took at 390px, and every one of those is asserted there.
      evidence.overflow.desktop = {
        client: await measureOverflow(client),
        staff: await measureOverflow(staff),
      };
    });
  } finally {
    // Gathered even when a phase throws: every notice the two windows showed
    // (including the ones already erased) and the class case as the server
    // holds it are what say how far the story got and what stopped it.
    try {
      evidence.alerts = {
        client: client ? await readAlerts(client) : null,
        staff: staff ? await readAlerts(staff) : null,
      };
      if (classCase) evidence.classCase = await caseById(fixture, classCase.id);
    } catch (error) {
      evidence.evidenceGathering = String(error?.message ?? error);
    }
    // The one place the whole record is printed, and so the one place worth
    // masking as a whole: anything read off a page reaches this line.
    t.diagnostic(redactAddresses(`evidence ${JSON.stringify(evidence)}`));
    await fixture.close();
  }
}

// The guard for this file's own invariant, and the only test here that needs
// no browser: a test account's address is the one secret a screen can echo
// back ("Signing in as …" on the code step), and everything this file reads off
// a page ends up in a failure message or in the evidence diagnostic.
test("no address survives the redaction every message goes through", () => {
  const address = "applicant-7f3a2e1c@vitally.invalid";
  // The sentence the code step renders. The trailing full stop goes with the
  // address, which is the safe direction to err in.
  assert.equal(
    redactAddresses(`Signing in as ${address}. This confirms you can read that inbox.`),
    "Signing in as <address> This confirms you can read that inbox.",
  );
  // Whatever quoting a screen read, a JSON dump or an alert puts around one.
  assert.equal(
    redactAddresses(JSON.stringify({ tail: `to "${address}" and <${address}>` })),
    '{"tail":"to \\"<address>\\" and <<address>>"}',
  );
  assert.equal(
    redactAddresses(`unknown-1@vitally.invalid and unknown-2@vitally.invalid`),
    "<address> and <address>",
  );
  // And nothing else is touched: the reference, the stages and the copy this
  // file asserts on have to survive a message unchanged.
  const ordinary =
    "VT-4UPB-2AKH Waiting for preparation · Someone else changed this case.";
  assert.equal(redactAddresses(ordinary), ordinary);
  assert.equal(redactAddresses(null), null);
  assert.equal(redactAddresses(undefined), undefined);
});

test(
  "Chrome client and Firefox staff run the whole demonstration story",
  { timeout: PERMUTATION_TIMEOUT_MS },
  (t) => runPermutation(t, { client: "chrome", staff: "firefox" }),
);

test(
  "Firefox client and Chrome staff run the whole demonstration story",
  { timeout: PERMUTATION_TIMEOUT_MS },
  (t) => runPermutation(t, { client: "firefox", staff: "chrome" }),
);
