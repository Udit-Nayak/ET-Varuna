import { AnalysisResult, IntelligenceDocument, NewsArticle, VectorDocument } from "./types";

export const VECTOR_DIMENSIONS = Number(process.env.GRIA_VECTOR_DIMENSIONS ?? 384);
const CHUNK_TARGET_WORDS = Number(process.env.GRIA_VECTOR_CHUNK_WORDS ?? 180);
const CHUNK_OVERLAP_WORDS = Number(process.env.GRIA_VECTOR_CHUNK_OVERLAP_WORDS ?? 35);
const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004";

const normalizeText = (value: string): string => value.replace(/\s+/g, " ").trim();

export const buildEmbedding = (text: string, dimensions = VECTOR_DIMENSIONS): number[] => {
  const tokens = normalizeText(text.toLowerCase()).split(/\W+/).filter(Boolean);
  const vector = new Array<number>(dimensions).fill(0);
  for (const token of tokens) {
    let hash = 0;
    for (let index = 0; index < token.length; index += 1) {
      hash = (hash * 33 + token.charCodeAt(index)) >>> 0;
    }
    vector[hash % dimensions] += 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
};

const normalizeVector = (vector: number[], dimensions = VECTOR_DIMENSIONS): number[] => {
  const sized =
    vector.length === dimensions
      ? vector
      : vector.length > dimensions
      ? vector.slice(0, dimensions)
      : [...vector, ...new Array<number>(dimensions - vector.length).fill(0)];
  const magnitude = Math.sqrt(sized.reduce((sum, value) => sum + value * value, 0)) || 1;
  return sized.map((value) => Number((value / magnitude).toFixed(6)));
};

const geminiEmbedding = async (text: string, taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[] | null> => {
  if (process.env.GRIA_EMBEDDING_PROVIDER !== "gemini" || !process.env.GEMINI_API_KEY) return null;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        model: `models/${GEMINI_EMBEDDING_MODEL}`,
        outputDimensionality: VECTOR_DIMENSIONS,
        taskType,
        content: {
          parts: [{ text }],
        },
      }),
    });
    const payload = (await response.json()) as any;
    if (!response.ok) {
      console.warn("[GRIA embeddings] Gemini embedding failed:", payload);
      return null;
    }
    const values = payload?.embedding?.values;
    return Array.isArray(values) ? normalizeVector(values.map(Number)) : null;
  } catch (error) {
    console.warn("[GRIA embeddings] Gemini embedding skipped:", error);
    return null;
  }
};

export const buildDocumentEmbedding = async (text: string): Promise<{ embedding: number[]; provider: string }> => {
  const semantic = await geminiEmbedding(text, "RETRIEVAL_DOCUMENT");
  return semantic
    ? { embedding: semantic, provider: `gemini:${GEMINI_EMBEDDING_MODEL}` }
    : { embedding: buildEmbedding(text), provider: "local-hash-384" };
};

export const buildQueryEmbedding = async (text: string): Promise<{ embedding: number[]; provider: string }> => {
  const semantic = await geminiEmbedding(text, "RETRIEVAL_QUERY");
  return semantic
    ? { embedding: semantic, provider: `gemini:${GEMINI_EMBEDDING_MODEL}` }
    : { embedding: buildEmbedding(text), provider: "local-hash-384" };
};

const chunkText = (text: string): string[] => {
  const words = normalizeText(text).split(/\s+/).filter(Boolean);
  if (words.length <= CHUNK_TARGET_WORDS) return [words.join(" ")].filter(Boolean);

  const chunks: string[] = [];
  const step = Math.max(1, CHUNK_TARGET_WORDS - CHUNK_OVERLAP_WORDS);
  for (let start = 0; start < words.length; start += step) {
    const chunk = words.slice(start, start + CHUNK_TARGET_WORDS).join(" ");
    if (chunk) chunks.push(chunk);
    if (start + CHUNK_TARGET_WORDS >= words.length) break;
  }
  return chunks;
};

const articleVectorText = (article: NewsArticle, analysis: AnalysisResult): string =>
  [
    `Headline: ${article.title}`,
    `Description: ${article.description}`,
    `Article: ${article.content}`,
    `GRIA summary: ${analysis.parsed.shortSummary}`,
    `India relation: ${analysis.parsed.relationWithIndia}`,
    `Oil impact: ${analysis.parsed.oilPetroleumImpact}`,
    `Finance/trade impact: ${analysis.parsed.financeEconomicImpact}`,
    `Shipping impact: ${analysis.parsed.shippingMaritimeImpact}`,
    `Corridors: ${analysis.parsed.tradeCorridorsAffected.join(", ")}`,
    `Countries: ${analysis.parsed.countriesInvolved.join(", ")}`,
    `Long term implications: ${analysis.parsed.longTermImplications}`,
    `Keywords: ${article.keywords.join(", ")}`,
  ].join("\n");

