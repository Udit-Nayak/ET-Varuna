import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import TensionDrawer from "../components/TensionDrawer";
import TensionZonePanel from "../components/TensionZonePanel";
import VesselMap, { ApoRouteMapOption } from "../components/VesselMap";
import { AgentZoneAnalysis, matchCorridorToZone, TensionZone, useSimulation } from "../hooks/useSimulation";
import { useVesselStream } from "../hooks/useVesselStream";
import { pointInPolygon } from "../utils/geo";

const ACTIVE_CORRIDORS = 3;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const formatUtcTime = (date: Date) =>
  date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" });

const presetPolygons = {
  malacca: {
    label: "Strait of Malacca",
    corridorId: "malacca",
    polygon: [
      [99.1, 0.8],
      [104.8, 0.8],
      [104.8, 5.8],
      [99.1, 5.8],
    ],
    tensionPct: 78,
    durationDays: 14,
  },
  suez: {
    label: "Suez Canal",
    corridorId: "suez",
    polygon: [
      [31.8, 29.2],
      [33.1, 29.2],
      [33.1, 32.0],
      [31.8, 32.0],
    ],
    tensionPct: 76,
    durationDays: 14,
  },
  panama: {
    label: "Panama Canal",
    corridorId: "panama",
    polygon: [
      [-80.4, 8.7],
      [-79.1, 8.7],
      [-79.1, 9.6],
      [-80.4, 9.6],
    ],
    tensionPct: 68,
    durationDays: 12,
  },
  hormuz: {
    label: "Strait of Hormuz",
    corridorId: "hormuz",
    polygon: [
      [55.6, 25.9],
      [57.5, 25.9],
      [57.5, 27.5],
      [55.6, 27.5],
    ],
    tensionPct: 85,
    durationDays: 15,
  },
  "english-channel": {
    label: "English Channel",
    corridorId: "english-channel",
    polygon: [
      [-1.8, 49.4],
      [2.2, 49.4],
      [2.2, 51.4],
      [-1.8, 51.4],
    ],
    tensionPct: 62,
    durationDays: 10,
  },
  "bab-el-mandeb": {
    label: "Bab-el-Mandeb",
    corridorId: "bab-el-mandeb",
    polygon: [
      [42.0, 11.4],
      [44.4, 11.4],
      [44.4, 13.5],
      [42.0, 13.5],
    ],
    tensionPct: 80,
    durationDays: 18,
  },
  gibraltar: {
    label: "Strait of Gibraltar",
    corridorId: "gibraltar",
    polygon: [
      [-6.3, 35.6],
      [-4.8, 35.6],
      [-4.8, 36.4],
      [-6.3, 36.4],
    ],
    tensionPct: 58,
    durationDays: 9,
  },
  bosphorus: {
    label: "Bosphorus Strait",
    corridorId: "bosphorus",
    polygon: [
      [28.6, 40.8],
      [29.4, 40.8],
      [29.4, 41.4],
      [28.6, 41.4],
    ],
    tensionPct: 64,
    durationDays: 11,
  },
  "cape-good-hope": {
    label: "Cape of Good Hope",
    corridorId: "cape-of-good-hope",
    polygon: [
      [17.2, -35.2],
      [20.0, -35.2],
      [20.0, -33.2],
      [17.2, -33.2],
    ],
    tensionPct: 55,
    durationDays: 12,
  },
  "south-china-sea": {
    label: "South China Sea",
    corridorId: "south-china-sea",
    polygon: [
      [108.0, 6.0],
      [121.0, 6.0],
      [121.0, 20.0],
      [108.0, 20.0],
    ],
    tensionPct: 72,
    durationDays: 16,
  },
};
type PresetKey = keyof typeof presetPolygons;

