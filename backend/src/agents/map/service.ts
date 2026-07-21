import { queryVectorKnowledge } from "../gria/service";
import { runDsmSimulation } from "../dsm/service";
import { runSroaOptimization } from "../sroa/service";
import { runApoRecommendation } from "../apo/service";
import { DsmSimulationOutput } from "../dsm/types";
import { SroaOutput, SroaPolicy } from "../sroa/types";
import { ApoOutput } from "../apo/types";

export interface MapZoneAnalysisInput {
  zoneId?: string;
  zoneName?: string;
  polygon?: number[][];
  corridorId?: string | null;
  corridorName?: string | null;
  tensionPct?: number;
  durationDays?: number;
  affectedVesselCount?: number;
  affectedTankers?: number;
}

export interface MapZoneAnalysisResult {
  zoneId?: string;
  zoneGeometry: {
    polygon: number[][];
    center: [number, number] | null;
    approximate_area_sq_km: number;
  };
  corridor: string;
  scenarioText: string;
  gria: {
    query: string;
    matches: unknown[];
  };
  dsm: DsmSimulationOutput;
  sroa: SroaOutput;
  apo: ApoOutput;
  recommendation: string;
  generatedAt: string;
}

const CORRIDOR_LABELS: Record<string, string> = {
  hormuz: "Strait of Hormuz",
  "bab-el-mandeb": "Bab-el-Mandeb",
  malacca: "Strait of Malacca",
  suez: "Suez Canal",
  "persian-gulf": "Persian Gulf",
  "persian-gulf-inner": "Persian Gulf",
  "cape-of-good-hope": "Cape of Good Hope",
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const inferCorridorFromPolygon = (polygon?: number[][]): string | null => {
  const center = polygonCenter(polygon);
  if (!center) return null;
  const [lng, lat] = center;
  if (lng >= 58 && lng <= 76 && lat >= 5 && lat <= 24) return "Arabian Sea / West India import corridor";
  if (lng >= 48 && lng <= 58 && lat >= 24 && lat <= 30) return "Persian Gulf";
  if (lng >= 55 && lng <= 58 && lat >= 26 && lat <= 28) return "Strait of Hormuz";
  if (lng >= 42 && lng <= 45 && lat >= 11 && lat <= 14) return "Bab-el-Mandeb";
  if (lng >= 99 && lng <= 105 && lat >= 1 && lat <= 6) return "Strait of Malacca";
  return null;
};

const normalizeCorridor = (input: MapZoneAnalysisInput): string => {
  if (input.corridorId && CORRIDOR_LABELS[input.corridorId]) return CORRIDOR_LABELS[input.corridorId];
  const corridorName = input.corridorName?.trim();
  if (corridorName && !/general maritime corridor/i.test(corridorName)) return corridorName;
  return inferCorridorFromPolygon(input.polygon) ?? "general maritime corridor";
};

const policyFromTension = (tensionPct: number): SroaPolicy => {
  if (tensionPct >= 75) return "aggressive";
  if (tensionPct <= 35) return "conservative";
  return "balanced";
};

const polygonCenter = (polygon?: number[][]): [number, number] | null => {
  if (!polygon || polygon.length === 0) return null;
  const [lngSum, latSum] = polygon.reduce(([lngAcc, latAcc], [lng, lat]) => [lngAcc + lng, latAcc + lat], [0, 0]);
  return [Number((lngSum / polygon.length).toFixed(4)), Number((latSum / polygon.length).toFixed(4))];
};

const approximatePolygonAreaSqKm = (polygon?: number[][]): number => {
  if (!polygon || polygon.length < 3) return 0;
  const center = polygonCenter(polygon);
  const latFactor = 111.32;
  const lngFactor = 111.32 * Math.cos(((center?.[1] ?? 0) * Math.PI) / 180);
  const points = polygon.map(([lng, lat]) => [lng * lngFactor, lat * latFactor]);
  const area = points.reduce((sum, [x1, y1], index) => {
    const [x2, y2] = points[(index + 1) % points.length];
    return sum + x1 * y2 - x2 * y1;
  }, 0);
  return Number((Math.abs(area) / 2).toFixed(2));
};

const buildScenarioText = (input: MapZoneAnalysisInput, corridor: string, tensionPct: number, durationDays: number): string =>
  [
    `User-drawn live-map tension zone for ${corridor}.`,
    `Estimated tension intensity is ${tensionPct}%.`,
    `Expected duration is ${durationDays} days.`,
    `Currently affected vessels: ${input.affectedVesselCount ?? 0}.`,
    `Affected tankers: ${input.affectedTankers ?? 0}.`,
    "Analyze recent GRIA intelligence for shipping, oil, sanctions, conflict, and India supply-chain risk.",
  ].join(" ");

export const analyzeMapZone = async (input: MapZoneAnalysisInput): Promise<MapZoneAnalysisResult> => {
  const tensionPct = clamp(Number(input.tensionPct ?? 50), 0, 100);
  const durationDays = Math.round(clamp(Number(input.durationDays ?? 14), 1, 90));
  const corridor = normalizeCorridor(input);
  const zoneCenter = polygonCenter(input.polygon);
  const zoneAreaSqKm = approximatePolygonAreaSqKm(input.polygon);
  const scenarioText = buildScenarioText(input, corridor, tensionPct, durationDays) +
    ` Drawn zone center: ${zoneCenter ? zoneCenter.join(", ") : "unknown"}. Approximate area: ${zoneAreaSqKm} sq km.`;
  const query = `${corridor} shipping attack oil tanker sanctions conflict blockade India`;

  const griaMatches = await queryVectorKnowledge({ query, limit: 6 }).catch((error) => {
    console.warn("Map GRIA retrieval unavailable; continuing with DSM/SROA/APO chain:", error instanceof Error ? error.message : error);
    return [] as unknown[];
  }) as unknown[];
  const dsm = await runDsmSimulation({
    corridor,
    scenario_text: scenarioText,
    vector_query: query,
    keywords: [corridor, "oil", "shipping", "tanker", "India", "sanctions", "conflict"],
    capacity_loss_pct: tensionPct,
    duration_days: durationDays,
  });
  const sroa = await runSroaOptimization({
    corridor,
    policy: policyFromTension(tensionPct),
    dsm_output: dsm,
    scenario_text: scenarioText,
  });
  const apo = await runApoRecommendation({
    corridor,
    sroa_output: sroa,
    dsm_output: dsm,
    max_options: 3,
  });

  return {
    zoneId: input.zoneId,
    zoneGeometry: {
      polygon: input.polygon ?? [],
      center: zoneCenter,
      approximate_area_sq_km: zoneAreaSqKm,
    },
    corridor,
    scenarioText,
    gria: {
      query,
      matches: griaMatches,
    },
    dsm,
    sroa,
    apo,
    recommendation: apo.ranked_options[0]
      ? "APO recommends " + apo.ranked_options[0].supplier_name + " via " + apo.ranked_options[0].via + " for " + Math.round(apo.ranked_options[0].volume_offered).toLocaleString("en-US") + " barrels."
      : sroa.safety_threshold_breached
        ? "SROA indicates reserve safety or residual supply gap stress, but APO found no feasible procurement option."
        : "SROA reserve bounds remain acceptable. APO alternatives remain on standby.",
    generatedAt: new Date().toISOString(),
  };
};
