# VITA-Management-System-Demo

VITA Management System Demo Milestone 1

A working local presentation prototype for **PCDC Community Tax Assistance**, designed around a two-minute client/volunteer story. Built from the agreed Figma-oriented brief with plain HTML, CSS, and JavaScript; no Figma file was generated.

## Run locally

Requires Node.js 18 or newer. No dependency installation is needed to run the demo.

```sh
npm start
```

Open **http://127.0.0.1:4173**. To use another port:

```sh
PORT=4174 npm start
```

The server binds only to localhost. Stop it with Ctrl+C.

## Two-minute walkthrough

1. **Start an application** → **Fill sample details** → **Send verification code**.
2. **Use demo code** (or enter `246810`) → **Verify and continue**. The Application ID is `DEMO-7K4P-92`.
3. Continue to intake. Use **Fill sample details** on each step, then **Continue**. Review the answers.
4. Demonstrate **Save and exit** → **Return to my application** → sample ID and code. The same draft returns.
5. Check the answer-confirmation box and submit. Status is **Application received**, not verified intake.
6. In the bottom prototype toolbar, switch to **Volunteer view**. Use **Simulate intake checks** for the off-screen staff work, then **Claim case**.
7. **Request a document** → **Send request** using the supplied mileage-record example.
8. Switch to **Client view**. Open **Add document** → **Use sample document** → **Submit document**.
9. Switch back to **Volunteer view**. The sample document is **Awaiting verification**; preparation remains on hold.

For a shorter rehearsal, describe save/return while showing the ID card and spend the time on the document-request handoff.

### Other demo controls

- **Load exception example:** a separate fictional draft with Uber/Lyft and other self-employment. It demonstrates the PCDC service limitation without overwriting the main walkthrough. Use the banner to return.
- **Reset demo:** clears the fictional case and restores the welcome screen.
- **Simulate an upload failure:** available in the upload dialog; uncheck and retry to complete the response.
- **Print reference card / Copy ID:** available after initial access verification.
- **Need help?:** office-contact guidance; actual phone/address/hours are deliberately not invented.

## What works

- Account-free client entry and simulated one-time-code access.
- Locally saved draft answers and return flow, including page refresh.
- Distinct residence and mailing-address fields.
- Representative 2025 intake and conditional service screening.
- PCDC-specific rules: Uber/Lyft is accepted for further screening; other self-employment blocks ordinary submission, even when combined with rideshare. More than 10 stock transactions follows the site's service-limit path; uncertain answers request assistance.
- Shared case state, explicit intake checks and claim, request history, and sample-document response.
- Desktop/mobile layouts, keyboard-operable controls, modal focus management, and visible errors.

## Prototype boundary

**Use fictional data only.** This app stores its sample state in this browser's local storage. It is not a secure portal and must not receive real taxpayer data. The verification code and role switch are deliberately simulated. There is no actual SMS/email, file upload/storage, identity check, consent signature, tax calculation, or filing. Refreshing a screen does not create a new application.

Application ID and code access are a demonstration of the intended experience, not implemented production authentication. Likewise, switching to the volunteer view is a presenter control, not an access-control design. The source questionnaire is represented by selected fields; this app does not replace Form 13614-C or Form 14446.

The interface is in English. Preferred service language is recorded, but full translated UI is outside this build. The definition of a counted stock transaction remains a site-policy detail; the prototype asks the source yes/no threshold question and performs no trade counting.

## Tests

Dependency-free workflow tests:

```sh
npm test
```

Browser checks require Playwright and Google Chrome, with the app running in another terminal:

```sh
npm install --no-save playwright@1.62.1
npm run test:browser
```

The browser script uses a new temporary browser profile and only fictional data. It writes screenshots into `artifacts/`. `DEMO_URL` changes the test URL; `BROWSER_CHANNEL` selects a supported installed browser channel. `PLAYWRIGHT_MODULE` can point to an existing Playwright package without installing another copy.

Coverage includes complete handoff, mixed-income restriction, save/retrieve, refreshed access, residence/mail separation, exception restoration, invalid code, retryable upload error, persistence, duplicate submission protection, reset, and mobile overflow.

## Files

- `src/domain.mjs`: case events and workflow rules.
- `src/app.mjs`: navigation, storage, form events, and demo controls.
- `src/views.mjs`: screen and dialog rendering.
- `src/ui.mjs`: shared form, button, icon, and status helpers.
- `src/styles.css`: responsive visual design.
- `server.mjs`: dependency-free localhost asset server.
- `tests/`: workflow and browser checks.
- `docs/superpowers/specs/`: approved design context.
- `docs/superpowers/plans/`: implementation checklist.