const intelligenceVectorText = (document: IntelligenceDocument): string =>
  [
    `Headline: ${document.headline}`,
    `Summary: ${document.summary}`,
    `Article: ${document.content}`,
    `Reasoning: ${document.reasoning}`,
    `Countries: ${document.affectedCountries.join(", ")}`,
    `Corridors: ${document.affectedCorridors.join(", ")}`,
    `Oil impact: ${document.oilPriceImpact}`,
    `AIS/shipping impact: ${document.aisImpact}`,
    `Sanctions/finance impact: ${document.sanctions}`,
    `Keywords: ${document.keywords.join(", ")}`,
  ].join("\n");

export const vectorDocumentsFromArticle = async (article: NewsArticle, analysis: AnalysisResult): Promise<VectorDocument[]> => {
  const baseText = articleVectorText(article, analysis);
  const chunks = chunkText(baseText);
  const now = new Date().toISOString();
  const embeddings = await Promise.all(chunks.map((content) => buildDocumentEmbedding(content)));

  return chunks.map((content, index) => ({
    id: `${article.id}:chunk:${index}`,
    sourceArticleId: article.id,
    headline: article.title,
    content,
    summary: analysis.parsed.shortSummary || article.description || article.content,
    embedding: embeddings[index].embedding,
    countriesInvolved: analysis.parsed.countriesInvolved,
    relationWithIndia: analysis.parsed.relationWithIndia,
    oilPetroleumImpact: analysis.parsed.oilPetroleumImpact,
    financeEconomicImpact: analysis.parsed.financeEconomicImpact,
    shippingMaritimeImpact: analysis.parsed.shippingMaritimeImpact,
    tradeCorridorsAffected: analysis.parsed.tradeCorridorsAffected,
    eventType: analysis.parsed.eventType,
    severity: analysis.parsed.severity,
    confidence: analysis.parsed.confidence,
    isPermanent: analysis.parsed.isPermanent,
    keywords: article.keywords,
    metadata: {
      source: article.source,
      sourceUrl: article.url,
      publishedAt: article.publishedAt,
      language: article.language,
      category: article.category,
      rawOutput: analysis.rawOutput,
      storageMode: "vector_chunk",
      chunkIndex: index,
      chunkCount: chunks.length,
      chunkWords: content.split(/\s+/).filter(Boolean).length,
      embeddingModel: embeddings[index].provider,
    },
    createdAt: now,
    updatedAt: now,
  }));
};

export const vectorDocumentsFromIntelligence = async (document: IntelligenceDocument): Promise<VectorDocument[]> => {
  const text = intelligenceVectorText(document);
  const chunks = chunkText(text);
  const sourceArticleId = document.sourceUrl;
  const now = new Date().toISOString();
  const embeddings = await Promise.all(chunks.map((content) => buildDocumentEmbedding(content)));

  return chunks.map((content, index) => ({
    id: `${sourceArticleId}:chunk:${index}`,
    sourceArticleId,
    headline: document.headline,
    content,
    summary: document.summary,
    embedding: embeddings[index].embedding,
    countriesInvolved: document.affectedCountries,
    relationWithIndia: String(document.extractedEntities?.relationWithIndia ?? ""),
    oilPetroleumImpact: String(document.oilPriceImpact),
    financeEconomicImpact: String(document.sanctions),
    shippingMaritimeImpact: String(document.aisImpact),
    tradeCorridorsAffected: document.affectedCorridors,
    eventType: document.eventType,
    severity: document.severity,
    confidence: document.confidence,
    isPermanent: Boolean(document.metadata?.isPermanent ?? true),
    keywords: document.keywords,
    metadata: {
      ...document.metadata,
      source: document.source,
      sourceUrl: document.sourceUrl,
      publishedAt: document.publishedAt,
      storageMode: "vector_chunk_backfill",
      chunkIndex: index,
      chunkCount: chunks.length,
      chunkWords: content.split(/\s+/).filter(Boolean).length,
      embeddingModel: embeddings[index].provider,
    },
    createdAt: now,
    updatedAt: now,
  }));
};
