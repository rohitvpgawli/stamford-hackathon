import { readFileSync } from 'node:fs';
import type { OpportunityKind, OpportunityStatus } from '@mango/contracts';

export interface SeedOpportunity { id:string; kind:OpportunityKind; title:string; description:string; venueName:string; neighborhood:string; startsAt?:string; endsAt?:string; recurringText?:string; priceCents:number; status:OpportunityStatus; tags:string[]; audience:string[]; groupStyle:'solo_ok'|'small'|'medium'|'crowd'; accessibility:string[]; transportNotes:string; sourceName:string; sourceUrl:string; isDemoData:boolean; quality:number; eventPageUrl:string; }
export interface SeedPersona { id:string; firstName:string; userType:'resident'|'student'|'new_resident'; neighborhood:string; ageBand:string; interests:string[]; groupSize:'small'|'medium'|'crowd'; socialOptIn:boolean; transport:string; availability:string[]; }

// Public base for the mobile event pages Mango texts on JOIN. Each opportunity's
// canonical page is EVENT_PAGE_BASE + id (mirrors the event_page_url column in
// opportunities.json). Kept here so deterministic records stay in sync with the catalog.
export const EVENT_PAGE_BASE = 'https://mango-io.vercel.app/events/';

const iso = (days:number, hour:number, minute=0) => { const d = new Date(); d.setUTCHours(hour, minute, 0, 0); d.setUTCDate(d.getUTCDate()+days); return d.toISOString(); };
const end = (days:number, hour:number, duration=2) => { const d = new Date(iso(days,hour)); d.setUTCHours(d.getUTCHours()+duration); return d.toISOString(); };
const nextSaturday = (()=>{ const day=new Date().getUTCDay(); return ((6-day+7)%7)||7; })();
const nextSunday = (()=>{ const day=new Date().getUTCDay(); return ((7-day)%7)||7; })();
const base = (id:string,title:string,kind:OpportunityKind,tags:string[],neighborhood:string,days:number,hour:number,priceCents=0,groupStyle:'solo_ok'|'small'|'medium'|'crowd'='small'):SeedOpportunity => ({id,title,kind,tags,neighborhood,venueName: neighborhood+' public venue',description:'A friendly Mango demo opportunity in Stamford.',startsAt:iso(days,hour),endsAt:end(days,hour),priceCents,status:'active',audience:['all'],groupStyle,accessibility:['step-free entrance unknown'],transportNotes:'Public venue; check transit before leaving.',sourceName:'Mango demo seed',sourceUrl:'https://demo.mango.local/opportunities/'+id,isDemoData:true,quality:70,eventPageUrl:EVENT_PAGE_BASE+id});

// The Mill River Community Cleanup hero lives in the researched catalog
// (opportunities.json) with real source provenance—no deterministic duplicate here,
// so the ranker can never recommend the "same" event twice under two IDs.
const deterministicOpportunities: SeedOpportunity[] = [
  { ...base('opp-soccer','Scalzi Park Pickup Soccer','event',['soccer','sports','fitness','outdoors','social','free'],'North Stamford',nextSunday,14,0,'medium'), venueName:'Scalzi Park', description:'A friendly co-ed pickup soccer game; bring water and a light and dark shirt.', audience:['resident','student','new_resident','all'], accessibility:['outdoor'], quality:92 },
  { ...base('opp-study-walk','UConn Stamford Between-Classes Study Walk','campus',['student','outdoors','study','free'],'Campus',1,12,0,'small'), venueName:'UConn Stamford campus', description:'A flexible campus-adjacent walk and study reset for students between classes.', audience:['student'], recurringText:'Flexible 45-minute drop-in', quality:96 },
  { ...base('opp-yoga','Harbor Point Outdoor Yoga','event',['outdoors','wellness','social'],'Harbor Point',nextSaturday,10,500,'small'), venueName:'Harbor Point Commons', description:'Low-key outdoor yoga with room to chat after class.', quality:90 },
  { ...base('opp-trivia','Downtown Trivia Night','event',['social','food','trivia','evening'],'Downtown',2,19,1200,'medium'), venueName:'The Stamford Table', description:'Team trivia, snacks, and an easy way to meet a crowd.', quality:86 },
  { ...base('opp-unavailable-canceled','Canceled Harbor Cleanup','volunteer',['civic','outdoors'],'Harbor Point',2,13,0,'small'), venueName:'Harbor Point', description:'Unavailable demo record.', status:'canceled', quality:0 },
  { ...base('opp-unavailable-sold','Sold Out Downtown Concert','event',['arts','social'],'Downtown',3,20,2500,'crowd'), venueName:'Downtown Theater', description:'Unavailable demo record.', status:'sold_out', quality:0 },
  { ...base('opp-unavailable-expired','Expired Park Workshop','event',['outdoors'],'Cove',-2,14,0,'small'), venueName:'Cove Park', description:'Unavailable demo record.', status:'expired', quality:0 }
];

