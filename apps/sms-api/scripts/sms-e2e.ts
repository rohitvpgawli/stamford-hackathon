import { readFileSync, writeFileSync } from 'node:fs';
import { MangoDb } from '../src/db.js';
import { buildApp } from '../src/server.js';

interface Scenario {
  id:string; batch:number; title:string; name:string; messages:string[]; relevance:string[];
  forbidCampus:boolean; expectStudent?:boolean; expectRecommendation?:boolean; expectLink?:boolean; expectAgent?:boolean; joinWhenPossible:boolean;
}

const repoRoot=new URL('../../../',import.meta.url);
const loadSelectedEnv=()=>{
  try {
    const raw=readFileSync(new URL('.env',repoRoot),'utf8');
    const allowed=new Set(['HERMES_BASE_URL','HERMES_API_KEY','HERMES_TIMEOUT_MS']);
    for(const line of raw.split(/\r?\n/)){
      const match=line.match(/^([A-Z0-9_]+)=(.*)$/);
      if(!match||!allowed.has(match[1])||process.env[match[1]]) continue;
      process.env[match[1]]=match[2].trim().replace(/^(['"])(.*)\1$/,'$2');
    }
  } catch { /* deterministic fallback remains measurable in the report */ }
};

loadSelectedEnv();
process.env.NODE_ENV='test';
delete process.env.ANDROID_GATEWAY_BASE_URL;
delete process.env.DATABASE_URL;

const batchArg=process.argv.find(arg=>arg.startsWith('--batch='));
const outputArg=process.argv.find(arg=>arg.startsWith('--output='))?.slice('--output='.length);
const batch=Number(batchArg?.split('=')[1]);
if(!Number.isInteger(batch)||batch<1||batch>3) throw new Error('Use --batch=1, --batch=2, or --batch=3');

const scenarios=JSON.parse(readFileSync(new URL('../test/fixtures/sms-e2e-scenarios.json',import.meta.url),'utf8')) as Scenario[];
const selected=scenarios.filter(s=>s.batch===batch);
if(selected.length!==5) throw new Error(`Batch ${batch} must contain exactly five scenarios`);

const hermesBase=process.env.HERMES_BASE_URL?.replace(/\/$/,'');
const nativeFetch=globalThis.fetch;
const agentStatuses:number[]=[];
globalThis.fetch=(async(input:any,init?:RequestInit)=>{
  const response=await nativeFetch(input,init);
  if(hermesBase&&String(input).startsWith(hermesBase)) agentStatuses.push(response.status);
  return response;
}) as typeof fetch;

const rt=buildApp({db:new MangoDb(),webhookSecret:'sms-e2e-secret',adminToken:'sms-e2e-admin',appBaseUrl:'https://mango-io.vercel.app',linkSecret:'sms-e2e-link-secret',turnLimitBypassPhones:[]});
const headers={'x-mango-webhook-secret':'sms-e2e-secret','content-type':'application/json'};
let sequence=0;
const send=async(phone:string,text:string)=>{
  const provider_message_id=`sms-e2e-${batch}-${++sequence}`;
  const response=await rt.app.inject({method:'POST',url:'/v1/channels/android/inbound',headers,payload:{provider:'sms_e2e_simulator',provider_message_id,from:phone,text}});
  const deadline=Date.now()+35_000;
  while(Date.now()<deadline){
    const job=rt.db.db.prepare('SELECT status,error_code FROM inbound_jobs WHERE provider_message_id=?').get(provider_message_id) as {status:string;error_code:string|null}|undefined;
    if(job?.status==='completed') break;
    if(job?.status==='failed') throw new Error(`Inbound ${provider_message_id} failed: ${job.error_code||'unknown'}`);
    await rt.drain();
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  const completed=rt.db.db.prepare('SELECT status FROM inbound_jobs WHERE provider_message_id=?').get(provider_message_id) as {status:string}|undefined;
  if(completed?.status!=='completed') throw new Error(`Inbound ${provider_message_id} timed out in ${completed?.status||'missing'} state`);
  return {provider_message_id,statusCode:response.statusCode};
};
const linksFrom=(texts:string[])=>texts.flatMap(text=>text.match(/https:\/\/mango-io\.vercel\.app\/[^\s]+/g)||[]);
const waitForQueue=async()=>{
  const deadline=Date.now()+8_000;
  while(Date.now()<deadline){ const queued=rt.db.queueStats().find((x:any)=>x.status==='queued') as any; if(!queued?.count) return; await new Promise(resolve=>setTimeout(resolve,200)); }
};

const results:any[]=[];
try {
  for(const [index,scenario] of selected.entries()){
    const phone=`+120355${batch}${String(index+1).padStart(4,'0')}`;
    const beforeAgentCalls=agentStatuses.length;
    await send(phone,'Hi Mango');
    await send(phone,scenario.name);
    for(const message of scenario.messages) await send(phone,message);
    let user=rt.db.getUserByPhone(phone)!;
    let session=rt.db.activeSession(user.id);
    if(scenario.joinWhenPossible&&session.active_recommendation_id){
      const selected=rt.db.getOpportunity(session.active_recommendation_id);
      await send(phone,selected?.kind==='place'?'SAVE':'JOIN');
    }
    user=rt.db.getUserByPhone(phone)!;
    session=rt.db.activeSession(user.id);
    const messages=rt.db.allMessages(user.id);
    const inbound=messages.filter(m=>m.direction==='inbound').map(m=>m.text as string);
    const outbound=messages.filter(m=>m.direction==='outbound').map(m=>m.text as string);
    const combined=outbound.join(' ');
    const active=session.active_recommendation_id?rt.db.getOpportunity(session.active_recommendation_id):undefined;
    const exposedOpportunities=rt.db.exposures(session.id).flatMap(exposure=>{ const opportunity=rt.db.getOpportunity(exposure.opportunity_id); return opportunity?[opportunity]:[]; });
    const links=linksFrom(outbound);
    const linkChecks=[];
    for(const link of [...new Set(links)]){
      const parsed=new URL(link),token=parsed.searchParams.get('token')||'';
      const canonicalOpportunityPage=/^\/events\/[0-9a-f-]{36}$/i.test(parsed.pathname);
      const local=token?await rt.app.inject({method:'GET',url:'/v1/app/me?token='+encodeURIComponent(token)}):undefined;
      let publicStatus=0;
      try { publicStatus=(await nativeFetch(link,{redirect:'follow',signal:AbortSignal.timeout(10_000)})).status; } catch { publicStatus=0; }
      linkChecks.push({url:link.replace(/token=[^&]+/,'token=[redacted]'),domain:parsed.hostname,view:parsed.searchParams.get('v'),canonicalOpportunityPage,localApiStatus:local?.statusCode??null,publicStatus});
    }
    const relevanceHaystack=`${combined} ${active?.title||''} ${active?.description||''}`.toLowerCase();
    const opportunityRelevant=(opportunity:any)=>{ const haystack=`${opportunity.title} ${opportunity.description} ${opportunity.tags_json}`.toLowerCase(); return scenario.relevance.some(term=>haystack.includes(term.toLowerCase())); };
    const hasStudentFact=rt.db.facts(user.id).some(f=>f.key==='student.uconn_stamford'&&JSON.parse(f.value_json)===true);
    const checks={
      inboundAccepted:inbound.length===scenario.messages.length+2+(scenario.joinWhenPossible&&active?1:0),
      gotResponse:outbound.length>0,
      relevant:scenario.relevance.some(term=>relevanceHaystack.includes(term.toLowerCase())),
      noInternalLabels:!/\b(?:food|outdoor|social|semantic|adjacent|budget|time)_match\b|reason_codes?/i.test(combined),
      noEmDash:!/[—–]/.test(combined),
      noCampusLeak:!scenario.forbidCampus||!active||active.kind!=='campus',
      profileStateCorrect:(!scenario.forbidCampus||(user.user_type!=='student'&&!hasStudentFact))&&(!scenario.expectStudent||(user.user_type==='student'&&hasStudentFact)),
      everyRecommendationRelevant:exposedOpportunities.every(opportunityRelevant),
      recommendationResolved:!scenario.expectRecommendation||!!active,
      placeSaveSemantics:!scenario.joinWhenPossible||active?.kind!=='place'||(/\bSaved\. I added\b/i.test(combined)&&!/your group|easy openers/i.test(combined)),
      eventJoinSemantics:!scenario.joinWhenPossible||!active||active.kind==='place'||/You're in\. I added\b/i.test(combined),
      noUnaskedFree:/\b(?:cheap|budget|price|cost|under \$?\d+)\b/i.test(scenario.messages.join(' '))||!/\bfree\b/i.test(combined),
      linkPresent:!scenario.expectLink||links.length>0,
      linksValid:linkChecks.every(link=>link.domain==='mango-io.vercel.app'&&(link.canonicalOpportunityPage||link.localApiStatus===200)&&link.publicStatus>=200&&link.publicStatus<400),
      usedConfiguredAgent:scenario.expectAgent===false||!hermesBase||agentStatuses.slice(beforeAgentCalls).some(status=>status>=200&&status<300)
    };
    results.push({id:scenario.id,batch,title:scenario.title,userTexts:scenario.messages,profile:{userType:user.user_type,studentFact:hasStudentFact},recommendations:exposedOpportunities.map(o=>({id:o.id,title:o.title,kind:o.kind,relevant:opportunityRelevant(o)})),activeOpportunity:active?{id:active.id,title:active.title,kind:active.kind}:null,outboundResponses:outbound,links:linkChecks,agentHttpStatuses:agentStatuses.slice(beforeAgentCalls),checks,passed:Object.values(checks).every(Boolean)});
  }
  await waitForQueue();
  const jobs=rt.db.db.prepare("SELECT dedupe_key,text,status,sent_at,next_attempt_at FROM outbound_jobs WHERE dedupe_key LIKE 'reply:%:part:%' ORDER BY dedupe_key").all() as any[];
  const splitGroups=new Map<string,any[]>();
  for(const job of jobs){ const group=job.dedupe_key.slice(0,job.dedupe_key.lastIndexOf(':part:')); const groupJobs=splitGroups.get(group)||[]; groupJobs.push(job); splitGroups.set(group,groupJobs); }
  const splitAudit=[...splitGroups.entries()].filter(([,parts])=>parts.length>1).map(([group,parts])=>{
    const ordered=parts.sort((a,b)=>Number(a.dedupe_key.split(':part:')[1])-Number(b.dedupe_key.split(':part:')[1]));
    const gaps=ordered.slice(1).map((part,i)=>new Date(part.sent_at||part.next_attempt_at).valueOf()-new Date(ordered[i].sent_at||ordered[i].next_attempt_at).valueOf());
    return {group:group.replace(/[0-9a-f-]{20,}/gi,'[id]'),parts:ordered.length,statuses:ordered.map(p=>p.status),gapsMs:gaps,passed:ordered.every(p=>p.status==='sent')&&gaps.every(gap=>gap>=900)};
  });
  const summary={batch,mode:hermesBase?'configured Hermes/Luna with local SMS adapter':'deterministic fallback with local SMS adapter',scenarioCount:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,agentCalls:agentStatuses.length,splitGroups:splitAudit.length,splitOrderingPassed:splitAudit.every(x=>x.passed)};
  const output=JSON.stringify({generatedAt:new Date().toISOString(),summary,results,splitAudit},null,2)+'\n';
  if(outputArg) writeFileSync(outputArg,output);
  else process.stdout.write(output);
} finally {
  rt.stopWorker();
  await rt.app.close();
  globalThis.fetch=nativeFetch;
}