const corridorLabel = (corridorId: string | null) => {
  const labels: Record<string, string> = {
    hormuz: "Strait of Hormuz",
    "bab-el-mandeb": "Bab-el-Mandeb",
    malacca: "Strait of Malacca",
    suez: "Suez Canal",
    "persian-gulf": "Persian Gulf",
    panama: "Panama Canal",
    "english-channel": "English Channel",
    gibraltar: "Strait of Gibraltar",
    bosphorus: "Bosphorus Strait",
    "cape-of-good-hope": "Cape of Good Hope",
    "south-china-sea": "South China Sea",
  };

  return corridorId ? labels[corridorId] ?? corridorId : "general maritime corridor";
};

type CountryTradeFilter = { aliases: string[]; boxes: [number, number, number, number][]; mids?: number[]; regionOnlyAliases?: string[] };

const COUNTRY_TRADE_FILTERS: Record<string, CountryTradeFilter> = {
  india: {
    aliases: ["india", "ind", "mumbai", "bombay", "nhava sheva", "jnpt", "jnp", "innsa", "inbom", "inmun", "mundra", "kandla", "inixy", "chennai", "inmaa", "ennore", "kochi", "cochin", "incok", "vizag", "visakhapatnam", "invtz", "paradip", "inpav", "haldia", "inhal", "tuticorin", "intut", "mormugao", "inmrm"],
    boxes: [[66, 5, 91, 24]],
    mids: [419],
  },
  china: {
    aliases: ["china", "chn", "shanghai", "cnsha", "ningbo", "cnngb", "shenzhen", "cnszx", "qingdao", "cnqng", "tianjin", "cntxg", "xiamen", "cnxmn", "dalian", "cndlc", "guangzhou", "cncan", "yantian"],
    boxes: [[105, 18, 124, 41]],
    mids: [412, 413, 414],
  },
  singapore: {
    aliases: ["singapore", "sgp", "singapura", "sgsin", "pasir panjang", "jurong"],
    boxes: [[103.4, 0.9, 104.2, 1.7]],
    mids: [563, 564, 565, 566],
  },
  japan: {
    aliases: ["japan", "jpn", "tokyo", "jptyo", "yokohama", "jpyok", "kobe", "jpukb", "nagoya", "jpngo", "osaka", "jposa", "chiba", "jpchb"],
    boxes: [[128, 30, 146, 45]],
    mids: [431, 432],
  },
  "south korea": {
    aliases: ["south korea", "korea", "kor", "busan", "krpus", "ulsan", "krusn", "incheon", "krich", "pyeongtaek", "krptk"],
    boxes: [[124, 32, 131, 39]],
    mids: [440, 441],
  },
  "saudi arabia": {
    aliases: ["saudi", "saudi arabia", "sau", "jubail", "sajub", "ras tanura", "sarta", "jeddah", "sajed", "yanbu", "saynb", "dammam", "sadmm"],
    boxes: [[34, 16, 56, 31]],
    mids: [403],
  },
  uae: {
    aliases: ["uae", "united arab emirates", "are", "dubai", "aedxb", "jebel ali", "aejea", "fujairah", "aefjr", "abu dhabi", "aeauh", "khor fakkan", "aeklf"],
    boxes: [[51, 22, 57, 27]],
    mids: [470, 471],
  },
  oman: {
    aliases: ["oman", "omn", "muscat", "ommct", "sohar", "omsoh", "salalah", "omsll", "duqm", "omduq"],
    boxes: [[53, 16, 60, 27]],
    mids: [461],
  },
  russia: {
    aliases: ["russia", "rus", "novorossiysk", "runvs", "vladivostok", "ruvvo", "primorsk", "ruptp", "ust-luga", "ruulg", "murmansk", "rummk"],
    boxes: [[27, 41, 180, 72]],
    mids: [273],
  },
  australia: {
    aliases: ["australia", "aus", "sydney", "ausyd", "melbourne", "aumel", "fremantle", "aufre", "brisbane", "aubne", "darwin", "audrw", "port hedland", "auphd"],
    boxes: [[112, -44, 154, -10]],
    mids: [503],
  },
  indonesia: {
    aliases: ["indonesia", "idn", "jakarta", "idtpp", "surabaya", "idsub", "belawan", "idblw", "batam", "idbtm", "balikpapan", "idbpn"],
    boxes: [[94, -11, 142, 7]],
    mids: [525],
  },
  malaysia: {
    aliases: ["malaysia", "mys", "port klang", "mypkg", "tanjung pelepas", "mytpp", "penang", "mypen", "bintulu", "mybtu"],
    boxes: [[99, 0, 120, 8]],
    mids: [533],
  },
  "sri lanka": {
    aliases: ["sri lanka", "lka", "colombo", "lkcmb", "hambantota", "lkhba"],
    boxes: [[79, 5, 83, 10]],
    mids: [417],
  },
  egypt: {
    aliases: ["egypt", "egy", "suez", "egsuz", "port said", "egpsd", "alexandria", "egaly"],
    boxes: [[25, 21, 37, 32]],
    mids: [622],
  },
  usa: {
    aliases: ["usa", "united states", "america", "houston", "ushou", "new york", "usnyc", "los angeles", "uslax", "long beach", "uslgb", "savannah", "ussav", "new orleans", "usmsy"],
    boxes: [[-125, 24, -66, 50], [-170, 52, -130, 72]],
    mids: [338, 366, 367, 368, 369],
  },
  "united kingdom": {
    aliases: ["united kingdom", "uk", "gbr", "london", "gblon", "felixstowe", "gbfxT", "southampton", "gbsou", "liverpool", "gbliv"],
    boxes: [[-9, 49, 3, 60]],
    mids: [232, 233, 234, 235],
  },
  panama: {
    aliases: ["panama", "pan", "panama canal", "papac", "balboa", "pabal", "cristobal", "pactb"],
    boxes: [[-83, 7, -77, 11]],
    mids: [351, 352, 353, 354, 355, 356, 357],
  },
};

