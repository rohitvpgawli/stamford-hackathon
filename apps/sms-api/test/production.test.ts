import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { Vault, Worker, SafeError, phone, redactText, type Rpc, type Json, type Job, type Outcome } from '../src/production/core.js';
import { Supabase, MagicLinkIssuer, SmsGate, HermesConversation, type Http } from '../src/production/clients.js';
import { productionApp } from '../src/production/server.js';

// Real PostgreSQL engine in WASM, isolated in memory. All external APIs are
// explicit doubles. These tests never read .env or contact the deployed app.
let db: PGlite;
const number = '+12035550123', planId = '11111111-1111-4111-8111-111111111111';
const vault = new Vault(Buffer.alloc(32, 7).toString('base64'));
test('Supabase secret keys use apikey only; legacy JWT keys retain bearer authentication', async () => {
  for (const key of ['sb_secret_test-only', 'legacy-jwt-test-only']) {
    const http: Http = async (_url, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('apikey'), key);
      assert.equal(headers.get('authorization'), key.startsWith('sb_secret_') ? null : `Bearer ${key}`);
      return Response.json({ id: 'existing-user' });
    };
    assert.equal(await new Supabase('https://isolated.supabase.test', key, http).ensure(number), 'existing-user');
  }
});
const rpc: Rpc = async (op, p = {}) => {
  const result = await db.query<{ result: any }>('select public.mango_agent_v1($1,$2::jsonb) as result', [op, JSON.stringify(p)]);
  return result.rows[0].result;
};
const lease = (j: Job) => ({ id: j.id, lease_token: j.lease_token });
async function jobs() { return (await db.query<Json>('select * from mango_private.login_requests order by created_at,id')).rows; }
async function readyAgain() { await db.exec("update mango_private.login_requests set next_attempt_at=now()-interval '1 second',lease_until=null,lease_token=null"); }
async function ingest(text: string, id: string = randomUUID()) { return rpc('ingest', { phone: number, text, dedupe_key: id }); }
function harness(options: { outcome?: Outcome; status?: Outcome; offline?: boolean; failIssue?: boolean;
  reply?: { text: string; planId: string | null } } = {}) {
  const sends: Json[] = [], issues: Json[] = [], prompts: Json[] = [];
  let online = !options.offline;
  let status: Outcome = options.status || 'delivered';
  const identity = { async ensure(value: string) {
    const existing = await rpc('lookup_user', { phone: value });
    if (existing.id) return existing.id as string;
    const id = randomUUID();
    await db.query('insert into auth.users(id,phone) values($1,$2)', [id, value.substring(1)]);
    return id;
  } };
  const issuer = { async issue(to: string, plan: string | null) {
    issues.push({ to, plan });
    if (options.failIssue) throw new SafeError('issuer_http_400', true);
    return { url: 'https://mango.example/l/secret-bearer', expiresAt: new Date(Date.now() + 600000).toISOString() };
  } };
  const transport = { async online() { return online; }, async send(to: string, text: string, id: string, ttl: number) {
    sends.push({ to, text, id, ttl }); return options.outcome || 'accepted' as Outcome;
  }, async status(_id: string) { return status; } };
  const conversation = { async respond(input: any) {
    prompts.push(input); return options.reply || { text: 'Try the real upcoming event. View it and decide if it is your kind of plan.', planId };
  } };
  return { worker: new Worker(rpc, identity, issuer, transport, conversation, vault), transport, sends, issues, prompts,
    setOnline(value: boolean) { online = value; }, setStatus(value: Outcome) { status = value; } };
}

before(async () => {
  db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,phone text unique,phone_confirmed_at timestamptz,email text);');
  await db.exec(await readFile(new URL('../migrations/001_magic_link.sql', import.meta.url), 'utf8'));
  await db.exec(`create table public.test_plans(id uuid primary key,title text,description text,starts_at timestamptz,venue text,live boolean,demo boolean);
    create or replace view mango_private.live_plans as select id,title,description,starts_at,venue from public.test_plans where live and not demo and starts_at>now();`);
});
beforeEach(async () => {
  await db.exec(`truncate mango_private.conversations,mango_private.outbox,mango_private.login_requests,mango_private.contacts,auth.users,public.test_plans cascade;
    update mango_private.settings set catalog_ready=true;
    insert into public.test_plans values('${planId}','Real event','Public event',now()+interval '1 day','Stamford',true,false);`);
});
after(async () => { await db.close(); });

