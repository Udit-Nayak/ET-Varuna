import { Document } from "mongoose";

export type IntelligenceProcessingStatus = "pending" | "processing" | "completed" | "failed";
export type PipelineExecutionStatus = "success" | "partial_success" | "failed" | "running";
export type NewsSourceStatus = "active" | "inactive" | "error";
export type NewsSourceProviderType = "NewsAPI" | "RSS" | "GDELT" | "Custom";

export interface IntelligenceDocument {
  headline: string;
  content: string;
  summary: string;
  source: string;
  sourceUrl: string;
  country: string;
  affectedCountries: string[];
  corridor: string;
  affectedCorridors: string[];
  eventType: string;
  severity: string;
  confidence: number;
  riskScore: number;
  riskLevel: string;
  reasoning: string;
  sanctions: number;
  oilPriceImpact: number;
  aisImpact: number;
  extractedEntities: Record<string, unknown>;
  keywords: string[];
  llmModel: string;
  processingStatus: IntelligenceProcessingStatus;
  metadata: Record<string, unknown>;
  fetchedAt: Date;
  publishedAt: Date;
}

export interface IntelligenceMongooseDocument extends IntelligenceDocument, Document {
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelineLogDocument {
  startTime: Date;
  endTime: Date;
  articlesFetched: number;
  articlesProcessed: number;
  successfulAnalyses: number;
  failedAnalyses: number;
  executionTime: number;
  status: PipelineExecutionStatus;
  errorMessage?: string;
  duplicatesRemoved?: number;
}

export interface PipelineLogMongooseDocument extends PipelineLogDocument, Document {
  createdAt: Date;
  updatedAt: Date;
}

export interface NewsSourceDocument {
  name: string;
  type: NewsSourceProviderType;
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
  fetchInterval: number;
  lastFetchedAt?: Date | null;
  status: NewsSourceStatus;
}

export interface NewsSourceMongooseDocument extends NewsSourceDocument, Document {
  createdAt: Date;
  updatedAt: Date;
}

export type DsmMarketDirection = "up" | "down" | "mixed" | "flat";
export type DsmWarningLevel = "low" | "medium" | "high" | "critical";

export interface DsmEventClassification {
  event_type: string;
  severity: "low" | "medium" | "high" | "critical";
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
  severity: "low" | "medium" | "high" | "critical";
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

export interface DsmPredictionDocument {
  event_id: string;
  event_details: DsmEventClassification;
  news_references: Array<Record<string, unknown>>;
  current_price: number;
  historical_analysis: DsmHistoricalAnalysis;
  predicted_prices: DsmPredictedPricePoint[];
  confidence_score: number;
  warning_level: DsmWarningLevel;
  recommendation: string;
  market_impact_explanation: string;
  source: "dsm";
  metadata: Record<string, unknown>;
}

export interface DsmPredictionMongooseDocument extends DsmPredictionDocument, Document {
  createdAt: Date;
  updatedAt: Date;
}
