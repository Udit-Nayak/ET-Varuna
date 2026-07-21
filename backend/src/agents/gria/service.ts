import { preprocessArticles } from "./preprocessor";
import { fetchNews } from "./newsFetcher";
import { parseHuggingFaceOutput } from "./parser";
import { generateRawOutput } from "./model";
import { PipelineInput, PipelineResult, NewsArticle, StructuredExtractionResult, AnalysisResult, IntelligenceDocumentV2, VectorDocument } from "./types";
import { deleteById, findByCorridor, findByCountry, findById, getHistory as getRiskHistory, getLatest as getLatestRisk, saveIntelligence, saveVectorDocument, updateNewsSourceFetchTime, upsertPipelineLogStatus, vectorSearch } from "./mongoRepository";
import { getHighRiskCount } from "./analysisUtils";

const buildEmbedding = (text: string, dimensions = 384): number[] => {
  const tokens = text.toLowerCase().replace(/\s+/g, " ").split(/\W+/).filter(Boolean);
  const vector = new Array<number>(dimensions).fill(0);
  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i += 1) {
      hash = (hash * 33 + token.charCodeAt(i)) >>> 0;
    }
    vector[hash % dimensions] += 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
};

const extractWithGemma = async (article: NewsArticle): Promise<AnalysisResult> => {
  const rawOutput = await generateRawOutput({
    article: {
      title: article.title,
      description: article.description,
      content: article.content,
      source: article.source,
      publishedAt: article.publishedAt,
    },
  });
  const parsed = parseHuggingFaceOutput(rawOutput);
  const primary = parsed.items[0];
  return {
    rawOutput,
    parsedText: typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput),
    parsed: primary,
  };
};

