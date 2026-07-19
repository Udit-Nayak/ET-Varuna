import { queryVectorKnowledge } from "../gria/service";
import { runDsmSimulation } from "../dsm/service";
import { runSroaOptimization } from "../sroa/service";
import { DsmSimulationOutput } from "../dsm/types";
import { SroaOutput, SroaPolicy } from "../sroa/types";

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
  corridor: string;
  scenarioText: string;
  gria: {
    query: string;
    matches: unknown[];
  };
  dsm: DsmSimulationOutput;
  sroa: SroaOutput;
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

const normalizeCorridor = (input: MapZoneAnalysisInput): string => {
  if (input.corridorName?.trim()) return input.corridorName.trim();
  if (input.corridorId && CORRIDOR_LABELS[input.corridorId]) return CORRIDOR_LABELS[input.corridorId];
  return "general maritime corridor";
};

const policyFromTension = (tensionPct: number): SroaPolicy => {
  if (tensionPct >= 75) return "aggressive";
  if (tensionPct <= 35) return "conservative";
  return "balanced";
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
  const scenarioText = buildScenarioText(input, corridor, tensionPct, durationDays);
  const query = `${corridor} shipping attack oil tanker sanctions conflict blockade India`;

  const griaMatches = (await queryVectorKnowledge({ query, limit: 6 })) as unknown[];
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

  return {
    zoneId: input.zoneId,
    corridor,
    scenarioText,
    gria: {
      query,
      matches: griaMatches,
    },
    dsm,
    sroa,
    recommendation: sroa.safety_threshold_breached
      ? "SROA indicates reserve safety or residual supply gap stress. Escalate to procurement alternatives and APO planning."
      : "SROA reserve bounds remain acceptable. Continue monitoring GRIA/DSM updates for this zone.",
    generatedAt: new Date().toISOString(),
  };
};
