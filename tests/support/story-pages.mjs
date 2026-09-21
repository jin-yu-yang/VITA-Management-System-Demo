import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { sessionStateKey } from "./browser-fixture.mjs";

// The page-driving vocabulary the demonstration story is written in (Task 10A).
// Everything here works on a real page through the controls a person uses:
// there is no session injection, no controller handle on `window`, and no
// fixture short-cut around a screen. Two rules hold throughout:
//
//   * **Every wait is a condition with a bound.** A rendered fact, a stored
//     window record or a server-side row — never a sleep, and never an
//     unbounded `waitFor`. A wait that runs out throws, naming what it was
//     waiting for, what the screen said instead and how long it waited, so a
//     failure reads as a defect report rather than as "timeout".
//   * **Nothing here hides a defect.** A helper clicks what the screen offers
//     and asserts what the screen says. When a screen cannot express a step,
//     the story reports it (Ruling R61) instead of reaching past the page.

// A change that has to travel: an action, a Realtime notification, a re-read.
export const ARRIVAL_MS = 20_000;
// Something the page renders by itself from state it already holds.
export const RENDER_MS = 10_000;
// One control's own click, which Playwright already waits to be actionable.
export const CLICK_MS = 15_000;

export const DESKTOP = Object.freeze({ width: 1280, height: 900 });
// Two windows side by side on one projector, and one narrow phone.
export const SCREENSHOT_WIDTHS = Object.freeze([720, 390]);
export const MOBILE_WIDTH = 390;

// ---------------------------------------------------------------------------
// The one thing a screen can echo back
// ---------------------------------------------------------------------------

