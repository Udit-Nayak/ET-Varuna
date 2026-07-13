import { Collection } from "mongoose";
import { IntelligenceModel, NewsSourceModel, PipelineLogModel } from "../../models";
import { IntelligenceDocument, IntelligenceDocumentV2, NewsSourceDocument, PipelineLogDocument, RiskModelInput, RiskRecord, VectorDocument } from "./types";

const VECTOR_COLLECTION = "griaVectorDocuments";

const buildId = (input: RiskModelInput): string =>
  `${input.country}:${input.corridor}:${input.event}:${input.sourceArticleIds.join(",")}`.toLowerCase();

const normalizeText = (value: string): string => value.replace(/\s+/g, " ").trim();

const createEmbedding = (text: string, dimensions = 384): number[] => {
  const tokens = normalizeText(text.toLowerCase()).split(/\W+/).filter(Boolean);
  const vector = new Array<number>(dimensions).fill(0);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    let hash = 0;
    for (let j = 0; j < token.length; j += 1) {
      hash = (hash * 31 + token.charCodeAt(j)) >>> 0;
    }
    vector[hash % dimensions] += 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
};

const vectorCollection = (): Collection => IntelligenceModel.db.collection(VECTOR_COLLECTION);

export async function saveIntelligence(document: IntelligenceDocumentV2): Promise<IntelligenceDocument> {
  const now = new Date();
  const sanctions = Number(document.metadata.sanctions ?? 0);
  const oilPriceImpact = Number(document.metadata.oilPriceImpact ?? 0);
  const aisImpact = Number(document.metadata.aisImpact ?? 0);
  const payload: Omit<IntelligenceDocument, "sourceUrl"> = {
    headline: document.headline,
    content: document.content,
    summary: document.summary,
    source: "gria",
    country: document.countriesInvolved[0] ?? "unknown",
    affectedCountries: document.countriesInvolved,
    corridor: document.tradeCorridorsAffected[0] ?? "general",
    affectedCorridors: document.tradeCorridorsAffected,
    eventType: document.eventType,
    severity: document.severity,
    confidence: document.confidence,
    riskScore: document.isPermanent ? 100 : 50,
    riskLevel: document.severity === "critical" ? "Critical" : document.severity === "high" ? "High" : document.severity === "medium" ? "Medium" : "Low",
    reasoning: document.longTermImplications || document.summary,
    sanctions,
    oilPriceImpact,
    aisImpact,
    extractedEntities: {
      countriesInvolved: document.countriesInvolved,
      relationWithIndia: document.relationWithIndia,
      longTermImplications: document.longTermImplications,
    },
    keywords: document.keywords,
    llmModel: "gemma-2b",
    processingStatus: "completed",
    metadata: {
      ...document.metadata,
      isPermanent: document.isPermanent,
      storageMode: "intelligence",
    },
    fetchedAt: now.toISOString(),
    publishedAt: now.toISOString(),
  };

  await IntelligenceModel.updateOne(
    { sourceUrl: document.sourceArticleId },
    { $set: payload, $setOnInsert: { sourceUrl: document.sourceArticleId } },
    { upsert: true, runValidators: true }
  ).exec();

  const saved = await IntelligenceModel.findOne({ sourceUrl: document.sourceArticleId }).lean();
  if (!saved) {
    throw new Error("Failed to persist intelligence document");
  }
  return saved as unknown as IntelligenceDocument;
}

export async function saveVectorDocument(document: VectorDocument): Promise<VectorDocument> {
  const collection = vectorCollection();
  await collection.updateOne(
    { id: document.id },
    {
      $set: {
        id: document.id,
        sourceArticleId: document.sourceArticleId,
        headline: document.headline,
        content: document.content,
        summary: document.summary,
        embedding: document.embedding,
        countriesInvolved: document.countriesInvolved,
        relationWithIndia: document.relationWithIndia,
        oilPetroleumImpact: document.oilPetroleumImpact,
        financeEconomicImpact: document.financeEconomicImpact,
        shippingMaritimeImpact: document.shippingMaritimeImpact,
        tradeCorridorsAffected: document.tradeCorridorsAffected,
        eventType: document.eventType,
        severity: document.severity,
        confidence: document.confidence,
        isPermanent: document.isPermanent,
        keywords: document.keywords,
        metadata: {
          ...document.metadata,
          storageMode: "vector",
        },
        updatedAt: new Date().toISOString(),
      },
      $setOnInsert: {
        createdAt: document.createdAt,
      },
    },
    { upsert: true }
  );

  const saved = await collection.findOne({ id: document.id });
  if (!saved) {
    throw new Error("Failed to persist vector document");
  }
  return saved as unknown as VectorDocument;
}

export async function vectorSearch(queryEmbedding: number[], limit = 10): Promise<VectorDocument[]> {
  const collection = vectorCollection();
  try {
    const results = await collection
      .aggregate([
        {
          $vectorSearch: {
            index: "griaVectorIndex",
            path: "embedding",
            queryVector: queryEmbedding,
            numCandidates: Math.max(100, limit * 10),
            limit,
          },
        },
        { $project: { score: { $meta: "vectorSearchScore" }, _id: 0 } },
      ])
      .toArray();
    return results as unknown as VectorDocument[];
  } catch {
    const docs = (await collection.find({}).toArray()) as unknown as VectorDocument[];
    return docs
      .map((doc) => {
        const score = doc.embedding.reduce((sum, value, index) => sum + value * (queryEmbedding[index] ?? 0), 0);
        return { ...doc, metadata: { ...doc.metadata, score } };
      })
      .sort((a, b) => Number((b.metadata.score as number) ?? 0) - Number((a.metadata.score as number) ?? 0))
      .slice(0, limit);
  }
}