const toIntelligenceDocument = (article: NewsArticle, analysis: AnalysisResult): IntelligenceDocumentV2 => ({
  id: article.id,
  sourceArticleId: article.id,
  headline: article.title,
  content: article.content,
  summary: analysis.parsed.shortSummary || article.description || article.content,
  countriesInvolved: analysis.parsed.countriesInvolved,
  relationWithIndia: analysis.parsed.relationWithIndia,
  oilPetroleumImpact: analysis.parsed.oilPetroleumImpact,
  financeEconomicImpact: analysis.parsed.financeEconomicImpact,
  shippingMaritimeImpact: analysis.parsed.shippingMaritimeImpact,
  tradeCorridorsAffected: analysis.parsed.tradeCorridorsAffected,
  eventType: analysis.parsed.eventType,
  severity: analysis.parsed.severity,
  confidence: analysis.parsed.confidence,
  longTermImplications: analysis.parsed.longTermImplications,
  isPermanent: analysis.parsed.isPermanent,
  keywords: article.keywords,
  metadata: {
    source: article.source,
    publishedAt: article.publishedAt,
    language: article.language,
    category: article.category,
    rawOutput: analysis.rawOutput,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const toVectorDocument = (article: NewsArticle, analysis: AnalysisResult): VectorDocument => {
  const content = [
    article.title,
    article.description,
    article.content,
    analysis.parsed.shortSummary,
    analysis.parsed.longTermImplications,
    analysis.parsed.relationWithIndia,
    analysis.parsed.oilPetroleumImpact,
    analysis.parsed.financeEconomicImpact,
    analysis.parsed.shippingMaritimeImpact,
  ].join(" ");

  return {
    id: article.id,
    sourceArticleId: article.id,
    headline: article.title,
    content,
    summary: analysis.parsed.shortSummary || article.description || article.content,
    embedding: buildEmbedding(content),
    countriesInvolved: analysis.parsed.countriesInvolved,
    relationWithIndia: analysis.parsed.relationWithIndia,
    oilPetroleumImpact: analysis.parsed.oilPetroleumImpact,
    financeEconomicImpact: analysis.parsed.financeEconomicImpact,
    shippingMaritimeImpact: analysis.parsed.shippingMaritimeImpact,
    tradeCorridorsAffected: analysis.parsed.tradeCorridorsAffected,
    eventType: analysis.parsed.eventType,
    severity: analysis.parsed.severity,
    confidence: analysis.parsed.confidence,
    isPermanent: false,
    keywords: article.keywords,
    metadata: {
      source: article.source,
      publishedAt: article.publishedAt,
      language: article.language,
      category: article.category,
      rawOutput: analysis.rawOutput,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

const runAnalysis = async (articles: NewsArticle[]): Promise<Array<{ articleId: string; analysis: AnalysisResult; stored: unknown }>> => {
  const results: Array<{ articleId: string; analysis: AnalysisResult; stored: unknown }> = [];
  for (const article of articles) {
    const analysis = await extractWithGemma(article);
    const document = analysis.parsed.isPermanent ? toIntelligenceDocument(article, analysis) : toVectorDocument(article, analysis);
    const stored = analysis.parsed.isPermanent ? await saveIntelligence(document as IntelligenceDocumentV2) : await saveVectorDocument(document as VectorDocument);
    results.push({
      articleId: article.id,
      analysis,
      stored,
    });
  }
  return results;
};

export async function analyzeNews(payload: unknown): Promise<unknown> {
  const input = (payload ?? {}) as PipelineInput;
  const fetched = await fetchNews(input);
  const preprocessed = preprocessArticles(fetched.articles);
  const analyses = await runAnalysis(preprocessed.articles);
  console.log("[GRIA] Analyze run summary", {
    fetched: fetched.articles.length,
    filteredOut: fetched.articles.length - preprocessed.articles.length,
    sentToGemma: preprocessed.articles.length,
    permanentStored: analyses.filter((item) => Boolean((item.stored as { isPermanent?: boolean } | null)?.isPermanent)).length,
    vectorStored: analyses.filter((item) => Boolean(item.stored) && !(item.stored as { isPermanent?: boolean } | null)?.isPermanent).length,
  });
  return {
    fetched: fetched.articles.length,
    preprocessed: preprocessed.articles.length,
    removed: preprocessed.removed,
    analyzed: analyses.length,
    articles: preprocessed.articles,
    analyses,
  };
}

export async function fetchLatestNews(payload: unknown): Promise<unknown> {
  const input = (payload ?? {}) as PipelineInput;
  return fetchNews(input);
}

export async function queryVectorKnowledge(payload: unknown): Promise<unknown> {
  const input = (payload ?? {}) as PipelineInput;
  const query = String(input.query ?? "").trim();
  const limit = Math.max(1, Math.min(20, input.limit ?? 10));
  if (!query) {
    throw new Error("query is required");
  }

  const embedding = buildEmbedding(query);
  return vectorSearch(embedding, limit);
}

export async function runPipeline(payload: unknown): Promise<unknown> {
  const input = (payload ?? {}) as PipelineInput;
  const pipelineStart = new Date();
  const fetched = await fetchNews(input);
  const preprocessed = preprocessArticles(fetched.articles);
  const analyses = await runAnalysis(preprocessed.articles);
  console.log("[GRIA] Pipeline run summary", {
    fetched: fetched.articles.length,
    filteredOut: fetched.articles.length - preprocessed.articles.length,
    sentToGemma: preprocessed.articles.length,
    permanentStored: analyses.filter((item) => Boolean((item.stored as { isPermanent?: boolean } | null)?.isPermanent)).length,
    vectorStored: analyses.filter((item) => Boolean(item.stored) && !(item.stored as { isPermanent?: boolean } | null)?.isPermanent).length,
  });

  const executionEnd = new Date();
  await upsertPipelineLogStatus(pipelineStart, {
    startTime: pipelineStart,
    endTime: executionEnd,
    articlesFetched: fetched.articles.length,
    articlesProcessed: preprocessed.articles.length,
    duplicatesRemoved: preprocessed.removed.duplicate,
    successfulAnalyses: analyses.filter((item) => Boolean(item.stored)).length,
    failedAnalyses: 0,
    executionTime: executionEnd.getTime() - pipelineStart.getTime(),
    status: "success",
  });

  for (const source of fetched.sourceStats) {
    if (source.fetched > 0) {
      await updateNewsSourceFetchTime(source.source, executionEnd);
    }
  }

  const result: PipelineResult = {
    summary: {
      fetched: fetched.articles.length,
      preprocessed: preprocessed.articles.length,
      extracted: analyses.length,
      stored: analyses.filter((item) => Boolean(item.stored)).length,
    },
    data: {
      analyses,
      highRiskCount: getHighRiskCount(preprocessed.articles),
    },
    articles: preprocessed.articles,
  };

  return result;
}

/** @deprecated Legacy risk-analysis compatibility method. Use vector/intelligence queries instead. */
export async function getLatestIntelligence(): Promise<unknown> {
  return getLatestRisk();
}

/** @deprecated Legacy risk-analysis compatibility method. Use vector/intelligence queries instead. */
export async function getHistory(): Promise<unknown> {
  return getRiskHistory();
}

/** @deprecated Legacy risk-analysis compatibility method. Use vector/intelligence queries instead. */
export async function getRiskDashboard(): Promise<unknown> {
  const articles = await getRiskHistory();
  const supportedCorridors = ["Hormuz", "Red Sea", "Malacca"] as const;
  const corridors = supportedCorridors.flatMap((name) => {
    const matching = articles.find((article) => {
      const record = article as unknown as Record<string, unknown>;
      const corridorNames = [
        record.corridor,
        ...(Array.isArray(record.affectedCorridors) ? record.affectedCorridors : []),
      ]
        .filter((value): value is string => typeof value === "string")
        .join(" ")
        .toLowerCase();
      return corridorNames.includes(name.toLowerCase());
    });

    if (!matching) return [];
    const record = matching as unknown as Record<string, unknown>;
    const score = Number(record.riskScore ?? record.score);
    if (!Number.isFinite(score)) return [];

    return [{ name, score: Math.round(score), updatedAt: record.updatedAt ?? record.fetchedAt ?? null }];
  });

  return {
    totalArticles: articles.length,
    highRisk: getHighRiskCount(articles),
    corridors,
  };
}

/** @deprecated Legacy risk-analysis compatibility method. Use vector/intelligence queries instead. */
export async function getArticleById(id: string): Promise<unknown> {
  return findById(id);
}

/** @deprecated Legacy risk-analysis compatibility method. Use vector/intelligence queries instead. */
export async function deleteArticle(id: string): Promise<unknown> {
  const deleted = await deleteById(id);
  return { deleted };
}

/** @deprecated Legacy risk-analysis compatibility method. Use vector/intelligence queries instead. */
export async function getRisksByCorridor(corridor: string): Promise<unknown> {
  return findByCorridor(corridor);
}

/** @deprecated Legacy risk-analysis compatibility method. Use vector/intelligence queries instead. */
export async function getRisksByCountry(country: string): Promise<unknown> {
  return findByCountry(country);
}