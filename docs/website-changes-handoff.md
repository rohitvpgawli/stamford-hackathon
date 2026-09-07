# Website login changes handoff

Updated 2026-09-07. Owner: Mango website/web-app agent.
Scope: phone-only magic-link login. Do not redesign or otherwise change the
website, discovery, events, chat, or participation features.

## Intended journeys

1. Visitor opens a shared event, clicks Join, and reaches login with the event
   destination preserved. Form says "Enter your phone number. We'll text you a
   magic link." Website backend creates/reuses the unconfirmed Supabase Auth
   phone account, then enqueues delivery. Mango texts a warm welcome and link.
   Opening the text authenticates that browser and resumes the selected event.
2. A person texts the existing Mango number. The production agent creates/reuses
   their Supabase phone account, discusses real events, and includes an
   event-specific magic link in its recommendation SMS. Opening it authenticates
   the browser and resumes that event.

No email input, email delivery, numeric SMS codes, Supabase SMS provider, or
automatic RSVP. Account creation is not authentication or phone verification.
The browser receiving the SMS link may differ from the browser requesting it.
Preserve existing profile/age-eligibility requirements and event destination.

## Agent implementation: ready locally, not cut over

Repository: /home/ubuntu/stamford-hackathon.
Hermes profile: mango-production, loopback 8644. SMS worker: loopback 3002.
Reuses the existing SMS Gate account/device/SIM and Cloudflare tunnel at cutover;
no new phone number, SMS provider, or public Hermes endpoint is needed.

- Production uses Supabase identity, real published upcoming non-demo plans,
  private contacts/conversation history and a durable login queue.
- Website jobs receive a warm welcome and short-lived sign-in link.
- SMS recommendations include their validated event's link in the same SMS.
- Deterministic code binds recipients, issues links and sends; Hermes never sees
  bearer links, keys, phone numbers, or unrestricted database/SMS tools.
- STOP/START/HELP, duplicate callbacks, phone offline, expired work and uncertain
  send recovery are already implemented.
- Journey validation uses local/in-memory fixtures and mocks. Real Supabase browser
  sessions and live phone delivery still need coordinated acceptance. Separate
  live read-only SMS Gate device metadata and a synthetic model greeting pass;
  no real user journey or SMS send has been exercised.

## 1. Browser request endpoint and phone form

Implement POST /api/login?action=request, server-side only processing:

```json
{"phone":"+12035550123","captcha_token":"<Turnstile response>","plan_id":"<optional event UUID>"}
```

The phone shown is illustrative, not the configured Mango receiving number.

Order:
1. Bound request size (8 KB), normalize/validate US E.164 phone, validate optional
   published upcoming non-demo plan, and check origin.
2. Server-verify Turnstile and apply IP/global abuse limits BEFORE Auth creation.
   Use a trusted platform IP header, not arbitrary client-supplied forwarded IP.
   Existing Turnstile credentials are in the protected local website env;
   hosting configuration and real challenge acceptance remain web-owner tasks.
3. Look up the Auth account by normalized phone using the existing service-only
   user_id_for_phone RPC. If absent use Supabase Admin createUser with
   phone_confirm:false. On a concurrent-create conflict, re-read the winner.
   Never insert an Auth user directly or overwrite an existing user's profile,
   phone, or real email. Do not accept a user UUID from the browser.
4. Enqueue using the service-only RPC below, after account provisioning succeeds.
   On RPC failure return generic 503; account may remain unconfirmed and the
   next request must reuse it. Do not issue a link in this public endpoint.
5. Return generic 202 {"accepted":true}, including cooldown/suppression cases.
   Return 400 invalid syntax/challenge/plan, 429 for limits, 503 dependencies.
   Never return a link, session, user ID, or account-existence information.

```ts
const { data, error } = await admin.rpc("mango_agent_v1", {
  op: "enqueue_web",
  p: { phone: normalizedPhone, ...(planId ? { plan_id: planId } : {}) },
});
if (error) { /* generic 503 */ }
if (data?.limited) { /* generic 429 */ }
// Otherwise generic 202. Do not expose raw RPC responses/errors.
```

Queue RPC deduplicates website bursts with a 60-second cooldown, bounds requests
to 6/phone/hour and 120 global/minute, validates the plan, and honors suppression.
It binds the Auth UUID from the authoritative phone, not request data.
IP/CAPTCHA limits remain the website's responsibility. EC2 polls; do not call
Hermes or the Android device directly from the website.

Replace only the existing SMS-code form behavior. Show "Check your texts" and
a 60-second resend cooldown; offer a fresh magic link for expired/used links.
Keep the selected event through login AND new-member onboarding.

## 2. Existing private issuer: preserve contract, fix ownership

Agent calls POST {APP_URL}/api/login?action=issue with:
- Content-Type: application/json
- x-mango-login-secret: shared server-only MANGO_LOGIN_SECRET

```json
{"phone":"+12035550123","plan_id":"<optional event UUID>","ttl_seconds":600}
```

