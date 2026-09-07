import assert from 'node:assert/strict';
import { HermesConversation } from '../.production-dist/clients.js';
const base = process.argv[2];
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
const model = new HermesConversation(base, 'synthetic-test-key');
const input = { text: 'Suggest an event in 2026', plans: [], history: [], selectedPlan: null };
for (let i = 0; i < 2; i++) {
  assert.equal((await model.respond(input)).text, 'Tell me what kind of event you want in 2026.');
}
await assert.rejects(new HermesConversation(base, 'wrong-key').respond(input), /hermes_unavailable/);
await assert.rejects(model.respond({ ...input, text: 'provider_fail' }), /incomplete_model_response/);
console.log('TypeScript client passed through the real Hermes adapter.');