test('phone normalization, redaction, authenticated encryption and job binding', () => {
  assert.equal(phone('(203) 555-0123'), number);
  assert.throws(() => phone('+442055550123'));
  assert.throws(() => phone('ask +12035550123'));
  assert.equal(redactText('Hi +12035550123 https://mango.example/l/token'), 'Hi [phone] [link]');
  const cipher = vault.seal('secret link', 'job1');
  assert.equal(vault.open(cipher, 'job1'), 'secret link');
  assert.throws(() => vault.open(cipher, 'job2'));
  assert.throws(() => vault.open(cipher.slice(2), 'job1'));
  assert.throws(() => new Vault('short'));
});

test('website journey: private job -> unconfirmed account -> encrypted outbox -> accepted -> delivered', async () => {
  assert.deepEqual(await rpc('enqueue_web', { phone: number, plan_id: planId }), { accepted: true });
  const h = harness();
  await h.worker.tick();
  assert.equal((await jobs())[0].status, 'ready');
  const stored = (await db.query<Json>('select * from mango_private.outbox')).rows;
  assert.equal(stored.length, 1);
  assert.ok(!JSON.stringify(stored).includes('secret-bearer'));
  assert.ok(!JSON.stringify(await jobs()).includes('secret-bearer'));
  assert.equal((await db.query<Json>('select * from auth.users')).rows[0].phone_confirmed_at, null);
  await h.worker.tick();
  assert.equal(h.sends.length, 1);
  assert.equal(h.sends[0].to, number);
  assert.ok(h.sends[0].text.includes('/l/secret-bearer'));
  assert.match(h.sends[0].text, /^Welcome to Mango!/);
  assert.equal((await jobs())[0].status, 'accepted');
  assert.equal((await db.query('select * from mango_private.outbox')).rows.length, 0);
  await readyAgain(); await h.worker.tick();
  assert.equal((await jobs())[0].status, 'delivered');
  assert.deepEqual(h.issues, [{ to: number, plan: planId }]);
});

test('SMS recommendation includes real event magic link in the same message, without auto-RSVP', async () => {
  await ingest('Find me an event');
  const h = harness();
  await h.worker.tick(); await h.worker.tick(); await h.worker.tick();
  assert.equal(h.issues.length, 1);
  assert.equal(h.sends.length, 1);
  assert.match(h.sends[0].text, /^Try the real upcoming event/);
  assert.match(h.sends[0].text, /View your event and sign in: https:\/\/mango.example\/l\/secret-bearer/);
  await readyAgain(); await h.worker.tick();
  await ingest('join');
  await h.worker.tick(); await h.worker.tick(); await h.worker.tick();
  assert.equal(h.issues.length, 2);
  assert.equal(h.issues[0].plan, planId);
  assert.ok(!JSON.stringify(h.prompts).includes(number));
  assert.ok(!JSON.stringify(h.prompts).includes('secret-bearer'));
  assert.equal((await db.query('select * from auth.users')).rows.length, 1);
});

test('conversational name/preferences and follow-up history persist without minting links', async () => {
  const h = harness({ reply: { text: 'Nice to meet you, Alex. Outdoors, food, or anything works?', planId: null } });
  await ingest('I am Alex and want something relaxed');
  await h.worker.tick(); await h.worker.tick(); await h.worker.tick();
  await readyAgain(); await h.worker.tick();
  await ingest('Outdoors please');
  await h.worker.tick();
  assert.equal(h.issues.length, 0);
  assert.equal(h.prompts.length, 2);
  assert.ok(h.prompts[1].history.some((entry: Json) => entry.text.includes('Alex')));
  assert.ok(h.prompts[1].history.some((entry: Json) => entry.text.includes('relaxed')));
});

test('bare commitment without prior selection asks which event instead of inventing one', async () => {
  await ingest('yes please');
  const h = harness();
  await h.worker.tick(); await h.worker.tick(); await h.worker.tick();
  assert.equal(h.prompts.length, 0);
  assert.equal(h.issues.length, 0);
  assert.match(h.sends[0].text, /Which event/);
});

