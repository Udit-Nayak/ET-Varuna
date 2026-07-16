import { DsmSimulationOutput } from "../dsm/types";
import { SroaInput, SroaOperationalData, SroaOutput, SroaPolicy } from "./types";

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const policyMultiplier: Record<SroaPolicy, number> = {
  conservative: 0.55,
  balanced: 0.72,
  aggressive: 0.9,
};

const safetyFloorPolicyFactor: Record<SroaPolicy, number> = {
  conservative: 1.2,
  balanced: 1,
  aggressive: 0.8,
};

const normalizePolicy = (policy: unknown): SroaPolicy =>
  policy === "conservative" || policy === "aggressive" || policy === "balanced" ? policy : "balanced";

const dsmGapVolume = (day: DsmSimulationOutput["impact_timeline"][number], operations: SroaOperationalData): number => {
  const outputGapPct = clamp(100 - Number(day.refinery_output_pct || 100), 0, 100);
  const priceStress = clamp(Number(day.price_change_pct || 0) / 100, 0, 1);
  const importExposure = clamp(operations.import_dependency_pct / 100, 0, 1);
  return operations.daily_consumption_rate * (outputGapPct / 100) * (0.75 + importExposure * 0.25) * (1 + priceStress * 0.2);
};

const buildSummary = (output: Omit<SroaOutput, "summary" | "sanity_check">): string => {
  const remainingGap = output.remaining_supply_gap.reduce((sum, day) => sum + day.unfulfilled_volume, 0);
  const peak = output.drawdown_schedule.reduce((best, day) => (day.release_volume > best.release_volume ? day : best), output.drawdown_schedule[0]);
  const safetyText = output.safety_threshold_breached
    ? "Safety threshold is breached or some supply gap remains, so APO should cover the residual requirement."
    : "Safety threshold remains protected after the drawdown plan.";
  return `${output.corridor} SROA uses nationalStateHistory and livePriceSnapshot data to plan a ${output.policy} reserve release. It releases ${output.total_released_volume} barrels in total, peaks at ${peak?.release_volume ?? 0} barrels on day ${peak?.day ?? 0}, and ends with ${output.reserve_after_plan_days} reserve days. ${safetyText} Remaining supply gap is ${round(remainingGap, 0)} barrels.`;
};

const sanityCheck = (output: Omit<SroaOutput, "summary" | "sanity_check">): SroaOutput["sanity_check"] => {
  const warnings: string[] = [];
  output.drawdown_schedule.forEach((day) => {
    if (day.release_volume < 0) warnings.push(`Day ${day.day} release_volume is negative.`);
    if (day.release_rate_pct > 100) warnings.push(`Day ${day.day} release_rate_pct exceeds daily consumption.`);
    if (day.reserve_after_release < 0) warnings.push(`Day ${day.day} reserve_after_release is negative.`);
  });
  if (output.total_released_volume > output.initial_reserve_volume) warnings.push("Total release exceeds initial reserve volume.");
  return {
    status: warnings.length > 0 ? "warning" : "pass",
    warnings,
    notes: ["SROA math is deterministic; this check validates reserve and release bounds."],
  };
};

export const optimizeReserveDrawdown = (input: SroaInput, dsm: DsmSimulationOutput, operations: SroaOperationalData): SroaOutput => {
  if (!dsm.impact_timeline?.length) throw new Error("DSM impact_timeline is required for SROA");

  const policy = normalizePolicy(input.policy);
  const safetyFloorDays = input.safety_floor_days ?? Math.min(5, operations.current_reserve_days * 0.8);
  const maxDailyRelease = input.max_daily_release_volume ?? operations.daily_consumption_rate * 0.18;
  const initialReserve = operations.current_reserve_volume;
  const safetyFloor = Math.max(0, safetyFloorDays * operations.daily_consumption_rate * safetyFloorPolicyFactor[policy]);
  const availableForRelease = Math.max(0, initialReserve - safetyFloor);

  const rawTargets = dsm.impact_timeline.map((day) => {
    const gap = dsmGapVolume(day, operations);
    const urgency = 1 + clamp(day.price_change_pct / 100, 0, 1) + clamp(Math.abs(day.gdp_impact_pct) / 5, 0, 0.4);
    return {
      day: day.day,
      gap,
      target: Math.min(gap * policyMultiplier[policy] * urgency, maxDailyRelease),
    };
  });

  const totalTarget = rawTargets.reduce((sum, day) => sum + day.target, 0);
  const reserveScale = totalTarget > availableForRelease && totalTarget > 0 ? availableForRelease / totalTarget : 1;

  let reserve = initialReserve;
  let totalReleased = 0;
  const drawdown = rawTargets.map((target) => {
    const releasable = Math.max(0, reserve - safetyFloor);
    const release = Math.min(target.gap, target.target * reserveScale, maxDailyRelease, releasable);
    reserve -= release;
    totalReleased += release;
    return {
      day: target.day,
      forecast_gap_volume: round(target.gap, 0),
      release_volume: round(release, 0),
      release_rate_pct: round((release / operations.daily_consumption_rate) * 100),
      reserve_after_release: round(reserve, 0),
      reserve_after_plan_days: round(reserve / operations.daily_consumption_rate),
      unfulfilled_volume: round(Math.max(0, target.gap - release), 0),
    };
  });

  const remaining = drawdown.filter((day) => day.unfulfilled_volume > 0).map((day) => ({ day: day.day, unfulfilled_volume: day.unfulfilled_volume }));

  const outputBase: Omit<SroaOutput, "summary" | "sanity_check"> = {
    corridor: input.corridor ?? dsm.corridor,
    policy,
    operational_data: operations,
    initial_reserve_volume: round(initialReserve, 0),
    safety_floor_volume: round(safetyFloor, 0),
    total_released_volume: round(totalReleased, 0),
    reserve_after_plan_days: round(reserve / operations.daily_consumption_rate),
    safety_threshold_breached: reserve < safetyFloor || remaining.length > 0,
    drawdown_schedule: drawdown,
    remaining_supply_gap: remaining,
    based_on_dsm_scenario: dsm.scenario_id,
    based_on_events: dsm.based_on_events ?? [],
  };

  return {
    ...outputBase,
    summary: buildSummary(outputBase),
    sanity_check: sanityCheck(outputBase),
  };
};
