import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

export type Json = Record<string, any>;
export type Rpc = <T = any>(op: string, payload?: Json) => Promise<T>;
export interface Job {
  id: string; phone: string; source: 'web' | 'sms'; kind: 'inbound' | 'login' | 'reply';
  status: string; lease_token: string; lease_until: string; expires_at: string; attempts: number;
  plan_id: string | null; input_text: string | null; reply_text: string | null;
  transport_id: string | null;
}
export interface Plan { id: string; title: string; description: string; starts_at: string; venue: string }
export class SafeError extends Error {
  constructor(readonly code: string, readonly permanent = false) { super(code); }
}
export function errorCode(error: unknown): string {
  return error instanceof SafeError ? error.code : 'dependency_unavailable';
}
export function phone(value: unknown): string {
  if (typeof value !== 'string' || !/^[+\d ()-]+$/.test(value)) throw new SafeError('invalid_phone', true);
  const digits = value.replace(/\D/g, '');
  const normalized = `+${digits.length === 10 ? '1' : ''}${digits}`;
  if (!/^\+1[2-9]\d{9}$/.test(normalized)) throw new SafeError('invalid_phone', true);
  return normalized;
}
export function equalSecret(actual: unknown, expected: string): boolean {
  if (typeof actual !== 'string') return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function redactText(value: string): string {
  return value.replace(/https?:\/\/\S+|(?:\/l\/|\/h\/)\S+/gi, '[link]')
    .replace(/(?:\+?1[ .-]?)?\(?[2-9]\d{2}\)?[ .-]?\d{3}[ .-]?\d{4}/g, '[phone]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]');
}
export class Vault {
  private readonly key: Buffer;
  constructor(encodedKey: string) {
    this.key = Buffer.from(encodedKey, 'base64');
    if (this.key.length !== 32) throw new SafeError('invalid_encryption_key', true);
  }
  seal(text: string, jobId: string): string {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(`mango-outbox-v1:${jobId}`));
    const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
  }
  open(value: string, jobId: string): string {
    try {
      const data = Buffer.from(value, 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
      decipher.setAAD(Buffer.from(`mango-outbox-v1:${jobId}`));
      decipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
    } catch { throw new SafeError('outbox_decryption_failed', true); }
  }
}

export interface Identity { ensure(phone: string): Promise<string> }
export interface Issuer { issue(phone: string, planId: string | null): Promise<{ url: string; expiresAt: string }> }
export type Outcome = 'uncertain' | 'accepted' | 'sent' | 'delivered' | 'failed';
export interface Transport {
  online(): Promise<boolean>;
  send(to: string, text: string, id: string, ttl: number): Promise<Outcome>;
  status(id: string): Promise<Outcome>;
}
export interface Conversation {
  respond(input: { text: string; plans: Plan[]; history: Json[]; selectedPlan: string | null }):
    Promise<{ text: string; planId: string | null }>;
}
export function appEntryIntent(text: string): boolean {
  if (/\b(?:do not|don['’]?t|never|stop|no)\b/i.test(text)) return false;
  return /\b(sign[ -]?in|log[ -]?in|magic link|send (?:me )?(?:a |the )?link|open (?:the )?app|join|rsvp|book|sign me up|add me)\b/i.test(text)
    || /^(?:yes|yes please|i['’]?m in|count me in|save it)[.! ]*$/i.test(text.trim());
}

export class Worker {
  constructor(private readonly rpc: Rpc, private readonly identity: Identity,
    private readonly issuer: Issuer, private readonly transport: Transport,
    private readonly conversation: Conversation, private readonly vault: Vault) {}

  async tick(): Promise<boolean> {
    const job = await this.rpc<Job | null>('claim');
    if (!job) return false;
    const lease = { id: job.id, lease_token: job.lease_token };
    // From this point onward an ambiguous network result must only reconcile.
    let sending = ['sending', 'uncertain', 'accepted', 'sent'].includes(job.status);
    try {
      if (sending) {
        const status = await this.transport.status(job.transport_id!);
        await this.rpc('outcome', { ...lease, status });
      } else if (job.status === 'ready') {
        if (!await this.transport.online()) throw new SafeError('phone_offline');
        const outbox = await this.rpc<Json | null>('authorize_send', lease);
        if (!outbox) return true;
        sending = true;
        const body = this.vault.open(outbox.ciphertext, job.id);
        const ttl = Math.floor((Date.parse(job.expires_at) - Date.now()) / 1000);
        if (ttl < 15 || Date.parse(job.lease_until) <= Date.now()) {
          await this.rpc('outcome', { ...lease, status: 'failed', error_code: 'send_window_expired' });
          return true;
        }
        const status = await this.transport.send(phone(outbox.phone), body, outbox.transport_id, ttl);
        await this.rpc('outcome', { ...lease, status });
      } else if (job.kind === 'inbound') {
        const userId = await this.identity.ensure(job.phone);
        await this.rpc('bind_user', { ...lease, user_id: userId });
        const context = await this.rpc<Json>('context', lease);
        const plans = (await this.rpc<Plan[]>('plans')).map(p => ({ ...p,
          title: redactText(p.title).slice(0, 150), description: redactText(p.description || '').slice(0, 800),
          venue: redactText(p.venue || '').slice(0, 150) }));
        const text = redactText(job.input_text || '');
        const login = appEntryIntent(text);
        const selected = plans.find(p => p.id === context.selected_plan);
        let result: { text: string; planId: string | null };
        const selectedCommitment = /^(?:join|rsvp|yes|yes please|i['’]?m in|count me in|save it|sign me up|add me(?: to (?:this|that))?|send (?:me )?(?:the )?link)[.! ]*$/i.test(text.trim());
        if (login && selected && selectedCommitment) {
          result = { text: 'Excellent choice. Open your Mango link to view it. Joining happens in the app.', planId: selected.id };
        } else if (login && !selected && selectedCommitment) {
          result = { text: 'A mystery event, intriguing. Which one do you mean? Tell me its name or what you feel like doing.', planId: null };
        } else if (login && /\b(sign[ -]?in|log[ -]?in|magic link)\b/i.test(text)) {
          result = { text: 'A little digital fanfare: your Mango sign-in link is on its way.', planId: null };
        } else {
          result = await this.conversation.respond({ text, plans,
            history: (context.history || []).map((h: Json) => ({ role: h.role, text: redactText(h.text) })),
            selectedPlan: selected?.id || null });
        }
        if (result.planId && !plans.some(p => p.id === result.planId)) throw new SafeError('invalid_model_plan', true);
        await this.rpc('conversation', { ...lease, text: result.text, plan_id: result.planId,
          // A concrete recommendation carries its authenticated event link in
          // the same SMS. Conversation/follow-up turns return no plan ID and
          // therefore do not mint credentials. This never registers attendance.
          login: Boolean(result.planId) || (login && /\b(sign[ -]?in|log[ -]?in|magic link|open (?:the )?app)\b/i.test(text)) });
      } else {
        let body: string, expiresAt = job.expires_at;
        if (job.kind === 'login') {
          // Check the dedicated device before minting a short-lived credential.
          if (!await this.transport.online()) throw new SafeError('phone_offline');
          const userId = await this.identity.ensure(job.phone);
          await this.rpc('bind_user', { ...lease, user_id: userId });
          const issuance = await this.rpc<Json>('authorize_issue', lease);
          if (!issuance.authorized) throw new SafeError('issuance_uncertain', true);
          const issued = await this.issuer.issue(job.phone, job.plan_id);
          const greeting = job.source === 'web'
            ? 'Welcome to Mango! Your next good plan starts here.'
            : (job.reply_text || 'Your Mango sign-in link is ready. Tiny doorway, better plans.').slice(0, 320);
          body = `${greeting}\n${job.plan_id ? 'View your event and sign in' : 'Sign in'}: ${issued.url}\nExpires in 10 minutes. Reply STOP to stop texts.`;
          expiresAt = new Date(Math.min(Date.parse(issued.expiresAt), Date.parse(job.expires_at))).toISOString();
        } else {
          body = job.reply_text || 'A tiny plot twist: Mango is temporarily unavailable. Please try again in a moment.';
        }
        await this.rpc('stage', { ...lease, ciphertext: this.vault.seal(body, job.id), expires_at: expiresAt });
      }
    } catch (error) {
      // Do not log remote bodies/errors: they may contain bearer links or PII.
      process.stderr.write(`${JSON.stringify({ event: 'mango_worker_error', code: errorCode(error) })}\n`);
      try {
        if (sending) await this.rpc('outcome', { ...lease, status: 'uncertain', error_code: errorCode(error) });
        else await this.rpc('retry', { ...lease, error_code: errorCode(error),
          permanent: error instanceof SafeError && error.permanent });
      } catch { /* Lost leases are recovered by the durable queue; never resend here. */ }
    }
    return true;
  }
}
