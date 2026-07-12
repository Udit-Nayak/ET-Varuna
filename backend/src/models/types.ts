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

