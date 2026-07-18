import { DsmSimulationInput, DsmSimulationOutput } from "../dsm/types";

export type SroaPolicy = "conservative" | "balanced" | "aggressive";

export interface NationalStateSnapshot {
  id: string;
  month: string;
  total_consumption_bpd: number;
  domestic_production_bpd: number;
  total_import_volume_bpd: number;
  import_dependency_pct: number;
  reserve_capacity_days_full: number;
  reserve_fill_percentage: number;
  reserve_remaining_days: number;
  commercial_stock_days: number;
  total_oil_availability_days: number;
  current_price_usd_per_barrel?: number | null;
  price_last_updated?: string | null;
  basket_composition?: Record<string, number>;
  corridor_supply?: Record<string, { volume_bpd?: number | null; share_pct?: number | null }>;
  top_suppliers_pct?: Record<string, number>;
  data_as_of?: string;
  note?: string;
}

export interface LivePriceSnapshot {
  id: string;
  current_price_usd_per_barrel: number;
  month_to_date_avg_usd?: number;
  basket_ratio_sour_pct?: number;
  basket_ratio_sweet_pct?: number;
  fetched_at?: string;
  ppac_last_updated?: string;
  source?: string;
}

export interface SroaOperationalData {
  current_reserve_days: number;
  current_reserve_volume: number;
  daily_consumption_rate: number;
  recent_import_volume: number;
  recent_export_volume: number;
  current_price_usd_per_barrel?: number | null;
  import_dependency_pct: number;
  baseline_import_source_mix: Record<string, number>;
  corridor_supply: Record<string, { volume_bpd?: number | null; share_pct?: number | null }>;
  commercial_stock_days: number;
  total_oil_availability_days: number;
  data_as_of?: string;
  sources: {
    national_state_history_id?: string;
    live_price_snapshot_id?: string;
    national_state_month?: string;
    live_price_source?: string;
  };
}

export interface SroaInput {
  corridor?: string;
  policy?: SroaPolicy;
  safety_floor_days?: number;
  max_daily_release_volume?: number;
  dsm_output?: DsmSimulationOutput;
  dsm_request?: DsmSimulationInput;
  scenario_text?: string;
}

export interface SroaDrawdownDay {
  day: number;
  forecast_gap_volume: number;
  release_volume: number;
  release_rate_pct: number;
  reserve_after_release: number;
  reserve_after_plan_days: number;
  unfulfilled_volume: number;
}

export interface SroaRemainingGapDay {
  day: number;
  unfulfilled_volume: number;
}

export interface SroaInputFormattingResult {
  used_llm: boolean;
  provider: string;
  inferred_fields: string[];
  missing_fields: string[];
  notes: string[];
}

export interface SroaSanityCheckResult {
  used_llm?: boolean;
  provider?: string;
  status: "pass" | "warning";
  warnings: string[];
  notes: string[];
}

export interface SroaOutput {
  corridor: string;
  policy: SroaPolicy;
  operational_data: SroaOperationalData;
  initial_reserve_volume: number;
  safety_floor_volume: number;
  total_released_volume: number;
  reserve_after_plan_days: number;
  safety_threshold_breached: boolean;
  drawdown_schedule: SroaDrawdownDay[];
  remaining_supply_gap: SroaRemainingGapDay[];
  based_on_dsm_scenario?: string;
  based_on_events: string[];
  summary: string;
  input_formatting?: SroaInputFormattingResult;
  sanity_check: SroaSanityCheckResult;
}
