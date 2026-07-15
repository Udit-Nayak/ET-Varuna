export type DsmSeverity = "low" | "medium" | "high" | "critical";

export interface DsmRetrievedEvent {
  id?: string;
  headline: string;
  riskScore: number;
  severity: DsmSeverity;
  publishedAt: string;
  eventType?: string;
  summary?: string;
  confidence?: number;
}

export interface DsmAssumptions {
  baselineRefineryOutputPct: number;
  importDependencyPct: number;
  affectedImportSharePct: number;
  priceElasticity: number;
  gdpSensitivityPerGapPct: number;
  substitutionRampPctPerDay: number;
  maxSubstitutionPct: number;
  reserveCushionDays: number;
  reserveSafetyFloorDays: number;
  powerStressSensitivity: number;
}

export interface DsmSimulationInput {
  corridor: string;
  scenario_id?: string;
  scenario_text?: string;
  vector_query?: string;
  keywords?: string[];
  source_article_id?: string;
  event_id?: string;
  capacity_loss_pct?: number;
  duration_days?: number;
  assumptions?: Partial<DsmAssumptions>;
  retrieved_events?: DsmRetrievedEvent[];
}

export interface DsmImpactDay {
  day: number;
  refinery_output_pct: number;
  price_change_pct: number;
  gdp_impact_pct: number;
}

export interface DsmInputFormattingResult {
  used_llm: boolean;
  provider: string;
  inferred_fields: string[];
  missing_fields: string[];
  notes: string[];
}

export interface DsmSanityCheckResult {
  used_llm: boolean;
  provider: string;
  status: "pass" | "warning";
  warnings: string[];
  notes: string[];
}

export interface DsmSimulationOutput {
  corridor: string;
  scenario_id: string;
  based_on_events: string[];
  capacity_loss_pct: number;
  duration_days: number;
  impact_timeline: DsmImpactDay[];
  assumptions: DsmAssumptions;
  summary: string;
  input_formatting?: DsmInputFormattingResult;
  sanity_check?: DsmSanityCheckResult;
}

export interface DsmRetrievedContext {
  corridor: string;
  retrieved_events: DsmRetrievedEvent[];
  aggregated_risk_score: number;
  aggregated_severity: DsmSeverity;
  dominant_event_type: string;
}
