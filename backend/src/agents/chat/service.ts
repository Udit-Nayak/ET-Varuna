import { queryVectorKnowledge } from "../gria/service";
import { runDsmSimulation } from "../dsm/service";
import { runSroaOptimization } from "../sroa/service";
import { runApoRecommendation } from "../apo/service";
import { DsmSimulationOutput } from "../dsm/types";
import { SroaOutput, SroaPolicy } from "../sroa/types";
import { ApoOutput } from "../apo/types";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface NormalizedQuestion {
  normalizedQuery: string;
  userIntent: "corridor_risk" | "scenario_analysis" | "reserve_planning" | "procurement" | "general";
  corridor: string;
  keywords: string[];
  scenarioText: string;
  tensionPct: number;
  durationDays: number;
  policy: SroaPolicy;
}

export interface AgentChatAnswer {
  normalized: NormalizedQuestion;
  gria: {
    query: string;
    matches: unknown[];
    summary: string;
  };
  dsm: DsmSimulationOutput;
  sroa: SroaOutput;
  apo: ApoOutput;
  final: string;
  generatedAt: string;
  usedGemini: boolean;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const corridorAliases: Array<{ pattern: RegExp; label: string; keywords: string[] }> = [
  { pattern: /\b(hormuz|ormuz|hormj|strait\s+of\s+hormuz|stait\s+of\s+hormuz)\b/i, label: "Strait of Hormuz", keywords: ["hormuz", "persian gulf", "oil tanker", "blockade"] },
  { pattern: /\b(red\s*sea|bab[\s-]?el[\s-]?mandeb|mandeb|houthi|suez)\b/i, label: "Bab-el-Mandeb / Red Sea", keywords: ["red sea", "bab el mandeb", "suez", "shipping attack"] },
  { pattern: /\b(malacca|singapore strait)\b/i, label: "Strait of Malacca", keywords: ["malacca", "singapore", "shipping chokepoint"] },
  { pattern: /\b(persian gulf|arabian gulf|fujairah|ras tanura)\b/i, label: "Persian Gulf", keywords: ["persian gulf", "uae", "saudi", "tanker"] },
  { pattern: /\b(india|indian crude|bharat)\b/i, label: "India crude import network", keywords: ["india", "crude oil", "import dependency"] },
];

const typoNormalize = (value: string): string =>
  value
    .replace(/\bstait\b/gi, "strait")
    .replace(/\bhormuz\b/gi, "Hormuz")
    .replace(/\btentions\b/gi, "tensions")
    .replace(/\brpocess\b/gi, "process")
    .replace(/\brecongnizes\b/gi, "recognizes")
    .replace(/\s+/g, " ")
    .trim();

const inferCorridor = (query: string) => {
  const match = corridorAliases.find((item) => item.pattern.test(query));
  return match ?? { label: "general maritime corridor", keywords: ["oil", "shipping", "sanctions", "conflict", "india"] };
};

const inferIntent = (query: string): NormalizedQuestion["userIntent"] => {
  if (/\breserve|spr|drawdown|stock\b/i.test(query)) return "reserve_planning";
  if (/\bprocure|alternate|supplier|reroute|route\b/i.test(query)) return "procurement";
  if (/\bscenario|what if|simulate|impact|closure|blockade|attack\b/i.test(query)) return "scenario_analysis";
  if (/\brisk|news|latest|intelligence|threat\b/i.test(query)) return "corridor_risk";
  return "general";
};

const policyFromTension = (tensionPct: number): SroaPolicy => {
  if (tensionPct >= 75) return "aggressive";
  if (tensionPct <= 35) return "conservative";
  return "balanced";
};

const fallbackNormalize = (question: string): NormalizedQuestion => {
  const normalizedQuery = typoNormalize(question);
  const corridor = inferCorridor(normalizedQuery);
  const highRisk = /\bclose|closure|blockade|attack|war|missile|shutdown|critical\b/i.test(normalizedQuery);
  const mediumRisk = /\brisk|delay|tension|disrupt|sanction|reroute\b/i.test(normalizedQuery);
  const tensionPct = highRisk ? 78 : mediumRisk ? 58 : 42;
  const durationDays = highRisk ? 21 : mediumRisk ? 14 : 7;
  const keywords = Array.from(new Set([...corridor.keywords, ...normalizedQuery.toLowerCase().split(/\W+/).filter((word) => word.length > 3).slice(0, 8)]));

  return {
    normalizedQuery,
    userIntent: inferIntent(normalizedQuery),
    corridor: corridor.label,
    keywords,
    scenarioText: `Operator question: ${normalizedQuery}. Analyze ${corridor.label} for geopolitical risk, oil supply disruption, India import exposure, reserve response, and procurement alternatives.`,
    tensionPct,
    durationDays,
    policy: policyFromTension(tensionPct),
  };
};

const extractGeminiText = (payload: any): string =>
  String(payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("") ?? "").trim();

const parseJsonObject = <T>(text: string): T | null => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
};

