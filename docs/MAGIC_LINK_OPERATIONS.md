# Mango production operations

Production status verified 2026-09-11.

## Live architecture

- Website: `https://stamford.fyi`
- Public SMS webhook: `https://sms.stamford.fyi/v1/channels/android/webhook`
- Cloudflare tunnel target: `127.0.0.1:3001`
- Production SMS worker: `mango-magic-link.service`
- Isolated Mango Hermes gateway: `hermes-gateway-magic-link.service` on `127.0.0.1:8644`
- Protected worker configuration: `/home/ubuntu/.config/mango/magic-link.env`
- Protected Hermes configuration: `/home/ubuntu/.config/mango/hermes-production.env`
- Shared identity, queue, conversation state, and event catalog: production Supabase

The two production services are enabled and active. No demo SMS worker or
legacy Hermes profile is installed.

## Verified journeys

Both production journeys completed successfully on 2026-09-08:

1. A person texted Mango, received an event-specific magic link, opened the web
   app, and continued into profile setup.
2. A person entered their phone on the website discovery/login flow and received
   a Mango SMS containing a working signup link.

The live MMS test was accepted as `mms:downloaded`, processed by Hermes, sent
through SMS Gate, and reported `delivered`. The public tunnel, configured
device/SIM, webhook secret, Supabase schema, catalog, web issuer, and phone
availability all passed their production checks.

## Runtime behavior

SMS and MMS callbacks require the shared webhook secret and configured device
and SIM. `mms:received` waits for `mms:downloaded`; only its text body or subject
is processed. Attachments are ignored. Duplicate callbacks are deduplicated.

Hermes receives sanitized conversation context and published upcoming events.
It cannot send SMS, access Supabase directly, choose arbitrary recipients, or
see magic-link credentials. Deterministic worker code validates event IDs,
issues links, binds the destination phone, and sends messages. Model replies are
limited to a 60-second total budget, with one regeneration after non-JSON output.
All link, login-code, event, length, and redaction checks still apply.

Logs contain fixed event/status/error codes only. They must never contain SMS
text, phone numbers, magic links, message IDs, access tokens, or secrets.

## Basic checks

```sh
systemctl --user is-active mango-magic-link.service
systemctl --user is-active hermes-gateway-magic-link.service
curl -sS http://127.0.0.1:3001/health
curl -sS http://127.0.0.1:8644/health
npm run production:test --workspace @mango/sms-api
npm run production:build --workspace @mango/sms-api
```

Authenticated `/v1/admin/health` is the operational check for queue depth,
catalog readiness, failure counts, and phone availability. Public `/health`
only proves the HTTP process is alive.

The Hermes model-provider credential is kept separately at
`/home/ubuntu/.config/mango/hermes-provider.env` with mode `0600`. Installation
and provider-key synchronization read that file by default; set
`HERMES_PROVIDER_ENV` only when using another protected path.

## Changing the Mango phone number

Changing the number is straightforward when the existing Android device and SMS
Gate account remain in use:

1. Move or activate the new carrier number on the intended SIM and confirm SMS
   Gate can receive and send on it.
2. Update `MANGO_RECEIVING_PHONE` in the protected worker environment if that
   optional recipient check is configured. Update `ANDROID_GATEWAY_SIM_NUMBER`
   if the line moved between SIM slots.
3. Restart `mango-magic-link.service`, verify authenticated health, then run one
   inbound and one website-originated link test.

For a new Android device, also update `ANDROID_GATEWAY_DEVICE_ID` and any changed
SMS Gate credentials, recreate the webhook registrations for the new device
using the existing public URL and shared secret, and then restart and test. The
Cloudflare tunnel, Supabase schema, website API, and Hermes profile do not
change. Existing users remain associated with their original phone identities;
changing Mango's receiving line does not migrate user accounts.

## Deferred production hardening

- Refine Mango's voice and conversational details in the production Soul.
- Add adversarial prompt-injection evaluations and regression cases for requests
  for scripts, coding, system prompts, secrets, or unrelated work.
- Define and enforce daily inbound, model, and outbound SMS limits per phone and
  global spend limits, with clear user messaging and operator visibility.
- Add queue-age, phone-offline, delivery-failure, and spend alerts.
- Revisit backup and restore operations; backup work was deferred by the owner.

The current prompt already scopes Mango to Stamford activities, treats user and
event text as untrusted, exposes no tools, and rejects links or arbitrary event
IDs from model output. The items above add testing and operational limits around
those existing controls.
