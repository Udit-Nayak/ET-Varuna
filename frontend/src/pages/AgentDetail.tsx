import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LiveMapSurface } from "./LiveMap";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

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

type SimulationStatus = "running" | "idle";
type TimelinePoint = { day: string; impact: string; note: string; tone: "risk" | "amber" | "live" };
type Scenario = {
  id: string;
  name: string;
  modelName: string;
  status: SimulationStatus;
  headlineImpact: string;
  description: string;
  lastRun: string;
  timeline: TimelinePoint[];
};
type SimulationLog = { scenario: string; date: string; peakImpact: string; status: "Completed" | "Archived" };

// Mocked simulation data is kept together so an API response can replace it without changing the view structure.
const scenarios: Scenario[] = [
  {
    id: "hormuz", name: "Hormuz Closure", modelName: "Hormuz Closure — 7 Day Model", status: "running", headlineImpact: "-30% flow",
    description: "Models a sustained closure of the Strait of Hormuz and rerouting pressure across Gulf export lanes.", lastRun: "3m ago",
    timeline: [
      { day: "Day 1", impact: "-5% flow", note: "Initial diversions", tone: "amber" },
      { day: "Day 7", impact: "-30% flow", note: "Peak constraint", tone: "risk" },
      { day: "Day 14", impact: "-22% flow", note: "Rerouting absorbs volume", tone: "risk" },
      { day: "Day 30", impact: "-12% flow", note: "Recovering", tone: "live" },
    ],
  },
  {
    id: "suez", name: "Suez Blockage", modelName: "Suez Blockage — 14 Day Model", status: "idle", headlineImpact: "-18% flow",
    description: "Models a canal blockage and the downstream freight, inventory, and Cape rerouting effects.", lastRun: "18m ago",
    timeline: [
      { day: "Day 1", impact: "-3% flow", note: "Queue formation", tone: "amber" },
      { day: "Day 7", impact: "-18% flow", note: "Cape diversions begin", tone: "risk" },
      { day: "Day 14", impact: "-16% flow", note: "Inventory buffers used", tone: "risk" },
      { day: "Day 30", impact: "-7% flow", note: "Recovering", tone: "live" },
    ],
  },
  {
    id: "bab-el-mandeb", name: "Bab-el-Mandeb Disruption", modelName: "Bab-el-Mandeb Disruption — 10 Day Model", status: "running", headlineImpact: "-24% flow",
    description: "Models elevated security disruption in the southern Red Sea and constrained northbound transit.", lastRun: "6m ago",
    timeline: [
      { day: "Day 1", impact: "-6% flow", note: "Security holds", tone: "amber" },
      { day: "Day 7", impact: "-24% flow", note: "Transit avoidance", tone: "risk" },
      { day: "Day 14", impact: "-19% flow", note: "Alternative lanes fill", tone: "risk" },
      { day: "Day 30", impact: "-10% flow", note: "Recovering", tone: "live" },
    ],
  },
  {
    id: "demand", name: "Demand Spike", modelName: "Demand Spike — 30 Day Model", status: "idle", headlineImpact: "+14% demand",
    description: "Models a sudden regional demand increase and the drawdown pressure on available supply.", lastRun: "42m ago",
    timeline: [
      { day: "Day 1", impact: "+4% demand", note: "Demand accelerates", tone: "amber" },
      { day: "Day 7", impact: "+14% demand", note: "Peak drawdown", tone: "risk" },
      { day: "Day 14", impact: "+11% demand", note: "Supply responds", tone: "amber" },
      { day: "Day 30", impact: "+5% demand", note: "Normalising", tone: "live" },
    ],
  },
];

const simulationLog: SimulationLog[] = [
  { scenario: "Hormuz Closure — 7 Day Model", date: "Today, 09:42", peakImpact: "-30%", status: "Completed" },
  { scenario: "Bab-el-Mandeb Disruption — 10 Day Model", date: "Yesterday, 16:18", peakImpact: "-24%", status: "Completed" },
  { scenario: "Suez Blockage — 14 Day Model", date: "Jul 17, 11:06", peakImpact: "-18%", status: "Archived" },
  { scenario: "Demand Spike — 30 Day Model", date: "Jul 14, 08:30", peakImpact: "+14%", status: "Completed" },
  { scenario: "Hormuz Closure — 30 Day Model", date: "Jul 09, 14:52", peakImpact: "-36%", status: "Archived" },
];

const AffiliateIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M12 7v4m-5.2 6.3 4.1-4.1m6.3 4.1-4.1-4.1" />
  </svg>
);

const DsmPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [selectedScenarioId, setSelectedScenarioId] = useState(scenarios[0].id);
  const scenario = scenarios.find(({ id }) => id === selectedScenarioId) ?? scenarios[0];
  const displayName = user?.displayName || user?.email?.split("@")[0] || "Operator";
  const signOut = async () => { await logout(); navigate("/", { replace: true }); };
  const simulationCard = "rounded-[10px] border-[0.5px] border-white/[0.12] bg-[rgba(15,20,28,0.72)] p-6 backdrop-blur-[8px]";

  return <div className="relative min-h-screen overflow-hidden bg-base font-body text-ink">
    <div className="fixed inset-0 z-0 h-screen w-screen"><LiveMapSurface embedded controlsVisible={false} interactive={false} /></div>
    <div className="pointer-events-none fixed inset-0 z-[1] bg-[rgba(11,15,20,0.8)] backdrop-blur-[6px]" />
    <header className="relative z-20 border-b border-white/10 bg-black/35 shadow-[0_12px_42px_rgba(0,0,0,0.24)] backdrop-blur-2xl"><div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5 sm:px-6"><div className="flex items-center gap-3"><span className="h-2 w-2 animate-pulseDot rounded-full bg-amber" /><span className="font-display text-lg font-semibold tracking-tight text-ink">Aegis SCR</span><span className="hidden border-l border-white/10 pl-3 font-mono text-xs text-muted sm:inline">Welcome back, {displayName}</span></div><div className="flex items-center gap-3 sm:gap-4"><span className="hidden font-mono text-xs text-muted md:inline">{user?.email || "manan@gmail.com"}</span><button type="button" onClick={() => navigate("/live-map")} className="rounded-md border border-amber/40 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-amber transition-colors hover:bg-amber/10 sm:px-4 sm:text-xs">Live map</button><button type="button" onClick={() => void signOut()} className="rounded-md border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-ink transition-colors hover:border-risk hover:text-risk sm:px-4 sm:text-xs">Sign out</button></div></div></header>
    <main className="relative z-10 mx-auto max-w-7xl px-5 pb-16 pt-7 sm:px-6 sm:pt-9">
      <a href="/dashboard" className="inline-flex text-xs text-white/50 transition hover:text-white/80">← Back to Dashboard</a>
      <section className="mt-5"><div className="flex flex-wrap items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(93,202,165,0.25)] text-[#5dcaa5]"><AffiliateIcon /></span><div><h1 className="font-display text-[28px] font-bold leading-none text-white">DSM</h1><p className="mt-1 text-[11px] uppercase tracking-[1px] text-white/45">Scenario Modeller</p></div><span className="ml-1 inline-flex items-center gap-2 rounded-full border border-[#97c459]/25 bg-[#97c459]/10 px-2.5 py-1 font-mono text-[10px] text-[#97c459]"><span className="h-1.5 w-1.5 rounded-full bg-[#97c459]" />LIVE</span></div><p className="mt-4 text-[13px] text-white/60">Simulates disruption events and their cascading downstream impact across the supply chain.</p></section>

      <section className={`${simulationCard} mt-9`}><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h2 className="font-display text-2xl font-semibold text-white sm:text-[28px]">{scenario.modelName}</h2><span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${scenario.status === "running" ? "border-[#97c459]/25 bg-[#97c459]/10 text-[#97c459]" : "border-[#ba7517]/30 bg-[#ba7517]/10 text-[#ba7517]"}`}>{scenario.status}</span></div><p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-white/60">{scenario.description}</p><p className="mt-4 font-mono text-[11px] text-white/40">Last run {scenario.lastRun}</p></div><div className="shrink-0 lg:text-right"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">Peak projected impact</p><strong className="mt-2 block font-display text-4xl font-bold leading-none text-[#d85a30] sm:text-5xl">{scenario.headlineImpact}</strong></div></div></section>

      <section className="mt-7"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-white">Scenario Selector</h2><span className="font-mono text-[10px] text-white/40">Select a scenario to model</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{scenarios.map((item) => <button key={item.id} type="button" onClick={() => setSelectedScenarioId(item.id)} className={`rounded-[10px] border-[0.5px] bg-[rgba(15,20,28,0.72)] p-4 text-left backdrop-blur-[8px] transition ${item.id === scenario.id ? "border-[#ef9f27] bg-[rgba(239,159,39,0.10)] shadow-[0_0_0_1px_rgba(239,159,39,0.2)]" : "border-white/[0.12] hover:border-white/30"}`}><span className="block text-sm font-medium text-white">{item.name}</span><span className="mt-2 block font-mono text-[10px] uppercase tracking-wider text-white/45">{item.status === "running" ? "Model running" : "Ready to run"}</span></button>)}</div></section>

      <section className={`${simulationCard} mt-9`}><div><h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-white">Cascading Impact Timeline</h2><p className="mt-1 text-xs text-white/55">Projected downstream flow impact from the selected disruption scenario</p></div><div className="mt-8 overflow-x-auto pb-1"><div className="relative flex min-w-[680px] justify-between before:absolute before:left-[8%] before:right-[8%] before:top-2 before:h-px before:bg-[#ef9f27]/45">{scenario.timeline.map((point) => <article key={point.day} className="relative z-10 w-[22%] first:text-left last:text-right"><span className="mx-auto block h-4 w-4 rounded-full border-[3px] border-[#111821] bg-[#ef9f27] first:ml-0 last:mr-0" /><p className="mt-4 font-mono text-[10px] uppercase tracking-[0.1em] text-white/45">{point.day}</p><strong className={`mt-2 block font-display text-xl font-semibold ${point.tone === "risk" ? "text-[#d85a30]" : point.tone === "live" ? "text-[#97c459]" : "text-[#ef9f27]"}`}>{point.impact}</strong><p className="mt-1 text-[11px] text-white/55">{point.note}</p></article>)}</div></div></section>

      <section className={`${simulationCard} mt-9`}><div><h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-white">Historical Simulations Log</h2><p className="mt-1 text-xs text-white/55">Recent model runs and archived scenario outcomes</p></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead className="border-b border-white/10 font-mono text-[10px] uppercase tracking-[0.1em] text-white/40"><tr><th className="pb-3 font-normal">Scenario</th><th className="pb-3 font-normal">Date run</th><th className="pb-3 font-normal">Peak impact</th><th className="pb-3 text-right font-normal">Status</th></tr></thead><tbody className="divide-y divide-white/10">{simulationLog.map((entry) => <tr key={`${entry.scenario}-${entry.date}`} className="text-[13px]"><td className="py-4 font-medium text-white">{entry.scenario}</td><td className="py-4 font-mono text-[11px] text-white/50">{entry.date}</td><td className="py-4 font-mono text-[12px] text-[#d85a30]">{entry.peakImpact}</td><td className="py-4 text-right"><span className={`inline-flex rounded-full border px-2 py-1 font-mono text-[10px] ${entry.status === "Completed" ? "border-[#97c459]/25 bg-[#97c459]/10 text-[#97c459]" : "border-[#ba7517]/30 bg-[#ba7517]/10 text-[#ba7517]"}`}>{entry.status}</span></td></tr>)}</tbody></table></div></section>
    </main>
  </div>;
};

type TfmState = {
  _id?: string;
  month: string;
  total_consumption_bpd: number;
  domestic_production_bpd: number;
  total_import_volume_bpd: number;
  import_dependency_pct: number;
  top_suppliers_pct?: Record<string, number | null>;
  note?: string;
};

const formatVolume = (value: number) => `${(value / 1_000_000).toFixed(2)}m bpd`;
const formatBpd = (value: number) => `${new Intl.NumberFormat("en-IN").format(Math.round(value))} bpd`;
const asNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const latestCompleteSentence = (note: string, limit = 180) => {
  if (note.length <= limit) return note;
  const sentences = note.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [note];
  let result = "";
  for (const sentence of sentences) {
    if (result && result.length + sentence.length > limit) break;
    result += sentence;
  }
  return result.trim() || sentences[0].trim();
};

const TfmPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [latest, setLatest] = useState<TfmState | null>(null);
  const [history, setHistory] = useState<TfmState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);
  const displayName = user?.displayName || user?.email?.split("@")[0] || "Operator";
  const signOut = async () => { await logout(); navigate("/", { replace: true }); };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [latestResponse, historyResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/tfm/latest`),
          fetch(`${API_BASE_URL}/api/tfm/history?limit=12`),
        ]);
        if (!latestResponse.ok || !historyResponse.ok) throw new Error("TFM data is currently unavailable.");
        const [latestPayload, historyPayload] = await Promise.all([latestResponse.json(), historyResponse.json()]);
        if (active) {
          setLatest(latestPayload as TfmState | null);
          setHistory(Array.isArray(historyPayload) ? historyPayload as TfmState[] : []);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "TFM data is currently unavailable.");
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const card = "rounded-[10px] border-[0.5px] border-white/[0.12] bg-[rgba(15,20,28,0.72)] p-6 backdrop-blur-[8px]";
  const supplyMix = Object.entries(latest?.top_suppliers_pct ?? {}).filter(([, value]) => value !== null).map(([name, value]) => [name, asNumber(value)] as const);
  const maxFlow = Math.max(...history.flatMap((item) => [asNumber(item.total_consumption_bpd), asNumber(item.total_import_volume_bpd)]), 1);
  const hoveredItem = history.find((item) => item.month === hoveredMonth);

  return <div className="min-h-screen bg-base font-body text-ink">
    <header className="relative z-20 border-b border-white/10 bg-black/35 shadow-[0_12px_42px_rgba(0,0,0,0.24)] backdrop-blur-2xl"><div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5 sm:px-6"><div className="flex items-center gap-3"><span className="h-2 w-2 animate-pulseDot rounded-full bg-amber" /><span className="font-display text-lg font-semibold tracking-tight text-ink">Aegis SCR</span><span className="hidden border-l border-white/10 pl-3 font-mono text-xs text-muted sm:inline">Welcome back, {displayName}</span></div><div className="flex items-center gap-3 sm:gap-4"><span className="hidden font-mono text-xs text-muted md:inline">{user?.email || "manan@gmail.com"}</span><button type="button" onClick={() => navigate("/live-map")} className="rounded-md border border-amber/40 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-amber transition-colors hover:bg-amber/10 sm:px-4 sm:text-xs">Live map</button><button type="button" onClick={() => void signOut()} className="rounded-md border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-ink transition-colors hover:border-risk hover:text-risk sm:px-4 sm:text-xs">Sign out</button></div></div></header>
    <main className="mx-auto max-w-7xl px-5 pb-16 pt-7 sm:px-6 sm:pt-9">
      <a href="/dashboard" className="inline-flex text-xs text-white/50 transition hover:text-white/80">← Back to Dashboard</a>
      <section className="mt-5"><h1 className="font-display text-[28px] font-bold leading-none text-white">TFM</h1><p className="mt-1 text-[11px] uppercase tracking-[1px] text-white/45">Transaction Flow Monitor</p><p className="mt-4 text-[13px] text-white/60">Tracks India&apos;s monthly petroleum supply, demand, and import source composition.</p></section>
      {error && <p className="mt-8 rounded-[10px] border border-[#d85a30]/30 bg-[#d85a30]/10 px-4 py-3 text-sm text-[#f2a384]">{error}</p>}
      <section className="mt-9 grid gap-4 sm:grid-cols-3">{[
        ["Total imports", latest ? formatVolume(asNumber(latest.total_import_volume_bpd)) : "—"],
        ["Import dependency", latest ? `${asNumber(latest.import_dependency_pct).toFixed(1)}%` : "—"],
        ["Domestic production", latest ? formatVolume(asNumber(latest.domestic_production_bpd)) : "—"],
      ].map(([label, value]) => <article key={label} className={card}><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">{label}</p><strong className="mt-4 block font-display text-3xl font-semibold text-white">{value}</strong><p className="mt-2 text-[11px] text-white/45">{latest?.month || "Loading latest month"}</p></article>)}</section>
      <section className={`${card} mt-9`}><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-white">Supply vs Demand</h2><p className="mt-1 text-xs text-white/55">Monthly consumption and import volumes · values in barrels per day</p></div><div className="flex gap-4 font-mono text-[10px] text-white/45"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#ef9f27]" />Consumption</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#5dcaa5]" />Imports</span></div></div>{hoveredItem ? <div className="mt-5 inline-flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-white/10 bg-black/20 px-3 py-2 font-mono text-[11px]"><span className="text-white/45">{hoveredItem.month}</span><span className="text-[#ef9f27]">Consumption {formatBpd(asNumber(hoveredItem.total_consumption_bpd))}</span><span className="text-[#5dcaa5]">Imports {formatBpd(asNumber(hoveredItem.total_import_volume_bpd))}</span></div> : <p className="mt-5 font-mono text-[10px] text-white/40">Hover or focus a month to inspect exact bpd values.</p>}<div className="mt-5 overflow-x-auto"><div className="flex h-44 min-w-[540px] items-end gap-2 pb-2">{history.map((item) => <button key={item._id || item.month} type="button" onMouseEnter={() => setHoveredMonth(item.month)} onFocus={() => setHoveredMonth(item.month)} className="group flex h-full min-w-[42px] flex-1 items-end justify-center gap-1 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-[#ef9f27]" aria-label={`${item.month}: consumption ${formatBpd(asNumber(item.total_consumption_bpd))}, imports ${formatBpd(asNumber(item.total_import_volume_bpd))}`}><span className="w-3 rounded-t bg-[#ef9f27] transition-opacity group-hover:opacity-80" style={{ height: `${Math.max((asNumber(item.total_consumption_bpd) / maxFlow) * 100, 3)}%` }} /><span className="w-3 rounded-t bg-[#5dcaa5] transition-opacity group-hover:opacity-80" style={{ height: `${Math.max((asNumber(item.total_import_volume_bpd) / maxFlow) * 100, 3)}%` }} /></button>)}</div><div className="flex min-w-[540px] justify-between font-mono text-[10px] text-white/40">{history.map((item) => <span key={`label-${item._id || item.month}`}>{item.month}</span>)}</div></div></section>
      <section className={`${card} mt-9`}><div><h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-white">Import Source Breakdown</h2><p className="mt-1 text-xs text-white/55">Supplier share of imports for {latest?.month || "the latest month"}</p></div><div className="mt-6 grid gap-4 sm:grid-cols-2">{supplyMix.map(([supplier, share]) => <div key={supplier}><div className="flex justify-between gap-3 text-[13px]"><span className="text-white">{supplier}</span><span className="font-mono text-white/60">{share.toFixed(1)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#ef9f27]" style={{ width: `${Math.min(share, 100)}%` }} /></div></div>)}</div>{latest?.note && <p className="mt-6 border-l-2 border-[#ef9f27]/60 pl-3 text-[12px] italic leading-relaxed text-white/50" title={latest.note}>Analyst note: {latestCompleteSentence(latest.note)}</p>}</section>
    </main>
  </div>;
};

const AgentDetail = () => {
  const { agentId = "" } = useParams();
  const navigate = useNavigate();
  const name = agentNames[agentId.toLowerCase()] ?? "AI Agent";

  if (agentId.toLowerCase() === "gria") return <GriaPage />;
  if (agentId.toLowerCase() === "dsm") return <DsmPage />;
  if (agentId.toLowerCase() === "tfm") return <TfmPage />;

  return <main className="min-h-screen bg-base px-6 py-20 text-ink"><div className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface/70 p-8 backdrop-blur-xl"><span className="font-mono text-[11px] uppercase tracking-[0.24em] text-amber">Agent detail</span><h1 className="mt-3 font-display text-3xl font-semibold">{name}</h1><p className="mt-4 text-sm text-muted">This agentâ€™s detailed operational workspace is ready for its live module interface.</p><button type="button" onClick={() => navigate("/dashboard")} className="mt-8 rounded border border-border px-4 py-2 font-mono text-xs uppercase tracking-wider transition hover:border-amber hover:text-amber">Back to dashboard</button></div></main>;
};

export default AgentDetail;
