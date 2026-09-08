-- Additive migration. Apply only to an explicitly selected Supabase project.
-- Use Mango's existing event schema when present; otherwise fail closed.
begin;
create schema if not exists mango_private;
revoke all on schema mango_private from public, anon, authenticated;

create table mango_private.settings (
  singleton boolean primary key default true check (singleton),
  catalog_ready boolean not null default false
);
insert into mango_private.settings default values;
create view mango_private.live_plans as
select null::uuid as id, null::text as title, null::text as description,
       null::timestamptz as starts_at, null::text as venue
where false;
do $$
begin
  if (select count(*) from information_schema.columns
      where table_schema='public' and table_name='plans'
        and column_name in ('id','title','vibe','starts_at','venue_name','status','demo')) = 7 then
    execute 'create or replace view mango_private.live_plans as
      select id,title,vibe as description,starts_at,venue_name as venue
      from public.plans where status=''live'' and starts_at>now() and not demo';
    update mango_private.settings set catalog_ready=true;
  end if;
end $$;

create table mango_private.contacts (
  phone text primary key check (phone ~ '^\+1[2-9][0-9]{9}$'),
  user_id uuid unique references auth.users(id) on delete set null,
  suppressed boolean not null default false,
  selected_plan uuid,
  created_at timestamptz not null default now()
);
create table mango_private.login_requests (
  id uuid primary key default gen_random_uuid(),
  phone text not null references mango_private.contacts(phone),
  plan_id uuid,
  source text not null check (source in ('sms','web')),
  kind text not null check (kind in ('inbound','login','reply')),
  dedupe_key text unique,
  input_text text check (length(input_text) <= 1000),
  reply_text text check (length(reply_text) <= 600),
  compliance boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  status text not null default 'queued' check (status in
    ('queued','processing','ready','sending','uncertain','accepted','sent',
     'delivered','failed','expired','suppressed','done','delivery_unknown')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  last_error_code text check (last_error_code ~ '^[a-z0-9_]{1,64}$'),
  transport_id text unique,
  issuance_started_at timestamptz
);
create index login_requests_ready on mango_private.login_requests(next_attempt_at,created_at);
create index login_requests_phone on mango_private.login_requests(phone,created_at);
create table mango_private.outbox (
  job_id uuid primary key references mango_private.login_requests(id) on delete cascade,
  ciphertext text not null,
  expires_at timestamptz not null,
  send_started_at timestamptz
);
create table mango_private.conversations (
  id bigint generated always as identity primary key,
  phone text not null references mango_private.contacts(phone),
  job_id uuid not null references mango_private.login_requests(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  text text not null check (length(text) <= 1000),
  created_at timestamptz not null default now(),
  unique(job_id,role)
);
alter table mango_private.settings enable row level security;
alter table mango_private.contacts enable row level security;
alter table mango_private.login_requests enable row level security;
alter table mango_private.outbox enable row level security;
alter table mango_private.conversations enable row level security;
revoke all on all tables in schema mango_private from public, anon, authenticated;
revoke all on all sequences in schema mango_private from public, anon, authenticated;

-- One versioned, service-only RPC; never expose the service credential to Hermes
-- or a browser. All mutation operations bind the phone from the claimed job.
create function public.mango_agent_v1(op text, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j mango_private.login_requests%rowtype;
  c mango_private.contacts%rowtype;
  v_phone text;
  v_id uuid;
  v_command text;
  v_text text;
  v_status text;
  v_result jsonb;
begin
  if op = 'health' then
    return jsonb_build_object('schema_version',1,
      'catalog_ready',(select catalog_ready from mango_private.settings),
      'queued',(select count(*) from mango_private.login_requests where status in ('queued','processing','ready')),
      'oldest_queue_seconds',(select coalesce(extract(epoch from now()-min(created_at)),0) from mango_private.login_requests where status in ('queued','processing','ready')),
      'uncertain',(select count(*) from mango_private.login_requests where status in ('uncertain','delivery_unknown')),
      'failed_24h',(select count(*) from mango_private.login_requests where status='failed' and created_at>now()-interval '1 day'));
  elsif op = 'plans' then
    if not (select catalog_ready from mango_private.settings) then raise exception 'catalog_not_configured'; end if;
    return (select coalesce(jsonb_agg(t),'[]') from
      (select id,title,description,starts_at,venue from mango_private.live_plans
       where starts_at>now() order by starts_at limit 30) t);
  elsif op in ('ingest','enqueue_web') then
    v_phone := p->>'phone';
    if v_phone is null or v_phone !~ '^\+1[2-9][0-9]{9}$' then raise exception 'invalid_phone'; end if;
    -- Serializes rate limiting and duplicate insertion across callers.
    perform pg_advisory_xact_lock(7301901);
    if op='ingest' then
      if coalesce(length(p->>'dedupe_key'),0) not between 1 and 250 or
         coalesce(length(p->>'text'),0) not between 1 and 1000 then raise exception 'invalid_input'; end if;
      if exists(select 1 from mango_private.login_requests where dedupe_key=p->>'dedupe_key') then
        return '{"accepted":true,"duplicate":true}'::jsonb;
      end if;
    end if;
    insert into mango_private.contacts(phone) values(v_phone) on conflict do nothing;
    select * into c from mango_private.contacts where phone=v_phone for update;
    if op='ingest' then
      v_command := upper(trim(p->>'text'));
      if v_command in ('STOP','UNSUBSCRIBE','CANCEL','END','QUIT','STOPALL') then
        update mango_private.contacts set suppressed=true where phone=v_phone;
        update mango_private.login_requests set status='suppressed',lease_token=null,lease_until=null
          where phone=v_phone and status in ('queued','processing','ready');
        delete from mango_private.outbox where job_id in
          (select id from mango_private.login_requests where phone=v_phone and status='suppressed');
        v_text := 'Mango texts stopped. Reply START to opt in again.';
      elsif v_command in ('START','UNSTOP') then
        update mango_private.contacts set suppressed=false where phone=v_phone;
        v_text := 'Mango texts resumed. Ask for an event or a sign-in link. Reply STOP to stop.';
      elsif v_command in ('HELP','SUPPORT','INFO') then
        v_text := 'Mango helps you find local events and sign in by text. Reply STOP to stop or START to resume.';
      elsif c.suppressed then
        insert into mango_private.login_requests(phone,source,kind,dedupe_key,status)
          values(v_phone,'sms','inbound',p->>'dedupe_key','suppressed');
        return '{"accepted":true}'::jsonb;
      end if;
      -- Bound model work and outbound volume. Compliance state changes above
      -- always apply, but repeated HELP/START cannot produce an SMS flood.
      if (select count(*) from mango_private.login_requests where phone=v_phone
          and created_at>now()-interval '1 hour' and status<>'done')>=60 or
         (select count(*) from mango_private.login_requests where source='sms'
          and created_at>now()-interval '1 minute' and status<>'done')>=120 then
        insert into mango_private.login_requests(phone,source,kind,dedupe_key,status,last_error_code)
          values(v_phone,'sms','inbound',p->>'dedupe_key','done','inbound_rate_limited');
        return '{"accepted":true}'::jsonb;
      end if;
      -- Durable inbound IDs include transport and device, not a client override.
      insert into mango_private.login_requests(phone,source,kind,dedupe_key,input_text,reply_text,compliance)
        values(v_phone,'sms',case when v_text is null then 'inbound' else 'reply' end,
          p->>'dedupe_key',p->>'text',v_text,v_text is not null);
      return '{"accepted":true}'::jsonb;
    end if;
    if c.suppressed then return '{"accepted":true}'::jsonb; end if;
    -- Website backend provisions an unconfirmed Auth account before enqueue.
    -- Bind the authoritative phone match, never a browser-supplied UUID. Keep
    -- the worker's ensure-user fallback for old callers and interrupted flows.
    select id into v_id from auth.users
      where phone in (v_phone,substring(v_phone from 2)) limit 1;
    if v_id is not null then
      update mango_private.contacts set user_id=v_id where phone=v_phone;
    end if;
    if nullif(p->>'plan_id','') is not null and not exists
      (select 1 from mango_private.live_plans where id=(p->>'plan_id')::uuid and starts_at>now()) then
      raise exception 'invalid_plan';
    end if;
    if exists(select 1 from mango_private.login_requests where phone=v_phone and source='web'
      and created_at>now()-interval '60 seconds') then return '{"accepted":true}'::jsonb; end if;
    if (select count(*) from mango_private.login_requests where phone=v_phone and source='web' and created_at>now()-interval '1 hour')>=6 or
       (select count(*) from mango_private.login_requests where source='web' and created_at>now()-interval '1 minute')>=120 then
      return '{"limited":true}'::jsonb;
    end if;
    insert into mango_private.login_requests(phone,plan_id,source,kind)
      values(v_phone,nullif(p->>'plan_id','')::uuid,'web','login');
    return '{"accepted":true}'::jsonb;
  elsif op='claim' then
    perform pg_advisory_xact_lock(7301902);
    update mango_private.login_requests set
      status=case when status in ('sending','uncertain','accepted','sent') then 'delivery_unknown' else 'expired' end,
      lease_token=null,lease_until=null,input_text=null,reply_text=null
      where expires_at<=now() and status in ('queued','processing','ready','sending','uncertain','accepted','sent');
    delete from mango_private.outbox where expires_at<=now() or job_id in
      (select id from mango_private.login_requests where status in ('delivered','failed','expired','suppressed','delivery_unknown'));
    delete from mango_private.conversations where created_at<now()-interval '30 days';
    update mango_private.login_requests set input_text=null,reply_text=null where created_at<now()-interval '30 days'
      and (input_text is not null or reply_text is not null);
    -- Keep dedupe tombstones and suppression; never silently re-import old SMS.
    select q.* into j from mango_private.login_requests q
      where q.status in ('queued','processing','ready','sending','uncertain','accepted','sent')
      and q.next_attempt_at<=now() and (q.lease_until is null or q.lease_until<=now())
      and not exists(select 1 from mango_private.login_requests other where other.phone=q.phone
        and other.id<>q.id and other.lease_until>now())
      order by q.next_attempt_at,q.created_at for update skip locked limit 1;
    if not found then return null; end if;
    if j.attempts>=8 then
      update mango_private.login_requests set status=case when j.status in ('sending','uncertain','accepted','sent') then 'delivery_unknown' else 'failed' end,
        last_error_code='attempts_exhausted',lease_token=null,lease_until=null where id=j.id;
      delete from mango_private.outbox where job_id=j.id;
      return null;
    end if;
    update mango_private.login_requests set lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',
      attempts=attempts+1,status=case when status='queued' then 'processing' when status='sending' then 'uncertain' else status end
      where id=j.id returning * into j;
    return to_jsonb(j);
  elsif op='lookup_user' then
    v_phone := p->>'phone';
    if v_phone !~ '^\+1[2-9][0-9]{9}$' then raise exception 'invalid_phone'; end if;
    select id into v_id from auth.users where phone in (v_phone,substring(v_phone from 2)) limit 1;
    return jsonb_build_object('id',v_id);
  end if;

  -- Fence every worker mutation with a fresh lease token. A stale worker must
  -- never send, overwrite a result, or change the recipient after losing a lease.
  select * into j from mango_private.login_requests where id=(p->>'id')::uuid for update;
  if not found or j.lease_token is distinct from (p->>'lease_token')::uuid or
     j.lease_token is null or j.lease_until<=now() or j.expires_at<=now() then
    raise exception 'lease_lost';
  end if;
  select * into c from mango_private.contacts where phone=j.phone for update;
  if op='bind_user' then
    v_id := (p->>'user_id')::uuid;
    if not exists(select 1 from auth.users where id=v_id and phone in (j.phone,substring(j.phone from 2))) then
      raise exception 'identity_mismatch';
    end if;
    update mango_private.contacts set user_id=v_id where phone=j.phone;
    return '{"ok":true}'::jsonb;
  elsif op='context' then
    return jsonb_build_object('user_id',c.user_id,'selected_plan',c.selected_plan,
      'history',(select coalesce(jsonb_agg(t order by t.id),'[]') from
        (select id,role,text from mango_private.conversations where phone=j.phone order by id desc limit 8) t));
  elsif op='conversation' then
    if j.kind<>'inbound' or j.status<>'processing' then raise exception 'invalid_state'; end if;
    v_id := nullif(p->>'plan_id','')::uuid;
    if v_id is not null and not exists(select 1 from mango_private.live_plans where id=v_id and starts_at>now()) then
      raise exception 'invalid_plan'; end if;
    insert into mango_private.conversations(phone,job_id,role,text) values(j.phone,j.id,'user',j.input_text)
      on conflict do nothing;
    insert into mango_private.conversations(phone,job_id,role,text) values(j.phone,j.id,'assistant',p->>'text')
      on conflict do nothing;
    if v_id is not null then update mango_private.contacts set selected_plan=v_id where phone=j.phone; end if;
    update mango_private.login_requests set kind=case when (p->>'login')::boolean then 'login' else 'reply' end,
      plan_id=v_id,reply_text=p->>'text',status='queued',lease_token=null,lease_until=null,attempts=0
      where id=j.id;
    return '{"ok":true}'::jsonb;
  elsif op='authorize_issue' then
    if j.kind<>'login' or j.status<>'processing' then raise exception 'invalid_state'; end if;
    if c.suppressed then raise exception 'suppressed'; end if;
    if j.issuance_started_at is not null then return '{"authorized":false}'::jsonb; end if;
    update mango_private.login_requests set issuance_started_at=now() where id=j.id;
    return '{"authorized":true}'::jsonb;
  elsif op='stage' then
    if j.status<>'processing' or j.kind not in ('login','reply') then raise exception 'invalid_state'; end if;
    if c.suppressed and not j.compliance then raise exception 'suppressed'; end if;
    if coalesce(length(p->>'ciphertext'),0) not between 30 and 5000 then raise exception 'invalid_ciphertext'; end if;
    insert into mango_private.outbox(job_id,ciphertext,expires_at)
      values(j.id,p->>'ciphertext',least(j.expires_at,(p->>'expires_at')::timestamptz));
    update mango_private.login_requests set status='ready',attempts=0,
      expires_at=least(expires_at,(p->>'expires_at')::timestamptz),
      lease_token=null,lease_until=null where id=j.id;
    return '{"ok":true}'::jsonb;
  elsif op='authorize_send' then
    if j.status<>'ready' then raise exception 'invalid_state'; end if;
    if c.suppressed and not j.compliance then
      update mango_private.login_requests set status='suppressed',lease_until=null,lease_token=null where id=j.id;
      delete from mango_private.outbox where job_id=j.id;
      return null;
    end if;
    update mango_private.outbox set send_started_at=now() where job_id=j.id
      and send_started_at is null and expires_at>now()+interval '15 seconds' returning ciphertext into v_text;
    if not found then raise exception 'outbox_unavailable'; end if;
    update mango_private.login_requests set status='sending',transport_id='mg-'||replace(id::text,'-','') where id=j.id;
    return jsonb_build_object('phone',j.phone,'ciphertext',v_text,'transport_id','mg-'||replace(j.id::text,'-',''),
      'ttl',floor(extract(epoch from j.expires_at-now())));
  elsif op='outcome' then
    v_status := p->>'status';
    if j.status not in ('sending','uncertain','accepted','sent') or
       v_status not in ('uncertain','accepted','sent','delivered','failed') then raise exception 'invalid_state'; end if;
    -- Never downgrade sent to merely accepted during eventual-consistency polling.
    if j.status='sent' and v_status='accepted' then v_status:='sent'; end if;
    if j.status in ('accepted','sent') and v_status='uncertain' then v_status:=j.status; end if;
    update mango_private.login_requests set status=v_status,lease_until=null,lease_token=null,
      next_attempt_at=now()+interval '60 seconds',last_error_code=p->>'error_code' where id=j.id;
    -- Tokens are no longer needed after transport acceptance; retain only the ID.
    if v_status<>'uncertain' then delete from mango_private.outbox where job_id=j.id; end if;
    return '{"ok":true}'::jsonb;
  elsif op='retry' then
    if j.status in ('sending','uncertain','accepted','sent') then raise exception 'reconcile_required'; end if;
    update mango_private.login_requests set
      status=case when coalesce((p->>'permanent')::boolean,false) or attempts>=8 then 'failed' else status end,
      next_attempt_at=now()+make_interval(secs=>least(120,power(2,j.attempts)::int)),
      lease_token=null,lease_until=null,last_error_code=p->>'error_code' where id=j.id;
    return '{"ok":true}'::jsonb;
  end if;
  raise exception 'unknown_operation';
end;
$$;
revoke all on function public.mango_agent_v1(text,jsonb) from public, anon, authenticated;
grant execute on function public.mango_agent_v1(text,jsonb) to service_role;
comment on function public.mango_agent_v1(text,jsonb) is 'Mango private queue v1; server service_role only. No browser access.';
commit;
