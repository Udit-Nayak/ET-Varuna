import { useEffect, useMemo, useRef, useState } from "react";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { corridors } from "../data/corridors";
import { indiaFacilities, FacilityType } from "../data/indiaPorts";
import { TensionZone } from "../hooks/useSimulation";
import { Vessel } from "../hooks/useVesselStream";
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
  return numeric === undefined ? "n/a" : `${numeric.toFixed(digits)}${suffix}`;
};

const formatLastUpdate = (value: unknown) => {
  const numeric = toNumber(value);
  if (numeric === undefined) return "n/a";
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

interface VesselMapProps {
  vessels: Vessel[];
  zones: TensionZone[];
  affectedVessels: number[];
  isDrawing: boolean;
  onZoneDrawn: (coordinates: number[][]) => void;
}

const VesselMap = ({ vessels, zones, affectedVessels, isDrawing, onZoneDrawn }: VesselMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const loadedRef = useRef(false);
  const [selectedVessel, setSelectedVessel] = useState<SelectedVesselDetails | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
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
    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
    });
    drawRef.current = draw;
    map.addControl(draw as unknown as maplibregl.IControl);

    map.on("load", () => {
      // ---- Corridor lines ----
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
          "line-color": [
            "case",
            [">=", ["get", "risk"], 65], "#D64545",
            [">=", ["get", "risk"], 35], "#E8A33D",
            "#3FA796",
          ],
          "line-opacity": 0.15,
          "line-blur": 2,
        },
      });

      map.addLayer({
        id: "corridors-line",
        type: "line",
        source: "corridors",
        paint: {
          "line-width": 4,
          "line-color": [
            "case",
            [">=", ["get", "risk"], 65], "#D64545",
            [">=", ["get", "risk"], 35], "#E8A33D",
            "#3FA796",
          ],
          "line-opacity": 0.85,
        },
      });

      map.addSource("corridor-labels", {
        type: "geojson",
        data: corridorLabelsToGeoJSON(),
      });

      map.addLayer({
        id: "corridor-labels",
        type: "symbol",
        source: "corridor-labels",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-anchor": "center",
          "text-offset": [0, -1],
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#FFFFFF",
          "text-halo-color": "#0B0F14",
          "text-halo-width": 2,
          "text-halo-blur": 1,
        },
      });

      // ---- Facility points ----
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
        id: "facilities-circle",
        type: "circle",
        source: "facilities",
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "match",
            ["get", "type"],
            "refinery", facilityColor.refinery,
            "spr", facilityColor.spr,
            facilityColor.port,
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0B0F14",
        },
      });

      // ---- Vessel triangle icon (drawn on a canvas, registered as a map image) ----
      // ---- Vessel triangle icons: blue for tankers, gray for everything else ----
      const makeTriangle = (color: string) => {
        const size = 20;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(size / 2, 0);
        ctx.lineTo(size, size);
        ctx.lineTo(size / 2, size * 0.72);
        ctx.lineTo(0, size);
        ctx.closePath();
        ctx.fill();
        return ctx.getImageData(0, 0, size, size);
      };
      map.addImage("vessel-tanker", makeTriangle(VESSEL_TANKER_COLOR));
      map.addImage("vessel-other", makeTriangle(VESSEL_OTHER_COLOR));
      map.addImage("vessel-stale", makeTriangle(VESSEL_STALE_COLOR));
      map.addImage("vessel-affected", makeTriangle(VESSEL_AFFECTED_COLOR));
      map.addImage("vessel-approaching", makeTriangle(VESSEL_APPROACHING_COLOR));

      // ---- Vessel source + layer ----
      map.addSource("vessels", {
        type: "geojson",
        data: vesselsToGeoJSON([]),
      });

      map.addSource("affected-vessels", {
        type: "geojson",
        data: vesselsToGeoJSON([]),
      });

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
          "icon-size": 0.9,
          "icon-rotate": ["get", "rotation"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
        },
      });

      // ---- Popups ----
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });

      const bindPopup = (layerId: string, html: (props: any) => string) => {
        map.on("mouseenter", layerId, (e) => {
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

      bindPopup(
        "facilities-circle",
        (p) => {
          const type = String(p.type || "port") as FacilityType;
          const color = facilityColor[type] ?? facilityColor.port;
          const status = facilityStatus[type] ?? facilityStatus.port;

          return `<div style="font-family:monospace;font-size:12px;color:#0B0F14;min-width:170px"><strong>${escapeHtml(
            p.name
          )}</strong><br/><span style="display:inline-flex;align-items:center;gap:6px;margin-top:4px"><span style="width:8px;height:8px;border-radius:999px;background:${color};display:inline-block"></span>${escapeHtml(
            type
          )}</span><br/><span>${escapeHtml(status)}</span></div>`;
        }
      );
      bindPopup(
        "corridors-line",
        (p) =>
          `<div style="font-family:monospace;font-size:12px;color:#0B0F14"><strong>${p.name}</strong><br/>risk: ${p.risk}/100</div>`
      );
      bindPopup(
        "vessels-symbol",
        (p) =>
          `<div style="font-family:monospace;font-size:12px;color:#0B0F14;min-width:160px"><strong>${escapeHtml(
            p.name
          )}</strong><br/>MMSI ${escapeHtml(p.mmsi)}<br/>${
            p.isTanker ? "Tanker" : "Other vessel"
          }<br/>Speed ${formatNumber(p.sog, 1, " kn")}<br/>Course ${formatNumber(
            p.cog,
            1,
            " deg"
          )}</div>`
      );

      map.on("click", "vessels-symbol", (e) => {
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
      });

      map.on("draw.create", (event: any) => {
        const feature = event.features?.[0];
        const coordinates = feature?.geometry?.coordinates?.[0];
        if (Array.isArray(coordinates) && coordinates.length > 2) {
          onZoneDrawn(coordinates.slice(0, -1));
        }
        draw.deleteAll();
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
    const draw = drawRef.current;
    if (!map || !draw || !mapReady) return;

    map.getCanvas().style.cursor = isDrawing ? "crosshair" : "";
    if (isDrawing) {
      draw.changeMode("draw_polygon");
    } else {
      draw.changeMode("simple_select");
    }
  }, [isDrawing, mapReady]);

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
        map.addSource(sourceId, {
          type: "geojson",
          data,
        });
        map.addLayer(
          {
            id: fillLayerId,
            type: "fill",
            source: sourceId,
            paint: {
              "fill-color": VESSEL_AFFECTED_COLOR,
              "fill-opacity": zone.tensionPct / 300,
            },
          },
          "facilities-circle"
        );
        map.addLayer(
          {
            id: strokeLayerId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": VESSEL_AFFECTED_COLOR,
              "line-width": 2,
              "line-opacity": 1,
            },
          },
          "facilities-circle"
        );
        return;
      }

      const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      source?.setData(data);
      map.setPaintProperty(fillLayerId, "fill-opacity", zone.tensionPct / 300);
    });

    const style = map.getStyle();
    style.layers
      .filter((layer) => layer.id.startsWith("tension-zone-"))
      .forEach((layer) => {
        const zoneId = layer.id
          .replace("tension-zone-stroke-", "")
          .replace("tension-zone-", "");
        if (!activeZoneIds.has(zoneId) && map.getLayer(layer.id)) {
          map.removeLayer(layer.id);
        }
      });

    Object.keys(style.sources)
      .filter((sourceId) => sourceId.startsWith("tension-zone-source-"))
      .forEach((sourceId) => {
        const zoneId = sourceId.replace("tension-zone-source-", "");
        if (!activeZoneIds.has(zoneId) && map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      });
  }, [mapReady, zones]);

  // Push live vessel updates into the map source whenever they change
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

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-border">
      <div ref={containerRef} className="h-full w-full" />

      <div className="pointer-events-auto absolute left-3 right-14 top-3 z-10 rounded-md border border-border bg-surface/95 px-3 py-3 font-mono text-[11px] text-muted shadow-lg backdrop-blur sm:left-auto sm:w-72">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-ink">AIS Live</div>
            <div>Last update: {latestUpdate ? formatLastUpdate(latestUpdate) : "waiting"}</div>
          </div>
          <span className="mt-1 h-2 w-2 shrink-0 animate-pulseDot rounded-full bg-amber" />
        </div>

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
            <div className="text-xs font-semibold text-ink">Selected Vessel</div>
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
                <span className="text-right text-ink">
                  {selectedVessel.isTanker ? "Tanker" : "Other vessel"}
                </span>
                <span>AIS type</span>
                <span className="text-right text-ink">{selectedVessel.type ?? "n/a"}</span>
                <span>Call sign</span>
                <span className="truncate text-right text-ink">{selectedVessel.callSign || "n/a"}</span>
                <span>IMO</span>
                <span className="text-right text-ink">{selectedVessel.imoNumber ?? "n/a"}</span>
                <span>Destination</span>
                <span className="truncate text-right text-ink">
                  {selectedVessel.destination || "n/a"}
                </span>
                <span>Speed</span>
                <span className="text-right text-ink">
                  {formatNumber(selectedVessel.sog, 1, " kn")}
                </span>
                <span>Course</span>
                <span className="text-right text-ink">
                  {formatNumber(selectedVessel.cog, 1, " deg")}
                </span>
                <span>Heading</span>
                <span className="text-right text-ink">
                  {formatNumber(selectedVessel.heading, 0, " deg")}
                </span>
                <span>Draught</span>
                <span className="text-right text-ink">
                  {formatNumber(selectedVessel.draught, 1, " m")}
                </span>
                <span>Lat / lon</span>
                <span className="text-right text-ink">
                  {formatNumber(selectedVessel.lat, 3)}, {formatNumber(selectedVessel.lon, 3)}
                </span>
                <span>Updated</span>
                <span className="text-right text-ink">
                  {formatLastUpdate(selectedVessel.lastUpdate)}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-ink">None</div>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-1 rounded-md border border-border bg-surface/90 px-3 py-2 font-mono text-[10px] text-muted backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: "#D64545" }} />
          High-risk corridor
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: facilityColor.refinery }} />
          Refinery
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: facilityColor.spr }} />
          Strategic reserve
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: facilityColor.port }} />
          Port
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: "#F6F7F9" }} />
          Live vessels ({vessels.length})
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: VESSEL_TANKER_COLOR }} />
          Tanker ({tankerCount})
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: VESSEL_OTHER_COLOR }} />
          Other vessel ({otherVesselCount})
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: VESSEL_STALE_COLOR }} />
          Stale (&gt;10min)
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: VESSEL_AFFECTED_COLOR }} />
          In tension zone
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: VESSEL_APPROACHING_COLOR }} />
          Approaching zone
        </div>
      </div>
    </div>
  );
};

export default VesselMap;
