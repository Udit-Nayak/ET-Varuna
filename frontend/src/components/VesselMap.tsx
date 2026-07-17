import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { corridors } from "../data/corridors";
import { indiaFacilities, FacilityType } from "../data/indiaPorts";
import { TensionZone } from "../hooks/useSimulation";
import { Vessel, StreamStatus } from "../hooks/useVesselStream";
import { bearingBetween, distanceBetween, getPolygonCenter, isHeadingToward } from "../utils/geo";

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
  features: corridors.map((corridor) => ({
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
  isDrawing: boolean;
  status: StreamStatus;
  onZoneDrawn: (coordinates: number[][]) => void;
}

const statusMeta: Record<StreamStatus, { label: string; dot: string; text: string }> = {
  connecting: { label: "CONNECTING", dot: "bg-muted", text: "text-muted" },
  live: { label: "LIVE", dot: "bg-safe", text: "text-safe" },
  reconnecting: { label: "RECONNECTING", dot: "bg-amber", text: "text-amber" },
  offline: { label: "OFFLINE", dot: "bg-risk", text: "text-risk" },
};

const VesselMap = ({ vessels, zones, affectedVessels, isDrawing, status, onZoneDrawn }: VesselMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
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
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("corridors", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: corridors.map((c) => ({
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

      map.addLayer({
        id: "facilities-halo",
        type: "circle",
        source: "facilities",
        paint: {
          "circle-radius": 10,
          "circle-color": ["match", ["get", "type"], "refinery", facilityColor.refinery, "spr", facilityColor.spr, facilityColor.port],
          "circle-opacity": 0.16,
        },
      });

      map.addLayer({
        id: "facilities-circle",
        type: "circle",
        source: "facilities",
        paint: {
          "circle-radius": 5,
          "circle-color": ["match", ["get", "type"], "refinery", facilityColor.refinery, "spr", facilityColor.spr, facilityColor.port],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#0B0F14",
        },
      });

      const makeTriangle = (color: string) => {
        const size = 22;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        ctx.shadowColor = color;
        ctx.shadowBlur = 4;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(size / 2, 1);
        ctx.lineTo(size - 1, size - 1);
        ctx.lineTo(size / 2, size * 0.7);
        ctx.lineTo(1, size - 1);
        ctx.closePath();
        ctx.fill();
        return ctx.getImageData(0, 0, size, size);
      };
      map.addImage("vessel-tanker", makeTriangle(VESSEL_TANKER_COLOR));
      map.addImage("vessel-other", makeTriangle(VESSEL_OTHER_COLOR));
      map.addImage("vessel-stale", makeTriangle(VESSEL_STALE_COLOR));
      map.addImage("vessel-affected", makeTriangle(VESSEL_AFFECTED_COLOR));
      map.addImage("vessel-approaching", makeTriangle(VESSEL_APPROACHING_COLOR));

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
          "icon-size": 0.85,
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

      bindPopup("facilities-circle", (p) => {
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

      bindPopup("vessels-symbol", (p) => `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;min-width:160px">
        <div style="font-weight:600;color:#F6F7F9;margin-bottom:4px">${escapeHtml(p.name)}</div>
        <div style="color:#8A96A3">MMSI <span style="color:#E7ECEF">${escapeHtml(p.mmsi)}</span></div>
        <div style="color:#8A96A3">${p.isTanker ? "Tanker" : "Other vessel"}</div>
        <div style="color:#8A96A3">Speed <span style="color:#E7ECEF">${formatNumber(p.sog, 1, " kn")}</span></div>
        <div style="color:#8A96A3">Course <span style="color:#E7ECEF">${formatNumber(p.cog, 1, "°")}</span></div>
      </div>`);

      map.on("click", "vessels-symbol", (e) => {
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
      if (pts.length >= 3) onZoneDrawn(pts);
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
  }, [isDrawing, mapReady, onZoneDrawn]);

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

  const meta = statusMeta[status];

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-border bg-base">
      <div ref={containerRef} className="h-full w-full" />

      {!mapReady && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-base">
          <div className="flex items-center gap-3 font-mono text-xs text-muted">
            <span className="h-2 w-2 animate-pulseDot rounded-full bg-amber" />
            LOADING MARITIME LAYER…
          </div>
        </div>
      )}

      {isDrawing && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-amber/40 bg-surface/95 px-4 py-1.5 font-mono text-[11px] text-amber shadow-lg backdrop-blur">
          Click to place points · click first point or double-click to finish · Esc to cancel
        </div>
      )}

      {/* Inspector: connection + fleet counts + selected vessel */}
      <div className="pointer-events-auto absolute left-3 top-3 z-10 w-72 overflow-hidden rounded-md border border-border bg-surface/95 font-mono text-[11px] text-muted shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() => setInspectorOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5"
        >
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${status === "live" ? "animate-pulseDot" : ""}`} />
            <span className={`text-xs font-semibold tracking-wider ${meta.text}`}>{meta.label}</span>
          </div>
          <span className="text-muted">{inspectorOpen ? "▾" : "▸"}</span>
        </button>

        {inspectorOpen && (
          <div className="border-t border-border/80 px-3 pb-3 pt-2.5">
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

            <div className="mt-3 border-t border-border/80 pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-ink">Selected vessel</div>
                {selectedVessel && (
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-[10px] text-muted transition-colors hover:border-amber hover:text-amber"
                    onClick={() => setSelectedVessel(null)}
                  >
                    Clear
                  </button>
                )}
              </div>

              {selectedVessel ? (
                <div className="space-y-1">
                  <div className="truncate text-sm font-semibold text-ink">{selectedVessel.name}</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <span>MMSI</span>
                    <span className="text-right text-ink">{selectedVessel.mmsi}</span>
                    <span>Class</span>
                    <span className="text-right text-ink">{selectedVessel.isTanker ? "Tanker" : "Other vessel"}</span>
                    <span>Speed</span>
                    <span className="text-right text-ink">{formatNumber(selectedVessel.sog, 1, " kn")}</span>
                    <span>Course</span>
                    <span className="text-right text-ink">{formatNumber(selectedVessel.cog, 1, "°")}</span>
                    <span>Destination</span>
                    <span className="truncate text-right text-ink">{selectedVessel.destination || "n/a"}</span>
                    <span>Updated</span>
                    <span className="text-right text-ink">{formatLastUpdate(selectedVessel.lastUpdate)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-ink/60">Click a vessel on the map</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend chip */}
      <div className="pointer-events-auto absolute bottom-3 left-3 z-10 overflow-hidden rounded-md border border-border bg-surface/90 font-mono text-[10px] text-muted backdrop-blur">
        <button type="button" onClick={() => setLegendOpen((v) => !v)} className="flex items-center gap-2 px-3 py-2">
          <span>LEGEND</span>
          <span>{legendOpen ? "▾" : "▸"}</span>
        </button>
        {legendOpen && (
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
          </div>
        )}
      </div>
    </div>
  );
};

const LegendRow = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-2">
    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
    {label}
  </div>
);

export default VesselMap;