import mongoose from "mongoose";
import { DsmPredictionModel, IntelligenceModel } from "../../models";
import { getLivePriceSnapshot } from "../shared/livePriceRepository";
import { aggregateDsmContext, simulateDsm } from "./engine";
import { getMockDsmEvents } from "./mockData";
import { buildDsmConfidence, classifyDsmEvent, explainDsmOutput, formatDsmInput, summarizeHistoricalAnalysis } from "./llm";
import {
  DsmEventClassification,
  DsmHistoricalAnalysis,
  DsmPredictionRecord,
  DsmRetrievedContext,
  DsmRetrievedEvent,
  DsmSeverity,
  DsmSimulationInput,
  DsmSimulationOutput,
  DsmWorkflowInput,
  DsmWorkflowResult,
} from "./types";

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

const highImpactPatterns = [
  /\bwar\b/i,
  /\bconflict\b/i,
  /\btariff(s)?\b/i,
  /\bsanction(s)?\b/i,
  /\bpolicy change(s)?\b/i,
  /\bsupply disruption(s)?\b/i,
  /\benergy crisis\b/i,
  /\bblockade\b/i,
  /\bembargo\b/i,
  /\bexport ban\b/i,
  /\bimport ban\b/i,
  /\bport closure\b/i,
  /\battack\b/i,
  /\bmissile\b/i,
  /\bstrike\b/i,
];

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 2): number => Number(value.toFixed(digits));
const isHighImpact = (event: DsmRetrievedEvent): boolean => highImpactPatterns.some((pattern) => pattern.test(`${event.headline} ${event.summary ?? ""} ${event.eventType ?? ""}`));
const inferDirection = (event: DsmRetrievedEvent): "up" | "down" | "mixed" | "flat" => {
  const text = `${event.headline} ${event.summary ?? ""}`.toLowerCase();
  if (/\btariff|\bsanction|\bblockade|\bshutdown|\bstrike|\bshortage|\bdisruption|\battack/.test(text)) return "up";
  if (/\bpeace deal|\brate cut|\bsupply boost|\bsurplus\b/.test(text)) return "down";
  return "mixed";
};
const inferSeverity = (event: DsmRetrievedEvent): DsmSeverity => (event.riskScore >= 85 ? "critical" : event.riskScore >= 70 ? "high" : event.riskScore >= 45 ? "medium" : "low");
const marketLabel = (value: string | undefined): string => (value && value.trim() ? value.trim() : "general market");

const fetchRelevantNewsEvents = async (input: DsmWorkflowInput): Promise<DsmRetrievedEvent[]> => {
  const context = await retrieveDsmContext({
    corridor: input.corridor ?? "general",
    vector_query: input.vector_query,
    keywords: input.keywords,
  });
  return context.retrieved_events.filter(isHighImpact).sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime());
};

const classifyWithFallback = async (input: DsmWorkflowInput, news: DsmRetrievedEvent[]): Promise<DsmEventClassification | null> => {
  const context = {
    corridor: input.corridor ?? "general",
    retrieved_events: news.slice(0, input.limit ?? 6),
    aggregated_risk_score: news.length > 0 ? news.reduce((sum, event) => sum + event.riskScore, 0) / news.length : 0,
    aggregated_severity: news.some((event) => event.severity === "critical" || event.severity === "high") ? "high" : "medium",
    dominant_event_type: news[0]?.eventType ?? "market_news",
  } as DsmRetrievedContext;
  const llmClassification = await classifyDsmEvent(input, context);
  if (llmClassification) return llmClassification;
  const top = news[0];
  if (!top || !isHighImpact(top)) return null;
  return {
    event_type: top.eventType ?? "market_disruption",
    severity: inferSeverity(top),
    affected_market: marketLabel(input.corridor ?? top.eventType),
    expected_impact: top.summary ?? top.headline,
    direction: inferDirection(top),
    confidence: 0.68,
    rationale: "Deterministic fallback classification based on keywords and article severity.",
  };
};

