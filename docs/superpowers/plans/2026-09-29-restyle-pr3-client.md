# Restyle PR 3: the client screens

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every client screen in the new client frame, on today's data. The screens are sign-in (email, then code), My applications, the Application ID reference card, today's 4-step intake and the progress page.
- The frame is a top bar with the logo, an English-only language switcher, **Need help?**, **Save & exit** (intake only) and **Sign out**.
- The office contact card appears wherever the client is pointed to the office.
- Intake text is near-black, and every control is at least 44px.

**Architecture:** Restyle in place.
- `client-views.mjs` keeps its screens and data flow.
- A new `clientHeader()` in `views.mjs` replaces the old site header.
- A `.client-shell` wrapper around the client body scopes the client-only rules: near-black ink and the intake type sizes.
- One `officeContact()` helper in `ui.mjs` renders the office phone and email everywhere.
- CSS moves to the `--vt-*` tokens; rules that no longer have a user are deleted.
- No database change, and no new question, answer key or step. The new 9-step intake and the senior wording are roadmap part 4.

**Tech Stack:**
- Vanilla ES modules rendering HTML strings, and hand-written `src/styles.css`.
- `node:test` for unit tests.
- Playwright browser suites, and database suites against the repo's local Supabase test stack.

**Spec:** `docs/superpowers/specs/2026-09-28-redesign-roadmap-and-restyle-design.md`, sections 4 (shared elements), 7 (PR 3) and 9 (testing, acceptance, accessibility).

**Design references.** They show the new 9-step intake; apply their frame, rail, card and type treatment to today's 4 steps:
- `.stitch/designs/intake-step1-v2.html` and `intake-step2-v2.html`
- screenshots `docs/design/screens/intake-step1-v2-general.png`, `intake-step2-v2-general.png`, `intake-step4-v2-general.png`, `intake-step6-v2-general.png`

**"Before" captures for comparison:** `.stitch/captures/client-intake-start.png` and `client-intake-1.png` … `client-intake-4.png`. There is no before-capture of sign-in or applications.

## Global Constraints

- Part 1 changes no database schema, and this PR adds no intake question, answer key or step.
- `npm test`, `npm run test:database`, `npm run test:auth-browser` and `npm run test:browser` pass.
  - The last three run against the repo's local test stack, the Docker Supabase `vitally-task2.M5anE7XP` on port 54321 (`.env.test`). Make sure it is running: `docker start $(docker ps -aq --filter name=vitally-task2)`.
  - Never run `npx supabase start` from the repository root.
- Shell PATH: prefix node, npm and docker commands with `PATH=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`. Without this the shell may use Node 18, and `test:database` fails with `TARGET_REJECTED` if Docker isn't on PATH.
- Keep the hooks the browser and auth-browser suites use; don't rename them.
  - Labels: "Email address", "Verification code", "City of residence", "ZIP code", "Application ID".
  - Button names: "Send verification code", "Verify and continue", "Find", "Continue", "Sign out".
  - Actions: `open-applications` (the first one on the page must be visible), `continue-intake`, `fill-fictional`, `start-application`, `save-exit`, `sign-out`, `reconcile-mine`, `resend-code`, `retry-action`, `open-help`.
  - Other hooks:
    - `#code-form p.error[role='alert']`
    - `.application-row`
    - `.reference-card strong`
    - `.conflict-panel`
    - `#field-confirmed`
    - `.page-intro .overline` reading `STEP n OF 4`
    - the heading "My applications"
    - the case action `RESPOND_DOCUMENT`
  - Visible texts: "Sign in with your email", "Your visit", "Check your answers", "ACTION NEEDED", "Someone else changed this application", "Not saved.", "No connection to the server.", "We could not find that Application ID", "No applications yet", "Saved", "A volunteer spoke with you about the next service step."
  - `tests/client-views.test.mjs` "the brand is ViTally, attributed to PCDC, for tax year 2025": the page still contains "ViTally", "PCDC" and "2025", and a `sign-out` action.