test('natural join request reuses selected plan and avoids another model decision', async () => {
  await ingest('Find an event');
  const h = harness();
  await h.worker.tick(); await h.worker.tick(); await h.worker.tick();
  await readyAgain(); await h.worker.tick();
  await ingest('sign me up');
  await h.worker.tick(); await h.worker.tick(); await h.worker.tick();
  assert.equal(h.prompts.length, 1);
  assert.deepEqual(h.issues.map(issue => issue.plan), [planId, planId]);
  assert.match(h.sends[1].text, /Joining is confirmed in the app/);
});

test('duplicate inbound and website resend bursts produce one job', async () => {
  await ingest('hello', 'same-id');
  assert.equal((await ingest('hello', 'same-id')).duplicate, true);
  await rpc('enqueue_web', { phone: number }); await rpc('enqueue_web', { phone: number });
  assert.equal((await jobs()).length, 2);
});

test('leases are exclusive per contact and fence stale workers after restart', async () => {
  await ingest('hello'); await ingest('another message');
  const first = await rpc<Job>('claim');
  assert.equal(await rpc('claim'), null);
  await db.query("update mango_private.login_requests set lease_until=now()-interval '1 second' where id=$1", [first.id]);
  const reclaimed = await rpc<Job>('claim');
  assert.equal(reclaimed.id, first.id);
  assert.notEqual(reclaimed.lease_token, first.lease_token);
  await assert.rejects(rpc('context', lease(first)), /lease_lost/);
});

test('crash after authorizing a send only reconciles, even when transport returns unknown', async () => {
  await rpc('enqueue_web', { phone: number });
  const h = harness({ status: 'uncertain' });
  await h.worker.tick();
  const j = await rpc<Job>('claim');
  await rpc('authorize_send', lease(j));
  await readyAgain();
  await h.worker.tick();
  assert.equal(h.sends.length, 0);
  assert.equal((await jobs())[0].status, 'uncertain');
  for (let n = 0; n < 9; n++) { await readyAgain(); await h.worker.tick(); }
  assert.equal((await jobs())[0].status, 'delivery_unknown');
  assert.equal(h.sends.length, 0);
});

test('uncertain send reconciles to delivered without another POST', async () => {
  await rpc('enqueue_web', { phone: number });
  const h = harness({ outcome: 'uncertain' });
  await h.worker.tick(); await h.worker.tick();
  await readyAgain(); await h.worker.tick();
  assert.equal(h.sends.length, 1);
  assert.equal((await jobs())[0].status, 'delivered');
});

test('STOP cancels a staged link; website requests stay generic; HELP does not re-opt-in', async () => {
  await rpc('enqueue_web', { phone: number });
  const h = harness(); await h.worker.tick();
  await ingest('STOP');
  assert.equal((await jobs()).find(j => j.source === 'web')?.status, 'suppressed');
  assert.equal((await db.query('select * from mango_private.outbox')).rows.length, 0);
  assert.deepEqual(await rpc('enqueue_web', { phone: number }), { accepted: true });
  await ingest('HELP');
  assert.equal((await db.query<Json>('select * from mango_private.contacts')).rows[0].suppressed, true);
  await ingest('START');
  assert.equal((await db.query<Json>('select * from mango_private.contacts')).rows[0].suppressed, false);
  assert.equal(h.sends.length, 0);
});

test('phone offline recovers without issuing early or losing the durable request', async () => {
  await rpc('enqueue_web', { phone: number });
  const h = harness({ offline: true }); await h.worker.tick();
  assert.equal(h.issues.length, 0);
  assert.equal((await jobs())[0].last_error_code, 'phone_offline');
  h.setOnline(true); await readyAgain(); await h.worker.tick(); await h.worker.tick();
  assert.equal(h.sends.length, 1);
});

test('issuer HTTP 400 is terminal; a crash after issuance authorization never reissues', async () => {
  await rpc('enqueue_web', { phone: number });
  const h = harness({ failIssue: true }); await h.worker.tick();
  assert.equal((await jobs())[0].status, 'failed');
  await h.worker.tick(); assert.equal(h.issues.length, 1);
  await ingest('sign in');
  const other = harness(); await other.worker.tick();
  const j = await rpc<Job>('claim');
  await rpc('authorize_issue', lease(j));
  await readyAgain(); await other.worker.tick();
  assert.equal(other.issues.length, 0);
  assert.equal((await jobs()).find(j => j.source === 'sms')?.last_error_code, 'issuance_uncertain');
});