// A test account's address is the only secret a screen ever shows: the access
// form's code step renders "Signing in as <address>" from what was typed
// (`src/client-views.mjs`). Anything read off a page can therefore carry one,
// and everything read off a page ends up in a failure message or a diagnostic.
//
// So it is masked twice: once **inside the page**, so an address never crosses
// into this process at all, and once here, over everything on its way into a
// message — the belt for the in-page braces, and the one that can be tested
// without a browser. `ADDRESS` is the shape an address has in page text:
// non-space either side of an `@`, stopping at the quoting a page or a JSON
// dump puts around it, including the backslash that escapes that quoting.
const ADDRESS = /[^\s<>"'\\]+@[^\s<>"'\\]+/g;
export const ADDRESS_MASK = "<address>";

/** Mask every address in one string, or in anything stringified. */
export const redactAddresses = (value) =>
  value === null || value === undefined
    ? value
    : String(value).replace(ADDRESS, ADDRESS_MASK);

// ---------------------------------------------------------------------------
// Bounded condition waits
// ---------------------------------------------------------------------------

// What a failing wait reports: the case on screen, every badge it carries, any
// refusal it is announcing, the sections it rendered, and the end of the text
// (the presenter panel is at the top of every staff screen and says nothing
// about the case).
const screenText = async (page) => {
  try {
    const read = await page.evaluate(() => {
      // The access screen echoes the address somebody typed, and a failure
      // message is printed. Addresses are redacted in the page, so one cannot
      // reach this process at all — the same rule the Task 5A gate keeps.
      const safe = (value) =>
        String(value ?? "").replace(/[^\s<>"'\\]+@[^\s<>"'\\]+/g, "<address>");
      const text = safe(
        (document.querySelector("#main")?.innerText ?? "").replace(/\s+/g, " "),
      );
      return JSON.stringify({
        title:
          document.querySelector("#case-title")?.textContent.trim() ??
          document.querySelector("#main h1")?.textContent.trim() ??
          null,
        badges: [...document.querySelectorAll(".badge")].map((badge) =>
          badge.textContent.trim(),
        ),
        alert: document.querySelector('[role="alert"]')
          ? safe(document.querySelector('[role="alert"]').innerText.replace(/\s+/g, " ").trim())
          : null,
        toast: safe(document.querySelector("#toast")?.textContent.trim()) || null,
        notices: (window.__vitallyAlerts ?? null)?.map(safe) ?? null,
        sections: [...document.querySelectorAll(".panel h2")].map((heading) =>
          heading.textContent.trim(),
        ),
        tail: text.slice(-700),
      });
    });
    // Masked in the page already; masked again on the way into the message.
    return redactAddresses(read);
  } catch {
    return "<the page could not be read>";
  }
};

/**
 * Wait for a predicate evaluated **in the page**, with a bound and a message
 * that says what was being waited for and what the screen showed instead.
 */
export async function waitFor(page, what, predicate, arg, timeout = ARRIVAL_MS) {
  try {
    await page.waitForFunction(predicate, arg, { timeout, polling: 150 });
  } catch (error) {
    throw new Error(
      `Timed out after ${timeout}ms waiting for ${what}. The screen read: ${await screenText(page)}`,
      { cause: error },
    );
  }
}

/** Wait until the visible page contains this text. */
export const waitForText = (page, text, timeout = ARRIVAL_MS) =>
  waitFor(
    page,
    `the text ${JSON.stringify(text)}`,
    (needle) => (document.querySelector("#app")?.innerText ?? "").includes(needle),
    text,
    timeout,
  );

/** Wait until the visible page no longer contains this text. */
export const waitForTextGone = (page, text, timeout = ARRIVAL_MS) =>
  waitFor(
    page,
    `the text ${JSON.stringify(text)} to disappear`,
    (needle) => !(document.querySelector("#app")?.innerText ?? "").includes(needle),
    text,
    timeout,
  );

/** Wait for one `detail-row` label to carry this exact value. */
export const waitForDetail = (page, label, value, timeout = ARRIVAL_MS) =>
  waitFor(
    page,
    `the detail ${JSON.stringify(label)} to read ${JSON.stringify(value)}`,
    ({ label: wanted, value: expected }) =>
      [...document.querySelectorAll(".detail-row")].some(
        (row) =>
          row.querySelector("span")?.textContent.trim() === wanted &&
          row.querySelector("strong")?.textContent.trim() === expected,
      ),
    { label, value },
    timeout,
  );

/**
 * Wait for a badge with this exact label. Stages, document-request statuses,
 * review attempts and office tasks all state themselves in one, and colour is
 * never their only signal — the words are what this reads.
 */
export const waitForBadge = (page, label, timeout = ARRIVAL_MS) =>
  waitFor(
    page,
    `a badge reading ${JSON.stringify(label)}`,
    (wanted) =>
      [...document.querySelectorAll(".badge")].some(
        (badge) => badge.textContent.trim() === wanted,
      ),
    label,
    timeout,
  );

/** The one visible value of a `detail-row`, for a report or an assertion. */
export async function readDetail(page, label) {
  return await page.evaluate(
    (wanted) =>
      [...document.querySelectorAll(".detail-row")]
        .find((row) => row.querySelector("span")?.textContent.trim() === wanted)
        ?.querySelector("strong")
        ?.textContent.trim() ?? null,
    label,
  );
}

export const pageText = (page) => page.locator("#app").innerText();

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

// How long the page must hold still before a click is sent.
//
// A re-render burst is several rebuilds a few hundred milliseconds apart — two
// `cases` rows per accepted action, plus a row per related table — so a short
// window can fall in a gap between two of them and let a press go out just as
// the next one lands. At 300ms about two presses per run reached nothing at
// all; at this length none did. It is the cost of pressing only into a page
// that is actually still.
const QUIET_MS = 600;

/**
 * Wait until the page has stopped rebuilding itself.
 *
 * `render()` replaces `#app`'s whole contents, and a burst of them arrives
 * whenever the other window works: every accepted action publishes two `cases`
 * rows, and each one makes this window re-read and re-render. A click sent into
 * that burst is a race — the control it was aimed at is replaced underneath it,
 * and an action built from a revision the burst has already moved is refused.
 * So a click waits for stillness first, exactly as Playwright's own
 * actionability check waits for an element to stop moving.
 *
 * This is a condition, not a sleep: it watches real DOM mutations and gives up
 * loudly at its bound.
 */
export async function waitForQuiet(page, { quiet = QUIET_MS, timeout = ARRIVAL_MS } = {}) {
  await waitFor(
    page,
    `the page to stop rebuilding itself for ${quiet}ms`,
    (settle) => {
      const app = document.querySelector("#app");
      if (!app) return false;
      if (!window.__vitallyQuiet) {
        window.__vitallyQuiet = { last: performance.now() };
        window.__vitallyQuiet.observer = new MutationObserver(() => {
          window.__vitallyQuiet.last = performance.now();
        });
        window.__vitallyQuiet.observer.observe(app, { childList: true, subtree: true });
        return false;
      }
      return performance.now() - window.__vitallyQuiet.last > settle;
    },
    quiet,
    timeout,
  );
}

export async function clickAction(page, action, { attributes = "", timeout = CLICK_MS } = {}) {
  await waitForQuiet(page);
  await page.locator(`[data-action="${action}"]${attributes}`).first().click({ timeout });
}

export async function clickCaseAction(page, type, { attributes = "", timeout = CLICK_MS } = {}) {
  await waitForQuiet(page);
  await page
    .locator(`[data-case-action="${type}"]${attributes}`)
    .first()
    .click({ timeout });
}

export const caseActionCount = (page, type, attributes = "") =>
  page.locator(`[data-case-action="${type}"]${attributes}`).count();

// What the application says when the revision an action was built from has
// already moved: the banner's words and the toast's words for the same refusal.
const STALE_REVISION = /Someone else (changed|updated) this/;

// Every sentence the application uses to refuse a workflow action, from
// `src/errors.mjs`'s one message per domain code plus the controller's two
// re-wordings of a conflict. A notice matching none of these is a confirmation.
export const REFUSAL_NOTICE =
  /Someone else (changed|updated) this|not available right now|do not have access to this step|no longer available|different volunteer has to review|not qualified for this step|check the information and try again|cannot reach the server/;

// The facts a workflow interaction is expected to produce, as predicates the
// page evaluates for itself.
export const HAS_BADGE = (wanted) =>
  [...document.querySelectorAll(".badge")].some(
    (badge) => badge.textContent.trim() === wanted,
  );
export const HAS_TEXT = (wanted) =>
  (document.querySelector("#main")?.innerText ?? "").includes(wanted);
export const HAS_DETAIL = ({ label, value }) =>
  [...document.querySelectorAll(".detail-row")].some(
    (row) =>
      row.querySelector("span")?.textContent.trim() === label &&
      row.querySelector("strong")?.textContent.trim() === value,
  );

/**
 * Perform one workflow interaction and wait for the fact it should produce,
 * repeating it **only** when repeating is provably safe.
 *
 * Two things can swallow a workflow click, and this run measured both:
 *
 *   * the page rebuilds itself underneath the pointer — every accepted action
 *     publishes two `cases` rows, and each one makes the other window re-read
 *     and re-render — so the press can land on a control that no longer exists
 *     and nothing happens at all;
 *   * the action carries the revision this window last read, and the other
 *     window's work can move it first, so the server refuses it as a conflict
 *     and the screen says to check it and try again.
 *
 * The second is repeated on sight, because a conflict is proof nothing was
 * applied. The first is repeated only when `safeToRepeat()` says the server
 * state has not moved — so a slow-but-accepted action is never sent twice.
 * Anything else is reported, with what the page said since the press.
 *
 * `refusals` carries, for each conflict, both what the window *recorded* and
 * what it is **still showing** at the moment the retry is about to go out —
 * which is several seconds and at least one background change after the
 * refusal, because the wait above ran out first. A refusal the person has not
 * acted on has to survive that (Ruling R65); the caller asserts it.
 */
export async function pressUntilEffect(
  page,
  { press, ready, arg, what, tries = 3, safeToRepeat },
) {
  let conflicts = 0;
  let lost = 0;
  const refusals = [];
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    const before = (await readAlerts(page))?.length ?? 0;
    await press();
    try {
      await page.waitForFunction(ready, arg, { timeout: RENDER_MS, polling: 150 });
      return { attempts: attempt, conflicts, lost, refusals };
    } catch (error) {
      const since = ((await readAlerts(page)) ?? []).slice(before);
      if (since.some((line) => STALE_REVISION.test(line))) {
        conflicts += 1;
        refusals.push({
          recorded: since.find((line) => STALE_REVISION.test(line)),
          onScreen: await alertText(page),
        });
        continue;
      }
      const repeatable = since.length === 0 && (await safeToRepeat?.());
      if (!repeatable)
        throw new Error(
          redactAddresses(
            `The press never produced ${what} (attempt ${attempt} of ${tries}). ` +
              `What it said since the press: ${JSON.stringify(since)}. `,
          ) + `The screen read: ${await screenText(page)}`,
          { cause: error },
        );
      lost += 1;
    }
  }
  throw new Error(
    `${what} never arrived: ${conflicts} stale-revision refusals and ${lost} presses that reached nothing, in ${tries} attempts.`,
  );
}

/** `pressUntilEffect` for a plain workflow button. */
export const clickCaseActionUntil = (page, type, options) =>
  pressUntilEffect(page, {
    press: () => clickCaseAction(page, type, { attributes: options.attributes ?? "" }),
    ...options,
  });

/** `pressUntilEffect` for a staff form: a repeat re-fills before it re-sends. */
export const submitCaseFormUntil = (page, type, fields, options) =>
  pressUntilEffect(page, {
    press: () =>
      submitCaseForm(page, type, fields, { attributes: options.attributes ?? "" }),
    ...options,
  });

/**
 * The control one visible field label names, resolved through the `for`
 * association the label carries — not by accessible-name matching, which reads
 * a wrapped `<select>`'s own options as part of the label's text and so never
 * matches a select's caption. A label with no control is a defect report, with
 * the labels the form did offer and what it read.
 */
export async function fieldByLabel(form, label, what = "this") {
  const id = await form.evaluate(
    (element, wanted) =>
      [...element.querySelectorAll("label")]
        .find((entry) => entry.querySelector("span")?.textContent.trim() === wanted)
        ?.getAttribute("for") ?? null,
    label,
  );
  if (!id)
    throw new Error(
      redactAddresses(
        `The ${what} form has no field labelled ${JSON.stringify(label)}. ` +
          `Its labels were ${JSON.stringify(await form.locator("label").allInnerTexts())}. ` +
          `It read: ${(await form.innerText()).replace(/\s+/g, " ").slice(0, 300)}`,
      ),
    );
  return form.locator(`[id="${id}"]`);
}

/**
 * Fill one staff form and press its own submit button. The form is found by
 * the action its submit control carries, so the fields filled are always the
 * ones that build that action's payload.
 */
export async function submitCaseForm(page, type, fields = {}, { attributes = "" } = {}) {
  const selector = `button[type="submit"][data-case-action="${type}"]${attributes}`;
  const form = page.locator(`form:has(${selector})`).first();
  await form.waitFor({ state: "visible", timeout: RENDER_MS });
  // Still before the boxes are filled — a rebuild would empty a select, whose
  // value the wiring layer does not keep — and still again before the press.
  await waitForQuiet(page);
  for (const [label, value] of Object.entries(fields)) {
    const field = await fieldByLabel(form, label, type);
    await field.waitFor({ state: "visible", timeout: RENDER_MS });
    const tag = await field.evaluate((element) => element.tagName);
    if (tag === "SELECT") await field.selectOption(value, { timeout: CLICK_MS });
    else await field.fill(value, { timeout: CLICK_MS });
  }
  await waitForQuiet(page);
  await form.locator(selector).click({ timeout: CLICK_MS });
}

/**
 * Tick a checkbox that re-renders the page around itself, and wait for the
 * rebuilt control to come back ticked. `.check()` cannot be used: the element
 * it clicked is detached by the re-render before it can confirm the state.
 */
export async function tickBox(page, id) {
  await waitForQuiet(page);
  await page.locator(`#${id}`).click({ timeout: CLICK_MS });
  await waitFor(
    page,
    `the checkbox #${id} to come back ticked`,
    (selector) => document.querySelector(selector)?.checked === true,
    `#${id}`,
    RENDER_MS,
  );
}

/**
 * Focus a control and press a key until the page answers, inside one bound.
 *
 * A re-render arriving between the focus and the key press takes the keyboard
 * with it — `describeFocus` can only describe a control with an id or a name,
 * and a `data-action` button has neither — so a single attempt is a race with
 * whatever the subscription happens to deliver. Each attempt is its own short
 * condition wait, and the number of attempts is returned, because that count
 * *is* the measurement of how often the keyboard was dropped.
 */
export async function pressUntil(page, locator, key, ready, what, timeout = RENDER_MS) {
  const deadline = Date.now() + timeout;
  let attempts = 0;
  let last = null;
  while (Date.now() < deadline) {
    attempts += 1;
    await locator.focus();
    await page.keyboard.press(key);
    try {
      await page.waitForFunction(ready, undefined, { timeout: 1_000, polling: 100 });
      return attempts;
    } catch (error) {
      last = error;
    }
  }
  throw new Error(
    `Pressing ${key} never produced ${what} in ${timeout}ms (${attempts} attempts). The screen read: ${await screenText(page)}`,
    { cause: last },
  );
}

/** The first thing this page is announcing as a problem, if anything. */
export const alertText = async (page) =>
  redactAddresses(
    await page.evaluate(() => {
      const alert = document.querySelector('[role="alert"]');
      return alert
        ? alert.innerText
            .replace(/\s+/g, " ")
            .trim()
            .replace(/[^\s<>"'\\]+@[^\s<>"'\\]+/g, "<address>")
        : null;
    }),
  );

/**
 * Record every alert this page ever shows, including the ones that are gone
 * again before anybody looks.
 *
 * The controller clears `state.error` on its next successful re-read, so a
 * refusal can be erased by an unrelated change arriving a moment later. Reading
 * the screen at the end would therefore under-report what the person saw — and
 * what they did not get time to read. This observes; it changes nothing.
 * Re-install it after a reload, which throws the record away with the document.
 */
export const watchAlerts = (page) =>
  page.evaluate(() => {
    if (window.__vitallyAlerts) return;
    window.__vitallyAlerts = [];
    const app = document.querySelector("#app");
    if (!app) return;
    // Recorded without the one thing a screen can echo back: whatever address
    // somebody typed into the access form. It never leaves the page.
    const safe = (value) =>
      String(value ?? "").replace(/[^\s<>"'\\]+@[^\s<>"'\\]+/g, "<address>");
    const sweep = () => {
      const seen = [];
      for (const node of document.querySelectorAll('[role="alert"]'))
        seen.push(safe(node.innerText.replace(/\s+/g, " ").trim()));
      // The toast is where a refused click says what went wrong, and it is a
      // status rather than an alert, so it needs its own look.
      const toast = document.querySelector("#toast")?.textContent.trim();
      if (toast) seen.push(`toast: ${safe(toast)}`);
      for (const text of seen)
        if (text && !window.__vitallyAlerts.includes(text))
          window.__vitallyAlerts.push(text);
    };
    new MutationObserver(sweep).observe(app, { childList: true, subtree: true });
    sweep();
  });

export const readAlerts = async (page) =>
  (await page.evaluate(() => window.__vitallyAlerts ?? null))?.map(
    redactAddresses,
  ) ?? null;

// ---------------------------------------------------------------------------
// Staff navigation
// ---------------------------------------------------------------------------

export const WORK_BOARD_HEADING = "Work board";
export const OFFICE_BOARD_HEADING = "Office work";

/** Act as one volunteer in this window, and wait for the screen to agree. */
export async function choosePersona(page, personId) {
  await page
    .locator(`[data-action="select-person"][data-person-id="${personId}"]`)
    .click({ timeout: CLICK_MS });
  await waitFor(
    page,
    `the persona ${personId} to be the one this window acts as`,
    (id) =>
      document
        .querySelector(`[data-action="select-person"][data-person-id="${id}"]`)
        ?.getAttribute("aria-pressed") === "true",
    personId,
    RENDER_MS,
  );
}

/** Which persona this window is acting as, read from the panel itself. */
export const readPersona = (page) =>
  page.evaluate(
    () =>
      document
        .querySelector('[data-action="select-person"][aria-pressed="true"]')
        ?.getAttribute("data-person-id") ?? null,
  );

export const readFixtureIndicator = (page) =>
  page.locator('[data-role="fixture-indicator"]').innerText();

/** Open one case from whichever board is on screen, by its reference. */
export async function openCaseByReference(page, reference) {
  await page
    .locator("button.board-reference")
    .filter({ hasText: reference })
    .first()
    .click({ timeout: CLICK_MS });
  await waitForCaseWorkspace(page, reference);
}

export const waitForCaseWorkspace = (page, reference, timeout = ARRIVAL_MS) =>
  waitFor(
    page,
    `the case workspace for ${reference}`,
    (wanted) =>
      document.querySelector("#case-title")?.textContent.trim() === wanted,
    reference,
    timeout,
  );

export async function openBoard(page, heading = WORK_BOARD_HEADING) {
  await clickAction(page, "open-board");
  await waitForText(page, heading, RENDER_MS);
}

/** How many cases the board says it is showing, and out of how many. */
export async function readBoardTotals(page) {
  const text = await page.locator(".staff-board .section-head").first().innerText();
  const match = /Showing (\d+) of (\d+)/.exec(text);
  return match
    ? { shown: Number(match[1]), total: Number(match[2]) }
    : { shown: null, total: null, text };
}

// ---------------------------------------------------------------------------
// The presenter's own controls
// ---------------------------------------------------------------------------

/** Rebuild the sample cases through the panel, dialog and all. */
export async function resetSampleCases(page, { expectedSamples = 6 } = {}) {
  await clickAction(page, "open-reset-fixtures");
  await clickAction(page, "confirm-reset-fixtures");
  await waitFor(
    page,
    "the reset confirmation to close",
    () => document.querySelector(".modal") === null,
    undefined,
    ARRIVAL_MS,
  );
  await waitFor(
    page,
    `the panel to report ${expectedSamples} sample cases`,
    (count) =>
      new RegExp(`sample set \\d+ · ${count} sample cases?`).test(
        document.querySelector('[data-role="fixture-indicator"]')?.textContent ?? "",
      ),
    expectedSamples,
    ARRIVAL_MS,
  );
  return await readFixtureIndicator(page);
}

// ---------------------------------------------------------------------------
// Window-local state
// ---------------------------------------------------------------------------

/** What this window remembers for this user: the record the app itself wrote. */
export const readWindowState = (page, userId) =>
  page.evaluate((key) => {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return "<unreadable>";
    }
  }, sessionStateKey(userId));

/** The client's own view of where it is, for a before/after comparison. */
export async function readClientPlace(page, userId) {
  const stored = await readWindowState(page, userId);
  const visible = await page.evaluate(() => ({
    heading: document.querySelector("#main h1")?.textContent.trim() ?? null,
    reference:
      document.querySelector(".id-pill strong,.application-meta span")?.textContent.trim() ??
      null,
    confirmed: document.querySelector("#field-confirmed")?.checked ?? null,
  }));
  return { stored, visible };
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export const screenshotDir = (root) => path.join(root, "artifacts", "browser");

/**
 * One screen at both evidence widths. The narrow one also measures horizontal
 * overflow, because that is the width the measurement is about.
 *
 * Everything on these screens is fictional: the sample answers are invented,
 * the demo withholds the address line, and no access screen is ever captured —
 * that is the only screen carrying an email address.
 */
export async function capture(page, dir, name) {
  await mkdir(dir, { recursive: true });
  const files = [];
  let overflow = null;
  for (const width of SCREENSHOT_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const file = path.join(dir, `${name}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    files.push(path.relative(path.join(dir, "..", ".."), file));
    if (width === MOBILE_WIDTH) overflow = await measureOverflow(page);
  }
  await page.setViewportSize(DESKTOP);
  return { files, overflow };
}

export const measureOverflow = (page) =>
  page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

/** Every console error a page has produced must be one we expected. */
export function assertConsoleQuiet(surface, { name, allow = [] }) {
  // Both lists are printed by a failing assertion, so both are masked first.
  assert.deepEqual(
    surface.pageErrors.map(redactAddresses),
    [],
    `${name}: the application threw in the page`,
  );
  const unexplained = surface.errors
    .filter((line) => !allow.some((pattern) => pattern.test(line)))
    .map(redactAddresses);
  assert.deepEqual(unexplained, [], `${name}: unexplained console errors`);
  return surface.errors.length;
}

// A refused request is logged by the engine itself, and several checks here
// refuse on purpose: a denied action (403), a stale revision or a refused
// payload (400/404/409), and everything a deliberately offline page cannot
// reach. Nothing else is allowed through.
export const REFUSAL_LINES = Object.freeze([
  /\b(400|401|403|404|409)\b/,
  /net::ERR_INTERNET_DISCONNECTED/i,
  /NetworkError|Failed to fetch|Load failed/i,
  /WebSocket/i,
  /Failed to load resource/i,
  // Firefox reports a request that never reached the server this way. It is
  // deliberately narrow: a real CORS *policy* failure names the missing header
  // instead, and would not be excused here.
  /Cross-Origin Request Blocked[\s\S]*CORS request did not succeed/,
]);
