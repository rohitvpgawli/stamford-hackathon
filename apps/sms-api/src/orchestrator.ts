import type { CanonicalInbound, Intent } from '@mango/contracts';
import { copy } from '@mango/seed-data';
import { clarificationQuestion, classify, extractNameAndRequest, HermesAgentClient, safeName } from './conversation.js';
import type { MangoDb, SessionRow, UserRow } from './db.js';
import { signAppToken } from './token.js';

export interface OrchestratorOptions { maxTurns:number; warningAt:number; appBaseUrl:string; linkSecret:string; turnLimitBypassPhones:string[]; }
interface AcceptedInbound { messageId:string; userId:string; sessionId:string; isNew:boolean; }
export function smsSafeText(text:string) { return text.replace(/[—–−]/g,', ').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/…/g,'...').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E\n]/g,'').replace(/[ \t]+/g,' ').replace(/\s+([,.!?;:])/g,'$1').trim(); }
export function splitSmsText(text:string,max=160) { const words=text.split(/\s+/).filter(Boolean),parts:string[]=[]; let current=''; for(const word of words){ if(word.length>max){if(current){parts.push(current);current='';}for(let i=0;i<word.length;i+=max)parts.push(word.slice(i,i+max));continue;} const next=current?`${current} ${word}`:word; if(next.length>max){parts.push(current);current=word;}else current=next;} if(current)parts.push(current); return parts.length?parts:['']; }
export class Orchestrator {
  readonly hermes:HermesAgentClient;
  private readonly turnLimitBypassHashes:Set<string>;
  constructor(private readonly db:MangoDb,private readonly opts:OrchestratorOptions={maxTurns:Number(process.env.MAX_USER_TURNS||12),warningAt:Number(process.env.TURN_WARNING_AT||10),appBaseUrl:process.env.APP_DEEP_LINK_BASE_URL||'https://mango-io.vercel.app',linkSecret:process.env.DEEP_LINK_SIGNING_SECRET||'demo-deep-link-secret',turnLimitBypassPhones:[]}) { this.hermes=new HermesAgentClient(db); this.turnLimitBypassHashes=new Set(opts.turnLimitBypassPhones.map(phone=>db.hashPhone(phone))); }
  appLink(userId:string,sessionId:string,path='/for-you') {
    const token=signAppToken(userId,sessionId,this.opts.linkSecret);
    // The deployed demo is a single-page app at the domain root. Keep the
    // signed token, but express the requested screen as a compact query value
    // so Vercel never receives an unsupported nested route.
    const view=path.startsWith('/plans/')?'p':path.includes('calendar')?'c':'f';
    return `${this.opts.appBaseUrl}/?v=${view}&token=${encodeURIComponent(token)}`;
  }
  private bypassesTurnLimit(user:UserRow) { return this.turnLimitBypassHashes.has(user.phone_hash); }
  private reply(user:UserRow,session:SessionRow,inboundId:string,text:string,kind:string,delayMs=0) { let body=text; if(!this.bypassesTurnLimit(user) && kind!=='warning' && session.inbound_turns===this.opts.warningAt && !session.warning_sent_at){ body=`${body} ${copy.warning}`; this.db.updateSession(session.id,{warning_sent_at:new Date().toISOString()}); } const safe=smsSafeText(body).slice(0,600),parts=splitSmsText(safe); this.db.insertOutboundMessage(`out:${inboundId}:${kind}`,session.id,safe); parts.forEach((part,index)=>this.db.enqueue(user.id,session.id,part,`reply:${inboundId}:${kind}:part:${index+1}`,delayMs+index*1000)); return safe; }
  async enqueue(input:CanonicalInbound) { const text=input.text?.trim()||''; if(!text||text.length>1000) return {accepted:false,reason:'invalid_text'}; const existing=this.db.getUserByPhone(input.from); const user=this.db.getOrCreateUser(input.from); const session=this.db.activeSession(user.id); const inserted=this.db.insertInbound(input.provider_message_id,session.id,text); if(inserted.duplicate) return {accepted:true,duplicate:true,userId:user.id,sessionId:session.id}; const job=this.db.enqueueInbound(input.provider_message_id,inserted.id,user.id,session.id,{...input,text}); return {accepted:true,duplicate:false,queued:true,jobId:job.id,userId:user.id,sessionId:session.id}; }
  async drain(max=100) { let processed=0; while(processed<max){ const job=this.db.claimInbound(); if(!job) break; try { await this.process(JSON.parse(job.payload_json) as CanonicalInbound,{messageId:job.message_id,userId:job.user_id,sessionId:job.session_id,isNew:job.sequence===1 && !(this.db.getUser(job.user_id)?.display_name)}); this.db.completeInbound(job.id); } catch(e:any) { this.db.completeInbound(job.id,e?.message||'processing_error'); } processed++; } return processed; }
  async process(input:CanonicalInbound, accepted?:AcceptedInbound) { const text=input.text?.trim()||''; if(!text||text.length>1000) return {accepted:false,reason:'invalid_text'}; const existing=this.db.getUserByPhone(input.from); const user=accepted?.userId?this.db.getUser(accepted.userId)!:this.db.getOrCreateUser(input.from); let session=accepted?.sessionId?this.db.getSession(accepted.sessionId)!:this.db.activeSession(user.id); const inserted=accepted?{id:accepted.messageId,duplicate:false}:this.db.insertInbound(input.provider_message_id,session.id,text); if(inserted.duplicate) return {accepted:true,duplicate:true,userId:user.id,sessionId:session.id};
    const isNew=accepted?.isNew??!existing; if(isNew) { const first=classify(text,'new',false); if(first.intent==='COMMAND_STOP'){this.db.setMessageIntent(inserted.id,first.intent,'normal');this.db.setUserStatus(user.id,'opted_out');this.reply(user,session,inserted.id,copy.stop,'stop');return {accepted:true,duplicate:false,userId:user.id,sessionId:session.id};} if(first.safety==='high_risk'){this.db.setMessageIntent(inserted.id,first.intent,first.safety);this.reply(user,session,inserted.id,copy.safety,'safety');return {accepted:true,duplicate:false,userId:user.id,sessionId:session.id};} this.db.updateSession(session.id,{state:'awaiting_name',pending_action_json:JSON.stringify({deferred_user_text:text}),last_activity_at:new Date().toISOString(),inbound_turns:0}); this.db.setMessageIntent(inserted.id,'GREETING_OR_SMALLTALK','normal'); if(user.status==='active') this.reply(user,session,inserted.id,copy.firstGreeting,'first'); return {accepted:true,duplicate:false,userId:user.id,sessionId:session.id}; }
    if(user.status==='opted_out' && !/^start$/i.test(text)) return {accepted:true,duplicate:false,userId:user.id,sessionId:session.id};
    const nameAndRequest=session.state==='awaiting_name'?extractNameAndRequest(text):undefined;
    const c=nameAndRequest?{intent:'PROVIDE_NAME' as const,safety:'normal' as const,entities:{name:nameAndRequest.name,request:nameAndRequest.request}}:classify(text,session.state,!!user.display_name); this.db.setMessageIntent(inserted.id,c.intent,c.safety);
    if(c.intent==='COMMAND_STOP'){ this.db.setUserStatus(user.id,'opted_out'); this.reply(user,session,inserted.id,copy.stop,'stop'); return {accepted:true,userId:user.id,sessionId:session.id}; }
    if(c.intent==='COMMAND_START'){ this.db.setUserStatus(user.id,'active'); this.reply(user,session,inserted.id,copy.start,'start'); return {accepted:true,userId:user.id,sessionId:session.id}; }
    if(c.intent==='COMMAND_HELP'){ this.reply(user,session,inserted.id,copy.help,'help'); return {accepted:true,userId:user.id,sessionId:session.id}; }
    if(c.safety==='high_risk'){ this.reply(user,session,inserted.id,copy.safety,'safety'); return {accepted:true,userId:user.id,sessionId:session.id}; }
    if(c.safety==='abuse'||c.safety==='off_topic'||c.intent==='OFF_TOPIC'||c.intent==='PROMPT_INJECTION'){ this.increment(session); this.reply(user,session,inserted.id,copy.redirect,'redirect'); return {accepted:true,userId:user.id,sessionId:session.id}; }
    if(c.intent==='COMMAND_RESET'){ this.db.updateSession(session.id,{state:'closed',last_activity_at:new Date().toISOString()}); this.reply(user,session,inserted.id,'Session reset. Your stable profile stays saved. Text me when you’re ready for a fresh plan.','reset'); return {accepted:true,userId:user.id,sessionId:session.id}; }
    // A name is always the first useful exchange for a new user.
    if(session.state==='awaiting_name' && c.intent==='PROVIDE_NAME') { const name=safeName(String(c.entities.name)); this.db.updateUserName(user.id,name); const pending=String(c.entities.request||'')||(session.pending_action_json?JSON.parse(session.pending_action_json).deferred_user_text:''); this.db.updateSession(session.id,{state:'discovering',pending_action_json:null,inbound_turns:session.inbound_turns+1,last_activity_at:new Date().toISOString()}); session=this.db.getSession(session.id)!; this.reply(user,this.db.getSession(session.id)!,inserted.id,copy.nameSaved(name),'name'); if(pending && classify(pending,'discovering',true).intent!=='GREETING_OR_SMALLTALK'){ const pc=classify(pending,'discovering',true); const result=await this.discovery(user,session,inserted.id,pending,pc.intent); return {...result,userId:user.id,sessionId:session.id}; } return {accepted:true,userId:user.id,sessionId:session.id}; }
    if(session.state==='awaiting_name') { this.reply(user,session,inserted.id,'I didn’t catch a first name—what should I call you?','name_retry'); return {accepted:true,userId:user.id,sessionId:session.id}; }
    session=this.db.getSession(session.id)!;
    const protectedJoin=c.intent==='JOIN_PLAN' && !!session.active_recommendation_id;
    const maxTurns=user.turn_limit_override??this.opts.maxTurns;
    if(!this.bypassesTurnLimit(user) && !protectedJoin && session.inbound_turns>=maxTurns) { if(!session.cutoff_sent_at){ this.db.updateSession(session.id,{state:'limited',cutoff_sent_at:new Date().toISOString()}); this.reply(user,session,inserted.id,copy.cutoff,'cutoff'); } return {accepted:true,userId:user.id,sessionId:session.id,limited:true}; }
    this.increment(session); session=this.db.getSession(session.id)!;
    if(c.intent==='JOIN_PLAN') return await this.join(user,session,inserted.id);
    if(c.intent==='LEAVE_PLAN'){ if(session.active_recommendation_id) this.db.markExposure(session.id,session.active_recommendation_id,'rejected'); this.reply(user,session,inserted.id,'No problem, I left that plan untouched. Want another Stamford option?','leave'); return {accepted:true,userId:user.id,sessionId:session.id}; }
    if(c.intent==='APP_OR_CALENDAR'){ const link=this.appLink(user.id,session.id,'/for-you?view=calendar'); this.reply(user,session,inserted.id,`Your Mango week is here: ${link}`,'app'); return {accepted:true,userId:user.id,sessionId:session.id}; }
    if(c.intent==='MORE_OPTIONS' && this.db.exposures(session.id).length>=2){ const link=this.appLink(user.id,session.id,'/for-you?view=calendar'); this.reply(user,session,inserted.id,copy.appUpsell(link),'upsell'); this.db.updateSession(session.id,{state:'discovering'}); return {accepted:true,userId:user.id,sessionId:session.id,upsell:true}; }
    if(c.intent==='REJECT_RECOMMENDATION'&&session.active_recommendation_id) this.db.markExposure(session.id,session.active_recommendation_id,'rejected');
    return {...await this.discovery(user,session,inserted.id,text,c.intent),userId:user.id,sessionId:session.id};
  }
  private increment(s:SessionRow){ const turns=s.inbound_turns+1; this.db.updateSession(s.id,{inbound_turns:turns,last_activity_at:new Date().toISOString(),version:s.version+1}); }
  private async discovery(user:UserRow,session:SessionRow,inboundId:string,text:string,intent:Intent){
    let requestText=text;
    let previous:Record<string,unknown>={};
    try { previous=JSON.parse(session.pending_action_json||'{}'); } catch { /* use the current text */ }
    if(typeof previous.clarifying_for==='string'&&previous.clarifying_for) requestText=`Original request: ${previous.clarifying_for}\nUser clarification: ${text}`.slice(0,1000);
    else if(/^(like|such as|examples?|what else)\b/i.test(text)&&typeof previous.last_discovery_text==='string'&&previous.last_discovery_text) requestText=`${previous.last_discovery_text}, another option`;
    const agent=await this.hermes.respond({user,session,message:requestText,intent,messageId:inboundId});
    if(!agent.opportunityId){
      const pending=agent.action==='ASK_FOLLOWUP'?JSON.stringify({last_discovery_text:requestText,clarifying_for:requestText}):session.pending_action_json;
      const summary=agent.action==='ASK_FOLLOWUP'?`Clarifying: ${requestText}`:session.active_recommendation_id?session.summary:`Conversation: ${requestText}`;
      this.db.updateSession(session.id,{pending_action_json:pending,summary});
      this.reply(user,session,inboundId,agent.text||clarificationQuestion(requestText),agent.action.toLowerCase());
      return {accepted:true,followup:agent.action==='ASK_FOLLOWUP',action:agent.action};
    }
    const selected=this.db.getOpportunity(agent.opportunityId);
    if(!selected){this.reply(user,session,inboundId,clarificationQuestion(requestText),'followup');return {accepted:true,followup:true};}
    const reasons=[agent.matchType==='adjacent'?'ADJACENT_MATCH':'SEMANTIC_MATCH']; const score=agent.matchType==='exact'?100:70; const body=agent.text; const recommendationPending=JSON.stringify({last_discovery_text:requestText}); this.db.expose(user.id,session.id,selected.id,score,reasons,body); this.db.updateSession(session.id,{state:'discovering',recommendation_count:this.db.exposures(session.id).length,active_recommendation_id:selected.id,pending_action_json:recommendationPending,summary:`Recommended ${selected.title}; match ${agent.matchType}`}); this.reply(user,session,inboundId,body,'recommendation'); return {accepted:true,opportunityId:selected.id};
  }
  private async join(user:UserRow,session:SessionRow,inboundId:string){
    const id=session.active_recommendation_id!;
    const o=this.db.getOpportunity(id);
    if(!o){this.reply(user,session,inboundId,'Which plan should I add? Reply with the event name.','join_ambiguous');return {accepted:true};}
    const alreadyJoined=this.db.joined(user.id).some(j=>j.opportunity_id===id);
    this.db.createJoin(user.id,id,session.id);
    this.db.updateSession(session.id,{state:'joined',pending_action_json:null});
    const link=this.appLink(user.id,session.id,`/plans/${encodeURIComponent(id)}`);
    this.reply(user,session,inboundId,copy.joined(o.title,link),'joined');
    if(!alreadyJoined){
      const icebreakers=await this.hermes.afterJoin({user,session:this.db.getSession(session.id)!,opportunity:o,messageId:inboundId});
      this.reply(user,this.db.getSession(session.id)!,inboundId,icebreakers,'icebreakers',1500);
    }
    return {accepted:true,joined:true,opportunityId:id};
  }
}
