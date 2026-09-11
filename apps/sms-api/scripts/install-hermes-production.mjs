// One-time installation, deliberately refuses to overwrite any existing profile
// or credentials. No service start, SMS send, database or model API call.
import { existsSync, mkdirSync, chmodSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const repo = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const profile = '/home/ubuntu/.hermes/profiles/mango-production';
const credentialDir = '/home/ubuntu/.config/mango';
const fragment = `${credentialDir}/hermes-production.env`;
const unit = '/home/ubuntu/.config/systemd/user/hermes-gateway-magic-link.service';
for (const path of [profile, fragment, unit]) {
  if (existsSync(path)) throw new Error('Installation target already exists; inspect it before updating.');
}
// Read only the dedicated provider credential; never couple production setup
// to another Hermes profile's auth sessions, conversations, or state.
const providerSource = process.env.HERMES_PROVIDER_ENV || '/home/ubuntu/.config/mango/hermes-provider.env';
const providerKey = parseEnv(readFileSync(providerSource, 'utf8')).OPENROUTER_API_KEY;
if (!providerKey || /[\r\n]/.test(providerKey)) throw new Error('Mango provider credential is unavailable.');
execFileSync('/home/ubuntu/.hermes/hermes-agent/venv/bin/python', [
  '-m', 'hermes_cli.main', 'profile', 'create', 'mango-production', '--no-skills', '--no-alias',
  '--description', 'Tool-free production Mango events conversation; identity and SMS remain in deterministic backend tools.'
], { cwd: '/home/ubuntu/.hermes/hermes-agent', stdio: 'pipe' });
chmodSync(profile, 0o700);
copyFileSync(`${repo}/deploy/hermes-magic-link/config.overlay.yaml`, `${profile}/config.yaml`);
copyFileSync(`${repo}/deploy/hermes-magic-link/SOUL.md`, `${profile}/SOUL.md`);
const gatewayKey = randomBytes(32).toString('hex');
// The CLI just created this .env; only replace that newly created file.
writeFileSync(`${profile}/.env`, `OPENROUTER_API_KEY=${providerKey}\nAPI_SERVER_KEY=${gatewayKey}\n`, { mode: 0o600 });
chmodSync(`${profile}/.env`, 0o600);
mkdirSync(credentialDir, { recursive: true, mode: 0o700 });
writeFileSync(fragment, `HERMES_BASE_URL=http://127.0.0.1:8644\nHERMES_API_KEY=${gatewayKey}\n`, { flag: 'wx', mode: 0o600 });
mkdirSync('/home/ubuntu/.config/systemd/user', { recursive: true });
copyFileSync(`${repo}/deploy/hermes-gateway-magic-link.service`, unit);
console.log('Installed mango-production, matching protected client credentials, and gateway unit. No service started.');
