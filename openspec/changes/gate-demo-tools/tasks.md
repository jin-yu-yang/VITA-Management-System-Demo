## 1. The switch: helper, server and browser

- [ ] 1.1 `src/loopback.mjs` with `isLoopbackUrl`, and its unit tests.
- [ ] 1.2 `server.mjs`:
  - `publicConfig` adds `demoTools: true` only with `VITALLY_DEMO_TOOLS=1` and a loopback `SUPABASE_URL`;
  - a one-line start-up warning when the flag is set but the URL isn't loopback.

  Update `tests/server.test.mjs` from the four-key test to the optional fifth key, and add the flag and URL cases.
- [ ] 1.3 `app.mjs` computes `demoTools` from the config and `isLoopbackUrl`. `createController({ demoTools })` exposes `state.demoTools`. Controller tests.
- [ ] 1.4 `.env.example`: a commented `VITALLY_DEMO_TOOLS=1` line with its explanation.

## 2. Rendering and actions

- [ ] 2.1 `demoFillButton(enabled)`, with the eight callers in `admin-views.mjs` and `staff-views.mjs` passing the switch. Update `tests/demo-fill.test.mjs`, `tests/admin-views.test.mjs` and `tests/staff-views.test.mjs`.
- [ ] 2.2 The client intake toolbar only with the switch (`client-views.mjs` `intakeScreen`). Update `tests/client-views.test.mjs`.
- [ ] 2.3 The office assisted-intake pill from `state.demoTools` (`views.mjs`). Update `tests/office-views.test.mjs` and any presenter-only expectation in `tests/presenter.test.mjs` and `tests/shell.test.mjs`.
- [ ] 2.4 The five fill handlers in `app.mjs` do nothing when the switch is off, with a test.

## 3. Guards, browser fixture and docs

- [ ] 3.1 A committed-config scan test: fail if any tracked `public-config*.json` contains `demoTools`.
- [ ] 3.2 `tests/support/browser-fixture.mjs` sets `VITALLY_DEMO_TOOLS: "1"`, and refuses a non-loopback target with a clear message.
- [ ] 3.3 `docs/developer/backend.md`: the public config contract, with the optional `demoTools` key and both loopback checks.
- [ ] 3.4 `docs/setup.md`:
  - adding `VITALLY_DEMO_TOOLS=1` to `.env.local` for rehearsals;
  - §6, saying hosted and classroom setups never show fill tools.

## 4. Verification

- [ ] 4.1 `npm test` passes.
- [ ] 4.2 `npm run build:hant -- --check` passes, with no text changed.
- [ ] 4.3 `npm run test:browser` passes.
- [ ] 4.4 By hand, with `npm start`: with the flag, a client sees the toolbar; without it, they don't.
- [ ] 4.5 `npx openspec validate --all` passes.
