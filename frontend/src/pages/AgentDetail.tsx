import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LiveMapSurface } from "./LiveMap";

const agentNames: Record<string, string> = {
  gria: "Geopolitical Risk Intelligence Agent",
  dsm: "Disruption Scenario Modeller",
  apo: "Adaptive Procurement Orchestrator",
  sroa: "Strategic Reserve Optimisation Agent",
  tfm: "Transaction Flow Monitor",
  scdt: "Supply Chain Digital Twin",
};

type Corridor = { name: string; score: number; delta: number; updated: string; trend: "up" | "down" };
type FeedItem = { severity: "high" | "medium" | "low"; headline: string; source: string; time: string };

// Placeholder data is intentionally grouped here so it can be replaced by GRIA API data later.
const corridors: Corridor[] = [
  { name: "Strait of Hormuz", score: 78, delta: 6, updated: "2m ago", trend: "up" },
  { name: "Bab-el-Mandeb", score: 64, delta: 4, updated: "5m ago", trend: "up" },
  { name: "Suez Canal", score: 41, delta: 3, updated: "7m ago", trend: "down" },
];

const trendData: Record<string, number[]> = {
  "Strait of Hormuz": [48, 50, 52, 51, 54, 56, 55, 57, 60, 59, 61, 63, 62, 65, 67, 66, 68, 69, 71, 70, 72, 73, 72, 75, 74, 76, 77, 76, 78, 78],
  "Bab-el-Mandeb": [58, 57, 55, 56, 54, 53, 55, 57, 56, 59, 58, 60, 61, 59, 60, 61, 63, 62, 64, 63, 62, 65, 64, 63, 65, 66, 64, 65, 64, 64],
  "Suez Canal": [52, 51, 53, 50, 49, 48, 47, 48, 49, 47, 46, 45, 46, 44, 45, 43, 44, 43, 42, 44, 43, 42, 41, 42, 40, 41, 42, 41, 42, 41],
};

const intelFeed: FeedItem[] = [
  { severity: "high", headline: "Increased naval activity detected near Hormuz — GRIA score elevated to 78.", source: "AIS + regional news", time: "2m ago" },
  { severity: "medium", headline: "Two tanker transits altered course south of Bab-el-Mandeb amid elevated security notices.", source: "AIS monitor", time: "11m ago" },
  { severity: "high", headline: "Freight-risk premium widens on Gulf loadings as insurers revise short-term guidance.", source: "Market signals", time: "18m ago" },
  { severity: "low", headline: "Suez Canal northbound queue remains within its seven-day operating range.", source: "Port authority", time: "26m ago" },
  { severity: "medium", headline: "Regional reporting indicates heightened patrol patterns around the Strait of Hormuz.", source: "News sentiment", time: "34m ago" },
  { severity: "low", headline: "Brent prompt spread stable; no material price anomaly assigned to the Red Sea corridor.", source: "Price signals", time: "42m ago" },
  { severity: "medium", headline: "AIS transmission gaps increased around the southern Red Sea monitoring zone.", source: "AIS monitor", time: "51m ago" },
];

const cardClass = "rounded-[10px] border border-white/[0.12] bg-[rgba(15,20,28,0.72)] p-6 backdrop-blur-[8px]";

const RadarIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 6a6 6 0 1 0 6 6" /><path d="M12 12l6.5 -6.5" />
  </svg>
);

