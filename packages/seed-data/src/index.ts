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

// Deterministic hero records keep reliable demo timing. Matching researched
// records are merged below so source provenance is preserved without duplicates.
const deterministicOpportunities: SeedOpportunity[] = [
  { id:'opp-stamford-ai-collective-hackathon', kind:'event', title:'Stamford AI Collective Hackathon', description:'An open-to-all AI hackathon at UConn Stamford, with Mango presenting.', venueName:'UConn Stamford', neighborhood:'Downtown', startsAt:'2026-08-19T22:00:00.000Z', priceCents:0, status:'active', tags:['ai','artificial_intelligence','hackathon','technology','learning','social','evening'], audience:['resident','student','new_resident','all'], groupStyle:'crowd', accessibility:['Accessibility details not provided; check with the venue before traveling.'], transportNotes:'UConn Stamford in Downtown; check transit and parking before leaving.', sourceName:'Stamford AI Collective', sourceUrl:'https://mango-io.vercel.app', isDemoData:true, quality:99, eventPageUrl:EVENT_PAGE_BASE+'opp-stamford-ai-collective-hackathon' },
  { ...base('opp-soccer','Scalzi Park Pickup Soccer','event',['soccer','sports','fitness','outdoors','social','free'],'North Stamford',nextSunday,14,0,'medium'), venueName:'Scalzi Park', description:'A friendly co-ed pickup soccer game; bring water and a light and dark shirt.', audience:['resident','student','new_resident','all'], accessibility:['outdoor'], quality:92 },
  { ...base('opp-cleanup','Mill River Community Cleanup','volunteer',['civic','outdoors','useful','volunteer'],'Downtown',nextSaturday,13,0,'small'), venueName:'Mill River Park', description:'Help tidy a public stretch of Mill River with a small, welcoming crew.', audience:['resident','student','new_resident','all'], accessibility:['outdoor'], quality:98 },
  { ...base('opp-yoga','Harbor Point Outdoor Yoga','event',['outdoors','wellness','social'],'Harbor Point',nextSaturday,10,500,'small'), venueName:'Harbor Point Commons', description:'Low-key outdoor yoga with room to chat after class.', quality:90 },
  { ...base('opp-trivia','Downtown Trivia Night','event',['social','food','trivia','evening'],'Downtown',2,19,1200,'medium'), venueName:'The Stamford Table', description:'Team trivia, snacks, and an easy way to meet a crowd.', quality:86 },
  { ...base('opp-library','Ferguson Library Community Workshop','event',['civic','learning','accessible','free'],'Downtown',4,18,0,'small'), venueName:'Ferguson Library', description:'A practical community workshop in an accessible public library room.', accessibility:['step-free entrance','accessible restroom'], quality:94 },
  { ...base('opp-book-club','Ferguson Library Book Club','event',['book_club','reading','learning','social','free'],'Downtown',4,18,0,'small'), venueName:'Ferguson Library', description:'A clearly labeled Mango demo book discussion for readers who want a welcoming group.', accessibility:['step-free entrance','accessible restroom'], quality:95 },
  { ...base('opp-cove-walk','Cove Island Sunset Walk','place',['outdoors','walk','free'],'Cove',2,18,0,'solo_ok'), venueName:'Cove Island Park', description:'A public waterfront walk for a little fresh air and a calm reset.', quality:82 },
  { ...base('opp-glenbrook-market','Glenbrook Makers Market','event',['food','arts','social'],'Glenbrook',5,11,0,'crowd'), venueName:'Glenbrook Community Center', description:'Browse local makers and food stalls in a relaxed neighborhood market.', quality:80 },
  { ...base('opp-harbor-volunteer','Harbor Point Food Pantry Shift','volunteer',['civic','useful','indoors'],'Harbor Point',6,14,0,'small'), venueName:'Harbor Point Pantry', description:'A two-hour volunteer shift sorting community food donations.', quality:89 },
  { ...base('opp-springdale-garden','Springdale Garden Workday','volunteer',['civic','outdoors','gardening'],'Springdale',4,9,0,'small'), venueName:'Springdale Green', description:'Hands-on neighborhood gardening with tools and a public meeting point.', quality:84 },
  { ...base('opp-campus-art','UConn Student Gallery Hour','campus',['student','arts','free'],'Campus',2,16,0,'solo_ok'), venueName:'UConn Stamford Gallery', description:'A free, compact gallery visit that fits between campus commitments.', audience:['student'], quality:83 },
  { ...base('opp-campus-club','UConn Student Club Open House','campus',['student','social','free'],'Campus',3,17,0,'medium'), venueName:'UConn Stamford Student Center', description:'Meet student clubs and find a low-pressure group to try.', audience:['student'], quality:88 },
  { ...base('opp-campus-study','Campus Quiet Study Lab','campus',['student','study','free'],'Campus',1,15,0,'solo_ok'), venueName:'UConn Stamford Library', description:'A focused, quiet place to get work done during a class gap.', audience:['student'], quality:78 },
  { ...base('opp-campus-food','Student Budget Dinner Meetup','campus',['student','food','social'],'Campus',5,18,900,'small'), venueName:'Campus food court', description:'A casual budget-friendly meal with other Stamford students.', audience:['student'], quality:85 },
  { ...base('opp-campus-service','Student Civic Ideas Lab','campus',['student','civic','useful','free'],'Campus',6,17,0,'small'), venueName:'UConn Stamford Forum', description:'A short student-led session for shaping local service ideas.', audience:['student'], quality:87 },
  { ...base('opp-outdoor-run','Mill River Easy Run Club','event',['outdoors','fitness','social'],'Downtown',4,18,0,'small'), venueName:'Mill River Park', description:'An easy-paced public run with a welcoming beginner route.', quality:79 },
  { ...base('opp-outdoor-bike','Harbor Point Bike Loop','place',['outdoors','fitness','free'],'Harbor Point',5,16,0,'small'), venueName:'Harbor Point promenade', description:'A self-paced public bike loop with a simple waterfront route.', quality:76 },
  { ...base('opp-outdoor-picnic','Cove Community Picnic','event',['outdoors','food','social'],'Cove',6,13,0,'medium'), venueName:'Cove Island Park', description:'Bring-your-own picnic with a broad mix of Stamford neighbors.', quality:81 },
  { ...base('opp-outdoor-bird','Springdale Birding Hour','place',['outdoors','nature','free'],'Springdale',2,8,0,'small'), venueName:'Springdale trailhead', description:'A calm public nature walk for beginner birders.', quality:75 },
  { ...base('opp-arts-film','Downtown Indie Film Night','event',['arts','culture','evening'],'Downtown',5,19,1000,'crowd'), venueName:'Avon Theatre', description:'A local independent film screening with a post-film lobby hang.', quality:83 },
  { ...base('opp-arts-studio','Harbor Point Open Studio','event',['arts','culture','social'],'Harbor Point',3,18,800,'small'), venueName:'Harbor Point Arts Space', description:'See local work and meet artists in a casual open studio.', quality:82 },
  { ...base('opp-arts-history','Stamford History Talk','event',['arts','culture','learning','free'],'Downtown',4,19,0,'small'), venueName:'Stamford History Center', description:'A short public talk connecting Stamford places to their history.', quality:80 },
  { ...base('opp-arts-library','Library Zine Workshop','event',['arts','creative','free'],'Downtown',6,15,0,'small'), venueName:'Ferguson Library', description:'Make a small zine with simple supplies and friendly guidance.', quality:84 },
  { ...base('opp-food-social','Harbor Point Coffee Social','event',['food','social','morning'],'Harbor Point',1,9,600,'small'), venueName:'Harbor Point cafe', description:'A low-key coffee meetup for people who want to talk, not network.', quality:80 },
  { ...base('opp-food-market','Downtown Food Hall Crawl','event',['food','social'],'Downtown',2,17,1800,'medium'), venueName:'Downtown Food Hall', description:'Try a few stalls with a flexible group and no reservation required.', quality:77 },
  { ...base('opp-food-potluck','Glenbrook Neighborhood Potluck','event',['food','social','community'],'Glenbrook',5,18,0,'medium'), venueName:'Glenbrook Community Center', description:'A public community potluck with vegetarian options.', quality:86 },
  { ...base('opp-food-board','Springdale Board Game Cafe','place',['food','social','games'],'Springdale',6,19,1400,'small'), venueName:'Springdale game cafe', description:'A cozy public cafe with drop-in games and beginner tables.', quality:78 },
  { ...base('opp-park','Mill River Park Loop','place',['outdoors','free','walk'],'Downtown',1,10,0,'solo_ok'), venueName:'Mill River Park', description:'A flexible public park loop for a walk, reset, or quick break.', quality:73 },
  { ...base('opp-gallery-place','Cove Pop-up Gallery','place',['arts','free'],'Cove',3,14,0,'solo_ok'), venueName:'Cove Gallery', description:'A compact public gallery pop-up with rotating local work.', quality:71 },
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
    const tags = [...new Set([
      ...o.tags.flatMap(tag => [tag,...(tagAliases[tag]||[])]),
      ...(/library/i.test(`${o.title} ${o.venue_name}`) ? ['library','reading','study'] : [])
    ])];
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

// Keep deterministic timing for hero records, merge in matching researched
// provenance, and include the rest of the researched catalog exactly once.
const opportunityKey = (o:Pick<SeedOpportunity,'title'|'venueName'>) => `${o.title.trim().toLowerCase()}\u0000${o.venueName.trim().toLowerCase()}`;
const researchedOpportunities=loadDataset();
const researchedByKey=new Map(researchedOpportunities.map(o=>[opportunityKey(o),o]));
const mergedDeterministicOpportunities=deterministicOpportunities.map(o=>{
  const researched=researchedByKey.get(opportunityKey(o));
  if(!researched) return o;
  return {...o,tags:[...new Set([...o.tags,...researched.tags])],sourceName:researched.sourceName,sourceUrl:researched.sourceUrl,eventPageUrl:researched.eventPageUrl,quality:Math.max(o.quality,researched.quality)};
});
const deterministicKeys=new Set(deterministicOpportunities.map(opportunityKey));
export const curatedDemoEventIds=new Set([
  'opp-stamford-ai-collective-hackathon',
  'opp-soccer','opp-cleanup','opp-yoga','opp-trivia','opp-book-club','opp-library',
  'opp-harbor-volunteer','opp-springdale-garden','opp-campus-club','opp-campus-art',
  'opp-arts-film','opp-food-potluck',
  'b2dd4e9d-88b2-4573-8c05-c55238dcaa53',
  'f82ea9c1-033e-467d-96e5-8994067b6caa',
  '0e348830-5efd-4cd0-b145-b7bee43b9585',
  '44d3851b-883e-46d9-bae5-8c3186817c7b',
  '6e305296-fdb8-4912-b59f-89c70ef4d10f',
  'c46c2db7-9196-4c0c-9a65-07a501f1f62f',
  '7ff28c53-20a0-4ed3-bac9-bc7adf312cf1',
  '6f1957e9-d0fb-46bb-9e1b-fff6fe1484ec',
  '80bf7f07-bfb3-4d98-956f-6c0a63db5ae0',
  '4c99bacb-a305-4ee4-b0b0-a218b1121bbf',
  'b49e9f37-a7a6-414d-95f6-b035a01354d0',
  'e72f8aa5-0852-45a1-bdd6-f5aeaddb4575',
  '27f5e7c9-d52f-4665-8b49-5c87d65ad02d',
  '20b2ebcf-8462-4bad-8dad-7f473440b29f',
  '3841ebf4-33b5-4da2-9bd4-683de523be7a',
  '7af80863-70b9-48d4-8beb-a6325d6907a5',
  'acf2abbc-e396-404d-8119-fc7b0ef6b707',
  'aac46ebc-9156-4683-8b97-4fed197eea72',
  'a6893a63-7f36-45df-ad38-662e8b8199cd',
  'aa665e9b-04d6-4df8-8c8c-1e3b2a0832c5',
  'f005183d-851f-4bb1-97e5-91399acbb7ec',
  'bb1991c7-9dce-4843-9168-d491ac334209',
  '2fa2419d-41d3-40e5-a7f9-1ddd719b9e22',
  '24201f65-7d92-47b4-90c2-750e68b24f2b',
  'a878263e-a588-4780-9243-dc9af10eb11e',
  '325a9d83-de18-46af-8ebb-384ae0412ce2',
  '2e97b008-05a0-4049-8fe2-c3f6f8af1df7',
  '422e25d1-40e6-4393-ab7e-3969bb59cd39',
  '2e6c1ecd-5184-4450-9464-f30af43d9a93',
  '34ae2d4d-328c-4039-97aa-7d7d2ef4bdc3'
]);
const mergedOpportunities=[...mergedDeterministicOpportunities,...researchedOpportunities.filter(o=>!deterministicKeys.has(opportunityKey(o)))];
export const opportunities: SeedOpportunity[] = mergedOpportunities.map(o=>o.kind!=='place'&&o.status==='active'&&!curatedDemoEventIds.has(o.id)?{...o,status:'expired'}:o);

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
  firstGreeting:"Hey, I'm Mango, your slightly over-opinionated guide to Stamford. What should I call you?",
  returningGreeting:(name:string)=>`Hey ${name} 👋 What should we find in Stamford today?`,
  nameSaved:(name:string)=>`Nice to meet you, ${name}. What are we feeling: something fun, somewhere to explore, meeting people, doing something useful, or surprise me?`,
  warning:'Tiny heads-up: I’m on hackathon-sized brainpower today 😄 We’ve got a couple messages left.',
  socialPrivacy:'Nice try. I protect their privacy. Once you walk in, shout "Mango!" and you will figure it out.',
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
  noResult:'Give me one more clue: active, social, creative, outdoorsy, or anything works?',
  linkExpired:'That Mango link expired for privacy. Text Mango again and I’ll make you a fresh one.'
};
