// Copy only Mango's refreshed model-provider key. Gateway keys stay independent.
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { parseEnv } from 'node:util';
const source = process.env.HERMES_PROVIDER_ENV || '/home/ubuntu/.config/mango/hermes-provider.env';
const target = '/home/ubuntu/.hermes/profiles/mango-production/.env';
const key = parseEnv(readFileSync(source, 'utf8')).OPENROUTER_API_KEY;
if (!key || /[\r\n]/.test(key)) throw new Error('Source provider key unavailable');
const original = readFileSync(target, 'utf8');
const previous = parseEnv(original);
if (!previous.API_SERVER_KEY || !/^OPENROUTER_API_KEY=/m.test(original)) throw new Error('Unexpected target environment');
const updated = original.replace(/^OPENROUTER_API_KEY=.*$/m, () => `OPENROUTER_API_KEY=${JSON.stringify(key)}`);
if (parseEnv(updated).API_SERVER_KEY !== previous.API_SERVER_KEY) throw new Error('Gateway key must remain unchanged');
writeFileSync(target, updated, { mode: 0o600 });
chmodSync(target, 0o600);
console.log('Provider key synchronized; independent gateway key preserved.');
