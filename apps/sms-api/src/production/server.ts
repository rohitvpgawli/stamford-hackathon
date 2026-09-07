import Fastify from 'fastify';
import { equalSecret, errorCode, phone, redactText, SafeError, type Rpc, type Transport } from './core.js';

export interface IngressConfig { webhookSecret: string; adminSecret: string; deviceId: string; sim: number; receivingPhone?: string }
export function productionApp(rpc: Rpc, transport: Transport, config: IngressConfig) {
  // No automatic request/error serialization: gateway URLs may contain an auth
  // query token and request bodies contain SMS. Health returns aggregate data.
  const app = Fastify({ logger: false, bodyLimit: 8192, requestTimeout: 20_000 });
  app.setErrorHandler((error, _req, reply) => {
    const invalid = error instanceof SafeError && error.permanent;
    reply.code(invalid ? 400 : 503).send({ error: invalid ? error.code : 'temporarily_unavailable' });
  });
  app.get('/health', async () => ({ ok: true, service: 'mango-production-sms' }));
  app.get('/v1/admin/health', async (req, reply) => {
    if (!equalSecret(req.headers.authorization, `Bearer ${config.adminSecret}`)) return reply.code(401).send({ error: 'unauthorized' });
    const database = await rpc('health');
    let online = false;
    try { online = await transport.online(); } catch { /* Report unhealthy without exposing errors. */ }
    return reply.code(online && database.catalog_ready ? 200 : 503).send({ ...database, phone_online: online });
  });
  app.post('/v1/channels/android/webhook', async (req, reply) => {
    const query = req.query as Record<string, unknown>;
    if (!equalSecret(req.headers['x-mango-webhook-secret'], config.webhookSecret) &&
        !equalSecret(query.token, config.webhookSecret)) return reply.code(401).send({ error: 'unauthorized' });
    const body = req.body as Record<string, any>;
    // Status polling uses authenticated transport GETs; untrusted receipt fields
    // cannot promote an outbound job to delivered. MMS is not in scope.
    if (body?.event !== 'sms:received') return { accepted: true, ignored: true };
    const p = body.payload;
    if (body.deviceId !== config.deviceId || p?.simNumber !== config.sim) {
      return reply.code(403).send({ error: 'wrong_device_or_sim' });
    }
    // The authenticated configured device+SIM identifies Mango's existing line.
    // An explicitly configured receiving number is an additional optional check.
    if (config.receivingPhone && p.recipient && phone(p.recipient) !== config.receivingPhone) return reply.code(403).send({ error: 'wrong_recipient' });
    if (typeof p.messageId !== 'string' || !/^[A-Za-z0-9_.:-]{1,150}$/.test(p.messageId) ||
      typeof p.message !== 'string' || !p.message.trim() || p.message.length > 1000) throw new SafeError('invalid_payload', true);
    const receivedAt = Date.parse(p.receivedAt);
    if (!Number.isFinite(receivedAt) || receivedAt > Date.now() + 60_000) throw new SafeError('invalid_received_at', true);
    // Backlogged ordinary messages expire; STOP always applies, even offline.
    // Do not replay a stale START into a new consent grant.
    if (receivedAt < Date.now() - 600_000 && !/^(STOP|UNSUBSCRIBE|CANCEL|END|QUIT|STOPALL)$/i.test(p.message.trim())) {
      return { accepted: true, expired: true };
    }
    const result = await rpc('ingest', { phone: phone(p.sender), text: redactText(p.message.trim()),
      dedupe_key: `sms-gate:${config.deviceId}:${config.sim}:${p.messageId}` });
    return reply.code(result.duplicate ? 200 : 202).send({ accepted: true });
  });
  return app;
}

export function logFailure(error: unknown) {
  process.stderr.write(`${JSON.stringify({ event: 'mango_worker_error', code: errorCode(error) })}\n`);
}
