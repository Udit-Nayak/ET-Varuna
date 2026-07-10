import { ApoOutput, DsmOutput, GriaOutput, SroaOutput, TfmOutput } from "./contracts";
import { mockApo, mockDsm, mockGria, mockSroa, mockTfm } from "./mockData";

export const runGria = (input: { corridor: string; risk_score?: number }): GriaOutput => {
  const base = input.risk_score ?? mockGria.risk_score;
  const trend = base >= 75 ? "rising" : base >= 45 ? "stable" : "falling";
  return {
    ...mockGria,
    corridor: input.corridor,
    risk_score: base,
    trend,
    explanation: `${input.corridor} is showing elevated disruption pressure with cargo rerouting and insurance cost escalation.`,
  };
};

export const runDsm = (input: { corridor: string; capacity_loss_pct: number; duration_days: number }): DsmOutput => {
  const lossFactor = input.capacity_loss_pct / 100;
  const duration = input.duration_days;
  return {
    ...mockDsm,
    corridor: input.corridor,
    scenario_id: `${input.corridor.toLowerCase().replace(/\s+/g, "-")}-scenario`,
    impact_timeline: mockDsm.impact_timeline.map((point, index) => ({
      ...point,
      day: index + 1,
      refinery_output_pct: Math.max(70, Math.round(100 - lossFactor * 18 - index * 4)),
      price_change_pct: Number((point.price_change_pct + lossFactor * 2).toFixed(1)),
      gdp_impact_pct: Number((point.gdp_impact_pct + lossFactor * 0.1).toFixed(1)),
    })).slice(0, Math.max(1, Math.min(3, Math.ceil(duration / 7)))),
  };
};

export const runApo = (input: { corridor: string; supply_gap_volume: number; urgency: number }): ApoOutput => {
  const urgencyFactor = input.urgency / 10;
  return {
    ...mockApo,
    corridor: input.corridor,
    ranked_options: mockApo.ranked_options
      .map((option, index) => ({
        ...option,
        landed_cost: Number((option.landed_cost + urgencyFactor * 1.8 + index * 0.8).toFixed(1)),
        eta_days: Math.max(5, option.eta_days - Math.round(urgencyFactor * 2)),
        score: Math.max(55, Math.min(97, option.score - index * 3 + Math.round(urgencyFactor * 5))),
      }))
      .sort((a, b) => b.score - a.score),
  };
};

export const runSroa = (input: { current_reserve_days: number; forecast_gap: Array<{ day: number; price_change_pct: number }> }): SroaOutput => {
  const avgGap = input.forecast_gap.reduce((sum, item) => sum + item.price_change_pct, 0) / Math.max(1, input.forecast_gap.length);
  const thresholdBreached = input.current_reserve_days < 10 && avgGap > 8;
  return {
    drawdown_schedule: [
      { day: 1, release_rate: Math.min(0.24, Math.max(0.08, (avgGap / 30) + 0.06)) },
      { day: 7, release_rate: Math.min(0.24, Math.max(0.08, 0.1 + avgGap / 40)) },
    ],
    safety_threshold_breached: thresholdBreached,
  };
};

export const runTfm = (input: { corridor: string; baseline_volume: number; current_volume: number; price_delta_pct: number }): TfmOutput => {
  const fulfillmentPct = Math.min(100, Math.max(0, Math.round((input.current_volume / input.baseline_volume) * 100)));
  return {
    ...mockTfm,
    corridor: input.corridor,
    fulfillment_pct: fulfillmentPct,
    price_delta_pct: input.price_delta_pct,
    baseline_volume: input.baseline_volume,
    current_volume: input.current_volume,
  };
};
