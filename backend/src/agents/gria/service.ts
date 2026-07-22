import { preprocessArticles } from "./preprocessor";
import { fetchNews } from "./newsFetcher";
import { parseHuggingFaceOutput } from "./parser";
import { generateRawOutput } from "./model";
import { PipelineInput, PipelineResult, NewsArticle, AnalysisResult, VectorDocument } from "./types";
import { deleteById, findByCorridor, findByCountry, findById, findExistingVectorArticleIds, getHistory as getRiskHistory, getLatest as getLatestRisk, getNewsSources, getRecentVectorCandidates, replaceVectorDocumentsForArticle, updateNewsSourceFetchTime, upsertPipelineLogStatus, vectorSearch } from "./mongoRepository";
import { getHighRiskCount } from "./analysisUtils";
import { buildQueryEmbedding, vectorDocumentsFromArticle } from "./vectorizer";
import { invokeGroqChatWithLangChain, Varuna_GROQ_MODEL } from "../langchain/llm";
import { extractJsonObject } from "../langchain/parser";

const textSimilarity = (left: string, right: string): number => {
  const a = new Set(left.toLowerCase().split(/\W+/).filter(Boolean));
  const b = new Set(right.toLowerCase().split(/\W+/).filter(Boolean));
  const shared = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : shared / union;
};

const sourceLastFetchedMap = async (): Promise<Record<string, string>> => {
  const sources = await getNewsSources();
  return Object.fromEntries(
    sources
      .filter((source) => source.lastFetchedAt)
      .flatMap((source) => [
        [source.name, String(source.lastFetchedAt)],
        [source.name.toLowerCase(), String(source.lastFetchedAt)],
        [source.baseUrl, String(source.lastFetchedAt)],
        [source.baseUrl.toLowerCase(), String(source.lastFetchedAt)],
      ])
  );
};

const filterAlreadyVectorized = async (articles: NewsArticle[]): Promise<{ articles: NewsArticle[]; skippedExisting: number; skippedSimilar: number }> => {
  const existingIds = await findExistingVectorArticleIds(articles.map((article) => article.id));
  const recentCandidates = await getRecentVectorCandidates();
  let skippedExisting = 0;
  let skippedSimilar = 0;
  const filtered: NewsArticle[] = [];

  for (const article of articles) {
    if (existingIds.has(article.id)) {
      skippedExisting += 1;
      continue;
    }

    const similar = recentCandidates.some((candidate) => {
      if (candidate.sourceArticleId === article.id) return true;
      const titleSimilarity = textSimilarity(candidate.headline ?? "", article.title);
      const contentSimilarity = textSimilarity(candidate.content ?? "", `${article.title} ${article.description} ${article.content}`);
      return titleSimilarity >= 0.92 || contentSimilarity >= 0.86;
    });
    if (similar) {
      skippedSimilar += 1;
      continue;
    }

    filtered.push(article);
  }

  return { articles: filtered, skippedExisting, skippedSimilar };
};

const lexicalScore = (query: string, document: VectorDocument): number => {
  const queryTokens = new Set(query.toLowerCase().split(/\W+/).filter((token) => token.length > 2));
  const text = `${document.headline} ${document.summary} ${document.content} ${document.keywords.join(" ")} ${document.tradeCorridorsAffected.join(" ")}`.toLowerCase();
  return [...queryTokens].reduce((score, token) => score + (text.includes(token) ? 1 : 0), 0);
};