- Office contact, exactly: phone **(215) 922-6156** (`tel:+12159226156`), email **vita@chinatown-pcdc.org** (`mailto:`).
- Colors come from the `--vt-*` tokens. Add no new hex values in rules this plan writes; white `#fff` is allowed.
- Client controls are at least `var(--vt-tap)` (44px), except inline text links.
- Intake and client text use `--vt-intake-ink` (#1b1b1f), and hints use `--vt-intake-hint`.
- Any rule that gives an element with a `hidden` attribute a `display` must be paired with `[hidden] { display: none; }`. That was PR 1's bug.
- Only fictional data. The logo is the unchanged `src/pcdc-logo.png`, referenced by the relative path `src/pcdc-logo.png`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Out of scope, and why:**
- **The senior-version switch:** there is no senior wording for today's questions (part 4).
- **Real translation:** the switcher shows only English as working (part 4).
- **The mobile intake layout:** after the MVP (D12). The screens must still not scroll sideways at 390px, which the browser suite already asserts.
- **Staff and office screens:** PR 1, PR 2 and PR 4.

---

## File map

| File | Change |
|---|---|
| `src/ui.mjs` | `OFFICE_CONTACT` and `officeContact()` |
| `src/views.mjs` | `clientHeader(state)` replaces `header(state)`; `page()` wraps client bodies in `.client-shell`; the help dialog shows the office contact |
| `src/client-views.mjs` | Contact card on sign-in, intake rail and progress; Save & exit moves to the top bar; `aria-current="step"` on the active step |
| `src/styles.css` | Client bar, language switch, office contact, client shell ink, rail, question cards, save chip, conflict panel, sign-in, applications, reference card, progress; old header rules deleted |
| Tests | `tests/ui.test.mjs`, `tests/shell.test.mjs`, `tests/client-views.test.mjs`; `tests/browser.mjs` only if a hook moved |

---

### Task 1: Office contact, client top bar, help dialog and client shell

**Files:**
- Modify: `src/ui.mjs` (add after `nextTabIndex`)
- Modify: `src/views.mjs`: replace `header`; `page`; the `help` branch of `dialog`
- Test: `tests/ui.test.mjs`, `tests/shell.test.mjs`

**Interfaces:**
- Produces:
  - `OFFICE_CONTACT`: a frozen `{ phone, tel, email }`.
  - `officeContact()`: returns `div.office-contact` holding two links.
  - `clientHeader(state)`: returns `header.client-bar`.
  - `page(state, body)`: renders `clientHeader` and wraps `body` in `div.client-shell` for anyone who isn't a presenter.
  - `languageSwitch()`: exported from `views.mjs` for tests.

- [ ] **Step 1: Failing tests.** Append to `tests/ui.test.mjs`, adding `OFFICE_CONTACT, officeContact` to its import:

```js
test("the office contact is the one real phone number and address, as links", () => {
  assert.deepEqual({ ...OFFICE_CONTACT }, {
    phone: "(215) 922-6156",
    tel: "+12159226156",
    email: "vita@chinatown-pcdc.org",
  });
  const html = officeContact();
  assert.match(html, /<div class="office-contact">/);
  assert.match(html, /<a href="tel:\+12159226156"[^>]*>[\s\S]*\(215\) 922-6156<\/a>/);
  assert.match(html, /<a href="mailto:vita@chinatown-pcdc\.org"[^>]*>[\s\S]*vita@chinatown-pcdc\.org<\/a>/);
});
```

In `tests/shell.test.mjs`, add `clientHeader, languageSwitch` to the import from `../src/views.mjs`. Then replace the two `site-header` assertions in the test `"presenters get the sidebar instead of the site header; clients keep the header"` with:

```js
  const presenter = page({ principal: { access: "presenter" }, connection: "online" }, "<main></main>");
  assert.doesNotMatch(presenter, /class="client-bar"/);
  assert.doesNotMatch(presenter, /class="client-shell"/);
  const client = page({ principal: { access: "applicant" }, connection: "online", screen: "applications" }, "<main></main>");
  assert.match(client, /<header class="client-bar">/);
  assert.match(client, /<div class="client-shell"><main><\/main><\/div>/);
```

Rename that test to `"presenters get the sidebar; clients get the client top bar and shell"`. Then append:

```js
test("the client top bar: logo home, language, help, save on intake, sign out", () => {
  const signedIn = { principal: { access: "applicant" }, screen: "applications" };
  const html = clientHeader(signedIn);
  assert.match(html, /<button class="client-brand" data-action="open-applications" aria-label="ViTally home">/);
  assert.match(html, /<img src="src\/pcdc-logo\.png" alt="PCDC"/);
  assert.match(html, /data-action="open-help"/);
  assert.match(html, /data-action="sign-out"[^>]*>[\s\S]*Sign out/);
  assert.doesNotMatch(html, /data-action="save-exit"/, "Save & exit belongs to the intake only");
  const intake = clientHeader({ ...signedIn, screen: "intake", savedCase: { stage: "draft" } });
  assert.match(intake, /data-action="save-exit"[^>]*>Save &amp; exit/);
  const submitted = clientHeader({ ...signedIn, screen: "intake", savedCase: { stage: "received" } });
  assert.doesNotMatch(submitted, /data-action="save-exit"/);
  const signedOut = clientHeader({ principal: null, screen: "access" });
  assert.doesNotMatch(signedOut, /data-action="sign-out"/);
});

test("the language switch offers English and says Chinese is coming", () => {
  const html = languageSwitch();
  assert.match(html, /<div class="language-switch" role="group" aria-label="Language">/);
  assert.match(html, /<button type="button" class="lang current" lang="en" aria-pressed="true">English<\/button>/);
  assert.match(html, /lang="zh-Hans" disabled[^>]*>简体中文/);
  assert.match(html, /lang="zh-Hant" disabled[^>]*>繁體中文/);
  assert.match(html, /Chinese is coming soon\./);
  assert.doesNotMatch(html, /data-action=/, "the switch does nothing yet");
});

test("the help dialog gives the office phone and email", () => {
  const html = page({ principal: { access: "applicant" }, connection: "online", screen: "applications", dialog: "help" }, "<main></main>");
  assert.match(html, /href="tel:\+12159226156"/);
  assert.match(html, /href="mailto:vita@chinatown-pcdc\.org"/);
});
```

- [ ] **Step 2: Run and watch them fail.**

Run: `node --test tests/ui.test.mjs tests/shell.test.mjs`
Expected: FAIL. The new exports are missing, and the old header still renders.

- [ ] **Step 3: Implement.** In `src/ui.mjs`, after `nextTabIndex`:

```js
// The PCDC office's own contact details, given everywhere a client is told to
// reach the office. Links, so a phone can call and a laptop can write.
export const OFFICE_CONTACT = Object.freeze({
  phone: "(215) 922-6156",
  tel: "+12159226156",
  email: "vita@chinatown-pcdc.org",
});

export const officeContact = () =>
  `<div class="office-contact"><a href="tel:${OFFICE_CONTACT.tel}">${icon("phone")} ${OFFICE_CONTACT.phone}</a><a href="mailto:${OFFICE_CONTACT.email}">${icon("mail")} ${OFFICE_CONTACT.email}</a></div>`;
```

In `src/views.mjs`:
1. Add `officeContact` to the import from `./ui.mjs`.
2. Replace `export function header(state) { … }` with:

```js
// The switcher shows what the client form will offer. Only English works until
// the intake is translated (roadmap part 4), so the others are visibly off.
export function languageSwitch() {
  return `<div class="language-switch" role="group" aria-label="Language"><button type="button" class="lang current" lang="en" aria-pressed="true">English</button><button type="button" class="lang" lang="zh-Hans" disabled title="Coming soon">简体中文</button><button type="button" class="lang" lang="zh-Hant" disabled title="Coming soon">繁體中文</button><span class="sr-only">Chinese is coming soon.</span></div>`;
}

// The client frame's top bar (spec section 7): the logo takes you home, then
// the language, help, Save & exit while a draft is open, and sign out.
export function clientHeader(state) {
  const onDraft = state?.screen === "intake" && state?.savedCase?.stage === "draft";
  return `<header class="client-bar"><button class="client-brand" data-action="open-applications" aria-label="ViTally home"><img src="src/pcdc-logo.png" alt="PCDC" width="32" height="32"><span class="client-wordmark">ViTally<span class="brand-dot">.</span></span></button><div class="client-bar-actions">${languageSwitch()}${button(
    `${icon("help")} Need help?`,
    "open-help",
    "text",
  )}${when(onDraft, button("Save &amp; exit", "save-exit", "secondary"))}${when(
    state?.principal,
    button(`${icon("signout")} Sign out`, "sign-out", "text"),
  )}</div></header>`;
}
```

3. Replace `page`:

```js
export function page(state, body) {
  // Presenters work in the staff frame, whose sidebar carries the brand, help
  // and sign-out. Everyone else gets the client frame.
  const presenter = state?.principal?.access === "presenter";
  const top = presenter ? "" : clientHeader(state);
  const main = presenter ? body : `<div class="client-shell">${body}</div>`;
  return `<a class="skip" href="#main">Skip to content</a>${top}${connectionNotice(state)}${noticeBanner(state)}${problemBanner(state)}${main}${footer()}${dialog(state)}<div class="toast" id="toast" role="status" aria-live="polite"></div>`;
}
```

4. In `dialog(state)`'s `help` branch, replace the `contact-option` block (the one saying "Address and opening hours are shown in the live service.") with:
   ```js
   <div class="contact-option">${icon("home")}<div><strong>Call or email the PCDC office</strong>${officeContact()}</div></div>
   ```
   Keep the rest of the help body.

5. Check that nothing else still calls `header(`:
   ```bash
   grep -n "header(" src/*.mjs | grep -v -i "caseHeader\|clientHeader"
   ```
   Expected: nothing.

- [ ] **Step 4: Run all unit tests.**

Run: `npm test`
Expected: PASS. Fix any other test that pinned the old header's markup the same way as Step 1, and list it in your report.

- [ ] **Step 5: Commit.**

```bash
git add src/ui.mjs src/views.mjs tests/ui.test.mjs tests/shell.test.mjs
git commit -m "Give client screens the new top bar, office contact and client shell

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Client screen markup: contact card, Save & exit, step rail

**Files:**
- Modify: `src/client-views.mjs`: `troubleshooting`, `intakeScreen`, `progressScreen`
- Test: `tests/client-views.test.mjs`

**Interfaces:**
- Consumes: `officeContact()` (Task 1). The top bar now carries `save-exit` on a draft (Task 1).
- Produces:
  - `aside.intake-sidebar .sidebar-help` containing `div.office-contact`.
  - The active step `li` carries `aria-current="step"`.
  - The intake form's `.form-actions` no longer has a Save and exit button.
  - The progress page's `.help-card` and the sign-in help note contain `div.office-contact`.

- [ ] **Step 1: Failing tests.** Append to `tests/client-views.test.mjs`, using the fixtures it already has. Read the file's top to find the state builder, `baseState()`, and a draft-case helper. If there's no draft-case helper, build `{ ...baseState(), screen: "intake", savedCase: { id: "c1", reference: "VT-AAAA-AAAA", stage: "draft", answers: {} }, draftAnswers: {}, formStep: 1 }`.

```js
test("the intake rail marks the current step and gives the office contact", () => {
  const state = { ...baseState(), screen: "intake", savedCase: { id: "c1", reference: "VT-AAAA-AAAA", stage: "draft", answers: {}, revision: 1 }, draftAnswers: {}, formStep: 1 };
  const html = intakeScreen(state);
  assert.match(html, /<li class="active" aria-current="step">/);
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
  assert.match(html, /class="sidebar-help"[\s\S]*class="office-contact"[\s\S]*tel:\+12159226156/);
  // Save & exit lives in the top bar now; the form keeps Back and Continue.
  assert.doesNotMatch(html, /data-action="save-exit"/);
  assert.match(html, /STEP 2 OF 4/);
});

test("sign-in and progress point to the office by phone and email", () => {
  assert.match(accessScreen({ ...baseState(), authStep: "email" }), /class="office-contact"/);
  const progress = progressScreen({ ...baseState(), screen: "progress", savedCase: { id: "c1", reference: "VT-AAAA-AAAA", stage: "received", answers: { firstName: "Mei" }, requests: [], documents: [], history: [] } });
  assert.match(progress, /class="help-card"[\s\S]*class="office-contact"/);
});
```

Add `accessScreen, intakeScreen, progressScreen` to the file's import if they aren't already imported.

- [ ] **Step 2: Run and watch them fail.**

Run: `node --test tests/client-views.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `src/client-views.mjs`:
1. Add `officeContact` to the import from `./ui.mjs`.
2. In `troubleshooting`, replace `<p>Still stuck? A volunteer at the PCDC office can help in person.</p>` with:
   ```html
   <p>Still stuck? Call or email the PCDC office.</p>${officeContact()}
   ```
   Keep the `open-help` button.
3. In `intakeScreen`:
   - In the step list, give the active `li` `aria-current="step"`. The class list stays `active`, and the attribute follows it: `` `<li class="${…}"${index === state.formStep ? ' aria-current="step"' : ""}>` ``.
   - In the `sidebar-help` block, replace `<p>Our volunteers can help you at the PCDC office.</p>${button("Contact the office", "open-help", "inline")}` with:
     ```html
     <p>Our volunteers can help at the PCDC office, or by phone.</p>${officeContact()}
     ```
   - In `.form-actions`, remove `${button("Save and exit", "save-exit", "text")}`; Task 1's top bar has it now. Keep the surrounding `<div>` and the Back button.
4. In `progressScreen`'s `.help-card`, add `${officeContact()}` after its `<p>`, and keep its `Contact the office` button.

- [ ] **Step 4: Run all unit tests.**

Run: `npm test`
Expected: PASS. If a pre-existing test asserted the removed "Save and exit" button or the old sidebar text, update it to the new place (the top bar, or the contact card). List each change in your report.

- [ ] **Step 5: Commit.**

```bash
git add src/client-views.mjs tests/client-views.test.mjs
git commit -m "Point client screens to the office by phone and email, and move Save & exit to the top bar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Client styles

**Files:**
- Modify: `src/styles.css`
- Test: `tests/shell.test.mjs` (stylesheet checks)

**Interfaces:**
- Consumes: the class names from Tasks 1–2 and the existing client classes:
  - access: `.access-panel`, `.support-note`, `.center-icon`, `.page-intro`, `.footnote`
  - applications: `.lookup-form`, `.application-list`, `.application-row`, `.start-row`
  - reference card: `.reference-card`, `.card-tools`
  - intake: `.workspace`, `.intake-sidebar`, `.sidebar-top`, `.step-list li.active|complete`, `.sidebar-help`, `.form-workspace`, `.application-meta`, `.save-chip.saving|saved|failed|unsaved`, `.fiction-tools`, `.service-options`, `.service-card.selected`, `.form-grid(.triple)`, `.question`, `.radio-row`, `.radio-card.selected`, `.info-note`, `.notice.amber`, `.review-block`, `.checkbox-row`, `.form-actions`, `.conflict-panel`, `.conflict-table`, `.conflict-choices`
  - progress: `.dashboard`, `.dashboard-intro`, `.id-pill`, `.progress-grid`, `.status-panel`, `.progress-steps > div.done|current`, `.action-card`, `.upload-zone`, `.next-card`, `.document-row`, `.review-panel`, `.timeline`, `.right-column`, `.summary-panel`, `.help-card`
  - dialogs: `.modal .contact-option`

- [ ] **Step 1: Failing stylesheet test.** Append to `tests/shell.test.mjs`. It already imports `readFileSync` and `fileURLToPath`.

```js
test("the old site header's styles are gone and the client shell sets its ink", () => {
  const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
  assert.doesNotMatch(css, /\.site-header\b/);
  assert.doesNotMatch(css, /\.header-divider\b/);
  assert.match(css, /\.client-shell\s*\{[^}]*color:\s*var\(--vt-intake-ink\)/);
  assert.match(css, /\.client-bar\s*\{/);
  assert.match(css, /\.office-contact\s*\{/);
});
```

- [ ] **Step 2: Run and watch it fail.**

Run: `node --test tests/shell.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Delete the old header rules.** Delete every rule whose selector names only `.site-header`, `.brand`, `.brand-mark`, `.season`, `.who` or `.header-divider`, including inside `@media` blocks.
  - **Keep `.brand-dot`.** The staff sidebar wordmark and the client wordmark both use it.
  - **Check first** that each class is gone from the markup:
    ```bash
    grep -rn 'class="[^"]*\b\(site-header\|brand\|brand-mark\|season\|who\|header-divider\)\b' src/*.mjs
    ```
    Expected: no hits, except `brand-dot`.

- [ ] **Step 4: Append the client frame block** at the end of `src/styles.css`:

```css
/* ---- Client frame (restyle PR 3) ---- */
.client-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
  flex-wrap: wrap;
  padding: 10px 28px;
  background: var(--vt-surface);
  border-bottom: 1px solid var(--vt-line);
}
.client-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: var(--vt-tap);
  background: none;
  border: 0;
  padding: 0;
  color: var(--vt-intake-ink);
}
.client-wordmark {
  font-weight: 700;
  font-size: 19px;
}
.client-bar-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.language-switch {
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--vt-line);
  border-radius: var(--vt-radius-sm);
  background: var(--vt-background);
}
.language-switch .lang {
  min-height: 38px;
  padding: 4px 12px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--vt-intake-hint);
  font-size: 14px;
}
.language-switch .lang.current {
  background: var(--vt-surface);
  color: var(--vt-primary);
  font-weight: 700;
  box-shadow: 0 1px 2px rgb(42 39 69 / 0.12);
}
.language-switch .lang:disabled {
  opacity: 0.55;
}
.client-shell {
  color: var(--vt-intake-ink);
  background: var(--vt-background);
}
.client-shell .field-note,
.client-shell .page-intro p,
.client-shell small {
  color: var(--vt-intake-hint);
}
.office-contact {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 10px 0;
}
.office-contact a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: var(--vt-tap);
  color: var(--vt-intake-ink);
  font-weight: 600;
  text-decoration: none;
  word-break: break-all;
}
.office-contact a:hover {
  color: var(--vt-primary);
}
.office-contact .icon {
  color: var(--vt-primary);
}
@media (max-width: 800px) {
  .client-bar {
    padding: 10px 16px;
  }
}
```

- [ ] **Step 5: Restyle the client rules in place, with tokens.** Work through every client selector listed under **Interfaces** and replace its colors, borders, radii and focus colors with `--vt-*` tokens, so the screens match the design references.
  - **Keep** each rule's layout (grid, flex, widths), unless the design reference needs a change.
  - **Colors:**
    - primary actions and selected states → `--vt-primary`, `--vt-primary-soft`, `--vt-primary-line`
    - text → `--vt-intake-ink`, and hints → `--vt-intake-hint`
    - card borders → `--vt-line`, and card radius → `--vt-radius`
    - `done` and "Saved" → `--vt-progress`
    - `.notice.amber` and "Unsaved" → the `--vt-stage-amend*` pair
    - `.save-chip.failed` and errors → the `--vt-stage-stopped*` pair
  - **Intake rail:** match the design, meaning numbered circles joined by a line, the active step in `--vt-primary` and finished steps in `--vt-progress`.
  - **Questions:** `.question` fieldsets become white cards with a `--vt-line` border and `--vt-radius`. `.radio-card` options are at least `var(--vt-tap)` tall, and `.radio-card.selected` gets a `--vt-primary` border on `--vt-primary-soft`.
  - **Service cards:** `.service-card.selected` follows the same selected treatment.
  - **Progress track:** `.progress-steps` done steps use `--vt-progress` and the current step uses `--vt-primary`.

  When you're done, find and tokenize any hex value left in a client rule:

  ```bash
  grep -n '#[0-9a-fA-F]\{3,8\}' src/styles.css
  ```

  - A rule shared with staff screens (`.panel`, `.btn`, `.field`, `.badge`, `.notice`, `.timeline`, `.detail-row`, `.modal`) may only change inside `.client-shell` or through a token it already reads. Don't change how staff screens look.
  - Add no new hex values; white `#fff` is allowed.

- [ ] **Step 6: Visual check with a fixture harness.**
  - **What to render:** each client screen inside `page()` from `src/views.mjs`, with `src/styles.css` linked by absolute path and the logo `src` rewritten to an absolute path. The pages are:
    - access (email step, and the code step with a countdown and an auth error)
    - applications (a list, empty, and a missed lookup)
    - the reference card
    - intake steps 0–3 (step 1 once with the "unsupported" notice, and once with a `conflict`)
    - progress (received, with an open request and a document; and reviewing)
    - the help dialog open
  - **Where the harness goes:** write it as a script under `.superpowers/`, which is git-ignored.
  - **Screenshots:** take them at 1440×900, 1024×800 and 390×844 with Puppeteer, from `/private/tmp/claude-501/-Users-jinyuyang-VITA-Management-System-Demo/7080c849-06b7-44fd-86dd-2744fba82067/scratchpad/capture/node_modules` with `executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`.
  - **Check each page:**
    - `document.documentElement.scrollWidth === innerWidth`
    - every `button`, `a[href]`, `input:not([type=checkbox]):not([type=radio])` and `select` in `.client-shell` and `.client-bar` has a `getBoundingClientRect().height` of at least 44, except inline text links inside paragraphs; list any that aren't
    - the computed `color` of `.page-intro h1` and of a `.question legend` is `rgb(27, 27, 31)`
  - **Compare** against the design references and the "before" captures. Fix gaps within this task's scope, and list the rest.

- [ ] **Step 7: Run the unit tests.**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add src/styles.css tests/shell.test.mjs
git commit -m "Restyle the client screens with the redesign tokens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: All four suites

**Files:**
- Modify only if a hook moved: `tests/browser.mjs`, `tests/auth-browser.mjs`, `tests/support/story-pages.mjs`

- [ ] **Step 1: Check the hooks the suites use still exist.** For each label, button name, action, selector and text in the Global Constraints list, confirm it still renders:
  ```bash
  grep -n "<text>" src/*.mjs
  ```
  Note that `save-exit` now renders only in the top bar on a draft. The story clicks it while a draft is open, so that holds.

  One case needs a closer look. `clickAction(client, "open-applications")` clicks the first `[data-action="open-applications"]`, which is now the top-bar logo button. Confirm it is visible at the story's widths (1280 and 390).

- [ ] **Step 2: Run the suites.** Make sure the test stack is up:
  ```bash
  docker start $(docker ps -aq --filter name=vitally-task2)
  ```
  Wait for `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/auth/v1/health` to print `200`. Then run each suite in the foreground, with long timeouts and output redirected to a file under `/tmp`:
  ```bash
  npm test
  npm run test:database
  npm run test:auth-browser
  npm run test:browser
  ```
  Expected: all PASS. The browser suite also asserts no sideways scroll at 390px for the client screens it captures.
  - If a suite fails because a hook moved, fix the test hook, or restore the hook in the markup if the test's hook is the better contract.
  - If `test:browser` fails in a part this PR doesn't touch, re-run once and report both runs. A known unrelated flake: "a press reached nothing at all and had to be sent again".

- [ ] **Step 3: Commit, only if tests changed.**

```bash
git add tests/
git commit -m "Keep the browser story's client hooks in step with the restyled screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Screenshots, docs and the pull request

**Files:**
- Add: `docs/design/screens/implemented-client-intake.png`, `docs/design/screens/implemented-client-progress.png`, `docs/design/screens/implemented-client-sign-in.png`
- Modify: `docs/design/README.md`, `docs/design/redesign-review.md` (status line)

- [ ] **Step 1: Copy three harness screenshots from Task 3, all at 1440:** intake step 2 ("Your situation"), progress with an open request, and sign-in (email step). Save them as the three files above.

- [ ] **Step 2: Check the logo.**
  ```bash
  shasum -a 256 src/pcdc-logo.png "docs/media/Shao-Transparent BLUE.png"
  ```
  Expected: the same hash twice.

- [ ] **Step 3: Update the docs.**
  - In `docs/design/README.md`, under the client intake rows, add:
    ```markdown
    | Implemented (part 1, PR 3): client screens on today's 4-step intake, rendered from test fixtures | [intake](screens/implemented-client-intake.png) · [progress](screens/implemented-client-progress.png) · [sign-in](screens/implemented-client-sign-in.png) |
    ```
  - In `docs/design/redesign-review.md`, update the status line to say PR 1 and PR 2 are merged and PR 3 (client screens) is in review.

- [ ] **Step 4: Commit.** Don't push; the finishing step pushes and opens the PR.
  ```bash
  git add docs/design
  git commit -m "Add the implemented client screen screenshots

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
