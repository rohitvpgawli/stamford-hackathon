# Stamford Hackathon — Mango

Mango is a Stamford-focused quality-of-life and civic engagement platform that helps residents and UConn Stamford students discover meaningful nearby activities, meet compatible people, and participate in their city.

The hackathon build uses an Android local-SIM SMS gateway as the hero interface, Hermes Agent on EC2, progressively learned preferences, a researched Stamford opportunity catalog, grounded social matching, deterministic safety and rate limits, and a personalized app mockup for deeper exploration.

**Text for recommendation. App for exploration.**

## Product requirements

- [Implementation-ready PRD](docs/Mango_Hackathon_PRD.md)
- [Formatted Word PRD](docs/Mango_Hackathon_PRD.docx)
- [Demo runbook](docs/DEMO_RUNBOOK.md)

## Data

- [Data status report](DATA_STATUS_REPORT.md)
- [Handoff notes for Rohit](HANDOFF_FOR_ROHIT.md)
- Researched catalog: `opportunities.json` (65 real Stamford entries with source provenance), regenerated from `Mango_Stamford_Dataset.xlsx` via `python3 convert_to_json.py Mango_Stamford_Dataset.xlsx opportunities.json`
- Demo seed (`packages/seed-data`): 4 deterministic hero records, 3 unavailable-state records for failure paths, and 12 hand-curated personas — kept deliberately small so every demo claim is explainable

## Social matching

Matches are grounded, never invented: a persona qualifies only when the user's stored interests, the persona's interests, and the opportunity's tags all overlap. Social proof ("2 Mango members also into outdoors…") appears only after Mango has learned the user's interests *and* they've opted into social; real join counts outrank persona matches; JOIN confirmations name the actual stored matches. Hermes replies that claim people counts or bookings are rejected by validation and fall back to deterministic copy.

## Run the demo locally

Requires Node 22.5+ (the API uses the built-in `node:sqlite` driver). Copy `.env.example` to `.env` and replace secrets for any shared deployment. Install and verify:

```bash
npm install
npm run mango:typecheck
npm run mango:test
npm run mango:build
```

Start the deterministic API with `npm run start --workspace @mango/sms-api` and the mobile-first mockup with `npm run dev --workspace @mango/mango-web`. The API defaults to `http://localhost:3001`; use the simulator endpoint with `x-admin-token: demo-admin-token` or send a signed canonical request to `/v1/channels/android/inbound`.

The simulator preserves the same phone-scoped session, durable SQLite/WAL queue, grounding checks, 12-turn cap, STOP/START/HELP commands, signed app links, and JOIN path as the Android adapter. Run `npm run mango:load-test` for 100 interleaved deterministic phone conversations.

## Deploy

`deploy/` holds the EC2 templates: `mango-sms-api.service` (systemd unit for the API), `Caddyfile`, and the named Cloudflare Tunnel pair (`cloudflared-config.yml` + `cloudflared.service`) that exposes only the SMS API on a stable public hostname while Hermes stays on loopback. See [tunnel.md](tunnel.md) for the tunnel setup walkthrough.
