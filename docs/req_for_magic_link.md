# What is still needed

Agent-side code/profile/configuration are prepared. Use the SAME existing Mango
SMS Gate account, device, SIM and phone number. No new phone or model key needed.

1. Hand docs/website-changes-handoff.md to the web-app agent. They own only the
   login flow, matching shared migrations and website deployment. EC2 does not
   need Vercel access.
2. Have that agent confirm the shared Supabase schema, phone ownership handling,
   request endpoint and issuer/redemption are deployed and tested.
3. Then authorize one controlled live SMS/browser test and the webhook cutover.

Protected configuration has been created at
/home/ubuntu/.config/mango/magic-link.env using the existing credentials.
New outbox/admin keys were generated locally; do not paste keys into chat.
Both release gates remain false. The SMS worker is not running.
MANGO_RECEIVING_PHONE is an optional additional recipient check, not a request
for a different number: required device/SIM attribution already selects the line.

Run node apps/sms-api/scripts/production-preflight.mjs for an offline status-only
check. Presence does not prove live delivery. Backup was waived; nothing has
been deployed to the website or migrated in production by this pass.
