import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "../components/layout/Navbar";
import TensionDrawer from "../components/TensionDrawer";
import VesselMap, { ApoRouteMapOption, VesselMapHandle } from "../components/VesselMap";
import AgentHero from "../components/workspace/AgentHero";
import AgentShowcase from "../components/workspace/AgentShowcase";
import DissolveOverlay from "../components/workspace/DissolveOverlay";
import SplitWorkspace from "../components/workspace/SplitWorkspace";
import { corridorLabel, useAgentWorkflowChat } from "../hooks/useAgentWorkflowChat";
import { matchCorridorToZone, TensionZone, useSimulation } from "../hooks/useSimulation";
import { useScrollPhase } from "../hooks/useScrollPhase";
import { useSplitRatio } from "../hooks/useSplitRatio";
import { useVesselStream } from "../hooks/useVesselStream";
import { pointInPolygon } from "../utils/geo";

const NAV_HEIGHT = 65;

const workflowApoRoutes = (workflow: Record<string, any> | null): ApoRouteMapOption[] => {
  const options = workflow?.apo?.ranked_options;
  if (!Array.isArray(options)) return [];
  return options.slice(0, 5).map((option: any, index: number) => ({
    routeId: String(option.route_id ?? ""),
    supplierName: String(option.supplier_name ?? "Unknown supplier"),
    route: String(option.via ?? option.route_id ?? "Unknown route"),
    rank: index + 1,
    landedCostPerBarrel: Number(option.landed_cost_per_barrel ?? 0),
    transitDays: Number(option.transit_days ?? 0),
    routeRiskScore: Number(option.route_risk_score ?? 0),
    compositeScore: Number(option.composite_score ?? 0),
    volumeOffered: Number(option.volume_offered ?? 0),
  }));
};

const presetPolygons = {
  malacca: { label: "Strait of Malacca", corridorId: "malacca", polygon: [[99.1, 0.8], [104.8, 0.8], [104.8, 5.8], [99.1, 5.8]], tensionPct: 78, durationDays: 14 },
  suez: { label: "Suez Canal", corridorId: "suez", polygon: [[31.8, 29.2], [33.1, 29.2], [33.1, 32.0], [31.8, 32.0]], tensionPct: 76, durationDays: 14 },
  panama: { label: "Panama Canal", corridorId: "panama", polygon: [[-80.4, 8.7], [-79.1, 8.7], [-79.1, 9.6], [-80.4, 9.6]], tensionPct: 68, durationDays: 12 },
  hormuz: { label: "Strait of Hormuz", corridorId: "hormuz", polygon: [[55.6, 25.9], [57.5, 25.9], [57.5, 27.5], [55.6, 27.5]], tensionPct: 85, durationDays: 15 },
  "english-channel": { label: "English Channel", corridorId: "english-channel", polygon: [[-1.8, 49.4], [2.2, 49.4], [2.2, 51.4], [-1.8, 51.4]], tensionPct: 62, durationDays: 10 },
  "bab-el-mandeb": { label: "Bab-el-Mandeb", corridorId: "bab-el-mandeb", polygon: [[42.0, 11.4], [44.4, 11.4], [44.4, 13.5], [42.0, 13.5]], tensionPct: 80, durationDays: 18 },
  gibraltar: { label: "Strait of Gibraltar", corridorId: "gibraltar", polygon: [[-6.3, 35.6], [-4.8, 35.6], [-4.8, 36.4], [-6.3, 36.4]], tensionPct: 58, durationDays: 9 },
  bosphorus: { label: "Bosphorus Strait", corridorId: "bosphorus", polygon: [[28.6, 40.8], [29.4, 40.8], [29.4, 41.4], [28.6, 41.4]], tensionPct: 64, durationDays: 11 },
  "cape-good-hope": { label: "Cape of Good Hope", corridorId: "cape-of-good-hope", polygon: [[17.2, -35.2], [20.0, -35.2], [20.0, -33.2], [17.2, -33.2]], tensionPct: 55, durationDays: 12 },
  "south-china-sea": { label: "South China Sea", corridorId: "south-china-sea", polygon: [[108.0, 6.0], [121.0, 6.0], [121.0, 20.0], [108.0, 20.0]], tensionPct: 72, durationDays: 16 },
};
type PresetKey = keyof typeof presetPolygons;

