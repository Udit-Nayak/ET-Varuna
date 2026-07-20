import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LiveMapSurface } from "./LiveMap";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const REFRESH_INTERVAL_MS = 60_000;

type Direction = "up" | "down" | null;
type TickerMetric = { key: string; eyebrow: string; value: number; unit: string; detail: string; accent: string; precision?: number };
type CorridorRisk = { name: string; score: number };
type DashboardData = { price: number | null; priceAverage: number | null; reserveDays: number | null; reserveFill: number | null; importDependency: number | null; corridorRisks: CorridorRisk[] };

const agents = [
  { code: "GRIA", title: "Geopolitical Risk Intelligence", description: "Multi-source risk scoring per corridor from news, AIS, sanctions, and price signals." },
  { code: "DSM", title: "Disruption Scenario Modeller", description: "Simulates disruption events and their cascading impact across energy supply." },
  { code: "APO", title: "Adaptive Procurement Orchestrator", description: "Ranks alternative suppliers and logistics routes when a corridor is disrupted." },
  { code: "SROA", title: "Strategic Reserve Optimisation", description: "Models reserve drawdown schedules against supply-gap forecasts." },
  { code: "TFM", title: "Transaction Flow Monitor", description: "Tracks fuel transactions to verify how disruptions are being covered." },
  { code: "SCDT", title: "Supply Chain Digital Twin", description: "Geospatial simulation of the energy network for live what-if analysis." },
] as const;

const asNumber = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const fetchJson = async (path: string): Promise<Record<string, unknown> | null> => {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  return response.json() as Promise<Record<string, unknown> | null>;
};

