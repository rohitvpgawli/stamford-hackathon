# Mango Agent — Hermes on EC2

Updated 2026-09-07. Production target: both SMS discovery and website sign-in use magic links sent over SMS. See `MAGIC_LINK_HANDOFF.md` for the existing link API and web-side gaps. This document specifies agent work; proposed queue endpoints/tables below are **not implemented in the web repository**.

## What Mango Agent needs

1. **Trusted SMS adapter:** receive sender number and stable message ID from the phone/SMS service; authenticate callbacks or the device bridge. Send to that bound number. Track accepted, failed, and delivered only when the transport actually reports delivery. Detect phone disconnects; support STOP/HELP and explicit re-opt-in. Keep personal phone conversations outside Mango's scope.
2. **Supabase identity tool:** normalize US E.164; idempotently find/create an Auth user on first contact; retain its UUID. Website input alone never confirms ownership. See the confirmation dependency in the magic-link doc. No seeded users or local IDs as production identity.
3. **Live event lookup:** Supabase is authoritative; recommend only live, upcoming, non-demo plans. Preserve plan UUID in the login request. A suggested place is explicitly a proposal.
4. **Deterministic login tools:** issue a short-lived link through the web API and deliver it to the bound phone. The LLM can choose conversational wording and event suggestions; it cannot choose arbitrary recipients, execute arbitrary database writes, or see secrets/link tokens.
5. **Durable worker:** move production contacts, conversation state, inbound deduplication, login jobs, and SMS outbox to private Supabase/Postgres tables. SQLite can remain an expendable cache. Add leases, retry backoff, dead letters, suppression checks, and recovery after EC2 restart. Enforce one active send per job; reconcile uncertain sends with transport IDs instead of blindly duplicating them.
6. **Operations:** separate production from fixtures; restricted credentials outside model context, supervised process restart, health checks, queue-age/send-failure/phone-offline alerts, redacted logs, retention/backup/restore and rollback instructions. Encrypt any temporarily persisted bearer links and purge after delivery/expiry.

## Journey 1: inbound SMS → event → authenticated app

Authenticate inbound event → deduplicate transport message ID → bind sender phone → ensure Auth account → query real plans → `POST /api/login?action=issue` with phone, `plan_id`, `ttl_seconds: 600` → send returned URL to that phone. Do not issue a link for every conversational message; only for an app-entry intent.

## Journey 2: Google → phone form → SMS → authenticated app

Recommended integration: the web backend writes to a durable private Supabase queue; EC2 polls and atomically claims jobs. This needs no publicly exposed Hermes HTTP port.

**Proposed web API:** `POST /api/login?action=request`

```json
{ "phone": "+12035550123", "captcha_token": "<token>", "plan_id": "<optional UUID>" }
```

The web server validates CAPTCHA, phone and optional plan, applies per-phone/IP/global limits and resend cooldown, then creates a job. Return generic `202 { "accepted": true }` for accepted/suppressed requests without revealing account existence or the magic link. Invalid syntax/CAPTCHA may return `400`; abuse limits `429`. These are proposed responses, not the current issuer's behavior.

**Proposed private queue:** `mango_private.login_requests` with `id` (UUID), `phone`, optional `plan_id`, `source` (`web`/`sms`), `created_at`, `expires_at`, `status`, `attempts`, `next_attempt_at`, `lease_until`, and redacted `last_error_code`. Deduplicate web resend bursts server-side; inbound SMS uses the transport message ID. Browser roles cannot read/write this table directly.

Worker claim must be atomic (row lock/lease via restricted RPC). For a valid unsuppressed job: ensure user → request link → persist protected outbox entry → send → record transport ID and outcome. Keep queued, accepted-by-transport, and delivered distinct. Expire stale jobs before issuing/sending. A consumed link requires a fresh explicit login request; only reuse an issued link while retrying the same unsent job.

Agree migrations/RPC signatures between web and EC2 before deployment. The agent must not invent production tables silently or claim this journey works before the web form and enqueue endpoint ship.

## Release checks

- New/returning numbers in both journeys, including simultaneous first contact, yield one Auth account; browser only authenticates by redeeming the texted link.
- Website request receives no login credential; forged SMS events and recipient overrides fail.
- Correct event survives login/onboarding; no demo recommendations, auto-RSVP, or overwriting existing profiles.
- Duplicate inbound/job delivery, worker crash and uncertain transport acknowledgement do not cause uncontrolled sends.
- Expired/replayed links fail; scanners do not consume links; unconfirmed users become confirmed through successful redemption. These require web-side fixes documented separately.
- CAPTCHA, throttling, STOP/suppression, phone offline, transport failure, and secret redaction work. No numeric-code screen or SMS-code fallback remains.

## Legacy `/h/` handoffs

`POST /api/handoff?action=create` and `/h/<token>` carry context only, not authentication. They previously depended on separate sign-in. Do not use them as the entry link for either new journey. `/l/<token>` already carries optional event/place context; the agent does not need `SMS_HANDOFF_SECRET` for this flow.
