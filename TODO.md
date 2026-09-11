# Production follow-up

- [ ] Add an opt-in, no-SMS personality evaluation harness covering greetings,
  vague requests, matching and no-match recommendations, frustration, rough-day
  messages, conversational repair, and safety situations. Keep it out of the
  deterministic test suite, validate the JSON contract automatically, and save
  a concise transcript for human voice review without phone numbers or secrets.
- [ ] Add privacy-safe reliability telemetry for model latency, first-attempt
  success, JSON-repair success, terminal model failures, queue depth, and
  phone-offline events. Record only bounded reason codes and aggregate values;
  never record message bodies, phone numbers, event IDs, links, or credentials.
