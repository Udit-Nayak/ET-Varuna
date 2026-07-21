import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "../components/layout/Navbar";
import TensionDrawer from "../components/TensionDrawer";
import VesselMap, { VesselMapHandle } from "../components/VesselMap";
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

  const requestMapResize = useCallback(() => {
    if (resizeFrameRef.current !== null) return;
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      mapRef.current?.resize();
    });
  }, []);

  useEffect(() => {
    if (!isWorkspace || split.isDragging) return;
    requestMapResize();
  }, [isWorkspace, requestMapResize, split.isDragging, split.ratio]);

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
    });

    observer.observe(workspaceRef.current);
    return () => observer.disconnect();
  }, [split.ratio]);

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
      const corridorId = matchCorridorToZone(config.polygon);
      const zoneId = addZone(config.polygon, corridorId, config.tensionPct, config.durationDays);
      setIsDrawing(false);
      analyzeZone({
        id: zoneId,
        name: "Preset zone",
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