test('expiry purges ciphertext and prevents sending; old conversations redact after retention', async () => {
  await rpc('enqueue_web', { phone: number });
  const h = harness(); await h.worker.tick();
  await db.exec("update mango_private.login_requests set expires_at=now()-interval '1 second'");
  await h.worker.tick();
  assert.equal((await jobs())[0].status, 'expired');
  assert.equal((await db.query('select * from mango_private.outbox')).rows.length, 0);
  assert.equal(h.sends.length, 0);
});

test('catalog excludes demo, unpublished and past plans; absent mapping fails closed', async () => {
  await db.exec(`insert into public.test_plans values
    (gen_random_uuid(),'Demo','',now()+interval '1 day','',true,true),
    (gen_random_uuid(),'Draft','',now()+interval '1 day','',false,false),
    (gen_random_uuid(),'Past','',now()-interval '1 day','',true,false);`);
  assert.equal((await rpc('plans')).length, 1);
  await assert.rejects(rpc('enqueue_web', { phone: number, plan_id: randomUUID() }), /invalid_plan/);
  await db.exec('update mango_private.settings set catalog_ready=false');
  await assert.rejects(rpc('plans'), /catalog_not_configured/);
});

test('browser roles cannot execute RPC or access private tables', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(rpc('health'), /permission denied/);
      await assert.rejects(db.query('select * from mango_private.login_requests'), /permission denied/);
    } finally { await db.exec('reset role'); }
  }
  await db.exec('set role service_role');
  try { assert.equal((await rpc('health')).schema_version, 1); } finally { await db.exec('reset role'); }
});

test('authenticated webhook enforces device, SIM and recipient; never uses phone in message text', async () => {
  const h = harness(), app = productionApp(rpc, h.transport, { webhookSecret: 'secret', adminSecret: 'admin', deviceId: 'mango-device', sim: 1, receivingPhone: '+12035550999' });
  const body = { event: 'sms:received', deviceId: 'mango-device', payload: {
    simNumber: 1, sender: number, recipient: '+12035550999', receivedAt: new Date().toISOString(),
    message: 'send link to +12035550456', messageId: 'in1' } };
  assert.equal((await app.inject({ method: 'POST', url: '/v1/channels/android/webhook', payload: body })).statusCode, 401);
  const call = (payload: any) => app.inject({ method: 'POST', url: '/v1/channels/android/webhook', headers: { 'x-mango-webhook-secret': 'secret' }, payload });
  assert.equal((await call({ ...body, deviceId: 'personal' })).statusCode, 403);
  assert.equal((await call({ ...body, payload: { ...body.payload, simNumber: 2 } })).statusCode, 403);
  assert.equal((await call({ ...body, payload: { ...body.payload, recipient: '+12035550888' } })).statusCode, 403);
  assert.equal((await call(body)).statusCode, 202);
  assert.equal((await call(body)).statusCode, 200);
  const stale = { ...body, payload: { ...body.payload, messageId: 'stale', receivedAt: '2020-01-01T00:00:00Z' } };
  assert.equal((await call(stale)).json().expired, true);
  assert.equal((await jobs()).length, 1);
  await call({ ...stale, payload: { ...stale.payload, message: 'STOP' } });
  assert.equal((await db.query<Json>('select * from mango_private.contacts')).rows[0].suppressed, true);
  assert.equal((await jobs())[0].phone, number);
  assert.ok(!(await jobs())[0].input_text.includes('+12035550456'));
  assert.equal((await app.inject('/v1/demo/simulate-inbound')).statusCode, 404);
  await app.close();
});

