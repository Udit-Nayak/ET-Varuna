import mongoose from "mongoose";
import { IntelligenceModel } from "../../models";
import { aggregateDsmContext, simulateDsm } from "./engine";
import { getMockDsmEvents } from "./mockData";
import { explainDsmOutput, formatDsmInput } from "./llm";
import { DsmRetrievedContext, DsmRetrievedEvent, DsmSeverity, DsmSimulationInput, DsmSimulationOutput } from "./types";

const VECTOR_COLLECTION = "griaVectorDocuments";
const mongoConnected = (): boolean => mongoose.connection.readyState === 1;

const normalizeCorridor = (value: string): string => value.trim().toLowerCase();
const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const severityScore: Record<DsmSeverity, number> = {
  low: 22,
  medium: 45,
  high: 72,
  critical: 92,
};

const normalizeSeverity = (value: unknown): DsmSeverity => {
  const normalized = String(value ?? "medium").toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "critical") {
    return normalized;
  }
  return "medium";
};

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

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item)).filter(Boolean);
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

const keywordScore = (document: Record<string, unknown>, queryParts: string[]): number => {
  const text = documentText(document);
  return queryParts.reduce((score, rawPart) => {
    const part = rawPart.trim().toLowerCase();
    if (!part) {
      return score;
    }
    if (text.includes(part)) {
      return score + 2;
    }
    const tokenHits = part.split(/\W+/).filter(Boolean).filter((token) => text.includes(token)).length;
    return score + tokenHits * 0.35;
  }, 0);
};

const deriveRiskScore = (document: Record<string, unknown>): number => {
  const explicitRisk = Number(document.riskScore ?? document.score);
  if (Number.isFinite(explicitRisk) && explicitRisk > 0) {
    return Math.min(100, Math.max(0, explicitRisk));
  }
  const severity = normalizeSeverity(document.severity);
  const confidence = Number(document.confidence ?? 0);
  const impactText = `${document.oilPetroleumImpact ?? ""} ${document.shippingMaritimeImpact ?? ""} ${document.financeEconomicImpact ?? ""}`.toLowerCase();
  const impactBoost = /high|severe|block|disrupt|shortage|delay|risk/.test(impactText) ? 12 : 0;
  return Math.min(100, Math.max(5, severityScore[severity] + confidence * 10 + impactBoost));
};

const toDsmEvent = (document: Record<string, unknown>): DsmRetrievedEvent => ({
  id: String(document._id ?? document.sourceUrl ?? document.sourceArticleId ?? document.id ?? document.headline ?? ""),
  headline: String(document.headline ?? "Untitled GRIA event"),
  riskScore: deriveRiskScore(document),
  severity: normalizeSeverity(document.severity),
  publishedAt: new Date(
    String(document.publishedAt ?? document.fetchedAt ?? document.createdAt ?? document.updatedAt ?? new Date().toISOString())
  ).toISOString(),
  eventType: String(document.eventType || "keyword_vector_match"),
  summary: String(document.summary ?? document.reasoning ?? document.content ?? ""),
  confidence: Number(document.confidence ?? 0.35),
});

const queryTextFromInput = (input: DsmSimulationInput): string => {
  const parts = [
    input.vector_query,
    input.scenario_text,
    input.corridor,
    ...(input.keywords ?? []),
  ].filter(Boolean);
  return normalizeText(parts.join(" "));
};

const queryPartsFromInput = (input: DsmSimulationInput): string[] => {
  const priorityParts = input.keywords && input.keywords.length > 0 ? [...input.keywords, input.vector_query] : [input.vector_query, input.scenario_text, input.corridor];
  return priorityParts
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => [value, ...value.split(",")])
    .map((value) => value.trim())
    .filter(Boolean);
};

const vectorCollection = () => IntelligenceModel.db.collection(VECTOR_COLLECTION);