const retrieveHistoricalReactions = async (classification: DsmEventClassification, currentPrice: number, limit = 6): Promise<DsmHistoricalAnalysis> => {
  const docs = await DsmPredictionModel.find({
      $or: [
        { "event_details.event_type": new RegExp(classification.event_type, "i") },
        { "event_details.affected_market": new RegExp(classification.affected_market, "i") },
        { market_impact_explanation: new RegExp(classification.event_type, "i") },
      ],
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  const records = docs as Array<Record<string, unknown>>;
  const matched_events = records.map((doc) => {
    const predicted = Array.isArray(doc.predicted_prices) ? (doc.predicted_prices as Array<{ horizon_days?: number; predicted_price?: number }>) : [];
    const eventType = String(doc.event_details && typeof doc.event_details === "object" ? (doc.event_details as Record<string, unknown>).event_type ?? classification.event_type : classification.event_type);
    const affectedMarket = String(doc.event_details && typeof doc.event_details === "object" ? (doc.event_details as Record<string, unknown>).affected_market ?? classification.affected_market : classification.affected_market);
    const current = Number(doc.current_price ?? 0);
    const sevenDay = predicted.find((point) => point.horizon_days === 7)?.predicted_price ?? current;
    const changePct = current > 0 ? round(((sevenDay - current) / current) * 100, 2) : 0;
    const severity = inferSeverity({
      headline: eventType,
      riskScore: Number(doc.confidence_score ?? 0.5) * 100,
      severity: "medium",
      publishedAt: String(doc.createdAt ?? new Date().toISOString()),
      eventType,
    });
    return {
      event_id: String(doc.event_id ?? doc._id ?? ""),
      headline: String(doc.event_details && typeof doc.event_details === "object" ? (doc.event_details as Record<string, unknown>).expected_impact ?? "Historical event" : "Historical event"),
      publishedAt: String(doc.createdAt ?? new Date().toISOString()),
      event_type: eventType,
      severity,
      affected_market: affectedMarket,
      historical_price_change_pct: changePct || round((Number(doc.confidence_score ?? 0.5) - 0.5) * 20, 2),
      notes: String(doc.recommendation ?? "Past DSM record"),
    };
  });
  const average = matched_events.length > 0 ? round(matched_events.reduce((sum, item) => sum + item.historical_price_change_pct, 0) / matched_events.length, 2) : 0;
  return {
    matched_events,
    average_historical_price_change_pct: average,
    sample_size: matched_events.length,
    market_condition_note:
      matched_events.length > 0
        ? `Matched ${matched_events.length} previous DSM records for similar market stress patterns.`
        : "No stored historical DSM reactions found; using current market heuristics.",
  };
};

const predictPrices = (
  currentPrice: number,
  classification: DsmEventClassification,
  historical: DsmHistoricalAnalysis
): Array<{ horizon_days: 1 | 7 | 30; predicted_price: number; predicted_change_pct: number; explanation: string }> => {
  const severityWeight: Record<DsmSeverity, number> = { low: 0.6, medium: 1, high: 1.5, critical: 2.1 };
  const directionSign = classification.direction === "down" ? -1 : classification.direction === "up" ? 1 : 0.6;
  const historicalPressure = clamp((historical.average_historical_price_change_pct ?? 0) / 100, -0.18, 0.18);
  const baseShock = directionSign * severityWeight[classification.severity] * 0.8 + historicalPressure;
  return [1, 7, 30].map((horizon) => {
    const decay = horizon === 1 ? 1 : horizon === 7 ? 1.35 : 1.8;
    const predicted_change_pct = round(clamp(baseShock * decay * 100, -35, 35), 2) as number;
    return {
      horizon_days: horizon as 1 | 7 | 30,
      predicted_price: round(Math.max(0, currentPrice * (1 + predicted_change_pct / 100)), 2),
      predicted_change_pct,
      explanation: `Deterministic forecast from current price, severity, and historical reaction (${historical.average_historical_price_change_pct}% avg prior move).`,
    };
  });
};

const warningFromEvent = (classification: DsmEventClassification, predicted: Array<{ predicted_change_pct: number }>): "low" | "medium" | "high" | "critical" => {
  const maxMove = Math.max(...predicted.map((point) => Math.abs(point.predicted_change_pct)), 0);
  if (classification.severity === "critical" || maxMove >= 20) return "critical";
  if (classification.severity === "high" || maxMove >= 10) return "high";
  if (classification.severity === "medium" || maxMove >= 4) return "medium";
  return "low";
};

const recommendationFromEvent = (warning: "low" | "medium" | "high" | "critical", direction: DsmEventClassification["direction"]): string => {
  if (warning === "critical") return "Reduce exposure immediately and hedge the affected market.";
  if (warning === "high") return direction === "up" ? "Hedge upside risk and delay discretionary buys." : "Review downside exposure and liquidity buffers.";
  if (warning === "medium") return "Monitor the event and keep position sizing conservative.";
  return "No action required beyond routine monitoring.";
};

const marketImpactExplanation = (
  classification: DsmEventClassification,
  historical: DsmHistoricalAnalysis,
  currentPrice: number,
  predicted: Array<{ horizon_days: number; predicted_price: number; predicted_change_pct: number }>
): string =>
  [
    `${classification.event_type} is affecting ${classification.affected_market}.`,
    `Current price is ${currentPrice}.`,
    `Historical comparable moves averaged ${historical.average_historical_price_change_pct}% across ${historical.sample_size} prior events.`,
    `Predicted 1d/7d/30d moves are ${predicted.map((point) => `${point.predicted_change_pct}%`).join(", ")}.`,
    classification.expected_impact,
  ].join(" ");

export async function runDsmWorkflow(input: DsmWorkflowInput): Promise<DsmWorkflowResult> {
  const candidates = await fetchRelevantNewsEvents(input);
  const classification = await classifyWithFallback(input, candidates);
  if (!classification || candidates.length === 0) {
    return {
      triggered: false,
      notes: ["No significant market-impacting event detected."],
      news_references: candidates,
    };
  }

  const snapshot = await getLivePriceSnapshot();
  const currentPrice = Number(snapshot?.current_price_usd_per_barrel ?? 0);
  if (!currentPrice) {
    return {
      triggered: true,
      event: classification,
      notes: ["Live price snapshot is missing; prediction skipped."],
      news_references: candidates,
    };
  }

  const historical = await retrieveHistoricalReactions(classification, currentPrice);
  const predictedPrices = predictPrices(currentPrice, classification, historical);
  const warning_level = warningFromEvent(classification, predictedPrices);
  const recommendation = recommendationFromEvent(warning_level, classification.direction);
  const confidence_score = round(clamp((classification.confidence + historical.sample_size * 0.03 + (warning_level === "critical" ? 0.1 : 0)) / 1.2, 0, 0.99), 2);
  const record: DsmPredictionRecord = {
    event_id: candidates[0].id ?? `${Date.now()}`,
    event_details: classification,
    news_references: candidates,
    current_price: currentPrice,
    historical_analysis: historical,
    predicted_prices: predictedPrices,
    confidence_score,
    warning_level,
    recommendation,
    market_impact_explanation: marketImpactExplanation(classification, historical, currentPrice, predictedPrices),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "dsm",
    metadata: {
      livePriceSnapshot: snapshot,
      vector_query: input.vector_query ?? null,
      keywords: input.keywords ?? [],
    },
  };

  await DsmPredictionModel.create(record);

  return {
    triggered: true,
    event: classification,
    live_price: {
      current_price_usd_per_barrel: currentPrice,
      fetched_at: snapshot?.fetched_at?.toISOString?.() ?? new Date().toISOString(),
    },
    historical_analysis: historical,
    predicted_prices: predictedPrices,
    warning_level,
    recommendation,
    market_impact_explanation: (await summarizeHistoricalAnalysis(classification, historical)) ?? record.market_impact_explanation,
    confidence_score: buildDsmConfidence(record),
    stored: record,
    news_references: candidates,
    notes: ["DSM ran only because a major market event was detected."],
  };
}