const geminiRerank = async (query: string, documents: VectorDocument[], limit: number): Promise<VectorDocument[] | null> => {
  if (process.env.GRIA_RERANK_PROVIDER !== "gemini" || !process.env.GEMINI_API_KEY || documents.length === 0) return null;

  try {
    const prompt = JSON.stringify({
      query,
      documents: documents.map((document, index) => ({
        index,
        headline: document.headline,
        summary: document.summary,
        eventType: document.eventType,
        severity: document.severity,
        corridors: document.tradeCorridorsAffected,
        countries: document.countriesInvolved,
        content: document.content.slice(0, 700),
      })),
      instruction: `Return JSON only: {"rankedIndexes":[number,...]}. Pick the ${limit} most useful documents for GRIA to pass to DSM, SROA and APO.`,
    });
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-2.0-flash"}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
      }),
    });
    const payload = (await response.json()) as any;
    if (!response.ok) return null;
    const text = String(payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("") ?? "");
    const jsonText = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    const parsed = JSON.parse(jsonText) as { rankedIndexes?: number[] };
    const ranked = (parsed.rankedIndexes ?? [])
      .map((index) => documents[index])
      .filter((document): document is VectorDocument => Boolean(document));
    return ranked.length > 0 ? ranked.slice(0, limit) : null;
  } catch (error) {
    console.warn("[GRIA rerank] Gemini rerank skipped:", error);
    return null;
  }
};

const langChainGroqRerank = async (query: string, documents: VectorDocument[], limit: number): Promise<VectorDocument[] | null> => {
  const provider = process.env.GRIA_RERANK_PROVIDER;
  if (provider !== "langchain-groq" && provider !== "groq") return null;
  if (documents.length === 0) return null;

  const result = await invokeGroqChatWithLangChain({
    model: process.env.GRIA_RERANK_MODEL || process.env.GROQ_MODEL || Varuna_GROQ_MODEL,
    maxOutputTokens: 450,
    temperature: 0.1,
    responseFormat: "json_object",
    traceName: "gria-vector-rerank",
    systemInstruction: [
      "You rerank already-retrieved GRIA vector-search documents.",
      "Do not invent documents or facts.",
      "Return JSON only as {\"rankedIndexes\":[number,...]}.",
      "Choose documents most useful for India energy supply-chain risk, oil markets, maritime chokepoints, sanctions, trade routes, and procurement/reserve decisions.",
    ].join(" "),
    prompt: JSON.stringify({
      query,
      limit,
      documents: documents.map((document, index) => ({
        index,
        headline: document.headline,
        summary: document.summary,
        eventType: document.eventType,
        severity: document.severity,
        corridors: document.tradeCorridorsAffected,
        countries: document.countriesInvolved,
        content: document.content.slice(0, 650),
      })),
    }),
  });

  const parsed = result?.text ? extractJsonObject<{ rankedIndexes?: number[] }>(result.text) : null;
  const ranked = (parsed?.rankedIndexes ?? [])
    .map((index) => documents[index])
    .filter((document): document is VectorDocument => Boolean(document));
  return ranked.length > 0 ? ranked.slice(0, limit) : null;
};

