import type { ChannelAdapter, OutboundSendInput, OutboundSendResult } from '@mango/contracts';
import { randomUUID } from 'node:crypto';
import { createDecipheriv, createHash } from 'node:crypto';

function decryptDestination(value:string, pepper=process.env.PHONE_HASH_PEPPER||'demo-phone-pepper') {
  try { const b=Buffer.from(value,'base64url'); const d=createDecipheriv('aes-256-gcm',createHash('sha256').update(pepper).digest(),b.subarray(0,12)); d.setAuthTag(b.subarray(12,28)); return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8'); } catch { return value; }
}

export class AndroidLocalSimAdapter implements ChannelAdapter {
  readonly sent: Array<OutboundSendInput & {providerMessageId:string;acceptedAt:string}> = [];
  async sendText(input:OutboundSendInput):Promise<OutboundSendResult> { if(process.env.SIMULATOR_FAIL==='1') throw new Error('simulator_unavailable'); const result={providerMessageId:`sim-out-${randomUUID()}`,acceptedAt:new Date().toISOString()}; this.sent.push({...input,...result}); return result; }
}

export class AndroidHttpAdapter implements ChannelAdapter {
  constructor(private readonly baseUrl:string, private readonly username:string, private readonly password:string, private readonly deviceId?:string, private readonly simNumber?:number) {}
  async sendText(input:OutboundSendInput):Promise<OutboundSendResult> { const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),10_000); try { const id=`mango-${createHash('sha256').update(input.dedupeKey).digest('hex').slice(0,24)}`; const auth=Buffer.from(`${this.username}:${this.password}`).toString('base64'); const r=await fetch(this.baseUrl.replace(/\/$/,'')+'/messages?deviceActiveWithin=12',{method:'POST',headers:{'content-type':'application/json','authorization':`Basic ${auth}`},body:JSON.stringify({id,textMessage:{text:input.text},phoneNumbers:[decryptDestination(input.encryptedDestination)],...(this.deviceId?{deviceId:this.deviceId}:{}),...(this.simNumber?{simNumber:this.simNumber}:{}),ttl:3600,withDeliveryReport:true}),signal:controller.signal}); if(r.status===409) return {providerMessageId:id,acceptedAt:new Date().toISOString()}; if(!r.ok){const e=new Error(`gateway_${r.status}`); (e as any).permanent=r.status>=400&&r.status<500; throw e;} const b=await r.json() as any; return {providerMessageId:String(b.id||b.provider_message_id||id||randomUUID()),acceptedAt:new Date().toISOString()}; } finally { clearTimeout(timer); } }
}
