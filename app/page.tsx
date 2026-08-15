"use client";

import { useState } from "react";

type Tab = "for-you" | "calendar" | "plans" | "explore";
type FeedMode = "picks" | "all";

const compactEvents = [
  { time: "TONIGHT · 7:30 PM", title: "Trivia at Third Place", place: "Third Place by Half Full", fit: "88%", kind: "trivia" },
  { time: "SUN · 10:00 AM", title: "Harbor Point Yoga", place: "Commons Park", fit: "84%", kind: "yoga" },
  { time: "TUE · 6:00 PM", title: "Books & Bites", place: "Ferguson Library", fit: "81%", kind: "books" },
];

const allEvents = [
  { day: "Today", date: "15", time: "1:30 PM", title: "Mill River Community Cleanup", place: "Mill River Park", tag: "Mango Pick", fit: "94%", people: "4 going" },
  { day: "Today", date: "15", time: "7:30 PM", title: "Trivia at Third Place", place: "Third Place by Half Full", tag: "Mango Pick", fit: "88%", people: "3 going" },
  { day: "Sunday", date: "16", time: "10:00 AM", title: "Harbor Point Yoga", place: "Commons Park", tag: "Wellness", fit: "84%", people: "12 going" },
  { day: "Tuesday", date: "18", time: "6:00 PM", title: "Books & Bites", place: "Ferguson Library", tag: "Community", fit: "81%", people: "6 going" },
  { day: "Wednesday", date: "19", time: "5:30 PM", title: "UConn Student Social", place: "UConn Stamford", tag: "Students", fit: "76%", people: "18 going" },
];

const places = [
  { icon: "↟", title: "Cove Island Park", type: "PARK · WATERFRONT", note: "Best for a breezy one-hour walk", distance: "11 min", tone: "green" },
  { icon: "⌂", title: "Ferguson Library", type: "LIBRARY · DOWNTOWN", note: "Quiet corners, workshops, and local talks", distance: "7 min", tone: "gold" },
  { icon: "◫", title: "UConn Stamford", type: "STUDENT LIFE", note: "Clubs, drop-ins, and campus events", distance: "8 min", tone: "blue" },
  { icon: "✦", title: "Stamford Nature Center", type: "OUTDOORS · FAMILY", note: "Trails, animals, and a little reset", distance: "16 min", tone: "clay" },
];

