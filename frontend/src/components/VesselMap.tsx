import { useEffect, useRef } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { corridors } from "../data/corridors";
import { indiaFacilities, FacilityType } from "../data/indiaPorts";
import { Vessel } from "../hooks/useVesselStream";

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

const facilityColor: Record<FacilityType, string> = {
  port: "#8A96A3",
  refinery: "#E8A33D",
  spr: "#3FA796",
};

const vesselsToGeoJSON = (vessels: Vessel[]) => ({
  type: "FeatureCollection" as const,
  features: vessels.map((v) => ({
    type: "Feature" as const,
    properties: {
      mmsi: v.mmsi,
      name: v.name || "Unknown vessel",
      sog: v.sog ?? 0,
      isTanker: v.isTanker,
      rotation: v.heading !== undefined && v.heading !== 511 ? v.heading : v.cog ?? 0,
    },
    geometry: { type: "Point" as const, coordinates: [v.lon, v.lat] },
  })),
});

interface VesselMapProps {
  vessels: Vessel[];
}

const VesselMap = ({ vessels }: VesselMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);

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
      map.addImage("vessel-tanker", makeTriangle("#5EC9FF"));
      map.addImage("vessel-other", makeTriangle("#5C6773"));

      // ---- Vessel source + layer ----
      map.addSource("vessels", {
        type: "geojson",
        data: vesselsToGeoJSON([]),
      });

      map.addLayer({
        id: "vessels-symbol",
        type: "symbol",
        source: "vessels",
        layout: {
          "icon-image": ["case", ["get", "isTanker"], "vessel-tanker", "vessel-other"],
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
        (p) =>
          `<div style="font-family:monospace;font-size:12px;color:#0B0F14"><strong>${p.name}</strong><br/>${p.type}</div>`
      );
      bindPopup(
        "corridors-line",
        (p) =>
          `<div style="font-family:monospace;font-size:12px;color:#0B0F14"><strong>${p.name}</strong><br/>risk: ${p.risk}/100</div>`
      );
      bindPopup(
        "vessels-symbol",
        (p) =>
          `<div style="font-family:monospace;font-size:12px;color:#0B0F14"><strong>${p.name}</strong><br/>MMSI ${p.mmsi}<br/>${p.isTanker ? "Tanker" : "Other vessel"}<br/>${p.sog?.toFixed(1)} kn</div>`
      );

      loadedRef.current = true;
    });

    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  // Push live vessel updates into the map source whenever they change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource("vessels") as maplibregl.GeoJSONSource | undefined;
    source?.setData(vesselsToGeoJSON(vessels));
  }, [vessels]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-border">
      <div ref={containerRef} className="h-full w-full" />
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
          <span className="h-2 w-2 rounded-full" style={{ background: "#5EC9FF" }} />
          Live tanker ({vessels.length})
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: "#5EC9FF" }} />
          Tanker
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: "#5C6773" }} />
          Other vessel ({vessels.length})
        </div>
      </div>
    </div>
  );
};

export default VesselMap;