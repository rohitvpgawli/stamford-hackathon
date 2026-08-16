# Stamford Hackathon — Mango

Mango is a Stamford-focused quality-of-life and civic engagement platform that helps residents and UConn Stamford students discover meaningful nearby activities, meet compatible people, and participate in their city.

## Product requirements

- [Implementation-ready PRD](docs/Mango_Hackathon_PRD.md)
- [Formatted Word PRD](docs/Mango_Hackathon_PRD.docx)

## Data

- [Data status report](docs/DATA_STATUS_REPORT.md)
- [Handoff notes for Rohit](docs/HANDOFF_FOR_ROHIT.md)
- Seed data: `packages/seed-data/opportunities.json`, source spreadsheet: `data/Mango_Stamford_Dataset.xlsx`

The hackathon build uses an Android local-SIM SMS gateway as the hero interface, Hermes Agent on EC2, progressively learned preferences, seeded Stamford opportunities and social matches, deterministic safety and rate limits, and a personalized app mockup for deeper exploration.

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