const normalizeFilterText = (value: string) => value.trim().toLowerCase();
const compactSearchText = (value: string) => normalizeFilterText(value).replace(/[^a-z0-9]/g, "");

const getMmsiMid = (mmsi: number) => Math.floor(mmsi / 1000000);

const vesselMatchesCountry = (
  vessel: { mmsi: number; lat: number; lon: number; name?: string; destination?: string; callSign?: string },
  rawQuery: string
) => {
  const query = normalizeFilterText(rawQuery);
  if (!query) return true;

  const compactQuery = compactSearchText(rawQuery);
  const matchedEntry = Object.entries(COUNTRY_TRADE_FILTERS).find(
    ([country, config]) =>
      country === query ||
      compactSearchText(country) === compactQuery ||
      config.aliases.some((alias) => alias.toLowerCase() === query || compactSearchText(alias) === compactQuery)
  );
  const filter = matchedEntry?.[1];
  const aliases = filter?.aliases ?? [query];
  const searchable = [vessel.destination, vessel.name, vessel.callSign].filter(Boolean).join(" ");
  const normalizedSearchable = normalizeFilterText(searchable);
  const compactSearchable = compactSearchText(searchable);

  const textMatched = aliases.some((alias) => {
    const normalizedAlias = normalizeFilterText(alias);
    const compactAlias = compactSearchText(alias);
    if (compactAlias.length <= 2) return compactSearchable === compactAlias || compactSearchable.startsWith(compactAlias);
    return normalizedSearchable.includes(normalizedAlias) || compactSearchable.includes(compactAlias);
  });
  const flagMatched = filter?.mids?.includes(getMmsiMid(vessel.mmsi)) ?? false;

  return textMatched || flagMatched;
};


const zoneAnalysisSignature = (zone: TensionZone): string =>
  JSON.stringify({
    polygon: zone.polygon.map(([lng, lat]) => [Number(lng.toFixed(4)), Number(lat.toFixed(4))]),
    corridorId: zone.corridorId,
    tensionPct: zone.tensionPct,
    durationDays: zone.durationDays,
  });

