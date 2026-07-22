import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { corridors } from "../data/corridors";
import { indiaFacilities, FacilityType } from "../data/indiaPorts";
import { TensionZone } from "../hooks/useSimulation";
import { Vessel, StreamStatus } from "../hooks/useVesselStream";
import { bearingBetween, distanceBetween, getPolygonCenter, isHeadingToward, pointInPolygon } from "../utils/geo";

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const facilityColor: Record<FacilityType, string> = {
  port: "#8A96A3",
  refinery: "#E8A33D",
  spr: "#3FA796",
};

const facilityStatus: Record<FacilityType, string> = {
  port: "Major Import Terminal",
  refinery: "Active Refinery",
  spr: "Strategic Reserve Site",
};

const STALE_VESSEL_MS = 10 * 60 * 1000;
const VESSEL_TANKER_COLOR = "#5EC9FF";
const VESSEL_OTHER_COLOR = "#5C6773";
const VESSEL_STALE_COLOR = "#8F98A3";
const VESSEL_AFFECTED_COLOR = "#D64545";
const VESSEL_APPROACHING_COLOR = "#E8A33D";
const DRAFT_COLOR = "#E8A33D";
const CLOSE_VERTEX_PX = 10;
const DEDUPE_PX = 6;
const STATIC_CORRIDORS = corridors.filter((corridor) => corridor.id !== "cape-of-good-hope");

interface SelectedVesselDetails {
  mmsi: number;
  name: string;
  lat: number;
  lon: number;
  sog?: number;
  cog?: number;
  heading?: number;
  type?: number;
  callSign?: string;
  destination?: string;
  imoNumber?: number;
  draught?: number;
  isTanker: boolean;
  lastUpdate: number;
}

const toNumber = (value: unknown): number | undefined => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const toBoolean = (value: unknown): boolean => value === true || value === "true";

const vesselToDetails = (vessel: Vessel): SelectedVesselDetails => ({
  mmsi: vessel.mmsi,
  name: vessel.name || "Unknown vessel",
  lat: vessel.lat,
  lon: vessel.lon,
  sog: vessel.sog,
  cog: vessel.cog,
  heading: vessel.heading,
  type: vessel.type,
  callSign: vessel.callSign,
  destination: vessel.destination,
  imoNumber: vessel.imoNumber,
  draught: vessel.draught,
  isTanker: vessel.isTanker,
  lastUpdate: vessel.lastUpdate,
});

const formatNumber = (value: unknown, digits = 1, suffix = "") => {
  const numeric = toNumber(value);
  return numeric === undefined ? "—" : `${numeric.toFixed(digits)}${suffix}`;
};

