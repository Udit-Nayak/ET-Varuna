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

export type DsmMarketDirection = "up" | "down" | "mixed" | "flat";
export type DsmWarningLevel = "low" | "medium" | "high" | "critical";

export interface DsmEventClassification {
  event_type: string;
  severity: DsmSeverity;
  affected_market: string;
  expected_impact: string;
  direction: DsmMarketDirection;
  confidence: number;
  rationale: string;
}

export interface DsmHistoricalEventReaction {
  event_id: string;
  headline: string;
  publishedAt: string;
  event_type: string;
  severity: DsmSeverity;
  affected_market: string;
  historical_price_change_pct: number;
  notes: string;
}

export interface DsmHistoricalAnalysis {
  matched_events: DsmHistoricalEventReaction[];
  average_historical_price_change_pct: number;
  sample_size: number;
  market_condition_note: string;
}

export interface DsmPredictedPricePoint {
  horizon_days: 1 | 7 | 30;
  predicted_price: number;
  predicted_change_pct: number;
  explanation: string;
}

export interface DsmPredictionRecord {
  event_id: string;
  event_details: DsmEventClassification;
  news_references: DsmRetrievedEvent[];
  current_price: number;
  historical_analysis: DsmHistoricalAnalysis;
  predicted_prices: DsmPredictedPricePoint[];
  confidence_score: number;
  warning_level: DsmWarningLevel;
  recommendation: string;
  market_impact_explanation: string;
  createdAt: string;
  updatedAt: string;
  source: "dsm";
  metadata: Record<string, unknown>;
}

export interface DsmWorkflowInput {
  vector_query?: string;
  keywords?: string[];
  corridor?: string;
  limit?: number;
}

export interface DsmWorkflowResult {
  triggered: boolean;
  event?: DsmEventClassification;
  live_price?: {
    current_price_usd_per_barrel: number | null;
    fetched_at: string;
  };
  historical_analysis?: DsmHistoricalAnalysis;
  predicted_prices?: DsmPredictedPricePoint[];
  warning_level?: DsmWarningLevel;
  recommendation?: string;
  market_impact_explanation?: string;
  confidence_score?: number;
  stored?: DsmPredictionRecord | null;
  news_references?: DsmRetrievedEvent[];
  notes?: string[];
}
