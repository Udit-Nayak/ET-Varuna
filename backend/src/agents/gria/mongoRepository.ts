import { IntelligenceModel, NewsSourceModel, PipelineLogModel } from "../../models";
import { NewsSourceDocument, PipelineLogDocument, RiskModelInput, RiskRecord } from "./types";

const buildId = (input: RiskModelInput): string =>
  `${input.country}:${input.corridor}:${input.event}:${input.sourceArticleIds.join(",")}`.toLowerCase();

export async function saveRisk(input: RiskModelInput, risk: RiskRecord): Promise<RiskRecord> {
  const sourceUrl = input.sourceArticleIds[0] ?? buildId(input);
  const record: RiskRecord = {
    id: buildId(input),
    country: input.country,
    corridor: input.corridor,
    event: input.event,
    summary: input.summary,
    affectedRoutes: input.affectedRoutes,
    sourceArticleIds: input.sourceArticleIds,
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

  try {
    const updateResult = await IntelligenceModel.updateOne(
      { sourceUrl },
      {
        $set: {
          headline: record.event,
          content: record.summary,
          summary: record.summary,
          source: "gria",
          publishedAt: new Date(),
          country: record.country,
          affectedCountries: [record.country].filter(Boolean),
          corridor: record.corridor,
          affectedCorridors: [record.corridor].filter(Boolean),
          eventType: record.eventType,
          severity: record.severity,
          confidence: record.confidence,
          riskScore: record.score,
          riskLevel: record.level,
          reasoning: record.summary,
          sanctions: record.sanctions,
          oilPriceImpact: record.oilPriceChange,
          aisImpact: record.aisDisruption,
          extractedEntities: {
            actors: [],
          },
          keywords: record.affectedRoutes,
          llmModel: "gemma-2b",
          processingStatus: "completed",
          metadata: {
            sourceArticleIds: record.sourceArticleIds,
            breakdown: record.breakdown,
          },
        },
        $setOnInsert: {
          sourceUrl,
        },
      },
      {
        upsert: true,
        runValidators: true,
      }
    ).exec();

    const saved = await IntelligenceModel.findOne({ sourceUrl }).lean();

    if (!saved) {
      console.error("[GRIA][Mongo] saveRisk completed but document was not found", {
        sourceUrl,
        recordId: record.id,
      });
      throw new Error(`Failed to persist intelligence record for ${record.id}`);
    }

    console.log("[GRIA][Mongo] saveRisk succeeded", {
      sourceUrl,
      recordId: record.id,
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
      upsertedCount: updateResult.upsertedCount,
      collection: IntelligenceModel.collection.name,
    });
  } catch (error) {
    console.error("[GRIA][Mongo] saveRisk failed", {
      sourceUrl,
      recordId: record.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  return record;
}

export async function getLatest(): Promise<RiskRecord | null> {
  return (await IntelligenceModel.findOne().sort({ updatedAt: -1 }).lean()) as unknown as RiskRecord | null;
}

export async function getHistory(): Promise<RiskRecord[]> {
  return (await IntelligenceModel.find().sort({ updatedAt: -1 }).lean()) as unknown as RiskRecord[];
}

export async function findByCorridor(corridor: string): Promise<RiskRecord[]> {
  return (await IntelligenceModel.find({ corridor }).sort({ updatedAt: -1 }).lean()) as unknown as RiskRecord[];
}

export async function findByCountry(country: string): Promise<RiskRecord[]> {
  return (await IntelligenceModel.find({ country }).sort({ updatedAt: -1 }).lean()) as unknown as RiskRecord[];
}

export async function findById(id: string): Promise<RiskRecord | null> {
  return (await IntelligenceModel.findOne({ sourceUrl: id }).lean()) as unknown as RiskRecord | null;
}

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