const summarizeAgentResponse = (payload: any): AgentZoneAnalysis => ({
  status: "ready",
  corridor: String(payload.corridor ?? ""),
  generatedAt: String(payload.generatedAt ?? ""),
  zoneGeometry: {
    pointCount: Array.isArray(payload.zoneGeometry?.polygon) ? payload.zoneGeometry.polygon.length : 0,
    center: Array.isArray(payload.zoneGeometry?.center) ? payload.zoneGeometry.center as [number, number] : null,
    areaSqKm: Number(payload.zoneGeometry?.approximate_area_sq_km ?? 0),
  },
  griaMatches: Array.isArray(payload.gria?.matches) ? payload.gria.matches.length : 0,
  dsm: {
    capacityLossPct: Number(payload.dsm?.capacity_loss_pct ?? 0),
    durationDays: Number(payload.dsm?.duration_days ?? 0),
    severityEvents: Array.isArray(payload.dsm?.based_on_events) ? payload.dsm.based_on_events.length : 0,
    summary: String(payload.dsm?.summary ?? ""),
  },
  sroa: {
    policy: String(payload.sroa?.policy ?? ""),
    totalReleasedVolume: Number(payload.sroa?.total_released_volume ?? 0),
    reserveAfterPlanDays: Number(payload.sroa?.reserve_after_plan_days ?? 0),
    safetyThresholdBreached: Boolean(payload.sroa?.safety_threshold_breached),
    sanityStatus: String(payload.sroa?.sanity_check?.status ?? ""),
    summary: String(payload.sroa?.summary ?? ""),
  },
  apo: {
    totalVolumeNeeded: Number(payload.apo?.total_volume_needed ?? 0),
    topOptions: Array.isArray(payload.apo?.ranked_options)
      ? payload.apo.ranked_options.slice(0, 3).map((option: any) => ({
          routeId: String(option.route_id ?? ""),
          supplierName: String(option.supplier_name ?? ""),
          route: String(option.via ?? option.route_id ?? ""),
          landedCostPerBarrel: Number(option.landed_cost_per_barrel ?? 0),
          transitDays: Number(option.transit_days ?? 0),
          routeRiskScore: Number(option.route_risk_score ?? 0),
          compositeScore: Number(option.composite_score ?? 0),
          volumeOffered: Number(option.volume_offered ?? 0),
          explanation: String(option.explanation ?? ""),
        }))
      : [],
    llmFlags: Array.isArray(payload.apo?.llm_flags) ? payload.apo.llm_flags.map(String) : [],
  },
  recommendation: String(payload.recommendation ?? ""),
});