interface DatasetOpportunity {
  id:string; kind:OpportunityKind; title:string; short_description:string; venue_name:string; neighborhood:string;
  starts_at:string|null; ends_at:string|null; recurring_text:string|null; price_cents:number; status:OpportunityStatus;
  tags:string[]; audience:string[]; group_style:string|null; accessibility:{notes?:string}|null; transport_notes:string|null;
  source_name:string; source_url:string; is_demo_data:boolean; event_page_url?:string;
}

const tagAliases:Record<string,string[]> = {
  outdoor:['outdoors'], walking:['walk'], families:['family'], food_security:['food'], group_activity:['social'],
  work_friendly:['study'], cafe:['coffee']
};
const groupStyle = (value:string|null,kind:OpportunityKind):SeedOpportunity['groupStyle'] => {
  if(value==='solo_ok'||value==='small'||value==='medium'||value==='crowd') return value;
  return kind==='place' ? 'solo_ok' : 'small';
};
const datasetQuality = (o:DatasetOpportunity) => Math.min(98,72+(o.source_url?8:0)+(o.short_description?6:0)+(o.venue_name?4:0)+(o.group_style?3:0)+(o.starts_at?3:0));
const loadDataset = ():SeedOpportunity[] => {
  const path = new URL('../../../opportunities.json',import.meta.url);
  const rows = JSON.parse(readFileSync(path,'utf8')) as DatasetOpportunity[];
  return rows.map(o => {
    const tags = [...new Set(o.tags.flatMap(tag => [tag,...(tagAliases[tag]||[])]))];
    const accessibility = o.accessibility?.notes ? [o.accessibility.notes] : ['Accessibility details not provided; check the source before traveling.'];
    return {
      id:o.id, kind:o.kind, title:o.title, description:o.short_description, venueName:o.venue_name, neighborhood:o.neighborhood,
      startsAt:o.starts_at||undefined, endsAt:o.ends_at||undefined, recurringText:o.recurring_text||undefined, priceCents:o.price_cents,
      status:o.status, tags, audience:o.audience, groupStyle:groupStyle(o.group_style,o.kind), accessibility,
      transportNotes:o.transport_notes||'Check transit, parking, and access details before leaving.', sourceName:o.source_name,
      sourceUrl:o.source_url, isDemoData:o.is_demo_data, quality:datasetQuality(o),
      eventPageUrl:o.event_page_url||EVENT_PAGE_BASE+o.id
    };
  });
};

// Keep the deterministic hero records used by the demo while adding the researched
// Stamford catalog from opportunities.json. Dataset IDs are UUIDs and remain stable.
export const opportunities: SeedOpportunity[] = [...deterministicOpportunities,...loadDataset()];

