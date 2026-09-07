# Mango production readiness

Current scope, 2026-09-07: adapt the existing Mango SMS agent for phone-only
magic links. Website changes belong to the other agent via
website-changes-handoff.md, which supersedes earlier website implementation plans.

Completed locally:
- Existing Mango model and conversational personality adapted to mango-production.
- Supabase phone identity, real event mapping and durable SMS queue retained.
- Web jobs send warm welcome + sign-in link; SMS recommendations include the
  selected event's magic link in the same message. No auto-RSVP.
- Existing SMS Gate credentials/device/SIM reused; protected worker environment
  created with both release gates false and new local outbox/admin keys.
- Optional receiving-number guard; device/SIM and authenticated webhook mandatory.
- Sequential production/SQL/config tests and production build pass.
- Updated isolated Hermes gateway reloaded; real synthetic greeting passes.
- SMS Gate authenticated device-metadata check passes; existing configured
  device is online. No inbox/history was read and no text was sent.
- Worker systemd unit installed and registered, but not enabled or started.
- Redundant earlier implementation/profile/website-requirements plans removed.

Not released:
- No website edits in this pass; earlier local uncommitted draft remains for
  web owner review, not automatic deployment.
- No production migrations, SMS sends, webhook/tunnel switch or worker start.
- Real phone payload, browser authentication and both live journeys await
  coordinated web readiness and controlled acceptance.
- No legacy SQLite contacts, personal history or synthetic matches imported.

Existing mango SMS service and its Hermes gateway were not restarted in this
pass. Earlier work had a memory-pressure incident and recovered both gateways;
keep tests sequential on this small host. No backup taken, per user's waiver.
