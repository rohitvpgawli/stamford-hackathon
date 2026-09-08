// Read-only, offline configuration inspection. Never print values or exception bodies.
import { readFileSync, statSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
export const defaultPaths = {
  agent: `${repo}/.env`, web: '/home/ubuntu/mango/.env',
  production: '/home/ubuntu/.config/mango/magic-link.env',
  hermes: '/home/ubuntu/.config/mango/hermes-production.env',
  profileEnv: '/home/ubuntu/.hermes/profiles/mango-production/.env',
  profileSoul: '/home/ubuntu/.hermes/profiles/mango-production/SOUL.md',
  templateSoul: `${repo}/deploy/hermes-magic-link/SOUL.md`,
  profileConfig: '/home/ubuntu/.hermes/profiles/mango-production/config.yaml',
  templateConfig: `${repo}/deploy/hermes-magic-link/config.overlay.yaml`,
};
const required = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'APP_URL', 'MANGO_LOGIN_SECRET',
  'MANGO_OUTBOX_KEY', 'WEBHOOK_SHARED_SECRET', 'ADMIN_TOKEN',
  'ANDROID_GATEWAY_BASE_URL', 'ANDROID_GATEWAY_USERNAME', 'ANDROID_GATEWAY_PASSWORD',
  'ANDROID_GATEWAY_DEVICE_ID', 'ANDROID_GATEWAY_SIM_NUMBER', 'HERMES_BASE_URL', 'HERMES_API_KEY'];
const aliases = { SUPABASE_URL: ['supabase_url', 'NEXT_PUBLIC_SUPABASE_URL'],
  SUPABASE_SECRET_KEY: ['SUPABASE_SERVICE_ROLE_KEY', 'supabase_secret_key', 'supabase_service_role_key'] };
function value(env, key) { return [key, ...(aliases[key] || [])].map(k => env[k]).find(Boolean); }
function present(v) { return typeof v === 'string' && v.trim().length > 0 && !/replace|placeholder|your-/i.test(v); }
function read(path) { try { return readFileSync(path, 'utf8'); } catch { return null; } }
function envFile(path) {
  const source = read(path);
  if (source === null) return { status: 'missing_or_unreadable', env: {} };
  try { return { status: 'present', permissions: (statSync(path).mode & 0o077) ? 'too_broad' : 'private', env: parseEnv(source) }; }
  catch { return { status: 'invalid', env: {} }; }
}
function compare(a, b) { return !present(a) || !present(b) ? 'unavailable' : a === b ? 'match' : 'mismatch'; }
function drift(a, b) { const x = read(a), y = read(b); return x === null || y === null ? 'unavailable' : x === y ? 'match' : 'drift'; }
export function inspect(paths = defaultPaths) {
  const files = Object.fromEntries(['agent', 'web', 'production', 'hermes', 'profileEnv'].map(k => [k, envFile(paths[k])]));
  const effective = { ...files.production.env, ...files.hermes.env };
  const config = Object.fromEntries(required.map(key => {
    const v = value(effective, key);
    const sources = ['agent', 'web', 'hermes'].filter(source => present(value(files[source].env, key)));
    return [key, { status: present(v) ? 'present' : 'missing_or_placeholder', reusable_from: sources }];
  }));
  const checks = {};
  for (const key of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'APP_URL', 'MANGO_LOGIN_SECRET']) {
    checks[`${key}_web_match`] = compare(value(effective, key), value(files.web.env, key));
  }
  checks.HERMES_API_KEY_profile_match = compare(effective.HERMES_API_KEY, files.profileEnv.env.API_SERVER_KEY);
  checks.OPENROUTER_API_KEY_profile = present(files.profileEnv.env.OPENROUTER_API_KEY) ? 'present' : 'missing_or_placeholder';
  checks.profile_voice = drift(paths.profileSoul, paths.templateSoul);
  checks.profile_config = drift(paths.profileConfig, paths.templateConfig);
  checks.gateway_sim = present(effective.ANDROID_GATEWAY_SIM_NUMBER)
    ? ['1', '2'].includes(effective.ANDROID_GATEWAY_SIM_NUMBER) ? 'valid' : 'invalid' : 'unavailable';
  checks.outbox_key = present(effective.MANGO_OUTBOX_KEY)
    ? Buffer.from(effective.MANGO_OUTBOX_KEY, 'base64').length === 32 ? 'valid_length' : 'invalid_length' : 'unavailable';
  for (const key of ['MANGO_LOGIN_SECRET', 'WEBHOOK_SHARED_SECRET', 'ADMIN_TOKEN', 'HERMES_API_KEY']) {
    checks[`${key}_length`] = present(effective[key]) ? effective[key].length >= 32 ? 'sufficient' : 'too_short' : 'unavailable';
  }
  return {
    mode: 'offline_read_only_no_network_no_sms_no_database_writes',
    files: Object.fromEntries(Object.entries(files).map(([k, { env: _env, ...status }]) => [k, status])),
    configuration: config,
    gates: Object.fromEntries(['MANGO_PRODUCTION_ENABLED', 'WEB_MAGIC_LINK_READY'].map(key =>
      [key, effective[key] === 'true' ? 'open' : effective[key] === 'false' ? 'closed' : 'unset_or_invalid'])),
    checks,
    optional: { MANGO_RECEIVING_PHONE: present(effective.MANGO_RECEIVING_PHONE) ? 'present' : 'unset_device_and_sim_binding_used' },
    note: 'Presence is not credential validation. Reusable means locally configured, not verified or copied. This does not establish release readiness.',
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(inspect(), null, 2));
}
