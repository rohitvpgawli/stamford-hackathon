# Mango SMS Webhook Tunnel

## Why this exists

Cloud SMS Gateway must deliver inbound SMS/MMS events to Mango over a publicly reachable HTTPS endpoint. Mango itself listens locally on `127.0.0.1:3001`, so a stable HTTPS ingress is required in front of it.

The current Cloudflare Quick Tunnel is suitable only for short tests. Its generated hostname belongs to the lifetime of one `cloudflared` process. If that process exits, the hostname stops resolving, Cloud SMS Gateway continues posting to the dead URL, and messages appear in the Android app but never reach Mango.

This happened during the demo on 2026-08-15. Mango, Hermes, and the local API remained healthy, but there were no new webhook requests or inbound database records.

## Current temporary setup

- Mango API: `http://127.0.0.1:3001`
- Temporary ingress: Cloudflare Quick Tunnel
- Current temporary hostname: `organizer-aquarium-trains-broken.trycloudflare.com`
- Webhook path: `/v1/channels/android/webhook?token=<WEBHOOK_SHARED_SECRET>`
- Registered events:
  - `sms:received`
  - `sms:sent`
  - `sms:delivered`
  - `sms:failed`
  - `mms:received`
  - `mms:downloaded`
  - `app:started`

The hostname above must be treated as disposable. Do not put it in permanent documentation, QR codes, app releases, or demo collateral.

## Recommended permanent solution

Use a normal HTTPS endpoint on the EC2 instance:

```text
Cloud SMS Gateway
  -> https://sms.<owned-domain>/v1/channels/android/webhook
  -> Caddy on EC2 (ports 80/443)
  -> http://127.0.0.1:3001
  -> Mango inbound queue
  -> Hermes
  -> Cloud SMS Gateway outbound API
```

Caddy is already installed and the host has an initial `sslip.io` configuration, but the AWS security group currently blocks public TCP ports 80 and 443. The permanent work is therefore mostly infrastructure configuration:

1. Choose a stable hostname, preferably `sms.<owned-domain>`.
2. Point its DNS A record to the EC2 public IP.
3. Allow inbound TCP 443 in the EC2 security group. Allow TCP 80 as well if Caddy will use the HTTP ACME challenge or HTTP-to-HTTPS redirects.
4. Configure Caddy to reverse proxy only the required routes to `127.0.0.1:3001`.
5. Confirm Caddy obtains and renews a valid TLS certificate.
6. Replace every Cloud SMS Gateway webhook with the stable HTTPS URL.
7. Restart the Android gateway app once so it synchronizes the new webhook registrations.
8. Run the end-to-end checks below.

Restricting inbound 443 to documented Cloud SMS Gateway source ranges would be preferable if the provider publishes stable ranges. Otherwise keep application-level token authentication and rate limiting enabled.

## Alternative: named Cloudflare Tunnel

A named Cloudflare Tunnel is a reasonable permanent alternative when opening AWS ports is undesirable. Unlike a Quick Tunnel, it uses a Cloudflare account, a persistent tunnel identity, and a stable hostname on a Cloudflare-managed domain.

Required work:

1. Add or select a domain in Cloudflare.
2. Create a named tunnel and store its credential file outside the repository.
3. Map a stable hostname such as `sms.example.com` to the tunnel.
4. Run `cloudflared` as a system service with restart-on-failure enabled.
5. Register the stable hostname with Cloud SMS Gateway.
6. Add monitoring for both the local Mango health endpoint and the public tunnel endpoint.

This avoids inbound AWS security-group changes, but introduces Cloudflare account and credential management. A Quick Tunnel is not an acceptable substitute for a named tunnel.

## Webhook registration procedure

Never paste gateway credentials or the webhook secret into scripts, shell history, logs, or this file. Load them from the repository's protected `.env` file or a production secret manager.

When the public URL changes:

1. Verify `GET https://<hostname>/health` returns HTTP 200.
2. List the existing Cloud SMS Gateway webhooks.
3. Delete registrations that point to the old hostname.
4. Create registrations for all seven events listed above, scoped to the correct device ID.
5. Restart the Android app and verify an `app:started` callback arrives.
6. Send one plain SMS and one MMS.
7. Verify each inbound provider message ID appears exactly once in `inbound_jobs`.
8. Verify the generated outbound reply reaches `delivered` state.

The webhook token is part of the URL because that is what the current provider integration supports. Mango redacts request URLs and authorization headers from application logs. Rotate `WEBHOOK_SHARED_SECRET` whenever a URL containing it is exposed.

## Recovery when messages stop arriving

Use this order to avoid debugging Hermes when ingress is actually broken:

1. Check `mango-sms-api.service` is active.
2. Check `http://127.0.0.1:3001/health`.
3. Check the public `/health` URL.
4. Confirm the public hostname resolves in DNS.
5. Check recent Mango service logs for webhook POST requests.
6. Check `inbound_jobs` for the provider message ID or message text.
7. List Cloud SMS Gateway webhooks and confirm their hostname and event coverage.
8. Restart the Android app to force registration synchronization.
9. Request an inbox export/replay for a narrow recent time window.
10. Only after an inbound job exists should Hermes and outbound delivery be investigated.

An accepted inbox-export request does not prove delivery. The replay is successful only when the webhook arrives and an inbound job is recorded.

## Monitoring needed before a real demo

- Run ingress as a managed service, not an interactive terminal process.
- Probe local and public `/health` endpoints at least once per minute.
- Alert when the public endpoint fails twice consecutively.
- Alert when `app:started` or another device heartbeat has not been observed within an agreed window.
- Display timestamps for the last successful inbound webhook and delivered outbound SMS.
- Run an automated pre-demo smoke test, followed by one real phone test.
- Keep a simulator-based recovery path available, but label simulated traffic clearly.

## Definition of done

The tunnel work is complete when:

- the public hostname remains unchanged across process and EC2 restarts;
- TLS renewal is automatic;
- ingress starts automatically after reboot;
- no gateway or webhook secrets are stored in the repository;
- SMS and MMS callbacks survive an ingress restart without re-registration;
- health monitoring detects loss of public ingress;
- a real inbound message produces one grounded Mango reply end to end.
