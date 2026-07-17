import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TensionDrawer from "../components/TensionDrawer";
import TensionZonePanel from "../components/TensionZonePanel";
import VesselMap from "../components/VesselMap";
import { matchCorridorToZone, useSimulation } from "../hooks/useSimulation";
import { useVesselStream } from "../hooks/useVesselStream";
import { pointInPolygon } from "../utils/geo";

const ACTIVE_CORRIDORS = 3;

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

  const handlePreset = useCallback(
    (preset: PresetKey) => {
      const config = presetPolygons[preset];
      addZone(config.polygon, matchCorridorToZone(config.polygon), config.tensionPct, config.durationDays);
      setIsDrawing(false);
    },
    [addZone, setIsDrawing]
  );

  const handleZoneDrawn = useCallback(
    (polygon: number[][]) => {
      addZone(polygon, matchCorridorToZone(polygon), 50, 14);
      setIsDrawing(false);
    },
    [addZone, setIsDrawing]
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
            onClearAll={clearAllZones}
            hasZones={zones.length > 0}
          />
          <TensionZonePanel
            zones={zones}
            impact={impact}
            onSetTension={setZoneTension}
            onSetDuration={setZoneDuration}
            onRemoveZone={removeZone}
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