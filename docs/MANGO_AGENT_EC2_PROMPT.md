# Prompt for Astra in the EC2 Mango Agent repository

Paste the following into your Astra Codex CLI session from the Hermes/Mango Agent repository after copying both handoff docs into its `docs/` directory.

---

Turn this existing Hermes-based Mango Agent from a hackathon SQLite/seed-data prototype into a production SMS agent. First read repository instructions and `docs/MAGIC_LINK_HANDOFF.md` and `docs/SMS_HANDOFF.md`. Inspect the real runtime, phone/SMS bridge, schema, credentials configuration, and deployment before choosing implementation details. Never print secrets or inspect unrelated personal messages.

Implement both journeys: (1) a user texts Mango and receives an event-specific magic link; (2) a website login job supplies a phone number and Mango texts its sign-in link. Authentication is exclusively SMS-delivered magic links: no numeric codes, code-entry UI, or Supabase SMS provider. Account creation is not a session. Ensure one Supabase Auth account per normalized phone on first contact; website input must not confirm ownership. Honor the documented dependency on web-side redemption/phone-confirmation changes.

Keep the conversational Hermes layer, but put identity, recipient binding, link issuance, and sending in deterministic restricted tools outside LLM context. Use Supabase for real events and durable contacts/conversations/jobs/outbox; remove seed-data dependencies from production. Implement authenticated inbound ingestion, deduplication, atomic worker leases, bounded retries, uncertain-send reconciliation, STOP/HELP/suppression, phone-offline recovery, and protected short-lived link handling. Never fetch a login link to check it. Do not assume transport delivery receipts or idempotency exist; inspect the adapter and document limitations.

Use the current web link API exactly as documented. Implement the proposed private Supabase queue worker and versioned migrations/RPCs, coordinating schema with the web repo. If the web repository is available, implement its missing request endpoint/form and redemption hardening there too; otherwise write `docs/WEB_REQUIRED_CHANGES.md` with exact API/schema requirements and failing integration cases. Do not pretend agent work alone completes the website journey.

Deliver working code, meaningful tests for both journeys and restart/duplicate/failure/security cases, `.env.example` with placeholders only, deployment supervision appropriate to this EC2 setup, a migration/backup/rollback runbook, and an updated production readiness checklist. Preserve existing real data; isolate seed fixtures. Implement and test all locally possible work; clearly report missing infrastructure or web dependencies. Do not send live SMS, apply destructive migrations, or switch production traffic without explicit authorization. End with a brief list of changes, tests, remaining web changes, and exact configuration needed. Do not claim the phone bridge exempts this traffic from carrier requirements.