test('existing authenticated device and SIM work without a separately configured receiving number', async () => {
  const h = harness(), app = productionApp(rpc, h.transport, {
    webhookSecret: 'secret', adminSecret: 'admin', deviceId: 'mango-device', sim: 1
  });
  const body = { event: 'sms:received', deviceId: 'mango-device', payload: {
    simNumber: 1, sender: number, recipient: '+12035550999', receivedAt: new Date().toISOString(),
    message: 'Hello Mango', messageId: 'existing-line' } };
  const call = (payload: any, authenticated = true) => app.inject({ method: 'POST',
    url: '/v1/channels/android/webhook', headers: authenticated ? { 'x-mango-webhook-secret': 'secret' } : {}, payload });
  try {
    assert.equal((await call(body, false)).statusCode, 401);
    assert.equal((await call({ ...body, deviceId: 'different-device' })).statusCode, 403);
    assert.equal((await call({ ...body, payload: { ...body.payload, simNumber: 2 } })).statusCode, 403);
    assert.equal((await call(body)).statusCode, 202);
    assert.equal((await jobs())[0].phone, number);
    assert.equal((await jobs()).length, 1);
  } finally { await app.close(); }
});

test('MMS waits for download then ingests body or subject once with SMS security and expiry rules', async () => {
  const h = harness(), app = productionApp(rpc, h.transport, {
    webhookSecret: 'secret', adminSecret: 'admin', deviceId: 'device', sim: 1, receivingPhone: '+12035550999'
  });
  const body = { event: 'mms:downloaded', deviceId: 'device', payload: {
    messageId: 'mms-1', phoneNumber: number, simNumber: '1', recipient: '+12035550999',
    receivedAt: new Date().toISOString(), body: 'Hello Mango', subject: 'Fallback subject',
    attachments: [{ contentType: 'image/png', data: 'x'.repeat(10_000) }]
  } };
  const call = (payload: any, authenticated = true) => app.inject({ method: 'POST', url: '/v1/channels/android/webhook',
    headers: authenticated ? { 'x-mango-webhook-secret': 'secret' } : {}, payload });
  try {
    assert.equal((await call(body, false)).statusCode, 401);
    assert.equal((await call({ ...body, payload: { ...body.payload, attachments: [{ data: 'x'.repeat(33_000) }] } })).statusCode, 413);
    assert.equal((await call({ ...body, deviceId: 'other' })).statusCode, 403);
    assert.equal((await call({ ...body, payload: { ...body.payload, simNumber: 2 } })).statusCode, 403);
    assert.equal((await call({ ...body, payload: { ...body.payload, recipient: '+12035550888' } })).statusCode, 403);
    assert.equal((await call({ ...body, event: 'mms:received' })).json().waiting_for_download, true);
    assert.equal((await jobs()).length, 0);
    assert.equal((await call(body)).statusCode, 202);
    assert.equal((await call(body)).statusCode, 200);
    assert.equal((await jobs()).length, 1);
    assert.equal((await jobs())[0].input_text, 'Hello Mango');
    assert.equal((await jobs())[0].phone, number);
    assert.equal((await call({ ...body, payload: { ...body.payload, messageId: 'mms-subject', body: '' } })).statusCode, 202);
    assert.ok((await jobs()).some(j => j.input_text === 'Fallback subject'));
    for (const payload of [
      { ...body.payload, body: '', subject: '' },
      { ...body.payload, body: 'x'.repeat(1001) },
      { ...body.payload, receivedAt: 'invalid' },
      { ...body.payload, phoneNumber: 'invalid' }
    ]) assert.equal((await call({ ...body, payload })).statusCode, 400);
    const stale = { ...body, payload: { ...body.payload, messageId: 'mms-stale', receivedAt: '2020-01-01T00:00:00Z' } };
    assert.equal((await call(stale)).json().expired, true);
    assert.equal((await jobs()).length, 2);
    assert.equal((await call({ ...stale, payload: { ...stale.payload, body: 'STOP' } })).statusCode, 202);
    assert.equal((await db.query<Json>('select suppressed from mango_private.contacts')).rows[0].suppressed, true);
  } finally { await app.close(); }
});

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
test('data SMS decodes only valid bounded UTF-8 and retains authentication, SIM, sender and dedupe checks', async () => {
  const h = harness(), app = productionApp(rpc, h.transport, { webhookSecret: 'secret', adminSecret: 'admin', deviceId: 'device', sim: 1 });
  const body = { event: 'sms:data-received', deviceId: 'device', payload: {
    messageId: 'data-1', sender: number, simNumber: 1, receivedAt: new Date().toISOString(),
    data: Buffer.from('Hello Mango').toString('base64') } };
  const call = (payload: any, authenticated = true) => app.inject({ method: 'POST', url: '/v1/channels/android/webhook',
    headers: authenticated ? { 'x-mango-webhook-secret': 'secret' } : {}, payload });
  try {
    assert.equal((await call(body, false)).statusCode, 401);
    assert.equal((await call({ ...body, deviceId: 'other' })).statusCode, 403);
    assert.equal((await call({ ...body, payload: { ...body.payload, simNumber: 2 } })).statusCode, 403);
    for (const data of ['not base64!', '/w==', 'AA==', Buffer.from('x'.repeat(1001)).toString('base64')]) {
      assert.equal((await call({ ...body, payload: { ...body.payload, data } })).statusCode, 400);
    }
    assert.equal((await call(body)).statusCode, 202);
    assert.equal((await call(body)).statusCode, 200);
    assert.equal((await jobs()).length, 1);
    assert.equal((await jobs())[0].input_text, 'Hello Mango');
    assert.equal((await jobs())[0].phone, number);
    const stop = { ...body, payload: { ...body.payload, messageId: 'data-stop', receivedAt: '2020-01-01T00:00:00Z', data: Buffer.from('STOP').toString('base64') } };
    assert.equal((await call(stop)).statusCode, 202);
    assert.equal((await db.query<Json>('select suppressed from mango_private.contacts')).rows[0].suppressed, true);
    assert.equal((await call({ ...body, event: 'sms:batch:data-received' })).json().ignored, true);
  } finally { await app.close(); }
});