const retrieveVectorEvents = async (input: DsmSimulationInput, limit: number): Promise<DsmRetrievedEvent[]> => {
  if (!mongoConnected()) {
    return [];
  }
  const collection = vectorCollection();
  const queryText = queryTextFromInput(input);
  const queryParts = queryPartsFromInput(input);

  if (input.source_article_id || input.event_id) {
    const directId = input.source_article_id ?? input.event_id;
    const directMatches = await collection
      .find({
        $or: [{ id: directId }, { sourceArticleId: directId }],
      })
      .limit(limit)
      .toArray();
    if (directMatches.length > 0) {
      return directMatches.map((document) => toDsmEvent(document as Record<string, unknown>));
    }
  }

  if (!queryText) {
    return [];
  }

  const queryEmbedding = createEmbedding(queryText);

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
      const rerankedMatches = vectorMatches
        .map((document) => {
          const record = document as Record<string, unknown>;
          const lexicalScore = keywordScore(record, queryParts);
          const vectorScore = Number(record.vectorScore ?? 0);
          return { document: record, score: vectorScore + lexicalScore, lexicalScore };
        })
        .filter((match) => queryParts.length === 0 || match.lexicalScore > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);

      if (rerankedMatches.length > 0) {
        return rerankedMatches.map((match) => toDsmEvent(match.document));
      }
    }
  } catch {
    // Atlas vector indexes are optional in local/dev databases. Manual scoring keeps DSM testable.
  }

  const regexParts = queryParts.map((part) => new RegExp(escapeRegex(part), "i"));
  const candidates = await collection
    .find(
      regexParts.length > 0
        ? {
            $or: [
              { headline: { $in: regexParts } },
              { summary: { $in: regexParts } },
              { content: { $in: regexParts } },
              { keywords: { $in: regexParts } },
              { tradeCorridorsAffected: { $in: regexParts } },
            ],
          }
        : {}
    )
    .limit(150)
    .toArray();

  return candidates
    .map((document) => {
      const record = document as Record<string, unknown>;
      const vectorScore = Array.isArray(record.embedding) ? dotProduct(record.embedding as number[], queryEmbedding) : 0;
      const lexicalScore = keywordScore(record, queryParts);
      return { document: record, score: vectorScore + lexicalScore };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((match) => toDsmEvent(match.document));
};

const retrieveIntelligenceEvents = async (corridor: string, limit: number): Promise<DsmRetrievedEvent[]> => {
  if (!mongoConnected()) {
    return [];
  }
  const normalized = normalizeCorridor(corridor);
  const corridorRegex = new RegExp(escapeRegex(normalized), "i");
  const recentCutoff = new Date(Date.now() - 45 * 86_400_000);

  const documents = await IntelligenceModel.find({
    $or: [{ corridor: corridorRegex }, { affectedCorridors: corridorRegex }],
    publishedAt: { $gte: recentCutoff },
  })
    .sort({ riskScore: -1, publishedAt: -1 })
    .limit(limit)
    .lean();

  return documents.map((document) => toDsmEvent(document as Record<string, unknown>));
};

export const retrieveDsmContext = async (
  inputOrCorridor: DsmSimulationInput | string,
  suppliedEvents: DsmRetrievedEvent[] = [],
  limit = 6
): Promise<DsmRetrievedContext> => {
  const input: DsmSimulationInput =
    typeof inputOrCorridor === "string" ? { corridor: inputOrCorridor, retrieved_events: suppliedEvents } : inputOrCorridor;

  if (input.retrieved_events && input.retrieved_events.length > 0) {
    return aggregateDsmContext(input.corridor, input.retrieved_events.slice(0, limit));
  }

  try {
    const vectorEvents = await retrieveVectorEvents(input, limit);
    if (vectorEvents.length > 0) {
      return aggregateDsmContext(input.corridor, vectorEvents);
    }

    const intelligenceEvents = await retrieveIntelligenceEvents(input.corridor, limit);
    return aggregateDsmContext(input.corridor, intelligenceEvents.length > 0 ? intelligenceEvents : getMockDsmEvents(input.corridor));
  } catch {
    return aggregateDsmContext(input.corridor, getMockDsmEvents(input.corridor));
  }
};

export const runDsmSimulation = async (input: DsmSimulationInput): Promise<DsmSimulationOutput> => {
  const formatted = await formatDsmInput(input);
  const context = await retrieveDsmContext(formatted.input);
  const deterministicOutput = simulateDsm(formatted.input, context);
  const explained = await explainDsmOutput(formatted.input, context, deterministicOutput);

  return {
    ...deterministicOutput,
    summary: explained.summary,
    input_formatting: formatted.formatting,
    sanity_check: explained.sanity_check,
  };
};

export const getDsmMock = async (corridor = "Red Sea"): Promise<DsmSimulationOutput> => {
  const context = aggregateDsmContext(corridor, getMockDsmEvents(corridor));
  return simulateDsm({ corridor, scenario_id: `${normalizeCorridor(corridor).replace(/[^a-z0-9]+/g, "-")}-mock` }, context);
};