const RiskChart = ({ values }: { values: number[] }) => {
  const { points, gridLines } = useMemo(() => {
    const width = 900;
    const height = 260;
    const padding = { left: 42, right: 12, top: 12, bottom: 32 };
    const point = (value: number, index: number) => {
      const x = padding.left + (index / (values.length - 1)) * (width - padding.left - padding.right);
      const y = padding.top + ((100 - value) / 100) * (height - padding.top - padding.bottom);
      return `${x},${y}`;
    };
    return { points: values.map(point).join(" "), gridLines: [0, 25, 50, 75, 100].map((value) => ({ value, y: padding.top + ((100 - value) / 100) * (height - padding.top - padding.bottom) })) };
  }, [values]);

  return <div className="mt-5 overflow-x-auto"><svg viewBox="0 0 900 260" className="h-[260px] min-w-[620px] w-full" role="img" aria-label="Risk score over the last 30 days">
    {gridLines.map(({ value, y }) => <g key={value}><line x1="42" x2="888" y1={y} y2={y} stroke="rgba(255,255,255,0.08)" /><text x="0" y={y + 4} fill="rgba(255,255,255,0.42)" fontSize="10">{value}</text></g>)}
    <polyline points={points} fill="none" stroke="#ef9f27" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    {[0, 7, 14, 21, 29].map((index) => <text key={index} x={42 + (index / 29) * 846} y="252" textAnchor={index === 0 ? "start" : index === 29 ? "end" : "middle"} fill="rgba(255,255,255,0.42)" fontSize="10">{index === 29 ? "Today" : `${30 - index}d`}</text>)}
  </svg></div>;
};

const GriaPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [selectedCorridor, setSelectedCorridor] = useState(corridors[0].name);
  const displayName = user?.displayName || user?.email?.split("@")[0] || "Operator";
  const signOut = async () => { await logout(); navigate("/", { replace: true }); };

  return <div className="relative min-h-screen overflow-hidden bg-base font-body text-ink">
    <div className="fixed inset-0 z-0 h-screen w-screen"><LiveMapSurface embedded controlsVisible={false} interactive={false} /></div>
    <div className="pointer-events-none fixed inset-0 z-[1] bg-[rgba(11,15,20,0.8)] backdrop-blur-[6px]" />
    <header className="relative z-20 border-b border-white/10 bg-black/35 shadow-[0_12px_42px_rgba(0,0,0,0.24)] backdrop-blur-2xl"><div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5 sm:px-6"><div className="flex items-center gap-3"><span className="h-2 w-2 animate-pulseDot rounded-full bg-amber"/><span className="font-display text-lg font-semibold tracking-tight text-ink">Aegis SCR</span><span className="hidden border-l border-white/10 pl-3 font-mono text-xs text-muted sm:inline">Welcome back, {displayName}</span></div><div className="flex items-center gap-3 sm:gap-4"><span className="hidden font-mono text-xs text-muted md:inline">{user?.email || "manan@gmail.com"}</span><button type="button" onClick={() => navigate("/live-map")} className="rounded-md border border-amber/40 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-amber transition-colors hover:bg-amber/10 sm:px-4 sm:text-xs">Live map</button><button type="button" onClick={() => void signOut()} className="rounded-md border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-ink transition-colors hover:border-risk hover:text-risk sm:px-4 sm:text-xs">Sign out</button></div></div></header>
    <main className="relative z-10 mx-auto max-w-7xl px-5 pb-16 pt-7 sm:px-6 sm:pt-9">
      <a href="/dashboard" className="inline-flex text-xs text-white/50 transition hover:text-white/80">← Back to Dashboard</a>
      <section className="mt-5"><div className="flex flex-wrap items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(126,119,221,0.25)] text-[#afa9ec]"><RadarIcon /></span><div><h1 className="font-display text-[28px] font-bold leading-none text-white">GRIA</h1><p className="mt-1 text-[11px] uppercase tracking-[1px] text-white/45">Geopolitical Risk Intelligence</p></div><span className="ml-1 inline-flex items-center gap-2 rounded-full border border-[#97c459]/25 bg-[#97c459]/10 px-2.5 py-1 font-mono text-[10px] text-[#97c459]"><span className="h-1.5 w-1.5 rounded-full bg-[#97c459]" />LIVE</span></div><p className="mt-4 text-[13px] text-white/60">Multi-source risk scoring per corridor from news, AIS, and price signals.</p></section>
      <section className="mt-9"><h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-white">Live Corridor Overview</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{corridors.map((corridor) => <article key={corridor.name} className={cardClass}><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-medium text-white">{corridor.name}</h3><span className={corridor.trend === "up" ? "text-[#d85a30]" : "text-[#97c459]"}>{corridor.trend === "up" ? "▲" : "▼"} {corridor.delta}</span></div><div className="mt-6 flex items-end gap-1"><strong className="font-display text-4xl font-semibold leading-none text-[#ef9f27]">{corridor.score}</strong><span className="mb-0.5 text-xs text-white/50">/100</span></div><p className="mt-5 text-[10px] text-white/40">Last updated {corridor.updated}</p></article>)}</div></section>
      <section className={`${cardClass} mt-9`}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-white">Risk Trend</h2><p className="mt-1 text-xs text-white/55">Corridor risk score over the last 30 days</p></div><label className="sr-only" htmlFor="corridor-select">Select corridor</label><select id="corridor-select" value={selectedCorridor} onChange={(event) => setSelectedCorridor(event.target.value)} className="rounded-md border border-white/15 bg-[#111821]/90 px-3 py-2 text-xs text-white outline-none transition focus:border-[#ef9f27]"><option>Strait of Hormuz</option><option>Bab-el-Mandeb</option><option>Suez Canal</option></select></div><RiskChart values={trendData[selectedCorridor]} /></section>
      <section className={`${cardClass} mt-9`}><div><h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-white">Live Intel Feed</h2><p className="mt-1 text-xs text-white/55">Latest signals contributing to corridor assessments</p></div><div className="mt-5 max-h-[400px] divide-y divide-white/10 overflow-y-auto pr-1">{intelFeed.map((item, index) => <article key={`${item.time}-${index}`} className="flex gap-3 py-4 first:pt-0"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.severity === "high" ? "bg-[#d85a30]" : item.severity === "medium" ? "bg-[#ba7517]" : "bg-[#97c459]"}`} /><div className="min-w-0"><p className="text-[13px] leading-relaxed text-white">{item.headline}</p><p className="mt-1.5 font-mono text-[11px] text-white/45">{item.source}<span className="mx-2 text-white/20">•</span>{item.time}</p></div></article>)}</div></section>
      <section className={`${cardClass} mt-9`}><h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-white">Methodology</h2><div className="mt-4 max-w-4xl space-y-3 text-[13px] leading-relaxed text-white/60"><p>GRIA combines signals from trusted news sources, vessel movements, and energy market prices to assess the operating risk around key maritime corridors.</p><p>Each signal is weighted by its relevance, recency, and agreement with other sources. This helps distinguish a one-off report from a change that is visible across the wider operating picture.</p><p>Scores update as new information arrives. They are designed to give teams a clear, comparable indication of where attention may be needed, not a prediction of a single outcome.</p></div></section>
    </main>
  </div>;
};

const AgentDetail = () => {
  const { agentId = "" } = useParams();
  const navigate = useNavigate();
  const name = agentNames[agentId.toLowerCase()] ?? "AI Agent";

  if (agentId.toLowerCase() === "gria") return <GriaPage />;

  return <main className="min-h-screen bg-base px-6 py-20 text-ink"><div className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface/70 p-8 backdrop-blur-xl"><span className="font-mono text-[11px] uppercase tracking-[0.24em] text-amber">Agent detail</span><h1 className="mt-3 font-display text-3xl font-semibold">{name}</h1><p className="mt-4 text-sm text-muted">This agentâ€™s detailed operational workspace is ready for its live module interface.</p><button type="button" onClick={() => navigate("/dashboard")} className="mt-8 rounded border border-border px-4 py-2 font-mono text-xs uppercase tracking-wider transition hover:border-amber hover:text-amber">Back to dashboard</button></div></main>;
};

export default AgentDetail;
