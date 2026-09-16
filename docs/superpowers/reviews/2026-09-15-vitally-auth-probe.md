# ViTally isolated Auth compatibility probe — 2026-09-15

## Scope and result

A throwaway standalone email/code form successfully authenticated a confirmed test user in **Chrome and Firefox**, using `auth.admin.generateLink({type:'magiclink',email})` in the Node test process and entering `data.properties.email_otp` into the form. The browser made a real `verifyOtp({email,token,type:'email'})` request to isolated local Supabase. The requested user ID appeared after verification.

This was an early compatibility trial, **not application implementation or acceptance testing**. No classroom project, account, existing credentials, application code, hosted email, or deployment was used. OTP-send requests in the browser were intercepted; real email delivery was not tested. The local mail catcher was stopped before the final run and known-user cooldown test.

## Exact versions

| Component | Observed version |
| --- | --- |
| Node | 24.21.0 |
| Supabase CLI | 2.117.0 |
| Supabase JavaScript SDK | 2.116.0 |
| Playwright | 1.63.0 |
| esbuild | 0.28.2 |
| Installed Chrome | 153.0.8010.48 |
| Playwright Firefox | 155.0, build 1543 |
| Supabase Auth container | `public.ecr.aws/supabase/gotrue:v2.196.0` |
| Supabase Postgres container | `public.ecr.aws/supabase/postgres:17.6.1.167` |
| PostgREST | v16.2 |
| Kong | 2.8.1 |
| Local mail catcher | Mailpit v1.30.2 |

## Isolation and commands

Temporary directory: `/private/tmp/vitally-auth-probe.s0S4Ja`. Project ID: `vitally-auth-probe.s0S4Ja`. API/database/form ports: 56321/56322/56330. All fixture addresses were random synthetic addresses; each user was created with `email_confirm:true`, checked for confirmation, and deleted by its exact returned ID. Unknown-email checks verified no user was created.

Commands ran in the temporary directory, with the task's Node bin directory prepended to PATH for each tool command. The following records the actual command sequence, using named variables for the same paths:

```sh
VITALLY_NODE_BIN=/Users/jinyuyang/.nvm/versions/node/v24.21.0/bin
VITALLY_NODE="$VITALLY_NODE_BIN/node"
VITALLY_NPM=/Users/jinyuyang/.nvm/versions/node/v24.21.0/lib/node_modules/npm/bin/npm-cli.js
VITALLY_PROBE=/private/tmp/vitally-auth-probe.s0S4Ja

PATH="$VITALLY_NODE_BIN:$PATH" "$VITALLY_NODE" "$VITALLY_NPM" install --save-exact @supabase/supabase-js playwright supabase
PATH="$VITALLY_NODE_BIN:$PATH" "$VITALLY_NODE" "$VITALLY_NPM" install --save-exact esbuild
PATH="$VITALLY_NODE_BIN:$PATH" PLAYWRIGHT_BROWSERS_PATH="$VITALLY_PROBE/browsers" ./node_modules/.bin/playwright install firefox
PATH="$VITALLY_NODE_BIN:$PATH" SUPABASE_HOME="$VITALLY_PROBE/cli-home" ./node_modules/.bin/supabase init
PATH="$VITALLY_NODE_BIN:$PATH" SUPABASE_HOME="$VITALLY_PROBE/cli-home" ./node_modules/.bin/supabase start --exclude realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor > start.log 2>&1
docker stop supabase_inbucket_vitally-auth-probe.s0S4Ja
PATH="$VITALLY_NODE_BIN:$PATH" PLAYWRIGHT_BROWSERS_PATH="$VITALLY_PROBE/browsers" "$VITALLY_NODE" probe.mjs
PATH="$VITALLY_NODE_BIN:$PATH" "$VITALLY_NODE" rate-probe.mjs
PATH="$VITALLY_NODE_BIN:$PATH" SUPABASE_HOME="$VITALLY_PROBE/cli-home" ./node_modules/.bin/supabase stop --project-id vitally-auth-probe.s0S4Ja --no-backup
```

The exact resolved package versions are listed above; the temporary lockfile/runtime were not added to the application. The CLI initially attempted to create its default home directory; its supported `SUPABASE_HOME` override confined subsequent CLI state to the temporary directory.

Final relevant local configuration:

```toml
project_id = "vitally-auth-probe.s0S4Ja"
[api]
port = 56321
[db]
port = 56322
[auth]
site_url = "http://127.0.0.1:56330"
enable_signup = false
enable_anonymous_sign_ins = false
[auth.email]
enable_signup = true
enable_confirmations = false
max_frequency = "60s"
otp_length = 6
otp_expiry = 3600
```

