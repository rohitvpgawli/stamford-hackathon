# Mango magic-link production contract

Verified live 2026-09-08. Both journeys use phone-only, SMS-delivered magic
links. There is no email form, numeric SMS code, or automatic event RSVP.

## Website to agent

The website provisions or reuses an unconfirmed Supabase phone account and calls
the service-only RPC:

```text
mango_agent_v1('enqueue_web', { phone, plan_id? })
```

The worker claims the job, ensures the same phone identity, requests a link, and
sends it through the configured Android SMS Gate device. The public website
returns only a generic acknowledgement and never exposes a link or session.

## Agent to website

```http
POST https://stamford.fyi/api/login?action=issue
x-mango-login-secret: <shared server secret>
content-type: application/json

{"phone":"+1...","ttl_seconds":600,"plan_id":"<optional UUID>"}
```

Success is `201` with `{ "url": "https://stamford.fyi/l/<token>",
"expires_in": 600 }`. The worker sends the URL verbatim and never fetches,
previews, shortens, logs, or exposes it to Hermes.

GET and HEAD on `/l/<token>` are side-effect-free. Deliberate POST redemption
consumes the link, confirms phone ownership, creates the browser session, and
preserves the selected event through onboarding. Links are short-lived and
single-use.

## Ownership and boundaries

The production Supabase project is authoritative for Auth users, event plans,
the private queue, suppression, and conversation state. Browser roles cannot
access the private agent schema or issue links. Account creation does not prove
phone ownership; redemption does. Existing profiles and real emails are not
overwritten. Attendance is confirmed in the app, never by an SMS suggestion.

Secrets remain server-side in the website and protected EC2 environment files.
Never place phone numbers, tokens, sessions, `/l/` URLs, or raw provider errors
in logs, analytics, prompts, or documentation.
