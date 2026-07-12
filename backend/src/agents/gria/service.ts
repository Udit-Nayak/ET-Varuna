import { preprocessArticles } from "./preprocessor";
import { fetchNews } from "./newsFetcher";
import { parseHuggingFaceOutput } from "./parser";
import { generateRawOutput } from "./model";
import { calculateRisk } from "./riskCalculator";
import { PipelineInput, PipelineResult, NewsArticle, StructuredExtractionResult } from "./type";
import {
  deleteById,
  findByCorridor,
  findByCountry,
  findById,
  getHistory as getRiskHistory,
  getLatest as getLatestRisk,
  saveRisk,
  updateNewsSourceFetchTime,
  upsertPipelineLogStatus,
} from "./mongoRepository";
import { deriveRiskInputs, getHighRiskCount } from "./analysisUtils";

const extractWithHuggingFace = async (article: NewsArticle): Promise<StructuredExtractionResult> => {
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
  return {
    rawOutput,
    parsed: {
      items: parsed.items,
      raw: parsed.raw,
      theme: article.category,
    },
  };
};

const validateExtraction = async (extraction: StructuredExtractionResult): Promise<Record<string, unknown>> => ({
  ...extraction.parsed,
  validation: {
    passed: true,
    issues: [],
  },
});

export async function analyzeNews(payload: unknown): Promise<unknown> {
  const input = (payload ?? {}) as PipelineInput;
  const fetched = await fetchNews(input);
  const preprocessed = preprocessArticles(fetched.articles);
  return {
    fetched: fetched.articles.length,
    preprocessed: preprocessed.articles.length,
    removed: preprocessed.removed,
    articles: preprocessed.articles,
  };
}

export async function fetchLatestNews(payload: unknown): Promise<unknown> {
  const input = (payload ?? {}) as PipelineInput;
  return fetchNews(input);
}

export async function runPipeline(payload: unknown): Promise<unknown> {
  const input = (payload ?? {}) as PipelineInput;
  const pipelineStart = new Date();
  const fetched = await fetchNews(input);
  const preprocessed = preprocessArticles(fetched.articles);
  const analyses: Array<{
    articleId: string;
    validated: Record<string, unknown>;
    riskInputs: ReturnType<typeof deriveRiskInputs>;
    calculatedRisk: ReturnType<typeof calculateRisk>;
    stored: unknown;
  }> = [];
  let failedAnalyses = 0;
  let successfulAnalyses = 0;

  for (const article of preprocessed.articles) {
    try {
      const extraction = await extractWithHuggingFace(article);
      const validated = await validateExtraction(extraction);
      const riskInputs = deriveRiskInputs(article);
      const calculatedRisk = calculateRisk(riskInputs);
      const parsedItems = validated.items as Array<{ country?: string; affectedRoutes?: string[] }> | undefined;
      const primaryItem = parsedItems?.[0];
      console.log("[GRIA][Pipeline] Saving analysis", {
        articleId: article.id,
        title: article.title,
        source: article.source,
      });
      const stored = await saveRisk(
        {
          country: primaryItem?.country || "unknown",
          corridor: article.category || "general",
          event: article.title,
          summary: article.description || article.content,
          affectedRoutes: primaryItem?.affectedRoutes ?? article.keywords,
          sourceArticleIds: [article.id],
          risk: riskInputs,
        },
        {
          id: "",
          country: primaryItem?.country || "unknown",
          corridor: article.category || "general",
          event: article.title,
          summary: article.description || article.content,
          affectedRoutes: primaryItem?.affectedRoutes ?? article.keywords,
          sourceArticleIds: [article.id],
          severity: riskInputs.severity,
          aisDisruption: riskInputs.aisDisruption,
          oilPriceChange: riskInputs.oilPriceChange,
          sanctions: riskInputs.sanctions,
          eventType: riskInputs.eventType,
          confidence: riskInputs.confidence,
          score: calculatedRisk.score,
          level: calculatedRisk.level,
          breakdown: calculatedRisk.breakdown,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      );
      console.log("[GRIA][Pipeline] Saved analysis", {
        articleId: article.id,
        title: article.title,
      });

      analyses.push({
        articleId: article.id,
        validated,
        riskInputs,
        calculatedRisk,
        stored,
      });
      successfulAnalyses += 1;
    } catch (error) {
      failedAnalyses += 1;
      console.error("[GRIA][Pipeline] Analysis failed", {
        articleId: article.id,
        title: article.title,
        error: error instanceof Error ? error.message : String(error),
      });
      analyses.push({
        articleId: article.id,
        validated: {
          error: error instanceof Error ? error.message : "Unknown article processing error",
        },
        riskInputs: deriveRiskInputs(article),
        calculatedRisk: calculateRisk(deriveRiskInputs(article)),
        stored: null,
      });
    }
  }

  const executionEnd = new Date();
  await upsertPipelineLogStatus(pipelineStart, {
    startTime: pipelineStart,
    endTime: executionEnd,
    articlesFetched: fetched.articles.length,
    articlesProcessed: preprocessed.articles.length,
    duplicatesRemoved: preprocessed.removed.duplicate,
    successfulAnalyses,
    failedAnalyses,
    executionTime: executionEnd.getTime() - pipelineStart.getTime(),
    status: failedAnalyses > 0 && successfulAnalyses > 0 ? "partial_success" : failedAnalyses > 0 ? "failed" : "success",
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

export async function getLatestIntelligence(): Promise<unknown> {
  return getLatestRisk();
}

export async function getHistory(): Promise<unknown> {
  return getRiskHistory();
}

export async function getRiskDashboard(): Promise<unknown> {
  const articles = await getRiskHistory();
  return {
    totalArticles: articles.length,
    highRisk: getHighRiskCount(articles),
  };
}

export async function getArticleById(id: string): Promise<unknown> {
  return findById(id);
}

export async function deleteArticle(id: string): Promise<unknown> {
  const deleted = await deleteById(id);
  return { deleted };
}

export async function getRisksByCorridor(corridor: string): Promise<unknown> {
  return findByCorridor(corridor);
}

export async function getRisksByCountry(country: string): Promise<unknown> {
  return findByCountry(country);
}
