import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { configureProduction, serializeEnv } from '../scripts/configure-production.mjs';

function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'mango-configure-'));
  const paths = { agent: join(dir, 'agent'), web: join(dir, 'web'), output: join(dir, 'protected', 'magic-link.env') };
  const agent = { ANDROID_GATEWAY_BASE_URL: 'https://sms.invalid/3rdparty/v1', ANDROID_GATEWAY_USERNAME: 'fixture-user',
    ANDROID_GATEWAY_PASSWORD: 'fixture # literal \\ password', ANDROID_GATEWAY_DEVICE_ID: 'fixture-device',
    ANDROID_GATEWAY_SIM_NUMBER: '1', WEBHOOK_SHARED_SECRET: 'w'.repeat(32), UNRELATED_PRIVATE_VALUE: 'must-not-copy' };
  const web = { supabase_url: 'https://fixture.supabase.invalid', supabase_secret_key: 's'.repeat(32),
    APP_URL: 'https://web.invalid', MANGO_LOGIN_SECRET: 'l'.repeat(32), UNRELATED_PRIVATE_VALUE: 'must-not-copy' };
  const save = () => {
    writeFileSync(paths.agent, Object.entries(agent).map(([k,v]) => `${k}='${v}'\n`).join(''));
    writeFileSync(paths.web, Object.entries(web).map(([k,v]) => `${k}='${v}'\n`).join(''));
  };
  try { save(); run({ paths, agent, web, save }); } finally { rmSync(dir, { recursive: true }); }
}
test('creates only allowlisted config, private permissions and closed gates; refuses overwrite', () => fixture(({ paths, agent }) => {
  assert.deepEqual(configureProduction('+12035550123', paths), { created: true, gates: 'closed', servicesStarted: false });
  const text = readFileSync(paths.output, 'utf8'), env = parseEnv(text);
  assert.equal(env.MANGO_PRODUCTION_ENABLED, 'false'); assert.equal(env.WEB_MAGIC_LINK_READY, 'false');
  assert.equal(env.ANDROID_GATEWAY_PASSWORD, agent.ANDROID_GATEWAY_PASSWORD);
  assert.equal(Buffer.from(env.MANGO_OUTBOX_KEY, 'base64').length, 32);
  assert.equal(env.ADMIN_TOKEN.length, 64); assert.equal(statSync(paths.output).mode & 0o777, 0o600);
  assert.doesNotMatch(text, /UNRELATED|must-not-copy|HERMES_API_KEY/);
  assert.throws(() => configureProduction('+12035550123', paths), /already exists/);
  assert.equal(readFileSync(paths.output, 'utf8'), text);
}));
test('rejects invalid phone, SIM, HTTPS and missing secrets before creating output', () => fixture(({ paths, agent, web, save }) => {
  assert.throws(() => configureProduction('bad', paths), /receiving number/);
  agent.ANDROID_GATEWAY_SIM_NUMBER = '3'; save();
  assert.throws(() => configureProduction('+12035550123', paths), /SIM_NUMBER/);
  agent.ANDROID_GATEWAY_SIM_NUMBER = '1'; web.APP_URL = 'http://web.invalid'; save();
  assert.throws(() => configureProduction('+12035550123', paths), /APP_URL/);
  web.APP_URL = 'https://web.invalid'; delete web.MANGO_LOGIN_SECRET; save();
  assert.throws(() => configureProduction('+12035550123', paths), /MANGO_LOGIN_SECRET/);
  assert.equal(existsSync(paths.output), false);
}));
test('serialization preserves literal quote, hash, dollar and slash characters', () => {
  for (const value of ['a#b$c\\d', 'a"b', "a'b", 'a`b']) {
    assert.equal(parseEnv(serializeEnv({ TOKEN: value })).TOKEN, value);
  }
  assert.throws(() => serializeEnv({ TOKEN: 'a\nb' }), /Unsupported/);
  assert.throws(() => serializeEnv({ TOKEN: '"\'`' }), /Unsupported/);
  assert.throws(() => serializeEnv({ TOKEN: 'a"b\'c' }), /Unsupported/);
});
test('same device and SIM can be configured without a receiving number', () => fixture(({ paths }) => {
  configureProduction(undefined, paths);
  const env = parseEnv(readFileSync(paths.output, 'utf8'));
  assert.equal(env.MANGO_RECEIVING_PHONE, undefined);
  assert.equal(env.ANDROID_GATEWAY_DEVICE_ID, 'fixture-device');
  assert.equal(env.ANDROID_GATEWAY_SIM_NUMBER, '1');
}));
