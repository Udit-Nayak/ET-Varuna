import { DsmSimulationOutput } from "../dsm/types";
import { SroaOutput, SroaRemainingGapDay } from "../sroa/types";

export interface ApoRouteOption {
  route_id: string;
  via: string;
  transit_days: number;
  port_congestion_factor: number;
  risk_query_terms?: string[];
}

export interface ApoSupplier {
  supplier_id: string;
  supplier_name: string;
  region: string;
  crude_grade: string;
  refinery_compatibility: string[];
  base_capacity_volume_per_day: number;
  route_options: ApoRouteOption[];
}

export interface ApoLivePrice {
  grade: string;
  region: string;
  price_per_barrel: number;
  timestamp: string;
  source?: string;
}

export interface ApoScoringWeights {
  price: number;
  transit: number;
  route_risk: number;
  capacity: number;
  compatibility: number;
}

export interface ApoInput {
  corridor?: string;
  sroa_output?: SroaOutput;
  remaining_supply_gap?: SroaRemainingGapDay[];
  dsm_output?: DsmSimulationOutput;
  dsm_context?: Pick<DsmSimulationOutput, "impact_timeline" | "assumptions" | "duration_days" | "scenario_id">;
  target_refineries?: string[];
  max_options?: number;
  weights?: Partial<ApoScoringWeights>;
  disrupted_zone_polygon?: number[][];
}

export interface ApoSupportingEvent {
  id: string;
  headline: string;
  summary?: string;
  severity?: string;
  riskScore: number;
  publishedAt?: string;
}

export interface ApoCandidateScore {
  supplier_id: string;
  supplier_name: string;
  region: string;
  crude_grade: string;
  route_id: string;
  via: string;
  route_geometry?: [number, number][];
  route_feasibility_notes?: string[];
  landed_cost_per_barrel: number;
  transit_days: number;
  port_congestion_factor: number;
  route_risk_score: number;
  composite_score: number;
  volume_offered: number;
  score_breakdown: {
    price_score: number;
    transit_score: number;
    route_risk_score: number;
    capacity_score: number;
    compatibility_score: number;
  };
  explanation: string;
  supporting_events: string[];
  supporting_event_details?: ApoSupportingEvent[];
}

export interface ApoLlmReasoning {
  used_llm: boolean;
  provider: string;
  flags: string[];
  explanations: Record<string, string>;
  summary: string;
  formatted_recommendation: string;
}

export interface ApoOutput {
  corridor: string;
  based_on_sroa_gap: true;
  total_volume_needed: number;
  urgency: {
    peak_gap_day: number;
    peak_unfulfilled_volume: number;
    first_gap_day: number | null;
    disruption_duration_days: number;
  };
  scoring_weights: ApoScoringWeights;
  price_as_of?: string;
  ranked_options: ApoCandidateScore[];
  llm_flags: string[];
  llm_used: boolean;
  llm_provider: string;
  llm_summary: string;
  formatted_recommendation: string;
  generated_at: string;
}
