import Link from 'next/link';
export default function Plans(){return <><div className="eyebrow">Plans</div><h1>Your joined plans</h1><Link href="/plans/opp-cleanup" className="card" style={{display:'block',color:'inherit',textDecoration:'none'}}><h2>Mill River Community Cleanup</h2><p className="meta">Saturday · 1:00 PM · Mill River Park</p><span className="chip">Joined</span></Link></>}