Required success: 201 {"url":"https://www.bigmango.org/l/<opaque-token>",
"expires_in":600}. Plain sign-in omits plan_id. URL must use the exact configured
HTTPS origin, /l/ path, and no query or fragment. Agent sends it verbatim and
never fetches/previews it.

The existing main-branch issuer already exists: adapt it rather than replacing
the app. Reuse the same phone account, including accounts created by the agent.
Never confirm a submitted phone at issuance. Preserve existing real emails.
Current session-minting implementation uses an internal synthetic email for
phone-only accounts; this is NOT user email login and no email is sent. Retain
that internal compatibility mechanism if needed by the existing Supabase
session exchange. Do not ask the user to supply an email.

Bind each link to both Auth UUID and phone snapshot; store only its token hash.
Create link and event context atomically; make per-user limits race-safe.
Return distinct safe errors (401/400/429/503) and no backend details.
There is no issuer idempotency contract: the worker intentionally does not
blindly retry ambiguous issuance. Do not add a second SMS sender on web.

## 3. Redemption and existing /app/enter exchange

- GET and HEAD /l/<token> must NOT consume or confirm the link: Android/SMS
  preview scanners can fetch it. Show a minimal Continue action that performs
  deliberate, protected POST redemption; test real phone behavior.
- Atomically validate expiry, single use, Auth UUID and still-current bound
  phone, then consume and confirm that phone. Fail if the account's phone changed.
  A separate check then an unrestricted later update is race-prone.
- Mint/exchange the existing Supabase magic-link session without sending email.
  Existing verifyOtp(type:"magiclink") is an internal link exchange, not a
  numeric-code UI. Verify returned identity equals the redeemed user.
- Scrub the fragment before network requests; avoid duplicate exchange under
  React StrictMode; use no-store/no-referrer, including error paths.
- Resume /app/plan/<UUID>, or existing onboarding with that destination.
  Do not automatically mark a plan joined.
- Expired/used/malformed links offer a fresh request. If a downstream failure
  follows consumption, require a new link rather than restoring the old token.
- Never put /l/*, session fragments, cookies or credentials into logs/analytics.

## 4. Shared database migration ownership

Canonical AGENT schema source:
apps/sms-api/migrations/001_magic_link.sql in the agent repository.
Import its CURRENT contents into the web migration ledger once, stripping the
outer BEGIN/COMMIT only if that runner already wraps transactions.

It creates mango_private contacts, login_requests, conversations, outbox and
settings plus public.mango_agent_v1(op text,p jsonb). It now maps the existing
public.plans schema itself: vibe -> description, venue_name -> venue, only live,
future and non-demo. Missing compatible catalog stays fail-closed.

Do not apply both standalone and ledger copies. Do not directly expose the
private schema/queue or grant browser roles RPC access. Do not copy stale SQL
from the earlier local web draft. No production schema has been applied here.

Web agent owns token/redemption migration and deployed web login code.
Coordinate these with agent migration and a later worker enablement.
Do not blindly run unrelated seed actions or revoke old RPCs before compatible
web code is ready. Backup was explicitly waived by the user; that is not
production migration/deployment approval. No destructive cleanup is required.

## 5. Existing local web draft: reference only, not a finished release

The earlier work left UNCOMMITTED login-focused changes in /home/ubuntu/mango,
branch agent/magic-link-integration, based on 01cdf2e. Nothing was pushed or
deployed. This pass did NOT edit that repository.

Potentially reusable: app/api/login/route.ts, app/l/[token]/route.ts,
app/app/enter/page.tsx, components/live/AuthForm.tsx, lib/live/login.ts,
scoped exchange headers, login tests and token-hardening SQL.
Web owner should inspect and salvage/discard individual hunks, preserving all
other existing website work. Do not merge the draft blindly:
- Its request endpoint did not ensure the Auth account before enqueue; fix order.
- Its copied agent migration predates the current authoritative agent SQL.
- Its catalog mapping is now owned by the agent migration, so avoid duplication.
- Prior deployment docs are historical, not permission or current instructions.

No Vercel token is needed by the EC2 agent owner. Web owner handles hosting
configuration and release; only coordinate shared APP_URL, Supabase project,
MANGO_LOGIN_SECRET and schema/API readiness. Keys remain server-side.

## Acceptance handback

Please confirm:
- New and returning phones in BOTH journeys reuse one Auth account.
- Form supplies no session; only redemption authenticates and confirms ownership.
- Correct event survives login/onboarding; real-email users remain intact.
- Preview/HEAD does not consume; expired/replayed/phone-changed links fail safely.
- CAPTCHA/rate limits/STOP suppress unwanted sends; no numeric-code fallback.
- Shared schema and issuer contract deployed to the agreed project/origin.

Then EC2 owner can enable the prepared worker and move the existing webhook
to its loopback port, with explicit approval for a controlled SMS test.
Until then, keep the existing mango SMS service and tunnel route unchanged.
