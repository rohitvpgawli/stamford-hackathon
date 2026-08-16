import './globals.css';
export const metadata={title:'Mango — Stamford plans',description:'Your conversation became your profile.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body><header><span className="logo">🥭 Mango</span><nav><a href="/for-you">For You</a><a href="/calendar">Calendar</a><a href="/plans">Plans</a><a href="/explore">Explore</a></nav></header><main>{children}</main><footer>Hackathon demo — sample listings and people · Meet in public and tell a friend.</footer></body></html>}
