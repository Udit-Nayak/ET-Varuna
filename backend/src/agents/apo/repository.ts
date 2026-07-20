import mongoose from "mongoose";
import { getLivePriceSnapshot } from "../shared/livePriceRepository";
import { seededApoPrices, seededApoSuppliers } from "./mockData";
import { ApoCandidateScore, ApoLivePrice, ApoOutput, ApoSupplier, ApoSupportingEvent } from "./types";

const SUPPLIERS_COLLECTION = "apoSuppliers";
const LIVE_PRICES_COLLECTION = "apoLivePrices";
const RUN_LOG_COLLECTION = "apoRankingRuns";
const VECTOR_COLLECTION = "griaVectorDocuments";

const mongoConnected = (): boolean => mongoose.connection.readyState === 1 && Boolean(mongoose.connection.db);

const normalizeText = (value: string): string => value.replace(/\s+/g, " ").trim();

const createEmbedding = (text: string, dimensions = 384): number[] => {
  const tokens = normalizeText(text.toLowerCase()).split(/\W+/).filter(Boolean);
  const vector = new Array<number>(dimensions).fill(0);
  for (const token of tokens) {
    let hash = 0;
    for (let index = 0; index < token.length; index += 1) {
      hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
    }
    vector[hash % dimensions] += 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
};

const dotProduct = (left: number[] = [], right: number[] = []): number =>
  left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);

const asStringArray = (value: unknown): string[] => Array.isArray(value) ? value.map(String).filter(Boolean) : [];

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const documentText = (document: Record<string, unknown>): string =>
  [
    document.headline,
    document.summary,
    document.content,
    document.eventType,
    document.oilPetroleumImpact,
    document.shippingMaritimeImpact,
    document.financeEconomicImpact,
    ...asStringArray(document.keywords),
    ...asStringArray(document.tradeCorridorsAffected),
    ...asStringArray(document.countriesInvolved),
  ]
    .map((value) => String(value ?? ""))
    .join(" ")
    .toLowerCase();

const riskFromDocument = (document: Record<string, unknown>): number => {
  const explicit = asNumber(document.riskScore ?? document.score, NaN);
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(0, Math.min(100, explicit));
  const severity = String(document.severity ?? "medium").toLowerCase();
  const base = severity === "critical" ? 92 : severity === "high" ? 74 : severity === "medium" ? 48 : 24;
  const confidenceBoost = Math.min(10, Math.max(0, asNumber(document.confidence, 0) * 10));
  return Math.max(5, Math.min(100, base + confidenceBoost));
};

const toSupportingEvent = (document: Record<string, unknown>): ApoSupportingEvent => ({
  id: String(document._id ?? document.id ?? document.sourceArticleId ?? document.headline ?? "unknown"),
  headline: String(document.headline ?? "Untitled GRIA event"),
  summary: document.summary || document.content ? String(document.summary ?? document.content) : undefined,
  severity: document.severity ? String(document.severity) : undefined,
  riskScore: riskFromDocument(document),
  publishedAt: document.publishedAt || document.createdAt || document.updatedAt ? String(document.publishedAt ?? document.createdAt ?? document.updatedAt) : undefined,
});

export const getApoSuppliers = async (): Promise<ApoSupplier[]> => {
  if (!mongoConnected()) return seededApoSuppliers;
  const docs = await mongoose.connection.db!.collection(SUPPLIERS_COLLECTION).find({}).toArray();
  return docs.length > 0 ? (docs as unknown as ApoSupplier[]) : seededApoSuppliers;
};

export const getApoLivePrice = async (grade: string, region: string): Promise<ApoLivePrice> => {
  if (mongoConnected()) {
    const priceDoc = await mongoose.connection.db!
      .collection(LIVE_PRICES_COLLECTION)
      .findOne({ grade, region }, { sort: { timestamp: -1 } });
    if (priceDoc) return priceDoc as unknown as ApoLivePrice;
  }

  const seeded = seededApoPrices.find((price) => price.grade === grade && price.region === region);
  if (seeded) return seeded;

  const benchmark = await getLivePriceSnapshot().catch(() => null);
  return {
    grade,
    region,
    price_per_barrel: benchmark?.current_price_usd_per_barrel ?? 82,
    timestamp: benchmark?.fetched_at ? new Date(benchmark.fetched_at).toISOString() : new Date().toISOString(),
    source: benchmark?.source ?? "benchmark fallback",
  };
};

export const getRouteRiskEvents = async (query: string, limit = 5): Promise<ApoSupportingEvent[]> => {
  if (!mongoConnected()) return [];
  const collection = mongoose.connection.db!.collection(VECTOR_COLLECTION);
  const queryEmbedding = createEmbedding(query);
  const queryParts = query.toLowerCase().split(/\W+/).filter((part) => part.length > 2);

  try {
    const vectorMatches = await collection
      .aggregate([
        {
          $vectorSearch: {
            index: "griaVectorIndex",
            path: "embedding",
            queryVector: queryEmbedding,
            numCandidates: Math.max(100, limit * 20),
            limit,
          },
        },
        {
          $project: {
            id: 1,
            sourceArticleId: 1,
            headline: 1,
            content: 1,
            summary: 1,
            countriesInvolved: 1,
            tradeCorridorsAffected: 1,
            oilPetroleumImpact: 1,
            financeEconomicImpact: 1,
            shippingMaritimeImpact: 1,
            eventType: 1,
            severity: 1,
            confidence: 1,
            keywords: 1,
            createdAt: 1,
            updatedAt: 1,
            vectorScore: { $meta: "vectorSearchScore" },
          },
        },
      ])
      .toArray();

    if (vectorMatches.length > 0) {
      return vectorMatches.map((document) => toSupportingEvent(document as Record<string, unknown>));
    }
  } catch {
    // Local/dev databases may not have Atlas vector indexes. Manual scoring keeps APO usable.
  }

  const candidates = await collection.find({}).limit(250).toArray();
  return candidates
    .map((document) => {
      const record = document as Record<string, unknown>;
      const text = documentText(record);
      const lexicalScore = queryParts.reduce((sum, part) => sum + (text.includes(part) ? 1 : 0), 0);
      const vectorScore = Array.isArray(record.embedding) ? dotProduct(record.embedding as number[], queryEmbedding) : 0;
      return { document: record, score: lexicalScore + vectorScore };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((match) => toSupportingEvent(match.document));
};

export const logApoRun = async (input: unknown, candidates: ApoCandidateScore[], output: ApoOutput): Promise<void> => {
  if (!mongoConnected()) return;
  await mongoose.connection.db!.collection(RUN_LOG_COLLECTION).insertOne({
    input,
    candidate_scores: candidates,
    output,
    createdAt: new Date().toISOString(),
  });
};