const AgentNetworkRow = ({ agent, index, stat, onOpen }: { agent: (typeof agents)[number]; index: number; stat: string; onOpen: () => void }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const isCentered = agent.code === "SCDT";
  const cardFirst = index % 2 === 0;

  useEffect(() => {
    const element = rowRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        element.classList.add("agent-reveal--visible");
        observer.unobserve(element);
      }
    }, { threshold: 0.16 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const card = <button type="button" onClick={onOpen} className="group rounded-xl border border-border/80 bg-[#0a101a]/65 px-5 py-4 text-left shadow-2xl backdrop-blur-xl transition hover:-translate-y-1 hover:border-amber/70"><span className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber">{agent.code}</span><h3 className="mt-2 font-display text-base font-semibold text-ink group-hover:text-amber">{agent.title}</h3></button>;
  const detail = <button type="button" onClick={onOpen} className="rounded-xl border border-border/70 bg-[#0a101a]/45 p-5 text-left backdrop-blur-xl transition hover:border-surface-3"><p className="text-sm leading-relaxed text-muted">{agent.description}</p><p className="mt-4 font-mono text-[11px] uppercase tracking-wider text-ink"><span className="mr-2 text-amber">Live</span>{stat}</p></button>;

  if (isCentered) return <div ref={rowRef} className="agent-reveal mx-auto mt-20 max-w-xl text-center"><div className="rounded-2xl border border-amber/30 bg-[#0a101a]/70 p-7 shadow-2xl backdrop-blur-xl"><span className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber">{agent.code}</span><h3 className="mt-2 font-display text-xl font-semibold">{agent.title}</h3><p className="mt-3 text-sm leading-relaxed text-muted">{agent.description}</p><button type="button" onClick={onOpen} className="mt-5 rounded border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-wider transition hover:border-amber hover:text-amber">Open digital twin · {stat}</button></div></div>;

  return <div ref={rowRef} className={`agent-reveal grid items-center gap-4 md:grid-cols-[minmax(0,0.85fr)_minmax(80px,0.3fr)_minmax(0,1.2fr)] ${index === 1 ? "mt-16" : index === 2 ? "mt-24" : index === 3 ? "mt-14" : index === 4 ? "mt-20" : "mt-10"}`}>{cardFirst ? <>{card}<div className="hidden h-px bg-gradient-to-r from-border to-amber/60 md:block" />{detail}</> : <>{detail}<div className="hidden h-px bg-gradient-to-r from-amber/60 to-border md:block" />{card}</>}</div>;
};

const AgentStorySection = ({ stats, onOpen }: { stats: Record<string, string>; onOpen: (code: string) => void }) => {
  const details: Record<string, { role: string; color: string; footer: string }> = {
    GRIA: { role: "Risk intelligence", color: "#4f7cff", footer: "Top risk corridor" }, DSM: { role: "Disruption simulation", color: "#32b88a", footer: "Scenario coverage" }, APO: { role: "Sourcing response", color: "#d87861", footer: "Procurement signal" }, SROA: { role: "Reserve operations", color: "#3fa796", footer: "Reserve position" }, TFM: { role: "Flow verification", color: "#d19b3d", footer: "Transaction monitoring" }, SCDT: { role: "Network simulation", color: "#9d75ff", footer: "Digital-twin coverage" },
  };
  return <section className="relative mx-auto max-w-6xl px-6 pb-28 pt-24"><div className="max-w-xl"><span className="font-mono text-[11px] uppercase tracking-[0.24em] text-amber">Distributed intelligence</span><h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">AI Agent Network</h2><p className="mt-3 text-sm text-muted">A connected story of detection, simulation, response, and reserve continuity.</p></div><div className="relative mt-16 space-y-16 before:absolute before:bottom-8 before:left-1/2 before:top-8 before:border-l before:border-dashed before:border-amber/45">{agents.map((agent, index) => { const info = details[agent.code]; const live = stats[agent.code] !== "Not yet connected"; const alignRight = index % 2 === 1; return <div key={agent.code} className={`relative grid items-center md:grid-cols-2 ${alignRight ? "md:[&>button]:col-start-2" : ""}`}><span className="absolute left-1/2 top-10 z-10 h-4 w-4 -translate-x-1/2 rounded-full border-4 border-base bg-amber"/><button type="button" onClick={() => onOpen(agent.code)} className="group mx-auto w-full max-w-xl rounded-2xl border border-white/15 bg-[rgba(15,20,28,0.7)] p-6 text-left shadow-2xl backdrop-blur-xl transition hover:-translate-y-1 hover:border-white/30 sm:p-8"><div className="flex items-start gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: info.color }}>{agent.code.slice(0, 1)}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><h3 className="font-display text-lg font-semibold text-ink">{agent.code} · {agent.title}</h3><span className={`shrink-0 font-mono text-[10px] ${live ? "text-safe" : "text-amber"}`}>● {live ? "LIVE" : "STANDBY"}</span></div><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{info.role}</p></div></div><p className="mt-5 text-sm leading-relaxed text-ink/85">{agent.description}</p><div className="mt-5 flex items-center justify-between gap-4 border-t border-white/10 pt-4"><span className="font-mono text-[10px] uppercase tracking-wider text-muted">{info.footer}</span><span className="font-mono text-xs text-amber">{stats[agent.code]}</span></div></button></div>; })}</div></section>;
};

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mapExpanded, setMapExpanded] = useState(false);
  const [tickerVisible, setTickerVisible] = useState(true);
  const [data, setData] = useState<DashboardData>({ price: null, priceAverage: null, reserveDays: null, reserveFill: null, importDependency: null, corridorRisks: [] });
  const previousMetrics = useRef<Record<string, number>>({});
  const [directions, setDirections] = useState<Record<string, Direction>>({});
  const [deltas, setDeltas] = useState<Record<string, number | null>>({});

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      const [priceResult, nationalResult, riskResult, sroaResult] = await Promise.allSettled([fetchJson("/api/live-price"), fetchJson("/api/national-state"), fetchJson("/api/gria/risk"), fetchJson("/api/sroa/status")]);
      if (!active) return;
      const pricePayload = priceResult.status === "fulfilled" ? priceResult.value : null;
      const nationalPayload = nationalResult.status === "fulfilled" ? nationalResult.value : null;
      const riskPayload = riskResult.status === "fulfilled" ? riskResult.value : null;
      const sroaPayload = sroaResult.status === "fulfilled" ? sroaResult.value : null;
      const price = asNumber(pricePayload?.current_price_usd_per_barrel) ?? asNumber(nationalPayload?.current_price_usd_per_barrel);
      const reserveDays = asNumber((sroaPayload?.operational_data as Record<string, unknown> | undefined)?.current_reserve_days);
      const reserveFill = asNumber(nationalPayload?.reserve_fill_percentage);
      const importDependency = asNumber(nationalPayload?.import_dependency_pct);
      const corridorRisks = Array.isArray(riskPayload?.corridors) ? riskPayload.corridors.flatMap((item) => { const record = item && typeof item === "object" ? item as Record<string, unknown> : null; const score = asNumber(record?.score); return record && typeof record.name === "string" && score !== null ? [{ name: record.name, score }] : []; }) : [];
      const metrics = [{ key: "crude", value: price }, { key: "reserves", value: reserveDays }, { key: "reserve-fill", value: reserveFill }, { key: "import-dependency", value: importDependency }].filter((metric): metric is { key: string; value: number } => metric.value !== null);
      setDirections(Object.fromEntries(metrics.map((metric) => { const previous = previousMetrics.current[metric.key]; return [metric.key, previous === undefined || previous === metric.value ? null : metric.value > previous ? "up" : "down"]; })) as Record<string, Direction>);
      setDeltas(Object.fromEntries(metrics.map((metric) => { const previous = previousMetrics.current[metric.key]; return [metric.key, previous === undefined ? null : metric.value - previous]; })) as Record<string, number | null>);
      previousMetrics.current = Object.fromEntries(metrics.map((metric) => [metric.key, metric.value]));
      setData({ price, priceAverage: asNumber(pricePayload?.month_to_date_avg_usd), reserveDays, reserveFill, importDependency, corridorRisks });
    };
    void loadData();
    const interval = window.setInterval(() => void loadData(), REFRESH_INTERVAL_MS);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  const tickerMetrics: TickerMetric[] = [
    { key: "reserves", eyebrow: "Strategic reserves", value: data.reserveDays ?? 0, unit: "days", detail: data.reserveDays === null ? "Awaiting SROA data" : "SROA operational state", accent: "#a78bfa", precision: 1 },
    { key: "crude", eyebrow: "Indian crude basket", value: data.price ?? 0, unit: "USD/bbl", detail: data.price === null ? "Awaiting PPAC snapshot" : data.priceAverage === null ? "PPAC live snapshot" : `MTD avg $${data.priceAverage.toFixed(2)}`, accent: "#60a5fa", precision: 2 },
    { key: "reserve-fill", eyebrow: "Reserve fill", value: data.reserveFill ?? 0, unit: "%", detail: data.reserveFill === null ? "Awaiting national state" : "National petroleum state", accent: "#a78bfa", precision: 1 },
    { key: "import-dependency", eyebrow: "Import dependency", value: data.importDependency ?? 0, unit: "%", detail: data.importDependency === null ? "Awaiting national state" : "National petroleum state", accent: "#fbbf24", precision: 1 },
  ];
  const highestRisk = [...data.corridorRisks].sort((a, b) => b.score - a.score)[0];
  const stats: Record<string, string> = { GRIA: highestRisk ? `${highestRisk.name} ${highestRisk.score}` : "Not yet connected", DSM: "Not yet connected", APO: "Not yet connected", SROA: data.reserveDays === null ? "Not yet connected" : `${data.reserveDays.toFixed(0)} reserve days`, TFM: "Not yet connected", SCDT: "Not yet connected" };
  const dismissTicker = () => setTickerVisible(false);
  const openAgent = (code: string) => { dismissTicker(); navigate(`/agents/${code.toLowerCase()}`); };
  const openLiveMap = () => { dismissTicker(); navigate("/live-map"); };
  const expandMap = () => { dismissTicker(); setMapExpanded(true); };
  const handleLogout = async () => { dismissTicker(); await logout(); navigate("/", { replace: true }); };
  const displayName = user?.displayName || user?.email?.split("@")[0] || "Operator";

  return <div className="relative min-h-screen text-ink">
    <div className="fixed inset-0 z-0 h-screen w-screen"><LiveMapSurface embedded controlsVisible={mapExpanded} controlsDelayMs={mapExpanded ? 850 : 0} interactive={mapExpanded} /></div>
    <div className={`fixed inset-0 z-[1] bg-[linear-gradient(180deg,rgba(6,14,25,0.9)_0%,rgba(8,17,29,0.8)_34%,rgba(10,20,32,0.64)_66%,rgba(10,20,32,0.82)_100%)] transition-opacity ${mapExpanded ? "pointer-events-none opacity-0 delay-[250ms] duration-[1200ms]" : "opacity-100 delay-0 duration-500"}`} />
    {tickerVisible && <header className="fixed top-0 z-30 w-full overflow-hidden border-b border-white/10 bg-black/35 shadow-[0_12px_42px_rgba(0,0,0,0.24)] backdrop-blur-2xl"><div className="pointer-events-auto mx-auto flex h-14 max-w-7xl items-center justify-between px-5 sm:px-6"><div className="flex items-center gap-3"><span className="h-2 w-2 animate-pulseDot rounded-full bg-amber"/><span className="font-display text-lg font-semibold tracking-tight">Aegis SCR</span><span className="hidden border-l border-white/10 pl-3 font-mono text-xs text-muted sm:inline">Welcome back, {displayName}</span></div><div className="flex items-center gap-3 sm:gap-4"><span className="hidden font-mono text-xs text-muted md:inline">{user?.email}</span><button onClick={openLiveMap} className="rounded-md border border-amber/40 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-amber transition-colors hover:bg-amber/10 sm:px-4 sm:text-xs">Live map</button><button onClick={handleLogout} className="rounded-md border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-ink transition-colors hover:border-risk hover:text-risk sm:px-4 sm:text-xs">Sign out</button></div></div><div className="pointer-events-none relative h-32 overflow-hidden border-t border-white/10 bg-black/15">{tickerMetrics.length ? <div className="ticker-track animate-priceTicker">{[0, 1].map((cycle) => <div key={cycle} className="ticker-cycle">{tickerMetrics.map((metric) => { const direction = directions[metric.key] ?? null; const delta = deltas[metric.key]; const deltaClass = direction === "up" ? "text-safe" : "text-risk"; return <article key={`${cycle}-${metric.key}`} className="flex h-[104px] w-[205px] shrink-0 flex-col rounded-2xl border border-white/10 bg-[rgba(15,20,28,0.68)] p-4 shadow-xl backdrop-blur-xl" style={{ borderBottomWidth: 3, borderBottomColor: metric.accent }}><span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">{metric.eyebrow}</span><div className="mt-2 flex items-baseline gap-1"><strong className="font-display text-3xl font-semibold leading-none text-ink">{metric.value.toFixed(metric.precision ?? 0)}</strong><span className="font-mono text-[10px] text-muted">{metric.unit}</span></div><div className="mt-auto flex items-center gap-2 font-mono text-[10px]">{direction && delta !== null ? <span className={deltaClass}>{direction === "up" ? "▲" : "▼"} {Math.abs(delta).toFixed(metric.precision ?? 1)}</span> : <span className="text-muted">—</span>}<span className="text-muted">vs last refresh</span></div></article>; })}</div>)}</div> : <div className="flex h-32 items-center px-6 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Live market telemetry connecting…</div>}<div className="pointer-events-none absolute inset-x-0 bottom-0 h-7 bg-gradient-to-b from-transparent to-[#0a141f]/55" /></div></header>}
    <div className={`relative z-[2] min-h-screen transition-[padding,pointer-events] duration-500 ${tickerVisible ? "pt-[11.5rem]" : "pt-0"} ${mapExpanded ? "pointer-events-none" : "pointer-events-auto"}`}>
      <section className={`flex items-center justify-center px-6 text-center sm:pt-32 ${tickerVisible ? "h-[calc(100vh-11.5rem)] pt-24" : "h-screen pt-24"}`}><div className={mapExpanded ? "pointer-events-none" : ""}><div className="max-w-2xl"><span className={`font-mono text-[11px] uppercase tracking-[0.28em] text-amber transition-all duration-500 ${mapExpanded ? "-translate-y-3 opacity-0 blur-sm" : "translate-y-0 opacity-100 blur-0"}`}>Aegis SCR</span><h1 className="mt-5 font-display text-5xl font-semibold leading-[1.12] tracking-[-0.035em] text-ink sm:text-7xl">{["India's", "petroleum", "command", "center."].map((word, index) => <span key={word} className="mr-[0.22em] inline-block transition-[opacity,transform,filter] duration-[650ms] ease-out last:mr-0" style={{ opacity: mapExpanded ? 0 : 1, transform: mapExpanded ? `translate(${index % 2 === 0 ? -10 : 10}px, ${-28 - index * 7}px)` : "translate(0, 0)", filter: mapExpanded ? "blur(7px)" : "blur(0)", transitionDelay: mapExpanded ? `${index * 100}ms` : "0ms" }}>{word}</span>)}</h1><button type="button" onClick={expandMap} className={`mt-10 rounded border border-amber bg-amber px-7 py-4 font-mono text-xs uppercase tracking-wider text-base transition hover:scale-[1.03] ${mapExpanded ? "translate-y-3 opacity-0" : "translate-y-0 opacity-100"}`}>View live map</button></div></div></section>
      <AgentStorySection stats={stats} onOpen={openAgent} />
    </div>
    <button type="button" onClick={() => setMapExpanded(false)} className={`fixed left-6 top-6 z-[31] rounded-md border border-border bg-[#0a101a]/75 px-4 py-2 font-mono text-xs uppercase tracking-wider text-ink shadow-lg backdrop-blur-xl transition-all duration-500 hover:border-amber hover:text-amber ${mapExpanded ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"}`}>Back</button>
  </div>;
};

export default Dashboard;