**Configuration trap observed:** setting `auth.email.enable_signup=false` in this CLI version produced `GOTRUE_EXTERNAL_EMAIL_ENABLED=false`. Existing-user OTP requests then returned `422/email_provider_disabled`. The corrected configuration disables signup globally while retaining the email provider. Admin-generated verification alone would not reveal this provider misconfiguration. Both browser checks were repeated after correction.

## Browser harness behavior

The standalone form bundled the real SDK, called `signInWithOtp` from its Send button, and called `verifyOtp` from its Verify button. Only the test project's exact `/auth/v1/otp` route was intercepted. It asserted the local form origin and `create_user:false` request field.

The route handler supported OPTIONS with a 204 response and POST with a 200 JSON response. Both included explicit allowed origin/method/header CORS values; requested preflight headers were handled. It had no `times:1` limit, stayed installed for the attempt, and was removed in `finally`. The real `/verify` endpoint was never intercepted. The test asserted its request body used `type:'email'`.

| Engine | Intercepted OTP POST | OPTIONS visible to route | Real OTP verification |
| --- | --- | --- | --- |
| Chrome 153.0.8010.48 | 1 | 0 | Passed |
| Firefox 155.0 | 1 | 0 | Passed |

**Caveat:** OPTIONS support was present but was not exercised by either observed route stream. These results do not establish that browser preflight requests always reach Playwright handlers or that CORS headers can be omitted.

## Observed Auth responses versus source expectations

| Actual isolated-local scenario | Observed HTTP/code | Boundaries |
| --- | --- | --- |
| Unknown email, signup disabled, `shouldCreateUser:false` | 422 / `otp_disabled` | No user created; no email sent |
| Confirmed known email immediately after `generateLink`, 60s resend floor | 429 / `over_email_send_rate_limit` | Response in 35ms; mail catcher stopped; fixture subsequently deleted |
| Earlier misconfigured email provider disabled | 422 / `email_provider_disabled` | Explains why generated-code verification alone is insufficient |

These are observations from local GoTrue v2.196.0, not assertions about an unconfigured hosted project. The known/unknown response distinction supports using the same neutral code-entry message and cooldown for request outcomes, rather than exposing a special rate-limit or provider error only for known accounts. It does not make the underlying Auth API indistinguishable.

Other SMTP failures, project/IP/global quotas, social-only accounts, revoked memberships, and hosted gateway behavior remain unobserved. The cooldown observation covers one controlled local condition, not every rate-limit path. Candidate mappings must be checked against the selected test project's configuration before treating them as deployed behavior.

## Consequences for the implementation plan

1. Add an early reusable login-harness probe after Auth code, the minimal real login UI, and isolated test fixtures are available; it must pass in both engines before the full application story depends on it.
2. Explicitly provision confirmed users, preserve the email provider while disabling public signup, and verify a normal OTP-send path separately using an authorized delivery test.
3. Keep request-outcome UI neutral across known/unknown addresses, including address-dependent rate-limit and delivery/provider failures. Never claim a code was delivered merely because the request completed.
4. Retain real `verifyOtp` integration, guard test project identity, and avoid session injection or application test endpoints.
5. Realtime policy verification is separate and was not run in this probe. A reliable denial test should use unfiltered A/B subscriptions, await SUBSCRIBED and a B-visible control, commit an A marker and await A's positive event, then commit a B-visible fence on the same ordered table stream. Once B receives that fence, assert its collected events contain no A marker/record. Missing controls, disconnections, and timeouts fail the test; silence alone is never proof of denial.

## Sources checked

- [Supabase generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink) and [current SDK implementation](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/src/GoTrueAdminApi.ts): generated links/OTPs are returned to the caller.
- [Auth verification implementation](https://github.com/supabase/auth/blob/master/internal/api/verify.go): email OTP verification checks confirmation and recovery tokens, resolving recovery-token matches as magic-link verification.
- [Auth OTP implementation](https://github.com/supabase/auth/blob/master/internal/api/otp.go): current source includes the unknown-user `otp_disabled` path.
- [Auth error documentation](https://supabase.com/docs/guides/auth/debugging/error-codes): error identifiers and rate-limit categories; source/docs are not a substitute for deployment observations.
- [Playwright routing](https://playwright.dev/docs/api/class-page#page-route): route lifetime and handler controls.
- [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes): subscriber authorization and ordered event processing underpin the proposed control/fence test.

## Cleanup

Fixture users were deleted by recorded ID after each probe. `supabase stop --project-id vitally-auth-probe.s0S4Ja --no-backup` completed successfully. Subsequent filtered Docker container, volume, and network listings returned no entries for that project. The pre-existing `kirkify.me` container remained running with its unchanged eight-day uptime.

The exact temporary directory was removed, including browser downloads, packages, standalone form scripts, generated local credentials, and raw logs. No broad Docker stop/prune operation was used. Downloaded Docker images remain in Docker's shared image cache; they were not pruned because that could affect unrelated development. Only this sanitized report is retained in the project.
