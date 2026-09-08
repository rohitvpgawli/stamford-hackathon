import Fastify from 'fastify';
import { equalSecret, errorCode, phone, redactText, SafeError, type Rpc, type Transport } from './core.js';

export interface IngressConfig { webhookSecret: string; adminSecret: string; deviceId: string; sim: number; receivingPhone?: string }
function inboundText(event: string, payload: Record<string, any>): string {
  if (event === 'sms:received') return payload.message;
  if (event === 'mms:downloaded') return payload.body || payload.subject;
  // Data SMS is a separate binary transport, not the regular text-message
  // event. Accept only canonical base64 containing bounded, valid UTF-8 text.
  const encoded = payload.data;
  if (typeof encoded !== 'string' || encoded.length > 5336 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new SafeError('invalid_payload', true);
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw new SafeError('invalid_payload', true);
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new SafeError('invalid_payload', true); }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) throw new SafeError('invalid_payload', true);
  return text;
}
export function productionApp(rpc: Rpc, transport: Transport, config: IngressConfig) {
  // No automatic request/error serialization: gateway URLs may contain an auth
  // query token and request bodies contain SMS. Health returns aggregate data.
  // MMS callbacks may include attachments; retain a bounded envelope while
  // processing only the text body/subject (never attachment data or URLs).
  const app = Fastify({ logger: false, bodyLimit: 32 * 1024, requestTimeout: 20_000 });
  app.setErrorHandler((error, _req, reply) => {
    const invalid = error instanceof SafeError && error.permanent;
    if ((error as { code?: string }).code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.code(413).send({ error: 'payload_too_large' });
    }
    reply.code(invalid ? 400 : 503).send({ error: invalid ? error.code : 'temporarily_unavailable' });
  });
  // Only fixed outcomes and allowlisted event names; never serialize request
  // URLs (query credentials), bodies, message IDs, phone numbers, or errors.
  app.addHook('onResponse', async (req, reply) => {
    if (req.routeOptions.url !== '/v1/channels/android/webhook') return;
    const event = (req.body as Record<string, unknown> | null)?.event;
    const known = ['sms:received', 'sms:data-received', 'mms:received', 'mms:downloaded',
      'sms:sent', 'sms:delivered', 'sms:failed', 'app:started'];
    process.stdout.write(`${JSON.stringify({ event: 'mango_ingress',
      gateway_event: typeof event === 'string' && known.includes(event) ? event : 'other',
      status: reply.statusCode })}\n`);
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
    // cannot promote an outbound job to delivered. Initial MMS notifications
    // have no downloaded content and must not create a second conversation job.
    if (!['sms:received', 'sms:data-received', 'mms:received', 'mms:downloaded'].includes(body?.event)) return { accepted: true, ignored: true };
    const p = body.payload;
    const callbackDevice = body.deviceId ?? p?.deviceId;
    const callbackSim = Number(p?.simNumber);
    if (callbackDevice !== config.deviceId || !Number.isInteger(callbackSim) || callbackSim !== config.sim) {
      return reply.code(403).send({ error: 'wrong_device_or_sim' });
    }
    // The authenticated configured device+SIM identifies Mango's existing line.
    // An explicitly configured receiving number is an additional optional check.
    if (config.receivingPhone && p.recipient && phone(p.recipient) !== config.receivingPhone) return reply.code(403).send({ error: 'wrong_recipient' });
    if (body.event === 'mms:received') return { accepted: true, waiting_for_download: true };
    const message = inboundText(body.event, p);
    if (typeof p.messageId !== 'string' || !/^[A-Za-z0-9_.:-]{1,150}$/.test(p.messageId) ||
      typeof message !== 'string' || !message.trim() || message.length > 1000) throw new SafeError('invalid_payload', true);
    const receivedAt = Date.parse(p.receivedAt);
    if (!Number.isFinite(receivedAt) || receivedAt > Date.now() + 60_000) throw new SafeError('invalid_received_at', true);
    // Backlogged ordinary messages expire; STOP always applies, even offline.
    // Do not replay a stale START into a new consent grant.
    if (receivedAt < Date.now() - 600_000 && !/^(STOP|UNSUBSCRIBE|CANCEL|END|QUIT|STOPALL)$/i.test(message.trim())) {
      return { accepted: true, expired: true };
    }
    const sender = p.sender ?? p.phoneNumber;
    const result = await rpc('ingest', { phone: phone(sender), text: redactText(message.trim()),
      dedupe_key: `sms-gate:${config.deviceId}:${config.sim}:${p.messageId}` });
    return reply.code(result.duplicate ? 200 : 202).send({ accepted: true });
  });
  return app;
}

export function logFailure(error: unknown) {
  process.stderr.write(`${JSON.stringify({ event: 'mango_worker_error', code: errorCode(error) })}\n`);
}