const formatLastUpdate = (value: unknown) => {
  const numeric = toNumber(value);
  if (numeric === undefined) return "—";
  return new Date(numeric).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const getCorridorMidpoint = (coordinates: [number, number][]) => {
  if (coordinates.length === 0) return [0, 0] as [number, number];
  if (coordinates.length === 1) return coordinates[0];

  const segments = coordinates.slice(1).map((point, index) => {
    const previous = coordinates[index];
    const length = Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    return { previous, point, length };
  });
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  let distance = totalLength / 2;

  for (const segment of segments) {
    if (distance <= segment.length) {
      const ratio = segment.length === 0 ? 0 : distance / segment.length;
      return [
        segment.previous[0] + (segment.point[0] - segment.previous[0]) * ratio,
        segment.previous[1] + (segment.point[1] - segment.previous[1]) * ratio,
      ] as [number, number];
    }
    distance -= segment.length;
  }

  return coordinates[coordinates.length - 1];
};

const corridorLabelsToGeoJSON = () => ({
  type: "FeatureCollection" as const,
  features: STATIC_CORRIDORS.map((corridor) => ({
    type: "Feature" as const,
    properties: {
      id: corridor.id,
      label: `${corridor.name} · Risk ${corridor.risk}`,
    },
    geometry: {
      type: "Point" as const,
      coordinates: getCorridorMidpoint(corridor.coordinates),
    },
  })),
});

const isVesselApproachingZone = (vessel: Vessel, zones: TensionZone[]) => {
  if (vessel.cog === undefined) return false;
  return zones.some((zone) => {
    const [zoneLng, zoneLat] = getPolygonCenter(zone.polygon);
    const distanceKm = distanceBetween(vessel.lat, vessel.lon, zoneLat, zoneLng);
    if (distanceKm > 200) return false;
    const bearingToZone = bearingBetween(vessel.lat, vessel.lon, zoneLat, zoneLng);
    return isHeadingToward(vessel.cog!, bearingToZone);
  });
};

const vesselsToGeoJSON = (
  vessels: Vessel[],
  now = Date.now(),
  affectedVessels: number[] = [],
  zones: TensionZone[] = []
) => {
  const affectedSet = new Set(affectedVessels);
  return {
    type: "FeatureCollection" as const,
    features: vessels.map((v) => ({
      type: "Feature" as const,
      properties: {
        mmsi: v.mmsi,
        name: v.name || "Unknown vessel",
        lat: v.lat,
        lon: v.lon,
        sog: v.sog,
        cog: v.cog,
        heading: v.heading,
        type: v.type,
        callSign: v.callSign,
        destination: v.destination,
        imoNumber: v.imoNumber,
        draught: v.draught,
        isTanker: v.isTanker,
        isAffected: affectedSet.has(v.mmsi),
        isApproaching: !affectedSet.has(v.mmsi) && isVesselApproachingZone(v, zones),
        isStale: now - v.lastUpdate > STALE_VESSEL_MS,
        lastUpdate: v.lastUpdate,
        rotation: v.heading !== undefined && v.heading !== 511 ? v.heading : v.cog ?? 0,
      },
      geometry: { type: "Point" as const, coordinates: [v.lon, v.lat] },
    })),
  };
};

const affectedVesselsToGeoJSON = (
  vessels: Vessel[],
  now = Date.now(),
  affectedVessels: number[] = [],
  zones: TensionZone[] = []
) => {
  const affectedSet = new Set(affectedVessels);
  return vesselsToGeoJSON(
    vessels.filter((vessel) => affectedSet.has(vessel.mmsi)),
    now,
    affectedVessels,
    zones
  );
};

const APO_ROUTE_COLORS = ["#5EC9FF", "#E8A33D", "#3FA796", "#C084FC", "#FF8A8A"];
const WEST_INDIA_TERMINAL: [number, number] = [72.85, 18.95];

const APO_ROUTE_COORDINATES: Record<string, [number, number][]> = {
  "fujairah-arabian-sea": [[56.35, 25.12], [57.8, 24.6], [60.8, 23.2], [64.8, 21.0], [69.3, 19.4], WEST_INDIA_TERMINAL],
  "jebel-ali-hormuz": [[55.05, 25.02], [54.2, 25.35], [53.2, 25.85], [54.9, 26.2], [56.45, 26.45], [61.5, 23.6], [67.4, 20.6], WEST_INDIA_TERMINAL],
  "ras-tanura-hormuz-west-india": [[50.12, 26.65], [51.3, 26.85], [53.2, 26.55], [55.2, 26.45], [56.45, 26.45], [62.4, 23.4], [68.6, 20.1], WEST_INDIA_TERMINAL],
  "basrah-hormuz-india": [[48.7, 29.5], [49.5, 28.5], [51.6, 27.2], [54.5, 26.55], [56.45, 26.45], [63.5, 22.8], WEST_INDIA_TERMINAL],
  "vladivostok-malacca-india": [[131.9, 43.1], [130.0, 36.0], [124.0, 27.0], [119.0, 20.0], [111.0, 8.0], [104.2, 1.15], [102.2, 2.2], [100.7, 3.8], [99.4, 5.2], [96.2, 6.1], [90.0, 7.0], [84.0, 6.7], [80.8, 6.2], [78.5, 5.0], [76.5, 6.0], [74.8, 9.0], [73.4, 13.2], WEST_INDIA_TERMINAL],
  "kozmino-pacific-india": [[133.05, 42.65], [130.0, 35.0], [123.5, 25.5], [118.0, 18.5], [111.0, 8.0], [104.2, 1.15], [102.2, 2.2], [100.7, 3.8], [99.4, 5.2], [96.2, 6.1], [90.0, 7.0], [84.0, 6.7], [80.8, 6.2], [78.5, 5.0], [76.5, 6.0], [74.8, 9.0], [73.4, 13.2], WEST_INDIA_TERMINAL],
  "red-sea-cape-reroute": [[38.2, 24.1], [39.6, 18.0], [42.6, 12.5], [43.2, 5.0], [41.0, -6.0], [34.0, -18.0], [25.0, -31.0], [18.3, -34.4], [35.0, -27.0], [50.0, -12.0], [63.0, 2.0], WEST_INDIA_TERMINAL],
  "us-gulf-cape-india": [[-90.0, 29.0], [-82.0, 23.5], [-60.0, 10.0], [-35.0, -5.0], [-10.0, -25.0], [18.3, -34.4], [39.0, -22.0], [58.0, -4.0], WEST_INDIA_TERMINAL],
  "bonny-cape-india": [[7.2, 4.4], [5.0, -6.0], [10.0, -21.0], [18.3, -34.4], [39.0, -22.0], [58.0, -4.0], WEST_INDIA_TERMINAL],
  "santos-cape-india": [[-46.3, -24.0], [-30.0, -30.0], [2.0, -35.0], [18.3, -34.4], [39.0, -22.0], [58.0, -4.0], WEST_INDIA_TERMINAL],
};

export interface ApoRouteMapOption {
  routeId: string;
  supplierName: string;
  route: string;
  rank: number;
  landedCostPerBarrel?: number;
  transitDays?: number;
  routeRiskScore?: number;
  compositeScore?: number;
  volumeOffered?: number;
  routeGeometry?: [number, number][];
  routeFeasibilityNotes?: string[];
}

const isPresent = <T,>(value: T | null): value is T => value !== null;

const inferApoRouteId = (option: ApoRouteMapOption) => {
  const text = (option.routeId + " " + option.route).toLowerCase();
  if (text.includes("fujairah") || text.includes("arabian sea")) return "fujairah-arabian-sea";
  if (text.includes("jebel ali")) return "jebel-ali-hormuz";
  if (text.includes("ras tanura") || text.includes("arab light")) return "ras-tanura-hormuz-west-india";
  if (text.includes("basrah") || text.includes("iraq")) return "basrah-hormuz-india";
  if (text.includes("vladivostok")) return "vladivostok-malacca-india";
  if (text.includes("kozmino")) return "kozmino-pacific-india";
  if (text.includes("yanbu") || text.includes("red sea") || text.includes("cape reroute")) return "red-sea-cape-reroute";
  if (text.includes("us gulf")) return "us-gulf-cape-india";
  if (text.includes("bonny") || text.includes("nigeria")) return "bonny-cape-india";
  if (text.includes("santos") || text.includes("brazil")) return "santos-cape-india";
  return option.routeId;
};

const getApoRouteCoordinates = (option: ApoRouteMapOption): [number, number][] =>
  option.routeGeometry && option.routeGeometry.length >= 2 ? option.routeGeometry : APO_ROUTE_COORDINATES[inferApoRouteId(option)] ?? [];

const orientation = (a: [number, number], b: [number, number], c: [number, number]) =>
  (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);

const isOnSegment = (a: [number, number], b: [number, number], c: [number, number]) =>
  b[0] <= Math.max(a[0], c[0]) &&
  b[0] >= Math.min(a[0], c[0]) &&
  b[1] <= Math.max(a[1], c[1]) &&
  b[1] >= Math.min(a[1], c[1]);

const segmentsIntersect = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]) => {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  const eps = 1e-9;
  if (Math.abs(o1) < eps && isOnSegment(a, c, b)) return true;
  if (Math.abs(o2) < eps && isOnSegment(a, d, b)) return true;
  if (Math.abs(o3) < eps && isOnSegment(c, a, d)) return true;
  if (Math.abs(o4) < eps && isOnSegment(c, b, d)) return true;
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
};

const routeIntersectsZone = (coordinates: [number, number][], zone: TensionZone) => {
  if (coordinates.some((point) => pointInPolygon(point, zone.polygon))) return true;
  const polygonEdges = zone.polygon.map((point, index) => [point, zone.polygon[(index + 1) % zone.polygon.length]] as [[number, number], [number, number]]);
  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const start = coordinates[i];
    const end = coordinates[i + 1];
    if (polygonEdges.some(([edgeStart, edgeEnd]) => segmentsIntersect(start, end, edgeStart, edgeEnd))) return true;
  }
  return false;
};

const routeIsBlockedByZones = (coordinates: [number, number][], zones: TensionZone[]) =>
  zones.some((zone) => routeIntersectsZone(coordinates, zone));