const Dashboard = () => {
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
  const {
    phase,
    setPhase,
    showcaseProgress,
    setShowcaseProgress,
    startWorkspaceTransition,
    completeWorkspaceTransition,
  } = useScrollPhase();
  const chat = useAgentWorkflowChat();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<VesselMapHandle>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const split = useSplitRatio(workspaceRef);
  const [mapPaneWidth, setMapPaneWidth] = useState(0);
  const [chatPaneWidth, setChatPaneWidth] = useState(0);

  const isWorkspace = phase === "workspace";
  const mapCompact = isWorkspace && (split.ratio < 30 || mapPaneWidth < 420);
  const chatCompact = isWorkspace && (100 - split.ratio < 30 || chatPaneWidth < 360);
  const impact = useMemo(() => computeImpact(), [computeImpact]);
  const affectedVessels = useMemo(
    () => vessels.filter((vessel) => zones.some((zone) => pointInPolygon([vessel.lon, vessel.lat], zone.polygon))).map((vessel) => vessel.mmsi),
    [vessels, zones]
  );
  const apoRouteOptions = useMemo(() => workflowApoRoutes(chat.latestWorkflow), [chat.latestWorkflow]);

  const requestMapResize = useCallback(() => {
    if (resizeFrameRef.current !== null) return;
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      mapRef.current?.resize();
    });
  }, []);

  useEffect(() => {
    if (!isWorkspace) return;
    requestMapResize();
  }, [isWorkspace, requestMapResize, split.ratio]);

  useEffect(
    () => () => {
      if (resizeFrameRef.current !== null) window.cancelAnimationFrame(resizeFrameRef.current);
    },
    []
  );

  useEffect(() => {
    if (!workspaceRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setMapPaneWidth((width * split.ratio) / 100);
      setChatPaneWidth((width * (100 - split.ratio)) / 100);
      requestMapResize();
    });

    observer.observe(workspaceRef.current);
    return () => observer.disconnect();
  }, [requestMapResize, split.ratio]);

  useEffect(() => {
    const handleScroll = () => {
      if (phase === "transitioning" || phase === "workspace") return;
      const nextPhase = window.scrollY > window.innerHeight * 0.75 ? "showcase" : "hero";
      setPhase(nextPhase);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [phase, setPhase]);

  const analyzeZone = useCallback(
    (zone: TensionZone) => {
      void chat.analyzeZoneWithAgents(zone, vessels);
    },
    [chat, vessels]
  );

  const handlePreset = useCallback(
    (preset: PresetKey) => {
      const config = presetPolygons[preset];
      const corridorId = config.corridorId ?? matchCorridorToZone(config.polygon);
      const zoneId = addZone(config.polygon, corridorId, config.tensionPct, config.durationDays);
      setIsDrawing(false);
      analyzeZone({
        id: zoneId,
        name: config.label,
        polygon: config.polygon,
        corridorId,
        tensionPct: config.tensionPct,
        durationDays: config.durationDays,
        createdAt: Date.now(),
      });
    },
    [addZone, analyzeZone, setIsDrawing]
  );

  const handleZoneDrawn = useCallback(
    (polygon: number[][]) => {
      const corridorId = matchCorridorToZone(polygon);
      const zoneId = addZone(polygon, corridorId, 50, 14);
      setIsDrawing(false);
      analyzeZone({
        id: zoneId,
        name: `Drawn zone - ${corridorLabel(corridorId)}`,
        polygon,
        corridorId,
        tensionPct: 50,
        durationDays: 14,
        createdAt: Date.now(),
      });
    },
    [addZone, analyzeZone, setIsDrawing]
  );

  const mapTarget = isWorkspace
    ? {
        left: "0%",
        width: `${split.ratio}%`,
        opacity: 1,
      }
    : {
        left: "0%",
        width: "100%",
        opacity: showcaseProgress > 0 ? 0.78 : 0.68,
      };

  return (
    <div className="min-h-screen bg-base text-ink">
      <Navbar />

      <motion.div
        className={`fixed ${isWorkspace ? "z-20 pointer-events-auto" : "z-0 pointer-events-none"}`}
        style={{ top: NAV_HEIGHT, bottom: 0 }}
        animate={mapTarget}
        transition={{ duration: 0.55, ease: "easeInOut" }}
        onAnimationComplete={requestMapResize}
      >
        <VesselMap
          ref={mapRef}
          vessels={vessels}
          zones={zones}
          affectedVessels={affectedVessels}
          apoRouteOptions={apoRouteOptions}
          isDrawing={isWorkspace && isDrawing}
          status={status}
          onZoneDrawn={handleZoneDrawn}
          backgroundMode={!isWorkspace}
          interactive={isWorkspace}
          compact={mapCompact}
          className={isWorkspace ? "rounded-none border-0" : ""}
        />
        {isWorkspace && (
          <TensionDrawer
            isDrawing={isDrawing}
            onToggleDrawing={() => setIsDrawing(!isDrawing)}
            onPreset={handlePreset}
            onClearAll={clearAllZones}
            hasZones={zones.length > 0}
          />
        )}
      </motion.div>

      <AnimatePresence mode="wait">
        {(phase === "hero" || phase === "showcase") && (
          <DissolveOverlay key="story" onExitComplete={completeWorkspaceTransition}>
            <AgentHero onUseMe={startWorkspaceTransition} />
            <AgentShowcase onProgressChange={setShowcaseProgress} />
          </DissolveOverlay>
        )}
      </AnimatePresence>

      {isWorkspace && (
        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="pointer-events-none relative z-30"
        >
          <SplitWorkspace
            containerRef={workspaceRef}
            ratio={split.ratio}
            isDragging={split.isDragging}
            onDividerPointerDown={split.onPointerDown}
            chatCompact={chatCompact}
            messages={chat.messages}
            latestWorkflow={chat.latestWorkflow}
            isBusy={chat.isBusy}
            zones={zones}
            impact={impact}
            onAskQuestion={chat.askQuestion}
            onClearChat={chat.clearMessages}
            onAnalyzeZone={analyzeZone}
            onSetTension={setZoneTension}
            onSetDuration={setZoneDuration}
            onRemoveZone={removeZone}
          />
        </motion.main>
      )}
    </div>
  );
};

export default Dashboard;
