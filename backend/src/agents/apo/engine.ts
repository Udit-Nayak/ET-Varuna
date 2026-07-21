import { SroaRemainingGapDay } from "../sroa/types";
import { ApoCandidateScore, ApoLivePrice, ApoRouteOption, ApoScoringWeights, ApoSupplier, ApoSupportingEvent } from "./types";

export const DEFAULT_APO_WEIGHTS: ApoScoringWeights = {
  price: 0.2,
  transit: 0.4,
  route_risk: 0.2,
  capacity: 0.1,
  compatibility: 0.1,
};

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

export const normalizeApoWeights = (input?: Partial<ApoScoringWeights>): ApoScoringWeights => {
  const merged = { ...DEFAULT_APO_WEIGHTS, ...(input ?? {}) };
  const total = Object.values(merged).reduce((sum, value) => sum + Math.max(0, Number(value)), 0) || 1;
  return {
    price: round(Math.max(0, merged.price) / total, 4),
    transit: round(Math.max(0, merged.transit) / total, 4),
    route_risk: round(Math.max(0, merged.route_risk) / total, 4),
    capacity: round(Math.max(0, merged.capacity) / total, 4),
    compatibility: round(Math.max(0, merged.compatibility) / total, 4),
  };
};

export const summarizeGap = (gap: SroaRemainingGapDay[] = []) => {
  const positive = gap.filter((day) => Number(day.unfulfilled_volume) > 0);
  const totalVolumeNeeded = Math.round(positive.reduce((sum, day) => sum + Number(day.unfulfilled_volume), 0));
  const peak = positive.reduce(
    (current, day) => Number(day.unfulfilled_volume) > current.unfulfilled_volume ? day : current,
    { day: 0, unfulfilled_volume: 0 }
  );
  return {
    totalVolumeNeeded,
    peak_gap_day: peak.day,
    peak_unfulfilled_volume: Math.round(peak.unfulfilled_volume),
    first_gap_day: positive.length > 0 ? positive[0].day : null,
  };
};

export const routeRiskScoreFromEvents = (events: ApoSupportingEvent[]): number => {
  if (events.length === 0) return 18;
  const weighted = events.slice(0, 5).reduce((sum, event, index) => sum + event.riskScore * (1 / (index + 1)), 0);
  const weight = events.slice(0, 5).reduce((sum, _event, index) => sum + 1 / (index + 1), 0) || 1;
  return round(Math.max(0, Math.min(100, weighted / weight)), 2);
};

export interface ScoreCandidateInput {
  supplier: ApoSupplier;
  route: ApoRouteOption;
  price: ApoLivePrice;
  routeRiskScore: number;
  supportingEvents: ApoSupportingEvent[];
  cheapestPrice: number;
  fastestTransitDays: number;
  totalVolumeNeeded: number;
  disruptionDurationDays: number;
  targetRefineries: string[];
  weights: ApoScoringWeights;
}

export const scoreCandidate = (input: ScoreCandidateInput): ApoCandidateScore => {
  const { supplier, route, price, routeRiskScore, supportingEvents, cheapestPrice, fastestTransitDays, totalVolumeNeeded, disruptionDurationDays, targetRefineries, weights } = input;
  const landedCost = price.price_per_barrel * (1 + route.port_congestion_factor);
  const priceScore = clamp(cheapestPrice / Math.max(landedCost, 1));
  const baseTransitScore = clamp(fastestTransitDays / Math.max(route.transit_days, 1));
  const durationRatio = route.transit_days > disruptionDurationDays ? clamp(disruptionDurationDays / route.transit_days) : 1;
  const durationPenalty = route.transit_days > disruptionDurationDays ? durationRatio * durationRatio * 0.65 : 1;
  const transitScore = clamp(baseTransitScore * durationPenalty);
  const riskScore = clamp(1 - routeRiskScore / 100);
  const volumeOffered = Math.round(Math.min(totalVolumeNeeded, supplier.base_capacity_volume_per_day * Math.max(1, disruptionDurationDays)));
  const capacityScore = totalVolumeNeeded <= 0 ? 1 : clamp(volumeOffered / totalVolumeNeeded);
  const compatibilityScore = targetRefineries.length === 0
    ? 0.9
    : supplier.refinery_compatibility.some((refinery) => targetRefineries.includes(refinery))
      ? 1
      : 0.35;

  const composite =
    weights.price * priceScore +
    weights.transit * transitScore +
    weights.route_risk * riskScore +
    weights.capacity * capacityScore +
    weights.compatibility * compatibilityScore;

  return {
    supplier_id: supplier.supplier_id,
    supplier_name: supplier.supplier_name,
    region: supplier.region,
    crude_grade: supplier.crude_grade,
    route_id: route.route_id,
    via: route.via,
    landed_cost_per_barrel: round(landedCost, 2),
    transit_days: route.transit_days,
    port_congestion_factor: route.port_congestion_factor,
    route_risk_score: round(routeRiskScore, 2),
    composite_score: round(composite, 4),
    volume_offered: volumeOffered,
    score_breakdown: {
      price_score: round(priceScore, 4),
      transit_score: round(transitScore, 4),
      route_risk_score: round(riskScore, 4),
      capacity_score: round(capacityScore, 4),
      compatibility_score: round(compatibilityScore, 4),
    },
    explanation: `${supplier.supplier_name} via ${route.via} scored ${round(composite, 3)} before LLM explanation.`,
    supporting_events: supportingEvents.map((event) => event.id),
    supporting_event_details: supportingEvents,
  };
};
