import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultPaths, inspect } from '../scripts/production-preflight.mjs';

test('offline preflight reports missing configuration and reusable aliases without leaking values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mango-preflight-'));
  try {
    const paths = Object.fromEntries(Object.keys(defaultPaths).map(k => [k, join(dir, k)]));
    writeFileSync(paths.agent, 'ANDROID_GATEWAY_PASSWORD=fixture-never-print-me\n', { mode: 0o600 });
    writeFileSync(paths.web, 'supabase_url=https://fixture.supabase.invalid\nsupabase_secret_key=fixture-secret\n', { mode: 0o600 });
    const result = inspect(paths);
    assert.equal(result.files.production.status, 'missing_or_unreadable');
    assert.deepEqual(result.configuration.ANDROID_GATEWAY_PASSWORD.reusable_from, ['agent']);
    assert.deepEqual(result.configuration.SUPABASE_SECRET_KEY.reusable_from, ['web']);
    assert.equal(result.gates.WEB_MAGIC_LINK_READY, 'unset_or_invalid');
    assert.doesNotMatch(JSON.stringify(result), /fixture-never-print-me|fixture-secret|fixture\.supabase/);
  } finally { rmSync(dir, { recursive: true }); }
});

test('preflight follows service override ordering and detects mismatch and drift', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mango-preflight-'));
  try {
    const paths = Object.fromEntries(Object.keys(defaultPaths).map(k => [k, join(dir, k)]));
    const save = (key, content) => writeFileSync(paths[key], content, { mode: 0o600 });
    save('production', 'APP_URL=https://first.invalid\nHERMES_API_KEY=wrong\nMANGO_PRODUCTION_ENABLED=false\n');
    save('web', 'APP_URL=https://second.invalid\n');
    save('hermes', 'HERMES_API_KEY=matching-fixture\n');
    save('profileEnv', 'API_SERVER_KEY=matching-fixture\n');
    save('profileSoul', 'voice one'); save('templateSoul', 'voice two');
    save('profileConfig', 'config'); save('templateConfig', 'config');
    const result = inspect(paths);
    assert.equal(result.checks.APP_URL_web_match, 'mismatch');
    assert.equal(result.checks.HERMES_API_KEY_profile_match, 'match');
    assert.equal(result.checks.profile_voice, 'drift');
    assert.equal(result.checks.profile_config, 'match');
    assert.equal(result.gates.MANGO_PRODUCTION_ENABLED, 'closed');
  } finally { rmSync(dir, { recursive: true }); }
});
