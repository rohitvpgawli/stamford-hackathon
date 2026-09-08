# Mango SMS production handoff

Verified live 2026-09-08. Mango uses the existing Android SMS Gate device and
Cloudflare tunnel. The production worker runs on loopback port 3001 and calls the
isolated, tool-free Mango Hermes profile on port 8644.

Inbound `sms:received`, `sms:data-received`, and downloaded MMS text are
authenticated, checked against the configured device and SIM, deduplicated, and
queued in Supabase. Sender identity comes only from the trusted callback.
Outbound replies are bound to that sender or to the website-enqueued phone;
Hermes cannot override recipients or send messages itself.

The worker supports STOP suppression, explicit re-opt-in, HELP, stale-message
expiry, leases and retries, encrypted temporary outbox data, provider status
reconciliation, and separate accepted, sent, and delivered states. It recommends
only published upcoming production events. A validated event recommendation may
carry a website-issued magic link; ordinary conversation does not mint one.

Production units:

- `mango-magic-link.service`: enabled and active
- `hermes-gateway-magic-link.service`: enabled and active

Retired units:

- `mango-sms-api.service`: disabled and inactive
- `hermes-gateway-mango.service`: disabled and inactive

Do not enable both generations simultaneously. Operational checks, phone-number
changes, verified journeys, and deferred hardening are documented in
`MAGIC_LINK_OPERATIONS.md`.
