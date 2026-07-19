import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TensionDrawer from "../components/TensionDrawer";
import TensionZonePanel from "../components/TensionZonePanel";
import VesselMap from "../components/VesselMap";
import { AgentZoneAnalysis, matchCorridorToZone, TensionZone, useSimulation } from "../hooks/useSimulation";
import { useVesselStream } from "../hooks/useVesselStream";
import { pointInPolygon } from "../utils/geo";

const ACTIVE_CORRIDORS = 3;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const formatUtcTime = (date: Date) =>
  date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" });

const presetPolygons = {
  hormuz: {
    polygon: [
      [56.0, 26.5],
      [57.5, 26.5],
      [57.5, 27.5],
      [56.0, 27.5],
    ],
    tensionPct: 75,
    durationDays: 14,
  },
  "red-sea": {
    polygon: [
      [42.0, 11.5],
      [44.0, 11.5],
      [44.0, 13.0],
      [42.0, 13.0],
    ],
    tensionPct: 60,
    durationDays: 21,
  },
  "full-gulf": {
    polygon: [
      [48.0, 24.0],
      [58.0, 24.0],
      [58.0, 30.0],
      [48.0, 30.0],
    ],
    tensionPct: 90,
    durationDays: 7,
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
  };

  return corridorId ? labels[corridorId] ?? corridorId : "general maritime corridor";
};

const summarizeAgentResponse = (payload: any): AgentZoneAnalysis => ({
  status: "ready",
  corridor: String(payload.corridor ?? ""),
  generatedAt: String(payload.generatedAt ?? ""),
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

  const tankerCount = useMemo(() => vessels.reduce((count, v) => count + (v.isTanker ? 1 : 0), 0), [vessels]);
  const affectedVessels = useMemo(
    () => vessels.filter((v) => zones.some((z) => pointInPolygon([v.lon, v.lat], z.polygon))).map((v) => v.mmsi),
    [vessels, zones]
  );
  const impact = useMemo(() => computeImpact(), [computeImpact]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const analyzeZoneWithAgents = useCallback(
    async (zone: TensionZone) => {
      const zoneVessels = vessels.filter((vessel) => pointInPolygon([vessel.lon, vessel.lat], zone.polygon));
      setAgentAnalyses((current) => ({
        ...current,
        [zone.id]: { status: "loading", message: "GRIA, DSM, and SROA are analyzing this zone." },
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
    [vessels]
  );

  const handlePreset = useCallback(
    (preset: PresetKey) => {
      const config = presetPolygons[preset];
      const corridorId = matchCorridorToZone(config.polygon);
      const zoneId = addZone(config.polygon, corridorId, config.tensionPct, config.durationDays);
      setIsDrawing(false);
      void analyzeZoneWithAgents({
        id: zoneId,
        name: "Preset zone",
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
            <span className="font-display text-lg font-semibold tracking-tight">Aegis SCR — Live Map</span>
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
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 font-mono text-xs text-muted md:grid-cols-4">
          <StatCard label="Total vessels" value={vessels.length} />
          <StatCard label="Tankers" value={tankerCount} color="#5EC9FF" />
          <StatCard label="Active corridors" value={ACTIVE_CORRIDORS} />
          <StatCard label="UTC time" value={formatUtcTime(currentTime)} />
        </div>
      </section>

      <main className="mx-auto min-h-0 w-full max-w-7xl flex-1 px-6 py-6">
        <div className="relative h-full min-h-0">
          <VesselMap
            vessels={vessels}
            zones={zones}
            affectedVessels={affectedVessels}
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
