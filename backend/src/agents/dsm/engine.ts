import {
  DsmAssumptions,
  DsmRetrievedContext,
  DsmRetrievedEvent,
  DsmSeverity,
  DsmSimulationInput,
  DsmSimulationOutput,
} from "./types";

const DEFAULT_ASSUMPTIONS: DsmAssumptions = {
  baselineRefineryOutputPct: 100,
  importDependencyPct: 88,
  affectedImportSharePct: 40,
  priceElasticity: 1.18,
  gdpSensitivityPerGapPct: 0.035,
  substitutionRampPctPerDay: 1.15,
  maxSubstitutionPct: 32,
  reserveCushionDays: 9.5,
  reserveSafetyFloorDays: 5,
  powerStressSensitivity: 0.72,
};

const SEVERITY_WEIGHT: Record<DsmSeverity, number> = {
  low: 20,
  medium: 45,
  high: 72,
  critical: 92,
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

const normalizeSeverity = (severity: string | undefined): DsmSeverity => {
  const normalized = String(severity ?? "medium").toLowerCase();
  if (normalized === "critical" || normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "medium";
};

const eventRecencyWeight = (publishedAt: string): number => {
  const timestamp = Date.parse(publishedAt);
  if (Number.isNaN(timestamp)) {
    return 0.7;
  }
  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);
  return clamp(1 - ageDays / 45, 0.35, 1);
};

export const aggregateDsmContext = (corridor: string, events: DsmRetrievedEvent[]): DsmRetrievedContext => {
  const normalizedEvents = events.map((event) => ({
    ...event,
    severity: normalizeSeverity(event.severity),
    riskScore: clamp(Number(event.riskScore) || SEVERITY_WEIGHT[normalizeSeverity(event.severity)], 0, 100),
  }));

  if (normalizedEvents.length === 0) {
    return {
      corridor,
      retrieved_events: [],
      aggregated_risk_score: 42,
      aggregated_severity: "medium",
      dominant_event_type: "scenario_assumption",
    };
  }

  let weightedRisk = 0;
  let totalWeight = 0;
  const eventTypeCounts = new Map<string, number>();

  normalizedEvents.forEach((event) => {
    const severityBoost = SEVERITY_WEIGHT[event.severity] / 100;
    const confidence = clamp(Number(event.confidence ?? 0.75), 0.2, 1);
    const weight = eventRecencyWeight(event.publishedAt) * confidence * (0.75 + severityBoost);
    weightedRisk += event.riskScore * weight;
    totalWeight += weight;
    const eventType = event.eventType ?? "geopolitical_disruption";
    eventTypeCounts.set(eventType, (eventTypeCounts.get(eventType) ?? 0) + 1);
  });

  const aggregatedRiskScore = round(weightedRisk / (totalWeight || 1), 0);
  const aggregatedSeverity =
    aggregatedRiskScore >= 80 ? "critical" : aggregatedRiskScore >= 62 ? "high" : aggregatedRiskScore >= 38 ? "medium" : "low";
  const dominantEventType =
    [...eventTypeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "geopolitical_disruption";

  return {
    corridor,
    retrieved_events: normalizedEvents,
    aggregated_risk_score: aggregatedRiskScore,
    aggregated_severity: aggregatedSeverity,
    dominant_event_type: dominantEventType,
  };
};

const inferCapacityLossPct = (context: DsmRetrievedContext): number => {
  const base = context.aggregated_risk_score * 0.55;
  const severityAdder: Record<DsmSeverity, number> = {
    low: 2,
    medium: 8,
    high: 15,
    critical: 24,
  };
  const eventAdder = /blockade|closure|war|shipping|maritime|attack|chokepoint/i.test(context.dominant_event_type) ? 6 : 0;
  return round(clamp(base + severityAdder[context.aggregated_severity] + eventAdder, 8, 75), 0);
};

const inferDurationDays = (context: DsmRetrievedContext): number => {
  const baseBySeverity: Record<DsmSeverity, number> = {
    low: 7,
    medium: 14,
    high: 21,
    critical: 30,
  };
  const severeEventCount = context.retrieved_events.filter((event) => event.severity === "high" || event.severity === "critical").length;
  return clamp(baseBySeverity[context.aggregated_severity] + severeEventCount * 2, 3, 45);
};

const buildSummary = (
  input: DsmSimulationInput,
  context: DsmRetrievedContext,
  output: Omit<DsmSimulationOutput, "summary">
): string => {
  const peak = output.impact_timeline.reduce(
    (current, day) => (day.price_change_pct > current.price_change_pct ? day : current),
    output.impact_timeline[0]
  );
  const lowestOutput = output.impact_timeline.reduce(
    (current, day) => (day.refinery_output_pct < current.refinery_output_pct ? day : current),
    output.impact_timeline[0]
  );
  const severeSource =
    context.retrieved_events.find((event) => event.severity === "critical" || event.severity === "high") ??
    context.retrieved_events[0];
  const sourceText = severeSource ? ` The strongest driver is "${severeSource.headline}".` : "";
  const scenarioText = input.scenario_text ? ` Scenario note: ${input.scenario_text}` : "";

  return `${output.corridor} DSM projects a ${output.capacity_loss_pct}% capacity disruption over ${output.duration_days} days. Refinery output bottoms at ${lowestOutput.refinery_output_pct}% on day ${lowestOutput.day}, while fuel prices peak at +${peak.price_change_pct}% on day ${peak.day}. The model assumes ${output.assumptions.reserveCushionDays} reserve cushion days, ${output.assumptions.substitutionRampPctPerDay}% daily substitution ramp, and a ${output.assumptions.maxSubstitutionPct}% substitution ceiling.${sourceText}${scenarioText}`;
};

export const simulateDsm = (input: DsmSimulationInput, context?: DsmRetrievedContext): DsmSimulationOutput => {
  if (!input.corridor || !input.corridor.trim()) {
    throw new Error("corridor is required");
  }

  const assumptions = { ...DEFAULT_ASSUMPTIONS, ...(input.assumptions ?? {}) };
  const resolvedContext = context ?? aggregateDsmContext(input.corridor, input.retrieved_events ?? []);
  const capacityLossPct = round(clamp(input.capacity_loss_pct ?? inferCapacityLossPct(resolvedContext), 0, 95), 0);
  const durationDays = Math.round(clamp(input.duration_days ?? inferDurationDays(resolvedContext), 1, 60));
  const baseExposurePct = (capacityLossPct * assumptions.importDependencyPct * assumptions.affectedImportSharePct) / 10_000;

  const impactTimeline = Array.from({ length: durationDays }, (_, index) => {
    const day = index + 1;
    const reserveBufferFactor =
      day <= assumptions.reserveCushionDays ? clamp(1 - day / (assumptions.reserveCushionDays + 1), 0, 1) : 0;
    const substitutionPct = clamp(
      Math.max(0, day - assumptions.reserveCushionDays) * assumptions.substitutionRampPctPerDay,
      0,
      assumptions.maxSubstitutionPct
    );
    const bufferedGapPct = baseExposurePct * (1 - reserveBufferFactor);
    const netSupplyGapPct = clamp(bufferedGapPct - substitutionPct * (assumptions.affectedImportSharePct / 100), 0, 100);
    const refineryOutputPct = clamp(assumptions.baselineRefineryOutputPct - netSupplyGapPct * 0.9, 0, 100);
    const priceChangePct = netSupplyGapPct * assumptions.priceElasticity * (1 + capacityLossPct / 180);
    const gdpImpactPct = -netSupplyGapPct * assumptions.gdpSensitivityPerGapPct * (1 + assumptions.powerStressSensitivity / 3);

    return {
      day,
      refinery_output_pct: round(refineryOutputPct),
      price_change_pct: round(priceChangePct),
      gdp_impact_pct: round(gdpImpactPct),
    };
  });

  const outputWithoutSummary: Omit<DsmSimulationOutput, "summary"> = {
    corridor: input.corridor,
    scenario_id:
      input.scenario_id ??
      `${input.corridor.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "corridor"}-${capacityLossPct}pct-${durationDays}d`,
    based_on_events: resolvedContext.retrieved_events.map((event) => event.id ?? event.headline),
    capacity_loss_pct: capacityLossPct,
    duration_days: durationDays,
    impact_timeline: impactTimeline,
    assumptions,
  };

  return {
    ...outputWithoutSummary,
    summary: buildSummary(input, resolvedContext, outputWithoutSummary),
  };
};
