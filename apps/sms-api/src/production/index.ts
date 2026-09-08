import { Vault, Worker, SafeError, phone } from './core.js';
import { Supabase, MagicLinkIssuer, SmsGate, HermesConversation } from './clients.js';
import { productionApp, logFailure } from './server.js';

function required(name: string, min = 1): string {
  const value = process.env[name] || '';
  if (value.length < min || /replace|placeholder|your-/i.test(value)) throw new SafeError(`missing_${name.toLowerCase()}`, true);
  return value;
}
function origin(name: string, loopback = false): string {
  const value = required(name), url = new URL(value);
  if (url.username || url.password || url.search || url.hash ||
      !(url.protocol === 'https:' || (loopback && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new SafeError(`invalid_${name.toLowerCase()}`, true);
  }
  return value.replace(/\/$/, '');
}
async function main() {
  if (process.env.MANGO_PRODUCTION_ENABLED !== 'true' || process.env.WEB_MAGIC_LINK_READY !== 'true') {
    throw new SafeError('production_release_gate_closed', true);
  }
  const appUrl = origin('APP_URL');
  if (new URL(appUrl).origin !== appUrl) throw new SafeError('invalid_app_url', true);
  const db = new Supabase(origin('SUPABASE_URL'), required(process.env.SUPABASE_SECRET_KEY ? 'SUPABASE_SECRET_KEY' : 'SUPABASE_SERVICE_ROLE_KEY', 32));
  const health = await db.rpc('health');
  if (health.schema_version !== 1 || !health.catalog_ready) throw new SafeError('database_not_ready', true);
  const sim = Number(required('ANDROID_GATEWAY_SIM_NUMBER'));
  if (![1, 2].includes(sim)) throw new SafeError('invalid_sim', true);
  const deviceId = required('ANDROID_GATEWAY_DEVICE_ID');
  const transport = new SmsGate(origin('ANDROID_GATEWAY_BASE_URL'), required('ANDROID_GATEWAY_USERNAME'),
    required('ANDROID_GATEWAY_PASSWORD'), deviceId, sim);
  const worker = new Worker(db.rpc, db, new MagicLinkIssuer(appUrl, required('MANGO_LOGIN_SECRET', 32)), transport,
    new HermesConversation(origin('HERMES_BASE_URL', true), required('HERMES_API_KEY', 32)),
    new Vault(required('MANGO_OUTBOX_KEY')));
  const app = productionApp(db.rpc, transport, { deviceId, sim,
    receivingPhone: process.env.MANGO_RECEIVING_PHONE ? phone(process.env.MANGO_RECEIVING_PHONE) : undefined,
    webhookSecret: required('WEBHOOK_SHARED_SECRET', 32), adminSecret: required('ADMIN_TOKEN', 32) });
  let closing = false;
  let active: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (closing || active) return;
    active = worker.tick().then(() => {}, logFailure).finally(() => { active = undefined; });
  }, 1000);
  const shutdown = async () => {
    closing = true; clearInterval(timer);
    await app.close(); await active;
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
  await app.listen({ port: Number(process.env.PORT || 3002), host: '127.0.0.1' });
}
main().catch(error => { logFailure(error); process.exitCode = 1; });
