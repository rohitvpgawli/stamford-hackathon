# Mango magic-link authentication contract

Updated 2026-09-07. Both journeys use **SMS-delivered magic links only**. No numeric codes, Supabase SMS delivery, or code-entry fallback.

## Current implementation vs production target

Implemented in this web repository: `POST /api/login?action=issue`, `GET /l/<token>`, and `/app/enter`. The existing login form in `components/live/AuthForm.tsx` still sends SMS codes; replacing it is outstanding. The EC2 Hermes repository has not been inspected here.

Creating a Supabase Auth user creates an account, **not an authenticated browser session**. Possession and redemption of the SMS link authenticates the browser. Typing a phone number into a website does not prove ownership.

## Both journeys

1. **SMS discovery:** a trusted inbound SMS identifies the sender. Mango Agent ensures their Supabase account exists, selects a real upcoming event, requests a link with `plan_id`, and sends it only to that sender. The link signs them in and routes to that event.
2. **Google discovery:** the website accepts a phone number and requests delivery through a protected backend queue (proposed contract in `SMS_HANDOFF.md`). Mango Agent ensures the account exists, requests a link, and texts it only to the submitted number. The requesting browser receives a generic acknowledgement, never the link or a session. Clicking the text signs in the browser that opens it; it does not automatically sign in another device.

New members may still need to complete their profile and confirm eligibility before participating. Authentication is not automatic event registration.

## Existing link-issuance API

`POST {APP_URL}/api/login?action=issue`

Headers: `Content-Type: application/json` and `x-mango-login-secret: <MANGO_LOGIN_SECRET>` (server-only, at least 32 characters).

```json
{
  "phone": "+12035550123",
  "first_name": "Rohit",
  "interests": ["move", "outdoors"],
  "plan_id": "<published-upcoming-plan-UUID>",
  "ttl_seconds": 600
}
```

The phone above is illustrative. Pure login needs only `phone`; recommend `ttl_seconds: 600` in production. Current API default is 3600 seconds, allowed range 60–86400.

| Field | Existing validation / behavior |
|---|---|
| `phone` | Required, US E.164: `^\+1[2-9]\d{9}$`. |
| `first_name` | Optional, trimmed, 1–40 characters; new-user metadata. |
| `interests` | Optional, at most 8 from `table`, `outdoors`, `move`, `culture`, `play`, `give`. |
| `plan_id` | Optional UUID; must be live, upcoming, and non-demo. |
| `place` | Optional alternative to `plan_id`: `{ "name": "Scalzi Park", "meeting_point": "At the main public park entrance", "city": "stamford" }`. Name 2–150 characters; meeting point 5–300. A proposal, not an existing event. |

Never supply both `plan_id` and `place`. Name/interests become onboarding handoff context only when a plan or place is attached; pure login does not currently persist interests. Existing profiles are not overwritten by handoff context.

Success: `201 { "url": "https://<APP_URL>/l/<opaque-token>", "expires_in": 600 }`.
Send the returned URL verbatim, only to the request's phone. Never fetch it, preview it, shorten it through a tracking service, or put it in model context or logs.

Current errors: `401` for missing/wrong secret, `413` for body over 8000 characters, and `400` for invalid input **or backend failures, including rate limits**. Current SQL checks a maximum of 5 links/user/minute; this is not concurrency-safe. There is no current `429` or issuance idempotency contract. Do not blindly retry `400`; record a redacted failure for diagnosis.

## Current redemption behavior

The app stores only SHA-256 of a random 256-bit token. `GET /l/<token>` atomically consumes it and redirects to `/app/enter` with a one-time Supabase verification hash in the URL fragment. The client exchanges that hash for a session and removes it from the address bar. The SDK method is called `verifyOtp` with `type: "magiclink"`; this is a link exchange, **not an SMS code**.

Optional handoff context routes to `/app/plan/<id>` or `/app/host?proposed=1`; otherwise `/app`. Expired/replayed links redirect to `/app/signup?login=expired`, malformed ones to `login=invalid`, and some backend failures to `login=unavailable`. The signup UI still needs matching messages and a magic-link resend flow.

## Account ownership and required production fixes

Target: Mango Agent uses a deterministic server-side `ensure_user(phone)` tool on first contact in either journey. Use Supabase Admin APIs, look up by normalized phone, and on a concurrent-create conflict re-read the existing user. Never insert directly into `auth.users`. Preserve existing profiles and real emails. Record the stable Supabase UUID in agent state.

For website submissions, create an **unconfirmed** phone account; confirm the phone only after successful link redemption. Inbound sender evidence must come from the trusted SMS transport, never an LLM-extracted phone in message text. Prefer the same redemption-based confirmation for both journeys.

The current issuer independently finds/creates accounts, auto-confirms newly created phones, and adds a confirmed synthetic email when needed (`phone-<digits>@{LOGIN_EMAIL_DOMAIN}`, default `phone.mango.internal`, never emailed). It does **not** confirm an existing unconfirmed phone. Therefore the web owner must implement confirmation tied to successful redemption before agent-created unconfirmed accounts can use protected profile/member features. Do not mark a submitted website number verified to work around this gap.

Other web-owner launch requirements:

- Replace the existing SMS-code form with the request queue contract in `SMS_HANDOFF.md`.
- Make link consumption resistant to SMS previews/scanners; GET currently burns the token. Use a non-consuming landing step and deliberate redemption, with a minimal continue action if needed. Do not promise scanner-safe one-tap login until tested.
- Harden issuance: race-safe user provisioning, atomic rate limits, idempotent request handling, distinct retryable/rate-limit errors, and cleanup of failed context issuance.
- Handle expired links and preserve event destination through onboarding. Test returning users and users with real emails as well as phone-only users.
- Redact `/l/*`, `/h/*`, fragments, cookies and auth headers from logs/analytics; apply no-store/no-referrer to error paths too.

## Configuration and verification

Web: `APP_URL` (public HTTPS origin), Supabase server credentials, `MANGO_LOGIN_SECRET`, optional `LOGIN_EMAIL_DOMAIN`. Supabase Email auth must remain enabled for internal magic-link session minting; no email is sent. Apply repository migrations with `npm run db:migrate` against the intended project.

Agent: same `APP_URL` and `MANGO_LOGIN_SECRET`; server-only Supabase credentials for provisioning; trusted phone/SMS adapter. No secrets in prompts or handoff documents.

Local fixture: `node --env-file=.env scripts/login-fixture.mjs +1<your-real-number> [published-plan-uuid]`. Localhost only; output is a bearer credential.

This avoids using Supabase's SMS provider. It does **not** establish an exemption from the actual phone/SMS service's carrier rules. For example, [Twilio requires registration for its US 10DLC application traffic](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc). Verify the Hermes transport's permitted use before launch.