const rerankVectorMatches = async (query: string, documents: VectorDocument[], limit: number): Promise<VectorDocument[]> => {
  const langChainRanked = await langChainGroqRerank(query, documents, limit);
  if (langChainRanked) return langChainRanked;

  const geminiRanked = await geminiRerank(query, documents, limit);
  if (geminiRanked) return geminiRanked;

  return documents
    .map((document) => ({
      document,
      score: Number((document as any).score ?? document.metadata?.score ?? 0) + lexicalScore(query, document) * 0.08,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ document, score }) => ({ ...document, metadata: { ...document.metadata, rerankScore: score } }));
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

const runAnalysis = async (articles: NewsArticle[]): Promise<Array<{ articleId: string; analysis?: AnalysisResult; stored: unknown; vectorStored: number; error?: string }>> => {
  const results: Array<{ articleId: string; analysis?: AnalysisResult; stored: unknown; vectorStored: number; error?: string }> = [];
  for (const article of articles) {
    try {
      const analysis = await extractWithGemma(article);
      const vectorDocuments = await vectorDocumentsFromArticle(article, analysis);
      const storedVectors = await replaceVectorDocumentsForArticle(article.id, vectorDocuments);
      results.push({
        articleId: article.id,
        analysis,
        stored: {
          vectors: storedVectors,
        },
        vectorStored: storedVectors.length,
      });
    } catch (error) {
      results.push({
        articleId: article.id,
        stored: null,
        vectorStored: 0,
        error: error instanceof Error ? error.message : "Analysis failed",
      });
    }
  }
  return results;
};

export async function analyzeNews(payload: unknown): Promise<unknown> {
  const input = (payload ?? {}) as PipelineInput;
  const fetched = await fetchNews({ ...input, sourceLastFetchedAt: input.sourceLastFetchedAt ?? (await sourceLastFetchedMap()) });
  const preprocessed = preprocessArticles(fetched.articles);
  const deduped = await filterAlreadyVectorized(preprocessed.articles);
  const analyses = await runAnalysis(deduped.articles);
  console.log("[GRIA] Analyze run summary", {
    fetched: fetched.articles.length,
    filteredOut: fetched.articles.length - preprocessed.articles.length,
    skippedExisting: deduped.skippedExisting,
    skippedSimilar: deduped.skippedSimilar,
    sentToGemma: deduped.articles.length,
    vectorStored: analyses.reduce((sum, item) => sum + item.vectorStored, 0),
  });
  return {
    fetched: fetched.articles.length,
    preprocessed: preprocessed.articles.length,
    removed: preprocessed.removed,
    skippedExisting: deduped.skippedExisting,
    skippedSimilar: deduped.skippedSimilar,
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

  const { embedding } = await buildQueryEmbedding(query);
  const candidates = await vectorSearch(embedding, Math.min(50, Math.max(limit * 4, limit)));
  return rerankVectorMatches(query, candidates, limit);
}

export async function runPipeline(payload: unknown): Promise<unknown> {
  const input = (payload ?? {}) as PipelineInput;
  const pipelineStart = new Date();
  const fetched = await fetchNews({ ...input, sourceLastFetchedAt: input.sourceLastFetchedAt ?? (await sourceLastFetchedMap()) });
  const preprocessed = preprocessArticles(fetched.articles);
  const deduped = await filterAlreadyVectorized(preprocessed.articles);
  const analyses = await runAnalysis(deduped.articles);
  console.log("[GRIA] Pipeline run summary", {
    fetched: fetched.articles.length,
    filteredOut: fetched.articles.length - preprocessed.articles.length,
    skippedExisting: deduped.skippedExisting,
    skippedSimilar: deduped.skippedSimilar,
    sentToGemma: deduped.articles.length,
    vectorStored: analyses.reduce((sum, item) => sum + item.vectorStored, 0),
  });

  const executionEnd = new Date();
  await upsertPipelineLogStatus(pipelineStart, {
    startTime: pipelineStart,
    endTime: executionEnd,
    articlesFetched: fetched.articles.length,
    articlesProcessed: deduped.articles.length,
    duplicatesRemoved: preprocessed.removed.duplicate,
    successfulAnalyses: analyses.filter((item) => item.vectorStored > 0).length,
    failedAnalyses: analyses.filter((item) => item.error).length,
    executionTime: executionEnd.getTime() - pipelineStart.getTime(),
    status: "success",
  });

  for (const source of fetched.sourceStats) {
    if (source.fetched > 0) {
      await updateNewsSourceFetchTime(source.sourceId ?? source.source, executionEnd, {
        type: source.sourceType,
        baseUrl: source.source,
      });
    }
  }

  const result: PipelineResult = {
    summary: {
      fetched: fetched.articles.length,
      preprocessed: deduped.articles.length,
      extracted: analyses.filter((item) => item.analysis).length,
      stored: analyses.reduce((sum, item) => sum + item.vectorStored, 0),
    },
    data: {
      analyses,
      highRiskCount: getHighRiskCount(preprocessed.articles),
      vectorChunksStored: analyses.reduce((sum, item) => sum + item.vectorStored, 0),
      skippedExisting: deduped.skippedExisting,
      skippedSimilar: deduped.skippedSimilar,
      failed: analyses.filter((item) => item.error),
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
  return {
    totalArticles: articles.length,
    highRisk: getHighRiskCount(articles),
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