// Hand-curated demo personas. Small on purpose: every match shown in the demo
// must be explainable from a persona's interests, and two opt-outs keep the
// social gate honest. Each hero opportunity has 2-3 plausible matches.
export const personas: SeedPersona[] = [
  { id:'persona-01', firstName:'Maya', userType:'resident', neighborhood:'Downtown', ageBand:'18_plus', interests:['outdoors','civic','volunteer','useful'], groupSize:'small', socialOptIn:true, transport:'walking', availability:['weekend','morning'] },
  { id:'persona-02', firstName:'Leo', userType:'student', neighborhood:'Campus', ageBand:'18_plus', interests:['student','study','social'], groupSize:'small', socialOptIn:true, transport:'walking', availability:['weekday','afternoon'] },
  { id:'persona-03', firstName:'Ava', userType:'resident', neighborhood:'Cove', ageBand:'18_plus', interests:['outdoors','fitness','social'], groupSize:'medium', socialOptIn:true, transport:'transit', availability:['weekend'] },
  { id:'persona-04', firstName:'Noah', userType:'new_resident', neighborhood:'Harbor Point', ageBand:'18_plus', interests:['food','social','evening'], groupSize:'medium', socialOptIn:true, transport:'walking', availability:['evening'] },
  { id:'persona-05', firstName:'Iris', userType:'resident', neighborhood:'Springdale', ageBand:'18_plus', interests:['arts','creative','social'], groupSize:'small', socialOptIn:true, transport:'transit', availability:['weekend','evening'] },
  { id:'persona-06', firstName:'Ravi', userType:'student', neighborhood:'Campus', ageBand:'18_plus', interests:['soccer','sports','fitness','outdoors'], groupSize:'medium', socialOptIn:true, transport:'transit', availability:['weekend','afternoon'] },
  { id:'persona-07', firstName:'Zoe', userType:'resident', neighborhood:'Glenbrook', ageBand:'18_plus', interests:['civic','useful','community','food'], groupSize:'small', socialOptIn:true, transport:'walking', availability:['weekend','morning'] },
  { id:'persona-08', firstName:'Owen', userType:'resident', neighborhood:'Downtown', ageBand:'18_plus', interests:['trivia','social','food','evening'], groupSize:'medium', socialOptIn:true, transport:'walking', availability:['evening'] },
  { id:'persona-09', firstName:'Nina', userType:'new_resident', neighborhood:'Harbor Point', ageBand:'18_plus', interests:['wellness','outdoors','social'], groupSize:'small', socialOptIn:true, transport:'walking', availability:['weekend','morning'] },
  { id:'persona-10', firstName:'Theo', userType:'resident', neighborhood:'Cove', ageBand:'18_plus', interests:['walk','nature','outdoors'], groupSize:'small', socialOptIn:false, transport:'walking', availability:['weekend'] },
  { id:'persona-11', firstName:'Sara', userType:'student', neighborhood:'Campus', ageBand:'18_plus', interests:['study','arts','quiet'], groupSize:'small', socialOptIn:false, transport:'transit', availability:['weekday'] },
  { id:'persona-12', firstName:'Emma', userType:'resident', neighborhood:'Springdale', ageBand:'18_plus', interests:['games','food','social'], groupSize:'small', socialOptIn:true, transport:'transit', availability:['evening','weekend'] }
];

export const copy = {
  firstGreeting:"Hey 👋 I’m Mango—your slightly over-opinionated guide to Stamford. What should I call you?",
  returningGreeting:(name:string)=>`Hey ${name} 👋 What should we find in Stamford today?`,
  nameSaved:(name:string)=>`Nice to meet you, ${name}. What are we feeling—something fun, somewhere to explore, meeting people, doing something useful, or surprise me?`,
  warning:'Tiny heads-up: I’m on hackathon-sized brainpower today 😄 We’ve got a couple messages left.',
  cutoff:'You’ve officially talked my ear off 😄 I’m capped for the demo right now. For more Mango, email support@trillium.one and we’ll increase your limit.',
  appUpsell:(url:string)=>`I could keep throwing options at you, but that’s how Saturday becomes 25 tabs and no plan 😄 I narrowed down a better-fit list in Mango: ${url}`,
  joined:(title:string,url:string,group='')=>`You’re in 🥭 I added ${title} to your Mango plan.${group} See your group and Stamford week: ${url}`,
  groupPreview:(names:string[],extra:number)=>names.length?` You’ll be with ${names.join(', ')}${extra>0?` +${extra} more`:''} (demo matches—meet in public).`:'',
  socialSignal:(count:number,tag:string)=>` ${count} Mango ${count===1?'member':'members'} also into ${tag} ${count===1?'has':'have'} this on their radar.`,
  alreadyJoined:(count:number)=>` ${count} ${count===1?'person has':'people have'} already joined.`,
  stop:'You’re unsubscribed from Mango texts. Reply START whenever you want back in.',
  start:'Welcome back 🥭 Mango texts are on again. What should we find?',
  help:'Mango helps with Stamford plans, places, volunteering, student life, and social matching. Reply STOP to pause. Support: support@trillium.one',
  redirect:'I’m staying in my lane: Stamford plans, places, people, volunteering, and student life. Want something to do nearby?',
  safety:'I’m sorry you’re dealing with this. If there is immediate danger, call 911. In the U.S., call or text 988 for crisis support. Mango can’t provide emergency care.',
  agentError:'Mango tripped over a mango 🥭 Try that again in a minute?',
  dbError:'Mango lost the Stamford map for a second. Try again shortly.',
  noResult:'I couldn’t find a solid fit without stretching your constraints. Want to relax the time, distance, or budget a little?',
  linkExpired:'That Mango link expired for privacy. Text Mango again and I’ll make you a fresh one.'
};