const callGemini = async (prompt: string, systemInstruction: string): Promise<string | null> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 1400,
        },
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      console.warn("Gemini request failed:", payload);
      return null;
    }
    return extractGeminiText(payload);
  } catch (error) {
    console.warn("Gemini request skipped:", error);
    return null;
  }
};

const normalizeWithGemini = async (question: string): Promise<{ normalized: NormalizedQuestion; usedGemini: boolean }> => {
  const fallback = fallbackNormalize(question);
  const text = await callGemini(
    `User question:\n${question}\n\nReturn only JSON.`,
    [
      "You convert messy operator questions into inputs for an energy supply-chain risk system.",
      "Correct spelling mistakes and infer the intended corridor or topic.",
      "Return JSON with keys: normalizedQuery, userIntent, corridor, keywords, scenarioText, tensionPct, durationDays, policy.",
      "userIntent must be one of corridor_risk, scenario_analysis, reserve_planning, procurement, general.",
      "policy must be conservative, balanced, or aggressive.",
      "tensionPct is 0-100 and durationDays is 1-90.",
    ].join(" ")
  );

  const parsed = text ? parseJsonObject<Partial<NormalizedQuestion>>(text) : null;
  if (!parsed) return { normalized: fallback, usedGemini: false };

  const tensionPct = clamp(Number(parsed.tensionPct ?? fallback.tensionPct), 0, 100);
  const policy = parsed.policy === "conservative" || parsed.policy === "balanced" || parsed.policy === "aggressive" ? parsed.policy : policyFromTension(tensionPct);

  return {
    usedGemini: true,
    normalized: {
      normalizedQuery: String(parsed.normalizedQuery ?? fallback.normalizedQuery),
      userIntent:
        parsed.userIntent === "corridor_risk" ||
        parsed.userIntent === "scenario_analysis" ||
        parsed.userIntent === "reserve_planning" ||
        parsed.userIntent === "procurement" ||
        parsed.userIntent === "general"
          ? parsed.userIntent
          : fallback.userIntent,
      corridor: String(parsed.corridor ?? fallback.corridor),
      keywords: Array.isArray(parsed.keywords) && parsed.keywords.length > 0 ? parsed.keywords.map(String) : fallback.keywords,
      scenarioText: String(parsed.scenarioText ?? fallback.scenarioText),
      tensionPct,
      durationDays: clamp(Math.round(Number(parsed.durationDays ?? fallback.durationDays)), 1, 90),
      policy,
    },
  };
};

const summarizeGria = (matches: unknown[], normalized: NormalizedQuestion): string => {
  if (matches.length === 0) {
    return `GRIA found no stored vector matches for "${normalized.normalizedQuery}", so downstream agents used the normalized scenario and corridor heuristics instead of stopping.`;
  }
  return `GRIA retrieved ${matches.length} stored intelligence match${matches.length === 1 ? "" : "es"} for ${normalized.corridor}.`;
};