const getRenderableApoRoutes = (options: ApoRouteMapOption[] = [], zones: TensionZone[] = []) =>
  options
    .map((option) => {
      const coordinates = getApoRouteCoordinates(option);
      return { option, coordinates, blocked: routeIsBlockedByZones(coordinates, zones) };
    })
    .filter(({ coordinates, blocked }) => coordinates.length >= 2 && !blocked);

const apoRoutesToGeoJSON = (options: ApoRouteMapOption[] = [], zones: TensionZone[] = []) => ({
  type: "FeatureCollection" as const,
  features: getRenderableApoRoutes(options, zones)
    .map(({ option, coordinates, blocked }, index) => {
      const color = blocked ? VESSEL_AFFECTED_COLOR : APO_ROUTE_COLORS[index % APO_ROUTE_COLORS.length];
      return {
        type: "Feature" as const,
        properties: {
          id: option.routeId || "apo-route-" + (index + 1),
          rank: option.rank || index + 1,
          color,
          blocked,
          status: blocked ? "blocked by active tension zone" : "recommended sea passage",
          supplierName: option.supplierName,
          route: option.route,
          landedCostPerBarrel: option.landedCostPerBarrel,
          transitDays: option.transitDays,
          routeRiskScore: option.routeRiskScore,
          volumeOffered: option.volumeOffered,
        },
        geometry: { type: "LineString" as const, coordinates },
      };
    })
    .filter(isPresent),
});

const apoRouteLabelsToGeoJSON = (options: ApoRouteMapOption[] = [], zones: TensionZone[] = []) => ({
  type: "FeatureCollection" as const,
  features: getRenderableApoRoutes(options, zones)
    .map(({ option, coordinates, blocked }, index) => {
      return {
        type: "Feature" as const,
        properties: {
          label: "APO " + (option.rank || index + 1),
          color: blocked ? VESSEL_AFFECTED_COLOR : APO_ROUTE_COLORS[index % APO_ROUTE_COLORS.length],
        },
        geometry: { type: "Point" as const, coordinates: getCorridorMidpoint(coordinates) },
      };
    })
    .filter(isPresent),
});

const zonesToGeoJSON = (zones: TensionZone[]) => ({
  type: "FeatureCollection" as const,
  features: zones.map((zone) => ({
    type: "Feature" as const,
    properties: {
      id: zone.id,
      name: zone.name,
      tensionPct: zone.tensionPct,
      opacity: zone.tensionPct / 300,
    },
    geometry: {
      type: "Polygon" as const,
      coordinates: [[...zone.polygon, zone.polygon[0]]],
    },
  })),
});

const emptyFC = { type: "FeatureCollection" as const, features: [] as any[] };

interface VesselMapProps {
  vessels: Vessel[];
  zones: TensionZone[];
  affectedVessels: number[];
  apoRouteOptions?: ApoRouteMapOption[];
  isDrawing: boolean;
  status: StreamStatus;
  onZoneDrawn: (coordinates: number[][]) => void;
  isEraseMode?: boolean;
  onZoneErase?: (zoneId: string) => void;
  backgroundMode?: boolean;
  interactive?: boolean;
  compact?: boolean;
  className?: string;
}

export interface VesselMapHandle {
  resize: () => void;
}

const statusMeta: Record<StreamStatus, { label: string; dot: string; text: string }> = {
  connecting: { label: "CONNECTING", dot: "bg-muted", text: "text-muted" },
  live: { label: "LIVE", dot: "bg-safe", text: "text-safe" },
  reconnecting: { label: "RECONNECTING", dot: "bg-amber", text: "text-amber" },
  offline: { label: "OFFLINE", dot: "bg-risk", text: "text-risk" },
};

