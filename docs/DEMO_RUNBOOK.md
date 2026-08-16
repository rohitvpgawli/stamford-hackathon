# Mango demo runbook

1. Install Node 22.5+, copy `.env.example` to `.env`, and set non-demo secrets.
2. Run `npm install`, `npm run typecheck`, `npm test`, and `npm run build`.
3. Run the API with `npm run start --workspace @mango/sms-api`; serve the web app with `npm run dev --workspace @mango/mango-web`.
4. For EC2, install `deploy/mango-sms-api.service`, set `DATABASE_URL=./data/mango.sqlite`, and put Caddy in front of port 3001 using `deploy/Caddyfile`.
5. Verify `GET /health`, then send a canonical inbound webhook with `X-Mango-Webhook-Secret`.
6. If the SIM is delayed, use `/v1/demo/simulate-inbound` with the admin token. Monitor `/v1/admin/health` for inbound/outbound queue depth and oldest timestamps.
7. Reset only seeded demo state with `POST /v1/admin/demo/reset` and the admin token. Never use demo secrets on a public deployment.

Real Android gateway and Hermes credentials are intentionally pending deployment configuration; deterministic simulators remain the default and exercise the same contracts.