const people = [
  { initials: "MK", name: "Maya", detail: "New to Stamford · Product", tone: "peach" },
  { initials: "DS", name: "Daniel", detail: "Downtown · Healthcare", tone: "mint" },
  { initials: "AJ", name: "Aisha", detail: "UConn alum · Design", tone: "lilac" },
  { initials: "JL", name: "Jon", detail: "Harbor Point · Finance", tone: "sky" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("for-you");
  const [mode, setMode] = useState<FeedMode>("picks");
  const [showHandoff, setShowHandoff] = useState(true);
  const [joinedCleanup, setJoinedCleanup] = useState(false);
  const [joinSheet, setJoinSheet] = useState(false);
  const [exploreType, setExploreType] = useState("All");

  const joinPlan = () => {
    setJoinedCleanup(true);
    setJoinSheet(true);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setTab("for-you")} aria-label="Mango home">
          <span className="brand-mark">M</span>
          <span>mango</span>
        </button>
        <div className="top-actions">
          <span className="location-pill"><i>●</i> Stamford</span>
          <button className="bell" aria-label="Notifications">●</button>
          <button className="avatar" aria-label="Open profile">RG</button>
        </div>
      </header>

      {tab === "for-you" && (
        <section className="screen screen-for-you" aria-label="For You">
          <div className="hero" id="top">
            <div className="hero-kicker"><p className="eyebrow">SATURDAY, AUGUST 15</p><span>72° · Clear</span></div>
            <h1>Hey Rohit, let’s make<br />today count.</h1>
            <p className="intro">A better day in Stamford starts here.</p>
          </div>

          <button className="learned-banner" onClick={() => setShowHandoff(true)}>
            <span className="learned-icon">✦</span>
            <span><small>MANGO INTELLIGENCE</small><b>Curated from your conversation</b><em>Outdoors · Social · Useful · Under $20</em></span>
            <span className="chevron">›</span>
          </button>

          <div className="feed">
            <ModeToggle mode={mode} setMode={setMode} />

            {mode === "picks" ? (
              <>
                <article className="featured-card">
                  <div className="featured-art cleanup-art">
                    <div className="art-glow" />
                    <div className="sun" />
                    <div className="skyline"><i /><i /><i /><i /><i /></div>
                    <div className="river-ribbon" />
                    <span className="best-match">✦ YOUR BEST MATCH</span>
                    <div className="fit-score"><strong>94%</strong><span>fit</span></div>
                  </div>
                  <div className="featured-body">
                    <p className="event-meta">TODAY · 1:30 PM · 12 MIN AWAY</p>
                    <h2>Mill River Community Cleanup</h2>
                    <p className="place">Mill River Park · Downtown Stamford</p>
                    <div className="chips" aria-label="Why Mango picked this">
                      <span>Outdoors</span><span>Free</span><span>Small group</span>
                    </div>
                    <div className="reason"><i>✦</i><p><b>Why this is your move</b><span>You wanted fresh air, good people, and something useful. This quietly nails all three.</span></p></div>
                    <div className="people-preview">
                      <div className="avatar-stack" aria-label="Four compatible people are going">
                        {people.slice(0, 4).map((person) => <i key={person.initials} className={person.tone}>{person.initials}</i>)}
                      </div>
                      <p><b>4 compatible people</b><br /><span>are interested</span></p>
                    </div>
                    <button className={`join-button ${joinedCleanup ? "joined" : ""}`} onClick={joinedCleanup ? () => setTab("plans") : joinPlan}>
                      {joinedCleanup ? "You’re in — view plan" : "Join the plan"} <span>{joinedCleanup ? "✓" : "→"}</span>
                    </button>
                  </div>
                </article>

                <div className="section-heading">
                  <div><p className="eyebrow">MORE FOR YOU</p><h2>Good backups.</h2></div>
                  <span>Because plans change</span>
                </div>
                <div className="compact-grid">
                  {compactEvents.map((event) => <CompactEvent key={event.title} event={event} />)}
                </div>
              </>
            ) : (
              <div className="all-feed">
                <div className="directory-note"><span>⌁</span><p><b>Everything happening nearby</b><br />Less curation, more options.</p></div>
                {allEvents.map((event) => <AgendaEvent key={event.title} event={event} compact />)}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "calendar" && (
        <section className="screen calendar-screen" id="calendar" aria-label="Calendar">
          <PageTitle eyebrow="YOUR STAMFORD WEEK" title="Calendar" copy="A week with something worth leaving the house for." />
          <div className="week-strip" aria-label="Week of August 15">
            {[['S','15'],['S','16'],['M','17'],['T','18'],['W','19'],['T','20'],['F','21']].map(([day,date], i) => (
              <button key={`${day}${date}`} className={i === 0 ? "selected" : i === 1 || i === 3 || i === 4 ? "has-event" : ""}><span>{day}</span><b>{date}</b></button>
            ))}
          </div>
          <div className="calendar-controls">
            <ModeToggle mode={mode} setMode={setMode} />
          </div>
          <div className="agenda">
            {(mode === "picks" ? allEvents.filter((event) => Number(event.fit.replace('%','')) >= 80) : allEvents).map((event, index) => (
              <div className="agenda-row" key={event.title}>
                <div className="date-block"><span>{event.day}</span><b>{event.date}</b></div>
                <AgendaEvent event={event} compact={false} />
                {index < (mode === "picks" ? 3 : 4) && <div className="agenda-line" />}
              </div>
            ))}
          </div>
          <button className="ask-mango"><span>✦</span><span><b>Not seeing your vibe?</b><small>Ask Mango for something else</small></span><i>→</i></button>
        </section>
      )}

      {tab === "plans" && (
        <section className="screen plans-screen" id="plans" aria-label="Plans">
          <PageTitle eyebrow="YOU’RE NOT GOING ALONE" title="Your plans" copy="Everything you joined, plus the people making it better." />
          {joinedCleanup ? (
            <article className="plan-card primary-plan">
              <div className="plan-date"><span>AUG</span><b>15</b><small>1:30 PM</small></div>
              <div className="plan-copy"><span className="status-pill">CONFIRMED</span><h2>Mill River Community Cleanup</h2><p>Meet at the carousel entrance · 12 min away</p></div>
              <div className="plan-people">
                <p className="eyebrow">YOUR MANGO CREW</p>
                <div className="people-list">
                  {people.map((person) => (
                    <div className="person" key={person.name}><i className={person.tone}>{person.initials}</i><span><b>{person.name}</b><small>{person.detail}</small></span><em>Match</em></div>
                  ))}
                </div>
              </div>
              <div className="plan-actions"><button>Message group</button><button className="outline-button">Plan details</button></div>
            </article>
          ) : (
            <div className="empty-plan">
              <span>◎</span><h2>Your next good story starts here.</h2><p>Join a Mango Pick and I’ll gather the details—and a small crew—right here.</p>
              <button onClick={() => setTab("for-you")}>See my picks →</button>
            </div>
          )}

          <div className="section-heading past-heading"><div><p className="eyebrow">ALREADY ON YOUR CALENDAR</p><h2>Coming up.</h2></div></div>
          <article className="mini-plan">
            <div className="mini-date"><span>AUG</span><b>19</b></div>
            <div><p>WED · 5:30 PM</p><h3>UConn Stamford Social</h3><span>18 people · Free</span></div>
            <button aria-label="Open plan">›</button>
          </article>
        </section>
      )}

      {tab === "explore" && (
        <section className="screen explore-screen" id="explore" aria-label="Explore Stamford">
          <PageTitle eyebrow="YOUR CITY, UNFRAGMENTED" title="Explore Stamford" copy="Parks, programs, campus life, and good places to simply be." />
          <label className="search-box"><span>⌕</span><input aria-label="Search Stamford" placeholder="Search Stamford" /></label>
          <div className="category-scroll" aria-label="Explore categories">
            {["All", "Parks", "Libraries", "Civic", "UConn", "Local"].map((type) => <button className={exploreType === type ? "active" : ""} onClick={() => setExploreType(type)} key={type}>{type}</button>)}
          </div>
          <div className="explore-lead">
            <p className="eyebrow">PLACES WORTH KNOWING</p><h2>Stamford, minus the guesswork.</h2>
          </div>
          <div className="place-grid">
            {places.filter((place) => exploreType === "All" || place.type.toLowerCase().includes(exploreType.toLowerCase().replace("parks","park").replace("libraries","library"))).map((place) => (
              <article className="place-card" key={place.title}>
                <div className={`place-visual ${place.tone}`}><span>{place.icon}</span><i>{place.distance}</i></div>
                <div><p>{place.type}</p><h3>{place.title}</h3><span>{place.note}</span></div>
                <button aria-label={`View ${place.title}`}>↗</button>
              </article>
            ))}
          </div>
          <div className="civic-callout"><span className="civic-mark">♢</span><div><p className="eyebrow">CIVIC, WITHOUT THE HOMEWORK</p><h3>Want to help Stamford this month?</h3><p>Three local opportunities match the causes you care about.</p><button>Show me how to help →</button></div></div>
        </section>
      )}

      <nav className="bottom-nav" aria-label="Primary navigation">
        <NavButton tab="for-you" current={tab} setTab={setTab} icon="⌂" label="For You" />
        <NavButton tab="calendar" current={tab} setTab={setTab} icon="□" label="Calendar" />
        <NavButton tab="plans" current={tab} setTab={setTab} icon="◎" label="Plans" badge={joinedCleanup} />
        <NavButton tab="explore" current={tab} setTab={setTab} icon="⌕" label="Explore" />
      </nav>

      {showHandoff && (
        <div className="handoff-overlay" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
          <i className="ambient-orb orb-one" /><i className="ambient-orb orb-two" />
          <div className="sms-phone">
            <div className="sms-head"><button aria-label="Go back">‹</button><span className="sms-avatar">M</span><div><b>Mango</b><small>Stamford’s local friend</small></div><i>•••</i></div>
            <div className="sms-thread">
              <span className="day-label">Today 12:04 PM</span>
              <p className="bubble user-bubble">I’m free this afternoon. Want to get outside, meet people, and do something useful. Nothing expensive.</p>
              <p className="bubble mango-bubble">That is wonderfully specific. I think you should do the Mill River cleanup at 1:30. It’s outside, free, and four people you’d probably click with are interested.</p>
              <p className="bubble mango-bubble short">I put the plan—and a few backups—into your Mango week 👇</p>
            </div>
          </div>
          <div className="handoff-card">
            <span className="handoff-spark">✦</span>
            <p className="eyebrow">YOUR CONVERSATION IS YOUR ONBOARDING</p>
            <h2 id="handoff-title">Mango already knows what to show you.</h2>
            <p>No forms. No blank feed. Just a Stamford week shaped around what you said.</p>
            <button onClick={() => setShowHandoff(false)}>Open my Mango week <span>→</span></button>
          </div>
        </div>
      )}

      {joinSheet && (
        <div className="sheet-overlay" role="dialog" aria-modal="true" aria-labelledby="joined-title">
          <div className="join-sheet">
            <button className="sheet-close" onClick={() => setJoinSheet(false)} aria-label="Close">×</button>
            <div className="success-mark">✓</div>
            <p className="eyebrow">YOU’RE IN</p>
            <h2 id="joined-title">Saturday just got better.</h2>
            <p>I saved the cleanup to your plans and found four people with your kind of energy.</p>
            <div className="join-crew">
              <div className="avatar-stack">{people.map((person) => <i key={person.initials} className={person.tone}>{person.initials}</i>)}</div>
              <span><b>Maya, Daniel, Aisha + Jon</b><small>Your small group for Saturday</small></span>
            </div>
            <button className="join-button" onClick={() => { setJoinSheet(false); setTab("plans"); }}>Meet your group <span>→</span></button>
            <button className="text-button" onClick={() => setJoinSheet(false)}>Keep browsing</button>
          </div>
        </div>
      )}
    </main>
  );
}

function ModeToggle({ mode, setMode }: { mode: FeedMode; setMode: (mode: FeedMode) => void }) {
  return <div className="filter" aria-label="Event filter"><button onClick={() => setMode("picks")} className={mode === "picks" ? "filter-active" : ""}>✦ Mango Picks <span>4</span></button><button onClick={() => setMode("all")} className={mode === "all" ? "filter-active" : ""}>All Stamford</button></div>;
}

function PageTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <div className="page-title"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{copy}</p></div>;
}

function CompactEvent({ event }: { event: typeof compactEvents[number] }) {
  return <article className="compact-card"><div className={`compact-art ${event.kind}`}><span>{event.kind === "trivia" ? "?" : event.kind === "yoga" ? "☼" : "Aa"}</span><i>{event.fit}</i></div><div><p>{event.time}</p><h3>{event.title}</h3><span>{event.place}</span><button aria-label={`View ${event.title}`}>›</button></div></article>;
}

function AgendaEvent({ event, compact }: { event: typeof allEvents[number]; compact: boolean }) {
  return <article className={`agenda-card ${compact ? "agenda-compact" : ""}`}><div><p>{event.time}</p><h3>{event.title}</h3><span>{event.place}</span><div className="agenda-meta"><i>{event.tag}</i><i>{event.fit} fit</i><i>{event.people}</i></div></div><button aria-label={`View ${event.title}`}>›</button></article>;
}

function NavButton({ tab, current, setTab, icon, label, badge }: { tab: Tab; current: Tab; setTab: (tab: Tab) => void; icon: string; label: string; badge?: boolean }) {
  return <button className={current === tab ? "nav-active" : ""} onClick={() => { setTab(tab); window.scrollTo({ top: 0, behavior: "smooth" }); }}><span>{icon}{badge && <i />}</span>{label}</button>;
}