test('Auth provisioning uses Admin API, re-reads concurrent winner and does not touch existing email', async () => {
  const calls: Json[] = [], id = randomUUID(); let lookups = 0;
  const http: Http = async (url, init) => {
    const body = JSON.parse(String(init?.body)); calls.push({ url, body });
    if (String(url).includes('/rpc/')) return response({ id: ++lookups > 1 ? id : null });
    return response({ error: 'duplicate' }, 422);
  };
  assert.equal(await new Supabase('https://db.example', 'key', http).ensure(number), id);
  assert.deepEqual(calls[1].body, { phone: number, phone_confirm: false });
  assert.equal(calls.length, 3);
  await new Supabase('https://db.example', 'key', async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).op, 'lookup_user'); return response({ id });
  }).ensure(number);
});

test('issuer sends only documented fields and never fetches returned link', async () => {
  const calls: Json[] = [];
  const http: Http = async (url, init) => {
    calls.push({ url, init }); return response({ url: 'https://mango.example/l/opaque', expires_in: 600 }, 201);
  };
  const issued = await new MagicLinkIssuer('https://mango.example', 'secret', http).issue(number, planId);
  assert.equal(issued.url, 'https://mango.example/l/opaque');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://mango.example/api/login?action=issue');
  assert.deepEqual(JSON.parse(calls[0].init.body), { phone: number, ttl_seconds: 600, plan_id: planId });
  await assert.rejects(new MagicLinkIssuer('https://mango.example', 'secret', async () => response({ url: 'https://evil.example/l/x', expires_in: 600 }, 201)).issue(number, null), /invalid_issuer_response/);
});

test('transport duplicate responses and missing statuses remain uncertain; receipts are explicit', async () => {
  const id = `mg-${randomUUID().replaceAll('-', '')}`;
  const gate = new SmsGate('https://sms.example', 'user', 'password', 'device', 1, async (url, init) => {
    if (init?.method === 'POST') {
      assert.ok(JSON.parse(String(init.body)).id.length <= 36);
      return response({}, 409);
    }
    return response({ id, deviceId: 'device', state: 'Delivered' });
  });
  assert.equal(await gate.send(number, 'test', id, 100), 'uncertain');
  assert.equal(await gate.status(id), 'delivered');
  const missing = new SmsGate('https://sms.example', 'u', 'p', 'device', 1, async () => response({}, 404));
  assert.equal(await missing.status(id), 'uncertain');
});

test('Hermes rejects recipient overrides, invented plans and bearer-link output', async () => {
  for (const result of [
    { text: 'hello', plan_id: planId, phone: number },
    { text: 'hello', plan_id: randomUUID() },
    { text: 'Open https://mango.example/l/secret', plan_id: planId }
  ]) {
    const model = new HermesConversation('http://localhost:8644', 'key', async () => response({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }] }));
    await assert.rejects(model.respond({ text: 'hello', plans: await rpc('plans'), history: [], selectedPlan: null }), /invalid_model_response/);
  }
});

