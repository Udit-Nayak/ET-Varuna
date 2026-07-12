import { RiskFactorBreakdown, RiskInputs, RiskScoreResult } from "./types";

export const RISK_CALCULATION_CONFIG = {
  severityWeights: {
    low: 10,
    medium: 35,
    high: 70,
    critical: 100,
  },
  aisDisruptionMax: 100,
  oilPriceChangeMax: 20,
  sanctionsMax: 100,
  eventWeights: {
    blockade: 100,
    attack: 90,
    sanction: 85,
    disruption: 75,
    accident: 35,
    protest: 40,
    default: 55,
  },
  confidenceMultiplier: 0.25,
  caps: {
    min: 0,
    max: 100,
  },
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const normalizeMetric = (value: number, scale: number): number => clamp((Math.abs(value) / scale) * 100, 0, 100);

const eventWeight = (eventType: string): number => {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("block")) return RISK_CALCULATION_CONFIG.eventWeights.blockade;
  if (normalized.includes("attack") || normalized.includes("strike")) return RISK_CALCULATION_CONFIG.eventWeights.attack;
  if (normalized.includes("sanction")) return RISK_CALCULATION_CONFIG.eventWeights.sanction;
  if (normalized.includes("disrupt")) return RISK_CALCULATION_CONFIG.eventWeights.disruption;
  if (normalized.includes("accident") || normalized.includes("incident")) return RISK_CALCULATION_CONFIG.eventWeights.accident;
  if (normalized.includes("protest")) return RISK_CALCULATION_CONFIG.eventWeights.protest;
  return RISK_CALCULATION_CONFIG.eventWeights.default;
};

const severityWeight = (severity: RiskInputs["severity"]): number => RISK_CALCULATION_CONFIG.severityWeights[severity];

const toBreakdown = (input: RiskInputs): RiskFactorBreakdown => ({
  severity: severityWeight(input.severity),
  aisDisruption: normalizeMetric(input.aisDisruption, RISK_CALCULATION_CONFIG.aisDisruptionMax),
  oilPriceChange: normalizeMetric(input.oilPriceChange, RISK_CALCULATION_CONFIG.oilPriceChangeMax),
  sanctions: normalizeMetric(input.sanctions, RISK_CALCULATION_CONFIG.sanctionsMax),
  eventType: eventWeight(input.eventType),
  confidence: clamp((1 - clamp(input.confidence, 0, 1)) * 100, 0, 100),
});

const computeScore = (breakdown: RiskFactorBreakdown): number => {
  const weighted =
    breakdown.severity * 0.3 +
    breakdown.aisDisruption * 0.2 +
    breakdown.oilPriceChange * 0.15 +
    breakdown.sanctions * 0.15 +
    breakdown.eventType * 0.2;
  const adjusted = weighted + breakdown.confidence * RISK_CALCULATION_CONFIG.confidenceMultiplier;
  return clamp(Math.round(adjusted), RISK_CALCULATION_CONFIG.caps.min, RISK_CALCULATION_CONFIG.caps.max);
};

const levelFor = (score: number): RiskScoreResult["level"] => {
  if (score >= 85) return "Critical";
  if (score >= 65) return "High";
  if (score >= 35) return "Medium";
  return "Low";
};

export function calculateRisk(input: RiskInputs): RiskScoreResult {
  const breakdown = toBreakdown(input);
  const score = computeScore(breakdown);
  return {
    score,
    level: levelFor(score),
    breakdown,
  };
}
