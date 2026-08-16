import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { opportunities, personas, type SeedOpportunity } from '@mango/seed-data';
import type { SessionState, UserStatus } from '@mango/contracts';

export interface UserRow { id:string; phone_hash:string; phone_ciphertext:string; display_name:string|null; status:UserStatus; user_type:string|null; social_opt_in:number; turn_limit_override:number|null; created_at:string; last_seen_at:string; }
export interface SessionRow { id:string; user_id:string; channel:string; state:SessionState; started_at:string; last_activity_at:string; expires_at:string; inbound_turns:number; recommendation_count:number; warning_sent_at:string|null; cutoff_sent_at:string|null; active_recommendation_id:string|null; pending_action_json:string|null; summary:string|null; version:number; }
export interface OpportunityRow { id:string; kind:string; title:string; description:string; venue_name:string; neighborhood:string; starts_at:string|null; ends_at:string|null; recurring_text:string|null; price_cents:number; status:string; tags_json:string; audience_json:string; group_style:string; accessibility_json:string; transport_notes:string; source_name:string; source_url:string; is_demo_data:number; quality:number; }
export interface ProfileFactRow { id:string; user_id:string; key:string; value_json:string; confidence:number; source_message_id:string|null; sensitivity:string; expires_at:string|null; }

const now = () => new Date().toISOString();
export class MangoDb {
  readonly db: DatabaseSync;
  constructor(public readonly filename=':memory:', private readonly pepper=process.env.PHONE_HASH_PEPPER||'demo-phone-pepper') {
    if(filename!==':memory:') mkdirSync(dirname(filename),{recursive:true});
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, phone_hash TEXT NOT NULL UNIQUE, phone_ciphertext TEXT NOT NULL, display_name TEXT,
      status TEXT NOT NULL DEFAULT 'active', user_type TEXT, social_opt_in INTEGER NOT NULL DEFAULT 0,
      turn_limit_override INTEGER, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), channel TEXT NOT NULL, state TEXT NOT NULL,
      started_at TEXT NOT NULL, last_activity_at TEXT NOT NULL, expires_at TEXT NOT NULL, inbound_turns INTEGER NOT NULL DEFAULT 0,
      recommendation_count INTEGER NOT NULL DEFAULT 0, warning_sent_at TEXT, cutoff_sent_at TEXT, active_recommendation_id TEXT,
      pending_action_json TEXT, summary TEXT, version INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS sessions_user_active ON sessions(user_id,last_activity_at);
      CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, provider_message_id TEXT NOT NULL UNIQUE, session_id TEXT NOT NULL REFERENCES sessions(id),
      direction TEXT NOT NULL, text TEXT NOT NULL, intent TEXT, safety_label TEXT, delivery_status TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS profile_facts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), key TEXT NOT NULL, value_json TEXT NOT NULL,
      confidence REAL NOT NULL, source_message_id TEXT, sensitivity TEXT NOT NULL DEFAULT 'normal', expires_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id,key));
      CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, venue_name TEXT NOT NULL,
      neighborhood TEXT NOT NULL, starts_at TEXT, ends_at TEXT, recurring_text TEXT, price_cents INTEGER NOT NULL,
      status TEXT NOT NULL, tags_json TEXT NOT NULL, audience_json TEXT NOT NULL, group_style TEXT NOT NULL,
      accessibility_json TEXT NOT NULL, transport_notes TEXT NOT NULL, source_name TEXT NOT NULL, source_url TEXT NOT NULL,
      is_demo_data INTEGER NOT NULL, quality INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS recommendation_exposures (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), session_id TEXT NOT NULL REFERENCES sessions(id),
      opportunity_id TEXT NOT NULL REFERENCES opportunities(id), rank INTEGER NOT NULL, score REAL NOT NULL, reason_codes_json TEXT NOT NULL,
      generated_copy TEXT NOT NULL, shown_at TEXT NOT NULL, outcome TEXT NOT NULL DEFAULT 'ignored', UNIQUE(session_id,opportunity_id));
      CREATE TABLE IF NOT EXISTS joins (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
      session_id TEXT NOT NULL REFERENCES sessions(id), status TEXT NOT NULL, joined_at TEXT NOT NULL, source TEXT NOT NULL,
      UNIQUE(user_id,opportunity_id));
      CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY, opportunity_id TEXT NOT NULL, user_a_id TEXT NOT NULL, user_b_id TEXT NOT NULL, score REAL NOT NULL,
      reason_codes_json TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbound_jobs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), destination TEXT NOT NULL, text TEXT NOT NULL,
      order_key TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, provider_id TEXT,
      status TEXT NOT NULL DEFAULT 'queued', error_code TEXT, dedupe_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, sent_at TEXT);
      CREATE INDEX IF NOT EXISTS outbound_ready ON outbound_jobs(status,next_attempt_at);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS inbound_jobs (
      id TEXT PRIMARY KEY, provider_message_id TEXT NOT NULL UNIQUE, message_id TEXT NOT NULL UNIQUE REFERENCES messages(id),
      user_id TEXT NOT NULL REFERENCES users(id), session_id TEXT NOT NULL REFERENCES sessions(id), payload_json TEXT NOT NULL,
      sequence INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'queued', attempt_count INTEGER NOT NULL DEFAULT 0,
      available_at TEXT NOT NULL, locked_at TEXT, completed_at TEXT, error_code TEXT, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS inbound_ready ON inbound_jobs(status,available_at,sequence);`);
    this.seed();
  }
  private seed() {
    const stmt = this.db.prepare(`INSERT INTO opportunities (id,kind,title,description,venue_name,neighborhood,starts_at,ends_at,recurring_text,price_cents,status,tags_json,audience_json,group_style,accessibility_json,transport_notes,source_name,source_url,is_demo_data,quality) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,title=excluded.title,description=excluded.description,venue_name=excluded.venue_name,neighborhood=excluded.neighborhood,starts_at=excluded.starts_at,ends_at=excluded.ends_at,recurring_text=excluded.recurring_text,price_cents=excluded.price_cents,status=excluded.status,tags_json=excluded.tags_json,audience_json=excluded.audience_json,group_style=excluded.group_style,accessibility_json=excluded.accessibility_json,transport_notes=excluded.transport_notes,source_name=excluded.source_name,source_url=excluded.source_url,is_demo_data=excluded.is_demo_data,quality=excluded.quality`);
    for (const o of opportunities) stmt.run(o.id,o.kind,o.title,o.description,o.venueName,o.neighborhood,o.startsAt||null,o.endsAt||null,o.recurringText||null,o.priceCents,o.status,JSON.stringify(o.tags),JSON.stringify(o.audience),o.groupStyle,JSON.stringify(o.accessibility),o.transportNotes,o.sourceName,o.sourceUrl,o.isDemoData?1:0,o.quality);
  }
  hashPhone(phone:string) { const normalized = phone.replace(/[^+\d]/g,''); return createHmac('sha256',this.pepper).update(normalized).digest('hex'); }
  encryptPhone(phone:string) { const key=createHash('sha256').update(this.pepper).digest(); const iv=randomBytes(12); const c=createCipheriv('aes-256-gcm',key,iv); const body=Buffer.concat([c.update(phone,'utf8'),c.final()]); return Buffer.concat([iv,c.getAuthTag(),body]).toString('base64url'); }
  decryptPhone(value:string) { const b=Buffer.from(value,'base64url'); const key=createHash('sha256').update(this.pepper).digest(); const d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12)); d.setAuthTag(b.subarray(12,28)); return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8'); }
  getUserByPhone(phone:string) { return this.db.prepare('SELECT * FROM users WHERE phone_hash=?').get(this.hashPhone(phone)) as UserRow|undefined; }
  getUser(id:string) { return this.db.prepare('SELECT * FROM users WHERE id=?').get(id) as UserRow|undefined; }
  getOrCreateUser(phone:string) { const hash=this.hashPhone(phone); let u=this.getUserByPhone(phone); if (!u) { const t=now(); const id=randomUUID(); this.db.prepare('INSERT INTO users (id,phone_hash,phone_ciphertext,created_at,last_seen_at) VALUES (?,?,?,?,?)').run(id,hash,this.encryptPhone(phone),t,t); u=this.getUser(id)!; } else this.db.prepare('UPDATE users SET last_seen_at=? WHERE id=?').run(now(),u.id); return u; }
  setUserStatus(id:string,status:UserStatus) { this.db.prepare('UPDATE users SET status=?,last_seen_at=? WHERE id=?').run(status,now(),id); }
  updateUserName(id:string,name:string) { this.db.prepare('UPDATE users SET display_name=?,last_seen_at=? WHERE id=?').run(name.slice(0,80),now(),id); }
  setUserType(id:string,type:string) { this.db.prepare('UPDATE users SET user_type=? WHERE id=?').run(type,id); }
  activeSession(userId:string, ttlHours=12) { const t=now(); const s=this.db.prepare("SELECT * FROM sessions WHERE user_id=? AND state <> 'closed' ORDER BY last_activity_at DESC LIMIT 1").get(userId) as SessionRow|undefined; if (s && s.expires_at>t) return s; if (s) this.db.prepare("UPDATE sessions SET state='closed' WHERE id=?").run(s.id); const id=randomUUID(); const expires=new Date(Date.now()+ttlHours*3600000).toISOString(); this.db.prepare("INSERT INTO sessions (id,user_id,channel,state,started_at,last_activity_at,expires_at) VALUES (?,?, 'sms','new',?,?,?)").run(id,userId,t,t,expires); return this.getSession(id)!; }
  getSession(id:string) { return this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as SessionRow|undefined; }
  updateSession(id:string, fields:Partial<SessionRow>) { const allowed=['state','last_activity_at','expires_at','inbound_turns','recommendation_count','warning_sent_at','cutoff_sent_at','active_recommendation_id','pending_action_json','summary','version']; const pairs=Object.keys(fields).filter(k=>allowed.includes(k)); if (!pairs.length) return; this.db.prepare(`UPDATE sessions SET ${pairs.map(k=>`${k}=?`).join(',')} WHERE id=?`).run(...pairs.map(k=>(fields as any)[k]),id); }
  insertInbound(providerId:string, sessionId:string,text:string) { const id=randomUUID(); try { this.db.prepare('INSERT INTO messages (id,provider_message_id,session_id,direction,text,delivery_status,created_at) VALUES (?,?,?,\'inbound\',?,\'received\',?)').run(id,providerId,sessionId,text,now()); return {id,duplicate:false}; } catch (e:any) { if (String(e.message).includes('UNIQUE')) { const old=this.db.prepare('SELECT id FROM messages WHERE provider_message_id=?').get(providerId) as any; return {id:old?.id||id,duplicate:true}; } throw e; } }
  enqueueInbound(providerMessageId:string,messageId:string,userId:string,sessionId:string,payload:unknown) { const sequence=Number((this.db.prepare('SELECT COALESCE(MAX(sequence),0)+1 as n FROM inbound_jobs WHERE user_id=?').get(userId) as any)?.n||1); try { this.db.prepare('INSERT INTO inbound_jobs (id,provider_message_id,message_id,user_id,session_id,payload_json,sequence,available_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(randomUUID(),providerMessageId,messageId,userId,sessionId,JSON.stringify(payload),sequence,now(),now()); } catch(e:any) { if(!String(e.message).includes('UNIQUE')) throw e; } return this.db.prepare('SELECT * FROM inbound_jobs WHERE provider_message_id=?').get(providerMessageId) as any; }
  claimInbound() { const leaseMs=Number(process.env.INBOUND_LEASE_MS||30000); const stale=new Date(Date.now()-leaseMs).toISOString(); this.db.prepare("UPDATE inbound_jobs SET status='queued',locked_at=NULL,available_at=? WHERE status='processing' AND locked_at<?").run(now(),stale); const job=this.db.prepare("SELECT * FROM inbound_jobs j WHERE j.status='queued' AND j.available_at<=? AND NOT EXISTS (SELECT 1 FROM inbound_jobs l WHERE l.user_id=j.user_id AND l.status='processing') ORDER BY j.sequence,j.created_at LIMIT 1").get(now()) as any; if(!job) return undefined; this.db.prepare("UPDATE inbound_jobs SET status='processing',locked_at=?,attempt_count=attempt_count+1 WHERE id=? AND status='queued'").run(now(),job.id); return this.db.prepare('SELECT * FROM inbound_jobs WHERE id=? AND status=\'processing\'').get(job.id) as any; }
  completeInbound(id:string,error?:string) { if(error) this.db.prepare("UPDATE inbound_jobs SET status=CASE WHEN attempt_count>=3 THEN 'failed' ELSE 'queued' END,error_code=?,available_at=?,locked_at=NULL WHERE id=?").run(error,new Date(Date.now()+1000).toISOString(),id); else this.db.prepare("UPDATE inbound_jobs SET status='completed',completed_at=?,locked_at=NULL WHERE id=?").run(now(),id); }
  inboundStats() { return this.db.prepare("SELECT status,COUNT(*) as count FROM inbound_jobs GROUP BY status").all() as any[]; }
  insertOutboundMessage(providerId:string,sessionId:string,text:string) { const id=randomUUID(); this.db.prepare('INSERT INTO messages (id,provider_message_id,session_id,direction,text,delivery_status,created_at) VALUES (?,?,?,\'outbound\',?,\'queued\',?)').run(id,providerId,sessionId,text,now()); return id; }
  setMessageIntent(id:string,intent:string,safety:string) { this.db.prepare('UPDATE messages SET intent=?,safety_label=? WHERE id=?').run(intent,safety,id); }
  facts(userId:string) { return this.db.prepare('SELECT * FROM profile_facts WHERE user_id=?').all(userId) as unknown as ProfileFactRow[]; }
  setFact(userId:string,key:string,value:unknown,confidence:number,sourceMessageId?:string,expiresAt?:string) { const t=now(); this.db.prepare(`INSERT INTO profile_facts (id,user_id,key,value_json,confidence,source_message_id,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET value_json=excluded.value_json,confidence=excluded.confidence,source_message_id=excluded.source_message_id,expires_at=excluded.expires_at,updated_at=excluded.updated_at`).run(randomUUID(),userId,key,JSON.stringify(value),confidence,sourceMessageId||null,expiresAt||null,t,t); }
  getOpportunity(id:string) { return this.db.prepare('SELECT * FROM opportunities WHERE id=?').get(id) as OpportunityRow|undefined; }
  listOpportunities() { return this.db.prepare("SELECT * FROM opportunities WHERE status='active'").all() as unknown as OpportunityRow[]; }
  exposures(sessionId:string) { return this.db.prepare('SELECT * FROM recommendation_exposures WHERE session_id=? ORDER BY shown_at').all(sessionId) as any[]; }
  expose(userId:string,sessionId:string,opportunityId:string,score:number,reasons:string[],copyText:string) { const id=randomUUID(); try { this.db.prepare('INSERT INTO recommendation_exposures (id,user_id,session_id,opportunity_id,rank,score,reason_codes_json,generated_copy,shown_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id,userId,sessionId,opportunityId,this.exposures(sessionId).length+1,score,JSON.stringify(reasons),copyText,now()); } catch(e:any) { if(!String(e.message).includes('UNIQUE')) throw e; } return this.db.prepare('SELECT * FROM recommendation_exposures WHERE session_id=? AND opportunity_id=?').get(sessionId,opportunityId) as any; }
  markExposure(sessionId:string,opportunityId:string,outcome:string) { this.db.prepare('UPDATE recommendation_exposures SET outcome=? WHERE session_id=? AND opportunity_id=?').run(outcome,sessionId,opportunityId); }
  createJoin(userId:string,oppId:string,sessionId:string) { const existing=this.db.prepare('SELECT * FROM joins WHERE user_id=? AND opportunity_id=?').get(userId,oppId) as any; if(existing) return existing; const id=randomUUID(); this.db.prepare("INSERT INTO joins (id,user_id,opportunity_id,session_id,status,joined_at,source) VALUES (?,?,?,?,'joined',?,'sms')").run(id,userId,oppId,sessionId,now()); this.markExposure(sessionId,oppId,'joined'); return this.db.prepare('SELECT * FROM joins WHERE id=?').get(id) as any; }
  joined(userId:string) { return this.db.prepare('SELECT j.*,o.title,o.description,o.venue_name,o.neighborhood,o.starts_at,o.ends_at,o.tags_json FROM joins j JOIN opportunities o ON o.id=j.opportunity_id WHERE j.user_id=? ORDER BY j.joined_at DESC').all(userId) as any[]; }
  compatibleCount(userId:string,oppId:string) { const userFacts=this.facts(userId); const tags=new Set(userFacts.filter(f=>f.key==='interest.tags').flatMap(f=>{const v=JSON.parse(f.value_json);return Array.isArray(v)?v as string[]:[]})); const o=this.getOpportunity(oppId); if(!o) return 0; const tagArr=JSON.parse(o.tags_json) as string[]; const base=personas.filter((p:any)=>p.socialOptIn&&p.interests.some((i:string)=>tagArr.includes(i))); return Math.min(5,Math.max(0,base.length ? (base.length%4)+2 : 0)); }
  enqueue(userId:string,sessionId:string,text:string,dedupeKey:string) { const u=this.getUser(userId)!; try { this.db.prepare('INSERT INTO outbound_jobs (id,user_id,destination,text,order_key,next_attempt_at,dedupe_key,created_at) VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),userId,u.phone_ciphertext,text,sessionId,now(),dedupeKey,now()); } catch(e:any) { if(!String(e.message).includes('UNIQUE')) throw e; } return this.db.prepare('SELECT * FROM outbound_jobs WHERE dedupe_key=?').get(dedupeKey) as any; }
  readyJobs(limit=20) { return this.db.prepare("SELECT * FROM outbound_jobs WHERE status='queued' AND next_attempt_at<=? ORDER BY created_at LIMIT ?").all(now(),limit) as any[]; }
  markJobSent(id:string,providerId:string) { this.db.prepare("UPDATE outbound_jobs SET status='sent',provider_id=?,sent_at=?,attempt_count=attempt_count+1 WHERE id=?").run(providerId,now(),id); }
  markJobFailed(id:string,error:string,retry=true) { const job=this.db.prepare('SELECT attempt_count FROM outbound_jobs WHERE id=?').get(id) as any; const attempts=(job?.attempt_count||0)+1; const status=!retry||attempts>=4?'failed':'queued'; const next=new Date(Date.now()+Math.min(300000,1000*2**attempts)).toISOString(); this.db.prepare('UPDATE outbound_jobs SET status=?,error_code=?,attempt_count=?,next_attempt_at=? WHERE id=?').run(status,error,attempts,next,id); }
  queueStats() { return this.db.prepare("SELECT status,COUNT(*) as count,MIN(created_at) as oldest FROM outbound_jobs GROUP BY status").all() as any[]; }
  allMessages(userId:string) { return this.db.prepare('SELECT * FROM messages m JOIN sessions s ON m.session_id=s.id WHERE s.user_id=? ORDER BY m.created_at').all(userId) as any[]; }
  resetDemo() { this.db.exec("DELETE FROM outbound_jobs; DELETE FROM inbound_jobs; DELETE FROM recommendation_exposures; DELETE FROM joins; DELETE FROM matches; DELETE FROM messages; DELETE FROM profile_facts; DELETE FROM sessions; DELETE FROM users;"); }
}