test('Hermes accepts years, carries voice and schema in system prompt and isolates identical requests', async () => {
  const sessions: string[] = [];
  const model = new HermesConversation('http://localhost:8644', 'key', async (_url, init) => {
    const headers = new Headers(init?.headers), body = JSON.parse(String(init?.body));
    sessions.push(headers.get('x-hermes-session-id')!);
    assert.equal(body.response_format, undefined);
    assert.match(body.messages[0].content, /"additionalProperties":false/);
    assert.match(body.messages[0].content, /"required":\["text","plan_id"\]/);
    assert.match(body.messages[0].content, /related alternative/);
    assert.match(body.messages[0].content, /Remember explicitly shared first names/);
    assert.match(body.messages[0].content, /dash of camp/);
    assert.match(body.messages[0].content, /Never be cruel/);
    assert.match(body.messages[0].content, /corporate, sterile/);
    assert.match(body.messages[0].content, /Do not medicalize/);
    const context = JSON.parse(body.messages[1].content);
    assert.equal(context.time_zone, 'America/New_York');
    assert.ok(Number.isFinite(Date.parse(context.current_time)));
    assert.equal(typeof context.plans[0].local_start_text, 'string');
    return response({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ text: 'This event takes place in 2026.', plan_id: planId }) } }] });
  });
  const input = { text: 'hello', plans: await rpc('plans'), history: [], selectedPlan: null };
  assert.match((await model.respond(input)).text, /2026/);
  await model.respond(input);
  assert.notEqual(sessions[0], sessions[1]);
  assert.ok(sessions.every(s => /^mango-turn-[0-9a-f-]{36}$/.test(s)));
});

test('Hermes rejection codes distinguish failures without exposing response content', async () => {
  const cases: [string, string][] = [
    ['private non-JSON response', 'json'],
    [JSON.stringify({ text: 'hello', plan_id: null, recipient: 'private' }), 'fields'],
    [JSON.stringify({ text: '', plan_id: null }), 'text'],
    [JSON.stringify({ text: 'x'.repeat(501), plan_id: null }), 'length'],
    [JSON.stringify({ text: 'Open https://example.com/private', plan_id: null }), 'redaction'],
    [JSON.stringify({ text: 'Visit www.example.com', plan_id: null }), 'link'],
    [JSON.stringify({ text: 'Enter 123456 to continue.', plan_id: null }), 'login_code'],
    [JSON.stringify({ text: 'hello', plan_id: 'unknown-private-id' }), 'plan']
  ];
  for (const [content, reason] of cases) {
    const model = new HermesConversation('http://localhost:8644', 'key', async () =>
      response({ choices: [{ finish_reason: 'stop', message: { content } }] }));
    await assert.rejects(model.respond({ text: 'hello', plans: [], history: [], selectedPlan: null }),
      (error: unknown) => error instanceof SafeError && error.code === `invalid_model_response_${reason}`);
  }
});

test('Hermes retries prose once in a fresh session and still validates the regenerated JSON', async () => {
  for (const repaired of [
    { text: 'What activities do you enjoy?', plan_id: null },
    { text: 'Open https://example.com/l/private', plan_id: null }
  ]) {
    const sessions: string[] = [];
    const model = new HermesConversation('http://localhost:8644', 'key', async (_url, init) => {
      sessions.push(new Headers(init?.headers).get('x-hermes-session-id')!);
      const body = JSON.parse(String(init?.body));
      const input = JSON.parse(body.messages[1].content);
      assert.match(input.output_contract, /Answer only with the JSON object/);
      if (sessions.length === 2) assert.match(input.output_contract, /previous attempt failed JSON parsing/);
      return response({ choices: [{ finish_reason: 'stop', message: {
        content: sessions.length === 1 ? 'Unstructured model prose' : JSON.stringify(repaired)
      } }] });
    });
    const pending = model.respond({ text: 'hello', plans: [], history: [], selectedPlan: null });
    if (repaired.text.startsWith('Open')) await assert.rejects(pending, /invalid_model_response_redaction/);
    else assert.deepEqual(await pending, { text: repaired.text, planId: null });
    assert.equal(sessions.length, 2);
    assert.notEqual(sessions[0], sessions[1]);
  }
  let calls = 0;
  const invalid = new HermesConversation('http://localhost:8644', 'key', async () => {
    calls++;
    return response({ choices: [{ finish_reason: 'stop', message: { content: 'Still prose' } }] });
  });
  await assert.rejects(invalid.respond({ text: 'hello', plans: [], history: [], selectedPlan: null }), /invalid_model_response_json/);
  assert.equal(calls, 2);
});

