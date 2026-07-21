import { useCallback, useState } from "react";
import { getPolygonCenter } from "../utils/geo";

export interface TensionZone {
  id: string;
  name: string;
  polygon: number[][];
  corridorId: string | null;
  tensionPct: number;
  durationDays: number;
  createdAt: number;
}

export interface AgentZoneAnalysis {
  status: "loading" | "ready" | "error";
  message?: string;
  corridor?: string;
  generatedAt?: string;
  zoneGeometry?: {
    pointCount: number;
    center: [number, number] | null;
    areaSqKm: number;
  };
  griaMatches?: number;
  dsm?: {
    capacityLossPct: number;
    durationDays: number;
    severityEvents: number;
    summary: string;
  };
  sroa?: {
    policy: string;
    totalReleasedVolume: number;
    reserveAfterPlanDays: number;
    safetyThresholdBreached: boolean;
    sanityStatus: string;
    summary: string;
  };
  apo?: {
    totalVolumeNeeded: number;
    topOptions: Array<{
      supplierName: string;
      route: string;
      landedCostPerBarrel: number;
      transitDays: number;
      routeRiskScore: number;
      compositeScore: number;
      volumeOffered: number;
      explanation: string;
    }>;
    llmFlags: string[];
  };
  recommendation?: string;
}

export interface SimulationState {
  zones: TensionZone[];
  isDrawing: boolean;
  affectedVessels: number[];
}

export interface ZoneImpact {
  zoneId: string;
  zoneName: string;
  corridorId: string | null;
  corridorShare: number;
  volumeAtRisk: number;
  sprDaysRemaining: number;
  reroutePenaltyDays: number;
  priceImpactPct: number;
}

export interface SimulationImpact {
  perZone: ZoneImpact[];
  totalVolumeAtRisk: number;
  minSprDaysRemaining: number;
  maxReroutePenaltyDays: number;
  totalPriceImpactPct: number;
}

const ZONE_NAMES = [
  "Alpha",
  "Beta",
  "Gamma",
  "Delta",
  "Epsilon",
  "Zeta",
  "Eta",
  "Theta",
];

const CORRIDOR_SHARE: Record<string, number> = {
  hormuz: 0.263,
  "bab-el-mandeb": 0.18,
  malacca: 0.12,
  suez: 0.08,
  "persian-gulf": 0.22,
};

const INDIA_DAILY_IMPORT_BPD = 4548000;

const corridorBounds = [
  { id: "hormuz", minLat: 26, maxLat: 28, minLng: 55, maxLng: 58 },
  { id: "bab-el-mandeb", minLat: 11, maxLat: 14, minLng: 42, maxLng: 45 },
  { id: "malacca", minLat: 1, maxLat: 6, minLng: 99, maxLng: 105 },
  { id: "suez", minLat: 29, maxLat: 32, minLng: 32, maxLng: 33 },
  { id: "persian-gulf", minLat: 24, maxLat: 30, minLng: 48, maxLng: 57 },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const createZoneId = () =>
  crypto.randomUUID?.() ?? `zone-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const matchCorridorToZone = (polygon: number[][]): string | null => {
  const [lng, lat] = getPolygonCenter(polygon);
  const match = corridorBounds.find(
    (bounds) =>
      lat >= bounds.minLat &&
      lat <= bounds.maxLat &&
      lng >= bounds.minLng &&
      lng <= bounds.maxLng
  );

  return match?.id ?? null;
};

const getShare = (corridorId: string | null) => (corridorId ? CORRIDOR_SHARE[corridorId] ?? 0 : 0);

export const useSimulation = () => {
  const [zones, setZones] = useState<TensionZone[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  const addZone = useCallback(
    (polygon: number[][], corridorId: string | null, tensionPct: number, durationDays: number) => {
      const id = createZoneId();
      setZones((currentZones) => {
        const name = `Zone ${ZONE_NAMES[currentZones.length % ZONE_NAMES.length]}`;

        return [
          ...currentZones,
          {
            id,
            name,
            polygon,
            corridorId,
            tensionPct: clamp(tensionPct, 0, 100),
            durationDays: clamp(durationDays, 1, 90),
            createdAt: Date.now(),
          },
        ];
      });
      return id;
    },
    []
  );

  const removeZone = useCallback((id: string) => {
    setZones((currentZones) => currentZones.filter((zone) => zone.id !== id));
  }, []);

  const clearAllZones = useCallback(() => {
    setZones([]);
    setIsDrawing(false);
  }, []);

  const setZoneTension = useCallback((id: string, pct: number) => {
    setZones((currentZones) =>
      currentZones.map((zone) =>
        zone.id === id ? { ...zone, tensionPct: clamp(pct, 0, 100) } : zone
      )
    );
  }, []);

  const setZoneDuration = useCallback((id: string, days: number) => {
    setZones((currentZones) =>
      currentZones.map((zone) =>
        zone.id === id ? { ...zone, durationDays: clamp(days, 1, 90) } : zone
      )
    );
  }, []);

  const computeImpact = useCallback((): SimulationImpact => {
    const perZone = zones.map((zone) => {
      const corridorShare = getShare(zone.corridorId);

      // volumeAtRisk estimates daily barrels exposed to a disruption share.
      const volumeAtRisk = INDIA_DAILY_IMPORT_BPD * corridorShare * (zone.tensionPct / 100);
      // sprDaysRemaining approximates how quickly strategic reserves are stressed by duration.
      const sprDaysRemaining = Math.max(
        0,
        9.5 - (zone.tensionPct / 100) * zone.durationDays * corridorShare
      );
      // reroutePenaltyDays uses a coarse long-haul penalty for major import corridors.
      const reroutePenaltyDays = corridorShare > 0.15 ? 14 : 7;
      // priceImpactPct is a simplified elasticity proxy for corridor tension.
      const priceImpactPct = (zone.tensionPct / 100) * corridorShare * 35;

      return {
        zoneId: zone.id,
        zoneName: zone.name,
        corridorId: zone.corridorId,
        corridorShare,
        volumeAtRisk,
        sprDaysRemaining,
        reroutePenaltyDays,
        priceImpactPct,
      };
    });

    return {
      perZone,
      totalVolumeAtRisk: perZone.reduce((sum, impact) => sum + impact.volumeAtRisk, 0),
      minSprDaysRemaining:
        perZone.length > 0 ? Math.min(...perZone.map((impact) => impact.sprDaysRemaining)) : 9.5,
      maxReroutePenaltyDays:
        perZone.length > 0 ? Math.max(...perZone.map((impact) => impact.reroutePenaltyDays)) : 0,
      totalPriceImpactPct: perZone.reduce((sum, impact) => sum + impact.priceImpactPct, 0),
    };
  }, [zones]);

  return {
    zones,
    isDrawing,
    affectedVessels: [] as number[],
    addZone,
    removeZone,
    clearAllZones,
    setZoneTension,
    setZoneDuration,
    setIsDrawing,
    computeImpact,
  };
};
