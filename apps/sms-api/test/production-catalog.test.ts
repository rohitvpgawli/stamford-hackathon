import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Local PostgreSQL fixtures only; no credentials, network, or production writes.
test('agent migration maps existing Mango plans and binds the website-provisioned account', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key,phone text unique,phone_confirmed_at timestamptz);
      create table public.plans(id uuid primary key,title text,vibe text,starts_at timestamptz,venue_name text,status text,demo boolean);
      insert into public.plans values
        ('11111111-1111-4111-8111-111111111111','Park walk','Outdoors',now()+interval '1 day','Stamford','live',false),
        (gen_random_uuid(),'Demo','',now()+interval '1 day','','live',true),
        (gen_random_uuid(),'Pending','',now()+interval '1 day','','pending',false),
        (gen_random_uuid(),'Past','',now()-interval '1 day','','live',false);
      insert into auth.users values('22222222-2222-4222-8222-222222222222','12035550123',null);`);
    await db.exec(await readFile(new URL('../migrations/001_magic_link.sql', import.meta.url), 'utf8'));
    const rpc = async (op: string, p = {}) => (await db.query<{ value: any }>(
      'select public.mango_agent_v1($1,$2::jsonb) as value', [op, JSON.stringify(p)])).rows[0].value;
    assert.equal((await rpc('health')).catalog_ready, true);
    const plans = await rpc('plans');
    assert.equal(plans.length, 1);
    assert.equal(plans[0].description, 'Outdoors');
    assert.equal(plans[0].venue, 'Stamford');
    await rpc('enqueue_web', { phone: '+12035550123', plan_id: plans[0].id });
    assert.equal((await db.query<{ user_id: string }>('select user_id from mango_private.contacts')).rows[0].user_id,
      '22222222-2222-4222-8222-222222222222');
    assert.equal((await db.query('select phone_confirmed_at from auth.users')).rows[0].phone_confirmed_at, null);
  } finally { await db.close(); }
});

test('agent migration leaves a missing web catalog unconfigured', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key,phone text);`);
    await db.exec(await readFile(new URL('../migrations/001_magic_link.sql', import.meta.url), 'utf8'));
    assert.equal((await db.query<{ catalog_ready: boolean }>('select catalog_ready from mango_private.settings')).rows[0].catalog_ready, false);
    await assert.rejects(db.query("select public.mango_agent_v1('plans')"), /catalog_not_configured/);
  } finally { await db.close(); }
});
