# Mango Hermes Profile

The live installation is an isolated Hermes profile named `mango`. Its system identity lives in `SOUL.md`; `skills/mango-concierge` documents the grounded recommendation and profile-proposal contract; `config.overlay.yaml` records the non-secret runtime settings.

The API server binds only to `127.0.0.1:8643`. `API_SERVER_KEY` is stored with mode `0600` in the profile `.env`, and the matching `HERMES_API_KEY` is stored in the ignored project `.env`. Never commit either value.

Useful checks:

```bash
mango config check
mango gateway status
curl http://127.0.0.1:8643/health
```

The SMS API calls `POST /v1/chat/completions` with an authenticated bearer token, a Mango session UUID in `X-Hermes-Session-Id`, and the inbound message ID as `Idempotency-Key`. Mango's TypeScript orchestrator remains authoritative for commands, safety, turn limits, JOIN, delivery, grounding, and profile persistence.
