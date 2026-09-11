# Mango production SMS service

This repository contains the production SMS ingress and worker for
[stamford.fyi](https://stamford.fyi). It accepts authenticated SMS Gate
callbacks through Cloudflare Tunnel, stores authoritative state in Supabase,
uses an isolated tool-free Hermes profile for conversation, and issues
single-use website magic links.

## Production layout

- `apps/sms-api/src/production/`: deterministic worker and HTTP ingress
- `apps/sms-api/test/production*.ts`: production behavior and security tests
- `apps/sms-api/scripts/`: guarded configuration, profile, and preflight tools
- `deploy/`: systemd, Cloudflare Tunnel, and Hermes profile templates
- `docs/`: live operations and magic-link contracts

The public website lives in the separate `mango` repository. Event catalog,
identity, queue, and conversation state live in the production Supabase project;
there is no local demo catalog or SQLite runtime.

## Verify

```bash
npm install
npm run typecheck
npm test
npm run build
npm run preflight
```

See [production operations](docs/MAGIC_LINK_OPERATIONS.md) for service and
health checks.