const LiveMap = () => {
  const { vessels, status } = useVesselStream();
  const {
    zones,
    isDrawing,
    addZone,
    removeZone,
    clearAllZones,
    setZoneTension,
    setZoneDuration,
    setIsDrawing,
    computeImpact,
  } = useSimulation();
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [agentAnalyses, setAgentAnalyses] = useState<Record<string, AgentZoneAnalysis>>({});
  const [countryFilter, setCountryFilter] = useState("");
  const analyzedZoneSignaturesRef = useRef<Record<string, string>>({});

  const visibleVessels = useMemo(
    () => vessels.filter((vessel) => vesselMatchesCountry(vessel, countryFilter)),
    [countryFilter, vessels]
  );
  const tankerCount = useMemo(() => visibleVessels.reduce((count, v) => count + (v.isTanker ? 1 : 0), 0), [visibleVessels]);
  const affectedVessels = useMemo(
    () => visibleVessels.filter((v) => zones.some((z) => pointInPolygon([v.lon, v.lat], z.polygon))).map((v) => v.mmsi),
    [visibleVessels, zones]
  );
  const impact = useMemo(() => computeImpact(), [computeImpact]);
  const apoRouteOptions = useMemo<ApoRouteMapOption[]>(() =>
    Object.values(agentAnalyses).flatMap((analysis) => {
      if (analysis.status !== "ready" || !analysis.apo?.topOptions) return [];
      return analysis.apo.topOptions.slice(0, 5).map((option, index) => ({
        routeId: option.routeId,
        supplierName: option.supplierName,
        route: option.route,
        rank: index + 1,
        landedCostPerBarrel: option.landedCostPerBarrel,
        transitDays: option.transitDays,
        routeRiskScore: option.routeRiskScore,
        compositeScore: option.compositeScore,
        volumeOffered: option.volumeOffered,
      }));
    }),
    [agentAnalyses]
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const analyzeZoneWithAgents = useCallback(
    async (zone: TensionZone) => {
      const signature = zoneAnalysisSignature(zone);
      analyzedZoneSignaturesRef.current[zone.id] = signature;
      const zoneVessels = visibleVessels.filter((vessel) => pointInPolygon([vessel.lon, vessel.lat], zone.polygon));
      setAgentAnalyses((current) => ({
        ...current,
        [zone.id]: { status: "loading", message: "GRIA, DSM, SROA, and APO are analyzing this zone." },
      }));

      try {
        const response = await fetch(`${API_BASE_URL}/api/map/analyze-zone`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            zoneId: zone.id,
            zoneName: zone.name,
            polygon: zone.polygon,
            corridorId: zone.corridorId,
            corridorName: corridorLabel(zone.corridorId),
            tensionPct: zone.tensionPct,
            durationDays: zone.durationDays,
            affectedVesselCount: zoneVessels.length,
            affectedTankers: zoneVessels.filter((vessel) => vessel.isTanker).length,
          }),
        });

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.detail || payload.error || "Agent analysis failed");
        }

        setAgentAnalyses((current) => ({
          ...current,
          [zone.id]: summarizeAgentResponse(payload),
        }));
      } catch (error) {
        setAgentAnalyses((current) => ({
          ...current,
          [zone.id]: {
            status: "error",
            message: error instanceof Error ? error.message : "Agent analysis failed",
          },
        }));
      }
    },
    [visibleVessels]
  );

  useEffect(() => {
    if (zones.length === 0) {
      analyzedZoneSignaturesRef.current = {};
      return;
    }

    const pendingZones = zones.filter((zone) => {
      if (agentAnalyses[zone.id]?.status === "loading") return false;
      return analyzedZoneSignaturesRef.current[zone.id] !== zoneAnalysisSignature(zone);
    });

    if (pendingZones.length === 0) return;

    const timeoutId = window.setTimeout(() => {
      pendingZones.forEach((zone) => {
        void analyzeZoneWithAgents(zone);
      });
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [agentAnalyses, analyzeZoneWithAgents, zones]);

  const handlePreset = useCallback(
    (preset: PresetKey) => {
      const config = presetPolygons[preset];
      const corridorId = config.corridorId ?? matchCorridorToZone(config.polygon);
      const zoneId = addZone(config.polygon, corridorId, config.tensionPct, config.durationDays);
      setIsDrawing(false);
      void analyzeZoneWithAgents({
        id: zoneId,
        name: config.label,
        polygon: config.polygon,
        corridorId,
        tensionPct: config.tensionPct,
        durationDays: config.durationDays,
        createdAt: Date.now(),
      });
    },
    [addZone, analyzeZoneWithAgents, setIsDrawing]
  );

  const handleZoneDrawn = useCallback(
    (polygon: number[][]) => {
      const corridorId = matchCorridorToZone(polygon);
      const zoneId = addZone(polygon, corridorId, 50, 14);
      setIsDrawing(false);
      void analyzeZoneWithAgents({
        id: zoneId,
        name: "Drawn zone",
        polygon,
        corridorId,
        tensionPct: 50,
        durationDays: 14,
        createdAt: Date.now(),
      });
    },
    [addZone, analyzeZoneWithAgents, setIsDrawing]
  );

  const statusPill =
    status === "live"
      ? { label: "LIVE", cls: "border-safe/50 bg-safe/10 text-safe" }
      : status === "reconnecting"
      ? { label: "RECONNECTING", cls: "border-amber/50 bg-amber/10 text-amber" }
      : status === "offline"
      ? { label: "OFFLINE", cls: "border-risk/50 bg-risk/10 text-risk" }
      : { label: "CONNECTING", cls: "border-border bg-surface text-muted" };

  return (
    <div className="flex h-screen flex-col bg-base text-ink">
      <header className="border-b border-border bg-base/90 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-lg font-semibold tracking-tight">Sentrix - Live Map</span>
            <span className={`inline-flex items-center gap-2 rounded border px-2 py-1 font-mono text-[10px] font-semibold ${statusPill.cls}`}>
              <span className={`h-2 w-2 rounded-full ${status === "live" ? "animate-pulseDot" : ""}`} style={{ background: "currentColor" }} />
              {statusPill.label}
            </span>
          </div>
          <Link
            to="/dashboard"
            className="rounded-md border border-border px-4 py-2 font-mono text-xs uppercase tracking-wider text-ink transition-colors hover:border-amber hover:text-amber"
          >
            Back to dashboard
          </Link>
        </div>
      </header>

      <section className="border-b border-border bg-surface/80 px-6 py-3">
        <div className="mx-auto grid max-w-7xl gap-3 font-mono text-xs text-muted lg:grid-cols-[1fr_320px]">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label={countryFilter.trim() ? "Shown vessels" : "Trade vessels"} value={visibleVessels.length} />
            <StatCard label="Tankers" value={tankerCount} color="#5EC9FF" />
            <StatCard label="Active corridors" value={ACTIVE_CORRIDORS} />
            <StatCard label="UTC time" value={formatUtcTime(currentTime)} />
          </div>
          <label className="flex min-w-0 flex-col justify-center rounded border border-border bg-base/70 px-3 py-2">
            <span className="mb-1 uppercase tracking-wider">Country-linked ships</span>
            <div className="flex items-center gap-2">
              <input
                value={countryFilter}
                onChange={(event) => setCountryFilter(event.target.value)}
                placeholder="India, Mumbai, SGSIN..."
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-muted/60"
              />
              {countryFilter && (
                <button
                  type="button"
                  onClick={() => setCountryFilter("")}
                  className="rounded border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted transition-colors hover:border-amber hover:text-amber"
                >
                  Clear
                </button>
              )}
            </div>
          </label>
        </div>
      </section>

      <main className="mx-auto min-h-0 w-full max-w-7xl flex-1 px-6 py-6">
        <div className="relative h-full min-h-0">
          <VesselMap
            vessels={visibleVessels}
            zones={zones}
            affectedVessels={affectedVessels}
            apoRouteOptions={apoRouteOptions}
            isDrawing={isDrawing}
            status={status}
            onZoneDrawn={handleZoneDrawn}
          />
          <TensionDrawer
            isDrawing={isDrawing}
            onToggleDrawing={() => setIsDrawing(!isDrawing)}
            onPreset={handlePreset}
            onClearAll={() => {
              clearAllZones();
              setAgentAnalyses({});
            }}
            hasZones={zones.length > 0}
          />
          <TensionZonePanel
            zones={zones}
            impact={impact}
            agentAnalyses={agentAnalyses}
            onAnalyzeZone={analyzeZoneWithAgents}
            onSetTension={setZoneTension}
            onSetDuration={setZoneDuration}
            onRemoveZone={(id) => {
              removeZone(id);
              setAgentAnalyses((current) => {
                const next = { ...current };
                delete next[id];
                return next;
              });
            }}
          />
        </div>
      </main>
    </div>
  );
};

const StatCard = ({ label, value, color }: { label: string; value: string | number; color?: string }) => (
  <div className="rounded border border-border bg-base/70 px-3 py-2">
    <div>{label}</div>
    <div className="text-lg font-semibold" style={{ color: color ?? "#E7ECEF" }}>
      {value}
    </div>
  </div>
);

export default LiveMap;