const VesselMap = forwardRef<VesselMapHandle, VesselMapProps>(
  (
    {
      vessels,
      zones,
      affectedVessels,
      apoRouteOptions = [],
      isDrawing,
      status,
      onZoneDrawn,
      isEraseMode = false,
      onZoneErase,
      backgroundMode = false,
      interactive = !backgroundMode,
      compact = false,
      className = "",
    },
    ref
  ) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const navControlRef = useRef<maplibregl.NavigationControl | null>(null);
  const interactionRef = useRef({ interactive, backgroundMode, onZoneDrawn, isEraseMode, onZoneErase });
  const loadedRef = useRef(false);
  const draftPointsRef = useRef<[number, number][]>([]);
  const [selectedVessel, setSelectedVessel] = useState<SelectedVesselDetails | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [legendOpen, setLegendOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const tankerCount = vessels.reduce((count, vessel) => count + (vessel.isTanker ? 1 : 0), 0);
  const otherVesselCount = vessels.length - tankerCount;
  const latestUpdate = useMemo(
    () => vessels.reduce((latest, vessel) => Math.max(latest, vessel.lastUpdate), 0),
    [vessels]
  );

  useImperativeHandle(ref, () => ({
    resize: () => mapRef.current?.resize(),
  }));

  useEffect(() => {
    interactionRef.current = { interactive, backgroundMode, onZoneDrawn, isEraseMode, onZoneErase };
    if (!interactive) draftPointsRef.current = [];
  }, [backgroundMode, interactive, isEraseMode, onZoneDrawn, onZoneErase]);

  useEffect(() => {
    if (compact) {
      setInspectorOpen(false);
      setLegendOpen(false);
    }
  }, [compact]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  // ---- Map init ----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [65, 18],
      zoom: 3.2,
    });

    mapRef.current = map;

    map.on("load", () => {
      map.addSource("corridors", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: STATIC_CORRIDORS.map((c) => ({
            type: "Feature",
            properties: { id: c.id, name: c.name, risk: c.risk },
            geometry: { type: "LineString", coordinates: c.coordinates },
          })),
        },
      });

      map.addLayer({
        id: "corridors-glow",
        type: "line",
        source: "corridors",
        paint: {
          "line-width": 10,
          "line-color": ["case", [">=", ["get", "risk"], 65], "#D64545", [">=", ["get", "risk"], 35], "#E8A33D", "#3FA796"],
          "line-opacity": 0.15,
          "line-blur": 2,
        },
      });

      map.addLayer({
        id: "corridors-line",
        type: "line",
        source: "corridors",
        paint: {
          "line-width": 3,
          "line-color": ["case", [">=", ["get", "risk"], 65], "#D64545", [">=", ["get", "risk"], 35], "#E8A33D", "#3FA796"],
          "line-opacity": 0.9,
        },
      });

      map.addSource("corridor-labels", { type: "geojson", data: corridorLabelsToGeoJSON() });
      map.addLayer({
        id: "corridor-labels",
        type: "symbol",
        source: "corridor-labels",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 10.5,
          "text-font": ["Noto Sans Regular"],
          "text-anchor": "center",
          "text-offset": [0, -1],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#F6F7F9",
          "text-halo-color": "#0B0F14",
          "text-halo-width": 1.4,
        },
      });

      map.addSource("facilities", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: indiaFacilities.map((f) => ({
            type: "Feature",
            properties: { id: f.id, name: f.name, type: f.type },
            geometry: { type: "Point", coordinates: f.coordinates },
          })),
        },
      });

      const makeFacilityIcon = (type: FacilityType, color: string) => {
        const size = 30;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;

        ctx.translate(size / 2, size / 2);
        ctx.shadowColor = "#05080C";
        ctx.shadowBlur = 5;
        ctx.shadowOffsetY = 1;
        ctx.strokeStyle = "#071018";
        ctx.fillStyle = color;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        if (type === "port") {
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(0, -8, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, -4);
          ctx.lineTo(0, 10);
          ctx.moveTo(-7, 1);
          ctx.lineTo(7, 1);
          ctx.stroke();

          ctx.strokeStyle = "#071018";
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(0, -4);
          ctx.lineTo(0, 10);
          ctx.moveTo(-7, 1);
          ctx.lineTo(7, 1);
          ctx.stroke();

          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 5, 9, 0.18 * Math.PI, 0.82 * Math.PI);
          ctx.moveTo(-8, 8);
          ctx.lineTo(-11, 5);
          ctx.moveTo(8, 8);
          ctx.lineTo(11, 5);
          ctx.stroke();
        } else if (type === "refinery") {
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(-11, 10);
          ctx.lineTo(-11, -3);
          ctx.lineTo(-4, 1);
          ctx.lineTo(-4, -4);
          ctx.lineTo(3, 1);
          ctx.lineTo(3, -4);
          ctx.lineTo(11, 1);
          ctx.lineTo(11, 10);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "rgba(246, 247, 249, 0.9)";
          ctx.fillRect(-7.5, 5, 3, 3);
          ctx.fillRect(-1.5, 5, 3, 3);
          ctx.fillRect(4.5, 5, 3, 3);
        } else {
          ctx.lineWidth = 1.9;
          ctx.beginPath();
          ctx.ellipse(0, -8, 10, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.rect(-10, -8, 20, 17);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(0, 9, 10, 4, 0, 0, Math.PI);
          ctx.stroke();

          ctx.strokeStyle = "rgba(246, 247, 249, 0.8)";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(-6, -2);
          ctx.lineTo(6, -2);
          ctx.moveTo(-6, 4);
          ctx.lineTo(6, 4);
          ctx.stroke();
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        return ctx.getImageData(0, 0, size, size);
      };

      map.addImage("facility-port", makeFacilityIcon("port", facilityColor.port));
      map.addImage("facility-refinery", makeFacilityIcon("refinery", facilityColor.refinery));
      map.addImage("facility-spr", makeFacilityIcon("spr", facilityColor.spr));

      map.addLayer({
        id: "facilities-halo",
        type: "circle",
        source: "facilities",
        paint: {
          "circle-radius": 11,
          "circle-color": ["match", ["get", "type"], "refinery", facilityColor.refinery, "spr", facilityColor.spr, facilityColor.port],
          "circle-opacity": 0.12,
        },
      });

      map.addLayer({
        id: "facilities-symbol",
        type: "symbol",
        source: "facilities",
        layout: {
          "icon-image": ["match", ["get", "type"], "refinery", "facility-refinery", "spr", "facility-spr", "facility-port"],
          "icon-size": 0.78,
          "icon-allow-overlap": true,
        },
      });

      const makeShipIcon = (color: string, kind: "tanker" | "vessel" = "vessel") => {
        const size = kind === "tanker" ? 72 : 48;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;

        ctx.translate(size / 2, size / 2);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.shadowColor = "rgba(5, 8, 12, 0.9)";
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;

        const drawHullPath = (width: number, bowY: number, sternY: number, sternInset: number) => {
          ctx.beginPath();
          ctx.moveTo(0, bowY);
          ctx.bezierCurveTo(width * 0.56, bowY + 4, width * 0.62, -5, width * 0.5, sternY - 5);
          ctx.lineTo(sternInset, sternY);
          ctx.lineTo(-sternInset, sternY);
          ctx.lineTo(-width * 0.5, sternY - 5);
          ctx.bezierCurveTo(-width * 0.62, -5, -width * 0.56, bowY + 4, 0, bowY);
          ctx.closePath();
        };

        if (kind === "tanker") {
          const alertTint = color === VESSEL_AFFECTED_COLOR || color === VESSEL_APPROACHING_COLOR;
          const outerHull = alertTint ? color : "#9D3431";
          drawHullPath(24, -31, 31, 7);
          ctx.fillStyle = outerHull;
          ctx.strokeStyle = "#F1E8D6";
          ctx.lineWidth = 2.2;
          ctx.fill();
          ctx.stroke();

          ctx.shadowBlur = 0;
          drawHullPath(18.5, -26, 26, 5.5);
          ctx.fillStyle = "#2A2927";
          ctx.globalAlpha = 0.92;
          ctx.fill();
          ctx.globalAlpha = 1;

          ctx.fillStyle = "#D9B35B";
          ctx.strokeStyle = "rgba(7, 16, 24, 0.65)";
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.roundRect(-7.5, -27, 15, 8, 1.5);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "rgba(246, 247, 249, 0.9)";
          ctx.fillRect(-1.2, -33, 2.4, 9);

          const containerColors = ["#C49A3A", "#3FA796", "#2D7D9A", "#B84C4C", "#6A7077"];
          for (let row = 0; row < 4; row += 1) {
            for (let col = 0; col < 10; col += 1) {
              const x = -8.4 + row * 5.6;
              const y = -16 + col * 4.2;
              ctx.fillStyle = containerColors[(row * 2 + col) % containerColors.length];
              ctx.fillRect(x, y, 4.5, 3.1);
              ctx.strokeRect(x, y, 4.5, 3.1);
            }
          }

          ctx.strokeStyle = "rgba(246, 247, 249, 0.55)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-10.8, -23);
          ctx.lineTo(-10.8, 23);
          ctx.moveTo(10.8, -23);
          ctx.lineTo(10.8, 23);
          ctx.stroke();
        } else {
          const accent = color === VESSEL_OTHER_COLOR || color === VESSEL_STALE_COLOR ? "#D8D2C4" : color;
          drawHullPath(22, -21, 21, 6);
          ctx.fillStyle = "#F4EFE5";
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2.4;
          ctx.fill();
          ctx.stroke();

          ctx.shadowBlur = 0;
          drawHullPath(15.5, -15.5, 15.5, 4.5);
          ctx.fillStyle = "#FFFDF7";
          ctx.fill();

          ctx.fillStyle = "#D8C59E";
          ctx.strokeStyle = "rgba(7, 16, 24, 0.28)";
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.roundRect(-5, -1, 10, 10.5, 3.5);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "#26323A";
          ctx.beginPath();
          ctx.roundRect(-5.5, -9.2, 11, 5.5, 2.8);
          ctx.fill();
          ctx.fillStyle = "rgba(94, 201, 255, 0.55)";
          ctx.fillRect(-4.1, -8.1, 8.2, 1.8);

          ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
          ctx.beginPath();
          ctx.arc(-4, 5, 2.4, 0, Math.PI * 2);
          ctx.arc(3, 3, 1.8, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "rgba(7, 16, 24, 0.45)";
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(0, -22);
          ctx.lineTo(0, -16);
          ctx.moveTo(-8, 16);
          ctx.lineTo(8, 16);
          ctx.stroke();
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        return ctx.getImageData(0, 0, size, size);
      };
      map.addImage("vessel-tanker", makeShipIcon(VESSEL_TANKER_COLOR, "tanker"));
      map.addImage("vessel-other", makeShipIcon(VESSEL_OTHER_COLOR, "vessel"));
      map.addImage("vessel-stale", makeShipIcon(VESSEL_STALE_COLOR, "vessel"));
      map.addImage("vessel-affected", makeShipIcon(VESSEL_AFFECTED_COLOR, "tanker"));
      map.addImage("vessel-approaching", makeShipIcon(VESSEL_APPROACHING_COLOR, "vessel"));

      map.addSource("apo-routes", { type: "geojson", data: apoRoutesToGeoJSON([]) });
      map.addLayer({
        id: "apo-routes-glow",
        type: "line",
        source: "apo-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 10, "line-opacity": 0.22, "line-blur": 1 },
      });
      map.addLayer({
        id: "apo-routes-line",
        type: "line",
        source: "apo-routes",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 2, 3, 5, 5],
          "line-opacity": 1,
          "line-dasharray": ["case", ["get", "blocked"], ["literal", [1.2, 0.9]], ["==", ["get", "rank"], 1], ["literal", [1, 0]], ["literal", [2.2, 1.1]]],
        },
      });
      map.addSource("apo-route-labels", { type: "geojson", data: apoRouteLabelsToGeoJSON([]) });
      map.addLayer({
        id: "apo-route-labels",
        type: "symbol",
        source: "apo-route-labels",
        layout: { "text-field": ["get", "label"], "text-size": 11, "text-font": ["Noto Sans Regular"], "text-anchor": "center", "text-allow-overlap": false },
        paint: { "text-color": ["get", "color"], "text-halo-color": "#0B0F14", "text-halo-width": 1.6 },
      });

      map.addSource("vessels", { type: "geojson", data: vesselsToGeoJSON([]) });
      map.addSource("affected-vessels", { type: "geojson", data: vesselsToGeoJSON([]) });

      map.addLayer({
        id: "vessels-affected",
        type: "circle",
        source: "affected-vessels",
        paint: {
          "circle-radius": 14,
          "circle-color": VESSEL_AFFECTED_COLOR,
          "circle-opacity": 0.22,
          "circle-stroke-color": VESSEL_AFFECTED_COLOR,
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 0.85,
        },
      });

      map.addLayer({
        id: "vessels-symbol",
        type: "symbol",
        source: "vessels",
        layout: {
          "icon-image": [
            "case",
            ["get", "isAffected"], "vessel-affected",
            ["get", "isApproaching"], "vessel-approaching",
            ["get", "isStale"], "vessel-stale",
            ["get", "isTanker"], "vessel-tanker",
            "vessel-other",
          ],
          "icon-size": 0.62,
          "icon-rotate": ["get", "rotation"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
        },
      });

      // ---- Draft polygon (custom draw, replaces mapbox-gl-draw) ----
      map.addSource("draft-zone-fill", { type: "geojson", data: emptyFC });
      map.addSource("draft-zone-line", { type: "geojson", data: emptyFC });
      map.addSource("draft-zone-points", { type: "geojson", data: emptyFC });

      map.addLayer({
        id: "draft-zone-fill",
        type: "fill",
        source: "draft-zone-fill",
        paint: { "fill-color": DRAFT_COLOR, "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "draft-zone-line",
        type: "line",
        source: "draft-zone-line",
        paint: { "line-color": DRAFT_COLOR, "line-width": 2, "line-dasharray": [2, 1.5] },
      });
      map.addLayer({
        id: "draft-zone-points",
        type: "circle",
        source: "draft-zone-points",
        paint: {
          "circle-radius": ["case", ["get", "isFirst"], 6, 4],
          "circle-color": DRAFT_COLOR,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#0B0F14",
        },
      });

      // ---- Popups ----
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "aegis-popup" });

      const bindPopup = (layerId: string, html: (props: any) => string) => {
        map.on("mouseenter", layerId, (e) => {
          if (!interactionRef.current.interactive || interactionRef.current.backgroundMode) return;
          if (draftPointsRef.current.length > 0) return;
          map.getCanvas().style.cursor = "pointer";
          const feature = e.features?.[0];
          if (!feature) return;
          const coords =
            feature.geometry.type === "Point"
              ? (feature.geometry.coordinates.slice() as [number, number])
              : e.lngLat;
          popup.setLngLat(coords).setHTML(html(feature.properties)).addTo(map);
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });
      };

      bindPopup("facilities-symbol", (p) => {
        const type = String(p.type || "port") as FacilityType;
        const color = facilityColor[type] ?? facilityColor.port;
        const status = facilityStatus[type] ?? facilityStatus.port;
        return `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;min-width:170px">
          <div style="font-weight:600;color:#F6F7F9;margin-bottom:4px">${escapeHtml(p.name)}</div>
          <div style="display:flex;align-items:center;gap:6px;color:#8A96A3">
            <span style="width:7px;height:7px;border-radius:999px;background:${color};display:inline-block"></span>
            ${escapeHtml(status)}
          </div>
        </div>`;
      });

      bindPopup("corridors-line", (p) => `<div style="font-family:'JetBrains Mono',monospace;font-size:11px">
        <div style="font-weight:600;color:#F6F7F9;margin-bottom:2px">${escapeHtml(p.name)}</div>
        <div style="color:#8A96A3">risk score <span style="color:#E7ECEF">${p.risk}</span>/100</div>
      </div>`);

      bindPopup("apo-routes-line", (p) => '<div style="font-family:\'JetBrains Mono\',monospace;font-size:11px;min-width:210px">' +
        '<div style="font-weight:600;color:#F6F7F9;margin-bottom:4px">APO route #' + escapeHtml(p.rank) + ' · ' + escapeHtml(p.supplierName) + '</div>' +
        '<div style="color:#8A96A3;margin-bottom:3px">' + escapeHtml(p.route) + '</div>' +
        '<div style="color:#8A96A3;margin-bottom:3px">Status <span style="color:#E7ECEF">' + escapeHtml(p.status) + '</span></div>' +
        '<div style="color:#8A96A3">Transit <span style="color:#E7ECEF">' + escapeHtml(p.transitDays) + 'd</span> · Risk <span style="color:#E7ECEF">' + escapeHtml(p.routeRiskScore) + '/100</span></div>' +
        '<div style="color:#8A96A3">Cost <span style="color:#E7ECEF">USD ' + Number(p.landedCostPerBarrel ?? 0).toFixed(2) + '/bbl</span></div>' +
      '</div>');

      bindPopup("vessels-symbol", (p) => `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;min-width:160px">
        <div style="font-weight:600;color:#F6F7F9;margin-bottom:4px">${escapeHtml(p.name)}</div>
        <div style="color:#8A96A3">MMSI <span style="color:#E7ECEF">${escapeHtml(p.mmsi)}</span></div>
        <div style="color:#8A96A3">${p.isTanker ? "Tanker" : "Other vessel"}</div>
        <div style="color:#8A96A3">Speed <span style="color:#E7ECEF">${formatNumber(p.sog, 1, " kn")}</span></div>
        <div style="color:#8A96A3">Course <span style="color:#E7ECEF">${formatNumber(p.cog, 1, "°")}</span></div>
      </div>`);

      map.on("click", "vessels-symbol", (e) => {
        if (!interactionRef.current.interactive || interactionRef.current.backgroundMode) return;
        if (draftPointsRef.current.length > 0) return;
        const props = e.features?.[0]?.properties;
        if (!props) return;
        setSelectedVessel({
          mmsi: Number(props.mmsi),
          name: String(props.name || "Unknown vessel"),
          lat: Number(props.lat),
          lon: Number(props.lon),
          sog: toNumber(props.sog),
          cog: toNumber(props.cog),
          heading: toNumber(props.heading),
          type: toNumber(props.type),
          callSign: props.callSign ? String(props.callSign) : undefined,
          destination: props.destination ? String(props.destination) : undefined,
          imoNumber: toNumber(props.imoNumber),
          draught: toNumber(props.draught),
          isTanker: toBoolean(props.isTanker),
          lastUpdate: Number(props.lastUpdate),
        });
        setInspectorOpen(true);
      });

      loadedRef.current = true;
      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!interactive || backgroundMode) {
      draftPointsRef.current = [];
      return;
    }

    if (interactive && !backgroundMode && !navControlRef.current) {
      const control = new maplibregl.NavigationControl();
      map.addControl(control, "top-right");
      navControlRef.current = control;
    }

    if ((!interactive || backgroundMode) && navControlRef.current) {
      map.removeControl(navControlRef.current);
      navControlRef.current = null;
    }
  }, [backgroundMode, interactive, mapReady]);

  // ---- Custom draw interaction ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const updateDraftSource = () => {
      const pts = draftPointsRef.current;
      const pointSource = map.getSource("draft-zone-points") as maplibregl.GeoJSONSource | undefined;
      const lineSource = map.getSource("draft-zone-line") as maplibregl.GeoJSONSource | undefined;
      const fillSource = map.getSource("draft-zone-fill") as maplibregl.GeoJSONSource | undefined;

      pointSource?.setData({
        type: "FeatureCollection",
        features: pts.map((pt, i) => ({
          type: "Feature",
          properties: { isFirst: i === 0 },
          geometry: { type: "Point", coordinates: pt },
        })),
      });
      lineSource?.setData(
        pts.length >= 2
          ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts } }] }
          : emptyFC
      );
      fillSource?.setData(
        pts.length >= 3
          ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...pts, pts[0]]] } }] }
          : emptyFC
      );
    };

    const dedupeClose = (pts: [number, number][]): number[][] => {
      const out: [number, number][] = [];
      for (const pt of pts) {
        const prev = out[out.length - 1];
        if (!prev) {
          out.push(pt);
          continue;
        }
        const a = map.project(prev);
        const b = map.project(pt);
        if (Math.hypot(a.x - b.x, a.y - b.y) > DEDUPE_PX) out.push(pt);
      }
      return out;
    };

    const finalizeDraft = () => {
      const pts = dedupeClose(draftPointsRef.current);
      draftPointsRef.current = [];
      updateDraftSource();
      if (pts.length >= 3) interactionRef.current.onZoneDrawn(pts);
    };

    const cancelDraft = () => {
      draftPointsRef.current = [];
      updateDraftSource();
    };

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const pts = draftPointsRef.current;
      if (pts.length >= 3) {
        const first = map.project(pts[0] as [number, number]);
        const clicked = map.project(e.lngLat);
        if (Math.hypot(first.x - clicked.x, first.y - clicked.y) <= CLOSE_VERTEX_PX) {
          finalizeDraft();
          return;
        }
      }
      draftPointsRef.current = [...pts, [e.lngLat.lng, e.lngLat.lat]];
      updateDraftSource();
    };

    const handleDblClick = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      if (draftPointsRef.current.length >= 3) finalizeDraft();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelDraft();
    };

    if (isDrawing) {
      map.getCanvas().style.cursor = "crosshair";
      map.doubleClickZoom.disable();
      map.on("click", handleClick);
      map.on("dblclick", handleDblClick);
      window.addEventListener("keydown", handleKeyDown);
    } else {
      cancelDraft();
      map.getCanvas().style.cursor = "";
      map.doubleClickZoom.enable();
    }

    return () => {
      map.off("click", handleClick);
      map.off("dblclick", handleDblClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [backgroundMode, interactive, isDrawing, mapReady]);

  // ---- Tension zone layers ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const activeZoneIds = new Set(zones.map((zone) => zone.id));
    zones.forEach((zone) => {
      const sourceId = `tension-zone-source-${zone.id}`;
      const fillLayerId = `tension-zone-${zone.id}`;
      const strokeLayerId = `tension-zone-stroke-${zone.id}`;
      const data = zonesToGeoJSON([zone]);

      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, { type: "geojson", data });
        map.addLayer(
          { id: fillLayerId, type: "fill", source: sourceId, paint: { "fill-color": VESSEL_AFFECTED_COLOR, "fill-opacity": zone.tensionPct / 300 } },
          "facilities-halo"
        );
        map.addLayer(
          { id: strokeLayerId, type: "line", source: sourceId, paint: { "line-color": VESSEL_AFFECTED_COLOR, "line-width": 2, "line-opacity": 1 } },
          "facilities-halo"
        );
        return;
      }

      (map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined)?.setData(data);
      map.setPaintProperty(fillLayerId, "fill-opacity", zone.tensionPct / 300);
    });

    const style = map.getStyle();
    style.layers
      .filter((layer) => layer.id.startsWith("tension-zone-"))
      .forEach((layer) => {
        const zoneId = layer.id.replace("tension-zone-stroke-", "").replace("tension-zone-", "");
        if (!activeZoneIds.has(zoneId) && map.getLayer(layer.id)) map.removeLayer(layer.id);
      });

    Object.keys(style.sources)
      .filter((sourceId) => sourceId.startsWith("tension-zone-source-"))
      .forEach((sourceId) => {
        const zoneId = sourceId.replace("tension-zone-source-", "");
        if (!activeZoneIds.has(zoneId) && map.getSource(sourceId)) map.removeSource(sourceId);
      });
  }, [mapReady, zones]);

  // ---- Erase tension zone interaction ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !interactive || backgroundMode || !isEraseMode) return;

    const zoneLayerIds = () =>
      zones
        .map((zone) => `tension-zone-${zone.id}`)
        .filter((layerId) => Boolean(map.getLayer(layerId)));

    const findZoneIdAtPoint = (point: maplibregl.PointLike) => {
      const layers = zoneLayerIds();
      if (layers.length === 0) return null;
      const feature = map.queryRenderedFeatures(point, { layers }).find((candidate) => candidate.properties?.id);
      return feature?.properties?.id ? String(feature.properties.id) : null;
    };

    const handleEraseClick = (event: maplibregl.MapMouseEvent) => {
      const { isEraseMode: eraseActive, onZoneErase: eraseZone } = interactionRef.current;
      if (!eraseActive || !eraseZone || isDrawing || draftPointsRef.current.length > 0) return;
      const zoneId = findZoneIdAtPoint(event.point);
      if (!zoneId) return;
      event.preventDefault();
      eraseZone(zoneId);
    };

    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      const eraseActive = interactionRef.current.isEraseMode && !isDrawing;
      if (!eraseActive) {
        map.getCanvas().style.cursor = "";
        return;
      }
      map.getCanvas().style.cursor = findZoneIdAtPoint(event.point) ? "not-allowed" : "crosshair";
    };

    map.on("click", handleEraseClick);
    map.on("mousemove", handleMouseMove);

    return () => {
      map.off("click", handleEraseClick);
      map.off("mousemove", handleMouseMove);
      if (interactionRef.current.isEraseMode) map.getCanvas().style.cursor = "";
    };
  }, [backgroundMode, interactive, isDrawing, isEraseMode, mapReady, zones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const routeSource = map.getSource("apo-routes") as maplibregl.GeoJSONSource | undefined;
    const labelSource = map.getSource("apo-route-labels") as maplibregl.GeoJSONSource | undefined;
    routeSource?.setData(apoRoutesToGeoJSON(apoRouteOptions, zones));
    labelSource?.setData(apoRouteLabelsToGeoJSON(apoRouteOptions, zones));
  }, [apoRouteOptions, mapReady, zones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("vessels") as maplibregl.GeoJSONSource | undefined;
    const affectedSource = map.getSource("affected-vessels") as maplibregl.GeoJSONSource | undefined;
    source?.setData(vesselsToGeoJSON(vessels, now, affectedVessels, zones));
    affectedSource?.setData(affectedVesselsToGeoJSON(vessels, now, affectedVessels, zones));
  }, [affectedVessels, mapReady, now, vessels, zones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let expanded = false;
    const intervalId = window.setInterval(() => {
      if (!map.getLayer("vessels-affected")) return;
      expanded = !expanded;
      map.setPaintProperty("vessels-affected", "circle-radius", expanded ? 18 : 12);
      map.setPaintProperty("vessels-affected", "circle-opacity", expanded ? 0.12 : 0.28);
    }, 700);
    return () => window.clearInterval(intervalId);
  }, [mapReady]);

  useEffect(() => {
    if (!selectedVessel) return;
    const latestSelected = vessels.find((vessel) => vessel.mmsi === selectedVessel.mmsi);
    if (!latestSelected) {
      setSelectedVessel(null);
      return;
    }
    setSelectedVessel(vesselToDetails(latestSelected));
  }, [selectedVessel?.mmsi, vessels]);

  const renderableApoRouteCount = getRenderableApoRoutes(apoRouteOptions, zones).length;
  const hiddenApoRouteCount = Math.max(0, apoRouteOptions.length - renderableApoRouteCount);
  const meta = statusMeta[status];

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-base ${
        backgroundMode ? "" : "rounded-lg border border-border"
      } ${className}`}
    >
      <div ref={containerRef} className={`h-full w-full ${backgroundMode ? "pointer-events-none" : ""}`} />

      {backgroundMode && <div className="pointer-events-none absolute inset-0 z-10 bg-base/70" />}

      {!mapReady && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-base">
          <div className="flex items-center gap-3 font-mono text-xs text-muted">
            <span className="h-2 w-2 animate-pulseDot rounded-full bg-amber" />
            LOADING MARITIME LAYER…
          </div>
        </div>
      )}

      {interactive && !backgroundMode && isDrawing && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-amber/40 bg-surface/95 px-4 py-1.5 font-mono text-[11px] text-amber shadow-lg backdrop-blur">
          Click to place points · click first point or double-click to finish · Esc to cancel
        </div>
      )}

      {interactive && !backgroundMode && isEraseMode && !isDrawing && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-safe/40 bg-surface/95 px-4 py-1.5 font-mono text-[11px] text-safe shadow-lg backdrop-blur">
          Erase mode on · click a disruption zone to remove it
        </div>
      )}

      {interactive && !backgroundMode && apoRouteOptions.length > 0 && renderableApoRouteCount === 0 && (
        <div className="pointer-events-none absolute left-1/2 top-14 z-20 max-w-md -translate-x-1/2 rounded-md border border-risk/60 bg-surface/95 px-4 py-2 font-mono text-[11px] text-risk shadow-lg backdrop-blur">
          APO routes hidden: all current options cross an active disruption zone. Re-run APO after backend restart for fresh feasible reroutes.
        </div>
      )}

      {/* Inspector: connection + fleet counts + selected vessel */}
      {interactive && !backgroundMode && (
      <div className={`pointer-events-auto absolute left-3 top-3 z-20 max-h-[calc(100%-7rem)] overflow-hidden rounded-md border border-border bg-surface/95 font-mono text-[11px] text-muted shadow-lg backdrop-blur ${compact ? "w-14" : "w-80 max-w-[calc(100%-1.5rem)]"}`}>
        <button
          type="button"
          onClick={() => setInspectorOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5"
        >
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${status === "live" ? "animate-pulseDot" : ""}`} />
            {!compact && <span className={`text-xs font-semibold tracking-wider ${meta.text}`}>{meta.label}</span>}
          </div>
          <span className="text-muted">{inspectorOpen ? "▾" : "▸"}</span>
        </button>

        {inspectorOpen && !compact && (
          <div className="max-h-[calc(100vh-14rem)] overflow-y-auto border-t border-border/80 px-3 pb-3 pt-2.5">
            <div className="mb-2 text-[10px] text-muted">Last update: {latestUpdate ? formatLastUpdate(latestUpdate) : "waiting"}</div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded border border-border/80 bg-base/70 px-2 py-2">
                <div>Ships</div>
                <div className="text-lg font-semibold text-ink">{vessels.length}</div>
              </div>
              <div className="rounded border border-border/80 bg-base/70 px-2 py-2">
                <div>Tankers</div>
                <div className="text-lg font-semibold" style={{ color: VESSEL_TANKER_COLOR }}>
                  {tankerCount}
                </div>
              </div>
              <div className="rounded border border-border/80 bg-base/70 px-2 py-2">
                <div>Other</div>
                <div className="text-lg font-semibold text-ink">{otherVesselCount}</div>
              </div>
            </div>

          </div>
        )}
      </div>
      )}

      {interactive && !backgroundMode && selectedVessel && !compact && (
        <div className="pointer-events-auto absolute left-3 top-[10.5rem] z-20 w-80 max-w-[calc(100%-1.5rem)] rounded-md border border-border bg-surface/95 p-3 font-mono text-[11px] text-muted shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted">Selected ship</div>
              <div className="mt-1 max-w-56 break-words text-sm font-semibold leading-snug text-ink">{selectedVessel.name}</div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded border border-border px-2 py-1 text-[10px] uppercase tracking-wider text-muted transition-colors hover:border-amber hover:text-amber"
              onClick={() => setSelectedVessel(null)}
            >
              Clear
            </button>
          </div>
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded border border-border/70 bg-base/50 p-2">
            <span>Class</span>
            <span className="min-w-0 break-words text-right text-ink">{selectedVessel.isTanker ? "Tanker" : "Other vessel"}</span>
            <span>MMSI</span>
            <span className="min-w-0 break-words text-right text-ink">{selectedVessel.mmsi}</span>
            <span>Speed</span>
            <span className="min-w-0 break-words text-right text-ink">{formatNumber(selectedVessel.sog, 1, " kn")}</span>
            <span>Course</span>
            <span className="min-w-0 break-words text-right text-ink">{formatNumber(selectedVessel.cog, 1, "°")}</span>
            <span>Destination</span>
            <span className="min-w-0 break-words text-right text-ink">{selectedVessel.destination || "n/a"}</span>
            <span>Updated</span>
            <span className="min-w-0 break-words text-right text-ink">{formatLastUpdate(selectedVessel.lastUpdate)}</span>
          </div>
        </div>
      )}

      {/* Legend chip */}
      {interactive && !backgroundMode && (
      <div className={`pointer-events-auto absolute bottom-3 left-3 z-20 overflow-hidden rounded-md border border-border bg-surface/90 font-mono text-[10px] text-muted backdrop-blur ${compact ? "max-w-14" : ""}`}>
        {legendOpen && !compact && (
          <div className="flex flex-col gap-1.5 border-t border-border/80 px-3 pb-3 pt-2">
            <LegendRow color="#D64545" label="High-risk corridor" />
            <LegendRow color={facilityColor.refinery} label="Refinery" />
            <LegendRow color={facilityColor.spr} label="Strategic reserve" />
            <LegendRow color={facilityColor.port} label="Port" />
            <LegendRow color={VESSEL_TANKER_COLOR} label="Tanker" />
            <LegendRow color={VESSEL_OTHER_COLOR} label="Other vessel" />
            <LegendRow color={VESSEL_STALE_COLOR} label="Stale (>10min)" />
            <LegendRow color={VESSEL_AFFECTED_COLOR} label="In tension zone" />
            <LegendRow color={VESSEL_APPROACHING_COLOR} label="Approaching zone" />
            {renderableApoRouteCount > 0 && <LegendRow color={APO_ROUTE_COLORS[0]} label="APO route #1" />}
            {renderableApoRouteCount > 1 && <LegendRow color={APO_ROUTE_COLORS[1]} label="APO route #2" />}
            {hiddenApoRouteCount > 0 && <LegendRow color={VESSEL_AFFECTED_COLOR} label={`${hiddenApoRouteCount} blocked APO route${hiddenApoRouteCount === 1 ? "" : "s"}`} />}
          </div>
        )}
      </div>
      )}
    </div>
  );
  }
);

const LegendRow = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-2">
    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
    {label}
  </div>
);

export default VesselMap;
