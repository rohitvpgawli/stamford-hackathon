# Mango magic-link operations

Current scope: the existing Mango experience, same phone and SMS Gate bridge,
with phone-only web login. Website owner follows website-changes-handoff.md.
Do not deploy the website or apply its migrations from this runbook implicitly.

## Prepared runtime

- Existing mango gateway: loopback 8643; existing SMS service: loopback 3001.
- Adapted mango-production gateway: loopback 8644, same configured model/voice,
  no general-purpose tools or shared personal history. Its model only chooses
  conversation wording and a supplied event; backend owns identity/link/send.
- Production SMS worker: loopback 3002, output apps/sms-api/.production-dist.
  No SQLite or seed-data imports. Do not overwrite the live legacy dist folder.
- Protected worker env: /home/ubuntu/.config/mango/magic-link.env, mode 0600.
  It reuses existing SMS Gate device/SIM/credentials/webhook secret and web
  Supabase/APP_URL/MANGO_LOGIN_SECRET. New outbox/admin secrets stay local.
- Protected Hermes client fragment: /home/ubuntu/.config/mango/hermes-production.env.
- Worker unit installed/registered but disabled and inactive; both gates false.
  Existing tunnel route unchanged. SMS Gate metadata confirms the configured
  device is online; this does not yet validate actual callback fields/delivery.

The same configured device and SIM select the existing Mango number.
MANGO_RECEIVING_PHONE is optional extra checking if callbacks include recipient.
A mismatched device/SIM always fails. Never loosen callback authentication.

## Local checks and configuration

Run sequentially on this small EC2 host; never parallelize heavy database tests
and web builds. Do not rebuild the website as part of agent work.

```sh
npm run production:build --workspace @mango/sms-api
npm run production:test --workspace @mango/sms-api
node apps/sms-api/scripts/production-preflight.mjs
```

Tests use in-memory PGlite and fake HTTP/SMS. They do not prove real Supabase
sessions, real phone delivery, or multi-connection database concurrency.

The optional actual-adapter fixture uses a temporary Hermes home and stubbed
model, no phone or database:
```sh
/home/ubuntu/.hermes/hermes-agent/venv/bin/python apps/sms-api/test/hermes_adapter_integration.py
```

Configuration is ALREADY provisioned here. For a fresh installation only,
node apps/sms-api/scripts/configure-production.mjs imports the allowlisted
existing credentials, generates independent local secrets and closes both
gates. It refuses overwrites. Optional --phone +E164 enables the extra guard.
Do not rotate the outbox key with pending jobs or change webhook secrets without
coordinating SMS Gate. Never paste secrets into docs/prompts.

## Website dependency

Hand website-changes-handoff.md to the web agent. They should import the CURRENT
apps/sms-api/migrations/001_magic_link.sql into the web migration ledger once,
not both that file and its old draft copy. The agent migration now maps real
public.plans itself; missing compatible schema remains fail-closed.

Web owner implements request -> unconfirmed Auth account -> enqueue, plus
safe issuer/redemption and preserved event destination. Shared public origin:
https://www.bigmango.org. Same Supabase project and MANGO_LOGIN_SECRET both sides.
No Vercel token is needed on this EC2 for agent work.

No production migration has been applied here. Backup was explicitly waived;
that does not authorize deployment. Record intended project and migration
checksum, review existing ledger/seed behavior, and coordinate compatible
web code before changing old token RPC grants. Do not drop users/tables.

## Controlled acceptance and cutover: requires approval

1. Web owner confirms shared schema and login changes ready.
2. Review status-only preflight and existing device/SIM subscription. Verify an
   authenticated actual sms:received callback supplies deviceId, simNumber,
   sender, messageId and receivedAt. No personal inbox/history exports.
3. Install deploy/mango-magic-link.service in user systemd if not already present.
   With explicit test authorization, open both protected gates and start worker.
   Keep admin health private; authenticated /v1/admin/health checks DB/catalog
   and phone availability. /health alone is just process liveness.
4. Point the EXISTING Cloudflare webhook path at loopback 3002 only when ready.
   Never expose Hermes 8644 or admin routes. Prevent duplicate legacy and
   production subscriptions/senders. Do not change the phone number.
5. Test both new/returning phone journeys, event destination through onboarding,
   scanner-safe redemption, STOP, resend cooldown and offline recovery.
6. Verify message states and browser session, not just generic enqueue acceptance.

Callbacks require shared secret header or existing ?token= convention. Disable
URL/header/body logging at every proxy if using a query secret. Require the
configured device and SIM; old ordinary inbound (>10 minutes) expires, stale
STOP still applies and stale START cannot re-enable messaging.

## Failure handling and retained safeguards

Queue leases fence stale workers. Stable transport IDs and durable send markers
prevent blind resends after ambiguous HTTP outcomes. Accepted, sent and delivered
are distinct; missing status is not proof a send never happened. Reconciliation
ends at expiry/eight claims. Do not clear issuance/send markers to retry.
Issuance has no idempotency contract; ambiguous issuance requires a new request.

Outbox links are encrypted with job-bound AES-GCM and purged on acceptance or
expiry. No link enters model context/logs. Conversation bodies expire after
30 days; identifiers/suppression/deduplication remain. Hermes sanitized
transcripts need a separately agreed retention policy.

STOP cancels unsent work and is rechecked at send authorization. Already
in-flight transport sends cannot be reliably recalled. Do not promise exactly
once delivery or exemption from provider/carrier rules.

For rollback, pause website enqueue and production ingress, stop worker, retain
private tables and delivery markers. Do not restore/replay accepted or uncertain
jobs. Old SQLite/demo runtime is not a production login rollback.
No legacy personal messages, seed users or demo matches are migrated.

External queue/phone alerting and post-launch retention ownership remain
operational setup, not silently configured services.