const articleToIntelligence = (input: RiskModelInput, risk: RiskRecord): IntelligenceDocumentV2 => ({
  id: buildId(input),
  sourceArticleId: input.sourceArticleIds[0] ?? buildId(input),
  headline: input.event,
  content: input.summary,
  summary: input.summary,
  countriesInvolved: [input.country].filter(Boolean),
  relationWithIndia: input.country.toLowerCase() === "india" ? "Direct India linkage" : `Relevant to India through ${input.corridor}`,
  oilPetroleumImpact: String(risk.oilPriceChange ?? 0),
  financeEconomicImpact: String(risk.sanctions ?? 0),
  shippingMaritimeImpact: String(risk.aisDisruption ?? 0),
  tradeCorridorsAffected: input.affectedRoutes,
  eventType: input.risk.eventType,
  severity: input.risk.severity,
  confidence: input.risk.confidence,
  longTermImplications: input.summary,
  isPermanent: true,
  keywords: input.affectedRoutes,
  metadata: {
    sourceArticleIds: input.sourceArticleIds,
    breakdown: risk.breakdown,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

/** @deprecated Legacy compatibility only. Prefer saveIntelligence() and saveVectorDocument(). */
export async function saveRisk(input: RiskModelInput, risk: RiskRecord): Promise<RiskRecord> {
  const intelligence = await saveIntelligence(articleToIntelligence(input, risk));
  return {
    id: input.sourceArticleIds[0] ?? buildId(input),
    country: intelligence.country,
    corridor: intelligence.corridor,
    event: intelligence.headline,
    summary: intelligence.summary,
    affectedRoutes: intelligence.affectedCorridors,
    sourceArticleIds: [input.sourceArticleIds[0] ?? buildId(input)],
    severity: input.risk.severity,
    aisDisruption: input.risk.aisDisruption,
    oilPriceChange: input.risk.oilPriceChange,
    sanctions: input.risk.sanctions,
    eventType: input.risk.eventType,
    confidence: input.risk.confidence,
    score: risk.score,
    level: risk.level,
    breakdown: risk.breakdown,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** @deprecated Legacy compatibility only. Prefer vector/intelligence read APIs. */
export async function getLatest(): Promise<RiskRecord | null> {
  const doc = await IntelligenceModel.findOne().sort({ updatedAt: -1 }).lean();
  return (doc as unknown as RiskRecord | null) ?? null;
}

/** @deprecated Legacy compatibility only. Prefer vector/intelligence read APIs. */
export async function getHistory(): Promise<RiskRecord[]> {
  return (await IntelligenceModel.find().sort({ updatedAt: -1 }).lean()) as unknown as RiskRecord[];
}

/** @deprecated Legacy compatibility only. Prefer vector/intelligence read APIs. */
export async function findByCorridor(corridor: string): Promise<RiskRecord[]> {
  return (await IntelligenceModel.find({ corridor }).sort({ updatedAt: -1 }).lean()) as unknown as RiskRecord[];
}

/** @deprecated Legacy compatibility only. Prefer vector/intelligence read APIs. */
export async function findByCountry(country: string): Promise<RiskRecord[]> {
  return (await IntelligenceModel.find({ country }).sort({ updatedAt: -1 }).lean()) as unknown as RiskRecord[];
}

/** @deprecated Legacy compatibility only. Prefer vector/intelligence read APIs. */
export async function findById(id: string): Promise<RiskRecord | null> {
  return (await IntelligenceModel.findOne({ sourceUrl: id }).lean()) as unknown as RiskRecord | null;
}

/** @deprecated Legacy compatibility only. Prefer vector/intelligence read APIs. */
export async function deleteById(id: string): Promise<boolean> {
  const result = await IntelligenceModel.deleteOne({ sourceUrl: id });
  return result.deletedCount > 0;
}

export async function createPipelineLog(log: PipelineLogDocument): Promise<PipelineLogDocument> {
  const created = await PipelineLogModel.create(log);
  return created.toObject() as PipelineLogDocument;
}

export async function getPipelineLogs(): Promise<PipelineLogDocument[]> {
  return (await PipelineLogModel.find().sort({ startTime: -1 }).lean()) as PipelineLogDocument[];
}

export async function createNewsSource(source: NewsSourceDocument): Promise<NewsSourceDocument> {
  const created = await NewsSourceModel.create(source);
  return created.toObject() as NewsSourceDocument;
}

export async function getNewsSources(): Promise<NewsSourceDocument[]> {
  return (await NewsSourceModel.find().sort({ createdAt: -1 }).lean()) as NewsSourceDocument[];
}

export async function updateNewsSource(name: string, source: Partial<NewsSourceDocument>): Promise<NewsSourceDocument | null> {
  return (await NewsSourceModel.findOneAndUpdate({ name }, source, { new: true }).lean()) as NewsSourceDocument | null;
}

export async function deleteNewsSource(name: string): Promise<boolean> {
  const result = await NewsSourceModel.deleteOne({ name });
  return result.deletedCount > 0;
}

export async function updateNewsSourceFetchTime(name: string, lastFetchedAt: Date): Promise<void> {
  await NewsSourceModel.updateOne({ name }, { $set: { lastFetchedAt, status: "active" } });
}

export async function upsertPipelineLogStatus(startTime: Date, fields: Partial<PipelineLogDocument>): Promise<void> {
  await PipelineLogModel.updateOne({ startTime }, { $set: fields }, { upsert: true });
}

export async function initGriaIndexes(): Promise<void> {
  await Promise.all([IntelligenceModel.init(), NewsSourceModel.init(), PipelineLogModel.init()]);
}
