export type NewsSourceType = "newsapi" | "gdelt" | "rss" | "custom";

export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export interface NewsSourceConfig {
  id: string;
  name: string;
  type: NewsSourceType;
  enabled: boolean;
  endpoint: string;
  categories?: string[];
  headers?: Record<string, string>;
  params?: Record<string, string>;
}

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  content: string;
  url: string;
  source: string;
  publishedAt: string;
  category: string;
  language: string;
  author?: string;
  keywords: string[];
  raw?: unknown;
}

export interface ParsedNews {
  items: NewsArticle[];
  total: number;
  source: string;
}

export interface LLMResponse {
  rawOutput: unknown;
  parsedText: string;
  json: unknown;
}

export interface RiskScore {
  score: number;
  level: RiskLevel;
  breakdown: RiskFactorBreakdown;
}

export type RiskScoreResult = RiskScore;

export interface RiskFactorBreakdown {
  severity: number;
  aisDisruption: number;
  oilPriceChange: number;
  sanctions: number;
  eventType: number;
  confidence: number;
}

export interface RiskAnalysis {
  id: string;
  country: string;
  corridor: string;
  event: string;
  summary: string;
  affectedRoutes: string[];
  sourceArticleIds: string[];
  severity: "low" | "medium" | "high" | "critical";
  aisDisruption: number;
  oilPriceChange: number;
  sanctions: number;
  eventType: string;
  confidence: number;
  score: number;
  level: RiskLevel;
  breakdown: RiskFactorBreakdown;
  createdAt: string;
  updatedAt: string;
}

export type RiskRecord = RiskAnalysis;

export interface MongoDocument extends RiskAnalysis {
  _id?: unknown;
}

export interface ApiRequestBody {
  query?: string;
  limit?: number;
  sources?: string[];
  categories?: string[];
  country?: string;
  corridor?: string;
  id?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface PipelineInput extends ApiRequestBody {}

export interface FetchResult {
  articles: NewsArticle[];
  sourceStats: Array<{
    source: string;
    fetched: number;
    normalized: number;
    errors: string[];
  }>;
}

export interface PreprocessResult {
  articles: NewsArticle[];
  removed: {
    duplicate: number;
    irrelevant: number;
    malformed: number;
  };
}

export interface GeopoliticalExtraction {
  country: string;
  corridor: string;
  event: string;
  severity: "low" | "medium" | "high" | "critical";
  actors: string[];
  summary: string;
  confidence: number;
  affectedRoutes: string[];
}

export interface GeopoliticalExtractionResponse {
  items: GeopoliticalExtraction[];
  raw: unknown;
}

export interface StructuredExtractionResult {
  rawOutput: unknown;
  parsed: Record<string, unknown>;
}

export interface RiskInputs {
  severity: GeopoliticalExtraction["severity"];
  aisDisruption: number;
  oilPriceChange: number;
  sanctions: number;
  eventType: string;
  confidence: number;
}

export interface RiskModelInput {
  country: string;
  corridor: string;
  event: string;
  summary: string;
  affectedRoutes: string[];
  sourceArticleIds: string[];
  risk: RiskInputs;
}

export type IntelligenceProcessingStatus = "pending" | "processing" | "completed" | "failed";
export type PipelineExecutionStatus = "success" | "partial_success" | "failed" | "running";
export type NewsSourceStatus = "active" | "inactive" | "error";
export type NewsSourceProviderType = "NewsAPI" | "RSS" | "GDELT" | "Custom";

export interface IntelligenceDocument extends Omit<RiskAnalysis, "id" | "affectedRoutes" | "sourceArticleIds" | "breakdown"> {
  headline: string;
  content: string;
  summary: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  fetchedAt: string;
  country: string;
  affectedCountries: string[];
  corridor: string;
  affectedCorridors: string[];
  eventType: string;
  confidence: number;
  riskScore: number;
  riskLevel: RiskLevel;
  reasoning: string;
  sanctions: number;
  oilPriceImpact: number;
  aisImpact: number;
  extractedEntities: Record<string, unknown>;
  keywords: string[];
  llmModel: string;
  processingStatus: IntelligenceProcessingStatus;
  metadata: Record<string, unknown>;
}

export interface NewsSourceDocument {
  name: string;
  type: NewsSourceProviderType;
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
  fetchInterval: number;
  lastFetchedAt?: string | null;
  status: NewsSourceStatus;
}

export interface PipelineLogDocument {
  startTime: Date;
  endTime: Date;
  articlesFetched: number;
  articlesProcessed: number;
  duplicatesRemoved: number;
  successfulAnalyses: number;
  failedAnalyses: number;
  executionTime: number;
  status: PipelineExecutionStatus;
  errorMessage?: string;
}

export interface IntelligenceApiRequest extends ApiRequestBody {
  headline?: string;
}

export interface IntelligenceApiResponse<T> extends ApiResponse<T> {}

export interface PipelineSummary {
  fetched: number;
  preprocessed: number;
  extracted: number;
  stored: number;
}

export interface PipelineResult {
  summary: PipelineSummary;
  data: Record<string, unknown>;
  articles: NewsArticle[];
}