const summarizeApo = (apo: ApoOutput): string => {
  const top = apo.ranked_options[0];
  if (!top) return "APO found no feasible procurement alternative for the residual supply gap.";
  return "APO recommends " + top.supplier_name + " via " + top.via + ", covering " + Math.round(top.volume_offered).toLocaleString("en-US") + " barrels at USD " + top.landed_cost_per_barrel.toFixed(2) + "/bbl with " + top.transit_days + "d transit and route risk " + top.route_risk_score.toFixed(0) + "/100.";
};

const fallbackFinal = (normalized: NormalizedQuestion, griaSummary: string, dsm: DsmSimulationOutput, sroa: SroaOutput, apo: ApoOutput): string =>
  [
    `Answer for: ${normalized.normalizedQuery}`,
    "",
    `GRIA: ${griaSummary}`,
    `DSM: ${dsm.capacity_loss_pct}% capacity loss for ${dsm.duration_days} days on ${dsm.corridor}. ${dsm.summary}`,
    `SROA: ${sroa.policy} reserve policy releases ${Math.round(sroa.total_released_volume).toLocaleString("en-US")} barrels and leaves ${sroa.reserve_after_plan_days.toFixed(2)} reserve days. ${sroa.safety_threshold_breached ? "Safety threshold is under stress." : "Safety threshold remains protected."}`,
    summarizeApo(apo),
  ].join("\n");

const synthesizeFinal = async (
  question: string,
  normalized: NormalizedQuestion,
  griaSummary: string,
  dsm: DsmSimulationOutput,
  sroa: SroaOutput,
  apo: ApoOutput
): Promise<string | null> =>
  callGemini(
    JSON.stringify(
      {
        originalQuestion: question,
        normalized,
        griaSummary,
        dsm: {
          corridor: dsm.corridor,
          capacity_loss_pct: dsm.capacity_loss_pct,
          duration_days: dsm.duration_days,
          summary: dsm.summary,
          based_on_events: dsm.based_on_events,
        },
        sroa: {
          policy: sroa.policy,
          total_released_volume: sroa.total_released_volume,
          reserve_after_plan_days: sroa.reserve_after_plan_days,
          safety_threshold_breached: sroa.safety_threshold_breached,
          summary: sroa.summary,
        },
        apo,
      },
      null,
      2
    ),
    [
      "You are Aegis SCR's operator-facing analyst.",
      "Answer the user's question like a competent chat assistant, but ground the response in GRIA, DSM, SROA, and APO outputs.",
      "Be structured, concise, and actionable.",
      "Use headings: Direct answer, Agent outputs, Recommended next steps.",
      "Mention uncertainty when GRIA has sparse stored matches.",
    ].join(" ")
  );

export const answerAgentChat = async (question: string): Promise<AgentChatAnswer> => {
  const { normalized, usedGemini } = await normalizeWithGemini(question);
  const vectorQuery = `${normalized.normalizedQuery} ${normalized.corridor} ${normalized.keywords.join(" ")}`;
  const griaMatches = (await queryVectorKnowledge({ query: vectorQuery, limit: 6 }).catch(() => [])) as unknown[];
  const griaSummary = summarizeGria(griaMatches, normalized);

  const dsm = await runDsmSimulation({
    corridor: normalized.corridor,
    scenario_text: normalized.scenarioText,
    vector_query: vectorQuery,
    keywords: normalized.keywords,
    capacity_loss_pct: normalized.tensionPct,
    duration_days: normalized.durationDays,
  });
  const sroa = await runSroaOptimization({
    corridor: normalized.corridor,
    policy: normalized.policy,
    dsm_output: dsm,
    scenario_text: normalized.scenarioText,
  });
  const apo = await runApoRecommendation({
    corridor: normalized.corridor,
    sroa_output: sroa,
    dsm_output: dsm,
    max_options: 3,
  });
  const final =
    (await synthesizeFinal(question, normalized, griaSummary, dsm, sroa, apo)) ??
    fallbackFinal(normalized, griaSummary, dsm, sroa, apo);

  return {
    normalized,
    gria: {
      query: vectorQuery,
      matches: griaMatches,
      summary: griaSummary,
    },
    dsm,
    sroa,
    apo,
    final,
    generatedAt: new Date().toISOString(),
    usedGemini,
  };
};
