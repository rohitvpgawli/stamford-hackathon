// Provision a separate, gated-off environment. No network or service operations.
import { mkdirSync, readFileSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
export const defaults = {
  agent: `${repo}/.env`, web: '/home/ubuntu/mango/.env',
  output: '/home/ubuntu/.config/mango/magic-link.env',
};
const gatewayKeys = ['ANDROID_GATEWAY_BASE_URL', 'ANDROID_GATEWAY_USERNAME',
  'ANDROID_GATEWAY_PASSWORD', 'ANDROID_GATEWAY_DEVICE_ID', 'ANDROID_GATEWAY_SIM_NUMBER', 'WEBHOOK_SHARED_SECRET'];
function required(env, key, aliases = []) {
  const value = [key, ...aliases].map(k => env[k]).find(Boolean);
  if (!value || !value.trim() || /replace|placeholder|your-/i.test(value)) throw new Error(`Missing or placeholder ${key}`);
  if (value !== value.trim() || /[\r\n\0]/.test(value)) throw new Error(`Invalid ${key}`);
  return value;
}
function https(value, key, originOnly = false) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`Invalid ${key}`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      (originOnly && url.origin !== value)) throw new Error(`Invalid ${key}`);
}
// Use the common literal subset of Node dotenv and systemd EnvironmentFile.
// Single quotes preserve backslashes; double quotes are safe without escapes.
export function serializeEnv(env) {
  return Object.entries(env).map(([key, value]) => {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || /[\r\n\0]/.test(value)) throw new Error('Unsupported environment serialization');
    const quote = !value.includes("'") ? "'" : !/["\\]/.test(value) ? '"' : undefined;
    if (!quote) throw new Error(`Unsupported characters in ${key}`);
    return `${key}=${quote}${value}${quote}\n`;
  }).join('');
}
export function configureProduction(receivingPhone, paths = defaults) {
  if (receivingPhone !== undefined && (typeof receivingPhone !== 'string' || !/^\+1[2-9]\d{9}$/.test(receivingPhone))) throw new Error('Provide --phone with the Mango receiving number in US +E164 format');
  let agent, web;
  try { agent = parseEnv(readFileSync(paths.agent, 'utf8')); web = parseEnv(readFileSync(paths.web, 'utf8')); }
  catch { throw new Error('Cannot read source configuration'); }
  const env = {
    MANGO_PRODUCTION_ENABLED: 'false', WEB_MAGIC_LINK_READY: 'false', PORT: '3002',
    SUPABASE_URL: required(web, 'SUPABASE_URL', ['supabase_url', 'NEXT_PUBLIC_SUPABASE_URL']),
    SUPABASE_SECRET_KEY: required(web, 'SUPABASE_SECRET_KEY', ['SUPABASE_SERVICE_ROLE_KEY', 'supabase_secret_key', 'supabase_service_role_key']),
    APP_URL: required(web, 'APP_URL'), MANGO_LOGIN_SECRET: required(web, 'MANGO_LOGIN_SECRET'),
    MANGO_OUTBOX_KEY: randomBytes(32).toString('base64'), ADMIN_TOKEN: randomBytes(32).toString('hex'),
    ...(receivingPhone ? { MANGO_RECEIVING_PHONE: receivingPhone } : {}),
    ...Object.fromEntries(gatewayKeys.map(key => [key, required(agent, key)])),
  };
  https(env.SUPABASE_URL, 'SUPABASE_URL');
  https(env.APP_URL, 'APP_URL', true);
  https(env.ANDROID_GATEWAY_BASE_URL, 'ANDROID_GATEWAY_BASE_URL');
  if (!['1', '2'].includes(env.ANDROID_GATEWAY_SIM_NUMBER)) throw new Error('Invalid ANDROID_GATEWAY_SIM_NUMBER');
  for (const key of ['SUPABASE_SECRET_KEY', 'MANGO_LOGIN_SECRET', 'WEBHOOK_SHARED_SECRET']) {
    if (env[key].length < 32) throw new Error(`Too short ${key}`);
  }
  const serialized = serializeEnv(env);
  mkdirSync(dirname(paths.output), { recursive: true, mode: 0o700 });
  let fd;
  try { fd = openSync(paths.output, 'wx', 0o600); }
  catch { throw new Error('Output already exists or cannot be created; nothing overwritten'); }
  try { writeFileSync(fd, serialized); }
  catch { throw new Error('Could not finish writing protected configuration; inspect the output before retrying'); }
  finally { closeSync(fd); }
  return { created: true, gates: 'closed', servicesStarted: false };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 0 && (args.length !== 2 || args[0] !== '--phone')) throw new Error('Usage: node apps/sms-api/scripts/configure-production.mjs [--phone +E164]');
    configureProduction(args[1]);
    console.log('Created protected production configuration. Both release gates are false. No service started.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