test('Hermes rejects numeric login instructions and partial results', async () => {
  for (const text of ['Your sign-in code is 2026.', 'Enter 123456 to continue.', '123456', 'Use 6789 to log in.']) {
    const model = new HermesConversation('http://localhost:8644', 'key', async () => response({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ text, plan_id: null }) } }] }));
    await assert.rejects(model.respond({ text: 'hello', plans: [], history: [], selectedPlan: null }), /invalid_model_response/);
  }
  for (const finish_reason of ['length', 'error']) {
    const partial = new HermesConversation('http://localhost:8644', 'key', async () => response({ choices: [{ finish_reason, message: { content: '{"text":"Hello","plan_id":null}' } }] }));
    await assert.rejects(partial.respond({ text: 'hello', plans: [], history: [], selectedPlan: null }), /incomplete_model_response/);
  }
});

test('database binds identity and send destination to job, ignoring a recipient override', async () => {
  await rpc('enqueue_web', { phone: number });
  const h = harness(); await h.worker.tick();
  const j = await rpc<Job>('claim');
  const wrong = randomUUID();
  await db.query('insert into auth.users(id,phone) values($1,$2)', [wrong, '2035550456']);
  await assert.rejects(rpc('bind_user', { ...lease(j), user_id: wrong }), /identity_mismatch/);
  const outbox = await rpc('authorize_send', { ...lease(j), phone: '+12035550456' });
  assert.equal(outbox.phone, number);
  assert.equal(outbox.transport_id.length, 35);
  await assert.rejects(rpc('authorize_send', lease(j)), /invalid_state/);
});

test('web hourly throttle is atomic and cooldown suppresses duplicate requests', async () => {
  for (let i = 0; i < 6; i++) {
    assert.deepEqual(await rpc('enqueue_web', { phone: number }), { accepted: true });
    await db.exec("update mango_private.login_requests set created_at=created_at-interval '61 seconds'");
  }
  assert.deepEqual(await rpc('enqueue_web', { phone: number }), { limited: true });
  assert.equal((await jobs()).length, 6);
});

test('inbound throttle applies without preventing STOP state change', async () => {
  for (let i = 0; i < 61; i++) await ingest('hello');
  assert.equal((await jobs()).filter(j => j.last_error_code === 'inbound_rate_limited').length, 1);
  await ingest('STOP');
  assert.equal((await db.query<Json>('select * from mango_private.contacts')).rows[0].suppressed, true);
  assert.equal((await jobs()).filter(j => j.status === 'queued').length, 0);
});

test('retention clears conversation bodies but keeps inbound duplicate tombstones', async () => {
  await ingest('Find an event', 'retained-id');
  const h = harness(); await h.worker.tick();
  await db.exec("update mango_private.conversations set created_at=now()-interval '31 days'; update mango_private.login_requests set created_at=now()-interval '31 days',status='done'");
  await h.worker.tick();
  assert.equal((await db.query('select * from mango_private.conversations')).rows.length, 0);
  assert.equal((await jobs())[0].input_text, null);
  assert.equal((await ingest('Find an event', 'retained-id')).duplicate, true);
});

test('gateway health requires fresh metadata for the configured, non-deleted device', async () => {
  for (const [devices, expected] of [
    [[{ id: 'device', lastSeen: new Date().toISOString() }], true],
    [[{ id: 'device', lastSeen: '2020-01-01T00:00:00Z' }], false],
    [[{ id: 'personal', lastSeen: new Date().toISOString() }], false],
    [[{ id: 'device', lastSeen: new Date().toISOString(), deletedAt: new Date().toISOString() }], false]
  ] as const) {
    const gate = new SmsGate('https://sms.example', 'u', 'p', 'device', 1, async () => response(devices));
    assert.equal(await gate.online(), expected);
  }
});
